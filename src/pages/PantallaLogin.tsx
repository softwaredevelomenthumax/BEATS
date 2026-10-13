import * as React from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputEmail } from "@/components/ui/input-email";
import { normalizarEmail } from "@/lib/normalizarTexto";
import { InputPassword } from "@/components/ui/input-password";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { LogoApp } from "@/components/LogoApp";
import { useLogoApp } from "@/hooks/useLogoApp";
import { solicitarRestablecimientoPassword } from "@/lib/usuarios";

// Fase 8 (hallazgo grande): el original exige resolver un reto matemático
// simple ("¿cuánto es A+B?") antes de dejar enviar el formulario de login —
// una verificación de seguridad básica que esta reconstrucción no tenía.
// Confirmado por extracción directa del bundle original
// (referencia/bundle_original.html, función `Tm()`): A y B son enteros
// aleatorios entre 1 y 9; se genera un reto nuevo al montar el formulario,
// y también tras CUALQUIER intento fallido (respuesta de captcha
// incorrecta o credenciales incorrectas) para que no se pueda reintentar
// con el mismo reto ya resuelto.
function generarRetoCaptcha() {
  const a = 1 + Math.floor(Math.random() * 9);
  const b = 1 + Math.floor(Math.random() * 9);
  return { a, b, respuesta: a + b };
}

export function PantallaLogin() {
  const { iniciarSesion } = useAuth();
  const { logoUrl, anchoPx, altoPx } = useLogoApp();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);
  const [reto, setReto] = React.useState(() => generarRetoCaptcha());
  const [respuestaCaptcha, setRespuestaCaptcha] = React.useState("");
  const [errorLogin, setErrorLogin] = React.useState("");

  const [abiertoOlvide, setAbiertoOlvide] = React.useState(false);
  const [correoOlvide, setCorreoOlvide] = React.useState("");
  const [enviandoOlvide, setEnviandoOlvide] = React.useState(false);

  function otroReto() {
    setReto(generarRetoCaptcha());
    setRespuestaCaptcha("");
  }

  async function manejarEnvio(e: React.FormEvent) {
    e.preventDefault();
    setErrorLogin("");

    if (Number(respuestaCaptcha) !== reto.respuesta) {
      setErrorLogin("La verificación de seguridad no coincide. Intenta de nuevo.");
      otroReto();
      return;
    }
    if (!email.trim() || !password) {
      setErrorLogin("Ingresa tu correo y tu contraseña.");
      return;
    }

    setEnviando(true);
    try {
      await iniciarSesion(normalizarEmail(email), password);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : "Usuario o contraseña incorrectos.";
      setErrorLogin(mensaje);
      toast.error(mensaje);
      otroReto();
    } finally {
      setEnviando(false);
    }
  }

  async function solicitarOlvide() {
    if (!correoOlvide.trim()) return;
    setEnviandoOlvide(true);
    try {
      await solicitarRestablecimientoPassword(correoOlvide);
      toast.success("Si el correo existe, un administrador restablecerá tu contraseña en breve.");
      setAbiertoOlvide(false);
      setCorreoOlvide("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo enviar la solicitud.");
    } finally {
      setEnviandoOlvide(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-card px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2">
            <LogoApp logoUrl={logoUrl} anchoPx={anchoPx} altoPx={altoPx} anchoMax={220} nombreDeRespaldo />
          </div>
          <CardTitle>Iniciar sesión</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={manejarEnvio}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Correo electrónico</Label>
              <InputEmail
                id="email"
                autoComplete="username"
                required
                placeholder="tu.nombre@bauschhealth.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <InputPassword
                id="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5 rounded-md border bg-accent p-3">
              <Label htmlFor="login-captcha" className="flex items-center gap-1.5 text-xs text-accent-foreground">
                Verificación de seguridad — ¿cuánto es {reto.a} + {reto.b}?
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="login-captcha"
                  inputMode="numeric"
                  className="max-w-[100px]"
                  value={respuestaCaptcha}
                  onChange={(e) => setRespuestaCaptcha(e.target.value)}
                />
                <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={otroReto}>
                  <RefreshCw className="h-3 w-3" />
                  Otro reto
                </Button>
              </div>
            </div>
            {errorLogin && <p className="text-xs font-medium text-destructive">{errorLogin}</p>}
            <Button type="submit" disabled={enviando} className="mt-2">
              {enviando ? "Iniciando sesión..." : "🔑 Iniciar sesión"}
            </Button>
            <button
              type="button"
              className="text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setAbiertoOlvide(true)}
            >
              ¿Olvidaste tu contraseña?
            </button>
          </form>
        </CardContent>
      </Card>

      <Dialog open={abiertoOlvide} onOpenChange={setAbiertoOlvide}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Olvidaste tu contraseña?</DialogTitle>
            <DialogDescription>
              Escribe tu correo — un administrador o Dirección Médica te restablecerá la contraseña y te la enviará por correo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="correo-olvide">Correo</Label>
            <InputEmail id="correo-olvide" value={correoOlvide} onChange={(e) => setCorreoOlvide(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbiertoOlvide(false)}>Cancelar</Button>
            <Button disabled={enviandoOlvide} onClick={solicitarOlvide}>Enviar solicitud</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
