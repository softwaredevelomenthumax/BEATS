import * as React from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { PanelInformeEvento } from "@/components/informe-evento/PanelInformeEvento";
import { traerEventos } from "@/lib/evento";
import { etiquetaEventoInforme } from "@/lib/informeEvento";
import { useCompania, filtrarPorEmpresaGrupo } from "@/hooks/useCompania";
import { mensajeErrorAmigable } from "@/lib/supabaseClient";
import type { Evento } from "@/types";

/** Solo eventos que ya pasaron por la cadena de aprobación tienen algo que reportar en ejecución. */
const ESTADOS_REPORTABLES = new Set(["Aprobado", "Completado"]);

/**
 * Informe por Evento (entrega 21, octubre 2026): al elegir un evento aprobado
 * se puede (1) descargar su expediente completo como un archivo HTML —formularios
 * generados, soportes por speaker, asistencia, muestras y fotos— y (2) abrir el
 * resumen del evento con vista previa / imprimir / PDF. Ver `PanelInformeEvento`.
 */
export function InformePorEvento() {
  const { companiaActual } = useCompania();
  const [eventos, setEventos] = React.useState<Evento[]>([]);
  const [eventoId, setEventoId] = React.useState<string>("");
  const [cargando, setCargando] = React.useState(true);

  React.useEffect(() => {
    traerEventos()
      .then((e) => {
        // Selector de compañía del grupo (pedido explícito, octubre 2026):
        // solo se ofrecen para reportar los eventos de la compañía actual.
        setEventos(
          filtrarPorEmpresaGrupo(e, companiaActual)
            .filter((ev) => ESTADOS_REPORTABLES.has(ev.estado))
            .sort((a, b) => a.nombreEvento.localeCompare(b.nombreEvento, "es", { sensitivity: "base" })),
        );
      })
      .catch((error) => toast.error(mensajeErrorAmigable(error)))
      .finally(() => setCargando(false));
  }, [companiaActual]);

  const evento = eventos.find((e) => e.id === eventoId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Informe por Evento</h1>
        <p className="text-sm text-muted-foreground">
          Elige un evento aprobado para descargar su expediente completo en HTML o ver su resumen para imprimir o guardar como PDF.
        </p>
      </div>

      <Card className="no-imprimir">
        <CardContent className="flex flex-col gap-1.5 pt-6">
          <Label htmlFor="ipe-evento">Evento</Label>
          <Select value={eventoId} onValueChange={setEventoId}>
            <SelectTrigger id="ipe-evento" className="max-w-2xl" data-testid="ipe-evento">
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
            <p className="text-sm text-muted-foreground">Todavía no hay eventos Aprobados o Completados para reportar.</p>
          )}
        </CardContent>
      </Card>

      {evento && <PanelInformeEvento key={evento.id} evento={evento} />}
    </div>
  );
}
