import { documentoCongelado } from "@/lib/congelamiento";
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
import { Separator } from "@/components/ui/separator";
import { Printer, Lock } from "lucide-react";
import { CreadoPorLinea, CuerpoEvento, CuerpoCompacto, DocumentoImprimible } from "@/components/print/DocumentoImprimible";
import { FormularioEvento, banderasSpeakersDeEvento, calcularErroresEvento, type DatosFormularioEvento } from "@/components/forms/FormularioEvento";
import { FolderOpen } from "lucide-react";
import { useVentanasDocumentos } from "@/hooks/useVentanasDocumentos";
import { FilaCadenaAprobacion } from "@/components/FilaCadenaAprobacion";
import { NotasAprobacionVista } from "@/components/NotasAprobacion";
import { parsearSnapshotFormato } from "@/lib/snapshotFormato";
import { useAuth } from "@/hooks/useAuth";
import { useConfirmar } from "@/hooks/useConfirmar";
import { useCompania } from "@/hooks/useCompania";
import { useUsuariosPorId } from "@/hooks/useUsuariosPorId";
import {
  abrirVentanaAdendaEvento,
  anularEvento,
  cerrarVentanaAdendaEvento,
  cerrarVentanaEnmiendaEvento,
  desactivarCodigoAccesoEvento,
  eliminarCodigoAccesoEvento,
  devolverEvento,
  eliminarBorradorEvento,
  editarBorradorEvento,
  editarYReenviarEvento,
  generarCodigoAccesoEvento,
  resolverPasoEvento,
  solicitarEnmiendaEvento,
  traerCodigosAccesoEvento,
} from "@/lib/evento";
import { puedeResolverPaso, ETIQUETA_ROL_CADENA_APROBACION } from "@/lib/aprobaciones";
import {
  evaluarBloqueoPorProximidadEvento,
  puedeDevolverDocumento,
  puedeEditarComoBorrador,
  puedeSolicitarEnmienda, puedeAnularSegunEstado } from "@/lib/cicloVidaDocumento";
import { traerCamposPersonalizados, type CampoPersonalizadoDefinicion } from "@/lib/camposPersonalizados";
import { traerEtiquetasCampo, type EtiquetaCampo } from "@/lib/etiquetasCampo";
import { traerSpeakersResumen, type SpeakerResumen } from "@/lib/speakers";
import { traerProductosResumen, type ProductoResumen } from "@/lib/productos";
import type { CodigoAccesoEvento, Evento } from "@/types";
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
  evento: Evento;
  abierto: boolean;
  onCerrar: () => void;
  onActualizado: () => void;
}

export function DetalleEvento({ evento, abierto, onCerrar, onActualizado }: Props) {
  const { usuario } = useAuth();
  const confirmar = useConfirmar();
  const { abrirExpediente } = useVentanasDocumentos();
  const [comentario, setComentario] = React.useState("");
  const [procesando, setProcesando] = React.useState(false);
  const [editando, setEditando] = React.useState(false);
  const [origenEdicion, setOrigenEdicion] = React.useState<OrigenEdicion>("rechazado");
  const [motivoAnulacion, setMotivoAnulacion] = React.useState("");
  const [mostrarAnular, setMostrarAnular] = React.useState(false);
  const [mostrarEliminarBorrador, setMostrarEliminarBorrador] = React.useState(false);
  const [mostrarImpresion, setMostrarImpresion] = React.useState(false);

  const [mostrarAdenda, setMostrarAdenda] = React.useState(false);
  const [justificacionAdenda, setJustificacionAdenda] = React.useState("");
  const [ventanaAdenda, setVentanaAdenda] = React.useState<{ adendaId: string; expiraEn: string } | null>(null);

  const [mostrarDevolver, setMostrarDevolver] = React.useState(false);
  const [motivoDevolver, setMotivoDevolver] = React.useState("");
  const [mostrarEnmienda, setMostrarEnmienda] = React.useState(false);
  const [justificacionEnmienda, setJustificacionEnmienda] = React.useState("");
  const [ventanaEnmienda, setVentanaEnmienda] = React.useState(false);

  const [codigos, setCodigos] = React.useState<CodigoAccesoEvento[]>([]);

  const [campos, setCampos] = React.useState<CampoPersonalizadoDefinicion[]>([]);
  const [etiquetas, setEtiquetas] = React.useState<EtiquetaCampo[]>([]);
  const [speakers, setSpeakers] = React.useState<SpeakerResumen[]>([]);
  const [productos, setProductos] = React.useState<ProductoResumen[]>([]);
  const [datosEdicion, setDatosEdicion] = React.useState<DatosFormularioEvento | null>(null);
  const [erroresEdicion, setErroresEdicion] = React.useState<Record<string, string>>({});
  const [autoguardadoEn, setAutoguardadoEn] = React.useState<Date | null>(null);

  // Una vez el documento queda Aprobado/Completado, las etiquetas y campos
  // personalizados que se ven (en la vista compacta y en impresión) deben
  // quedar fijos tal como estaban en ese momento, aunque Legal/Compliance
  // cambie la configuración después — ver
  // `db/agregar_inmutabilidad_documentos_firmados.sql`.
  const snapshot = React.useMemo(() => parsearSnapshotFormato(evento.snapshotFormato), [evento.snapshotFormato]);

  React.useEffect(() => {
    if (!abierto) return;
    traerCamposPersonalizados().then(setCampos).catch(() => setCampos([]));
    traerEtiquetasCampo().then(setEtiquetas).catch(() => setEtiquetas([]));
    traerSpeakersResumen().then(setSpeakers).catch(() => setSpeakers([]));
    traerProductosResumen().then(setProductos).catch(() => setProductos([]));
    traerCodigosAccesoEvento(evento.id).then(setCodigos).catch(() => setCodigos([]));
    setEditando(false);
    setAutoguardadoEn(null);
    setComentario("");
    setMostrarAnular(false);
    setMostrarImpresion(false);
    setMostrarAdenda(false);
    setJustificacionAdenda("");
    setVentanaAdenda(null);
    setMostrarDevolver(false);
    setMotivoDevolver("");
    setMostrarEnmienda(false);
    setJustificacionEnmienda("");
    setVentanaEnmienda(false);
  }, [abierto, evento.id]);

  if (!usuario) return null;
  const usuarioSesion = usuario;
  const { companiaActual } = useCompania();
  const empresaGrupo = companiaActual ?? usuarioSesion.empresasGrupo[0] ?? "";
  const pais = usuarioSesion.paisesOperacion[0] ?? "";

  const indiceActionable = evento.aprobaciones.findIndex((_, i) => puedeResolverPaso(usuarioSesion, evento.aprobaciones, i));
  // AJUSTES (septiembre/octubre 2026), pedido explícito: mostrar, en el
  // campo "Firma" de la ventana de aprobación, la firma manuscrita de quien
  // resolvió cada etapa (ya aprobada).
  const usuariosAprobacion = useUsuariosPorId(evento.aprobaciones.map((p) => p.resueltoPorId));

  async function resolver(decision: "aprobado" | "rechazado") {
    if (indiceActionable < 0) return;
    if (decision === "rechazado" && !comentario.trim()) {
      toast.error("Debes indicar un motivo para rechazar.");
      return;
    }
    setProcesando(true);
    try {
      await resolverPasoEvento(evento, indiceActionable, decision, usuarioSesion, comentario);
      toast.success(decision === "aprobado" ? "Etapa aprobada." : "Solicitud de Evento rechazada.");
      onActualizado();
      // AJUSTES (septiembre/octubre 2026), pedido explícito: cerrar la
      // ventana del documento tras aprobar/rechazar/devolver, para evitar
      // errores o inconsistencias (ver también `confirmarDevolver`).
      onCerrar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo procesar la decisión.");
    } finally {
      setProcesando(false);
    }
  }

  function datosDesdeEvento(): DatosFormularioEvento {
    return {
      nombreSolicitante: evento.nombreSolicitante,
      nombreSuperiorAprueba: evento.nombreSuperiorAprueba,
      empresaGrupo: evento.empresaGrupo,
      datosHCP: evento.datosHCP,
      tipoEvento: evento.tipoEvento,
      areaEspecialidad: evento.areaEspecialidad,
      lineaTerapeutica: evento.lineaTerapeutica,
      nombreEvento: evento.nombreEvento,
      organizadoPor: evento.organizadoPor,
      nombreOrganizador: evento.nombreOrganizador,
      patrocinioHcp: evento.patrocinioHcp,
      hcpNumeroDocumento: evento.hcpNumeroDocumento,
      hcpProfesion: evento.hcpProfesion,
      hcpEspecialidad: evento.hcpEspecialidad,
      hcpDireccion: evento.hcpDireccion,
      hcpPais: evento.hcpPais,
      hcpEstadoProvincia: evento.hcpEstadoProvincia,
      hcpCiudad: evento.hcpCiudad,
      hcpTelefono: evento.hcpTelefono,
      hcpEmail: evento.hcpEmail,
      fechaInicioEvento: evento.fechaInicioEvento ?? "",
      fechaFinEvento: evento.fechaFinEvento ?? "",
      modalidadSesiones: evento.modalidadSesiones,
      numeroSesiones: evento.numeroSesiones,
      facturaModalidad: evento.facturaModalidad,
      listaAsistenciaNoAplica: evento.listaAsistenciaNoAplica,
      listaAsistenciaNoAplicaMotivo: evento.listaAsistenciaNoAplicaMotivo,
      fechaInicioEstancia: evento.fechaInicioEstancia ?? "",
      fechaFinEstancia: evento.fechaFinEstancia ?? "",
      modalidadEvento: evento.modalidadEvento ?? "",
      direccion: evento.direccion,
      pais: evento.pais,
      estadoProvincia: evento.estadoProvincia,
      ciudad: evento.ciudad,
      justificacionViaticos: evento.justificacionViaticos,
      objetivosEvento: evento.objetivosEvento,
      numeroAsistentes: evento.numeroAsistentes,
      entregaMuestrasMedicas: evento.entregaMuestrasMedicas,
      detalleMuestrasMedicas: evento.detalleMuestrasMedicas,
      entregaArticulosPromocionales: evento.entregaArticulosPromocionales,
      detalleArticulosPromocionales: evento.detalleArticulosPromocionales,
      participacionAcademica: evento.participacionAcademica,
      detalleParticipacionAcademica: evento.detalleParticipacionAcademica,
      quienDictaActividad: evento.quienDictaActividad ?? "",
      ...banderasSpeakersDeEvento(evento),
      speakerParticipacionId: evento.speakerParticipacionId ?? "",
      nombreSpeakerParticipacion: evento.nombreSpeakerParticipacion,
      // Entrega 22: este número es solo el de speakers EXTERNOS (antes, en eventos con speakers internos, guardaba el de internos).
      numeroSpeakersExternos: evento.speakersParticipacion.length > 0
        ? evento.speakersParticipacion.filter((sp) => sp.tipo === "externo").length || null
        : evento.quienDictaActividad === "Speaker externo" ? evento.numeroSpeakersExternos : null,
      speakersParticipacion: evento.speakersParticipacion,
      incluidoPresupuestoAprobado: evento.incluidoPresupuestoAprobado,
      montoPresupuestoAprobado: evento.montoPresupuestoAprobado,
      advertenciaPresupuestoNoAprobado: evento.advertenciaPresupuestoNoAprobado,
      anexos: evento.anexos,
      descripcionAnexos: evento.descripcionAnexos,
      cartaInvitacionId: evento.cartaInvitacionId,
      programaAcademicoId: evento.programaAcademicoId,
      honorariosSpeaker: evento.honorariosSpeaker,
      inscripcionNoAplica: evento.inscripcionNoAplica,
      montoInscripcion: evento.montoInscripcion,
      detalleInscripcion: evento.detalleInscripcion,
      actividadAdicionalInscripcion: evento.actividadAdicionalInscripcion,
      detalleActividadAdicional: evento.detalleActividadAdicional,
      actividadIncluidaInscripcion: evento.actividadIncluidaInscripcion,
      detalleActividadIncluida: evento.detalleActividadIncluida,
      transporteNoAplica: evento.transporteNoAplica,
      transporteAcordePolitica: evento.transporteAcordePolitica,
      transporteMotivoNoAcorde: evento.transporteMotivoNoAcorde,
      tipoTransporte: evento.tipoTransporte,
      montoTransporte: evento.montoTransporte,
      cotizacionAdjunta: evento.cotizacionAdjunta,
      taxi: evento.taxi,
      valorEstimadoTaxi: evento.valorEstimadoTaxi,
      hospedajeNoAplica: evento.hospedajeNoAplica,
      hospedajeAcordePolitica: evento.hospedajeAcordePolitica,
      hospedajeMotivoNoAcorde: evento.hospedajeMotivoNoAcorde,
      numeroNoches: evento.numeroNoches,
      costoNochePersona: evento.costoNochePersona,
      nombreHotel: evento.nombreHotel,
      categoriaHotel: evento.categoriaHotel,
      motivoLocalidadDistinta: evento.motivoLocalidadDistinta,
      alimentosNoAplica: evento.alimentosNoAplica,
      alimentosAcordePolitica: evento.alimentosAcordePolitica,
      alimentosMotivoNoAcorde: evento.alimentosMotivoNoAcorde,
      montoAlimentosDia: evento.montoAlimentosDia,
      comentariosAlimentos: evento.comentariosAlimentos,
      condensadoInscripcion: evento.condensadoInscripcion,
      condensadoTransporte: evento.condensadoTransporte,
      condensadoTraslado: evento.condensadoTraslado,
      condensadoHospedaje: evento.condensadoHospedaje,
      condensadoAlimentos: evento.condensadoAlimentos,
      condensadoHonorariosSpeaker: evento.condensadoHonorariosSpeaker,
      condensadoOtro: evento.condensadoOtro,
      incluirValorParticipacion: evento.incluirValorParticipacion ?? false,
      condensadoValorParticipacion: evento.condensadoValorParticipacion ?? null,
      condensadoOtroEspecificar: evento.condensadoOtroEspecificar,
      comentariosCosto: evento.comentariosCosto,
      centroCostos: evento.centroCostos,
      moneda: evento.moneda,
      comentariosEspecialesNoAplica: evento.comentariosEspecialesNoAplica,
      comentariosEspeciales: evento.comentariosEspeciales,
      sesiones: evento.sesiones,
      muestrasPlaneadas: evento.muestrasPlaneadas,
      productosEvento: evento.productosEvento ?? [],
      camposPersonalizados: evento.camposPersonalizados,
    };
  }

  function iniciarEdicion(origen: OrigenEdicion) {
    setDatosEdicion(datosDesdeEvento());
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
      const ventana = await abrirVentanaAdendaEvento(evento.id, justificacionAdenda);
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
    const erroresCalculados = calcularErroresEvento(datosEdicion);
    setErroresEdicion(erroresCalculados);
    if (Object.keys(erroresCalculados).length > 0) {
      toast.error("Revisa los campos marcados antes de reenviar.");
      return;
    }
    setProcesando(true);
    try {
      await editarYReenviarEvento(evento, datosEdicion, usuarioSesion);
      if (ventanaAdenda) {
        try {
          await cerrarVentanaAdendaEvento(ventanaAdenda.adendaId, evento.id);
        } catch (e) {
          console.error("La adenda se guardó pero no se pudo cerrar formalmente la ventana:", e);
        }
        toast.success("Adenda guardada y reenviada a aprobación.");
      } else if (origenEdicion === "enmienda") {
        try {
          await cerrarVentanaEnmiendaEvento(evento.id);
        } catch (e) {
          console.error("La enmienda se guardó pero no se pudo cerrar formalmente la ventana:", e);
        }
        toast.success("Enmienda guardada y reenviada a aprobación.");
      } else {
        toast.success("Solicitud corregida y reenviada a aprobación.");
      }
      setEditando(false);
      setVentanaAdenda(null);
      setVentanaEnmienda(false);
      onActualizado();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo reenviar la solicitud.");
    } finally {
      setProcesando(false);
    }
  }

  async function guardarBorrador(enviarAAprobacion: boolean) {
    if (!datosEdicion) return;
    if (enviarAAprobacion) {
      const erroresCalculados = calcularErroresEvento(datosEdicion);
      setErroresEdicion(erroresCalculados);
      if (Object.keys(erroresCalculados).length > 0) {
        toast.error("Revisa los campos marcados antes de enviar.");
        return;
      }
    }
    setProcesando(true);
    try {
      await editarBorradorEvento(evento, datosEdicion, usuarioSesion, enviarAAprobacion);
      toast.success(enviarAAprobacion ? "Solicitud enviada a aprobación." : "Borrador actualizado.");
      setEditando(false);
      onActualizado();
      // Corrección (octubre 2026), pedido explícito del usuario: "al dar
      // clic en guardar borrador o enviar a aprobación, el formulario
      // debe cerrarse y mostrar el tablero de documentos, para evitar
      // duplicidades" — antes solo salía del modo edición y se quedaba en
      // la vista compacta, dentro del mismo diálogo.
      onCerrar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el borrador.");
    } finally {
      setProcesando(false);
    }
  }

  /**
   * AJUSTES (septiembre/octubre 2026), pedido explícito: "implementa una
   * estrategia para que [perder el formulario al hacer clic afuera] no
   * ocurra" — el usuario eligió "Bloquear cierre accidental + autoguardado"
   * entre las opciones ofrecidas. Esta función es la mitad de "autoguardado":
   * mientras se continúa un borrador (`origenEdicion === "borrador"`, el
   * único caso con un verdadero concepto de "borrador" guardable sin
   * validar — rechazado/adenda/enmienda son correcciones para reenviar, no
   * borradores), se guarda en segundo plano cada cierto tiempo, SIN marcar
   * `editando` en false (a diferencia de `guardarBorrador`) y sin el toast
   * de éxito normal, que sería ruidoso si se repite solo — se refleja en
   * cambio con el indicador "Autoguardado" junto a los botones.
   */
  const datosEdicionRef = React.useRef(datosEdicion);
  React.useEffect(() => {
    datosEdicionRef.current = datosEdicion;
  }, [datosEdicion]);

  async function autoguardarBorrador() {
    const snapshot = datosEdicionRef.current;
    if (!snapshot || origenEdicion !== "borrador") return;
    try {
      await editarBorradorEvento(evento, snapshot, usuarioSesion, false);
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
  }, [editando, origenEdicion, evento.id]);

  async function confirmarDevolver() {
    if (!motivoDevolver.trim()) {
      toast.error("Indica el motivo de la devolución.");
      return;
    }
    setProcesando(true);
    try {
      await devolverEvento(evento, usuarioSesion, motivoDevolver);
      toast.success("Solicitud devuelta: el flujo de aprobación queda suspendido y el documento vuelve a ser editable.");
      setMostrarDevolver(false);
      setMotivoDevolver("");
      onActualizado();
      onCerrar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo devolver la solicitud.");
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
      await solicitarEnmiendaEvento(evento, usuarioSesion, justificacionEnmienda);
      setVentanaEnmienda(true);
      setMostrarEnmienda(false);
      iniciarEdicion("enmienda");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo solicitar la enmienda.");
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
      await anularEvento(evento, usuarioSesion, motivoAnulacion);
      toast.success("Solicitud de Evento anulada.");
      onActualizado();
      // Corrección (octubre 2026), pedido explícito del usuario: cerrar
      // el formulario también al anular — ya se hacía al aprobar/
      // rechazar/devolver (ver `resolver`/`confirmarDevolver` arriba),
      // pero se quedó afuera en esta acción.
      onCerrar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo anular la solicitud.");
    } finally {
      setProcesando(false);
    }
  }

  /**
   * Corrección (octubre 2026), pedido explícito del usuario: "crea una
   * opción para eliminar cualquiera de los formularios que estén
   * guardados como borrador... solo lo puede eliminar el usuario que
   * haga la solicitud" — ver `puedeEliminarBorrador` más abajo y la nota
   * larga en `eliminarBorradorEvento` (`src/lib/evento.ts`) sobre por qué
   * esto no deja rastro en auditoría.
   */
  async function confirmarEliminarBorrador() {
    setProcesando(true);
    try {
      await eliminarBorradorEvento(evento.id);
      toast.success("Borrador eliminado.");
      onActualizado();
      onCerrar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar el borrador.");
    } finally {
      setProcesando(false);
    }
  }

  async function generarCodigo() {
    setProcesando(true);
    try {
      const nuevo = await generarCodigoAccesoEvento(evento.id, usuarioSesion);
      setCodigos((actual) => [nuevo, ...actual.map((c) => ({ ...c, activo: false }))]);
      toast.success(`Código de acceso generado: ${nuevo.codigo}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo generar el código de acceso.");
    } finally {
      setProcesando(false);
    }
  }

  async function desactivarCodigo(id: string) {
    setProcesando(true);
    try {
      await desactivarCodigoAccesoEvento(id);
      setCodigos((actual) => actual.map((c) => (c.id === id ? { ...c, activo: false } : c)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo desactivar el código.");
    } finally {
      setProcesando(false);
    }
  }

  async function eliminarCodigo(c: { id: string; codigo: string }) {
    const ok = await confirmar({
      titulo: "Eliminar código de acceso",
      mensaje: `¿Eliminar el código ${c.codigo}? Esta acción no se puede deshacer. Si el código ya se usó en el sitio del evento, solo podrá desactivarse.`,
      textoConfirmar: "Eliminar",
    });
    if (!ok) return;
    setProcesando(true);
    try {
      await eliminarCodigoAccesoEvento(c.id);
      setCodigos((actual) => actual.filter((x) => x.id !== c.id));
      toast.success("Código de acceso eliminado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar el código.");
    } finally {
      setProcesando(false);
    }
  }

  const esCreadorOAdmin = usuarioSesion.esAdministrador || usuarioSesion.id === evento.creadoPorId;
  const bloqueoProximidad = evaluarBloqueoPorProximidadEvento(evento.fechaInicioEvento);
  const puedeAnular = usuarioSesion.esAdministrador && puedeAnularSegunEstado(evento.estado);
  // Pedido explícito del usuario: "solo lo puede eliminar el usuario que
  // haga la solicitud" — a propósito NO se extiende a Administrador, a
  // diferencia de `puedeAnular`/`esCreadorOAdmin` usados en el resto del
  // archivo. Ver `eliminarBorradorEvento` (`src/lib/evento.ts`).
  const puedeEliminarBorrador = evento.estado === "Borrador" && usuarioSesion.id === evento.creadoPorId;
  const puedeEditarYReenviar = evento.estado === "Rechazado" && esCreadorOAdmin;
  const puedeSolicitarAdenda = usuarioSesion.esAdministrador && evento.estado === "Aprobado";
  const puedeGestionarCodigos = usuarioSesion.esAdministrador && (evento.estado === "Aprobado" || evento.estado === "Completado");
  const puedeEditarBorrador = puedeEditarComoBorrador(evento.estado) && esCreadorOAdmin && !bloqueoProximidad.bloqueado;
  const puedeDevolver = puedeDevolverDocumento(evento.estado, evento.aprobaciones) && esCreadorOAdmin && !bloqueoProximidad.bloqueado;
  const puedeEnmendar = puedeSolicitarEnmienda(evento.estado, evento.aprobaciones) && esCreadorOAdmin && !bloqueoProximidad.bloqueado;
  const mostrarAvisoBloqueo =
    bloqueoProximidad.bloqueado && esCreadorOAdmin && evento.estado !== "Completado" && evento.estado !== "Anulado" && evento.estado !== "Aprobado";
  // Repositorio del evento (Fase 1, sept. 2026): a diferencia del código de
  // acceso de Ejecución en Sitio, este es un documento de trabajo para el
  // cierre logístico/financiero del evento — no se restringe a
  // administradores, cualquiera con acceso al detalle del evento aprobado
  // puede cargar/ver sus archivos y registros.
  const puedeVerRepositorio = evento.estado === "Aprobado" || evento.estado === "Completado";

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
            {evento.nombreEvento || "Solicitud de Evento"}
            <Badge variant={VARIANTE_POR_ESTADO[evento.estado]}>{evento.estado}</Badge>
          </DialogTitle>
          <DialogDescription>{evento.empresaGrupo}</DialogDescription>
        </DialogHeader>
        {!editando && (
          <div className="-mt-2 flex flex-wrap items-center justify-between gap-2">
            <CreadoPorLinea creadoPorId={evento.creadoPorId} creadoEn={evento.creadoEn} />
            <Button variant="outline" size="sm" onClick={() => setMostrarImpresion(true)}>
              <Printer className="h-3.5 w-3.5" /> Ver / Imprimir / Exportar a PDF
            </Button>
          </div>
        )}

        {editando && datosEdicion ? (
          <div className="flex flex-col gap-4">
            {ventanaAdenda && (
              <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                Editando dentro de una ventana de adenda — al guardar, la solicitud vuelve a Pendiente y se reinicia la cadena de aprobación.
              </p>
            )}
            {ventanaEnmienda && (
              <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                Editando dentro de una ventana de enmienda — al guardar, la solicitud vuelve a Pendiente y se reinicia la cadena de aprobación.
              </p>
            )}
            {origenEdicion === "borrador" && (
              <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                Puedes guardar como borrador las veces que quieras. Solo se valida por completo cuando decidas enviarla a aprobación.
                {" "}Se autoguarda cada cierto tiempo mientras editas.
                {autoguardadoEn && ` Autoguardado el ${formatearFechaHora(autoguardadoEn)}.`}
              </p>
            )}
            <FormularioEvento
              valor={datosEdicion}
              onChange={setDatosEdicion}
              errores={erroresEdicion}
              speakersDisponibles={speakers}
              productosDisponibles={productos}
              camposPersonalizadosDefinidos={campos}
              etiquetasCampo={etiquetas}
              empresaGrupo={empresaGrupo}
              pais={pais}
              onCancelar={() => { setEditando(false); setVentanaAdenda(null); setVentanaEnmienda(false); }}
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
            <CuerpoCompacto>
              <CuerpoEvento evento={evento} empresaGrupo={empresaGrupo} pais={pais} camposPersonalizadosDefinidos={snapshot?.camposPersonalizados ?? campos} />
            </CuerpoCompacto>

            <Separator />

            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">Cadena de aprobación</h3>
              {documentoCongelado(evento.estado, evento.aprobaciones) && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="aviso-congelado">
                  <Lock className="size-3" /> Formulario congelado: los campos y las firmas ya registradas no cambian. Solo una enmienda justificada puede reabrirlo.
                </p>
              )}
              {/* AJUSTES (septiembre/octubre 2026), pedido explícito (entrega
                  anterior): "muestra lo siguiente: Etiqueta [...], el campo
                  'nombre' que corresponda, al frente la fecha y hora de la
                  firma y al frente de esto, la firma manuscrita (la imagen)
                  sin fondo, sin la palabra 'firma'." La etiqueta de cada paso
                  (`paso.etiqueta`) ya es la correcta para este flujo
                  (`crearCadenaAprobacionEvento`, `lib/aprobaciones.ts`):
                  "Gerente / Director de la Unidad de Negocio" / "Director
                  Médico" / "Compliance Officer".

                  AJUSTE (misma ronda, entrega siguiente), pedido explícito:
                  "centrando el nombre del usuario que firmó y ubicando la
                  fecha y hora de la firma debajo del estado del documento
                  (p. ej: debajo de Aprobado o Rechazado)" — el nombre pasa a
                  ir en una columna central con texto centrado (`flex-1
                  text-center`, entre la etiqueta de rol a la izquierda y la
                  firma/estado a la derecha), y la fecha/hora se saca de al
                  lado del nombre y pasa a un bloque propio, apilado DEBAJO
                  del badge de estado (`flex flex-col items-end`). */}
              {evento.aprobaciones.map((paso) => {
                const resolutor = paso.estado === "aprobado" ? usuariosAprobacion.get(paso.resueltoPorId ?? "") : undefined;
                return (
                  <FilaCadenaAprobacion key={paso.orden} paso={paso} etiquetaRol={ETIQUETA_ROL_CADENA_APROBACION[paso.rolRequerido] ?? paso.etiqueta} nombre={resolutor?.nombre} firmaId={paso.firmaCongeladaId ?? resolutor?.firmaId} />
                );
              })}

              {/* Entrega 25: notas de aprobación/rechazo en orden cronológico, justo después de la cadena. */}
              <NotasAprobacionVista pasos={evento.aprobaciones} resolverNombre={(id) => (id ? usuariosAprobacion.get(id)?.nombre ?? "—" : "—")} />

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

              {puedeGestionarCodigos && (
                <div className="flex flex-col gap-2 rounded-md border p-3">
                  <h3 className="text-sm font-semibold">Código de acceso — Ejecución en Sitio</h3>
                  <p className="text-xs text-muted-foreground">
                    El equipo en sitio digita este código en la app de Ejecución en Sitio para registrar la asistencia del evento.
                  </p>
                  {codigos.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                      <span className="font-mono tracking-widest">{c.codigo}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant={c.activo ? "approved" : "cancelled"}>{c.activo ? "Activo" : "Inactivo"}</Badge>
                        {c.activo && (
                          <Button variant="ghost" size="sm" disabled={procesando} onClick={() => desactivarCodigo(c.id)}>
                            Desactivar
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={procesando} onClick={() => eliminarCodigo(c)}>
                          Eliminar
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className="w-fit" disabled={procesando} onClick={generarCodigo}>
                    Generar código de acceso
                  </Button>
                </div>
              )}

              {puedeVerRepositorio && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-accent/30 p-3" data-testid="tarjeta-expediente">
                  <div className="flex flex-col">
                    <h3 className="flex items-center gap-1.5 text-sm font-semibold"><FolderOpen className="size-4 text-primary" /> Expediente del evento</h3>
                    <p className="text-xs text-muted-foreground">Documentos del sistema, soportes por speaker, asistencia, fotos y pagos.</p>
                  </div>
                  <Button size="sm" onClick={() => abrirExpediente(evento)}>Abrir expediente</Button>
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
                    La solicitud se suspende del flujo de aprobación y vuelve a ser editable (queda en estado
                    "Devuelto"), ya que ningún aprobador la ha firmado todavía.
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
                    Esta solicitud ya tiene al menos una firma en su cadena de aprobación, así que no se puede
                    devolver — solo corregirse mediante una enmienda justificada. Al guardar los cambios, la
                    solicitud vuelve a Pendiente y debe recorrer de nuevo la cadena de aprobación. La ventana de
                    enmienda vence a los 7 días de abierta.
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
                    Explica por qué se necesita ajustar esta solicitud ya aprobada. Al guardar los cambios, la solicitud
                    vuelve a Pendiente y debe recorrer de nuevo la cadena de aprobación.
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

              <p className="text-[11px] text-muted-foreground">ID interno: {evento.id}</p>
            </div>
          </div>
        )}
      </DialogContent>

      {/* Fase 8 (hallazgo grande): diálogo de impresión separado y apilado. */}
      <Dialog open={mostrarImpresion} onOpenChange={setMostrarImpresion}>
        <DialogContent className="left-0 top-0 h-screen w-screen max-w-none max-h-none translate-x-0 translate-y-0 rounded-none border-0 shadow-none">
          <DialogTitle className="sr-only">Vista de impresión — Solicitud de Evento</DialogTitle>
          <DocumentoImprimible
            estado={evento.estado}
            tipo="evento"
            empresaGrupo={evento.empresaGrupo || empresaGrupo}
            documentoId={evento.id}
            creadoPorId={evento.creadoPorId}
            nombreDocumento={evento.nombreEvento}
            onCerrar={() => setMostrarImpresion(false)}
          >
            <CuerpoEvento evento={evento} empresaGrupo={empresaGrupo} pais={pais} camposPersonalizadosDefinidos={snapshot?.camposPersonalizados ?? campos} />
          </DocumentoImprimible>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
