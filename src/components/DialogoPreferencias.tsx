import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { guardarMesesArchivadoLocal, mesesArchivadoEfectivo, OPCIONES_ARCHIVADO_MESES } from "@/lib/archivado";
import { guardarMisPreferencias } from "@/lib/usuarios";

/**
 * Entrega 28 — «Mis preferencias» (menú del avatar). Por ahora una sola: archivar automáticamente (= ocultar de la vista
 * normal del Tablero y de «Visor Documental») los documentos de eventos que terminaron hace más de N meses. Ver
 * `lib/archivado.ts` para las reglas (solo vista, reversible, nunca oculta lo que sigue en trámite).
 */
export function DialogoPreferencias({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const { usuario, recargarUsuario } = useAuth();
  const [meses, setMeses] = React.useState("0");
  const [guardando, setGuardando] = React.useState(false);

  React.useEffect(() => {
    if (abierto && usuario) setMeses(String(mesesArchivadoEfectivo(usuario)));
  }, [abierto, usuario]);

  if (!usuario) return null;
  const usuarioActual = usuario;

  async function guardar() {
    setGuardando(true);
    try {
      const valor = Number(meses);
      const { enPerfil } = await guardarMisPreferencias({ archivarDocumentosMeses: valor });
      if (enPerfil) {
        // Ya vive en el perfil: se retira la copia local para que no contradiga a la del perfil en otro equipo.
        guardarMesesArchivadoLocal(usuarioActual.id, null);
        await recargarUsuario();
        toast.success("Tus preferencias se guardaron.");
      } else {
        guardarMesesArchivadoLocal(usuarioActual.id, valor);
        toast.success("Preferencia guardada en este navegador.", {
          description: "Para que te siga a otros equipos, un administrador debe ejecutar db/entrega_28_preferencias_usuario.sql.",
        });
      }
      onCerrar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron guardar tus preferencias.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Mis preferencias</DialogTitle>
          <DialogDescription>Ajustes de visualización que solo cambian lo que ves tú.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="pref-archivar-meses">Archivar documentos de eventos finalizados hace más de…</Label>
          <Select value={meses} onValueChange={setMeses}>
            <SelectTrigger id="pref-archivar-meses" data-testid="pref-archivar-meses">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPCIONES_ARCHIVADO_MESES.map((o) => (
                <SelectItem key={o.valor} value={String(o.valor)}>
                  {o.etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Los documentos archivados salen de la vista normal del Tablero y de «Visor Documental», pero siguen ahí: los ves en cualquier momento
            con el filtro «Archivados» o «Todos». Nada se borra ni cambia de estado, y los documentos que siguen en trámite (borradores, pendientes
            de firma o devueltos) nunca se archivan.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando} data-testid="pref-guardar">
            {guardando ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
