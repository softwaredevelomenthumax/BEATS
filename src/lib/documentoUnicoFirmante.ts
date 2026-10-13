import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";
import { eliminarBorradorDocumento, eliminarDocumentoAdmin, anularDocumentoRpc } from "@/lib/documentosRpc";
import { registrarAuditoria } from "@/lib/auditoria";
import type { TipoDoc } from "@/lib/enums";
import type { Usuario } from "@/types";

/**
 * FMV Checklist y Notificación de Pago a HCPs comparten el mismo patrón de
 * "documento de un solo firmante": no tienen tabla de cadena de aprobación
 * (`*_aprobaciones`) — pasan directo de `Borrador` a `Completado` cuando la
 * misma persona que lo diligencia lo firma, con los mismos campos de firma
 * (`medical_name`/`medical_role`/`fecha_firma`/`firma_electronica`) y de
 * anulación (`motivo_anulacion`/`anulado_por_id`/`anulado_en`) que el resto
 * de documentos. Este módulo centraliza esa lógica para no duplicarla entre
 * `fmv.ts` y `notificacionPago.ts`.
 */

export interface DatosFirma {
  medicalName: string;
  medicalRole: string;
}

export async function firmarYCompletarDocumentoUnicoFirmante(params: {
  tabla: string;
  tipoDoc: TipoDoc;
  documentoId: string;
  documentoNombre: string;
  datosFirma: DatosFirma;
  usuario: Usuario;
}): Promise<void> {
  const { data, error } = await supabase
    .from(params.tabla)
    .update({
      estado: "Completado",
      medical_name: params.datosFirma.medicalName,
      medical_role: params.datosFirma.medicalRole,
      fecha_firma: new Date().toISOString().slice(0, 10),
      firma_electronica: true,
      // Corrección (octubre 2026), pedido explícito del usuario: "Firma
      // electrónica: Sí" no decía quién firmó — solo que el documento
      // quedó Completado. Se guarda la persona real (puede ser un
      // Administrador firmando en nombre del creador, no necesariamente
      // `creadoPorId`) para poder mostrar su firma manuscrita real en vez
      // de un simple "Sí/No" (ver `CuerpoFMV`/`CuerpoNotificacionPago` en
      // `DocumentoImprimible.tsx`).
      firmado_por_id: params.usuario.id,
    })
    .eq("id", params.documentoId)
    .select("id");
  if (error) throw new Error(mensajeErrorAmigable(error));
  // Misma protección que en `anularDocumentoUnicoFirmante` más abajo —
  // `.select("id")` para detectar un `update` que RLS filtró en
  // silencio (0 filas, sin error) y avisar en vez de reportar éxito falso.
  if (!data || data.length === 0) {
    throw new Error(
      "No se pudo firmar: la base de datos no permitió el cambio (probablemente una restricción de permisos). El documento sigue en Borrador.",
    );
  }

  await registrarAuditoria({
    documentoId: params.documentoId,
    tipoDoc: params.tipoDoc,
    documentoNombre: params.documentoNombre,
    actorId: params.usuario.id,
    accion: "completado",
  });
}

export async function anularDocumentoUnicoFirmante(params: {
  tabla: string;
  tipoDoc: TipoDoc;
  documentoId: string;
  documentoNombre: string;
  motivo: string;
  usuario: Usuario;
}): Promise<void> {
  // Octubre 2026: ver `anularEvento` (src/lib/evento.ts) y
  // `src/lib/documentosRpc.ts` — el `update` directo lo filtraba RLS.
  await anularDocumentoRpc(params.tipoDoc, params.documentoId, params.motivo);

  await registrarAuditoria({
    documentoId: params.documentoId,
    tipoDoc: params.tipoDoc,
    documentoNombre: params.documentoNombre,
    actorId: params.usuario.id,
    accion: "anulacion",
    detalle: params.motivo,
  });
}

/**
 * Corrección (octubre 2026), pedido explícito del usuario: "crea una
 * opción para eliminar cualquiera de los formularios que estén guardados
 * como borrador. Esto no debe dejar rastro en el registro de auditoría.
 * Solo lo puede eliminar el usuario que haga la solicitud." — a propósito
 * NO se llama `registrarAuditoria` acá. `estado = 'Borrador'` y
 * `creado_por_id = usuario.id` van en el propio `.eq()` del `delete`, no
 * solo validados en la UI (defensa en profundidad). FMV y Notificación de
 * Pago no tienen tabla de cadena de aprobación que limpiar primero (ver
 * la nota al inicio de este archivo), así que es un único `delete`.
 */
export async function eliminarBorradorDocumentoUnicoFirmante(params: { tipoDoc: TipoDoc; documentoId: string }): Promise<void> {
  await eliminarBorradorDocumento(params.tipoDoc, params.documentoId);
}

/**
 * Corrección (octubre 2026), pedido explícito del usuario: pantalla
 * admin-only para "ver y eliminar sin rastro, documentos que se hayan
 * creado por error, a pesar de estar firmados" — ver la nota larga en
 * `eliminarDocumentoFirmadoAdmin` (`src/lib/evento.ts`). A diferencia de
 * `eliminarBorradorDocumentoUnicoFirmante`, no restringe por `estado` ni
 * `creado_por_id`; el control de acceso real es el permiso
 * `puedeEliminarDocumentosFirmados`, verificado antes de llegar aquí. A
 * propósito NO se llama `registrarAuditoria`.
 */
export async function eliminarDocumentoFirmadoAdmin(params: { tipoDoc: TipoDoc; documentoId: string }): Promise<void> {
  await eliminarDocumentoAdmin(params.tipoDoc, params.documentoId);
}
