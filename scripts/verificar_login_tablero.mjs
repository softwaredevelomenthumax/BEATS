#!/usr/bin/env node
// Fase 0 — verifica el flujo de login simulado y que el Tablero se
// renderice (vacío) a partir de fixtures locales. Nunca toca el proyecto
// real de Supabase: toda la red pasa por scripts/lib/fixtures.mjs.
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { interceptarSupabase,
  resolverCaptchaLogin, } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rutaBundle = resolve(raiz, "bundle.html");

const fixtures = {
  usuariosAuth: [{ id: "auth-1", email: "ana.prueba@bausch.com", password: "clave-segura-123" }],
  tablas: {
    usuarios: [
      {
        id: "usr-1",
        nombre: "Ana Prueba",
        cargo: "Gerente de Marketing",
        email: "ana.prueba@bausch.com",
        rol: "marketing",
        iniciales: "AP",
        firma_id: null,
        debe_cambiar_password: false,
        auth_user_id: "auth-1",
        telefono: "",
        paginas_permitidas: [],
        empresas_grupo: [],
        paises_operacion: [],
        es_administrador: true,
        administrador_alcance_limitado: false,
      },
    ],
    v_documentos: [],
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

console.log("1. Cargar bundle.html y ver la pantalla de login");
await page.goto(pathToFileURL(rutaBundle).href);
await page.waitForSelector("text=Iniciar sesión", { timeout: 5000 });
afirmar(await page.isVisible("text=Iniciar sesión"), "se muestra la pantalla de login");

console.log("2. Iniciar sesión con credenciales simuladas");
await page.fill("#email", "ana.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');

await page.waitForSelector("text=Tablero", { timeout: 5000 });
afirmar(await page.isVisible("text=Tablero"), "tras el login se ve el Tablero");
afirmar(await page.isVisible("text=Ana Prueba"), "el nombre del usuario aparece en la barra superior");

console.log("3. El Tablero ofrece los 6 estados en la lista desplegable de Estado");
await page.getByTestId("tablero-filtro-estado").click();
for (const estado of ["Borrador", "Pendiente", "Aprobado", "Rechazado", "Completado", "Anulado"]) {
  afirmar(await page.getByTestId(`tablero-filtro-estado-${estado}`).isVisible(), `opción de estado disponible: ${estado}`);
}
await page.keyboard.press("Escape");
afirmar(
  await page.isVisible("text=No hay documentos que coincidan con los filtros."),
  "la tabla de documentos muestra el estado vacío correcto",
);

console.log("4. Cerrar sesión vuelve a la pantalla de login");
await page.click('button:has-text("Ana Prueba")');
await page.click('[role="menuitem"]:has-text("Cerrar sesión")');
await page.waitForSelector("text=Iniciar sesión", { timeout: 5000 });
afirmar(await page.isVisible("text=Iniciar sesión"), "cerrar sesión vuelve al login");

afirmar(erroresConsola.length === 0, `sin errores de consola/página (encontrados: ${erroresConsola.length})`);
if (erroresConsola.length > 0) {
  console.error(erroresConsola.join("\n"));
}

await browser.close();

if (fallas > 0) {
  console.error(`\n${fallas} verificación(es) fallaron.`);
  process.exit(1);
}
console.log("\nTodas las verificaciones pasaron.");
