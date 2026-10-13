import * as React from "react";
import { useVentanasDocumentos } from "@/hooks/useVentanasDocumentos";
import type { DocumentoAny } from "@/lib/documentoGenerico";

/**
 * Abre la ventana de detalle de cualquiera de los 6 tipos de documento.
 *
 * Octubre 2026 (ventanas, fase 2): las ventanas ya NO las renderiza la página
 * que llama — viven en el AppShell (`VentanasDocumentosProvider`) para poder
 * sobrevivir al cambio de página y minimizarse a la bandeja. Esta función
 * conserva la firma anterior (`{ abrir, dialogos }`) para no tocar las
 * páginas; `dialogos` queda vacío. `recargar` se llama mientras la página
 * siga montada, cada vez que una ventana modifica un documento.
 */
export function useAbrirDocumentoGenerico(recargar?: () => void) {
  const { abrir, suscribirRecarga } = useVentanasDocumentos();
  const recargarRef = React.useRef(recargar);
  recargarRef.current = recargar;
  React.useEffect(() => suscribirRecarga(() => recargarRef.current?.()), [suscribirRecarga]);
  return { abrir: abrir as (doc: DocumentoAny) => void, dialogos: null as React.ReactNode };
}
