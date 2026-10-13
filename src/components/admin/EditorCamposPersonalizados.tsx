import { useConfirmar } from "@/hooks/useConfirmar";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleCapsula } from "@/components/ui/toggle-capsula";
import { Accordion } from "@/components/ui/accordion";
import { SeccionAcordeon } from "@/components/forms/SeccionAcordeon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCatalogo } from "@/lib/catalogos";
import { TIPO_DOC, ETIQUETA_TIPO_DOC } from "@/lib/enums";
import {
  TIPO_CAMPO_PERSONALIZADO,
  OPERADOR_CALCULADO,
  traerCamposPersonalizados,
  guardarCampoPersonalizado,
  eliminarCampoPersonalizado,
  type CampoPersonalizadoDefinicion,
} from "@/lib/camposPersonalizados";

const VACIO: Partial<CampoPersonalizadoDefinicion> = {
  formulario: "caf",
  clave: "",
  etiqueta: "",
  tipo: "texto",
  opciones: [],
  obligatorio: false,
  activo: true,
  empresaGrupo: "",
  pais: "",
  orden: 0,
  seccion: "",
  anclaCampo: "",
  calculadoOperador: "",
  calculadoCampoA: "",
  calculadoCampoB: "",
};

export function EditorCamposPersonalizados() {
  const { usuario } = useAuth();
  const [campos, setCampos] = React.useState<CampoPersonalizadoDefinicion[]>([]);
  const [cargando, setCargando] = React.useState(true);
  const [abierto, setAbierto] = React.useState(false);
  const [editando, setEditando] = React.useState<Partial<CampoPersonalizadoDefinicion>>(VACIO);
  const { opciones: empresas } = useCatalogo("empresasGrupo");

  function recargar() {
    setCargando(true);
    traerCamposPersonalizados()
      .then(setCampos)
      .catch((e) => toast.error(e instanceof Error ? e.message : "No se pudieron cargar los campos personalizados."))
      .finally(() => setCargando(false));
  }

  React.useEffect(recargar, []);

  function abrirNuevo() {
    setEditando(VACIO);
    setAbierto(true);
  }

  function abrirEdicion(campo: CampoPersonalizadoDefinicion) {
    setEditando(campo);
    setAbierto(true);
  }

  async function guardar() {
    if (!usuario) return;
    if (!editando.clave?.trim() || !editando.etiqueta?.trim()) {
      toast.error("La clave y la etiqueta son obligatorias.");
      return;
    }
    try {
      await guardarCampoPersonalizado(editando, usuario.id);
      toast.success("Campo personalizado guardado.");
      setAbierto(false);
      recargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    }
  }

  const confirmar = useConfirmar();
  async function eliminar(id: string) {
    if (!(await confirmar({ titulo: "Eliminar campo", mensaje: "¿Eliminar este campo personalizado? Esta acción no se puede deshacer." }))) return;
    try {
      await eliminarCampoPersonalizado(id);
      toast.success("Campo eliminado.");
      recargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar.");
    }
  }

  return (
    <>
    <Accordion type="single" collapsible defaultValue="campos-personalizados" className="flex flex-col gap-3">
      <SeccionAcordeon
        value="campos-personalizados"
        titulo="Campos Personalizados"
        descripcion="Campos adicionales, no incluidos originalmente en cada formulario, definibles por tipo de documento, empresa y país."
        accionesHeader={
          <Button size="sm" onClick={abrirNuevo}>
            <Plus /> Nuevo campo
          </Button>
        }
      >
        {cargando && <p className="text-sm text-muted-foreground">Cargando...</p>}
        {!cargando && campos.length === 0 && (
          <p className="text-sm text-muted-foreground">Todavía no hay campos personalizados definidos.</p>
        )}
        <div className="flex flex-col gap-2">
          {campos.map((campo) => (
            <div key={campo.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
              <div>
                <span className="font-medium">{campo.etiqueta}</span>{" "}
                <span className="text-muted-foreground">
                  ({ETIQUETA_TIPO_DOC[campo.formulario]} · {campo.tipo} · {campo.empresaGrupo || "todas las empresas"})
                </span>
                {!campo.activo && <span className="ml-2 text-xs text-destructive">inactivo</span>}
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => abrirEdicion(campo)}>
                  <Pencil />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => eliminar(campo.id)}>
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
            ancho de todas las ventanas de los formularios" — ver el
            comentario en `UsuariosRoles.tsx` (mismo patrón de cuadrícula de 2
            columnas, mismo ancho `max-w-2xl` en todos los diálogos de
            formulario de la app) — y "Valida que quede funcional [el
            bloqueo de cierre accidental] en todos los formularios" (ver el
            comentario completo del bloqueo en `UsuariosRoles.tsx`). */}
        <DialogContent
          className="w-[calc(100vw-2rem)] max-w-3xl"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{editando.id ? "Editar campo personalizado" : "Nuevo campo personalizado"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cpd-formulario">Formulario</Label>
              <Select value={editando.formulario} onValueChange={(v) => setEditando({ ...editando, formulario: v as CampoPersonalizadoDefinicion["formulario"] })}>
                <SelectTrigger id="cpd-formulario"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPO_DOC.map((t) => (
                    <SelectItem key={t} value={t}>{ETIQUETA_TIPO_DOC[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cpd-tipo">Tipo de campo</Label>
              <Select value={editando.tipo} onValueChange={(v) => setEditando({ ...editando, tipo: v as CampoPersonalizadoDefinicion["tipo"] })}>
                <SelectTrigger id="cpd-tipo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPO_CAMPO_PERSONALIZADO.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cpd-clave">Clave (identificador interno)</Label>
              <Input id="cpd-clave" value={editando.clave ?? ""} onChange={(e) => setEditando({ ...editando, clave: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cpd-etiqueta">Etiqueta visible</Label>
              <Input id="cpd-etiqueta" value={editando.etiqueta ?? ""} onChange={(e) => setEditando({ ...editando, etiqueta: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cpd-seccion">Sección del formulario</Label>
              <Input id="cpd-seccion" value={editando.seccion ?? ""} onChange={(e) => setEditando({ ...editando, seccion: e.target.value })} placeholder="p.ej. financiero" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cpd-empresa">Empresa (vacío = todas)</Label>
              <Select value={editando.empresaGrupo || "__todas__"} onValueChange={(v) => setEditando({ ...editando, empresaGrupo: v === "__todas__" ? "" : v })}>
                <SelectTrigger id="cpd-empresa"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todas__">Todas las empresas</SelectItem>
                  {empresas.map((e) => (
                    <SelectItem key={e} value={e}>{e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cpd-pais">País (vacío = todos)</Label>
              <Input id="cpd-pais" value={editando.pais ?? ""} onChange={(e) => setEditando({ ...editando, pais: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cpd-orden">Orden</Label>
              <Input id="cpd-orden" type="number" min={0} value={editando.orden ?? 0} onChange={(e) => setEditando({ ...editando, orden: Math.max(0, Number(e.target.value)) })} />
            </div>
            {editando.tipo === "seleccion" && (
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="cpd-opciones">Opciones (separadas por coma)</Label>
                <Input
                  id="cpd-opciones"
                  value={(editando.opciones ?? []).join(", ")}
                  onChange={(e) => setEditando({ ...editando, opciones: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                />
              </div>
            )}
            {editando.tipo === "calculado" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cpd-operador">Operador</Label>
                  <Select value={editando.calculadoOperador || undefined} onValueChange={(v) => setEditando({ ...editando, calculadoOperador: v as CampoPersonalizadoDefinicion["calculadoOperador"] })}>
                    <SelectTrigger id="cpd-operador"><SelectValue placeholder="Selecciona" /></SelectTrigger>
                    <SelectContent>
                      {OPERADOR_CALCULADO.map((op) => (
                        <SelectItem key={op} value={op}>{op}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cpd-campo-a">Campo A (clave)</Label>
                  <Input id="cpd-campo-a" value={editando.calculadoCampoA ?? ""} onChange={(e) => setEditando({ ...editando, calculadoCampoA: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cpd-campo-b">Campo B (clave)</Label>
                  <Input id="cpd-campo-b" value={editando.calculadoCampoB ?? ""} onChange={(e) => setEditando({ ...editando, calculadoCampoB: e.target.value })} />
                </div>
              </>
            )}
            <div className="flex flex-col gap-1.5">
              <Label>Obligatorio</Label>
              <ToggleCapsula
                value={editando.obligatorio ?? false ? "si" : "no"}
                onValueChange={(v) => setEditando({ ...editando, obligatorio: v === "si" })}
                opciones={[
                  { value: "no", label: "No" },
                  { value: "si", label: "Sí" },
                ]}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Activo</Label>
              <ToggleCapsula
                value={editando.activo ?? true ? "si" : "no"}
                onValueChange={(v) => setEditando({ ...editando, activo: v === "si" })}
                opciones={[
                  { value: "no", label: "Inactivo" },
                  { value: "si", label: "Activo" },
                ]}
              />
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
