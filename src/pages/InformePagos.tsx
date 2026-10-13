import * as React from "react";
import { toast } from "sonner";
import { MessageSquarePlus, Download, CalendarDays, Globe, User, CalendarRange, ChevronDown, ChevronRight, CircleCheck, TriangleAlert, Hourglass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AnotacionesPago } from "@/components/pagos/AnotacionesPago";
import { agregarAnotacionPago, cambiarAclaradaAnotacionPago, editarAnotacionPago, eliminarAnotacionPago } from "@/lib/anotacionesPago";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EtiquetaTamano } from "@/components/ui/etiqueta-tamano";
import { BarrasH, Columnas, Kpi, Panel, SinDatos, COLOR } from "@/components/indicadores/graficos";
import { documentosAprobadosSinEvento } from "@/lib/informePagos";
import {
  ETIQUETA_ESTADO_CONCILIACION,
  ETIQUETA_HALLAZGO,
  calcularKpisPagos,
  construirConciliacion,
  construirCSVConciliacion,
  construirCSVDetalleDocumentos,
  construirCSVHallazgos,
  anotacionesDeFila,
  construirCSVKpisPagos,
  construirCSVContrastePagosAprobados,
  construirCSVDocumentosPagosAprobados,
  construirDetalleDocumentos,
  claveSpeakerFila,
  filasConPagoAprobado,
  filtrarConciliacion,
  normalizarNombreConciliacion,
  totalesPagosAprobados,
  traerDatosConciliacion,
  type CodigoHallazgo,
  type DatosConciliacion,
  type EstadoConciliacion,
  type FilaConciliacion,
} from "@/lib/conciliacionPagos";
import { useCompania, filtrarPorEmpresaGrupo } from "@/hooks/useCompania";
import { descargarCSV } from "@/lib/csv";
import { bytesDeTexto } from "@/lib/tamanoEstimado";
import { formatearMonto } from "@/lib/dinero";
import { formatearFecha } from "@/lib/fecha";
import { mensajeErrorAmigable } from "@/lib/supabaseClient";
import type { AnotacionPago } from "@/types";
import { cn } from "@/lib/utils";
import { mismoPais, paisesParaFiltro } from "@/lib/paisCanonico";

const TODOS = "__todos__";

const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 1000) / 10} %`);
const hoyIso = () => new Date().toISOString().slice(0, 10);

const ESTILO_ESTADO: Record<EstadoConciliacion, { clase: string; icono: React.ReactNode }> = {
  consistente: { clase: "bg-emerald-50 text-emerald-800 border-emerald-200", icono: <CircleCheck className="h-3.5 w-3.5" /> },
  inconsistente: { clase: "bg-red-50 text-red-800 border-red-200", icono: <TriangleAlert className="h-3.5 w-3.5" /> },
  en_proceso: { clase: "bg-amber-50 text-amber-800 border-amber-200", icono: <Hourglass className="h-3.5 w-3.5" /> },
};

function ChipEstado({ estado }: { estado: EstadoConciliacion }) {
  const e = ESTILO_ESTADO[estado];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold", e.clase)} data-testid={`pagos-estado-${estado}`}>
      {e.icono}
      {ETIQUETA_ESTADO_CONCILIACION[estado]}
    </span>
  );
}

/** Celda de importe con el símbolo de la diferencia: verde si cuadra con la etapa anterior, rojo/ámbar si no. */
function Importe({ valor, moneda, vacio }: { valor: number; moneda: string; vacio?: boolean }) {
  if (vacio) return <span className="text-muted-foreground">—</span>;
  return <span className="tabular-nums">{formatearMonto(valor, moneda === "—" ? "" : moneda)}</span>;
}

function BotonCsv({ etiqueta, texto, nombre, testId }: { etiqueta: string; texto: () => string; nombre: string; testId: string }) {
  const contenido = React.useMemo(texto, [texto]);
  const bytes = React.useMemo(() => bytesDeTexto(contenido), [contenido]);
  return (
    <div className="flex flex-col items-start gap-0.5">
      <Button variant="outline" size="sm" onClick={() => descargarCSV(`${nombre} — ${hoyIso()}.csv`, contenido)} data-testid={testId}>
        <Download /> {etiqueta}
      </Button>
      <EtiquetaTamano bytes={bytes} />
    </div>
  );
}

/**
 * Entrega 32 — Informe de Pagos a HCPs/Speakers rehecho como conciliación Contratado → Orden de compra → Facturado → Pagado
 * (ver `lib/conciliacionPagos.ts`), con KPIs, hallazgos por fila y descarga CSV de cada vista. Se conserva, como pestaña,
 * el listado anterior de Convenios y Notificaciones de Pago ya aprobados.
 */
export function InformePagos() {
  const { companiaActual } = useCompania();
  const [datos, setDatos] = React.useState<DatosConciliacion | null>(null);
  const [cargando, setCargando] = React.useState(true);

  const [desde, setDesde] = React.useState("");
  const [hasta, setHasta] = React.useState("");
  const [pais, setPais] = React.useState(TODOS);
  const [eventoId, setEventoId] = React.useState(TODOS);
  const [speaker, setSpeaker] = React.useState(TODOS);
  const [moneda, setMoneda] = React.useState(TODOS);
  const [estado, setEstado] = React.useState<string>(TODOS);
  const [hallazgo, setHallazgo] = React.useState<string>(TODOS);
  const [tolerancia, setTolerancia] = React.useState("0");
  const [incluirPendientes, setIncluirPendientes] = React.useState(false);
  const [abiertas, setAbiertas] = React.useState<Set<string>>(new Set());
  /** Entrega 36: fila de la conciliación cuyas anotaciones se están viendo/escribiendo. */
  const [claveAnotando, setClaveAnotando] = React.useState<string | null>(null);

  function cargar() {
    setCargando(true);
    traerDatosConciliacion()
      .then(setDatos)
      .catch((error) => toast.error(mensajeErrorAmigable(error)))
      .finally(() => setCargando(false));
  }
  React.useEffect(cargar, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Solo la compañía del grupo seleccionada (igual que el resto de los informes).
  const datosCompania = React.useMemo<DatosConciliacion | null>(() => {
    if (!datos) return null;
    const eventos = filtrarPorEmpresaGrupo(datos.eventos, companiaActual);
    const ids = new Set(eventos.map((e) => e.id));
    return {
      eventos,
      // Los documentos sin evento de origen no se pueden asignar a una compañía: se conservan (como en el informe anterior).
      convenios: datos.convenios.filter((c) => !c.eventoOrigenId || ids.has(c.eventoOrigenId)),
      conveniosHcp: datos.conveniosHcp.filter((c) => ids.has(c.eventoOrigenId)),
      notificaciones: datos.notificaciones.filter((n) => !n.eventoOrigenId || ids.has(n.eventoOrigenId)),
      registros: datos.registros.filter((r) => ids.has(r.eventoId)),
      anotaciones: (datos.anotaciones ?? []).filter((a) => ids.has(a.eventoId)),
    };
  }, [datos, companiaActual]);

  const anotaciones = React.useMemo(() => datosCompania?.anotaciones ?? [], [datosCompania]);
  async function agregarAnotacionFila(f: FilaConciliacion, texto: string) {
    const nueva = await agregarAnotacionPago({ eventoId: f.eventoId, speakerId: f.speakerId, origen: "informe_pagos", texto });
    setDatos((d) => (d ? { ...d, anotaciones: [...(d.anotaciones ?? []), nueva] } : d));
    toast.success("Anotación agregada.");
  }
  async function cambiarAclarada(id: string, aclarada: boolean) {
    await cambiarAclaradaAnotacionPago(id, aclarada);
    // Quién y cuándo los fija la base de datos: se vuelve a leer para mostrar lo registrado, no lo supuesto.
    const frescas = await traerDatosConciliacion().then((x) => x.anotaciones ?? []);
    setDatos((d) => (d ? { ...d, anotaciones: frescas } : d));
  }

  async function editarAnotacionFila(id: string, texto: string) {
    const editada = await editarAnotacionPago(id, texto);
    setDatos((d) => (d ? { ...d, anotaciones: (d.anotaciones ?? []).map((a) => (a.id === id ? editada : a)) } : d));
    toast.success("Anotación editada.");
  }
  async function eliminarAnotacionFila(id: string) {
    await eliminarAnotacionPago(id);
    setDatos((d) => (d ? { ...d, anotaciones: (d.anotaciones ?? []).filter((a) => a.id !== id) } : d));
    toast.success("Anotación eliminada.");
  }

  const toleranciaPct = Math.max(0, Number(tolerancia.replace(",", ".")) || 0);
  const todasLasFilas = React.useMemo(
    () => (datosCompania ? construirConciliacion(datosCompania, { toleranciaPct, incluirPendientesDeContratar: incluirPendientes }) : []),
    [datosCompania, toleranciaPct, incluirPendientes],
  );
  const filas = React.useMemo(
    () =>
      filtrarConciliacion(todasLasFilas, {
        desde: desde || undefined,
        hasta: hasta || undefined,
        pais: pais === TODOS ? undefined : pais,
        eventoId: eventoId === TODOS ? undefined : eventoId,
        speaker: speaker === TODOS ? undefined : speaker,
        moneda: moneda === TODOS ? undefined : moneda,
        estado: estado === TODOS ? "" : (estado as EstadoConciliacion),
        codigoHallazgo: hallazgo === TODOS ? "" : (hallazgo as CodigoHallazgo),
      }),
    [todasLasFilas, desde, hasta, pais, eventoId, speaker, moneda, estado, hallazgo],
  );
  const kpis = React.useMemo(() => (datosCompania ? calcularKpisPagos(filas, datosCompania) : null), [filas, datosCompania]);
  const detalle = React.useMemo(() => {
    if (!datosCompania) return [];
    const ids = new Set(filas.map((f) => f.eventoId));
    // Con un speaker elegido, solo sus documentos (comparados por nombre normalizado).
    const nombres = speaker === TODOS ? undefined : new Set(filas.map((f) => normalizarNombreConciliacion(f.speakerNombre)));
    return construirDetalleDocumentos(datosCompania, nombres).filter((d) => ids.has(d.eventoId));
  }, [datosCompania, filas, speaker]);

  // Opciones de los selectores, de lo más general a lo más específico: país → evento → speaker. Cada uno solo ofrece lo que
  // existe dentro de lo ya elegido más arriba, para no dejar al usuario con combinaciones que dan cero resultados.
  const paises = React.useMemo(() => paisesParaFiltro(todasLasFilas.map((f) => f.pais)), [todasLasFilas]);
  const monedas = React.useMemo(() => [...new Set(todasLasFilas.map((f) => f.moneda))].sort(), [todasLasFilas]);
  const eventosOpciones = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const f of todasLasFilas) if (pais === TODOS || mismoPais(f.pais, pais)) m.set(f.eventoId, f.eventoNombre);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [todasLasFilas, pais]);
  const speakersOpciones = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const f of todasLasFilas) {
      if (pais !== TODOS && !mismoPais(f.pais, pais)) continue;
      if (eventoId !== TODOS && f.eventoId !== eventoId) continue;
      m.set(claveSpeakerFila(f), f.speakerNombre || "(sin speaker asignado)");
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [todasLasFilas, pais, eventoId]);

  function cambiarPais(v: string) {
    setPais(v);
    // Lo elegido más abajo deja de valer si no pertenece al nuevo país.
    if (v !== TODOS) {
      const eventosDelPais = new Set(todasLasFilas.filter((f) => mismoPais(f.pais, v)).map((f) => f.eventoId));
      if (eventoId !== TODOS && !eventosDelPais.has(eventoId)) setEventoId(TODOS);
      if (speaker !== TODOS && !todasLasFilas.some((f) => mismoPais(f.pais, v) && (eventoId === TODOS || f.eventoId === eventoId) && claveSpeakerFila(f) === speaker)) setSpeaker(TODOS);
    }
  }
  function cambiarEvento(v: string) {
    setEventoId(v);
    if (v !== TODOS && speaker !== TODOS && !todasLasFilas.some((f) => f.eventoId === v && claveSpeakerFila(f) === speaker)) setSpeaker(TODOS);
  }

  // Entrega 37 — «Pagos aprobados»: mismas filas filtradas de arriba (país, evento, speaker, período, moneda, estado y hallazgo),
  // quedándose con las que ya tienen un convenio o una Notificación de Pago aprobados, y contrastadas con lo cargado en el Expediente.
  const filasAprobadas = React.useMemo(() => filasConPagoAprobado(filas), [filas]);
  const totalesAprobados = React.useMemo(() => totalesPagosAprobados(filasAprobadas), [filasAprobadas]);
  // Los documentos aprobados sin evento de origen no tienen país, evento, speaker ni período: solo se listan sin esos filtros.
  const hayFiltroDeEvento = Boolean(desde || hasta || pais !== TODOS || eventoId !== TODOS || speaker !== TODOS || estado !== TODOS || hallazgo !== TODOS);
  const sinEvento = React.useMemo(
    () => (datosCompania && !hayFiltroDeEvento ? documentosAprobadosSinEvento(datosCompania, { moneda: moneda === TODOS ? undefined : moneda }) : []),
    [datosCompania, hayFiltroDeEvento, moneda],
  );

  const hayFiltros = Boolean(desde || hasta || pais !== TODOS || eventoId !== TODOS || speaker !== TODOS || moneda !== TODOS || estado !== TODOS || hallazgo !== TODOS);
  function limpiar() {
    setDesde("");
    setHasta("");
    setPais(TODOS);
    setEventoId(TODOS);
    setSpeaker(TODOS);
    setMoneda(TODOS);
    setEstado(TODOS);
    setHallazgo(TODOS);
  }
  function alternar(clave: string) {
    setAbiertas((prev) => {
      const n = new Set(prev);
      if (n.has(clave)) n.delete(clave);
      else n.add(clave);
      return n;
    });
  }

  const fraseRango = desde || hasta ? ` (${desde || "inicio"} a ${hasta || "hoy"})` : "";

  return (
    <div className="flex flex-col gap-5" data-testid="informe-pagos">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-semibold">Informe de Pagos a HCPs/Speakers</h1>
          <p className="text-sm text-muted-foreground">
            Conciliación de punta a punta por evento y speaker: lo <b>contratado</b> (convenio), lo que se generó en <b>orden de compra</b>, lo <b>facturado</b> y lo <b>pagado</b>.
            Señala dónde las cifras cuadran, dónde no y qué está pendiente. Todo se descarga en CSV.
          </p>
        </div>
      </div>

      <Card data-testid="pagos-filtros">
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex flex-wrap gap-x-10 gap-y-5">
            {/* 1. Qué evento y qué speaker: de lo general a lo específico */}
            <fieldset className="flex flex-col gap-2" data-testid="pagos-grupo-alcance">
              <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Evento y speaker</legend>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pagos-pais" className="flex items-center gap-1"><Globe className="h-3 w-3" /> País del evento</Label>
                  <Select value={pais} onValueChange={cambiarPais}>
                    <SelectTrigger id="pagos-pais" className="h-9 w-44"><SelectValue placeholder="País" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TODOS}>Todos los países</SelectItem>
                      {paises.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pagos-evento" className="flex items-center gap-1"><CalendarRange className="h-3 w-3" /> Evento</Label>
                  <Select value={eventoId} onValueChange={cambiarEvento}>
                    <SelectTrigger id="pagos-evento" className="h-9 w-52" data-testid="pagos-filtro-evento"><SelectValue placeholder="Evento" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TODOS}>Todos los eventos</SelectItem>
                      {eventosOpciones.map(([id, nombre]) => <SelectItem key={id} value={id}>{nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pagos-speaker" className="flex items-center gap-1"><User className="h-3 w-3" /> Speaker</Label>
                  <Select value={speaker} onValueChange={setSpeaker}>
                    <SelectTrigger id="pagos-speaker" className="h-9 w-52" data-testid="pagos-filtro-speaker"><SelectValue placeholder="Speaker" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TODOS}>Todos los speakers</SelectItem>
                      {speakersOpciones.map(([clave, nombre]) => <SelectItem key={clave} value={clave}>{nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </fieldset>

            {/* 2. Período */}
            <fieldset className="flex flex-col gap-2" data-testid="pagos-grupo-periodo">
              <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Período del evento</legend>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pagos-desde" className="flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Desde</Label>
                  <Input id="pagos-desde" type="date" className="h-9 w-36" value={desde} onChange={(e) => setDesde(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pagos-hasta">Hasta</Label>
                  <Input id="pagos-hasta" type="date" className="h-9 w-36" value={hasta} onChange={(e) => setHasta(e.target.value)} />
                </div>
              </div>
            </fieldset>

            {/* 3. Dinero y estado */}
            <fieldset className="flex flex-col gap-2" data-testid="pagos-grupo-estado">
              <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Moneda y resultado</legend>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pagos-moneda">Moneda</Label>
                  <Select value={moneda} onValueChange={setMoneda}>
                    <SelectTrigger id="pagos-moneda" className="h-9 w-32"><SelectValue placeholder="Moneda" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TODOS}>Todas</SelectItem>
                      {monedas.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pagos-estado">Estado de conciliación</Label>
                  <Select value={estado} onValueChange={setEstado}>
                    <SelectTrigger id="pagos-estado" className="h-9 w-40" data-testid="pagos-filtro-estado"><SelectValue placeholder="Estado" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TODOS}>Todos</SelectItem>
                      {(Object.keys(ETIQUETA_ESTADO_CONCILIACION) as EstadoConciliacion[]).map((e) => <SelectItem key={e} value={e}>{ETIQUETA_ESTADO_CONCILIACION[e]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pagos-hallazgo">Hallazgo</Label>
                  <Select value={hallazgo} onValueChange={setHallazgo}>
                    <SelectTrigger id="pagos-hallazgo" className="h-9 w-56"><SelectValue placeholder="Hallazgo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TODOS}>Cualquiera</SelectItem>
                      {(Object.keys(ETIQUETA_HALLAZGO) as CodigoHallazgo[]).map((c) => <SelectItem key={c} value={c}>{ETIQUETA_HALLAZGO[c]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </fieldset>

            {/* 4. Criterios de la conciliación (no filtran: cambian cómo se compara) */}
            <fieldset className="flex flex-col gap-2" data-testid="pagos-grupo-criterios">
              <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Criterios de la conciliación</legend>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pagos-tolerancia" title="Diferencia aceptada entre etapas, en % del valor. 0 = deben coincidir al centavo.">Tolerancia (%)</Label>
                  <Input id="pagos-tolerancia" inputMode="decimal" className="h-9 w-20" value={tolerancia} onChange={(e) => setTolerancia(e.target.value)} />
                </div>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <Checkbox checked={incluirPendientes} onCheckedChange={(v) => setIncluirPendientes(v === true)} data-testid="pagos-incluir-pendientes" />
                  Incluir pendientes de contratar
                </label>
              </div>
            </fieldset>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
            <span data-testid="pagos-resumen-filtros">
              {cargando ? "Cargando…" : `${filas.length} conciliación(es) con estos filtros${hayFiltros ? " (filtrado)" : ""}. Los filtros se aplican a todas las pestañas.`}
            </span>
            {hayFiltros && <Button size="sm" variant="ghost" onClick={limpiar} data-testid="pagos-limpiar">Limpiar filtros</Button>}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="resumen">
        <TabsList>
          <TabsTrigger value="resumen" data-testid="pagos-tab-resumen">Resumen y KPIs</TabsTrigger>
          <TabsTrigger value="conciliacion" data-testid="pagos-tab-conciliacion">Conciliación{kpis ? ` · ${kpis.totalFilas}` : ""}</TabsTrigger>
          <TabsTrigger value="hallazgos" data-testid="pagos-tab-hallazgos">Hallazgos{kpis ? ` · ${kpis.inconsistentes}` : ""}</TabsTrigger>
          <TabsTrigger value="pagos" data-testid="pagos-tab-documentos">Pagos aprobados</TabsTrigger>
        </TabsList>

        {/* ---------------- Resumen y KPIs ---------------- */}
        <TabsContent value="resumen" className="flex flex-col gap-4">
          {cargando && <p className="text-sm text-muted-foreground">Cargando…</p>}
          {!cargando && kpis && kpis.totalFilas === 0 && (
            <SinDatos texto="No hay speakers con convenio, orden de compra, factura o pago para estos filtros. Prueba «Incluir pendientes de contratar»." />
          )}
          {kpis && kpis.totalFilas > 0 && (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid flex-1 grid-cols-2 gap-3 md:grid-cols-4">
                  <Kpi etiqueta="Consistencia" valor={pct(kpis.pctConsistencia)} detalle={`${kpis.consistentes} de ${kpis.totalFilas} conciliaciones cuadran`} testId="pagos-kpi-consistencia" />
                  <Kpi etiqueta="Inconsistentes" valor={kpis.inconsistentes} detalle="requieren revisión" testId="pagos-kpi-inconsistentes" />
                  <Kpi etiqueta="En proceso" valor={kpis.enProceso} detalle="con etapas pendientes, sin errores" testId="pagos-kpi-proceso" />
                  <Kpi etiqueta="Cobertura" valor={`${kpis.eventos} / ${kpis.speakers}`} detalle="eventos / speakers" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <BotonCsv etiqueta="KPIs (CSV)" nombre={`KPIs de pagos${fraseRango}`} texto={() => construirCSVKpisPagos(kpis)} testId="pagos-csv-kpis" />
                </div>
              </div>

              {kpis.porMoneda.map((m) => {
                const etapas = [
                  { etiqueta: "Contratado", valor: m.contratado },
                  { etiqueta: "Orden de compra", valor: m.ordenCompra },
                  { etiqueta: "Facturado", valor: m.facturado },
                  { etiqueta: "Pagado", valor: m.pagado },
                ];
                const fmt = (n: number) => formatearMonto(n, m.moneda === "—" ? "" : m.moneda);
                return (
                  <section key={m.moneda} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-testid={`pagos-moneda-${m.moneda}`}>
                    <h3 className="mb-3 text-sm font-semibold text-slate-800">Recorrido del dinero · {m.moneda === "—" ? "sin moneda" : m.moneda}</h3>
                    <div className="grid gap-5 lg:grid-cols-2">
                      <BarrasH filas={etapas} formato={fmt} maximo={Math.max(...etapas.map((e) => e.valor), 1)} />
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <Dato t="Cobertura de OC" v={pct(m.coberturaOc)} ayuda="Orden de compra ÷ contratado" />
                        <Dato t="Avance de facturación" v={pct(m.avanceFacturacion)} ayuda="Facturado ÷ orden de compra" />
                        <Dato t="Avance de pago" v={pct(m.avancePago)} ayuda="Pagado ÷ facturado" />
                        <Dato t="Ejecución total" v={pct(m.ejecucionTotal)} ayuda="Pagado ÷ contratado" />
                        <Dato t="Contratado sin OC" v={fmt(m.saldoSinOc)} />
                        <Dato t="Por facturar" v={fmt(m.saldoPorFacturar)} ayuda="Orden de compra − facturado" />
                        <Dato t="Por pagar" v={fmt(m.saldoPorPagar)} ayuda="Facturado − pagado" />
                        <Dato t="Monto en inconsistencia" v={fmt(m.montoEnInconsistencia)} ayuda="Suma de las diferencias de los errores" resaltar={m.montoEnInconsistencia > 0} />
                      </dl>
                    </div>
                  </section>
                );
              })}

              <div className="grid gap-4 lg:grid-cols-2">
                <Panel
                  titulo="Hallazgos más frecuentes"
                  ayuda="Cantidad de conciliaciones afectadas por cada hallazgo."
                  tabla={{ encabezados: ["Hallazgo", "Tipo", "Conciliaciones"], filas: kpis.hallazgos.map((h) => [h.etiqueta, h.severidad === "error" ? "Inconsistencia" : h.severidad === "pendiente" ? "Pendiente" : "Aviso", h.filas]) }}
                >
                  {kpis.hallazgos.length === 0 ? <SinDatos texto="Sin hallazgos." /> : <BarrasH filas={kpis.hallazgos.slice(0, 8).map((h) => ({ etiqueta: h.etiqueta, valor: h.filas, detalle: h.severidad }))} color={COLOR.serie2} />}
                </Panel>
                <Panel
                  titulo="Antigüedad del saldo por pagar"
                  ayuda="Según la fecha de la factura más antigua con saldo."
                  tabla={{ encabezados: ["Moneda", "Rango", "Monto", "Conciliaciones"], filas: kpis.antiguedad.flatMap((a) => a.rangos.map((r) => [a.moneda, r.rango, r.monto, r.filas])) }}
                >
                  {kpis.antiguedad.every((a) => a.rangos.every((r) => r.filas === 0)) ? (
                    <SinDatos texto="No hay saldos por pagar." />
                  ) : (
                    kpis.antiguedad
                      .filter((a) => a.rangos.some((r) => r.filas > 0))
                      .map((a) => (
                        <div key={a.moneda} className="mb-2">
                          <p className="mb-1 text-xs font-medium text-slate-500">{a.moneda}</p>
                          <Columnas datos={a.rangos.map((r) => ({ etiqueta: r.rango.replace(" días", ""), valor: r.monto, extra: `${r.filas} conciliación(es)` }))} formato={(n) => formatearMonto(n, a.moneda === "—" ? "" : a.moneda)} />
                        </div>
                      ))
                  )}
                </Panel>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <Kpi etiqueta="Días OC → factura" valor={kpis.diasOcAFactura ?? "—"} detalle="promedio" />
                <Kpi etiqueta="Días factura → pago" valor={kpis.diasFacturaAPago ?? "—"} detalle="promedio, hasta el último pago" />
                <Kpi etiqueta="Días evento → pago" valor={kpis.diasEventoAPago ?? "—"} detalle="promedio, desde el inicio del evento" />
                <Kpi etiqueta="Facturas sin OC" valor={kpis.facturasSinOc} detalle="conciliaciones afectadas" />
                <Kpi etiqueta="Sin Notificación de Pago" valor={kpis.facturasSinNotificacion} detalle="conciliaciones con facturas sin notificar" />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Panel
                  titulo="Por país"
                  tabla={{ encabezados: ["País", "Moneda", "Conciliaciones", "Inconsistentes", "Contratado", "Pagado"], filas: kpis.porPais.map((p) => [p.pais, p.moneda, p.filas, p.inconsistentes, p.contratado, p.pagado]) }}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="text-left text-slate-500"><th className="py-1 pr-3">País</th><th className="pr-3">Conc.</th><th className="pr-3">Incons.</th><th className="pr-3">Contratado</th><th>Pagado</th></tr></thead>
                      <tbody>
                        {kpis.porPais.map((p) => (
                          <tr key={`${p.pais}-${p.moneda}`} className="border-t">
                            <td className="py-1.5 pr-3">{p.pais} <span className="text-slate-400">· {p.moneda}</span></td>
                            <td className="pr-3 tabular-nums">{p.filas}</td>
                            <td className={cn("pr-3 tabular-nums", p.inconsistentes > 0 && "font-semibold text-red-700")}>{p.inconsistentes}</td>
                            <td className="pr-3 tabular-nums">{formatearMonto(p.contratado, "")}</td>
                            <td className="tabular-nums">{formatearMonto(p.pagado, "")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
                <Panel
                  titulo="Speakers con mayor pago"
                  tabla={{ encabezados: ["Speaker", "Moneda", "Pagado", "Contratado"], filas: kpis.topSpeakers.map((s) => [s.speakerNombre, s.moneda, s.pagado, s.contratado]) }}
                >
                  {kpis.topSpeakers.length === 0 ? (
                    <SinDatos />
                  ) : (
                    <BarrasH
                      filas={kpis.topSpeakers.slice(0, 8).map((s) => ({ etiqueta: s.speakerNombre || "(sin nombre)", valor: s.pagado, detalle: `${s.moneda} · contratado ${formatearMonto(s.contratado, "")}` }))}
                      formato={(n) => formatearMonto(n, "")}
                      color={COLOR.serie3}
                    />
                  )}
                </Panel>
              </div>
            </>
          )}
        </TabsContent>

        {/* ---------------- Conciliación ---------------- */}
        <TabsContent value="conciliacion" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Una fila por evento, speaker y moneda. Abre una fila para ver cada hallazgo. «Por facturar» = OC − facturado; «Por pagar» = facturado − pagado.
            </p>
            <div className="flex flex-wrap gap-2">
              <BotonCsv etiqueta="Conciliación (CSV)" nombre={`Conciliación de pagos${fraseRango}`} texto={() => construirCSVConciliacion(filas)} testId="pagos-csv-conciliacion" />
              <BotonCsv etiqueta="Documentos (CSV)" nombre={`Documentos de pago${fraseRango}`} texto={() => construirCSVDetalleDocumentos(detalle)} testId="pagos-csv-documentos" />
            </div>
          </div>
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm" data-testid="pagos-tabla-conciliacion">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="w-8 p-3" />
                    <th className="p-3 font-medium">Evento / Speaker</th>
                    <th className="p-3 text-right font-medium">Contratado</th>
                    <th className="p-3 text-right font-medium">Orden de compra</th>
                    <th className="p-3 text-right font-medium">Facturado</th>
                    <th className="p-3 text-right font-medium">Pagado</th>
                    <th className="p-3 text-right font-medium">Por facturar</th>
                    <th className="p-3 text-right font-medium">Por pagar</th>
                    <th className="p-3 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {cargando && <tr><td className="p-3 text-muted-foreground" colSpan={9}>Cargando...</td></tr>}
                  {!cargando && filas.length === 0 && <tr><td className="p-3 text-muted-foreground" colSpan={9}>No hay conciliaciones con estos filtros.</td></tr>}
                  {filas.map((f) => (
                    <FilaTabla key={f.clave} f={f} abierta={abiertas.has(f.clave)} onAlternar={() => alternar(f.clave)} anotaciones={anotacionesDeFila(anotaciones, f)} onAnotar={() => setClaveAnotando(f.clave)} />
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Hallazgos ---------------- */}
        <TabsContent value="hallazgos" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Cada diferencia o pendiente detectado, para filtrar y asignar.</p>
            <BotonCsv etiqueta="Hallazgos (CSV)" nombre={`Hallazgos de pagos${fraseRango}`} texto={() => construirCSVHallazgos(filas, anotaciones)} testId="pagos-csv-hallazgos" />
          </div>
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm" data-testid="pagos-tabla-hallazgos">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-3 font-medium">Evento</th>
                    <th className="p-3 font-medium">Speaker</th>
                    <th className="p-3 font-medium">Tipo</th>
                    <th className="p-3 font-medium">Detalle</th>
                    <th className="p-3 text-right font-medium">Diferencia</th>
                    <th className="p-3 font-medium">Anotaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.every((f) => f.hallazgos.length === 0) && <tr><td className="p-3 text-muted-foreground" colSpan={6}>{cargando ? "Cargando..." : "Sin hallazgos con estos filtros."}</td></tr>}
                  {filas.flatMap((f) =>
                    f.hallazgos.map((h, i) => (
                      <tr key={`${f.clave}-${i}`} className="border-b last:border-0 align-top">
                        <td className="p-3">{f.eventoNombre}<div className="text-xs text-muted-foreground">{f.pais}</div></td>
                        <td className="p-3">{f.speakerNombre || "—"}<div className="text-xs text-muted-foreground">{f.moneda}</div></td>
                        <td className="p-3">
                          <Badge variant={h.severidad === "error" ? "rejected" : h.severidad === "pendiente" ? "pending" : "draft"}>
                            {h.severidad === "error" ? "Inconsistencia" : h.severidad === "pendiente" ? "Pendiente" : "Aviso"}
                          </Badge>
                          <div className="mt-1 text-xs text-muted-foreground">{ETIQUETA_HALLAZGO[h.codigo]}</div>
                        </td>
                        <td className="p-3">{h.mensaje}</td>
                        <td className="p-3 text-right tabular-nums">{h.diferencia ? formatearMonto(h.diferencia, f.moneda === "—" ? "" : f.moneda) : "—"}</td>
                        <td className="p-3">
                          <ResumenAnotacionesFila anotaciones={anotacionesDeFila(anotaciones, f)} onAbrir={() => setClaveAnotando(f.clave)} />
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Pagos aprobados (entrega 37: contrastado con el Expediente) ---------------- */}
        <TabsContent value="pagos" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-3xl text-sm text-muted-foreground" data-testid="pagos-aprobados-ayuda">
              Speakers con Convenio o Notificación de Pago ya <b>Aprobados o Completados</b>, contrastados con lo realmente cargado en el Expediente:
              <b> Facturado</b> es la suma de las <b>facturas cargadas</b>; <b>Pagado</b>, la de los <b>comprobantes de pago</b>. Se aplican los filtros de arriba.
            </p>
            <div className="flex flex-wrap gap-2">
              <BotonCsv etiqueta="Pagos aprobados (CSV)" nombre={`Informe de Pagos a HCPs${fraseRango}`} texto={() => construirCSVDocumentosPagosAprobados(filasAprobadas, sinEvento)} testId="pagos-csv-legado" />
              <BotonCsv etiqueta="Contraste por speaker (CSV)" nombre={`Contraste de pagos aprobados${fraseRango}`} texto={() => construirCSVContrastePagosAprobados(filasAprobadas)} testId="pagos-csv-contraste" />
            </div>
          </div>
          {totalesAprobados.length > 0 && (
            <div className="flex flex-col gap-2" data-testid="pagos-aprobados-totales">
              {totalesAprobados.map((t) => {
                const mon = t.moneda === "—" ? "" : t.moneda;
                const celdas = [
                  { k: "Contratado", v: t.contratado, ayuda: "Convenio aprobado" },
                  { k: "Órdenes de compra", v: t.ordenCompra, ayuda: "Cargadas en el Expediente" },
                  { k: "Total facturado", v: t.facturado, ayuda: "Facturas cargadas en el Expediente" },
                  { k: "Notificado", v: t.notificadoAprobado, ayuda: "Notificaciones de Pago aprobadas" },
                  { k: "Comprobantes de pago", v: t.pagado, ayuda: "Pagado según comprobantes cargados" },
                  { k: "Por pagar", v: t.porPagar, ayuda: "Facturado − pagado" },
                ];
                return (
                  <div key={t.moneda} className="rounded-lg border border-primary/40 bg-accent/60 p-3" data-testid={`pagos-aprobados-total-${t.moneda}`}>
                    <p className="mb-2 text-xs font-medium text-accent-foreground">{t.moneda === "—" ? "Sin moneda" : t.moneda} · {t.filas} conciliación(es)</p>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                      {celdas.map((c) => (
                        <div key={c.k} title={c.ayuda}>
                          <p className="text-[12px] font-medium text-accent-foreground">{c.k}</p>
                          <p className="font-mono-tab text-base font-bold text-accent-foreground">{formatearMonto(c.v, mon)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm" data-testid="pagos-tabla-aprobados">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="w-8 p-3" />
                    <th className="p-3 font-medium">Evento / Speaker</th>
                    <th className="p-3 text-right font-medium">Contratado</th>
                    <th className="p-3 text-right font-medium">Orden de compra</th>
                    <th className="p-3 text-right font-medium">Facturado</th>
                    <th className="p-3 text-right font-medium">Notificado</th>
                    <th className="p-3 text-right font-medium">Comprobantes de pago</th>
                    <th className="p-3 text-right font-medium">Por pagar</th>
                    <th className="p-3 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {cargando && <tr><td className="p-3 text-muted-foreground" colSpan={9}>Cargando...</td></tr>}
                  {!cargando && filasAprobadas.length === 0 && <tr><td className="p-3 text-muted-foreground" colSpan={9}>No hay pagos Aprobados o Completados con estos filtros.</td></tr>}
                  {filasAprobadas.map((f) => (
                    <FilaPagoAprobado key={f.clave} f={f} abierta={abiertas.has(`pa|${f.clave}`)} onAlternar={() => alternar(`pa|${f.clave}`)} />
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
          {sinEvento.length > 0 && (
            <Card data-testid="pagos-aprobados-sin-evento">
              <CardContent className="flex flex-col gap-2 p-4">
                <p className="text-sm font-medium">Aprobados sin evento de origen ({sinEvento.length})</p>
                <p className="text-xs text-muted-foreground">No se pueden contrastar con órdenes de compra, facturas ni comprobantes porque esos documentos cuelgan de un evento. Se muestran solo cuando no hay filtros de evento, speaker, país ni período.</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="p-2 font-medium">Tipo</th>
                        <th className="p-2 font-medium">HCP</th>
                        <th className="p-2 font-medium">Fecha</th>
                        <th className="p-2 font-medium">Monto</th>
                        <th className="p-2 font-medium">Estado</th>
                        <th className="p-2 font-medium">Referencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sinEvento.map((d, i) => (
                        <tr key={`${d.tipo}-${i}`} className="border-b last:border-0">
                          <td className="p-2">{d.tipo}</td>
                          <td className="p-2"><div className="font-medium">{d.hcp}</div><div className="text-xs text-muted-foreground">{d.identificacion}</div></td>
                          <td className="p-2 text-muted-foreground">{formatearFecha(d.fecha)}</td>
                          <td className="p-2">{d.monto != null ? formatearMonto(d.monto, d.moneda ?? "") : "—"}</td>
                          <td className="p-2"><Badge variant="approved">{d.estado}</Badge></td>
                          <td className="p-2 text-muted-foreground">{d.referencia}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Entrega 36: anotaciones de la fila (evento + speaker), con quién y cuándo. */}
      {(() => {
        const f = claveAnotando ? todasLasFilas.find((x) => x.clave === claveAnotando) ?? null : null;
        return (
          <Dialog open={!!f} onOpenChange={(abierto) => { if (!abierto) setClaveAnotando(null); }}>
            <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl" data-testid="pagos-dialogo-anotaciones">
              {f && (
                <>
                  <DialogHeader>
                    <DialogTitle>Anotaciones · {f.speakerNombre || "(sin speaker asignado)"}</DialogTitle>
                    <DialogDescription>{f.eventoNombre} · {f.moneda}. Aclara aquí las inconsistencias entre la orden de compra, las facturas y los comprobantes de pago.</DialogDescription>
                  </DialogHeader>
                  {f.hallazgos.length > 0 && (
                    <ul className="space-y-1 rounded-md border bg-muted/30 p-2 text-sm">
                      {f.hallazgos.map((h, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <Badge variant={h.severidad === "error" ? "rejected" : h.severidad === "pendiente" ? "pending" : "draft"}>
                            {h.severidad === "error" ? "Inconsistencia" : h.severidad === "pendiente" ? "Pendiente" : "Aviso"}
                          </Badge>
                          <span>{h.mensaje}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <AnotacionesPago
                    titulo="Anotaciones sobre el pago"
                    anotaciones={anotacionesDeFila(anotaciones, f)}
                    placeholder="Explica o aclara la inconsistencia (p. ej. «la factura 123 incluye el IVA; la OC es antes de impuestos»)…"
                    etiquetaBoton="Agregar anotación al hallazgo"
                    onAgregar={(texto) => agregarAnotacionFila(f, texto)}
                    onCambiarAclarada={cambiarAclarada}
                    onEditar={editarAnotacionFila}
                    onEliminar={eliminarAnotacionFila}
                    testId="pagos-anotaciones"
                  />
                </>
              )}
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}

function ResumenAnotacionesFila({ anotaciones, onAbrir }: { anotaciones: AnotacionPago[]; onAbrir: () => void }) {
  const sinAclarar = anotaciones.filter((a) => !a.aclarada).length;
  const ultima = anotaciones[anotaciones.length - 1];
  return (
    <div className="flex flex-col items-start gap-1 text-xs">
      {ultima && (
        <span className="max-w-[16rem] text-muted-foreground" title={ultima.texto}>
          <b className="font-medium text-foreground">{ultima.autorNombre || "?"}</b> · {formatearFecha(ultima.creadoEn)}: <span className="line-clamp-2">{ultima.texto}</span>
        </span>
      )}
      <Button size="sm" variant="outline" className="h-7" onClick={onAbrir} data-testid="pagos-anotar">
        <MessageSquarePlus /> {anotaciones.length === 0 ? "Anotar" : `Ver / anotar (${anotaciones.length}${sinAclarar ? `, ${sinAclarar} sin aclarar` : ""})`}
      </Button>
    </div>
  );
}

function Dato({ t, v, ayuda, resaltar }: { t: string; v: string; ayuda?: string; resaltar?: boolean }) {
  return (
    <div title={ayuda}>
      <dt className="text-xs text-slate-500">{t}</dt>
      <dd className={cn("font-semibold tabular-nums text-slate-900", resaltar && "text-red-700")}>{v}</dd>
    </div>
  );
}

function FilaTabla({ f, abierta, onAlternar, anotaciones, onAnotar }: { f: FilaConciliacion; abierta: boolean; onAlternar: () => void; anotaciones: AnotacionPago[]; onAnotar: () => void }) {
  const mon = f.moneda === "—" ? "" : f.moneda;
  const errorDe = (...codigos: CodigoHallazgo[]) => f.hallazgos.some((h) => h.severidad === "error" && codigos.includes(h.codigo));
  const celdaRoja = "font-semibold text-red-700";
  return (
    <>
      <tr className="cursor-pointer border-b hover:bg-muted/40" onClick={onAlternar} data-testid="pagos-fila">
        <td className="p-3 text-muted-foreground">{abierta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
        <td className="p-3">
          <div className="font-medium">{f.speakerNombre || "—"}</div>
          <div className="text-xs text-muted-foreground">{f.eventoNombre} · {f.pais || "sin país"} · {f.moneda}</div>
        </td>
        <td className="p-3 text-right"><Importe valor={f.contratado} moneda={mon} vacio={f.fuenteContratado === "—"} /><div className="text-[11px] text-muted-foreground">{f.fuenteContratado}</div></td>
        <td className={cn("p-3 text-right", errorDe("oc_difiere_contratado", "factura_sin_oc") && celdaRoja)}><Importe valor={f.ordenCompra} moneda={mon} vacio={f.nOrdenesCompra === 0} /></td>
        <td className={cn("p-3 text-right", errorDe("factura_supera_oc", "factura_sin_oc", "pago_sin_factura") && celdaRoja)}><Importe valor={f.facturado} moneda={mon} vacio={f.nFacturas === 0} /></td>
        <td className={cn("p-3 text-right", errorDe("pago_supera_factura", "pago_sin_factura") && celdaRoja)}><Importe valor={f.pagado} moneda={mon} vacio={f.nPagos === 0} /></td>
        <td className="p-3 text-right"><Importe valor={f.saldoPorFacturar} moneda={mon} vacio={f.nOrdenesCompra === 0} /></td>
        <td className="p-3 text-right"><Importe valor={f.saldoPorPagar} moneda={mon} vacio={f.nFacturas === 0} /></td>
        <td className="p-3"><ChipEstado estado={f.estado} /></td>
      </tr>
      {abierta && (
        <tr className="border-b bg-muted/20" data-testid="pagos-fila-detalle">
          <td />
          <td colSpan={8} className="p-3">
            <div className="grid gap-3 md:grid-cols-2">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <Dato t="Presupuestado (honorarios)" v={f.presupuestado == null ? "—" : formatearMonto(f.presupuestado, mon)} />
                <Dato t="Convenio de Pago" v={f.convenioPago == null ? "—" : formatearMonto(f.convenioPago, mon)} />
                <Dato t="Convenio HCP" v={f.convenioHcp == null ? "—" : formatearMonto(f.convenioHcp, mon)} />
                <Dato t="Notificado (Notificación de Pago)" v={formatearMonto(f.notificado, mon)} />
                <Dato t="Órdenes de compra / facturas / pagos" v={`${f.nOrdenesCompra} / ${f.nFacturas} / ${f.nPagos}`} />
                <Dato t="Contratado sin OC" v={formatearMonto(f.saldoSinOc, mon)} />
              </dl>
              <ul className="space-y-1 text-sm">
                {f.hallazgos.length === 0 && <li className="text-emerald-700">Todo cuadra: contratado, orden de compra, facturado y pagado coinciden.</li>}
                {f.hallazgos.map((h, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Badge variant={h.severidad === "error" ? "rejected" : h.severidad === "pendiente" ? "pending" : "draft"}>
                      {h.severidad === "error" ? "Inconsistencia" : h.severidad === "pendiente" ? "Pendiente" : "Aviso"}
                    </Badge>
                    <span>{h.mensaje}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <Button size="sm" variant="outline" onClick={onAnotar} data-testid="pagos-abrir-anotaciones">
                <MessageSquarePlus /> Anotaciones ({anotaciones.length})
              </Button>
              {anotaciones.length > 0 && (
                <span className="text-muted-foreground">
                  Última: {anotaciones[anotaciones.length - 1].autorNombre || "?"} · {formatearFecha(anotaciones[anotaciones.length - 1].creadoEn)}
                </span>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/** Entrega 37: una fila de «Pagos aprobados» — contraste entre lo aprobado y lo cargado en el Expediente, con sus documentos al abrirla. */
function FilaPagoAprobado({ f, abierta, onAlternar }: { f: FilaConciliacion; abierta: boolean; onAlternar: () => void }) {
  const mon = f.moneda === "—" ? "" : f.moneda;
  const cantidad = (n: number, singular: string, plural: string) => <div className="text-[11px] text-muted-foreground">{n} {n === 1 ? singular : plural}</div>;
  return (
    <>
      <tr className="cursor-pointer border-b hover:bg-muted/40" onClick={onAlternar} data-testid="pagos-aprobado-fila">
        <td className="p-3 text-muted-foreground">{abierta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
        <td className="p-3">
          <div className="font-medium">{f.speakerNombre || "—"}</div>
          <div className="text-xs text-muted-foreground">{f.eventoNombre} · {f.pais || "sin país"} · {f.moneda}</div>
        </td>
        <td className="p-3 text-right"><Importe valor={f.contratado} moneda={mon} vacio={f.nConvenios === 0} /><div className="text-[11px] text-muted-foreground">{f.fuenteContratado}</div></td>
        <td className="p-3 text-right"><Importe valor={f.ordenCompra} moneda={mon} vacio={f.nOrdenesCompra === 0} />{f.nOrdenesCompra > 0 && cantidad(f.nOrdenesCompra, "orden", "órdenes")}</td>
        <td className="p-3 text-right"><Importe valor={f.facturado} moneda={mon} vacio={f.nFacturas === 0} />{f.nFacturas > 0 ? cantidad(f.nFacturas, "factura", "facturas") : <div className="text-[11px] text-muted-foreground">sin facturas cargadas</div>}</td>
        <td className="p-3 text-right"><Importe valor={f.notificadoAprobado} moneda={mon} vacio={f.nNotificacionesAprobadas === 0} />{f.nNotificacionesAprobadas > 0 && cantidad(f.nNotificacionesAprobadas, "notificación", "notificaciones")}</td>
        <td className="p-3 text-right"><Importe valor={f.pagado} moneda={mon} vacio={f.nPagos === 0} />{f.nPagos > 0 ? cantidad(f.nPagos, "comprobante", "comprobantes") : <div className="text-[11px] text-muted-foreground">sin comprobantes</div>}</td>
        <td className="p-3 text-right"><Importe valor={f.saldoPorPagar} moneda={mon} vacio={f.nFacturas === 0} /></td>
        <td className="p-3"><ChipEstado estado={f.estado} /></td>
      </tr>
      {abierta && (
        <tr className="border-b bg-muted/20" data-testid="pagos-aprobado-detalle">
          <td />
          <td colSpan={8} className="p-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-3 font-medium">Documento</th>
                  <th className="pr-3 font-medium">Número</th>
                  <th className="pr-3 font-medium">Fecha</th>
                  <th className="pr-3 text-right font-medium">Valor</th>
                  <th className="pr-3 font-medium">Estado</th>
                  <th className="font-medium">Cubre la(s) factura(s)</th>
                </tr>
              </thead>
              <tbody>
                {f.documentos.map((d, i) => (
                  <tr key={`${d.tipo}-${d.numero}-${i}`} className="border-t">
                    <td className="py-1.5 pr-3">{d.tipo}</td>
                    <td className="pr-3">{d.numero || "—"}</td>
                    <td className="pr-3 text-muted-foreground">{formatearFecha(d.fecha)}</td>
                    <td className="pr-3 text-right tabular-nums">{d.valor != null ? formatearMonto(d.valor, d.moneda) : "—"}</td>
                    <td className="pr-3 text-muted-foreground">{d.estado}</td>
                    <td className="text-muted-foreground">{d.cubre ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {f.hallazgos.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs">
                {f.hallazgos.map((h, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Badge variant={h.severidad === "error" ? "rejected" : h.severidad === "pendiente" ? "pending" : "draft"}>
                      {h.severidad === "error" ? "Inconsistencia" : h.severidad === "pendiente" ? "Pendiente" : "Aviso"}
                    </Badge>
                    <span>{h.mensaje}</span>
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
