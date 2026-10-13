import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";
import type { TipoDoc } from "@/lib/enums";

export interface EtiquetaCampo {
  formulario: TipoDoc;
  campoKey: string;
  etiqueta: string;
  empresaGrupo: string;
  actualizadoPorId: string | null;
  actualizadoEn: string;
}

export async function traerEtiquetasCampo(): Promise<EtiquetaCampo[]> {
  const { data, error } = await supabase.from("etiquetas_campo").select("*");
  if (error) throw new Error(mensajeErrorAmigable(error));
  return (data ?? []).map((fila) => ({
    formulario: fila.formulario,
    campoKey: fila.campo_key,
    etiqueta: fila.etiqueta,
    empresaGrupo: fila.empresa_grupo ?? "",
    actualizadoPorId: fila.actualizado_por_id,
    actualizadoEn: fila.actualizado_en,
  }));
}

export async function guardarEtiquetaCampo(
  etiqueta: EtiquetaCampo,
  actorId: string,
): Promise<void> {
  const { error } = await supabase.from("etiquetas_campo").upsert(
    {
      formulario: etiqueta.formulario,
      campo_key: etiqueta.campoKey,
      etiqueta: etiqueta.etiqueta,
      empresa_grupo: etiqueta.empresaGrupo,
      actualizado_por_id: actorId,
      actualizado_en: new Date().toISOString(),
    },
    { onConflict: "formulario,campo_key,empresa_grupo" },
  );
  if (error) throw new Error(mensajeErrorAmigable(error));
}

export async function eliminarEtiquetaCampo(etiqueta: Pick<EtiquetaCampo, "formulario" | "campoKey" | "empresaGrupo">): Promise<void> {
  const { error } = await supabase
    .from("etiquetas_campo")
    .delete()
    .eq("formulario", etiqueta.formulario)
    .eq("campo_key", etiqueta.campoKey)
    .eq("empresa_grupo", etiqueta.empresaGrupo);
  if (error) throw new Error(mensajeErrorAmigable(error));
}

/**
 * Resuelve la etiqueta efectiva de un campo original: una etiqueta
 * específica de empresa gana sobre una etiqueta global (empresaGrupo ""),
 * que a su vez gana sobre la etiqueta por defecto que trae el formulario.
 */
export function etiquetaEfectiva(
  etiquetas: EtiquetaCampo[],
  formulario: TipoDoc,
  campoKey: string,
  empresaGrupo: string,
  etiquetaPorDefecto: string,
): string {
  const especifica = etiquetas.find(
    (e) => e.formulario === formulario && e.campoKey === campoKey && e.empresaGrupo === empresaGrupo,
  );
  if (especifica) return especifica.etiqueta;
  const global = etiquetas.find(
    (e) => e.formulario === formulario && e.campoKey === campoKey && e.empresaGrupo === "",
  );
  if (global) return global.etiqueta;
  return etiquetaPorDefecto;
}
