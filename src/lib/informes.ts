import type { Evento, RegistroParticipacion } from "@/types";
import { traerEventos } from "@/lib/evento";
import { traerRegistrosParticipacion, traerMuestrasEntregadas, calcularResumenEjecucion } from "@/lib/ejecucion";
import { mismoPais } from "@/lib/paisCanonico";

/**
 * Fila agregada por evento para "Ejecución de Eventos" (informe-ejecucion-
 * eventos): un renglón por Evento con Aprobado/Completado, con sus
 * totales de participación y muestras entregadas ya calculados.
 */
export interface FilaEjecucionEvento {
  eventoId: string;
  nombreEvento: string;
  empresaGrupo: string;
  pais: string;
  ciudad: string;
  fechaInicioEvento: string | null;
  totalParticipantes: number;
  totalMuestras: number;
}

/** Solo tiene sentido reportar ejecución de eventos que ya pasaron por la cadena de aprobación — Borrador/Pendiente/Rechazado/Anulado no se ejecutan en sitio. */
const ESTADOS_EJECUTABLES = new Set(["Aprobado", "Completado"]);

export async function traerEjecucionEventosAgregada(): Promise<FilaEjecucionEvento[]> {
  const [eventos, registros, muestras] = await Promise.all([
    traerEventos(),
    traerRegistrosParticipacion(),
    traerMuestrasEntregadas(),
  ]);
  const eventosEjecutables = eventos.filter((e) => ESTADOS_EJECUTABLES.has(e.estado));
  return eventosEjecutables.map((evento) => {
    const registrosEvento = registros.filter((r) => r.eventoId === evento.id);
    const muestrasEvento = muestras.filter((m) => m.eventoId === evento.id);
    const resumen = calcularResumenEjecucion(registrosEvento, muestrasEvento);
    return {
      eventoId: evento.id,
      nombreEvento: evento.nombreEvento,
      empresaGrupo: evento.empresaGrupo,
      pais: evento.pais,
      ciudad: evento.ciudad,
      fechaInicioEvento: evento.fechaInicioEvento,
      totalParticipantes: resumen.totalParticipantes,
      totalMuestras: resumen.totalMuestras,
    };
  });
}

/**
 * Un HCP "impactado" se identifica por cédula (mismo criterio que usaría
 * cualquier reporte regulatorio de trazabilidad de asistentes) — se agrupan
 * todos sus registros de participación, sin importar en cuántos eventos
 * distintos haya asistido.
 */
export interface HcpImpactado {
  cedula: string;
  nombreCompleto: string;
  profesion: string;
  especialidad: string;
  pais: string;
  ciudad: string;
  totalParticipaciones: number;
  eventosIds: string[];
  ultimaParticipacion: string;
}

function agruparPorHcp(registros: RegistroParticipacion[]): HcpImpactado[] {
  const porCedula = new Map<string, RegistroParticipacion[]>();
  for (const r of registros) {
    if (!r.cedula) continue;
    const filas = porCedula.get(r.cedula);
    if (filas) filas.push(r);
    else porCedula.set(r.cedula, [r]);
  }
  const resultado: HcpImpactado[] = [];
  for (const [cedula, filas] of porCedula) {
    const masReciente = filas.reduce((a, b) => (a.capturadoEn > b.capturadoEn ? a : b));
    resultado.push({
      cedula,
      nombreCompleto: `${masReciente.nombres} ${masReciente.apellidos}`.trim(),
      profesion: masReciente.profesion,
      especialidad: masReciente.especialidad || masReciente.especialidadOtra,
      pais: masReciente.pais,
      ciudad: masReciente.ciudad,
      totalParticipaciones: filas.length,
      eventosIds: Array.from(new Set(filas.map((f) => f.eventoId))),
      ultimaParticipacion: masReciente.capturadoEn,
    });
  }
  return resultado.sort((a, b) => (a.ultimaParticipacion < b.ultimaParticipacion ? 1 : -1));
}

/**
 * Fase 6 (Tablero, Informes y Auditoría enriquecidos) — filtro por período
 * (sobre `capturadoEn`, la fecha real del registro de participación) y por
 * país, confirmado como enriquecimiento pedido para este informe. La
 * extracción forense del bundle original mostró que su versión real de
 * este informe usa un diseño distinto (agregado por evento/categoría a
 * partir del conteo manual de la Lista de Asistencia, con el check-in
 * digital de Ejecución en Sitio como cifra aparte) — ver la nota en
 * `HcpsImpactados.tsx` para la decisión de mantener el agrupado por HCP/
 * cédula de esta reconstrucción en vez de rehacer la pantalla desde cero.
 */
export interface FiltrosHcpsImpactados {
  desde?: string;
  hasta?: string;
  pais?: string;
  /** Entrega 21: solo los registros de participación de ese evento (los totales por HCP pasan a ser de ese evento). */
  eventoId?: string;
}

export async function traerHcpsImpactados(filtros: FiltrosHcpsImpactados = {}): Promise<HcpImpactado[]> {
  const registros = await traerRegistrosParticipacion();
  const filtrados = registros.filter((r) => {
    const fecha = r.capturadoEn.slice(0, 10);
    if (filtros.desde && fecha < filtros.desde) return false;
    if (filtros.hasta && fecha > filtros.hasta) return false;
    if (filtros.pais && !mismoPais(r.pais, filtros.pais)) return false;
    if (filtros.eventoId && r.eventoId !== filtros.eventoId) return false;
    return true;
  });
  return agruparPorHcp(filtrados);
}

/** Nombre de un evento por id, con fallback — usado por las pantallas de informes que muestran eventosIds. */
export function nombreEventoPorId(eventos: Evento[], eventoId: string): string {
  return eventos.find((e) => e.id === eventoId)?.nombreEvento ?? "(evento eliminado)";
}
