import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputMayuscula } from "@/components/ui/input-mayuscula";
import { aMayusculas } from "@/lib/normalizarTexto";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DatosFuerzaVentas, SesionEjecucionActiva } from "../lib/rpc";

/**
 * Registro de personal de fuerza de ventas presente en el evento: solo
 * nombre, cargo y ciudad (no lleva firma ni datos personales). Cuenta aparte
 * de los asistentes en el reporte de asistentes impactados.
 */
export function FormularioFuerzaVentas({
  sesion,
  enviando,
  onCancelar,
  onEnviar,
}: {
  sesion: SesionEjecucionActiva;
  enviando: boolean;
  onCancelar: () => void;
  onEnviar: (datos: DatosFuerzaVentas) => void;
}) {
  const [nombre, setNombre] = React.useState("");
  const [cargo, setCargo] = React.useState("");
  const [ciudad, setCiudad] = React.useState("");
  const [sesionId, setSesionId] = React.useState<string>(sesion.sesiones[0]?.id ?? "");
  const [error, setError] = React.useState("");
  const esMultisesion = sesion.modalidadSesiones === "Varias sesiones" && sesion.sesiones.length > 0;

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || !cargo.trim() || !ciudad.trim()) {
      setError("Nombre, cargo y ciudad son obligatorios.");
      return;
    }
    setError("");
    onEnviar({ nombre: aMayusculas(nombre.trim()), cargo: aMayusculas(cargo.trim()), ciudad: aMayusculas(ciudad.trim()), sesionId: esMultisesion ? sesionId || null : null });
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4 pb-24" data-testid="form-fuerza-ventas">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fuerza de ventas</CardTitle>
          <CardDescription>Registra a cada persona de la fuerza de ventas que está presente en el evento.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4">
          {esMultisesion && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fv-sesion">Sesión</Label>
              <Select value={sesionId} onValueChange={setSesionId}>
                <SelectTrigger id="fv-sesion"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sesion.sesiones.map((s, i) => (
                    <SelectItem key={s.id} value={s.id}>{`Sesión ${i + 1}${s.fecha ? ` — ${s.fecha}` : ""}${s.lugar ? ` · ${s.lugar}` : ""}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fv-nombre">Nombre *</Label>
            <InputMayuscula id="fv-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fv-cargo">Cargo *</Label>
            <InputMayuscula id="fv-cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} autoComplete="off" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fv-ciudad">Ciudad *</Label>
            <InputMayuscula id="fv-ciudad" value={ciudad} onChange={(e) => setCiudad(e.target.value)} autoComplete="off" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <div className="fixed inset-x-0 bottom-0 flex gap-2 border-t bg-background p-4">
        <Button type="button" variant="outline" className="h-11 flex-1" onClick={onCancelar} disabled={enviando}>Cancelar</Button>
        <Button type="submit" className="h-11 flex-1 text-base" disabled={enviando}>{enviando ? "Guardando..." : "Guardar"}</Button>
      </div>
    </form>
  );
}
