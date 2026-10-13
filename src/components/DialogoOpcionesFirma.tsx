import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import {
  actualizarMisOpcionesFirma,
  rolPuedeSerComplianceLatam,
  traerDirectorioUsuarios,
  type EntradaDirectorio,
} from "@/lib/usuarios";

const SIN_JEFE = "__ninguno__";

/**
 * Entrega 23 (octubre 2026) — "Mis opciones de firma": cada colaborador ajusta, desde el menú de
 * su avatar, las opciones que le permiten firmar las líneas del CAF sin tener que esperar a otra
 * persona:
 *   - Jefe inmediato (otro colaborador o él mismo) y "Firma como jefe inmediato".
 *   - "Firma como director de área" (aunque no sea director de área). Si ya es director de área
 *     (lo define Dirección Médica / un Administrador) se muestra solo como información.
 *   - "Firma como Compliance Officer LATAM" (solo roles Compliance y Legal & Compliance).
 * Un Administrador puede ajustar los mismos valores de cualquier usuario en "Usuarios y Roles".
 * El guardado pasa por el RPC `actualizar_mis_opciones_firma`: solo toca estas columnas de su
 * propia fila.
 */
export function DialogoOpcionesFirma({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const { usuario, recargarUsuario } = useAuth();
  const [directorio, setDirectorio] = React.useState<EntradaDirectorio[]>([]);
  const [jefeId, setJefeId] = React.useState("");
  const [firmaJefe, setFirmaJefe] = React.useState(false);
  const [firmaDirector, setFirmaDirector] = React.useState(false);
  const [firmaLatam, setFirmaLatam] = React.useState(false);
  const [guardando, setGuardando] = React.useState(false);

  // Cada vez que se abre, se parte de lo que hoy tiene guardado el usuario.
  React.useEffect(() => {
    if (!abierto || !usuario) return;
    setJefeId(usuario.jefeInmediatoId);
    setFirmaJefe(usuario.firmaComoJefeInmediato);
    setFirmaDirector(usuario.firmaComoDirectorArea);
    setFirmaLatam(usuario.firmaComoComplianceLatam);
    traerDirectorioUsuarios()
      .then(setDirectorio)
      .catch((e) => toast.error(e instanceof Error ? e.message : "No se pudo cargar la lista de colaboradores."));
  }, [abierto, usuario]);

  if (!usuario) return null;
  const puedeLatam = rolPuedeSerComplianceLatam(usuario.rol);
  const hayJefe = Boolean(jefeId);

  async function guardar() {
    setGuardando(true);
    try {
      await actualizarMisOpcionesFirma({
        jefeInmediatoId: jefeId,
        firmaComoJefeInmediato: hayJefe && firmaJefe,
        firmaComoDirectorArea: firmaDirector,
        firmaComoComplianceLatam: puedeLatam && firmaLatam,
      });
      await recargarUsuario();
      toast.success("Tus opciones de firma se guardaron.");
      onCerrar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron guardar tus opciones de firma.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Mis opciones de firma</DialogTitle>
          <DialogDescription>
            Define cómo firmas las líneas "Jefe inmediato", "Director de área" y "Compliance Officer LATAM" del CAF. Si tú mismo eres quien
            firma una línea, el sistema no se la envía a otra persona.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mof-jefe">Jefe inmediato</Label>
            <Select
              value={jefeId || SIN_JEFE}
              onValueChange={(v) => {
                setJefeId(v === SIN_JEFE ? "" : v);
                if (v === SIN_JEFE) setFirmaJefe(false);
              }}
            >
              <SelectTrigger id="mof-jefe"><SelectValue placeholder="Sin jefe cargado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_JEFE}>Sin jefe cargado</SelectItem>
                {directorio.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nombre}{p.id === usuario.id ? " (yo)" : ""}{p.cargo ? ` — ${p.cargo}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Puedes elegirte a ti mismo para autofirmar la línea "Jefe inmediato".</p>
          </div>

          <div className="flex flex-col gap-2 rounded-md border p-3">
            <label className={`flex items-center gap-2 text-sm ${hayJefe ? "" : "text-muted-foreground"}`}>
              <Checkbox disabled={!hayJefe} checked={hayJefe && firmaJefe} onCheckedChange={(c) => setFirmaJefe(c === true)} />
              Firmo como jefe inmediato {!hayJefe && "(primero elige un jefe inmediato)"}
            </label>

            {usuario.esDirectorArea ? (
              <p className="text-sm text-muted-foreground">
                Eres director de área{usuario.area ? ` (${usuario.area})` : ""}: firmas esa línea por defecto. Dirección Médica o un Administrador pueden cambiarlo.
              </p>
            ) : (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={firmaDirector} onCheckedChange={(c) => setFirmaDirector(c === true)} />
                Firmo como director de área (aunque no sea director de área)
              </label>
            )}

            {puedeLatam && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={firmaLatam} onCheckedChange={(c) => setFirmaLatam(c === true)} />
                Firmo como Compliance Officer LATAM
              </label>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button disabled={guardando} onClick={guardar}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
