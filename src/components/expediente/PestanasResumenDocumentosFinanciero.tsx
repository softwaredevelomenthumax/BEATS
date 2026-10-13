import { ExternalLink, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { useAbrirDocumentoGenerico } from "@/hooks/useAbrirDocumentoGenerico";
import { documentosPorSpeaker } from "@/lib/documentosRequeridosEvento";
import { formatearFechaHora } from "@/lib/fecha";
import { formatearMonto } from "@/lib/dinero";
import {
  conciliar,
  gruposSpeakers,
  type ItemAvanceExpediente,
  type PestanaExpediente,
} from "@/lib/expediente";
import { AnotacionesPago } from "@/components/pagos/AnotacionesPago";
import { anotacionesDelSpeaker } from "@/lib/anotacionesPago";
import { speakersExternosDe } from "@/lib/speakersEvento";
import { BloqueExpediente, EstadoChip, ListaRegistrosFinancieros, useIconoPorSpeaker } from "./piezas";
import { useAccionesExpediente } from "./useAccionesExpediente";
import type { DatosExpedienteCargados } from "./useExpediente";
import type { EstadoDoc } from "@/lib/enums";
import type { Caf, Convenio, ConvenioHcp, Evento, Fmv, NotificacionPagoHcp } from "@/types";
import type { DocumentoAny } from "@/lib/documentoGenerico";

const VARIANTE_POR_ESTADO: Record<EstadoDoc, BadgeProps["variant"]> = {
  Borrador: "draft",
  Pendiente: "pending",
  Aprobado: "approved",
  Rechazado: "rejected",
  Devuelto: "draft",
  Completado: "completed",
  Anulado: "cancelled",
};

// --- Resumen ---------------------------------------------------------------

export function PestanaResumen({ evento, items, irA }: { evento: Evento; items: ItemAvanceExpediente[]; irA: (p: PestanaExpediente) => void }) {
  const iconoDe = useIconoPorSpeaker(evento);
  const grupos = Array.from(new Set(items.map((i) => i.grupo)));
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2" data-testid="exp-resumen">
      {grupos.map((g) => {
        const delGrupo = items.filter((i) => i.grupo === g);
        const hechos = delGrupo.filter((i) => i.hecho).length;
        return (
          <BloqueExpediente key={g} titulo={g} icono={iconoDe(g)} estado={<span className="text-xs text-muted-foreground">{hechos} de {delGrupo.length}</span>}>
            <div className="flex flex-col gap-1">
              {delGrupo.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => irA(i.pestana)}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50"
                >
                  {i.hecho ? <CheckCircle2 className="size-4 shrink-0 text-status-approved-fg" /> : <Circle className="size-4 shrink-0 text-muted-foreground" />}
                  <span className="flex-1">{i.etiqueta}</span>
                  {i.detalle && <span className="text-xs text-muted-foreground">{i.detalle}</span>}
                </button>
              ))}
            </div>
          </BloqueExpediente>
        );
      })}
    </div>
  );
}

// --- Documentos del sistema ------------------------------------------------

interface FilaDocumento {
  clave: string;
  grupo: string;
  etiqueta: string;
  doc: DocumentoAny | null;
  estado: EstadoDoc | null;
  aprobadoEn: string | null;
}

function fechaAprobacion(doc: { aprobaciones?: { estado: string; fecha?: string }[] }): string | null {
  const fechas = (doc.aprobaciones ?? []).filter((p) => p.estado === "aprobado" && p.fecha).map((p) => p.fecha as string).sort();
  return fechas.length > 0 ? fechas[fechas.length - 1] : null;
}

export function PestanaDocumentos({ evento, datos }: { evento: Evento; datos: DatosExpedienteCargados }) {
  const { abrir } = useAbrirDocumentoGenerico();
  const iconoDe = useIconoPorSpeaker(evento);
  const filas: FilaDocumento[] = [];

  filas.push({ clave: "evento", grupo: "Evento", etiqueta: "Solicitud de evento educativo y promocional", doc: evento, estado: evento.estado, aprobadoEn: fechaAprobacion(evento) });

  const grupos = gruposSpeakers(evento);
  const porSpeaker = documentosPorSpeaker(evento, datos.convenios, datos.fmvs, datos.cafs, datos.conveniosHcp);
  const agregarDoc = (grupo: string, etiqueta: string, d: Fmv | Convenio | Caf | ConvenioHcp | null, clave: string) =>
    filas.push({ clave, grupo, etiqueta, doc: d, estado: d?.estado ?? null, aprobadoEn: d && "aprobaciones" in d ? fechaAprobacion(d) : null });

  if (grupos.length > 0) {
    for (const g of grupos) {
      const docs = g.sp ? porSpeaker.find((d) => d.speaker.id === g.sp!.id) : undefined;
      agregarDoc(g.nombre, "FMV Checklist", docs?.fmv ?? (g.sp ? null : datos.fmvs[0] ?? null), `fmv-${g.nombre}`);
      agregarDoc(g.nombre, "Solicitud de convenio de pago a HCP", docs?.convenio ?? (g.sp ? null : datos.convenios[0] ?? null), `conv-${g.nombre}`);
      agregarDoc(g.nombre, "CAF", docs?.caf ?? (g.sp ? null : datos.cafs[0] ?? null), `caf-${g.nombre}`);
      agregarDoc(g.nombre, "Convenio HCP", docs?.convenioHCP ?? (g.sp ? null : datos.conveniosHcp[0] ?? null), `hcp-${g.nombre}`);
    }
  }
  for (const n of datos.notificaciones as NotificacionPagoHcp[]) {
    filas.push({ clave: `notif-${n.id}`, grupo: "Pagos", etiqueta: `Notificación de pago a HCPs — ${n.nombreProfesionalSalud || "sin nombre"}`, doc: n, estado: n.estado, aprobadoEn: null });
  }

  const gruposOrden = Array.from(new Set(filas.map((f) => f.grupo)));
  return (
    <div className="flex flex-col gap-3" data-testid="exp-documentos">
      <p className="text-xs text-muted-foreground">Documentos generados y aprobados dentro de BEATS. Se abren en su propia ventana; aquí no se editan.</p>
      {gruposOrden.map((g) => (
        <BloqueExpediente key={g} titulo={g} icono={iconoDe(g)}>
          <div className="flex flex-col gap-1.5">
            {filas.filter((f) => f.grupo === g).map((f) => (
              <div key={f.clave} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
                <span className="min-w-0 flex-1 font-medium">{f.etiqueta}</span>
                <div className="flex items-center gap-2">
                  {f.estado ? <Badge variant={VARIANTE_POR_ESTADO[f.estado]}>{f.estado}</Badge> : <Badge variant="cancelled">Sin crear</Badge>}
                  {f.aprobadoEn && <span className="text-xs text-muted-foreground">Aprobado {formatearFechaHora(f.aprobadoEn)}</span>}
                  {f.doc && (
                    <Button size="sm" variant="outline" onClick={() => abrir(f.doc!)}><ExternalLink /> Abrir</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </BloqueExpediente>
      ))}
    </div>
  );
}

// --- Financiero ------------------------------------------------------------

export function PestanaFinanciero({ evento, datos, recargar }: { evento: Evento; datos: DatosExpedienteCargados; recargar: (silencioso?: boolean) => Promise<void> }) {
  const acciones = useAccionesExpediente(evento.id, recargar);
  const iconoDe = useIconoPorSpeaker(evento);
  const grupos = gruposSpeakers(evento);
  const conSpeaker = new Set(grupos.map((g) => g.speakerId ?? null));
  const sinAsignar = datos.financieros.filter((f) => grupos.length > 0 && !conSpeaker.has(f.speakerId ?? null));
  const nombreSesion = (id: string | null) => {
    const i = evento.sesiones.findIndex((s) => s.id === id);
    return i >= 0 ? `Sesión ${i + 1}` : null;
  };

  const bloques = grupos.length > 0 ? grupos.map((g) => ({ nombre: g.nombre, speakerId: g.speakerId ?? null, filas: datos.financieros.filter((f) => (f.speakerId ?? null) === (g.speakerId ?? null)) })) : [{ nombre: "Evento", speakerId: null as string | null, filas: datos.financieros }];
  const total = conciliar(datos.financieros);
  const hayVariosSpeakers = speakersExternosDe(evento).length > 1;

  return (
    <div className="flex flex-col gap-3" data-testid="exp-financiero">
      <p className="text-xs text-muted-foreground">Contraste de la orden de compra con las facturas y los comprobantes de pago. Se carga en la pestaña “Speakers”.</p>
      {bloques.map((b) => {
        const lineas = conciliar(b.filas);
        return (
          <BloqueExpediente key={b.nombre} titulo={b.nombre} icono={iconoDe(b.nombre)} estado={<EstadoChip hecho={lineas.length > 0 && lineas.every((l) => l.alertas.length === 0)} texto={lineas.length === 0 ? "Sin registros" : lineas.every((l) => l.alertas.length === 0) ? "Cuadra" : "Revisar"} />}>
            {lineas.length === 0 && <p className="text-xs text-muted-foreground">Sin órdenes de compra, facturas ni comprobantes.</p>}
            {lineas.map((l) => (
              <div key={l.moneda} className="flex flex-col gap-1 text-sm">
                <div className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-3">
                  <span>Orden de compra: <b>{formatearMonto(l.ordenCompra, l.moneda)}</b></span>
                  <span>Facturado: <b>{formatearMonto(l.facturas, l.moneda)}</b></span>
                  <span>Pagado: <b>{formatearMonto(l.comprobantes, l.moneda)}</b></span>
                </div>
                {l.alertas.map((a) => <span key={a} className="text-xs text-destructive">• {a}</span>)}
              </div>
            ))}
            {(() => {
              const notas = anotacionesDelSpeaker(datos.anotaciones, evento.id, b.speakerId, !hayVariosSpeakers);
              return notas.length > 0 ? (
                <AnotacionesPago titulo="Anotaciones sobre el pago" anotaciones={notas} puedeAgregar={false} nombreSesion={nombreSesion} onCambiarAclarada={acciones.cambiarAclarada} onEditar={acciones.editarAnotacion} onEliminar={acciones.eliminarAnotacion} testId={`exp-fin-anotaciones-${b.nombre}`} />
              ) : null;
            })()}
          </BloqueExpediente>
        );
      })}
      {grupos.length > 1 && total.length > 0 && (
        <BloqueExpediente titulo="Total del evento">
          {total.map((l) => (
            <div key={l.moneda} className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-3">
              <span>Orden de compra: <b>{formatearMonto(l.ordenCompra, l.moneda)}</b></span>
              <span>Facturado: <b>{formatearMonto(l.facturas, l.moneda)}</b></span>
              <span>Pagado: <b>{formatearMonto(l.comprobantes, l.moneda)}</b></span>
            </div>
          ))}
        </BloqueExpediente>
      )}
      {sinAsignar.length > 0 && (
        <BloqueExpediente titulo="Registros sin speaker asignado (cargados antes del Expediente)">
          <ListaRegistrosFinancieros items={sinAsignar} nombreSesion={nombreSesion} onQuitar={acciones.quitarFinanciero} vacio="" />
          <p className="text-xs text-muted-foreground">Elimínalos y vuelve a cargarlos en el bloque del speaker correspondiente para que entren en el contraste.</p>
        </BloqueExpediente>
      )}
    </div>
  );
}
