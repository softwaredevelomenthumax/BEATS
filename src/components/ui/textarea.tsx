import * as React from "react";
import { aMayusculas } from "@/lib/normalizarTexto";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Entrega 32: por defecto el texto queda en MAYÚSCULAS; esto lo desactiva (cláusulas, mensajes, plantillas). */
  sinMayusculas?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, spellCheck, autoComplete, sinMayusculas, onChange, ...props }, ref) => (
    <textarea
      // Ajuste de precisión (septiembre 2026), pedido explícito:
      // "Autocorrector ortográfico" — spellcheck/autocomplete activados por
      // defecto en TODOS los textarea (comentarios/justificaciones son
      // siempre texto libre). Un valor explícito del consumidor gana sobre
      // este valor por defecto.
      spellCheck={spellCheck ?? true}
      autoComplete={autoComplete ?? "on"}
      autoCapitalize={sinMayusculas ? undefined : "characters"}
      onChange={
        sinMayusculas
          ? onChange
          : (e) => {
              const el = e.target;
              const convertido = aMayusculas(el.value);
              if (convertido !== el.value) {
                const inicio = el.selectionStart;
                const fin = el.selectionEnd;
                el.value = convertido;
                try {
                  el.setSelectionRange(inicio, fin);
                } catch {
                  /* sin selección */
                }
              }
              onChange?.(e);
            }
      }
      className={cn(
        !sinMayusculas && "uppercase placeholder:normal-case",
        // Ver comentario equivalente en `input.tsx` — mismo criterio de
        // "inputs planos" del rediseño visual.
        "flex min-h-16 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-none transition-colors placeholder:text-slate-400 focus-visible:border-[var(--brand-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
