import { crearBackup, permisoEscritura, registrarEnHistorial, type CarpetaDestino, type ResultadoBackup } from "./backup";
import { esArchivoDeBackup } from "./formato";

/**
 * Entrega 35 — rutinas de backup programadas.
 *
 * BEATS es una aplicación que corre en el navegador: una rutina «programada» se ejecuta MIENTRAS BEATS está abierto en el
 * equipo donde se programó. Si se abre pasada la hora, la rutina vencida corre al abrir (una sola vez, sin acumular
 * copias). La carpeta de destino (del equipo o de la red) es un permiso del navegador de ese equipo, por eso la
 * programación se guarda ahí (IndexedDB), por usuario, y no en la base de datos. Para una copia que corra con el equipo
 * apagado o BEATS cerrado hace falta una tarea del servidor (pg_dump + programador de tareas), fuera del alcance de la app.
 */

export type UnidadIntervalo = "horas" | "dias" | "semanas";

export interface Programacion {
  usuarioId: string;
  activa: boolean;
  cada: number;
  unidad: UnidadIntervalo;
  /** Cuántas copias PROGRAMADAS conservar en la carpeta (las más recientes); 0 = no borrar nunca. */
  conservar: number;
  carpeta: CarpetaDestino | null;
  carpetaNombre: string;
  creadaEn: string;
  ultimaEjecucion: string | null;
  ultimoEstado: "ok" | "error" | "sin_permiso" | null;
  ultimoMensaje: string | null;
  proximaEjecucion: string | null;
}

export const PROGRAMACION_VACIA = (usuarioId: string): Programacion => ({
  usuarioId,
  activa: false,
  cada: 1,
  unidad: "dias",
  conservar: 14,
  carpeta: null,
  carpetaNombre: "",
  creadaEn: new Date().toISOString(),
  ultimaEjecucion: null,
  ultimoEstado: null,
  ultimoMensaje: null,
  proximaEjecucion: null,
});

const MS: Record<UnidadIntervalo, number> = { horas: 3_600_000, dias: 86_400_000, semanas: 604_800_000 };
export const ETIQUETA_UNIDAD: Record<UnidadIntervalo, string> = { horas: "hora(s)", dias: "día(s)", semanas: "semana(s)" };

/** Mínimo una hora entre copias: una copia completa lee toda la base y no debe competir con el trabajo de la gente. */
export function intervaloMs(p: Pick<Programacion, "cada" | "unidad">): number {
  return Math.max(MS.horas, Math.round(p.cada) * MS[p.unidad]);
}

export function calcularProxima(desde: Date, p: Pick<Programacion, "cada" | "unidad">): string {
  return new Date(desde.getTime() + intervaloMs(p)).toISOString();
}

export function estaVencida(p: Programacion, ahora = new Date()): boolean {
  return p.activa && !!p.proximaEjecucion && new Date(p.proximaEjecucion).getTime() <= ahora.getTime();
}

// ---------------------------------------------------------------------------------------------------------------------
// Almacenamiento (IndexedDB: guarda la carpeta elegida, que no se puede serializar a texto)
// ---------------------------------------------------------------------------------------------------------------------

const BD = "beats-backup";
const ALMACEN = "programaciones";

function abrirBd(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    const peticion = indexedDB.open(BD, 1);
    peticion.onupgradeneeded = () => peticion.result.createObjectStore(ALMACEN, { keyPath: "usuarioId" });
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error ?? new Error("No se pudo abrir el almacenamiento local."));
  });
}

export async function leerProgramacion(usuarioId: string): Promise<Programacion | null> {
  try {
    const bd = await abrirBd();
    return await new Promise<Programacion | null>((resolver, rechazar) => {
      const r = bd.transaction(ALMACEN, "readonly").objectStore(ALMACEN).get(usuarioId);
      r.onsuccess = () => resolver((r.result as Programacion | undefined) ?? null);
      r.onerror = () => rechazar(r.error);
    }).finally(() => bd.close());
  } catch {
    return null;
  }
}

export async function guardarProgramacion(p: Programacion): Promise<void> {
  const bd = await abrirBd();
  try {
    await new Promise<void>((resolver, rechazar) => {
      const t = bd.transaction(ALMACEN, "readwrite");
      t.objectStore(ALMACEN).put(p);
      t.oncomplete = () => resolver();
      t.onerror = () => rechazar(t.error ?? new Error("No se pudo guardar la programación."));
    });
  } finally {
    bd.close();
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Ejecución
// ---------------------------------------------------------------------------------------------------------------------

/** Borra de la carpeta las copias PROGRAMADAS más antiguas, dejando las `conservar` más recientes. Nunca toca copias manuales ni otros archivos. */
export async function aplicarRetencion(carpeta: CarpetaDestino, conservar: number): Promise<number> {
  if (conservar <= 0) return 0;
  const nombres: string[] = [];
  for await (const entrada of carpeta.values()) {
    if (entrada.kind === "file" && esArchivoDeBackup(entrada.name) && entrada.name.includes("_programado.")) nombres.push(entrada.name);
  }
  nombres.sort(); // el nombre lleva la fecha y hora: orden alfabético = cronológico
  const sobrantes = nombres.slice(0, Math.max(0, nombres.length - conservar));
  for (const nombre of sobrantes) await carpeta.removeEntry(nombre);
  return sobrantes.length;
}

export type EstadoEjecucion =
  | { tipo: "no_corresponde" }
  | { tipo: "sin_permiso"; programacion: Programacion }
  | { tipo: "ok"; programacion: Programacion; resultado: ResultadoBackup; borradas: number }
  | { tipo: "error"; programacion: Programacion; mensaje: string };

let ejecutando = false;

export function hayCopiaEnCurso(): boolean {
  return ejecutando;
}

/**
 * Corre la rutina del usuario si está activa y vencida (o si `forzar`). `solicitarPermiso` solo puede ser `true` dentro de
 * un clic: el navegador exige un gesto de la persona para volver a conceder el acceso a la carpeta.
 * Usa un candado entre pestañas para que dos pestañas de BEATS no copien a la vez.
 */
export async function ejecutarRutina(
  usuario: { id: string; nombre: string },
  opciones: { forzar?: boolean; solicitarPermiso?: boolean; alProgreso?: Parameters<typeof crearBackup>[0]["alProgreso"] } = {},
): Promise<EstadoEjecucion> {
  if (ejecutando) return { tipo: "no_corresponde" };
  const inicial = await leerProgramacion(usuario.id);
  if (!inicial || !inicial.carpeta) return { tipo: "no_corresponde" };
  if (!opciones.forzar && !estaVencida(inicial)) return { tipo: "no_corresponde" };

  const correr = async (): Promise<EstadoEjecucion> => {
    // Se relee dentro del candado: otra pestaña pudo haber corrido la rutina mientras tanto.
    const p = (await leerProgramacion(usuario.id)) ?? inicial;
    if (!p.carpeta) return { tipo: "no_corresponde" };
    if (!opciones.forzar && !estaVencida(p)) return { tipo: "no_corresponde" };
    ejecutando = true;
    try {
      if (!(await permisoEscritura(p.carpeta, !!opciones.solicitarPermiso))) {
        const sinPermiso: Programacion = { ...p, ultimoEstado: "sin_permiso", ultimoMensaje: "El navegador necesita que vuelvas a autorizar el acceso a la carpeta." };
        await guardarProgramacion(sinPermiso);
        return { tipo: "sin_permiso", programacion: sinPermiso };
      }
      const ahora = new Date();
      try {
        const resultado = await crearBackup({ destino: { tipo: "carpeta", carpeta: p.carpeta }, origen: "programado", usuario, alProgreso: opciones.alProgreso });
        let borradas = 0;
        try {
          borradas = await aplicarRetencion(p.carpeta, p.conservar);
        } catch {
          // Si no se pudieron borrar las antiguas, la copia nueva igual quedó hecha.
        }
        const hecha: Programacion = {
          ...p,
          ultimaEjecucion: ahora.toISOString(),
          ultimoEstado: "ok",
          ultimoMensaje: `${resultado.nombreArchivo} (${resultado.filas} filas)`,
          proximaEjecucion: calcularProxima(new Date(), p),
        };
        await guardarProgramacion(hecha);
        await registrarEnHistorial({ origen: "programado", estado: "ok", nombreArchivo: resultado.nombreArchivo, destino: resultado.destinoTexto, tablas: resultado.tablas, filas: resultado.filas, bytes: resultado.bytes, mensaje: null });
        return { tipo: "ok", programacion: hecha, resultado, borradas };
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : String(error);
        // Tras un fallo se reintenta pronto (en media hora, o antes si la rutina es más frecuente) en vez de esperar un ciclo entero.
        const reintento = new Date(Date.now() + Math.min(intervaloMs(p), 30 * 60_000)).toISOString();
        const fallida: Programacion = { ...p, ultimoEstado: "error", ultimoMensaje: mensaje, proximaEjecucion: reintento };
        await guardarProgramacion(fallida);
        await registrarEnHistorial({ origen: "programado", estado: "error", nombreArchivo: null, destino: `Carpeta «${p.carpetaNombre}»`, tablas: null, filas: null, bytes: null, mensaje });
        return { tipo: "error", programacion: fallida, mensaje };
      }
    } finally {
      ejecutando = false;
    }
  };

  const candados = (globalThis.navigator as Navigator & { locks?: LockManager }).locks;
  if (!candados) return correr();
  try {
    const resultado = await candados.request("beats-backup-programado", { ifAvailable: true }, async (candado) => (candado ? correr() : ({ tipo: "no_corresponde" } as EstadoEjecucion)));
    return resultado as EstadoEjecucion;
  } catch (error) {
    // Con la app abierta como archivo (file://) algunos navegadores niegan el API de candados: se corre sin candado entre pestañas.
    if (error instanceof DOMException && error.name === "SecurityError") return correr();
    throw error;
  }
}
