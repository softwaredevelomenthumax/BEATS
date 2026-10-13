// Octubre 2026 — la sigla CAF significa SIEMPRE «Formato de Aprobación de Contrato».
// Verificación estática (sin navegador): ningún archivo fuente ni SQL puede dar a CAF otro significado.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const RAIZ = new URL("..", import.meta.url).pathname;
const EXTENSIONES = new Set([".ts", ".tsx", ".sql", ".html"]);
const PROHIBIDOS = [
  /carta de autorizaci[oó]n de fondos/i,
  /contract approval form/i,
  /contract authorization form/i,
  /formulario de aprobaci[oó]n de contrato/i,
  /formato de autorizaci[oó]n de contrato/i,
  /control de aprobaci[oó]n de contrato/i,
];
// Comentarios que documentan el cambio de nombre (histórico) son válidos.
const PERMITIDO_EN = [/AJUSTES \(septiembre\/octubre 2026\), pedido expl[ií]cito: cambiar/];

function* archivos(dir) {
  for (const nombre of readdirSync(dir)) {
    if (["node_modules", "dist", ".git"].includes(nombre)) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) yield* archivos(ruta);
    else if (EXTENSIONES.has(extname(ruta)) && !/^(bundle|ejecucion|marquesina)\.html$/.test(nombre)) yield ruta;
  }
}

let fallos = 0;
for (const carpeta of ["src", "db"]) {
  for (const ruta of archivos(join(RAIZ, carpeta))) {
    const lineas = readFileSync(ruta, "utf8").split("\n");
    lineas.forEach((l, i) => {
      if (PROHIBIDOS.some((r) => r.test(l)) && !PERMITIDO_EN.some((r) => r.test(lineas[i - 1] ?? "") || r.test(l))) {
        fallos++;
        console.log(`  ✗ ${ruta.replace(RAIZ, "")}:${i + 1}: ${l.trim()}`);
      }
    });
  }
}
const enums = readFileSync(join(RAIZ, "src/lib/enums.ts"), "utf8");
if (!enums.includes('SIGNIFICADO_CAF = "Formato de Aprobación de Contrato"')) {
  fallos++;
  console.log("  ✗ enums.ts: falta la constante SIGNIFICADO_CAF con el significado correcto");
}
console.log(fallos === 0 ? "  ✓ CAF = «Formato de Aprobación de Contrato» en todo el código y las migraciones" : `  ${fallos} problema(s)`);
process.exit(fallos === 0 ? 0 : 1);
