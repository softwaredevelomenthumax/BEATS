import * as React from "react";
import { AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

/**
 * Ronda de ajustes de formularios (septiembre 2026): "Usar formularios
 * colapsables (tipo acordeón) según las secciones que compongan el
 * formulario" — pedido explícito, repetido en la nota final de CADA
 * formulario de la especificación (Evento, Convenio de Pago a HCP, FMV,
 * CAF, Nuevo Speaker, Nuevo Usuario). Se construyó primero para Nuevo
 * Usuario (entrega 8) como bloques de `AccordionItem` escritos a mano; este
 * componente centraliza ese mismo patrón para reutilizarlo en los
 * formularios de documento, que además necesitan un control interactivo
 * (un `Switch` "Aplica"/"Se entregarán") al lado del título de varias
 * secciones — de ahí `accionesHeader`, que ahora acepta `AccordionTrigger`
 * (ver `components/ui/accordion.tsx`).
 *
 * Reemplaza 1:1 el patrón `<Card><CardHeader>...<CardTitle>` que usaban
 * estos formularios antes de esta ronda: mismo título, misma descripción
 * opcional, mismo contenido — el borde/padding de `AccordionItem` hace las
 * veces del borde de `Card`.
 */
export function SeccionAcordeon({
  value,
  titulo,
  descripcion,
  accionesHeader,
  children,
}: {
  /** Identificador único de la sección dentro de su `<Accordion>` — usado también en `defaultValue`. */
  value: string;
  titulo: string;
  descripcion?: string;
  accionesHeader?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <AccordionItem value={value} className="rounded-md border px-6">
      <AccordionTrigger accionesHeader={accionesHeader}>{titulo}</AccordionTrigger>
      {/* Ajuste de precisión (septiembre 2026), pedido explícito: al menos
          `pt-6` en el contenedor desplegable para que la cabecera azul del
          acordeón no limite ni corte visualmente la primera línea de
          etiquetas del contenido (p. ej. "Nombre del solicitante"). */}
      <AccordionContent className="flex flex-col gap-4 pb-6 pt-6">
        {descripcion && <p className="-mt-1 text-xs text-muted-foreground">{descripcion}</p>}
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}
