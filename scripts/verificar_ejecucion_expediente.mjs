#!/usr/bin/env node
// Entrega 16 — verifica en Ejecución: registro de fuerza de ventas (nombre,
// cargo, ciudad) y fotos del evento (4 marcos con guía). Contra fixtures locales.
import { chromium } from "playwright";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { interceptarSupabase, crearHandlerValidarCodigoEjecucion } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rutaBundle = resolve(raiz, "ejecucion.html");
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const sesionOk = (body, fx) => {
  const s = (fx.tablas.sesiones_ejecucion_evento ?? []).find((x) => x.token === body.p_token);
  if (!s) throw new Error("Sesión de trabajo inválida o expirada. Vuelve a ingresar el código de acceso.");
  return s;
};

const fixtures = {
  tablas: {
    solicitudes_evento: [{ id: "evt-1", estado: "Aprobado", nombre_evento: "Simposio de Catarata 2026", entrega_muestras_medicas: false, modalidad_sesiones: "Única sesión", participacion_academica: false }],
    eventos_codigos_acceso: [{ id: "cod-1", evento_id: "evt-1", codigo: "A3F7K9", activo: true, creado_por_id: "usr-1", creado_en: new Date().toISOString(), expira_en: null }],
    evento_muestras_planeadas: [], productos_portafolio: [], catalogo_valores: [],
    configuracion_formatos: [{ id: 1, declaracion_tratamiento_datos: "x" }],
    sesiones_evento: [], sesiones_ejecucion_evento: [], registros_participacion: [], muestras_entregadas: [],
    archivos_adjuntos: [], registros_fuerza_ventas: [], evento_repositorio_archivos: [],
  },
  rpc: {
    validar_codigo_evento_ejecucion: crearHandlerValidarCodigoEjecucion(),
    registrar_fuerza_ventas_ejecucion: (body, fx) => {
      sesionOk(body, fx);
      if (!String(body.p_nombre ?? "").trim()) throw new Error("Indica el nombre.");
      const id = `fv-${fx.tablas.registros_fuerza_ventas.length + 1}`;
      fx.tablas.registros_fuerza_ventas.push({ id, evento_id: "evt-1", nombre: body.p_nombre, cargo: body.p_cargo, ciudad: body.p_ciudad });
      return id;
    },
    listar_fotos_evento_ejecucion: (body, fx) => {
      sesionOk(body, fx);
      return fx.tablas.evento_repositorio_archivos.filter((f) => f.origen === "ejecucion").map((f) => ({
        id: f.id, etiqueta: f.etiqueta, nombre: "foto.jpg", tipo: "image/jpeg", dataUrl: f.data_url, archivoId: f.id, sesionId: f.sesion_id ?? null,
      }));
    },
    registrar_foto_evento_ejecucion: (body, fx) => {
      sesionOk(body, fx);
      const resto = fx.tablas.evento_repositorio_archivos.filter((f) => f.etiqueta !== body.p_etiqueta);
      if (resto.length >= 4) throw new Error("Ya hay 4 fotos del evento.");
      fx.tablas.evento_repositorio_archivos = resto;
      const id = `foto-${Math.random().toString(36).slice(2, 7)}`;
      fx.tablas.evento_repositorio_archivos.push({ id, categoria: "fotos", etiqueta: body.p_etiqueta, origen: "ejecucion", data_url: body.p_data_url });
      return id;
    },
  },
};

let fallas = 0;
const afirmar = (c, m) => { if (c) console.log(`  OK  ${m}`); else { console.error(`  X   ${m}`); fallas++; } };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await (await browser.newContext()).newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push(m.text()); });
await interceptarSupabase(page, fixtures);

console.log("1. Ingresar");
await page.goto(pathToFileURL(rutaBundle).href);
await page.fill("#ej-codigo", "A3F7K9");
await page.fill("#ej-responsable", "Carlos Ruiz");
await page.click('button:has-text("Ingresar")');
await page.waitForSelector("text=Simposio de Catarata 2026", { timeout: 5000 });

console.log("2. Fuerza de ventas (nombre, cargo, ciudad)");
await page.getByTestId("menu-fuerza-ventas").click();
await page.waitForSelector('[data-testid="form-fuerza-ventas"]');
await page.fill("#fv-nombre", "Laura Gómez");
await page.fill("#fv-cargo", "Representante de ventas");
await page.fill("#fv-ciudad", "Medellín");
await page.click('button:has-text("Guardar")');
await page.waitForTimeout(500);
const fv = fixtures.tablas.registros_fuerza_ventas[0];
afirmar(fv?.nombre === "LAURA GÓMEZ" && fv?.cargo === "REPRESENTANTE DE VENTAS" && fv?.ciudad === "MEDELLÍN", "se registra la persona de fuerza de ventas vía RPC (Entrega 31: en MAYÚSCULAS)");

console.log("3. Fotos del evento");
if (!(await page.getByTestId("menu-fotos").isVisible().catch(() => false))) {
  const volver = page.getByRole("button", { name: /Volver al menú|Volver|Continuar|Listo/ }).first();
  if (await volver.isVisible().catch(() => false)) await volver.click();
}
await page.getByTestId("menu-fotos").click();
await page.waitForSelector('[data-testid="pantalla-fotos"]');
for (const k of ["grupal", "actividad_1", "actividad_2", "speaker"]) {
  afirmar((await page.getByTestId(`marco-${k}`).count()) === 1, `marco ${k} visible`);
}
await page.getByTestId("marco-grupal").click();
const [selector] = await Promise.all([page.waitForEvent("filechooser"), page.getByTestId("foto-desde-camara").click()]);
await selector.setFiles({ name: "g.png", mimeType: "image/png", buffer: PNG });
await page.waitForTimeout(1200);
const foto = fixtures.tablas.evento_repositorio_archivos[0];
afirmar(foto?.etiqueta === "grupal" && foto?.origen === "ejecucion", "la foto grupal queda en el repositorio con origen 'ejecucion'");
afirmar(String(foto?.data_url ?? "").startsWith("data:image/jpeg"), "la foto se comprime a JPEG antes de enviarse");
afirmar(await page.getByTestId("pantalla-fotos").locator("img").count() >= 1, "el marco muestra la foto tomada");

console.log("   Cargar la foto de otro marco desde un archivo (sin cámara)");
await page.getByTestId("marco-speaker").click();
const [selector2] = await Promise.all([page.waitForEvent("filechooser"), page.getByTestId("foto-desde-archivo").click()]);
await selector2.setFiles({ name: "s.png", mimeType: "image/png", buffer: PNG });
await page.waitForTimeout(1200);
afirmar(fixtures.tablas.evento_repositorio_archivos.some((f) => f.etiqueta === "speaker"), "la foto del speaker se carga desde archivo");

afirmar(errores.length === 0, `sin errores de consola/página (${errores.length})`);
if (errores.length) console.error(errores.join("\n"));
await browser.close();
if (fallas) { console.error(`\n${fallas} verificación(es) fallaron.`); process.exit(1); }
console.log("\nTodas las verificaciones pasaron.");
