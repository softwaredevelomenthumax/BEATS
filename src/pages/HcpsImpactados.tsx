import * as React from "react";
import { toast } from "sonner";
import { CalendarDays, Globe, CalendarCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { traerHcpsImpactados, nombreEventoPorId, type HcpImpactado } from "@/lib/informes";
import { traerEventos } from "@/lib/evento";
import { ubicacionTexto } from "@/lib/ubicacionVisible";
import { traerPaises } from "@/lib/paisesRegion";
import { useCompania, filtrarPorEmpresaGrupo } from "@/hooks/useCompania";
import { mensajeErrorAmigable } from "@/lib/supabaseClient";
import { formatearFecha } from "@/lib/fecha";
import type { Evento } from "@/types";
import { TableroHcps } from "@/components/hcps/TableroHcps";

const TODOS_PAISES = "__todos__";
const TODOS_EVENTOS = "__todos_eventos__";
/** Entrega 21: el filtro "Evento" lista los eventos ya aprobados (Aprobado y Completado). */
const ESTADOS_APROBADOS = new Set(["Aprobado", "Completado"]);

/**
 * Fase 6 (Tablero, Informes y Auditoría enriquecidos) — se agrega filtro
 * por período (sobre la fecha real de cada registro de participación) y
 * por país, el enriquecimiento confirmado para este informe.
 *
 * Nota de alcance (documentada, no un olvido): la extracción forense del
 * bundle original mostró que la versión real de "Informe de Asistentes
 * Impactados" tiene un diseño distinto — agregados POR EVENTO/CATEGORÍA
 * (personal médico/no médico/otro personal/fuerza de ventas, tomados del
 * conteo manual de la Lista de Asistencia), con el check-in digital de
 * Ejecución en Sitio como una cifra aparte e independiente — en vez del
 * agrupado POR HCP/cédula que ya existía en esta reconstrucción. Rehacer
 * la pantalla desde cero para esa otra forma de agregación es un cambio de
 * diseño mayor, no un "enriquecimiento" — se deja fuera de esta fase y se
 * documenta aquí para una fase posterior. El agrupado por HCP que ya existe
 * sigue siendo un reporte de trazabilidad válido (qué profesionales de la
 * salud fueron impactados, para efectos de reporte de transferencias de
 * valor), así que se conserva y se enriquece con los mismos filtros que el
 * resto de los informes de esta fase.
 */
export function HcpsImpactados() {
  const { companiaActual } = useCompania();
  const [hcps, setHcps] = React.useState<HcpImpactado[]>([]);
  const [eventos, setEventos] = React.useState<Evento[]>([]);
  const [paises, setPaises] = React.useState<string[]>([]);
  const [cargando, setCargando] = React.useState(true);
  const [busqueda, setBusqueda] = React.useState("");
  const [desde, setDesde] = React.useState("");
  const [hasta, setHasta] = React.useState("");
  const [filtroPais, setFiltroPais] = React.useState<string>(TODOS_PAISES);
  const [filtroEvento, setFiltroEvento] = React.useState<string>(TODOS_EVENTOS);

  function consultar(eventoElegido: string = filtroEvento) {
    setCargando(true);
    Promise.all([
      traerHcpsImpactados({ desde: desde || undefined, hasta: hasta || undefined, pais: filtroPais === TODOS_PAISES ? undefined : filtroPais, eventoId: eventoElegido === TODOS_EVENTOS ? undefined : eventoElegido }),
      traerEventos(),
      traerPaises(),
    ])
      .then(([h, e, p]) => {
        setHcps(h);
        setEventos(e);
        setPaises(p);
      })
      .catch((error) => toast.error(mensajeErrorAmigable(error)))
      .finally(() => setCargando(false));
  }

  React.useEffect(() => consultar(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function limpiarFiltro() {
    setDesde("");
    setHasta("");
    setFiltroPais(TODOS_PAISES);
    setFiltroEvento(TODOS_EVENTOS);
  }

  function elegirEvento(id: string) {
    setFiltroEvento(id);
    consultar(id); // el evento filtra de inmediato, sin tener que pulsar "Filtrar"
  }

  // Selector de compañía del grupo (pedido explícito, octubre 2026): un HCP
  // no tiene su propio `empresaGrupo` (puede participar en eventos de más
  // de una compañía) — se filtra por si al menos uno de sus eventos
  // (`eventosIds`) quedó dentro de los eventos de la compañía actual.
  const eventosDeCompania = filtrarPorEmpresaGrupo(eventos, companiaActual);
  const idsEventosDeCompania = new Set(eventosDeCompania.map((e) => e.id));
  const eventosAprobados = eventosDeCompania
    .filter((e) => ESTADOS_APROBADOS.has(e.estado))
    .sort((a, b) => a.nombreEvento.localeCompare(b.nombreEvento, "es", { sensitivity: "base" }));
  const eventoSeleccionado = eventos.find((e) => e.id === filtroEvento) ?? null;
  const filtrados = hcps
    .filter((h) => !companiaActual || h.eventosIds.some((id) => idsEventosDeCompania.has(id)))
    .filter((h) => {
      const q = busqueda.trim().toLowerCase();
      if (!q) return true;
      return h.nombreCompleto.toLowerCase().includes(q) || h.cedula.includes(q) || h.especialidad.toLowerCase().includes(q);
    });

  const totalParticipaciones = filtrados.reduce((acc, h) => acc + h.totalParticipaciones, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Asistentes Impactados</h1>
        <p className="text-sm text-muted-foreground">
          Profesionales de la salud que registraron participación en al menos un evento ejecutado, agrupados por cédula.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hcp-evento" className="flex items-center gap-1"><CalendarCheck className="h-3 w-3" /> Evento</Label>
            <Select value={filtroEvento} onValueChange={elegirEvento}>
              <SelectTrigger id="hcp-evento" className="h-9 w-72" data-testid="hcp-filtro-evento"><SelectValue placeholder="Evento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS_EVENTOS}>Todos los eventos aprobados</SelectItem>
                {eventosAprobados.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.nombreEvento}{e.ciudad ? ` — ${ubicacionTexto([e.ciudad, e.pais])}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hcp-desde" className="flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Desde</Label>
            <Input id="hcp-desde" type="date" className="h-9 w-40" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hcp-hasta">Hasta</Label>
            <Input id="hcp-hasta" type="date" className="h-9 w-40" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hcp-pais" className="flex items-center gap-1"><Globe className="h-3 w-3" /> País</Label>
            <Select value={filtroPais} onValueChange={setFiltroPais}>
              <SelectTrigger id="hcp-pais" className="h-9 w-44"><SelectValue placeholder="País" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS_PAISES}>Todos los países</SelectItem>
                {paises.map((pais) => (
                  <SelectItem key={pais} value={pais}>{pais}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={() => consultar()}>Filtrar</Button>
          <Button size="sm" variant="ghost" onClick={() => { limpiarFiltro(); }}>Limpiar</Button>
          <Badge variant="secondary" className="ml-auto">{filtrados.length} HCP(s) · {totalParticipaciones} participación(es)</Badge>
        </CardContent>
      </Card>

      {eventoSeleccionado && (
        <p className="text-sm text-muted-foreground" data-testid="hcp-evento-activo">
          Mostrando los HCPs impactados en <b className="text-foreground">{eventoSeleccionado.nombreEvento}</b>; las participaciones corresponden solo a ese evento.
        </p>
      )}

      {!cargando && <TableroHcps hcps={filtrados} totalEventos={eventosAprobados.length} />}

      <h2 className="-mb-2 text-sm font-semibold text-slate-700">Detalle por profesional</h2>
      <Input placeholder="Buscar por nombre, cédula o especialidad..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="max-w-sm" />

      <Card>
        {/* AJUSTES (septiembre/octubre 2026): `overflow-x-auto` — ver la nota
            en `UsuariosRoles.tsx`. */}
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-3 font-medium">HCP</th>
                <th className="p-3 font-medium">Profesión / especialidad</th>
                <th className="p-3 font-medium">Ubicación</th>
                <th className="p-3 font-medium">Participaciones</th>
                <th className="p-3 font-medium">Eventos</th>
                <th className="p-3 font-medium">Última participación</th>
              </tr>
            </thead>
            <tbody>
              {cargando && <tr><td className="p-3 text-muted-foreground" colSpan={6}>Cargando...</td></tr>}
              {!cargando && filtrados.length === 0 && (
                <tr><td className="p-3 text-muted-foreground" colSpan={6}>Todavía no hay registros de participación de HCPs con estos filtros.</td></tr>
              )}
              {filtrados.map((h) => (
                <tr key={h.cedula} className="border-b last:border-0">
                  <td className="p-3">
                    <div className="font-medium">{h.nombreCompleto}</div>
                    <div className="text-xs text-muted-foreground">{h.cedula}</div>
                  </td>
                  <td className="p-3">{h.profesion}{h.especialidad ? ` · ${h.especialidad}` : ""}</td>
                  <td className="p-3 text-muted-foreground">{ubicacionTexto([h.ciudad, h.pais]) || "—"}</td>
                  <td className="p-3"><Badge variant="secondary">{h.totalParticipaciones}</Badge></td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {h.eventosIds.map((id) => nombreEventoPorId(eventos, id)).join(", ")}
                  </td>
                  <td className="p-3 text-muted-foreground">{formatearFecha(h.ultimaParticipacion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
