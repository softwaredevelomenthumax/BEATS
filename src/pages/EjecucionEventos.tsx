import * as React from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { traerEjecucionEventosAgregada, type FilaEjecucionEvento } from "@/lib/informes";
import { mensajeErrorAmigable } from "@/lib/supabaseClient";
import { formatearFecha } from "@/lib/fecha";
import { ubicacionTexto } from "@/lib/ubicacionVisible";
import { useCompania, filtrarPorEmpresaGrupo } from "@/hooks/useCompania";

export function EjecucionEventos() {
  const { companiaActual } = useCompania();
  const [filas, setFilas] = React.useState<FilaEjecucionEvento[]>([]);
  const [cargando, setCargando] = React.useState(true);

  React.useEffect(() => {
    // Selector de compañía del grupo (pedido explícito, octubre 2026): la
    // agregación por evento ya trae `empresaGrupo` directo, así que se
    // filtra aquí igual que cualquier otra lista de eventos.
    traerEjecucionEventosAgregada()
      .then((filas) => setFilas(filtrarPorEmpresaGrupo(filas, companiaActual)))
      .catch((error) => toast.error(mensajeErrorAmigable(error)))
      .finally(() => setCargando(false));
  }, [companiaActual]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Ejecución de Eventos</h1>
        <p className="text-sm text-muted-foreground">
          Totales de participación y muestras entregadas por cada evento ya Aprobado o Completado.
        </p>
      </div>

      <Card>
        {/* AJUSTES (septiembre/octubre 2026): `overflow-x-auto` — ver la nota
            en `UsuariosRoles.tsx`. */}
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-3 font-medium">Evento</th>
                <th className="p-3 font-medium">Empresa</th>
                <th className="p-3 font-medium">Ubicación</th>
                <th className="p-3 font-medium">Fecha</th>
                <th className="p-3 font-medium">Participantes</th>
                <th className="p-3 font-medium">Muestras entregadas</th>
              </tr>
            </thead>
            <tbody>
              {cargando && <tr><td className="p-3 text-muted-foreground" colSpan={6}>Cargando...</td></tr>}
              {!cargando && filas.length === 0 && (
                <tr><td className="p-3 text-muted-foreground" colSpan={6}>Todavía no hay eventos Aprobados o Completados.</td></tr>
              )}
              {filas.map((f) => (
                <tr key={f.eventoId} className="border-b last:border-0">
                  <td className="p-3 font-medium">{f.nombreEvento}</td>
                  <td className="p-3 text-muted-foreground">{f.empresaGrupo}</td>
                  <td className="p-3 text-muted-foreground">{ubicacionTexto([f.ciudad, f.pais]) || "—"}</td>
                  <td className="p-3 text-muted-foreground">{formatearFecha(f.fechaInicioEvento)}</td>
                  <td className="p-3">{f.totalParticipantes}</td>
                  <td className="p-3">{f.totalMuestras}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
