import type { Caf, Convenio, ConvenioHcp, Evento, Fmv, NotificacionPagoHcp } from "@/types";
import type { TipoDoc } from "@/lib/enums";
import { traerEventos } from "@/lib/evento";
import { traerCafs } from "@/lib/caf";
import { traerConvenios } from "@/lib/convenio";
import { traerConveniosHCP } from "@/lib/convenioHCP";
import { traerFmvs } from "@/lib/fmv";
import { traerNotificacionesPago } from "@/lib/notificacionPago";

/**
 * Fase 6 (Tablero, Informes y Auditoría enriquecidos) — varias pantallas
 * nuevas necesitan trabajar sobre "cualquiera de los 6 documentos" sin
 * importar el tipo (Tareas Pendientes, Auditoría de Eventos, Historial):
 * un tipo unión discriminado por `tipoDoc`, igual que ya lo usa
 * `DetalleXxx`/`Tablero.tsx` internamente, más un par de utilidades
 * confirmadas por extracción directa del bundle original.
 */
export type DocumentoAny = Evento | Convenio | Fmv | NotificacionPagoHcp | Caf | ConvenioHcp;

/**
 * Subconjunto de `DocumentoAny` que sí tiene cadena de aprobación
 * (`aprobaciones`) — FMV y Notificación de Pago son de un solo firmante y no
 * la tienen. Usado por pantallas como Tareas Pendientes que necesitan leer
 * `doc.aprobaciones` sin que TypeScript se queje de que el campo no existe
 * en la unión completa.
 */
export type DocumentoConCadena = Evento | Convenio | Caf | ConvenioHcp;

/**
 * Título genérico de un documento para listas mixtas (Tareas Pendientes,
 * Historial). Confirmado por extracción directa del bundle original
 * (función `Lz`) — cada tipo usa su propio campo de "nombre" con un sufijo
 * fijo, salvo la Solicitud de Evento que no lleva sufijo.
 */
export function tituloDocumentoGenerico(doc: DocumentoAny): string {
  switch (doc.tipoDoc) {
    case "evento":
      return doc.nombreEvento || "(sin nombre)";
    case "convenio":
      return `${doc.hcpNombreCompleto || "(sin nombre)"} — Convenio de Pago`;
    case "notificacionPago":
      return `${doc.nombreProfesionalSalud || "(sin nombre)"} — Notificación de Pago`;
    case "caf":
      return `${doc.contraparteNombre || "(sin nombre)"} — CAF`;
    case "convenioHCP":
      return `${doc.consultorNombre || "(sin nombre)"} — Convenio HCP`;
    case "fmv":
      return `${doc.nombreCompleto || "(sin nombre)"} — FMV Checklist`;
  }
}

/** Días transcurridos desde una fecha ISO (0 si la fecha es inválida o futura). Confirmado por extracción directa del bundle original (función `Iz`). */
export function diasTranscurridos(fechaIso: string): number {
  const t = new Date(fechaIso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

/**
 * Vuelve a leer un documento (misma lectura que usa el Tablero) para
 * refrescar su ventana tras un cambio. `null` si ya no existe.
 */
export async function traerDocumentoActualizado(tipoDoc: TipoDoc, id: string): Promise<DocumentoAny | null> {
  switch (tipoDoc) {
    case "evento":
      return (await traerEventos()).find((d) => d.id === id) ?? null;
    case "caf":
      return (await traerCafs()).find((d) => d.id === id) ?? null;
    case "convenio":
      return (await traerConvenios()).find((d) => d.id === id) ?? null;
    case "convenioHCP":
      return (await traerConveniosHCP()).find((d) => d.id === id) ?? null;
    case "fmv":
      return (await traerFmvs()).find((d) => d.id === id) ?? null;
    case "notificacionPago":
      return (await traerNotificacionesPago()).find((d) => d.id === id) ?? null;
  }
}
