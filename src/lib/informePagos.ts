import { traerConvenios } from "@/lib/convenio";
import { traerNotificacionesPago } from "@/lib/notificacionPago";
import { traerEventos } from "@/lib/evento";
import { construirCSV } from "@/lib/csv";
import type { Convenio, Evento, NotificacionPagoHcp } from "@/types";
import { mismoPais } from "@/lib/paisCanonico";

/**
 * Une los 2 tipos de documento que representan un pago real a un HCP —
 * Convenio de Pago a HCP (contraprestación) y Notificación de Pago a HCPs
 * (factura) — en una sola fila comparable para el "Informe de Pagos". Solo
 * se incluyen documentos que ya pasaron por su flujo completo (Aprobado o
 * Completado): un Borrador/Pendiente/Rechazado/Anulado no representa un
 * pago real todavía.
 */
export interface FilaInformePago {
  tipoDoc: "convenio" | "notificacionPago";
  documentoId: string;
  hcpNombre: string;
  hcpIdentificacion: string;
  fecha: string | null;
  monto: number | null;
  moneda: string | null;
  estado: string;
  referencia: string;
  /** País del Evento de origen — resuelto vía `eventoOrigenId`, no un campo propio del Convenio/Notificación. Fase 6 (filtro por país). */
  pais: string | null;
}

const ESTADOS_PAGO_REAL = new Set(["Aprobado", "Completado"]);

/** Fase 6 (Tablero, Informes y Auditoría enriquecidos) — filtro por período (sobre la fecha del pago) y por país del evento, el enriquecimiento confirmado para este informe. */
export interface FiltrosInformePagos {
  desde?: string;
  hasta?: string;
  pais?: string;
}

export async function traerFilasInformePagos(filtros: FiltrosInformePagos = {}): Promise<FilaInformePago[]> {
  const [convenios, notificaciones, eventos] = await Promise.all([traerConvenios(), traerNotificacionesPago(), traerEventos()]);
  return construirFilasInformePagos({ convenios, notificaciones, eventos }, filtros);
}

/** Entrega 32: versión pura (sin red) para reutilizar los datos ya cargados por la conciliación. */
export function construirFilasInformePagos(
  { convenios, notificaciones, eventos }: { convenios: Convenio[]; notificaciones: NotificacionPagoHcp[]; eventos: Evento[] },
  filtros: FiltrosInformePagos = {},
): FilaInformePago[] {
  const paisPorEventoId = new Map(eventos.map((e) => [e.id, e.pais || null]));

  const filasConvenio: FilaInformePago[] = convenios
    .filter((c) => ESTADOS_PAGO_REAL.has(c.estado))
    .map((c) => ({
      tipoDoc: "convenio",
      documentoId: c.id,
      hcpNombre: c.hcpNombreCompleto,
      hcpIdentificacion: c.hcpCedulaLicencia,
      fecha: c.fechaInicioActividad,
      monto: c.contraprestacionHCP,
      moneda: c.monedaContraprestacion || null,
      estado: c.estado,
      referencia: c.nombreEventoServicio || "Convenio de Pago a HCP",
      pais: c.eventoOrigenId ? paisPorEventoId.get(c.eventoOrigenId) ?? null : null,
    }));

  const filasNotificacion: FilaInformePago[] = notificaciones
    .filter((n) => ESTADOS_PAGO_REAL.has(n.estado))
    .map((n) => ({
      tipoDoc: "notificacionPago",
      documentoId: n.id,
      hcpNombre: n.nombreProfesionalSalud,
      hcpIdentificacion: n.cedulaLicenciaProfesional,
      fecha: n.fechaFactura,
      monto: n.valorFactura,
      moneda: n.monedaFactura,
      estado: n.estado,
      referencia: n.numeroFactura || "Notificación de Pago a HCPs",
      pais: n.eventoOrigenId ? paisPorEventoId.get(n.eventoOrigenId) ?? null : null,
    }));

  return [...filasConvenio, ...filasNotificacion]
    .filter((f) => {
      const fecha = f.fecha ?? "";
      if (filtros.desde && (!fecha || fecha < filtros.desde)) return false;
      if (filtros.hasta && (!fecha || fecha > filtros.hasta)) return false;
      if (filtros.pais && !mismoPais(f.pais, filtros.pais)) return false;
      return true;
    })
    .sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
}

/** Total facturado/pagado agrupado por moneda — mismo resumen que el original muestra como tarjetas sobre la tabla. */
export function totalesPorMoneda(filas: FilaInformePago[]): { moneda: string; total: number }[] {
  const totales = new Map<string, number>();
  for (const f of filas) {
    if (f.monto == null) continue;
    const moneda = f.moneda || "—";
    totales.set(moneda, (totales.get(moneda) ?? 0) + f.monto);
  }
  return Array.from(totales.entries()).map(([moneda, total]) => ({ moneda, total }));
}

export function construirCSVInformePagos(filas: FilaInformePago[]): string {
  const encabezados = ["Tipo de documento", "HCP", "Identificación", "País del evento", "Fecha", "Monto", "Moneda", "Estado", "Referencia"];
  const cuerpo = filas.map((f) => [
    f.tipoDoc === "convenio" ? "Convenio de Pago a HCP" : "Notificación de Pago a HCPs",
    f.hcpNombre,
    f.hcpIdentificacion,
    f.pais ?? "",
    f.fecha ?? "",
    f.monto ?? "",
    f.moneda ?? "",
    f.estado,
    f.referencia,
  ]);
  return construirCSV(encabezados, cuerpo);
}

/**
 * Entrega 37: Convenios de Pago y Notificaciones de Pago ya aprobados que NO tienen evento de origen. No se pueden contrastar
 * con el Expediente (órdenes de compra, facturas y comprobantes cuelgan de un evento), así que «Pagos aprobados» los lista
 * aparte, sin mezclarlos con los valores del Expediente.
 */
export function documentosAprobadosSinEvento(
  { convenios, notificaciones }: { convenios: Convenio[]; notificaciones: NotificacionPagoHcp[] },
  filtros: { moneda?: string } = {},
): DocumentoAprobadoSinEvento[] {
  const filas: DocumentoAprobadoSinEvento[] = [
    ...convenios
      .filter((c) => !c.eventoOrigenId && ESTADOS_PAGO_REAL.has(c.estado))
      .map((c) => ({
        tipo: "Convenio de Pago a HCP",
        hcp: c.hcpNombreCompleto,
        identificacion: c.hcpCedulaLicencia,
        fecha: c.fechaInicioActividad,
        monto: c.contraprestacionHCP,
        moneda: c.monedaContraprestacion || null,
        estado: c.estado,
        referencia: c.nombreEventoServicio || "Convenio de Pago a HCP",
      })),
    ...notificaciones
      .filter((n) => !n.eventoOrigenId && ESTADOS_PAGO_REAL.has(n.estado))
      .map((n) => ({
        tipo: "Notificación de Pago a HCPs",
        hcp: n.nombreProfesionalSalud,
        identificacion: n.cedulaLicenciaProfesional,
        fecha: n.fechaFactura,
        monto: n.valorFactura,
        moneda: n.monedaFactura,
        estado: n.estado,
        referencia: n.numeroFactura || "Notificación de Pago a HCPs",
      })),
  ];
  return filas.filter((f) => !filtros.moneda || f.moneda === filtros.moneda).sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
}

export interface DocumentoAprobadoSinEvento {
  tipo: string;
  hcp: string;
  identificacion: string;
  fecha: string | null;
  monto: number | null;
  moneda: string | null;
  estado: string;
  referencia: string;
}
