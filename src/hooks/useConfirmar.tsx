import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Confirmación previa a eliminar un registro. Uso:
 *
 *   const confirmar = useConfirmar();
 *   if (!(await confirmar({ titulo: "Eliminar speaker", mensaje: `¿Eliminar a ${s.nombre}?` }))) return;
 *
 * El diálogo vive en la raíz de la app (un único `ConfirmarProvider`), así
 * funciona igual desde páginas, ventanas de documento o formularios.
 */
export interface OpcionesConfirmar {
  titulo?: string;
  mensaje: React.ReactNode;
  textoConfirmar?: string;
}
type Confirmar = (opciones: OpcionesConfirmar) => Promise<boolean>;

const ConfirmarContexto = React.createContext<Confirmar>(async () => true);

export function ConfirmarProvider({ children }: { children: React.ReactNode }) {
  const [pendiente, setPendiente] = React.useState<{ opciones: OpcionesConfirmar; resolver: (v: boolean) => void } | null>(null);

  const confirmar = React.useCallback<Confirmar>(
    (opciones) => new Promise<boolean>((resolver) => setPendiente({ opciones, resolver })),
    [],
  );
  const cerrar = (valor: boolean) => {
    pendiente?.resolver(valor);
    setPendiente(null);
  };

  return (
    <ConfirmarContexto.Provider value={confirmar}>
      {children}
      <Dialog open={pendiente !== null} onOpenChange={(abierto) => !abierto && cerrar(false)}>
        <DialogContent className="max-w-md" data-testid="confirmar-eliminacion">
          <DialogHeader>
            <DialogTitle>{pendiente?.opciones.titulo ?? "Confirmar eliminación"}</DialogTitle>
            <DialogDescription asChild>
              <div>{pendiente?.opciones.mensaje}</div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" data-testid="confirmar-cancelar" onClick={() => cerrar(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" data-testid="confirmar-aceptar" onClick={() => cerrar(true)}>
              {pendiente?.opciones.textoConfirmar ?? "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmarContexto.Provider>
  );
}

export function useConfirmar(): Confirmar {
  return React.useContext(ConfirmarContexto);
}
