#!/usr/bin/env node
// Entrega 39 — (1) filtros de país en español, (2) editar/eliminar anotaciones de pago con auditoría, (3) permisos por autor,
// (4) Créditos. Contra fixtures locales (las RPC de db/entrega_39b se simulan); nunca Supabase real.
import { chromium } from "playwright";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { interceptarSupabase, resolverCaptchaLogin } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rutaBundle = resolve(raiz, "bundle.html");
const SALIDA = process.env.SALIDA_VERIFICACION ?? "/tmp/beats_entrega39";
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
  usuariosAuth: [{ id: "auth-admin", email: "admin.prueba@bausch.com", password: "clave-segura-123" }, { id: "auth-otra", email: "otra.persona@bausch.com", password: "clave-segura-123" }],
  tablas: {
    usuarios: [
      usuario("usr-admin", "Admin Prueba", "medica", { email: "admin.prueba@bausch.com", auth_user_id: "auth-admin", es_administrador: true }),
      usuario("usr-otra", "Otra Persona", "finanzas", { email: "otra.persona@bausch.com", auth_user_id: "auth-otra", es_administrador: false }),
    ],
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
    evento_anotaciones_pago: [
      { id: "an-1", evento_id: "evt-1", speaker_id: "spk-A", sesion_id: null, registro_id: null, origen: "expediente", texto: "Nota de la administradora.", autor_id: "usr-admin", autor_nombre: "Admin Prueba", autor_rol: "medica", creado_en: ahora.toISOString(), aclarada: false },
      { id: "an-2", evento_id: "evt-1", speaker_id: "spk-A", sesion_id: null, registro_id: null, origen: "expediente", texto: "Nota de Otra Persona.", autor_id: "usr-otra", autor_nombre: "Otra Persona", autor_rol: "finanzas", creado_en: ahora.toISOString(), aclarada: false },
    ],
    auditoria: [],
    registros_participacion: [reg("r1", "Bogotá"), reg("r2", "Miami", "Estados Unidos")],
    registros_fuerza_ventas: [], muestras_entregadas: [],
    productos_portafolio: [{ id: "prod-1", nombre: "Lumify", activo: true }, { id: "prod-2", nombre: "Pataday", activo: true }],
    archivos_adjuntos: [], notificaciones: [], paises_region: [{ id: "pr-1", pais: "Colombia" }, { id: "pr-2", pais: "United States" }],
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
// RPC simuladas de db/entrega_39b_*.sql: misma regla (autor o administrador) y misma constancia en `auditoria`.
const quien = (sesion) => fixtures.tablas.usuarios.find((u) => u.auth_user_id === sesion?.id);
fixtures.rpc.beats_editar_anotacion_pago = (body, fx, sesion) => {
  const u = quien(sesion); const n = fx.tablas.evento_anotaciones_pago.find((a) => a.id === body.p_id);
  if (!n) throw new Error("La anotación ya no existe.");
  if (n.autor_id !== u.id && !u.es_administrador) throw new Error("Solo quien escribió la anotación o un administrador puede editarla.");
  fx.tablas.auditoria.push({ id: `aud-${fx.tablas.auditoria.length + 1}`, documento_id: n.evento_id, tipo_doc: "evento", documento_nombre: "Simposio de Catarata 2026", actor_id: u.id, accion: "anotacion_pago_editada", detalle: `Texto anterior: "${n.texto}". Texto nuevo: "${body.p_texto}".`, ocurrido_en: new Date().toISOString(), empresa_grupo: "Bausch + Lomb", pais: "Colombia" });
  Object.assign(n, { texto: body.p_texto, editada_en: new Date().toISOString(), editada_por_nombre: u.nombre, editada_veces: (n.editada_veces ?? 0) + 1 });
  return n;
};
fixtures.rpc.beats_eliminar_anotacion_pago = (body, fx, sesion) => {
  const u = quien(sesion); const n = fx.tablas.evento_anotaciones_pago.find((a) => a.id === body.p_id);
  if (!n) throw new Error("La anotación ya no existe.");
  if (n.autor_id !== u.id && !u.es_administrador) throw new Error("Solo quien escribió la anotación o un administrador puede eliminarla.");
  fx.tablas.auditoria.push({ id: `aud-${fx.tablas.auditoria.length + 1}`, documento_id: n.evento_id, tipo_doc: "evento", documento_nombre: "Simposio de Catarata 2026", actor_id: u.id, accion: "anotacion_pago_eliminada", detalle: `Texto eliminado: "${n.texto}".`, ocurrido_en: new Date().toISOString(), empresa_grupo: "Bausch + Lomb", pais: "Colombia" });
  fx.tablas.evento_anotaciones_pago = fx.tablas.evento_anotaciones_pago.filter((a) => a.id !== body.p_id);
  return null;
};

let fallas = 0;
const afirmar = (c, m) => { if (c) console.log(`  OK  ${m}`); else { console.error(`  X   ${m}`); fallas++; } };
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

async function sesion(email) {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => { console.error("  pageerror:", String(e)); fallas++; });
  await interceptarSupabase(page, fixtures);
  await page.goto(pathToFileURL(rutaBundle).href);
  await page.fill("#email", email);
  await page.fill("#password", "clave-segura-123");
  await resolverCaptchaLogin(page);
  await page.click('button[type="submit"]');
  await page.waitForSelector("text=Tablero", { timeout: 10000 });
  return page;
}
async function abrirNotas(page) {
  await page.locator("aside").getByText("Tablero de Documentos", { exact: true }).click();
  await page.waitForSelector("text=Simposio de Catarata 2026", { timeout: 10000 });
  await page.click("text=Simposio de Catarata 2026");
  await page.waitForSelector('[data-testid="tarjeta-expediente"]', { timeout: 8000 });
  await page.click('[data-testid="tarjeta-expediente"] button:has-text("Abrir expediente")');
  await page.waitForSelector('[data-testid="expediente-evento"]', { timeout: 8000 });
  await page.getByRole("tab", { name: /Speakers/ }).click();
  const bloque = page.getByTestId("exp-speaker-Dra. Camila Reyes");
  await bloque.waitFor({ timeout: 5000 });
  const lista = bloque.getByTestId("exp-anotaciones-Dra. Camila Reyes");
  await lista.scrollIntoViewIfNeeded();
  return lista;
}

// =====================================================================================================================
console.log("1. Filtros de país en español");
{
  const page = await sesion("admin.prueba@bausch.com");
  await page.locator("aside").getByText("Asistentes Impactados", { exact: true }).click();
  await page.waitForSelector("#hcp-pais", { timeout: 15000 });
  await page.locator("#hcp-pais").click();
  const opciones = await page.getByRole("option").allInnerTexts();
  afirmar(opciones.includes("Estados Unidos") && !opciones.includes("United States"), `la lista de países está en español (${opciones.join(" | ")})`);
  await page.getByRole("option", { name: "Estados Unidos", exact: true }).click();
  await page.getByRole("button", { name: "Filtrar", exact: true }).click();
  await page.waitForTimeout(800);
  const texto = await page.locator("main").innerText();
  afirmar(/1 HCP\(s\)/.test(texto) && /Miami/.test(texto) && !/Bogotá/.test(texto), "filtrar por «Estados Unidos» muestra al asistente de Estados Unidos (y no al de Colombia)");
  await page.screenshot({ path: `${SALIDA}/asistentes_pais_es.png` });
  await page.context().close();
}

// =====================================================================================================================
console.log("2. Anotaciones: editar y eliminar con auditoría (administrador)");
{
  const page = await sesion("admin.prueba@bausch.com");
  const lista = await abrirNotas(page);
  afirmar((await lista.getByTestId("anotacion-editar").count()) === 2 && (await lista.getByTestId("anotacion-eliminar").count()) === 2, "el administrador puede editar/eliminar las 2 anotaciones");
  await lista.getByTestId("anotacion-pago").nth(1).getByTestId("anotacion-editar").click();
  await lista.getByTestId("anotacion-edicion-texto").fill("Nota de Otra Persona, corregida por el administrador.");
  await lista.getByTestId("anotacion-edicion-guardar").click();
  await page.waitForTimeout(700);
  const n2 = fixtures.tablas.evento_anotaciones_pago.find((a) => a.id === "an-2");
  afirmar(n2.texto.includes("corregida"), "el texto editado se guardó");
  afirmar(n2.autor_nombre === "Otra Persona", "el autor original se conserva");
  afirmar(/Editada por Admin Prueba/.test(await lista.getByTestId("anotacion-editada").first().innerText()), "se muestra «Editada por … · fecha»");
  let aud = fixtures.tablas.auditoria;
  afirmar(aud.length === 1 && aud[0].accion === "anotacion_pago_editada" && aud[0].actor_id === "usr-admin" && /Texto anterior: "Nota de Otra Persona\."/.test(aud[0].detalle), "la edición quedó en auditoría con el usuario y el texto anterior");
  await page.screenshot({ path: `${SALIDA}/anotacion_editada.png` });
  await lista.getByTestId("anotacion-pago").nth(0).getByTestId("anotacion-eliminar").click();
  await page.getByRole("button", { name: "Eliminar", exact: true }).last().click();
  await page.waitForTimeout(700);
  afirmar(!fixtures.tablas.evento_anotaciones_pago.some((a) => a.id === "an-1"), "la anotación eliminada ya no está en la base");
  aud = fixtures.tablas.auditoria;
  afirmar(aud.length === 2 && aud[1].accion === "anotacion_pago_eliminada" && aud[1].actor_id === "usr-admin" && /Nota de la administradora/.test(aud[1].detalle), "la eliminación quedó en auditoría con el usuario y el texto eliminado");
  afirmar((await lista.getByTestId("anotacion-pago").count()) === 1, "la lista se actualiza");
  await page.context().close();
}

// =====================================================================================================================
console.log("3. Anotaciones: un usuario común solo gestiona las suyas");
{
  fixtures.tablas.evento_anotaciones_pago.push({ id: "an-3", evento_id: "evt-1", speaker_id: "spk-A", sesion_id: null, registro_id: null, origen: "expediente", texto: "Otra nota del administrador.", autor_id: "usr-admin", autor_nombre: "Admin Prueba", autor_rol: "medica", creado_en: new Date().toISOString(), aclarada: false });
  const page = await sesion("otra.persona@bausch.com");
  const lista = await abrirNotas(page);
  const filas = lista.getByTestId("anotacion-pago");
  const n = await filas.count();
  let propias = 0, ajenas = 0;
  for (let i = 0; i < n; i++) {
    const f = filas.nth(i);
    const autor = await f.getByTestId("anotacion-autor").innerText();
    const botones = await f.getByTestId("anotacion-editar").count();
    if (/Otra Persona/.test(autor)) { propias++; afirmar(botones === 1 && (await f.getByTestId("anotacion-eliminar").count()) === 1, "ve Editar/Eliminar en su propia anotación"); }
    else { ajenas++; afirmar(botones === 0 && (await f.getByTestId("anotacion-eliminar").count()) === 0, "NO ve Editar/Eliminar en la de otra persona"); }
  }
  afirmar(propias === 1 && ajenas === 1, "hay una propia y una ajena");
  await page.context().close();
}

// =====================================================================================================================
console.log("4. Créditos: fuente menor y bandera bajo «Medellín · Colombia»");
{
  const page = await sesion("admin.prueba@bausch.com");
  await page.locator("aside").getByText("Créditos", { exact: true }).last().click();
  await page.waitForSelector('[data-testid="creditos-empresa"]');
  const tam = await page.locator("main p.text-justify").first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  afirmar(tam < 16 && tam >= 14, `el texto ya no es de 16 px (${tam} px)`);
  const med = await page.getByText("Medellín · Colombia", { exact: true }).boundingBox();
  const ban = await page.getByTestId("creditos-bandera").boundingBox();
  afirmar(ban.y >= med.y + med.height - 1, "la bandera queda debajo de «Medellín · Colombia»");
  afirmar(Math.abs((ban.x + ban.width / 2) - (med.x + med.width / 2)) < 6, "y centrada respecto a esa frase");
  await page.locator("main").screenshot({ path: `${SALIDA}/creditos.png` });
  await page.context().close();
}

await browser.close();
console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLA(S)`);
process.exit(fallas === 0 ? 1 - 1 : 1);
