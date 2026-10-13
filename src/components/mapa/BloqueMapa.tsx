import * as React from "react";
import { Globe2, MapPin, Radio } from "lucide-react";
import { MapaEnVivo, type SedeMapa } from "./MapaEnVivo";
import { esEventoVirtual, hayMapaDePais, inferirPais, isoDePais, nombreDePais, ubicarCiudad, ubicarPuntos, type UbicacionEntrada } from "@/lib/geo/geo";

/**
 * Entrega 31 — bloque «dónde está el evento y de dónde vienen los asistentes», compartido por el Panel en Vivo
 * (app con sesión) y la Marquesina (pantalla pública).
 *  · Presencial/híbrido: mapa del país del evento, sede marcada y ciudades de los asistentes.
 *  · Virtual: planisferio con los lugares desde donde se conectan (según el check-in) y un «centro de emisión».
 */

interface Props {
  entradas: UbicacionEntrada[];
  paisEvento?: string | null;
  ciudadEvento?: string | null;
  modalidad?: string | null;
  recientes?: ReadonlySet<string>;
  tema?: "claro" | "oscuro";
  alto?: number;
  /** Si es `true` (marquesina en pantalla de sala) la lista lateral usa tipografía más grande. */
  grande?: boolean;
  /** Lista de ciudades debajo del mapa (para columnas angostas). */
  vertical?: boolean;
}

export function BloqueMapa({ entradas, paisEvento, ciudadEvento, modalidad, recientes, tema = "claro", alto = 420, grande, vertical }: Props) {
  const tipo = esEventoVirtual(modalidad);
  const virtual = tipo === "virtual";
  const [vistaManual, setVistaManual] = React.useState<"pais" | "mundo" | null>(null);
  const [elegido, setElegido] = React.useState<string | null>(null);

  const pais = React.useMemo(() => paisEvento || (inferirPais(entradas.map((e) => e.ciudad)) ? nombreDePais(inferirPais(entradas.map((e) => e.ciudad))!) : null), [paisEvento, entradas]);
  const iso = isoDePais(pais);
  const { puntos, sinUbicar } = React.useMemo(() => ubicarPuntos(entradas, pais), [entradas, pais]);

  // Entrega 32: el mapa de país solo dibuja América; si hay asistentes en otros continentes la vista por defecto es el planisferio.
  const hayFueraDeAmerica = puntos.some((p) => !hayMapaDePais(p.iso));
  const puedePais = !virtual && hayMapaDePais(iso);
  const modo: "pais" | "mundo" = vistaManual === "pais" && hayMapaDePais(iso) ? "pais" : vistaManual === "mundo" ? "mundo" : puedePais && !hayFueraDeAmerica ? "pais" : "mundo";

  const sede: SedeMapa | null = React.useMemo(() => {
    if (!ciudadEvento) return null;
    const u = ubicarCiudad(ciudadEvento, pais);
    return u ? { x: u.punto.x, y: u.punto.y, nombre: ciudadEvento } : null;
  }, [ciudadEvento, pais]);

  const total = puntos.reduce((a, p) => a + p.total, 0);
  const oscuro = tema === "oscuro";
  const paisesDistintos = new Set(puntos.map((p) => p.iso)).size;
  const tam = grande ? "text-base" : "text-sm";

  return (
    <div className={vertical ? "grid gap-4" : "grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]"} data-testid="bloque-mapa">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: virtual ? "#e0f2fe" : "#ecfdf5", color: virtual ? "#075985" : "#047857" }} data-testid="mapa-modalidad">
            {virtual ? <Radio className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
            {virtual ? "Evento virtual" : tipo === "mixto" ? "Evento híbrido" : "Evento presencial"}
            {pais ? ` · ${pais}` : ""}
          </span>
          <div className="ml-auto inline-flex overflow-hidden rounded-full border border-slate-200 text-xs" role="group" aria-label="Vista del mapa">
            <button type="button" disabled={!hayMapaDePais(iso)} onClick={() => setVistaManual("pais")} aria-pressed={modo === "pais"} data-testid="mapa-ver-pais" className="px-3 py-1 disabled:opacity-40" style={modo === "pais" ? { background: "#00A3E0", color: "#fff" } : { background: "#fff", color: "#475569" }}>
              País
            </button>
            <button type="button" onClick={() => setVistaManual("mundo")} aria-pressed={modo === "mundo"} data-testid="mapa-ver-mundo" className="inline-flex items-center gap-1 px-3 py-1" style={modo === "mundo" ? { background: "#00A3E0", color: "#fff" } : { background: "#fff", color: "#475569" }}>
              <Globe2 className="h-3 w-3" /> Mundo
            </button>
          </div>
        </div>
        <MapaEnVivo modo={modo} iso={iso} puntos={puntos} sede={sede} recientes={recientes} virtual={virtual} tema={virtual || oscuro ? "oscuro" : "claro"} alto={alto} elegido={elegido} onElegir={setElegido} />
        {puntos.length === 0 && <p className="mt-2 text-center text-xs text-slate-500">Aún no hay check-ins con ciudad para ubicar en el mapa.</p>}
      </div>

      <aside className="flex min-w-0 flex-col" aria-label="Ciudades de los asistentes">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {virtual ? "Conectados desde" : "Asistentes desde"}
        </p>
        <p className="mb-2 text-xs text-slate-500">
          {puntos.length} {puntos.length === 1 ? "ciudad" : "ciudades"}
          {paisesDistintos > 1 ? ` · ${paisesDistintos} países` : ""} · {total} check-in(s)
        </p>
        <ul className="max-h-80 space-y-1 overflow-auto pr-1">
          {puntos.slice(0, 12).map((p) => {
            const nuevo = recientes?.has(p.id);
            return (
              <li key={p.id}>
                <button type="button" onClick={() => setElegido(elegido === p.id ? null : p.id)} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-100 ${tam}`} style={elegido === p.id ? { background: "#e0f4fc" } : undefined} data-testid="mapa-lista-ciudad">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: nuevo ? "#1baf7a" : "#eb6834" }} />
                  <span className="min-w-0 flex-1 truncate">
                    {p.ciudad}
                    {paisesDistintos > 1 && <span className="text-slate-400"> · {p.pais}</span>}
                  </span>
                  <span className="tabular-nums font-semibold">{p.total}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {sinUbicar.length > 0 && (
          <p className="mt-2 text-[11px] text-slate-400" title={sinUbicar.map((s) => s.ciudad).join(", ")}>
            {sinUbicar.reduce((a, s) => a + s.total, 0)} check-in(s) en {sinUbicar.length} ciudad(es) sin ubicación en el mapa.
          </p>
        )}
      </aside>
    </div>
  );
}
