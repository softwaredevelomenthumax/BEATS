#!/usr/bin/env node
// Octubre 2026 — ventanas de documentos con "_" (minimizar a la bandeja) y
// "X" (cerrar): la ventana minimizada sigue montada, la página de atrás
// queda utilizable, y la pastilla de la bandeja la restaura.
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { interceptarSupabase, resolverCaptchaLogin } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rutaBundle = resolve(raiz, "bundle.html");
const ahora = new Date().toISOString();
const fechaISO = (d) => { const f = new Date(); f.setDate(f.getDate() + d); return f.toISOString().slice(0, 10); };

function usuario(id, nombre, email, rol, extra = {}) {
  return {
    id, nombre, cargo: "Cargo de prueba", email, rol, iniciales: "XX", firma_id: null, debe_cambiar_password: false,
    auth_user_id: `auth-${id}`, telefono: "", paginas_permitidas: [], empresas_grupo: ["Bausch + Lomb"],
    paises_operacion: ["Colombia"], es_administrador: false, administrador_alcance_limitado: false, activo: true,
    estado_usuario: "Confirmado", ...extra,
  };
}

function caf(id, contraparte, codigo, estado) {
  return {
    id, estado, creado_por_id: "usr-admin", creado_en: ahora, evento_origen_id: "evt-comp",
    tipo_contrato: "Contrato de Patrocinio", solicitante_nombre: "Laura Gómez", solicitante_telefono: "3001234567",
    director_area_nombre: "Carlos Ruiz", director_area_cargo: "Director Comercial", contraparte_nombre: contraparte,
    contraparte_direccion: "Calle 100", due_diligence: "ok", termino_contrato_inicio: fechaISO(30), termino_contrato_fin: fechaISO(395),
    contraparte_telefono: "6011234567", contraparte_correo: "c@c.com", contraparte_contacto: "Dra. Ana", objeto_contrato: "Patrocinio.",
    comentarios: "", monto: 1000000, moneda: "COP", compania_nombre: "Bausch + Lomb", codigo_documento: codigo,
  };
}
const cadena = (id) => ["Dirección Médica", "Legal/Compliance", "Finanzas", "Gerencia General / Rep. Legal"].map((et, i) => ({
  id: `${id}-p${i + 1}`, caf_id: id, orden: i + 1, etiqueta: et, rol_requerido: ["medica", "legal_compliance", "finanzas", "gerencia_general"][i],
  estado: "pendiente", pendiente_desde: ahora,
}));

const fixtures = {
  usuariosAuth: [{ id: "auth-usr-admin", email: "admin.prueba@bausch.com", password: "clave-segura-123" }],
  tablas: {
    usuarios: [
      usuario("usr-admin", "Admin Prueba", "admin.prueba@bausch.com", "medica", { es_administrador: true, puede_eliminar_documentos_firmados: true }),
      usuario("usr-1", "María Fernanda Rodríguez Castellanos", "maria.fernanda.rodriguez.castellanos@bauschhealth.com", "gerencia_general", {
        es_administrador: true, empresas_grupo: ["Bausch + Lomb", "Bausch Health Colombia", "Bausch Health Perú"], paises_operacion: ["Colombia", "Perú", "Ecuador", "Chile"],
      }),
      usuario("usr-2", "Juan Sebastián Albarracín Villamizar", "juan.sebastian.albarracin.villamizar@bauschhealth.com", "legal_compliance", {
        empresas_grupo: ["Bausch + Lomb", "Bausch Health Colombia"], paises_operacion: ["Colombia", "Panamá", "Costa Rica"],
      }),
    ],
    catalogo_valores: [
      { id: "cat-1", catalogo: "tiposDocumento", valor: "Contrato de Patrocinio", orden: 1 },
      { id: "cat-3", catalogo: "monedas", valor: "COP", orden: 1 },
      { id: "cat-5", catalogo: "empresasGrupo", valor: "Bausch + Lomb", orden: 1 },
    ],
    solicitudes_evento: [{
      id: "evt-comp", estado: "Completado", creado_por_id: "usr-admin", creado_en: fechaISO(-60), nombre_evento: "Congreso Completado 2026",
      nombre_solicitante: "Admin Prueba", pais: "Colombia", ciudad: "Bogotá", fecha_inicio_evento: fechaISO(-30), fecha_fin_evento: fechaISO(-29),
      participacion_academica: false, empresa_grupo: "Bausch + Lomb",
    }],
    cafs: [caf("caf-borr", "Óptica Borrador S.A.S.", "CAF-BORR", "Borrador"), caf("caf-pend", "Clínica Pendiente S.A.S.", "CAF-PEND", "Pendiente")],
    caf_aprobaciones: [...cadena("caf-borr"), ...cadena("caf-pend")],
    campos_personalizados_definicion: [], etiquetas_campo: [], v_documentos: [], notificaciones: [], auditoria: [],
  },
};

let fallas = 0;
const afirmar = (c, m) => { if (c) console.log(`  OK  ${m}`); else { console.error(`  X   ${m}`); fallas++; } };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const erroresConsola = [];
page.on("pageerror", (e) => erroresConsola.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) erroresConsola.push(m.text()); });
await interceptarSupabase(page, fixtures);

console.log("1. Login");
await page.goto(pathToFileURL(rutaBundle).href);
await page.fill("#email", "admin.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Tablero", { timeout: 8000 });


const dialogo = page.locator('[role="dialog"]:visible');
console.log("2. Minimizar la ventana del CAF");
await page.click("text=Clínica Pendiente S.A.S.");
await page.waitForSelector("text=Cadena de aprobación", { timeout: 5000 });
afirmar(await page.locator('[data-testid="ventana-minimizar"]:visible').isVisible(), "la ventana tiene el botón '_' de minimizar");
afirmar(await page.locator('[data-testid="ventana-cerrar"]:visible').isVisible(), "la ventana tiene el botón 'X' de cerrar");
await page.locator('[data-testid="ventana-minimizar"]:visible').click();
await page.waitForTimeout(300);
afirmar((await dialogo.count()) === 0, "al minimizar, la ventana deja de verse");
afirmar(await page.getByTestId("bandeja-ventanas").isVisible(), "aparece la bandeja de ventanas minimizadas");
afirmar((await page.getByTestId("bandeja-ventanas").innerText()).includes("CAF-PEND"), "la pastilla lleva el título del documento");

console.log("3. La página de atrás sigue utilizable: abrir otra ventana");
await page.click("text=Congreso Completado 2026");
await page.waitForTimeout(500);
afirmar((await dialogo.count()) === 1, "se abre la ventana del evento mientras el CAF sigue minimizado");
await page.locator('[data-testid="ventana-minimizar"]:visible').click();
await page.waitForTimeout(300);
afirmar((await page.getByTestId("bandeja-ventanas").locator("button").count()) === 2, "la bandeja muestra 2 ventanas minimizadas");

console.log("4. Restaurar y cerrar");
await page.getByTestId("bandeja-ventanas").locator("button", { hasText: "CAF-PEND" }).click();
await page.waitForTimeout(300);
afirmar((await page.locator('[role="dialog"]:visible').innerText()).includes("Cadena de aprobación"), "al tocar la pastilla, el CAF vuelve con su contenido");
afirmar((await page.getByTestId("bandeja-ventanas").locator("button").count()) === 1, "la pastilla del CAF sale de la bandeja");
await page.locator('[data-testid="ventana-cerrar"]:visible').click();
await page.waitForTimeout(300);
afirmar((await dialogo.count()) === 0, "la 'X' cierra la ventana");
afirmar((await page.getByTestId("bandeja-ventanas").locator("button").count()) === 1, "la ventana minimizada del evento sigue en la bandeja");
await page.getByTestId("bandeja-ventanas").locator("button").first().click();
await page.waitForTimeout(300);
afirmar((await dialogo.count()) === 1, "el evento se restaura desde la bandeja");
await page.locator('[data-testid="ventana-cerrar"]:visible').click();
await page.waitForTimeout(300);
afirmar((await page.getByTestId("bandeja-ventanas").count()) === 0, "con todo cerrado, la bandeja desaparece");

await browser.close();
if (erroresConsola.length) { console.error("Errores de consola:", erroresConsola.slice(0, 5)); fallas++; }
if (fallas) { console.error(`\n${fallas} verificación(es) fallaron.`); process.exit(1); }
console.log("\nTodas las verificaciones pasaron.");
