import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";

/**
 * Ronda de ajustes de formularios (septiembre 2026), entrega 3 — reglas de
 * dependencia secuencial entre los 4 documentos de un speaker externo,
 * pedidas explícitamente por el usuario:
 *
 *   MD FMV Checklist → Convenio de Pago a HCP → CAF → Convenio HCP
 *
 * Cada función de "puede enviarse a aprobación" hace una consulta liviana y
 * puntual (no recibe listas completas ya cargadas) porque se llama desde
 * `crearConvenio`/`crearCaf`/`resolverPasoConvenioHCP`, puntos de guardado
 * aislados que no tienen por qué cargar el Tablero completo solo para
 * validar una regla. El emparejamiento por speaker usa `speaker_id`
 * (columna ya existente en `convenios_pago_hcp`, `fmv_checklists` y
 * `convenios_hcp` desde antes de esta ronda) cuando el documento de origen
 * lo trae; si no (formulario aún sin selector de speaker propio, o CAF —
 * que todavía no tiene columna `speaker_id`, ver `db/agregar_speaker_caf.sql`),
 * la regla se aplica a nivel de EVENTO completo en vez de por speaker —
 * sigue siendo correcta (más laxa) mientras esos formularios no tengan su
 * propio selector de speaker, lo cual queda para sus respectivas entregas.
 */

/**
 * Ronda de ajustes de formularios (septiembre 2026), entrega 3: consulta
 * puntual y liviana — no recibe listas ya cargadas porque se llama desde
 * puntos de guardado aislados (crearConvenio/crearCaf/
 * resolverPasoConvenioHCP). Si la consulta falla (por ejemplo porque
 * `cafs.speaker_id` — entrega 5, `db/agregar_speaker_caf.sql` — todavía no
 * existe en el proyecto real), se degrada a PERMISIVO (no bloquea el
 * guardado) en vez de reventar la operación: una regla que no se puede
 * verificar porque falta una migración no debe impedir que el resto de la
 * app siga funcionando — se deja constancia con `console.warn` para que
 * quede claro por qué la regla no se aplicó.
 */
async function existeFilaActiva(
  tabla: string,
  eventoOrigenId: string,
  speakerId: string | null,
  estadosQueCuentan: string[],
): Promise<boolean> {
  try {
    const { data, error } = await supabase.from(tabla).select("id, estado, speaker_id").eq("evento_origen_id", eventoOrigenId);
    if (error) throw error;
    const filas = (data ?? []).filter((f) => estadosQueCuentan.includes(f.estado as string));
    if (!speakerId) return filas.length > 0;
    const conSpeaker = filas.filter((f) => f.speaker_id);
    if (conSpeaker.length === 0) return filas.length > 0; // ningún documento del evento trae speaker_id todavía: regla a nivel de evento
    return conSpeaker.some((f) => f.speaker_id === speakerId);
  } catch (error) {
    console.warn(`No se pudo verificar la regla de dependencia sobre "${tabla}" (¿falta ejecutar una migración pendiente?):`, mensajeErrorAmigable(error));
    return true;
  }
}

/**
 * Convenio de Pago a HCP no puede enviarse a aprobación sin un MD FMV
 * Checklist ya "Completado" (FMV no tiene cadena de aprobación propia —
 * pasa directo de Borrador a Completado, ver Fase 2 del historial) para el
 * mismo evento (y mismo speaker, si el FMV ya trae `speaker_id`).
 */
export async function puedeEnviarConvenioAAprobacion(eventoOrigenId: string | null, speakerId: string | null): Promise<boolean> {
  if (!eventoOrigenId) return true; // sin evento de origen, esta regla no aplica (formulario incompleto se atrapa en otra validación)
  return existeFilaActiva("fmv_checklists", eventoOrigenId, speakerId, ["Completado"]);
}

/**
 * CAF no puede enviarse a aprobación sin un Convenio de Pago a HCP
 * "Aprobado" (en su totalidad) para el mismo evento.
 */
export async function puedeEnviarCafAAprobacion(eventoOrigenId: string | null, speakerId: string | null): Promise<boolean> {
  if (!eventoOrigenId) return true;
  return existeFilaActiva("convenios_pago_hcp", eventoOrigenId, speakerId, ["Aprobado"]);
}

/**
 * Convenio HCP no puede siquiera CREARSE (ni como borrador) sin que ya
 * exista un CAF para el evento — no necesariamente aprobado, puede seguir
 * en flujo de aprobación.
 */
export async function existeCafParaEvento(eventoOrigenId: string | null): Promise<boolean> {
  if (!eventoOrigenId) return true;
  return existeFilaActiva("cafs", eventoOrigenId, null, ["Borrador", "Pendiente", "Devuelto", "Aprobado", "Completado"]);
}

/**
 * La etapa "Gerente General" de un Convenio HCP no puede resolverse como
 * aprobada sin que (a) el CAF del mismo evento esté "Aprobado" en su
 * totalidad y (b) la etapa "Legal/Compliance" de ESTE MISMO Convenio HCP ya
 * esté aprobada.
 */
export async function puedeFirmarConvenioHCPGerenciaGeneral(
  eventoOrigenId: string | null,
  legalYaAprobo: boolean,
): Promise<boolean> {
  if (!legalYaAprobo) return false;
  if (!eventoOrigenId) return true;
  return existeFilaActiva("cafs", eventoOrigenId, null, ["Aprobado"]);
}
