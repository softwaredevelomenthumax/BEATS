import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const Accordion = AccordionPrimitive.Root;

const AccordionItem = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  // "overflow-hidden" es lo que permite que el fondo azul cielo de la
  // cabecera (ver `AccordionTrigger` de abajo), que se extiende de borde a
  // borde con márgenes negativos, quede recortado exactamente por las
  // esquinas redondeadas del contenedor (`rounded-md`/`rounded-xl` que ya
  // pasan todos los consumidores de este componente) en vez de sobresalir
  // en cuadrado por fuera de ellas.
  <AccordionPrimitive.Item ref={ref} className={cn("overflow-hidden border-b", className)} {...props} />
));
AccordionItem.displayName = "AccordionItem";

const AccordionTrigger = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger> & {
    /**
     * Ronda de ajustes de formularios (septiembre 2026): contenido extra
     * (típicamente un `Switch` "Aplica"/"Se entregarán") que va al lado del
     * título, DENTRO del `Header` compartido pero FUERA del `<button>` del
     * trigger — anidar un control interactivo (otro `<button>`, como
     * `Switch`) dentro de este `<button>` sería HTML inválido y le robaría
     * el clic al despliegue del acordeón. `stopPropagation` evita que un
     * clic en ese control también abra/cierre la sección.
     */
    accionesHeader?: React.ReactNode;
  }
>(({ className, children, accionesHeader, ...props }, ref) => (
  // "Acordeones de alto contraste" (rediseño visual, septiembre 2026):
  // cabecera con fondo azul cielo tenue y borde inferior propio, título en
  // negrita mayúscula. El `-mx-6`/`-mt-px`/`px-6` hacen que ese fondo llegue
  // de borde a borde del contenedor (`AccordionItem` ya tiene
  // `overflow-hidden`, así que lo recorta exactamente por sus esquinas
  // redondeadas) — el margen negativo es igual o mayor al padding
  // horizontal real de cada consumidor (`px-3` a `px-6`), así que siempre
  // alcanza a bailar hasta el borde sin importar cuál use.
  <AccordionPrimitive.Header className="-mx-6 -mt-px flex items-center gap-2 rounded-t-md border-b border-sky-100 bg-sky-50/70 px-6">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        "flex flex-1 items-center justify-between py-3 text-sm font-bold uppercase tracking-wide text-slate-900 transition-all [&[data-state=open]>svg]:rotate-180",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200" />
    </AccordionPrimitive.Trigger>
    {accionesHeader && (
      <div onClick={(e) => e.stopPropagation()} className="shrink-0 normal-case">
        {accionesHeader}
      </div>
    )}
  </AccordionPrimitive.Header>
));
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName;

const AccordionContent = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className="overflow-hidden text-sm data-[state=closed]:animate-none data-[state=open]:animate-none"
    {...props}
  >
    <div className={cn("pb-4 pt-0", className)}>{children}</div>
  </AccordionPrimitive.Content>
));
AccordionContent.displayName = AccordionPrimitive.Content.displayName;

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
