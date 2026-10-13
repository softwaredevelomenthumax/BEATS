import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";

/**
 * Entrega 29 — configuración de las notificaciones por correo.
 *
 * Una «clave» identifica un tipo de aviso concreto (p. ej. `rechazo.solicitante`). La app marca cada
 * fila que inserta en `notificaciones` con su clave (`clave_evento`); las filas que crea la base de
 * datos se clasifican con un trigger. El trigger de correo (`fn_notificar_por_email`, ver
 * `db/entrega_29_configuracion_notificaciones.sql`) consulta `notificaciones_config` por esa clave:
 *   - activo / inactivo (la campanita dentro de la app NO se afecta),
 *   - copias (CC) a roles y usuarios, y a administradores (como hasta ahora) o no,
 *   - plantilla de asunto y de cuerpo.
 * Sin fila de configuración = comportamiento de siempre.
 *
 * Este archivo es la FUENTE ÚNICA de los asuntos por defecto: `notificaciones.ts` los usa al crear los
 * avisos y la pantalla de configuración los muestra como punto de partida de la plantilla.
 */

export type GrupoNotificacion = "flujo" | "tareas" | "directos";

export const ETIQUETA_GRUPO_NOTIFICACION: Record<GrupoNotificacion, string> = {
  flujo: "Flujo de aprobación",
  tareas: "Tareas por speaker (Dirección Médica)",
  directos: "Avisos que la base de datos envía directamente",
};

export interface VariablePlantilla {
  clave: string;
  descripcion: string;
  /** `false` = solo la trae el aviso cuando lo crea la app (si lo crea la base de datos queda vacío). */
  siempre: boolean;
}

export const VARIABLES_COMUNES: VariablePlantilla[] = [
  { clave: "nombre", descripcion: "Nombre de quien recibe el correo", siempre: true },
  { clave: "mensaje", descripcion: "Texto del aviso: el que arma BEATS, o el que redactes en «Redacción de {{mensaje}}»", siempre: true },
  { clave: "tipo_documento", descripcion: "Tipo de documento (Solicitud de Evento, CAF…)", siempre: true },
  { clave: "fecha", descripcion: "Fecha y hora del envío (hora de Colombia)", siempre: true },
  { clave: "enlace", descripcion: "Botón/enlace para abrir el documento en BEATS", siempre: true },
];

const V_DOCUMENTO: VariablePlantilla = { clave: "documento", descripcion: "Nombre del documento", siempre: false };
const V_ETAPA: VariablePlantilla = { clave: "etapa", descripcion: "Etapa de la cadena de aprobación", siempre: false };
const V_ACTOR: VariablePlantilla = { clave: "actor", descripcion: "Persona que ejecutó la acción", siempre: false };
const V_MOTIVO: VariablePlantilla = { clave: "motivo", descripcion: "Motivo indicado por quien devolvió", siempre: false };
const V_EVENTO: VariablePlantilla = { clave: "evento", descripcion: "Nombre del evento", siempre: false };

export interface DefinicionNotificacion {
  clave: string;
  grupo: GrupoNotificacion;
  nombre: string;
  /** Cuándo se envía. */
  cuando: string;
  /** A quién llega de forma natural (la regla del flujo, no editable). */
  destinatarios: string;
  /** Regla de negocio ya establecida que esta pantalla NO cambia. */
  regla: string;
  configurable: boolean;
  motivoNoConfigurable?: string;
  variablesExtra: VariablePlantilla[];
  asuntoPorDefecto: string;
  cuerpoPorDefecto: string;
  ejemplo: Record<string, string>;
}

export const CUERPO_POR_DEFECTO = "Hola {{nombre}},\n\n{{mensaje}}\n\n{{enlace}}";

// Asuntos por defecto (los mismos que ya se enviaban).
export const ASUNTO = {
  tareaPendiente: "BEATS: tienes una tarea pendiente",
  etapaAprobada: "BEATS: tu solicitud avanzó en el flujo de aprobación",
  etapaResueltaColegas: "BEATS: un colega ya resolvió una tarea que también te correspondía",
  aprobacionFinalParticipantes: "BEATS: solicitud aprobada en su totalidad",
  rechazoSolicitante: "BEATS: una solicitud tuya fue rechazada",
  rechazoAprobadoresPrevios: "BEATS: una solicitud que aprobaste fue rechazada",
  devolucion: "BEATS: una solicitud tuya fue devuelta",
  tareasFmvConvenioPago: "BEATS: nuevas tareas — FMV Checklist y Convenio de Pago a HCP",
  tareasCafConvenioHcp: "BEATS: nuevas tareas — CAF y Convenio HCP",
  tareaEnviarConvenioHcp: "BEATS: tarea — enviar al HCP el Convenio HCP firmado",
  tareaNotificacionPago: "BEATS: tarea — generar la Notificación de Pago a HCP",
} as const;

export const CLAVE = {
  tareaPendiente: "tarea_pendiente.aprobadores",
  etapaAprobada: "etapa_aprobada.solicitante",
  etapaResueltaColegas: "etapa_resuelta.colegas",
  aprobacionFinalSolicitante: "aprobacion_final.solicitante",
  aprobacionFinalParticipantes: "aprobacion_final.participantes",
  rechazoSolicitante: "rechazo.solicitante",
  rechazoAprobadoresPrevios: "rechazo.aprobadores_previos",
  devolucion: "devolucion.solicitante",
  tareasFmvConvenioPago: "tareas.fmv_convenio_pago",
  tareasCafConvenioHcp: "tareas.caf_convenio_hcp",
  tareaEnviarConvenioHcp: "tareas.enviar_convenio_hcp",
  tareaNotificacionPago: "tareas.notificacion_pago",
} as const;

const EJEMPLO_BASE = {
  nombre: "Ana Martínez",
  tipo_documento: "Solicitud de Evento",
  fecha: "07/10/2026 14:30",
  documento: "Simposio de Neurología 2026",
  etapa: "Dirección Médica",
  actor: "Carlos Pérez",
  evento: "Simposio de Neurología 2026",
};

export const CATALOGO_NOTIFICACIONES: DefinicionNotificacion[] = [
  {
    clave: CLAVE.tareaPendiente,
    grupo: "flujo",
    nombre: "Tarea pendiente de aprobación",
    cuando: "Cuando un documento llega a una etapa de la cadena de aprobación (la primera al enviarlo, las siguientes al aprobarse la anterior).",
    destinatarios: "Usuarios activos con el rol que exige esa etapa; solo si nadie tiene ese rol, los administradores.",
    regla: "Se avisa únicamente a quien puede firmar la etapa que toca, nunca a todos los administradores.",
    configurable: true,
    variablesExtra: [V_DOCUMENTO],
    asuntoPorDefecto: ASUNTO.tareaPendiente,
    cuerpoPorDefecto: CUERPO_POR_DEFECTO,
    ejemplo: { ...EJEMPLO_BASE, mensaje: 'Una solicitud de evento de tipo "Congreso" ("Simposio de Neurología 2026"), en Bogotá el 12/10/2026, está pendiente de tu aprobación en BEATS (etapa: Dirección Médica).' },
  },
  {
    clave: CLAVE.etapaAprobada,
    grupo: "flujo",
    nombre: "Una etapa de la solicitud fue aprobada",
    cuando: "Cada vez que una etapa se aprueba y el flujo todavía continúa.",
    destinatarios: "Quien creó (solicitó) el documento.",
    regla: "El solicitante sabe en qué punto del flujo va su documento.",
    configurable: true,
    variablesExtra: [V_DOCUMENTO, V_ETAPA, V_ACTOR],
    asuntoPorDefecto: ASUNTO.etapaAprobada,
    cuerpoPorDefecto: CUERPO_POR_DEFECTO,
    ejemplo: { ...EJEMPLO_BASE, mensaje: '"Simposio de Neurología 2026" avanzó: la etapa "Dirección Médica" fue aprobada.' },
  },
  {
    clave: CLAVE.etapaResueltaColegas,
    grupo: "flujo",
    nombre: "Un colega ya resolvió la etapa",
    cuando: "Cuando una persona aprueba o rechaza una etapa que comparte con otras de su mismo rol.",
    destinatarios: "Los demás usuarios con el mismo rol de la etapa (nunca quien la resolvió).",
    regla: "Evita que dos personas del mismo rol dupliquen la revisión.",
    configurable: true,
    variablesExtra: [V_DOCUMENTO, V_ETAPA, V_ACTOR],
    asuntoPorDefecto: ASUNTO.etapaResueltaColegas,
    cuerpoPorDefecto: CUERPO_POR_DEFECTO,
    ejemplo: { ...EJEMPLO_BASE, mensaje: '"Simposio de Neurología 2026": Carlos Pérez ya aprobó la etapa "Dirección Médica" el 07/10/2026 14:30 — no necesitas actuar sobre ella.' },
  },
  {
    clave: CLAVE.aprobacionFinalSolicitante,
    grupo: "directos",
    nombre: "Flujo finalizado — aviso al solicitante",
    cuando: "Cuando todas las etapas quedan aprobadas.",
    destinatarios: "Quien creó (solicitó) el documento.",
    regla: "Este correo lo envía directamente un trigger de la base de datos (fn_notificar_aprobacion_*), y la app solo enciende la campanita para no duplicarlo.",
    configurable: false,
    motivoNoConfigurable:
      "Hoy sale de las funciones fn_notificar_aprobacion_caf/convenio/convenio_hcp/evento de la base de datos, cuyo código no está en este repositorio. Para hacerlo configurable hay que reescribirlas (correr db/diagnostico-funciones-email.sql y compartir el resultado).",
    variablesExtra: [V_DOCUMENTO, V_ACTOR],
    asuntoPorDefecto: "(definido por el trigger de la base de datos)",
    cuerpoPorDefecto: CUERPO_POR_DEFECTO,
    ejemplo: { ...EJEMPLO_BASE, mensaje: '"Simposio de Neurología 2026" fue aprobado en su totalidad.' },
  },
  {
    clave: CLAVE.aprobacionFinalParticipantes,
    grupo: "flujo",
    nombre: "Flujo finalizado — aviso a quienes participaron",
    cuando: "Cuando todas las etapas quedan aprobadas.",
    destinatarios: "Quienes aprobaron etapas anteriores del mismo documento (no el solicitante ni quien dio la última aprobación).",
    regla: "Quienes firmaron saben cómo terminó el flujo en el que participaron.",
    configurable: true,
    variablesExtra: [V_DOCUMENTO, V_ACTOR],
    asuntoPorDefecto: ASUNTO.aprobacionFinalParticipantes,
    cuerpoPorDefecto: CUERPO_POR_DEFECTO,
    ejemplo: { ...EJEMPLO_BASE, mensaje: '"Simposio de Neurología 2026" completó todo el flujo de aprobación: fue APROBADO en su totalidad.' },
  },
  {
    clave: CLAVE.rechazoSolicitante,
    grupo: "flujo",
    nombre: "Documento rechazado — aviso al solicitante",
    cuando: "Cuando cualquier etapa rechaza el documento.",
    destinatarios: "Quien creó (solicitó) el documento.",
    regla: "El rechazo siempre exige motivo y devuelve el documento a quien lo creó para corregirlo y reenviarlo.",
    configurable: true,
    variablesExtra: [V_DOCUMENTO, V_ETAPA, V_ACTOR],
    asuntoPorDefecto: ASUNTO.rechazoSolicitante,
    cuerpoPorDefecto: CUERPO_POR_DEFECTO,
    ejemplo: { ...EJEMPLO_BASE, mensaje: '"Simposio de Neurología 2026" fue rechazado por Carlos Pérez (Dirección Médica). Motivo: "Falta el programa académico".' },
  },
  {
    clave: CLAVE.rechazoAprobadoresPrevios,
    grupo: "flujo",
    nombre: "Rechazo de un documento que ya habías aprobado",
    cuando: "Cuando una etapa posterior rechaza un documento.",
    destinatarios: "Quienes ya habían aprobado etapas anteriores.",
    regla: "Quien firmó antes se entera de que su aprobación quedó sin efecto hasta que se corrija.",
    configurable: true,
    variablesExtra: [V_DOCUMENTO, V_ETAPA, V_ACTOR],
    asuntoPorDefecto: ASUNTO.rechazoAprobadoresPrevios,
    cuerpoPorDefecto: CUERPO_POR_DEFECTO,
    ejemplo: { ...EJEMPLO_BASE, mensaje: '"Simposio de Neurología 2026", que ya habías aprobado, fue rechazado en la etapa "Gerencia General" por Carlos Pérez.' },
  },
  {
    clave: CLAVE.devolucion,
    grupo: "flujo",
    nombre: "Documento devuelto para corrección",
    cuando: "Cuando se devuelve un documento Pendiente (suspende el flujo para que se corrija).",
    destinatarios: "Quien creó (solicitó) el documento.",
    regla: "Devolver no es rechazar: el flujo se suspende y se reanuda al reenviar.",
    configurable: true,
    variablesExtra: [V_DOCUMENTO, V_ACTOR, V_MOTIVO],
    asuntoPorDefecto: ASUNTO.devolucion,
    cuerpoPorDefecto: CUERPO_POR_DEFECTO,
    ejemplo: { ...EJEMPLO_BASE, motivo: "Actualizar el presupuesto de transporte", mensaje: '"Simposio de Neurología 2026" fue DEVUELTO por Carlos Pérez. Motivo: Actualizar el presupuesto de transporte' },
  },
  {
    clave: CLAVE.tareasFmvConvenioPago,
    grupo: "tareas",
    nombre: "Nuevas tareas: MD FMV Checklist y Convenio de Pago a HCP",
    cuando: "Cuando Dirección Médica aprueba su etapa de una solicitud de evento con speakers externos.",
    destinatarios: "Usuarios con rol Dirección Médica (si no hay, administradores).",
    regla: "Solo aplica a speakers externos; si el evento no tiene externos no se avisa.",
    configurable: true,
    variablesExtra: [V_EVENTO],
    asuntoPorDefecto: ASUNTO.tareasFmvConvenioPago,
    cuerpoPorDefecto: CUERPO_POR_DEFECTO,
    ejemplo: { ...EJEMPLO_BASE, mensaje: 'Evento "Simposio de Neurología 2026" (2026-10-12): ya puedes diligenciar el MD FMV Checklist y la Solicitud de Convenio de Pago a HCP de: Dr. Luis Gómez. Encuentras ambas tareas en "Tareas pendientes".' },
  },
  {
    clave: CLAVE.tareasCafConvenioHcp,
    grupo: "tareas",
    nombre: "Nuevas tareas: CAF y Convenio HCP",
    cuando: "Cuando el MD FMV Checklist y el Convenio de Pago a HCP de un speaker quedan firmados.",
    destinatarios: "Usuarios con rol Dirección Médica (si no hay, administradores).",
    regla: "Las tareas son escalonadas: el CAF y el Convenio HCP se habilitan solo cuando los dos documentos previos están firmados.",
    configurable: true,
    variablesExtra: [V_EVENTO],
    asuntoPorDefecto: ASUNTO.tareasCafConvenioHcp,
    cuerpoPorDefecto: CUERPO_POR_DEFECTO,
    ejemplo: { ...EJEMPLO_BASE, mensaje: 'Evento "Simposio de Neurología 2026" — Dr. Luis Gómez: el MD FMV Checklist y el Convenio de Pago a HCP ya están firmados. Ya puedes elaborar el CAF y el Convenio HCP.' },
  },
  {
    clave: CLAVE.tareaEnviarConvenioHcp,
    grupo: "tareas",
    nombre: "Tarea: enviar al HCP el Convenio HCP firmado",
    cuando: "Cuando Gerencia General / Rep. Legal firma la última etapa del Convenio HCP.",
    destinatarios: "Usuarios con rol Dirección Médica (si no hay, administradores).",
    regla: "El envío al HCP para su firma lo realiza solo Dirección Médica.",
    configurable: true,
    variablesExtra: [V_EVENTO],
    asuntoPorDefecto: ASUNTO.tareaEnviarConvenioHcp,
    cuerpoPorDefecto: CUERPO_POR_DEFECTO,
    ejemplo: { ...EJEMPLO_BASE, mensaje: 'Convenio HCP de Dr. Luis Gómez — evento "Simposio de Neurología 2026": Gerencia General / Rep. Legal ya lo firmó. Recuerda enviarlo al HCP para su firma.' },
  },
  {
    clave: CLAVE.tareaNotificacionPago,
    grupo: "tareas",
    nombre: "Tarea: generar la Notificación de Pago a HCP",
    cuando: "Cuando se carga una factura de un speaker en el Expediente del evento.",
    destinatarios: "Usuarios con rol Dirección Médica (si no hay, administradores).",
    regla: "La Notificación de Pago a HCP la genera solo Dirección Médica, una vez por factura.",
    configurable: true,
    variablesExtra: [V_EVENTO],
    asuntoPorDefecto: ASUNTO.tareaNotificacionPago,
    cuerpoPorDefecto: CUERPO_POR_DEFECTO,
    ejemplo: { ...EJEMPLO_BASE, mensaje: 'Evento "Simposio de Neurología 2026" — Dr. Luis Gómez: se cargó la factura FE-1024 en el Expediente. Ya puedes generar la Notificación de Pago a HCP.' },
  },
  {
    clave: "recordatorio.soportes",
    grupo: "directos",
    nombre: "Recordatorio diario de soportes post-evento",
    cuando: "Rutina diaria (pg_cron) desde el día siguiente al fin del evento; más enfática pasados 3 días, con copia al Director Médico que firmó.",
    destinatarios: "Quien creó la solicitud de evento (con copia al Director Médico a partir del segundo nivel).",
    regla: "Factura se avisa a los 15 días del fin del evento; comprobante de pago a los 75 días de cargada la factura.",
    configurable: false,
    motivoNoConfigurable:
      "Lo envía la función fn_enviar_recordatorios_pendientes con net.http_post propio (no pasa por la tabla de notificaciones). Hay que modificar esa función para consultar la configuración.",
    variablesExtra: [],
    asuntoPorDefecto: "(definido por la rutina de recordatorios)",
    cuerpoPorDefecto: CUERPO_POR_DEFECTO,
    ejemplo: { ...EJEMPLO_BASE, mensaje: "Recuerda cargar los documentos de soporte pendientes del evento…" },
  },
];

export function definicionNotificacion(clave: string): DefinicionNotificacion | undefined {
  return CATALOGO_NOTIFICACIONES.find((d) => d.clave === clave);
}

export function variablesDe(def: DefinicionNotificacion): VariablePlantilla[] {
  return [...VARIABLES_COMUNES, ...def.variablesExtra];
}

// ---------------------------------------------------------------------------
// Render de plantillas — espejo EXACTO de fn_render_asunto_correo / fn_render_cuerpo_correo (SQL),
// para la vista previa de la pantalla de configuración.
// ---------------------------------------------------------------------------

const escaparHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Octubre 2026: redacción propia de la variable {{mensaje}}. Se sustituyen las demás variables (nunca {{mensaje}} ni
 * {{enlace}}) y se quitan las no resueltas; a diferencia del asunto, conserva los saltos de línea. Espejo de
 * `fn_render_mensaje_correo` (db/entrega_38_mensaje_editable_notificaciones.sql).
 */
export function renderizarMensaje(plantilla: string, vars: Record<string, string>): string {
  let v = plantilla.replace(/\r/g, "");
  for (const [k, val] of Object.entries(vars)) {
    if (k !== "mensaje" && k !== "enlace") v = v.split(`{{${k}}}`).join(val ?? "");
  }
  return v.replace(/\{\{(?!enlace\}\})[a-z_]+\}\}/g, "").replace(/[ \t]+\n/g, "\n").trim();
}

/** Variables que se pueden usar DENTRO de la redacción de {{mensaje}} (todas menos {{mensaje}} y {{enlace}}). */
export function variablesParaMensaje(def: DefinicionNotificacion): VariablePlantilla[] {
  return variablesDe(def).filter((v) => v.clave !== "mensaje" && v.clave !== "enlace");
}

export function renderizarAsunto(plantilla: string, vars: Record<string, string>): string {
  let v = plantilla;
  for (const [k, val] of Object.entries(vars)) v = v.split(`{{${k}}}`).join(val ?? "");
  return v.replace(/\{\{[a-z_]+\}\}/g, "").replace(/\s+/g, " ").trim();
}

export const ENLACE_EJEMPLO_HTML =
  '<p><a href="#" style="display:inline-block;padding:8px 16px;background:#00a1e4;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Abrir en BEATS</a></p>';

export function renderizarCuerpoHtml(plantilla: string, vars: Record<string, string>, enlaceHtml = ENLACE_EJEMPLO_HTML): string {
  let v = escaparHtml(plantilla).replace(/\r/g, "");
  for (const [k, val] of Object.entries(vars)) {
    if (k !== "enlace") v = v.split(`{{${k}}}`).join(escaparHtml(val ?? ""));
  }
  v = v.replace(/\{\{(?!enlace\}\})[a-z_]+\}\}/g, "");
  v = `<p>${v.split("\n\n").join("</p><p>").split("\n").join("<br>")}</p>`;
  v = v.split("<p>{{enlace}}</p>").join(enlaceHtml).split("{{enlace}}").join(enlaceHtml);
  return v.replace(/<p>\s*(<br>\s*)*<\/p>/g, "");
}

// ---------------------------------------------------------------------------
// Acceso a datos
// ---------------------------------------------------------------------------

export interface ConfigNotificacion {
  clave: string;
  activo: boolean;
  copiarAdministradores: boolean;
  ccRoles: string[];
  ccUsuarios: string[];
  /** `null` = asunto por defecto. */
  asuntoPlantilla: string | null;
  /** `null` = cuerpo por defecto. */
  cuerpoPlantilla: string | null;
  /** Octubre 2026: `null` = {{mensaje}} tal como lo arma BEATS. Con texto, reemplaza ese {{mensaje}} (admite las demás variables). */
  mensajePlantilla: string | null;
  actualizadoPorId: string | null;
  actualizadoEn: string | null;
}

export function configPorDefecto(clave: string): ConfigNotificacion {
  return {
    clave,
    activo: true,
    copiarAdministradores: true,
    ccRoles: [],
    ccUsuarios: [],
    asuntoPlantilla: null,
    cuerpoPlantilla: null,
    mensajePlantilla: null,
    actualizadoPorId: null,
    actualizadoEn: null,
  };
}

const MIGRACION = "db/entrega_29_configuracion_notificaciones.sql";
const MIGRACION_MENSAJE = "db/entrega_38_mensaje_editable_notificaciones.sql";

const faltaColumnaMensaje = (error: { code?: string; message?: string }) =>
  error.code === "PGRST204" || error.code === "42703" || /mensaje_plantilla/i.test(error.message ?? "");

function esTablaAusente(error: { code?: string; message?: string }): boolean {
  return error.code === "42P01" || error.code === "PGRST205" || /could not find the table|does not exist/i.test(error.message ?? "");
}

function filaAConfig(f: Record<string, unknown>): ConfigNotificacion {
  return {
    clave: f.clave as string,
    activo: f.activo !== false,
    copiarAdministradores: f.copiar_administradores !== false,
    ccRoles: Array.isArray(f.cc_roles) ? (f.cc_roles as string[]) : [],
    ccUsuarios: Array.isArray(f.cc_usuarios) ? (f.cc_usuarios as string[]) : [],
    asuntoPlantilla: (f.asunto_plantilla as string | null) ?? null,
    cuerpoPlantilla: (f.cuerpo_plantilla as string | null) ?? null,
    mensajePlantilla: (f.mensaje_plantilla as string | null) ?? null,
    actualizadoPorId: (f.actualizado_por_id as string | null) ?? null,
    actualizadoEn: (f.actualizado_en as string | null) ?? null,
  };
}

/** Todas las configuraciones guardadas, por clave. Las claves sin fila usan `configPorDefecto`. */
export async function traerConfigNotificaciones(): Promise<Map<string, ConfigNotificacion>> {
  const { data, error } = await supabase.from("notificaciones_config").select("*");
  if (error) {
    if (esTablaAusente(error)) throw new Error(`Falta aplicar ${MIGRACION} en Supabase (la tabla de configuración no existe todavía).`);
    throw new Error(mensajeErrorAmigable(error));
  }
  return new Map((data ?? []).map((f) => [f.clave as string, filaAConfig(f)]));
}

export async function guardarConfigNotificacion(cfg: ConfigNotificacion): Promise<void> {
  const fila = {
    clave: cfg.clave,
    activo: cfg.activo,
    copiar_administradores: cfg.copiarAdministradores,
    cc_roles: cfg.ccRoles,
    cc_usuarios: cfg.ccUsuarios,
    asunto_plantilla: cfg.asuntoPlantilla && cfg.asuntoPlantilla.trim() ? cfg.asuntoPlantilla : null,
    cuerpo_plantilla: cfg.cuerpoPlantilla && cfg.cuerpoPlantilla.trim() ? cfg.cuerpoPlantilla : null,
  };
  const mensajeNuevo = cfg.mensajePlantilla && cfg.mensajePlantilla.trim() ? cfg.mensajePlantilla : null;
  const subir = (f: Record<string, unknown>) => supabase.from("notificaciones_config").upsert(f, { onConflict: "clave" }).select("clave");
  let { data, error } = await subir({ ...fila, mensaje_plantilla: mensajeNuevo });
  if (error && faltaColumnaMensaje(error)) {
    // Sin la migración 37 la columna no existe: si no hay redacción propia se guarda igual; si la hay, se avisa.
    if (mensajeNuevo) throw new Error(`Para personalizar {{mensaje}} falta aplicar ${MIGRACION_MENSAJE} en Supabase.`);
    ({ data, error } = await subir(fila));
  }
  if (error) {
    if (esTablaAusente(error)) throw new Error(`Falta aplicar ${MIGRACION} en Supabase.`);
    throw new Error(mensajeErrorAmigable(error));
  }
  // RLS filtra en silencio: si no volvió la fila, no se guardó.
  if (!data || data.length === 0) throw new Error("La base de datos no permitió guardar la configuración (solo los administradores pueden hacerlo).");
}

/** Vuelve al comportamiento por defecto: elimina la fila de configuración del aviso. */
export async function restablecerConfigNotificacion(clave: string): Promise<void> {
  const { error } = await supabase.from("notificaciones_config").delete().eq("clave", clave);
  if (error) throw new Error(mensajeErrorAmigable(error));
}

export interface CambioConfigNotificacion {
  id: string;
  clave: string;
  cambiadoPorId: string | null;
  cambiadoEn: string;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
}

export async function traerHistorialConfigNotificacion(clave: string, limite = 25): Promise<CambioConfigNotificacion[]> {
  const { data, error } = await supabase
    .from("notificaciones_config_historial")
    .select("*")
    .eq("clave", clave)
    .order("cambiado_en", { ascending: false })
    .limit(limite);
  if (error) {
    if (esTablaAusente(error)) return [];
    throw new Error(mensajeErrorAmigable(error));
  }
  return (data ?? []).map((f) => ({
    id: f.id as string,
    clave: f.clave as string,
    cambiadoPorId: (f.cambiado_por_id as string | null) ?? null,
    cambiadoEn: f.cambiado_en as string,
    antes: (f.antes as Record<string, unknown> | null) ?? null,
    despues: (f.despues as Record<string, unknown> | null) ?? null,
  }));
}

/** ¿La configuración difiere de la guardada? (para el aviso de cambios sin guardar). */
export function configIgual(a: ConfigNotificacion, b: ConfigNotificacion): boolean {
  const s = (x: string[]) => [...x].sort().join("|");
  return (
    a.activo === b.activo &&
    a.copiarAdministradores === b.copiarAdministradores &&
    s(a.ccRoles) === s(b.ccRoles) &&
    s(a.ccUsuarios) === s(b.ccUsuarios) &&
    (a.asuntoPlantilla ?? "") === (b.asuntoPlantilla ?? "") &&
    (a.cuerpoPlantilla ?? "") === (b.cuerpoPlantilla ?? "") &&
    (a.mensajePlantilla ?? "") === (b.mensajePlantilla ?? "")
  );
}

/**
 * Envía un correo de PRUEBA con la plantilla (renderizada con datos de ejemplo) a un destinatario, llamando
 * a la Edge Function `send-email` con la sesión del administrador. La función real puede restringir el
 * envío desde la app (hoy exige rol Dirección Médica para adjuntos); si lo rechaza, se devuelve su mensaje.
 */
export async function enviarCorreoPrueba(destinatario: string, asunto: string, html: string): Promise<void> {
  const { error } = await supabase.functions.invoke("send-email", {
    body: { to: destinatario, subject: `[PRUEBA] ${asunto}`, html, attachments: [] },
  });
  if (!error) return;
  let mensaje = error.message;
  try {
    const contexto = (error as { context?: Response }).context;
    const cuerpo = await contexto?.clone().json();
    if (cuerpo?.error) mensaje = cuerpo.error;
  } catch {
    // se deja el mensaje genérico
  }
  throw new Error(mensajeErrorAmigable({ message: mensaje }));
}
