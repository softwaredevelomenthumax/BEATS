import * as React from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Activity, CalendarDays, Clock, Globe2, MapPin, RefreshCw, Sparkles, Users } from "lucide-react";
import { IconoMuestraMedica } from "@/components/IconoMuestraMedica";
import { SelectorSesionEvento } from "@/components/SelectorSesionEvento";
import { TODAS_LAS_SESIONES, fechaSesion, ubicacionSesion, type SesionVista } from "@/lib/sesionesVista";
import { ubicacionTexto } from "@/lib/ubicacionVisible";
import { BloqueMapa } from "@/components/mapa/BloqueMapa";
import { AvisosCheckin, useCheckinsNuevos, type CheckinLite } from "@/components/mapa/checkinsNuevos";
import { ETIQUETA_TIPO_PARTICIPACION } from "@/lib/indicadores";
import { esEventoVirtual } from "@/lib/geo/geo";
import {
  traerCodigosAccesoActivos,
  traerRegistrosParticipacion,
  traerMuestrasEntregadas,
  calcularResumenEjecucion,
  type CodigoAccesoConEvento,
} from "@/lib/ejecucion";
import { traerEventos } from "@/lib/evento";
import { traerPortafolioProductos } from "@/lib/productos";
import { mensajeErrorAmigable } from "@/lib/supabaseClient";
import { useCompania, filtrarPorEmpresaGrupo } from "@/hooks/useCompania";
import { formatearFecha } from "@/lib/fecha";
import type { Evento, MuestraEntregada, ProductoPortafolio, RegistroParticipacion } from "@/types";

const SONDEO_MS = 10_000;

/**
 * Panel en Vivo vive DENTRO del app principal (con sesión) — a diferencia
 * de la Marquesina (Fase 8, pantalla pública de kiosco sin login que
 * sondea la RPC `resumen_ejecucion_evento`), este panel recalcula el mismo
 * resumen directo de las tablas (`registros_participacion`/
 * `muestras_entregadas`), porque el personal autenticado ya tiene acceso
 * de lectura normal vía RLS — no necesita pasar por la RPC pública pensada
 * para un dispositivo sin sesión. Mismo sondeo de 15s que la Marquesina,
 * por consistencia de la experiencia "en vivo".
 */
export function PanelEnVivo() {
  const { companiaActual } = useCompania();
  const [codigos, setCodigos] = React.useState<CodigoAccesoConEvento[]>([]);
  const [eventos, setEventos] = React.useState<Evento[]>([]);
  const [productos, setProductos] = React.useState<ProductoPortafolio[]>([]);
  const [eventoId, setEventoId] = React.useState<string>("");
  // Entrega 33: se guardan los datos crudos y el resumen se calcula según la sesión elegida (evento de varias sesiones).
  const [registrosTodos, setRegistrosTodos] = React.useState<RegistroParticipacion[]>([]);
  const [muestrasTodas, setMuestrasTodas] = React.useState<MuestraEntregada[] | null>(null);
  const [sesionElegida, setSesionElegida] = React.useState<string>(TODAS_LAS_SESIONES);
  const [cargando, setCargando] = React.useState(true);
  const [ultimaActualizacion, setUltimaActualizacion] = React.useState<Date | null>(null);

  React.useEffect(() => {
    Promise.all([traerCodigosAccesoActivos(), traerEventos(), traerPortafolioProductos()])
      .then(([c, e, p]) => {
        // Selector de compañía del grupo (pedido explícito, octubre 2026):
        // solo se ofrecen para el panel los eventos (y sus códigos de
        // acceso) de la compañía actual.
        const eventosDeCompania = filtrarPorEmpresaGrupo(e, companiaActual);
        const idsEventosDeCompania = new Set(eventosDeCompania.map((ev) => ev.id));
        const codigosDeCompania = c.filter((codigo) => idsEventosDeCompania.has(codigo.eventoId));
        setCodigos(codigosDeCompania);
        setEventos(eventosDeCompania);
        setProductos(p);
        if (codigosDeCompania.length > 0) setEventoId(codigosDeCompania[0].eventoId);
      })
      .catch((error) => toast.error(mensajeErrorAmigable(error)))
      .finally(() => setCargando(false));
  }, [companiaActual]);

  const actualizarResumen = React.useCallback(() => {
    if (!eventoId) return;
    Promise.all([traerRegistrosParticipacion(eventoId), traerMuestrasEntregadas(eventoId)])
      .then(([r, m]) => {
        setRegistrosTodos(r);
        setMuestrasTodas(m);
        setUltimaActualizacion(new Date());
      })
      .catch((error) => toast.error(mensajeErrorAmigable(error)));
  }, [eventoId]);

  // Al cambiar de evento se parte de cero (así no se anuncian como «nuevos» los del evento anterior).
  React.useEffect(() => {
    setMuestrasTodas(null);
    setRegistrosTodos([]);
    setSesionElegida(TODAS_LAS_SESIONES);
  }, [eventoId]);

  React.useEffect(() => {
    actualizarResumen();
    const intervalo = setInterval(actualizarResumen, SONDEO_MS);
    return () => clearInterval(intervalo);
  }, [actualizarResumen]);

  const evento = eventos.find((e) => e.id === eventoId) ?? null;

  // Entrega 33: sesiones del evento (solo si tiene varias) y la elegida. Los check-ins se asocian por `sesionEventoId`.
  const sesiones: SesionVista[] = React.useMemo(
    () =>
      (evento?.sesiones.length ?? 0) > 1
        ? evento!.sesiones.map((s, i) => ({
            id: s.id,
            numero: i + 1,
            fecha: s.fecha,
            lugar: s.lugar,
            pais: s.pais,
            estadoProvincia: s.estadoProvincia,
            ciudad: s.ciudad,
            esperados: s.numeroAsistentesEsperados,
            registros: registrosTodos.filter((r) => r.sesionEventoId === s.id).length,
          }))
        : [],
    [evento, registrosTodos],
  );
  const sesion = sesiones.find((s) => s.id === sesionElegida) ?? null;
  const registros = React.useMemo(() => (sesion ? registrosTodos.filter((r) => r.sesionEventoId === sesion.id) : registrosTodos), [registrosTodos, sesion]);
  const resumen = React.useMemo(() => {
    if (!muestrasTodas) return null;
    const idsRegistros = new Set(registros.map((r) => r.id));
    return calcularResumenEjecucion(registros, sesion ? muestrasTodas.filter((m) => idsRegistros.has(m.registroParticipacionId)) : muestrasTodas);
  }, [registros, muestrasTodas, sesion]);
  const nombreProducto = (id: string) => productos.find((p) => p.id === id)?.nombre ?? "(producto eliminado)";

  const ahora = useAhora(1000);
  // Últimos check-ins. Entrega 32: esta es la vista INTERNA, así que además de iniciales, especialidad y ciudad muestra el nombre del asistente (la marquesina sigue sin datos personales).
  const ultimos: CheckinLite[] = React.useMemo(
    () =>
      registros.slice(0, 8).map((r) => ({
        id: r.id,
        nombre: `${r.nombres} ${r.apellidos}`.replace(/\s+/g, " ").trim(),
        iniciales: `${r.nombres.trim()[0] ?? ""}${r.apellidos.trim()[0] ?? ""}`.toUpperCase(),
        especialidad: r.especialidad || r.especialidadOtra || r.profesion || "",
        ciudad: r.ciudad,
        pais: r.pais,
        tipo: r.tipoParticipacion,
        capturadoEn: r.capturadoEn,
      })),
    [registros],
  );
  const total = resumen?.totalParticipantes ?? 0;
  const paisEvento = (sesion?.pais || evento?.pais) || null;
  const { avisos, recientes } = useCheckinsNuevos(resumen ? ultimos : null, total, paisEvento, `${eventoId}:${sesion?.id ?? TODAS_LAS_SESIONES}`);

  const entradasMapa = React.useMemo(() => {
    const m = new Map<string, { pais: string; ciudad: string; total: number }>();
    for (const r of registros) {
      if (!r.ciudad) continue;
      const k = `${r.pais}|${r.ciudad}`.toLowerCase();
      const f = m.get(k);
      if (f) f.total += 1;
      else m.set(k, { pais: r.pais, ciudad: r.ciudad, total: 1 });
    }
    return [...m.values()];
  }, [registros]);

  const llegadas = React.useMemo(() => {
    const porHora = new Map<number, number>();
    for (const r of registros) {
      const d = new Date(r.capturadoEn);
      d.setMinutes(0, 0, 0);
      porHora.set(d.getTime(), (porHora.get(d.getTime()) ?? 0) + 1);
    }
    if (porHora.size === 0) return [];
    const horas = [...porHora.keys()];
    const ini = Math.min(...horas);
    const fin = Math.max(...horas);
    const salida: { etiqueta: string; total: number }[] = [];
    for (let t = ini; t <= fin && salida.length < 24; t += 3_600_000) salida.push({ etiqueta: `${new Date(t).getHours()}h`, total: porHora.get(t) ?? 0 });
    return salida;
  }, [registros]);

  const esperados = sesion ? sesion.esperados : (evento?.numeroAsistentes ?? null);
  const fraccion = esperados ? Math.min(1, total / esperados) : null;
  const segundosDesde = ultimaActualizacion ? Math.max(0, Math.round((ahora.getTime() - ultimaActualizacion.getTime()) / 1000)) : null;
  const modalidad = esEventoVirtual(evento?.modalidadEvento);
  const partes = [
    { clave: "evento", color: AZUL },
    { clave: "taller", color: NARANJA },
    { clave: "stand", color: VERDE },
  ].map((p) => ({ ...p, etiqueta: ETIQUETA_TIPO_PARTICIPACION[p.clave], valor: resumen?.porTipoParticipacion.find((t) => t.tipo === p.clave)?.cantidad ?? 0 }));
  const otros = (resumen?.porTipoParticipacion ?? []).filter((t) => !["evento", "taller", "stand"].includes(t.tipo));
  const maxLlegadas = Math.max(...llegadas.map((l) => l.total), 1);
  const ranking = (resumen?.porProductoId ?? []).slice().sort((a, b) => b.cantidad - a.cantidad);
  const maxProducto = Math.max(...ranking.map((p) => p.cantidad), 1);

  return (
    <div className="pv flex flex-col gap-5">
      <style>{ESTILOS}</style>
      <AvisosCheckin avisos={avisos} arriba={84} />

      <div>
        <h1 className="text-2xl font-semibold">Panel en Vivo</h1>
        <p className="text-sm text-muted-foreground">Conteos de ejecución en sitio, actualizados cada 10 segundos, de un evento con un código de acceso activo hoy.</p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-1.5 pt-6">
          <Label htmlFor="pev-evento">Evento en ejecución</Label>
          <Select value={eventoId} onValueChange={setEventoId}>
            <SelectTrigger id="pev-evento" className="max-w-md">
              <SelectValue placeholder={cargando ? "Cargando..." : "Selecciona un evento"} />
            </SelectTrigger>
            <SelectContent>
              {codigos.map((c) => {
                const e = eventos.find((ev) => ev.id === c.eventoId);
                return (
                  <SelectItem key={c.id} value={c.eventoId}>
                    {e?.nombreEvento ?? c.eventoId} — código {c.codigo}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {!cargando && codigos.length === 0 && (
            <p className="text-sm text-muted-foreground">No hay ningún código de acceso activo en este momento.</p>
          )}
        </CardContent>
      </Card>

      {evento && resumen && (
        <div className="flex flex-col gap-5" data-testid="panel-vivo-tablero">
          {/* Cabecera «en vivo» (misma identidad que la marquesina) */}
          <header className="pv-banda overflow-hidden rounded-2xl text-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] opacity-90">
                  <span className="pv-live inline-block h-2.5 w-2.5 rounded-full bg-green-400" /> En vivo
                </p>
                <h2 className="mt-1 truncate text-3xl font-bold leading-tight" style={{ color: "#fff" }}>{evento.nombreEvento}</h2>
                <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm opacity-95">
                  <span className="flex items-center gap-1.5" data-testid="panel-vivo-ubicacion"><MapPin className="h-4 w-4" />{(sesion ? ubicacionSesion(sesion, evento) : ubicacionTexto([evento.direccion, evento.ciudad, evento.pais])) || "—"}</span>
                  <span className="flex items-center gap-1.5" data-testid="panel-vivo-fechas"><CalendarDays className="h-4 w-4" />
                    {sesion ? (
                      <>Sesión {sesion.numero} · {fechaSesion(sesion)}</>
                    ) : (
                      <>
                        {formatearFecha(evento.fechaInicioEvento)}
                        {evento.fechaFinEvento && evento.fechaFinEvento !== evento.fechaInicioEvento ? ` — ${formatearFecha(evento.fechaFinEvento)}` : ""}
                      </>
                    )}
                  </span>
                  <span className="flex items-center gap-1.5"><Globe2 className="h-4 w-4" />{modalidad === "virtual" ? "Virtual" : modalidad === "mixto" ? "Híbrido" : "Presencial"}</span>
                </p>
                <SelectorSesionEvento className="mt-3" tema="sobre-color" sesiones={sesiones} seleccion={sesion ? sesion.id : TODAS_LAS_SESIONES} onChange={setSesionElegida} />
              </div>
              <div className="text-right">
                <p className="flex items-center justify-end gap-2 text-4xl font-light tabular-nums leading-none"><Clock className="h-6 w-6 opacity-80" />{ahora.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</p>
                <p className="mt-1 flex items-center justify-end gap-1.5 text-xs opacity-90" data-testid="panel-vivo-actualizado">
                  <RefreshCw className="h-3.5 w-3.5" />
                  {ultimaActualizacion ? `Actualizado hace ${segundosDesde ?? 0} s` : "Actualizando..."}
                </p>
              </div>
            </div>
          </header>

          {/* Cifras principales */}
          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="pv-in lg:col-span-3">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Users className="h-4 w-4 text-[#00A3E0]" /> Total registrados</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap items-center justify-center gap-6 pb-6">
                {fraccion != null && <AnilloVivo fraccion={fraccion} />}
                <div className="text-center">
                  <div className="text-7xl font-black leading-none tabular-nums" style={{ color: AZUL_OSCURO }} data-testid="panel-vivo-total">{resumen.totalParticipantes}</div>
                  <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">{esperados ? `de ${esperados.toLocaleString("es-CO")} esperados` : "asistentes con check-in"}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="pv-in lg:col-span-2" style={{ animationDelay: "100ms" }}>
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><IconoMuestraMedica className="h-4 w-4 text-[#00A3E0]" /> Muestras entregadas</CardTitle></CardHeader>
              <CardContent>
                <div className="text-5xl font-black tabular-nums" style={{ color: NARANJA }}>{resumen.totalMuestras}</div>
                <p className="mt-1 text-xs text-muted-foreground">{ranking.length} producto(s) entregado(s)</p>
              </CardContent>
            </Card>
          </div>

          {/* Mapa */}
          <Card className="pv-in">
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Globe2 className="h-4 w-4 text-[#00A3E0]" /> {modalidad === "virtual" ? "Desde dónde se conectan" : "Dónde ocurre y de dónde vienen"}</CardTitle></CardHeader>
            <CardContent>
              <BloqueMapa entradas={entradasMapa} paisEvento={paisEvento} ciudadEvento={sesion?.ciudad || evento.ciudad} modalidad={evento.modalidadEvento} recientes={recientes} alto={420} />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="pv-in">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-[#00A3E0]" /> Por tipo de participación</CardTitle></CardHeader>
              <CardContent>
                {resumen.porTipoParticipacion.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin registros todavía.</p>
                ) : (
                  <>
                    <div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
                      {partes.map((p) => (
                        <span key={p.clave} style={{ width: `${(p.valor / Math.max(total, 1)) * 100}%`, background: p.color, marginRight: p.valor ? 2 : 0, transition: "width 1s cubic-bezier(.2,.8,.2,1)" }} title={`${p.etiqueta}: ${p.valor}`} />
                      ))}
                    </div>
                    <ul className="mt-3 space-y-1.5 text-sm" data-testid="panel-vivo-tipos">
                      {partes.map((p) => (
                        <li key={p.clave} className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
                          <span className="flex-1">{p.etiqueta}</span>
                          <span className="font-semibold tabular-nums">{p.valor}</span>
                        </li>
                      ))}
                      {otros.map((t) => (
                        <li key={t.tipo} className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-sm bg-slate-400" />
                          <span className="flex-1">{t.tipo}</span>
                          <span className="font-semibold tabular-nums">{t.cantidad}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="pv-in">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4 text-[#00A3E0]" /> Llegadas por hora</CardTitle></CardHeader>
              <CardContent>
                {llegadas.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Aún no hay llegadas registradas.</p>
                ) : (
                  <div className="flex h-36 items-end gap-1.5">
                    {llegadas.map((l, i) => (
                      <div key={i} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${l.etiqueta}: ${l.total}`}>
                        <span className="text-[11px] font-semibold tabular-nums">{l.total || ""}</span>
                        <span className="w-full max-w-8 rounded-t-md" style={{ height: `${Math.max(l.total ? 6 : 2, (l.total / maxLlegadas) * 90)}px`, background: AZUL, opacity: l.total ? 1 : 0.25, transition: "height .8s cubic-bezier(.2,.8,.2,1)" }} />
                        <span className="text-[10px] text-muted-foreground">{l.etiqueta}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="pv-in">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4 text-[#00A3E0]" /> Últimos check-ins</CardTitle></CardHeader>
              <CardContent>
                {ultimos.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Esperando el primer check-in…</p>
                ) : (
                  <ul className="space-y-2" data-testid="panel-vivo-ultimos">
                    {ultimos.slice(0, 6).map((u) => (
                      <li key={u.id} className="pv-fila flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: u.tipo === "taller" ? NARANJA : u.tipo === "stand" ? VERDE : AZUL }}>{u.iniciales || "·"}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium" data-testid="panel-vivo-ultimo-nombre">{u.nombre || u.especialidad || "Profesional de la salud"}</span>
                          <span className="block truncate text-xs text-muted-foreground">{[u.nombre ? u.especialidad : "", u.ciudad, ETIQUETA_TIPO_PARTICIPACION[u.tipo] ?? u.tipo].filter(Boolean).join(" · ")}</span>
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{haceCuanto(u.capturadoEn, ahora)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="pv-in">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><IconoMuestraMedica className="h-4 w-4 text-[#00A3E0]" /> Ranking de muestras entregadas</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-2.5">
                {ranking.length === 0 && <p className="text-sm text-muted-foreground">Sin muestras entregadas todavía.</p>}
                {ranking.map((p) => (
                  <div key={p.productoId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
                    <span className="truncate">{nombreProducto(p.productoId)}</span>
                    <span className="font-semibold tabular-nums">{p.cantidad}</span>
                    <span className="col-span-2 block h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full rounded-full" style={{ width: `${Math.max(3, (p.cantidad / maxProducto) * 100)}%`, background: AZUL, transition: "width 1s cubic-bezier(.2,.8,.2,1)" }} />
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Piezas y estilos (mismo lenguaje visual que la marquesina) ---------------------------------------------

const AZUL = "#00A3E0";
const AZUL_OSCURO = "#0091c8";
const NARANJA = "#eb6834";
const VERDE = "#1baf7a";

const ESTILOS = `
@keyframes pv-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes pv-pulso{0%{box-shadow:0 0 0 0 rgba(34,197,94,.55)}100%{box-shadow:0 0 0 10px rgba(34,197,94,0)}}
@keyframes pv-shimmer{0%{background-position:0% 50%}100%{background-position:200% 50%}}
@keyframes pv-fila{from{opacity:0;transform:translateX(-18px);background:#e0f4fc}to{opacity:1;transform:none;background:#fff}}
.pv-in{animation:pv-in .55s cubic-bezier(.2,.8,.2,1) both}
.pv-live{animation:pv-pulso 1.6s ease-out infinite}
.pv-banda{background:linear-gradient(110deg,${AZUL_OSCURO},${AZUL},#4fc3ee,${AZUL},${AZUL_OSCURO});background-size:200% 100%;animation:pv-shimmer 14s linear infinite}
.pv-fila{animation:pv-fila .9s ease-out both}
@media (prefers-reduced-motion:reduce){.pv *{animation:none!important;transition:none!important}}
`;

function useAhora(intervaloMs: number): Date {
  const [ahora, setAhora] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), intervaloMs);
    return () => window.clearInterval(id);
  }, [intervaloMs]);
  return ahora;
}

function haceCuanto(iso: string, ahora: Date): string {
  const m = Math.max(0, Math.round((ahora.getTime() - new Date(iso).getTime()) / 60_000));
  return m < 1 ? "ahora" : m < 60 ? `hace ${m} min` : `hace ${Math.floor(m / 60)} h`;
}

function AnilloVivo({ fraccion }: { fraccion: number }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={R} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle cx="60" cy="60" r={R} fill="none" stroke={AZUL} strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - fraccion)} style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(.2,.8,.2,1)" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tabular-nums" style={{ color: AZUL_OSCURO }}>{Math.round(fraccion * 100)}%</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">de lo esperado</span>
      </div>
    </div>
  );
}
