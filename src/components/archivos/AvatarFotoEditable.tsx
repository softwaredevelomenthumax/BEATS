import * as React from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { subirArchivo, traerArchivo, type ArchivoAdjunto } from "@/lib/archivosAdjuntos";
import { construirNombreBase } from "@/lib/nombreArchivo";
import { comprimirImagen, imagenComprimidaAArchivo } from "@/lib/comprimirImagen";

/**
 * Avatar circular con carga inmediata de la foto — pedido explícito del usuario (septiembre 2026) para el formulario
 * «Nuevo speaker»: «al cargar la foto debe verse de inmediato en un círculo (avatar circular, similar a como se ve en el
 * repositorio de speakers)». `CampoArchivo` (genérico) solo muestra una fila con el nombre del archivo, así que este
 * componente sube el archivo directamente (mismo `subirArchivo`) y dibuja el círculo en cuanto termina, sin esperar a
 * guardar el formulario.
 *
 * Entrega 33: se saca de `pages/Speakers.tsx` a este archivo para reutilizarlo igual en «Usuarios y Roles» (foto del
 * colaborador): mismo gesto, mismo aspecto. `comprimir` reduce la foto a un cuadro de 512 px antes de guardarla — se
 * usa en los usuarios porque su avatar aparece en muchas pantallas a la vez y la imagen se guarda en base64.
 */
export function AvatarFotoEditable({
  valor,
  onChange,
  nombre,
  etiqueta = "la foto",
  tipoNombreArchivo = "Foto",
  comprimir = false,
  testId,
}: {
  valor: string | null;
  onChange: (archivoId: string | null) => void;
  nombre: string;
  /** Texto del título del botón: «Cargar {etiqueta}». */
  etiqueta?: string;
  tipoNombreArchivo?: string;
  comprimir?: boolean;
  testId?: string;
}) {
  const [archivo, setArchivo] = React.useState<ArchivoAdjunto | null>(null);
  const [subiendo, setSubiendo] = React.useState(false);
  const [arrastrando, setArrastrando] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!valor) {
      setArchivo(null);
      return;
    }
    if (archivo?.id === valor) return;
    let cancelado = false;
    traerArchivo(valor)
      .then((a) => {
        if (!cancelado) setArchivo(a);
      })
      .catch(() => {
        if (!cancelado) setArchivo(null);
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  async function manejarSeleccion(e: React.ChangeEvent<HTMLInputElement>) {
    const elegido = e.target.files?.[0];
    e.target.value = "";
    if (elegido) await cargarArchivo(elegido);
  }

  async function cargarArchivo(archivoSeleccionado: File) {
    if (subiendo) return;
    if (!archivoSeleccionado.type.startsWith("image/")) {
      toast.error("Elige un archivo de imagen (JPG, PNG…).");
      return;
    }
    setSubiendo(true);
    try {
      const nombreSugerido = construirNombreBase({ tipo: tipoNombreArchivo, nombre, fecha: new Date() });
      const aSubir = comprimir
        ? await imagenComprimidaAArchivo(await comprimirImagen(archivoSeleccionado, { ladoMaximo: 512, calidad: 0.85 }))
        : archivoSeleccionado;
      const subido = await subirArchivo(aSubir, { maxBytes: 3 * 1024 * 1024, nombreSugerido });
      setArchivo(subido);
      onChange(subido.id);
      toast.success("Foto cargada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cargar la foto.");
    } finally {
      setSubiendo(false);
    }
  }

  const iniciales = nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <div className="flex flex-col items-center gap-1.5" data-testid={testId}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          const f = e.dataTransfer.files?.[0];
          if (f && !subiendo) void cargarArchivo(f);
        }}
        className={`flex flex-col items-center gap-1.5 rounded-lg border-2 border-dashed px-3 py-2 text-center transition-colors ${arrastrando ? "border-primary bg-accent/60" : "border-muted-foreground/30"}`}
      >
        <button
          type="button"
          className="relative rounded-full outline-offset-2 transition-opacity hover:opacity-90"
          onClick={() => inputRef.current?.click()}
          disabled={subiendo}
          title={`Cargar ${etiqueta}`}
        >
          <Avatar className="h-16 w-16">
            {archivo && <AvatarImage src={archivo.dataUrl} alt={nombre || etiqueta} />}
            <AvatarFallback className="bg-[var(--sidebar-active-bg)] text-lg font-semibold text-[var(--brand-blue)]">
              {subiendo ? "…" : iniciales || "?"}
            </AvatarFallback>
          </Avatar>
          <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border bg-background">
            <Pencil className="h-2.5 w-2.5" />
          </span>
        </button>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={manejarSeleccion} disabled={subiendo} data-testid={testId ? `${testId}-input` : undefined} />
        <p className="text-[11px] text-muted-foreground">Arrastra la imagen aquí o haz clic para adjuntarla</p>
        {valor && (
          <button type="button" className="text-[11px] text-muted-foreground underline" onClick={() => onChange(null)}>
            Quitar foto
          </button>
        )}
      </div>
    </div>
  );
}
