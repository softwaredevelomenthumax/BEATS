import { Building2, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCompania } from "@/hooks/useCompania";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoApp } from "@/components/LogoApp";
import { useLogoApp } from "@/hooks/useLogoApp";
import { AvatarUsuario } from "@/components/AvatarUsuario";

/**
 * Selector de compañía del grupo (pedido explícito, octubre 2026): pantalla
 * que se muestra después del login cuando el usuario tiene 2 o más
 * compañías habilitadas en `empresasGrupo` y todavía no eligió con cuál va
 * a trabajar en esta sesión/dispositivo — mismo peso visual que
 * `PantallaLogin.tsx` (logo, tarjeta centrada).
 */
export function SeleccionCompania() {
  const { usuario, cerrarSesion } = useAuth();
  const { fijarCompania } = useCompania();
  const { logoUrl, anchoPx, altoPx } = useLogoApp();

  if (!usuario) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-card px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2">
            <LogoApp logoUrl={logoUrl} anchoPx={anchoPx} altoPx={altoPx} anchoMax={220} nombreDeRespaldo />
          </div>
          {/* Entrega 33: la pantalla ya sabe quién inició sesión — se muestra su foto (iniciales si no tiene) y un saludo. */}
          <div className="flex flex-col items-center gap-1.5" data-testid="seleccion-compania-usuario">
            <AvatarUsuario usuarioId={usuario.id} nombre={usuario.nombre} iniciales={usuario.iniciales} className="size-16" fallbackClassName="bg-primary text-lg text-primary-foreground" />
            <p className="text-sm font-medium">Hola, {usuario.nombre}</p>
          </div>
          <CardTitle>¿Con qué compañía quieres trabajar?</CardTitle>
          <p className="text-sm text-muted-foreground">
            Tu usuario tiene acceso a varias compañías del grupo. Elige con cuál vas a trabajar — podrás cambiarla
            después sin cerrar sesión.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {usuario.empresasGrupo.map((empresa) => (
              <Button
                key={empresa}
                type="button"
                variant="outline"
                className="h-auto justify-start gap-2 py-3 text-left"
                onClick={() => fijarCompania(empresa)}
              >
                <Building2 className="h-4 w-4 shrink-0" />
                {empresa}
              </Button>
            ))}
          </div>
          <button
            type="button"
            className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => cerrarSesion()}
          >
            <LogOut className="h-3 w-3" />
            Cerrar sesión
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
