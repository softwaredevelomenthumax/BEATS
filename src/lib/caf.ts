import { congelarFormatoAlPrimerFirma } from "@/lib/congelamiento";
import { exigirFilasActualizadas } from "@/lib/documentosRpc";
import { tieneAlMenosUnaFirma } from "@/lib/cicloVidaDocumento";
import { toast } from "sonner";
import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";
import { eliminarBorradorDocumento, eliminarDocumentoAdmin, anularDocumentoRpc } from "@/lib/documentosRpc";
import { rowToFlat, flatToRow, flatToRowParcial, t, s0, n0, b, j, type FieldSpec, em } from "@/lib/dbMapping";
import { crearCadenaAprobacionCaf, pasosPreviosAprobados, cadenaCompletamenteAprobada, type PasoAprobacion, idsAprobadoresPrevios } from "@/lib/aprobaciones";
import { registrarAuditoria } from "@/lib/auditoria";
import { notificarResolucionPaso, notificarTareaPendiente, traerUsuariosParaNotificar } from "@/lib/notificaciones";
import { avisarPrimerAprobador, insertarCadenaOReversar, pasarAPendienteOReversar, retirarDocumentoRecienCreado } from "@/lib/envioAprobacion";
import {
  devolverDocumento,
  solicitarEnmiendaDocumento,
  cerrarVentanaEnmiendaDocumento,
  puedeDevolverDocumento,
  puedeSolicitarEnmienda,
} from "@/lib/cicloVidaDocumento";
import { puedeEnviarCafAAprobacion } from "@/lib/reglasDependenciaDocumentos";
import type { Caf } from "@/types";
import type { Usuario } from "@/types";

/**
 * Entrega 20 — "No se pudo crear el CAF: Could not find the 'contraparte_ciudad'
 * column of 'cafs' in the schema cache".
 *
 * Causa: la columna `contraparte_ciudad` (y sus hermanas) las agrega
 * `db/agregar_contraparte_caf.sql`, que no se había ejecutado en la base real
 * (o se ejecutó sin recargar la caché de esquema de PostgREST). El formulario
 * ya las envía en cada guardado, así que TODO guardado del CAF fallaba, incluso
 * un borrador.
 *
 * Solución: (1) la migración se incluye de nuevo (con `notify pgrst, 'reload
 * schema'`) en `db/entrega_20_migraciones.sql`; (2) mientras no se ejecute, la
 * aplicación ya no se bloquea: si PostgREST dice que NO encuentra una de estas
 * columnas opcionales, se reintenta sin ella y se avisa claramente que ese dato
 * no se guardó. Las columnas críticas (p. ej. `speaker_id`) nunca se omiten.
 */
const COLUMNAS_CAF_OPCIONALES = new Set([
  "contraparte_numero_documento",
  "contraparte_pais",
  "contraparte_estado_provincia",
  "contraparte_ciudad",
  "termino_contrato_determinable",
  // Entrega 24: campos del formato nuevo (db/entrega_24b_caf_matriz_firmas.sql).
  "responsables_contrato",
  "aviso_atencion",
  "aviso_con_copia_para",
]);

type ResultadoEscrituraCaf<T> = { data: T | null; error: { code?: string; message?: string } | null };

/** Nombre de la columna que PostgREST dice no encontrar ("Could not find the 'x' column of 'cafs' in the schema cache"), si aplica. */
export function columnaFaltanteEnError(error: { code?: string; message?: string } | null): string | null {
  if (!error) return null;
  const m = /could not find the '([^']+)' column of 'cafs'/i.exec(error.message ?? "");
  return m ? m[1] : null;
}

async function escribirCafTolerante<T>(
  fila: Record<string, unknown>,
  ejecutar: (fila: Record<string, unknown>) => PromiseLike<ResultadoEscrituraCaf<T>>,
): Promise<ResultadoEscrituraCaf<T>> {
  const trabajo = { ...fila };
  const omitidas: string[] = [];
  for (let intento = 0; intento < COLUMNAS_CAF_OPCIONALES.size + 1; intento++) {
    const resultado = await ejecutar(trabajo);
    const faltante = columnaFaltanteEnError(resultado.error);
    if (!faltante || !COLUMNAS_CAF_OPCIONALES.has(faltante) || !(faltante in trabajo)) {
      if (!resultado.error && omitidas.length > 0) {
        toast.warning(
          `El CAF se guardó, pero la base de datos todavía no tiene las columnas: ${omitidas.join(", ")}. Esos datos NO se guardaron. Ejecuta db/entrega_20_migraciones.sql en el SQL Editor de Supabase.`,
          { duration: 12000 },
        );
      }
      return resultado;
    }
    delete trabajo[faltante];
    omitidas.push(faltante);
  }
  return ejecutar(trabajo);
}

async function insertarCafTolerante(fila: Record<string, unknown>) {
  return escribirCafTolerante<Record<string, unknown>>(fila, (f) => supabase.from("cafs").insert(f).select("*").single());
}

const CAMPOS_CAF: FieldSpec[] = [
  t("id"),
  t("estado"),
  t("creado_por_id", "creadoPorId"),
  t("creado_en", "creadoEn"),
  t("evento_origen_id", "eventoOrigenId"),
  s0("speaker_id", "speakerId"),
  b("elaborado_en_caf_corporativo", "elaboradoEnCafCorporativo"),
  t("tipo_contrato", "tipoContrato"),
  t("tipo_contrato_otro_especifique", "tipoContratoOtroEspecifique"),
  t("solicitante_nombre", "solicitanteNombre"),
  t("solicitante_telefono", "solicitanteTelefono"),
  t("director_area_nombre", "directorAreaNombre"),
  t("director_area_cargo", "directorAreaCargo"),
  t("contraparte_nombre", "contraparteNombre"),
  t("contraparte_numero_documento", "contraparteNumeroDocumento"),
  t("contraparte_pais", "contrapartePais"),
  t("contraparte_estado_provincia", "contraparteEstadoProvincia"),
  t("contraparte_ciudad", "contraparteCiudad"),
  t("contraparte_direccion", "contraparteDireccion"),
  t("due_diligence", "dueDiligence"),
  s0("termino_contrato_inicio", "terminoContratoInicio"),
  s0("termino_contrato_fin", "terminoContratoFin"),
  b("termino_contrato_determinable", "terminoContratoDeterminable"),
  t("contraparte_telefono", "contraparteTelefono"),
  em("contraparte_correo", "contraparteCorreo"),
  t("contraparte_contacto", "contraparteContacto"),
  t("objeto_contrato", "objetoContrato"),
  t("comentarios"),
  t("responsables_contrato", "responsablesContrato"),
  t("aviso_atencion", "avisoAtencion"),
  t("aviso_con_copia_para", "avisoConCopiaPara"),
  n0("monto"),
  t("moneda"),
  t("codigo_cobro_cuenta", "codigoCobroCuenta"),
  t("codigo_cobro_depto", "codigoCobroDepto"),
  t("codigo_cobro_prod", "codigoCobroProd"),
  t("codigo_cobro_proyecto", "codigoCobroProyecto"),
  t("compania_nombre", "companiaNombre"),
  t("codigo_documento", "codigoDocumento"),
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
    // Entrega 24: cadena nueva del CAF (matriz de firmas ampliada).
    tipoFirma: (fila.tipo_firma as string) ?? null,
    automatica: Boolean(fila.automatica),
    firmantesIds: (fila.firmantes_ids as string[] | null) ?? [],
  };
}

/** Pasos de la cadena de un CAF, ya ordenados (para devolver el CAF recién enviado con su matriz real). */
async function traerPasosCaf(cafId: string): Promise<PasoAprobacion[]> {
  const { data } = await supabase.from("caf_aprobaciones").select("*").eq("caf_id", cafId).order("orden", { ascending: true });
  return (data ?? []).map(filaAPaso);
}

/** Vista previa de la matriz de firmas que tendría el CAF de `solicitanteId` (o del usuario en sesión). */
export interface LineaFirmaPrevia {
  orden: number;
  tipoFirma: string;
  etiqueta: string;
  automatica: boolean;
  firmantes: { id: string; nombre: string; cargo: string }[];
  advertencia: string | null;
}

export async function previsualizarCadenaCaf(solicitanteId?: string): Promise<LineaFirmaPrevia[]> {
  const { data, error } = await supabase.rpc("previsualizar_cadena_caf", { p_solicitante: solicitanteId ?? null });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((f) => ({
    orden: f.orden as number,
    tipoFirma: f.tipo_firma as string,
    etiqueta: f.etiqueta as string,
    automatica: Boolean(f.automatica),
    firmantes: (f.firmantes as LineaFirmaPrevia["firmantes"]) ?? [],
    advertencia: (f.advertencia as string | null) ?? null,
  }));
}

/**
 * Entrega 24: el envío a aprobación del CAF pasa por el RPC `enviar_caf_a_firma`, que en una sola
 * operación arma la matriz de firmas (según el perfil del solicitante), pasa el CAF a Pendiente y
 * avisa (campana + correo) a quien firma primero. Devuelve `null` si la función todavía no existe en
 * la base (migración sin ejecutar) para que quien llama use el flujo anterior.
 */
async function enviarCafAFirmaRpc(cafId: string): Promise<{ advertencias: string[] } | null> {
  const { data, error } = await supabase.rpc("enviar_caf_a_firma", { p_caf_id: cafId });
  if (error) {
    if (error.code === "PGRST202" || /could not find the function/i.test(error.message ?? "")) return null;
    throw new Error(mensajeErrorAmigable(error));
  }
  const advertencias = ((data as { advertencias?: string[] } | null)?.advertencias ?? []).filter(Boolean);
  for (const a of advertencias) toast.warning(a, { duration: 12000 });
  return { advertencias };
}

function avisoMigracion24Pendiente() {
  toast.warning(
    "La base de datos todavía no tiene la matriz de firmas nueva del CAF: se usó la cadena anterior. Ejecuta db/entrega_24a_enum_persona.sql y luego db/entrega_24b_caf_matriz_firmas.sql en el SQL Editor de Supabase.",
    { duration: 15000 },
  );
}

function nombreCaf(caf: Pick<Caf, "codigoDocumento" | "companiaNombre">): string {
  return caf.codigoDocumento || `CAF — ${caf.companiaNombre || "sin compañía"}`;
}

/**
 * Fase 4 (precargado automático entre formularios): trae un solo CAF
 * completo por id — usada por Nuevo Convenio HCP al elegir "CAF asociado".
 */
export async function traerCafPorId(id: string): Promise<Caf | null> {
  const { data, error } = await supabase.from("cafs").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(mensajeErrorAmigable(error));
  if (!data) return null;
  return { ...rowToFlat<Caf>(data, CAMPOS_CAF), tipoDoc: "caf", aprobaciones: [] };
}

export async function traerCafs(): Promise<Caf[]> {
  const [{ data: cafs, error: errorCafs }, { data: pasos, error: errorPasos }] = await Promise.all([
    supabase.from("cafs").select("*").order("creado_en", { ascending: false }),
    supabase.from("caf_aprobaciones").select("*").order("orden", { ascending: true }),
  ]);
  if (errorCafs) throw new Error(mensajeErrorAmigable(errorCafs));
  if (errorPasos) throw new Error(mensajeErrorAmigable(errorPasos));

  const pasosPorCaf = new Map<string, PasoAprobacion[]>();
  for (const fila of pasos ?? []) {
    const lista = pasosPorCaf.get(fila.caf_id as string) ?? [];
    lista.push(filaAPaso(fila));
    pasosPorCaf.set(fila.caf_id as string, lista);
  }

  return (cafs ?? []).map((fila) => ({
    ...rowToFlat<Caf>(fila, CAMPOS_CAF),
    tipoDoc: "caf" as const,
    aprobaciones: pasosPorCaf.get(fila.id as string) ?? [],
  }));
}

export async function crearCaf(
  datos: Omit<Caf, "id" | "tipoDoc" | "estado" | "creadoPorId" | "creadoEn" | "aprobaciones" | "motivoAnulacion" | "anuladoPorId" | "anuladoEn" | "adendaVentanaActorId" | "adendaVentanaExpiraEn" | "adendaVentanaJustificacion">,
  usuario: Usuario,
  guardarComoBorrador: boolean,
): Promise<Caf> {
  // Ronda de ajustes de formularios (septiembre 2026), entrega 3: "el CAF
  // se puede crear en simultánea con la solicitud de convenio a HCP, pero
  // no se puede iniciar el flujo de aprobación hasta tanto el convenio de
  // pago a HCP no esté aprobado en su totalidad" — pedido explícito.
  if (!guardarComoBorrador) {
    const puedeEnviar = await puedeEnviarCafAAprobacion(datos.eventoOrigenId, datos.speakerId);
    if (!puedeEnviar) {
      throw new Error("No se puede enviar a aprobación: el Convenio de Pago a HCP de este speaker todavía no está aprobado en su totalidad.");
    }
  }
  const corporativo = Boolean(datos.elaboradoEnCafCorporativo);
  const fila = flatToRow(datos as unknown as Record<string, unknown>, CAMPOS_CAF);
  // Octubre 2026: la columna nueva solo viaja cuando es verdadera, para que
  // crear un CAF normal siga funcionando aunque la migración
  // `db/agregar_expediente_evento.sql` todavía no se haya aplicado.
  if (!corporativo) delete fila.elaborado_en_caf_corporativo;
  // CAF elaborado en el aplicativo corporativo: no hay cadena de aprobación
  // en BEATS (y por tanto ninguna notificación a aprobadores). Se guarda
  // directamente como "Aprobado" para que el Convenio HCP pueda continuar —
  // ver `Caf.elaboradoEnCafCorporativo`. Como borrador sigue siendo borrador.
  // Entrega 20: un CAF con cadena SIEMPRE se inserta como Borrador y pasa a
  // "Pendiente" después de crear su cadena (ver `src/lib/envioAprobacion.ts`).
  fila.estado = guardarComoBorrador || !corporativo ? "Borrador" : "Aprobado";
  fila.creado_por_id = usuario.id;
  fila.creado_en = new Date().toISOString();

  const { data: cafCreado, error } = await insertarCafTolerante(fila);
  if (error) throw new Error(`No se pudo crear el CAF: ${mensajeErrorAmigable(error)}`);
  if (!cafCreado) throw new Error("No se pudo crear el CAF: la base de datos no devolvió el documento creado.");

  if (corporativo) {
    const cafCorporativo: Caf = { ...rowToFlat<Caf>(cafCreado, CAMPOS_CAF), tipoDoc: "caf", aprobaciones: [] };
    await registrarAuditoria({
      documentoId: cafCorporativo.id,
      tipoDoc: "caf",
      documentoNombre: nombreCaf(cafCorporativo),
      actorId: usuario.id,
      accion: "creacion",
      detalle: guardarComoBorrador
        ? "CAF guardado como borrador (se elaborará en el aplicativo CAF corporativo)."
        : "CAF registrado como elaborado en el aplicativo CAF corporativo (sin cadena de aprobación en BEATS).",
    });
    return cafCorporativo;
  }

  // Entrega 24: un borrador NO lleva cadena (la matriz se arma al enviar, según el perfil del
  // solicitante). Al enviar, el RPC arma la cadena, pasa a Pendiente y avisa al primer firmante.
  let aprobaciones: PasoAprobacion[] = [];
  let cafFila = cafCreado;
  if (!guardarComoBorrador) {
    const enviado = await enviarCafAFirmaRpc(cafCreado.id as string).catch(async (error) => {
      await retirarDocumentoRecienCreado({ tipoDoc: "caf", tabla: "cafs", tablaAprobaciones: "caf_aprobaciones", columnaFk: "caf_id", documentoId: cafCreado.id as string });
      throw new Error(`No se pudo crear el CAF: ${error instanceof Error ? error.message : "falló el envío a aprobación."}`);
    });
    if (enviado) {
      aprobaciones = await traerPasosCaf(cafCreado.id as string);
      cafFila = { ...cafCreado, estado: "Pendiente" };
    } else {
      // Migración 24 sin ejecutar: flujo anterior (cadena fija de 4 pasos).
      avisoMigracion24Pendiente();
      aprobaciones = crearCadenaAprobacionCaf();
      await insertarCadenaOReversar({
        tipoDoc: "caf",
        tabla: "cafs",
        tablaAprobaciones: "caf_aprobaciones",
        columnaFk: "caf_id",
        documentoId: cafCreado.id as string,
        accion: "No se pudo crear el CAF",
        filas: aprobaciones.map((paso) => ({
          caf_id: cafCreado.id,
          orden: paso.orden,
          etiqueta: paso.etiqueta,
          rol_requerido: paso.rolRequerido,
          estado: paso.estado,
          pendiente_desde: paso.pendienteDesde,
        })),
      });
      await pasarAPendienteOReversar({
        tipoDoc: "caf",
        tabla: "cafs",
        tablaAprobaciones: "caf_aprobaciones",
        columnaFk: "caf_id",
        documentoId: cafCreado.id as string,
        accion: "No se pudo crear el CAF",
      });
      cafFila = { ...cafCreado, estado: "Pendiente" };
      await avisarPrimerAprobador({
        tipoDoc: "caf",
        documentoId: cafCreado.id as string,
        documentoNombre: nombreCaf(rowToFlat<Caf>(cafCreado, CAMPOS_CAF)),
        rolPrimeraEtapa: aprobaciones[0].rolRequerido,
      });
    }
  }

  const cafPlano: Caf = { ...rowToFlat<Caf>(cafFila, CAMPOS_CAF), tipoDoc: "caf", aprobaciones };

  await registrarAuditoria({
    documentoId: cafPlano.id,
    tipoDoc: "caf",
    documentoNombre: nombreCaf(cafPlano),
    actorId: usuario.id,
    accion: "creacion",
    detalle: guardarComoBorrador ? "CAF guardado como borrador." : "CAF creado y enviado a aprobación.",
  });
  if (!guardarComoBorrador) {
    await registrarAuditoria({
      documentoId: cafPlano.id,
      tipoDoc: "caf",
      documentoNombre: nombreCaf(cafPlano),
      actorId: usuario.id,
      accion: "envio",
    });
  }

  return cafPlano;
}

export async function enviarCaf(caf: Caf, usuario: Usuario): Promise<void> {
  const puedeEnviar = await puedeEnviarCafAAprobacion(caf.eventoOrigenId, caf.speakerId);
  if (!puedeEnviar) {
    throw new Error("No se puede enviar a aprobación: el Convenio de Pago a HCP de este speaker todavía no está aprobado en su totalidad.");
  }
  // Entrega 24: el RPC arma la matriz de firmas, pasa a Pendiente y avisa al primer firmante.
  const enviado = await enviarCafAFirmaRpc(caf.id);
  if (!enviado) {
    avisoMigracion24Pendiente();
    const { error } = await supabase.from("cafs").update({ estado: "Pendiente" }).eq("id", caf.id);
    if (error) throw new Error(mensajeErrorAmigable(error));
  }
  await registrarAuditoria({
    documentoId: caf.id,
    tipoDoc: "caf",
    documentoNombre: nombreCaf(caf),
    actorId: usuario.id,
    accion: "envio",
  });
  if (!enviado) {
    await avisarPrimerAprobador({
      tipoDoc: "caf",
      documentoId: caf.id,
      documentoNombre: nombreCaf(caf),
      rolPrimeraEtapa: caf.aprobaciones[0]?.rolRequerido ?? crearCadenaAprobacionCaf()[0].rolRequerido,
    });
  }
}

/**
 * Resolver una etapa de aprobación se hace vía RPC (`resolver_aprobacion_caf`),
 * no con `.update()` directo — confirmado por extracción directa del bundle
 * original: la función server-side (ya existe y corre hoy contra el
 * proyecto real de Supabase) hace atómicamente la actualización del paso Y
 * la transición en cascada del estado del CAF (a Rechazado, o a Aprobado
 * cuando es la última etapa). El cliente solo registra la auditoría
 * después, igual que el resto de acciones.
 */
export async function resolverPasoCaf(
  caf: Caf,
  indice: number,
  decision: "aprobado" | "rechazado",
  usuario: Usuario,
  comentario: string,
): Promise<void> {
  const paso = caf.aprobaciones[indice];
  if (!paso?.id) throw new Error("No se encontró el paso de aprobación indicado.");
  if (!pasosPreviosAprobados(caf.aprobaciones, indice)) {
    throw new Error("Todavía hay etapas anteriores sin aprobar.");
  }

  const { error } = await supabase.rpc("resolver_aprobacion_caf", {
    p_caf_id: caf.id,
    p_orden: paso.orden,
    p_accion: decision,
    p_comentario: comentario.trim() || null,
  });
  if (error) throw new Error(error.message);
  // Entrega 22: desde la PRIMERA firma el formato (etiquetas y campos) queda congelado.
  if (decision === "aprobado" && !tieneAlMenosUnaFirma(caf.aprobaciones)) {
    await congelarFormatoAlPrimerFirma({ tabla: "cafs", tipoDoc: "caf", documentoId: caf.id, eventoOrigenId: caf.eventoOrigenId, });
  }

  // Se trae siempre (ya no solo cuando hay una siguiente etapa) porque
  // ahora también hace falta para avisar a los pares del mismo rol que la
  // etapa ya quedó resuelta (E24), tanto en aprobación como en rechazo.
  const usuariosConRol = await traerUsuariosParaNotificar().catch(() => []);

  if (decision === "rechazado") {
    await registrarAuditoria({
      documentoId: caf.id,
      tipoDoc: "caf",
      documentoNombre: nombreCaf(caf),
      actorId: usuario.id,
      accion: "rechazo",
      detalle: `Rechazado en la etapa "${paso.etiqueta}". ${comentario}`.trim(),
    });
    await notificarResolucionPaso({
      tipoDoc: "caf",
      documentoId: caf.id,
      documentoNombre: nombreCaf(caf),
      etiquetaPaso: paso.etiqueta,
      rolResuelto: paso.rolRequerido,
      decision: "rechazado",
      esFinal: false,
      creadorId: caf.creadoPorId,
      aprobadoresIds: idsAprobadoresPrevios(caf.aprobaciones),
      actorId: usuario.id,
      actorNombre: usuario.nombre,
      usuariosConRol,
      paresIds: paso.rolRequerido === "persona" ? paso.firmantesIds ?? [] : undefined,
    });
    return;
  }

  const cadenaActualizada = caf.aprobaciones.map((p, i) => (i === indice ? { ...p, estado: decision } : p));
  const esFinal = cadenaCompletamenteAprobada(cadenaActualizada);
  await registrarAuditoria({
    documentoId: caf.id,
    tipoDoc: "caf",
    documentoNombre: nombreCaf(caf),
    actorId: usuario.id,
    accion: esFinal ? "aprobacion_final" : "aprobacion_parcial",
    detalle: `Etapa "${paso.etiqueta}" aprobada.${comentario ? ` ${comentario}` : ""}`,
  });
  await notificarResolucionPaso({
    tipoDoc: "caf",
    documentoId: caf.id,
    documentoNombre: nombreCaf(caf),
    etiquetaPaso: paso.etiqueta,
    rolResuelto: paso.rolRequerido,
    decision: "aprobado",
    esFinal,
    creadorId: caf.creadoPorId,
      aprobadoresIds: idsAprobadoresPrevios(caf.aprobaciones),
    actorId: usuario.id,
    actorNombre: usuario.nombre,
    // Entrega 24: con la cadena nueva la siguiente línea la avisa el servidor (`resolver_aprobacion_caf`),
    // porque puede ser de persona (no de rol). En la cadena anterior sigue avisando la aplicación.
    // Entrega 25: el aviso de la etapa SIGUIENTE lo crea la base de datos dentro de resolver_aprobacion_* (con el descriptor detallado); avisarlo también aquí duplicaba campana y correo.
    usuariosConRol,
    paresIds: paso.rolRequerido === "persona" ? paso.firmantesIds ?? [] : undefined,
  });
}

/**
 * Corrige y reenvía un CAF rechazado. Confirmado por extracción directa del
 * bundle original: esta operación NUNCA toca `caf_aprobaciones` desde el
 * cliente — solo actualiza la fila del CAF con `estado: "Pendiente"`. Esto
 * es consistente con que resolver una etapa tampoco se puede hacer con un
 * `.update()` directo (ver `resolverPasoCaf`, que usa RPC): lo más probable
 * es que RLS bloquee cualquier escritura directa del cliente a las tablas
 * de aprobaciones, y que un trigger del lado del servidor reinicie la
 * cadena a "pendiente" cuando el documento vuelve a Pendiente. El bundle
 * original refleja esto último de forma optimista en su estado local (sin
 * esperar a releer el servidor); aquí simplemente se reenvía y se deja que
 * la siguiente recarga (`traerCafs()`) muestre el estado real de la cadena.
 */
export async function editarYReenviarCaf(
  caf: Caf,
  datos: Partial<Caf>,
  usuario: Usuario,
): Promise<void> {
  const eventoOrigenId = datos.eventoOrigenId ?? caf.eventoOrigenId;
  const speakerId = datos.speakerId ?? caf.speakerId;
  const puedeEnviar = await puedeEnviarCafAAprobacion(eventoOrigenId, speakerId);
  if (!puedeEnviar) {
    throw new Error("No se puede reenviar a aprobación: el Convenio de Pago a HCP de este speaker todavía no está aprobado en su totalidad.");
  }
  // `flatToRowParcial` (no `flatToRow` a secas) — `datos` es un
  // `Partial<Caf>` construido desde `DatosFormularioCaf`, que nunca trae
  // `creadoPorId`/`creadoEn`. `flatToRow` habría escrito el default de esas
  // columnas (`""`) en cada UPDATE, corrompiendo quién y cuándo se creó el
  // CAF — encontrado al escribir `scripts/verificar_ciclo_vida_documentos.mjs`.
  const fila = flatToRowParcial(datos as Record<string, unknown>, CAMPOS_CAF);
  fila.estado = "Pendiente";
  const { error: errorUpdate } = await escribirCafTolerante(fila, (f) => supabase.from("cafs").update(f).eq("id", caf.id));
  if (errorUpdate) throw new Error(mensajeErrorAmigable(errorUpdate));

  await registrarAuditoria({
    documentoId: caf.id,
    tipoDoc: "caf",
    documentoNombre: nombreCaf({ ...caf, ...datos } as Caf),
    actorId: usuario.id,
    accion: "edicion_reenvio",
  });
  // E1: a diferencia de crearCaf/enviarCaf, aquí NO se puede confiar en que
  // el trigger de base de datos ya haya avisado — reenviar un CAF rechazado
  // reinicia la cadena con un UPDATE de caf_aprobaciones (según el propio
  // comentario de esta función, más arriba: el cliente nunca inserta ahí),
  // y fn_notificar_primera_etapa_caf() es un trigger AFTER INSERT — nunca
  // se dispara por un UPDATE. Este SÍ es el único aviso posible para el
  // primer aprobador en este caso, así que se mantiene.
  // Entrega 24: con la cadena nueva el aviso lo hace el servidor al rearmarla (`fn_reiniciar_aprobaciones_caf`).
  const primerPaso = caf.aprobaciones[0];
  if (primerPaso && !primerPaso.tipoFirma) {
    const usuariosConRol = await traerUsuariosParaNotificar().catch(() => []);
    await notificarTareaPendiente({
      tipoDoc: "caf",
      documentoId: caf.id,
      documentoNombre: nombreCaf({ ...caf, ...datos } as Caf),
      rolRequerido: primerPaso.rolRequerido,
      usuariosConRol,
    });
  }
}

/**
 * Guarda cambios sobre un CAF todavía en Borrador o Devuelto — se puede
 * llamar las veces que haga falta antes de enviarlo a aprobación
 * (`enviarAAprobacion = false` lo deja en el mismo estado; `true` lo envía,
 * quedando "Pendiente"). A diferencia de `editarYReenviarCaf` (que siempre
 * fuerza "Pendiente" porque corrige un Rechazado), aquí el estado solo
 * cambia cuando el usuario explícitamente decide enviar.
 */
export async function editarBorradorCaf(
  caf: Caf,
  datos: Partial<Caf>,
  usuario: Usuario,
  enviarAAprobacion: boolean,
): Promise<void> {
  if (enviarAAprobacion) {
    const eventoOrigenId = datos.eventoOrigenId ?? caf.eventoOrigenId;
    const speakerId = datos.speakerId ?? caf.speakerId;
    const puedeEnviar = await puedeEnviarCafAAprobacion(eventoOrigenId, speakerId);
    if (!puedeEnviar) {
      throw new Error("No se puede enviar a aprobación: el Convenio de Pago a HCP de este speaker todavía no está aprobado en su totalidad.");
    }
  }
  // Mismo motivo que en `editarYReenviarCaf`: `flatToRowParcial`, no
  // `flatToRow`, para no pisar `creadoPorId`/`creadoEn` con su default.
  const fila = flatToRowParcial(datos as Record<string, unknown>, CAMPOS_CAF);
  const corporativo = datos.elaboradoEnCafCorporativo ?? caf.elaboradoEnCafCorporativo;
  // Ver `crearCaf`: la columna solo viaja si es verdadera o ya lo era.
  if (!corporativo && !caf.elaboradoEnCafCorporativo) delete fila.elaborado_en_caf_corporativo;
  // CAF corporativo: sin cadena ni notificaciones, "enviar" lo deja Aprobado.
  // Entrega 24: un CAF normal se envía por el RPC (que lo pasa a Pendiente), así que aquí queda igual.
  if (enviarAAprobacion && corporativo) fila.estado = "Aprobado";
  const { data: filasActualizadas, error } = await escribirCafTolerante<{ id: string }[]>(fila, (f) => supabase.from("cafs").update(f).eq("id", caf.id).select("id"));
  if (error) throw new Error(mensajeErrorAmigable(error));
  exigirFilasActualizadas(filasActualizadas);
  let enviadoPorRpc = true;
  if (enviarAAprobacion && !corporativo) {
    const enviado = await enviarCafAFirmaRpc(caf.id);
    if (!enviado) {
      avisoMigracion24Pendiente();
      enviadoPorRpc = false;
      const { error: errorEstado } = await supabase.from("cafs").update({ estado: "Pendiente" }).eq("id", caf.id);
      if (errorEstado) throw new Error(mensajeErrorAmigable(errorEstado));
    }
  }

  const nombre = nombreCaf({ ...caf, ...datos } as Caf);
  await registrarAuditoria({
    documentoId: caf.id,
    tipoDoc: "caf",
    documentoNombre: nombre,
    actorId: usuario.id,
    accion: enviarAAprobacion ? "envio" : "borrador_actualizado",
    detalle: enviarAAprobacion ? undefined : "Borrador actualizado.",
  });
  // Igual que enviarCaf: la cadena ya existe, pero hay que avisar al primer
  // aprobador (salvo CAF corporativo, que no tiene cadena en BEATS).
  if (enviarAAprobacion && !corporativo && !enviadoPorRpc) {
    await avisarPrimerAprobador({
      tipoDoc: "caf",
      documentoId: caf.id,
      documentoNombre: nombre,
      rolPrimeraEtapa: caf.aprobaciones[0]?.rolRequerido ?? crearCadenaAprobacionCaf()[0].rolRequerido,
    });
  }
}

/**
 * Corrección (octubre 2026), pedido explícito del usuario: eliminar un
 * borrador sin dejar rastro en auditoría, solo permitido a quien lo creó
 * — ver la nota larga en `eliminarBorradorEvento` (`src/lib/evento.ts`),
 * mismo criterio exacto. `caf_aprobaciones` se crea desde `crearCaf`
 * incluso para un Borrador, así que se borra primero.
 */
export async function eliminarBorradorCaf(documentoId: string): Promise<void> {
  await eliminarBorradorDocumento("caf", documentoId);
}

/** Ver nota larga sobre la pantalla admin-only en `eliminarDocumentoFirmadoAdmin` (`src/lib/evento.ts`). */
export async function eliminarDocumentoFirmadoAdmin(documentoId: string): Promise<void> {
  await eliminarDocumentoAdmin("caf", documentoId);
}

/** Devuelve (suspende y reabre) un CAF Pendiente sin ninguna firma todavía. */
export async function devolverCaf(caf: Caf, usuario: Usuario, motivo: string): Promise<void> {
  if (!puedeDevolverDocumento(caf.estado, caf.aprobaciones)) {
    throw new Error("Este CAF no se puede devolver: ya tiene al menos una firma en su cadena de aprobación, o no está pendiente.");
  }
  await devolverDocumento({ tabla: "cafs", tipoDoc: "caf", documentoId: caf.id, documentoNombre: nombreCaf(caf), motivo, usuario });
}

/** Abre la ventana de enmienda de un CAF Pendiente que ya tiene al menos una firma. */
export async function solicitarEnmiendaCaf(caf: Caf, usuario: Usuario, justificacion: string): Promise<{ expiraEn: string }> {
  if (!(usuario.esAdministrador || usuario.id === caf.creadoPorId)) {
    throw new Error("Solo quien creó la solicitud (o un administrador) puede pedir una enmienda.");
  }
  if (!puedeSolicitarEnmienda(caf.estado, caf.aprobaciones)) {
    throw new Error("Este CAF no requiere una enmienda: todavía no tiene ninguna firma, o ya no está pendiente.");
  }
  return solicitarEnmiendaDocumento({
    tabla: "cafs",
    tipoDoc: "caf",
    documentoId: caf.id,
    documentoNombre: nombreCaf(caf),
    justificacion,
    usuario,
  });
}

export async function cerrarVentanaEnmiendaCaf(cafId: string): Promise<void> {
  await cerrarVentanaEnmiendaDocumento({ tabla: "cafs", documentoId: cafId });
}

export async function anularCaf(caf: Caf, usuario: Usuario, motivo: string): Promise<void> {
  // Octubre 2026: el `update` directo desde el navegador lo filtraba RLS en
  // silencio (sobre todo en documentos Completados) — ver
  // `src/lib/documentosRpc.ts`. El servidor valida que quien anula sea
  // Administrador y que el documento no esté en Borrador (se elimina) ni ya
  // Anulado.
  await anularDocumentoRpc("caf", caf.id, motivo);
  await registrarAuditoria({
    documentoId: caf.id,
    tipoDoc: "caf",
    documentoNombre: nombreCaf(caf),
    actorId: usuario.id,
    accion: "anulacion",
    detalle: motivo,
  });
}

export { nombreCaf };
