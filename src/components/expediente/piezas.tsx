import * as React from "react";
import { toast } from "sonner";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { Trash2, FolderOpen, Ban, Paperclip, ChevronDown } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/lib/supabaseClient";
import { traerArchivos } from "@/lib/archivosAdjuntos";
import { gruposSpeakers } from "@/lib/expediente";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { InputMoneda } from "@/components/ui/input-moneda";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CampoArchivo } from "@/components/archivos/CampoArchivo";
import { VisorArchivo } from "@/components/archivos/VisorArchivo";
import { useConfirmar } from "@/hooks/useConfirmar";
import { formatearMonto } from "@/lib/dinero";
import { formatearFecha } from "@/lib/fecha";
import { facturasDelComprobante } from "@/lib/facturacionSpeaker";
import { cn } from "@/lib/utils";
import type { Evento, RegistroFinancieroEvento, RepositorioArchivoEvento } from "@/types";

/** Estado "listo / pendiente / no aplica" de un renglón del expediente — mismos colores de estado que el resto de la app. */
export function EstadoChip({ hecho, noAplica, texto }: { hecho: boolean; noAplica?: boolean; texto?: string }) {
  if (noAplica) return <Badge variant="cancelled">{texto ?? "No aplica"}</Badge>;
  return <Badge variant={hecho ? "approved" : "pending"}>{texto ?? (hecho ? "Listo" : "Pendiente")}</Badge>;
}

/** Fotos de perfil (data URL) de los speakers del evento, por id del Repositorio. Si falla, quedan las iniciales. */
export function useFotosSpeakers(speakerIds: string[]): Map<string, string> {
  const [fotos, setFotos] = React.useState<Map<string, string>>(new Map());
  const clave = speakerIds.join("|");
  React.useEffect(() => {
    const ids = clave ? clave.split("|") : [];
    if (ids.length === 0) return;
    let activo = true;
    (async () => {
      try {
        const { data, error } = await supabase.from("speakers").select("id, foto_id").in("id", ids);
        if (error) throw error;
        const filas = (data ?? []) as { id: string; foto_id: string | null }[];
        const archivos = await traerArchivos(filas.map((f) => f.foto_id).filter((x): x is string => !!x));
        const mapa = new Map<string, string>();
        for (const f of filas) {
          const a = f.foto_id ? archivos.get(f.foto_id) : undefined;
          if (a) mapa.set(f.id, a.dataUrl);
        }
        if (activo) setFotos(mapa);
      } catch (error) {
        console.error("No se pudieron cargar las fotos de los speakers:", error);
      }
    })();
    return () => {
      activo = false;
    };
  }, [clave]);
  return fotos;
}

export function inicialesNombre(nombre: string): string {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

/** Avatar circular con la foto del speaker (iniciales si no tiene) — el mismo de la pestaña "Speakers". */
export function AvatarSpeaker({ nombre, fotoUrl, className }: { nombre: string; fotoUrl?: string; className?: string }) {
  return (
    <Avatar className={cn("size-8", className)}>
      {fotoUrl && <AvatarImage src={fotoUrl} alt={nombre} />}
      <AvatarFallback className="text-xs">{inicialesNombre(nombre)}</AvatarFallback>
    </Avatar>
  );
}

/**
 * Entrega 21: en las pestañas Resumen, Documentos del sistema y Financiero los
 * bloques se titulan con el nombre del speaker. Devuelve, para un título de
 * bloque, el avatar con su foto (o `undefined` si el bloque no es de un speaker,
 * en cuyo caso queda el ícono de carpeta).
 */
export function useIconoPorSpeaker(evento: Evento): (titulo: string) => React.ReactNode | undefined {
  const grupos = React.useMemo(() => gruposSpeakers(evento), [evento]);
  const fotos = useFotosSpeakers(grupos.map((g) => g.speakerId).filter((x): x is string => !!x));
  return (titulo: string) => {
    const g = grupos.find((x) => x.nombre === titulo);
    return g ? <AvatarSpeaker nombre={g.nombre} fotoUrl={g.speakerId ? fotos.get(g.speakerId) : undefined} className="size-6" /> : undefined;
  };
}

/**
 * Sección del expediente en formato acordeón (entrega 20): cada bloque se abre
 * y se cierra por separado para ver solo la información que se necesita.
 * Arranca ABIERTO (así nada del expediente queda oculto por sorpresa) y el
 * chip de estado queda visible en la cabecera aun con la sección cerrada.
 */
export function BloqueExpediente({
  titulo,
  estado,
  children,
  testId,
  className,
  cerradoInicial,
  icono,
}: {
  titulo: string;
  estado?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
  className?: string;
  cerradoInicial?: boolean;
  /** Reemplaza el ícono de carpeta (p. ej. el avatar del speaker). */
  icono?: React.ReactNode;
}) {
  return (
    <AccordionPrimitive.Root type="single" collapsible defaultValue={cerradoInicial ? undefined : "bloque"} className={cn("rounded-lg border bg-card", className)} data-testid={testId}>
      <AccordionPrimitive.Item value="bloque">
        <AccordionPrimitive.Header className="flex items-center justify-between gap-2 px-3.5">
          <AccordionPrimitive.Trigger className="group flex flex-1 items-center gap-1.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-accent-foreground">
            {icono ?? <FolderOpen className="h-3.5 w-3.5" />}
            {titulo}
            <ChevronDown className="ml-1 h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </AccordionPrimitive.Trigger>
          {estado}
        </AccordionPrimitive.Header>
        <AccordionPrimitive.Content>
          <div className="flex flex-col gap-2.5 px-3.5 pb-3.5">{children}</div>
        </AccordionPrimitive.Content>
      </AccordionPrimitive.Item>
    </AccordionPrimitive.Root>
  );
}

/**
 * Documento del repositorio que se carga como archivo O se declara "No
 * aplica" con un motivo obligatorio (Presentación aprobada y su evidencia de
 * aprobación). Una sola fila por alcance: cargar reemplaza la declaración y
 * viceversa.
 */
export function ArchivoOpcionalConNoAplica({
  etiqueta,
  nombreTipo,
  contexto,
  filas,
  textoNoAplica,
  onCargar,
  onNoAplica,
  onQuitar,
  testId,
}: {
  etiqueta: string;
  nombreTipo: string;
  contexto: string;
  filas: RepositorioArchivoEvento[];
  textoNoAplica: string;
  onCargar: (archivoId: string) => Promise<void>;
  onNoAplica: (motivo: string) => Promise<void>;
  onQuitar: (fila: RepositorioArchivoEvento) => Promise<void>;
  testId?: string;
}) {
  const [modo, setModo] = React.useState<"archivo" | "no_aplica">("archivo");
  const [motivo, setMotivo] = React.useState("");
  const [guardando, setGuardando] = React.useState(false);
  const fila = filas[0] ?? null;

  async function guardarNoAplica() {
    if (!motivo.trim()) {
      toast.error("Explica por qué no aplica.");
      return;
    }
    setGuardando(true);
    try {
      await onNoAplica(motivo.trim());
      setMotivo("");
    } finally {
      setGuardando(false);
    }
  }

  if (fila) {
    return (
      <div className="flex flex-col gap-1.5" data-testid={testId}>
        <p className="text-sm font-medium">{etiqueta}</p>
        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 p-2 text-sm">
          {fila.noAplica ? (
            <div className="flex min-w-0 flex-col">
              <span className="flex items-center gap-1.5 font-medium"><Ban className="size-3.5" /> No aplica</span>
              <span className="text-xs text-muted-foreground">{fila.noAplicaMotivo}</span>
            </div>
          ) : (
            <span className="flex items-center gap-1.5"><Paperclip className="size-3.5 text-muted-foreground" /> Archivo cargado</span>
          )}
          <div className="flex shrink-0 items-center gap-1">
            {!fila.noAplica && <VisorArchivo archivoId={fila.archivoId} etiqueta="Ver" size="sm" variant="outline" />}
            <Button size="sm" variant="ghost" onClick={() => onQuitar(fila)}>
              <Trash2 /> {fila.noAplica ? "Cambiar" : "Quitar"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{etiqueta}</p>
        <div className="inline-flex rounded-md border p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setModo("archivo")}
            className={cn("rounded px-2 py-1", modo === "archivo" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
          >
            Cargar archivo
          </button>
          <button
            type="button"
            onClick={() => setModo("no_aplica")}
            className={cn("rounded px-2 py-1", modo === "no_aplica" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
          >
            {textoNoAplica}
          </button>
        </div>
      </div>
      {modo === "archivo" ? (
        <CampoArchivo
          valor={null}
          onChange={(id) => { if (id) void onCargar(id); }}
          aceptar="application/pdf,image/*,.ppt,.pptx"
          contexto={contexto}
          nombreTipo={nombreTipo}
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${testId}-motivo`} className="text-xs">Explica por qué no aplica *</Label>
          <Textarea id={`${testId}-motivo`} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo" />
          <Button size="sm" variant="outline" className="w-fit" disabled={guardando} onClick={guardarNoAplica}>
            Guardar “no aplica”
          </Button>
        </div>
      )}
    </div>
  );
}

/** Lista de registros financieros (OC / facturas / comprobantes) con "Ver" y eliminar. */
export function ListaRegistrosFinancieros({
  items,
  nombreSesion,
  onQuitar,
  vacio,
  facturas,
  extra,
}: {
  items: RegistroFinancieroEvento[];
  nombreSesion?: (id: string | null) => string | null;
  onQuitar: (id: string) => void;
  vacio: string;
  /** Entrega 36: facturas del speaker, para mostrar cuáles cubre cada comprobante de pago. */
  facturas?: RegistroFinancieroEvento[];
  /** Entrega 37: renglón adicional bajo cada registro (p. ej. estado de la Notificación de Pago y del pago de cada factura). */
  extra?: (registro: RegistroFinancieroEvento) => React.ReactNode;
}) {
  if (items.length === 0) return <p className="text-[11.5px] text-muted-foreground">{vacio}</p>;
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((f) => (
        <div key={f.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{f.numero || "sin número"}</span>
            <span className="text-xs text-muted-foreground">
              {f.fecha ? formatearFecha(f.fecha) : "sin fecha"} · {f.valor != null ? formatearMonto(f.valor, f.moneda) : "sin valor"}
              {f.sesionId && nombreSesion ? ` · ${nombreSesion(f.sesionId)}` : ""}
            </span>
            {f.categoria === "comprobantePago" && facturas && facturasDelComprobante(f).length > 0 && (
              <span className="text-xs text-muted-foreground" data-testid="comprobante-cubre">
                Cubre {facturasDelComprobante(f).length === 1 ? "la factura" : "las facturas"}:{" "}
                {facturasDelComprobante(f).map((id) => facturas.find((x) => x.id === id)?.numero || "(factura eliminada)").join(", ")}
              </span>
            )}
            {extra?.(f)}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <VisorArchivo archivoId={f.archivoId} etiqueta="Ver" size="sm" variant="outline" />
            <Button size="icon" variant="ghost" title="Eliminar" onClick={() => onQuitar(f.id)}><Trash2 /></Button>
          </div>
        </div>
      ))}
    </div>
  );
}

export interface DatosNuevoRegistroFinanciero {
  archivoId: string;
  numero: string;
  fecha: string;
  valor: number | null;
  moneda: string;
  /** Entrega 36: facturas que cubre el comprobante (una o varias). */
  facturasRelacionadasIds?: string[];
  /** Entrega 36: comentario opcional sobre el pago; se guarda como anotación con autor y fecha. */
  comentario?: string;
  /** Entrega 36: sesión a la que aplica el comentario (solo cuando el speaker factura por sesión). */
  comentarioSesionId?: string | null;
}

/** Formulario compacto para agregar una OC, factura o comprobante: archivo + número + fecha + valor + moneda. */
export function FormRegistroFinanciero({
  etiquetaArchivo,
  nombreTipo,
  contexto,
  monedas,
  monedaInicial,
  textoBoton,
  facturasDisponibles,
  sesionesComentario,
  nombreSesion,
  onAgregar,
  testId,
}: {
  etiquetaArchivo: string;
  nombreTipo: string;
  contexto: string;
  monedas: string[];
  monedaInicial: string;
  textoBoton: string;
  /**
   * Solo para comprobantes de pago: facturas a las que se puede ligar. Entrega 37: son únicamente las facturas que ningún
   * otro comprobante ha cubierto, y elegir al menos una es obligatorio.
   */
  facturasDisponibles?: RegistroFinancieroEvento[];
  /**
   * Entrega 36: solo para comprobantes de pago. Si se pasa (aunque sea con lista vacía), el formulario muestra el campo
   * «Comentarios sobre el pago»; con sesiones, además «Aplica a» (el speaker factura por sesión).
   */
  sesionesComentario?: { id: string; etiqueta: string }[];
  nombreSesion?: (id: string | null) => string | null;
  onAgregar: (datos: DatosNuevoRegistroFinanciero) => Promise<void>;
  testId?: string;
}) {
  const [archivoId, setArchivoId] = React.useState<string | null>(null);
  const [numero, setNumero] = React.useState("");
  const [fecha, setFecha] = React.useState("");
  const [valor, setValor] = React.useState<number | null>(null);
  const [moneda, setMoneda] = React.useState(monedaInicial);
  const [facturasIds, setFacturasIds] = React.useState<string[]>([]);
  const [comentario, setComentario] = React.useState("");
  const [comentarioSesionId, setComentarioSesionId] = React.useState("__todas__");
  const [guardando, setGuardando] = React.useState(false);

  React.useEffect(() => {
    if (!moneda && monedaInicial) setMoneda(monedaInicial);
  }, [monedaInicial, moneda]);

  // Entrega 37: lo marcado se limita a las facturas pendientes que existen ahora (si cambian mientras el formulario está abierto,
  // las marcas viejas se ignoran) y, con una sola factura pendiente, no hay nada que elegir: queda marcada.
  const validasIds = new Set((facturasDisponibles ?? []).map((f) => f.id));
  const soloVigentes = (ids: string[]): string[] => {
    if (!facturasDisponibles) return ids;
    const vigentes = ids.filter((id) => validasIds.has(id));
    return vigentes.length === 0 && facturasDisponibles.length === 1 ? [facturasDisponibles[0].id] : vigentes;
  };
  const marcadasIds = soloVigentes(facturasIds);

  async function agregar() {
    if (!archivoId) return toast.error(`Adjunta el archivo: ${etiquetaArchivo.toLowerCase()}.`);
    if (!numero.trim()) return toast.error("Indica el número del documento.");
    if (!fecha) return toast.error("Indica la fecha del documento.");
    if (valor == null || valor <= 0) return toast.error("Indica el valor (mayor a cero).");
    if (!moneda) return toast.error("Selecciona la moneda.");
    // Entrega 37: un comprobante de pago siempre cubre al menos una factura pendiente.
    if (facturasDisponibles && marcadasIds.length === 0) {
      return toast.error("Marca la factura (o las facturas) que cubre este comprobante.");
    }
    setGuardando(true);
    try {
      // Solo se envían facturas que aún existen (si una se eliminó mientras el formulario estaba abierto, se descarta).
      const vigentes = marcadasIds.filter((id) => facturasDisponibles?.some((f) => f.id === id));
      await onAgregar({
        archivoId,
        numero: numero.trim(),
        fecha,
        valor,
        moneda,
        facturasRelacionadasIds: vigentes.length > 0 ? vigentes : undefined,
        comentario: comentario.trim() || undefined,
        comentarioSesionId: comentarioSesionId === "__todas__" ? null : comentarioSesionId,
      });
      setArchivoId(null);
      setNumero("");
      setFecha("");
      setValor(null);
      setFacturasIds([]);
      setComentario("");
      setComentarioSesionId("__todas__");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed p-2.5" data-testid={testId}>
      <CampoArchivo valor={archivoId} onChange={setArchivoId} aceptar="application/pdf,image/*" contexto={contexto} nombreTipo={nombreTipo} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_2fr_1fr]">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Número *</Label>
          <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Número" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Fecha *</Label>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Valor *</Label>
          <InputMoneda value={valor} moneda={moneda} onChange={setValor} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Moneda *</Label>
          <Select value={moneda} onValueChange={setMoneda}>
            <SelectTrigger><SelectValue placeholder="Moneda" /></SelectTrigger>
            <SelectContent>
              {monedas.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {facturasDisponibles && facturasDisponibles.length > 0 && (
        <fieldset className="flex flex-col gap-1.5" data-testid="comprobante-facturas-que-cubre">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <legend className="text-xs font-semibold leading-none text-slate-800">Factura(s) que cubre *</legend>
            {facturasDisponibles.length > 1 && (
              <span className="flex items-center gap-2 text-xs">
                <button type="button" className="font-medium text-primary hover:underline" onClick={() => setFacturasIds(facturasDisponibles.map((f) => f.id))}>Todas</button>
                <span className="text-muted-foreground">·</span>
                <button type="button" className="font-medium text-primary hover:underline" onClick={() => setFacturasIds([])}>Ninguna</button>
              </span>
            )}
          </div>
          <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border p-1.5">
            {facturasDisponibles.map((fa) => {
              const marcada = marcadasIds.includes(fa.id);
              const sesion = fa.sesionId && nombreSesion ? nombreSesion(fa.sesionId) : null;
              return (
                <label key={fa.id} htmlFor={`cubre-${fa.id}`} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent/50">
                  <Checkbox
                    id={`cubre-${fa.id}`}
                    checked={marcada}
                    onCheckedChange={(v) =>
                      setFacturasIds((prev) => {
                        const actuales = soloVigentes(prev);
                        return v === true ? (actuales.includes(fa.id) ? actuales : [...actuales, fa.id]) : actuales.filter((x) => x !== fa.id);
                      })
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{fa.numero || "sin número"}</span>
                    <span className="text-xs text-muted-foreground">
                      {fa.fecha ? ` · ${formatearFecha(fa.fecha)}` : ""}{fa.valor != null ? ` · ${formatearMonto(fa.valor, fa.moneda)}` : ""}{sesion ? ` · ${sesion}` : ""}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {marcadasIds.length === 0
              ? "Marca la factura o las facturas a las que corresponde este pago. Solo aparecen las facturas que aún no tienen comprobante de pago."
              : `${marcadasIds.length} factura(s) seleccionada(s).`}
          </p>
        </fieldset>
      )}
      {sesionesComentario && (
        <div className="flex flex-col gap-1.5" data-testid="comprobante-comentarios">
          <Label className="text-xs" htmlFor={`${testId ?? "comprobante"}-comentario`}>Comentarios sobre el pago (opcional)</Label>
          <Textarea
            sinMayusculas
            id={`${testId ?? "comprobante"}-comentario`}
            rows={2}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Anotaciones sobre este pago: abonos, diferencias, retenciones, aclaraciones…"
          />
          {sesionesComentario.length > 0 && (
            <div className="flex flex-col gap-1 sm:max-w-xs">
              <Label className="text-xs">Aplica a</Label>
              <Select value={comentarioSesionId} onValueChange={setComentarioSesionId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todas__">Todo el pago (todas las sesiones)</SelectItem>
                  {sesionesComentario.map((x) => (<SelectItem key={x.id} value={x.id}>{x.etiqueta}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">Queda registrado con tu nombre y la fecha, y se muestra en los hallazgos del expediente y del Informe de Pagos.</p>
        </div>
      )}
      <Button size="sm" variant="outline" className="w-fit" disabled={guardando} onClick={agregar}>{textoBoton}</Button>
    </div>
  );
}

/** Hook para el "¿seguro?" al quitar un archivo del expediente. */
export function useConfirmarQuitar() {
  const confirmar = useConfirmar();
  return (titulo: string, mensaje: string) => confirmar({ titulo, mensaje, textoConfirmar: "Eliminar" });
}
