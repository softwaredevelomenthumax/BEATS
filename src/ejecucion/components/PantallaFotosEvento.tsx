import * as React from "react";
import { toast } from "sonner";
import { Camera, CheckCircle2, ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GuiaMarcoFoto, MarcoFotoMuestra } from "@/components/expediente/MarcoFotoMuestra";
import { comprimirImagen } from "@/lib/comprimirImagen";
import { construirNombreBase } from "@/lib/nombreArchivo";
import { MARCOS_FOTO, MAX_FOTOS_EVENTO, type ClaveMarcoFoto } from "@/lib/expediente";
import { ErrorEjecucion, listarFotosEvento, registrarFotoEvento, type FotoEventoEjecucion, type SesionEjecucionActiva } from "../lib/rpc";

type Origen = "camara" | "archivo";

/**
 * Fotos del evento, siguiendo la guía de marcos (grupal, dos de la
 * actividad, speaker exponiendo). Al tocar un marco se ve el croquis de
 * muestra y de ahí se elige cómo aportar la foto:
 *   - "Tomar foto": abre la cámara del dispositivo (`capture="environment"`);
 *   - "Cargar desde archivo": elige una imagen ya guardada en el dispositivo
 *     (octubre 2026, pedido explícito — antes solo se podía tomar en el momento).
 *
 * Octubre 2026: las fotos son POR SESIÓN. En un evento de "Varias sesiones" se
 * elige primero la sesión y cada sesión tiene sus propios 4 marcos; en un
 * evento de sesión única hay un solo juego de 4. Máximo 4 fotos por sesión;
 * volver a aportar un marco de esa sesión lo reemplaza.
 */
export function PantallaFotosEvento({ sesion, onVolver }: { sesion: SesionEjecucionActiva; onVolver: () => void }) {
  const esMultisesion = sesion.modalidadSesiones === "Varias sesiones" && sesion.sesiones.length > 0;
  const [sesionElegida, setSesionElegida] = React.useState<string>(esMultisesion ? sesion.sesiones[0]?.id ?? "" : "");
  const [fotos, setFotos] = React.useState<FotoEventoEjecucion[]>([]);
  const [cargando, setCargando] = React.useState(true);
  const [guia, setGuia] = React.useState<ClaveMarcoFoto | null>(null);
  const [subiendo, setSubiendo] = React.useState<ClaveMarcoFoto | null>(null);
  const inputCamaraRef = React.useRef<HTMLInputElement | null>(null);
  const inputArchivoRef = React.useRef<HTMLInputElement | null>(null);
  const marcoPendiente = React.useRef<ClaveMarcoFoto | null>(null);

  const recargar = React.useCallback(() => {
    setCargando(true);
    listarFotosEvento(sesion.token)
      .then(setFotos)
      .catch((e) => toast.error(e instanceof Error ? e.message : "No se pudieron cargar las fotos."))
      .finally(() => setCargando(false));
  }, [sesion.token]);

  React.useEffect(recargar, [recargar]);

  // Solo las fotos de la sesión elegida (en sesión única, las del evento: `sesionId` nulo).
  const fotosDelAlcance = fotos.filter((f) => (esMultisesion ? f.sesionId === sesionElegida : !f.sesionId));
  const porMarco = new Map(fotosDelAlcance.map((f) => [f.etiqueta, f]));

  function abrirSelector(clave: ClaveMarcoFoto, origen: Origen) {
    marcoPendiente.current = clave;
    setGuia(null);
    (origen === "camara" ? inputCamaraRef : inputArchivoRef).current?.click();
  }

  async function alAportarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    const clave = marcoPendiente.current;
    if (!archivo || !clave) return;
    if (!archivo.type.startsWith("image/")) {
      toast.error("Elige una imagen (JPG o PNG).");
      return;
    }
    if (esMultisesion && !sesionElegida) {
      toast.error("Elige primero la sesión a la que corresponde la foto.");
      return;
    }
    const marco = MARCOS_FOTO.find((m) => m.clave === clave)!;
    setSubiendo(clave);
    try {
      const imagen = await comprimirImagen(archivo);
      const nombre = `${construirNombreBase({ tipo: `Foto ${marco.titulo}`, nombre: sesion.nombreEvento, fecha: new Date() })}.jpg`;
      await registrarFotoEvento(sesion.token, {
        etiqueta: clave,
        dataUrl: imagen.dataUrl,
        nombre,
        tipo: imagen.tipo,
        tamanoBytes: imagen.tamanoBytes,
        sesionId: esMultisesion ? sesionElegida : null,
      });
      toast.success(`Foto “${marco.titulo}” guardada.`);
      recargar();
    } catch (error) {
      const mensaje = error instanceof ErrorEjecucion && error.esFalloDeRed ? "Sin conexión: la foto no se pudo enviar. Inténtalo de nuevo cuando tengas internet." : error instanceof Error ? error.message : "No se pudo guardar la foto.";
      toast.error(mensaje);
    } finally {
      setSubiendo(null);
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-24" data-testid="pantalla-fotos">
      {esMultisesion && (
        <Card>
          <CardContent className="flex flex-col gap-1.5 pt-6">
            <Label htmlFor="fotos-sesion">Sesión a la que corresponden las fotos *</Label>
            <Select value={sesionElegida} onValueChange={setSesionElegida}>
              <SelectTrigger id="fotos-sesion" data-testid="fotos-sesion"><SelectValue placeholder="Selecciona una sesión" /></SelectTrigger>
              <SelectContent>
                {sesion.sesiones.map((s, i) => (
                  <SelectItem key={s.id} value={s.id}>
                    {`Sesión ${i + 1}`}{s.fecha ? ` — ${s.fecha}` : ""}{s.lugar ? ` · ${s.lugar}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fotos {esMultisesion ? "de la sesión" : "del evento"} ({fotosDelAlcance.length} de {MAX_FOTOS_EVENTO})</CardTitle>
          <CardDescription>Toca un marco para ver qué foto aportar: puedes tomarla con la cámara o cargarla desde un archivo. Puedes volver a aportarla si no quedó bien.</CardDescription>
        </CardHeader>
        <CardContent>
          <input ref={inputCamaraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={alAportarFoto} data-testid="input-foto-camara" />
          <input ref={inputArchivoRef} type="file" accept="image/*" className="hidden" onChange={alAportarFoto} data-testid="input-foto-archivo" />
          {cargando ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Cargando...</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {MARCOS_FOTO.map((m) => {
                const foto = porMarco.get(m.clave);
                return (
                  <button
                    key={m.clave}
                    type="button"
                    onClick={() => setGuia(m.clave)}
                    disabled={subiendo !== null || (esMultisesion && !sesionElegida)}
                    className="flex flex-col gap-1.5 rounded-lg border p-2 text-left transition-colors hover:border-primary/60 disabled:opacity-60"
                    data-testid={`marco-${m.clave}`}
                  >
                    <span className="flex items-center justify-between text-sm font-medium">
                      {m.titulo}
                      {foto && <CheckCircle2 className="size-4 text-status-approved-fg" />}
                    </span>
                    {foto ? (
                      <img src={foto.dataUrl} alt={m.titulo} className="aspect-[4/3] w-full rounded-md object-cover" />
                    ) : (
                      <MarcoFotoMuestra clave={m.clave} />
                    )}
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      {subiendo === m.clave ? <><Loader2 className="size-3 animate-spin" /> Guardando...</> : <><Camera className="size-3" /> {foto ? "Volver a aportar" : "Tomar o cargar foto"}</>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {guia && (
        <GuiaMarcoFoto
          clave={guia}
          abierto
          onCerrar={() => setGuia(null)}
          accion={
            <>
              <Button variant="outline" onClick={() => abrirSelector(guia, "archivo")} data-testid="foto-desde-archivo"><ImagePlus /> Cargar desde archivo</Button>
              <Button onClick={() => abrirSelector(guia, "camara")} data-testid="foto-desde-camara"><Camera /> Tomar foto</Button>
            </>
          }
        />
      )}

      <div className="fixed inset-x-0 bottom-0 border-t bg-background p-4">
        <Button variant="outline" className="h-11 w-full" onClick={onVolver}>Volver al menú</Button>
      </div>
    </div>
  );
}
