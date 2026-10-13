import { notificarDocumentoDevuelto } from "@/lib/notificaciones";
import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";
import { devolverDocumentoRpc } from "@/lib/documentosRpc";
import { registrarAuditoria } from "@/lib/auditoria";
import { formatearFecha } from "@/lib/fecha";
import type { EstadoDoc, TipoDoc } from "@/lib/enums";
import type { PasoAprobacion } from "@/lib/aprobaciones";
import type { Usuario } from "@/types";

/**
 * Fase de ciclo de vida de documentos (septiembre 2026) — instrucción
 * explícita del usuario: (1) "Guardar borrador" debe poder repetirse las
 * veces que haga falta en cualquier formulario de "Crear documento" y en
 * HCPs/Speakers; (2) un documento en Borrador debe poder reabrirse para
 * edición indefinidamente antes de enviarse a aprobación; (3) un documento
 * ya enviado (Pendiente) puede "devolverse" — suspender el flujo y
 * reabrirlo para edición, quedando en un estado distinto ("Devuelto") — pero
 * SOLO si ningún paso de su cadena de aprobación tiene todavía una firma;
 * (4) si ya hay al menos una firma, la única vía es que el creador solicite
 * una "enmienda" justificada, que habilita el documento para el ajuste y su
 * reenvío; (5) ninguna de estas correcciones se permite si faltan menos de 7
 * días para el inicio del evento vinculado (o si el evento ya inició) — debe
 * mostrarse un mensaje explícito con el motivo; (6) todo esto debe quedar
 * trazado en Historial y Auditoría.
 *
 * Este módulo centraliza la parte de esa lógica que es idéntica para los 4
 * tipos de documento con cadena de aprobación (Evento, Convenio de Pago a
 * HCP, CAF, Convenio HCP) — FMV y Notificación de Pago no la necesitan
 * porque no tienen cadena (pasan directo de Borrador a Completado, ver
 * `documentoUnicoFirmante.ts`): solo les aplica la reapertura de Borrador,
 * que cada uno implementa con su propio `editarBorrador*` sobre su propia
 * tabla.
 *
 * Decisión de diseño deliberada: tanto "devolver" como "solicitar enmienda"
 * son funciones NUEVAS que la app original nunca tuvo (a diferencia de la
 * adenda de Evento, que reutiliza una RPC real pre-existente
 * `abrir_ventana_adenda_evento`) — no hay ninguna RPC real que reconstruir
 * aquí. "Enmienda" reutiliza las mismas columnas `adenda_ventana_*` que ya
 * existen en las 4 tablas (actor/expira/justificación) en vez de crear
 * columnas nuevas: conceptualmente es la misma idea ("abrir una ventana de
 * edición justificada con vigencia de 7 días") aplicada a un documento
 * Pendiente con firmas en vez de a uno ya Aprobado. "Devolver" no necesita
 * ventana con vigencia — es una transición de estado directa (Pendiente →
 * Devuelto) que, a diferencia de "editar y reenviar" (que confía en un
 * trigger real del servidor para reiniciar la cadena al volver a
 * "Pendiente"), no toca la cadena de aprobación en absoluto: como ningún
 * paso tiene firma todavía, la cadena ya está exactamente como debe quedar
 * (todo "pendiente") — reenviar después de un "Devuelto" es un `.update()`
 * simple a `estado: "Pendiente"` sin necesitar ese trigger.
 */

export const DIAS_MINIMOS_ANTES_EVENTO = 7;
/** Misma vigencia que la ventana de adenda ya existente (Convenio/ConvenioHCP/Evento) — se reutiliza por consistencia. */
export const DIAS_VIGENCIA_VENTANA_ENMIENDA = 7;

export interface ResultadoBloqueoProximidad {
  bloqueado: boolean;
  mensaje: string | null;
  diasRestantes: number | null;
}

function formatearFechaLegible(fechaIso: string): string {
  return formatearFecha(fechaIso);
}

/**
 * Regla de negocio pedida explícitamente: si faltan menos de
 * `DIAS_MINIMOS_ANTES_EVENTO` días para el inicio del evento vinculado (o el
 * evento ya inició), el documento no puede corregirse por ninguna vía —
 * reactivar un borrador, devolver, o solicitar una enmienda — y debe
 * mostrarse un mensaje explícito con el motivo. Si no se conoce la fecha del
 * evento (documento sin evento de origen vinculado, o fecha sin registrar)
 * la regla simplemente no aplica: no hay nada contra qué medir la
 * proximidad.
 */
export function evaluarBloqueoPorProximidadEvento(
  fechaInicioEvento: string | null | undefined,
): ResultadoBloqueoProximidad {
  if (!fechaInicioEvento) return { bloqueado: false, mensaje: null, diasRestantes: null };
  const inicio = new Date(fechaInicioEvento).getTime();
  if (Number.isNaN(inicio)) return { bloqueado: false, mensaje: null, diasRestantes: null };

  const dias = Math.ceil((inicio - Date.now()) / 86_400_000);
  if (dias >= DIAS_MINIMOS_ANTES_EVENTO) return { bloqueado: false, mensaje: null, diasRestantes: dias };

  const fechaLegible = formatearFechaLegible(fechaInicioEvento);
  const mensaje =
    dias < 0
      ? `No es posible corregir este documento: el evento vinculado (${fechaLegible}) ya inició.`
      : `No es posible corregir este documento: solo falta${dias === 1 ? "" : "n"} ${dias} día${dias === 1 ? "" : "s"} para el inicio del evento vinculado (${fechaLegible}), y la política exige al menos ${DIAS_MINIMOS_ANTES_EVENTO} días de anticipación para cualquier corrección.`;
  return { bloqueado: true, mensaje, diasRestantes: dias };
}

/** Trae solo la fecha de inicio de un evento por id — usada por los otros 5 tipos de documento (vinculados vía `eventoOrigenId`) para evaluar la regla de proximidad sin traer el evento completo. */
export async function traerFechaInicioEventoPorId(eventoId: string | null | undefined): Promise<string | null> {
  if (!eventoId) return null;
  const { data, error } = await supabase
    .from("solicitudes_evento")
    .select("fecha_inicio_evento")
    .eq("id", eventoId)
    .maybeSingle();
  if (error) throw new Error(mensajeErrorAmigable(error));
  return (data?.fecha_inicio_evento as string | null) ?? null;
}

/** Al menos un paso de la cadena ya fue aprobado — un rechazo no cuenta como firma (ya tiene su propia vía de corrección: "Editar y reenviar"). */
export function tieneAlMenosUnaFirma(pasos: PasoAprobacion[]): boolean {
  // Entrega 24: las líneas automáticas (solicitante, N/A...) las firma el sistema al enviar; no cuentan como firma de un aprobador.
  return pasos.some((p) => p.estado === "aprobado" && !p.automatica);
}

/** Un documento Pendiente sin ninguna firma todavía puede devolverse (suspender + reabrir). */
export function puedeDevolverDocumento(estado: EstadoDoc, pasos: PasoAprobacion[]): boolean {
  return estado === "Pendiente" && !tieneAlMenosUnaFirma(pasos);
}

/** Un documento Pendiente que ya tiene al menos una firma solo puede corregirse solicitando una enmienda. */
export function puedeSolicitarEnmienda(estado: EstadoDoc, pasos: PasoAprobacion[]): boolean {
  return estado === "Pendiente" && tieneAlMenosUnaFirma(pasos);
}

/**
 * Un documento en Borrador no se anula: se elimina (solo quien lo creó, ver
 * `eliminarBorrador*`). El servidor lo rechaza con "Desde Borrador solo
 * puedes guardar (Borrador) o enviar a aprobación (Pendiente)" — por eso la
 * interfaz ya no ofrece "Anular" en ese estado. Tampoco aplica sobre uno ya
 * Anulado.
 */
export function puedeAnularSegunEstado(estado: EstadoDoc): boolean {
  return estado !== "Borrador" && estado !== "Anulado";
}

/** Un Borrador o un Devuelto se editan exactamente igual — las veces que haga falta, sin límite, antes de (re)enviarse. */
export function puedeEditarComoBorrador(estado: EstadoDoc): boolean {
  return estado === "Borrador" || estado === "Devuelto";
}

/**
 * "Devuelve" un documento Pendiente sin firmas: lo suspende (sale de la
 * cadena de aprobación activa) y lo deja en estado "Devuelto", editable como
 * un borrador. No toca la tabla de aprobaciones — al no haber firmas
 * todavía, ya está en el estado correcto para cuando se reenvíe.
 */
export async function devolverDocumento(params: {
  tabla: string;
  tipoDoc: TipoDoc;
  documentoId: string;
  documentoNombre: string;
  motivo: string;
  usuario: Usuario;
}): Promise<void> {
  const motivoLimpio = params.motivo.trim();
  if (!motivoLimpio) throw new Error("Debes indicar el motivo de la devolución.");

  await devolverDocumentoRpc(params.tipoDoc, params.documentoId, params.tabla);

  await registrarAuditoria({
    documentoId: params.documentoId,
    tipoDoc: params.tipoDoc,
    documentoNombre: params.documentoNombre,
    actorId: params.usuario.id,
    accion: "devuelto",
    detalle: motivoLimpio,
  });

  // Avisar al creador (campana + correo). Un fallo aquí nunca revierte la devolución.
  try {
    const { data } = await supabase.from(params.tabla).select("creado_por_id").eq("id", params.documentoId).maybeSingle();
    const creadorId = (data?.creado_por_id as string | undefined) ?? null;
    if (creadorId) {
      await notificarDocumentoDevuelto({
        tipoDoc: params.tipoDoc,
        documentoId: params.documentoId,
        documentoNombre: params.documentoNombre,
        creadorId,
        actorNombre: params.usuario.nombre,
        motivo: motivoLimpio,
      });
    }
  } catch (e) {
    console.error("No se pudo notificar la devolución:", e);
  }
}

/**
 * Abre la ventana de enmienda (mismas columnas `adenda_ventana_*` que la
 * adenda de documentos Aprobados) sobre un documento Pendiente que ya tiene
 * al menos una firma — habilita su edición sin cambiar todavía el estado
 * (`editarYReenviar*` de cada documento hace esa transición al guardar).
 */
export async function solicitarEnmiendaDocumento(params: {
  tabla: string;
  tipoDoc: TipoDoc;
  documentoId: string;
  documentoNombre: string;
  justificacion: string;
  usuario: Usuario;
}): Promise<{ expiraEn: string }> {
  const justificacionLimpia = params.justificacion.trim();
  if (!justificacionLimpia) throw new Error("La justificación de la enmienda es obligatoria.");

  const expiraEn = new Date(Date.now() + DIAS_VIGENCIA_VENTANA_ENMIENDA * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from(params.tabla)
    .update({
      adenda_ventana_actor_id: params.usuario.id,
      adenda_ventana_expira_en: expiraEn,
      adenda_ventana_justificacion: justificacionLimpia,
    })
    .eq("id", params.documentoId);
  if (error) throw new Error(mensajeErrorAmigable(error));

  await registrarAuditoria({
    documentoId: params.documentoId,
    tipoDoc: params.tipoDoc,
    documentoNombre: params.documentoNombre,
    actorId: params.usuario.id,
    accion: "enmienda_solicitada",
    detalle: justificacionLimpia,
  });

  return { expiraEn };
}

/** Cierra la ventana de enmienda abierta con `solicitarEnmiendaDocumento` — se llama después de guardar y reenviar el documento corregido. */
export async function cerrarVentanaEnmiendaDocumento(params: { tabla: string; documentoId: string }): Promise<void> {
  const { error } = await supabase
    .from(params.tabla)
    .update({
      adenda_ventana_actor_id: null,
      adenda_ventana_expira_en: null,
      adenda_ventana_justificacion: null,
    })
    .eq("id", params.documentoId);
  if (error) throw new Error(mensajeErrorAmigable(error));
}
