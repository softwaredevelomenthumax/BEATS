import { useConfirmar } from "@/hooks/useConfirmar";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleCapsula } from "@/components/ui/toggle-capsula";
import { Accordion } from "@/components/ui/accordion";
import { SeccionAcordeon } from "@/components/forms/SeccionAcordeon";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useCatalogo } from "@/lib/catalogos";
import { traerPortafolioProductos, guardarProductoPortafolio, eliminarProductoPortafolio } from "@/lib/productos";
import { traerArchivos, traerArchivo, subirArchivo, type ArchivoAdjunto } from "@/lib/archivosAdjuntos";
import { construirNombreBase } from "@/lib/nombreArchivo";
import type { ProductoPortafolio } from "@/types";

const VACIO: Partial<ProductoPortafolio> = { nombre: "", registroSanitario: "", activo: true, orden: 0, empresaGrupo: "", lineaTerapeutica: "" };

function inicialesProducto(nombre: string) {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/**
 * Corrección (Configuración de Campos/Variables, septiembre 2026): pedido
 * explícito — "pon visible (muestra) el logo o foto de cada producto...
 * en la sección Portafolio de productos", en la lista de la izquierda.
 * Mismo componente `Avatar` que ya usa `TarjetaSpeaker` (Repositorio de
 * Speakers), con las fotos precargadas de una sola vez para toda la
 * lista (ver `recargar`).
 */
function AvatarLogoProducto({ archivo, nombre }: { archivo: ArchivoAdjunto | undefined; nombre: string }) {
  return (
    <Avatar className="h-10 w-10 shrink-0">
      {archivo && <AvatarImage src={archivo.dataUrl} alt={nombre} />}
      <AvatarFallback className="bg-[var(--sidebar-active-bg)] text-xs font-semibold text-[var(--brand-blue)]">
        {inicialesProducto(nombre) || "?"}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * Corrección (Configuración de Campos/Variables, septiembre 2026): pedido
 * explícito — "en la vista específica de un producto, aplica la misma
 * instrucción que aplicaste en el formulario de HCPs/Speakers, en el
 * sentido de que... el logo o foto del producto [se cargue] como un
 * avatar; es decir, que no hay que dar clic en Ver foto, sino que se
 * muestre de manera armónica en el formulario". Mismo patrón que
 * `AvatarFotoSpeaker` en `Speakers.tsx`: sube el archivo de inmediato
 * (mismo `subirArchivo` que usa `CampoArchivo` por dentro) y muestra el
 * círculo apenas termina de subir, sin esperar a guardar el formulario.
 */
function AvatarFotoProducto({
  valor,
  onChange,
  nombre,
}: {
  valor: string | null;
  onChange: (archivoId: string | null) => void;
  nombre: string;
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
      .then((a) => { if (!cancelado) setArchivo(a); })
      .catch(() => { if (!cancelado) setArchivo(null); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  async function manejarSeleccion(e: React.ChangeEvent<HTMLInputElement>) {
    const elegido = e.target.files?.[0];
    e.target.value = "";
    if (elegido) await cargarArchivo(elegido);
  }

  async function cargarArchivo(archivoSeleccionado: File) {
    if (subiendo) return;
    setSubiendo(true);
    try {
      const nombreSugerido = construirNombreBase({ tipo: "Logo", nombre, fecha: new Date() });
      const subido = await subirArchivo(archivoSeleccionado, { maxBytes: 3 * 1024 * 1024, nombreSugerido });
      setArchivo(subido);
      onChange(subido.id);
      toast.success("Logo cargado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cargar el logo.");
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
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
        title="Cargar logo o foto del producto"
      >
        <Avatar className="h-16 w-16">
          {archivo && <AvatarImage src={archivo.dataUrl} alt={nombre || "Logo del producto"} />}
          <AvatarFallback className="bg-[var(--sidebar-active-bg)] text-lg font-semibold text-[var(--brand-blue)]">
            {subiendo ? "…" : inicialesProducto(nombre) || "?"}
          </AvatarFallback>
        </Avatar>
        <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border bg-background">
          <Pencil className="h-2.5 w-2.5" />
        </span>
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={manejarSeleccion} disabled={subiendo} />
      <p className="text-[11px] text-muted-foreground">Arrastra la imagen aquí o haz clic para adjuntarla</p>
      {valor && (
        <button type="button" className="text-[11px] text-muted-foreground underline" onClick={() => onChange(null)}>
          Quitar logo
        </button>
      )}
      </div>
    </div>
  );
}

export function EditorPortafolioProductos() {
  const { opciones: empresas } = useCatalogo("empresasGrupo");
  const { opciones: lineas } = useCatalogo("lineasTerapeuticas");
  const [productos, setProductos] = React.useState<ProductoPortafolio[]>([]);
  const [logos, setLogos] = React.useState<Map<string, ArchivoAdjunto>>(new Map());
  const [cargando, setCargando] = React.useState(true);
  const [abierto, setAbierto] = React.useState(false);
  const [editando, setEditando] = React.useState<Partial<ProductoPortafolio>>(VACIO);

  function recargar() {
    setCargando(true);
    traerPortafolioProductos()
      .then((lista) => {
        setProductos(lista);
        // Logos: se cargan de una sola vez para toda la lista (mismo patrón
        // que las fotos de perfil en Speakers.tsx) — son el avatar de cada
        // fila, así que deben estar listos desde el primer render.
        const idsLogo = lista.map((p) => p.logoId).filter((id): id is string => !!id);
        return traerArchivos(idsLogo).then(setLogos);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "No se pudo cargar el portafolio."))
      .finally(() => setCargando(false));
  }

  React.useEffect(recargar, []);

  async function guardar() {
    if (!editando.nombre?.trim()) {
      toast.error("El nombre del producto es obligatorio.");
      return;
    }
    // Entrega 31: Registro sanitario, Empresa y Línea son obligatorios.
    if (!editando.registroSanitario?.trim()) {
      toast.error("El registro sanitario es obligatorio.");
      return;
    }
    if (!editando.empresaGrupo?.trim()) {
      toast.error("La empresa es obligatoria.");
      return;
    }
    if (!editando.lineaTerapeutica?.trim()) {
      toast.error("La línea es obligatoria.");
      return;
    }
    try {
      await guardarProductoPortafolio(editando);
      toast.success("Producto guardado.");
      setAbierto(false);
      recargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    }
  }

  const confirmar = useConfirmar();
  async function eliminar(p: ProductoPortafolio) {
    if (!(await confirmar({ titulo: "Eliminar producto", mensaje: `¿Eliminar el producto "${p.nombre}"? Esta acción no se puede deshacer.` }))) return;
    try {
      await eliminarProductoPortafolio(p.id);
      toast.success("Producto eliminado.");
      recargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar.");
    }
  }

  async function alternarActivo(p: ProductoPortafolio) {
    try {
      await guardarProductoPortafolio({ ...p, activo: !p.activo });
      recargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar.");
    }
  }

  return (
    <>
    <Accordion type="single" collapsible defaultValue="portafolio-productos" className="flex flex-col gap-3">
      <SeccionAcordeon
        value="portafolio-productos"
        titulo="Portafolio de Productos"
        descripcion='Productos disponibles como "muestras planeadas" en la Solicitud de Evento.'
        accionesHeader={
          <Button size="sm" onClick={() => { setEditando(VACIO); setAbierto(true); }}>
            <Plus /> Nuevo producto
          </Button>
        }
      >
        {cargando && <p className="text-sm text-muted-foreground">Cargando...</p>}
        {!cargando && productos.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay productos en el portafolio.</p>}
        <div className="flex flex-col gap-2">
          {productos.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
              <div className="flex items-center gap-3">
                <AvatarLogoProducto archivo={p.logoId ? logos.get(p.logoId) : undefined} nombre={p.nombre} />
                <div>
                  <span className={p.activo ? "font-medium" : "font-medium text-muted-foreground line-through"}>{p.nombre}</span>{" "}
                  <span className="text-muted-foreground">
                    ({p.empresaGrupo || "todas las empresas"}{p.lineaTerapeutica ? ` · ${p.lineaTerapeutica}` : ""}{p.registroSanitario ? ` · reg. ${p.registroSanitario}` : ""})
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ToggleCapsula
                  value={p.activo ? "si" : "no"}
                  onValueChange={() => alternarActivo(p)}
                  opciones={[
                    { value: "no", label: "Inactivo" },
                    { value: "si", label: "Activo" },
                  ]}
                />
                <Button size="icon" variant="ghost" onClick={() => { setEditando(p); setAbierto(true); }}><Pencil /></Button>
                <Button size="icon" variant="ghost" onClick={() => eliminar(p)}><Trash2 /></Button>
              </div>
            </div>
          ))}
        </div>
      </SeccionAcordeon>
    </Accordion>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        {/* AJUSTES (septiembre/octubre 2026), pedido explícito: "Armoniza el
            ancho de todas las ventanas de los formularios" y "Valida que
            quede funcional [el bloqueo de cierre accidental] en todos los
            formularios" — ver los comentarios completos en
            `UsuariosRoles.tsx`. */}
        <DialogContent
          className="w-[calc(100vw-2rem)] max-w-3xl"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{editando.id ? "Editar producto" : "Nuevo producto"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="prod-nombre">Nombre *</Label>
              <Input id="prod-nombre" value={editando.nombre ?? ""} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="prod-registro">Registro sanitario *</Label>
              <Input id="prod-registro" value={editando.registroSanitario ?? ""} onChange={(e) => setEditando({ ...editando, registroSanitario: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="prod-orden">Orden</Label>
              <Input id="prod-orden" type="number" min={0} value={editando.orden ?? 0} onChange={(e) => setEditando({ ...editando, orden: Math.max(0, Number(e.target.value)) })} />
            </div>
            <div className="col-span-2 flex flex-col items-center gap-1.5">
              <Label>Logo</Label>
              <AvatarFotoProducto
                valor={editando.logoId ?? null}
                onChange={(id) => setEditando({ ...editando, logoId: id })}
                nombre={editando.nombre ?? ""}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="prod-empresa">Empresa *</Label>
              <Select value={editando.empresaGrupo || ""} onValueChange={(v) => setEditando({ ...editando, empresaGrupo: v })}>
                <SelectTrigger id="prod-empresa"><SelectValue placeholder="Selecciona la empresa" /></SelectTrigger>
                <SelectContent>
                  {empresas.map((e) => (
                    <SelectItem key={e} value={e}>{e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="prod-linea">Línea *</Label>
              <Select value={editando.lineaTerapeutica || ""} onValueChange={(v) => setEditando({ ...editando, lineaTerapeutica: v })}>
                <SelectTrigger id="prod-linea"><SelectValue placeholder="Selecciona la línea" /></SelectTrigger>
                <SelectContent>
                  {lineas.map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                  {editando.lineaTerapeutica && !lineas.includes(editando.lineaTerapeutica) && (
                    <SelectItem value={editando.lineaTerapeutica}>{editando.lineaTerapeutica}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={guardar}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
