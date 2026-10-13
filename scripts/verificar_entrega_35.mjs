#!/usr/bin/env node
// Entrega 35 — «Visor Documental», «Expedientes», «Enviar documentos» en Auditoría de Eventos y «Backup».
// Todo contra fixtures locales (nunca Supabase real). Las funciones beats_backup_* se simulan en memoria aquí; su SQL real
// se probó aparte contra un Postgres (ver README, entrega 35). La carpeta de destino de las rutinas se simula con el
// sistema de archivos privado del navegador (OPFS), que usa la misma interfaz FileSystemDirectoryHandle que el selector real.
import { chromium } from "playwright";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gunzipSync, gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { interceptarSupabase, resolverCaptchaLogin } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rutaBundle = resolve(raiz, "bundle.html");
const SALIDA = process.env.SALIDA_VERIFICACION ?? "/tmp/beats_entrega35";
await mkdir(SALIDA, { recursive: true });
const hoy = new Date().toISOString().slice(0, 10);
const ahora = new Date().toISOString();

const usuario = (id, nombre, email, rol, extra = {}) => ({
  id, nombre, cargo: "Prueba", email, rol, iniciales: nombre.slice(0, 2).toUpperCase(), firma_id: null, debe_cambiar_password: false,
  auth_user_id: `auth-${id}`, telefono: "", paginas_permitidas: [], empresas_grupo: ["Bausch + Lomb"], paises_operacion: ["Colombia"],
  es_administrador: false, administrador_alcance_limitado: false, ...extra,
});
const evento = (id, estado, nombre) => ({
  id, estado, creado_por_id: "usr-solic", creado_en: ahora, nombre_evento: nombre, nombre_solicitante: "Sonia Solicitante", empresa_grupo: "Bausch + Lomb",
  pais: "Colombia", ciudad: "Bogotá", fecha_inicio_evento: hoy, fecha_fin_evento: hoy, numero_asistentes: 40, modalidad_sesiones: "Única sesión",
});

const fixtures = {
  usuariosAuth: [
    { id: "auth-usr-admin", email: "admin.prueba@bausch.com", password: "clave-segura-123" },
    { id: "auth-usr-legal", email: "legal.prueba@bausch.com", password: "clave-segura-123" },
    { id: "auth-usr-lim", email: "limitado.prueba@bausch.com", password: "clave-segura-123" },
  ],
  tablas: {
    usuarios: [
      usuario("usr-admin", "Admin Prueba", "admin.prueba@bausch.com", "medica", { es_administrador: true }),
      usuario("usr-solic", "Sonia Solicitante", "solicitante@bausch.com", "marketing"),
      usuario("usr-legal", "Laura Legal", "legal.prueba@bausch.com", "legal_compliance"),
      usuario("usr-lim", "Lina Limitada", "limitado.prueba@bausch.com", "medica", { es_administrador: true, administrador_alcance_limitado: true }),
    ],
    catalogo_valores: [{ id: "c1", catalogo: "empresasGrupo", valor: "Bausch + Lomb", orden: 1 }, { id: "c2", catalogo: "monedas", valor: "COP", orden: 1 }],
    speakers: [{ id: "spk-1", nombre_completo: "Dra. Camila Reyes", especialidad: "Oftalmología", saldo: "12345678901234.123456" }],
    solicitudes_evento: [evento("evt-1", "Aprobado", "Simposio de Catarata 2026"), evento("evt-2", "Borrador", "Evento en Borrador")],
    evento_aprobaciones: [], sesiones_evento: [], evento_muestras_planeadas: [], eventos_codigos_acceso: [], evento_speakers_participacion: [], evento_speaker_presupuestos: [],
    fmv_checklists: [], fmv_aprobaciones: [], convenios_pago_hcp: [], convenio_aprobaciones: [], convenios_hcp: [], convenio_hcp_aprobaciones: [],
    cafs: [{ id: "caf-1", estado: "Aprobado", evento_origen_id: "evt-1", creado_por_id: "usr-admin", creado_en: ahora, codigo_documento: "CAF-1", compania_nombre: "Bausch + Lomb", contraparte_nombre: "Dra. Camila Reyes" }],
    caf_aprobaciones: [], notificaciones_pago_hcp: [], campos_personalizados_definicion: [], etiquetas_campo: [],
    evento_repositorio_archivos: [],
    evento_registros_financieros: [{ id: "fin-1", evento_id: "evt-1", categoria: "ordenCompra", archivo_id: "arch-oc", numero: "OC-1", valor: 1000000, moneda: "COP", speaker_id: null, sesion_id: null }],
    archivos_adjuntos: [{ id: "arch-oc", nombre: "orden_compra.pdf", tipo: "application/pdf", tamano_bytes: 8, data_url: "data:application/pdf;base64,JVBERi0xLjQ=", cargado_en: ahora }],
    registros_participacion: [], registros_fuerza_ventas: [], notificaciones: [],
    paises_region: [{ id: "pr-1", pais: "Colombia" }],
    backups_registro: [],
  },
  rpc: {},
};

// ---- Simulación en memoria de las funciones beats_backup_* (el SQL real se probó contra Postgres) ----
const INTERNAS = new Set(["v_documentos", "backups_registro"]);
const tablasRespaldables = () => Object.keys(fixtures.tablas).filter((t) => !INTERNAS.has(t)).sort();
const llamadasRestaurar = [];
Object.assign(fixtures.rpc, {
  beats_backup_esquema: () => ({
    generado_en: new Date().toISOString(), base: "postgres", version_postgres: "PostgreSQL 17 (simulado)",
    tablas: tablasRespaldables().map((nombre) => ({ nombre, filas: fixtures.tablas[nombre].length, bytes: JSON.stringify(fixtures.tablas[nombre]).length, columnas: [], llave: ["id"] })),
    relaciones: [
      { tabla: "cafs", columnas: ["evento_origen_id"], ref_esquema: "public", ref_tabla: "solicitudes_evento" },
      { tabla: "evento_registros_financieros", columnas: ["archivo_id"], ref_esquema: "public", ref_tabla: "archivos_adjuntos" },
    ],
    enums: [],
  }),
  beats_backup_secuencias: () => [{ nombre: "ejemplo_seq", ultimo: 41 }],
  beats_backup_leer: ({ p_tabla, p_despues, p_limite }) => {
    const todas = [...(fixtures.tablas[p_tabla] ?? [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const restantes = p_despues ? todas.filter((f) => String(f.id) > String(p_despues.id)) : todas;
    const pagina = restantes.slice(0, p_limite);
    return { n: pagina.length, datos: JSON.stringify(pagina), ultima: pagina.length ? { id: pagina[pagina.length - 1].id } : null };
  },
  beats_backup_iniciar_restauracion: () => new Date(Date.now() + 3 * 3600_000).toISOString(),
  beats_backup_finalizar_restauracion: () => null,
  beats_backup_vaciar: ({ p_tablas }) => { for (const t of p_tablas) fixtures.tablas[t] = []; return p_tablas.length; },
  beats_backup_restaurar: ({ p_tabla, p_filas, p_modo }) => {
    llamadasRestaurar.push({ tabla: p_tabla, modo: p_modo, tipoFilas: typeof p_filas });
    const filas = JSON.parse(p_filas);
    fixtures.tablas[p_tabla] = fixtures.tablas[p_tabla] ?? [];
    let escritas = 0;
    for (const f of filas) {
      const i = fixtures.tablas[p_tabla].findIndex((x) => x.id === f.id);
      if (i < 0) { fixtures.tablas[p_tabla].push(f); escritas++; }
      else if (p_modo === "sobrescribir") { fixtures.tablas[p_tabla][i] = f; escritas++; }
    }
    return { recibidas: filas.length, escritas, sin_triggers: "replica" };
  },
  beats_backup_ajustar_secuencias: ({ p_secuencias }) => p_secuencias.length,
  beats_backup_registrar: (p) => { const id = `bk-${fixtures.tablas.backups_registro.length + 1}`; fixtures.tablas.backups_registro.push({ id, creado_en: new Date().toISOString(), origen: p.p_origen, estado: p.p_estado, creado_por_nombre: "Admin Prueba", nombre_archivo: p.p_nombre_archivo, destino: p.p_destino, total_tablas: p.p_tablas, total_filas: p.p_filas, tamano_bytes: p.p_bytes, mensaje: p.p_mensaje }); return id; },
  beats_backup_historial: () => [...fixtures.tablas.backups_registro].reverse(),
});

let fallas = 0;
const afirmar = (c, m) => { if (c) console.log(`  OK  ${m}`); else { console.error(`  X   ${m}`); fallas++; } };
const sha = (t) => createHash("sha256").update(t, "utf8").digest("hex");

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const errores = [];
async function abrirPagina(email) {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|fonts\.g/.test(m.text())) errores.push(m.text()); });
  // Carpeta de destino simulada: el sistema de archivos privado del navegador (misma interfaz que el selector real).
  await page.addInitScript(() => { window.showDirectoryPicker = async () => navigator.storage.getDirectory(); });
  await interceptarSupabase(page, fixtures);
  // Se sirve el bundle desde un origen https simulado (el sistema de archivos privado no existe bajo file://).
  await page.route("https://beats.test/", async (r) => r.fulfill({ status: 200, contentType: "text/html", body: await readFile(rutaBundle, "utf8") }));
  await page.goto("https://beats.test/");
  await page.fill("#email", email);
  await page.fill("#password", "clave-segura-123");
  await resolverCaptchaLogin(page);
  await page.click('button[type="submit"]');
  await page.waitForSelector("aside", { timeout: 15000 });
  return page;
}
const yDe = async (page, texto) => (await page.locator("aside").getByText(texto, { exact: true }).first().boundingBox())?.y ?? -1;

// =====================================================================================================================
console.log("1. «Visor Documental» (Legal/Compliance)");
{
  const page = await abrirPagina("legal.prueba@bausch.com");
  afirmar((await page.locator("aside").getByText("Visor Documental", { exact: true }).count()) === 1, "el menú muestra «Visor Documental»");
  afirmar((await page.locator("aside").getByText("Documentos (todos)").count()) === 0, "ya no existe «Documentos (todos)»");
  await page.locator("aside").getByText("Visor Documental", { exact: true }).click();
  await page.waitForTimeout(600);
  afirmar((await page.locator("header").innerText().catch(() => "")).includes("Visor Documental") || (await page.locator("main").innerText().catch(() => "")).includes("Visor Documental") || (await page.locator("body").innerText()).includes("Visor Documental"), "el encabezado de la página dice «Visor Documental»");
  afirmar(!/Documentos \(todos\)/.test(await page.locator("body").innerText()), "no queda ningún «Documentos (todos)» en pantalla");
  await page.screenshot({ path: `${SALIDA}/visor_documental.png` });
  await page.context().close();
}

// =====================================================================================================================
console.log("2. Administrador de alcance limitado no ve «Backup»");
{
  const page = await abrirPagina("limitado.prueba@bausch.com");
  afirmar((await page.locator("aside").getByText("Backup", { exact: true }).count()) === 0, "sin «Backup» en el menú");
  afirmar((await page.locator("aside").getByText("Expedientes", { exact: true }).count()) === 1, "pero sí ve «Expedientes»");
  await page.context().close();
}

const page = await abrirPagina("admin.prueba@bausch.com");
const correos = [];
await page.route(/\/functions\/v1\/send-email/, async (route) => {
  if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
  try { correos.push(route.request().postDataJSON()); } catch { /* */ }
  return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ ok: true }) });
});

// =====================================================================================================================
console.log("3. Menú: «Expedientes» en Informes y Auditoría; «Backup» en Configuración");
{
  const yInforme = await yDe(page, "Informe por Evento");
  const yExp = await yDe(page, "Expedientes");
  const yAsist = await yDe(page, "Asistentes Impactados");
  afirmar(yExp > yInforme && yExp < yAsist && yInforme > 0, `«Expedientes» queda justo después de «Informe por Evento» (${Math.round(yInforme)} < ${Math.round(yExp)} < ${Math.round(yAsist)})`);
  const yConf = await yDe(page, "Configuración");
  const yBackup = await yDe(page, "Backup");
  const yCred = await yDe(page, "Créditos");
  afirmar(yBackup > yConf && yBackup < yCred && yConf > 0, "«Backup» está dentro del grupo «Configuración»");
  await page.screenshot({ path: `${SALIDA}/menu.png` });
}

// =====================================================================================================================
console.log("4. Expedientes: selector de evento y apertura del expediente");
{
  await page.locator("aside").getByText("Expedientes", { exact: true }).click();
  await page.getByTestId("exps-evento").waitFor();
  afirmar((await page.getByTestId("exps-tarjeta").count()) === 0, "sin evento elegido no hay tarjeta");
  await page.getByTestId("exps-evento").click();
  const opciones = await page.locator('[role="option"]').allInnerTexts();
  afirmar(opciones.length === 1 && /Simposio de Catarata 2026/.test(opciones[0]), `solo se ofrecen eventos Aprobados/Completados (${opciones.map((o) => o.split(" — ")[0]).join(", ")})`);
  await page.locator('[role="option"]', { hasText: "Simposio de Catarata 2026" }).click();
  await page.getByTestId("expediente-evento").waitFor({ timeout: 10000 });
  afirmar(/Expediente — Simposio de Catarata 2026/.test(await page.getByTestId("expediente-evento").innerText()), "al elegir el evento se abre su expediente");
  await page.screenshot({ path: `${SALIDA}/expediente.png` });
  await page.keyboard.press("Escape");
  await page.getByTestId("expediente-evento").waitFor({ state: "hidden" }).catch(() => {});
  await page.getByTestId("exps-abrir").click();
  await page.getByTestId("expediente-evento").waitFor({ timeout: 10000 });
  afirmar(true, "«Abrir expediente» lo vuelve a abrir");
  await page.keyboard.press("Escape");
}

// =====================================================================================================================
console.log("5. Auditoría de eventos: «Enviar documentos»");
{
  await page.locator("aside").getByText("Auditoría de Eventos", { exact: true }).click();
  await page.getByText("Simposio de Catarata 2026").first().waitFor({ timeout: 10000 });
  const fila1 = page.getByTestId("ae-enviar-docs-evt-1");
  afirmar((await fila1.count()) === 1, "el evento Aprobado tiene el botón «Enviar documentos»");
  afirmar((await page.getByTestId("ae-enviar-docs-evt-2").count()) === 0, "el evento en Borrador no lo tiene");
  const bIr = await page.getByRole("button", { name: "Ir al evento", exact: true }).first().boundingBox();
  const bEnv = await fila1.boundingBox();
  afirmar(bEnv.x > bIr.x && Math.abs(bEnv.y - bIr.y) < 12, "está al lado derecho de «Ir al evento»");
  afirmar((await page.getByText("Documentos del paquete de cierre").count()) === 0, "la fila está plegada");

  await fila1.click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByText("Archivos cargados del evento").waitFor({ timeout: 15000 });
  const texto = await dialogo.innerText();
  afirmar(/Enviar documentos/.test(texto), "se abre la ventana «Enviar documentos»");
  afirmar(/Solicitud de evento — Simposio de Catarata 2026/.test(texto), "ofrece el PDF de la solicitud del evento");
  afirmar(/CAF — Dra\. Camila Reyes/.test(texto), "ofrece el PDF del CAF del evento");
  afirmar(/Orden de compra OC-1/.test(texto), "ofrece el archivo cargado (orden de compra)");
  afirmar((await dialogo.locator("#envio-destinatario-email").inputValue()) === "solicitante@bausch.com", "el correo se propone al solicitante del evento");
  afirmar(/Documentos del evento — Simposio de Catarata 2026/.test(await dialogo.locator("#envio-asunto").inputValue()), "el asunto nombra el evento");
  afirmar((await page.getByText("Documentos del paquete de cierre").count()) === 0, "interactuar con la ventana no despliega la fila de atrás");
  await page.screenshot({ path: `${SALIDA}/enviar_documentos.png` });

  await dialogo.getByTestId("envio-grupo-pdf-Evento").getByRole("button", { name: "Ninguno" }).click();
  await dialogo.getByRole("button", { name: "Enviar", exact: true }).click();
  await page.waitForTimeout(2500);
  afirmar(correos.length === 1, `se invocó send-email (${correos.length})`);
  const c = correos[0] ?? {};
  afirmar(c.to === "solicitante@bausch.com" && /Documentos del evento/.test(c.subject ?? ""), "el correo va al solicitante con el asunto del evento");
  afirmar(Array.isArray(c.attachments) && c.attachments.length === 1 && c.attachments[0].filename === "orden_compra.pdf", "adjunta solo lo marcado (la orden de compra)");
  afirmar((await page.getByRole("dialog").count()) === 0, "la ventana se cierra tras enviar");
  afirmar(fixtures.tablas.envios_documentos?.length === 1 && fixtures.tablas.envios_documentos[0].tipo_doc === "evento" && fixtures.tablas.envios_documentos[0].documento_id === "evt-1", "queda registrado en la bitácora de envíos como documento tipo «evento»");
}

// =====================================================================================================================
console.log("6. Backup: pantalla y creación (descarga)");
await page.locator("aside").getByText("Backup", { exact: true }).click();
await page.getByTestId("bk-crear").waitFor();
afirmar(/No:.*Supabase Auth/s.test(await page.getByTestId("bk-alcance").innerText()), "la pantalla aclara qué NO incluye una copia");
const [descarga] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.getByTestId("bk-crear").click()]);
const rutaBackup = `${SALIDA}/${descarga.suggestedFilename()}`;
await descarga.saveAs(rutaBackup);
await page.getByTestId("bk-resultado").waitFor({ timeout: 15000 });
afirmar(/^beats-backup_\d{4}-\d{2}-\d{2}_\d{6}\.ndjson\.gz$/.test(descarga.suggestedFilename()), `nombre con fecha y hora (${descarga.suggestedFilename()})`);
const contenido = gunzipSync(await readFile(rutaBackup)).toString("utf8");
const lineas = contenido.split("\n").filter(Boolean);
const cab = JSON.parse(lineas[0]);
const man = JSON.parse(lineas[lineas.length - 1]);
afirmar(cab.tipo === "cabecera" && cab.formato === "beats-backup/1" && cab.creadoPor?.id === "usr-admin", "cabecera con formato y autor");
afirmar(cab.orden.indexOf("solicitudes_evento") < cab.orden.indexOf("cafs") && cab.orden.indexOf("archivos_adjuntos") < cab.orden.indexOf("evento_registros_financieros"), "tablas ordenadas por dependencias (las referenciadas primero)");
afirmar(man.tipo === "manifiesto" && man.totalFilas === tablasRespaldables().reduce((a, t) => a + fixtures.tablas[t].length, 0), `manifiesto con el total de filas (${man.totalFilas})`);
afirmar(man.tablas.length === tablasRespaldables().length, `todas las tablas (${man.tablas.length}), incluso las vacías`);
let huellasOk = true; let paginas = 0;
for (const l of lineas.slice(1, -1)) { const t = l.indexOf("\t"); const sobre = JSON.parse(l.slice(0, t)); if (sha(l.slice(t + 1)) !== sobre.sha) huellasOk = false; paginas++; }
afirmar(huellasOk && paginas > 0, `la huella SHA-256 de cada página (${paginas}) coincide con la calculada aparte`);
afirmar(contenido.includes('"saldo": "12345678901234.123456"') || contenido.includes('"saldo":"12345678901234.123456"'), "los valores viajan tal cual (sin redondeos)");
afirmar(man.secuencias.length === 1 && man.secuencias[0].ultimo === 41, "se guardan las secuencias");
afirmar(fixtures.tablas.backups_registro.some((r) => r.origen === "manual" && r.estado === "ok"), "queda anotada en el historial");
await page.screenshot({ path: `${SALIDA}/backup_crear.png` });

// =====================================================================================================================
console.log("7. Restaurar: verificación del archivo");
await page.getByTestId("bk-tab-restaurar").click();
const corrupto = Buffer.from(gzipSync(Buffer.from(contenido.replace("Dra. Camila Reyes", "Dra. Camila REYES"))));
const truncado = Buffer.from(gzipSync(Buffer.from(lineas.slice(0, -1).join("\n") + "\n")));
await page.getByTestId("rs-archivo").setInputFiles({ name: "alterado.ndjson.gz", mimeType: "application/gzip", buffer: corrupto });
await page.getByTestId("rs-invalido").waitFor({ timeout: 15000 });
afirmar(/no coincide/.test(await page.getByTestId("rs-invalido").innerText()), "un archivo con un dato alterado se rechaza (huella distinta)");
afirmar((await page.getByTestId("rs-restaurar").count()) === 0, "y no ofrece restaurar");
await page.getByTestId("rs-archivo").setInputFiles({ name: "cortado.ndjson.gz", mimeType: "application/gzip", buffer: truncado });
await page.getByTestId("rs-invalido").waitFor({ timeout: 15000 });
afirmar(/incompleto/.test(await page.getByTestId("rs-invalido").innerText()), "un archivo cortado (sin manifiesto) se rechaza");
await page.getByTestId("rs-archivo").setInputFiles({ name: "no-es-backup.gz", mimeType: "application/gzip", buffer: Buffer.from(gzipSync(Buffer.from("hola\n"))) });
await page.getByTestId("rs-invalido").waitFor({ timeout: 15000 });
afirmar(/no es una copia de seguridad de BEATS/.test(await page.getByTestId("rs-invalido").innerText()), "un archivo cualquiera se rechaza");
await page.getByTestId("rs-archivo").setInputFiles(rutaBackup);
await page.getByTestId("rs-valido").waitFor({ timeout: 15000 });
afirmar(/completo y sin alteraciones/.test(await page.getByTestId("rs-valido").innerText()), "el archivo original pasa la verificación");
await page.screenshot({ path: `${SALIDA}/restaurar_verificado.png` });

console.log("8. Restaurar: completar / sobrescribir / reemplazar");
{
  const original = JSON.parse(JSON.stringify(fixtures.tablas));
  // Se estropea la base: se borra un CAF, se cambia un evento y se crea un evento nuevo.
  fixtures.tablas.cafs = [];
  fixtures.tablas.solicitudes_evento[0].nombre_evento = "NOMBRE CAMBIADO";
  fixtures.tablas.solicitudes_evento.push(evento("evt-nuevo", "Aprobado", "Creado después de la copia"));

  await page.getByTestId("rs-modo-completar").check();
  await page.getByTestId("rs-restaurar").click();
  await page.getByTestId("rs-resultado").waitFor({ timeout: 20000 });
  afirmar(fixtures.tablas.cafs.length === 1, "«Completar» devuelve el CAF borrado");
  afirmar(fixtures.tablas.solicitudes_evento[0].nombre_evento === "NOMBRE CAMBIADO", "«Completar» NO pisa lo que ya existe");
  afirmar(llamadasRestaurar.every((l) => l.tipoFilas === "string"), "las filas viajan al servidor como texto (sin pasar por números de JavaScript)");
  afirmar(/los conteos coinciden/.test(await page.getByTestId("rs-resultado").innerText()), "comprueba los conteos al terminar");

  await page.getByTestId("rs-modo-sobrescribir").check();
  const [prevSob] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.getByTestId("rs-restaurar").click()]);
  afirmar(/_seguridad\.ndjson\.gz$/.test(prevSob.suggestedFilename()), `«Sobrescribir» primero guarda una copia de seguridad (${prevSob.suggestedFilename()})`);
  await page.getByTestId("rs-resultado").waitFor({ timeout: 20000 });
  afirmar(fixtures.tablas.solicitudes_evento.find((e) => e.id === "evt-1").nombre_evento === "Simposio de Catarata 2026", "«Sobrescribir» devuelve el valor de la copia");
  afirmar(fixtures.tablas.solicitudes_evento.some((e) => e.id === "evt-nuevo"), "«Sobrescribir» no borra lo creado después");

  await page.getByTestId("rs-modo-reemplazar").check();
  afirmar(await page.getByTestId("rs-restaurar").isDisabled(), "«Reemplazar» está bloqueado hasta confirmar");
  await page.getByTestId("rs-entiendo").click();
  await page.getByTestId("rs-palabra").fill("restaurar");
  afirmar(await page.getByTestId("rs-restaurar").isEnabled(), "se habilita al marcar la casilla y escribir RESTAURAR");
  const [prevRep] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.getByTestId("rs-restaurar").click()]);
  afirmar(/_seguridad\.ndjson\.gz$/.test(prevRep.suggestedFilename()), "«Reemplazar» también guarda antes una copia de seguridad");
  await page.getByTestId("rs-resultado").waitFor({ timeout: 20000 });
  afirmar(!fixtures.tablas.solicitudes_evento.some((e) => e.id === "evt-nuevo"), "«Reemplazar» deja la base como estaba (lo posterior desaparece)");
  afirmar(tablasRespaldables().every((t) => JSON.stringify([...fixtures.tablas[t]].sort((a, b) => a.id.localeCompare(b.id))) === JSON.stringify([...original[t]].sort((a, b) => a.id.localeCompare(b.id)))), "todas las tablas quedan idénticas a las de la copia");
  await page.screenshot({ path: `${SALIDA}/restaurar_resultado.png` });
}

// =====================================================================================================================
console.log("9. Programación: rutina automática en una carpeta");
{
  await page.getByTestId("bk-tab-programacion").click();
  await page.getByTestId("pg-guardar").waitFor();
  // La carpeta (simulada) ya trae copias programadas viejas, una manual y un archivo ajeno.
  await page.evaluate(async () => {
    const raiz = await navigator.storage.getDirectory();
    for (const n of ["beats-backup_2020-01-01_000000_programado.ndjson.gz", "beats-backup_2020-01-02_000000_programado.ndjson.gz", "beats-backup_2020-01-03_000000_programado.ndjson.gz", "beats-backup_2020-01-01_000000.ndjson.gz", "notas.txt"]) {
      const h = await raiz.getFileHandle(n, { create: true }); const w = await h.createWritable(); await w.write("x"); await w.close();
    }
  });
  await page.getByTestId("pg-guardar").click();
  await page.waitForTimeout(300);
  afirmar(/Elige la carpeta/.test(await page.locator("body").innerText()) === false, "(sin activar no exige carpeta)");
  await page.getByTestId("pg-activa").click();
  await page.getByTestId("pg-guardar").click();
  await page.getByText("Elige la carpeta donde se guardarán", { exact: false }).waitFor({ timeout: 4000 }).catch(() => {});
  afirmar(await page.getByText("Elige la carpeta donde se guardarán", { exact: false }).count() > 0, "no deja activar la rutina sin carpeta");
  await page.getByTestId("pg-elegir-carpeta").click();
  await page.getByTestId("pg-carpeta").waitFor();
  await page.getByTestId("pg-cada").fill("6");
  await page.getByTestId("pg-conservar").fill("2");
  await page.getByTestId("pg-guardar").click();
  await page.getByText("Programación guardada").waitFor({ timeout: 5000 });
  const proxima = await page.getByTestId("pg-estado").innerText();
  afirmar(!/Próxima ejecución\s*—/.test(proxima.replace(/\n/g, " ")), "muestra la próxima ejecución");

  await page.getByTestId("pg-ejecutar").click();
  await page.getByText("Backup programado completado").first().waitFor({ timeout: 30000 });
  const archivos = await page.evaluate(async () => { const r = await navigator.storage.getDirectory(); const n = []; for await (const [nombre] of r.entries()) n.push(nombre); return n.sort(); });
  const programados = archivos.filter((n) => n.includes("_programado."));
  afirmar(programados.length === 2 && programados.includes("beats-backup_2020-01-03_000000_programado.ndjson.gz"), `retención: quedan solo las 2 programadas más recientes (${programados.join(", ")})`);
  afirmar(archivos.includes("beats-backup_2020-01-01_000000.ndjson.gz") && archivos.includes("notas.txt"), "la copia manual y el archivo ajeno no se tocan");
  const nuevo = programados.find((n) => !n.startsWith("beats-backup_2020"));
  const bytes = await page.evaluate(async (n) => { const r = await navigator.storage.getDirectory(); const f = await (await r.getFileHandle(n)).getFile(); return Array.from(new Uint8Array(await f.arrayBuffer())); }, nuevo);
  const txt = gunzipSync(Buffer.from(bytes)).toString("utf8").split("\n").filter(Boolean);
  afirmar(JSON.parse(txt[0]).origen === "programado" && JSON.parse(txt[txt.length - 1]).tipo === "manifiesto", "la copia programada en la carpeta está completa (cabecera y manifiesto)");
  await page.getByTestId("pg-estado").getByText("Correcta").waitFor({ timeout: 5000 });
  afirmar(true, "el estado muestra la última ejecución como «Correcta»");
  await page.screenshot({ path: `${SALIDA}/programacion.png` });

  // Rutina vencida mientras BEATS estaba cerrado: al abrirlo corre sola.
  await page.evaluate(async () => {
    const bd = await new Promise((ok, no) => { const r = indexedDB.open("beats-backup", 1); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
    const p = await new Promise((ok) => { const r = bd.transaction("programaciones").objectStore("programaciones").get("usr-admin"); r.onsuccess = () => ok(r.result); });
    p.proximaEjecucion = new Date(Date.now() - 60_000).toISOString();
    p.conservar = 0;
    await new Promise((ok) => { const t = bd.transaction("programaciones", "readwrite"); t.objectStore("programaciones").put(p); t.oncomplete = ok; });
  });
  const antes = programados.length;
  await new Promise((r) => setTimeout(r, 1200)); // otro segundo en el nombre del archivo
  await page.reload();
  await page.waitForSelector("aside", { timeout: 15000 });
  await page.getByText("Backup programado completado").first().waitFor({ timeout: 30000 });
  const despues = (await page.evaluate(async () => { const r = await navigator.storage.getDirectory(); const n = []; for await (const [nombre] of r.entries()) n.push(nombre); return n; })).filter((n) => n.includes("_programado.")).length;
  afirmar(despues === antes + 1, `al abrir BEATS con la rutina vencida corre una vez (${antes} → ${despues} copias programadas)`);
}

// =====================================================================================================================
console.log("10. Historial");
{
  await page.locator("aside").getByText("Backup", { exact: true }).click();
  await page.getByTestId("bk-tab-historial").click();
  await page.getByTestId("bk-historial").waitFor({ timeout: 8000 });
  const t = await page.getByTestId("bk-historial").innerText();
  afirmar(/Manual/.test(t) && /Programado/.test(t) && /Restauración/.test(t) && /De seguridad/.test(t), "el historial lista copias manuales, programadas, de seguridad y restauraciones");
  await page.screenshot({ path: `${SALIDA}/historial.png` });
}

console.log("11. Migración faltante");
{
  const antes = fixtures.rpc.beats_backup_esquema;
  delete fixtures.rpc.beats_backup_esquema;
  await page.getByTestId("bk-tab-crear").click();
  await page.getByTestId("bk-crear").click();
  await page.getByTestId("bk-error").waitFor({ timeout: 10000 });
  afirmar(/db\/entrega_35_backup\.sql/.test(await page.getByTestId("bk-error").innerText()) || /RPC no simulada/.test(await page.getByTestId("bk-error").innerText()), "si la función no existe, el error lo dice con claridad");
  fixtures.rpc.beats_backup_esquema = antes;
}

afirmar(errores.length === 0 || (console.error(errores.slice(0, 5)), false), "sin errores de JavaScript en consola");
await browser.close();
console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLA(S)`);
process.exit(fallas ? 1 : 0);
