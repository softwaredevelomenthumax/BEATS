import * as React from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EnviarDocumentoDialog, type ArchivoListaEnvio, type DocumentoPdfEnvio } from "@/components/EnviarDocumentoDialog";
import { useAuth } from "@/hooks/useAuth";
import { construirPaqueteCompletoEventoPorId } from "@/lib/paqueteDocumentosEvento";
import { traerUsuariosPorIds } from "@/lib/usuarios";
import type { Evento, Usuario } from "@/types";

/**
 * Entrega 35 — «Enviar documentos» desde «Auditoría de Eventos».
 *
 * Es la misma ventana y el mismo paquete que el botón «Enviar documentos» del detalle del Convenio HCP (entrega 33): todo
 * lo del evento —documentos generados en BEATS (PDF) y archivos ya cargados— agrupado por «Evento» y por speaker, con
 * Todos/Ninguno por grupo, tamaño estimado y aviso sobre 20 MB. La diferencia es el punto de partida: aquí no hay un
 * convenio abierto, así que el paquete se arma desde el evento (`construirPaqueteCompletoEventoPorId`) y el correo se
 * propone al solicitante del evento (quien lo creó).
 *
 * Mismas restricciones que en el convenio: el envío con adjuntos es exclusivo de Dirección Médica (la Edge Function
 * `send-email` lo exige en el servidor) y solo tiene sentido con el evento Aprobado o Completado; quien no cumple no ve
 * el botón.
 */
const ESTADOS_ENVIABLES = new Set(["Aprobado", "Completado"]);

function puedeEnviarDocumentosDelEvento(usuario: Usuario | null | undefined, evento: Evento): boolean {
  return !!usuario && usuario.rol === "medica" && ESTADOS_ENVIABLES.has(evento.estado);
}

export function EnviarDocumentosEvento({ evento, onEnviado }: { evento: Evento; onEnviado?: () => void }) {
  const { usuario } = useAuth();
  const [abierto, setAbierto] = React.useState(false);
  const [cargando, setCargando] = React.useState(false);
  const [pdfs, setPdfs] = React.useState<DocumentoPdfEnvio[]>([]);
  const [archivos, setArchivos] = React.useState<ArchivoListaEnvio[]>([]);
  const [solicitante, setSolicitante] = React.useState<Usuario | undefined>(undefined);

  if (!puedeEnviarDocumentosDelEvento(usuario, evento)) return null;

  async function preparar() {
    setCargando(true);
    try {
      const [paquete, usuarios] = await Promise.all([
        construirPaqueteCompletoEventoPorId(evento.id),
        traerUsuariosPorIds([evento.creadoPorId]).catch(() => new Map<string, Usuario>()),
      ]);
      setPdfs(
        paquete.documentosPdf.map((p) => ({
          clave: p.clave,
          etiqueta: p.etiqueta,
          detalle: p.detalle,
          doc: p.doc,
          conMarcaDeAgua: true,
          marcadoInicial: p.marcadoInicial,
          grupo: p.grupo,
        })),
      );
      setArchivos(
        paquete.archivos.map((a) => ({ id: a.id, nombre: a.nombre, grupo: a.grupo, detalle: a.detalle, tamanoBytes: a.tamanoBytes, marcadoInicial: a.marcadoInicial })),
      );
      setSolicitante(usuarios.get(evento.creadoPorId));
      setAbierto(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo armar el paquete de documentos.");
    } finally {
      setCargando(false);
    }
  }

  const nombre = evento.nombreEvento || "evento";
  return (
    // Los eventos de React suben por el árbol de componentes aunque el diálogo se pinte en un portal: sin este contenedor,
    // cada clic dentro de la ventana de envío plegaría o desplegaría la fila de la Auditoría donde está el botón.
    <span className="contents" onClick={(e) => e.stopPropagation()}>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5"
        disabled={cargando}
        data-testid={`ae-enviar-docs-${evento.id}`}
        onClick={() => void preparar()}
      >
        <Send className="h-3.5 w-3.5" /> {cargando ? "Preparando documentos..." : "Enviar documentos"}
      </Button>
      <EnviarDocumentoDialog
        open={abierto}
        onOpenChange={setAbierto}
        titulo="Enviar documentos"
        tipoDoc="evento"
        documentoId={evento.id}
        destinatarioEmailInicial={solicitante?.email}
        destinatarioNombreInicial={solicitante?.nombre ?? evento.nombreSolicitante}
        asuntoInicial={`Documentos del evento — ${nombre}`}
        mensajeInicial={`Hola,\n\nAdjunto los documentos del evento «${nombre}» para tus trámites internos.\n\nGracias.`}
        archivosLista={archivos}
        tituloDocumentosPdf="Documentos generados en BEATS — marca cuáles se envían en PDF"
        tituloArchivos="Archivos cargados del evento — marca cuáles se adjuntan"
        documentosPdf={pdfs}
        onEnviado={onEnviado}
      />
    </span>
  );
}
