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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Printer } from "lucide-react";
import { CreadoPorLinea, CuerpoFMV, CuerpoCompacto, DocumentoImprimible } from "@/components/print/DocumentoImprimible";
import { VisorArchivo } from "@/components/archivos/VisorArchivo";
import { FormularioFMV, type DatosFormularioFmv } from "@/components/forms/FormularioFMV";
import { parsearSnapshotFormato } from "@/lib/snapshotFormato";
import { useAuth } from "@/hooks/useAuth";
import { useCompania } from "@/hooks/useCompania";
import { anularFmv, editarBorradorFmv, eliminarBorradorFmv, firmarYCompletarFmv, calcularErroresFmv, traerFmvs } from "@/lib/fmv";
import { traerConfiguracionFmv, type ConfiguracionFmv } from "@/lib/fmvConfig";
import { traerCamposPersonalizados, type CampoPersonalizadoDefinicion } from "@/lib/camposPersonalizados";
import { traerEtiquetasCampo, type EtiquetaCampo } from "@/lib/etiquetasCampo";
import { traerEventos } from "@/lib/evento";
import { eventosParaOrigenSpeakerExterno, type OpcionEventoOrigen } from "@/lib/documentosRequeridosEvento";
import { traerSpeakersResumen, type SpeakerResumen } from "@/lib/speakers";
import { evaluarBloqueoPorProximidadEvento, traerFechaInicioEventoPorId, puedeAnularSegunEstado } from "@/lib/cicloVidaDocumento";
import type { Fmv } from "@/types";
import type { EstadoDoc } from "@/lib/enums";

const VARIANTE_POR_ESTADO: Record<EstadoDoc, BadgeProps["variant"]> = {
  Borrador: "draft",
  Pendiente: "pending",
  Aprobado: "approved",
  Rechazado: "rejected",
  Devuelto: "draft",
  Completado: "completed",
  Anulado: "cancelled",
};

const CONFIGURACION_VACIA: ConfiguracionFmv = { umbralTier1: 15, umbralTier2: 9, criterios: [] };

interface Props {
  fmv: Fmv;
  abierto: boolean;
  onCerrar: () => void;
  onActualizado: () => void;
}

export function DetalleFmv({ fmv, abierto, onCerrar, onActualizado }: Props) {
  const { usuario } = useAuth();
  const [procesando, setProcesando] = React.useState(false);
  const [configuracion, setConfiguracion] = React.useState<ConfiguracionFmv>(CONFIGURACION_VACIA);
  const [campos, setCampos] = React.useState<CampoPersonalizadoDefinicion[]>([]);
  const [etiquetas, setEtiquetas] = React.useState<EtiquetaCampo[]>([]);
  const [eventos, setEventos] = React.useState<OpcionEventoOrigen[]>([]);
  const [speakers, setSpeakers] = React.useState<SpeakerResumen[]>([]);
  const [fmvsExistentes, setFmvsExistentes] = React.useState<Fmv[]>([]);
  const [mostrarFirma, setMostrarFirma] = React.useState(false);
  const [medicalName, setMedicalName] = React.useState(fmv.medicalName);
  const [medicalRole, setMedicalRole] = React.useState(fmv.medicalRole);
  const [mostrarAnular, setMostrarAnular] = React.useState(false);
  const [mostrarEliminarBorrador, setMostrarEliminarBorrador] = React.useState(false);
  const [motivoAnulacion, setMotivoAnulacion] = React.useState("");
  const [mostrarImpresion, setMostrarImpresion] = React.useState(false);

  const [editando, setEditando] = React.useState(false);
  const [datosEdicion, setDatosEdicion] = React.useState<DatosFormularioFmv | null>(null);
  const [autoguardadoEn, setAutoguardadoEn] = React.useState<Date | null>(null);
  const [fechaEventoVinculado, setFechaEventoVinculado] = React.useState<string | null>(null);

  // Una vez el documento queda Completado, las etiquetas y campos
  // personalizados que se ven (en la vista compacta y en impresión) deben
  // quedar fijos tal como estaban en ese momento, aunque Legal/Compliance
  // cambie la configuración después — ver
  // `db/agregar_inmutabilidad_documentos_firmados.sql`.
  const snapshotFormatoCongelado = React.useMemo(() => parsearSnapshotFormato(fmv.snapshotFormato), [fmv.snapshotFormato]);
  // Editar un borrador de FMV no exige el formulario completo — la
  // validación real (calcularErroresFmv) solo se aplica al firmar y
  // completar, que ya tiene su propio paso separado ("Firmar y completar").
  const erroresEdicionVacios: Record<string, string> = {};

  React.useEffect(() => {
    if (!abierto) return;
    traerConfiguracionFmv().then(setConfiguracion).catch(() => setConfiguracion(CONFIGURACION_VACIA));
    traerCamposPersonalizados().then(setCampos).catch(() => setCampos([]));
    traerEtiquetasCampo().then(setEtiquetas).catch(() => setEtiquetas([]));
    traerEventos()
      .then((evs) => setEventos(eventosParaOrigenSpeakerExterno(evs)))
      .catch(() => setEventos([]));
    traerSpeakersResumen().then(setSpeakers).catch(() => setSpeakers([]));
    traerFmvs().then(setFmvsExistentes).catch(() => setFmvsExistentes([]));
    traerFechaInicioEventoPorId(fmv.eventoOrigenId).then(setFechaEventoVinculado).catch(() => setFechaEventoVinculado(null));
    setMostrarFirma(false);
    setMostrarAnular(false);
    setMostrarImpresion(false);
    setEditando(false);
    setMedicalName(fmv.medicalName);
    setMedicalRole(fmv.medicalRole);
    setAutoguardadoEn(null);
  }, [abierto, fmv.id, fmv.medicalName, fmv.medicalRole, fmv.eventoOrigenId]);

  if (!usuario) return null;
  const usuarioSesion = usuario;
  const { companiaActual } = useCompania();
  const empresaGrupo = companiaActual ?? usuarioSesion.empresasGrupo[0] ?? "";
  const pais = usuarioSesion.paisesOperacion[0] ?? "";

  const esCreadorOAdmin = usuarioSesion.esAdministrador || usuarioSesion.id === fmv.creadoPorId;
  const bloqueoProximidad = evaluarBloqueoPorProximidadEvento(fechaEventoVinculado);
  const puedeFirmar = fmv.estado === "Borrador" && esCreadorOAdmin;
  const puedeAnular = usuarioSesion.esAdministrador && puedeAnularSegunEstado(fmv.estado);
  const puedeEliminarBorrador = fmv.estado === "Borrador" && usuarioSesion.id === fmv.creadoPorId;
  // FMV no tiene cadena de aprobación (pasa directo de Borrador a
  // Completado) — no hay "devolver"/"enmienda" que aplique aquí, solo la
  // reapertura de un borrador ya pedida explícitamente por el usuario.
  const puedeEditarBorrador = fmv.estado === "Borrador" && esCreadorOAdmin && !bloqueoProximidad.bloqueado;
  const mostrarAvisoBloqueo = bloqueoProximidad.bloqueado && esCreadorOAdmin && fmv.estado === "Borrador";

  function iniciarEdicion() {
    setDatosEdicion({
      eventoOrigenId: fmv.eventoOrigenId ?? "",
      speakerId: fmv.speakerId ?? "",
      region: fmv.region,
      pais: fmv.pais,
      fecha: fmv.fecha ?? "",
      nombreCompleto: fmv.nombreCompleto,
      numeroDocumento: fmv.numeroDocumento,
      cvAdjunto: fmv.cvAdjunto,
      especialidad: fmv.especialidad,
      especialidadOtro: fmv.especialidadOtro,
      licenciaNacional: fmv.licenciaNacional,
      direccionPrincipal: fmv.direccionPrincipal,
      ciudad: fmv.ciudad,
      estadoProvincia: fmv.estadoProvincia,
      codigoPostal: fmv.codigoPostal,
      criterio1: fmv.criterio1,
      criterio2: fmv.criterio2,
      criterio3: fmv.criterio3,
      criterio4: fmv.criterio4,
      criterio5: fmv.criterio5,
      criterio6: fmv.criterio6,
      comentariosAdicionales: fmv.comentariosAdicionales,
      aplicaTarifarioAsociacion: fmv.aplicaTarifarioAsociacion,
      archivoTarifarioAsociacionId: fmv.archivoTarifarioAsociacionId,
      asociacionCientifica: fmv.asociacionCientifica,
      medicalName: fmv.medicalName,
      medicalRole: fmv.medicalRole,
      empresaGrupo: fmv.empresaGrupo,
      camposPersonalizados: fmv.camposPersonalizados,
    });
    setEditando(true);
    setAutoguardadoEn(null);
  }

  async function guardarBorrador() {
    if (!datosEdicion) return;
    setProcesando(true);
    try {
      await editarBorradorFmv(fmv, datosEdicion, usuarioSesion);
      toast.success("Borrador actualizado.");
      setEditando(false);
      onActualizado();
      // Corrección (octubre 2026), pedido explícito del usuario: cerrar
      // el formulario (volver al tablero) al guardar borrador, para
      // evitar duplicidades.
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
    if (!snapshot) return;
    try {
      await editarBorradorFmv(fmv, snapshot, usuarioSesion);
      setAutoguardadoEn(new Date());
    } catch {
      // Autoguardado silencioso: un fallo aquí no debe interrumpir al
      // usuario mientras sigue escribiendo — "Guardar borrador" (manual)
      // sigue disponible y sí informa cualquier error.
    }
  }

  React.useEffect(() => {
    if (!editando) return;
    const id = setInterval(() => void autoguardarBorrador(), 45000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando, fmv.id]);

  async function confirmarFirma() {
    if (!medicalName.trim() || !medicalRole.trim()) {
      toast.error("Indica el nombre y el cargo de quien certifica.");
      return;
    }
    // Corrección (octubre 2026), pedido explícito del usuario: "ningún
    // formato se puede aprobar o guardar definitivamente si le falta
    // algún campo obligatorio. El sistema debe advertirlo" — antes solo
    // se revisaban `medicalName`/`medicalRole`; ahora se valida el FMV
    // completo antes de dejarlo firmar y completar (no tiene cadena de
    // aprobación, así que este es su único punto de cierre).
    const erroresCalculados = calcularErroresFmv({ ...fmv, medicalName, medicalRole });
    if (Object.keys(erroresCalculados).length > 0) {
      toast.error(`Faltan campos obligatorios por diligenciar: ${Object.values(erroresCalculados).join(" ")}`);
      return;
    }
    setProcesando(true);
    try {
      await firmarYCompletarFmv(fmv, { medicalName, medicalRole }, usuarioSesion);
      toast.success("FMV certificado y completado.");
      onActualizado();
      // Corrección (octubre 2026), pedido explícito del usuario: cerrar
      // el formulario tras firmar, para evitar repetir la instrucción o
      // inconsistencias.
      onCerrar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo completar el FMV.");
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
      await anularFmv(fmv, usuarioSesion, motivoAnulacion);
      toast.success("FMV anulado.");
      onActualizado();
      // Corrección (octubre 2026), pedido explícito del usuario: cerrar
      // el formulario tras anular, para evitar repetir la instrucción o
      // inconsistencias.
      onCerrar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo anular el FMV.");
    } finally {
      setProcesando(false);
    }
  }

  /**
   * Corrección (octubre 2026), pedido explícito del usuario: "crea una
   * opción para eliminar cualquiera de los formularios que estén
   * guardados como borrador... solo lo puede eliminar el usuario que
   * haga la solicitud" — ver `puedeEliminarBorrador` más arriba y la nota
   * larga en `eliminarBorradorDocumentoUnicoFirmante`
   * (`src/lib/documentoUnicoFirmante.ts`) sobre por qué esto no deja
   * rastro en auditoría.
   */
  async function confirmarEliminarBorrador() {
    setProcesando(true);
    try {
      await eliminarBorradorFmv(fmv.id);
      toast.success("Borrador eliminado.");
      onActualizado();
      onCerrar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar el borrador.");
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
            FMV — {fmv.nombreCompleto || "sin nombre"}
            <Badge variant={VARIANTE_POR_ESTADO[fmv.estado]}>{fmv.estado}</Badge>
          </DialogTitle>
          <DialogDescription>{fmv.especialidad === "Otra" ? fmv.especialidadOtro : fmv.especialidad}</DialogDescription>
        </DialogHeader>
        {!editando && (
          <div className="-mt-2 flex flex-wrap items-center justify-between gap-2">
            <CreadoPorLinea creadoPorId={fmv.creadoPorId} creadoEn={fmv.creadoEn} />
            <Button variant="outline" size="sm" onClick={() => setMostrarImpresion(true)}>
              <Printer className="h-3.5 w-3.5" /> Ver / Imprimir / Exportar a PDF
            </Button>
          </div>
        )}

        {editando && datosEdicion ? (
          <div className="flex flex-col gap-4">
            <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
              Puedes guardar como borrador las veces que quieras — la validación completa solo se exige al firmar y completar.
              {" "}Se autoguarda cada cierto tiempo mientras editas.
              {autoguardadoEn && ` Autoguardado el ${formatearFechaHora(autoguardadoEn)}.`}
            </p>
            <FormularioFMV
              valor={datosEdicion}
              onChange={setDatosEdicion}
              errores={erroresEdicionVacios}
              eventosDisponibles={eventos}
              speakersDisponibles={speakers}
              fmvsExistentes={fmvsExistentes}
              documentoActualId={fmv.id}
              configuracion={configuracion}
              camposPersonalizadosDefinidos={campos}
              etiquetasCampo={etiquetas}
              empresaGrupo={empresaGrupo}
              pais={pais}
              firmaUsuarioId={usuarioSesion.firmaId}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditando(false)} disabled={procesando}>
                Cancelar
              </Button>
              <Button disabled={procesando} onClick={guardarBorrador}>
                Guardar borrador
              </Button>
            </div>
          </div>
        ) : (
        <div className="flex flex-col gap-4">
          <CuerpoCompacto>
            <CuerpoFMV fmv={fmv} configuracion={configuracion} etiquetasCampo={snapshotFormatoCongelado?.etiquetas ?? etiquetas} empresaGrupo={empresaGrupo} pais={pais} camposPersonalizadosDefinidos={snapshotFormatoCongelado?.camposPersonalizados ?? campos} />
          </CuerpoCompacto>

          {fmv.archivoTarifarioAsociacionId && (
            <div className="flex items-center gap-2 rounded-md border p-2 text-sm">
              <span className="flex-1">Tarifario de la asociación médica (archivo adjunto)</span>
              <VisorArchivo archivoId={fmv.archivoTarifarioAsociacionId} etiqueta="Ver" size="sm" variant="outline" />
            </div>
          )}

          <Separator />

          <div className="flex flex-col gap-3">
            {mostrarAvisoBloqueo && (
              <p className="rounded-md border border-dashed border-destructive/40 p-2 text-xs text-destructive">
                {bloqueoProximidad.mensaje}
              </p>
            )}

            {puedeEditarBorrador && (
              <div className="flex justify-end">
                <Button variant="outline" onClick={iniciarEdicion}>Editar borrador</Button>
              </div>
            )}

            {puedeFirmar && !mostrarFirma && (
              <div className="flex justify-end">
                <Button onClick={() => setMostrarFirma(true)}>Firmar y completar</Button>
              </div>
            )}

            {mostrarFirma && (
              <div className="flex flex-col gap-3 rounded-md border border-dashed p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="fmv-firma-nombre">Nombre de quien certifica</Label>
                    <Input id="fmv-firma-nombre" value={medicalName} onChange={(e) => setMedicalName(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="fmv-firma-cargo">Cargo de quien certifica</Label>
                    <Input id="fmv-firma-cargo" value={medicalRole} onChange={(e) => setMedicalRole(e.target.value)} />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setMostrarFirma(false)}>Cancelar</Button>
                  <Button disabled={procesando} onClick={confirmarFirma}>Confirmar certificación</Button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2">
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

            <p className="text-[11px] text-muted-foreground">ID interno: {fmv.id}</p>
          </div>
        </div>
        )}
      </DialogContent>

      {/* Fase 8 (hallazgo grande): diálogo de impresión separado y apilado. */}
      <Dialog open={mostrarImpresion} onOpenChange={setMostrarImpresion}>
        <DialogContent className="left-0 top-0 h-screen w-screen max-w-none max-h-none translate-x-0 translate-y-0 rounded-none border-0 shadow-none">
          <DialogTitle className="sr-only">Vista de impresión — FMV</DialogTitle>
          <DocumentoImprimible
            estado={fmv.estado}
            tipo="fmv"
            empresaGrupo={fmv.empresaGrupo || empresaGrupo}
            documentoId={fmv.id}
            creadoPorId={fmv.creadoPorId}
            nombreDocumento={fmv.nombreCompleto}
            onCerrar={() => setMostrarImpresion(false)}
          >
            <CuerpoFMV fmv={fmv} configuracion={configuracion} etiquetasCampo={snapshotFormatoCongelado?.etiquetas ?? etiquetas} empresaGrupo={empresaGrupo} pais={pais} camposPersonalizadosDefinidos={snapshotFormatoCongelado?.camposPersonalizados ?? campos} />
          </DocumentoImprimible>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
