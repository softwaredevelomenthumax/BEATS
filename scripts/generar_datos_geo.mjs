// Entrega 31: genera src/lib/geo/datosGeo.ts (mapas y coordenadas SIN servicios externos).
// Uso (solo cuando se quiera regenerar): node scripts/generar_datos_geo.mjs
// Fuentes: world-atlas (Natural Earth, dominio público) y country-state-city (ya es dependencia de la app).
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import * as topojson from "topojson-client";
const require = createRequire(import.meta.url);
const { Country, State, City } = require("country-state-city");
const w110 = JSON.parse(readFileSync(require.resolve("world-atlas/countries-110m.json"), "utf8"));
const w50 = JSON.parse(readFileSync(require.resolve("world-atlas/countries-50m.json"), "utf8"));

const dn = new Intl.DisplayNames(["es"], { type: "region" });
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const AMERICAS = ["CA","US","MX","BZ","CR","SV","GT","HN","NI","PA","AG","BS","BB","CU","DM","GD","HT","JM","DO","KN","VC","LC","TT","AR","BO","BR","CL","CO","EC","GY","PY","PE","SR","UY","VE","PR"];
const GRANDES = new Set(["US","MX","BR"]);
// Entrega 32: cada ciudad principal lleva, cuando hace falta, el código del estado (formato "Ciudad|ST"). Antes se tomaba la
// PRIMERA ciudad con ese nombre del catálogo y en EE. UU. eso ubicaba, p. ej., «Miami» en Arizona, «Boston» en Georgia o
// «Houston» en Alaska. Los nombres son los del catálogo country-state-city, que es el que usan los selectores de la app.
const PRINCIPALES = {
  US: [
    "New York City|NY","Los Angeles|CA","Chicago|IL","Houston|TX","Phoenix|AZ","Philadelphia|PA","San Antonio|TX","San Diego|CA","Dallas|TX","San Jose|CA","Austin|TX","Jacksonville|FL","San Francisco|CA","Seattle|WA","Denver|CO","Boston|MA","Miami|FL","Atlanta|GA","Orlando|FL","Tampa|FL","Las Vegas|NV","Detroit|MI","Minneapolis|MN","Portland|OR","Charlotte|NC","Nashville|TN","Baltimore|MD","Salt Lake City|UT","Honolulu|HI",
    // Florida (alta presencia de congresos y asistentes de Latinoamérica)
    "Fort Lauderdale|FL","Hollywood|FL","Hialeah|FL","Coral Gables|FL","Doral|FL","Boca Raton|FL","West Palm Beach|FL","Weston|FL","Aventura|FL","Key West|FL","Naples|FL","Sarasota|FL","Pembroke Pines|FL","St. Petersburg|FL","Miami Beach|FL","Kissimmee|FL","Tallahassee|FL","Gainesville|FL","Pensacola|FL","Miramar|FL","Homestead|FL","Sunrise|FL","Plantation|FL","Coral Springs|FL","Pompano Beach|FL","Delray Beach|FL","Jupiter|FL","Fort Myers|FL","Daytona Beach|FL",
    "Fort Worth|TX","El Paso|TX","Plano|TX","Arlington|TX","Oklahoma City|OK","Tulsa|OK","Louisville|KY","Memphis|TN","Milwaukee|WI","Albuquerque|NM","Tucson|AZ","Sacramento|CA","Fresno|CA","Long Beach|CA","Oakland|CA","Irvine|CA","Santa Monica|CA","Kansas City|MO","St. Louis|MO","Omaha|NE","Raleigh|NC","Cleveland|OH","Columbus|OH","Cincinnati|OH","Indianapolis|IN","Pittsburgh|PA","New Orleans|LA","Newark|NJ","Jersey City|NJ","Buffalo|NY","Richmond|VA","Virginia Beach|VA","Anchorage|AK","Providence|RI","Hartford|CT","Charleston|SC","Birmingham|AL","Boise|ID","Des Moines|IA","Little Rock|AR","Madison|WI","Wichita|KS","Lexington|KY","Orange|CA","Princeton|NJ","Bethesda|MD","Rochester|NY","Stamford|CT",
  ],
  MX: ["Ciudad de México|CDMX","Guadalajara|JAL","Monterrey|NLE","Puebla|PUE","Tijuana|BCN","León|GUA","Cancún|ROO","Mérida|YUC","Querétaro|QUE","Toluca|MEX","Chihuahua|CHH","Hermosillo|SON","Culiacán|SIN","Veracruz|VER","Oaxaca de Juárez|OAX","Morelia|MIC","Aguascalientes|AGU","Saltillo|COA","San Luis Potosí|SLP","Acapulco de Juárez|GRO","Villahermosa|TAB","Tuxtla|CHP","Zapopan|JAL","Mexicali|BCN"],
  BR: ["São Paulo","Rio de Janeiro","Brasília","Salvador","Fortaleza","Belo Horizonte","Manaus","Curitiba","Recife","Porto Alegre","Belém|PA","Goiânia","Campinas|SP","São Luís|MA","Natal","Florianópolis","Vitória","Cuiabá","Campo Grande|MS","João Pessoa","Maceió","Teresina","Aracaju"],
};
// Ciudades que el catálogo no trae (o trae con otro nombre) y que se agregan a mano: [país, nombre, lat, lon].
const MANUALES = [
  ["US", "Washington", 38.9072, -77.0369],
  ["MX", "Ciudad Juárez", 31.6904, -106.4245],
];
const NUM_A_ISO = {}; // id numérico (ISO 3166-1) → alpha-2, por nombre en inglés de csc
const porNombreEn = new Map(Country.getAllCountries().map((c) => [norm(c.name), c.isoCode]));
const ALIAS = { "united states of america": "US", "dominican rep": "DO", "dominican republic": "DO", "bolivia": "BO", "venezuela": "VE", "falkland is": "FK", "w sahara": "EH", "dem rep congo": "CD", "congo": "CG", "central african rep": "CF", "eq guinea": "GQ", "s sudan": "SS", "bosnia and herz": "BA", "czechia": "CZ", "eswatini": "SZ", "macedonia": "MK", "n cyprus": "CY", "somaliland": "SO", "kosovo": "XK", "myanmar": "MM", "russia": "RU", "syria": "SY", "iran": "IR", "tanzania": "TZ", "laos": "LA", "vietnam": "VN", "south korea": "KR", "north korea": "KP", "moldova": "MD", "brunei": "BN", "cote d ivoire": "CI", "solomon is": "SB", "fr s antarctic lands": "TF", "antarctica": "AQ", "trinidad and tobago": "TT", "st vin and gren": "VC", "antigua and barb": "AG", "st kitts and nevis": "KN", "puerto rico": "PR", "bahamas": "BS", "the bahamas": "BS" };
const isoDe = (nombre) => ALIAS[norm(nombre)] ?? porNombreEn.get(norm(nombre));

function anillo(r, dec) {
  const k = 10 ** dec;
  let d = "", ux = null, uy = null, n = 0;
  for (const [x, y] of r) {
    const X = Math.round(x * k) / k, Y = Math.round(y * k) / k;
    if (X === ux && Y === uy) continue;
    d += (n === 0 ? "M" : "L") + X + " " + Y;
    ux = X; uy = Y; n++;
  }
  return n >= 3 ? d + "Z" : "";
}
function geomAPath(g, dec, minTam) {
  const polis = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  let d = "";
  const info = [];
  for (const p of polis) {
    const ext = p[0];
    const xs = ext.map((q) => q[0]), ys = ext.map((q) => q[1]);
    const bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const tam = Math.max(bb[2] - bb[0], bb[3] - bb[1]);
    if (tam < minTam) continue;
    d += anillo(ext, dec);
    info.push({ bb, area: (bb[2] - bb[0]) * (bb[3] - bb[1]) });
  }
  return { d, info };
}
// invierte Y (lat→ -lat) para que SVG quede al derecho: guardamos lon/lat tal cual y el cliente aplica la escala.
const flip = (geo) => JSON.parse(JSON.stringify(geo), (k, v) => v);

const f110 = topojson.feature(w110, w110.objects.countries).features;
const f50 = topojson.feature(w50, w50.objects.countries).features;

// Mundo (110m, 1 decimal). Lat se guarda negada para usarlo directo como coordenada SVG (y hacia abajo).
function neg(g) {
  const m = (c) => (typeof c[0] === "number" ? [c[0], -c[1]] : c.map(m));
  return { type: g.type, coordinates: m(g.coordinates) };
}
let mundo = "";
for (const f of f110) mundo += geomAPath(neg(f.geometry), 1, 0.3).d;

const paises = {};
const noMapeados = [];
for (const f of f50) {
  const iso = isoDe(f.properties.name);
  if (!iso) { noMapeados.push(f.properties.name); continue; }
  if (!AMERICAS.includes(iso)) continue;
  const grande = ["US","CA","BR","AR","MX","CL","PE","CO","BO","VE"].includes(iso);
  const { d, info } = geomAPath(neg(f.geometry), grande ? 1 : 2, grande ? 0.4 : 0.05);
  // bbox principal: polígonos cercanos al más grande (descarta Alaska/Hawái/ultramar).
  const mayor = info.reduce((a, b) => (b.area > a.area ? b : a), info[0]);
  const cx = (mayor.bb[0] + mayor.bb[2]) / 2, cy = (mayor.bb[1] + mayor.bb[3]) / 2;
  const cerca = info.filter((i) => Math.abs((i.bb[0] + i.bb[2]) / 2 - cx) < 28 && Math.abs((i.bb[1] + i.bb[3]) / 2 - cy) < 20);
  const bb = [Math.min(...cerca.map((i) => i.bb[0])), Math.min(...cerca.map((i) => i.bb[1])), Math.max(...cerca.map((i) => i.bb[2])), Math.max(...cerca.map((i) => i.bb[3]))];
  paises[iso] = { d, bb: bb.map((n) => Math.round(n * 10) / 10) }; // bb en (lon, -lat)
}
console.log("sin mapear (no americanos ok):", noMapeados.slice(0, 30).join(", "));
console.log("países con mapa:", Object.keys(paises).length, "faltan:", AMERICAS.filter((i) => !paises[i]).join(","));

// Catálogo de países (iso, nombre es, lat, lon) para todos.
const lista = Country.getAllCountries().map((c) => [c.isoCode, dn.of(c.isoCode) || c.name, +(+c.latitude).toFixed(1), +(+c.longitude).toFixed(1)]);

const fmt = (nombre, la, lo) => `${nombre}|${(+la).toFixed(2)}|${(+lo).toFixed(2)}`;
const ciudades = {};
const faltantes = [];
for (const c of Country.getAllCountries()) {
  const iso = c.isoCode;
  if (!AMERICAS.includes(iso)) continue;
  let l = City.getCitiesOfCountry(iso) || [];
  if (GRANDES.has(iso)) {
    // nombre normalizado → estado exigido (o null si el nombre es único / sirve cualquiera)
    const pedidas = new Map(PRINCIPALES[iso].map((e) => { const [n, st] = e.split("|"); return [norm(n), st ?? null]; }));
    l = l.filter((x) => pedidas.has(norm(x.name)) && (pedidas.get(norm(x.name)) === null || pedidas.get(norm(x.name)) === x.stateCode));
    for (const [n] of pedidas) if (!l.some((x) => norm(x.name) === n)) faltantes.push(`${iso}:${n}`);
  }
  const vistos = new Set();
  const out = [];
  for (const m of MANUALES.filter((m) => m[0] === iso)) {
    vistos.add(norm(m[1]));
    out.push(fmt(m[1], m[2], m[3]));
  }
  for (const x of l) {
    if (!x.latitude || !x.longitude) continue;
    const k = norm(x.name);
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(fmt(x.name, x.latitude, x.longitude));
  }
  ciudades[iso] = out.join("\n");
}
if (faltantes.length) console.log("ciudades principales que NO están en el catálogo:", faltantes.join(", "));
const estados = {};
for (const c of Country.getAllCountries().filter((x) => AMERICAS.includes(x.isoCode))) {
  const l = State.getStatesOfCountry(c.isoCode).filter((s) => s.latitude && s.longitude);
  if (l.length) estados[c.isoCode] = l.map((s) => fmt(s.name, s.latitude, s.longitude)).join("\n");
}

const out = `/* eslint-disable */
// GENERADO por scripts/generar_datos_geo.mjs — no editar a mano. Entrega 31.
// Geometría: Natural Earth vía world-atlas (dominio público). Coordenadas: country-state-city.
// Las geometrías están en (longitud, -latitud) para usarlas directo como coordenadas SVG.
export const MUNDO_PATH = ${JSON.stringify(mundo)};
export const PAISES_GEO: Record<string, { d: string; bb: [number, number, number, number] }> = ${JSON.stringify(paises)};
export const LISTA_PAISES: [string, string, number, number][] = ${JSON.stringify(lista)};
export const CIUDADES_TXT: Record<string, string> = ${JSON.stringify(ciudades)};
export const ESTADOS_TXT: Record<string, string> = ${JSON.stringify(estados)};
`;
writeFileSync("src/lib/geo/datosGeo.ts", out);
console.log("KB:", Math.round(out.length / 1024), "mundo KB:", Math.round(mundo.length / 1024));
