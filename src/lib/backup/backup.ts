import { supabase, SUPABASE_URL } from "@/lib/supabaseClient";
import { infoBuild } from "@/lib/buildInfo";
import {
  FORMATO_BACKUP,
  calcularSello,
  leerLineas,
  nombreArchivoBackup,
  ordenarParaCarga,
  separarLineaDatos,
  sha256Hex,
  tieneCompresion,
  type CabeceraBackup,
  type EsquemaBackup,
  type ManifiestoBackup,
  type OrigenBackup,
} from "./formato";

/**
 * Entrega 35 — motor de copias de seguridad y restauración (pantalla «Configuración → Backup»).
 *
 * Todo el acceso a la base pasa por las funciones `beats_backup_*` de `db/entrega_35_backup.sql` (ver ese archivo para el
 * porqué: RLS, números sin pérdida, triggers apagados al restaurar). Aquí solo se orquesta: pedir el esquema, leer cada
 * tabla por páginas, escribir el archivo en un flujo (gzip → destino) sin tenerlo entero en memoria y, al restaurar,
 * verificarlo, cargar tabla por tabla y comprobar que los conteos coinciden.
 */

export class ErrorBackup extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorBackup";
  }
}

const MIGRACION_FALTANTE =
  "Falta aplicar la migración de Backup: ejecuta una sola vez db/entrega_35_backup.sql en el SQL Editor de Supabase y vuelve a intentar.";

async function rpc<T>(funcion: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(funcion, args);
  if (error) {
    const crudo = `${error.message ?? ""}`;
    if (error.code === "PGRST202" || /could not find the function/i.test(crudo) || /schema cache/i.test(crudo)) throw new ErrorBackup(MIGRACION_FALTANTE);
    throw new ErrorBackup(crudo || "Error desconocido al llamar a la base de datos.");
  }
  return data as T;
}

// ---------------------------------------------------------------------------------------------------------------------
// Destinos
// ---------------------------------------------------------------------------------------------------------------------

/** Carpeta elegida con el selector del navegador (puede ser una unidad de red o una carpeta compartida montada en el equipo). */
export interface CarpetaDestino extends FileSystemDirectoryHandle {
  queryPermission?(descriptor: { mode: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: "read" | "readwrite" }): Promise<PermissionState>;
}

export type DestinoBackup = { tipo: "descarga" } | { tipo: "carpeta"; carpeta: CarpetaDestino };

export function navegadorPuedeElegirCarpeta(): boolean {
  return typeof (globalThis as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
}

/** Abre el selector de carpetas. `null` si la persona lo cancela. Debe llamarse desde un clic. */
export async function elegirCarpeta(): Promise<CarpetaDestino | null> {
  const selector = (globalThis as { showDirectoryPicker?: (op?: { mode?: "readwrite"; id?: string }) => Promise<CarpetaDestino> }).showDirectoryPicker;
  if (!selector) throw new ErrorBackup("Este navegador no permite elegir una carpeta. Usa Chrome o Edge, o descarga el archivo.");
  try {
    return await selector.call(globalThis, { mode: "readwrite", id: "beats-backup" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    throw error;
  }
}

/** ¿Tenemos permiso de escritura sobre la carpeta? Con `solicitar` (solo dentro de un clic) pide que se conceda. */
export async function permisoEscritura(carpeta: CarpetaDestino, solicitar: boolean): Promise<boolean> {
  try {
    if (!carpeta.queryPermission) return true;
    if ((await carpeta.queryPermission({ mode: "readwrite" })) === "granted") return true;
    if (solicitar && carpeta.requestPermission) return (await carpeta.requestPermission({ mode: "readwrite" })) === "granted";
  } catch {
    // Una carpeta que ya no existe (unidad de red desconectada) lanza al consultar: se trata como "sin permiso".
  }
  return false;
}

export function descargarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

interface Salida {
  escribir(texto: string): Promise<void>;
  cerrar(): Promise<{ bytes: number; blob: Blob | null }>;
  abortar(motivo: unknown): Promise<void>;
}

async function abrirSalida(destino: DestinoBackup, nombre: string, comprimir: boolean): Promise<Salida> {
  const codificador = new TextEncoder();
  let bytes = 0;
  let destinoFinal: WritableStream<Uint8Array>;
  let blobPromesa: Promise<Blob> | null = null;
  if (destino.tipo === "carpeta") {
    const archivo = await destino.carpeta.getFileHandle(nombre, { create: true });
    // El navegador escribe en un archivo temporal y lo confirma al cerrar: si algo falla, el destino queda intacto.
    destinoFinal = (await archivo.createWritable()) as unknown as WritableStream<Uint8Array>;
  } else {
    const intermedio = new TransformStream<Uint8Array, Uint8Array>();
    blobPromesa = new Response(intermedio.readable).blob();
    destinoFinal = intermedio.writable;
  }
  const entrada: TransformStream<Uint8Array, Uint8Array> = comprimir
    ? (new CompressionStream("gzip") as unknown as TransformStream<Uint8Array, Uint8Array>)
    : new TransformStream<Uint8Array, Uint8Array>();
  const contador = new TransformStream<Uint8Array, Uint8Array>({
    transform(trozo, control) {
      bytes += trozo.byteLength;
      control.enqueue(trozo);
    },
  });
  const tuberia = entrada.readable.pipeThrough(contador).pipeTo(destinoFinal);
  const escritor = entrada.writable.getWriter();
  return {
    async escribir(texto) {
      await escritor.write(codificador.encode(texto));
    },
    async cerrar() {
      await escritor.close();
      await tuberia;
      return { bytes, blob: blobPromesa ? await blobPromesa : null };
    },
    async abortar(motivo) {
      await escritor.abort(motivo).catch(() => {});
      await tuberia.catch(() => {});
      if (blobPromesa) await blobPromesa.catch(() => {});
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Crear una copia
// ---------------------------------------------------------------------------------------------------------------------

export interface ProgresoBackup {
  fase: "esquema" | "tablas" | "cierre";
  tabla?: string;
  tablaNumero?: number;
  totalTablas?: number;
  filasLeidas: number;
  filasTotales: number;
}

export interface ResultadoBackup {
  nombreArchivo: string;
  bytes: number;
  tablas: number;
  filas: number;
  sello: string;
  destinoTexto: string;
  /** Tablas cuyo número de filas cambió mientras se copiaba (normal si había gente trabajando). */
  avisos: string[];
}

export interface OpcionesCrearBackup {
  destino: DestinoBackup;
  origen: OrigenBackup;
  usuario: { id: string; nombre: string } | null;
  alProgreso?: (p: ProgresoBackup) => void;
  senal?: AbortSignal;
}

const OBJETIVO_BYTES_PAGINA = 1_000_000;
const MAXIMO_BYTES_PAGINA = 3_000_000;

export function textoDestino(destino: DestinoBackup): string {
  return destino.tipo === "carpeta" ? `Carpeta «${destino.carpeta.name}»` : "Descarga del navegador";
}

export async function traerEsquema(): Promise<EsquemaBackup> {
  return rpc<EsquemaBackup>("beats_backup_esquema");
}

interface PaginaLeida {
  n: number;
  datos: string;
  ultima: Record<string, unknown> | null;
}

async function leerPagina(tabla: string, despues: Record<string, unknown> | null, limite: number): Promise<{ pagina: PaginaLeida; limiteUsado: number }> {
  let intento = 0;
  let actual = limite;
  for (;;) {
    try {
      const pagina = await rpc<PaginaLeida>("beats_backup_leer", { p_tabla: tabla, p_despues: despues, p_limite: actual });
      return { pagina, limiteUsado: actual };
    } catch (error) {
      intento++;
      // Una página demasiado grande (o un corte momentáneo) se reintenta con la mitad de filas; con 1 fila se reintenta 2 veces más.
      if (intento > 5) throw new ErrorBackup(`No se pudo leer la tabla «${tabla}»: ${error instanceof Error ? error.message : String(error)}`);
      if (actual > 1) actual = Math.max(1, Math.floor(actual / 2));
      else await new Promise((r) => setTimeout(r, 800 * intento));
    }
  }
}

export async function crearBackup(opciones: OpcionesCrearBackup): Promise<ResultadoBackup> {
  const { destino, origen, usuario, alProgreso, senal } = opciones;
  alProgreso?.({ fase: "esquema", filasLeidas: 0, filasTotales: 0 });
  const esquema = await traerEsquema();
  const { orden, conCiclos } = ordenarParaCarga(esquema.tablas.map((t) => t.nombre), esquema.relaciones);
  const porNombre = new Map(esquema.tablas.map((t) => [t.nombre, t]));
  const filasTotales = esquema.tablas.reduce((a, t) => a + t.filas, 0);

  const comprimir = tieneCompresion();
  const nombreArchivo = nombreArchivoBackup(new Date(), comprimir, origen);
  const salida = await abrirSalida(destino, nombreArchivo, comprimir);

  const cabecera: CabeceraBackup = {
    tipo: "cabecera",
    formato: FORMATO_BACKUP,
    creadoEn: new Date().toISOString(),
    versionApp: infoBuild()?.version ?? "desarrollo",
    origen,
    creadoPor: usuario,
    proyecto: new URL(SUPABASE_URL).host,
    esquema,
    orden,
    conCiclos,
  };

  try {
    await salida.escribir(JSON.stringify(cabecera) + "\n");
    const huellas: string[] = [];
    const conteos: { nombre: string; filas: number; paginas: number }[] = [];
    const avisos: string[] = [];
    let leidasTotal = 0;

    for (let i = 0; i < orden.length; i++) {
      const nombre = orden[i]!;
      const tabla = porNombre.get(nombre)!;
      const promedio = tabla.filas > 0 ? Math.max(1, tabla.bytes / tabla.filas) : 1;
      let limite = Math.max(1, Math.min(500, Math.floor(OBJETIVO_BYTES_PAGINA / promedio)));
      let despues: Record<string, unknown> | null = null;
      let filas = 0;
      let paginas = 0;
      for (;;) {
        if (senal?.aborted) throw new ErrorBackup("La copia se canceló.");
        alProgreso?.({ fase: "tablas", tabla: nombre, tablaNumero: i + 1, totalTablas: orden.length, filasLeidas: leidasTotal, filasTotales });
        const { pagina, limiteUsado } = await leerPagina(nombre, despues, limite);
        limite = limiteUsado;
        if (pagina.n === 0) break;
        // Una página con menos filas que las pedidas es la última: así no hace falta una consulta extra para confirmarlo.
        const ultimaPagina = pagina.n < limiteUsado;
        const sha = await sha256Hex(pagina.datos);
        huellas.push(sha);
        await salida.escribir(JSON.stringify({ tipo: "datos", tabla: nombre, n: pagina.n, sha }) + "\t" + pagina.datos + "\n");
        filas += pagina.n;
        paginas++;
        leidasTotal += pagina.n;
        despues = pagina.ultima;
        // Páginas muy grandes se achican; muy chicas se agrandan (hasta 500 filas).
        if (ultimaPagina) break;
        if (pagina.datos.length > MAXIMO_BYTES_PAGINA) limite = Math.max(1, Math.floor(limite / 2));
        else if (pagina.datos.length < OBJETIVO_BYTES_PAGINA / 4) limite = Math.min(500, limite * 2);
      }
      conteos.push({ nombre, filas, paginas });
      if (filas !== tabla.filas) avisos.push(`${nombre}: tenía ${tabla.filas} filas al empezar y se copiaron ${filas}.`);
    }

    alProgreso?.({ fase: "cierre", filasLeidas: leidasTotal, filasTotales });
    const secuencias = await rpc<ManifiestoBackup["secuencias"]>("beats_backup_secuencias");
    const sello = await calcularSello(huellas, conteos);
    const manifiesto: ManifiestoBackup = {
      tipo: "manifiesto",
      tablas: conteos,
      totalFilas: leidasTotal,
      secuencias,
      sello,
      terminadoEn: new Date().toISOString(),
    };
    await salida.escribir(JSON.stringify(manifiesto) + "\n");
    const { bytes, blob } = await salida.cerrar();
    if (destino.tipo === "descarga" && blob) descargarBlob(blob, nombreArchivo);
    return { nombreArchivo, bytes, tablas: conteos.length, filas: leidasTotal, sello, destinoTexto: textoDestino(destino), avisos };
  } catch (error) {
    await salida.abortar(error);
    throw error;
  }
}

/** Anota en el historial (tabla `backups_registro`) el resultado de una copia o restauración. Nunca falla la operación principal. */
export async function registrarEnHistorial(datos: {
  origen: OrigenBackup | "restauracion";
  estado: "ok" | "error";
  nombreArchivo: string | null;
  destino: string | null;
  tablas: number | null;
  filas: number | null;
  bytes: number | null;
  mensaje: string | null;
}): Promise<void> {
  try {
    await rpc("beats_backup_registrar", {
      p_origen: datos.origen,
      p_estado: datos.estado,
      p_nombre_archivo: datos.nombreArchivo,
      p_destino: datos.destino,
      p_tablas: datos.tablas,
      p_filas: datos.filas,
      p_bytes: datos.bytes,
      p_mensaje: datos.mensaje,
    });
  } catch (error) {
    console.warn("No se pudo anotar en el historial de backups:", error);
  }
}

export interface FilaHistorialBackup {
  id: string;
  creado_en: string;
  origen: OrigenBackup | "restauracion";
  estado: "ok" | "error";
  creado_por_nombre: string | null;
  nombre_archivo: string | null;
  destino: string | null;
  total_tablas: number | null;
  total_filas: number | null;
  tamano_bytes: number | null;
  mensaje: string | null;
}

export async function traerHistorial(limite = 50): Promise<FilaHistorialBackup[]> {
  return rpc<FilaHistorialBackup[]>("beats_backup_historial", { p_limite: limite });
}

// ---------------------------------------------------------------------------------------------------------------------
// Verificar un archivo
// ---------------------------------------------------------------------------------------------------------------------

export interface ResumenArchivo {
  valido: boolean;
  errores: string[];
  advertencias: string[];
  cabecera: CabeceraBackup | null;
  manifiesto: ManifiestoBackup | null;
  /** `true`/`false` si se pudo comprobar que la copia trae al administrador que restaura; `null` si no hay forma de saberlo. */
  incluyeAlAdministrador: boolean | null;
}

export async function verificarArchivo(archivo: Blob, usuarioId: string | null, alProgreso?: (leidas: number) => void): Promise<ResumenArchivo> {
  const errores: string[] = [];
  const advertencias: string[] = [];
  let cabecera: CabeceraBackup | null = null;
  let manifiesto: ManifiestoBackup | null = null;
  let incluyeAdmin: boolean | null = null;
  const huellas: string[] = [];
  const conteos = new Map<string, { filas: number; paginas: number }>();
  let leidas = 0;
  let primera = true;
  try {
    for await (const linea of leerLineas(archivo)) {
      if (primera) {
        primera = false;
        try {
          const c = JSON.parse(linea) as CabeceraBackup;
          if (c.tipo !== "cabecera" || !String(c.formato).startsWith("beats-backup/")) throw new Error();
          if (c.formato !== FORMATO_BACKUP) errores.push(`El archivo es de un formato más nuevo (${c.formato}); esta versión de BEATS no lo entiende.`);
          cabecera = c;
        } catch {
          errores.push("El archivo no es una copia de seguridad de BEATS (no tiene la cabecera esperada).");
          break;
        }
        continue;
      }
      if (linea.startsWith('{"tipo":"manifiesto"')) {
        manifiesto = JSON.parse(linea) as ManifiestoBackup;
        continue;
      }
      const datos = separarLineaDatos(linea);
      if (!datos) {
        errores.push("Hay una línea ilegible en el archivo (está dañado).");
        break;
      }
      const { sobre, filasTexto } = datos;
      const sha = await sha256Hex(filasTexto);
      if (sha !== sobre.sha) {
        errores.push(`La huella de una página de «${sobre.tabla}» no coincide: el archivo está dañado o fue modificado.`);
        break;
      }
      huellas.push(sha);
      const previo = conteos.get(sobre.tabla) ?? { filas: 0, paginas: 0 };
      conteos.set(sobre.tabla, { filas: previo.filas + sobre.n, paginas: previo.paginas + 1 });
      leidas += sobre.n;
      if (sobre.tabla === "usuarios" && usuarioId) {
        try {
          const filas = JSON.parse(filasTexto) as { id?: string; es_administrador?: boolean }[];
          if (filas.some((f) => f.id === usuarioId && f.es_administrador === true)) incluyeAdmin = true;
          else if (incluyeAdmin === null) incluyeAdmin = false;
        } catch {
          // Ilegible: se deja en "no se pudo saber".
        }
      }
      alProgreso?.(leidas);
    }
  } catch (error) {
    errores.push(error instanceof Error ? error.message : "No se pudo leer el archivo.");
  }

  if (cabecera && errores.length === 0) {
    if (!manifiesto) {
      errores.push("El archivo está incompleto: no trae el cierre (manifiesto). La copia se interrumpió o el archivo se cortó.");
    } else {
      const manifestadas = manifiesto.tablas;
      for (const t of manifestadas) {
        const real = conteos.get(t.nombre) ?? { filas: 0, paginas: 0 };
        if (real.filas !== t.filas) errores.push(`«${t.nombre}»: el manifiesto dice ${t.filas} filas y el archivo trae ${real.filas}.`);
      }
      for (const nombre of conteos.keys()) {
        if (!manifestadas.some((t) => t.nombre === nombre)) errores.push(`«${nombre}» tiene datos pero no figura en el manifiesto.`);
      }
      const sello = await calcularSello(huellas, manifestadas);
      if (sello !== manifiesto.sello) errores.push("El sello del archivo no coincide: falta o sobra alguna página.");
      if (manifiesto.totalFilas !== leidas) errores.push(`El manifiesto dice ${manifiesto.totalFilas} filas en total y el archivo trae ${leidas}.`);
    }
  }
  if (cabecera && cabecera.conCiclos.length > 0) {
    advertencias.push(
      `Hay tablas atrapadas en una referencia circular o que dependen de ella (${cabecera.conCiclos.join(", ")}): solo se pueden restaurar si el rol de la base permite desactivar las llaves foráneas (session_replication_role).`,
    );
  }
  return { valido: errores.length === 0 && !!cabecera && !!manifiesto, errores, advertencias, cabecera, manifiesto, incluyeAlAdministrador: incluyeAdmin };
}

// ---------------------------------------------------------------------------------------------------------------------
// Restaurar
// ---------------------------------------------------------------------------------------------------------------------

/**
 * - `completar`   : agrega lo que falta y NO toca lo que ya existe.
 * - `sobrescribir`: agrega lo que falta y devuelve al valor de la copia lo que ya existe (mismo id); no borra nada.
 * - `reemplazar`  : VACÍA todas las tablas y deja la base exactamente como estaba al hacer la copia.
 */
export type ModoRestauracion = "completar" | "sobrescribir" | "reemplazar";

export interface ProgresoRestauracion {
  fase: "preparando" | "vaciando" | "cargando" | "secuencias" | "comprobando";
  tabla?: string;
  filasCargadas: number;
  filasTotales: number;
}

export interface ComprobacionTabla {
  tabla: string;
  esperadas: number;
  actuales: number;
  ok: boolean;
}

export interface ResultadoRestauracion {
  tablas: number;
  filasProcesadas: number;
  filasEscritas: number;
  omitidas: string[];
  comprobacion: ComprobacionTabla[];
  coincide: boolean;
}

export async function restaurarBackup(
  archivo: Blob,
  opciones: { modo: ModoRestauracion; resumen: ResumenArchivo; alProgreso?: (p: ProgresoRestauracion) => void },
): Promise<ResultadoRestauracion> {
  const { modo, resumen, alProgreso } = opciones;
  if (!resumen.valido || !resumen.cabecera || !resumen.manifiesto) throw new ErrorBackup("El archivo no pasó la verificación; no se puede restaurar.");
  const cabecera = resumen.cabecera;
  const manifiesto = resumen.manifiesto;
  const filasTotales = manifiesto.totalFilas;

  alProgreso?.({ fase: "preparando", filasCargadas: 0, filasTotales });
  const actual = await traerEsquema();
  const existentes = new Set(actual.tablas.map((t) => t.nombre));
  const aRestaurar = cabecera.orden.filter((t) => existentes.has(t));
  const omitidas = cabecera.orden.filter((t) => !existentes.has(t));

  await rpc("beats_backup_iniciar_restauracion");
  let procesadas = 0;
  let escritas = 0;
  // Si algo falla se deja el candado puesto (vence solo a las 3 horas): con `usuarios` vacía a medio camino, es lo que
  // permite reintentar. La restauración es repetible: cargar de nuevo lo ya cargado no duplica nada.
  if (modo === "reemplazar") {
    alProgreso?.({ fase: "vaciando", filasCargadas: 0, filasTotales });
    await rpc("beats_backup_vaciar", { p_tablas: aRestaurar });
  }
  const modoSql = modo === "sobrescribir" ? "sobrescribir" : "completar";
  const conjunto = new Set(aRestaurar);
  for await (const linea of leerLineas(archivo)) {
    const datos = separarLineaDatos(linea);
    if (!datos || !conjunto.has(datos.sobre.tabla)) continue;
    alProgreso?.({ fase: "cargando", tabla: datos.sobre.tabla, filasCargadas: procesadas, filasTotales });
    let respuesta: { recibidas: number; escritas: number };
    try {
      respuesta = await rpc<{ recibidas: number; escritas: number }>("beats_backup_restaurar", { p_tabla: datos.sobre.tabla, p_filas: datos.filasTexto, p_modo: modoSql });
    } catch (error) {
      throw new ErrorBackup(
        `Falló la carga de «${datos.sobre.tabla}» (${error instanceof Error ? error.message : String(error)}). ` +
          "Se cargaron las tablas anteriores. Corrige la causa y vuelve a restaurar: repetirlo no duplica nada.",
      );
    }
    procesadas += respuesta.recibidas;
    escritas += respuesta.escritas;
  }

  alProgreso?.({ fase: "secuencias", filasCargadas: procesadas, filasTotales });
  await rpc("beats_backup_ajustar_secuencias", { p_secuencias: manifiesto.secuencias });

  alProgreso?.({ fase: "comprobando", filasCargadas: procesadas, filasTotales });
  const despues = await traerEsquema();
  const hoy = new Map(despues.tablas.map((t) => [t.nombre, t.filas]));
  const comprobacion: ComprobacionTabla[] = manifiesto.tablas
    .filter((t) => conjunto.has(t.nombre))
    .map((t) => {
      const actuales = hoy.get(t.nombre) ?? 0;
      // Al reemplazar, la base debe quedar con EXACTAMENTE lo de la copia; en los otros modos puede haber filas de más.
      return { tabla: t.nombre, esperadas: t.filas, actuales, ok: modo === "reemplazar" ? actuales === t.filas : actuales >= t.filas };
    });
  const coincide = comprobacion.every((c) => c.ok);
  await registrarEnHistorial({
    origen: "restauracion",
    estado: coincide ? "ok" : "error",
    nombreArchivo: null,
    destino: `Modo: ${modo}`,
    tablas: aRestaurar.length,
    filas: procesadas,
    bytes: null,
    mensaje: coincide ? null : "Los conteos finales no coinciden con la copia.",
  });
  await rpc("beats_backup_finalizar_restauracion");
  return { tablas: aRestaurar.length, filasProcesadas: procesadas, filasEscritas: escritas, omitidas, comprobacion, coincide };
}
