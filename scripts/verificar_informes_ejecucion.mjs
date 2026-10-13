#!/usr/bin/env node
// Entrega 18 (octubre 2026) — verifica los informes de Ejecución del Expediente:
// lista de asistencia y muestra médica en hoja HORIZONTAL, interruptor de
// encabezado (Sí/No), declaración en letra pequeña, una fila por ENTREGA de
// producto, alcance global/por sesión y exportación CSV. Contra fixtures locales.
import { chromium } from "playwright";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { interceptarSupabase, resolverCaptchaLogin } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rutaBundle = resolve(raiz, "bundle.html");
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const EVENTO_ENTREGA_MUESTRAS = true;
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
    speakers: [{ id: "spk-1", nombre_completo: "Dra. Camila Reyes", especialidad: "Oftalmología" }],
    solicitudes_evento: [{
      id: "evt-1", estado: "Aprobado", creado_por_id: "usr-admin", creado_en: new Date().toISOString(),
      nombre_evento: "Simposio de Catarata 2026", empresa_grupo: "Bausch + Lomb", pais: "Colombia", ciudad: "Bogotá",
      fecha_inicio_evento: hoy, fecha_fin_evento: hoy, numero_asistentes: 40, modalidad_sesiones: "Varias sesiones",
      entrega_muestras_medicas: true, participacion_academica: true, quien_dicta_actividad: "Speaker externo",
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
    fmv_checklists: [{ id: "fmv-1", estado: "Aprobado", evento_origen_id: "evt-1", creado_por_id: "usr-admin", creado_en: new Date().toISOString() }],
    fmv_aprobaciones: [],
    convenios_pago_hcp: [{ id: "cv-1", estado: "Aprobado", evento_origen_id: "evt-1", speaker_id: "spk-1", creado_por_id: "usr-admin", creado_en: new Date().toISOString() }],
    convenio_aprobaciones: [],
    convenios_hcp: [], convenio_hcp_aprobaciones: [],
    cafs: [], caf_aprobaciones: [],
    notificaciones_pago_hcp: [],
    campos_personalizados_definicion: [], etiquetas_campo: [],
    evento_repositorio_archivos: [], evento_registros_financieros: [], archivos_adjuntos: [],
    registros_participacion: [
      { id: "rp-1", evento_id: "evt-1", sesion_ejecucion_id: "se-1", sesion_id: "ses-1", nombres: "Ana", apellidos: "Pérez", cedula: "111", profesion: "medico", celular: "300", email: "ana@x.co", autoriza_imagen_voz: true, autoriza_datos_personales: true, firma_id: null, capturado_en: "2026-10-05T10:00:00Z", declaracion_texto_mostrado: "Autorizo el tratamiento de mis datos." },
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

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push(m.text()); });
await interceptarSupabase(page, fixtures);

console.log("1. Login y apertura del Expediente");
await page.goto(pathToFileURL(rutaBundle).href);
await page.fill("#email", "admin.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Tablero", { timeout: 5000 });
await page.click("text=Simposio de Catarata 2026");
await page.waitForSelector('[data-testid="tarjeta-expediente"]', { timeout: 5000 });
await page.click('[data-testid="tarjeta-expediente"] button:has-text("Abrir expediente")');
await page.waitForSelector('[data-testid="expediente-evento"]', { timeout: 5000 });

async function leerCsv(boton) {
  const [descarga] = await Promise.all([page.waitForEvent("download"), page.getByTestId(boton).click()]);
  const { readFile } = await import("node:fs/promises");
  return { nombre: descarga.suggestedFilename(), texto: (await readFile(await descarga.path(), "utf8")).replace(/^\uFEFF/, "") };
}

console.log("2. Muestra médica: una fila por ENTREGA de producto");
await page.getByRole("tab", { name: /Muestra médica/ }).click();
await page.waitForSelector('[data-testid="tabla-muestras"]');
afirmar((await page.getByTestId("fila-muestra").count()) === 3, "3 entregas = 3 filas (el médico con 2 productos aparece en 2 filas)");
const filasTxt = await page.getByTestId("fila-muestra").allInnerTexts();
afirmar(filasTxt.filter((t) => /Ana Pérez/.test(t)).length === 2, "Ana Pérez (producto X y Y) tiene dos filas");
afirmar(filasTxt.some((t) => /Ana Pérez/.test(t) && /Producto X/.test(t)) && filasTxt.some((t) => /Ana Pérez/.test(t) && /Producto Y/.test(t)), "cada fila trae su producto");

console.log("3. Muestra médica: alcance global y por sesión");
await page.getByTestId("informe-muestra-alcance").click();
const opciones = await page.getByRole("option").allInnerTexts();
afirmar(opciones.some((o) => /Todo el evento \(global\)/.test(o)) && opciones.filter((o) => /Sesión/.test(o)).length === 2, "opciones: global + una por sesión");
await page.getByRole("option", { name: /Sesión 2/ }).click();
afirmar((await page.getByTestId("fila-muestra").count()) === 1, "Sesión 2: solo la entrega de Luis Gómez");
const csvS2 = await leerCsv("muestra-exportar-csv");
afirmar(/Luis Gómez/.test(csvS2.texto) && !/Ana Pérez/.test(csvS2.texto), "el CSV respeta el alcance seleccionado");
afirmar(/\.csv$/.test(csvS2.nombre) && /^Muestra_medica_simposio_de_catarata_2026_sesion_2_\d{4}/.test(csvS2.nombre), `nombre de archivo CSV (${csvS2.nombre})`);
await page.getByTestId("informe-muestra-alcance").click();
await page.getByRole("option", { name: /Todo el evento/ }).click();

console.log("4. Muestra médica: CSV global");
const csv = await leerCsv("muestra-exportar-csv");
const lineas = csv.texto.split("\r\n");
afirmar(lineas.length === 4, `encabezado + 3 filas (${lineas.length} líneas)`);
afirmar(lineas[0] === "Sesión,Nombres y Apellidos,Número de documento,Celular,Correo electrónico,Muestra recibida,Cantidad,Firma registrada", "encabezados del CSV (con columna Sesión en eventos de varias sesiones)");
afirmar(lineas.filter((l) => l.includes("Ana Pérez")).length === 2, "el CSV también repite al médico por cada producto");

console.log("5. Muestra médica: vista previa horizontal con interruptor de encabezado");
await page.getByTestId("muestra-generar-pdf").click();
await page.waitForSelector('[data-testid="vista-impresion-informe"]');
afirmar(await page.getByText("Incluir encabezado oficial (membrete)").isVisible(), "aparece el interruptor 'Incluir encabezado oficial (membrete)'");
afirmar(await page.getByTestId("membrete-informe").isVisible(), "por defecto el encabezado (membrete) se muestra");
const ancho = await page.locator("#zona-imprimible").evaluate((e) => e.getBoundingClientRect().width);
afirmar(ancho > 900, `la hoja en pantalla es horizontal (ancho ${Math.round(ancho)}px)`);
const reglaPagina = await page.evaluate(() => [...document.querySelectorAll("style[data-orientacion-impresion]")].map((s) => s.textContent).join(""));
afirmar(/landscape/.test(reglaPagina), "se inyecta @page { size: letter landscape } para imprimir/PDF");
await page.getByRole("radio", { name: "No", exact: true }).first().click();
afirmar((await page.getByTestId("membrete-informe").count()) === 0, "con 'No' desaparece el membrete");
afirmar(await page.locator("#zona-imprimible h1").first().isVisible(), "sin membrete queda el título simple del informe");
await page.keyboard.press("Escape");
afirmar((await page.evaluate(() => document.querySelectorAll("style[data-orientacion-impresion]").length)) === 0, "al cerrar la vista se retira la regla horizontal");

console.log("6. Lista de asistencia: horizontal, encabezado, declaración pequeña, CSV");
await page.getByRole("tab", { name: /Asistencia/ }).click();
await page.waitForSelector('[data-testid="tabla-asistencia"]');
const csvA = await leerCsv("asistencia-exportar-csv");
const lA = csvA.texto.split("\r\n");
afirmar(lA.length === 3 && /^Sesión,Nombres y Apellidos,Número de documento,Celular,Correo electrónico,Autoriza uso de imagen y voz,Autoriza tratamiento de datos,Firma registrada$/.test(lA[0]), "CSV de asistencia: encabezado + 2 filas");
afirmar(/Luis Gómez.*,No,Sí,No/.test(lA[2]), "el CSV refleja las autorizaciones (Sí/No)");
afirmar(/^Asistencia_/.test(csvA.nombre), `nombre de archivo CSV (${csvA.nombre})`);
await page.getByTestId("asistencia-generar-pdf").click();
await page.waitForSelector('[data-testid="declaracion-asistencia"]');
afirmar(await page.getByTestId("membrete-informe").isVisible(), "la lista de asistencia también tiene el interruptor y el membrete");
const tam = await page.getByTestId("declaracion-asistencia").evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
afirmar(tam <= 8, `la declaración usa letra pequeña (${tam}px)`);
const tamTabla = await page.getByTestId("tabla-asistencia").locator("td").first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
afirmar(tamTabla > tam, "la tabla de asistentes conserva un tamaño mayor que la declaración");
const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
const { writeFile } = await import("node:fs/promises");
const rutaPdf = resolve(process.env.TMPDIR ?? "/tmp", "asistencia_horizontal.pdf");
await writeFile(rutaPdf, pdf);
const dims = (await import("node:child_process")).execSync(`pdfinfo "${rutaPdf}" | grep "Page size"`).toString();
afirmar(/792 x 612|792\.0* x 612/.test(dims), `el PDF sale en Letter horizontal (${dims.trim()})`);
await page.keyboard.press("Escape");

afirmar(errores.length === 0, `sin errores de consola/página (${errores.length})`);
if (errores.length) console.error(errores.join("\n"));
await browser.close();
if (fallas) { console.error(`\n${fallas} verificación(es) fallaron.`); process.exit(1); }
console.log("\nTodas las verificaciones pasaron.");
