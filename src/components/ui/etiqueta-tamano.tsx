import { FileDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { etiquetaTamano } from "@/lib/tamanoEstimado";

/** Entrega 31: etiqueta discreta «Tamaño estimado: ≈ 12 KB» para ponerla junto a cualquier botón que genere un archivo. */
export function EtiquetaTamano({ bytes, cargando, className, testId }: { bytes: number | null; cargando?: boolean; className?: string; testId?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}
      data-testid={testId}
      title="Tamaño aproximado del archivo que se va a generar"
    >
      <FileDown className="size-3" />
      {cargando || bytes == null ? "Calculando tamaño…" : <>Tamaño estimado: <b className="font-medium text-foreground">{etiquetaTamano(bytes)}</b></>}
    </span>
  );
}
