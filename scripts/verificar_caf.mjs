#!/usr/bin/env node
// Fase 1 — verifica el ciclo completo de un CAF (crear, enviar, aprobar las
// 4 etapas de la cadena hasta quedar Aprobado) y el panel de Configuración
// de Campos (crear un campo personalizado). Todo contra fixtures locales.
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { interceptarSupabase, crearHandlerResolverAprobacion,
  resolverCaptchaLogin, } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rutaBundle = resolve(raiz, "bundle.html");

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
    v_documentos: [
      {
        id: "evt-1",
        tipo_doc: "evento",
        estado: "Aprobado",
        creado_por_id: "usr-admin",
        creado_en: new Date().toISOString(),
        nombre: "Simposio de Retina 2026",
      },
    ],
    catalogo_valores: [
      { id: "cat-1", catalogo: "tiposDocumento", valor: "Contrato de Patrocinio", orden: 1 },
      { id: "cat-2", catalogo: "tiposDocumento", valor: "Contrato de Prestación de Servicios", orden: 2 },
      { id: "cat-3", catalogo: "monedas", valor: "COP", orden: 1 },
      { id: "cat-4", catalogo: "monedas", valor: "USD", orden: 2 },
      { id: "cat-5", catalogo: "empresasGrupo", valor: "Bausch + Lomb", orden: 1 },
      { id: "cat-6", catalogo: "empresasGrupo", valor: "Bausch Health", orden: 2 },
    ],
    cafs: [],
    caf_aprobaciones: [],
    campos_personalizados_definicion: [],
    etiquetas_campo: [],
  },
  rpc: {
    resolver_aprobacion_caf: crearHandlerResolverAprobacion("cafs", "caf_aprobaciones", "caf"),
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
// "Failed to load resource" incluye la hoja de Google Fonts que los 3
// bundles cargan desde <link> (Lato/Roboto/Public Sans/JetBrains Mono,
// recuperadas del bundle original) — en un entorno de pruebas sin salida a
// internet esa petición falla siempre; no es un defecto de la app (la
// tipografía cae a los fallbacks del stack `--font-*` en index.css), así
// que se filtra antes de exigir consola limpia.
page.on("console", (msg) => {
  if (msg.type() === "error" && !/Failed to load resource/.test(msg.text())) erroresConsola.push(msg.text());
});

await interceptarSupabase(page, fixtures);

console.log("1. Login e ir a Nueva CAF");
await page.goto(pathToFileURL(rutaBundle).href);
await page.fill("#email", "admin.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Tablero", { timeout: 5000 });
await page.click('button:has-text("CAF")');
await page.waitForSelector("text=Nuevo CAF", { timeout: 5000 });
afirmar(await page.isVisible("text=Nuevo CAF"), "se abre el formulario de Nuevo CAF");

console.log("2. Completar y enviar el formulario");
await page.getByLabel("Evento de origen").click();
await page.getByRole("option", { name: "Simposio de Retina 2026" }).click();
// Entrega 16: tras elegir el evento se pregunta dónde se elabora el CAF.
await page.getByTestId("caf-modalidad-beats").click();
await page.getByLabel("Nombre del solicitante *").fill("Laura Gómez");
await page.getByLabel("Teléfono del solicitante *").fill("3001234567");
await page.getByLabel("Nombre del director de área *").fill("Carlos Ruiz");
await page.getByLabel("Cargo del director de área *").fill("Director Comercial");
await page.getByLabel("Nombre de la contraparte *").fill("Clínica Oftalmológica S.A.S.");
await page.getByLabel("Dirección de la contraparte *").fill("Calle 100 # 10-20, Bogotá");
await page.getByLabel("Teléfono de la contraparte *").fill("6011234567");
await page.getByLabel("Correo de la contraparte *").fill("contacto@clinica.com");
await page.getByLabel("Contacto de la contraparte *").fill("Dra. Ana Torres");
await page.getByLabel("Tipo de contrato").click();
await page.getByRole("option", { name: "Contrato de Patrocinio" }).click();
await page.getByLabel("Objeto del contrato *").fill("Patrocinio de simposio médico.");
await page.getByLabel("Due diligence *").fill("Verificado sin hallazgos.");
await page.getByLabel("Monto *").fill("5000000");
await page.getByLabel("Moneda").click();
await page.getByRole("option", { name: "COP", exact: true }).click();
await page.getByLabel("Compañía").click();
await page.getByRole("option", { name: "Bausch + Lomb" }).click();
await page.getByLabel("Código del documento *").fill("CAF-2026-001");

await page.click('button:has-text("Enviar a aprobación")');
// Fase 8 (rediseño del Tablero): la tarjeta ya no muestra el código del
// documento — con el evento de origen sin datos de speaker en este
// fixture, el título cae al nombre de la contraparte (campo propio del
// CAF), que es el identificador único disponible aquí.
await page.waitForSelector("text=Clínica Oftalmológica S.A.S.", { timeout: 5000 });
afirmar(await page.isVisible("text=Clínica Oftalmológica S.A.S."), "el CAF aparece en el Tablero tras enviarlo");
afirmar(await page.isVisible("text=Pendiente"), "el CAF queda en estado Pendiente");

console.log("3. Aprobar las 4 etapas de la cadena");
await page.click("text=Clínica Oftalmológica S.A.S.");
await page.waitForSelector("text=Cadena de aprobación", { timeout: 5000 });
for (const etapa of ["Dirección Médica", "Legal/Compliance", "Finanzas", "Gerencia General"]) {
  afirmar(await page.isVisible(`text=${etapa}`), `se ve la etapa: ${etapa}`);
  await page.getByPlaceholder("Comentario (obligatorio para rechazar)").fill(`Aprobado — ${etapa}`);
  await page.click('button:has-text("Aprobar")');
  await page.waitForTimeout(300);
}
const quedoAprobado = await page
  .waitForSelector('[role="dialog"] >> text=Aprobado', { timeout: 3000 })
  .then(() => true)
  .catch(() => false);
afirmar(quedoAprobado, "el CAF queda Aprobado tras la última etapa");

console.log("4. Configuración de Campos: crear un campo personalizado");
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
await page.click('button:has-text("Configuración de Campos")');
await page.waitForSelector("text=Campos Personalizados", { timeout: 5000 });
await page.click('button:has-text("Nuevo campo")');
await page.getByLabel("Clave (identificador interno)").fill("numeroContratoInterno");
await page.getByLabel("Etiqueta visible").fill("Número de contrato interno");
await page.click('div[role="dialog"] button:has-text("Guardar")');
await page.waitForTimeout(300);
afirmar(await page.isVisible("text=Número de contrato interno"), "el campo personalizado creado aparece en la lista");

afirmar(erroresConsola.length === 0, `sin errores de consola/página (encontrados: ${erroresConsola.length})`);
if (erroresConsola.length > 0) console.error(erroresConsola.join("\n"));

await browser.close();

if (fallas > 0) {
  console.error(`\n${fallas} verificación(es) fallaron.`);
  process.exit(1);
}
console.log("\nTodas las verificaciones pasaron.");
