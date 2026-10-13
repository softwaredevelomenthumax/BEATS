import { aDia } from "@/lib/filtroFechas";
import type { EstadoDoc } from "@/lib/enums";

/**
 * Entrega 28 — «archivado» de documentos por antigüedad del evento.
 *
 * Con el tiempo el Tablero y «Visor Documental» acumulan cientos de documentos de eventos ya concluidos que estorban a
 * la hora de buscar. Cada usuario puede elegir, en «Mis preferencias», archivar (= ocultar de la vista normal) lo asociado a
 * eventos que terminaron hace más de 1, 2, 3, 6, 12 o 24 meses.
 *
 * Reglas de seguridad — el archivado es solo de VISTA y nunca borra ni modifica nada:
 *  - Es por usuario: no cambia lo que ven los demás ni el estado del documento en la base de datos.
 *  - Es reversible al instante: basta elegir «Archivados» o «Todos» en el Tablero, o poner «Nunca» en las preferencias.
 *  - Nunca archiva un documento que todavía requiere gestión: solo los que están en un estado final (Aprobado, Completado,
 *    Rechazado, Anulado). Un Borrador, un Pendiente o un Devuelto siempre quedan a la vista, sin importar qué tan viejo sea
 *    su evento.
 *  - La fecha de referencia es el FIN del evento (o de la actividad); si el documento no está ligado a una fecha de evento,
 *    se usa su fecha de creación.
 */

/** Opciones del selector; 0 = nunca archivar. */
export const OPCIONES_ARCHIVADO_MESES: { valor: number; etiqueta: string }[] = [
  { valor: 0, etiqueta: "Nunca (mostrar todo)" },
  { valor: 1, etiqueta: "1 mes" },
  { valor: 2, etiqueta: "2 meses" },
  { valor: 3, etiqueta: "3 meses" },
  { valor: 6, etiqueta: "6 meses" },
  { valor: 12, etiqueta: "12 meses" },
  { valor: 24, etiqueta: "24 meses" },
];

export const ESTADOS_ARCHIVABLES: ReadonlySet<EstadoDoc> = new Set<EstadoDoc>(["Aprobado", "Completado", "Rechazado", "Anulado"]);

/** Fecha de corte «YYYY-MM-DD»: lo que terminó ANTES de ella está archivado. Resta meses de calendario (31-mar − 1 mes = 28-feb). */
export function fechaCorteArchivado(meses: number, hoy: Date = new Date()): string {
  const ultimoDiaDestino = new Date(hoy.getFullYear(), hoy.getMonth() - meses + 1, 0).getDate();
  const d = new Date(hoy.getFullYear(), hoy.getMonth() - meses, Math.min(hoy.getDate(), ultimoDiaDestino));
  return aDia(d);
}

export interface ArchivableInfo {
  estado: EstadoDoc;
  /** Fin del evento/actividad; si falta, su inicio. */
  fechaFin?: string | null;
  fechaInicio?: string | null;
  /** Respaldo cuando el documento no tiene fecha de evento. */
  creadoEn?: string | null;
}

export function fechaReferenciaArchivado(d: ArchivableInfo): string {
  return aDia(d.fechaFin) || aDia(d.fechaInicio) || aDia(d.creadoEn);
}

export function estaArchivado(d: ArchivableInfo, meses: number, hoy: Date = new Date()): boolean {
  if (!meses || meses <= 0) return false;
  if (!ESTADOS_ARCHIVABLES.has(d.estado)) return false;
  const ref = fechaReferenciaArchivado(d);
  if (!ref) return false;
  return ref < fechaCorteArchivado(meses, hoy);
}

// --- Preferencia del usuario -------------------------------------------------------------------------------------

const CLAVE_LOCAL = (usuarioId: string) => `beats.preferencias.${usuarioId}.archivarMeses`;
export const EVENTO_PREFERENCIAS_CAMBIARON = "beats:preferencias-cambiaron";
export const EVENTO_ABRIR_PREFERENCIAS = "beats:abrir-preferencias";

export function leerMesesArchivadoLocal(usuarioId: string): number | null {
  try {
    const v = window.localStorage.getItem(CLAVE_LOCAL(usuarioId));
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

export function guardarMesesArchivadoLocal(usuarioId: string, meses: number | null): void {
  try {
    if (meses == null) window.localStorage.removeItem(CLAVE_LOCAL(usuarioId));
    else window.localStorage.setItem(CLAVE_LOCAL(usuarioId), String(meses));
  } catch {
    /* sin almacenamiento: la preferencia solo dura la sesión */
  }
  window.dispatchEvent(new Event(EVENTO_PREFERENCIAS_CAMBIARON));
}

/**
 * Meses efectivos: el valor guardado en la base de datos (sigue al usuario en cualquier equipo) y, si la columna aún no
 * existe, el guardado en este navegador. 0 = nunca archivar.
 */
export function mesesArchivadoEfectivo(usuario: { id: string; archivarDocumentosMeses?: number | null }): number {
  if (typeof usuario.archivarDocumentosMeses === "number") return usuario.archivarDocumentosMeses;
  return leerMesesArchivadoLocal(usuario.id) ?? 0;
}
