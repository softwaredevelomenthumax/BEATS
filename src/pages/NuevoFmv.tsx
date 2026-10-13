import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  FormularioFMV,
  fmvVacio,
  calcularErroresFmv,
  type DatosFormularioFmv,
} from "@/components/forms/FormularioFMV";
import { useAuth } from "@/hooks/useAuth";
import { useCompania } from "@/hooks/useCompania";
import { crearFmv, traerFmvs } from "@/lib/fmv";
import { traerConfiguracionFmv, type ConfiguracionFmv } from "@/lib/fmvConfig";
import { traerCamposPersonalizados, type CampoPersonalizadoDefinicion } from "@/lib/camposPersonalizados";
import { traerEtiquetasCampo, type EtiquetaCampo } from "@/lib/etiquetasCampo";
import { traerEventos } from "@/lib/evento";
import { eventosParaOrigenSpeakerExterno, type OpcionEventoOrigen } from "@/lib/documentosRequeridosEvento";
import { traerSpeakersResumen, type SpeakerResumen } from "@/lib/speakers";
import type { Fmv } from "@/types";

const CONFIGURACION_VACIA: ConfiguracionFmv = { umbralTier1: 15, umbralTier2: 9, criterios: [] };

export function NuevoFmv({
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
  const [datos, setDatos] = React.useState<DatosFormularioFmv | null>(null);
  const [errores, setErrores] = React.useState<Record<string, string>>({});
  const [enviando, setEnviando] = React.useState(false);
  const [configuracion, setConfiguracion] = React.useState<ConfiguracionFmv>(CONFIGURACION_VACIA);
  const [campos, setCampos] = React.useState<CampoPersonalizadoDefinicion[]>([]);
  const [etiquetas, setEtiquetas] = React.useState<EtiquetaCampo[]>([]);
  const [eventos, setEventos] = React.useState<OpcionEventoOrigen[]>([]);
  const [speakers, setSpeakers] = React.useState<SpeakerResumen[]>([]);
  const [fmvsExistentes, setFmvsExistentes] = React.useState<Fmv[]>([]);

  React.useEffect(() => {
    if (!usuario) return;
    setDatos(fmvVacio(companiaActual ?? usuario.empresasGrupo[0] ?? "", usuario.paisesOperacion[0] ?? "", usuario.nombre, usuario.cargo));
    traerConfiguracionFmv().then(setConfiguracion).catch((e) => toast.error(e instanceof Error ? e.message : "No se pudo cargar la configuración de FMV."));
    traerCamposPersonalizados().then(setCampos).catch(() => setCampos([]));
    traerEtiquetasCampo().then(setEtiquetas).catch(() => setEtiquetas([]));
    traerEventos()
      .then((evs) => setEventos(eventosParaOrigenSpeakerExterno(evs)))
      .catch(() => setEventos([]));
    traerSpeakersResumen().then(setSpeakers).catch(() => setSpeakers([]));
    traerFmvs().then(setFmvsExistentes).catch(() => setFmvsExistentes([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.id]);

  if (!usuario || !datos) return null;
  const empresaGrupo = companiaActual ?? usuario.empresasGrupo[0] ?? "";
  const pais = usuario.paisesOperacion[0] ?? "";

  async function guardar(comoBorrador: boolean) {
    if (!usuario || !datos) return;
    if (!comoBorrador) {
      const erroresCalculados = calcularErroresFmv(datos);
      setErrores(erroresCalculados);
      if (Object.keys(erroresCalculados).length > 0) {
        toast.error("Revisa los campos marcados antes de certificar.");
        return;
      }
    }
    setEnviando(true);
    try {
      const creado = await crearFmv(datos, usuario, comoBorrador);
      // El speaker recién usado deja de ofrecerse para este evento sin recargar.
      setFmvsExistentes((actual) => [creado, ...actual]);
      toast.success(comoBorrador ? "FMV guardado como borrador." : "FMV certificado y completado.");
      setDatos(fmvVacio(empresaGrupo, pais, usuario.nombre, usuario.cargo));
      setErrores({});
      onCreado?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el FMV.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Nuevo FMV Checklist</h1>
        <p className="text-sm text-muted-foreground">
          Documento de un solo firmante: al certificarlo queda Completado directamente, sin cadena de aprobación.
        </p>
      </div>

      <FormularioFMV
        valor={datos}
        onChange={setDatos}
        errores={errores}
        eventosDisponibles={eventos}
        speakersDisponibles={speakers}
        fmvsExistentes={fmvsExistentes}
        configuracion={configuracion}
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
