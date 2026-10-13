import { useConfirmar } from "@/hooks/useConfirmar";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Paperclip, X, Eye, Loader2, CheckCircle2 } from "lucide-react";
import {
  subirArchivo,
  traerArchivo,
  abrirODescargarArchivo,
  formatearTamano,
  type ArchivoAdjunto,
} from "@/lib/archivosAdjuntos";
import { construirNombreBase } from "@/lib/nombreArchivo";

interface Props {
  /** El `*_id` que guarda el documento dueño (p. ej. `evento.cartaInvitacionId`). */
  valor: string | null;
  /**
   * Entrega 29: puede devolver una promesa. Si el dueño del campo persiste el id (p. ej. la copia
   * firmada del Convenio HCP) y NO lo logra, devuelve `false` (o lanza): el campo revierte al estado
   * «sin archivo» y NO muestra el aviso de éxito — antes avisaba «cargado» aunque nada se hubiera guardado.
   */
  onChange: (archivoId: string | null) => void | boolean | Promise<void | boolean>;
  etiqueta?: string;
  /** Atributo `accept` del input nativo — p. ej. `"image/*,application/pdf"`. */
  aceptar?: string;
  /** Texto de ayuda bajo la etiqueta (solo variante "dropzone") — p. ej. tipos de archivo aceptados. */
  ayuda?: string;
  maxBytes?: number;
  disabled?: boolean;
  /**
   * AJUSTES (septiembre 2026), pedido explícito ("diagramado o construido con
   * criterio de diseñador frontdesk experto" para el espacio de carga de
   * soportes de la Solicitud de Evento): variante visual opcional, sin tocar
   * el resto de los ~15 puntos donde ya se usa `CampoArchivo` con su estilo
   * compacto original (un botón + una fila angosta al cargar). "dropzone" es
   * una zona más grande, con borde punteado, ícono, texto de ayuda y soporte
   * de arrastrar-y-soltar — pensada para secciones donde adjuntar el
   * documento es una acción central de la pantalla, no un campo más entre
   * muchos. Octubre 2026, pedido explícito: ahora TODOS los campos de adjuntos usan "dropzone" por defecto (arrastrar o hacer clic).
   */
  variante?: "compacta" | "dropzone";
  /**
   * AJUSTES (septiembre/octubre 2026), pedido explícito: nombre descriptivo
   * del documento/registro dueño (nombre del evento, del HCP/speaker, etc.)
   * para construir el nombre de archivo sugerido al guardar el adjunto en
   * `archivos_adjuntos` (ver `subirArchivo`). Opcional: sin él, se usa solo
   * `etiqueta` (el tipo de adjunto, p. ej. "RETHUS") y la fecha.
   */
  contexto?: string;
  /**
   * Expediente del evento (octubre 2026): tipo de adjunto para el nombre de
   * archivo cuando difiere de la etiqueta visible (p. ej. "Convhcp versión
   * firmada"). Sin él se usa `etiqueta`, como siempre.
   */
  nombreTipo?: string;
  /** Identificador/consecutivo para el último segmento del nombre (p. ej. el id del convenio). */
  idConsecutivo?: string;
}

/**
 * Campo de carga de archivo genérico — usado en cada punto de la app que
 * tiene un `*_id` de `archivos_adjuntos` pendiente de conectar (Fase 1, ver
 * plan de implementación). Sube el archivo apenas se selecciona (no espera
 * a que se guarde el formulario completo) y expone únicamente el id
 * resultante — el formulario dueño solo necesita guardar ese string.
 */
export function CampoArchivo({ valor, onChange, etiqueta, aceptar, ayuda, maxBytes, disabled, variante = "dropzone", contexto, nombreTipo, idConsecutivo }: Props) {
  const [info, setInfo] = React.useState<ArchivoAdjunto | null>(null);
  const [cargando, setCargando] = React.useState(false);
  const [subiendo, setSubiendo] = React.useState(false);
  const [arrastrando, setArrastrando] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const idInputHtml = React.useId();

  React.useEffect(() => {
    if (!valor) {
      setInfo(null);
      return;
    }
    // Si `onChange` acaba de fijar `valor` tras subir el archivo en esta
    // misma sesión de la pantalla, `info` ya lo tiene — no hace falta volver
    // a traerlo. Solo se trae cuando el campo arranca con un id ya existente
    // (por ejemplo, al abrir para editar un documento guardado).
    if (info?.id === valor) return;
    let cancelado = false;
    setCargando(true);
    traerArchivo(valor)
      .then((a) => { if (!cancelado) setInfo(a); })
      .catch(() => { if (!cancelado) setInfo(null); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  async function subir(archivo: File) {
    setSubiendo(true);
    try {
      const nombreSugerido = construirNombreBase({ tipo: nombreTipo ?? etiqueta, nombre: contexto, fecha: new Date(), idConsecutivo });
      const nuevo = await subirArchivo(archivo, { maxBytes, nombreSugerido });
      setInfo(nuevo);
      const resultado = await onChange(nuevo.id);
      if (resultado === false) {
        // El dueño no pudo guardar la referencia: no se aparenta un éxito que no ocurrió.
        setInfo(null);
        return;
      }
      toast.success(`${archivo.name} cargado.`);
    } catch (error) {
      setInfo(null);
      toast.error(error instanceof Error ? error.message : "No se pudo cargar el archivo.");
    } finally {
      setSubiendo(false);
    }
  }

  function manejarSeleccion(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (archivo) void subir(archivo);
  }

  function manejarSoltar(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastrando(false);
    if (disabled || subiendo) return;
    const archivo = e.dataTransfer.files?.[0];
    if (archivo) void subir(archivo);
  }

  const confirmar = useConfirmar();
  async function quitar() {
    if (!(await confirmar({ titulo: "Quitar archivo", mensaje: "¿Quitar el archivo adjunto?", textoConfirmar: "Quitar" }))) return;
    const resultado = await onChange(null);
    if (resultado !== false) setInfo(null);
  }

  const input = (
    <input
      id={idInputHtml}
      ref={inputRef}
      type="file"
      accept={aceptar}
      className="hidden"
      onChange={manejarSeleccion}
      disabled={disabled || subiendo}
    />
  );

  if (variante === "dropzone") {
    return (
      <div className="flex flex-col gap-1.5">
        {etiqueta && (
          <label htmlFor={idInputHtml} className="text-sm font-medium">
            {etiqueta}
          </label>
        )}
        {input}
        {valor ? (
          <div className="flex items-center gap-3 rounded-lg border bg-card p-3 text-sm shadow-sm">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent">
              <Paperclip className="size-4 text-accent-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{cargando ? "Cargando..." : info?.nombre ?? "Archivo cargado"}</p>
              {!cargando && (
                <p className="flex items-center gap-1 text-xs text-status-approved-fg" data-testid="campo-archivo-cargado">
                  <CheckCircle2 className="size-3.5" />
                  Archivo cargado{info ? ` · ${formatearTamano(info.tamanoBytes)}` : ""}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Ver"
              disabled={!info}
              onClick={() => info && abrirODescargarArchivo(info)}
            >
              <Eye />
            </Button>
            {!disabled && (
              <Button type="button" variant="ghost" size="icon" title="Quitar" onClick={quitar}>
                <X />
              </Button>
            )}
          </div>
        ) : (
          <div
            role="button"
            tabIndex={disabled || subiendo ? -1 : 0}
            aria-disabled={disabled || subiendo}
            onClick={() => !disabled && !subiendo && inputRef.current?.click()}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !disabled && !subiendo) {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (!disabled && !subiendo) setArrastrando(true);
            }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={manejarSoltar}
            className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
              disabled || subiendo
                ? "cursor-not-allowed border-muted bg-muted/30 text-muted-foreground"
                : arrastrando
                  ? "cursor-pointer border-primary bg-accent/60"
                  : "cursor-pointer border-muted-foreground/30 bg-muted/20 hover:border-primary/50 hover:bg-accent/30"
            }`}
          >
            {subiendo ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <Paperclip className="size-5 text-muted-foreground" />
            )}
            <p className="text-sm font-medium">
              {subiendo ? "Cargando..." : "Arrastra el archivo aquí o haz clic para adjuntarlo"}
            </p>
            {ayuda && !subiendo && <p className="text-xs text-muted-foreground">{ayuda}</p>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {etiqueta && <label htmlFor={idInputHtml} className="text-sm font-medium">{etiqueta}</label>}
      {input}
      {valor ? (
        <div className="flex items-center gap-2 rounded-md border p-2 text-sm">
          <Paperclip className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate">
            {cargando ? "Cargando..." : info?.nombre ?? "Archivo cargado"}
            {info && <span className="text-muted-foreground"> · {formatearTamano(info.tamanoBytes)}</span>}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Ver"
            disabled={!info}
            onClick={() => info && abrirODescargarArchivo(info)}
          >
            <Eye />
          </Button>
          {!disabled && (
            <Button type="button" variant="ghost" size="icon" title="Quitar" onClick={quitar}>
              <X />
            </Button>
          )}
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={disabled || subiendo}
          onClick={() => inputRef.current?.click()}
        >
          {subiendo ? <Loader2 className="animate-spin" /> : <Paperclip />}
          {subiendo ? "Cargando..." : "Adjuntar archivo"}
        </Button>
      )}
    </div>
  );
}
