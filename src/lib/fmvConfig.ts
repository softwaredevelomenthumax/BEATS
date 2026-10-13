import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";
import { CRITERIO_FMV_KEY, type CriterioFmvKey, type RespuestaCriterio } from "@/lib/enums";

/**
 * Configuración del FMV Checklist, reconstruida a partir de la evidencia
 * forense en el bundle original (`kS()`): la fila singleton
 * `configuracion_fmv` (id=1) trae los umbrales de Tier, y cada criterio
 * (`fmv_criterios`) trae sus 4 opciones A/B/C/D (`fmv_criterio_opciones`).
 * El cuestionario es enteramente administrable — no hay preguntas
 * hardcodeadas en el frontend.
 */

/** Puntaje por letra de respuesta — confirmado literal en el bundle: `{A:3,B:2,C:1,D:0}`. */
export const PUNTAJE_POR_RESPUESTA: Record<RespuestaCriterio, number> = {
  A: 3,
  B: 2,
  C: 1,
  D: 0,
};

export type Tier = "Tier 1" | "Tier 2" | "Tier 3";

export interface OpcionCriterioFmv {
  id: string;
  valor: RespuestaCriterio;
  texto: string;
}

export interface CriterioFmv {
  id: string;
  clave: CriterioFmvKey;
  titulo: string;
  pregunta: string;
  orden: number;
  opciones: OpcionCriterioFmv[];
}

export interface ConfiguracionFmv {
  umbralTier1: number;
  umbralTier2: number;
  criterios: CriterioFmv[];
}

const CONFIGURACION_POR_DEFECTO: ConfiguracionFmv = {
  umbralTier1: 15,
  umbralTier2: 9,
  criterios: [],
};

/**
 * Trae `configuracion_fmv` (fila singleton id=1) + `fmv_criterios`
 * (ordenados) + `fmv_criterio_opciones`, y arma la estructura completa que
 * consume el formulario de FMV. Si la configuración todavía no existe (BD
 * recién creada), se cae de vuelta a los umbrales por defecto (15/9) y sin
 * criterios — el formulario mostrará un aviso en ese caso.
 */
export async function traerConfiguracionFmv(): Promise<ConfiguracionFmv> {
  const [{ data: config, error: errorConfig }, { data: criterios, error: errorCriterios }, { data: opciones, error: errorOpciones }] =
    await Promise.all([
      supabase.from("configuracion_fmv").select("*").eq("id", 1).maybeSingle(),
      supabase.from("fmv_criterios").select("*").order("orden", { ascending: true }),
      supabase.from("fmv_criterio_opciones").select("*"),
    ]);
  if (errorConfig) throw new Error(mensajeErrorAmigable(errorConfig));
  if (errorCriterios) throw new Error(mensajeErrorAmigable(errorCriterios));
  if (errorOpciones) throw new Error(mensajeErrorAmigable(errorOpciones));

  const opcionesPorCriterio = new Map<string, OpcionCriterioFmv[]>();
  for (const fila of opciones ?? []) {
    const lista = opcionesPorCriterio.get(fila.criterio_id as string) ?? [];
    lista.push({ id: fila.id as string, valor: fila.valor as RespuestaCriterio, texto: fila.texto as string });
    opcionesPorCriterio.set(fila.criterio_id as string, lista);
  }
  // Orden fijo A, B, C, D independientemente de cómo vengan insertadas.
  const ordenLetras: RespuestaCriterio[] = ["A", "B", "C", "D"];
  for (const lista of opcionesPorCriterio.values()) {
    lista.sort((a, b) => ordenLetras.indexOf(a.valor) - ordenLetras.indexOf(b.valor));
  }

  const listaCriterios: CriterioFmv[] = (criterios ?? []).map((fila) => ({
    id: fila.id as string,
    clave: fila.clave as CriterioFmvKey,
    titulo: fila.titulo as string,
    pregunta: fila.pregunta as string,
    orden: fila.orden as number,
    opciones: opcionesPorCriterio.get(fila.id as string) ?? [],
  }));

  return {
    umbralTier1: (config?.umbral_tier1 as number) ?? CONFIGURACION_POR_DEFECTO.umbralTier1,
    umbralTier2: (config?.umbral_tier2 as number) ?? CONFIGURACION_POR_DEFECTO.umbralTier2,
    criterios: listaCriterios,
  };
}

/** Suma los puntos de las 6 respuestas (A=3, B=2, C=1, D=0), máximo 18. */
export function calcularPuntajeTotal(respuestas: Partial<Record<CriterioFmvKey, RespuestaCriterio | null>>): number {
  let total = 0;
  for (const clave of CRITERIO_FMV_KEY) {
    const respuesta = respuestas[clave];
    if (respuesta) total += PUNTAJE_POR_RESPUESTA[respuesta];
  }
  return total;
}

/**
 * Clasificación de Tier — confirmada literal en el bundle:
 * `puntaje >= umbralTier1 ? "Tier 1" : puntaje >= umbralTier2 ? "Tier 2" : "Tier 3"`.
 */
export function calcularTier(puntaje: number, umbralTier1: number, umbralTier2: number): Tier {
  if (puntaje >= umbralTier1) return "Tier 1";
  if (puntaje >= umbralTier2) return "Tier 2";
  return "Tier 3";
}
