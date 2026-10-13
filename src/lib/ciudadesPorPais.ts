import * as React from "react";
import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";

/**
 * Ronda de instrucciones históricas (cluster A, A2/A20): catálogo real
 * país→ciudad para los selectores dependientes de país/ciudad en los
 * formularios. Confirmado por el esquema real de la base de datos — la
 * tabla `paises_region_ciudades` (`pais_region_id` → `paises_region.id`,
 * `ciudad`, `orden`) YA EXISTE en el proyecto de Supabase real, pero está
 * vacía (0 filas en el respaldo de datos reales) — nunca se pobló ni se
 * conectó a ningún formulario. Esto explica la nota "catálogo de ciudades
 * roto" del diagnóstico: no es un bug de código, es un catálogo que nunca
 * tuvo datos ni una pantalla para cargarlos. Esta ronda construye ambas
 * cosas: la lectura/escritura aquí, el editor de administración en
 * `EditorCiudadesPorPais.tsx`, y el selector dependiente `<SelectPaisCiudad>`
 * usado en los formularios. Hasta que un administrador cargue ciudades para
 * un país (vía el nuevo editor), el selector de ciudad de ese país
 * simplemente no tendrá opciones — se muestra un mensaje explícito en vez
 * de dejarlo en blanco sin explicación.
 */

export interface PaisConId {
  id: string;
  pais: string;
  region: string;
}

export interface CiudadPais {
  id: string;
  paisRegionId: string;
  ciudad: string;
  orden: number;
}

export async function traerPaisesConId(): Promise<PaisConId[]> {
  const { data, error } = await supabase
    .from("paises_region")
    .select("*")
    .order("pais", { ascending: true });
  if (error) throw new Error(mensajeErrorAmigable(error));
  return (data ?? []).map((f) => ({ id: f.id as string, pais: f.pais as string, region: f.region as string }));
}

async function traerTodasLasCiudades(): Promise<CiudadPais[]> {
  const { data, error } = await supabase
    .from("paises_region_ciudades")
    .select("*")
    .order("orden", { ascending: true });
  if (error) throw new Error(mensajeErrorAmigable(error));
  return (data ?? []).map((f) => ({
    id: f.id as string,
    paisRegionId: f.pais_region_id as string,
    ciudad: f.ciudad as string,
    orden: f.orden as number,
  }));
}

/**
 * Trae el mapa completo país (nombre) → ciudades, ya unido en memoria —
 * mismo criterio de "volumen pequeño, se trae todo y se filtra en el
 * cliente" que `catalogo_valores`. Usado tanto por el selector dependiente
 * como por el editor de administración.
 */
export async function traerMapaCiudadesPorPais(): Promise<{ paises: PaisConId[]; ciudadesPorPaisId: Map<string, CiudadPais[]> }> {
  const [paises, ciudades] = await Promise.all([traerPaisesConId(), traerTodasLasCiudades()]);
  const ciudadesPorPaisId = new Map<string, CiudadPais[]>();
  for (const c of ciudades) {
    const lista = ciudadesPorPaisId.get(c.paisRegionId);
    if (lista) lista.push(c);
    else ciudadesPorPaisId.set(c.paisRegionId, [c]);
  }
  return { paises, ciudadesPorPaisId };
}

export async function crearCiudad(paisRegionId: string, ciudad: string, orden: number): Promise<CiudadPais> {
  const { data, error } = await supabase
    .from("paises_region_ciudades")
    .insert({ pais_region_id: paisRegionId, ciudad: ciudad.trim(), orden })
    .select("*")
    .single();
  if (error) throw new Error(mensajeErrorAmigable(error));
  return { id: data.id, paisRegionId: data.pais_region_id, ciudad: data.ciudad, orden: data.orden };
}

export async function eliminarCiudad(id: string): Promise<void> {
  const { error } = await supabase.from("paises_region_ciudades").delete().eq("id", id);
  if (error) throw new Error(mensajeErrorAmigable(error));
}

/**
 * Hook que expone el catálogo completo ya resuelto — los formularios lo
 * consumen una vez y derivan de ahí tanto la lista de países como, para el
 * país ya elegido, la lista de ciudades disponibles.
 */
export function useCiudadesPorPais(): {
  paises: PaisConId[];
  ciudadesDe: (nombrePais: string) => string[];
  cargando: boolean;
} {
  const [estado, setEstado] = React.useState<{ paises: PaisConId[]; ciudadesPorPaisId: Map<string, CiudadPais[]> }>({
    paises: [],
    ciudadesPorPaisId: new Map(),
  });
  const [cargando, setCargando] = React.useState(true);

  React.useEffect(() => {
    let cancelado = false;
    traerMapaCiudadesPorPais()
      .then((r) => { if (!cancelado) setEstado(r); })
      .catch((error) => console.error(mensajeErrorAmigable(error)))
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, []);

  const ciudadesDe = React.useCallback(
    (nombrePais: string): string[] => {
      const pais = estado.paises.find((p) => p.pais === nombrePais);
      if (!pais) return [];
      return (estado.ciudadesPorPaisId.get(pais.id) ?? []).map((c) => c.ciudad);
    },
    [estado],
  );

  return { paises: estado.paises, ciudadesDe, cargando };
}
