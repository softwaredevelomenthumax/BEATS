import type { Caf, Convenio, Evento } from "@/types";
import { ubicacionTexto } from "@/lib/ubicacionVisible";
import { esMultisesion } from "@/lib/documentosRequeridosEvento";
import { formatearMonto } from "@/lib/dinero";
import { formatearFecha } from "@/lib/fecha";

/**
 * Rediseño de la ventana "Convenio HCP" (septiembre 2026) — textos legales
 * fijos bilingües pedidos por la especificación para tres bloques del
 * contrato: "Considerando/Whereas" (motivación), el cierre "EN TESTIMONIO DE
 * LO CUAL/IN WITNESS WHEREOF" y el "Anexo A — Servicios/Exhibit A —
 * Services".
 *
 * Decisión de diseño (documentada en `types.ts` sobre `ConvenioHcp` y en el
 * README): estas funciones NO se llaman en cada render para calcular un
 * texto "vivo" — se usan como generador de un VALOR INICIAL que el
 * formulario escribe una sola vez en el campo correspondiente (la primera
 * vez que hay suficiente información para armarlo y el campo todavía está
 * vacío), o bajo pedido explícito del usuario con el botón "Generar texto
 * sugerido". A partir de ahí el campo es texto libre editable como
 * cualquier otro — igual que ya funciona `objetivoConsultoria` desde antes
 * de esta ronda. Esto evita el riesgo de pisar silenciosamente una edición
 * manual cada vez que cambia un campo de origen (compañía, especialidad,
 * etc.).
 */

const SIN_ESPECIALIDAD_ES = "[especialidad del consultor]";
const SIN_ESPECIALIDAD_EN = "[consultant's field of expertise]";
const SIN_AMPLIACION_ES = "[completar: con respecto a qué]";
const SIN_AMPLIACION_EN = "[complete: with respect to what]";

interface OrigenAmpliacion {
  evento: Evento | null;
  convenioPago: Convenio | null;
  caf: Caf | null;
}

function sinPuntoFinal(t: string): string {
  return t.trim().replace(/[\s.;:]+$/, "");
}

function rangoFechas(evento: Evento, locale: "es" | "en"): string {
  const sesiones = esMultisesion(evento) ? evento.sesiones.map((s) => s.fecha).filter((f): f is string => !!f).sort() : [];
  const ini = sesiones[0] ?? evento.fechaInicioEvento;
  const fin = sesiones[sesiones.length - 1] ?? evento.fechaFinEvento;
  if (!ini) return "";
  const y = locale === "es" ? ["el", "del", "al"] : ["on", "from", "to"];
  return fin && fin !== ini ? `${y[1]} ${formatearFecha(ini)} ${y[2]} ${formatearFecha(fin)}` : `${y[0]} ${formatearFecha(ini)}`;
}

function lugarEvento(evento: Evento): string {
  if (esMultisesion(evento)) {
    const ciudades = Array.from(new Set(evento.sesiones.map((s) => [s.ciudad, s.pais].filter(Boolean).join(", ")).filter(Boolean)));
    return ciudades.join("; ");
  }
  return [evento.ciudad, evento.pais].filter(Boolean).join(", ");
}

/**
 * Texto propuesto para "[completar: con respecto a qué]", derivado de la
 * Solicitud de evento, la Solicitud de convenio de pago a HCP y el CAF.
 * Devuelve "" si no hay ninguna fuente con datos (entonces queda el marcador).
 */
export function armarAmpliacionEs({ evento, convenioPago, caf }: OrigenAmpliacion): string {
  const servicio = convenioPago?.tipoServicio?.trim();
  const actividad = (convenioPago?.tipoActividad || evento?.tipoEvento || "").trim();
  const nombre = (convenioPago?.nombreEventoServicio || evento?.nombreEvento || "").trim();
  const partes: string[] = [];
  if (servicio || actividad || nombre) {
    let base = `su participación${servicio ? ` como ${servicio}` : ""}`;
    if (actividad) base += ` en una actividad de tipo ${actividad}`;
    if (nombre) base += `${actividad ? ", " : " en la actividad "}titulada "${nombre}"`;
    partes.push(base);
  }
  if (evento) {
    const cuando = rangoFechas(evento, "es");
    const donde = lugarEvento(evento);
    const modalidad = evento.modalidadEvento ? ` (${String(evento.modalidadEvento).toLowerCase()})` : "";
    if (cuando || donde) partes.push(`que se realizará ${[cuando, donde ? `en ${donde}` : ""].filter(Boolean).join(" ")}${modalidad}`);
    if (evento.areaEspecialidad?.trim()) partes.push(`dirigida al área de ${evento.areaEspecialidad.trim()}`);
    if (evento.objetivosEvento?.trim()) partes.push(`cuyo objetivo es: ${sinPuntoFinal(evento.objetivosEvento)}`);
  }
  const objetoCaf = caf?.objetoContrato?.trim();
  if (objetoCaf) partes.push(`según el objeto del contrato aprobado en el CAF${caf?.codigoDocumento ? ` (${caf.codigoDocumento})` : ""}: ${sinPuntoFinal(objetoCaf)}`);
  return partes.join(", ");
}

export function armarAmpliacionEn({ evento, convenioPago, caf }: OrigenAmpliacion): string {
  const servicio = convenioPago?.tipoServicio?.trim();
  const actividad = (convenioPago?.tipoActividad || evento?.tipoEvento || "").trim();
  const nombre = (convenioPago?.nombreEventoServicio || evento?.nombreEvento || "").trim();
  const partes: string[] = [];
  if (servicio || actividad || nombre) {
    let base = `its participation${servicio ? ` as ${servicio}` : ""}`;
    if (actividad) base += ` in an activity of type ${actividad}`;
    if (nombre) base += `${actividad ? ", " : " in the activity "}entitled "${nombre}"`;
    partes.push(base);
  }
  if (evento) {
    const cuando = rangoFechas(evento, "en");
    const donde = lugarEvento(evento);
    if (cuando || donde) partes.push(`to be held ${[cuando, donde ? `in ${donde}` : ""].filter(Boolean).join(" ")}`);
    if (evento.areaEspecialidad?.trim()) partes.push(`addressed to the field of ${evento.areaEspecialidad.trim()}`);
    if (evento.objetivosEvento?.trim()) partes.push(`the objective of which is: ${sinPuntoFinal(evento.objetivosEvento)}`);
  }
  const objetoCaf = caf?.objetoContrato?.trim();
  if (objetoCaf) partes.push(`in accordance with the contract purpose approved in the CAF${caf?.codigoDocumento ? ` (${caf.codigoDocumento})` : ""}: ${sinPuntoFinal(objetoCaf)}`);
  return partes.join(", ");
}

/** "Considerando" (español) — pedido literal de la especificación, con punto y aparte antes/después de cada "CONSIDERANDO". */
export function armarConsiderandoEs(companiaNombre: string, especialidad: string, ampliacion?: string): string {
  const compania = companiaNombre.trim() || "[Compañía]";
  const esp = especialidad.trim() || SIN_ESPECIALIDAD_ES;
  const amp = (ampliacion ?? "").trim() || SIN_AMPLIACION_ES;
  return [
    `CONSIDERANDO QUE, ${compania} requiere la asesoría y asistencia de un consultor experto en ${esp} con respecto a: ${amp}.`,
    "",
    `CONSIDERANDO QUE, el Consultor declara que cuenta con experiencia en los campos relevantes y desea prestar los servicios a ${compania}; y`,
    "",
    `CONSIDERANDO QUE, ${compania}, basándose en las declaraciones del Consultor, desea contratar al Consultor de conformidad con los términos estipulados en el presente.`,
    "",
    `EN VIRTUD DE LO CUAL, ${compania} y el Consultor acuerdan como sigue:`,
  ].join("\n");
}

/** "Whereas" (inglés) — mismo contenido que `armarConsiderandoEs`, pedido literal de la especificación. */
export function armarWhereasEn(companiaNombre: string, especialidad: string, ampliacion?: string): string {
  const compania = companiaNombre.trim() || "[Company]";
  const esp = especialidad.trim() || SIN_ESPECIALIDAD_EN;
  const amp = (ampliacion ?? "").trim() || SIN_AMPLIACION_EN;
  return [
    `WHEREAS, ${compania} requires the advice and assistance of an expert consultant in ${esp} with respect to ${amp}.`,
    "",
    `WHEREAS, Consultant represents that it has expertise in the relevant fields and wishes to render its services to ${compania}; and`,
    "",
    `WHEREAS, ${compania}, in reliance on Consultant's representations, desires to retain Consultant pursuant to the terms set forth herein.`,
    "",
    `NOW, THEREFORE, ${compania} and Consultant agree as follows:`,
  ].join("\n");
}

/** Cierre antes del primer panel de firmas — texto fijo, pedido literal de la especificación. */
export function armarCierreEs(): string {
  return "EN TESTIMONIO DE LO CUAL, las partes, con la intención de quedar legalmente obligadas, por el presente suscriben este Contrato, vigente a partir de la Fecha Efectiva.";
}

export function armarCierreEn(): string {
  return "IN WITNESS WHEREOF, the parties, intending to be legally bound, hereby execute this Agreement below effective as of the Effective Date.";
}

function fechaCorta(fecha: string | null, locale: string): string {
  if (!fecha) return locale === "en-US" ? "no date" : "sin fecha";
  return formatearFecha(fecha);
}

/**
 * Lista de sesiones para el Anexo A ("Sesión N — fecha — dirección, ciudad,
 * estado, país"), o la única dirección/ciudad/estado/país del evento si es
 * de "Única sesión" — mismo formato que ya usa `lugarReunionDesdeEvento` en
 * `precargado.ts` para Convenio de Pago a HCP, adaptado al idioma pedido
 * aquí (mayúsculas en español, como en el ejemplo literal del usuario).
 *
 * CORRECCIÓN (septiembre 2026): `evento` ahora puede ser `null` — antes
 * era obligatorio, y por eso el botón "Generar texto sugerido" de este
 * Anexo era el ÚNICO de los cuatro (Considerando/Whereas, Cierre, Anexo A,
 * Anexo B) que quedaba inhabilitado hasta elegir un "Evento de origen".
 * Pedido explícito: que el Anexo A siga la MISMA lógica que los otros
 * tres — botón siempre habilitado, con un marcador de texto entre
 * corchetes cuando todavía falta información, editable como cualquier otro
 * campo. Sin evento, se deja un marcador en vez del listado real.
 */
function listadoSesiones(evento: Evento | null, idioma: "es" | "en"): string {
  if (!evento) return idioma === "en" ? "[complete: session date(s) and location(s)]" : "[completar: fecha(s) y lugar(es) de la(s) sesión(es)]";
  const locale = idioma === "en" ? "en-US" : "es-CO";
  const partes = (direccion: string, ciudad: string, estado: string, pais: string) =>
    ubicacionTexto([direccion, ciudad, estado, pais]).toUpperCase();
  if (esMultisesion(evento)) {
    const etiquetaSesion = idioma === "en" ? "Session" : "Sesión";
    return evento.sesiones
      .map((s, i) => `${etiquetaSesion} ${i + 1} — ${fechaCorta(s.fecha, locale)} — ${partes(s.lugar, s.ciudad, s.estadoProvincia, s.pais)}.`)
      .join("\n");
  }
  return `${partes(evento.direccion, evento.ciudad, evento.estadoProvincia, evento.pais)}.`;
}

interface DatosAnexoA {
  companiaNombre: string;
  tipoServicio: string;
  tipoActividad: string;
  tema: string;
  /** `null` cuando todavía no se ha elegido (o no existe) un "Evento de origen" — ver comentario de `listadoSesiones`. */
  evento: Evento | null;
}

/** Número (o cantidad de sesiones) que va entre "en" y el tipo de actividad — "1" para Única sesión, "X" (cantidad) para Varias sesiones, o un marcador si todavía no hay evento elegido. */
function numeroSesionesTexto(evento: Evento | null): string {
  if (!evento) return "[N]";
  return esMultisesion(evento) ? String(evento.sesiones.length || evento.numeroSesiones || 1) : "1";
}

/** "Servicios (Anexo A)" (español) — pedido literal de la especificación, incluyendo el listado de sesiones. */
export function armarAnexoAEs({ companiaNombre, tipoServicio, tipoActividad, tema, evento }: DatosAnexoA): string {
  const compania = companiaNombre.trim() || "[Compañía]";
  const servicio = tipoServicio.trim() || "[tipo de servicio]";
  const actividad = tipoActividad.trim() || "[tipo de actividad]";
  const temaTexto = tema.trim() || "[tema]";
  return [
    "Los términos estipulados en el presente Anexo A son parte integrante de este Contrato.",
    `A menos que ${compania} lo instruya de otra manera, el Consultor deberá prestar los siguientes Servicios:`,
    "",
    `Participar como ${servicio} en ${numeroSesionesTexto(evento)} ${actividad} sobre el tema "${temaTexto}", en la(s) siguiente(s) fecha(s) y lugar(es):`,
    "",
    listadoSesiones(evento, "es"),
    "",
    `El Consultor prestará los Servicios personalmente, con la diligencia y el profesionalismo propios de su especialidad, y de conformidad con la agenda y las indicaciones de ${compania} para la actividad.`,
    "",
    `No se iniciará trabajo alguno en términos del presente Contrato sin la instrucción de un representante autorizado de ${compania}.`,
  ].join("\n");
}

/** "Services (Exhibit A)" (inglés) — mismo contenido que `armarAnexoAEs`, pedido literal de la especificación. */
export function armarAnexoAEn({ companiaNombre, tipoServicio, tipoActividad, tema, evento }: DatosAnexoA): string {
  const compania = companiaNombre.trim() || "[Company]";
  const servicio = tipoServicio.trim() || "[type of service]";
  const actividad = tipoActividad.trim() || "[type of activity]";
  const temaTexto = tema.trim() || "[topic]";
  return [
    "The terms set forth in this Exhibit A are an integral part of this Agreement.",
    `Unless otherwise instructed by ${compania}, Consultant shall perform the following Services:`,
    "",
    `Participate as ${servicio} in ${numeroSesionesTexto(evento)} ${actividad} on the topic "${temaTexto}", on the following date(s) and at the following location(s):`,
    "",
    listadoSesiones(evento, "en"),
    "",
    `Consultant shall perform the Services personally, with the diligence and professionalism appropriate to Consultant's field of expertise, and in accordance with ${compania}'s agenda and instructions for the activity.`,
    "",
    `No work shall be undertaken under this Agreement without the instruction of an authorized ${compania} representative.`,
  ].join("\n");
}

interface DatosAnexoB {
  compensacion: number | null;
  moneda: string;
  plazoPagoDias: number | null;
}

/**
 * "Anexo B — Términos de pago" (español) — corrección de esta ronda: la
 * sección nunca tuvo un botón "Generar texto sugerido" (el reporte del
 * usuario de que "no cargan los textos sugeridos" para este anexo se debe a
 * que simplemente no existía); se agrega aquí una frase fija de resumen de
 * la compensación y el plazo de pago acordados (mismos campos de esta misma
 * sección: `compensacion`, `moneda`, `plazoPagoDias`), en el mismo patrón de
 * "sugerir una vez, queda libre para editar" que ya usan los demás bloques.
 */
export function armarAnexoBEs({ compensacion, moneda, plazoPagoDias }: DatosAnexoB): string {
  const montoTexto = compensacion ? `la suma de ${formatearMonto(compensacion, moneda)}` : "la compensación acordada";
  const plazoTexto = plazoPagoDias != null ? `${plazoPagoDias} día(s) calendario` : "[plazo de pago en días]";
  return `Como contraprestación por los Servicios prestados en virtud de este Contrato, la Compañía pagará al Consultor ${montoTexto}, dentro de un plazo de ${plazoTexto} contados a partir de la recepción de la factura correspondiente.`;
}

export function armarAnexoBEn({ compensacion, moneda, plazoPagoDias }: DatosAnexoB): string {
  const montoTexto = compensacion ? `the amount of ${formatearMonto(compensacion, moneda)}` : "the agreed compensation";
  const plazoTexto = plazoPagoDias != null ? `${plazoPagoDias} calendar day(s)` : "[payment term in days]";
  return `In consideration for the Services rendered under this Agreement, the Company shall pay Consultant ${montoTexto}, within a term of ${plazoTexto} counted from receipt of the corresponding invoice.`;
}
