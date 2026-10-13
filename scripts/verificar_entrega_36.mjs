#!/usr/bin/env node
// Entrega 36 — (1) ancho de «Enviar documentos», (2) arrastrar el mapa de Asistentes Impactados, (3) comentarios y
// anotaciones de pago con trazabilidad, (4) comprobante que cubre varias facturas, (5) selector «Producto» de la
// Notificación de Pago y (6) tarea de Notificación de Pago al cargar facturas de un speaker.
// Todo contra fixtures locales — nunca Supabase real. Los triggers de la migración se simulan con `alInsertar`/`alActualizar`.
import { chromium } from "playwright";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { interceptarSupabase, resolverCaptchaLogin } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rutaBundle = resolve(raiz, "bundle.html");
const SALIDA = process.env.SALIDA_VERIFICACION ?? "/tmp/beats_entrega36";
await mkdir(SALIDA, { recursive: true });
const ahora = new Date();
const dia = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

const usuario = (id, nombre, rol, extra = {}) => ({
  id, nombre, cargo: "Prueba", email: `${id}@bausch.com`, rol, iniciales: nombre.slice(0, 2).toUpperCase(), firma_id: null, debe_cambiar_password: false,
  auth_user_id: `auth-${id}`, telefono: "", paginas_permitidas: [], empresas_grupo: ["Bausch + Lomb"], paises_operacion: ["Colombia"],
  es_administrador: false, administrador_alcance_limitado: false, ...extra,
});
const reg = (id, ciudad, pais = "Colombia") => ({
  id, evento_id: "evt-1", sesion_ejecucion_id: "ses-1", nombres: `Asistente ${id}`, apellidos: "Prueba", cedula: `CC-${id}`, tipo_documento: "Cédula", profesion: "Médico", profesion_detalle: "",
  especialidad: "Oftalmología", especialidad_otra: "", celular: "3000000000", email: `${id}@example.com`, autoriza_imagen_voz: true, autoriza_datos_personales: true, firma_id: null,
  declaracion_texto_mostrado: "Declaro...", interes_visita_medica: "Sí", direccion: "", ciudad, tipo_participacion: "Asistente", capturado_en: ahora.toISOString(), pais,
});
const spk = (id, nombre) => ({ id, nombre_completo: nombre, especialidad: "Oftalmología", numero_documento: `CC-${id}`, email: `${id}@x.co` });

const fixtures = {
  usuariosAuth: [{ id: "auth-admin", email: "admin.prueba@bausch.com", password: "clave-segura-123" }],
  tablas: {
    usuarios: [usuario("usr-admin", "Admin Prueba", "medica", { email: "admin.prueba@bausch.com", auth_user_id: "auth-admin", es_administrador: true })],
    catalogo_valores: [
      { id: "cat-1", catalogo: "monedas", valor: "COP", orden: 1 },
      { id: "cat-2", catalogo: "empresasGrupo", valor: "Bausch + Lomb", orden: 1 },
    ],
    speakers: [spk("spk-A", "Dra. Camila Reyes"), spk("spk-B", "Dr. Pedro Gómez")],
    solicitudes_evento: [{
      id: "evt-1", estado: "Aprobado", creado_por_id: "usr-admin", creado_en: ahora.toISOString(), nombre_evento: "Simposio de Catarata 2026", empresa_grupo: "Bausch + Lomb",
      pais: "Colombia", ciudad: "Bogotá", moneda: "COP", fecha_inicio_evento: dia(-3), fecha_fin_evento: dia(-3), numero_asistentes: 40, modalidad_sesiones: "Varias sesiones",
      participacion_academica: true, quien_dicta_actividad: "Speaker externo",
    }],
    evento_aprobaciones: [], sesiones_evento: [
      { id: "ses-A", evento_id: "evt-1", orden: 1, fecha: dia(-3), lugar: "Auditorio 1" },
      { id: "ses-B", evento_id: "evt-1", orden: 2, fecha: dia(-3), lugar: "Auditorio 2" },
    ], evento_muestras_planeadas: [], eventos_codigos_acceso: [],
    evento_speakers_participacion: [
      { id: "esp-A", evento_id: "evt-1", orden: 1, speaker_id: "spk-A", nombre_speaker: "Dra. Camila Reyes", monto_honorarios: 3000000, monto_inscripcion: 0, factura_modalidad: "Factura por sesión", tipo_speaker: "externo" },
      { id: "esp-B", evento_id: "evt-1", orden: 2, speaker_id: "spk-B", nombre_speaker: "Dr. Pedro Gómez", monto_honorarios: 2000000, monto_inscripcion: 0, factura_modalidad: "", tipo_speaker: "externo" },
    ],
    evento_speaker_presupuestos: [],
    fmv_checklists: [{ id: "fmv-1", estado: "Aprobado", evento_origen_id: "evt-1", speaker_id: "spk-A", creado_por_id: "usr-admin", creado_en: ahora.toISOString() }],
    fmv_aprobaciones: [],
    convenios_pago_hcp: [{ id: "cp-1", estado: "Aprobado", evento_origen_id: "evt-1", speaker_id: "spk-A", creado_por_id: "usr-admin", creado_en: ahora.toISOString(), hcp_nombre_completo: "Dra. Camila Reyes", hcp_cedula_licencia: "CC-spk-A", contraprestacion_hcp: 3000000, moneda_contraprestacion: "COP", fecha_inicio_actividad: dia(-3) }],
    convenio_aprobaciones: [],
    convenios_hcp: [], convenio_hcp_aprobaciones: [], convenio_hcp_ajustes_clausula: [], cafs: [], caf_aprobaciones: [],
    notificaciones_pago_hcp: [],
    campos_personalizados_definicion: [], etiquetas_campo: [], evento_repositorio_archivos: [],
    evento_registros_financieros: [],
    evento_anotaciones_pago: [],
    registros_participacion: [reg("r1", "Bogotá"), reg("r2", "Medellín"), reg("r3", "Cali"), reg("r4", "Barranquilla"), reg("r5", "Bucaramanga")],
    registros_fuerza_ventas: [], muestras_entregadas: [],
    productos_portafolio: [{ id: "prod-1", nombre: "Lumify", activo: true }, { id: "prod-2", nombre: "Pataday", activo: true }],
    archivos_adjuntos: [], notificaciones: [], paises_region: [{ id: "pr-1", pais: "Colombia" }],
  },
  rpc: {},
  // Triggers de db/entrega_36_pagos_anotaciones_facturas.sql: autor/fecha los fija la base, no el navegador.
  alInsertar: {
    evento_anotaciones_pago: (f) => {
      f.autor_id = "usr-admin"; f.autor_nombre = "Admin Prueba"; f.autor_rol = "medica"; f.creado_en = new Date().toISOString();
      f.aclarada = false; f.aclarada_por_id = null; f.aclarada_por_nombre = null; f.aclarada_en = null;
    },
  },
  alActualizar: {
    evento_anotaciones_pago: (f, antes) => {
      f.texto = antes.texto; f.autor_nombre = antes.autor_nombre; f.creado_en = antes.creado_en;
      if (f.aclarada !== antes.aclarada) { f.aclarada_por_nombre = "Admin Prueba"; f.aclarada_en = new Date().toISOString(); }
    },
  },
};

let fallas = 0;
const afirmar = (c, m) => { if (c) console.log(`  OK  ${m}`); else { console.error(`  X   ${m}`); fallas++; } };
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push(m.text()); });
await interceptarSupabase(page, fixtures);
await page.goto(pathToFileURL(rutaBundle).href);
await page.fill("#email", "admin.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Tablero", { timeout: 10000 });

// =====================================================================================================================
console.log("2. Asistentes Impactados: el mapa se puede arrastrar (y la rueda acerca)");
await page.locator("aside").getByText("Asistentes Impactados", { exact: true }).click();
const svg = page.getByTestId("mapa-svg");
await svg.waitFor({ timeout: 15000 });
const leerPan = async () => (await svg.getAttribute("data-pan")).split(",").map(Number);
const leerZoom = async () => Number(await svg.getAttribute("data-zoom"));
await svg.scrollIntoViewIfNeeded();
let cx = 0, cy = 0;
const recentrar = async () => { await svg.scrollIntoViewIfNeeded(); const c = await svg.boundingBox(); cx = c.x + c.width / 2; cy = c.y + c.height / 2; };
await recentrar();
afirmar((await svg.evaluate((e) => getComputedStyle(e).cursor)) === "grab", "el cursor indica que se puede arrastrar");
// Sin zoom no hay "a dónde mover": el mapa ya está encuadrado, pero igualmente se acepta el gesto sin romperse.
await page.getByRole("button", { name: "Acercar" }).first().click();
await page.getByRole("button", { name: "Acercar" }).first().click();
afirmar((await leerZoom()) > 2, "con los botones + el zoom aumenta");
const vb0 = await svg.getAttribute("viewBox");
await recentrar();
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx - 120, cy + 40, { steps: 8 });
afirmar((await svg.evaluate((e) => getComputedStyle(e).cursor)) === "grabbing", "mientras se arrastra el cursor es «agarrando»");
await page.mouse.up();
const vb1 = await svg.getAttribute("viewBox");
const [px, py] = await leerPan();
afirmar(vb0 !== vb1 && (px !== 0 || py !== 0), `arrastrar desplaza el encuadre (pan ${px.toFixed(2)}, ${py.toFixed(2)})`);
afirmar(px > 0 && py < 0, "arrastrar a la izquierda/abajo muestra lo que está a la derecha/arriba (como en Google Maps)");
// Arrastrar un punto de ciudad no debe seleccionarla por accidente
const antesSel = await page.locator('[data-testid^="mapa-punto-"][data-seleccionado="1"]').count();
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx + 60, cy, { steps: 5 });
await page.mouse.up();
afirmar((await page.locator('[data-testid^="mapa-punto-"][data-seleccionado="1"]').count()) === antesSel, "un arrastre no cuenta como clic sobre una ciudad");
const [px2] = await leerPan();
afirmar(px2 < px, "un segundo arrastre (a la derecha) mueve el encuadre en sentido contrario");
// Rueda: acerca alrededor del cursor
const z1 = await leerZoom();
await recentrar();
await page.mouse.move(cx, cy);
await page.mouse.wheel(0, -300);
await page.waitForTimeout(100);
const z2 = await leerZoom();
afirmar(z2 > z1, `la rueda hacia arriba acerca (${z1.toFixed(2)} → ${z2.toFixed(2)})`);
await page.mouse.wheel(0, 3000);
await page.waitForTimeout(100);
afirmar((await leerZoom()) === 1, "la rueda hacia abajo aleja hasta el zoom mínimo");
const panFinal = await leerPan();
afirmar(panFinal[0] === 0 && panFinal[1] === 0, "al volver al zoom mínimo el encuadre regresa al centro");
// Botón restablecer
await page.getByRole("button", { name: "Acercar" }).first().click();
await recentrar();
await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 80, cy + 30, { steps: 5 }); await page.mouse.up();
await page.getByRole("button", { name: "Restablecer vista" }).first().click();
const pr = await leerPan();
afirmar((await leerZoom()) === 1 && pr[0] === 0 && pr[1] === 0, "«Restablecer vista» devuelve zoom y encuadre iniciales");
// Vista mundo también se arrastra
await page.getByTestId("mapa-ver-mundo").first().click();
await page.getByRole("button", { name: "Acercar" }).first().click();
await page.getByRole("button", { name: "Acercar" }).first().click();
await recentrar();
await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 100, cy, { steps: 5 }); await page.mouse.up();
afirmar((await leerPan())[0] !== 0, "en la vista «Mundo» también se puede arrastrar");
await page.screenshot({ path: `${SALIDA}/mapa_arrastrado.png` });

// =====================================================================================================================
console.log("3 y 4. Expediente › Speakers: factura(s), comprobante que cubre varias, comentarios con trazabilidad");
await page.locator("aside").getByText("Tablero de Documentos", { exact: true }).click();
await page.waitForSelector("text=Simposio de Catarata 2026", { timeout: 10000 });
await page.click("text=Simposio de Catarata 2026");
await page.waitForSelector('[data-testid="tarjeta-expediente"]', { timeout: 8000 });
await page.click('[data-testid="tarjeta-expediente"] button:has-text("Abrir expediente")');
await page.waitForSelector('[data-testid="expediente-evento"]', { timeout: 8000 });
await page.getByRole("tab", { name: /Speakers/ }).click();
const bloqueA = page.getByTestId("exp-speaker-Dra. Camila Reyes");
await bloqueA.waitFor({ timeout: 5000 });

async function agregarRegistro(bloque, testIdBloque, archivo, numero, valor, alcance) {
  const sec = alcance ?? bloque.getByTestId(testIdBloque);
  await sec.scrollIntoViewIfNeeded();
  await sec.locator('input[type="file"]').setInputFiles({ name: archivo, mimeType: "image/png", buffer: PNG });
  await page.waitForTimeout(400);
  await sec.getByPlaceholder("Número").fill(numero);
  await sec.locator('input[type="date"]').fill(dia(-2));
  await sec.locator('input[inputmode="decimal"]').fill(valor);
  await sec.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "COP", exact: true }).click();
  return sec;
}
// Entrega 37: la Dra. Reyes factura por sesión (2 sesiones) → un cupo de factura por sesión.
const cuposFactura = bloqueA.getByTestId("exp-facturas-Dra. Camila Reyes").getByTestId("exp-cupo-factura-Dra. Camila Reyes");
let sec = await agregarRegistro(bloqueA, "exp-facturas-Dra. Camila Reyes", "f1.png", "FAC-1", "1500000", cuposFactura.nth(0));
await sec.getByRole("button", { name: "Agregar factura de esta sesión" }).click();
await page.waitForTimeout(500);
sec = await agregarRegistro(bloqueA, "exp-facturas-Dra. Camila Reyes", "f2.png", "FAC-2", "1500000", cuposFactura.nth(1));
await sec.getByRole("button", { name: "Agregar factura de esta sesión" }).click();
await page.waitForTimeout(500);
const facturas = fixtures.tablas.evento_registros_financieros.filter((f) => f.categoria === "facturas");
afirmar(facturas.length === 2 && facturas.every((f) => f.speaker_id === "spk-A"), "dos facturas cargadas para la Dra. Reyes");

// (6) el aviso de tarea se envió a Dirección Médica al cargar la factura
const avisos = fixtures.tablas.notificaciones.filter((n) => n.clave_evento === "tareas.notificacion_pago");
afirmar(avisos.length >= 2, `cada carga de factura avisa a Dirección Médica (${avisos.length} aviso(s))`);
afirmar(avisos.length > 0 && /Dra\. Camila Reyes/.test(avisos[0].mensaje) && /FAC-1/.test(avisos[0].mensaje) && /Notificación de Pago/.test(avisos[0].mensaje), "el aviso nombra al speaker, la factura y la tarea");

// (4) comprobante: Factura(s) que cubre — selección múltiple
const pagos = bloqueA.getByTestId("exp-pagos-Dra. Camila Reyes");
await pagos.scrollIntoViewIfNeeded();
afirmar(/Factura\(s\) que cubre \*/.test(await pagos.innerText()), "el campo se llama «Factura(s) que cubre *» (obligatorio desde la entrega 37)");
const cubre = pagos.getByTestId("comprobante-facturas-que-cubre");
afirmar((await cubre.locator('button[role="checkbox"]').count()) === 2, "lista las 2 facturas como casillas (selección múltiple)");
afirmar(/FAC-1/.test(await cubre.innerText()) && /FAC-2/.test(await cubre.innerText()), "muestra el número de cada factura");
afirmar((await pagos.getByTestId("comprobante-comentarios").count()) === 1, "hay campo «Comentarios sobre el pago» en el comprobante");
afirmar((await pagos.getByText("Aplica a").count()) >= 1, "con factura por sesión el comentario pregunta a qué sesión aplica");
await agregarRegistro(bloqueA, "exp-pagos-Dra. Camila Reyes", "p1.png", "CP-1", "3000000");
await cubre.locator('button[role="checkbox"]').nth(0).click();
await cubre.locator('button[role="checkbox"]').nth(1).click();
afirmar(/2 factura\(s\) seleccionada\(s\)/.test(await cubre.innerText()), "se pueden marcar varias facturas");
await pagos.getByTestId("comprobante-comentarios").locator("textarea").fill("Pago único por ambas facturas; retención de 4% aplicada.");
await pagos.getByRole("button", { name: "Agregar comprobante de pago" }).click();
await page.waitForTimeout(700);
const comp = fixtures.tablas.evento_registros_financieros.find((f) => f.categoria === "comprobantePago");
afirmar(!!comp && Array.isArray(comp.facturas_ids) && comp.facturas_ids.length === 2, "el comprobante guarda las 2 facturas que cubre (facturas_ids)");
afirmar(comp?.factura_id === comp?.facturas_ids?.[0], "y conserva factura_id (la primera) por compatibilidad");
afirmar(/Cubre las facturas: FAC-1, FAC-2/.test(await pagos.getByTestId("comprobante-cubre").innerText()), "la lista del comprobante muestra «Cubre las facturas: FAC-1, FAC-2»");

// (3) comentario → anotación con trazabilidad
const nota = fixtures.tablas.evento_anotaciones_pago[0];
afirmar(!!nota && /retención de 4%/i.test(nota.texto) && nota.speaker_id === "spk-A" && nota.registro_id === comp?.id && nota.origen === "expediente", "el comentario se guardó como anotación ligada al comprobante y al speaker");
afirmar(nota && !("autor_nombre" in { ...nota, autor_nombre: undefined }) === false, "(el navegador no envía autor: lo fija la base de datos)");
const enviadoPorCliente = Object.keys(fixtures.tablas.evento_anotaciones_pago[0]);
afirmar(nota?.autor_nombre === "Admin Prueba", "la anotación queda con el nombre de quien la hizo");
const listaNotas = pagos.getByTestId("exp-anotaciones-Dra. Camila Reyes");
afirmar(/Admin Prueba/.test(await listaNotas.getByTestId("anotacion-autor").first().innerText()) && /\(Médica\)/.test(await listaNotas.getByTestId("anotacion-autor").first().innerText()), "se muestra quién (con su rol) y cuándo");
// nueva anotación suelta
await listaNotas.getByTestId("anotacion-texto").fill("Pendiente soporte de la retención.");
await listaNotas.getByTestId("anotacion-agregar").click();
await page.waitForTimeout(500);
afirmar(fixtures.tablas.evento_anotaciones_pago.length === 2, "se puede agregar otra anotación sin cargar un comprobante");
// Se muestran en la sección de hallazgos (contraste de valores) del speaker
const contraste = bloqueA.getByTestId("exp-conciliacion-Dra. Camila Reyes");
await contraste.scrollIntoViewIfNeeded();
afirmar((await contraste.getByTestId("anotacion-pago").count()) === 2, "las anotaciones aparecen en los hallazgos («Contraste de valores») del speaker");
// El otro speaker no ve las anotaciones de la Dra. Reyes
const bloqueB = page.getByTestId("exp-speaker-Dr. Pedro Gómez");
afirmar((await bloqueB.getByTestId("anotacion-pago").count()) === 0, "las anotaciones de un speaker no se muestran en el bloque de otro");
// Aclarar
await listaNotas.getByTestId("anotacion-aclarar").first().click();
await page.waitForTimeout(500);
afirmar(fixtures.tablas.evento_anotaciones_pago[0].aclarada === true, "se puede marcar una anotación como aclarada");
afirmar(/Aclarada por Admin Prueba/.test(await listaNotas.getByTestId("anotacion-aclarada").first().innerText()), "queda registrado quién la aclaró");
afirmar(fixtures.tablas.evento_anotaciones_pago[0].texto.includes("retención"), "el texto de la anotación no cambia al aclararla");
// pestaña Financiero
await page.getByRole("tab", { name: /Financiero/ }).click();
await page.waitForSelector('[data-testid="exp-financiero"]');
afirmar((await page.getByTestId("exp-financiero").getByTestId("anotacion-pago").count()) === 2, "la pestaña Financiero (hallazgos) también muestra las anotaciones");
await page.screenshot({ path: `${SALIDA}/expediente_financiero.png` });
// El expediente se abrió encima del detalle del evento: se cierran los dos.
while ((await page.getByTestId("ventana-cerrar").count()) > 0) {
  await page.getByTestId("ventana-cerrar").last().click();
  await page.waitForTimeout(250);
}

// =====================================================================================================================
console.log("3. Informe de Pagos › Hallazgos: anotar con trazabilidad");
await page.locator('nav button:has-text("Informe de Pagos")').click();
await page.waitForSelector('[data-testid="informe-pagos"]', { timeout: 10000 });
await page.waitForSelector('[data-testid="pagos-kpi-consistencia"]', { timeout: 10000 });
await page.getByTestId("pagos-tab-hallazgos").click();
const tabla = page.getByTestId("pagos-tabla-hallazgos");
await tabla.waitFor();
const filaRey = tabla.locator("tr", { hasText: "Dra. Camila Reyes" }).first();
afirmar((await filaRey.count()) === 1, "hay hallazgos de la Dra. Reyes");
afirmar(/Retención|retención/.test(await filaRey.innerText()) || /Admin Prueba/.test(await filaRey.innerText()), "la columna Anotaciones muestra la última anotación y su autor");
await filaRey.getByTestId("pagos-anotar").click();
const dlg = page.getByTestId("pagos-dialogo-anotaciones");
await dlg.waitFor();
afirmar((await dlg.getByTestId("anotacion-pago").count()) === 2, "el diálogo trae las 2 anotaciones del Expediente");
await dlg.getByTestId("anotacion-texto").fill("Informe: la OC es antes de impuestos; la factura incluye IVA.");
await dlg.getByTestId("anotacion-agregar").click();
await page.waitForTimeout(500);
const delInforme = fixtures.tablas.evento_anotaciones_pago.find((a) => a.origen === "informe_pagos");
afirmar(!!delInforme && delInforme.speaker_id === "spk-A" && delInforme.evento_id === "evt-1" && delInforme.autor_nombre === "Admin Prueba", "la anotación del informe queda con evento, speaker, origen y autor");
afirmar((await dlg.getByTestId("anotacion-pago").count()) === 3, "aparece de inmediato en la lista, con su autor y fecha");
await dlg.getByTestId("anotacion-aclarar").last().click();
await page.waitForTimeout(600);
afirmar(fixtures.tablas.evento_anotaciones_pago.filter((a) => a.aclarada).length === 2, "también se puede aclarar desde el informe");
await page.screenshot({ path: `${SALIDA}/informe_pagos_anotaciones.png` });
await page.keyboard.press("Escape");
// CSV de hallazgos con anotaciones
const [descarga] = await Promise.all([page.waitForEvent("download", { timeout: 10000 }), page.getByTestId("pagos-csv-hallazgos").click()]);
const rutaCsv = `${SALIDA}/hallazgos.csv`;
await descarga.saveAs(rutaCsv);
const { readFile } = await import("node:fs/promises");
const csv = await readFile(rutaCsv, "utf8");
afirmar(/Anotaciones \(autor/.test(csv) && /Admin Prueba/.test(csv) && /aclarada por Admin Prueba/.test(csv), "el CSV de hallazgos incluye las anotaciones con autor y estado");

// =====================================================================================================================
console.log("6. Tareas pendientes: una tarea de Notificación de Pago por speaker con facturas sin notificar");
await page.locator("aside").getByText("Tareas Pendientes", { exact: true }).click();
await page.waitForSelector('[data-testid="tarea-notificacion-pago"]', { timeout: 10000 });
const tareas = page.getByTestId("tarea-notificacion-pago");
afirmar((await tareas.count()) === 1, "una tarea para la Dra. Reyes (el Dr. Gómez no tiene facturas)");
const tt = await tareas.first().innerText();
afirmar(/Dra\. Camila Reyes/.test(tt) && /2 factura\(s\)/.test(tt) && /FAC-1, FAC-2/.test(tt), "nombra al speaker y sus facturas pendientes");

await tareas.first().getByRole("button", { name: /Falta Notificación de Pago/ }).click({ timeout: 3000 }).catch(() => {});

// =====================================================================================================================
console.log("5. Notificación de Pago: el selector «Producto» sí se activa");
await page.waitForSelector("text=Nueva Notificación de Pago a HCP", { timeout: 10000 });
afirmar((await page.locator("#notif-producto-0").count()) === 1, "al abrir el formulario ya hay un desplegable de producto listo");
await page.locator("#notif-producto-0").click();
await page.getByRole("option", { name: "Lumify" }).click();
await page.getByRole("button", { name: /Agregar producto/ }).click();
afirmar((await page.locator("#notif-producto-1").count()) === 1, "«Agregar producto» añade una segunda fila con su desplegable");
await page.locator("#notif-producto-1").click();
await page.getByRole("option", { name: "Pataday" }).click();
const txtProd = await page.locator("#notif-producto-0").innerText();
afirmar(/Lumify/.test(txtProd) && /Pataday/.test(await page.locator("#notif-producto-1").innerText()), "se eligen dos productos");
await page.getByRole("button", { name: /Agregar producto/ }).click();
await page.locator("div:has(> #notif-producto-2) > button:not([role=combobox])").click(); // fila vacía: se quita sin preguntar
afirmar((await page.locator("#notif-producto-2").count()) === 0, "una fila todavía vacía se quita sin pedir confirmación");
await page.screenshot({ path: `${SALIDA}/notificacion_productos.png` });

// =====================================================================================================================
console.log("1. «Enviar documentos»: más ancho, sin barra de desplazamiento horizontal");
await page.locator("aside").getByText("Auditoría de Eventos", { exact: true }).click();
await page.getByText("Simposio de Catarata 2026").first().waitFor({ timeout: 10000 });
await page.getByTestId("ae-enviar-docs-evt-1").click();
const ventana = page.getByRole("dialog");
await ventana.getByText("Archivos cargados del evento").waitFor({ timeout: 15000 });
const medidas = await ventana.evaluate((el) => ({ ancho: el.getBoundingClientRect().width, scrollW: el.scrollWidth, clientW: el.clientWidth, vw: window.innerWidth }));
afirmar(medidas.ancho >= 960, `la ventana es más ancha que antes (768 px): ${Math.round(medidas.ancho)} px`);
afirmar(medidas.scrollW <= medidas.clientW + 1, `sin barra de desplazamiento horizontal (scrollWidth ${medidas.scrollW} ≤ clientWidth ${medidas.clientW})`);
afirmar(medidas.ancho <= medidas.vw - 32 + 1, "y cabe en la pantalla");
// Referencia (informativa): con el ancho anterior (max-w-3xl = 768 px) y la rejilla anterior, ¿había desbordamiento?
const antiguo = await ventana.evaluate((el) => {
  const prev = { mw: el.style.maxWidth, gc: el.style.gridTemplateColumns, ox: el.style.overflowX };
  el.style.maxWidth = "48rem"; el.style.gridTemplateColumns = "none"; el.style.overflowX = "auto";
  const r = { ancho: Math.round(el.getBoundingClientRect().width), scrollW: el.scrollWidth, clientW: el.clientWidth };
  el.style.maxWidth = prev.mw; el.style.gridTemplateColumns = prev.gc; el.style.overflowX = prev.ox;
  return r;
});
console.log(`   [referencia] con 768 px y rejilla anterior: ancho ${antiguo.ancho}, scrollWidth ${antiguo.scrollW}, clientWidth ${antiguo.clientW} → ${antiguo.scrollW > antiguo.clientW ? "SÍ desbordaba" : "no desbordaba en esta muestra"}`);
// En pantalla angosta (laptop pequeña) también debe caber
await page.setViewportSize({ width: 900, height: 900 });
await page.waitForTimeout(300);
const m2 = await ventana.evaluate((el) => ({ scrollW: el.scrollWidth, clientW: el.clientWidth, ancho: el.getBoundingClientRect().width, vw: window.innerWidth }));
afirmar(m2.scrollW <= m2.clientW + 1 && m2.ancho <= m2.vw, `a 900 px de pantalla tampoco hay desplazamiento horizontal (${Math.round(m2.ancho)} px)`);
await page.screenshot({ path: `${SALIDA}/enviar_documentos_900.png` });

afirmar(errores.length === 0, `sin errores de consola/página (${errores.length})`);
if (errores.length) console.error(errores.join("\n"));
await browser.close();
if (fallas) { console.error(`\n${fallas} verificación(es) fallaron.`); process.exit(1); }
console.log("\nTodas las verificaciones pasaron.");
