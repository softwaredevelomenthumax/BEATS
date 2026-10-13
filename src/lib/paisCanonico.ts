import { isoDePais, nombreDePais, norm } from "@/lib/geo/geo";

/**
 * Entrega 39 — los países se guardan y se muestran en ESPAÑOL («Estados Unidos»), pero algunas listas (la tabla
 * `paises_region`, datos importados) pueden traerlos en inglés («United States»). Estas funciones llevan cualquier
 * variante (español, inglés, alias como «EE. UU.» o «USA») al nombre en español del catálogo, para que los filtros
 * de país ofrezcan nombres en español y comparen por país y no por texto exacto.
 */

/** Nombre en español del país (si se reconoce); si no, el texto original sin espacios sobrantes. «N/A» y vacíos se respetan. */
export function paisCanonico(pais: string | null | undefined): string {
  const texto = (pais ?? "").trim();
  if (!texto) return "";
  const iso = isoDePais(texto);
  return iso ? nombreDePais(iso) : texto;
}

/** ¿Son el mismo país aunque uno esté en inglés, con otra tilde o con otra mayúscula? */
export function mismoPais(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = paisCanonico(a);
  const y = paisCanonico(b);
  if (!x || !y) return x === y;
  return norm(x) === norm(y);
}

/** Lista de países para un filtro: en español, sin repetidos y en orden alfabético. */
export function paisesParaFiltro(paises: Iterable<string | null | undefined>): string[] {
  const porClave = new Map<string, string>();
  for (const p of paises) {
    const c = paisCanonico(p);
    if (c && !porClave.has(norm(c))) porClave.set(norm(c), c);
  }
  return [...porClave.values()].sort((a, b) => a.localeCompare(b, "es"));
}
