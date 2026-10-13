import * as React from "react";
import { Maximize2, AppWindow } from "lucide-react";

/**
 * Octubre 2026 — "Todas las ventanas ... deberían tener un botón de cerrar
 * 'X' e inclusive de minimizar '_'" (opción C: bandeja ahora, ventanas
 * flotantes después).
 *
 * Una ventana (diálogo) minimizable se registra aquí al minimizarse y
 * aparece como una pastilla en la bandeja inferior; la ventana sigue
 * montada (solo oculta), así que NO pierde lo que se estaba escribiendo.
 * La bandeja vive en el AppShell, fuera de las páginas. `restaurar` es lo
 * único que necesita cada ventana — cuando más adelante se pasen a ventanas
 * flotantes, el registro (id + título + restaurar) sigue sirviendo igual.
 */
export interface VentanaMinimizada {
  id: string;
  titulo: string;
  restaurar: () => void;
  /** Página (del AppShell) donde vive la ventana: al restaurar desde la bandeja se navega primero a ella. */
  pagina?: string;
}

/**
 * Página del AppShell que contiene a las ventanas. Una ventana minimizada
 * le pide "retenerse" (seguir montada, oculta) aunque el usuario navegue a
 * otra página, para no perder lo que se venía diligenciando.
 */
export interface PaginaVentanaCtx {
  pagina: string;
  retener: (idVentana: string, retener: boolean) => void;
}
export const PaginaVentanaContexto = React.createContext<PaginaVentanaCtx | null>(null);

interface BandejaCtx {
  registrar: (v: VentanaMinimizada) => void;
  quitar: (id: string) => void;
  /** Restaura la ventana minimizada con ese id (si no está minimizada, no hace nada). Devuelve si existía. */
  restaurar: (id: string) => boolean;
  /** El AppShell registra aquí cómo navegar a una página (para restaurar ventanas de páginas no visibles). */
  fijarNavegador: (fn: ((pagina: string) => void) | null) => void;
}

const SinBandeja: BandejaCtx = { registrar: () => {}, quitar: () => {}, restaurar: () => false, fijarNavegador: () => {} };
const Contexto = React.createContext<BandejaCtx>(SinBandeja);

export function useBandejaVentanas(): BandejaCtx {
  return React.useContext(Contexto);
}

export function BandejaVentanasProvider({ children }: { children: React.ReactNode }) {
  const [ventanas, setVentanas] = React.useState<VentanaMinimizada[]>([]);
  const registrar = React.useCallback((v: VentanaMinimizada) => {
    setVentanas((prev) => [...prev.filter((x) => x.id !== v.id), v]);
  }, []);
  const quitar = React.useCallback((id: string) => {
    setVentanas((prev) => prev.filter((x) => x.id !== id));
  }, []);
  const ventanasRef = React.useRef<VentanaMinimizada[]>([]);
  ventanasRef.current = ventanas;
  const restaurar = React.useCallback((id: string) => {
    const v = ventanasRef.current.find((x) => x.id === id);
    if (v?.pagina) navegadorRef.current?.(v.pagina);
    v?.restaurar();
    return Boolean(v);
  }, []);
  const navegadorRef = React.useRef<((pagina: string) => void) | null>(null);
  const fijarNavegador = React.useCallback((fn: ((pagina: string) => void) | null) => {
    navegadorRef.current = fn;
  }, []);
  const valor = React.useMemo(() => ({ registrar, quitar, restaurar, fijarNavegador }), [registrar, quitar, restaurar, fijarNavegador]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      {ventanas.length > 0 && (
        <div
          data-testid="bandeja-ventanas"
          className="no-imprimir fixed bottom-3 left-3 right-3 z-[60] flex flex-wrap items-center gap-2 pointer-events-none"
          role="toolbar"
          aria-label="Ventanas minimizadas"
        >
          {ventanas.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => restaurar(v.id)}
              title={`Restaurar: ${v.titulo}`}
              className="pointer-events-auto flex max-w-[16rem] items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm shadow-lg hover:bg-muted"
            >
              <AppWindow className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{v.titulo}</span>
              <Maximize2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="sr-only">Restaurar</span>
            </button>
          ))}
        </div>
      )}
    </Contexto.Provider>
  );
}
