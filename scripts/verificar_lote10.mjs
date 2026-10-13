#!/usr/bin/env node
// Octubre 2026 (décimo lote) — verifica: ojo de contraseña, ventanas de
// documento y páginas "Nuevo …" que sobreviven al cambio de página (fase 2),
// eliminación del log de auditoría por rango, lista de países de operación y
// el nuevo orden del formulario de Solicitud de Evento.
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
    campos_personalizados_definicion: [], etiquetas_campo: [], v_documentos: [], notificaciones: [],
    auditoria: [
      { id: "au-1", documento_id: "x", tipo_doc: "caf", documento_nombre: "A", actor_id: "usr-admin", accion: "creacion", detalle: "", ocurrido_en: "2026-01-10T10:00:00.000Z" },
      { id: "au-2", documento_id: "x", tipo_doc: "caf", documento_nombre: "B", actor_id: "usr-admin", accion: "creacion", detalle: "", ocurrido_en: "2026-01-15T10:00:00.000Z" },
      { id: "au-3", documento_id: "x", tipo_doc: "caf", documento_nombre: "C", actor_id: "usr-admin", accion: "creacion", detalle: "", ocurrido_en: "2026-03-01T10:00:00.000Z" },
    ],
  },
};

let fallas = 0;
const afirmar = (c, m) => { if (c) console.log(`  OK  ${m}`); else { console.error(`  X   ${m}`); fallas++; } };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const erroresConsola = [];
page.on("pageerror", (e) => erroresConsola.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) erroresConsola.push(m.text()); });
page.on("dialog", (d) => d.accept());
await interceptarSupabase(page, fixtures);


console.log("1. Login con ojo de contraseña");
await page.goto(pathToFileURL(rutaBundle).href);
await page.fill("#email", "admin.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
afirmar((await page.getAttribute("#password", "type")) === "password", "la contraseña empieza oculta");
await page.getByTestId("ver-password").click();
afirmar((await page.getAttribute("#password", "type")) === "text", "al pulsar el ojo se ve la contraseña");
await page.waitForTimeout(3600);
afirmar((await page.getAttribute("#password", "type")) === "password", "se vuelve a ocultar sola");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Tablero", { timeout: 8000 });

const dialogo = page.locator('[role="dialog"]:visible');
const chips = page.getByTestId("bandeja-ventanas").locator("button");

console.log("2. Ventana de documento minimizada sobrevive al cambio de página");
await page.click("text=Clínica Pendiente S.A.S.");
await page.waitForSelector("text=Cadena de aprobación", { timeout: 5000 });
await page.locator('[data-testid="ventana-minimizar"]:visible').click();
await page.click('nav >> text=Gestión Avanzada de Documentos');
await page.waitForSelector("text=Eliminar registros de auditoría", { timeout: 5000 });
afirmar((await chips.count()) === 1, "la pastilla sigue en la bandeja tras cambiar de página");
await chips.first().click();
await page.waitForTimeout(300);
afirmar((await dialogo.count()) === 1 && (await dialogo.innerText()).includes("CAF-PEND"), "se restaura el CAF estando en otra página");
await page.locator('[data-testid="ventana-cerrar"]:visible').click();
await page.waitForTimeout(300);

console.log("3. Dos ventanas del mismo tipo a la vez");
await page.click('nav >> text=Tablero');
await page.waitForSelector("text=Clínica Pendiente S.A.S.", { timeout: 5000 });
await page.click("text=Clínica Pendiente S.A.S.");
await page.waitForSelector("text=Cadena de aprobación", { timeout: 5000 });
await page.locator('[data-testid="ventana-minimizar"]:visible').click();
await page.click("text=Óptica Borrador S.A.S.");
await page.waitForTimeout(500);
afirmar((await dialogo.count()) === 1, "se abre un segundo CAF mientras el primero está minimizado");
await page.locator('[data-testid="ventana-minimizar"]:visible').click();
afirmar((await chips.count()) === 2, "la bandeja muestra los 2 CAF minimizados");
await chips.nth(0).click();
await page.locator('[data-testid="ventana-cerrar"]:visible').click();
await page.waitForTimeout(300);
await chips.nth(0).click();
await page.locator('[data-testid="ventana-cerrar"]:visible').click();
await page.waitForTimeout(300);
afirmar((await page.getByTestId("bandeja-ventanas").count()) === 0, "al cerrar ambas, la bandeja desaparece");

console.log("4. Páginas 'Nuevo …': minimizar conserva lo diligenciado");
await page.click('button:has-text("Solicitud de Evento")');
await page.waitForSelector("text=Nueva Solicitud de Evento", { timeout: 5000 });
afirmar(await page.getByTestId("pagina-minimizar").isVisible() && await page.getByTestId("pagina-cerrar").isVisible(), "la página 'Nuevo' tiene «_» y «X»");
await page.getByLabel("Nombre del evento *").fill("Evento en borrador de prueba");
await page.getByTestId("pagina-minimizar").click();
await page.waitForSelector("text=Clínica Pendiente S.A.S.", { timeout: 5000 }).catch(() => {});
afirmar((await chips.count()) === 1, "la página minimizada aparece en la bandeja");
await page.click('nav >> text=Configuración de Usuarios/Roles');
await page.waitForSelector("text=Nuevo Usuario", { timeout: 5000 });
afirmar((await chips.count()) === 1, "y sigue ahí tras cambiar de página");
await chips.first().click();
await page.waitForSelector("text=Nueva Solicitud de Evento", { timeout: 5000 });
afirmar((await page.getByLabel("Nombre del evento *").inputValue()) === "EVENTO EN BORRADOR DE PRUEBA", "al restaurarla conserva lo escrito");

console.log("5. Nuevo orden de secciones del formulario de evento");
const orden = await page.evaluate(() => {
  const titulos = ["Solicitante y evento", "Participación, presupuesto aprobado y anexos", "Patrocinio / pago de viáticos a HCP", "Participación académica", "Fechas, modalidad y lugar", "Muestras médicas", "Artículos promocionales", "Transporte, hospedaje y alimentos", "Presupuesto condensado", "Comentarios especiales"];
  const txt = document.body.innerText.toLowerCase();
  return titulos.map((t) => [t, txt.indexOf(t.toLowerCase())]);
});
const posiciones = orden.map((o) => o[1]);
afirmar(posiciones.every((p) => p >= 0) && posiciones.every((p, i) => i === 0 || p > posiciones[i - 1]), `las secciones están en el orden pedido (${JSON.stringify(orden.map((o) => o[1]))})`);
const txtForm = await page.evaluate(() => document.body.innerText);
afirmar(txtForm.indexOf("Centro de costos *") > txtForm.indexOf("Participación, presupuesto aprobado y anexos") && txtForm.indexOf("Centro de costos *") < txtForm.indexOf("¿El evento está incluido en algún presupuesto aprobado?"), "«Centro de costos *» está en esa sección, antes de «¿El evento está incluido…?»");
afirmar((await page.getByText("¿Habrá patrocinio / pago de viáticos a un HCP?").count()) === 0, "ya no existe el campo suelto «¿Habrá patrocinio…?»");
afirmar((await page.getByLabel("Nombre completo del HCP relacionado *").count()) === 0, "con patrocinio en «No» no se despliegan los datos del HCP");
await page.locator('xpath=//*[normalize-space(text())="Patrocinio / pago de viáticos a HCP"]/ancestor::*[self::h3 or self::div][1]//button[normalize-space()="Sí"]').first().click();
await page.waitForTimeout(300);
afirmar(await page.getByLabel("Nombre completo del HCP relacionado *").isVisible() && await page.getByLabel("Justificación de patrocinio / pago de viáticos *").isVisible(), "con «Sí» se despliegan los datos del HCP y la justificación");
await page.getByTestId("pagina-cerrar").click().catch(() => {});

console.log("6. Países de operación");
await page.click('nav >> text=Configuración de Usuarios/Roles');
await page.waitForSelector("text=Nuevo Usuario", { timeout: 5000 });
await page.locator('button[title="Editar"]').first().click();
await page.waitForSelector("text=Editar usuario", { timeout: 5000 });
const paises = await page.evaluate(() => {
  const l = [...document.querySelectorAll("label")].find((x) => x.textContent?.startsWith("País(es) de operación"));
  const cont = l?.parentElement?.querySelector("div");
  return cont ? [...cont.querySelectorAll("label")].map((x) => x.textContent?.trim()) : [];
});
const esperados = ["Canadá","Estados Unidos","México","Belice","Costa Rica","El Salvador","Guatemala","Honduras","Nicaragua","Panamá","Antigua y Barbuda","Bahamas","Barbados","Cuba","Dominica","Granada","Haití","Jamaica","República Dominicana","San Cristóbal y Nieves","San Vicente y las Granadinas","Santa Lucía","Trinidad y Tobago","Argentina","Bolivia","Brasil","Chile","Colombia","Ecuador","Guyana","Paraguay","Perú","Surinam","Uruguay","Venezuela","Puerto Rico"];
afirmar(paises.length === 36 && esperados.every((p) => paises.includes(p)), `el selector muestra exactamente los 36 países pedidos (vio ${paises.length})`);
afirmar(JSON.stringify(paises) === JSON.stringify([...paises].sort((a, b) => a.localeCompare(b, "es"))), "están en orden alfabético");
await page.locator('[role="dialog"] button:has-text("Cancelar")').first().click();
await page.waitForTimeout(400);

console.log("7. Eliminar log de auditoría por rango");
await page.click('nav >> text=Gestión Avanzada de Documentos');
await page.waitForSelector("text=Eliminar registros de auditoría", { timeout: 5000 });
afirmar(await page.isVisible("h1:text-is('Gestión Avanzada de Documentos')"), "el título usa mayúscula inicial en cada palabra");
await page.fill("#auditoria-desde", "2026-01-01T00:00");
await page.fill("#auditoria-hasta", "2026-01-31T23:59");
await page.click('button:has-text("Contar registros del rango")');
await page.waitForTimeout(400);
afirmar((await page.getByTestId("auditoria-cantidad").innerText()).startsWith("2 "), "cuenta 2 registros en el rango");
await page.click('button:has-text("Eliminar registros del rango")');
await page.waitForSelector("text=Confirmar eliminación del log de auditoría");
await page.fill("#password-confirmacion-auditoria", "contraseña-equivocada");
await page.click('button:has-text("Confirmar eliminación")');
await page.waitForTimeout(500);
afirmar(fixtures.tablas.auditoria.length === 3, "con contraseña incorrecta no se elimina nada");
await page.fill("#password-confirmacion-auditoria", "clave-segura-123");
await page.click('button:has-text("Confirmar eliminación")');
await page.waitForTimeout(600);
afirmar(fixtures.tablas.auditoria.length === 1 && fixtures.tablas.auditoria[0].id === "au-3", "con la contraseña correcta se eliminan solo los 2 del rango (queda 1)");
afirmar(!fixtures.tablas.auditoria.some((a) => a.accion === "eliminacion"), "no se dejó rastro de la eliminación en la auditoría");

console.log(erroresConsola.length ? `Errores de consola: ${erroresConsola.join(" | ")}` : "Sin errores de consola.");
afirmar(erroresConsola.length === 0, "sin errores de JavaScript en consola");
await browser.close();
if (fallas) { console.error(`\n${fallas} verificación(es) fallaron.`); process.exit(1); }
console.log("\nTodas las verificaciones pasaron.");
