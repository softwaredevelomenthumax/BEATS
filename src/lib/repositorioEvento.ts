import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";
import { traerTodasLasFilas } from "@/lib/dbMapping";
import type { CategoriaFinancieraRepositorio, CategoriaRepositorioArchivo } from "@/lib/enums";
import type { RegistroFinancieroEvento, RepositorioArchivoEvento } from "@/types";

/**
 * Fase 1 (infraestructura de archivos, septiembre 2026) — Repositorio del
 * Evento: hallazgo D4-D35 del diagnóstico ("es fundamental que se puedan
 * cargar los datos en el repositorio de eventos"). Esta tabla y
 * `evento_registros_financieros` NUNCA se habían reconstruido — no existían
 * ni siquiera como interfaces de TypeScript antes de esta fase (a
 * diferencia de otros campos de archivo, que ya estaban en `types.ts` sin
 * conectar). El esquema real (`evento_repositorio_archivos`,
 * `evento_registros_financieros`) es la fuente de verdad para las columnas
 * usadas aquí.
 */

const TABLA_ARCHIVOS = "evento_repositorio_archivos";
const TABLA_FINANCIEROS = "evento_registros_financieros";

function filaAArchivoRepositorio(fila: Record<string, unknown>): RepositorioArchivoEvento {
  return {
    id: fila.id as string,
    eventoId: fila.evento_id as string,
    categoria: fila.categoria as CategoriaRepositorioArchivo,
    archivoId: (fila.archivo_id as string) ?? null,
    sesionId: (fila.sesion_id as string) ?? null,
    speakerId: (fila.speaker_id as string) ?? null,
    noAplica: Boolean(fila.no_aplica),
    noAplicaMotivo: (fila.no_aplica_motivo as string) ?? "",
    etiqueta: (fila.etiqueta as string) ?? null,
    origen: fila.origen === "ejecucion" ? "ejecucion" : "manual",
    conteoPersonalMedico: fila.conteo_personal_medico == null ? null : Number(fila.conteo_personal_medico),
    conteoPersonalNoMedico: fila.conteo_personal_no_medico == null ? null : Number(fila.conteo_personal_no_medico),
    conteoOtroPersonal: fila.conteo_otro_personal == null ? null : Number(fila.conteo_otro_personal),
    conteoFuerzaVentas: fila.conteo_fuerza_ventas == null ? null : Number(fila.conteo_fuerza_ventas),
  };
}

function filaARegistroFinanciero(fila: Record<string, unknown>): RegistroFinancieroEvento {
  return {
    id: fila.id as string,
    eventoId: fila.evento_id as string,
    categoria: fila.categoria as CategoriaFinancieraRepositorio,
    archivoId: fila.archivo_id as string,
    numero: (fila.numero as string) ?? "",
    fecha: (fila.fecha as string) ?? null,
    valor: fila.valor == null ? null : Number(fila.valor),
    moneda: (fila.moneda as string) ?? "",
    sesionId: (fila.sesion_id as string) ?? null,
    facturaId: (fila.factura_id as string) ?? null,
    facturasIds: idsDeFacturas(fila),
    speakerId: (fila.speaker_id as string) ?? null,
  };
}

/** Entrega 36: ids de las facturas que cubre un comprobante (`facturas_ids`, o la única `factura_id` si la columna no existe). */
function idsDeFacturas(fila: Record<string, unknown>): string[] {
  const lista = Array.isArray(fila.facturas_ids) ? (fila.facturas_ids as unknown[]).filter((x): x is string => typeof x === "string" && !!x) : [];
  if (lista.length > 0) return lista;
  return fila.factura_id ? [fila.factura_id as string] : [];
}

export async function traerRepositorioArchivosEvento(eventoId: string): Promise<RepositorioArchivoEvento[]> {
  const { data, error } = await supabase
    .from(TABLA_ARCHIVOS)
    .select("*")
    .eq("evento_id", eventoId)
    .order("categoria", { ascending: true });
  if (error) throw new Error(mensajeErrorAmigable(error));
  return (data ?? []).map(filaAArchivoRepositorio);
}

export interface NuevoArchivoRepositorioEvento {
  eventoId: string;
  categoria: CategoriaRepositorioArchivo;
  /** Omitido solo en una fila "No aplica". */
  archivoId?: string | null;
  sesionId?: string | null;
  speakerId?: string | null;
  noAplica?: boolean;
  noAplicaMotivo?: string;
  etiqueta?: string | null;
  conteoPersonalMedico?: number | null;
  conteoPersonalNoMedico?: number | null;
  conteoOtroPersonal?: number | null;
  conteoFuerzaVentas?: number | null;
}

export async function agregarArchivoRepositorioEvento(
  datos: NuevoArchivoRepositorioEvento,
): Promise<RepositorioArchivoEvento> {
  const fila: Record<string, unknown> = {
    evento_id: datos.eventoId,
    categoria: datos.categoria,
    archivo_id: datos.archivoId ?? null,
    sesion_id: datos.sesionId ?? null,
    conteo_personal_medico: datos.conteoPersonalMedico ?? null,
    conteo_personal_no_medico: datos.conteoPersonalNoMedico ?? null,
    conteo_otro_personal: datos.conteoOtroPersonal ?? null,
    conteo_fuerza_ventas: datos.conteoFuerzaVentas ?? null,
  };
  // Columnas nuevas (`db/agregar_expediente_evento.sql`): solo viajan cuando
  // traen valor, para que la carga clásica siga funcionando si la migración
  // todavía no se aplicó.
  if (datos.speakerId) fila.speaker_id = datos.speakerId;
  if (datos.noAplica) {
    fila.no_aplica = true;
    fila.no_aplica_motivo = datos.noAplicaMotivo ?? "";
  }
  if (datos.etiqueta) fila.etiqueta = datos.etiqueta;
  const { data, error } = await supabase.from(TABLA_ARCHIVOS).insert(fila).select("*").single();
  if (error) throw new Error(mensajeErrorAmigable(error));
  return filaAArchivoRepositorio(data);
}

export async function eliminarArchivoRepositorioEvento(id: string): Promise<void> {
  const { error } = await supabase.from(TABLA_ARCHIVOS).delete().eq("id", id);
  if (error) throw new Error(mensajeErrorAmigable(error));
}

export async function traerRegistrosFinancierosEvento(eventoId: string): Promise<RegistroFinancieroEvento[]> {
  const { data, error } = await supabase
    .from(TABLA_FINANCIEROS)
    .select("*")
    .eq("evento_id", eventoId)
    .order("categoria", { ascending: true });
  if (error) throw new Error(mensajeErrorAmigable(error));
  return (data ?? []).map(filaARegistroFinanciero);
}

export interface NuevoRegistroFinancieroEvento {
  eventoId: string;
  categoria: CategoriaFinancieraRepositorio;
  archivoId: string;
  numero: string;
  fecha?: string | null;
  valor?: number | null;
  moneda: string;
  sesionId?: string | null;
  facturaId?: string | null;
  /** Entrega 36: todas las facturas que cubre un comprobante de pago. */
  facturasIds?: string[];
  speakerId?: string | null;
}

/**
 * D5 del diagnóstico ("una OC con varias facturas: garantizar carga de
 * todas") — esta función solo inserta un registro nuevo; la garantía de que
 * se hayan cargado TODAS las facturas de una orden de compra es una
 * verificación manual por ahora (mostrar cuántas facturas hay vs. el
 * conteo esperado queda para cuando exista un campo de "número esperado de
 * facturas" en la Solicitud de Evento — no hay evidencia de que ese campo
 * ya exista en el esquema real).
 */
export async function agregarRegistroFinancieroEvento(
  datos: NuevoRegistroFinancieroEvento,
): Promise<RegistroFinancieroEvento> {
  const fila: Record<string, unknown> = {
    evento_id: datos.eventoId,
    categoria: datos.categoria,
    archivo_id: datos.archivoId,
    numero: datos.numero,
    fecha: datos.fecha ?? null,
    valor: datos.valor ?? null,
    moneda: datos.moneda,
    sesion_id: datos.sesionId ?? null,
    factura_id: datos.facturaId ?? null,
  };
  if (datos.speakerId) fila.speaker_id = datos.speakerId; // columna nueva, ver la migración del Expediente
  // Entrega 36: solo se envía la lista cuando hay varias facturas, así una sola factura sigue funcionando sin la migración.
  const ids = Array.from(new Set(datos.facturasIds ?? []));
  if (ids.length > 1) fila.facturas_ids = ids;
  if (ids.length > 0) fila.factura_id = ids[0];
  const { data, error } = await supabase.from(TABLA_FINANCIEROS).insert(fila).select("*").single();
  if (error) throw new Error(mensajeErrorAmigable(error));
  return filaARegistroFinanciero(data);
}

export async function eliminarRegistroFinancieroEvento(id: string): Promise<void> {
  const { error } = await supabase.from(TABLA_FINANCIEROS).delete().eq("id", id);
  if (error) throw new Error(mensajeErrorAmigable(error));
}

/**
 * Fase 6 (Auditoría de Eventos + Visor Documental) — a diferencia de
 * `traerRepositorioArchivosEvento`/`traerRegistrosFinancierosEvento` (un
 * evento a la vez, para la pestaña de Repositorio dentro del detalle de un
 * evento), estas dos pantallas necesitan el repositorio de TODOS los
 * eventos de una sola vez para calcular, sin abrir cada evento, cuántos
 * documentos le faltan a cada uno. Se pagina igual que `traerEventos()` por
 * si el volumen crece.
 */
export async function traerTodosLosArchivosRepositorio(): Promise<RepositorioArchivoEvento[]> {
  const filas = await traerTodasLasFilas<Record<string, unknown>>(TABLA_ARCHIVOS, { ordenarPor: "categoria" });
  return filas.map(filaAArchivoRepositorio);
}

export async function traerTodosLosRegistrosFinancieros(): Promise<RegistroFinancieroEvento[]> {
  const filas = await traerTodasLasFilas<Record<string, unknown>>(TABLA_FINANCIEROS, { ordenarPor: "categoria" });
  return filas.map(filaARegistroFinanciero);
}

/** Reemplaza (o crea) la fila "No aplica"/archivo de una categoría de un speaker o del evento: borra primero las filas previas de ese mismo alcance. */
export async function eliminarArchivosRepositorioPorAlcance(datos: {
  eventoId: string;
  categoria: CategoriaRepositorioArchivo;
  speakerId?: string | null;
  sesionId?: string | null;
}): Promise<void> {
  let consulta = supabase.from(TABLA_ARCHIVOS).delete().eq("evento_id", datos.eventoId).eq("categoria", datos.categoria);
  consulta = datos.speakerId ? consulta.eq("speaker_id", datos.speakerId) : consulta.is("speaker_id", null);
  if (datos.sesionId !== undefined) consulta = datos.sesionId ? consulta.eq("sesion_id", datos.sesionId) : consulta.is("sesion_id", null);
  const { error } = await consulta;
  if (error) throw new Error(mensajeErrorAmigable(error));
}

/** Conteo manual de "Otro personal" por evento (`sesionId = null`) o por sesión. Ver `evento_distribucion_asistentes`. */
export interface AjusteDistribucionAsistentes {
  sesionId: string | null;
  conteoOtroPersonal: number;
}

export async function traerAjustesDistribucionAsistentes(eventoId: string): Promise<AjusteDistribucionAsistentes[]> {
  const { data, error } = await supabase.from("evento_distribucion_asistentes").select("*").eq("evento_id", eventoId);
  if (error) {
    console.warn("No se pudo leer evento_distribucion_asistentes (¿falta aplicar la migración del Expediente?):", error.message);
    return [];
  }
  return (data ?? []).map((f) => ({ sesionId: (f.sesion_id as string) ?? null, conteoOtroPersonal: Number(f.conteo_otro_personal ?? 0) }));
}

export async function guardarOtroPersonalAsistentes(eventoId: string, sesionId: string | null, conteo: number): Promise<void> {
  const consultaPrevia = supabase.from("evento_distribucion_asistentes").select("id").eq("evento_id", eventoId);
  const { data: previa, error: errorPrevia } = await (sesionId ? consultaPrevia.eq("sesion_id", sesionId) : consultaPrevia.is("sesion_id", null)).maybeSingle();
  if (errorPrevia) throw new Error(mensajeErrorAmigable(errorPrevia));
  const { error } = previa
    ? await supabase.from("evento_distribucion_asistentes").update({ conteo_otro_personal: conteo, actualizado_en: new Date().toISOString() }).eq("id", previa.id)
    : await supabase.from("evento_distribucion_asistentes").insert({ evento_id: eventoId, sesion_id: sesionId, conteo_otro_personal: conteo });
  if (error) throw new Error(mensajeErrorAmigable(error));
}
