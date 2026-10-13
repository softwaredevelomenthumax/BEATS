import { notificacionCubreFactura, notificacionVigente } from "@/lib/facturasNotificacionPago";
import {
  ETIQUETA_CATEGORIA_FINANCIERA_REPOSITORIO,
  type CategoriaFinancieraRepositorio,
} from "@/lib/enums";
import { eventoTieneSpeakersExternos, eventoTieneSpeakersInternos, speakersExternosDe } from "@/lib/speakersEvento";
import type {
  Caf,
  Convenio,
  ConvenioHcp,
  Evento,
  Fmv,
  NotificacionPagoHcp,
  RegistroFinancieroEvento,
  RepositorioArchivoEvento,
  SpeakerParticipacionEvento,
} from "@/types";
import type { DocumentoAny } from "@/lib/documentoGenerico";

/**
 * Fase 6 (Tablero, Informes y Auditoría enriquecidos) — reglas de negocio
 * sobre "qué documentos le faltan a un Evento", confirmadas por extracción
 * directa del bundle original (funciones `wx`, `Tx`, `ix`, `ox`, `Cx`,
 * `kx`, `Mx`, `Ix`, `Lx`, `Ex`, `Ax`, `Px`). Dos pantallas nuevas de esta
 * fase las necesitan: "Auditoría de Eventos" (checklist completo por
 * evento) y "Tareas Pendientes" (qué falta de lo tuyo, si tu rol es
 * Dirección Médica). Se centralizan aquí en vez de duplicarlas en cada
 * pantalla para que ambas usen exactamente la misma definición de
 * "completo".
 *
 * Nota de arquitectura: el bundle original guarda el Repositorio del
 * Evento como un objeto anidado (`evento.repositorioPostEvento`); esta
 * reconstrucción lo normalizó en dos tablas propias
 * (`evento_repositorio_archivos`/`evento_registros_financieros`, ver
 * `lib/repositorioEvento.ts`, Fase 1). Las funciones de abajo reciben esas
 * dos listas COMPLETAS (todas las filas, de todos los eventos) y filtran
 * por `eventoId` internamente — así una sola carga sirve para calcular el
 * estado de todos los eventos a la vez (necesario para las pastillas de
 * "N documento(s) faltante(s)" que se ven sin tener que expandir cada
 * evento uno por uno).
 */

/** Ids de archivos de las filas del repositorio que sí tienen archivo (una fila "No aplica" no lo tiene). */
function idsConArchivo(filas: RepositorioArchivoEvento[]): string[] {
  return filas.map((f) => f.archivoId).filter((id): id is string => !!id);
}

/** Evento con participación académica dictada por un HCP externo (requiere Convenio/FMV/CAF). Confirmado (función `wx`). */
export function esSpeakerExterno(evento: Evento): boolean {
  // Entrega 22: con speakers internos Y externos a la vez cuenta como externo (los externos generan los documentos).
  return eventoTieneSpeakersExternos(evento);
}/** Evento con participación académica dictada por personal interno de la compañía (exento de varios documentos). Confirmado (función `Tx`). */
export function esSpeakerInterno(evento: Evento): boolean {
  // Entrega 22: "interno" a secas = solo hay speakers internos (si además hay externos, rige el caso externo).
  return eventoTieneSpeakersInternos(evento) && !eventoTieneSpeakersExternos(evento);
}

/** Confirmado (función `ix`). */
export function esMultisesion(evento: Evento): boolean {
  return evento.modalidadSesiones === "Varias sesiones" && evento.sesiones.length > 0;
}

/**
 * La Lista de Asistencia queda satisfecha por archivos cargados, o por una
 * declaración de "No aplica" con motivo — por sesión en un evento
 * multisesión, o a nivel del evento completo si es de sesión única.
 * Confirmado (función `ox`).
 */
export function listaAsistenciaSatisfecha(evento: Evento, archivosRepo: RepositorioArchivoEvento[]): boolean {
  const cargados = archivosRepo.filter((a) => a.eventoId === evento.id && a.categoria === "listaAsistencia");
  if (esMultisesion(evento)) {
    return evento.sesiones.every(
      (s) => (s.listaAsistenciaNoAplica && !!s.listaAsistenciaNoAplicaMotivo) || cargados.some((c) => c.sesionId === s.id),
    );
  }
  return (evento.listaAsistenciaNoAplica && !!evento.listaAsistenciaNoAplicaMotivo) || cargados.length > 0;
}

/** El Director Médico ya aprobó su etapa de la cadena del evento. Confirmado (función `Cx`). */
export function directorMedicoAprobo(evento: Evento): boolean {
  return evento.aprobaciones.some((p) => p.etiqueta === "Director Médico" && p.estado === "aprobado");
}

/** El evento ya tiene Convenio de Pago Y FMV Checklist vinculados (no importa su estado). Confirmado (función `kx`). */
export function tieneConvenioYFmv(evento: Evento, convenios: Convenio[], fmvs: Fmv[]): boolean {
  return convenios.some((c) => c.eventoOrigenId === evento.id) && fmvs.some((f) => f.eventoOrigenId === evento.id);
}

/**
 * Entrega 20 — escalón siguiente de tareas: el evento ya tiene un MD FMV
 * Checklist "Completado" Y un Convenio de Pago a HCP "Aprobado" (ambos
 * FIRMADOS, no solo creados). Solo entonces se genera la necesidad de CAF y de
 * Convenio HCP.
 */
export function tieneConvenioYFmvFirmados(evento: Evento, convenios: Convenio[], fmvs: Fmv[]): boolean {
  return (
    convenios.some((c) => c.eventoOrigenId === evento.id && c.estado === "Aprobado") &&
    fmvs.some((f) => f.eventoOrigenId === evento.id && f.estado === "Completado")
  );
}

/** El primer documento vinculado al evento que sigue activo (ni Rechazado ni Anulado). Confirmado (función `Mx`). */
export function documentoActivoDelEvento<T extends { eventoOrigenId: string | null; estado: string }>(
  docs: T[],
  eventoId: string,
): T | null {
  return docs.find((d) => d.eventoOrigenId === eventoId && d.estado !== "Rechazado" && d.estado !== "Anulado") ?? null;
}

/**
 * AJUSTES (septiembre/octubre 2026), pedido explícito: "en la sección
 * 'Auditoría de eventos', garantiza que los documentos que aparezcan
 * generados y cargados realmente obedezcan a lo que se configuró/requirió
 * [...] valida los diferentes estatus que puede tener el paquete de
 * documentos: P. ej: en 3 documentos creados como prueba (2 de los cuales
 * son borrador, sin ninguna información), aparece estado 'Paquete completo'
 * cuando realmente no es así."
 *
 * Causa real: `construirChecklistEvento` (más abajo) usaba
 * `documentoActivoDelEvento` para decidir si el Convenio/FMV/CAF de un
 * evento ya estaban "presentes" en el checklist — esa función solo excluye
 * Rechazado/Anulado, así que un documento que sigue siendo un Borrador
 * VACÍO (nunca enviado a aprobación) ya contaba como "presente", y con los
 * 3 renglones del checklist en verde, la fila se marcaba como "Paquete
 * completo" en `AuditoriaEventos.tsx`.
 *
 * Esta variante es igual, pero ADEMÁS excluye "Borrador": para el
 * checklist, un documento recién creado y nunca enviado no debe contar como
 * que el paquete ya lo tiene resuelto. Se deja `documentoActivoDelEvento`
 * sin tocar a propósito — otros usos (p. ej. decidir si ya existe un
 * documento en curso para no dejar crear uno duplicado) sí deben seguir
 * contando un borrador como "ya hay uno en curso", que es un criterio
 * distinto y correcto para ese otro caso.
 */
function documentoSometidoDelEvento<T extends { eventoOrigenId: string | null; estado: string }>(
  docs: T[],
  eventoId: string,
): T | null {
  return (
    docs.find((d) => d.eventoOrigenId === eventoId && d.estado !== "Rechazado" && d.estado !== "Anulado" && d.estado !== "Borrador") ?? null
  );
}

/**
 * Facturas del evento (categoría `facturas` del Repositorio) que todavía no
 * tienen una Notificación de Pago que las referencie — solo aplica si el
 * evento ya tiene un Convenio vinculado (sin Convenio no hay pago a HCP que
 * notificar). Confirmado (función `Ix`).
 */
export function facturasSinNotificar(
  evento: Evento,
  convenios: Convenio[],
  notificaciones: NotificacionPagoHcp[],
  financierosRepo: RegistroFinancieroEvento[],
): RegistroFinancieroEvento[] {
  if (!convenios.some((c) => c.eventoOrigenId === evento.id)) return [];
  return financierosRepo.filter(
    (r) => r.eventoId === evento.id && r.categoria === "facturas" && !notificaciones.some((n) => notificacionVigente(n) && notificacionCubreFactura(n, r)),
  );
}

/**
 * Entrega 36 — tarea «Notificación de Pago a HCPs» POR SPEAKER.
 *
 * Antes la tarea era una sola tarjeta por evento y dependía de que el evento ya tuviera un Convenio de Pago; además una
 * notificación Anulada o Rechazada seguía «cubriendo» su factura (el formulario sí la libera). Resultado: al cargar facturas
 * de un speaker concreto la tarea podía no aparecer. Ahora la tarea nace de la factura misma: hay una por cada speaker del
 * evento con facturas del Expediente que ninguna Notificación de Pago VIGENTE cubra (mismo criterio que el formulario,
 * `facturasParaNotificar`). Si el evento aún no puede recibir la notificación (faltan el Convenio de Pago o el FMV
 * Checklist que el formulario exige), la tarea se muestra igual, pero indicando qué falta (`motivoBloqueo`).
 */
export interface TareaNotificacionPagoSpeaker {
  /** `null` = facturas del evento sin speaker asignado (cargadas antes del Expediente por speaker). */
  speakerId: string | null;
  nombre: string;
  facturas: RegistroFinancieroEvento[];
  puedeGenerarse: boolean;
  motivoBloqueo?: string;
}

export function tareasNotificacionPagoPorSpeaker(
  evento: Evento,
  convenios: Convenio[],
  fmvs: Fmv[],
  notificaciones: NotificacionPagoHcp[],
  financierosRepo: RegistroFinancieroEvento[],
): TareaNotificacionPagoSpeaker[] {
  const pendientes = financierosRepo.filter(
    (r) => r.eventoId === evento.id && r.categoria === "facturas" && !notificaciones.some((n) => notificacionVigente(n) && notificacionCubreFactura(n, r)),
  );
  if (pendientes.length === 0) return [];

  const externos = speakersExternosDe(evento);
  const motivos: string[] = [];
  if (!esSpeakerExterno(evento)) motivos.push("el evento no tiene un speaker externo con participación académica");
  if (!convenios.some((c) => c.eventoOrigenId === evento.id)) motivos.push("el Convenio de Pago a HCP");
  if (!fmvs.some((f) => f.eventoOrigenId === evento.id)) motivos.push("el MD FMV Checklist");
  const motivoBloqueo = motivos.length === 0 ? undefined : motivos[0].startsWith("el evento") ? `Todavía no se puede generar: ${motivos[0]}.` : `Todavía no se puede generar: falta ${motivos.join(" y ")} del evento.`;

  const porSpeaker = new Map<string | null, RegistroFinancieroEvento[]>();
  for (const f of pendientes) {
    // Con un único speaker externo, una factura sin speaker es de él.
    const clave = f.speakerId ?? (externos.length === 1 ? externos[0].speakerId ?? null : null);
    porSpeaker.set(clave, [...(porSpeaker.get(clave) ?? []), f]);
  }
  return Array.from(porSpeaker.entries()).map(([speakerId, facturas]) => ({
    speakerId,
    nombre: externos.find((sp) => sp.speakerId && sp.speakerId === speakerId)?.nombreSpeaker || (speakerId ? "Speaker" : "Speaker sin asignar"),
    facturas,
    puedeGenerarse: motivos.length === 0,
    motivoBloqueo,
  }));
}

/** Confirmado (función `Lx`). */
export function necesitaNotificacionPago(
  evento: Evento,
  convenios: Convenio[],
  notificaciones: NotificacionPagoHcp[],
  financierosRepo: RegistroFinancieroEvento[],
): boolean {
  return facturasSinNotificar(evento, convenios, notificaciones, financierosRepo).length > 0;
}

/**
 * Cuántas sesiones de un evento multisesión ya se "ejecutaron": lista de
 * asistencia satisfecha (por archivo con algún conteo cargado, o por
 * declaración de "no aplica") Y al menos una foto de evidencia cargada
 * para esa sesión. Confirmado (función `ax`).
 */
export function sesionesEjecutadas(
  evento: Evento,
  archivosRepo: RepositorioArchivoEvento[],
): { total: number; ejecutadas: number } | null {
  if (!esMultisesion(evento)) return null;
  const listaAsistencia = archivosRepo.filter((a) => a.eventoId === evento.id && a.categoria === "listaAsistencia");
  const sesionesConFoto = new Set(
    archivosRepo.filter((a) => a.eventoId === evento.id && a.categoria === "fotos" && a.sesionId).map((a) => a.sesionId),
  );
  const porSesion = evento.sesiones.map((s) => {
    const noAplica = s.listaAsistenciaNoAplica && !!s.listaAsistenciaNoAplicaMotivo;
    const cargadaConConteo = listaAsistencia.some(
      (a) =>
        a.sesionId === s.id &&
        [a.conteoPersonalMedico, a.conteoPersonalNoMedico, a.conteoOtroPersonal, a.conteoFuerzaVentas].some(
          (n) => (n ?? 0) > 0,
        ),
    );
    return (noAplica || cargadaConConteo) && sesionesConFoto.has(s.id);
  });
  return { total: porSesion.length, ejecutadas: porSesion.filter(Boolean).length };
}

// --- Tareas Pendientes (Fase 6) — confirmadas por extracción directa del
// bundle original (funciones `Ex`, `Ax`, `Px`) ---

export interface TareaFmvConvenio {
  faltaConvenio: boolean;
  faltaFmv: boolean;
  pendiente: boolean;
}

/**
 * Evento con participación de Speaker externo, ya aprobado por Dirección
 * Médica, al que todavía le falta el Convenio de Pago y/o el FMV
 * Checklist.
 */
export function tareaFaltaFmvOConvenio(evento: Evento, convenios: Convenio[], fmvs: Fmv[]): TareaFmvConvenio {
  if (!esSpeakerExterno(evento) || !directorMedicoAprobo(evento) || speakersExternosDe(evento).length > 0) {
    return { faltaConvenio: false, faltaFmv: false, pendiente: false };
  }
  const faltaConvenio = !convenios.some((c) => c.eventoOrigenId === evento.id);
  const faltaFmv = !fmvs.some((f) => f.eventoOrigenId === evento.id);
  return { faltaConvenio, faltaFmv, pendiente: faltaConvenio || faltaFmv };
}

/**
 * Evento con FMV Checklist y Convenio ya vinculados, al que todavía le
 * falta un CAF activo. Un CAF Rechazado/Anulado no cuenta como "ya
 * resuelto" — igual que el checklist de Auditoría de Eventos, se exige
 * `documentoActivoDelEvento` y no solo "existe algún CAF para el evento".
 */
export function tareaFaltaCaf(evento: Evento, convenios: Convenio[], fmvs: Fmv[], cafs: Caf[]): boolean {
  if (
    !esSpeakerExterno(evento) ||
    !directorMedicoAprobo(evento) ||
    speakersExternosDe(evento).length > 0 ||
    // Entrega 20: la tarea de CAF se genera cuando FMV y Convenio de Pago están FIRMADOS (antes bastaba con que existieran).
    !tieneConvenioYFmvFirmados(evento, convenios, fmvs)
  ) {
    return false;
  }
  return !documentoActivoDelEvento(cafs, evento.id);
}

/**
 * Evento con un CAF activo vinculado, al que todavía le falta el Convenio HCP (contrato).
 * Sigue siendo el criterio de respaldo para eventos "de un solo speaker"
 * (creados antes de la entrega 2 de esta ronda, o con
 * `speakersParticipacion` vacío) — para el modelo de N speakers, ver
 * `tareasPorSpeaker` más abajo.
 */
export function tareaFaltaConvenioHCP(evento: Evento, cafs: Caf[], conveniosHCP: ConvenioHcp[]): boolean {
  if (speakersExternosDe(evento).length > 0) return false;
  if (!documentoActivoDelEvento(cafs, evento.id)) return false;
  return !conveniosHCP.some((c) => c.eventoOrigenId === evento.id);
}

/**
 * Entrega 20 — la tarea de Convenio HCP se genera en el MISMO momento que la de
 * CAF (cuando FMV y Convenio de Pago están firmados), no cuando el CAF ya
 * existe. Es la que usa "Tareas pendientes" para eventos de un solo speaker
 * (anteriores al modelo de N speakers); `tareaFaltaConvenioHCP` queda como
 * referencia del criterio anterior.
 */
export function tareaFaltaConvenioHCPEscalonada(
  evento: Evento,
  convenios: Convenio[],
  fmvs: Fmv[],
  conveniosHCP: ConvenioHcp[],
): boolean {
  if (
    !esSpeakerExterno(evento) ||
    !directorMedicoAprobo(evento) ||
    speakersExternosDe(evento).length > 0 ||
    !tieneConvenioYFmvFirmados(evento, convenios, fmvs)
  ) {
    return false;
  }
  return !conveniosHCP.some((c) => c.eventoOrigenId === evento.id && activo(c.estado));
}

// --- Ronda de ajustes de formularios (septiembre 2026), entrega 3: modelo
// de N speakers externos. A diferencia de las funciones de arriba (que
// asumen un solo speaker por evento — el modelo previo a la entrega 2 de
// esta ronda), estas emparejan cada uno de los 4 documentos con el speaker
// concreto al que pertenece, usando la columna `speaker_id` que Convenio,
// FMV y Convenio HCP ya traían de antes; CAF todavía no tiene un selector
// de speaker propio en su formulario (ver `db/agregar_speaker_caf.sql`),
// así que sus CAF sin `speakerId` se asignan por orden de creación como
// mejor aproximación disponible mientras esa entrega no llega. ---

export interface EstadoDocumentosSpeaker {
  speaker: SpeakerParticipacionEvento;
  fmv: Fmv | null;
  convenio: Convenio | null;
  caf: Caf | null;
  convenioHCP: ConvenioHcp | null;
}

function activo(estado: string): boolean {
  return estado !== "Rechazado" && estado !== "Anulado";
}

export function documentosPorSpeaker(
  evento: Evento,
  convenios: Convenio[],
  fmvs: Fmv[],
  cafs: Caf[],
  conveniosHCP: ConvenioHcp[],
): EstadoDocumentosSpeaker[] {
  const cafsDelEvento = cafs.filter((c) => c.eventoOrigenId === evento.id && activo(c.estado));
  const cafsConSpeaker = cafsDelEvento.filter((c) => c.speakerId);
  const cafsSinSpeakerOrdenados = cafsDelEvento.filter((c) => !c.speakerId).sort((a, b) => new Date(a.creadoEn).getTime() - new Date(b.creadoEn).getTime());
  let siguienteCafSinSpeaker = 0;

  return speakersExternosDe(evento).map((sp) => {
    const fmv = fmvs.find((f) => f.eventoOrigenId === evento.id && f.speakerId === sp.speakerId && activo(f.estado)) ?? null;
    const convenio = convenios.find((c) => c.eventoOrigenId === evento.id && c.speakerId === sp.speakerId && activo(c.estado)) ?? null;
    let caf = cafsConSpeaker.find((c) => c.speakerId === sp.speakerId) ?? null;
    if (!caf && siguienteCafSinSpeaker < cafsSinSpeakerOrdenados.length) {
      caf = cafsSinSpeakerOrdenados[siguienteCafSinSpeaker];
      siguienteCafSinSpeaker += 1;
    }
    const convenioHCP = conveniosHCP.find((c) => c.eventoOrigenId === evento.id && c.speakerId === sp.speakerId && activo(c.estado)) ?? null;
    return { speaker: sp, fmv, convenio, caf, convenioHCP };
  });
}

export interface TareaDocumentosSpeaker {
  speaker: SpeakerParticipacionEvento;
  faltaFmv: boolean;
  faltaConvenio: boolean;
  /** Entrega 20: solo es true cuando FMV Checklist y Convenio de Pago ya están firmados. */
  faltaCaf: boolean;
  /** Entrega 20: se genera junto con la de CAF (mismo escalón). */
  faltaConvenioHCP: boolean;
  /**
   * Entrega 20: el Convenio HCP necesita un CAF ya creado (aunque sea en
   * borrador o en trámite) porque guarda `caf_id`: mientras el CAF falte, la
   * tarea se muestra pero el botón queda inhabilitado.
   */
  convenioHCPEsperaCaf: boolean;
  pendiente: boolean;
}

/**
 * Una tarea por CADA speaker externo declarado en el evento — reemplaza a
 * `tareaFaltaFmvOConvenio`/`tareaFaltaCaf`/`tareaFaltaConvenioHCP` para
 * eventos que ya usan el modelo de N speakers (`speakersParticipacion` no
 * vacío). "Falta" significa que el documento todavía no existe en NINGÚN
 * estado (generarlo, aunque sea como borrador, ya resuelve la tarea) — las
 * reglas de cuándo se puede ENVIAR A APROBACIÓN cada uno son distintas y
 * viven en `lib/reglasDependenciaDocumentos.ts`.
 */
export function tareasPorSpeaker(
  evento: Evento,
  convenios: Convenio[],
  fmvs: Fmv[],
  cafs: Caf[],
  conveniosHCP: ConvenioHcp[],
): TareaDocumentosSpeaker[] {
  if (!esSpeakerExterno(evento) || !directorMedicoAprobo(evento) || speakersExternosDe(evento).length === 0) return [];
  return documentosPorSpeaker(evento, convenios, fmvs, cafs, conveniosHCP).map(({ speaker, fmv, convenio, caf, convenioHCP }) => {
    // Entrega 20 — tareas ESCALONADAS: FMV y Convenio de Pago se generan juntos
    // (cuando el Director Médico aprueba el evento); CAF y Convenio HCP solo
    // cuando ambos ya están firmados (FMV "Completado", Convenio "Aprobado").
    const faltaFmv = !fmv;
    const faltaConvenio = !convenio;
    const firmados = fmv?.estado === "Completado" && convenio?.estado === "Aprobado";
    const faltaCaf = firmados && !caf;
    const faltaConvenioHCP = firmados && !convenioHCP;
    return {
      speaker,
      faltaFmv,
      faltaConvenio,
      faltaCaf,
      faltaConvenioHCP,
      convenioHCPEsperaCaf: faltaConvenioHCP && !caf,
      pendiente: faltaFmv || faltaConvenio || faltaCaf || faltaConvenioHCP,
    };
  });
}

// --- Auditoría de Eventos (Fase 6) — checklist completo por evento,
// confirmado por extracción directa del bundle original (función `sB`) ---

export type EstadoItemChecklist = "presente" | "faltante" | "no_aplica";

export interface ItemChecklistEvento {
  etiqueta: string;
  estado: EstadoItemChecklist;
  /** Ids de `archivos_adjuntos` a mostrar/abrir (Repositorio del Evento). */
  archivoIds?: string[];
  /** Documento completo a abrir en su diálogo de detalle (Convenio/FMV/CAF/Notificación/el propio Evento). */
  documentoParaAbrir?: DocumentoAny;
  nota?: string;
}

/** Las 3 categorías financieras del Repositorio quedan exentas cuando el evento lo dicta un Speaker interno (no hay pago a HCP que respaldar). */
const CATEGORIAS_FINANCIERAS_CHECKLIST: CategoriaFinancieraRepositorio[] = ["ordenCompra", "facturas", "comprobantePago"];

export interface ContextoChecklistEvento {
  convenios: Convenio[];
  fmvs: Fmv[];
  notificaciones: NotificacionPagoHcp[];
  cafs: Caf[];
  archivosRepo: RepositorioArchivoEvento[];
  financierosRepo: RegistroFinancieroEvento[];
}

/**
 * Octubre 2026, pedido explícito: "en el informe de Auditoría de Eventos, los
 * documentos de paquete de cierre deben incluir la información de todos los
 * speakers que participan en la actividad". Antes el checklist tomaba UN solo
 * documento por tipo (`documentoSometidoDelEvento`: el primero que apareciera
 * para el evento) y las órdenes de compra/facturas/comprobantes de TODOS los
 * speakers se mezclaban en una sola fila — con 3 speakers bastaba que uno solo
 * tuviera FMV para marcar "FMV Checklist" como presente.
 *
 * Con 2 o más speakers del Repositorio, cada documento del paquete (Orden de
 * compra, Facturas, Comprobante de pago, Convenio de Pago, FMV Checklist, CAF y
 * Notificación de Pago) se evalúa y se muestra POR SPEAKER, con el nombre del
 * speaker en la etiqueta. Con 0 o 1 speaker el checklist es el de siempre.
 */
export function speakersDelChecklist(evento: Evento): SpeakerParticipacionEvento[] {
  if (!esSpeakerExterno(evento)) return [];
  const externos = speakersExternosDe(evento);
  return externos.length > 1 ? externos : [];
}

function etiquetaConSpeaker(base: string, sp: SpeakerParticipacionEvento, indice: number): string {
  return `${base} — ${sp.nombreSpeaker?.trim() || `Speaker ${indice + 1}`}`;
}

const mismoSpeaker = (idDocumento: string | null | undefined, sp: SpeakerParticipacionEvento) => !!sp.speakerId && idDocumento === sp.speakerId;

/** Items del checklist para un evento con varios speakers: una fila por speaker en cada documento del paquete. */
function itemsDocumentosPorSpeaker(
  evento: Evento,
  ctx: ContextoChecklistEvento,
  speakers: SpeakerParticipacionEvento[],
  aprobado: boolean,
): { financieros: ItemChecklistEvento[]; documentos: ItemChecklistEvento[] } {
  const financieros: ItemChecklistEvento[] = [];
  for (const categoria of CATEGORIAS_FINANCIERAS_CHECKLIST) {
    const base = categoria === "facturas" ? "Facturas" : ETIQUETA_CATEGORIA_FINANCIERA_REPOSITORIO[categoria];
    const delEvento = ctx.financierosRepo.filter((f) => f.eventoId === evento.id && f.categoria === categoria);
    speakers.forEach((sp, i) => {
      const etiqueta = etiquetaConSpeaker(base, sp, i);
      if (!aprobado) return financieros.push({ etiqueta, estado: "no_aplica" });
      const filas = delEvento.filter((f) => mismoSpeaker(f.speakerId, sp));
      financieros.push({ etiqueta, estado: filas.length > 0 ? "presente" : "faltante", archivoIds: filas.length > 0 ? filas.map((f) => f.archivoId) : undefined });
    });
    // Soportes cargados antes de existir la asignación por speaker: no se pierden.
    const sinSpeaker = delEvento.filter((f) => !f.speakerId || !speakers.some((sp) => mismoSpeaker(f.speakerId, sp)));
    if (aprobado && sinSpeaker.length > 0) {
      financieros.push({ etiqueta: `${base} — sin speaker asignado`, estado: "presente", archivoIds: sinSpeaker.map((f) => f.archivoId) });
    }
  }

  const documentos: ItemChecklistEvento[] = [];
  const convenios = ctx.convenios.filter((c) => c.eventoOrigenId === evento.id);
  const fmvs = ctx.fmvs.filter((f) => f.eventoOrigenId === evento.id);
  const cafsDelEvento = ctx.cafs.filter((c) => c.eventoOrigenId === evento.id && c.estado !== "Rechazado" && c.estado !== "Anulado" && c.estado !== "Borrador");
  // Igual que `documentosPorSpeaker`: un CAF sin speaker asignado se reparte por orden de creación.
  const cafsSinSpeaker = cafsDelEvento.filter((c) => !c.speakerId).sort((a, b) => new Date(a.creadoEn).getTime() - new Date(b.creadoEn).getTime());
  let siguienteCafSinSpeaker = 0;

  const cafPorSpeaker = speakers.map((sp) => {
    let caf = cafsDelEvento.find((c) => mismoSpeaker(c.speakerId, sp)) ?? null;
    if (!caf && siguienteCafSinSpeaker < cafsSinSpeaker.length) {
      caf = cafsSinSpeaker[siguienteCafSinSpeaker];
      siguienteCafSinSpeaker += 1;
    }
    return caf;
  });

  speakers.forEach((sp, i) => {
    const convenio = documentoSometidoDelEvento(convenios.filter((c) => mismoSpeaker(c.speakerId, sp)), evento.id);
    documentos.push({ etiqueta: etiquetaConSpeaker("Convenio de Pago a HCP", sp, i), estado: convenio ? "presente" : "faltante", documentoParaAbrir: convenio ?? undefined });
  });
  speakers.forEach((sp, i) => {
    const fmv = documentoSometidoDelEvento(fmvs.filter((f) => mismoSpeaker(f.speakerId, sp)), evento.id);
    documentos.push({ etiqueta: etiquetaConSpeaker("FMV Checklist", sp, i), estado: fmv ? "presente" : "faltante", documentoParaAbrir: fmv ?? undefined });
  });
  speakers.forEach((sp, i) => {
    const caf = cafPorSpeaker[i];
    const copiaCaf = ctx.archivosRepo.find((a) => a.eventoId === evento.id && a.categoria === "caf" && a.archivoId && mismoSpeaker(a.speakerId, sp));
    documentos.push({
      etiqueta: etiquetaConSpeaker("CAF", sp, i),
      estado: caf || copiaCaf ? "presente" : "faltante",
      documentoParaAbrir: caf ?? undefined,
      archivoIds: !caf && copiaCaf?.archivoId ? [copiaCaf.archivoId] : undefined,
    });
  });
  speakers.forEach((sp, i) => {
    const etiqueta = etiquetaConSpeaker("Notificación de Pago a HCPs", sp, i);
    const notif = documentoSometidoDelEvento(ctx.notificaciones.filter((n) => n.eventoOrigenId === evento.id && mismoSpeaker(n.speakerId, sp)), evento.id);
    if (notif) return documentos.push({ etiqueta, estado: "presente", documentoParaAbrir: notif });
    const facturasSpeaker = ctx.financierosRepo.filter((r) => r.eventoId === evento.id && r.categoria === "facturas" && mismoSpeaker(r.speakerId, sp));
    const sinNotificar = facturasSpeaker.filter((r) => !ctx.notificaciones.some((n) => notificacionCubreFactura(n, r)));
    const hayConvenio = convenios.some((c) => mismoSpeaker(c.speakerId, sp));
    documentos.push({ etiqueta, estado: hayConvenio && sinNotificar.length > 0 ? "faltante" : "no_aplica" });
  });
  return { financieros, documentos };
}

export function construirChecklistEvento(evento: Evento, ctx: ContextoChecklistEvento): ItemChecklistEvento[] {
  const items: ItemChecklistEvento[] = [];
  const variosSpeakers = speakersDelChecklist(evento);
  const aprobado = evento.estado === "Aprobado";
  const interno = esSpeakerInterno(evento);

  items.push({ etiqueta: "Solicitud de Evento Educativo y Promocional", estado: "presente", documentoParaAbrir: evento });

  const porSpeaker = variosSpeakers.length > 0 ? itemsDocumentosPorSpeaker(evento, ctx, variosSpeakers, aprobado) : null;
  if (porSpeaker) items.push(...porSpeaker.financieros);

  for (const categoria of porSpeaker ? [] : CATEGORIAS_FINANCIERAS_CHECKLIST) {
    // El checklist usa "Facturas" (plural) aquí — la etiqueta genérica del
    // enum ("Factura", singular) es la del formulario de carga de UNA fila;
    // el resto de categorías sí comparten la misma etiqueta en ambos lados.
    const etiqueta = categoria === "facturas" ? "Facturas" : ETIQUETA_CATEGORIA_FINANCIERA_REPOSITORIO[categoria];
    if (interno || !aprobado) {
      items.push({ etiqueta, estado: "no_aplica" });
      continue;
    }
    const filas = ctx.financierosRepo.filter((f) => f.eventoId === evento.id && f.categoria === categoria);
    items.push({
      etiqueta,
      estado: filas.length > 0 ? "presente" : "faltante",
      archivoIds: filas.length > 0 ? filas.map((f) => f.archivoId) : undefined,
    });
  }

  if (!aprobado) {
    items.push({ etiqueta: "Lista de asistencia", estado: "no_aplica" });
    items.push({ etiqueta: "Fotos del evento (evidencia)", estado: "no_aplica" });
  } else {
    const multisesion = esMultisesion(evento);
    const cargados = ctx.archivosRepo.filter((a) => a.eventoId === evento.id && a.categoria === "listaAsistencia");
    const satisfecha = listaAsistenciaSatisfecha(evento, ctx.archivosRepo);
    const satisfechaSinArchivos = satisfecha && cargados.length === 0;
    items.push({
      etiqueta: "Lista de asistencia",
      estado: satisfecha ? "presente" : "faltante",
      archivoIds: cargados.length > 0 ? idsConArchivo(cargados) : undefined,
      nota: satisfechaSinArchivos
        ? multisesion
          ? "Satisfecha por declaración de 'No aplica' en todas las sesiones"
          : "Satisfecha por declaración de 'No aplica' (condiciones masivas del evento)"
        : undefined,
    });

    const fotos = ctx.archivosRepo.filter((a) => a.eventoId === evento.id && a.categoria === "fotos");
    items.push({
      etiqueta: "Fotos del evento (evidencia)",
      estado: fotos.length > 0 ? "presente" : "faltante",
      archivoIds: fotos.length > 0 ? idsConArchivo(fotos) : undefined,
    });
  }

  if (porSpeaker) {
    items.push(...porSpeaker.documentos);
    return items;
  }

  // AJUSTES (septiembre/octubre 2026): `documentoSometidoDelEvento`, no
  // `documentoActivoDelEvento` — ver su comentario — para que un borrador
  // vacío no cuente como que el documento ya está resuelto.
  const convenioActivo = documentoSometidoDelEvento(ctx.convenios, evento.id);
  const fmvActivo = documentoSometidoDelEvento(ctx.fmvs, evento.id);
  const requiereExterno = esSpeakerExterno(evento);

  items.push(
    requiereExterno
      ? { etiqueta: "Convenio de Pago a HCP", estado: convenioActivo ? "presente" : "faltante", documentoParaAbrir: convenioActivo ?? undefined }
      : { etiqueta: "Convenio de Pago a HCP", estado: "no_aplica" },
  );
  items.push(
    requiereExterno
      ? { etiqueta: "FMV Checklist", estado: fmvActivo ? "presente" : "faltante", documentoParaAbrir: fmvActivo ?? undefined }
      : { etiqueta: "FMV Checklist", estado: "no_aplica" },
  );

  const cafActivo = documentoSometidoDelEvento(ctx.cafs, evento.id);
  const cafArchivoFallback = ctx.archivosRepo.find((a) => a.eventoId === evento.id && a.categoria === "caf" && a.archivoId);
  items.push(
    requiereExterno && !interno
      ? {
          etiqueta: "CAF",
          estado: cafActivo || cafArchivoFallback ? "presente" : "faltante",
          documentoParaAbrir: cafActivo ?? undefined,
          archivoIds: !cafActivo && cafArchivoFallback?.archivoId ? [cafArchivoFallback.archivoId] : undefined,
        }
      : { etiqueta: "CAF", estado: "no_aplica" },
  );

  // AJUSTES (septiembre/octubre 2026): antes esto tomaba CUALQUIER
  // notificación del evento sin filtrar por estado (ni siquiera excluía
  // Rechazada/Anulada) — se alinea con el mismo criterio que
  // Convenio/FMV/CAF arriba (`documentoSometidoDelEvento`, ver su
  // comentario).
  const notifExistente = documentoSometidoDelEvento(ctx.notificaciones, evento.id);
  items.push(
    notifExistente
      ? { etiqueta: "Notificación de Pago a HCPs", estado: "presente", documentoParaAbrir: notifExistente }
      : {
          etiqueta: "Notificación de Pago a HCPs",
          estado: necesitaNotificacionPago(evento, ctx.convenios, ctx.notificaciones, ctx.financierosRepo) ? "faltante" : "no_aplica",
        },
  );

  return items;
}

// --- Ronda de ajustes de formularios (septiembre 2026), entrega 5:
// selector de "Evento de origen" compartido por Convenio de Pago a HCP, CAF
// y (en su propia entrega) FMV/Notificación de Pago — todos piden la misma
// regla de filtrado ("eventos con participación académica y Speaker
// externo") y el mismo formato de etiqueta ("para evitar confusiones... 
// concatenar Nombre del evento y la fecha"). ---

export interface OpcionEventoOrigen {
  id: string;
  etiqueta: string;
  /**
   * Octubre 2026: ids (del Repositorio de HCPs/Speakers) de los speakers que
   * están vinculados al evento desde la Solicitud de evento educativo y
   * promocional. Los formularios que piden "Seleccionar HCP del Repositorio"
   * (p. ej. FMV Checklist) solo ofrecen estos.
   */
  speakerIds: string[];
  /** Sesiones del evento (solo en eventos de «Varias sesiones»), para rotular facturas por sesión. */
  sesiones?: { id: string; etiqueta: string }[];
}

/** Ids de repositorio de los speakers vinculados a la solicitud del evento (sin repetidos ni filas sin speaker del repositorio). */
export function speakerIdsDelEvento(evento: Evento): string[] {
  return Array.from(new Set(evento.speakersParticipacion.map((sp) => sp.speakerId).filter((id): id is string => !!id)));
}

function opcionEventoOrigen(ev: Evento): OpcionEventoOrigen {
  return {
    id: ev.id,
    etiqueta: etiquetaEventoOrigen(ev),
    speakerIds: speakerIdsDelEvento(ev),
    sesiones: esMultisesion(ev)
      ? ev.sesiones.map((se, i) => ({ id: se.id, etiqueta: `Sesión ${i + 1}${se.fecha ? ` (${se.fecha})` : ""}` }))
      : [],
  };
}

/**
 * "Nombre del evento (fecha o rango)" — en un evento de Varias sesiones usa
 * la fecha de la primera y la última sesión (pedido explícito: "fecha
 * inicial a fecha final"); en Única sesión, las fechas de inicio/fin del
 * documento.
 */
export function etiquetaEventoOrigen(evento: Evento): string {
  let inicio: string | null;
  let fin: string | null;
  if (esMultisesion(evento)) {
    inicio = evento.sesiones[0]?.fecha ?? null;
    fin = evento.sesiones[evento.sesiones.length - 1]?.fecha ?? null;
  } else {
    inicio = evento.fechaInicioEvento;
    fin = evento.fechaFinEvento;
  }
  const rango = inicio && fin && inicio !== fin ? `${inicio} a ${fin}` : inicio ?? fin ?? "sin fecha";
  return `${evento.nombreEvento} (${rango})`;
}

/**
 * Eventos elegibles como "Evento de origen" para Convenio de Pago a HCP y
 * CAF: participación académica marcada "Sí" con "Speaker externo" — mismo
 * criterio que `esSpeakerExterno`.
 */
export function eventosParaOrigenSpeakerExterno(eventos: Evento[]): OpcionEventoOrigen[] {
  return eventos.filter(esSpeakerExterno).map(opcionEventoOrigen);
}

/**
 * Ronda de ajustes de formularios (septiembre 2026), entrega 7: eventos
 * elegibles como "Evento de origen" para CAF — participación académica con
 * Speaker externo Y que YA tenga un FMV Checklist y un Convenio de Pago a
 * HCP vinculados (pedido explícito, más estricto que el filtro de Convenio/
 * FMV de arriba). Reutiliza `tieneConvenioYFmv`, ya existente.
 */
export function eventosParaOrigenCaf(eventos: Evento[], convenios: Convenio[], fmvs: Fmv[]): OpcionEventoOrigen[] {
  return eventos
    .filter((ev) => esSpeakerExterno(ev) && tieneConvenioYFmv(ev, convenios, fmvs))
    .map(opcionEventoOrigen);
}

/**
 * Eventos elegibles como "Evento de origen" para Notificación de Pago a HCPs —
 * mismo criterio que CAF (participación académica, Speaker externo, con FMV
 * Checklist y Convenio de Pago a HCP ya vinculados). Octubre 2026 (entrega
 * 25): además, el formulario solo ofrece los eventos/speakers que tengan al
 * menos una factura cargada en el Expediente sin notificar (ver
 * `lib/facturasNotificacionPago.ts`); ese último filtro se aplica en el propio
 * formulario porque depende de los registros financieros.
 */
export function eventosParaOrigenNotificacionPago(eventos: Evento[], convenios: Convenio[], fmvs: Fmv[]): OpcionEventoOrigen[] {
  return eventosParaOrigenCaf(eventos, convenios, fmvs);
}

export interface OpcionEventoOrigenConvenioHCP {
  /** Compuesto `${eventoId}::${speakerId}` — un evento con varios speakers necesita una opción distinta por cada uno. */
  id: string;
  eventoId: string;
  speakerId: string;
  /** CAF ya resuelto para este evento+speaker (mismo emparejamiento que `documentosPorSpeaker`) — se guarda internamente al elegir esta opción; el formulario ya no expone un selector de CAF propio. */
  cafId: string;
  etiqueta: string;
}

/**
 * Fechas a mostrar en la etiqueta del selector para UN speaker concreto: en
 * "Única sesión" son las del evento completo; en "Varias sesiones" son
 * SOLO las de las sesiones en las que ese speaker efectivamente participó
 * (`SpeakerParticipacionEvento.presupuestos[].sesionId` — `null` significa
 * que participa en el evento completo/todas las sesiones).
 */
function etiquetaSesionesSpeaker(evento: Evento, sp: SpeakerParticipacionEvento): string {
  if (!esMultisesion(evento)) {
    const inicio = evento.fechaInicioEvento;
    const fin = evento.fechaFinEvento;
    return inicio && fin && inicio !== fin ? `${inicio} a ${fin}` : inicio ?? fin ?? "sin fecha";
  }
  const participaEnTodas = sp.presupuestos.some((p) => p.sesionId === null);
  const fechas = (participaEnTodas ? evento.sesiones : evento.sesiones.filter((s) => sp.presupuestos.some((p) => p.sesionId === s.id)))
    .map((s) => s.fecha)
    .filter((f): f is string => !!f)
    .sort();
  if (fechas.length === 0) return "sin fecha";
  const inicio = fechas[0];
  const fin = fechas[fechas.length - 1];
  return inicio !== fin ? `${inicio} a ${fin}` : inicio;
}

/**
 * Ronda de correcciones "Nuevo Convenio HCP" (septiembre 2026): el selector
 * "Evento de origen" pasa de ser UNA opción por evento a ser una opción por
 * cada combinación evento+speaker — pedido explícito, porque un evento puede
 * tener varias sesiones y varios speakers, y cada speaker puede haber
 * participado solo en algunas de esas sesiones. La etiqueta concatena
 * Nombre del evento + fecha(s) de ESE speaker + Nombre del speaker +
 * Especialidad. Elegir una opción ya determina el speaker (el selector
 * "Speaker (opcional)" se retiró del formulario) y el CAF asociado (el
 * selector "CAF asociado" también se retiró — se resuelve aquí con el mismo
 * emparejamiento que ya usa `documentosPorSpeaker` para el estado de
 * documentos por speaker).
 */
export function eventosParaOrigenConvenioHCP(
  eventos: Evento[],
  convenios: Convenio[],
  fmvs: Fmv[],
  cafs: Caf[],
  conveniosHCP: ConvenioHcp[],
  speakers: { id: string; especialidad: string }[],
  /** Convenio HCP que se está editando: su propia opción (evento+speaker) no se excluye. */
  documentoActualId?: string,
): OpcionEventoOrigenConvenioHCP[] {
  const opciones: OpcionEventoOrigenConvenioHCP[] = [];
  for (const evento of eventos.filter(esSpeakerExterno)) {
    for (const estado of documentosPorSpeaker(evento, convenios, fmvs, cafs, conveniosHCP)) {
      if (!estado.speaker.speakerId || !estado.convenio || !estado.fmv || !estado.caf) continue;
      // Octubre 2026 (entrega 20): igual que en los demás formularios, solo se
      // ofrece a quienes todavía no tienen su Convenio HCP para este evento.
      if (estado.convenioHCP && estado.convenioHCP.id !== documentoActualId) continue;
      const especialidad = speakers.find((s) => s.id === estado.speaker.speakerId)?.especialidad ?? "";
      const etiqueta = [
        `${evento.nombreEvento} (${etiquetaSesionesSpeaker(evento, estado.speaker)})`,
        estado.speaker.nombreSpeaker,
        especialidad,
      ]
        .filter(Boolean)
        .join(" — ");
      opciones.push({
        id: `${evento.id}::${estado.speaker.speakerId}`,
        eventoId: evento.id,
        speakerId: estado.speaker.speakerId,
        cafId: estado.caf.id,
        etiqueta,
      });
    }
  }
  return opciones;
}

