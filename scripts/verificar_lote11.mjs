#!/usr/bin/env node
// Lote 11 — confirmación al eliminar, "_"/"X" en Nuevo Speaker y Nuevo Usuario, días pendientes desde el envío.
// (base: ventanas de documentos con "_" (minimizar a la bandeja) y
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
    cafs: [caf("caf-borr", "Óptica Borrador S.A.S.", "CAF-BORR", "Borrador"), { ...caf("caf-pend", "Clínica Pendiente S.A.S.", "CAF-PEND", "Pendiente"), creado_en: new Date(Date.now() - 30 * 864e5).toISOString(), enviado_a_firma_en: new Date(Date.now() - 5 * 864e5).toISOString() }],
    caf_aprobaciones: [...cadena("caf-borr"), ...cadena("caf-pend")],
    speakers: [{ id: "spk-1", nombre_completo: "Dr. Iván Restrepo", especialidad: "Oftalmología", activo: true, estado: "Confirmado", empresas_grupo_interaccion: ["Bausch + Lomb"], numero_documento: "123" }],
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
const solicitudesDelete = [];
page.on("request", (r) => { if (r.method() === "DELETE") solicitudesDelete.push(r.url()); });
await interceptarSupabase(page, fixtures);

console.log("1. Login");
await page.goto(pathToFileURL(rutaBundle).href);
await page.fill("#email", "admin.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Tablero", { timeout: 8000 });



const dialogo = page.locator('[role="dialog"]:visible');
const bandeja = page.getByTestId("bandeja-ventanas");

console.log("2. Eliminar speaker pide confirmación");
await page.locator('nav').getByText('HCPs/Speakers', { exact: true }).click();
await page.waitForSelector("text=Dr. Iván Restrepo");
const papelera = page.locator("button:has(svg.lucide-trash-2), button:has(svg.lucide-trash2)").first();
await papelera.click();
await page.waitForTimeout(300);
afirmar(await page.getByTestId("confirmar-eliminacion").isVisible(), "aparece el diálogo de confirmación");
afirmar((await page.getByTestId("confirmar-eliminacion").innerText()).includes("Dr. Iván Restrepo"), "el mensaje nombra al speaker");
await page.getByTestId("confirmar-cancelar").click();
await page.waitForTimeout(300);
afirmar(await page.getByText("Dr. Iván Restrepo").first().isVisible(), "al cancelar, el speaker sigue ahí");
afirmar(!(solicitudesDelete.some((u) => /speakers/.test(u))), "al cancelar NO se llamó al DELETE");
await papelera.click();
await page.getByTestId("confirmar-aceptar").click();
await page.waitForTimeout(500);
afirmar(solicitudesDelete.some((u) => /speakers/.test(u)), "al confirmar sí se envía el DELETE");

console.log("3. Nuevo Speaker: _ / X y retención al navegar");
await page.getByRole("button", { name: /Nuevo Speaker/ }).click();
await page.waitForTimeout(300);
afirmar(await page.locator('[data-testid="ventana-minimizar"]:visible').isVisible(), "Nuevo Speaker tiene '_'");
afirmar(await page.locator('[data-testid="ventana-cerrar"]:visible').isVisible(), "Nuevo Speaker tiene 'X'");
afirmar((await page.locator('[role="dialog"]:visible').getByText("Arrastra el archivo aquí o haz clic para adjuntarlo").count()) >= 2, "los adjuntos del speaker usan la zona de arrastrar/clic");
afirmar(await page.locator('[role="dialog"]:visible').getByText("Arrastra la imagen aquí o haz clic para adjuntarla").isVisible(), "la foto también admite arrastrar");
await page.locator('[role="dialog"]:visible input:not([type="file"])').first().fill("Dra. Escribiendo Algo");
await page.locator('[data-testid="ventana-minimizar"]:visible').click();
await page.waitForTimeout(300);
afirmar((await dialogo.count()) === 0, "minimizado deja de verse");
afirmar((await bandeja.innerText()).includes("Nuevo Speaker"), "la pastilla dice Nuevo Speaker");
await page.click('nav >> text=Tareas Pendientes');
await page.waitForTimeout(400);
afirmar((await bandeja.innerText()).includes("Nuevo Speaker"), "tras cambiar de página, la pastilla sigue");

console.log("4. Días pendientes cuentan desde el envío");
await page.waitForSelector("text=Aprobaciones pendientes de tu firma");
const textoTareas = await page.locator("main").innerText();
afirmar(/Tarea recibida/.test(textoTareas) && /Elaborado/.test(textoTareas), "se muestran Elaborado y Tarea recibida");
console.log("   >>", (textoTareas.match(/Pendiente[^\n]*/g) || []).join(" | "));
afirmar(/5\s*d/i.test(textoTareas) && !/30\s*d/i.test(textoTareas), "cuenta 5 días (desde el envío), no 30 (desde la creación)");

console.log("5. Restaurar desde otra página navega de vuelta con lo escrito");
await bandeja.locator("button", { hasText: "Nuevo Speaker" }).click();
await page.waitForTimeout(500);
afirmar((await dialogo.count()) === 1, "el diálogo vuelve");
afirmar((await page.locator('[role="dialog"]:visible input:not([type="file"])').first().inputValue()) === "DRA. ESCRIBIENDO ALGO", "conserva lo escrito");
page.once("dialog", (d) => d.accept());
await page.locator('[data-testid="ventana-cerrar"]:visible').click();
await page.waitForTimeout(300);
afirmar((await dialogo.count()) === 0 && (await bandeja.count()) === 0, "'X' (con confirmación) cierra y limpia la bandeja");

console.log("6. Nuevo Usuario: _ / X");
await page.click('nav >> text=Configuración de Usuarios/Roles');
await page.getByRole("button", { name: /Nuevo Usuario/ }).click();
await page.waitForTimeout(300);
afirmar(await page.locator('[data-testid="ventana-minimizar"]:visible').isVisible() && await page.locator('[data-testid="ventana-cerrar"]:visible').isVisible(), "Nuevo Usuario tiene '_' y 'X'");
await page.locator("#nvo-email").fill("x@y.com");
await page.locator('[data-testid="ventana-minimizar"]:visible').click();
await page.click('nav >> text=Tablero');
await page.waitForTimeout(300);
await bandeja.locator("button", { hasText: "Nuevo Usuario" }).click();
await page.waitForTimeout(500);
afirmar((await page.locator("#nvo-email").inputValue()) === "x@y.com", "Nuevo Usuario conserva lo escrito tras navegar");

await browser.close();
if (erroresConsola.length) { console.error("Errores de consola:", erroresConsola.slice(0, 5)); fallas++; }
if (fallas) { console.error(`\n${fallas} verificación(es) fallaron.`); process.exit(1); }
console.log("\nTodas las verificaciones pasaron.");
