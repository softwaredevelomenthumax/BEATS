import { congelarDocumentoUnicoFirmante } from "@/lib/congelamiento";
import { actualizarDocumentoEditable } from "@/lib/documentosRpc";
import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";
import { rowToFlat, flatToRow, flatToRowParcial, t, s0, b, j, type FieldSpec } from "@/lib/dbMapping";
import { registrarAuditoria } from "@/lib/auditoria";
import {
  firmarYCompletarDocumentoUnicoFirmante,
  anularDocumentoUnicoFirmante,
  eliminarBorradorDocumentoUnicoFirmante,
  eliminarDocumentoFirmadoAdmin as eliminarDocumentoFirmadoAdminGenerico,
  type DatosFirma,
} from "@/lib/documentoUnicoFirmante";
import type { Fmv } from "@/types";
import type { Usuario } from "@/types";
import { CRITERIO_FMV_KEY, type RespuestaCriterio } from "@/lib/enums";
import { avisarTareasCafYConvenioHCP } from "@/lib/tareasEscalonadas";

const TABLA = "fmv_checklists";

/** Respuesta de un criterio: enum nullable, `""` en el estado del formulario equivale a "sin responder". */
function criterio(column: string): FieldSpec {
  return {
    key: column,
    column,
    toFlat: (v) => (v == null ? null : (v as RespuestaCriterio)),
    toRow: (v) => (v == null || v === "" ? null : v),
  };
}

const CAMPOS_FMV: FieldSpec[] = [
  t("id"),
  t("estado"),
  t("creado_por_id", "creadoPorId"),
  t("creado_en", "creadoEn"),
  s0("evento_origen_id", "eventoOrigenId"),
  s0("speaker_id", "speakerId"),
  t("region"),
  t("pais"),
  s0("fecha"),
  t("nombre_completo", "nombreCompleto"),
  t("numero_documento", "numeroDocumento"),
  b("cv_adjunto", "cvAdjunto"),
  t("especialidad"),
  t("especialidad_otro", "especialidadOtro"),
  t("licencia_nacional", "licenciaNacional"),
  t("direccion_principal", "direccionPrincipal"),
  t("ciudad"),
  t("estado_provincia", "estadoProvincia"),
  t("codigo_postal", "codigoPostal"),
  criterio("criterio1"),
  criterio("criterio2"),
  criterio("criterio3"),
  criterio("criterio4"),
  criterio("criterio5"),
  criterio("criterio6"),
  t("comentarios_adicionales", "comentariosAdicionales"),
  b("aplica_tarifario_asociacion", "aplicaTarifarioAsociacion"),
  s0("archivo_tarifario_asociacion_id", "archivoTarifarioAsociacionId"),
  // Ajuste de precisión (septiembre 2026), pedido explícito: columna nueva,
  // todavía no existe en el proyecto real de Supabase — ver
  // `db/agregar_asociacion_cientifica_fmv.sql`.
  s0("asociacion_cientifica", "asociacionCientifica"),
  t("medical_name", "medicalName"),
  t("medical_role", "medicalRole"),
  s0("fecha_firma", "fechaFirma"),
  b("firma_electronica", "firmaElectronica"),
  s0("firmado_por_id", "firmadoPorId"),
  s0("motivo_anulacion", "motivoAnulacion"),
  s0("anulado_por_id", "anuladoPorId"),
  s0("anulado_en", "anuladoEn"),
  t("empresa_grupo", "empresaGrupo"),
  j("campos_personalizados", {}, "camposPersonalizados"),
  // Snapshot congelado por trigger al pasar a Completado — ver
  // `db/agregar_inmutabilidad_documentos_firmados.sql`. Solo lectura desde
  // el front-end (lo escribe el trigger, no un `crear*`/`editar*`).
  j("snapshot_formato", null, "snapshotFormato"),
];

/** Entrega 22: la columna `firma_congelada_id` no está en `CAMPOS_FMV` (si la migración no existe, escribirla fallaría); se lee aparte. */
function conFirmaCongelada<T extends Fmv>(plano: T, fila: Record<string, unknown>): T {
  return { ...plano, firmaCongeladaId: (fila.firma_congelada_id as string | null | undefined) ?? null };
}

function nombreFmv(fmv: Pick<Fmv, "nombreCompleto">): string {
  return `FMV — ${fmv.nombreCompleto || "sin nombre"}`;
}

/**
 * Corrección (octubre 2026), pedido explícito del usuario: "ningún
 * formato se puede aprobar o guardar definitivamente si le falta algún
 * campo obligatorio. El sistema debe advertirlo." — esta función no
 * existía: `confirmarFirma` en `DetalleFmv.tsx` solo revisaba
 * `medicalName`/`medicalRole`, así que un FMV se podía "Firmar y
 * completar" (su único paso de cierre, no tiene cadena de aprobación)
 * con el resto del formulario vacío. Mismo patrón que
 * `calcularErroresEvento`/`calcularErroresSpeaker`. Los 6 criterios de
 * Fair Market Value (`criterio1`..`criterio6`) se exigen siempre los 6,
 * independientemente de cuáles estén configurados como visibles — sin
 * los 6, el puntaje/tier no es confiable.
 */
export function calcularErroresFmv(datos: Partial<Fmv>): Record<string, string> {
  const errores: Record<string, string> = {};
  const requerido = (clave: keyof Fmv, etiqueta: string) => {
    const valor = datos[clave];
    if (!String(valor ?? "").trim()) errores[clave as string] = `${etiqueta} es obligatorio.`;
  };

  requerido("nombreCompleto", "Nombre completo");
  requerido("numeroDocumento", "Número de documento");
  requerido("region", "Región");
  requerido("pais", "País");
  requerido("estadoProvincia", "Estado/Provincia/Departamento");
  requerido("ciudad", "Ciudad");
  requerido("fecha", "Fecha");
  requerido("especialidad", "Especialidad");
  if (datos.especialidad === "Otra") requerido("especialidadOtro", "Especifique la especialidad");
  requerido("licenciaNacional", "Licencia nacional");
  requerido("direccionPrincipal", "Dirección");
  for (const clave of CRITERIO_FMV_KEY) {
    if (!datos[clave]) errores[clave] = "Responde este criterio de Fair Market Value.";
  }
  if (datos.aplicaTarifarioAsociacion) requerido("asociacionCientifica", "Asociación médica / científica");
  requerido("medicalName", "Nombre de quien certifica");
  requerido("medicalRole", "Cargo de quien certifica");

  return errores;
}

export async function traerFmvs(): Promise<Fmv[]> {
  const { data, error } = await supabase.from(TABLA).select("*").order("creado_en", { ascending: false });
  if (error) throw new Error(mensajeErrorAmigable(error));
  return (data ?? []).map((fila) => (conFirmaCongelada({ ...rowToFlat<Fmv>(fila, CAMPOS_FMV), tipoDoc: "fmv" as const }, fila)));
}

/**
 * Ronda de ajustes de formularios (septiembre 2026), entrega 5: usado por
 * Convenio de Pago a HCP para precargar "Criterios utilizados para
 * seleccionar al Profesional de la Salud propuesto" desde el
 * `comentariosAdicionales` del FMV del mismo evento/speaker (pedido
 * explícito). Trae el más reciente si hay más de uno.
 */
export async function traerFmvPorEventoYSpeaker(eventoOrigenId: string, speakerId: string): Promise<Fmv | null> {
  const { data, error } = await supabase
    .from(TABLA)
    .select("*")
    .eq("evento_origen_id", eventoOrigenId)
    .eq("speaker_id", speakerId)
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(mensajeErrorAmigable(error));
  return data ? conFirmaCongelada({ ...rowToFlat<Fmv>(data, CAMPOS_FMV), tipoDoc: "fmv" as const }, data) : null;
}

export async function crearFmv(
  datos: Omit<Fmv, "id" | "tipoDoc" | "estado" | "creadoPorId" | "creadoEn" | "fechaFirma" | "firmaElectronica" | "firmadoPorId" | "motivoAnulacion" | "anuladoPorId" | "anuladoEn">,
  usuario: Usuario,
  guardarComoBorrador: boolean,
): Promise<Fmv> {
  const fila = flatToRow(datos as unknown as Record<string, unknown>, CAMPOS_FMV);
  fila.estado = guardarComoBorrador ? "Borrador" : "Completado";
  fila.creado_por_id = usuario.id;
  fila.creado_en = new Date().toISOString();
  if (!guardarComoBorrador) {
    fila.fecha_firma = new Date().toISOString().slice(0, 10);
    fila.firma_electronica = true;
    // Octubre 2026: quedaba sin registrar QUIÉN firmó, y por eso la vista
    // previa/PDF no podía mostrar su firma manuscrita.
    fila.firmado_por_id = usuario.id;
  }

  const { data: fmvCreado, error } = await supabase.from(TABLA).insert(fila).select("*").single();
  if (error) throw new Error(`No se pudo crear el FMV: ${mensajeErrorAmigable(error)}`);

  const fmvPlano: Fmv = conFirmaCongelada({ ...rowToFlat<Fmv>(fmvCreado, CAMPOS_FMV), tipoDoc: "fmv" }, fmvCreado);

  await registrarAuditoria({
    documentoId: fmvPlano.id,
    tipoDoc: "fmv",
    documentoNombre: nombreFmv(fmvPlano),
    actorId: usuario.id,
    accion: "creacion",
    detalle: guardarComoBorrador ? "FMV guardado como borrador." : "FMV diligenciado y firmado.",
  });
  if (!guardarComoBorrador) {
    // Entrega 22: la firma manuscrita y el formato quedan congelados al firmar.
    await congelarDocumentoUnicoFirmante({ tabla: TABLA, tipoDoc: "fmv", documentoId: fmvPlano.id, firmaId: usuario.firmaId, empresaGrupo: fmvPlano.empresaGrupo });
    await registrarAuditoria({
      documentoId: fmvPlano.id,
      tipoDoc: "fmv",
      documentoNombre: nombreFmv(fmvPlano),
      actorId: usuario.id,
      accion: "completado",
    });
    // Entrega 20: si con este FMV ya quedan firmados FMV + Convenio de Pago del
    // speaker, se avisa que se generaron las tareas de CAF y Convenio HCP.
    await avisarTareasCafYConvenioHCP({
      eventoOrigenId: fmvPlano.eventoOrigenId,
      speakerId: fmvPlano.speakerId || null,
      nombreSpeaker: fmvPlano.nombreCompleto,
    });
  }

  return fmvPlano;
}

/**
 * Guarda cambios sobre un FMV todavía en Borrador — repetible las veces que
 * haga falta antes de firmarlo y completarlo. FMV no tiene cadena de
 * aprobación (pasa directo de Borrador a Completado, ver
 * `firmarYCompletarFmv`), así que no hay "devolver"/"enmienda" que aplicar
 * aquí — solo la reapertura de un borrador ya pedida explícitamente por el
 * usuario para cualquier formulario de "Crear documento".
 */
export async function editarBorradorFmv(
  fmv: Fmv,
  datos: Omit<Fmv, "id" | "tipoDoc" | "estado" | "creadoPorId" | "creadoEn" | "fechaFirma" | "firmaElectronica" | "firmadoPorId" | "motivoAnulacion" | "anuladoPorId" | "anuladoEn">,
  usuario: Usuario,
): Promise<void> {
  // `flatToRowParcial`, no `flatToRow` — `datos` (un `DatosFormularioFmv`)
  // nunca trae `creadoPorId`/`creadoEn`; `flatToRow` habría pisado esas
  // columnas con su default ("") en cada guardado de borrador — mismo
  // hallazgo que en `editarBorradorCaf`, ver ese comentario.
  const fila = flatToRowParcial(datos as unknown as Record<string, unknown>, CAMPOS_FMV);
  await actualizarDocumentoEditable(TABLA, fmv.id, fila);

  await registrarAuditoria({
    documentoId: fmv.id,
    tipoDoc: "fmv",
    documentoNombre: nombreFmv({ ...fmv, ...datos } as Fmv),
    actorId: usuario.id,
    accion: "borrador_actualizado",
    detalle: "Borrador actualizado.",
  });
}

/** Ver nota larga sobre borrar un borrador sin rastro de auditoría en `eliminarBorradorDocumentoUnicoFirmante` (`documentoUnicoFirmante.ts`). */
export async function eliminarBorradorFmv(documentoId: string): Promise<void> {
  await eliminarBorradorDocumentoUnicoFirmante({ tipoDoc: "fmv", documentoId });
}

/** Ver nota larga sobre la pantalla admin-only en `eliminarDocumentoFirmadoAdmin` (`src/lib/evento.ts`). */
export async function eliminarDocumentoFirmadoAdmin(documentoId: string): Promise<void> {
  await eliminarDocumentoFirmadoAdminGenerico({ tipoDoc: "fmv", documentoId });
}

export async function firmarYCompletarFmv(fmv: Fmv, datosFirma: DatosFirma, usuario: Usuario): Promise<void> {
  await firmarYCompletarDocumentoUnicoFirmante({
    tabla: TABLA,
    tipoDoc: "fmv",
    documentoId: fmv.id,
    documentoNombre: nombreFmv(fmv),
    datosFirma,
    usuario,
  });
  await congelarDocumentoUnicoFirmante({ tabla: TABLA, tipoDoc: "fmv", documentoId: fmv.id, firmaId: usuario.firmaId, empresaGrupo: fmv.empresaGrupo });
  // Entrega 20: ver `crearFmv` — escalón siguiente de tareas (CAF + Convenio HCP).
  await avisarTareasCafYConvenioHCP({
    eventoOrigenId: fmv.eventoOrigenId,
    speakerId: fmv.speakerId || null,
    nombreSpeaker: fmv.nombreCompleto,
  });
}

export async function anularFmv(fmv: Fmv, usuario: Usuario, motivo: string): Promise<void> {
  await anularDocumentoUnicoFirmante({
    tabla: TABLA,
    tipoDoc: "fmv",
    documentoId: fmv.id,
    documentoNombre: nombreFmv(fmv),
    motivo,
    usuario,
  });
}

export { nombreFmv };
