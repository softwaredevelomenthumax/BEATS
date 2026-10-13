import type { Convenio, Evento, Speaker } from "@/types";

/**
 * Octubre 2026, pedido explícito: los informes de speakers (Participación de un Speaker por Período e Informe de
 * Speakers) solo deben mostrar speakers ASOCIADOS a la empresa del grupo con la que se está trabajando en la sesión.
 *
 * Un speaker está asociado a una empresa si:
 *   · la declara en «Empresa(s) del grupo con la(s) cuál(es) tendrá interacción» (`empresasGrupoInteraccion`), o
 *   · tiene participación en un evento de esa empresa (como speaker de la solicitud o con un Convenio de Pago a HCP
 *     de un evento de esa empresa) — así no se pierden speakers históricos que no tenían ese campo diligenciado.
 *
 * Sin empresa elegida (`null`/vacía) no se filtra nada (mismo comodín que el resto de la app).
 */
export function idsSpeakersDeEmpresa(params: {
  empresa: string | null;
  speakers: Pick<Speaker, "id" | "empresasGrupoInteraccion">[];
  eventos: Pick<Evento, "id" | "empresaGrupo" | "speakersParticipacion">[];
  convenios: Pick<Convenio, "eventoOrigenId" | "speakerId">[];
}): Set<string> | null {
  const { empresa, speakers, eventos, convenios } = params;
  if (!empresa) return null;
  const mismaEmpresa = (a: string | null | undefined) => (a ?? "").trim().toLowerCase() === empresa.trim().toLowerCase();
  const ids = new Set<string>();
  for (const s of speakers) if ((s.empresasGrupoInteraccion ?? []).some(mismaEmpresa)) ids.add(s.id);
  const eventosDeEmpresa = new Set(eventos.filter((e) => mismaEmpresa(e.empresaGrupo)).map((e) => e.id));
  for (const e of eventos) {
    if (!eventosDeEmpresa.has(e.id)) continue;
    for (const sp of e.speakersParticipacion) if (sp.speakerId) ids.add(sp.speakerId);
  }
  for (const c of convenios) if (c.speakerId && c.eventoOrigenId && eventosDeEmpresa.has(c.eventoOrigenId)) ids.add(c.speakerId);
  return ids;
}
