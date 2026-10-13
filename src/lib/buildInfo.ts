/**
 * Datos de la compilación (versión y fecha/hora de creación del bundle).
 * `scripts/generar_bundle.mjs` los inyecta en el <head> del HTML final como
 * `window.__BEATS_BUILD__` (la versión sale del archivo `VERSION` de la raíz).
 * En desarrollo (sin bundle) no existen y se muestra "desarrollo".
 */
export interface InfoBuild {
  version: string;
  /** ISO 8601 (UTC) del momento en que se generó el bundle. */
  creadoEn: string;
}

export function infoBuild(): InfoBuild | null {
  const b = (globalThis as { __BEATS_BUILD__?: InfoBuild }).__BEATS_BUILD__;
  return b && b.version && b.creadoEn ? b : null;
}

/** "v14.8 · 05/10/2026 15:07 (hora de Colombia)" */
export function textoBuild(): string {
  const b = infoBuild();
  if (!b) return "Versión: desarrollo (sin bundle)";
  const fecha = new Date(b.creadoEn);
  const partes = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(fecha);
  return `Versión ${b.version} · creado el ${partes} (hora de Colombia)`;
}
