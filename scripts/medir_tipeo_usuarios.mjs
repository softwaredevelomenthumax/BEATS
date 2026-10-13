#!/usr/bin/env node
// Verificación puntual del bug de rendimiento reportado: escribir en el
// diálogo "Nuevo colaborador" (Usuarios y Roles) se sentía "carácter por
// carácter, con espera". Causa real: `CamposPerfil` estaba definido DENTRO
// del cuerpo de `UsuariosRoles()`, así que React lo desmontaba y volvía a
// montar por completo en cada tecla. Este script escribe una cadena larga
// en el campo "Nombre" del formulario y confirma que el campo mantiene el
// foco de principio a fin (si el bug estuviera presente, el campo perdería
// el foco en cada tecla y el valor final NO coincidiría con lo escrito).
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { interceptarSupabase,
  resolverCaptchaLogin, } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rutaBundle = resolve(raiz, "bundle.html");

const fixtures = {
  usuariosAuth: [{ id: "auth-admin", email: "admin.prueba@bausch.com", password: "clave-segura-123" }],
  tablas: {
    usuarios: [
      {
        id: "usr-admin", nombre: "Admin Prueba", cargo: "Dirección Médica", email: "admin.prueba@bausch.com",
        rol: "medica", iniciales: "AP", firma_id: null, debe_cambiar_password: false, auth_user_id: "auth-admin",
        telefono: "", paginas_permitidas: [], empresas_grupo: ["Bausch + Lomb"], paises_operacion: ["Colombia"],
        es_administrador: true, administrador_alcance_limitado: false,
      },
    ],
    v_documentos: [],
    catalogo_valores: [{ id: "cat-5", catalogo: "empresasGrupo", valor: "Bausch + Lomb", orden: 1 }],
    solicitudes_restablecimiento_password: [],
  },
};

let fallas = 0;
function afirmar(condicion, mensaje) {
  if (condicion) console.log(`  OK  ${mensaje}`);
  else { console.error(`  X   ${mensaje}`); fallas++; }
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
await interceptarSupabase(page, fixtures);

await page.goto(pathToFileURL(rutaBundle).href);
await page.fill("#email", "admin.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Tablero", { timeout: 5000 });
await page.click('button:has-text("Roles")');
await page.waitForSelector("text=Usuarios y Roles", { timeout: 5000 });
await page.click('button:has-text("Nuevo colaborador")');
await page.waitForSelector("#usr-nombre", { timeout: 5000 });

const campo = page.locator("#usr-nombre");
await campo.click();
const cadena = "Laura Gomez de la Torre";
const inicio = Date.now();
for (const ch of cadena) {
  await page.keyboard.press(ch === " " ? "Space" : ch);
}
const duracion = Date.now() - inicio;
const enFoco = await campo.evaluate((el) => el === document.activeElement);
const valorFinal = await campo.inputValue();

afirmar(valorFinal === cadena, `el campo Nombre contiene exactamente lo escrito ("${valorFinal}")`);
afirmar(enFoco, "el campo Nombre conserva el foco después de escribir (antes del fix, el remount lo perdía)");
afirmar(duracion < 2000, `escribir ${cadena.length} caracteres tomó ${duracion} ms (razonable, sin remounts)`);
console.log(`  Tiempo total: ${duracion} ms (${(duracion / cadena.length).toFixed(1)} ms/tecla)`);

await browser.close();
if (fallas > 0) {
  console.error(`\n${fallas} verificación(es) fallaron.`);
  process.exit(1);
}
console.log("\nTodas las verificaciones pasaron.");
