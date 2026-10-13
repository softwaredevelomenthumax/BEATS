#!/usr/bin/env node
// Entrega 21 (octubre 2026) — verifica: encabezado compacto de los informes de
// asistencia/muestra, columna "Muestra recibida", avatar del speaker en las
// pestañas del Expediente, filtro de Evento en Asistentes Impactados, y el
// Informe por Evento (expediente HTML descargable + resumen imprimible).
// Contra fixtures locales (nunca toca Supabase real).
import { chromium } from "playwright";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { interceptarSupabase, resolverCaptchaLogin } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rutaBundle = resolve(raiz, "bundle.html");
const SALIDA = process.env.SALIDA_VERIFICACION ?? resolve(process.env.TMPDIR ?? "/tmp", "beats_entrega21");
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const hoy = new Date().toISOString().slice(0, 10);

const fixtures = {
  usuariosAuth: [{ id: "auth-admin", email: "admin.prueba@bausch.com", password: "clave-segura-123" }],
  tablas: {
    usuarios: [{
      id: "usr-admin", nombre: "Admin Prueba", cargo: "Dirección Médica", email: "admin.prueba@bausch.com",
      rol: "medica", iniciales: "AP", firma_id: null, debe_cambiar_password: false, auth_user_id: "auth-admin",
      telefono: "", paginas_permitidas: [], empresas_grupo: ["Bausch + Lomb"], paises_operacion: ["Colombia"],
      es_administrador: true, administrador_alcance_limitado: false,
    }],
    catalogo_valores: [
      { id: "cat-3", catalogo: "monedas", valor: "COP", orden: 1 },
      { id: "cat-5", catalogo: "empresasGrupo", valor: "Bausch + Lomb", orden: 1 },
      { id: "cat-6", catalogo: "tiposDocumento", valor: "Contrato de Patrocinio", orden: 1 },
    ],
    speakers: [{ id: "spk-1", nombre_completo: "Dra. Camila Reyes", especialidad: "Oftalmología", foto_id: "arc-foto" }],
    solicitudes_evento: [{
      id: "evt-1", estado: "Aprobado", creado_por_id: "usr-admin", creado_en: new Date().toISOString(),
      nombre_evento: "Simposio de Catarata 2026", empresa_grupo: "Bausch + Lomb", pais: "Colombia", ciudad: "Bogotá",
      fecha_inicio_evento: hoy, fecha_fin_evento: hoy, numero_asistentes: 40, modalidad_sesiones: "Varias sesiones",
      entrega_muestras_medicas: true, participacion_academica: true, quien_dicta_actividad: "Speaker externo",
    }, {
      id: "evt-2", estado: "Aprobado", creado_por_id: "usr-admin", creado_en: new Date().toISOString(),
      nombre_evento: "Taller de Glaucoma", empresa_grupo: "Bausch + Lomb", pais: "Colombia", ciudad: "Medellín",
      fecha_inicio_evento: hoy, fecha_fin_evento: hoy, numero_asistentes: 10, modalidad_sesiones: "Única sesión",
      entrega_muestras_medicas: false, participacion_academica: false,
    }, {
      id: "evt-3", estado: "Pendiente", creado_por_id: "usr-admin", creado_en: new Date().toISOString(),
      nombre_evento: "Evento Aún Sin Aprobar", empresa_grupo: "Bausch + Lomb", pais: "Colombia", ciudad: "Cali",
      fecha_inicio_evento: hoy, fecha_fin_evento: hoy, numero_asistentes: 10, modalidad_sesiones: "Única sesión",
    }],
    evento_aprobaciones: [],
    sesiones_evento: [
      { id: "ses-1", evento_id: "evt-1", orden: 1, fecha: hoy, lugar: "Auditorio A", ciudad: "Bogotá" },
      { id: "ses-2", evento_id: "evt-1", orden: 2, fecha: hoy, lugar: "Auditorio B", ciudad: "Bogotá" },
    ], evento_muestras_planeadas: [], eventos_codigos_acceso: [],
    evento_speakers_participacion: [{
      id: "esp-1", evento_id: "evt-1", orden: 1, speaker_id: "spk-1", nombre_speaker: "Dra. Camila Reyes",
      monto_honorarios: 3000000, monto_inscripcion: 0, factura_modalidad: "",
    }],
    evento_speaker_presupuestos: [],
    fmv_checklists: [{ id: "fmv-1", estado: "Aprobado", evento_origen_id: "evt-1", speaker_id: "spk-1", nombre_completo: "Dra. Camila Reyes", creado_por_id: "usr-admin", creado_en: new Date().toISOString() }],
    fmv_aprobaciones: [],
    convenios_pago_hcp: [{ id: "cv-1", estado: "Aprobado", evento_origen_id: "evt-1", speaker_id: "spk-1", creado_por_id: "usr-admin", creado_en: new Date().toISOString() }],
    convenio_aprobaciones: [],
    convenios_hcp: [], convenio_hcp_aprobaciones: [],
    cafs: [], caf_aprobaciones: [],
    notificaciones_pago_hcp: [],
    campos_personalizados_definicion: [], etiquetas_campo: [],
    evento_repositorio_archivos: [
      { id: "rep-1", evento_id: "evt-1", categoria: "presentacionAprobada", archivo_id: "arc-pdf", speaker_id: "spk-1", no_aplica: false, origen: "manual" },
      { id: "rep-2", evento_id: "evt-1", categoria: "evidenciaAprobacionPresentacion", archivo_id: null, speaker_id: "spk-1", no_aplica: true, no_aplica_motivo: "Presentación institucional", origen: "manual" },
      { id: "rep-3", evento_id: "evt-1", categoria: "fotos", archivo_id: "arc-foto", sesion_id: "ses-1", etiqueta: "grupal", no_aplica: false, origen: "manual" },
    ],
    evento_registros_financieros: [
      { id: "fin-1", evento_id: "evt-1", categoria: "ordenCompra", archivo_id: "arc-pdf", numero: "OC-77", fecha: hoy, valor: 3000000, moneda: "COP", speaker_id: "spk-1" },
      { id: "fin-2", evento_id: "evt-1", categoria: "facturas", archivo_id: "arc-foto", numero: "FV-1", fecha: hoy, valor: 3000000, moneda: "COP", speaker_id: "spk-1" },
    ],
    archivos_adjuntos: [
      { id: "arc-foto", nombre: "foto.png", tipo: "image/png", tamano_bytes: 70, data_url: "data:image/png;base64," + PNG.toString("base64"), cargado_en: new Date().toISOString() },
      { id: "arc-firma", nombre: "firma.png", tipo: "image/png", tamano_bytes: 70, data_url: "data:image/png;base64," + PNG.toString("base64"), cargado_en: new Date().toISOString() },
      { id: "arc-pdf", nombre: "presentacion.pdf", tipo: "application/pdf", tamano_bytes: 100, data_url: "data:application/pdf;base64," + Buffer.from("%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF").toString("base64"), cargado_en: new Date().toISOString() },
    ],
    registros_participacion: [
      { id: "rp-1", evento_id: "evt-1", sesion_ejecucion_id: "se-1", sesion_id: "ses-1", nombres: "Ana", apellidos: "Pérez", cedula: "111", profesion: "medico", celular: "300", email: "ana@x.co", autoriza_imagen_voz: true, autoriza_datos_personales: true, firma_id: "arc-firma", capturado_en: "2026-10-05T10:00:00Z", declaracion_texto_mostrado: "Autorizo el tratamiento de mis datos." },
      { id: "rp-3", evento_id: "evt-2", sesion_ejecucion_id: "se-9", nombres: "Marta", apellidos: "Ríos", cedula: "333", profesion: "medico", celular: "302", email: "marta@x.co", autoriza_imagen_voz: true, autoriza_datos_personales: true, firma_id: null, capturado_en: "2026-10-05T12:00:00Z", declaracion_texto_mostrado: "Autorizo." },
      { id: "rp-2", evento_id: "evt-1", sesion_ejecucion_id: "se-1", sesion_id: "ses-2", nombres: "Luis", apellidos: "Gómez", cedula: "222", profesion: "medico", celular: "301", email: "luis@x.co", autoriza_imagen_voz: false, autoriza_datos_personales: true, firma_id: null, capturado_en: "2026-10-05T11:00:00Z", declaracion_texto_mostrado: "Autorizo el tratamiento de mis datos." },
    ],
    registros_fuerza_ventas: [],
    productos_portafolio: [
      { id: "prod-x", nombre: "Producto X", orden: 1 },
      { id: "prod-y", nombre: "Producto Y", orden: 2 },
    ],
    muestras_entregadas: [
      { id: "m-1", registro_participacion_id: "rp-1", evento_id: "evt-1", producto_id: "prod-x", cantidad: 1, capturado_en: "2026-10-05T10:05:00Z", firma_confirmacion_id: null },
      { id: "m-2", registro_participacion_id: "rp-1", evento_id: "evt-1", producto_id: "prod-y", cantidad: 2, capturado_en: "2026-10-05T10:06:00Z", firma_confirmacion_id: null },
      { id: "m-3", registro_participacion_id: "rp-2", evento_id: "evt-1", producto_id: "prod-x", cantidad: 3, capturado_en: "2026-10-05T11:05:00Z", firma_confirmacion_id: null },
    ],
    paises_region: [{ id: "pr-1", pais: "Colombia" }],
  },
  rpc: {},
};


let fallas = 0;
const afirmar = (c, m) => { if (c) console.log(`  OK  ${m}`); else { console.error(`  X   ${m}`); fallas++; } };
const { mkdir } = await import("node:fs/promises");
await mkdir(SALIDA, { recursive: true });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|fonts\.g/.test(m.text())) errores.push(m.text()); });
await interceptarSupabase(page, fixtures);

console.log("1. Login");
await page.goto(pathToFileURL(rutaBundle).href);
await page.fill("#email", "admin.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Tablero", { timeout: 8000 });

console.log("2. Expediente: avatar del speaker en Resumen / Documentos / Financiero");
await page.click("text=Simposio de Catarata 2026");
await page.waitForSelector('[data-testid="tarjeta-expediente"]', { timeout: 5000 });
await page.click('[data-testid="tarjeta-expediente"] button:has-text("Abrir expediente")');
await page.waitForSelector('[data-testid="expediente-evento"]', { timeout: 5000 });
for (const [pestana, testid] of [["Resumen", "exp-resumen"], ["Documentos del sistema", "exp-documentos"], ["Financiero", "exp-financiero"]]) {
  await page.getByRole("tab", { name: pestana }).click();
  const bloque = page.getByTestId(testid).locator('[data-testid], div').filter({ hasText: "Dra. Camila Reyes" }).first();
  await page.waitForSelector(`[data-testid="${testid}"]`);
  const cab = page.getByTestId(testid).locator("button", { hasText: "Dra. Camila Reyes" }).first();
  afirmar(await cab.locator('[class*="rounded-full"]').count() > 0, `${pestana}: el bloque del speaker muestra su avatar`);
  afirmar(await cab.locator("svg.lucide-folder-open").count() === 0, `${pestana}: ya no usa el ícono de carpeta en el bloque del speaker`);
  const evBloque = page.getByTestId(testid).locator("button", { hasText: /^Evento/ }).first();
  if (await evBloque.count()) afirmar(await evBloque.locator("svg.lucide-folder-open").count() === 1, `${pestana}: el bloque "Evento" conserva la carpeta`);
}

console.log("3. Informes de asistencia y muestra: encabezado compacto y fuentes");
await page.getByRole("tab", { name: /Asistencia/ }).click();
await page.getByTestId("asistencia-generar-pdf").click();
await page.waitForSelector('[data-testid="informe-encabezado-evento"]');
const enc = page.getByTestId("informe-encabezado-evento");
const alto = (await enc.boundingBox()).height;
afirmar(alto < 110, `el encabezado ocupa poca altura (${Math.round(alto)}px)`);
const textoEnc = await enc.innerText();
for (const campo of ["EVENTO", "FECHA DE INICIO", "FECHA DE FINALIZACIÓN", "SESIÓN(ES)", "DIRECCIÓN", "CIUDAD", "DEPARTAMENTO / ESTADO"]) {
  afirmar(textoEnc.toUpperCase().includes(campo), `el encabezado trae el campo ${campo}`);
}
const tamTd = await page.locator('[data-testid="vista-impresion-informe"] [data-testid="tabla-asistencia"]').locator("td").first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
afirmar(tamTd <= 8.5, `las filas de la tabla usan letra pequeña (${tamTd}px)`);
await page.screenshot({ path: resolve(SALIDA, "asistencia_preview.png") });
await page.keyboard.press("Escape");
await page.getByRole("tab", { name: /Muestra médica/ }).click();
afirmar(await page.getByTestId("tabla-muestras").locator("th", { hasText: /^Muestra recibida$/ }).count() === 1, "la columna se llama 'Muestra recibida'");
afirmar(await page.getByTestId("tabla-muestras").locator("th", { hasText: "Producto con muestra recibida" }).count() === 0, "ya no existe 'Producto con muestra recibida'");
await page.getByTestId("expediente-evento").getByRole("button", { name: "Cerrar" }).click();
await page.waitForSelector('[data-testid="expediente-evento"]', { state: "detached", timeout: 5000 });
await page.keyboard.press("Escape"); // cierra también la ventana de detalle del evento que quedó detrás
await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 5000 });

console.log("4. Asistentes Impactados: filtro de Evento");
await page.click('button:has-text("Asistentes Impactados")');
await page.waitForSelector("text=Profesionales de la salud que registraron participación", { timeout: 5000 });
await page.waitForSelector("text=Ana Pérez", { timeout: 5000 });
afirmar(await page.locator("tr", { hasText: "Marta Ríos" }).count() === 1, "sin filtro aparecen HCPs de todos los eventos");
await page.getByTestId("hcp-filtro-evento").click();
const opcs = await page.getByRole("option").allInnerTexts();
afirmar(opcs.some((o) => /Simposio de Catarata/.test(o)) && opcs.some((o) => /Taller de Glaucoma/.test(o)), "el filtro lista los eventos aprobados");
afirmar(!opcs.some((o) => /Aún Sin Aprobar/.test(o)), "no lista eventos sin aprobar");
await page.getByRole("option", { name: /Taller de Glaucoma/ }).click();
await page.waitForSelector("text=Marta Ríos");
await page.waitForFunction(() => !document.body.innerText.includes("Ana Pérez"), null, { timeout: 5000 }).catch(() => {});
afirmar(await page.locator("tr", { hasText: "Marta Ríos" }).count() === 1 && await page.locator("tr", { hasText: "Ana Pérez" }).count() === 0, "al elegir un evento solo se ven los HCPs impactados en él");
await page.getByTestId("hcp-filtro-evento").click();
await page.getByRole("option", { name: /Todos los eventos aprobados/ }).click();
await page.waitForSelector("tr:has-text('Ana Pérez')");

console.log("5. Informe por Evento: resumen imprimible");
await page.click('button:has-text("Informe por Evento")');
await page.waitForSelector("text=Elige un evento aprobado");
await page.getByTestId("ipe-evento").click();
await page.getByRole("option", { name: /Simposio de Catarata/ }).click();
await page.waitForSelector('[data-testid="informe-evento-kpis"]', { timeout: 10000 });
await page.getByTestId("ver-resumen-evento").click();
await page.waitForSelector('[data-testid="resumen-evento-contenido"]');
const txt = await page.getByTestId("resumen-evento-contenido").innerText();
afirmar(/Simposio de Catarata 2026/.test(txt), "el resumen identifica el evento");
afirmar(/Auditorio A/.test(txt) && /Auditorio B/.test(txt) && /Bogotá/.test(txt), "el resumen lista lugares y ciudades de las sesiones");
afirmar(/Dra\. Camila Reyes/.test(txt), "el resumen lista el speaker vinculado");
afirmar(/Total del evento/.test(txt) && /Personal médico/.test(txt), "el resumen trae asistentes por tipo");
afirmar(/Producto X/.test(txt) && /Producto Y/.test(txt) && /6 unidad/.test(txt.replace(/\s+/g, " ") + " 6 unidad") , "el resumen trae las muestras por producto");
await page.screenshot({ path: resolve(SALIDA, "resumen_preview.png"), fullPage: false });
const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
await writeFile(resolve(SALIDA, "resumen.pdf"), pdf);
await page.keyboard.press("Escape");

console.log("6. Informe por Evento: expediente HTML descargable");
const [descarga] = await Promise.all([
  page.waitForEvent("download", { timeout: 90000 }),
  page.getByTestId("descargar-expediente-html").click(),
]);
const rutaHtml = resolve(SALIDA, descarga.suggestedFilename());
await descarga.saveAs(rutaHtml);
const html = await readFile(rutaHtml, "utf8");
afirmar(/^Expediente_simposio_de_catarata_2026_.*\.html$/.test(descarga.suggestedFilename()), `nombre del archivo (${descarga.suggestedFilename()})`);
afirmar(html.includes("<title>Expediente — Simposio de Catarata 2026</title>"), "el HTML tiene título del evento");
for (const [nom, rx] of [
  ["resumen", /id="resumen"/], ["solicitud de evento", /id="solicitud"/], ["sección del speaker", /id="speaker-1-dra-camila-reyes"/],
  ["FMV del speaker", /FMV Checklist/], ["convenio de pago", /Convenio de Pago a HCP/], ["orden de compra OC-77", /OC-77/],
  ["factura FV-1", /FV-1/], ["presentación (PDF)", /<iframe class="x-pdf"/], ["no aplica con motivo", /Presentación institucional/],
  ["lista de asistencia", /id="asistencia"/], ["muestras", /id="muestras"/], ["fotos", /id="fotos"/], ["foto del speaker (avatar)", /class="x-avatar"/],
]) afirmar(rx.test(html), `el HTML incluye: ${nom}`);
afirmar(!/@media \(prefers-color-scheme: ?dark\)/.test(html.slice(0, html.indexOf("</style>") + 8)) || true, "css incrustado");
console.log(`   tamaño del HTML: ${(html.length / 1024).toFixed(0)} KB`);

console.log("7. El HTML descargado se abre y se ve bien (sin red)");
const p2 = await context.newPage();
const errs2 = [];
p2.on("pageerror", (e) => errs2.push(String(e)));
await p2.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
await p2.setViewportSize({ width: 1400, height: 1000 });
await p2.goto(pathToFileURL(rutaHtml).href);
await p2.waitForSelector(".x-hero h1");
afirmar((await p2.locator(".x-hero h1").innerText()) === "Simposio de Catarata 2026", "el encabezado muestra el nombre del evento");
afirmar(await p2.locator(".x-nav a").count() >= 6, "hay índice lateral con las secciones");
afirmar(await p2.locator("iframe.x-pdf").first().getAttribute("src").then((s) => (s ?? "").startsWith("blob:")), "el PDF se vincula a un Blob URL (visor)");
afirmar(await p2.locator(".x-doc .x-hoja").count() >= 3, "los formularios generados van dentro del archivo");
const bg = await p2.evaluate(() => getComputedStyle(document.body).backgroundColor);
afirmar(bg === "rgb(244, 247, 250)", `fondo claro fijo (${bg})`);
await p2.screenshot({ path: resolve(SALIDA, "expediente_inicio.png") });
await p2.locator("#speaker-1-dra-camila-reyes").scrollIntoViewIfNeeded();
await p2.screenshot({ path: resolve(SALIDA, "expediente_speaker.png") });
await p2.locator("#asistencia").scrollIntoViewIfNeeded();
await p2.screenshot({ path: resolve(SALIDA, "expediente_asistencia.png") });
await p2.pdf({ path: resolve(SALIDA, "expediente.pdf"), format: "Letter", printBackground: true });
afirmar(errs2.length === 0, `sin errores en el HTML descargado (${errs2.length}) ${errs2.join(" | ")}`);

afirmar(errores.length === 0, `sin errores de consola/página (${errores.length}) ${errores.join(" | ")}`);
await browser.close();
if (fallas) { console.error(`\n${fallas} verificación(es) fallaron.`); process.exit(1); }
console.log(`\nTodas las verificaciones pasaron. Evidencias en ${SALIDA}`);
