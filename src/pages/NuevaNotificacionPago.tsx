import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  FormularioNotificacionPago,
  notificacionPagoVacia,
  calcularErroresNotificacionPago,
  type DatosFormularioNotificacionPago,
} from "@/components/forms/FormularioNotificacionPago";
import { useAuth } from "@/hooks/useAuth";
import { useCompania } from "@/hooks/useCompania";
import { crearNotificacionPago, traerNotificacionesPago } from "@/lib/notificacionPago";
import type { NotificacionPagoHcp, RegistroFinancieroEvento } from "@/types";
import { traerTodosLosRegistrosFinancieros } from "@/lib/repositorioEvento";
import { traerCamposPersonalizados, type CampoPersonalizadoDefinicion } from "@/lib/camposPersonalizados";
import { traerEtiquetasCampo, type EtiquetaCampo } from "@/lib/etiquetasCampo";
import { traerEventos } from "@/lib/evento";
import { traerConvenios } from "@/lib/convenio";
import { traerFmvs } from "@/lib/fmv";
import { eventosParaOrigenNotificacionPago, type OpcionEventoOrigen } from "@/lib/documentosRequeridosEvento";
import { traerSpeakersResumen, type SpeakerResumen } from "@/lib/speakers";
import { traerProductosResumen, type ProductoResumen } from "@/lib/productos";

export function NuevaNotificacionPago({
  onCreado,
  precargarEventoOrigenId,
  precargarSpeakerId,
}: {
  onCreado?: () => void;
  /** "Tareas Pendientes" → "diligenciar este documento" (ajuste de precisión, septiembre 2026, pedido explícito). */
  precargarEventoOrigenId?: string;
  precargarSpeakerId?: string;
}) {
  const { usuario } = useAuth();
  const { companiaActual } = useCompania();
  const [datos, setDatos] = React.useState<DatosFormularioNotificacionPago | null>(null);
  const [errores, setErrores] = React.useState<Record<string, string>>({});
  const [enviando, setEnviando] = React.useState(false);
  const [campos, setCampos] = React.useState<CampoPersonalizadoDefinicion[]>([]);
  const [etiquetas, setEtiquetas] = React.useState<EtiquetaCampo[]>([]);
  const [eventos, setEventos] = React.useState<OpcionEventoOrigen[]>([]);
  const [speakers, setSpeakers] = React.useState<SpeakerResumen[]>([]);
  const [productos, setProductos] = React.useState<ProductoResumen[]>([]);
  const [notificacionesExistentes, setNotificacionesExistentes] = React.useState<NotificacionPagoHcp[]>([]);
  const [registrosFinancieros, setRegistrosFinancieros] = React.useState<RegistroFinancieroEvento[]>([]);

  React.useEffect(() => {
    if (!usuario) return;
    setDatos(notificacionPagoVacia(companiaActual ?? usuario.empresasGrupo[0] ?? "", usuario.nombre, usuario.cargo));
    traerCamposPersonalizados().then(setCampos).catch(() => setCampos([]));
    traerEtiquetasCampo().then(setEtiquetas).catch(() => setEtiquetas([]));
    Promise.all([traerEventos(), traerConvenios(), traerFmvs()])
      .then(([evs, convenios, fmvs]) => setEventos(eventosParaOrigenNotificacionPago(evs, convenios, fmvs)))
      .catch(() => setEventos([]));
    traerSpeakersResumen().then(setSpeakers).catch(() => setSpeakers([]));
    traerProductosResumen().then(setProductos).catch(() => setProductos([]));
    traerNotificacionesPago().then(setNotificacionesExistentes).catch(() => setNotificacionesExistentes([]));
    traerTodosLosRegistrosFinancieros().then(setRegistrosFinancieros).catch(() => setRegistrosFinancieros([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.id]);

  if (!usuario || !datos) return null;
  const empresaGrupo = companiaActual ?? usuario.empresasGrupo[0] ?? "";
  const pais = usuario.paisesOperacion[0] ?? "";

  async function guardar(comoBorrador: boolean) {
    if (!usuario || !datos) return;
    if (!comoBorrador) {
      const erroresCalculados = calcularErroresNotificacionPago(datos);
      setErrores(erroresCalculados);
      if (Object.keys(erroresCalculados).length > 0) {
        toast.error("Revisa los campos marcados antes de certificar.");
        return;
      }
    }
    setEnviando(true);
    try {
      const creada = await crearNotificacionPago(datos, usuario, comoBorrador);
      // El speaker recién usado deja de ofrecerse para este evento sin recargar.
      setNotificacionesExistentes((actual) => [creada, ...actual]);
      toast.success(comoBorrador ? "Notificación de Pago guardada como borrador." : "Notificación de Pago certificada y completada.");
      setDatos(notificacionPagoVacia(empresaGrupo, usuario.nombre, usuario.cargo));
      setErrores({});
      onCreado?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar la Notificación de Pago.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Nueva Notificación de Pago a HCP</h1>
        <p className="text-sm text-muted-foreground">
          Documento de un solo firmante: al certificarla queda Completada directamente, sin cadena de aprobación.
        </p>
      </div>

      <FormularioNotificacionPago
        valor={datos}
        onChange={setDatos}
        errores={errores}
        eventosDisponibles={eventos}
        speakersDisponibles={speakers}
        documentosExistentes={notificacionesExistentes}
        registrosFinancieros={registrosFinancieros}
        productosDisponibles={productos}
        camposPersonalizadosDefinidos={campos}
        etiquetasCampo={etiquetas}
        empresaGrupo={empresaGrupo}
        pais={pais}
        firmaUsuarioId={usuario.firmaId}
        precargarEventoOrigenId={precargarEventoOrigenId}
        precargarSpeakerId={precargarSpeakerId}
      />

      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={enviando} onClick={() => guardar(true)}>
          Guardar como borrador
        </Button>
        <Button disabled={enviando} onClick={() => guardar(false)}>
          Certificar y completar
        </Button>
      </div>
    </div>
  );
}
