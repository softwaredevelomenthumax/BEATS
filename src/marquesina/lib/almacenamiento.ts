// Persistencia local del código del evento — confirmado en el bundle
// original: `localStorage` con la clave `beats_marquesina_codigo`, para que
// una pantalla de kiosco no vuelva a pedir el código cada vez que se
// recarga o se reinicia el dispositivo.
const CLAVE = "beats_marquesina_codigo";

export function guardarCodigo(codigo: string): void {
  try {
    localStorage.setItem(CLAVE, codigo);
  } catch {
    // Almacenamiento no disponible — sigue funcionando en memoria durante esta misma carga de página.
  }
}

export function leerCodigoGuardado(): string | null {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

export function borrarCodigoGuardado(): void {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    // ignorado
  }
}
