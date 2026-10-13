import { supabase } from "@/lib/supabaseClient";
import { formatearMonto } from "@/lib/dinero";
import type { TipoDoc } from "@/lib/enums";

/**
 * Octubre 2026 (entrega 25) — texto de las notificaciones «pendiente de tu
 * aprobación». Antes el PRIMER aprobador recibía `"X" está esperando tu
 * aprobación.` (desde la app) y los siguientes `Una solicitud de evento de
 * tipo…, está pendiente de tu aprobación en BEATS (etapa: …)` (desde la base de
 * datos), cada uno con distinto nivel de detalle. Ahora TODOS reciben la misma
 * estructura, con los datos útiles de cada tipo de documento (actividad,
 * speaker, fechas, costos con «$» y moneda…).
 *
 * Estas funciones reflejan 1:1 las funciones SQL `fn_descriptor_*` de
 * `db/entrega_25_descriptores_notificaciones.sql` (mantenerlas sincronizadas):
 * la app arma el aviso de la primera etapa; la base de datos, el de las
 * siguientes. Son funciones puras sobre filas crudas (snake_case) para poder
 * probarlas sin red.
 */

type Fila = Record<string, unknown>;

const txt = (v: unknown): string => (v == null ? "" : String(v).trim());
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** `2026-12-01` → `01/12/2026` (formato de los avisos). */
export function fechaAviso(v: unknown): string {
  const s = txt(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

function montoAviso(valor: unknown, moneda: unknown): string {
  return formatearMonto(num(valor), txt(moneda));
}

function rango(inicio: unknown, fin: unknown): string {
  const a = fechaAviso(inicio);
  const b = fechaAviso(fin);
  if (a && b && a !== b) return `del ${a} al ${b}`;
  const unica = a || b;
  return unica ? `el ${unica}` : "";
}

function recortar(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

function listaConY(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** Suma de las categorías del presupuesto condensado de la solicitud de evento. */
export function totalPresupuestoEvento(fila: Fila): number {
  return (
    num(fila.condensado_inscripcion) +
    num(fila.condensado_transporte) +
    num(fila.condensado_traslado) +
    num(fila.condensado_hospedaje) +
    num(fila.condensado_alimentos) +
    num(fila.condensado_honorarios_speaker) +
    num(fila.condensado_otro) +
    (fila.incluir_valor_participacion ? num(fila.condensado_valor_participacion) : 0)
  );
}

export function descriptorEvento(fila: Fila, sesiones: Fila[], speakers: string[]): string {
  const tipo = txt(fila.tipo_evento);
  const nombre = txt(fila.nombre_evento);
  let s = "Una solicitud de evento";
  if (tipo) s += ` de tipo "${tipo}"`;
  if (nombre) s += ` ("${nombre}")`;

  const sedes = sesiones
    .map((se) => {
      const lugar = txt(se.lugar) || txt(se.ciudad) || "sede por definir";
      const f = fechaAviso(se.fecha);
      return f ? `${lugar} el ${f}` : lugar;
    })
    .filter(Boolean);
  if (txt(fila.modalidad_sesiones) === "Varias sesiones" && sedes.length > 0) {
    s += `, en varias sedes: ${sedes.join("; ")}`;
  } else {
    const donde = txt(fila.modalidad_evento) === "Virtual" ? "de modalidad virtual" : `en ${txt(fila.ciudad) || txt(fila.direccion) || "sede por definir"}`;
    const cuando = rango(fila.fecha_inicio_evento, fila.fecha_fin_evento);
    s += `, ${donde}${cuando ? ` ${cuando}` : ""}`;
  }
  const nombres = speakers.map(txt).filter(Boolean);
  if (nombres.length > 0) s += `, con ${nombres.length === 1 ? "el speaker" : "los speakers"} ${listaConY(nombres)}`;
  const total = totalPresupuestoEvento(fila);
  if (total > 0) s += `, con presupuesto total de ${montoAviso(total, fila.moneda)}`;
  if (txt(fila.nombre_solicitante)) s += `, solicitada por ${txt(fila.nombre_solicitante)}`;
  return s;
}

export function descriptorConvenio(fila: Fila, creador: string): string {
  const hcp = txt(fila.hcp_nombre_completo) || "un HCP";
  const esp = txt(fila.hcp_especialidad);
  let s = `Una solicitud de convenio de pago a HCP para ${hcp}${esp ? ` (${esp})` : ""}`;
  const actividad = [txt(fila.tipo_actividad), txt(fila.nombre_evento_servicio) ? `"${txt(fila.nombre_evento_servicio)}"` : ""].filter(Boolean).join(" ");
  if (actividad) s += `, por la actividad ${actividad}`;
  const cuando = rango(fila.fecha_inicio_actividad, fila.fecha_fin_actividad);
  if (cuando) s += ` ${cuando}`;
  if (fila.contraprestacion_hcp != null && txt(fila.contraprestacion_hcp) !== "") {
    s += `, con contraprestación de ${montoAviso(fila.contraprestacion_hcp, fila.moneda_contraprestacion)}`;
  }
  if (creador) s += `, solicitada por ${creador}`;
  return s;
}

export function descriptorCaf(fila: Fila): string {
  const tipo = txt(fila.tipo_contrato);
  const contraparte = txt(fila.contraparte_nombre);
  let s = `Una solicitud de CAF${tipo ? ` (${tipo})` : ""}`;
  if (contraparte) s += ` con ${contraparte}`;
  if (txt(fila.objeto_contrato)) s += `, por "${recortar(txt(fila.objeto_contrato), 120)}"`;
  if (fila.monto != null && txt(fila.monto) !== "") s += `, con monto de ${montoAviso(fila.monto, fila.moneda)}`;
  const vigencia = rango(fila.termino_contrato_inicio, fila.termino_contrato_fin);
  if (vigencia) s += ` y vigencia ${vigencia}`;
  if (txt(fila.solicitante_nombre)) s += `, solicitada por ${txt(fila.solicitante_nombre)}`;
  return s;
}

export function descriptorConvenioHcp(fila: Fila, creador: string): string {
  const consultor = txt(fila.consultor_nombre) || "un HCP";
  let s = `Una solicitud de Convenio HCP con ${consultor}`;
  if (fila.compensacion != null && txt(fila.compensacion) !== "") s += `, con compensación de ${montoAviso(fila.compensacion, fila.moneda)}`;
  if (fila.plazo_pago_dias != null && txt(fila.plazo_pago_dias) !== "") s += `, plazo de pago de ${num(fila.plazo_pago_dias)} días`;
  if (txt(fila.fecha_efectiva)) s += ` y fecha efectiva ${fechaAviso(fila.fecha_efectiva)}`;
  if (creador) s += `, elaborada por ${creador}`;
  return s;
}

/** Mensaje final de «tarea de aprobación» — mismo patrón que usa la base de datos. */
export function mensajeTareaAprobacion(descriptor: string, etapa: string): string {
  return `${descriptor}, está pendiente de tu aprobación en BEATS${etapa ? ` (etapa: ${etapa})` : ""}.`;
}

const TABLAS: Record<string, { tabla: string; aprobaciones: string; fk: string }> = {
  evento: { tabla: "solicitudes_evento", aprobaciones: "evento_aprobaciones", fk: "evento_id" },
  convenio: { tabla: "convenios_pago_hcp", aprobaciones: "convenio_aprobaciones", fk: "convenio_id" },
  caf: { tabla: "cafs", aprobaciones: "caf_aprobaciones", fk: "caf_id" },
  convenioHCP: { tabla: "convenios_hcp", aprobaciones: "convenio_hcp_aprobaciones", fk: "convenio_hcp_id" },
};

async function nombreUsuario(id: unknown): Promise<string> {
  if (!id) return "";
  const { data } = await supabase.from("usuarios").select("nombre").eq("id", id as string).maybeSingle();
  return txt(data?.nombre);
}

/** Descriptor de un documento ya guardado (lee las filas necesarias). Devuelve null si no se pudo leer. */
export async function descriptorDeDocumento(tipoDoc: TipoDoc, documentoId: string): Promise<string | null> {
  const def = TABLAS[tipoDoc];
  if (!def) return null;
  const { data: fila } = await supabase.from(def.tabla).select("*").eq("id", documentoId).maybeSingle();
  if (!fila) return null;
  if (tipoDoc === "evento") {
    const [{ data: sesiones }, { data: speakers }] = await Promise.all([
      supabase.from("sesiones_evento").select("*").eq("evento_id", documentoId).order("orden", { ascending: true }),
      supabase.from("evento_speakers_participacion").select("nombre_speaker, orden").eq("evento_id", documentoId).order("orden", { ascending: true }),
    ]);
    return descriptorEvento(fila, sesiones ?? [], (speakers ?? []).map((sp) => txt(sp.nombre_speaker)));
  }
  if (tipoDoc === "convenio") return descriptorConvenio(fila, await nombreUsuario(fila.creado_por_id));
  if (tipoDoc === "caf") return descriptorCaf(fila);
  return descriptorConvenioHcp(fila, await nombreUsuario(fila.creado_por_id));
}

/** Etiqueta de la etapa que hoy espera firma (la primera «pendiente» de la cadena). */
export async function etapaPendiente(tipoDoc: TipoDoc, documentoId: string): Promise<string> {
  const def = TABLAS[tipoDoc];
  if (!def) return "";
  const { data } = await supabase
    .from(def.aprobaciones)
    .select("etiqueta, orden, estado")
    .eq(def.fk, documentoId)
    .eq("estado", "pendiente")
    .order("orden", { ascending: true })
    .limit(1);
  return txt(data?.[0]?.etiqueta);
}

/** Mensaje completo de tarea de aprobación, o null si no se pudo armar (el llamador usa el texto antiguo). */
export async function mensajeTareaDeDocumento(tipoDoc: TipoDoc, documentoId: string, etapaConocida?: string): Promise<string | null> {
  try {
    const [descriptor, etapa] = await Promise.all([
      descriptorDeDocumento(tipoDoc, documentoId),
      etapaConocida ? Promise.resolve(etapaConocida) : etapaPendiente(tipoDoc, documentoId),
    ]);
    return descriptor ? mensajeTareaAprobacion(descriptor, etapa) : null;
  } catch {
    return null;
  }
}
