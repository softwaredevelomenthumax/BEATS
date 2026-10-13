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
import { CreadoPorLinea, CuerpoConvenio, CuerpoCompacto, DocumentoImprimible } from "@/components/print/DocumentoImprimible";
import { VisorArchivo } from "@/components/archivos/VisorArchivo";
import { FilaCadenaAprobacion } from "@/components/FilaCadenaAprobacion";
import { NotasAprobacionVista } from "@/components/NotasAprobacion";
import { parsearSnapshotFormato } from "@/lib/snapshotFormato";
import { FormularioConvenio, calcularErroresConvenio, type DatosFormularioConvenio } from "@/components/forms/FormularioConvenio";
import { useAuth } from "@/hooks/useAuth";
import { useCompania } from "@/hooks/useCompania";
import { useUsuariosPorId } from "@/hooks/useUsuariosPorId";
import {
  abrirVentanaAdendaConvenio,
  anularConvenio,
  cerrarVentanaAdendaConvenio,
  cerrarVentanaEnmiendaConvenio,
  devolverConvenio,
  editarBorradorConvenio,
  editarYReenviarConvenio,
  eliminarBorradorConvenio,
  resolverPasoConvenio,
  solicitarEnmiendaConvenio,
  traerConvenios,
} from "@/lib/convenio";
import { puedeResolverPaso, ETIQUETA_ROL_CADENA_APROBACION } from "@/lib/aprobaciones";
import {
  evaluarBloqueoPorProximidadEvento,
  puedeDevolverDocumento,
  puedeEditarComoBorrador,
  puedeSolicitarEnmienda,
  traerFechaInicioEventoPorId, puedeAnularSegunEstado } from "@/lib/cicloVidaDocumento";
import { traerCamposPersonalizados, type CampoPersonalizadoDefinicion } from "@/lib/camposPersonalizados";
import { traerEtiquetasCampo, type EtiquetaCampo } from "@/lib/etiquetasCampo";
import { traerEventos } from "@/lib/evento";
import { eventosParaOrigenSpeakerExterno, type OpcionEventoOrigen } from "@/lib/documentosRequeridosEvento";
import { traerSpeakersResumen, type SpeakerResumen } from "@/lib/speakers";
import type { Convenio } from "@/types";
import { type EstadoDoc } from "@/lib/enums";

/** "rechazado"/"adenda": Guardar y reenviar (siempre fuerza Pendiente). "borrador": Guardar borrador / Enviar a aprobación (repetible). "enmienda": igual que rechazado, pero cierra la ventana de enmienda (no la de adenda) al guardar. */
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
  convenio: Convenio;
  abierto: boolean;
  onCerrar: () => void;
  onActualizado: () => void;
}

export function DetalleConvenio({ convenio, abierto, onCerrar, onActualizado }: Props) {
  const { usuario } = useAuth();
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
  const [fechaEventoVinculado, setFechaEventoVinculado] = React.useState<string | null>(null);

  const [campos, setCampos] = React.useState<CampoPersonalizadoDefinicion[]>([]);
  const [etiquetas, setEtiquetas] = React.useState<EtiquetaCampo[]>([]);
  const [eventos, setEventos] = React.useState<OpcionEventoOrigen[]>([]);
  const [speakers, setSpeakers] = React.useState<SpeakerResumen[]>([]);
  const [conveniosExistentes, setConveniosExistentes] = React.useState<Convenio[]>([]);
  const [datosEdicion, setDatosEdicion] = React.useState<DatosFormularioConvenio | null>(null);
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
    traerEventos()
      .then((evs) => setEventos(eventosParaOrigenSpeakerExterno(evs)))
      .catch(() => setEventos([]));
    traerSpeakersResumen().then(setSpeakers).catch(() => setSpeakers([]));
    traerConvenios().then(setConveniosExistentes).catch(() => setConveniosExistentes([]));
    traerFechaInicioEventoPorId(convenio.eventoOrigenId).then(setFechaEventoVinculado).catch(() => setFechaEventoVinculado(null));
    setEditando(false);
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

  async function resolver(decision: "aprobado" | "rechazado") {
    if (indiceActionable < 0) return;
    if (decision === "rechazado" && !comentario.trim()) {
      toast.error("Debes indicar un motivo para rechazar.");
      return;
    }
    setProcesando(true);
    try {
      await resolverPasoConvenio(convenio, indiceActionable, decision, usuarioSesion, comentario);
      toast.success(decision === "aprobado" ? "Etapa aprobada." : "Convenio rechazado.");
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

  function datosDesdeConvenio(): DatosFormularioConvenio {
    return {
      eventoOrigenId: convenio.eventoOrigenId ?? "",
      empleadoResponsableNombreCargo: convenio.empleadoResponsableNombreCargo,
      departamento: convenio.departamento,
      unidadNegocioUbicacion: convenio.unidadNegocioUbicacion,
      tipoActividad: convenio.tipoActividad,
      organizadoPor: convenio.organizadoPor,
      organizador: convenio.organizador,
      speakerId: convenio.speakerId,
      hcpNombreCompleto: convenio.hcpNombreCompleto,
      hcpNumeroDocumento: convenio.hcpNumeroDocumento,
      hcpEspecialidad: convenio.hcpEspecialidad,
      hcpEstadoProvincia: convenio.hcpEstadoProvincia,
      hcpDireccion: convenio.hcpDireccion,
      hcpPais: convenio.hcpPais,
      hcpCiudad: convenio.hcpCiudad,
      hcpCedulaLicencia: convenio.hcpCedulaLicencia,
      hcpRFC: convenio.hcpRFC,
      tipoServicio: convenio.tipoServicio,
      nombreEventoServicio: convenio.nombreEventoServicio,
      fechaInicioActividad: convenio.fechaInicioActividad ?? "",
      fechaFinActividad: convenio.fechaFinActividad ?? "",
      esConsejoAsesores: convenio.esConsejoAsesores,
      tituloConsejoAsesores: convenio.tituloConsejoAsesores,
      numeroHCPConsejo: convenio.numeroHCPConsejo,
      justificacionNumeroHCP: convenio.justificacionNumeroHCP,
      esFuncionarioGobierno: convenio.esFuncionarioGobierno,
      supuestoCargoImportante: convenio.supuestoCargoImportante,
      supuestoRepresentanteCompras: convenio.supuestoRepresentanteCompras,
      supuestoInfluenciaDecisionGubernamental: convenio.supuestoInfluenciaDecisionGubernamental,
      advertenciaFuncionarioGobiernoConfirmada: convenio.advertenciaFuncionarioGobiernoConfirmada,
      objetivo: convenio.objetivo,
      criteriosSeleccion: convenio.criteriosSeleccion,
      cvAdjunto: convenio.cvAdjunto,
      contraprestacionHCP: convenio.contraprestacionHCP,
      monedaContraprestacion: convenio.monedaContraprestacion,
      consistenteTabuladorTarifas: convenio.consistenteTabuladorTarifas,
      explicacionSiNoConsistente: convenio.explicacionSiNoConsistente,
      agendaReunion: convenio.agendaReunion,
      archivoAgendaId: convenio.archivoAgendaId,
      cateringNombreServicio: convenio.cateringNombreServicio,
      contraprestacionCatering: convenio.contraprestacionCatering,
      lugarReunion: convenio.lugarReunion,
      firmaEmpleadoCertifica: convenio.firmaEmpleadoCertifica,
      sesionesParticipacionIds: convenio.sesionesParticipacionIds,
      camposPersonalizados: convenio.camposPersonalizados,
    };
  }

  function iniciarEdicion(origen: OrigenEdicion) {
    setDatosEdicion(datosDesdeConvenio());
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
      const ventana = await abrirVentanaAdendaConvenio(convenio, justificacionAdenda, usuarioSesion);
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
    const erroresCalculados = calcularErroresConvenio(datosEdicion);
    setErroresEdicion(erroresCalculados);
    if (Object.keys(erroresCalculados).length > 0) {
      toast.error("Revisa los campos marcados antes de reenviar.");
      return;
    }
    setProcesando(true);
    try {
      await editarYReenviarConvenio(convenio, datosEdicion, usuarioSesion);
      if (ventanaAdenda) {
        try {
          await cerrarVentanaAdendaConvenio(ventanaAdenda.adendaId, convenio.id, { ...convenio, ...datosEdicion });
        } catch (e) {
          console.error("La adenda se guardó pero no se pudo cerrar formalmente la ventana:", e);
        }
        toast.success("Adenda guardada y reenviada a aprobación.");
      } else if (origenEdicion === "enmienda") {
        try {
          await cerrarVentanaEnmiendaConvenio(convenio.id);
        } catch (e) {
          console.error("La enmienda se guardó pero no se pudo cerrar formalmente la ventana:", e);
        }
        toast.success("Enmienda guardada y reenviada a aprobación.");
      } else {
        toast.success("Convenio actualizado y reenviado a aprobación.");
      }
      setEditando(false);
      setVentanaAdenda(null);
      setVentanaEnmienda(false);
      onActualizado();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo reenviar el convenio.");
    } finally {
      setProcesando(false);
    }
  }

  async function guardarBorrador(enviarAAprobacion: boolean) {
    if (!datosEdicion) return;
    if (enviarAAprobacion) {
      const erroresCalculados = calcularErroresConvenio(datosEdicion);
      setErroresEdicion(erroresCalculados);
      if (Object.keys(erroresCalculados).length > 0) {
        toast.error("Revisa los campos marcados antes de enviar.");
        return;
      }
    }
    setProcesando(true);
    try {
      await editarBorradorConvenio(convenio, datosEdicion, usuarioSesion, enviarAAprobacion);
      toast.success(enviarAAprobacion ? "Convenio enviado a aprobación." : "Borrador actualizado.");
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
      await editarBorradorConvenio(convenio, snapshot, usuarioSesion, false);
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
      await devolverConvenio(convenio, usuarioSesion, motivoDevolver);
      toast.success("Convenio devuelto: el flujo de aprobación queda suspendido y el documento vuelve a ser editable.");
      setMostrarDevolver(false);
      setMotivoDevolver("");
      onActualizado();
      onCerrar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo devolver el convenio.");
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
      await solicitarEnmiendaConvenio(convenio, usuarioSesion, justificacionEnmienda);
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
      await anularConvenio(convenio, usuarioSesion, motivoAnulacion);
      toast.success("Convenio anulado.");
      onActualizado();
      // Corrección (octubre 2026), pedido explícito del usuario: cerrar
      // el formulario tras anular, para evitar repetir la instrucción o
      // inconsistencias.
      onCerrar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo anular el convenio.");
    } finally {
      setProcesando(false);
    }
  }

  /**
   * Corrección (octubre 2026), pedido explícito del usuario: "crea una
   * opción para eliminar cualquiera de los formularios que estén
   * guardados como borrador... solo lo puede eliminar el usuario que
   * haga la solicitud" — ver `puedeEliminarBorrador` más abajo y la nota
   * larga en `eliminarBorradorConvenio` (`src/lib/convenio.ts`) sobre por
   * qué esto no deja rastro en auditoría.
   */
  async function confirmarEliminarBorrador() {
    setProcesando(true);
    try {
      await eliminarBorradorConvenio(convenio.id);
      toast.success("Borrador eliminado.");
      onActualizado();
      onCerrar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar el borrador.");
    } finally {
      setProcesando(false);
    }
  }

  const esCreadorOAdmin = usuarioSesion.esAdministrador || usuarioSesion.id === convenio.creadoPorId;
  const bloqueoProximidad = evaluarBloqueoPorProximidadEvento(fechaEventoVinculado);
  const puedeAnular = usuarioSesion.esAdministrador && puedeAnularSegunEstado(convenio.estado) && convenio.estado !== "Completado";
  const puedeEliminarBorrador = convenio.estado === "Borrador" && usuarioSesion.id === convenio.creadoPorId;
  const puedeEditarYReenviar = convenio.estado === "Rechazado" && esCreadorOAdmin;
  // A27: Adenda solo tiene sentido sobre un convenio ya Aprobado (el mismo
  // criterio que Evento) — para uno Rechazado ya existe "Editar y reenviar".
  const puedeSolicitarAdenda = usuarioSesion.esAdministrador && convenio.estado === "Aprobado";
  const puedeEditarBorrador = puedeEditarComoBorrador(convenio.estado) && esCreadorOAdmin && !bloqueoProximidad.bloqueado;
  const puedeDevolver = puedeDevolverDocumento(convenio.estado, convenio.aprobaciones) && esCreadorOAdmin && !bloqueoProximidad.bloqueado;
  const puedeEnmendar = puedeSolicitarEnmienda(convenio.estado, convenio.aprobaciones) && esCreadorOAdmin && !bloqueoProximidad.bloqueado;
  const mostrarAvisoBloqueo =
    bloqueoProximidad.bloqueado && esCreadorOAdmin && convenio.estado !== "Completado" && convenio.estado !== "Anulado" && convenio.estado !== "Aprobado";

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
            {convenio.hcpNombreCompleto || "Convenio de Pago"}
            <Badge variant={VARIANTE_POR_ESTADO[convenio.estado]}>{convenio.estado}</Badge>
          </DialogTitle>
          <DialogDescription>{convenio.nombreEventoServicio}</DialogDescription>
        </DialogHeader>
        {!editando && (
          <div className="-mt-2 flex flex-wrap items-center justify-between gap-2">
            <CreadoPorLinea creadoPorId={convenio.creadoPorId} creadoEn={convenio.creadoEn} />
            <Button variant="outline" size="sm" onClick={() => setMostrarImpresion(true)}>
              <Printer className="h-3.5 w-3.5" /> Ver / Imprimir / Exportar a PDF
            </Button>
          </div>
        )}

        {editando && datosEdicion ? (
          <div className="flex flex-col gap-4">
            {ventanaAdenda && (
              <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                Editando dentro de una ventana de adenda — al guardar, el convenio vuelve a Pendiente y se reinicia la cadena de aprobación.
              </p>
            )}
            {ventanaEnmienda && (
              <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                Editando dentro de una ventana de enmienda — al guardar, el convenio vuelve a Pendiente y se reinicia la cadena de aprobación.
              </p>
            )}
            {origenEdicion === "borrador" && (
              <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                Puedes guardar como borrador las veces que quieras. Solo se valida por completo cuando decidas enviarlo a aprobación.
                {" "}Se autoguarda cada cierto tiempo mientras editas.
                {autoguardadoEn && ` Autoguardado el ${formatearFechaHora(autoguardadoEn)}.`}
              </p>
            )}
            <FormularioConvenio
              valor={datosEdicion}
              onChange={setDatosEdicion}
              errores={erroresEdicion}
              eventosDisponibles={eventos}
              speakersDisponibles={speakers}
              documentosExistentes={conveniosExistentes}
              documentoActualId={convenio.id}
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
              <CuerpoConvenio convenio={convenio} empresaGrupo={empresaGrupo} pais={pais} camposPersonalizadosDefinidos={snapshotFormatoCongelado?.camposPersonalizados ?? campos} />
            </CuerpoCompacto>

            {convenio.archivoAgendaId && (
              <div className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <span className="flex-1">Agenda de la reunión (archivo adjunto)</span>
                <VisorArchivo archivoId={convenio.archivoAgendaId} etiqueta="Ver" size="sm" variant="outline" />
              </div>
            )}

            <Separator />

            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">Cadena de aprobación</h3>
              {documentoCongelado(convenio.estado, convenio.aprobaciones) && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="aviso-congelado">
                  <Lock className="size-3" /> Formulario congelado: los campos y las firmas ya registradas no cambian. Solo una enmienda justificada puede reabrirlo.
                </p>
              )}
              {/* AJUSTES (septiembre/octubre 2026), pedido explícito: ver el
                  comentario igual en `DetalleEvento.tsx` — nombre centrado,
                  fecha/hora debajo del badge de estado. */}
              {convenio.aprobaciones.map((paso) => {
                const resolutor = paso.estado === "aprobado" ? usuariosAprobacion.get(paso.resueltoPorId ?? "") : undefined;
                return (
                  <FilaCadenaAprobacion key={paso.orden} paso={paso} etiquetaRol={ETIQUETA_ROL_CADENA_APROBACION[paso.rolRequerido] ?? paso.etiqueta} nombre={resolutor?.nombre} firmaId={paso.firmaCongeladaId ?? resolutor?.firmaId} />
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
                    El convenio se suspende del flujo de aprobación y vuelve a ser editable (queda en estado "Devuelto"),
                    ya que ningún aprobador lo ha firmado todavía.
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
                    Este convenio ya tiene al menos una firma en su cadena de aprobación, así que no se puede devolver —
                    solo corregirse mediante una enmienda justificada. Al guardar los cambios, el convenio vuelve a
                    Pendiente y debe recorrer de nuevo la cadena de aprobación. La ventana de enmienda vence a los 7
                    días de abierta.
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
                    Explica por qué se necesita ajustar este convenio ya aprobado. Al guardar los cambios, el convenio
                    vuelve a Pendiente y debe recorrer de nuevo la cadena de aprobación. La ventana de adenda vence a
                    los 7 días de abierta.
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
          <DialogTitle className="sr-only">Vista de impresión — Convenio de Pago a HCP</DialogTitle>
          <DocumentoImprimible
            estado={convenio.estado}
            tipo="convenio"
            empresaGrupo={empresaGrupo}
            documentoId={convenio.id}
            creadoPorId={convenio.creadoPorId}
            nombreDocumento={convenio.hcpNombreCompleto}
            onCerrar={() => setMostrarImpresion(false)}
          >
            <CuerpoConvenio convenio={convenio} empresaGrupo={empresaGrupo} pais={pais} camposPersonalizadosDefinidos={snapshotFormatoCongelado?.camposPersonalizados ?? campos} />
          </DocumentoImprimible>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
