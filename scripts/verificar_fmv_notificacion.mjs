#!/usr/bin/env node
// Fase 2 — verifica el ciclo de FMV Checklist (certificación con cálculo
// correcto de Tier) y de Notificación de Pago a HCPs (certificación), ambos
// documentos de un solo firmante sin cadena de aprobación. Todo contra
// fixtures locales.
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { interceptarSupabase,
  resolverCaptchaLogin, } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rutaBundle = resolve(raiz, "bundle.html");

// Criterios pensados para que el puntaje total dé 16 (2x A=3 + 2x B=2 +
// 2x C=1 = 6+4+2 = 12... se ajusta abajo): usamos A,A,A,A,B,B = 3*4+2*2=16
// para caer en Tier 1 (>=15) de forma inequívoca.
const CRITERIOS = [
  { id: "crit-1", clave: "criterio1", titulo: "Experiencia clínica", pregunta: "¿Años de experiencia?", orden: 1, respuesta: "A" },
  { id: "crit-2", clave: "criterio2", titulo: "Reputación académica", pregunta: "¿Publicaciones relevantes?", orden: 2, respuesta: "A" },
  { id: "crit-3", clave: "criterio3", titulo: "Rol institucional", pregunta: "¿Cargo directivo?", orden: 3, respuesta: "A" },
  { id: "crit-4", clave: "criterio4", titulo: "Alcance del servicio", pregunta: "¿Complejidad del servicio?", orden: 4, respuesta: "A" },
  { id: "crit-5", clave: "criterio5", titulo: "Mercado local", pregunta: "¿Tarifa de mercado?", orden: 5, respuesta: "B" },
  { id: "crit-6", clave: "criterio6", titulo: "Tiempo dedicado", pregunta: "¿Horas dedicadas?", orden: 6, respuesta: "B" },
];
// Puntaje esperado: A=3 x4 + B=2 x2 = 12 + 4 = 16 -> Tier 1 (>=15).
const PUNTAJE_ESPERADO = 16;

const opcionesCriterio = [];
for (const c of CRITERIOS) {
  for (const letra of ["A", "B", "C", "D"]) {
    opcionesCriterio.push({ id: `${c.id}-${letra}`, criterio_id: c.id, valor: letra, texto: `Opción ${letra} — ${c.titulo}` });
  }
}

const fixtures = {
  usuariosAuth: [{ id: "auth-admin", email: "admin.prueba@bausch.com", password: "clave-segura-123" }],
  tablas: {
    usuarios: [
      {
        id: "usr-admin",
        nombre: "Admin Prueba",
        cargo: "Dirección Médica",
        email: "admin.prueba@bausch.com",
        rol: "medica",
        iniciales: "AP",
        firma_id: null,
        debe_cambiar_password: false,
        auth_user_id: "auth-admin",
        telefono: "",
        paginas_permitidas: [],
        empresas_grupo: ["Bausch + Lomb"],
        paises_operacion: ["Colombia"],
        es_administrador: true,
        administrador_alcance_limitado: false,
      },
    ],
    v_documentos: [],
    catalogo_valores: [
      { id: "cat-1", catalogo: "especialidadesMedicas", valor: "Oftalmología", orden: 1 },
      { id: "cat-2", catalogo: "especialidadesMedicas", valor: "Cardiología", orden: 2 },
      { id: "cat-3", catalogo: "monedas", valor: "COP", orden: 1 },
      { id: "cat-4", catalogo: "monedas", valor: "USD", orden: 2 },
      { id: "cat-5", catalogo: "empresasGrupo", valor: "Bausch + Lomb", orden: 1 },
    ],
    // País ahora es siempre un desplegable (SelectPaisCiudad) — necesita el
    // catálogo `paises_region`. Sin `paises_region_ciudades`, Ciudad sigue
    // siendo texto libre, que es lo que este script ya espera (`.fill()`).
    paises_region: [{ id: "pr-1", pais: "Colombia" }],
    configuracion_fmv: [{ id: 1, umbral_tier1: 15, umbral_tier2: 9 }],
    fmv_criterios: CRITERIOS.map((c) => ({
      id: c.id,
      configuracion_fmv_id: 1,
      clave: c.clave,
      titulo: c.titulo,
      pregunta: c.pregunta,
      orden: c.orden,
    })),
    fmv_criterio_opciones: opcionesCriterio,
    fmv_checklists: [],
    notificaciones_pago_hcp: [],
    campos_personalizados_definicion: [],
    etiquetas_campo: [],
  },
};

let fallas = 0;
function afirmar(condicion, mensaje) {
  if (condicion) {
    console.log(`  OK  ${mensaje}`);
  } else {
    console.error(`  X   ${mensaje}`);
    fallas++;
  }
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const erroresConsola = [];
page.on("pageerror", (e) => erroresConsola.push(String(e)));
page.on("console", (msg) => {
  // Filtra "Failed to load resource": incluye la hoja de Google Fonts que
  // los bundles cargan por <link> (ver verificar_caf.mjs) y que no hay
  // internet para resolver en un entorno de pruebas — no es un error de la app.
  if (msg.type() === "error" && !/Failed to load resource/.test(msg.text())) erroresConsola.push(msg.text());
});

await interceptarSupabase(page, fixtures);

console.log("1. Login e ir a Nuevo FMV");
await page.goto(pathToFileURL(rutaBundle).href);
await page.fill("#email", "admin.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Tablero", { timeout: 5000 });
await page.click('button:has-text("FMV Checklist")');
await page.waitForSelector("text=Nuevo FMV Checklist", { timeout: 5000 });
afirmar(await page.isVisible("text=Nuevo FMV Checklist"), "se abre el formulario de Nuevo FMV");

console.log("2. Completar el perfil del HCP");
await page.getByLabel("Nombre completo del HCP *").fill("Dra. Camila Reyes");
await page.getByLabel("Región *").fill("Andina");
await page.getByLabel("País *").click();
await page.getByRole("option", { name: "Colombia" }).click();
await page.getByLabel("Especialidad *").click();
await page.getByRole("option", { name: "Oftalmología" }).click();
await page.getByLabel("Licencia nacional *").fill("RM-12345");
await page.getByLabel("Dirección principal *").fill("Calle 10 # 5-20");
await page.getByLabel("Ciudad *").fill("Bogotá");

console.log("3. Responder los 6 criterios de FMV");
for (const c of CRITERIOS) {
  await page.locator(`#fmv-${c.clave}`).click();
  await page.getByRole("option", { name: new RegExp(`^${c.respuesta} —`) }).click();
}
afirmar(await page.isVisible(`text=Puntaje: ${PUNTAJE_ESPERADO}`), `el puntaje se calcula correctamente (${PUNTAJE_ESPERADO}/18)`);
afirmar(await page.isVisible("text=Tier 1"), "el Tier calculado es Tier 1 (puntaje >= umbral)");

console.log("4. Certificar y completar");
await page.getByLabel("Nombre de quien certifica *").fill("Dr. Juan Pérez");
await page.getByLabel("Cargo de quien certifica *").fill("Director Médico");
await page.click('button:has-text("Certificar y completar")');
await page.waitForSelector("text=Dra. Camila Reyes – Oftalmología", { timeout: 5000 });
afirmar(await page.isVisible("text=Dra. Camila Reyes – Oftalmología"), "el FMV aparece en el Tablero tras certificarlo");
afirmar(await page.isVisible("text=Completado"), "el FMV queda en estado Completado directamente (sin cadena de aprobación)");

console.log("5. Abrir el FMV completado (vista compacta) e imprimir");
await page.click("text=Dra. Camila Reyes – Oftalmología");
await page.waitForSelector("text=Criterios de Fair Market Value", { timeout: 5000 });
afirmar(await page.isVisible(`text=${PUNTAJE_ESPERADO} / 18`), "la vista compacta muestra el puntaje total correcto");
afirmar(await page.isVisible("text=Tier 1"), "la vista compacta muestra el Tier correcto");
afirmar(!(await page.isVisible("text=Firmar y completar")), "un FMV Completado ya no ofrece la acción de firmar");
// Fase 8 (hallazgo grande): "Ver / Imprimir / Exportar a PDF" abre un
// diálogo aparte y apilado — el membrete solo vive ahí, nunca en la vista
// compacta de detrás.
afirmar(
  !(await page.isVisible("text=Vista oficial del documento").catch(() => false)),
  "la vista compacta del FMV NO muestra el membrete/toolbar de impresión por defecto",
);
await page.click('button:has-text("Ver / Imprimir / Exportar a PDF")');
await page.waitForSelector("text=Vista oficial del documento", { timeout: 5000 });
afirmar(
  await page.isVisible("text=Checklist de Fair Market Value"),
  "el diálogo de impresión del FMV muestra el membrete con el nombre oficial largo del formato",
);
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
afirmar(await page.isVisible("text=Criterios de Fair Market Value"), "al cerrar la impresión, la vista compacta del FMV sigue abierta detrás");
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

console.log("6. Notificación de Pago a HCP: crear y certificar");
await page.click('button:has-text("Notificación de Pago a HCPs")');
await page.waitForSelector("text=Nueva Notificación de Pago a HCP", { timeout: 5000 });
await page.getByLabel("Nombre del profesional de la salud *").fill("Dr. Andrés Gómez");
await page.getByLabel("Cédula / licencia profesional *").fill("CC-9988776");
await page.getByLabel("Productos *").fill("Lente intraocular XYZ");
await page.getByLabel("Número de factura *").fill("FAC-2026-045");
await page.getByLabel("Fecha de factura *").fill("2026-08-01");
await page.getByLabel("Valor de la factura *").fill("2500000");
await page.getByLabel("Moneda de la factura *").click();
await page.getByRole("option", { name: "COP", exact: true }).click();
await page.getByLabel("Nombre de quien certifica *").fill("Dr. Juan Pérez");
await page.getByLabel("Cargo de quien certifica *").fill("Director Médico");
await page.click('button:has-text("Certificar y completar")');
await page.waitForSelector("text=FAC-2026-045", { timeout: 5000 });
afirmar(await page.isVisible("text=FAC-2026-045"), "la Notificación de Pago aparece en el Tablero tras certificarla");

console.log("7. Anular la Notificación de Pago (como administrador)");
await page.click("text=FAC-2026-045");
await page.waitForSelector("text=Certificación", { timeout: 5000 });
// Fase 8 (hallazgo grande): mismo diálogo de impresión aparte y apilado.
await page.click('button:has-text("Ver / Imprimir / Exportar a PDF")');
await page.waitForSelector("text=Vista oficial del documento", { timeout: 5000 });
afirmar(
  await page.isVisible("text=Notificación de Pago a Profesionales de la Salud"),
  "el diálogo de impresión de la Notificación de Pago muestra el membrete con el nombre oficial largo del formato",
);
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
afirmar(await page.isVisible("text=Certificación"), "al cerrar la impresión, la vista compacta de la Notificación de Pago sigue abierta detrás");
await page.click('button:has-text("Anular")');
await page.getByPlaceholder("Motivo de anulación").fill("Factura duplicada — se anula por error de captura.");
await page.click('button:has-text("Confirmar anulación")');
await page.waitForTimeout(300);
afirmar(await page.isVisible('[role="dialog"] >> text=Anulado'), "la Notificación de Pago queda Anulada");

afirmar(erroresConsola.length === 0, `sin errores de consola/página (encontrados: ${erroresConsola.length})`);
if (erroresConsola.length > 0) console.error(erroresConsola.join("\n"));

await browser.close();

if (fallas > 0) {
  console.error(`\n${fallas} verificación(es) fallaron.`);
  process.exit(1);
}
console.log("\nTodas las verificaciones pasaron.");
