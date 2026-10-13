import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input, type InputProps } from "@/components/ui/input";

/** Segundos que la contraseña queda visible tras pulsar el ojo (solo para revisarla). */
const SEGUNDOS_VISIBLE = 3;

/**
 * Octubre 2026: campo de contraseña con botón "ver" (ícono ojo). Al pulsarlo
 * la contraseña se muestra unos segundos y se vuelve a ocultar sola (también
 * al salir del campo o al volver a pulsar).
 */
const InputPassword = React.forwardRef<HTMLInputElement, Omit<InputProps, "type">>(({ className, onBlur, ...props }, ref) => {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => setVisible(false), SEGUNDOS_VISIBLE * 1000);
    return () => window.clearTimeout(t);
  }, [visible]);
  return (
    <div className="relative w-full">
      <Input
        ref={ref}
        type={visible ? "text" : "password"}
        sinMayusculas
        className={["pr-10", className].filter(Boolean).join(" ")}
        onBlur={(e) => {
          setVisible(false);
          onBlur?.(e);
        }}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        data-testid="ver-password"
        aria-label={visible ? "Ocultar contraseña" : "Ver contraseña"}
        title={visible ? "Ocultar contraseña" : "Ver contraseña"}
        // onMouseDown evita que el campo pierda el foco (y se oculte) antes del clic.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-slate-900"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
});
InputPassword.displayName = "InputPassword";

export { InputPassword };
