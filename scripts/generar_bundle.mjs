#!/usr/bin/env node
// Toma el HTML de salida de `vite build` (que referencia <link>/<script>
// separados en dist/assets) y produce un único archivo .html autocontenido,
// con el CSS y el JS inlineados. Mismo patrón que el bundle original
// (bundle.html / ejecucion.html / marquesina.html eran, cada uno, un solo
// archivo — nada de <link>/<script src> externos).
//
// Uso: node scripts/generar_bundle.mjs <entrada-en-dist.html> <salida.html>
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raizProyecto = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function inlinearArchivo(rutaHtmlEntrada, rutaSalida) {
  const rutaAbsolutaEntrada = resolve(raizProyecto, rutaHtmlEntrada);
  const dirDist = dirname(rutaAbsolutaEntrada);
  let html = await readFile(rutaAbsolutaEntrada, "utf8");

  // 1. Inlinear hojas de estilo: <link rel="stylesheet" href="...">
  const regexLink = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["'][^>]*>/g;
  html = await reemplazarAsync(html, regexLink, async (coincidencia, href) => {
    const css = await readFile(resolve(dirDist, "." + href), "utf8");
    return `<style>\n${css}\n</style>`;
  });

  // 2. Inlinear módulos JS: <script type="module" src="...">
  const regexScript = /<script([^>]*)\ssrc=["']([^"']+)["']([^>]*)><\/script>/g;
  html = await reemplazarAsync(html, regexScript, async (coincidencia, antes, src, despues) => {
    if (!src.endsWith(".js")) return coincidencia; // deja intactos assets no-JS
    const js = await readFile(resolve(dirDist, "." + src), "utf8");
    // Se preserva type="module" (antes/despues) para que los imports
    // dinámicos y el orden de ejecución se comporten igual que en dev.
    return `<script${antes}${despues}>\n${js}\n</script>`;
  });

  // 3. Versión y fecha/hora de creación del bundle (se muestran en Créditos y
  //    en el pie de Ejecución en Sitio / Marquesina). Va ANTES de los módulos.
  let version = "sin-version";
  try {
    version = (await readFile(resolve(raizProyecto, "VERSION"), "utf8")).trim() || version;
  } catch {
    /* sin archivo VERSION */
  }
  const info = JSON.stringify({ version, creadoEn: new Date().toISOString() });
  html = html.replace("<head>", () => `<head>\n<script>window.__BEATS_BUILD__=${info};</script>`);

  await writeFile(resolve(raizProyecto, rutaSalida), html, "utf8");
  console.log(`Bundle generado: ${rutaSalida}`);
}

async function reemplazarAsync(texto, regex, reemplazador) {
  const coincidencias = [...texto.matchAll(regex)];
  let resultado = texto;
  for (const m of coincidencias) {
    const reemplazo = await reemplazador(...m);
    // OJO: se pasa una función como segundo argumento de replace(), nunca
    // el string ya armado. Si se pasara el string directo, cualquier "$&",
    // "$1", etc. que aparezca DENTRO del JS/CSS inlineado (código
    // minificado real, no un caso raro) sería interpretado por
    // String.prototype.replace como un patrón especial de sustitución y
    // corrompería el bundle de forma silenciosa.
    resultado = resultado.replace(m[0], () => reemplazo);
  }
  return resultado;
}

const [, , entrada, salida] = process.argv;
if (!entrada || !salida) {
  console.error("Uso: node scripts/generar_bundle.mjs <entrada-en-dist.html> <salida.html>");
  process.exit(1);
}
await inlinearArchivo(entrada, salida);
