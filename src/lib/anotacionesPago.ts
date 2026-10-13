import { supabase } from "@/lib/supabaseClient";
import { traerTodasLasFilas } from "@/lib/dbMapping";
import type { AnotacionPago } from "@/types";

/**
 * Entrega 36 — anotaciones sobre el pago de un speaker (tabla `evento_anotaciones_pago`, ver
 * `db/entrega_36_pagos_anotaciones_facturas.sql`). Se escriben en el Expediente (comentarios del comprobante de pago) y en
 * el Informe de Pagos (aclaración de hallazgos). Trazabilidad: autor, rol y fecha los pone la base de datos; una anotación
 * no se edita ni se borra por UPDATE/DELETE directo; solo se marca como «aclarada» (con quién y cuándo).
 * Entrega 39: el autor (o un administrador) puede EDITAR o ELIMINAR su anotación mediante las funciones
 * `beats_editar_anotacion_pago` / `beats_eliminar_anotacion_pago` (`db/entrega_39b_*.sql`), que dejan constancia en la
 * auditoría del documento (evento) con el usuario de la sesión, el texto anterior y el nuevo.
 */

const TABLA = "evento_anotaciones_pago";

export const MENSAJE_FALTA_MIGRACION =
  "Las anotaciones de pago todavía no están habilitadas en la base de datos. Un administrador debe ejecutar una sola vez db/entrega_36_pagos_anotaciones_facturas.sql en el SQL Editor de Supabase.";

/** ¿El error indica que la tabla aún no existe (migración sin aplicar)? */
export function esTablaAnotacionesFaltante(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const e = error as { code?: unknown; message?: unknown };
  const codigo = String(e.code ?? "");
  const mensaje = String(e.message ?? "");
  return codigo === "42P01" || codigo === "PGRST205" || /could not find the table|relation .* does not exist/i.test(mensaje);
}

export function filaAAnotacionPago(fila: Record<string, unknown>): AnotacionPago {
  return {
    id: fila.id as string,
    eventoId: fila.evento_id as string,
    speakerId: (fila.speaker_id as string) ?? null,
    sesionId: (fila.sesion_id as string) ?? null,
    registroId: (fila.registro_id as string) ?? null,
    origen: fila.origen === "informe_pagos" ? "informe_pagos" : "expediente",
    texto: (fila.texto as string) ?? "",
    autorId: (fila.autor_id as string) ?? null,
    autorNombre: (fila.autor_nombre as string) ?? "",
    autorRol: (fila.autor_rol as string) ?? "",
    creadoEn: (fila.creado_en as string) ?? "",
    aclarada: Boolean(fila.aclarada),
    aclaradaPorNombre: (fila.aclarada_por_nombre as string) ?? null,
    aclaradaEn: (fila.aclarada_en as string) ?? null,
    editadaEn: (fila.editada_en as string) ?? null,
    editadaPorNombre: (fila.editada_por_nombre as string) ?? null,
    editadaVeces: Number(fila.editada_veces ?? 0) || 0,
  };
}

/** Anotaciones de un evento (las más antiguas primero). Sin la migración devuelve lista vacía. */
export async function traerAnotacionesPagoEvento(eventoId: string): Promise<AnotacionPago[]> {
  const { data, error } = await supabase.from(TABLA).select("*").eq("evento_id", eventoId).order("creado_en", { ascending: true });
  if (error) {
    if (esTablaAnotacionesFaltante(error)) return [];
    throw error;
  }
  return (data ?? []).map(filaAAnotacionPago);
}

/** Todas las anotaciones (Informe de Pagos). Sin la migración devuelve lista vacía. */
export async function traerTodasLasAnotacionesPago(): Promise<AnotacionPago[]> {
  try {
    const filas = await traerTodasLasFilas<Record<string, unknown>>(TABLA, { ordenarPor: "creado_en" });
    return filas.map(filaAAnotacionPago);
  } catch (error) {
    if (esTablaAnotacionesFaltante(error)) return [];
    throw error;
  }
}

export interface NuevaAnotacionPago {
  eventoId: string;
  speakerId?: string | null;
  sesionId?: string | null;
  registroId?: string | null;
  origen: AnotacionPago["origen"];
  texto: string;
}

export async function agregarAnotacionPago(datos: NuevaAnotacionPago): Promise<AnotacionPago> {
  const texto = datos.texto.trim();
  if (!texto) throw new Error("Escribe la anotación.");
  // Autor, rol y fecha NO se envían: los fija un trigger a partir de la sesión.
  const { data, error } = await supabase
    .from(TABLA)
    .insert({
      evento_id: datos.eventoId,
      speaker_id: datos.speakerId ?? null,
      sesion_id: datos.sesionId ?? null,
      registro_id: datos.registroId ?? null,
      origen: datos.origen,
      texto,
    })
    .select("*")
    .single();
  if (error) {
    if (esTablaAnotacionesFaltante(error)) throw new Error(MENSAJE_FALTA_MIGRACION);
    throw error;
  }
  return filaAAnotacionPago(data);
}

/** Marca (o reabre) una anotación como aclarada; quién y cuándo los registra la base de datos. */
export async function cambiarAclaradaAnotacionPago(id: string, aclarada: boolean): Promise<void> {
  const { error } = await supabase.from(TABLA).update({ aclarada }).eq("id", id);
  if (error) throw error;
}

/** Anotaciones que aplican a un speaker del evento (las de «todo el evento» sin speaker solo si hay un único speaker o se pide). */
export function anotacionesDelSpeaker(anotaciones: AnotacionPago[], eventoId: string, speakerId: string | null, incluirSinSpeaker = true): AnotacionPago[] {
  return anotaciones.filter((a) => a.eventoId === eventoId && ((a.speakerId ?? null) === (speakerId ?? null) || (incluirSinSpeaker && !a.speakerId)));
}

export const MENSAJE_FALTA_MIGRACION_39 =
  "Editar y eliminar anotaciones todavía no está habilitado en la base de datos. Un administrador debe ejecutar, en este orden y una sola vez, db/entrega_39a_enum_auditoria_anotaciones.sql y db/entrega_39b_anotaciones_pago_editar_eliminar.sql en el SQL Editor de Supabase.";

function esFuncionFaltante(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const e = error as { code?: unknown; message?: unknown };
  return String(e.code ?? "") === "PGRST202" || String(e.code ?? "") === "42883" || /could not find the function|function .* does not exist/i.test(String(e.message ?? ""));
}

/** ¿Puede esta persona editar/eliminar la anotación? Solo su autor o un administrador (la base lo vuelve a exigir). */
export function puedeGestionarAnotacion(a: Pick<AnotacionPago, "autorId">, usuario: { id: string; esAdministrador?: boolean } | null | undefined): boolean {
  if (!usuario) return false;
  return Boolean(usuario.esAdministrador) || (a.autorId != null && a.autorId === usuario.id);
}

/** Edita el texto de una anotación; la base registra en la auditoría quién, cuándo, el texto anterior y el nuevo. */
export async function editarAnotacionPago(id: string, texto: string): Promise<AnotacionPago> {
  const limpio = texto.trim();
  if (!limpio) throw new Error("Escribe la anotación.");
  const { data, error } = await supabase.rpc("beats_editar_anotacion_pago", { p_id: id, p_texto: limpio });
  if (error) {
    if (esFuncionFaltante(error)) throw new Error(MENSAJE_FALTA_MIGRACION_39);
    throw error;
  }
  return filaAAnotacionPago((Array.isArray(data) ? data[0] : data) as Record<string, unknown>);
}

/** Elimina una anotación; la base deja el texto eliminado y quién lo eliminó en la auditoría. */
export async function eliminarAnotacionPago(id: string): Promise<void> {
  const { error } = await supabase.rpc("beats_eliminar_anotacion_pago", { p_id: id });
  if (error) {
    if (esFuncionFaltante(error)) throw new Error(MENSAJE_FALTA_MIGRACION_39);
    throw error;
  }
}
