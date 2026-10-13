#!/usr/bin/env node
// Compila los 3 puntos de entrada de BEATS EN BUILDS SEPARADAS (no en una
// sola invocación multi-entrada) para que Rollup nunca extraiga un chunk
// compartido entre ellos, y luego inlinea cada una en un .html
// autocontenido en la raíz del proyecto: bundle.html, ejecucion.html,
// marquesina.html.
import { build } from "vite";
import { execSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const ENTRADAS = [
  { entrada: "index.html", outDir: "dist-main", salida: "bundle.html" },
  { entrada: "entrada-ejecucion.html", outDir: "dist-ejecucion", salida: "ejecucion.html" },
  { entrada: "entrada-marquesina.html", outDir: "dist-marquesina", salida: "marquesina.html" },
];

for (const { entrada, outDir, salida } of ENTRADAS) {
  console.log(`\n--- Compilando ${entrada} ---`);
  await build({
    root: raiz,
    build: {
      outDir,
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(raiz, entrada),
      },
    },
    logLevel: "warn",
  });

  execSync(`node scripts/generar_bundle.mjs ${outDir}/${entrada} ${salida}`, {
    cwd: raiz,
    stdio: "inherit",
  });
}

// Los dist-* intermedios no se necesitan una vez generados los 3 .html.
for (const { outDir } of ENTRADAS) {
  await rm(resolve(raiz, outDir), { recursive: true, force: true });
}

console.log("\nLos 3 bundles fueron generados en la raíz del proyecto.");
