import * as React from "react";
import { toast } from "sonner";
import { Trash2, Users, Smartphone, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampoArchivo } from "@/components/archivos/CampoArchivo";
import { VisorArchivo } from "@/components/archivos/VisorArchivo";
import { useConfirmarQuitar, BloqueExpediente } from "./piezas";
import { InformeListaAsistencia } from "./InformesEjecucionEvento";
import { useAccionesExpediente } from "./useAccionesExpediente";
import { guardarOtroPersonalAsistentes } from "@/lib/repositorioEvento";
import { eliminarRegistroFuerzaVentas } from "@/lib/ejecucion";
import { sumarDistribuciones, type AlcanceAsistencia } from "@/lib/expediente";
import { formatearFechaHora } from "@/lib/fecha";
import type { Evento, RegistroFuerzaVentas } from "@/types";
import type { DatosExpedienteCargados } from "./useExpediente";

interface Props {
  evento: Evento;
  datos: DatosExpedienteCargados;
  alcances: AlcanceAsistencia[];
  recargar: (silencioso?: boolean) => Promise<void>;
}

const ETIQUETA_FUENTE = {
  ejecucion: "Fuente: módulo de Ejecución (lista oficial)",
  lista_externa: "Fuente: lista externa cargada",
  sin_datos: "Sin asistentes registrados todavía",
} as const;

/**
 * Pestaña "Asistencia": la lista oficial es la que sale del módulo de
 * Ejecución (check-in + fuerza de ventas). Se puede además cargar una lista
 * externa por sesión (o del evento completo) con su distribución. Todo se
 * suma en "Asistentes impactados" para el informe.
 */
export function PestanaAsistencia({ evento, datos, alcances, recargar }: Props) {
  const total = sumarDistribuciones(alcances);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 rounded-xl border bg-accent/30 p-3.5 sm:grid-cols-5" data-testid="exp-asistentes-impactados">
        <Metrica titulo="Asistentes impactados" valor={total.total} destacado />
        <Metrica titulo="Personal médico" valor={total.medico} />
        <Metrica titulo="Personal no médico" valor={total.noMedico} />
        <Metrica titulo="Fuerza de ventas" valor={total.fuerzaVentas} />
        <Metrica titulo="Otro" valor={total.otro} />
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">Estos totales son los que alimentan el informe de asistentes impactados.</p>

      <InformeListaAsistencia evento={evento} alcances={alcances} />

      {alcances.map((a) => (
        <BloqueAlcance key={a.sesionId ?? a.etiqueta} evento={evento} alcance={a} datos={datos} recargar={recargar} />
      ))}
    </div>
  );
}

function Metrica({ titulo, valor, destacado }: { titulo: string; valor: number; destacado?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{titulo}</span>
      <span className={destacado ? "text-2xl font-semibold text-primary" : "text-xl font-semibold"}>{valor}</span>
    </div>
  );
}

function BloqueAlcance({ evento, alcance, datos, recargar }: { evento: Evento; alcance: AlcanceAsistencia; datos: DatosExpedienteCargados; recargar: Props["recargar"] }) {
  const acciones = useAccionesExpediente(evento.id, recargar);
  const confirmarQuitar = useConfirmarQuitar();
  const d = alcance.distribucion;
  const [otro, setOtro] = React.useState(String(alcance.otroManual));
  React.useEffect(() => setOtro(String(alcance.otroManual)), [alcance.otroManual]);

  const fuerzaVentas: RegistroFuerzaVentas[] = datos.fuerzaVentas.filter((f) => (alcance.sesionId ? f.sesionId === alcance.sesionId : !evento.sesiones.some((s) => s.id === f.sesionId) || evento.sesiones.length === 0));

  async function guardarOtro() {
    const n = Number(otro);
    if (!Number.isInteger(n) || n < 0) return toast.error("Indica un número entero (0 o más).");
    try {
      await guardarOtroPersonalAsistentes(evento.id, alcance.sesionId, n);
      toast.success("“Otro personal” actualizado.");
      await recargar(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar.");
    }
  }

  async function quitarFuerzaVentas(id: string) {
    if (!(await confirmarQuitar("Quitar registro", "¿Quitar a esta persona de la fuerza de ventas registrada?"))) return;
    try {
      await eliminarRegistroFuerzaVentas(id);
      await recargar(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo quitar el registro.");
    }
  }

  return (
    <BloqueExpediente
      titulo={`Lista de asistencia — ${alcance.etiqueta}`}
      estado={<Badge variant={d.fuente === "sin_datos" ? "pending" : "approved"}>{ETIQUETA_FUENTE[d.fuente]}</Badge>}
      testId={`exp-asistencia-${alcance.sesionId ?? "evento"}`}
    >
      {/* Oficial: Ejecución */}
      <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3">
        <p className="flex items-center gap-1.5 text-sm font-medium"><Smartphone className="size-4 text-primary" /> Lista oficial — módulo de Ejecución</p>
        <p className="text-xs text-muted-foreground">
          {alcance.registrosEjecucion > 0
            ? `${alcance.registrosEjecucion} persona(s) registradas desde la app de Ejecución en Sitio. La clasificación médico / no médico sale de la profesión indicada en el check-in.`
            : "Todavía no hay registros desde la app de Ejecución en Sitio para este alcance."}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metrica titulo="Médico" valor={d.medico} />
          <Metrica titulo="No médico" valor={d.noMedico} />
          <Metrica titulo="Fuerza de ventas" valor={d.fuerzaVentas} />
          <div className="flex flex-col gap-1">
            <Label htmlFor={`otro-${alcance.sesionId ?? "evento"}`} className="text-[11px] uppercase tracking-wide text-muted-foreground">Otro (manual)</Label>
            <div className="flex gap-1">
              <Input id={`otro-${alcance.sesionId ?? "evento"}`} type="number" min={0} value={otro} onChange={(e) => setOtro(e.target.value)} className="h-8 w-20" />
              <Button size="sm" variant="outline" onClick={guardarOtro} disabled={String(alcance.otroManual) === otro}>Guardar</Button>
            </div>
          </div>
        </div>
        {fuerzaVentas.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Ver fuerza de ventas registrada ({fuerzaVentas.length})</summary>
            <div className="mt-1.5 flex flex-col gap-1">
              {fuerzaVentas.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-2 rounded border p-1.5">
                  <span>{f.nombre} · {f.cargo} · {f.ciudad} <span className="text-muted-foreground">({formatearFechaHora(f.capturadoEn)})</span></span>
                  <Button size="icon" variant="ghost" title="Quitar" onClick={() => quitarFuerzaVentas(f.id)}><Trash2 /></Button>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* Externa */}
      <div className="flex flex-col gap-2 rounded-md border p-3">
        <p className="flex items-center gap-1.5 text-sm font-medium"><Upload className="size-4 text-primary" /> Lista externa (opcional)</p>
        <p className="text-xs text-muted-foreground">Si el evento tuvo una lista propia (por ejemplo, de un aliado), cárgala aquí con su distribución. Solo cuenta para el informe cuando Ejecución no tiene registros para este alcance.</p>
        {alcance.listasExternas.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
            <span className="text-xs text-muted-foreground">
              Médico: {l.conteoPersonalMedico ?? 0} · No médico: {l.conteoPersonalNoMedico ?? 0} · Fuerza de ventas: {l.conteoFuerzaVentas ?? 0} · Otro: {l.conteoOtroPersonal ?? 0}
            </span>
            <div className="flex items-center gap-1">
              <VisorArchivo archivoId={l.archivoId} etiqueta="Ver" size="sm" variant="outline" />
              <Button size="icon" variant="ghost" title="Quitar" onClick={() => acciones.quitarArchivo(l)}><Trash2 /></Button>
            </div>
          </div>
        ))}
        <FormListaExterna
          contexto={`${evento.nombreEvento} ${alcance.etiqueta}`}
          onAgregar={(archivoId, conteos) => acciones.agregarArchivoSuelto({ categoria: "listaAsistencia", archivoId, sesionId: alcance.sesionId, conteos })}
        />
      </div>
    </BloqueExpediente>
  );
}

function FormListaExterna({
  contexto,
  onAgregar,
}: {
  contexto: string;
  onAgregar: (archivoId: string, conteos: { medico: number; noMedico: number; fuerzaVentas: number; otro: number }) => Promise<void>;
}) {
  const [archivoId, setArchivoId] = React.useState<string | null>(null);
  const [c, setC] = React.useState({ medico: "", noMedico: "", fuerzaVentas: "", otro: "" });

  async function agregar() {
    if (!archivoId) return toast.error("Adjunta el archivo de la lista.");
    const n = (v: string) => (v === "" ? 0 : Number(v));
    const vals = { medico: n(c.medico), noMedico: n(c.noMedico), fuerzaVentas: n(c.fuerzaVentas), otro: n(c.otro) };
    if (Object.values(vals).some((v) => !Number.isInteger(v) || v < 0)) return toast.error("Los conteos deben ser números enteros (0 o más).");
    if (Object.values(vals).every((v) => v === 0)) return toast.error("Indica la distribución de asistentes de la lista (al menos un conteo).");
    await onAgregar(archivoId, vals);
    setArchivoId(null);
    setC({ medico: "", noMedico: "", fuerzaVentas: "", otro: "" });
  }

  const campo = (clave: keyof typeof c, etiqueta: string) => (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{etiqueta}</Label>
      <Input type="number" min={0} value={c[clave]} onChange={(e) => setC({ ...c, [clave]: e.target.value })} />
    </div>
  );

  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed p-2.5">
      <CampoArchivo valor={archivoId} onChange={setArchivoId} aceptar="application/pdf,image/*,.xls,.xlsx,.csv" contexto={contexto} nombreTipo="Lista asistencia" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {campo("medico", "Personal médico")}
        {campo("noMedico", "Personal no médico")}
        {campo("fuerzaVentas", "Fuerza de ventas")}
        {campo("otro", "Otro")}
      </div>
      <Button size="sm" variant="outline" className="w-fit" onClick={agregar}><Users /> Agregar lista externa</Button>
    </div>
  );
}
