#!/usr/bin/env node
// Entrega 34 — Documentos: orden por encabezado + agrupación por evento; menú lateral: «Fijados» y títulos en negrita.
import { chromium } from "playwright";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { interceptarSupabase, resolverCaptchaLogin } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = process.env.SALIDA_VERIFICACION ?? "/tmp/beats_entrega34";
await mkdir(SALIDA, { recursive: true });
const ahora = new Date().toISOString();
const ev = (id, nombre, dia) => ({ id, estado: "Aprobado", creado_por_id: "usr-admin", creado_en: `2026-10-0${dia}T10:00:00Z`, nombre_evento: nombre, empresa_grupo: "Bausch + Lomb", pais: "Colombia", ciudad: "Bogotá", fecha_inicio_evento: `2026-11-0${dia}`, fecha_fin_evento: `2026-11-0${dia}`, numero_asistentes: 10, modalidad_sesiones: "Única sesión" });
const fx = {
  usuariosAuth: [{ id: "auth-admin", email: "admin.prueba@bausch.com", password: "clave-segura-123" }],
  tablas: {
    usuarios: [{ id: "usr-admin", nombre: "Admin Prueba", cargo: "Dirección Médica", email: "admin.prueba@bausch.com", rol: "medica", iniciales: "AP", firma_id: null, debe_cambiar_password: false, auth_user_id: "auth-admin", telefono: "", paginas_permitidas: [], empresas_grupo: ["Bausch + Lomb"], paises_operacion: ["Colombia"], es_administrador: true, administrador_alcance_limitado: false }],
    catalogo_valores: [{ id: "c1", catalogo: "empresasGrupo", valor: "Bausch + Lomb", orden: 1 }, { id: "c2", catalogo: "monedas", valor: "COP", orden: 1 }],
    speakers: [{ id: "spk-1", nombre_completo: "Dra. Camila Reyes", especialidad: "Oftalmología" }],
    solicitudes_evento: [ev("evt-b", "Beta Simposio", 2), ev("evt-a", "Alfa Congreso", 3)],
    cafs: [{ id: "caf-1", estado: "Aprobado", evento_origen_id: "evt-b", speaker_id: "spk-1", creado_por_id: "usr-admin", creado_en: "2026-10-04T10:00:00Z", codigo_documento: "CAF-1", compania_nombre: "Bausch + Lomb", contraparte_nombre: "Dra. Camila Reyes" }],
    evento_aprobaciones: [], sesiones_evento: [], evento_muestras_planeadas: [], eventos_codigos_acceso: [], evento_speakers_participacion: [], evento_speaker_presupuestos: [],
    fmv_checklists: [], fmv_aprobaciones: [], convenios_pago_hcp: [], convenio_aprobaciones: [], caf_aprobaciones: [], notificaciones_pago_hcp: [], convenios_hcp: [],
    convenio_hcp_aprobaciones: [], archivos_adjuntos: [], notificaciones: [], paises_region: [{ id: "pr-1", pais: "Colombia" }],
  },
  rpc: {},
};
let fallas = 0;
const afirmar = (c, m) => { if (c) console.log(`  OK  ${m}`); else { console.error(`  X   ${m}`); fallas++; } };
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|fonts\.g/.test(m.text())) errs.push(m.text()); });
await interceptarSupabase(page, fx);
await page.goto(pathToFileURL(resolve(raiz, "bundle.html")).href);
await page.fill("#email", "admin.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Beta Simposio", { timeout: 10000 });

console.log("1. Lista de documentos");
await page.getByTestId("tablero-vista-listado").click();
await page.getByTestId("tablero-listado").waitFor();
afirmar(await page.getByTestId("tablero-agrupar-evento").getAttribute("aria-pressed") === "true", "agrupar por evento viene activo");
const grupos = await page.getByTestId("tablero-grupo-evento").allInnerTexts();
afirmar(grupos.length === 2 && /Beta Simposio/.test(grupos.join("|")) && /2 documentos/.test(grupos.join("|")), `dos grupos; Beta con 2 documentos (${grupos.map((g) => g.replace(/\s+/g, " ")).join(" | ")})`);
await page.screenshot({ path: `${SALIDA}/lista_agrupada.png` });
await page.getByTestId("tablero-agrupar-evento").click();
afirmar((await page.getByTestId("tablero-grupo-evento").count()) === 0, "sin agrupar no hay encabezados de grupo");
const nombres = async () => (await page.getByTestId("tablero-fila").locator("td:first-child").allInnerTexts()).map((x) => x.trim());
await page.getByTestId("orden-nombre").click();
let n = await nombres();
afirmar(JSON.stringify(n) === JSON.stringify([...n].sort((a, b) => a.localeCompare(b, "es"))), `orden ascendente por documento (${n.join(", ")})`);
await page.getByTestId("orden-nombre").click();
n = await nombres();
afirmar(JSON.stringify(n) === JSON.stringify([...n].sort((a, b) => b.localeCompare(a, "es"))), "descendente al segundo clic");
afirmar((await page.locator('th[aria-sort="descending"]').count()) === 1, "aria-sort indica la columna activa");
await page.getByTestId("orden-nombre").click();
afirmar((await page.locator("th[aria-sort]").count()) === 0, "tercer clic quita el orden");
await page.getByTestId("orden-tipo").click();
afirmar((await page.locator('th[aria-sort="ascending"]').count()) === 1, "también ordena por Tipo");
await page.getByTestId("tablero-agrupar-evento").click();
await page.screenshot({ path: `${SALIDA}/lista_ordenada.png` });

console.log("2. Menú lateral");
const titulo = await page.locator('[data-testid^="nav-grupo-"]').first().evaluate((e) => getComputedStyle(e).fontWeight).catch(() => "0");
afirmar(Number(titulo) >= 700, `títulos de categoría en negrita (${titulo})`);
afirmar((await page.getByTestId("nav-fijados").count()) === 0, "sin fijados no aparece la sección");
await page.getByTestId("nav-fijar-panel-en-vivo").evaluate((e) => e.click()).catch(async () => {
  const id = await page.locator('[data-testid^="nav-fijar-"]').first().getAttribute("data-testid");
  await page.getByTestId(id).evaluate((e) => e.click());
});
await page.waitForTimeout(200);
afirmar((await page.getByTestId("nav-fijados").count()) === 1, "al fijar aparece «Fijados» arriba");
await page.reload();
await page.waitForSelector('[data-testid="nav-fijados"]', { timeout: 10000 }).catch(() => {});
afirmar((await page.getByTestId("nav-fijados").count()) === 1, "el fijado se recuerda tras recargar");
await page.screenshot({ path: `${SALIDA}/menu.png` });
afirmar(errs.length === 0, `sin errores de consola (${errs.length})`);
if (errs.length) console.error(errs.join("\n"));
await browser.close();
if (fallas) { console.error(`\n${fallas} verificación(es) fallaron.`); process.exit(1); }
console.log("\nTodas las verificaciones pasaron.");
