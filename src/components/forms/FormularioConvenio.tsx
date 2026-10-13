import * as React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ToggleCapsula } from "@/components/ui/toggle-capsula";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion } from "@/components/ui/accordion";
import { SeccionAcordeon } from "@/components/forms/SeccionAcordeon";
import { CamposPersonalizadosSeccion } from "@/components/CamposPersonalizadosSeccion";
import { CampoArchivo } from "@/components/archivos/CampoArchivo";
import { SelectPaisEstadoCiudad } from "@/components/SelectPaisEstadoCiudad";
import { useCatalogo } from "@/lib/catalogos";
import { esOrganizadoPorOtro } from "@/lib/organizadoPor";
import { camposAplicables, camposPorSeccion, type CampoPersonalizadoDefinicion } from "@/lib/camposPersonalizados";
import { etiquetaEfectiva, type EtiquetaCampo } from "@/lib/etiquetasCampo";
import { useSelectorConPrecargado, usePrecargaInicialOrigen } from "@/hooks/usePrecargado";
import { traerEventoPorId, traerEventoConSesionesPorId } from "@/lib/evento";
import { traerSpeakerPorId } from "@/lib/speakers";
import { traerFmvPorEventoYSpeaker } from "@/lib/fmv";
import {
  calcularScoreFmvVigente,
  escribirScoreFmv,
  leerScoreFmv,
  sesionesDelSpeakerEnEvento,
  textoScoreFmv,
  type ScoreFmv,
} from "@/lib/convenioDerivados";
import { traerFormatoOficialFmv, formatoOficialFmvVigente } from "@/lib/configuracionFormatos";
import {
  precargarDesdeEventoParaConvenio,
  precargarDesdeSpeakerParaConvenio,
  precargarContraprestacionDesdeEventoYSpeaker,
  precargarNumeroHCPConsejoDesdeEvento,
} from "@/lib/precargado";
import { TEXTO_CERTIFICACION_EMPLEADO_CONVENIO } from "@/lib/textosFijosConvenio";
import type { OpcionEventoOrigen } from "@/lib/documentosRequeridosEvento";
import type { Evento } from "@/types";
import type { SpeakerResumen } from "@/lib/speakers";
import { vigenciaRethus, vigenciaHojaVida } from "@/lib/speakers";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { VisorArchivo } from "@/components/archivos/VisorArchivo";
import { InputMoneda } from "@/components/ui/input-moneda";
import { Button } from "@/components/ui/button";
import { SelectorHcpDelEvento, type DocumentoExistenteSpeaker } from "@/components/forms/SelectorHcpDelEvento";

export interface DatosFormularioConvenio {
  eventoOrigenId: string;
  empleadoResponsableNombreCargo: string;
  departamento: string;
  unidadNegocioUbicacion: string;
  tipoActividad: string;
  organizadoPor: string;
  organizador: string;
  speakerId: string;
  hcpNombreCompleto: string;
  hcpNumeroDocumento: string;
  hcpEspecialidad: string;
  hcpEstadoProvincia: string;
  hcpDireccion: string;
  hcpPais: string;
  hcpCiudad: string;
  hcpCedulaLicencia: string;
  hcpRFC: string;
  tipoServicio: string;
  nombreEventoServicio: string;
  fechaInicioActividad: string;
  fechaFinActividad: string;
  esConsejoAsesores: boolean;
  tituloConsejoAsesores: string;
  numeroHCPConsejo: number | null;
  justificacionNumeroHCP: string;
  esFuncionarioGobierno: boolean;
  supuestoCargoImportante: boolean;
  supuestoRepresentanteCompras: boolean;
  supuestoInfluenciaDecisionGubernamental: boolean;
  advertenciaFuncionarioGobiernoConfirmada: boolean;
  objetivo: string;
  criteriosSeleccion: string;
  cvAdjunto: boolean;
  contraprestacionHCP: number | null;
  monedaContraprestacion: string;
  consistenteTabuladorTarifas: boolean;
  explicacionSiNoConsistente: string;
  agendaReunion: string;
  archivoAgendaId: string | null;
  cateringNombreServicio: string;
  contraprestacionCatering: number | null;
  lugarReunion: string;
  firmaEmpleadoCertifica: boolean;
  sesionesParticipacionIds: string[];
  camposPersonalizados: Record<string, unknown>;
}

export const CONVENIO_VACIO: DatosFormularioConvenio = {
  eventoOrigenId: "",
  empleadoResponsableNombreCargo: "",
  departamento: "",
  unidadNegocioUbicacion: "",
  tipoActividad: "",
  organizadoPor: "",
  organizador: "",
  speakerId: "",
  hcpNombreCompleto: "",
  hcpNumeroDocumento: "",
  hcpEspecialidad: "",
  hcpEstadoProvincia: "",
  hcpDireccion: "",
  hcpPais: "",
  hcpCiudad: "",
  hcpCedulaLicencia: "",
  hcpRFC: "",
  tipoServicio: "",
  nombreEventoServicio: "",
  fechaInicioActividad: "",
  fechaFinActividad: "",
  esConsejoAsesores: false,
  tituloConsejoAsesores: "",
  numeroHCPConsejo: null,
  justificacionNumeroHCP: "",
  esFuncionarioGobierno: false,
  supuestoCargoImportante: false,
  supuestoRepresentanteCompras: false,
  supuestoInfluenciaDecisionGubernamental: false,
  advertenciaFuncionarioGobiernoConfirmada: false,
  objetivo: "",
  criteriosSeleccion: "",
  cvAdjunto: false,
  contraprestacionHCP: null,
  monedaContraprestacion: "",
  consistenteTabuladorTarifas: true,
  explicacionSiNoConsistente: "",
  agendaReunion: "",
  archivoAgendaId: null,
  cateringNombreServicio: "",
  contraprestacionCatering: null,
  lugarReunion: "",
  firmaEmpleadoCertifica: false,
  sesionesParticipacionIds: [],
  camposPersonalizados: {},
};

const ETIQUETA_CAMPO: Record<string, string> = {
  eventoOrigenId: "Evento de origen",
  empleadoResponsableNombreCargo: "Empleado responsable (nombre y cargo)",
  departamento: "Departamento",
  unidadNegocioUbicacion: "Unidad de negocio / ubicación",
  tipoActividad: "Tipo de actividad",
  organizadoPor: "Organizado por",
  organizador: "Organizador",
  hcpNombreCompleto: "Nombre completo del HCP",
  hcpDireccion: "Dirección del HCP",
  hcpPais: "País del HCP",
  hcpCiudad: "Ciudad del HCP",
  hcpCedulaLicencia: "Cédula / licencia del HCP",
  hcpRFC: "RFC del HCP",
  tipoServicio: "Tipo de servicio",
  nombreEventoServicio: "Nombre del evento / servicio",
  objetivo: "Objetivo",
  criteriosSeleccion: "Criterios de selección",
  contraprestacionHCP: "Contraprestación al HCP",
  monedaContraprestacion: "Moneda de la contraprestación",
  agendaReunion: "Agenda de la reunión",
  lugarReunion: "Lugar de la reunión",
};

export function calcularErroresConvenio(datos: DatosFormularioConvenio): Record<string, string> {
  const errores: Record<string, string> = {};
  const requerido = (clave: keyof DatosFormularioConvenio) => {
    if (!String(datos[clave] ?? "").trim()) {
      errores[clave] = `${ETIQUETA_CAMPO[clave] ?? clave} es obligatorio.`;
    }
  };

  // AJUSTES (septiembre/octubre 2026), pedido explícito: "Evento de origen"
  // pasa a ser obligatorio en todos los formularios que lo tienen — antes
  // era opcional aquí (y en MD FMV Checklist).
  requerido("eventoOrigenId");
  requerido("empleadoResponsableNombreCargo");
  requerido("departamento");
  requerido("unidadNegocioUbicacion");
  requerido("tipoActividad");
  requerido("organizadoPor");
  // A7: "Nombre del organizador" solo se exige cuando "Organizado por" no
  // identifica ya a un organizador concreto (mismo criterio que Evento —
  // ver src/lib/organizadoPor.ts).
  if (esOrganizadoPorOtro(datos.organizadoPor)) {
    requerido("organizador");
  }
  requerido("speakerId");
  requerido("hcpNombreCompleto");
  requerido("hcpDireccion");
  requerido("hcpPais");
  requerido("hcpCiudad");
  requerido("hcpEstadoProvincia");
  requerido("hcpCedulaLicencia");
  requerido("tipoServicio");
  requerido("nombreEventoServicio");
  requerido("objetivo");
  requerido("criteriosSeleccion");
  requerido("monedaContraprestacion");
  requerido("agendaReunion");
  requerido("lugarReunion");

  if (!datos.contraprestacionHCP || datos.contraprestacionHCP <= 0) {
    errores.contraprestacionHCP = "La contraprestación al HCP debe ser mayor a cero.";
  }
  if (!datos.explicacionSiNoConsistente.trim()) {
    errores.explicacionSiNoConsistente = datos.consistenteTabuladorTarifas
      ? "Especifica cómo se llegó a la contraprestación total."
      : "Explica por qué la contraprestación no es consistente con el tabulador de tarifas.";
  }

  if (datos.esConsejoAsesores) {
    if (!datos.tituloConsejoAsesores.trim()) errores.tituloConsejoAsesores = "Indica el título del Consejo de Asesores.";
    if (!datos.numeroHCPConsejo || datos.numeroHCPConsejo <= 0) errores.numeroHCPConsejo = "Indica el número de HCPs en el Consejo.";
    if (!datos.justificacionNumeroHCP.trim()) errores.justificacionNumeroHCP = "Justifica el número de HCPs convocados.";
  }

  if (datos.esFuncionarioGobierno) {
    if (!datos.supuestoCargoImportante && !datos.supuestoRepresentanteCompras && !datos.supuestoInfluenciaDecisionGubernamental) {
      errores.supuestoCargoImportante = "Marca al menos un supuesto que describa la condición de funcionario de gobierno.";
    }
  }

  if (!datos.firmaEmpleadoCertifica) {
    errores.firmaEmpleadoCertifica = "El empleado responsable debe certificar la información antes de enviar.";
  }

  return errores;
}

interface Props {
  valor: DatosFormularioConvenio;
  onChange: (valor: DatosFormularioConvenio) => void;
  errores: Record<string, string>;
  eventosDisponibles: OpcionEventoOrigen[];
  speakersDisponibles: SpeakerResumen[];
  /** Convenios de Pago ya creados (cualquier estado; los Anulados no cuentan): "Seleccionar HCP" solo ofrece a los speakers del evento que todavía no tienen el suyo. */
  documentosExistentes?: DocumentoExistenteSpeaker[];
  /** Id del convenio que se está editando: su propio speaker no se excluye. */
  documentoActualId?: string;
  camposPersonalizadosDefinidos: CampoPersonalizadoDefinicion[];
  etiquetasCampo: EtiquetaCampo[];
  empresaGrupo: string;
  pais: string;
  soloLectura?: boolean;
  /** Ronda de ajustes de formularios (septiembre 2026), entrega 5: "Cancelar solicitud" del diálogo de funcionario de gobierno (mismo patrón que Evento, entrega 4). */
  onCancelar?: () => void;
  /** Ver `usePrecargaInicialOrigen` — viene de "Tareas Pendientes" cuando se abre este formulario para diligenciar una tarea concreta. */
  precargarEventoOrigenId?: string;
  precargarSpeakerId?: string;
}

export function FormularioConvenio({
  valor,
  onChange,
  errores,
  eventosDisponibles,
  speakersDisponibles,
  documentosExistentes = [],
  documentoActualId,
  camposPersonalizadosDefinidos,
  etiquetasCampo,
  empresaGrupo,
  pais,
  soloLectura,
  onCancelar,
  precargarEventoOrigenId,
  precargarSpeakerId,
}: Props) {
  const { opciones: departamentos } = useCatalogo("departamentosConvenio");
  const { opciones: tiposActividad } = useCatalogo("tiposActividadConvenio");
  const { opciones: organizadoPorOpciones } = useCatalogo("organizadoPorConvenio");
  const { opciones: tiposServicio } = useCatalogo("tiposServicioConvenio");
  const { opciones: monedas } = useCatalogo("monedas");
  const [incluyeCatering, setIncluyeCatering] = React.useState(
    Boolean(valor.cateringNombreServicio || valor.contraprestacionCatering),
  );
  const [formatoFmvId, setFormatoFmvId] = React.useState<string | null>(null);

  React.useEffect(() => {
    traerFormatoOficialFmv()
      .then((versiones) => setFormatoFmvId(formatoOficialFmvVigente(versiones, empresaGrupo)?.archivoId ?? null))
      .catch(() => setFormatoFmvId(null));
  }, [empresaGrupo]);

  function set<K extends keyof DatosFormularioConvenio>(clave: K, v: DatosFormularioConvenio[K]) {
    onChange({ ...valor, [clave]: v });
  }

  function setCampoPersonalizado(clave: string, v: unknown) {
    onChange({ ...valor, camposPersonalizados: { ...valor.camposPersonalizados, [clave]: v } });
  }

  // Fase 4: al elegir el evento de origen o el speaker, precarga
  // automáticamente los campos derivables de cada uno (ver
  // src/lib/precargado.ts) — no se pisan entre sí (cada uno mapea a
  // campos distintos) y el usuario los puede seguir editando después.
  const alElegirOrigen = useSelectorConPrecargado(valor, onChange);
  function onCambiaEventoOrigen(id: string) {
    alElegirOrigen("eventoOrigenId", id, traerEventoPorId, precargarDesdeEventoParaConvenio);
  }
  function onCambiaSpeaker(id: string) {
    alElegirOrigen("speakerId", id, traerSpeakerPorId, precargarDesdeSpeakerParaConvenio);
  }
  usePrecargaInicialOrigen({
    eventoOrigenIdInicial: precargarEventoOrigenId,
    speakerIdInicial: precargarSpeakerId,
    eventoOrigenIdActual: valor.eventoOrigenId,
    speakerIdActual: valor.speakerId,
    onEventoOrigen: onCambiaEventoOrigen,
    onSpeaker: onCambiaSpeaker,
    speakerIdsDelEvento: eventosDisponibles.find((ev) => ev.id === valor.eventoOrigenId)?.speakerIds,
  });

  // Ronda de ajustes de formularios (septiembre 2026): "Si por alguna
  // razón se va a generar un convenio de pago a HCP en un HCP que tiene
  // la hoja de vida o la licencia RETHUS vencida, se debe advertir a
  // quien está generando la solicitud para que haga la revisión
  // pertinente" (nota de "Nuevo Speaker", aplicada aquí donde de verdad
  // se genera el Convenio de Pago). Solo una advertencia visual — no
  // bloquea el envío.
  const [advertenciaVigenciaSpeaker, setAdvertenciaVigenciaSpeaker] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!valor.speakerId) {
      setAdvertenciaVigenciaSpeaker(null);
      return;
    }
    let cancelado = false;
    traerSpeakerPorId(valor.speakerId)
      .then((speaker) => {
        if (cancelado || !speaker) return;
        const partes: string[] = [];
        if (vigenciaRethus(speaker) === "vencido") partes.push("la licencia RETHUS");
        if (vigenciaHojaVida(speaker) === "vencido") partes.push("la hoja de vida");
        setAdvertenciaVigenciaSpeaker(
          partes.length > 0 ? `Este HCP tiene ${partes.join(" y ")} vencida(s) en el Repositorio de Speakers — revísalo antes de continuar.` : null,
        );
      })
      .catch(() => setAdvertenciaVigenciaSpeaker(null));
    return () => { cancelado = true; };
  }, [valor.speakerId]);

  // A14 (ronda de instrucciones históricas, cluster A): "vincular las
  // sesiones específicas del Evento" necesita conocer la lista de sesiones
  // del evento de origen elegido — el precargado de arriba no la retiene
  // (solo copia campos puntuales), así que se trae aparte. Ronda de ajustes
  // de formularios (septiembre 2026), entrega 5: ahora también se guarda el
  // Evento COMPLETO (no solo sus sesiones), porque "Contraprestación al
  // HCP" y "Número de HCP del Consejo" se derivan de
  // `evento.speakersParticipacion`/`numeroSpeakersExternos`, no de un campo
  // plano que el precargado genérico (`usePrecargado`) pueda copiar solo.
  const [eventoOrigenCompleto, setEventoOrigenCompleto] = React.useState<Evento | null>(null);
  React.useEffect(() => {
    if (!valor.eventoOrigenId) {
      setEventoOrigenCompleto(null);
      return;
    }
    let cancelado = false;
    // Octubre 2026: antes se usaba `traerEventoPorId`, que OMITE las sesiones a
    // propósito — por eso la lista "Sesiones del evento a las que aplica este
    // convenio" nunca aparecía y "Sesiones de participación vinculadas" salía
    // siempre vacía. `traerEventoConSesionesPorId` las trae.
    traerEventoConSesionesPorId(valor.eventoOrigenId)
      .then((ev) => { if (!cancelado) setEventoOrigenCompleto(ev); })
      .catch(() => { if (!cancelado) setEventoOrigenCompleto(null); });
    return () => { cancelado = true; };
  }, [valor.eventoOrigenId]);
  const sesionesEventoOrigen = eventoOrigenCompleto?.sesiones ?? [];

  // Octubre 2026 — CAUSA REAL de dos pendientes que se reportaron varias veces
  // ("Contraprestación/Moneda no se precargan" y "Criterios de selección se
  // borra al reabrir el borrador"): los efectos de precarga llamaban a
  // `onChange({ ...valor, ... })` / `set(...)` con el `valor` de SU render. Cuando
  // dos de ellos escribían casi al mismo tiempo (p. ej. el de criterios, que
  // espera una consulta, escribía DESPUÉS con un `valor` viejo que aún no tenía
  // la contraprestación), el último pisaba al anterior y la contraprestación
  // volvía a quedar vacía. Además, esos efectos se ejecutaban también al
  // ABRIR un borrador ya guardado y sobrescribían lo que el usuario había
  // diligenciado (criterios, contraprestación editada). Ahora:
  //  1. toda escritura asíncrona se fusiona sobre el valor MÁS RECIENTE (`valorRef`);
  //  2. la precarga solo corre cuando el usuario CAMBIA evento o speaker — al
  //     abrir un documento ya guardado se respeta tal cual se guardó.
  const valorRef = React.useRef(valor);
  valorRef.current = valor;
  const claveOrigenAplicada = React.useRef(`${valor.eventoOrigenId}|${valor.speakerId}`);

  function aplicarParcial(parcial: Partial<DatosFormularioConvenio>) {
    onChange({ ...valorRef.current, ...parcial });
  }

  React.useEffect(() => {
    if (soloLectura) return;
    const eventoId = valor.eventoOrigenId;
    const speakerId = valor.speakerId;
    if (!eventoId || !speakerId) return;
    if (!eventoOrigenCompleto || eventoOrigenCompleto.id !== eventoId) return; // el evento nuevo todavía no llegó
    const clave = `${eventoId}|${speakerId}`;
    if (clave === claveOrigenAplicada.current) return;
    claveOrigenAplicada.current = clave;

    // Contraprestación, moneda y sesiones del speaker — de inmediato (el evento ya está cargado).
    const { contraprestacionHCP, monedaContraprestacion } = precargarContraprestacionDesdeEventoYSpeaker(eventoOrigenCompleto, speakerId);
    aplicarParcial({
      contraprestacionHCP,
      monedaContraprestacion,
      sesionesParticipacionIds: sesionesDelSpeakerEnEvento(eventoOrigenCompleto, speakerId),
    });

    // Criterios de selección y score total, desde el FMV Checklist del mismo evento/speaker.
    traerFmvPorEventoYSpeaker(eventoId, speakerId)
      .then(async (fmv) => {
        const actual = valorRef.current;
        if (actual.eventoOrigenId !== eventoId || actual.speakerId !== speakerId) return; // eligió otro mientras tanto
        const score = fmv ? await calcularScoreFmvVigente(eventoId, speakerId).catch(() => null) : null;
        const vigente = valorRef.current;
        if (vigente.eventoOrigenId !== eventoId || vigente.speakerId !== speakerId) return;
        aplicarParcial({
          criteriosSeleccion: fmv?.comentariosAdicionales ?? "",
          camposPersonalizados: escribirScoreFmv(vigente.camposPersonalizados, score),
        });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventoOrigenCompleto, valor.eventoOrigenId, valor.speakerId, soloLectura]);

  // Borradores guardados antes de existir el "Score total FMV Checklist": se
  // completa una sola vez al abrirlos (nunca sobrescribe uno ya guardado).
  const scoreFmv: ScoreFmv | null = leerScoreFmv(valor.camposPersonalizados);
  const [sinFmvParaScore, setSinFmvParaScore] = React.useState(false);
  React.useEffect(() => {
    if (soloLectura || scoreFmv || !valor.eventoOrigenId || !valor.speakerId) return;
    const eventoId = valor.eventoOrigenId;
    const speakerId = valor.speakerId;
    calcularScoreFmvVigente(eventoId, speakerId)
      .then((score) => {
        const actual = valorRef.current;
        if (actual.eventoOrigenId !== eventoId || actual.speakerId !== speakerId) return;
        if (!score) { setSinFmvParaScore(true); return; }
        setSinFmvParaScore(false);
        if (!leerScoreFmv(actual.camposPersonalizados)) aplicarParcial({ camposPersonalizados: escribirScoreFmv(actual.camposPersonalizados, score) });
      })
      .catch(() => setSinFmvParaScore(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor.eventoOrigenId, valor.speakerId, soloLectura, scoreFmv?.puntaje]);

  // Número de HCP del Consejo de Asesores: solo tiene sentido precargarlo
  // mientras la sección está activa (si no, no hay campo visible que llenar).
  React.useEffect(() => {
    if (soloLectura || !eventoOrigenCompleto || !valor.esConsejoAsesores) return;
    if (valorRef.current.numeroHCPConsejo != null) return; // no pisa lo ya diligenciado/guardado
    const { numeroHCPConsejo } = precargarNumeroHCPConsejoDesdeEvento(eventoOrigenCompleto);
    if (numeroHCPConsejo != null) aplicarParcial({ numeroHCPConsejo });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventoOrigenCompleto, valor.esConsejoAsesores, soloLectura]);

  function alternarSesion(sesionId: string, marcada: boolean) {
    const siguiente = marcada
      ? Array.from(new Set([...valor.sesionesParticipacionIds, sesionId]))
      : valor.sesionesParticipacionIds.filter((id) => id !== sesionId);
    set("sesionesParticipacionIds", siguiente);
  }

  // Ronda de ajustes de formularios (septiembre 2026), entrega 5: gate de
  // "funcionario de gobierno" con diálogo cancelar/continuar — mismo
  // patrón que el de presupuesto no aprobado en Evento (entrega 4), pero
  // disparado por los checkboxes en vez de por el toggle Sí/No en sí.
  const algunSupuestoMarcado = valor.supuestoCargoImportante || valor.supuestoRepresentanteCompras || valor.supuestoInfluenciaDecisionGubernamental;

  function alMarcarSupuesto(clave: "supuestoCargoImportante" | "supuestoRepresentanteCompras" | "supuestoInfluenciaDecisionGubernamental", marcado: boolean) {
    const siguiente = { ...valor, [clave]: marcado };
    const quedaAlgunoMarcado = siguiente.supuestoCargoImportante || siguiente.supuestoRepresentanteCompras || siguiente.supuestoInfluenciaDecisionGubernamental;
    if (!quedaAlgunoMarcado) siguiente.advertenciaFuncionarioGobiernoConfirmada = false;
    onChange(siguiente);
  }

  function confirmarContinuarConFuncionarioGobierno() {
    onChange({ ...valor, advertenciaFuncionarioGobiernoConfirmada: true });
  }

  function cancelarPorFuncionarioGobierno() {
    if (onCancelar) {
      onCancelar();
    } else {
      // Respaldo si nadie provee onCancelar: desmarca los 3 supuestos para
      // no dejar el diálogo bloqueado sin ninguna acción posible.
      onChange({
        ...valor,
        supuestoCargoImportante: false,
        supuestoRepresentanteCompras: false,
        supuestoInfluenciaDecisionGubernamental: false,
      });
    }
  }

  const etiqueta = (clave: string) =>
    etiquetaEfectiva(etiquetasCampo, "convenio", clave, empresaGrupo, ETIQUETA_CAMPO[clave] ?? clave);

  const aplicables = camposAplicables(camposPersonalizadosDefinidos, "convenio", empresaGrupo, pais);
  const porSeccion = camposPorSeccion(aplicables);
  const valoresParaCalculo = { ...valor, ...valor.camposPersonalizados };

  return (
    <div className="flex flex-col gap-6">
    <Accordion
      type="multiple"
      defaultValue={["actividad", "hcp", "consejo", "gobierno", "objetivo", "contraprestacion", "catering", "certificacion"]}
      className="flex flex-col gap-3"
    >
      <SeccionAcordeon value="actividad" titulo="Actividad y responsable">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="convenio-evento-origen">Evento de origen *</Label>
            <Select value={valor.eventoOrigenId} onValueChange={onCambiaEventoOrigen} disabled={soloLectura}>
              <SelectTrigger id="convenio-evento-origen"><SelectValue placeholder="Selecciona un evento" /></SelectTrigger>
              <SelectContent>
                {eventosDisponibles.map((ev) => (
                  <SelectItem key={ev.id} value={ev.id}>{ev.etiqueta}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errores.eventoOrigenId && <p className="text-xs text-destructive">{errores.eventoOrigenId}</p>}
            <p className="text-xs text-muted-foreground">Al elegir el evento, se precargan la actividad y sus fechas — puedes corregirlas si hace falta.</p>
          </div>
          {sesionesEventoOrigen.length > 0 && (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Sesiones del evento a las que aplica este convenio</Label>
              <div className="flex flex-col gap-2 rounded-md border p-2">
                {sesionesEventoOrigen.map((s, i) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={valor.sesionesParticipacionIds.includes(s.id)}
                      disabled={soloLectura}
                      onCheckedChange={(v) => alternarSesion(s.id, v === true)}
                    />
                    Sesión {i + 1}{s.lugar ? ` — ${s.lugar}` : ""}{s.fecha ? ` (${s.fecha})` : ""}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Déjalo vacío si el convenio aplica a todas las sesiones del evento.</p>
            </div>
          )}
          <Campo label={`${etiqueta("empleadoResponsableNombreCargo")} *`} error={errores.empleadoResponsableNombreCargo}>
            <Input value={valor.empleadoResponsableNombreCargo} disabled={soloLectura} onChange={(e) => set("empleadoResponsableNombreCargo", e.target.value)} />
          </Campo>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="convenio-departamento">{etiqueta("departamento")} *</Label>
            <Select value={valor.departamento} onValueChange={(v) => set("departamento", v)} disabled={soloLectura}>
              <SelectTrigger id="convenio-departamento"><SelectValue placeholder="Selecciona un departamento" /></SelectTrigger>
              <SelectContent>
                {departamentos.map((op) => (
                  <SelectItem key={op} value={op}>{op}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errores.departamento && <p className="text-xs text-destructive">{errores.departamento}</p>}
          </div>
          <Campo label={`${etiqueta("unidadNegocioUbicacion")} *`} error={errores.unidadNegocioUbicacion}>
            <Input value={valor.unidadNegocioUbicacion} disabled={soloLectura} onChange={(e) => set("unidadNegocioUbicacion", e.target.value)} />
          </Campo>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="convenio-tipo-actividad">{etiqueta("tipoActividad")} *</Label>
            <Select value={valor.tipoActividad} onValueChange={(v) => set("tipoActividad", v)} disabled={soloLectura}>
              <SelectTrigger id="convenio-tipo-actividad"><SelectValue placeholder="Selecciona un tipo" /></SelectTrigger>
              <SelectContent>
                {tiposActividad.map((op) => (
                  <SelectItem key={op} value={op}>{op}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errores.tipoActividad && <p className="text-xs text-destructive">{errores.tipoActividad}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="convenio-organizado-por">{etiqueta("organizadoPor")} *</Label>
            <Select value={valor.organizadoPor} onValueChange={(v) => set("organizadoPor", v)} disabled={soloLectura}>
              <SelectTrigger id="convenio-organizado-por"><SelectValue placeholder="Selecciona una opción" /></SelectTrigger>
              <SelectContent>
                {organizadoPorOpciones.map((op) => (
                  <SelectItem key={op} value={op}>{op}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errores.organizadoPor && <p className="text-xs text-destructive">{errores.organizadoPor}</p>}
          </div>
          {esOrganizadoPorOtro(valor.organizadoPor) && (
            <Campo label={`${etiqueta("organizador")} *`} error={errores.organizador}>
              <Input value={valor.organizador} disabled={soloLectura} onChange={(e) => set("organizador", e.target.value)} />
            </Campo>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="convenio-tipo-servicio">{etiqueta("tipoServicio")} *</Label>
            <Select value={valor.tipoServicio} onValueChange={(v) => set("tipoServicio", v)} disabled={soloLectura}>
              <SelectTrigger id="convenio-tipo-servicio"><SelectValue placeholder="Selecciona un tipo de servicio" /></SelectTrigger>
              <SelectContent>
                {tiposServicio.map((op) => (
                  <SelectItem key={op} value={op}>{op}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errores.tipoServicio && <p className="text-xs text-destructive">{errores.tipoServicio}</p>}
          </div>
          <Campo label={`${etiqueta("nombreEventoServicio")} *`} error={errores.nombreEventoServicio}>
            <Input value={valor.nombreEventoServicio} disabled={soloLectura} onChange={(e) => set("nombreEventoServicio", e.target.value)} />
          </Campo>
          <Campo label="Inicio de la actividad">
            <Input type="date" value={valor.fechaInicioActividad} disabled={soloLectura} onChange={(e) => set("fechaInicioActividad", e.target.value)} />
          </Campo>
          <Campo label="Fin de la actividad">
            <Input type="date" value={valor.fechaFinActividad} disabled={soloLectura} onChange={(e) => set("fechaFinActividad", e.target.value)} />
          </Campo>
          <Campo label={`${etiqueta("lugarReunion")} *`} error={errores.lugarReunion}>
            <Input value={valor.lugarReunion} disabled={soloLectura} onChange={(e) => set("lugarReunion", e.target.value)} />
          </Campo>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="convenio-agenda">{etiqueta("agendaReunion")} *</Label>
            <Textarea id="convenio-agenda" value={valor.agendaReunion} disabled={soloLectura} onChange={(e) => set("agendaReunion", e.target.value)} />
            {errores.agendaReunion && <p className="text-xs text-destructive">{errores.agendaReunion}</p>}
          </div>
          <div className="sm:col-span-2">
            <CampoArchivo
              etiqueta="Agenda de la reunión (archivo adjunto, opcional)"
              valor={valor.archivoAgendaId}
              onChange={(id) => set("archivoAgendaId", id)}
              aceptar="application/pdf,image/*"
              disabled={soloLectura}
              contexto={valor.hcpNombreCompleto}
            />
          </div>
        </div>
        {porSeccion.actividad && (
          <CamposPersonalizadosSeccion campos={porSeccion.actividad} valores={valor.camposPersonalizados} valoresParaCalculo={valoresParaCalculo} onChange={setCampoPersonalizado} />
        )}
      </SeccionAcordeon>

      <SeccionAcordeon value="hcp" titulo="HCP">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectorHcpDelEvento
            id="convenio-speaker"
            valor={valor.speakerId}
            onChange={onCambiaSpeaker}
            onLimpiar={() => onChange({ ...valor, speakerId: "" })}
            eventoOrigenId={valor.eventoOrigenId}
            eventosDisponibles={eventosDisponibles}
            speakersDisponibles={speakersDisponibles}
            documentosExistentes={documentosExistentes}
            documentoActualId={documentoActualId}
            nombreDocumento="Convenio de Pago a HCP"
            ayuda="Al elegir el speaker, se precargan sus datos como HCP — puedes corregirlos si hace falta."
            avisoExtra={advertenciaVigenciaSpeaker ? <p className="text-xs text-amber-700">{advertenciaVigenciaSpeaker}</p> : null}
            error={errores.speakerId}
            disabled={soloLectura}
          />
          <Campo label={`${etiqueta("hcpNombreCompleto")} *`} error={errores.hcpNombreCompleto}>
            <Input value={valor.hcpNombreCompleto} disabled={soloLectura} onChange={(e) => set("hcpNombreCompleto", e.target.value)} />
          </Campo>
          <Campo label="Número de documento">
            <Input value={valor.hcpNumeroDocumento} disabled={soloLectura} onChange={(e) => set("hcpNumeroDocumento", e.target.value)} />
          </Campo>
          <Campo label="Especialidad">
            <Input value={valor.hcpEspecialidad} disabled={soloLectura} onChange={(e) => set("hcpEspecialidad", e.target.value)} />
          </Campo>
          <Campo label={`${etiqueta("hcpCedulaLicencia")} *`} error={errores.hcpCedulaLicencia}>
            <Input value={valor.hcpCedulaLicencia} disabled={soloLectura} onChange={(e) => set("hcpCedulaLicencia", e.target.value)} />
          </Campo>
          <Campo label={etiqueta("hcpRFC")}>
            <Input value={valor.hcpRFC} disabled={soloLectura} onChange={(e) => set("hcpRFC", e.target.value)} />
          </Campo>
          <Campo label={`${etiqueta("hcpDireccion")} *`} error={errores.hcpDireccion}>
            <Input value={valor.hcpDireccion} disabled={soloLectura} onChange={(e) => set("hcpDireccion", e.target.value)} />
          </Campo>
          <SelectPaisEstadoCiudad
            idPrefix="convenio-hcp"
            etiquetaPais={`${etiqueta("hcpPais")} *`}
            etiquetaEstado="Estado/Provincia/Departamento *"
            etiquetaCiudad={`${etiqueta("hcpCiudad")} *`}
            valorPais={valor.hcpPais}
            valorEstado={valor.hcpEstadoProvincia}
            valorCiudad={valor.hcpCiudad}
            onChangePaisEstadoCiudad={(hcpPais, hcpEstadoProvincia, hcpCiudad) => onChange({ ...valor, hcpPais, hcpEstadoProvincia, hcpCiudad })}
            errorPais={errores.hcpPais}
            errorEstado={errores.hcpEstadoProvincia}
            errorCiudad={errores.hcpCiudad}
            disabled={soloLectura}
          />
          <div className="flex flex-col gap-1.5">
            <Label>Hoja de vida / CV adjunto</Label>
            <ToggleCapsula
              value={valor.cvAdjunto ? "si" : "no"}
              onValueChange={(v) => set("cvAdjunto", v === "si")}
              opciones={[
                { value: "no", label: "No" },
                { value: "si", label: "Sí" },
              ]}
              disabled={soloLectura}
            />
          </div>
        </div>
      </SeccionAcordeon>

      <SeccionAcordeon
        value="consejo"
        titulo="Consejo de Asesores"
        accionesHeader={
          <ToggleCapsula
            value={valor.esConsejoAsesores ? "si" : "no"}
            onValueChange={(v) => set("esConsejoAsesores", v === "si")}
            opciones={[
              { value: "no", label: "No" },
              { value: "si", label: "Sí" },
            ]}
            disabled={soloLectura}
          />
        }
      >
        {valor.esConsejoAsesores && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Título del Consejo de Asesores *" error={errores.tituloConsejoAsesores}>
              <Input value={valor.tituloConsejoAsesores} disabled={soloLectura} onChange={(e) => set("tituloConsejoAsesores", e.target.value)} />
            </Campo>
            <Campo label="Número de HCPs convocados *" error={errores.numeroHCPConsejo}>
              <Input type="number" min={0} value={valor.numeroHCPConsejo ?? ""} disabled={soloLectura} onChange={(e) => set("numeroHCPConsejo", e.target.value === "" ? null : Math.max(0, Number(e.target.value)))} />
            </Campo>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="convenio-justificacion-consejo">Justificación del número de HCPs *</Label>
              <Textarea id="convenio-justificacion-consejo" value={valor.justificacionNumeroHCP} disabled={soloLectura} onChange={(e) => set("justificacionNumeroHCP", e.target.value)} />
              {errores.justificacionNumeroHCP && <p className="text-xs text-destructive">{errores.justificacionNumeroHCP}</p>}
            </div>
          </div>
        )}
      </SeccionAcordeon>

      <SeccionAcordeon
        value="gobierno"
        titulo="Funcionario de Gobierno"
        accionesHeader={
          <ToggleCapsula
            value={valor.esFuncionarioGobierno ? "si" : "no"}
            onValueChange={(v) => set("esFuncionarioGobierno", v === "si")}
            opciones={[
              { value: "no", label: "No" },
              { value: "si", label: "Sí" },
            ]}
            disabled={soloLectura}
          />
        }
      >
        {valor.esFuncionarioGobierno && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">Marca si cumple alguno de los siguientes supuestos:</p>
            <div className="flex flex-col gap-1.5">
              <Label>Ocupa un cargo importante en una entidad gubernamental</Label>
              <ToggleCapsula
                value={valor.supuestoCargoImportante ? "si" : "no"}
                onValueChange={(v) => alMarcarSupuesto("supuestoCargoImportante", v === "si")}
                opciones={[
                  { value: "no", label: "No" },
                  { value: "si", label: "Sí" },
                ]}
                disabled={soloLectura}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Es representante de compras, comprador o miembro de comité de compras/adquisiciones</Label>
              <ToggleCapsula
                value={valor.supuestoRepresentanteCompras ? "si" : "no"}
                onValueChange={(v) => alMarcarSupuesto("supuestoRepresentanteCompras", v === "si")}
                opciones={[
                  { value: "no", label: "No" },
                  { value: "si", label: "Sí" },
                ]}
                disabled={soloLectura}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Tiene influencia en decisiones de una agencia gubernamental, entidad, centro de salud, institución, sistema, universidad, organismo público u hospital</Label>
              <ToggleCapsula
                value={valor.supuestoInfluenciaDecisionGubernamental ? "si" : "no"}
                onValueChange={(v) => alMarcarSupuesto("supuestoInfluenciaDecisionGubernamental", v === "si")}
                opciones={[
                  { value: "no", label: "No" },
                  { value: "si", label: "Sí" },
                ]}
                disabled={soloLectura}
              />
            </div>
            {errores.supuestoCargoImportante && <p className="text-xs text-destructive">{errores.supuestoCargoImportante}</p>}
            {valor.advertenciaFuncionarioGobiernoConfirmada && (
              <p className="text-xs text-amber-700">
                Continuando pese a la advertencia — se dejará una nota en el documento impreso, antes del panel de firmas.
              </p>
            )}
          </div>
        )}
      </SeccionAcordeon>

      <SeccionAcordeon value="objetivo" titulo="Objetivo y selección">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="convenio-objetivo">{etiqueta("objetivo")} *</Label>
            <Textarea id="convenio-objetivo" value={valor.objetivo} disabled={soloLectura} onChange={(e) => set("objetivo", e.target.value)} />
            {errores.objetivo && <p className="text-xs text-destructive">{errores.objetivo}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="convenio-criterios">{etiqueta("criteriosSeleccion")} *</Label>
            <Textarea id="convenio-criterios" value={valor.criteriosSeleccion} disabled={soloLectura} onChange={(e) => set("criteriosSeleccion", e.target.value)} />
            {errores.criteriosSeleccion && <p className="text-xs text-destructive">{errores.criteriosSeleccion}</p>}
          </div>
        </div>
        {porSeccion.objetivo && (
          <CamposPersonalizadosSeccion campos={porSeccion.objetivo} valores={valor.camposPersonalizados} valoresParaCalculo={valoresParaCalculo} onChange={setCampoPersonalizado} />
        )}
      </SeccionAcordeon>

      <SeccionAcordeon value="contraprestacion" titulo="Contraprestación">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Entrega 20, pedido explícito: el score va ANTES de "Contraprestación al HCP". */}
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="convenio-score-fmv">Score total FMV Checklist</Label>
            <Input id="convenio-score-fmv" value={scoreFmv ? textoScoreFmv(scoreFmv) : ""} placeholder="—" readOnly disabled className="bg-muted font-semibold" />
            <p className="text-xs text-muted-foreground">
              {scoreFmv
                ? "Calculado automáticamente desde el FMV Checklist de este HCP en el evento; no se puede modificar. Queda congelado al guardar y firmar el convenio."
                : sinFmvParaScore
                  ? "Todavía no hay un FMV Checklist de este HCP para el evento: el score aparecerá cuando exista."
                  : "Se calcula automáticamente al elegir el evento y el HCP."}
            </p>
          </div>
          <Campo label={`${etiqueta("contraprestacionHCP")} *`} error={errores.contraprestacionHCP}>
            <InputMoneda
              value={valor.contraprestacionHCP}
              moneda={valor.monedaContraprestacion}
              disabled={soloLectura}
              onChange={(v) => set("contraprestacionHCP", v)}
            />
          </Campo>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="convenio-moneda">{etiqueta("monedaContraprestacion")} *</Label>
            <Select value={valor.monedaContraprestacion} onValueChange={(v) => set("monedaContraprestacion", v)} disabled={soloLectura}>
              <SelectTrigger id="convenio-moneda"><SelectValue placeholder="Selecciona una moneda" /></SelectTrigger>
              <SelectContent>
                {monedas.map((op) => (
                  <SelectItem key={op} value={op}>{op}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errores.monedaContraprestacion && <p className="text-xs text-destructive">{errores.monedaContraprestacion}</p>}
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>¿Es consistente con el Tabulador de Tarifas aprobado?</Label>
            <ToggleCapsula
              value={valor.consistenteTabuladorTarifas ? "si" : "no"}
              onValueChange={(v) => set("consistenteTabuladorTarifas", v === "si")}
              opciones={[
                { value: "no", label: "No" },
                { value: "si", label: "Sí" },
              ]}
              disabled={soloLectura}
            />
          </div>
          <div className="sm:col-span-2">
            <VisorArchivo archivoId={formatoFmvId} etiqueta="Ver formato oficial FMV vigente" size="sm" variant="outline" />
            {!formatoFmvId && <p className="text-xs text-muted-foreground">Todavía no hay un formato oficial FMV vigente cargado en Configuración de Campos.</p>}
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="convenio-explicacion">
              {valor.consistenteTabuladorTarifas
                ? "Si concuerda con la Tarjeta de Tarifas aprobada, especifique cómo se llegó a la Contraprestación total *"
                : "La Contraprestación no es consistente con el Tabulador de Tarifas — explique cómo se estableció *"}
            </Label>
            <Textarea id="convenio-explicacion" value={valor.explicacionSiNoConsistente} disabled={soloLectura} onChange={(e) => set("explicacionSiNoConsistente", e.target.value)} />
            {errores.explicacionSiNoConsistente && <p className="text-xs text-destructive">{errores.explicacionSiNoConsistente}</p>}
          </div>
        </div>
      </SeccionAcordeon>

      <SeccionAcordeon
        value="catering"
        titulo="Catering"
        accionesHeader={
          <ToggleCapsula
            value={incluyeCatering ? "si" : "no"}
            onValueChange={(v) => {
              const si = v === "si";
              setIncluyeCatering(si);
              if (!si) onChange({ ...valor, cateringNombreServicio: "", contraprestacionCatering: null });
            }}
            opciones={[
              { value: "no", label: "No" },
              { value: "si", label: "Sí" },
            ]}
            disabled={soloLectura}
          />
        }
      >
        {incluyeCatering && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Nombre del servicio de catering">
              <Input value={valor.cateringNombreServicio} disabled={soloLectura} onChange={(e) => set("cateringNombreServicio", e.target.value)} />
            </Campo>
            <Campo label="Contraprestación del catering">
              <InputMoneda
                value={valor.contraprestacionCatering}
                moneda={valor.monedaContraprestacion}
                disabled={soloLectura}
                onChange={(v) => set("contraprestacionCatering", v)}
              />
            </Campo>
          </div>
        )}
      </SeccionAcordeon>

      <SeccionAcordeon
        value="certificacion"
        titulo="Certificación"
        descripcion="El empleado responsable certifica que el convenio propuesto cumple la política de Bausch Health."
      >
        <div className="flex flex-col gap-2">
          {/* Ajuste de precisión (septiembre 2026), pedido explícito: este
              campo de certificación se muestra como checkbox (no como
              Patrón A1/ToggleCapsula como el resto de decisiones binarias
              de la app) — es una única casilla de conformidad, no una
              pregunta con dos respuestas igualmente válidas. */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="convenio-firma-certifica"
              checked={valor.firmaEmpleadoCertifica}
              disabled={soloLectura}
              onCheckedChange={(v) => set("firmaEmpleadoCertifica", v === true)}
            />
            <Label htmlFor="convenio-firma-certifica" className="font-normal leading-snug">{TEXTO_CERTIFICACION_EMPLEADO_CONVENIO}</Label>
          </div>
          {errores.firmaEmpleadoCertifica && <p className="text-xs text-destructive">{errores.firmaEmpleadoCertifica}</p>}
        </div>
      </SeccionAcordeon>
    </Accordion>

      <Dialog open={!soloLectura && algunSupuestoMarcado && !valor.advertenciaFuncionarioGobiernoConfirmada} onOpenChange={() => {}}>
        <DialogContent className="[&>button]:hidden" onEscapeKeyDown={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Profesional de la salud identificado como funcionario de gobierno</DialogTitle>
            <DialogDescription>
              El establecimiento de un convenio con este HCP puede requerir de procedimientos adicionales. Le
              recomiendo consultar con el área de legal/compliance antes de continuar con esta solicitud.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={cancelarPorFuncionarioGobierno}>
              Cancelar solicitud
            </Button>
            <Button type="button" onClick={confirmarContinuarConFuncionarioGobierno}>
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
  // Corrección (formateo de montos, septiembre 2026): ver comentario
  // equivalente en FormularioEvento.tsx — `Campo` ahora acepta más de un
  // hijo (Input + `<p>` de monto formateado); solo el primer elemento
  // válido recibe el `id`.
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

export { ETIQUETA_CAMPO as ETIQUETA_CAMPO_CONVENIO };
