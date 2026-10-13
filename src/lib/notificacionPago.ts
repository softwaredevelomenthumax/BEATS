import { congelarDocumentoUnicoFirmante } from "@/lib/congelamiento";
import { exigirFilasActualizadas } from "@/lib/documentosRpc";
import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";
import { rowToFlat, flatToRow, flatToRowParcial, t, s0, b, j, n0n, type FieldSpec } from "@/lib/dbMapping";
import { registrarAuditoria } from "@/lib/auditoria";
import {
  firmarYCompletarDocumentoUnicoFirmante,
  anularDocumentoUnicoFirmante,
  eliminarBorradorDocumentoUnicoFirmante,
  eliminarDocumentoFirmadoAdmin as eliminarDocumentoFirmadoAdminGenerico,
  type DatosFirma,
} from "@/lib/documentoUnicoFirmante";
import type { NotificacionPagoHcp, Usuario } from "@/types";

const TABLA = "notificaciones_pago_hcp";

/** ¿El error de Postgres es una violación de clave foránea sobre esa columna? */
function violaFkDeColumna(error: { code?: string; message?: string; details?: string } | null, columna: string): boolean {
  if (!error) return false;
  const texto = `${error.message ?? ""} ${error.details ?? ""}`;
  return (error.code === "23503" || /foreign key/i.test(texto)) && texto.includes(columna);
}

const CAMPOS_NOTIFICACION_PAGO: FieldSpec[] = [
  t("id"),
  t("estado"),
  t("creado_por_id", "creadoPorId"),
  t("creado_en", "creadoEn"),
  s0("evento_origen_id", "eventoOrigenId"),
  s0("convenio_origen_id", "convenioOrigenId"),
  s0("speaker_id", "speakerId"),
  t("nombre_profesional_salud", "nombreProfesionalSalud"),
  t("numero_documento_identidad", "numeroDocumentoIdentidad"),
  t("cedula_licencia_profesional", "cedulaLicenciaProfesional"),
  t("productos"),
  s0("factura_id", "facturaId"),
  s0("numero_factura", "numeroFactura"),
  s0("fecha_factura", "fechaFactura"),
  n0n("valor_factura", "valorFactura"),
  s0("moneda_factura", "monedaFactura"),
  b("factura_incluye_pago_hcp", "facturaIncluyePagoHcp"),
  b("factura_incluye_pago_institucion", "facturaIncluyePagoInstitucion"),
  b("factura_es_pago_tercero", "facturaEsPagoTercero"),
  t("medical_name", "medicalName"),
  t("medical_role", "medicalRole"),
  s0("fecha_firma", "fechaFirma"),
  b("firma_electronica", "firmaElectronica"),
  s0("firmado_por_id", "firmadoPorId"),
  s0("motivo_anulacion", "motivoAnulacion"),
  s0("anulado_por_id", "anuladoPorId"),
  s0("anulado_en", "anuladoEn"),
  t("empresa_grupo", "empresaGrupo"),
  j("campos_personalizados", {}, "camposPersonalizados"),
  // Snapshot congelado por trigger al pasar a Completado — ver
  // `db/agregar_inmutabilidad_documentos_firmados.sql`. Solo lectura desde
  // el front-end (lo escribe el trigger, no un `crear*`/`editar*`).
  j("snapshot_formato", null, "snapshotFormato"),
];

function nombreNotificacionPago(doc: Pick<NotificacionPagoHcp, "nombreProfesionalSalud" | "numeroFactura">): string {
  return doc.numeroFactura || `Notificación de Pago — ${doc.nombreProfesionalSalud || "sin HCP"}`;
}

/**
 * Corrección (octubre 2026), pedido explícito del usuario: "ningún
 * formato se puede aprobar o guardar definitivamente si le falta algún
 * campo obligatorio. El sistema debe advertirlo" — mismo hallazgo que en
 * `calcularErroresFmv` (`src/lib/fmv.ts`): no existía ninguna validación
 * completa antes de "Firmar y completar" (su único punto de cierre, no
 * tiene cadena de aprobación).
 */
export function calcularErroresNotificacionPago(datos: Partial<NotificacionPagoHcp>): Record<string, string> {
  const errores: Record<string, string> = {};
  const requerido = (clave: keyof NotificacionPagoHcp, etiqueta: string) => {
    const valor = datos[clave];
    if (!String(valor ?? "").trim()) errores[clave as string] = `${etiqueta} es obligatorio.`;
  };

  requerido("eventoOrigenId", "Evento de origen");
  requerido("empresaGrupo", "Empresa del grupo");
  requerido("speakerId", "Speaker");
  requerido("nombreProfesionalSalud", "Nombre del profesional de la salud");
  requerido("numeroDocumentoIdentidad", "Número de documento de identidad");
  requerido("cedulaLicenciaProfesional", "Número de cédula profesional o licencia");
  requerido("facturaId", "Factura (debe elegirse una factura cargada en el Expediente)");
  requerido("numeroFactura", "Número de factura");
  requerido("fechaFactura", "Fecha de factura");
  if (datos.valorFactura == null) errores.valorFactura = "Valor de la factura es obligatorio.";
  requerido("monedaFactura", "Moneda de la factura");
  requerido("medicalName", "Nombre de quien certifica");
  requerido("medicalRole", "Cargo de quien certifica");

  return errores;
}

export async function traerNotificacionesPago(): Promise<NotificacionPagoHcp[]> {
  const { data, error } = await supabase.from(TABLA).select("*").order("creado_en", { ascending: false });
  if (error) throw new Error(mensajeErrorAmigable(error));
  return (data ?? []).map((fila) => ({
    ...rowToFlat<NotificacionPagoHcp>(fila, CAMPOS_NOTIFICACION_PAGO),
    firmaCongeladaId: (fila.firma_congelada_id as string | null | undefined) ?? null,
    tipoDoc: "notificacionPago" as const,
  }));
}

/**
 * Entrega 37: una factura = una Notificación de Pago. El formulario ya solo ofrece facturas sin notificar, pero la lista
 * puede estar desactualizada (otra persona notificó esa factura mientras tanto): se vuelve a comprobar contra la base antes
 * de guardar. Una notificación Anulada o Rechazada libera su factura.
 */
async function exigirFacturaSinNotificar(facturaId: string | null | undefined, documentoActualId?: string): Promise<void> {
  if (!facturaId) return;
  const { data, error } = await supabase.from(TABLA).select("id, estado").eq("factura_id", facturaId);
  if (error) return; // si no se puede comprobar, no se bloquea el guardado (la lista del formulario ya filtra)
  const ocupada = (data ?? []).some((n) => n.id !== documentoActualId && n.estado !== "Anulado" && n.estado !== "Rechazado");
  if (ocupada) throw new Error("Esa factura ya tiene una Notificación de Pago vigente: se genera una sola notificación por factura. Elige otra factura o anula la notificación anterior.");
}

export async function crearNotificacionPago(
  datos: Omit<
    NotificacionPagoHcp,
    "id" | "tipoDoc" | "estado" | "creadoPorId" | "creadoEn" | "fechaFirma" | "firmaElectronica" | "firmadoPorId" | "motivoAnulacion" | "anuladoPorId" | "anuladoEn"
  >,
  usuario: Usuario,
  guardarComoBorrador: boolean,
): Promise<NotificacionPagoHcp> {
  await exigirFacturaSinNotificar(datos.facturaId);
  const fila = flatToRow(datos as unknown as Record<string, unknown>, CAMPOS_NOTIFICACION_PAGO);
  fila.estado = guardarComoBorrador ? "Borrador" : "Completado";
  fila.creado_por_id = usuario.id;
  fila.creado_en = new Date().toISOString();
  if (!guardarComoBorrador) {
    fila.fecha_firma = new Date().toISOString().slice(0, 10);
    fila.firma_electronica = true;
    fila.firmado_por_id = usuario.id; // octubre 2026: ver nota en `crearFmv`
  }

  let { data: docCreado, error } = await supabase.from(TABLA).insert(fila).select("*").single();
  // Noviembre 2026: `convenio_origen_id` es solo una referencia interna (los datos del convenio ya se
  // copiaron al formulario). Si la base lo rechaza por su clave foránea, se guarda sin ella en vez de
  // impedir el borrador.
  if (violaFkDeColumna(error, "convenio_origen_id")) {
    ({ data: docCreado, error } = await supabase.from(TABLA).insert({ ...fila, convenio_origen_id: null }).select("*").single());
  }
  if (error || !docCreado) throw new Error(`No se pudo crear la Notificación de Pago: ${mensajeErrorAmigable(error)}${violaFkDeColumna(error, "factura_id") ? " Un administrador debe ejecutar db/corregir_fk_notificacion_pago.sql en el SQL Editor de Supabase." : ""}`);

  const docPlano: NotificacionPagoHcp = {
    ...rowToFlat<NotificacionPagoHcp>(docCreado, CAMPOS_NOTIFICACION_PAGO),
    firmaCongeladaId: (docCreado.firma_congelada_id as string | null | undefined) ?? null,
    tipoDoc: "notificacionPago",
  };
  // Entrega 22: la firma manuscrita y el formato quedan congelados al firmar.
  if (!guardarComoBorrador) {
    await congelarDocumentoUnicoFirmante({ tabla: TABLA, tipoDoc: "notificacionPago", documentoId: docPlano.id, firmaId: usuario.firmaId, empresaGrupo: docPlano.empresaGrupo });
  }

  await registrarAuditoria({
    documentoId: docPlano.id,
    tipoDoc: "notificacionPago",
    documentoNombre: nombreNotificacionPago(docPlano),
    actorId: usuario.id,
    accion: "creacion",
    detalle: guardarComoBorrador ? "Notificación de Pago guardada como borrador." : "Notificación de Pago diligenciada y firmada.",
  });
  if (!guardarComoBorrador) {
    await registrarAuditoria({
      documentoId: docPlano.id,
      tipoDoc: "notificacionPago",
      documentoNombre: nombreNotificacionPago(docPlano),
      actorId: usuario.id,
      accion: "completado",
    });
  }

  return docPlano;
}

/**
 * Guarda cambios sobre una Notificación de Pago todavía en Borrador —
 * repetible las veces que haga falta antes de firmarla y completarla. Mismo
 * criterio que `editarBorradorFmv`: sin cadena de aprobación, no hay
 * "devolver"/"enmienda" que aplicar aquí.
 */
export async function editarBorradorNotificacionPago(
  doc: NotificacionPagoHcp,
  datos: Omit<
    NotificacionPagoHcp,
    "id" | "tipoDoc" | "estado" | "creadoPorId" | "creadoEn" | "fechaFirma" | "firmaElectronica" | "firmadoPorId" | "motivoAnulacion" | "anuladoPorId" | "anuladoEn"
  >,
  usuario: Usuario,
): Promise<void> {
  await exigirFacturaSinNotificar(datos.facturaId, doc.id);
  // `flatToRowParcial`, no `flatToRow` — mismo hallazgo que en
  // `editarBorradorCaf`/`editarBorradorFmv`: `datos` nunca trae
  // `creadoPorId`/`creadoEn`, y `flatToRow` los habría pisado con "".
  const fila = flatToRowParcial(datos as unknown as Record<string, unknown>, CAMPOS_NOTIFICACION_PAGO);
  let { data: filasActualizadas, error } = await supabase.from(TABLA).update(fila).eq("id", doc.id).select("id");
  if (violaFkDeColumna(error, "convenio_origen_id")) {
    ({ data: filasActualizadas, error } = await supabase.from(TABLA).update({ ...fila, convenio_origen_id: null }).eq("id", doc.id).select("id"));
  }
  if (error) throw new Error(`No se pudo guardar el borrador de la Notificación de Pago: ${mensajeErrorAmigable(error)}${violaFkDeColumna(error, "factura_id") ? " Un administrador debe ejecutar db/corregir_fk_notificacion_pago.sql en el SQL Editor de Supabase." : ""}`);
  exigirFilasActualizadas(filasActualizadas);

  await registrarAuditoria({
    documentoId: doc.id,
    tipoDoc: "notificacionPago",
    documentoNombre: nombreNotificacionPago({ ...doc, ...datos } as NotificacionPagoHcp),
    actorId: usuario.id,
    accion: "borrador_actualizado",
    detalle: "Borrador actualizado.",
  });
}

/** Ver nota larga sobre borrar un borrador sin rastro de auditoría en `eliminarBorradorDocumentoUnicoFirmante` (`documentoUnicoFirmante.ts`). */
export async function eliminarBorradorNotificacionPago(documentoId: string): Promise<void> {
  await eliminarBorradorDocumentoUnicoFirmante({ tipoDoc: "notificacionPago", documentoId });
}

/** Ver nota larga sobre la pantalla admin-only en `eliminarDocumentoFirmadoAdmin` (`src/lib/evento.ts`). */
export async function eliminarDocumentoFirmadoAdmin(documentoId: string): Promise<void> {
  await eliminarDocumentoFirmadoAdminGenerico({ tipoDoc: "notificacionPago", documentoId });
}

export async function firmarYCompletarNotificacionPago(doc: NotificacionPagoHcp, datosFirma: DatosFirma, usuario: Usuario): Promise<void> {
  await firmarYCompletarDocumentoUnicoFirmante({
    tabla: TABLA,
    tipoDoc: "notificacionPago",
    documentoId: doc.id,
    documentoNombre: nombreNotificacionPago(doc),
    datosFirma,
    usuario,
  });
  await congelarDocumentoUnicoFirmante({ tabla: TABLA, tipoDoc: "notificacionPago", documentoId: doc.id, firmaId: usuario.firmaId, empresaGrupo: doc.empresaGrupo });
}

export async function anularNotificacionPago(doc: NotificacionPagoHcp, usuario: Usuario, motivo: string): Promise<void> {
  await anularDocumentoUnicoFirmante({
    tabla: TABLA,
    tipoDoc: "notificacionPago",
    documentoId: doc.id,
    documentoNombre: nombreNotificacionPago(doc),
    motivo,
    usuario,
  });
}

export { nombreNotificacionPago };
