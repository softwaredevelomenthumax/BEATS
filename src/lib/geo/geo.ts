import { CIUDADES_TXT, ESTADOS_TXT, LISTA_PAISES, PAISES_GEO } from "./datosGeo";

/**
 * Entrega 31 — utilidades geográficas SIN servicios externos (mapas y coordenadas vienen de `datosGeo.ts`,
 * generado por `scripts/generar_datos_geo.mjs`). Las geometrías están en (longitud, -latitud) para usarlas
 * directo como coordenadas SVG; las funciones de aquí devuelven puntos en ese mismo sistema (x = lon, y = -lat).
 */

export const norm = (s: string): string => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export interface PuntoGeo {
  x: number;
  y: number;
  /** `true` si la ciudad se encontró; `false` si se aproximó con el departamento/estado o el centro del país. */
  exacta: boolean;
}

const ISO_POR_NOMBRE = new Map<string, string>();
const CENTRO_POR_ISO = new Map<string, { nombre: string; x: number; y: number }>();
for (const [iso, nombre, lat, lon] of LISTA_PAISES) {
  ISO_POR_NOMBRE.set(norm(nombre), iso);
  CENTRO_POR_ISO.set(iso, { nombre, x: lon, y: -lat });
}
// Variantes frecuentes que el selector puede guardar.
for (const [alias, iso] of [["usa", "US"], ["ee uu", "US"], ["united states", "US"], ["estados unidos de america", "US"], ["republica dominicana", "DO"], ["brasil", "BR"], ["mexico", "MX"], ["peru", "PE"], ["panama", "PA"]] as const) {
  if (!ISO_POR_NOMBRE.has(alias)) ISO_POR_NOMBRE.set(alias, iso);
}

// Entrega 39: nombres en INGLÉS de cada país del catálogo («United States» → US), para que un dato o un filtro guardado en
// inglés se reconozca igual que su equivalente en español.
try {
  const dnEn = new Intl.DisplayNames(["en"], { type: "region" });
  for (const [iso] of LISTA_PAISES) {
    let en: string | undefined;
    try { en = dnEn.of(iso); } catch { en = undefined; }
    if (en && en !== iso && !ISO_POR_NOMBRE.has(norm(en))) ISO_POR_NOMBRE.set(norm(en), iso);
  }
} catch { /* sin Intl.DisplayNames: quedan los alias manuales */ }

export function isoDePais(nombre: string | null | undefined): string | null {
  if (!nombre) return null;
  return ISO_POR_NOMBRE.get(norm(nombre)) ?? null;
}
export function nombreDePais(iso: string): string {
  return CENTRO_POR_ISO.get(iso)?.nombre ?? iso;
}
export function hayMapaDePais(iso: string | null): boolean {
  return Boolean(iso && PAISES_GEO[iso]);
}

type Tabla = Map<string, { x: number; y: number }>;
const cacheCiudades = new Map<string, Tabla>();
const cacheEstados = new Map<string, Tabla>();

function parsear(txt: string | undefined): Tabla {
  const m: Tabla = new Map();
  if (!txt) return m;
  for (const linea of txt.split("\n")) {
    const [n, la, lo] = linea.split("|");
    if (!n) continue;
    const k = norm(n);
    if (!m.has(k)) m.set(k, { x: Number(lo), y: -Number(la) });
  }
  return m;
}
function ciudadesDe(iso: string): Tabla {
  let t = cacheCiudades.get(iso);
  if (!t) cacheCiudades.set(iso, (t = parsear(CIUDADES_TXT[iso])));
  return t;
}
function estadosDe(iso: string): Tabla {
  let t = cacheEstados.get(iso);
  if (!t) cacheEstados.set(iso, (t = parsear(ESTADOS_TXT[iso])));
  return t;
}

/** Entrega 32: nombres alternos frecuentes → nombre del catálogo (country-state-city). */
const ALIAS_CIUDAD: Record<string, string> = {
  "new york": "new york city",
  "nueva york": "new york city",
  nyc: "new york city",
  "washington dc": "washington",
  "washington d c": "washington",
  "mexico city": "ciudad de mexico",
  "mexico df": "ciudad de mexico",
  cdmx: "ciudad de mexico",
  "ft lauderdale": "fort lauderdale",
  "saint petersburg": "st petersburg",
  "cartagena": "cartagena de indias",
  "sao paulo": "sao paulo",
};

function unicaQueEmpieza(tabla: Tabla, prefijo: string): { x: number; y: number } | null {
  if (prefijo.length < 4) return null;
  let hallada: { x: number; y: number } | null = null;
  for (const [k, v] of tabla) {
    if (k.startsWith(prefijo + " ")) {
      if (hallada) return null;
      hallada = v;
    }
  }
  return hallada;
}

/** Quita sufijos como «, Antioquia» o «(Bogotá D.C.)» y variantes habituales para acertar con el catálogo. */
function variantes(ciudad: string): string[] {
  const base = norm(ciudad);
  const v = new Set([base]);
  for (const b of [base, norm(ciudad.split(/[,(-]/)[0] ?? "")]) {
    const a = ALIAS_CIUDAD[b];
    if (a) v.add(a);
  }
  const sinCola = norm(ciudad.split(/[,(-]/)[0] ?? "");
  if (sinCola) v.add(sinCola);
  if (base.startsWith("bogota")) v.add("bogota");
  v.add(base.replace(/\b(d c|dc|distrito capital|municipio de|ciudad de)\b/g, "").trim());
  return [...v].filter(Boolean);
}

/** Ubica una ciudad. Con país conocido busca ahí; si no, en todos los países del continente (primer acierto). */
export function ubicarCiudad(ciudad: string, pais?: string | null, paisPorDefecto?: string | null): { punto: PuntoGeo; iso: string } | null {
  if (!ciudad.trim()) return null;
  const vs = variantes(ciudad);
  const isoDado = isoDePais(pais) ?? isoDePais(paisPorDefecto);
  const candidatos = isoDado ? [isoDado] : Object.keys(CIUDADES_TXT);
  for (const iso of candidatos) {
    for (const v of vs) {
      const c = ciudadesDe(iso).get(v);
      if (c) return { punto: { ...c, exacta: true }, iso };
    }
  }
  // Entrega 32: nombre incompleto frente al catálogo («Bogotá» vs «Bogotá D.C.»): se acepta si solo hay UNA ciudad que empiece así.
  for (const iso of candidatos) {
    for (const v of vs) {
      const c = unicaQueEmpieza(ciudadesDe(iso), v);
      if (c) return { punto: { ...c, exacta: true }, iso };
    }
  }
  for (const iso of candidatos) {
    for (const v of vs) {
      const c = estadosDe(iso).get(v);
      if (c) return { punto: { ...c, exacta: false }, iso };
    }
  }
  // Entrega 32: la ciudad no está en el país indicado/por defecto (p. ej. un asistente de Miami en un evento en Colombia
  // cuyo check-in no trae país): se busca en el resto de los países; si es única es exacta, si es ambigua queda aproximada.
  if (isoDado) {
    const coincidencias: { iso: string; c: { x: number; y: number } }[] = [];
    for (const iso of Object.keys(CIUDADES_TXT)) {
      if (iso === isoDado) continue;
      for (const v of vs) {
        const c = ciudadesDe(iso).get(v);
        if (c) {
          coincidencias.push({ iso, c });
          break;
        }
      }
    }
    if (coincidencias.length > 0) {
      const elegido = coincidencias.find((m) => m.iso === "US") ?? coincidencias[0];
      return { punto: { ...elegido.c, exacta: coincidencias.length === 1 }, iso: elegido.iso };
    }
  }
  if (isoDado) {
    const c = CENTRO_POR_ISO.get(isoDado);
    if (c) return { punto: { x: c.x, y: c.y, exacta: false }, iso: isoDado };
  }
  return null;
}

export function centroDePais(iso: string): { x: number; y: number } | null {
  const c = CENTRO_POR_ISO.get(iso);
  return c ? { x: c.x, y: c.y } : null;
}

export interface UbicacionEntrada {
  pais?: string | null;
  ciudad: string;
  total: number;
}
export interface PuntoMapa {
  id: string;
  ciudad: string;
  pais: string;
  iso: string;
  total: number;
  x: number;
  y: number;
  exacta: boolean;
}

/** Ubica y agrupa por ciudad. Devuelve también las ciudades que no se pudieron ubicar. */
export function ubicarPuntos(entradas: UbicacionEntrada[], paisEvento?: string | null): { puntos: PuntoMapa[]; sinUbicar: UbicacionEntrada[] } {
  const mapa = new Map<string, PuntoMapa>();
  const sinUbicar: UbicacionEntrada[] = [];
  for (const e of entradas) {
    const u = ubicarCiudad(e.ciudad, e.pais, paisEvento);
    if (!u) {
      sinUbicar.push(e);
      continue;
    }
    const id = `${u.iso}:${norm(e.ciudad)}`;
    const previo = mapa.get(id);
    if (previo) previo.total += e.total;
    else mapa.set(id, { id, ciudad: e.ciudad, pais: nombreDePais(u.iso), iso: u.iso, total: e.total, x: u.punto.x, y: u.punto.y, exacta: u.punto.exacta });
  }
  return { puntos: [...mapa.values()].sort((a, b) => b.total - a.total), sinUbicar };
}

/** País más probable del conjunto de ciudades cuando el evento no informa el suyo. */
export function inferirPais(ciudades: string[]): string | null {
  const cuenta = new Map<string, number>();
  for (const c of ciudades) {
    const u = ubicarCiudad(c);
    if (u) cuenta.set(u.iso, (cuenta.get(u.iso) ?? 0) + 1);
  }
  let mejor: string | null = null;
  let n = 0;
  for (const [iso, v] of cuenta) if (v > n) { mejor = iso; n = v; }
  return mejor;
}

export function esEventoVirtual(modalidad: string | null | undefined): "virtual" | "mixto" | "presencial" {
  const m = norm(modalidad ?? "");
  if (m.startsWith("virtual")) return "virtual";
  if (m.startsWith("mixto") || m.startsWith("hibrido")) return "mixto";
  return "presencial";
}
