import * as React from "react";
import { toast } from "sonner";
import { CheckCircle2, XCircle, MinusCircle, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VisorArchivo } from "@/components/archivos/VisorArchivo";
import { traerEventos, evaluarYCompletarEventosVencidos } from "@/lib/evento";
import { useAuth } from "@/hooks/useAuth";
import { useCompania, filtrarPorEmpresaGrupo } from "@/hooks/useCompania";
import { traerConvenios } from "@/lib/convenio";
import { traerFmvs } from "@/lib/fmv";
import { traerNotificacionesPago } from "@/lib/notificacionPago";
import { traerCafs } from "@/lib/caf";
import { traerTodosLosArchivosRepositorio, traerTodosLosRegistrosFinancieros } from "@/lib/repositorioEvento";
import { traerPaises } from "@/lib/paisesRegion";
import {
  construirChecklistEvento,
  sesionesEjecutadas,
  type EstadoItemChecklist,
} from "@/lib/documentosRequeridosEvento";
import { mensajeErrorAmigable } from "@/lib/supabaseClient";
import { formatearFecha } from "@/lib/fecha";
import { useAbrirDocumentoGenerico } from "@/hooks/useAbrirDocumentoGenerico";
import { EnviarDocumentosEvento } from "@/components/EnviarDocumentosEvento";
import type { Caf, Convenio, Evento, Fmv, NotificacionPagoHcp, RegistroFinancieroEvento, RepositorioArchivoEvento } from "@/types";
import { mismoPais } from "@/lib/paisCanonico";

const TODOS_PAISES = "__todos__";

function formatearRango(inicio: string | null, fin: string | null): string {
  if (!inicio) return "Sin fecha";
  if (!fin || fin === inicio) return formatearFecha(inicio);
  return `${formatearFecha(inicio)} – ${formatearFecha(fin)}`;
}

function IconoEstadoItem({ estado }: { estado: EstadoItemChecklist }) {
  if (estado === "presente") return <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "var(--status-approved-fg)" }} />;
  if (estado === "faltante") return <XCircle className="h-3.5 w-3.5" style={{ color: "var(--status-rejected-fg)" }} />;
  return <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" />;
}

/**
 * Fase 6 (Tablero, Informes y Auditoría enriquecidos) — la pantalla real
 * detrás del id de página `auditoria` ("Auditoría de Eventos"): un
 * checklist de qué documentos existen y cuáles faltan por evento, filtrado
 * por rango de fechas y país — confirmado por extracción directa del
 * bundle original (función `lB`). Antes de esta fase, este id de página
 * mostraba por error el log cronológico que en realidad es "Historial y
 * Auditoría" (ver `Historial.tsx` y su comentario para el detalle del
 * cruce de nombres).
 *
 * El checklist en sí (qué cuenta como "falta" para cada evento) vive en
 * `lib/documentosRequeridosEvento.ts` — compartido con Tareas Pendientes,
 * que usa las mismas reglas para decidir qué tareas mostrarle a Dirección
 * Médica.
 */
export function AuditoriaEventos() {
  const { usuario } = useAuth();
  const { companiaActual } = useCompania();
  const [eventos, setEventos] = React.useState<Evento[] | null>(null);
  const [convenios, setConvenios] = React.useState<Convenio[] | null>(null);
  const [fmvs, setFmvs] = React.useState<Fmv[] | null>(null);
  const [notificaciones, setNotificaciones] = React.useState<NotificacionPagoHcp[] | null>(null);
  const [cafs, setCafs] = React.useState<Caf[] | null>(null);
  const [archivosRepo, setArchivosRepo] = React.useState<RepositorioArchivoEvento[] | null>(null);
  const [financierosRepo, setFinancierosRepo] = React.useState<RegistroFinancieroEvento[] | null>(null);
  const [paises, setPaises] = React.useState<string[]>([]);

  const [desde, setDesde] = React.useState("");
  const [hasta, setHasta] = React.useState("");
  const [filtroPais, setFiltroPais] = React.useState<string>(TODOS_PAISES);
  const [expandido, setExpandido] = React.useState<string | null>(null);

  function cargarTodo() {
    Promise.all([
      traerEventos(),
      traerConvenios(),
      traerFmvs(),
      traerNotificacionesPago(),
      traerCafs(),
      traerTodosLosArchivosRepositorio(),
      traerTodosLosRegistrosFinancieros(),
      traerPaises(),
    ])
      .then(async ([e, c, f, n, ca, ar, fr, p]) => {
        // A12 (ronda de instrucciones históricas, cluster A): esta pantalla
        // ya trae exactamente lo que la regla automática de "Completado"
        // necesita (el mismo checklist que arma su propia tabla), así que
        // es el punto natural para evaluarla — sin fetches adicionales. Si
        // algún evento se completó, se vuelve a traer para reflejarlo.
        let eventosFinal = e;
        if (usuario) {
          const completados = await evaluarYCompletarEventosVencidos(
            e,
            { convenios: c, fmvs: f, notificaciones: n, cafs: ca, archivosRepo: ar, financierosRepo: fr },
            usuario.id,
          ).catch(() => []);
          if (completados.length > 0) eventosFinal = await traerEventos().catch(() => e);
        }
        setEventos(eventosFinal);
        setConvenios(c);
        setFmvs(f);
        setNotificaciones(n);
        setCafs(ca);
        setArchivosRepo(ar);
        setFinancierosRepo(fr);
        setPaises(p);
      })
      .catch((error) => toast.error(mensajeErrorAmigable(error)));
  }

  React.useEffect(cargarTodo, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { abrir, dialogos } = useAbrirDocumentoGenerico(cargarTodo);

  const cargando = eventos === null || convenios === null || fmvs === null || notificaciones === null || cafs === null || archivosRepo === null || financierosRepo === null;

  const eventosFiltrados = React.useMemo(() => {
    if (!eventos) return [];
    // Selector de compañía del grupo (pedido explícito, octubre 2026): solo
    // se auditan los eventos de la compañía con la que se está trabajando.
    return filtrarPorEmpresaGrupo(eventos, companiaActual)
      .filter((e) => {
        if (!e.fechaInicioEvento) return !desde && !hasta;
        if (desde && e.fechaInicioEvento < desde) return false;
        if (hasta && e.fechaInicioEvento > hasta) return false;
        return true;
      })
      .filter((e) => filtroPais === TODOS_PAISES || mismoPais(e.pais, filtroPais))
      .sort((a, b) => (b.fechaInicioEvento || "").localeCompare(a.fechaInicioEvento || ""));
  }, [eventos, desde, hasta, filtroPais, companiaActual]);

  function limpiarFiltro() {
    setDesde("");
    setHasta("");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Auditoría de Eventos</h1>
        <p className="text-sm text-muted-foreground">
          Filtra los eventos por rango de fechas para facilitar auditorías y monitoreo de Compliance, accede directamente a los archivos de cada
          evento, y verifica qué documentos existen y cuáles faltan por evento.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ae-desde">Desde</Label>
              <Input id="ae-desde" type="date" className="h-9 w-40" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ae-hasta">Hasta</Label>
              <Input id="ae-hasta" type="date" className="h-9 w-40" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
            <Button size="sm" variant="outline" onClick={limpiarFiltro} disabled={!desde && !hasta}>
              Limpiar filtro
            </Button>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ae-pais">País</Label>
              <Select value={filtroPais} onValueChange={setFiltroPais}>
                <SelectTrigger id="ae-pais" className="h-9 w-44"><SelectValue placeholder="País" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS_PAISES}>Todos los países</SelectItem>
                  {paises.map((pais) => (
                    <SelectItem key={pais} value={pais}>{pais}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span className="ml-auto text-xs text-muted-foreground">
              {eventosFiltrados.length} evento(s) {desde || hasta ? "en el rango seleccionado" : "en total"} · filtrado por fecha del evento
            </span>
          </div>

          {cargando && <p className="text-sm text-muted-foreground">Cargando...</p>}

          {!cargando && eventosFiltrados.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">No hay eventos en el rango de fechas seleccionado</p>
          )}

          {!cargando && eventosFiltrados.length > 0 && (
            <div className="flex flex-col gap-2">
              {eventosFiltrados.map((evento) => {
                const checklist = construirChecklistEvento(evento, {
                  convenios: convenios!,
                  fmvs: fmvs!,
                  notificaciones: notificaciones!,
                  cafs: cafs!,
                  archivosRepo: archivosRepo!,
                  financierosRepo: financierosRepo!,
                });
                const faltantes = checklist.filter((i) => i.estado === "faltante").length;
                const progreso = sesionesEjecutadas(evento, archivosRepo!);
                const abierto = expandido === evento.id;
                return (
                  <div key={evento.id} className="rounded-lg border">
                    <button
                      type="button"
                      onClick={() => setExpandido(abierto ? null : evento.id)}
                      className="flex w-full items-center justify-between gap-3 p-3 text-left"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{evento.nombreEvento || "(sin nombre)"}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatearRango(evento.fechaInicioEvento, evento.fechaFinEvento)} · {evento.nombreSolicitante}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {progreso && (
                          <span
                            className="rounded-full px-2.5 py-1 text-[13px] font-semibold"
                            style={{
                              background: progreso.ejecutadas === progreso.total ? "var(--status-approved-bg)" : "hsl(var(--accent))",
                              color: progreso.ejecutadas === progreso.total ? "var(--status-approved-fg)" : "hsl(var(--accent-foreground))",
                            }}
                          >
                            {progreso.ejecutadas}/{progreso.total} sesiones ejecutadas
                          </span>
                        )}
                        {faltantes > 0 ? (
                          <span className="rounded-full px-2.5 py-1 text-[13px] font-semibold" style={{ background: "var(--status-rejected-bg)", color: "var(--status-rejected-fg)" }}>
                            {faltantes} documento(s) faltante(s)
                          </span>
                        ) : (
                          <span className="rounded-full px-2.5 py-1 text-[13px] font-semibold" style={{ background: "var(--status-approved-bg)", color: "var(--status-approved-fg)" }}>
                            Paquete completo
                          </span>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={(e) => {
                            e.stopPropagation();
                            abrir(evento);
                          }}
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> Ir al evento
                        </Button>
                        {/* Entrega 35: misma ventana y paquete que «Enviar documentos» del Convenio HCP (solo Dirección Médica, evento Aprobado/Completado). */}
                        <EnviarDocumentosEvento evento={evento} />
                      </div>
                    </button>
                    {abierto && (
                      <div className="border-t px-3 py-3">
                        <p className="mb-2 text-[13px] font-medium uppercase tracking-wide text-muted-foreground">Documentos del paquete de cierre</p>
                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                          {checklist.map((item) => (
                            <div key={item.etiqueta} className="flex flex-col gap-1 rounded-md border px-2.5 py-1.5 text-xs">
                              <div className="flex items-center justify-between gap-2">
                                <span className="flex items-center gap-1.5">
                                  <IconoEstadoItem estado={item.estado} /> {item.etiqueta}
                                </span>
                                {item.estado === "no_aplica" ? (
                                  <span className="text-muted-foreground">No aplica</span>
                                ) : item.documentoParaAbrir ? (
                                  <button type="button" onClick={() => abrir(item.documentoParaAbrir!)} className="font-medium text-primary hover:underline">
                                    Consultar
                                  </button>
                                ) : item.archivoIds && item.archivoIds.length === 1 ? (
                                  <VisorArchivo archivoId={item.archivoIds[0]} etiqueta="Consultar" size="sm" variant="ghost" />
                                ) : item.archivoIds ? null : (
                                  <span style={{ color: item.estado === "faltante" ? "var(--status-rejected-fg)" : undefined }} className={item.estado !== "faltante" ? "text-muted-foreground" : undefined}>
                                    {item.estado === "faltante" ? "Falta" : "—"}
                                  </span>
                                )}
                              </div>
                              {item.archivoIds && item.archivoIds.length > 1 && (
                                <div className="flex flex-wrap gap-x-3 gap-y-1 pl-5">
                                  {item.archivoIds.map((id, idx) => (
                                    <VisorArchivo key={id} archivoId={id} etiqueta={`Archivo ${idx + 1}`} size="sm" variant="ghost" />
                                  ))}
                                </div>
                              )}
                              {item.nota && <p className="pl-5 text-[10.5px] italic" style={{ color: "var(--status-approved-fg)" }}>{item.nota}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      {dialogos}
    </div>
  );
}
