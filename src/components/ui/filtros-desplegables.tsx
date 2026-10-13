import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PRESETS_FECHA, hayRango, type RangoFechas } from "@/lib/filtroFechas";

/**
 * Entrega 30 — filtros como listas desplegables (propuesta «Opción 1»): una sola fila de botones compactos,
 * sin iconos de relleno; cada uno abre un panel con sus opciones y muestra cuántas hay seleccionadas.
 */

function BotonFiltro({ etiqueta, resumen, cantidad, activo, testId, ...rest }: { etiqueta: string; resumen?: string; cantidad?: number; activo: boolean; testId?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      data-testid={testId}
      {...rest}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg border bg-white px-3 text-sm transition-colors hover:bg-slate-50",
        activo ? "border-[#00A3E0] text-slate-900" : "border-slate-200 text-slate-600",
      )}
    >
      <span className={cn(activo && "font-medium")}>{resumen ?? etiqueta}</span>
      {!!cantidad && <span className="rounded-full bg-[#00A3E0] px-1.5 text-[11px] font-semibold leading-4 text-white">{cantidad}</span>}
      <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
    </button>
  );
}

export interface OpcionFiltro {
  valor: string;
  etiqueta: string;
  conteo?: number;
}

/** Selección múltiple. `seleccion` vacío = sin filtrar. */
export function FiltroMulti({ etiqueta, opciones, seleccion, onChange, testId }: { etiqueta: string; opciones: OpcionFiltro[]; seleccion: string[]; onChange: (v: string[]) => void; testId: string }) {
  const alternar = (v: string) => onChange(seleccion.includes(v) ? seleccion.filter((x) => x !== v) : [...seleccion, v]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <BotonFiltro etiqueta={etiqueta} cantidad={seleccion.length} activo={seleccion.length > 0} testId={testId} />
      </PopoverTrigger>
      <PopoverContent className="w-64" data-testid={`${testId}-panel`}>
        <p className="px-2 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{etiqueta}</p>
        <ul className="max-h-72 overflow-auto">
          {opciones.map((o) => {
            const marcada = seleccion.includes(o.valor);
            return (
              <li key={o.valor}>
                <button type="button" role="checkbox" aria-checked={marcada} onClick={() => alternar(o.valor)} data-testid={`${testId}-${o.valor}`} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-50">
                  <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", marcada ? "border-[#00A3E0] bg-[#00A3E0] text-white" : "border-slate-300")}>{marcada && <Check className="h-3 w-3" />}</span>
                  <span className="flex-1 truncate">{o.etiqueta}</span>
                  {o.conteo != null && <span className="text-xs tabular-nums text-slate-400">{o.conteo}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        {seleccion.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-[#0679a8] hover:bg-slate-50">
            Quitar selección
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Selección única (p. ej. Activos / Archivados / Todos). */
export function FiltroUnico({ etiqueta, opciones, valor, onChange, valorPorDefecto, testId }: { etiqueta: string; opciones: OpcionFiltro[]; valor: string; onChange: (v: string) => void; valorPorDefecto: string; testId: string }) {
  const actual = opciones.find((o) => o.valor === valor);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <BotonFiltro etiqueta={etiqueta} resumen={actual?.etiqueta ?? etiqueta} activo={valor !== valorPorDefecto} testId={testId} />
      </PopoverTrigger>
      <PopoverContent className="w-56">
        {opciones.map((o) => (
          <button key={o.valor} type="button" role="radio" aria-checked={o.valor === valor} onClick={() => onChange(o.valor)} data-testid={`${testId}-${o.valor}`} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-50">
            <span className="flex h-4 w-4 items-center justify-center">{o.valor === valor && <Check className="h-3.5 w-3.5 text-[#00A3E0]" />}</span>
            <span className="flex-1">{o.etiqueta}</span>
            {o.conteo != null && <span className="text-xs tabular-nums text-slate-400">{o.conteo}</span>}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** Texto corto del rango activo («Últimos 30 días», «01/10 – 15/10»). */
export function resumenRango(rango: RangoFechas, hoy = new Date()): string | null {
  if (!hayRango(rango)) return null;
  const p = PRESETS_FECHA.find((x) => {
    const r = x.rango(hoy);
    return r.desde === rango.desde && r.hasta === rango.hasta;
  });
  if (p) return p.etiqueta;
  const corto = (s: string) => (s ? s.slice(8, 10) + "/" + s.slice(5, 7) : "…");
  return `${corto(rango.desde)} – ${corto(rango.hasta)}`;
}

export function FiltroFechaDesplegable<B extends string>({ rango, onRango, base, onBase, bases, testId }: { rango: RangoFechas; onRango: (r: RangoFechas) => void; base: B; onBase: (b: B) => void; bases: { valor: B; etiqueta: string }[]; testId: string }) {
  const hoy = new Date();
  const resumen = resumenRango(rango, hoy);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <BotonFiltro etiqueta="Fecha" resumen={resumen ? `Fecha: ${resumen}` : "Fecha"} activo={!!resumen} testId={testId} />
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3 p-3" data-testid={`${testId}-panel`}>
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Filtrar por</p>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
            {bases.map((b) => (
              <button key={b.valor} type="button" onClick={() => onBase(b.valor)} className={cn("flex-1 rounded-md px-2 py-1 text-xs", base === b.valor ? "bg-white font-semibold shadow-sm" : "text-slate-600")}>
                {b.etiqueta}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS_FECHA.map((p) => {
            const r = p.rango(hoy);
            const act = r.desde === rango.desde && r.hasta === rango.hasta;
            return (
              <button key={p.id} type="button" onClick={() => onRango(r)} data-testid={`${testId}-preset-${p.id}`} className={cn("rounded-full px-2.5 py-1 text-xs", act ? "bg-[#00A3E0] font-semibold text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
                {p.etiqueta}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-500">
            Desde
            <Input type="date" className="mt-0.5 h-8 text-xs" value={rango.desde} max={rango.hasta || undefined} data-testid={`${testId}-desde`} onChange={(e) => onRango({ ...rango, desde: e.target.value })} />
          </label>
          <label className="text-xs text-slate-500">
            Hasta
            <Input type="date" className="mt-0.5 h-8 text-xs" value={rango.hasta} min={rango.desde || undefined} data-testid={`${testId}-hasta`} onChange={(e) => onRango({ ...rango, hasta: e.target.value })} />
          </label>
        </div>
        {hayRango(rango) && (
          <button type="button" onClick={() => onRango({ desde: "", hasta: "" })} className="text-xs font-medium text-[#0679a8] hover:underline">
            Quitar fechas
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

