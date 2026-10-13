import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";
import type { TipoAccionAuditoria, TipoDoc } from "@/lib/enums";
import type { Auditoria } from "@/types";
import { Telemetria } from "@/lib/telemetria";
import { alcanceDe, resolverAlcanceDocumentos } from "@/lib/alcance";

/**
 * Inserta una fila en `auditoria`. Se llama después de cada transición de
 * estado relevante (creación, envío, aprobación parcial/final, rechazo,
 * edición+reenvío, completado, anulación, eliminación, adenda) — nunca se
 * agrupan varias transiciones en un solo registro.
 */
export async function registrarAuditoria(params: {
  documentoId: string;
  tipoDoc: TipoDoc;
  documentoNombre: string;
  actorId: string;
  accion: TipoAccionAuditoria;
  detalle?: string;
  empresaGrupo?: string | null;
  pais?: string | null;
}): Promise<void> {
  // Octubre 2026: «Historial y Auditoría» se restringe por país y compañía. Los ~45 llamadores no informaban ninguno de
  // los dos, así que si no vienen se resuelven desde el documento (o su evento de origen). Nunca bloquea el registro.
  let { empresaGrupo, pais } = params;
  if (empresaGrupo === undefined && pais === undefined) {
    try {
      const alcance = alcanceDe(await resolverAlcanceDocumentos([{ tipoDoc: params.tipoDoc, documentoId: params.documentoId }]), params.tipoDoc, params.documentoId);
      empresaGrupo = alcance?.empresaGrupo ?? null;
      pais = alcance?.pais ?? null;
    } catch {
      /* se registra sin alcance */
    }
  }
  const { error } = await supabase.from("auditoria").insert({
    documento_id: params.documentoId,
    tipo_doc: params.tipoDoc,
    documento_nombre: params.documentoNombre,
    actor_id: params.actorId,
    accion: params.accion,
    detalle: params.detalle ?? "",
    empresa_grupo: empresaGrupo ?? null,
    pais: pais ?? null,
  });
  if (error) {
    // La auditoría nunca debe tumbar el flujo principal del usuario — se
    // registra en consola para no perder la señal en desarrollo/soporte.
    console.error("No se pudo registrar auditoría:", error);
    return;
  }
  // Entrega 29: la transición auditada cierra el cronómetro de diligenciamiento / revisión (nunca debe fallar).
  try {
    Telemetria.alAuditar({ tipoDoc: params.tipoDoc, documentoId: params.documentoId, accion: params.accion, detalle: params.detalle });
  } catch {
    /* la medición es secundaria */
  }
}

function filaAAuditoria(fila: Record<string, unknown>): Auditoria {
  return {
    id: fila.id as string,
    documentoId: fila.documento_id as string,
    tipoDoc: fila.tipo_doc as TipoDoc,
    documentoNombre: fila.documento_nombre as string,
    actorId: fila.actor_id as string,
    accion: fila.accion as TipoAccionAuditoria,
    detalle: (fila.detalle as string) ?? "",
    ocurridoEn: fila.ocurrido_en as string,
    empresaGrupo: (fila.empresa_grupo as string) ?? null,
    pais: (fila.pais as string) ?? null,
  };
}

export interface FiltrosAuditoria {
  tipoDoc?: TipoDoc;
  accion?: TipoAccionAuditoria;
  desde?: string;
  hasta?: string;
}

/**
 * Lectura del log de auditoría para la pantalla "Auditoría" (Fase 6) — con
 * los mismos filtros que un log de este tipo necesita en cualquier
 * herramienta regulatoria: tipo de documento, tipo de acción y rango de
 * fechas. Se limita a las 500 más recientes tras aplicar los filtros —
 * volumen razonable para un log que se revisa, no se procesa en bloque.
 */
export async function traerAuditoria(filtros: FiltrosAuditoria = {}): Promise<Auditoria[]> {
  let consulta = supabase.from("auditoria").select("*").order("ocurrido_en", { ascending: false }).limit(500);
  if (filtros.tipoDoc) consulta = consulta.eq("tipo_doc", filtros.tipoDoc);
  if (filtros.accion) consulta = consulta.eq("accion", filtros.accion);
  if (filtros.desde) consulta = consulta.gte("ocurrido_en", filtros.desde);
  if (filtros.hasta) consulta = consulta.lte("ocurrido_en", filtros.hasta);
  const { data, error } = await consulta;
  if (error) throw new Error(mensajeErrorAmigable(error));
  return (data ?? []).map(filaAAuditoria);
}
