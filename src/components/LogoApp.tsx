import { ShieldCheck } from "lucide-react";

interface LogoAppProps {
  /** URL/dataURL de un logo real ya resuelto, si existe. */
  logoUrl?: string | null;
  anchoMax?: number;
  anchoPx?: number | null;
  altoPx?: number | null;
  /** true: junto al ícono de respaldo muestra el texto "BEATS" (patrón del
   * sidebar). false: solo el ícono (patrón de Créditos/pantalla de empresa). */
  nombreDeRespaldo?: boolean;
}

/**
 * Logo de la aplicación — recuperado por extracción forense del bundle
 * original: si `configuracion_formatos` tiene un logo real configurado, se
 * muestra la imagen (a su tamaño explícito `logoAppAnchoPx`/`logoAppAltoPx`,
 * o a `anchoMax` con alto automático); si no, un ícono de respaldo en un
 * cuadro del color de marca, opcionalmente con el texto "BEATS" al lado.
 *
 * Nota: `logoAppId` ya existe en `configuracion_formatos` desde la Fase 5,
 * pero esta reconstrucción todavía no resuelve ese id a una URL real de
 * almacenamiento (quedó deferred, ver `types.ts`) — por eso hoy `logoUrl`
 * siempre llega vacío y se ve el respaldo. El componente ya queda listo
 * para recibir la URL real cuando esa resolución se implemente.
 */
export function LogoApp({ logoUrl, anchoMax = 160, anchoPx, altoPx, nombreDeRespaldo = false }: LogoAppProps) {
  if (logoUrl) {
    const medidaExplicita = Boolean(anchoPx || altoPx);
    return (
      <img
        src={logoUrl}
        alt="BEATS"
        className="block object-contain"
        style={
          medidaExplicita
            ? { width: anchoPx || "auto", height: altoPx || "auto", maxWidth: "100%" }
            : { width: anchoMax, maxWidth: "100%", height: "auto" }
        }
      />
    );
  }

  const tamano = Math.round(anchoMax * 0.3);
  const icono = (
    <div
      className="flex shrink-0 items-center justify-center rounded-lg"
      style={{ height: tamano, width: tamano, background: "hsl(var(--primary))" }}
    >
      <ShieldCheck
        className="text-white"
        style={{ height: tamano * 0.55, width: tamano * 0.55 }}
        strokeWidth={2.25}
      />
    </div>
  );

  if (!nombreDeRespaldo) return icono;

  return (
    <div className="flex items-center gap-2.5">
      {icono}
      <p
        className="text-[19px] font-semibold leading-none"
        style={{ fontFamily: "var(--font-display)", color: "var(--sidebar-fg)" }}
      >
        BEATS
      </p>
    </div>
  );
}
