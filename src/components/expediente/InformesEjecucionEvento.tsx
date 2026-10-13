import * as React from "react";
import { mascaraVirtual } from "@/lib/ubicacionVisible";
import { toast } from "sonner";
import { FileDown, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DocumentoImprimible } from "@/components/print/DocumentoImprimible";
import { BloqueExpediente } from "./piezas";
import { traerArchivos } from "@/lib/archivosAdjuntos";
import { formatearFecha } from "@/lib/fecha";
import { construirCSV, descargarCSV } from "@/lib/csv";
import { construirNombreBase } from "@/lib/nombreArchivo";
import { EtiquetaTamano } from "@/components/ui/etiqueta-tamano";
import { bytesDeCsv, estimarBytesPdf } from "@/lib/tamanoEstimado";
import { construirCsvAsistencia, construirCsvMuestras, filasMuestrasPorEntrega, type AlcanceAsistencia } from "@/lib/expediente";
import type { Evento, RegistroParticipacion } from "@/types";
import type { DatosExpedienteCargados } from "./useExpediente";

/**
 * Octubre 2026 (puntos 12–14): informes del Expediente construidos con lo que
 * se capturó en Ejecución en Sitio.
 *   - Lista de asistencia en tabla (por sesión o global) + PDF.
 *   - Reporte de muestras médicas entregadas + PDF (solo si el evento las marcó).
 * El PDF usa el mismo mecanismo del resto de la app (vista imprimible +
 * "Guardar como PDF" del diálogo de impresión).
 */

const TODO_EL_EVENTO = "__todo__";

export const nombreCompleto = (r: Pick<RegistroParticipacion, "nombres" | "apellidos">) => `${r.nombres ?? ""} ${r.apellidos ?? ""}`.replace(/\s+/g, " ").trim();
const siNo = (v: boolean) => (v ? "Sí" : "No");

/** Carga las imágenes de firma (por tandas, pesan) y devuelve `archivoId → dataUrl`. */
function useFirmas(ids: (string | null | undefined)[]): { firmas: Map<string, string>; cargando: boolean } {
  const [firmas, setFirmas] = React.useState<Map<string, string>>(new Map());
  const [cargando, setCargando] = React.useState(false);
  const clave = Array.from(new Set(ids.filter((i): i is string => Boolean(i)))).sort().join(",");

  React.useEffect(() => {
    const lista = clave ? clave.split(",") : [];
    if (lista.length === 0) {
      setFirmas(new Map());
      return;
    }
    let activo = true;
    setCargando(true);
    (async () => {
      const resultado = new Map<string, string>();
      for (let i = 0; i < lista.length; i += 15) {
        const tanda = await traerArchivos(lista.slice(i, i + 15));
        tanda.forEach((a, id) => resultado.set(id, a.dataUrl));
      }
      if (activo) setFirmas(resultado);
    })()
      .catch((e) => toast.error(e instanceof Error ? e.message : "No se pudieron cargar las firmas."))
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, [clave]);

  return { firmas, cargando };
}

function Firma({ dataUrl, compacta }: { dataUrl?: string; compacta?: boolean }) {
  return dataUrl ? <img src={dataUrl} alt="Firma" className={compacta ? "h-6 max-w-[80px] object-contain" : "h-10 max-w-[120px] object-contain"} /> : <span className="text-muted-foreground">—</span>;
}

const TH = "border border-gray-400 bg-gray-100 p-1.5 text-left text-xs font-semibold";
const TD = "border border-gray-300 p-1.5 align-middle text-xs";
// Hoja impresa / vista previa: letra y relleno reducidos para que quepan más filas por página.
const TH_P = "border border-gray-400 bg-gray-100 px-1 py-[2px] text-left text-[8px] font-semibold leading-tight";
const TD_P = "border border-gray-300 px-1 py-[1px] align-middle text-[8px] leading-tight";

function lugarEvento(evento: Evento, sesionId: string | null) {
  const s = sesionId ? evento.sesiones.find((x) => x.id === sesionId) : null;
  return {
    direccion: mascaraVirtual(s?.lugar || evento.direccion),
    ciudad: mascaraVirtual(s?.ciudad || evento.ciudad),
    departamento: mascaraVirtual(s?.estadoProvincia || evento.estadoProvincia),
    pais: mascaraVirtual(s?.pais || evento.pais),
  };
}

/** Campo del encabezado: etiqueta pequeña en mayúsculas sobre el valor, para ganar altura en la hoja. */
function CampoEncabezado({ etiqueta, valor, span }: { etiqueta: string; valor: string; span: string }) {
  return (
    <div className={`${span} min-w-0 border-b border-r border-gray-400 px-1.5 py-[3px] leading-tight last:border-r-0`}>
      <div className="text-[6.5px] font-semibold uppercase tracking-wide text-gray-500">{etiqueta}</div>
      <div className="break-words text-[9px] font-medium text-black">{valor || "—"}</div>
    </div>
  );
}

/**
 * Octubre 2026 (entrega 21): encabezado del evento en una cuadrícula de 12
 * columnas y 3 filas (antes: 7 renglones apilados). Libera ~60 % de la altura
 * que ocupaba y deja más filas de asistentes por hoja.
 *   fila 1: Evento (6) · Fecha de inicio (3) · Fecha de finalización (3)
 *   fila 2: Sesión(es) (12)
 *   fila 3: Dirección (4) · Ciudad (2) · Departamento / Estado (3) · País (3)  (entrega 22: el país acompaña siempre a la ciudad)
 */
function EncabezadoEvento({ evento, sesionId, sesionesTexto }: { evento: Evento; sesionId: string | null; sesionesTexto: string }) {
  const l = lugarEvento(evento, sesionId);
  const sesionFechas = sesionId ? evento.sesiones.find((s) => s.id === sesionId)?.fecha : null;
  const inicio = sesionFechas || evento.fechaInicioEvento;
  const fin = sesionFechas || evento.fechaFinEvento;
  return (
    <div className="mb-2 grid grid-cols-12 border-l border-t border-gray-400" data-testid="informe-encabezado-evento">
      <CampoEncabezado etiqueta="Evento" valor={evento.nombreEvento} span="col-span-6" />
      <CampoEncabezado etiqueta="Fecha de inicio" valor={inicio ? formatearFecha(inicio) : ""} span="col-span-3" />
      <CampoEncabezado etiqueta="Fecha de finalización" valor={fin ? formatearFecha(fin) : ""} span="col-span-3" />
      <CampoEncabezado etiqueta="Sesión(es)" valor={sesionesTexto} span="col-span-12" />
      <CampoEncabezado etiqueta="Dirección" valor={l.direccion} span="col-span-4" />
      <CampoEncabezado etiqueta="Ciudad" valor={l.ciudad} span="col-span-2" />
      <CampoEncabezado etiqueta="Departamento / Estado" valor={l.departamento} span="col-span-3" />
      <CampoEncabezado etiqueta="País" valor={l.pais} span="col-span-3" />
    </div>
  );
}

function textoSesiones(evento: Evento, sesionId: string | null): string {
  if (evento.sesiones.length === 0) return "Sesión única";
  if (sesionId) {
    const i = evento.sesiones.findIndex((s) => s.id === sesionId);
    const s = evento.sesiones[i];
    return s ? `Sesión ${i + 1}${s.fecha ? ` (${formatearFecha(s.fecha)})` : ""}` : "";
  }
  return evento.sesiones.map((s, i) => `Sesión ${i + 1}${s.fecha ? ` (${formatearFecha(s.fecha)})` : ""}`).join(", ");
}

function VistaImpresion({ abierto, onCerrar, titulo, evento, children }: { abierto: boolean; onCerrar: () => void; titulo: string; evento: Evento; children: React.ReactNode }) {
  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="left-0 top-0 h-screen w-screen max-w-none max-h-none translate-x-0 translate-y-0 overflow-y-auto rounded-none border-0 shadow-none" data-testid="vista-impresion-informe">
        <DialogTitle className="sr-only">{titulo}</DialogTitle>
        {/* Octubre 2026: hoja horizontal + interruptor "Incluir encabezado oficial (Sí/No)"; el título lo pinta DocumentoImprimible (en el membrete o, sin él, como título simple). */}
        <DocumentoImprimible
          nombreDocumento={`${titulo} ${evento.nombreEvento}`}
          onCerrar={onCerrar}
          orientacion="horizontal"
          informe={{ titulo, nombreEvento: evento.nombreEvento, empresaGrupo: evento.empresaGrupo }}
        >
          {children}
        </DocumentoImprimible>
      </DialogContent>
    </Dialog>
  );
}

/** Selector "Alcance del informe" (global / por sesión), el mismo para la lista de asistencia y la muestra médica. */
function SelectorAlcance({ id, valor, onCambio, alcances, clave }: { id: string; valor: string; onCambio: (v: string) => void; alcances: AlcanceAsistencia[]; clave: (a: AlcanceAsistencia) => string }) {
  if (alcances.length <= 1) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Alcance del informe</Label>
      <Select value={valor} onValueChange={onCambio}>
        <SelectTrigger id={id} className="w-72" data-testid={id}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={TODO_EL_EVENTO}>Todo el evento (global)</SelectItem>
          {alcances.map((a) => <SelectItem key={clave(a)} value={clave(a)}>{a.etiqueta}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

const claveAlcance = (a: AlcanceAsistencia) => a.sesionId ?? `__${a.etiqueta}`;

function nombreCsv(prefijo: string, evento: Evento, alcance: AlcanceAsistencia[] | null) {
  // Solo "Sesión N" (la etiqueta completa trae fecha y lugar: nombres de archivo kilométricos).
  const etiqueta = alcance && alcance.length === 1 ? alcance[0].etiqueta : "";
  const sufijo = /^Sesión \d+/.exec(etiqueta)?.[0] ?? etiqueta;
  return construirNombreBase({ tipo: prefijo, nombre: `${evento.nombreEvento} ${sufijo}`.trim(), fecha: new Date() });
}

// --- Lista de asistencia ----------------------------------------------------

export function InformeListaAsistencia({ evento, alcances }: { evento: Evento; alcances: AlcanceAsistencia[] }) {
  const [alcanceId, setAlcanceId] = React.useState<string>(TODO_EL_EVENTO);
  const [verPdf, setVerPdf] = React.useState(false);

  const seleccion = alcanceId === TODO_EL_EVENTO ? alcances : alcances.filter((a) => claveAlcance(a) === alcanceId);
  const registros = seleccion.flatMap((a) => a.registros);
  const sesionIdUnica = seleccion.length === 1 ? seleccion[0].sesionId : null;
  const { firmas, cargando } = useFirmas(registros.map((r) => r.firmaId));

  // Una sola declaración (la vigente al firmar), no una por persona.
  const declaraciones = Array.from(new Set(registros.map((r) => (r.declaracionTextoMostrado ?? "").trim()).filter(Boolean)));

  const bytesCsvAsistencia = React.useMemo(() => {
    const { encabezados, filas } = construirCsvAsistencia(evento, registros);
    return bytesDeCsv(encabezados, filas);
  }, [evento, registros]);
  const bytesPdfAsistencia = estimarBytesPdf({
    filas: registros.length,
    paginas: Math.max(1, Math.ceil(registros.length / 18)),
    imagenesBytes: Array.from(firmas.values()).reduce((a, d) => a + Math.round((d.length * 3) / 4), 0),
  });

  function exportarCsv() {
    const { encabezados, filas } = construirCsvAsistencia(evento, registros);
    descargarCSV(nombreCsv("Asistencia", evento, alcanceId === TODO_EL_EVENTO ? null : seleccion), construirCSV(encabezados, filas));
  }

  const tabla = (compacta: boolean) => {
    const th = compacta ? TH_P : TH;
    const td = compacta ? TD_P : TD;
    return (
      <table className="w-full border-collapse" data-testid="tabla-asistencia">
        <thead>
          <tr>
            <th className={th}>Nombres y Apellidos</th>
            <th className={th}>Número de documento</th>
            <th className={th}>Celular</th>
            <th className={th}>Correo electrónico</th>
            <th className={th}>Autoriza uso de imagen y voz</th>
            <th className={th}>Autoriza tratamiento de datos</th>
            <th className={th}>Firma</th>
          </tr>
        </thead>
        <tbody>
          {registros.map((r) => (
            <tr key={r.id} style={{ breakInside: "avoid" }}>
              <td className={td}>{nombreCompleto(r) || "—"}</td>
              <td className={td}>{r.cedula || "—"}</td>
              <td className={td}>{r.celular || "—"}</td>
              <td className={td}>{r.email || "—"}</td>
              <td className={td}>{siNo(r.autorizaImagenVoz)}</td>
              <td className={td}>{siNo(r.autorizaDatosPersonales)}</td>
              <td className={td}><Firma compacta={compacta} dataUrl={r.firmaId ? firmas.get(r.firmaId) : undefined} /></td>
            </tr>
          ))}
          {registros.length === 0 && (
            <tr><td className={td} colSpan={7}>No hay asistentes registrados desde Ejecución para este alcance.</td></tr>
          )}
        </tbody>
      </table>
    );
  };

  return (
    <BloqueExpediente
      titulo="Informe de lista de asistencia"
      estado={<span className="text-xs text-muted-foreground">{registros.length} asistente(s)</span>}
      testId="exp-informe-asistencia"
    >
      <div className="flex flex-wrap items-end gap-3">
        <SelectorAlcance id="informe-asistencia-alcance" valor={alcanceId} onCambio={setAlcanceId} alcances={alcances} clave={claveAlcance} />
        <div className="flex flex-col items-start gap-0.5">
          <Button variant="outline" onClick={() => setVerPdf(true)} disabled={cargando} data-testid="asistencia-generar-pdf">
            {cargando ? <Loader2 className="animate-spin" /> : <FileDown />} Generar PDF
          </Button>
          <EtiquetaTamano bytes={cargando ? null : bytesPdfAsistencia} testId="asistencia-tamano-pdf" />
        </div>
        <div className="flex flex-col items-start gap-0.5">
          <Button variant="outline" onClick={exportarCsv} disabled={registros.length === 0} data-testid="asistencia-exportar-csv">
            <FileSpreadsheet /> Exportar CSV
          </Button>
          <EtiquetaTamano bytes={bytesCsvAsistencia} testId="asistencia-tamano-csv" />
        </div>
      </div>
      <div className="overflow-x-auto">{tabla(false)}</div>

      <VistaImpresion abierto={verPdf} onCerrar={() => setVerPdf(false)} titulo="Lista de asistencia" evento={evento}>
        <EncabezadoEvento evento={evento} sesionId={sesionIdUnica} sesionesTexto={textoSesiones(evento, sesionIdUnica)} />
        {tabla(true)}
        {/* Octubre 2026: letra más pequeña para que quepan más filas de asistencia por hoja. */}
        <div className="mt-2 text-[7px] leading-[1.2]" data-testid="declaracion-asistencia">
          <p className="mb-0.5 font-semibold">Declaración de tratamiento de datos personales y uso de imagen y voz (vigente al momento de la firma)</p>
          {declaraciones.length === 0 ? (
            <p className="text-gray-500">Los registros no guardaron el texto de la declaración mostrada.</p>
          ) : (
            declaraciones.map((t, i) => <p key={i} className="mb-1 whitespace-pre-line text-justify">{t}</p>)
          )}
        </div>
      </VistaImpresion>
    </BloqueExpediente>
  );
}

// --- Muestra médica ---------------------------------------------------------

export function PestanaMuestraMedica({ evento, datos, alcances }: { evento: Evento; datos: DatosExpedienteCargados; alcances: AlcanceAsistencia[] }) {
  const [alcanceId, setAlcanceId] = React.useState<string>(TODO_EL_EVENTO);
  const [verPdf, setVerPdf] = React.useState(false);

  // Alcance: global o una sesión (la sesión es la del check-in del HCP que recibió la muestra).
  const seleccion = alcanceId === TODO_EL_EVENTO ? alcances : alcances.filter((a) => claveAlcance(a) === alcanceId);
  const idsPermitidos = alcanceId === TODO_EL_EVENTO ? null : new Set(seleccion.flatMap((a) => a.registros.map((r) => r.id)));
  const sesionIdUnica = seleccion.length === 1 ? seleccion[0].sesionId : null;

  // Una fila por cada ENTREGA de producto a un HCP (2 productos al mismo médico = 2 filas).
  const filas = filasMuestrasPorEntrega(datos.muestras, datos.registros, idsPermitidos);
  const { firmas, cargando } = useFirmas(filas.map((f) => f.firmaId));
  const nombreProducto = (id: string) => datos.nombresProductos[id] || "Producto";
  const totalUnidades = filas.reduce((a, f) => a + f.cantidad, 0);
  const personas = new Set(filas.map((f) => f.registro?.id ?? f.muestraId)).size;

  const bytesCsvMuestras = React.useMemo(() => {
    const { encabezados, filas: datosCsv } = construirCsvMuestras(evento, filas, nombreProducto);
    return bytesDeCsv(encabezados, datosCsv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evento, filas, datos.nombresProductos]);
  const bytesPdfMuestras = estimarBytesPdf({
    filas: filas.length,
    paginas: Math.max(1, Math.ceil(filas.length / 18)),
    imagenesBytes: Array.from(firmas.values()).reduce((a, d) => a + Math.round((d.length * 3) / 4), 0),
  });

  function exportarCsv() {
    const { encabezados, filas: datosCsv } = construirCsvMuestras(evento, filas, nombreProducto);
    descargarCSV(nombreCsv("Muestra_medica", evento, alcanceId === TODO_EL_EVENTO ? null : seleccion), construirCSV(encabezados, datosCsv));
  }

  const tabla = (compacta: boolean) => {
    const th = compacta ? TH_P : TH;
    const td = compacta ? TD_P : TD;
    return (
      <table className="w-full border-collapse" data-testid="tabla-muestras">
        <thead>
          <tr>
            <th className={th}>Nombres y Apellidos</th>
            <th className={th}>Número de documento</th>
            <th className={th}>Celular</th>
            <th className={th}>Correo electrónico</th>
            <th className={th}>Muestra recibida</th>
            <th className={th}>Cantidad</th>
            <th className={th}>Firma</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.muestraId} style={{ breakInside: "avoid" }} data-testid="fila-muestra">
              <td className={td}>{(f.registro && nombreCompleto(f.registro)) || "—"}</td>
              <td className={td}>{f.registro?.cedula || "—"}</td>
              <td className={td}>{f.registro?.celular || "—"}</td>
              <td className={td}>{f.registro?.email || "—"}</td>
              <td className={td}>{nombreProducto(f.productoId)}</td>
              <td className={td}>{f.cantidad}</td>
              <td className={td}><Firma compacta={compacta} dataUrl={f.firmaId ? firmas.get(f.firmaId) : undefined} /></td>
            </tr>
          ))}
          {filas.length === 0 && (
            <tr><td className={td} colSpan={7}>Todavía no hay muestras médicas entregadas registradas desde Ejecución para este alcance.</td></tr>
          )}
        </tbody>
      </table>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <BloqueExpediente
        titulo={`Muestra médica — ${evento.nombreEvento || "Evento"}`}
        estado={<span className="text-xs text-muted-foreground">{personas} persona(s) · {filas.length} entrega(s) · {totalUnidades} unidad(es)</span>}
        testId="exp-muestra-medica"
      >
        <div className="text-sm text-muted-foreground">
          {evento.detalleMuestrasMedicas ? `Muestras previstas: ${evento.detalleMuestrasMedicas}` : "Entregas de muestra médica registradas en la app de Ejecución en Sitio."}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <SelectorAlcance id="informe-muestra-alcance" valor={alcanceId} onCambio={setAlcanceId} alcances={alcances} clave={claveAlcance} />
          <div className="flex flex-col items-start gap-0.5">
            <Button variant="outline" onClick={() => setVerPdf(true)} disabled={cargando} data-testid="muestra-generar-pdf">
              {cargando ? <Loader2 className="animate-spin" /> : <FileDown />} Generar PDF
            </Button>
            <EtiquetaTamano bytes={cargando ? null : bytesPdfMuestras} testId="muestra-tamano-pdf" />
          </div>
          <div className="flex flex-col items-start gap-0.5">
            <Button variant="outline" onClick={exportarCsv} disabled={filas.length === 0} data-testid="muestra-exportar-csv">
              <FileSpreadsheet /> Exportar CSV
            </Button>
            <EtiquetaTamano bytes={bytesCsvMuestras} testId="muestra-tamano-csv" />
          </div>
        </div>
        <div className="overflow-x-auto">{tabla(false)}</div>
      </BloqueExpediente>

      <VistaImpresion abierto={verPdf} onCerrar={() => setVerPdf(false)} titulo="Reporte de muestras médicas entregadas" evento={evento}>
        <EncabezadoEvento evento={evento} sesionId={sesionIdUnica} sesionesTexto={textoSesiones(evento, sesionIdUnica)} />
        {tabla(true)}
      </VistaImpresion>
    </div>
  );
}
