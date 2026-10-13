import * as React from "react";
import { toast } from "sonner";
import { Trash2, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputPassword } from "@/components/ui/input-password";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { contarAuditoriaPorRango, eliminarAuditoriaPorRango } from "@/lib/documentosRpc";

/** `datetime-local` entrega hora local sin zona; se convierte a ISO (con zona) para el servidor. */
function aIso(valorLocal: string): string {
  return new Date(valorLocal).toISOString();
}

function formatearLocal(valorLocal: string): string {
  return new Date(valorLocal).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Octubre 2026 — "Gestión Avanzada de Documentos": eliminar el log de
 * auditoría de un rango de fecha y hora (desde/hasta), sin dejar rastro y con
 * la contraseña de quien elimina como confirmación. La función del servidor
 * (`db/agregar_rpc_eliminar_auditoria_rango.sql`) valida el permiso individual.
 */
export function EliminarAuditoriaRango() {
  const { verificarPasswordActual } = useAuth();
  const [desde, setDesde] = React.useState("");
  const [hasta, setHasta] = React.useState("");
  const [cantidad, setCantidad] = React.useState<number | null>(null);
  const [confirmando, setConfirmando] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [procesando, setProcesando] = React.useState(false);

  const rangoValido = Boolean(desde && hasta && new Date(desde).getTime() <= new Date(hasta).getTime());
  const rangoInvertido = Boolean(desde && hasta && !rangoValido);

  async function contar() {
    if (!rangoValido) return;
    setProcesando(true);
    try {
      setCantidad(await contarAuditoriaPorRango(aIso(desde), aIso(hasta)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo contar los registros.");
    } finally {
      setProcesando(false);
    }
  }

  async function confirmar() {
    if (!rangoValido) return;
    if (!password.trim()) {
      toast.error("Ingresa tu contraseña para confirmar.");
      return;
    }
    setProcesando(true);
    try {
      if (!(await verificarPasswordActual(password))) {
        toast.error("Contraseña incorrecta.");
        return;
      }
      const n = await eliminarAuditoriaPorRango(aIso(desde), aIso(hasta));
      toast.success(`Se eliminaron ${n} registro(s) de auditoría, sin dejar rastro.`);
      setConfirmando(false);
      setPassword("");
      setCantidad(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar el log de auditoría.");
    } finally {
      setProcesando(false);
    }
  }

  return (
    <Card className="border-destructive/40" data-testid="eliminar-auditoria">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <ScrollText className="h-5 w-5" /> Eliminar registros de auditoría
        </CardTitle>
        <CardDescription>
          Elimina del log de auditoría los registros ocurridos entre dos fechas y horas (ambas incluidas), sin dejar
          rastro de esta eliminación. Es irreversible y pide tu contraseña como confirmación.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="auditoria-desde">Desde (fecha y hora) *</Label>
            <Input id="auditoria-desde" type="datetime-local" value={desde} onChange={(e) => { setDesde(e.target.value); setCantidad(null); }} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="auditoria-hasta">Hasta (fecha y hora) *</Label>
            <Input id="auditoria-hasta" type="datetime-local" value={hasta} onChange={(e) => { setHasta(e.target.value); setCantidad(null); }} />
          </div>
        </div>
        {rangoInvertido && <p className="text-xs text-destructive">"Desde" debe ser anterior o igual a "Hasta".</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={!rangoValido || procesando} onClick={contar}>
            Contar registros del rango
          </Button>
          {cantidad !== null && (
            <span className="text-sm text-muted-foreground" data-testid="auditoria-cantidad">
              {cantidad} registro(s) en el rango.
            </span>
          )}
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={!rangoValido || procesando}
            onClick={() => {
              setPassword("");
              setConfirmando(true);
            }}
          >
            <Trash2 className="h-4 w-4" /> Eliminar registros del rango
          </Button>
        </div>
      </CardContent>

      <Dialog open={confirmando} onOpenChange={(v) => !v && setConfirmando(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar eliminación del log de auditoría</DialogTitle>
            <DialogDescription>
              Vas a eliminar de forma permanente todos los registros de auditoría entre{" "}
              {desde && formatearLocal(desde)} y {hasta && formatearLocal(hasta)}, sin que quede registro de ello.
              Ingresa tu contraseña para confirmar.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password-confirmacion-auditoria">Tu contraseña</Label>
            <InputPassword id="password-confirmacion-auditoria" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmando(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={procesando} onClick={confirmar}>
              Confirmar eliminación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
