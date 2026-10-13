import { cn } from "@/lib/utils";

/**
 * Ajuste de precisión (septiembre 2026), pedido explícito — "Armonización
 * cromática de filtros y estados": antes de este ajuste cada pantalla con
 * filtros de pastilla (Tablero, Repositorio de Speakers, Historial) tenía
 * su propia implementación con colores distintos entre sí (azul/blue-600,
 * `--brand-blue`, `--primary`...). Este componente centraliza el ÚNICO
 * criterio pedido: activo = fondo `#00A3E0` con texto blanco en negrita;
 * inactivo = fondo `slate-100` con texto `slate-600`, `hover:bg-slate-200`.
 */
export function FiltroPastilla({
  activo,
  onClick,
  children,
  className,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs transition-colors",
        activo ? "bg-[#00A3E0] font-bold text-white shadow-sm" : "bg-slate-100 font-medium text-slate-600 hover:bg-slate-200",
        className,
      )}
    >
      {children}
    </button>
  );
}
