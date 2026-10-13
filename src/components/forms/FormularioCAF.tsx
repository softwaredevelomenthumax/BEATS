import * as React from "react";
import { Input } from "@/components/ui/input";
import { InputEmail } from "@/components/ui/input-email";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion } from "@/components/ui/accordion";
import { SeccionAcordeon } from "@/components/forms/SeccionAcordeon";
import { CamposPersonalizadosSeccion } from "@/components/CamposPersonalizadosSeccion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, Building2 } from "lucide-react";
import { SelectPaisEstadoCiudad } from "@/components/SelectPaisEstadoCiudad";
import { useCatalogo } from "@/lib/catalogos";
import { camposAplicables, camposPorSeccion, type CampoPersonalizadoDefinicion } from "@/lib/camposPersonalizados";
import { etiquetaEfectiva, type EtiquetaCampo } from "@/lib/etiquetasCampo";
import { useSelectorConPrecargado, usePrecargaInicialOrigen } from "@/hooks/usePrecargado";
import { traerEventoPorId } from "@/lib/evento";
import { traerConvenioPorEventoYSpeaker } from "@/lib/convenio";
import { traerSpeakerPorId } from "@/lib/speakers";
import { InputMoneda } from "@/components/ui/input-moneda";
import {
  precargarDesdeEventoParaCaf,
  precargarDesdeConvenioParaCaf,
  precargarDesdeSpeakerParaCaf,
  precargarContraparteDesdeSpeakerParaCaf,
} from "@/lib/precargado";
import type { OpcionEventoOrigen } from "@/lib/documentosRequeridosEvento";
import type { SpeakerResumen } from "@/lib/speakers";
import { ResumenFirmasCaf } from "@/components/forms/ResumenFirmasCaf";
import { useAuth } from "@/hooks/useAuth";
import { useUsuariosPorId } from "@/hooks/useUsuariosPorId";
import type { LineaFirmaPrevia } from "@/lib/caf";
import { SelectorHcpDelEvento, type DocumentoExistenteSpeaker } from "@/components/forms/SelectorHcpDelEvento";

export interface DatosFormularioCaf {
  eventoOrigenId: string;
  /** Octubre 2026: ver `Caf.elaboradoEnCafCorporativo`. */
  elaboradoEnCafCorporativo: boolean;
  /**
   * Ronda de ajustes de formularios (septiembre 2026), entrega 3: columna
   * lista en el esquema (ver `db/agregar_speaker_caf.sql`) para cuando este
   * formulario tenga su propio selector de speaker (entrega de CAF de esta
   * misma ronda) — por ahora siempre `null`, y las reglas de dependencia se
   * aplican a nivel de evento completo mientras tanto.
   */
  speakerId: string | null;
  tipoContrato: string;
  tipoContratoOtroEspecifique: string;
  solicitanteNombre: string;
  solicitanteTelefono: string;
  directorAreaNombre: string;
  directorAreaCargo: string;
  contraparteNombre: string;
  contraparteNumeroDocumento: string;
  contrapartePais: string;
  contraparteEstadoProvincia: string;
  contraparteCiudad: string;
  contraparteDireccion: string;
  contraparteTelefono: string;
  contraparteCorreo: string;
  contraparteContacto: string;
  dueDiligence: string;
  objetoContrato: string;
  terminoContratoInicio: string;
  terminoContratoFin: string;
  terminoContratoDeterminable: boolean;
  comentarios: string;
  /** Entrega 24 (formato CAF). */
  responsablesContrato: string;
  avisoAtencion: string;
  avisoConCopiaPara: string;
  monto: number;
  moneda: string;
  codigoCobroCuenta: string;
  codigoCobroDepto: string;
  codigoCobroProd: string;
  codigoCobroProyecto: string;
  companiaNombre: string;
  codigoDocumento: string;
  camposPersonalizados: Record<string, unknown>;
}

export const CAF_VACIO: DatosFormularioCaf = {
  eventoOrigenId: "",
  elaboradoEnCafCorporativo: false,
  speakerId: null,
  tipoContrato: "",
  tipoContratoOtroEspecifique: "",
  solicitanteNombre: "",
  solicitanteTelefono: "",
  directorAreaNombre: "",
  directorAreaCargo: "",
  contraparteNombre: "",
  contraparteNumeroDocumento: "",
  contrapartePais: "",
  contraparteEstadoProvincia: "",
  contraparteCiudad: "",
  contraparteDireccion: "",
  contraparteTelefono: "",
  contraparteCorreo: "",
  contraparteContacto: "",
  dueDiligence: "",
  objetoContrato: "",
  terminoContratoInicio: "",
  terminoContratoFin: "",
  terminoContratoDeterminable: true,
  comentarios: "",
  responsablesContrato: "",
  avisoAtencion: "",
  avisoConCopiaPara: "",
  monto: 0,
  moneda: "",
  codigoCobroCuenta: "",
  codigoCobroDepto: "",
  codigoCobroProd: "",
  codigoCobroProyecto: "",
  companiaNombre: "",
  codigoDocumento: "",
  camposPersonalizados: {},
};

const ETIQUETA_CAMPO: Record<string, string> = {
  eventoOrigenId: "Evento de origen",
  tipoContrato: "Tipo de contrato",
  tipoContratoOtroEspecifique: "Especifique el tipo de contrato",
  solicitanteNombre: "Nombre del solicitante",
  solicitanteTelefono: "Teléfono del solicitante",
  directorAreaNombre: "Nombre del director de área",
  directorAreaCargo: "Cargo del director de área",
  contraparteNombre: "Nombre de la contraparte",
  contraparteDireccion: "Dirección de la contraparte",
  contraparteTelefono: "Teléfono de la contraparte",
  contraparteCorreo: "Correo de la contraparte",
  contraparteContacto: "Contacto de la contraparte",
  dueDiligence: "Due diligence",
  objetoContrato: "Objeto del contrato",
  terminoContratoInicio: "Inicio del término del contrato",
  terminoContratoFin: "Fin del término del contrato",
  monto: "Monto",
  moneda: "Moneda",
  companiaNombre: "Compañía",
  codigoDocumento: "Código del documento",
};

/**
 * Ronda de ajustes de formularios (septiembre 2026), entrega 7: texto fijo
 * pedido explícito por la especificación, en un "cuadro de visualización
 * con alineación justificada" — nunca editable, se muestra igual en el
 * formulario (ver más abajo) y en la impresión (`CuerpoCAF` en
 * `DocumentoImprimible.tsx`).
 */
/** Texto que se carga solo en "Comentarios" cuando el CAF se elabora en el aplicativo corporativo. */
export const COMENTARIO_CAF_CORPORATIVO = "El CAF será elaborado desde el aplicativo CAF corporativo";

/** Nota del formato CAF ("PROFESIONAL DE LA SALUD"), igual en el formulario y en la impresión. */
export const NOTA_PROFESIONAL_SALUD_CAF =
  "Si el contrato se celebra con algún profesional de la salud o persona física / entidad que influya en la prescripción de nuestros productos, llene la solicitud de tarifa de servicio por convenio con profesional de la salud y entréguela al área jurídica.";

export const NOTA_LEGAL_CAF =
  'POST-APROBACIÓN: GM / (S)VP DEBE FIRMAR TODOS LOS CONTRATOS, MODIFICACIONES, SOWS, ETC. (I) Contrato debidamente otorgado, con sello de Legal u otra prueba de revisión a cargo de Legal, (II) FAC llenado y firmado, (III) historial de aprobación de PeopleSoft (solo paso 3 anterior) debe enviarse a legalarchive@valeant.com con copias impresas a Legal – 400 Somerset Corporate Boulevard, Bridgewater, New Jersey 08807.';

const SECCION_POR_CAMPO: Record<string, string> = {
  eventoOrigenId: "solicitante",
  solicitanteNombre: "solicitante",
  solicitanteTelefono: "solicitante",
  directorAreaNombre: "solicitante",
  directorAreaCargo: "solicitante",
  contraparteNombre: "contraparte",
  contraparteDireccion: "contraparte",
  contraparteTelefono: "contraparte",
  contraparteCorreo: "contraparte",
  contraparteContacto: "contraparte",
  tipoContrato: "contrato",
  tipoContratoOtroEspecifique: "contrato",
  objetoContrato: "contrato",
  dueDiligence: "contrato",
  terminoContratoInicio: "contrato",
  terminoContratoFin: "contrato",
  comentarios: "contrato",
  monto: "financiero",
  moneda: "financiero",
  codigoCobroCuenta: "financiero",
  codigoCobroDepto: "financiero",
  codigoCobroProd: "financiero",
  codigoCobroProyecto: "financiero",
  companiaNombre: "solicitante",
  codigoDocumento: "solicitante",
};

/** Reconstruye calcularErrores() — mismo patrón usado en toda la app: sin
 * react-hook-form/zod, validación manual campo por campo. */
export function calcularErroresCaf(datos: DatosFormularioCaf): Record<string, string> {
  const errores: Record<string, string> = {};
  const requerido = (clave: keyof DatosFormularioCaf) => {
    if (!String(datos[clave] ?? "").trim()) {
      errores[clave] = `${ETIQUETA_CAMPO[clave] ?? clave} es obligatorio.`;
    }
  };

  requerido("eventoOrigenId");
  if (!datos.speakerId) errores.speakerId = "Selecciona el HCP del repositorio.";
  // Octubre 2026: un CAF que se elabora en el aplicativo corporativo no se
  // diligencia en BEATS — solo hace falta el evento y el HCP.
  if (datos.elaboradoEnCafCorporativo) return errores;
  requerido("tipoContrato");
  if (datos.tipoContrato === "Otro") requerido("tipoContratoOtroEspecifique");
  requerido("solicitanteNombre");
  requerido("solicitanteTelefono");
  // Entrega 24: el director de área ya no se exige aquí — se completa solo con quien firma esa línea (ver matriz de firmas).
  requerido("contraparteNombre");
  requerido("contraparteNumeroDocumento");
  requerido("contrapartePais");
  requerido("contraparteEstadoProvincia");
  requerido("contraparteCiudad");
  requerido("contraparteDireccion");
  requerido("contraparteTelefono");
  requerido("contraparteCorreo");
  requerido("contraparteContacto");
  requerido("dueDiligence");
  requerido("objetoContrato");
  requerido("companiaNombre");
  // Ajuste de precisión (septiembre 2026), pedido explícito: "Código del
  // documento" deja de ser obligatorio (antes sí lo era).
  requerido("moneda");

  if (datos.contraparteCorreo && !/^\S+@\S+\.\S+$/.test(datos.contraparteCorreo)) {
    errores.contraparteCorreo = "El correo de la contraparte no es válido.";
  }
  if (!datos.terminoContratoDeterminable && !datos.terminoContratoFin.trim()) {
    errores.terminoContratoFin = "Indica la fecha específica de fin del contrato.";
  }
  if (!datos.monto || datos.monto <= 0) {
    errores.monto = "El monto debe ser mayor a cero.";
  }

  return errores;
}

interface Props {
  valor: DatosFormularioCaf;
  onChange: (valor: DatosFormularioCaf) => void;
  errores: Record<string, string>;
  eventosDisponibles: OpcionEventoOrigen[];
  speakersDisponibles: SpeakerResumen[];
  /** CAF ya creados (cualquier estado; los Anulados no cuentan): "Seleccionar HCP" solo ofrece a los speakers del evento que todavía no tienen el suyo. */
  documentosExistentes?: DocumentoExistenteSpeaker[];
  /** Id del CAF que se está editando: su propio speaker no se excluye. */
  documentoActualId?: string;
  camposPersonalizadosDefinidos: CampoPersonalizadoDefinicion[];
  etiquetasCampo: EtiquetaCampo[];
  empresaGrupo: string;
  pais: string;
  soloLectura?: boolean;
  /**
   * Octubre 2026: pregunta, apenas se elige el evento de origen, si el CAF se
   * elabora en BEATS o en el aplicativo CAF corporativo. Solo para el
   * formulario de creación (en edición el modo ya está definido).
   */
  preguntarModalidad?: boolean;
  /**
   * Octubre 2026: mientras el CAF es un borrador la decisión de dónde se elabora se puede reversar en ambos
   * sentidos (BEATS ↔ aplicativo corporativo). Se activa al editar un borrador.
   */
  permitirCambiarModalidad?: boolean;
  /** Ver `usePrecargaInicialOrigen` — viene de "Tareas Pendientes" cuando se abre este formulario para diligenciar una tarea concreta. */
  precargarEventoOrigenId?: string;
  precargarSpeakerId?: string;
  /** Entrega 24: quien enviará el CAF (para la vista previa de la matriz de firmas); por defecto, el usuario en sesión. */
  solicitanteId?: string;
}

export function FormularioCAF({
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
  preguntarModalidad,
  permitirCambiarModalidad,
  precargarEventoOrigenId,
  precargarSpeakerId,
  solicitanteId,
}: Props) {
  // Entrega 20: la lista "Tipo de contrato" sale del catálogo "Tipos de contrato" de Configuración de Campos (antes usaba "tiposDocumento" por error).
  const { opciones: tiposContrato } = useCatalogo("tiposContrato");
  const { opciones: monedas } = useCatalogo("monedas");
  const { opciones: empresas } = useCatalogo("empresasGrupo");

  const corporativo = valor.elaboradoEnCafCorporativo;
  // Con el CAF corporativo todo el formulario queda deshabilitado, salvo el
  // evento de origen y el HCP (identifican a qué speaker corresponde).
  const bloqueado = Boolean(soloLectura) || corporativo;
  // Entrega 40: el valor «más reciente» se comparte con el precargado (ver `useValorReciente`), para que escribir
  // evento y HCP a la vez (desde «Tareas Pendientes») no se pisen entre sí.
  const alElegirOrigen = useSelectorConPrecargado(valor, onChange);
  const { aplicar, valorRef } = alElegirOrigen;
  const [eventoPreguntado, setEventoPreguntado] = React.useState<string>("");
  const [preguntaAbierta, setPreguntaAbierta] = React.useState(false);

  function elegirModalidad(enCafCorporativo: boolean) {
    setPreguntaAbierta(false);
    const actual = valorRef.current;
    if (enCafCorporativo) {
      onChange({ ...actual, elaboradoEnCafCorporativo: true, comentarios: COMENTARIO_CAF_CORPORATIVO });
    } else if (actual.elaboradoEnCafCorporativo) {
      onChange({
        ...actual,
        elaboradoEnCafCorporativo: false,
        comentarios: actual.comentarios === COMENTARIO_CAF_CORPORATIVO ? "" : actual.comentarios,
      });
    }
  }

  // Octubre 2026: al reversar «aplicativo corporativo» → «BEATS» (por «Mejor crearlo en BEATS», en el banner o desde el
  // borrador guardado) el formulario estaba vacío porque en modo corporativo no se precarga nada. Se precarga lo que se
  // pueda derivar del evento / convenio / speaker ya elegidos, SIN pisar lo que la persona ya haya escrito.
  const eraCorporativoRef = React.useRef(corporativo);
  React.useEffect(() => {
    const venia = eraCorporativoRef.current;
    eraCorporativoRef.current = corporativo;
    if (!venia || corporativo || soloLectura) return;
    const { eventoOrigenId, speakerId } = valorRef.current;
    if (!eventoOrigenId) return;
    Promise.all([
      traerEventoPorId(eventoOrigenId).catch(() => null),
      speakerId ? traerConvenioPorEventoYSpeaker(eventoOrigenId, speakerId).catch(() => null) : Promise.resolve(null),
      speakerId ? traerSpeakerPorId(speakerId).catch(() => null) : Promise.resolve(null),
    ]).then(([origen, convenio, speaker]) => {
      const actual = valorRef.current;
      if (actual.elaboradoEnCafCorporativo) return;
      const cambios: Record<string, unknown> = {
        ...(origen ? precargarDesdeEventoParaCaf(origen) : {}),
        ...(convenio ? precargarDesdeConvenioParaCaf(convenio) : {}),
        ...(speaker ? precargarDesdeSpeakerParaCaf(speaker) : {}),
      };
      const vacios = Object.fromEntries(
        Object.entries(cambios).filter(([k]) => {
          const v = (actual as unknown as Record<string, unknown>)[k];
          return v === "" || v == null || v === 0;
        }),
      );
      if (Object.keys(vacios).length > 0) onChange({ ...actual, ...vacios });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corporativo]);

  function set<K extends keyof DatosFormularioCaf>(clave: K, v: DatosFormularioCaf[K]) {
    onChange({ ...valor, [clave]: v });
  }

  function setCampoPersonalizado(clave: string, v: unknown) {
    onChange({ ...valor, camposPersonalizados: { ...valor.camposPersonalizados, [clave]: v } });
  }

  // Ronda de ajustes de formularios (septiembre 2026), entrega 7: al elegir
  // el HCP se resuelve el Convenio de Pago a HCP del mismo evento/speaker
  // (si ya existe — el selector de "Evento de origen" solo lista eventos
  // que ya tienen uno) y se precargan los datos de la contraparte desde
  // ahí; teléfono/correo vienen aparte, directo del Repositorio de
  // Speakers (el Convenio no los tiene).
  //
  // Entrega 40: antes el evento se leía de `valor.eventoOrigenId` del render (vacío cuando el formulario se abre desde
  // una tarea, por lo que nunca se consultaba el Convenio) y una consulta fallida descartaba también la otra.
  // Ahora el evento se pasa explícito, cada fuente es independiente y, si no hay Convenio de Pago, la contraparte
  // se completa desde la ficha del speaker (el Convenio, cuando existe, tiene prioridad en lo que trae).
  function onCambiaSpeaker(speakerId: string, eventoIndicado?: string) {
    aplicar({ speakerId });
    if (valorRef.current.elaboradoEnCafCorporativo) return; // CAF corporativo: nada que precargar, el formulario no se diligencia aquí
    const eventoId = eventoIndicado || valorRef.current.eventoOrigenId;
    Promise.all([
      eventoId ? traerConvenioPorEventoYSpeaker(eventoId, speakerId).catch(() => null) : Promise.resolve(null),
      traerSpeakerPorId(speakerId).catch(() => null),
    ]).then(([convenio, speaker]) => {
      if (valorRef.current.speakerId !== speakerId || valorRef.current.elaboradoEnCafCorporativo) return;
      const conDato = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "" && v != null));
      const cambios = {
        ...(speaker ? { ...precargarContraparteDesdeSpeakerParaCaf(speaker), ...precargarDesdeSpeakerParaCaf(speaker) } : {}),
        ...(convenio ? conDato(precargarDesdeConvenioParaCaf(convenio)) : {}),
      };
      if (Object.keys(cambios).length > 0) aplicar(cambios);
    });
  }

  // Fase 4: al elegir el evento de origen, precarga automáticamente los
  // campos que se pueden derivar de él (ver src/lib/precargado.ts) — el
  // usuario los puede seguir editando normalmente después.
  function onCambiaEventoOrigen(id: string) {
    alElegirOrigen("eventoOrigenId", id, traerEventoPorId, (origen) =>
      valorRef.current.elaboradoEnCafCorporativo ? {} : precargarDesdeEventoParaCaf(origen),
    );
    if (preguntarModalidad && !soloLectura && id && id !== eventoPreguntado) {
      setEventoPreguntado(id);
      setPreguntaAbierta(true);
    }
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

  // Entrega 25: «Nombre del director de área» y «Cargo del director de área» se cargan
  // priorizando el nombre y el cargo del usuario que hace la solicitud (el solicitante). Solo si
  // todavía no se conocen sus datos se recurre a quien firma la línea «Director de área» de la matriz.
  const { usuario: usuarioSesion } = useAuth();
  const idSolicitante = solicitanteId ?? usuarioSesion?.id;
  const solicitantes = useUsuariosPorId([idSolicitante]);
  const solicitante = (idSolicitante ? solicitantes.get(idSolicitante) : undefined) ?? (idSolicitante === usuarioSesion?.id ? usuarioSesion : undefined);
  React.useEffect(() => {
    const actual = valorRef.current;
    if (soloLectura || actual.elaboradoEnCafCorporativo || !solicitante) return;
    if (actual.directorAreaNombre.trim() || actual.directorAreaCargo.trim()) return;
    const nombre = (solicitante.nombre || actual.solicitanteNombre || "").trim();
    if (!nombre) return;
    onChange({ ...actual, directorAreaNombre: nombre, directorAreaCargo: (solicitante.cargo || "").trim() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solicitante?.id, solicitante?.nombre, solicitante?.cargo, soloLectura, valor.elaboradoEnCafCorporativo, valor.directorAreaNombre, valor.directorAreaCargo]);
  function alCargarMatriz(lineas: LineaFirmaPrevia[]) {
    const actual = valorRef.current;
    if (soloLectura || actual.elaboradoEnCafCorporativo || solicitante || actual.directorAreaNombre.trim()) return;
    const director = lineas.find((l) => l.tipoFirma === "director_area")?.firmantes[0];
    if (director) onChange({ ...actual, directorAreaNombre: director.nombre, directorAreaCargo: director.cargo ?? "" });
  }

  const etiqueta = (clave: string) =>
    etiquetaEfectiva(etiquetasCampo, "caf", clave, empresaGrupo, ETIQUETA_CAMPO[clave] ?? clave);

  const aplicables = camposAplicables(camposPersonalizadosDefinidos, "caf", empresaGrupo, pais);
  const porSeccion = camposPorSeccion(aplicables);
  const valoresParaCalculo = { ...valor, ...valor.camposPersonalizados };

  return (
    <div className="flex flex-col gap-6">
    <Dialog open={preguntaAbierta} onOpenChange={(abierto) => !abierto && setPreguntaAbierta(false)}>
      <DialogContent className="max-w-lg" data-testid="caf-pregunta-modalidad">
        <DialogHeader>
          <DialogTitle>¿Dónde se elaborará este CAF?</DialogTitle>
          <DialogDescription>
            Puedes diligenciarlo aquí en BEATS o, si ya lo manejas en el aplicativo CAF corporativo, registrarlo para continuar con el Convenio HCP.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => elegirModalidad(false)}
            className="flex flex-col items-start gap-1.5 rounded-lg border p-4 text-left transition-colors hover:border-primary/60 hover:bg-accent/40"
            data-testid="caf-modalidad-beats"
          >
            <FileText className="size-5 text-primary" />
            <span className="text-sm font-semibold">Crearlo en BEATS</span>
            <span className="text-xs text-muted-foreground">Diligencio el formulario y sigue el flujo de aprobación.</span>
          </button>
          <button
            type="button"
            onClick={() => elegirModalidad(true)}
            className="flex flex-col items-start gap-1.5 rounded-lg border p-4 text-left transition-colors hover:border-primary/60 hover:bg-accent/40"
            data-testid="caf-modalidad-corporativo"
          >
            <Building2 className="size-5 text-primary" />
            <span className="text-sm font-semibold">Usaré el aplicativo CAF corporativo</span>
            <span className="text-xs text-muted-foreground">Se registra aquí sin aprobación; la copia firmada se carga luego en el Expediente del evento.</span>
          </button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setPreguntaAbierta(false)}>Decidir después</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {!corporativo && permitirCambiarModalidad && !soloLectura && (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-3 text-sm" data-testid="caf-banner-beats">
        <span className="flex items-center gap-2">
          <FileText className="size-4 text-primary" />
          Este borrador se elabora en BEATS. Mientras siga en borrador puedes cambiar de opinión.
        </span>
        <Button type="button" size="sm" variant="outline" onClick={() => elegirModalidad(true)} data-testid="caf-cambiar-a-corporativo">
          Mejor usar el aplicativo CAF corporativo
        </Button>
      </div>
    )}

    {corporativo && (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-accent/40 p-3 text-sm" data-testid="caf-banner-corporativo">
        <span className="flex items-center gap-2">
          <Building2 className="size-4 text-primary" />
          Este CAF se elaborará en el aplicativo CAF corporativo — el formulario queda deshabilitado y no pasa por aprobación en BEATS.
        </span>
        {!soloLectura && (
          <Button type="button" size="sm" variant="outline" onClick={() => elegirModalidad(false)} data-testid="caf-mejor-en-beats">
            Mejor crearlo en BEATS
          </Button>
        )}
      </div>
    )}

    <Accordion type="multiple" defaultValue={["solicitante", "contraparte", "contrato", "financiero", "firmas"]} className="flex flex-col gap-3">
      <SeccionAcordeon value="solicitante" titulo="Solicitante y director de área">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="caf-evento-origen">{etiqueta("eventoOrigenId")} *</Label>
            <Select value={valor.eventoOrigenId} onValueChange={onCambiaEventoOrigen} disabled={soloLectura}>
              <SelectTrigger id="caf-evento-origen"><SelectValue placeholder="Selecciona el evento que origina este CAF" /></SelectTrigger>
              <SelectContent>
                {eventosDisponibles.map((ev) => (
                  <SelectItem key={ev.id} value={ev.id}>{ev.etiqueta}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errores.eventoOrigenId && <p className="text-xs text-destructive">{errores.eventoOrigenId}</p>}
            <p className="text-xs text-muted-foreground">Solo se listan eventos que ya tienen un FMV Checklist y un Convenio de Pago a HCP vinculados.</p>
          </div>

          <SelectorHcpDelEvento
            id="caf-speaker"
            valor={valor.speakerId}
            onChange={onCambiaSpeaker}
            onLimpiar={() => onChange({ ...valor, speakerId: null })}
            eventoOrigenId={valor.eventoOrigenId}
            eventosDisponibles={eventosDisponibles}
            speakersDisponibles={speakersDisponibles}
            documentosExistentes={documentosExistentes}
            documentoActualId={documentoActualId}
            nombreDocumento="CAF"
            ayuda="Al elegir el HCP, se precargan los datos de la contraparte desde su Convenio de Pago vinculado."
            error={errores.speakerId}
            disabled={soloLectura}
          />

          <Campo label={`${etiqueta("solicitanteNombre")} *`} error={errores.solicitanteNombre}>
            <Input value={valor.solicitanteNombre} disabled={bloqueado} onChange={(e) => set("solicitanteNombre", e.target.value)} />
          </Campo>
          <Campo label={etiqueta("codigoDocumento")} error={errores.codigoDocumento}>
            <Input value={valor.codigoDocumento} disabled={bloqueado} onChange={(e) => set("codigoDocumento", e.target.value)} />
          </Campo>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="caf-compania">{etiqueta("companiaNombre")} *</Label>
            <Select value={valor.companiaNombre} onValueChange={(v) => set("companiaNombre", v)} disabled={bloqueado}>
              <SelectTrigger id="caf-compania"><SelectValue placeholder="Selecciona la compañía" /></SelectTrigger>
              <SelectContent>
                {empresas.map((op) => (
                  <SelectItem key={op} value={op}>{op}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errores.companiaNombre && <p className="text-xs text-destructive">{errores.companiaNombre}</p>}
          </div>
          <Campo label={`${etiqueta("solicitanteTelefono")} *`} error={errores.solicitanteTelefono}>
            <Input value={valor.solicitanteTelefono} disabled={bloqueado} onChange={(e) => set("solicitanteTelefono", e.target.value)} />
          </Campo>
          <Campo label={etiqueta("directorAreaNombre")} error={errores.directorAreaNombre}>
            <Input value={valor.directorAreaNombre} disabled={bloqueado} onChange={(e) => set("directorAreaNombre", e.target.value)} />
          </Campo>
          <Campo label={etiqueta("directorAreaCargo")} error={errores.directorAreaCargo}>
            <Input value={valor.directorAreaCargo} disabled={bloqueado} onChange={(e) => set("directorAreaCargo", e.target.value)} />
          </Campo>
        </div>
        {porSeccion.solicitante && (
          <fieldset disabled={bloqueado} className="m-0 min-w-0 border-0 p-0"><CamposPersonalizadosSeccion
            campos={porSeccion.solicitante}
            valores={valor.camposPersonalizados}
            valoresParaCalculo={valoresParaCalculo}
            onChange={setCampoPersonalizado}
          /></fieldset>
        )}
      </SeccionAcordeon>

      <SeccionAcordeon value="contraparte" titulo="Contraparte">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label={`${etiqueta("contraparteNombre")} *`} error={errores.contraparteNombre}>
            <Input value={valor.contraparteNombre} disabled={bloqueado} onChange={(e) => set("contraparteNombre", e.target.value)} />
          </Campo>
          <Campo label="Número de documento de la contraparte *" error={errores.contraparteNumeroDocumento}>
            <Input value={valor.contraparteNumeroDocumento} disabled={bloqueado} onChange={(e) => set("contraparteNumeroDocumento", e.target.value)} />
          </Campo>
          <Campo label={`${etiqueta("contraparteDireccion")} *`} error={errores.contraparteDireccion}>
            <Input value={valor.contraparteDireccion} disabled={bloqueado} onChange={(e) => set("contraparteDireccion", e.target.value)} />
          </Campo>
          <SelectPaisEstadoCiudad
            idPrefix="caf-contraparte"
            etiquetaPais="País de la contraparte *"
            etiquetaEstado="Estado/Provincia/Departamento de la contraparte *"
            etiquetaCiudad="Ciudad de la contraparte *"
            valorPais={valor.contrapartePais}
            valorEstado={valor.contraparteEstadoProvincia}
            valorCiudad={valor.contraparteCiudad}
            onChangePaisEstadoCiudad={(contrapartePais, contraparteEstadoProvincia, contraparteCiudad) =>
              onChange({ ...valor, contrapartePais, contraparteEstadoProvincia, contraparteCiudad })
            }
            errorPais={errores.contrapartePais}
            errorEstado={errores.contraparteEstadoProvincia}
            errorCiudad={errores.contraparteCiudad}
            disabled={bloqueado}
          />
          <Campo label={`${etiqueta("contraparteTelefono")} *`} error={errores.contraparteTelefono}>
            <Input value={valor.contraparteTelefono} disabled={bloqueado} onChange={(e) => set("contraparteTelefono", e.target.value)} />
          </Campo>
          <Campo label={`${etiqueta("contraparteCorreo")} *`} error={errores.contraparteCorreo}>
            <InputEmail value={valor.contraparteCorreo} disabled={bloqueado} onChange={(e) => set("contraparteCorreo", e.target.value)} />
          </Campo>
          <Campo label={`${etiqueta("contraparteContacto")} *`} error={errores.contraparteContacto}>
            <Input value={valor.contraparteContacto} disabled={bloqueado} onChange={(e) => set("contraparteContacto", e.target.value)} />
          </Campo>
          <Campo label="Aviso, domicilio y fax — At'n">
            <Input value={valor.avisoAtencion} disabled={bloqueado} onChange={(e) => set("avisoAtencion", e.target.value)} />
          </Campo>
          <Campo label="Con copia para (depto., domicilio y fax)">
            <Input value={valor.avisoConCopiaPara} disabled={bloqueado} onChange={(e) => set("avisoConCopiaPara", e.target.value)} />
          </Campo>
        </div>
        {porSeccion.contraparte && (
          <fieldset disabled={bloqueado} className="m-0 min-w-0 border-0 p-0"><CamposPersonalizadosSeccion
            campos={porSeccion.contraparte}
            valores={valor.camposPersonalizados}
            valoresParaCalculo={valoresParaCalculo}
            onChange={setCampoPersonalizado}
          /></fieldset>
        )}
      </SeccionAcordeon>

      <SeccionAcordeon value="contrato" titulo="Contrato">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="caf-tipo-contrato">{etiqueta("tipoContrato")} *</Label>
            <Select value={valor.tipoContrato} onValueChange={(v) => set("tipoContrato", v)} disabled={bloqueado}>
              <SelectTrigger id="caf-tipo-contrato"><SelectValue placeholder="Selecciona un tipo" /></SelectTrigger>
              <SelectContent>
                {/* Un documento ya guardado con un valor que ya no está en el catálogo (p. ej. creado antes de este cambio) lo conserva visible. */}
                {valor.tipoContrato && valor.tipoContrato !== "Otro" && !tiposContrato.includes(valor.tipoContrato) && (
                  <SelectItem value={valor.tipoContrato}>{valor.tipoContrato}</SelectItem>
                )}
                {tiposContrato.map((op) => (
                  <SelectItem key={op} value={op}>{op}</SelectItem>
                ))}
                <SelectItem value="Otro">Otro</SelectItem>
              </SelectContent>
            </Select>
            {errores.tipoContrato && <p className="text-xs text-destructive">{errores.tipoContrato}</p>}
          </div>
          {valor.tipoContrato === "Otro" && (
            <Campo label={`${etiqueta("tipoContratoOtroEspecifique")} *`} error={errores.tipoContratoOtroEspecifique}>
              <Input value={valor.tipoContratoOtroEspecifique} disabled={bloqueado} onChange={(e) => set("tipoContratoOtroEspecifique", e.target.value)} />
            </Campo>
          )}
          <Campo label={`${etiqueta("terminoContratoInicio")}`} error={errores.terminoContratoInicio}>
            <Input type="date" value={valor.terminoContratoInicio} disabled={bloqueado} onChange={(e) => set("terminoContratoInicio", e.target.value)} />
          </Campo>
          <div className="flex flex-col gap-1.5">
            <Label>{etiqueta("terminoContratoFin")} *</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={valor.terminoContratoDeterminable ? "default" : "outline"}
                disabled={bloqueado}
                onClick={() => onChange({ ...valor, terminoContratoDeterminable: true, terminoContratoFin: "" })}
              >
                Determinable
              </Button>
              <Button
                type="button"
                size="sm"
                variant={!valor.terminoContratoDeterminable ? "default" : "outline"}
                disabled={bloqueado}
                onClick={() => set("terminoContratoDeterminable", false)}
              >
                Fecha específica
              </Button>
            </div>
            {!valor.terminoContratoDeterminable && (
              <Input
                type="date"
                className="mt-1.5"
                value={valor.terminoContratoFin}
                disabled={bloqueado}
                onChange={(e) => set("terminoContratoFin", e.target.value)}
              />
            )}
            {errores.terminoContratoFin && <p className="text-xs text-destructive">{errores.terminoContratoFin}</p>}
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="caf-objeto-contrato">{etiqueta("objetoContrato")} *</Label>
            <Textarea id="caf-objeto-contrato" value={valor.objetoContrato} disabled={bloqueado} onChange={(e) => set("objetoContrato", e.target.value)} />
            {errores.objetoContrato && <p className="text-xs text-destructive">{errores.objetoContrato}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="caf-due-diligence">{etiqueta("dueDiligence")} *</Label>
            <Select value={valor.dueDiligence} onValueChange={(v) => set("dueDiligence", v)} disabled={bloqueado}>
              <SelectTrigger id="caf-due-diligence"><SelectValue placeholder="Selecciona una opción" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="N/A">N/A</SelectItem>
                <SelectItem value="Positivo">Positivo</SelectItem>
                <SelectItem value="Negativo">Negativo</SelectItem>
              </SelectContent>
            </Select>
            {errores.dueDiligence && <p className="text-xs text-destructive">{errores.dueDiligence}</p>}
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="caf-comentarios">Comentarios</Label>
            <Textarea id="caf-comentarios" value={valor.comentarios} disabled={bloqueado} onChange={(e) => set("comentarios", e.target.value)} />
          </div>
          <div className="rounded-md border bg-muted/40 p-3 text-xs text-justify leading-relaxed sm:col-span-2" data-testid="caf-nota-profesional-salud">
            <strong>Profesional de la salud:</strong> {NOTA_PROFESIONAL_SALUD_CAF}
          </div>
        </div>
        {porSeccion.contrato && (
          <fieldset disabled={bloqueado} className="m-0 min-w-0 border-0 p-0"><CamposPersonalizadosSeccion
            campos={porSeccion.contrato}
            valores={valor.camposPersonalizados}
            valoresParaCalculo={valoresParaCalculo}
            onChange={setCampoPersonalizado}
          /></fieldset>
        )}
      </SeccionAcordeon>

      <SeccionAcordeon value="financiero" titulo="Financiero">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label={`${etiqueta("monto")} *`} error={errores.monto}>
            <InputMoneda value={valor.monto} moneda={valor.moneda} disabled={bloqueado} onChange={(v) => set("monto", v ?? 0)} />
          </Campo>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="caf-moneda">{etiqueta("moneda")} *</Label>
            <Select value={valor.moneda} onValueChange={(v) => set("moneda", v)} disabled={bloqueado}>
              <SelectTrigger id="caf-moneda"><SelectValue placeholder="Selecciona una moneda" /></SelectTrigger>
              <SelectContent>
                {monedas.map((op) => (
                  <SelectItem key={op} value={op}>{op}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errores.moneda && <p className="text-xs text-destructive">{errores.moneda}</p>}
          </div>
          <Campo label="Código de cobro — cuenta">
            <Input value={valor.codigoCobroCuenta} disabled={bloqueado} onChange={(e) => set("codigoCobroCuenta", e.target.value)} />
          </Campo>
          <Campo label="Código de cobro — departamento">
            <Input value={valor.codigoCobroDepto} disabled={bloqueado} onChange={(e) => set("codigoCobroDepto", e.target.value)} />
          </Campo>
          <Campo label="Código de cobro — producto">
            <Input value={valor.codigoCobroProd} disabled={bloqueado} onChange={(e) => set("codigoCobroProd", e.target.value)} />
          </Campo>
          <Campo label="Código de cobro — proyecto">
            <Input value={valor.codigoCobroProyecto} disabled={bloqueado} onChange={(e) => set("codigoCobroProyecto", e.target.value)} />
          </Campo>
        </div>
        {porSeccion.financiero && (
          <fieldset disabled={bloqueado} className="m-0 min-w-0 border-0 p-0"><CamposPersonalizadosSeccion
            campos={porSeccion.financiero}
            valores={valor.camposPersonalizados}
            valoresParaCalculo={valoresParaCalculo}
            onChange={setCampoPersonalizado}
          /></fieldset>
        )}
      </SeccionAcordeon>

      {!corporativo && (
        <SeccionAcordeon value="firmas" titulo="Matriz de firmas">
          <ResumenFirmasCaf solicitanteId={solicitanteId} onCargado={alCargarMatriz} />
          <p className="mt-3 text-xs text-muted-foreground">
            Aprobación de acuerdo al monto del contrato según la matriz de autorizaciones: <strong>-</strong>
          </p>
          {/* Entrega 25: el texto POST-APROBACIÓN va después de la matriz de firmas. */}
          <div className="mt-3 rounded-md border bg-muted/40 p-3 text-xs text-justify leading-relaxed" data-testid="caf-nota-post-aprobacion">
            {NOTA_LEGAL_CAF}
          </div>
        </SeccionAcordeon>
      )}
    </Accordion>
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

export { ETIQUETA_CAMPO as ETIQUETA_CAMPO_CAF, SECCION_POR_CAMPO as SECCION_POR_CAMPO_CAF };
