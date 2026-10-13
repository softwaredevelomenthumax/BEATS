import * as React from "react";
import { MUNDO_PATH, PAISES_GEO } from "@/lib/geo/datosGeo";
import { nombreDePais, type PuntoMapa } from "@/lib/geo/geo";

/**
 * Entrega 31 — mapa interactivo y animado del evento (SVG puro, sin servicios externos).
 *  · modo «pais»: el país donde se realiza el evento, la sede y las ciudades de los asistentes que hacen check-in.
 *  · modo «mundo»: planisferio (eventos virtuales o ver todo): los lugares desde donde se conectan los asistentes.
 * Animaciones: sede que late, anillos «ping» en los check-ins recién llegados, arcos de flujo hacia la sede/emisión,
 * barrido de radar en eventos virtuales. Interacción: pasar el cursor/foco sobre una ciudad, zoom (+ / − o rueda del mouse), arrastrar para mover el mapa, restablecer vista.
 * Respeta «reducir movimiento».
 */

export interface SedeMapa {
  x: number;
  y: number;
  nombre: string;
}

interface Props {
  modo: "pais" | "mundo";
  iso: string | null;
  puntos: PuntoMapa[];
  sede?: SedeMapa | null;
  /** Ids de puntos con check-in nuevo (hacen «ping» un rato). */
  recientes?: ReadonlySet<string>;
  virtual?: boolean;
  /** `oscuro` para el estilo «transmisión»; `claro` para el tablero. */
  tema?: "claro" | "oscuro";
  className?: string;
  alto?: number | string;
  onElegir?: (id: string | null) => void;
  elegido?: string | null;
}

const AZUL = "#00A3E0";
const VERDE = "#1baf7a";
const NARANJA = "#eb6834";

const ESTILOS = `
@keyframes mv-ping{0%{transform:scale(.4);opacity:.9}100%{transform:scale(4.2);opacity:0}}
@keyframes mv-latido{0%,100%{transform:scale(1)}50%{transform:scale(1.35)}}
@keyframes mv-flujo{to{stroke-dashoffset:-60}}
@keyframes mv-barrido{from{transform:translateX(-30%)}to{transform:translateX(130%)}}
@keyframes mv-aparece{from{opacity:0;transform:scale(.2)}to{opacity:1;transform:scale(1)}}
@keyframes mv-deriva{from{background-position:0 0}to{background-position:48px 48px}}
.mv-ping{transform-box:fill-box;transform-origin:center;animation:mv-ping 1.8s ease-out infinite}
.mv-latido{transform-box:fill-box;transform-origin:center;animation:mv-latido 1.8s ease-in-out infinite}
.mv-flujo{animation:mv-flujo 2.4s linear infinite}
.mv-aparece{transform-box:fill-box;transform-origin:center;animation:mv-aparece .7s cubic-bezier(.2,.8,.2,1) both}
.mv-barrido{animation:mv-barrido 6s linear infinite}
.mv-grilla{animation:mv-deriva 8s linear infinite}
.mv-punto{cursor:pointer;transition:opacity .15s}
.mv-punto:focus{outline:none}
@media (prefers-reduced-motion:reduce){.mv-ping,.mv-latido,.mv-flujo,.mv-aparece,.mv-barrido,.mv-grilla{animation:none!important}}
`;

const Capas = React.memo(function Capas({ modo, iso, k, oscuro }: { modo: "pais" | "mundo"; iso: string | null; k: number; oscuro: boolean }) {
  const tierra = oscuro ? "#16385a" : "#dfe7ee";
  const borde = oscuro ? "#2d6a9f" : "#b7c4d1";
  const resalte = oscuro ? "#1c4f7c" : "#cfe9f6";
  const borderDestacado = AZUL;
  return (
    <g transform={`scale(${k} 1)`}>
      {modo === "mundo" ? (
        <>
          <path d={MUNDO_PATH} fill={tierra} stroke={borde} strokeWidth={0.25} strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ vectorEffect: "non-scaling-stroke" }} />
          {iso && PAISES_GEO[iso] && <path d={PAISES_GEO[iso].d} fill={resalte} stroke={borderDestacado} strokeWidth={1.2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
        </>
      ) : (
        <>
          {Object.entries(PAISES_GEO).map(([i, g]) =>
            i === iso ? null : <path key={i} d={g.d} fill={tierra} stroke={borde} strokeWidth={0.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" opacity={0.75} />,
          )}
          {iso && PAISES_GEO[iso] && <path d={PAISES_GEO[iso].d} fill={resalte} stroke={borderDestacado} strokeWidth={1.4} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
        </>
      )}
    </g>
  );
});

export function MapaEnVivo({ modo, iso, puntos, sede, recientes, virtual, tema = "claro", className, alto = 420, onElegir, elegido }: Props) {
  const oscuro = tema === "oscuro";
  const [zoom, setZoom] = React.useState(1);
  /** Entrega 36: desplazamiento del encuadre (en unidades del mapa) al arrastrar con el mouse/dedo, como en Google Maps. */
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [arrastrando, setArrastrando] = React.useState(false);
  const [hover, setHover] = React.useState<string | null>(null);
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  /** Última geometría del encuadre, para que los manejadores de eventos nativos no lean valores viejos. */
  const geoVista = React.useRef({ cx: 0, cy: 0, ancho: 1, alto: 1, baseW: 1, baseH: 1, zoom: 1, pan: { x: 0, y: 0 } });
  /** Tras arrastrar, el clic que sigue al "soltar" no debe seleccionar una ciudad. */
  const huboArrastre = React.useRef(false);

  const geo = iso ? PAISES_GEO[iso] : undefined;
  // Entrega 32: el encuadre del mapa de país se AMPLÍA cuando hay asistentes (o sede) fuera de sus límites. Antes el
  // encuadre era siempre el del país del evento, así que un asistente en Miami (evento en Colombia) quedaba fuera de la
  // vista y "no aparecía" en el mapa.
  const bbPais = React.useMemo<[number, number, number, number] | null>(() => {
    if (modo !== "pais" || !geo) return null;
    let [x0, y0, x1, y1] = geo.bb;
    const tolerancia = 1.5;
    const todos = puntos.map((p) => ({ x: p.x, y: p.y })).concat(sede ? [{ x: sede.x, y: sede.y }] : []);
    const fuera = todos.filter((q) => q.x < x0 - tolerancia || q.x > x1 + tolerancia || q.y < y0 - tolerancia || q.y > y1 + tolerancia);
    if (fuera.length === 0) return geo.bb;
    for (const q of todos) {
      x0 = Math.min(x0, q.x);
      x1 = Math.max(x1, q.x);
      y0 = Math.min(y0, q.y);
      y1 = Math.max(y1, q.y);
    }
    const holgX = (x1 - x0) * 0.06;
    const holgY = (y1 - y0) * 0.06;
    return [Math.max(-180, x0 - holgX), Math.max(-84, y0 - holgY), Math.min(180, x1 + holgX), Math.min(84, y1 + holgY)];
  }, [modo, geo, puntos, sede]);
  // Centro de referencia para corregir la deformación de la proyección (cos φ) en el mapa de país.
  const latCentro = bbPais ? -(bbPais[1] + bbPais[3]) / 2 : 0;
  const k = modo === "pais" ? Math.max(0.35, Math.cos((latCentro * Math.PI) / 180)) : 1;

  const vista = React.useMemo(() => {
    let x0: number, y0: number, x1: number, y1: number;
    if (modo === "pais" && bbPais) {
      [x0, y0, x1, y1] = bbPais;
    } else {
      [x0, y0, x1, y1] = [-180, -84, 180, 58];
      // Eventos virtuales: encuadra a los asistentes si están concentrados.
      if (puntos.length > 0 && zoom === 1) {
        const xs = puntos.map((p) => p.x).concat(sede ? [sede.x] : []);
        const ys = puntos.map((p) => p.y).concat(sede ? [sede.y] : []);
        const spanX = Math.max(...xs) - Math.min(...xs);
        const spanY = Math.max(...ys) - Math.min(...ys);
        if (spanX < 150 && spanY < 70) {
          const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
          const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
          const w = Math.max(spanX * 1.5, 70);
          const h = w * 0.5;
          [x0, y0, x1, y1] = [Math.max(-180, cx - w / 2), Math.max(-84, cy - h / 2), Math.min(180, cx + w / 2), Math.min(84, cy + h / 2)];
        }
      }
    }
    const margen = modo === "pais" ? 0.08 : 0.02;
    const w = (x1 - x0) * (1 + margen * 2);
    const h = (y1 - y0) * (1 + margen * 2);
    return { cx: ((x0 + x1) / 2) * (modo === "pais" ? k : 1), cy: (y0 + y1) / 2, w: w * (modo === "pais" ? k : 1), h };
  }, [modo, bbPais, k, puntos, sede, zoom]);

  // Mantiene la proporción del contenedor (≈ 16:10) para que los círculos no se deformen.
  const razon = 1.6;
  let ancho = vista.w;
  let altoVista = vista.h;
  if (ancho / altoVista < razon) ancho = altoVista * razon;
  else altoVista = ancho / razon;
  const baseW = ancho;
  const baseH = altoVista;
  ancho /= zoom;
  altoVista /= zoom;
  const centroX = vista.cx + pan.x;
  const centroY = vista.cy + pan.y;
  const vb = `${centroX - ancho / 2} ${centroY - altoVista / 2} ${ancho} ${altoVista}`;
  geoVista.current = { cx: centroX, cy: centroY, ancho, alto: altoVista, baseW, baseH, zoom, pan };
  const unidad = ancho / 100; // 1 % del ancho visible

  // El centro no puede alejarse más de media vista del encuadre original (el mapa nunca queda totalmente fuera de pantalla).
  const limitarPan = React.useCallback((x: number, y: number) => {
    const g = geoVista.current;
    const mx = g.baseW / 2;
    const my = g.baseH / 2;
    return { x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) };
  }, []);

  // Al volver al zoom mínimo, o al cambiar de mapa, el encuadre regresa al centro.
  React.useEffect(() => {
    if (zoom === 1) setPan({ x: 0, y: 0 });
  }, [zoom]);
  React.useEffect(() => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }, [modo, iso]);

  // Rueda del mouse: acerca/aleja alrededor del cursor. Listener nativo no pasivo para no desplazar la página.
  React.useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const alRodar = (e: WheelEvent) => {
      e.preventDefault();
      const g = geoVista.current;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const zNuevo = Math.max(1, Math.min(6, g.zoom * Math.exp(-e.deltaY * 0.0015)));
      if (zNuevo === g.zoom) return;
      const sViejo = Math.min(rect.width / g.ancho, rect.height / g.alto);
      const sNuevo = sViejo * (zNuevo / g.zoom);
      const offX = e.clientX - rect.left - rect.width / 2;
      const offY = e.clientY - rect.top - rect.height / 2;
      // Punto del mapa bajo el cursor: se mantiene fijo tras el cambio de zoom.
      const pX = g.cx + offX / sViejo;
      const pY = g.cy + offY / sViejo;
      const cxNuevo = pX - offX / sNuevo;
      const cyNuevo = pY - offY / sNuevo;
      const base = g.cx - g.pan.x;
      const baseY = g.cy - g.pan.y;
      setZoom(zNuevo);
      setPan(limitarPan(cxNuevo - base, cyNuevo - baseY));
    };
    el.addEventListener("wheel", alRodar, { passive: false });
    return () => el.removeEventListener("wheel", alRodar);
  }, [limitarPan]);

  // Arrastrar: se escuchan pointermove/up en la ventana para no perder el gesto si el cursor sale del mapa.
  const iniciarArrastre = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const el = svgRef.current;
    if (!el) return;
    const inicio = { x: e.clientX, y: e.clientY, pan: geoVista.current.pan };
    let movido = false;
    const alMover = (ev: PointerEvent) => {
      const dx = ev.clientX - inicio.x;
      const dy = ev.clientY - inicio.y;
      if (!movido && Math.hypot(dx, dy) < 4) return;
      if (!movido) {
        movido = true;
        huboArrastre.current = true;
        setArrastrando(true);
        setHover(null);
      }
      const rect = el.getBoundingClientRect();
      const g = geoVista.current;
      const s = Math.min(rect.width / g.ancho, rect.height / g.alto);
      if (!s) return;
      setPan(limitarPan(inicio.pan.x - dx / s, inicio.pan.y - dy / s));
    };
    const alSoltar = () => {
      window.removeEventListener("pointermove", alMover);
      window.removeEventListener("pointerup", alSoltar);
      window.removeEventListener("pointercancel", alSoltar);
      setArrastrando(false);
      // El "click" sintético llega justo después de pointerup: se limpia la marca en el siguiente ciclo.
      if (movido) setTimeout(() => { huboArrastre.current = false; }, 0);
    };
    window.addEventListener("pointermove", alMover);
    window.addEventListener("pointerup", alSoltar);
    window.addEventListener("pointercancel", alSoltar);
  };
  const maxTotal = Math.max(...puntos.map((p) => p.total), 1);
  const radio = (t: number) => unidad * (0.7 + 1.5 * Math.sqrt(t / maxTotal));

  const px = (x: number) => x * k;
  const activo = puntos.find((p) => p.id === (hover ?? elegido ?? "")) ?? null;
  const colorPunto = (p: PuntoMapa) => (recientes?.has(p.id) ? VERDE : virtual ? "#ffb457" : NARANJA);

  const fondo = oscuro
    ? "radial-gradient(ellipse at 50% 35%, #0e3a63 0%, #08203a 55%, #04111f 100%)"
    : "linear-gradient(180deg, #f4f9fd 0%, #e8f2f9 100%)";

  return (
    <div className={className} style={{ position: "relative", height: alto, borderRadius: 16, overflow: "hidden", background: fondo, border: `1px solid ${oscuro ? "#12497a" : "#dbe6ee"}` }} data-testid="mapa-en-vivo" data-modo={modo} data-puntos={puntos.length}>
      <style>{ESTILOS}</style>
      {oscuro && (
        <>
          <div className="mv-grilla" style={{ position: "absolute", inset: 0, opacity: 0.18, backgroundImage: "linear-gradient(#5ec2f0 1px,transparent 1px),linear-gradient(90deg,#5ec2f0 1px,transparent 1px)", backgroundSize: "48px 48px" }} />
          <div className="mv-barrido" style={{ position: "absolute", top: 0, bottom: 0, width: "18%", background: "linear-gradient(90deg,transparent,rgba(94,194,240,.18),transparent)" }} />
        </>
      )}
      <svg ref={svgRef} viewBox={vb} preserveAspectRatio="xMidYMid meet" onPointerDown={iniciarArrastre} data-testid="mapa-svg" data-zoom={zoom.toFixed(3)} data-pan={`${pan.x.toFixed(3)},${pan.y.toFixed(3)}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", cursor: arrastrando ? "grabbing" : "grab", touchAction: "none", userSelect: "none" }} role="img" aria-label={modo === "pais" ? `Mapa de ${iso ? nombreDePais(iso) : "país"} con las ciudades de los asistentes` : "Mapa mundial con los lugares desde donde se conectan los asistentes"}>
        <Capas modo={modo} iso={iso} k={k} oscuro={oscuro} />

        {/* Arcos de flujo: de cada ciudad a la sede (presencial) o al centro de emisión (virtual). */}
        {sede &&
          puntos.map((p) => {
            const x1 = px(p.x), y1 = p.y, x2 = px(sede.x), y2 = sede.y;
            if (Math.hypot(x1 - x2, y1 - y2) < unidad * 1.5) return null;
            const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - Math.hypot(x1 - x2, y1 - y2) * 0.22;
            return (
              <path key={`a-${p.id}`} d={`M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`} fill="none" stroke={recientes?.has(p.id) ? VERDE : oscuro ? "#5ec2f0" : AZUL} strokeWidth={unidad * 0.18} strokeLinecap="round" strokeDasharray={`${unidad * 1.2} ${unidad * 1.4}`} className="mv-flujo" opacity={0.55} style={{ strokeDashoffset: 0 }} />
            );
          })}

        {/* Sede / centro de emisión */}
        {sede && (
          <g>
            <circle cx={px(sede.x)} cy={sede.y} r={unidad * 1.6} fill={AZUL} opacity={0.25} className="mv-latido" />
            <circle cx={px(sede.x)} cy={sede.y} r={unidad * 0.95} fill={AZUL} stroke="#fff" strokeWidth={unidad * 0.25} />
            {!puntos.some((p) => Math.hypot(px(p.x) - px(sede.x), p.y - sede.y) < unidad * 3) && <text x={px(sede.x)} y={sede.y - unidad * 2.1} textAnchor="middle" fontSize={unidad * 1.9} fontWeight={700} fill={oscuro ? "#e6f6ff" : "#0b4a6b"} stroke={oscuro ? "#04111f" : "#fff"} strokeWidth={unidad * 0.45} paintOrder="stroke">
              {virtual ? `Emisión · ${sede.nombre}` : sede.nombre}
            </text>}
          </g>
        )}

        {/* Ciudades de los asistentes */}
        {puntos.map((p) => {
          const nuevo = recientes?.has(p.id);
          const r = radio(p.total);
          const sel = p.id === (hover ?? elegido);
          return (
            <g
              key={p.id}
              className="mv-punto"
              tabIndex={0}
              role="button"
              aria-label={`${p.ciudad}: ${p.total} check-in(s)`}
              onMouseEnter={() => setHover(p.id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(p.id)}
              onBlur={() => setHover(null)}
              onClick={() => { if (huboArrastre.current) return; onElegir?.(elegido === p.id ? null : p.id); }}
              data-testid={`mapa-punto-${p.id}`}
              data-nuevo={nuevo ? "1" : undefined}
              opacity={hover && !sel ? 0.55 : 1}
            >
              {nuevo && <circle cx={px(p.x)} cy={p.y} r={r} fill="none" stroke={VERDE} strokeWidth={unidad * 0.3} className="mv-ping" />}
              {nuevo && <circle cx={px(p.x)} cy={p.y} r={r} fill="none" stroke={VERDE} strokeWidth={unidad * 0.3} className="mv-ping" style={{ animationDelay: ".9s" }} />}
              <circle cx={px(p.x)} cy={p.y} r={sel ? r * 1.25 : r} fill={colorPunto(p)} fillOpacity={p.exacta ? 0.9 : 0.55} stroke="#fff" strokeWidth={unidad * 0.22} className="mv-aparece" />
              {(sel || (modo === "pais" && puntos.length <= 14) || nuevo) && (
                <text x={px(p.x)} y={p.y - r - unidad * 0.7} textAnchor="middle" fontSize={unidad * 1.6} fontWeight={600} fill={oscuro ? "#fff" : "#1f2937"} stroke={oscuro ? "#04111f" : "#fff"} strokeWidth={unidad * 0.4} paintOrder="stroke" pointerEvents="none">
                  {p.ciudad}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Tarjeta de la ciudad activa */}
      <div style={{ position: "absolute", left: 12, top: 12, maxWidth: "60%", pointerEvents: "none" }}>
        <div style={{ borderRadius: 10, padding: "6px 10px", fontSize: 12, background: oscuro ? "rgba(4,17,31,.7)" : "rgba(255,255,255,.9)", color: oscuro ? "#e6f6ff" : "#334155", border: `1px solid ${oscuro ? "#12497a" : "#dbe6ee"}`, backdropFilter: "blur(4px)" }}>
          {activo ? (
            <>
              <b>{activo.ciudad}</b>
              <span style={{ opacity: 0.8 }}> · {activo.pais} · {activo.total} check-in{activo.total === 1 ? "" : "s"}</span>
              {!activo.exacta && <span style={{ opacity: 0.7 }}> · ubicación aproximada</span>}
            </>
          ) : (
            <span style={{ opacity: 0.85 }}>
              {modo === "pais" && iso ? nombreDePais(iso) : virtual ? "Evento virtual · asistentes conectados" : "Mapa mundial"} · {puntos.length} {puntos.length === 1 ? "ciudad" : "ciudades"}
            </span>
          )}
        </div>
      </div>

      {/* Zoom */}
      <div style={{ position: "absolute", right: 10, bottom: 10, display: "flex", flexDirection: "column", gap: 4 }}>
        {[
          { t: "+", f: () => setZoom((z) => Math.min(6, z * 1.5)), a: "Acercar" },
          { t: "−", f: () => setZoom((z) => Math.max(1, z / 1.5)), a: "Alejar" },
          { t: "⌖", f: () => { setZoom(1); setPan({ x: 0, y: 0 }); }, a: "Restablecer vista" },
        ].map((b) => (
          <button key={b.t} type="button" onClick={b.f} aria-label={b.a} title={b.a} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${oscuro ? "#12497a" : "#cbd5e1"}`, background: oscuro ? "rgba(4,17,31,.75)" : "rgba(255,255,255,.92)", color: oscuro ? "#e6f6ff" : "#334155", fontSize: 16, lineHeight: 1, cursor: "pointer" }}>
            {b.t}
          </button>
        ))}
      </div>
    </div>
  );
}
