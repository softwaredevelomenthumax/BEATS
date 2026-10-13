import * as React from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { InputPassword } from "@/components/ui/input-password";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AvatarUsuario } from "@/components/AvatarUsuario";

const LONGITUD_MINIMA = 8;

export function PantallaCambioPasswordForzado() {
  const { usuario, cambiarPasswordForzado, cerrarSesion } = useAuth();
  const [nueva, setNueva] = React.useState("");
  const [confirmar, setConfirmar] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);

  async function manejarEnvio(e: React.FormEvent) {
    e.preventDefault();
    if (nueva.length < LONGITUD_MINIMA) {
      toast.error(`La contraseña debe tener al menos ${LONGITUD_MINIMA} caracteres.`);
      return;
    }
    if (nueva !== confirmar) {
      toast.error("Las contraseñas no coinciden.");
      return;
    }
    setEnviando(true);
    try {
      await cambiarPasswordForzado(nueva);
      toast.success("Contraseña actualizada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar la contraseña.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          {usuario && (
            <div className="mb-1 flex items-center gap-3">
              <AvatarUsuario usuarioId={usuario.id} nombre={usuario.nombre} iniciales={usuario.iniciales} className="size-12" fallbackClassName="bg-primary text-primary-foreground" />
              <span className="text-sm font-medium">{usuario.nombre}</span>
            </div>
          )}
          <CardTitle>Debes cambiar tu contraseña</CardTitle>
          <CardDescription>
            Por seguridad, elige una nueva contraseña antes de continuar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={manejarEnvio}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nueva">Nueva contraseña</Label>
              <InputPassword
                id="nueva"
                autoComplete="new-password"
                required
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirmar">Confirmar contraseña</Label>
              <InputPassword
                id="confirmar"
                autoComplete="new-password"
                required
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={enviando} className="mt-2">
              {enviando ? "Guardando..." : "Guardar y continuar"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => cerrarSesion()}>
              Cerrar sesión
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
