import { formatearFecha } from "@/lib/fecha";

/**
 * Entrega 28 — filtro por fecha del Tablero y de «Visor Documental».
 *
 * Todas las fechas se comparan como texto «YYYY-MM-DD» (el formato de toda la app, ver `lib/fecha.ts`): ordena igual que
 * las fechas y evita los corrimientos de un día que produce `new Date("2026-01-15")` (UTC) en zonas con offset negativo.
 */

export interface RangoFechas {
  /** «YYYY-MM-DD» inclusive; «» = sin límite inferior. */
  desde: string;
  /** «YYYY-MM-DD» inclusive; «» = sin límite superior. */
  hasta: string;
}

export const RANGO_VACIO: RangoFechas = { desde: "", hasta: "" };

export function hayRango(r: RangoFechas): boolean {
  return Boolean(r.desde || r.hasta);
}

/** Normaliza un valor (fecha sola o timestamp) a «YYYY-MM-DD» en hora local; `""` si no hay fecha válida. */
export function aDia(valor: string | Date | null | undefined): string {
  const f = formatearFecha(valor);
  return f === "—" ? "" : f;
}

/** ¿La fecha cae dentro del rango? Sin fecha, solo coincide cuando no hay rango. */
export function coincideRango(fecha: string | Date | null | undefined, rango: RangoFechas): boolean {
  if (!hayRango(rango)) return true;
  const dia = aDia(fecha);
  if (!dia) return false;
  if (rango.desde && dia < rango.desde) return false;
  if (rango.hasta && dia > rango.hasta) return false;
  return true;
}

/** ¿El intervalo [inicio, fin] se cruza con el rango? (eventos de varios días). Si falta `fin`, se toma `inicio`. */
export function intervaloCoincideRango(
  inicio: string | Date | null | undefined,
  fin: string | Date | null | undefined,
  rango: RangoFechas,
): boolean {
  if (!hayRango(rango)) return true;
  const a = aDia(inicio);
  const b = aDia(fin) || a;
  if (!a && !b) return false;
  const desdeIntervalo = a || b;
  const hastaIntervalo = b || a;
  if (rango.desde && hastaIntervalo < rango.desde) return false;
  if (rango.hasta && desdeIntervalo > rango.hasta) return false;
  return true;
}

function dos(n: number): string {
  return String(n).padStart(2, "0");
}

function aTexto(d: Date): string {
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

export interface PresetFecha {
  id: string;
  etiqueta: string;
  rango: (hoy: Date) => RangoFechas;
}

export const PRESETS_FECHA: PresetFecha[] = [
  { id: "hoy", etiqueta: "Hoy", rango: (h) => ({ desde: aTexto(h), hasta: aTexto(h) }) },
  {
    id: "7d",
    etiqueta: "Últimos 7 días",
    rango: (h) => ({ desde: aTexto(new Date(h.getFullYear(), h.getMonth(), h.getDate() - 6)), hasta: aTexto(h) }),
  },
  {
    id: "30d",
    etiqueta: "Últimos 30 días",
    rango: (h) => ({ desde: aTexto(new Date(h.getFullYear(), h.getMonth(), h.getDate() - 29)), hasta: aTexto(h) }),
  },
  {
    id: "mes",
    etiqueta: "Este mes",
    rango: (h) => ({ desde: aTexto(new Date(h.getFullYear(), h.getMonth(), 1)), hasta: aTexto(new Date(h.getFullYear(), h.getMonth() + 1, 0)) }),
  },
  { id: "anio", etiqueta: "Este año", rango: (h) => ({ desde: `${h.getFullYear()}-01-01`, hasta: `${h.getFullYear()}-12-31` }) },
];
