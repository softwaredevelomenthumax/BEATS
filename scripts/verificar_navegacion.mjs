#!/usr/bin/env node
// Fase 8 — verifica la regla real de permisos de navegación de
// src/lib/navegacion.ts (paginaVisible), confirmada por comparación visual
// directa contra el bundle original con varios roles de prueba (ver
// scripts/comparacion_visual/probar_rol_medica.mjs): un item con
// `soloRoles` solo es visible si el rol del usuario está explícitamente en
// esa lista — "administrador" incluido. Antes de esta fase, un
// `es_administrador: true` bastaba para ver CUALQUIER item restringido sin
// importar su lista de roles (regla más laxa que la real) — el hallazgo
// concreto que esto atrapa: con un administrador de rol "marketing", el
// menú "CREAR DOCUMENTO" mostraba los 6 tipos de documento en vez de solo
// "Solicitud de Evento" (el único con "marketing" en su lista).
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { interceptarSupabase,
  resolverCaptchaLogin, } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rutaBundle = resolve(raiz, "bundle.html");

function crearFixtures(rol, esAdministrador) {
  return {
    usuariosAuth: [{ id: "auth-1", email: "prueba@bausch.com", password: "clave-segura-123" }],
    tablas: {
      usuarios: [
        {
          id: "usr-1",
          nombre: "Usuario Prueba",
          cargo: "Cargo de prueba",
          email: "prueba@bausch.com",
          rol,
          iniciales: "UP",
          firma_id: null,
          debe_cambiar_password: false,
          auth_user_id: "auth-1",
          telefono: "",
          paginas_permitidas: [],
          empresas_grupo: [],
          paises_operacion: [],
          es_administrador: esAdministrador,
          administrador_alcance_limitado: false,
        },
      ],
      v_documentos: [],
    },
  };
}

let fallas = 0;
function afirmar(condicion, mensaje) {
  if (condicion) {
    console.log(`  OK  ${mensaje}`);
  } else {
    console.error(`  X   ${mensaje}`);
    fallas++;
  }
}

async function login(page, fixtures) {
  await interceptarSupabase(page, fixtures);
  await page.goto(pathToFileURL(rutaBundle).href);
  await page.waitForSelector("#email", { timeout: 8000 });
  await page.fill("#email", "prueba@bausch.com");
  await page.fill("#password", "clave-segura-123");
  await resolverCaptchaLogin(page);
  await page.click('button[type="submit"]');
  await page.waitForSelector("text=Tablero de Documentos", { timeout: 8000 });
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

console.log("1. Administrador de rol 'marketing': en 'Crear documento' solo debe ver 'Solicitud de Evento'");
{
  const page = await browser.newPage();
  await login(page, crearFixtures("marketing", true));
  afirmar(await page.isVisible("text=Solicitud de Evento"), "ve 'Solicitud de Evento' (tiene 'marketing' en su lista)");
  // Texto EXACTO (comillas) para "Convenio HCP" y "CAF": ambos son también
  // substring literal de otras etiquetas SÍ visibles para este usuario
  // ("Configuración de la Plantilla Legal — Convenio HCP" tiene
  // 'administrador' explícito en su lista) — sin las comillas, el
  // matching por substring de `text=` los confundía con un falso positivo.
  for (const etiqueta of ["Convenio de Pago a HCP", "MD FMV Checklist", "CAF", "Convenio HCP", "Notificación de Pago a HCPs"]) {
    afirmar(
      !(await page.isVisible(`aside >> text="${etiqueta}"`).catch(() => false)),
      `NO ve '${etiqueta}' en el sidebar (solo tiene 'medica' en su lista, sin 'administrador' — ya no basta con ser administrador)`,
    );
  }
  await page.close();
}

console.log("2. Administrador de rol 'medica': en 'Crear documento' debe ver los 6 tipos (todos incluyen 'medica')");
{
  const page = await browser.newPage();
  await login(page, crearFixtures("medica", true));
  for (const etiqueta of [
    "Solicitud de Evento",
    "Convenio de Pago a HCP",
    "MD FMV Checklist",
    "CAF",
    "Convenio HCP",
    "Notificación de Pago a HCPs",
  ]) {
    afirmar(await page.isVisible(`aside >> text=${etiqueta}`), `ve '${etiqueta}'`);
  }
  await page.close();
}

console.log("3. Administrador de rol 'comercial': no ve 'Crear documento' en absoluto, pero sí ve la Configuración (tiene 'administrador' explícito en su lista)");
{
  const page = await browser.newPage();
  await login(page, crearFixtures("comercial", true));
  afirmar(!(await page.isVisible("text=CREAR DOCUMENTO").catch(() => false)), "no se ve la sección 'Crear documento' (ningún item la incluye)");
  afirmar(
    await page.isVisible("aside >> text=Configuración de Usuarios/Roles"),
    "sí ve 'Configuración de Usuarios/Roles' (su lista incluye 'administrador' explícitamente, y este usuario sí lo es)",
  );
  afirmar(
    await page.isVisible("aside >> text=Ejecución de Eventos"),
    "sí ve 'Ejecución de Eventos' (su lista incluye 'comercial' directamente, sin necesitar ser administrador)",
  );
  afirmar(
    !(await page.isVisible("aside >> text=Visor Documental").catch(() => false)),
    "NO ve 'Visor Documental' (su lista es solo ['legal_compliance'], sin 'administrador' — ni el rol ni ser administrador alcanzan)",
  );
  await page.close();
}

console.log("4. NO administrador de rol 'legal_compliance': ve exactamente lo que su rol permite, nada de 'administrador'");
{
  const page = await browser.newPage();
  await login(page, crearFixtures("legal_compliance", false));
  afirmar(await page.isVisible("aside >> text=Visor Documental"), "ve 'Visor Documental' (su rol está directamente en la lista)");
  afirmar(
    !(await page.isVisible("aside >> text=Configuración de Usuarios/Roles").catch(() => false)),
    "NO ve 'Configuración de Usuarios/Roles' (esa lista es ['medica','administrador'] — no incluye 'legal_compliance' y este usuario no es administrador)",
  );
  await page.close();
}

console.log("5. paginas_permitidas explícito manda sobre los defaults por rol (sin cambios en esta fase, se reconfirma)");
{
  const page = await browser.newPage();
  const fixtures = crearFixtures("comercial", true);
  fixtures.tablas.usuarios[0].paginas_permitidas = ["nueva-caf"];
  await login(page, fixtures);
  afirmar(await page.isVisible("aside >> text=CAF"), "con paginas_permitidas=['nueva-caf'], ve 'CAF' aunque su rol no lo permitiría por defecto");
  afirmar(
    !(await page.isVisible("aside >> text=Ejecución de Eventos").catch(() => false)),
    "y deja de ver 'Ejecución de Eventos' (paginas_permitidas es la autoridad completa, no se combina con los defaults por rol)",
  );
  await page.close();
}

await browser.close();

if (fallas > 0) {
  console.error(`\n${fallas} verificación(es) fallaron.`);
  process.exit(1);
}
console.log("\nTodas las verificaciones pasaron.");
