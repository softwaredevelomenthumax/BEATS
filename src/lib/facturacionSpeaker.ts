import type { NotificacionPagoHcp, RegistroFinancieroEvento } from "@/types";
import type { ModalidadFactura } from "@/lib/expediente";
import { notificacionCubreFactura, notificacionVigente } from "@/lib/facturasNotificacionPago";

/**
 * Octubre 2026 (entrega 37), pedido explícito: al cargar facturas, notificaciones de pago y comprobantes de un speaker se
 * respeta lo que se marcó en la solicitud del evento (campo «Modalidad de factura» de cada speaker externo):
 *
 *  - «Factura única»  → el speaker solo puede tener UNA factura por toda su participación.
 *  - «Factura por sesión» → una factura por cada sesión en la que participa (ni más ni menos cupos que sesiones).
 *  - Por cada factura hay UNA Notificación de Pago a HCPs (el formulario de la notificación ya ofrece solo facturas sin
 *    notificar; aquí se muestra el estado de cada una).
 *  - Los comprobantes de pago dependen de las facturas que sigan sin cubrir: un comprobante cubre una o varias facturas y
 *    un comprobante nuevo solo puede apuntar a facturas que ningún otro comprobante haya cubierto todavía.
 *
 * Funciones puras (sin React ni red) para poder probarlas y reutilizarlas en la interfaz, en la acción de guardado y en el
 * avance del Expediente.
 */

type SesionMinima = { id: string };

/** Modalidad efectiva: «por sesión» solo tiene sentido si el speaker participa en al menos una sesión. */
export function modalidadEfectiva(modalidad: ModalidadFactura, sesiones: SesionMinima[]): ModalidadFactura {
  return modalidad === "por_sesion" && sesiones.length > 0 ? "por_sesion" : "unica";
}

/** Cantidad de facturas que admite el speaker: 1 si es única; una por sesión si factura por sesión. */
export function capacidadFacturas(modalidad: ModalidadFactura, sesiones: SesionMinima[]): number {
  return modalidadEfectiva(modalidad, sesiones) === "por_sesion" ? sesiones.length : 1;
}

export interface CupoFactura {
  /** `null` = el cupo de la factura única. */
  sesionId: string | null;
  factura: RegistroFinancieroEvento | null;
}

export interface EstadoFacturas {
  modalidad: ModalidadFactura;
  capacidad: number;
  /** Un cupo por sesión (o uno solo si es factura única), con su factura si ya se cargó. */
  cupos: CupoFactura[];
  /** Facturas que no caben en ningún cupo (datos anteriores a esta regla: de más, o de una sesión que ya no está). */
  sobrantes: RegistroFinancieroEvento[];
  /** Todos los cupos tienen factura. */
  completo: boolean;
}

export function estadoFacturas(params: { modalidad: ModalidadFactura; sesiones: SesionMinima[]; facturas: RegistroFinancieroEvento[] }): EstadoFacturas {
  const { sesiones, facturas } = params;
  const modalidad = modalidadEfectiva(params.modalidad, sesiones);
  const usadas = new Set<string>();
  let cupos: CupoFactura[];
  if (modalidad === "por_sesion") {
    cupos = sesiones.map((s) => {
      const factura = facturas.find((f) => f.sesionId === s.id && !usadas.has(f.id)) ?? null;
      if (factura) usadas.add(factura.id);
      return { sesionId: s.id, factura };
    });
  } else {
    const factura = facturas[0] ?? null;
    if (factura) usadas.add(factura.id);
    cupos = [{ sesionId: null, factura }];
  }
  return {
    modalidad,
    capacidad: cupos.length,
    cupos,
    sobrantes: facturas.filter((f) => !usadas.has(f.id)),
    completo: cupos.every((c) => c.factura !== null),
  };
}

/**
 * ¿Se puede cargar una factura más? Devuelve el motivo si NO se puede (o `null` si sí).
 * `sesionId` solo aplica a «factura por sesión».
 */
export function validarNuevaFactura(params: {
  modalidad: ModalidadFactura;
  sesiones: SesionMinima[];
  facturas: RegistroFinancieroEvento[];
  sesionId?: string | null;
}): string | null {
  const { sesiones, facturas } = params;
  const modalidad = modalidadEfectiva(params.modalidad, sesiones);
  if (modalidad === "unica") {
    return facturas.length >= 1
      ? "Este speaker factura una sola vez por toda su participación (factura única) y ya tiene su factura cargada. Para cambiarla, elimina la actual."
      : null;
  }
  if (!params.sesionId) return "Indica la sesión a la que corresponde la factura.";
  if (!sesiones.some((s) => s.id === params.sesionId)) return "Esa sesión no está entre las sesiones en las que participa el speaker.";
  return facturas.some((f) => f.sesionId === params.sesionId)
    ? "Esa sesión ya tiene su factura (este speaker factura una por sesión). Para cambiarla, elimina la actual."
    : null;
}

// --- Comprobantes de pago ---------------------------------------------------

/** Ids de las facturas que cubre un comprobante: la lista nueva o, en datos anteriores, la factura única que apuntaba. */
export function facturasDelComprobante(c: Pick<RegistroFinancieroEvento, "facturasIds" | "facturaId">): string[] {
  if (c.facturasIds && c.facturasIds.length > 0) return c.facturasIds;
  return c.facturaId ? [c.facturaId] : [];
}

/**
 * Facturas ya cubiertas por algún comprobante. Un comprobante antiguo SIN factura indicada solo se interpreta cuando no
 * hay ambigüedad: si el speaker tiene una única factura, ese comprobante la cubre.
 */
export function facturasCubiertas(facturas: RegistroFinancieroEvento[], comprobantes: RegistroFinancieroEvento[]): Set<string> {
  const cubiertas = new Set<string>();
  const ids = new Set(facturas.map((f) => f.id));
  for (const c of comprobantes) {
    const lista = facturasDelComprobante(c).filter((id) => ids.has(id));
    if (lista.length > 0) lista.forEach((id) => cubiertas.add(id));
    else if (facturasDelComprobante(c).length === 0 && facturas.length === 1) cubiertas.add(facturas[0].id);
  }
  return cubiertas;
}

/** Facturas todavía sin comprobante de pago: son las únicas a las que puede apuntar un comprobante nuevo. */
export function facturasPendientesDePago(facturas: RegistroFinancieroEvento[], comprobantes: RegistroFinancieroEvento[]): RegistroFinancieroEvento[] {
  const cubiertas = facturasCubiertas(facturas, comprobantes);
  return facturas.filter((f) => !cubiertas.has(f.id));
}

export type SituacionComprobantes = "sin_facturas" | "hay_pendientes" | "todo_cubierto";

export function situacionComprobantes(facturas: RegistroFinancieroEvento[], comprobantes: RegistroFinancieroEvento[]): SituacionComprobantes {
  if (facturas.length === 0) return "sin_facturas";
  return facturasPendientesDePago(facturas, comprobantes).length > 0 ? "hay_pendientes" : "todo_cubierto";
}

/** ¿Se puede cargar este comprobante? Devuelve el motivo si NO (o `null` si sí). */
export function validarNuevoComprobante(params: {
  facturas: RegistroFinancieroEvento[];
  comprobantes: RegistroFinancieroEvento[];
  facturasIds: string[];
}): string | null {
  const { facturas, comprobantes } = params;
  if (facturas.length === 0) return "Primero carga la factura del speaker: un comprobante de pago siempre cubre una o más facturas.";
  const pendientes = facturasPendientesDePago(facturas, comprobantes);
  if (pendientes.length === 0) return "Todas las facturas de este speaker ya están cubiertas por comprobantes de pago.";
  if (params.facturasIds.length === 0) return "Marca la factura (o las facturas) que cubre este comprobante.";
  const idsPendientes = new Set(pendientes.map((f) => f.id));
  if (params.facturasIds.some((id) => !idsPendientes.has(id))) return "Alguna de las facturas elegidas ya fue cubierta por otro comprobante de pago.";
  return null;
}

// --- Notificación de Pago ↔ factura ----------------------------------------

/** Notificación de Pago vigente (no Anulada ni Rechazada) que cubre la factura, si existe. */
export function notificacionDeFactura(
  factura: RegistroFinancieroEvento,
  notificaciones: Pick<NotificacionPagoHcp, "id" | "estado" | "facturaId">[],
): Pick<NotificacionPagoHcp, "id" | "estado" | "facturaId"> | null {
  return notificaciones.find((n) => notificacionVigente(n) && notificacionCubreFactura(n, factura)) ?? null;
}

/** Facturas del speaker que todavía no tienen su Notificación de Pago vigente. */
export function facturasSinNotificacion(
  facturas: RegistroFinancieroEvento[],
  notificaciones: Pick<NotificacionPagoHcp, "id" | "estado" | "facturaId">[],
): RegistroFinancieroEvento[] {
  return facturas.filter((f) => !notificacionDeFactura(f, notificaciones));
}
