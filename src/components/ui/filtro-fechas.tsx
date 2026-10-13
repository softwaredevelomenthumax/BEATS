import { CalendarRange, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FiltroPastilla } from "@/components/ui/filtro-pastilla";
import { PRESETS_FECHA, RANGO_VACIO, hayRango, type RangoFechas } from "@/lib/filtroFechas";

/**
 * Entrega 28 — filtro por fecha (Desde / Hasta + atajos). Opcionalmente deja elegir QUÉ fecha se filtra
 * (`bases`: p. ej. «Creación» o «Evento / actividad»).
 */
export function FiltroFechas<B extends string = string>({
  rango,
  onRango,
  base,
  onBase,
  bases,
  testId = "filtro-fechas",
}: {
  rango: RangoFechas;
  onRango: (r: RangoFechas) => void;
  base?: B;
  onBase?: (b: B) => void;
  bases?: { valor: B; etiqueta: string }[];
  testId?: string;
}) {
  const hoy = new Date();
  const presetActivo = PRESETS_FECHA.find((p) => {
    const r = p.rango(hoy);
    return r.desde === rango.desde && r.hasta === rango.hasta;
  })?.id;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2" data-testid={testId}>
      <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <CalendarRange className="h-4 w-4" />
        Fecha
      </span>
      {bases && onBase && base && (
        <div className="flex items-center gap-1.5">
          {bases.map((b) => (
            <FiltroPastilla key={b.valor} activo={base === b.valor} onClick={() => onBase(b.valor)}>
              {b.etiqueta}
            </FiltroPastilla>
          ))}
        </div>
      )}
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        Desde
        <Input
          type="date"
          className="h-8 w-[9.5rem] text-xs"
          value={rango.desde}
          max={rango.hasta || undefined}
          data-testid={`${testId}-desde`}
          onChange={(e) => onRango({ ...rango, desde: e.target.value })}
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        Hasta
        <Input
          type="date"
          className="h-8 w-[9.5rem] text-xs"
          value={rango.hasta}
          min={rango.desde || undefined}
          data-testid={`${testId}-hasta`}
          onChange={(e) => onRango({ ...rango, hasta: e.target.value })}
        />
      </label>
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS_FECHA.map((p) => (
          <FiltroPastilla key={p.id} activo={presetActivo === p.id} onClick={() => onRango(p.rango(new Date()))}>
            {p.etiqueta}
          </FiltroPastilla>
        ))}
      </div>
      {hayRango(rango) && (
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={() => onRango(RANGO_VACIO)} data-testid={`${testId}-limpiar`}>
          <X className="h-3.5 w-3.5" />
          Limpiar
        </Button>
      )}
    </div>
  );
}
