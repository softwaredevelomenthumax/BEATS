#!/usr/bin/env node
// Octubre 2026 — verifica la tanda de correcciones de eliminar/anular y de
// "Gestión avanzada de documentos" (antes "Eliminar Documentos Firmados"):
//   1. Un Borrador propio se elimina (y "Anular" NO se ofrece en Borrador).
//   2. Un documento Pendiente/Completado se anula (funciones del servidor).
//   3. "Gestión avanzada de documentos": nuevo nombre, "Ver documento" (en
//      cada fila y dentro de la confirmación) y eliminación con contraseña.
//   4. Usuarios y Roles: textos nuevos del permiso, rol "Gerencia General /
//      Rep. Legal" y tabla sin barra de desplazamiento horizontal.
// Todo contra fixtures locales (las 3 RPC se simulan en `lib/fixtures.mjs`
// con las mismas reglas de `db/agregar_rpc_eliminar_anular_documentos.sql`).
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

console.log("2. Borrador propio: 'Anular' no se ofrece y 'Eliminar borrador' funciona");
await page.click("text=Óptica Borrador S.A.S.");
await page.waitForSelector("text=Cadena de aprobación", { timeout: 5000 });
afirmar(await page.isVisible('[role="dialog"] >> text=Borrador'), "el CAF abre en Borrador");
afirmar(!(await page.isVisible('button:has-text("Anular")')), "'Anular' NO aparece en un documento en Borrador");
afirmar(await page.isVisible('button:has-text("Eliminar borrador")'), "'Eliminar borrador' sí aparece para quien lo creó");
await page.click('button:has-text("Eliminar borrador")');
await page.click('button:has-text("Sí, eliminar")').catch(async () => { await page.click('button:has-text("Confirmar eliminación")'); });
await page.waitForTimeout(500);
afirmar(!fixtures.tablas.cafs.some((c) => c.id === "caf-borr"), "el borrador desapareció de la base (vía función del servidor)");
afirmar(!fixtures.tablas.caf_aprobaciones.some((p) => p.caf_id === "caf-borr"), "su cadena de aprobación también se borró");
afirmar(!(await page.isVisible("text=No se pudo eliminar")), "no aparece el mensaje de error 'No se pudo eliminar'");

console.log("3. Documento Pendiente: 'Anular' sí aparece y funciona");
await page.waitForSelector("text=Clínica Pendiente S.A.S.", { timeout: 5000 });
await page.click("text=Clínica Pendiente S.A.S.");
await page.waitForSelector("text=Cadena de aprobación", { timeout: 5000 });
afirmar(await page.isVisible('button:has-text("Anular")'), "'Anular' aparece en un documento Pendiente (administrador)");
await page.click('button:has-text("Anular")');
await page.getByPlaceholder(/motivo/i).first().fill("Creado por error.");
await page.click('button:has-text("Confirmar anulación")');
await page.waitForTimeout(500);
afirmar(fixtures.tablas.cafs.find((c) => c.id === "caf-pend")?.estado === "Anulado", "el CAF quedó 'Anulado' en la base");
afirmar(!(await page.isVisible("text=No se pudo anular")), "no aparece el mensaje de error 'No se pudo anular'");

console.log("4. Menú: sección renombrada a 'Gestión avanzada de documentos'");
afirmar(await page.isVisible('nav >> text=Gestión avanzada de documentos'), "el ítem del menú se llama 'Gestión avanzada de documentos'");
afirmar(!(await page.isVisible('nav >> text=Eliminar Documentos Firmados')), "ya no existe el nombre anterior en el menú");
await page.click('nav >> text=Gestión avanzada de documentos');
await page.waitForSelector("text=Ver documento", { timeout: 5000 });
afirmar(await page.isVisible("h1:has-text('Gestión avanzada de documentos')"), "el encabezado de la página usa el nombre nuevo");

console.log("5. 'Ver documento' desde la fila");
await page.locator('button:has-text("Ver documento")').first().click();
await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
afirmar(await page.isVisible('[role="dialog"] >> text=Cadena de aprobación') || (await page.locator('[role="dialog"]').count()) > 0, "se abre la vista del documento");
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

console.log("6. Eliminar con 'Ver documento' dentro de la confirmación");
const filaCompletada = page.locator("div.rounded-md.border", { hasText: "Congreso Completado 2026" }).first();
await filaCompletada.locator('button:has-text("Eliminar sin rastro")').click();
await page.waitForSelector("text=Confirmar eliminación sin rastro", { timeout: 5000 });
await page.click('button:has-text("Ver documento antes de confirmar")');
await page.waitForTimeout(500);
afirmar(await page.isVisible("text=Congreso Completado 2026 >> nth=-1"), "el documento se ve encima de la confirmación");
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
afirmar(await page.isVisible("text=Confirmar eliminación sin rastro"), "la confirmación sigue abierta tras cerrar la vista del documento");
await page.fill("#password-confirmacion", "clave-segura-123");
fixtures.tablas.cafs = fixtures.tablas.cafs.filter((c) => c.evento_origen_id !== "evt-comp"); // el CAF anulado de prueba referencia al evento: se retira para aislar este caso
await page.click('button:has-text("Confirmar eliminación")');
await page.waitForTimeout(600);
afirmar(!fixtures.tablas.solicitudes_evento.some((e) => e.id === "evt-comp"), "el documento Completado se eliminó (vía función del servidor)");
afirmar(!(await page.isVisible("text=No se pudo eliminar")), "no aparece el mensaje 'no se encontró el documento'");

console.log("7. Usuarios y Roles");
await page.click('nav >> text=Configuración de Usuarios/Roles');
await page.waitForSelector("text=Nuevo Usuario", { timeout: 5000 });
const desborda = await page.evaluate(() => {
  const t = document.querySelector("table");
  const c = t?.parentElement;
  return c ? { sw: c.scrollWidth, cw: c.clientWidth } : null;
});
afirmar(desborda && desborda.sw <= desborda.cw + 1, `la tabla de usuarios cabe sin scroll horizontal (scrollWidth=${desborda?.sw}, clientWidth=${desborda?.cw})`);
afirmar(await page.isVisible("text=Gerencia General / Rep. Legal"), "el rol se muestra como 'Gerencia General / Rep. Legal'");
afirmar(!(await page.isVisible("text=Representación Legal")), "no queda el nombre anterior del rol en pantalla");
await page.screenshot({ path: "/tmp/claude-0/-home-claude/9453d53e-517b-5a95-b4b9-70ba36d9eb10/scratchpad/usuarios-roles.png", fullPage: false });
await page.locator('button[title="Editar"]').first().click();
await page.waitForSelector("text=Editar usuario", { timeout: 5000 });
await page.getByText("Acceso y permisos", { exact: false }).first().click().catch(() => {});
await page.waitForTimeout(300);
afirmar(await page.isVisible("text=Gestión avanzada de documentos firmados (Módulo de administración)"), "el permiso usa el texto nuevo");
afirmar(!(await page.isVisible("text=Puede eliminar documentos firmados sin rastro")), "ya no aparece el texto anterior del permiso");
afirmar(!(await page.isVisible("text=Otorga acceso individual")), "se retiró la nota 'Otorga acceso individual...'");

console.log(erroresConsola.length ? `Errores de consola: ${erroresConsola.join(" | ")}` : "Sin errores de consola.");
afirmar(erroresConsola.length === 0, "sin errores de JavaScript en consola");
await browser.close();
if (fallas) { console.error(`\n${fallas} verificación(es) fallaron.`); process.exit(1); }
console.log("\nTodas las verificaciones pasaron.");
