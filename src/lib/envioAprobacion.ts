import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";
import { eliminarBorradorDocumento } from "@/lib/documentosRpc";
import type { TipoDoc } from "@/lib/enums";
import { notificarTareaPendiente, traerUsuariosParaNotificar } from "@/lib/notificaciones";

/**
 * Octubre 2026 (entrega 20) — "enviar a aprobación" directo desde el formulario
 * nuevo, sin pasar antes por un borrador.
 *
 * Síntoma reportado: al diligenciar un formulario nuevo y dar "Enviar a
 * aprobación" sin guardar borrador, salía "El convenio se creó pero no se pudo
 * iniciar su cadena de aprobación: column "documento_ref_tipo" is of type
 * tipo_doc but expression is of type text", y el documento quedaba creado SIN
 * cadena (había que reabrirlo, guardarlo como borrador y enviarlo de nuevo).
 *
 * Causa: `crearConvenio/Caf/ConvenioHCP/Evento` insertaban el documento ya en
 * "Pendiente" y LUEGO la cadena. El trigger de base de datos
 * `fn_notificar_primera_etapa_*` (AFTER INSERT sobre la cadena) llama a
 * `beats_notificar_tarea_pendiente`, que inserta `p_tipo` (text) en
 * `notificaciones.documento_ref_tipo` (enum `tipo_doc`) sin conversión → el
 * INSERT de la cadena fallaba, y como el documento ya estaba en "Pendiente" la
 * función de borrado de borradores tampoco podía retirarlo. Con un borrador no
 * fallaba porque la función sale antes de insertar cuando el estado no es
 * "Pendiente".
 *
 * Solución en la app (funciona con o sin la corrección SQL
 * `db/corregir_notificar_tarea_pendiente_tipo_doc.sql`):
 *   1. El documento SIEMPRE se inserta como "Borrador".
 *   2. Se inserta la cadena (el trigger no hace nada con un Borrador).
 *   3. Solo entonces, si el usuario pidió enviar, se pasa a "Pendiente" (el
 *      mismo UPDATE que ya hace "guardar borrador → enviar") y la propia
 *      aplicación avisa al primer aprobador.
 *   4. Si cualquier paso falla, el documento recién creado se retira (todavía
 *      es un Borrador, así que se puede) para no dejar documentos a medias ni
 *      duplicados al reintentar.
 */

/**
 * Retira un documento recién creado (aún "Borrador") junto con sus filas
 * dependientes. Devuelve true si quedó retirado. Nunca lanza: se usa mientras
 * ya se está propagando otro error.
 */
export async function retirarDocumentoRecienCreado(params: {
  tipoDoc: TipoDoc;
  tabla: string;
  tablaAprobaciones?: string;
  columnaFk?: string;
  documentoId: string;
}): Promise<boolean> {
  const { tipoDoc, tabla, tablaAprobaciones, columnaFk, documentoId } = params;
  try {
    await eliminarBorradorDocumento(tipoDoc, documentoId);
    return true;
  } catch {
    // La función del servidor puede no estar desplegada: se intenta el borrado directo.
  }
  try {
    if (tablaAprobaciones && columnaFk) await supabase.from(tablaAprobaciones).delete().eq(columnaFk, documentoId);
    const { data, error } = await supabase.from(tabla).delete().eq("id", documentoId).select("id");
    return !error && (data ?? []).length > 0;
  } catch {
    return false;
  }
}

function mensajeSegunRetiro(retirado: boolean, accion: string, detalle: string): string {
  return retirado
    ? `${accion}: ${detalle} No se creó ningún documento; corrige el problema y vuelve a intentarlo.`
    : `${accion}: ${detalle} El documento quedó guardado como BORRADOR (no se pudo retirar automáticamente): ábrelo desde el Tablero y envíalo desde ahí, sin crear uno nuevo.`;
}

/** Inserta la cadena de aprobación de un documento recién creado como Borrador; si falla, retira el documento. */
export async function insertarCadenaOReversar(params: {
  tipoDoc: TipoDoc;
  tabla: string;
  tablaAprobaciones: string;
  columnaFk: string;
  documentoId: string;
  filas: Record<string, unknown>[];
  /** "No se pudo crear el convenio de pago", "No se pudo crear el CAF"... */
  accion: string;
}): Promise<void> {
  const { tipoDoc, tabla, tablaAprobaciones, columnaFk, documentoId, filas, accion } = params;
  const { error } = await supabase.from(tablaAprobaciones).insert(filas);
  if (!error) return;
  const retirado = await retirarDocumentoRecienCreado({ tipoDoc, tabla, tablaAprobaciones, columnaFk, documentoId });
  throw new Error(mensajeSegunRetiro(retirado, accion, `no se pudo iniciar su cadena de aprobación (${mensajeErrorAmigable(error)}).`));
}

/** Pasa un documento recién creado de "Borrador" a "Pendiente" (envío real a aprobación); si falla, lo retira. */
export async function pasarAPendienteOReversar(params: {
  tipoDoc: TipoDoc;
  tabla: string;
  tablaAprobaciones?: string;
  columnaFk?: string;
  documentoId: string;
  accion: string;
}): Promise<void> {
  const { tipoDoc, tabla, tablaAprobaciones, columnaFk, documentoId, accion } = params;
  const { data, error } = await supabase.from(tabla).update({ estado: "Pendiente" }).eq("id", documentoId).select("id");
  if (!error && (data ?? []).length > 0) return;
  const detalle = error ? mensajeErrorAmigable(error) : "la base de datos no permitió enviarlo a aprobación.";
  const retirado = await retirarDocumentoRecienCreado({ tipoDoc, tabla, tablaAprobaciones, columnaFk, documentoId });
  throw new Error(mensajeSegunRetiro(retirado, accion, `no se pudo enviar a aprobación (${detalle}).`));
}

/**
 * Avisa (campana + correo) a quienes tienen el rol de la PRIMERA etapa de la
 * cadena de que un documento quedó esperando su aprobación. Es el único aviso
 * de primera etapa: ya no depende del trigger de la base de datos, que solo
 * reaccionaba al insertar la cadena (un documento guardado como borrador y
 * enviado después nunca avisaba al primer aprobador). Nunca interrumpe el
 * envío: si falla, queda registrado en consola y la tarea sigue visible en
 * "Tareas pendientes" del aprobador.
 */
export async function avisarPrimerAprobador(params: {
  tipoDoc: TipoDoc;
  documentoId: string;
  documentoNombre: string;
  rolPrimeraEtapa: string;
}): Promise<void> {
  try {
    const usuariosConRol = await traerUsuariosParaNotificar();
    await notificarTareaPendiente({
      tipoDoc: params.tipoDoc,
      documentoId: params.documentoId,
      documentoNombre: params.documentoNombre,
      rolRequerido: params.rolPrimeraEtapa,
      usuariosConRol,
    });
  } catch (error) {
    console.error("No se pudo avisar al primer aprobador:", error);
  }
}
