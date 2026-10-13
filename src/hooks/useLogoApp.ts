import * as React from "react";
import { traerConfiguracionFormatos } from "@/lib/configuracionFormatos";
import { traerArchivo } from "@/lib/archivosAdjuntos";

/**
 * Corrección (Logo de la app en Login/Créditos, septiembre 2026): pedido
 * explícito — "Garantiza que en la ventana de login, en la parte superior
 * izquierda de la ventana principal... y en la ventana de Créditos,
 * aparezca el logo de la aplicación que se precarga (o precargó) en la
 * sección Configuración de campos/variables".
 *
 * `LogoApp.tsx` ya sabía pintar el logo real cuando recibía `logoUrl`, pero
 * ningún consumidor (`PantallaLogin.tsx`, `App.tsx`, `Creditos.tsx`)
 * resolvía `configuracion_formatos.logo_app_id` a una URL real — quedó
 * señalado como "deferred" en el comentario de ese componente. Este hook
 * completa esa resolución (mismo patrón que `useMembreteImpreso` resuelve
 * el logo INSTITUCIONAL vía `archivos_adjuntos`), pero para el logo de la
 * APLICACIÓN, que es siempre global (no tiene override por empresa — ver
 * `EditorConfiguracionFormatos`, el campo solo se muestra con "Global"
 * elegido).
 */
export function useLogoApp(): { cargando: boolean; logoUrl: string | null; anchoPx: number | null; altoPx: number | null } {
  const [logoUrl, setLogoUrl] = React.useState<string | null>(null);
  const [anchoPx, setAnchoPx] = React.useState<number | null>(null);
  const [altoPx, setAltoPx] = React.useState<number | null>(null);
  const [cargando, setCargando] = React.useState(true);

  React.useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const global = await traerConfiguracionFormatos();
        if (cancelado) return;
        setAnchoPx(global.logoAppAnchoPx ?? null);
        setAltoPx(global.logoAppAltoPx ?? null);
        if (global.logoAppId) {
          const archivo = await traerArchivo(global.logoAppId);
          if (!cancelado) setLogoUrl(archivo?.dataUrl ?? null);
        } else if (!cancelado) {
          setLogoUrl(null);
        }
      } catch {
        if (!cancelado) {
          setLogoUrl(null);
          setAnchoPx(null);
          setAltoPx(null);
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  return { cargando, logoUrl, anchoPx, altoPx };
}
