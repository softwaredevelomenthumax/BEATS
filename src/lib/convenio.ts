import { congelarFormatoAlPrimerFirma } from "@/lib/congelamiento";
import { actualizarDocumentoEditable } from "@/lib/documentosRpc";
import { tieneAlMenosUnaFirma } from "@/lib/cicloVidaDocumento";
import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";
import { eliminarBorradorDocumento, eliminarDocumentoAdmin, anularDocumentoRpc } from "@/lib/documentosRpc";
import { rowToFlat, flatToRow, flatToRowParcial, t, s0, b, n0n, arr, j, type FieldSpec } from "@/lib/dbMapping";
import { crearCadenaAprobacionConvenio, pasosPreviosAprobados, cadenaCompletamenteAprobada, type PasoAprobacion, idsAprobadoresPrevios } from "@/lib/aprobaciones";
import { registrarAuditoria } from "@/lib/auditoria";
import { notificarResolucionPaso, notificarTareaPendiente, traerUsuariosParaNotificar } from "@/lib/notificaciones";
import { avisarPrimerAprobador, insertarCadenaOReversar, pasarAPendienteOReversar } from "@/lib/envioAprobacion";
import { avisarTareasCafYConvenioHCP } from "@/lib/tareasEscalonadas";
import {
  devolverDocumento,
  solicitarEnmiendaDocumento,
  cerrarVentanaEnmiendaDocumento,
  puedeDevolverDocumento,
  puedeSolicitarEnmienda,
} from "@/lib/cicloVidaDocumento";
import { puedeEnviarConvenioAAprobacion } from "@/lib/reglasDependenciaDocumentos";
import { calcularScoreFmvVigente, escribirScoreFmv, leerScoreFmv } from "@/lib/convenioDerivados";
import type { Convenio, Usuario } from "@/types";

const TABLA = "convenios_pago_hcp";
const TABLA_APROBACIONES = "convenio_aprobaciones";

const CAMPOS_CONVENIO: FieldSpec[] = [
  t("id"),
  t("estado"),
  t("creado_por_id", "creadoPorId"),
  t("creado_en", "creadoEn"),
  s0("evento_origen_id", "eventoOrigenId"),
  t("empleado_responsable_nombre_cargo", "empleadoResponsableNombreCargo"),
  t("departamento"),
  t("unidad_negocio_ubicacion", "unidadNegocioUbicacion"),
  t("tipo_actividad", "tipoActividad"),
  t("organizado_por", "organizadoPor"),
  t("organizador"),
  t("speaker_id", "speakerId"),
  t("hcp_nombre_completo", "hcpNombreCompleto"),
  t("hcp_numero_documento", "hcpNumeroDocumento"),
  t("hcp_especialidad", "hcpEspecialidad"),
  t("hcp_estado_provincia", "hcpEstadoProvincia"),
  t("hcp_direccion", "hcpDireccion"),
  t("hcp_pais", "hcpPais"),
  t("hcp_ciudad", "hcpCiudad"),
  t("hcp_cedula_licencia", "hcpCedulaLicencia"),
  t("hcp_rfc", "hcpRFC"),
  t("tipo_servicio", "tipoServicio"),
  t("nombre_evento_servicio", "nombreEventoServicio"),
  s0("fecha_inicio_actividad", "fechaInicioActividad"),
  s0("fecha_fin_actividad", "fechaFinActividad"),
  b("es_consejo_asesores", "esConsejoAsesores"),
  t("titulo_consejo_asesores", "tituloConsejoAsesores"),
  n0n("numero_hcp_consejo", "numeroHCPConsejo"),
  t("justificacion_numero_hcp", "justificacionNumeroHCP"),
  b("es_funcionario_gobierno", "esFuncionarioGobierno"),
  b("supuesto_cargo_importante", "supuestoCargoImportante"),
  b("supuesto_representante_compras", "supuestoRepresentanteCompras"),
  b("supuesto_influencia_decision_gubernamental", "supuestoInfluenciaDecisionGubernamental"),
  b("advertencia_funcionario_gobierno_confirmada", "advertenciaFuncionarioGobiernoConfirmada"),
  t("objetivo"),
  t("criterios_seleccion", "criteriosSeleccion"),
  b("cv_adjunto", "cvAdjunto"),
  n0n("contraprestacion_hcp", "contraprestacionHCP"),
  t("moneda_contraprestacion", "monedaContraprestacion"),
  b("consistente_tabulador_tarifas", "consistenteTabuladorTarifas"),
  t("explicacion_si_no_consistente", "explicacionSiNoConsistente"),
  t("agenda_reunion", "agendaReunion"),
  s0("archivo_agenda_id", "archivoAgendaId"),
  t("catering_nombre_servicio", "cateringNombreServicio"),
  n0n("contraprestacion_catering", "contraprestacionCatering"),
  t("lugar_reunion", "lugarReunion"),
  b("firma_empleado_certifica", "firmaEmpleadoCertifica"),
  arr("sesiones_participacion_ids", "sesionesParticipacionIds"),
  s0("motivo_anulacion", "motivoAnulacion"),
  s0("anulado_por_id", "anuladoPorId"),
  s0("anulado_en", "anuladoEn"),
  s0("adenda_ventana_actor_id", "adendaVentanaActorId"),
  s0("adenda_ventana_expira_en", "adendaVentanaExpiraEn"),
  s0("adenda_ventana_justificacion", "adendaVentanaJustificacion"),
  j("campos_personalizados", {}, "camposPersonalizados"),
  // Snapshot congelado por trigger al pasar a Aprobado/Completado — ver
  // `db/agregar_inmutabilidad_documentos_firmados.sql`. Solo lectura desde
  // el front-end (lo escribe el trigger, no un `crear*`/`editar*`).
  j("snapshot_formato", null, "snapshotFormato"),
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

/**
 * Octubre 2026: "Score total FMV Checklist" — se CONGELA al enviar a
 * aprobación por primera vez (el FMV ya está Completado, así que su puntaje
 * ya no cambia) y desde ahí no se vuelve a calcular: reenviar tras un rechazo,
 * una enmienda o una adenda conserva el valor guardado. Si no hay un FMV
 * (o falla la consulta) se deja lo que ya traía el formulario.
 */
async function conScoreFmvCongelado(
  eventoOrigenId: string | null | undefined,
  speakerId: string | null | undefined,
  camposPersonalizados: Record<string, unknown> | undefined,
  { refrescar }: { refrescar: boolean },
): Promise<Record<string, unknown>> {
  const actuales = camposPersonalizados ?? {};
  if (!refrescar && leerScoreFmv(actuales)) return actuales;
  try {
    const score = await calcularScoreFmvVigente(eventoOrigenId, speakerId);
    return score ? escribirScoreFmv(actuales, score) : actuales;
  } catch {
    return actuales;
  }
}

function nombreConvenio(convenio: Pick<Convenio, "hcpNombreCompleto" | "nombreEventoServicio">): string {
  return `Convenio de Pago — ${convenio.hcpNombreCompleto || convenio.nombreEventoServicio || "sin HCP"}`;
}

/**
 * Fase 4 (precargado automático entre formularios): trae un solo Convenio
 * de Pago a HCP completo por id — usada por Nueva Notificación de Pago al
 * elegir "Convenio de origen".
 */
export async function traerConvenioPorId(id: string): Promise<Convenio | null> {
  const { data, error } = await supabase.from(TABLA).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(mensajeErrorAmigable(error));
  if (!data) return null;
  return { ...rowToFlat<Convenio>(data, CAMPOS_CONVENIO), tipoDoc: "convenio", aprobaciones: [] };
}

/**
 * Ronda de ajustes de formularios (septiembre 2026), entrega 7: usado por
 * CAF para precargar los datos de la contraparte desde el Convenio de Pago
 * a HCP del mismo evento/speaker (pedido explícito). Trae el más reciente
 * si hay más de uno.
 */
export async function traerConvenioPorEventoYSpeaker(eventoOrigenId: string, speakerId: string): Promise<Convenio | null> {
  const { data, error } = await supabase
    .from(TABLA)
    .select("*")
    .eq("evento_origen_id", eventoOrigenId)
    .eq("speaker_id", speakerId)
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(mensajeErrorAmigable(error));
  return data ? { ...rowToFlat<Convenio>(data, CAMPOS_CONVENIO), tipoDoc: "convenio", aprobaciones: [] } : null;
}

/**
 * Ronda de rediseño "Convenio HCP" (septiembre 2026): trae el Convenio de
 * Pago a HCP más reciente de un evento (sin filtrar por speaker) — usado
 * para armar el texto de "Servicios (Anexo A)" del Convenio HCP, que toma de
 * ahí "Tipo de servicio"/"Tipo de actividad"/"Tema" (este último mapeado a
 * `nombreEventoServicio`, ver `lib/textosFijosConvenioHCP.ts`). A diferencia
 * de `traerConvenioPorEventoYSpeaker`, el Convenio HCP no necesariamente
 * comparte el mismo `speakerId` explícito (el selector de Speaker es
 * opcional ahí), así que esta variante solo filtra por evento.
 */
export async function traerConvenioPorEventoId(eventoOrigenId: string): Promise<Convenio | null> {
  const { data, error } = await supabase
    .from(TABLA)
    .select("*")
    .eq("evento_origen_id", eventoOrigenId)
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(mensajeErrorAmigable(error));
  return data ? { ...rowToFlat<Convenio>(data, CAMPOS_CONVENIO), tipoDoc: "convenio", aprobaciones: [] } : null;
}

export async function traerConvenios(): Promise<Convenio[]> {
  const [{ data: filas, error: errorFilas }, { data: pasos, error: errorPasos }] = await Promise.all([
    supabase.from(TABLA).select("*").order("creado_en", { ascending: false }),
    supabase.from(TABLA_APROBACIONES).select("*").order("orden", { ascending: true }),
  ]);
  if (errorFilas) throw new Error(mensajeErrorAmigable(errorFilas));
  if (errorPasos) throw new Error(mensajeErrorAmigable(errorPasos));

  const pasosPorConvenio = new Map<string, PasoAprobacion[]>();
  for (const fila of pasos ?? []) {
    const lista = pasosPorConvenio.get(fila.convenio_id as string) ?? [];
    lista.push(filaAPaso(fila));
    pasosPorConvenio.set(fila.convenio_id as string, lista);
  }

  return (filas ?? []).map((fila) => ({
    ...rowToFlat<Convenio>(fila, CAMPOS_CONVENIO),
    tipoDoc: "convenio" as const,
    aprobaciones: pasosPorConvenio.get(fila.id as string) ?? [],
  }));
}

export async function crearConvenio(
  datos: Omit<Convenio, "id" | "tipoDoc" | "estado" | "creadoPorId" | "creadoEn" | "aprobaciones" | "motivoAnulacion" | "anuladoPorId" | "anuladoEn" | "adendaVentanaActorId" | "adendaVentanaExpiraEn" | "adendaVentanaJustificacion">,
  usuario: Usuario,
  guardarComoBorrador: boolean,
): Promise<Convenio> {
  // Ronda de ajustes de formularios (septiembre 2026), entrega 3: no se
  // puede enviar a aprobación sin un FMV ya Completado para el mismo
  // evento/speaker — se puede seguir guardando como borrador libremente
  // (pedido explícito: "se puede crear en simultánea con el MD FMV
  // Checklist, pero no se puede iniciar el flujo de aprobación hasta tanto
  // el MD FMV Checklist no esté aprobado en su totalidad").
  if (!guardarComoBorrador) {
    const puedeEnviar = await puedeEnviarConvenioAAprobacion(datos.eventoOrigenId, datos.speakerId);
    if (!puedeEnviar) {
      throw new Error("No se puede enviar a aprobación: el MD FMV Checklist de este speaker todavía no está completado.");
    }
  }
  if (!guardarComoBorrador) {
    datos = { ...datos, camposPersonalizados: await conScoreFmvCongelado(datos.eventoOrigenId, datos.speakerId, datos.camposPersonalizados, { refrescar: true }) };
  }
  const fila = flatToRow(datos as unknown as Record<string, unknown>, CAMPOS_CONVENIO);
  // Entrega 20: SIEMPRE se inserta como Borrador; el paso a "Pendiente" se hace
  // después de crear la cadena (ver `src/lib/envioAprobacion.ts`).
  fila.estado = "Borrador";
  fila.creado_por_id = usuario.id;
  fila.creado_en = new Date().toISOString();

  const { data: creado, error } = await supabase.from(TABLA).insert(fila).select("*").single();
  if (error) {
    // Octubre 2026: guardar un BORRADOR de Convenio de Pago fallaba con "No
    // tienes permiso para realizar esta acción" (código 42501 / RLS). El
    // INSERT ... RETURNING exige que la política de lectura también deje ver
    // la fila recién creada; si la política de la tabla no contempla los
    // borradores del propio creador, Postgres rechaza todo. Se corrige en la
    // base con `db/agregar_rls_borrador_convenio_pago.sql`.
    const sinPermiso = error.code === "42501" || /row-level security|permission denied/i.test(error.message ?? "");
    throw new Error(
      sinPermiso
        ? "No se pudo crear el convenio de pago: falta aplicar la política de seguridad de la base de datos (ejecutar db/agregar_rls_borrador_convenio_pago.sql en Supabase)."
        : `No se pudo crear el convenio de pago: ${mensajeErrorAmigable(error)}`,
    );
  }

  const cadena = crearCadenaAprobacionConvenio();
  await insertarCadenaOReversar({
    tipoDoc: "convenio",
    tabla: TABLA,
    tablaAprobaciones: TABLA_APROBACIONES,
    columnaFk: "convenio_id",
    documentoId: creado.id as string,
    accion: "No se pudo crear el convenio de pago",
    filas: cadena.map((paso) => ({
      convenio_id: creado.id,
      orden: paso.orden,
      etiqueta: paso.etiqueta,
      rol_requerido: paso.rolRequerido,
      estado: paso.estado,
      pendiente_desde: paso.pendienteDesde,
    })),
  });
  if (!guardarComoBorrador) {
    await pasarAPendienteOReversar({
      tipoDoc: "convenio",
      tabla: TABLA,
      tablaAprobaciones: TABLA_APROBACIONES,
      columnaFk: "convenio_id",
      documentoId: creado.id as string,
      accion: "No se pudo crear el convenio de pago",
    });
    creado.estado = "Pendiente";
  }

  const plano: Convenio = { ...rowToFlat<Convenio>(creado, CAMPOS_CONVENIO), tipoDoc: "convenio", aprobaciones: cadena };

  await registrarAuditoria({
    documentoId: plano.id,
    tipoDoc: "convenio",
    documentoNombre: nombreConvenio(plano),
    actorId: usuario.id,
    accion: "creacion",
    detalle: guardarComoBorrador ? "Convenio de Pago guardado como borrador." : "Convenio de Pago creado y enviado a aprobación.",
  });
  if (!guardarComoBorrador) {
    await registrarAuditoria({
      documentoId: plano.id,
      tipoDoc: "convenio",
      documentoNombre: nombreConvenio(plano),
      actorId: usuario.id,
      accion: "envio",
    });
    // Entrega 20: el aviso al primer aprobador ya NO depende del trigger de
    // base de datos (que solo reaccionaba al insertar la cadena y se
    // equivocaba con el tipo del documento): lo hace la aplicación, siempre
    // que el documento pasa a "Pendiente" — ver `avisarPrimerAprobador`.
    await avisarPrimerAprobador({
      tipoDoc: "convenio",
      documentoId: plano.id,
      documentoNombre: nombreConvenio(plano),
      rolPrimeraEtapa: cadena[0].rolRequerido,
    });
  }

  return plano;
}

/**
 * Igual que en CAF, la resolución de una etapa pasa por RPC
 * (`resolver_aprobacion_convenio`) — confirmado por extracción directa del
 * bundle original — que hace atómicamente la transición en cascada del
 * estado del convenio.
 */
export async function resolverPasoConvenio(
  convenio: Convenio,
  indice: number,
  decision: "aprobado" | "rechazado",
  usuario: Usuario,
  comentario: string,
): Promise<void> {
  const paso = convenio.aprobaciones[indice];
  if (!paso?.id) throw new Error("No se encontró el paso de aprobación indicado.");
  if (!pasosPreviosAprobados(convenio.aprobaciones, indice)) {
    throw new Error("Todavía hay etapas anteriores sin aprobar.");
  }

  const { error } = await supabase.rpc("resolver_aprobacion_convenio", {
    p_convenio_id: convenio.id,
    p_orden: paso.orden,
    p_accion: decision,
    p_comentario: comentario.trim() || null,
  });
  if (error) throw new Error(error.message);
  // Entrega 22: desde la PRIMERA firma el formato (etiquetas y campos) queda congelado.
  if (decision === "aprobado" && !tieneAlMenosUnaFirma(convenio.aprobaciones)) {
    await congelarFormatoAlPrimerFirma({ tabla: "convenios_pago_hcp", tipoDoc: "convenio", documentoId: convenio.id, eventoOrigenId: convenio.eventoOrigenId, });
  }

  const usuariosConRol = await traerUsuariosParaNotificar().catch(() => []);

  if (decision === "rechazado") {
    await registrarAuditoria({
      documentoId: convenio.id,
      tipoDoc: "convenio",
      documentoNombre: nombreConvenio(convenio),
      actorId: usuario.id,
      accion: "rechazo",
      detalle: `Rechazado en la etapa "${paso.etiqueta}". ${comentario}`.trim(),
    });
    await notificarResolucionPaso({
      tipoDoc: "convenio",
      documentoId: convenio.id,
      documentoNombre: nombreConvenio(convenio),
      etiquetaPaso: paso.etiqueta,
      rolResuelto: paso.rolRequerido,
      decision: "rechazado",
      esFinal: false,
      creadorId: convenio.creadoPorId,
      aprobadoresIds: idsAprobadoresPrevios(convenio.aprobaciones),
      actorId: usuario.id,
      actorNombre: usuario.nombre,
      usuariosConRol,
    });
    return;
  }

  const cadenaActualizada = convenio.aprobaciones.map((p, i) => (i === indice ? { ...p, estado: decision } : p));
  const esFinal = cadenaCompletamenteAprobada(cadenaActualizada);
  await registrarAuditoria({
    documentoId: convenio.id,
    tipoDoc: "convenio",
    documentoNombre: nombreConvenio(convenio),
    actorId: usuario.id,
    accion: esFinal ? "aprobacion_final" : "aprobacion_parcial",
    detalle: `Etapa "${paso.etiqueta}" aprobada.${comentario ? ` ${comentario}` : ""}`,
  });
  await notificarResolucionPaso({
    tipoDoc: "convenio",
    documentoId: convenio.id,
    documentoNombre: nombreConvenio(convenio),
    etiquetaPaso: paso.etiqueta,
    rolResuelto: paso.rolRequerido,
    decision: "aprobado",
    esFinal,
    creadorId: convenio.creadoPorId,
      aprobadoresIds: idsAprobadoresPrevios(convenio.aprobaciones),
    actorId: usuario.id,
    actorNombre: usuario.nombre,
    // Entrega 25: el aviso de la etapa SIGUIENTE lo crea la base de datos dentro de resolver_aprobacion_* (con el descriptor detallado); avisarlo también aquí duplicaba campana y correo.
    usuariosConRol,
  });
  // Entrega 20: al quedar aprobado en su totalidad, si el FMV del speaker ya
  // estaba completado, se generan las tareas de CAF y Convenio HCP.
  if (esFinal) {
    await avisarTareasCafYConvenioHCP({
      eventoOrigenId: convenio.eventoOrigenId,
      speakerId: convenio.speakerId || null,
      nombreSpeaker: convenio.hcpNombreCompleto,
    });
  }
}

/**
 * Igual que CAF: confirmado por extracción directa del bundle original que
 * "editar y reenviar" un Convenio de Pago rechazado NUNCA toca
 * `convenio_aprobaciones` desde el cliente, solo actualiza la fila del
 * convenio con `estado: "Pendiente"` — el servidor debe encargarse de
 * reiniciar la cadena (mismo motivo por el que resolver una etapa exige
 * RPC en vez de `.update()` directo).
 */
export async function editarYReenviarConvenio(convenio: Convenio, datos: Partial<Convenio>, usuario: Usuario): Promise<void> {
  const eventoOrigenId = datos.eventoOrigenId ?? convenio.eventoOrigenId;
  const speakerId = datos.speakerId ?? convenio.speakerId;
  const puedeEnviar = await puedeEnviarConvenioAAprobacion(eventoOrigenId, speakerId);
  if (!puedeEnviar) {
    throw new Error("No se puede reenviar a aprobación: el MD FMV Checklist de este speaker todavía no está completado.");
  }
  datos = { ...datos, camposPersonalizados: await conScoreFmvCongelado(eventoOrigenId, speakerId, datos.camposPersonalizados ?? convenio.camposPersonalizados, { refrescar: false }) };
  // `flatToRowParcial`, no `flatToRow` — ver el comentario equivalente en
  // `editarYReenviarCaf`: `datos` nunca trae `creadoPorId`/`creadoEn`, y
  // `flatToRow` los habría pisado con su default (`""`) en cada UPDATE.
  const fila = flatToRowParcial(datos as Record<string, unknown>, CAMPOS_CONVENIO);
  fila.estado = "Pendiente";
  const { error: errorUpdate } = await supabase.from(TABLA).update(fila).eq("id", convenio.id);
  if (errorUpdate) throw new Error(mensajeErrorAmigable(errorUpdate));

  await registrarAuditoria({
    documentoId: convenio.id,
    tipoDoc: "convenio",
    documentoNombre: nombreConvenio({ ...convenio, ...datos } as Convenio),
    actorId: usuario.id,
    accion: "edicion_reenvio",
  });
  // E1: igual que en editarYReenviarCaf, aquí NO se puede confiar en el
  // trigger de base de datos — el reinicio de convenio_aprobaciones es un
  // UPDATE (el cliente nunca inserta ahí, según el comentario de esta
  // función) y fn_notificar_primera_etapa_convenio() solo se dispara por
  // INSERT. Este SÍ es el único aviso posible para el primer aprobador.
  const primerPaso = convenio.aprobaciones[0];
  if (primerPaso) {
    const usuariosConRol = await traerUsuariosParaNotificar().catch(() => []);
    await notificarTareaPendiente({
      tipoDoc: "convenio",
      documentoId: convenio.id,
      documentoNombre: nombreConvenio({ ...convenio, ...datos } as Convenio),
      rolRequerido: primerPaso.rolRequerido,
      usuariosConRol,
    });
  }
}

/**
 * Guarda cambios sobre un Convenio de Pago a HCP todavía en Borrador o
 * Devuelto — repetible las veces que haga falta antes de enviarlo a
 * aprobación. Ver `editarBorradorCaf` para el mismo patrón explicado en
 * detalle.
 */
export async function editarBorradorConvenio(
  convenio: Convenio,
  datos: Partial<Convenio>,
  usuario: Usuario,
  enviarAAprobacion: boolean,
): Promise<void> {
  if (enviarAAprobacion) {
    const eventoOrigenId = datos.eventoOrigenId ?? convenio.eventoOrigenId;
    const speakerId = datos.speakerId ?? convenio.speakerId;
    const puedeEnviar = await puedeEnviarConvenioAAprobacion(eventoOrigenId, speakerId);
    if (!puedeEnviar) {
      throw new Error("No se puede enviar a aprobación: el MD FMV Checklist de este speaker todavía no está completado.");
    }
  }
  if (enviarAAprobacion) {
    const eventoId = datos.eventoOrigenId ?? convenio.eventoOrigenId;
    const speaker = datos.speakerId ?? convenio.speakerId;
    datos = { ...datos, camposPersonalizados: await conScoreFmvCongelado(eventoId, speaker, datos.camposPersonalizados ?? convenio.camposPersonalizados, { refrescar: true }) };
  }
  // Mismo motivo que en `editarYReenviarConvenio`.
  const fila = flatToRowParcial(datos as Record<string, unknown>, CAMPOS_CONVENIO);
  if (enviarAAprobacion) fila.estado = "Pendiente";
  await actualizarDocumentoEditable(TABLA, convenio.id, fila);

  const nombre = nombreConvenio({ ...convenio, ...datos } as Convenio);
  await registrarAuditoria({
    documentoId: convenio.id,
    tipoDoc: "convenio",
    documentoNombre: nombre,
    actorId: usuario.id,
    accion: enviarAAprobacion ? "envio" : "borrador_actualizado",
    detalle: enviarAAprobacion ? undefined : "Borrador actualizado.",
  });
  // Entrega 20: un borrador enviado después NUNCA avisaba al primer aprobador
  // (la cadena se había insertado cuando el documento aún era Borrador y el
  // trigger no avisa en ese caso).
  if (enviarAAprobacion) {
    await avisarPrimerAprobador({
      tipoDoc: "convenio",
      documentoId: convenio.id,
      documentoNombre: nombre,
      rolPrimeraEtapa: convenio.aprobaciones[0]?.rolRequerido ?? crearCadenaAprobacionConvenio()[0].rolRequerido,
    });
  }
}

/**
 * Corrección (octubre 2026), pedido explícito del usuario: eliminar un
 * borrador sin dejar rastro en auditoría, solo permitido a quien lo creó
 * — ver la nota larga en `eliminarBorradorEvento` (`src/lib/evento.ts`),
 * mismo criterio exacto. `convenio_aprobaciones` se crea desde
 * `crearConvenio` incluso para un Borrador, así que se borra primero —
 * `adendas_convenio_pago_hcp` solo existe para convenios ya aprobados con
 * al menos una firma, así que nunca debería tener filas en un Borrador,
 * pero se limpia igual por si acaso.
 */
export async function eliminarBorradorConvenio(documentoId: string): Promise<void> {
  await eliminarBorradorDocumento("convenio", documentoId);
}

/** Ver nota larga sobre la pantalla admin-only en `eliminarDocumentoFirmadoAdmin` (`src/lib/evento.ts`). */
export async function eliminarDocumentoFirmadoAdmin(documentoId: string): Promise<void> {
  await eliminarDocumentoAdmin("convenio", documentoId);
}

/** Devuelve (suspende y reabre) un Convenio de Pago a HCP Pendiente sin ninguna firma todavía. */
export async function devolverConvenio(convenio: Convenio, usuario: Usuario, motivo: string): Promise<void> {
  if (!puedeDevolverDocumento(convenio.estado, convenio.aprobaciones)) {
    throw new Error("Este convenio no se puede devolver: ya tiene al menos una firma en su cadena de aprobación, o no está pendiente.");
  }
  await devolverDocumento({ tabla: TABLA, tipoDoc: "convenio", documentoId: convenio.id, documentoNombre: nombreConvenio(convenio), motivo, usuario });
}

/** Abre la ventana de enmienda de un Convenio de Pago a HCP Pendiente que ya tiene al menos una firma. */
export async function solicitarEnmiendaConvenio(convenio: Convenio, usuario: Usuario, justificacion: string): Promise<{ expiraEn: string }> {
  if (!(usuario.esAdministrador || usuario.id === convenio.creadoPorId)) {
    throw new Error("Solo quien creó la solicitud (o un administrador) puede pedir una enmienda.");
  }
  if (!puedeSolicitarEnmienda(convenio.estado, convenio.aprobaciones)) {
    throw new Error("Este convenio no requiere una enmienda: todavía no tiene ninguna firma, o ya no está pendiente.");
  }
  return solicitarEnmiendaDocumento({
    tabla: TABLA,
    tipoDoc: "convenio",
    documentoId: convenio.id,
    documentoNombre: nombreConvenio(convenio),
    justificacion,
    usuario,
  });
}

export async function cerrarVentanaEnmiendaConvenio(convenioId: string): Promise<void> {
  await cerrarVentanaEnmiendaDocumento({ tabla: TABLA, documentoId: convenioId });
}

/**
 * Ronda de instrucciones históricas (cluster A, A27): ventana de adenda para
 * un Convenio de Pago a HCP ya Aprobado. A diferencia de Evento — que
 * reutiliza RPCs reales y pre-existentes del proyecto original
 * (`abrir_ventana_adenda_evento`/`cerrar_ventana_adenda_evento`, confirmadas
 * por extracción directa del bundle) — esta es una función NUEVA que la app
 * original nunca tuvo para Convenio de Pago a HCP, así que no hay ninguna
 * RPC real que reconstruir aquí. El esquema real SÍ trae, sin embargo, tanto
 * las columnas `adenda_ventana_*` en `convenios_pago_hcp` como una tabla
 * propia `adendas_convenio_pago_hcp` (id, convenio_id, solicitado_por_id,
 * solicitado_en, justificacion, snapshot_antes, snapshot_despues) — nunca
 * usada por el código hasta ahora —, así que esta implementación se apoya en
 * esa tabla real para llevar el registro histórico y usa `.update()`/
 * `.insert()` directos (el mismo RLS que ya permite a `editarYReenviarConvenio`
 * actualizar la fila directamente aplica aquí) en vez de inventar una RPC
 * nueva que el usuario tendría que desplegar en producción. Regla de
 * vigencia pedida explícitamente por el diagnóstico: la ventana expira a los
 * 7 días de abierta.
 */
const DIAS_VIGENCIA_ADENDA_CONVENIO = 7;

export async function abrirVentanaAdendaConvenio(
  convenio: Convenio,
  justificacion: string,
  usuario: Usuario,
): Promise<{ adendaId: string; expiraEn: string }> {
  const justificacionLimpia = justificacion.trim();
  if (!justificacionLimpia) throw new Error("La justificación de la adenda es obligatoria.");

  const expiraEn = new Date(Date.now() + DIAS_VIGENCIA_ADENDA_CONVENIO * 24 * 60 * 60 * 1000).toISOString();

  const { data: adenda, error: errorAdenda } = await supabase
    .from("adendas_convenio_pago_hcp")
    .insert({
      convenio_id: convenio.id,
      solicitado_por_id: usuario.id,
      justificacion: justificacionLimpia,
      snapshot_antes: convenio,
    })
    .select("id")
    .single();
  if (errorAdenda) throw new Error(mensajeErrorAmigable(errorAdenda));

  const { error: errorVentana } = await supabase
    .from(TABLA)
    .update({
      adenda_ventana_actor_id: usuario.id,
      adenda_ventana_expira_en: expiraEn,
      adenda_ventana_justificacion: justificacionLimpia,
    })
    .eq("id", convenio.id);
  if (errorVentana) throw new Error(mensajeErrorAmigable(errorVentana));

  await registrarAuditoria({
    documentoId: convenio.id,
    tipoDoc: "convenio",
    documentoNombre: nombreConvenio(convenio),
    actorId: usuario.id,
    accion: "adenda_solicitada",
    detalle: justificacionLimpia,
  });

  return { adendaId: adenda.id as string, expiraEn };
}

/**
 * Cierra la ventana de adenda abierta con `abrirVentanaAdendaConvenio`.
 * Se llama después de `editarYReenviarConvenio` (que ya guardó los cambios y
 * reenvió el documento) — `snapshotDespues` es el estado final del convenio,
 * para dejar en `adendas_convenio_pago_hcp` un antes/después completo del
 * ajuste, algo que la RPC real de Evento no expone al cliente pero que aquí
 * sí se puede construir directamente.
 */
export async function cerrarVentanaAdendaConvenio(
  adendaId: string,
  convenioId: string,
  snapshotDespues: Record<string, unknown>,
): Promise<void> {
  const { error: errorAdenda } = await supabase
    .from("adendas_convenio_pago_hcp")
    .update({ snapshot_despues: snapshotDespues })
    .eq("id", adendaId);
  if (errorAdenda) throw new Error(mensajeErrorAmigable(errorAdenda));

  const { error: errorVentana } = await supabase
    .from(TABLA)
    .update({
      adenda_ventana_actor_id: null,
      adenda_ventana_expira_en: null,
      adenda_ventana_justificacion: null,
    })
    .eq("id", convenioId);
  if (errorVentana) throw new Error(mensajeErrorAmigable(errorVentana));
}

export async function anularConvenio(convenio: Convenio, usuario: Usuario, motivo: string): Promise<void> {
  // Octubre 2026: el `update` directo desde el navegador lo filtraba RLS en
  // silencio (sobre todo en documentos Completados) — ver
  // `src/lib/documentosRpc.ts`. El servidor valida que quien anula sea
  // Administrador y que el documento no esté en Borrador (se elimina) ni ya
  // Anulado.
  await anularDocumentoRpc("convenio", convenio.id, motivo);
  await registrarAuditoria({
    documentoId: convenio.id,
    tipoDoc: "convenio",
    documentoNombre: nombreConvenio(convenio),
    actorId: usuario.id,
    accion: "anulacion",
    detalle: motivo,
  });
}

export { nombreConvenio };
