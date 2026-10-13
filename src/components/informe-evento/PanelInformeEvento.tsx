import * as React from "react";
import { toast } from "sonner";
import { FileCode2, FileText, Loader2, Users, MapPin, UserRound } from "lucide-react";
import { IconoMuestraMedica } from "@/components/IconoMuestraMedica";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useExpediente } from "@/components/expediente/useExpediente";
import { useFotosSpeakers } from "@/components/expediente/piezas";
import { useMembreteImpreso } from "@/hooks/useMembrete";
import { useAuth } from "@/hooks/useAuth";
import { useCompania } from "@/hooks/useCompania";
import { traerArchivos, type ArchivoAdjunto } from "@/lib/archivosAdjuntos";
import { construirNombreSugerido } from "@/lib/nombreArchivo";
import { construirResumenEvento, ciudadesTexto, paisesTexto } from "@/lib/informeEvento";
import { construirExpedienteHtml, idsArchivosExpediente, listarDocumentosSistema, recolectarCssApp, todosLosDocsSistema } from "@/lib/expedienteHtml";
import { gruposSpeakers } from "@/lib/expediente";
import { EtiquetaTamano } from "@/components/ui/etiqueta-tamano";
import { bytesEnBase64, estimarBytesPdf, traerTamanosArchivos } from "@/lib/tamanoEstimado";
import { RenderizadorDocumentos } from "./RenderizadorDocumentos";
import { ResumenEventoImprimible } from "./ResumenEventoImprimible";
import type { Evento } from "@/types";

type Fase = "reposo" | "documentos" | "archivos" | "armando";

const TEXTO_FASE: Record<Fase, string> = {
  reposo: "",
  documentos: "Preparando los formularios del evento…",
  archivos: "Descargando fotos, firmas y soportes…",
  armando: "Armando el archivo HTML…",
};

/** Trae los archivos por tandas pequeñas (pesan: están en base64) y avisa el avance. */
async function traerArchivosPorTandas(ids: string[], alAvanzar: (hechos: number, total: number) => void): Promise<Map<string, ArchivoAdjunto>> {
  const resultado = new Map<string, ArchivoAdjunto>();
  const TANDA = 6;
  for (let i = 0; i < ids.length; i += TANDA) {
    const tanda = await traerArchivos(ids.slice(i, i + TANDA));
    tanda.forEach((a, id) => resultado.set(id, a));
    alAvanzar(Math.min(i + TANDA, ids.length), ids.length);
  }
  return resultado;
}

/**
 * Entrega 21: panel del evento elegido en "Informe por Evento". Reúne los datos
 * con el mismo cargador del Expediente (así las cifras coinciden) y ofrece:
 *   1. Descargar el expediente completo como un archivo .html.
 *   2. El resumen del evento con vista previa / imprimir / PDF.
 */
export function PanelInformeEvento({ evento }: { evento: Evento }) {
  const { usuario } = useAuth();
  const { companiaActual } = useCompania();
  const { datos, cargando, alcancesAsistencia } = useExpediente(evento, true);
  const grupos = React.useMemo(() => gruposSpeakers(evento), [evento]);
  const fotosSpeakers = useFotosSpeakers(grupos.map((g) => g.speakerId).filter((x): x is string => !!x));
  const { logoUrl } = useMembreteImpreso("evento", evento.empresaGrupo);

  const [verResumen, setVerResumen] = React.useState(false);
  const [fase, setFase] = React.useState<Fase>("reposo");
  const [progreso, setProgreso] = React.useState<string>("");

  const resumen = React.useMemo(() => construirResumenEvento(evento, datos, alcancesAsistencia), [evento, datos, alcancesAsistencia]);
  const documentos = React.useMemo(() => listarDocumentosSistema(evento, datos), [evento, datos]);
  const docsSistema = React.useMemo(() => todosLosDocsSistema(documentos), [documentos]);

  // Entrega 31: tamaño estimado del expediente HTML = estilos y formularios + archivos adjuntos en base64 (+33 %).
  const idsExpediente = React.useMemo(() => idsArchivosExpediente(evento, datos, alcancesAsistencia), [evento, datos, alcancesAsistencia]);
  const claveIds = idsExpediente.join(",");
  const [bytesArchivos, setBytesArchivos] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (cargando) return;
    let activo = true;
    setBytesArchivos(null);
    traerTamanosArchivos(idsExpediente)
      .then((m) => activo && setBytesArchivos(Array.from(m.values()).reduce((a, b) => a + b, 0)))
      .catch(() => activo && setBytesArchivos(0));
    return () => {
      activo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveIds, cargando]);
  const bytesFotosSpeakers = Array.from(fotosSpeakers.values()).reduce((a, u) => a + (u.startsWith("data:") ? u.length : 0), 0);
  const bytesExpedienteEstimado =
    bytesArchivos == null
      ? null
      : 60 * 1024 + // estilos de la app + estilos y script propios del archivo
        docsSistema.length * 30 * 1024 + // cada formulario generado
        bytesEnBase64(bytesArchivos) +
        bytesFotosSpeakers;

  const empresaGrupo = companiaActual ?? usuario?.empresasGrupo[0] ?? evento.empresaGrupo ?? "";
  const pais = usuario?.paisesOperacion[0] ?? "";

  // Los datos del expediente que aparecen con el panel abierto pueden cambiar; la generación toma una foto al pulsar el botón.
  const datosRef = React.useRef({ datos, alcancesAsistencia, resumen, documentos });
  datosRef.current = { datos, alcancesAsistencia, resumen, documentos };

  function iniciarDescarga() {
    setFase("documentos");
    setProgreso("");
  }

  async function alTenerDocumentos(htmlDocumentos: Map<string, string>) {
    try {
      setFase("archivos");
      const { datos: d, alcancesAsistencia: al, resumen: r, documentos: docs } = datosRef.current;
      const ids = idsArchivosExpediente(evento, d, al);
      const archivos = await traerArchivosPorTandas(ids, (h, t) => setProgreso(`${h} de ${t} archivos`));
      setFase("armando");
      setProgreso("");
      // Deja respirar a la interfaz antes del trabajo pesado de armar el texto.
      await new Promise((res) => setTimeout(res, 50));
      const html = construirExpedienteHtml({
        evento,
        resumen: r,
        datos: d,
        alcances: al,
        documentos: docs,
        htmlDocumentos,
        archivos,
        fotosSpeakers,
        logoUrl,
        generadoPor: usuario?.nombre ?? "",
        cssApp: recolectarCssApp(),
      });
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = construirNombreSugerido({ tipo: "Expediente", nombre: evento.nombreEvento, fecha: new Date(), extension: "html" });
      document.body.appendChild(enlace);
      enlace.click();
      document.body.removeChild(enlace);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success(`Expediente descargado (${(blob.size / (1024 * 1024)).toFixed(1)} MB).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo generar el expediente.");
    } finally {
      setFase("reposo");
      setProgreso("");
    }
  }

  const generando = fase !== "reposo";
  const total = resumen.asistentes.total;
  const nFotos = datos.archivos.filter((a) => a.categoria === "fotos" && a.archivoId).length;
  const nSoportes = datos.archivos.filter((a) => a.categoria !== "fotos" && a.archivoId).length + datos.financieros.length;

  return (
    <div className="flex flex-col gap-4" data-testid="panel-informe-evento">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{evento.nombreEvento}</h2>
              {/* Entrega 22: debajo del título, además de ciudad, fecha de inicio y empresa del grupo, la fecha de finalización y el país. */}
              <p className="text-sm text-muted-foreground" data-testid="informe-evento-subtitulo">
                {[
                  ciudadesTexto(resumen),
                  paisesTexto(resumen),
                  resumen.fechas.inicio !== "—" ? `Inicio: ${resumen.fechas.inicio}` : "",
                  resumen.fechas.fin !== "—" ? `Finalización: ${resumen.fechas.fin}` : "",
                  evento.empresaGrupo,
                ].filter((x) => x && x !== "—").join(" · ")}
              </p>
            </div>
            <Badge variant={evento.estado === "Completado" ? "completed" : "approved"}>{evento.estado}</Badge>
          </div>

          {cargando ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Reuniendo la información del evento…</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="informe-evento-kpis">
              <Dato icono={<MapPin className="size-4" />} valor={resumen.sedes.length} etiqueta={resumen.multisesion ? "Sesiones" : "Sesión única"} />
              <Dato icono={<UserRound className="size-4" />} valor={resumen.speakers.length} etiqueta="Speakers vinculados" />
              <Dato icono={<Users className="size-4" />} valor={total.total} etiqueta="Asistentes impactados" />
              <Dato icono={<IconoMuestraMedica className="size-4" />} valor={resumen.muestras.entrega ? resumen.muestras.totalUnidades : "—"} etiqueta="Muestras entregadas (unid.)" />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="flex h-full flex-col gap-3 pt-6">
            <div className="flex items-center gap-2 font-semibold"><FileCode2 className="size-5 text-primary" /> Expediente completo (HTML)</div>
            <p className="text-sm text-muted-foreground">
              Un solo archivo .html, con la identidad visual de BEATS, que reúne: los formularios generados (solicitud, FMV, convenio de pago, CAF, convenio HCP y notificaciones de pago), la categoría «Speakers» con los soportes del Expediente de cada uno (foto, orden de compra, facturas y comprobantes), la sección financiera con todos los costos del evento, la lista de asistencia con firmas, las muestras entregadas y las fotos.
            </p>
            <ul className="text-xs text-muted-foreground">
              <li>{docsSistema.length} formulario(s) · {grupos.length} speaker(s) · {nSoportes} soporte(s) · {nFotos} foto(s)</li>
            </ul>
            <EtiquetaTamano bytes={bytesExpedienteEstimado} cargando={cargando} testId="expediente-tamano-estimado" />
            <Button className="mt-auto w-fit" onClick={iniciarDescarga} disabled={cargando || generando} data-testid="descargar-expediente-html">
              {generando ? <Loader2 className="animate-spin" /> : <FileCode2 />}
              {generando ? `${TEXTO_FASE[fase]} ${progreso}` : "Descargar expediente (HTML)"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex h-full flex-col gap-3 pt-6">
            <div className="flex items-center gap-2 font-semibold"><FileText className="size-5 text-primary" /> Resumen del evento</div>
            <p className="text-sm text-muted-foreground">
              Hoja de resumen con la identificación del evento, lugares, ciudades y países, fechas y sesiones, speakers vinculados, la sección financiera con el detalle de costos, número y tipo de asistentes impactados y las muestras entregadas por producto. Con vista previa, impresión y exportación a PDF.
            </p>
            <EtiquetaTamano bytes={cargando ? null : estimarBytesPdf({ filas: resumen.speakers.length + resumen.sedes.length + 10, paginas: 2 })} className="mt-auto" testId="resumen-tamano-pdf" />
            <Button variant="outline" className="w-fit" onClick={() => setVerResumen(true)} disabled={cargando} data-testid="ver-resumen-evento">
              <FileText /> Vista previa / Imprimir / PDF
            </Button>
          </CardContent>
        </Card>
      </div>

      {fase === "documentos" && (
        <RenderizadorDocumentos docs={docsSistema} empresaGrupo={empresaGrupo} pais={pais} onListo={alTenerDocumentos} />
      )}

      <ResumenEventoImprimible abierto={verResumen} onCerrar={() => setVerResumen(false)} evento={evento} resumen={resumen} />
    </div>
  );
}

function Dato({ icono, valor, etiqueta }: { icono: React.ReactNode; valor: React.ReactNode; etiqueta: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border bg-accent/30 p-3">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">{icono}{etiqueta}</span>
      <span className="text-2xl font-semibold">{valor}</span>
    </div>
  );
}
