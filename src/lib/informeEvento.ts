import { calcularResumenEjecucion } from "@/lib/ejecucion";
import { mascaraVirtual, ubicacionTexto } from "@/lib/ubicacionVisible";
import { esMultisesion } from "@/lib/documentosRequeridosEvento";
import { conciliar, sesionesDelSpeaker, sumarDistribuciones, type AlcanceAsistencia, type DistribucionAsistentes, type LineaConciliacion } from "@/lib/expediente";
import {
  costoAlimentosSesion,
  costoAlimentosSpeaker,
  costoHospedajeSesion,
  costoHospedajeSpeaker,
  costoTrasladoTaxiSesion,
  costoTrasladoTaxiSpeaker,
  costoTransporteSesion,
  costoTransporteSpeaker,
  presupuestoSesionVacio,
  totalCondensado,
} from "@/lib/presupuestoEvento";
import { ETIQUETA_CATEGORIA_FINANCIERA_REPOSITORIO } from "@/lib/enums";
import { formatearFecha } from "@/lib/fecha";
import type { DatosExpedienteCargados } from "@/components/expediente/useExpediente";
import type { Evento, PresupuestoSesion, RegistroFinancieroEvento } from "@/types";

/**
 * Entrega 21 (octubre 2026): modelo de datos del "Resumen del evento" y del
 * "Expediente completo en HTML" de la pantalla Informe por Evento. Es lógica
 * pura (sin React): la vista imprimible y el HTML descargable leen del mismo
 * objeto, así que las cifras nunca difieren entre un archivo y el otro.
 */

export interface SedeResumen {
  etiqueta: string;
  fecha: string;
  lugar: string;
  ciudad: string;
  departamento: string;
  pais: string;
  asistentesEsperados: number | null;
}

export interface SpeakerResumenEvento {
  speakerId: string | null;
  /** Entrega 22: un evento puede tener speakers internos y externos a la vez. */
  tipo: "interno" | "externo";
  nombre: string;
  /** "Todas las sesiones" o "Sesión 1, Sesión 3". */
  sesiones: string;
}

export interface AsistentesPorAlcance {
  etiqueta: string;
  distribucion: DistribucionAsistentes;
}

export interface MuestraProductoResumen {
  nombre: string;
  unidades: number;
  entregas: number;
}

export interface ResumenEvento {
  identificacion: { etiqueta: string; valor: string }[];
  fechas: { inicio: string; fin: string };
  multisesion: boolean;
  sedes: SedeResumen[];
  speakers: SpeakerResumenEvento[];
  asistentes: { total: DistribucionAsistentes; porAlcance: AsistentesPorAlcance[]; esperados: number | null };
  participacionPorTipo: { tipo: string; cantidad: number }[];
  /** Entrega 22: costos asociados al evento (presupuesto solicitado, detalle por speaker/sesión y ejecución real). */
  financiero: FinancieroEvento;
  muestras: {
    entrega: boolean;
    previstas: string;
    totalUnidades: number;
    personas: number;
    entregas: number;
    porProducto: MuestraProductoResumen[];
  };
}

const vacio = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : "—");

/** Quita duplicados conservando el orden — "Medellín, Medellín" → "Medellín". */
export const unicos = (lista: string[]) => Array.from(new Set(lista.filter((x) => x && x !== "—")));

export function construirResumenEvento(evento: Evento, datos: DatosExpedienteCargados, alcances: AlcanceAsistencia[]): ResumenEvento {
  const multisesion = esMultisesion(evento);

  const sedes: SedeResumen[] = multisesion
    ? evento.sesiones.map((s, i) => ({
        etiqueta: `Sesión ${i + 1}`,
        fecha: s.fecha ? formatearFecha(s.fecha) : "—",
        lugar: vacio(mascaraVirtual(s.lugar || evento.direccion)),
        ciudad: vacio(mascaraVirtual(s.ciudad || evento.ciudad)),
        departamento: vacio(mascaraVirtual(s.estadoProvincia || evento.estadoProvincia)),
        pais: vacio(mascaraVirtual(s.pais || evento.pais)),
        asistentesEsperados: s.numeroAsistentesEsperados,
      }))
    : [
        {
          etiqueta: "Sesión única",
          fecha: evento.fechaInicioEvento ? formatearFecha(evento.fechaInicioEvento) : "—",
          lugar: vacio(mascaraVirtual(evento.direccion)),
          ciudad: vacio(mascaraVirtual(evento.ciudad)),
          departamento: vacio(mascaraVirtual(evento.estadoProvincia)),
          pais: vacio(mascaraVirtual(evento.pais)),
          asistentesEsperados: evento.numeroAsistentes,
        },
      ];

  const speakers: SpeakerResumenEvento[] = evento.speakersParticipacion.map((sp) => {
    const ses = sesionesDelSpeaker(evento, sp);
    const todas = !multisesion || ses.length === evento.sesiones.length;
    return {
      speakerId: sp.speakerId,
      tipo: sp.tipo,
      nombre: sp.nombreSpeaker || "Speaker sin nombre",
      sesiones: !multisesion ? "Sesión única" : todas ? "Todas las sesiones" : ses.map((s) => `Sesión ${evento.sesiones.findIndex((x) => x.id === s.id) + 1}`).join(", "),
    };
  });

  const total = sumarDistribuciones(alcances);
  const resumenEjecucion = calcularResumenEjecucion(datos.registros, datos.muestras);
  const nombreProducto = (id: string) => datos.nombresProductos[id] || "Producto";
  const entregasPorProducto = new Map<string, number>();
  for (const m of datos.muestras) entregasPorProducto.set(m.productoId, (entregasPorProducto.get(m.productoId) ?? 0) + 1);

  const identificacion: { etiqueta: string; valor: string }[] = [
    { etiqueta: "Evento", valor: vacio(evento.nombreEvento) },
    { etiqueta: "Estado", valor: vacio(evento.estado) },
    { etiqueta: "Empresa del grupo", valor: vacio(evento.empresaGrupo) },
    { etiqueta: "Tipo de evento", valor: vacio(evento.tipoEvento) },
    { etiqueta: "Área / especialidad", valor: vacio(evento.areaEspecialidad) },
    { etiqueta: "Línea terapéutica", valor: vacio(evento.lineaTerapeutica) },
    { etiqueta: "Organizado por", valor: vacio([evento.organizadoPor, evento.nombreOrganizador].filter(Boolean).join(" — ")) },
    { etiqueta: "Modalidad", valor: vacio([evento.modalidadEvento, evento.modalidadSesiones].filter(Boolean).join(" · ")) },
    { etiqueta: "Solicitante", valor: vacio(evento.nombreSolicitante) },
  ];

  return {
    identificacion,
    fechas: {
      inicio: evento.fechaInicioEvento ? formatearFecha(evento.fechaInicioEvento) : "—",
      fin: evento.fechaFinEvento ? formatearFecha(evento.fechaFinEvento) : "—",
    },
    multisesion,
    sedes,
    speakers,
    asistentes: {
      total,
      porAlcance: alcances.map((a) => ({ etiqueta: a.etiqueta, distribucion: a.distribucion })),
      esperados: evento.numeroAsistentes,
    },
    participacionPorTipo: resumenEjecucion.porTipoParticipacion,
    financiero: construirFinancieroEvento(evento, datos.financieros),
    muestras: {
      entrega: evento.entregaMuestrasMedicas,
      previstas: evento.detalleMuestrasMedicas || evento.muestrasPlaneadas.map((m) => m.nombreProducto).filter(Boolean).join(", "),
      totalUnidades: resumenEjecucion.totalMuestras,
      personas: new Set(datos.muestras.map((m) => m.registroParticipacionId)).size,
      entregas: datos.muestras.length,
      porProducto: resumenEjecucion.porProductoId
        .map((p) => ({ nombre: nombreProducto(p.productoId), unidades: p.cantidad, entregas: entregasPorProducto.get(p.productoId) ?? 0 }))
        .sort((a, b) => b.unidades - a.unidades),
    },
  };
}

/** Resumen de lugares en una línea para encabezados: ciudades únicas ("Bogotá, Medellín"). */
export function ciudadesTexto(r: ResumenEvento): string {
  return unicos(r.sedes.map((s) => s.ciudad)).join(", ") || "—";
}

/**
 * Entrega 22: "cuando muestres algún campo Ciudad, muestra también el País".
 * Pares únicos ciudad+país: "Bogotá, Colombia · Quito, Ecuador".
 */
export function ciudadesPaisTexto(r: ResumenEvento): string {
  const pares = unicos(
    r.sedes.map((s) => {
      const c = s.ciudad === "—" ? "" : s.ciudad;
      const p = s.pais === "—" ? "" : s.pais;
      return [c, p].filter(Boolean).join(", ");
    }),
  );
  return pares.join(" · ") || "—";
}

/** Países únicos del evento ("Colombia, Ecuador"). */
export function paisesTexto(r: ResumenEvento): string {
  return unicos(r.sedes.map((s) => s.pais)).join(", ") || "—";
}

/**
 * Entrega 22: texto con el que se identifica un evento en la lista desplegable
 * de "Informe por Evento": pueden existir varios eventos con el mismo nombre,
 * así que se agregan fecha de inicio, fecha de fin, ciudad y país.
 *   "Congreso X — 12/10/2026 a 14/10/2026 — Bogotá, Colombia"
 */
export function etiquetaEventoInforme(evento: Evento): string {
  const sedes = esMultisesion(evento)
    ? evento.sesiones.map((s) => ({ ciudad: s.ciudad || evento.ciudad, pais: s.pais || evento.pais }))
    : [{ ciudad: evento.ciudad, pais: evento.pais }];
  const lugares = unicos(sedes.map((x) => ubicacionTexto([x.ciudad, x.pais]))).join(" · ");
  const inicio = evento.fechaInicioEvento ? formatearFecha(evento.fechaInicioEvento) : "";
  const fin = evento.fechaFinEvento ? formatearFecha(evento.fechaFinEvento) : "";
  const fechas = inicio && fin && inicio !== fin ? `${inicio} a ${fin}` : inicio || fin;
  return [evento.nombreEvento, fechas, lugares].filter(Boolean).join(" — ");
}

// --- Financiero (entrega 22) --------------------------------------------------------------

export interface LineaCostoEvento {
  concepto: string;
  /** "Sesión 2", "Hotel X · 3 noche(s)", etc. */
  detalle: string;
  valor: number;
}

export interface BloqueCostoEvento {
  titulo: string;
  subtitulo: string;
  lineas: LineaCostoEvento[];
  subtotal: number;
}

export interface FilaRegistroFinanciero {
  categoria: string;
  numero: string;
  fecha: string;
  valor: number | null;
  moneda: string;
  speaker: string;
  sesion: string;
}

export interface FinancieroEvento {
  moneda: string;
  centroCostos: string;
  presupuestoAprobado: { incluido: boolean; monto: number | null };
  /** Condensado de la solicitud, una línea por concepto. */
  condensado: { concepto: string; valor: number }[];
  totalSolicitado: number;
  /** Detalle de dónde sale cada costo: uno por speaker (honorarios, cuota, transporte, hospedaje, alimentos) o por sesión/documento si no hay speakers. */
  bloques: BloqueCostoEvento[];
  /** Ejecución real: orden de compra, facturas y comprobantes de pago (Expediente). */
  ejecucion: { total: LineaConciliacion[]; registros: FilaRegistroFinanciero[] };
}

const num = (v: number | null | undefined) => v ?? 0;

/** Líneas de costo de un presupuesto de sesión (transporte, taxi, hospedaje, alimentos) — solo las que tienen valor. */
function lineasPresupuestoSesion(p: PresupuestoSesion, detalleSesion: string): LineaCostoEvento[] {
  const lineas: LineaCostoEvento[] = [];
  const agregar = (concepto: string, detalle: string, valor: number) => {
    if (valor !== 0) lineas.push({ concepto, detalle: [detalleSesion, detalle].filter(Boolean).join(" · "), valor });
  };
  agregar("Transporte", p.tipoTransporte, costoTransporteSesion(p));
  agregar("Traslados en taxi", "", costoTrasladoTaxiSesion(p));
  agregar("Hospedaje", [p.nombreHotel, num(p.numeroNoches) ? `${p.numeroNoches} noche(s)` : ""].filter(Boolean).join(" · "), costoHospedajeSesion(p));
  agregar("Alimentos", "", costoAlimentosSesion(p));
  return lineas;
}

const suma = (lineas: LineaCostoEvento[]) => lineas.reduce((a, l) => a + l.valor, 0);

/**
 * Entrega 22: modelo de la sección financiera del Informe por Evento — todos
 * los costos asociados al evento, de dos fuentes: lo SOLICITADO (presupuesto de
 * la Solicitud de evento, con su detalle) y lo EJECUTADO (orden de compra,
 * facturas y comprobantes de pago que se cargan en el Expediente). Lógica pura:
 * la vista imprimible y el HTML descargable leen del mismo objeto.
 */
export function construirFinancieroEvento(evento: Evento, financieros: RegistroFinancieroEvento[]): FinancieroEvento {
  const moneda = evento.moneda || "";
  const multisesion = esMultisesion(evento);
  const nombreSesion = (id: string | null) => {
    const i = evento.sesiones.findIndex((s) => s.id === id);
    return i >= 0 ? `Sesión ${i + 1}` : "";
  };
  const bloques: BloqueCostoEvento[] = [];

  if (evento.participacionAcademica && evento.speakersParticipacion.length > 0) {
    for (const sp of evento.speakersParticipacion) {
      const externo = sp.tipo === "externo";
      const lineas: LineaCostoEvento[] = [];
      if (externo) {
        if (num(sp.montoHonorarios) !== 0) lineas.push({ concepto: "Honorarios", detalle: sp.detalleHonorarios ?? "", valor: num(sp.montoHonorarios) });
        if (num(sp.montoInscripcion) !== 0) lineas.push({ concepto: "Cuota de inscripción", detalle: sp.detalleInscripcion, valor: num(sp.montoInscripcion) });
      }
      for (const p of sp.presupuestos) {
        const sesion = multisesion ? nombreSesion(p.sesionId) : "";
        const agregar = (concepto: string, detalle: string, valor: number) => {
          if (valor !== 0) lineas.push({ concepto, detalle: [sesion, detalle].filter(Boolean).join(" · "), valor });
        };
        agregar("Transporte", p.tipoTransporte, costoTransporteSpeaker(p));
        agregar("Traslados en taxi", "", costoTrasladoTaxiSpeaker(p));
        agregar("Hospedaje", p.nombreHotel, costoHospedajeSpeaker(p));
        agregar("Alimentos", "", costoAlimentosSpeaker(p));
      }
      bloques.push({
        titulo: sp.nombreSpeaker || "Speaker sin nombre",
        subtitulo: externo ? "Speaker externo" : "Speaker interno",
        lineas,
        subtotal: suma(lineas),
      });
    }
  } else if (multisesion) {
    evento.sesiones.forEach((s, i) => {
      const lineas = lineasPresupuestoSesion(s.presupuesto ?? presupuestoSesionVacio(), "");
      if (lineas.length > 0) bloques.push({ titulo: `Sesión ${i + 1}`, subtitulo: "Transporte, hospedaje y alimentos", lineas, subtotal: suma(lineas) });
    });
  } else {
    const p: PresupuestoSesion = {
      ...presupuestoSesionVacio(),
      transporteNoAplica: evento.transporteNoAplica,
      tipoTransporte: evento.tipoTransporte,
      montoTransporte: evento.montoTransporte,
      taxi: evento.taxi,
      valorEstimadoTaxi: evento.valorEstimadoTaxi,
      hospedajeNoAplica: evento.hospedajeNoAplica,
      numeroNoches: evento.numeroNoches,
      costoNochePersona: evento.costoNochePersona,
      nombreHotel: evento.nombreHotel,
      alimentosNoAplica: evento.alimentosNoAplica,
      montoAlimentosDia: evento.montoAlimentosDia,
    };
    const lineas = lineasPresupuestoSesion(p, "");
    if (lineas.length > 0) bloques.push({ titulo: "Evento", subtitulo: "Transporte, hospedaje y alimentos", lineas, subtotal: suma(lineas) });
  }

  const valorParticipacion = evento.inscripcionNoAplica ? 0 : num(evento.condensadoValorParticipacion ?? evento.montoInscripcion);
  const condensado = [
    { concepto: "Valor participación", valor: evento.incluirValorParticipacion ? valorParticipacion : 0 },
    { concepto: "Cuota de inscripción", valor: num(evento.condensadoInscripcion) },
    { concepto: "Honorarios de speakers", valor: num(evento.condensadoHonorariosSpeaker) },
    { concepto: "Transporte", valor: num(evento.condensadoTransporte) },
    { concepto: "Traslados en taxi", valor: num(evento.condensadoTraslado) },
    { concepto: "Hospedaje", valor: num(evento.condensadoHospedaje) },
    { concepto: "Alimentos", valor: num(evento.condensadoAlimentos) },
    { concepto: evento.condensadoOtroEspecificar ? `Otro — ${evento.condensadoOtroEspecificar}` : "Otro", valor: num(evento.condensadoOtro) },
  ];

  const nombreSpeaker = (id: string | null) => evento.speakersParticipacion.find((sp) => (sp.speakerId ?? null) === (id ?? null) && id)?.nombreSpeaker ?? "";
  const orden: Record<string, number> = { ordenCompra: 0, facturas: 1, comprobantePago: 2 };
  const registros: FilaRegistroFinanciero[] = [...financieros]
    .sort((a, b) => (orden[a.categoria] ?? 9) - (orden[b.categoria] ?? 9))
    .map((f) => ({
      categoria: ETIQUETA_CATEGORIA_FINANCIERA_REPOSITORIO[f.categoria] ?? f.categoria,
      numero: f.numero,
      fecha: f.fecha ? formatearFecha(f.fecha) : "",
      valor: f.valor,
      moneda: f.moneda || moneda,
      speaker: nombreSpeaker(f.speakerId ?? null),
      sesion: nombreSesion(f.sesionId ?? null),
    }));

  return {
    moneda,
    centroCostos: evento.centroCostos,
    presupuestoAprobado: { incluido: evento.incluidoPresupuestoAprobado, monto: evento.montoPresupuestoAprobado },
    condensado,
    totalSolicitado: totalCondensado({
      condensadoInscripcion: evento.condensadoInscripcion,
      condensadoTransporte: evento.condensadoTransporte,
      condensadoTraslado: evento.condensadoTraslado,
      condensadoHospedaje: evento.condensadoHospedaje,
      condensadoAlimentos: evento.condensadoAlimentos,
      condensadoHonorariosSpeaker: evento.condensadoHonorariosSpeaker,
      condensadoOtro: evento.condensadoOtro,
      incluirValorParticipacion: evento.incluirValorParticipacion,
      condensadoValorParticipacion: evento.condensadoValorParticipacion,
    }),
    bloques,
    ejecucion: { total: conciliar(financieros), registros },
  };
}

export const ETIQUETA_TIPO_ASISTENTE: { clave: "medico" | "noMedico" | "fuerzaVentas" | "otro"; etiqueta: string }[] = [
  { clave: "medico", etiqueta: "Personal médico" },
  { clave: "noMedico", etiqueta: "Personal no médico" },
  { clave: "fuerzaVentas", etiqueta: "Fuerza de ventas" },
  { clave: "otro", etiqueta: "Otro personal" },
];

export const ETIQUETA_FUENTE_ASISTENTES: Record<DistribucionAsistentes["fuente"], string> = {
  ejecucion: "Check-in digital (Ejecución en Sitio)",
  lista_externa: "Lista externa cargada",
  sin_datos: "Sin datos de asistencia",
};

/** Escapa texto para incrustarlo en HTML generado a mano. */
export function esc(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
