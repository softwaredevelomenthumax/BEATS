#!/usr/bin/env node
// Entrega 16 (octubre 2026) — verifica el Expediente del evento (reemplaza al
// antiguo "Repositorio del evento — archivos") y el flujo de CAF elaborado en
// el aplicativo corporativo. Todo contra fixtures locales — nunca Supabase real.
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
      fecha_inicio_evento: hoy, fecha_fin_evento: hoy, numero_asistentes: 40, modalidad_sesiones: "Única sesión",
      entrega_muestras_medicas: true, participacion_academica: true, quien_dicta_actividad: "Speaker externo",
    }],
    evento_aprobaciones: [], sesiones_evento: [], evento_muestras_planeadas: [], eventos_codigos_acceso: [],
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
    registros_participacion: [], registros_fuerza_ventas: [],
    paises_region: [{ id: "pr-1", pais: "Colombia" }],
  },
  rpc: {},
};

let fallas = 0;
const afirmar = (c, m) => { if (c) console.log(`  OK  ${m}`); else { console.error(`  X   ${m}`); fallas++; } };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push(m.text()); });
await interceptarSupabase(page, fixtures);

console.log("1. Login");
await page.goto(pathToFileURL(rutaBundle).href);
await page.fill("#email", "admin.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Tablero", { timeout: 5000 });

console.log("2. CAF elaborado en el aplicativo corporativo");
await page.click('button:has-text("CAF")');
await page.waitForSelector("text=Nuevo CAF", { timeout: 5000 });
await page.locator("#caf-evento-origen").click();
await page.getByRole("option", { name: /Simposio de Catarata 2026/ }).click();
await page.waitForSelector('[data-testid="caf-pregunta-modalidad"]', { timeout: 3000 });
afirmar(true, "tras elegir el evento se pregunta dónde se elabora el CAF");
await page.getByTestId("caf-modalidad-corporativo").click();
await page.waitForSelector('[data-testid="caf-banner-corporativo"]', { timeout: 3000 });
afirmar(await page.getByLabel("Nombre del solicitante *").isDisabled(), "los campos del formulario quedan inhabilitados");
const comentarios = await page.locator("textarea").evaluateAll((els) => els.map((e) => e.value));
afirmar(comentarios.includes("El CAF será elaborado desde el aplicativo CAF corporativo"), "Comentarios se carga con el texto del aplicativo corporativo");
await page.locator("#caf-speaker").click();
await page.getByRole("option", { name: /Camila Reyes/ }).click();
await page.click('button:has-text("Enviar a aprobación")');
await page.waitForTimeout(600);
const caf = fixtures.tablas.cafs[0];
afirmar(!!caf, "el CAF se guardó");
afirmar(caf?.estado === "Aprobado", `estado Aprobado sin cadena de aprobación (estado: ${caf?.estado})`);
afirmar(caf?.elaborado_en_caf_corporativo === true, "marcado como elaborado en CAF corporativo");
afirmar(fixtures.tablas.caf_aprobaciones.length === 0, "no se crearon etapas de aprobación (no hay notificaciones al flujo)");

console.log("3. Abrir el Expediente del evento");
await page.keyboard.press("Escape");
await page.click('button:has-text("Tablero")');
await page.waitForSelector("text=Simposio de Catarata 2026", { timeout: 5000 });
await page.click("text=Simposio de Catarata 2026");
await page.waitForSelector('[data-testid="tarjeta-expediente"]', { timeout: 5000 });
afirmar(!(await page.isVisible("text=Repositorio del evento — archivos")), "ya no existe el panel antiguo");
await page.click('[data-testid="tarjeta-expediente"] button:has-text("Abrir expediente")');
await page.waitForSelector('[data-testid="expediente-evento"]', { timeout: 5000 });
afirmar(await page.isVisible('[data-testid="exp-avance"]'), "se ve la barra de avance");
await page.getByRole("tab", { name: /Financiero/ }).waitFor({ timeout: 5000 });
for (const t of ["Resumen", "Documentos del sistema", "Speakers", "Asistencia", "Fotos", "Financiero"]) {
  afirmar((await page.getByRole("tab", { name: new RegExp(t) }).count()) === 1, `pestaña ${t}`);
}

console.log("4. Documentos del sistema");
await page.getByRole("tab", { name: /Documentos del sistema/ }).click();
await page.waitForSelector('[data-testid="exp-documentos"]');
const docsTxt = await page.getByTestId("exp-documentos").innerText();
afirmar(/FMV/.test(docsTxt) && /Convenio/.test(docsTxt) && /CAF/.test(docsTxt), "lista FMV, Convenio y CAF generados en la app");

console.log("5. Speakers: presentación 'No aplica' con motivo");
await page.getByRole("tab", { name: /Speakers/ }).click();
const spk = page.getByTestId("exp-speaker-Dra. Camila Reyes");
await spk.waitFor({ timeout: 3000 });
const pres = page.getByTestId("exp-pres-Dra. Camila Reyes");
await pres.getByRole("button", { name: "No aplica presentación" }).click();
await pres.getByRole("button", { name: /Guardar/ }).click();
await page.waitForTimeout(300);
afirmar(fixtures.tablas.evento_repositorio_archivos.length === 0, "exige motivo: sin motivo no se guarda");
await pres.getByPlaceholder("Motivo").fill("Actividad sin presentación formal.");
await pres.getByRole("button", { name: /Guardar/ }).click();
await page.waitForTimeout(500);
const fila = fixtures.tablas.evento_repositorio_archivos[0];
afirmar(fila?.no_aplica === true && fila?.categoria === "presentacionAprobada" && fila?.speaker_id === "spk-1", "se guarda 'No aplica' con motivo y speaker");
afirmar(fila?.no_aplica_motivo === "ACTIVIDAD SIN PRESENTACIÓN FORMAL." /* entrega 32: los campos de texto se guardan en MAYÚSCULAS */, "el motivo queda registrado");

console.log("6. Factura única con archivo y registro (fecha, número, valor)");
const fac = page.getByTestId("exp-facturas-Dra. Camila Reyes");
await fac.scrollIntoViewIfNeeded();
await fac.locator('input[type="file"]').setInputFiles({ name: "factura.png", mimeType: "image/png", buffer: PNG });
await page.waitForTimeout(400);
await fac.getByPlaceholder("Número").fill("FAC-900");
await fac.locator('input[type="date"]').fill(hoy);
await fac.locator('input[inputmode="decimal"]').fill("3000000");
await fac.getByRole("combobox").first().click();
await page.getByRole("option", { name: "COP", exact: true }).click();
await fac.getByRole("button", { name: "Agregar factura" }).click();
await page.waitForTimeout(500);
const fin = fixtures.tablas.evento_registros_financieros[0];
afirmar(fin?.numero === "FAC-900" && fin?.categoria === "facturas", "la factura se registra en evento_registros_financieros");
afirmar(fin?.speaker_id === "spk-1", "la factura queda ligada al speaker");

console.log("7. Asistencia y Fotos");
await page.getByRole("tab", { name: /Asistencia/ }).click();
await page.waitForSelector('[data-testid="exp-asistentes-impactados"]', { timeout: 3000 });
afirmar(true, "pestaña Asistencia muestra el total de asistentes impactados");
afirmar((await page.getByTestId("tabla-asistencia").count()) === 1, "la lista de asistencia se ve en tabla");
afirmar((await page.getByTestId("asistencia-generar-pdf").count()) === 1, "hay botón para generar el PDF de la lista de asistencia");
await page.getByTestId("asistencia-generar-pdf").click();
await page.waitForSelector('[data-testid="declaracion-asistencia"]', { timeout: 3000 });
afirmar(await page.getByTestId("informe-encabezado-evento").isVisible(), "el PDF trae el encabezado del evento y la declaración única");
await page.keyboard.press("Escape");
afirmar((await page.getByRole("tab", { name: /Muestra médica/ }).count()) === (EVENTO_ENTREGA_MUESTRAS ? 1 : 0), "la pestaña Muestra médica solo aparece si el evento entrega muestras");
await page.getByRole("tab", { name: /Muestra médica/ }).click();
await page.waitForSelector('[data-testid="tabla-muestras"]', { timeout: 3000 });
afirmar(await page.getByTestId("muestra-generar-pdf").isVisible(), "Muestra médica: tabla y botón de PDF");
await page.getByRole("tab", { name: /Asistencia/ }).click();
await page.getByRole("tab", { name: /Fotos/ }).click();
for (const k of ["grupal", "actividad_1", "actividad_2", "speaker"]) {
  afirmar((await page.getByTestId(`exp-foto-evento-${k}`).count()) === 1, `marco de foto: ${k}`);
}
await page.getByRole("tab", { name: /Financiero/ }).click();
await page.waitForSelector('[data-testid="exp-financiero"]', { timeout: 3000 });
afirmar(true, "pestaña Financiero");

afirmar(errores.length === 0, `sin errores de consola/página (${errores.length})`);
if (errores.length) console.error(errores.join("\n"));
await browser.close();
if (fallas) { console.error(`\n${fallas} verificación(es) fallaron.`); process.exit(1); }
console.log("\nTodas las verificaciones pasaron.");
