import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorMarquesina, traerResumenEjecucionEvento, type ResumenEjecucionEvento } from "../lib/rpc";

interface Props {
  errorInicial?: string | null;
  onValidado: (codigo: string, resumen: ResumenEjecucionEvento) => void;
}

/**
 * Pantalla de entrada, sin login — solo pide el código del evento (a
 * diferencia de `ejecucion.html`, aquí no hay "responsable" que registrar,
 * porque esta pantalla es de solo lectura). Se muestra al arrancar sin un
 * código guardado, o cuando el código guardado deja de ser válido (p.ej.
 * porque se generó uno nuevo para el mismo evento).
 */
export function PantallaCodigoMarquesina({ errorInicial, onValidado }: Props) {
  const [codigo, setCodigo] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(errorInicial ?? null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!codigo.trim()) {
      setError("Ingresa el código del evento.");
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      const resumen = await traerResumenEjecucionEvento(codigo);
      onValidado(codigo.trim().toUpperCase(), resumen);
    } catch (e) {
      const error = e instanceof ErrorMarquesina ? e : new ErrorMarquesina(String(e), false);
      setError(error.esFalloDeRed ? "No hay conexión a internet. Verifica la red e inténtalo de nuevo." : error.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">BEATS — Marquesina</CardTitle>
          <CardDescription>Ingresa el código del evento para mostrar su resumen en vivo.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={enviar}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mq-codigo">Código del evento</Label>
              <Input
                id="mq-codigo"
                autoFocus
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                placeholder="Ej: A3F7K9"
                className="text-center text-lg font-mono tracking-widest"
                maxLength={6}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={enviando} className="mt-2 h-11 text-base">
              {enviando ? "Validando..." : "Mostrar evento"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
