import * as React from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputEmail } from "@/components/ui/input-email";
import { normalizarEmail } from "@/lib/normalizarTexto";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Paperclip, Loader2, Send, FileText, AlertCircle, ExternalLink } from "lucide-react";
import { subirArchivo, formatearTamano } from "@/lib/archivosAdjuntos";
import { useGeneradorPdf } from "@/components/print/GeneradorPdfDocumentos";
import { EtiquetaTamano } from "@/components/ui/etiqueta-tamano";
import { estimarBytesPdf, bytesEnBase64, etiquetaTamano } from "@/lib/tamanoEstimado";
import type { DocumentoAny } from "@/lib/documentoGenerico";
import { construirNombreBase } from "@/lib/nombreArchivo";
import { enviarDocumentoPorCorreo } from "@/lib/enviosDocumentos";
import { useAuth } from "@/hooks/useAuth";
import type { TipoDoc } from "@/lib/enums";

/**
 * Entrega 28 — un documento de BEATS que se envía como PDF generado por la aplicación (no un archivo ya cargado).
 *
 *  - «Enviar al HCP para firma»: el PDF del Convenio HCP se genera apenas se abre la ventana (`generarAlAbrir`) y queda
 *    ya marcado como adjunto.
 *  - «Enviar documentos al solicitante»: se muestra todo el paquete del evento/speaker y el usuario marca cuáles se envían;
 *    solo se generan los PDF marcados, al pulsar «Enviar» (generar todo de antemano sería lento e innecesario).
 */
export interface DocumentoPdfEnvio {
  clave: string;
  etiqueta: string;
  /** Texto corto bajo la etiqueta (p. ej. el estado del documento). */
  detalle?: string;
  doc: DocumentoAny;
  /** Marca de agua diagonal por estado. Apagada para lo que firma una contraparte externa. */
  conMarcaDeAgua?: boolean;
  generarAlAbrir?: boolean;
  marcadoInicial?: boolean;
  /** Entrega 33: encabezado bajo el que se agrupa (p. ej. «Evento», «Speaker · Dra. Pérez»). Sin grupo = lista plana. */
  grupo?: string;
}

/** Entrega 33 — archivo ya cargado en BEATS que se puede adjuntar tal cual (orden de compra, factura, copia firmada…). */
export interface ArchivoListaEnvio {
  id: string;
  nombre: string;
  /** Encabezado bajo el que se agrupa. */
  grupo?: string;
  /** Línea pequeña bajo el nombre (nombre del archivo, fecha, valor…). */
  detalle?: string;
  tamanoBytes?: number;
  /** `false` = aparece sin marcar (p. ej. lo que contiene datos personales). Por defecto se marca. */
  marcadoInicial?: boolean;
}

/** Entrega 33: agrupa conservando el orden de aparición. Los elementos sin grupo quedan en un grupo sin título. */
function agruparPorGrupo<T>(items: T[], grupoDe: (x: T) => string | undefined): { grupo: string; items: T[] }[] {
  const salida: { grupo: string; items: T[] }[] = [];
  for (const it of items) {
    const g = grupoDe(it) ?? "";
    const existente = salida.find((x) => x.grupo === g);
    if (existente) existente.items.push(it);
    else salida.push({ grupo: g, items: [it] });
  }
  return salida;
}

/** Límite práctico de adjuntos de un correo (el servidor de correo suele rechazar más de ~25 MB una vez codificado). */
const LIMITE_ADJUNTOS_BYTES = 20 * 1024 * 1024;

type EstadoPdf = { estado: "pendiente" | "generando" | "listo" | "error"; archivo?: File; error?: string };

/**
 * AJUSTES (septiembre/octubre 2026), pedido explícito: ventana para, una vez
 * terminado el flujo de aprobación de un documento, "enviar a las partes
 * interesadas una copia de uno o varios de esos documentos" — al HCP/speaker
 * (adjuntando el archivo firmado, pidiendo que lo revise y firme) o al
 * usuario generador de la solicitud (adjuntando los documentos que el
 * remitente elija). "El usuario que vaya a enviar el correo debe poder
 * seleccionar de una lista, los documentos que va a enviar" — `archivosLista`
 * es esa lista (archivos ya ligados al documento, p. ej. la copia firmada);
 * además siempre se puede adjuntar un archivo nuevo en el momento (p. ej. el
 * PDF recién exportado vía "Imprimir / Exportar a PDF").
 *
 * Envía por correo llamando DIRECTO a la Edge Function `send-email` ya
 * desplegada (`lib/enviosDocumentos.ts` → `supabase.functions.invoke`,
 * usando la sesión del usuario) — esa función ya sabe decodificar y
 * adjuntar archivos reales (confirmado con su código fuente real, que el
 * usuario compartió). Esa misma función restringe esta acción, en el
 * servidor, a `rol === "medica"` ("Solo Dirección Médica puede enviar
 * correos con adjuntos desde la app") — por eso esta ventana no deja
 * enviar (y explica por qué) si quien la abre no tiene ese rol, en vez de
 * dejar que el usuario llene todo el formulario y reciba un 403 al final.
 */
export function EnviarDocumentoDialog({
  open,
  onOpenChange,
  titulo,
  tipoDoc,
  documentoId,
  destinatarioEmailInicial,
  destinatarioNombreInicial,
  asuntoInicial,
  mensajeInicial,
  archivosLista = [],
  documentosPdf = [],
  tituloDocumentosPdf = "Documentos de BEATS (se envían en PDF)",
  tituloArchivos,
  onEnviado,
}: {
  open: boolean;
  onOpenChange: (valor: boolean) => void;
  titulo: string;
  tipoDoc: TipoDoc;
  documentoId: string;
  destinatarioEmailInicial?: string;
  destinatarioNombreInicial?: string;
  asuntoInicial: string;
  mensajeInicial: string;
  /** Lista de archivos ya disponibles para marcar/desmarcar (checklist), p. ej. la copia firmada del HCP. */
  archivosLista?: ArchivoListaEnvio[];
  /** Entrega 28: documentos de BEATS que se convierten a PDF para adjuntarlos (ver `DocumentoPdfEnvio`). */
  documentosPdf?: DocumentoPdfEnvio[];
  tituloDocumentosPdf?: string;
  /** Entrega 33: título de la lista de archivos ya cargados (por defecto «Documentos a enviar» / «Otros archivos a enviar»). */
  tituloArchivos?: string;
  onEnviado?: () => void;
}) {
  const { usuario: usuarioSesion } = useAuth();
  const puedeEnviar = usuarioSesion?.rol === "medica";
  const [destinatarioEmail, setDestinatarioEmail] = React.useState(destinatarioEmailInicial ?? "");
  const [destinatarioNombre, setDestinatarioNombre] = React.useState(destinatarioNombreInicial ?? "");
  const [asunto, setAsunto] = React.useState(asuntoInicial);
  const [mensaje, setMensaje] = React.useState(mensajeInicial);
  const [seleccionados, setSeleccionados] = React.useState<Set<string>>(new Set(archivosLista.filter((a) => a.marcadoInicial !== false).map((a) => a.id)));
  const [adjuntosNuevos, setAdjuntosNuevos] = React.useState<{ id: string; nombre: string }[]>([]);
  const [arrastrando, setArrastrando] = React.useState(false);
  const [subiendo, setSubiendo] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);
  const inputArchivoRef = React.useRef<HTMLInputElement | null>(null);
  const { generar, anfitrion } = useGeneradorPdf();
  const [marcadosPdf, setMarcadosPdf] = React.useState<Set<string>>(new Set());
  const [pdfs, setPdfs] = React.useState<Record<string, EstadoPdf>>({});
  const [etapaEnvio, setEtapaEnvio] = React.useState<string | null>(null);
  /** Id (en `archivos_adjuntos`) de cada PDF ya subido, para no duplicarlo si el correo falla y se reintenta. */
  const idsPdfSubidos = React.useRef<Map<string, string>>(new Map());
  /** Cada apertura de la ventana tiene su propio número: las respuestas de una apertura anterior se descartan. */
  const aperturaRef = React.useRef(0);

  // Cada vez que se abre la ventana (p. ej. reabierta sobre otro documento), se
  // reinicia con los valores iniciales de esa apertura.
  React.useEffect(() => {
    if (!open) return;
    setDestinatarioEmail(destinatarioEmailInicial ?? "");
    setDestinatarioNombre(destinatarioNombreInicial ?? "");
    setAsunto(asuntoInicial);
    setMensaje(mensajeInicial);
    setSeleccionados(new Set(archivosLista.filter((a) => a.marcadoInicial !== false).map((a) => a.id)));
    setAdjuntosNuevos([]);
    setMarcadosPdf(new Set(documentosPdf.filter((d) => d.marcadoInicial).map((d) => d.clave)));
    setPdfs({});
    setEtapaEnvio(null);
    idsPdfSubidos.current = new Map();
    const apertura = ++aperturaRef.current;
    const automaticos = documentosPdf.filter((d) => d.generarAlAbrir);
    if (puedeEnviar && automaticos.length > 0) void generarPdfs(automaticos, apertura);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Genera los PDF pedidos y actualiza el estado de cada uno. Si la ventana se cerró o reabrió mientras tanto, descarta el resultado. */
  async function generarPdfs(items: DocumentoPdfEnvio[], apertura: number): Promise<boolean> {
    setPdfs((previo) => {
      const siguiente = { ...previo };
      for (const d of items) siguiente[d.clave] = { estado: "generando" };
      return siguiente;
    });
    try {
      const archivos = await generar(items.map((d) => ({ clave: d.clave, doc: d.doc, conMarcaDeAgua: d.conMarcaDeAgua })));
      if (apertura !== aperturaRef.current) return false;
      setPdfs((previo) => {
        const siguiente = { ...previo };
        for (const d of items) {
          const archivo = archivos.get(d.clave);
          siguiente[d.clave] = archivo ? { estado: "listo", archivo } : { estado: "error", error: "No se generó el PDF." };
        }
        return siguiente;
      });
      return true;
    } catch (error) {
      if (apertura !== aperturaRef.current) return false;
      const mensaje = error instanceof Error ? error.message : "No se pudo generar el PDF.";
      setPdfs((previo) => {
        const siguiente = { ...previo };
        for (const d of items) siguiente[d.clave] = { estado: "error", error: mensaje };
        return siguiente;
      });
      return false;
    }
  }

  function alternarPdf(clave: string) {
    setMarcadosPdf((anterior) => {
      const siguiente = new Set(anterior);
      if (siguiente.has(clave)) siguiente.delete(clave);
      else siguiente.add(clave);
      return siguiente;
    });
  }

  /** Marca o desmarca de una vez todos los elementos de un grupo (entrega 33). */
  function marcarGrupoPdf(claves: string[], marcar: boolean) {
    setMarcadosPdf((anterior) => {
      const siguiente = new Set(anterior);
      for (const c of claves) (marcar ? siguiente.add(c) : siguiente.delete(c));
      return siguiente;
    });
  }
  function marcarGrupoArchivos(ids: string[], marcar: boolean) {
    setSeleccionados((anterior) => {
      const siguiente = new Set(anterior);
      for (const id of ids) (marcar ? siguiente.add(id) : siguiente.delete(id));
      return siguiente;
    });
  }

  function verPdf(archivo: File) {
    const url = URL.createObjectURL(archivo);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  const generandoAlgunPdf = Object.values(pdfs).some((p) => p.estado === "generando");

  function alternar(id: string) {
    setSeleccionados((anterior) => {
      const siguiente = new Set(anterior);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }

  async function adjuntarArchivoNuevo(e: React.ChangeEvent<HTMLInputElement>) {
    const elegido = e.target.files?.[0];
    e.target.value = "";
    if (elegido) await adjuntarArchivo(elegido);
  }

  async function adjuntarArchivo(archivo: File) {
    if (subiendo) return;
    setSubiendo(true);
    try {
      const nombreSugerido = construirNombreBase({ tipo: tipoDoc, nombre: destinatarioNombre || titulo, fecha: new Date() });
      const subido = await subirArchivo(archivo, { nombreSugerido });
      setAdjuntosNuevos((anteriores) => [...anteriores, { id: subido.id, nombre: subido.nombre }]);
      setSeleccionados((anterior) => new Set(anterior).add(subido.id));
      toast.success(`${archivo.name} adjuntado.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo adjuntar el archivo.");
    } finally {
      setSubiendo(false);
    }
  }

  const archivosDisponibles: ArchivoListaEnvio[] = [...archivosLista, ...adjuntosNuevos];
  const gruposPdf = agruparPorGrupo(documentosPdf, (d) => d.grupo);
  const gruposArchivos = agruparPorGrupo(archivosDisponibles, (a) => a.grupo);
  const hayGrupos = gruposPdf.some((g) => g.grupo) || gruposArchivos.some((g) => g.grupo);
  // Resumen de lo marcado y peso estimado del correo (los PDF se estiman; los archivos usan su tamaño real).
  const cantidadMarcada = marcadosPdf.size + seleccionados.size;
  const bytesEstimados = bytesEnBase64(
    documentosPdf.filter((d) => marcadosPdf.has(d.clave)).reduce((a) => a + estimarBytesPdf({ paginas: 3, imagenesBytes: 60 * 1024 }), 0) +
      archivosDisponibles.filter((a) => seleccionados.has(a.id)).reduce((a, f) => a + (f.tamanoBytes ?? 0), 0),
  );
  const excedeLimite = bytesEstimados > LIMITE_ADJUNTOS_BYTES;

  async function enviar() {
    if (!puedeEnviar || !usuarioSesion) return;
    if (!destinatarioEmail.trim()) {
      toast.error("Indica el correo del destinatario.");
      return;
    }
    const pdfMarcados = documentosPdf.filter((d) => marcadosPdf.has(d.clave));
    if (seleccionados.size === 0 && pdfMarcados.length === 0) {
      toast.error("Selecciona o adjunta al menos un documento para enviar.");
      return;
    }
    setEnviando(true);
    try {
      // 1. PDF marcados que todavía no se han generado (los del paquete se generan aquí, no antes).
      const faltantes = pdfMarcados.filter((d) => pdfs[d.clave]?.estado !== "listo" && !idsPdfSubidos.current.has(d.clave));
      let generados: Record<string, EstadoPdf> = pdfs;
      if (faltantes.length > 0) {
        setEtapaEnvio(`Generando ${faltantes.length === 1 ? "el PDF" : `${faltantes.length} PDF`}…`);
        const apertura = aperturaRef.current;
        const archivos = await generar(faltantes.map((d) => ({ clave: d.clave, doc: d.doc, conMarcaDeAgua: d.conMarcaDeAgua })));
        if (apertura !== aperturaRef.current) return;
        generados = { ...pdfs };
        for (const d of faltantes) {
          const archivo = archivos.get(d.clave);
          generados[d.clave] = archivo ? { estado: "listo", archivo } : { estado: "error", error: "No se generó el PDF." };
        }
        setPdfs(generados);
      }
      // 2. Cada PDF se guarda como archivo (queda registrado exactamente lo que se envió) y se agrega a los adjuntos.
      const idsPdf: string[] = [];
      for (const d of pdfMarcados) {
        let id = idsPdfSubidos.current.get(d.clave);
        if (!id) {
          const archivo = generados[d.clave]?.archivo;
          if (!archivo) throw new Error(`No se pudo generar el PDF de «${d.etiqueta}».`);
          setEtapaEnvio("Guardando los PDF…");
          const subido = await subirArchivo(archivo, { nombreSugerido: archivo.name.replace(/\.pdf$/i, "") });
          id = subido.id;
          idsPdfSubidos.current.set(d.clave, id);
        }
        idsPdf.push(id);
      }
      setEtapaEnvio("Enviando el correo…");
      await enviarDocumentoPorCorreo({
        tipoDoc,
        documentoId,
        destinatarioEmail: normalizarEmail(destinatarioEmail),
        destinatarioNombre: destinatarioNombre.trim() || undefined,
        asunto: asunto.trim(),
        mensajeHtml: mensaje.trim().replace(/\n/g, "<br />"),
        archivosIds: [...Array.from(seleccionados), ...idsPdf],
        enviadoPorId: usuarioSesion.id,
      });
      toast.success(`Correo enviado a ${destinatarioEmail}.`);
      onOpenChange(false);
      onEnviado?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo enviar el correo.");
    } finally {
      setEnviando(false);
      setEtapaEnvio(null);
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* AJUSTES (septiembre/octubre 2026), pedido explícito: "Armoniza el
          ancho de todas las ventanas de los formularios" — se alinea a
          `max-w-2xl`, el mismo ancho usado ahora por los demás diálogos de
          formulario de la app (`UsuariosRoles.tsx`, `Speakers.tsx`).
          Entrega 36: esta ventana es la excepción — lista paquetes enteros de
          documentos (nombres de archivo, detalle, tamaño) y con `max-w-3xl`
          obligaba a desplazarse en horizontal; se amplía a `max-w-5xl` y la
          rejilla interna usa `minmax(0,1fr)` para que ningún texto largo
          ensanche el contenido más allá de la ventana. También
          "Valida que quede funcional [el bloqueo de cierre accidental] en
          todos los formularios" — ver el comentario completo en
          `UsuariosRoles.tsx`. */}
      <DialogContent
        className="w-[calc(100vw-2rem)] max-w-5xl grid-cols-[minmax(0,1fr)] overflow-x-hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>El documento queda igual; esto solo envía una copia por correo.</DialogDescription>
        </DialogHeader>
        {!puedeEnviar && (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            Solo Dirección Médica puede enviar correos con adjuntos desde la aplicación.
          </p>
        )}
        <div className={`flex flex-col gap-3 ${!puedeEnviar ? "pointer-events-none opacity-50" : ""}`}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="envio-destinatario-nombre">Nombre del destinatario</Label>
              <Input sinMayusculas id="envio-destinatario-nombre" value={destinatarioNombre} onChange={(e) => setDestinatarioNombre(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="envio-destinatario-email">Correo del destinatario *</Label>
              <InputEmail id="envio-destinatario-email" value={destinatarioEmail} onChange={(e) => setDestinatarioEmail(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="envio-asunto">Asunto</Label>
            <Input sinMayusculas id="envio-asunto" value={asunto} onChange={(e) => setAsunto(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="envio-mensaje">Mensaje</Label>
            <Textarea sinMayusculas id="envio-mensaje" rows={5} value={mensaje} onChange={(e) => setMensaje(e.target.value)} />
          </div>
          {documentosPdf.length > 0 && (
            <div className="flex flex-col gap-2" data-testid="envio-documentos-pdf">
              <Label>{tituloDocumentosPdf}</Label>
              <div className={documentosPdf.length > 6 ? "flex max-h-[34vh] flex-col gap-3 overflow-y-auto pr-1" : "flex flex-col gap-3"}>
              {gruposPdf.map(({ grupo, items }) => (
                <div key={grupo || "_"} className="flex flex-col gap-2" data-testid={grupo ? `envio-grupo-pdf-${grupo}` : undefined}>
                  {grupo && (
                    <EncabezadoGrupo
                      titulo={grupo}
                      marcados={items.filter((d) => marcadosPdf.has(d.clave)).length}
                      total={items.length}
                      onTodos={() => marcarGrupoPdf(items.map((d) => d.clave), true)}
                      onNinguno={() => marcarGrupoPdf(items.map((d) => d.clave), false)}
                    />
                  )}
                  {items.map((d) => {
                    const pdf = pdfs[d.clave];
                    return (
                      <div key={d.clave} className="flex items-start gap-2 rounded-md border px-3 py-2" data-testid={`envio-pdf-${d.clave}`}>
                        <Checkbox id={`envio-pdf-${d.clave}`} className="mt-0.5" checked={marcadosPdf.has(d.clave)} onCheckedChange={() => alternarPdf(d.clave)} />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <Label htmlFor={`envio-pdf-${d.clave}`} className="flex items-center gap-1.5 font-normal">
                            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{d.etiqueta}</span>
                            <span className="shrink-0 rounded border px-1 text-[10px] font-semibold uppercase text-muted-foreground">PDF</span>
                          </Label>
                          {d.detalle && <span className="pl-5 text-xs text-muted-foreground">{d.detalle}</span>}
                          {(!pdf || pdf.estado === "generando") && (
                            <EtiquetaTamano bytes={estimarBytesPdf({ paginas: 3, imagenesBytes: 60 * 1024 })} className="pl-5" testId={`envio-pdf-tamano-${d.clave}`} />
                          )}
                          {pdf?.estado === "generando" && (
                            <span className="flex items-center gap-1.5 pl-5 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" /> Generando el PDF…</span>
                          )}
                          {pdf?.estado === "listo" && pdf.archivo && (
                            <span className="flex items-center gap-2 pl-5 text-xs text-muted-foreground">
                              {pdf.archivo.name} · {formatearTamano(pdf.archivo.size)}
                              <button type="button" className="inline-flex items-center gap-1 font-medium text-primary hover:underline" onClick={() => verPdf(pdf.archivo!)}>
                                <ExternalLink className="size-3" /> Ver
                              </button>
                            </span>
                          )}
                          {pdf?.estado === "error" && (
                            <span className="flex items-center gap-2 pl-5 text-xs text-destructive">
                              <AlertCircle className="size-3" /> {pdf.error}
                              <button type="button" className="font-medium underline" onClick={() => void generarPdfs([d], aperturaRef.current)}>Reintentar</button>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2" data-testid="envio-archivos">
            <Label>{tituloArchivos ?? (documentosPdf.length > 0 ? "Otros archivos a enviar" : "Documentos a enviar")}</Label>
            {archivosDisponibles.length === 0 && documentosPdf.length === 0 && <p className="text-xs text-muted-foreground">Todavía no hay archivos adjuntos — adjunta uno abajo.</p>}
            <div className={archivosDisponibles.length > 6 ? "flex max-h-[34vh] flex-col gap-3 overflow-y-auto pr-1" : "flex flex-col gap-3"}>
            {gruposArchivos.map(({ grupo, items }) => (
              <div key={grupo || "_"} className="flex flex-col gap-1.5" data-testid={grupo ? `envio-grupo-archivos-${grupo}` : undefined}>
                {grupo && (
                  <EncabezadoGrupo
                    titulo={grupo}
                    marcados={items.filter((a) => seleccionados.has(a.id)).length}
                    total={items.length}
                    onTodos={() => marcarGrupoArchivos(items.map((a) => a.id), true)}
                    onNinguno={() => marcarGrupoArchivos(items.map((a) => a.id), false)}
                  />
                )}
                {items.map((a) => (
                  <div key={a.id} className={a.detalle || a.tamanoBytes != null ? "flex items-start gap-2 rounded-md border px-3 py-2" : "flex items-center gap-2"}>
                    <Checkbox id={`envio-archivo-${a.id}`} className={a.detalle || a.tamanoBytes != null ? "mt-0.5" : undefined} checked={seleccionados.has(a.id)} onCheckedChange={() => alternar(a.id)} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <Label htmlFor={`envio-archivo-${a.id}`} className="flex items-center gap-1.5 font-normal">
                        <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{a.nombre}</span>
                        {a.tamanoBytes != null && <span className="shrink-0 text-xs text-muted-foreground">· {formatearTamano(a.tamanoBytes)}</span>}
                      </Label>
                      {a.detalle && <span className="truncate pl-5 text-xs text-muted-foreground" title={a.detalle}>{a.detalle}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ))}
            </div>
            <input ref={inputArchivoRef} type="file" className="hidden" onChange={adjuntarArchivoNuevo} />
            <div
              role="button"
              tabIndex={0}
              data-testid="envio-dropzone"
              onClick={() => !subiendo && inputArchivoRef.current?.click()}
              onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !subiendo) { e.preventDefault(); inputArchivoRef.current?.click(); } }}
              onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastrando(false);
                const f = e.dataTransfer.files?.[0];
                if (f) void adjuntarArchivo(f);
              }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
                subiendo ? "cursor-not-allowed border-muted bg-muted/30 text-muted-foreground" : arrastrando ? "border-primary bg-accent/60" : "border-muted-foreground/30 bg-muted/20 hover:border-primary/50 hover:bg-accent/30"
              }`}
            >
              {subiendo ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : <Paperclip className="size-5 text-muted-foreground" />}
              <p className="text-sm font-medium">{subiendo ? "Adjuntando..." : "Arrastra el archivo aquí o haz clic para adjuntarlo"}</p>
            </div>
          </div>
        </div>
        {(documentosPdf.length > 0 || archivosDisponibles.length > 1) && hayGrupos && (
          <p
            className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs ${excedeLimite ? "border-amber-300 bg-amber-50 text-amber-800" : "text-muted-foreground"}`}
            data-testid="envio-resumen"
          >
            {excedeLimite && <AlertCircle className="size-3.5 shrink-0" />}
            <span>
              <b>{cantidadMarcada}</b> documento(s) marcado(s) · peso estimado del correo {etiquetaTamano(bytesEstimados)}
              {excedeLimite && " — supera lo que suelen aceptar los servidores de correo (~20 MB): desmarca algunos o envíalos en correos separados."}
            </span>
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={enviar} disabled={enviando || subiendo || generandoAlgunPdf || !puedeEnviar}>
            {enviando || generandoAlgunPdf ? <Loader2 className="animate-spin" /> : <Send />}
            {enviando ? (etapaEnvio ?? "Enviando...") : generandoAlgunPdf ? "Generando PDF..." : "Enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {anfitrion}
    </>
  );
}

/** Entrega 33 — encabezado de un grupo de documentos (Evento / cada speaker) con su conteo y atajos «Todos» / «Ninguno». */
function EncabezadoGrupo({ titulo, marcados, total, onTodos, onNinguno }: { titulo: string; marcados: number; total: number; onTodos: () => void; onNinguno: () => void }) {
  return (
    <div className="sticky top-0 z-[1] flex items-center justify-between gap-2 border-b bg-background/95 pb-1 pt-0.5 backdrop-blur">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo} <span className="font-normal normal-case">· {marcados} de {total}</span>
      </span>
      <span className="flex items-center gap-2 text-xs">
        <button type="button" className="font-medium text-primary hover:underline" onClick={onTodos}>Todos</button>
        <span className="text-muted-foreground">·</span>
        <button type="button" className="font-medium text-primary hover:underline" onClick={onNinguno}>Ninguno</button>
      </span>
    </div>
  );
}
