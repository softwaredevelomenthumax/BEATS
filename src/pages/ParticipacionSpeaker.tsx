import * as React from "react";
import { toast } from "sonner";
import { Users, Download, CalendarDays, Globe } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAbrirDocumentoGenerico } from "@/hooks/useAbrirDocumentoGenerico";
import { useCompania, filtrarPorEmpresaGrupo, filtrarPorEventoOrigen } from "@/hooks/useCompania";
import { traerSpeakers } from "@/lib/speakers";
import { idsSpeakersDeEmpresa } from "@/lib/speakersEmpresa";
import { traerConvenios } from "@/lib/convenio";
import { traerEventos } from "@/lib/evento";
import { traerPaises } from "@/lib/paisesRegion";
import { construirCSV, descargarCSV } from "@/lib/csv";
import { EtiquetaTamano } from "@/components/ui/etiqueta-tamano";
import { bytesDeCsv } from "@/lib/tamanoEstimado";
import { mensajeErrorAmigable } from "@/lib/supabaseClient";
import { formatearFecha } from "@/lib/fecha";
import type { Convenio, Evento, Speaker } from "@/types";
import type { EstadoDoc } from "@/lib/enums";
import { mismoPais } from "@/lib/paisCanonico";

const TODOS_LOS_SPEAKERS = "__todos__";
const SIN_SELECCION = "__sin_seleccion__";
const TODOS_PAISES = "__todos__";

const VARIANTE_POR_ESTADO: Record<EstadoDoc, BadgeProps["variant"]> = {
  Borrador: "draft",
  Pendiente: "pending",
  Aprobado: "approved",
  Rechazado: "rejected",
  Devuelto: "draft",
  Completado: "completed",
  Anulado: "cancelled",
};

function formatearRango(inicio: string, fin: string): string {
  if (!fin || fin === inicio) return formatearFecha(inicio);
  return `${formatearFecha(inicio)} – ${formatearFecha(fin)}`;
}

interface FilaParticipacion {
  speaker: Speaker;
  convenio: Convenio;
  evento?: Evento;
  inicio: string;
  fin: string;
}

/**
 * Fase 6 (Tablero, Informes y Auditoría enriquecidos) — "Participación de
 * HCPs/Speakers" (id de página `informe-participacion-speaker`): en qué
 * eventos participó un speaker (o todos) en un período determinado, a
 * partir de sus Convenios de Pago a HCP vinculados — confirmado por
 * extracción directa del bundle original (función `TV`). Antes de esta
 * fase caía en el placeholder genérico pese a que `navegacion.ts` ya tenía
 * su título/subtítulo correctos.
 */
export function ParticipacionSpeaker() {
  const { companiaActual } = useCompania();
  const [todosSpeakers, setTodosSpeakers] = React.useState<Speaker[] | null>(null);
  const [convenios, setConvenios] = React.useState<Convenio[] | null>(null);
  const [eventos, setEventos] = React.useState<Evento[] | null>(null);
  const [paises, setPaises] = React.useState<string[]>([]);

  const [speakerId, setSpeakerId] = React.useState("");
  const [desde, setDesde] = React.useState("");
  const [hasta, setHasta] = React.useState("");
  const [filtroPais, setFiltroPais] = React.useState<string>(TODOS_PAISES);

  const { abrir, dialogos } = useAbrirDocumentoGenerico();

  React.useEffect(() => {
    Promise.all([traerSpeakers(), traerConvenios(), traerEventos(), traerPaises()])
      .then(([s, c, e, p]) => {
        setTodosSpeakers(s);
        setConvenios(c);
        setEventos(e);
        setPaises(p);
      })
      .catch((error) => toast.error(mensajeErrorAmigable(error)));
  }, []);

  // Octubre 2026: solo speakers asociados a la empresa del grupo con la que se trabaja en la sesión (ver `lib/speakersEmpresa.ts`).
  const speakers = React.useMemo(() => {
    if (!todosSpeakers) return null;
    const ids = idsSpeakersDeEmpresa({ empresa: companiaActual, speakers: todosSpeakers, eventos: eventos ?? [], convenios: convenios ?? [] });
    return ids ? todosSpeakers.filter((s) => ids.has(s.id)) : todosSpeakers;
  }, [todosSpeakers, eventos, convenios, companiaActual]);

  const cargando = speakers === null || convenios === null || eventos === null;

  // Si el speaker elegido deja de estar asociado (cambio de empresa), se limpia la selección.
  React.useEffect(() => {
    if (speakers && speakerId && speakerId !== TODOS_LOS_SPEAKERS && !speakers.some((s) => s.id === speakerId)) setSpeakerId("");
  }, [speakers, speakerId]);

  const speakersOrdenados = React.useMemo(() => [...(speakers ?? [])].sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto)), [speakers]);

  const esTodos = speakerId === TODOS_LOS_SPEAKERS;
  const speakerSeleccionado = !esTodos && speakerId ? speakers?.find((s) => s.id === speakerId) : undefined;
  const speakersActivos = esTodos ? speakersOrdenados : speakerSeleccionado ? [speakerSeleccionado] : [];

  const filas = React.useMemo<FilaParticipacion[]>(() => {
    if (speakersActivos.length === 0 || !convenios || !eventos) return [];
    // Selector de compañía del grupo (pedido explícito, octubre 2026): solo
    // se reporta participación en eventos/convenios de la compañía actual.
    const eventosDeCompania = filtrarPorEmpresaGrupo(eventos, companiaActual);
    const idsEventosDeCompania = new Set(eventosDeCompania.map((e) => e.id));
    const conveniosDeCompania = filtrarPorEventoOrigen(convenios, idsEventosDeCompania);
    const idsActivos = new Map(speakersActivos.map((s) => [s.id, s]));
    return conveniosDeCompania
      .filter((c) => c.speakerId && idsActivos.has(c.speakerId))
      .map((c) => {
        const evento = c.eventoOrigenId ? eventosDeCompania.find((e) => e.id === c.eventoOrigenId) : undefined;
        return {
          speaker: idsActivos.get(c.speakerId)!,
          convenio: c,
          evento,
          inicio: c.fechaInicioActividad || evento?.fechaInicioEvento || "",
          fin: c.fechaFinActividad || evento?.fechaFinEvento || "",
        };
      })
      .filter((f) => (f.inicio ? !((desde && f.inicio < desde) || (hasta && f.inicio > hasta)) : !desde && !hasta))
      .filter((f) => filtroPais === TODOS_PAISES || mismoPais(f.evento?.pais, filtroPais))
      .sort((a, b) => (b.inicio || "").localeCompare(a.inicio || "") || a.speaker.nombreCompleto.localeCompare(b.speaker.nombreCompleto));
  }, [speakersActivos, convenios, eventos, desde, hasta, filtroPais, companiaActual]);

  function limpiarFiltro() {
    setDesde("");
    setHasta("");
  }

  const ENCABEZADOS_CSV = ["Speaker", "Especialidad", "Evento/Servicio", "Inicio", "Fin", "Tipo de servicio", "Estado del Convenio"];
  const cuerpoCsv = () => filas.map((f) => [
      f.speaker.nombreCompleto,
      f.speaker.especialidad,
      f.evento?.nombreEvento || f.convenio.nombreEventoServicio || "(sin nombre)",
      f.inicio,
      f.fin,
      f.convenio.tipoServicio,
      f.convenio.estado,
    ]);
  const bytesCsv = React.useMemo(() => bytesDeCsv(ENCABEZADOS_CSV, cuerpoCsv()), [filas]); // eslint-disable-line react-hooks/exhaustive-deps

  function exportarCSV() {
    if (speakersActivos.length === 0) return;
    const csv = construirCSV(ENCABEZADOS_CSV, cuerpoCsv());
    const nombre = esTodos
      ? `Participación de Speakers — ${new Date().toISOString().slice(0, 10)}.csv`
      : `Participación de ${speakerSeleccionado?.nombreCompleto} — ${new Date().toISOString().slice(0, 10)}.csv`;
    descargarCSV(nombre, csv);
  }

  return (
    <div className="mx-auto flex max-w-full flex-col gap-5">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-base">Participación de un Speaker por Período</CardTitle>
            <CardDescription>
              Elige un speaker del Repositorio (o "Todos los speakers" para el informe completo) y un rango de fechas, para ver en qué eventos
              ejecutados participó, a partir de sus Convenios de Pago a HCP vinculados.
            </CardDescription>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={exportarCSV} disabled={speakersActivos.length === 0 || filas.length === 0}>
              <Download className="h-3.5 w-3.5" /> Exportar CSV
            </Button>
            <EtiquetaTamano bytes={filas.length === 0 ? null : bytesCsv} testId="participacion-tamano-csv" />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-col gap-1.5">
              <Label htmlFor="ps-speaker">Speaker</Label>
              <Select value={speakerId || SIN_SELECCION} onValueChange={(v) => setSpeakerId(v === SIN_SELECCION ? "" : v)}>
                <SelectTrigger id="ps-speaker" className="h-9"><SelectValue placeholder="Selecciona un speaker" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_SELECCION}>Selecciona un speaker…</SelectItem>
                  <SelectItem value={TODOS_LOS_SPEAKERS}>Todos los speakers (informe completo)</SelectItem>
                  {speakersOrdenados.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nombreCompleto}{s.especialidad ? ` — ${s.especialidad}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ps-desde" className="flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Desde</Label>
              <Input id="ps-desde" type="date" className="h-9 w-40" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ps-hasta">Hasta</Label>
              <Input id="ps-hasta" type="date" className="h-9 w-40" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
            <Button size="sm" variant="outline" onClick={limpiarFiltro} disabled={!desde && !hasta}>Limpiar filtro</Button>
            <div className="ml-auto flex flex-col gap-1.5">
              <Label htmlFor="ps-pais" className="flex items-center gap-1"><Globe className="h-3 w-3" /> País del evento</Label>
              <Select value={filtroPais} onValueChange={setFiltroPais}>
                <SelectTrigger id="ps-pais" className="h-9 w-44"><SelectValue placeholder="País" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS_PAISES}>Todos los países</SelectItem>
                  {paises.map((pais) => (
                    <SelectItem key={pais} value={pais}>{pais}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {cargando && <p className="text-sm text-muted-foreground">Cargando...</p>}

          {!cargando && speakersActivos.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-14 text-center">
              <Users className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm font-medium">Selecciona un speaker (o "Todos los speakers") para ver su participación</p>
            </div>
          )}

          {!cargando && speakersActivos.length > 0 && filas.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-14 text-center">
              <Users className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm font-medium">
                {esTodos
                  ? `Ningún speaker tiene eventos registrados ${desde || hasta ? "en este período" : "todavía"}`
                  : `${speakerSeleccionado?.nombreCompleto} no tiene eventos registrados ${desde || hasta ? "en este período" : "todavía"}`}
              </p>
            </div>
          )}

          {!cargando && filas.length > 0 && (
            <div className="flex flex-col gap-2">
              {esTodos && (
                <p className="text-[13px] text-muted-foreground">
                  {filas.length} participación(es) de {new Set(filas.map((f) => f.speaker.id)).size} speaker(s).
                </p>
              )}
              {filas.map((f) => (
                <div key={f.convenio.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{f.evento?.nombreEvento || f.convenio.nombreEventoServicio || "(sin nombre)"}</p>
                      <p className="text-xs text-muted-foreground">
                        {esTodos && <span className="font-medium">{f.speaker.nombreCompleto} · </span>}
                        {f.inicio ? formatearRango(f.inicio, f.fin || f.inicio) : "Sin fecha registrada"} · {f.convenio.tipoServicio || "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={VARIANTE_POR_ESTADO[f.convenio.estado]}>{f.convenio.estado}</Badge>
                      <button type="button" onClick={() => abrir(f.evento ?? f.convenio)} className="text-xs font-medium text-primary hover:underline">
                        {f.evento ? "Ver evento" : "Ver convenio"}
                      </button>
                    </div>
                  </div>
                  {f.convenio.fechaInicioActividad && (
                    <p className="mt-1.5 text-[13px] text-muted-foreground">
                      Actividad diligenciada en el Convenio: {formatearFecha(f.convenio.fechaInicioActividad)}
                      {f.convenio.fechaFinActividad && f.convenio.fechaFinActividad !== f.convenio.fechaInicioActividad
                        ? ` — ${formatearFecha(f.convenio.fechaFinActividad)}`
                        : ""}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {dialogos}
    </div>
  );
}
