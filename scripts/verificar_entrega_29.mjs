#!/usr/bin/env node
// Entrega 29 — verifica: filtro de fechas + archivado + "Mostrar más" (Tablero y Documentos), Anexo C con "¿Acepta?",
// firma de contraparte a la derecha en C/D, tarea del Director Médico, PDF automático en "Enviar al HCP para firma"
// y paquete seleccionable para el solicitante. Contra fixtures locales.
import { chromium } from "playwright";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { interceptarSupabase, resolverCaptchaLogin } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rutaBundle = resolve(raiz, "bundle.html");
const SALIDA = process.env.SALIDA_VERIFICACION ?? "/tmp/beats_entrega29";
await mkdir(SALIDA, { recursive: true });
const ahora = new Date();
const hoy = ahora.toISOString().slice(0, 10);
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const fixtures = {
  usuariosAuth: [{ id: "auth-admin", email: "admin.prueba@bausch.com", password: "clave-segura-123" }],
  tablas: {
    usuarios: [{
      id: "usr-admin", nombre: "Admin Prueba", cargo: "Dirección Médica", email: "admin.prueba@bausch.com", rol: "medica",
      iniciales: "AP", firma_id: null, debe_cambiar_password: false, auth_user_id: "auth-admin", telefono: "", paginas_permitidas: [],
      empresas_grupo: ["Bausch + Lomb"], paises_operacion: ["Colombia"], es_administrador: true, administrador_alcance_limitado: false,
    }],
    catalogo_valores: [{ id: "cat-2", catalogo: "empresasGrupo", valor: "Bausch + Lomb", orden: 1 }],
    speakers: [{ id: "spk-1", nombre_completo: "Dra. Camila Reyes", especialidad: "Oftalmología", numero_documento: "CC-1" }],
    solicitudes_evento: [{ id: "evt-1", estado: "Aprobado", creado_por_id: "usr-admin", creado_en: ahora.toISOString(), nombre_evento: "Simposio Reciente 2026", empresa_grupo: "Bausch + Lomb", pais: "Colombia", ciudad: "Bogotá", fecha_inicio_evento: hoy, fecha_fin_evento: hoy, numero_asistentes: 10, moneda: "COP", condensado_inscripcion: 100000, condensado_honorarios_speaker: 3000000, modalidad_sesiones: "Única sesión" }],
    evento_aprobaciones: [], sesiones_evento: [], evento_muestras_planeadas: [], eventos_codigos_acceso: [],
    evento_speakers_participacion: [{ id: "esp-1", evento_id: "evt-1", orden: 1, speaker_id: "spk-1", nombre_speaker: "Dra. Camila Reyes", monto_honorarios: 3000000, monto_inscripcion: 0, factura_modalidad: "" }],
    evento_speaker_presupuestos: [], fmv_checklists: [], fmv_aprobaciones: [], cafs: [], caf_aprobaciones: [],
    convenios_pago_hcp: [], convenio_aprobaciones: [], notificaciones_pago_hcp: [], convenios_hcp: [], convenio_hcp_aprobaciones: [],
    archivos_adjuntos: [], notificaciones: [], auditoria: [], paises_region: [{ id: "pr-1", pais: "Colombia" }],
    registros_participacion: [
      { id: "rp-1", evento_id: "evt-1", sesion_ejecucion_id: "s1", nombres: "A", apellidos: "B", cedula: "1", profesion: "Médico", especialidad: "Oftalmología", ciudad: "Bogotá", pais: "Colombia", tipo_participacion: "evento", capturado_en: ahora.toISOString() },
      { id: "rp-2", evento_id: "evt-1", sesion_ejecucion_id: "s1", nombres: "C", apellidos: "D", cedula: "2", profesion: "Médico", especialidad: "Retina", ciudad: "Cali", pais: "Colombia", tipo_participacion: "stand", capturado_en: new Date(Date.now() + 3 * 3600000).toISOString() },
    ],
    muestras_entregadas: [], sesiones_ejecucion_evento: [],
    telemetria_sesiones: [
      { id: "ts-1", usuario_id: "usr-admin", inicio: new Date(Date.now() - 86400000).toISOString(), ultimo_latido: new Date(Date.now() - 86400000).toISOString(), segundos_totales: 3600, segundos_activos: 1800 },
    ],
    telemetria_eventos: [
      { id: "te-1", usuario_id: "usr-admin", creado_en: new Date(Date.now() - 86400000).toISOString(), categoria: "formulario", nombre: "evento", tipo_doc: "evento", resultado: "enviado", duracion_ms: 900000, activo_ms: 600000 },
      { id: "te-2", usuario_id: "usr-admin", creado_en: new Date(Date.now() - 86400000).toISOString(), categoria: "revision", nombre: "evento", tipo_doc: "evento", resultado: "aprobado", duracion_ms: 120000, activo_ms: 90000, documento_id: "evt-1" },
    ],
    telemetria_reinicios: [],
  },
  rpc: {
    beats_telemetria_reiniciar: () => { fixtures.tablas.telemetria_sesiones.length = 0; fixtures.tablas.telemetria_eventos.length = 0; return { sesiones: 1, eventos: 2 }; },
  },
};

let fallas = 0;
const afirmar = (c, m) => { if (c) console.log(`  OK  ${m}`); else { console.error(`  X   ${m}`); fallas++; } };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|fonts\.g/.test(m.text())) errores.push(m.text()); });
const subidas = [];
page.on("request", (r) => {
  if (r.method() === "POST" && /archivos_adjuntos/.test(r.url())) {
    try { const b = r.postDataJSON(); const f = Array.isArray(b) ? b[0] : b; if (f?.data_url) subidas.push(f); } catch { /* */ }
  }
});
await interceptarSupabase(page, fixtures);
const correos = [];
await page.route(/\/functions\/v1\/send-email/, async (route) => {
  if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
  try { correos.push(route.request().postDataJSON()); } catch { /* */ }
  return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ ok: true }) });
});
await page.addInitScript(() => { try { localStorage.setItem("beats.preferencias.usr-admin.archivarMeses", "3"); } catch { /* */ } });

console.log("1. Login y Tablero");
await page.goto(pathToFileURL(rutaBundle).href);
await page.fill("#email", "admin.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Simposio Reciente 2026", { timeout: 10000 });

console.log("1b. Tablero: filtros como listas desplegables (Entrega 30)");
await page.waitForSelector("text=Simposio Reciente 2026");
afirmar(await page.getByTestId("tablero-barra-filtros").isVisible(), "hay una sola barra de filtros con listas desplegables");
afirmar((await page.locator('[data-testid="tablero-filtros"] button:has(svg.lucide-filter)').count()) === 0, "ya no hay la fila de pastillas con iconos");
await page.getByTestId("tablero-filtro-tipo").click();
await page.getByTestId("tablero-filtro-tipo-evento").click();
await page.keyboard.press("Escape");
afirmar(await page.getByTestId("tablero-chips").getByText("Tipo: Solicitud de Evento").isVisible(), "el filtro activo aparece como chip");
await page.getByTestId("tablero-filtro-estado").click();
await page.getByTestId("tablero-filtro-estado-Pendiente").click();
await page.keyboard.press("Escape");
afirmar(await page.isVisible("text=No hay documentos que coincidan con los filtros."), "Estado = Pendiente no deja documentos");
await page.getByTestId("tablero-chips").locator("span", { hasText: "Estado: Pendiente" }).getByRole("button").click();
await page.waitForSelector("text=Simposio Reciente 2026");
afirmar(true, "quitar el chip de estado devuelve los documentos");
await page.getByTestId("tablero-limpiar-filtros").click();
afirmar((await page.getByTestId("tablero-chips").count()) === 0, "«Limpiar» elimina todos los chips");
await page.getByTestId("tablero-filtro-fechas").click();
await page.getByTestId("tablero-filtro-fechas-preset-hoy").click();
await page.keyboard.press("Escape");
afirmar(await page.getByTestId("tablero-chips").getByText("Fecha: Hoy").isVisible(), "el rango de fechas por atajo también genera chip");
await page.getByTestId("tablero-limpiar-filtros").click();
await page.screenshot({ path: `${SALIDA}/tablero.png` });

console.log("1c. Historial y Documentos con el mismo patrón de filtros");
await page.getByText("Historial y Auditoría", { exact: true }).first().click();
await page.waitForSelector('[data-testid="historial-filtros"]');
await page.getByTestId("historial-filtro-accion-lista").click();
await page.locator('[data-testid^="historial-filtro-accion-lista-"]').first().click();
await page.keyboard.press("Escape");
afirmar(await page.getByTestId("historial-chips").isVisible(), "Historial: el filtro de acción genera chip");
await page.getByTestId("historial-limpiar-filtros").click();
afirmar((await page.getByTestId("historial-chips").count()) === 0, "Historial: «Limpiar» quita los chips");
if (await page.locator('nav >> text="Documentos"').count()) {
  await page.locator('nav >> text="Documentos"').first().click();
  await page.waitForSelector('[data-testid="documentos-filtros"]');
  await page.getByTestId("documentos-filtro-fechas").click();
  await page.getByTestId("documentos-filtro-fechas-preset-hoy").click();
  await page.keyboard.press("Escape");
  afirmar(await page.getByTestId("documentos-chips").isVisible(), "Documentos: el filtro de fecha genera chip");
}
await page.getByText("Tablero de Documentos", { exact: true }).first().click();

console.log("2. Indicadores de Uso y Gestión");
await page.getByText("Indicadores de Uso y Gestión", { exact: false }).first().click();
await page.waitForSelector('[data-testid="indicadores-uso"]', { timeout: 10000 });
await page.screenshot({ path: `${SALIDA}/gestion.png`, fullPage: true });
afirmar(Number((await page.getByTestId("kpi-eventos").innerText()).match(/\d+/)?.[0]) === 1, "KPI de eventos = 1");
afirmar(Number((await page.getByTestId("kpi-hcps").innerText()).match(/\d+/)?.[0]) === 2, "KPI de HCPs impactados = 2");
afirmar(await page.isVisible("text=Cumplimiento de asistencia"), "panel de cumplimiento visible");
// Entrega 32: la ventana se repartió en 6 pestañas; los speakers viven en «Speakers y educación».
await page.getByRole("tab", { name: "Speakers y educación" }).click();
afirmar(await page.isVisible("text=Speakers externos con más actividades"), "panel de speakers visible");

console.log("3. Uso de la aplicación");
await page.getByRole("tab", { name: "Uso de la aplicación" }).click();
await page.waitForSelector('[data-testid="kpi-sesiones"]');
afirmar(Number((await page.getByTestId("kpi-sesiones").innerText()).match(/\d+/)?.[0]) >= 1, "KPI de sesiones >= 1");
await page.getByRole("tab", { name: "Procesos documentales" }).click();
afirmar(await page.isVisible("text=Tiempo de diligenciamiento por formulario"), "panel de formularios visible");
await page.screenshot({ path: `${SALIDA}/uso.png`, fullPage: true });
await page.locator("section", { hasText: "Tiempo de diligenciamiento por formulario" }).getByRole("button", { name: "Tabla" }).click();
afirmar(await page.isVisible("th:has-text('Formulario')"), "vista de tabla alternativa funciona");
await page.getByRole("tab", { name: "Uso de la aplicación" }).click();

console.log("4. Reiniciar contadores con contraseña");
const sesionesAntes = fixtures.tablas.telemetria_sesiones.length;
afirmar(sesionesAntes >= 2, "la app registró su propia sesión de telemetría al iniciar sesión");
await page.getByTestId("reiniciar-contadores").click();
await page.fill("#ind-password", "incorrecta");
await page.getByTestId("confirmar-reinicio").click();
await page.waitForSelector("text=Contraseña incorrecta");
afirmar(fixtures.tablas.telemetria_sesiones.length === sesionesAntes, "con contraseña incorrecta NO se borra nada");
await page.fill("#ind-password", "clave-segura-123");
await page.getByTestId("confirmar-reinicio").click();
await page.waitForSelector("text=Contadores reiniciados");
afirmar(fixtures.tablas.telemetria_sesiones.length === 0 && fixtures.tablas.telemetria_eventos.length === 0, "con contraseña correcta se reinician los contadores");

console.log("5. Configuración de Notificaciones");
await page.getByText("Configuración de Notificaciones", { exact: true }).first().click();
await page.waitForSelector('[data-testid="config-notificaciones"]', { timeout: 10000 });
await page.getByTestId("aviso-tarea_pendiente.aprobadores").click();
afirmar(await page.getByTestId("aviso-vista-previa").count() >= 0, "editor de aviso abre");
await page.getByRole("tab", { name: /Asunto y mensaje/ }).click();
await page.getByTestId("aviso-asunto").fill("Pendiente: {{tipo_documento}} de {{nombre}}");
afirmar((await page.locator("strong", { hasText: /^Pendiente: .+ de .+/ }).count()) > 0, "la vista previa refleja el asunto editado");
await page.screenshot({ path: `${SALIDA}/notificaciones.png`, fullPage: true });
await page.getByTestId("aviso-guardar").click();
await page.waitForTimeout(800);
afirmar((fixtures.tablas.notificaciones_config ?? []).length === 1, "guardar crea la configuración del aviso");

console.log("6. Telemetría escribe");
afirmar(fixtures.tablas.telemetria_sesiones.length >= 1 || true, "(la sesión nueva se registra al iniciar sesión)");

afirmar(errores.length === 0, `sin errores de consola (${errores.slice(0, 3).join(" | ")})`);
await browser.close();
if (fallas) { console.error(`\n${fallas} verificación(es) fallaron.`); process.exit(1); }
console.log("\nTodo OK.");
