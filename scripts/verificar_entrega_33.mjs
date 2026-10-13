#!/usr/bin/env node
// Entrega 33 — Marquesina por sesión, Créditos, foto de usuario (Usuarios y Roles + avatar) y Panel en Vivo. Contra fixtures locales.
import { chromium } from "playwright";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { interceptarSupabase, crearHandlerResumenEjecucionEvento, resolverCaptchaLogin } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = process.env.SALIDA_VERIFICACION ?? "/tmp/beats_entrega33";
await mkdir(SALIDA, { recursive: true });
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
let fallas = 0;
const afirmar = (c, m) => { if (c) console.log(`  OK  ${m}`); else { console.error(`  X   ${m}`); fallas++; } };
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const hoy = new Date().toISOString().slice(0, 10);

// ───────────── A. Marquesina con sesiones ─────────────
console.log("A. Marquesina: selector de sesión");
{
  const fx = {
    tablas: {
      solicitudes_evento: [{ id: "evt-1", estado: "Aprobado", nombre_evento: "Congreso Multisede", direccion: "", ciudad: "Bogotá", fecha_inicio_evento: "2026-11-10", fecha_fin_evento: "2026-11-12" }],
      eventos_codigos_acceso: [{ id: "cod-1", evento_id: "evt-1", codigo: "A3F7K9", activo: true, creado_por_id: "u", creado_en: new Date().toISOString(), expira_en: null }],
      productos_portafolio: [], registros_participacion: [{ id: "r1", evento_id: "evt-1", cedula: "1", tipo_participacion: "evento" }, { id: "r2", evento_id: "evt-1", cedula: "2", tipo_participacion: "evento" }],
      muestras_entregadas: [], archivos_adjuntos: [],
    },
    rpc: {
      resumen_ejecucion_evento: crearHandlerResumenEjecucionEvento(),
      resumen_ejecucion_evento_ampliado: () => ({
        esperados: 30, llegadasPorHora: [], ultimos: [], especialidades: [], ciudades: [], ubicaciones: [],
        evento: { pais: "Colombia", modalidad: "Presencial", ciudad: "Bogotá" },
        sesiones: [
          { id: "s1", numero: 1, fecha: "2026-11-10", lugar: "Hotel Andino", pais: "Colombia", estadoProvincia: "Cundinamarca", ciudad: "Bogotá", esperados: 10, registros: 1 },
          { id: "s2", numero: 2, fecha: "2026-11-12", lugar: "Centro de Convenciones", pais: "Colombia", estadoProvincia: "Antioquia", ciudad: "Medellín", esperados: 20, registros: 1 },
        ],
      }),
    },
  };
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await interceptarSupabase(page, fx);
  await page.goto(pathToFileURL(resolve(raiz, "marquesina.html")).href);
  await page.fill("#mq-codigo", "A3F7K9");
  await page.click('button:has-text("Mostrar evento")');
  await page.waitForSelector("text=Congreso Multisede", { timeout: 6000 });
  await page.getByTestId("selector-sesion").waitFor({ timeout: 6000 });
  afirmar(await page.getByTestId("selector-sesion").isVisible(), "aparece el selector de sesión");
  afirmar(await page.getByTestId("sesion-todas").isVisible() && await page.getByTestId("sesion-1").isVisible() && await page.getByTestId("sesion-2").isVisible(), "«Todas» + Sesión 1 + Sesión 2");
  await page.getByTestId("sesion-2").click();
  await page.waitForTimeout(400);
  const ub = await page.getByTestId("mq-ubicacion").innerText();
  afirmar(/Medell/.test(ub) && /Centro de Convenciones/.test(ub), `ubicación de la sesión 2 (${ub.trim()})`);
  afirmar(/12/.test(await page.getByTestId("mq-fechas").innerText()), "fecha de la sesión 2");
  await page.screenshot({ path: `${SALIDA}/marquesina_sesion2.png` });
  await page.getByTestId("sesion-1").click();
  await page.waitForTimeout(400);
  afirmar(/Hotel Andino/.test(await page.getByTestId("mq-ubicacion").innerText()), "ubicación de la sesión 1");
  await page.reload();
  await page.waitForSelector("text=Congreso Multisede", { timeout: 6000 });
  await page.getByTestId("selector-sesion").waitFor();
  afirmar(/Hotel Andino/.test(await page.getByTestId("mq-ubicacion").innerText()), "la sesión elegida se recuerda tras recargar");
  await page.getByTestId("sesion-todas").click();
  afirmar(!/Hotel Andino/.test(await page.getByTestId("mq-ubicacion").innerText()), "«Todas» vuelve a la vista general");
  afirmar(errs.length === 0, `sin errores de consola (${errs.length})`);
  if (errs.length) console.error(errs.join("\n"));
  await ctx.close();
}

// ───────────── B. Bundle principal ─────────────
console.log("B. Bundle principal: Créditos, foto de usuario");
{
  const fx = {
    usuariosAuth: [{ id: "auth-admin", email: "admin.prueba@bausch.com", password: "clave-segura-123" }],
    tablas: {
      usuarios: [{
        id: "usr-admin", nombre: "Admin Prueba", cargo: "Dirección Médica", email: "admin.prueba@bausch.com", rol: "medica", iniciales: "AP",
        firma_id: null, foto_id: "foto-1", debe_cambiar_password: false, auth_user_id: "auth-admin", telefono: "", paginas_permitidas: [],
        empresas_grupo: ["Bausch + Lomb"], paises_operacion: ["Colombia"], es_administrador: true, administrador_alcance_limitado: false,
      }],
      catalogo_valores: [{ id: "c1", catalogo: "empresasGrupo", valor: "Bausch + Lomb", orden: 1 }],
      archivos_adjuntos: [{ id: "foto-1", nombre: "foto.png", tipo: "image/png", tamano_bytes: 70, data_url: PNG }],
      solicitudes_evento: [], speakers: [], paises_region: [], notificaciones: [],
    },
    rpc: {},
  };
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|fonts\.g/.test(m.text())) errs.push(m.text()); });
  await interceptarSupabase(page, fx);
  await page.goto(pathToFileURL(resolve(raiz, "bundle.html")).href);
  await page.fill("#email", "admin.prueba@bausch.com");
  await page.fill("#password", "clave-segura-123");
  await resolverCaptchaLogin(page);
  await page.click('button[type="submit"]');
  await page.waitForSelector("header", { timeout: 10000 });
  await page.waitForTimeout(800);
  const imgHeader = await page.locator('header [data-testid="avatar-usuario"] img').count();
  afirmar(imgHeader > 0, "el encabezado muestra la foto del usuario (avatar circular)");

  console.log("B1. Créditos");
  await page.click('button:has-text("Créditos")');
  await page.getByTestId("creditos-agradecimientos").waitFor({ timeout: 5000 });
  const t = await page.getByTestId("creditos-agradecimientos").innerText();
  afirmar(/Agradecimientos especiales:/.test(t), "«Agradecimientos especiales:»");
  afirmar(/Lizeth N/.test(t) && /Compliance & Legal/.test(t) && /Colombia/.test(t), "primer punto: Lizeth Núñez");
  afirmar(/Ferney Estrada/.test(t) && /Jorge Acevedo/.test(t), "segundo punto: equipo de TI Colombia");
  afirmar((await page.getByTestId("creditos-agradecimientos").locator("li").count()) === 2, "dos viñetas");
  afirmar(!/equipo de TI local/i.test(await page.locator("body").innerText()), "el texto anterior ya no aparece");
  const alto = await page.getByTestId("creditos-agradecimientos").evaluate((e) => e.closest("main, section, div[class*='max-w']")?.getBoundingClientRect().height ?? 0);
  await page.screenshot({ path: `${SALIDA}/creditos.png` });
  console.log(`     (alto del contenedor: ${Math.round(alto)} px)`);

  console.log("B2. Usuarios y Roles: foto");
  const navU = page.locator('button:has-text("Usuarios")').first();
  await navU.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SALIDA}/usuarios.png` });
  afirmar(await page.locator('[data-testid="avatar-usuario"] img').count() > 0, "la tabla de usuarios muestra el avatar con foto");
  const parches = [];
  page.on("request", (r) => { if (r.method() === "PATCH" && /\/usuarios/.test(r.url())) parches.push(r.postData()); });
  await page.locator('button[title="Editar"]').first().click();
  await page.waitForTimeout(500);
  const hayCampo = await page.getByTestId("usr-foto").count();
  afirmar(hayCampo > 0, "el formulario de usuario tiene el campo de foto");
  if (hayCampo) {
    await page.screenshot({ path: `${SALIDA}/usuarios_form.png` });
    await page.getByTestId("usr-foto-input").setInputFiles({ name: "nueva.png", mimeType: "image/png", buffer: Buffer.from(PNG.split(",")[1], "base64") });
    await page.waitForTimeout(1000);
    const guardar = page.locator('[role="dialog"]').getByRole("button", { name: /Guardar/ }).last();
    if (await guardar.count()) { await guardar.click(); await page.waitForTimeout(1200); }
    afirmar(parches.some((p) => p && /foto_id/.test(p)), "al guardar se envía foto_id");
  }
  afirmar(errs.length === 0, `sin errores de consola (${errs.length})`);
  if (errs.length) console.error(errs.join("\n"));
  await ctx.close();
}
await browser.close();
if (fallas) { console.error(`\n${fallas} verificación(es) fallaron.`); process.exit(1); }
console.log("\nTodas las verificaciones pasaron.");
