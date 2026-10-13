import * as React from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { traerNotificaciones, marcarNotificacionLeida, marcarTodasLeidas } from "@/lib/notificaciones";
import { formatearFechaHora } from "@/lib/fecha";
import type { Notificacion } from "@/types";

const SONDEO_MS = 30_000;

export function NotificacionesBell() {
  const { usuario } = useAuth();
  const [notificaciones, setNotificaciones] = React.useState<Notificacion[]>([]);

  const cargar = React.useCallback(() => {
    if (!usuario) return;
    traerNotificaciones(usuario.id)
      .then(setNotificaciones)
      .catch(() => {
        // La campanita no debe ensuciar la UI con toasts si el sondeo falla una vez.
      });
  }, [usuario]);

  React.useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, SONDEO_MS);
    return () => clearInterval(intervalo);
  }, [cargar]);

  if (!usuario) return null;

  const noLeidas = notificaciones.filter((n) => !n.leida).length;

  async function abrir(n: Notificacion) {
    if (!n.leida) {
      await marcarNotificacionLeida(n.id);
      cargar();
    }
  }

  async function marcarTodas() {
    if (!usuario) return;
    await marcarTodasLeidas(usuario.id);
    cargar();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificaciones">
          <Bell className="h-4 w-4" />
          {noLeidas > 0 && (
            <Badge variant="rejected" className="absolute -right-1 -top-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]">
              {noLeidas > 9 ? "9+" : noLeidas}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          Notificaciones
          {noLeidas > 0 && (
            <button className="text-xs font-normal text-muted-foreground hover:underline" onClick={marcarTodas}>
              Marcar todas leídas
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notificaciones.length === 0 && (
          <div className="p-3 text-center text-sm text-muted-foreground">No tienes notificaciones.</div>
        )}
        <div className="max-h-80 overflow-y-auto">
          {notificaciones.map((n) => (
            <DropdownMenuItem
              key={n.id}
              className={`flex flex-col items-start gap-0.5 whitespace-normal ${n.leida ? "" : "bg-accent/50"}`}
              onClick={() => abrir(n)}
            >
              <span className="text-sm">{n.mensaje}</span>
              <span className="text-xs text-muted-foreground">
                {formatearFechaHora(n.creadaEn)}
              </span>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
