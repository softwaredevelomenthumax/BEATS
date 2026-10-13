import { supabase } from "@/lib/supabaseClient";
import { rowToFlat, t, type FieldSpec } from "@/lib/dbMapping";
import type { DocumentoResumen } from "@/types";

const CAMPOS_DOCUMENTO_RESUMEN: FieldSpec[] = [
  t("id"),
  t("tipo_doc", "tipoDoc"),
  t("estado"),
  t("creado_por_id", "creadoPorId"),
  t("creado_en", "creadoEn"),
  t("nombre"),
];

/**
 * Trae el listado unificado de los 6 tipos de documento desde la vista
 * `v_documentos`. La vista no expone más de 1000 filas por página, pero en
 * la práctica el volumen de documentos de BEATS está muy por debajo de eso;
 * se pagina de todas formas para no romperse si crece.
 */
export async function traerDocumentosResumen(): Promise<DocumentoResumen[]> {
  const filas: DocumentoResumen[] = [];
  const TAMANO_PAGINA = 1000;
  let desde = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("v_documentos")
      .select("*")
      .order("creado_en", { ascending: false })
      .range(desde, desde + TAMANO_PAGINA - 1);
    if (error) throw error;
    const pagina = (data ?? []).map((fila) => rowToFlat<DocumentoResumen>(fila, CAMPOS_DOCUMENTO_RESUMEN));
    filas.push(...pagina);
    if (pagina.length < TAMANO_PAGINA) break;
    desde += TAMANO_PAGINA;
  }
  return filas;
}
