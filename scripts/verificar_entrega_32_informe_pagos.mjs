#!/usr/bin/env node
// Entrega 32 — Informe de Pagos a HCPs/Speakers como conciliación Contratado → OC → Factura → Pago.
// Un caso por tipo de resultado: consistente, factura mayor que la OC, factura sin pagar, contratado sin OC,
// factura sin OC ni convenio, y moneda distinta. Verifica estados, KPIs, hallazgos y los CSV descargables.
import { chromium } from "playwright";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { readFileSync } from "node:fs";
import { interceptarSupabase, resolverCaptchaLogin } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rutaBundle = resolve(raiz, "bundle.html");
const ahora = new Date();
const dia = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

const spk = (id, nombre) => ({ id, nombre_completo: nombre, especialidad: "Oftalmología", numero_documento: `CC-${id}`, email: `${id}@x.co` });
const part = (id, speaker, nombre, honorarios) => ({ id: `esp-${id}`, evento_id: "evt-1", orden: 1, speaker_id: speaker, nombre_speaker: nombre, monto_honorarios: honorarios, monto_inscripcion: 0, factura_modalidad: "", tipo_speaker: "externo" });
const convHcp = (id, speaker, nombre, valor, moneda = "COP") => ({ id: `ch-${id}`, estado: "Aprobado", creado_por_id: "usr-admin", creado_en: ahora.toISOString(), evento_origen_id: "evt-1", caf_id: "caf-1", speaker_id: speaker, consultor_nombre: nombre, consultor_identificacion: `CC-${id}`, compania_nombre: "Bausch + Lomb", fecha_efectiva: dia(-40), compensacion: valor, moneda, plazo_pago_dias: 30, campos_personalizados: {}, clausulado_snapshot: null });
const fin = (id, cat, speaker, numero, fecha, valor, moneda = "COP", archivo = `arc-${id}`) => ({ id: `fin-${id}`, evento_id: "evt-1", categoria: cat, archivo_id: archivo, numero, fecha, valor, moneda, speaker_id: speaker });

const fixtures = {
  usuariosAuth: [{ id: "auth-admin", email: "admin.prueba@bausch.com", password: "clave-segura-123" }],
  tablas: {
    usuarios: [{ id: "usr-admin", nombre: "Admin Prueba", cargo: "Dirección Médica", email: "admin.prueba@bausch.com", rol: "medica", iniciales: "AP", firma_id: null, debe_cambiar_password: false, auth_user_id: "auth-admin", telefono: "", paginas_permitidas: [], empresas_grupo: ["Bausch + Lomb"], paises_operacion: ["Colombia"], es_administrador: true, administrador_alcance_limitado: false }],
    catalogo_valores: [{ id: "cat-1", catalogo: "monedas", valor: "COP", orden: 1 }, { id: "cat-2", catalogo: "empresasGrupo", valor: "Bausch + Lomb", orden: 1 }],
    speakers: [spk("A", "Speaker A Consistente"), spk("B", "Speaker B Sobrefacturado"), spk("C", "Speaker C Sin Pagar"), spk("D", "Speaker D Sin OC"), spk("E", "Speaker E Sin Convenio"), spk("F", "Speaker F Moneda")],
    solicitudes_evento: [{ id: "evt-1", estado: "Aprobado", creado_por_id: "usr-admin", creado_en: ahora.toISOString(), nombre_evento: "Simposio Conciliación 2026", empresa_grupo: "Bausch + Lomb", pais: "Colombia", ciudad: "Bogotá", moneda: "COP", fecha_inicio_evento: dia(-30), fecha_fin_evento: dia(-30), numero_asistentes: 40, modalidad_sesiones: "Única sesión", participacion_academica: true, quien_dicta_actividad: "Speaker externo" }],
    evento_aprobaciones: [], sesiones_evento: [], evento_muestras_planeadas: [], eventos_codigos_acceso: [],
    evento_speakers_participacion: [
      part("A", "A", "Speaker A Consistente", 8000000), part("B", "B", "Speaker B Sobrefacturado", 5000000), part("C", "C", "Speaker C Sin Pagar", 4000000),
      part("D", "D", "Speaker D Sin OC", 2000000), part("E", "E", "Speaker E Sin Convenio", 1000000), part("F", "F", "Speaker F Moneda", 1000000),
    ],
    evento_speaker_presupuestos: [],
    fmv_checklists: [], fmv_aprobaciones: [],
    convenios_pago_hcp: [{ id: "cp-D", estado: "Aprobado", evento_origen_id: "evt-1", speaker_id: "D", creado_por_id: "usr-admin", creado_en: ahora.toISOString(), hcp_nombre_completo: "Speaker D Sin OC", hcp_cedula_licencia: "CC-D", contraprestacion_hcp: 2000000, moneda_contraprestacion: "COP", fecha_inicio_actividad: dia(-30) }],
    convenio_aprobaciones: [],
    convenios_hcp: [
      convHcp("A", "A", "Speaker A Consistente", 8000000), convHcp("B", "B", "Speaker B Sobrefacturado", 5000000), convHcp("C", "C", "Speaker C Sin Pagar", 4000000),
      convHcp("F", "F", "Speaker F Moneda", 1000, "USD"),
    ],
    convenio_hcp_aprobaciones: [], convenio_hcp_ajustes_clausula: [],
    cafs: [], caf_aprobaciones: [],
    notificaciones_pago_hcp: [
      { id: "np-A", estado: "Aprobado", evento_origen_id: "evt-1", speaker_id: "A", creado_por_id: "usr-admin", creado_en: ahora.toISOString(), nombre_profesional_salud: "Speaker A Consistente", factura_id: "arc-fa-A", numero_factura: "FV-A", fecha_factura: dia(-20), valor_factura: 8000000, moneda_factura: "COP" },
    ],
    campos_personalizados_definicion: [], etiquetas_campo: [], evento_repositorio_archivos: [],
    evento_registros_financieros: [
      // A: todo cuadra
      fin("oc-A", "ordenCompra", "A", "OC-A", dia(-28), 8000000), fin("fa-A", "facturas", "A", "FV-A", dia(-20), 8000000, "COP", "arc-fa-A"), fin("pa-A", "comprobantePago", "A", "CP-A", dia(-10), 8000000),
      // B: factura mayor que la OC
      fin("oc-B", "ordenCompra", "B", "OC-B", dia(-28), 5000000), fin("fa-B", "facturas", "B", "FV-B", dia(-20), 6000000), fin("pa-B", "comprobantePago", "B", "CP-B", dia(-10), 6000000),
      // C: facturado y sin pagar (45 días)
      fin("oc-C", "ordenCompra", "C", "OC-C", dia(-50), 4000000), fin("fa-C", "facturas", "C", "FV-C", dia(-45), 4000000),
      // E: factura sin OC y sin convenio
      fin("fa-E", "facturas", "E", "FV-E", dia(-15), 1000000),
      // F: OC en COP, convenio en USD
      fin("oc-F", "ordenCompra", "F", "OC-F", dia(-28), 4000000),
    ],
    archivos_adjuntos: [], notificaciones: [], paises_region: [{ id: "pr-1", pais: "Colombia" }],
  },
  rpc: {},
};

let fallas = 0;
const afirmar = (c, m) => { if (c) console.log(`  OK  ${m}`); else { console.error(`  X   ${m}`); fallas++; } };
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true });
const page = await context.newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
await interceptarSupabase(page, fixtures);
await page.goto(pathToFileURL(rutaBundle).href);
await page.fill("#email", "admin.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Informe de Pagos", { timeout: 10000 });
await page.click('button:has-text("Informe de Pagos")');
await page.waitForSelector('[data-testid="informe-pagos"]');
await page.waitForSelector('[data-testid="pagos-kpi-consistencia"]', { timeout: 10000 });
await page.screenshot({ path: "/tmp/claude-0/shots/pagos-resumen.png", fullPage: true });

console.log("1. Resumen y KPIs");
const txt = async (id) => (await page.getByTestId(id).innerText()).replace(/\s+/g, " ");
// Esperadas (COP): A consistente; B inconsistente; C en proceso; D en proceso; E inconsistente; F(COP: OC sin contrato en COP, moneda distinta) inconsistente; F(USD) inconsistente
const cons = await txt("pagos-kpi-consistencia");
afirmar(/1 de 7/.test(cons), "consistencia: 1 de 7 conciliaciones cuadra → " + cons);
afirmar((await txt("pagos-kpi-inconsistentes")).startsWith("Inconsistentes 4"), "4 inconsistentes (B, E, F-COP, F-USD) → " + (await txt("pagos-kpi-inconsistentes")));
afirmar((await txt("pagos-kpi-proceso")).startsWith("En proceso 2"), "2 en proceso (C y D) → " + (await txt("pagos-kpi-proceso")));
const cop = await txt("pagos-moneda-COP");
afirmar(cop.includes("Contratado") && cop.includes("Orden de compra") && cop.includes("Facturado") && cop.includes("Pagado"), "el recorrido del dinero muestra las 4 etapas en COP");
afirmar(cop.includes("$19.000.000,00 COP") || cop.includes("19.000.000"), "contratado COP = 8M + 5M + 4M + 2M = 19M");

console.log("2. Tabla de conciliación");
await page.getByTestId("pagos-tab-conciliacion").click();
await page.waitForSelector('[data-testid="pagos-fila"]');
const filas = await page.getByTestId("pagos-fila").count();
afirmar(filas === 7, `7 filas de conciliación (${filas})`);
const filaDe = (nombre) => page.locator('[data-testid="pagos-fila"]', { hasText: nombre }).first();
afirmar((await filaDe("Speaker A").innerText()).includes("Consistente"), "A: Consistente");
afirmar((await filaDe("Speaker B").innerText()).includes("Inconsistente"), "B (facturó 6M con OC de 5M): Inconsistente");
afirmar((await filaDe("Speaker C").innerText()).includes("En proceso"), "C (facturado sin pago): En proceso");
afirmar((await filaDe("Speaker D").innerText()).includes("En proceso"), "D (convenio de pago sin OC): En proceso");
afirmar((await filaDe("Speaker E").innerText()).includes("Inconsistente"), "E (factura sin OC): Inconsistente");
await filaDe("Speaker B").click();
await page.waitForSelector('[data-testid="pagos-fila-detalle"]');
afirmar((await page.getByTestId("pagos-fila-detalle").innerText()).includes("supera la orden de compra"), "el detalle de B explica que lo facturado supera la OC");
await page.screenshot({ path: "/tmp/claude-0/shots/pagos-conciliacion.png", fullPage: true });

console.log("3. Filtros");
await page.getByTestId("pagos-filtro-estado").click();
await page.getByRole("option", { name: "Inconsistente" }).click();
afirmar((await page.getByTestId("pagos-fila").count()) === 4, "filtrar por Inconsistente deja 4 filas");
await page.getByTestId("pagos-filtro-estado").click();
await page.getByRole("option", { name: "Todos" }).click();

console.log("4. CSV");
async function descargar(testId) {
  const [d] = await Promise.all([page.waitForEvent("download"), page.getByTestId(testId).click()]);
  return readFileSync(await d.path(), "utf8");
}
const csvConc = await descargar("pagos-csv-conciliacion");
afirmar(csvConc.split("\r\n").length === 8, "el CSV de conciliación trae encabezado + 7 filas");
afirmar(csvConc.includes("Speaker B Sobrefacturado") && csvConc.includes("Lo facturado supera la orden de compra"), "el CSV incluye los hallazgos de B");
const csvDocs = await descargar("pagos-csv-documentos");
afirmar(csvDocs.includes("Orden de compra") && csvDocs.includes("Factura") && csvDocs.includes("Comprobante de pago") && csvDocs.includes("Convenio HCP"), "el CSV de documentos incluye convenios, OC, facturas y comprobantes");
await page.getByTestId("pagos-tab-hallazgos").click();
const csvHall = await descargar("pagos-csv-hallazgos");
afirmar(csvHall.includes("Moneda distinta entre etapas") && csvHall.includes("Hay facturas sin orden de compra"), "el CSV de hallazgos incluye moneda distinta y factura sin OC");
await page.getByTestId("pagos-tab-resumen").click();
const csvK = await descargar("pagos-csv-kpis");
afirmar(csvK.includes("% de consistencia") && csvK.includes("Saldo por pagar"), "el CSV de KPIs incluye consistencia y saldo por pagar");

console.log("5. Pagos aprobados (entrega 37: contrastado con el Expediente)");
await page.getByTestId("pagos-tab-documentos").click();
await page.waitForSelector("text=Speakers con Convenio o Notificación de Pago ya");
afirmar(await page.getByTestId("pagos-aprobado-fila").filter({ hasText: "Speaker D Sin OC" }).isVisible(), "el Convenio de Pago aprobado sigue apareciendo (ahora como fila del speaker, contrastada con OC/facturas/comprobantes)");
afirmar(errores.length === 0, "sin errores de consola: " + errores.join(" | "));
await browser.close();
if (fallas) process.exit(1);
console.log("Todas las verificaciones pasaron.");
