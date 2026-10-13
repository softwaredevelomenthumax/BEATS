import * as React from "react";
import { Activity, CalendarDays, Globe2, MapPin, Pause, Play, Presentation, LayoutGrid, Sparkles, Users, WifiOff } from "lucide-react";
import type { AmpliadoMarquesina, ResumenEjecucionEvento } from "../lib/rpc";
import { formatearFecha, formatearFechaHora } from "@/lib/fecha";
import { IconoMuestraMedica } from "@/components/IconoMuestraMedica";
import { SelectorSesionEvento } from "@/components/SelectorSesionEvento";
import { TODAS_LAS_SESIONES, fechaSesion, ubicacionSesion } from "@/lib/sesionesVista";
import { ubicacionTexto } from "@/lib/ubicacionVisible";
import { BloqueMapa } from "@/components/mapa/BloqueMapa";
import { AvisosCheckin, useCheckinsNuevos } from "@/components/mapa/checkinsNuevos";

interface Props {
  resumen: ResumenEjecucionEvento;
  ampliado: AmpliadoMarquesina | null;
  sinConexion: boolean;
  ultimaActualizacion: Date | null;
  onCambiarCodigo: () => void;
}

/* ------------------------------------------------------------------------------------------------
 * Entrega 30 — Marquesina como tablero interno en vivo. Identidad corporativa (azul #00A3E0, gris
 * #494c4f, tipografía Roboto del resto de BEATS). Animaciones: contadores que suben, anillo de
 * cumplimiento, barras que crecen, check-ins que entran, pulso «en vivo». Respeta «reducir movimiento».
 * Dos modos: Panorama (todo a la vez) y Carrusel (una lámina cada 12 s, para pantallas de sala).
 * ---------------------------------------------------------------------------------------------- */

const AZUL = "#00A3E0";
const AZUL_OSCURO = "#0091c8";
const GRIS = "#494c4f";
const NARANJA = "#eb6834"; // categórico 2 (paleta validada)
const AQUA = "#1baf7a"; // categórico 3
const SEGUNDOS_POR_LAMINA = 12;

const ESTILOS = `
.mq{font-family:var(--font-body);color:${GRIS}}
@keyframes mq-in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes mq-pop{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.15);opacity:1}100%{transform:scale(1)}}
@keyframes mq-pulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,.55)}100%{box-shadow:0 0 0 10px rgba(34,197,94,0)}}
@keyframes mq-shimmer{0%{background-position:0% 50%}100%{background-position:200% 50%}}
@keyframes mq-slide{from{opacity:0;transform:translateX(-24px);background:#e0f4fc}to{opacity:1;transform:none;background:#fff}}
@keyframes mq-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes mq-prog{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes mq-fade{from{opacity:0;transform:scale(.98)}to{opacity:1;transform:none}}
.mq-in{animation:mq-in .6s cubic-bezier(.2,.8,.2,1) both}
.mq-pop{animation:mq-pop .5s cubic-bezier(.2,.8,.2,1) both}
.mq-live{animation:mq-pulse 1.6s ease-out infinite}
.mq-fade{animation:mq-fade .5s ease-out both}
.mq-banda{background:linear-gradient(110deg,${AZUL_OSCURO},${AZUL},#4fc3ee,${AZUL},${AZUL_OSCURO});background-size:200% 100%;animation:mq-shimmer 14s linear infinite}
.mq-fila{animation:mq-slide .9s ease-out both}
.mq-prog{transform-origin:left;animation:mq-prog ${SEGUNDOS_POR_LAMINA}s linear both}
@media (prefers-reduced-motion:reduce){.mq *{animation:none!important;transition:none!important}}
`;

// ---- Hooks de animación ------------------------------------------------------------------------------

function useReducirMovimiento(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** Número que sube/baja suavemente hasta el valor nuevo. */
function useContador(valor: number, duracionMs = 1100): number {
  const reducir = useReducirMovimiento();
  const [mostrado, setMostrado] = React.useState(reducir ? valor : 0);
  const desde = React.useRef(reducir ? valor : 0);
  React.useEffect(() => {
    if (reducir) {
      setMostrado(valor);
      return;
    }
    const inicio = performance.now();
    const origen = desde.current;
    let raf = 0;
    const paso = (t: number) => {
      const f = Math.min(1, (t - inicio) / duracionMs);
      const suave = 1 - Math.pow(1 - f, 3);
      const v = origen + (valor - origen) * suave;
      desde.current = v;
      setMostrado(v);
      if (f < 1) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [valor, duracionMs, reducir]);
  return Math.round(mostrado);
}

/** `false` en el primer pintado y `true` justo después: dispara las transiciones de entrada (barras que crecen). */
function useMontado(): boolean {
  const [m, setM] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setM(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  return m;
}

function useAhora(intervaloMs = 1000): Date {
  const [ahora, setAhora] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), intervaloMs);
    return () => window.clearInterval(id);
  }, [intervaloMs]);
  return ahora;
}

// ---- Piezas ------------------------------------------------------------------------------------------

function Tarjeta({ titulo, icono, children, className = "", retraso = 0 }: { titulo: string; icono?: React.ReactNode; children: React.ReactNode; className?: string; retraso?: number }) {
  return (
    <section className={`mq-in flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`} style={{ animationDelay: `${retraso}ms` }}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide" style={{ color: GRIS }}>
        {icono && <span style={{ color: AZUL }}>{icono}</span>}
        {titulo}
      </h2>
      <div className="flex-1">{children}</div>
    </section>
  );
}

/** Mosaico de dato, mismo lenguaje que «Informe por Evento»: ícono + etiqueta pequeña y cifra grande. */
function Dato({ icono, valor, etiqueta, detalle, testId }: { icono: React.ReactNode; valor: React.ReactNode; etiqueta: string; detalle?: string; testId?: string }) {
  return (
    <div className="mq-in flex flex-col gap-0.5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-testid={testId}>
      <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><span style={{ color: AZUL }}>{icono}</span>{etiqueta}</span>
      <span className="text-4xl font-bold leading-tight tabular-nums">{valor}</span>
      {detalle && <span className="text-xs text-slate-500">{detalle}</span>}
    </div>
  );
}

function Anillo({ fraccion, grande, etiqueta }: { fraccion: number; grande: string; etiqueta: string }) {
  const montado = useMontado();
  const R = 52;
  const C = 2 * Math.PI * R;
  const f = Math.max(0, Math.min(1, fraccion));
  return (
    <div className="relative mx-auto h-44 w-44 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={R} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle cx="60" cy="60" r={R} fill="none" stroke={AZUL} strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={montado ? C * (1 - f) : C} style={{ transition: "stroke-dashoffset 1.6s cubic-bezier(.2,.8,.2,1)" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold tabular-nums" style={{ color: AZUL_OSCURO }}>{grande}</span>
        <span className="text-xs uppercase tracking-wide">{etiqueta}</span>
      </div>
    </div>
  );
}

function BarraAnimada({ valor, max, color = AZUL, retraso = 0 }: { valor: number; max: number; color?: string; retraso?: number }) {
  const montado = useMontado();
  return (
    <span className="block h-3 overflow-hidden rounded-full bg-slate-100">
      <span className="block h-full rounded-full" style={{ width: montado ? `${Math.max(3, (valor / Math.max(max, 1)) * 100)}%` : "0%", background: color, transition: `width 1.2s cubic-bezier(.2,.8,.2,1) ${retraso}ms` }} />
    </span>
  );
}

function Contador({ valor, className = "", testId }: { valor: number; className?: string; testId?: string }) {
  return <span data-testid={testId} className={`tabular-nums ${className}`}>{useContador(valor).toLocaleString("es-CO")}</span>;
}

// ---- Láminas -----------------------------------------------------------------------------------------

function Participacion({ resumen }: { resumen: ResumenEjecucionEvento }) {
  const partes = [
    { etiqueta: "Evento", valor: resumen.totalEvento, color: AZUL },
    { etiqueta: "Taller", valor: resumen.totalTaller, color: NARANJA },
    { etiqueta: "Stand", valor: resumen.totalStand, color: AQUA },
  ];
  const total = Math.max(resumen.totalRegistros, 1);
  const montado = useMontado();
  return (
    <div>
      <div className="flex h-5 overflow-hidden rounded-full bg-slate-100">
        {partes.map((p) => (
          <span key={p.etiqueta} style={{ width: montado ? `${(p.valor / total) * 100}%` : "0%", background: p.color, transition: "width 1.3s cubic-bezier(.2,.8,.2,1)", marginRight: p.valor ? 2 : 0 }} title={`${p.etiqueta}: ${p.valor}`} />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {partes.map((p) => (
          <div key={p.etiqueta} className="rounded-xl bg-slate-50 p-3 text-center">
            <Contador valor={p.valor} className="text-3xl font-bold" testId={`mq-part-${p.etiqueta.toLowerCase()}`} />
            <div className="mt-0.5 flex items-center justify-center gap-1.5 text-xs uppercase tracking-wide">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
              {p.etiqueta}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Llegadas({ datos }: { datos: AmpliadoMarquesina["llegadasPorHora"] }) {
  const montado = useMontado();
  const filas = React.useMemo(() => {
    if (datos.length === 0) return [] as { etiqueta: string; total: number }[];
    const porHora = new Map(datos.map((d) => [new Date(d.hora).getTime(), d.total]));
    const horas = Array.from(porHora.keys());
    const ini = Math.min(...horas);
    const fin = Math.max(Math.max(...horas), new Date().setMinutes(0, 0, 0));
    const salida: { etiqueta: string; total: number }[] = [];
    for (let t = ini; t <= fin && salida.length < 24; t += 3_600_000) salida.push({ etiqueta: `${new Date(t).getHours()}h`, total: porHora.get(t) ?? 0 });
    return salida;
  }, [datos]);
  if (filas.length === 0) return <p className="py-8 text-center text-sm">Aún no hay llegadas registradas.</p>;
  const max = Math.max(...filas.map((f) => f.total), 1);
  const pico = filas.reduce((a, b) => (b.total > a.total ? b : a), filas[0]);
  return (
    <div>
      <div className="flex h-44 items-end gap-2">
        {filas.map((f, i) => (
          <div key={i} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${f.etiqueta}: ${f.total}`}>
            <span className="text-xs font-semibold tabular-nums">{f.total || ""}</span>
            <span className="w-full max-w-10 rounded-t-lg" style={{ height: montado ? `${Math.max(f.total ? 6 : 2, (f.total / max) * 120)}px` : "2px", background: f === pico ? AZUL_OSCURO : AZUL, opacity: f.total ? 1 : 0.25, transition: `height 1.1s cubic-bezier(.2,.8,.2,1) ${i * 70}ms` }} />
            <span className="text-[11px]">{f.etiqueta}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs">Hora pico: <b>{pico.etiqueta}</b> con {pico.total} llegada(s).</p>
    </div>
  );
}

const ETIQUETA_TIPO: Record<string, string> = { evento: "Evento", taller: "Taller", stand: "Stand" };

/**
 * Entrega 32 — últimos check-ins para pantalla pública: SOLO especialidad, ubicación, tipo de asistencia y hora.
 * Sin iniciales ni nombre (el Panel en vivo, de uso interno, sí muestra el nombre).
 */
function Ultimos({ filas }: { filas: AmpliadoMarquesina["ultimos"] }) {
  const ahora = useAhora(15_000);
  if (filas.length === 0) return <p className="py-8 text-center text-sm">Esperando el primer check-in…</p>;
  const hace = (iso: string) => {
    const m = Math.max(0, Math.round((ahora.getTime() - new Date(iso).getTime()) / 60_000));
    return m < 1 ? "ahora" : m < 60 ? `hace ${m} min` : `hace ${Math.floor(m / 60)} h`;
  };
  const colorTipo: Record<string, string> = { evento: AZUL, taller: NARANJA, stand: AQUA };
  return (
    <ul className="space-y-2" data-testid="mq-ultimos">
      {filas.slice(0, 6).map((f) => (
        <li key={f.id ?? f.capturadoEn + f.especialidad + f.ciudad} className="mq-fila flex items-center gap-3 rounded-lg border bg-accent/30 px-3 py-2">
          <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: colorTipo[f.tipo] ?? AZUL }} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{f.especialidad || "Profesional de la salud"}</span>
            <span className="flex items-center gap-1.5 truncate text-xs text-slate-500">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{[f.ciudad, f.pais].filter(Boolean).join(", ") || "—"}</span>
            </span>
          </span>
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium text-white" style={{ background: colorTipo[f.tipo] ?? AZUL }}>{ETIQUETA_TIPO[f.tipo] ?? f.tipo}</span>
          <span className="w-20 shrink-0 text-right text-xs tabular-nums">{hace(f.capturadoEn)}</span>
        </li>
      ))}
    </ul>
  );
}

function Productos({ resumen }: { resumen: ResumenEjecucionEvento }) {
  const orden = [...resumen.productos].sort((a, b) => b.cantidadTotal - a.cantidadTotal);
  const max = Math.max(...orden.map((p) => p.cantidadTotal), 1);
  const total = orden.reduce((a, p) => a + p.cantidadTotal, 0);
  if (orden.length === 0) return <p className="py-8 text-center text-sm">Todavía no se ha entregado ninguna muestra.</p>;
  return (
    <div>
      <p className="mb-3 text-sm">Total entregado: <Contador valor={total} className="text-2xl font-bold" /> muestras</p>
      <ul className="space-y-3">
        {orden.map((p, i) => (
          <li key={p.nombre} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3">
            {p.logoDataUrl ? <img src={p.logoDataUrl} alt="" className="h-10 w-10 rounded-lg object-contain" /> : <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold" style={{ color: AZUL }}>{i + 1}</span>}
            <span className="min-w-0">
              <span className="mb-1 block truncate text-sm font-medium">{p.nombre}</span>
              <BarraAnimada valor={p.cantidadTotal} max={max} retraso={i * 120} />
            </span>
            <Contador valor={p.cantidadTotal} className="text-2xl font-bold" testId={`mq-prod-${p.nombre}`} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Perfil({ titulo, filas, color }: { titulo: string; filas: { nombre: string; total: number }[]; color: string }) {
  const max = Math.max(...filas.map((f) => f.total), 1);
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide">{titulo}</h3>
      {filas.length === 0 ? (
        <p className="text-sm">Sin datos todavía.</p>
      ) : (
        <ul className="space-y-2">
          {filas.map((f, i) => (
            <li key={f.nombre} className="grid grid-cols-[minmax(0,9rem)_1fr_2rem] items-center gap-2 text-sm">
              <span className="truncate">{f.nombre}</span>
              <BarraAnimada valor={f.total} max={max} color={color} retraso={i * 100} />
              <span className="text-right font-semibold tabular-nums">{f.total}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- Tablero -----------------------------------------------------------------------------------------

type Modo = "panorama" | "carrusel";
const CLAVE_MODO = "beats.marquesina.modo";
const CLAVE_SESION = "beats.marquesina.sesion";

function leerSesionGuardada(): string {
  try {
    return localStorage.getItem(CLAVE_SESION) || TODAS_LAS_SESIONES;
  } catch {
    return TODAS_LAS_SESIONES;
  }
}

function leerModo(): Modo {
  try {
    return localStorage.getItem(CLAVE_MODO) === "carrusel" ? "carrusel" : "panorama";
  } catch {
    return "panorama";
  }
}

export function TableroMarquesina({ resumen, ampliado, sinConexion, ultimaActualizacion, onCambiarCodigo }: Props) {
  const ahora = useAhora(1000);
  const [modo, setModo] = React.useState<Modo>(leerModo);
  const [pausado, setPausado] = React.useState(false);
  const [lamina, setLamina] = React.useState(0);
  // Entrega 33: evento de varias sesiones → el usuario elige una sesión y el encabezado muestra SU fecha y SU localización.
  const [sesionElegida, setSesionElegida] = React.useState<string>(leerSesionGuardada);
  const sesiones = ampliado?.sesiones ?? [];
  const sesion = sesiones.length > 1 ? (sesiones.find((s) => s.id === sesionElegida) ?? null) : null;
  function elegirSesion(id: string) {
    setSesionElegida(id);
    try {
      localStorage.setItem(CLAVE_SESION, id);
    } catch {
      /* sin almacenamiento */
    }
  }
  // Entrega 31: aviso de «nuevo asistente» flotante (visible en cualquier lámina) + anillos «ping» en el mapa.
  const paisEvento = ampliado?.evento?.pais || null;
  const { avisos, recientes } = useCheckinsNuevos(ampliado?.ultimos, resumen.totalRegistros, paisEvento);
  const entradasMapa = React.useMemo(
    () => (ampliado && ampliado.ubicaciones.length > 0 ? ampliado.ubicaciones : (ampliado?.ciudades ?? []).filter((c) => c.nombre !== "Sin dato").map((c) => ({ pais: "", ciudad: c.nombre, total: c.total }))),
    [ampliado],
  );

  const hayPerfil = Boolean(ampliado && (ampliado.especialidades.length > 0 || ampliado.ciudades.length > 0));
  const hayMapa = Boolean(ampliado && (ampliado.ubicaciones.length > 0 || ampliado.ciudades.length > 0 || ampliado.evento));
  const laminas = React.useMemo(() => {
    const l = ["resumen"];
    if (ampliado) l.push("llegadas");
    if (hayMapa) l.push("mapa");
    l.push("productos");
    if (hayPerfil) l.push("perfil");
    return l;
  }, [ampliado, hayPerfil, hayMapa]);

  React.useEffect(() => {
    if (modo !== "carrusel" || pausado) return;
    const id = window.setTimeout(() => setLamina((x) => (x + 1) % laminas.length), SEGUNDOS_POR_LAMINA * 1000);
    return () => window.clearTimeout(id);
  }, [modo, pausado, lamina, laminas.length]);

  function cambiarModo(m: Modo) {
    setModo(m);
    setLamina(0);
    try {
      localStorage.setItem(CLAVE_MODO, m);
    } catch {
      /* sin almacenamiento */
    }
  }

  // Con una sesión elegida, «registrados» y «esperados» son los de esa sesión; si no, los de todo el evento.
  const registrados = sesion?.registros ?? resumen.totalRegistros;
  const esperados = sesion ? sesion.esperados : (ampliado?.esperados ?? null);
  const fraccion = esperados ? registrados / esperados : null;
  const segundosDesde = ultimaActualizacion ? Math.max(0, Math.round((ahora.getTime() - ultimaActualizacion.getTime()) / 1000)) : null;
  const totalMuestras = resumen.productos.reduce((a, p) => a + p.cantidadTotal, 0);
  const visible = (id: string) => modo === "panorama" || laminas[lamina] === id;

  const hero = (
    <Tarjeta titulo="Asistentes registrados" icono={<Users className="h-4 w-4" />} className="lg:row-span-1" retraso={0}>
      <div className="flex flex-wrap items-center justify-center gap-6">
        {fraccion != null ? (
          <Anillo fraccion={fraccion} grande={`${Math.round(fraccion * 100)}%`} etiqueta="de lo esperado" />
        ) : null}
        <div className="text-center">
          <div className="relative inline-block">
            <Contador valor={registrados} className="text-8xl font-black leading-none" testId="mq-total-hero" />
          </div>
          <p className="mt-2 text-sm uppercase tracking-wide">Total registrados{esperados ? ` · de ${esperados.toLocaleString("es-CO")} esperados` : ""}</p>
        </div>
      </div>
    </Tarjeta>
  );

  return (
    <div className="mq min-h-screen bg-slate-50" data-testid="tablero-marquesina">
      <style>{ESTILOS}</style>
      <AvisosCheckin avisos={avisos} />

      {sinConexion && (
        <div className="flex items-center justify-center gap-2 bg-red-600 px-4 py-2 text-center text-sm font-medium text-white">
          <WifiOff className="h-4 w-4" />
          Sin conexión — mostrando los últimos datos disponibles
          {ultimaActualizacion && ` (actualizado por última vez el ${formatearFechaHora(ultimaActualizacion)})`}
        </div>
      )}

      {/* Entrega 32: encabezado con el racional de «Informe por Evento»: tarjeta sobria con título, subtítulo de
          ciudad · fechas y, debajo, una franja de mosaicos con las cifras clave. Se conserva la identidad (azul/gris). */}
      <header className="border-b bg-white">
        <div className="mx-auto max-w-[1600px] px-8 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: AZUL_OSCURO }}>
                <span className="mq-live inline-block h-2.5 w-2.5 rounded-full bg-green-500" /> En vivo · BEATS
              </p>
              <h1 className="mt-1 truncate text-3xl font-bold leading-tight" style={{ color: GRIS }} data-testid="mq-titulo">{resumen.nombreEvento}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500" data-testid="mq-subtitulo">
                <span className="flex items-center gap-1.5" data-testid="mq-ubicacion"><MapPin className="h-4 w-4" />{(sesion ? ubicacionSesion(sesion, { direccion: resumen.direccion, ciudad: resumen.ciudad, pais: paisEvento }) : ubicacionTexto([resumen.direccion, resumen.ciudad, paisEvento])) || "—"}</span>
                <span className="flex items-center gap-1.5" data-testid="mq-fechas"><CalendarDays className="h-4 w-4" />
                  {sesion ? (
                    <>Sesión {sesion.numero} · {fechaSesion(sesion)}</>
                  ) : (
                    <>
                      {formatearFecha(resumen.fechaInicioEvento)}
                      {resumen.fechaFinEvento && resumen.fechaFinEvento !== resumen.fechaInicioEvento ? ` — ${formatearFecha(resumen.fechaFinEvento)}` : ""}
                    </>
                  )}
                </span>
              </p>
              <SelectorSesionEvento
                className="mt-3"
                sesiones={sesiones}
                seleccion={sesion ? sesion.id : TODAS_LAS_SESIONES}
                onChange={elegirSesion}
                nota={sesion ? "Llegadas, perfil y muestras: acumulado de todo el evento" : undefined}
              />
            </div>
            <div className="text-right">
              <p className="text-4xl font-light tabular-nums leading-none">{ahora.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</p>
              <p className="mt-1 flex items-center justify-end gap-1.5 text-xs text-slate-500" data-testid="marquesina-actualizado">
                <Activity className="h-3.5 w-3.5" />
                {segundosDesde == null ? "Conectando…" : `Actualizado hace ${segundosDesde} s`}
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="mq-kpis">
            <Dato icono={<Users className="h-4 w-4" />} valor={<Contador valor={registrados} testId="mq-total" />} etiqueta={sesion ? `Asistentes registrados · sesión ${sesion.numero}` : "Asistentes registrados"} testId="mq-kpi-asistentes" />
            <Dato icono={<Sparkles className="h-4 w-4" />} valor={fraccion != null ? `${Math.round(fraccion * 100)}%` : "—"} etiqueta="Cumplimiento" detalle={esperados ? `de ${esperados.toLocaleString("es-CO")} esperados` : "Sin meta de asistentes"} testId="mq-kpi-cumplimiento" />
            <Dato icono={<IconoMuestraMedica className="h-4 w-4" />} valor={totalMuestras.toLocaleString("es-CO")} etiqueta="Muestras entregadas (unid.)" testId="mq-kpi-muestras" />
            <Dato icono={<Globe2 className="h-4 w-4" />} valor={ampliado ? ampliado.ciudades.filter((c) => c.nombre !== "Sin dato").length : "—"} etiqueta="Ciudades de origen" testId="mq-kpi-ciudades" />
          </div>
        </div>
        {modo === "carrusel" && !pausado && <div key={`${lamina}-${modo}`} className="mq-prog h-1" style={{ background: AZUL }} />}
      </header>

      <main className="mx-auto max-w-[1600px] space-y-5 px-8 py-6">
        {modo === "carrusel" && (
          <div className="flex items-center justify-center gap-2" aria-hidden>
            {laminas.map((l, i) => (
              <span key={l} className="h-2 rounded-full transition-all" style={{ width: i === lamina ? 28 : 8, background: i === lamina ? AZUL : "#cbd5e1" }} />
            ))}
          </div>
        )}

        <div key={modo === "carrusel" ? laminas[lamina] : "panorama"} className={modo === "carrusel" ? "mq-fade" : ""}>
          {visible("resumen") && (
            <div className="grid gap-5 lg:grid-cols-5">
              {/* En «Panorama» las cifras grandes ya están en la franja de mosaicos del encabezado; el contador gigante solo se usa en el carrusel de sala. */}
              {modo === "carrusel" && <div className="lg:col-span-3">{hero}</div>}
              <Tarjeta titulo="Participación" icono={<Sparkles className="h-4 w-4" />} className={modo === "carrusel" ? "lg:col-span-2" : "lg:col-span-5"} retraso={120}>
                <Participacion resumen={resumen} />
              </Tarjeta>
            </div>
          )}

          {(visible("llegadas") || visible("productos") || visible("perfil")) && modo === "panorama" && <div className="h-5" />}

          {ampliado && visible("llegadas") && (
            <div className={`grid gap-5 lg:grid-cols-2 ${modo === "carrusel" ? "" : ""}`}>
              <Tarjeta titulo="Llegadas por hora" icono={<Activity className="h-4 w-4" />} retraso={0}>
                <Llegadas datos={ampliado.llegadasPorHora} />
              </Tarjeta>
              <Tarjeta titulo="Últimos check-ins" icono={<Users className="h-4 w-4" />} retraso={120}>
                <Ultimos filas={ampliado.ultimos} />
              </Tarjeta>
            </div>
          )}

          {ampliado && hayMapa && visible("mapa") && (
            <div className={modo === "panorama" ? "mt-5" : ""}>
              <Tarjeta titulo="Dónde ocurre y de dónde vienen" icono={<Globe2 className="h-4 w-4" />} retraso={0}>
                <BloqueMapa entradas={entradasMapa} paisEvento={sesion?.pais || paisEvento} ciudadEvento={sesion?.ciudad || ampliado.evento?.ciudad || resumen.ciudad} modalidad={ampliado.evento?.modalidad} recientes={recientes} alto={440} grande />
              </Tarjeta>
            </div>
          )}

          {visible("productos") && (
            <div className={modo === "panorama" && ampliado ? "mt-5" : ""}>
              <Tarjeta titulo="Ranking de muestras entregadas" icono={<IconoMuestraMedica className="h-4 w-4" />} retraso={0}>
                <Productos resumen={resumen} />
              </Tarjeta>
            </div>
          )}

          {ampliado && hayPerfil && visible("perfil") && (
            <div className={modo === "panorama" ? "mt-5" : ""}>
              <Tarjeta titulo="Perfil de los asistentes" icono={<Users className="h-4 w-4" />} retraso={0}>
                <div className="grid gap-8 md:grid-cols-2">
                  <Perfil titulo="Especialidad / profesión" filas={ampliado.especialidades} color={AZUL} />
                  <Perfil titulo="Ciudad de origen" filas={ampliado.ciudades} color={AQUA} />
                </div>
              </Tarjeta>
            </div>
          )}
        </div>
      </main>

      {/* Controles discretos (esquina inferior): modo, pausa y cambio de código. */}
      <div className="fixed bottom-3 right-3 flex items-center gap-1 rounded-full border border-slate-200 bg-white/90 p-1 text-xs opacity-40 shadow-sm backdrop-blur transition-opacity hover:opacity-100" data-testid="marquesina-controles">
        <button type="button" onClick={() => cambiarModo("panorama")} aria-pressed={modo === "panorama"} title="Panorama: todo a la vez" className={`rounded-full p-2 ${modo === "panorama" ? "bg-[#00A3E0] text-white" : ""}`}><LayoutGrid className="h-4 w-4" /></button>
        <button type="button" onClick={() => cambiarModo("carrusel")} aria-pressed={modo === "carrusel"} title="Carrusel: una lámina cada 12 s" data-testid="marquesina-modo-carrusel" className={`rounded-full p-2 ${modo === "carrusel" ? "bg-[#00A3E0] text-white" : ""}`}><Presentation className="h-4 w-4" /></button>
        {modo === "carrusel" && (
          <button type="button" onClick={() => setPausado((p) => !p)} title={pausado ? "Reanudar" : "Pausar"} className="rounded-full p-2">{pausado ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</button>
        )}
        <button type="button" onClick={onCambiarCodigo} className="rounded-full px-3 py-2">Cambiar código</button>
      </div>
    </div>
  );
}
