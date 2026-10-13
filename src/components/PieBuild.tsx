import { textoBuild } from "@/lib/buildInfo";

/** Pie de página fijo con versión y fecha/hora de creación del bundle (Ejecución en Sitio y Marquesina). */
export function PieBuild() {
  return (
    <>
      <div aria-hidden className="h-8" />
      <footer
        data-testid="pie-build"
        className="no-imprimir fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 px-3 py-1.5 text-center text-[11px] text-muted-foreground"
      >
        {textoBuild()}
      </footer>
    </>
  );
}
