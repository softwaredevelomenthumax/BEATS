import type { Evento, SpeakerParticipacionEvento } from "@/types";

/**
 * Entrega 22 (octubre 2026): un evento puede tener AL MISMO TIEMPO speakers
 * internos y externos. Antes "Quién dicta la actividad" era excluyente
 * (`Evento.quienDictaActividad`: uno u otro). Ahora cada fila de
 * `speakersParticipacion` declara su `tipo`, y estas funciones puras son la
 * única fuente de verdad para preguntar "¿hay externos?", "¿hay internos?" o
 * "dame solo los externos" (los documentos FMV / Convenio de pago / CAF /
 * Convenio HCP y las tareas asociadas solo aplican a los EXTERNOS).
 *
 * Compatibilidad: `quienDictaActividad` se sigue guardando (la base real y los
 * triggers de recordatorios lo leen). Con ambos tipos se guarda "Speaker
 * externo" para que sigan disparándose las tareas de documentos de los externos.
 */

export const esSpeakerExternoFila = (sp: Pick<SpeakerParticipacionEvento, "tipo">) => sp.tipo === "externo";
export const esSpeakerInternoFila = (sp: Pick<SpeakerParticipacionEvento, "tipo">) => sp.tipo === "interno";

/** Solo los speakers externos de la solicitud (los únicos que generan documentos y tareas). */
export function speakersExternosDe(evento: Pick<Evento, "speakersParticipacion">): SpeakerParticipacionEvento[] {
  return evento.speakersParticipacion.filter(esSpeakerExternoFila);
}

/** Solo los speakers internos (empleados): sin FMV, convenio, CAF ni facturación. */
export function speakersInternosDe(evento: Pick<Evento, "speakersParticipacion">): SpeakerParticipacionEvento[] {
  return evento.speakersParticipacion.filter(esSpeakerInternoFila);
}

/** Tipo de una fila leída de la base: columna `tipo_speaker` si existe; si no, con speaker del Repositorio = externo. */
export function inferirTipoSpeaker(tipoGuardado: unknown, speakerId: string | null): "interno" | "externo" {
  if (tipoGuardado === "interno" || tipoGuardado === "externo") return tipoGuardado;
  return speakerId ? "externo" : "interno";
}

/**
 * ¿La solicitud tiene speakers externos? Cuenta las filas declaradas y, para
 * solicitudes antiguas o borradores sin filas todavía, el campo histórico.
 */
export function eventoTieneSpeakersExternos(
  evento: Pick<Evento, "participacionAcademica" | "quienDictaActividad" | "speakersParticipacion">,
): boolean {
  if (!evento.participacionAcademica) return false;
  if (evento.speakersParticipacion.some(esSpeakerExternoFila)) return true;
  return evento.speakersParticipacion.length === 0 && evento.quienDictaActividad === "Speaker externo";
}

export function eventoTieneSpeakersInternos(
  evento: Pick<Evento, "participacionAcademica" | "quienDictaActividad" | "speakersParticipacion">,
): boolean {
  if (!evento.participacionAcademica) return false;
  if (evento.speakersParticipacion.some(esSpeakerInternoFila)) return true;
  return evento.speakersParticipacion.length === 0 && evento.quienDictaActividad === "Speaker interno";
}

/** Valor que se guarda en `quien_dicta_actividad`: con externos (aunque haya internos) "Speaker externo". */
export function quienDictaDerivado(incluyeInternos: boolean, incluyeExternos: boolean): "Speaker interno" | "Speaker externo" | "" {
  if (incluyeExternos) return "Speaker externo";
  if (incluyeInternos) return "Speaker interno";
  return "";
}

// --- Catálogo "Speakers internos" -------------------------------------------------
// El catálogo (`catalogo_valores`, catálogo `speakersInternos`) guarda una sola
// cadena por speaker; el país viaja dentro: "Nombre | País".

export const SEPARADOR_SPEAKER_INTERNO = " | ";

export interface SpeakerInternoCatalogo {
  /** Valor tal cual está en el catálogo ("Nombre | País"). */
  valor: string;
  nombre: string;
  pais: string;
}

export function parsearSpeakerInterno(valor: string): SpeakerInternoCatalogo {
  const i = valor.lastIndexOf("|");
  if (i < 0) return { valor, nombre: valor.trim(), pais: "" };
  return { valor, nombre: valor.slice(0, i).trim(), pais: valor.slice(i + 1).trim() };
}

export function valorSpeakerInterno(nombre: string, pais: string): string {
  return `${nombre.trim()}${SEPARADOR_SPEAKER_INTERNO}${pais.trim()}`;
}

/** "Nombre — País" (lo que ve el usuario en la lista y lo que se guarda en la fila del speaker). */
export function etiquetaSpeakerInterno(s: { nombre: string; pais: string }): string {
  return s.pais ? `${s.nombre} — ${s.pais}` : s.nombre;
}
