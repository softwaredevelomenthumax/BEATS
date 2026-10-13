import * as React from "react";
import { Input, type InputProps } from "@/components/ui/input";
import { aMayusculas } from "@/lib/normalizarTexto";
import { cn } from "@/lib/utils";

/**
 * Entrega 31: campo de texto que SIEMPRE queda en mayúsculas (lo que se escribe, se pega o se
 * autocompleta se convierte al instante). Conserva la posición del cursor al convertir.
 */
export const InputMayuscula = React.forwardRef<HTMLInputElement, InputProps>(({ onChange, className, autoCapitalize, ...props }, ref) => (
  <Input
    ref={ref}
    autoCapitalize={autoCapitalize ?? "characters"}
    className={cn("uppercase placeholder:normal-case", className)}
    onChange={(e) => {
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
    }}
    {...props}
  />
));
InputMayuscula.displayName = "InputMayuscula";
