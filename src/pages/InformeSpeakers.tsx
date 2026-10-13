import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Download } from "lucide-react";
import {
  traerSpeakers,
  construirCSVSpeakers,
  vigenciaRethus,
  vigenciaHojaVida,
  ETIQUETA_VIGENCIA,
  type EstadoVigencia,
} from "@/lib/speakers";
import { descargarCSV } from "@/lib/csv";
import { EtiquetaTamano } from "@/components/ui/etiqueta-tamano";
import { bytesDeTexto } from "@/lib/tamanoEstimado";
import { mensajeErrorAmigable } from "@/lib/supabaseClient";
import { useCompania } from "@/hooks/useCompania";
import { traerEventos } from "@/lib/evento";
import { traerConvenios } from "@/lib/convenio";
import { idsSpeakersDeEmpresa } from "@/lib/speakersEmpresa";
import type { Convenio, Evento, Speaker } from "@/types";

const VARIANTE_POR_VIGENCIA: Record<EstadoVigencia, BadgeProps["variant"]> = {
  vigente: "approved",
  porVencer: "pending",
  vencido: "rejected",
  // Mismo criterio que en el Repositorio de Speakers (src/pages/Speakers.tsx):
  // "Indefinido" se ve igual que "Vigente".
  indefinido: "approved",
  sinDatos: "draft",
};

export function InformeSpeakers() {
  const { companiaActual } = useCompania();
  const [todos, setTodos] = React.useState<Speaker[]>([]);
  const [eventos, setEventos] = React.useState<Evento[]>([]);
  const [convenios, setConvenios] = React.useState<Convenio[]>([]);
  const [cargando, setCargando] = React.useState(true);

  React.useEffect(() => {
    Promise.all([traerSpeakers(), traerEventos().catch(() => [] as Evento[]), traerConvenios().catch(() => [] as Convenio[])])
      .then(([s, e, c]) => {
        setTodos(s);
        setEventos(e);
        setConvenios(c);
      })
      .catch((error) => toast.error(mensajeErrorAmigable(error)))
      .finally(() => setCargando(false));
  }, []);

  // Octubre 2026, pedido explícito: solo speakers asociados a la empresa del grupo con la que se trabaja en la sesión.
  const speakers = React.useMemo(() => {
    const ids = idsSpeakersDeEmpresa({ empresa: companiaActual, speakers: todos, eventos, convenios });
    return ids ? todos.filter((s) => ids.has(s.id)) : todos;
  }, [todos, eventos, convenios, companiaActual]);

  const bytesCsv = React.useMemo(() => bytesDeTexto(construirCSVSpeakers(speakers)), [speakers]);

  function exportar() {
    descargarCSV(`informe-speakers-${new Date().toISOString().slice(0, 10)}.csv`, construirCSVSpeakers(speakers));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Informe de Speakers</h1>
          <p className="text-sm text-muted-foreground">Speakers del repositorio asociados a {companiaActual ? `${companiaActual}` : "las empresas del grupo"}, con su vigencia de RETHUS y hoja de vida.</p>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <Button variant="outline" disabled={speakers.length === 0} onClick={exportar}>
            <Download /> Exportar CSV
          </Button>
          <EtiquetaTamano bytes={speakers.length === 0 ? null : bytesCsv} testId="speakers-tamano-csv" />
        </div>
      </div>

      <Card>
        {/* AJUSTES (septiembre/octubre 2026): `overflow-x-auto` — ver la nota
            en `UsuariosRoles.tsx`. */}
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-3 font-medium">Nombre</th>
                <th className="p-3 font-medium">Especialidad</th>
                <th className="p-3 font-medium">RETHUS</th>
                <th className="p-3 font-medium">Hoja de vida</th>
              </tr>
            </thead>
            <tbody>
              {cargando && <tr><td className="p-3 text-muted-foreground" colSpan={4}>Cargando...</td></tr>}
              {!cargando && speakers.length === 0 && (
                <tr><td className="p-3 text-muted-foreground" colSpan={4}>Todavía no hay speakers en el repositorio.</td></tr>
              )}
              {speakers.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="p-3">
                    <div className="font-medium">{s.nombreCompleto}</div>
                    <div className="text-xs text-muted-foreground">{s.numeroDocumento}</div>
                  </td>
                  <td className="p-3">{s.especialidad || "—"}</td>
                  <td className="p-3"><Badge variant={VARIANTE_POR_VIGENCIA[vigenciaRethus(s)]}>{ETIQUETA_VIGENCIA[vigenciaRethus(s)]}</Badge></td>
                  <td className="p-3"><Badge variant={VARIANTE_POR_VIGENCIA[vigenciaHojaVida(s)]}>{ETIQUETA_VIGENCIA[vigenciaHojaVida(s)]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
