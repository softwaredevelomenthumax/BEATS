import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";
import { paisesParaFiltro } from "@/lib/paisCanonico";

/**
 * Lectura mínima de `paises_region` — la lista real de países donde opera
 * el grupo, usada como fuente del multi-selector "Países de operación" en
 * Usuarios y Roles. El resto de esta tabla (región, `paises_region_ciudades`)
 * alimenta el mapa de "Eventos en Vivo" (Fase 6) — no se reconstruye aquí.
 */
export async function traerPaises(): Promise<string[]> {
  const { data, error } = await supabase.from("paises_region").select("pais").order("pais", { ascending: true });
  if (error) throw new Error(mensajeErrorAmigable(error));
  // Entrega 39: siempre en español y sin repetidos, aunque la tabla traiga algún nombre en inglés.
  return paisesParaFiltro((data ?? []).map((f) => f.pais as string));
}

/**
 * Octubre 2026: lista fija de "Países de operación" (selector de Usuarios y
 * Roles), en orden alfabético. Ya no sale de la tabla `paises_region` (que
 * sigue alimentando filtros e informes).
 */
export const PAISES_OPERACION: string[] = [
  "Canadá", "Estados Unidos", "México", "Belice", "Costa Rica", "El Salvador", "Guatemala", "Honduras", "Nicaragua", "Panamá",
  "Antigua y Barbuda", "Bahamas", "Barbados", "Cuba", "Dominica", "Granada", "Haití", "Jamaica", "República Dominicana",
  "San Cristóbal y Nieves", "San Vicente y las Granadinas", "Santa Lucía", "Trinidad y Tobago", "Argentina", "Bolivia", "Brasil",
  "Chile", "Colombia", "Ecuador", "Guyana", "Paraguay", "Perú", "Surinam", "Uruguay", "Venezuela", "Puerto Rico",
].sort((a, b) => a.localeCompare(b, "es"));
