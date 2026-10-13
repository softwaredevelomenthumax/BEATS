/**
 * Entrega 32 — máscara de VISUALIZACIÓN para la ubicación de eventos virtuales.
 *
 * Un evento virtual se guarda con ciudad/estado/país = "N/A" (ver
 * `FormularioEvento`). Eso es un valor interno: la base de datos NO cambia.
 * Al mostrarlo en pantallas, informes e impresos, "N/A, N/A" se lee como un
 * error, así que se presenta como "Virtual".
 */
const ES_NA = /^\s*(n\/?a|no aplica)\s*$/i;

export const esValorNA = (v: string | null | undefined): boolean => ES_NA.test(v ?? "");

/** Un campo suelto: "N/A" → "Virtual"; cualquier otro valor queda igual. */
export const mascaraVirtual = (v: string | null | undefined): string => (esValorNA(v) ? "Virtual" : (v ?? ""));

/**
 * Une partes de una ubicación ("Bogotá", "Colombia"). Las partes "N/A" se
 * colapsan en un único "Virtual" y se descartan las vacías. Si la dirección ya
 * dice "Virtual" no se repite.
 */
export function ubicacionTexto(partes: Array<string | null | undefined>, separador = ", "): string {
  const salida: string[] = [];
  let virtual = false;
  for (const p of partes) {
    const t = (p ?? "").trim();
    if (!t) continue;
    if (esValorNA(t) || /^virtual$/i.test(t)) { virtual = true; continue; }
    salida.push(t);
  }
  if (virtual) salida.unshift("Virtual");
  return salida.join(separador);
}
