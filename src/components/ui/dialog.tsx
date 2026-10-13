import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Minus, X } from "lucide-react";
import { useBandejaVentanas, PaginaVentanaContexto } from "@/hooks/useBandejaVentanas";
import { cn } from "@/lib/utils";

/**
 * Estado de "minimizada" de UNA ventana. Al minimizar, el diálogo pasa a no
 * modal y se OCULTA (display:none) en vez de desmontarse — así conserva lo
 * que el usuario venía escribiendo — y se registra en la bandeja del
 * AppShell (ver `useBandejaVentanas`) para poder restaurarlo.
 */
interface VentanaCtx {
  minimizada: boolean;
  minimizar: (titulo: string) => void;
}
/** Un anfitrión (p. ej. el gestor de ventanas de documentos) puede fijar el id con que la ventana se registra en la bandeja. */
const ClaveVentanaContexto = React.createContext<string | undefined>(undefined);

const VentanaContexto = React.createContext<VentanaCtx>({ minimizada: false, minimizar: () => {} });

function Dialog({ open, modal, children, ...props }: DialogPrimitive.DialogProps) {
  const [minimizadaEstado, setMinimizada] = React.useState(false);
  const [titulo, setTitulo] = React.useState("");
  const idAuto = React.useId();
  const id = React.useContext(ClaveVentanaContexto) ?? idAuto;
  const bandeja = useBandejaVentanas();
  // Si el anfitrión cierra la ventana estando minimizada, al reabrirla debe
  // verse normal (se reinicia durante el render, sin efecto).
  if (open === false && minimizadaEstado) setMinimizada(false);
  const minimizada = minimizadaEstado && open !== false;

  const { registrar, quitar } = bandeja;
  const paginaCtx = React.useContext(PaginaVentanaContexto);
  const nombrePagina = paginaCtx?.pagina;
  const retener = paginaCtx?.retener;
  React.useEffect(() => {
    if (!minimizada) return;
    registrar({ id, titulo, restaurar: () => setMinimizada(false), pagina: nombrePagina });
    // Minimizada, la página que la contiene debe seguir montada (oculta)
    // aunque el usuario navegue a otra, o se perdería lo diligenciado.
    retener?.(id, true);
    return () => {
      quitar(id);
      retener?.(id, false);
    };
  }, [minimizada, id, titulo, registrar, quitar, nombrePagina, retener]);

  const valor = React.useMemo<VentanaCtx>(
    () => ({
      minimizada,
      minimizar: (t) => {
        setTitulo(t);
        setMinimizada(true);
      },
    }),
    [minimizada],
  );
  return (
    <VentanaContexto.Provider value={valor}>
      <DialogPrimitive.Root open={open} modal={minimizada ? false : modal} {...props}>
        {children}
      </DialogPrimitive.Root>
    </VentanaContexto.Provider>
  );
}
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-50 bg-black/50", className)}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /** Muestra el botón "_" (minimizar a la bandeja). Solo para ventanas de vista/edición de documentos y formularios. */
  minimizable?: boolean;
  /** Si es true, la "X" pide confirmación antes de cerrar (hay cambios sin guardar). */
  confirmarCierre?: boolean;
}

const DialogContent = React.forwardRef<React.ComponentRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  ({ className, children, minimizable = false, confirmarCierre = false, onInteractOutside, onFocusOutside, style, ...props }, ref) => {
    const { minimizada, minimizar } = React.useContext(VentanaContexto);
    const contenidoRef = React.useRef<HTMLDivElement | null>(null);
    const asignarRef = (nodo: HTMLDivElement | null) => {
      contenidoRef.current = nodo;
      if (typeof ref === "function") ref(nodo);
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = nodo;
    };
    return (
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={asignarRef}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg rounded-lg max-h-[85vh] overflow-y-auto",
            className,
          )}
          style={minimizada ? { ...style, display: "none" } : style}
          // Minimizada, la ventana es "no modal": un clic en la página de
          // atrás NO debe cerrarla.
          onInteractOutside={(e) => {
            if (minimizada) e.preventDefault();
            else onInteractOutside?.(e);
          }}
          onFocusOutside={(e) => {
            if (minimizada) e.preventDefault();
            else onFocusOutside?.(e);
          }}
          {...props}
        >
          {children}
            {minimizable && (
              <button
                type="button"
                data-testid="ventana-minimizar"
                onClick={() => {
                  const t = contenidoRef.current?.querySelector("h2")?.textContent?.trim();
                  minimizar(t || "Ventana");
                }}
                className="absolute right-10 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <Minus className="h-4 w-4" />
                <span className="sr-only">Minimizar</span>
              </button>
            )}
            <DialogPrimitive.Close
              data-testid="ventana-cerrar"
              onClick={(e) => {
                if (confirmarCierre && !window.confirm("Hay cambios sin guardar. ¿Cerrar la ventana y descartarlos?")) {
                  e.preventDefault();
                }
              }}
              className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Cerrar</span>
            </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  },
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-left", className)} {...props} />
);
const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);

const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  ClaveVentanaContexto,
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
