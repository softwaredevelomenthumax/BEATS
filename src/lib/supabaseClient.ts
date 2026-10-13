import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://xnjqlwkcbkctoinkroqs.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_uHiC-tlAUi_ZMyqgpgsepA_W1-pWvHF";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

/**
 * Traduce errores crudos de Postgres/PostgREST/RLS/Auth a mensajes en
 * español que un usuario final pueda entender, sin exponer detalle técnico.
 */
export function mensajeErrorAmigable(error: unknown): string {
  const raw =
    (typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error)) || "";
  const codigo =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";

  if (/invalid login credentials/i.test(raw)) {
    return "Correo o contraseña incorrectos.";
  }
  if (/email not confirmed/i.test(raw)) {
    return "Esta cuenta todavía no ha confirmado su correo.";
  }
  // Entrega 21: un catálogo nuevo de la app que aún no existe en el enum `catalogo_simple` de la base.
  const enumFaltante = /invalid input value for enum catalogo_simple:\s*["']?([^"']+)["']?/i.exec(raw);
  if (enumFaltante) {
    return `El catálogo «${enumFaltante[1]}» todavía no está habilitado en la base de datos. Un administrador debe ejecutar una sola vez el archivo db/entrega_21_agregar_enum_catalogos.sql en el SQL Editor de Supabase y volver a intentar.`;
  }
  if (codigo === "42501" || /row-level security/i.test(raw) || /permission denied/i.test(raw)) {
    return "No tienes permiso para realizar esta acción.";
  }
  if (codigo === "23505" || /duplicate key/i.test(raw)) {
    return "Ya existe un registro con esos datos.";
  }
  if (codigo === "23503" || /foreign key/i.test(raw)) {
    // Noviembre 2026: se indica QUÉ referencia falló (columna o restricción) para poder corregirla.
    const detalle = typeof error === "object" && error !== null && "details" in error ? String((error as { details?: unknown }).details ?? "") : "";
    const columna = /Key \(([a-z0-9_]+)\)=/i.exec(detalle)?.[1];
    const restriccion = /constraint "([^"]+)"/i.exec(raw)?.[1];
    const referencia = columna ? ` (referencia inválida en «${columna}»)` : restriccion ? ` (restricción «${restriccion}»)` : "";
    return `No se puede completar la operación porque hay información relacionada que lo impide${referencia}.`;
  }
  if (codigo === "23514" || /check constraint/i.test(raw)) {
    return "Los datos ingresados no cumplen con las reglas de validación.";
  }
  if (/failed to fetch/i.test(raw) || /networkerror/i.test(raw)) {
    return "No se pudo conectar con el servidor. Verifica tu conexión a internet.";
  }
  if (raw) {
    return raw;
  }
  return "Ocurrió un error inesperado. Intenta de nuevo.";
}
