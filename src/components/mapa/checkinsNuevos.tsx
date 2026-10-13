import * as React from "react";
import { UserCheck } from "lucide-react";
import { norm, ubicarCiudad } from "@/lib/geo/geo";

/**
 * Entrega 31 — aviso de «nuevo asistente» (check-in) compartido por la Marquesina y el Panel en Vivo.
 *
 * Corrige el aviso de la Marquesina, que no se veía: dependía de que justo en ese momento estuviera a la vista la
 * tarjeta del contador (en modo carrusel casi nunca), y solo cambiaba cuando subía el total. Ahora es una notificación
 * flotante fija que aparece en cualquier lámina/modo, con quién llegó (iniciales, especialidad, ciudad) cuando la base
 * lo informa; y si solo sube el total, avisa «+N asistente(s)».
 */

export interface CheckinLite {
  id?: string;
  /** Solo vistas internas (Panel en vivo). La marquesina no lo informa. */
  nombre?: string;
  iniciales: string;
  especialidad: string;
  ciudad: string;
  pais?: string;
  tipo: string;
  capturadoEn: string;
}

export interface AvisoCheckin {
  key: string;
  n: number;
  items: CheckinLite[];
}

const DURACION_AVISO_MS = 9000;
const DURACION_PING_MS = 14000;

export const idCheckin = (c: CheckinLite): string => c.id || `${c.capturadoEn}|${c.iniciales}|${c.ciudad}|${c.tipo}`;
export const idPuntoDeCheckin = (c: CheckinLite, paisEvento?: string | null): string | null => {
  const u = ubicarCiudad(c.ciudad, c.pais, paisEvento);
  return u ? `${u.iso}:${norm(c.ciudad)}` : null;
};

export function useCheckinsNuevos(ultimos: CheckinLite[] | null | undefined, total: number, paisEvento?: string | null, clave?: string) {
  const [avisos, setAvisos] = React.useState<AvisoCheckin[]>([]);
  const [recientes, setRecientes] = React.useState<ReadonlySet<string>>(() => new Set());
  const vistos = React.useRef<Set<string> | null>(null);
  const totalPrevio = React.useRef<number | null>(null);
  const timers = React.useRef<number[]>([]);

  React.useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const anunciar = React.useCallback(
    (datos: { n: number; items: CheckinLite[] }, nuevos: CheckinLite[]) => {
      const aviso: AvisoCheckin = { key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ...datos };
      setAvisos((a) => [aviso, ...a].slice(0, 3));
      timers.current.push(window.setTimeout(() => setAvisos((a) => a.filter((x) => x.key !== aviso.key)), DURACION_AVISO_MS));
      const ids = nuevos.map((c) => idPuntoDeCheckin(c, paisEvento)).filter((x): x is string => Boolean(x));
      if (ids.length > 0) {
        setRecientes((prev) => new Set([...prev, ...ids]));
        timers.current.push(
          window.setTimeout(
            () =>
              setRecientes((prev) => {
                const s = new Set(prev);
                ids.forEach((i) => s.delete(i));
                return s;
              }),
            DURACION_PING_MS,
          ),
        );
      }
    },
    [paisEvento],
  );

  // Al cambiar de evento (clave) se vuelve a tomar un punto de partida: no se anuncian los check-ins del evento anterior.
  const claveAnterior = React.useRef(clave);
  if (claveAnterior.current !== clave) {
    claveAnterior.current = clave;
    vistos.current = null;
    totalPrevio.current = null;
  }

  React.useEffect(() => {
    // Sin el detalle de los últimos check-ins (aún no llega o la función ampliada no está instalada): solo se vigila el total.
    if (ultimos == null) {
      if (totalPrevio.current == null) {
        totalPrevio.current = total;
        return;
      }
      const sube = total - totalPrevio.current;
      totalPrevio.current = total;
      if (sube > 0) anunciar({ n: sube, items: [] }, []);
      return;
    }
    const lista = ultimos;
    // Primer dato completo: solo se toma como punto de partida (no se anuncian los que ya estaban).
    if (vistos.current === null) {
      vistos.current = new Set(lista.map(idCheckin));
      totalPrevio.current = total;
      return;
    }
    const nuevos = lista.filter((c) => !vistos.current!.has(idCheckin(c)));
    nuevos.forEach((c) => vistos.current!.add(idCheckin(c)));
    const delta = totalPrevio.current != null ? total - totalPrevio.current : 0;
    totalPrevio.current = total;
    if (nuevos.length === 0 && delta <= 0) return;

    anunciar({ n: Math.max(nuevos.length, delta, 1), items: nuevos.slice(0, 3) }, nuevos);
  }, [ultimos, total, anunciar]);

  return { avisos, recientes };
}

const ESTILOS = `
@keyframes ci-entra{from{opacity:0;transform:translateX(40px) scale(.96)}to{opacity:1;transform:none}}
@keyframes ci-brilla{0%{box-shadow:0 0 0 0 rgba(27,175,122,.55)}100%{box-shadow:0 0 0 14px rgba(27,175,122,0)}}
.ci-aviso{animation:ci-entra .5s cubic-bezier(.2,.8,.2,1) both,ci-brilla 1.6s ease-out 2}
@media (prefers-reduced-motion:reduce){.ci-aviso{animation:none!important}}
`;

export function AvisosCheckin({ avisos, className, arriba = 16 }: { avisos: AvisoCheckin[]; className?: string; arriba?: number }) {
  if (avisos.length === 0) return null;
  return (
    <div className={className} style={{ position: "fixed", top: arriba, right: 16, zIndex: 60, display: "flex", flexDirection: "column", gap: 8, width: "min(360px, calc(100vw - 32px))", pointerEvents: "none" }} aria-live="polite" data-testid="avisos-checkin">
      <style>{ESTILOS}</style>
      {avisos.map((a) => (
        <div key={a.key} className="ci-aviso" data-testid="aviso-checkin" style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", borderLeft: "6px solid #1baf7a", borderRadius: 14, padding: "10px 14px", boxShadow: "0 10px 30px rgba(15,23,42,.22)", color: "#334155" }}>
          <span style={{ width: 40, height: 40, flex: "none", borderRadius: 999, background: "#1baf7a", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
            {(a.items[0]?.nombre && a.items[0]?.iniciales) || <UserCheck size={20} />}
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#0f766e" }}>
              {a.n === 1 ? "¡Nuevo asistente!" : `¡${a.n} nuevos asistentes!`}
            </span>
            <span style={{ display: "block", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {a.items.length > 0
                ? a.items.map((c) => [c.nombre, c.especialidad || "Profesional de la salud", c.ciudad].filter(Boolean).join(" · ")).join("  |  ")
                : "Acaba de hacer check-in"}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
