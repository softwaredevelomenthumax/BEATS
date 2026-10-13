import { cn } from "@/lib/utils";

/**
 * Rediseño visual (septiembre 2026), pedido explícito — "Patrón A1: Toggle
 * Cápsula Flotante", para opciones binarias/de modalidad como "Presencial /
 * Virtual" o "¿Se entregarán muestras médicas? (Sí / No)": riel gris suave
 * con una pastilla blanca flotante sobre la opción activa, en vez de un
 * <Select> o un <Switch> genérico para este tipo de decisión.
 *
 * Genérico en la cantidad de opciones (no solo 2) para poder reusarlo tanto
 * en controles estrictamente binarios (Sí/No) como en el de 3 vías
 * "Formato" (Presencial/Virtual/Mixto).
 */
export function ToggleCapsula<T extends string>({
  value,
  onValueChange,
  opciones,
  disabled,
  className,
}: {
  value: T;
  onValueChange: (v: T) => void;
  opciones: { value: T; label: string }[];
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      className={cn("inline-flex w-fit items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1", className)}
    >
      {opciones.map((op) => {
        const activo = op.value === value;
        return (
          <button
            key={op.value}
            type="button"
            role="radio"
            aria-checked={activo}
            disabled={disabled}
            onClick={() => onValueChange(op.value)}
            className={cn(
              "rounded-md px-6 py-2 text-xs transition-all disabled:cursor-not-allowed disabled:opacity-50",
              activo
                ? "bg-white font-bold text-[var(--brand-blue)] shadow-sm"
                : "font-medium text-slate-500 hover:text-slate-800",
            )}
          >
            {op.label}
          </button>
        );
      })}
    </div>
  );
}
