import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormularioCAF, CAF_VACIO, calcularErroresCaf, type DatosFormularioCaf } from "@/components/forms/FormularioCAF";
import { useAuth } from "@/hooks/useAuth";
import { useCompania } from "@/hooks/useCompania";
import { crearCaf, traerCafs } from "@/lib/caf";
import { traerCamposPersonalizados, type CampoPersonalizadoDefinicion } from "@/lib/camposPersonalizados";
import { traerEtiquetasCampo, type EtiquetaCampo } from "@/lib/etiquetasCampo";
import { traerEventos } from "@/lib/evento";
import { traerConvenios } from "@/lib/convenio";
import { traerFmvs } from "@/lib/fmv";
import { eventosParaOrigenCaf, type OpcionEventoOrigen } from "@/lib/documentosRequeridosEvento";
import { traerSpeakersResumen, type SpeakerResumen } from "@/lib/speakers";
import { SIGNIFICADO_CAF } from "@/lib/enums";
import type { Caf } from "@/types";

export function NuevoCaf({
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
  const [datos, setDatos] = React.useState<DatosFormularioCaf>(CAF_VACIO);
  const [errores, setErrores] = React.useState<Record<string, string>>({});
  const [enviando, setEnviando] = React.useState(false);
  const [campos, setCampos] = React.useState<CampoPersonalizadoDefinicion[]>([]);
  const [etiquetas, setEtiquetas] = React.useState<EtiquetaCampo[]>([]);
  const [eventos, setEventos] = React.useState<OpcionEventoOrigen[]>([]);
  const [speakers, setSpeakers] = React.useState<SpeakerResumen[]>([]);
  const [cafsExistentes, setCafsExistentes] = React.useState<Caf[]>([]);

  React.useEffect(() => {
    traerCamposPersonalizados().then(setCampos).catch(() => setCampos([]));
    traerEtiquetasCampo().then(setEtiquetas).catch(() => setEtiquetas([]));
    Promise.all([traerEventos(), traerConvenios(), traerFmvs()])
      .then(([evs, convenios, fmvs]) => setEventos(eventosParaOrigenCaf(evs, convenios, fmvs)))
      .catch(() => setEventos([]));
    traerSpeakersResumen().then(setSpeakers).catch(() => setSpeakers([]));
    traerCafs().then(setCafsExistentes).catch(() => setCafsExistentes([]));
  }, []);

  // Ronda de ajustes de formularios (septiembre 2026), entrega 7:
  // "Nombre/Teléfono del solicitante" y "Nombre/Cargo del Director de
  // Área" se autocargan del usuario en sesión — pedido explícito. Solo se
  // fija una vez, al montar (no sobrescribe si el usuario ya escribió
  // algo distinto, a diferencia del precargado entre documentos).
  React.useEffect(() => {
    if (!usuario) return;
    setDatos((actual) =>
      actual.solicitanteNombre
        ? actual
        : {
            ...actual,
            solicitanteNombre: usuario.nombre,
            solicitanteTelefono: usuario.telefono,
            // Entrega 24: el director de área ya no se llena con quien solicita; lo completa la matriz de firmas.
          },
    );
  }, [usuario]);

  if (!usuario) return null;
  const empresaGrupo = companiaActual ?? usuario.empresasGrupo[0] ?? "";
  const pais = usuario.paisesOperacion[0] ?? "";

  async function guardar(comoBorrador: boolean) {
    if (!usuario) return;
    if (!comoBorrador) {
      const erroresCalculados = calcularErroresCaf(datos);
      setErrores(erroresCalculados);
      if (Object.keys(erroresCalculados).length > 0) {
        toast.error("Revisa los campos marcados antes de enviar.");
        return;
      }
    }
    setEnviando(true);
    try {
      const creado = await crearCaf(datos, usuario, comoBorrador);
      // El speaker recién usado deja de ofrecerse para este evento sin recargar.
      setCafsExistentes((actual) => [creado, ...actual]);
      toast.success(
        comoBorrador
          ? "CAF guardado como borrador."
          : datos.elaboradoEnCafCorporativo
            ? "CAF registrado. Ya puedes continuar con el Convenio HCP; carga la copia firmada en el Expediente del evento."
            : "CAF enviado a aprobación.",
      );
      setDatos(CAF_VACIO);
      setErrores({});
      onCreado?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el CAF.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        {/* AJUSTES (septiembre/octubre 2026), pedido explícito: cambiar
            "Nueva CAF Carta de Autorización de Fondos, asociada a un evento
            ya aprobado" por "Nuevo CAF (Formato de Aprobación de Contrato
            asociado a un evento ya aprobado)". */}
        <h1 className="text-2xl font-semibold">Nuevo CAF</h1>
        <p className="text-sm text-muted-foreground">
          ({SIGNIFICADO_CAF} asociado a un evento ya aprobado)
        </p>
      </div>

      <FormularioCAF
        valor={datos}
        onChange={setDatos}
        errores={errores}
        eventosDisponibles={eventos}
        speakersDisponibles={speakers}
        documentosExistentes={cafsExistentes}
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
