import { CalendarDays, MapPin } from "lucide-react";
import { TODAS_LAS_SESIONES, esSesionDeHoy, etiquetaCortaSesion, type SesionVista } from "@/lib/sesionesVista";
import { cn } from "@/lib/utils";

/**
 * Entrega 33 — selector de sesión para eventos de «Varias sesiones» (Marquesina y Panel en Vivo): una fila de «píldoras»,
 * «Todas las sesiones» + una por sesión (con la fecha y una marca «Hoy»). Al elegir una, quien lo usa cambia las fechas y la
 * localización que se muestran. Es un grupo de opciones (radiogroup) navegable con teclado.
 */
export function SelectorSesionEvento({
  sesiones,
  seleccion,
  onChange,
  tema = "claro",
  nota,
  className,
}: {
  sesiones: SesionVista[];
  seleccion: string;
  onChange: (id: string) => void;
  tema?: "claro" | "sobre-color";
  /** Texto pequeño a la derecha (p. ej. qué parte de la pantalla sigue siendo del evento completo). */
  nota?: string;
  className?: string;
}) {
  if (sesiones.length < 2) return null;
  const sobreColor = tema === "sobre-color";
  const pastilla = (activa: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
      sobreColor
        ? activa
          ? "border-white bg-white text-[#0091c8]"
          : "border-white/50 bg-white/10 text-white hover:bg-white/20"
        : activa
          ? "border-[#00A3E0] bg-[#00A3E0] text-white"
          : "border-slate-200 bg-white text-slate-600 hover:border-[#00A3E0] hover:text-[#0091c8]",
    );
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)} data-testid="selector-sesion">
      <span className={cn("flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide", sobreColor ? "text-white/90" : "text-slate-500")}>
        <CalendarDays className="h-3.5 w-3.5" /> Sesión
      </span>
      <div role="radiogroup" aria-label="Sesión del evento" className="flex flex-wrap items-center gap-2">
        <button type="button" role="radio" aria-checked={seleccion === TODAS_LAS_SESIONES} data-testid="sesion-todas" className={pastilla(seleccion === TODAS_LAS_SESIONES)} onClick={() => onChange(TODAS_LAS_SESIONES)}>
          Todas las sesiones
        </button>
        {sesiones.map((s) => {
          const hoy = esSesionDeHoy(s);
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={seleccion === s.id}
              data-testid={`sesion-${s.numero}`}
              className={pastilla(seleccion === s.id)}
              onClick={() => onChange(s.id)}
              title={[s.lugar, s.ciudad, s.pais].filter(Boolean).join(", ") || undefined}
            >
              {etiquetaCortaSesion(s)}
              {s.ciudad && <span className="hidden items-center gap-0.5 opacity-80 md:inline-flex"><MapPin className="h-3 w-3" />{s.ciudad}</span>}
              {hoy && <span className={cn("rounded-full px-1.5 text-[10px] font-bold uppercase", seleccion === s.id ? (sobreColor ? "bg-[#00A3E0] text-white" : "bg-white/25") : "bg-green-100 text-green-700")}>Hoy</span>}
            </button>
          );
        })}
      </div>
      {nota && <span className={cn("ml-auto text-[11px]", sobreColor ? "text-white/80" : "text-slate-400")}>{nota}</span>}
    </div>
  );
}
