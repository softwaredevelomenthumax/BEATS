import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Rediseño visual (septiembre 2026), pedido explícito — "Patrón B2:
 * Gradiente Sedoso con Micro-Bisel estilo Apple". Reemplaza los botones
 * planos por volumen sutil:
 * - Primario ("default"): gradiente vertical `#00B2F2` → `#0091C8`,
 *   micro-reflejo superior, borde inferior/laterales oscurecidos, sombra de
 *   apoyo difusa en el tono de marca, y compresión de 1px al hacer clic
 *   (`active:translate-y-px`).
 * - Secundario: gradiente blanco → gris ultra tenue, borde `slate-300`,
 *   texto `slate-700`, ligera elevación en hover — se aplica sobre la
 *   variante `secondary` ya existente (usada en "Guardar Borrador",
 *   "Cancelar", etc. en toda la app) para no tener que renombrar ningún
 *   uso existente.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Ajuste de precisión (septiembre 2026), pedido explícito — punto 9:
        // "confirmar/mantener Patrón B2... texto blanco en negrita" — se
        // agrega `font-bold` explícito (antes solo heredaba `font-medium`
        // del contenedor base).
        default:
          "border border-t-white/40 border-b-black/15 border-x-[#008abf] bg-[linear-gradient(180deg,#00B2F2_0%,#0091C8_100%)] font-bold text-white shadow-[0_1px_2px_rgba(0,0,0,0.08),0_3px_8px_rgba(0,163,224,0.25)] hover:brightness-[1.03] active:translate-y-px active:shadow-[0_1px_1px_rgba(0,0,0,0.08)]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "border border-slate-300 bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FAFC_100%)] text-slate-700 font-semibold shadow-sm hover:shadow active:translate-y-px",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-10 rounded-lg px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
