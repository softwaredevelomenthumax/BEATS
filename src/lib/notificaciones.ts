import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";
import type { Notificacion } from "@/types";
import { rolSatisface, type TipoDoc, type TipoNotificacion } from "@/lib/enums";
import { formatearFechaHora } from "@/lib/fecha";
import { toast } from "sonner";
import { mensajeTareaDeDocumento } from "@/lib/descriptorTarea";
import { ASUNTO, CLAVE } from "@/lib/notificacionesConfig";

function filaANotificacion(fila: Record<string, unknown>): Notificacion {
  return {
    id: fila.id as string,
    paraUsuarioId: fila.para_usuario_id as string,
    tipo: fila.tipo as TipoNotificacion,
    mensaje: fila.mensaje as string,
    documentoRefTipo: (fila.documento_ref_tipo as TipoDoc) ?? null,
    documentoRefId: (fila.documento_ref_id as string) ?? null,
    leida: Boolean(fila.leida),
    creadaEn: fila.creada_en as string,
  };
}

/** Las notificaciones de un usuario, más recientes primero — la campanita del encabezado solo necesita las suyas. */
export async function traerNotificaciones(usuarioId: string): Promise<Notificacion[]> {
  const { data, error } = await supabase
    .from("notificaciones")
    .select("*")
    .eq("para_usuario_id", usuarioId)
    .order("creada_en", { ascending: false })
    .limit(50);
  if (error) throw new Error(mensajeErrorAmigable(error));
  return (data ?? []).map(filaANotificacion);
}

export async function marcarNotificacionLeida(id: string): Promise<void> {
  const { error } = await supabase.from("notificaciones").update({ leida: true }).eq("id", id);
  if (error) throw new Error(mensajeErrorAmigable(error));
}

export async function marcarTodasLeidas(usuarioId: string): Promise<void> {
  const { error } = await supabase
    .from("notificaciones")
    .update({ leida: true })
    .eq("para_usuario_id", usuarioId)
    .eq("leida", false);
  if (error) throw new Error(mensajeErrorAmigable(error));
}

interface ParametrosCrearNotificacion {
  paraUsuarioId: string;
  tipo: TipoNotificacion;
  mensaje: string;
  documentoRefTipo?: TipoDoc;
  documentoRefId?: string;
  /**
   * Fase 2 (correo real): por defecto toda notificación cascada a un correo
   * (ver `fn_notificar_por_email()`, trigger AFTER INSERT sobre esta misma
   * tabla). Pasar `false` aquí evita ESE correo puntual sin dejar de crear
   * la notificación (la campanita en la app sigue avisando igual) — hoy
   * solo hace falta para "aprobado en su totalidad" (ver
   * `notificarResolucionPaso`), porque ese caso ya recibe un correo directo
   * desde el trigger de aprobación del propio documento
   * (`fn_notificar_aprobacion_caf/convenio/convenio_hcp/evento`) y sin este
   * flag llegarían dos correos por el mismo evento.
   */
  enviarEmail?: boolean;
  /** Asunto del correo (si se omite, el trigger usa el genérico según el tipo). Requiere `db/agregar_asunto_notificaciones.sql`. */
  asunto?: string;
  /**
   * Entrega 29: tipo de aviso (ver `CLAVE` en `lib/notificacionesConfig.ts`). El trigger de correo lo usa para aplicar la
   * configuración que haya hecho un Administrador (activo, copias, plantillas). Requiere `db/entrega_29_configuracion_notificaciones.sql`.
   */
  clave?: string;
  /** Entrega 29: datos para las plantillas ({{documento}}, {{etapa}}, {{actor}}, {{motivo}}, {{evento}}). */
  variables?: Record<string, string>;
}

let avisoFalloNotificacionMostrado = false;

async function crearNotificacion(params: ParametrosCrearNotificacion): Promise<void> {
  const fila: Record<string, unknown> = {
    para_usuario_id: params.paraUsuarioId,
    tipo: params.tipo,
    mensaje: params.mensaje,
    documento_ref_tipo: params.documentoRefTipo ?? null,
    documento_ref_id: params.documentoRefId ?? null,
    enviar_email: params.enviarEmail ?? true,
  };
  if (params.asunto) fila.asunto = params.asunto;
  if (params.clave) fila.clave_evento = params.clave;
  if (params.variables && Object.keys(params.variables).length > 0) fila.variables = params.variables;
  let { error } = await supabase.from("notificaciones").insert(fila);
  // Si la columna `enviar_email` aún no existe en la base de datos (migración
  // `notificaciones-enviar-email.sql` sin aplicar), se reintenta sin ella para
  // no perder la notificación de la campana. Igual con `clave_evento`/`variables`
  // (migración de la entrega 29 sin aplicar).
  if (error && /enviar_email|asunto|clave_evento|variables/i.test(error.message ?? "")) {
    delete fila.enviar_email;
    delete fila.asunto;
    delete fila.clave_evento;
    delete fila.variables;
    ({ error } = await supabase.from("notificaciones").insert(fila));
  }
  // Igual que la auditoría: una notificación que falla nunca debe tumbar el
  // flujo principal de aprobación/rechazo del documento — pero ya no falla en
  // silencio: se avisa una vez por sesión para que se corrija la base de datos.
  if (error) {
    console.error("No se pudo crear notificación:", error);
    if (!avisoFalloNotificacionMostrado) {
      avisoFalloNotificacionMostrado = true;
      toast.warning(
        `No se pudo notificar al siguiente responsable (${mensajeErrorAmigable(error)}). Revisa db/corregir_notificaciones.sql.`,
      );
    }
  }
}

/** Lectura mínima de `usuarios` (id, rol, es_administrador) — usada por `resolverPaso*`/`crear*`/`editarYReenviar*` de cada documento para saber a quién notificarle una tarea pendiente o el resultado de una etapa. */
export async function traerUsuariosParaNotificar(): Promise<{ id: string; rol: string; esAdministrador: boolean }[]> {
  // Entrega 20: los usuarios INHABILITADOS (`usuarios.activo = false`) no reciben
  // avisos — igual que ya hacía el trigger de la base de datos
  // (`coalesce(u.activo, true) is true`). Si la columna `activo` todavía no existe
  // (migración `agregar_activo_usuario.sql` sin aplicar), se lee sin ella.
  type FilaUsuario = { id: string; rol: string; es_administrador: boolean | null; activo?: boolean | null };
  const conActivo = await supabase.from("usuarios").select("id, rol, es_administrador, activo");
  let filas = conActivo.data as FilaUsuario[] | null;
  let error = conActivo.error;
  if (error && /activo/i.test(error.message ?? "")) {
    const sinActivo = await supabase.from("usuarios").select("id, rol, es_administrador");
    filas = sinActivo.data as FilaUsuario[] | null;
    error = sinActivo.error;
  }
  if (error) throw new Error(mensajeErrorAmigable(error));
  return (filas ?? [])
    .filter((f) => f.activo !== false)
    .map((f) => ({ id: f.id as string, rol: f.rol as string, esAdministrador: Boolean(f.es_administrador) }));
}

/**
 * Notifica a quienes pueden resolver la etapa indicada (todos los usuarios
 * con ese rol, más todos los administradores) — usada tanto al enviar un
 * documento por primera vez (Fase 2, hallazgo E1: "la notificación al
 * crear/enviar un documento — primer aprobador — nunca ocurre") como al
 * avanzar a la siguiente etapa dentro de `notificarResolucionPaso`.
 */
export async function notificarTareaPendiente(params: {
  tipoDoc: TipoDoc;
  documentoId: string;
  documentoNombre: string;
  rolRequerido: string;
  usuariosConRol: { id: string; rol: string; esAdministrador: boolean }[];
}): Promise<void> {
  const { tipoDoc, documentoId, documentoNombre, rolRequerido, usuariosConRol } = params;
  // Octubre 2026: SOLO quienes tienen el rol de la etapa que toca (ya no todos
  // los administradores). Únicamente si nadie tiene ese rol se avisa a los
  // administradores, para que el documento no quede sin responsable.
  const porRol = usuariosConRol.filter((u) => rolSatisface(u.rol, rolRequerido));
  const destinatarios = porRol.length > 0 ? porRol : usuariosConRol.filter((u) => u.esAdministrador);
  // Octubre 2026 (entrega 25): el mismo texto detallado que reciben los aprobadores
  // de las etapas siguientes (descriptor del documento + etapa). Si no se puede
  // armar, se conserva el aviso breve de antes.
  const mensaje =
    (await mensajeTareaDeDocumento(tipoDoc, documentoId)) ?? `"${documentoNombre}" está esperando tu aprobación.`;
  for (const destinatario of destinatarios) {
    await crearNotificacion({
      paraUsuarioId: destinatario.id,
      tipo: "tarea_pendiente",
      mensaje,
      documentoRefTipo: tipoDoc,
      documentoRefId: documentoId,
      clave: CLAVE.tareaPendiente,
      variables: { documento: documentoNombre },
    });
  }
}

/**
 * Entrega 20 — aviso a TODOS los usuarios (activos) con un rol, con un mensaje y
 * asunto propios. Si nadie tiene ese rol se avisa a los administradores para que
 * la tarea no quede sin responsable. Lo usan las tareas escalonadas de
 * documentos por speaker (`src/lib/tareasEscalonadas.ts`).
 */
export async function notificarRolConMensaje(params: {
  rol: string;
  usuariosConRol: { id: string; rol: string; esAdministrador: boolean }[];
  tipo: TipoNotificacion;
  mensaje: string;
  tipoDoc?: TipoDoc;
  documentoId?: string;
  asunto?: string;
  /** Entrega 29: tipo de aviso configurable (ver `CLAVE`). */
  clave?: string;
  variables?: Record<string, string>;
}): Promise<void> {
  const porRol = params.usuariosConRol.filter((u) => rolSatisface(u.rol, params.rol));
  const destinatarios = porRol.length > 0 ? porRol : params.usuariosConRol.filter((u) => u.esAdministrador);
  for (const destinatario of destinatarios) {
    await crearNotificacion({
      paraUsuarioId: destinatario.id,
      tipo: params.tipo,
      mensaje: params.mensaje,
      documentoRefTipo: params.tipoDoc,
      documentoRefId: params.documentoId,
      asunto: params.asunto,
      clave: params.clave,
      variables: params.variables,
    });
  }
}

/**
 * Fase 2, hallazgo E24 ("notificar que 'X' con rol 'Y' ya resolvió la
 * solicitud, con fecha/hora"): cuando varias personas comparten el mismo rol
 * aprobador, todas ven la misma tarea pendiente en su tablero — apenas UNA
 * de ellas resuelve la etapa, se avisa a los demás para que no dupliquen la
 * revisión. Se dispara tanto en aprobación como en rechazo (en ambos casos
 * deja de haber algo que hacer sobre esa etapa) y nunca al propio actor.
 */
export async function notificarEtapaYaResuelta(params: {
  tipoDoc: TipoDoc;
  documentoId: string;
  documentoNombre: string;
  etiquetaPaso: string;
  decision: "aprobado" | "rechazado";
  rolResuelto: string;
  actorId: string;
  actorNombre: string;
  usuariosConRol: { id: string; rol: string; esAdministrador: boolean }[];
  /** Entrega 24: líneas de persona (CAF) — los demás firmantes posibles de la línea (en vez de buscar por rol). */
  paresIds?: string[];
}): Promise<void> {
  const { tipoDoc, documentoId, documentoNombre, etiquetaPaso, decision, rolResuelto, actorId, actorNombre, usuariosConRol, paresIds } = params;
  const pares = paresIds
    ? usuariosConRol.filter((u) => paresIds.includes(u.id) && u.id !== actorId)
    : usuariosConRol.filter((u) => rolSatisface(u.rol, rolResuelto) && u.id !== actorId);
  if (pares.length === 0) return;
  const fecha = formatearFechaHora(new Date());
  const verbo = decision === "aprobado" ? "aprobó" : "rechazó";
  for (const par of pares) {
    await crearNotificacion({
      paraUsuarioId: par.id,
      tipo: "etapa_resuelta",
      mensaje: `"${documentoNombre}": ${actorNombre} ya ${verbo} la etapa "${etiquetaPaso}" el ${fecha} — no necesitas actuar sobre ella.`,
      documentoRefTipo: tipoDoc,
      documentoRefId: documentoId,
      clave: CLAVE.etapaResueltaColegas,
      asunto: ASUNTO.etapaResueltaColegas,
      variables: { documento: documentoNombre, etapa: etiquetaPaso, actor: actorNombre },
    });
  }
}

/**
 * Notifica el resultado de resolver una etapa de la cadena de aprobación de
 * un documento — se llama desde `resolverPaso*` de cada tipo de documento
 * (caf/convenio/convenioHCP/evento), junto al registro de auditoría que ya
 * existía. 4 casos, alineados con los 3 valores de `tipo_notificacion`:
 *  - rechazo: al creador del documento.
 *  - etapa_resuelta (E24): a los demás usuarios con el mismo rol de la etapa
 *    que se acaba de resolver, para que no dupliquen la revisión.
 *  - etapa_resuelta: al creador — si la cadena ya terminó, avisa que el
 *    documento quedó aprobado en su totalidad (E1: antes no existía ningún
 *    aviso de "proceso completado" para quien lo solicitó); si no, avisa
 *    que avanzó una etapa más.
 *  - tarea_pendiente: a cada usuario con el rol requerido por la SIGUIENTE
 *    etapa pendiente (o a todos los administradores si nadie tiene ese rol
 *    todavía) — son quienes ahora pueden actuar.
 */
export async function notificarResolucionPaso(params: {
  tipoDoc: TipoDoc;
  documentoId: string;
  documentoNombre: string;
  etiquetaPaso: string;
  rolResuelto: string;
  decision: "aprobado" | "rechazado";
  esFinal: boolean;
  creadorId: string;
  actorId: string;
  actorNombre: string;
  siguienteRolRequerido?: string;
  /** Quienes ya aprobaron etapas anteriores de esta cadena (se les avisa del resultado final o de un rechazo posterior). */
  aprobadoresIds?: string[];
  usuariosConRol: { id: string; rol: string; esAdministrador: boolean }[];
  /** Entrega 24: ver `notificarEtapaYaResuelta`. */
  paresIds?: string[];
}): Promise<void> {
  const {
    tipoDoc,
    documentoId,
    documentoNombre,
    etiquetaPaso,
    rolResuelto,
    decision,
    esFinal,
    creadorId,
    actorId,
    actorNombre,
    siguienteRolRequerido,
    aprobadoresIds = [],
    usuariosConRol,
    paresIds,
  } = params;

  await notificarEtapaYaResuelta({
    tipoDoc,
    documentoId,
    documentoNombre,
    etiquetaPaso,
    decision,
    rolResuelto,
    actorId,
    actorNombre,
    usuariosConRol,
    paresIds,
  });

  if (decision === "rechazado") {
    await crearNotificacion({
      paraUsuarioId: creadorId,
      tipo: "rechazo",
      mensaje: `"${documentoNombre}" fue rechazado en la etapa "${etiquetaPaso}".`,
      documentoRefTipo: tipoDoc,
      documentoRefId: documentoId,
      clave: CLAVE.rechazoSolicitante,
      asunto: ASUNTO.rechazoSolicitante,
      variables: { documento: documentoNombre, etapa: etiquetaPaso, actor: actorNombre },
    });
    // Quienes ya habían aprobado una etapa anterior también deben saber que
    // el documento se rechazó después.
    for (const id of aprobadoresIds) {
      if (id === creadorId || id === actorId) continue;
      await crearNotificacion({
        paraUsuarioId: id,
        tipo: "rechazo",
        mensaje: `"${documentoNombre}", que ya habías aprobado, fue rechazado en la etapa "${etiquetaPaso}" por ${actorNombre}.`,
        documentoRefTipo: tipoDoc,
        documentoRefId: documentoId,
        asunto: ASUNTO.rechazoAprobadoresPrevios,
        clave: CLAVE.rechazoAprobadoresPrevios,
        variables: { documento: documentoNombre, etapa: etiquetaPaso, actor: actorNombre },
      });
    }
    return;
  }

  await crearNotificacion({
    paraUsuarioId: creadorId,
    tipo: "etapa_resuelta",
    mensaje: esFinal
      ? `"${documentoNombre}" fue aprobado en su totalidad.`
      : `"${documentoNombre}" avanzó: la etapa "${etiquetaPaso}" fue aprobada.`,
    documentoRefTipo: tipoDoc,
    documentoRefId: documentoId,
    // esFinal: el trigger fn_notificar_aprobacion_* del propio documento ya
    // le manda un correo directo al creador en el mismo instante en que la
    // cadena se completa — este insert solo debe encender la campanita,
    // nunca un segundo correo por el mismo evento.
    enviarEmail: !esFinal,
    clave: esFinal ? CLAVE.aprobacionFinalSolicitante : CLAVE.etapaAprobada,
    asunto: esFinal ? undefined : ASUNTO.etapaAprobada,
    variables: { documento: documentoNombre, etapa: etiquetaPaso, actor: actorNombre },
  });

  if (esFinal) {
    // Resultado final del flujo para todos los que participaron en él.
    for (const id of new Set([...aprobadoresIds])) {
      if (id === creadorId || id === actorId) continue;
      await crearNotificacion({
        paraUsuarioId: id,
        tipo: "etapa_resuelta",
        mensaje: `"${documentoNombre}" completó todo el flujo de aprobación: fue APROBADO en su totalidad.`,
        documentoRefTipo: tipoDoc,
        documentoRefId: documentoId,
        asunto: ASUNTO.aprobacionFinalParticipantes,
        clave: CLAVE.aprobacionFinalParticipantes,
        variables: { documento: documentoNombre, actor: actorNombre },
      });
    }
  }

  if (siguienteRolRequerido) {
    await notificarTareaPendiente({ tipoDoc, documentoId, documentoNombre, rolRequerido: siguienteRolRequerido, usuariosConRol });
  }
}

/** Aviso al creador cuando su documento se DEVUELVE (suspende el flujo para que lo corrija). */
export async function notificarDocumentoDevuelto(params: {
  tipoDoc: TipoDoc;
  documentoId: string;
  documentoNombre: string;
  creadorId: string;
  actorNombre: string;
  motivo: string;
}): Promise<void> {
  await crearNotificacion({
    paraUsuarioId: params.creadorId,
    tipo: "rechazo",
    mensaje: `"${params.documentoNombre}" fue DEVUELTO por ${params.actorNombre}. Motivo: ${params.motivo}`,
    documentoRefTipo: params.tipoDoc,
    documentoRefId: params.documentoId,
    asunto: ASUNTO.devolucion,
    clave: CLAVE.devolucion,
    variables: { documento: params.documentoNombre, actor: params.actorNombre, motivo: params.motivo },
  });
}
