import type { PresupuestoSesion, PresupuestoSpeakerSesion, SesionEvento, SpeakerParticipacionEvento } from "@/types";

/**
 * Cálculo del presupuesto condensado de la Solicitud de Evento —
 * reconstruido a partir de extracción forense directa del bundle original
 * (funciones `pC`/`hC`/`gC`/`_C`/`vC`/`yC`/`bC`/`Zb`). Las mismas 3 fórmulas
 * de costo (transporte/hospedaje/alimentos) aplican tanto al evento de
 * "Única sesión" (usando los campos de nivel de documento) como a cada fila
 * de `sesiones_evento` en "Varias sesiones" — en ese caso el condensado es
 * la SUMA de todas las sesiones.
 */

/**
 * Corrección (septiembre 2026): `PresupuestoSesion` se amplió para tener el
 * mismo detalle que `PresupuestoSpeakerSesion` (ver el comentario en
 * `types.ts`) — los valores por defecto de los campos "Acorde a la
 * política de viajes" siguen el mismo criterio que
 * `presupuestoSpeakerVacio()`: `true` por defecto (se asume conforme salvo
 * que el usuario indique lo contrario).
 */
export function presupuestoSesionVacio(): PresupuestoSesion {
  return {
    transporteNoAplica: false,
    transporteAcordePolitica: true,
    transporteMotivoNoAcorde: "",
    tipoTransporte: "",
    montoTransporte: null,
    cotizacionAdjunta: false,
    taxi: false,
    valorEstimadoTaxi: null,
    hospedajeNoAplica: false,
    hospedajeAcordePolitica: true,
    hospedajeMotivoNoAcorde: "",
    fechaInicioEstancia: null,
    fechaFinEstancia: null,
    numeroNoches: null,
    costoNochePersona: null,
    nombreHotel: "",
    categoriaHotel: "",
    motivoLocalidadDistinta: "",
    alimentosNoAplica: false,
    alimentosAcordePolitica: true,
    alimentosMotivoNoAcorde: "",
    montoAlimentosDia: null,
    comentariosAlimentos: "",
  };
}

/**
 * Ronda de ajustes de formularios (septiembre 2026), entrega 2: presupuesto
 * vacío de un speaker externo para una sesión dada (`sesionId: null` en
 * "Única sesión"). Ver `PresupuestoSpeakerSesion` en `types.ts`.
 */
export function presupuestoSpeakerVacio(sesionId: string | null): PresupuestoSpeakerSesion {
  return {
    id: `nuevo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sesionId,
    horasParticipacion: null,
    transporteNoAplica: false,
    transporteAcordePolitica: true,
    transporteMotivoNoAcorde: "",
    tipoTransporte: "",
    valorTransporte: null,
    cotizacionAdjunta: false,
    taxi: false,
    valorEstimadoTaxi: null,
    hospedajeNoAplica: false,
    hospedajeAcordePolitica: true,
    hospedajeMotivoNoAcorde: "",
    fechaInicioEstancia: null,
    fechaFinEstancia: null,
    costoNochePersona: null,
    nombreHotel: "",
    categoriaHotel: "",
    motivoLocalidadDistinta: "",
    alimentosNoAplica: false,
    alimentosAcordePolitica: true,
    alimentosMotivoNoAcorde: "",
    montoAlimentosDia: null,
    comentariosAlimentos: "",
  };
}

/** Número de noches entre dos fechas ISO (`Número de noches por persona*: Se autocalcula`, pedido explícito). */
export function nochesEntreFechas(inicio: string | null, fin: string | null): number {
  if (!inicio || !fin) return 0;
  const i = new Date(inicio).getTime();
  const f = new Date(fin).getTime();
  if (Number.isNaN(i) || Number.isNaN(f) || f <= i) return 0;
  return Math.round((f - i) / (1000 * 60 * 60 * 24));
}

const num = (v: number | null) => v ?? 0;

/** Costo de transporte de una sesión: 0 si no aplica, si no el monto declarado. */
export function costoTransporteSesion(p: PresupuestoSesion): number {
  return p.transporteNoAplica ? 0 : num(p.montoTransporte);
}

/**
 * Corrección (septiembre 2026): "Traslados en taxi" ahora también existe
 * para `PresupuestoSesion` (antes solo para `PresupuestoSpeakerSesion`) —
 * mismo criterio que `costoTrasladoTaxiSpeaker`.
 */
export function costoTrasladoTaxiSesion(p: PresupuestoSesion): number {
  return p.transporteNoAplica || !p.taxi ? 0 : num(p.valorEstimadoTaxi);
}

/** Costo de hospedaje de una sesión: noches × costo por noche/persona. */
export function costoHospedajeSesion(p: PresupuestoSesion): number {
  return p.hospedajeNoAplica ? 0 : num(p.numeroNoches) * num(p.costoNochePersona);
}

/**
 * Costo de alimentos de una sesión: monto por día × número de noches — si
 * no hay noches registradas, el bundle original asume 1 día (`||1`), para
 * que un evento de un solo día sin hospedaje igual calcule el costo de
 * alimentación de esa jornada.
 */
export function costoAlimentosSesion(p: PresupuestoSesion): number {
  return p.alimentosNoAplica ? 0 : num(p.montoAlimentosDia) * (num(p.numeroNoches) || 1);
}

export function sumarTransporteSesiones(sesiones: SesionEvento[]): number {
  return sesiones.reduce((acc, s) => acc + costoTransporteSesion(s.presupuesto ?? presupuestoSesionVacio()), 0);
}

export function sumarHospedajeSesiones(sesiones: SesionEvento[]): number {
  return sesiones.reduce((acc, s) => acc + costoHospedajeSesion(s.presupuesto ?? presupuestoSesionVacio()), 0);
}

export function sumarAlimentosSesiones(sesiones: SesionEvento[]): number {
  return sesiones.reduce((acc, s) => acc + costoAlimentosSesion(s.presupuesto ?? presupuestoSesionVacio()), 0);
}

/** Corrección (septiembre 2026): ver `costoTrasladoTaxiSesion`. */
export function sumarTrasladoSesiones(sesiones: SesionEvento[]): number {
  return sesiones.reduce((acc, s) => acc + costoTrasladoTaxiSesion(s.presupuesto ?? presupuestoSesionVacio()), 0);
}

/**
 * Ronda de ajustes de formularios (septiembre 2026), entrega 2: costos por
 * fila de `PresupuestoSpeakerSesion` — mismo criterio que las funciones de
 * sesión de arriba, más "Traslados en taxi" (línea propia del Condensado,
 * separada de Transporte) y noches AUTOCALCULADAS a partir de las fechas de
 * estancia (pedido explícito), no capturadas a mano.
 */
export function costoTransporteSpeaker(p: PresupuestoSpeakerSesion): number {
  return p.transporteNoAplica ? 0 : num(p.valorTransporte);
}

export function costoTrasladoTaxiSpeaker(p: PresupuestoSpeakerSesion): number {
  return p.transporteNoAplica || !p.taxi ? 0 : num(p.valorEstimadoTaxi);
}

export function costoHospedajeSpeaker(p: PresupuestoSpeakerSesion): number {
  if (p.hospedajeNoAplica) return 0;
  return nochesEntreFechas(p.fechaInicioEstancia, p.fechaFinEstancia) * num(p.costoNochePersona);
}

export function costoAlimentosSpeaker(p: PresupuestoSpeakerSesion): number {
  if (p.alimentosNoAplica) return 0;
  return num(p.montoAlimentosDia) * (nochesEntreFechas(p.fechaInicioEstancia, p.fechaFinEstancia) || 1);
}

function todosLosPresupuestos(speakers: SpeakerParticipacionEvento[]): PresupuestoSpeakerSesion[] {
  return speakers.flatMap((s) => s.presupuestos);
}

export function sumarInscripcionSpeakers(speakers: SpeakerParticipacionEvento[]): number {
  return speakers.reduce((acc, s) => acc + num(s.montoInscripcion), 0);
}

/**
 * Reorganización FormularioEvento (septiembre 2026): honorarios del
 * speaker, ahora separados de la cuota de inscripción — antes de esta
 * ronda el condensado fijaba `condensadoHonorariosSpeaker` en 0 para
 * eventos con presupuesto por speaker, porque no existía ningún campo de
 * honorarios propio por speaker con el cual sumarlo.
 */
export function sumarHonorariosSpeakers(speakers: SpeakerParticipacionEvento[]): number {
  return speakers.reduce((acc, s) => acc + num(s.montoHonorarios), 0);
}

export function sumarTransporteSpeakers(speakers: SpeakerParticipacionEvento[]): number {
  return todosLosPresupuestos(speakers).reduce((acc, p) => acc + costoTransporteSpeaker(p), 0);
}

export function sumarTrasladoTaxiSpeakers(speakers: SpeakerParticipacionEvento[]): number {
  return todosLosPresupuestos(speakers).reduce((acc, p) => acc + costoTrasladoTaxiSpeaker(p), 0);
}

export function sumarHospedajeSpeakers(speakers: SpeakerParticipacionEvento[]): number {
  return todosLosPresupuestos(speakers).reduce((acc, p) => acc + costoHospedajeSpeaker(p), 0);
}

export function sumarAlimentosSpeakers(speakers: SpeakerParticipacionEvento[]): number {
  return todosLosPresupuestos(speakers).reduce((acc, p) => acc + costoAlimentosSpeaker(p), 0);
}

/** Total del presupuesto condensado — suma de las 7 categorías (igual que `Zb` en el bundle). */
export function totalCondensado(datos: {
  condensadoInscripcion: number | null;
  condensadoTransporte: number | null;
  condensadoTraslado: number | null;
  condensadoHospedaje: number | null;
  condensadoAlimentos: number | null;
  condensadoHonorariosSpeaker: number | null;
  condensadoOtro: number | null;
  /** Opcional: documentos anteriores a la columna no lo traen. */
  incluirValorParticipacion?: boolean;
  condensadoValorParticipacion?: number | null;
}): number {
  return (
    num(datos.condensadoInscripcion) +
    num(datos.condensadoTransporte) +
    num(datos.condensadoTraslado) +
    num(datos.condensadoHospedaje) +
    num(datos.condensadoAlimentos) +
    num(datos.condensadoHonorariosSpeaker) +
    num(datos.condensadoOtro) +
    (datos.incluirValorParticipacion ? num(datos.condensadoValorParticipacion ?? null) : 0)
  );
}
