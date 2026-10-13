import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  FormularioConvenio,
  CONVENIO_VACIO,
  calcularErroresConvenio,
  type DatosFormularioConvenio,
} from "@/components/forms/FormularioConvenio";
import { useAuth } from "@/hooks/useAuth";
import { useCompania } from "@/hooks/useCompania";
import { crearConvenio, traerConvenios } from "@/lib/convenio";
import { traerCamposPersonalizados, type CampoPersonalizadoDefinicion } from "@/lib/camposPersonalizados";
import { traerEtiquetasCampo, type EtiquetaCampo } from "@/lib/etiquetasCampo";
import { traerEventos } from "@/lib/evento";
import { eventosParaOrigenSpeakerExterno, type OpcionEventoOrigen } from "@/lib/documentosRequeridosEvento";
import { traerSpeakersResumen, type SpeakerResumen } from "@/lib/speakers";
import type { Convenio } from "@/types";

export function NuevoConvenio({
  onCreado,
  onCancelar,
  precargarEventoOrigenId,
  precargarSpeakerId,
}: {
  onCreado?: () => void;
  onCancelar?: () => void;
  /** "Tareas Pendientes" → "diligenciar este documento" (ajuste de precisión, septiembre 2026, pedido explícito). */
  precargarEventoOrigenId?: string;
  precargarSpeakerId?: string;
}) {
  const { usuario } = useAuth();
  const { companiaActual } = useCompania();
  // Octubre 2026, pedido explícito: "Unidad de negocio / ubicación" se carga
  // sola con la empresa del grupo con la que el usuario está logueado, pero
  // el campo sigue editable. `empresaActual` se resuelve antes del `return`
  // temprano de más abajo para poder usarla en el estado inicial.
  const empresaActual = companiaActual ?? usuario?.empresasGrupo[0] ?? "";
  const [datos, setDatos] = React.useState<DatosFormularioConvenio>({ ...CONVENIO_VACIO, unidadNegocioUbicacion: empresaActual });
  const [errores, setErrores] = React.useState<Record<string, string>>({});
  const [enviando, setEnviando] = React.useState(false);
  const [campos, setCampos] = React.useState<CampoPersonalizadoDefinicion[]>([]);
  const [etiquetas, setEtiquetas] = React.useState<EtiquetaCampo[]>([]);
  const [eventos, setEventos] = React.useState<OpcionEventoOrigen[]>([]);
  const [speakers, setSpeakers] = React.useState<SpeakerResumen[]>([]);
  const [conveniosExistentes, setConveniosExistentes] = React.useState<Convenio[]>([]);

  React.useEffect(() => {
    traerCamposPersonalizados().then(setCampos).catch(() => setCampos([]));
    traerEtiquetasCampo().then(setEtiquetas).catch(() => setEtiquetas([]));
    traerEventos()
      .then((evs) => setEventos(eventosParaOrigenSpeakerExterno(evs)))
      .catch(() => setEventos([]));
    traerSpeakersResumen().then(setSpeakers).catch(() => setSpeakers([]));
    traerConvenios().then(setConveniosExistentes).catch(() => setConveniosExistentes([]));
  }, []);

  // AJUSTES (septiembre/octubre 2026), pedido explícito: "Empleado
  // responsable (nombre y cargo)" se autocarga desde el usuario en sesión
  // (nombre + cargo concatenados) y sigue siendo editable — mismo criterio
  // ya usado para "Nombre del solicitante" en Solicitud de Evento
  // (`NuevoEvento.tsx`). Solo lo autocompleta mientras el campo sigue
  // vacío, para no pisar una edición manual ya hecha.
  React.useEffect(() => {
    if (!usuario) return;
    setDatos((d) =>
      d.empleadoResponsableNombreCargo
        ? d
        : { ...d, empleadoResponsableNombreCargo: [usuario.nombre, usuario.cargo].filter(Boolean).join(", ") },
    );
  }, [usuario]);

  // Si la empresa del usuario se resolvió DESPUÉS del primer render (la sesión
  // carga de forma asíncrona), se completa una sola vez mientras el campo siga
  // vacío; si el usuario lo borra o lo cambia a propósito, no se vuelve a pisar.
  const unidadNegocioPrecargada = React.useRef(Boolean(empresaActual));
  React.useEffect(() => {
    if (unidadNegocioPrecargada.current || !empresaActual) return;
    unidadNegocioPrecargada.current = true;
    setDatos((d) => (d.unidadNegocioUbicacion ? d : { ...d, unidadNegocioUbicacion: empresaActual }));
  }, [empresaActual]);

  if (!usuario) return null;
  const empresaGrupo = empresaActual;
  const pais = usuario.paisesOperacion[0] ?? "";

  async function guardar(comoBorrador: boolean) {
    if (!usuario) return;
    if (!comoBorrador) {
      const erroresCalculados = calcularErroresConvenio(datos);
      setErrores(erroresCalculados);
      if (Object.keys(erroresCalculados).length > 0) {
        toast.error("Revisa los campos marcados antes de enviar.");
        return;
      }
    }
    setEnviando(true);
    try {
      const creado = await crearConvenio(datos, usuario, comoBorrador);
      // El speaker recién usado deja de ofrecerse para este evento sin recargar.
      setConveniosExistentes((actual) => [creado, ...actual]);
      toast.success(comoBorrador ? "Convenio de Pago guardado como borrador." : "Convenio de Pago enviado a aprobación.");
      setDatos({ ...CONVENIO_VACIO, unidadNegocioUbicacion: empresaGrupo });
      setErrores({});
      onCreado?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el Convenio de Pago.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Nuevo Convenio de Pago a HCP</h1>
        <p className="text-sm text-muted-foreground">
          Cadena de aprobación: Jefe de Unidad de Negocios → Director Médico → Área Legal.
        </p>
      </div>

      <FormularioConvenio
        valor={datos}
        onChange={setDatos}
        errores={errores}
        eventosDisponibles={eventos}
        speakersDisponibles={speakers}
        documentosExistentes={conveniosExistentes}
        camposPersonalizadosDefinidos={campos}
        etiquetasCampo={etiquetas}
        empresaGrupo={empresaGrupo}
        pais={pais}
        precargarEventoOrigenId={precargarEventoOrigenId}
        precargarSpeakerId={precargarSpeakerId}
        onCancelar={() => {
          setDatos({ ...CONVENIO_VACIO, unidadNegocioUbicacion: empresaGrupo });
          setErrores({});
          onCancelar?.();
        }}
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
