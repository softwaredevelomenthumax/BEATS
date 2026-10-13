#!/usr/bin/env node
// Fase 8 (hallazgo grande) — verifica el reto de verificación de seguridad
// ("¿cuánto es A+B?", campo #login-captcha) que el original exige antes de
// dejar enviar el formulario de login y que esta reconstrucción no tenía.
// Confirmado por extracción directa del bundle original
// (referencia/bundle_original.html, función `Tm()`): A y B son enteros
// aleatorios entre 1 y 9, se genera un reto nuevo al montar el formulario y
// tras cualquier intento fallido. Todo contra fixtures locales — nunca
// contra Supabase real.
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { interceptarSupabase } from "./lib/fixtures.mjs";

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

async function leerReto(page) {
  const texto = await page.locator("body").innerText();
  const match = texto.match(/¿cuánto es\s*(\d+)\s*\+\s*(\d+)\?/);
  if (!match) throw new Error("No se encontró el texto del reto de verificación de seguridad.");
  return { a: Number(match[1]), b: Number(match[2]) };
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const erroresConsola = [];
page.on("pageerror", (e) => erroresConsola.push(String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error" && !/Failed to load resource/.test(msg.text())) erroresConsola.push(msg.text());
});

await interceptarSupabase(page, fixtures);

console.log("1. La pantalla de login muestra el reto de verificación de seguridad");
await page.goto(pathToFileURL(rutaBundle).href);
await page.waitForSelector("text=Iniciar sesión", { timeout: 5000 });
afirmar(await page.isVisible("text=Verificación de seguridad"), "se ve la etiqueta 'Verificación de seguridad'");
afirmar(await page.isVisible("#login-captcha"), "el campo #login-captcha está presente");
const reto1 = await leerReto(page);
afirmar(reto1.a >= 1 && reto1.a <= 9 && reto1.b >= 1 && reto1.b <= 9, `el reto usa enteros de 1 a 9 (obtenido: ${reto1.a}+${reto1.b})`);

console.log("2. Responder mal el captcha bloquea el envío, aunque las credenciales sean correctas");
await page.fill("#email", "ana.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await page.fill("#login-captcha", String(reto1.a + reto1.b + 1));
await page.click('button[type="submit"]');
afirmar(
  await page.isVisible("text=La verificación de seguridad no coincide. Intenta de nuevo."),
  "se muestra el mensaje de error de verificación de seguridad",
);
afirmar(!(await page.isVisible("text=Tablero").catch(() => false)), "el login NO se completa con la respuesta incorrecta");

console.log("3. Tras la respuesta incorrecta, se genera un reto nuevo y el campo de respuesta queda vacío");
const reto2 = await leerReto(page);
afirmar(reto2.a !== reto1.a || reto2.b !== reto1.b, "el reto cambió tras el intento fallido (no es el mismo A+B)");
afirmar((await page.locator("#login-captcha").inputValue()) === "", "el campo de respuesta del captcha se limpió");

console.log("4. El botón 'Otro reto' genera un nuevo desafío manualmente");
const retoAntesDelBoton = await leerReto(page);
await page.fill("#login-captcha", "999");
await page.click('button:has-text("Otro reto")');
const retoDespuesDelBoton = await leerReto(page);
afirmar(
  retoDespuesDelBoton.a !== retoAntesDelBoton.a || retoDespuesDelBoton.b !== retoAntesDelBoton.b,
  "'Otro reto' cambia el desafío mostrado",
);
afirmar((await page.locator("#login-captcha").inputValue()) === "", "'Otro reto' también limpia el campo de respuesta");

console.log("5. Credenciales incorrectas con captcha correcto: falla el login y también se renueva el reto");
const retoAntesDeCredenciales = await leerReto(page);
await page.fill("#email", "ana.prueba@bausch.com");
await page.fill("#password", "contraseña-equivocada");
await page.fill("#login-captcha", String(retoAntesDeCredenciales.a + retoAntesDeCredenciales.b));
await page.click('button[type="submit"]');
await page.waitForTimeout(300);
afirmar(!(await page.isVisible("text=Tablero").catch(() => false)), "el login no se completa con contraseña incorrecta");
const retoTrasCredencialesMalas = await leerReto(page);
afirmar(
  retoTrasCredencialesMalas.a !== retoAntesDeCredenciales.a || retoTrasCredencialesMalas.b !== retoAntesDeCredenciales.b,
  "el reto también se renueva tras un fallo de credenciales (no solo de captcha)",
);

console.log("6. Captcha correcto + credenciales correctas: el login se completa");
const retoFinal = await leerReto(page);
await page.fill("#email", "ana.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await page.fill("#login-captcha", String(retoFinal.a + retoFinal.b));
await page.click('button[type="submit"]');
await page.waitForSelector("text=Tablero", { timeout: 5000 });
afirmar(await page.isVisible("text=Tablero"), "con la respuesta correcta, el login se completa y se ve el Tablero");

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
