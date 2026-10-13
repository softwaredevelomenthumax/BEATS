import { rowToFlat } from "@/lib/dbMapping";
import { CAMPOS, type CampoPersonalizadoDefinicion } from "@/lib/camposPersonalizados";
import type { EtiquetaCampo } from "@/lib/etiquetasCampo";

/**
 * Parseo del snapshot `snapshot_formato` (jsonb) congelado por el trigger de
 * `db/agregar_inmutabilidad_documentos_firmados.sql` al momento en que un
 * documento pasa a `estado` 'Aprobado'/'Completado' — pedido explícito del
 * usuario: "si por alguna razón un documento se firmó con unos campos,
 * etiquetas, etc y en un tiempo posterior, el formato se actualiza ... los
 * formularios que fueron firmados antes de esos cambios, deben permanecer
 * fijos, sin cambios."
 *
 * El snapshot guarda las filas CRUDAS (snake_case, `to_jsonb(row)`) de
 * `etiquetas_campo`/`campos_personalizados_definicion`, no el resultado ya
 * calculado — este archivo las convierte al mismo shape camelCase que usan
 * `etiquetaEfectiva`/`camposAplicables` en vivo, reutilizando exactamente el
 * mismo mapeo (`traerEtiquetasCampo()` acá abajo a mano, y `CAMPOS`/
 * `rowToFlat` de `camposPersonalizados.ts`), para no duplicar esa lógica.
 */
export interface SnapshotFormato {
  etiquetas: EtiquetaCampo[];
  camposPersonalizados: CampoPersonalizadoDefinicion[];
  congeladoEn: string;
}

/**
 * Mismo mapeo fila→objeto que `traerEtiquetasCampo()` en
 * `src/lib/etiquetasCampo.ts` — se replica acá (en vez de importarlo) porque
 * esa función trae las filas desde Supabase; aquí ya las tenemos en memoria,
 * dentro del jsonb del snapshot.
 */
function filaAEtiquetaCampo(fila: Record<string, unknown>): EtiquetaCampo {
  return {
    formulario: fila.formulario as EtiquetaCampo["formulario"],
    campoKey: fila.campo_key as string,
    etiqueta: fila.etiqueta as string,
    empresaGrupo: (fila.empresa_grupo as string) ?? "",
    actualizadoPorId: (fila.actualizado_por_id as string | null) ?? null,
    actualizadoEn: fila.actualizado_en as string,
  };
}

/**
 * Convierte el jsonb crudo de `snapshot_formato` (ya deserializado por el
 * cliente de Supabase — nunca hace falta `JSON.parse`) al shape tipado que
 * consumen `CuerpoEvento`/`CuerpoCAF`/etc. Defensivo a propósito: un
 * snapshot ausente, nulo o malformado nunca debe romper el render — en ese
 * caso se devuelve `null` y quien llama cae de vuelta a la configuración en
 * vivo (`etiquetasVivas`/`camposVivos`).
 */
export function parsearSnapshotFormato(raw: unknown): SnapshotFormato | null {
  if (raw == null) return null;
  try {
    const obj = raw as Record<string, unknown>;
    const etiquetasRaw = Array.isArray(obj.etiquetas) ? obj.etiquetas : [];
    const camposRaw = Array.isArray(obj.camposPersonalizados) ? obj.camposPersonalizados : [];
    return {
      etiquetas: etiquetasRaw.map((fila) => filaAEtiquetaCampo(fila as Record<string, unknown>)),
      camposPersonalizados: camposRaw.map((fila) =>
        rowToFlat<CampoPersonalizadoDefinicion>(fila as Record<string, unknown>, CAMPOS),
      ),
      congeladoEn: (obj.congeladoEn as string) ?? "",
    };
  } catch {
    return null;
  }
}

/**
 * Patrón de uso en cada `Detalle*.tsx` (vista compacta e impresión, NUNCA en
 * el formulario de edición — ese sigue viendo la configuración en vivo
 * mientras el documento no está congelado):
 *
 *   const snapshot = parsearSnapshotFormato(doc.snapshotFormato);
 *   const etiquetasEfectivas = snapshot?.etiquetas ?? etiquetasVivas;
 *   const camposEfectivos = snapshot?.camposPersonalizados ?? camposVivos;
 */
