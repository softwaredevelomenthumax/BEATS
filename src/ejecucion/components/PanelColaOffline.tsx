import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MAX_INTENTOS_AUTOMATICOS, type ItemCola } from "../lib/colaOffline";
import { formatearFechaHora } from "@/lib/fecha";

interface Props {
  items: ItemCola[];
  onReintentar: (item: ItemCola, opciones?: { resetear?: boolean }) => void;
}

function descripcionItem(item: ItemCola): string {
  if (item.tipo === "registro") {
    return `Registro de asistencia — ${item.datos.nombres} ${item.datos.apellidos}`;
  }
  return `Entrega de muestras — ${item.nombreParticipante}`;
}

/**
 * Indicador + panel de la cola offline (IndexedDB `beats-ejecucion`): deja
 * ver en todo momento cuántos registros/entregas quedaron pendientes de
 * sincronizar, con cuántos intentos automáticos llevan (máx. 5, cada 25s o
 * al reconectar) y permite forzar un reintento manual — incluso después de
 * que los intentos automáticos se agotaron.
 */
export function PanelColaOffline({ items, onReintentar }: Props) {
  if (items.length === 0) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          Cola de sincronización
          <Badge variant="secondary">{items.length}</Badge>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cola de sincronización</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-md border p-3 text-sm">
              <div className="font-medium">{descripcionItem(item)}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Guardado {formatearFechaHora(item.creadoEn)} · Intentos: {item.intentos}/
                {MAX_INTENTOS_AUTOMATICOS}
              </div>
              {item.ultimoError && <div className="mt-1 text-xs text-destructive">{item.ultimoError}</div>}
              {item.agotado ? (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-destructive">
                    Reintentos automáticos agotados
                  </span>
                  <Button size="sm" onClick={() => onReintentar(item, { resetear: true })}>
                    Reintentar de todas formas
                  </Button>
                </div>
              ) : (
                <div className="mt-2 flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => onReintentar(item)}>
                    Reintentar ahora
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
