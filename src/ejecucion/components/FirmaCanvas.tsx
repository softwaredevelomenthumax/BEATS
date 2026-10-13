import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface FirmaCanvasHandle {
  /** `null` si el lienzo sigue en blanco — se usa para exigir la firma antes de enviar. */
  obtenerDataUrl: () => string | null;
  limpiar: () => void;
  tieneTrazo: () => boolean;
}

interface Props {
  etiqueta?: string;
  className?: string;
}

/**
 * Firma real en `<canvas>` (confirmado en el bundle original: las firmas se
 * guardan como `data:image/png;base64,...` directamente en la columna
 * `archivos_adjuntos.data_url`, no en Supabase Storage). Usa Pointer Events
 * para funcionar igual con mouse, dedo o lápiz óptico en una tableta.
 */
export const FirmaCanvas = React.forwardRef<FirmaCanvasHandle, Props>(function FirmaCanvas(
  { etiqueta = "Firma", className },
  ref,
) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const dibujando = React.useRef(false);
  const huboTrazo = React.useRef(false);
  const ultimoPunto = React.useRef<{ x: number; y: number } | null>(null);
  const [vacio, setVacio] = React.useState(true);

  function coordenadas(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const escalaX = canvas.width / rect.width;
    const escalaY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * escalaX, y: (e.clientY - rect.top) * escalaY };
  }

  function iniciarTrazo(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    dibujando.current = true;
    ultimoPunto.current = coordenadas(e);
    try {
      // No todos los entornos permiten capturar el puntero (p.ej. algunos
      // navegadores headless) — si falla, el trazo se sigue dibujando
      // igual mientras el botón/dedo se mantenga sobre el lienzo.
      canvasRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // ignorado a propósito
    }
  }

  function continuarTrazo(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const punto = coordenadas(e);
    if (ctx && ultimoPunto.current) {
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(ultimoPunto.current.x, ultimoPunto.current.y);
      ctx.lineTo(punto.x, punto.y);
      ctx.stroke();
    }
    ultimoPunto.current = punto;
    if (!huboTrazo.current) {
      huboTrazo.current = true;
      setVacio(false);
    }
  }

  function terminarTrazo(e: React.PointerEvent<HTMLCanvasElement>) {
    dibujando.current = false;
    ultimoPunto.current = null;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // ignorado a propósito
    }
  }

  function limpiar() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    huboTrazo.current = false;
    setVacio(true);
  }

  React.useImperativeHandle(ref, () => ({
    obtenerDataUrl: () => (huboTrazo.current ? (canvasRef.current?.toDataURL("image/png") ?? null) : null),
    limpiar,
    tieneTrazo: () => huboTrazo.current,
  }));

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{etiqueta}</span>
        <Button type="button" variant="ghost" size="sm" onClick={limpiar} disabled={vacio}>
          Limpiar firma
        </Button>
      </div>
      <canvas
        ref={canvasRef}
        width={600}
        height={200}
        className="w-full touch-none rounded-md border border-input bg-white"
        style={{ aspectRatio: "3 / 1" }}
        onPointerDown={iniciarTrazo}
        onPointerMove={continuarTrazo}
        onPointerUp={terminarTrazo}
        onPointerLeave={terminarTrazo}
        onPointerCancel={terminarTrazo}
      />
      {vacio && <p className="text-xs text-muted-foreground">Firma aquí con el dedo o el mouse.</p>}
    </div>
  );
});
