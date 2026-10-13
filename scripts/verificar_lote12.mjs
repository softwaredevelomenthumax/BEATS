#!/usr/bin/env node
// Lote 12 — cadena de aprobación solo para el rol del paso; créditos con versión. (base: ventanas de documentos con "_" (minimizar a la bandeja) y
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
      usuario("usr-admin", "Admin Prueba", "admin.prueba@bausch.com", process.env.ROL_PRUEBA || "medica", { es_administrador: true, puede_eliminar_documentos_firmados: true }),
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



console.log("2. Créditos muestra versión y fecha/hora del bundle");
await page.locator('nav button', { hasText: 'Créditos' }).click();
await page.waitForSelector('[data-testid="creditos-build"]');
const tb = await page.getByTestId("creditos-build").innerText();
console.log("   ", tb);
afirmar(/Versión .+ · creado el \d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}/.test(tb), "Créditos muestra versión, fecha y hora");

console.log("3. Cadena de aprobación: rol", process.env.ROL_PRUEBA || "medica", "(es administrador)");
await page.click('nav >> text=Tablero de Documentos');
await page.click("text=Clínica Pendiente S.A.S.");
await page.waitForSelector("text=Cadena de aprobación", { timeout: 5000 });
const hayBotones = await page.getByRole("button", { name: "Aprobar", exact: true }).count();
const esperado = (process.env.ROL_PRUEBA || "medica") === "medica" ? 1 : 0;
afirmar(hayBotones === esperado, `botón Aprobar ${esperado ? "visible" : "oculto"} (vio ${hayBotones})`);
afirmar((await page.getByPlaceholder("Comentario (obligatorio para rechazar)").count()) === esperado, `cuadro de comentario ${esperado ? "visible" : "oculto"}`);

await browser.close();
if (erroresConsola.length) { console.error("Errores de consola:", erroresConsola.slice(0, 5)); fallas++; }
if (fallas) { console.error(`\n${fallas} verificación(es) fallaron.`); process.exit(1); }
console.log("\nTodas las verificaciones pasaron.");
