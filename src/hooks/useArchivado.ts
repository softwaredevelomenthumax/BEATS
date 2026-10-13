import * as React from "react";
import { useAuth } from "@/hooks/useAuth";
import { EVENTO_PREFERENCIAS_CAMBIARON, mesesArchivadoEfectivo } from "@/lib/archivado";

/** Entrega 28 — meses de archivado del usuario actual (0 = nunca); se actualiza al guardar «Mis preferencias». */
export function useMesesArchivado(): number {
  const { usuario } = useAuth();
  const [, forzar] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener(EVENTO_PREFERENCIAS_CAMBIARON, forzar);
    return () => window.removeEventListener(EVENTO_PREFERENCIAS_CAMBIARON, forzar);
  }, []);
  return usuario ? mesesArchivadoEfectivo(usuario) : 0;
}
