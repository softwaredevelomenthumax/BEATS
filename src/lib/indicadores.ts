import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";
import { traerEventos } from "@/lib/evento";
import { traerRegistrosParticipacion, traerMuestrasEntregadas } from "@/lib/ejecucion";
import { traerConvenios } from "@/lib/convenio";
import { traerConveniosHCP } from "@/lib/convenioHCP";
import { traerNotificacionesPago } from "@/lib/notificacionPago";
import { traerCafs } from "@/lib/caf";
import { traerFmvs } from "@/lib/fmv";
import { traerSpeakersResumen } from "@/lib/speakers";
import { traerUsuarios } from "@/lib/usuarios";
import { traerPortafolioProductos } from "@/lib/productos";
import { claveTexto } from "@/lib/normalizarTexto";
import type { Evento } from "@/types";
import { mismoPais, paisesParaFiltro } from "@/lib/paisCanonico";

/**
 * Entrega 29 — «Indicadores de Uso y Gestión» (solo administradores).
 *
 * Dos familias de indicadores:
 *  - USO: salen de las tablas `telemetria_*` (sesiones, tiempos de formularios, revisión/firma, cargas).
 *  - GESTIÓN: salen de la información que ya vive en la app (eventos, check-ins, convenios, speakers, auditoría).
 *
 * Todo se calcula en el navegador a partir de lecturas paginadas (PostgREST corta en 1000 filas por consulta).
 * Las funciones de cálculo son puras (se pueden probar sin Supabase).
 */

// ---- Utilidades numéricas ----------------------------------------------------------------------------

export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const m = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[m] : (orden[m - 1] + orden[m]) / 2;
}

export function promedio(valores: number[]): number | null {
  return valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null;
}

export function percentil(valores: number[], p: number): number | null {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const i = Math.min(orden.length - 1, Math.max(0, Math.ceil((p / 100) * orden.length) - 1));
  return orden[i];
}

/** «1 h 05 min», «4 min 12 s», «38 s». */
export function formatearDuracion(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, "0")} s`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${String(m % 60).padStart(2, "0")} min`;
  return `${(h / 24).toFixed(1)} días`;
}

export function formatearEntero(n: number | null | undefined): string {
  return n == null ? "—" : Math.round(n).toLocaleString("es-CO");
}

export function formatearDinero(n: number): string {
  return n.toLocaleString("es-CO", { maximumFractionDigits: 0 });
}

// ---- Lectura paginada --------------------------------------------------------------------------------

const TAM_PAGINA = 1000;
const MAX_FILAS = 60_000;

async function traerTodo(
  tabla: string,
  seleccion: string,
  aplicar: (q: any) => any, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<Record<string, unknown>[]> {
  const filas: Record<string, unknown>[] = [];
  for (let desde = 0; desde < MAX_FILAS; desde += TAM_PAGINA) {
    const q = aplicar(supabase.from(tabla).select(seleccion)).range(desde, desde + TAM_PAGINA - 1);
    const { data, error } = await q;
    if (error) throw error;
    const lote = (data ?? []) as unknown as Record<string, unknown>[];
    filas.push(...lote);
    if (lote.length < TAM_PAGINA) break;
  }
  return filas;
}

/** `true` si el error indica que las tablas de telemetría todavía no existen (migración sin aplicar). */
export function faltaMigracionTelemetria(e: unknown): boolean {
  const x = e as { code?: string; message?: string } | null;
  return Boolean(x && (x.code === "42P01" || x.code === "PGRST205" || /telemetria_/.test(x.message ?? "") && /does not exist|not find|schema cache/i.test(x.message ?? "")));
}

// ---- USO -----------------------------------------------------------------------------------------------

export interface SesionTel {
  id: string;
  usuarioId: string;
  inicio: string;
  ultimoLatido: string;
  segundosTotales: number;
  segundosActivos: number;
}

export interface EventoTel {
  creadoEn: string;
  usuarioId: string;
  categoria: "pagina" | "formulario" | "revision" | "archivo" | "accion";
  nombre: string;
  tipoDoc: string | null;
  documentoId: string | null;
  resultado: string | null;
  duracionMs: number | null;
  activoMs: number | null;
  tamanoBytes: number | null;
}

export interface DatosTelemetria {
  sesiones: SesionTel[];
  eventos: EventoTel[];
  reinicios: { reiniciadoEn: string; sesionesBorradas: number; eventosBorrados: number }[];
  /** Primera marca de medición: la más antigua entre sesiones y eventos, o el último reinicio. */
  medidoDesde: string | null;
  truncado: boolean;
}

export async function traerTelemetria(desde?: string, hasta?: string): Promise<DatosTelemetria> {
  const rango = (campo: string) => (q: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    let r = q.order(campo, { ascending: true });
    if (desde) r = r.gte(campo, `${desde}T00:00:00`);
    if (hasta) r = r.lte(campo, `${hasta}T23:59:59`);
    return r;
  };
  try {
    const [ses, evt, rei] = await Promise.all([
      traerTodo("telemetria_sesiones", "id,usuario_id,inicio,ultimo_latido,segundos_totales,segundos_activos", rango("inicio")),
      traerTodo("telemetria_eventos", "creado_en,usuario_id,categoria,nombre,tipo_doc,documento_id,resultado,duracion_ms,activo_ms,tamano_bytes", rango("creado_en")),
      supabase.from("telemetria_reinicios").select("*").order("reiniciado_en", { ascending: false }).limit(20),
    ]);
    if (rei.error) throw rei.error;
    const sesiones: SesionTel[] = ses.map((f) => ({
      id: f.id as string,
      usuarioId: f.usuario_id as string,
      inicio: f.inicio as string,
      ultimoLatido: f.ultimo_latido as string,
      segundosTotales: Number(f.segundos_totales ?? 0),
      segundosActivos: Number(f.segundos_activos ?? 0),
    }));
    const eventos: EventoTel[] = evt.map((f) => ({
      creadoEn: f.creado_en as string,
      usuarioId: f.usuario_id as string,
      categoria: f.categoria as EventoTel["categoria"],
      nombre: f.nombre as string,
      tipoDoc: (f.tipo_doc as string) ?? null,
      documentoId: (f.documento_id as string) ?? null,
      resultado: (f.resultado as string) ?? null,
      duracionMs: f.duracion_ms == null ? null : Number(f.duracion_ms),
      activoMs: f.activo_ms == null ? null : Number(f.activo_ms),
      tamanoBytes: f.tamano_bytes == null ? null : Number(f.tamano_bytes),
    }));
    const reinicios = (rei.data ?? []).map((r) => ({
      reiniciadoEn: r.reiniciado_en as string,
      sesionesBorradas: Number(r.sesiones_borradas ?? 0),
      eventosBorrados: Number(r.eventos_borrados ?? 0),
    }));
    const marcas = [sesiones[0]?.inicio, eventos[0]?.creadoEn].filter(Boolean) as string[];
    const primera = marcas.length ? marcas.sort()[0] : null;
    return {
      sesiones,
      eventos,
      reinicios,
      medidoDesde: reinicios[0]?.reiniciadoEn && (!primera || reinicios[0].reiniciadoEn > primera) ? reinicios[0].reiniciadoEn : primera,
      truncado: ses.length >= MAX_FILAS || evt.length >= MAX_FILAS,
    };
  } catch (e) {
    if (faltaMigracionTelemetria(e)) throw new MigracionPendiente();
    throw new Error(mensajeErrorAmigable(e as { message?: string }));
  }
}

export class MigracionPendiente extends Error {
  constructor() {
    super("Falta aplicar la migración db/entrega_29_telemetria_uso.sql.");
    this.name = "MigracionPendiente";
  }
}

export async function reiniciarContadores(): Promise<{ sesiones: number; eventos: number }> {
  const { data, error } = await supabase.rpc("beats_telemetria_reiniciar");
  if (error) throw new Error(mensajeErrorAmigable(error));
  const r = (data ?? {}) as { sesiones?: number; eventos?: number };
  return { sesiones: r.sesiones ?? 0, eventos: r.eventos ?? 0 };
}

export interface ResumenUsuarioUso {
  usuarioId: string;
  nombre: string;
  sesiones: number;
  conectadoSeg: number;
  activoSeg: number;
  promedioSesionSeg: number;
  ultima: string;
}

export interface ResumenFormulario {
  tipoDoc: string;
  enviados: number;
  borradores: number;
  abandonados: number;
  /** Tiempo activo (con interacción) de los formularios enviados. */
  medianaActivoMs: number | null;
  promedioActivoMs: number | null;
  p90ActivoMs: number | null;
  medianaTotalMs: number | null;
  /** abandonados / (enviados + borradores + abandonados) */
  tasaAbandono: number | null;
}

export interface ResumenRevision {
  tipoDoc: string;
  revisiones: number;
  medianaActivoMs: number | null;
  promedioActivoMs: number | null;
  aprobadas: number;
  rechazadas: number;
  devueltas: number;
  tasaRechazo: number | null;
}

export interface ResumenPagina {
  pagina: string;
  visitas: number;
  totalMs: number;
  promedioMs: number | null;
}

export interface ResumenAcciones {
  nombre: string;
  cantidad: number;
  errores: number;
  promedioMs: number | null;
}

export interface IndicadoresUso {
  sesiones: number;
  usuariosUnicos: number;
  promedioConectadoSeg: number | null;
  medianaConectadoSeg: number | null;
  promedioActivoSeg: number | null;
  /** Tiempo activo / tiempo conectado. */
  proporcionActiva: number | null;
  /** Promedio de conectado por usuario por día en que se conectó. */
  conectadoPorUsuarioDiaSeg: number | null;
  porUsuario: ResumenUsuarioUso[];
  /** [díaSemana 0=lunes…6=domingo][hora 0…23] = minutos activos acumulados. */
  mapaCalor: number[][];
  sesionesPorDia: { dia: string; sesiones: number; usuarios: number }[];
  formularios: ResumenFormulario[];
  revisiones: ResumenRevision[];
  paginas: ResumenPagina[];
  archivos: { cargas: number; errores: number; promedioMs: number | null; medianaMs: number | null; tamanoPromedioBytes: number | null; bytesTotales: number };
  acciones: ResumenAcciones[];
  /** Tiempo de interacción (formularios + revisión + cargas) por evento, ya resuelto por documento. */
  porEvento: { eventoId: string; nombre: string; formulariosMs: number; revisionMs: number; documentos: number }[];
  /** Mediana de días entre envío y aprobación final por tipo de documento (desde auditoría). */
  cicloAprobacion: { tipoDoc: string; documentos: number; medianaDias: number | null; promedioDias: number | null }[];
}

function diaSemanaLunes0(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function claveDia(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface EntradaCalculoUso {
  tel: DatosTelemetria;
  nombreUsuario: (id: string) => string;
  /** documento_id → { eventoId, nombreEvento } para atribuir tiempos al evento. */
  eventoDeDocumento: Map<string, { eventoId: string; nombre: string }>;
  ciclos: { documentoId: string; tipoDoc: string; envio: string; final: string }[];
}

export function calcularIndicadoresUso({ tel, nombreUsuario, eventoDeDocumento, ciclos }: EntradaCalculoUso): IndicadoresUso {
  // ---- Sesiones
  const porUsuarioMapa = new Map<string, SesionTel[]>();
  for (const s of tel.sesiones) {
    const l = porUsuarioMapa.get(s.usuarioId);
    if (l) l.push(s);
    else porUsuarioMapa.set(s.usuarioId, [s]);
  }
  const conectados = tel.sesiones.map((s) => s.segundosTotales).filter((x) => x > 0);
  const activos = tel.sesiones.map((s) => s.segundosActivos).filter((x) => x >= 0);
  const totalConectado = tel.sesiones.reduce((a, s) => a + s.segundosTotales, 0);
  const totalActivo = tel.sesiones.reduce((a, s) => a + s.segundosActivos, 0);

  const diasPorUsuario = new Set<string>();
  for (const s of tel.sesiones) diasPorUsuario.add(`${s.usuarioId}|${claveDia(s.inicio)}`);

  const porUsuario: ResumenUsuarioUso[] = Array.from(porUsuarioMapa.entries())
    .map(([usuarioId, ses]) => {
      const conectadoSeg = ses.reduce((a, s) => a + s.segundosTotales, 0);
      return {
        usuarioId,
        nombre: nombreUsuario(usuarioId),
        sesiones: ses.length,
        conectadoSeg,
        activoSeg: ses.reduce((a, s) => a + s.segundosActivos, 0),
        promedioSesionSeg: conectadoSeg / ses.length,
        ultima: ses.reduce((a, s) => (s.inicio > a ? s.inicio : a), ses[0].inicio),
      };
    })
    .sort((a, b) => b.conectadoSeg - a.conectadoSeg);

  // ---- Mapa de calor: minutos activos por día de semana × hora (repartiendo las sesiones por hora de inicio
  //      y, para lo que dura más de una hora, de forma proporcional hora a hora).
  const mapaCalor = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const s of tel.sesiones) {
    let restante = s.segundosActivos;
    if (restante <= 0) continue;
    const inicio = new Date(s.inicio);
    const finMs = inicio.getTime() + Math.max(s.segundosTotales, 1) * 1000;
    const proporcion = s.segundosTotales > 0 ? s.segundosActivos / s.segundosTotales : 0;
    let cursor = inicio.getTime();
    while (cursor < finMs && restante > 0) {
      const d = new Date(cursor);
      const finHora = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime();
      const tramo = Math.min(finHora, finMs) - cursor;
      const aporte = Math.min(restante, (tramo / 1000) * proporcion);
      mapaCalor[diaSemanaLunes0(d)][d.getHours()] += aporte / 60;
      restante -= aporte;
      cursor = finHora;
    }
  }

  const porDia = new Map<string, { sesiones: number; usuarios: Set<string> }>();
  for (const s of tel.sesiones) {
    const k = claveDia(s.inicio);
    const f = porDia.get(k) ?? { sesiones: 0, usuarios: new Set<string>() };
    f.sesiones += 1;
    f.usuarios.add(s.usuarioId);
    porDia.set(k, f);
  }
  const sesionesPorDia = Array.from(porDia.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, f]) => ({ dia, sesiones: f.sesiones, usuarios: f.usuarios.size }));

  // ---- Formularios
  const tiposForm = new Set(tel.eventos.filter((e) => e.categoria === "formulario").map((e) => e.nombre));
  const formularios: ResumenFormulario[] = Array.from(tiposForm).map((tipoDoc) => {
    const filas = tel.eventos.filter((e) => e.categoria === "formulario" && e.nombre === tipoDoc);
    const enviados = filas.filter((f) => f.resultado === "enviado");
    const borradores = filas.filter((f) => f.resultado === "borrador").length;
    const abandonados = filas.filter((f) => f.resultado === "abandonado").length;
    const act = enviados.map((f) => f.activoMs).filter((x): x is number => x != null && x > 0);
    const tot = enviados.map((f) => f.duracionMs).filter((x): x is number => x != null && x > 0);
    const base = enviados.length + borradores + abandonados;
    return {
      tipoDoc,
      enviados: enviados.length,
      borradores,
      abandonados,
      medianaActivoMs: mediana(act),
      promedioActivoMs: promedio(act),
      p90ActivoMs: percentil(act, 90),
      medianaTotalMs: mediana(tot),
      tasaAbandono: base ? abandonados / base : null,
    };
  });

  // ---- Revisión / firma
  const tiposRev = new Set(tel.eventos.filter((e) => e.categoria === "revision").map((e) => e.nombre));
  const revisiones: ResumenRevision[] = Array.from(tiposRev).map((tipoDoc) => {
    const filas = tel.eventos.filter((e) => e.categoria === "revision" && e.nombre === tipoDoc);
    const act = filas.map((f) => f.activoMs).filter((x): x is number => x != null && x > 0);
    const aprobadas = filas.filter((f) => f.resultado === "aprobado").length;
    const rechazadas = filas.filter((f) => f.resultado === "rechazado").length;
    const devueltas = filas.filter((f) => f.resultado === "devuelto" || f.resultado === "enmienda").length;
    const decididas = aprobadas + rechazadas + devueltas;
    return {
      tipoDoc,
      revisiones: filas.length,
      medianaActivoMs: mediana(act),
      promedioActivoMs: promedio(act),
      aprobadas,
      rechazadas,
      devueltas,
      tasaRechazo: decididas ? (rechazadas + devueltas) / decididas : null,
    };
  });

  // ---- Páginas
  const mapaPag = new Map<string, { visitas: number; totalMs: number }>();
  for (const e of tel.eventos) {
    if (e.categoria !== "pagina") continue;
    const f = mapaPag.get(e.nombre) ?? { visitas: 0, totalMs: 0 };
    f.visitas += 1;
    f.totalMs += e.duracionMs ?? 0;
    mapaPag.set(e.nombre, f);
  }
  const paginas: ResumenPagina[] = Array.from(mapaPag.entries())
    .map(([pagina, f]) => ({ pagina, visitas: f.visitas, totalMs: f.totalMs, promedioMs: f.visitas ? f.totalMs / f.visitas : null }))
    .sort((a, b) => b.totalMs - a.totalMs);

  // ---- Archivos
  const arch = tel.eventos.filter((e) => e.categoria === "archivo");
  const dur = arch.filter((a) => a.resultado === "ok" && a.duracionMs != null).map((a) => a.duracionMs as number);
  const tam = arch.filter((a) => a.tamanoBytes != null).map((a) => a.tamanoBytes as number);
  const archivos = {
    cargas: arch.length,
    errores: arch.filter((a) => a.resultado === "error").length,
    promedioMs: promedio(dur),
    medianaMs: mediana(dur),
    tamanoPromedioBytes: promedio(tam),
    bytesTotales: tam.reduce((a, b) => a + b, 0),
  };

  // ---- Acciones puntuales
  const mapaAcc = new Map<string, { n: number; err: number; ms: number[] }>();
  for (const e of tel.eventos) {
    if (e.categoria !== "accion") continue;
    const f = mapaAcc.get(e.nombre) ?? { n: 0, err: 0, ms: [] };
    f.n += 1;
    if (e.resultado === "error") f.err += 1;
    if (e.duracionMs != null) f.ms.push(e.duracionMs);
    mapaAcc.set(e.nombre, f);
  }
  const acciones: ResumenAcciones[] = Array.from(mapaAcc.entries())
    .map(([nombre, f]) => ({ nombre, cantidad: f.n, errores: f.err, promedioMs: promedio(f.ms) }))
    .sort((a, b) => b.cantidad - a.cantidad);

  // ---- Por evento
  const mapaEvt = new Map<string, { nombre: string; formulariosMs: number; revisionMs: number; docs: Set<string> }>();
  for (const e of tel.eventos) {
    if (!e.documentoId || (e.categoria !== "formulario" && e.categoria !== "revision")) continue;
    const ref = eventoDeDocumento.get(e.documentoId);
    if (!ref) continue;
    const f = mapaEvt.get(ref.eventoId) ?? { nombre: ref.nombre, formulariosMs: 0, revisionMs: 0, docs: new Set<string>() };
    if (e.categoria === "formulario") f.formulariosMs += e.activoMs ?? 0;
    else f.revisionMs += e.activoMs ?? 0;
    f.docs.add(e.documentoId);
    mapaEvt.set(ref.eventoId, f);
  }
  const porEvento = Array.from(mapaEvt.entries())
    .map(([eventoId, f]) => ({ eventoId, nombre: f.nombre, formulariosMs: f.formulariosMs, revisionMs: f.revisionMs, documentos: f.docs.size }))
    .sort((a, b) => b.formulariosMs + b.revisionMs - (a.formulariosMs + a.revisionMs));

  // ---- Ciclo de aprobación (envío → aprobación final)
  const diasPorTipo = new Map<string, number[]>();
  for (const c of ciclos) {
    const dias = (new Date(c.final).getTime() - new Date(c.envio).getTime()) / 86_400_000;
    if (!(dias >= 0)) continue;
    const l = diasPorTipo.get(c.tipoDoc);
    if (l) l.push(dias);
    else diasPorTipo.set(c.tipoDoc, [dias]);
  }
  const cicloAprobacion = Array.from(diasPorTipo.entries()).map(([tipoDoc, dias]) => ({
    tipoDoc,
    documentos: dias.length,
    medianaDias: mediana(dias),
    promedioDias: promedio(dias),
  }));

  return {
    sesiones: tel.sesiones.length,
    usuariosUnicos: porUsuarioMapa.size,
    promedioConectadoSeg: promedio(conectados),
    medianaConectadoSeg: mediana(conectados),
    promedioActivoSeg: promedio(activos),
    proporcionActiva: totalConectado ? totalActivo / totalConectado : null,
    conectadoPorUsuarioDiaSeg: diasPorUsuario.size ? totalConectado / diasPorUsuario.size : null,
    porUsuario,
    mapaCalor,
    sesionesPorDia,
    formularios,
    revisiones,
    paginas,
    archivos,
    acciones,
    porEvento,
    cicloAprobacion,
  };
}

// ---- Auditoría → ciclos y mapa documento→evento --------------------------------------------------------

export async function traerCiclosAprobacion(desde?: string, hasta?: string) {
  const filas = await traerTodo("auditoria", "documento_id,tipo_doc,accion,ocurrido_en", (q) => {
    let r = q.in("accion", ["envio", "aprobacion_final"]).order("ocurrido_en", { ascending: true });
    if (desde) r = r.gte("ocurrido_en", `${desde}T00:00:00`);
    if (hasta) r = r.lte("ocurrido_en", `${hasta}T23:59:59`);
    return r;
  });
  const envio = new Map<string, string>();
  const ciclos: { documentoId: string; tipoDoc: string; envio: string; final: string }[] = [];
  for (const f of filas) {
    const id = f.documento_id as string;
    if (f.accion === "envio") {
      if (!envio.has(id)) envio.set(id, f.ocurrido_en as string);
    } else if (envio.has(id)) {
      ciclos.push({ documentoId: id, tipoDoc: f.tipo_doc as string, envio: envio.get(id) as string, final: f.ocurrido_en as string });
      envio.delete(id);
    }
  }
  return ciclos;
}

// ---- FILTRO POR EMPRESA DEL GRUPO (uso) ---------------------------------------------------------------------

/**
 * Octubre 2026, pedido explícito: «Indicadores de Uso y Gestión» se puede filtrar por empresa del grupo.
 * Para el USO: una sesión/medición cuenta si su usuario trabaja con esa empresa (lista vacía = con todas) y, cuando la
 * medición se refiere a un documento, si el evento de ese documento es de esa empresa.
 */
export function filtrarUsoPorEmpresa(
  tel: DatosTelemetria,
  ciclos: EntradaCalculoUso["ciclos"],
  base: BaseGestion,
  empresa: string,
): { tel: DatosTelemetria; ciclos: EntradaCalculoUso["ciclos"] } {
  if (!empresa) return { tel, ciclos };
  const usuarioEnEmpresa = (id: string) => {
    const empresas = base.usuariosEmpresas.get(id);
    return !empresas || empresas.length === 0 || empresas.includes(empresa);
  };
  const empresaDeEvento = new Map(base.eventos.map((e) => [e.id, e.empresaGrupo]));
  const eventoDeDoc = mapaDocumentoAEvento(base);
  const documentoEnEmpresa = (documentoId: string | null) => {
    if (!documentoId) return true;
    const ev = eventoDeDoc.get(documentoId);
    if (!ev) return true; // documento sin evento resoluble: no se descarta por empresa
    return empresaDeEvento.get(ev.eventoId) === empresa;
  };
  return {
    tel: {
      ...tel,
      sesiones: tel.sesiones.filter((s) => usuarioEnEmpresa(s.usuarioId)),
      eventos: tel.eventos.filter((e) => usuarioEnEmpresa(e.usuarioId) && documentoEnEmpresa(e.documentoId)),
    },
    ciclos: ciclos.filter((c) => documentoEnEmpresa(c.documentoId)),
  };
}

// ---- GESTIÓN ---------------------------------------------------------------------------------------------

export interface FiltrosGestion {
  desde?: string;
  hasta?: string;
  pais?: string;
  /** Octubre 2026: empresa del grupo (`Evento.empresaGrupo`). Vacío = todas. */
  empresa?: string;
}

export interface BaseGestion {
  eventos: Evento[];
  registros: Awaited<ReturnType<typeof traerRegistrosParticipacion>>;
  muestras: Awaited<ReturnType<typeof traerMuestrasEntregadas>>;
  convenios: Awaited<ReturnType<typeof traerConvenios>>;
  conveniosHcp: Awaited<ReturnType<typeof traerConveniosHCP>>;
  notificaciones: Awaited<ReturnType<typeof traerNotificacionesPago>>;
  cafs: Awaited<ReturnType<typeof traerCafs>>;
  fmvs: Awaited<ReturnType<typeof traerFmvs>>;
  speakers: Map<string, string>;
  usuarios: Map<string, string>;
  /** Octubre 2026: empresas del grupo de cada usuario (lista vacía = sin restricción, trabaja con todas). */
  usuariosEmpresas: Map<string, string[]>;
  /** Entrega 31: portafolio de productos (nombre y línea) para relacionar eventos con productos. */
  productos: Map<string, { nombre: string; linea: string }>;
}

export async function traerBaseGestion(): Promise<BaseGestion> {
  const [eventos, registros, muestras, convenios, conveniosHcp, notificaciones, cafs, fmvs, speakers, usuarios, productos] = await Promise.all([
    traerEventos(),
    traerRegistrosParticipacion(),
    traerMuestrasEntregadas(),
    traerConvenios(),
    traerConveniosHCP(),
    traerNotificacionesPago(),
    traerCafs(),
    traerFmvs(),
    traerSpeakersResumen(),
    traerUsuarios(),
    traerPortafolioProductos().catch(() => []),
  ]);
  return {
    eventos,
    registros,
    muestras,
    convenios,
    conveniosHcp,
    notificaciones,
    cafs,
    fmvs,
    speakers: new Map(speakers.map((s) => [s.id, s.nombreCompleto])),
    usuarios: new Map(usuarios.map((u) => [u.id, u.nombre])),
    usuariosEmpresas: new Map(usuarios.map((u) => [u.id, u.empresasGrupo ?? []])),
    productos: new Map(productos.map((p) => [p.id, { nombre: p.nombre, linea: p.lineaTerapeutica || "" }])),
  };
}

/** Mapa documento_id → evento (para atribuir tiempos de uso a cada evento). */
export function mapaDocumentoAEvento(base: BaseGestion): Map<string, { eventoId: string; nombre: string }> {
  const nombrePorEvento = new Map(base.eventos.map((e) => [e.id, e.nombreEvento || "(sin nombre)"]));
  const m = new Map<string, { eventoId: string; nombre: string }>();
  for (const e of base.eventos) m.set(e.id, { eventoId: e.id, nombre: nombrePorEvento.get(e.id) as string });
  const vincular = (docs: { id: string; eventoOrigenId: string | null }[]) => {
    for (const d of docs) {
      if (d.eventoOrigenId && nombrePorEvento.has(d.eventoOrigenId)) m.set(d.id, { eventoId: d.eventoOrigenId, nombre: nombrePorEvento.get(d.eventoOrigenId) as string });
    }
  };
  vincular(base.convenios);
  vincular(base.conveniosHcp);
  vincular(base.notificaciones);
  vincular(base.cafs);
  vincular(base.fmvs);
  return m;
}

const ESTADOS_VIGENTES = new Set(["Aprobado", "Completado"]);
const ESTADOS_EJECUTABLES = ESTADOS_VIGENTES;

export interface PorMoneda {
  moneda: string;
  total: number;
}

export interface FilaConteo {
  etiqueta: string;
  valor: number;
}

export interface IndicadoresGestion {
  eventosTotal: number;
  eventosPorEstado: FilaConteo[];
  eventosPorTipo: FilaConteo[];
  eventosEjecutables: number;
  eventosConCheckins: number;
  eventosSinCheckins: number;
  hcpsUnicos: number;
  hcpsRecurrentes: number;
  participacionesTotales: number;
  asistentesEsperados: number;
  asistentesRegistrados: number;
  cumplimientoAsistencia: number | null;
  porTipoParticipacion: FilaConteo[];
  porProfesion: FilaConteo[];
  porEspecialidad: FilaConteo[];
  muestrasEntregadas: number;
  ciudadesEventos: FilaConteo[];
  ciudadesAsistentes: FilaConteo[];
  top3CiudadesPct: number | null;
  paisesEventos: FilaConteo[];
  presupuestoPorMoneda: PorMoneda[];
  presupuestoPorRubro: { moneda: string; rubros: FilaConteo[] }[];
  costoPorAsistente: { moneda: string; valor: number }[];
  contratacionHcp: {
    convenios: number;
    hcpsContratados: number;
    porMoneda: PorMoneda[];
    promedioPorConvenio: { moneda: string; valor: number }[];
    topHcps: { nombre: string; convenios: number; total: number; moneda: string }[];
    facturadoPorMoneda: PorMoneda[];
  };
  speakers: {
    eventosConInterno: number;
    eventosConExterno: number;
    eventosMixtos: number;
    eventosSinSpeaker: number;
    participacionesInternas: number;
    participacionesExternas: number;
    honorariosPorTipo: { moneda: string; interno: number; externo: number }[];
    topExternos: FilaConteo[];
    topInternos: FilaConteo[];
  };
  tiempo: {
    medianaDiasEvento: number | null;
    horasEnSitioMediana: number | null;
    horasEnSitioTotal: number;
    eventosMedidos: number;
    diasAnticipacionMediana: number | null;
    horasPorEvento: { nombre: string; horas: number; participantes: number }[];
  };
  /** Entrega 31: horas de educación médica (tiempo de participación de los speakers) — solo eventos aprobados o completados. */
  educacion: {
    horasTotales: number;
    eventosConHoras: number;
    /** Eventos con speakers pero sin horas registradas (anteriores a la captura de horas). */
    eventosSinHoras: number;
    porTipoEvento: { tipo: string; eventos: number; participaciones: number; horas: number; promedioPorEvento: number | null }[];
    porTipoSpeaker: { tipo: "Interno" | "Externo"; speakers: number; actividades: number; participaciones: number; horas: number; promedioPorParticipacion: number | null }[];
    topSpeakers: { nombre: string; tipo: "Interno" | "Externo"; eventos: number; participaciones: number; horas: number }[];
  };
  /** Entrega 31: relación eventos ↔ productos, marcando el producto principal. */
  productos: {
    eventosConProducto: number;
    eventosSinProducto: number;
    filas: { producto: string; linea: string; eventos: number; comoPrincipal: number; horasComoPrincipal: number }[];
    porLineaPrincipal: FilaConteo[];
  };
  paisesDisponibles: string[];
}

/** Entrega 31: etiquetas legibles de los códigos que guarda el check-in (antes se mostraban tal cual: «evento», «medico»). */
export const ETIQUETA_TIPO_PARTICIPACION: Record<string, string> = {
  evento: "Asistencia a la actividad académica",
  stand: "Visita al stand",
  taller: "Asistencia a taller",
};
export const ETIQUETA_PROFESION_CHECKIN: Record<string, string> = {
  medico: "Médico",
  no_medico: "No médico",
};
const etiquetarCodigo = (mapa: Record<string, string>) => (v: string) => mapa[v] ?? (v ? v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, " ") : v);

/** Horas de participación de un speaker en un evento: suma de sus sesiones (o la única). */
function horasDeSpeaker(sp: { presupuestos?: { horasParticipacion: number | null }[] }): number {
  return (sp.presupuestos ?? []).reduce((a, p) => a + (Number(p.horasParticipacion) || 0), 0);
}

function conteo(valores: string[], max = 10, otras = true): FilaConteo[] {
  // Se agrupa sin distinguir mayúsculas/tildes («BOGOTÁ» = «Bogotá»): el check-in guarda en mayúsculas y no debe contarse aparte.
  const m = new Map<string, { n: number; variantes: Map<string, number> }>();
  for (const v of valores) {
    const original = v.trim() || "(sin dato)";
    const k = claveTexto(original);
    const f = m.get(k) ?? { n: 0, variantes: new Map<string, number>() };
    f.n += 1;
    f.variantes.set(original, (f.variantes.get(original) ?? 0) + 1);
    m.set(k, f);
  }
  const orden = Array.from(m.values())
    .map((f) => ({ etiqueta: Array.from(f.variantes.entries()).sort((a, b) => b[1] - a[1])[0][0], valor: f.n }))
    .sort((a, b) => b.valor - a.valor);
  const top = orden.slice(0, max);
  const resto = orden.slice(max).reduce((a, f) => a + f.valor, 0);
  if (otras && resto > 0) top.push({ etiqueta: "Otras", valor: resto });
  return top;
}

function sumarPorMoneda(items: { moneda: string; valor: number }[]): PorMoneda[] {
  const m = new Map<string, number>();
  for (const i of items) m.set(i.moneda || "—", (m.get(i.moneda || "—") ?? 0) + i.valor);
  return Array.from(m.entries()).map(([moneda, total]) => ({ moneda, total })).sort((a, b) => b.total - a.total);
}

const RUBROS: { clave: keyof Evento; etiqueta: string }[] = [
  { clave: "condensadoInscripcion", etiqueta: "Inscripción" },
  { clave: "condensadoTransporte", etiqueta: "Transporte" },
  { clave: "condensadoTraslado", etiqueta: "Traslado" },
  { clave: "condensadoHospedaje", etiqueta: "Hospedaje" },
  { clave: "condensadoAlimentos", etiqueta: "Alimentos" },
  { clave: "condensadoHonorariosSpeaker", etiqueta: "Honorarios speaker" },
  { clave: "condensadoOtro", etiqueta: "Otros" },
];

function costoEvento(e: Evento): number {
  let t = 0;
  for (const r of RUBROS) t += Number(e[r.clave] ?? 0) || 0;
  if (e.incluirValorParticipacion) t += Number(e.condensadoValorParticipacion ?? 0) || 0;
  return t;
}

function diasEntre(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const d = (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
  return Number.isFinite(d) ? d : null;
}

export function calcularIndicadoresGestion(base: BaseGestion, filtros: FiltrosGestion): IndicadoresGestion {
  const paisesDisponibles = paisesParaFiltro(base.eventos.map((e) => e.pais));
  const fechaRef = (e: Evento) => (e.fechaInicioEvento ?? e.creadoEn).slice(0, 10);
  const eventos = base.eventos.filter((e) => {
    if (e.estado === "Anulado") return false;
    const f = fechaRef(e);
    if (filtros.desde && f < filtros.desde) return false;
    if (filtros.hasta && f > filtros.hasta) return false;
    if (filtros.pais && !mismoPais(e.pais, filtros.pais)) return false;
    if (filtros.empresa && e.empresaGrupo !== filtros.empresa) return false;
    return true;
  });
  const ids = new Set(eventos.map((e) => e.id));
  const registros = base.registros.filter((r) => ids.has(r.eventoId));
  const muestras = base.muestras.filter((m) => ids.has(m.eventoId));

  // ---- Eventos
  const ejecutables = eventos.filter((e) => ESTADOS_EJECUTABLES.has(e.estado));
  const registrosPorEvento = new Map<string, typeof registros>();
  for (const r of registros) {
    const l = registrosPorEvento.get(r.eventoId);
    if (l) l.push(r);
    else registrosPorEvento.set(r.eventoId, [r]);
  }
  const conCheckins = ejecutables.filter((e) => (registrosPorEvento.get(e.id)?.length ?? 0) > 0).length;

  // ---- HCPs impactados
  const porCedula = new Map<string, Set<string>>();
  for (const r of registros) {
    if (!r.cedula) continue;
    const s = porCedula.get(r.cedula) ?? new Set<string>();
    s.add(r.eventoId);
    porCedula.set(r.cedula, s);
  }
  const esperados = ejecutables.reduce((a, e) => a + (e.numeroAsistentes ?? e.sesiones.reduce((x, s) => x + (s.numeroAsistentesEsperados ?? 0), 0)), 0);
  const registradosEnEjecutables = ejecutables.reduce((a, e) => a + (registrosPorEvento.get(e.id)?.length ?? 0), 0);

  // ---- Ciudades
  const ciudadDe = (e: Evento) => e.ciudad || e.sesiones.find((s) => s.ciudad)?.ciudad || "";
  const ciudadesEventos = conteo(eventos.map(ciudadDe), 8);
  const totalEv = ciudadesEventos.reduce((a, c) => a + c.valor, 0);
  const top3 = ciudadesEventos.filter((c) => c.etiqueta !== "Otras" && c.etiqueta !== "(sin dato)").slice(0, 3).reduce((a, c) => a + c.valor, 0);

  // ---- Presupuesto
  const costos = eventos.map((e) => ({ e, total: costoEvento(e) })).filter((x) => x.total > 0);
  const presupuestoPorMoneda = sumarPorMoneda(costos.map((x) => ({ moneda: x.e.moneda, valor: x.total })));
  const monedas = Array.from(new Set(costos.map((x) => x.e.moneda || "—")));
  const presupuestoPorRubro = monedas.map((moneda) => {
    const evs = costos.filter((x) => (x.e.moneda || "—") === moneda).map((x) => x.e);
    const rubros = RUBROS.map((r) => ({ etiqueta: r.etiqueta, valor: evs.reduce((a, e) => a + (Number(e[r.clave] ?? 0) || 0), 0) }))
      .concat([{ etiqueta: "Valor de participación", valor: evs.reduce((a, e) => a + (e.incluirValorParticipacion ? Number(e.condensadoValorParticipacion ?? 0) || 0 : 0), 0) }])
      .filter((r) => r.valor > 0)
      .sort((a, b) => b.valor - a.valor);
    return { moneda, rubros };
  });
  const costoPorAsistente = monedas
    .map((moneda) => {
      const evs = costos.filter((x) => (x.e.moneda || "—") === moneda && ESTADOS_EJECUTABLES.has(x.e.estado));
      const asist = evs.reduce((a, x) => a + (registrosPorEvento.get(x.e.id)?.length ?? 0), 0);
      const total = evs.reduce((a, x) => a + x.total, 0);
      return { moneda, valor: asist ? total / asist : NaN };
    })
    .filter((x) => Number.isFinite(x.valor));

  // ---- Contratación de HCPs (Convenios de pago vigentes de los eventos en alcance)
  const conveniosVig = base.convenios.filter((c) => ESTADOS_VIGENTES.has(c.estado) && c.eventoOrigenId && ids.has(c.eventoOrigenId));
  const porHcp = new Map<string, { nombre: string; n: number; total: number; moneda: string }>();
  for (const c of conveniosVig) {
    const clave = c.hcpCedulaLicencia || c.hcpNombreCompleto;
    const f = porHcp.get(clave) ?? { nombre: c.hcpNombreCompleto, n: 0, total: 0, moneda: c.monedaContraprestacion || "—" };
    f.n += 1;
    f.total += c.contraprestacionHCP ?? 0;
    porHcp.set(clave, f);
  }
  const contraprest = sumarPorMoneda(conveniosVig.map((c) => ({ moneda: c.monedaContraprestacion, valor: c.contraprestacionHCP ?? 0 })));
  const promedioPorConvenio = contraprest.map((p) => {
    const n = conveniosVig.filter((c) => (c.monedaContraprestacion || "—") === p.moneda && c.contraprestacionHCP != null).length;
    return { moneda: p.moneda, valor: n ? p.total / n : 0 };
  });
  const notifVig = base.notificaciones.filter((n) => ESTADOS_VIGENTES.has(n.estado) && n.eventoOrigenId && ids.has(n.eventoOrigenId));

  // ---- Speakers internos / externos
  let evInt = 0, evExt = 0, evMix = 0, evSin = 0, partInt = 0, partExt = 0;
  const honor = new Map<string, { interno: number; externo: number }>();
  const nombresExt: string[] = [];
  const nombresInt: string[] = [];
  for (const e of eventos) {
    const sp = e.speakersParticipacion ?? [];
    const tieneInt = sp.some((s) => s.tipo === "interno") || (!sp.length && e.quienDictaActividad === "Speaker interno");
    const tieneExt = sp.some((s) => s.tipo === "externo") || (!sp.length && e.quienDictaActividad === "Speaker externo");
    if (tieneInt && tieneExt) evMix += 1;
    else if (tieneInt) evInt += 1;
    else if (tieneExt) evExt += 1;
    else evSin += 1;
    for (const s of sp) {
      const monto = (s.montoHonorarios ?? 0) + (s.montoInscripcion ?? 0);
      const m = e.moneda || "—";
      const h = honor.get(m) ?? { interno: 0, externo: 0 };
      if (s.tipo === "interno") {
        partInt += 1;
        h.interno += monto;
        nombresInt.push(s.nombreSpeaker || "(sin nombre)");
      } else {
        partExt += 1;
        h.externo += monto;
        nombresExt.push((s.speakerId && base.speakers.get(s.speakerId)) || s.nombreSpeaker || "(sin nombre)");
      }
      honor.set(m, h);
    }
  }

  // ---- Tiempo
  const duraciones = eventos.map((e) => diasEntre(e.fechaInicioEvento, e.fechaFinEvento)).filter((d): d is number => d != null && d >= 0).map((d) => d + 1);
  const anticipacion = eventos.map((e) => diasEntre(e.creadoEn, e.fechaInicioEvento)).filter((d): d is number => d != null);
  const horasPorEvento: { nombre: string; horas: number; participantes: number }[] = [];
  for (const e of ejecutables) {
    const rs = registrosPorEvento.get(e.id) ?? [];
    if (rs.length < 2) continue;
    const ts = rs.map((r) => new Date(r.capturadoEn).getTime()).sort((a, b) => a - b);
    const horas = (ts[ts.length - 1] - ts[0]) / 3_600_000;
    // Un lapso mayor a 3 días entre el primer y el último check-in no es una jornada en sitio: se descarta.
    if (horas > 72) continue;
    horasPorEvento.push({ nombre: e.nombreEvento || "(sin nombre)", horas, participantes: rs.length });
  }
  horasPorEvento.sort((a, b) => b.horas - a.horas);

  // ---- Educación médica: horas de participación de speakers (Entrega 31)
  const conSpeakers = ejecutables.filter((e) => (e.speakersParticipacion ?? []).length > 0);
  const porTipoEventoMapa = new Map<string, { eventos: Set<string>; participaciones: number; horas: number }>();
  const porTipoSpeakerMapa = {
    Interno: { speakers: new Set<string>(), actividades: new Set<string>(), participaciones: 0, horas: 0 },
    Externo: { speakers: new Set<string>(), actividades: new Set<string>(), participaciones: 0, horas: 0 },
  };
  const porSpeakerMapa = new Map<string, { nombre: string; tipo: "Interno" | "Externo"; eventos: Set<string>; participaciones: number; horas: number }>();
  let horasTotales = 0;
  let eventosConHoras = 0;
  const horasPorEventoId = new Map<string, number>();
  for (const e of conSpeakers) {
    let horasEvento = 0;
    for (const sp of e.speakersParticipacion) {
      const h = horasDeSpeaker(sp);
      if (h <= 0) continue;
      horasEvento += h;
      const tipo: "Interno" | "Externo" = sp.tipo === "interno" ? "Interno" : "Externo";
      const nombre = tipo === "Externo" ? (sp.speakerId && base.speakers.get(sp.speakerId)) || sp.nombreSpeaker || "(sin nombre)" : sp.nombreSpeaker || "(sin nombre)";
      const claveSp = `${tipo}:${claveTexto(nombre)}`;
      const t = porTipoSpeakerMapa[tipo];
      t.speakers.add(claveSp);
      t.actividades.add(e.id);
      t.participaciones += 1;
      t.horas += h;
      const f = porSpeakerMapa.get(claveSp) ?? { nombre, tipo, eventos: new Set<string>(), participaciones: 0, horas: 0 };
      f.eventos.add(e.id);
      f.participaciones += 1;
      f.horas += h;
      porSpeakerMapa.set(claveSp, f);
      const tipoEv = (e.tipoEvento || "").trim() || "(sin dato)";
      const te = porTipoEventoMapa.get(tipoEv) ?? { eventos: new Set<string>(), participaciones: 0, horas: 0 };
      te.eventos.add(e.id);
      te.participaciones += 1;
      te.horas += h;
      porTipoEventoMapa.set(tipoEv, te);
    }
    if (horasEvento > 0) {
      eventosConHoras += 1;
      horasTotales += horasEvento;
      horasPorEventoId.set(e.id, horasEvento);
    }
  }

  // ---- Productos del evento: relación evento ↔ producto y producto principal (Entrega 31)
  const porProductoMapa = new Map<string, { producto: string; linea: string; eventos: number; comoPrincipal: number; horasComoPrincipal: number }>();
  let eventosConProducto = 0;
  const lineasPrincipal: string[] = [];
  for (const e of ejecutables) {
    const lista = e.productosEvento ?? [];
    if (lista.length === 0) continue;
    eventosConProducto += 1;
    for (const p of lista) {
      const info = base.productos.get(p.productoId);
      const nombre = info?.nombre ?? p.nombreProducto;
      const f = porProductoMapa.get(p.productoId) ?? { producto: nombre, linea: info?.linea ?? "", eventos: 0, comoPrincipal: 0, horasComoPrincipal: 0 };
      f.eventos += 1;
      if (p.principal) {
        f.comoPrincipal += 1;
        f.horasComoPrincipal += horasPorEventoId.get(e.id) ?? 0;
        lineasPrincipal.push(info?.linea || "(sin línea)");
      }
      porProductoMapa.set(p.productoId, f);
    }
  }

  return {
    eventosTotal: eventos.length,
    eventosPorEstado: conteo(eventos.map((e) => e.estado), 10, false),
    eventosPorTipo: conteo(eventos.map((e) => e.tipoEvento), 8),
    eventosEjecutables: ejecutables.length,
    eventosConCheckins: conCheckins,
    eventosSinCheckins: ejecutables.length - conCheckins,
    hcpsUnicos: porCedula.size,
    hcpsRecurrentes: Array.from(porCedula.values()).filter((s) => s.size > 1).length,
    participacionesTotales: registros.length,
    asistentesEsperados: esperados,
    asistentesRegistrados: registradosEnEjecutables,
    cumplimientoAsistencia: esperados ? registradosEnEjecutables / esperados : null,
    porTipoParticipacion: conteo(registros.map((r) => etiquetarCodigo(ETIQUETA_TIPO_PARTICIPACION)(r.tipoParticipacion)), 6),
    porProfesion: conteo(registros.map((r) => etiquetarCodigo(ETIQUETA_PROFESION_CHECKIN)(r.profesion)), 8),
    porEspecialidad: conteo(registros.map((r) => r.especialidad || r.especialidadOtra), 8),
    muestrasEntregadas: muestras.reduce((a, m) => a + m.cantidad, 0),
    ciudadesEventos,
    ciudadesAsistentes: conteo(registros.map((r) => r.ciudad), 8),
    top3CiudadesPct: totalEv ? top3 / totalEv : null,
    paisesEventos: conteo(eventos.map((e) => e.pais), 8),
    presupuestoPorMoneda,
    presupuestoPorRubro,
    costoPorAsistente,
    contratacionHcp: {
      convenios: conveniosVig.length,
      hcpsContratados: porHcp.size,
      porMoneda: contraprest,
      promedioPorConvenio,
      topHcps: Array.from(porHcp.values()).sort((a, b) => b.total - a.total).slice(0, 8).map((h) => ({ nombre: h.nombre, convenios: h.n, total: h.total, moneda: h.moneda })),
      facturadoPorMoneda: sumarPorMoneda(notifVig.map((n) => ({ moneda: n.monedaFactura ?? "", valor: n.valorFactura ?? 0 }))),
    },
    speakers: {
      eventosConInterno: evInt,
      eventosConExterno: evExt,
      eventosMixtos: evMix,
      eventosSinSpeaker: evSin,
      participacionesInternas: partInt,
      participacionesExternas: partExt,
      honorariosPorTipo: Array.from(honor.entries()).map(([moneda, h]) => ({ moneda, ...h })),
      topExternos: conteo(nombresExt, 6, false),
      topInternos: conteo(nombresInt, 6, false),
    },
    tiempo: {
      medianaDiasEvento: mediana(duraciones),
      horasEnSitioMediana: mediana(horasPorEvento.map((h) => h.horas)),
      horasEnSitioTotal: horasPorEvento.reduce((a, h) => a + h.horas, 0),
      eventosMedidos: horasPorEvento.length,
      diasAnticipacionMediana: mediana(anticipacion),
      horasPorEvento: horasPorEvento.slice(0, 8),
    },
    educacion: {
      horasTotales,
      eventosConHoras,
      eventosSinHoras: conSpeakers.length - eventosConHoras,
      porTipoEvento: Array.from(porTipoEventoMapa.entries())
        .map(([tipo, v]) => ({ tipo, eventos: v.eventos.size, participaciones: v.participaciones, horas: v.horas, promedioPorEvento: v.eventos.size ? v.horas / v.eventos.size : null }))
        .sort((a, b) => b.horas - a.horas),
      porTipoSpeaker: (["Interno", "Externo"] as const).map((tipo) => {
        const v = porTipoSpeakerMapa[tipo];
        return { tipo, speakers: v.speakers.size, actividades: v.actividades.size, participaciones: v.participaciones, horas: v.horas, promedioPorParticipacion: v.participaciones ? v.horas / v.participaciones : null };
      }),
      topSpeakers: Array.from(porSpeakerMapa.values())
        .map((f) => ({ nombre: f.nombre, tipo: f.tipo, eventos: f.eventos.size, participaciones: f.participaciones, horas: f.horas }))
        .sort((a, b) => b.horas - a.horas)
        .slice(0, 10),
    },
    productos: {
      eventosConProducto,
      eventosSinProducto: ejecutables.length - eventosConProducto,
      filas: Array.from(porProductoMapa.values()).sort((a, b) => b.comoPrincipal - a.comoPrincipal || b.eventos - a.eventos),
      porLineaPrincipal: conteo(lineasPrincipal, 8),
    },
    paisesDisponibles,
  };
}
