#!/usr/bin/env node
// Entrega 35 — verifica en Node (sin navegador) la parte pura del formato de backup: la huella SHA-256 de respaldo contra la
// de Node, el orden de carga por llaves foráneas, los nombres de archivo y la lectura línea por línea de un .gz.
import ts from "typescript";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fuente = await readFile(resolve(raiz, "src/lib/backup/formato.ts"), "utf8");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const dir = await mkdtemp(join(tmpdir(), "beats-formato-"));
await writeFile(join(dir, "formato.mjs"), js);
const f = await import(pathToFileURL(join(dir, "formato.mjs")).href);

let fallas = 0;
const afirmar = (c, m) => { if (c) console.log(`  OK  ${m}`); else { console.error(`  X   ${m}`); fallas++; } };
const sha = (t) => createHash("sha256").update(t, "utf8").digest("hex");

console.log("1. SHA-256");
const casos = ["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(63), "a".repeat(64), "a".repeat(65), "ñandú ✓ 日本語 🎉".repeat(40), JSON.stringify({ monto: "12345678901234.123456", grande: 9007199254740993 }).repeat(2000)];
for (const t of casos) afirmar(f.sha256HexSincrono(t) === sha(t), `implementación propia = Node para ${t.length} caracteres`);
afirmar((await f.sha256Hex("abc")) === sha("abc"), "Web Crypto = Node");

console.log("2. Orden de carga");
const rel = (tabla, ref, esq = "public") => ({ tabla, columnas: ["x"], ref_esquema: esq, ref_tabla: ref });
let r = f.ordenarParaCarga(["docs", "eventos", "usuarios", "aprob"], [rel("docs", "eventos"), rel("aprob", "docs"), rel("eventos", "usuarios"), rel("usuarios", "auth_users", "auth"), rel("usuarios", "usuarios")]);
afirmar(r.orden.join() === "usuarios,eventos,docs,aprob" && r.conCiclos.length === 0, `las referenciadas van primero; autorreferencias y otros esquemas se ignoran (${r.orden.join(">")})`);
r = f.ordenarParaCarga(["a", "b", "c"], [rel("a", "b"), rel("b", "a"), rel("c", "a")]);
afirmar(r.conCiclos.join() === "a,b,c" && r.orden.length === 3, `un ciclo (a↔b) se detecta, y también queda marcada c, que depende de él (${r.conCiclos.join(",")})`);

console.log("3. Nombres de archivo");
const d = new Date(2026, 9, 9, 15, 30, 45);
afirmar(f.nombreArchivoBackup(d, true) === "beats-backup_2026-10-09_153045.ndjson.gz", "manual comprimido");
afirmar(f.nombreArchivoBackup(d, false, "programado") === "beats-backup_2026-10-09_153045_programado.ndjson", "programado sin comprimir");
afirmar(f.esArchivoDeBackup("beats-backup_2026-10-09_153045_programado.ndjson.gz") && !f.esArchivoDeBackup("notas.txt") && !f.esArchivoDeBackup("beats-backup_x.zip"), "reconoce solo sus archivos");
afirmar(f.formatearBytes(0) === "0 B" && f.formatearBytes(1536) === "1.50 KB" && f.formatearBytes(5 * 1024 * 1024) === "5.00 MB", "formato de tamaños");

console.log("4. Lectura línea por línea (.gz y texto plano) y separación de sobres");
const filas = '[{"id":"a","monto":12345678901234.123456,"texto":"con\\ttab"}]';
const sobre = JSON.stringify({ tipo: "datos", tabla: "t", n: 1, sha: sha(filas) });
const cuerpo = `{"tipo":"cabecera","formato":"beats-backup/1"}\n${sobre}\t${filas}\n{"tipo":"manifiesto"}\n`;
for (const [nombre, blob] of [["gz", new Blob([gzipSync(Buffer.from(cuerpo))])], ["plano", new Blob([cuerpo])]]) {
  const lineas = [];
  for await (const l of f.leerLineas(blob)) lineas.push(l);
  afirmar(lineas.length === 3, `${nombre}: 3 líneas`);
  const s = f.separarLineaDatos(lineas[1]);
  afirmar(s && s.filasTexto === filas && s.sobre.sha === sha(filas), `${nombre}: el texto de las filas queda intacto (incluido el decimal de 6 posiciones y el \\t escapado)`);
  afirmar(f.separarLineaDatos(lineas[0]) === null, `${nombre}: la cabecera no es una línea de datos`);
}
// Línea muy larga (varios MB) partida en trozos por el flujo
const grande = "x".repeat(5_000_000);
const lineasG = [];
for await (const l of f.leerLineas(new Blob([gzipSync(Buffer.from(`a\n${grande}\nb`))]))) lineasG.push(l.length);
afirmar(lineasG.join() === `1,${grande.length},1`, "una línea de 5 MB se reensambla completa");

console.log("5. Sello");
const s1 = await f.calcularSello(["h1", "h2"], [{ nombre: "a", filas: 1 }]);
afirmar(s1 !== (await f.calcularSello(["h2", "h1"], [{ nombre: "a", filas: 1 }])), "el sello depende del orden de las páginas");
afirmar(s1 !== (await f.calcularSello(["h1", "h2"], [{ nombre: "a", filas: 2 }])), "el sello depende de los conteos");

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLA(S)`);
process.exit(fallas ? 1 : 0);
