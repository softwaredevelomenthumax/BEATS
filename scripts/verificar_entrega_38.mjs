#!/usr/bin/env node
// Entrega 38 — Créditos, títulos del Visor Documental y barra vertical de las pestañas. Contra fixtures locales.
import { chromium } from "playwright";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { interceptarSupabase, resolverCaptchaLogin } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ahora = new Date().toISOString();
const fixtures = {
  usuariosAuth: [{ id: "auth-usr-admin", email: "admin.prueba@bausch.com", password: "clave-segura-123" }],
  tablas: {
    usuarios: [{ id: "usr-admin", nombre: "Admin Prueba", cargo: "Prueba", email: "admin.prueba@bausch.com", rol: "legal_compliance", iniciales: "AP", firma_id: null,
      debe_cambiar_password: false, auth_user_id: "auth-usr-admin", telefono: "", paginas_permitidas: [], empresas_grupo: ["Bausch + Lomb"], paises_operacion: ["Colombia"],
      es_administrador: true, administrador_alcance_limitado: false }],
    catalogo_valores: [{ id: "c1", catalogo: "empresasGrupo", valor: "Bausch + Lomb", orden: 1 }],
    speakers: [], solicitudes_evento: [], evento_aprobaciones: [], sesiones_evento: [], cafs: [], caf_aprobaciones: [], convenios_hcp: [], convenio_hcp_aprobaciones: [],
    convenios_pago_hcp: [], notificaciones: [], paises_region: [{ id: "pr-1", pais: "Colombia" }], backups_registro: [], auditoria: [],
  },
  rpc: { beats_backup_historial: () => [] },
};
let fallas = 0;
const afirmar = (c, m) => { if (c) console.log(`  OK  ${m}`); else { console.error(`  X   ${m}`); fallas++; } };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
await interceptarSupabase(page, fixtures);
await page.goto(pathToFileURL(resolve(raiz, "bundle.html")).href);
await page.fill("#email", "admin.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("aside", { timeout: 15000 });
const ir = async (t) => { await page.locator("aside").getByText(t, { exact: true }).last().click(); await page.waitForTimeout(700); };

console.log("1. Créditos");
await ir("Créditos");

const cuerpo = await page.locator("body").innerText();
afirmar(!/Agosto de 2026/.test(cuerpo), "ya no aparece el globo «Sebastian González · Agosto de 2026»");
afirmar(/Humax Pharmaceutical S\.A\., una compañía Bausch Health\s*\n\s*Medellín · Colombia/.test(cuerpo), "«Medellín · Colombia» queda en una línea debajo de Humax");
const negritas = await page.locator("main strong").allInnerTexts();
afirmar(negritas.some((t) => t.startsWith("BEATS (Bausch Events Approval & Tracking System)")), "BEATS (…) en negrita");
afirmar(negritas.includes("Sebastian González Avendaño"), "nombre del autor en negrita");
afirmar(await page.locator("main p.text-justify").count() >= 1, "texto justificado");

console.log("2. Visor Documental");
await ir("Visor Documental");
afirmar((await page.locator("main h1, h1").first().innerText()).trim() === "Visor Documental", "título «Visor Documental»");
afirmar(!/vista de Legal\/Compliance/.test(await page.locator("body").innerText()), "sin «vista de Legal/Compliance»");

console.log("3. Pestañas sin barra vertical");
for (const t of ["Backup", "Indicadores de Uso y Gestión", "Informe de Pagos a HCPs/Speakers"]) {
  try {
    await ir(t);
    const r = await page.evaluate(() => [...document.querySelectorAll('[role="tablist"]')].map((e) => [e.scrollHeight, e.clientHeight]));
    afirmar(r.length > 0 && r.every(([s, c]) => s <= c), `${t}: sin desbordamiento vertical en la cinta (${JSON.stringify(r)})`);
  } catch (e) { afirmar(false, `${t}: ${String(e).slice(0, 80)}`); }
}
await browser.close();
if (fallas) { console.error(`\n${fallas} comprobación(es) fallaron`); process.exit(1); }
console.log("\nEntrega 38: todo OK");
