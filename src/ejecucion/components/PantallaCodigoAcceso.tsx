import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InputMayuscula } from "@/components/ui/input-mayuscula";
import { aMayusculas } from "@/lib/normalizarTexto";
import { Label } from "@/components/ui/label";
import { validarCodigoEjecucion, type SesionEjecucionActiva } from "../lib/rpc";

interface Props {
  onValidado: (sesion: SesionEjecucionActiva) => void;
}

/**
 * Pantalla de entrada, sin login (confirmado en el plan): el equipo en el
 * sitio del evento digita el código de 6 caracteres que generó quien creó
 * la Solicitud de Evento, más su propio nombre como responsable de esta
 * sesión de trabajo.
 */
export function PantallaCodigoAcceso({ onValidado }: Props) {
  const [codigo, setCodigo] = React.useState("");
  const [responsable, setResponsable] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!codigo.trim()) {
      toast.error("Ingresa el código de acceso del evento.");
      return;
    }
    if (!responsable.trim()) {
      toast.error("Debes indicar el nombre de quien atiende el evento.");
      return;
    }
    setEnviando(true);
    try {
      const sesion = await validarCodigoEjecucion(codigo, aMayusculas(responsable.trim()));
      onValidado(sesion);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ocurrió un error inesperado.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">BEATS — Ejecución en Sitio</CardTitle>
          <CardDescription>
            Ingresa el código de acceso del evento y el nombre de quien lo atiende.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={enviar}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ej-codigo">Código de acceso</Label>
              <Input
                id="ej-codigo"
                autoFocus
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                placeholder="Ej: A3F7K9"
                className="text-center text-lg font-mono tracking-widest"
                maxLength={6}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ej-responsable">Nombre de quien atiende el evento</Label>
              <InputMayuscula
                id="ej-responsable"
                value={responsable}
                onChange={(e) => setResponsable(e.target.value)}
                placeholder="Nombre completo"
              />
            </div>
            <Button type="submit" disabled={enviando} className="mt-2 h-11 text-base">
              {enviando ? "Validando..." : "Ingresar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
