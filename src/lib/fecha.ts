/**
 * AJUSTES (septiembre/octubre 2026), pedido explícito: "Armoniza el formato
 * de fechas en toda la aplicación para que sea 'YYYY-MM-DD'. Cuando además
 * lleve hora, el formato debe ser: 'YYYY-MM-DD HH:mm:ss'".
 *
 * Antes de este archivo no existía ningún utilitario compartido de fechas
 * — cada pantalla llamaba `toLocaleDateString`/`toLocaleString`/
 * `toLocaleTimeString` por su cuenta, casi siempre con `"es-CO"` y estilos
 * distintos ("15 ene 2026", "15/01/2026", etc.). Estas dos funciones
 * reemplazan todos esos llamados sueltos.
 *
 * ÚNICA EXCEPCIÓN A PROPÓSITO (no se toca con este utilitario): el pie de
 * página oficial de la vista de impresión/PDF (`PiePaginaOficial` en
 * `DocumentoImprimible.tsx`), que el mismo lote de ajustes pide en formato
 * humano explícito ("30 de sept de 2026, 22:01") — un ejemplo literal
 * distinto al de este archivo, así que se entiende como la excepción
 * puntual de ese único lugar, no como una contradicción con la regla
 * general de arriba.
 *
 * Manejo de zona horaria: muchos campos de la app guardan solo la FECHA
 * (sin hora) como texto `"YYYY-MM-DD"` (selectores de fecha de los
 * formularios). Convertir ese texto con `new Date(...)` e interpretarlo
 * como una fecha/hora UTC puede desplazar un día hacia atrás al formatear
 * en una zona horaria con offset negativo. Por eso, si el valor de entrada
 * YA viene en ese formato exacto, se devuelve tal cual (ya es el formato
 * pedido) en vez de pasar por `Date` — solo los valores con hora real
 * (timestamps `creadoEn`, `ocurridoEn`, etc.) se parsean como `Date`.
 */

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function dosDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

/** Formatea una fecha (con o sin hora) a "YYYY-MM-DD". Devuelve "—" si no hay valor o es inválido. */
export function formatearFecha(valor: string | number | Date | null | undefined): string {
  if (valor == null || valor === "") return "—";
  if (typeof valor === "string" && SOLO_FECHA.test(valor)) return valor;
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;
}

/** Formatea una fecha con hora a "YYYY-MM-DD HH:mm:ss". Devuelve "—" si no hay valor o es inválido. */
export function formatearFechaHora(valor: string | number | Date | null | undefined): string {
  if (valor == null || valor === "") return "—";
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return "—";
  const fecha =
    typeof valor === "string" && SOLO_FECHA.test(valor)
      ? valor
      : `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;
  return `${fecha} ${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}:${dosDigitos(d.getSeconds())}`;
}
