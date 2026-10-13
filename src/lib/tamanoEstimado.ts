import { construirCSV } from "@/lib/csv";
import { supabase } from "@/lib/supabaseClient";

/**
 * Entrega 31 (octubre 2026): tamaño estimado de los archivos que la app va a
 * generar, para mostrarlo ANTES de pulsar el botón de descarga.
 *  - CSV: se arma el mismo texto que se descargará y se mide (exacto, en UTF-8).
 *  - PDF: aproximación (base + filas + imágenes embebidas); el tamaño real
 *    depende del navegador y del contenido, por eso siempre se rotula «≈».
 *  - Expediente HTML: estilos + formularios + archivos adjuntos en base64
 *    (+33 %), con los tamaños reales leídos de `archivos_adjuntos.tamano_bytes`.
 */

/** Bytes UTF-8 de un texto. */
export function bytesDeTexto(texto: string): number {
  return new TextEncoder().encode(texto).length;
}

/** Bytes que ocupa un archivo de `bytes` bytes una vez codificado en base64 dentro de un HTML. */
export const bytesEnBase64 = (bytes: number) => Math.ceil((bytes * 4) / 3);

/** Tamaño exacto del CSV que se descargaría con estos encabezados y filas. */
export function bytesDeCsv(encabezados: string[], filas: unknown[][]): number {
  return bytesDeTexto(construirCSV(encabezados, filas));
}

/** «≈ 12 KB», «≈ 2,4 MB» (separador decimal en español). */
export function etiquetaTamano(bytes: number): string {
  const aprox = "≈ ";
  if (!Number.isFinite(bytes) || bytes <= 0) return `${aprox}0 KB`;
  if (bytes < 1024) return `${aprox}1 KB`;
  if (bytes < 1024 * 1024) return `${aprox}${Math.round(bytes / 1024).toLocaleString("es-CO")} KB`;
  return `${aprox}${(bytes / (1024 * 1024)).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
}

/** Aproximación del tamaño de un PDF de tablas/formularios: base + texto por fila + imágenes (p. ej. firmas). */
export function estimarBytesPdf(opciones: { filas?: number; imagenesBytes?: number; paginas?: number } = {}): number {
  const { filas = 0, imagenesBytes = 0, paginas = 1 } = opciones;
  return 40 * 1024 + paginas * 18 * 1024 + filas * 900 + imagenesBytes;
}

/** Tamaños (bytes) de archivos de `archivos_adjuntos` sin descargar su contenido. */
export async function traerTamanosArchivos(ids: string[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  const unicos = Array.from(new Set(ids.filter(Boolean)));
  for (let i = 0; i < unicos.length; i += 100) {
    const tanda = unicos.slice(i, i + 100);
    const { data, error } = await supabase.from("archivos_adjuntos").select("id, tamano_bytes").in("id", tanda);
    if (error) throw new Error(error.message);
    for (const fila of data ?? []) mapa.set(fila.id as string, Number(fila.tamano_bytes ?? 0));
  }
  return mapa;
}
