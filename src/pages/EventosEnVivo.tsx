import * as React from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";
import { traerCodigosAccesoActivos, type CodigoAccesoConEvento } from "@/lib/ejecucion";
import { traerEventos } from "@/lib/evento";
import { mensajeErrorAmigable } from "@/lib/supabaseClient";
import { useCompania, filtrarPorEmpresaGrupo } from "@/hooks/useCompania";
import type { Evento } from "@/types";

/**
 * "Eventos en Vivo (mapa por país)" según el plan original — no hay
 * evidencia en el bundle de ninguna librería de mapas (el stack confirmado
 * es React+Vite+TS+Tailwind+shadcn/Radix+lucide+sonner+supabase-js, sin
 * ningún paquete de mapas), así que se reconstruye como un agrupado visual
 * por país en vez de un mapa geográfico real — mismo dato, sin inventar una
 * dependencia que no está confirmada. Documentado como simplificación
 * deliberada, igual que otras decisiones de esta reconstrucción cuando no
 * hay evidencia directa del bundle.
 */
export function EventosEnVivo() {
  const { companiaActual } = useCompania();
  const [codigos, setCodigos] = React.useState<CodigoAccesoConEvento[]>([]);
  const [eventos, setEventos] = React.useState<Evento[]>([]);
  const [cargando, setCargando] = React.useState(true);

  React.useEffect(() => {
    Promise.all([traerCodigosAccesoActivos(), traerEventos()])
      .then(([c, e]) => {
        // Selector de compañía del grupo (pedido explícito, octubre 2026):
        // solo se muestran eventos en vivo de la compañía actual.
        setCodigos(c);
        setEventos(filtrarPorEmpresaGrupo(e, companiaActual));
      })
      .catch((error) => toast.error(mensajeErrorAmigable(error)))
      .finally(() => setCargando(false));
  }, [companiaActual]);

  const eventosActivos = codigos
    .map((c) => eventos.find((e) => e.id === c.eventoId))
    .filter((e): e is Evento => Boolean(e));

  const porPais = new Map<string, Evento[]>();
  for (const e of eventosActivos) {
    const pais = e.pais || "Sin país";
    const lista = porPais.get(pais);
    if (lista) lista.push(e);
    else porPais.set(pais, [e]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Eventos en Vivo</h1>
        <p className="text-sm text-muted-foreground">
          Eventos con un código de acceso de Ejecución en Sitio activo en este momento, agrupados por país.
        </p>
      </div>

      {cargando && <p className="text-sm text-muted-foreground">Cargando...</p>}
      {!cargando && porPais.size === 0 && (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">No hay ningún evento en ejecución en este momento.</CardContent></Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from(porPais.entries()).map(([pais, lista]) => (
          <Card key={pais}>
            <CardHeader className="flex flex-row items-center gap-2 space-y-0">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">{pais}</CardTitle>
              <Badge variant="secondary" className="ml-auto">{lista.length}</Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {lista.map((e) => (
                <div key={e.id} className="rounded-md border p-2 text-sm">
                  <div className="font-medium">{e.nombreEvento}</div>
                  <div className="text-xs text-muted-foreground">{[e.ciudad, e.pais].filter(Boolean).join(", ")} · {e.empresaGrupo}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
