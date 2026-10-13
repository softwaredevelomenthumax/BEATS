import * as React from "react";
import { cn } from "@/lib/utils";
import { formatearMonto } from "@/lib/dinero";

/**
 * Ajuste de precisión (septiembre 2026), pedido explícito — punto 6:
 * "Formateo de moneda 'en vivo' en el mismo campo". Reemplaza el patrón
 * anterior (`<Input type="number">` + un `<p className="text-xs
 * text-muted-foreground">{formatearMonto(...)}</p>` aparte, debajo del
 * campo) en TODOS los campos de dinero del formulario — la especificación
 * pide explícitamente que NO haya una etiqueta adicional debajo del campo.
 *
 * Comportamiento:
 * - En foco: muestra el número crudo, editable directamente (sin
 *   separadores ni símbolo de moneda), para que escribir/borrar dígitos sea
 *   natural — igual que un `<input type="number">`, pero sin las flechitas
 *   nativas de incremento/decremento (de ahí `type="text"` +
 *   `inputMode="decimal"`, en vez de `type="number"`).
 * - Al perder el foco: formatea EN EL MISMO INPUT con `formatearMonto`
 *   (separadores de miles/decimales + sufijo de moneda, p. ej.
 *   "$ 1.000.000,00 COP").
 *
 * `onChange` se dispara en cada tecleo con el valor numérico ya parseado
 * (o `null` si el campo queda vacío/inválido), para que cálculos derivados
 * (p. ej. "Costo Total Consolidado") se recalculen en vivo mientras se
 * escribe, sin esperar al blur.
 */
export function InputMoneda({
  id,
  value,
  onChange,
  moneda,
  disabled,
  placeholder,
  className,
}: {
  id?: string;
  value: number | null;
  onChange: (v: number | null) => void;
  moneda: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [enfocado, setEnfocado] = React.useState(false);
  const [textoCrudo, setTextoCrudo] = React.useState("");

  const textoMostrado = enfocado ? textoCrudo : value == null ? "" : formatearMonto(value, moneda);

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      disabled={disabled}
      placeholder={placeholder}
      value={textoMostrado}
      onFocus={() => {
        setTextoCrudo(value == null ? "" : String(value));
        setEnfocado(true);
      }}
      onChange={(e) => {
        const crudo = e.target.value;
        // Ajuste de precisión (septiembre 2026), pedido explícito: ningún
        // campo de dinero (salvo los calculados automáticamente, que ni
        // siquiera usan este componente) debe permitir valores negativos —
        // se quitó el signo "-" inicial que antes se aceptaba. Solo
        // dígitos y un separador decimal (coma o punto, se normaliza a
        // punto para el parseo).
        if (!/^\d*([.,]\d*)?$/.test(crudo)) return;
        setTextoCrudo(crudo);
        const normalizado = crudo.replace(",", ".");
        if (normalizado === "") {
          onChange(null);
          return;
        }
        const numero = Number(normalizado);
        onChange(Number.isNaN(numero) ? null : Math.max(0, numero));
      }}
      onBlur={() => setEnfocado(false)}
      className={cn(
        "flex h-9 w-full rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm text-slate-900 shadow-none transition-colors placeholder:text-slate-400 placeholder:font-normal focus-visible:border-[var(--brand-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    />
  );
}
