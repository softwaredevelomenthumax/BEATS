#!/usr/bin/env node
// Entrega 37 —
//  (1) Facturas, notificaciones y comprobantes de cada speaker siguen la modalidad marcada en la solicitud del evento:
//      «Factura única» = UNA factura; «Factura por sesión» = una por sesión; una Notificación de Pago por factura; los
//      comprobantes solo cubren facturas que aún no tienen comprobante.
//  (2) Informe de Pagos: filtros agrupados (País → Evento → Speaker) y «Speaker» como selector en lugar del texto libre.
//  (3) «Pagos aprobados»: «Total facturado» = facturas realmente cargadas, con órdenes de compra y comprobantes para contrastar,
//      y los filtros de arriba se aplican a esta pestaña.
// Todo contra fixtures locales — nunca Supabase real.
import { chromium } from "playwright";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { interceptarSupabase, resolverCaptchaLogin } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rutaBundle = resolve(raiz, "bundle.html");
const SALIDA = process.env.SALIDA_VERIFICACION ?? "/tmp/beats_entrega37";
await mkdir(SALIDA, { recursive: true });
const ahora = new Date();
const dia = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

const spk = (id, nombre) => ({ id, nombre_completo: nombre, especialidad: "Oftalmología", numero_documento: `CC-${id}`, email: `${id}@x.co` });
const part = (id, evento, speaker, nombre, honorarios, modalidad, orden = 1) => ({ id: `esp-${id}`, evento_id: evento, orden, speaker_id: speaker, nombre_speaker: nombre, monto_honorarios: honorarios, monto_inscripcion: 0, factura_modalidad: modalidad, tipo_speaker: "externo" });
const convHcp = (id, evento, speaker, nombre, valor) => ({ id: `ch-${id}`, estado: "Aprobado", creado_por_id: "usr-admin", creado_en: ahora.toISOString(), evento_origen_id: evento, caf_id: "caf-1", speaker_id: speaker, consultor_nombre: nombre, consultor_identificacion: `CC-${id}`, compania_nombre: "Bausch + Lomb", fecha_efectiva: dia(-40), compensacion: valor, moneda: "COP", plazo_pago_dias: 30, campos_personalizados: {}, clausulado_snapshot: null });
const fin = (id, evento, cat, speaker, numero, fecha, valor, archivo = `arc-${id}`) => ({ id: `fin-${id}`, evento_id: evento, categoria: cat, archivo_id: archivo, numero, fecha, valor, moneda: "COP", speaker_id: speaker });
const evento = (id, nombre, pais, ciudad, modalidad) => ({ id, estado: "Aprobado", creado_por_id: "usr-admin", creado_en: ahora.toISOString(), nombre_evento: nombre, empresa_grupo: "Bausch + Lomb", pais, ciudad, moneda: "COP", fecha_inicio_evento: dia(-10), fecha_fin_evento: dia(-10), numero_asistentes: 40, modalidad_sesiones: modalidad, participacion_academica: true, quien_dicta_actividad: "Speaker externo" });

const fixtures = {
  usuariosAuth: [{ id: "auth-admin", email: "admin.prueba@bausch.com", password: "clave-segura-123" }],
  tablas: {
    usuarios: [{ id: "usr-admin", nombre: "Admin Prueba", cargo: "Dirección Médica", email: "admin.prueba@bausch.com", rol: "medica", iniciales: "AP", firma_id: null, debe_cambiar_password: false, auth_user_id: "auth-admin", telefono: "", paginas_permitidas: [], empresas_grupo: ["Bausch + Lomb"], paises_operacion: ["Colombia", "México"], es_administrador: true, administrador_alcance_limitado: false }],
    catalogo_valores: [{ id: "cat-1", catalogo: "monedas", valor: "COP", orden: 1 }, { id: "cat-2", catalogo: "empresasGrupo", valor: "Bausch + Lomb", orden: 1 }],
    speakers: [spk("U", "Dr. Uriel Único"), spk("S", "Dra. Sofía Sesiones"), spk("N", "Dr. Nicolás Nuevo"), spk("M", "Dra. Marta México")],
    solicitudes_evento: [
      evento("evt-1", "Simposio Sesiones 2026", "Colombia", "Bogotá", "Varias sesiones"),
      evento("evt-2", "Congreso México 2026", "México", "Ciudad de México", "Única sesión"),
    ],
    evento_aprobaciones: [],
    sesiones_evento: [
      { id: "ses-1", evento_id: "evt-1", orden: 1, fecha: dia(-10), lugar: "Auditorio 1" },
      { id: "ses-2", evento_id: "evt-1", orden: 2, fecha: dia(-10), lugar: "Auditorio 2" },
    ],
    evento_muestras_planeadas: [], eventos_codigos_acceso: [],
    evento_speakers_participacion: [
      part("U", "evt-1", "U", "Dr. Uriel Único", 8000000, "Factura única", 1),
      part("S", "evt-1", "S", "Dra. Sofía Sesiones", 4000000, "Factura por sesión", 2),
      part("N", "evt-1", "N", "Dr. Nicolás Nuevo", 1000000, "Factura única", 3),
      part("M", "evt-2", "M", "Dra. Marta México", 3000000, "Factura única", 1),
    ],
    evento_speaker_presupuestos: [],
    fmv_checklists: [], fmv_aprobaciones: [],
    convenios_pago_hcp: [],
    convenio_aprobaciones: [],
    convenios_hcp: [
      convHcp("U", "evt-1", "U", "Dr. Uriel Único", 8000000),
      convHcp("S", "evt-1", "S", "Dra. Sofía Sesiones", 4000000),
      convHcp("M", "evt-2", "M", "Dra. Marta México", 3000000),
    ],
    convenio_hcp_aprobaciones: [], convenio_hcp_ajustes_clausula: [], cafs: [], caf_aprobaciones: [],
    // El Dr. Único tiene una Notificación de Pago aprobada por 8M aunque solo se haya cargado una factura de 5M.
    notificaciones_pago_hcp: [
      { id: "np-U", estado: "Aprobado", evento_origen_id: "evt-1", speaker_id: "U", creado_por_id: "usr-admin", creado_en: ahora.toISOString(), nombre_profesional_salud: "Dr. Uriel Único", factura_id: "arc-fa-U", numero_factura: "FAC-U-1", fecha_factura: dia(-8), valor_factura: 8000000, moneda_factura: "COP" },
    ],
    campos_personalizados_definicion: [], etiquetas_campo: [], evento_repositorio_archivos: [],
    evento_registros_financieros: [
      fin("oc-U", "evt-1", "ordenCompra", "U", "OC-U", dia(-9), 8000000),
      fin("oc-S", "evt-1", "ordenCompra", "S", "OC-S", dia(-9), 4000000),
      fin("oc-M", "evt-2", "ordenCompra", "M", "OC-M", dia(-9), 3000000),
    ],
    evento_anotaciones_pago: [],
    registros_participacion: [], registros_fuerza_ventas: [], muestras_entregadas: [], productos_portafolio: [],
    archivos_adjuntos: [], notificaciones: [], paises_region: [{ id: "pr-1", pais: "Colombia" }, { id: "pr-2", pais: "México" }],
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
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push(m.text()); });
await interceptarSupabase(page, fixtures);
await page.goto(pathToFileURL(rutaBundle).href);
await page.fill("#email", "admin.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Tablero", { timeout: 10000 });

const facturasDe = (speaker) => fixtures.tablas.evento_registros_financieros.filter((f) => f.categoria === "facturas" && f.speaker_id === speaker);
const pagosDe = (speaker) => fixtures.tablas.evento_registros_financieros.filter((f) => f.categoria === "comprobantePago" && f.speaker_id === speaker);

/** Llena el formulario compacto (archivo, número, fecha, valor, moneda) dentro de `alcance` sin pulsar el botón. */
async function llenar(alcance, archivo, numero, valor) {
  await alcance.scrollIntoViewIfNeeded();
  await alcance.locator('input[type="file"]').setInputFiles({ name: archivo, mimeType: "image/png", buffer: PNG });
  await page.waitForTimeout(400);
  await alcance.getByPlaceholder("Número").fill(numero);
  await alcance.locator('input[type="date"]').first().fill(dia(-5));
  await alcance.locator('input[inputmode="decimal"]').first().fill(valor);
  await alcance.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "COP", exact: true }).click();
}

// =====================================================================================================================
console.log("1. Expediente › Speakers: abrir el evento");
await page.locator("aside").getByText("Tablero de Documentos", { exact: true }).click();
await page.waitForSelector("text=Simposio Sesiones 2026", { timeout: 10000 });
await page.click("text=Simposio Sesiones 2026");
await page.waitForSelector('[data-testid="tarjeta-expediente"]', { timeout: 8000 });
await page.click('[data-testid="tarjeta-expediente"] button:has-text("Abrir expediente")');
await page.waitForSelector('[data-testid="expediente-evento"]', { timeout: 8000 });
await page.getByRole("tab", { name: /Speakers/ }).click();
const bU = page.getByTestId("exp-speaker-Dr. Uriel Único");
const bS = page.getByTestId("exp-speaker-Dra. Sofía Sesiones");
const bN = page.getByTestId("exp-speaker-Dr. Nicolás Nuevo");
await bU.waitFor({ timeout: 5000 });

console.log("1a. Factura única: una sola factura");
const facU = bU.getByTestId("exp-facturas-Dr. Uriel Único");
await facU.scrollIntoViewIfNeeded();
afirmar(/Factura única/.test(await facU.innerText()), "el bloque indica la modalidad «Factura única» marcada en la solicitud");
afirmar((await facU.getByRole("button", { name: "Agregar factura" }).count()) === 1, "mientras no tenga factura se ofrece cargarla");
// Carrera: otra persona cargó la factura mientras esta pantalla seguía abierta → la validación contra la base la rechaza.
fixtures.tablas.evento_registros_financieros.push(fin("fa-U", "evt-1", "facturas", "U", "FAC-U-1", dia(-8), 5000000, "arc-fa-U"));
await llenar(facU, "u2.png", "FAC-U-2", "5000000");
await facU.getByRole("button", { name: "Agregar factura" }).click();
await page.waitForTimeout(700);
afirmar(facturasDe("U").length === 1, "una segunda factura NO se guarda aunque la pantalla estuviera desactualizada (hay 1)");
afirmar(/factura única/i.test(await page.locator("[data-sonner-toast]").allInnerTexts().then((t) => t.join(" "))), "se avisa con el motivo: factura única ya cargada");
afirmar((await facU.getByRole("button", { name: "Agregar factura" }).count()) === 0, "tras recargar ya no aparece el formulario para agregar otra factura");
afirmar((await facU.getByTestId("factura-unica-completa").count()) === 1, "se explica que la factura única ya está cargada");
afirmar(/Notificación de pago: Aprobado/.test(await facU.innerText()) && /Pendiente de pago/.test(await facU.innerText()), "la factura muestra el estado de su Notificación de Pago (Aprobado) y que sigue pendiente de pago");
afirmar((await facU.getByTestId("facturas-sin-notificacion").count()) === 0, "con su notificación aprobada no se avisa que falte");

console.log("1b. Factura por sesión: una por sesión");
const facS = bS.getByTestId("exp-facturas-Dra. Sofía Sesiones");
await facS.scrollIntoViewIfNeeded();
const cupos = facS.getByTestId("exp-cupo-factura-Dra. Sofía Sesiones");
afirmar((await cupos.count()) === 2, "hay un cupo de factura por cada sesión (2)");
afirmar(/Factura por sesión/.test(await facS.innerText()), "indica «Factura por sesión»");
await llenar(cupos.nth(0), "s1.png", "FAC-S1", "2000000");
await cupos.nth(0).getByRole("button", { name: "Agregar factura de esta sesión" }).click();
await page.waitForTimeout(600);
afirmar(facturasDe("S").length === 1 && facturasDe("S")[0].sesion_id === "ses-1", "la primera factura queda asociada a la sesión 1");
afirmar((await cupos.nth(0).getByRole("button", { name: "Agregar factura de esta sesión" }).count()) === 0, "la sesión 1 ya no admite otra factura");
afirmar((await cupos.nth(1).getByRole("button", { name: "Agregar factura de esta sesión" }).count()) === 1, "la sesión 2 sigue pendiente");
afirmar(/1 de 2/.test(await facS.innerText()), "el estado del bloque muestra 1 de 2 facturas");
await llenar(cupos.nth(1), "s2.png", "FAC-S2", "2000000");
await cupos.nth(1).getByRole("button", { name: "Agregar factura de esta sesión" }).click();
await page.waitForTimeout(600);
afirmar(facturasDe("S").length === 2 && facturasDe("S")[1].sesion_id === "ses-2", "la segunda factura queda en la sesión 2");
afirmar((await facS.getByRole("button", { name: /Agregar factura/ }).count()) === 0, "con las 2 sesiones facturadas no se ofrece ninguna factura más");
afirmar((await facS.getByTestId("facturas-sin-notificacion").count()) === 1 && /FAC-S1, FAC-S2/.test(await facS.getByTestId("facturas-sin-notificacion").innerText()), "se avisa que falta una Notificación de Pago por cada factura");

console.log("1c. Comprobantes: solo sobre facturas sin cubrir");
const pagosS = bS.getByTestId("exp-pagos-Dra. Sofía Sesiones");
await pagosS.scrollIntoViewIfNeeded();
afirmar(/Faltan 2 de 2/.test(await pagosS.innerText()), "el bloque indica que faltan comprobantes de 2 de 2 facturas");
const cubreS = pagosS.getByTestId("comprobante-facturas-que-cubre");
afirmar((await cubreS.locator('button[role="checkbox"]').count()) === 2, "el comprobante puede apuntar a las 2 facturas pendientes");
await llenar(pagosS.getByTestId("exp-form-comprobante-Dra. Sofía Sesiones"), "p1.png", "CP-S1", "2000000");
await pagosS.getByRole("button", { name: "Agregar comprobante de pago" }).click();
await page.waitForTimeout(500);
afirmar(pagosDe("S").length === 0, "sin marcar la factura que cubre, el comprobante NO se guarda");
await cubreS.locator('button[role="checkbox"]').nth(0).click();
await pagosS.getByRole("button", { name: "Agregar comprobante de pago" }).click();
await page.waitForTimeout(700);
afirmar(pagosDe("S").length === 1 && pagosDe("S")[0].factura_id === facturasDe("S")[0].id, "el comprobante cubre solo la factura FAC-S1");
// Una Notificación de Pago aprobada de FAC-S1 aparece en el estado de la factura (se ve tras la recarga siguiente).
fixtures.tablas.notificaciones_pago_hcp.push({ id: "np-S1", estado: "Completado", evento_origen_id: "evt-1", speaker_id: "S", creado_por_id: "usr-admin", creado_en: ahora.toISOString(), nombre_profesional_salud: "Dra. Sofía Sesiones", factura_id: facturasDe("S")[0].archivo_id, numero_factura: "FAC-S1", fecha_factura: dia(-5), valor_factura: 2000000, moneda_factura: "COP" });
afirmar(/Faltan 1 de 2/.test(await pagosS.innerText()), "queda 1 factura sin comprobante");
afirmar(/Facturas sin comprobante de pago \(1 de 2\): FAC-S2/.test(await pagosS.getByTestId("comprobante-pendientes").innerText()), "se nombra la factura pendiente (FAC-S2)");
afirmar((await cubreS.locator('button[role="checkbox"]').count()) === 1, "el nuevo comprobante solo ofrece la factura pendiente");
afirmar(/1 factura\(s\) seleccionada\(s\)/.test(await cubreS.innerText()), "con una sola factura pendiente queda marcada");
await llenar(pagosS.getByTestId("exp-form-comprobante-Dra. Sofía Sesiones"), "p2.png", "CP-S2", "2000000");
await pagosS.getByRole("button", { name: "Agregar comprobante de pago" }).click();
await page.waitForTimeout(700);
afirmar(pagosDe("S").length === 2 && pagosDe("S")[1].factura_id === facturasDe("S")[1].id, "el segundo comprobante cubre FAC-S2");
afirmar((await pagosS.getByTestId("comprobante-todo-cubierto").count()) === 1, "con todo cubierto se avisa y ya no se ofrece cargar más comprobantes");
afirmar((await pagosS.getByRole("button", { name: "Agregar comprobante de pago" }).count()) === 0, "no queda botón para agregar comprobantes");
const textoFacS = await facS.innerText();
afirmar(/Notificación de pago: Completado/.test(textoFacS) && /Sin notificación de pago/.test(textoFacS), "FAC-S1 muestra su Notificación (Completado) y FAC-S2 muestra que le falta");
afirmar((textoFacS.match(/Con comprobante de pago/g) ?? []).length === 2, "las 2 facturas figuran con comprobante de pago");

console.log("1d. Sin facturas no hay comprobantes");
const pagosN = bN.getByTestId("exp-pagos-Dr. Nicolás Nuevo");
await pagosN.scrollIntoViewIfNeeded();
afirmar((await pagosN.getByTestId("comprobante-sin-facturas").count()) === 1, "sin facturas se pide cargarlas primero");
afirmar((await pagosN.getByRole("button", { name: "Agregar comprobante de pago" }).count()) === 0, "no se ofrece cargar comprobantes sin facturas");
await page.screenshot({ path: `${SALIDA}/expediente_speakers.png`, fullPage: false });
while ((await page.getByTestId("ventana-cerrar").count()) > 0) {
  await page.getByTestId("ventana-cerrar").last().click();
  await page.waitForTimeout(250);
}

// =====================================================================================================================
console.log("2. Informe de Pagos: filtros agrupados y selector de Speaker");
await page.locator('nav button:has-text("Informe de Pagos")').click();
await page.waitForSelector('[data-testid="informe-pagos"]', { timeout: 10000 });
await page.waitForSelector('[data-testid="pagos-kpi-consistencia"]', { timeout: 10000 });
const filtros = page.getByTestId("pagos-filtros");
const textoFiltros = await filtros.innerText();
afirmar(!/Speaker o evento/.test(textoFiltros), "ya no existe el campo de texto «Speaker o evento»");
afirmar((await page.locator("#pagos-busqueda").count()) === 0, "ni su cuadro de búsqueda");
afirmar((await page.getByTestId("pagos-filtro-speaker").count()) === 1, "hay un selector de «Speaker»");
const orden = await filtros.evaluate((el) => [...el.querySelectorAll("fieldset")].map((f) => f.getAttribute("data-testid")));
afirmar(orden.join(",") === "pagos-grupo-alcance,pagos-grupo-periodo,pagos-grupo-estado,pagos-grupo-criterios", `los filtros están agrupados en orden: ${orden.join(" → ")}`);
const etiquetasAlcance = await filtros.getByTestId("pagos-grupo-alcance").locator("label").allInnerTexts();
afirmar(etiquetasAlcance.map((t) => t.trim()).join("|") === "País del evento|Evento|Speaker", `dentro del primer grupo, de lo general a lo específico: ${etiquetasAlcance.map((t) => t.trim()).join(" → ")}`);
afirmar(/Desde/.test(await filtros.getByTestId("pagos-grupo-periodo").innerText()) && /Hasta/.test(await filtros.getByTestId("pagos-grupo-periodo").innerText()), "el período (desde/hasta) va junto");
const estadoTxt = await filtros.getByTestId("pagos-grupo-estado").innerText();
afirmar(/Moneda/.test(estadoTxt) && /Estado de conciliación/.test(estadoTxt) && /Hallazgo/.test(estadoTxt), "moneda, estado y hallazgo van juntos");
afirmar(/Tolerancia/.test(await filtros.getByTestId("pagos-grupo-criterios").innerText()), "tolerancia y pendientes forman el grupo de criterios");

await page.getByTestId("pagos-filtro-speaker").click();
let opciones = (await page.getByRole("option").allInnerTexts()).map((t) => t.trim());
afirmar(opciones.includes("Dr. Uriel Único") && opciones.includes("Dra. Sofía Sesiones") && opciones.includes("Dra. Marta México"), `el selector lista los speakers con conciliaciones: ${opciones.join(", ")}`);
afirmar(!opciones.includes("Dr. Nicolás Nuevo"), "no lista speakers sin movimientos");
await page.keyboard.press("Escape");
// Cascada: al elegir un país, solo se ofrecen sus eventos y sus speakers.
await page.locator("#pagos-pais").click();
await page.getByRole("option", { name: "México" }).click();
await page.getByTestId("pagos-filtro-evento").click();
opciones = (await page.getByRole("option").allInnerTexts()).map((t) => t.trim());
afirmar(opciones.includes("Congreso México 2026") && !opciones.includes("Simposio Sesiones 2026"), "con país México solo se ofrecen los eventos de México");
await page.keyboard.press("Escape");
await page.getByTestId("pagos-filtro-speaker").click();
opciones = (await page.getByRole("option").allInnerTexts()).map((t) => t.trim());
afirmar(opciones.includes("Dra. Marta México") && !opciones.includes("Dr. Uriel Único"), "y solo los speakers de ese país");
await page.keyboard.press("Escape");
await page.getByTestId("pagos-limpiar").click();
// Filtrar por speaker
await page.getByTestId("pagos-tab-conciliacion").click();
await page.waitForSelector('[data-testid="pagos-fila"]');
const todas = await page.getByTestId("pagos-fila").count();
afirmar(todas === 3, `3 conciliaciones sin filtros (${todas})`);
await page.getByTestId("pagos-filtro-speaker").click();
await page.getByRole("option", { name: "Dra. Sofía Sesiones" }).click();
afirmar((await page.getByTestId("pagos-fila").count()) === 1 && /Sofía/.test(await page.getByTestId("pagos-fila").first().innerText()), "filtrar por Speaker deja solo sus conciliaciones");
afirmar(/1 conciliación/.test(await page.getByTestId("pagos-resumen-filtros").innerText()), "el resumen de filtros cuenta las conciliaciones resultantes");
await page.screenshot({ path: `${SALIDA}/informe_filtros.png`, fullPage: false });
await page.getByTestId("pagos-limpiar").click();

// =====================================================================================================================
console.log("3. Pagos aprobados: facturado real, órdenes de compra y comprobantes, con los filtros");
await page.getByTestId("pagos-tab-documentos").click();
await page.getByTestId("pagos-tabla-aprobados").waitFor();
await page.waitForSelector('[data-testid="pagos-aprobado-fila"]');
afirmar((await page.getByTestId("pagos-aprobado-fila").count()) === 3, "3 speakers con pago aprobado (Único, Sesiones, México)");
const tot = (await page.getByTestId("pagos-aprobados-total-COP").innerText()).replace(/\s+/g, " ");
// Facturas cargadas: 5M (Único) + 2M + 2M (Sesiones) = 9M. Antes se sumaban convenios y notificaciones: 8+4+3+8 = 23M.
afirmar(/Total facturado \$?\s?9\.000\.000,00/.test(tot) || (/Total facturado/.test(tot) && /9\.000\.000/.test(tot)), "«Total facturado» = 9.000.000 (solo las facturas realmente cargadas) → " + tot);
afirmar(!/23\.000\.000/.test(tot), "ya no suma convenios y notificaciones como si fueran facturado");
afirmar(/Órdenes de compra \$?\s?15\.000\.000/.test(tot) || /15\.000\.000/.test(tot), "muestra el total de órdenes de compra (15.000.000)");
afirmar(/Comprobantes de pago \$?\s?4\.000\.000/.test(tot) || /4\.000\.000/.test(tot), "muestra el total de comprobantes de pago (4.000.000)");
const encabezados = (await page.getByTestId("pagos-tabla-aprobados").locator("thead th").allInnerTexts()).map((t) => t.trim());
afirmar(encabezados.includes("Orden de compra") && encabezados.includes("Facturado") && encabezados.includes("Comprobantes de pago") && encabezados.includes("Notificado") && encabezados.includes("Contratado"), `la tabla contrasta: ${encabezados.filter(Boolean).join(" · ")}`);
const filaU = page.getByTestId("pagos-aprobado-fila").filter({ hasText: "Uriel" });
const textoU = (await filaU.innerText()).replace(/\s+/g, " ");
afirmar(/8\.000\.000/.test(textoU) && /5\.000\.000/.test(textoU), "Dr. Único: contratado/OC/notificado 8M frente a facturado 5M → se ve la diferencia");
afirmar(/sin comprobantes/.test(textoU), "Dr. Único: sin comprobantes de pago");
const filaM = page.getByTestId("pagos-aprobado-fila").filter({ hasText: "Marta" });
afirmar(/sin facturas cargadas/.test(await filaM.innerText()), "Dra. México: aprobada pero sin facturas cargadas → «sin facturas cargadas», no un valor inventado");
// Detalle por documento
await page.getByTestId("pagos-aprobado-fila").filter({ hasText: "Sofía" }).click();
const det = (await page.getByTestId("pagos-aprobado-detalle").innerText()).replace(/\s+/g, " ");
afirmar(/Orden de compra/.test(det) && /FAC-S1/.test(det) && /FAC-S2/.test(det) && /CP-S1/.test(det) && /CP-S2/.test(det) && /Comprobante de pago/.test(det), "el detalle lista OC, facturas y comprobantes");
afirmar(/CP-S1.*FAC-S1/.test(det), "cada comprobante indica qué factura cubre");
afirmar(/Notificación de Pago a HCPs/.test(det) && /Convenio HCP/.test(det), "y también el convenio y la notificación aprobada");
await page.screenshot({ path: `${SALIDA}/pagos_aprobados.png`, fullPage: true });
// Los filtros de arriba se aplican aquí
await page.getByTestId("pagos-filtro-speaker").click();
await page.getByRole("option", { name: "Dra. Sofía Sesiones" }).click();
afirmar((await page.getByTestId("pagos-aprobado-fila").count()) === 1, "con el filtro Speaker, esta pestaña muestra solo ese speaker");
const tot2 = (await page.getByTestId("pagos-aprobados-total-COP").innerText()).replace(/\s+/g, " ");
afirmar(/4\.000\.000/.test(tot2) && !/9\.000\.000/.test(tot2), "y los totales se recalculan con el filtro (facturado 4.000.000)");
await page.getByTestId("pagos-limpiar").click();
await page.locator("#pagos-pais").click();
await page.getByRole("option", { name: "México" }).click();
afirmar((await page.getByTestId("pagos-aprobado-fila").count()) === 1 && /Marta/.test(await page.getByTestId("pagos-aprobado-fila").first().innerText()), "con el filtro País = México solo queda la Dra. México");
await page.getByTestId("pagos-limpiar").click();
await page.getByTestId("pagos-filtro-estado").click();
await page.getByRole("option", { name: "Inconsistente" }).click();
const incons = await page.getByTestId("pagos-aprobado-fila").count();
afirmar(incons >= 1 && incons < 3, `el filtro de estado también aplica (${incons} fila(s) inconsistentes)`);
await page.getByTestId("pagos-limpiar").click();
// CSV
async function descargar(testId) {
  const [d] = await Promise.all([page.waitForEvent("download"), page.getByTestId(testId).click()]);
  const ruta = `${SALIDA}/${testId}.csv`;
  await d.saveAs(ruta);
  return readFile(ruta, "utf8");
}
const csvDocs = await descargar("pagos-csv-legado");
afirmar(/Orden de compra/.test(csvDocs) && /Comprobante de pago/.test(csvDocs) && /FAC-S1/.test(csvDocs) && /Notificación de Pago a HCPs/.test(csvDocs), "el CSV de Pagos aprobados trae OC, facturas, comprobantes y notificaciones");
const csvContraste = await descargar("pagos-csv-contraste");
afirmar(/Facturado \(facturas cargadas\)/.test(csvContraste) && /Pagado \(comprobantes de pago\)/.test(csvContraste) && csvContraste.split("\r\n").filter(Boolean).length === 4, "el CSV de contraste trae una fila por speaker (3) con facturado y pagado");
// Filtro aplicado también al CSV
await page.getByTestId("pagos-filtro-speaker").click();
await page.getByRole("option", { name: "Dra. Marta México" }).click();
const csvFiltrado = await descargar("pagos-csv-contraste");
afirmar(csvFiltrado.split("\r\n").filter(Boolean).length === 2 && /Marta/.test(csvFiltrado) && !/Uriel/.test(csvFiltrado), "el CSV respeta los filtros aplicados");

afirmar(errores.length === 0, `sin errores de consola/página (${errores.length}) ${errores.slice(0, 3).join(" | ")}`);
await browser.close();
if (fallas) { console.error(`\n${fallas} verificación(es) fallaron.`); process.exit(1); }
console.log("\nTodas las verificaciones pasaron.");
