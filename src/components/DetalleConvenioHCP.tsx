import { documentoCongelado } from "@/lib/congelamiento";
import { useConfirmar } from "@/hooks/useConfirmar";
import * as React from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatearFechaHora } from "@/lib/fecha";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Printer, Lock } from "lucide-react";
import { CreadoPorLinea, CuerpoConvenioHCP, CuerpoCompacto, DocumentoImprimible } from "@/components/print/DocumentoImprimible";
import { CampoArchivo } from "@/components/archivos/CampoArchivo";
import { EnviarDocumentoDialog, type ArchivoListaEnvio, type DocumentoPdfEnvio } from "@/components/EnviarDocumentoDialog";
import { construirPaqueteCompletoEvento } from "@/lib/paqueteDocumentosEvento";
import { FilaCadenaAprobacion } from "@/components/FilaCadenaAprobacion";
import { NotasAprobacionVista } from "@/components/NotasAprobacion";
import { parsearSnapshotFormato } from "@/lib/snapshotFormato";
import {
  FormularioConvenioHCP,
  calcularErroresConvenioHCP,
  type DatosFormularioConvenioHCP,
} from "@/components/forms/FormularioConvenioHCP";
import { useAuth } from "@/hooks/useAuth";
import { useCompania } from "@/hooks/useCompania";
import { useUsuariosPorId } from "@/hooks/useUsuariosPorId";
import {
  abrirVentanaAdendaConvenioHCP,
  anularConvenioHCP,
  cerrarVentanaAdendaConvenioHCP,
  cerrarVentanaEnmiendaConvenioHCP,
  devolverConvenioHCP,
  editarBorradorConvenioHCP,
  editarYReenviarConvenioHCP,
  eliminarBorradorConvenioHCP,
  resolverPasoConvenioHCP,
  solicitarEnmiendaConvenioHCP,
  guardarArchivoFirmadoConvenioHCP,
  marcarArchivoEnviadoHCP,
  traerConveniosHCP,
} from "@/lib/convenioHCP";
import { puedeResolverPaso } from "@/lib/aprobaciones";
import { AvisoIdiomaDesalineado, idiomaDesalineado } from "@/components/forms/AvisoIdiomaDesalineado";
import { SECCIONES_CLAUSULADO, textoEfectivoSeccion, ajusteVigenteSeccion, guardarAjusteClausula, eliminarAjusteClausula } from "@/lib/plantillaConvenioHCP";
import {
  evaluarBloqueoPorProximidadEvento,
  puedeDevolverDocumento,
  puedeEditarComoBorrador,
  puedeSolicitarEnmienda,
  traerFechaInicioEventoPorId, puedeAnularSegunEstado } from "@/lib/cicloVidaDocumento";
import { traerCamposPersonalizados, type CampoPersonalizadoDefinicion } from "@/lib/camposPersonalizados";
import { traerEtiquetasCampo, type EtiquetaCampo } from "@/lib/etiquetasCampo";
import { traerSpeakersResumen, type SpeakerResumen } from "@/lib/speakers";
import { traerEventos } from "@/lib/evento";
import { traerConvenios } from "@/lib/convenio";
import { traerFmvs } from "@/lib/fmv";
import { traerCafs } from "@/lib/caf";
import { traerUsuarios } from "@/lib/usuarios";
import { eventosParaOrigenConvenioHCP, type OpcionEventoOrigenConvenioHCP } from "@/lib/documentosRequeridosEvento";
import type { ConvenioHcp } from "@/types";
import { type EstadoDoc } from "@/lib/enums";

type OrigenEdicion = "rechazado" | "adenda" | "borrador" | "enmienda";

const VARIANTE_POR_ESTADO: Record<EstadoDoc, BadgeProps["variant"]> = {
  Borrador: "draft",
  Pendiente: "pending",
  Aprobado: "approved",
  Rechazado: "rejected",
  Devuelto: "draft",
  Completado: "completed",
  Anulado: "cancelled",
};

interface Props {
  convenio: ConvenioHcp;
  abierto: boolean;
  onCerrar: () => void;
  onActualizado: () => void;
}

export function DetalleConvenioHCP({ convenio, abierto, onCerrar, onActualizado }: Props) {
  const { usuario } = useAuth();
  const [comentario, setComentario] = React.useState("");
  const [procesando, setProcesando] = React.useState(false);
  const [motivoAnulacion, setMotivoAnulacion] = React.useState("");
  const [mostrarAnular, setMostrarAnular] = React.useState(false);
  const [mostrarEliminarBorrador, setMostrarEliminarBorrador] = React.useState(false);
  const [mostrarImpresion, setMostrarImpresion] = React.useState(false);
  const [idioma, setIdioma] = React.useState<"es" | "en">("es");
  const [editando, setEditando] = React.useState(false);
  // Entrega 29: el cuadro de adjuntar refleja el archivo en cuanto queda GUARDADO, sin esperar a que la ventana
  // relea todo el documento; se vuelve a sincronizar con lo que traiga el servidor.
  const [archivoFirmadoId, setArchivoFirmadoId] = React.useState<string | null>(convenio.archivoFirmadoHCPId);
  React.useEffect(() => {
    setArchivoFirmadoId(convenio.archivoFirmadoHCPId);
  }, [convenio.archivoFirmadoHCPId]);

  const [mostrarAjuste, setMostrarAjuste] = React.useState(false);
  const [seccionAjuste, setSeccionAjuste] = React.useState(SECCIONES_CLAUSULADO[0].valor);
  const [textoEsAjuste, setTextoEsAjuste] = React.useState("");
  const [textoEnAjuste, setTextoEnAjuste] = React.useState("");
  const [justificacionAjuste, setJustificacionAjuste] = React.useState("");

  const [mostrarAdenda, setMostrarAdenda] = React.useState(false);
  const [justificacionAdenda, setJustificacionAdenda] = React.useState("");
  const [ventanaAdenda, setVentanaAdenda] = React.useState<{ expiraEn: string } | null>(null);

  const [origenEdicion, setOrigenEdicion] = React.useState<OrigenEdicion>("rechazado");
  const [mostrarDevolver, setMostrarDevolver] = React.useState(false);
  const [motivoDevolver, setMotivoDevolver] = React.useState("");
  const [mostrarEnmienda, setMostrarEnmienda] = React.useState(false);
  const [justificacionEnmienda, setJustificacionEnmienda] = React.useState("");
  const [ventanaEnmienda, setVentanaEnmienda] = React.useState(false);
  const [fechaEventoVinculado, setFechaEventoVinculado] = React.useState<string | null>(null);

  const [campos, setCampos] = React.useState<CampoPersonalizadoDefinicion[]>([]);
  const [etiquetas, setEtiquetas] = React.useState<EtiquetaCampo[]>([]);
  const [eventos, setEventos] = React.useState<OpcionEventoOrigenConvenioHCP[]>([]);
  const [speakers, setSpeakers] = React.useState<SpeakerResumen[]>([]);
  const [nombresGerenciaGeneral, setNombresGerenciaGeneral] = React.useState<string[]>([]);
  const [datosEdicion, setDatosEdicion] = React.useState<DatosFormularioConvenioHCP | null>(null);
  // Entrega 32: copia de los valores con los que se abrió la edición (para avisar si solo se corrigió un idioma).
  const [datosOriginalesEdicion, setDatosOriginalesEdicion] = React.useState<DatosFormularioConvenioHCP | null>(null);
  const [textoOriginalAjuste, setTextoOriginalAjuste] = React.useState<{ es: string; en: string }>({ es: "", en: "" });
  const [erroresEdicion, setErroresEdicion] = React.useState<Record<string, string>>({});
  const [autoguardadoEn, setAutoguardadoEn] = React.useState<Date | null>(null);

  // Una vez el documento queda Aprobado, los campos personalizados que se
  // ven (en la vista compacta y en impresión) deben quedar fijos tal como
  // estaban en ese momento, aunque Legal/Compliance cambie la
  // configuración después — ver
  // `db/agregar_inmutabilidad_documentos_firmados.sql`.
  const snapshotFormatoCongelado = React.useMemo(
    () => parsearSnapshotFormato(convenio.snapshotFormato),
    [convenio.snapshotFormato],
  );

  React.useEffect(() => {
    if (!abierto) return;
    traerCamposPersonalizados().then(setCampos).catch(() => setCampos([]));
    traerEtiquetasCampo().then(setEtiquetas).catch(() => setEtiquetas([]));
    Promise.all([traerEventos(), traerConvenios(), traerFmvs(), traerCafs(), traerConveniosHCP(), traerSpeakersResumen()])
      .then(([evs, convenios, fmvs, cafsCompletos, conveniosHCP, speakersResumen]) => {
        setEventos(eventosParaOrigenConvenioHCP(evs, convenios, fmvs, cafsCompletos, conveniosHCP, speakersResumen, convenio.id));
        setSpeakers(speakersResumen);
      })
      .catch(() => {
        setEventos([]);
        setSpeakers([]);
      });
    traerUsuarios()
      .then((us) => setNombresGerenciaGeneral(us.filter((u) => u.rol === "gerencia_general").map((u) => u.nombre)))
      .catch(() => setNombresGerenciaGeneral([]));
    traerFechaInicioEventoPorId(convenio.eventoOrigenId).then(setFechaEventoVinculado).catch(() => setFechaEventoVinculado(null));
    setComentario("");
    setMostrarAnular(false);
    setMostrarAjuste(false);
    setMostrarImpresion(false);
    setEditando(false);
    setMostrarAdenda(false);
    setJustificacionAdenda("");
    setVentanaAdenda(null);
    setMostrarDevolver(false);
    setMotivoDevolver("");
    setMostrarEnmienda(false);
    setJustificacionEnmienda("");
    setVentanaEnmienda(false);
    setAutoguardadoEn(null);
  }, [abierto, convenio.id, convenio.eventoOrigenId]);

  if (!usuario) return null;
  const usuarioSesion = usuario;
  const { companiaActual } = useCompania();
  const empresaGrupo = companiaActual ?? usuarioSesion.empresasGrupo[0] ?? "";
  const pais = usuarioSesion.paisesOperacion[0] ?? "";

  const indiceActionable = convenio.aprobaciones.findIndex((_, i) => puedeResolverPaso(usuarioSesion, convenio.aprobaciones, i));
  // AJUSTES (septiembre/octubre 2026), pedido explícito: mostrar, en el
  // campo "Firma" de la ventana de aprobación, la firma manuscrita de quien
  // resolvió cada etapa (ya aprobada).
  const usuariosAprobacion = useUsuariosPorId(convenio.aprobaciones.map((p) => p.resueltoPorId));
  // AJUSTES (septiembre/octubre 2026): el solicitante original del evento
  // (creador del convenio) es uno de los destinatarios posibles al enviar
  // documentos por correo una vez terminado el flujo de aprobación.
  const creador = useUsuariosPorId([convenio.creadoPorId]).get(convenio.creadoPorId);
  // Entrega 28: al enviar al HCP para firma, el PDF del convenio se genera solo y viene ya adjunto. Va SIN marca de agua
  // (es el ejemplar que la contraparte imprime/firma; mismo criterio que el «Modo para firma externa» de la vista de impresión).
  const documentosPdfParaHcp = React.useMemo<DocumentoPdfEnvio[]>(
    () => [
      {
        clave: `convenioHCP-${convenio.id}`,
        etiqueta: `Convenio HCP — ${convenio.consultorNombre}`,
        detalle: "Versión en PDF del convenio, lista para que el HCP la revise y firme (sin marca de agua).",
        doc: convenio,
        conMarcaDeAgua: false,
        generarAlAbrir: true,
        marcadoInicial: true,
      },
    ],
    [convenio],
  );
  const [mostrarEnvioHcp, setMostrarEnvioHcp] = React.useState(false);
  const [mostrarEnvioSolicitante, setMostrarEnvioSolicitante] = React.useState(false);
  // Entrega 28: paquete de documentos del evento/speaker que se ofrece al enviar al solicitante (se arma al abrir la ventana).
  const [paqueteSolicitante, setPaqueteSolicitante] = React.useState<DocumentoPdfEnvio[]>([]);
  // Entrega 33: además de los PDF de BEATS, los archivos ya cargados del evento (OC, facturas, soportes…).
  const [archivosPaquete, setArchivosPaquete] = React.useState<ArchivoListaEnvio[]>([]);
  const [cargandoPaquete, setCargandoPaquete] = React.useState(false);
  // Confirmado en el bundle original: una vez el contrato queda Aprobado su
  // texto legal se considera fijo y ya no admite más ajustes puntuales.
  // Entrega 32: un convenio elaborado en el aplicativo corporativo no tiene texto legal en BEATS, ni cadena de aprobación.
  const corporativo = convenio.elaboradoEnContratosCorporativo;
  const puedeAjustarClausulado = !corporativo && usuarioSesion.esAdministrador && convenio.estado !== "Aprobado" && convenio.estado !== "Anulado";
  const puedeAnular = usuarioSesion.esAdministrador && puedeAnularSegunEstado(convenio.estado);
  const puedeEliminarBorrador = convenio.estado === "Borrador" && usuarioSesion.id === convenio.creadoPorId;
  // Solo tiene sentido cargar la copia firmada por el HCP una vez el
  // contrato ya está Aprobado (o Completado) — antes de eso no hay nada
  // firmado que cargar.
  const puedeGestionarArchivoFirmado =
    (usuarioSesion.esAdministrador || (corporativo && (usuarioSesion.rol === "medica" || usuarioSesion.id === convenio.creadoPorId))) &&
    (convenio.estado === "Aprobado" || convenio.estado === "Completado");
  // AJUSTES (septiembre/octubre 2026): enviar por correo con adjuntos está
  // restringido, en el servidor (Edge Function `send-email`), a Dirección
  // Médica — los botones solo se muestran a quien de verdad puede usarlos.
  const puedeEnviarDocumentosPorCorreo =
    !corporativo && usuarioSesion.rol === "medica" && (convenio.estado === "Aprobado" || convenio.estado === "Completado");
  const esCreadorOAdmin = usuarioSesion.esAdministrador || usuarioSesion.id === convenio.creadoPorId;
  const bloqueoProximidad = evaluarBloqueoPorProximidadEvento(fechaEventoVinculado);
  const puedeEditarYReenviar = convenio.estado === "Rechazado" && esCreadorOAdmin;
  // A27: igual que Evento/Convenio de Pago a HCP, la adenda solo aplica a un
  // contrato ya Aprobado (para uno Rechazado ya existe "Editar y reenviar").
  const puedeSolicitarAdenda = !corporativo && usuarioSesion.esAdministrador && convenio.estado === "Aprobado";
  const puedeEditarBorrador = puedeEditarComoBorrador(convenio.estado) && esCreadorOAdmin && !bloqueoProximidad.bloqueado;
  const puedeDevolver = puedeDevolverDocumento(convenio.estado, convenio.aprobaciones) && esCreadorOAdmin && !bloqueoProximidad.bloqueado;
  const puedeEnmendar = puedeSolicitarEnmienda(convenio.estado, convenio.aprobaciones) && esCreadorOAdmin && !bloqueoProximidad.bloqueado;
  const mostrarAvisoBloqueo =
    bloqueoProximidad.bloqueado && esCreadorOAdmin && convenio.estado !== "Completado" && convenio.estado !== "Anulado" && convenio.estado !== "Aprobado";

  async function guardarArchivoFirmado(archivoId: string | null): Promise<boolean> {
    try {
      await guardarArchivoFirmadoConvenioHCP(convenio.id, archivoId);
      setArchivoFirmadoId(archivoId);
      toast.success(archivoId ? "Copia firmada cargada y guardada en el convenio." : "Se quitó la copia firmada.");
      onActualizado();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el archivo.");
      return false;
    }
  }

  /**
   * Entrega 28: arma el paquete y abre la ventana. Entrega 33: ya no es solo lo del speaker de este convenio — incluye TODOS
   * los documentos asociados al evento: los generados en BEATS (solicitud, FMV, convenios, CAF, notificaciones → PDF) y los
   * archivos cargados en el Expediente (orden de compra, facturas, comprobantes, copias firmadas, soportes de speakers…),
   * agrupados por «Evento» y por speaker.
   */
  async function abrirEnvioSolicitante() {
    setCargandoPaquete(true);
    try {
      const paquete = await construirPaqueteCompletoEvento(convenio);
      // El convenio abierto es el más fresco (con sus firmas): reemplaza a su copia del paquete.
      setPaqueteSolicitante(
        paquete.documentosPdf.map((p) => ({
          clave: p.clave,
          etiqueta: p.etiqueta,
          detalle: p.detalle,
          doc: p.doc.tipoDoc === "convenioHCP" && p.doc.id === convenio.id ? convenio : p.doc,
          conMarcaDeAgua: true,
          marcadoInicial: p.marcadoInicial,
          grupo: p.grupo,
        })),
      );
      const lista: ArchivoListaEnvio[] = paquete.archivos.map((a) => ({ id: a.id, nombre: a.nombre, grupo: a.grupo, detalle: a.detalle, tamanoBytes: a.tamanoBytes, marcadoInicial: a.marcadoInicial }));
      // La copia firmada que se acaba de cargar en esta ventana siempre debe poder enviarse, aunque la lista aún no la traiga.
      if (archivoFirmadoId && !lista.some((a) => a.id === archivoFirmadoId)) lista.unshift({ id: archivoFirmadoId, nombre: "Convenio HCP — copia firmada por el HCP", grupo: "Evento" });
      setArchivosPaquete(lista);
      setMostrarEnvioSolicitante(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo armar el paquete de documentos.");
    } finally {
      setCargandoPaquete(false);
    }
  }

  async function marcarEnviadoHcpYActualizar() {
    try {
      await marcarArchivoEnviadoHCP(convenio.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "El correo se envió, pero no se pudo registrar la fecha de envío.");
    }
    onActualizado();
  }

  async function resolver(decision: "aprobado" | "rechazado") {
    if (indiceActionable < 0) return;
    if (decision === "rechazado" && !comentario.trim()) {
      toast.error("Debes indicar un motivo para rechazar.");
      return;
    }
    setProcesando(true);
    try {
      await resolverPasoConvenioHCP(convenio, indiceActionable, decision, usuarioSesion, comentario);
      toast.success(decision === "aprobado" ? "Etapa aprobada." : "Convenio HCP rechazado.");
      onActualizado();
      // AJUSTES (septiembre/octubre 2026), pedido explícito: cerrar la
      // ventana del documento tras aprobar/rechazar/devolver.
      onCerrar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo procesar la decisión.");
    } finally {
      setProcesando(false);
    }
  }

  const confirmar = useConfirmar();

  function abrirAjuste(seccion: string) {
    const texto = textoEfectivoSeccion(convenio, seccion);
    setSeccionAjuste(seccion);
    setTextoEsAjuste(texto.es);
    setTextoEnAjuste(texto.en);
    setTextoOriginalAjuste({ es: texto.es, en: texto.en });
    const existente = ajusteVigenteSeccion(convenio.ajustesClausula, seccion);
    setJustificacionAjuste(existente?.justificacion ?? "");
    setMostrarAjuste(true);
  }

  async function guardarAjuste() {
    if (!justificacionAjuste.trim()) {
      toast.error("Indica la justificación del ajuste.");
      return;
    }
    const desalineado = idiomaDesalineado({ es: textoEsAjuste, en: textoEnAjuste }, textoOriginalAjuste);
    if (desalineado) {
      const pendiente = desalineado === "es" ? "inglés" : "español";
      const modificado = desalineado === "es" ? "español" : "inglés";
      const seguir = await confirmar({
        titulo: "Solo cambió un idioma",
        mensaje: `Modificaste el texto en ${modificado}, pero el ${pendiente} sigue igual al original. La vista previa, la impresión y el PDF son bilingües y mostrarán el ${pendiente} anterior junto al ${modificado} nuevo. ¿Guardar así?`,
        textoConfirmar: "Guardar así",
      });
      if (!seguir) return;
    }
    setProcesando(true);
    try {
      const existente = ajusteVigenteSeccion(convenio.ajustesClausula, seccionAjuste);
      if (existente) await eliminarAjusteClausula(existente.id);
      await guardarAjusteClausula(convenio.id, seccionAjuste, textoEsAjuste, textoEnAjuste, justificacionAjuste, usuarioSesion.id);
      toast.success("Ajuste de cláusula guardado — solo aplica a este contrato.");
      setMostrarAjuste(false);
      onActualizado();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el ajuste.");
    } finally {
      setProcesando(false);
    }
  }

  async function quitarAjusteActual() {
    if (!(await confirmar({ titulo: "Quitar ajuste", mensaje: "¿Quitar este ajuste? Se restaurará el texto de la plantilla." }))) return;
    const existente = ajusteVigenteSeccion(convenio.ajustesClausula, seccionAjuste);
    if (!existente) return;
    setProcesando(true);
    try {
      await eliminarAjusteClausula(existente.id);
      toast.success("Ajuste eliminado — se restaura el texto de la plantilla.");
      setMostrarAjuste(false);
      onActualizado();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo quitar el ajuste.");
    } finally {
      setProcesando(false);
    }
  }

  async function confirmarAnulacion() {
    if (!motivoAnulacion.trim()) {
      toast.error("Indica el motivo de anulación.");
      return;
    }
    setProcesando(true);
    try {
      await anularConvenioHCP(convenio, usuarioSesion, motivoAnulacion);
      toast.success("Convenio HCP anulado.");
      onActualizado();
      // Corrección (octubre 2026), pedido explícito del usuario: cerrar
      // el formulario tras anular, para evitar repetir la instrucción o
      // inconsistencias.
      onCerrar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo anular el Convenio HCP.");
    } finally {
      setProcesando(false);
    }
  }

  /**
   * Corrección (octubre 2026), pedido explícito del usuario: "crea una
   * opción para eliminar cualquiera de los formularios que estén
   * guardados como borrador... solo lo puede eliminar el usuario que
   * haga la solicitud" — ver `puedeEliminarBorrador` más abajo y la nota
   * larga en `eliminarBorradorConvenioHCP` (`src/lib/convenioHCP.ts`)
   * sobre por qué esto no deja rastro en auditoría.
   */
  async function confirmarEliminarBorrador() {
    setProcesando(true);
    try {
      await eliminarBorradorConvenioHCP(convenio.id);
      toast.success("Borrador eliminado.");
      onActualizado();
      onCerrar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar el borrador.");
    } finally {
      setProcesando(false);
    }
  }

  // Ronda de instrucciones históricas (cluster A, A27): "Editar y reenviar"
  // + Adenda para Convenio HCP, siguiendo el mismo patrón que Evento y
  // Convenio de Pago a HCP (ver DetalleEvento.tsx / DetalleConvenio.tsx).
  function datosDesdeConvenioHCP(): DatosFormularioConvenioHCP {
    return {
      eventoOrigenId: convenio.eventoOrigenId,
      cafId: convenio.cafId,
      speakerId: convenio.speakerId ?? "",
      consultorNombre: convenio.consultorNombre,
      consultorIdentificacion: convenio.consultorIdentificacion,
      consultorCredenciales: convenio.consultorCredenciales,
      consultorDireccion: convenio.consultorDireccion,
      consultorEmail: convenio.consultorEmail,
      companiaNombre: convenio.companiaNombre,
      fechaEfectiva: convenio.fechaEfectiva ?? "",
      objetivoConsultoria: convenio.objetivoConsultoria,
      objetivoConsultoriaEn: convenio.objetivoConsultoriaEn,
      serviciosExhibitA: convenio.serviciosExhibitA,
      serviciosExhibitAEn: convenio.serviciosExhibitAEn,
      compensacion: convenio.compensacion,
      moneda: convenio.moneda,
      plazoPagoDias: convenio.plazoPagoDias,
      comentariosPago: convenio.comentariosPago,
      comentariosPagoEn: convenio.comentariosPagoEn,
      nombreDirectorGeneral: convenio.nombreDirectorGeneral,
      clausulasAjustadas: convenio.clausulasAjustadas,
      cierreEs: convenio.cierreEs,
      cierreEn: convenio.cierreEn,
      camposPersonalizados: convenio.camposPersonalizados,
      elaboradoEnContratosCorporativo: convenio.elaboradoEnContratosCorporativo,
    };
  }

  function iniciarEdicion(origen: OrigenEdicion, cambios: Partial<DatosFormularioConvenioHCP> = {}) {
    setDatosEdicion({ ...datosDesdeConvenioHCP(), ...cambios });
    setDatosOriginalesEdicion(datosDesdeConvenioHCP());
    setOrigenEdicion(origen);
    setEditando(true);
    setAutoguardadoEn(null);
  }

  async function solicitarAdenda() {
    if (!justificacionAdenda.trim()) {
      toast.error("Indica la justificación de la adenda.");
      return;
    }
    setProcesando(true);
    try {
      const ventana = await abrirVentanaAdendaConvenioHCP(convenio, justificacionAdenda, usuarioSesion);
      setVentanaAdenda(ventana);
      setMostrarAdenda(false);
      iniciarEdicion("adenda");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo solicitar la adenda.");
    } finally {
      setProcesando(false);
    }
  }

  async function guardarEdicion() {
    if (!datosEdicion) return;
    const erroresCalculados = calcularErroresConvenioHCP(datosEdicion);
    setErroresEdicion(erroresCalculados);
    if (Object.keys(erroresCalculados).length > 0) {
      toast.error("Revisa los campos marcados antes de reenviar.");
      return;
    }
    setProcesando(true);
    try {
      await editarYReenviarConvenioHCP(convenio, datosEdicion, usuarioSesion);
      if (ventanaAdenda) {
        try {
          await cerrarVentanaAdendaConvenioHCP(convenio.id);
        } catch (e) {
          console.error("La adenda se guardó pero no se pudo cerrar formalmente la ventana:", e);
        }
        toast.success("Adenda guardada y reenviada a aprobación.");
      } else if (origenEdicion === "enmienda") {
        try {
          await cerrarVentanaEnmiendaConvenioHCP(convenio.id);
        } catch (e) {
          console.error("La enmienda se guardó pero no se pudo cerrar formalmente la ventana:", e);
        }
        toast.success("Enmienda guardada y reenviada a aprobación.");
      } else {
        toast.success("Convenio HCP actualizado y reenviado a aprobación.");
      }
      setEditando(false);
      setVentanaAdenda(null);
      setVentanaEnmienda(false);
      onActualizado();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo reenviar el Convenio HCP.");
    } finally {
      setProcesando(false);
    }
  }

  async function guardarBorrador(enviarAAprobacion: boolean) {
    if (!datosEdicion) return;
    if (enviarAAprobacion) {
      const erroresCalculados = calcularErroresConvenioHCP(datosEdicion);
      setErroresEdicion(erroresCalculados);
      if (Object.keys(erroresCalculados).length > 0) {
        toast.error("Revisa los campos marcados antes de enviar.");
        return;
      }
    }
    setProcesando(true);
    try {
      await editarBorradorConvenioHCP(convenio, datosEdicion, usuarioSesion, enviarAAprobacion);
      toast.success(enviarAAprobacion ? "Convenio HCP enviado a aprobación." : "Borrador actualizado.");
      setEditando(false);
      onActualizado();
      // Corrección (octubre 2026), pedido explícito del usuario: cerrar
      // el formulario (volver al tablero) al guardar borrador o enviar a
      // aprobación, para evitar duplicidades.
      onCerrar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el borrador.");
    } finally {
      setProcesando(false);
    }
  }

  const datosEdicionRef = React.useRef(datosEdicion);
  React.useEffect(() => {
    datosEdicionRef.current = datosEdicion;
  }, [datosEdicion]);

  async function autoguardarBorrador() {
    const snapshot = datosEdicionRef.current;
    if (!snapshot || origenEdicion !== "borrador") return;
    try {
      await editarBorradorConvenioHCP(convenio, snapshot, usuarioSesion, false);
      setAutoguardadoEn(new Date());
    } catch {
      // Autoguardado silencioso: un fallo aquí no debe interrumpir al
      // usuario mientras sigue escribiendo — "Guardar borrador" (manual)
      // sigue disponible y sí informa cualquier error.
    }
  }

  React.useEffect(() => {
    if (!editando || origenEdicion !== "borrador") return;
    const id = setInterval(() => void autoguardarBorrador(), 45000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando, origenEdicion, convenio.id]);

  async function confirmarDevolver() {
    if (!motivoDevolver.trim()) {
      toast.error("Indica el motivo de la devolución.");
      return;
    }
    setProcesando(true);
    try {
      await devolverConvenioHCP(convenio, usuarioSesion, motivoDevolver);
      toast.success("Convenio HCP devuelto: el flujo de aprobación queda suspendido y el documento vuelve a ser editable.");
      setMostrarDevolver(false);
      setMotivoDevolver("");
      onActualizado();
      onCerrar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo devolver el Convenio HCP.");
    } finally {
      setProcesando(false);
    }
  }

  async function solicitarEnmienda() {
    if (!justificacionEnmienda.trim()) {
      toast.error("Indica la justificación de la enmienda.");
      return;
    }
    setProcesando(true);
    try {
      await solicitarEnmiendaConvenioHCP(convenio, usuarioSesion, justificacionEnmienda);
      setVentanaEnmienda(true);
      setMostrarEnmienda(false);
      iniciarEdicion("enmienda");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo solicitar la enmienda.");
    } finally {
      setProcesando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent
        className={cn("w-[calc(100vw-2rem)] max-w-6xl no-imprimir")}
        minimizable
        confirmarCierre={editando}
        onPointerDownOutside={(e) => editando && e.preventDefault()}
        onEscapeKeyDown={(e) => editando && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {convenio.consultorNombre || "Convenio HCP"}
            <Badge variant={VARIANTE_POR_ESTADO[convenio.estado]}>{convenio.estado}</Badge>
          </DialogTitle>
          <DialogDescription>{convenio.companiaNombre}</DialogDescription>
        </DialogHeader>
        {!editando && (
          <div className="-mt-2 flex flex-wrap items-center justify-between gap-2">
            <CreadoPorLinea creadoPorId={convenio.creadoPorId} creadoEn={convenio.creadoEn} />
            <div className="flex items-center gap-2">
              {!corporativo && (
                <>
                  <Button size="sm" variant={idioma === "es" ? "default" : "outline"} onClick={() => setIdioma("es")}>Español</Button>
                  <Button size="sm" variant={idioma === "en" ? "default" : "outline"} onClick={() => setIdioma("en")}>English</Button>
                  <Button variant="outline" size="sm" onClick={() => setMostrarImpresion(true)}>
                    <Printer className="h-3.5 w-3.5" /> Ver / Imprimir / Exportar a PDF
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {editando && datosEdicion ? (
          <div className="flex flex-col gap-4">
            {ventanaAdenda && (
              <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                Editando dentro de una ventana de adenda — al guardar, el Convenio HCP vuelve a Pendiente y se reinicia la cadena de aprobación.
              </p>
            )}
            {ventanaEnmienda && (
              <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                Editando dentro de una ventana de enmienda — al guardar, el Convenio HCP vuelve a Pendiente y se reinicia la cadena de aprobación.
              </p>
            )}
            {origenEdicion === "borrador" && (
              <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                Puedes guardar como borrador las veces que quieras. Solo se valida por completo cuando decidas enviarlo a aprobación.
                {" "}Se autoguarda cada cierto tiempo mientras editas.
                {autoguardadoEn && ` Autoguardado el ${formatearFechaHora(autoguardadoEn)}.`}
              </p>
            )}
            <FormularioConvenioHCP
              valor={datosEdicion}
              valorOriginal={datosOriginalesEdicion ?? undefined}
              onChange={setDatosEdicion}
              errores={erroresEdicion}
              eventosDisponibles={eventos}
              speakersDisponibles={speakers}
              nombresGerenciaGeneral={nombresGerenciaGeneral}
              camposPersonalizadosDefinidos={campos}
              etiquetasCampo={etiquetas}
              empresaGrupo={empresaGrupo}
              pais={pais}
              permitirCambiarModalidad={origenEdicion === "borrador" && convenio.estado === "Borrador"}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setEditando(false); setVentanaAdenda(null); setVentanaEnmienda(false); }} disabled={procesando}>
                Cancelar
              </Button>
              {origenEdicion === "borrador" ? (
                <>
                  <Button variant="outline" disabled={procesando} onClick={() => guardarBorrador(false)}>
                    Guardar borrador
                  </Button>
                  <Button disabled={procesando} onClick={() => guardarBorrador(true)}>
                    Enviar a aprobación
                  </Button>
                </>
              ) : (
                <Button onClick={guardarEdicion} disabled={procesando}>
                  Guardar y reenviar
                </Button>
              )}
            </div>
          </div>
        ) : (
        <div className="flex flex-col gap-4">
          {corporativo ? (
            <div className="flex flex-col gap-2 rounded-md border border-primary/30 bg-accent/40 p-3 text-sm" data-testid="cvhcp-detalle-corporativo">
              <p className="flex items-center gap-2 font-medium"><Building2 className="size-4 text-primary" /> {convenio.estado === "Borrador" ? "Se elaborará en el aplicativo corporativo de contratos" : "Elaborado en el aplicativo corporativo de contratos"}</p>
              {/* Octubre 2026: mientras siga en borrador se puede reversar la decisión y elaborarlo en BEATS. */}
              {convenio.estado === "Borrador" && puedeEditarBorrador && (
                <div>
                  <Button type="button" size="sm" variant="outline" onClick={() => iniciarEdicion("borrador", { elaboradoEnContratosCorporativo: false })} data-testid="cvhcp-detalle-mejor-en-beats">
                    Mejor crearlo en BEATS
                  </Button>
                </div>
              )}
              <p>
                Este Convenio HCP se elaboró fuera de BEATS — no tiene cadena de aprobación ni texto legal aquí. La copia firmada se carga en el Expediente del evento.
              </p>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                <div><dt className="inline text-muted-foreground">HCP / Consultor: </dt><dd className="inline font-medium">{convenio.consultorNombre || "—"}</dd></div>
                <div><dt className="inline text-muted-foreground">Compañía: </dt><dd className="inline font-medium">{convenio.companiaNombre || "—"}</dd></div>
                <div><dt className="inline text-muted-foreground">Identificación: </dt><dd className="inline font-medium">{convenio.consultorIdentificacion || "—"}</dd></div>
                <div><dt className="inline text-muted-foreground">Correo: </dt><dd className="inline font-medium">{convenio.consultorEmail || "—"}</dd></div>
              </dl>
            </div>
          ) : (
          <CuerpoCompacto>
            <CuerpoConvenioHCP convenio={convenio} idioma={idioma} empresaGrupo={empresaGrupo} pais={pais} camposPersonalizadosDefinidos={snapshotFormatoCongelado?.camposPersonalizados ?? campos} />
          </CuerpoCompacto>
          )}

          {puedeGestionarArchivoFirmado && (
            <div>
              <CampoArchivo
                etiqueta="Copia firmada por el HCP"
                valor={archivoFirmadoId}
                onChange={guardarArchivoFirmado}
                aceptar="application/pdf,image/*"
                contexto={convenio.consultorNombre}
              />
            </div>
          )}

          {/* AJUSTES (septiembre/octubre 2026), pedido explícito: una vez
              terminado el flujo de aprobación, enviar el convenio al
              HCP/speaker para que lo revise y firme, y por separado, enviar
              los documentos que hagan falta al solicitante original para
              sus trámites internos. Restringido a Dirección Médica (la
              Edge Function `send-email` lo exige en el servidor). */}
          {puedeEnviarDocumentosPorCorreo && (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setMostrarEnvioHcp(true)}>
                Enviar al HCP para firma
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={cargandoPaquete} onClick={() => void abrirEnvioSolicitante()}>
                {cargandoPaquete ? "Preparando documentos..." : "Enviar documentos"}
              </Button>
              {convenio.archivoParaHCPEnviadoEn && (
                <span className="text-xs text-muted-foreground">
                  Enviado al HCP el {formatearFechaHora(convenio.archivoParaHCPEnviadoEn)}.
                </span>
              )}
            </div>
          )}

          <EnviarDocumentoDialog
            open={mostrarEnvioHcp}
            onOpenChange={setMostrarEnvioHcp}
            titulo="Enviar convenio al HCP para firma"
            tipoDoc="convenioHCP"
            documentoId={convenio.id}
            destinatarioEmailInicial={convenio.consultorEmail}
            destinatarioNombreInicial={convenio.consultorNombre}
            asuntoInicial={`Convenio de prestación de servicios — ${convenio.consultorNombre}`}
            mensajeInicial={`Estimado/a ${convenio.consultorNombre},\n\nAdjunto el convenio ya aprobado internamente. Por favor revísalo, fírmalo y devuélvenoslo para completar el trámite.\n\nGracias.`}
            tituloDocumentosPdf="Convenio para firma (PDF generado automáticamente)"
            documentosPdf={documentosPdfParaHcp}
            onEnviado={marcarEnviadoHcpYActualizar}
          />
          <EnviarDocumentoDialog
            open={mostrarEnvioSolicitante}
            onOpenChange={setMostrarEnvioSolicitante}
            titulo="Enviar documentos"
            tipoDoc="convenioHCP"
            documentoId={convenio.id}
            destinatarioEmailInicial={creador?.email}
            destinatarioNombreInicial={creador?.nombre}
            asuntoInicial={`Documentos del Convenio HCP — ${convenio.consultorNombre}`}
            mensajeInicial={`Hola,\n\nAdjunto los documentos del Convenio HCP de ${convenio.consultorNombre} para tus trámites internos.\n\nGracias.`}
            archivosLista={archivosPaquete}
            tituloDocumentosPdf="Documentos generados en BEATS — marca cuáles se envían en PDF"
            tituloArchivos="Archivos cargados del evento — marca cuáles se adjuntan"
            documentosPdf={paqueteSolicitante}
            onEnviado={onActualizado}
          />

          <Separator />

          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">Cadena de aprobación</h3>
            {corporativo && (
              <p className="text-xs text-muted-foreground">Sin cadena de aprobación en BEATS: el convenio se aprobó y firmó en el aplicativo corporativo de contratos.</p>
            )}
              {documentoCongelado(convenio.estado, convenio.aprobaciones) && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="aviso-congelado">
                  <Lock className="size-3" /> Formulario congelado: los campos y las firmas ya registradas no cambian. Solo una enmienda justificada puede reabrirlo.
                </p>
              )}
            {/* AJUSTES (septiembre/octubre 2026), pedido explícito: ver el
                comentario igual en `DetalleEvento.tsx` — nombre de quien resolvió
                + fecha/hora, y se quita la palabra "Firma:" (el "sin fondo" vive
                en `FirmaManuscritaUsuario`). A diferencia de Evento/Convenio/CAF,
                aquí NO se usa el mapa `ETIQUETA_ROL_CADENA_APROBACION` para el
                paso de Legal/Compliance: ver el comentario de ese mapa en
                `lib/aprobaciones.ts` — este paso es a propósito un visto bueno
                previo, no una revisión formal de "Compliance Officer". */}
            {convenio.aprobaciones.map((paso) => {
              const resolutor = paso.estado === "aprobado" ? usuariosAprobacion.get(paso.resueltoPorId ?? "") : undefined;
              return (
                <FilaCadenaAprobacion key={paso.orden} paso={paso} etiquetaRol={paso.etiqueta} nombre={resolutor?.nombre} firmaId={paso.firmaCongeladaId ?? resolutor?.firmaId} />
              );
            })}

            {/* Entrega 25: notas de aprobación/rechazo en orden cronológico, justo después de la cadena. */}
            <NotasAprobacionVista pasos={convenio.aprobaciones} resolverNombre={(id) => (id ? usuariosAprobacion.get(id)?.nombre ?? "—" : "—")} />

            {indiceActionable >= 0 && (
              <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
                <Textarea
                  placeholder="Comentario (obligatorio para rechazar)"
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="destructive" disabled={procesando} onClick={() => resolver("rechazado")}>
                    Rechazar
                  </Button>
                  <Button disabled={procesando} onClick={() => resolver("aprobado")}>
                    Aprobar
                  </Button>
                </div>
              </div>
            )}

            {puedeAjustarClausulado && (
              <div className="flex flex-col gap-2 rounded-md border p-3">
                <h3 className="text-sm font-semibold">Ajustar una cláusula (solo este contrato)</h3>
                <p className="text-xs text-muted-foreground">
                  Reemplaza el texto de un numeral o anexo únicamente en este contrato — la plantilla general no se
                  modifica y los demás contratos no se ven afectados.
                </p>
                <Select value={seccionAjuste} onValueChange={abrirAjuste}>
                  <SelectTrigger id="convenio-hcp-seccion-ajuste"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SECCIONES_CLAUSULADO.map((s) => (
                      <SelectItem key={s.valor} value={s.valor}>
                        {s.etiqueta}{convenio.ajustesClausula.some((a) => a.seccion === s.valor) ? " (ajustada)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {mostrarAjuste && (
                  <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="ajuste-texto-es">Texto (Español)</Label>
                        <Textarea sinMayusculas id="ajuste-texto-es" rows={4} value={textoEsAjuste} onChange={(e) => setTextoEsAjuste(e.target.value)} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="ajuste-texto-en">Texto (English)</Label>
                        <Textarea sinMayusculas id="ajuste-texto-en" rows={4} value={textoEnAjuste} onChange={(e) => setTextoEnAjuste(e.target.value)} />
                      </div>
                    </div>
                    <AvisoIdiomaDesalineado actual={{ es: textoEsAjuste, en: textoEnAjuste }} original={textoOriginalAjuste} />
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="ajuste-justificacion">Justificación *</Label>
                      <Textarea id="ajuste-justificacion" value={justificacionAjuste} onChange={(e) => setJustificacionAjuste(e.target.value)} />
                    </div>
                    <div className="flex justify-end gap-2">
                      {convenio.ajustesClausula.some((a) => a.seccion === seccionAjuste) && (
                        <Button variant="ghost" disabled={procesando} onClick={quitarAjusteActual}>Quitar ajuste</Button>
                      )}
                      <Button variant="outline" onClick={() => setMostrarAjuste(false)}>Cancelar</Button>
                      <Button disabled={procesando} onClick={guardarAjuste}>Guardar ajuste</Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {mostrarAvisoBloqueo && (
              <p className="rounded-md border border-dashed border-destructive/40 p-2 text-xs text-destructive">
                {bloqueoProximidad.mensaje}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              {puedeEditarBorrador && (
                <Button variant="outline" onClick={() => iniciarEdicion("borrador")}>
                  Editar borrador
                </Button>
              )}
              {puedeEditarYReenviar && (
                <Button variant="outline" onClick={() => iniciarEdicion("rechazado")}>
                  Editar y reenviar
                </Button>
              )}
              {puedeDevolver && !mostrarDevolver && (
                <Button variant="outline" onClick={() => setMostrarDevolver(true)}>
                  Devolver
                </Button>
              )}
              {puedeEnmendar && !mostrarEnmienda && (
                <Button variant="outline" onClick={() => setMostrarEnmienda(true)}>
                  Solicitar enmienda
                </Button>
              )}
              {puedeSolicitarAdenda && !mostrarAdenda && (
                <Button variant="outline" onClick={() => setMostrarAdenda(true)}>
                  Adenda o ajuste al formulario
                </Button>
              )}
              {puedeAnular && !mostrarAnular && (
                <Button variant="ghost" onClick={() => setMostrarAnular(true)}>
                  Anular
                </Button>
              )}
              {puedeEliminarBorrador && !mostrarEliminarBorrador && (
                <Button variant="ghost" onClick={() => setMostrarEliminarBorrador(true)}>
                  Eliminar borrador
                </Button>
              )}
            </div>

            {mostrarDevolver && (
              <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
                <p className="text-xs text-muted-foreground">
                  El Convenio HCP se suspende del flujo de aprobación y vuelve a ser editable (queda en estado
                  "Devuelto"), ya que ningún aprobador lo ha firmado todavía.
                </p>
                <Textarea
                  placeholder="Motivo de la devolución"
                  value={motivoDevolver}
                  onChange={(e) => setMotivoDevolver(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setMostrarDevolver(false)}>Cancelar</Button>
                  <Button disabled={procesando} onClick={confirmarDevolver}>Confirmar devolución</Button>
                </div>
              </div>
            )}

            {mostrarEnmienda && (
              <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
                <p className="text-xs text-muted-foreground">
                  Este Convenio HCP ya tiene al menos una firma en su cadena de aprobación, así que no se puede
                  devolver — solo corregirse mediante una enmienda justificada. Al guardar los cambios, el contrato
                  vuelve a Pendiente y debe recorrer de nuevo la cadena de aprobación. La ventana de enmienda vence a
                  los 7 días de abierta.
                </p>
                <Textarea
                  placeholder="Justificación de la enmienda"
                  value={justificacionEnmienda}
                  onChange={(e) => setJustificacionEnmienda(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setMostrarEnmienda(false)}>Cancelar</Button>
                  <Button disabled={procesando} onClick={solicitarEnmienda}>Continuar</Button>
                </div>
              </div>
            )}

            {mostrarAdenda && (
              <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
                <p className="text-xs text-muted-foreground">
                  Explica por qué se necesita ajustar este Convenio HCP ya aprobado. Al guardar los cambios, el
                  contrato vuelve a Pendiente y debe recorrer de nuevo la cadena de aprobación. La ventana de adenda
                  vence a los 7 días de abierta.
                </p>
                <Textarea
                  placeholder="Justificación de la adenda"
                  value={justificacionAdenda}
                  onChange={(e) => setJustificacionAdenda(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setMostrarAdenda(false)}>Cancelar</Button>
                  <Button disabled={procesando} onClick={solicitarAdenda}>Continuar</Button>
                </div>
              </div>
            )}

            {mostrarAnular && (
              <div className="flex flex-col gap-2 rounded-md border border-destructive/40 p-3">
                <Textarea
                  placeholder="Motivo de anulación"
                  value={motivoAnulacion}
                  onChange={(e) => setMotivoAnulacion(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setMostrarAnular(false)}>Cancelar</Button>
                  <Button variant="destructive" disabled={procesando} onClick={confirmarAnulacion}>
                    Confirmar anulación
                  </Button>
                </div>
              </div>
            )}

            {mostrarEliminarBorrador && (
              <div className="flex flex-col gap-2 rounded-md border border-destructive/40 p-3">
                <p className="text-xs text-muted-foreground">
                  Esta acción elimina el borrador por completo y no deja rastro en el registro de auditoría.
                  No se puede deshacer.
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setMostrarEliminarBorrador(false)}>Cancelar</Button>
                  <Button variant="destructive" disabled={procesando} onClick={confirmarEliminarBorrador}>
                    Confirmar eliminación
                  </Button>
                </div>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">ID interno: {convenio.id}</p>
          </div>
        </div>
        )}
      </DialogContent>

      {/* Fase 8 (hallazgo grande): diálogo de impresión separado y apilado. */}
      <Dialog open={mostrarImpresion} onOpenChange={setMostrarImpresion}>
        <DialogContent className="left-0 top-0 h-screen w-screen max-w-none max-h-none translate-x-0 translate-y-0 rounded-none border-0 shadow-none">
          <DialogTitle className="sr-only">Vista de impresión — Convenio HCP</DialogTitle>
          {/* El interruptor Español/English vive solo en el diálogo compacto
              (arriba) — es el mismo estado `idioma` compartido, así que el
              idioma elegido ahí ya se refleja aquí. No se duplica el botón
              para no arriesgar dos botones "English"/"Español" visibles a
              la vez si algún día se relaja el aislamiento entre diálogos. */}
          <DocumentoImprimible
            estado={convenio.estado}
            tipo="convenioHCP"
            empresaGrupo={convenio.companiaNombre || undefined}
            documentoId={convenio.id}
            creadoPorId={convenio.creadoPorId}
            nombreDocumento={convenio.consultorNombre}
            onCerrar={() => setMostrarImpresion(false)}
            pieEnCuerpo
          >
            <CuerpoConvenioHCP convenio={convenio} idioma={idioma} empresaGrupo={empresaGrupo} pais={pais} camposPersonalizadosDefinidos={snapshotFormatoCongelado?.camposPersonalizados ?? campos} conPie />
          </DocumentoImprimible>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
