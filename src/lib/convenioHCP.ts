import { congelarFormatoAlPrimerFirma } from "@/lib/congelamiento";
import { tieneAlMenosUnaFirma } from "@/lib/cicloVidaDocumento";
import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";
import { eliminarBorradorDocumento, eliminarDocumentoAdmin, anularDocumentoRpc, actualizarDocumentoEditable } from "@/lib/documentosRpc";
import { rowToFlat, flatToRow, t, s0, n0n, j, b, type FieldSpec, em } from "@/lib/dbMapping";
import { crearCadenaAprobacionConvenioHCP, pasosPreviosAprobados, cadenaCompletamenteAprobada, type PasoAprobacion, idsAprobadoresPrevios } from "@/lib/aprobaciones";
import { registrarAuditoria } from "@/lib/auditoria";
import { notificarResolucionPaso, notificarTareaPendiente, traerUsuariosParaNotificar } from "@/lib/notificaciones";
import { avisarPrimerAprobador, insertarCadenaOReversar, pasarAPendienteOReversar } from "@/lib/envioAprobacion";
import { avisarEnvioConvenioHCPFirmado } from "@/lib/tareasEscalonadas";
import { traerVersionVigentePlantilla, sustituirEmpresaEnPlantilla } from "@/lib/plantillaConvenioHCP";
import { existeCafParaEvento, puedeFirmarConvenioHCPGerenciaGeneral } from "@/lib/reglasDependenciaDocumentos";
import {
  devolverDocumento,
  solicitarEnmiendaDocumento,
  cerrarVentanaEnmiendaDocumento,
  puedeDevolverDocumento,
  puedeSolicitarEnmienda,
} from "@/lib/cicloVidaDocumento";
import type { ConvenioHcp, Usuario } from "@/types";

const TABLA = "convenios_hcp";
const TABLA_APROBACIONES = "convenio_hcp_aprobaciones";

const CAMPOS_CONVENIO_HCP: FieldSpec[] = [
  t("id"),
  t("estado"),
  t("creado_por_id", "creadoPorId"),
  t("creado_en", "creadoEn"),
  t("evento_origen_id", "eventoOrigenId"),
  t("caf_id", "cafId"),
  s0("speaker_id", "speakerId"),
  b("elaborado_en_contratos_corporativo", "elaboradoEnContratosCorporativo"),
  t("consultor_nombre", "consultorNombre"),
  t("consultor_identificacion", "consultorIdentificacion"),
  t("consultor_credenciales", "consultorCredenciales"),
  t("consultor_direccion", "consultorDireccion"),
  em("consultor_email", "consultorEmail"),
  t("compania_nombre", "companiaNombre"),
  s0("fecha_efectiva", "fechaEfectiva"),
  t("objetivo_consultoria", "objetivoConsultoria"),
  t("objetivo_consultoria_en", "objetivoConsultoriaEn"),
  t("servicios_exhibit_a", "serviciosExhibitA"),
  t("servicios_exhibit_a_en", "serviciosExhibitAEn"),
  n0n("compensacion"),
  t("moneda"),
  n0n("plazo_pago_dias", "plazoPagoDias"),
  t("comentarios_pago", "comentariosPago"),
  t("comentarios_pago_en", "comentariosPagoEn"),
  t("nombre_director_general", "nombreDirectorGeneral"),
  t("clausulas_ajustadas", "clausulasAjustadas"),
  t("cierre_es", "cierreEs"),
  t("cierre_en", "cierreEn"),
  s0("archivo_para_hcp_enviado_en", "archivoParaHCPEnviadoEn"),
  s0("archivo_firmado_hcp_id", "archivoFirmadoHCPId"),
  s0("motivo_anulacion", "motivoAnulacion"),
  s0("anulado_por_id", "anuladoPorId"),
  s0("anulado_en", "anuladoEn"),
  s0("adenda_ventana_actor_id", "adendaVentanaActorId"),
  s0("adenda_ventana_expira_en", "adendaVentanaExpiraEn"),
  s0("adenda_ventana_justificacion", "adendaVentanaJustificacion"),
  s0("plantilla_version_id", "plantillaVersionId"),
  j("clausulado_snapshot", null, "clausuladoSnapshot"),
  j("campos_personalizados", {}, "camposPersonalizados"),
  // Snapshot congelado por trigger al pasar a Aprobado/Completado — ver
  // `db/agregar_inmutabilidad_documentos_firmados.sql`. Solo lectura desde
  // el front-end (lo escribe el trigger, no un `crear*`/`editar*` — por eso
  // NO se agrega a `CAMPOS_EDITABLES_CONVENIO_HCP` más abajo).
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

function nombreConvenioHCP(convenio: Pick<ConvenioHcp, "consultorNombre" | "companiaNombre">): string {
  return `Convenio HCP — ${convenio.consultorNombre || "sin consultor"} / ${convenio.companiaNombre || "sin compañía"}`;
}

export async function traerConveniosHCP(): Promise<ConvenioHcp[]> {
  const [{ data: filas, error: errorFilas }, { data: pasos, error: errorPasos }, { data: ajustes, error: errorAjustes }] = await Promise.all([
    supabase.from(TABLA).select("*").order("creado_en", { ascending: false }),
    supabase.from(TABLA_APROBACIONES).select("*").order("orden", { ascending: true }),
    supabase.from("convenio_hcp_ajustes_clausula").select("*").order("creado_en", { ascending: true }),
  ]);
  if (errorFilas) throw new Error(mensajeErrorAmigable(errorFilas));
  if (errorPasos) throw new Error(mensajeErrorAmigable(errorPasos));
  if (errorAjustes) throw new Error(mensajeErrorAmigable(errorAjustes));

  const pasosPorConvenio = new Map<string, PasoAprobacion[]>();
  for (const fila of pasos ?? []) {
    const lista = pasosPorConvenio.get(fila.convenio_hcp_id as string) ?? [];
    lista.push(filaAPaso(fila));
    pasosPorConvenio.set(fila.convenio_hcp_id as string, lista);
  }
  const ajustesPorConvenio = new Map<string, ConvenioHcp["ajustesClausula"]>();
  for (const fila of ajustes ?? []) {
    const lista = ajustesPorConvenio.get(fila.convenio_hcp_id as string) ?? [];
    lista.push({
      id: fila.id,
      convenioHcpId: fila.convenio_hcp_id,
      seccion: fila.seccion,
      textoEn: fila.texto_en,
      textoEs: fila.texto_es,
      justificacion: fila.justificacion,
      creadoPorId: fila.creado_por_id,
      creadoEn: fila.creado_en,
    });
    ajustesPorConvenio.set(fila.convenio_hcp_id as string, lista);
  }

  return (filas ?? []).map((fila) => ({
    ...rowToFlat<ConvenioHcp>(fila, CAMPOS_CONVENIO_HCP),
    tipoDoc: "convenioHCP" as const,
    aprobaciones: pasosPorConvenio.get(fila.id as string) ?? [],
    ajustesClausula: ajustesPorConvenio.get(fila.id as string) ?? [],
  }));
}

export async function crearConvenioHCP(
  datos: Omit<
    ConvenioHcp,
    "id" | "tipoDoc" | "estado" | "creadoPorId" | "creadoEn" | "aprobaciones" | "ajustesClausula" | "motivoAnulacion" | "anuladoPorId" | "anuladoEn" | "adendaVentanaActorId" | "adendaVentanaExpiraEn" | "adendaVentanaJustificacion" | "plantillaVersionId" | "clausuladoSnapshot" | "archivoParaHCPEnviadoEn" | "archivoFirmadoHCPId"
  >,
  usuario: Usuario,
  guardarComoBorrador: boolean,
): Promise<ConvenioHcp> {
  const corporativo = Boolean(datos.elaboradoEnContratosCorporativo);
  // Entrega 32: un convenio elaborado en el aplicativo corporativo no usa la plantilla legal de BEATS
  // (el clausulado vive en el otro sistema), así que no se exige que haya una versión publicada.
  const plantillaVigente = corporativo ? null : await traerVersionVigentePlantilla();
  if (!corporativo && !plantillaVigente) {
    throw new Error("Todavía no hay una plantilla legal publicada para el Convenio HCP. Un administrador debe publicar una versión primero.");
  }
  // Ronda de ajustes de formularios (septiembre 2026), entrega 3: "para que
  // se pueda crear el convenio HCP ya tiene que existir un CAF (aunque este
  // no necesariamente tiene que estar aprobado/firmado; puede estar en
  // flujo de aprobación)" — pedido explícito, se exige incluso para guardar
  // como borrador. Misma regla para el convenio corporativo.
  const hayCaf = await existeCafParaEvento(datos.eventoOrigenId);
  if (!hayCaf) {
    throw new Error("No se puede crear el Convenio HCP: todavía no existe un CAF para este evento.");
  }

  const fila = flatToRow(datos as unknown as Record<string, unknown>, CAMPOS_CONVENIO_HCP);
  // La columna nueva solo viaja cuando es verdadera: crear un convenio normal sigue funcionando aunque la
  // migración `db/entrega_32_convenio_hcp_corporativo.sql` todavía no se haya ejecutado.
  if (!corporativo) delete fila.elaborado_en_contratos_corporativo;
  // Entrega 20: SIEMPRE se inserta como Borrador; pasa a "Pendiente" después de
  // crear la cadena (ver `src/lib/envioAprobacion.ts`). Entrega 32: el corporativo no tiene cadena y,
  // al enviarlo, se registra directamente como «Aprobado» (igual que el CAF corporativo).
  fila.estado = corporativo && !guardarComoBorrador ? "Aprobado" : "Borrador";
  fila.creado_por_id = usuario.id;
  fila.creado_en = new Date().toISOString();
  if (plantillaVigente) {
    fila.plantilla_version_id = plantillaVigente.id;
    fila.clausulado_snapshot = sustituirEmpresaEnPlantilla(plantillaVigente, datos.companiaNombre);
  } else {
    delete fila.plantilla_version_id;
    delete fila.clausulado_snapshot;
  }

  const { data: creado, error } = await supabase.from(TABLA).insert(fila).select("*").single();
  if (error) {
    if (corporativo && /elaborado_en_contratos_corporativo/i.test(`${error.message ?? ""} ${error.details ?? ""}`)) {
      throw new Error("Falta ejecutar la migración db/entrega_32_convenio_hcp_corporativo.sql en Supabase para registrar convenios del aplicativo corporativo.");
    }
    throw new Error(`No se pudo crear el Convenio HCP: ${mensajeErrorAmigable(error)}`);
  }

  if (corporativo) {
    const plano: ConvenioHcp = { ...rowToFlat<ConvenioHcp>(creado, CAMPOS_CONVENIO_HCP), tipoDoc: "convenioHCP", aprobaciones: [], ajustesClausula: [] };
    await registrarAuditoria({
      documentoId: plano.id,
      tipoDoc: "convenioHCP",
      documentoNombre: nombreConvenioHCP(plano),
      actorId: usuario.id,
      accion: "creacion",
      detalle: guardarComoBorrador
        ? "Convenio HCP guardado como borrador (se elaborará en el aplicativo corporativo de contratos)."
        : "Convenio HCP registrado como elaborado en el aplicativo corporativo de contratos (sin cadena de aprobación en BEATS).",
    });
    return plano;
  }

  const cadena = crearCadenaAprobacionConvenioHCP();
  await insertarCadenaOReversar({
    tipoDoc: "convenioHCP",
    tabla: TABLA,
    tablaAprobaciones: TABLA_APROBACIONES,
    columnaFk: "convenio_hcp_id",
    documentoId: creado.id as string,
    accion: "No se pudo crear el Convenio HCP",
    filas: cadena.map((paso) => ({
      convenio_hcp_id: creado.id,
      orden: paso.orden,
      etiqueta: paso.etiqueta,
      rol_requerido: paso.rolRequerido,
      estado: paso.estado,
      pendiente_desde: paso.pendienteDesde,
    })),
  });
  if (!guardarComoBorrador) {
    await pasarAPendienteOReversar({
      tipoDoc: "convenioHCP",
      tabla: TABLA,
      tablaAprobaciones: TABLA_APROBACIONES,
      columnaFk: "convenio_hcp_id",
      documentoId: creado.id as string,
      accion: "No se pudo crear el Convenio HCP",
    });
    creado.estado = "Pendiente";
  }

  const plano: ConvenioHcp = {
    ...rowToFlat<ConvenioHcp>(creado, CAMPOS_CONVENIO_HCP),
    tipoDoc: "convenioHCP",
    aprobaciones: cadena,
    ajustesClausula: [],
  };

  await registrarAuditoria({
    documentoId: plano.id,
    tipoDoc: "convenioHCP",
    documentoNombre: nombreConvenioHCP(plano),
    actorId: usuario.id,
    accion: "creacion",
    detalle: guardarComoBorrador ? "Convenio HCP guardado como borrador." : "Convenio HCP creado y enviado a aprobación.",
  });
  if (!guardarComoBorrador) {
    await registrarAuditoria({
      documentoId: plano.id,
      tipoDoc: "convenioHCP",
      documentoNombre: nombreConvenioHCP(plano),
      actorId: usuario.id,
      accion: "envio",
    });
    // Entrega 20: el aviso al primer aprobador lo hace la aplicación (no el
    // trigger de base de datos) — ver `avisarPrimerAprobador`.
    await avisarPrimerAprobador({
      tipoDoc: "convenioHCP",
      documentoId: plano.id,
      documentoNombre: nombreConvenioHCP(plano),
      rolPrimeraEtapa: cadena[0].rolRequerido,
    });
  }

  return plano;
}

/**
 * Igual que CAF y Convenio, la resolución pasa por RPC
 * (`resolver_aprobacion_convenio_hcp`) — confirmado por extracción directa
 * del bundle original.
 */
export async function resolverPasoConvenioHCP(
  convenio: ConvenioHcp,
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
  // Ronda de ajustes de formularios (septiembre 2026), entrega 3: "para que
  // el rol de Gerente General pueda firmar el convenio HCP, el CAF debe
  // estar aprobado en su totalidad y el rol Legal/Compliance debe haber
  // dado el aval" — pedido explícito, solo aplica a la resolución en
  // "aprobado" de esa etapa puntual (un rechazo siempre se permite).
  if (decision === "aprobado" && paso.rolRequerido === "gerencia_general") {
    // Entrega 23: el Visto Bueno ahora lo da `legal`; `legal_compliance` queda por los convenios antiguos.
    const legalYaAprobo = convenio.aprobaciones.some((p) => (p.rolRequerido === "legal" || p.rolRequerido === "legal_compliance") && p.estado === "aprobado");
    const puedeFirmar = await puedeFirmarConvenioHCPGerenciaGeneral(convenio.eventoOrigenId, legalYaAprobo);
    if (!puedeFirmar) {
      throw new Error("Gerencia General / Rep. Legal no puede firmar todavía: el CAF debe estar aprobado en su totalidad y Legal/Compliance debe haber dado su aval.");
    }
  }

  const { error } = await supabase.rpc("resolver_aprobacion_convenio_hcp", {
    p_convenio_hcp_id: convenio.id,
    p_orden: paso.orden,
    p_accion: decision,
    p_comentario: comentario.trim() || null,
  });
  if (error) throw new Error(error.message);
  // Entrega 22: desde la PRIMERA firma el formato (etiquetas y campos) queda congelado.
  if (decision === "aprobado" && !tieneAlMenosUnaFirma(convenio.aprobaciones)) {
    await congelarFormatoAlPrimerFirma({ tabla: "convenios_hcp", tipoDoc: "convenioHCP", documentoId: convenio.id, eventoOrigenId: convenio.eventoOrigenId, });
  }

  const usuariosConRol = await traerUsuariosParaNotificar().catch(() => []);

  if (decision === "rechazado") {
    await registrarAuditoria({
      documentoId: convenio.id,
      tipoDoc: "convenioHCP",
      documentoNombre: nombreConvenioHCP(convenio),
      actorId: usuario.id,
      accion: "rechazo",
      detalle: `Rechazado en la etapa "${paso.etiqueta}". ${comentario}`.trim(),
    });
    await notificarResolucionPaso({
      tipoDoc: "convenioHCP",
      documentoId: convenio.id,
      documentoNombre: nombreConvenioHCP(convenio),
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
    tipoDoc: "convenioHCP",
    documentoNombre: nombreConvenioHCP(convenio),
    actorId: usuario.id,
    accion: esFinal ? "aprobacion_final" : "aprobacion_parcial",
    detalle: `Etapa "${paso.etiqueta}" aprobada.${comentario ? ` ${comentario}` : ""}`,
  });
  await notificarResolucionPaso({
    tipoDoc: "convenioHCP",
    documentoId: convenio.id,
    documentoNombre: nombreConvenioHCP(convenio),
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
  // Entrega 28: al firmar Gerencia General / Rep. Legal (última etapa), Dirección Médica recibe la tarea de enviar el
  // convenio firmado al HCP.
  if (esFinal && paso.rolRequerido === "gerencia_general") {
    await avisarEnvioConvenioHCPFirmado({
      convenioId: convenio.id,
      consultorNombre: convenio.consultorNombre,
      eventoOrigenId: convenio.eventoOrigenId,
    });
  }
}

/**
 * Ronda de instrucciones históricas (cluster A, A27): "editar y reenviar" un
 * Convenio HCP rechazado, o guardar los cambios hechos durante una ventana
 * de adenda ya abierta (`abrirVentanaAdendaConvenioHCP`). Esta función NO
 * existía en ninguna fase anterior — a diferencia de CAF/Convenio/Evento, el
 * Convenio HCP nunca tuvo forma de corregir y reenviar un documento
 * rechazado. Sigue el mismo patrón que `editarYReenviarConvenio`: `.update()`
 * directo con `estado: "Pendiente"`, nunca toca `convenio_hcp_aprobaciones`
 * (eso exige RPC, igual que resolver una etapa), y un aviso manual al primer
 * aprobador porque el trigger de reinicio de cadena
 * (`fn_notificar_primera_etapa_convenio_hcp`) solo dispara por INSERT.
 *
 * OJO — diferencia deliberada con `editarYReenviarConvenio`: aquí NO se usa
 * `flatToRow(datos, CAMPOS_CONVENIO_HCP)` a secas. `flatToRow` escribe un
 * valor para CADA FieldSpec de la lista que se le pase (el default de ese
 * tipo si la clave no viene en `datos`), y `CAMPOS_CONVENIO_HCP` incluye
 * columnas legalmente sensibles que `FormularioConvenioHCP` nunca expone
 * (`plantilla_version_id`, `clausulado_snapshot`, el archivo firmado por el
 * HCP...). Usar la lista completa borraría el clausulado legal fijo del
 * contrato en cada edición. Por eso se define `CAMPOS_EDITABLES_CONVENIO_HCP`
 * con exactamente los campos que expone el formulario de edición — todo lo
 * demás de la fila queda intacto.
 */
const CAMPOS_EDITABLES_CONVENIO_HCP: FieldSpec[] = [
  t("evento_origen_id", "eventoOrigenId"),
  t("caf_id", "cafId"),
  s0("speaker_id", "speakerId"),
  t("consultor_nombre", "consultorNombre"),
  t("consultor_identificacion", "consultorIdentificacion"),
  t("consultor_credenciales", "consultorCredenciales"),
  t("consultor_direccion", "consultorDireccion"),
  em("consultor_email", "consultorEmail"),
  t("compania_nombre", "companiaNombre"),
  s0("fecha_efectiva", "fechaEfectiva"),
  t("objetivo_consultoria", "objetivoConsultoria"),
  t("objetivo_consultoria_en", "objetivoConsultoriaEn"),
  t("servicios_exhibit_a", "serviciosExhibitA"),
  t("servicios_exhibit_a_en", "serviciosExhibitAEn"),
  n0n("compensacion"),
  t("moneda"),
  n0n("plazo_pago_dias", "plazoPagoDias"),
  t("comentarios_pago", "comentariosPago"),
  t("comentarios_pago_en", "comentariosPagoEn"),
  t("nombre_director_general", "nombreDirectorGeneral"),
  t("clausulas_ajustadas", "clausulasAjustadas"),
  t("cierre_es", "cierreEs"),
  t("cierre_en", "cierreEn"),
  j("campos_personalizados", {}, "camposPersonalizados"),
];

export async function editarYReenviarConvenioHCP(
  convenio: ConvenioHcp,
  datos: Partial<ConvenioHcp>,
  usuario: Usuario,
): Promise<void> {
  const fila = flatToRow(datos as Record<string, unknown>, CAMPOS_EDITABLES_CONVENIO_HCP);
  fila.estado = "Pendiente";
  const { error } = await supabase.from(TABLA).update(fila).eq("id", convenio.id);
  if (error) throw new Error(mensajeErrorAmigable(error));

  await registrarAuditoria({
    documentoId: convenio.id,
    tipoDoc: "convenioHCP",
    documentoNombre: nombreConvenioHCP({ ...convenio, ...datos } as ConvenioHcp),
    actorId: usuario.id,
    accion: "edicion_reenvio",
  });
  // Igual que editarYReenviarConvenio: el reinicio de
  // convenio_hcp_aprobaciones es un UPDATE, no un INSERT, así que el trigger
  // de la primera etapa no se dispara solo — este SÍ es el único aviso
  // posible para el primer aprobador.
  const primerPaso = convenio.aprobaciones[0];
  if (primerPaso) {
    const usuariosConRol = await traerUsuariosParaNotificar().catch(() => []);
    await notificarTareaPendiente({
      tipoDoc: "convenioHCP",
      documentoId: convenio.id,
      documentoNombre: nombreConvenioHCP({ ...convenio, ...datos } as ConvenioHcp),
      rolRequerido: primerPaso.rolRequerido,
      usuariosConRol,
    });
  }
}

/**
 * Guarda cambios sobre un Convenio HCP todavía en Borrador o Devuelto —
 * repetible las veces que haga falta antes de enviarlo a aprobación. Usa el
 * mismo subconjunto `CAMPOS_EDITABLES_CONVENIO_HCP` que
 * `editarYReenviarConvenioHCP` (nunca `CAMPOS_CONVENIO_HCP` completo) por la
 * misma razón ya documentada ahí: el clausulado legal versionado
 * (`plantillaVersionId`/`clausuladoSnapshot`) es un snapshot congelado que
 * ningún flujo de edición debe poder pisar.
 */
export async function editarBorradorConvenioHCP(
  convenio: ConvenioHcp,
  datos: Partial<ConvenioHcp>,
  usuario: Usuario,
  enviarAAprobacion: boolean,
): Promise<void> {
  const fila = flatToRow(datos as Record<string, unknown>, CAMPOS_EDITABLES_CONVENIO_HCP);
  // Octubre 2026, pedido explícito: MIENTRAS SEA BORRADOR se puede reversar la decisión de dónde se elabora
  // (aplicativo corporativo ↔ BEATS). Un borrador de BEATS tiene cadena de aprobación y texto legal congelado; uno
  // corporativo no los tiene, así que el cambio los crea o los retira para que el documento quede coherente.
  const corporativoAntes = Boolean(convenio.elaboradoEnContratosCorporativo);
  const corporativo = Boolean(datos.elaboradoEnContratosCorporativo ?? corporativoAntes);
  const cambioModalidad = corporativo !== corporativoAntes;
  if (cambioModalidad && convenio.estado !== "Borrador") {
    throw new Error("La modalidad (BEATS o aplicativo corporativo) solo se puede cambiar mientras el Convenio HCP es un borrador.");
  }
  const aBeats = cambioModalidad && !corporativo;
  if (cambioModalidad) {
    fila.elaborado_en_contratos_corporativo = corporativo;
    if (aBeats) {
      const plantillaVigente = await traerVersionVigentePlantilla();
      if (!plantillaVigente) {
        throw new Error("Todavía no hay una plantilla legal publicada para el Convenio HCP. Un administrador debe publicar una versión primero.");
      }
      fila.plantilla_version_id = plantillaVigente.id;
      fila.clausulado_snapshot = sustituirEmpresaEnPlantilla(plantillaVigente, datos.companiaNombre ?? convenio.companiaNombre);
    } else {
      fila.plantilla_version_id = null;
      fila.clausulado_snapshot = null;
    }
  }
  // Corporativo: sin cadena ni notificaciones, «enviar» lo deja Aprobado.
  // Al pasar a BEATS el estado cambia DESPUÉS de crear la cadena (ver más abajo).
  if (enviarAAprobacion && !aBeats) fila.estado = corporativo ? "Aprobado" : "Pendiente";
  await actualizarDocumentoEditable(TABLA, convenio.id, fila);

  if (cambioModalidad) {
    if (aBeats) {
      // Corporativo → BEATS: el borrador no tenía cadena; se crea (con el documento aún en Borrador, el trigger de aviso no actúa).
      const { data: existentes } = await supabase.from(TABLA_APROBACIONES).select("id").eq("convenio_hcp_id", convenio.id).limit(1);
      if (!existentes || existentes.length === 0) {
        const { error: errorCadena } = await supabase.from(TABLA_APROBACIONES).insert(
          crearCadenaAprobacionConvenioHCP().map((paso) => ({
            convenio_hcp_id: convenio.id,
            orden: paso.orden,
            etiqueta: paso.etiqueta,
            rol_requerido: paso.rolRequerido,
            estado: paso.estado,
            pendiente_desde: paso.pendienteDesde,
          })),
        );
        if (errorCadena) throw new Error(`Se cambió a BEATS, pero no se pudo crear la cadena de aprobación: ${mensajeErrorAmigable(errorCadena)}`);
      }
      if (enviarAAprobacion) await actualizarDocumentoEditable(TABLA, convenio.id, { estado: "Pendiente" });
    } else {
      // BEATS → corporativo: se retira la cadena (todas las etapas siguen pendientes porque es un borrador).
      const { error: errorRetiro } = await supabase.from(TABLA_APROBACIONES).delete().eq("convenio_hcp_id", convenio.id);
      if (errorRetiro) console.warn("No se pudo retirar la cadena de aprobación del borrador:", errorRetiro.message);
    }
  }

  const nombre = nombreConvenioHCP({ ...convenio, ...datos } as ConvenioHcp);
  await registrarAuditoria({
    documentoId: convenio.id,
    tipoDoc: "convenioHCP",
    documentoNombre: nombre,
    actorId: usuario.id,
    accion: enviarAAprobacion ? "envio" : "borrador_actualizado",
    detalle: enviarAAprobacion
      ? undefined
      : cambioModalidad
        ? `Borrador actualizado. Modalidad cambiada: ahora se ${corporativo ? "elaborará en el aplicativo corporativo de contratos" : "elabora en BEATS"}.`
        : "Borrador actualizado.",
  });
  // Entrega 20: un borrador enviado después nunca avisaba al primer aprobador.
  if (enviarAAprobacion && !corporativo) {
    await avisarPrimerAprobador({
      tipoDoc: "convenioHCP",
      documentoId: convenio.id,
      documentoNombre: nombre,
      rolPrimeraEtapa: convenio.aprobaciones[0]?.rolRequerido ?? crearCadenaAprobacionConvenioHCP()[0].rolRequerido,
    });
  }
}

/**
 * Corrección (octubre 2026), pedido explícito del usuario: eliminar un
 * borrador sin dejar rastro en auditoría, solo permitido a quien lo creó
 * — ver la nota larga en `eliminarBorradorEvento` (`src/lib/evento.ts`),
 * mismo criterio exacto. `convenio_hcp_aprobaciones` se crea desde
 * `crearConvenioHCP` incluso para un Borrador, así que se borra primero —
 * `convenio_hcp_ajustes_clausula` solo aplica a convenios ya firmados,
 * pero se limpia igual por si acaso.
 */
export async function eliminarBorradorConvenioHCP(documentoId: string): Promise<void> {
  await eliminarBorradorDocumento("convenioHCP", documentoId);
}

/** Ver nota larga sobre la pantalla admin-only en `eliminarDocumentoFirmadoAdmin` (`src/lib/evento.ts`). */
export async function eliminarDocumentoFirmadoAdmin(documentoId: string): Promise<void> {
  await eliminarDocumentoAdmin("convenioHCP", documentoId);
}

/** Devuelve (suspende y reabre) un Convenio HCP Pendiente sin ninguna firma todavía. */
export async function devolverConvenioHCP(convenio: ConvenioHcp, usuario: Usuario, motivo: string): Promise<void> {
  if (!puedeDevolverDocumento(convenio.estado, convenio.aprobaciones)) {
    throw new Error("Este Convenio HCP no se puede devolver: ya tiene al menos una firma en su cadena de aprobación, o no está pendiente.");
  }
  await devolverDocumento({
    tabla: TABLA,
    tipoDoc: "convenioHCP",
    documentoId: convenio.id,
    documentoNombre: nombreConvenioHCP(convenio),
    motivo,
    usuario,
  });
}

/** Abre la ventana de enmienda de un Convenio HCP Pendiente que ya tiene al menos una firma. */
export async function solicitarEnmiendaConvenioHCP(
  convenio: ConvenioHcp,
  usuario: Usuario,
  justificacion: string,
): Promise<{ expiraEn: string }> {
  if (!(usuario.esAdministrador || usuario.id === convenio.creadoPorId)) {
    throw new Error("Solo quien creó la solicitud (o un administrador) puede pedir una enmienda.");
  }
  if (!puedeSolicitarEnmienda(convenio.estado, convenio.aprobaciones)) {
    throw new Error("Este Convenio HCP no requiere una enmienda: todavía no tiene ninguna firma, o ya no está pendiente.");
  }
  return solicitarEnmiendaDocumento({
    tabla: TABLA,
    tipoDoc: "convenioHCP",
    documentoId: convenio.id,
    documentoNombre: nombreConvenioHCP(convenio),
    justificacion,
    usuario,
  });
}

export async function cerrarVentanaEnmiendaConvenioHCP(convenioId: string): Promise<void> {
  await cerrarVentanaEnmiendaDocumento({ tabla: TABLA, documentoId: convenioId });
}

/**
 * Ventana de adenda para Convenio HCP: a diferencia de Convenio de Pago a
 * HCP, el esquema real NO trae ninguna tabla `adendas_convenio_hcp` — solo
 * las columnas `adenda_ventana_*` ya declaradas en `convenios_hcp`. Sin una
 * tabla de historial dedicada, el rastro persistente de la adenda queda en
 * el log general de auditoría (`registrarAuditoria`, acción
 * "adenda_solicitada" al abrir + "edicion_reenvio" al guardar, ambas ya
 * parte del catálogo real `tipo_accion_auditoria`). Misma regla de vigencia
 * de 7 días que Convenio de Pago a HCP.
 */
const DIAS_VIGENCIA_ADENDA_CONVENIO_HCP = 7;

export async function abrirVentanaAdendaConvenioHCP(
  convenio: ConvenioHcp,
  justificacion: string,
  usuario: Usuario,
): Promise<{ expiraEn: string }> {
  const justificacionLimpia = justificacion.trim();
  if (!justificacionLimpia) throw new Error("La justificación de la adenda es obligatoria.");

  const expiraEn = new Date(Date.now() + DIAS_VIGENCIA_ADENDA_CONVENIO_HCP * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from(TABLA)
    .update({
      adenda_ventana_actor_id: usuario.id,
      adenda_ventana_expira_en: expiraEn,
      adenda_ventana_justificacion: justificacionLimpia,
    })
    .eq("id", convenio.id);
  if (error) throw new Error(mensajeErrorAmigable(error));

  await registrarAuditoria({
    documentoId: convenio.id,
    tipoDoc: "convenioHCP",
    documentoNombre: nombreConvenioHCP(convenio),
    actorId: usuario.id,
    accion: "adenda_solicitada",
    detalle: justificacionLimpia,
  });

  return { expiraEn };
}

export async function cerrarVentanaAdendaConvenioHCP(convenioId: string): Promise<void> {
  const { error } = await supabase
    .from(TABLA)
    .update({
      adenda_ventana_actor_id: null,
      adenda_ventana_expira_en: null,
      adenda_ventana_justificacion: null,
    })
    .eq("id", convenioId);
  if (error) throw new Error(mensajeErrorAmigable(error));
}

export async function anularConvenioHCP(convenio: ConvenioHcp, usuario: Usuario, motivo: string): Promise<void> {
  // Octubre 2026: el `update` directo desde el navegador lo filtraba RLS en
  // silencio (sobre todo en documentos Completados) — ver
  // `src/lib/documentosRpc.ts`. El servidor valida que quien anula sea
  // Administrador y que el documento no esté en Borrador (se elimina) ni ya
  // Anulado.
  await anularDocumentoRpc("convenioHCP", convenio.id, motivo);
  await registrarAuditoria({
    documentoId: convenio.id,
    tipoDoc: "convenioHCP",
    documentoNombre: nombreConvenioHCP(convenio),
    actorId: usuario.id,
    accion: "anulacion",
    detalle: motivo,
  });
}

/**
 * Fase 1 (infraestructura de archivos, septiembre 2026): guarda el id de la
 * copia firmada por el HCP (`archivos_adjuntos`) una vez cargada. El envío
 * del documento AL HCP por correo (`archivoParaHCPEnviadoEn`) sigue fuera de
 * alcance — depende de la Fase 2 (notificaciones reales por correo) — así
 * que por ahora esto solo cubre la carga manual de la copia ya firmada,
 * recibida por otro medio.
 */
export async function guardarArchivoFirmadoConvenioHCP(convenioId: string, archivoId: string | null): Promise<void> {
  // Entrega 29. Antes: `update` directo SIN verificar filas. Sobre un convenio ya Aprobado, Row Level Security
  // filtra el UPDATE en silencio (0 filas, sin error): la app avisaba «cargada» pero nada se guardaba, y al
  // releer el convenio el cuadro de adjuntar seguía vacío. Ahora: (1) función del servidor (security definer);
  // (2) si aún no está desplegada, `update` directo pero verificando que cambió una fila.
  const { error: errorRpc } = await supabase.rpc("beats_guardar_archivo_firmado_convenio_hcp", {
    p_convenio_id: convenioId,
    p_archivo_id: archivoId,
  });
  if (!errorRpc) return;
  const funcionNoDesplegada = errorRpc.code === "PGRST202" || /could not find the function/i.test(errorRpc.message ?? "");
  if (!funcionNoDesplegada) throw new Error(mensajeErrorAmigable(errorRpc));
  const { data, error } = await supabase.from(TABLA).update({ archivo_firmado_hcp_id: archivoId }).eq("id", convenioId).select("id");
  if (error) throw new Error(mensajeErrorAmigable(error));
  if (!data || data.length === 0) {
    throw new Error(
      "No se pudo guardar la copia firmada: la base de datos no permitió el cambio (permisos). Falta aplicar db/entrega_29_archivo_firmado_convenio_hcp.sql en Supabase; pídele a quien administra Supabase que la ejecute.",
    );
  }
}

/**
 * AJUSTES (septiembre/octubre 2026), pedido explícito: ahora que el envío
 * por correo al HCP sí está implementado (`EnviarDocumentoDialog` →
 * `lib/enviosDocumentos.ts` → Edge Function `send-email`), esta función
 * por fin llena la columna `archivo_para_hcp_enviado_en` que existía desde
 * la Fase 1 pero nunca se usaba (ver el comentario de
 * `guardarArchivoFirmadoConvenioHCP`, arriba).
 */
export async function marcarArchivoEnviadoHCP(convenioId: string): Promise<void> {
  // Octubre 2026: la tarea «Enviar el convenio firmado al HCP» seguía apareciendo aunque el convenio ya se había enviado.
  // Causa probable: sobre un convenio Aprobado el UPDATE directo lo filtra Row Level Security sin error (0 filas).
  // Ahora: (1) función del servidor (db/agregar_rpc_marcar_convenio_hcp_enviado.sql); (2) si aún no está desplegada,
  // UPDATE directo pero verificando que cambió una fila; (3) solo se registra el PRIMER envío (no se sobrescribe).
  const { error: errorRpc } = await supabase.rpc("beats_marcar_convenio_hcp_enviado", { p_convenio_id: convenioId });
  if (!errorRpc) return;
  const funcionNoDesplegada = errorRpc.code === "PGRST202" || /could not find the function/i.test(errorRpc.message ?? "");
  if (!funcionNoDesplegada) throw new Error(mensajeErrorAmigable(errorRpc));
  const { data, error } = await supabase
    .from(TABLA)
    .update({ archivo_para_hcp_enviado_en: new Date().toISOString() })
    .eq("id", convenioId)
    .is("archivo_para_hcp_enviado_en", null)
    .select("id");
  if (error) throw new Error(mensajeErrorAmigable(error));
  if (!data || data.length === 0) {
    // 0 filas: o ya tenía fecha de envío (correcto) o la base de datos bloqueó el cambio. Se distingue releyendo.
    const { data: fila } = await supabase.from(TABLA).select("archivo_para_hcp_enviado_en").eq("id", convenioId).maybeSingle();
    if (!fila?.archivo_para_hcp_enviado_en) {
      throw new Error(
        "El correo se envió, pero la base de datos no permitió registrar la fecha de envío (permisos). Falta aplicar db/agregar_rpc_marcar_convenio_hcp_enviado.sql en Supabase; mientras tanto la tarea se cierra según la bitácora de envíos.",
      );
    }
  }
}

/**
 * AJUSTES (septiembre/octubre 2026), pedido explícito: "en el sistema,
 * sección repositorio del evento específico, debe estar habilitado un
 * espacio para la carga del archivo de convenio final... aplicable para
 * todos los speakers involucrados en el evento." Reutiliza el campo que ya
 * existe (`archivo_firmado_hcp_id`, cargado desde `DetalleConvenioHCP` vía
 * `guardarArchivoFirmadoConvenioHCP`) en vez de crear una columna nueva —
 * esta función solo trae el resumen mínimo (sin pasos de aprobación ni
 * cláusulas) para listar, por speaker, el convenio y su copia final firmada
 * dentro de `RepositorioEvento.tsx`.
 */
export interface ResumenConvenioHCPEvento {
  id: string;
  consultorNombre: string;
  /** Correo del HCP — destinatario por defecto del envío para firma desde el Expediente. */
  consultorEmail: string;
  speakerId: string | null;
  estado: ConvenioHcp["estado"];
  archivoFirmadoHCPId: string | null;
  /** Cuándo se envió al HCP la versión aprobada para su firma (`null` = todavía no enviada). */
  archivoParaHCPEnviadoEn: string | null;
  /** Entrega 32: elaborado en el aplicativo corporativo de contratos (no hay documento de BEATS que enviar). */
  elaboradoEnContratosCorporativo: boolean;
}

export async function traerResumenConveniosHCPPorEvento(eventoId: string): Promise<ResumenConvenioHCPEvento[]> {
  const { data, error } = await supabase
    .from(TABLA)
    .select("*")
    .eq("evento_origen_id", eventoId)
    .neq("estado", "Anulado")
    .order("creado_en", { ascending: true });
  if (error) throw new Error(mensajeErrorAmigable(error));
  return (data ?? []).map((fila) => ({
    id: fila.id as string,
    consultorNombre: (fila.consultor_nombre as string) ?? "",
    consultorEmail: (fila.consultor_email as string) ?? "",
    speakerId: (fila.speaker_id as string) ?? null,
    estado: fila.estado as ConvenioHcp["estado"],
    archivoFirmadoHCPId: (fila.archivo_firmado_hcp_id as string) ?? null,
    archivoParaHCPEnviadoEn: (fila.archivo_para_hcp_enviado_en as string) ?? null,
    elaboradoEnContratosCorporativo: Boolean(fila.elaborado_en_contratos_corporativo),
  }));
}

export { nombreConvenioHCP };
