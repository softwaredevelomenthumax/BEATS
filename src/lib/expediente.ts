import type {
  Caf,
  Convenio,
  ConvenioHcp,
  Fmv,
  Evento,
  MuestraEntregada,
  RegistroFinancieroEvento,
  RegistroFuerzaVentas,
  RegistroParticipacion,
  RepositorioArchivoEvento,
  SpeakerParticipacionEvento,
} from "@/types";
import type { ResumenConvenioHCPEvento } from "@/lib/convenioHCP";
import { documentosPorSpeaker, esMultisesion, esSpeakerExterno } from "@/lib/documentosRequeridosEvento";
import { speakersExternosDe } from "@/lib/speakersEvento";
import { estadoFacturas, facturasPendientesDePago, situacionComprobantes } from "@/lib/facturacionSpeaker";

/**
 * Expediente del evento (octubre 2026) — reglas puras (sin React ni
 * Supabase) que usan las pestañas del Expediente y que se pueden verificar
 * en aislamiento: marcos de foto, distribución de asistentes impactados,
 * conciliación OC ↔ facturas ↔ comprobantes, etapa del convenio de cada HCP
 * y modalidad de facturación.
 */

// --- Fotos -----------------------------------------------------------------

export const MAX_FOTOS_EVENTO = 4;

export const MARCOS_FOTO = [
  {
    clave: "grupal",
    titulo: "Foto grupal",
    guia: "Todos los asistentes juntos, mirando a la cámara. Procura que se vea el banner o la pantalla del evento.",
  },
  {
    clave: "actividad_1",
    titulo: "Actividad (1)",
    guia: "La actividad en curso — por ejemplo, la aplicación del producto a un paciente o una demostración. Que se vea quién la realiza.",
  },
  {
    clave: "actividad_2",
    titulo: "Actividad (2)",
    guia: "Otro momento o ángulo distinto de la actividad, para dar contexto.",
  },
  {
    clave: "speaker",
    titulo: "Speaker exponiendo",
    guia: "El speaker presentando, con la proyección o diapositiva visible detrás.",
  },
] as const;

export type ClaveMarcoFoto = (typeof MARCOS_FOTO)[number]["clave"];

export function fotosPorMarco(archivos: RepositorioArchivoEvento[]): Map<string, RepositorioArchivoEvento> {
  const mapa = new Map<string, RepositorioArchivoEvento>();
  for (const a of archivos) {
    if (a.categoria === "fotos" && a.archivoId) mapa.set(a.etiqueta ?? `sin-marco-${a.id}`, a);
  }
  return mapa;
}

/**
 * Octubre 2026, pedido explícito: las fotos son POR SESIÓN. Un evento de
 * "Varias sesiones" tiene un juego de hasta 4 fotos (`MAX_FOTOS_EVENTO`) por
 * cada sesión; uno de sesión única tiene un solo juego (`sesionId: null`).
 */
export interface AlcanceFotos {
  /** `null` = evento de sesión única. */
  sesionId: string | null;
  etiqueta: string;
}

export function alcancesFotos(evento: Evento): AlcanceFotos[] {
  if (!esMultisesion(evento)) return [{ sesionId: null, etiqueta: "Evento completo" }];
  return evento.sesiones.map((s, i) => ({
    sesionId: s.id,
    etiqueta: `Sesión ${i + 1}${s.fecha ? ` — ${s.fecha}` : ""}${s.lugar ? ` · ${s.lugar}` : ""}`,
  }));
}

/** Fotos con archivo que pertenecen a un alcance (una sesión, o el evento de sesión única). */
export function fotosDelAlcance(archivos: RepositorioArchivoEvento[], sesionId: string | null): RepositorioArchivoEvento[] {
  return archivos.filter((a) => a.categoria === "fotos" && a.archivoId && (a.sesionId ?? null) === sesionId);
}

/** En un evento de varias sesiones, fotos cargadas antes de existir la asignación por sesión (o de una sesión que ya no existe). */
export function fotosSinSesion(evento: Evento, archivos: RepositorioArchivoEvento[]): RepositorioArchivoEvento[] {
  if (!esMultisesion(evento)) return [];
  const ids = new Set(evento.sesiones.map((s) => s.id));
  return archivos.filter((a) => a.categoria === "fotos" && a.archivoId && (!a.sesionId || !ids.has(a.sesionId)));
}

/** Cuántas fotos se pueden tener en total: 4 por alcance. */
export function maximoFotosEvento(evento: Evento): number {
  return alcancesFotos(evento).length * MAX_FOTOS_EVENTO;
}

// --- Asistentes impactados -------------------------------------------------

export interface DistribucionAsistentes {
  medico: number;
  noMedico: number;
  fuerzaVentas: number;
  otro: number;
  total: number;
  /** De dónde salen los números: el módulo de Ejecución (oficial), una lista externa cargada, o todavía nada. */
  fuente: "ejecucion" | "lista_externa" | "sin_datos";
}

export interface AlcanceAsistencia {
  /** `null` = evento completo (sesión única) o registros sin sesión asignada. */
  sesionId: string | null;
  etiqueta: string;
  distribucion: DistribucionAsistentes;
  /** Registros del módulo de Ejecución en este alcance. */
  registrosEjecucion: number;
  /** Octubre 2026: las filas de asistencia (check-in) de este alcance, para la tabla/PDF de la lista de asistencia. */
  registros: RegistroParticipacion[];
  /** Listas externas cargadas para este alcance. */
  listasExternas: RepositorioArchivoEvento[];
  otroManual: number;
}

const esMedico = (r: RegistroParticipacion) => r.profesion === "medico";

/**
 * Regla (confirmada con el usuario): la lista oficial es la que sale de
 * Ejecución. Si hay registros de Ejecución (o de fuerza de ventas) se usan sus
 * números —médico/no médico por la profesión del check-in, fuerza de ventas
 * por su propio registro— más el "Otro personal" anotado a mano. Solo si
 * Ejecución no tiene nada para ese alcance y se cargó una lista externa con
 * conteos, se usan los conteos de esa lista.
 */
export function calcularDistribucion(params: {
  registros: RegistroParticipacion[];
  fuerzaVentas: RegistroFuerzaVentas[];
  listasExternas: RepositorioArchivoEvento[];
  otroManual: number;
}): DistribucionAsistentes {
  const { registros, fuerzaVentas, listasExternas, otroManual } = params;
  if (registros.length > 0 || fuerzaVentas.length > 0) {
    const medico = registros.filter(esMedico).length;
    const noMedico = registros.length - medico;
    const fuerza = fuerzaVentas.length;
    return { medico, noMedico, fuerzaVentas: fuerza, otro: otroManual, total: medico + noMedico + fuerza + otroManual, fuente: "ejecucion" };
  }
  const conConteos = listasExternas.filter(
    (l) => [l.conteoPersonalMedico, l.conteoPersonalNoMedico, l.conteoFuerzaVentas, l.conteoOtroPersonal].some((n) => (n ?? 0) > 0),
  );
  if (conConteos.length > 0) {
    const suma = (f: (l: RepositorioArchivoEvento) => number | null) => conConteos.reduce((a, l) => a + (f(l) ?? 0), 0);
    const medico = suma((l) => l.conteoPersonalMedico);
    const noMedico = suma((l) => l.conteoPersonalNoMedico);
    const fuerza = suma((l) => l.conteoFuerzaVentas);
    const otro = suma((l) => l.conteoOtroPersonal) + otroManual;
    return { medico, noMedico, fuerzaVentas: fuerza, otro, total: medico + noMedico + fuerza + otro, fuente: "lista_externa" };
  }
  return { medico: 0, noMedico: 0, fuerzaVentas: 0, otro: otroManual, total: otroManual, fuente: "sin_datos" };
}

export function construirAlcancesAsistencia(params: {
  evento: Evento;
  registros: RegistroParticipacion[];
  fuerzaVentas: RegistroFuerzaVentas[];
  archivos: RepositorioArchivoEvento[];
  ajustes: { sesionId: string | null; conteoOtroPersonal: number }[];
}): AlcanceAsistencia[] {
  const { evento, registros, fuerzaVentas, archivos, ajustes } = params;
  const listas = archivos.filter((a) => a.categoria === "listaAsistencia" && a.archivoId);
  const otroDe = (sesionId: string | null) => ajustes.find((a) => a.sesionId === sesionId)?.conteoOtroPersonal ?? 0;

  const armar = (sesionId: string | null, etiqueta: string, regs: RegistroParticipacion[], fv: RegistroFuerzaVentas[], ls: RepositorioArchivoEvento[]): AlcanceAsistencia => ({
    sesionId,
    etiqueta,
    registrosEjecucion: regs.length + fv.length,
    registros: regs,
    listasExternas: ls,
    otroManual: otroDe(sesionId),
    distribucion: calcularDistribucion({ registros: regs, fuerzaVentas: fv, listasExternas: ls, otroManual: otroDe(sesionId) }),
  });

  if (!esMultisesion(evento)) {
    return [armar(null, "Evento completo", registros, fuerzaVentas, listas)];
  }
  const alcances = evento.sesiones.map((s, i) =>
    armar(
      s.id,
      `Sesión ${i + 1}${s.fecha ? ` — ${s.fecha}` : ""}${s.lugar ? ` · ${s.lugar}` : ""}`,
      registros.filter((r) => r.sesionEventoId === s.id),
      fuerzaVentas.filter((f) => f.sesionId === s.id),
      listas.filter((l) => l.sesionId === s.id),
    ),
  );
  const idsSesiones = new Set(evento.sesiones.map((s) => s.id));
  const regsSueltos = registros.filter((r) => !r.sesionEventoId || !idsSesiones.has(r.sesionEventoId));
  const fvSueltos = fuerzaVentas.filter((f) => !f.sesionId || !idsSesiones.has(f.sesionId));
  if (regsSueltos.length > 0 || fvSueltos.length > 0) {
    alcances.push(armar(null, "Sin sesión asignada", regsSueltos, fvSueltos, listas.filter((l) => !l.sesionId)));
  }
  return alcances;
}

export function sumarDistribuciones(alcances: AlcanceAsistencia[]): DistribucionAsistentes {
  const total = alcances.reduce(
    (acc, a) => ({
      medico: acc.medico + a.distribucion.medico,
      noMedico: acc.noMedico + a.distribucion.noMedico,
      fuerzaVentas: acc.fuerzaVentas + a.distribucion.fuerzaVentas,
      otro: acc.otro + a.distribucion.otro,
    }),
    { medico: 0, noMedico: 0, fuerzaVentas: 0, otro: 0 },
  );
  const fuentes = new Set(alcances.map((a) => a.distribucion.fuente));
  return {
    ...total,
    total: total.medico + total.noMedico + total.fuerzaVentas + total.otro,
    fuente: fuentes.has("ejecucion") ? "ejecucion" : fuentes.has("lista_externa") ? "lista_externa" : "sin_datos",
  };
}

// --- Facturación y conciliación --------------------------------------------

export type ModalidadFactura = "unica" | "por_sesion";

/** "Factura única" (todas las sesiones del speaker) o "Factura por sesión". En un evento de sesión única siempre es única. */
export function modalidadFacturaSpeaker(evento: Evento, sp: SpeakerParticipacionEvento): ModalidadFactura {
  if (!esMultisesion(evento)) return "unica";
  const texto = (sp.facturaModalidad || evento.facturaModalidad || "").toLowerCase();
  return texto.includes("por sesi") ? "por_sesion" : "unica";
}

/** Sesiones en las que participa un speaker (para facturar por sesión). `participaEnTodas` si alguno de sus presupuestos no tiene sesión. */
export function sesionesDelSpeaker(evento: Evento, sp: SpeakerParticipacionEvento): Evento["sesiones"] {
  if (!esMultisesion(evento)) return [];
  const participaEnTodas = sp.presupuestos.length === 0 || sp.presupuestos.some((p) => p.sesionId === null);
  return participaEnTodas ? evento.sesiones : evento.sesiones.filter((s) => sp.presupuestos.some((p) => p.sesionId === s.id));
}

export interface LineaConciliacion {
  moneda: string;
  ordenCompra: number;
  facturas: number;
  comprobantes: number;
  /** Mensajes legibles; vacío = todo cuadra. */
  alertas: string[];
}

function sumar(filas: RegistroFinancieroEvento[]): number {
  return filas.reduce((a, f) => a + (f.valor ?? 0), 0);
}

/** OC ↔ facturas ↔ comprobantes de pago, por moneda. Recibe solo las filas del alcance que se quiere conciliar (un speaker, o todo el evento). */
export function conciliar(filas: RegistroFinancieroEvento[]): LineaConciliacion[] {
  const monedas = Array.from(new Set(filas.map((f) => f.moneda || "—")));
  return monedas.map((moneda) => {
    const delaMoneda = filas.filter((f) => (f.moneda || "—") === moneda);
    const oc = sumar(delaMoneda.filter((f) => f.categoria === "ordenCompra"));
    const fa = sumar(delaMoneda.filter((f) => f.categoria === "facturas"));
    const co = sumar(delaMoneda.filter((f) => f.categoria === "comprobantePago"));
    const hayOc = delaMoneda.some((f) => f.categoria === "ordenCompra");
    const hayFa = delaMoneda.some((f) => f.categoria === "facturas");
    const hayCo = delaMoneda.some((f) => f.categoria === "comprobantePago");
    const alertas: string[] = [];
    const redondeo = (n: number) => Math.round(n * 100) / 100;
    if (hayFa && !hayOc) alertas.push("Hay facturas pero no hay orden de compra.");
    if (hayOc && hayFa && redondeo(fa) > redondeo(oc)) alertas.push("Las facturas superan el valor de la orden de compra.");
    if (hayOc && hayFa && redondeo(fa) < redondeo(oc)) alertas.push("Faltan facturas por cubrir la orden de compra.");
    if (hayCo && !hayFa) alertas.push("Hay comprobantes de pago pero no hay facturas.");
    if (hayFa && hayCo && redondeo(co) > redondeo(fa)) alertas.push("Los comprobantes de pago superan lo facturado.");
    if (hayFa && hayCo && redondeo(co) < redondeo(fa)) alertas.push("Hay facturas pendientes de pago.");
    return { moneda, ordenCompra: oc, facturas: fa, comprobantes: co, alertas };
  });
}

// --- Convenio HCP ----------------------------------------------------------

export type EtapaConvenioHcp = "sin_convenio" | "en_aprobacion" | "pendiente_envio" | "enviado" | "firmado" | "corporativo_pendiente_copia";

export const ETIQUETA_ETAPA_CONVENIO_HCP: Record<EtapaConvenioHcp, string> = {
  sin_convenio: "Sin convenio",
  en_aprobacion: "En aprobación",
  pendiente_envio: "Aprobado — pendiente de enviar al HCP",
  enviado: "Enviado al HCP — esperando firma",
  firmado: "Versión firmada recibida (definitiva)",
  corporativo_pendiente_copia: "Aplicativo corporativo — falta cargar la copia firmada",
};

export function etapaConvenioHcp(c: ResumenConvenioHCPEvento | null | undefined): EtapaConvenioHcp {
  if (!c) return "sin_convenio";
  if (c.estado !== "Aprobado" && c.estado !== "Completado") return "en_aprobacion";
  if (c.archivoFirmadoHCPId) return "firmado";
  // Entrega 32: elaborado en el aplicativo corporativo de contratos — no se envía desde BEATS, solo falta la copia firmada.
  if (c.elaboradoEnContratosCorporativo) return "corporativo_pendiente_copia";
  return c.archivoParaHCPEnviadoEn ? "enviado" : "pendiente_envio";
}

/** Convenios del evento que corresponden a un speaker (por `speakerId`; si el convenio no lo trae y el evento tiene un solo speaker, se asume suyo). */
export function convenioDelSpeaker(
  convenios: ResumenConvenioHCPEvento[],
  sp: SpeakerParticipacionEvento,
  totalSpeakers: number,
): ResumenConvenioHCPEvento | null {
  const exacto = convenios.find((c) => sp.speakerId && c.speakerId === sp.speakerId);
  if (exacto) return exacto;
  if (totalSpeakers === 1) return convenios.find((c) => !c.speakerId) ?? null;
  return null;
}

// --- Avance del expediente (pestaña "Resumen") ------------------------------

export type PestanaExpediente = "resumen" | "documentos" | "speakers" | "asistencia" | "muestra" | "fotos" | "financiero";

export interface ItemAvanceExpediente {
  id: string;
  grupo: string;
  etiqueta: string;
  hecho: boolean;
  detalle?: string;
  pestana: PestanaExpediente;
}

export interface ContextoExpediente {
  evento: Evento;
  archivos: RepositorioArchivoEvento[];
  financieros: RegistroFinancieroEvento[];
  conveniosResumen: ResumenConvenioHCPEvento[];
  convenios: Convenio[];
  fmvs: Fmv[];
  cafs: Caf[];
  conveniosHcp: ConvenioHcp[];
  alcancesAsistencia: AlcanceAsistencia[];
}

/** Una carga o una declaración "No aplica" con motivo satisfacen un documento del repositorio. */
export function documentoRepoResuelto(filas: RepositorioArchivoEvento[]): { hecho: boolean; noAplica: boolean } {
  const conArchivo = filas.some((f) => !f.noAplica && f.archivoId);
  const noAplica = filas.some((f) => f.noAplica && f.noAplicaMotivo.trim());
  return { hecho: conArchivo || noAplica, noAplica: !conArchivo && noAplica };
}

export function filasRepoDelSpeaker(
  archivos: RepositorioArchivoEvento[],
  categoria: RepositorioArchivoEvento["categoria"],
  speakerId: string | null,
): RepositorioArchivoEvento[] {
  return archivos.filter((a) => a.categoria === categoria && (a.speakerId ?? null) === (speakerId ?? null));
}

export function filasFinancierasDelSpeaker(
  financieros: RegistroFinancieroEvento[],
  categoria: RegistroFinancieroEvento["categoria"],
  speakerId: string | null,
): RegistroFinancieroEvento[] {
  return financieros.filter((f) => f.categoria === categoria && (f.speakerId ?? null) === (speakerId ?? null));
}

export interface GrupoSpeakerExpediente {
  /** Fila de participación (`null` en un evento con speaker externo sin filas de speakers — datos antiguos). */
  sp: SpeakerParticipacionEvento | null;
  nombre: string;
  speakerId: string | null;
}

/**
 * Los "bloques" por speaker del Expediente. Evento con speaker externo: uno
 * por cada speaker declarado (o uno genérico si es un evento antiguo sin
 * filas de speakers). Evento sin speaker externo: ninguno.
 */
export function gruposSpeakers(evento: Evento): GrupoSpeakerExpediente[] {
  if (!esSpeakerExterno(evento)) return [];
  const externos = speakersExternosDe(evento);
  if (externos.length === 0) return [{ sp: null, nombre: "Speaker externo", speakerId: null }];
  return externos.map((sp) => ({ sp, nombre: sp.nombreSpeaker || "Speaker sin nombre", speakerId: sp.speakerId }));
}

export function calcularAvanceExpediente(ctx: ContextoExpediente): ItemAvanceExpediente[] {
  const { evento, archivos, financieros, conveniosResumen, convenios, fmvs, cafs, conveniosHcp, alcancesAsistencia } = ctx;
  const items: ItemAvanceExpediente[] = [];

  items.push({ id: "solicitud", grupo: "Evento", etiqueta: "Solicitud de evento aprobada", hecho: true, pestana: "documentos" });

  // Lista de asistencia: cada alcance con datos de Ejecución, lista externa o "No aplica" declarado en la solicitud.
  const alcancesReales = alcancesAsistencia.filter((a) => a.sesionId !== null || !esMultisesion(evento) || a.registrosEjecucion > 0);
  const asistenciaOk = alcancesReales.length > 0 && alcancesReales.every((a) => {
    if (a.distribucion.fuente !== "sin_datos") return true;
    if (a.listasExternas.length > 0) return true;
    if (!esMultisesion(evento)) return evento.listaAsistenciaNoAplica && !!evento.listaAsistenciaNoAplicaMotivo;
    const sesion = evento.sesiones.find((s) => s.id === a.sesionId);
    return !!sesion?.listaAsistenciaNoAplica && !!sesion.listaAsistenciaNoAplicaMotivo;
  });
  items.push({
    id: "asistencia",
    grupo: "Evento",
    etiqueta: "Lista de asistencia",
    hecho: asistenciaOk,
    detalle: asistenciaOk ? undefined : esMultisesion(evento) ? "Falta la lista de alguna sesión" : "Todavía sin asistentes registrados",
    pestana: "asistencia",
  });
  // Octubre 2026: cada sesión debe tener al menos una foto (sesión única: el evento).
  const alcancesF = alcancesFotos(evento);
  const alcancesConFoto = alcancesF.filter((a) => fotosDelAlcance(archivos, a.sesionId).length > 0).length;
  const nFotos = alcancesF.reduce((acc, a) => acc + fotosDelAlcance(archivos, a.sesionId).length, 0);
  items.push({
    id: "fotos",
    grupo: "Evento",
    etiqueta: esMultisesion(evento) ? "Fotos de cada sesión" : "Fotos del evento",
    hecho: alcancesConFoto === alcancesF.length,
    detalle: esMultisesion(evento) ? `${alcancesConFoto} de ${alcancesF.length} sesiones con fotos` : `${nFotos} de ${MAX_FOTOS_EVENTO}`,
    pestana: "fotos",
  });

  const externo = esSpeakerExterno(evento);
  if (!externo && !evento.participacionAcademica) return items;

  const porSpeaker = externo ? documentosPorSpeaker(evento, convenios, fmvs, cafs, conveniosHcp) : [];
  const lista = speakersExternosDe(evento);
  // Evento sin speaker externo pero con participación académica: presentación y evidencia a nivel del evento.
  const claves: GrupoSpeakerExpediente[] = externo ? gruposSpeakers(evento) : [{ sp: null, nombre: "Evento", speakerId: null }];

  for (const { sp, nombre, speakerId } of claves) {
    const grupo = nombre;
    const docs = sp ? porSpeaker.find((d) => d.speaker.id === sp.id) : undefined;
    const pres = documentoRepoResuelto(filasRepoDelSpeaker(archivos, "presentacionAprobada", speakerId));
    const evid = documentoRepoResuelto(filasRepoDelSpeaker(archivos, "evidenciaAprobacionPresentacion", speakerId));
    items.push({ id: `pres-${nombre}`, grupo, etiqueta: "Presentación aprobada", hecho: pres.hecho, detalle: pres.noAplica ? "No aplica" : undefined, pestana: "speakers" });
    items.push({ id: `evid-${nombre}`, grupo, etiqueta: "Evidencia de aprobación de la presentación", hecho: evid.hecho, detalle: evid.noAplica ? "No aplica" : undefined, pestana: "speakers" });
    if (!externo) continue;

    const oc = filasFinancierasDelSpeaker(financieros, "ordenCompra", speakerId);
    items.push({ id: `oc-${nombre}`, grupo, etiqueta: "Orden de compra", hecho: oc.length > 0, pestana: "speakers" });

    const convenio = sp ? convenioDelSpeaker(conveniosResumen, sp, lista.length) : conveniosResumen[0] ?? null;
    const etapa = etapaConvenioHcp(convenio);
    items.push({ id: `conv-${nombre}`, grupo, etiqueta: "Convenio HCP — versión firmada", hecho: etapa === "firmado", detalle: ETIQUETA_ETAPA_CONVENIO_HCP[etapa], pestana: "speakers" });

    const cafDoc = docs?.caf ?? null;
    const copiaCaf = filasRepoDelSpeaker(archivos, "caf", speakerId).some((f) => f.archivoId);
    const cafOk = !!cafDoc && cafDoc.estado !== "Borrador" && (!cafDoc.elaboradoEnCafCorporativo || copiaCaf);
    items.push({
      id: `caf-${nombre}`,
      grupo,
      etiqueta: "CAF",
      hecho: cafOk,
      detalle: cafDoc?.elaboradoEnCafCorporativo && !copiaCaf ? "Falta cargar la copia del CAF corporativo" : !cafDoc ? "Sin CAF" : undefined,
      pestana: "speakers",
    });

    const facturas = filasFinancierasDelSpeaker(financieros, "facturas", speakerId);
    const modalidad = sp ? modalidadFacturaSpeaker(evento, sp) : "unica";
    const sesionesF = sp ? sesionesDelSpeaker(evento, sp) : [];
    // Entrega 37: la factura queda completa cuando todos los cupos de la modalidad (uno, o uno por sesión) tienen la suya,
    // y el comprobante de pago cuando todas las facturas están cubiertas por algún comprobante.
    const estadoFac = estadoFacturas({ modalidad, sesiones: sesionesF, facturas });
    items.push({
      id: `fac-${nombre}`,
      grupo,
      etiqueta: estadoFac.modalidad === "por_sesion" ? "Facturas (una por sesión)" : "Factura",
      hecho: estadoFac.completo,
      detalle: estadoFac.completo ? undefined : estadoFac.modalidad === "por_sesion" ? `${estadoFac.cupos.filter((c) => c.factura).length} de ${estadoFac.capacidad} sesiones con factura` : undefined,
      pestana: "speakers",
    });
    const pagos = filasFinancierasDelSpeaker(financieros, "comprobantePago", speakerId);
    const pendientesPago = facturasPendientesDePago(facturas, pagos);
    items.push({
      id: `pago-${nombre}`,
      grupo,
      etiqueta: "Comprobante de pago",
      hecho: situacionComprobantes(facturas, pagos) === "todo_cubierto",
      detalle: facturas.length > 0 && pendientesPago.length > 0 ? `${pendientesPago.length} de ${facturas.length} facturas sin comprobante` : undefined,
      pestana: "speakers",
    });
  }
  return items;
}

// --- Informes de Ejecución: muestra médica por entrega y CSV (octubre 2026) ---

/**
 * Una fila del informe de muestra médica = UNA entrega de producto a un HCP.
 * Si en el mismo evento un médico recibió 1 muestra del producto X y otra del
 * producto Y, salen dos filas para ese médico (cada una con su firma).
 */
export interface FilaMuestraEntrega {
  muestraId: string;
  registro: RegistroParticipacion | null;
  productoId: string;
  cantidad: number;
  firmaId: string | null;
  capturadoEn: string;
}

/**
 * Convierte las muestras entregadas en filas del informe. `idsRegistroPermitidos`
 * (alcance por sesión) deja solo las entregas de los HCP de esa sesión; `null`
 * = todo el evento. Las filas de un mismo HCP quedan juntas (en el orden de su
 * primera entrega) y, dentro de cada HCP, por hora de captura.
 */
export function filasMuestrasPorEntrega(
  muestras: MuestraEntregada[],
  registros: RegistroParticipacion[],
  idsRegistroPermitidos: Set<string> | null = null,
): FilaMuestraEntrega[] {
  const registroPorId = new Map(registros.map((r) => [r.id, r]));
  const ordenadas = muestras
    .filter((m) => !idsRegistroPermitidos || idsRegistroPermitidos.has(m.registroParticipacionId))
    .slice()
    .sort((a, b) => (a.capturadoEn || "").localeCompare(b.capturadoEn || ""));
  const ordenRegistro = new Map<string, number>();
  for (const m of ordenadas) if (!ordenRegistro.has(m.registroParticipacionId)) ordenRegistro.set(m.registroParticipacionId, ordenRegistro.size);
  return ordenadas
    .map((m, i) => ({ m, i }))
    .sort((a, b) => (ordenRegistro.get(a.m.registroParticipacionId)! - ordenRegistro.get(b.m.registroParticipacionId)!) || a.i - b.i)
    .map(({ m }) => ({
      muestraId: m.id,
      registro: registroPorId.get(m.registroParticipacionId) ?? null,
      productoId: m.productoId,
      cantidad: m.cantidad || 0,
      firmaId: m.firmaConfirmacionId,
      capturadoEn: m.capturadoEn,
    }));
}

/** "Sesión 2 (2026-10-05)" para el registro, o "" si el evento es de sesión única. */
export function etiquetaSesionRegistro(evento: Evento, r: Pick<RegistroParticipacion, "sesionEventoId">): string {
  if (!esMultisesion(evento)) return "";
  const i = evento.sesiones.findIndex((s) => s.id === r.sesionEventoId);
  if (i < 0) return "Sin sesión asignada";
  const fecha = evento.sesiones[i].fecha;
  return `Sesión ${i + 1}${fecha ? ` (${fecha})` : ""}`;
}

const nombreRegistro = (r: Pick<RegistroParticipacion, "nombres" | "apellidos"> | null) =>
  r ? `${r.nombres ?? ""} ${r.apellidos ?? ""}`.replace(/\s+/g, " ").trim() : "";

/** CSV de la lista de asistencia (una fila por asistente). La firma es una imagen: en el CSV solo se indica si hay. */
export function construirCsvAsistencia(evento: Evento, registros: RegistroParticipacion[]): { encabezados: string[]; filas: string[][] } {
  const conSesion = esMultisesion(evento);
  const siNo = (v: boolean) => (v ? "Sí" : "No");
  return {
    encabezados: [
      ...(conSesion ? ["Sesión"] : []),
      "Nombres y Apellidos",
      "Número de documento",
      "Celular",
      "Correo electrónico",
      "Autoriza uso de imagen y voz",
      "Autoriza tratamiento de datos",
      "Firma registrada",
    ],
    filas: registros.map((r) => [
      ...(conSesion ? [etiquetaSesionRegistro(evento, r)] : []),
      nombreRegistro(r),
      r.cedula ?? "",
      r.celular ?? "",
      r.email ?? "",
      siNo(r.autorizaImagenVoz),
      siNo(r.autorizaDatosPersonales),
      siNo(Boolean(r.firmaId)),
    ]),
  };
}

/** CSV del informe de muestra médica (una fila por entrega de producto). */
export function construirCsvMuestras(
  evento: Evento,
  filas: FilaMuestraEntrega[],
  nombreProducto: (productoId: string) => string,
): { encabezados: string[]; filas: (string | number)[][] } {
  const conSesion = esMultisesion(evento);
  return {
    encabezados: [
      ...(conSesion ? ["Sesión"] : []),
      "Nombres y Apellidos",
      "Número de documento",
      "Celular",
      "Correo electrónico",
      "Muestra recibida",
      "Cantidad",
      "Firma registrada",
    ],
    filas: filas.map((f) => [
      ...(conSesion ? [f.registro ? etiquetaSesionRegistro(evento, f.registro) : ""] : []),
      nombreRegistro(f.registro),
      f.registro?.cedula ?? "",
      f.registro?.celular ?? "",
      f.registro?.email ?? "",
      nombreProducto(f.productoId),
      f.cantidad,
      f.firmaId ? "Sí" : "No",
    ]),
  };
}
