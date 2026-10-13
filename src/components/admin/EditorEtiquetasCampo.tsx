import { useConfirmar } from "@/hooks/useConfirmar";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Accordion } from "@/components/ui/accordion";
import { SeccionAcordeon } from "@/components/forms/SeccionAcordeon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCatalogo } from "@/lib/catalogos";
import { TIPO_DOC, ETIQUETA_TIPO_DOC } from "@/lib/enums";
import {
  traerEtiquetasCampo,
  guardarEtiquetaCampo,
  eliminarEtiquetaCampo,
  type EtiquetaCampo,
} from "@/lib/etiquetasCampo";
import { ETIQUETA_CAMPO_CAF } from "@/components/forms/FormularioCAF";

const ETIQUETAS_ORIGINALES_POR_FORMULARIO: Record<string, Record<string, string>> = {
  caf: ETIQUETA_CAMPO_CAF,
};

const VACIO: EtiquetaCampo = {
  formulario: "caf",
  campoKey: "",
  etiqueta: "",
  empresaGrupo: "",
  actualizadoPorId: null,
  actualizadoEn: "",
};

export function EditorEtiquetasCampo() {
  const { usuario } = useAuth();
  const [etiquetas, setEtiquetas] = React.useState<EtiquetaCampo[]>([]);
  const [cargando, setCargando] = React.useState(true);
  const [abierto, setAbierto] = React.useState(false);
  const [editando, setEditando] = React.useState<EtiquetaCampo>(VACIO);
  const { opciones: empresas } = useCatalogo("empresasGrupo");

  function recargar() {
    setCargando(true);
    traerEtiquetasCampo()
      .then(setEtiquetas)
      .catch((e) => toast.error(e instanceof Error ? e.message : "No se pudieron cargar las etiquetas."))
      .finally(() => setCargando(false));
  }

  React.useEffect(recargar, []);

  const camposOriginalesDisponibles = Object.entries(ETIQUETAS_ORIGINALES_POR_FORMULARIO[editando.formulario] ?? {});

  async function guardar() {
    if (!usuario) return;
    if (!editando.campoKey || !editando.etiqueta.trim()) {
      toast.error("Selecciona el campo y escribe la nueva etiqueta.");
      return;
    }
    try {
      await guardarEtiquetaCampo(editando, usuario.id);
      toast.success("Etiqueta guardada.");
      setAbierto(false);
      recargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    }
  }

  const confirmar = useConfirmar();
  async function eliminar(etiqueta: EtiquetaCampo) {
    if (!(await confirmar({ titulo: "Eliminar etiqueta", mensaje: "¿Eliminar esta etiqueta personalizada? Se restaurará el nombre original." }))) return;
    try {
      await eliminarEtiquetaCampo(etiqueta);
      toast.success("Etiqueta eliminada — se restaura el nombre original.");
      recargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar.");
    }
  }

  return (
    <>
    <Accordion type="single" collapsible defaultValue="etiquetas-campo" className="flex flex-col gap-3">
      <SeccionAcordeon
        value="etiquetas-campo"
        titulo="Etiquetas de Campos"
        descripcion="Renombra campos que ya existen en cada formulario, de forma global o por empresa."
        accionesHeader={
          <Button size="sm" onClick={() => { setEditando(VACIO); setAbierto(true); }}>
            <Plus /> Nueva etiqueta
          </Button>
        }
      >
        {cargando && <p className="text-sm text-muted-foreground">Cargando...</p>}
        {!cargando && etiquetas.length === 0 && (
          <p className="text-sm text-muted-foreground">Todavía no hay etiquetas personalizadas.</p>
        )}
        <div className="flex flex-col gap-2">
          {etiquetas.map((e) => (
            <div key={`${e.formulario}-${e.campoKey}-${e.empresaGrupo}`} className="flex items-center justify-between rounded-md border p-2 text-sm">
              <div>
                <span className="font-medium">{e.etiqueta}</span>{" "}
                <span className="text-muted-foreground">
                  ({ETIQUETA_TIPO_DOC[e.formulario]} · {e.campoKey} · {e.empresaGrupo || "todas las empresas"})
                </span>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => { setEditando(e); setAbierto(true); }}>
                  <Pencil />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => eliminar(e)}>
                  <Trash2 />
                </Button>
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
            <DialogTitle>Etiqueta de campo</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="etq-formulario">Formulario</Label>
              <Select value={editando.formulario} onValueChange={(v) => setEditando({ ...editando, formulario: v as EtiquetaCampo["formulario"], campoKey: "" })}>
                <SelectTrigger id="etq-formulario"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPO_DOC.filter((t) => ETIQUETAS_ORIGINALES_POR_FORMULARIO[t]).map((t) => (
                    <SelectItem key={t} value={t}>{ETIQUETA_TIPO_DOC[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="etq-campo">Campo original</Label>
              <Select value={editando.campoKey} onValueChange={(v) => setEditando({ ...editando, campoKey: v })}>
                <SelectTrigger id="etq-campo"><SelectValue placeholder="Selecciona un campo" /></SelectTrigger>
                <SelectContent>
                  {camposOriginalesDisponibles.map(([clave, etiquetaOriginal]) => (
                    <SelectItem key={clave} value={clave}>{etiquetaOriginal}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="etq-etiqueta">Nueva etiqueta</Label>
              <Input id="etq-etiqueta" value={editando.etiqueta} onChange={(e) => setEditando({ ...editando, etiqueta: e.target.value })} />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="etq-empresa">Empresa (vacío = todas)</Label>
              <Select value={editando.empresaGrupo || "__todas__"} onValueChange={(v) => setEditando({ ...editando, empresaGrupo: v === "__todas__" ? "" : v })}>
                <SelectTrigger id="etq-empresa"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todas__">Todas las empresas</SelectItem>
                  {empresas.map((e) => (
                    <SelectItem key={e} value={e}>{e}</SelectItem>
                  ))}
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
