/**
 * Rediseño de la ventana "Convenio HCP" (septiembre 2026): helper compartido
 * de formato de montos de dinero — pedido explícito de la especificación
 * ("en todos los campos que incluyan montos de dinero (moneda), al final
 * del número debe incluirse la moneda... con los respectivos separadores de
 * miles y decimales... p. ej: $1.000.000,00 COP"). No existía ningún helper
 * de este tipo en el proyecto (se buscó `toLocaleString`/`Intl.NumberFormat`
 * en `src/lib` y `src/components` sin encontrar nada reutilizable) — se
 * agrega aquí, deliberadamente pequeño, para poder reutilizarlo en otros
 * documentos más adelante sin repetir esta lógica.
 *
 * Se usa el locale `es-CO` a propósito para el formato de separadores (punto
 * de miles, coma decimal, como en el ejemplo del usuario) — independiente de
 * la moneda elegida: la especificación pide ESE formato de separadores para
 * cualquier moneda, no el formato nativo de cada una (que variaría entre
 * "1,000,000.00" y "1.000.000,00" según la moneda/locale, generando
 * inconsistencia visual entre campos del mismo documento).
 */
export function formatearMonto(valor: number | null | undefined, moneda: string): string {
  if (valor == null || Number.isNaN(valor)) return "—";
  const numero = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor);
  const sufijoMoneda = moneda?.trim();
  return sufijoMoneda ? `$${numero} ${sufijoMoneda}` : `$${numero}`;
}
