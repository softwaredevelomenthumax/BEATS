import * as React from "react";
import {
  traerConfiguracionFormatos,
  traerConfiguracionFormatosEmpresas,
  resolverFormatoDocumento,
} from "@/lib/configuracionFormatos";
import { traerArchivo } from "@/lib/archivosAdjuntos";
import type { FormatoDocumentoConfig } from "@/types";
import type { TipoDoc } from "@/lib/enums";

/**
 * Fase 5 (post-reconstrucción) — membrete de impresión/PDF.
 *
 * Resuelve, para un tipo de documento y la empresa del grupo del usuario en
 * sesión (mismo criterio que ya usa `etiquetaEfectiva` para las etiquetas de
 * campo por empresa), el formato efectivo (`PROCESO`/`CÓDIGO`/`VERSIÓN`/
 * `EMISIÓN`, override de empresa por campo sobre el valor global — ver
 * `resolverFormatoDocumento`) y el logo INSTITUCIONAL de la empresa (campo
 * `logoId`/`logo_id`, resuelto a su `dataUrl` real vía `archivos_adjuntos`).
 *
 * CORRECCIÓN (Fase 5, cuarta entrega): esta resolución usaba por error
 * `global.logoAppId` — el logo de la APLICACIÓN (barra lateral/login,
 * `logo_app_id`, ver `LogoApp.tsx`), un campo totalmente distinto — y nunca
 * miraba el override por empresa (`configuracion_formatos_empresa.logo_id`,
 * "Logo institucional de esta empresa" en `EditorConfiguracionFormatos`,
 * que ya existía en el editor administrativo pero nunca se leía desde
 * ningún lado). El membrete de impresión ahora sí resuelve el logo
 * INSTITUCIONAL correcto: el de la empresa específica del documento si esa
 * empresa tiene uno propio cargado, o si no, el logo institucional global
 * — nunca el logo de la aplicación.
 *
 * `tipo`/`empresaGrupo` son opcionales a propósito: cuando no se pasan (p.
 * ej. el generador standalone "Informe por Evento", que no es uno de los 6
 * documentos con formato configurable) el hook no hace ninguna consulta y
 * devuelve todo vacío — así `DocumentoImprimible` puede usarse igual sin
 * membrete.
 *
 * Igual que el precargado de la Fase 4: es una comodidad informativa, no un
 * requisito — si la consulta falla (red, RLS), el documento se sigue viendo
 * e imprimiendo igual, solo sin encabezado.
 */
export function useMembreteImpreso(
  tipo: TipoDoc | undefined,
  empresaGrupo: string,
): { cargando: boolean; formato: FormatoDocumentoConfig | null; logoUrl: string | null } {
  const [formato, setFormato] = React.useState<FormatoDocumentoConfig | null>(null);
  const [logoUrl, setLogoUrl] = React.useState<string | null>(null);
  const [cargando, setCargando] = React.useState(Boolean(tipo));

  React.useEffect(() => {
    if (!tipo) {
      setFormato(null);
      setLogoUrl(null);
      setCargando(false);
      return;
    }
    let cancelado = false;
    setCargando(true);
    (async () => {
      try {
        const [global, porEmpresa] = await Promise.all([
          traerConfiguracionFormatos(),
          traerConfiguracionFormatosEmpresas(),
        ]);
        if (cancelado) return;
        setFormato(resolverFormatoDocumento(tipo, empresaGrupo, global, porEmpresa));
        const logoIdEmpresa = porEmpresa.find((e) => e.empresaGrupo === empresaGrupo)?.logoId;
        const logoIdEfectivo = logoIdEmpresa || global.logoId;
        if (logoIdEfectivo) {
          const archivo = await traerArchivo(logoIdEfectivo);
          if (!cancelado) setLogoUrl(archivo?.dataUrl ?? null);
        } else if (!cancelado) {
          setLogoUrl(null);
        }
      } catch {
        if (!cancelado) {
          setFormato(null);
          setLogoUrl(null);
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [tipo, empresaGrupo]);

  return { cargando, formato, logoUrl };
}
