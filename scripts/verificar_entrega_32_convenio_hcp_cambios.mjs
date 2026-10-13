#!/usr/bin/env node
// Entrega 32 — un Convenio HCP devuelto/modificado debe mostrar en la vista previa/impresión/PDF
// exactamente lo que se ve en la ventana (incluida la cláusula ajustada). Contra fixtures locales.
import { chromium } from "playwright";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { interceptarSupabase, resolverCaptchaLogin } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rutaBundle = resolve(raiz, "bundle.html");
const SALIDA = process.env.SALIDA_VERIFICACION ?? "/tmp/beats_entrega32";
await mkdir(SALIDA, { recursive: true });
const ahora = new Date();
const hoy = ahora.toISOString().slice(0, 10);
const numerales = Array.from({ length: 15 }, (_, i) => ({ numero: i + 1, textoEs: `${i + 1}. Cláusula ES ${i + 1}.`, textoEn: `${i + 1}. Clause EN ${i + 1}.` }));
const snapshot = { numerales, anexoCEs: "Anexo C ES original", anexoCEn: "Exhibit C EN original", anexoDEs: "ANEXO D ES ORIGINAL", anexoDEn: "EXHIBIT D EN ORIGINAL" };
const aprob = (id, orden, etiqueta, rol) => ({ id, convenio_hcp_id: "cvh-1", orden, etiqueta, rol_requerido: rol, estado: "pendiente", resuelto_por_id: null, fecha: ahora.toISOString(), comentario: "", pendiente_desde: ahora.toISOString(), firma_congelada_id: null });
const fixtures = {
  usuariosAuth: [{ id: "auth-admin", email: "admin.prueba@bausch.com", password: "clave-segura-123" }],
  tablas: {
    usuarios: [{ id: "usr-admin", nombre: "Admin Prueba", cargo: "Dirección Médica", email: "admin.prueba@bausch.com", rol: "medica", iniciales: "AP", firma_id: null, debe_cambiar_password: false, auth_user_id: "auth-admin", telefono: "", paginas_permitidas: [], empresas_grupo: ["Bausch + Lomb"], paises_operacion: ["Colombia"], es_administrador: true, administrador_alcance_limitado: false }],
    catalogo_valores: [{ id: "cat-1", catalogo: "monedas", valor: "COP", orden: 1 }, { id: "cat-2", catalogo: "empresasGrupo", valor: "Bausch + Lomb", orden: 1 }],
    speakers: [{ id: "spk-1", nombre_completo: "Dra. Camila Reyes", especialidad: "Oftalmología", licencia_rethus: "R-1", numero_documento: "CC-12345", email: "camila@example.com" }],
    solicitudes_evento: [{ id: "evt-1", estado: "Aprobado", creado_por_id: "usr-admin", creado_en: ahora.toISOString(), nombre_evento: "Simposio Reciente 2026", empresa_grupo: "Bausch + Lomb", pais: "Colombia", ciudad: "Bogotá", fecha_inicio_evento: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), fecha_fin_evento: hoy, numero_asistentes: 40, modalidad_sesiones: "Única sesión", participacion_academica: true, quien_dicta_actividad: "Speaker externo" }],
    evento_aprobaciones: [], sesiones_evento: [], evento_muestras_planeadas: [], eventos_codigos_acceso: [],
    evento_speakers_participacion: [{ id: "esp-1", evento_id: "evt-1", orden: 1, speaker_id: "spk-1", nombre_speaker: "Dra. Camila Reyes", monto_honorarios: 3000000, monto_inscripcion: 0, factura_modalidad: "" }],
    evento_speaker_presupuestos: [],
    fmv_checklists: [{ id: "fmv-1", estado: "Aprobado", evento_origen_id: "evt-1", speaker_id: "spk-1", nombre_completo: "Dra. Camila Reyes", creado_por_id: "usr-admin", creado_en: ahora.toISOString(), fecha: hoy }],
    fmv_aprobaciones: [], convenios_pago_hcp: [], convenio_aprobaciones: [],
    cafs: [{ id: "caf-1", estado: "Aprobado", evento_origen_id: "evt-1", speaker_id: "spk-1", creado_por_id: "usr-admin", creado_en: ahora.toISOString(), codigo_documento: "CAF-1", compania_nombre: "Bausch + Lomb", contraparte_nombre: "Dra. Camila Reyes" }],
    caf_aprobaciones: [], notificaciones_pago_hcp: [],
    convenios_hcp: [{ id: "cvh-1", estado: "Pendiente", creado_por_id: "usr-admin", creado_en: ahora.toISOString(), evento_origen_id: "evt-1", caf_id: "caf-1", speaker_id: "spk-1", consultor_nombre: "Dra. Camila Reyes", consultor_identificacion: "CC-12345", consultor_email: "camila@example.com", consultor_direccion: "Calle 10 # 5-20", compania_nombre: "Bausch + Lomb", fecha_efectiva: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), objetivo_consultoria: "CONSIDERANDO ORIGINAL ES", objetivo_consultoria_en: "WHEREAS ORIGINAL EN", servicios_exhibit_a: "Servicios ES", servicios_exhibit_a_en: "Services EN", compensacion: 8000000, moneda: "COP", plazo_pago_dias: 30, nombre_director_general: "Carlos Ruiz", cierre_es: "Cierre ES", cierre_en: "Closing EN", clausulado_snapshot: snapshot, campos_personalizados: {}, archivo_para_hcp_enviado_en: null, archivo_firmado_hcp_id: null }],
    convenio_hcp_aprobaciones: [aprob("ap-1", 1, "Visto Bueno Legal/Compliance", "legal"), aprob("ap-2", 2, "Firma Gerencia General", "gerencia_general")],
    convenio_hcp_ajustes_clausula: [], campos_personalizados_definicion: [], etiquetas_campo: [], plantilla_convenio_hcp_version: [],
    archivos_adjuntos: [], notificaciones: [], paises_region: [{ id: "pr-1", pais: "Colombia" }],
  },
  rpc: {},
};
let fallas = 0;
const afirmar = (c, m) => { if (c) console.log(`  OK  ${m}`); else { console.error(`  X   ${m}`); fallas++; } };
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
await interceptarSupabase(page, fixtures);
await page.addInitScript(() => { try { localStorage.setItem("beats.preferencias.usr-admin.archivarMeses", "3"); } catch { /* */ } });
await page.goto(pathToFileURL(rutaBundle).href);
await page.fill("#email", "admin.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Simposio Reciente 2026", { timeout: 10000 });
await page.getByTestId("tablero-filtro-tipo").click();
await page.getByTestId("tablero-filtro-tipo-convenioHCP").click();
await page.keyboard.press("Escape");

async function abrirDoc() { await page.getByText("Dra. Camila Reyes").first().click(); await page.waitForSelector("text=ID interno: cvh-1", { timeout: 8000 }); }
async function textoImpresion() {
  await page.click('button:has-text("Ver / Imprimir / Exportar a PDF")');
  await page.waitForSelector('[role="dialog"] >> text=Anexo B', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
  const t = await page.locator('[role="dialog"]').last().innerText();
  await page.screenshot({ path: `${SALIDA}/impresion.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  return t;
}

console.log("A. Ajuste de la cláusula Anexo D (solo el texto en español) y vista de impresión");
await abrirDoc();
await page.locator("#convenio-hcp-seccion-ajuste").click();
await page.getByRole("option", { name: /Anexo D/ }).click();
await page.fill("#ajuste-texto-es", "ANEXO D ES MODIFICADO");
await page.fill("#ajuste-texto-en", "EXHIBIT D EN MODIFIED");
await page.fill("#ajuste-justificacion", "Pedido de Legal");
afirmar((await page.getByTestId("aviso-idioma-desalineado").count()) === 0, "sin aviso cuando se cambian los dos idiomas");
await page.click('button:has-text("Guardar ajuste")');
await page.waitForTimeout(1200);
afirmar(fixtures.tablas.convenio_hcp_ajustes_clausula.length === 1, "el ajuste quedó guardado");
let t = await textoImpresion();
afirmar(t.includes("ANEXO D ES MODIFICADO") && t.includes("EXHIBIT D EN MODIFIED"), "la impresión muestra el Anexo D modificado");
afirmar(!t.includes("ANEXO D ES ORIGINAL"), "la impresión no muestra el Anexo D original");

console.log("A2. Cambiar solo el español avisa que el inglés quedará como estaba");
await page.locator("#convenio-hcp-seccion-ajuste").click();
await page.getByRole("option", { name: /Numeral 3/ }).click();
await page.fill("#ajuste-texto-es", "3. SOLO ESPAÑOL CAMBIADO");
afirmar((await page.getByTestId("aviso-idioma-desalineado").count()) === 1, "aparece el aviso en el editor de ajustes");
await page.fill("#ajuste-justificacion", "Prueba");
await page.click('button:has-text("Guardar ajuste")');
await page.waitForSelector("text=Solo cambió un idioma", { timeout: 5000 });
afirmar(true, "pide confirmar antes de guardar un ajuste con un solo idioma");
await page.getByTestId("confirmar-cancelar").click();
afirmar(fixtures.tablas.convenio_hcp_ajustes_clausula.length === 1, "al cancelar no se guardó el ajuste del numeral 3");

console.log("B. Segundo ajuste del mismo anexo (el borrado previo falla en silencio → duplicado)");
fixtures.tablas.convenio_hcp_ajustes_clausula.push({ ...fixtures.tablas.convenio_hcp_ajustes_clausula[0] });
await page.locator("#convenio-hcp-seccion-ajuste").click();
await page.getByRole("option", { name: /Anexo C/ }).click();
await page.locator("#convenio-hcp-seccion-ajuste").click();
await page.getByRole("option", { name: /Anexo D/ }).click();
await page.fill("#ajuste-texto-es", "ANEXO D ES SEGUNDA VERSION");
await page.fill("#ajuste-texto-en", "EXHIBIT D EN SECOND VERSION");
await page.fill("#ajuste-justificacion", "Otra vez");
await page.click('button:has-text("Guardar ajuste")');
await page.waitForTimeout(1200);
t = await textoImpresion();
afirmar(t.includes("ANEXO D ES SEGUNDA VERSION"), "la impresión muestra la ÚLTIMA versión del ajuste");

console.log("C. Convenio Devuelto: editar Considerando, Anexo A y Anexo B, guardar, y revisar la impresión");
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
fixtures.tablas.convenios_hcp[0].estado = "Devuelto";
fixtures.tablas.convenio_hcp_ajustes_clausula.length = 0;
await page.reload();
await page.screenshot({ path: `${SALIDA}/reload.png` });
if (await page.locator("#email").count()) {
  await page.fill("#email", "admin.prueba@bausch.com");
  await page.fill("#password", "clave-segura-123");
  await resolverCaptchaLogin(page);
  await page.click('button[type="submit"]');
}
await page.waitForSelector("text=Simposio Reciente 2026", { timeout: 10000 });
await page.getByTestId("tablero-filtro-tipo").click();
await page.getByTestId("tablero-filtro-tipo-convenioHCP").click();
await page.keyboard.press("Escape");
await abrirDoc();
await page.click('button:has-text("Editar borrador")');
await page.waitForSelector("text=Guardar borrador", { timeout: 8000 });
await page.waitForTimeout(1500);
await page.fill("#cvhcp-considerando-es", "CONSIDERANDO MODIFICADO ES");
await page.fill("#cvhcp-whereas-en", "WHEREAS MODIFIED EN");
await page.fill("#cvhcp-servicios-es", "SERVICIOS MODIFICADOS ES");
await page.fill("#cvhcp-comentarios-es", "COMENTARIOS PAGO MODIFICADOS ES");
await page.waitForTimeout(500);
afirmar((await page.getByTestId("aviso-idioma-desalineado").count()) === 1, "formulario: avisa solo en el Anexo A (cambiado en un idioma); el Considerando, con los dos idiomas, no avisa. (El Anexo B del fixture parte vacío y el sistema lo autogenera en ambos idiomas, por eso no avisa.)");
await page.fill("#cvhcp-cierre-es", "CIERRE SOLO ES");
afirmar((await page.getByTestId("aviso-idioma-desalineado").count()) === 2, "formulario: aviso adicional cuando solo cambia el cierre en español");
await page.fill("#cvhcp-cierre-en", "CLOSING EN CHANGED TOO");
await page.screenshot({ path: `${SALIDA}/c1.png` });
await page.click('button:has-text("Guardar borrador")');
await page.waitForTimeout(1500);
const f = fixtures.tablas.convenios_hcp[0];
console.log("   DB:", f.objetivo_consultoria, "|", f.objetivo_consultoria_en, "|", f.servicios_exhibit_a, "|", f.comentarios_pago);
afirmar(f.objetivo_consultoria === "CONSIDERANDO MODIFICADO ES", "la base guarda el Considerando modificado");
afirmar(f.servicios_exhibit_a === "SERVICIOS MODIFICADOS ES", "la base guarda el Anexo A modificado");
await abrirDoc();
t = await textoImpresion();
afirmar(t.includes("CONSIDERANDO MODIFICADO ES"), "impresión: Considerando ES modificado");
afirmar(t.includes("SERVICIOS MODIFICADOS ES"), "impresión: Anexo A modificado");
afirmar(t.includes("COMENTARIOS PAGO MODIFICADOS ES"), "impresión: comentarios de pago modificados");
afirmar(!t.includes("CONSIDERANDO ORIGINAL"), "impresión: sin Considerando original");
console.log("   errores de página:", errores);
await browser.close();
if (fallas) process.exit(1);
console.log("Todas las verificaciones pasaron.");
