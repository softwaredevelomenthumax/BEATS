import { traerEventos } from "@/lib/evento";
import { traerRepositorioArchivosEvento, traerRegistrosFinancierosEvento } from "@/lib/repositorioEvento";
import { traerSpeakerPorId } from "@/lib/speakers";
import { traerMetadatosArchivos } from "@/lib/archivosAdjuntos";
import { formatearMonto } from "@/lib/dinero";
import { ETIQUETA_CATEGORIA_FINANCIERA_REPOSITORIO, ETIQUETA_CATEGORIA_REPOSITORIO_ARCHIVO } from "@/lib/enums";
import { traerConvenios } from "@/lib/convenio";
import { traerFmvs } from "@/lib/fmv";
import { traerCafs } from "@/lib/caf";
import { traerConveniosHCP } from "@/lib/convenioHCP";
import { traerNotificacionesPago } from "@/lib/notificacionPago";
import { speakersExternosDe } from "@/lib/speakersEvento";
import { ETIQUETA_TIPO_DOC } from "@/lib/enums";
import type { DocumentoAny } from "@/lib/documentoGenerico";
import type { ConvenioHcp, Evento } from "@/types";

/**
 * Entrega 28 — «Enviar documentos al solicitante»: arma el PAQUETE de documentos de BEATS que rodean a un Convenio HCP
 * (la solicitud de evento, el FMV Checklist, el Convenio de Pago a HCP, el CAF, el propio Convenio HCP y las Notificaciones
 * de Pago del mismo evento y speaker) para que Dirección Médica marque cuáles se envían en PDF.
 *
 * Un documento pertenece al speaker del convenio si lo trae asignado; si no trae speaker (documentos anteriores a que
 * existiera ese campo) se asume suyo solo cuando el evento tiene un único speaker externo — mismo criterio que ya usa
 * `documentosPorSpeaker` en `lib/documentosRequeridosEvento.ts`.
 */

export interface ItemPaqueteDocumentos {
  clave: string;
  etiqueta: string;
  detalle: string;
  doc: DocumentoAny;
  /** Aprobado/Completado vienen marcados; lo que sigue en trámite se muestra pero sin marcar. */
  marcadoInicial: boolean;
}

const ESTADOS_EXCLUIDOS = new Set(["Anulado", "Rechazado", "Borrador", "Devuelto"]);
const ESTADOS_FIRMADOS = new Set(["Aprobado", "Completado"]);

function item(doc: DocumentoAny, etiqueta: string): ItemPaqueteDocumentos {
  return {
    clave: `${doc.tipoDoc}-${doc.id}`,
    etiqueta,
    detalle: `${ETIQUETA_TIPO_DOC[doc.tipoDoc]} · ${doc.estado}`,
    doc,
    marcadoInicial: ESTADOS_FIRMADOS.has(doc.estado),
  };
}

export async function construirPaqueteDocumentos(convenioHcp: ConvenioHcp): Promise<ItemPaqueteDocumentos[]> {
  const [eventos, convenios, fmvs, cafs, conveniosHcp, notificaciones] = await Promise.all([
    traerEventos(),
    traerConvenios(),
    traerFmvs(),
    traerCafs(),
    traerConveniosHCP(),
    traerNotificacionesPago(),
  ]);
  const evento = eventos.find((e) => e.id === convenioHcp.eventoOrigenId);
  const unSoloSpeaker = evento ? speakersExternosDe(evento).length <= 1 : true;
  const speakerId = convenioHcp.speakerId;
  const delSpeaker = (d: { speakerId: string | null; eventoOrigenId: string | null }) =>
    d.eventoOrigenId === convenioHcp.eventoOrigenId && (speakerId ? d.speakerId === speakerId || (!d.speakerId && unSoloSpeaker) : true);

  const paquete: ItemPaqueteDocumentos[] = [];
  if (evento && !ESTADOS_EXCLUIDOS.has(evento.estado)) paquete.push(item(evento, `Solicitud de evento — ${evento.nombreEvento || "(sin nombre)"}`));
  for (const f of fmvs.filter((x) => delSpeaker(x) && !ESTADOS_EXCLUIDOS.has(x.estado))) paquete.push(item(f, `FMV Checklist — ${f.nombreCompleto || "(sin nombre)"}`));
  for (const c of convenios.filter((x) => delSpeaker(x) && !ESTADOS_EXCLUIDOS.has(x.estado))) paquete.push(item(c, `Convenio de pago a HCP — ${c.hcpNombreCompleto || "(sin nombre)"}`));
  const cafsDelPaquete = cafs.filter(
    (x) => !ESTADOS_EXCLUIDOS.has(x.estado) && (x.id === convenioHcp.cafId || (x.eventoOrigenId === convenioHcp.eventoOrigenId && (!x.speakerId ? unSoloSpeaker : x.speakerId === speakerId))),
  );
  for (const c of cafsDelPaquete) paquete.push(item(c, `CAF — ${c.contraparteNombre || "(sin contraparte)"}`));
  for (const c of conveniosHcp.filter((x) => x.eventoOrigenId === convenioHcp.eventoOrigenId && (x.id === convenioHcp.id || (speakerId ? x.speakerId === speakerId : false)) && !x.elaboradoEnContratosCorporativo && !ESTADOS_EXCLUIDOS.has(x.estado))) {
    // Se usa el convenio recién cargado de la BD para que el PDF refleje las firmas más recientes.
    paquete.push(item(c, `Convenio HCP — ${c.consultorNombre || "(sin consultor)"}`));
  }
  for (const n of notificaciones.filter((x) => delSpeaker(x) && !ESTADOS_EXCLUIDOS.has(x.estado))) paquete.push(item(n, `Notificación de pago — ${n.nombreProfesionalSalud || "(sin nombre)"}${n.numeroFactura ? ` (factura ${n.numeroFactura})` : ""}`));

  // Sin duplicados (un mismo documento no puede aparecer dos veces).
  const vistos = new Set<string>();
  return paquete.filter((p) => (vistos.has(p.clave) ? false : (vistos.add(p.clave), true)));
}

// ---------------------------------------------------------------------------------------------------------------------
// Entrega 33 — «Enviar documentos»: el paquete COMPLETO del evento.
//
// Antes el paquete solo ofrecía los documentos de BEATS del speaker del convenio. Ahora muestra, agrupado por «Evento» y por
// cada speaker, TODO lo asociado al evento para que Dirección Médica marque lo que se envía:
//   · documentos generados en BEATS (solicitud, FMV, convenio de pago, CAF, convenio HCP, notificaciones de pago) → PDF;
//   · archivos ya cargados: orden de compra, facturas y comprobantes de pago, copia firmada del convenio, CAF, presentación
//     aprobada y su evidencia, carta de invitación, programa, agenda/tarifario, lista de asistencia, fotos, certificados y
//     los soportes del speaker (RETHUS, hoja de vida, identidad).
// Lo que contiene datos personales de terceros (lista de asistencia, fotos, soportes del speaker) aparece SIN marcar.
// ---------------------------------------------------------------------------------------------------------------------

export interface ItemPaqueteConGrupo extends ItemPaqueteDocumentos {
  grupo: string;
}

export interface ArchivoPaquete {
  id: string;
  /** Qué es (p. ej. «Factura 123»). */
  nombre: string;
  grupo: string;
  /** Línea pequeña: nombre del archivo, fecha, valor… */
  detalle: string;
  tamanoBytes: number;
  marcadoInicial: boolean;
}

export interface PaqueteCompletoEvento {
  documentosPdf: ItemPaqueteConGrupo[];
  archivos: ArchivoPaquete[];
}

export const GRUPO_EVENTO = "Evento";

/** Categorías del Repositorio que NO se marcan por defecto (datos personales de terceros o material voluminoso). */
const CATEGORIAS_SIN_MARCAR = new Set(["listaAsistencia", "fotos", "certificadoParticipacion", "otros"]);

function nombreSesion(evento: Evento, sesionId: string | null): string {
  if (!sesionId) return "";
  const i = evento.sesiones.findIndex((s) => s.id === sesionId);
  return i >= 0 ? `Sesión ${i + 1}` : "";
}

/** Desde un Convenio HCP: el paquete de su evento (el convenio abierto reemplaza a su copia de la lista, con sus firmas). */
export function construirPaqueteCompletoEvento(convenioHcp: ConvenioHcp): Promise<PaqueteCompletoEvento> {
  return construirPaqueteCompletoEventoPorId(convenioHcp.eventoOrigenId, convenioHcp);
}

/**
 * Entrega 35: el mismo paquete completo, pero partiendo solo del evento — lo usa «Enviar documentos» de «Auditoría de
 * Eventos», donde no hay un Convenio HCP abierto. `convenioHcpActual` es opcional: si se entrega, sustituye a su copia.
 */
export async function construirPaqueteCompletoEventoPorId(eventoId: string | null, convenioHcpActual: ConvenioHcp | null = null): Promise<PaqueteCompletoEvento> {
  const [eventos, convenios, fmvs, cafs, conveniosHcp, notificaciones, repo, financieros] = await Promise.all([
    traerEventos(),
    traerConvenios(),
    traerFmvs(),
    traerCafs(),
    traerConveniosHCP(),
    traerNotificacionesPago(),
    eventoId ? traerRepositorioArchivosEvento(eventoId) : Promise.resolve([]),
    eventoId ? traerRegistrosFinancierosEvento(eventoId) : Promise.resolve([]),
  ]);
  const evento = eventos.find((e) => e.id === eventoId) ?? null;
  const externos = evento ? speakersExternosDe(evento) : [];
  const unSoloSpeaker = externos.length <= 1;

  // Nombre del grupo de cada speaker del evento, en el orden de la solicitud.
  const grupoPorSpeaker = new Map<string, string>();
  for (const sp of externos) if (sp.speakerId) grupoPorSpeaker.set(sp.speakerId, `Speaker · ${sp.nombreSpeaker || "sin nombre"}`);
  const grupoDe = (speakerId: string | null | undefined): string => {
    if (speakerId && grupoPorSpeaker.has(speakerId)) return grupoPorSpeaker.get(speakerId)!;
    if (!speakerId && unSoloSpeaker && externos[0]?.speakerId) return grupoPorSpeaker.get(externos[0].speakerId)!;
    return GRUPO_EVENTO;
  };
  const speakerDe = (d: unknown) => ((d as { speakerId?: string | null }).speakerId ?? null);
  const delEvento = <T extends { eventoOrigenId: string | null; estado: string }>(l: T[]) =>
    l.filter((d) => d.eventoOrigenId === eventoId && !ESTADOS_EXCLUIDOS.has(d.estado));

  // ---- Documentos generados en BEATS (PDF) ----
  const pdfs: ItemPaqueteConGrupo[] = [];
  const agregarPdf = (doc: DocumentoAny, etiqueta: string, grupo: string) => pdfs.push({ ...item(doc, etiqueta), grupo });
  if (evento && !ESTADOS_EXCLUIDOS.has(evento.estado)) agregarPdf(evento, `Solicitud de evento — ${evento.nombreEvento || "(sin nombre)"}`, GRUPO_EVENTO);
  for (const f of delEvento(fmvs)) agregarPdf(f, `FMV Checklist — ${f.nombreCompleto || "(sin nombre)"}`, grupoDe(speakerDe(f)));
  for (const c of delEvento(convenios)) agregarPdf(c, `Convenio de pago a HCP — ${c.hcpNombreCompleto || "(sin nombre)"}`, grupoDe(speakerDe(c)));
  for (const c of delEvento(cafs)) agregarPdf(c, `CAF — ${c.contraparteNombre || "(sin contraparte)"}`, grupoDe(speakerDe(c)));
  // El convenio abierto llega con sus firmas más recientes: reemplaza a su copia de la lista.
  for (const c of delEvento(conveniosHcp).filter((x) => !x.elaboradoEnContratosCorporativo)) {
    agregarPdf(convenioHcpActual && c.id === convenioHcpActual.id ? convenioHcpActual : c, `Convenio HCP — ${c.consultorNombre || "(sin consultor)"}`, grupoDe(speakerDe(c)));
  }
  for (const n of delEvento(notificaciones)) {
    agregarPdf(n, `Notificación de pago — ${n.nombreProfesionalSalud || "(sin nombre)"}${n.numeroFactura ? ` (factura ${n.numeroFactura})` : ""}`, grupoDe(speakerDe(n)));
  }
  const vistosPdf = new Set<string>();
  const documentosPdf = pdfs.filter((p) => (vistosPdf.has(p.clave) ? false : (vistosPdf.add(p.clave), true)));

  // ---- Archivos ya cargados ----
  interface Candidato {
    archivoId: string;
    nombre: string;
    grupo: string;
    extra: string;
    marcado: boolean;
  }
  const candidatos: Candidato[] = [];
  const agregar = (archivoId: string | null | undefined, nombre: string, grupo: string, extra: string, marcado: boolean) => {
    if (archivoId) candidatos.push({ archivoId, nombre, grupo, extra, marcado });
  };

  for (const f of financieros) {
    const sesion = nombreSesion(evento ?? ({ sesiones: [] } as unknown as Evento), f.sesionId);
    const extra = [f.fecha ? String(f.fecha).slice(0, 10) : "", f.valor != null ? formatearMonto(f.valor, f.moneda) : "", sesion].filter(Boolean).join(" · ");
    agregar(f.archivoId, `${ETIQUETA_CATEGORIA_FINANCIERA_REPOSITORIO[f.categoria]}${f.numero ? ` ${f.numero}` : ""}`, grupoDe(f.speakerId), extra, true);
  }
  for (const r of repo) {
    if (r.noAplica || !r.archivoId) continue;
    const base = ETIQUETA_CATEGORIA_REPOSITORIO_ARCHIVO[r.categoria] ?? r.categoria;
    const sesion = evento ? nombreSesion(evento, r.sesionId) : "";
    agregar(r.archivoId, `${base}${r.etiqueta ? ` — ${r.etiqueta.replace(/_/g, " ")}` : ""}${sesion ? ` (${sesion})` : ""}`, grupoDe(r.speakerId), "", !CATEGORIAS_SIN_MARCAR.has(r.categoria));
  }
  for (const c of conveniosHcp.filter((x) => x.eventoOrigenId === eventoId && !ESTADOS_EXCLUIDOS.has(x.estado))) {
    agregar(c.archivoFirmadoHCPId, `Convenio HCP — copia firmada${c.consultorNombre ? ` (${c.consultorNombre})` : ""}`, grupoDe(speakerDe(c)), "", true);
  }
  if (evento) {
    agregar(evento.cartaInvitacionId, "Carta de invitación", GRUPO_EVENTO, "", true);
    agregar(evento.programaAcademicoId, "Programa académico", GRUPO_EVENTO, "", true);
  }
  for (const c of delEvento(convenios)) agregar(c.archivoAgendaId, `Agenda de la reunión (${c.hcpNombreCompleto || "convenio de pago"})`, grupoDe(speakerDe(c)), "", true);
  for (const f of delEvento(fmvs)) agregar(f.archivoTarifarioAsociacionId, `Tarifario de la asociación científica (${f.nombreCompleto || "FMV"})`, grupoDe(speakerDe(f)), "", true);
  // Soportes personales del speaker: disponibles pero sin marcar.
  const speakersCargados = await Promise.all(Array.from(grupoPorSpeaker.keys()).map((id) => traerSpeakerPorId(id).catch(() => null)));
  for (const sp of speakersCargados) {
    if (!sp) continue;
    const grupo = grupoDe(sp.id);
    agregar(sp.archivoRethusId, "Licencia RETHUS", grupo, "Soporte personal del speaker", false);
    agregar(sp.archivoHojaVidaId, "Hoja de vida", grupo, "Soporte personal del speaker", false);
    agregar(sp.archivoIdentidadId, "Documento de identidad", grupo, "Soporte personal del speaker", false);
  }

  const metadatos = await traerMetadatosArchivos(candidatos.map((c) => c.archivoId));
  const vistos = new Set<string>();
  const archivos: ArchivoPaquete[] = [];
  for (const c of candidatos) {
    const meta = metadatos.get(c.archivoId);
    if (!meta || vistos.has(c.archivoId)) continue; // sin archivo real o repetido (p. ej. la misma factura en dos listas)
    vistos.add(c.archivoId);
    archivos.push({ id: c.archivoId, nombre: c.nombre, grupo: c.grupo, detalle: [meta.nombre, c.extra].filter(Boolean).join(" · "), tamanoBytes: meta.tamanoBytes, marcadoInicial: c.marcado });
  }

  // Orden estable: «Evento» primero y luego cada speaker, en el orden de la solicitud.
  const ordenGrupos = [GRUPO_EVENTO, ...grupoPorSpeaker.values()];
  const rango = (g: string) => {
    const i = ordenGrupos.indexOf(g);
    return i < 0 ? ordenGrupos.length : i;
  };
  documentosPdf.sort((a, b) => rango(a.grupo) - rango(b.grupo));
  archivos.sort((a, b) => rango(a.grupo) - rango(b.grupo));
  return { documentosPdf, archivos };
}
