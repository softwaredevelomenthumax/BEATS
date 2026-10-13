import * as React from "react";

/**
 * Entrega 33 — ícono de «Muestras entregadas»: un frasco de medicamento con la cruz médica en la etiqueta.
 * Sustituye al ícono de cápsula suelta (`Pill` de lucide-react), que a 16 px se leía como un lápiz o un clip y no
 * como un medicamento. Mismo contrato que los íconos de lucide-react (trazo de 2 px, `currentColor`, `className`)
 * para poder intercambiarlo sin tocar el resto del diseño. Se usa en la Marquesina, el Panel en Vivo y el Informe
 * por Evento, así que «muestras» se ve igual en toda la aplicación.
 */
export function IconoMuestraMedica({ className, strokeWidth = 2, ...resto }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-icono="muestra-medica"
      className={className}
      {...resto}
    >
      {/* tapa */}
      <rect x="6" y="2" width="12" height="4" rx="1" />
      {/* cuerpo del frasco */}
      <path d="M7 6v13a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3V6" />
      {/* cruz médica */}
      <path d="M12 11v6M9 14h6" />
    </svg>
  );
}
