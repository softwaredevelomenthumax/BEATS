import * as React from "react";
import { AtSign } from "lucide-react";
import { Input, type InputProps } from "@/components/ui/input";
import { normalizarEmail } from "@/lib/normalizarTexto";
import { cn } from "@/lib/utils";

/**
 * Entrega 31: campo de correo electrónico con máscara (icono «@» fijo, teclado de correo en el
 * celular y formato `usuario@dominio.ext`) que siempre queda en minúscula y sin espacios,
 * aunque se escriba o pegue en mayúscula. Es `type="text"` + `inputMode="email"` a propósito:
 * en `type="email"` el navegador no permite conservar la posición del cursor al convertir.
 */
export const InputEmail = React.forwardRef<HTMLInputElement, InputProps>(({ onChange, className, placeholder, ...props }, ref) => (
  <div className="relative">
    <AtSign className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
    <Input
      ref={ref}
      type="text"
      inputMode="email"
      autoComplete={props.autoComplete ?? "email"}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      placeholder={placeholder ?? "usuario@dominio.com"}
      className={cn("pl-8 lowercase placeholder:normal-case", className)}
      onChange={(e) => {
        const el = e.target;
        const convertido = normalizarEmail(el.value);
        if (convertido !== el.value) {
          const pos = el.selectionStart;
          const quitados = el.value.length - convertido.length;
          el.value = convertido;
          try {
            if (pos !== null) el.setSelectionRange(Math.max(0, pos - quitados), Math.max(0, pos - quitados));
          } catch {
            /* sin selección */
          }
        }
        onChange?.(e);
      }}
      {...props}
    />
  </div>
));
InputEmail.displayName = "InputEmail";
