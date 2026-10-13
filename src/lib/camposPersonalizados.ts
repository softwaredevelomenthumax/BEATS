import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";
import { rowToFlat, t, s0, b, n0, type FieldSpec } from "@/lib/dbMapping";
import type { TipoDoc } from "@/lib/enums";

export const TIPO_CAMPO_PERSONALIZADO = [
  "texto",
  "numero",
  "fecha",
  "seleccion",
  "booleano",
  "calculado",
] as const;
export type TipoCampoPersonalizado = (typeof TIPO_CAMPO_PERSONALIZADO)[number];

export const OPERADOR_CALCULADO = ["suma", "resta", "multiplicacion", "division"] as const;
export type OperadorCalculado = (typeof OPERADOR_CALCULADO)[number];

export interface CampoPersonalizadoDefinicion {
  id: string;
  formulario: TipoDoc;
  clave: string;
  etiqueta: string;
  tipo: TipoCampoPersonalizado;
  opciones: string[];
  obligatorio: boolean;
  activo: boolean;
  empresaGrupo: string;
  pais: string;
  orden: number;
  calculadoOperador: OperadorCalculado | "";
  calculadoCampoA: string;
  calculadoCampoB: string;
  seccion: string;
  anclaCampo: string;
}

// Exportado (antes privado del módulo) para que `snapshotFormato.ts` pueda
// reutilizar exactamente este mismo mapeo fila→objeto al leer las filas
// crudas congeladas en `snapshot_formato` — ver
// `db/agregar_inmutabilidad_documentos_firmados.sql`.
export const CAMPOS: FieldSpec[] = [
  t("id"),
  t("formulario"),
  t("clave"),
  t("etiqueta"),
  t("tipo"),
  { key: "opciones", column: "opciones", toFlat: (v) => (Array.isArray(v) ? v : []), toRow: (v) => v ?? [] },
  b("obligatorio"),
  b("activo"),
  t("empresa_grupo", "empresaGrupo"),
  t("pais"),
  n0("orden"),
  s0("calculado_operador", "calculadoOperador"),
  s0("calculado_campo_a", "calculadoCampoA"),
  s0("calculado_campo_b", "calculadoCampoB"),
  t("seccion"),
  t("ancla_campo", "anclaCampo"),
];

export async function traerCamposPersonalizados(): Promise<CampoPersonalizadoDefinicion[]> {
  const { data, error } = await supabase
    .from("campos_personalizados_definicion")
    .select("*")
    .order("orden", { ascending: true });
  if (error) throw new Error(mensajeErrorAmigable(error));
  return (data ?? []).map((fila) => rowToFlat<CampoPersonalizadoDefinicion>(fila, CAMPOS));
}

export async function guardarCampoPersonalizado(
  campo: Partial<CampoPersonalizadoDefinicion>,
  actorId: string,
): Promise<void> {
  const fila: Record<string, unknown> = {
    formulario: campo.formulario,
    clave: campo.clave,
    etiqueta: campo.etiqueta,
    tipo: campo.tipo,
    opciones: campo.opciones ?? [],
    obligatorio: campo.obligatorio ?? false,
    activo: campo.activo ?? true,
    empresa_grupo: campo.empresaGrupo ?? "",
    pais: campo.pais ?? "",
    orden: campo.orden ?? 0,
    calculado_operador: campo.calculadoOperador || null,
    calculado_campo_a: campo.calculadoCampoA || null,
    calculado_campo_b: campo.calculadoCampoB || null,
    seccion: campo.seccion ?? "",
    ancla_campo: campo.anclaCampo ?? "",
    actualizado_por_id: actorId,
    actualizado_en: new Date().toISOString(),
  };
  if (campo.id) {
    const { error } = await supabase.from("campos_personalizados_definicion").update(fila).eq("id", campo.id);
    if (error) throw new Error(mensajeErrorAmigable(error));
  } else {
    const { error } = await supabase
      .from("campos_personalizados_definicion")
      .insert({ ...fila, creado_por_id: actorId });
    if (error) throw new Error(mensajeErrorAmigable(error));
  }
}

export async function eliminarCampoPersonalizado(id: string): Promise<void> {
  const { error } = await supabase.from("campos_personalizados_definicion").delete().eq("id", id);
  if (error) throw new Error(mensajeErrorAmigable(error));
}

/**
 * Filtra las definiciones aplicables a un documento concreto: del
 * formulario correcto, activas, y cuyo alcance de empresa/país coincide
 * (una definición con empresaGrupo/pais en blanco aplica a todas).
 */
export function camposAplicables(
  definiciones: CampoPersonalizadoDefinicion[],
  formulario: TipoDoc,
  empresaGrupo: string,
  pais: string,
): CampoPersonalizadoDefinicion[] {
  return definiciones
    .filter((c) => c.formulario === formulario && c.activo)
    .filter((c) => c.empresaGrupo === "" || c.empresaGrupo === empresaGrupo)
    .filter((c) => c.pais === "" || c.pais === pais)
    .sort((a, b2) => a.orden - b2.orden);
}

export function camposPorSeccion(
  campos: CampoPersonalizadoDefinicion[],
): Record<string, CampoPersonalizadoDefinicion[]> {
  const agrupado: Record<string, CampoPersonalizadoDefinicion[]> = {};
  for (const c of campos) {
    (agrupado[c.seccion || "General"] ??= []).push(c);
  }
  return agrupado;
}

function aplicarOperador(op: OperadorCalculado, a: number, b2: number): number {
  switch (op) {
    case "suma":
      return a + b2;
    case "resta":
      return a - b2;
    case "multiplicacion":
      return a * b2;
    case "division":
      return b2 === 0 ? 0 : a / b2;
  }
}

/**
 * Calcula el valor de un campo de tipo "calculado" a partir de un mapa de
 * valores disponibles (campos personalizados ya capturados + campos
 * originales del documento, según lo que el formulario le pase).
 */
export function calcularValorCampo(
  campo: CampoPersonalizadoDefinicion,
  valoresDisponibles: Record<string, unknown>,
): number {
  if (campo.tipo !== "calculado" || !campo.calculadoOperador) return 0;
  const a = Number(valoresDisponibles[campo.calculadoCampoA] ?? 0) || 0;
  const b2 = Number(valoresDisponibles[campo.calculadoCampoB] ?? 0) || 0;
  return aplicarOperador(campo.calculadoOperador, a, b2);
}

export function valorPorDefectoCampo(campo: CampoPersonalizadoDefinicion): unknown {
  switch (campo.tipo) {
    case "booleano":
      return false;
    case "numero":
    case "calculado":
      return 0;
    default:
      return "";
  }
}
