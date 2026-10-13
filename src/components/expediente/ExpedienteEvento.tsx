import * as React from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { alcancesFotos, calcularAvanceExpediente, fotosDelAlcance, maximoFotosEvento, sumarDistribuciones, type PestanaExpediente } from "@/lib/expediente";
import { useExpediente } from "./useExpediente";
import { PestanaSpeakers } from "./PestanaSpeakers";
import { PestanaAsistencia } from "./PestanaAsistencia";
import { PestanaMuestraMedica } from "./InformesEjecucionEvento";
import { PestanaFotos } from "./PestanaFotos";
import { PestanaDocumentos, PestanaFinanciero, PestanaResumen } from "./PestanasResumenDocumentosFinanciero";
import type { Evento } from "@/types";

/**
 * Expediente del evento (octubre 2026) — reemplaza al antiguo panel
 * "Repositorio del evento — archivos / registros financieros". Una ventana
 * propia (minimizable, como las demás) con todo lo que respalda el evento:
 * documentos generados en BEATS, documentos por speaker, asistencia (oficial
 * desde Ejecución), fotos con marco guía y conciliación financiera.
 */
export function ExpedienteEvento({ evento, abierto, onCerrar }: { evento: Evento; abierto: boolean; onCerrar: () => void }) {
  const { datos, cargando, recargar, alcancesAsistencia } = useExpediente(evento, abierto);
  const [pestana, setPestana] = React.useState<PestanaExpediente>("resumen");

  const items = React.useMemo(
    () =>
      calcularAvanceExpediente({
        evento,
        archivos: datos.archivos,
        financieros: datos.financieros,
        conveniosResumen: datos.conveniosResumen,
        convenios: datos.convenios,
        fmvs: datos.fmvs,
        cafs: datos.cafs,
        conveniosHcp: datos.conveniosHcp,
        alcancesAsistencia,
      }),
    [evento, datos, alcancesAsistencia],
  );
  const hechos = items.filter((i) => i.hecho).length;
  const porcentaje = items.length === 0 ? 0 : Math.round((hechos / items.length) * 100);
  const impactados = sumarDistribuciones(alcancesAsistencia).total;
  const nFotos = alcancesFotos(evento).reduce((acc, a) => acc + fotosDelAlcance(datos.archivos, a.sesionId).length, 0);
  const maxFotos = maximoFotosEvento(evento);

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-6xl no-imprimir" minimizable data-testid="expediente-evento">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Expediente — {evento.nombreEvento || "Evento"}
            <Badge variant={evento.estado === "Completado" ? "completed" : "approved"}>{evento.estado}</Badge>
          </DialogTitle>
          <DialogDescription>Documentos, soportes, asistencia, fotos y pagos del evento en un solo lugar.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5" data-testid="exp-avance">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{hechos} de {items.length} requeridos completos</span>
            <span>{porcentaje}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={porcentaje} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${porcentaje}%` }} />
          </div>
        </div>

        {cargando ? (
          <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Cargando expediente...</p>
        ) : (
          <Tabs value={pestana} onValueChange={(v) => setPestana(v as PestanaExpediente)}>
            <TabsList>
              <TabsTrigger value="resumen">Resumen</TabsTrigger>
              <TabsTrigger value="documentos">Documentos del sistema</TabsTrigger>
              <TabsTrigger value="speakers">Speakers</TabsTrigger>
              <TabsTrigger value="asistencia">Asistencia <Badge variant="secondary" className="px-1.5 py-0">{impactados}</Badge></TabsTrigger>
              {evento.entregaMuestrasMedicas && <TabsTrigger value="muestra">Muestra médica</TabsTrigger>}
              <TabsTrigger value="fotos">Fotos <Badge variant="secondary" className="px-1.5 py-0">{nFotos}/{maxFotos}</Badge></TabsTrigger>
              <TabsTrigger value="financiero">Financiero</TabsTrigger>
            </TabsList>
            <div className="max-h-[62vh] overflow-y-auto pr-1">
              <TabsContent value="resumen"><PestanaResumen evento={evento} items={items} irA={setPestana} /></TabsContent>
              <TabsContent value="documentos"><PestanaDocumentos evento={evento} datos={datos} /></TabsContent>
              <TabsContent value="speakers"><PestanaSpeakers evento={evento} datos={datos} recargar={recargar} /></TabsContent>
              <TabsContent value="asistencia"><PestanaAsistencia evento={evento} datos={datos} alcances={alcancesAsistencia} recargar={recargar} /></TabsContent>
              {evento.entregaMuestrasMedicas && <TabsContent value="muestra"><PestanaMuestraMedica evento={evento} datos={datos} alcances={alcancesAsistencia} /></TabsContent>}
              <TabsContent value="fotos"><PestanaFotos evento={evento} archivos={datos.archivos} recargar={recargar} /></TabsContent>
              <TabsContent value="financiero"><PestanaFinanciero evento={evento} datos={datos} recargar={recargar} /></TabsContent>
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
