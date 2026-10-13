/**
 * Regla compartida de Evento y Convenio de Pago a HCP para el patrón
 * "Organizado por (desplegable) + Nombre del organizador (condicional)"
 * (ronda de instrucciones históricas, cluster A — A7).
 *
 * El catálogo real `organizadoPorConvenio` (editable ahora desde
 * Configuración de Campos, ver EditorCatalogosSimples) no siempre incluye
 * un valor literal "Otro": la organización lo modela hoy como "Tercero "
 * (con espacio final, dato real de producción). Para no atarnos a un solo
 * texto exacto que un futuro editor podría reescribir con otra
 * capitalización o sin el espacio, cualquiera de las variantes de abajo
 * (sin distinguir mayúsculas ni espacios en los extremos) dispara el campo
 * condicional.
 *
 * AJUSTES (septiembre/octubre 2026), pedido explícito: antes de esta ronda
 * solo "Otro"/"Tercero" activaban "Nombre del organizador" — el adjunto
 * agrega "Sociedad Médica / Científica" e "Institución Académica" a esa
 * misma lista (las 4 opciones que, a diferencia de las empresas del grupo
 * ya identificadas del catálogo, necesitan identificarse por nombre).
 */
const VALORES_ORGANIZADO_POR_OTRO = new Set([
  "otro",
  "tercero",
  "sociedad médica / científica",
  "institución académica",
]);

export function esOrganizadoPorOtro(valorOrganizadoPor: string): boolean {
  return VALORES_ORGANIZADO_POR_OTRO.has(valorOrganizadoPor.trim().toLowerCase());
}
