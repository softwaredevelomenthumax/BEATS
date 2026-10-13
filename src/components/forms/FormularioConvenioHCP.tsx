import * as React from "react";
import { Input } from "@/components/ui/input";
import { InputEmail } from "@/components/ui/input-email";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Building2, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Accordion } from "@/components/ui/accordion";
import { SeccionAcordeon } from "@/components/forms/SeccionAcordeon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CamposPersonalizadosSeccion } from "@/components/CamposPersonalizadosSeccion";
import { useCatalogo } from "@/lib/catalogos";
import { camposAplicables, camposPorSeccion, type CampoPersonalizadoDefinicion } from "@/lib/camposPersonalizados";
import { etiquetaEfectiva, type EtiquetaCampo } from "@/lib/etiquetasCampo";
import { traerEventoPorId, traerEventoConSesionesPorId } from "@/lib/evento";
import { traerCafPorId } from "@/lib/caf";
import { traerConvenioPorEventoId, traerConvenioPorEventoYSpeaker } from "@/lib/convenio";
import { traerSpeakerPorId } from "@/lib/speakers";
import {
  precargarDesdeEventoParaConvenioHCP,
  precargarDesdeCafParaConvenioHCP,
  precargarDesdeSpeakerParaConvenioHCP,
} from "@/lib/precargado";
import {
  armarConsiderandoEs,
  armarAmpliacionEs,
  armarAmpliacionEn,
  armarWhereasEn,
  armarCierreEs,
  armarCierreEn,
  armarAnexoAEs,
  armarAnexoAEn,
  armarAnexoBEs,
  armarAnexoBEn,
} from "@/lib/textosFijosConvenioHCP";
import { InputMoneda } from "@/components/ui/input-moneda";
import { traerVersionVigentePlantilla, sustituirEmpresaEnPlantilla } from "@/lib/plantillaConvenioHCP";
import { SECCIONES_CLAUSULADO } from "@/lib/plantillaConvenioHCP";
import { AvisoIdiomaDesalineado } from "@/components/forms/AvisoIdiomaDesalineado";
import type { Caf, ClausuladoSnapshot, Convenio, Evento } from "@/types";
import type { OpcionEventoOrigenConvenioHCP } from "@/lib/documentosRequeridosEvento";
import type { SpeakerResumen } from "@/lib/speakers";

export interface DatosFormularioConvenioHCP {
  eventoOrigenId: string;
  cafId: string;
  speakerId: string;
  consultorNombre: string;
  consultorIdentificacion: string;
  consultorCredenciales: string;
  consultorDireccion: string;
  consultorEmail: string;
  companiaNombre: string;
  fechaEfectiva: string;
  objetivoConsultoria: string;
  objetivoConsultoriaEn: string;
  serviciosExhibitA: string;
  serviciosExhibitAEn: string;
  compensacion: number | null;
  moneda: string;
  plazoPagoDias: number | null;
  comentariosPago: string;
  comentariosPagoEn: string;
  nombreDirectorGeneral: string;
  clausulasAjustadas: string;
  cierreEs: string;
  cierreEn: string;
  camposPersonalizados: Record<string, unknown>;
  /** Entrega 32: ver `ConvenioHcp.elaboradoEnContratosCorporativo`. */
  elaboradoEnContratosCorporativo: boolean;
}

export const CONVENIO_HCP_VACIO: DatosFormularioConvenioHCP = {
  eventoOrigenId: "",
  cafId: "",
  speakerId: "",
  consultorNombre: "",
  consultorIdentificacion: "",
  consultorCredenciales: "",
  consultorDireccion: "",
  consultorEmail: "",
  companiaNombre: "",
  fechaEfectiva: "",
  objetivoConsultoria: "",
  objetivoConsultoriaEn: "",
  serviciosExhibitA: "",
  serviciosExhibitAEn: "",
  compensacion: null,
  moneda: "",
  plazoPagoDias: null,
  comentariosPago: "",
  comentariosPagoEn: "",
  nombreDirectorGeneral: "",
  clausulasAjustadas: "",
  cierreEs: "",
  cierreEn: "",
  camposPersonalizados: {},
  elaboradoEnContratosCorporativo: false,
};

const ETIQUETA_CAMPO: Record<string, string> = {
  consultorNombre: "HCP / Consultor — nombre",
  consultorIdentificacion: "HCP / Consultor — identificación",
  consultorCredenciales: "HCP / Consultor — credenciales",
  consultorDireccion: "HCP / Consultor — dirección",
  consultorEmail: "HCP / Consultor — correo electrónico",
  companiaNombre: "Nombre de la compañía",
  fechaEfectiva: "Fecha efectiva",
  nombreDirectorGeneral: "Nombre de quien firma por la compañía",
  objetivoConsultoria: "Considerando (ES)",
  objetivoConsultoriaEn: "Whereas (EN)",
  serviciosExhibitA: "Servicios — Anexo A (ES)",
  serviciosExhibitAEn: "Services — Exhibit A (EN)",
  cierreEs: "Cierre (ES)",
  // Ajuste de precisión (septiembre 2026), pedido explícito: renombrado de
  // "Cierre (EN)" a "Closure (EN)".
  cierreEn: "Closure (EN)",
  compensacion: "Compensación / Honorarios",
  moneda: "Moneda",
  plazoPagoDias: "Plazo de pago (días)",
  comentariosPago: "Comentarios sobre el pago (ES)",
  // Ajuste de precisión (septiembre 2026), pedido explícito: renombrado de
  // "Comentarios sobre el pago (EN)" a "Payment Remarks (EN)".
  comentariosPagoEn: "Payment Remarks (EN)",
};

export function calcularErroresConvenioHCP(datos: DatosFormularioConvenioHCP): Record<string, string> {
  const errores: Record<string, string> = {};
  const requerido = (clave: keyof DatosFormularioConvenioHCP) => {
    if (!String(datos[clave] ?? "").trim()) {
      errores[clave] = `${ETIQUETA_CAMPO[clave] ?? clave} es obligatorio.`;
    }
  };

  requerido("eventoOrigenId");
  // Entrega 32: un convenio que se elabora en el aplicativo corporativo de contratos no se diligencia en BEATS;
  // solo hacen falta el evento y el HCP (los dos vienen en la misma opción del selector de origen).
  if (datos.elaboradoEnContratosCorporativo) {
    if (!datos.speakerId) errores.eventoOrigenId = "Selecciona el evento y el HCP.";
    return errores;
  }
  requerido("consultorNombre");
  requerido("consultorIdentificacion");
  requerido("consultorDireccion");
  requerido("consultorEmail");
  requerido("companiaNombre");
  requerido("objetivoConsultoria");
  requerido("serviciosExhibitA");
  requerido("moneda");
  requerido("nombreDirectorGeneral");
  // Ajuste de precisión (septiembre 2026), pedido explícito: estos 5 campos
  // pasan a ser obligatorios (antes solo lo eran "Considerando (ES)" y
  // "Servicios — Anexo A (ES)", arriba).
  requerido("objetivoConsultoriaEn");
  requerido("cierreEs");
  requerido("cierreEn");
  requerido("serviciosExhibitAEn");
  requerido("comentariosPago");
  // Ajuste de precisión (septiembre/octubre 2026), pedido explícito: "Fecha
  // efectiva", "Plazo de pago (días)" y "Payment Remarks (EN)" pasan a ser
  // obligatorios.
  requerido("fechaEfectiva");
  requerido("plazoPagoDias");
  requerido("comentariosPagoEn");

  if (datos.consultorEmail && !/^\S+@\S+\.\S+$/.test(datos.consultorEmail)) {
    errores.consultorEmail = "El correo del consultor no es válido.";
  }
  if (!datos.compensacion || datos.compensacion <= 0) {
    errores.compensacion = "La compensación debe ser mayor a cero.";
  }

  return errores;
}

interface Props {
  valor: DatosFormularioConvenioHCP;
  onChange: (valor: DatosFormularioConvenioHCP) => void;
  errores: Record<string, string>;
  eventosDisponibles: OpcionEventoOrigenConvenioHCP[];
  speakersDisponibles: SpeakerResumen[];
  /** Nombres de los usuarios registrados con el rol "Gerencia General / Rep. Legal" — solo alimenta el selector rápido, el campo sigue siendo texto libre editable. */
  nombresGerenciaGeneral?: string[];
  camposPersonalizadosDefinidos: CampoPersonalizadoDefinicion[];
  etiquetasCampo: EtiquetaCampo[];
  empresaGrupo: string;
  pais: string;
  soloLectura?: boolean;
  /** Entrega 32: valores con los que se abrió la edición; permite avisar cuando solo se corrigió uno de los dos idiomas. */
  valorOriginal?: DatosFormularioConvenioHCP;
  /**
   * Octubre 2026: mientras el Convenio HCP es un borrador se puede reversar la decisión de dónde se elabora
   * (BEATS ↔ aplicativo corporativo). Se activa al editar un borrador.
   */
  permitirCambiarModalidad?: boolean;
  /** Entrega 32: al elegir el evento de origen pregunta dónde se elaborará (BEATS o aplicativo corporativo). Solo al crear. */
  preguntarModalidad?: boolean;
  /** Ver el `useEffect` de precargado inicial más abajo — viene de "Tareas Pendientes" cuando se abre este formulario para diligenciar una tarea concreta. */
  precargarEventoOrigenId?: string;
  precargarSpeakerId?: string;
}

export function FormularioConvenioHCP({
  valor,
  onChange,
  errores,
  eventosDisponibles,
  speakersDisponibles,
  nombresGerenciaGeneral = [],
  camposPersonalizadosDefinidos,
  etiquetasCampo,
  empresaGrupo,
  pais,
  soloLectura: soloLecturaProp,
  valorOriginal,
  preguntarModalidad,
  permitirCambiarModalidad,
  precargarEventoOrigenId,
  precargarSpeakerId,
}: Props) {
  // Entrega 32: con el convenio corporativo todo el formulario queda deshabilitado, salvo el evento de origen
  // (que trae el HCP). `soloLecturaProp` es el solo lectura "de verdad" (documento ya enviado).
  const corporativo = Boolean(valor.elaboradoEnContratosCorporativo);
  const soloLectura = Boolean(soloLecturaProp) || corporativo;
  const [eventoPreguntado, setEventoPreguntado] = React.useState("");
  const [preguntaAbierta, setPreguntaAbierta] = React.useState(false);
  const valorRef = React.useRef(valor);
  valorRef.current = valor;
  function elegirModalidad(enContratosCorporativo: boolean) {
    setPreguntaAbierta(false);
    onChange({ ...valorRef.current, elaboradoEnContratosCorporativo: enContratosCorporativo });
  }
  const { opciones: monedas } = useCatalogo("monedas");
  const { opciones: empresas } = useCatalogo("empresasGrupo");

  // Rediseño de la ventana "Convenio HCP" (septiembre 2026): el Evento y la
  // "Convenio de Pago a HCP" (Anexo A: tipo de servicio/actividad/tema) y el
  // Evento completo (Anexo A: listado de sesiones) se guardan aparte del
  // precargado campo-a-campo genérico (`usePrecargado`) porque alimentan
  // botones "Generar texto sugerido" que combinan VARIOS documentos de
  // origen a la vez, no un mapeo 1 a 1 campo por campo.
  const [eventoElegido, setEventoElegido] = React.useState<Evento | null>(null);
  const [convenioPagoElegido, setConvenioPagoElegido] = React.useState<Convenio | null>(null);
  const [cafElegido, setCafElegido] = React.useState<Caf | null>(null);
  const [clausuladoVigente, setClausuladoVigente] = React.useState<ClausuladoSnapshot | null>(null);

  React.useEffect(() => {
    if (!valor.cafId) { setCafElegido(null); return; }
    let cancelado = false;
    traerCafPorId(valor.cafId).then((c) => { if (!cancelado) setCafElegido(c); }).catch(() => { if (!cancelado) setCafElegido(null); });
    return () => { cancelado = true; };
  }, [valor.cafId]);

  React.useEffect(() => {
    if (!valor.eventoOrigenId) {
      setEventoElegido(null);
      setConvenioPagoElegido(null);
      return;
    }
    let cancelado = false;
    // Corrección: se necesita el evento CON sesiones para el listado del
    // Anexo A (`traerEventoPorId` las omite a propósito — ver su
    // comentario — porque los demás documentos que la usan para precargar
    // no las necesitan). Esto solo depende de `eventoOrigenId` — NO se
    // condiciona a que también haya `speakerId` (un documento creado antes
    // de esta ronda, cuando el speaker era opcional, puede no tenerlo
    // guardado, y "Generar texto sugerido" del Anexo A no debe quedar
    // bloqueado por eso; corrección de una ronda anterior que sí lo exigía
    // y dejaba el botón deshabilitado para esos documentos).
    traerEventoConSesionesPorId(valor.eventoOrigenId).then((ev) => { if (!cancelado) setEventoElegido(ev); }).catch(() => { if (!cancelado) setEventoElegido(null); });
    // El Convenio de Pago a HCP (para "tipo de servicio/actividad/tema") se
    // busca por evento+speaker cuando hay speaker (un evento con varios
    // speakers puede tener un Convenio distinto para cada uno); si el
    // documento no tiene speaker guardado, se cae al criterio anterior
    // ("el más reciente del evento") en vez de quedarse sin nada.
    (valor.speakerId
      ? traerConvenioPorEventoYSpeaker(valor.eventoOrigenId, valor.speakerId)
      : traerConvenioPorEventoId(valor.eventoOrigenId)
    ).then((c) => { if (!cancelado) setConvenioPagoElegido(c); }).catch(() => { if (!cancelado) setConvenioPagoElegido(null); });
    return () => { cancelado = true; };
  }, [valor.eventoOrigenId, valor.speakerId]);

  // Vista previa del clausulado legal vigente (15 numerales + Anexos C/D)
  // con el nombre de la compañía ya sustituido — informativa dentro de ESTE
  // formulario de creación/edición. El clausulado real que queda adjunto al
  // documento se congela al crearlo (`crearConvenioHCP`, `clausulado_snapshot`)
  // y sus ajustes puntuales por cláusula se hacen DESPUÉS de creado, desde
  // "Ajustar una cláusula" en el detalle (`DetalleConvenioHCP.tsx`) — ese
  // mecanismo ya existe y exige un `convenioHcpId` real, que todavía no
  // existe mientras se está llenando este formulario. Mostrarlo aquí en
  // modo vista previa (no editable) cumple "que sea visible en esta
  // ventana, no diferido" sin duplicar esa infraestructura de ajustes antes
  // de tiempo.
  React.useEffect(() => {
    traerVersionVigentePlantilla().then((v) => setClausuladoVigente(v ? sustituirEmpresaEnPlantilla(v, valor.companiaNombre) : null)).catch(() => setClausuladoVigente(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor.companiaNombre]);

  function set<K extends keyof DatosFormularioConvenioHCP>(clave: K, v: DatosFormularioConvenioHCP[K]) {
    onChange({ ...valor, [clave]: v });
  }

  function setCampoPersonalizado(clave: string, v: unknown) {
    onChange({ ...valor, camposPersonalizados: { ...valor.camposPersonalizados, [clave]: v } });
  }

  // Ronda de correcciones "Nuevo Convenio HCP" (septiembre 2026): el
  // selector "Evento de origen" ahora identifica una combinación
  // evento+speaker (ver `OpcionEventoOrigenConvenioHCP`) y ya trae consigo
  // el CAF resuelto — los selectores "CAF asociado" y "Speaker (opcional)"
  // se retiraron del formulario, así que este único handler precarga en UN
  // solo `onChange` todo lo derivable de los tres documentos de origen
  // (Evento, Speaker, CAF) a la vez, evitando el patrón de varias llamadas
  // encadenadas a `set()` que pisaban cambios entre sí (mismo bug corregido
  // en los generadores de texto más abajo).
  async function onCambiaEventoOrigen(idCompuesto: string) {
    const opcion = eventosDisponibles.find((o) => o.id === idCompuesto);
    if (!opcion) return;
    // Entrega 40: cada fuente es independiente (una consulta fallida ya no descarta las otras dos) y la
    // escritura se fusiona sobre el valor MÁS RECIENTE (`valorRef`) — antes partía del `valor` del render en que se
    // eligió y, al llegar las respuestas, pisaba lo que se hubiera escrito mientras tanto.
    const [evento, speaker, caf] = await Promise.all([
      traerEventoPorId(opcion.eventoId).catch(() => null),
      traerSpeakerPorId(opcion.speakerId).catch(() => null),
      traerCafPorId(opcion.cafId).catch(() => null),
    ]);
    onChange({
      ...valorRef.current,
      eventoOrigenId: opcion.eventoId,
      speakerId: opcion.speakerId,
      cafId: opcion.cafId,
      ...(evento ? precargarDesdeEventoParaConvenioHCP(evento) : {}),
      ...(speaker ? precargarDesdeSpeakerParaConvenioHCP(speaker) : {}),
      ...(caf ? precargarDesdeCafParaConvenioHCP(caf) : {}),
    });
    if (preguntarModalidad && !soloLecturaProp && opcion.id !== eventoPreguntado) {
      setEventoPreguntado(opcion.id);
      setPreguntaAbierta(true);
    }
  }

  // "Tareas Pendientes" → "diligenciar este documento" (ajuste de precisión,
  // septiembre 2026, pedido explícito): este formulario combina evento +
  // speaker + CAF en un único selector compuesto (`onCambiaEventoOrigen`
  // arriba), a diferencia de los otros 4 formularios (que sí usan el hook
  // genérico `usePrecargaInicialOrigen`) — se busca la opción compuesta que
  // coincide y se dispara el mismo `onCambiaEventoOrigen` de siempre, una
  // sola vez al montar.
  //
  // Entrega 40 — CAUSA REAL de que desde «Tareas Pendientes» este formulario abriera vacío: la búsqueda de la opción
  // compuesta corría UNA sola vez al montar, cuando la lista `eventosDisponibles` todavía estaba vacía (la página la
  // trae de la base de datos después de montar), y se marcaba como «ya aplicada» sin haber encontrado nada. Ahora
  // espera a que las opciones lleguen y solo entonces se marca como aplicada.
  const yaAplicoPrecargaInicial = React.useRef(false);
  React.useEffect(() => {
    if (yaAplicoPrecargaInicial.current) return;
    if (!precargarEventoOrigenId || valor.eventoOrigenId) {
      yaAplicoPrecargaInicial.current = true;
      return;
    }
    if (eventosDisponibles.length === 0) return; // las opciones todavía no llegan: se reintenta cuando lleguen
    yaAplicoPrecargaInicial.current = true;
    const opcion = eventosDisponibles.find(
      (o) => o.eventoId === precargarEventoOrigenId && (!precargarSpeakerId || o.speakerId === precargarSpeakerId),
    );
    if (opcion) onCambiaEventoOrigen(opcion.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventosDisponibles]);

  const etiqueta = (clave: string) =>
    etiquetaEfectiva(etiquetasCampo, "convenioHCP", clave, empresaGrupo, ETIQUETA_CAMPO[clave] ?? clave);

  const aplicables = camposAplicables(camposPersonalizadosDefinidos, "convenioHCP", empresaGrupo, pais);
  const porSeccion = camposPorSeccion(aplicables);
  const valoresParaCalculo = { ...valor, ...valor.camposPersonalizados };

  const especialidadSpeaker = speakersDisponibles.find((s) => s.id === valor.speakerId)?.especialidad ?? "";
  // "Tema" (Anexo A): la especificación lo pide desde el formulario
  // "Solicitud de convenio de pago a HCP", pero ese documento (`Convenio`
  // en `types.ts`) no tiene ningún campo llamado literalmente "tema" — el
  // candidato más cercano por significado es `nombreEventoServicio`
  // ("Nombre del evento/servicio"), que es lo que efectivamente identifica
  // sobre qué trata la actividad. Se reutiliza ese campo en vez de agregar
  // una columna nueva para un concepto que ya existe con otro nombre.
  const tema = convenioPagoElegido?.nombreEventoServicio ?? "";

  // Corrección de esta ronda: cada uno de estos generadores llamaba a `set`
  // (que hace `onChange({ ...valor, [clave]: v })`) dos veces seguidas para
  // el mismo par ES/EN — ambas llamadas cerraban sobre el mismo `valor`
  // "congelado" del render, así que la SEGUNDA llamada pisaba silenciosamente
  // el cambio de la primera (el campo EN, que siempre se fija segundo,
  // sobrevivía; el ES se perdía). Se corrige fusionando cada par en un solo
  // `onChange` con ambos campos a la vez.
  const origenAmpliacion = { evento: eventoElegido, convenioPago: convenioPagoElegido, caf: cafElegido };
  const ampliacionEs = armarAmpliacionEs(origenAmpliacion);
  const ampliacionEn = armarAmpliacionEn(origenAmpliacion);
  // Último texto sugerido por el sistema: mientras el campo siga igual a él
  // (o vacío / con marcador), se REFRESCA al cambiar las fuentes; si el usuario
  // lo editó a mano, no se pisa.
  const ultimoConsiderando = React.useRef<{ es: string; en: string } | null>(null);
  const ultimoAnexoB = React.useRef<{ es: string; en: string } | null>(null);
  const ultimoAnexoA = React.useRef<{ es: string; en: string } | null>(null);

  function generarConsiderandoWhereas() {
    const es = armarConsiderandoEs(valor.companiaNombre, especialidadSpeaker, ampliacionEs);
    const en = armarWhereasEn(valor.companiaNombre, especialidadSpeaker, ampliacionEn);
    ultimoConsiderando.current = { es, en };
    onChange({ ...valor, objetivoConsultoria: es, objetivoConsultoriaEn: en });
  }

  function generarCierre() {
    onChange({ ...valor, cierreEs: armarCierreEs(), cierreEn: armarCierreEn() });
  }

  // CORRECCIÓN (septiembre 2026): ya no exige `eventoElegido` — mismo
  // criterio que `generarConsiderandoWhereas`/`generarCierre`/`generarAnexoB`,
  // que siempre pueden generar un texto (con marcadores entre corchetes
  // donde falte información) en vez de quedar inhabilitados hasta que
  // exista un "Evento de origen" con Convenio/CAF/FMV ya creados. Ver
  // `armarAnexoAEs`/`armarAnexoAEn`/`listadoSesiones` en
  // `lib/textosFijosConvenioHCP.ts` para el marcador que se usa sin evento.
  function generarAnexoA() {
    const datosAnexoA = {
      companiaNombre: valor.companiaNombre,
      tipoServicio: convenioPagoElegido?.tipoServicio ?? "",
      tipoActividad: convenioPagoElegido?.tipoActividad ?? "",
      tema,
      evento: eventoElegido,
    };
    const es = armarAnexoAEs(datosAnexoA);
    const en = armarAnexoAEn(datosAnexoA);
    ultimoAnexoA.current = { es, en };
    onChange({ ...valor, serviciosExhibitA: es, serviciosExhibitAEn: en });
  }

  // Corrección de esta ronda: "Anexo B" nunca tuvo un botón "Generar texto
  // sugerido" (el reporte de que "tampoco cargan los textos sugeridos del
  // Anexo B" es porque, sencillamente, no existía) — se agrega aquí mismo
  // patrón que los demás bloques, usando los propios campos de esta sección
  // (compensación/moneda/plazo de pago).
  function generarAnexoB() {
    const datosAnexoB = { compensacion: valor.compensacion, moneda: valor.moneda, plazoPagoDias: valor.plazoPagoDias };
    const es = armarAnexoBEs(datosAnexoB);
    const en = armarAnexoBEn(datosAnexoB);
    ultimoAnexoB.current = { es, en };
    onChange({ ...valor, comentariosPago: es, comentariosPagoEn: en });
  }

  // Autocompletado la primera vez que hay suficiente información y el
  // campo todavía está vacío — no vuelve a tocarlo si el usuario ya
  // escribió o generó algo (ver nota de diseño en
  // `lib/textosFijosConvenioHCP.ts`).
  React.useEffect(() => {
    if (soloLectura || !valor.companiaNombre) return;
    const es = armarConsiderandoEs(valor.companiaNombre, especialidadSpeaker, ampliacionEs);
    const en = armarWhereasEn(valor.companiaNombre, especialidadSpeaker, ampliacionEn);
    const previo = ultimoConsiderando.current;
    const vacio = !valor.objetivoConsultoria && !valor.objetivoConsultoriaEn;
    const intacto = !!previo && valor.objetivoConsultoria === previo.es && valor.objetivoConsultoriaEn === previo.en;
    if (!vacio && !intacto) return;
    if (previo && previo.es === es && previo.en === en) return;
    ultimoConsiderando.current = { es, en };
    onChange({ ...valor, objetivoConsultoria: es, objetivoConsultoriaEn: en });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor.companiaNombre, especialidadSpeaker, ampliacionEs, ampliacionEn, soloLectura]);

  React.useEffect(() => {
    if (soloLectura) return;
    if (valor.cierreEs || valor.cierreEn) return;
    generarCierre();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soloLectura]);

  // CORRECCIÓN (septiembre 2026): ya no espera a `eventoElegido`/
  // `convenioPagoElegido` para autocompletar la primera vez — mismo
  // criterio que el autocompletado de Considerando/Cierre/Anexo B, que
  // tampoco esperan a que existan sus datos de origen. Sigue sin pisar un
  // texto ya generado o editado a mano (el `if` de arriba).
  React.useEffect(() => {
    if (soloLectura) return;
    const datos = {
      companiaNombre: valor.companiaNombre,
      tipoServicio: convenioPagoElegido?.tipoServicio ?? "",
      tipoActividad: convenioPagoElegido?.tipoActividad ?? "",
      tema,
      evento: eventoElegido,
    };
    const es = armarAnexoAEs(datos);
    const en = armarAnexoAEn(datos);
    const previo = ultimoAnexoA.current;
    const vacio = !valor.serviciosExhibitA && !valor.serviciosExhibitAEn;
    const intacto = !!previo && valor.serviciosExhibitA === previo.es && valor.serviciosExhibitAEn === previo.en;
    if (!vacio && !intacto) return;
    if (previo && previo.es === es && previo.en === en) return;
    ultimoAnexoA.current = { es, en };
    onChange({ ...valor, serviciosExhibitA: es, serviciosExhibitAEn: en });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventoElegido, convenioPagoElegido, valor.companiaNombre, soloLectura]);

  // Anexo B: el [plazo de pago en días] se toma de "Plazo de pago (días)" y el
  // texto se refresca al cambiar monto/moneda/plazo mientras no se haya editado.
  React.useEffect(() => {
    if (soloLectura) return;
    if (valor.compensacion == null && !valor.moneda && valor.plazoPagoDias == null) return;
    const datos = { compensacion: valor.compensacion, moneda: valor.moneda, plazoPagoDias: valor.plazoPagoDias };
    const es = armarAnexoBEs(datos);
    const en = armarAnexoBEn(datos);
    const previo = ultimoAnexoB.current;
    const vacio = !valor.comentariosPago && !valor.comentariosPagoEn;
    const conMarcador = valor.comentariosPago.includes("[plazo de pago en días]") || valor.comentariosPagoEn.includes("[payment term in days]");
    const intacto = !!previo && valor.comentariosPago === previo.es && valor.comentariosPagoEn === previo.en;
    if (!vacio && !intacto && !conMarcador) return;
    if (previo && previo.es === es && previo.en === en && !conMarcador) return;
    ultimoAnexoB.current = { es, en };
    onChange({
      ...valor,
      comentariosPago: conMarcador && !intacto ? valor.comentariosPago.replace("[plazo de pago en días]", valor.plazoPagoDias != null ? `${valor.plazoPagoDias} día(s) calendario` : "[plazo de pago en días]") : es,
      comentariosPagoEn: conMarcador && !intacto ? valor.comentariosPagoEn.replace("[payment term in days]", valor.plazoPagoDias != null ? `${valor.plazoPagoDias} calendar day(s)` : "[payment term in days]") : en,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor.compensacion, valor.moneda, valor.plazoPagoDias, soloLectura]);

  return (
    <div className="flex flex-col gap-3">
      <Dialog open={preguntaAbierta} onOpenChange={(abierto) => !abierto && setPreguntaAbierta(false)}>
        <DialogContent className="max-w-lg" data-testid="cvhcp-pregunta-modalidad">
          <DialogHeader>
            <DialogTitle>¿Dónde se elaborará este Convenio HCP?</DialogTitle>
            <DialogDescription>
              Puedes elaborarlo aquí en BEATS (con su flujo de aprobación) o, si ya lo manejas en el aplicativo corporativo de contratos, registrarlo para continuar con el trámite.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => elegirModalidad(false)}
              className="flex flex-col items-start gap-1.5 rounded-lg border p-4 text-left transition-colors hover:border-primary/60 hover:bg-accent/40"
              data-testid="cvhcp-modalidad-beats"
            >
              <FileText className="size-5 text-primary" />
              <span className="text-sm font-semibold">Crearlo en BEATS</span>
              <span className="text-xs text-muted-foreground">Diligencio el formulario y sigue el flujo de aprobación (Legal/Compliance → Gerencia General).</span>
            </button>
            <button
              type="button"
              onClick={() => elegirModalidad(true)}
              className="flex flex-col items-start gap-1.5 rounded-lg border p-4 text-left transition-colors hover:border-primary/60 hover:bg-accent/40"
              data-testid="cvhcp-modalidad-corporativo"
            >
              <Building2 className="size-5 text-primary" />
              <span className="text-sm font-semibold">Usaré el aplicativo corporativo de contratos</span>
              <span className="text-xs text-muted-foreground">Se registra aquí sin aprobación; la copia firmada se carga luego en el Expediente del evento.</span>
            </button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPreguntaAbierta(false)}>Decidir después</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {corporativo && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-accent/40 p-3 text-sm" data-testid="cvhcp-banner-corporativo">
          <span className="flex items-center gap-2">
            <Building2 className="size-4 text-primary" />
            Este Convenio HCP se elaborará en el aplicativo corporativo de contratos — el formulario queda deshabilitado y no pasa por aprobación en BEATS.
          </span>
          {(preguntarModalidad || permitirCambiarModalidad) && !soloLecturaProp && (
            <Button type="button" size="sm" variant="outline" onClick={() => elegirModalidad(false)} data-testid="cvhcp-mejor-en-beats">
              Mejor crearlo en BEATS
            </Button>
          )}
        </div>
      )}

      {!corporativo && permitirCambiarModalidad && !soloLecturaProp && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-3 text-sm" data-testid="cvhcp-banner-beats">
          <span className="flex items-center gap-2">
            <FileText className="size-4 text-primary" />
            Este borrador se elabora en BEATS. Mientras siga en borrador puedes cambiar de opinión.
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => elegirModalidad(true)} data-testid="cvhcp-cambiar-a-corporativo">
            Mejor usar el aplicativo corporativo de contratos
          </Button>
        </div>
      )}

      <Accordion
        type="multiple"
        defaultValue={["origen", "consultor", "terminos", "considerando", "clausulado", "cierre", "firma", "anexoA", "anexoB"]}
        className="flex flex-col gap-3"
      >
        <SeccionAcordeon
          value="origen"
          titulo="Origen del contrato"
          descripcion="El Convenio HCP siempre parte de la participación de un speaker externo en un evento — el CAF asociado se resuelve automáticamente."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="cvhcp-evento-origen">Evento de origen (participación académica) *</Label>
              <Select
                value={valor.eventoOrigenId && valor.speakerId ? `${valor.eventoOrigenId}::${valor.speakerId}` : ""}
                onValueChange={onCambiaEventoOrigen}
                disabled={Boolean(soloLecturaProp)}
              >
                <SelectTrigger id="cvhcp-evento-origen"><SelectValue placeholder="Selecciona el evento y el speaker" /></SelectTrigger>
                <SelectContent>
                  {eventosDisponibles.map((ev) => (
                    <SelectItem key={ev.id} value={ev.id}>{ev.etiqueta}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Cada opción combina un evento con uno de sus speakers — elegirla precarga automáticamente el speaker, el CAF asociado y los datos que se puedan derivar de cada uno; puedes corregirlos si hace falta.</p>
              {errores.eventoOrigenId && <p className="text-xs text-destructive">{errores.eventoOrigenId}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cvhcp-compania">{etiqueta("companiaNombre")} *</Label>
              <Select value={valor.companiaNombre} onValueChange={(v) => set("companiaNombre", v)} disabled={soloLectura}>
                <SelectTrigger id="cvhcp-compania"><SelectValue placeholder="Selecciona la compañía" /></SelectTrigger>
                <SelectContent>
                  {empresas.map((op) => (
                    <SelectItem key={op} value={op}>{op}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errores.companiaNombre && <p className="text-xs text-destructive">{errores.companiaNombre}</p>}
            </div>
          </div>
        </SeccionAcordeon>

        <SeccionAcordeon value="consultor" titulo="Consultor">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label={`${etiqueta("consultorNombre")} *`} error={errores.consultorNombre}>
              <Input value={valor.consultorNombre} disabled={soloLectura} onChange={(e) => set("consultorNombre", e.target.value)} />
            </Campo>
            <Campo label={`${etiqueta("consultorIdentificacion")} *`} error={errores.consultorIdentificacion}>
              <Input value={valor.consultorIdentificacion} disabled={soloLectura} onChange={(e) => set("consultorIdentificacion", e.target.value)} />
            </Campo>
            <Campo label={etiqueta("consultorCredenciales")}>
              <Input value={valor.consultorCredenciales} disabled={soloLectura} onChange={(e) => set("consultorCredenciales", e.target.value)} />
            </Campo>
            <Campo label={`${etiqueta("consultorEmail")} *`} error={errores.consultorEmail}>
              <InputEmail value={valor.consultorEmail} disabled={soloLectura} onChange={(e) => set("consultorEmail", e.target.value)} />
            </Campo>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="cvhcp-direccion">{etiqueta("consultorDireccion")} *</Label>
              <Input id="cvhcp-direccion" value={valor.consultorDireccion} disabled={soloLectura} onChange={(e) => set("consultorDireccion", e.target.value)} />
              {errores.consultorDireccion && <p className="text-xs text-destructive">{errores.consultorDireccion}</p>}
            </div>
          </div>
          {porSeccion.consultor && (
            <CamposPersonalizadosSeccion campos={porSeccion.consultor} valores={valor.camposPersonalizados} valoresParaCalculo={valoresParaCalculo} onChange={setCampoPersonalizado} />
          )}
        </SeccionAcordeon>

        <SeccionAcordeon value="terminos" titulo="Términos del contrato">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label={`${etiqueta("fechaEfectiva")} *`} error={errores.fechaEfectiva}>
              <Input type="date" value={valor.fechaEfectiva} disabled={soloLectura} onChange={(e) => set("fechaEfectiva", e.target.value)} />
            </Campo>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cvhcp-director-general">{etiqueta("nombreDirectorGeneral")} *</Label>
              <div className="flex gap-2">
                <Input id="cvhcp-director-general" value={valor.nombreDirectorGeneral} disabled={soloLectura} onChange={(e) => set("nombreDirectorGeneral", e.target.value)} />
                {!soloLectura && nombresGerenciaGeneral.length > 0 && (
                  <Select value="" onValueChange={(v) => set("nombreDirectorGeneral", v)}>
                    <SelectTrigger className="w-40 shrink-0"><SelectValue placeholder="Elegir de la lista" /></SelectTrigger>
                    <SelectContent>
                      {nombresGerenciaGeneral.map((n) => (
                        <SelectItem key={n} value={n}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Sugerido desde los usuarios con rol Gerencia General / Rep. Legal — sigue siendo editable.</p>
              {errores.nombreDirectorGeneral && <p className="text-xs text-destructive">{errores.nombreDirectorGeneral}</p>}
            </div>
          </div>
        </SeccionAcordeon>

        <SeccionAcordeon
          value="considerando"
          titulo="Considerando / Whereas"
          descripcion="Texto legal fijo con un espacio para ampliar información — se sugiere automáticamente y queda libre para editar."
        >
          {!soloLectura && (
            <div className="flex justify-end">
              <Button type="button" variant="outline" size="sm" onClick={generarConsiderandoWhereas}>Generar texto sugerido</Button>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cvhcp-whereas-en">{etiqueta("objetivoConsultoriaEn")} *</Label>
              <Textarea sinMayusculas id="cvhcp-whereas-en" rows={8} value={valor.objetivoConsultoriaEn} disabled={soloLectura} onChange={(e) => set("objetivoConsultoriaEn", e.target.value)} />
              {errores.objetivoConsultoriaEn && <p className="text-xs text-destructive">{errores.objetivoConsultoriaEn}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cvhcp-considerando-es">{etiqueta("objetivoConsultoria")} *</Label>
              <Textarea sinMayusculas id="cvhcp-considerando-es" rows={8} value={valor.objetivoConsultoria} disabled={soloLectura} onChange={(e) => set("objetivoConsultoria", e.target.value)} />
              {errores.objetivoConsultoria && <p className="text-xs text-destructive">{errores.objetivoConsultoria}</p>}
            </div>
            <AvisoIdiomaDesalineado actual={{ es: valor.objetivoConsultoria, en: valor.objetivoConsultoriaEn }} original={valorOriginal ? { es: valorOriginal.objetivoConsultoria, en: valorOriginal.objetivoConsultoriaEn } : undefined} />
          </div>
        </SeccionAcordeon>

        <SeccionAcordeon
          value="clausulado"
          titulo="Clausulado legal (numerales 1 a 15 + Anexos C y D)"
          descripcion="Vista previa de la versión vigente de la plantilla legal, con el nombre de la compañía ya reemplazado. Se adjunta automáticamente al crear el documento; los ajustes puntuales por cláusula (a criterio del solicitante) se hacen desde el detalle del documento, una vez creado."
        >
          {clausuladoVigente ? (
            <div className="flex max-h-96 flex-col gap-3 overflow-y-auto rounded-md border p-3">
              {SECCIONES_CLAUSULADO.map((seccion) => {
                const numeral = clausuladoVigente.numerales.find((n) => `numeral_${n.numero}` === seccion.valor);
                const es = seccion.valor === "anexo_c" ? clausuladoVigente.anexoCEs : seccion.valor === "anexo_d" ? clausuladoVigente.anexoDEs : numeral?.textoEs ?? "";
                const en = seccion.valor === "anexo_c" ? clausuladoVigente.anexoCEn : seccion.valor === "anexo_d" ? clausuladoVigente.anexoDEn : numeral?.textoEn ?? "";
                if (!es && !en) return null;
                return (
                  <div key={seccion.valor} className="grid grid-cols-1 gap-2 border-b pb-2 last:border-b-0 sm:grid-cols-2">
                    <div>
                      <p className="mb-1 text-[11px] font-semibold text-muted-foreground">{seccion.etiqueta} (EN)</p>
                      <p className="whitespace-pre-wrap text-xs">{en || "—"}</p>
                    </div>
                    <div>
                      <p className="mb-1 text-[11px] font-semibold text-muted-foreground">{seccion.etiqueta} (ES)</p>
                      <p className="whitespace-pre-wrap text-xs">{es || "—"}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Todavía no hay una plantilla legal publicada para el Convenio HCP.</p>
          )}
        </SeccionAcordeon>

        <SeccionAcordeon value="cierre" titulo="Cierre del cuerpo del contrato">
          {!soloLectura && (
            <div className="flex justify-end">
              <Button type="button" variant="outline" size="sm" onClick={generarCierre}>Generar texto sugerido</Button>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cvhcp-cierre-en">{etiqueta("cierreEn")} *</Label>
              <Textarea sinMayusculas id="cvhcp-cierre-en" rows={3} value={valor.cierreEn} disabled={soloLectura} onChange={(e) => set("cierreEn", e.target.value)} />
              {errores.cierreEn && <p className="text-xs text-destructive">{errores.cierreEn}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cvhcp-cierre-es">{etiqueta("cierreEs")} *</Label>
              <Textarea sinMayusculas id="cvhcp-cierre-es" rows={3} value={valor.cierreEs} disabled={soloLectura} onChange={(e) => set("cierreEs", e.target.value)} />
              {errores.cierreEs && <p className="text-xs text-destructive">{errores.cierreEs}</p>}
            </div>
            <AvisoIdiomaDesalineado actual={{ es: valor.cierreEs, en: valor.cierreEn }} original={valorOriginal ? { es: valorOriginal.cierreEs, en: valorOriginal.cierreEn } : undefined} />
          </div>
        </SeccionAcordeon>

        <SeccionAcordeon
          value="firma"
          titulo="Firma (primer panel)"
          descripcion="La firma manuscrita registrada de quien firme por la compañía, su nombre, cargo y la fecha/hora de la firma se capturan automáticamente cuando esa persona aprueba la etapa 'Gerencia General / Rep. Legal' de la cadena de aprobación — se muestran en el documento impreso, no aquí. El consultor firma de su puño y letra sobre la copia impresa."
        >
          <p className="text-xs text-muted-foreground">Vista previa disponible en "Ver / Imprimir / Exportar a PDF" una vez el documento esté creado.</p>
        </SeccionAcordeon>

        <SeccionAcordeon
          value="anexoA"
          titulo="Servicios (Anexo A) / Services (Exhibit A)"
          descripcion="Texto legal fijo con el detalle de la(s) sesión(es) del evento — se sugiere automáticamente y queda libre para editar. El segundo panel de firma (idéntico al primero) se imprime después de este anexo."
        >
          {!soloLectura && (
            <div className="flex justify-end">
              <Button type="button" variant="outline" size="sm" onClick={generarAnexoA}>Generar texto sugerido</Button>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cvhcp-servicios-en">{etiqueta("serviciosExhibitAEn")} *</Label>
              <Textarea sinMayusculas id="cvhcp-servicios-en" rows={8} value={valor.serviciosExhibitAEn} disabled={soloLectura} onChange={(e) => set("serviciosExhibitAEn", e.target.value)} />
              {errores.serviciosExhibitAEn && <p className="text-xs text-destructive">{errores.serviciosExhibitAEn}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cvhcp-servicios-es">{etiqueta("serviciosExhibitA")} *</Label>
              <Textarea sinMayusculas id="cvhcp-servicios-es" rows={8} value={valor.serviciosExhibitA} disabled={soloLectura} onChange={(e) => set("serviciosExhibitA", e.target.value)} />
              {errores.serviciosExhibitA && <p className="text-xs text-destructive">{errores.serviciosExhibitA}</p>}
            </div>
            <AvisoIdiomaDesalineado actual={{ es: valor.serviciosExhibitA, en: valor.serviciosExhibitAEn }} original={valorOriginal ? { es: valorOriginal.serviciosExhibitA, en: valorOriginal.serviciosExhibitAEn } : undefined} />
          </div>
        </SeccionAcordeon>

        <SeccionAcordeon
          value="anexoB"
          titulo="Anexo B — Términos de pago"
          descripcion="El resumen de compensación y plazo de pago (comentarios ES/EN) se sugiere automáticamente a partir de los campos de esta sección — se puede editar libremente."
        >
          {!soloLectura && (
            <div className="flex justify-end">
              <Button type="button" variant="outline" size="sm" onClick={generarAnexoB}>Generar texto sugerido</Button>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cvhcp-compensacion">{etiqueta("compensacion")} *</Label>
              <InputMoneda id="cvhcp-compensacion" value={valor.compensacion} moneda={valor.moneda} disabled={soloLectura} onChange={(v) => set("compensacion", v)} />
              {errores.compensacion && <p className="text-xs text-destructive">{errores.compensacion}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cvhcp-moneda">{etiqueta("moneda")} *</Label>
              <Select value={valor.moneda} onValueChange={(v) => set("moneda", v)} disabled={soloLectura}>
                <SelectTrigger id="cvhcp-moneda"><SelectValue placeholder="Selecciona una moneda" /></SelectTrigger>
                <SelectContent>
                  {monedas.map((op) => (
                    <SelectItem key={op} value={op}>{op}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errores.moneda && <p className="text-xs text-destructive">{errores.moneda}</p>}
            </div>
            <Campo label={`${etiqueta("plazoPagoDias")} *`} error={errores.plazoPagoDias}>
              <Input type="number" min={0} value={valor.plazoPagoDias ?? ""} disabled={soloLectura} onChange={(e) => set("plazoPagoDias", e.target.value === "" ? null : Math.max(0, Number(e.target.value)))} />
            </Campo>
            <div />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cvhcp-comentarios-en">{etiqueta("comentariosPagoEn")} *</Label>
              <Textarea sinMayusculas id="cvhcp-comentarios-en" value={valor.comentariosPagoEn} disabled={soloLectura} onChange={(e) => set("comentariosPagoEn", e.target.value)} />
              {errores.comentariosPagoEn && <p className="text-xs text-destructive">{errores.comentariosPagoEn}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cvhcp-comentarios-es">{etiqueta("comentariosPago")} *</Label>
              <Textarea sinMayusculas id="cvhcp-comentarios-es" value={valor.comentariosPago} disabled={soloLectura} onChange={(e) => set("comentariosPago", e.target.value)} />
              {errores.comentariosPago && <p className="text-xs text-destructive">{errores.comentariosPago}</p>}
            </div>
            <AvisoIdiomaDesalineado actual={{ es: valor.comentariosPago, en: valor.comentariosPagoEn }} original={valorOriginal ? { es: valorOriginal.comentariosPago, en: valorOriginal.comentariosPagoEn } : undefined} />
          </div>
        </SeccionAcordeon>
      </Accordion>
    </div>
  );
}

function Campo({ label, error, children }: { label: string; error?: string; children: React.ReactElement }) {
  const id = React.useId();
  const hijo = React.isValidElement(children) ? React.cloneElement(children, { id } as never) : children;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {hijo}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export { ETIQUETA_CAMPO as ETIQUETA_CAMPO_CONVENIO_HCP };
