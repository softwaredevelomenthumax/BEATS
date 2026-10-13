import * as React from "react";
import { traerUsuariosPorIds } from "@/lib/usuarios";
import type { Usuario } from "@/types";

/**
 * Fase 5 (post-reconstrucción, segunda entrega) — resuelve un conjunto de
 * ids de `usuarios` a sus datos completos (nombre, cargo), para la vista
 * oficial de impresión: el pie de página ("Elaborado por...") y la tabla de
 * Aprobación (columna "Nombre") solo tenían el id (`creadoPorId`/
 * `resueltoPorId`), nunca el nombre ya resuelto.
 *
 * Recibe la lista de ids en cada render y solo vuelve a consultar cuando el
 * CONJUNTO de ids cambia (se compara por su join ordenado, no por
 * referencia del arreglo, para no repetir la consulta en cada render solo
 * porque el llamador construyó un arreglo nuevo con los mismos ids). Es
 * best-effort, igual que el resto de los hooks de esta fase — si falla, la
 * vista impresa simplemente muestra "—" donde iría el nombre.
 */
export function useUsuariosPorId(ids: (string | undefined | null)[]): Map<string, Usuario> {
  const [mapa, setMapa] = React.useState<Map<string, Usuario>>(new Map());
  const clave = Array.from(new Set(ids.filter((id): id is string => Boolean(id)))).sort().join(",");

  React.useEffect(() => {
    if (!clave) {
      setMapa(new Map());
      return;
    }
    let cancelado = false;
    traerUsuariosPorIds(clave.split(","))
      .then((resultado) => {
        if (!cancelado) setMapa(resultado);
      })
      .catch(() => {
        if (!cancelado) setMapa(new Map());
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  return mapa;
}
