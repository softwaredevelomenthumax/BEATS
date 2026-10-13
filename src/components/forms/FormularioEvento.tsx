import { useConfirmar } from "@/hooks/useConfirmar";
import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { InputEmail } from "@/components/ui/input-email";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleCapsula } from "@/components/ui/toggle-capsula";
import { MODALIDAD_EVENTO, ETIQUETA_MODALIDAD_EVENTO } from "@/lib/enums";
import { Button } from "@/components/ui/button";
import { Accordion } from "@/components/ui/accordion";
import { SeccionAcordeon } from "@/components/forms/SeccionAcordeon";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CamposPersonalizadosSeccion } from "@/components/CamposPersonalizadosSeccion";
import { CampoArchivo } from "@/components/archivos/CampoArchivo";
import { SelectPaisEstadoCiudad } from "@/components/SelectPaisEstadoCiudad";
import { useCatalogo } from "@/lib/catalogos";
import { esOrganizadoPorOtro } from "@/lib/organizadoPor";
import { formatearMonto } from "@/lib/dinero";
import { InputMoneda } from "@/components/ui/input-moneda";
import { camposAplicables, camposPorSeccion, type CampoPersonalizadoDefinicion } from "@/lib/camposPersonalizados";
import { etiquetaEfectiva, type EtiquetaCampo } from "@/lib/etiquetasCampo";
import {
  presupuestoSesionVacio,
  presupuestoSpeakerVacio,
  costoTransporteSesion,
  costoTrasladoTaxiSesion,
  costoHospedajeSesion,
  costoAlimentosSesion,
  sumarTransporteSesiones,
  sumarTrasladoSesiones,
  sumarHospedajeSesiones,
  sumarAlimentosSesiones,
  sumarInscripcionSpeakers,
  sumarHonorariosSpeakers,
  sumarTransporteSpeakers,
  sumarTrasladoTaxiSpeakers,
  sumarHospedajeSpeakers,
  sumarAlimentosSpeakers,
  nochesEntreFechas,
  totalCondensado,
} from "@/lib/presupuestoEvento";
import type { SpeakerResumen } from "@/lib/speakers";
import { etiquetaSpeakerResumen } from "@/lib/speakers";
import { etiquetaSpeakerInterno, parsearSpeakerInterno, quienDictaDerivado } from "@/lib/speakersEvento";
import type { ProductoResumen } from "@/lib/productos";
import { SelectorProductosEvento } from "@/components/forms/SelectorProductosEvento";
import type { MuestraPlaneada, ProductoEvento, PresupuestoSesion, PresupuestoSpeakerSesion, SesionEvento, SpeakerParticipacionEvento } from "@/types";

export interface DatosFormularioEvento {
  nombreSolicitante: string;
  nombreSuperiorAprueba: string;
  empresaGrupo: string;
  /**
   * AJUSTES (septiembre 2026): se muestra como "Nombre completo del HCP
   * relacionado" dentro del bloque de "¿Habrá patrocinio / pago de viáticos
   * a un HCP?" — ver `patrocinioHcp` más abajo.
   */
  datosHCP: string;
  tipoEvento: string;
  areaEspecialidad: string;
  lineaTerapeutica: string;
  nombreEvento: string;
  organizadoPor: string;
  nombreOrganizador: string;
  /**
   * AJUSTES (septiembre 2026), pedido explícito: nuevo campo "¿Habrá
   * patrocinio / pago de viáticos a un HCP?" — activa `datosHCP` + los 8
   * campos `hcp*` y `justificacionViaticos` (renombrada y reubicada).
   */
  patrocinioHcp: boolean;
  hcpNumeroDocumento: string;
  hcpProfesion: string;
  hcpEspecialidad: string;
  hcpDireccion: string;
  hcpPais: string;
  hcpEstadoProvincia: string;
  hcpCiudad: string;
  hcpTelefono: string;
  hcpEmail: string;
  fechaInicioEvento: string;
  fechaFinEvento: string;
  modalidadSesiones: "Única sesión" | "Varias sesiones";
  /**
   * Reorganización FormularioEvento (septiembre 2026): número de sesiones
   * declarado explícitamente, que autogenera filas en `sesiones` — ver
   * `onCambiaNumeroSesiones`.
   */
  numeroSesiones: number | null;
  facturaModalidad: string;
  listaAsistenciaNoAplica: boolean;
  listaAsistenciaNoAplicaMotivo: string;
  fechaInicioEstancia: string;
  fechaFinEstancia: string;
  modalidadEvento: "Presencial" | "Virtual" | "Mixto" | "";
  direccion: string;
  pais: string;
  estadoProvincia: string;
  ciudad: string;
  justificacionViaticos: string;
  objetivosEvento: string;
  numeroAsistentes: number | null;
  entregaMuestrasMedicas: boolean;
  detalleMuestrasMedicas: string;
  entregaArticulosPromocionales: boolean;
  detalleArticulosPromocionales: string;
  participacionAcademica: boolean;
  detalleParticipacionAcademica: string;
  quienDictaActividad: "Speaker interno" | "Speaker externo" | "";
  /**
   * Entrega 22 (octubre 2026): un evento puede tener speakers internos Y
   * externos a la vez. `quienDictaActividad` se deriva de estas dos casillas
   * (con externos, aunque haya internos, queda "Speaker externo").
   */
  incluyeSpeakersInternos: boolean;
  incluyeSpeakersExternos: boolean;
  speakerParticipacionId: string;
  nombreSpeakerParticipacion: string;
  numeroSpeakersExternos: number | null;
  speakersParticipacion: SpeakerParticipacionEvento[];
  incluidoPresupuestoAprobado: boolean | null;
  montoPresupuestoAprobado: number | null;
  advertenciaPresupuestoNoAprobado: boolean;
  anexos: boolean;
  descripcionAnexos: string;
  cartaInvitacionId: string | null;
  programaAcademicoId: string | null;
  honorariosSpeaker: number | null;
  inscripcionNoAplica: boolean;
  montoInscripcion: number | null;
  detalleInscripcion: string;
  actividadAdicionalInscripcion: boolean;
  detalleActividadAdicional: string;
  actividadIncluidaInscripcion: boolean;
  detalleActividadIncluida: string;
  transporteNoAplica: boolean;
  transporteAcordePolitica: boolean;
  transporteMotivoNoAcorde: string;
  tipoTransporte: string;
  // Corrección (septiembre 2026): faltaban a nivel de documento (Única
  // sesión) — ver el comentario en `Evento` (types.ts).
  montoTransporte: number | null;
  cotizacionAdjunta: boolean;
  taxi: boolean;
  valorEstimadoTaxi: number | null;
  hospedajeNoAplica: boolean;
  hospedajeAcordePolitica: boolean;
  hospedajeMotivoNoAcorde: string;
  numeroNoches: number | null;
  costoNochePersona: number | null;
  nombreHotel: string;
  categoriaHotel: string;
  motivoLocalidadDistinta: string;
  alimentosNoAplica: boolean;
  alimentosAcordePolitica: boolean;
  alimentosMotivoNoAcorde: string;
  montoAlimentosDia: number | null;
  comentariosAlimentos: string;
  condensadoInscripcion: number | null;
  condensadoTransporte: number | null;
  condensadoTraslado: number | null;
  condensadoHospedaje: number | null;
  condensadoAlimentos: number | null;
  condensadoHonorariosSpeaker: number | null;
  condensadoOtro: number | null;
  incluirValorParticipacion: boolean;
  condensadoValorParticipacion: number | null;
  condensadoOtroEspecificar: string;
  comentariosCosto: string;
  centroCostos: string;
  moneda: string;
  comentariosEspecialesNoAplica: boolean;
  comentariosEspeciales: string;
  sesiones: SesionEvento[];
  muestrasPlaneadas: MuestraPlaneada[];
  /** Entrega 31: productos del portafolio relacionados con el evento (uno principal). */
  productosEvento: ProductoEvento[];
  camposPersonalizados: Record<string, unknown>;
}

export const EVENTO_VACIO: DatosFormularioEvento = {
  nombreSolicitante: "",
  nombreSuperiorAprueba: "",
  empresaGrupo: "",
  datosHCP: "",
  tipoEvento: "",
  areaEspecialidad: "",
  lineaTerapeutica: "",
  nombreEvento: "",
  organizadoPor: "",
  nombreOrganizador: "",
  patrocinioHcp: false,
  hcpNumeroDocumento: "",
  hcpProfesion: "",
  hcpEspecialidad: "",
  hcpDireccion: "",
  hcpPais: "",
  hcpEstadoProvincia: "",
  hcpCiudad: "",
  hcpTelefono: "",
  hcpEmail: "",
  fechaInicioEvento: "",
  fechaFinEvento: "",
  modalidadSesiones: "Única sesión",
  numeroSesiones: null,
  facturaModalidad: "",
  listaAsistenciaNoAplica: false,
  listaAsistenciaNoAplicaMotivo: "",
  fechaInicioEstancia: "",
  fechaFinEstancia: "",
  modalidadEvento: "",
  direccion: "",
  pais: "",
  estadoProvincia: "",
  ciudad: "",
  justificacionViaticos: "",
  objetivosEvento: "",
  numeroAsistentes: null,
  entregaMuestrasMedicas: false,
  detalleMuestrasMedicas: "",
  entregaArticulosPromocionales: false,
  detalleArticulosPromocionales: "",
  participacionAcademica: false,
  detalleParticipacionAcademica: "",
  quienDictaActividad: "",
  incluyeSpeakersInternos: false,
  incluyeSpeakersExternos: false,
  speakerParticipacionId: "",
  nombreSpeakerParticipacion: "",
  numeroSpeakersExternos: null,
  speakersParticipacion: [],
  incluidoPresupuestoAprobado: null,
  montoPresupuestoAprobado: null,
  advertenciaPresupuestoNoAprobado: false,
  anexos: false,
  descripcionAnexos: "",
  cartaInvitacionId: null,
  programaAcademicoId: null,
  honorariosSpeaker: null,
  // Ajuste de precisión (septiembre 2026), pedido explícito: el toggle A1
  // "¿Aplica costo de participación / inscripción?" arranca en "No" por
  // defecto (antes arrancaba en "Sí" con este mismo campo en `false`).
  inscripcionNoAplica: true,
  montoInscripcion: null,
  detalleInscripcion: "",
  actividadAdicionalInscripcion: false,
  detalleActividadAdicional: "",
  actividadIncluidaInscripcion: false,
  detalleActividadIncluida: "",
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
  condensadoInscripcion: null,
  condensadoTransporte: null,
  condensadoTraslado: null,
  condensadoHospedaje: null,
  condensadoAlimentos: null,
  condensadoHonorariosSpeaker: null,
  condensadoOtro: null,
  incluirValorParticipacion: false,
  condensadoValorParticipacion: null,
  condensadoOtroEspecificar: "",
  comentariosCosto: "",
  centroCostos: "",
  moneda: "",
  comentariosEspecialesNoAplica: true,
  comentariosEspeciales: "",
  sesiones: [],
  muestrasPlaneadas: [],
  productosEvento: [],
  camposPersonalizados: {},
};

const ETIQUETA_CAMPO: Record<string, string> = {
  nombreSolicitante: "Nombre del solicitante",
  empresaGrupo: "Empresa del grupo",
  tipoEvento: "Tipo de evento",
  areaEspecialidad: "Área / especialidad",
  nombreEvento: "Nombre del evento",
  organizadoPor: "Organizado por",
  fechaInicioEvento: "Fecha de inicio del evento",
  fechaFinEvento: "Fecha de fin del evento",
  modalidadEvento: "Formato",
  modalidadSesiones: "Modalidad",
  numeroSesiones: "Número de sesiones",
  direccion: "Dirección",
  pais: "País",
  estadoProvincia: "Estado/Provincia/Departamento",
  ciudad: "Ciudad",
  objetivosEvento: "Objetivos del evento",
  moneda: "Moneda",
  datosHCP: "Nombre completo del HCP relacionado",
  hcpNumeroDocumento: "Número de documento del HCP relacionado",
  hcpProfesion: "Profesión del HCP relacionado",
  hcpEspecialidad: "Especialidad del HCP relacionado",
  hcpDireccion: "Dirección del HCP relacionado",
  hcpPais: "País del HCP relacionado",
  hcpEstadoProvincia: "Estado/Provincia/Departamento del HCP relacionado",
  hcpCiudad: "Ciudad del HCP relacionado",
  hcpTelefono: "Teléfono del HCP relacionado",
  hcpEmail: "Email del HCP relacionado",
  justificacionViaticos: "Justificación de patrocinio / pago de viáticos",
};

/**
 * Octubre 2026: con participación académica, TANTO speakers internos como
 * externos se capturan por casilla (N speakers, cada uno con sus sesiones y
 * su transporte/hospedaje/alimentos por sesión). Solo los externos suman
 * cuota de inscripción, honorarios y modalidad de factura.
 */
export function usaSpeakers(d: {
  participacionAcademica: boolean;
  quienDictaActividad: string | null;
  incluyeSpeakersInternos?: boolean;
  incluyeSpeakersExternos?: boolean;
}): boolean {
  return (
    d.participacionAcademica &&
    (!!d.incluyeSpeakersInternos || !!d.incluyeSpeakersExternos || d.quienDictaActividad === "Speaker externo" || d.quienDictaActividad === "Speaker interno")
  );
}

/** Entrega 22: banderas internos/externos de un evento ya guardado (filas declaradas o, si no hay, el campo histórico). */
export function banderasSpeakersDeEvento(e: {
  participacionAcademica: boolean;
  quienDictaActividad: string | null;
  speakersParticipacion: SpeakerParticipacionEvento[];
}): { incluyeSpeakersInternos: boolean; incluyeSpeakersExternos: boolean } {
  if (!e.participacionAcademica) return { incluyeSpeakersInternos: false, incluyeSpeakersExternos: false };
  return {
    incluyeSpeakersInternos: e.speakersParticipacion.some((sp) => sp.tipo === "interno") || (e.speakersParticipacion.length === 0 && e.quienDictaActividad === "Speaker interno"),
    incluyeSpeakersExternos: e.speakersParticipacion.some((sp) => sp.tipo === "externo") || (e.speakersParticipacion.length === 0 && e.quienDictaActividad === "Speaker externo"),
  };
}

/**
 * AJUSTES (septiembre 2026), pedido explícito: al renombrar "El transporte
 * no aplica"/"El hospedaje no aplica"/"Los alimentos no aplican" por
 * "Transporte"/"Hospedaje"/"Alimentos" y reordenar sus campos, varios pasan
 * de opcionales a obligatorios (Tipo de transporte, Valor del transporte;
 * Fecha de inicio/fin de estancia, Costo de noche por persona, Nombre y
 * categoría del hotel; Monto autorizado de alimentos por día) — solo
 * cuando el bloque correspondiente SÍ aplica. Compartido entre el bloque a
 * nivel de documento ("Única sesión" sin speakers externos), cada fila de
 * `sesiones` (sin speakers externos) y cada fila de
 * `speakersParticipacion[].presupuestos` (con speakers externos), que usan
 * el mismo detalle de campos bajo dos nombres de tipo distintos
 * (`PresupuestoSesion`/`PresupuestoSpeakerSesion`).
 */
function agregarErroresPresupuesto(
  errores: Record<string, string>,
  prefijo: string,
  p: {
    transporteNoAplica: boolean;
    tipoTransporte: string;
    hospedajeNoAplica: boolean;
    fechaInicioEstancia: string | null;
    fechaFinEstancia: string | null;
    costoNochePersona: number | null;
    nombreHotel: string;
    categoriaHotel: string;
    alimentosNoAplica: boolean;
    montoAlimentosDia: number | null;
  },
  montoTransporte: number | null,
  claveMontoTransporte: string,
) {
  if (!p.transporteNoAplica) {
    if (!p.tipoTransporte) errores[`${prefijo}-tipoTransporte`] = "Indica el tipo de transporte.";
    if (montoTransporte == null) errores[`${prefijo}-${claveMontoTransporte}`] = "Indica el valor del transporte.";
  }
  if (!p.hospedajeNoAplica) {
    if (!p.fechaInicioEstancia) errores[`${prefijo}-fechaInicioEstancia`] = "Indica la fecha de inicio de la estancia.";
    if (!p.fechaFinEstancia) errores[`${prefijo}-fechaFinEstancia`] = "Indica la fecha de finalización de la estancia.";
    if (p.costoNochePersona == null) errores[`${prefijo}-costoNochePersona`] = "Indica el costo de noche por persona.";
    if (!p.nombreHotel.trim()) errores[`${prefijo}-nombreHotel`] = "Indica el nombre del hotel.";
    if (!p.categoriaHotel) errores[`${prefijo}-categoriaHotel`] = "Indica la categoría del hotel.";
  }
  if (!p.alimentosNoAplica) {
    if (p.montoAlimentosDia == null) errores[`${prefijo}-montoAlimentosDia`] = "Indica el monto autorizado de alimentos por día.";
  }
}

export function calcularErroresEvento(datos: DatosFormularioEvento): Record<string, string> {
  const errores: Record<string, string> = {};
  const requerido = (clave: keyof DatosFormularioEvento) => {
    if (!String(datos[clave] ?? "").trim()) {
      errores[clave] = `${ETIQUETA_CAMPO[clave] ?? clave} es obligatorio.`;
    }
  };

  requerido("nombreSolicitante");
  requerido("empresaGrupo");
  requerido("tipoEvento");
  requerido("areaEspecialidad");
  requerido("nombreEvento");
  // Reorganización FormularioEvento (septiembre 2026): "Organizado por"
  // pasa a leerse del catálogo "Organizado por (Convenio)" y se marca
  // obligatorio — antes era opcional.
  requerido("organizadoPor");
  requerido("fechaInicioEvento");
  requerido("fechaFinEvento");
  // Reorganización FormularioEvento (septiembre 2026): "Formato" (antes
  // "Modalidad del evento") y "Modalidad" (antes "Modalidad de sesiones")
  // pasan de opcionales a obligatorios.
  requerido("modalidadEvento");
  requerido("modalidadSesiones");
  requerido("objetivosEvento");
  // Entrega 31: con más de un producto seleccionado hay que marcar exactamente uno como principal.
  if (datos.productosEvento.length > 1 && datos.productosEvento.filter((p) => p.principal).length !== 1) {
    errores.productosEvento = "Marca cuál de los productos es el «Producto principal del evento».";
  }
  requerido("moneda");

  // AJUSTES (septiembre 2026), pedido explícito: si hay patrocinio / pago de
  // viáticos a un HCP, todos sus datos (+ la justificación, renombrada) pasan
  // a ser obligatorios.
  if (datos.patrocinioHcp) {
    requerido("datosHCP");
    requerido("hcpNumeroDocumento");
    requerido("hcpProfesion");
    requerido("hcpEspecialidad");
    requerido("hcpDireccion");
    requerido("hcpPais");
    requerido("hcpEstadoProvincia");
    requerido("hcpCiudad");
    requerido("hcpTelefono");
    requerido("hcpEmail");
    requerido("justificacionViaticos");
  }

  // Reorganización FormularioEvento (septiembre 2026): "Número de
  // sesiones*" es obligatorio cuando el evento es de "Varias sesiones" —
  // campo nuevo que antes no existía (la cantidad de sesiones era
  // implícita en el arreglo `sesiones`).
  //
  // Corrección (pedido explícito del usuario): "Varias sesiones" implica,
  // por definición, más de una sesión — un valor de 1 (o menor) es
  // contradictorio con haber elegido esa modalidad en vez de "Única
  // sesión". El mensaje pedido es específico para ese caso ("El valor
  // mínimo de sesiones debe ser 2"), distinto del genérico de campo vacío.
  if (datos.modalidadSesiones === "Varias sesiones") {
    if (!datos.numeroSesiones) {
      errores.numeroSesiones = "Indica el número de sesiones.";
    } else if (datos.numeroSesiones <= 1) {
      errores.numeroSesiones = "El valor mínimo de sesiones debe ser 2.";
    }
  }

  // A3: si el evento es Virtual, dirección/país/ciudad se autocompletan a
  // "Virtual"/"N/A" (ver el useEffect del formulario) y dejan de exigirse
  // como si fueran datos que el usuario debe llenar. A15/A20: en un evento
  // de varias sesiones esos mismos 3 campos se deshabilitan porque cada
  // sesión ya tiene su propio "Lugar" — tampoco tiene sentido exigirlos a
  // nivel de documento en ese caso. Reorganización FormularioEvento
  // (septiembre 2026), decisión confirmada: "Mixto" se comporta igual que
  // "Presencial" para este propósito (solo "Virtual" exime estos campos).
  const direccionPaisCiudadNoAplican = datos.modalidadEvento === "Virtual" || datos.modalidadSesiones === "Varias sesiones";
  if (!direccionPaisCiudadNoAplican) {
    requerido("direccion");
    requerido("pais");
    requerido("estadoProvincia");
    requerido("ciudad");
  }

  // A7: "Nombre del organizador" solo es exigible cuando "Organizado por"
  // apunta a un organizador genérico ("Otro"/"Tercero") que necesita
  // identificarse por nombre — el resto de valores del catálogo ya
  // identifican a un organizador concreto.
  if (esOrganizadoPorOtro(datos.organizadoPor)) {
    requerido("nombreOrganizador");
  }

  if (datos.entregaMuestrasMedicas && !datos.detalleMuestrasMedicas.trim()) {
    errores.detalleMuestrasMedicas = "Describe las muestras médicas a entregar.";
  }
  if (datos.entregaArticulosPromocionales && !datos.detalleArticulosPromocionales.trim()) {
    errores.detalleArticulosPromocionales = "Describe los artículos promocionales.";
  }
  if (datos.participacionAcademica) {
    // Reorganización FormularioEvento (septiembre 2026): "Detalle" pasa de
    // opcional a obligatorio.
    if (!datos.detalleParticipacionAcademica.trim()) {
      errores.detalleParticipacionAcademica = "Describe la participación académica.";
    }
    if (!datos.incluyeSpeakersInternos && !datos.incluyeSpeakersExternos) {
      errores.quienDictaActividad = "Indica quién dicta la actividad académica (puedes marcar speakers internos, externos o ambos).";
    }
    // Entrega 22: speakers internos Y externos pueden coexistir. Cada tipo
    // lleva su propio número; el interno se elige del catálogo "Speakers
    // internos" y el externo del Repositorio de HCPs/Speakers.
    if (usaSpeakers(datos)) {
      const nInternos = datos.speakersParticipacion.filter((sp) => sp.tipo === "interno").length;
      const nExternos = datos.speakersParticipacion.filter((sp) => sp.tipo === "externo").length;
      if (datos.incluyeSpeakersExternos) {
        if (datos.numeroSpeakersExternos == null) errores.numeroSpeakersExternos = "Indica cuántos speakers externos participarán.";
        else if (datos.numeroSpeakersExternos < 1 || nExternos < 1) errores.numeroSpeakersExternos = "El número de speakers externos debe ser mayor o igual a 1.";
      }
      if (datos.incluyeSpeakersInternos && nInternos < 1) {
        errores.numeroSpeakersInternos = "Indica cuántos speakers internos participarán (mayor o igual a 1).";
      }
      datos.speakersParticipacion.forEach((sp, i) => {
        const esExterno = sp.tipo === "externo";
        if (esExterno && !sp.speakerId) errores[`speaker-${i}-id`] = `Selecciona el speaker externo del repositorio.`;
        if (!esExterno && !sp.nombreSpeaker.trim()) errores[`speaker-${i}-id`] = `Selecciona el speaker interno del catálogo.`;
        // Reorganización FormularioEvento (septiembre 2026): cuota de
        // inscripción y honorarios del speaker son campos independientes,
        // ambos obligatorios (antes un único campo combinado cubría los
        // dos conceptos). Corrección: (a) ambos admiten 0 como valor válido
        // (antes `<= 0` los rechazaba); (b) dejan de depender de
        // `datos.inscripcionNoAplica` — ese interruptor es del "Valor
        // participación" del EVENTO (lo que le cuesta a la empresa
        // participar, p. ej. inscripción a un congreso), un concepto
        // distinto de la cuota/honorarios de CADA speaker, que siempre
        // aplican cuando hay speakers externos, sin importar si la
        // participación del evento en sí "no aplica".
        if (esExterno && (sp.montoInscripcion === null || sp.montoInscripcion < 0)) {
          errores[`speaker-${i}-inscripcion`] = `Indica la cuota de inscripción del speaker ${i + 1} (puede ser 0).`;
        }
        if (esExterno && (sp.montoHonorarios === null || sp.montoHonorarios < 0)) {
          errores[`speaker-${i}-honorarios`] = `Indica los honorarios del speaker ${i + 1} (puede ser 0).`;
        }
        // Octubre 2026: "Detallar lo que incluye" es obligatorio solo cuando el monto respectivo es > 0.
        if (esExterno && (sp.montoInscripcion ?? 0) > 0 && !sp.detalleInscripcion.trim()) {
          errores[`speaker-${i}-detalle-inscripcion`] = `Detalla lo que incluye la cuota de inscripción del speaker ${i + 1}.`;
        }
        if (esExterno && (sp.montoHonorarios ?? 0) > 0 && !(sp.detalleHonorarios ?? "").trim()) {
          errores[`speaker-${i}-detalle-honorarios`] = `Detalla lo que incluyen los honorarios del speaker ${i + 1}.`;
        }
        // Entrega "sesiones sin redundancia": en un evento de varias
        // sesiones, cada speaker externo debe participar en al menos una
        // sesión (no se asume que participa en todas).
        if (datos.modalidadSesiones === "Varias sesiones" && sp.presupuestos.length === 0) {
          errores[`speaker-${i}-sesiones`] = `Selecciona al menos una sesión para el speaker ${i + 1}.`;
        }
        // AJUSTES (septiembre 2026): Tipo/Valor de transporte, fechas de
        // estancia, costo/nombre/categoría de hotel y monto de alimentos
        // pasan a ser obligatorios cuando el bloque respectivo sí aplica —
        // ver `agregarErroresPresupuesto`.
        sp.presupuestos.forEach((p) => {
          // Entrega 31: tiempo de participación obligatorio (mayor que 0) por sesión del speaker.
          if (p.horasParticipacion === null || !(p.horasParticipacion > 0)) {
            errores[`speaker-${i}-${p.sesionId ?? "unica"}-horas`] =
              datos.modalidadSesiones === "Varias sesiones"
                ? `Indica el tiempo de participación (horas) del speaker ${i + 1} en esta sesión.`
                : `Indica el tiempo de participación (horas) del speaker ${i + 1}.`;
          }
          agregarErroresPresupuesto(errores, `evento-speaker-${i}-${p.sesionId ?? "unica"}`, p, p.valorTransporte, "valorTransporte");
        });
      });
    }
  }
  // Entrega "Participación, presupuesto aprobado y anexos" (septiembre
  // 2026): "Valor participación" (antes "Monto de inscripción") y "Detalle
  // participación" (antes "Detalle de la inscripción") pasan de opcionales
  // a obligatorios, independientes de la participación académica y del
  // tipo de speaker — admiten 0 como valor válido (p. ej. un evento sin
  // costo de participación). Cuando "¿Aplica costo de participación?" es
  // "No" (antes: interruptor "La inscripción no aplica" en Sí — mismo
  // campo interno `inscripcionNoAplica`, ver el botón "No" en la sección),
  // el valor se fija en 0 automáticamente y estos dos campos dejan de
  // exigirse.
  if (!datos.inscripcionNoAplica) {
    if (datos.montoInscripcion === null) {
      errores.montoInscripcion = "Indica el valor de participación (puede ser 0).";
    }
    if (!datos.detalleInscripcion.trim()) {
      errores.detalleInscripcion = "Describe qué incluye la participación.";
    }
  }
  if (!datos.centroCostos) errores.centroCostos = "Selecciona el centro de costos.";
  if (datos.incluidoPresupuestoAprobado === null) {
    errores.incluidoPresupuestoAprobado = "Indica si el evento está incluido en un presupuesto aprobado.";
  }
  if (datos.incluidoPresupuestoAprobado && (!datos.montoPresupuestoAprobado || datos.montoPresupuestoAprobado <= 0)) {
    errores.montoPresupuestoAprobado = "Indica el monto del presupuesto ya aprobado.";
  }
  if (datos.anexos && !datos.descripcionAnexos.trim()) {
    errores.descripcionAnexos = "Describe los anexos incluidos.";
  }
  if (!datos.comentariosEspecialesNoAplica && !datos.comentariosEspeciales.trim()) {
    errores.comentariosEspeciales = "Describe los comentarios especiales, o marca que no aplica.";
  }
  if (datos.modalidadSesiones === "Varias sesiones" && datos.sesiones.length === 0) {
    errores.sesiones = "Agrega al menos una sesión.";
  }
  if (datos.modalidadSesiones === "Varias sesiones") {
    const virtual = datos.modalidadEvento === "Virtual";
    datos.sesiones.forEach((s, i) => {
      if (!s.lugar.trim()) errores[`sesion-${i}-lugar`] = `Indica el lugar de la sesión ${i + 1}.`;
      // Si el evento completo es Virtual, país/estado/ciudad de cada sesión
      // tampoco aplican (mismo criterio que A3 a nivel de documento).
      if (!virtual) {
        if (!s.pais.trim()) errores[`sesion-${i}-pais`] = `Indica el país de la sesión ${i + 1}.`;
        if (!s.estadoProvincia.trim()) errores[`sesion-${i}-estado`] = `Indica el estado/provincia/departamento de la sesión ${i + 1}.`;
        if (!s.ciudad.trim()) errores[`sesion-${i}-ciudad`] = `Indica la ciudad de la sesión ${i + 1}.`;
      }
      // AJUSTES (septiembre 2026): mismo detalle obligatorio del
      // transporte/hospedaje/alimentos, aplicado al bloque por sesión —
      // solo cuando esta sesión NO tiene presupuesto por speaker externo
      // (mismo guard que el JSX: `quienDictaActividad !== "Speaker externo"`).
      if (!usaSpeakers(datos)) {
        agregarErroresPresupuesto(errores, `sesion-${i}-presupuesto`, s.presupuesto, s.presupuesto.montoTransporte, "montoTransporte");
      }
    });
  }
  // AJUSTES (septiembre 2026): bloque a nivel de documento ("Única sesión",
  // sin speakers externos) — mismo detalle obligatorio.
  if (datos.modalidadSesiones !== "Varias sesiones" && !usaSpeakers(datos)) {
    agregarErroresPresupuesto(errores, "evento", datos, datos.montoTransporte, "montoTransporte");
  }
  if (datos.entregaMuestrasMedicas) {
    datos.muestrasPlaneadas.forEach((m, i) => {
      if (!m.productoId) errores[`muestra-${i}-producto`] = `Selecciona el producto de la muestra ${i + 1}.`;
    });
  }

  return errores;
}

interface Props {
  valor: DatosFormularioEvento;
  onChange: (valor: DatosFormularioEvento) => void;
  errores: Record<string, string>;
  speakersDisponibles: SpeakerResumen[];
  productosDisponibles: ProductoResumen[];
  camposPersonalizadosDefinidos: CampoPersonalizadoDefinicion[];
  etiquetasCampo: EtiquetaCampo[];
  empresaGrupo: string;
  pais: string;
  soloLectura?: boolean;
  /**
   * Ronda de ajustes de formularios (septiembre 2026), entrega 4: "Cancelar
   * solicitud" del diálogo de presupuesto no aprobado. Si no se provee, el
   * diálogo simplemente revierte la respuesta a "Sí" (comportamiento
   * seguro de respaldo) en vez de cerrar cualquier cosa.
   */
  onCancelar?: () => void;
}

export function FormularioEvento({
  valor,
  onChange,
  errores,
  speakersDisponibles,
  productosDisponibles,
  camposPersonalizadosDefinidos,
  etiquetasCampo,
  empresaGrupo,
  pais,
  soloLectura,
  onCancelar,
}: Props) {
  const { opciones: empresas } = useCatalogo("empresasGrupo");
  const { opciones: tiposEvento } = useCatalogo("tiposEvento");
  const { opciones: areasEspecialidad } = useCatalogo("areasEspecialidadEvento");
  const { opciones: lineasTerapeuticas } = useCatalogo("lineasTerapeuticas");
  // Corrección (septiembre 2026): el catálogo "tiposTransporte" ya no se usa
  // — la sección "Transporte, hospedaje y alimentos" del evento (Única
  // sesión) pasó a reusar `renderPresupuestoSesion`, que (igual que
  // `renderPresupuestoSpeaker`, ya existente) usa una lista fija de 3
  // opciones en vez de este catálogo — comportamiento sin cambios respecto
  // a "Speakers externos", que ya funcionaba así.
  const { opciones: categoriasHotel } = useCatalogo("categoriasHotel");
  const { opciones: centrosCostos } = useCatalogo("centrosCostos");
  const { opciones: monedas } = useCatalogo("monedas");
  const { opciones: speakersInternosCatalogo } = useCatalogo("speakersInternos");
  // Reorganización FormularioEvento (septiembre 2026), decisión confirmada:
  // "Organizado por" pasa a leer el catálogo antes exclusivo de Convenio
  // (compartido ahora entre Convenio y Evento) — el catálogo
  // "organizadoPorEvento" queda sin ningún campo que lo use y se elimina
  // del editor de catálogos (ver `EditorCatalogosSimples.tsx`).
  const { opciones: organizadoPorOpciones } = useCatalogo("organizadoPorConvenio");
  // AJUSTES (septiembre 2026), pedido explícito: "Profesión"/"Especialidad"
  // del HCP relacionado, dentro del bloque "¿Habrá patrocinio / pago de
  // viáticos a un HCP?" — mismos catálogos ya usados en "Nuevo Speaker"
  // (`profesiones`) y "Nuevo FMV" (`especialidadesMedicas`, etiquetado
  // "Especialidades médicas (FMV)" en el editor de catálogos).
  const { opciones: profesionesHcp } = useCatalogo("profesiones");
  const { opciones: especialidadesHcp } = useCatalogo("especialidadesMedicas");

  function set<K extends keyof DatosFormularioEvento>(clave: K, v: DatosFormularioEvento[K]) {
    onChange({ ...valor, [clave]: v });
  }

  function setCampoPersonalizado(clave: string, v: unknown) {
    onChange({ ...valor, camposPersonalizados: { ...valor.camposPersonalizados, [clave]: v } });
  }

  const etiqueta = (clave: string) =>
    etiquetaEfectiva(etiquetasCampo, "evento", clave, empresaGrupo, ETIQUETA_CAMPO[clave] ?? clave);

  const aplicables = camposAplicables(camposPersonalizadosDefinidos, "evento", empresaGrupo, pais);
  const porSeccion = camposPorSeccion(aplicables);
  const valoresParaCalculo = { ...valor, ...valor.camposPersonalizados };

  const esUnicaSesion = valor.modalidadSesiones === "Única sesión";
  const esVariasSesiones = valor.modalidadSesiones === "Varias sesiones";

  // El presupuesto condensado se recalcula automáticamente a partir del
  // detalle. Ronda de ajustes de formularios (septiembre 2026), entrega 2:
  // cuando el evento tiene speakers externos declarados (el caso normal a
  // partir de esta ronda), el detalle real vive en
  // `speakersParticipacion[].presupuestos` — el condensado suma TODAS las
  // filas de TODOS los speakers (sin importar en qué sesión cayó cada una),
  // igual que pide el usuario ("sumando el valor correspondiente a este
  // ítem para todos los HCPs/Speakers externos"). El bloque de
  // transporte/hospedaje/alimentos a nivel de documento/sesión que existía
  // antes de esta ronda queda como respaldo SOLO para "Speaker interno" (un
  // empleado no tiene este desglose) o para documentos antiguos sin ningún
  // speaker declarado todavía.
  const hayPresupuestoPorSpeaker = usaSpeakers(valor) && valor.speakersParticipacion.length > 0;
  const hayInternosForm = valor.incluyeSpeakersInternos;
  const hayExternosForm = valor.incluyeSpeakersExternos;
  React.useEffect(() => {
    // Octubre 2026, pedido explícito: casilla para autocargar el «Valor
    // participación» ya diligenciado y sumarlo al total. Se calcula en ESTE
    // mismo efecto (no en otro aparte) para que ambos cambios lleguen en un
    // solo `onChange` y ninguno pise al otro. El campo «Valor participación» del
    // condensado SIEMPRE refleja el diligenciado arriba (0 si "¿Aplica costo?" es
    // "No") y suma al total; `incluirValorParticipacion` queda en true para marcar
    // que el valor vive en su propia línea (documentos anteriores lo traían dentro
    // de «Inscripción» y siguen sumando igual).
    const objetivoValorParticipacion = valor.inscripcionNoAplica ? 0 : valor.montoInscripcion ?? 0;
    if (hayPresupuestoPorSpeaker) {
      const siguiente: Partial<DatosFormularioEvento> = {
        condensadoValorParticipacion: objetivoValorParticipacion,
        incluirValorParticipacion: true,
        condensadoInscripcion: sumarInscripcionSpeakers(valor.speakersParticipacion),
        condensadoTransporte: sumarTransporteSpeakers(valor.speakersParticipacion),
        condensadoTraslado: sumarTrasladoTaxiSpeakers(valor.speakersParticipacion),
        condensadoHospedaje: sumarHospedajeSpeakers(valor.speakersParticipacion),
        condensadoAlimentos: sumarAlimentosSpeakers(valor.speakersParticipacion),
        // Reorganización FormularioEvento (septiembre 2026): antes se fijaba
        // en 0 porque no existía ningún campo de honorarios propio por
        // speaker — ahora se suma desde `montoHonorarios`.
        condensadoHonorariosSpeaker: sumarHonorariosSpeakers(valor.speakersParticipacion),
      };
      const cambio =
        siguiente.condensadoValorParticipacion !== valor.condensadoValorParticipacion ||
      valor.incluirValorParticipacion !== true ||
        valor.incluirValorParticipacion !== true ||
        siguiente.condensadoInscripcion !== valor.condensadoInscripcion ||
        siguiente.condensadoTransporte !== valor.condensadoTransporte ||
        siguiente.condensadoTraslado !== valor.condensadoTraslado ||
        siguiente.condensadoHospedaje !== valor.condensadoHospedaje ||
        siguiente.condensadoAlimentos !== valor.condensadoAlimentos ||
        siguiente.condensadoHonorariosSpeaker !== valor.condensadoHonorariosSpeaker;
      if (cambio) onChange({ ...valor, ...siguiente });
      return;
    }

    // Corrección (septiembre 2026): `presupuestoUnico` se completa con TODOS
    // los campos de `PresupuestoSesion` (el tipo se amplió para tener el
    // mismo detalle que `PresupuestoSpeakerSesion`) — antes fijaba
    // `montoTransporte` en `null` a propósito porque ese campo no existía a
    // nivel de documento; ahora sí existe (`valor.montoTransporte`) y se usa
    // de verdad para el condensado.
    const presupuestoUnico: PresupuestoSesion = {
      transporteNoAplica: valor.transporteNoAplica,
      transporteAcordePolitica: valor.transporteAcordePolitica,
      transporteMotivoNoAcorde: valor.transporteMotivoNoAcorde,
      tipoTransporte: valor.tipoTransporte,
      montoTransporte: valor.montoTransporte,
      cotizacionAdjunta: valor.cotizacionAdjunta,
      taxi: valor.taxi,
      valorEstimadoTaxi: valor.valorEstimadoTaxi,
      hospedajeNoAplica: valor.hospedajeNoAplica,
      hospedajeAcordePolitica: valor.hospedajeAcordePolitica,
      hospedajeMotivoNoAcorde: valor.hospedajeMotivoNoAcorde,
      fechaInicioEstancia: valor.fechaInicioEstancia || null,
      fechaFinEstancia: valor.fechaFinEstancia || null,
      numeroNoches: valor.numeroNoches,
      costoNochePersona: valor.costoNochePersona,
      nombreHotel: valor.nombreHotel,
      categoriaHotel: valor.categoriaHotel,
      motivoLocalidadDistinta: valor.motivoLocalidadDistinta,
      alimentosNoAplica: valor.alimentosNoAplica,
      alimentosAcordePolitica: valor.alimentosAcordePolitica,
      alimentosMotivoNoAcorde: valor.alimentosMotivoNoAcorde,
      montoAlimentosDia: valor.montoAlimentosDia,
      comentariosAlimentos: valor.comentariosAlimentos,
    };
    const hospedaje = esVariasSesiones ? sumarHospedajeSesiones(valor.sesiones) : costoHospedajeSesion(presupuestoUnico);
    const alimentos = esVariasSesiones ? sumarAlimentosSesiones(valor.sesiones) : costoAlimentosSesion(presupuestoUnico);
    // Octubre 2026: si se marca "incluir Valor participación" en el condensado,
    // ese valor pasa a su propia línea y "Inscripción" no lo repite.
    const inscripcion = 0; // el Valor participación tiene su propia línea en el condensado
    const honorarios = valor.honorariosSpeaker ?? 0;
    const transporte = esVariasSesiones ? sumarTransporteSesiones(valor.sesiones) : costoTransporteSesion(presupuestoUnico);
    // Corrección (septiembre 2026): "Traslados en taxi" ahora también se
    // condensa para el caso sin speakers externos (antes solo existía para
    // el presupuesto por speaker) — igual que `sumarTrasladoTaxiSpeakers`.
    const traslado = esVariasSesiones ? sumarTrasladoSesiones(valor.sesiones) : costoTrasladoTaxiSesion(presupuestoUnico);

    const siguiente: Partial<DatosFormularioEvento> = {
      condensadoValorParticipacion: objetivoValorParticipacion,
      incluirValorParticipacion: true,
      condensadoHospedaje: hospedaje,
      condensadoAlimentos: alimentos,
      condensadoInscripcion: inscripcion,
      condensadoHonorariosSpeaker: honorarios,
      condensadoTransporte: transporte,
      condensadoTraslado: traslado,
    };

    const cambio =
      siguiente.condensadoValorParticipacion !== valor.condensadoValorParticipacion ||
      siguiente.condensadoHospedaje !== valor.condensadoHospedaje ||
      siguiente.condensadoAlimentos !== valor.condensadoAlimentos ||
      siguiente.condensadoInscripcion !== valor.condensadoInscripcion ||
      siguiente.condensadoHonorariosSpeaker !== valor.condensadoHonorariosSpeaker ||
      siguiente.condensadoTransporte !== valor.condensadoTransporte ||
      siguiente.condensadoTraslado !== valor.condensadoTraslado;
    if (cambio) onChange({ ...valor, ...siguiente });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hayPresupuestoPorSpeaker,
    valor.speakersParticipacion,
    valor.transporteNoAplica,
    valor.transporteAcordePolitica,
    valor.transporteMotivoNoAcorde,
    valor.tipoTransporte,
    valor.montoTransporte,
    valor.cotizacionAdjunta,
    valor.taxi,
    valor.valorEstimadoTaxi,
    valor.hospedajeNoAplica,
    valor.hospedajeAcordePolitica,
    valor.hospedajeMotivoNoAcorde,
    valor.fechaInicioEstancia,
    valor.fechaFinEstancia,
    valor.numeroNoches,
    valor.costoNochePersona,
    valor.nombreHotel,
    valor.categoriaHotel,
    valor.motivoLocalidadDistinta,
    valor.alimentosNoAplica,
    valor.alimentosAcordePolitica,
    valor.alimentosMotivoNoAcorde,
    valor.montoAlimentosDia,
    valor.comentariosAlimentos,
    valor.inscripcionNoAplica,
    valor.montoInscripcion,
    valor.honorariosSpeaker,
    valor.sesiones,
    esVariasSesiones,
  ]);

  // Corrección (septiembre 2026), pedido explícito del usuario: "Número de
  // noches por persona (autocalculado)" — a nivel de documento (Única
  // sesión) el número de noches se calcula a partir de
  // fechaInicioEstancia/fechaFinEstancia, igual que ya ocurría por speaker
  // (`nochesEntreFechas`, ver `renderPresupuestoSpeaker`). Se guarda en
  // `numeroNoches` (en vez de derivarse en cada uso) porque ese campo ya
  // alimenta `costoHospedajeSesion`/`costoAlimentosSesion` y el cálculo del
  // presupuesto condensado de arriba.
  React.useEffect(() => {
    const noches = nochesEntreFechas(valor.fechaInicioEstancia, valor.fechaFinEstancia);
    if (noches !== valor.numeroNoches) set("numeroNoches", noches);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor.fechaInicioEstancia, valor.fechaFinEstancia]);

  // AJUSTES (septiembre/octubre 2026), pedido explícito: "Número de
  // asistentes" a nivel de documento, cuando el evento es de "Varias
  // sesiones", pasa a ser la sumatoria autocalculada de "Asistentes
  // esperados" de cada sesión (antes quedaba deshabilitado pero sin
  // recalcularse — ver el campo, más abajo, que ya era de solo lectura en
  // ese caso). En "Única sesión" el campo sigue siendo editable y no se
  // toca aquí.
  React.useEffect(() => {
    if (!esVariasSesiones) return;
    const suma = valor.sesiones.reduce((acc, s) => acc + (s.numeroAsistentesEsperados ?? 0), 0);
    if (suma !== valor.numeroAsistentes) set("numeroAsistentes", suma);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esVariasSesiones, valor.sesiones]);

  // A3: si el evento es Virtual, dirección/país/ciudad no tienen sentido
  // como datos a diligenciar — se autocompletan y quedan deshabilitados
  // (ver el JSX de abajo y la exención en calcularErroresEvento). Se
  // dispara solo cuando el valor todavía no está en el estado "virtual" de
  // estos 3 campos, para no pisar una edición en curso en cada render.
  React.useEffect(() => {
    if (valor.modalidadEvento !== "Virtual") return;
    if (valor.direccion === "Virtual" && valor.pais === "N/A" && valor.estadoProvincia === "N/A" && valor.ciudad === "N/A") return;
    onChange({ ...valor, direccion: "Virtual", pais: "N/A", estadoProvincia: "N/A", ciudad: "N/A" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor.modalidadEvento]);

  const totalGeneral = totalCondensado(valor);

  // Entrega "Participación, presupuesto aprobado y anexos" (septiembre
  // 2026), pedido explícito: advertir junto al presupuesto condensado
  // cuando el total (la suma de todos los rubros) supera el monto del
  // presupuesto YA aprobado — solo aplica cuando el evento de verdad está
  // incluido en un presupuesto aprobado con un monto real (no cuando
  // "advertenciaPresupuestoNoAprobado" ya fijó ese monto en 0 a propósito,
  // caso que ya tiene su propia advertencia aparte).
  const excedePresupuestoAprobado =
    valor.incluidoPresupuestoAprobado === true &&
    !valor.advertenciaPresupuestoNoAprobado &&
    valor.montoPresupuestoAprobado !== null &&
    totalGeneral > valor.montoPresupuestoAprobado;
  const excesoPresupuestoAprobado = excedePresupuestoAprobado ? totalGeneral - (valor.montoPresupuestoAprobado ?? 0) : 0;

  // A24 / entrega 2 de esta ronda: al elegir un speaker EXTERNO del
  // repositorio (por casilla — ver `onCambiaSpeakerDeIndice` más abajo), se
  // copia su nombre a `SpeakerParticipacionEvento.nombreSpeaker`, denormalizado
  // para no tener que resolver el repositorio de nuevo en la impresión.

  function actualizarSesion(indice: number, cambios: Partial<SesionEvento>) {
    const sesiones = valor.sesiones.map((s, i) => (i === indice ? { ...s, ...cambios } : s));
    set("sesiones", sesiones);
  }

  // Corrección (septiembre 2026): cuando el cambio incluye
  // fechaInicioEstancia/fechaFinEstancia, `numeroNoches` se recalcula y se
  // guarda junto con el resto — mismo criterio que el useEffect de
  // "Única sesión" (`nochesEntreFechas`), para que "Número de noches por
  // persona (autocalculado)" también sea autocalculado por sesión.
  function actualizarPresupuestoSesion(indice: number, cambios: Partial<PresupuestoSesion>) {
    const sesiones = valor.sesiones.map((s, i) => {
      if (i !== indice) return s;
      const actual = s.presupuesto ?? presupuestoSesionVacio();
      const siguiente = { ...actual, ...cambios };
      if ("fechaInicioEstancia" in cambios || "fechaFinEstancia" in cambios) {
        siguiente.numeroNoches = nochesEntreFechas(siguiente.fechaInicioEstancia, siguiente.fechaFinEstancia);
      }
      return { ...s, presupuesto: siguiente };
    });
    set("sesiones", sesiones);
  }

  function sesionVacia(indice: number): SesionEvento {
    return {
      id: `nueva-${Date.now()}-${indice}`,
      fecha: "",
      lugar: "",
      pais: "",
      estadoProvincia: "",
      ciudad: "",
      numeroAsistentesEsperados: null,
      presupuesto: presupuestoSesionVacio(),
      listaAsistenciaNoAplica: false,
      listaAsistenciaNoAplicaMotivo: "",
    };
  }

  // Reorganización FormularioEvento (septiembre 2026), decisión confirmada:
  // "Número de sesiones*" autogenera filas en `sesiones` (agregando o
  // quitando filas vacías al final cuando el número cambia); los botones
  // "Agregar sesión"/"Quitar sesión" de abajo se mantienen para ajustar el
  // detalle después, y mantienen `numeroSesiones` sincronizado con el largo
  // real del arreglo para que ambos nunca queden desalineados.
  //
  // Entrega "sesiones sin redundancia": al quitar una sesión (por número o
  // por el botón individual), también se quita la fila de presupuesto de
  // esa sesión de CADA speaker que la tuviera marcada — evita dejar
  // referencias a una sesión que ya no existe.
  function quitarPresupuestosDeSesiones(sesionesQuitadasIds: string[]): SpeakerParticipacionEvento[] {
    if (sesionesQuitadasIds.length === 0) return valor.speakersParticipacion;
    return valor.speakersParticipacion.map((s) => ({
      ...s,
      presupuestos: s.presupuestos.filter((p) => p.sesionId === null || !sesionesQuitadasIds.includes(p.sesionId)),
    }));
  }

  function onCambiaNumeroSesiones(n: number | null) {
    const actuales = valor.sesiones;
    let sesiones = actuales;
    let speakersParticipacion = valor.speakersParticipacion;
    if (n !== null && n >= 0 && n !== actuales.length) {
      if (n > actuales.length) {
        sesiones = [...actuales, ...Array.from({ length: n - actuales.length }, (_, i) => sesionVacia(actuales.length + i))];
      } else {
        const quitadas = actuales.slice(n);
        sesiones = actuales.slice(0, n);
        speakersParticipacion = quitarPresupuestosDeSesiones(quitadas.map((s) => s.id));
      }
    }
    onChange({ ...valor, numeroSesiones: n, sesiones, speakersParticipacion });
  }

  function agregarSesion() {
    const sesiones = [...valor.sesiones, sesionVacia(valor.sesiones.length)];
    onChange({ ...valor, sesiones, numeroSesiones: sesiones.length });
  }

  const confirmar = useConfirmar();
  async function confirmarQuitar(titulo: string, mensaje: string) {
    return confirmar({ titulo, mensaje });
  }

  function quitarSesion(indice: number) {
    const quitada = valor.sesiones[indice];
    const sesiones = valor.sesiones.filter((_, i) => i !== indice);
    onChange({
      ...valor,
      sesiones,
      numeroSesiones: sesiones.length,
      speakersParticipacion: quitada ? quitarPresupuestosDeSesiones([quitada.id]) : valor.speakersParticipacion,
    });
  }

  function agregarMuestra() {
    const nueva: MuestraPlaneada = {
      id: `nueva-${Date.now()}-${valor.muestrasPlaneadas.length}`,
      productoId: "",
      nombreProducto: "",
      cantidadAproximada: null,
    };
    set("muestrasPlaneadas", [...valor.muestrasPlaneadas, nueva]);
  }

  function actualizarMuestra(indice: number, productoId: string) {
    const producto = productosDisponibles.find((p) => p.id === productoId);
    const muestras = valor.muestrasPlaneadas.map((m, i) =>
      i === indice ? { ...m, productoId, nombreProducto: producto?.nombre ?? "" } : m,
    );
    set("muestrasPlaneadas", muestras);
  }

  function actualizarCantidadMuestra(indice: number, cantidad: number | null) {
    set(
      "muestrasPlaneadas",
      valor.muestrasPlaneadas.map((m, i) => (i === indice ? { ...m, cantidadAproximada: cantidad } : m)),
    );
  }

  function quitarMuestra(indice: number) {
    set("muestrasPlaneadas", valor.muestrasPlaneadas.filter((_, i) => i !== indice));
  }

  // Ronda de ajustes de formularios (septiembre 2026), entrega 2: modelo de
  // N speakers externos. Cada speaker nuevo arranca con una fila de
  // presupuesto por cada sesión actual (o una sola, `sesionId: null`, en
  // Única sesión) — `sincronizarPresupuestosConSesiones` más abajo mantiene
  // esa correspondencia si se agregan/quitan sesiones después.
  function crearSpeakerVacio(tipo: "interno" | "externo", orden: number): SpeakerParticipacionEvento {
    const presupuestos = esVariasSesiones
      ? valor.sesiones.map((s) => presupuestoSpeakerVacio(s.id))
      : [presupuestoSpeakerVacio(null)];
    return {
      id: `nuevo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      orden,
      tipo,
      speakerId: null,
      nombreSpeaker: "",
      montoInscripcion: null,
      montoHonorarios: null,
      detalleInscripcion: "",
      detalleHonorarios: "",
      facturaModalidad: "",
      presupuestos,
    };
  }

  /**
   * Entrega 22: cambia el número de speakers de UN tipo sin tocar los del otro.
   * Las filas se guardan juntas (internos primero, luego externos) y los
   * índices de `speakersParticipacion` siguen siendo globales.
   */
  function onCambiaNumeroSpeakers(tipo: "interno" | "externo", n: number | null) {
    const objetivo = Math.max(0, n ?? 0);
    const delTipo = valor.speakersParticipacion.filter((sp) => sp.tipo === tipo);
    const otros = valor.speakersParticipacion.filter((sp) => sp.tipo !== tipo);
    const nuevosDelTipo =
      objetivo > delTipo.length
        ? [...delTipo, ...Array.from({ length: objetivo - delTipo.length }, () => crearSpeakerVacio(tipo, 0))]
        : delTipo.slice(0, objetivo);
    const internos = tipo === "interno" ? nuevosDelTipo : otros;
    const externos = tipo === "externo" ? nuevosDelTipo : otros;
    const speakers = [...internos, ...externos].map((sp, orden) => ({ ...sp, orden }));
    onChange({
      ...valor,
      speakersParticipacion: speakers,
      numeroSpeakersExternos: tipo === "externo" ? n : valor.numeroSpeakersExternos,
      nombreSpeakerParticipacion: primerNombreInterno(speakers),
    });
  }

  /** El primer speaker interno alimenta `nombreSpeakerParticipacion` (campo histórico que usan otras vistas). */
  function primerNombreInterno(speakers: SpeakerParticipacionEvento[]): string {
    return speakers.find((sp) => sp.tipo === "interno")?.nombreSpeaker ?? "";
  }

  function actualizarSpeaker(indice: number, cambios: Partial<SpeakerParticipacionEvento>) {
    const speakers = valor.speakersParticipacion.map((s, i) => (i === indice ? { ...s, ...cambios } : s));
    if (cambios.nombreSpeaker !== undefined && valor.speakersParticipacion[indice]?.tipo === "interno") {
      onChange({ ...valor, speakersParticipacion: speakers, nombreSpeakerParticipacion: primerNombreInterno(speakers) });
      return;
    }
    set("speakersParticipacion", speakers);
  }

  /**
   * Entrega 22: "Quién dicta la actividad" ya no es excluyente. Marcar/desmarcar
   * un tipo agrega/quita SOLO las casillas de ese tipo, y `quienDictaActividad`
   * se deriva de las dos banderas.
   */
  function onAlternarTipoSpeaker(tipo: "interno" | "externo", incluye: boolean) {
    const internos = tipo === "interno" ? incluye : valor.incluyeSpeakersInternos;
    const externos = tipo === "externo" ? incluye : valor.incluyeSpeakersExternos;
    const speakers = incluye ? valor.speakersParticipacion : valor.speakersParticipacion.filter((sp) => sp.tipo !== tipo);
    onChange({
      ...valor,
      incluyeSpeakersInternos: internos,
      incluyeSpeakersExternos: externos,
      quienDictaActividad: quienDictaDerivado(internos, externos),
      speakersParticipacion: speakers.map((sp, orden) => ({ ...sp, orden })),
      numeroSpeakersExternos: tipo === "externo" && !incluye ? null : valor.numeroSpeakersExternos,
      nombreSpeakerParticipacion: primerNombreInterno(speakers),
    });
  }

  /** Lista de "Nombre — País" del catálogo; si el speaker guardado ya no está en el catálogo se conserva como opción. */
  function opcionesSpeakersInternos(actual: string): { etiqueta: string }[] {
    const delCatalogo = speakersInternosCatalogo.map((v) => ({ etiqueta: etiquetaSpeakerInterno(parsearSpeakerInterno(v)) }));
    return actual && !delCatalogo.some((o) => o.etiqueta === actual) ? [{ etiqueta: actual }, ...delCatalogo] : delCatalogo;
  }

  function onCambiaSpeakerDeIndice(indice: number, speakerId: string) {
    const speaker = speakersDisponibles.find((s) => s.id === speakerId);
    actualizarSpeaker(indice, { speakerId, nombreSpeaker: speaker ? etiquetaSpeakerResumen(speaker) : "" });
  }

  function quitarSpeaker(indice: number) {
    const quitado = valor.speakersParticipacion[indice];
    const restantes = valor.speakersParticipacion.filter((_, i) => i !== indice).map((sp, orden) => ({ ...sp, orden }));
    onChange({
      ...valor,
      numeroSpeakersExternos: quitado?.tipo === "externo" ? restantes.filter((sp) => sp.tipo === "externo").length : valor.numeroSpeakersExternos,
      speakersParticipacion: restantes,
      nombreSpeakerParticipacion: primerNombreInterno(restantes),
    });
  }

  /**
   * Reorganización FormularioEvento (septiembre 2026), entrega "sesiones
   * sin redundancia": marca/desmarca la participación de un speaker en una
   * sesión — agrega o quita su fila de presupuesto
   * (`PresupuestoSpeakerSesion`) para esa sesión. No todos los speakers
   * externos participan necesariamente en todas las sesiones de un evento
   * de varias sesiones.
   */
  function alternarSesionSpeaker(indiceSpeaker: number, sesionId: string, participa: boolean) {
    actualizarSpeaker(indiceSpeaker, {
      presupuestos: participa
        ? [...valor.speakersParticipacion[indiceSpeaker].presupuestos, presupuestoSpeakerVacio(sesionId)]
        : valor.speakersParticipacion[indiceSpeaker].presupuestos.filter((p) => p.sesionId !== sesionId),
    });
  }

  function actualizarPresupuestoSpeaker(indiceSpeaker: number, sesionId: string | null, cambios: Partial<PresupuestoSpeakerSesion>) {
    const speakers = valor.speakersParticipacion.map((s, i) => {
      if (i !== indiceSpeaker) return s;
      const yaExiste = s.presupuestos.some((p) => p.sesionId === sesionId);
      const presupuestos = yaExiste
        ? s.presupuestos.map((p) => (p.sesionId === sesionId ? { ...p, ...cambios } : p))
        : [...s.presupuestos, { ...presupuestoSpeakerVacio(sesionId), ...cambios }];
      return { ...s, presupuestos };
    });
    set("speakersParticipacion", speakers);
  }

  // Mantiene `speakersParticipacion[].presupuestos` coherente con `valor.sesiones`.
  // Corrección (octubre 2026): ya NO se agrega una fila vacía por cada sesión
  // para todos los speakers — cada speaker declara en cuáles sesiones participa
  // (casillas "Sesiones en las que participa este speaker") y al reabrir un
  // borrador ese efecto re-activaba todas las sesiones con presupuesto vacío.
  // Aquí solo se (a) descartan presupuestos de sesiones que ya no existen,
  // (b) se ajusta al cambiar entre Única y Varias sesiones y (c) se garantiza
  // la fila única en "Única sesión".
  const idsSesionesActuales = esVariasSesiones ? valor.sesiones.map((s) => s.id).join(",") : "";
  React.useEffect(() => {
    if (!usaSpeakers(valor) || valor.speakersParticipacion.length === 0) return;
    let cambio = false;
    const speakers = valor.speakersParticipacion.map((sp) => {
      let presupuestos = sp.presupuestos;
      if (esVariasSesiones) {
        const ids = new Set(valor.sesiones.map((x) => x.id));
        presupuestos = sp.presupuestos.filter((p) => p.sesionId !== null && ids.has(p.sesionId));
        // Venía de "Única sesión" (o es un speaker recién creado sin sesiones marcadas): todas las sesiones, por defecto.
        if (presupuestos.length === 0 && sp.presupuestos.length > 0 && sp.presupuestos.every((p) => p.sesionId === null)) {
          presupuestos = valor.sesiones.map((x) => presupuestoSpeakerVacio(x.id));
        }
      } else {
        presupuestos = [sp.presupuestos.find((p) => p.sesionId === null) ?? sp.presupuestos[0] ?? presupuestoSpeakerVacio(null)].map((p) => ({ ...p, sesionId: null }));
      }
      if (presupuestos.length !== sp.presupuestos.length || presupuestos.some((p, i) => p !== sp.presupuestos[i])) cambio = true;
      return { ...sp, presupuestos };
    });
    if (cambio) set("speakersParticipacion", speakers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor.participacionAcademica, valor.quienDictaActividad, valor.incluyeSpeakersInternos, valor.incluyeSpeakersExternos, esVariasSesiones, idsSesionesActuales, valor.speakersParticipacion.length]);

  /**
   * Mismos campos y mismas reglas de habilitación que el bloque
   * "Transporte, hospedaje y alimentos" de nivel de documento/sesión que
   * existía antes de esta ronda — reutilizados aquí por speaker (y por
   * sesión, si aplica) en vez de duplicar el JSX. "Número de noches" ya no
   * se diligencia a mano: se autocalcula de las fechas de estancia (ver
   * `nochesEntreFechas`).
   */
  /** Entrega 31: tiempo de participación del speaker (horas) — por sesión en "Varias sesiones", único en "Única sesión". */
  function renderHorasParticipacion(indiceSpeaker: number, p: PresupuestoSpeakerSesion) {
    const id = `evento-speaker-${indiceSpeaker}-${p.sesionId ?? "unica"}-horas`;
    const etiqueta = esVariasSesiones ? "Tiempo de participación por sesión (horas)" : "Tiempo de participación (horas)";
    const error = errores[`speaker-${indiceSpeaker}-${p.sesionId ?? "unica"}-horas`];
    return (
      <div className="flex max-w-xs flex-col gap-1.5">
        <Label htmlFor={id}>{etiqueta} *</Label>
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          step="0.25"
          placeholder="Ej.: 1.5"
          value={p.horasParticipacion ?? ""}
          disabled={soloLectura}
          aria-invalid={!!error}
          onChange={(e) => {
            const texto = e.target.value;
            const n = texto === "" ? null : Number(texto);
            actualizarPresupuestoSpeaker(indiceSpeaker, p.sesionId, { horasParticipacion: n !== null && Number.isFinite(n) ? n : null });
          }}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  function renderPresupuestoSpeaker(indiceSpeaker: number, p: PresupuestoSpeakerSesion) {
    const idBase = `evento-speaker-${indiceSpeaker}-${p.sesionId ?? "unica"}`;
    const actualizar = (cambios: Partial<PresupuestoSpeakerSesion>) => actualizarPresupuestoSpeaker(indiceSpeaker, p.sesionId, cambios);
    const noches = nochesEntreFechas(p.fechaInicioEstancia, p.fechaFinEstancia);
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/*
          AJUSTES (septiembre 2026), pedido explícito: "Transporte"/
          "Hospedaje"/"Alimentos" (antes "El transporte no aplica"/etc.) —
          mismo control, pero ahora "Sí" ACTIVA los campos (antes "No"
          activaba, porque la pregunta era la negativa). Se conserva el
          campo interno `transporteNoAplica`/etc. (sin renombrar columna de
          BD): el mapeo Sí/No del toggle se invierte para que coincida con
          la nueva redacción, y la condición de los campos de abajo
          (`!p.transporteNoAplica`) queda igual.
        */}
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>Transporte</Label>
          <ToggleCapsula
            value={p.transporteNoAplica ? "no" : "si"}
            onValueChange={(v) => actualizar({ transporteNoAplica: v === "no" })}
            opciones={[
              { value: "no", label: "No" },
              { value: "si", label: "Sí" },
            ]}
            disabled={soloLectura}
          />
        </div>
        {!p.transporteNoAplica && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${idBase}-tipo-transporte`}>Tipo de transporte *</Label>
              <Select value={p.tipoTransporte} onValueChange={(v) => actualizar({ tipoTransporte: v })} disabled={soloLectura}>
                <SelectTrigger id={`${idBase}-tipo-transporte`}><SelectValue placeholder="Selecciona un tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Terrestre por cuenta propia">Terrestre por cuenta propia</SelectItem>
                  <SelectItem value="Autobús">Autobús</SelectItem>
                  <SelectItem value="Avión Clase Turista">Avión Clase Turista</SelectItem>
                </SelectContent>
              </Select>
              {errores[`${idBase}-tipoTransporte`] && <p className="text-xs text-destructive">{errores[`${idBase}-tipoTransporte`]}</p>}
            </div>
            <Campo label="Valor del transporte *" error={errores[`${idBase}-valorTransporte`]}>
              <InputMoneda
                value={p.valorTransporte ?? null}
                moneda={valor.moneda}
                disabled={soloLectura}
                onChange={(v) => actualizar({ valorTransporte: v })}
              />
            </Campo>
            <div className="flex flex-col gap-1.5">
              <Label>Acorde a la política de viajes</Label>
              <ToggleCapsula
                value={p.transporteAcordePolitica ? "si" : "no"}
                onValueChange={(v) => actualizar({ transporteAcordePolitica: v === "si" })}
                opciones={[
                  { value: "no", label: "No" },
                  { value: "si", label: "Sí" },
                ]}
                disabled={soloLectura}
              />
            </div>
            {!p.transporteAcordePolitica && (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor={`${idBase}-transporte-motivo`}>Señalar por qué</Label>
                <Textarea id={`${idBase}-transporte-motivo`} value={p.transporteMotivoNoAcorde} disabled={soloLectura} onChange={(e) => actualizar({ transporteMotivoNoAcorde: e.target.value })} />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label>Se adjunta cotización del viaje por persona</Label>
              <ToggleCapsula
                value={p.cotizacionAdjunta ? "si" : "no"}
                onValueChange={(v) => actualizar({ cotizacionAdjunta: v === "si" })}
                opciones={[
                  { value: "no", label: "No" },
                  { value: "si", label: "Sí" },
                ]}
                disabled={soloLectura}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Taxi/Traslado</Label>
              <ToggleCapsula
                value={p.taxi ? "si" : "no"}
                onValueChange={(v) => actualizar({ taxi: v === "si" })}
                opciones={[
                  { value: "no", label: "No" },
                  { value: "si", label: "Sí" },
                ]}
                disabled={soloLectura}
              />
            </div>
            {p.taxi && (
              <Campo label="Valor estimado de traslados en taxi">
                <InputMoneda
                  value={p.valorEstimadoTaxi ?? null}
                  moneda={valor.moneda}
                  disabled={soloLectura}
                  onChange={(v) => actualizar({ valorEstimadoTaxi: v })}
                />
              </Campo>
            )}
          </>
        )}

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>Hospedaje</Label>
          <ToggleCapsula
            value={p.hospedajeNoAplica ? "no" : "si"}
            onValueChange={(v) => actualizar({ hospedajeNoAplica: v === "no" })}
            opciones={[
              { value: "no", label: "No" },
              { value: "si", label: "Sí" },
            ]}
            disabled={soloLectura}
          />
        </div>
        {!p.hospedajeNoAplica && (
          <>
            <Campo label="Fecha de inicio de la estancia *" error={errores[`${idBase}-fechaInicioEstancia`]}>
              <Input type="date" value={p.fechaInicioEstancia ?? ""} disabled={soloLectura} onChange={(e) => actualizar({ fechaInicioEstancia: e.target.value || null })} />
            </Campo>
            <Campo label="Fecha de finalización de la estancia *" error={errores[`${idBase}-fechaFinEstancia`]}>
              <Input type="date" value={p.fechaFinEstancia ?? ""} disabled={soloLectura} onChange={(e) => actualizar({ fechaFinEstancia: e.target.value || null })} />
            </Campo>
            <Campo label="Número de noches por persona (autocalculado)">
              <Input type="number" value={noches} disabled readOnly />
            </Campo>
            <Campo label="Costo de noche por persona *" error={errores[`${idBase}-costoNochePersona`]}>
              <InputMoneda
                value={p.costoNochePersona ?? null}
                moneda={valor.moneda}
                disabled={soloLectura}
                onChange={(v) => actualizar({ costoNochePersona: v })}
              />
            </Campo>
            <Campo label="Nombre del hotel *" error={errores[`${idBase}-nombreHotel`]}>
              <Input value={p.nombreHotel} disabled={soloLectura} onChange={(e) => actualizar({ nombreHotel: e.target.value })} />
            </Campo>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${idBase}-categoria-hotel`}>Categoría del hotel *</Label>
              <Select value={p.categoriaHotel} onValueChange={(v) => actualizar({ categoriaHotel: v })} disabled={soloLectura}>
                <SelectTrigger id={`${idBase}-categoria-hotel`}><SelectValue placeholder="Selecciona una categoría" /></SelectTrigger>
                <SelectContent>
                  {categoriasHotel.map((op) => (
                    <SelectItem key={op} value={op}>{op}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errores[`${idBase}-categoriaHotel`] && <p className="text-xs text-destructive">{errores[`${idBase}-categoriaHotel`]}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Acorde a la política de viajes</Label>
              <ToggleCapsula
                value={p.hospedajeAcordePolitica ? "si" : "no"}
                onValueChange={(v) => actualizar({ hospedajeAcordePolitica: v === "si" })}
                opciones={[
                  { value: "no", label: "No" },
                  { value: "si", label: "Sí" },
                ]}
                disabled={soloLectura}
              />
            </div>
            {!p.hospedajeAcordePolitica && (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor={`${idBase}-hospedaje-motivo`}>Señalar por qué</Label>
                <Textarea id={`${idBase}-hospedaje-motivo`} value={p.hospedajeMotivoNoAcorde} disabled={soloLectura} onChange={(e) => actualizar({ hospedajeMotivoNoAcorde: e.target.value })} />
              </div>
            )}
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor={`${idBase}-motivo-localidad`}>Si el hotel está en una localidad distinta al evento, señalar por qué</Label>
              <Textarea id={`${idBase}-motivo-localidad`} value={p.motivoLocalidadDistinta} disabled={soloLectura} onChange={(e) => actualizar({ motivoLocalidadDistinta: e.target.value })} />
            </div>
          </>
        )}

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>Alimentos</Label>
          <ToggleCapsula
            value={p.alimentosNoAplica ? "no" : "si"}
            onValueChange={(v) => actualizar({ alimentosNoAplica: v === "no" })}
            opciones={[
              { value: "no", label: "No" },
              { value: "si", label: "Sí" },
            ]}
            disabled={soloLectura}
          />
        </div>
        {!p.alimentosNoAplica && (
          <>
            <Campo label="Monto autorizado de alimentos por día *" error={errores[`${idBase}-montoAlimentosDia`]}>
              <InputMoneda
                value={p.montoAlimentosDia ?? null}
                moneda={valor.moneda}
                disabled={soloLectura}
                onChange={(v) => actualizar({ montoAlimentosDia: v })}
              />
            </Campo>
            <div className="flex flex-col gap-1.5">
              <Label>Acorde a la política de viajes</Label>
              <ToggleCapsula
                value={p.alimentosAcordePolitica ? "si" : "no"}
                onValueChange={(v) => actualizar({ alimentosAcordePolitica: v === "si" })}
                opciones={[
                  { value: "no", label: "No" },
                  { value: "si", label: "Sí" },
                ]}
                disabled={soloLectura}
              />
            </div>
            {!p.alimentosAcordePolitica && (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor={`${idBase}-alimentos-motivo`}>Señalar por qué</Label>
                <Textarea id={`${idBase}-alimentos-motivo`} value={p.alimentosMotivoNoAcorde} disabled={soloLectura} onChange={(e) => actualizar({ alimentosMotivoNoAcorde: e.target.value })} />
              </div>
            )}
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor={`${idBase}-comentarios-alimentos`}>Comentarios</Label>
              <Textarea id={`${idBase}-comentarios-alimentos`} value={p.comentariosAlimentos} disabled={soloLectura} onChange={(e) => actualizar({ comentariosAlimentos: e.target.value })} />
            </div>
          </>
        )}
      </div>
    );
  }

  /**
   * Corrección (septiembre 2026), pedido explícito del usuario: mismo
   * detalle completo que `renderPresupuestoSpeaker` (arriba), para
   * `PresupuestoSesion` en vez de `PresupuestoSpeakerSesion` — usado
   * cuando NO hay speakers externos, tanto a nivel de documento ("Única
   * sesión") como por cada fila de "Sesiones" ("Varias sesiones"). Los
   * únicos cambios de nombre de campo entre los dos tipos son
   * `montoTransporte` (aquí) vs. `valorTransporte` (por speaker) — se
   * conserva el nombre que ya existía en `PresupuestoSesion` para no
   * requerir renombrar la columna de base de datos.
   */
  function renderPresupuestoSesion(idBase: string, p: PresupuestoSesion, actualizar: (cambios: Partial<PresupuestoSesion>) => void) {
    const noches = nochesEntreFechas(p.fechaInicioEstancia, p.fechaFinEstancia);
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* AJUSTES (septiembre 2026): ver el comentario equivalente en `renderPresupuestoSpeaker` — mismo criterio de renombrado/inversión del toggle. */}
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>Transporte</Label>
          <ToggleCapsula
            value={p.transporteNoAplica ? "no" : "si"}
            onValueChange={(v) => actualizar({ transporteNoAplica: v === "no" })}
            opciones={[
              { value: "no", label: "No" },
              { value: "si", label: "Sí" },
            ]}
            disabled={soloLectura}
          />
        </div>
        {!p.transporteNoAplica && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${idBase}-tipo-transporte`}>Tipo de transporte *</Label>
              <Select value={p.tipoTransporte} onValueChange={(v) => actualizar({ tipoTransporte: v })} disabled={soloLectura}>
                <SelectTrigger id={`${idBase}-tipo-transporte`}><SelectValue placeholder="Selecciona un tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Terrestre por cuenta propia">Terrestre por cuenta propia</SelectItem>
                  <SelectItem value="Autobús">Autobús</SelectItem>
                  <SelectItem value="Avión Clase Turista">Avión Clase Turista</SelectItem>
                </SelectContent>
              </Select>
              {errores[`${idBase}-tipoTransporte`] && <p className="text-xs text-destructive">{errores[`${idBase}-tipoTransporte`]}</p>}
            </div>
            <Campo label="Valor del transporte *" error={errores[`${idBase}-montoTransporte`]}>
              <InputMoneda
                value={p.montoTransporte ?? null}
                moneda={valor.moneda}
                disabled={soloLectura}
                onChange={(v) => actualizar({ montoTransporte: v })}
              />
            </Campo>
            <div className="flex flex-col gap-1.5">
              <Label>Acorde a la política de viajes</Label>
              <ToggleCapsula
                value={p.transporteAcordePolitica ? "si" : "no"}
                onValueChange={(v) => actualizar({ transporteAcordePolitica: v === "si" })}
                opciones={[
                  { value: "no", label: "No" },
                  { value: "si", label: "Sí" },
                ]}
                disabled={soloLectura}
              />
            </div>
            {!p.transporteAcordePolitica && (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor={`${idBase}-transporte-motivo`}>Señalar por qué</Label>
                <Textarea id={`${idBase}-transporte-motivo`} value={p.transporteMotivoNoAcorde} disabled={soloLectura} onChange={(e) => actualizar({ transporteMotivoNoAcorde: e.target.value })} />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label>Se adjunta cotización del viaje por persona</Label>
              <ToggleCapsula
                value={p.cotizacionAdjunta ? "si" : "no"}
                onValueChange={(v) => actualizar({ cotizacionAdjunta: v === "si" })}
                opciones={[
                  { value: "no", label: "No" },
                  { value: "si", label: "Sí" },
                ]}
                disabled={soloLectura}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Taxi/Traslado</Label>
              <ToggleCapsula
                value={p.taxi ? "si" : "no"}
                onValueChange={(v) => actualizar({ taxi: v === "si" })}
                opciones={[
                  { value: "no", label: "No" },
                  { value: "si", label: "Sí" },
                ]}
                disabled={soloLectura}
              />
            </div>
            {p.taxi && (
              <Campo label="Valor estimado de traslados en taxi">
                <InputMoneda
                  value={p.valorEstimadoTaxi ?? null}
                  moneda={valor.moneda}
                  disabled={soloLectura}
                  onChange={(v) => actualizar({ valorEstimadoTaxi: v })}
                />
              </Campo>
            )}
          </>
        )}

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>Hospedaje</Label>
          <ToggleCapsula
            value={p.hospedajeNoAplica ? "no" : "si"}
            onValueChange={(v) => actualizar({ hospedajeNoAplica: v === "no" })}
            opciones={[
              { value: "no", label: "No" },
              { value: "si", label: "Sí" },
            ]}
            disabled={soloLectura}
          />
        </div>
        {!p.hospedajeNoAplica && (
          <>
            <Campo label="Fecha de inicio de la estancia *" error={errores[`${idBase}-fechaInicioEstancia`]}>
              <Input type="date" value={p.fechaInicioEstancia ?? ""} disabled={soloLectura} onChange={(e) => actualizar({ fechaInicioEstancia: e.target.value || null })} />
            </Campo>
            <Campo label="Fecha de finalización de la estancia *" error={errores[`${idBase}-fechaFinEstancia`]}>
              <Input type="date" value={p.fechaFinEstancia ?? ""} disabled={soloLectura} onChange={(e) => actualizar({ fechaFinEstancia: e.target.value || null })} />
            </Campo>
            <Campo label="Número de noches por persona (autocalculado)">
              <Input type="number" value={noches} disabled readOnly />
            </Campo>
            <Campo label="Costo de noche por persona *" error={errores[`${idBase}-costoNochePersona`]}>
              <InputMoneda
                value={p.costoNochePersona ?? null}
                moneda={valor.moneda}
                disabled={soloLectura}
                onChange={(v) => actualizar({ costoNochePersona: v })}
              />
            </Campo>
            <Campo label="Nombre del hotel *" error={errores[`${idBase}-nombreHotel`]}>
              <Input value={p.nombreHotel} disabled={soloLectura} onChange={(e) => actualizar({ nombreHotel: e.target.value })} />
            </Campo>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${idBase}-categoria-hotel`}>Categoría del hotel *</Label>
              <Select value={p.categoriaHotel} onValueChange={(v) => actualizar({ categoriaHotel: v })} disabled={soloLectura}>
                <SelectTrigger id={`${idBase}-categoria-hotel`}><SelectValue placeholder="Selecciona una categoría" /></SelectTrigger>
                <SelectContent>
                  {categoriasHotel.map((op) => (
                    <SelectItem key={op} value={op}>{op}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errores[`${idBase}-categoriaHotel`] && <p className="text-xs text-destructive">{errores[`${idBase}-categoriaHotel`]}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Acorde a la política de viajes</Label>
              <ToggleCapsula
                value={p.hospedajeAcordePolitica ? "si" : "no"}
                onValueChange={(v) => actualizar({ hospedajeAcordePolitica: v === "si" })}
                opciones={[
                  { value: "no", label: "No" },
                  { value: "si", label: "Sí" },
                ]}
                disabled={soloLectura}
              />
            </div>
            {!p.hospedajeAcordePolitica && (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor={`${idBase}-hospedaje-motivo`}>Señalar por qué</Label>
                <Textarea id={`${idBase}-hospedaje-motivo`} value={p.hospedajeMotivoNoAcorde} disabled={soloLectura} onChange={(e) => actualizar({ hospedajeMotivoNoAcorde: e.target.value })} />
              </div>
            )}
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor={`${idBase}-motivo-localidad`}>Si el hotel está en una localidad distinta al evento, señalar por qué</Label>
              <Textarea id={`${idBase}-motivo-localidad`} value={p.motivoLocalidadDistinta} disabled={soloLectura} onChange={(e) => actualizar({ motivoLocalidadDistinta: e.target.value })} />
            </div>
          </>
        )}

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>Alimentos</Label>
          <ToggleCapsula
            value={p.alimentosNoAplica ? "no" : "si"}
            onValueChange={(v) => actualizar({ alimentosNoAplica: v === "no" })}
            opciones={[
              { value: "no", label: "No" },
              { value: "si", label: "Sí" },
            ]}
            disabled={soloLectura}
          />
        </div>
        {!p.alimentosNoAplica && (
          <>
            <Campo label="Monto autorizado de alimentos por día *" error={errores[`${idBase}-montoAlimentosDia`]}>
              <InputMoneda
                value={p.montoAlimentosDia ?? null}
                moneda={valor.moneda}
                disabled={soloLectura}
                onChange={(v) => actualizar({ montoAlimentosDia: v })}
              />
            </Campo>
            <div className="flex flex-col gap-1.5">
              <Label>Acorde a la política de viajes</Label>
              <ToggleCapsula
                value={p.alimentosAcordePolitica ? "si" : "no"}
                onValueChange={(v) => actualizar({ alimentosAcordePolitica: v === "si" })}
                opciones={[
                  { value: "no", label: "No" },
                  { value: "si", label: "Sí" },
                ]}
                disabled={soloLectura}
              />
            </div>
            {!p.alimentosAcordePolitica && (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor={`${idBase}-alimentos-motivo`}>Señalar por qué</Label>
                <Textarea id={`${idBase}-alimentos-motivo`} value={p.alimentosMotivoNoAcorde} disabled={soloLectura} onChange={(e) => actualizar({ alimentosMotivoNoAcorde: e.target.value })} />
              </div>
            )}
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor={`${idBase}-comentarios-alimentos`}>Comentarios</Label>
              <Textarea id={`${idBase}-comentarios-alimentos`} value={p.comentariosAlimentos} disabled={soloLectura} onChange={(e) => actualizar({ comentariosAlimentos: e.target.value })} />
            </div>
          </>
        )}
      </div>
    );
  }

  // Ronda de ajustes de formularios (septiembre 2026), entrega 4: gate de
  // "presupuesto aprobado" con diálogo cancelar/continuar — pedido
  // explícito. El diálogo se muestra derivado directo del estado (sin
  // bandera local aparte): "No" recién elegido y sin advertencia
  // confirmada todavía.
  function onEligeIncluidoPresupuestoAprobado(v: boolean) {
    if (v) {
      onChange({ ...valor, incluidoPresupuestoAprobado: true, advertenciaPresupuestoNoAprobado: false });
    } else {
      onChange({ ...valor, incluidoPresupuestoAprobado: false });
    }
  }

  function confirmarContinuarSinPresupuesto() {
    onChange({ ...valor, advertenciaPresupuestoNoAprobado: true, montoPresupuestoAprobado: 0 });
  }

  function cancelarPorPresupuestoNoAprobado() {
    if (onCancelar) {
      onCancelar();
    } else {
      // Respaldo si nadie provee onCancelar: revierte a "Sí" para no dejar
      // el diálogo bloqueado sin ninguna acción posible.
      onChange({ ...valor, incluidoPresupuestoAprobado: true });
    }
  }

  return (
    <div className="flex flex-col gap-6">
    <Accordion
      type="multiple"
      defaultValue={[
        "general",
        "presupuesto-previo",
        "patrocinio",
        "academica",
        "fechas",
        "sesiones",
        "muestras",
        "articulos",
        "speakers-interno",
        "speakers-externo",
        "transporte-hospedaje-alimentos",
        "condensado",
        "comentarios-especiales",
      ]}
      className="flex flex-col gap-3"
    >
      <SeccionAcordeon value="general" titulo="Solicitante y evento">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label={`${etiqueta("nombreSolicitante")} *`} error={errores.nombreSolicitante}>
            <Input value={valor.nombreSolicitante} disabled={soloLectura} onChange={(e) => set("nombreSolicitante", e.target.value)} />
          </Campo>
          <Campo label="Nombre del superior que aprueba">
            <Input value={valor.nombreSuperiorAprueba} disabled={soloLectura} onChange={(e) => set("nombreSuperiorAprueba", e.target.value)} />
          </Campo>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="evento-empresa">{etiqueta("empresaGrupo")} *</Label>
            <Select value={valor.empresaGrupo} onValueChange={(v) => set("empresaGrupo", v)} disabled={soloLectura}>
              <SelectTrigger id="evento-empresa"><SelectValue placeholder="Selecciona la empresa" /></SelectTrigger>
              <SelectContent>
                {empresas.map((op) => (
                  <SelectItem key={op} value={op}>{op}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errores.empresaGrupo && <p className="text-xs text-destructive">{errores.empresaGrupo}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="evento-tipo">{etiqueta("tipoEvento")} *</Label>
            <Select value={valor.tipoEvento} onValueChange={(v) => set("tipoEvento", v)} disabled={soloLectura}>
              <SelectTrigger id="evento-tipo"><SelectValue placeholder="Selecciona un tipo" /></SelectTrigger>
              <SelectContent>
                {tiposEvento.map((op) => (
                  <SelectItem key={op} value={op}>{op}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errores.tipoEvento && <p className="text-xs text-destructive">{errores.tipoEvento}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="evento-area">{etiqueta("areaEspecialidad")} *</Label>
            <Select value={valor.areaEspecialidad} onValueChange={(v) => set("areaEspecialidad", v)} disabled={soloLectura}>
              <SelectTrigger id="evento-area"><SelectValue placeholder="Selecciona un área" /></SelectTrigger>
              <SelectContent>
                {areasEspecialidad.map((op) => (
                  <SelectItem key={op} value={op}>{op}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errores.areaEspecialidad && <p className="text-xs text-destructive">{errores.areaEspecialidad}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="evento-linea">Línea terapéutica</Label>
            <Select value={valor.lineaTerapeutica} onValueChange={(v) => set("lineaTerapeutica", v)} disabled={soloLectura}>
              <SelectTrigger id="evento-linea"><SelectValue placeholder="Selecciona una línea (opcional)" /></SelectTrigger>
              <SelectContent>
                {lineasTerapeuticas.map((op) => (
                  <SelectItem key={op} value={op}>{op}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Campo label={`${etiqueta("nombreEvento")} *`} error={errores.nombreEvento}>
            <Input value={valor.nombreEvento} disabled={soloLectura} onChange={(e) => set("nombreEvento", e.target.value)} />
          </Campo>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="evento-organizado-por">Organizado por *</Label>
            <Select
              value={valor.organizadoPor}
              onValueChange={(v) => set("organizadoPor", v)}
              disabled={soloLectura}
            >
              <SelectTrigger id="evento-organizado-por"><SelectValue placeholder="Selecciona una opción" /></SelectTrigger>
              <SelectContent>
                {organizadoPorOpciones.map((op) => (
                  <SelectItem key={op} value={op}>{op}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errores.organizadoPor && <p className="text-xs text-destructive">{errores.organizadoPor}</p>}
          </div>
          {esOrganizadoPorOtro(valor.organizadoPor) && (
            <Campo label="Nombre del organizador *" error={errores.nombreOrganizador}>
              <Input value={valor.nombreOrganizador} disabled={soloLectura} onChange={(e) => set("nombreOrganizador", e.target.value)} />
            </Campo>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="evento-moneda">{etiqueta("moneda")} *</Label>
            <Select value={valor.moneda} onValueChange={(v) => set("moneda", v)} disabled={soloLectura}>
              <SelectTrigger id="evento-moneda"><SelectValue placeholder="Selecciona una moneda" /></SelectTrigger>
              <SelectContent>
                {monedas.map((op) => (
                  <SelectItem key={op} value={op}>{op}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errores.moneda && <p className="text-xs text-destructive">{errores.moneda}</p>}
          </div>
          {/*
            AJUSTES (septiembre 2026), pedido explícito: "Objetivos del
            evento" y "No aplica lista de asistencia" (+ "Motivo") se mueven
            aquí, inmediatamente después de Moneda — antes vivían en la
            sección "Fechas, modalidad y lugar". Se conserva la lógica de
            "No aplica lista de asistencia": solo tiene sentido a nivel de
            documento en "Única sesión" (en "Varias sesiones" se captura por
            sesión, ver esa sección más abajo).
          */}
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="evento-objetivos">{etiqueta("objetivosEvento")} *</Label>
            <Textarea id="evento-objetivos" value={valor.objetivosEvento} disabled={soloLectura} onChange={(e) => set("objetivosEvento", e.target.value)} />
            {errores.objetivosEvento && <p className="text-xs text-destructive">{errores.objetivosEvento}</p>}
          </div>
          {/* Entrega 31 (octubre 2026): productos del portafolio relacionados con el evento. */}
          <div className="sm:col-span-2">
            <SelectorProductosEvento
              valor={valor.productosEvento}
              disponibles={productosDisponibles}
              disabled={soloLectura}
              error={errores.productosEvento}
              onChange={(productos) => set("productosEvento", productos)}
            />
          </div>
          {!esVariasSesiones && (
            <>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <div className="flex items-center gap-2">
                  <Checkbox id="evento-lista-asistencia-no-aplica" checked={valor.listaAsistenciaNoAplica} disabled={soloLectura} onCheckedChange={(v) => set("listaAsistenciaNoAplica", v === true)} />
                  <Label htmlFor="evento-lista-asistencia-no-aplica">No aplica lista de asistencia</Label>
                </div>
                <p className="pl-6 text-xs text-slate-500">
                  Márcalo si este evento no requiere firmar lista de asistencia (por ejemplo, un evento virtual sin registro individual). Vas a poder indicar el motivo abajo.
                </p>
              </div>
              {valor.listaAsistenciaNoAplica && (
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="evento-lista-asistencia-motivo">Motivo</Label>
                  <Textarea id="evento-lista-asistencia-motivo" value={valor.listaAsistenciaNoAplicaMotivo} disabled={soloLectura} onChange={(e) => set("listaAsistenciaNoAplicaMotivo", e.target.value)} />
                </div>
              )}
            </>
          )}
        </div>
        {porSeccion.general && (
          <CamposPersonalizadosSeccion campos={porSeccion.general} valores={valor.camposPersonalizados} valoresParaCalculo={valoresParaCalculo} onChange={setCampoPersonalizado} />
        )}
      </SeccionAcordeon>

      {/*
        Reorganización FormularioEvento (septiembre 2026), entrega
        "Participación, presupuesto aprobado y anexos": esta sección
        FUSIONA las antiguas "Inscripción y honorarios" y "Presupuesto
        previo y anexos" (que quedaban separadas y en otro orden) — pedido
        explícito del usuario, que además renombró y reordenó los campos.

        Corrección (ronda siguiente, mismo mes): se retiró el campo
        "Honorarios del speaker" a nivel de evento — pedido explícito del
        usuario porque, dice, los honorarios se diligencian individualmente
        por cada speaker al definir la participación académica y sus
        sesiones. Ese campo solo se mostraba para "Speaker interno" o sin
        participación académica (nunca convivió con el desglose por
        speaker de "Speakers externos"), y de hecho tiene sentido de
        negocio: un empleado (speaker interno) no recibe honorarios, solo
        los speakers HCP externos, que ya tienen su propio campo por
        speaker. No se tocó la columna de base de datos ni el total
        condensado (`condensadoHonorariosSpeaker` en "Presupuesto
        condensado" sigue editable ahí si hiciera falta un ajuste manual);
        solo se quitó el campo de captura aquí, que quedaba en 0 de todas
        formas para ese caso.
      */}
      <SeccionAcordeon value="presupuesto-previo" titulo="Participación, presupuesto aprobado y anexos">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Octubre 2026, pedido explícito: "Centro de costos" se reubica a esta
              sección (justo antes de "¿El evento está incluido en algún
              presupuesto aprobado?") y pasa a ser obligatorio. */}
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="evento-centro-costos">Centro de costos *</Label>
            <Select value={valor.centroCostos} onValueChange={(v) => set("centroCostos", v)} disabled={soloLectura}>
              <SelectTrigger id="evento-centro-costos"><SelectValue placeholder="Selecciona un centro de costos" /></SelectTrigger>
              <SelectContent>
                {centrosCostos.map((op) => (
                  <SelectItem key={op} value={op}>{op}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errores.centroCostos && <p className="text-xs text-destructive">{errores.centroCostos}</p>}
          </div>
          {/*
            Corrección (pedido explícito del usuario): "¿Incluido en
            presupuesto aprobado?" + "Monto del presupuesto aprobado" pasan
            a ir ANTES de "¿Aplica costo de participación?" — antes iban
            después. Ningún campo cambió de comportamiento, solo el orden
            visual dentro de la sección.
          */}
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>¿El evento está incluido en algún presupuesto aprobado? *</Label>
            {/* Ajuste de precisión (septiembre 2026): Patrón A1 (ToggleCapsula),
                "No" predeterminada (opción visible por defecto mientras el
                usuario no interactúa). El valor REAL almacenado sigue siendo
                tri-estado (`boolean | null`, arranca en `null`) para no
                disparar el diálogo de confirmación de abajo apenas se carga
                el formulario — solo cambia cuando el usuario de verdad hace
                clic, a través del mismo `onEligeIncluidoPresupuestoAprobado`
                de siempre. */}
            <ToggleCapsula
              value={valor.incluidoPresupuestoAprobado === true ? "si" : "no"}
              onValueChange={(v) => onEligeIncluidoPresupuestoAprobado(v === "si")}
              opciones={[
                { value: "no", label: "No" },
                { value: "si", label: "Sí" },
              ]}
              disabled={soloLectura}
            />
            {errores.incluidoPresupuestoAprobado && <p className="text-xs text-destructive">{errores.incluidoPresupuestoAprobado}</p>}
            {valor.advertenciaPresupuestoNoAprobado && (
              <p className="text-xs text-amber-700">
                Continuando sin presupuesto aprobado — el monto queda en 0 y se dejará una nota en el documento
                impreso, antes del panel de firmas.
              </p>
            )}
          </div>
          {(valor.incluidoPresupuestoAprobado === true || valor.advertenciaPresupuestoNoAprobado) && (
            <Campo label="Monto del presupuesto aprobado *" error={errores.montoPresupuestoAprobado}>
              <InputMoneda
                value={valor.montoPresupuestoAprobado}
                moneda={valor.moneda}
                disabled={soloLectura || valor.advertenciaPresupuestoNoAprobado}
                onChange={(v) => set("montoPresupuestoAprobado", v)}
              />
            </Campo>
          )}

          {/*
            Corrección: antes era un Switch "La inscripción no aplica" —
            confuso en ambos sentidos, como reportó el usuario: activarlo
            (pensando que "activar" = habilitar el campo) en realidad lo
            ocultaba y fijaba el valor en 0, y dejarlo apagado (el estado
            por defecto) no dejaba claro que así SÍ se podía diligenciar el
            valor. Se reemplaza por una pregunta directa con botones Sí/No
            (mismo patrón que "¿Incluido en presupuesto aprobado?" de
            arriba): "Sí" habilita el campo para digitar el valor; "No"
            conserva el comportamiento de fijarlo en 0 automáticamente. El
            campo interno (`inscripcionNoAplica`) no cambió de nombre ni de
            columna en base de datos, solo la forma en que se presenta y se
            controla.

            Ajuste de precisión (septiembre 2026), pedido explícito: pasa de
            un par de botones Sí/No a Patrón A1 (ToggleCapsula), "No"
            predeterminada — el valor inicial de `inscripcionNoAplica` en
            `VACIO` pasó de `false` a `true` para que arranque mostrando
            "No" (no aplica costo de participación) por defecto.
          */}
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>¿Aplica costo de participación? *</Label>
            <ToggleCapsula
              value={valor.inscripcionNoAplica ? "no" : "si"}
              onValueChange={(v) =>
                v === "no"
                  ? onChange({ ...valor, inscripcionNoAplica: true, montoInscripcion: 0 })
                  : set("inscripcionNoAplica", false)
              }
              opciones={[
                { value: "no", label: "No" },
                { value: "si", label: "Sí" },
              ]}
              disabled={soloLectura}
            />
          </div>

          {!valor.inscripcionNoAplica && (
            <>
              <div className="flex flex-col gap-1.5">
                <Campo label="Valor participación *" error={errores.montoInscripcion}>
                  <InputMoneda
                    value={valor.montoInscripcion}
                    moneda={valor.moneda}
                    disabled={soloLectura}
                    onChange={(v) => set("montoInscripcion", v)}
                  />
                </Campo>
                <p className="text-xs text-muted-foreground">
                  Lo que le cuesta a la empresa participar en el evento (p. ej. inscripción a un congreso médico
                  organizado por una asociación científica). Puede ser 0. Es independiente de la cuota/honorarios de
                  los speakers externos, que se capturan por speaker en "Speakers externos".
                </p>
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="evento-detalle-inscripcion">Detalle participación (qué incluye) *</Label>
                <Textarea id="evento-detalle-inscripcion" value={valor.detalleInscripcion} disabled={soloLectura} onChange={(e) => set("detalleInscripcion", e.target.value)} />
                {errores.detalleInscripcion && <p className="text-xs text-destructive">{errores.detalleInscripcion}</p>}
              </div>
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>Tiene actividad adicional de pago</Label>
            <ToggleCapsula
              value={valor.actividadAdicionalInscripcion ? "si" : "no"}
              onValueChange={(v) => set("actividadAdicionalInscripcion", v === "si")}
              opciones={[
                { value: "no", label: "No" },
                { value: "si", label: "Sí" },
              ]}
              disabled={soloLectura}
            />
          </div>
          {valor.actividadAdicionalInscripcion && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="evento-detalle-actividad-adicional">Detalle</Label>
              <Textarea id="evento-detalle-actividad-adicional" value={valor.detalleActividadAdicional} disabled={soloLectura} onChange={(e) => set("detalleActividadAdicional", e.target.value)} />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            {/* Renombrado: "Tiene actividad incluida en la inscripción" → "...en la participación". */}
            <Label>Tiene actividad incluida en la participación</Label>
            <ToggleCapsula
              value={valor.actividadIncluidaInscripcion ? "si" : "no"}
              onValueChange={(v) => set("actividadIncluidaInscripcion", v === "si")}
              opciones={[
                { value: "no", label: "No" },
                { value: "si", label: "Sí" },
              ]}
              disabled={soloLectura}
            />
          </div>
          {valor.actividadIncluidaInscripcion && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="evento-detalle-actividad-incluida">Detalle</Label>
              <Textarea id="evento-detalle-actividad-incluida" value={valor.detalleActividadIncluida} disabled={soloLectura} onChange={(e) => set("detalleActividadIncluida", e.target.value)} />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>Incluye anexos</Label>
            <ToggleCapsula
              value={valor.anexos ? "si" : "no"}
              onValueChange={(v) => set("anexos", v === "si")}
              opciones={[
                { value: "no", label: "No" },
                { value: "si", label: "Sí" },
              ]}
              disabled={soloLectura}
            />
          </div>
          {valor.anexos && (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="evento-descripcion-anexos">Descripción de los anexos *</Label>
              <Textarea id="evento-descripcion-anexos" value={valor.descripcionAnexos} disabled={soloLectura} onChange={(e) => set("descripcionAnexos", e.target.value)} />
              {errores.descripcionAnexos && <p className="text-xs text-destructive">{errores.descripcionAnexos}</p>}
            </div>
          )}
          {valor.anexos && (
            // AJUSTES (septiembre 2026), pedido explícito: "debe observarse el
            // espacio, diagramado o construido con criterio de diseñador
            // frontdesk experto, para cargar los documentos de soporte del
            // evento" — antes, los dos adjuntos del evento eran dos botones
            // angostos "Adjuntar archivo" idénticos a cualquier otro campo de
            // archivo de la app, sin jerarquía visual propia pese a ser la
            // única sección de soportes documentales de todo el formulario.
            // Se les da un bloque propio con encabezado, descripción y las
            // dos zonas de carga en la variante "dropzone" de `CampoArchivo`
            // (arrastrar y soltar, zona más grande, texto de ayuda) — sin
            // tocar el estilo compacto que ya usan los demás ~15 campos de
            // archivo de la app.
            <div className="flex flex-col gap-3 rounded-lg border bg-muted/10 p-4 sm:col-span-2">
              <div className="flex flex-col gap-0.5">
                <h4 className="text-sm font-semibold">Documentos de soporte del evento</h4>
                <p className="text-xs text-muted-foreground">
                  Carga los archivos que sustentan los anexos descritos arriba — PDF o imagen, ambos opcionales.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <CampoArchivo
                  etiqueta="Carta de invitación"
                  ayuda="PDF o imagen — opcional"
                  valor={valor.cartaInvitacionId}
                  onChange={(id) => set("cartaInvitacionId", id)}
                  aceptar="application/pdf,image/*"
                  disabled={soloLectura}
                  variante="dropzone"
                  contexto={valor.nombreEvento}
                />
                <CampoArchivo
                  etiqueta="Programa académico"
                  ayuda="PDF o imagen — opcional"
                  valor={valor.programaAcademicoId}
                  onChange={(id) => set("programaAcademicoId", id)}
                  aceptar="application/pdf,image/*"
                  contexto={valor.nombreEvento}
                  disabled={soloLectura}
                  variante="dropzone"
                />
              </div>
            </div>
          )}
        </div>
      </SeccionAcordeon>

      {/*
        Octubre 2026, pedido explícito: "¿Habrá patrocinio / pago de viáticos a
        un HCP?" deja de ser un campo de "Solicitante y evento" y pasa a ser
        una sección propia ("Patrocinio / pago de viáticos a HCP") con su
        interruptor Sí/No en el encabezado, igual que "Participación
        académica". Misma lógica de antes: con "Sí" se despliegan los datos del
        HCP relacionado y la justificación (obligatorios); ver además
        `RepositorioEvento.tsx` (certificado de participación).
      */}
      <SeccionAcordeon
        value="patrocinio"
        titulo="Patrocinio / pago de viáticos a HCP"
        accionesHeader={
          <ToggleCapsula
            value={valor.patrocinioHcp ? "si" : "no"}
            onValueChange={(v) => set("patrocinioHcp", v === "si")}
            opciones={[
              { value: "no", label: "No" },
              { value: "si", label: "Sí" },
            ]}
            disabled={soloLectura}
          />
        }
      >
        {valor.patrocinioHcp && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <>
                <Campo label="Nombre completo del HCP relacionado *" error={errores.datosHCP}>
                  <Input value={valor.datosHCP} disabled={soloLectura} onChange={(e) => set("datosHCP", e.target.value)} />
                </Campo>
                <Campo label="Número de documento del HCP relacionado *" error={errores.hcpNumeroDocumento}>
                  <Input value={valor.hcpNumeroDocumento} disabled={soloLectura} onChange={(e) => set("hcpNumeroDocumento", e.target.value)} />
                </Campo>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="evento-hcp-profesion">Profesión del HCP relacionado *</Label>
                  <Select value={valor.hcpProfesion} onValueChange={(v) => set("hcpProfesion", v)} disabled={soloLectura}>
                    <SelectTrigger id="evento-hcp-profesion"><SelectValue placeholder="Selecciona una profesión" /></SelectTrigger>
                    <SelectContent>
                      {profesionesHcp.map((op) => (
                        <SelectItem key={op} value={op}>{op}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errores.hcpProfesion && <p className="text-xs text-destructive">{errores.hcpProfesion}</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="evento-hcp-especialidad">Especialidad del HCP relacionado *</Label>
                  <Select value={valor.hcpEspecialidad} onValueChange={(v) => set("hcpEspecialidad", v)} disabled={soloLectura}>
                    <SelectTrigger id="evento-hcp-especialidad"><SelectValue placeholder="Selecciona una especialidad" /></SelectTrigger>
                    <SelectContent>
                      {especialidadesHcp.map((op) => (
                        <SelectItem key={op} value={op}>{op}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errores.hcpEspecialidad && <p className="text-xs text-destructive">{errores.hcpEspecialidad}</p>}
                </div>
                <Campo label="Dirección del HCP relacionado *" error={errores.hcpDireccion}>
                  <Input value={valor.hcpDireccion} disabled={soloLectura} onChange={(e) => set("hcpDireccion", e.target.value)} />
                </Campo>
                <SelectPaisEstadoCiudad
                  idPrefix="evento-hcp"
                  etiquetaPais="País del HCP relacionado *"
                  etiquetaEstado="Estado/Provincia/Departamento del HCP relacionado *"
                  etiquetaCiudad="Ciudad del HCP relacionado *"
                  valorPais={valor.hcpPais}
                  valorEstado={valor.hcpEstadoProvincia}
                  valorCiudad={valor.hcpCiudad}
                  onChangePaisEstadoCiudad={(hcpPais, hcpEstadoProvincia, hcpCiudad) => onChange({ ...valor, hcpPais, hcpEstadoProvincia, hcpCiudad })}
                  errorPais={errores.hcpPais}
                  errorEstado={errores.hcpEstadoProvincia}
                  errorCiudad={errores.hcpCiudad}
                  disabled={soloLectura}
                />
                <Campo label="Teléfono del HCP relacionado *" error={errores.hcpTelefono}>
                  <Input value={valor.hcpTelefono} disabled={soloLectura} onChange={(e) => set("hcpTelefono", e.target.value)} />
                </Campo>
                <Campo label="Email del HCP relacionado *" error={errores.hcpEmail}>
                  <InputEmail value={valor.hcpEmail} disabled={soloLectura} onChange={(e) => set("hcpEmail", e.target.value)} />
                </Campo>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="evento-justificacion-viaticos">Justificación de patrocinio / pago de viáticos *</Label>
                  <Textarea id="evento-justificacion-viaticos" value={valor.justificacionViaticos} disabled={soloLectura} onChange={(e) => set("justificacionViaticos", e.target.value)} />
                  {errores.justificacionViaticos && <p className="text-xs text-destructive">{errores.justificacionViaticos}</p>}
                </div>
              </>
          </div>
        )}
      </SeccionAcordeon>

      <SeccionAcordeon
        value="academica"
        titulo="Participación académica"
        accionesHeader={
          <ToggleCapsula
            value={valor.participacionAcademica ? "si" : "no"}
            onValueChange={(v) => set("participacionAcademica", v === "si")}
            opciones={[
              { value: "no", label: "No" },
              { value: "si", label: "Sí" },
            ]}
            disabled={soloLectura}
          />
        }
      >
        {valor.participacionAcademica && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="evento-detalle-participacion">Detalle *</Label>
              <Textarea id="evento-detalle-participacion" value={valor.detalleParticipacionAcademica} disabled={soloLectura} onChange={(e) => set("detalleParticipacionAcademica", e.target.value)} />
              {errores.detalleParticipacionAcademica && <p className="text-xs text-destructive">{errores.detalleParticipacionAcademica}</p>}
            </div>
            {/*
              Entrega 22 (octubre 2026): "Quién dicta la actividad" ya NO es
              excluyente — un evento puede tener speakers internos Y externos
              a la vez. Cada tipo que se marca pide su propio número y
              desencadena sus campos: el interno se elige del catálogo
              "Speakers internos" (con su país); el externo, del Repositorio
              de HCPs/Speakers (con cuota, honorarios y factura). Solo los
              externos generan las tareas de documentos (FMV, convenio de pago,
              CAF y Convenio HCP).
            */}
            <fieldset className="flex flex-col gap-3 sm:col-span-2" data-testid="quien-dicta">
              <legend className="mb-1 text-sm font-medium">Quién dicta la actividad * <span className="font-normal text-muted-foreground">(puedes marcar ambos)</span></legend>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2 rounded-md border p-3">
                  <label className="flex items-center gap-2 text-sm font-medium" htmlFor="evento-quien-dicta-interno">
                    <Checkbox
                      id="evento-quien-dicta-interno"
                      checked={valor.incluyeSpeakersInternos}
                      disabled={soloLectura}
                      onCheckedChange={(v) => onAlternarTipoSpeaker("interno", v === true)}
                    />
                    Speaker interno
                  </label>
                  {valor.incluyeSpeakersInternos && (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="evento-numero-speakers-internos">Número de speakers internos que participarán *</Label>
                      <Input
                        id="evento-numero-speakers-internos"
                        type="number"
                        min={1}
                        value={valor.speakersParticipacion.filter((sp) => sp.tipo === "interno").length || ""}
                        disabled={soloLectura}
                        onChange={(e) => onCambiaNumeroSpeakers("interno", e.target.value === "" ? null : Math.max(1, Number(e.target.value)))}
                      />
                      {errores.numeroSpeakersInternos && <p className="text-xs text-destructive">{errores.numeroSpeakersInternos}</p>}
                      <p className="text-xs text-muted-foreground">
                        Para cada speaker interno eliges su nombre del catálogo, en qué sesiones participa y su transporte,
                        hospedaje y alimentación. No genera FMV, convenio, CAF ni tareas de documentos.
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 rounded-md border p-3">
                  <label className="flex items-center gap-2 text-sm font-medium" htmlFor="evento-quien-dicta-externo">
                    <Checkbox
                      id="evento-quien-dicta-externo"
                      checked={valor.incluyeSpeakersExternos}
                      disabled={soloLectura}
                      onCheckedChange={(v) => onAlternarTipoSpeaker("externo", v === true)}
                    />
                    Speaker externo
                  </label>
                  {valor.incluyeSpeakersExternos && (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="evento-numero-speakers">Número de speakers externos que participarán *</Label>
                      <Input
                        id="evento-numero-speakers"
                        type="number"
                        min={1}
                        value={valor.numeroSpeakersExternos ?? ""}
                        disabled={soloLectura}
                        onChange={(e) => onCambiaNumeroSpeakers("externo", e.target.value === "" ? null : Math.max(1, Number(e.target.value)))}
                      />
                      {errores.numeroSpeakersExternos && <p className="text-xs text-destructive">{errores.numeroSpeakersExternos}</p>}
                      <p className="text-xs text-muted-foreground">
                        Al guardar la solicitud, se desencadenará una tarea para Dirección Médica pidiendo generar, para
                        cada speaker externo: MD FMV Checklist, Convenio de pago a HCP, CAF y Convenio HCP.
                      </p>
                    </div>
                  )}
                </div>
              </div>
              {errores.quienDictaActividad && <p className="text-xs text-destructive">{errores.quienDictaActividad}</p>}
            </fieldset>
          </div>
        )}
      </SeccionAcordeon>

      <SeccionAcordeon value="fechas" titulo="Fechas, modalidad y lugar">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label={`${etiqueta("fechaInicioEvento")} *`} error={errores.fechaInicioEvento}>
            <Input type="date" value={valor.fechaInicioEvento} disabled={soloLectura} onChange={(e) => set("fechaInicioEvento", e.target.value)} />
          </Campo>
          <Campo label={`${etiqueta("fechaFinEvento")} *`} error={errores.fechaFinEvento}>
            <Input type="date" value={valor.fechaFinEvento} disabled={soloLectura} onChange={(e) => set("fechaFinEvento", e.target.value)} />
          </Campo>
          {/*
            Reorganización FormularioEvento (septiembre 2026): "Formato"
            (antes "Modalidad del evento") pasa a capturarse ANTES que
            "Modalidad" (antes "Modalidad de sesiones") — condiciona cómo se
            piden dirección/país/ciudad, así que se pregunta primero. Ambos
            pasan de opcionales a obligatorios; "Formato" suma la opción
            "Mixto" (se comporta igual que "Presencial" en esta sección).
          */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="evento-modalidad-evento">Formato *</Label>
            {/* Ajuste de precisión (septiembre 2026), pedido explícito:
                "Formato" vuelve a un <select>/<Select> (la ronda visual
                anterior lo había pasado a cápsula A1) — el valor
                almacenado sigue siendo "Mixto" (ver enums.ts), pero se
                muestra como "Híbrido (Presencial y Transmisión)". */}
            <Select
              value={valor.modalidadEvento}
              onValueChange={(v) => set("modalidadEvento", v as DatosFormularioEvento["modalidadEvento"])}
              disabled={soloLectura}
            >
              <SelectTrigger id="evento-modalidad-evento"><SelectValue placeholder="Selecciona una opción" /></SelectTrigger>
              <SelectContent>
                {MODALIDAD_EVENTO.map((m) => (
                  <SelectItem key={m} value={m}>{ETIQUETA_MODALIDAD_EVENTO[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errores.modalidadEvento && <p className="text-xs text-destructive">{errores.modalidadEvento}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="evento-modalidad-sesiones">Modalidad *</Label>
            <Select
              value={valor.modalidadSesiones}
              onValueChange={(v) => set("modalidadSesiones", v as DatosFormularioEvento["modalidadSesiones"])}
              disabled={soloLectura}
            >
              <SelectTrigger id="evento-modalidad-sesiones"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Única sesión">Única sesión</SelectItem>
                <SelectItem value="Varias sesiones">Varias sesiones</SelectItem>
              </SelectContent>
            </Select>
            {errores.modalidadSesiones && <p className="text-xs text-destructive">{errores.modalidadSesiones}</p>}
          </div>
          {esVariasSesiones && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="evento-numero-sesiones">Número de sesiones *</Label>
              <Input
                id="evento-numero-sesiones"
                type="number"
                min={2}
                value={valor.numeroSesiones ?? ""}
                disabled={soloLectura}
                onChange={(e) => onCambiaNumeroSesiones(e.target.value === "" ? null : Math.max(2, Number(e.target.value)))}
              />
              {errores.numeroSesiones && <p className="text-xs text-destructive">{errores.numeroSesiones}</p>}
              <p className="text-xs text-muted-foreground">
                Genera automáticamente esa cantidad de filas en "Sesiones" más abajo — puedes seguir ajustándolas ahí
                con "Agregar sesión"/"Quitar sesión".
              </p>
            </div>
          )}
          {esVariasSesiones ? (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Dirección, país, ciudad y número de asistentes se capturan por sesión más abajo — cada sesión de un
              evento de varias sesiones puede tener su propio lugar.
            </p>
          ) : valor.modalidadEvento === "Virtual" ? (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Evento virtual: dirección, país y ciudad se completan automáticamente.
            </p>
          ) : null}
          <Campo label={`${etiqueta("direccion")}${esVariasSesiones || valor.modalidadEvento === "Virtual" ? "" : " *"}`} error={errores.direccion}>
            <Input
              value={valor.direccion}
              disabled={soloLectura || esVariasSesiones || valor.modalidadEvento === "Virtual"}
              onChange={(e) => set("direccion", e.target.value)}
            />
          </Campo>
          {valor.modalidadEvento === "Virtual" ? (
            <>
              <Campo label={etiqueta("pais")}>
                <Input value={valor.pais} disabled />
              </Campo>
              <Campo label={etiqueta("estadoProvincia")}>
                <Input value={valor.estadoProvincia} disabled />
              </Campo>
              <Campo label={etiqueta("ciudad")}>
                <Input value={valor.ciudad} disabled />
              </Campo>
            </>
          ) : (
            <>
              <SelectPaisEstadoCiudad
                idPrefix="evento"
                etiquetaPais={`${etiqueta("pais")}${esVariasSesiones ? "" : " *"}`}
                etiquetaEstado={`${etiqueta("estadoProvincia")}${esVariasSesiones ? "" : " *"}`}
                etiquetaCiudad={`${etiqueta("ciudad")}${esVariasSesiones ? "" : " *"}`}
                valorPais={valor.pais}
                valorEstado={valor.estadoProvincia}
                valorCiudad={valor.ciudad}
                onChangePaisEstadoCiudad={(pais, estadoProvincia, ciudad) => onChange({ ...valor, pais, estadoProvincia, ciudad })}
                errorPais={errores.pais}
                errorEstado={errores.estadoProvincia}
                errorCiudad={errores.ciudad}
                disabled={soloLectura || esVariasSesiones}
              />
            </>
          )}
          <Campo label={esVariasSesiones ? "Número de asistentes (autocalculado — suma de todas las sesiones)" : "Número de asistentes"}>
            <Input
              type="number"
              min={0}
              value={valor.numeroAsistentes ?? ""}
              disabled={soloLectura || esVariasSesiones}
              onChange={(e) => set("numeroAsistentes", e.target.value === "" ? null : Math.max(0, Number(e.target.value)))}
            />
          </Campo>
          {/*
            AJUSTES (septiembre 2026), pedido explícito: "Objetivos del
            evento", "No aplica lista de asistencia"/"Motivo" y
            "Justificación de viáticos" (renombrada) se movieron a la
            sección "Solicitante y evento", inmediatamente después de
            Moneda — ver ese bloque más arriba.
          */}
        </div>
      </SeccionAcordeon>

      {/*
        Reorganización FormularioEvento (septiembre 2026), entrega
        "sesiones sin redundancia": esta sección se movió antes de
        "Speakers externos" (antes iba mucho más abajo) — decisión de UX:
        la información propia de cada sesión (fecha, lugar, país, ciudad,
        estado, asistentes esperados, lista de asistencia) debe existir
        ANTES de que el usuario tenga que decidir, por speaker, en cuáles
        sesiones participa cada uno. Antes, el bloque de presupuesto por
        speaker y por sesión (en "Speakers externos") aparecía primero y
        forzaba a diligenciar presupuesto para sesiones que todavía no
        tenían ni fecha ni lugar definidos.
      */}
      {esVariasSesiones && (
        <SeccionAcordeon
          value="sesiones"
          titulo="Sesiones"
          descripcion="Cada sesión tiene su propio lugar, fecha, lista de asistencia y — cuando no hay speakers externos — su propio presupuesto de transporte/hospedaje/alimentos. Los speakers externos eligen más abajo en cuáles sesiones participan."
        >
          <div className="flex flex-col gap-4">
            {/*
              Reorganización FormularioEvento (septiembre 2026), decisión
              confirmada: la "Modalidad de factura" que antes vivía aquí (un
              único campo a nivel de todo el evento) se movió a la sección
              "Speakers externos", ahora por speaker — ver
              `evento-speaker-{i}-factura`. `Evento.facturaModalidad` se
              conserva por compatibilidad con documentos ya guardados, pero
              deja de editarse desde el formulario.
            */}
            {errores.sesiones && <p className="text-xs text-destructive">{errores.sesiones}</p>}
            {valor.sesiones.map((s, i) => (
              <div key={s.id} className="flex flex-col gap-3 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Sesión {i + 1}</h4>
                  {!soloLectura && (
                    <Button type="button" variant="ghost" size="sm" onClick={async () => { if (await confirmarQuitar("Quitar sesión", "¿Quitar esta sesión? Se perderán sus datos y los presupuestos de speakers asociados.")) quitarSesion(i); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`sesion-${i}-fecha`}>Fecha</Label>
                    <Input id={`sesion-${i}-fecha`} type="date" value={s.fecha ?? ""} disabled={soloLectura} onChange={(e) => actualizarSesion(i, { fecha: e.target.value })} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`sesion-${i}-lugar`}>Lugar *</Label>
                    <Input id={`sesion-${i}-lugar`} value={s.lugar} disabled={soloLectura} onChange={(e) => actualizarSesion(i, { lugar: e.target.value })} />
                    {errores[`sesion-${i}-lugar`] && <p className="text-xs text-destructive">{errores[`sesion-${i}-lugar`]}</p>}
                  </div>
                  {valor.modalidadEvento === "Virtual" ? (
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <Label>País / Estado / Ciudad</Label>
                      <Input value="N/A (evento virtual)" disabled />
                    </div>
                  ) : (
                    <SelectPaisEstadoCiudad
                      idPrefix={`sesion-${i}`}
                      etiquetaPais={`País de la sesión ${i + 1} *`}
                      etiquetaEstado={`Estado/Provincia/Departamento de la sesión ${i + 1} *`}
                      etiquetaCiudad={`Ciudad de la sesión ${i + 1} *`}
                      valorPais={s.pais}
                      valorEstado={s.estadoProvincia}
                      valorCiudad={s.ciudad}
                      onChangePaisEstadoCiudad={(pais, estadoProvincia, ciudad) => actualizarSesion(i, { pais, estadoProvincia, ciudad })}
                      errorPais={errores[`sesion-${i}-pais`]}
                      errorEstado={errores[`sesion-${i}-estado`]}
                      errorCiudad={errores[`sesion-${i}-ciudad`]}
                      disabled={soloLectura}
                    />
                  )}
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`sesion-${i}-asistentes`}>Asistentes esperados</Label>
                    <Input
                      id={`sesion-${i}-asistentes`}
                      type="number"
                      min={0}
                      value={s.numeroAsistentesEsperados ?? ""}
                      disabled={soloLectura}
                      onChange={(e) => actualizarSesion(i, { numeroAsistentesEsperados: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })}
                    />
                  </div>
                </div>

                {/*
                  Reorganización FormularioEvento (septiembre 2026), entrega
                  "sesiones sin redundancia": la Lista de Asistencia pasa a
                  asociarse a CADA sesión (antes era un único campo a nivel
                  de todo el evento, que se conserva solo para "Única
                  sesión" — ver la sección "Fechas, modalidad y lugar"). Los
                  campos `listaAsistenciaNoAplica`/`Motivo` de
                  `SesionEvento` ya existían en el tipo pero no se
                  exponían todavía en el formulario.
                */}
                <div className="flex flex-col gap-1 rounded-md bg-muted/40 p-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={s.listaAsistenciaNoAplica}
                      disabled={soloLectura}
                      onCheckedChange={(v) => actualizarSesion(i, { listaAsistenciaNoAplica: v === true })}
                    />
                    No aplica lista de asistencia
                  </label>
                  <p className="pl-6 text-xs text-slate-500">
                    Márcalo si esta sesión no requiere firmar lista de asistencia. Vas a poder indicar el motivo abajo.
                  </p>
                  {s.listaAsistenciaNoAplica && (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`sesion-${i}-lista-asistencia-motivo`}>Motivo</Label>
                      <Textarea
                        id={`sesion-${i}-lista-asistencia-motivo`}
                        value={s.listaAsistenciaNoAplicaMotivo}
                        disabled={soloLectura}
                        onChange={(e) => actualizarSesion(i, { listaAsistenciaNoAplicaMotivo: e.target.value })}
                      />
                    </div>
                  )}
                </div>

                {/*
                  Corrección (septiembre 2026), pedido explícito del
                  usuario: este bloque tenía un detalle MUCHO más reducido
                  que el de "Speakers externos" (solo 3 interruptores
                  "no aplica" + un monto cada uno) — ahora usa el mismo
                  detalle completo (Acorde a la política de viajes, Tipo
                  de transporte, cotización adjunta, taxi, fechas de
                  estancia, nombre/categoría de hotel, motivo de localidad
                  distinta, comentarios), igual que cuando hay
                  participación académica con speakers externos.
                */}
                {!usaSpeakers(valor) && (
                  <div className="rounded-md bg-muted/40 p-2">
                    <p className="mb-2 text-xs font-semibold text-muted-foreground">Transporte, hospedaje y alimentos de esta sesión</p>
                    {renderPresupuestoSesion(`sesion-${i}-presupuesto`, s.presupuesto, (cambios) => actualizarPresupuestoSesion(i, cambios))}
                  </div>
                )}
              </div>
            ))}
            {!soloLectura && (
              <Button type="button" variant="outline" size="sm" className="w-fit gap-1.5" onClick={agregarSesion}>
                <Plus className="h-3.5 w-3.5" /> Agregar sesión
              </Button>
            )}
          </div>
        </SeccionAcordeon>
      )}

      <SeccionAcordeon
        value="muestras"
        titulo="Muestras médicas"
        accionesHeader={
          // Ajuste de precisión (septiembre 2026), pedido explícito:
          // "Patrón A1" con opciones "No" y "Sí" (en ese orden), precargando
          // "No" por defecto (ya era el valor por defecto de
          // `entregaMuestrasMedicas` — ver `VACIO` más abajo).
          <ToggleCapsula
            value={valor.entregaMuestrasMedicas ? "si" : "no"}
            onValueChange={(v) => set("entregaMuestrasMedicas", v === "si")}
            opciones={[
              { value: "no", label: "No" },
              { value: "si", label: "Sí" },
            ]}
            disabled={soloLectura}
          />
        }
      >
        {valor.entregaMuestrasMedicas && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="evento-detalle-muestras">Detalle *</Label>
              <Textarea id="evento-detalle-muestras" value={valor.detalleMuestrasMedicas} disabled={soloLectura} onChange={(e) => set("detalleMuestrasMedicas", e.target.value)} />
              {errores.detalleMuestrasMedicas && <p className="text-xs text-destructive">{errores.detalleMuestrasMedicas}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label>Productos planeados</Label>
              {valor.muestrasPlaneadas.map((m, i) => (
                <div key={m.id} className="flex flex-wrap items-end gap-2 rounded-md border p-2">
                  <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
                    <Label htmlFor={`evento-muestra-producto-${i}`}>Producto</Label>
                    <Select value={m.productoId} onValueChange={(v) => actualizarMuestra(i, v)} disabled={soloLectura}>
                      <SelectTrigger id={`evento-muestra-producto-${i}`}><SelectValue placeholder="Selecciona un producto" /></SelectTrigger>
                      <SelectContent>
                        {productosDisponibles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errores[`muestra-${i}-producto`] && <p className="text-xs text-destructive">{errores[`muestra-${i}-producto`]}</p>}
                  </div>
                  <div className="flex w-40 flex-col gap-1.5">
                    <Label htmlFor={`evento-muestra-cantidad-${i}`}>Cantidad aproximada</Label>
                    <Input
                      id={`evento-muestra-cantidad-${i}`}
                      type="number"
                      min={0}
                      value={m.cantidadAproximada ?? ""}
                      disabled={soloLectura}
                      onChange={(e) => actualizarCantidadMuestra(i, e.target.value === "" ? null : Math.max(0, Number(e.target.value)))}
                    />
                  </div>
                  {!soloLectura && (
                    <Button type="button" variant="ghost" size="sm" onClick={async () => { if (await confirmarQuitar("Quitar muestra", "¿Quitar esta muestra médica planeada?")) quitarMuestra(i); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {!soloLectura && (
                <Button type="button" variant="outline" size="sm" className="w-fit gap-1.5" onClick={agregarMuestra}>
                  <Plus className="h-3.5 w-3.5" /> Agregar producto
                </Button>
              )}
            </div>
          </div>
        )}
      </SeccionAcordeon>

      <SeccionAcordeon
        value="articulos"
        titulo="Artículos promocionales"
        accionesHeader={
          // Ajuste de precisión (septiembre 2026), pedido explícito:
          // "Muestras médicas y Artículos promocionales" al patrón A1 —
          // mismo criterio ya aplicado en "Muestras médicas".
          <ToggleCapsula
            value={valor.entregaArticulosPromocionales ? "si" : "no"}
            onValueChange={(v) => set("entregaArticulosPromocionales", v === "si")}
            opciones={[
              { value: "no", label: "No" },
              { value: "si", label: "Sí" },
            ]}
            disabled={soloLectura}
          />
        }
      >
        {valor.entregaArticulosPromocionales && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="evento-detalle-articulos">Detalle *</Label>
            <Textarea id="evento-detalle-articulos" value={valor.detalleArticulosPromocionales} disabled={soloLectura} onChange={(e) => set("detalleArticulosPromocionales", e.target.value)} />
            {errores.detalleArticulosPromocionales && <p className="text-xs text-destructive">{errores.detalleArticulosPromocionales}</p>}
          </div>
        )}
      </SeccionAcordeon>

      {/*
        Corrección (octubre 2026), reportada por el usuario: al marcar
        "Participación académica" = Sí y "Quién dicta la actividad" =
        "Speaker externo", las secciones "Transporte"/"Hospedaje"/
        "Alimentos" de nivel de documento (justo arriba, `esUnicaSesion &&
        valor.quienDictaActividad !== "Speaker externo"`) desaparecen —
        a propósito: ese presupuesto se captura POR SPEAKER en esta
        sección (cada speaker externo puede tener transporte/hotel/
        alimentación distintos), no a nivel de todo el documento. El
        racional del diseño es correcto, pero esta sección entera
        también se mantenía oculta mientras `speakersParticipacion`
        estuviera vacío (es decir, hasta que el usuario llenara "Número
        de speakers externos" más arriba) — así que, en ese tramo
        intermedio, NINGUNA de las dos secciones era visible: parecía que
        el campo simplemente se había borrado. Ahora la sección siempre
        se muestra en cuanto se elige "Speaker externo", con un mensaje
        de guía mientras no se haya indicado el número de speakers.
      */}
      {usaSpeakers(valor) && (["interno", "externo"] as const).map((tipoBloque) => {
        const esExternoTipo = tipoBloque === "externo";
        if (esExternoTipo ? !hayExternosForm : !hayInternosForm) return null;
        const filasDelTipo = valor.speakersParticipacion.map((sp, i) => ({ sp, i })).filter(({ sp }) => sp.tipo === tipoBloque);
        return (
        <SeccionAcordeon
          key={tipoBloque}
          value={`speakers-${tipoBloque}`}
          titulo={esExternoTipo ? "Speakers externos — identificación, cuota y presupuesto" : "Speakers internos — identificación y presupuesto"}
          descripcion={`Cada casilla corresponde a un speaker.${esVariasSesiones ? " Elige en cuáles sesiones participa cada uno — no todos tienen que participar en todas." : " El transporte, hospedaje y alimentos se capturan por speaker."}`}
        >
          {filasDelTipo.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Indica arriba, en "Número de speakers {esExternoTipo ? "externos" : "internos"} que participarán", cuántos son — aquí
              aparecerá una casilla por cada uno, con su identificación{esExternoTipo ? ", cuota" : ""} y su propio presupuesto de
              transporte, hospedaje y alimentos.
            </p>
          ) : (
          <div className="flex flex-col gap-6">
            {filasDelTipo.map(({ sp, i: indiceSpeaker }, posicionEnTipo) => (
              <div key={sp.id} className="flex flex-col gap-4 rounded-md border p-3" data-testid={`speaker-${tipoBloque}-${posicionEnTipo + 1}`}>
                {!esExternoTipo ? (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`evento-speaker-${indiceSpeaker}`}>Nombre del speaker interno {posicionEnTipo + 1} *</Label>
                    {/* Entrega 22: el speaker interno se elige del catálogo "Speakers internos" y la lista muestra su país. */}
                    <Select
                      value={sp.nombreSpeaker}
                      onValueChange={(v) => actualizarSpeaker(indiceSpeaker, { nombreSpeaker: v })}
                      disabled={soloLectura}
                    >
                      <SelectTrigger id={`evento-speaker-${indiceSpeaker}`}><SelectValue placeholder="Selecciona un speaker interno" /></SelectTrigger>
                      <SelectContent>
                        {opcionesSpeakersInternos(sp.nombreSpeaker).map((o) => (
                          <SelectItem key={o.etiqueta} value={o.etiqueta}>{o.etiqueta}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {speakersInternosCatalogo.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        El catálogo "Speakers internos" está vacío. Un administrador puede cargarlo en Configuración de campos → Catálogos de opciones.
                      </p>
                    )}
                    {errores[`speaker-${indiceSpeaker}-id`] && <p className="text-xs text-destructive">{errores[`speaker-${indiceSpeaker}-id`]}</p>}
                  </div>
                ) : (
                  <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`evento-speaker-${indiceSpeaker}`}>Nombre del HCP/Speaker {posicionEnTipo + 1} *</Label>
                  <Select
                    value={sp.speakerId ?? ""}
                    onValueChange={(v) => onCambiaSpeakerDeIndice(indiceSpeaker, v)}
                    disabled={soloLectura}
                  >
                    <SelectTrigger id={`evento-speaker-${indiceSpeaker}`}><SelectValue placeholder="Selecciona un speaker del repositorio" /></SelectTrigger>
                    <SelectContent>
                      {speakersDisponibles.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{etiquetaSpeakerResumen(s)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errores[`speaker-${indiceSpeaker}-id`] && <p className="text-xs text-destructive">{errores[`speaker-${indiceSpeaker}-id`]}</p>}
                </div>

                  </>
                )}

                {esExternoTipo && (
                  <>
                {/*
                  Corrección (entrega "Participación, presupuesto aprobado y
                  anexos", septiembre 2026): estos campos ya NO se ocultan
                  cuando "La inscripción no aplica" (evento) está en Sí — ese
                  interruptor es del "Valor participación" del EVENTO, un
                  concepto distinto de la cuota/honorarios de CADA speaker
                  externo, que siempre aplican mientras haya speakers
                  externos. Antes quedaban ocultos (y sin validar) por error
                  cuando se usaba ese interruptor, ver `calcularErroresEvento`.
                */}
                <div className="grid grid-cols-1 gap-3 rounded-md bg-muted/40 p-2 sm:grid-cols-2">
                  <Campo label="Cuota de inscripción *" error={errores[`speaker-${indiceSpeaker}-inscripcion`]}>
                    <InputMoneda
                      value={sp.montoInscripcion ?? null}
                      moneda={valor.moneda}
                      disabled={soloLectura}
                      onChange={(v) =>
                        actualizarSpeaker(indiceSpeaker, {
                          montoInscripcion: v,
                          // Si el valor deja de ser > 0 el detalle ya no aplica: se limpia.
                          ...(!((v ?? 0) > 0) ? { detalleInscripcion: "" } : {}),
                        })
                      }
                    />
                  </Campo>
                  <Campo label="Honorarios del speaker *" error={errores[`speaker-${indiceSpeaker}-honorarios`]}>
                    <InputMoneda
                      value={sp.montoHonorarios ?? null}
                      moneda={valor.moneda}
                      disabled={soloLectura}
                      onChange={(v) =>
                        actualizarSpeaker(indiceSpeaker, {
                          montoHonorarios: v,
                          ...(!((v ?? 0) > 0) ? { detalleHonorarios: "" } : {}),
                        })
                      }
                    />
                  </Campo>
                  {/* Octubre 2026: cada "Detallar lo que incluye" se activa solo si su valor es > 0. */}
                  {(sp.montoInscripcion ?? 0) > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`evento-speaker-${indiceSpeaker}-detalle-inscripcion`}>Detallar lo que incluye la cuota de inscripción *</Label>
                      <Input
                        id={`evento-speaker-${indiceSpeaker}-detalle-inscripcion`}
                        value={sp.detalleInscripcion}
                        disabled={soloLectura}
                        onChange={(e) => actualizarSpeaker(indiceSpeaker, { detalleInscripcion: e.target.value })}
                      />
                      {errores[`speaker-${indiceSpeaker}-detalle-inscripcion`] && (
                        <p className="text-xs text-destructive">{errores[`speaker-${indiceSpeaker}-detalle-inscripcion`]}</p>
                      )}
                    </div>
                  )}
                  {(sp.montoHonorarios ?? 0) > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`evento-speaker-${indiceSpeaker}-detalle-honorarios`}>Detallar lo que incluyen los honorarios *</Label>
                      <Input
                        id={`evento-speaker-${indiceSpeaker}-detalle-honorarios`}
                        value={sp.detalleHonorarios ?? ""}
                        disabled={soloLectura}
                        onChange={(e) => actualizarSpeaker(indiceSpeaker, { detalleHonorarios: e.target.value })}
                      />
                      {errores[`speaker-${indiceSpeaker}-detalle-honorarios`] && (
                        <p className="text-xs text-destructive">{errores[`speaker-${indiceSpeaker}-detalle-honorarios`]}</p>
                      )}
                    </div>
                  )}
                </div>

                {/*
                  Reorganización FormularioEvento (septiembre 2026), decisión
                  confirmada: la modalidad de factura pasa a ser por speaker
                  (antes era un único campo a nivel de todo el evento, solo
                  visible en eventos de varias sesiones) — cada speaker
                  externo elige si recibirá una sola factura por el total de
                  su participación o una factura individual por cada sesión
                  en la que participe.
                */}
                <div className="flex max-w-xs flex-col gap-1.5">
                  <Label htmlFor={`evento-speaker-${indiceSpeaker}-factura`}>Modalidad de factura</Label>
                  <Select
                    value={sp.facturaModalidad}
                    onValueChange={(v) => actualizarSpeaker(indiceSpeaker, { facturaModalidad: v })}
                    disabled={soloLectura}
                  >
                    <SelectTrigger id={`evento-speaker-${indiceSpeaker}-factura`}><SelectValue placeholder="Selecciona una opción" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Factura única">Factura única (toda su participación)</SelectItem>
                      <SelectItem value="Factura por sesión">Factura por sesión</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Define los espacios que se habilitarán para este speaker en el Repositorio del Evento al cargar
                    facturas después de la ejecución.
                  </p>
                </div>

                  </>
                )}

                {/*
                  Reorganización FormularioEvento (septiembre 2026), entrega
                  "sesiones sin redundancia": antes se forzaba una fila de
                  presupuesto por CADA sesión para TODOS los speakers, como
                  si todos participaran en todas las sesiones — no siempre
                  es así (a veces es un solo speaker en una sola sesión, a
                  veces todos en todas). Ahora cada speaker elige en cuáles
                  sesiones participa (por defecto, todas — el caso más
                  común — pero se puede desmarcar), y el presupuesto de
                  transporte/hospedaje/alimentos solo se pide para las
                  sesiones marcadas.
                */}
                {esVariasSesiones ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label>Sesiones en las que participa este speaker *</Label>
                      {/* AJUSTES (septiembre 2026), pedido explícito: se reemplaza el
                          Toggle Segmentado Tipo "Cápsula Flotante" por un Checkbox,
                          igual al usado en "No aplica lista de asistencia". */}
                      <div className="flex flex-wrap gap-3">
                        {valor.sesiones.map((s, iSesion) => {
                          const participa = sp.presupuestos.some((pp) => pp.sesionId === s.id);
                          return (
                            <label
                              key={s.id}
                              className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm"
                            >
                              <Checkbox
                                checked={participa}
                                disabled={soloLectura}
                                onCheckedChange={(v) => alternarSesionSpeaker(indiceSpeaker, s.id, v === true)}
                              />
                              {`Sesión ${iSesion + 1}${s.fecha ? ` — ${s.fecha}` : ""}${s.lugar ? ` — ${s.lugar}` : ""}`}
                            </label>
                          );
                        })}
                      </div>
                      {errores[`speaker-${indiceSpeaker}-sesiones`] && (
                        <p className="text-xs text-destructive">{errores[`speaker-${indiceSpeaker}-sesiones`]}</p>
                      )}
                    </div>
                    {valor.sesiones.map((s, iSesion) => {
                      const p = sp.presupuestos.find((pp) => pp.sesionId === s.id);
                      if (!p) return null;
                      return (
                        <div key={s.id} className="flex flex-col gap-3 rounded-md border border-dashed p-2">
                          <h5 className="text-xs font-semibold text-muted-foreground">Sesión {iSesion + 1}</h5>
                          {renderHorasParticipacion(indiceSpeaker, p)}
                          {renderPresupuestoSpeaker(indiceSpeaker, p)}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  (() => {
                    const pUnica = sp.presupuestos[0] ?? presupuestoSpeakerVacio(null);
                    return (
                      <div className="flex flex-col gap-3">
                        {renderHorasParticipacion(indiceSpeaker, pUnica)}
                        {renderPresupuestoSpeaker(indiceSpeaker, pUnica)}
                      </div>
                    );
                  })()
                )}

                {!soloLectura && (
                  <Button type="button" variant="ghost" size="sm" className="w-fit gap-1.5 text-destructive" onClick={async () => { if (await confirmarQuitar("Quitar speaker", "¿Quitar este speaker del evento? Se perderán sus datos de participación y presupuesto.")) quitarSpeaker(indiceSpeaker); }}>
                    <Trash2 className="h-4 w-4" /> Quitar speaker
                  </Button>
                )}
              </div>
            ))}
          </div>
          )}
        </SeccionAcordeon>
        );
      })}

      {/*
        Corrección (septiembre 2026), pedido explícito del usuario: esta
        sección ahora reusa `renderPresupuestoSesion` (mismo detalle
        completo que "Speakers externos" y que cada sesión de "Varias
        sesiones") en vez de un JSX propio, más corto, que le faltaban
        "Valor del transporte" y "Valor estimado de traslados en taxi"
        (no existían ni como campo a nivel de documento) y donde "Número
        de noches" era editable a mano en vez de autocalculado.
      */}
      {esUnicaSesion && !usaSpeakers(valor) && (
        <SeccionAcordeon value="transporte-hospedaje-alimentos" titulo="Transporte, hospedaje y alimentos" descripcion="Aplica a la única sesión del evento.">
          {renderPresupuestoSesion(
            "evento",
            {
              transporteNoAplica: valor.transporteNoAplica,
              transporteAcordePolitica: valor.transporteAcordePolitica,
              transporteMotivoNoAcorde: valor.transporteMotivoNoAcorde,
              tipoTransporte: valor.tipoTransporte,
              montoTransporte: valor.montoTransporte,
              cotizacionAdjunta: valor.cotizacionAdjunta,
              taxi: valor.taxi,
              valorEstimadoTaxi: valor.valorEstimadoTaxi,
              hospedajeNoAplica: valor.hospedajeNoAplica,
              hospedajeAcordePolitica: valor.hospedajeAcordePolitica,
              hospedajeMotivoNoAcorde: valor.hospedajeMotivoNoAcorde,
              fechaInicioEstancia: valor.fechaInicioEstancia || null,
              fechaFinEstancia: valor.fechaFinEstancia || null,
              numeroNoches: valor.numeroNoches,
              costoNochePersona: valor.costoNochePersona,
              nombreHotel: valor.nombreHotel,
              categoriaHotel: valor.categoriaHotel,
              motivoLocalidadDistinta: valor.motivoLocalidadDistinta,
              alimentosNoAplica: valor.alimentosNoAplica,
              alimentosAcordePolitica: valor.alimentosAcordePolitica,
              alimentosMotivoNoAcorde: valor.alimentosMotivoNoAcorde,
              montoAlimentosDia: valor.montoAlimentosDia,
              comentariosAlimentos: valor.comentariosAlimentos,
            },
            (cambios) => {
              // `DatosFormularioEvento.fechaInicioEstancia`/`fechaFinEstancia` son
              // `string` (no `string | null`, a diferencia de `PresupuestoSesion`)
              // — se convierte `null` a "" al fusionar los cambios, sin usar `??`
              // contra el valor anterior (eso ignoraría un borrado intencional de
              // la fecha).
              const normalizado: Partial<DatosFormularioEvento> = { ...cambios } as Partial<DatosFormularioEvento>;
              if ("fechaInicioEstancia" in cambios) normalizado.fechaInicioEstancia = cambios.fechaInicioEstancia ?? "";
              if ("fechaFinEstancia" in cambios) normalizado.fechaFinEstancia = cambios.fechaFinEstancia ?? "";
              onChange({ ...valor, ...normalizado });
            },
          )}
        </SeccionAcordeon>
      )}


      <SeccionAcordeon
        value="condensado"
        titulo="Presupuesto condensado"
        descripcion={
          hayPresupuestoPorSpeaker
            ? "Se sugiere automáticamente sumando el paquete completo de todos los speakers (transporte, hospedaje y alimentos de cada sesión; cuota y honorarios de los externos), pero puedes ajustarlo."
            : `Hospedaje, alimentos${esVariasSesiones ? " y transporte" : ""} se sugieren automáticamente${esVariasSesiones ? " sumando todas las sesiones" : " a partir del detalle de arriba"}, pero puedes ajustarlos.`
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Campo label="Valor participación">
            <div data-testid="condensado-valor-participacion">
              <InputMoneda value={valor.condensadoValorParticipacion} moneda={valor.moneda} disabled onChange={() => {}} />
            </div>
          </Campo>
          <Campo label="Inscripción (sugerido, editable)">
            <InputMoneda value={valor.condensadoInscripcion} moneda={valor.moneda} disabled={soloLectura} onChange={(v) => set("condensadoInscripcion", v)} />
          </Campo>
          <Campo label={esVariasSesiones ? "Transporte (suma de sesiones, editable)" : "Transporte"}>
            <InputMoneda value={valor.condensadoTransporte} moneda={valor.moneda} disabled={soloLectura} onChange={(v) => set("condensadoTransporte", v)} />
          </Campo>
          <Campo label="Traslado">
            <InputMoneda value={valor.condensadoTraslado} moneda={valor.moneda} disabled={soloLectura} onChange={(v) => set("condensadoTraslado", v)} />
          </Campo>
          <Campo label="Hospedaje (sugerido, editable)">
            <InputMoneda value={valor.condensadoHospedaje} moneda={valor.moneda} disabled={soloLectura} onChange={(v) => set("condensadoHospedaje", v)} />
          </Campo>
          <Campo label="Alimentos (sugerido, editable)">
            <InputMoneda value={valor.condensadoAlimentos} moneda={valor.moneda} disabled={soloLectura} onChange={(v) => set("condensadoAlimentos", v)} />
          </Campo>
          <Campo label="Honorarios del speaker (sugerido, editable)">
            <InputMoneda value={valor.condensadoHonorariosSpeaker} moneda={valor.moneda} disabled={soloLectura} onChange={(v) => set("condensadoHonorariosSpeaker", v)} />
          </Campo>
          <Campo label="Otro">
            <InputMoneda value={valor.condensadoOtro} moneda={valor.moneda} disabled={soloLectura} onChange={(v) => set("condensadoOtro", v)} />
          </Campo>
          {(valor.condensadoOtro ?? 0) > 0 && (
            <Campo label='Especificar "Otro"'>
              <Input value={valor.condensadoOtroEspecificar} disabled={soloLectura} onChange={(e) => set("condensadoOtroEspecificar", e.target.value)} />
            </Campo>
          )}
          <div className="flex flex-col justify-end gap-1.5">
            <Label>Total</Label>
            <div data-testid="evento-total-condensado" className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-semibold tabular-nums">
              {formatearMonto(totalGeneral, valor.moneda)}
            </div>
          </div>
          {/*
            Entrega "Participación, presupuesto aprobado y anexos"
            (septiembre 2026), pedido explícito: advertencia junto al
            presupuesto condensado cuando el total supera el presupuesto ya
            aprobado, indicando el monto que se está excediendo e invitando
            a revisar el presupuesto.
          */}
          {excedePresupuestoAprobado && (
            <div
              data-testid="evento-advertencia-excede-presupuesto"
              className="flex flex-col gap-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 sm:col-span-3"
            >
              <p className="font-semibold">El presupuesto condensado supera el presupuesto aprobado</p>
              <p>
                El total condensado ({formatearMonto(totalGeneral, valor.moneda)}) supera
                el presupuesto aprobado ({formatearMonto(valor.montoPresupuestoAprobado ?? 0, valor.moneda)}) por{" "}
                <strong>{formatearMonto(excesoPresupuestoAprobado, valor.moneda)}</strong>
                . Revisa el presupuesto antes de continuar.
              </p>
            </div>
          )}
          <div className="flex flex-col gap-1.5 sm:col-span-3">
            <Label htmlFor="evento-comentarios-costo">Comentarios sobre el costo</Label>
            <Textarea id="evento-comentarios-costo" value={valor.comentariosCosto} disabled={soloLectura} onChange={(e) => set("comentariosCosto", e.target.value)} />
          </div>
        </div>
        {porSeccion.presupuesto && (
          <CamposPersonalizadosSeccion campos={porSeccion.presupuesto} valores={valor.camposPersonalizados} valoresParaCalculo={valoresParaCalculo} onChange={setCampoPersonalizado} />
        )}
      </SeccionAcordeon>

      <SeccionAcordeon
        value="comentarios-especiales"
        titulo="Comentarios especiales"
        accionesHeader={
          /* AJUSTES (septiembre 2026), pedido explícito: los botones pasan de
             "Aplica"/"No aplica" a "Si"/"No" (primero "No", luego "Sí"), en
             armonía con Transporte/Hospedaje/Alimentos — mismo criterio: se
             invierte el mapeo del toggle para que "Sí" sea la opción que
             activa el campo, conservando el nombre interno
             `comentariosEspecialesNoAplica` (sin renombrar columna de BD). */
          <ToggleCapsula
            value={valor.comentariosEspecialesNoAplica ? "no" : "si"}
            onValueChange={(v) => set("comentariosEspecialesNoAplica", v === "no")}
            opciones={[
              { value: "no", label: "No" },
              { value: "si", label: "Sí" },
            ]}
            disabled={soloLectura}
          />
        }
      >
        {!valor.comentariosEspecialesNoAplica && (
          <div>
            <Textarea value={valor.comentariosEspeciales} disabled={soloLectura} onChange={(e) => set("comentariosEspeciales", e.target.value)} />
            {errores.comentariosEspeciales && <p className="text-xs text-destructive">{errores.comentariosEspeciales}</p>}
          </div>
        )}
      </SeccionAcordeon>
    </Accordion>

      <Dialog open={!soloLectura && valor.incluidoPresupuestoAprobado === false && !valor.advertenciaPresupuestoNoAprobado} onOpenChange={() => {}}>
        <DialogContent className="[&>button]:hidden" onEscapeKeyDown={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Evento sin presupuesto aprobado</DialogTitle>
            <DialogDescription>
              Se espera que todos los eventos educativos y promocionales tengan un presupuesto aprobado. Le
              recomiendo verificar con su jefe inmediato o superior la pertinencia de continuar con esta solicitud.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={cancelarPorPresupuestoNoAprobado}>
              Cancelar solicitud
            </Button>
            <Button type="button" onClick={confirmarContinuarSinPresupuesto}>
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Campo({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  const id = React.useId();
  // Corrección (formateo de montos, septiembre 2026): `Campo` ahora acepta
  // más de un hijo (el Input y, debajo, el `<p>` de monto formateado), no
  // solo un único ReactElement. Solo el primer elemento válido recibe el
  // `id` (el control real), y el resto (p. ej. el texto de monto) se
  // renderiza tal cual.
  let idAsignado = false;
  const hijos = React.Children.map(children, (hijo) => {
    if (!idAsignado && React.isValidElement(hijo)) {
      idAsignado = true;
      return React.cloneElement(hijo, { id } as never);
    }
    return hijo;
  });
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {hijos}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export { ETIQUETA_CAMPO as ETIQUETA_CAMPO_EVENTO };
