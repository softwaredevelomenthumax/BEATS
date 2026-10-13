import * as React from "react";
import { toast } from "sonner";
import { Camera, Eye, ImagePlus, Loader2, RefreshCw, Smartphone, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BloqueExpediente, useConfirmarQuitar } from "./piezas";
import { GuiaMarcoFoto, MarcoFotoMuestra } from "./MarcoFotoMuestra";
import { traerArchivo, abrirODescargarArchivo, subirArchivo, type ArchivoAdjunto } from "@/lib/archivosAdjuntos";
import { comprimirImagen, imagenComprimidaAArchivo } from "@/lib/comprimirImagen";
import { construirNombreBase } from "@/lib/nombreArchivo";
import { agregarArchivoRepositorioEvento, eliminarArchivoRepositorioEvento } from "@/lib/repositorioEvento";
import { MARCOS_FOTO, MAX_FOTOS_EVENTO, alcancesFotos, fotosDelAlcance, fotosSinSesion, maximoFotosEvento, type AlcanceFotos, type ClaveMarcoFoto } from "@/lib/expediente";
import type { Evento, RepositorioArchivoEvento } from "@/types";

interface Props {
  evento: Evento;
  archivos: RepositorioArchivoEvento[];
  recargar: (silencioso?: boolean) => Promise<void>;
}

/**
 * Pestaña "Fotos": hasta 4 fotos POR SESIÓN, una por marco guía (grupal, dos de
 * la actividad, speaker exponiendo). Cada marco muestra un croquis de muestra;
 * al hacer clic se abre la guía de qué fotografiar y desde ahí se sube la foto
 * desde un archivo. Las fotos también pueden llegar tomadas (o cargadas)
 * directamente desde la app de Ejecución en Sitio (se marcan con su origen).
 *
 * Octubre 2026, pedido explícito: la opción de fotos se habilita para cada una
 * de las sesiones del evento (un bloque por sesión en "Varias sesiones"; un solo
 * bloque en "Única sesión").
 */
export function PestanaFotos({ evento, archivos, recargar }: Props) {
  const alcances = alcancesFotos(evento);
  const sueltas = fotosSinSesion(evento, archivos);
  const total = alcances.reduce((acc, a) => acc + fotosDelAlcance(archivos, a.sesionId).length, 0);
  const maximo = maximoFotosEvento(evento);

  return (
    <div className="flex flex-col gap-4" data-testid="exp-fotos">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {alcances.length > 1
            ? `Cada una de las ${alcances.length} sesiones admite hasta ${MAX_FOTOS_EVENTO} fotos (una por marco). Total: ${total} de ${maximo}.`
            : `Hasta ${MAX_FOTOS_EVENTO} fotos (una por marco).`}
        </span>
      </div>
      {alcances.map((alcance) => (
        <BloqueFotosAlcance key={alcance.sesionId ?? "evento"} evento={evento} alcance={alcance} archivos={archivos} recargar={recargar} mostrarTitulo={alcances.length > 1} />
      ))}
      {sueltas.length > 0 && <FotosSinSesion fotos={sueltas} recargar={recargar} />}
    </div>
  );
}

function BloqueFotosAlcance({
  evento,
  alcance,
  archivos,
  recargar,
  mostrarTitulo,
}: Props & { alcance: AlcanceFotos; mostrarTitulo: boolean }) {
  const confirmarQuitar = useConfirmarQuitar();
  const idAlcance = alcance.sesionId ?? "evento";
  const fotos = fotosDelAlcance(archivos, alcance.sesionId);
  const porMarco = new Map(fotos.filter((f) => f.etiqueta).map((f) => [f.etiqueta as string, f]));
  const [guia, setGuia] = React.useState<ClaveMarcoFoto | null>(null);
  const [subiendo, setSubiendo] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const marcoPendiente = React.useRef<ClaveMarcoFoto | null>(null);

  const lleno = fotos.length >= MAX_FOTOS_EVENTO;

  function pedirArchivo(clave: ClaveMarcoFoto) {
    marcoPendiente.current = clave;
    inputRef.current?.click();
  }

  async function alElegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    const clave = marcoPendiente.current;
    if (!archivo || !clave) return;
    if (!archivo.type.startsWith("image/")) return toast.error("Elige una imagen (JPG o PNG).");
    const marco = MARCOS_FOTO.find((m) => m.clave === clave)!;
    const previa = porMarco.get(clave);
    if (!previa && lleno) return toast.error(`${mostrarTitulo ? "Esta sesión" : "El evento"} ya tiene ${MAX_FOTOS_EVENTO} fotos. Reemplaza una de las existentes.`);
    setSubiendo(clave);
    try {
      const comprimida = await comprimirImagen(archivo);
      const nuevo = await subirArchivo(await imagenComprimidaAArchivo(comprimida), {
        nombreSugerido: construirNombreBase({ tipo: `Foto ${marco.titulo}`, nombre: evento.nombreEvento, fecha: new Date() }),
      });
      if (previa) await eliminarArchivoRepositorioEvento(previa.id);
      await agregarArchivoRepositorioEvento({ eventoId: evento.id, categoria: "fotos", archivoId: nuevo.id, etiqueta: clave, sesionId: alcance.sesionId });
      toast.success(`Foto “${marco.titulo}” guardada.`);
      setGuia(null);
      await recargar(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar la foto.");
    } finally {
      setSubiendo(null);
    }
  }

  async function quitar(fila: RepositorioArchivoEvento) {
    if (!(await confirmarQuitar("Quitar foto", "¿Quitar esta foto del expediente?"))) return;
    try {
      await eliminarArchivoRepositorioEvento(fila.id);
      await recargar(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo quitar la foto.");
    }
  }

  return (
    <BloqueExpediente
      titulo={mostrarTitulo ? `Fotos — ${alcance.etiqueta} (${fotos.length} de ${MAX_FOTOS_EVENTO})` : `Fotos del evento (${fotos.length} de ${MAX_FOTOS_EVENTO})`}
      estado={<Badge variant={fotos.length > 0 ? "approved" : "pending"}>{fotos.length > 0 ? `${fotos.length} cargada(s)` : "Pendiente"}</Badge>}
      testId={`exp-fotos-${idAlcance}`}
    >
      <p className="text-xs text-muted-foreground">
        Haz clic en un marco para ver qué foto subir. También se pueden tomar o cargar desde la app de Ejecución en Sitio, siguiendo esta misma guía.
      </p>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={alElegirArchivo} data-testid={`exp-input-foto-${idAlcance}`} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {MARCOS_FOTO.map((m) => {
          const foto = porMarco.get(m.clave);
          return (
            <div key={m.clave} className="flex flex-col gap-2 rounded-lg border p-2.5" data-testid={`exp-foto-${idAlcance}-${m.clave}`}>
              <p className="text-sm font-medium">{m.titulo}</p>
              {foto ? (
                <Miniatura archivoId={foto.archivoId!} titulo={m.titulo} />
              ) : (
                <button
                  type="button"
                  onClick={() => setGuia(m.clave)}
                  className="group relative rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title="Ver guía de la foto"
                >
                  <MarcoFotoMuestra clave={m.clave} className="transition-colors group-hover:border-primary/60" />
                  <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 rounded-b-md bg-background/80 py-1 text-[11px] font-medium text-muted-foreground">
                    <Camera className="size-3" /> Ver guía
                  </span>
                </button>
              )}
              {foto ? (
                <div className="flex flex-wrap items-center gap-1">
                  {foto.origen === "ejecucion" && (
                    <Badge variant="outline" className="gap-1"><Smartphone className="size-3" /> Aportada en Ejecución</Badge>
                  )}
                  <Button size="sm" variant="ghost" disabled={subiendo === m.clave} onClick={() => pedirArchivo(m.clave)}>
                    {subiendo === m.clave ? <Loader2 className="animate-spin" /> : <RefreshCw />} Reemplazar
                  </Button>
                  <Button size="icon" variant="ghost" title="Quitar" onClick={() => quitar(foto)}><Trash2 /></Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" disabled={lleno || subiendo === m.clave} onClick={() => setGuia(m.clave)}>
                  {subiendo === m.clave ? <Loader2 className="animate-spin" /> : <ImagePlus />} Subir foto
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {guia && (
        <GuiaMarcoFoto
          clave={guia}
          abierto
          onCerrar={() => setGuia(null)}
          accion={
            <Button onClick={() => pedirArchivo(guia)} disabled={lleno && !porMarco.get(guia)}>
              <ImagePlus /> Elegir foto
            </Button>
          }
        />
      )}
    </BloqueExpediente>
  );
}

/** Fotos de un evento de varias sesiones que no quedaron asociadas a ninguna sesión (cargadas antes de existir fotos por sesión). */
function FotosSinSesion({ fotos, recargar }: { fotos: RepositorioArchivoEvento[]; recargar: Props["recargar"] }) {
  const confirmarQuitar = useConfirmarQuitar();
  async function quitar(fila: RepositorioArchivoEvento) {
    if (!(await confirmarQuitar("Quitar foto", "¿Quitar esta foto del expediente?"))) return;
    try {
      await eliminarArchivoRepositorioEvento(fila.id);
      await recargar(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo quitar la foto.");
    }
  }
  return (
    <BloqueExpediente titulo={`Fotos sin sesión asignada (${fotos.length})`} testId="exp-fotos-sin-sesion">
      <p className="text-xs text-muted-foreground">Se cargaron antes de existir las fotos por sesión. Quítalas y vuelve a subirlas en la sesión que corresponda.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {fotos.map((f) => (
          <div key={f.id} className="flex flex-col gap-2 rounded-lg border p-2.5">
            <p className="text-sm font-medium">{MARCOS_FOTO.find((m) => m.clave === f.etiqueta)?.titulo ?? "Foto sin marco"}</p>
            <Miniatura archivoId={f.archivoId!} titulo="Foto sin sesión" />
            <Button size="icon" variant="ghost" title="Quitar" onClick={() => quitar(f)}><Trash2 /></Button>
          </div>
        ))}
      </div>
    </BloqueExpediente>
  );
}

function Miniatura({ archivoId, titulo }: { archivoId: string; titulo: string }) {
  const [archivo, setArchivo] = React.useState<ArchivoAdjunto | null>(null);
  const [error, setError] = React.useState(false);
  React.useEffect(() => {
    let cancelado = false;
    traerArchivo(archivoId)
      .then((a) => !cancelado && setArchivo(a))
      .catch(() => !cancelado && setError(true));
    return () => {
      cancelado = true;
    };
  }, [archivoId]);
  return (
    <button
      type="button"
      onClick={() => archivo && abrirODescargarArchivo(archivo)}
      className="group relative aspect-[4/3] overflow-hidden rounded-md border bg-muted"
      title="Ver foto"
    >
      {archivo ? (
        <img src={archivo.dataUrl} alt={titulo} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full items-center justify-center text-xs text-muted-foreground">{error ? "No disponible" : <Loader2 className="size-4 animate-spin" />}</span>
      )}
      <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
        <Eye className="size-5 text-white" />
      </span>
    </button>
  );
}
