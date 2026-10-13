import { Telemetria } from "@/lib/telemetria";
import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";

/**
 * FASE 1 (infraestructura de archivos, septiembre 2026) — capa genérica de
 * acceso a la tabla `archivos_adjuntos`.
 *
 * Confirmado por evidencia directa (no es una suposición): la aplicación
 * original NUNCA usó Supabase Storage — guarda cada archivo cargado como
 * texto base64 en esta tabla (columnas `id`, `nombre`, `tipo`,
 * `tamano_bytes`, `data_url`, `cargado_en`) y lo referencia desde el
 * documento dueño con una columna `*_id` (uuid). El único lugar del código
 * YA reconstruido que usaba este mecanismo antes de esta fase es la firma
 * del formulario de Ejecución en Sitio (ver `src/ejecucion/lib/rpc.ts` —
 * ahí el INSERT ocurre dentro de la RPC `crear_registro_participacion`,
 * porque esa app pública no tiene sesión/RLS). Esta app principal SÍ tiene
 * sesión, así que aquí el INSERT se hace directo desde el cliente, como
 * cualquier otra tabla de la aplicación.
 *
 * Todos los componentes/formularios que necesiten cargar o mostrar un
 * archivo deben pasar por aquí — nunca construir un `data:` URL a mano ni
 * leer `archivos_adjuntos` con un `.select("*")` suelto en otro archivo.
 */

export interface ArchivoAdjunto {
  id: string;
  nombre: string;
  tipo: string;
  tamanoBytes: number;
  dataUrl: string;
  cargadoEn: string;
}

/**
 * Límite de tamaño por archivo. El diagnóstico (hallazgo D20) menciona un
 * límite de 16 MB mencionado en la aplicación original, pero no hay
 * evidencia de si es un límite de negocio o una restricción real de esta
 * tabla/columna en Postgres — se aplica aquí como límite conservador de la
 * aplicación (se puede ajustar por punto de carga con la opción
 * `maxBytes` de `subirArchivo`). `data_url` en base64 pesa ~33% más que el
 * archivo original, así que el límite se aplica sobre el tamaño real del
 * archivo, no sobre el string ya codificado.
 */
export const LIMITE_TAMANO_ARCHIVO_BYTES_DEFAULT = 16 * 1024 * 1024;

function leerComoDataUrl(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.onerror = () => reject(new Error("No se pudo leer el archivo."));
    lector.readAsDataURL(archivo);
  });
}

function filaAArchivo(fila: Record<string, unknown>): ArchivoAdjunto {
  return {
    id: fila.id as string,
    nombre: (fila.nombre as string) ?? "",
    tipo: (fila.tipo as string) ?? "",
    tamanoBytes: Number(fila.tamano_bytes ?? 0),
    dataUrl: (fila.data_url as string) ?? "",
    cargadoEn: (fila.cargado_en as string) ?? "",
  };
}

/**
 * Sube un archivo nuevo: lo convierte a base64 en el navegador y crea la
 * fila en `archivos_adjuntos`. Devuelve el registro completo — quien llama
 * guarda `archivo.id` en el campo `*_id` del documento dueño (CAF, Evento,
 * Speaker, etc.).
 *
 * AJUSTES (septiembre/octubre 2026), pedido explícito: "cuando se carguen
 * archivos al aplicativo (p. ej. RETHUS, hoja de vida de speaker, foto,
 * documentos de soporte de un evento, etc.), el sistema debe almacenarlos
 * con un nombre de archivo basado en una sintaxis o estructura lógica" —
 * misma convención que el nombre sugerido al exportar a PDF (ver
 * `lib/nombreArchivo.ts`). `opciones.nombreSugerido` (sin extensión —
 * la extensión original del archivo se conserva siempre) es opcional a
 * propósito: lo arma quien llama con el contexto que tenga a mano (tipo de
 * documento/adjunto, nombre del evento o del HCP/speaker); sin él, se
 * conserva el nombre original del archivo tal como lo deja el navegador.
 */
export async function subirArchivo(
  archivo: File,
  opciones: { maxBytes?: number; nombreSugerido?: string } = {},
): Promise<ArchivoAdjunto> {
  const t0 = performance.now();
  try {
    const r = await subirArchivoSinMedir(archivo, opciones);
    Telemetria.archivo({ nombre: "subida", duracionMs: performance.now() - t0, tamanoBytes: archivo.size, ok: true });
    return r;
  } catch (e) {
    Telemetria.archivo({ nombre: "subida", duracionMs: performance.now() - t0, tamanoBytes: archivo.size, ok: false });
    throw e;
  }
}

async function subirArchivoSinMedir(
  archivo: File,
  opciones: { maxBytes?: number; nombreSugerido?: string } = {},
): Promise<ArchivoAdjunto> {
  const maxBytes = opciones.maxBytes ?? LIMITE_TAMANO_ARCHIVO_BYTES_DEFAULT;
  if (archivo.size > maxBytes) {
    const limiteMB = (maxBytes / (1024 * 1024)).toFixed(0);
    throw new Error(`El archivo pesa más de ${limiteMB} MB — no se puede cargar.`);
  }
  const dataUrl = await leerComoDataUrl(archivo);
  const extension = archivo.name.includes(".") ? archivo.name.slice(archivo.name.lastIndexOf(".") + 1) : "";
  const nombreFinal =
    opciones.nombreSugerido && extension ? `${opciones.nombreSugerido}.${extension.toLowerCase()}` : opciones.nombreSugerido || archivo.name;
  const { data, error } = await supabase
    .from("archivos_adjuntos")
    .insert({
      nombre: nombreFinal,
      tipo: archivo.type || "application/octet-stream",
      tamano_bytes: archivo.size,
      data_url: dataUrl,
    })
    .select("*")
    .single();
  if (error) throw new Error(mensajeErrorAmigable(error));
  return filaAArchivo(data);
}

/** Trae un archivo por id — usado por el visor para mostrarlo/descargarlo. */
export async function traerArchivo(id: string): Promise<ArchivoAdjunto | null> {
  const { data, error } = await supabase.from("archivos_adjuntos").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(mensajeErrorAmigable(error));
  return data ? filaAArchivo(data) : null;
}

/**
 * Trae varios archivos de una vez por sus ids (evita N llamadas cuando una
 * pantalla lista varios registros con archivo cada uno, como el Repositorio
 * del Evento). Ids repetidos o vacíos se ignoran.
 */
export async function traerArchivos(ids: string[]): Promise<Map<string, ArchivoAdjunto>> {
  const unicos = Array.from(new Set(ids.filter(Boolean)));
  if (unicos.length === 0) return new Map();
  const { data, error } = await supabase.from("archivos_adjuntos").select("*").in("id", unicos);
  if (error) throw new Error(mensajeErrorAmigable(error));
  const mapa = new Map<string, ArchivoAdjunto>();
  for (const fila of data ?? []) {
    const archivo = filaAArchivo(fila);
    mapa.set(archivo.id, archivo);
  }
  return mapa;
}

/** Datos de un archivo SIN su contenido (`data_url`): para listarlo y mostrar su tamaño sin descargarlo. */
export interface MetadatosArchivo {
  id: string;
  nombre: string;
  tipo: string;
  tamanoBytes: number;
}

/**
 * Entrega 33 — nombre, tipo y tamaño de varios archivos de una vez, sin traer el contenido (que en esta tabla es el
 * archivo completo en base64). Sirve para listar los documentos de un evento (p. ej. el paquete que se envía por correo)
 * sin descargar decenas de MB solo para mostrar nombres.
 */
export async function traerMetadatosArchivos(ids: string[]): Promise<Map<string, MetadatosArchivo>> {
  const unicos = Array.from(new Set(ids.filter(Boolean)));
  const mapa = new Map<string, MetadatosArchivo>();
  if (unicos.length === 0) return mapa;
  const { data, error } = await supabase.from("archivos_adjuntos").select("id, nombre, tipo, tamano_bytes").in("id", unicos);
  if (error) throw new Error(mensajeErrorAmigable(error));
  for (const f of data ?? []) {
    mapa.set(f.id as string, {
      id: f.id as string,
      nombre: (f.nombre as string) ?? "",
      tipo: (f.tipo as string) ?? "",
      tamanoBytes: Number(f.tamano_bytes ?? 0),
    });
  }
  return mapa;
}

/**
 * Elimina un archivo — solo tiene sentido llamarla cuando quien lo cargó se
 * arrepiente ANTES de guardar el documento dueño (el campo `*_id` todavía no
 * se guardó en ningún lado). Una vez que un documento ya referencia el
 * archivo, no se debe eliminar por acá — el ciclo de vida del archivo pasa a
 * depender del documento dueño (anularlo, no borrar el archivo suelto).
 */
export async function eliminarArchivoSinReferenciar(id: string): Promise<void> {
  const { error } = await supabase.from("archivos_adjuntos").delete().eq("id", id);
  if (error) throw new Error(mensajeErrorAmigable(error));
}

/** Abre un archivo en una pestaña nueva (PDFs/imágenes) o dispara su descarga (el resto de tipos), a partir de su `dataUrl` ya cargado. */
export function abrirODescargarArchivo(archivo: ArchivoAdjunto): void {
  if (archivo.tipo.startsWith("image/") || archivo.tipo === "application/pdf") {
    const ventana = window.open();
    if (ventana) {
      ventana.document.write(
        archivo.tipo === "application/pdf"
          ? `<iframe src="${archivo.dataUrl}" style="border:0;width:100%;height:100%"></iframe>`
          : `<img src="${archivo.dataUrl}" style="max-width:100%" />`,
      );
      return;
    }
  }
  const enlace = document.createElement("a");
  enlace.href = archivo.dataUrl;
  enlace.download = archivo.nombre || "archivo";
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
}

/** Formatea un tamaño en bytes de forma legible (KB/MB), para mostrar junto al nombre del archivo. */
export function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
