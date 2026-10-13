import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";
import { rowToFlat, t, s0, b, n0, type FieldSpec } from "@/lib/dbMapping";
import type { ProductoPortafolio } from "@/types";

/**
 * Lectura mínima de `productos_portafolio` — solo lo necesario como picker
 * de "muestras planeadas" en la Solicitud de Evento (Fase 4). El CRUD
 * completo (Fase 5, dentro del hub de Configuración de Campos) vive más
 * abajo en este mismo archivo.
 */
export interface ProductoResumen {
  id: string;
  nombre: string;
  empresaGrupo: string | null;
}

export async function traerProductosResumen(): Promise<ProductoResumen[]> {
  const { data, error } = await supabase
    .from("productos_portafolio")
    .select("id, nombre, empresa_grupo, activo")
    .eq("activo", true)
    .order("orden", { ascending: true });
  if (error) throw new Error(mensajeErrorAmigable(error));
  return (data ?? []).map((fila) => ({
    id: fila.id as string,
    nombre: fila.nombre as string,
    empresaGrupo: (fila.empresa_grupo as string) ?? null,
  }));
}

const CAMPOS_PRODUCTO: FieldSpec[] = [
  t("id"),
  t("nombre"),
  t("registro_sanitario", "registroSanitario"),
  b("activo"),
  n0("orden"),
  s0("logo_id", "logoId"),
  t("empresa_grupo", "empresaGrupo"),
  t("linea_terapeutica", "lineaTerapeutica"),
];

export async function traerPortafolioProductos(): Promise<ProductoPortafolio[]> {
  const { data, error } = await supabase
    .from("productos_portafolio")
    .select("*")
    .order("orden", { ascending: true });
  if (error) throw new Error(mensajeErrorAmigable(error));
  return (data ?? []).map((fila) => rowToFlat<ProductoPortafolio>(fila, CAMPOS_PRODUCTO));
}

export async function guardarProductoPortafolio(producto: Partial<ProductoPortafolio>): Promise<void> {
  const fila: Record<string, unknown> = {
    nombre: producto.nombre,
    registro_sanitario: producto.registroSanitario || null,
    activo: producto.activo ?? true,
    orden: producto.orden ?? 0,
    empresa_grupo: producto.empresaGrupo || null,
  };
  // Entrega 31: «Línea» (columna `linea_terapeutica`). Si la migración aún no corrió, se guarda sin ella y se avisa.
  const conLinea = { ...fila, linea_terapeutica: producto.lineaTerapeutica || null };
  const faltaColumnaLinea = (e: { message?: string; code?: string } | null) =>
    !!e && (e.code === "PGRST204" || e.code === "42703" || /linea_terapeutica/i.test(e.message ?? ""));
  const ejecutar = (f: Record<string, unknown>) =>
    producto.id
      ? supabase.from("productos_portafolio").update(f).eq("id", producto.id)
      : supabase.from("productos_portafolio").insert(f);
  let { error } = await ejecutar(conLinea);
  if (faltaColumnaLinea(error)) {
    ({ error } = await ejecutar(fila));
    if (!error && producto.lineaTerapeutica) {
      throw new Error("El producto se guardó, pero sin la «Línea»: falta ejecutar db/entrega_31_horas_productos_linea.sql en Supabase.");
    }
  }
  if (error) throw new Error(mensajeErrorAmigable(error));
}

export async function eliminarProductoPortafolio(id: string): Promise<void> {
  const { error } = await supabase.from("productos_portafolio").delete().eq("id", id);
  if (error) throw new Error(mensajeErrorAmigable(error));
}
