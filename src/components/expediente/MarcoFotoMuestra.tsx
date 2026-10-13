import * as React from "react";
import { Camera } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MARCOS_FOTO, type ClaveMarcoFoto } from "@/lib/expediente";
import { cn } from "@/lib/utils";

/**
 * Marco "de muestra" de cada foto del evento: un croquis esquemático (SVG,
 * sin imágenes externas) que orienta qué se debe fotografiar. Se usa en el
 * Expediente (para subir desde archivo) y en la app de Ejecución en Sitio
 * (para tomar la foto con la cámara) — por eso no depende de nada de la
 * app principal salvo componentes de UI y `lib/expediente`.
 */
function Croquis({ clave }: { clave: ClaveMarcoFoto }) {
  const trazo = "stroke-muted-foreground/60";
  const relleno = "fill-muted-foreground/25";
  return (
    <svg viewBox="0 0 160 120" role="img" aria-label="Croquis de la foto de muestra" className="h-full w-full">
      <rect x="0" y="0" width="160" height="120" className="fill-muted/60" />
      {clave === "grupal" && (
        <g className={trazo} strokeWidth="1.5">
          {[28, 52, 76, 100, 124].map((x, i) => (
            <g key={x} transform={`translate(0 ${i % 2 === 0 ? 0 : 10})`}>
              <circle cx={x} cy="52" r="9" className={relleno} />
              <path d={`M${x - 14} 98 q14 -30 28 0 z`} className={relleno} />
            </g>
          ))}
          <rect x="52" y="12" width="56" height="12" rx="2" fill="none" strokeDasharray="3 3" />
        </g>
      )}
      {(clave === "actividad_1" || clave === "actividad_2") && (
        <g className={trazo} strokeWidth="1.5">
          <circle cx="52" cy="46" r="10" className={relleno} />
          <path d="M34 100 q18 -34 36 0 z" className={relleno} />
          <circle cx="112" cy="50" r="9" className={relleno} />
          <path d="M96 100 q16 -30 32 0 z" className={relleno} />
          <path d="M66 70 L98 66" fill="none" strokeLinecap="round" />
          <rect x="76" y="58" width="12" height="16" rx="2" fill="none" />
          {clave === "actividad_2" && <circle cx="132" cy="22" r="6" fill="none" strokeDasharray="2 3" />}
        </g>
      )}
      {clave === "speaker" && (
        <g className={trazo} strokeWidth="1.5">
          <rect x="18" y="12" width="124" height="52" rx="3" fill="none" />
          <path d="M30 30 h52 M30 40 h72 M30 50 h40" fill="none" strokeLinecap="round" />
          <circle cx="112" cy="84" r="9" className={relleno} />
          <path d="M96 118 q16 -32 32 0 z" className={relleno} />
          <rect x="72" y="92" width="22" height="26" rx="2" fill="none" />
        </g>
      )}
    </svg>
  );
}

export function MarcoFotoMuestra({
  clave,
  className,
}: {
  clave: ClaveMarcoFoto;
  className?: string;
}) {
  return (
    <div className={cn("aspect-[4/3] overflow-hidden rounded-md border border-dashed border-muted-foreground/40", className)}>
      <Croquis clave={clave} />
    </div>
  );
}

/**
 * Diálogo con el marco de muestra ampliado y la guía de la foto. `accion`
 * permite pasar el botón de subir/tomar la foto para ese marco.
 */
export function GuiaMarcoFoto({
  clave,
  abierto,
  onCerrar,
  accion,
}: {
  clave: ClaveMarcoFoto;
  abierto: boolean;
  onCerrar: () => void;
  accion?: React.ReactNode;
}) {
  const marco = MARCOS_FOTO.find((m) => m.clave === clave);
  if (!marco) return null;
  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-w-md" data-testid={`guia-foto-${clave}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="size-4" /> {marco.titulo}
          </DialogTitle>
          <DialogDescription>{marco.guia}</DialogDescription>
        </DialogHeader>
        <MarcoFotoMuestra clave={clave} />
        <p className="text-xs text-muted-foreground">Croquis de referencia: no tiene que verse igual, solo mostrar lo mismo.</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCerrar}>Cerrar</Button>
          {accion}
        </div>
      </DialogContent>
    </Dialog>
  );
}
