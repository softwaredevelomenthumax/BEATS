import { supabase } from "@/lib/supabaseClient";
import type { TipoDoc } from "@/lib/enums";
import type { Usuario } from "@/types";
import { mismoPais } from "@/lib/paisCanonico";

/**
 * Octubre 2026, pedido explícito: «Visor Documental» e «Historial y Auditoría» deben estar restringidos por PAÍS y
 * COMPAÑÍA — antes cualquiera con acceso a la pantalla veía los registros de todos los países y compañías del grupo.
 *
 * Regla única (la misma de todo el resto de la app, ver `lib/usuarios.ts`): las listas vacías de
 * `usuario.empresasGrupo` / `usuario.paisesOperacion` significan «sin restricción» (comodín); con valores, solo se ven
 * registros de esas compañías y países. Además, si la persona eligió una compañía de trabajo (`companiaActual`),
 * solo se ve esa compañía. Un registro cuyo país/compañía no se puede determinar NO se muestra a un usuario
 * restringido (no se asume que es de su alcance).
 */
export interface AlcanceRegistro {
  empresaGrupo: string | null;
  pais: string | null;
}

const normalizar = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Compañías con las que la persona puede ver registros ahora mismo (`null` = sin restricción de compañía). */
export function empresasPermitidas(usuario: Pick<Usuario, "empresasGrupo">, companiaActual: string | null): string[] | null {
  if (companiaActual) return [companiaActual];
  return usuario.empresasGrupo.length > 0 ? usuario.empresasGrupo : null;
}

/** Países que la persona puede ver (`null` = sin restricción de país). */
export function paisesPermitidos(usuario: Pick<Usuario, "paisesOperacion">): string[] | null {
  return usuario.paisesOperacion.length > 0 ? usuario.paisesOperacion : null;
}

export function empresaPermitida(permitidas: string[] | null, empresa: string | null | undefined): boolean {
  if (!permitidas) return true;
  const e = normalizar(empresa);
  return e !== "" && permitidas.some((p) => normalizar(p) === e);
}

export function paisPermitido(permitidos: string[] | null, pais: string | null | undefined): boolean {
  if (!permitidos) return true;
  const p = normalizar(pais);
  // «N/A» = evento virtual, sin país: se exime igual que en las políticas de la base (db/entrega_22b_eventos_virtuales_pais_na.sql).
  if (p === "n/a") return true;
  return p !== "" && permitidos.some((x) => mismoPais(x, pais));
}

export function alcanceVisible(
  usuario: Pick<Usuario, "empresasGrupo" | "paisesOperacion">,
  companiaActual: string | null,
  alcance: AlcanceRegistro,
): boolean {
  return empresaPermitida(empresasPermitidas(usuario, companiaActual), alcance.empresaGrupo) && paisPermitido(paisesPermitidos(usuario), alcance.pais);
}

// ---------------------------------------------------------------------------
// Resolución del alcance de un documento (compañía y país donde se generó)
// ---------------------------------------------------------------------------

const claveDoc = (tipoDoc: TipoDoc, id: string) => `${tipoDoc}:${id}`;

const TABLA_POR_TIPO: Record<TipoDoc, { tabla: string; columnas: string }> = {
  evento: { tabla: "solicitudes_evento", columnas: "id, empresa_grupo, pais" },
  fmv: { tabla: "fmv_checklists", columnas: "id, evento_origen_id, empresa_grupo, pais" },
  notificacionPago: { tabla: "notificaciones_pago_hcp", columnas: "id, evento_origen_id, empresa_grupo" },
  caf: { tabla: "cafs", columnas: "id, evento_origen_id" },
  convenio: { tabla: "convenios_pago_hcp", columnas: "id, evento_origen_id" },
  convenioHCP: { tabla: "convenios_hcp", columnas: "id, evento_origen_id" },
};

const LOTE = 150;
const trozos = <T,>(lista: T[]): T[][] => {
  const salida: T[][] = [];
  for (let i = 0; i < lista.length; i += LOTE) salida.push(lista.slice(i, i + LOTE));
  return salida;
};

async function filasPorIds(tabla: string, columnas: string, ids: string[]): Promise<Record<string, unknown>[]> {
  const resultado: Record<string, unknown>[] = [];
  for (const lote of trozos(ids)) {
    const { data, error } = await supabase.from(tabla).select(columnas).in("id", lote);
    if (error) throw error;
    resultado.push(...((data ?? []) as unknown as Record<string, unknown>[]));
  }
  return resultado;
}

/**
 * Compañía y país de cada documento (clave `tipo:id`): los propios del documento si los tiene; si no, los del evento
 * de origen. Documentos que ya no existen quedan sin entrada. Nunca lanza: ante un fallo devuelve lo que alcanzó a resolver.
 */
export async function resolverAlcanceDocumentos(items: { tipoDoc: TipoDoc; documentoId: string }[]): Promise<Map<string, AlcanceRegistro>> {
  const resultado = new Map<string, AlcanceRegistro>();
  try {
    const porTipo = new Map<TipoDoc, Set<string>>();
    for (const { tipoDoc, documentoId } of items) {
      if (!TABLA_POR_TIPO[tipoDoc] || !documentoId) continue;
      const ids = porTipo.get(tipoDoc) ?? new Set<string>();
      ids.add(documentoId);
      porTipo.set(tipoDoc, ids);
    }
    const propios = new Map<string, { empresa: string | null; pais: string | null; eventoId: string | null }>();
    const eventosAConsultar = new Set<string>();
    await Promise.all(
      [...porTipo.entries()].map(async ([tipoDoc, ids]) => {
        const { tabla, columnas } = TABLA_POR_TIPO[tipoDoc];
        const filas = await filasPorIds(tabla, columnas, [...ids]).catch(() => []);
        for (const f of filas) {
          const eventoId = tipoDoc === "evento" ? (f.id as string) : ((f.evento_origen_id as string | null) ?? null);
          propios.set(claveDoc(tipoDoc, f.id as string), {
            empresa: (f.empresa_grupo as string | null) || null,
            pais: (f.pais as string | null) || null,
            eventoId,
          });
          if (eventoId && (!(f.empresa_grupo as string | null) || !(f.pais as string | null))) eventosAConsultar.add(eventoId);
        }
      }),
    );
    const eventos = new Map<string, { empresa: string | null; pais: string | null }>();
    if (eventosAConsultar.size > 0) {
      const filas = await filasPorIds("solicitudes_evento", "id, empresa_grupo, pais", [...eventosAConsultar]).catch(() => []);
      for (const f of filas) eventos.set(f.id as string, { empresa: (f.empresa_grupo as string | null) || null, pais: (f.pais as string | null) || null });
    }
    for (const [clave, p] of propios) {
      const ev = p.eventoId ? eventos.get(p.eventoId) : undefined;
      resultado.set(clave, { empresaGrupo: p.empresa ?? ev?.empresa ?? null, pais: p.pais ?? ev?.pais ?? null });
    }
  } catch (error) {
    console.warn("No se pudo resolver el alcance (compañía/país) de los documentos:", error);
  }
  return resultado;
}

export function alcanceDe(mapa: Map<string, AlcanceRegistro>, tipoDoc: TipoDoc, documentoId: string): AlcanceRegistro | undefined {
  return mapa.get(claveDoc(tipoDoc, documentoId));
}
