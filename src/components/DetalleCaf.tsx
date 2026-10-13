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
import { CreadoPorLinea, CuerpoCAF, CuerpoCompacto, DocumentoImprimible } from "@/components/print/DocumentoImprimible";
import { FilaCadenaAprobacion } from "@/components/FilaCadenaAprobacion";
import { NotasAprobacionVista } from "@/components/NotasAprobacion";
import { parsearSnapshotFormato } from "@/lib/snapshotFormato";
import { FormularioCAF, COMENTARIO_CAF_CORPORATIVO, calcularErroresCaf, type DatosFormularioCaf } from "@/components/forms/FormularioCAF";
import { useAuth } from "@/hooks/useAuth";
import { useCompania } from "@/hooks/useCompania";
import { useUsuariosPorId } from "@/hooks/useUsuariosPorId";
import {
  anularCaf,
  devolverCaf,
  editarBorradorCaf,
  editarYReenviarCaf,
  eliminarBorradorCaf,
  cerrarVentanaEnmiendaCaf,
  resolverPasoCaf,
  solicitarEnmiendaCaf,
  traerCafs,
} from "@/lib/caf";
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
import { traerConvenios } from "@/lib/convenio";
import { traerFmvs } from "@/lib/fmv";
import { eventosParaOrigenCaf, type OpcionEventoOrigen } from "@/lib/documentosRequeridosEvento";
import { traerSpeakersResumen, type SpeakerResumen } from "@/lib/speakers";
import type { Caf } from "@/types";
import { type EstadoDoc } from "@/lib/enums";

const VARIANTE_POR_ESTADO: Record<EstadoDoc, BadgeProps["variant"]> = {
  Borrador: "draft",
  Pendiente: "pending",
  Aprobado: "approved",
  Rechazado: "rejected",
  Devuelto: "draft",
  Completado: "completed",
  Anulado: "cancelled",
};

/** "rechazado": Editar y reenviar (siempre fuerza Pendiente). "borrador": Guardar borrador / Enviar a aprobación (repetible). "enmienda": igual que rechazado, pero además cierra la ventana de enmienda al guardar. */
type OrigenEdicion = "rechazado" | "borrador" | "enmienda";

interface Props {
  caf: Caf;
  abierto: boolean;
  onCerrar: () => void;
  onActualizado: () => void;
}

export function DetalleCaf({ caf, abierto, onCerrar, onActualizado }: Props) {
  const { usuario } = useAuth();
  const [comentario, setComentario] = React.useState("");
  const [procesando, setProcesando] = React.useState(false);
  const [editando, setEditando] = React.useState(false);
  const [origenEdicion, setOrigenEdicion] = React.useState<OrigenEdicion>("rechazado");
  const [motivoAnulacion, setMotivoAnulacion] = React.useState("");
  const [mostrarAnular, setMostrarAnular] = React.useState(false);
  const [mostrarEliminarBorrador, setMostrarEliminarBorrador] = React.useState(false);
  const [mostrarImpresion, setMostrarImpresion] = React.useState(false);

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
  const [cafsExistentes, setCafsExistentes] = React.useState<Caf[]>([]);
  const [datosEdicion, setDatosEdicion] = React.useState<DatosFormularioCaf | null>(null);
  const [erroresEdicion, setErroresEdicion] = React.useState<Record<string, string>>({});
  const [autoguardadoEn, setAutoguardadoEn] = React.useState<Date | null>(null);

  // Una vez el documento queda Aprobado/Completado, las etiquetas y campos
  // personalizados que se ven (en la vista compacta y en impresión) deben
  // quedar fijos tal como estaban en ese momento, aunque Legal/Compliance
  // cambie la configuración después — ver
  // `db/agregar_inmutabilidad_documentos_firmados.sql`.
  const snapshotFormatoCongelado = React.useMemo(() => parsearSnapshotFormato(caf.snapshotFormato), [caf.snapshotFormato]);

  React.useEffect(() => {
    if (!abierto) return;
    traerCamposPersonalizados().then(setCampos).catch(() => setCampos([]));
    traerEtiquetasCampo().then(setEtiquetas).catch(() => setEtiquetas([]));
    Promise.all([traerEventos(), traerConvenios(), traerFmvs()])
      .then(([evs, convenios, fmvs]) => setEventos(eventosParaOrigenCaf(evs, convenios, fmvs)))
      .catch(() => setEventos([]));
    traerSpeakersResumen().then(setSpeakers).catch(() => setSpeakers([]));
    traerCafs().then(setCafsExistentes).catch(() => setCafsExistentes([]));
    traerFechaInicioEventoPorId(caf.eventoOrigenId).then(setFechaEventoVinculado).catch(() => setFechaEventoVinculado(null));
    setEditando(false);
    setComentario("");
    setMostrarAnular(false);
    setMostrarImpresion(false);
    setMostrarDevolver(false);
    setMotivoDevolver("");
    setMostrarEnmienda(false);
    setJustificacionEnmienda("");
    setVentanaEnmienda(false);
    setAutoguardadoEn(null);
  }, [abierto, caf.id, caf.eventoOrigenId]);

  if (!usuario) return null;
  // Se reasigna a un const nuevo para que TypeScript preserve el
  // estrechamiento de tipo (Usuario, no Usuario|null) dentro de los
  // closures declarados más abajo (resolver/guardarEdicion/etc.).
  const usuarioSesion = usuario;
  const { companiaActual } = useCompania();
  const empresaGrupo = companiaActual ?? usuarioSesion.empresasGrupo[0] ?? "";
  const pais = usuarioSesion.paisesOperacion[0] ?? "";

  const indiceActionable = caf.aprobaciones.findIndex((_, i) => puedeResolverPaso(usuarioSesion, caf.aprobaciones, i));
  // AJUSTES (septiembre/octubre 2026), pedido explícito: mostrar, en el
  // campo "Firma" de la ventana de aprobación, la firma manuscrita de quien
  // resolvió cada etapa (ya aprobada).
  const usuariosAprobacion = useUsuariosPorId(caf.aprobaciones.flatMap((p) => [p.resueltoPorId, ...(p.firmantesIds ?? [])]));

  async function resolver(decision: "aprobado" | "rechazado") {
    if (indiceActionable < 0) return;
    if (decision === "rechazado" && !comentario.trim()) {
      toast.error("Debes indicar un motivo para rechazar.");
      return;
    }
    setProcesando(true);
    try {
      await resolverPasoCaf(caf, indiceActionable, decision, usuarioSesion, comentario);
      toast.success(decision === "aprobado" ? "Etapa aprobada." : "CAF rechazado.");
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

  function datosDesdeCaf(): DatosFormularioCaf {
    return {
      eventoOrigenId: caf.eventoOrigenId,
      elaboradoEnCafCorporativo: caf.elaboradoEnCafCorporativo,
      speakerId: caf.speakerId,
      tipoContrato: caf.tipoContrato,
      tipoContratoOtroEspecifique: caf.tipoContratoOtroEspecifique,
      solicitanteNombre: caf.solicitanteNombre,
      solicitanteTelefono: caf.solicitanteTelefono,
      directorAreaNombre: caf.directorAreaNombre,
      directorAreaCargo: caf.directorAreaCargo,
      contraparteNombre: caf.contraparteNombre,
      contraparteNumeroDocumento: caf.contraparteNumeroDocumento,
      contrapartePais: caf.contrapartePais,
      contraparteEstadoProvincia: caf.contraparteEstadoProvincia,
      contraparteCiudad: caf.contraparteCiudad,
      contraparteDireccion: caf.contraparteDireccion,
      contraparteTelefono: caf.contraparteTelefono,
      contraparteCorreo: caf.contraparteCorreo,
      contraparteContacto: caf.contraparteContacto,
      dueDiligence: caf.dueDiligence,
      objetoContrato: caf.objetoContrato,
      terminoContratoInicio: caf.terminoContratoInicio ?? "",
      terminoContratoFin: caf.terminoContratoFin ?? "",
      terminoContratoDeterminable: caf.terminoContratoDeterminable,
      comentarios: caf.comentarios,
      responsablesContrato: caf.responsablesContrato ?? "",
      avisoAtencion: caf.avisoAtencion ?? "",
      avisoConCopiaPara: caf.avisoConCopiaPara ?? "",
      monto: caf.monto ?? 0,
      moneda: caf.moneda,
      codigoCobroCuenta: caf.codigoCobroCuenta,
      codigoCobroDepto: caf.codigoCobroDepto,
      codigoCobroProd: caf.codigoCobroProd,
      codigoCobroProyecto: caf.codigoCobroProyecto,
      companiaNombre: caf.companiaNombre,
      codigoDocumento: caf.codigoDocumento,
      camposPersonalizados: caf.camposPersonalizados,
    };
  }

  function iniciarEdicion(origen: OrigenEdicion, cambios: Partial<DatosFormularioCaf> = {}) {
    setDatosEdicion({ ...datosDesdeCaf(), ...cambios });
    setOrigenEdicion(origen);
    setEditando(true);
    setAutoguardadoEn(null);
  }

  async function guardarEdicion() {
    if (!datosEdicion) return;
    const erroresCalculados = calcularErroresCaf(datosEdicion);
    setErroresEdicion(erroresCalculados);
    if (Object.keys(erroresCalculados).length > 0) {
      toast.error("Revisa los campos marcados antes de reenviar.");
      return;
    }
    setProcesando(true);
    try {
      await editarYReenviarCaf(caf, datosEdicion, usuarioSesion);
      if (origenEdicion === "enmienda") {
        try {
          await cerrarVentanaEnmiendaCaf(caf.id);
        } catch (e) {
          console.error("La enmienda se guardó pero no se pudo cerrar formalmente la ventana:", e);
        }
        toast.success("Enmienda guardada y reenviada a aprobación.");
      } else {
        toast.success("CAF actualizado y reenviado a aprobación.");
      }
      setEditando(false);
      setVentanaEnmienda(false);
      onActualizado();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo reenviar el CAF.");
    } finally {
      setProcesando(false);
    }
  }

  async function guardarBorrador(enviarAAprobacion: boolean) {
    if (!datosEdicion) return;
    if (enviarAAprobacion) {
      const erroresCalculados = calcularErroresCaf(datosEdicion);
      setErroresEdicion(erroresCalculados);
      if (Object.keys(erroresCalculados).length > 0) {
        toast.error("Revisa los campos marcados antes de enviar.");
        return;
      }
    }
    setProcesando(true);
    try {
      await editarBorradorCaf(caf, datosEdicion, usuarioSesion, enviarAAprobacion);
      toast.success(enviarAAprobacion ? "CAF enviado a aprobación." : "Borrador actualizado.");
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
      await editarBorradorCaf(caf, snapshot, usuarioSesion, false);
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
  }, [editando, origenEdicion, caf.id]);

  async function confirmarDevolver() {
    if (!motivoDevolver.trim()) {
      toast.error("Indica el motivo de la devolución.");
      return;
    }
    setProcesando(true);
    try {
      await devolverCaf(caf, usuarioSesion, motivoDevolver);
      toast.success("CAF devuelto: el flujo de aprobación queda suspendido y el documento vuelve a ser editable.");
      setMostrarDevolver(false);
      setMotivoDevolver("");
      onActualizado();
      onCerrar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo devolver el CAF.");
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
      await solicitarEnmiendaCaf(caf, usuarioSesion, justificacionEnmienda);
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
      await anularCaf(caf, usuarioSesion, motivoAnulacion);
      toast.success("CAF anulado.");
      onActualizado();
      // Corrección (octubre 2026), pedido explícito del usuario: cerrar
      // el formulario tras anular, para evitar repetir la instrucción o
      // inconsistencias.
      onCerrar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo anular el CAF.");
    } finally {
      setProcesando(false);
    }
  }

  /**
   * Corrección (octubre 2026), pedido explícito del usuario: "crea una
   * opción para eliminar cualquiera de los formularios que estén
   * guardados como borrador... solo lo puede eliminar el usuario que
   * haga la solicitud" — ver `puedeEliminarBorrador` más abajo y la nota
   * larga en `eliminarBorradorCaf` (`src/lib/caf.ts`) sobre por qué esto
   * no deja rastro en auditoría.
   */
  async function confirmarEliminarBorrador() {
    setProcesando(true);
    try {
      await eliminarBorradorCaf(caf.id);
      toast.success("Borrador eliminado.");
      onActualizado();
      onCerrar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar el borrador.");
    } finally {
      setProcesando(false);
    }
  }

  const esCreadorOAdmin = usuarioSesion.esAdministrador || usuarioSesion.id === caf.creadoPorId;
  const bloqueoProximidad = evaluarBloqueoPorProximidadEvento(fechaEventoVinculado);
  const puedeAnular = usuarioSesion.esAdministrador && puedeAnularSegunEstado(caf.estado) && caf.estado !== "Completado";
  const puedeEliminarBorrador = caf.estado === "Borrador" && usuarioSesion.id === caf.creadoPorId;
  const puedeEditarYReenviar = caf.estado === "Rechazado" && esCreadorOAdmin;
  const puedeEditarBorrador = puedeEditarComoBorrador(caf.estado) && esCreadorOAdmin && !bloqueoProximidad.bloqueado;
  const puedeDevolver = puedeDevolverDocumento(caf.estado, caf.aprobaciones) && esCreadorOAdmin && !bloqueoProximidad.bloqueado;
  const puedeEnmendar = puedeSolicitarEnmienda(caf.estado, caf.aprobaciones) && esCreadorOAdmin && !bloqueoProximidad.bloqueado;
  const mostrarAvisoBloqueo = bloqueoProximidad.bloqueado && esCreadorOAdmin && caf.estado !== "Completado" && caf.estado !== "Anulado" && caf.estado !== "Aprobado";

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
            CAF — {caf.codigoDocumento || "sin código"}
            <Badge variant={VARIANTE_POR_ESTADO[caf.estado]}>{caf.estado}</Badge>
          </DialogTitle>
          <DialogDescription>{caf.companiaNombre}</DialogDescription>
        </DialogHeader>
        {!editando && (
          <div className="-mt-2 flex flex-wrap items-center justify-between gap-2">
            <CreadoPorLinea creadoPorId={caf.creadoPorId} creadoEn={caf.creadoEn} />
            <Button variant="outline" size="sm" onClick={() => setMostrarImpresion(true)}>
              <Printer className="h-3.5 w-3.5" /> Ver / Imprimir / Exportar a PDF
            </Button>
          </div>
        )}

        {editando && datosEdicion ? (
          <div className="flex flex-col gap-4">
            {ventanaEnmienda && (
              <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                Editando dentro de una ventana de enmienda — al guardar, el CAF vuelve a Pendiente y se reinicia la cadena de aprobación.
              </p>
            )}
            {origenEdicion === "borrador" && (
              <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                Puedes guardar como borrador las veces que quieras. Solo se valida por completo cuando decidas enviarlo a aprobación.
                {" "}Se autoguarda cada cierto tiempo mientras editas.
                {autoguardadoEn && ` Autoguardado el ${formatearFechaHora(autoguardadoEn)}.`}
              </p>
            )}
            <FormularioCAF
              valor={datosEdicion}
              onChange={setDatosEdicion}
              errores={erroresEdicion}
              eventosDisponibles={eventos}
              speakersDisponibles={speakers}
              documentosExistentes={cafsExistentes}
              documentoActualId={caf.id}
              solicitanteId={caf.creadoPorId}
              camposPersonalizadosDefinidos={campos}
              etiquetasCampo={etiquetas}
              empresaGrupo={empresaGrupo}
              pais={pais}
              permitirCambiarModalidad={origenEdicion === "borrador" && caf.estado === "Borrador"}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setEditando(false); setVentanaEnmienda(false); }} disabled={procesando}>
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
              <CuerpoCAF caf={caf} etiquetasCampo={snapshotFormatoCongelado?.etiquetas ?? etiquetas} empresaGrupo={empresaGrupo} pais={pais} camposPersonalizadosDefinidos={snapshotFormatoCongelado?.camposPersonalizados ?? campos} />
            </CuerpoCompacto>

            <Separator />

            {caf.elaboradoEnCafCorporativo && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/30 bg-accent/40 p-3 text-sm" data-testid="caf-detalle-corporativo">
                <p>
                  {caf.estado === "Borrador"
                    ? "Este CAF se elaborará en el aplicativo CAF corporativo — no tendrá cadena de aprobación en BEATS. La copia firmada se carga en el Expediente del evento."
                    : "Este CAF se elaboró en el aplicativo CAF corporativo — no tiene cadena de aprobación en BEATS. La copia firmada se carga en el Expediente del evento."}
                </p>
                {/* Octubre 2026: mientras siga en borrador se puede reversar la decisión y elaborarlo en BEATS. */}
                {caf.estado === "Borrador" && puedeEditarBorrador && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => iniciarEdicion("borrador", { elaboradoEnCafCorporativo: false, comentarios: caf.comentarios === COMENTARIO_CAF_CORPORATIVO ? "" : caf.comentarios })}
                    data-testid="caf-detalle-mejor-en-beats"
                  >
                    Mejor crearlo en BEATS
                  </Button>
                )}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">Cadena de aprobación</h3>
              {documentoCongelado(caf.estado, caf.aprobaciones) && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="aviso-congelado">
                  <Lock className="size-3" /> Formulario congelado: los campos y las firmas ya registradas no cambian. Solo una enmienda justificada puede reabrirlo.
                </p>
              )}
              {/* AJUSTES (septiembre/octubre 2026), pedido explícito: ver el
                  comentario igual en `DetalleEvento.tsx` — nombre centrado,
                  fecha/hora debajo del badge de estado. */}
              {caf.aprobaciones.map((paso) => {
                const resolutor = paso.estado === "aprobado" ? usuariosAprobacion.get(paso.resueltoPorId ?? "") : undefined;
                return (
                  <FilaCadenaAprobacion key={paso.orden} paso={paso} etiquetaRol={paso.tipoFirma ? paso.etiqueta : ETIQUETA_ROL_CADENA_APROBACION[paso.rolRequerido] ?? paso.etiqueta} nombre={resolutor?.nombre} firmaId={paso.firmaCongeladaId ?? resolutor?.firmaId} firmantesPendientes={(paso.firmantesIds ?? []).map((id) => usuariosAprobacion.get(id)?.nombre ?? "—")} />
                );
              })}

              {/* Entrega 25: notas de aprobación/rechazo en orden cronológico, justo después de la cadena. */}
              <NotasAprobacionVista pasos={caf.aprobaciones} resolverNombre={(id) => (id ? usuariosAprobacion.get(id)?.nombre ?? "—" : "—")} />

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
                    El CAF se suspende del flujo de aprobación y vuelve a ser editable (queda en estado "Devuelto"), ya que
                    ningún aprobador lo ha firmado todavía.
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
                    Este CAF ya tiene al menos una firma en su cadena de aprobación, así que no se puede devolver — solo
                    corregirse mediante una enmienda justificada. Al guardar los cambios, el CAF vuelve a Pendiente y debe
                    recorrer de nuevo la cadena de aprobación. La ventana de enmienda vence a los 7 días de abierta.
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

              <p className="text-[11px] text-muted-foreground">ID interno: {caf.id}</p>
            </div>
          </div>
        )}
      </DialogContent>

      {/* Fase 8 (hallazgo grande): diálogo de impresión separado y apilado
          sobre el diálogo compacto — igual que en el original, "Ver /
          Imprimir / Exportar a PDF" NO reemplaza la vista de detalle, abre
          un diálogo aparte encima. Cerrarlo con "Cerrar" o Esc solo lo
          cierra a él, y se vuelve a ver la vista compacta detrás. */}
      <Dialog open={mostrarImpresion} onOpenChange={setMostrarImpresion}>
        <DialogContent className="left-0 top-0 h-screen w-screen max-w-none max-h-none translate-x-0 translate-y-0 rounded-none border-0 shadow-none">
          <DialogTitle className="sr-only">Vista de impresión — CAF</DialogTitle>
          <DocumentoImprimible
            estado={caf.estado}
            tipo="caf"
            empresaGrupo={caf.companiaNombre || empresaGrupo}
            documentoId={caf.id}
            creadoPorId={caf.creadoPorId}
            nombreDocumento={caf.contraparteNombre}
            onCerrar={() => setMostrarImpresion(false)}
          >
            <CuerpoCAF caf={caf} etiquetasCampo={snapshotFormatoCongelado?.etiquetas ?? etiquetas} empresaGrupo={empresaGrupo} pais={pais} camposPersonalizadosDefinidos={snapshotFormatoCongelado?.camposPersonalizados ?? campos} />
          </DocumentoImprimible>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
