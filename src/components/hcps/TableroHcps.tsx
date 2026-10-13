import * as React from "react";
import { Award, CalendarCheck, Globe2, HeartPulse, MapPin, Repeat2, Stethoscope, Users } from "lucide-react";
import type { HcpImpactado } from "@/lib/informes";
import { BarrasH, COLOR, Dona } from "@/components/indicadores/graficos";
import { BloqueMapa } from "@/components/mapa/BloqueMapa";
import { claveTexto } from "@/lib/normalizarTexto";

/**
 * Entrega 31 — «Asistentes impactados» como tablero de control: cifras con ícono y contador animado, perfil de los HCP
 * (profesión, especialidad), de dónde vienen (mapa + ciudades) y los más activos. Conserva el estilo de BEATS
 * (azul #00A3E0, tarjetas blancas redondeadas). Todo se calcula en el navegador a partir de la lista ya filtrada.
 */

const ESTILOS = `
@keyframes th-sube{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes th-onda{0%{transform:translateX(-10%)}100%{transform:translateX(10%)}}
.th-sube{animation:th-sube .55s cubic-bezier(.2,.8,.2,1) both}
.th-onda{animation:th-onda 7s ease-in-out infinite alternate}
@media (prefers-reduced-motion:reduce){.th-sube,.th-onda{animation:none!important}}
`;

function useContador(valor: number, ms = 900): number {
  const [v, setV] = React.useState(0);
  const desde = React.useRef(0);
  React.useEffect(() => {
    const reducir = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reducir) {
      setV(valor);
      desde.current = valor;
      return;
    }
    const t0 = performance.now();
    const origen = desde.current;
    let raf = 0;
    const paso = (t: number) => {
      const f = Math.min(1, (t - t0) / ms);
      const val = origen + (valor - origen) * (1 - Math.pow(1 - f, 3));
      desde.current = val;
      setV(val);
      if (f < 1) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [valor, ms]);
  return Math.round(v);
}

function Cifra({ icono, etiqueta, valor, detalle, color, retraso, testId }: { icono: React.ReactNode; etiqueta: string; valor: number; detalle?: string; color: string; retraso: number; testId?: string }) {
  const n = useContador(valor);
  return (
    <div className="th-sube relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" style={{ animationDelay: `${retraso}ms` }} data-testid={testId}>
      <span className="pointer-events-none absolute -right-5 -top-5 h-20 w-20 rounded-full opacity-10" style={{ background: color }} />
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>{icono}</span>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-slate-500">{etiqueta}</p>
          <p className="text-3xl font-bold leading-tight tabular-nums text-slate-900">{n.toLocaleString("es-CO")}</p>
        </div>
      </div>
      {detalle && <p className="mt-2 truncate text-xs text-slate-500">{detalle}</p>}
    </div>
  );
}

function Tarjeta({ titulo, icono, children, className = "", retraso = 0 }: { titulo: string; icono: React.ReactNode; children: React.ReactNode; className?: string; retraso?: number }) {
  return (
    <section className={`th-sube rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`} style={{ animationDelay: `${retraso}ms` }}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-[#00A3E0]">{icono}</span>
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function contar(valores: string[], max = 6, vacio = "Sin dato") {
  const m = new Map<string, { etiqueta: string; valor: number }>();
  for (const v of valores) {
    const etiqueta = v.trim() || vacio;
    const k = claveTexto(etiqueta);
    const f = m.get(k);
    if (f) f.valor += 1;
    else m.set(k, { etiqueta, valor: 1 });
  }
  return [...m.values()].sort((a, b) => b.valor - a.valor).slice(0, max);
}

const iniciales = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
const MEDALLA = ["#f5b301", "#9aa5b1", "#c47f3e"];

export function TableroHcps({ hcps, totalEventos }: { hcps: HcpImpactado[]; totalEventos: number }) {
  const datos = React.useMemo(() => {
    const eventos = new Set(hcps.flatMap((h) => h.eventosIds));
    const ciudades = new Set(hcps.filter((h) => h.ciudad).map((h) => claveTexto(`${h.pais}|${h.ciudad}`)));
    const paises = new Set(hcps.filter((h) => h.pais).map((h) => claveTexto(h.pais)));
    const recurrentes = hcps.filter((h) => h.eventosIds.length > 1 || h.totalParticipaciones > 1).length;
    const participaciones = hcps.reduce((a, h) => a + h.totalParticipaciones, 0);
    const porUbicacion = new Map<string, { pais: string; ciudad: string; total: number }>();
    for (const h of hcps) {
      if (!h.ciudad) continue;
      const k = claveTexto(`${h.pais}|${h.ciudad}`);
      const f = porUbicacion.get(k);
      if (f) f.total += 1;
      else porUbicacion.set(k, { pais: h.pais, ciudad: h.ciudad, total: 1 });
    }
    return {
      eventos: eventos.size,
      ciudades: ciudades.size,
      paises: paises.size,
      recurrentes,
      participaciones,
      profesiones: contar(hcps.map((h) => h.profesion), 4, "Sin profesión"),
      especialidades: contar(hcps.map((h) => h.especialidad), 6, "Sin especialidad"),
      ciudadesTop: contar(hcps.map((h) => h.ciudad), 6, "Sin ciudad"),
      ubicaciones: [...porUbicacion.values()],
      activos: [...hcps].sort((a, b) => b.totalParticipaciones - a.totalParticipaciones || a.nombreCompleto.localeCompare(b.nombreCompleto, "es")).slice(0, 5),
      paisUnico: paises.size === 1 ? hcps.find((h) => h.pais)?.pais ?? null : null,
    };
  }, [hcps]);

  const pctRecurrentes = hcps.length > 0 ? Math.round((datos.recurrentes / hcps.length) * 100) : 0;

  return (
    <div className="flex flex-col gap-4" data-testid="tablero-hcps">
      <style>{ESTILOS}</style>

      {/* Cabecera con ilustración */}
      <div className="th-sube relative overflow-hidden rounded-2xl p-5 text-white shadow-sm" style={{ background: "linear-gradient(110deg,#0091c8,#00A3E0 55%,#4fc3ee)" }}>
        <svg className="th-onda pointer-events-none absolute inset-y-0 right-0 h-full w-2/3 opacity-25" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden>
          <path d="M0 60 L70 60 L90 20 L115 100 L140 40 L160 60 L400 60" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M0 90 L120 90 L140 70 L160 100 L180 90 L400 90" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" opacity=".6" />
        </svg>
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur"><HeartPulse className="h-8 w-8" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-90">Impacto en la comunidad médica</p>
            <p className="text-2xl font-bold leading-tight" data-testid="hcp-titular">
              {hcps.length.toLocaleString("es-CO")} profesional{hcps.length === 1 ? "" : "es"} de la salud impactado{hcps.length === 1 ? "" : "s"}
            </p>
            <p className="text-sm opacity-90">
              en {datos.eventos} de {totalEventos} evento(s) aprobados · {datos.participaciones.toLocaleString("es-CO")} participación(es)
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Cifra icono={<Users className="h-5 w-5" />} etiqueta="HCPs únicos" valor={hcps.length} detalle="agrupados por cédula" color="#00A3E0" retraso={0} testId="hcp-kpi-unicos" />
        <Cifra icono={<CalendarCheck className="h-5 w-5" />} etiqueta="Eventos alcanzados" valor={datos.eventos} detalle={`de ${totalEventos} aprobados`} color="#1baf7a" retraso={60} testId="hcp-kpi-eventos" />
        <Cifra icono={<Repeat2 className="h-5 w-5" />} etiqueta="Recurrentes" valor={datos.recurrentes} detalle={`${pctRecurrentes} % volvió a participar`} color="#eb6834" retraso={120} testId="hcp-kpi-recurrentes" />
        <Cifra icono={<MapPin className="h-5 w-5" />} etiqueta="Ciudades" valor={datos.ciudades} detalle="de origen de los HCPs" color="#7c5cff" retraso={180} testId="hcp-kpi-ciudades" />
        <Cifra icono={<Globe2 className="h-5 w-5" />} etiqueta="Países" valor={datos.paises} detalle={datos.paisUnico ?? "de origen de los HCPs"} color="#0ea5a4" retraso={240} testId="hcp-kpi-paises" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Tarjeta titulo="Profesión" icono={<Stethoscope className="h-4 w-4" />} retraso={0}>
          <Dona partes={datos.profesiones} formato={(n) => n.toLocaleString("es-CO")} />
        </Tarjeta>
        <Tarjeta titulo="Especialidades más frecuentes" icono={<HeartPulse className="h-4 w-4" />} retraso={80}>
          <BarrasH filas={datos.especialidades} />
        </Tarjeta>
        <Tarjeta titulo="Ciudades de origen" icono={<MapPin className="h-4 w-4" />} retraso={160}>
          <BarrasH filas={datos.ciudadesTop} color={COLOR.serie3} />
        </Tarjeta>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Tarjeta titulo="¿De dónde vienen?" icono={<Globe2 className="h-4 w-4" />} className="lg:col-span-2" retraso={0}>
          {datos.ubicaciones.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Sin ciudades registradas con estos filtros.</p>
          ) : (
            <BloqueMapa entradas={datos.ubicaciones} paisEvento={datos.paisUnico} modalidad="Presencial" alto={300} vertical />
          )}
        </Tarjeta>
        <Tarjeta titulo="Los más activos" icono={<Award className="h-4 w-4" />} retraso={80}>
          {datos.activos.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Sin participaciones.</p>
          ) : (
            <ol className="space-y-2">
              {datos.activos.map((h, i) => (
                <li key={h.cedula} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2">
                  <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">
                    {iniciales(h.nombreCompleto) || "·"}
                    {i < 3 && <Award className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-white" style={{ color: MEDALLA[i] }} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{h.nombreCompleto}</span>
                    <span className="block truncate text-xs text-slate-500">{h.especialidad || h.profesion || "—"}</span>
                  </span>
                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-sky-700" title="Participaciones">{h.totalParticipaciones}</span>
                </li>
              ))}
            </ol>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}

