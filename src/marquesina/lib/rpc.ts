// Acceso a datos de "BEATS — Marquesina": una única RPC pública, sin login,
// `resumen_ejecucion_evento(p_codigo)`. Código fuente real exportado por el
// usuario con `pg_get_functiondef` (la misma exportación que desbloqueó la
// Fase 7) — a diferencia de `validar_codigo_evento_ejecucion`, esta función
// NO valida `expira_en` del código ni el `estado` del evento (basta con que
// el código exista y esté `activo`), y su mensaje de error es más corto:
// "Código inválido." (siempre el mismo texto, exista o no el evento).
import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";
import type { SesionVista } from "@/lib/sesionesVista";

export class ErrorMarquesina extends Error {
  esFalloDeRed: boolean;
  constructor(mensaje: string, esFalloDeRed: boolean) {
    super(mensaje);
    this.name = "ErrorMarquesina";
    this.esFalloDeRed = esFalloDeRed;
  }
}

function esMensajeDeFalloDeRed(mensaje: string): boolean {
  return /failed to fetch|networkerror|network request failed|load failed|net::/i.test(mensaje);
}

/** Fila del ranking de productos — claves ya en camelCase, tal como las arma el propio `jsonb_build_object` de la función real. */
export interface ProductoRankingMarquesina {
  nombre: string;
  cantidadTotal: number;
  logoDataUrl: string | null;
}

export interface ResumenEjecucionEvento {
  nombreEvento: string;
  direccion: string;
  ciudad: string;
  fechaInicioEvento: string | null;
  fechaFinEvento: string | null;
  totalRegistros: number;
  totalEvento: number;
  totalTaller: number;
  totalStand: number;
  productos: ProductoRankingMarquesina[];
}

interface FilaResumen {
  nombre_evento: string;
  direccion: string;
  ciudad: string;
  fecha_inicio_evento: string | null;
  fecha_fin_evento: string | null;
  total_registros: number;
  total_evento: number;
  total_taller: number;
  total_stand: number;
  productos: ProductoRankingMarquesina[] | null;
}

export async function traerResumenEjecucionEvento(codigo: string): Promise<ResumenEjecucionEvento> {
  let resultado: { data: unknown; error: { message: string } | null };
  try {
    resultado = await supabase.rpc("resumen_ejecucion_evento", { p_codigo: codigo.trim() }).single();
  } catch (e) {
    throw new ErrorMarquesina(mensajeErrorAmigable(e), true);
  }
  if (resultado.error) {
    const mensaje = resultado.error.message ?? "Ocurrió un error inesperado.";
    if (esMensajeDeFalloDeRed(mensaje)) {
      throw new ErrorMarquesina("No hay conexión a internet.", true);
    }
    throw new ErrorMarquesina(mensaje, false);
  }
  const fila = resultado.data as FilaResumen;
  return {
    nombreEvento: fila.nombre_evento,
    direccion: fila.direccion,
    ciudad: fila.ciudad,
    fechaInicioEvento: fila.fecha_inicio_evento,
    fechaFinEvento: fila.fecha_fin_evento,
    totalRegistros: fila.total_registros,
    totalEvento: fila.total_evento,
    totalTaller: fila.total_taller,
    totalStand: fila.total_stand,
    productos: fila.productos ?? [],
  };
}

/**
 * Entrega 30 — datos adicionales (opcionales) para el tablero en vivo. Si la función ampliada todavía no
 * está instalada en la base (`db/entrega_30_marquesina_ampliada.sql`) se recuerda y no se vuelve a pedir:
 * la marquesina sigue funcionando con los totales y el ranking, y oculta los paneles que dependen de esto.
 */
export interface AmpliadoMarquesina {
  esperados: number | null;
  llegadasPorHora: { hora: string; total: number }[];
  ultimos: { id?: string; pais?: string; iniciales: string; especialidad: string; ciudad: string; tipo: string; capturadoEn: string }[];
  especialidades: { nombre: string; total: number }[];
  ciudades: { nombre: string; total: number }[];
  /** Entrega 31 (`db/entrega_31_marquesina_mapa.sql`): país/modalidad/ciudad del evento. `null` si la migración no se ha ejecutado. */
  evento: { pais: string; modalidad: string; ciudad: string } | null;
  /** Entrega 31: todas las ubicaciones (país + ciudad) de los check-ins. Vacío si la migración no se ha ejecutado. */
  ubicaciones: { pais: string; ciudad: string; total: number }[];
  /**
   * Entrega 33 (`db/entrega_33_marquesina_sesiones.sql`): sesiones del evento con su fecha, localización, esperados y check-ins.
   * Vacío si la migración no se ha ejecutado o el evento es de sesión única → la marquesina no muestra el selector.
   */
  sesiones: SesionVista[];
}

let ampliadoNoDisponible = false;

export async function traerAmpliadoMarquesina(codigo: string): Promise<AmpliadoMarquesina | null> {
  if (ampliadoNoDisponible) return null;
  try {
    const { data, error } = await supabase.rpc("resumen_ejecucion_evento_ampliado", { p_codigo: codigo.trim() });
    if (error) {
      const e = error as { code?: string; message?: string };
      if (e.code === "PGRST202" || /could not find the function|does not exist/i.test(e.message ?? "")) ampliadoNoDisponible = true;
      return null;
    }
    const d = (data ?? {}) as Partial<AmpliadoMarquesina>;
    return {
      esperados: d.esperados ?? null,
      llegadasPorHora: d.llegadasPorHora ?? [],
      ultimos: d.ultimos ?? [],
      especialidades: d.especialidades ?? [],
      ciudades: d.ciudades ?? [],
      evento: d.evento ?? null,
      ubicaciones: d.ubicaciones ?? [],
      sesiones: Array.isArray(d.sesiones)
        ? d.sesiones.map((s, i) => ({
            id: String(s.id),
            numero: Number(s.numero ?? i + 1),
            fecha: s.fecha ?? null,
            lugar: s.lugar ?? "",
            pais: s.pais ?? "",
            estadoProvincia: s.estadoProvincia ?? "",
            ciudad: s.ciudad ?? "",
            esperados: s.esperados == null ? null : Number(s.esperados),
            registros: s.registros == null ? null : Number(s.registros),
          }))
        : [],
    };
  } catch {
    return null;
  }
}
