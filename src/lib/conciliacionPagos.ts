import { traerEventos } from "@/lib/evento";
import { traerConvenios } from "@/lib/convenio";
import { traerConveniosHCP } from "@/lib/convenioHCP";
import { traerNotificacionesPago } from "@/lib/notificacionPago";
import { traerTodosLosRegistrosFinancieros } from "@/lib/repositorioEvento";
import { anotacionesDelSpeaker, traerTodasLasAnotacionesPago } from "@/lib/anotacionesPago";
import { formatearFechaHora } from "@/lib/fecha";
import { construirCSV } from "@/lib/csv";
import { notificacionCubreFactura } from "@/lib/facturasNotificacionPago";
import { facturasDelComprobante } from "@/lib/facturacionSpeaker";
import type { AnotacionPago, Convenio, ConvenioHcp, Evento, NotificacionPagoHcp, RegistroFinancieroEvento } from "@/types";
import { mismoPais } from "@/lib/paisCanonico";

/**
 * Entrega 32 — «Informe de Pagos a HCPs/Speakers» rehecho como CONCILIACIÓN de punta a punta:
 *
 *   Contratado (Convenio HCP / Convenio de Pago) → Orden de compra → Facturado → Pagado
 *
 * por evento, speaker y moneda, con hallazgos que explican cada diferencia, KPIs de cumplimiento y de
 * ciclo, y todo exportable a CSV. Son funciones puras (sin React ni red) salvo `traerDatosConciliacion`.
 *
 * Qué se considera cada etapa:
 *  - Presupuestado: honorarios del speaker en la Solicitud de Evento (solo informativo).
 *  - Contratado: Convenio HCP Aprobado/Completado (compensación). Si no hay, el Convenio de Pago a HCP
 *    Aprobado/Completado (contraprestación). Si ambos existen y difieren, es un hallazgo.
 *  - Orden de compra / Facturado / Pagado: registros del Expediente (`evento_registros_financieros`),
 *    categorías `ordenCompra`, `facturas` y `comprobantePago`.
 *  - Notificación de Pago: valor de las Notificaciones de Pago vigentes; se contrasta con lo facturado.
 */

export type EstadoConciliacion = "consistente" | "inconsistente" | "en_proceso";
export type Severidad = "error" | "pendiente" | "aviso";

export type CodigoHallazgo =
  | "contratado_sin_oc"
  | "oc_difiere_contratado"
  | "factura_sin_oc"
  | "factura_supera_oc"
  | "oc_sin_facturar"
  | "pago_sin_factura"
  | "pago_supera_factura"
  | "factura_sin_pagar"
  | "convenios_difieren"
  | "moneda_distinta"
  | "sin_convenio"
  | "notificacion_difiere"
  | "factura_sin_notificacion"
  | "contratado_supera_presupuesto"
  | "numero_duplicado"
  | "factura_anterior_oc"
  | "pago_anterior_factura"
  | "sin_speaker";

export const ETIQUETA_HALLAZGO: Record<CodigoHallazgo, string> = {
  contratado_sin_oc: "Contratado sin orden de compra",
  oc_difiere_contratado: "La orden de compra difiere de lo contratado",
  factura_sin_oc: "Hay facturas sin orden de compra",
  factura_supera_oc: "Lo facturado supera la orden de compra",
  oc_sin_facturar: "Orden de compra pendiente de facturar",
  pago_sin_factura: "Hay pagos sin factura",
  pago_supera_factura: "Lo pagado supera lo facturado",
  factura_sin_pagar: "Facturado pendiente de pago",
  convenios_difieren: "El Convenio de Pago y el Convenio HCP difieren",
  moneda_distinta: "Moneda distinta entre etapas",
  sin_convenio: "Aprobado y presupuestado, sin convenio",
  notificacion_difiere: "El valor notificado difiere de lo facturado",
  factura_sin_notificacion: "Factura sin Notificación de Pago",
  contratado_supera_presupuesto: "Lo contratado supera lo presupuestado",
  numero_duplicado: "Número de factura o comprobante repetido",
  factura_anterior_oc: "Factura con fecha anterior a la orden de compra",
  pago_anterior_factura: "Pago con fecha anterior a la factura",
  sin_speaker: "Registro sin speaker asignado",
};

export interface Hallazgo {
  codigo: CodigoHallazgo;
  severidad: Severidad;
  mensaje: string;
  /** Diferencia en la moneda de la fila (puede ser 0 si no aplica). */
  diferencia: number;
}

/** Entrega 37: un documento individual que alimenta una fila de la conciliación (para contrastarlo en «Pagos aprobados»). */
export interface DocumentoFila {
  tipo: DetalleDocumento["tipo"];
  /** Número del documento ("" en los convenios, que no tienen número propio). */
  numero: string;
  fecha: string | null;
  valor: number | null;
  moneda: string;
  estado: string;
  /** Solo comprobantes de pago: números de las facturas que cubre. */
  cubre?: string;
}

export interface FilaConciliacion {
  clave: string;
  eventoId: string;
  eventoNombre: string;
  pais: string;
  ciudad: string;
  fechaEvento: string | null;
  estadoEvento: string;
  speakerId: string | null;
  speakerNombre: string;
  speakerIdentificacion: string;
  moneda: string;
  presupuestado: number | null;
  convenioPago: number | null;
  convenioHcp: number | null;
  contratado: number;
  fuenteContratado: "Convenio HCP" | "Convenio de Pago" | "—";
  ordenCompra: number;
  facturado: number;
  notificado: number;
  pagado: number;
  nOrdenesCompra: number;
  nFacturas: number;
  nPagos: number;
  /** Entrega 37: convenios (HCP o de Pago) vigentes de la fila. */
  nConvenios: number;
  /** Entrega 37: Notificaciones de Pago en estado Aprobado/Completado, con su valor. */
  nNotificacionesAprobadas: number;
  notificadoAprobado: number;
  /** Entrega 37: todos los documentos que alimentan la fila, en orden de proceso (convenio → OC → factura → notificación → pago). */
  documentos: DocumentoFila[];
  /** Facturado − pagado (saldo por pagar). Negativo si se pagó de más. */
  saldoPorPagar: number;
  /** Orden de compra − facturado (saldo por facturar). Negativo si se facturó de más. */
  saldoPorFacturar: number;
  /** Contratado − orden de compra (lo contratado que aún no tiene OC). */
  saldoSinOc: number;
  /** Fecha de la factura más antigua con saldo por pagar (para antigüedad). */
  fechaFacturaMasAntigua: string | null;
  estado: EstadoConciliacion;
  hallazgos: Hallazgo[];
}

export interface DetalleDocumento {
  eventoId: string;
  eventoNombre: string;
  pais: string;
  speakerNombre: string;
  tipo: "Convenio HCP" | "Convenio de Pago a HCP" | "Orden de compra" | "Factura" | "Comprobante de pago" | "Notificación de Pago a HCPs";
  numero: string;
  fecha: string | null;
  valor: number | null;
  moneda: string;
  estado: string;
}

export interface DatosConciliacion {
  eventos: Evento[];
  convenios: Convenio[];
  conveniosHcp: ConvenioHcp[];
  notificaciones: NotificacionPagoHcp[];
  registros: RegistroFinancieroEvento[];
  /** Entrega 36: anotaciones de pago (comentarios del Expediente y aclaraciones del Informe), con su autor y fecha. */
  anotaciones?: AnotacionPago[];
}

export async function traerDatosConciliacion(): Promise<DatosConciliacion> {
  const [eventos, convenios, conveniosHcp, notificaciones, registros, anotaciones] = await Promise.all([
    traerEventos(),
    traerConvenios(),
    traerConveniosHCP(),
    traerNotificacionesPago(),
    traerTodosLosRegistrosFinancieros(),
    // Si las anotaciones fallan (tabla sin crear, permisos), el informe sigue funcionando sin ellas.
    traerTodasLasAnotacionesPago().catch(() => [] as AnotacionPago[]),
  ]);
  return { eventos, convenios, conveniosHcp, notificaciones, registros, anotaciones };
}

/** Entrega 36: anotaciones que corresponden a una fila de la conciliación (mismo evento y speaker; las de «todo el evento» también). */
export function anotacionesDeFila(anotaciones: AnotacionPago[], f: Pick<FilaConciliacion, "eventoId" | "speakerId">): AnotacionPago[] {
  return anotacionesDelSpeaker(anotaciones, f.eventoId, f.speakerId, true);
}

export interface OpcionesConciliacion {
  /** Tolerancia entre etapas, en % del valor de referencia (0 = deben coincidir al centavo). */
  toleranciaPct?: number;
  /** Incluye speakers con honorarios presupuestados que todavía no tienen convenio ni movimientos. */
  incluirPendientesDeContratar?: boolean;
}

const ESTADOS_VIGENTES = new Set(["Aprobado", "Completado"]);
const redondear = (n: number) => Math.round(n * 100) / 100;
const MONEDA_SIN = "—";

function igualesConTolerancia(a: number, b: number, tolPct: number): boolean {
  const base = Math.max(Math.abs(a), Math.abs(b));
  const tol = base * (tolPct / 100);
  return Math.abs(redondear(a) - redondear(b)) <= Math.max(tol, 0.004);
}

const norm = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Entrega 37: misma normalización (sin tildes ni mayúsculas) que usa la conciliación para comparar nombres. */
export const normalizarNombreConciliacion = norm;

interface Acumulado {
  oc: RegistroFinancieroEvento[];
  facturas: RegistroFinancieroEvento[];
  pagos: RegistroFinancieroEvento[];
  convenioPago: { valor: number; fecha: string | null; doc: Convenio }[];
  convenioHcp: { valor: number; fecha: string | null; doc: ConvenioHcp }[];
  notificaciones: NotificacionPagoHcp[];
  presupuestado: number | null;
}

const vacio = (): Acumulado => ({ oc: [], facturas: [], pagos: [], convenioPago: [], convenioHcp: [], notificaciones: [], presupuestado: null });

/** Entrega 37: los documentos que alimentan una fila, para mostrarlos y exportarlos junto al contraste de valores. */
function documentosDeLaFila(a: Acumulado, registros: RegistroFinancieroEvento[], moneda: string): DocumentoFila[] {
  const docs: DocumentoFila[] = [];
  const mon = moneda === MONEDA_SIN ? "" : moneda;
  for (const c of a.convenioHcp) docs.push({ tipo: "Convenio HCP", numero: "", fecha: c.fecha, valor: c.valor, moneda: mon, estado: c.doc.estado });
  for (const c of a.convenioPago) docs.push({ tipo: "Convenio de Pago a HCP", numero: "", fecha: c.fecha, valor: c.valor, moneda: mon, estado: c.doc.estado });
  const registro = (tipo: DocumentoFila["tipo"], r: RegistroFinancieroEvento, cubre?: string): DocumentoFila => ({ tipo, numero: r.numero, fecha: r.fecha, valor: r.valor, moneda: mon, estado: "Registrado", cubre });
  for (const r of a.oc) docs.push(registro("Orden de compra", r));
  for (const r of a.facturas) docs.push(registro("Factura", r));
  for (const n of a.notificaciones) docs.push({ tipo: "Notificación de Pago a HCPs", numero: n.numeroFactura ?? "", fecha: n.fechaFactura, valor: n.valorFactura, moneda: mon, estado: n.estado });
  for (const r of a.pagos) {
    const numeros = facturasDelComprobante(r)
      .map((id) => registros.find((x) => x.id === id)?.numero)
      .filter(Boolean)
      .join(", ");
    docs.push(registro("Comprobante de pago", r, numeros || undefined));
  }
  return docs;
}

/**
 * Arma las filas de conciliación (una por evento + speaker + moneda) y los hallazgos de cada una.
 */
export function construirConciliacion(datos: DatosConciliacion, opciones: OpcionesConciliacion = {}): FilaConciliacion[] {
  const tol = opciones.toleranciaPct ?? 0;
  const eventosPorId = new Map(datos.eventos.map((e) => [e.id, e]));

  // Speakers externos de cada evento (para asignar registros sin speaker cuando solo hay uno).
  const externosDe = (ev: Evento) => (ev.speakersParticipacion ?? []).filter((s) => s.tipo === "externo");
  const unicoSpeakerExterno = (ev: Evento) => {
    const ext = externosDe(ev);
    return ext.length === 1 ? ext[0].speakerId ?? `n:${norm(ext[0].nombreSpeaker)}` : null;
  };

  // eventoId → speakerKey → moneda → acumulado
  const mapa = new Map<string, Map<string, Map<string, Acumulado>>>();
  const nombres = new Map<string, { nombre: string; ident: string; id: string | null }>();
  const sinSpeakerKey = "__sin_speaker__";

  function acumulado(eventoId: string, speakerKey: string, moneda: string): Acumulado {
    let porSpeaker = mapa.get(eventoId);
    if (!porSpeaker) mapa.set(eventoId, (porSpeaker = new Map()));
    let porMoneda = porSpeaker.get(speakerKey);
    if (!porMoneda) porSpeaker.set(speakerKey, (porMoneda = new Map()));
    let a = porMoneda.get(moneda);
    if (!a) porMoneda.set(moneda, (a = vacio()));
    return a;
  }
  function claveSpeaker(eventoId: string, speakerId: string | null, nombre?: string): string {
    if (speakerId) return speakerId;
    const ev = eventosPorId.get(eventoId);
    const unico = ev ? unicoSpeakerExterno(ev) : null;
    if (unico) return unico;
    if (nombre && norm(nombre)) return `n:${norm(nombre)}`;
    return sinSpeakerKey;
  }
  function recordarNombre(clave: string, nombre: string, ident: string, id: string | null) {
    const previo = nombres.get(clave);
    if (!previo || (!previo.nombre && nombre) || (!previo.ident && ident)) nombres.set(clave, { nombre: nombre || previo?.nombre || "", ident: ident || previo?.ident || "", id: id ?? previo?.id ?? null });
  }

  // 1. Presupuesto de la solicitud (solo eventos Aprobados/Completados con speakers externos).
  for (const ev of datos.eventos) {
    if (!ESTADOS_VIGENTES.has(ev.estado)) continue;
    for (const sp of externosDe(ev)) {
      const clave = sp.speakerId ?? `n:${norm(sp.nombreSpeaker)}`;
      recordarNombre(clave, sp.nombreSpeaker, "", sp.speakerId);
      const a = acumulado(ev.id, clave, ev.moneda || MONEDA_SIN);
      a.presupuestado = (a.presupuestado ?? 0) + (sp.montoHonorarios ?? 0);
    }
  }

  // 2. Convenios (solo Aprobado/Completado).
  for (const c of datos.convenios) {
    if (!c.eventoOrigenId || !ESTADOS_VIGENTES.has(c.estado) || c.contraprestacionHCP == null) continue;
    const clave = claveSpeaker(c.eventoOrigenId, c.speakerId, c.hcpNombreCompleto);
    recordarNombre(clave, c.hcpNombreCompleto, c.hcpCedulaLicencia, c.speakerId);
    acumulado(c.eventoOrigenId, clave, c.monedaContraprestacion || MONEDA_SIN).convenioPago.push({ valor: c.contraprestacionHCP, fecha: c.fechaInicioActividad, doc: c });
  }
  for (const c of datos.conveniosHcp) {
    if (!c.eventoOrigenId || !ESTADOS_VIGENTES.has(c.estado) || c.compensacion == null) continue;
    const clave = claveSpeaker(c.eventoOrigenId, c.speakerId, c.consultorNombre);
    recordarNombre(clave, c.consultorNombre, c.consultorIdentificacion, c.speakerId);
    acumulado(c.eventoOrigenId, clave, c.moneda || MONEDA_SIN).convenioHcp.push({ valor: c.compensacion, fecha: c.fechaEfectiva, doc: c });
  }

  // 3. Registros del Expediente.
  for (const r of datos.registros) {
    if (r.categoria !== "ordenCompra" && r.categoria !== "facturas" && r.categoria !== "comprobantePago") continue;
    if (!eventosPorId.has(r.eventoId)) continue;
    const clave = claveSpeaker(r.eventoId, r.speakerId);
    const a = acumulado(r.eventoId, clave, r.moneda || MONEDA_SIN);
    (r.categoria === "ordenCompra" ? a.oc : r.categoria === "facturas" ? a.facturas : a.pagos).push(r);
  }

  // 4. Notificaciones de Pago vigentes: se asocian por la factura que cubren; si no, por evento+speaker.
  for (const n of datos.notificaciones) {
    if (!n.eventoOrigenId || n.estado === "Anulado" || n.estado === "Rechazado" || n.estado === "Borrador") continue;
    const factura = datos.registros.find((r) => r.categoria === "facturas" && r.eventoId === n.eventoOrigenId && notificacionCubreFactura(n, r));
    const clave = factura ? claveSpeaker(factura.eventoId, factura.speakerId ?? n.speakerId, n.nombreProfesionalSalud) : claveSpeaker(n.eventoOrigenId, n.speakerId, n.nombreProfesionalSalud);
    recordarNombre(clave, n.nombreProfesionalSalud, n.numeroDocumentoIdentidad || n.cedulaLicenciaProfesional, n.speakerId);
    acumulado(n.eventoOrigenId, clave, n.monedaFactura || factura?.moneda || MONEDA_SIN).notificaciones.push(n);
  }

  // 5. Filas.
  const filas: FilaConciliacion[] = [];
  for (const [eventoId, porSpeaker] of mapa) {
    const ev = eventosPorId.get(eventoId);
    if (!ev) continue;
    for (const [speakerKey, porMoneda] of porSpeaker) {
      const monedas = [...porMoneda.keys()];
      // Moneda distinta entre etapas: hay actividad real (contrato, OC, factura o pago) en más de una moneda.
      const monedasConMovimiento = monedas.filter((m) => {
        const a = porMoneda.get(m)!;
        return a.convenioHcp.length + a.convenioPago.length + a.oc.length + a.facturas.length + a.pagos.length > 0;
      });
      const hayMonedaDistinta = monedasConMovimiento.length > 1;

      for (const moneda of monedas) {
        const a = porMoneda.get(moneda)!;
        const suma = (xs: RegistroFinancieroEvento[]) => redondear(xs.reduce((t, r) => t + (r.valor ?? 0), 0));
        const convenioHcp = a.convenioHcp.length ? redondear(a.convenioHcp.reduce((t, c) => t + c.valor, 0)) : null;
        const convenioPago = a.convenioPago.length ? redondear(a.convenioPago.reduce((t, c) => t + c.valor, 0)) : null;
        const contratado = convenioHcp ?? convenioPago ?? 0;
        const fuente: FilaConciliacion["fuenteContratado"] = convenioHcp != null ? "Convenio HCP" : convenioPago != null ? "Convenio de Pago" : "—";
        const ordenCompra = suma(a.oc);
        const facturado = suma(a.facturas);
        const pagado = suma(a.pagos);
        const notificado = redondear(a.notificaciones.reduce((t, n) => t + (n.valorFactura ?? 0), 0));
        const hayMovimiento = a.oc.length + a.facturas.length + a.pagos.length + a.convenioHcp.length + a.convenioPago.length + a.notificaciones.length > 0;
        if (!hayMovimiento && !opciones.incluirPendientesDeContratar) continue;
        if (!hayMovimiento && !((a.presupuestado ?? 0) > 0)) continue;

        const info = nombres.get(speakerKey) ?? { nombre: speakerKey === sinSpeakerKey ? "(sin speaker asignado)" : "", ident: "", id: null };
        const hallazgos: Hallazgo[] = [];
        const add = (codigo: CodigoHallazgo, severidad: Severidad, mensaje: string, diferencia = 0) => hallazgos.push({ codigo, severidad, mensaje, diferencia: redondear(diferencia) });
        const fm = (n: number) => `${n.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda === MONEDA_SIN ? "" : moneda}`.trim();

        if (speakerKey === sinSpeakerKey) add("sin_speaker", "aviso", "Hay registros financieros del evento sin speaker asignado; asígnalos desde el Expediente para poder conciliar por speaker.");
        if (hayMonedaDistinta && monedasConMovimiento.includes(moneda)) {
          add("moneda_distinta", "error", `Este speaker tiene movimientos en monedas distintas (${monedasConMovimiento.join(", ")}); no se pueden contrastar entre sí.`);
        }
        if (convenioHcp != null && convenioPago != null && !igualesConTolerancia(convenioHcp, convenioPago, tol)) {
          add("convenios_difieren", "error", `Convenio HCP (${fm(convenioHcp)}) y Convenio de Pago (${fm(convenioPago)}) no coinciden.`, convenioHcp - convenioPago);
        }
        if (contratado > 0 && (a.presupuestado ?? 0) > 0 && contratado > (a.presupuestado ?? 0) && !igualesConTolerancia(contratado, a.presupuestado ?? 0, tol)) {
          add("contratado_supera_presupuesto", "aviso", `Lo contratado (${fm(contratado)}) supera los honorarios presupuestados (${fm(a.presupuestado ?? 0)}).`, contratado - (a.presupuestado ?? 0));
        }
        if (fuente === "—" && (a.presupuestado ?? 0) > 0 && a.oc.length + a.facturas.length + a.pagos.length === 0) {
          add("sin_convenio", "pendiente", "El evento está aprobado y el speaker tiene honorarios presupuestados, pero aún no hay convenio aprobado.");
        }
        // Contratado ↔ OC
        if (contratado > 0 && a.oc.length === 0) {
          // Si ya hay factura/pago sin OC se reporta abajo como error; aquí solo es una pendiente de proceso.
          if (a.facturas.length + a.pagos.length === 0) add("contratado_sin_oc", "pendiente", `Contratado ${fm(contratado)} sin orden de compra cargada.`, contratado);
        } else if (contratado > 0 && a.oc.length > 0 && !igualesConTolerancia(contratado, ordenCompra, tol)) {
          add("oc_difiere_contratado", "error", `La orden de compra (${fm(ordenCompra)}) no coincide con lo contratado (${fm(contratado)}).`, ordenCompra - contratado);
        }
        // OC ↔ factura
        if (a.facturas.length > 0 && a.oc.length === 0) {
          add("factura_sin_oc", "error", `Se facturó ${fm(facturado)} sin orden de compra.`, facturado);
        } else if (a.oc.length > 0 && a.facturas.length > 0) {
          if (facturado > ordenCompra && !igualesConTolerancia(facturado, ordenCompra, tol)) add("factura_supera_oc", "error", `Lo facturado (${fm(facturado)}) supera la orden de compra (${fm(ordenCompra)}).`, facturado - ordenCompra);
          else if (facturado < ordenCompra && !igualesConTolerancia(facturado, ordenCompra, tol)) add("oc_sin_facturar", "pendiente", `Faltan ${fm(ordenCompra - facturado)} por facturar de la orden de compra.`, ordenCompra - facturado);
        } else if (a.oc.length > 0 && a.facturas.length === 0 && ordenCompra > 0) {
          add("oc_sin_facturar", "pendiente", `Orden de compra de ${fm(ordenCompra)} sin facturas.`, ordenCompra);
        }
        // Factura ↔ pago
        if (a.pagos.length > 0 && a.facturas.length === 0) {
          add("pago_sin_factura", "error", `Se pagó ${fm(pagado)} sin factura registrada.`, pagado);
        } else if (a.facturas.length > 0 && a.pagos.length > 0) {
          if (pagado > facturado && !igualesConTolerancia(pagado, facturado, tol)) add("pago_supera_factura", "error", `Lo pagado (${fm(pagado)}) supera lo facturado (${fm(facturado)}).`, pagado - facturado);
          else if (pagado < facturado && !igualesConTolerancia(pagado, facturado, tol)) add("factura_sin_pagar", "pendiente", `Faltan ${fm(facturado - pagado)} por pagar de lo facturado.`, facturado - pagado);
        } else if (a.facturas.length > 0 && a.pagos.length === 0 && facturado > 0) {
          add("factura_sin_pagar", "pendiente", `Facturado ${fm(facturado)} sin comprobante de pago.`, facturado);
        }
        // Notificación de Pago ↔ facturas
        if (a.facturas.length > 0 && a.notificaciones.length === 0) {
          add("factura_sin_notificacion", "pendiente", "Hay facturas sin Notificación de Pago a HCPs.", facturado);
        } else if (a.facturas.length > 0 && a.notificaciones.length > 0) {
          const cubiertas = a.facturas.filter((f) => a.notificaciones.some((n) => notificacionCubreFactura(n, f)));
          const sinCubrir = a.facturas.length - cubiertas.length;
          if (sinCubrir > 0) add("factura_sin_notificacion", "pendiente", `${sinCubrir} factura(s) sin Notificación de Pago.`, suma(a.facturas.filter((f) => !cubiertas.includes(f))));
          if (cubiertas.length > 0 && !igualesConTolerancia(notificado, suma(cubiertas), tol)) {
            add("notificacion_difiere", "error", `El valor notificado (${fm(notificado)}) no coincide con las facturas cubiertas (${fm(suma(cubiertas))}).`, notificado - suma(cubiertas));
          }
        }
        // Números repetidos
        const repetidos = (xs: RegistroFinancieroEvento[]) => {
          const vistos = new Map<string, number>();
          for (const x of xs) if (x.numero.trim()) vistos.set(norm(x.numero), (vistos.get(norm(x.numero)) ?? 0) + 1);
          return [...vistos.entries()].filter(([, n]) => n > 1).length;
        };
        if (repetidos(a.facturas) + repetidos(a.pagos) + repetidos(a.oc) > 0) add("numero_duplicado", "error", "Hay números de factura, comprobante u orden de compra repetidos dentro de este speaker.");
        // Fechas
        const minFecha = (xs: RegistroFinancieroEvento[]) => xs.map((x) => x.fecha).filter((f): f is string => !!f).sort()[0] ?? null;
        const ocMin = minFecha(a.oc);
        const facMin = minFecha(a.facturas);
        const pagoMin = minFecha(a.pagos);
        if (ocMin && facMin && facMin < ocMin) add("factura_anterior_oc", "aviso", `La primera factura (${facMin}) es anterior a la orden de compra (${ocMin}).`);
        if (facMin && pagoMin && pagoMin < facMin) add("pago_anterior_factura", "aviso", `El primer pago (${pagoMin}) es anterior a la primera factura (${facMin}).`);

        const hayError = hallazgos.some((h) => h.severidad === "error");
        const hayPendiente = hallazgos.some((h) => h.severidad === "pendiente");
        const completo = contratado > 0 && a.oc.length > 0 && a.facturas.length > 0 && a.pagos.length > 0;
        const estado: EstadoConciliacion = hayError ? "inconsistente" : hayPendiente || !completo ? "en_proceso" : "consistente";

        const facturasConSaldo = a.facturas.filter((f) => f.fecha).map((f) => f.fecha as string).sort();

        filas.push({
          clave: `${eventoId}|${speakerKey}|${moneda}`,
          eventoId,
          eventoNombre: ev.nombreEvento,
          pais: ev.pais,
          ciudad: ev.ciudad,
          fechaEvento: ev.fechaInicioEvento,
          estadoEvento: ev.estado,
          speakerId: info.id,
          speakerNombre: info.nombre,
          speakerIdentificacion: info.ident,
          moneda,
          presupuestado: a.presupuestado,
          convenioPago,
          convenioHcp,
          contratado,
          fuenteContratado: fuente,
          ordenCompra,
          facturado,
          notificado,
          pagado,
          nOrdenesCompra: a.oc.length,
          nFacturas: a.facturas.length,
          nPagos: a.pagos.length,
          nConvenios: a.convenioHcp.length + a.convenioPago.length,
          nNotificacionesAprobadas: a.notificaciones.filter((n) => ESTADOS_VIGENTES.has(n.estado)).length,
          notificadoAprobado: redondear(a.notificaciones.filter((n) => ESTADOS_VIGENTES.has(n.estado)).reduce((t, n) => t + (n.valorFactura ?? 0), 0)),
          documentos: documentosDeLaFila(a, datos.registros, moneda),
          saldoPorPagar: redondear(facturado - pagado),
          saldoPorFacturar: redondear(ordenCompra - facturado),
          saldoSinOc: redondear(contratado - ordenCompra),
          fechaFacturaMasAntigua: facturado - pagado > 0.004 ? facturasConSaldo[0] ?? null : null,
          estado,
          hallazgos,
        });
      }
    }
  }
  return filas.sort((a, b) => (b.fechaEvento ?? "").localeCompare(a.fechaEvento ?? "") || a.eventoNombre.localeCompare(b.eventoNombre, "es") || a.speakerNombre.localeCompare(b.speakerNombre, "es"));
}

/** Documentos individuales que alimentan la conciliación (para auditar y para el CSV de detalle). */
export function construirDetalleDocumentos(datos: DatosConciliacion, soloSpeakers?: Set<string>): DetalleDocumento[] {
  const eventos = new Map(datos.eventos.map((e) => [e.id, e]));
  const speakerPorEvento = (eventoId: string, speakerId: string | null) => {
    const ev = eventos.get(eventoId);
    const sp = ev?.speakersParticipacion.find((s) => s.speakerId && s.speakerId === speakerId);
    if (sp) return sp.nombreSpeaker;
    const externos = (ev?.speakersParticipacion ?? []).filter((s) => s.tipo === "externo");
    return externos.length === 1 && !speakerId ? externos[0].nombreSpeaker : "";
  };
  const filas: DetalleDocumento[] = [];
  const base = (eventoId: string) => ({ eventoId, eventoNombre: eventos.get(eventoId)?.nombreEvento ?? "", pais: eventos.get(eventoId)?.pais ?? "" });
  for (const c of datos.conveniosHcp) {
    if (!c.eventoOrigenId || !eventos.has(c.eventoOrigenId)) continue;
    filas.push({ ...base(c.eventoOrigenId), speakerNombre: c.consultorNombre, tipo: "Convenio HCP", numero: c.id, fecha: c.fechaEfectiva, valor: c.compensacion, moneda: c.moneda, estado: c.estado });
  }
  for (const c of datos.convenios) {
    if (!c.eventoOrigenId || !eventos.has(c.eventoOrigenId)) continue;
    filas.push({ ...base(c.eventoOrigenId), speakerNombre: c.hcpNombreCompleto, tipo: "Convenio de Pago a HCP", numero: c.id, fecha: c.fechaInicioActividad, valor: c.contraprestacionHCP, moneda: c.monedaContraprestacion, estado: c.estado });
  }
  const etiquetaCategoria = { ordenCompra: "Orden de compra", facturas: "Factura", comprobantePago: "Comprobante de pago" } as const;
  for (const r of datos.registros) {
    if (r.categoria !== "ordenCompra" && r.categoria !== "facturas" && r.categoria !== "comprobantePago") continue;
    if (!eventos.has(r.eventoId)) continue;
    filas.push({ ...base(r.eventoId), speakerNombre: speakerPorEvento(r.eventoId, r.speakerId), tipo: etiquetaCategoria[r.categoria], numero: r.numero, fecha: r.fecha, valor: r.valor, moneda: r.moneda, estado: "Registrado" });
  }
  for (const n of datos.notificaciones) {
    if (!n.eventoOrigenId || !eventos.has(n.eventoOrigenId)) continue;
    filas.push({ ...base(n.eventoOrigenId), speakerNombre: n.nombreProfesionalSalud, tipo: "Notificación de Pago a HCPs", numero: n.numeroFactura ?? "", fecha: n.fechaFactura, valor: n.valorFactura, moneda: n.monedaFactura ?? "", estado: n.estado });
  }
  // Entrega 37: con un speaker elegido en el filtro, solo sus documentos (se compara por nombre normalizado).
  const restringidas = soloSpeakers && soloSpeakers.size > 0 ? filas.filter((d) => soloSpeakers.has(norm(d.speakerNombre))) : filas;
  return restringidas.sort((a, b) => a.eventoNombre.localeCompare(b.eventoNombre, "es") || a.speakerNombre.localeCompare(b.speakerNombre, "es") || a.tipo.localeCompare(b.tipo, "es") || (a.fecha ?? "").localeCompare(b.fecha ?? ""));
}

// --- Filtros ---------------------------------------------------------------

export interface FiltrosConciliacion {
  desde?: string;
  hasta?: string;
  pais?: string;
  eventoId?: string;
  /** Entrega 37: speaker elegido en el selector (ver `claveSpeakerFila`). */
  speaker?: string;
  moneda?: string;
  estado?: EstadoConciliacion | "";
  busqueda?: string;
  codigoHallazgo?: CodigoHallazgo | "";
}

/** Entrega 37: identificador del speaker de una fila para el selector «Speaker» (el id del Repositorio o, si no hay, su nombre normalizado). */
export function claveSpeakerFila(f: Pick<FilaConciliacion, "speakerId" | "speakerNombre">): string {
  return f.speakerId ?? `n:${norm(f.speakerNombre)}`;
}

export function filtrarConciliacion(filas: FilaConciliacion[], f: FiltrosConciliacion): FilaConciliacion[] {
  const q = norm(f.busqueda);
  return filas.filter((x) => {
    const fecha = x.fechaEvento ?? "";
    if (f.desde && (!fecha || fecha < f.desde)) return false;
    if (f.hasta && (!fecha || fecha > f.hasta)) return false;
    if (f.pais && !mismoPais(x.pais, f.pais)) return false;
    if (f.eventoId && x.eventoId !== f.eventoId) return false;
    if (f.speaker && claveSpeakerFila(x) !== f.speaker) return false;
    if (f.moneda && x.moneda !== f.moneda) return false;
    if (f.estado && x.estado !== f.estado) return false;
    if (f.codigoHallazgo && !x.hallazgos.some((h) => h.codigo === f.codigoHallazgo)) return false;
    if (q && !(norm(x.speakerNombre).includes(q) || norm(x.eventoNombre).includes(q) || norm(x.speakerIdentificacion).includes(q))) return false;
    return true;
  });
}

// --- KPIs ------------------------------------------------------------------

export interface TotalesMoneda {
  moneda: string;
  presupuestado: number;
  contratado: number;
  ordenCompra: number;
  facturado: number;
  notificado: number;
  pagado: number;
  saldoPorFacturar: number;
  saldoPorPagar: number;
  saldoSinOc: number;
  /** Suma de |diferencias| de los hallazgos de tipo error: dinero en juego por inconsistencias. */
  montoEnInconsistencia: number;
  /** Cobertura OC = OC / contratado. */
  coberturaOc: number | null;
  /** Avance de facturación = facturado / OC. */
  avanceFacturacion: number | null;
  /** Avance de pago = pagado / facturado. */
  avancePago: number | null;
  /** Ejecución total = pagado / contratado. */
  ejecucionTotal: number | null;
}

export interface AntiguedadSaldo {
  rango: string;
  monto: number;
  filas: number;
}

export interface KpisPagos {
  totalFilas: number;
  consistentes: number;
  inconsistentes: number;
  enProceso: number;
  /** % de filas consistentes sobre el total. */
  pctConsistencia: number | null;
  speakers: number;
  eventos: number;
  porMoneda: TotalesMoneda[];
  hallazgos: { codigo: CodigoHallazgo; etiqueta: string; severidad: Severidad; filas: number }[];
  /** Días promedio entre pasos (null si no hay fechas suficientes). */
  diasOcAFactura: number | null;
  diasFacturaAPago: number | null;
  diasEventoAPago: number | null;
  antiguedad: { moneda: string; rangos: AntiguedadSaldo[] }[];
  facturasSinOc: number;
  facturasSinNotificacion: number;
  pagosSinFactura: number;
  porPais: { pais: string; filas: number; inconsistentes: number; contratado: number; pagado: number; moneda: string }[];
  topSpeakers: { speakerNombre: string; moneda: string; pagado: number; contratado: number }[];
}

const diasEntre = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
const promedio = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export function calcularKpisPagos(filas: FilaConciliacion[], datos: DatosConciliacion, hoy: Date = new Date()): KpisPagos {
  const idsFilas = new Set(filas.map((f) => f.eventoId));
  const registros = datos.registros.filter((r) => idsFilas.has(r.eventoId));
  const monedas = [...new Set(filas.map((f) => f.moneda))].sort();

  const porMoneda: TotalesMoneda[] = monedas.map((moneda) => {
    const fs = filas.filter((f) => f.moneda === moneda);
    const s = (g: (f: FilaConciliacion) => number) => redondear(fs.reduce((t, f) => t + g(f), 0));
    const contratado = s((f) => f.contratado);
    const oc = s((f) => f.ordenCompra);
    const fa = s((f) => f.facturado);
    const pa = s((f) => f.pagado);
    return {
      moneda,
      presupuestado: s((f) => f.presupuestado ?? 0),
      contratado,
      ordenCompra: oc,
      facturado: fa,
      notificado: s((f) => f.notificado),
      pagado: pa,
      saldoPorFacturar: s((f) => f.saldoPorFacturar),
      saldoPorPagar: s((f) => f.saldoPorPagar),
      saldoSinOc: s((f) => f.saldoSinOc),
      montoEnInconsistencia: redondear(fs.reduce((t, f) => t + f.hallazgos.filter((h) => h.severidad === "error").reduce((u, h) => u + Math.abs(h.diferencia), 0), 0)),
      coberturaOc: contratado > 0 ? oc / contratado : null,
      avanceFacturacion: oc > 0 ? fa / oc : null,
      avancePago: fa > 0 ? pa / fa : null,
      ejecucionTotal: contratado > 0 ? pa / contratado : null,
    };
  });

  const conteoHallazgos = new Map<CodigoHallazgo, { severidad: Severidad; filas: number }>();
  for (const f of filas) {
    for (const h of f.hallazgos) {
      const p = conteoHallazgos.get(h.codigo);
      if (p) p.filas += 1;
      else conteoHallazgos.set(h.codigo, { severidad: h.severidad, filas: 1 });
    }
  }

  // Tiempos entre pasos: primera OC → primera factura → último pago, por evento+speaker.
  const claveRegistro = (r: RegistroFinancieroEvento) => `${r.eventoId}|${r.speakerId ?? ""}`;
  const grupos = new Map<string, { oc: string[]; fa: string[]; pa: string[]; evento: string | null }>();
  const eventos = new Map(datos.eventos.map((e) => [e.id, e]));
  for (const r of registros) {
    if (!r.fecha) continue;
    const g = grupos.get(claveRegistro(r)) ?? { oc: [], fa: [], pa: [], evento: eventos.get(r.eventoId)?.fechaInicioEvento ?? null };
    (r.categoria === "ordenCompra" ? g.oc : r.categoria === "facturas" ? g.fa : r.categoria === "comprobantePago" ? g.pa : []).push(r.fecha);
    grupos.set(claveRegistro(r), g);
  }
  const d1: number[] = [], d2: number[] = [], d3: number[] = [];
  for (const g of grupos.values()) {
    if (g.oc.length && g.fa.length) d1.push(diasEntre(g.oc.sort()[0], g.fa.sort()[0]));
    if (g.fa.length && g.pa.length) d2.push(diasEntre(g.fa.sort()[0], g.pa.sort().slice(-1)[0]));
    if (g.evento && g.pa.length) d3.push(diasEntre(g.evento, g.pa.sort().slice(-1)[0]));
  }

  // Antigüedad del saldo por pagar según la factura más antigua pendiente.
  const rangosBase = [
    { rango: "0-30 días", max: 30 },
    { rango: "31-60 días", max: 60 },
    { rango: "61-90 días", max: 90 },
    { rango: "Más de 90 días", max: Infinity },
  ];
  const antiguedad = monedas.map((moneda) => {
    const rangos: AntiguedadSaldo[] = rangosBase.map((r) => ({ rango: r.rango, monto: 0, filas: 0 }));
    for (const f of filas.filter((x) => x.moneda === moneda && x.saldoPorPagar > 0.004)) {
      const dias = f.fechaFacturaMasAntigua ? Math.max(0, diasEntre(f.fechaFacturaMasAntigua, hoy.toISOString().slice(0, 10))) : 0;
      const i = rangosBase.findIndex((r) => dias <= r.max);
      rangos[i].monto = redondear(rangos[i].monto + f.saldoPorPagar);
      rangos[i].filas += 1;
    }
    return { moneda, rangos };
  });

  const paisKey = new Map<string, { pais: string; moneda: string; filas: number; inconsistentes: number; contratado: number; pagado: number }>();
  for (const f of filas) {
    const k = `${f.pais}|${f.moneda}`;
    const p = paisKey.get(k) ?? { pais: f.pais || "(sin país)", moneda: f.moneda, filas: 0, inconsistentes: 0, contratado: 0, pagado: 0 };
    p.filas += 1;
    if (f.estado === "inconsistente") p.inconsistentes += 1;
    p.contratado = redondear(p.contratado + f.contratado);
    p.pagado = redondear(p.pagado + f.pagado);
    paisKey.set(k, p);
  }

  const total = filas.length;
  const consistentes = filas.filter((f) => f.estado === "consistente").length;
  return {
    totalFilas: total,
    consistentes,
    inconsistentes: filas.filter((f) => f.estado === "inconsistente").length,
    enProceso: filas.filter((f) => f.estado === "en_proceso").length,
    pctConsistencia: total ? consistentes / total : null,
    speakers: new Set(filas.map((f) => f.speakerId ?? f.speakerNombre)).size,
    eventos: new Set(filas.map((f) => f.eventoId)).size,
    porMoneda,
    hallazgos: [...conteoHallazgos.entries()]
      .map(([codigo, v]) => ({ codigo, etiqueta: ETIQUETA_HALLAZGO[codigo], severidad: v.severidad, filas: v.filas }))
      .sort((a, b) => b.filas - a.filas),
    diasOcAFactura: promedio(d1),
    diasFacturaAPago: promedio(d2),
    diasEventoAPago: promedio(d3),
    antiguedad,
    facturasSinOc: filas.filter((f) => f.hallazgos.some((h) => h.codigo === "factura_sin_oc")).length,
    facturasSinNotificacion: filas.filter((f) => f.hallazgos.some((h) => h.codigo === "factura_sin_notificacion")).length,
    pagosSinFactura: filas.filter((f) => f.hallazgos.some((h) => h.codigo === "pago_sin_factura")).length,
    porPais: [...paisKey.values()].sort((a, b) => b.inconsistentes - a.inconsistentes || b.filas - a.filas),
    topSpeakers: [...filas]
      .filter((f) => f.pagado > 0 || f.contratado > 0)
      .sort((a, b) => b.pagado - a.pagado || b.contratado - a.contratado)
      .slice(0, 10)
      .map((f) => ({ speakerNombre: f.speakerNombre, moneda: f.moneda, pagado: f.pagado, contratado: f.contratado })),
  };
}

// --- CSV -------------------------------------------------------------------

export const ETIQUETA_ESTADO_CONCILIACION: Record<EstadoConciliacion, string> = {
  consistente: "Consistente",
  inconsistente: "Inconsistente",
  en_proceso: "En proceso",
};

/** Una fila por evento + speaker + moneda. Los porcentajes van como número (0-100) para poder usarlos en tablas dinámicas. */
export function construirCSVConciliacion(filas: FilaConciliacion[]): string {
  const encabezados = [
    "Evento", "País", "Ciudad", "Fecha del evento", "Estado del evento", "Speaker", "Identificación", "Moneda",
    "Presupuestado (honorarios)", "Convenio de Pago", "Convenio HCP", "Contratado (referencia)", "Fuente de lo contratado",
    "Orden de compra", "N.º órdenes de compra", "Facturado", "N.º facturas", "Notificado (Notificación de Pago)", "Pagado", "N.º comprobantes",
    "Contratado − OC", "OC − Facturado (por facturar)", "Facturado − Pagado (por pagar)",
    "% OC sobre contratado", "% facturado sobre OC", "% pagado sobre facturado", "% pagado sobre contratado",
    "Estado de conciliación", "Cantidad de hallazgos", "Hallazgos",
  ];
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : "");
  const cuerpo = filas.map((f) => [
    f.eventoNombre, f.pais, f.ciudad, f.fechaEvento ?? "", f.estadoEvento, f.speakerNombre, f.speakerIdentificacion, f.moneda,
    f.presupuestado ?? "", f.convenioPago ?? "", f.convenioHcp ?? "", f.contratado, f.fuenteContratado,
    f.ordenCompra, f.nOrdenesCompra, f.facturado, f.nFacturas, f.notificado, f.pagado, f.nPagos,
    f.saldoSinOc, f.saldoPorFacturar, f.saldoPorPagar,
    pct(f.ordenCompra, f.contratado), pct(f.facturado, f.ordenCompra), pct(f.pagado, f.facturado), pct(f.pagado, f.contratado),
    ETIQUETA_ESTADO_CONCILIACION[f.estado], f.hallazgos.length, f.hallazgos.map((h) => ETIQUETA_HALLAZGO[h.codigo]).join(" | "),
  ]);
  return construirCSV(encabezados, cuerpo);
}

/** Una fila por hallazgo (formato largo, ideal para filtrar inconsistencias). */
export function construirCSVHallazgos(filas: FilaConciliacion[], anotaciones: AnotacionPago[] = []): string {
  const encabezados = ["Evento", "País", "Speaker", "Moneda", "Estado de conciliación", "Hallazgo", "Severidad", "Detalle", "Diferencia", "Anotaciones (autor · fecha · estado)"];
  // Entrega 36: las anotaciones son de la fila (evento + speaker), no de un hallazgo en particular; se repiten en cada hallazgo de la fila.
  const textoAnotaciones = (f: FilaConciliacion) =>
    anotacionesDeFila(anotaciones, f)
      .map((a) => `${a.autorNombre || "?"} · ${formatearFechaHora(a.creadoEn)} · ${a.aclarada ? `aclarada por ${a.aclaradaPorNombre ?? "?"}` : "sin aclarar"}: ${a.texto.replace(/\s+/g, " ")}`)
      .join(" || ");
  const cuerpo = filas.flatMap((f) =>
    f.hallazgos.map((h) => [f.eventoNombre, f.pais, f.speakerNombre, f.moneda, ETIQUETA_ESTADO_CONCILIACION[f.estado], ETIQUETA_HALLAZGO[h.codigo], h.severidad === "error" ? "Inconsistencia" : h.severidad === "pendiente" ? "Pendiente" : "Aviso", h.mensaje, h.diferencia, textoAnotaciones(f)]),
  );
  return construirCSV(encabezados, cuerpo);
}

/** Documentos individuales (convenios, OC, facturas, comprobantes, notificaciones) de los eventos de la conciliación. */
export function construirCSVDetalleDocumentos(detalle: DetalleDocumento[]): string {
  const encabezados = ["Evento", "País", "Speaker", "Tipo de documento", "Número / referencia", "Fecha", "Valor", "Moneda", "Estado"];
  return construirCSV(encabezados, detalle.map((d) => [d.eventoNombre, d.pais, d.speakerNombre, d.tipo, d.numero, d.fecha ?? "", d.valor ?? "", d.moneda, d.estado]));
}

/** KPIs en formato largo (indicador, moneda, valor): apto para tablas dinámicas. */
export function construirCSVKpisPagos(k: KpisPagos): string {
  const filas: (string | number)[][] = [];
  const g = (indicador: string, valor: string | number, moneda = "", detalle = "") => filas.push([indicador, moneda, valor, detalle]);
  g("Filas conciliadas (evento + speaker + moneda)", k.totalFilas);
  g("Eventos", k.eventos);
  g("Speakers", k.speakers);
  g("Consistentes", k.consistentes);
  g("Inconsistentes", k.inconsistentes);
  g("En proceso", k.enProceso);
  g("% de consistencia", k.pctConsistencia == null ? "" : Math.round(k.pctConsistencia * 1000) / 10);
  const p = (n: number | null) => (n == null ? "" : Math.round(n * 1000) / 10);
  for (const m of k.porMoneda) {
    g("Presupuestado (honorarios)", m.presupuestado, m.moneda);
    g("Contratado", m.contratado, m.moneda);
    g("Orden de compra", m.ordenCompra, m.moneda);
    g("Facturado", m.facturado, m.moneda);
    g("Notificado (Notificación de Pago)", m.notificado, m.moneda);
    g("Pagado", m.pagado, m.moneda);
    g("Contratado sin orden de compra", m.saldoSinOc, m.moneda);
    g("Saldo por facturar (OC − facturado)", m.saldoPorFacturar, m.moneda);
    g("Saldo por pagar (facturado − pagado)", m.saldoPorPagar, m.moneda);
    g("Monto en inconsistencia", m.montoEnInconsistencia, m.moneda);
    g("% cobertura de OC (OC / contratado)", p(m.coberturaOc), m.moneda);
    g("% avance de facturación (facturado / OC)", p(m.avanceFacturacion), m.moneda);
    g("% avance de pago (pagado / facturado)", p(m.avancePago), m.moneda);
    g("% ejecución total (pagado / contratado)", p(m.ejecucionTotal), m.moneda);
  }
  g("Días promedio: primera OC → primera factura", k.diasOcAFactura ?? "");
  g("Días promedio: primera factura → último pago", k.diasFacturaAPago ?? "");
  g("Días promedio: inicio del evento → último pago", k.diasEventoAPago ?? "");
  g("Filas con facturas sin orden de compra", k.facturasSinOc);
  g("Filas con facturas sin Notificación de Pago", k.facturasSinNotificacion);
  g("Filas con pagos sin factura", k.pagosSinFactura);
  for (const a of k.antiguedad) for (const r of a.rangos) g(`Saldo por pagar · antigüedad ${r.rango}`, r.monto, a.moneda, `${r.filas} fila(s)`);
  for (const h of k.hallazgos) g(`Hallazgo: ${h.etiqueta}`, h.filas, "", h.severidad === "error" ? "Inconsistencia" : h.severidad === "pendiente" ? "Pendiente" : "Aviso");
  for (const x of k.porPais) g(`País ${x.pais}: filas / inconsistentes`, `${x.filas} / ${x.inconsistentes}`, x.moneda, `contratado ${x.contratado} · pagado ${x.pagado}`);
  return construirCSV(["Indicador", "Moneda", "Valor", "Detalle"], filas);
}

// --- Pagos aprobados (entrega 37) ---------------------------------------------

/** Una fila de «Pagos aprobados» es una conciliación (evento + speaker + moneda) con al menos un convenio o una Notificación de Pago aprobados. */
export function filasConPagoAprobado(filas: FilaConciliacion[]): FilaConciliacion[] {
  return filas.filter((f) => f.nConvenios + f.nNotificacionesAprobadas > 0);
}

/** Totales por moneda de las filas de «Pagos aprobados»: contratado, OC, facturado (facturas cargadas en el Expediente), notificado aprobado y pagado. */
export interface TotalesPagosAprobados {
  moneda: string;
  contratado: number;
  ordenCompra: number;
  facturado: number;
  notificadoAprobado: number;
  pagado: number;
  porPagar: number;
  filas: number;
}

export function totalesPagosAprobados(filas: FilaConciliacion[]): TotalesPagosAprobados[] {
  const mapa = new Map<string, TotalesPagosAprobados>();
  for (const f of filas) {
    const t = mapa.get(f.moneda) ?? { moneda: f.moneda, contratado: 0, ordenCompra: 0, facturado: 0, notificadoAprobado: 0, pagado: 0, porPagar: 0, filas: 0 };
    t.contratado += f.contratado;
    t.ordenCompra += f.ordenCompra;
    t.facturado += f.facturado;
    t.notificadoAprobado += f.notificadoAprobado;
    t.pagado += f.pagado;
    t.filas += 1;
    mapa.set(f.moneda, t);
  }
  return [...mapa.values()].map((t) => ({ ...t, porPagar: redondear(t.facturado - t.pagado) })).sort((a, b) => a.moneda.localeCompare(b.moneda));
}

/** Contraste por speaker: contratado ↔ OC ↔ facturado ↔ notificado ↔ pagado (una fila por evento + speaker + moneda). */
export function construirCSVContrastePagosAprobados(filas: FilaConciliacion[]): string {
  const encabezados = [
    "Evento", "País", "Fecha del evento", "Speaker", "Identificación", "Moneda",
    "Contratado (convenio aprobado)", "Fuente de lo contratado", "Orden de compra", "N.º órdenes de compra",
    "Facturado (facturas cargadas)", "N.º facturas", "Notificado (Notificaciones aprobadas)", "N.º notificaciones aprobadas",
    "Pagado (comprobantes de pago)", "N.º comprobantes", "Por pagar (facturado − pagado)", "Estado de conciliación", "Hallazgos",
  ];
  return construirCSV(
    encabezados,
    filas.map((f) => [
      f.eventoNombre, f.pais, f.fechaEvento ?? "", f.speakerNombre, f.speakerIdentificacion, f.moneda,
      f.contratado, f.fuenteContratado, f.ordenCompra, f.nOrdenesCompra, f.facturado, f.nFacturas, f.notificadoAprobado, f.nNotificacionesAprobadas,
      f.pagado, f.nPagos, f.saldoPorPagar, ETIQUETA_ESTADO_CONCILIACION[f.estado], f.hallazgos.map((h) => ETIQUETA_HALLAZGO[h.codigo]).join(" | "),
    ]),
  );
}

/** Documento por documento de las filas de «Pagos aprobados» (convenios, OC, facturas, notificaciones y comprobantes). */
export function construirCSVDocumentosPagosAprobados(
  filas: FilaConciliacion[],
  sinEvento: { tipo: string; hcp: string; identificacion: string; fecha: string | null; monto: number | null; moneda: string | null; estado: string; referencia: string }[] = [],
): string {
  const encabezados = ["Evento", "País", "Speaker", "Identificación", "Tipo de documento", "Número / referencia", "Fecha", "Valor", "Moneda", "Estado", "Factura(s) que cubre"];
  const cuerpo: (string | number)[][] = filas.flatMap((f) =>
    f.documentos.map((d) => [f.eventoNombre, f.pais, f.speakerNombre, f.speakerIdentificacion, d.tipo, d.numero, d.fecha ?? "", d.valor ?? "", d.moneda, d.estado, d.cubre ?? ""]),
  );
  for (const d of sinEvento) cuerpo.push(["(sin evento de origen)", "", d.hcp, d.identificacion, d.tipo, d.referencia, d.fecha ?? "", d.monto ?? "", d.moneda ?? "", d.estado, ""]);
  return construirCSV(encabezados, cuerpo);
}
