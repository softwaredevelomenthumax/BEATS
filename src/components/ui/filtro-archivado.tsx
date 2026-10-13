import { Archive } from "lucide-react";
import { FiltroPastilla } from "@/components/ui/filtro-pastilla";
import { EVENTO_ABRIR_PREFERENCIAS } from "@/lib/archivado";

export type VistaArchivado = "activos" | "archivados" | "todos";

/** Entrega 28 — «Activos / Archivados (n) / Todos». Solo se muestra cuando el usuario configuró archivado automático. */
export function FiltroArchivado({
  meses,
  valor,
  onValor,
  cantidadArchivados,
}: {
  meses: number;
  valor: VistaArchivado;
  onValor: (v: VistaArchivado) => void;
  cantidadArchivados: number;
}) {
  if (!meses) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="filtro-archivado">
      <Archive className="mr-1 h-4 w-4 shrink-0 text-muted-foreground" />
      <FiltroPastilla activo={valor === "activos"} onClick={() => onValor("activos")}>
        Activos
      </FiltroPastilla>
      <FiltroPastilla activo={valor === "archivados"} onClick={() => onValor("archivados")}>
        Archivados ({cantidadArchivados})
      </FiltroPastilla>
      <FiltroPastilla activo={valor === "todos"} onClick={() => onValor("todos")}>
        Todos
      </FiltroPastilla>
      <span className="ml-2 text-xs text-muted-foreground">
        Archivado automático: eventos finalizados hace más de {meses} {meses === 1 ? "mes" : "meses"}.{" "}
        <button type="button" className="font-medium text-primary hover:underline" onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR_PREFERENCIAS))}>
          Cambiar
        </button>
      </span>
    </div>
  );
}
