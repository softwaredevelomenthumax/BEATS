#!/usr/bin/env node
// Entrega 40 — «Tareas Pendientes» → formularios: al abrir un formulario desde una tarea (y al elegir evento / HCP a mano) se
// precargan el evento y TODOS los datos del HCP. Cubre Notificación de Pago, CAF, FMV Checklist, Convenio de Pago y Convenio HCP.
// Todo contra fixtures locales — nunca Supabase real. `BUNDLE=ruta` permite correrlo contra otra versión (p. ej. la 14.37, donde falla).
import { chromium } from "playwright";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { interceptarSupabase, resolverCaptchaLogin } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rutaBundle = process.env.BUNDLE ? resolve(process.env.BUNDLE) : resolve(raiz, "bundle.html");
const SALIDA = process.env.SALIDA_VERIFICACION ?? "/tmp/beats_entrega40";
await mkdir(SALIDA, { recursive: true });
const ahora = new Date();
const dia = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

const usuario = (id, nombre, rol, extra = {}) => ({
  id, nombre, cargo: "Directora Médica", email: `${id}@bausch.com`, rol, iniciales: nombre.slice(0, 2).toUpperCase(), firma_id: null, debe_cambiar_password: false,
  auth_user_id: `auth-${id}`, telefono: "", paginas_permitidas: [], empresas_grupo: ["Bausch + Lomb"], paises_operacion: ["Colombia"],
  es_administrador: false, administrador_alcance_limitado: false, ...extra,
});
const spk = (id, nombre, doc, licencia, extra = {}) => ({
  id, nombre_completo: nombre, especialidad: "Oftalmología", numero_documento: doc, licencia_rethus: licencia, profesion: "Médico", direccion: `Calle ${id} #1-23`,
  pais: "Colombia", ciudad: "Bogotá", estado_provincia: "Cundinamarca", telefono: "3001112233", email: `${id}@x.co`, estado: "Confirmado", ...extra,
});
const aprobado = (id, tabla, speakerId, extra = {}) => ({ id, estado: "Aprobado", evento_origen_id: "evt-1", speaker_id: speakerId, creado_por_id: "usr-med", creado_en: ahora.toISOString(), ...extra });
const participacion = (id, orden, speakerId, nombre) => ({
  id, evento_id: "evt-1", orden, speaker_id: speakerId, nombre_speaker: nombre, monto_honorarios: 3000000, monto_inscripcion: 0, factura_modalidad: "", tipo_speaker: "externo",
});

const fixtures = {
  usuariosAuth: [{ id: "auth-med", email: "med.prueba@bausch.com", password: "clave-segura-123" }],
  tablas: {
    usuarios: [usuario("usr-med", "Directora Prueba", "medica", { email: "med.prueba@bausch.com", auth_user_id: "auth-med", es_administrador: true })],
    catalogo_valores: [
      { id: "cat-1", catalogo: "monedas", valor: "COP", orden: 1 },
      { id: "cat-2", catalogo: "empresasGrupo", valor: "Bausch + Lomb", orden: 1 },
      { id: "cat-3", catalogo: "empresasGrupo", valor: "Otra Empresa", orden: 2 },
      { id: "cat-4", catalogo: "especialidadesMedicas", valor: "Oftalmología", orden: 1 },
    ],
    speakers: [
      spk("spk-A", "Dra. Camila Reyes", "52111222", "RETHUS-777"),
      spk("spk-B", "Dr. Pedro Gómez", "80333444", "RETHUS-888"),
      spk("spk-C", "Dra. Laura Mora", "43555666", "RETHUS-999"),
    ],
    solicitudes_evento: [{
      id: "evt-1", estado: "Aprobado", creado_por_id: "usr-med", creado_en: ahora.toISOString(), nombre_evento: "Simposio de Catarata 2026", empresa_grupo: "Bausch + Lomb",
      pais: "Colombia", ciudad: "Bogotá", moneda: "COP", fecha_inicio_evento: dia(-3), fecha_fin_evento: dia(-3), numero_asistentes: 40, modalidad_sesiones: "Única sesión",
      participacion_academica: true, quien_dicta_actividad: "Speaker externo", tipo_evento: "Educativo", direccion: "Carrera 7 #71-21",
    }],
    evento_aprobaciones: [
      { id: "ea-1", evento_id: "evt-1", orden: 1, etiqueta: "Director Médico", rol_requerido: "medica", estado: "aprobado", pendiente_desde: ahora.toISOString() },
    ], sesiones_evento: [], evento_muestras_planeadas: [], eventos_codigos_acceso: [],
    evento_productos: [{ id: "ep-1", evento_id: "evt-1", producto_id: "prod-1", es_principal: true, orden: 1 }],
    evento_speakers_participacion: [
      participacion("esp-A", 1, "spk-A", "Dra. Camila Reyes"),
      participacion("esp-B", 2, "spk-B", "Dr. Pedro Gómez"),
      participacion("esp-C", 3, "spk-C", "Dra. Laura Mora"),
    ],
    evento_speaker_presupuestos: [],
    // A y C tienen FMV + Convenio aprobados; A además tiene CAF (queda «Falta Convenio HCP»); C «Falta CAF»; B no tiene nada.
    fmv_checklists: [aprobado("fmv-A", "", "spk-A", { estado: "Completado", empresa_grupo: "Bausch + Lomb" }), aprobado("fmv-C", "", "spk-C", { estado: "Completado", empresa_grupo: "Bausch + Lomb" })],
    fmv_aprobaciones: [],
    convenios_pago_hcp: [
      aprobado("cp-A", "", "spk-A", { hcp_nombre_completo: "Dra. Camila Reyes", hcp_numero_documento: "52111222", hcp_cedula_licencia: "52111222", contraprestacion_hcp: 3000000, moneda_contraprestacion: "COP", fecha_inicio_actividad: dia(-3), hcp_direccion: "Calle spk-A #1-23", hcp_pais: "Colombia", hcp_ciudad: "Bogotá", objetivo: "Charla de actualización" }),
      aprobado("cp-C", "", "spk-C", { hcp_nombre_completo: "Dra. Laura Mora", hcp_numero_documento: "43555666", hcp_cedula_licencia: "43555666", contraprestacion_hcp: 3000000, moneda_contraprestacion: "COP", fecha_inicio_actividad: dia(-3) }),
    ],
    convenio_aprobaciones: [],
    cafs: [aprobado("caf-A", "", "spk-A", { estado: "Borrador", moneda: "COP", monto: 3000000, contraparte_nombre: "Dra. Camila Reyes" })],
    caf_aprobaciones: [], convenios_hcp: [], convenio_hcp_aprobaciones: [], convenio_hcp_ajustes_clausula: [],
    notificaciones_pago_hcp: [],
    campos_personalizados_definicion: [], etiquetas_campo: [], evento_repositorio_archivos: [],
    evento_registros_financieros: [
      { id: "fin-1", evento_id: "evt-1", categoria: "facturas", archivo_id: "arch-f1", numero: "FAC-77", fecha: dia(-1), valor: 1500000, moneda: "COP", sesion_id: null, speaker_id: "spk-A" },
    ],
    evento_anotaciones_pago: [],
    registros_participacion: [], registros_fuerza_ventas: [], muestras_entregadas: [],
    productos_portafolio: [{ id: "prod-1", nombre: "Lumify", activo: true }, { id: "prod-2", nombre: "Pataday", activo: true }],
    archivos_adjuntos: [], notificaciones: [], paises_region: [{ id: "pr-1", pais: "Colombia" }],
  },
  rpc: {},
};

let fallas = 0;
const afirmar = (c, m) => { if (c) console.log(`  OK  ${m}`); else { console.error(`  X   ${m}`); fallas++; } };
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
const page = await context.newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push(m.text()); });
await interceptarSupabase(page, fixtures);
await page.goto(pathToFileURL(rutaBundle).href);
await page.fill("#email", "med.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Tablero", { timeout: 10000 });

const irATareas = async () => {
  await page.locator("aside").getByText("Tareas Pendientes", { exact: true }).click();
  await page.waitForSelector("text=Tareas de documentos por speaker", { timeout: 10000 });
};
// Lee el valor de un <input> por su etiqueta; espera (hasta 6 s) a que aparezca algo, sin exigirlo.
const valor = async (etiqueta) => {
  const el = page.getByLabel(etiqueta).first();
  await el.waitFor({ timeout: 8000 });
  return el.inputValue();
};
const esperarValor = async (etiqueta, esperado) => {
  const el = page.getByLabel(etiqueta).first();
  await el.waitFor({ timeout: 8000 });
  await page.waitForFunction(([e, v]) => { const x = document.querySelector(`[id="${e}"]`); return x && x.value === v; }, [await el.getAttribute("id"), esperado], { timeout: 6000 }).catch(() => {});
  return el.inputValue();
};
const campo = async (etiqueta, esperado, mensaje) => {
  const real = await esperarValor(etiqueta, esperado).catch((e) => `‹${String(e).slice(0, 60)}›`);
  afirmar(real === esperado, real === esperado ? mensaje : `${mensaje} (esperado «${esperado}», real «${real}»)`);
};
const textoSelect = async (id) => (await page.locator(`#${id}`).innerText()).trim();
const tarjetaSpeaker = (nombre) => page.locator("div.rounded-md.border.p-3").filter({ hasText: nombre }).filter({ hasText: "Simposio de Catarata 2026" });

// =====================================================================================================================
console.log("1. Notificación de Pago desde la tarea: evento, empresa, HCP completo, producto y factura");
await irATareas();
await page.getByTestId("tarea-notificacion-pago").first().getByRole("button", { name: /Falta Notificación de Pago/ }).click();
await page.waitForSelector("text=Nueva Notificación de Pago a HCP", { timeout: 10000 });
await campo(/Nombre del profesional de la salud/, "Dra. Camila Reyes", "nombre del profesional de la salud cargado");
await campo(/Número de documento de identidad/, "52111222", "número de documento de identidad cargado");
await campo(/Número de cédula profesional o licencia/, "RETHUS-777", "cédula / licencia cargada desde la ficha del speaker");
afirmar(/Simposio de Catarata 2026/.test(await textoSelect("notif-evento-origen")), "el evento de origen queda seleccionado");
afirmar(/Dra\. Camila Reyes/.test(await textoSelect("notif-speaker")), "el HCP queda seleccionado");
afirmar(/Bausch \+ Lomb/.test(await textoSelect("notif-empresa")), "empresa del grupo cargada");
await page.waitForFunction(() => /Lumify/.test(document.querySelector("#notif-producto-0")?.textContent ?? ""), null, { timeout: 6000 }).catch(() => {});
afirmar(/Lumify/.test(await textoSelect("notif-producto-0")), "producto del evento cargado");
await page.waitForFunction(() => /FAC-77/.test(document.querySelector("#notif-numero-factura")?.textContent ?? ""), null, { timeout: 6000 }).catch(() => {});
afirmar(/FAC-77/.test(await textoSelect("notif-numero-factura")), "la única factura sin notificar se elige sola");
afirmar((await valor(/Moneda de la factura/)) === "COP", "moneda de la factura cargada");
afirmar((await valor(/Fecha de factura/)) === dia(-1), "fecha de la factura cargada");
await page.screenshot({ path: `${SALIDA}/notificacion_desde_tarea.png`, fullPage: true });

console.log("2. Notificación de Pago a mano: elegir evento y luego HCP, y «Volver a cargar los datos del HCP»");
await page.locator("aside").getByText(/^Tablero/).first().click();
await page.locator("aside").getByText("Notificación de Pago a HCPs", { exact: true }).click();
await page.waitForSelector("text=Nueva Notificación de Pago a HCP", { timeout: 10000 });
await page.locator("#notif-evento-origen").click();
await page.getByRole("option", { name: /Simposio de Catarata 2026/ }).click();
afirmar(/Simposio/.test(await textoSelect("notif-evento-origen")), "se elige el evento");
await page.locator("#notif-speaker").click();
await page.getByRole("option", { name: /Camila Reyes/ }).click();
await campo(/Nombre del profesional de la salud/, "Dra. Camila Reyes", "al elegir el HCP se carga el nombre");
await campo(/Número de documento de identidad/, "52111222", "…el documento de identidad");
await campo(/Número de cédula profesional o licencia/, "RETHUS-777", "…y la cédula / licencia");
await page.getByLabel(/Número de documento de identidad/).fill("borrado a mano");
await page.getByRole("button", { name: /Volver a cargar los datos del HCP/ }).click();
await campo(/Número de documento de identidad/, "52111222", "«Volver a cargar los datos del HCP» restituye los datos");

if (process.env.DEPURAR) { await irATareas(); console.log((await page.locator("main").innerText()).slice(0, 3000)); }
console.log("3. CAF desde la tarea (speaker sin CAF): contraparte completa desde el Convenio de Pago / ficha");
await irATareas();
await tarjetaSpeaker("Dra. Laura Mora").getByRole("button", { name: /Falta CAF/ }).click();
await page.getByTestId("caf-modalidad-beats").click({ timeout: 10000 });
await page.waitForSelector("text=Nombre de la contraparte", { timeout: 10000 });
await campo(/Nombre de la contraparte/, "Dra. Laura Mora", "nombre de la contraparte");
await campo(/Número de documento de la contraparte/, "43555666", "documento de la contraparte");
await campo(/Correo de la contraparte/, "spk-C@x.co", "correo de la contraparte (ficha del speaker)");
await campo(/Teléfono de la contraparte/, "3001112233", "teléfono de la contraparte");

console.log("4. FMV Checklist desde la tarea (speaker B): HCP completo");
await irATareas();
await tarjetaSpeaker("Dr. Pedro Gómez").getByRole("button", { name: /Falta MD FMV Checklist/ }).click();
await page.waitForSelector("text=Nombre completo del HCP", { timeout: 10000 });
await campo(/Nombre completo del HCP/, "Dr. Pedro Gómez", "nombre completo del HCP");
await campo(/Número de documento/, "80333444", "número de documento");
await campo(/Licencia nacional/, "RETHUS-888", "licencia nacional");
await campo(/Dirección principal/, "Calle spk-B #1-23", "dirección principal");

console.log("5. Convenio de Pago desde la tarea (speaker B): HCP, evento y honorarios");
await irATareas();
await tarjetaSpeaker("Dr. Pedro Gómez").getByRole("button", { name: /Falta Convenio de Pago/ }).click();
await page.waitForSelector("text=Evento de origen", { timeout: 10000 });
await campo(/Nombre completo del HCP/, "Dr. Pedro Gómez", "nombre del HCP");
afirmar((await esperarValor(/Cédula \/ licencia del HCP/, "RETHUS-888")) === "RETHUS-888", "cédula / licencia del HCP");
await page.waitForFunction(() => /Simposio de Catarata 2026/.test(document.querySelector("#convenio-evento-origen")?.textContent ?? ""), null, { timeout: 8000 }).catch(() => {});
afirmar(/Simposio de Catarata 2026/.test(await textoSelect("convenio-evento-origen")), "evento de origen seleccionado");

console.log("6. Convenio HCP desde la tarea (speaker A, ya con CAF): consultor completo");
await irATareas();
await tarjetaSpeaker("Dra. Camila Reyes").getByRole("button", { name: /Falta Convenio HCP/ }).click();
await page.getByTestId("cvhcp-modalidad-beats").click({ timeout: 10000 }).catch(() => {});
await page.waitForSelector("text=HCP / Consultor — nombre", { timeout: 10000 });
afirmar((await esperarValor(/HCP \/ Consultor — nombre/, "Dra. Camila Reyes")) === "Dra. Camila Reyes", "nombre del consultor");
afirmar((await esperarValor(/HCP \/ Consultor — correo electrónico/, "spk-A@x.co")) === "spk-A@x.co", "correo del consultor");

afirmar(errores.length === 0, `sin errores de consola/página (${errores.length})`);
if (errores.length) console.error(errores.join("\n"));
await browser.close();
if (fallas) { console.error(`\n${fallas} verificación(es) fallaron.`); process.exit(1); }
console.log("\nTodas las verificaciones pasaron.");
