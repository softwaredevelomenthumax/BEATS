// Construcción y descarga de CSV a mano — confirmado en el bundle original
// que no hay ninguna librería de CSV/exportación (ver notas del plan de
// reconstrucción): siempre `Blob` + un enlace `<a>` temporal disparando la
// descarga del navegador, nunca `window.open` ni un endpoint de servidor.

/** Escapa una celda para CSV (RFC 4180): comillas dobles si contiene coma, comilla o salto de línea. */
function celdaCSV(valor: unknown): string {
  const texto = valor == null ? "" : String(valor);
  if (/[",\n]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

/** Arma el contenido CSV completo (con BOM UTF-8, para que Excel abra bien las tildes) a partir de encabezados + filas. */
export function construirCSV(encabezados: string[], filas: unknown[][]): string {
  const lineas = [encabezados, ...filas].map((fila) => fila.map(celdaCSV).join(","));
  return "﻿" + lineas.join("\r\n");
}

/** Dispara la descarga de un archivo CSV ya construido, con el nombre indicado. */
export function descargarCSV(nombreArchivo: string, contenidoCSV: string): void {
  const blob = new Blob([contenidoCSV], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivo.endsWith(".csv") ? nombreArchivo : `${nombreArchivo}.csv`;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}
