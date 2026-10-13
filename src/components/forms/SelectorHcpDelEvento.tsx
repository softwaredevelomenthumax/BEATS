import * as React from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { etiquetaSpeakerResumen, type SpeakerResumen } from "@/lib/speakers";

/**
 * Octubre 2026 (entrega 20), pedido explícito: "En todos los formularios donde
 * se requiera seleccionar 'Seleccionar HCP del Repositorio de HCPs/Speakers *',
 * se deben poder cargar de la lista desplegable únicamente los speakers que
 * estén vinculados al evento desde la solicitud de evento educativo y
 * promocional. Además, a quienes todavía no se les haya creado el documento
 * respectivo asociado al evento."
 *
 * Un único selector compartido por FMV Checklist, Convenio de Pago a HCP, CAF y
 * Notificación de Pago a HCPs (antes solo FMV tenía esta lógica, copiada dentro
 * de su propio formulario), para que las 4 pantallas se comporten igual.
 */

/** Forma mínima de un documento ya existente del mismo tipo (cualquier estado; los Anulados no cuentan). */
export interface DocumentoExistenteSpeaker {
  id: string;
  eventoOrigenId: string | null;
  speakerId: string | null;
  estado: string;
}

/** Forma mínima de la opción de evento que necesita el selector (ver `OpcionEventoOrigen`). */
export interface EventoConSpeakers {
  id: string;
  speakerIds: string[];
}

/**
 * Speakers del evento que todavía no tienen su documento. Función pura (se
 * prueba sin React): el documento que se está editando (`documentoActualId`)
 * nunca cuenta contra su propio speaker.
 */
export function calcularSpeakersDelEvento(params: {
  evento: EventoConSpeakers | null;
  speakersDisponibles: SpeakerResumen[];
  documentosExistentes: DocumentoExistenteSpeaker[];
  documentoActualId?: string;
}): { disponibles: SpeakerResumen[]; yaTienenDocumento: number } {
  const { evento, speakersDisponibles, documentosExistentes, documentoActualId } = params;
  if (!evento) return { disponibles: [], yaTienenDocumento: 0 };
  const conDocumento = new Set(
    documentosExistentes
      .filter((d) => d.eventoOrigenId === evento.id && !!d.speakerId && d.estado !== "Anulado" && d.id !== documentoActualId)
      .map((d) => d.speakerId as string),
  );
  const permitidos = new Set(evento.speakerIds);
  return {
    disponibles: speakersDisponibles.filter((sp) => permitidos.has(sp.id) && !conDocumento.has(sp.id)),
    yaTienenDocumento: evento.speakerIds.filter((id) => conDocumento.has(id)).length,
  };
}

interface Props {
  /** Id del `<SelectTrigger>` (los formularios ya tenían uno propio: `fmv-speaker`, `caf-speaker`, ...). */
  id: string;
  valor: string | null | undefined;
  onChange: (speakerId: string) => void;
  /** Se llama cuando el evento cambia y el speaker elegido antes ya no pertenece a él. */
  onLimpiar: () => void;
  eventoOrigenId: string;
  eventosDisponibles: EventoConSpeakers[];
  speakersDisponibles: SpeakerResumen[];
  documentosExistentes?: DocumentoExistenteSpeaker[];
  documentoActualId?: string;
  /** Nombre del documento en lenguaje natural, para los avisos: "FMV Checklist", "Convenio de Pago a HCP", "CAF"... */
  nombreDocumento: string;
  /** Texto de ayuda adicional (p. ej. qué se precarga al elegir el HCP). */
  ayuda?: string;
  /** Aviso extra bajo el selector (p. ej. vigencia de la licencia del HCP). */
  avisoExtra?: React.ReactNode;
  error?: string;
  disabled?: boolean;
  etiqueta?: string;
}

export function SelectorHcpDelEvento({
  id,
  valor,
  onChange,
  onLimpiar,
  eventoOrigenId,
  eventosDisponibles,
  speakersDisponibles,
  documentosExistentes = [],
  documentoActualId,
  nombreDocumento,
  ayuda,
  avisoExtra,
  error,
  disabled,
  etiqueta = "Seleccionar HCP del Repositorio de HCPs/Speakers *",
}: Props) {
  const opcionEvento = eventosDisponibles.find((ev) => ev.id === eventoOrigenId) ?? null;
  const { disponibles, yaTienenDocumento } = React.useMemo(
    () => calcularSpeakersDelEvento({ evento: opcionEvento, speakersDisponibles, documentosExistentes, documentoActualId }),
    [opcionEvento, speakersDisponibles, documentosExistentes, documentoActualId],
  );

  // Si el documento ya guardado trae un speaker que ya no figura entre los
  // disponibles (p. ej. se quitó del evento), se conserva visible y marcado en
  // vez de perder el dato en silencio.
  const speakerActualFuera =
    !!valor && !!opcionEvento && !disponibles.some((sp) => sp.id === valor)
      ? speakersDisponibles.find((sp) => sp.id === valor) ?? null
      : null;
  const actualEstaEnElEvento = !!valor && !!opcionEvento && opcionEvento.speakerIds.includes(valor);

  // Si se cambia el evento y el speaker elegido antes no pertenece al nuevo, se
  // limpia la selección (los datos ya precargados quedan editables).
  React.useEffect(() => {
    if (disabled || !valor || !opcionEvento) return;
    if (!opcionEvento.speakerIds.includes(valor)) onLimpiar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventoOrigenId]);

  return (
    <div className="flex flex-col gap-1.5 sm:col-span-2">
      <Label htmlFor={id}>{etiqueta}</Label>
      <Select value={valor ?? ""} onValueChange={onChange} disabled={disabled || !eventoOrigenId}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={eventoOrigenId ? "Selecciona un speaker del evento" : "Elige primero el evento de origen"} />
        </SelectTrigger>
        <SelectContent>
          {speakerActualFuera && (
            <SelectItem value={speakerActualFuera.id}>
              {etiquetaSpeakerResumen(speakerActualFuera)}
              {actualEstaEnElEvento ? "" : " (ya no está en el evento)"}
            </SelectItem>
          )}
          {disponibles.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {etiquetaSpeakerResumen(s)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {eventoOrigenId && opcionEvento && opcionEvento.speakerIds.length === 0 && (
        <p className="text-xs text-amber-700">
          Este evento no tiene speakers del Repositorio vinculados en la solicitud de evento. Agrégalos allí (o edita la solicitud) para poder elegirlos aquí.
        </p>
      )}
      {eventoOrigenId && opcionEvento && opcionEvento.speakerIds.length > 0 && disponibles.length === 0 && !speakerActualFuera && (
        <p className="text-xs text-amber-700">Todos los speakers vinculados a este evento ya tienen su {nombreDocumento} creado.</p>
      )}
      <p className="text-xs text-muted-foreground">
        Solo aparecen los speakers vinculados al evento a quienes todavía no se les ha creado su {nombreDocumento}
        {yaTienenDocumento > 0 ? ` (${yaTienenDocumento} ya lo tiene${yaTienenDocumento === 1 ? "" : "n"})` : ""}.
        {ayuda ? ` ${ayuda}` : ""}
      </p>
      {avisoExtra}
    </div>
  );
}
