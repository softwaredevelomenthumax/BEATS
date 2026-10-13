import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  FormularioConvenioHCP,
  CONVENIO_HCP_VACIO,
  calcularErroresConvenioHCP,
  type DatosFormularioConvenioHCP,
} from "@/components/forms/FormularioConvenioHCP";
import { useAuth } from "@/hooks/useAuth";
import { useCompania } from "@/hooks/useCompania";
import { crearConvenioHCP } from "@/lib/convenioHCP";
import { traerCamposPersonalizados, type CampoPersonalizadoDefinicion } from "@/lib/camposPersonalizados";
import { traerEtiquetasCampo, type EtiquetaCampo } from "@/lib/etiquetasCampo";
import { traerSpeakersResumen, type SpeakerResumen } from "@/lib/speakers";
import { traerEventos } from "@/lib/evento";
import { traerConvenios } from "@/lib/convenio";
import { traerFmvs } from "@/lib/fmv";
import { traerCafs } from "@/lib/caf";
import { traerConveniosHCP } from "@/lib/convenioHCP";
import { traerUsuarios } from "@/lib/usuarios";
import { eventosParaOrigenConvenioHCP, type OpcionEventoOrigenConvenioHCP } from "@/lib/documentosRequeridosEvento";

export function NuevoConvenioHCP({
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
  const [datos, setDatos] = React.useState<DatosFormularioConvenioHCP>(CONVENIO_HCP_VACIO);
  const [errores, setErrores] = React.useState<Record<string, string>>({});
  const [enviando, setEnviando] = React.useState(false);
  const [campos, setCampos] = React.useState<CampoPersonalizadoDefinicion[]>([]);
  const [etiquetas, setEtiquetas] = React.useState<EtiquetaCampo[]>([]);
  const [eventos, setEventos] = React.useState<OpcionEventoOrigenConvenioHCP[]>([]);
  const [speakers, setSpeakers] = React.useState<SpeakerResumen[]>([]);
  const [nombresGerenciaGeneral, setNombresGerenciaGeneral] = React.useState<string[]>([]);

  // Se vuelve a llamar después de crear un Convenio HCP: el speaker recién usado
  // deja de ofrecerse para ese evento sin recargar la pantalla.
  const cargarOpcionesOrigen = React.useCallback(() => {
    Promise.all([traerEventos(), traerConvenios(), traerFmvs(), traerCafs(), traerConveniosHCP(), traerSpeakersResumen()])
      .then(([evs, convenios, fmvs, cafsCompletos, conveniosHCP, speakersResumen]) => {
        setEventos(eventosParaOrigenConvenioHCP(evs, convenios, fmvs, cafsCompletos, conveniosHCP, speakersResumen));
        setSpeakers(speakersResumen);
      })
      .catch(() => {
        setEventos([]);
        setSpeakers([]);
      });
  }, []);

  React.useEffect(() => {
    traerCamposPersonalizados().then(setCampos).catch(() => setCampos([]));
    traerEtiquetasCampo().then(setEtiquetas).catch(() => setEtiquetas([]));
    cargarOpcionesOrigen();
    traerUsuarios()
      .then((us) => setNombresGerenciaGeneral(us.filter((u) => u.rol === "gerencia_general").map((u) => u.nombre)))
      .catch(() => setNombresGerenciaGeneral([]));
  }, [cargarOpcionesOrigen]);

  if (!usuario) return null;
  const empresaGrupo = companiaActual ?? usuario.empresasGrupo[0] ?? "";
  const pais = usuario.paisesOperacion[0] ?? "";

  async function guardar(comoBorrador: boolean) {
    if (!usuario) return;
    if (!comoBorrador) {
      const erroresCalculados = calcularErroresConvenioHCP(datos);
      setErrores(erroresCalculados);
      if (Object.keys(erroresCalculados).length > 0) {
        toast.error("Revisa los campos marcados antes de enviar.");
        return;
      }
    }
    setEnviando(true);
    try {
      await crearConvenioHCP(datos, usuario, comoBorrador);
      cargarOpcionesOrigen();
      toast.success(
        comoBorrador
          ? "Convenio HCP guardado como borrador."
          : datos.elaboradoEnContratosCorporativo
            ? "Convenio HCP registrado. Carga la copia firmada en el Expediente del evento."
            : "Convenio HCP enviado a aprobación.",
      );
      setDatos(CONVENIO_HCP_VACIO);
      setErrores({});
      onCreado?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el Convenio HCP.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Nuevo Convenio HCP</h1>
        <p className="text-sm text-muted-foreground">
          Contrato de consultoría formal. Puedes elaborarlo en BEATS (Visto Bueno Legal/Compliance → Firma Gerencia General / Rep. Legal) o registrar el que elaboraste en el aplicativo corporativo de contratos.
        </p>
      </div>

      <FormularioConvenioHCP
        valor={datos}
        onChange={setDatos}
        errores={errores}
        eventosDisponibles={eventos}
        speakersDisponibles={speakers}
        nombresGerenciaGeneral={nombresGerenciaGeneral}
        camposPersonalizadosDefinidos={campos}
        etiquetasCampo={etiquetas}
        empresaGrupo={empresaGrupo}
        pais={pais}
        preguntarModalidad
        precargarEventoOrigenId={precargarEventoOrigenId}
        precargarSpeakerId={precargarSpeakerId}
      />

      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={enviando} onClick={() => guardar(true)}>
          Guardar como borrador
        </Button>
        <Button disabled={enviando} onClick={() => guardar(false)}>
          Enviar a aprobación
        </Button>
      </div>
    </div>
  );
}
