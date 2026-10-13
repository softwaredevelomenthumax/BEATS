import { supabase } from "@/lib/supabaseClient";
import { notificarRolConMensaje, traerUsuariosParaNotificar } from "@/lib/notificaciones";
import { ASUNTO, CLAVE } from "@/lib/notificacionesConfig";

/**
 * Entrega 20 — tareas escalonadas por speaker, con aviso (campana + correo) a
 * Dirección Médica cada vez que una etapa genera trabajo nuevo.
 *
 * Instrucción: "las tareas se deben generar escalonadamente, según el flujo de
 * aprobación. La solicitud inicial es la de evento educativo y promocional.
 * Esta puede generar la necesidad de FMV Checklist y de Solicitud de convenio
 * de pago a HCP. Ambas pueden llegar en simultánea como tareas y notificación
 * por correo. Luego, una vez ambos documentos están firmados, se genera la
 * solicitud de CAF y de convenio, las cuales se pueden trabajar
 * simultáneamente."
 *
 *   Evento (el Director Médico aprueba su etapa)
 *      └─► tareas: FMV Checklist + Convenio de Pago a HCP   [`avisarTareasFmvYConvenioPago`]
 *            FMV "Completado" + Convenio de Pago "Aprobado"
 *               └─► tareas: CAF + Convenio HCP              [`avisarTareasCafYConvenioHCP`]
 *
 * El panel "Tareas pendientes" aplica la misma regla (ver `tareasPorSpeaker`
 * en `documentosRequeridosEvento.ts`); aquí vive solo el AVISO. Ninguna función
 * de este archivo lanza: un aviso que falla nunca debe tumbar la aprobación o
 * la firma que lo originó (la tarea sigue visible en el panel).
 */

const ROL_DIRECCION_MEDICA = "medica";

const ESTADOS_ACTIVOS_EXCLUIDOS = ["Rechazado", "Anulado"];

/** Tarea "FMV Checklist + Convenio de Pago": el Director Médico acaba de aprobar su etapa de la Solicitud de Evento. */
export async function avisarTareasFmvYConvenioPago(params: {
  eventoId: string;
  nombreEvento: string;
  /** Fecha o rango del evento (texto ya formateado); opcional. */
  fechas?: string;
  /** Nombres de los speakers EXTERNOS declarados en la solicitud (los internos no generan FMV ni convenio de pago). */
  nombresSpeakers: string[];
}): Promise<void> {
  try {
    const { eventoId, nombreEvento, nombresSpeakers, fechas } = params;
    const quienes = nombresSpeakers.length > 0 ? ` de: ${nombresSpeakers.join("; ")}` : "";
    const usuariosConRol = await traerUsuariosParaNotificar();
    await notificarRolConMensaje({
      rol: ROL_DIRECCION_MEDICA,
      usuariosConRol,
      tipo: "tarea_pendiente",
      mensaje: `Evento "${nombreEvento}"${fechas ? ` (${fechas})` : ""}: ya puedes diligenciar el MD FMV Checklist y la Solicitud de Convenio de Pago a HCP${quienes}. Encuentras ambas tareas en "Tareas pendientes".`,
      tipoDoc: "evento",
      documentoId: eventoId,
      asunto: ASUNTO.tareasFmvConvenioPago,
      clave: CLAVE.tareasFmvConvenioPago,
      variables: { evento: nombreEvento },
    });
  } catch (error) {
    console.error("No se pudo avisar las tareas de FMV Checklist y Convenio de Pago:", error);
  }
}

interface FilaDocumento {
  id: string;
  estado: string;
  speaker_id: string | null;
}

async function filasDelEvento(tabla: string, eventoOrigenId: string): Promise<FilaDocumento[]> {
  const { data, error } = await supabase.from(tabla).select("id, estado, speaker_id").eq("evento_origen_id", eventoOrigenId);
  if (error) throw error;
  return (data ?? []) as FilaDocumento[];
}

/** Filas que corresponden al speaker (o, si el documento no trae speaker, a todo el evento). */
function delSpeaker(filas: FilaDocumento[], speakerId: string | null): FilaDocumento[] {
  if (!speakerId) return filas;
  const conSpeaker = filas.filter((f) => f.speaker_id);
  if (conSpeaker.length === 0) return filas; // ningún documento del evento trae speaker: regla a nivel de evento
  return conSpeaker.filter((f) => f.speaker_id === speakerId);
}

/**
 * ¿Ya están firmados el FMV Checklist ("Completado") Y el Convenio de Pago
 * ("Aprobado") de este speaker en este evento, y todavía no existe ni su CAF ni
 * su Convenio HCP? Función pura sobre las filas ya leídas (se prueba sin red).
 */
export function corresponderiaAvisoCafYConvenioHCP(params: {
  fmvs: FilaDocumento[];
  convenios: FilaDocumento[];
  cafs: FilaDocumento[];
  conveniosHCP: FilaDocumento[];
  speakerId: string | null;
}): boolean {
  const { fmvs, convenios, cafs, conveniosHCP, speakerId } = params;
  const fmvFirmado = delSpeaker(fmvs, speakerId).some((f) => f.estado === "Completado");
  const convenioFirmado = delSpeaker(convenios, speakerId).some((f) => f.estado === "Aprobado");
  if (!fmvFirmado || !convenioFirmado) return false;
  const yaHayCaf = delSpeaker(cafs, speakerId).some((f) => !ESTADOS_ACTIVOS_EXCLUIDOS.includes(f.estado));
  const yaHayConvenioHCP = delSpeaker(conveniosHCP, speakerId).some((f) => !ESTADOS_ACTIVOS_EXCLUIDOS.includes(f.estado));
  return !yaHayCaf && !yaHayConvenioHCP;
}

/**
 * Tarea "CAF + Convenio HCP": se llama cada vez que un FMV queda Completado o un
 * Convenio de Pago queda Aprobado. Solo avisa cuando, con ese último documento,
 * ya están firmados los DOS del speaker (el que firma de segundo es el que
 * dispara el aviso; el primero no avisa nada).
 */
export async function avisarTareasCafYConvenioHCP(params: {
  eventoOrigenId: string | null;
  speakerId: string | null;
  nombreSpeaker: string;
}): Promise<void> {
  try {
    const { eventoOrigenId, speakerId, nombreSpeaker } = params;
    if (!eventoOrigenId) return;
    const [fmvs, convenios, cafs, conveniosHCP] = await Promise.all([
      filasDelEvento("fmv_checklists", eventoOrigenId),
      filasDelEvento("convenios_pago_hcp", eventoOrigenId),
      filasDelEvento("cafs", eventoOrigenId).catch(() => [] as FilaDocumento[]), // `cafs.speaker_id` puede no existir todavía
      filasDelEvento("convenios_hcp", eventoOrigenId),
    ]);
    if (!corresponderiaAvisoCafYConvenioHCP({ fmvs, convenios, cafs, conveniosHCP, speakerId })) return;

    const { data: evento } = await supabase.from("solicitudes_evento").select("nombre_evento").eq("id", eventoOrigenId).maybeSingle();
    const nombreEvento = (evento?.nombre_evento as string | undefined) || "evento";
    const usuariosConRol = await traerUsuariosParaNotificar();
    await notificarRolConMensaje({
      rol: ROL_DIRECCION_MEDICA,
      usuariosConRol,
      tipo: "tarea_pendiente",
      mensaje: `Evento "${nombreEvento}"${nombreSpeaker ? ` — ${nombreSpeaker}` : ""}: el MD FMV Checklist y el Convenio de Pago a HCP ya están firmados. Ya puedes elaborar el CAF y el Convenio HCP (puedes trabajarlos al mismo tiempo). Encuentras ambas tareas en "Tareas pendientes".`,
      tipoDoc: "evento",
      documentoId: eventoOrigenId,
      asunto: ASUNTO.tareasCafConvenioHcp,
      clave: CLAVE.tareasCafConvenioHcp,
      variables: { evento: nombreEvento },
    });
  } catch (error) {
    console.error("No se pudo avisar las tareas de CAF y Convenio HCP:", error);
  }
}

/**
 * Entrega 28, pedido explícito: «después que el gerente / Rep. Legal firma el convenio, se debe generar una tarea para el
 * Director Médico en la que se recuerde el envío del convenio firmado al HCP».
 *
 * Aquí vive el AVISO (campana + correo) que se envía a Dirección Médica en el momento en que Gerencia General / Rep. Legal
 * firma el Convenio HCP (última etapa de su cadena). La TAREA en sí es viva: «Tareas pendientes» la muestra mientras el
 * convenio esté firmado y todavía no se haya enviado al HCP (ver `convenioHcpPendienteDeEnvio`), así que no depende de que
 * este aviso llegue. Como las demás funciones de este archivo, nunca lanza: un aviso que falla no debe tumbar la firma.
 */
export async function avisarEnvioConvenioHCPFirmado(params: {
  convenioId: string;
  consultorNombre: string;
  eventoOrigenId: string | null;
}): Promise<void> {
  try {
    const { convenioId, consultorNombre, eventoOrigenId } = params;
    let nombreEvento = "";
    if (eventoOrigenId) {
      const { data } = await supabase.from("solicitudes_evento").select("nombre_evento").eq("id", eventoOrigenId).maybeSingle();
      nombreEvento = (data?.nombre_evento as string | undefined) ?? "";
    }
    const usuariosConRol = await traerUsuariosParaNotificar();
    await notificarRolConMensaje({
      rol: ROL_DIRECCION_MEDICA,
      usuariosConRol,
      tipo: "tarea_pendiente",
      mensaje: `Convenio HCP de ${consultorNombre || "(sin consultor)"}${nombreEvento ? ` — evento "${nombreEvento}"` : ""}: Gerencia General / Rep. Legal ya lo firmó. Recuerda enviarlo al HCP para su firma (botón «Enviar al HCP para firma», en el convenio o en el Expediente del evento). Encuentras la tarea en "Tareas pendientes".`,
      tipoDoc: "convenioHCP",
      documentoId: convenioId,
      asunto: ASUNTO.tareaEnviarConvenioHcp,
      clave: CLAVE.tareaEnviarConvenioHcp,
      variables: { evento: nombreEvento },
    });
  } catch (error) {
    console.error("No se pudo avisar el envío pendiente del Convenio HCP firmado:", error);
  }
}

/**
 * Entrega 36, pedido explícito: al cargar facturas de un speaker en el Expediente del evento debe activarse la tarea de
 * generar la Notificación de Pago a HCP. La TAREA es viva («Tareas pendientes» la deriva de las facturas sin notificar,
 * ver `tareasNotificacionPagoPorSpeaker`); aquí vive el AVISO (campana + correo) a Dirección Médica. Una sola notificación
 * por carga, aunque se hayan agregado varias facturas del mismo speaker. Nunca lanza: un aviso que falla no debe tumbar
 * la carga de la factura.
 */
export async function avisarTareaNotificacionPago(params: {
  eventoId: string;
  speakerId: string | null;
  /** Números de las facturas recién cargadas. */
  numerosFactura: string[];
}): Promise<void> {
  try {
    const { eventoId, speakerId, numerosFactura } = params;
    const [evento, speaker] = await Promise.all([
      supabase.from("solicitudes_evento").select("nombre_evento").eq("id", eventoId).maybeSingle(),
      speakerId ? supabase.from("speakers").select("nombre_completo").eq("id", speakerId).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const nombreEvento = (evento.data?.nombre_evento as string | undefined) || "evento";
    const nombreSpeaker = (speaker.data?.nombre_completo as string | undefined) || "";
    const facturas = numerosFactura.filter(Boolean).join(", ");
    const usuariosConRol = await traerUsuariosParaNotificar();
    await notificarRolConMensaje({
      rol: ROL_DIRECCION_MEDICA,
      usuariosConRol,
      tipo: "tarea_pendiente",
      mensaje: `Evento "${nombreEvento}"${nombreSpeaker ? ` — ${nombreSpeaker}` : ""}: se cargó ${numerosFactura.length === 1 ? "la factura" : "las facturas"}${facturas ? ` ${facturas}` : ""} en el Expediente. Ya puedes generar la Notificación de Pago a HCP. Encuentras la tarea en "Tareas pendientes".`,
      tipoDoc: "evento",
      documentoId: eventoId,
      asunto: ASUNTO.tareaNotificacionPago,
      clave: CLAVE.tareaNotificacionPago,
      variables: { evento: nombreEvento },
    });
  } catch (error) {
    console.error("No se pudo avisar la tarea de Notificación de Pago a HCP:", error);
  }
}

/**
 * ¿El Convenio HCP ya quedó firmado por la compañía (cadena completa) y todavía no se ha enviado al HCP ni se recibió su
 * versión firmada? Es la condición de la tarea «Enviar el convenio firmado al HCP» de Dirección Médica.
 */
export function convenioHcpPendienteDeEnvio(c: {
  estado: string;
  archivoParaHCPEnviadoEn: string | null;
  archivoFirmadoHCPId: string | null;
  /** Entrega 32: el convenio del aplicativo corporativo no se envía desde BEATS (no hay documento que enviar). */
  elaboradoEnContratosCorporativo?: boolean;
}): boolean {
  return !c.elaboradoEnContratosCorporativo && (c.estado === "Aprobado" || c.estado === "Completado") && !c.archivoParaHCPEnviadoEn && !c.archivoFirmadoHCPId;
}

