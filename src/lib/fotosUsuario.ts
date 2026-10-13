import * as React from "react";
import { supabase } from "@/lib/supabaseClient";

/**
 * Entrega 33 — fotos de perfil de los colaboradores (usuarios de BEATS).
 *
 * La foto vive en `archivos_adjuntos` (como la de los speakers) y el usuario la referencia con `usuarios.foto_id`
 * (`db/entrega_33_foto_usuario.sql`). Muchas pantallas muestran varios usuarios a la vez (tablero, historial, cadena de
 * aprobación), así que en vez de una consulta por avatar este módulo:
 *   · agrupa las peticiones que llegan en el mismo instante en UNA consulta a `usuarios` y UNA a `archivos_adjuntos`;
 *   · recuerda lo ya resuelto mientras dura la sesión del navegador (`invalidarFotoUsuario` lo refresca al cambiar la foto);
 *   · si la columna `foto_id` todavía no existe (migración pendiente) lo recuerda y no vuelve a preguntar: los avatares
 *     quedan con las iniciales, como hasta ahora.
 */

type Oyente = () => void;

const fotoPorUsuario = new Map<string, string | null>(); // usuarioId → dataUrl (null = sin foto)
const fotoPorArchivo = new Map<string, string | null>(); // archivoId → dataUrl
const idArchivoPorUsuario = new Map<string, string | null>(); // usuarioId → foto_id
const oyentes = new Set<Oyente>();
const usuariosPendientes = new Set<string>();
const archivosPendientes = new Set<string>();
let temporizador: ReturnType<typeof setTimeout> | null = null;
let columnaAusente = false;

function avisar() {
  oyentes.forEach((o) => o());
}

function programar() {
  if (temporizador) return;
  temporizador = setTimeout(() => {
    temporizador = null;
    void resolverPendientes();
  }, 15);
}

async function resolverPendientes() {
  const usuarios = Array.from(usuariosPendientes);
  usuariosPendientes.clear();
  const archivos = new Set(archivosPendientes);
  archivosPendientes.clear();

  // 1. usuario → foto_id (solo los usuarios cuyo foto_id no se conoce todavía)
  if (usuarios.length > 0) {
    if (columnaAusente) {
      for (const id of usuarios) idArchivoPorUsuario.set(id, null);
    } else {
      try {
        const { data, error } = await supabase.from("usuarios").select("id, foto_id").in("id", usuarios);
        if (error) {
          if (/foto_id|column|schema cache|does not exist/i.test(error.message ?? "")) columnaAusente = true;
          for (const id of usuarios) idArchivoPorUsuario.set(id, null);
        } else {
          const vistos = new Set<string>();
          for (const f of (data ?? []) as { id: string; foto_id: string | null }[]) {
            vistos.add(f.id);
            idArchivoPorUsuario.set(f.id, f.foto_id ?? null);
            if (f.foto_id) archivos.add(f.foto_id);
          }
          for (const id of usuarios) if (!vistos.has(id)) idArchivoPorUsuario.set(id, null);
        }
      } catch {
        for (const id of usuarios) idArchivoPorUsuario.set(id, null);
      }
    }
  }

  // 2. foto_id → imagen
  const porTraer = Array.from(archivos).filter((id) => !fotoPorArchivo.has(id));
  if (porTraer.length > 0) {
    try {
      const { data } = await supabase.from("archivos_adjuntos").select("id, data_url").in("id", porTraer);
      const traidos = new Set<string>();
      for (const f of (data ?? []) as { id: string; data_url: string | null }[]) {
        traidos.add(f.id);
        fotoPorArchivo.set(f.id, f.data_url ?? null);
      }
      for (const id of porTraer) if (!traidos.has(id)) fotoPorArchivo.set(id, null);
    } catch {
      for (const id of porTraer) fotoPorArchivo.set(id, null);
    }
  }

  for (const [usuarioId, archivoId] of idArchivoPorUsuario) {
    fotoPorUsuario.set(usuarioId, archivoId ? (fotoPorArchivo.get(archivoId) ?? null) : null);
  }
  avisar();
}

/** Olvida lo recordado de un usuario (p. ej. tras cambiar su foto) para que la próxima lectura vuelva a la base. */
export function invalidarFotoUsuario(usuarioId: string): void {
  const archivoId = idArchivoPorUsuario.get(usuarioId);
  if (archivoId) fotoPorArchivo.delete(archivoId);
  idArchivoPorUsuario.delete(usuarioId);
  fotoPorUsuario.delete(usuarioId);
  avisar();
}

/**
 * Foto (data URL) de un colaborador, o `null` si no tiene / todavía no carga.
 *  · `fotoId` conocido (p. ej. el objeto `Usuario` ya trae `fotoId`): se resuelve directo a la imagen.
 *  · `fotoId` ausente: se busca por `usuarioId` (consulta agrupada).
 */
export function useFotoUsuario(usuarioId?: string | null, fotoId?: string | null): string | null {
  const [, forzar] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => {
    oyentes.add(forzar);
    return () => {
      oyentes.delete(forzar);
    };
  }, []);

  React.useEffect(() => {
    if (fotoId !== undefined) {
      if (fotoId && !fotoPorArchivo.has(fotoId)) {
        archivosPendientes.add(fotoId);
        programar();
      }
      return;
    }
    if (usuarioId && !idArchivoPorUsuario.has(usuarioId) && !usuariosPendientes.has(usuarioId)) {
      usuariosPendientes.add(usuarioId);
      programar();
    }
  });

  if (fotoId !== undefined) return fotoId ? (fotoPorArchivo.get(fotoId) ?? null) : null;
  if (usuarioId) return fotoPorUsuario.get(usuarioId) ?? null;
  return null;
}

/** Guarda (o quita, con `null`) la foto de un colaborador. Devuelve `false` si falta la migración de la columna. */
export async function guardarFotoUsuario(usuarioId: string, fotoId: string | null): Promise<boolean> {
  const { error } = await supabase.from("usuarios").update({ foto_id: fotoId }).eq("id", usuarioId);
  if (error) {
    if (/foto_id|column|schema cache|does not exist/i.test(error.message ?? "")) return false;
    throw new Error(error.message);
  }
  columnaAusente = false;
  invalidarFotoUsuario(usuarioId);
  return true;
}
