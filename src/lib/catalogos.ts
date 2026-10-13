import * as React from "react";
import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";
import type { CatalogoSimple } from "@/lib/enums";

export interface ValorCatalogo {
  id: string;
  catalogo: CatalogoSimple;
  valor: string;
  orden: number;
}

/**
 * `catalogo_valores` reemplaza los antiguos arreglos hardcodeados de
 * opciones (empresas del grupo, tipos de evento, monedas, etc.) por un
 * catálogo editable desde la base de datos, agrupado por el enum
 * `catalogo_simple`. Se trae una sola vez y se filtra en memoria por
 * catálogo — el volumen total es pequeño (unas pocas decenas de filas).
 */
export async function traerCatalogos(): Promise<ValorCatalogo[]> {
  const { data, error } = await supabase
    .from("catalogo_valores")
    .select("*")
    .order("catalogo", { ascending: true })
    .order("orden", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((fila) => ({
    id: fila.id,
    catalogo: fila.catalogo,
    valor: fila.valor,
    orden: fila.orden,
  }));
}

// Corrección (septiembre 2026), pedido explícito del usuario: "en todas las
// listas desplegables que tengas configuradas, garantiza que la
// información/datos aparezcan en orden alfabético" — antes el orden en
// pantalla venía de la columna `orden` (el orden en que se fueron
// agregando los valores, editable arrastrando/moviendo en el editor). Se
// sigue guardando `orden` (útil para mover valores en el editor y como
// desempate estable), pero lo que ve el usuario en cualquier desplegable
// del formulario ahora siempre se ordena alfabéticamente en español
// (`localeCompare` con la config "es", sensible a acentos/mayúsculas de
// forma natural).
export function ordenAlfabetico(a: string, b: string): number {
  return a.localeCompare(b, "es", { sensitivity: "base" });
}

export function agruparPorCatalogo(valores: ValorCatalogo[]): Record<string, string[]> {
  const agrupado: Record<string, string[]> = {};
  for (const v of valores) {
    (agrupado[v.catalogo] ??= []).push(v.valor);
  }
  for (const catalogo of Object.keys(agrupado)) agrupado[catalogo].sort(ordenAlfabetico);
  return agrupado;
}

/**
 * Ronda de instrucciones históricas (cluster A, A4): hasta esta ronda
 * `catalogo_valores` solo se leía — no existía ningún editor de
 * administración capaz de agregar/editar/desactivar sus filas (p. ej. para
 * que "Línea terapéutica" fuera realmente configurable). Estas 3 funciones
 * son la capa de escritura genérica, reutilizada por `EditorCatalogosSimples`
 * para cualquiera de los catálogos de `CATALOGO_SIMPLE` — no solo líneas
 * terapéuticas.
 */
export async function crearValorCatalogo(catalogo: CatalogoSimple, valor: string, orden: number): Promise<ValorCatalogo> {
  const { data, error } = await supabase
    .from("catalogo_valores")
    .insert({ catalogo, valor: valor.trim(), orden })
    .select("*")
    .single();
  if (error) throw new Error(mensajeErrorAmigable(error));
  return { id: data.id, catalogo: data.catalogo, valor: data.valor, orden: data.orden };
}

export async function actualizarValorCatalogo(id: string, cambios: { valor?: string; orden?: number }): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (cambios.valor !== undefined) payload.valor = cambios.valor.trim();
  if (cambios.orden !== undefined) payload.orden = cambios.orden;
  const { error } = await supabase.from("catalogo_valores").update(payload).eq("id", id);
  if (error) throw new Error(mensajeErrorAmigable(error));
}

export async function eliminarValorCatalogo(id: string): Promise<void> {
  const { error } = await supabase.from("catalogo_valores").delete().eq("id", id);
  if (error) throw new Error(mensajeErrorAmigable(error));
}

/** Hook simple para consumir un catálogo específico desde un formulario. */
export function useCatalogo(catalogo: CatalogoSimple): { opciones: string[]; cargando: boolean } {
  const [opciones, setOpciones] = React.useState<string[]>([]);
  const [cargando, setCargando] = React.useState(true);

  React.useEffect(() => {
    let cancelado = false;
    traerCatalogos()
      .then((todos) => {
        if (cancelado) return;
        setOpciones(
          todos
            .filter((v) => v.catalogo === catalogo)
            .map((v) => v.valor)
            .sort(ordenAlfabetico)
        );
      })
      .catch((error) => {
        console.error(mensajeErrorAmigable(error));
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [catalogo]);

  return { opciones, cargando };
}
