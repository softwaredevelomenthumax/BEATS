import * as React from "react";
import { createPortal } from "react-dom";
import {
  CuerpoCAF,
  CuerpoConvenio,
  CuerpoConvenioHCP,
  CuerpoEvento,
  CuerpoFMV,
  CuerpoNotificacionPago,
  MARCA_AGUA_POR_ESTADO,
  MembreteImpreso,
  PiePaginaOficial,
  TituloSimpleSinMembrete,
} from "@/components/print/DocumentoImprimible";
import { useMembreteImpreso } from "@/hooks/useMembrete";
import { useUsuariosPorId } from "@/hooks/useUsuariosPorId";
import { useCompania } from "@/hooks/useCompania";
import { useAuth } from "@/hooks/useAuth";
import { parsearSnapshotFormato } from "@/lib/snapshotFormato";
import { traerCamposPersonalizados, type CampoPersonalizadoDefinicion } from "@/lib/camposPersonalizados";
import { traerEtiquetasCampo, type EtiquetaCampo } from "@/lib/etiquetasCampo";
import { traerConfiguracionFmv, type ConfiguracionFmv } from "@/lib/fmvConfig";
import { construirNombreBase } from "@/lib/nombreArchivo";
import { ALTO_PAGINA_PX, ANCHO_PAGINA_PX, hojaAPdf } from "@/lib/pdfDocumento";
import type { DocumentoAny } from "@/lib/documentoGenerico";

/**
 * Entrega 28 — genera, en el navegador, el PDF de uno o varios documentos de BEATS (los 6 tipos).
 *
 * Cada documento se dibuja FUERA DE PANTALLA con exactamente los mismos componentes `Cuerpo*` que la vista «Ver / Imprimir /
 * Exportar a PDF» (así el PDF es idéntico a lo que el usuario ve), dentro del árbol de React (para heredar sesión,
 * compañía y demás proveedores), y `lib/pdfDocumento.ts` lo parte en hojas Carta.
 *
 * Uso:
 *   const { generar, anfitrion } = useGeneradorPdf();
 *   ...render: {anfitrion}
 *   const archivos = await generar([{ clave: "a", doc, conMarcaDeAgua: false }]);   // Map<clave, File>
 */

export interface SolicitudPdf {
  /** Identificador propio de quien llama; el resultado se entrega indexado por él. */
  clave: string;
  doc: DocumentoAny;
  /** Marca de agua diagonal por estado (BORRADOR/APROBADO…). Para el PDF que firma una contraparte externa va apagada. */
  conMarcaDeAgua?: boolean;
  /** Encabezado oficial (membrete) repetido en cada hoja. Encendido por defecto, igual que la vista previa. */
  conMembrete?: boolean;
}

const CONFIGURACION_VACIA: ConfiguracionFmv = { umbralTier1: 15, umbralTier2: 9, criterios: [] };
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

function nombreDelDocumento(doc: DocumentoAny): string {
  switch (doc.tipoDoc) {
    case "evento":
      return doc.nombreEvento;
    case "convenio":
      return doc.hcpNombreCompleto;
    case "fmv":
      return doc.nombreCompleto;
    case "caf":
      return doc.contraparteNombre;
    case "notificacionPago":
      return doc.nombreProfesionalSalud;
    case "convenioHCP":
      return doc.consultorNombre;
  }
}

export function nombreArchivoPdf(doc: DocumentoAny): string {
  return `${construirNombreBase({ tipo: doc.tipoDoc, nombre: nombreDelDocumento(doc), fecha: new Date(), idConsecutivo: doc.id })}.pdf`;
}

function empresaDelDocumento(doc: DocumentoAny, respaldo: string): string {
  const candidata = "empresaGrupo" in doc && doc.empresaGrupo ? doc.empresaGrupo : "companiaNombre" in doc && doc.companiaNombre ? doc.companiaNombre : "";
  return String(candidata || respaldo);
}

/** Una hoja lista para fotografiar: membrete (opcional) + cuerpo. */
function HojaPdf({
  solicitud,
  empresaGrupo,
  pais,
  campos,
  etiquetas,
  configuracion,
}: {
  solicitud: SolicitudPdf;
  empresaGrupo: string;
  pais: string;
  campos: CampoPersonalizadoDefinicion[];
  etiquetas: EtiquetaCampo[];
  configuracion: ConfiguracionFmv;
}) {
  const { doc } = solicitud;
  const tipo = doc.tipoDoc;
  const empresa = empresaDelDocumento(doc, empresaGrupo);
  const { formato, logoUrl } = useMembreteImpreso(tipo, empresa);
  const creador = useUsuariosPorId([doc.creadoPorId]).get(doc.creadoPorId);
  const conMembrete = solicitud.conMembrete !== false;
  const snapshot = parsearSnapshotFormato((doc as { snapshotFormato?: unknown }).snapshotFormato);
  const etq = snapshot?.etiquetas ?? etiquetas;
  const cps = snapshot?.camposPersonalizados ?? campos;

  return (
    <div data-pdf-hoja={solicitud.clave} className="bg-white text-sm text-black" style={{ width: ANCHO_PAGINA_PX }}>
      {conMembrete && (
        <div data-pdf-membrete className="bg-white">
          <MembreteImpreso tipo={tipo} formato={formato} logoUrl={logoUrl} />
        </div>
      )}
      <div data-pdf-cuerpo className="bg-white align-top">
        {!conMembrete && <TituloSimpleSinMembrete tipo={tipo} />}
        {doc.tipoDoc === "evento" && <CuerpoEvento evento={doc} empresaGrupo={empresaGrupo} pais={pais} camposPersonalizadosDefinidos={cps} />}
        {doc.tipoDoc === "fmv" && <CuerpoFMV fmv={doc} configuracion={configuracion} etiquetasCampo={etq} empresaGrupo={empresaGrupo} pais={pais} camposPersonalizadosDefinidos={cps} />}
        {doc.tipoDoc === "convenio" && <CuerpoConvenio convenio={doc} empresaGrupo={empresaGrupo} pais={pais} camposPersonalizadosDefinidos={cps} />}
        {doc.tipoDoc === "caf" && <CuerpoCAF caf={doc} etiquetasCampo={etq} empresaGrupo={empresaGrupo} pais={pais} camposPersonalizadosDefinidos={cps} />}
        {doc.tipoDoc === "convenioHCP" && <CuerpoConvenioHCP convenio={doc} idioma="es" empresaGrupo={empresaGrupo} pais={pais} camposPersonalizadosDefinidos={cps} conPie />}
        {doc.tipoDoc === "notificacionPago" && <CuerpoNotificacionPago notificacion={doc} etiquetasCampo={etq} empresaGrupo={empresaGrupo} pais={pais} camposPersonalizadosDefinidos={cps} />}
        {doc.tipoDoc !== "convenioHCP" && <PiePaginaOficial documentoId={doc.id} creador={creador} />}
      </div>
    </div>
  );
}

interface Trabajo {
  solicitudes: SolicitudPdf[];
  resolver: (archivos: Map<string, File>) => void;
  rechazar: (error: Error) => void;
}

/** Espera a que el DOM deje de cambiar y no queden imágenes pendientes (varias piezas cargan sus datos de forma asíncrona). */
async function esperarEstabilidad(host: HTMLElement, vigente: () => boolean): Promise<void> {
  let ultima = "";
  let iguales = 0;
  const inicio = Date.now();
  while (vigente() && Date.now() - inicio < 30_000) {
    await esperar(200);
    const imagenesPendientes = Array.from(host.querySelectorAll("img")).filter((i) => !(i.complete && i.naturalWidth > 0)).length;
    const huella = `${host.innerHTML.length}:${host.querySelectorAll("img").length}:${imagenesPendientes}`;
    if (huella === ultima && imagenesPendientes === 0) iguales += 1;
    else {
      iguales = 0;
      ultima = huella;
    }
    if (iguales >= 4 && Date.now() - inicio > 800) return;
  }
}

function AnfitrionPdf({ trabajo, alTerminar }: { trabajo: Trabajo; alTerminar: () => void }) {
  const { companiaActual } = useCompania();
  const { usuario } = useAuth();
  const empresaGrupo = companiaActual ?? usuario?.empresasGrupo[0] ?? "";
  const pais = usuario?.paisesOperacion[0] ?? "";
  const [campos, setCampos] = React.useState<CampoPersonalizadoDefinicion[] | null>(null);
  const [etiquetas, setEtiquetas] = React.useState<EtiquetaCampo[] | null>(null);
  const [configuracion, setConfiguracion] = React.useState<ConfiguracionFmv | null>(null);
  const hostRef = React.useRef<HTMLDivElement>(null);

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
    let vigente = true;
    (async () => {
      try {
        const host = hostRef.current;
        if (!host) throw new Error("No se pudo preparar la generación del PDF.");
        await esperarEstabilidad(host, () => vigente);
        if (!vigente) return;
        const archivos = new Map<string, File>();
        for (const solicitud of trabajo.solicitudes) {
          const hoja = host.querySelector<HTMLElement>(`[data-pdf-hoja="${CSS.escape(solicitud.clave)}"]`);
          if (!hoja) throw new Error("No se encontró la hoja del documento para exportarla.");
          const estado = solicitud.doc.estado;
          const marca = solicitud.conMarcaDeAgua && estado ? MARCA_AGUA_POR_ESTADO[estado] : null;
          const blob = await hojaAPdf(hoja, {
            titulo: nombreArchivoPdf(solicitud.doc).replace(/\.pdf$/, ""),
            marcaDeAgua: marca ? { texto: marca.texto, color: marca.color, tamano: marca.fontSize } : null,
          });
          archivos.set(solicitud.clave, new File([blob], nombreArchivoPdf(solicitud.doc), { type: "application/pdf" }));
        }
        if (vigente) trabajo.resolver(archivos);
      } catch (error) {
        if (vigente) trabajo.rechazar(error instanceof Error ? error : new Error("No se pudo generar el PDF."));
      } finally {
        if (vigente) alTerminar();
      }
    })();
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo]);

  if (!listo) return null;

  // `visibility: hidden` conserva la maqueta (se puede medir) pero el usuario no ve nada; `lib/pdfDocumento.ts` lo vuelve
  // visible solo en la copia que fotografía. `z-index: -1` y `pointer-events: none` por si algún navegador lo pintara.
  return (
    <div
      ref={hostRef}
      data-pdf-anfitrion
      aria-hidden="true"
      className="no-imprimir"
      style={{ position: "fixed", left: 0, top: 0, width: ANCHO_PAGINA_PX, minHeight: ALTO_PAGINA_PX, visibility: "hidden", pointerEvents: "none", zIndex: -1, background: "#fff" }}
    >
      {trabajo.solicitudes.map((s) => (
        <HojaPdf key={s.clave} solicitud={s} empresaGrupo={empresaGrupo} pais={pais} campos={campos!} etiquetas={etiquetas!} configuracion={configuracion!} />
      ))}
    </div>
  );
}

export function useGeneradorPdf(): {
  generar: (solicitudes: SolicitudPdf[]) => Promise<Map<string, File>>;
  generando: boolean;
  anfitrion: React.ReactNode;
} {
  const [trabajo, setTrabajo] = React.useState<Trabajo | null>(null);
  // Cola: si se piden dos tandas a la vez, se hacen una tras otra (una sola hoja fuera de pantalla a la vez).
  const colaRef = React.useRef<Promise<unknown>>(Promise.resolve());

  const generar = React.useCallback((solicitudes: SolicitudPdf[]) => {
    const tanda = colaRef.current.catch(() => undefined).then(
      () =>
        new Promise<Map<string, File>>((resolver, rechazar) => {
          if (solicitudes.length === 0) {
            resolver(new Map());
            return;
          }
          setTrabajo({ solicitudes, resolver, rechazar });
        }),
    );
    colaRef.current = tanda;
    return tanda;
  }, []);

  const anfitrion = trabajo
    ? createPortal(<AnfitrionPdf key={trabajo.solicitudes.map((s) => s.clave).join("|")} trabajo={trabajo} alTerminar={() => setTrabajo(null)} />, document.body)
    : null;

  return { generar, generando: trabajo !== null, anfitrion };
}
