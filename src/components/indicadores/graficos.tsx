import * as React from "react";
import { Table2, BarChart3, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { construirCSV, descargarCSV } from "@/lib/csv";
import { bytesDeCsv, etiquetaTamano } from "@/lib/tamanoEstimado";

/**
 * Entrega 29 — gráficos propios (SVG/HTML, sin librerías) para «Indicadores de Uso y Gestión».
 * Reglas aplicadas: marcas finas con extremo redondeado, una sola escala, rejilla tenue, textos en tinta
 * neutra (nunca del color de la serie), tooltip al pasar el cursor y vista de tabla alternativa en cada panel.
 */

export const COLOR = {
  serie1: "#2a78d6",
  serie2: "#eb6834",
  serie3: "#1baf7a",
  marca: "#00A3E0",
  vacio: "#e2e8f0",
};

const CATEGORICOS = [COLOR.serie1, COLOR.serie2, COLOR.serie3];

export function Kpi({ etiqueta, valor, detalle, testId }: { etiqueta: string; valor: React.ReactNode; detalle?: React.ReactNode; testId?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-testid={testId}>
      <p className="text-xs font-medium text-slate-500">{etiqueta}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{valor}</p>
      {detalle && <p className="mt-1 text-xs text-slate-500">{detalle}</p>}
    </div>
  );
}

/** Tarjeta de gráfico con título, ayuda y botón para alternar entre gráfico y tabla. */
export function Panel({
  titulo,
  ayuda,
  children,
  tabla,
  className,
}: {
  titulo: string;
  ayuda?: string;
  children: React.ReactNode;
  tabla?: { encabezados: string[]; filas: (string | number)[][] };
  className?: string;
}) {
  const [verTabla, setVerTabla] = React.useState(false);
  const tamanoCsv = React.useMemo(() => (tabla ? bytesDeCsv(tabla.encabezados, tabla.filas) : 0), [tabla]);
  function descargarPanel() {
    if (!tabla) return;
    const nombre = titulo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "").toLowerCase();
    descargarCSV(`kpi_${nombre || "panel"}.csv`, construirCSV(tabla.encabezados, tabla.filas));
  }
  return (
    <section className={cn("rounded-xl border border-slate-200 bg-white p-4 shadow-sm", className)}>
      <header className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{titulo}</h3>
          {ayuda && <p className="mt-0.5 text-xs text-slate-500">{ayuda}</p>}
        </div>
        {tabla && (
          <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={descargarPanel}
            disabled={tabla.filas.length === 0}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-40"
            title={`Descargar este indicador en CSV · tamaño estimado ${etiquetaTamano(tamanoCsv)}`}
            data-testid="panel-csv"
          >
            <Download className="h-3.5 w-3.5" />
            CSV <span className="text-slate-400">{etiquetaTamano(tamanoCsv)}</span>
          </button>
          <button
            type="button"
            onClick={() => setVerTabla((v) => !v)}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
            aria-pressed={verTabla}
            title={verTabla ? "Ver gráfico" : "Ver como tabla"}
          >
            {verTabla ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
            {verTabla ? "Gráfico" : "Tabla"}
          </button>
          </div>
        )}
      </header>
      {verTabla && tabla ? (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                {tabla.encabezados.map((h) => (
                  <th key={h} className="py-1.5 pr-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tabla.filas.map((f, i) => (
                <tr key={i} className="border-b border-slate-100 text-slate-700">
                  {f.map((c, j) => (
                    <td key={j} className="py-1.5 pr-3 tabular-nums">{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

export function SinDatos({ texto = "Sin datos en este período." }: { texto?: string }) {
  return <p className="py-6 text-center text-xs text-slate-400">{texto}</p>;
}

/** Barras horizontales ordenadas, con la etiqueta a la izquierda y el valor a la derecha. */
export function BarrasH({
  filas,
  formato = (n) => n.toLocaleString("es-CO"),
  color = COLOR.marca,
  maximo,
}: {
  filas: { etiqueta: string; valor: number; detalle?: string }[];
  formato?: (n: number) => string;
  color?: string;
  maximo?: number;
}) {
  if (filas.length === 0) return <SinDatos />;
  const max = maximo ?? Math.max(...filas.map((f) => f.valor), 1);
  return (
    <ul className="space-y-1.5">
      {filas.map((f) => (
        <li key={f.etiqueta} className="group grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-xs" title={`${f.etiqueta}: ${formato(f.valor)}${f.detalle ? ` · ${f.detalle}` : ""}`}>
          <span className="truncate text-slate-600">{f.etiqueta}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <span className="block h-full rounded-full transition-all group-hover:opacity-80" style={{ width: `${Math.max(2, (f.valor / max) * 100)}%`, background: color }} />
          </span>
          <span className="tabular-nums text-slate-700">{formato(f.valor)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Dona con leyenda; máximo 3 series con color propio, el resto se pliega en «Otras» (gris). */
export function Dona({ partes, formato = (n) => n.toLocaleString("es-CO"), centro }: { partes: { etiqueta: string; valor: number }[]; formato?: (n: number) => string; centro?: string }) {
  const [activa, setActiva] = React.useState<string | null>(null);
  const validas = partes.filter((p) => p.valor > 0);
  if (validas.length === 0) return <SinDatos />;
  const ordenadas = [...validas].sort((a, b) => b.valor - a.valor);
  const visibles = ordenadas.slice(0, 3);
  const resto = ordenadas.slice(3).reduce((a, p) => a + p.valor, 0);
  const todas = resto > 0 ? [...visibles, { etiqueta: "Otras", valor: resto }] : visibles;
  const total = todas.reduce((a, p) => a + p.valor, 0);
  const R = 40;
  const C = 2 * Math.PI * R;
  let acumulado = 0;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="h-32 w-32 shrink-0 -rotate-90" role="img" aria-label="Distribución">
        {todas.map((p, i) => {
          const frac = p.valor / total;
          const largo = Math.max(0, frac * C - 1.5); // 1.5 u de separación entre segmentos
          const el = (
            <circle
              key={p.etiqueta}
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke={p.etiqueta === "Otras" ? "#94a3b8" : CATEGORICOS[i]}
              strokeWidth={activa === p.etiqueta ? 16 : 13}
              strokeDasharray={`${largo} ${C - largo}`}
              strokeDashoffset={-acumulado}
              onMouseEnter={() => setActiva(p.etiqueta)}
              onMouseLeave={() => setActiva(null)}
              style={{ transition: "stroke-width .15s" }}
            >
              <title>{`${p.etiqueta}: ${formato(p.valor)} (${Math.round(frac * 100)} %)`}</title>
            </circle>
          );
          acumulado += frac * C;
          return el;
        })}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5 text-xs">
        {centro && <li className="font-medium text-slate-500">{centro}</li>}
        {todas.map((p, i) => (
          <li key={p.etiqueta} className="flex items-center gap-2" onMouseEnter={() => setActiva(p.etiqueta)} onMouseLeave={() => setActiva(null)}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.etiqueta === "Otras" ? "#94a3b8" : CATEGORICOS[i] }} />
            <span className="truncate text-slate-600">{p.etiqueta}</span>
            <span className="ml-auto tabular-nums text-slate-700">
              {formato(p.valor)} <span className="text-slate-400">· {Math.round((p.valor / total) * 100)} %</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Columnas verticales (serie de tiempo discreta). */
export function Columnas({ datos, formato = (n) => String(n) }: { datos: { etiqueta: string; valor: number; extra?: string }[]; formato?: (n: number) => string }) {
  const [sel, setSel] = React.useState<number | null>(null);
  if (datos.length === 0) return <SinDatos />;
  const W = 520;
  const H = 150;
  const base = 20;
  const max = Math.max(...datos.map((d) => d.valor), 1);
  const paso = W / datos.length;
  const ancho = Math.min(24, paso * 0.6);
  const saltoEtiqueta = Math.ceil(datos.length / 10);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" role="img" aria-label="Serie por día">
        {[0.5, 1].map((f) => (
          <line key={f} x1="0" x2={W} y1={H - base - (H - base - 8) * f} y2={H - base - (H - base - 8) * f} stroke="#e2e8f0" strokeWidth="1" />
        ))}
        {datos.map((d, i) => {
          const h = Math.max(2, ((H - base - 8) * d.valor) / max);
          const x = i * paso + (paso - ancho) / 2;
          return (
            <g key={d.etiqueta} onMouseEnter={() => setSel(i)} onMouseLeave={() => setSel(null)}>
              <rect x={i * paso} y="0" width={paso} height={H - base} fill="transparent" />
              <rect x={x} y={H - base - h} width={ancho} height={h} rx="3" fill={COLOR.marca} opacity={sel === null || sel === i ? 1 : 0.55} />
              {i % saltoEtiqueta === 0 && (
                <text x={i * paso + paso / 2} y={H - 5} textAnchor="middle" fontSize="9" fill="#64748b">
                  {d.etiqueta.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {sel !== null && (
        <div className="pointer-events-none absolute right-2 top-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow">
          <span className="font-medium text-slate-800">{datos[sel].etiqueta}</span> · {formato(datos[sel].valor)}
          {datos[sel].extra && <span className="text-slate-500"> · {datos[sel].extra}</span>}
        </div>
      )}
    </div>
  );
}

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Mapa de calor día de la semana × hora (un solo tono, claro → oscuro). */
export function MapaCalor({ matriz }: { matriz: number[][] }) {
  const [sel, setSel] = React.useState<{ d: number; h: number } | null>(null);
  const max = Math.max(...matriz.flat(), 0);
  if (max <= 0) return <SinDatos />;
  return (
    <div className="relative overflow-x-auto">
      <div className="min-w-[520px]">
        <div className="grid grid-cols-[2rem_repeat(24,1fr)] gap-[2px] text-[9px] text-slate-500">
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="text-center">{h % 3 === 0 ? h : ""}</span>
          ))}
          {matriz.map((fila, d) => (
            <React.Fragment key={d}>
              <span className="pr-1 text-right leading-5">{DIAS[d]}</span>
              {fila.map((v, h) => (
                <span
                  key={h}
                  className="h-5 rounded-[3px]"
                  style={{ background: v > 0 ? `rgba(0,163,224,${0.12 + 0.88 * (v / max)})` : "#f1f5f9", outline: sel?.d === d && sel?.h === h ? "2px solid #0f172a" : undefined }}
                  onMouseEnter={() => setSel({ d, h })}
                  onMouseLeave={() => setSel(null)}
                  title={`${DIAS[d]} ${String(h).padStart(2, "0")}:00 · ${v.toFixed(1)} min activos`}
                />
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Minutos de uso activo acumulados por día de la semana y hora (hora local del navegador).</p>
    </div>
  );
}

/** Anillo de progreso para cumplimiento (0…1). */
export function Anillo({ fraccion, etiqueta }: { fraccion: number | null; etiqueta: string }) {
  const f = fraccion == null ? 0 : Math.max(0, Math.min(1, fraccion));
  const R = 38;
  const C = 2 * Math.PI * R;
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" stroke={COLOR.vacio} strokeWidth="10" />
        <circle cx="50" cy="50" r={R} fill="none" stroke={COLOR.marca} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${f * C} ${C}`} />
        <text x="50" y="50" transform="rotate(90 50 50)" textAnchor="middle" dominantBaseline="central" fontSize="18" fontWeight="600" fill="#0f172a">
          {fraccion == null ? "—" : `${Math.round(f * 100)}%`}
        </text>
      </svg>
      <p className="text-xs text-slate-600">{etiqueta}</p>
    </div>
  );
}
