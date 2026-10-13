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
import { CreadoPorLinea, CuerpoNotificacionPago, CuerpoCompacto, DocumentoImprimible } from "@/components/print/DocumentoImprimible";
import { VisorArchivo } from "@/components/archivos/VisorArchivo";
import { FormularioNotificacionPago, type DatosFormularioNotificacionPago } from "@/components/forms/FormularioNotificacionPago";
import { parsearSnapshotFormato } from "@/lib/snapshotFormato";
import { useAuth } from "@/hooks/useAuth";
import { useCompania } from "@/hooks/useCompania";
import { anularNotificacionPago, editarBorradorNotificacionPago, eliminarBorradorNotificacionPago, firmarYCompletarNotificacionPago, calcularErroresNotificacionPago, traerNotificacionesPago } from "@/lib/notificacionPago";
import { traerCamposPersonalizados, type CampoPersonalizadoDefinicion } from "@/lib/camposPersonalizados";
import { traerEtiquetasCampo, type EtiquetaCampo } from "@/lib/etiquetasCampo";
import { traerEventos } from "@/lib/evento";
import { traerConvenios } from "@/lib/convenio";
import { traerFmvs } from "@/lib/fmv";
import { eventosParaOrigenNotificacionPago, type OpcionEventoOrigen } from "@/lib/documentosRequeridosEvento";
import { traerSpeakersResumen, type SpeakerResumen } from "@/lib/speakers";
import { traerProductosResumen, type ProductoResumen } from "@/lib/productos";
import { evaluarBloqueoPorProximidadEvento, traerFechaInicioEventoPorId, puedeAnularSegunEstado } from "@/lib/cicloVidaDocumento";
import type { NotificacionPagoHcp, RegistroFinancieroEvento } from "@/types";
import { traerTodosLosRegistrosFinancieros } from "@/lib/repositorioEvento";
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

interface Props {
  notificacion: NotificacionPagoHcp;
  abierto: boolean;
  onCerrar: () => void;
  onActualizado: () => void;
}

export function DetalleNotificacionPago({ notificacion, abierto, onCerrar, onActualizado }: Props) {
  const { usuario } = useAuth();
  const [procesando, setProcesando] = React.useState(false);
  const [campos, setCampos] = React.useState<CampoPersonalizadoDefinicion[]>([]);
  const [etiquetas, setEtiquetas] = React.useState<EtiquetaCampo[]>([]);
  const [eventos, setEventos] = React.useState<OpcionEventoOrigen[]>([]);
  const [speakers, setSpeakers] = React.useState<SpeakerResumen[]>([]);
  const [notificacionesExistentes, setNotificacionesExistentes] = React.useState<NotificacionPagoHcp[]>([]);
  const [productos, setProductos] = React.useState<ProductoResumen[]>([]);
  const [mostrarFirma, setMostrarFirma] = React.useState(false);
  const [medicalName, setMedicalName] = React.useState(notificacion.medicalName);
  const [medicalRole, setMedicalRole] = React.useState(notificacion.medicalRole);
  const [mostrarAnular, setMostrarAnular] = React.useState(false);
  const [mostrarEliminarBorrador, setMostrarEliminarBorrador] = React.useState(false);
  const [motivoAnulacion, setMotivoAnulacion] = React.useState("");
  const [mostrarImpresion, setMostrarImpresion] = React.useState(false);

  const [editando, setEditando] = React.useState(false);
  const [registrosFinancieros, setRegistrosFinancieros] = React.useState<RegistroFinancieroEvento[]>([]);
  const [datosEdicion, setDatosEdicion] = React.useState<DatosFormularioNotificacionPago | null>(null);
  const [autoguardadoEn, setAutoguardadoEn] = React.useState<Date | null>(null);
  const [fechaEventoVinculado, setFechaEventoVinculado] = React.useState<string | null>(null);

  // Una vez el documento queda Completado, las etiquetas y campos
  // personalizados que se ven (en la vista compacta y en impresión) deben
  // quedar fijos tal como estaban en ese momento, aunque Legal/Compliance
  // cambie la configuración después — ver
  // `db/agregar_inmutabilidad_documentos_firmados.sql`.
  const snapshotFormatoCongelado = React.useMemo(
    () => parsearSnapshotFormato(notificacion.snapshotFormato),
    [notificacion.snapshotFormato],
  );
  // Igual que en FMV: editar un borrador de Notificación de Pago no exige
  // el formulario completo — la validación real solo se aplica al firmar y
  // completar.
  const erroresEdicionVacios: Record<string, string> = {};

  React.useEffect(() => {
    if (!abierto) return;
    traerCamposPersonalizados().then(setCampos).catch(() => setCampos([]));
    traerEtiquetasCampo().then(setEtiquetas).catch(() => setEtiquetas([]));
    Promise.all([traerEventos(), traerConvenios(), traerFmvs()])
      .then(([evs, convenios, fmvs]) => setEventos(eventosParaOrigenNotificacionPago(evs, convenios, fmvs)))
      .catch(() => setEventos([]));
    traerSpeakersResumen().then(setSpeakers).catch(() => setSpeakers([]));
    traerProductosResumen().then(setProductos).catch(() => setProductos([]));
    traerNotificacionesPago().then(setNotificacionesExistentes).catch(() => setNotificacionesExistentes([]));
    traerTodosLosRegistrosFinancieros().then(setRegistrosFinancieros).catch(() => setRegistrosFinancieros([]));
    traerFechaInicioEventoPorId(notificacion.eventoOrigenId).then(setFechaEventoVinculado).catch(() => setFechaEventoVinculado(null));
    setMostrarFirma(false);
    setMostrarAnular(false);
    setMostrarImpresion(false);
    setEditando(false);
    setMedicalName(notificacion.medicalName);
    setMedicalRole(notificacion.medicalRole);
    setAutoguardadoEn(null);
  }, [abierto, notificacion.id, notificacion.medicalName, notificacion.medicalRole, notificacion.eventoOrigenId]);

  if (!usuario) return null;
  const usuarioSesion = usuario;
  const { companiaActual } = useCompania();
  const empresaGrupo = companiaActual ?? usuarioSesion.empresasGrupo[0] ?? "";
  const pais = usuarioSesion.paisesOperacion[0] ?? "";

  const esCreadorOAdmin = usuarioSesion.esAdministrador || usuarioSesion.id === notificacion.creadoPorId;
  const bloqueoProximidad = evaluarBloqueoPorProximidadEvento(fechaEventoVinculado);
  const puedeFirmar = notificacion.estado === "Borrador" && esCreadorOAdmin;
  const puedeAnular = usuarioSesion.esAdministrador && puedeAnularSegunEstado(notificacion.estado);
  const puedeEliminarBorrador = notificacion.estado === "Borrador" && usuarioSesion.id === notificacion.creadoPorId;
  // Notificación de Pago tampoco tiene cadena de aprobación — mismo caso que
  // FMV, solo reapertura de borrador, sin "devolver"/"enmienda".
  const puedeEditarBorrador = notificacion.estado === "Borrador" && esCreadorOAdmin && !bloqueoProximidad.bloqueado;
  const mostrarAvisoBloqueo = bloqueoProximidad.bloqueado && esCreadorOAdmin && notificacion.estado === "Borrador";

  function iniciarEdicion() {
    setDatosEdicion({
      eventoOrigenId: notificacion.eventoOrigenId ?? "",
      convenioOrigenId: notificacion.convenioOrigenId ?? "",
      speakerId: notificacion.speakerId ?? "",
      nombreProfesionalSalud: notificacion.nombreProfesionalSalud,
      numeroDocumentoIdentidad: notificacion.numeroDocumentoIdentidad,
      cedulaLicenciaProfesional: notificacion.cedulaLicenciaProfesional,
      productos: notificacion.productos,
      facturaId: notificacion.facturaId,
      numeroFactura: notificacion.numeroFactura,
      fechaFactura: notificacion.fechaFactura,
      valorFactura: notificacion.valorFactura,
      monedaFactura: notificacion.monedaFactura,
      facturaIncluyePagoHcp: notificacion.facturaIncluyePagoHcp,
      facturaIncluyePagoInstitucion: notificacion.facturaIncluyePagoInstitucion,
      facturaEsPagoTercero: notificacion.facturaEsPagoTercero,
      medicalName: notificacion.medicalName,
      medicalRole: notificacion.medicalRole,
      empresaGrupo: notificacion.empresaGrupo,
      camposPersonalizados: notificacion.camposPersonalizados,
    });
    setEditando(true);
    setAutoguardadoEn(null);
  }

  async function guardarBorrador() {
    if (!datosEdicion) return;
    setProcesando(true);
    try {
      await editarBorradorNotificacionPago(notificacion, datosEdicion, usuarioSesion);
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
      await editarBorradorNotificacionPago(notificacion, snapshot, usuarioSesion);
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
  }, [editando, notificacion.id]);

  async function confirmarFirma() {
    if (!medicalName.trim() || !medicalRole.trim()) {
      toast.error("Indica el nombre y el cargo de quien certifica.");
      return;
    }
    // Corrección (octubre 2026), pedido explícito del usuario: "ningún
    // formato se puede aprobar o guardar definitivamente si le falta
    // algún campo obligatorio. El sistema debe advertirlo" — ver nota
    // larga en el equivalente de FMV (`DetalleFmv.tsx`).
    const erroresCalculados = calcularErroresNotificacionPago({ ...notificacion, medicalName, medicalRole });
    if (Object.keys(erroresCalculados).length > 0) {
      toast.error(`Faltan campos obligatorios por diligenciar: ${Object.values(erroresCalculados).join(" ")}`);
      return;
    }
    setProcesando(true);
    try {
      await firmarYCompletarNotificacionPago(notificacion, { medicalName, medicalRole }, usuarioSesion);
      toast.success("Notificación de Pago certificada y completada.");
      onActualizado();
      // Corrección (octubre 2026), pedido explícito del usuario: cerrar
      // el formulario tras firmar, para evitar repetir la instrucción o
      // inconsistencias.
      onCerrar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo completar la Notificación de Pago.");
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
      await anularNotificacionPago(notificacion, usuarioSesion, motivoAnulacion);
      toast.success("Notificación de Pago anulada.");
      onActualizado();
      // Corrección (octubre 2026), pedido explícito del usuario: cerrar
      // el formulario tras anular, para evitar repetir la instrucción o
      // inconsistencias.
      onCerrar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo anular la Notificación de Pago.");
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
      await eliminarBorradorNotificacionPago(notificacion.id);
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
            {notificacion.numeroFactura || "Notificación de Pago"}
            <Badge variant={VARIANTE_POR_ESTADO[notificacion.estado]}>{notificacion.estado}</Badge>
          </DialogTitle>
          <DialogDescription>{notificacion.nombreProfesionalSalud}</DialogDescription>
        </DialogHeader>
        {!editando && (
          <div className="-mt-2 flex flex-wrap items-center justify-between gap-2">
            <CreadoPorLinea creadoPorId={notificacion.creadoPorId} creadoEn={notificacion.creadoEn} />
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
            <FormularioNotificacionPago
              valor={datosEdicion}
              onChange={setDatosEdicion}
              errores={erroresEdicionVacios}
              eventosDisponibles={eventos}
              speakersDisponibles={speakers}
              documentosExistentes={notificacionesExistentes}
              registrosFinancieros={registrosFinancieros}
              documentoActualId={notificacion.id}
              productosDisponibles={productos}
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
            <CuerpoNotificacionPago notificacion={notificacion} etiquetasCampo={snapshotFormatoCongelado?.etiquetas ?? etiquetas} empresaGrupo={empresaGrupo} pais={pais} camposPersonalizadosDefinidos={snapshotFormatoCongelado?.camposPersonalizados ?? campos} />
          </CuerpoCompacto>

          {notificacion.facturaId && (
            <div className="flex items-center gap-2 rounded-md border p-2 text-sm">
              <span className="flex-1">Factura {notificacion.numeroFactura ? `N.º ${notificacion.numeroFactura}` : ""}</span>
              <VisorArchivo archivoId={notificacion.facturaId} etiqueta="Ver factura" size="sm" variant="outline" />
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
                    <Label htmlFor="notif-firma-nombre">Nombre de quien certifica</Label>
                    <Input id="notif-firma-nombre" value={medicalName} onChange={(e) => setMedicalName(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="notif-firma-cargo">Cargo de quien certifica</Label>
                    <Input id="notif-firma-cargo" value={medicalRole} onChange={(e) => setMedicalRole(e.target.value)} />
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

            <p className="text-[11px] text-muted-foreground">ID interno: {notificacion.id}</p>
          </div>
        </div>
        )}
      </DialogContent>

      {/* Fase 8 (hallazgo grande): diálogo de impresión separado y apilado. */}
      <Dialog open={mostrarImpresion} onOpenChange={setMostrarImpresion}>
        <DialogContent className="left-0 top-0 h-screen w-screen max-w-none max-h-none translate-x-0 translate-y-0 rounded-none border-0 shadow-none">
          <DialogTitle className="sr-only">Vista de impresión — Notificación de Pago</DialogTitle>
          <DocumentoImprimible
            estado={notificacion.estado}
            tipo="notificacionPago"
            empresaGrupo={notificacion.empresaGrupo || empresaGrupo}
            documentoId={notificacion.id}
            creadoPorId={notificacion.creadoPorId}
            nombreDocumento={notificacion.nombreProfesionalSalud}
            onCerrar={() => setMostrarImpresion(false)}
          >
            <CuerpoNotificacionPago notificacion={notificacion} etiquetasCampo={snapshotFormatoCongelado?.etiquetas ?? etiquetas} empresaGrupo={empresaGrupo} pais={pais} camposPersonalizadosDefinidos={snapshotFormatoCongelado?.camposPersonalizados ?? campos} />
          </DocumentoImprimible>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
