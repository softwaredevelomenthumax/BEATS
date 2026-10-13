#!/usr/bin/env node
// Corre TODOS los scripts scripts/verificar_*.mjs en orden alfabético — la
// "regresión completa" que el plan de reconstrucción pide al final de cada
// fase, antes de avanzar a la siguiente. Se detiene con código de salida
// distinto de 0 si alguno falla, pero sigue ejecutando el resto para dar un
// reporte completo en un solo corrido.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dirScripts = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(dirScripts, "..");

const scripts = readdirSync(dirScripts)
  .filter((f) => f.startsWith("verificar_") && f.endsWith(".mjs"))
  .sort();

if (scripts.length === 0) {
  console.error("No se encontró ningún scripts/verificar_*.mjs");
  process.exit(1);
}

console.log(`Corriendo ${scripts.length} script(s) de verificación:\n${scripts.map((s) => `  - ${s}`).join("\n")}\n`);

let fallidos = 0;
for (const script of scripts) {
  console.log(`\n=== ${script} ===`);
  try {
    execFileSync("node", [resolve(dirScripts, script)], { cwd: raiz, stdio: "inherit" });
  } catch {
    fallidos++;
  }
}

console.log(`\n${scripts.length - fallidos}/${scripts.length} scripts pasaron.`);
if (fallidos > 0) process.exit(1);
