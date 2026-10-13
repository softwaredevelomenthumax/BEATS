import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Eye, Loader2 } from "lucide-react";
import { traerArchivo, abrirODescargarArchivo } from "@/lib/archivosAdjuntos";

interface Props {
  archivoId: string | null;
  /** Texto del botón — por defecto solo el ícono, para caber en filas de tabla angostas. */
  etiqueta?: string;
  size?: "icon" | "sm" | "default";
  variant?: "ghost" | "outline";
}

/**
 * Botón "Ver" de solo lectura — trae el archivo (nombre/data_url) solo
 * cuando se hace clic, en vez de cargar de entrada todos los archivos de una
 * lista larga (Repositorio del Evento, tabla de Speakers, etc.). Corrige
 * directamente los hallazgos D4/D6/D9 del diagnóstico ("el botón Ver no
 * abre nada" / "solo funciona con clic derecho").
 */
export function VisorArchivo({ archivoId, etiqueta, size = "icon", variant = "ghost" }: Props) {
  const [cargando, setCargando] = React.useState(false);

  async function ver() {
    if (!archivoId) return;
    setCargando(true);
    try {
      const archivo = await traerArchivo(archivoId);
      if (!archivo) {
        toast.error("El archivo ya no está disponible.");
        return;
      }
      abrirODescargarArchivo(archivo);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo abrir el archivo.");
    } finally {
      setCargando(false);
    }
  }

  if (!archivoId) return null;

  return (
    <Button type="button" variant={variant} size={size} title="Ver archivo" disabled={cargando} onClick={ver}>
      {cargando ? <Loader2 className="animate-spin" /> : <Eye />}
      {etiqueta}
    </Button>
  );
}
