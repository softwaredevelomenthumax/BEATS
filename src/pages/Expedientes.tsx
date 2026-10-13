import * as React from "react";
import { toast } from "sonner";
import { FolderOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useVentanasDocumentos } from "@/hooks/useVentanasDocumentos";
import { useCompania, filtrarPorEmpresaGrupo } from "@/hooks/useCompania";
import { traerEventos } from "@/lib/evento";
import { etiquetaEventoInforme } from "@/lib/informeEvento";
import { formatearFecha } from "@/lib/fecha";
import { mensajeErrorAmigable } from "@/lib/supabaseClient";
import type { Evento } from "@/types";

/** Igual que en el detalle del evento: solo los eventos Aprobados o Completados tienen expediente. */
const ESTADOS_CON_EXPEDIENTE = new Set(["Aprobado", "Completado"]);

/**
 * Expedientes (octubre 2026, entrega 35) — acceso directo al Expediente de cualquier evento desde «Informes y Auditoría».
 * Mismo selector que «Informe por Evento»: se elige un evento (de la compañía con la que se trabaja) y se abre su
 * Expediente (documentos del sistema, soportes por speaker, asistencia, muestra médica, fotos y financiero) en la misma
 * ventana minimizable que se abre desde el detalle del evento (`ExpedienteEvento`, vía `useVentanasDocumentos`).
 */
export function Expedientes() {
  const { companiaActual } = useCompania();
  const { abrirExpediente } = useVentanasDocumentos();
  const [eventos, setEventos] = React.useState<Evento[]>([]);
  const [eventoId, setEventoId] = React.useState<string>("");
  const [cargando, setCargando] = React.useState(true);

  React.useEffect(() => {
    traerEventos()
      .then((e) => {
        setEventos(
          filtrarPorEmpresaGrupo(e, companiaActual)
            .filter((ev) => ESTADOS_CON_EXPEDIENTE.has(ev.estado))
            .sort((a, b) => a.nombreEvento.localeCompare(b.nombreEvento, "es", { sensitivity: "base" })),
        );
      })
      .catch((error) => toast.error(mensajeErrorAmigable(error)))
      .finally(() => setCargando(false));
  }, [companiaActual]);

  const evento = eventos.find((e) => e.id === eventoId) ?? null;

  function elegir(id: string) {
    setEventoId(id);
    const elegido = eventos.find((e) => e.id === id);
    // Elegir el evento abre su expediente de inmediato; el botón de abajo lo vuelve a abrir si se cierra.
    if (elegido) abrirExpediente(elegido);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Expedientes</h1>
        <p className="text-sm text-muted-foreground">
          Elige un evento aprobado para consultar su expediente: documentos del sistema, soportes por speaker, asistencia, fotos y pagos.
        </p>
      </div>

      <Card className="no-imprimir">
        <CardContent className="flex flex-col gap-1.5 pt-6">
          <Label htmlFor="exps-evento">Evento</Label>
          <Select value={eventoId} onValueChange={elegir}>
            <SelectTrigger id="exps-evento" className="max-w-2xl" data-testid="exps-evento">
              <SelectValue placeholder={cargando ? "Cargando..." : "Selecciona un evento"} />
            </SelectTrigger>
            <SelectContent>
              {eventos.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {etiquetaEventoInforme(e)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!cargando && eventos.length === 0 && (
            <p className="text-sm text-muted-foreground">Todavía no hay eventos Aprobados o Completados con expediente.</p>
          )}
        </CardContent>
      </Card>

      {evento && (
        <Card className="no-imprimir" data-testid="exps-tarjeta">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
                <span className="truncate">{evento.nombreEvento || "(sin nombre)"}</span>
                <Badge variant={evento.estado === "Completado" ? "completed" : "approved"}>{evento.estado}</Badge>
              </h2>
              <p className="text-xs text-muted-foreground">
                {evento.fechaInicioEvento ? formatearFecha(evento.fechaInicioEvento) : "Sin fecha"}
                {evento.fechaFinEvento && evento.fechaFinEvento !== evento.fechaInicioEvento ? ` – ${formatearFecha(evento.fechaFinEvento)}` : ""}
                {evento.nombreSolicitante ? ` · Solicitante: ${evento.nombreSolicitante}` : ""}
              </p>
            </div>
            <Button size="sm" className="gap-1.5" onClick={() => abrirExpediente(evento)} data-testid="exps-abrir">
              <FolderOpen className="size-4" /> Abrir expediente
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
