import { traerFmvPorEventoYSpeaker } from "@/lib/fmv";
import { ubicacionTexto } from "@/lib/ubicacionVisible";
import { traerConfiguracionFmv, calcularPuntajeTotal, calcularTier } from "@/lib/fmvConfig";
import { CRITERIO_FMV_KEY } from "@/lib/enums";
import type { Evento } from "@/types";

/**
 * Octubre 2026 — datos del Convenio de Pago a HCP que se DERIVAN de otros
 * documentos y que, una vez guardados/firmados, deben quedar congelados.
 */

// ---------------------------------------------------------------------------
// Score total del FMV Checklist
// ---------------------------------------------------------------------------

/** Puntaje máximo del FMV Checklist (6 criterios × 3 puntos). */
export const PUNTAJE_MAXIMO_FMV = 18;

/**
 * Pedido explícito: "Score total FMV Checklist" en el Convenio de Pago a HCP
 * (formulario, vista diligenciada y vista previa/PDF), concatenando puntaje y
 * Tier (p. ej. "0 / 18 — Tier 3"). Es inmodificable porque depende del FMV
 * Checklist del speaker, y una vez guardado/firmado NO debe cambiar aunque
 * ese FMV se actualice después.
 *
 * Se guarda DENTRO de `camposPersonalizados` (JSON ya existente en la tabla)
 * bajo claves reservadas con prefijo `__`: así no hace falta ninguna columna
 * nueva ni migración, y los campos personalizados configurables (que se
 * leen por su propia clave) nunca las muestran ni las pisan.
 */
export const CLAVE_SCORE_FMV_PUNTAJE = "__scoreFmvPuntaje";
export const CLAVE_SCORE_FMV_TIER = "__scoreFmvTier";

export interface ScoreFmv {
  puntaje: number;
  tier: string;
}

export function leerScoreFmv(campos: Record<string, unknown> | null | undefined): ScoreFmv | null {
  if (!campos) return null;
  const puntaje = campos[CLAVE_SCORE_FMV_PUNTAJE];
  const tier = campos[CLAVE_SCORE_FMV_TIER];
  if (typeof puntaje !== "number" || typeof tier !== "string" || !tier) return null;
  return { puntaje, tier };
}

/** Devuelve una copia de `campos` con el score escrito (o retirado si `score` es `null`). */
export function escribirScoreFmv(campos: Record<string, unknown> | null | undefined, score: ScoreFmv | null): Record<string, unknown> {
  const copia: Record<string, unknown> = { ...(campos ?? {}) };
  if (score) {
    copia[CLAVE_SCORE_FMV_PUNTAJE] = score.puntaje;
    copia[CLAVE_SCORE_FMV_TIER] = score.tier;
  } else {
    delete copia[CLAVE_SCORE_FMV_PUNTAJE];
    delete copia[CLAVE_SCORE_FMV_TIER];
  }
  return copia;
}

/** "12 / 18 — Tier 2", o "—" si todavía no hay score. */
export function textoScoreFmv(score: ScoreFmv | null): string {
  return score ? `${score.puntaje} / ${PUNTAJE_MAXIMO_FMV} — ${score.tier}` : "—";
}

/**
 * Calcula el score del FMV Checklist vigente del speaker en ese evento (el
 * mismo cálculo y los mismos umbrales de Tier que usa el propio FMV). `null`
 * si no hay un FMV (o fue anulado).
 */
export async function calcularScoreFmvVigente(eventoOrigenId: string | null | undefined, speakerId: string | null | undefined): Promise<ScoreFmv | null> {
  if (!eventoOrigenId || !speakerId) return null;
  const fmv = await traerFmvPorEventoYSpeaker(eventoOrigenId, speakerId);
  if (!fmv || fmv.estado === "Anulado") return null;
  const configuracion = await traerConfiguracionFmv();
  const respuestas = Object.fromEntries(CRITERIO_FMV_KEY.map((clave) => [clave, fmv[clave]]));
  const puntaje = calcularPuntajeTotal(respuestas);
  return { puntaje, tier: calcularTier(puntaje, configuracion.umbralTier1, configuracion.umbralTier2) };
}

// ---------------------------------------------------------------------------
// Sesiones de participación vinculadas
// ---------------------------------------------------------------------------

export interface SesionesVinculadas {
  cantidad: number;
  /** Una línea por sesión: "Sesión 2 — 2026-10-15 — Hotel X, Bogotá, Cundinamarca, Colombia". */
  lineas: string[];
}

function lugarCompleto(partes: Array<string | null | undefined>): string {
  return ubicacionTexto(partes);
}

/**
 * Sesiones del evento en las que participa el speaker de este convenio, con
 * fecha y lugar. `idsElegidos` son las sesiones marcadas en el formulario; si
 * está vacío (el convenio aplica a todas) o el evento es de una sola sesión,
 * se listan todas las sesiones del evento.
 */
export function sesionesVinculadasDeConvenio(evento: Evento, idsElegidos: string[]): SesionesVinculadas {
  if (evento.modalidadSesiones === "Varias sesiones" && evento.sesiones.length > 0) {
    const elegidas = new Set(idsElegidos);
    const todas = evento.sesiones.map((s, i) => ({ s, numero: i + 1 }));
    const marcadas = todas.filter(({ s }) => elegidas.has(s.id));
    // Sin ninguna marcada (o con marcas de otro evento) el convenio aplica a todas las sesiones.
    const entradas = marcadas.length > 0 ? marcadas : todas;
    return {
      cantidad: entradas.length,
      lineas: entradas.map(({ s, numero }) =>
        [`Sesión ${numero}`, s.fecha ?? "sin fecha", lugarCompleto([s.lugar, s.ciudad, s.estadoProvincia, s.pais]) || "sin lugar"].join(" — "),
      ),
    };
  }
  const inicio = evento.fechaInicioEvento;
  const fin = evento.fechaFinEvento;
  const fecha = inicio && fin && inicio !== fin ? `${inicio} a ${fin}` : inicio ?? fin ?? "sin fecha";
  return {
    cantidad: 1,
    lineas: [["Sesión única", fecha, lugarCompleto([evento.direccion, evento.ciudad, evento.estadoProvincia, evento.pais]) || "sin lugar"].join(" — ")],
  };
}

/**
 * Sesiones a preseleccionar cuando se elige el speaker: aquellas en las que
 * participa según la Solicitud de evento (sus presupuestos por sesión). Si
 * participa en todo el evento, o no hay detalle por sesión, se marcan todas.
 */
export function sesionesDelSpeakerEnEvento(evento: Evento, speakerId: string): string[] {
  if (evento.modalidadSesiones !== "Varias sesiones" || evento.sesiones.length === 0) return [];
  const sp = evento.speakersParticipacion.find((s) => s.speakerId === speakerId);
  const todas = evento.sesiones.map((s) => s.id);
  if (!sp || sp.presupuestos.length === 0 || sp.presupuestos.some((p) => p.sesionId === null)) return todas;
  const propias = evento.sesiones.filter((s) => sp.presupuestos.some((p) => p.sesionId === s.id)).map((s) => s.id);
  return propias.length > 0 ? propias : todas;
}
