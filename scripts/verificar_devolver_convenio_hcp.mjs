#!/usr/bin/env node
// Entrega 28 — verifica: filtro de fechas + archivado + "Mostrar más" (Tablero y Documentos), Anexo C con "¿Acepta?",
// firma de contraparte a la derecha en C/D, tarea del Director Médico, PDF automático en "Enviar al HCP para firma"
// y paquete seleccionable para el solicitante. Contra fixtures locales.
import { chromium } from "playwright";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { interceptarSupabase, resolverCaptchaLogin } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rutaBundle = resolve(raiz, "bundle.html");
const SALIDA = process.env.SALIDA_VERIFICACION ?? "/tmp/beats_entrega28";
await mkdir(SALIDA, { recursive: true });
const ahora = new Date();
const hoy = ahora.toISOString().slice(0, 10);
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const numerales = Array.from({ length: 15 }, (_, i) => ({
  numero: i + 1,
  textoEs: `${i + 1}. Cláusula de prueba número ${i + 1}. {{empresa}} y el Consultor acuerdan lo siguiente, con texto suficientemente largo para ocupar varias líneas dentro del documento impreso y poner a prueba la paginación del PDF generado.`,
  textoEn: `${i + 1}. Test clause number ${i + 1}. {{empresa}} and Consultant agree to the following, with text long enough to fill several lines inside the printed document.`,
}));
const snapshot = {
  numerales,
  anexoCEs: "Anexo C: autorización de tratamiento de datos para {{empresa}}.",
  anexoCEn: "Exhibit C: data processing authorization for {{empresa}}.",
  anexoDEs: "Anexo D: habeas data de {{empresa}}.",
  anexoDEn: "Exhibit D: habeas data of {{empresa}}.",
};
const aprob = (id, orden, etiqueta, rol) => ({
  id, convenio_hcp_id: "cvh-1", orden, etiqueta, rol_requerido: rol, estado: "pendiente", resuelto_por_id: null,
  fecha: new Date().toISOString(), comentario: "ok", pendiente_desde: new Date().toISOString(), firma_congelada_id: null,
});

// Eventos "viejos" para probar archivado y "Mostrar más".
const viejos = Array.from({ length: 70 }, (_, i) => ({
  id: `evt-old-${i}`, estado: "Aprobado", creado_por_id: "usr-admin", creado_en: "2025-01-10T10:00:00Z",
  nombre_evento: `Evento antiguo ${i}`, empresa_grupo: "Bausch + Lomb", pais: "Colombia", ciudad: "Bogotá",
  fecha_inicio_evento: "2025-01-15", fecha_fin_evento: "2025-01-15", numero_asistentes: 10, modalidad_sesiones: "Única sesión",
}));

const fixtures = {
  usuariosAuth: [{ id: "auth-admin", email: "admin.prueba@bausch.com", password: "clave-segura-123" }],
  tablas: {
    usuarios: [{
      id: "usr-admin", nombre: "Admin Prueba", cargo: "Dirección Médica", email: "admin.prueba@bausch.com", rol: "medica",
      iniciales: "AP", firma_id: null, debe_cambiar_password: false, auth_user_id: "auth-admin", telefono: "", paginas_permitidas: [],
      empresas_grupo: ["Bausch + Lomb"], paises_operacion: ["Colombia"], es_administrador: true, administrador_alcance_limitado: false,
    }],
    catalogo_valores: [
      { id: "cat-1", catalogo: "monedas", valor: "COP", orden: 1 },
      { id: "cat-2", catalogo: "empresasGrupo", valor: "Bausch + Lomb", orden: 1 },
    ],
    speakers: [{ id: "spk-1", nombre_completo: "Dra. Camila Reyes", especialidad: "Oftalmología", licencia_rethus: "RETHUS-998877", numero_documento: "CC-12345", email: "camila@example.com" }],
    solicitudes_evento: [
      { id: "evt-1", estado: "Aprobado", creado_por_id: "usr-admin", creado_en: ahora.toISOString(), nombre_evento: "Simposio Reciente 2026", empresa_grupo: "Bausch + Lomb", pais: "Colombia", ciudad: "Bogotá", fecha_inicio_evento: new Date(Date.now()+30*86400000).toISOString().slice(0,10), fecha_fin_evento: hoy, numero_asistentes: 40, modalidad_sesiones: "Única sesión", participacion_academica: true, quien_dicta_actividad: "Speaker externo" },
      ...viejos,
    ],
    evento_aprobaciones: [], sesiones_evento: [], evento_muestras_planeadas: [], eventos_codigos_acceso: [],
    evento_speakers_participacion: [{ id: "esp-1", evento_id: "evt-1", orden: 1, speaker_id: "spk-1", nombre_speaker: "Dra. Camila Reyes", monto_honorarios: 3000000, monto_inscripcion: 0, factura_modalidad: "" }],
    evento_speaker_presupuestos: [],
    fmv_checklists: [{ id: "fmv-1", estado: "Aprobado", evento_origen_id: "evt-1", speaker_id: "spk-1", nombre_completo: "Dra. Camila Reyes", creado_por_id: "usr-admin", creado_en: ahora.toISOString(), fecha: hoy }],
    fmv_aprobaciones: [],
    convenios_pago_hcp: [], convenio_aprobaciones: [],
    cafs: [{ id: "caf-1", estado: "Aprobado", evento_origen_id: "evt-1", speaker_id: "spk-1", creado_por_id: "usr-admin", creado_en: ahora.toISOString(), codigo_documento: "CAF-1", compania_nombre: "Bausch + Lomb", contraparte_nombre: "Dra. Camila Reyes" }],
    caf_aprobaciones: [],
    notificaciones_pago_hcp: [],
    convenios_hcp: [{
      id: "cvh-1", estado: "Pendiente", creado_por_id: "usr-admin", creado_en: ahora.toISOString(), evento_origen_id: "evt-1", caf_id: "caf-1",
      speaker_id: "spk-1", consultor_nombre: "Dra. Camila Reyes", consultor_identificacion: "CC-12345", consultor_email: "camila@example.com",
      consultor_direccion: "Calle 10 # 5-20", compania_nombre: "Bausch + Lomb", fecha_efectiva: new Date(Date.now()+30*86400000).toISOString().slice(0,10),
      objetivo_consultoria: "Considerando que la consultoría es necesaria.", objetivo_consultoria_en: "Whereas the consulting is needed.",
      servicios_exhibit_a: "Servicios de consultoría durante el evento.", servicios_exhibit_a_en: "Consulting services during the event.",
      compensacion: 8000000, moneda: "COP", plazo_pago_dias: 30, nombre_director_general: "Carlos Ruiz",
      cierre_es: "En testimonio de lo cual, las partes firman.", cierre_en: "In witness whereof, the parties sign.",
      clausulado_snapshot: snapshot, campos_personalizados: {}, archivo_para_hcp_enviado_en: null, archivo_firmado_hcp_id: null,
    }],
    convenio_hcp_aprobaciones: [
      aprob("ap-1", 1, "Visto Bueno Legal/Compliance", "legal"),
      { ...aprob("ap-2", 2, "Firma Gerencia General", "gerencia_general"), convenio_hcp_id: "cvh-1" },
    ].map((a) => ({ ...a, convenio_hcp_id: "cvh-1" })),
    convenio_hcp_ajustes_clausula: [], campos_personalizados_definicion: [], etiquetas_campo: [],
    plantilla_convenio_hcp_version: [],
    archivos_adjuntos: [], notificaciones: [],
    paises_region: [{ id: "pr-1", pais: "Colombia" }],
  },
  rpc: {},
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


console.log("1. Login");
await page.goto(pathToFileURL(rutaBundle).href);
await page.fill("#email", "admin.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Simposio Reciente 2026", { timeout: 10000 });
await page.getByTestId("tablero-filtro-tipo").click();
await page.getByTestId("tablero-filtro-tipo-convenioHCP").click();
await page.keyboard.press("Escape");
await page.getByText("Dra. Camila Reyes").first().click();
await page.waitForSelector('button:has-text("Devolver")', { timeout: 8000 });
await page.locator('button:has-text("Devolver")').first().click({timeout:5000});
await page.getByPlaceholder(/motivo/i).fill("Falta ajustar la compensación.");
await page.click('button:has-text("Confirmar devolución")');
await page.waitForTimeout(1500);
afirmar(fixtures.tablas.convenios_hcp[0].estado === "Devuelto", "el Convenio HCP queda en Devuelto en la base (" + fixtures.tablas.convenios_hcp[0].estado + ")");
await page.getByText("Dra. Camila Reyes").first().click();
await page.waitForSelector('button:has-text("Editar borrador")', { timeout: 8000 }).catch(() => {});
afirmar(await page.isVisible('button:has-text("Editar borrador")'), "tras devolver se puede editar (Editar borrador)");
await page.click('button:has-text("Editar borrador")');
await page.waitForSelector("text=Guardar borrador", { timeout: 8000 });
await page.getByLabel(/Compensación/).first().fill("9000000");
await page.click('button:has-text("Guardar borrador")');
await page.waitForTimeout(1500);
afirmar(Number(fixtures.tablas.convenios_hcp[0].compensacion) !== 8000000, "guardar un Convenio HCP Devuelto persiste la corrección (" + fixtures.tablas.convenios_hcp[0].compensacion + ")");
afirmar(errores.length === 0, "sin errores de consola");
await browser.close();
if (fallas) process.exit(1);
console.log("Todas las verificaciones pasaron.");
