import * as React from "react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Selector de compañía del grupo (pedido explícito, octubre 2026): "desde
 * el login, un usuario pueda escoger con qué compañía del grupo, de las
 * que tiene habilitadas en su usuario, va a trabajar" — y que, con base en
 * esa decisión, se muestre únicamente la información de esa empresa en
 * particular.
 *
 * Reglas acordadas:
 * - 0 o 1 compañía en `usuario.empresasGrupo` → no hay nada que elegir, se
 *   entra directo (0 compañías es el mismo comodín "todas/sin restricción"
 *   que ya usa el resto de la app — ver `seCruzan`/`dentroDelAlcance` en
 *   `lib/usuarios.ts` — así que tampoco se filtra nada para ese usuario).
 * - 2+ compañías → se recuerda la última elección en `localStorage`
 *   (por usuario, para no pedírsela otra vez en cada recarga); si no hay
 *   una elección recordada (o la recordada ya no está habilitada para este
 *   usuario), `necesitaSeleccion` queda en `true` hasta que se llame
 *   `fijarCompania`.
 */
interface CompaniaContextValue {
  companiaActual: string | null;
  necesitaSeleccion: boolean;
  fijarCompania: (empresa: string) => void;
}

const CompaniaContext = React.createContext<CompaniaContextValue | null>(null);

function claveAlmacenamiento(usuarioId: string): string {
  return `beats_compania_actual_${usuarioId}`;
}

export function CompaniaProvider({ children }: { children: React.ReactNode }) {
  const { usuario } = useAuth();
  const [companiaActual, setCompaniaActual] = React.useState<string | null>(null);
  const [necesitaSeleccion, setNecesitaSeleccion] = React.useState(false);

  React.useEffect(() => {
    if (!usuario) {
      setCompaniaActual(null);
      setNecesitaSeleccion(false);
      return;
    }
    if (usuario.empresasGrupo.length <= 1) {
      setCompaniaActual(usuario.empresasGrupo[0] ?? null);
      setNecesitaSeleccion(false);
      return;
    }
    let recordada: string | null = null;
    try {
      recordada = localStorage.getItem(claveAlmacenamiento(usuario.id));
    } catch {
      recordada = null;
    }
    if (recordada && usuario.empresasGrupo.includes(recordada)) {
      setCompaniaActual(recordada);
      setNecesitaSeleccion(false);
    } else {
      setCompaniaActual(null);
      setNecesitaSeleccion(true);
    }
    // Se reevalúa solo cuando cambia el usuario en sesión (login/logout) —
    // `usuario.empresasGrupo` es estable mientras dure la sesión de ese
    // mismo usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.id]);

  const fijarCompania = React.useCallback(
    (empresa: string) => {
      setCompaniaActual(empresa);
      setNecesitaSeleccion(false);
      if (usuario) {
        try {
          localStorage.setItem(claveAlmacenamiento(usuario.id), empresa);
        } catch {
          // Almacenamiento no disponible (navegación privada, cuota, etc.) —
          // se recuerda igual durante esta sesión en memoria, solo no
          // sobrevive a un recargado. No es razón para romper la selección.
        }
      }
    },
    [usuario],
  );

  const value: CompaniaContextValue = { companiaActual, necesitaSeleccion, fijarCompania };

  return <CompaniaContext.Provider value={value}>{children}</CompaniaContext.Provider>;
}

export function useCompania(): CompaniaContextValue {
  const ctx = React.useContext(CompaniaContext);
  if (!ctx) throw new Error("useCompania debe usarse dentro de <CompaniaProvider>");
  return ctx;
}

/**
 * Helpers de filtrado compartidos por las pantallas que listan documentos
 * (Tablero, Auditoría, Tareas Pendientes, Informes, etc.) — mismo criterio
 * en todas: si no hay compañía seleccionada (no debería pasar una vez
 * elegida, pero es la opción defensiva), no se filtra nada.
 *
 * `Evento`/`Fmv`/`NotificacionPagoHcp` llevan su propio `empresaGrupo`
 * directo. `Caf`/`Convenio`/`ConvenioHcp` no lo llevan — se derivan por su
 * `eventoOrigenId` contra el conjunto de ids de eventos ya filtrados (ver
 * `filtrarPorEventoOrigen`).
 */
export function filtrarPorEmpresaGrupo<T extends { empresaGrupo: string | null }>(
  items: T[],
  companiaActual: string | null,
): T[] {
  if (!companiaActual) return items;
  return items.filter((item) => item.empresaGrupo === companiaActual);
}

export function filtrarPorEventoOrigen<T extends { eventoOrigenId: string | null }>(
  items: T[],
  idsEventosPermitidos: Set<string>,
): T[] {
  return items.filter((item) => item.eventoOrigenId != null && idsEventosPermitidos.has(item.eventoOrigenId));
}
