/**
 * AJUSTES (septiembre/octubre 2026), pedido explícito: tanto al exportar un
 * documento a PDF/impresión (botón "Imprimir / Exportar a PDF") como al
 * subir un archivo adjunto (RETHUS, hoja de vida de speaker, foto, soportes
 * de un evento, etc.), el sistema debe sugerir/usar un nombre de archivo
 * "basado en una sintaxis o estructura lógica, considerando el nombre del
 * documento, tipo, fecha", con la forma aproximada:
 *
 *   [Tipo_Formulario(abreviado)]_[Nombre_Evento_o_HCP]_[FECHA]_[CONSECUTIVO_O_ID].[extension]
 *
 * "en minúscula, pero iniciando la primera letra con mayúscula" — es decir,
 * todo el nombre en minúsculas salvo la primera letra del archivo completo,
 * que va en mayúscula (estilo "oración"), sin tocar la extensión (que
 * siempre se deja en minúscula, como pide el mismo punto).
 *
 * Este utilitario centraliza esa construcción para que el botón de imprimir
 * (`DocumentoImprimible.tsx`, vía `document.title` antes de `window.print()`)
 * y las subidas de archivos (`lib/archivosAdjuntos.ts` y quien lo use) usen
 * exactamente la misma convención.
 */

import { formatearFecha } from "@/lib/fecha";
import type { TipoDoc } from "@/lib/enums";

/** Abreviación corta por tipo de documento, para el prefijo del nombre de archivo. */
export const ABREVIATURA_TIPO_DOC: Record<TipoDoc, string> = {
  evento: "Evento",
  convenio: "Convenio",
  fmv: "Fmv",
  notificacionPago: "NotifPago",
  caf: "Caf",
  convenioHCP: "ConvHcp",
};

/**
 * Quita acentos/diacríticos, reemplaza cualquier caracter que no sea
 * alfanumérico por "_", colapsa guiones bajos repetidos y recorta los de
 * los extremos. Deja el resultado en minúsculas (el "sentence case" final
 * se aplica una sola vez, sobre el nombre completo, en
 * `construirNombreSugerido`).
 */
function normalizarSegmento(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Pone en mayúscula solo la primera letra de la cadena; el resto, tal cual (ya en minúsculas). */
function primeraLetraMayuscula(valor: string): string {
  if (!valor) return valor;
  return valor.charAt(0).toUpperCase() + valor.slice(1);
}

/**
 * Construye el nombre de archivo sugerido (sin extensión) a partir del tipo
 * de documento, un nombre descriptivo (evento, HCP/speaker, tipo de
 * adjunto, etc.), una fecha y un identificador/consecutivo. Cualquier
 * segmento vacío u omitido se descarta en vez de dejar un "_" suelto.
 */
export function construirNombreBase(partes: {
  tipo?: TipoDoc | string;
  nombre?: string | null;
  fecha?: string | number | Date | null;
  idConsecutivo?: string | null;
}): string {
  const segmentos: string[] = [];

  if (partes.tipo) {
    const abreviatura = (ABREVIATURA_TIPO_DOC as Record<string, string>)[partes.tipo] ?? String(partes.tipo);
    segmentos.push(normalizarSegmento(abreviatura));
  }
  if (partes.nombre) {
    segmentos.push(normalizarSegmento(partes.nombre));
  }
  if (partes.fecha != null && partes.fecha !== "") {
    segmentos.push(normalizarSegmento(formatearFecha(partes.fecha)));
  }
  if (partes.idConsecutivo) {
    // Para UUIDs largos, basta con un fragmento corto para identificar el
    // archivo sin producir nombres kilométricos.
    const id = String(partes.idConsecutivo).replace(/-/g, "");
    segmentos.push(normalizarSegmento(id.slice(0, 8) || id));
  }

  const base = segmentos.filter(Boolean).join("_") || "documento";
  return primeraLetraMayuscula(base);
}

/** Igual que `construirNombreBase`, pero agrega la extensión (siempre en minúscula) al final. */
export function construirNombreSugerido(
  partes: Parameters<typeof construirNombreBase>[0] & { extension: string },
): string {
  const base = construirNombreBase(partes);
  const extension = partes.extension.replace(/^\./, "").toLowerCase();
  return `${base}.${extension}`;
}
