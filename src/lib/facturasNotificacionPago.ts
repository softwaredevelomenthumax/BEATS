import type { NotificacionPagoHcp, RegistroFinancieroEvento } from "@/types";

/**
 * Octubre 2026 (entrega 25), pedido explícito: la "Notificación de Pago a HCPs"
 * solo se puede generar para eventos/speakers/sesiones que YA tengan al menos
 * una factura cargada en el Expediente del evento, y el número de factura se
 * elige de esa lista. Funciones puras (sin React ni red) para poder probarlas.
 *
 * Vínculo notificación ↔ factura: `NotificacionPagoHcp.facturaId` guarda el id
 * del ARCHIVO de la factura (`RegistroFinancieroEvento.archivoId`) — es lo que
 * abre el botón «Ver factura». Por compatibilidad también se acepta que
 * contenga el id del registro financiero.
 */

type NotificacionMinima = Pick<NotificacionPagoHcp, "id" | "eventoOrigenId" | "speakerId" | "estado" | "facturaId">;

/** ¿Esta notificación ya cubre esa factura? */
export function notificacionCubreFactura(n: Pick<NotificacionPagoHcp, "facturaId">, factura: RegistroFinancieroEvento): boolean {
  return !!n.facturaId && (n.facturaId === factura.archivoId || n.facturaId === factura.id);
}

/** Una notificación Anulada o Rechazada libera su factura para volver a notificarla. */
export function notificacionVigente(n: Pick<NotificacionPagoHcp, "estado">): boolean {
  return n.estado !== "Anulado" && n.estado !== "Rechazado";
}

/** Facturas del Expediente que corresponden a un evento (y, si se indica, a un speaker; las facturas sin speaker aplican a todos). */
export function facturasDelEvento(registros: RegistroFinancieroEvento[], eventoId: string, speakerId?: string | null): RegistroFinancieroEvento[] {
  return registros.filter(
    (r) => r.eventoId === eventoId && r.categoria === "facturas" && (!speakerId || !r.speakerId || r.speakerId === speakerId),
  );
}

/**
 * Facturas que todavía se pueden notificar: cargadas en el Expediente para ese
 * evento+speaker y que ninguna otra notificación vigente haya tomado. La
 * notificación que se está editando (`documentoActualId`) no cuenta contra sí misma.
 */
export function facturasParaNotificar(params: {
  registros: RegistroFinancieroEvento[];
  notificaciones: NotificacionMinima[];
  eventoId: string;
  speakerId?: string | null;
  documentoActualId?: string;
}): RegistroFinancieroEvento[] {
  const { registros, notificaciones, eventoId, speakerId, documentoActualId } = params;
  const tomadas = notificaciones.filter((n) => notificacionVigente(n) && n.id !== documentoActualId);
  return facturasDelEvento(registros, eventoId, speakerId).filter((f) => !tomadas.some((n) => notificacionCubreFactura(n, f)));
}

/** Ordena para el desplegable: por fecha y luego por número. */
export function ordenarFacturas(facturas: RegistroFinancieroEvento[]): RegistroFinancieroEvento[] {
  return [...facturas].sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? "") || a.numero.localeCompare(b.numero));
}
