// Persistencia local de la sesión de ejecución activa — mismo patrón que
// usará `marquesina.html` (Fase 8) con su código en localStorage, para que
// una tableta en el sitio del evento no pierda el contexto (token, datos
// del evento) si se recarga la página o se queda sin batería un momento.
import type { SesionEjecucionActiva } from "./rpc";

const CLAVE = "beats_ejecucion_sesion";

export function guardarSesion(sesion: SesionEjecucionActiva): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(sesion));
  } catch {
    // Almacenamiento no disponible (modo privado, cuota agotada, etc.) — la
    // sesión sigue funcionando en memoria durante esta misma carga de página.
  }
}

export function leerSesionGuardada(): SesionEjecucionActiva | null {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return null;
    return JSON.parse(crudo) as SesionEjecucionActiva;
  } catch {
    return null;
  }
}

export function borrarSesionGuardada(): void {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    // ignorado
  }
}
