#!/usr/bin/env node
// Fase 8 — verifica "BEATS — Marquesina" (marquesina.html): pantalla pública
// de kiosco, sin login, que sondea `resumen_ejecucion_evento(p_codigo)` cada
// 15s (nunca por Realtime). Código fuente real de la función exportado por
// el usuario con `pg_get_functiondef` — a diferencia de
// `validar_codigo_evento_ejecucion` NO valida `expira_en` ni el `estado`
// del evento, y su único mensaje de error es "Código inválido.". Cubre:
// código inválido, código válido con tiles + ranking de productos, que el
// código guardado en localStorage sobrevive una recarga (comportamiento de
// kiosco), el refresco periódico real (datos nuevos aparecen sin
// intervención), el estado "Sin conexión" cuando el sondeo falla por red
// (sin perder los últimos datos en pantalla) y la vuelta a la pantalla de
// código cuando el código guardado deja de ser válido (código desactivado).
// Todo contra fixtures locales — nunca contra Supabase real.
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { interceptarSupabase, crearHandlerResumenEjecucionEvento } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rutaBundle = resolve(raiz, "marquesina.html");

const fixtures = {
  tablas: {
    solicitudes_evento: [
      {
        id: "evt-1",
        estado: "Aprobado",
        nombre_evento: "Simposio de Catarata 2026",
        direccion: "Calle 100 # 10-20",
        ciudad: "Bogotá",
        fecha_inicio_evento: "2026-11-10",
        fecha_fin_evento: "2026-11-11",
      },
    ],
    eventos_codigos_acceso: [
      { id: "cod-1", evento_id: "evt-1", codigo: "A3F7K9", activo: true, creado_por_id: "usr-1", creado_en: new Date().toISOString(), expira_en: null },
    ],
    productos_portafolio: [
      { id: "prod-1", nombre: "Lente Intraocular X200", empresa_grupo: "Bausch + Lomb", activo: true, orden: 1, logo_id: null },
      { id: "prod-2", nombre: "Solución de Lentes de Contacto Pro", empresa_grupo: "Bausch + Lomb", activo: true, orden: 2, logo_id: null },
    ],
    registros_participacion: [
      { id: "reg-1", evento_id: "evt-1", cedula: "111", tipo_participacion: "evento" },
      { id: "reg-2", evento_id: "evt-1", cedula: "222", tipo_participacion: "evento" },
      { id: "reg-3", evento_id: "evt-1", cedula: "333", tipo_participacion: "stand" },
    ],
    muestras_entregadas: [
      { id: "me-1", evento_id: "evt-1", producto_id: "prod-1", cantidad: 3 },
      { id: "me-2", evento_id: "evt-1", producto_id: "prod-1", cantidad: 2 },
      { id: "me-3", evento_id: "evt-1", producto_id: "prod-2", cantidad: 1 },
    ],
    archivos_adjuntos: [],
  },
  rpc: {
    resumen_ejecucion_evento: crearHandlerResumenEjecucionEvento(),
    resumen_ejecucion_evento_ampliado: (body, fx) => {
      const cod = (fx.tablas.eventos_codigos_acceso ?? []).find((c) => c.codigo === String(body.p_codigo ?? "").trim().toUpperCase() && c.activo);
      if (!cod) throw new Error("Código inválido.");
      const regs = (fx.tablas.registros_participacion ?? []).filter((r) => r.evento_id === cod.evento_id);
      const hora = new Date(); hora.setMinutes(0, 0, 0);
      return {
        esperados: 10,
        llegadasPorHora: [{ hora: new Date(hora.getTime() - 3600_000).toISOString(), total: 1 }, { hora: hora.toISOString(), total: regs.length - 1 }],
        ultimos: regs.map((r, i) => ({ id: r.id, pais: "Colombia", iniciales: "AB", especialidad: "Oftalmología", ciudad: r.ciudad ?? "Bogotá", tipo: r.tipo_participacion, capturadoEn: new Date(Date.now() - i * 60_000).toISOString() })),
        especialidades: [{ nombre: "Oftalmología", total: regs.length }],
        ciudades: [{ nombre: "Bogotá", total: regs.length }],
        // Entrega 31
        evento: { pais: fx.modalidadPrueba === "Virtual" ? "" : "Colombia", modalidad: fx.modalidadPrueba ?? "Presencial", ciudad: "Bogotá" },
        ubicaciones: Object.values(regs.reduce((a, r) => { const c = r.ciudad ?? "Bogotá"; a[c] = a[c] ?? { pais: "Colombia", ciudad: c, total: 0 }; a[c].total++; return a; }, {})),
      };
    },
  },
};

fixtures.modalidadPrueba = process.env.MODALIDAD || "Presencial";
let fallas = 0;
function afirmar(condicion, mensaje) {
  if (condicion) {
    console.log(`  OK  ${mensaje}`);
  } else {
    console.error(`  X   ${mensaje}`);
    fallas++;
  }
}

// Entrega 30: los números llevan data-testid (mq-total, mq-part-<tipo>, mq-prod-<producto>) y suben con animación:
// se espera a que lleguen al valor final.
async function leerNumero(page, testId, esperado) {
  const loc = page.getByTestId(testId);
  try {
    await page.waitForFunction(([id, v]) => document.querySelector(`[data-testid="${id}"]`)?.textContent?.replace(/\D/g, "") === String(v), [testId, esperado], { timeout: 4000 });
  } catch { /* se devuelve lo que haya */ }
  return (await loc.innerText()).replace(/\D/g, "");
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext();
const page = await context.newPage();
const erroresConsola = [];
page.on("pageerror", (e) => erroresConsola.push(String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error" && !/Failed to load resource/.test(msg.text())) erroresConsola.push(msg.text());
});

await interceptarSupabase(page, fixtures);

console.log("1. Código inválido no muestra el tablero");
await page.goto(pathToFileURL(rutaBundle).href);
await page.fill("#mq-codigo", "ZZZZZZ");
await page.click('button:has-text("Mostrar evento")');
await page.waitForTimeout(300);
afirmar(await page.isVisible("text=Código inválido."), "muestra el mensaje exacto de la función real");
afirmar(await page.isVisible("#mq-codigo"), "sigue en la pantalla de código");

console.log("2. Código válido muestra el tablero con tiles y ranking de productos");
await page.fill("#mq-codigo", "A3F7K9");
await page.click('button:has-text("Mostrar evento")');
await page.waitForSelector("text=Simposio de Catarata 2026", { timeout: 5000 });
afirmar(await page.isVisible("text=Bogotá"), "muestra la dirección/ciudad del evento");
afirmar((await leerNumero(page, "mq-total", 3)) === "3", "el total de registrados muestra 3");
afirmar((await leerNumero(page, "mq-part-evento", 2)) === "2", "la participación de Evento muestra 2");
afirmar((await leerNumero(page, "mq-part-stand", 1)) === "1", "la participación de Stand muestra 1");
afirmar(await page.getByTestId("mq-kpi-cumplimiento").isVisible() && /\d+%/.test(await page.getByTestId("mq-kpi-cumplimiento").innerText()), "el mosaico de cumplimiento muestra el porcentaje (hay asistentes esperados)");
afirmar(await page.isVisible("text=Llegadas por hora") && await page.isVisible("text=Últimos check-ins"), "los paneles ampliados (llegadas y últimos check-ins) aparecen");
{
  // Entrega 32: últimos check-ins para pantalla pública — solo especialidad, ubicación, tipo de asistencia y hora (sin iniciales ni nombre).
  const filasUlt = page.getByTestId("mq-ultimos").locator("li");
  afirmar((await filasUlt.count()) > 0, "los últimos check-ins se listan");
  const textoUlt = await page.getByTestId("mq-ultimos").innerText();
  afirmar(/Oftalmología/.test(textoUlt) && /Bogotá/.test(textoUlt), "cada fila muestra especialidad y ubicación");
  afirmar(/(Evento|Taller|Stand)/.test(textoUlt) && /(ahora|hace)/.test(textoUlt), "y el tipo de asistencia y el tiempo transcurrido");
  afirmar(!/\bAB\b/.test(textoUlt), "no muestra las iniciales del asistente");
  afirmar((await page.getByTestId("mq-kpis").locator("> *").count()) === 4, "el encabezado muestra los 4 mosaicos de cifras clave");
}
afirmar(await page.isVisible("text=Lente Intraocular X200"), "el ranking de productos muestra el primer producto");
afirmar(await page.isVisible("text=Solución de Lentes de Contacto Pro"), "el ranking de productos muestra el segundo producto");
afirmar((await leerNumero(page, "mq-prod-Lente Intraocular X200", 5)) === "5", "el primer producto muestra la cantidad total sumada (3+2=5)");

console.log("3. El código queda guardado en localStorage — recargar la página no vuelve a pedirlo (comportamiento de kiosco)");
const codigoGuardado = await page.evaluate(() => localStorage.getItem("beats_marquesina_codigo"));
afirmar(codigoGuardado === "A3F7K9", "el código quedó guardado en localStorage");
await page.reload();
await page.waitForSelector("text=Simposio de Catarata 2026", { timeout: 5000 });
afirmar(await page.isVisible("text=Simposio de Catarata 2026"), "tras recargar, entra directo al tablero sin pedir el código de nuevo");

console.log("4. Refresco periódico real: un nuevo registro/entrega aparece solo, sin intervención (sondeo cada 8 s)");
fixtures.tablas.registros_participacion.push({ id: "reg-4", evento_id: "evt-1", cedula: "444", tipo_participacion: "taller", ciudad: "Medellín" });
fixtures.tablas.muestras_entregadas.push({ id: "me-4", evento_id: "evt-1", producto_id: "prod-2", cantidad: 4 });
await page.waitForTimeout(10_000);
afirmar((await leerNumero(page, "mq-part-taller", 1)) === "1", "tras el sondeo automático, Taller pasó a mostrar 1 sin recargar la página");
afirmar(await page.getByTestId("aviso-checkin").first().isVisible().catch(() => false), "aparece el aviso animado «+N» al entrar un check-in nuevo");
afirmar((await leerNumero(page, "mq-prod-Solución de Lentes de Contacto Pro", 5)) === "5", "el segundo producto quedó actualizado a 5 (1+4) tras el sondeo automático");
console.log("4a. Entrega 31: mapa de ubicaciones y aviso de nuevo asistente");
afirmar(await page.getByTestId("mapa-en-vivo").isVisible(), "la marquesina muestra el mapa del evento");
afirmar((await page.getByTestId("mapa-en-vivo").getAttribute("data-modo")) === "pais", "evento presencial → mapa del país");
afirmar(Number(await page.getByTestId("mapa-en-vivo").getAttribute("data-puntos")) >= 2, "el mapa marca las ciudades de los asistentes (Bogotá y Medellín)");
afirmar((await page.getByTestId("aviso-checkin").first().textContent())?.includes("Medellín"), "el aviso dice de qué ciudad es el nuevo asistente");
afirmar(await page.locator('[data-nuevo="1"]').count() > 0, "la ciudad del nuevo check-in se resalta en el mapa");
await page.screenshot({ path: "/tmp/beats_entrega31_marquesina_mapa.png", fullPage: true });

console.log("4b. Modo carrusel: una lámina a la vez");
await page.getByTestId("marquesina-modo-carrusel").click();
afirmar(await page.isVisible("text=Asistentes registrados") && !(await page.isVisible("text=Ranking de muestras entregadas")), "en carrusel solo se ve la primera lámina");
await page.waitForTimeout(2500);
await page.screenshot({ path: "/tmp/beats_entrega30_marquesina.png", fullPage: true });
await page.getByTestId("marquesina-modo-carrusel").click();
await page.getByRole("button", { name: "Panorama" }).or(page.locator('button[title^="Panorama"]')).first().click();
afirmar(await page.isVisible("text=Ranking de muestras entregadas"), "en panorama se ve todo a la vez");
await page.waitForTimeout(2500);
await page.screenshot({ path: "/tmp/beats_entrega30_marquesina_panorama.png", fullPage: true });

console.log("5. Sin conexión durante el sondeo: se muestra el aviso y se conservan los últimos datos");
fixtures.simularSinConexion = true;
await page.waitForSelector("text=Sin conexión", { timeout: 20_000 });
afirmar(await page.isVisible("text=Sin conexión"), "aparece el aviso de sin conexión");
afirmar(await page.isVisible("text=Simposio de Catarata 2026"), "el tablero sigue mostrando los últimos datos conocidos (no queda en blanco)");

console.log("6. Al recuperar la conexión, el aviso desaparece en el siguiente sondeo");
fixtures.simularSinConexion = false;
await page.waitForSelector("text=Sin conexión", { state: "detached", timeout: 20_000 });
afirmar(!(await page.isVisible("text=Sin conexión")), "el aviso de sin conexión desaparece");

console.log("7. Si el código guardado deja de ser válido (se desactivó), vuelve a pedirse");
fixtures.tablas.eventos_codigos_acceso[0].activo = false;
await page.waitForSelector("#mq-codigo", { timeout: 20_000 });
afirmar(await page.isVisible("text=Código inválido."), "muestra el motivo por el que se volvió a pedir el código");
const codigoTrasInvalidar = await page.evaluate(() => localStorage.getItem("beats_marquesina_codigo"));
afirmar(codigoTrasInvalidar === null, "el código inválido se borra de localStorage (no insiste en reintentarlo solo)");

afirmar(erroresConsola.length === 0, `sin errores de consola/página (encontrados: ${erroresConsola.length})`);
if (erroresConsola.length > 0) console.error(erroresConsola.join("\n"));

await browser.close();

if (fallas > 0) {
  console.error(`\n${fallas} verificación(es) fallaron.`);
  process.exit(1);
}
console.log("\nTodas las verificaciones pasaron.");
