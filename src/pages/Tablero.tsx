import * as React from "react";
import { toast } from "sonner";
import {
  X,
  Tag,
  CalendarDays,
  DollarSign,
  FileEdit,
  Clock,
  CheckCircle2,
  XCircle,
  CheckCheck,
  Ban,
  CalendarPlus,
  HandCoins,
  ClipboardCheck,
  Stamp,
  Handshake,
  Receipt,
  Gauge,
  LayoutGrid,
  List,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ChevronDown,
  Layers,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AvatarUsuario } from "@/components/AvatarUsuario";
import { cn } from "@/lib/utils";
import { FiltroMulti, FiltroUnico, FiltroFechaDesplegable, resumenRango } from "@/components/ui/filtros-desplegables";
import type { VistaArchivado } from "@/components/ui/filtro-archivado";
import { EVENTO_ABRIR_PREFERENCIAS } from "@/lib/archivado";
import { Button } from "@/components/ui/button";
import { useMesesArchivado } from "@/hooks/useArchivado";
import { estaArchivado } from "@/lib/archivado";
import { RANGO_VACIO, hayRango, coincideRango, intervaloCoincideRango, type RangoFechas } from "@/lib/filtroFechas";
import { ETIQUETA_TIPO_DOC } from "@/lib/enums";
import { mensajeErrorAmigable } from "@/lib/supabaseClient";
import { traerCafs } from "@/lib/caf";
import { traerEventos } from "@/lib/evento";
import { traerFmvs } from "@/lib/fmv";
import { traerNotificacionesPago } from "@/lib/notificacionPago";
import { traerConvenios } from "@/lib/convenio";
import { traerConveniosHCP } from "@/lib/convenioHCP";
import { totalCondensado } from "@/lib/presupuestoEvento";
import { formatearMonto } from "@/lib/dinero";
import { traerSpeakersResumen, type SpeakerResumen } from "@/lib/speakers";
import { traerConfiguracionFmv, calcularPuntajeTotal, calcularTier } from "@/lib/fmvConfig";
import { formatearFecha, formatearFechaHora } from "@/lib/fecha";
import { useAbrirDocumentoGenerico } from "@/hooks/useAbrirDocumentoGenerico";
import { useUsuariosPorId } from "@/hooks/useUsuariosPorId";
import { useCompania, filtrarPorEmpresaGrupo, filtrarPorEventoOrigen } from "@/hooks/useCompania";
import type { Caf, Evento, Fmv, NotificacionPagoHcp, Convenio, ConvenioHcp } from "@/types";
import type { EstadoDoc, TipoDoc } from "@/lib/enums";

const VARIANTE_POR_ESTADO: Record<EstadoDoc, BadgeProps["variant"]> = {
  Borrador: "draft",
  Pendiente: "pending",
  Aprobado: "approved",
  Rechazado: "rejected",
  Devuelto: "draft",
  Completado: "completed",
  Anulado: "cancelled",
};

// Fase 8 (hallazgo grande): el original ordena las pastillas de estado así
// — distinto del orden de ESTADO_DOC (que sigue el enum real de la BD) —
// confirmado por comparación visual directa contra el bundle original
// (scripts/comparacion_visual/capturas/02_original_tablero.png). Se usa un
// orden local en vez de reordenar ESTADO_DOC para no afectar otras
// pantallas/pruebas que sí dependen del orden del enum.
const ORDEN_ESTADO_TABLERO: EstadoDoc[] = ["Pendiente", "Aprobado", "Rechazado", "Devuelto", "Borrador", "Completado", "Anulado"];

// Ajuste de precisión (septiembre 2026), pedido explícito: orden fijo de
// los filtros de tipo de documento — mismo criterio que ORDEN_ESTADO_TABLERO
// de arriba (un orden local, para no afectar el orden de TIPO_DOC que usan
// otras pantallas/catálogos).
const ORDEN_TIPO_DOC_TABLERO: TipoDoc[] = ["evento", "fmv", "convenio", "caf", "convenioHCP", "notificacionPago"];

// "Devuelto" reutiliza el mismo ícono que "Borrador" (RotateCcw se ve más
// como "revertir" que como "editable"; FileEdit ya comunica bien "esto se
// puede volver a diligenciar", que es exactamente lo que significa un
// documento devuelto).
const ICONO_POR_ESTADO: Record<EstadoDoc, typeof Clock> = {
  Borrador: FileEdit,
  Pendiente: Clock,
  Aprobado: CheckCircle2,
  Rechazado: XCircle,
  Devuelto: FileEdit,
  Completado: CheckCheck,
  Anulado: Ban,
};

// Mismos íconos que ya se usan en el sidebar para "Crear documento" (ver
// src/lib/navegacion.ts) — consistencia visual entre el menú y las
// tarjetas del Tablero, uno de los hallazgos de esta fase. Cada uno lleva
// además un color distintivo (pedido explícito del usuario) tomado de la
// paleta de marca/estado ya existente en el tema — no hubo imágenes de
// referencia disponibles para esta ronda, así que se optó por reutilizar
// tonos ya presentes en la app en vez de introducir una paleta nueva.
const ICONO_POR_TIPO_DOC: Record<TipoDoc, typeof CalendarPlus> = {
  evento: CalendarPlus,
  convenio: HandCoins,
  fmv: ClipboardCheck,
  notificacionPago: Receipt,
  // Ajuste de precisión (septiembre 2026), pedido explícito: estos dos no
  // coincidían de verdad con el ícono del sidebar (`lib/navegacion.ts`)
  // pese a lo que decía el comentario de arriba — se corrigen a los mismos
  // (Stamp/Handshake) para que el Tablero y el menú usen exactamente el
  // mismo ícono por tipo de documento.
  caf: Stamp,
  convenioHCP: Handshake,
};

const COLOR_ICONO_POR_TIPO_DOC: Record<TipoDoc, string> = {
  evento: "text-blue-600",
  convenio: "text-amber-600",
  fmv: "text-violet-600",
  notificacionPago: "text-emerald-600",
  caf: "text-rose-600",
  convenioHCP: "text-cyan-700",
};

// La etiqueta "Tipo:" de la tarjeta (no el texto de la pastilla de filtro,
// que sigue usando ETIQUETA_TIPO_DOC sin cambios): el original distingue
// "Convenio HCP" de "Convenio de Pago a HCP" agregando "(Contrato)" solo
// en esta fila de la tarjeta, confirmado por captura real del usuario.
const ETIQUETA_TIPO_TABLERO: Record<TipoDoc, string> = {
  ...ETIQUETA_TIPO_DOC,
  convenioHCP: "Convenio HCP (Contrato)",
};


/** Entrega 28: cuántos documentos se pintan de una vez (con cientos de tarjetas la pantalla se vuelve lenta y difícil de recorrer). */
const TAMANO_PAGINA = 60;

type BaseFecha = "creacion" | "evento";
const BASES_FECHA: { valor: BaseFecha; etiqueta: string }[] = [
  { valor: "evento", etiqueta: "Fecha del evento / actividad" },
  { valor: "creacion", etiqueta: "Fecha de creación" },
];

type VistaTablero = "tarjetas" | "listado";
const CLAVE_VISTA_TABLERO = "beats.tablero.vista";

/** Octubre 2026: la vista elegida (tarjetas / listado) se recuerda por navegador. */
function leerVistaGuardada(): VistaTablero {
  try {
    return window.localStorage.getItem(CLAVE_VISTA_TABLERO) === "listado" ? "listado" : "tarjetas";
  } catch {
    return "tarjetas";
  }
}


// Entrega 34: orden de columnas y agrupación por evento en la vista de listado.
type ColumnaOrden = "nombre" | "tipo" | "estado" | "fecha" | "creador" | "creadoEn";
type DireccionOrden = "asc" | "desc";
interface OrdenListado { columna: ColumnaOrden; direccion: DireccionOrden }
const CLAVE_AGRUPAR_LISTADO = "beats.tablero.listado.agrupar";

function leerAgruparGuardado(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_AGRUPAR_LISTADO) !== "0";
  } catch {
    return true;
  }
}

/** Evento al que pertenece un documento (el propio evento, o su evento de origen); null si no tiene. */
function eventoIdDeTarjeta(t: TarjetaDocumento): string | null {
  if (t.tipoDoc === "evento") return t.doc.id;
  const origen = (t.doc as { eventoOrigenId?: string | null }).eventoOrigenId;
  return origen ?? null;
}

function ordenarTarjetas(
  tarjetas: TarjetaDocumento[],
  orden: OrdenListado | null,
  nombreCreador: (id: string) => string,
): TarjetaDocumento[] {
  if (!orden) return tarjetas;
  const clave = (t: TarjetaDocumento): string => {
    switch (orden.columna) {
      case "nombre": return t.nombre;
      case "tipo": return ETIQUETA_TIPO_TABLERO[t.tipoDoc];
      case "estado": return t.estado;
      case "fecha": return t.fechaInicio ?? t.creadoEn;
      case "creador": return nombreCreador(t.creadoPorId);
      case "creadoEn": return t.creadoEn;
    }
  };
  const signo = orden.direccion === "asc" ? 1 : -1;
  return [...tarjetas].sort((a, b) => signo * clave(a).localeCompare(clave(b), "es", { numeric: true, sensitivity: "base" }));
}

function formatearRangoFechas(inicio: string | null, fin: string | null): string {
  if (!inicio && !fin) return "—";
  if (!fin || inicio === fin) return formatearFecha(inicio);
  return `${formatearFecha(inicio)} – ${formatearFecha(fin)}`;
}

// CORRECCIÓN (septiembre 2026), pedido explícito: todo monto de dinero
// debe mostrar la moneda al final y usar separadores de miles/decimales
// ($1.000.000,00 COP) — se delega en el helper compartido `formatearMonto`
// (`lib/dinero.ts`) en vez del formato propio que tenía esta tarjeta antes
// (sin separadores de decimales ni el signo "$").
function formatearMoneda(valor: number, moneda: string): string {
  return formatearMonto(valor, moneda);
}

/** " (N sesiones)" cuando hay más de una sesión involucrada, "" si no —
 * pedido explícito del usuario para Solicitud de Evento, Convenio de Pago
 * a HCP, CAF y Convenio HCP cuando el documento involucra varias sesiones. */
function sufijoSesiones(n: number): string {
  return n > 1 ? ` (${n} sesiones)` : "";
}

type Icono = typeof Tag;

interface FilaTarjeta {
  icono: Icono;
  etiqueta: string;
  valor: string;
}

/** Campos comunes que toda tarjeta del Tablero necesita para renderizarse y
 * para filtrar/ordenar, sin importar el tipo de documento de origen.
 * `secundario` es null solo para FMV (su título ya incluye la especialidad
 * y no tiene un segundo campo propio, a diferencia de los otros 5 tipos). */
interface CamposComunesTarjeta {
  id: string;
  estado: EstadoDoc;
  creadoPorId: string;
  creadoEn: string;
  nombre: string;
  secundario: FilaTarjeta | null;
  fechaValor: string;
  filaExtra: FilaTarjeta | null;
  /** Entrega 28: fechas del evento/actividad (para filtrar por fecha y para el archivado); null si el documento no tiene. */
  fechaInicio: string | null;
  fechaFin: string | null;
}

// Fase 8 (hallazgo grande): antes, el Tablero traía un resumen liviano
// (`traerDocumentosResumen`, sobre la vista `v_documentos`) que no alcanza
// para las tarjetas del original (requieren un segundo campo específico del
// tipo, fecha y monto). Se cambia a traer las 6 tablas completas en
// paralelo — esto además elimina el refetch-por-clic que tenía
// `abrirDocumento` antes: el documento completo ya está en memoria.
type TarjetaDocumento =
  | (CamposComunesTarjeta & { tipoDoc: "caf"; doc: Caf })
  | (CamposComunesTarjeta & { tipoDoc: "evento"; doc: Evento })
  | (CamposComunesTarjeta & { tipoDoc: "fmv"; doc: Fmv })
  | (CamposComunesTarjeta & { tipoDoc: "notificacionPago"; doc: NotificacionPagoHcp })
  | (CamposComunesTarjeta & { tipoDoc: "convenio"; doc: Convenio })
  | (CamposComunesTarjeta & { tipoDoc: "convenioHCP"; doc: ConvenioHcp });

/** Contexto de referencias cruzadas que varias tarjetas necesitan para
 * resolver campos que el propio documento no trae: la especialidad de un
 * HCP vive en `speakers`, no en el documento (Convenio/Convenio HCP/
 * Notificación de Pago solo guardan el `speakerId`); y CAF/Convenio HCP no
 * tienen campos propios de "actividad" ni, en el caso de Convenio HCP, un
 * rango de fechas multisesión — ambos se resuelven desde su Evento de
 * origen, que si los tiene. */
interface ContextoTarjetas {
  eventosPorId: Map<string, Evento>;
  speakersPorId: Map<string, SpeakerResumen>;
  umbralTier1: number;
  umbralTier2: number;
}

/** "{nombre} – {especialidad}" cuando se puede resolver el speaker por id;
 * si no, solo el nombre (con su propio fallback). */
function nombreConEspecialidad(speakerId: string | null | undefined, ctx: ContextoTarjetas, nombreFallback: string): string {
  const speaker = speakerId ? ctx.speakersPorId.get(speakerId) : undefined;
  const nombre = speaker?.nombreCompleto || nombreFallback;
  return speaker?.especialidad ? `${nombre} – ${speaker.especialidad}` : nombre;
}

function tarjetaDeEvento(e: Evento): TarjetaDocumento {
  const multisesion = e.modalidadSesiones === "Varias sesiones";
  return {
    id: e.id,
    tipoDoc: "evento",
    doc: e,
    estado: e.estado,
    creadoPorId: e.creadoPorId,
    creadoEn: e.creadoEn,
    nombre: e.tipoEvento
      ? `${e.nombreEvento || "Solicitud de Evento"} – ${e.tipoEvento}`
      : e.nombreEvento || "Solicitud de Evento",
    secundario: { icono: ICONO_POR_TIPO_DOC.evento, etiqueta: "Modalidad", valor: e.modalidadEvento || "—" },
    fechaValor:
      formatearRangoFechas(e.fechaInicioEvento, e.fechaFinEvento) + (multisesion ? sufijoSesiones(e.sesiones.length) : ""),
    filaExtra: { icono: DollarSign, etiqueta: "Monto", valor: formatearMoneda(totalCondensado(e), e.moneda) },
    fechaInicio: e.fechaInicioEvento,
    fechaFin: e.fechaFinEvento,
  };
}

function tarjetaDeConvenio(c: Convenio, ctx: ContextoTarjetas): TarjetaDocumento {
  return {
    id: c.id,
    tipoDoc: "convenio",
    doc: c,
    estado: c.estado,
    creadoPorId: c.creadoPorId,
    creadoEn: c.creadoEn,
    nombre: nombreConEspecialidad(c.speakerId, ctx, c.hcpNombreCompleto || "Convenio de Pago"),
    secundario: { icono: ICONO_POR_TIPO_DOC.convenio, etiqueta: "Actividad", valor: c.tipoActividad || "—" },
    fechaValor:
      formatearRangoFechas(c.fechaInicioActividad, c.fechaFinActividad) + sufijoSesiones(c.sesionesParticipacionIds.length),
    filaExtra:
      c.contraprestacionHCP != null
        ? { icono: DollarSign, etiqueta: "Monto", valor: formatearMoneda(c.contraprestacionHCP, c.monedaContraprestacion) }
        : null,
    fechaInicio: c.fechaInicioActividad,
    fechaFin: c.fechaFinActividad,
  };
}

function tarjetaDeFmv(f: Fmv, ctx: ContextoTarjetas): TarjetaDocumento {
  const especialidadEfectiva = (f.especialidad === "Otra" ? f.especialidadOtro : f.especialidad) || "";
  const puntaje = calcularPuntajeTotal({
    criterio1: f.criterio1,
    criterio2: f.criterio2,
    criterio3: f.criterio3,
    criterio4: f.criterio4,
    criterio5: f.criterio5,
    criterio6: f.criterio6,
  });
  const tier = calcularTier(puntaje, ctx.umbralTier1, ctx.umbralTier2);
  return {
    id: f.id,
    tipoDoc: "fmv",
    doc: f,
    estado: f.estado,
    creadoPorId: f.creadoPorId,
    creadoEn: f.creadoEn,
    nombre: especialidadEfectiva ? `${f.nombreCompleto || "sin nombre"} – ${especialidadEfectiva}` : f.nombreCompleto || "sin nombre",
    // El FMV no tiene un segundo campo propio como Modalidad/Actividad — su
    // especialidad ya quedó en el título, y su fila extra es "Score total"
    // en vez de "Monto" (no es una transacción monetaria).
    secundario: null,
    fechaValor: formatearFecha(f.fecha),
    filaExtra: { icono: Gauge, etiqueta: "Score total", valor: `${tier} · ${puntaje}/18` },
    fechaInicio: f.fecha,
    fechaFin: f.fecha,
  };
}

function tarjetaDeNotificacion(n: NotificacionPagoHcp, ctx: ContextoTarjetas): TarjetaDocumento {
  return {
    id: n.id,
    tipoDoc: "notificacionPago",
    doc: n,
    estado: n.estado,
    creadoPorId: n.creadoPorId,
    creadoEn: n.creadoEn,
    nombre: nombreConEspecialidad(n.speakerId, ctx, n.nombreProfesionalSalud || "Notificación de Pago"),
    secundario: { icono: ICONO_POR_TIPO_DOC.notificacionPago, etiqueta: "Factura", valor: n.numeroFactura || "—" },
    fechaValor: formatearFecha(n.fechaFactura),
    filaExtra:
      n.valorFactura != null
        ? { icono: DollarSign, etiqueta: "Monto", valor: formatearMoneda(n.valorFactura, n.monedaFactura ?? "") }
        : null,
    fechaInicio: n.fechaFactura,
    fechaFin: n.fechaFactura,
  };
}

/**
 * CAF no trae ningún campo propio de "speaker/HCP" ni de "actividad" (ver
 * types.ts) — el original los muestra de todas formas, así que se
 * resuelven desde el Evento de origen (`eventoOrigenId`, obligatorio en el
 * formulario): el speaker que participó en ese evento da el nombre +
 * especialidad, y el tipo de evento hace de "Actividad". Si el evento de
 * origen no se encuentra (dato viejo/incompleto), se cae de vuelta a los
 * campos propios de la CAF (contraparte/tipo de contrato/fechas del
 * contrato) para no dejar la tarjeta vacía.
 */
function tarjetaDeCaf(c: Caf, ctx: ContextoTarjetas): TarjetaDocumento {
  const evento = ctx.eventosPorId.get(c.eventoOrigenId);
  // Octubre 2026: el nombre es el del speaker DEL CAF (el externo elegido en el formulario), no el del evento. El campo
  // histórico `evento.nombreSpeakerParticipacion` guarda el primer speaker INTERNO, así que en un evento con speakers internos
  // y uno externo el CAF aparecía con el nombre de un interno.
  const nombre = nombreConEspecialidad(c.speakerId, ctx, c.contraparteNombre || "CAF");
  const actividad = evento?.tipoEvento || c.tipoContrato || "—";
  const multisesion = evento?.modalidadSesiones === "Varias sesiones";
  const fechaValor = evento
    ? formatearRangoFechas(evento.fechaInicioEvento, evento.fechaFinEvento) + (multisesion ? sufijoSesiones(evento.sesiones.length) : "")
    : formatearRangoFechas(c.terminoContratoInicio, c.terminoContratoFin);
  return {
    id: c.id,
    tipoDoc: "caf",
    doc: c,
    estado: c.estado,
    creadoPorId: c.creadoPorId,
    creadoEn: c.creadoEn,
    nombre,
    secundario: { icono: ICONO_POR_TIPO_DOC.caf, etiqueta: "Actividad", valor: actividad },
    fechaValor,
    filaExtra: { icono: DollarSign, etiqueta: "Monto", valor: formatearMoneda(c.monto, c.moneda) },
    fechaInicio: evento ? evento.fechaInicioEvento : c.terminoContratoInicio,
    fechaFin: evento ? evento.fechaFinEvento : c.terminoContratoFin,
  };
}

/**
 * Convenio HCP tampoco tiene un campo propio de "actividad", y su única
 * fecha propia (`fechaEfectiva`) es un solo día — no alcanza para mostrar
 * el rango + "(N sesiones)" que el original muestra cuando el HCP participó
 * en un evento multisesión. Igual que en CAF, ambos se resuelven desde el
 * Evento de origen (`eventoOrigenId`, obligatorio); `fechaEfectiva` queda
 * como respaldo si el evento de origen no se encuentra.
 */
function tarjetaDeConvenioHCP(c: ConvenioHcp, ctx: ContextoTarjetas): TarjetaDocumento {
  const evento = ctx.eventosPorId.get(c.eventoOrigenId);
  const nombre = nombreConEspecialidad(c.speakerId, ctx, c.consultorNombre || "Convenio HCP");
  const actividad = evento?.tipoEvento || "—";
  const multisesion = evento?.modalidadSesiones === "Varias sesiones";
  const fechaValor = evento
    ? formatearRangoFechas(evento.fechaInicioEvento, evento.fechaFinEvento) + (multisesion ? sufijoSesiones(evento.sesiones.length) : "")
    : formatearFecha(c.fechaEfectiva);
  return {
    id: c.id,
    tipoDoc: "convenioHCP",
    doc: c,
    estado: c.estado,
    creadoPorId: c.creadoPorId,
    creadoEn: c.creadoEn,
    nombre,
    secundario: { icono: ICONO_POR_TIPO_DOC.convenioHCP, etiqueta: "Actividad", valor: actividad },
    fechaValor,
    filaExtra: c.compensacion != null ? { icono: DollarSign, etiqueta: "Monto", valor: formatearMoneda(c.compensacion, c.moneda) } : null,
    fechaInicio: evento ? evento.fechaInicioEvento : c.fechaEfectiva,
    fechaFin: evento ? evento.fechaFinEvento : c.fechaEfectiva,
  };
}

function ChipFiltro({ children, onQuitar }: { children: React.ReactNode; onQuitar: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#e0f4fc] py-0.5 pl-2.5 pr-1 text-xs font-medium text-[#0679a8]">
      {children}
      <button type="button" onClick={onQuitar} aria-label="Quitar filtro" className="rounded-full p-0.5 hover:bg-[#bfe7f7]">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function CampoTarjeta({
  icon: Icono,
  etiqueta,
  valor,
  colorIcono,
}: {
  icon: Icono;
  etiqueta: string;
  valor: string;
  colorIcono?: string;
}) {
  return (
    // AJUSTES (septiembre/octubre 2026), pedido explícito: "la información
    // no se muestra completa (se corta)" tras pasar el panel a 3 columnas —
    // causa real: `truncate` (overflow-hidden + ellipsis) no hace nada
    // dentro de una fila flex si el elemento no puede encoger por debajo de
    // su ancho natural, que es el comportamiento por defecto de un hijo
    // flex (`min-width: auto`); sin `min-w-0` el texto largo simplemente
    // desbordaba la tarjeta en vez de cortarse con "…" — más visible todavía
    // con columnas más angostas (3 en vez de 2). `min-w-0 flex-1` deja que
    // este span sea el único que encoge en la fila (el ícono y la etiqueta
    // ya eran `shrink-0`), así el truncado por fin corta donde corresponde.
    <div className="flex items-center gap-1.5 text-muted-foreground">
      <Icono className={cn("h-3.5 w-3.5 shrink-0", colorIcono)} />
      <span className="shrink-0 font-medium text-foreground">{etiqueta}:</span>
      <span className="min-w-0 flex-1 truncate" title={valor}>{valor}</span>
    </div>
  );
}

function TarjetaDoc({
  tarjeta,
  nombreCreador,
  inicialesCreador,
  fotoCreadorId,
  onAbrir,
}: {
  tarjeta: TarjetaDocumento;
  nombreCreador: string;
  inicialesCreador: string;
  /** Entrega 33: foto del creador (`Usuario.fotoId`); `null` = sin foto. */
  fotoCreadorId: string | null;
  onAbrir: (tarjeta: TarjetaDocumento) => void;
}) {
  const IconoTipo = ICONO_POR_TIPO_DOC[tarjeta.tipoDoc];
  const colorIconoTipo = COLOR_ICONO_POR_TIPO_DOC[tarjeta.tipoDoc];
  const IconoEstado = ICONO_POR_ESTADO[tarjeta.estado];
  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      role="button"
      tabIndex={0}
      onClick={() => onAbrir(tarjeta)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onAbrir(tarjeta);
      }}
    >
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <IconoTipo className={cn("mt-0.5 h-4 w-4 shrink-0", colorIconoTipo)} />
            <h3 className="min-w-0 flex-1 line-clamp-2 text-sm font-semibold leading-snug" title={tarjeta.nombre}>
              {tarjeta.nombre}
            </h3>
          </div>
          <Badge variant={VARIANTE_POR_ESTADO[tarjeta.estado]} className="flex shrink-0 items-center gap-1">
            <IconoEstado className="h-3 w-3" />
            {tarjeta.estado}
          </Badge>
        </div>

        <div className="flex flex-col gap-1.5 text-sm">
          <CampoTarjeta icon={Tag} etiqueta="Tipo" valor={ETIQUETA_TIPO_TABLERO[tarjeta.tipoDoc]} colorIcono={colorIconoTipo} />
          {tarjeta.secundario && (
            <CampoTarjeta
              icon={tarjeta.secundario.icono}
              etiqueta={tarjeta.secundario.etiqueta}
              valor={tarjeta.secundario.valor}
              colorIcono={colorIconoTipo}
            />
          )}
          <CampoTarjeta icon={CalendarDays} etiqueta="Fecha" valor={tarjeta.fechaValor} />
          {tarjeta.filaExtra && (
            <CampoTarjeta icon={tarjeta.filaExtra.icono} etiqueta={tarjeta.filaExtra.etiqueta} valor={tarjeta.filaExtra.valor} />
          )}
        </div>

        <Separator />

        <div className="flex items-center gap-2">
          <AvatarUsuario fotoId={fotoCreadorId} nombre={nombreCreador} iniciales={inicialesCreador} className="size-6 shrink-0" fallbackClassName="text-[10px]" />
          {/* Mismo arreglo de `min-w-0` que en `CampoTarjeta` de arriba — sin
              esto el nombre del creador también desbordaba la tarjeta en vez
              de cortarse con "…". */}
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={nombreCreador}>
            {nombreCreador}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Octubre 2026, pedido explícito: vista de "listado de documentos con detalles".
 * Misma información que la tarjeta, en una tabla (una fila por documento).
 */
function ListadoDocumentos({
  tarjetas,
  usuarios,
  onAbrir,
  orden,
  onOrdenar,
  agrupar,
  nombreEvento,
}: {
  tarjetas: TarjetaDocumento[];
  usuarios: Map<string, { nombre: string; iniciales: string; fotoId: string | null }>;
  onAbrir: (tarjeta: TarjetaDocumento) => void;
  orden: OrdenListado | null;
  onOrdenar: (columna: ColumnaOrden) => void;
  agrupar: boolean;
  nombreEvento: (id: string) => string;
}) {
  const [plegados, setPlegados] = React.useState<ReadonlySet<string>>(new Set());
  const grupos = React.useMemo(() => {
    if (!agrupar) return [{ clave: "", titulo: "", items: tarjetas }];
    const mapa = new Map<string, TarjetaDocumento[]>();
    for (const t of tarjetas) {
      const k = eventoIdDeTarjeta(t) ?? "";
      const lista = mapa.get(k);
      if (lista) lista.push(t);
      else mapa.set(k, [t]);
    }
    const claves = [...mapa.keys()].sort((x, y) => (x === "" ? 1 : y === "" ? -1 : 0));
    return claves.map((k) => ({ clave: k, titulo: k ? nombreEvento(k) : "Sin evento asociado", items: mapa.get(k)! }));
  }, [tarjetas, agrupar, nombreEvento]);

  const Encabezado = ({ columna, children, className }: { columna?: ColumnaOrden; children: React.ReactNode; className?: string }) => {
    const activa = columna && orden?.columna === columna;
    const Flecha = !activa ? ArrowUpDown : orden!.direccion === "asc" ? ArrowUp : ArrowDown;
    return (
      <th className={cn("px-3 py-2 font-medium", className)} aria-sort={activa ? (orden!.direccion === "asc" ? "ascending" : "descending") : undefined}>
        {columna ? (
          <button
            type="button"
            onClick={() => onOrdenar(columna)}
            className={cn("inline-flex items-center gap-1 rounded px-1 py-0.5 -mx-1 transition-colors hover:bg-muted", activa && "text-[#00A3E0]")}
            data-testid={`orden-${columna}`}
            title="Ordenar por esta columna"
          >
            {children}
            <Flecha className={cn("h-3 w-3", !activa && "opacity-40")} />
          </button>
        ) : (
          children
        )}
      </th>
    );
  };

  return (
    <div className="overflow-x-auto rounded-lg border" data-testid="tablero-listado">
      <table className="w-full min-w-[960px] text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <Encabezado columna="nombre">Documento</Encabezado>
            <Encabezado columna="tipo">Tipo</Encabezado>
            <Encabezado columna="estado">Estado</Encabezado>
            <Encabezado>Detalle</Encabezado>
            <Encabezado columna="fecha">Fecha</Encabezado>
            <Encabezado>Monto / Score</Encabezado>
            <Encabezado columna="creador">Creado por</Encabezado>
            <Encabezado columna="creadoEn">Creado el</Encabezado>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => {
            const plegado = agrupar && plegados.has(g.clave);
            return (
              <React.Fragment key={g.clave || "sin-grupo"}>
                {agrupar && (
                  <tr className="border-t bg-muted/30" data-testid="tablero-grupo-evento">
                    <td colSpan={8} className="px-3 py-1.5">
                      <button
                        type="button"
                        className="flex items-center gap-1.5 text-xs font-medium text-slate-600"
                        aria-expanded={!plegado}
                        onClick={() => setPlegados((prev) => { const n = new Set(prev); if (n.has(g.clave)) n.delete(g.clave); else n.add(g.clave); return n; })}
                      >
                        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", plegado && "-rotate-90")} />
                        <span>{g.titulo}</span>
                        <span className="font-normal text-muted-foreground">· {g.items.length} documento{g.items.length === 1 ? "" : "s"}</span>
                      </button>
                    </td>
                  </tr>
                )}
                {!plegado &&
                  g.items.map((t) => {
                    const IconoTipo = ICONO_POR_TIPO_DOC[t.tipoDoc];
                    const IconoEstado = ICONO_POR_ESTADO[t.estado];
                    const creador = usuarios.get(t.creadoPorId);
                    return (
                      <tr
                        key={`${t.tipoDoc}-${t.id}`}
                        className="cursor-pointer border-t transition-colors hover:bg-muted/40"
                        tabIndex={0}
                        role="button"
                        data-testid="tablero-fila"
                        onClick={() => onAbrir(t)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") onAbrir(t);
                        }}
                      >
                        <td className="max-w-[280px] px-3 py-2">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/60">
                              <IconoTipo className={cn("h-4 w-4", COLOR_ICONO_POR_TIPO_DOC[t.tipoDoc])} />
                            </span>
                            <span className="truncate font-medium" title={t.nombre}>
                              {t.nombre}
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{ETIQUETA_TIPO_TABLERO[t.tipoDoc]}</td>
                        <td className="px-3 py-2">
                          <Badge variant={VARIANTE_POR_ESTADO[t.estado]} className="flex w-fit items-center gap-1">
                            <IconoEstado className="h-3 w-3" />
                            {t.estado}
                          </Badge>
                        </td>
                        <td className="max-w-[200px] px-3 py-2 text-muted-foreground">
                          <span className="block truncate" title={t.secundario ? `${t.secundario.etiqueta}: ${t.secundario.valor}` : ""}>
                            {t.secundario ? `${t.secundario.etiqueta}: ${t.secundario.valor}` : "—"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{t.fechaValor}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                          {t.filaExtra ? `${t.filaExtra.etiqueta}: ${t.filaExtra.valor}` : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <AvatarUsuario usuarioId={t.creadoPorId} fotoId={creador?.fotoId ?? null} nombre={creador?.nombre ?? ""} iniciales={creador?.iniciales ?? "—"} className="size-6 shrink-0" fallbackClassName="text-[10px]" />
                            <span className="max-w-[140px] truncate text-xs text-muted-foreground" title={creador?.nombre ?? "—"}>
                              {creador?.nombre ?? "—"}
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{formatearFechaHora(t.creadoEn)}</td>
                      </tr>
                    );
                  })}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Tablero() {
  const { companiaActual } = useCompania();
  const [cafs, setCafs] = React.useState<Caf[] | null>(null);
  const [eventos, setEventos] = React.useState<Evento[] | null>(null);
  const [fmvs, setFmvs] = React.useState<Fmv[] | null>(null);
  const [notificaciones, setNotificaciones] = React.useState<NotificacionPagoHcp[] | null>(null);
  const [convenios, setConvenios] = React.useState<Convenio[] | null>(null);
  const [conveniosHCP, setConveniosHCP] = React.useState<ConvenioHcp[] | null>(null);
  const [speakers, setSpeakers] = React.useState<SpeakerResumen[] | null>(null);
  const [fmvUmbrales, setFmvUmbrales] = React.useState<{ umbralTier1: number; umbralTier2: number } | null>(null);

  // Entrega 30: filtros de selección múltiple (vacío = sin filtrar).
  const [filtroTipo, setFiltroTipo] = React.useState<string[]>([]);
  const [filtroEstado, setFiltroEstado] = React.useState<string[]>([]);
  const [vista, setVista] = React.useState<VistaTablero>(leerVistaGuardada);
  const [rangoFechas, setRangoFechas] = React.useState<RangoFechas>(RANGO_VACIO);
  const [baseFecha, setBaseFecha] = React.useState<BaseFecha>("evento");
  const [vistaArchivado, setVistaArchivado] = React.useState<VistaArchivado>("activos");
  const [visibles, setVisibles] = React.useState(TAMANO_PAGINA);
  const [ordenListado, setOrdenListado] = React.useState<OrdenListado | null>(null);
  const [agruparListado, setAgruparListado] = React.useState<boolean>(leerAgruparGuardado);
  const mesesArchivado = useMesesArchivado();

  function cambiarVista(nueva: VistaTablero) {
    setVista(nueva);
    try {
      window.localStorage.setItem(CLAVE_VISTA_TABLERO, nueva);
    } catch {
      /* sin almacenamiento: la vista solo dura la sesión */
    }
  }


  // Octubre 2026 (ventanas, fase 2): las ventanas de documento viven en el AppShell.
  const { abrir: abrirVentana } = useAbrirDocumentoGenerico(() => {
    void cargarTodo();
  });

  async function cargarTodo() {
    try {
      const [cafsData, eventosData, fmvsData, notificacionesData, conveniosData, conveniosHCPData, speakersData, configuracionFmvData] =
        await Promise.all([
          traerCafs(),
          traerEventos(),
          traerFmvs(),
          traerNotificacionesPago(),
          traerConvenios(),
          traerConveniosHCP(),
          traerSpeakersResumen(),
          traerConfiguracionFmv(),
        ]);
      setCafs(cafsData);
      setEventos(eventosData);
      setFmvs(fmvsData);
      setNotificaciones(notificacionesData);
      setConvenios(conveniosData);
      setConveniosHCP(conveniosHCPData);
      setSpeakers(speakersData);
      setFmvUmbrales({ umbralTier1: configuracionFmvData.umbralTier1, umbralTier2: configuracionFmvData.umbralTier2 });
      return { cafsData, eventosData, fmvsData, notificacionesData, conveniosData, conveniosHCPData };
    } catch (error) {
      toast.error(mensajeErrorAmigable(error));
      setCafs([]);
      setEventos([]);
      setFmvs([]);
      setNotificaciones([]);
      setConvenios([]);
      setConveniosHCP([]);
      setSpeakers([]);
      setFmvUmbrales({ umbralTier1: 15, umbralTier2: 9 });
      return null;
    }
  }

  React.useEffect(() => {
    cargarTodo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargando =
    cafs === null ||
    eventos === null ||
    fmvs === null ||
    notificaciones === null ||
    convenios === null ||
    conveniosHCP === null ||
    speakers === null ||
    fmvUmbrales === null;

  // Selector de compañía del grupo (pedido explícito, octubre 2026):
  // "mostrar únicamente la información asociada a documentos... de esa
  // empresa en particular" — Evento/Fmv/NotificacionPagoHcp se filtran
  // directo por su propio `empresaGrupo`; Caf/Convenio/ConvenioHcp no
  // llevan ese campo, se derivan por `eventoOrigenId` contra los eventos
  // ya filtrados.
  const tarjetas = React.useMemo<TarjetaDocumento[]>(() => {
    if (!cafs || !eventos || !fmvs || !notificaciones || !convenios || !conveniosHCP || !speakers || !fmvUmbrales) return [];
    const eventosDeCompania = filtrarPorEmpresaGrupo(eventos, companiaActual);
    const fmvsDeCompania = filtrarPorEmpresaGrupo(fmvs, companiaActual);
    const notificacionesDeCompania = filtrarPorEmpresaGrupo(notificaciones, companiaActual);
    const idsEventosDeCompania = new Set(eventosDeCompania.map((e) => e.id));
    const conveniosDeCompania = filtrarPorEventoOrigen(convenios, idsEventosDeCompania);
    const cafsDeCompania = filtrarPorEventoOrigen(cafs, idsEventosDeCompania);
    const conveniosHCPDeCompania = filtrarPorEventoOrigen(conveniosHCP, idsEventosDeCompania);

    const eventosPorId = new Map(eventos.map((e) => [e.id, e]));
    const speakersPorId = new Map(speakers.map((s) => [s.id, s]));
    const ctx: ContextoTarjetas = {
      eventosPorId,
      speakersPorId,
      umbralTier1: fmvUmbrales.umbralTier1,
      umbralTier2: fmvUmbrales.umbralTier2,
    };
    const todas = [
      ...eventosDeCompania.map(tarjetaDeEvento),
      ...conveniosDeCompania.map((c) => tarjetaDeConvenio(c, ctx)),
      ...fmvsDeCompania.map((f) => tarjetaDeFmv(f, ctx)),
      ...notificacionesDeCompania.map((n) => tarjetaDeNotificacion(n, ctx)),
      ...cafsDeCompania.map((c) => tarjetaDeCaf(c, ctx)),
      ...conveniosHCPDeCompania.map((c) => tarjetaDeConvenioHCP(c, ctx)),
    ];
    return todas.sort((a, b) => (a.creadoEn < b.creadoEn ? 1 : a.creadoEn > b.creadoEn ? -1 : 0));
  }, [cafs, eventos, fmvs, notificaciones, convenios, conveniosHCP, speakers, fmvUmbrales, companiaActual]);

  const archivadas = React.useMemo(() => {
    const ids = new Set<string>();
    if (!mesesArchivado) return ids;
    for (const t of tarjetas) {
      if (estaArchivado({ estado: t.estado, fechaFin: t.fechaFin, fechaInicio: t.fechaInicio, creadoEn: t.creadoEn }, mesesArchivado)) ids.add(`${t.tipoDoc}-${t.id}`);
    }
    return ids;
  }, [tarjetas, mesesArchivado]);

  // Las pastillas de tipo/estado y el rango de fechas se aplican primero; el conteo de «Archivados (n)» respeta esos filtros.
  const tarjetasSinArchivado = React.useMemo(() => {
    return tarjetas.filter((tarjeta) => {
      if (filtroTipo.length && !filtroTipo.includes(tarjeta.tipoDoc)) return false;
      if (filtroEstado.length && !filtroEstado.includes(tarjeta.estado)) return false;
      if (baseFecha === "creacion" ? !coincideRango(tarjeta.creadoEn, rangoFechas) : !intervaloCoincideRango(tarjeta.fechaInicio, tarjeta.fechaFin, rangoFechas)) return false;
      return true;
    });
  }, [tarjetas, filtroTipo, filtroEstado, rangoFechas, baseFecha]);

  // Conteos por opción (respetan los OTROS filtros, no el propio) para mostrarlos dentro de cada lista desplegable.
  const conteosFiltro = React.useMemo(() => {
    const fechaOk = (t: TarjetaDocumento) => (baseFecha === "creacion" ? coincideRango(t.creadoEn, rangoFechas) : intervaloCoincideRango(t.fechaInicio, t.fechaFin, rangoFechas));
    const porTipo: Record<string, number> = {};
    const porEstado: Record<string, number> = {};
    for (const t of tarjetas) {
      if (!fechaOk(t)) continue;
      if (!filtroEstado.length || filtroEstado.includes(t.estado)) porTipo[t.tipoDoc] = (porTipo[t.tipoDoc] ?? 0) + 1;
      if (!filtroTipo.length || filtroTipo.includes(t.tipoDoc)) porEstado[t.estado] = (porEstado[t.estado] ?? 0) + 1;
    }
    return { porTipo, porEstado };
  }, [tarjetas, filtroTipo, filtroEstado, rangoFechas, baseFecha]);

  const cantidadArchivados = React.useMemo(
    () => tarjetasSinArchivado.filter((t) => archivadas.has(`${t.tipoDoc}-${t.id}`)).length,
    [tarjetasSinArchivado, archivadas],
  );

  const tarjetasFiltradas = React.useMemo(() => {
    if (!mesesArchivado || vistaArchivado === "todos") return tarjetasSinArchivado;
    return tarjetasSinArchivado.filter((t) => archivadas.has(`${t.tipoDoc}-${t.id}`) === (vistaArchivado === "archivados"));
  }, [tarjetasSinArchivado, archivadas, mesesArchivado, vistaArchivado]);

  // Cualquier cambio de filtro vuelve a la primera página.
  React.useEffect(() => {
    setVisibles(TAMANO_PAGINA);
  }, [filtroTipo, filtroEstado, rangoFechas, baseFecha, vistaArchivado, mesesArchivado, companiaActual]);

  const usuarios = useUsuariosPorId(tarjetas.map((t) => t.creadoPorId));

  // Entrega 34: el orden por columna aplica solo a la vista de listado y antes de paginar.
  const tarjetasOrdenadas = React.useMemo(
    () => (vista === "listado" ? ordenarTarjetas(tarjetasFiltradas, ordenListado, (id) => usuarios.get(id)?.nombre ?? "") : tarjetasFiltradas),
    [tarjetasFiltradas, vista, ordenListado, usuarios],
  );
  const tarjetasPagina = React.useMemo(() => tarjetasOrdenadas.slice(0, visibles), [tarjetasOrdenadas, visibles]);

  // Alternancia ascendente → descendente → sin orden (vuelve al orden por defecto: más reciente primero).
  function ordenarPor(columna: ColumnaOrden) {
    setOrdenListado((prev) => (!prev || prev.columna !== columna ? { columna, direccion: "asc" } : prev.direccion === "asc" ? { columna, direccion: "desc" } : null));
  }
  function alternarAgrupar() {
    setAgruparListado((v) => {
      try { window.localStorage.setItem(CLAVE_AGRUPAR_LISTADO, v ? "0" : "1"); } catch { /* solo dura la sesión */ }
      return !v;
    });
  }
  const nombreEvento = React.useCallback((id: string) => eventos?.find((e) => e.id === id)?.nombreEvento || "Evento sin nombre", [eventos]);

  const hayFiltros = filtroTipo.length > 0 || filtroEstado.length > 0 || hayRango(rangoFechas) || (mesesArchivado > 0 && vistaArchivado !== "activos");
  function limpiarFiltros() {
    setFiltroTipo([]);
    setFiltroEstado([]);
    setRangoFechas(RANGO_VACIO);
    setVistaArchivado("activos");
  }

  function abrirDocumento(tarjeta: TarjetaDocumento) {
    abrirVentana(tarjeta.doc);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3" data-testid="tablero-filtros">
        {/* Entrega 30 (propuesta «Opción 1»): una sola fila con listas desplegables arriba a la derecha y los filtros
            activos como chips que se quitan con un clic. Reemplaza las 3 filas de pastillas con iconos. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground" data-testid="tablero-total">
            <span className="text-base font-semibold text-foreground">Documentos</span> · {tarjetasFiltradas.length}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2" data-testid="tablero-barra-filtros">
            <FiltroMulti
              etiqueta="Tipo"
              testId="tablero-filtro-tipo"
              seleccion={filtroTipo}
              onChange={setFiltroTipo}
              opciones={ORDEN_TIPO_DOC_TABLERO.map((t) => ({ valor: t, etiqueta: ETIQUETA_TIPO_DOC[t], conteo: conteosFiltro.porTipo[t] ?? 0 }))}
            />
            <FiltroMulti
              etiqueta="Estado"
              testId="tablero-filtro-estado"
              seleccion={filtroEstado}
              onChange={setFiltroEstado}
              opciones={ORDEN_ESTADO_TABLERO.map((e) => ({ valor: e, etiqueta: e, conteo: conteosFiltro.porEstado[e] ?? 0 }))}
            />
            <FiltroFechaDesplegable rango={rangoFechas} onRango={setRangoFechas} base={baseFecha} onBase={setBaseFecha} bases={BASES_FECHA} testId="tablero-filtro-fechas" />
            {mesesArchivado > 0 && (
              <FiltroUnico
                etiqueta="Archivo"
                testId="filtro-archivado"
                valor={vistaArchivado}
                onChange={(v) => setVistaArchivado(v as VistaArchivado)}
                valorPorDefecto="activos"
                opciones={[
                  { valor: "activos", etiqueta: "Activos" },
                  { valor: "archivados", etiqueta: "Archivados", conteo: cantidadArchivados },
                  { valor: "todos", etiqueta: "Todos" },
                ]}
              />
            )}
            {hayFiltros && (
              <button type="button" onClick={limpiarFiltros} data-testid="tablero-limpiar-filtros" className="h-9 rounded-lg px-2 text-sm text-slate-500 hover:text-slate-800">
                Limpiar
              </button>
            )}
            {vista === "listado" && (
              <button type="button" aria-pressed={agruparListado} onClick={alternarAgrupar} data-testid="tablero-agrupar-evento" title="Agrupar los documentos por evento" className={cn("inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors", agruparListado ? "border-[#00A3E0] bg-[#00A3E0]/10 text-[#0077a8]" : "text-slate-500 hover:bg-slate-100")}>
                <Layers className="h-3.5 w-3.5" />
                Agrupar por evento
              </button>
            )}
            <div className="flex shrink-0 items-center rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label="Vista de documentos" data-testid="tablero-selector-vista">
              <button type="button" aria-pressed={vista === "tarjetas"} title="Vista de tarjetas" aria-label="Vista de tarjetas" data-testid="tablero-vista-tarjetas" onClick={() => cambiarVista("tarjetas")} className={cn("rounded-md p-1.5 transition-colors", vista === "tarjetas" ? "bg-[#00A3E0] text-white" : "text-slate-500 hover:bg-slate-100")}>
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button type="button" aria-pressed={vista === "listado"} title="Vista de listado con detalles" aria-label="Vista de listado" data-testid="tablero-vista-listado" onClick={() => cambiarVista("listado")} className={cn("rounded-md p-1.5 transition-colors", vista === "listado" ? "bg-[#00A3E0] text-white" : "text-slate-500 hover:bg-slate-100")}>
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
        {hayFiltros && (
          <div className="flex flex-wrap items-center gap-1.5" data-testid="tablero-chips">
            {filtroTipo.map((t) => (
              <ChipFiltro key={`t-${t}`} onQuitar={() => setFiltroTipo((p) => p.filter((x) => x !== t))}>Tipo: {ETIQUETA_TIPO_DOC[t as TipoDoc]}</ChipFiltro>
            ))}
            {filtroEstado.map((e) => (
              <ChipFiltro key={`e-${e}`} onQuitar={() => setFiltroEstado((p) => p.filter((x) => x !== e))}>Estado: {e}</ChipFiltro>
            ))}
            {resumenRango(rangoFechas) && <ChipFiltro onQuitar={() => setRangoFechas(RANGO_VACIO)}>Fecha: {resumenRango(rangoFechas)}</ChipFiltro>}
            {mesesArchivado > 0 && vistaArchivado !== "activos" && <ChipFiltro onQuitar={() => setVistaArchivado("activos")}>Archivo: {vistaArchivado === "archivados" ? "Archivados" : "Todos"}</ChipFiltro>}
          </div>
        )}
        {mesesArchivado > 0 && vistaArchivado === "activos" && (
          <p className="text-xs text-muted-foreground">
            Archivado automático: eventos finalizados hace más de {mesesArchivado} {mesesArchivado === 1 ? "mes" : "meses"}.{" "}
            <button type="button" className="font-medium text-primary hover:underline" onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR_PREFERENCIAS))}>Cambiar</button>
          </p>
        )}
      </div>

      {cargando && <p className="text-sm text-muted-foreground">Cargando...</p>}

      {!cargando && tarjetasFiltradas.length === 0 && (
        <p className="text-sm text-muted-foreground">No hay documentos que coincidan con los filtros.</p>
      )}

      {/* AJUSTES (septiembre/octubre 2026), pedido explícito: "garantiza que las
          fichas de documentos aparezcan en una configuración de 3 columnas en la
          ventana (hoy aparecen en 2 columnas)". */}
      {!cargando && tarjetasFiltradas.length > 0 && vista === "listado" && (
        <ListadoDocumentos tarjetas={tarjetasPagina} usuarios={usuarios} onAbrir={abrirDocumento} orden={ordenListado} onOrdenar={ordenarPor} agrupar={agruparListado} nombreEvento={nombreEvento} />
      )}

      {!cargando && tarjetasFiltradas.length > 0 && vista === "tarjetas" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tarjetasPagina.map((tarjeta) => {
            const creador = usuarios.get(tarjeta.creadoPorId);
            return (
              <TarjetaDoc
                key={`${tarjeta.tipoDoc}-${tarjeta.id}`}
                tarjeta={tarjeta}
                nombreCreador={creador?.nombre ?? "—"}
                inicialesCreador={creador?.iniciales ?? "—"}
                fotoCreadorId={creador?.fotoId ?? null}
                onAbrir={abrirDocumento}
              />
            );
          })}
        </div>
      )}

      {!cargando && tarjetasFiltradas.length > 0 && (
        <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground" data-testid="tablero-paginacion">
          <span>
            Mostrando {Math.min(visibles, tarjetasFiltradas.length)} de {tarjetasFiltradas.length} documento(s)
          </span>
          {visibles < tarjetasFiltradas.length && (
            <Button variant="outline" size="sm" onClick={() => setVisibles((v) => v + TAMANO_PAGINA)} data-testid="tablero-mostrar-mas">
              Mostrar más
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
