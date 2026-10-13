import * as React from "react";
import {
  CuerpoCAF,
  CuerpoConvenio,
  CuerpoConvenioHCP,
  CuerpoEvento,
  CuerpoFMV,
  CuerpoNotificacionPago,
} from "@/components/print/DocumentoImprimible";
import { parsearSnapshotFormato } from "@/lib/snapshotFormato";
import { traerCamposPersonalizados, type CampoPersonalizadoDefinicion } from "@/lib/camposPersonalizados";
import { traerEtiquetasCampo, type EtiquetaCampo } from "@/lib/etiquetasCampo";
import { traerConfiguracionFmv, type ConfiguracionFmv } from "@/lib/fmvConfig";
import type { DocSistema } from "@/lib/expedienteHtml";

/**
 * Entrega 21: dibuja (fuera de pantalla) el cuerpo imprimible de cada documento
 * del evento —el mismo que se ve en "Ver / Imprimir / Exportar a PDF"— y
 * devuelve su HTML ya resuelto (firmas, nombres de aprobadores, sesiones
 * vinculadas...). Se monta DENTRO del árbol de React de la página (no en una
 * raíz aparte) para heredar los proveedores de sesión/compañía que esos
 * cuerpos usan, y se espera a que el DOM deje de cambiar (varias piezas cargan
 * sus datos de forma asíncrona) antes de leerlo.
 */

const CONFIGURACION_VACIA: ConfiguracionFmv = { umbralTier1: 15, umbralTier2: 9, criterios: [] };
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function RenderizadorDocumentos({
  docs,
  empresaGrupo,
  pais,
  onListo,
}: {
  docs: DocSistema[];
  empresaGrupo: string;
  pais: string;
  /** Se llama una sola vez, con `clave → HTML`. */
  onListo: (html: Map<string, string>) => void;
}) {
  const [campos, setCampos] = React.useState<CampoPersonalizadoDefinicion[] | null>(null);
  const [etiquetas, setEtiquetas] = React.useState<EtiquetaCampo[] | null>(null);
  const [configuracion, setConfiguracion] = React.useState<ConfiguracionFmv | null>(null);
  const hostRef = React.useRef<HTMLDivElement>(null);
  const onListoRef = React.useRef(onListo);
  onListoRef.current = onListo;

  React.useEffect(() => {
    let activo = true;
    traerCamposPersonalizados().then((c) => activo && setCampos(c)).catch(() => activo && setCampos([]));
    traerEtiquetasCampo().then((e) => activo && setEtiquetas(e)).catch(() => activo && setEtiquetas([]));
    traerConfiguracionFmv().then((c) => activo && setConfiguracion(c)).catch(() => activo && setConfiguracion(CONFIGURACION_VACIA));
    return () => {
      activo = false;
    };
  }, []);

  const listo = campos !== null && etiquetas !== null && configuracion !== null;

  React.useEffect(() => {
    if (!listo) return;
    let cancelado = false;
    (async () => {
      const host = hostRef.current;
      if (!host) return;
      // Espera a que el DOM se estabilice: 4 lecturas iguales seguidas (~1,2 s), con un tope de 25 s.
      let ultima = "";
      let iguales = 0;
      const inicio = Date.now();
      while (!cancelado && Date.now() - inicio < 25_000) {
        await esperar(300);
        const huella = `${host.innerHTML.length}:${host.querySelectorAll("img").length}`;
        if (huella === ultima) iguales += 1;
        else {
          iguales = 0;
          ultima = huella;
        }
        if (iguales >= 4 && Date.now() - inicio > 1500) break;
      }
      if (cancelado) return;
      const mapa = new Map<string, string>();
      host.querySelectorAll<HTMLElement>("[data-clave-doc]").forEach((el) => mapa.set(el.getAttribute("data-clave-doc") ?? "", el.innerHTML));
      onListoRef.current(mapa);
    })();
    return () => {
      cancelado = true;
    };
  }, [listo]);

  if (!listo) return null;

  return (
    <div ref={hostRef} aria-hidden="true" className="no-imprimir" style={{ position: "fixed", left: -100000, top: 0, width: 900, pointerEvents: "none" }}>
      {docs.map(({ clave, doc }) => {
        const snapshot = parsearSnapshotFormato((doc as { snapshotFormato?: unknown }).snapshotFormato);
        const etq = snapshot?.etiquetas ?? etiquetas!;
        const cps = snapshot?.camposPersonalizados ?? campos!;
        const empresa = ("empresaGrupo" in doc && doc.empresaGrupo) || ("companiaNombre" in doc && doc.companiaNombre) || empresaGrupo;
        return (
          <div key={clave} data-clave-doc={clave} className="bg-white text-sm text-black">
            {doc.tipoDoc === "evento" && <CuerpoEvento evento={doc} empresaGrupo={empresaGrupo} pais={pais} camposPersonalizadosDefinidos={cps} />}
            {doc.tipoDoc === "fmv" && <CuerpoFMV fmv={doc} configuracion={configuracion!} etiquetasCampo={etq} empresaGrupo={String(empresa || empresaGrupo)} pais={pais} camposPersonalizadosDefinidos={cps} />}
            {doc.tipoDoc === "convenio" && <CuerpoConvenio convenio={doc} empresaGrupo={empresaGrupo} pais={pais} camposPersonalizadosDefinidos={cps} />}
            {doc.tipoDoc === "caf" && <CuerpoCAF caf={doc} etiquetasCampo={etq} empresaGrupo={empresaGrupo} pais={pais} camposPersonalizadosDefinidos={cps} />}
            {doc.tipoDoc === "convenioHCP" && <CuerpoConvenioHCP convenio={doc} idioma="es" empresaGrupo={empresaGrupo} pais={pais} camposPersonalizadosDefinidos={cps} />}
            {doc.tipoDoc === "notificacionPago" && <CuerpoNotificacionPago notificacion={doc} etiquetasCampo={etq} empresaGrupo={empresaGrupo} pais={pais} camposPersonalizadosDefinidos={cps} />}
          </div>
        );
      })}
    </div>
  );
}
