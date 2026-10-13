import * as React from "react";
import { toast } from "sonner";
import {
  traerRepositorioArchivosEvento,
  traerRegistrosFinancierosEvento,
  traerAjustesDistribucionAsistentes,
  type AjusteDistribucionAsistentes,
} from "@/lib/repositorioEvento";
import { traerResumenConveniosHCPPorEvento, traerConveniosHCP, type ResumenConvenioHCPEvento } from "@/lib/convenioHCP";
import { traerConvenios } from "@/lib/convenio";
import { traerFmvs } from "@/lib/fmv";
import { traerCafs } from "@/lib/caf";
import { traerNotificacionesPago } from "@/lib/notificacionPago";
import { traerRegistrosParticipacion, traerRegistrosFuerzaVentas, traerMuestrasEntregadas } from "@/lib/ejecucion";
import { traerPortafolioProductos } from "@/lib/productos";
import { traerAnotacionesPagoEvento } from "@/lib/anotacionesPago";
import { construirAlcancesAsistencia, type AlcanceAsistencia } from "@/lib/expediente";
import type {
  Caf,
  Convenio,
  ConvenioHcp,
  Evento,
  Fmv,
  MuestraEntregada,
  AnotacionPago,
  NotificacionPagoHcp,
  RegistroFinancieroEvento,
  RegistroFuerzaVentas,
  RegistroParticipacion,
  RepositorioArchivoEvento,
} from "@/types";

export interface DatosExpedienteCargados {
  archivos: RepositorioArchivoEvento[];
  financieros: RegistroFinancieroEvento[];
  conveniosResumen: ResumenConvenioHCPEvento[];
  convenios: Convenio[];
  fmvs: Fmv[];
  cafs: Caf[];
  conveniosHcp: ConvenioHcp[];
  notificaciones: NotificacionPagoHcp[];
  registros: RegistroParticipacion[];
  fuerzaVentas: RegistroFuerzaVentas[];
  ajustes: AjusteDistribucionAsistentes[];
  /** Muestras médicas entregadas desde Ejecución (octubre 2026). */
  muestras: MuestraEntregada[];
  /** Entrega 36: anotaciones sobre el pago de los speakers (comentarios de comprobantes y aclaraciones de hallazgos). */
  anotaciones: AnotacionPago[];
  /** `productoId` → nombre, para mostrar las muestras entregadas. */
  nombresProductos: Record<string, string>;
}

const VACIO: DatosExpedienteCargados = {
  archivos: [],
  financieros: [],
  conveniosResumen: [],
  convenios: [],
  fmvs: [],
  cafs: [],
  conveniosHcp: [],
  notificaciones: [],
  registros: [],
  fuerzaVentas: [],
  ajustes: [],
  muestras: [],
  anotaciones: [],
  nombresProductos: {},
};

/**
 * Carga todo lo que necesita el Expediente de UN evento. Las listas de
 * documentos (FMV, Convenio de pago, CAF, Convenio HCP, Notificación) se
 * traen completas y se filtran por evento — es el mismo patrón que ya usan
 * Auditoría de Eventos y Tareas Pendientes, y reutiliza las reglas de
 * emparejamiento por speaker (`documentosPorSpeaker`).
 */
export function useExpediente(evento: Evento, abierto: boolean) {
  const [datos, setDatos] = React.useState<DatosExpedienteCargados>(VACIO);
  const [cargando, setCargando] = React.useState(true);

  const recargar = React.useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCargando(true);
      try {
        const [archivos, financieros, conveniosResumen, convenios, fmvs, cafs, conveniosHcp, notificaciones, registros, fuerzaVentas, ajustes, muestras, productos, anotaciones] = await Promise.all([
          traerRepositorioArchivosEvento(evento.id),
          traerRegistrosFinancierosEvento(evento.id),
          traerResumenConveniosHCPPorEvento(evento.id),
          traerConvenios(),
          traerFmvs(),
          traerCafs(),
          traerConveniosHCP(),
          traerNotificacionesPago(),
          traerRegistrosParticipacion(evento.id).catch(() => [] as RegistroParticipacion[]),
          traerRegistrosFuerzaVentas(evento.id),
          traerAjustesDistribucionAsistentes(evento.id),
          // Octubre 2026: solo tiene sentido si el evento entrega muestras médicas.
          evento.entregaMuestrasMedicas ? traerMuestrasEntregadas(evento.id).catch(() => [] as MuestraEntregada[]) : Promise.resolve([] as MuestraEntregada[]),
          evento.entregaMuestrasMedicas ? traerPortafolioProductos().catch(() => []) : Promise.resolve([]),
          // Entrega 36: si falla (p. ej. sin permiso), el Expediente sigue funcionando sin anotaciones.
          traerAnotacionesPagoEvento(evento.id).catch(() => [] as AnotacionPago[]),
        ]);
        const delEvento = <T extends { eventoOrigenId: string | null }>(l: T[]) => l.filter((d) => d.eventoOrigenId === evento.id);
        setDatos({
          archivos,
          financieros,
          conveniosResumen,
          convenios: delEvento(convenios),
          fmvs: delEvento(fmvs),
          cafs: delEvento(cafs),
          conveniosHcp: delEvento(conveniosHcp),
          notificaciones: delEvento(notificaciones),
          registros,
          fuerzaVentas,
          ajustes,
          muestras,
          anotaciones,
          nombresProductos: Object.fromEntries(productos.map((p) => [p.id, p.nombre])),
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo cargar el expediente del evento.");
      } finally {
        setCargando(false);
      }
    },
    [evento.id, evento.entregaMuestrasMedicas],
  );

  React.useEffect(() => {
    if (abierto) void recargar();
  }, [abierto, recargar]);

  const alcancesAsistencia: AlcanceAsistencia[] = React.useMemo(
    () =>
      construirAlcancesAsistencia({
        evento,
        registros: datos.registros,
        fuerzaVentas: datos.fuerzaVentas,
        archivos: datos.archivos,
        ajustes: datos.ajustes,
      }),
    [evento, datos.registros, datos.fuerzaVentas, datos.archivos, datos.ajustes],
  );

  return { datos, cargando, recargar, alcancesAsistencia };
}
