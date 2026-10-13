import { ETIQUETA_TIPO_DOC, type TipoDoc } from "@/lib/enums";
import { formatearDuracion, type IndicadoresGestion, type IndicadoresUso } from "@/lib/indicadores";

/**
 * Entrega 31 (octubre 2026): exportación de los indicadores a CSV en formato «largo»
 * (una fila por dato), pensado para abrirlo en Excel/Power BI y filtrar o hacer tablas
 * dinámicas: Sección · Indicador · Categoría · Valor · Unidad · Desde · Hasta · País · Empresa del grupo.
 * Los valores van como número crudo (sin formato de moneda ni separadores).
 */

export const ENCABEZADOS_CSV_KPI = ["Sección", "Indicador", "Categoría", "Valor", "Unidad", "Desde", "Hasta", "País", "Empresa del grupo"];

export interface FiltroCsv {
  desde?: string;
  hasta?: string;
  pais?: string;
  /** Octubre 2026: empresa del grupo filtrada (vacío = todas). */
  empresa?: string;
}

type Fila = (string | number)[];

function redondear(n: number | null | undefined, dec = 2): number | string {
  if (n == null || !Number.isFinite(n)) return "";
  const f = 10 ** dec;
  return Math.round(n * f) / f;
}

function constructor(filtro: FiltroCsv) {
  const filas: Fila[] = [];
  const base = [filtro.desde ?? "", filtro.hasta ?? "", filtro.pais ?? "Todos", filtro.empresa ?? "Todas"];
  return {
    filas,
    agregar(seccion: string, indicador: string, categoria: string, valor: number | string | null | undefined, unidad: string) {
      filas.push([seccion, indicador, categoria, valor == null ? "" : valor, unidad, ...base]);
    },
  };
}

export function filasCsvGestion(g: IndicadoresGestion, filtro: FiltroCsv): Fila[] {
  const { filas, agregar } = constructor(filtro);
  const S1 = "Eventos y asistencia";
  agregar(S1, "Eventos en el período", "", g.eventosTotal, "eventos");
  agregar(S1, "Eventos aprobados o completados", "", g.eventosEjecutables, "eventos");
  agregar(S1, "Eventos con check-ins", "", g.eventosConCheckins, "eventos");
  agregar(S1, "Eventos ejecutables sin check-ins", "", g.eventosSinCheckins, "eventos");
  for (const f of g.eventosPorEstado) agregar(S1, "Eventos por estado", f.etiqueta, f.valor, "eventos");
  for (const f of g.eventosPorTipo) agregar(S1, "Eventos por tipo de evento", f.etiqueta, f.valor, "eventos");
  agregar(S1, "HCPs impactados (únicos)", "", g.hcpsUnicos, "personas");
  agregar(S1, "HCPs que asistieron a más de un evento", "", g.hcpsRecurrentes, "personas");
  agregar(S1, "Participaciones (check-ins)", "", g.participacionesTotales, "registros");
  agregar(S1, "Asistentes esperados", "", g.asistentesEsperados, "personas");
  agregar(S1, "Asistentes registrados", "", g.asistentesRegistrados, "personas");
  agregar(S1, "Cumplimiento de asistencia", "", redondear(g.cumplimientoAsistencia == null ? null : g.cumplimientoAsistencia * 100, 1), "%");
  for (const f of g.porTipoParticipacion) agregar(S1, "Tipo de participación de los asistentes", f.etiqueta, f.valor, "registros");
  for (const f of g.porProfesion) agregar(S1, "Profesión de los asistentes", f.etiqueta, f.valor, "registros");
  for (const f of g.porEspecialidad) agregar(S1, "Especialidad de los asistentes", f.etiqueta, f.valor, "registros");
  agregar(S1, "Muestras entregadas", "", g.muestrasEntregadas, "unidades");

  const S2 = "Geografía";
  for (const f of g.ciudadesEventos) agregar(S2, "Eventos por ciudad", f.etiqueta, f.valor, "eventos");
  for (const f of g.ciudadesAsistentes) agregar(S2, "Asistentes por ciudad", f.etiqueta, f.valor, "registros");
  for (const f of g.paisesEventos) agregar(S2, "Eventos por país", f.etiqueta, f.valor, "eventos");
  agregar(S2, "Concentración de las 3 ciudades principales", "", redondear(g.top3CiudadesPct == null ? null : g.top3CiudadesPct * 100, 1), "%");

  const S3 = "Presupuesto";
  for (const p of g.presupuestoPorMoneda) agregar(S3, "Presupuesto solicitado", p.moneda, redondear(p.total), p.moneda);
  for (const r of g.presupuestoPorRubro) for (const f of r.rubros) agregar(S3, `Presupuesto por rubro (${r.moneda})`, f.etiqueta, redondear(f.valor), r.moneda);
  for (const c of g.costoPorAsistente) agregar(S3, "Costo por asistente", c.moneda, redondear(c.valor), c.moneda);

  const S4 = "Contratación de HCPs";
  agregar(S4, "Convenios de pago vigentes", "", g.contratacionHcp.convenios, "convenios");
  agregar(S4, "HCPs contratados", "", g.contratacionHcp.hcpsContratados, "personas");
  for (const p of g.contratacionHcp.porMoneda) agregar(S4, "Contraprestación total", p.moneda, redondear(p.total), p.moneda);
  for (const p of g.contratacionHcp.promedioPorConvenio) agregar(S4, "Promedio por convenio", p.moneda, redondear(p.valor), p.moneda);
  for (const p of g.contratacionHcp.facturadoPorMoneda) agregar(S4, "Facturado", p.moneda, redondear(p.total), p.moneda);
  for (const h of g.contratacionHcp.topHcps) agregar(S4, "HCPs con mayor contratación", `${h.nombre} (${h.convenios} convenio(s))`, redondear(h.total), h.moneda);

  const S5 = "Speakers";
  agregar(S5, "Eventos solo con speakers internos", "", g.speakers.eventosConInterno, "eventos");
  agregar(S5, "Eventos solo con speakers externos", "", g.speakers.eventosConExterno, "eventos");
  agregar(S5, "Eventos con speakers internos y externos", "", g.speakers.eventosMixtos, "eventos");
  agregar(S5, "Eventos sin speaker", "", g.speakers.eventosSinSpeaker, "eventos");
  agregar(S5, "Participaciones de speakers internos", "", g.speakers.participacionesInternas, "participaciones");
  agregar(S5, "Participaciones de speakers externos", "", g.speakers.participacionesExternas, "participaciones");
  for (const h of g.speakers.honorariosPorTipo) {
    agregar(S5, "Honorarios e inscripción de speakers internos", h.moneda, redondear(h.interno), h.moneda);
    agregar(S5, "Honorarios e inscripción de speakers externos", h.moneda, redondear(h.externo), h.moneda);
  }
  for (const f of g.speakers.topExternos) agregar(S5, "Speakers externos con más actividades", f.etiqueta, f.valor, "participaciones");
  for (const f of g.speakers.topInternos) agregar(S5, "Speakers internos con más actividades", f.etiqueta, f.valor, "participaciones");

  const S6 = "Tiempo destinado a las actividades";
  agregar(S6, "Duración típica del evento (mediana)", "", redondear(g.tiempo.medianaDiasEvento, 1), "días");
  agregar(S6, "Anticipación típica de la solicitud (mediana)", "", redondear(g.tiempo.diasAnticipacionMediana, 0), "días");
  agregar(S6, "Horas en sitio (mediana)", "", redondear(g.tiempo.horasEnSitioMediana, 1), "horas");
  agregar(S6, "Horas en sitio (total)", "", redondear(g.tiempo.horasEnSitioTotal, 1), "horas");
  for (const h of g.tiempo.horasPorEvento) agregar(S6, "Horas en sitio por evento", h.nombre, redondear(h.horas, 1), "horas");

  const S7 = "Educación médica (horas de participación)";
  const ed = g.educacion;
  agregar(S7, "Horas de participación de speakers (total)", "", redondear(ed.horasTotales), "horas");
  agregar(S7, "Eventos con horas registradas", "", ed.eventosConHoras, "eventos");
  agregar(S7, "Eventos con speakers y sin horas registradas", "", ed.eventosSinHoras, "eventos");
  for (const t of ed.porTipoEvento) {
    agregar(S7, "Horas por tipo de evento", t.tipo, redondear(t.horas), "horas");
    agregar(S7, "Eventos por tipo de evento (con horas)", t.tipo, t.eventos, "eventos");
    agregar(S7, "Promedio de horas por evento", t.tipo, redondear(t.promedioPorEvento), "horas");
  }
  for (const t of ed.porTipoSpeaker) {
    agregar(S7, "Horas por tipo de speaker", t.tipo, redondear(t.horas), "horas");
    agregar(S7, "Speakers distintos", t.tipo, t.speakers, "personas");
    agregar(S7, "Actividades (eventos) con speakers", t.tipo, t.actividades, "eventos");
    agregar(S7, "Participaciones de speakers", t.tipo, t.participaciones, "participaciones");
    agregar(S7, "Promedio de horas por participación", t.tipo, redondear(t.promedioPorParticipacion), "horas");
  }
  for (const sp of ed.topSpeakers) agregar(S7, "Speakers con más horas", `${sp.nombre} (${sp.tipo.toLowerCase()}, ${sp.eventos} evento(s))`, redondear(sp.horas), "horas");

  const S8 = "Productos de los eventos";
  agregar(S8, "Eventos con productos asignados", "", g.productos.eventosConProducto, "eventos");
  agregar(S8, "Eventos sin productos asignados", "", g.productos.eventosSinProducto, "eventos");
  for (const f of g.productos.filas) {
    const cat = f.linea ? `${f.producto} (${f.linea})` : f.producto;
    agregar(S8, "Eventos relacionados con el producto", cat, f.eventos, "eventos");
    agregar(S8, "Eventos donde es producto principal", cat, f.comoPrincipal, "eventos");
    agregar(S8, "Horas de educación en eventos donde es principal", cat, redondear(f.horasComoPrincipal), "horas");
  }
  for (const f of g.productos.porLineaPrincipal) agregar(S8, "Eventos por línea del producto principal", f.etiqueta, f.valor, "eventos");
  return filas;
}

export function filasCsvUso(u: IndicadoresUso, filtro: FiltroCsv): Fila[] {
  const { filas, agregar } = constructor({ ...filtro, pais: "" });
  const min = (seg: number | null | undefined) => (seg == null ? "" : redondear(seg / 60, 1));
  const S1 = "Sesiones";
  agregar(S1, "Sesiones", "", u.sesiones, "sesiones");
  agregar(S1, "Usuarios únicos", "", u.usuariosUnicos, "usuarios");
  agregar(S1, "Tiempo conectado promedio por sesión", "", min(u.promedioConectadoSeg), "minutos");
  agregar(S1, "Tiempo conectado (mediana) por sesión", "", min(u.medianaConectadoSeg), "minutos");
  agregar(S1, "Tiempo activo promedio por sesión", "", min(u.promedioActivoSeg), "minutos");
  agregar(S1, "Proporción de tiempo activo", "", redondear(u.proporcionActiva == null ? null : u.proporcionActiva * 100, 1), "%");
  agregar(S1, "Conectado por usuario y día", "", min(u.conectadoPorUsuarioDiaSeg), "minutos");
  for (const d of u.sesionesPorDia) agregar(S1, "Sesiones por día", d.dia, d.sesiones, "sesiones");
  for (const x of u.porUsuario) {
    agregar("Uso por usuario", "Sesiones", x.nombre, x.sesiones, "sesiones");
    agregar("Uso por usuario", "Tiempo conectado", x.nombre, min(x.conectadoSeg), "minutos");
    agregar("Uso por usuario", "Tiempo activo", x.nombre, min(x.activoSeg), "minutos");
    agregar("Uso por usuario", "Promedio por sesión", x.nombre, min(x.promedioSesionSeg), "minutos");
  }
  const etq = (t: string) => ETIQUETA_TIPO_DOC[t as TipoDoc] ?? t;
  for (const f of u.formularios) {
    const S = "Diligenciamiento de formularios";
    agregar(S, "Enviados", etq(f.tipoDoc), f.enviados, "formularios");
    agregar(S, "Borradores", etq(f.tipoDoc), f.borradores, "formularios");
    agregar(S, "Abandonados", etq(f.tipoDoc), f.abandonados, "formularios");
    agregar(S, "Tiempo activo (mediana)", etq(f.tipoDoc), redondear(f.medianaActivoMs == null ? null : f.medianaActivoMs / 60000, 1), "minutos");
    agregar(S, "Tiempo activo (promedio)", etq(f.tipoDoc), redondear(f.promedioActivoMs == null ? null : f.promedioActivoMs / 60000, 1), "minutos");
    agregar(S, "Tiempo activo (percentil 90)", etq(f.tipoDoc), redondear(f.p90ActivoMs == null ? null : f.p90ActivoMs / 60000, 1), "minutos");
    agregar(S, "Tasa de abandono", etq(f.tipoDoc), redondear(f.tasaAbandono == null ? null : f.tasaAbandono * 100, 1), "%");
  }
  for (const r of u.revisiones) {
    const S = "Revisión y firma";
    agregar(S, "Revisiones", etq(r.tipoDoc), r.revisiones, "revisiones");
    agregar(S, "Tiempo activo (mediana)", etq(r.tipoDoc), redondear(r.medianaActivoMs == null ? null : r.medianaActivoMs / 60000, 1), "minutos");
    agregar(S, "Aprobadas", etq(r.tipoDoc), r.aprobadas, "documentos");
    agregar(S, "Rechazadas", etq(r.tipoDoc), r.rechazadas, "documentos");
    agregar(S, "Devueltas", etq(r.tipoDoc), r.devueltas, "documentos");
    agregar(S, "Tasa de rechazo", etq(r.tipoDoc), redondear(r.tasaRechazo == null ? null : r.tasaRechazo * 100, 1), "%");
  }
  for (const c of u.cicloAprobacion) {
    agregar("Ciclo de aprobación", "Documentos con ciclo completo", etq(c.tipoDoc), c.documentos, "documentos");
    agregar("Ciclo de aprobación", "Mediana envío → aprobación final", etq(c.tipoDoc), redondear(c.medianaDias, 1), "días");
    agregar("Ciclo de aprobación", "Promedio envío → aprobación final", etq(c.tipoDoc), redondear(c.promedioDias, 1), "días");
  }
  agregar("Carga de archivos", "Cargas", "", u.archivos.cargas, "archivos");
  agregar("Carga de archivos", "Errores", "", u.archivos.errores, "archivos");
  agregar("Carga de archivos", "Tiempo promedio", "", redondear(u.archivos.promedioMs == null ? null : u.archivos.promedioMs / 1000, 1), "segundos");
  agregar("Carga de archivos", "Tamaño promedio", "", redondear(u.archivos.tamanoPromedioBytes == null ? null : u.archivos.tamanoPromedioBytes / 1024, 0), "KB");
  agregar("Carga de archivos", "Bytes cargados (total)", "", u.archivos.bytesTotales, "bytes");
  for (const a of u.acciones) {
    agregar("Acciones medidas", "Veces", a.nombre, a.cantidad, "veces");
    agregar("Acciones medidas", "Errores", a.nombre, a.errores, "veces");
    agregar("Acciones medidas", "Tiempo promedio", a.nombre, redondear(a.promedioMs == null ? null : a.promedioMs / 1000, 2), "segundos");
  }
  for (const p of u.paginas) {
    agregar("Páginas", "Visitas", p.pagina, p.visitas, "visitas");
    agregar("Páginas", "Tiempo total", p.pagina, redondear(p.totalMs / 60000, 1), "minutos");
  }
  for (const e of u.porEvento) {
    agregar("Interacción por evento", "Tiempo de diligenciar", e.nombre, redondear(e.formulariosMs / 60000, 1), "minutos");
    agregar("Interacción por evento", "Tiempo de revisión", e.nombre, redondear(e.revisionMs / 60000, 1), "minutos");
    agregar("Interacción por evento", "Documentos", e.nombre, e.documentos, "documentos");
  }
  // Mapa de calor (día de la semana × hora): minutos activos acumulados.
  const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  u.mapaCalor.forEach((horas, d) =>
    horas.forEach((m, h) => {
      if (m > 0) agregar("Mapa de calor", "Minutos activos", `${DIAS[d]} ${String(h).padStart(2, "0")}:00`, redondear(m, 1), "minutos");
    }),
  );
  void formatearDuracion;
  return filas;
}
