/**
 * Entrega 31 (octubre 2026): normalización de texto compartida por todas las apps.
 *  - Ejecución en sitio: todo lo que se escribe va en MAYÚSCULAS.
 *  - Correos: siempre en minúscula y sin espacios.
 * Se normaliza al teclear (los componentes `InputMayuscula`/`InputEmail`) Y otra vez al
 * guardar/enviar, para que un dato escrito de otra forma (o encolado antes de este cambio)
 * quede igual y NO cuente como un dato distinto/duplicado.
 */

export const aMayusculas = (texto: string): string => texto.toLocaleUpperCase("es");

/** Correo canónico: sin espacios y en minúscula. */
export const normalizarEmail = (texto: string | null | undefined): string => (texto ?? "").replace(/\s+/g, "").toLocaleLowerCase("en");

/** Máscara mínima de correo: algo@dominio.ext, sin espacios. */
export const esEmailValido = (texto: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(texto.trim());

/** Clave para comparar/agrupar texto sin que mayúsculas, tildes o espacios de más creen «duplicados». */
export const claveTexto = (texto: string | null | undefined): string =>
  (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("es");
