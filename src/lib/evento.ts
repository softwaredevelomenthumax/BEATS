import { congelarFormatoAlPrimerFirma } from "@/lib/congelamiento";
import { actualizarDocumentoEditable } from "@/lib/documentosRpc";
import { tieneAlMenosUnaFirma } from "@/lib/cicloVidaDocumento";
import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";
import { eliminarBorradorDocumento, eliminarDocumentoAdmin, anularDocumentoRpc } from "@/lib/documentosRpc";
import { rowToFlat, flatToRow, flatToRowParcial, t, s0, b, n0n, j, type FieldSpec, em } from "@/lib/dbMapping";
import { crearCadenaAprobacionEvento, pasosPreviosAprobados, cadenaCompletamenteAprobada, type PasoAprobacion, idsAprobadoresPrevios } from "@/lib/aprobaciones";
import { registrarAuditoria } from "@/lib/auditoria";
import { notificarResolucionPaso, notificarTareaPendiente, traerUsuariosParaNotificar } from "@/lib/notificaciones";
import { avisarPrimerAprobador, insertarCadenaOReversar, pasarAPendienteOReversar, retirarDocumentoRecienCreado } from "@/lib/envioAprobacion";
import { avisarTareasFmvYConvenioPago } from "@/lib/tareasEscalonadas";
import { presupuestoSesionVacio } from "@/lib/presupuestoEvento";
import { construirChecklistEvento } from "@/lib/documentosRequeridosEvento";
import {
  devolverDocumento,
  solicitarEnmiendaDocumento,
  cerrarVentanaEnmiendaDocumento,
  puedeDevolverDocumento,
  puedeSolicitarEnmienda,
} from "@/lib/cicloVidaDocumento";
import { inferirTipoSpeaker, eventoTieneSpeakersExternos, speakersExternosDe } from "@/lib/speakersEvento";
import type {
  Caf,
  CodigoAccesoEvento,
  Convenio,
  Evento,
  Fmv,
  MuestraPlaneada,
  ProductoEvento,
  NotificacionPagoHcp,
  PresupuestoSesion,
  PresupuestoSpeakerSesion,
  RegistroFinancieroEvento,
  RepositorioArchivoEvento,
  SesionEvento,
  SpeakerParticipacionEvento,
  Usuario,
} from "@/types";

const TABLA = "solicitudes_evento";
const TABLA_APROBACIONES = "evento_aprobaciones";
const TABLA_SESIONES = "sesiones_evento";
const TABLA_MUESTRAS = "evento_muestras_planeadas";
const TABLA_PRODUCTOS_EVENTO = "evento_productos";
const TABLA_CODIGOS = "eventos_codigos_acceso";
const TABLA_SPEAKERS_PARTICIPACION = "evento_speakers_participacion";
const TABLA_SPEAKER_PRESUPUESTOS = "evento_speaker_presupuestos";

/**
 * Campos de `solicitudes_evento` — orden y helpers de mapeo reconstruidos
 * campo por campo por extracción forense directa del bundle original
 * (arreglo `xC`). `cartaInvitacionId`/`programaAcademicoId` ya son
 * editables desde el formulario (Fase 1 — infraestructura de archivos,
 * septiembre 2026); antes de eso quedaban siempre en `null` a la espera de
 * reconstruir el subsistema de carga de archivos.
 */
const CAMPOS_EVENTO: FieldSpec[] = [
  t("id"),
  t("estado"),
  t("creado_por_id", "creadoPorId"),
  t("creado_en", "creadoEn"),
  j("campos_personalizados", {}, "camposPersonalizados"),
  // Snapshot congelado por trigger al pasar a Aprobado/Completado — ver
  // `db/agregar_inmutabilidad_documentos_firmados.sql`. Solo lectura desde
  // el front-end (lo escribe el trigger, no un `crear*`/`editar*`).
  j("snapshot_formato", null, "snapshotFormato"),
  t("nombre_solicitante", "nombreSolicitante"),
  t("nombre_superior_aprueba", "nombreSuperiorAprueba"),
  t("empresa_grupo", "empresaGrupo"),
  t("datos_hcp", "datosHCP"),
  t("tipo_evento", "tipoEvento"),
  t("area_especialidad", "areaEspecialidad"),
  t("linea_terapeutica", "lineaTerapeutica"),
  t("nombre_evento", "nombreEvento"),
  t("organizado_por", "organizadoPor"),
  t("nombre_organizador", "nombreOrganizador"),
  // AJUSTES (septiembre 2026), pedido explícito: "¿Habrá patrocinio / pago
  // de viáticos a un HCP?" + datos del HCP relacionado — ver
  // `db/agregar_patrocinio_hcp_evento.sql`.
  b("patrocinio_hcp", "patrocinioHcp"),
  t("hcp_numero_documento", "hcpNumeroDocumento"),
  t("hcp_profesion", "hcpProfesion"),
  t("hcp_especialidad", "hcpEspecialidad"),
  t("hcp_direccion", "hcpDireccion"),
  t("hcp_pais", "hcpPais"),
  t("hcp_estado_provincia", "hcpEstadoProvincia"),
  t("hcp_ciudad", "hcpCiudad"),
  t("hcp_telefono", "hcpTelefono"),
  em("hcp_email", "hcpEmail"),
  s0("fecha_inicio_evento", "fechaInicioEvento"),
  s0("fecha_fin_evento", "fechaFinEvento"),
  s0("modalidad_sesiones", "modalidadSesiones"),
  n0n("numero_sesiones", "numeroSesiones"),
  t("factura_modalidad", "facturaModalidad"),
  b("lista_asistencia_no_aplica", "listaAsistenciaNoAplica"),
  t("lista_asistencia_no_aplica_motivo", "listaAsistenciaNoAplicaMotivo"),
  s0("fecha_inicio_estancia", "fechaInicioEstancia"),
  s0("fecha_fin_estancia", "fechaFinEstancia"),
  s0("modalidad_evento", "modalidadEvento"),
  t("direccion"),
  t("pais"),
  t("estado_provincia", "estadoProvincia"),
  t("ciudad"),
  t("justificacion_viaticos", "justificacionViaticos"),
  t("objetivos_evento", "objetivosEvento"),
  n0n("numero_asistentes", "numeroAsistentes"),
  b("entrega_muestras_medicas", "entregaMuestrasMedicas"),
  t("detalle_muestras_medicas", "detalleMuestrasMedicas"),
  b("entrega_articulos_promocionales", "entregaArticulosPromocionales"),
  t("detalle_articulos_promocionales", "detalleArticulosPromocionales"),
  b("participacion_academica", "participacionAcademica"),
  t("detalle_participacion_academica", "detalleParticipacionAcademica"),
  s0("quien_dicta_actividad", "quienDictaActividad"),
  s0("speaker_participacion_id", "speakerParticipacionId"),
  t("nombre_speaker_participacion", "nombreSpeakerParticipacion"),
  n0n("numero_speakers_externos", "numeroSpeakersExternos"),
  b("incluido_presupuesto_aprobado", "incluidoPresupuestoAprobado"),
  n0n("monto_presupuesto_aprobado", "montoPresupuestoAprobado"),
  b("advertencia_presupuesto_no_aprobado", "advertenciaPresupuestoNoAprobado"),
  b("anexos"),
  t("descripcion_anexos", "descripcionAnexos"),
  s0("carta_invitacion_id", "cartaInvitacionId"),
  s0("programa_academico_id", "programaAcademicoId"),
  n0n("honorarios_speaker", "honorariosSpeaker"),
  b("inscripcion_no_aplica", "inscripcionNoAplica"),
  n0n("monto_inscripcion", "montoInscripcion"),
  t("detalle_inscripcion", "detalleInscripcion"),
  b("actividad_adicional_inscripcion", "actividadAdicionalInscripcion"),
  t("detalle_actividad_adicional", "detalleActividadAdicional"),
  b("actividad_incluida_inscripcion", "actividadIncluidaInscripcion"),
  t("detalle_actividad_incluida", "detalleActividadIncluida"),
  b("transporte_no_aplica", "transporteNoAplica"),
  b("transporte_acorde_politica", "transporteAcordePolitica"),
  t("transporte_motivo_no_acorde", "transporteMotivoNoAcorde"),
  t("tipo_transporte", "tipoTransporte"),
  // Corrección (septiembre 2026): faltaban a nivel de documento (Única
  // sesión) — ver `db/agregar_presupuesto_completo_sesiones_evento.sql`.
  n0n("monto_transporte", "montoTransporte"),
  b("cotizacion_adjunta", "cotizacionAdjunta"),
  b("taxi"),
  n0n("valor_estimado_taxi", "valorEstimadoTaxi"),
  b("hospedaje_no_aplica", "hospedajeNoAplica"),
  b("hospedaje_acorde_politica", "hospedajeAcordePolitica"),
  t("hospedaje_motivo_no_acorde", "hospedajeMotivoNoAcorde"),
  n0n("numero_noches", "numeroNoches"),
  n0n("costo_noche_persona", "costoNochePersona"),
  t("nombre_hotel", "nombreHotel"),
  t("categoria_hotel", "categoriaHotel"),
  t("motivo_localidad_distinta", "motivoLocalidadDistinta"),
  b("alimentos_no_aplica", "alimentosNoAplica"),
  b("alimentos_acorde_politica", "alimentosAcordePolitica"),
  t("alimentos_motivo_no_acorde", "alimentosMotivoNoAcorde"),
  n0n("monto_alimentos_dia", "montoAlimentosDia"),
  t("comentarios_alimentos", "comentariosAlimentos"),
  n0n("condensado_inscripcion", "condensadoInscripcion"),
  n0n("condensado_transporte", "condensadoTransporte"),
  n0n("condensado_traslado", "condensadoTraslado"),
  n0n("condensado_hospedaje", "condensadoHospedaje"),
  n0n("condensado_alimentos", "condensadoAlimentos"),
  n0n("condensado_honorarios_speaker", "condensadoHonorariosSpeaker"),
  n0n("condensado_otro", "condensadoOtro"),
  b("incluir_valor_participacion", "incluirValorParticipacion"),
  n0n("condensado_valor_participacion", "condensadoValorParticipacion"),
  t("condensado_otro_especificar", "condensadoOtroEspecificar"),
  t("comentarios_costo", "comentariosCosto"),
  t("centro_costos", "centroCostos"),
  t("moneda"),
  b("comentarios_especiales_no_aplica", "comentariosEspecialesNoAplica"),
  t("comentarios_especiales", "comentariosEspeciales"),
  s0("motivo_anulacion", "motivoAnulacion"),
  s0("anulado_por_id", "anuladoPorId"),
  s0("anulado_en", "anuladoEn"),
  s0("adenda_ventana_actor_id", "adendaVentanaActorId"),
  s0("adenda_ventana_expira_en", "adendaVentanaExpiraEn"),
  s0("adenda_ventana_justificacion", "adendaVentanaJustificacion"),
];

function filaAPaso(fila: Record<string, unknown>): PasoAprobacion {
  return {
    id: fila.id as string,
    orden: fila.orden as number,
    etiqueta: fila.etiqueta as string,
    rolRequerido: fila.rol_requerido as PasoAprobacion["rolRequerido"],
    estado: fila.estado as PasoAprobacion["estado"],
    resueltoPorId: (fila.resuelto_por_id as string) ?? undefined,
    fecha: (fila.fecha as string) ?? undefined,
    comentario: (fila.comentario as string) ?? undefined,
    pendienteDesde: fila.pendiente_desde as string,
    // Firma congelada al momento de aprobar este paso — ver
    // `db/agregar_inmutabilidad_documentos_firmados.sql`.
    firmaCongeladaId: (fila.firma_congelada_id as string) ?? null,
  };
}

function filaASesion(fila: Record<string, unknown>): SesionEvento {
  // Corrección (septiembre 2026): `PresupuestoSesion` se amplió para tener
  // el mismo detalle que `PresupuestoSpeakerSesion` — ver el comentario en
  // `types.ts` y `db/agregar_presupuesto_completo_sesiones_evento.sql`.
  // `transporte_acorde_politica`/`hospedaje_acorde_politica`/
  // `alimentos_acorde_politica` usan `!== false` (no `Boolean(...)`) para
  // que un valor `null`/`undefined` (fila antigua, previa a esta columna)
  // se interprete como "conforme" por defecto, igual que
  // `presupuestoSesionVacio()` y `filaAPresupuestoSpeaker`.
  const presupuesto: PresupuestoSesion = {
    transporteNoAplica: Boolean(fila.transporte_no_aplica),
    transporteAcordePolitica: fila.transporte_acorde_politica !== false,
    transporteMotivoNoAcorde: (fila.transporte_motivo_no_acorde as string) ?? "",
    tipoTransporte: (fila.tipo_transporte as string) ?? "",
    montoTransporte: (fila.monto_transporte as number) ?? null,
    cotizacionAdjunta: Boolean(fila.cotizacion_adjunta),
    taxi: Boolean(fila.taxi),
    valorEstimadoTaxi: (fila.valor_estimado_taxi as number) ?? null,
    hospedajeNoAplica: Boolean(fila.hospedaje_no_aplica),
    hospedajeAcordePolitica: fila.hospedaje_acorde_politica !== false,
    hospedajeMotivoNoAcorde: (fila.hospedaje_motivo_no_acorde as string) ?? "",
    fechaInicioEstancia: (fila.fecha_inicio_estancia as string) ?? null,
    fechaFinEstancia: (fila.fecha_fin_estancia as string) ?? null,
    numeroNoches: (fila.numero_noches as number) ?? null,
    costoNochePersona: (fila.costo_noche_persona as number) ?? null,
    nombreHotel: (fila.nombre_hotel as string) ?? "",
    categoriaHotel: (fila.categoria_hotel as string) ?? "",
    motivoLocalidadDistinta: (fila.motivo_localidad_distinta as string) ?? "",
    alimentosNoAplica: Boolean(fila.alimentos_no_aplica),
    alimentosAcordePolitica: fila.alimentos_acorde_politica !== false,
    alimentosMotivoNoAcorde: (fila.alimentos_motivo_no_acorde as string) ?? "",
    montoAlimentosDia: (fila.monto_alimentos_dia as number) ?? null,
    comentariosAlimentos: (fila.comentarios_alimentos as string) ?? "",
  };
  return {
    id: fila.id as string,
    fecha: (fila.fecha as string) ?? null,
    lugar: (fila.lugar as string) ?? "",
    pais: (fila.pais as string) ?? "",
    estadoProvincia: (fila.estado_provincia as string) ?? "",
    ciudad: (fila.ciudad as string) ?? "",
    numeroAsistentesEsperados: (fila.numero_asistentes_esperados as number) ?? null,
    presupuesto,
    listaAsistenciaNoAplica: Boolean(fila.lista_asistencia_no_aplica),
    listaAsistenciaNoAplicaMotivo: (fila.lista_asistencia_no_aplica_motivo as string) ?? "",
  };
}

/** Entrega 31: la tabla `evento_productos` puede no existir todavía en la base real (ver `db/entrega_31_horas_productos_linea.sql`). */
const faltaTablaProductosEvento = (error: { message?: string; code?: string } | null) =>
  !!error && (error.code === "PGRST205" || error.code === "42P01" || /evento_productos/i.test(error.message ?? ""));

/**
 * Entrega 31: productos (portafolio) relacionados con cada evento. Si la tabla
 * aún no existe se degrada a «sin productos» para no romper la carga de todos
 * los eventos (mismo criterio que `traerSpeakersParticipacionPorEvento`).
 */
async function traerProductosEventoPorEvento(eventoIds: string[]): Promise<Map<string, ProductoEvento[]>> {
  const mapa = new Map<string, ProductoEvento[]>();
  if (eventoIds.length === 0) return mapa;
  try {
    const { data: filas, error } = await supabase
      .from(TABLA_PRODUCTOS_EVENTO)
      .select("*")
      .in("evento_id", eventoIds)
      .order("orden", { ascending: true });
    if (error) throw error;
    if (!filas || filas.length === 0) return mapa;
    const { data: productos } = await supabase.from("productos_portafolio").select("id, nombre");
    const nombres = new Map<string, string>((productos ?? []).map((p) => [p.id as string, p.nombre as string]));
    for (const fila of filas) {
      const eventoId = fila.evento_id as string;
      const productoId = fila.producto_id as string;
      const lista = mapa.get(eventoId) ?? [];
      lista.push({
        productoId,
        nombreProducto: nombres.get(productoId) ?? "(producto ya no está en el portafolio)",
        principal: Boolean(fila.es_principal),
      });
      mapa.set(eventoId, lista);
    }
  } catch (e) {
    if (!faltaTablaProductosEvento(e as { message?: string; code?: string })) console.warn("No se pudieron leer los productos del evento:", e);
  }
  return mapa;
}

/** Entrega 31: con un solo producto, ese es el principal; con varios, exactamente uno (el primero si ninguno está marcado). */
export function normalizarProductosEvento(productos: ProductoEvento[]): ProductoEvento[] {
  if (productos.length === 0) return [];
  if (productos.length === 1) return [{ ...productos[0], principal: true }];
  const idxPrincipal = productos.findIndex((p) => p.principal);
  return productos.map((p, i) => ({ ...p, principal: i === (idxPrincipal >= 0 ? idxPrincipal : 0) }));
}

/** Reemplaza por completo los productos del evento (borrar-e-insertar). Tolera que la tabla aún no exista si no hay nada que guardar. */
async function guardarProductosEvento(eventoId: string, productos: ProductoEvento[]): Promise<ProductoEvento[]> {
  const normalizados = normalizarProductosEvento(productos);
  const { error: errorDelete } = await supabase.from(TABLA_PRODUCTOS_EVENTO).delete().eq("evento_id", eventoId);
  if (errorDelete) {
    if (faltaTablaProductosEvento(errorDelete) && normalizados.length === 0) return [];
    throw new Error(
      faltaTablaProductosEvento(errorDelete)
        ? "No se pudieron guardar los productos del evento: falta ejecutar db/entrega_31_horas_productos_linea.sql en Supabase."
        : `No se pudieron actualizar los productos del evento: ${mensajeErrorAmigable(errorDelete)}`,
    );
  }
  if (normalizados.length === 0) return [];
  const { error } = await supabase.from(TABLA_PRODUCTOS_EVENTO).insert(
    normalizados.map((p, i) => ({ evento_id: eventoId, producto_id: p.productoId, es_principal: p.principal, orden: i })),
  );
  if (error) throw new Error(`No se pudieron guardar los productos del evento: ${mensajeErrorAmigable(error)}`);
  return normalizados;
}

function filaAMuestra(fila: Record<string, unknown>, nombresProducto: Map<string, string>): MuestraPlaneada {
  const productoId = fila.producto_id as string;
  return {
    id: fila.id as string,
    productoId,
    nombreProducto: nombresProducto.get(productoId) ?? "(producto ya no está en el portafolio)",
    cantidadAproximada: (fila.cantidad_aproximada as number) ?? null,
  };
}

/**
 * Ronda de ajustes de formularios (septiembre 2026), entrega 2 — ver
 * `PresupuestoSpeakerSesion`/`SpeakerParticipacionEvento` en `types.ts`.
 */
function filaAPresupuestoSpeaker(fila: Record<string, unknown>): PresupuestoSpeakerSesion {
  return {
    id: fila.id as string,
    sesionId: (fila.sesion_id as string) ?? null,
    horasParticipacion: (fila.horas_participacion as number) ?? null,
    transporteNoAplica: Boolean(fila.transporte_no_aplica),
    transporteAcordePolitica: fila.transporte_acorde_politica !== false,
    transporteMotivoNoAcorde: (fila.transporte_motivo_no_acorde as string) ?? "",
    tipoTransporte: (fila.tipo_transporte as string) ?? "",
    valorTransporte: (fila.valor_transporte as number) ?? null,
    cotizacionAdjunta: Boolean(fila.cotizacion_adjunta),
    taxi: Boolean(fila.taxi),
    valorEstimadoTaxi: (fila.valor_estimado_taxi as number) ?? null,
    hospedajeNoAplica: Boolean(fila.hospedaje_no_aplica),
    hospedajeAcordePolitica: fila.hospedaje_acorde_politica !== false,
    hospedajeMotivoNoAcorde: (fila.hospedaje_motivo_no_acorde as string) ?? "",
    fechaInicioEstancia: (fila.fecha_inicio_estancia as string) ?? null,
    fechaFinEstancia: (fila.fecha_fin_estancia as string) ?? null,
    costoNochePersona: (fila.costo_noche_persona as number) ?? null,
    nombreHotel: (fila.nombre_hotel as string) ?? "",
    categoriaHotel: (fila.categoria_hotel as string) ?? "",
    motivoLocalidadDistinta: (fila.motivo_localidad_distinta as string) ?? "",
    alimentosNoAplica: Boolean(fila.alimentos_no_aplica),
    alimentosAcordePolitica: fila.alimentos_acorde_politica !== false,
    alimentosMotivoNoAcorde: (fila.alimentos_motivo_no_acorde as string) ?? "",
    montoAlimentosDia: (fila.monto_alimentos_dia as number) ?? null,
    comentariosAlimentos: (fila.comentarios_alimentos as string) ?? "",
  };
}

/**
 * Ronda de ajustes de formularios (septiembre 2026), entrega 2: lee las dos
 * tablas nuevas de speakers/presupuesto. A DIFERENCIA de una columna nueva
 * (que `select("*")` simplemente omite si todavía no existe, sin error), una
 * TABLA que todavía no existe hace que PostgREST devuelva un error real —
 * y como esta función corre en CADA `traerEventos()`/`traerEventoPorId()`,
 * dejar que ese error se propague rompería la carga de TODO evento (Tablero,
 * Tareas Pendientes, etc.) hasta que se ejecute
 * `db/agregar_speakers_evento.sql` contra el proyecto real. Se degrada en
 * cambio a "sin speakers todavía" (mapa vacío) — el resto de la app sigue
 * funcionando con normalidad, y una vez corrida la migración esto vuelve a
 * traer datos reales sin ningún cambio de código.
 */
async function traerSpeakersParticipacionPorEvento(eventoIds: string[]): Promise<Map<string, SpeakerParticipacionEvento[]>> {
  const mapa = new Map<string, SpeakerParticipacionEvento[]>();
  if (eventoIds.length === 0) return mapa;
  try {
    const { data: filasSpeakers, error: errorSpeakers } = await supabase
      .from(TABLA_SPEAKERS_PARTICIPACION)
      .select("*")
      .in("evento_id", eventoIds)
      .order("orden", { ascending: true });
    if (errorSpeakers) throw errorSpeakers;

    const speakerIds = (filasSpeakers ?? []).map((f) => f.id as string);
    const presupuestosPorSpeaker = new Map<string, PresupuestoSpeakerSesion[]>();
    if (speakerIds.length > 0) {
      const { data: filasPresupuestos, error: errorPresupuestos } = await supabase
        .from(TABLA_SPEAKER_PRESUPUESTOS)
        .select("*")
        .in("evento_speaker_id", speakerIds);
      if (errorPresupuestos) throw errorPresupuestos;
      for (const fila of filasPresupuestos ?? []) {
        const speakerId = fila.evento_speaker_id as string;
        const lista = presupuestosPorSpeaker.get(speakerId) ?? [];
        lista.push(filaAPresupuestoSpeaker(fila));
        presupuestosPorSpeaker.set(speakerId, lista);
      }
    }

    for (const fila of filasSpeakers ?? []) {
      const eventoId = fila.evento_id as string;
      const lista = mapa.get(eventoId) ?? [];
      lista.push({
        id: fila.id as string,
        orden: (fila.orden as number) ?? 0,
        tipo: inferirTipoSpeaker(fila.tipo_speaker, (fila.speaker_id as string) ?? null),
        speakerId: (fila.speaker_id as string) ?? null,
        nombreSpeaker: (fila.nombre_speaker as string) ?? "",
        montoInscripcion: (fila.monto_inscripcion as number) ?? null,
        montoHonorarios: (fila.monto_honorarios as number) ?? null,
        detalleInscripcion: (fila.detalle_inscripcion as string) ?? "",
        detalleHonorarios: (fila.detalle_honorarios as string) ?? "",
        facturaModalidad: (fila.factura_modalidad as string) ?? "",
        presupuestos: presupuestosPorSpeaker.get(fila.id as string) ?? [],
      });
      mapa.set(eventoId, lista);
    }
    return mapa;
  } catch (error) {
    console.warn(
      "No se pudieron leer los speakers del evento (¿falta ejecutar db/agregar_speakers_evento.sql contra el proyecto real?):",
      mensajeErrorAmigable(error),
    );
    return new Map();
  }
}

/**
 * Octubre 2026: el modelo de N speakers (con su presupuesto de transporte,
 * hospedaje y alimentos por sesión) aplica a speakers INTERNOS y EXTERNOS
 * por igual; solo los externos tienen además cuota/honorarios/factura.
 */
function llevaSpeakers(datos: { participacionAcademica: boolean; quienDictaActividad: string | null }): boolean {
  return datos.participacionAcademica && (datos.quienDictaActividad === "Speaker externo" || datos.quienDictaActividad === "Speaker interno");
}

/** Entrega 22: la columna opcional `tipo_speaker` aún puede no existir en la base real (ver `db/entrega_22_...sql`). */
const faltaColumnaTipoSpeaker = (error: { message?: string; code?: string } | null) =>
  !!error && (error.code === "PGRST204" || error.code === "42703" || /tipo_speaker/i.test(error.message ?? ""));

/** Octubre 2026: la columna `detalle_honorarios` aún puede no existir (ver `db/agregar_detalle_honorarios_speaker.sql`). */
const faltaColumnaDetalleHonorarios = (error: { message?: string; code?: string } | null) =>
  !!error && (error.code === "PGRST204" || error.code === "42703" || /detalle_honorarios/i.test(error.message ?? ""));

/**
 * Reemplaza por completo los speakers del evento (borrar-e-
 * insertar, igual patrón que `guardarSesiones`/`guardarMuestrasPlaneadas`).
 * El borrado en cascada de `evento_speaker_presupuestos` lo hace la FK
 * `on delete cascade` (ver `db/agregar_speakers_evento.sql`) — aquí solo
 * hace falta insertar los presupuestos de los speakers recién creados.
 */
/**
 * Las sesiones nuevas del formulario traen un id TEMPORAL ("nueva-…"); al
 * guardarlas la base de datos les asigna su uuid real (y al editar se borran
 * y reinsertan, así que también cambian). Los presupuestos de los speakers
 * apuntan a esas sesiones: este mapa traduce id del formulario → id real
 * (por posición, igual que se insertaron).
 */
function mapaIdsSesiones(origen: SesionEvento[], guardadas: SesionEvento[]): Map<string, string> {
  const mapa = new Map<string, string>();
  origen.forEach((s, i) => {
    const real = guardadas[i]?.id;
    if (real) mapa.set(s.id, real);
  });
  return mapa;
}

async function guardarSpeakersParticipacion(
  eventoId: string,
  speakers: SpeakerParticipacionEvento[],
  idsSesiones: Map<string, string> = new Map(),
): Promise<SpeakerParticipacionEvento[]> {
  const { error: errorDelete } = await supabase.from(TABLA_SPEAKERS_PARTICIPACION).delete().eq("evento_id", eventoId);
  if (errorDelete) throw new Error(`No se pudieron actualizar los speakers del evento: ${mensajeErrorAmigable(errorDelete)}`);
  if (speakers.length === 0) return [];

  const filasSpeakers = speakers.map((s, i) => ({
    evento_id: eventoId,
    orden: i,
    speaker_id: s.tipo === "interno" ? null : s.speakerId,
    nombre_speaker: s.nombreSpeaker,
    monto_inscripcion: s.tipo === "interno" ? null : s.montoInscripcion,
    monto_honorarios: s.tipo === "interno" ? null : s.montoHonorarios,
    // El detalle solo se conserva si el monto respectivo es > 0 (si no, el campo "Detallar lo que incluye" no aplica).
    detalle_inscripcion: s.tipo === "interno" || !((s.montoInscripcion ?? 0) > 0) ? "" : s.detalleInscripcion || "",
    detalle_honorarios: s.tipo === "interno" || !((s.montoHonorarios ?? 0) > 0) ? "" : s.detalleHonorarios || "",
    factura_modalidad: s.tipo === "interno" ? "" : s.facturaModalidad || "",
  }));
  // Columnas opcionales que pueden no existir aún en la base real (migraciones sin aplicar): se reintenta sin ellas.
  const insertar = (filas: Record<string, unknown>[]) =>
    supabase.from(TABLA_SPEAKERS_PARTICIPACION).insert(filas).select("*").order("orden", { ascending: true });
  const conTipo = filasSpeakers.map((f, i) => ({ ...f, tipo_speaker: speakers[i].tipo }));
  let { data: speakersCreados, error: errorSpeakers } = await insertar(conTipo);
  if (faltaColumnaDetalleHonorarios(errorSpeakers)) {
    // Sin `db/agregar_detalle_honorarios_speaker.sql` el detalle de honorarios no se persiste.
    ({ data: speakersCreados, error: errorSpeakers } = await insertar(conTipo.map(({ detalle_honorarios: _d, ...resto }) => resto)));
  }
  if (faltaColumnaTipoSpeaker(errorSpeakers)) {
    // Sin la migración de la entrega 22 el tipo se infiere al leer (con speaker del Repositorio = externo).
    ({ data: speakersCreados, error: errorSpeakers } = await insertar(filasSpeakers));
    if (faltaColumnaDetalleHonorarios(errorSpeakers)) {
      ({ data: speakersCreados, error: errorSpeakers } = await insertar(filasSpeakers.map(({ detalle_honorarios: _d, ...resto }) => resto)));
    }
  }
  if (errorSpeakers) {
    const sinPermiso = errorSpeakers.code === "42501" || /row-level security|permission denied/i.test(errorSpeakers.message ?? "");
    throw new Error(
      sinPermiso
        ? "No se pudieron guardar los speakers del evento: falta aplicar la política de seguridad de la base de datos (ejecutar db/agregar_rls_speakers_evento.sql en Supabase)."
        : `No se pudieron guardar los speakers del evento: ${mensajeErrorAmigable(errorSpeakers)}`,
    );
  }

  const filasPresupuesto = (speakersCreados ?? []).flatMap((creado, i) =>
    (speakers[i]?.presupuestos ?? []).map((p) => ({
      evento_speaker_id: creado.id,
      sesion_id: p.sesionId === null ? null : idsSesiones.get(p.sesionId) ?? null,
      horas_participacion: p.horasParticipacion,
      transporte_no_aplica: p.transporteNoAplica,
      transporte_acorde_politica: p.transporteAcordePolitica,
      transporte_motivo_no_acorde: p.transporteMotivoNoAcorde || "",
      tipo_transporte: p.tipoTransporte || null,
      valor_transporte: p.valorTransporte,
      cotizacion_adjunta: p.cotizacionAdjunta,
      taxi: p.taxi,
      valor_estimado_taxi: p.valorEstimadoTaxi,
      hospedaje_no_aplica: p.hospedajeNoAplica,
      hospedaje_acorde_politica: p.hospedajeAcordePolitica,
      hospedaje_motivo_no_acorde: p.hospedajeMotivoNoAcorde || "",
      fecha_inicio_estancia: p.fechaInicioEstancia || null,
      fecha_fin_estancia: p.fechaFinEstancia || null,
      costo_noche_persona: p.costoNochePersona,
      nombre_hotel: p.nombreHotel || null,
      categoria_hotel: p.categoriaHotel || null,
      motivo_localidad_distinta: p.motivoLocalidadDistinta || "",
      alimentos_no_aplica: p.alimentosNoAplica,
      alimentos_acorde_politica: p.alimentosAcordePolitica,
      alimentos_motivo_no_acorde: p.alimentosMotivoNoAcorde || "",
      monto_alimentos_dia: p.montoAlimentosDia,
      comentarios_alimentos: p.comentariosAlimentos || "",
    })),
  );

  let presupuestosCreados: Record<string, unknown>[] = [];
  if (filasPresupuesto.length > 0) {
    let { data, error: errorPresupuestos } = await supabase.from(TABLA_SPEAKER_PRESUPUESTOS).insert(filasPresupuesto).select("*");
    if (errorPresupuestos && /horas_participacion/i.test(errorPresupuestos.message ?? "")) {
      // Entrega 31: sin la migración, el evento se guarda igual (sin las horas) en vez de fallar.
      ({ data, error: errorPresupuestos } = await supabase
        .from(TABLA_SPEAKER_PRESUPUESTOS)
        .insert(filasPresupuesto.map(({ horas_participacion: _h, ...resto }) => resto))
        .select("*"));
    }
    if (errorPresupuestos) throw new Error(`No se pudo guardar el presupuesto de los speakers: ${mensajeErrorAmigable(errorPresupuestos)}`);
    presupuestosCreados = data ?? [];
  }

  return (speakersCreados ?? []).map((creado) => ({
    id: creado.id as string,
    orden: (creado.orden as number) ?? 0,
    tipo: inferirTipoSpeaker(creado.tipo_speaker, (creado.speaker_id as string) ?? null),
    speakerId: (creado.speaker_id as string) ?? null,
    nombreSpeaker: (creado.nombre_speaker as string) ?? "",
    montoInscripcion: (creado.monto_inscripcion as number) ?? null,
    montoHonorarios: (creado.monto_honorarios as number) ?? null,
    detalleInscripcion: (creado.detalle_inscripcion as string) ?? "",
    detalleHonorarios: (creado.detalle_honorarios as string) ?? "",
    facturaModalidad: (creado.factura_modalidad as string) ?? "",
    presupuestos: presupuestosCreados.filter((p) => p.evento_speaker_id === creado.id).map(filaAPresupuestoSpeaker),
  }));
}

/**
 * Forma de los datos que llegan desde `FormularioEvento` — igual que
 * `Evento` salvo por los dos campos de enum nullable (`modalidadEvento`,
 * `quienDictaActividad`), que en el estado del formulario usan `""` en vez
 * de `null` para simplificar los `<Select>` controlados. `s0()` en
 * `CAMPOS_EVENTO` ya convierte `""` a `null` al guardar, así que esto es
 * puramente para que el tipo de los parámetros de abajo acepte el estado
 * del formulario sin conversiones manuales en cada pantalla.
 */
type DatosEventoGuardable = Omit<Evento, "modalidadEvento" | "quienDictaActividad" | "incluidoPresupuestoAprobado"> & {
  modalidadEvento: Evento["modalidadEvento"] | "";
  quienDictaActividad: Evento["quienDictaActividad"] | "";
  // Entrega 4: el formulario admite un tercer estado ("sin responder
  // todavía", `null`) para el toggle Sí/No de presupuesto aprobado —
  // `b()` en `CAMPOS_EVENTO` ya convierte `null`/`undefined` a `false` al
  // guardar (ver dbMapping.ts), así que esto es puramente para que el tipo
  // de los parámetros de abajo acepte el estado del formulario sin
  // conversiones manuales en cada pantalla.
  incluidoPresupuestoAprobado: boolean | null;
};

export function nombreEvento(evento: Pick<Evento, "nombreEvento">): string {
  return evento.nombreEvento || "Solicitud de Evento sin nombre";
}

/**
 * Fase 4 (precargado automático entre formularios): trae un solo Evento
 * completo por id — usada cuando otro formulario (CAF, Convenio, Convenio
 * HCP, FMV, Notificación de Pago) elige un "Evento de origen" y necesita
 * sus datos completos para precargar campos, sin traer sesiones/muestras
 * (eso solo hace falta para editar el Evento mismo).
 */
export async function traerEventoPorId(id: string): Promise<Evento | null> {
  const { data, error } = await supabase.from(TABLA).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(mensajeErrorAmigable(error));
  if (!data) return null;
  const speakersPorEvento = await traerSpeakersParticipacionPorEvento([id]);
  const productosPorEvento = await traerProductosEventoPorEvento([id]);
  return {
    ...rowToFlat<Evento>(data, CAMPOS_EVENTO),
    tipoDoc: "evento",
    aprobaciones: [],
    sesiones: [],
    muestrasPlaneadas: [],
    productosEvento: productosPorEvento.get(id) ?? [],
    speakersParticipacion: speakersPorEvento.get(id) ?? [],
  };
}

/**
 * Ronda de correcciones "Nuevo Convenio HCP" (septiembre 2026): como
 * `traerEventoPorId`, pero con `sesiones` completas — el Anexo A ("Servicios/
 * Services") de Convenio HCP necesita el detalle de cada sesión (fecha,
 * dirección/ciudad/estado/país) para armar su listado, y `traerEventoPorId`
 * las omite a propósito por rendimiento (ver su comentario) porque los otros
 * 4 documentos que la usan para precargar (CAF, Convenio, FMV, Notificación)
 * no las necesitan. Usar `traerEventoPorId` para "Generar texto sugerido"
 * del Anexo A hacía que `esMultisesion` siempre diera `false` (sin sesiones
 * cargadas) y el texto generado terminara casi vacío en eventos de Varias
 * sesiones — esta función es la corrección.
 */
export async function traerEventoConSesionesPorId(id: string): Promise<Evento | null> {
  const evento = await traerEventoPorId(id);
  if (!evento) return null;
  const { data: sesiones, error } = await supabase
    .from(TABLA_SESIONES)
    .select("*")
    .eq("evento_id", id)
    .order("orden", { ascending: true });
  if (error) throw new Error(mensajeErrorAmigable(error));
  return { ...evento, sesiones: (sesiones ?? []).map(filaASesion) };
}

export async function traerEventos(): Promise<Evento[]> {
  const [
    { data: filas, error: errorFilas },
    { data: pasos, error: errorPasos },
    { data: sesiones, error: errorSesiones },
    { data: muestras, error: errorMuestras },
    { data: productos, error: errorProductos },
  ] = await Promise.all([
    supabase.from(TABLA).select("*").order("creado_en", { ascending: false }),
    supabase.from(TABLA_APROBACIONES).select("*").order("orden", { ascending: true }),
    supabase.from(TABLA_SESIONES).select("*").order("orden", { ascending: true }),
    supabase.from(TABLA_MUESTRAS).select("*").order("orden", { ascending: true }),
    supabase.from("productos_portafolio").select("id, nombre"),
  ]);
  if (errorFilas) throw new Error(mensajeErrorAmigable(errorFilas));
  if (errorPasos) throw new Error(mensajeErrorAmigable(errorPasos));
  if (errorSesiones) throw new Error(mensajeErrorAmigable(errorSesiones));
  if (errorMuestras) throw new Error(mensajeErrorAmigable(errorMuestras));
  if (errorProductos) throw new Error(mensajeErrorAmigable(errorProductos));

  const nombresProducto = new Map<string, string>((productos ?? []).map((p) => [p.id as string, p.nombre as string]));
  const idsEventos = (filas ?? []).map((f) => f.id as string);
  const speakersPorEvento = await traerSpeakersParticipacionPorEvento(idsEventos);
  const productosPorEvento = await traerProductosEventoPorEvento(idsEventos);

  const pasosPorEvento = new Map<string, PasoAprobacion[]>();
  for (const fila of pasos ?? []) {
    const lista = pasosPorEvento.get(fila.evento_id as string) ?? [];
    lista.push(filaAPaso(fila));
    pasosPorEvento.set(fila.evento_id as string, lista);
  }
  const sesionesPorEvento = new Map<string, SesionEvento[]>();
  for (const fila of sesiones ?? []) {
    const lista = sesionesPorEvento.get(fila.evento_id as string) ?? [];
    lista.push(filaASesion(fila));
    sesionesPorEvento.set(fila.evento_id as string, lista);
  }
  const muestrasPorEvento = new Map<string, MuestraPlaneada[]>();
  for (const fila of muestras ?? []) {
    const lista = muestrasPorEvento.get(fila.evento_id as string) ?? [];
    lista.push(filaAMuestra(fila, nombresProducto));
    muestrasPorEvento.set(fila.evento_id as string, lista);
  }

  return (filas ?? []).map((fila) => ({
    ...rowToFlat<Evento>(fila, CAMPOS_EVENTO),
    tipoDoc: "evento" as const,
    aprobaciones: pasosPorEvento.get(fila.id as string) ?? [],
    sesiones: sesionesPorEvento.get(fila.id as string) ?? [],
    muestrasPlaneadas: muestrasPorEvento.get(fila.id as string) ?? [],
    productosEvento: productosPorEvento.get(fila.id as string) ?? [],
    speakersParticipacion: speakersPorEvento.get(fila.id as string) ?? [],
  }));
}

/** Reemplaza por completo las sesiones del evento (borrar-e-insertar, igual que `kC` en el bundle). */
async function guardarSesiones(eventoId: string, sesiones: SesionEvento[]): Promise<SesionEvento[]> {
  const { error: errorDelete } = await supabase.from(TABLA_SESIONES).delete().eq("evento_id", eventoId);
  if (errorDelete) throw new Error(`No se pudieron actualizar las sesiones del evento: ${mensajeErrorAmigable(errorDelete)}`);
  if (sesiones.length === 0) return [];
  const { data, error } = await supabase
    .from(TABLA_SESIONES)
    .insert(
      sesiones.map((s, i) => {
        const p = s.presupuesto ?? presupuestoSesionVacio();
        return {
          evento_id: eventoId,
          fecha: s.fecha || null,
          lugar: s.lugar,
          pais: s.pais || null,
          estado_provincia: s.estadoProvincia || null,
          ciudad: s.ciudad || null,
          orden: i,
          numero_asistentes_esperados: s.numeroAsistentesEsperados,
          transporte_no_aplica: p.transporteNoAplica,
          transporte_acorde_politica: p.transporteAcordePolitica,
          transporte_motivo_no_acorde: p.transporteMotivoNoAcorde || "",
          tipo_transporte: p.tipoTransporte || null,
          monto_transporte: p.montoTransporte,
          cotizacion_adjunta: p.cotizacionAdjunta,
          taxi: p.taxi,
          valor_estimado_taxi: p.valorEstimadoTaxi,
          hospedaje_no_aplica: p.hospedajeNoAplica,
          hospedaje_acorde_politica: p.hospedajeAcordePolitica,
          hospedaje_motivo_no_acorde: p.hospedajeMotivoNoAcorde || "",
          fecha_inicio_estancia: p.fechaInicioEstancia || null,
          fecha_fin_estancia: p.fechaFinEstancia || null,
          numero_noches: p.numeroNoches,
          costo_noche_persona: p.costoNochePersona,
          nombre_hotel: p.nombreHotel || null,
          categoria_hotel: p.categoriaHotel || null,
          motivo_localidad_distinta: p.motivoLocalidadDistinta || "",
          alimentos_no_aplica: p.alimentosNoAplica,
          alimentos_acorde_politica: p.alimentosAcordePolitica,
          alimentos_motivo_no_acorde: p.alimentosMotivoNoAcorde || "",
          monto_alimentos_dia: p.montoAlimentosDia,
          comentarios_alimentos: p.comentariosAlimentos || "",
          lista_asistencia_no_aplica: s.listaAsistenciaNoAplica,
          lista_asistencia_no_aplica_motivo: s.listaAsistenciaNoAplicaMotivo || "",
        };
      }),
    )
    .select("*")
    .order("orden", { ascending: true });
  if (error) throw new Error(`No se pudieron guardar las sesiones del evento: ${mensajeErrorAmigable(error)}`);
  return (data ?? []).map(filaASesion);
}

/** Reemplaza por completo las muestras planeadas del evento (borrar-e-insertar, igual que `AC` en el bundle). */
async function guardarMuestrasPlaneadas(eventoId: string, muestras: MuestraPlaneada[]): Promise<MuestraPlaneada[]> {
  const { error: errorDelete } = await supabase.from(TABLA_MUESTRAS).delete().eq("evento_id", eventoId);
  if (errorDelete) throw new Error(`No se pudieron actualizar los productos planeados del evento: ${mensajeErrorAmigable(errorDelete)}`);
  if (muestras.length === 0) return [];
  const nombresPorProducto = new Map(muestras.map((m) => [m.productoId, m.nombreProducto]));
  const { data, error } = await supabase
    .from(TABLA_MUESTRAS)
    .insert(
      muestras.map((m, i) => ({
        evento_id: eventoId,
        producto_id: m.productoId,
        cantidad_aproximada: m.cantidadAproximada,
        orden: i,
      })),
    )
    .select("*")
    .order("orden", { ascending: true });
  if (error) throw new Error(`No se pudieron guardar los productos planeados del evento: ${mensajeErrorAmigable(error)}`);
  return (data ?? []).map((fila) => filaAMuestra(fila, nombresPorProducto));
}

export async function crearEvento(
  datos: Omit<
    DatosEventoGuardable,
    "id" | "tipoDoc" | "estado" | "creadoPorId" | "creadoEn" | "aprobaciones" | "motivoAnulacion" | "anuladoPorId" | "anuladoEn" | "adendaVentanaActorId" | "adendaVentanaExpiraEn" | "adendaVentanaJustificacion"
  >,
  usuario: Usuario,
  guardarComoBorrador: boolean,
): Promise<Evento> {
  // Corrección (octubre 2026), pedido explícito del usuario: ninguna
  // Solicitud de Evento se debe guardar, ni siquiera como borrador, sin
  // "Empresa del grupo" — segunda barrera (la primera es la validación en
  // `NuevoEvento.tsx` antes de llamar esta función) para que, aunque algo
  // llame a `crearEvento` sin pasar por ese formulario, nunca quede un
  // evento sin empresa asociada (quedaría invisible para el filtrado por
  // compañía de `useCompania`).
  if (!datos.empresaGrupo?.trim()) {
    throw new Error("Empresa del grupo es obligatorio — no se puede guardar la solicitud sin ella, ni siquiera como borrador.");
  }
  const fila = flatToRow(datos as unknown as Record<string, unknown>, CAMPOS_EVENTO);
  // Entrega 20: SIEMPRE se inserta como Borrador; pasa a "Pendiente" al final,
  // cuando la cadena y los datos dependientes ya están guardados (ver
  // `src/lib/envioAprobacion.ts`).
  fila.estado = "Borrador";
  fila.creado_por_id = usuario.id;
  fila.creado_en = new Date().toISOString();

  const { data: creado, error } = await supabase.from(TABLA).insert(fila).select("*").single();
  if (error) throw new Error(`No se pudo crear la solicitud de evento: ${mensajeErrorAmigable(error)}`);

  const cadena = crearCadenaAprobacionEvento();
  await insertarCadenaOReversar({
    tipoDoc: "evento",
    tabla: TABLA,
    tablaAprobaciones: TABLA_APROBACIONES,
    columnaFk: "evento_id",
    documentoId: creado.id as string,
    accion: "No se pudo crear la solicitud de evento",
    filas: cadena.map((paso) => ({
      evento_id: creado.id,
      orden: paso.orden,
      etiqueta: paso.etiqueta,
      rol_requerido: paso.rolRequerido,
      estado: paso.estado,
      pendiente_desde: paso.pendienteDesde,
    })),
  });

  let sesiones: Awaited<ReturnType<typeof guardarSesiones>> = [];
  let muestrasPlaneadas: Awaited<ReturnType<typeof guardarMuestrasPlaneadas>> = [];
  let speakersParticipacion: SpeakerParticipacionEvento[] = [];
  let productosEvento: ProductoEvento[] = [];
  try {
    productosEvento = await guardarProductosEvento(creado.id, datos.productosEvento ?? []);
    sesiones = datos.modalidadSesiones === "Varias sesiones" ? await guardarSesiones(creado.id, datos.sesiones) : [];
    muestrasPlaneadas = datos.entregaMuestrasMedicas ? await guardarMuestrasPlaneadas(creado.id, datos.muestrasPlaneadas) : [];
    speakersParticipacion = llevaSpeakers(datos) ? await guardarSpeakersParticipacion(creado.id, datos.speakersParticipacion, mapaIdsSesiones(datos.sesiones, sesiones)) : [];
  } catch (e) {
    // No dejar un documento "a medias" (sin speakers/sesiones) circulando en
    // el flujo de firma: se intenta retirar la solicitud recién creada. Si
    // la política no deja borrarla (ya está en 'Pendiente'), se avisa con
    // claridad para que el usuario no la dé por buena.
    // Entrega 20: como ahora el documento sigue siendo Borrador en este punto,
    // se retira con la función del servidor (borra también su cadena y sesiones).
    const retirada = await retirarDocumentoRecienCreado({
      tipoDoc: "evento",
      tabla: TABLA,
      tablaAprobaciones: TABLA_APROBACIONES,
      columnaFk: "evento_id",
      documentoId: creado.id as string,
    });
    const detalle = e instanceof Error ? e.message : String(e);
    throw new Error(
      retirada
        ? `${detalle} La solicitud NO se creó; corrige el problema y vuelve a intentarlo.`
        : `${detalle} La solicitud quedó guardada como BORRADOR SIN esos datos (no se pudo retirar automáticamente): ábrela desde el Tablero y complétala, o elimínala, sin crear otra nueva.`,
    );
  }

  if (!guardarComoBorrador) {
    await pasarAPendienteOReversar({
      tipoDoc: "evento",
      tabla: TABLA,
      tablaAprobaciones: TABLA_APROBACIONES,
      columnaFk: "evento_id",
      documentoId: creado.id as string,
      accion: "No se pudo crear la solicitud de evento",
    });
    creado.estado = "Pendiente";
  }

  const plano: Evento = {
    ...rowToFlat<Evento>(creado, CAMPOS_EVENTO),
    tipoDoc: "evento",
    aprobaciones: cadena,
    sesiones,
    muestrasPlaneadas,
    productosEvento,
    speakersParticipacion,
  };

  await registrarAuditoria({
    documentoId: plano.id,
    tipoDoc: "evento",
    documentoNombre: nombreEvento(plano),
    actorId: usuario.id,
    accion: "creacion",
    detalle: guardarComoBorrador ? "Solicitud de Evento guardada como borrador." : "Solicitud de Evento creada y enviada a aprobación.",
    empresaGrupo: plano.empresaGrupo || undefined,
    pais: plano.pais || undefined,
  });
  if (!guardarComoBorrador) {
    await registrarAuditoria({
      documentoId: plano.id,
      tipoDoc: "evento",
      documentoNombre: nombreEvento(plano),
      actorId: usuario.id,
      accion: "envio",
      empresaGrupo: plano.empresaGrupo || undefined,
      pais: plano.pais || undefined,
    });
    // Entrega 20: el aviso al primer aprobador lo hace la aplicación (no el
    // trigger de base de datos) — ver `avisarPrimerAprobador`.
    await avisarPrimerAprobador({
      tipoDoc: "evento",
      documentoId: plano.id,
      documentoNombre: nombreEvento(plano),
      rolPrimeraEtapa: cadena[0].rolRequerido,
    });
  }

  return plano;
}

/**
 * Corrige y reenvía una Solicitud de Evento rechazada, o guarda los cambios
 * hechos durante una ventana de adenda ya abierta (`abrirVentanaAdendaEvento`).
 * Igual que CAF/Convenio: confirmado por extracción directa del bundle
 * original que esto NUNCA toca `evento_aprobaciones` desde el cliente, solo
 * actualiza la fila principal con `estado: "Pendiente"` — el servidor debe
 * encargarse de reiniciar la cadena.
 */
export async function editarYReenviarEvento(
  evento: Evento,
  datos: Partial<DatosEventoGuardable> &
    Pick<DatosEventoGuardable, "modalidadSesiones" | "sesiones" | "entregaMuestrasMedicas" | "muestrasPlaneadas" | "quienDictaActividad" | "participacionAcademica" | "speakersParticipacion">,
  usuario: Usuario,
): Promise<{ sesiones: SesionEvento[]; muestrasPlaneadas: MuestraPlaneada[]; speakersParticipacion: SpeakerParticipacionEvento[] }> {
  // `flatToRowParcial`, no `flatToRow` — `datos` nunca trae
  // `creadoPorId`/`creadoEn` (ver el comentario equivalente en
  // `editarYReenviarCaf`); usar `flatToRow` los habría pisado con "" en
  // cada UPDATE.
  const fila = flatToRowParcial(datos as unknown as Record<string, unknown>, CAMPOS_EVENTO);
  fila.estado = "Pendiente";
  const { error } = await supabase.from(TABLA).update(fila).eq("id", evento.id);
  if (error) throw new Error(`No se pudo guardar la corrección de la solicitud: ${mensajeErrorAmigable(error)}`);

  const sesiones = datos.modalidadSesiones === "Varias sesiones" ? await guardarSesiones(evento.id, datos.sesiones) : await guardarSesiones(evento.id, []);
  const muestrasPlaneadas = datos.entregaMuestrasMedicas
    ? await guardarMuestrasPlaneadas(evento.id, datos.muestrasPlaneadas)
    : await guardarMuestrasPlaneadas(evento.id, []);
  const speakersParticipacion =
    llevaSpeakers(datos)
      ? await guardarSpeakersParticipacion(evento.id, datos.speakersParticipacion, mapaIdsSesiones(datos.sesiones, sesiones))
      : await guardarSpeakersParticipacion(evento.id, []);
  if (datos.productosEvento) await guardarProductosEvento(evento.id, datos.productosEvento);

  await registrarAuditoria({
    documentoId: evento.id,
    tipoDoc: "evento",
    documentoNombre: nombreEvento({ ...evento, ...datos } as Evento),
    actorId: usuario.id,
    accion: "edicion_reenvio",
  });
  // E1: igual que en editarYReenviarCaf/Convenio, aquí NO se puede confiar
  // en el trigger de base de datos — el reinicio de evento_aprobaciones es
  // un UPDATE (el cliente nunca inserta ahí, según el comentario de esta
  // función) y fn_notificar_primera_etapa_evento() solo se dispara por
  // INSERT. Este SÍ es el único aviso posible para el primer aprobador
  // (tanto en un reenvío tras rechazo como al guardar una adenda sobre un
  // evento ya Aprobado).
  const primerPaso = evento.aprobaciones[0];
  if (primerPaso) {
    const usuariosConRol = await traerUsuariosParaNotificar().catch(() => []);
    await notificarTareaPendiente({
      tipoDoc: "evento",
      documentoId: evento.id,
      documentoNombre: nombreEvento({ ...evento, ...datos } as Evento),
      rolRequerido: primerPaso.rolRequerido,
      usuariosConRol,
    });
  }

  return { sesiones, muestrasPlaneadas, speakersParticipacion };
}

/**
 * Guarda cambios sobre una Solicitud de Evento todavía en Borrador o
 * Devuelto — repetible las veces que haga falta antes de enviarla a
 * aprobación. Mismo manejo de sesiones/muestras planeadas que
 * `editarYReenviarEvento`.
 */
export async function editarBorradorEvento(
  evento: Evento,
  datos: Partial<DatosEventoGuardable> &
    Pick<DatosEventoGuardable, "modalidadSesiones" | "sesiones" | "entregaMuestrasMedicas" | "muestrasPlaneadas" | "quienDictaActividad" | "participacionAcademica" | "speakersParticipacion">,
  usuario: Usuario,
  enviarAAprobacion: boolean,
): Promise<{ sesiones: SesionEvento[]; muestrasPlaneadas: MuestraPlaneada[]; speakersParticipacion: SpeakerParticipacionEvento[] }> {
  // Mismo motivo que en `editarYReenviarEvento`.
  const fila = flatToRowParcial(datos as unknown as Record<string, unknown>, CAMPOS_EVENTO);
  if (enviarAAprobacion) fila.estado = "Pendiente";
  await actualizarDocumentoEditable(TABLA, evento.id, fila);

  const sesiones = datos.modalidadSesiones === "Varias sesiones" ? await guardarSesiones(evento.id, datos.sesiones) : await guardarSesiones(evento.id, []);
  const muestrasPlaneadas = datos.entregaMuestrasMedicas
    ? await guardarMuestrasPlaneadas(evento.id, datos.muestrasPlaneadas)
    : await guardarMuestrasPlaneadas(evento.id, []);
  const speakersParticipacion =
    llevaSpeakers(datos)
      ? await guardarSpeakersParticipacion(evento.id, datos.speakersParticipacion, mapaIdsSesiones(datos.sesiones, sesiones))
      : await guardarSpeakersParticipacion(evento.id, []);
  if (datos.productosEvento) await guardarProductosEvento(evento.id, datos.productosEvento);

  const nombre = nombreEvento({ ...evento, ...datos } as Evento);
  await registrarAuditoria({
    documentoId: evento.id,
    tipoDoc: "evento",
    documentoNombre: nombre,
    actorId: usuario.id,
    accion: enviarAAprobacion ? "envio" : "borrador_actualizado",
    detalle: enviarAAprobacion ? undefined : "Borrador actualizado.",
  });
  // Entrega 20: un borrador enviado después nunca avisaba al primer aprobador.
  if (enviarAAprobacion) {
    await avisarPrimerAprobador({
      tipoDoc: "evento",
      documentoId: evento.id,
      documentoNombre: nombre,
      rolPrimeraEtapa: evento.aprobaciones[0]?.rolRequerido ?? crearCadenaAprobacionEvento()[0].rolRequerido,
    });
  }

  return { sesiones, muestrasPlaneadas, speakersParticipacion };
}

/**
 * Corrección (octubre 2026), pedido explícito del usuario: "crea una
 * opción para eliminar cualquiera de los formularios que estén guardados
 * como borrador. Esto no debe dejar rastro en el registro de auditoría.
 * Solo lo puede eliminar el usuario que haga la solicitud." — a propósito
 * NO se llama `registrarAuditoria` en ninguna parte de esta función.
 *
 * Corrección posterior (octubre 2026): el `delete` directo desde el
 * navegador lo filtraba RLS en silencio ("solo quien creó la solicitud
 * puede borrarla..." aun siendo el creador y estando en Borrador). Ahora la
 * operación vive en una función del servidor (`beats_eliminar_borrador`,
 * ver `src/lib/documentosRpc.ts` y
 * `db/agregar_rpc_eliminar_anular_documentos.sql`), que valida creador +
 * estado Borrador con `auth.uid()` y borra también las filas dependientes
 * (cadena de aprobación, sesiones, muestras, códigos, speakers y sus
 * presupuestos...) descubriéndolas por las llaves foráneas reales.
 */
export async function eliminarBorradorEvento(documentoId: string): Promise<void> {
  await eliminarBorradorDocumento("evento", documentoId);
}

/**
 * Corrección (octubre 2026), pedido explícito del usuario: pantalla
 * admin-only (hoy "Gestión avanzada de documentos") para "ver y eliminar
 * sin rastro, documentos que se hayan creado por error, a pesar de estar
 * firmados". A diferencia de `eliminarBorradorEvento`, no restringe por
 * `estado` ni por creador. El control de acceso real es el permiso
 * individual `puedeEliminarDocumentosFirmados` — ahora verificado TAMBIÉN en
 * el servidor (`beats_eliminar_documento_admin`) — más la reautenticación
 * por contraseña que pide la pantalla. A propósito NO se llama
 * `registrarAuditoria`.
 */
export async function eliminarDocumentoFirmadoAdmin(documentoId: string): Promise<void> {
  await eliminarDocumentoAdmin("evento", documentoId);
}

/** Devuelve (suspende y reabre) una Solicitud de Evento Pendiente sin ninguna firma todavía. */
export async function devolverEvento(evento: Evento, usuario: Usuario, motivo: string): Promise<void> {
  if (!puedeDevolverDocumento(evento.estado, evento.aprobaciones)) {
    throw new Error("Esta solicitud no se puede devolver: ya tiene al menos una firma en su cadena de aprobación, o no está pendiente.");
  }
  await devolverDocumento({ tabla: TABLA, tipoDoc: "evento", documentoId: evento.id, documentoNombre: nombreEvento(evento), motivo, usuario });
}

/** Abre la ventana de enmienda de una Solicitud de Evento Pendiente que ya tiene al menos una firma. */
export async function solicitarEnmiendaEvento(evento: Evento, usuario: Usuario, justificacion: string): Promise<{ expiraEn: string }> {
  if (!(usuario.esAdministrador || usuario.id === evento.creadoPorId)) {
    throw new Error("Solo quien creó la solicitud (o un administrador) puede pedir una enmienda.");
  }
  if (!puedeSolicitarEnmienda(evento.estado, evento.aprobaciones)) {
    throw new Error("Esta solicitud no requiere una enmienda: todavía no tiene ninguna firma, o ya no está pendiente.");
  }
  return solicitarEnmiendaDocumento({
    tabla: TABLA,
    tipoDoc: "evento",
    documentoId: evento.id,
    documentoNombre: nombreEvento(evento),
    justificacion,
    usuario,
  });
}

export async function cerrarVentanaEnmiendaEvento(eventoId: string): Promise<void> {
  await cerrarVentanaEnmiendaDocumento({ tabla: TABLA, documentoId: eventoId });
}

/** Igual que CAF/Convenio/ConvenioHCP: la resolución de una etapa pasa por RPC. */
export async function resolverPasoEvento(
  evento: Evento,
  indice: number,
  decision: "aprobado" | "rechazado",
  usuario: Usuario,
  comentario: string,
): Promise<void> {
  const paso = evento.aprobaciones[indice];
  if (!paso?.id) throw new Error("No se encontró el paso de aprobación indicado.");
  if (!pasosPreviosAprobados(evento.aprobaciones, indice)) {
    throw new Error("Todavía hay etapas anteriores sin aprobar.");
  }

  const { error } = await supabase.rpc("resolver_aprobacion_evento", {
    p_evento_id: evento.id,
    p_orden: paso.orden,
    p_accion: decision,
    p_comentario: comentario.trim() || null,
  });
  if (error) throw new Error(error.message);
  // Entrega 22: desde la PRIMERA firma el formato (etiquetas y campos) queda congelado.
  if (decision === "aprobado" && !tieneAlMenosUnaFirma(evento.aprobaciones)) {
    await congelarFormatoAlPrimerFirma({ tabla: "solicitudes_evento", tipoDoc: "evento", documentoId: evento.id, empresaGrupo: evento.empresaGrupo, });
  }

  const usuariosConRol = await traerUsuariosParaNotificar().catch(() => []);

  if (decision === "rechazado") {
    await registrarAuditoria({
      documentoId: evento.id,
      tipoDoc: "evento",
      documentoNombre: nombreEvento(evento),
      actorId: usuario.id,
      accion: "rechazo",
      detalle: `Rechazado en la etapa "${paso.etiqueta}". ${comentario}`.trim(),
    });
    await notificarResolucionPaso({
      tipoDoc: "evento",
      documentoId: evento.id,
      documentoNombre: nombreEvento(evento),
      etiquetaPaso: paso.etiqueta,
      rolResuelto: paso.rolRequerido,
      decision: "rechazado",
      esFinal: false,
      creadorId: evento.creadoPorId,
      aprobadoresIds: idsAprobadoresPrevios(evento.aprobaciones),
      actorId: usuario.id,
      actorNombre: usuario.nombre,
      usuariosConRol,
    });
    return;
  }

  const cadenaActualizada = evento.aprobaciones.map((p, i) => (i === indice ? { ...p, estado: decision } : p));
  const esFinal = cadenaCompletamenteAprobada(cadenaActualizada);
  await registrarAuditoria({
    documentoId: evento.id,
    tipoDoc: "evento",
    documentoNombre: nombreEvento(evento),
    actorId: usuario.id,
    accion: esFinal ? "aprobacion_final" : "aprobacion_parcial",
    detalle: `Etapa "${paso.etiqueta}" aprobada.${comentario ? ` ${comentario}` : ""}`,
  });
  await notificarResolucionPaso({
    tipoDoc: "evento",
    documentoId: evento.id,
    documentoNombre: nombreEvento(evento),
    etiquetaPaso: paso.etiqueta,
    rolResuelto: paso.rolRequerido,
    decision: "aprobado",
    esFinal,
    creadorId: evento.creadoPorId,
      aprobadoresIds: idsAprobadoresPrevios(evento.aprobaciones),
    actorId: usuario.id,
    actorNombre: usuario.nombre,
    // Entrega 25: el aviso de la etapa SIGUIENTE lo crea la base de datos dentro de resolver_aprobacion_* (con el descriptor detallado); avisarlo también aquí duplicaba campana y correo.
    usuariosConRol,
  });
  // Entrega 20: primer escalón de tareas por speaker. Cuando el Director Médico
  // aprueba su etapa de una solicitud con speaker externo, se generan (a la vez)
  // las tareas de MD FMV Checklist y Convenio de Pago a HCP.
  // Octubre 2026 (entrega 25): el MD FMV Checklist y la Solicitud de Convenio de Pago a HCP
  // solo aplican a speakers EXTERNOS: los internos (empleados) no se listan en el aviso y, si
  // el evento no tiene ninguno externo, no se avisa nada.
  if (paso.rolRequerido === "medica" && eventoTieneSpeakersExternos(evento)) {
    const fechas =
      evento.fechaInicioEvento && evento.fechaFinEvento && evento.fechaInicioEvento !== evento.fechaFinEvento
        ? `${evento.fechaInicioEvento} a ${evento.fechaFinEvento}`
        : evento.fechaInicioEvento ?? "";
    await avisarTareasFmvYConvenioPago({
      eventoId: evento.id,
      nombreEvento: nombreEvento(evento),
      fechas,
      nombresSpeakers: speakersExternosDe(evento)
        .map((sp) => sp.nombreSpeaker)
        .filter(Boolean),
    });
  }
}

export async function anularEvento(evento: Evento, usuario: Usuario, motivo: string): Promise<void> {
  // Octubre 2026: el `update` directo desde el navegador lo filtraba RLS en
  // silencio (sobre todo en documentos Completados) — ver
  // `src/lib/documentosRpc.ts`. El servidor valida que quien anula sea
  // Administrador y que el documento no esté en Borrador (se elimina) ni ya
  // Anulado.
  await anularDocumentoRpc("evento", evento.id, motivo);
  await registrarAuditoria({
    documentoId: evento.id,
    tipoDoc: "evento",
    documentoNombre: nombreEvento(evento),
    actorId: usuario.id,
    accion: "anulacion",
    detalle: motivo,
  });
}

/**
 * Ventana de adenda: confirmado por extracción directa del bundle original
 * (funciones `PC`/`FC`) que abrir y cerrar la ventana pasan por RPC
 * dedicadas (`abrir_ventana_adenda_evento`/`cerrar_ventana_adenda_evento`),
 * nunca por `.update()` directo sobre las columnas `adenda_ventana_*` — el
 * mismo patrón de RLS-protegido que ya se vio para resolver una etapa. La
 * edición real de los campos durante la ventana reutiliza
 * `editarYReenviarEvento`; al terminar se cierra la ventana explícitamente.
 */
export async function abrirVentanaAdendaEvento(
  eventoId: string,
  justificacion: string,
): Promise<{ adendaId: string; expiraEn: string }> {
  const { data, error } = await supabase
    .rpc("abrir_ventana_adenda_evento", { p_evento_id: eventoId, p_justificacion: justificacion.trim() })
    .single();
  if (error) throw new Error(error.message);
  const fila = data as { adenda_id: string; expira_en: string };
  return { adendaId: fila.adenda_id, expiraEn: fila.expira_en };
}

export async function cerrarVentanaAdendaEvento(adendaId: string, eventoId: string): Promise<void> {
  const { error } = await supabase.rpc("cerrar_ventana_adenda_evento", { p_adenda_id: adendaId, p_evento_id: eventoId });
  if (error) throw new Error(error.message);
}

/**
 * Ronda de instrucciones históricas (cluster A, A12): regla automática de
 * estado "Completado" — un evento Aprobado cuya fecha de fin ya pasó Y
 * cuyo checklist de documentos de cierre (`construirChecklistEvento`, el
 * mismo que usa "Auditoría de Eventos") no tiene ningún ítem "faltante" se
 * considera cerrado. Esta reconstrucción no tiene un proceso propio en
 * segundo plano (todo el backend es Supabase) — se evalúa de forma
 * perezosa cada vez que se carga el Tablero, que ya trae todo lo que el
 * checklist necesita. La transición es de un solo sentido
 * (Aprobado→Completado); nunca revierte un evento ya Completado ni toca
 * uno Pendiente/Rechazado/Anulado. Un error puntual al actualizar un
 * evento (p. ej. RLS) no debe impedir evaluar el resto.
 */
export async function evaluarYCompletarEventosVencidos(
  eventos: Evento[],
  ctx: {
    convenios: Convenio[];
    fmvs: Fmv[];
    notificaciones: NotificacionPagoHcp[];
    cafs: Caf[];
    archivosRepo: RepositorioArchivoEvento[];
    financierosRepo: RegistroFinancieroEvento[];
  },
  actorId: string,
): Promise<string[]> {
  const hoy = new Date().toISOString().slice(0, 10);
  const idsCompletados: string[] = [];
  for (const evento of eventos) {
    if (evento.estado !== "Aprobado") continue;
    if (!evento.fechaFinEvento || evento.fechaFinEvento >= hoy) continue;
    const checklist = construirChecklistEvento(evento, ctx);
    if (checklist.some((item) => item.estado === "faltante")) continue;

    const { error } = await supabase.from(TABLA).update({ estado: "Completado" }).eq("id", evento.id);
    if (error) continue;
    await registrarAuditoria({
      documentoId: evento.id,
      tipoDoc: "evento",
      documentoNombre: nombreEvento(evento),
      actorId,
      accion: "completado",
      detalle: "Completado automáticamente: la fecha de cierre ya pasó y el checklist de documentos no tiene pendientes.",
      empresaGrupo: evento.empresaGrupo,
      pais: evento.pais,
    });
    idsCompletados.push(evento.id);
  }
  return idsCompletados;
}

function generarCodigoAcceso(): string {
  // 6 caracteres alfanuméricos en mayúsculas, sin ambigüedad (sin 0/O/1/I) —
  // suficiente para que el equipo en sitio lo digite a mano en ejecucion.html.
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let codigo = "";
  for (let i = 0; i < 6; i++) codigo += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  return codigo;
}

function filaACodigoAcceso(fila: Record<string, unknown>): CodigoAccesoEvento {
  return {
    id: fila.id as string,
    eventoId: fila.evento_id as string,
    codigo: fila.codigo as string,
    activo: Boolean(fila.activo),
    creadoPorId: fila.creado_por_id as string,
    creadoEn: fila.creado_en as string,
    expiraEn: (fila.expira_en as string) ?? null,
  };
}

export async function traerCodigosAccesoEvento(eventoId: string): Promise<CodigoAccesoEvento[]> {
  const { data, error } = await supabase
    .from(TABLA_CODIGOS)
    .select("*")
    .eq("evento_id", eventoId)
    .order("creado_en", { ascending: false });
  if (error) throw new Error(mensajeErrorAmigable(error));
  return (data ?? []).map(filaACodigoAcceso);
}

/**
 * Genera un nuevo código de acceso para `ejecucion.html` (Fase 7) y
 * desactiva cualquier código previo todavía activo, para que solo haya uno
 * vigente a la vez.
 */
export async function generarCodigoAccesoEvento(eventoId: string, usuario: Usuario): Promise<CodigoAccesoEvento> {
  const { error: errorDesactivar } = await supabase
    .from(TABLA_CODIGOS)
    .update({ activo: false })
    .eq("evento_id", eventoId)
    .eq("activo", true);
  if (errorDesactivar) throw new Error(`No se pudo desactivar el código de acceso anterior: ${mensajeErrorAmigable(errorDesactivar)}`);

  const { data, error } = await supabase
    .from(TABLA_CODIGOS)
    .insert({ evento_id: eventoId, codigo: generarCodigoAcceso(), creado_por_id: usuario.id, activo: true })
    .select("*")
    .single();
  if (error) throw new Error(`No se pudo generar el código de acceso: ${mensajeErrorAmigable(error)}`);
  return filaACodigoAcceso(data);
}

export async function desactivarCodigoAccesoEvento(id: string): Promise<void> {
  const { error } = await supabase.from(TABLA_CODIGOS).update({ activo: false }).eq("id", id);
  if (error) throw new Error(`No se pudo desactivar el código de acceso: ${mensajeErrorAmigable(error)}`);
}

/**
 * Octubre 2026, pedido explícito: "al igual que se puede desactivar un código
 * [de acceso de Ejecución en Sitio], también se pueda eliminar".
 *
 * Un código que YA se usó en sitio (tiene sesiones de ejecución, y de ellas
 * cuelgan los registros de asistencia/muestras/fotos) NO se borra — eso
 * destruiría la evidencia del evento; solo se puede desactivar. Los códigos
 * generados que nunca se usaron sí se eliminan. El borrado exige que la
 * política RLS de `eventos_codigos_acceso` lo permita (ver
 * `db/agregar_eliminar_codigo_acceso_evento.sql`); si Postgres lo filtra en
 * silencio (0 filas), se avisa en vez de aparentar éxito.
 */
export async function eliminarCodigoAccesoEvento(id: string): Promise<void> {
  const { count, error: errorUso } = await supabase
    .from("sesiones_ejecucion_evento")
    .select("id", { count: "exact", head: true })
    .eq("codigo_acceso_id", id);
  if (errorUso) throw new Error(`No se pudo verificar si el código ya se usó en sitio: ${mensajeErrorAmigable(errorUso)}`);
  if ((count ?? 0) > 0) {
    throw new Error("Este código ya se usó en el sitio del evento y tiene registros de ejecución asociados: no se puede eliminar, solo desactivar.");
  }
  const { data, error } = await supabase.from(TABLA_CODIGOS).delete().eq("id", id).select("id");
  if (error) {
    const sinPermiso = error.code === "42501" || /row-level security|permission denied/i.test(error.message ?? "");
    throw new Error(
      sinPermiso
        ? "No se pudo eliminar el código: falta aplicar la política de seguridad de la base de datos (ejecutar db/agregar_eliminar_codigo_acceso_evento.sql en Supabase)."
        : `No se pudo eliminar el código de acceso: ${mensajeErrorAmigable(error)}`,
    );
  }
  if (!data || data.length === 0) {
    throw new Error("No se pudo eliminar el código: la base de datos no lo permitió (ejecuta db/agregar_eliminar_codigo_acceso_evento.sql en Supabase).");
  }
}

export { CAMPOS_EVENTO };
