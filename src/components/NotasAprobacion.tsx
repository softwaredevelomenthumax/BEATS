import { formatearFechaHora } from "@/lib/fecha";
import type { PasoAprobacion } from "@/lib/aprobaciones";
import { cn } from "@/lib/utils";
import { AvatarUsuario } from "@/components/AvatarUsuario";

/**
 * Octubre 2026 (entrega 25), pedido explícito: las notas de aprobación o rechazo que deja cada
 * usuario al firmar (cualquier formulario con cadena de aprobación) deben verse, en orden
 * cronológico y de forma organizada,
 *   - en la vista del documento, justo después de la «Cadena de aprobación» (y antes del
 *     «Código de acceso»), y
 *   - al final de la vista previa / impresión / PDF, justo después del panel de firmas.
 *
 * Una «nota» es el comentario de una etapa ya resuelta (aprobada o rechazada). Las etapas
 * pendientes o sin comentario no aparecen.
 */
export interface NotaAprobacion {
  orden: number;
  etapa: string;
  decision: "aprobado" | "rechazado";
  fecha: string | null;
  autorId?: string;
  comentario: string;
}

/** Notas de la cadena, de la más antigua a la más reciente (sin fecha, por orden de etapa). */
export function notasDeAprobacion(pasos: PasoAprobacion[]): NotaAprobacion[] {
  return pasos
    .filter((p) => (p.estado === "aprobado" || p.estado === "rechazado") && (p.comentario ?? "").trim() !== "")
    .map((p) => ({
      orden: p.orden,
      etapa: p.etiqueta,
      decision: p.estado as "aprobado" | "rechazado",
      fecha: p.fecha ?? null,
      autorId: p.resueltoPorId,
      comentario: (p.comentario ?? "").trim(),
    }))
    .sort((a, b) => {
      if (a.fecha && b.fecha) return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.orden - b.orden;
      if (a.fecha) return -1;
      if (b.fecha) return 1;
      return a.orden - b.orden;
    });
}

const ETIQUETAS = {
  es: { titulo: "Notas de aprobación", aprobo: "Aprobó", rechazo: "Rechazó", etapa: "Etapa", autor: "Nombre", fecha: "Fecha y hora", decision: "Decisión", nota: "Nota" },
  en: { titulo: "Approval notes", aprobo: "Approved", rechazo: "Rejected", etapa: "Stage", autor: "Name", fecha: "Date and time", decision: "Decision", nota: "Note" },
} as const;

/** Vista del documento (pantalla): lista cronológica. No se pinta nada si no hay notas. */
export function NotasAprobacionVista({
  pasos,
  resolverNombre,
}: {
  pasos: PasoAprobacion[];
  resolverNombre: (id?: string) => string;
}) {
  const notas = notasDeAprobacion(pasos);
  if (notas.length === 0) return null;
  const t = ETIQUETAS.es;
  return (
    <div className="flex flex-col gap-2" data-testid="notas-aprobacion">
      <h3 className="text-sm font-semibold">{t.titulo}</h3>
      <ol className="flex flex-col gap-2">
        {notas.map((n) => (
          <li key={n.orden} className="rounded-md border p-2 text-sm">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{n.etapa}</span>
              <span className="flex items-center gap-1.5">· {n.autorId && <AvatarUsuario usuarioId={n.autorId} nombre={resolverNombre(n.autorId)} className="size-5" fallbackClassName="text-[9px]" />}{resolverNombre(n.autorId)}</span>
              <span className={cn("font-semibold", n.decision === "aprobado" ? "text-emerald-700" : "text-red-700")}>
                · {n.decision === "aprobado" ? t.aprobo : t.rechazo}
              </span>
              {n.fecha && <span>· {formatearFechaHora(n.fecha)}</span>}
            </div>
            <p className="mt-1 whitespace-pre-wrap">{n.comentario}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Vista previa / impresión / PDF: tabla cronológica. No se pinta nada si no hay notas. */
export function NotasAprobacionImpresa({
  pasos,
  resolverNombre,
  idioma = "es",
}: {
  pasos: PasoAprobacion[];
  resolverNombre: (id?: string) => string;
  idioma?: "es" | "en";
}) {
  const notas = notasDeAprobacion(pasos);
  if (notas.length === 0) return null;
  const t = ETIQUETAS[idioma];
  return (
    <div className="mt-3 break-inside-avoid" data-testid="notas-aprobacion-impresa">
      <h3 className="mb-1 text-xs font-bold uppercase tracking-wide">{t.titulo}</h3>
      <table className="w-full border-collapse border border-gray-400 text-[11px]">
        <thead>
          <tr className="bg-gray-100">
            <th className="w-6 border border-gray-400 p-1.5 text-left font-semibold">#</th>
            <th className="border border-gray-400 p-1.5 text-left font-semibold">{t.etapa}</th>
            <th className="border border-gray-400 p-1.5 text-left font-semibold">{t.autor}</th>
            <th className="border border-gray-400 p-1.5 text-left font-semibold">{t.decision}</th>
            <th className="border border-gray-400 p-1.5 text-left font-semibold">{t.fecha}</th>
            <th className="w-[40%] border border-gray-400 p-1.5 text-left font-semibold">{t.nota}</th>
          </tr>
        </thead>
        <tbody>
          {notas.map((n, i) => (
            <tr key={n.orden} className="break-inside-avoid align-top">
              <td className="border border-gray-400 p-1.5">{i + 1}</td>
              <td className="border border-gray-400 p-1.5 font-medium">{n.etapa}</td>
              <td className="border border-gray-400 p-1.5">{resolverNombre(n.autorId)}</td>
              <td className={cn("border border-gray-400 p-1.5 font-semibold", n.decision === "aprobado" ? "text-emerald-700" : "text-red-700")}>
                {n.decision === "aprobado" ? t.aprobo : t.rechazo}
              </td>
              <td className="border border-gray-400 p-1.5">{n.fecha ? formatearFechaHora(n.fecha) : "—"}</td>
              <td className="whitespace-pre-wrap border border-gray-400 p-1.5">{n.comentario}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
