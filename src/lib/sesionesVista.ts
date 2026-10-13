import { ubicacionTexto } from "@/lib/ubicacionVisible";
import { formatearFecha } from "@/lib/fecha";

/**
 * Entrega 33 — sesiones de un evento de «Varias sesiones» tal como las muestran la Marquesina y el Panel en Vivo:
 * fecha, localización propia (lugar + país/estado/ciudad), asistentes esperados y cuántos registros lleva cada una.
 */
export interface SesionVista {
  id: string;
  /** 1, 2, 3… según el orden de las sesiones en la solicitud. */
  numero: number;
  fecha: string | null;
  lugar: string;
  pais: string;
  estadoProvincia: string;
  ciudad: string;
  esperados: number | null;
  /** Check-ins de esa sesión; `null` si no se pudo determinar. */
  registros: number | null;
}

/** Valor de la selección que significa «todo el evento». */
export const TODAS_LAS_SESIONES = "todas";

/** Fecha (solo día) en formato local, tolerante a `null`. */
export function fechaSesion(s: Pick<SesionVista, "fecha">): string {
  return s.fecha ? formatearFecha(s.fecha) : "Sin fecha";
}

/**
 * Localización a mostrar de una sesión. Lo que la sesión no trae se completa con el dato general del evento
 * (una sesión sin ciudad propia ocurre en la ciudad del evento). «N/A» se muestra como «Virtual».
 */
export function ubicacionSesion(
  s: Pick<SesionVista, "lugar" | "ciudad" | "estadoProvincia" | "pais">,
  evento: { direccion?: string | null; ciudad?: string | null; pais?: string | null },
): string {
  const propia = [s.lugar, s.ciudad, s.pais];
  const hayPropia = propia.some((p) => (p ?? "").trim() !== "");
  if (!hayPropia) return ubicacionTexto([evento.direccion, evento.ciudad, evento.pais]);
  return ubicacionTexto([s.lugar, s.ciudad || evento.ciudad, s.pais || evento.pais]);
}

/** ¿La sesión es hoy? (compara el día local). */
export function esSesionDeHoy(s: Pick<SesionVista, "fecha">, ahora: Date = new Date()): boolean {
  if (!s.fecha) return false;
  const [a, m, d] = s.fecha.slice(0, 10).split("-").map(Number);
  return a === ahora.getFullYear() && m === ahora.getMonth() + 1 && d === ahora.getDate();
}

/** Texto corto de una sesión para un selector: «Sesión 2 · 12 nov». */
export function etiquetaCortaSesion(s: SesionVista): string {
  const dia = s.fecha ? new Date(`${s.fecha.slice(0, 10)}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "short" }).replace(".", "") : "sin fecha";
  return `Sesión ${s.numero} · ${dia}`;
}
