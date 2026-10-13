// Cola offline de "BEATS — Ejecución en Sitio" (plan: IndexedDB
// `beats-ejecucion` v1, almacén `cola`, reintentos máx. 5, drenado cada
// 25s + al detectar el evento `online`). Guarda en disco las dos
// operaciones de escritura que pueden fallar por falta de conexión en el
// sitio del evento (`crear_registro_participacion` /
// `registrar_muestra_entregada`) para reintentarlas después, sin perder lo
// que el responsable ya capturó (incluida la firma).
import type { DatosCheckIn, ItemMuestraEntrega } from "./rpc";

const DB_NOMBRE = "beats-ejecucion";
const DB_VERSION = 1;
const ALMACEN = "cola";

/** Máximo de reintentos AUTOMÁTICOS (por el sondeo cada 25s / el evento `online`) antes de marcar el ítem como agotado y esperar una acción manual ("Reintentar de todas formas") — ver `EjecucionApp.tsx`. */
export const MAX_INTENTOS_AUTOMATICOS = 5;

/**
 * Si el check-in se guardó offline y ese mismo evento tiene entrega de
 * muestras, el responsable puede capturar de una vez los productos + firma
 * de la entrega — como todavía no existe un `registroParticipacionId` real
 * (lo genera el servidor), esa segunda parte queda "colgada" del mismo
 * ítem de cola y se envía automáticamente en cuanto el check-in se
 * sincroniza y se conoce el id real.
 */
export interface EntregaMuestrasPendiente {
  items: ItemMuestraEntrega[];
  firmaDataUrl: string;
}

export interface ItemColaRegistro {
  id: string;
  tipo: "registro";
  creadoEn: string;
  intentos: number;
  agotado: boolean;
  ultimoError: string | null;
  token: string;
  datos: DatosCheckIn;
  entregaMuestrasPendiente: EntregaMuestrasPendiente | null;
}

export interface ItemColaMuestra {
  id: string;
  tipo: "muestra";
  creadoEn: string;
  intentos: number;
  agotado: boolean;
  ultimoError: string | null;
  token: string;
  registroParticipacionId: string;
  items: ItemMuestraEntrega[];
  firmaDataUrl: string;
  /** Solo informativo, para mostrar un nombre legible en el panel de la cola. */
  nombreParticipante: string;
}

export type ItemCola = ItemColaRegistro | ItemColaMuestra;

function generarIdCola(): string {
  return `cola-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

let promesaDb: Promise<IDBDatabase> | null = null;

function abrirBaseDatos(): Promise<IDBDatabase> {
  if (promesaDb) return promesaDb;
  promesaDb = new Promise((resolve, reject) => {
    const peticion = indexedDB.open(DB_NOMBRE, DB_VERSION);
    peticion.onupgradeneeded = () => {
      const db = peticion.result;
      if (!db.objectStoreNames.contains(ALMACEN)) {
        db.createObjectStore(ALMACEN, { keyPath: "id" });
      }
    };
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error);
  });
  return promesaDb;
}

async function conAlmacen<T>(modo: IDBTransactionMode, fn: (almacen: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrirBaseDatos();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, modo);
    const almacen = tx.objectStore(ALMACEN);
    const peticion = fn(almacen);
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error);
  });
}

export async function listarCola(): Promise<ItemCola[]> {
  const filas = await conAlmacen<ItemCola[]>("readonly", (almacen) => almacen.getAll());
  return filas.sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
}

export async function encolarRegistro(
  token: string,
  datos: DatosCheckIn,
  entregaMuestrasPendiente: EntregaMuestrasPendiente | null = null,
): Promise<ItemColaRegistro> {
  const item: ItemColaRegistro = {
    id: generarIdCola(),
    tipo: "registro",
    creadoEn: new Date().toISOString(),
    intentos: 0,
    agotado: false,
    ultimoError: null,
    token,
    datos,
    entregaMuestrasPendiente,
  };
  await conAlmacen("readwrite", (almacen) => almacen.put(item));
  return item;
}

export async function encolarMuestra(
  token: string,
  registroParticipacionId: string,
  items: ItemMuestraEntrega[],
  firmaDataUrl: string,
  nombreParticipante: string,
): Promise<ItemColaMuestra> {
  const item: ItemColaMuestra = {
    id: generarIdCola(),
    tipo: "muestra",
    creadoEn: new Date().toISOString(),
    intentos: 0,
    agotado: false,
    ultimoError: null,
    token,
    registroParticipacionId,
    items,
    firmaDataUrl,
    nombreParticipante,
  };
  await conAlmacen("readwrite", (almacen) => almacen.put(item));
  return item;
}

export async function actualizarItemCola(item: ItemCola): Promise<void> {
  await conAlmacen("readwrite", (almacen) => almacen.put(item));
}

export async function eliminarDeCola(id: string): Promise<void> {
  await conAlmacen("readwrite", (almacen) => almacen.delete(id));
}
