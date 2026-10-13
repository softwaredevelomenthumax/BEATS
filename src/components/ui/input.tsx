import * as React from "react";
import { aMayusculas } from "@/lib/normalizarTexto";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /**
   * Entrega 32: por defecto todo campo de TEXTO queda en MAYÚSCULAS (lo que se escribe o pega se convierte
   * al instante, así no se crean registros «duplicados» que solo difieren en mayúsculas). Esta propiedad lo
   * desactiva en los pocos campos donde no aplica (texto de mensajes y cláusulas). Los campos de correo
   * (`InputEmail`), contraseña, número, fecha, teléfono y URL nunca se convierten.
   */
  sinMayusculas?: boolean;
}

const MODOS_SIN_MAYUSCULAS = new Set(["email", "numeric", "decimal", "tel", "url"]);
const AUTOCOMPLETE_SIN_MAYUSCULAS = new Set(["email", "username", "current-password", "new-password", "url", "one-time-code"]);

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, spellCheck, autoComplete, sinMayusculas, onChange, inputMode, ...props }, ref) => {
    // Ajuste de precisión (septiembre 2026), pedido explícito: "Autocorrector
    // ortográfico" — spellcheck/autocomplete activados por defecto en los
    // inputs de TEXTO (nombre, texto libre, búsqueda; sin `type` o
    // `type="text"`/`"search"`), sin tocar los campos con semántica propia
    // (número, fecha, correo, contraseña, etc., que quedan como antes). Un
    // valor explícito que pase el consumidor (`spellCheck`/`autoComplete`)
    // siempre gana sobre este valor por defecto.
    const esCampoDeTexto = !type || type === "text" || type === "search";
    const convierte =
      !sinMayusculas &&
      (!type || type === "text") &&
      !(inputMode && MODOS_SIN_MAYUSCULAS.has(inputMode)) &&
      !(autoComplete && AUTOCOMPLETE_SIN_MAYUSCULAS.has(autoComplete)) &&
      !/\blowercase\b/.test(className ?? "");
    return (
      <input
        type={type}
        inputMode={inputMode}
        autoCapitalize={convierte ? "characters" : undefined}
        onChange={
          convierte
            ? (e) => {
                const el = e.target;
                const convertido = aMayusculas(el.value);
                if (convertido !== el.value) {
                  const inicio = el.selectionStart;
                  const fin = el.selectionEnd;
                  el.value = convertido;
                  try {
                    if (inicio !== null && fin !== null) el.setSelectionRange(inicio, fin);
                  } catch {
                    /* algunos tipos de input no admiten selección */
                  }
                }
                onChange?.(e);
              }
            : onChange
        }
        spellCheck={spellCheck ?? (esCampoDeTexto ? true : undefined)}
        autoComplete={autoComplete ?? (esCampoDeTexto ? "on" : undefined)}
        className={cn(
          // Rediseño visual (septiembre 2026): "inputs planos" — sin
          // box-shadow, borde perimetral sutil (slate-300) y foco clínico
          // corporativo (borde azul de marca + halo sky-100), pedido
          // explícito.
          "flex h-9 w-full rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm text-slate-900 shadow-none transition-colors placeholder:text-slate-400 focus-visible:border-[var(--brand-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-50",
          convierte && "uppercase placeholder:normal-case",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
