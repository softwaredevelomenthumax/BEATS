import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";
import type { AjusteClausulaConvenioHcp, ClausuladoSnapshot, ConvenioHcp, NumeralClausulado, PlantillaConvenioHcpVersion } from "@/types";

/**
 * Motor del clausulado legal versionado del Convenio HCP — reconstruido a
 * partir de evidencia forense literal del bundle original (`sw()`, `lw()`,
 * `uw()`, `dw()`, `WL()`): la plantilla vive en `plantilla_convenio_hcp_version`
 * como un historial append-only (nunca se edita una versión existente, se
 * publica una nueva); cada Convenio HCP concreto congela un snapshot de la
 * versión vigente al momento de crearse (`clausulado_snapshot`), para que
 * publicar una nueva versión de la plantilla nunca altere retroactivamente
 * un contrato ya firmado.
 */

export const CANTIDAD_NUMERALES = 15;

/** Las 15 secciones numeradas del cuerpo del contrato + los dos anexos versionados (C y D). Anexo A y B se arman a partir de los propios campos del Convenio HCP, no de la plantilla. */
export const SECCIONES_CLAUSULADO: { valor: string; etiqueta: string }[] = [
  ...Array.from({ length: CANTIDAD_NUMERALES }, (_, i) => ({ valor: `numeral_${i + 1}`, etiqueta: `Numeral ${i + 1}` })),
  { valor: "anexo_c", etiqueta: "Anexo C" },
  { valor: "anexo_d", etiqueta: "Anexo D" },
];

const PLANTILLA_VACIA: Omit<PlantillaConvenioHcpVersion, "id" | "vigenteDesde" | "creadoPorId" | "empresaGrupo"> = {
  notasVersion: "",
  numerales: [],
  anexoCEn: "",
  anexoCEs: "",
  anexoDEn: "",
  anexoDEs: "",
};

function filaAPlantilla(fila: Record<string, unknown>): PlantillaConvenioHcpVersion {
  return {
    id: fila.id as string,
    vigenteDesde: fila.vigente_desde as string,
    creadoPorId: (fila.creado_por_id as string) ?? null,
    notasVersion: (fila.notas_version as string) ?? "",
    numerales: (fila.numerales as NumeralClausulado[]) ?? [],
    anexoCEn: (fila.anexo_c_en as string) ?? "",
    anexoCEs: (fila.anexo_c_es as string) ?? "",
    anexoDEn: (fila.anexo_d_en as string) ?? "",
    anexoDEs: (fila.anexo_d_es as string) ?? "",
    empresaGrupo: (fila.empresa_grupo as string) ?? null,
  };
}

export async function traerVersionesPlantilla(): Promise<PlantillaConvenioHcpVersion[]> {
  const { data, error } = await supabase
    .from("plantilla_convenio_hcp_version")
    .select("*")
    .order("vigente_desde", { ascending: false });
  if (error) throw new Error(mensajeErrorAmigable(error));
  return (data ?? []).map(filaAPlantilla);
}

/**
 * La versión vigente es simplemente la más reciente por `vigente_desde` —
 * confirmado literal en el bundle (`lw()`): no se filtra por empresa_grupo
 * al resolver la vigente, esa columna es solo metadato informativo de qué
 * empresa motivó la publicación de esa versión.
 */
export async function traerVersionVigentePlantilla(): Promise<PlantillaConvenioHcpVersion | null> {
  const { data, error } = await supabase
    .from("plantilla_convenio_hcp_version")
    .select("*")
    .order("vigente_desde", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`No se pudo cargar la plantilla legal del Convenio HCP: ${mensajeErrorAmigable(error)}`);
  return data ? filaAPlantilla(data) : null;
}

export async function publicarNuevaVersionPlantilla(
  datos: Pick<PlantillaConvenioHcpVersion, "notasVersion" | "numerales" | "anexoCEn" | "anexoCEs" | "anexoDEn" | "anexoDEs">,
  actorId: string,
  empresaGrupo: string,
): Promise<PlantillaConvenioHcpVersion> {
  const { data, error } = await supabase
    .from("plantilla_convenio_hcp_version")
    .insert({
      creado_por_id: actorId,
      notas_version: datos.notasVersion,
      numerales: datos.numerales,
      anexo_c_en: datos.anexoCEn,
      anexo_c_es: datos.anexoCEs,
      anexo_d_en: datos.anexoDEn,
      anexo_d_es: datos.anexoDEs,
      empresa_grupo: empresaGrupo.trim() || null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`No se pudo publicar la nueva versión de la plantilla: ${mensajeErrorAmigable(error)}`);
  return filaAPlantilla(data);
}

/**
 * Sustituye el placeholder `{{empresa}}` por el nombre real de la compañía
 * — se aplica UNA sola vez, al crear el Convenio HCP, y el resultado queda
 * congelado en `clausulado_snapshot` (confirmado literal en el bundle,
 * función `dw()`).
 */
export function sustituirEmpresaEnPlantilla(
  plantilla: Pick<PlantillaConvenioHcpVersion, "numerales" | "anexoCEn" | "anexoCEs" | "anexoDEn" | "anexoDEs">,
  companiaNombre: string,
): ClausuladoSnapshot {
  const nombreEn = companiaNombre.trim() || "[Company]";
  const nombreEs = companiaNombre.trim() || "[Compañía]";
  const sustituir = (texto: string, nombre: string) => texto.split("{{empresa}}").join(nombre);
  return {
    numerales: plantilla.numerales.map((n) => ({
      numero: n.numero,
      textoEn: sustituir(n.textoEn, nombreEn),
      textoEs: sustituir(n.textoEs, nombreEs),
    })),
    anexoCEn: sustituir(plantilla.anexoCEn, nombreEn),
    anexoCEs: sustituir(plantilla.anexoCEs, nombreEs),
    anexoDEn: sustituir(plantilla.anexoDEn, nombreEn),
    anexoDEs: sustituir(plantilla.anexoDEs, nombreEs),
  };
}

export const CLAUSULADO_SNAPSHOT_VACIO: ClausuladoSnapshot = { ...PLANTILLA_VACIA };

/**
 * Entrega 32: si por cualquier motivo una misma sección tiene más de un ajuste guardado (p. ej. el borrado del ajuste
 * anterior fue filtrado en silencio por una política de seguridad y se insertó el nuevo igualmente), gana el MÁS RECIENTE.
 * Antes se usaba el primero de la lista (ordenada de la más antigua a la más reciente), es decir, el texto viejo.
 */
export function ajusteVigenteSeccion<T extends { seccion: string; creadoEn: string }>(ajustes: T[], seccion: string): T | undefined {
  let elegido: T | undefined;
  for (const a of ajustes) {
    if (a.seccion !== seccion) continue;
    if (!elegido || new Date(a.creadoEn).getTime() >= new Date(elegido.creadoEn).getTime()) elegido = a;
  }
  return elegido;
}

/**
 * Resuelve el texto efectivo de una sección (un numeral o un anexo C/D):
 * si el Convenio HCP tiene un ajuste puntual guardado para esa sección, ese
 * ajuste gana; si no, se usa el snapshot congelado al crearse el documento
 * — confirmado literal en el bundle (`WL()`).
 */
export function textoEfectivoSeccion(
  convenio: Pick<ConvenioHcp, "clausuladoSnapshot" | "ajustesClausula">,
  seccion: string,
): { es: string; en: string } {
  const ajuste = ajusteVigenteSeccion(convenio.ajustesClausula, seccion);
  if (ajuste) return { es: ajuste.textoEs, en: ajuste.textoEn };

  const snapshot = convenio.clausuladoSnapshot ?? CLAUSULADO_SNAPSHOT_VACIO;
  if (seccion === "anexo_c") return { es: snapshot.anexoCEs, en: snapshot.anexoCEn };
  if (seccion === "anexo_d") return { es: snapshot.anexoDEs, en: snapshot.anexoDEn };
  const numero = Number(seccion.replace("numeral_", ""));
  const numeral = snapshot.numerales.find((n) => n.numero === numero);
  return { es: numeral?.textoEs ?? "", en: numeral?.textoEn ?? "" };
}

export async function traerAjustesClausula(convenioHcpId: string): Promise<AjusteClausulaConvenioHcp[]> {
  const { data, error } = await supabase
    .from("convenio_hcp_ajustes_clausula")
    .select("*")
    .eq("convenio_hcp_id", convenioHcpId)
    .order("creado_en", { ascending: true });
  if (error) throw new Error(mensajeErrorAmigable(error));
  return (data ?? []).map((fila) => ({
    id: fila.id,
    convenioHcpId: fila.convenio_hcp_id,
    seccion: fila.seccion,
    textoEn: fila.texto_en,
    textoEs: fila.texto_es,
    justificacion: fila.justificacion,
    creadoPorId: fila.creado_por_id,
    creadoEn: fila.creado_en,
  }));
}

export async function guardarAjusteClausula(
  convenioHcpId: string,
  seccion: string,
  textoEs: string,
  textoEn: string,
  justificacion: string,
  actorId: string,
): Promise<AjusteClausulaConvenioHcp> {
  // Un ajuste reemplaza cualquier ajuste previo de la misma sección — se
  // borra el anterior (si existe) antes de insertar el nuevo, para no
  // acumular versiones de un mismo numeral.
  const { error: errorBorrado } = await supabase.from("convenio_hcp_ajustes_clausula").delete().eq("convenio_hcp_id", convenioHcpId).eq("seccion", seccion);
  if (errorBorrado) throw new Error(`No se pudo reemplazar el ajuste anterior de la cláusula: ${mensajeErrorAmigable(errorBorrado)}`);
  const { data, error } = await supabase
    .from("convenio_hcp_ajustes_clausula")
    .insert({
      convenio_hcp_id: convenioHcpId,
      seccion,
      texto_es: textoEs,
      texto_en: textoEn,
      justificacion,
      creado_por_id: actorId,
    })
    .select("*")
    .single();
  if (error) throw new Error(`No se pudo guardar el ajuste de cláusula: ${mensajeErrorAmigable(error)}`);
  return {
    id: data.id,
    convenioHcpId: data.convenio_hcp_id,
    seccion: data.seccion,
    textoEn: data.texto_en,
    textoEs: data.texto_es,
    justificacion: data.justificacion,
    creadoPorId: data.creado_por_id,
    creadoEn: data.creado_en,
  };
}

export async function eliminarAjusteClausula(id: string): Promise<void> {
  const { error } = await supabase.from("convenio_hcp_ajustes_clausula").delete().eq("id", id);
  if (error) throw new Error(mensajeErrorAmigable(error));
}
