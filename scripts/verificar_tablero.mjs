#!/usr/bin/env node
// Fase 8 (hallazgo grande) — verifica el Tablero rediseñado: pastillas de
// filtro (tipo/estado) en vez de los Select + tiles de estado anteriores, y
// tarjetas con campo secundario/fecha/monto por tipo de documento en vez de
// una tabla plana. Crea un Evento y un CAF vía la UI (con fixtures locales,
// nunca contra Supabase real) y verifica que las pastillas filtren
// correctamente y que el contenido de cada tarjeta sea el esperado.
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { interceptarSupabase, resolverCaptchaLogin } from "./lib/fixtures.mjs";

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
        // "medica" es el único rol con los 6 tipos de documento en su
        // soloRoles (ver verificar_navegacion.mjs) — hace falta para poder
        // crear tanto el Evento como la CAF en este mismo script. Nota: los
        // botones "CAF" del sidebar (Crear documento) y de la nueva
        // pastilla de filtro del Tablero tienen el mismo texto exacto — con
        // este rol el botón del sidebar existe y es el primero en el DOM,
        // así que page.click (no estricto) sigue abriendo el formulario y
        // no la pastilla, igual que en el resto de la suite.
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
    catalogo_valores: [
      { id: "cat-1", catalogo: "empresasGrupo", valor: "Bausch + Lomb", orden: 1 },
      { id: "cat-3", catalogo: "tiposEvento", valor: "Congreso Médico", orden: 1 },
      { id: "cat-5", catalogo: "areasEspecialidadEvento", valor: "Oftalmología", orden: 1 },
      { id: "cat-12", catalogo: "monedas", valor: "COP", orden: 1 },
      { id: "cat-13", catalogo: "tiposDocumento", valor: "Contrato de Patrocinio", orden: 1 },
    ],
    // País ahora es siempre un desplegable (SelectPaisCiudad) — necesita el
    // catálogo `paises_region`. Sin `paises_region_ciudades`, Ciudad sigue
    // siendo texto libre, que es lo que este script ya espera (`.fill()`).
    paises_region: [{ id: "pr-1", pais: "Colombia" }],
    solicitudes_evento: [],
    evento_aprobaciones: [],
    sesiones_evento: [],
    evento_muestras_planeadas: [],
    eventos_codigos_acceso: [],
    cafs: [],
    caf_aprobaciones: [],
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
  if (msg.type() === "error" && !/Failed to load resource/.test(msg.text())) erroresConsola.push(msg.text());
});

await interceptarSupabase(page, fixtures);

console.log("1. Login y crear una Solicitud de Evento (única sesión, con Modalidad)");
await page.goto(pathToFileURL(rutaBundle).href);
await page.fill("#email", "admin.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Tablero de Documentos", { timeout: 8000 });

await page.click('button:has-text("Solicitud de Evento")');
await page.waitForSelector("text=Nueva Solicitud de Evento", { timeout: 5000 });
await page.getByLabel("Nombre del solicitante *").fill("Laura Gómez");
await page.getByLabel("Empresa del grupo *").click();
await page.getByRole("option", { name: "Bausch + Lomb" }).click();
await page.getByLabel("Tipo de evento *").click();
await page.getByRole("option", { name: "Congreso Médico" }).click();
await page.getByLabel("Área / especialidad *").click();
await page.getByRole("option", { name: "Oftalmología" }).click();
await page.getByLabel("Nombre del evento *").fill("Simposio del Tablero 2026");
await page.getByLabel("Fecha de inicio del evento *").fill("2026-11-10");
await page.getByLabel("Fecha de fin del evento *").fill("2026-11-11");
await page.locator("#evento-modalidad-evento").click();
await page.getByRole("option", { name: "Presencial" }).click();
await page.getByLabel("Dirección *").fill("Calle 100 # 10-20");
await page.getByLabel("País *").click();
await page.getByRole("option", { name: "Colombia" }).click();
await page.getByLabel("Ciudad *").fill("Bogotá");
await page.getByLabel("Objetivos del evento *").fill("Actualizar conocimientos en cirugía de catarata.");
await page.getByLabel("Moneda *").click();
await page.getByRole("option", { name: "COP", exact: true }).click();
await page.click('button:has-text("Enviar a aprobación")');
await page.waitForSelector("text=Simposio del Tablero 2026", { timeout: 5000 });
afirmar(await page.isVisible("text=Simposio del Tablero 2026"), "el evento aparece como tarjeta en el Tablero");

console.log("2. Crear una CAF (comparte el mismo Tablero)");
await page.click('button:has-text("CAF")');
await page.waitForSelector("text=Nueva CAF", { timeout: 5000 });
await page.getByLabel("Evento de origen").click();
await page.getByRole("option", { name: "Simposio del Tablero 2026" }).click();
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
await page.getByLabel("Código del documento *").fill("CAF-TABLERO-01");
await page.click('button:has-text("Enviar a aprobación")');
// Fase 8 (rediseño del contenido de las tarjetas por tipo de documento):
// la tarjeta de la CAF ya no muestra su código — como el evento de origen
// SÍ existe en este fixture (fue creado por la UI en el paso anterior,
// con `solicitudes_evento` como tabla real), el título cae al nombre de
// la contraparte (la CAF no tiene speaker propio ni el evento resolvió
// uno, ver `tarjetaDeCaf` en Tablero.tsx).
await page.waitForSelector("text=Clínica Oftalmológica S.A.S.", { timeout: 5000 });
afirmar(await page.isVisible("text=Clínica Oftalmológica S.A.S."), "la CAF aparece como tarjeta en el Tablero (título = nombre de la contraparte)");

console.log("3. Las tarjetas muestran el campo secundario, la fecha y el monto correctos por tipo (spec del usuario)");
// Con un solo documento de cada tipo en este fixture, alcanza con
// comprobar visibilidad sobre toda la página (sin ambigüedad posible).
afirmar(await page.isVisible("text=Modalidad:"), "la tarjeta del Evento muestra 'Modalidad:' como campo secundario");
afirmar(await page.isVisible("text=Presencial"), "la tarjeta del Evento muestra el valor de Modalidad (Presencial)");
afirmar(await page.getByText("nov", { exact: false }).first().isVisible(), "la tarjeta del Evento muestra la fecha (rango de noviembre)");
afirmar(await page.isVisible("text=Actividad:"), "la tarjeta de la CAF muestra 'Actividad:' como campo secundario (resuelto desde el evento de origen)");
afirmar(
  (await page.getByText("Congreso Médico", { exact: false }).count()) >= 2,
  "'Congreso Médico' aparece dos veces: en el título del Evento y en la fila 'Actividad:' de la CAF (resuelta desde el evento de origen)",
);
afirmar((await page.getByText("Monto:").count()) === 2, "ambas tarjetas (Evento y CAF) muestran la fila 'Monto:'");
afirmar((await page.getByText("COP", { exact: false }).count()) >= 2, "el monto de ambas tarjetas incluye la moneda (COP)");

console.log("4. El creador (avatar + nombre) se ve en ambas tarjetas");
// El creador real de ambos documentos es el usuario logueado (Admin
// Prueba) — "Laura Gómez" es solo el valor de un campo de texto libre
// dentro de cada formulario, no el creador.
afirmar((await page.getByText("Admin Prueba").count()) >= 2, "el nombre del creador aparece en ambas tarjetas");
afirmar((await page.getByText("AP", { exact: true }).count()) >= 2, "las iniciales del creador aparecen en el avatar de ambas tarjetas");

const filtrosTipo = page.locator('[data-testid="tablero-filtro-tipo"]');
const filtrosEstado = page.locator('[data-testid="tablero-filtro-estado"]');

console.log("5. La pastilla de tipo filtra correctamente");
// Ojo: el botón "CAF" del sidebar (Crear documento) tiene el mismo texto
// exacto que la pastilla de filtro — hay que acotar el click al contenedor
// de las pastillas para no reabrir el formulario de creación por error.
await filtrosTipo.getByRole("button", { name: "CAF", exact: true }).click();
await page.waitForTimeout(150);
afirmar(await page.isVisible("text=Clínica Oftalmológica S.A.S."), "con el filtro 'CAF' activo, la tarjeta de la CAF sigue visible");
afirmar(!(await page.isVisible("text=Simposio del Tablero 2026")), "con el filtro 'CAF' activo, la tarjeta del Evento se oculta");

await filtrosTipo.getByRole("button", { name: "Solicitud de Evento", exact: true }).click();
await page.waitForTimeout(150);
afirmar(await page.isVisible("text=Simposio del Tablero 2026"), "con el filtro 'Solicitud de Evento' activo, la tarjeta del Evento se ve");
afirmar(!(await page.isVisible("text=Clínica Oftalmológica S.A.S.")), "con el filtro 'Solicitud de Evento' activo, la tarjeta de la CAF se oculta");

await filtrosTipo.getByRole("button", { name: "Todos los documentos", exact: true }).click();
await page.waitForTimeout(150);
afirmar(
  (await page.isVisible("text=Simposio del Tablero 2026")) && (await page.isVisible("text=Clínica Oftalmológica S.A.S.")),
  "'Todos los documentos' vuelve a mostrar ambas tarjetas",
);

console.log("6. La pastilla de estado filtra correctamente (ambos documentos quedan Pendiente al enviarse)");
await filtrosEstado.getByRole("button", { name: "Pendiente", exact: true }).click();
await page.waitForTimeout(150);
afirmar(
  (await page.isVisible("text=Simposio del Tablero 2026")) && (await page.isVisible("text=Clínica Oftalmológica S.A.S.")),
  "con el filtro de estado 'Pendiente' activo, ambos documentos (Pendientes) se ven",
);
await filtrosEstado.getByRole("button", { name: "Aprobado", exact: true }).click();
await page.waitForTimeout(150);
afirmar(
  await page.isVisible("text=No hay documentos que coincidan con los filtros."),
  "con el filtro de estado 'Aprobado' activo, no hay documentos que coincidan (ninguno está Aprobado todavía)",
);
await filtrosEstado.getByRole("button", { name: "Todos", exact: true }).click();
await page.waitForTimeout(150);

console.log("7. Abrir la tarjeta de la CAF desde el Tablero funciona igual que antes");
await page.click("text=Clínica Oftalmológica S.A.S.");
await page.waitForSelector("text=Cadena de aprobación", { timeout: 5000 });
afirmar(await page.isVisible("text=Cadena de aprobación"), "hacer clic en la tarjeta abre el detalle de la CAF");
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

afirmar(erroresConsola.length === 0, `sin errores de consola/página (encontrados: ${erroresConsola.length})`);
if (erroresConsola.length > 0) console.error(erroresConsola.join("\n"));

await browser.close();

if (fallas > 0) {
  console.error(`\n${fallas} verificación(es) fallaron.`);
  process.exit(1);
}
console.log("\nTodas las verificaciones pasaron.");
