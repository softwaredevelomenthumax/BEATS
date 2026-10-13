/**
 * Entrega 35 — formato del archivo de copia de seguridad («Configuración → Backup»).
 *
 * Archivo de TEXTO en líneas (NDJSON), comprimido con gzip cuando el navegador lo permite:
 *
 *   línea 1        {"tipo":"cabecera", formato, creadoEn, ..., esquema, orden}            ← cómo era la base
 *   líneas 2..n-1  {"tipo":"datos","tabla":"x","n":120,"sha":"…"}⇥[ {fila}, {fila}, … ]  ← una página de filas
 *   última línea   {"tipo":"manifiesto", tablas:[{nombre,filas}], totalFilas, secuencias, sello}  ← cierre y verificación
 *
 * (⇥ = un carácter de tabulación.) Las filas se guardan TAL COMO las entregó Postgres (`jsonb::text`) y NUNCA pasan por
 * `JSON.parse`/`JSON.stringify`: así un `bigint` mayor a 2^53 o un monto con seis decimales llegan a la restauración
 * idénticos. Por eso cada línea de datos separa un sobre JSON pequeño del texto de las filas con una tabulación (que el
 * JSON nunca contiene sin escapar).
 *
 * Cada página lleva su huella SHA-256; el manifiesto trae el total de filas por tabla y un «sello» (huella de todas las
 * huellas y conteos). Un archivo cortado, editado o dañado se detecta ANTES de restaurar (`verificarArchivo`): si falta el
 * manifiesto, una huella no coincide o los conteos no cuadran, no se restaura.
 */

export const FORMATO_BACKUP = "beats-backup/1";
export const PREFIJO_ARCHIVO = "beats-backup";

export interface ColumnaEsquema {
  nombre: string;
  tipo: string;
  obligatoria: boolean;
  generada: boolean;
  identidad: boolean;
}

export interface TablaEsquema {
  nombre: string;
  filas: number;
  bytes: number;
  columnas: ColumnaEsquema[];
  llave: string[];
}

export interface RelacionEsquema {
  tabla: string;
  columnas: string[];
  ref_esquema: string;
  ref_tabla: string;
}

export interface EsquemaBackup {
  generado_en: string;
  base: string;
  version_postgres: string;
  tablas: TablaEsquema[];
  relaciones: RelacionEsquema[];
  enums: { nombre: string; valores: string[] }[];
}

export interface CabeceraBackup {
  tipo: "cabecera";
  formato: string;
  creadoEn: string;
  versionApp: string;
  origen: OrigenBackup;
  creadoPor: { id: string; nombre: string } | null;
  proyecto: string;
  esquema: EsquemaBackup;
  /** Orden en que deben cargarse las tablas (las referenciadas primero). */
  orden: string[];
  /** Tablas atrapadas en una referencia circular (o que dependen de ella): solo se restauran si el rol puede desactivar las llaves foráneas. */
  conCiclos: string[];
}

export interface SobreDatos {
  tipo: "datos";
  tabla: string;
  n: number;
  sha: string;
}

export interface ManifiestoBackup {
  tipo: "manifiesto";
  tablas: { nombre: string; filas: number; paginas: number }[];
  totalFilas: number;
  secuencias: { nombre: string; ultimo: number | string }[];
  sello: string;
  terminadoEn: string;
}

export type OrigenBackup = "manual" | "programado" | "seguridad";

// ---------------------------------------------------------------------------------------------------------------------
// Huella SHA-256 (Web Crypto; con una implementación propia de respaldo para contextos donde no existe `crypto.subtle`)
// ---------------------------------------------------------------------------------------------------------------------

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256Js(bytes: Uint8Array): string {
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const largo = bytes.length;
  const total = (((largo + 9 + 63) >> 6) << 6) >>> 0;
  const m = new Uint8Array(total);
  m.set(bytes);
  m[largo] = 0x80;
  const vista = new DataView(m.buffer);
  vista.setUint32(total - 8, Math.floor((largo * 8) / 0x100000000), false);
  vista.setUint32(total - 4, (largo * 8) >>> 0, false);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = vista.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0; h[1] = (h[1]! + b) >>> 0; h[2] = (h[2]! + c) >>> 0; h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0; h[5] = (h[5]! + f) >>> 0; h[6] = (h[6]! + g) >>> 0; h[7] = (h[7]! + hh) >>> 0;
  }
  return Array.from(h, (x) => x.toString(16).padStart(8, "0")).join("");
}

export async function sha256Hex(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return sha256Js(bytes);
}

/** Exportada solo para poder comprobar la implementación de respaldo contra Web Crypto en las pruebas. */
export function sha256HexSincrono(texto: string): string {
  return sha256Js(new TextEncoder().encode(texto));
}

/** Sello del archivo completo: huella de todas las huellas de página y de los conteos por tabla, en el orden escrito. */
export async function calcularSello(huellas: string[], conteos: { nombre: string; filas: number }[]): Promise<string> {
  return sha256Hex(huellas.join(",") + "|" + conteos.map((c) => `${c.nombre}:${c.filas}`).join(","));
}

// ---------------------------------------------------------------------------------------------------------------------
// Orden de carga
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Ordena las tablas para que cada una se cargue después de las que referencia (ordenamiento topológico estable por
 * nombre). Las autorreferencias se ignoran (una fila puede apuntar a otra de la misma tabla). Las tablas atrapadas en una
 * referencia circular se agregan al final y se devuelven en `conCiclos`.
 */
export function ordenarParaCarga(tablas: string[], relaciones: RelacionEsquema[]): { orden: string[]; conCiclos: string[] } {
  const conjunto = new Set(tablas);
  const depende = new Map<string, Set<string>>();
  for (const t of tablas) depende.set(t, new Set());
  for (const r of relaciones) {
    if (r.ref_esquema !== "public" || r.tabla === r.ref_tabla) continue;
    if (conjunto.has(r.tabla) && conjunto.has(r.ref_tabla)) depende.get(r.tabla)!.add(r.ref_tabla);
  }
  const orden: string[] = [];
  const pendientes = new Set(tablas);
  let progreso = true;
  while (pendientes.size > 0 && progreso) {
    progreso = false;
    for (const t of [...pendientes].sort((a, b) => a.localeCompare(b))) {
      if ([...depende.get(t)!].every((d) => !pendientes.has(d))) {
        orden.push(t);
        pendientes.delete(t);
        progreso = true;
      }
    }
  }
  const conCiclos = [...pendientes].sort((a, b) => a.localeCompare(b));
  return { orden: [...orden, ...conCiclos], conCiclos };
}

// ---------------------------------------------------------------------------------------------------------------------
// Nombre del archivo
// ---------------------------------------------------------------------------------------------------------------------

/** `beats-backup_2026-10-09_153045.ndjson.gz` (hora local; ordena cronológicamente por nombre). */
export function nombreArchivoBackup(fecha: Date, comprimido: boolean, origen: OrigenBackup = "manual"): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const marca = `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}_${p(fecha.getHours())}${p(fecha.getMinutes())}${p(fecha.getSeconds())}`;
  const sufijo = origen === "manual" ? "" : `_${origen}`;
  return `${PREFIJO_ARCHIVO}_${marca}${sufijo}.ndjson${comprimido ? ".gz" : ""}`;
}

export function esArchivoDeBackup(nombre: string): boolean {
  return nombre.startsWith(`${PREFIJO_ARCHIVO}_`) && /\.ndjson(\.gz)?$/.test(nombre);
}

export function formatearBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const unidades = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < unidades.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${unidades[i]}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Lectura del archivo, línea por línea (sin cargarlo entero en memoria)
// ---------------------------------------------------------------------------------------------------------------------

export function tieneCompresion(): boolean {
  return typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";
}

/** Entrega cada línea de texto del archivo (descomprimiéndolo si es gzip). */
export async function* leerLineas(archivo: Blob): AsyncGenerator<string> {
  const inicio = new Uint8Array(await archivo.slice(0, 2).arrayBuffer());
  const esGzip = inicio[0] === 0x1f && inicio[1] === 0x8b;
  let flujo: ReadableStream<Uint8Array> = archivo.stream() as ReadableStream<Uint8Array>;
  if (esGzip) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("Este navegador no puede descomprimir el archivo (.gz). Usa una versión reciente de Chrome, Edge o Firefox.");
    }
    flujo = flujo.pipeThrough(new DecompressionStream("gzip") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  }
  const lector = flujo.getReader();
  const decodificador = new TextDecoder("utf-8");
  let resto = "";
  try {
    for (;;) {
      const { value, done } = await lector.read();
      if (done) break;
      resto += decodificador.decode(value, { stream: true });
      let corte = resto.indexOf("\n");
      while (corte >= 0) {
        const linea = resto.slice(0, corte);
        resto = resto.slice(corte + 1);
        if (linea) yield linea;
        corte = resto.indexOf("\n");
      }
    }
    resto += decodificador.decode();
    if (resto) yield resto;
  } finally {
    lector.releaseLock();
  }
}

/** Separa una línea de datos en su sobre y el texto de las filas (sin interpretar las filas). */
export function separarLineaDatos(linea: string): { sobre: SobreDatos; filasTexto: string } | null {
  const tab = linea.indexOf("\t");
  if (tab < 0) return null;
  try {
    const sobre = JSON.parse(linea.slice(0, tab)) as SobreDatos;
    if (sobre.tipo !== "datos") return null;
    return { sobre, filasTexto: linea.slice(tab + 1) };
  } catch {
    return null;
  }
}
