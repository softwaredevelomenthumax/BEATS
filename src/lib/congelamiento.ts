import { supabase } from "@/lib/supabaseClient";
import { tieneAlMenosUnaFirma } from "@/lib/cicloVidaDocumento";
import type { PasoAprobacion } from "@/lib/aprobaciones";
import type { EstadoDoc, TipoDoc } from "@/lib/enums";

/**
 * Entrega 22 (octubre 2026) — congelamiento de los formularios.
 *
 * Pedido (reiterado): "todos los campos (incluyendo las firmas manuscritas)
 * que se digitaron/registraron en todos los formularios deben quedar
 * fijos/congelados una vez se inició el flujo de aprobación y se firmó la
 * primera vez".
 *
 * Qué ya existía (`db/agregar_inmutabilidad_documentos_firmados.sql`): la firma
 * manuscrita de cada etapa de la cadena (`firma_congelada_id`) y un snapshot de
 * etiquetas y campos personalizados (`snapshot_formato`) que el servidor toma
 * recién cuando el documento llega a Aprobado/Completado. Huecos que cierra
 * esta entrega:
 *   1. El snapshot de formato se toma desde la PRIMERA firma (no solo al
 *      aprobarse todo): `congelarFormatoAlPrimerFirma`.
 *   2. FMV y Notificación de Pago (un solo firmante) mostraban la firma
 *      manuscrita EN VIVO del usuario: ahora se guarda `firma_congelada_id`
 *      al firmar y las vistas la prefieren.
 *   3. Un documento con al menos una firma se trata como congelado en la
 *      interfaz (`documentoCongelado`): los formularios quedan de solo
 *      lectura; la única vía de corrección sigue siendo la enmienda
 *      justificada ya existente.
 *
 * Todo lo que escribe este módulo es "mejor esfuerzo": si la columna o la
 * política RLS no existen todavía (migración
 * `db/entrega_22_speakers_mixtos_congelamiento.sql` sin ejecutar) se avisa en
 * consola y la acción principal (firmar) nunca falla por eso.
 */

/** Un documento queda congelado desde su primera firma (o si ya está aprobado/completado/anulado). */
export function documentoCongelado(estado: EstadoDoc, pasos: PasoAprobacion[] = []): boolean {
  if (estado === "Aprobado" || estado === "Completado" || estado === "Anulado") return true;
  return estado === "Pendiente" && tieneAlMenosUnaFirma(pasos);
}

/** Filas crudas (snake_case) de etiquetas y campos personalizados vigentes — el mismo shape que arma el servidor. */
async function armarSnapshotFormato(tipoDoc: TipoDoc, empresaGrupo: string): Promise<Record<string, unknown>> {
  const [etiquetas, campos] = await Promise.all([
    supabase.from("etiquetas_campo").select("*").eq("formulario", tipoDoc),
    supabase.from("campos_personalizados_definicion").select("*").eq("formulario", tipoDoc),
  ]);
  if (etiquetas.error) throw etiquetas.error;
  if (campos.error) throw campos.error;
  const delGrupo = (etiquetas.data ?? []).filter((e) => !e.empresa_grupo || e.empresa_grupo === empresaGrupo);
  return { etiquetas: delGrupo, camposPersonalizados: campos.data ?? [], congeladoEn: new Date().toISOString() };
}

/**
 * Guarda el snapshot de formato de un documento la primera vez que se firma
 * (si todavía no tiene uno). No pisa un snapshot existente.
 */
export async function congelarFormatoAlPrimerFirma(params: {
  tabla: string;
  tipoDoc: TipoDoc;
  documentoId: string;
  /** Empresa del grupo del documento; si no la tiene (CAF, convenios) se toma del evento de origen. */
  empresaGrupo?: string;
  eventoOrigenId?: string | null;
}): Promise<void> {
  try {
    let empresa = params.empresaGrupo ?? "";
    if (!empresa && params.eventoOrigenId) {
      const { data } = await supabase.from("solicitudes_evento").select("empresa_grupo").eq("id", params.eventoOrigenId).maybeSingle();
      empresa = (data?.empresa_grupo as string | null) ?? "";
    }
    const snapshot = await armarSnapshotFormato(params.tipoDoc, empresa);
    const { error } = await supabase.from(params.tabla).update({ snapshot_formato: snapshot }).eq("id", params.documentoId).is("snapshot_formato", null);
    if (error) throw error;
  } catch (error) {
    console.warn("No se pudo congelar el formato del documento al primer firmante:", error);
  }
}

/**
 * Documentos de un solo firmante (FMV, Notificación de Pago): guarda el id del
 * archivo de la firma manuscrita que usó quien firmó, para que un cambio
 * posterior de firma en "Usuarios y Roles" no altere el documento ya firmado.
 */
export async function congelarFirmaDocumentoUnico(params: {
  tabla: string;
  documentoId: string;
  firmaId: string | null | undefined;
}): Promise<void> {
  if (!params.firmaId) return;
  try {
    const { error } = await supabase.from(params.tabla).update({ firma_congelada_id: params.firmaId }).eq("id", params.documentoId);
    if (error) throw error;
  } catch (error) {
    console.warn("No se pudo congelar la firma del documento (¿falta ejecutar db/entrega_22_speakers_mixtos_congelamiento.sql?):", error);
  }
}

/** Todo lo que se congela al firmar un documento de un solo firmante. */
export async function congelarDocumentoUnicoFirmante(params: {
  tabla: string;
  tipoDoc: TipoDoc;
  documentoId: string;
  firmaId: string | null | undefined;
  empresaGrupo: string;
}): Promise<void> {
  await congelarFirmaDocumentoUnico(params);
  await congelarFormatoAlPrimerFirma(params);
}
