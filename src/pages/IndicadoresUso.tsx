import * as React from "react";
import { toast } from "sonner";
import { AlertTriangle, Database, Download, Lock, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputPassword } from "@/components/ui/input-password";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useCompania } from "@/hooks/useCompania";
import { EtiquetaTamano } from "@/components/ui/etiqueta-tamano";
import { bytesDeCsv } from "@/lib/tamanoEstimado";
import { ENCABEZADOS_CSV_KPI, filasCsvGestion, filasCsvUso } from "@/lib/indicadoresCsv";
import { Anillo, BarrasH, Columnas, COLOR, Dona, Kpi, MapaCalor, Panel, SinDatos } from "@/components/indicadores/graficos";
import {
  MigracionPendiente,
  calcularIndicadoresGestion,
  calcularIndicadoresUso,
  formatearDinero,
  formatearDuracion,
  formatearEntero,
  filtrarUsoPorEmpresa,
  mapaDocumentoAEvento,
  reiniciarContadores,
  traerBaseGestion,
  traerCiclosAprobacion,
  traerTelemetria,
  type BaseGestion,
  type DatosTelemetria,
  type IndicadoresGestion,
  type IndicadoresUso,
} from "@/lib/indicadores";
import { ETIQUETA_TIPO_DOC } from "@/lib/enums";
import { etiquetaPagina, type PaginaId } from "@/lib/navegacion";
import { formatearFecha, formatearFechaHora } from "@/lib/fecha";
import { construirCSV, descargarCSV } from "@/lib/csv";
import type { TipoDoc } from "@/lib/enums";

const etiquetaTipo = (t: string) => ETIQUETA_TIPO_DOC[t as TipoDoc] ?? t;
const etiquetaPag = (p: string) => {
  try {
    return etiquetaPagina(p as PaginaId) || p;
  } catch {
    return p;
  }
};
const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)} %`);

function hace(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const PESTANAS_GESTION = ["eventos", "costos", "speakers", "productos"];
const PESTANAS_USO = ["uso", "procesos"];
const Calculando = () => <p className="py-8 text-center text-sm text-muted-foreground">Calculando indicadores…</p>;

export function IndicadoresUso() {
  const { usuario, verificarPasswordActual } = useAuth();
  const { companiaActual } = useCompania();
  const [desde, setDesde] = React.useState(hace(30));
  const [hasta, setHasta] = React.useState("");
  const [pais, setPais] = React.useState("");
  // Octubre 2026: filtro por empresa del grupo; parte de la compañía con la que se trabaja en la sesión.
  const [empresa, setEmpresa] = React.useState(companiaActual ?? "");
  const [ciclosCrudos, setCiclosCrudos] = React.useState<Awaited<ReturnType<typeof traerCiclosAprobacion>>>([]);
  const [cargando, setCargando] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [migracionPendiente, setMigracionPendiente] = React.useState(false);
  const [tel, setTel] = React.useState<DatosTelemetria | null>(null);
  const [base, setBase] = React.useState<BaseGestion | null>(null);
  const [reiniciando, setReiniciando] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [procesando, setProcesando] = React.useState(false);
  const [version, setVersion] = React.useState(0);
  const [pestana, setPestana] = React.useState("eventos");

  const esAdmin = Boolean(usuario?.esAdministrador);

  React.useEffect(() => {
    if (!esAdmin) return;
    let vivo = true;
    setCargando(true);
    setError(null);
    (async () => {
      try {
        const [b, ciclos] = await Promise.all([traerBaseGestion(), traerCiclosAprobacion(desde || undefined, hasta || undefined).catch(() => [])]);
        let t: DatosTelemetria | null = null;
        let pendiente = false;
        try {
          t = await traerTelemetria(desde || undefined, hasta || undefined);
        } catch (e) {
          if (e instanceof MigracionPendiente) pendiente = true;
          else throw e;
        }
        if (!vivo) return;
        setBase(b);
        setMigracionPendiente(pendiente);
        setTel(t);
        setCiclosCrudos(ciclos);
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : "No se pudieron cargar los indicadores.");
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [esAdmin, desde, hasta, version]);

  // El uso se recalcula al cambiar de empresa sin volver a leer la base de datos.
  const uso: IndicadoresUso | null = React.useMemo(() => {
    if (!tel || !base) return null;
    const filtrado = filtrarUsoPorEmpresa(tel, ciclosCrudos, base, empresa);
    return calcularIndicadoresUso({
      tel: filtrado.tel,
      nombreUsuario: (id) => base.usuarios.get(id) ?? "(usuario eliminado)",
      eventoDeDocumento: mapaDocumentoAEvento(base),
      ciclos: filtrado.ciclos,
    });
  }, [tel, base, ciclosCrudos, empresa]);

  const gestion: IndicadoresGestion | null = React.useMemo(
    () => (base ? calcularIndicadoresGestion(base, { desde: desde || undefined, hasta: hasta || undefined, pais: pais || undefined, empresa: empresa || undefined }) : null),
    [base, desde, hasta, pais, empresa],
  );

  // Empresas ofrecidas: las del grupo presentes en los eventos, limitadas al alcance del administrador si lo tiene.
  const empresasDisponibles = React.useMemo(() => {
    const deEventos = (base?.eventos ?? []).map((e) => e.empresaGrupo).filter(Boolean);
    const propias = usuario?.empresasGrupo ?? [];
    const todas = Array.from(new Set([...deEventos, ...propias, ...(empresa ? [empresa] : [])]));
    const visibles = propias.length > 0 ? todas.filter((e) => propias.includes(e)) : todas;
    return visibles.sort((a, b) => a.localeCompare(b));
  }, [base, usuario, empresa]);

  async function confirmarReinicio() {
    if (!password.trim()) {
      toast.error("Ingresa tu contraseña para confirmar.");
      return;
    }
    setProcesando(true);
    try {
      if (!(await verificarPasswordActual(password))) {
        toast.error("Contraseña incorrecta.");
        return;
      }
      const r = await reiniciarContadores();
      toast.success(`Contadores reiniciados: ${r.sesiones} sesión(es) y ${r.eventos} medición(es) eliminadas.`);
      setReiniciando(false);
      setPassword("");
      setVersion((v) => v + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron reiniciar los contadores.");
    } finally {
      setProcesando(false);
    }
  }

  function exportarUso() {
    if (!uso) return;
    const filas: (string | number)[][] = uso.porUsuario.map((u) => [u.nombre, u.sesiones, Math.round(u.conectadoSeg / 60), Math.round(u.activoSeg / 60), Math.round(u.promedioSesionSeg / 60), u.ultima]);
    descargarCSV("indicadores_uso_por_usuario.csv", construirCSV(["Usuario", "Sesiones", "Minutos conectado", "Minutos activo", "Promedio por sesión (min)", "Última conexión"], filas));
  }

  const filtroCsv = { desde: desde || undefined, hasta: hasta || undefined, pais: pais || undefined, empresa: empresa || undefined };
  const filasCsvG = React.useMemo(() => (gestion ? filasCsvGestion(gestion, filtroCsv) : []), [gestion, desde, hasta, pais, empresa]); // eslint-disable-line react-hooks/exhaustive-deps
  const filasCsvU = React.useMemo(() => (uso ? filasCsvUso(uso, filtroCsv) : []), [uso, desde, hasta, pais, empresa]); // eslint-disable-line react-hooks/exhaustive-deps
  function descargarKpis(cual: "gestion" | "uso") {
    const filas = cual === "gestion" ? filasCsvG : filasCsvU;
    const hoy = new Date().toISOString().slice(0, 10);
    descargarCSV(`beats_kpis_${cual}_${hoy}.csv`, construirCSV(ENCABEZADOS_CSV_KPI, filas));
  }

  if (!esAdmin) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" /> Esta ventana es exclusiva para administradores.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5" data-testid="indicadores-uso">
      {/* Barra de filtros compacta: período + país, y acciones a la derecha */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="ind-desde" className="text-xs text-muted-foreground">Desde</Label>
          <Input id="ind-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9 w-40" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ind-hasta" className="text-xs text-muted-foreground">Hasta</Label>
          <Input id="ind-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-9 w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Empresa del grupo</Label>
          <Select value={empresa || "todas"} onValueChange={(v) => setEmpresa(v === "todas" ? "" : v)}>
            <SelectTrigger className="h-9 w-56" data-testid="indicadores-filtro-empresa"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las empresas</SelectItem>
              {empresasDisponibles.map((e) => (
                <SelectItem key={e} value={e}>{e}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">País (solo gestión)</Label>
          <Select value={pais || "todos"} onValueChange={(v) => setPais(v === "todos" ? "" : v)}>
            <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los países</SelectItem>
              {(gestion?.paisesDisponibles ?? []).map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setVersion((v) => v + 1)} disabled={cargando}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${cargando ? "animate-spin" : ""}`} /> Actualizar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setReiniciando(true)} disabled={migracionPendiente} data-testid="reiniciar-contadores">
            <RotateCcw className="mr-1.5 h-4 w-4" /> Reiniciar contadores
          </Button>
        </div>
      </div>

      {tel?.medidoDesde && (
        <p className="text-xs text-muted-foreground" data-testid="medido-desde">
          Medición de uso desde {formatearFechaHora(tel.medidoDesde)}
          {tel.reinicios[0] && ` · último reinicio por un administrador el ${formatearFecha(tel.reinicios[0].reiniciadoEn)}`}
          {tel.truncado && " · se muestra solo una parte de las mediciones (límite de lectura)"}.
        </p>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <Tabs value={pestana} onValueChange={setPestana}>
        {/* Entrega 32: la ventana estaba demasiado densa (dos pestañas con decenas de paneles).
            Ahora son 6 pestañas temáticas; las 4 primeras salen de los documentos (gestión) y las 2 últimas de la medición de uso. */}
        <TabsList className="h-auto flex-wrap" data-testid="indicadores-pestanas">
          <TabsTrigger value="eventos" data-testid="ind-tab-eventos">Eventos y asistentes</TabsTrigger>
          <TabsTrigger value="costos" data-testid="ind-tab-costos">Costos y contratación</TabsTrigger>
          <TabsTrigger value="speakers" data-testid="ind-tab-speakers">Speakers y educación</TabsTrigger>
          <TabsTrigger value="productos" data-testid="ind-tab-productos">Productos y tiempos</TabsTrigger>
          <TabsTrigger value="uso" data-testid="ind-tab-uso">Uso de la aplicación</TabsTrigger>
          <TabsTrigger value="procesos" data-testid="ind-tab-procesos">Procesos documentales</TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------------------------ GESTIÓN (4 pestañas) */}
        {PESTANAS_GESTION.includes(pestana) && gestion && (
          <div className="mt-4">
            <BarraDescargaKpis etiqueta="Descargar KPIs de gestión (CSV)" bytes={bytesDeCsv(ENCABEZADOS_CSV_KPI, filasCsvG)} onClick={() => descargarKpis("gestion")} testId="descargar-kpis-gestion" />
          </div>
        )}
        <TabsContent value="eventos" className="space-y-4">{cargando && !gestion ? <Calculando /> : gestion && <PestanaEventos g={gestion} />}</TabsContent>
        <TabsContent value="costos" className="space-y-4">{cargando && !gestion ? <Calculando /> : gestion && <PestanaCostos g={gestion} />}</TabsContent>
        <TabsContent value="speakers" className="space-y-4">{cargando && !gestion ? <Calculando /> : gestion && <PestanaSpeakers g={gestion} />}</TabsContent>
        <TabsContent value="productos" className="space-y-4">{cargando && !gestion ? <Calculando /> : gestion && <PestanaProductosTiempos g={gestion} />}</TabsContent>

        {/* ------------------------------------------------------------------ USO (2 pestañas) */}
        {PESTANAS_USO.includes(pestana) && (migracionPendiente ? (
          <Card className="mt-4">
            <CardContent className="flex items-start gap-3 py-6 text-sm">
              <Database className="mt-0.5 h-5 w-5 text-amber-600" />
              <div>
                <p className="font-medium">Falta activar la medición de uso.</p>
                <p className="mt-1 text-muted-foreground">
                  Ejecuta en el SQL Editor de Supabase el archivo <code>db/entrega_29_telemetria_uso.sql</code> (y antes <code>db/entrega_29_configuracion_notificaciones.sql</code>, que define <code>beats_es_administrador()</code>). A partir de ese momento la app empieza a medir sola; los KPI de gestión no dependen de esto.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : uso ? (
          <div className="mt-4">
            <BarraDescargaKpis etiqueta="Descargar KPIs de uso (CSV)" bytes={bytesDeCsv(ENCABEZADOS_CSV_KPI, filasCsvU)} onClick={() => descargarKpis("uso")} testId="descargar-kpis-uso" />
          </div>
        ) : null)}
        <TabsContent value="uso" className="space-y-4">
          {!migracionPendiente && (cargando && !uso ? <Calculando /> : uso && <PestanaUsoApp u={uso} onExportar={exportarUso} />)}
        </TabsContent>
        <TabsContent value="procesos" className="space-y-4">
          {!migracionPendiente && (cargando && !uso ? <Calculando /> : uso && <PestanaProcesos u={uso} />)}
        </TabsContent>
      </Tabs>

      <Dialog open={reiniciando} onOpenChange={(o) => { if (!procesando) { setReiniciando(o); if (!o) setPassword(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reiniciar contadores de uso</DialogTitle>
            <DialogDescription>
              Se eliminarán todas las sesiones y mediciones de tiempo registradas hasta hoy. Los KPI de gestión no se afectan (salen de los documentos). Esta acción no se puede deshacer y queda registrada con tu usuario.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="ind-password">Confirma con tu contraseña</Label>
            <InputPassword id="ind-password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" onKeyDown={(e) => { if (e.key === "Enter") void confirmarReinicio(); }} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReiniciando(false); setPassword(""); }} disabled={procesando}>Cancelar</Button>
            <Button variant="destructive" onClick={() => void confirmarReinicio()} disabled={procesando} data-testid="confirmar-reinicio">
              {procesando ? "Reiniciando…" : "Reiniciar contadores"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BarraDescargaKpis({ etiqueta, bytes, onClick, testId }: { etiqueta: string; bytes: number; onClick: () => void; testId: string }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="mr-auto text-xs text-slate-500">Todos los indicadores del período y país seleccionados, en formato de hoja de datos (Excel, Power BI).</p>
      <EtiquetaTamano bytes={bytes} testId={`${testId}-tamano`} />
      <Button size="sm" onClick={onClick} data-testid={testId}>
        <Download className="mr-1.5 h-4 w-4" /> {etiqueta}
      </Button>
    </div>
  );
}

// ================================================================================================ GESTIÓN

/** Pestaña «Eventos y asistentes»: resumen, asistencia y perfil de los HCPs impactados. */
function PestanaEventos({ g }: { g: IndicadoresGestion }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi etiqueta="Eventos en el período" valor={formatearEntero(g.eventosTotal)} detalle={`${g.eventosEjecutables} aprobados o completados`} testId="kpi-eventos" />
        <Kpi etiqueta="HCPs impactados (únicos)" valor={formatearEntero(g.hcpsUnicos)} detalle={`${g.hcpsRecurrentes} asistieron a más de un evento`} testId="kpi-hcps" />
        <Kpi etiqueta="Asistentes registrados" valor={formatearEntero(g.asistentesRegistrados)} detalle={`de ${formatearEntero(g.asistentesEsperados)} esperados`} />
        <Kpi etiqueta="Muestras entregadas" valor={formatearEntero(g.muestrasEntregadas)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel titulo="Cumplimiento de asistencia" ayuda="Check-ins registrados frente a los asistentes esperados en eventos aprobados o completados.">
          <Anillo fraccion={g.cumplimientoAsistencia} etiqueta={`${formatearEntero(g.asistentesRegistrados)} de ${formatearEntero(g.asistentesEsperados)}`} />
          <p className="mt-3 text-xs text-slate-500">
            {g.eventosSinCheckins > 0 ? `${g.eventosSinCheckins} evento(s) ejecutables sin ningún check-in.` : "Todos los eventos ejecutables tienen check-ins."}
          </p>
        </Panel>
        <Panel titulo="Tipo de participación de los asistentes" ayuda="Qué registraron en el check-in: asistencia a la actividad académica, visita al stand o taller." tabla={{ encabezados: ["Tipo de participación", "Registros"], filas: g.porTipoParticipacion.map((f) => [f.etiqueta, f.valor]) }}>
          <Dona partes={g.porTipoParticipacion.map((f) => ({ etiqueta: f.etiqueta, valor: f.valor }))} />
        </Panel>
        <Panel titulo="Eventos por estado" tabla={{ encabezados: ["Estado", "Eventos"], filas: g.eventosPorEstado.map((f) => [f.etiqueta, f.valor]) }}>
          <BarrasH filas={g.eventosPorEstado} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          titulo="Concentración por ciudad (eventos)"
          ayuda={g.top3CiudadesPct == null ? undefined : `Las 3 ciudades principales concentran el ${pct(g.top3CiudadesPct)} de las actividades.`}
          tabla={{ encabezados: ["Ciudad", "Eventos"], filas: g.ciudadesEventos.map((f) => [f.etiqueta, f.valor]) }}
        >
          <BarrasH filas={g.ciudadesEventos} />
        </Panel>
        <Panel titulo="Ciudad de los asistentes (check-ins)" tabla={{ encabezados: ["Ciudad", "Registros"], filas: g.ciudadesAsistentes.map((f) => [f.etiqueta, f.valor]) }}>
          <BarrasH filas={g.ciudadesAsistentes} color={COLOR.serie3} />
        </Panel>
        <Panel titulo="Profesión de los HCPs impactados" tabla={{ encabezados: ["Profesión", "Registros"], filas: g.porProfesion.map((f) => [f.etiqueta, f.valor]) }}>
          <BarrasH filas={g.porProfesion} />
        </Panel>
        <Panel titulo="Especialidad de los HCPs impactados" tabla={{ encabezados: ["Especialidad", "Registros"], filas: g.porEspecialidad.map((f) => [f.etiqueta, f.valor]) }}>
          <BarrasH filas={g.porEspecialidad} color={COLOR.serie3} />
        </Panel>
      </div>

    </>
  );
}

/** Pestaña «Costos y contratación». */
function PestanaCostos({ g }: { g: IndicadoresGestion }) {
  const c = g.contratacionHcp;
  return (
    <>
      <h3 className="pt-2 text-sm font-semibold text-slate-700">Costos y contratación de HCPs</h3>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel titulo="Presupuesto solicitado" ayuda="Suma de los rubros condensados de los eventos del período, por moneda.">
          {g.presupuestoPorMoneda.length === 0 ? (
            <SinDatos />
          ) : (
            <ul className="space-y-1.5 text-sm">
              {g.presupuestoPorMoneda.map((p) => (
                <li key={p.moneda} className="flex justify-between"><span className="text-slate-600">{p.moneda}</span><span className="font-semibold tabular-nums">{formatearDinero(p.total)}</span></li>
              ))}
              {g.costoPorAsistente.map((p) => (
                <li key={`ca-${p.moneda}`} className="flex justify-between text-xs text-slate-500"><span>Costo por asistente ({p.moneda})</span><span className="tabular-nums">{formatearDinero(p.valor)}</span></li>
              ))}
            </ul>
          )}
        </Panel>
        {g.presupuestoPorRubro.slice(0, 2).map((r) => (
          <Panel key={r.moneda} titulo={`Presupuesto por rubro (${r.moneda})`} tabla={{ encabezados: ["Rubro", "Valor"], filas: r.rubros.map((f) => [f.etiqueta, formatearDinero(f.valor)]) }}>
            <BarrasH filas={r.rubros} formato={formatearDinero} />
          </Panel>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel titulo="HCPs contratados" ayuda="Convenios de pago aprobados o completados de los eventos del período.">
          <p className="text-2xl font-semibold tabular-nums">{formatearEntero(c.hcpsContratados)}</p>
          <p className="text-xs text-slate-500">{formatearEntero(c.convenios)} convenio(s)</p>
          <ul className="mt-3 space-y-1 text-xs">
            {c.porMoneda.map((p) => (
              <li key={p.moneda} className="flex justify-between"><span className="text-slate-600">Contraprestación ({p.moneda})</span><span className="tabular-nums">{formatearDinero(p.total)}</span></li>
            ))}
            {c.promedioPorConvenio.map((p) => (
              <li key={`pr-${p.moneda}`} className="flex justify-between text-slate-500"><span>Promedio por convenio ({p.moneda})</span><span className="tabular-nums">{formatearDinero(p.valor)}</span></li>
            ))}
            {c.facturadoPorMoneda.map((p) => (
              <li key={`fa-${p.moneda}`} className="flex justify-between text-slate-500"><span>Facturado ({p.moneda})</span><span className="tabular-nums">{formatearDinero(p.total)}</span></li>
            ))}
          </ul>
        </Panel>
        <Panel titulo="HCPs con mayor contratación" className="lg:col-span-2" tabla={{ encabezados: ["HCP", "Convenios", "Total", "Moneda"], filas: c.topHcps.map((h) => [h.nombre, h.convenios, formatearDinero(h.total), h.moneda]) }}>
          <BarrasH filas={c.topHcps.map((h) => ({ etiqueta: h.nombre, valor: h.total, detalle: `${h.convenios} convenio(s) · ${h.moneda}` }))} formato={formatearDinero} />
        </Panel>
      </div>

    </>
  );
}

/** Pestaña «Speakers y educación médica». */
function PestanaSpeakers({ g }: { g: IndicadoresGestion }) {
  const s = g.speakers;
  return (
    <>
      <h3 className="pt-2 text-sm font-semibold text-slate-700">Speakers internos y externos</h3>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel titulo="Eventos según quién dicta" tabla={{ encabezados: ["Tipo", "Eventos"], filas: [["Solo internos", s.eventosConInterno], ["Solo externos", s.eventosConExterno], ["Mixtos", s.eventosMixtos], ["Sin speaker", s.eventosSinSpeaker]] }}>
          <Dona
            partes={[
              { etiqueta: "Solo internos", valor: s.eventosConInterno },
              { etiqueta: "Solo externos", valor: s.eventosConExterno },
              { etiqueta: "Mixtos", valor: s.eventosMixtos },
              { etiqueta: "Sin speaker", valor: s.eventosSinSpeaker },
            ]}
          />
        </Panel>
        <Panel titulo="Speakers externos con más actividades" tabla={{ encabezados: ["Speaker", "Participaciones"], filas: s.topExternos.map((f) => [f.etiqueta, f.valor]) }}>
          <BarrasH filas={s.topExternos} color={COLOR.serie2} />
        </Panel>
        <Panel titulo="Speakers internos con más actividades" tabla={{ encabezados: ["Speaker", "Participaciones"], filas: s.topInternos.map((f) => [f.etiqueta, f.valor]) }}>
          <BarrasH filas={s.topInternos} />
        </Panel>
      </div>
      {s.honorariosPorTipo.length > 0 && (
        <Panel titulo="Honorarios e inscripción por tipo de speaker" ayuda="Suma de honorarios e inscripción declarados por speaker, por moneda del evento.">
          <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {s.honorariosPorTipo.map((h) => (
              <li key={h.moneda} className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-500">{h.moneda}</p>
                <p className="flex justify-between"><span className="text-slate-600">Internos</span><span className="tabular-nums">{formatearDinero(h.interno)}</span></p>
                <p className="flex justify-between"><span className="text-slate-600">Externos</span><span className="tabular-nums">{formatearDinero(h.externo)}</span></p>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <SeccionEducacion g={g} />
    </>
  );
}

/** Pestaña «Productos y tiempos». */
function PestanaProductosTiempos({ g }: { g: IndicadoresGestion }) {
  return (
    <>
      <h3 className="pt-2 text-sm font-semibold text-slate-700">Tiempo destinado a las actividades</h3>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel titulo="Duración y anticipación">
          <ul className="space-y-1.5 text-sm">
            <li className="flex justify-between"><span className="text-slate-600">Duración típica del evento</span><span className="font-semibold tabular-nums">{g.tiempo.medianaDiasEvento == null ? "—" : `${g.tiempo.medianaDiasEvento.toFixed(1)} días`}</span></li>
            <li className="flex justify-between"><span className="text-slate-600">Anticipación típica de la solicitud</span><span className="font-semibold tabular-nums">{g.tiempo.diasAnticipacionMediana == null ? "—" : `${Math.round(g.tiempo.diasAnticipacionMediana)} días`}</span></li>
            <li className="flex justify-between"><span className="text-slate-600">Horas en sitio (mediana)</span><span className="font-semibold tabular-nums">{g.tiempo.horasEnSitioMediana == null ? "—" : `${g.tiempo.horasEnSitioMediana.toFixed(1)} h`}</span></li>
            <li className="flex justify-between"><span className="text-slate-600">Horas en sitio (total)</span><span className="font-semibold tabular-nums">{g.tiempo.horasEnSitioTotal.toFixed(1)} h</span></li>
          </ul>
          <p className="mt-2 text-[11px] text-slate-500">Horas en sitio = del primer al último check-in de cada evento ({g.tiempo.eventosMedidos} evento(s) medibles).</p>
        </Panel>
        <Panel titulo="Eventos con más horas en sitio" className="lg:col-span-2" tabla={{ encabezados: ["Evento", "Horas", "Check-ins"], filas: g.tiempo.horasPorEvento.map((h) => [h.nombre, h.horas.toFixed(1), h.participantes]) }}>
          <BarrasH filas={g.tiempo.horasPorEvento.map((h) => ({ etiqueta: h.nombre, valor: h.horas, detalle: `${h.participantes} check-ins` }))} formato={(n) => `${n.toFixed(1)} h`} />
        </Panel>
      </div>

      <SeccionProductos g={g} />
    </>
  );
}

function SeccionEducacion({ g }: { g: IndicadoresGestion }) {
  const e = g.educacion;
  const h1 = (n: number) => `${n.toLocaleString("es-CO", { maximumFractionDigits: 1 })} h`;
  return (
    <section className="space-y-3" data-testid="seccion-educacion">
      <div>
        <h2 className="text-base font-semibold text-slate-800">Educación médica: horas de participación</h2>
        <p className="text-xs text-slate-500">Suma del «tiempo de participación» declarado por cada speaker en sus sesiones, en eventos aprobados o completados.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi etiqueta="Horas de educación médica" valor={h1(e.horasTotales)} detalle={`en ${formatearEntero(e.eventosConHoras)} evento(s)`} testId="kpi-horas-educacion" />
        {e.porTipoSpeaker.map((t) => (
          <Kpi key={t.tipo} etiqueta={`Horas de speakers ${t.tipo.toLowerCase()}s`} valor={h1(t.horas)} detalle={`${t.speakers} speaker(s) · ${t.participaciones} participación(es)`} />
        ))}
        <Kpi etiqueta="Eventos sin horas registradas" valor={formatearEntero(e.eventosSinHoras)} detalle="Anteriores a la captura de horas" />
      </div>
      {e.eventosSinHoras > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          {e.eventosSinHoras} evento(s) con speakers no tienen horas registradas; no suman en estos indicadores.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          titulo="Horas por tipo de evento"
          ayuda="Taller, conferencia, etc. Horas = suma de la participación de los speakers."
          tabla={{ encabezados: ["Tipo de evento", "Eventos", "Participaciones", "Horas", "Promedio h/evento"], filas: e.porTipoEvento.map((t) => [t.tipo, t.eventos, t.participaciones, t.horas.toFixed(1), t.promedioPorEvento == null ? "—" : t.promedioPorEvento.toFixed(1)]) }}
        >
          <BarrasH filas={e.porTipoEvento.map((t) => ({ etiqueta: t.tipo, valor: t.horas, detalle: `${t.eventos} evento(s) · ${t.participaciones} participación(es)` }))} formato={h1} />
        </Panel>
        <Panel
          titulo="Horas por tipo de speaker"
          ayuda="Interno vs. externo, según actividades (eventos) y participaciones (sesiones)."
          tabla={{ encabezados: ["Tipo", "Speakers", "Actividades", "Participaciones", "Horas", "Promedio h/participación"], filas: e.porTipoSpeaker.map((t) => [t.tipo, t.speakers, t.actividades, t.participaciones, t.horas.toFixed(1), t.promedioPorParticipacion == null ? "—" : t.promedioPorParticipacion.toFixed(1)]) }}
        >
          <Dona partes={e.porTipoSpeaker.map((t) => ({ etiqueta: t.tipo, valor: t.horas }))} formato={h1} />
        </Panel>
        <Panel
          titulo="Speakers con más horas"
          className="lg:col-span-2"
          tabla={{ encabezados: ["Speaker", "Tipo", "Eventos", "Participaciones", "Horas"], filas: e.topSpeakers.map((t) => [t.nombre, t.tipo, t.eventos, t.participaciones, t.horas.toFixed(1)]) }}
        >
          <BarrasH filas={e.topSpeakers.map((t) => ({ etiqueta: `${t.nombre} (${t.tipo === "Interno" ? "INT" : "EXT"})`, valor: t.horas, detalle: `${t.eventos} evento(s) · ${t.participaciones} participación(es)` }))} formato={h1} color={COLOR.serie2} />
        </Panel>
      </div>
    </section>
  );
}

function SeccionProductos({ g }: { g: IndicadoresGestion }) {
  const p = g.productos;
  return (
    <section className="space-y-3" data-testid="seccion-productos">
      <div>
        <h2 className="text-base font-semibold text-slate-800">Productos de los eventos</h2>
        <p className="text-xs text-slate-500">Relación entre los eventos realizados (aprobados o completados) y los productos del portafolio; se señala dónde cada producto fue el principal.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi etiqueta="Eventos con producto" valor={formatearEntero(p.eventosConProducto)} />
        <Kpi etiqueta="Eventos sin producto" valor={formatearEntero(p.eventosSinProducto)} detalle="No indicaron productos" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          titulo="Eventos por producto"
          ayuda="Total de eventos que lo incluyen y cuántos lo tuvieron como producto principal."
          className="lg:col-span-2"
          tabla={{ encabezados: ["Producto", "Línea", "Eventos", "Como principal", "Horas como principal"], filas: p.filas.map((f) => [f.producto, f.linea || "—", f.eventos, f.comoPrincipal, f.horasComoPrincipal.toFixed(1)]) }}
        >
          {p.filas.length === 0 ? (
            <SinDatos />
          ) : (
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-1.5 pr-3 font-medium">Producto</th>
                    <th className="py-1.5 pr-3 font-medium">Línea</th>
                    <th className="py-1.5 pr-3 font-medium">Eventos</th>
                    <th className="py-1.5 pr-3 font-medium">Principal en</th>
                    <th className="py-1.5 pr-3 font-medium">Horas (principal)</th>
                  </tr>
                </thead>
                <tbody>
                  {p.filas.map((f) => (
                    <tr key={f.producto} className="border-b border-slate-100 text-slate-700">
                      <td className="py-1.5 pr-3 font-medium">{f.producto}</td>
                      <td className="py-1.5 pr-3">{f.linea || "—"}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{f.eventos}</td>
                      <td className="py-1.5 pr-3 tabular-nums">
                        {f.comoPrincipal > 0 ? <span className="rounded-full bg-sky-100 px-2 py-0.5 font-medium text-sky-800">★ {f.comoPrincipal}</span> : "—"}
                      </td>
                      <td className="py-1.5 pr-3 tabular-nums">{f.horasComoPrincipal.toFixed(1)} h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel titulo="Eventos por línea (producto principal)" tabla={{ encabezados: ["Línea", "Eventos"], filas: p.porLineaPrincipal.map((f) => [f.etiqueta, f.valor]) }}>
          <BarrasH filas={p.porLineaPrincipal} color={COLOR.serie3} />
        </Panel>
      </div>
    </section>
  );
}

// ================================================================================================ USO

function PestanaUsoApp({ u, onExportar }: { u: IndicadoresUso; onExportar: () => void }) {
  const sinDatos = u.sesiones === 0;
  return (
    <>
      {sinDatos && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Aún no hay mediciones en este período. La app empieza a medir cuando cada usuario inicia sesión con la versión nueva.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi etiqueta="Sesiones" valor={formatearEntero(u.sesiones)} detalle={`${u.usuariosUnicos} usuario(s) distintos`} testId="kpi-sesiones" />
        <Kpi etiqueta="Tiempo conectado por sesión" valor={formatearDuracion((u.promedioConectadoSeg ?? NaN) * 1000)} detalle={`Mediana ${formatearDuracion((u.medianaConectadoSeg ?? NaN) * 1000)}`} />
        <Kpi etiqueta="Conectado por usuario y día" valor={formatearDuracion((u.conectadoPorUsuarioDiaSeg ?? NaN) * 1000)} />
        <Kpi etiqueta="Tiempo realmente activo" valor={pct(u.proporcionActiva)} detalle="Interacción real sobre el tiempo conectado" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel titulo="Sesiones por día" tabla={{ encabezados: ["Día", "Sesiones", "Usuarios"], filas: u.sesionesPorDia.map((d) => [d.dia, d.sesiones, d.usuarios]) }}>
          <Columnas datos={u.sesionesPorDia.map((d) => ({ etiqueta: d.dia, valor: d.sesiones, extra: `${d.usuarios} usuario(s)` }))} />
        </Panel>
        <Panel titulo="¿Cuándo se usa la aplicación?">
          <MapaCalor matriz={u.mapaCalor} />
        </Panel>
      </div>

      <div className="grid gap-4">
        <Panel titulo="Páginas donde más tiempo se pasa" tabla={{ encabezados: ["Página", "Visitas", "Tiempo total", "Promedio"], filas: u.paginas.map((p) => [etiquetaPag(p.pagina), p.visitas, formatearDuracion(p.totalMs), formatearDuracion(p.promedioMs)]) }}>
          <BarrasH filas={u.paginas.slice(0, 10).map((p) => ({ etiqueta: etiquetaPag(p.pagina), valor: p.totalMs, detalle: `${p.visitas} visitas` }))} formato={(n) => formatearDuracion(n)} />
        </Panel>
      </div>
      <Panel titulo="Mapa de interacción por usuario" ayuda="Tiempo conectado y activo de cada usuario en el período.">
        <div className="mb-2 flex justify-end">
          <EtiquetaTamano className="mr-3 self-center" bytes={bytesDeCsv(["Usuario", "Sesiones", "Minutos conectado", "Minutos activo", "Promedio por sesión (min)", "Última conexión"], u.porUsuario.map((r) => [r.nombre, r.sesiones, Math.round(r.conectadoSeg / 60), Math.round(r.activoSeg / 60), Math.round(r.promedioSesionSeg / 60), r.ultima]))} />
          <Button variant="outline" size="sm" onClick={onExportar} disabled={u.porUsuario.length === 0}>
            <Download className="mr-1.5 h-4 w-4" /> Exportar CSV
          </Button>
        </div>
        {u.porUsuario.length === 0 ? (
          <SinDatos />
        ) : (
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-1.5 pr-3 font-medium">Usuario</th>
                  <th className="py-1.5 pr-3 font-medium">Sesiones</th>
                  <th className="py-1.5 pr-3 font-medium">Conectado</th>
                  <th className="py-1.5 pr-3 font-medium">Activo</th>
                  <th className="py-1.5 pr-3 font-medium">Promedio por sesión</th>
                  <th className="py-1.5 pr-3 font-medium">Última conexión</th>
                </tr>
              </thead>
              <tbody>
                {u.porUsuario.map((r) => (
                  <tr key={r.usuarioId} className="border-b border-slate-100 text-slate-700">
                    <td className="py-1.5 pr-3">{r.nombre}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{r.sesiones}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{formatearDuracion(r.conectadoSeg * 1000)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{formatearDuracion(r.activoSeg * 1000)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{formatearDuracion(r.promedioSesionSeg * 1000)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{formatearFechaHora(r.ultima)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

/** Pestaña «Procesos documentales»: tiempos de diligenciamiento, revisión y aprobación. */
function PestanaProcesos({ u }: { u: IndicadoresUso }) {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          titulo="Tiempo de diligenciamiento por formulario"
          ayuda="Tiempo activo hasta enviar (mediana). Los borradores y abandonos se cuentan aparte."
          tabla={{
            encabezados: ["Formulario", "Enviados", "Borradores", "Abandonos", "Mediana", "Promedio", "P90", "% abandono"],
            filas: u.formularios.map((f) => [etiquetaTipo(f.tipoDoc), f.enviados, f.borradores, f.abandonados, formatearDuracion(f.medianaActivoMs), formatearDuracion(f.promedioActivoMs), formatearDuracion(f.p90ActivoMs), pct(f.tasaAbandono)]),
          }}
        >
          <BarrasH filas={u.formularios.filter((f) => f.medianaActivoMs != null).map((f) => ({ etiqueta: etiquetaTipo(f.tipoDoc), valor: f.medianaActivoMs as number, detalle: `${f.enviados} enviados · ${pct(f.tasaAbandono)} abandono` }))} formato={(n) => formatearDuracion(n)} />
        </Panel>
        <Panel
          titulo="Revisión y firma por tipo de documento"
          ayuda="Tiempo activo con la ventana del documento abierta (mediana) y tasa de rechazo/devolución."
          tabla={{
            encabezados: ["Documento", "Revisiones", "Mediana", "Promedio", "Aprobadas", "Rechazadas", "Devueltas", "% rechazo"],
            filas: u.revisiones.map((r) => [etiquetaTipo(r.tipoDoc), r.revisiones, formatearDuracion(r.medianaActivoMs), formatearDuracion(r.promedioActivoMs), r.aprobadas, r.rechazadas, r.devueltas, pct(r.tasaRechazo)]),
          }}
        >
          <BarrasH filas={u.revisiones.filter((r) => r.medianaActivoMs != null).map((r) => ({ etiqueta: etiquetaTipo(r.tipoDoc), valor: r.medianaActivoMs as number, detalle: `${r.revisiones} revisiones · ${pct(r.tasaRechazo)} rechazo` }))} formato={(n) => formatearDuracion(n)} color={COLOR.serie3} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel titulo="Ciclo de aprobación" ayuda="Días entre el envío y la aprobación final (mediana), según la auditoría." tabla={{ encabezados: ["Documento", "Documentos", "Mediana (d)", "Promedio (d)"], filas: u.cicloAprobacion.map((c) => [etiquetaTipo(c.tipoDoc), c.documentos, c.medianaDias?.toFixed(1) ?? "—", c.promedioDias?.toFixed(1) ?? "—"]) }}>
          <BarrasH filas={u.cicloAprobacion.filter((c) => c.medianaDias != null).map((c) => ({ etiqueta: etiquetaTipo(c.tipoDoc), valor: c.medianaDias as number, detalle: `${c.documentos} documentos` }))} formato={(n) => `${n.toFixed(1)} d`} color={COLOR.serie2} />
        </Panel>
        <Panel titulo="Carga de archivos">
          <ul className="space-y-1.5 text-sm">
            <li className="flex justify-between"><span className="text-slate-600">Cargas</span><span className="font-semibold tabular-nums">{formatearEntero(u.archivos.cargas)}</span></li>
            <li className="flex justify-between"><span className="text-slate-600">Con error</span><span className="tabular-nums">{formatearEntero(u.archivos.errores)}</span></li>
            <li className="flex justify-between"><span className="text-slate-600">Tiempo típico</span><span className="tabular-nums">{formatearDuracion(u.archivos.medianaMs)}</span></li>
            <li className="flex justify-between"><span className="text-slate-600">Tamaño promedio</span><span className="tabular-nums">{u.archivos.tamanoPromedioBytes == null ? "—" : `${(u.archivos.tamanoPromedioBytes / 1048576).toFixed(2)} MB`}</span></li>
            <li className="flex justify-between"><span className="text-slate-600">Volumen total</span><span className="tabular-nums">{(u.archivos.bytesTotales / 1048576).toFixed(1)} MB</span></li>
          </ul>
        </Panel>
        <Panel titulo="Acciones medidas" ayuda="Generación de PDF, envíos por correo, descargas…" tabla={{ encabezados: ["Acción", "Veces", "Errores", "Tiempo prom."], filas: u.acciones.map((a) => [a.nombre, a.cantidad, a.errores, formatearDuracion(a.promedioMs)]) }}>
          <BarrasH filas={u.acciones.slice(0, 8).map((a) => ({ etiqueta: a.nombre, valor: a.cantidad, detalle: `${a.errores} errores` }))} />
        </Panel>
      </div>

      <div className="grid gap-4">
        <Panel titulo="Tiempo de interacción por evento" ayuda="Suma del tiempo activo de diligenciar y revisar los documentos de cada evento." tabla={{ encabezados: ["Evento", "Documentos", "Diligenciar", "Revisar"], filas: u.porEvento.map((e) => [e.nombre, e.documentos, formatearDuracion(e.formulariosMs), formatearDuracion(e.revisionMs)]) }}>
          <BarrasH filas={u.porEvento.slice(0, 8).map((e) => ({ etiqueta: e.nombre, valor: e.formulariosMs + e.revisionMs, detalle: `${e.documentos} documentos` }))} formato={(n) => formatearDuracion(n)} color={COLOR.serie1} />
        </Panel>
      </div>

    </>
  );
}
