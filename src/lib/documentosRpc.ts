import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";
import type { TipoDoc } from "@/lib/enums";

/**
 * Eliminar / anular documentos vía funciones del servidor (octubre 2026).
 *
 * Contexto: "Eliminar borrador", "Anular" (sobre todo un documento
 * Completado) y la pantalla de "Gestión avanzada de documentos" hacían un
 * `delete`/`update` directo desde el navegador que Row Level Security
 * filtraba en silencio (0 filas, sin error de Postgres) — de ahí los
 * mensajes "solo quien creó la solicitud puede borrarla...", "la base de
 * datos no permitió el cambio..." y "no se encontró el documento...".
 * Las políticas RLS reales no viven en este repositorio, así que en vez de
 * reescribirlas a ciegas, la operación pasa a funciones `security definer`
 * que validan en el servidor la misma regla de negocio (quién puede y en
 * qué estado) y recién entonces ejecutan el cambio — ver
 * `db/agregar_rpc_eliminar_anular_documentos.sql`, que HAY QUE EJECUTAR en
 * Supabase antes de usar esta versión.
 *
 * Las 3 funciones de abajo son el único punto de entrada: las 6 familias de
 * documento (Evento, CAF, Convenio, Convenio HCP, FMV, Notificación de
 * Pago) se limitan a delegar aquí con su `TipoDoc`.
 */

const MENSAJE_MIGRACION_PENDIENTE =
  "Falta aplicar una migración en la base de datos (db/agregar_rpc_eliminar_anular_documentos.sql). Pídele a quien administra Supabase que la ejecute.";

/** PostgREST responde PGRST202 (o "Could not find the function") cuando la función todavía no existe en la base. */
function esFuncionNoDesplegada(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST202" || /could not find the function/i.test(error.message ?? "");
}

async function llamarConResultado(nombreFuncion: string, parametros: Record<string, unknown>, migracion = "agregar_rpc_eliminar_anular_documentos.sql"): Promise<unknown> {
  const { data, error } = await supabase.rpc(nombreFuncion, parametros);
  if (!error) return data;
  if (esFuncionNoDesplegada(error)) {
    throw new Error(MENSAJE_MIGRACION_PENDIENTE.replace("agregar_rpc_eliminar_anular_documentos.sql", migracion));
  }
  throw new Error(mensajeErrorAmigable(error));
}

async function llamar(nombreFuncion: string, parametros: Record<string, unknown>): Promise<void> {
  await llamarConResultado(nombreFuncion, parametros);
}

/** Elimina un Borrador propio (solo quien lo creó, solo en Borrador) — sin rastro de auditoría. */
export async function eliminarBorradorDocumento(tipoDoc: TipoDoc, documentoId: string): Promise<void> {
  await llamar("beats_eliminar_borrador", { p_tipo: tipoDoc, p_id: documentoId });
}

/** "Gestión avanzada de documentos": elimina un documento en cualquier estado. Exige el permiso individual. */
export async function eliminarDocumentoAdmin(tipoDoc: TipoDoc, documentoId: string): Promise<void> {
  await llamar("beats_eliminar_documento_admin", { p_tipo: tipoDoc, p_id: documentoId });
}

/** Anula un documento (solo Administradores; no aplica a Borrador ni a uno ya Anulado). */
export async function anularDocumentoRpc(tipoDoc: TipoDoc, documentoId: string, motivo: string): Promise<void> {
  await llamar("beats_anular_documento", { p_tipo: tipoDoc, p_id: documentoId, p_motivo: motivo });
}

/**
 * Devuelve un documento Pendiente (estado -> "Devuelto"). Intenta la función del servidor; si todavía no está
 * desplegada, cae al `update` directo pero VERIFICA que realmente cambió una fila (RLS filtra en silencio con 0 filas).
 */
export async function devolverDocumentoRpc(tipoDoc: TipoDoc, documentoId: string, tabla: string): Promise<void> {
  const { error } = await supabase.rpc("beats_devolver_documento", { p_tipo: tipoDoc, p_id: documentoId });
  if (!error) return;
  if (!esFuncionNoDesplegada(error)) throw new Error(mensajeErrorAmigable(error));
  const { data, error: errorUpdate } = await supabase.from(tabla).update({ estado: "Devuelto" }).eq("id", documentoId).select("id");
  if (errorUpdate) throw new Error(mensajeErrorAmigable(errorUpdate));
  if (!data || data.length === 0) {
    throw new Error(
      "No se pudo devolver: la base de datos no permitió el cambio (permisos). Falta aplicar la migración db/entrega_28b_devolver_documento.sql; pídele a quien administra Supabase que la ejecute.",
    );
  }
}

export const MENSAJE_GUARDADO_BLOQUEADO =
  "No se pudo guardar: la base de datos no permitió el cambio (permisos). Verifica que el documento siga en Borrador o Devuelto y que seas quien lo creó (o Administrador). Si es un documento Devuelto, falta aplicar db/entrega_28e_rls_devuelto.sql en Supabase.";

/** Row Level Security filtra un UPDATE no permitido sin error (0 filas): no se puede dar por guardado algo que no cambió. */
export function exigirFilasActualizadas(data: unknown[] | null | undefined): void {
  if (!data || data.length === 0) throw new Error(MENSAJE_GUARDADO_BLOQUEADO);
}

/** `update` de un documento editable (Borrador/Devuelto/Rechazado) que verifica que de verdad cambió una fila. */
export async function actualizarDocumentoEditable(tabla: string, documentoId: string, fila: Record<string, unknown>): Promise<void> {
  const { data, error } = await supabase.from(tabla).update(fila).eq("id", documentoId).select("id");
  if (error) throw new Error(mensajeErrorAmigable(error));
  exigirFilasActualizadas(data);
}

const MIGRACION_AUDITORIA = "agregar_rpc_eliminar_auditoria_rango.sql";

/** Cuenta los registros del log de auditoría dentro del rango (ISO con zona horaria). */
export async function contarAuditoriaPorRango(desdeIso: string, hastaIso: string): Promise<number> {
  const n = await llamarConResultado("beats_contar_auditoria_rango", { p_desde: desdeIso, p_hasta: hastaIso }, MIGRACION_AUDITORIA);
  return Number(n ?? 0);
}

/** "Gestión Avanzada de Documentos": elimina, sin dejar rastro, los registros de auditoría del rango. Devuelve cuántos. */
export async function eliminarAuditoriaPorRango(desdeIso: string, hastaIso: string): Promise<number> {
  const n = await llamarConResultado("beats_eliminar_auditoria_rango", { p_desde: desdeIso, p_hasta: hastaIso }, MIGRACION_AUDITORIA);
  return Number(n ?? 0);
}
