#!/usr/bin/env node
// Fase 7 — verifica "BEATS — Ejecución en Sitio" (ejecucion.html): la app
// pública sin login que solo habla con Supabase a través de las 4 RPC
// reales (`validar_codigo_evento_ejecucion`, `crear_registro_participacion`,
// `registrar_muestra_entregada`), cuyo código fuente exportó el usuario con
// `pg_get_functiondef`. Cubre el flujo feliz completo (código -> check-in
// con firma -> entrega de muestras con su propia firma), el rechazo de
// negocio de "muestra duplicada" (mensaje exacto de la función real, sin
// reintento), y la cola offline en IndexedDB: falla de red -> se encola ->
// reintento manual sigue fallando sin conexión -> se agota a los 5
// intentos -> vuelve a conectar y un reintento manual sincroniza el
// check-in encolado y, encadenado, la entrega de muestras que quedó
// pendiente de él. Todo contra fixtures locales — nunca contra Supabase
// real.
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  interceptarSupabase,
  crearHandlerValidarCodigoEjecucion,
  crearHandlerCrearRegistroParticipacion,
  crearHandlerRegistrarMuestraEntregada,
} from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rutaBundle = resolve(raiz, "ejecucion.html");

const fixtures = {
  tablas: {
    solicitudes_evento: [
      {
        id: "evt-1",
        estado: "Aprobado",
        nombre_evento: "Simposio de Catarata 2026",
        entrega_muestras_medicas: true,
        modalidad_sesiones: "Única sesión",
        participacion_academica: false,
      },
    ],
    eventos_codigos_acceso: [
      { id: "cod-1", evento_id: "evt-1", codigo: "A3F7K9", activo: true, creado_por_id: "usr-1", creado_en: new Date().toISOString(), expira_en: null },
    ],
    evento_muestras_planeadas: [
      { id: "emp-1", evento_id: "evt-1", producto_id: "prod-1", cantidad_aproximada: 5, orden: 1 },
    ],
    productos_portafolio: [
      { id: "prod-1", nombre: "Lente Intraocular X200", empresa_grupo: "Bausch + Lomb", activo: true, orden: 1 },
    ],
    catalogo_valores: [
      { id: "cat-1", catalogo: "areasEspecialidadEvento", valor: "Oftalmología", orden: 1 },
      { id: "cat-2", catalogo: "areasEspecialidadEvento", valor: "Glaucoma", orden: 2 },
      { id: "cat-3", catalogo: "tiposDocumento", valor: "Cédula", orden: 1 },
      { id: "cat-4", catalogo: "tiposDocumento", valor: "Pasaporte", orden: 2 },
    ],
    configuracion_formatos: [
      { id: 1, declaracion_tratamiento_datos: "Autorizo el tratamiento de mis datos personales para los fines de este evento." },
    ],
    sesiones_evento: [],
    sesiones_ejecucion_evento: [],
    registros_participacion: [],
    muestras_entregadas: [],
    archivos_adjuntos: [],
  },
  rpc: {
    validar_codigo_evento_ejecucion: crearHandlerValidarCodigoEjecucion(),
    crear_registro_participacion: crearHandlerCrearRegistroParticipacion(),
    registrar_estado_provincia_participacion: (body, fx) => {
      const fila = fx.tablas.registros_participacion.find((r) => r.id === body.p_registro_participacion_id);
      if (fila && !fila.estado_provincia) fila.estado_provincia = body.p_estado_provincia;
      return null;
    },
    registrar_muestra_entregada: crearHandlerRegistrarMuestraEntregada(),
  },
};

let fallas = 0;
function afirmar(condicion, mensaje) {
  if (condicion) {
    console.log(`  OK  ${mensaje}`);
  } else {
    console.error(`  X   ${mensaje}`);
    fallas++;
  }
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext();
const page = await context.newPage();
// "Failed to load resource" es el mensaje que el propio Chromium agrega a
// la consola cuando un `fetch` termina en un status distinto de 2xx o es
// abortado — y este script, a propósito, provoca RPC con error 400 (código
// inválido, muestra duplicada) y peticiones abortadas (`simularSinConexion`)
// para probar exactamente esos caminos. No es un error de la app, así que
// se filtra antes de exigir consola limpia.
const erroresConsola = [];
page.on("pageerror", (e) => erroresConsola.push(String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error" && !/Failed to load resource/.test(msg.text())) erroresConsola.push(msg.text());
});

await interceptarSupabase(page, fixtures);

// Firma con el mouse sobre el único <canvas> visible en la pantalla actual.
// `scrollIntoViewIfNeeded` es imprescindible: el formulario es más alto que
// el viewport y `page.mouse.*` (a diferencia de `.click()`) no hace scroll
// automático, así que sin esto se "firma" fuera de la pantalla visible.
async function firmar(page) {
  const canvas = page.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const caja = await canvas.boundingBox();
  await page.mouse.move(caja.x + 20, caja.y + 20);
  await page.mouse.down();
  await page.mouse.move(caja.x + 80, caja.y + 60);
  await page.mouse.move(caja.x + 140, caja.y + 20);
  await page.mouse.up();
}

/** Octubre 2026: tipo de documento, especialidad (médicos), celular, correo, dirección, país, estado y ciudad son obligatorios. */
async function completarObligatorios(page, { nombre = "persona" } = {}) {
  if (await page.locator("#ci-especialidad").count()) {
    await page.locator("#ci-especialidad").click();
    await page.getByRole("option", { name: "Oftalmología" }).click();
  }
  await page.fill("#ci-celular", "3001234567");
  await page.fill("#ci-email", `${nombre}@correo.com`);
  await page.fill("#ci-direccion", "Calle 1 # 2-3");
  await page.locator("#ci-pais").click();
  await page.getByRole("option", { name: "Colombia" }).click();
  await page.locator("#ci-estado").click();
  await page.getByRole("option", { name: "Antioquia" }).click();
  await page.locator("#ci-ciudad").click();
  await page.getByRole("option", { name: "Medellín" }).first().click();
}

console.log("1. Código inválido no deja pasar");
await page.goto(pathToFileURL(rutaBundle).href);
await page.fill("#ej-codigo", "ZZZZZZ");
await page.fill("#ej-responsable", "Carlos Ruiz");
await page.click('button:has-text("Ingresar")');
await page.waitForTimeout(300);
afirmar(await page.isVisible("text=Código inválido o expirado."), "código inexistente muestra el mensaje exacto de la función real");
afirmar(await page.isVisible("#ej-codigo"), "sigue en la pantalla de código de acceso");

console.log("2. Código válido abre la sesión de ejecución");
await page.fill("#ej-codigo", "A3F7K9");
await page.click('button:has-text("Ingresar")');
await page.waitForSelector("text=Simposio de Catarata 2026", { timeout: 5000 });
afirmar(await page.isVisible("text=Responsable: Carlos Ruiz"), "queda registrado el responsable de la sesión de ejecución");
afirmar(fixtures.tablas.sesiones_ejecucion_evento.length === 1, "se insertó una nueva fila en sesiones_ejecucion_evento (nunca se reutiliza una existente)");

console.log("3. Check-in completo con firma + entrega de muestras (flujo feliz, en línea)");
await page.click('button:has-text("Nuevo registro de asistencia")');
await page.waitForSelector("#ci-nombres", { timeout: 5000 });
await page.fill("#ci-nombres", "Juan");
await page.fill("#ci-apellidos", "Pérez");
await page.fill("#ci-cedula", "123456");
await completarObligatorios(page, { nombre: "juan" });
await page.getByLabel("Tipo de participación *").click();
await page.getByRole("option", { name: "Evento" }).click();
await firmar(page);
await page.click('button:has-text("Guardar registro")');
await page.waitForSelector("text=Entrega de muestras médicas", { timeout: 5000 });
afirmar(fixtures.tablas.registros_participacion[0]?.estado_provincia === "Antioquia", "el Estado/Departamento queda guardado en el registro (RPC complementaria)");
afirmar(fixtures.tablas.registros_participacion.length === 1, "se creó el registro de participación vía RPC");
afirmar(fixtures.tablas.registros_participacion[0].especialidad === "Oftalmología", "el registro guarda la especialidad seleccionada");

await page.fill("#muestra-prod-1", "2");
await firmar(page);
await page.click('button:has-text("Confirmar entrega")');
await page.waitForSelector("text=Listo", { timeout: 5000 });
afirmar(fixtures.tablas.muestras_entregadas.length === 1, "se registró la entrega de muestras vía RPC");
afirmar(fixtures.tablas.muestras_entregadas[0].cantidad === 2, "se guardó la cantidad entregada indicada");
afirmar(await page.isVisible("text=guardados correctamente"), "la confirmación indica que todo quedó guardado (sin mención de pendiente de sincronizar)");

console.log("4. Segundo check-in de la MISMA persona (misma cédula) + intento de entregar el mismo producto otra vez");
await page.click('button:has-text("Nuevo registro")');
await page.waitForSelector("#ci-nombres", { timeout: 5000 });
await page.fill("#ci-nombres", "Juan");
await page.fill("#ci-apellidos", "Pérez");
await page.fill("#ci-cedula", "123456");
await completarObligatorios(page, { nombre: "juan" });
await page.getByLabel("Tipo de participación *").click();
await page.getByRole("option", { name: "Stand" }).click();
await firmar(page);
await page.click('button:has-text("Guardar registro")');
await page.waitForSelector("text=Entrega de muestras médicas", { timeout: 5000 });
await page.fill("#muestra-prod-1", "1");
await firmar(page);
await page.click('button:has-text("Confirmar entrega")');
await page.waitForTimeout(400);
afirmar(
  await page.isVisible(
    'text=Este médico ya recibió muestra de "Lente Intraocular X200" en este evento. No se puede registrar de nuevo.',
  ),
  "la entrega duplicada del mismo producto a la misma cédula muestra el mensaje EXACTO de la función real",
);
afirmar(fixtures.tablas.muestras_entregadas.length === 1, "la entrega duplicada NO se insertó (rechazo de negocio, no se reintenta)");
afirmar(await page.isVisible("text=Entrega de muestras médicas"), "el rechazo de negocio deja al usuario en el mismo formulario para corregir");
await page.click('button:has-text("Sin entrega de muestras")');
await page.waitForSelector("text=Listo", { timeout: 5000 });
await page.click('button:has-text("Volver al menú")');

console.log("5. Sin conexión: el check-in se guarda en la cola offline (IndexedDB) en vez de perderse");
fixtures.simularSinConexion = true;
await page.click('button:has-text("Nuevo registro de asistencia")');
await page.waitForSelector("#ci-nombres", { timeout: 5000 });
await page.fill("#ci-nombres", "María");
await page.fill("#ci-apellidos", "Gómez");
await page.fill("#ci-cedula", "987654");
await completarObligatorios(page, { nombre: "maria" });
await page.getByLabel("Tipo de participación *").click();
await page.getByRole("option", { name: "Evento" }).click();
await firmar(page);
await page.click('button:has-text("Guardar registro")');
await page.waitForSelector("text=Entrega de muestras médicas", { timeout: 5000 });
afirmar(fixtures.tablas.registros_participacion.length === 2, "el registro offline todavía NO llegó al servidor (sigue en 2, no en 3)");

console.log("   Captura también la entrega de muestras mientras sigue sin conexión (queda colgada del mismo ítem de cola)");
await page.fill("#muestra-prod-1", "1");
await firmar(page);
await page.click('button:has-text("Confirmar entrega")');
await page.waitForSelector("text=Listo", { timeout: 5000 });
afirmar(await page.isVisible("text=sin conexión"), "la confirmación avisa que quedó guardado sin conexión");
await page.click('button:has-text("Volver al menú")');

const botonCola = page.locator('button:has-text("Cola de sincronización")');
await botonCola.waitFor({ timeout: 3000 });
afirmar(await botonCola.isVisible(), "aparece el indicador de la cola de sincronización pendiente");
await botonCola.click();
afirmar(await page.isVisible("text=Registro de asistencia — María Gómez"), "el panel de la cola muestra el registro pendiente de María Gómez");

console.log("6. Reintentos manuales sin conexión: incrementan intentos hasta agotarse a los 5");
for (let intento = 1; intento <= 5; intento++) {
  await page.click('button:has-text("Reintentar ahora")');
  await page.waitForTimeout(200);
  afirmar(await page.isVisible(`text=Intentos: ${intento}/5`), `tras el intento ${intento} el panel muestra Intentos: ${intento}/5`);
}
afirmar(await page.isVisible("text=Reintentos automáticos agotados"), "a los 5 intentos fallidos el ítem queda marcado como agotado");
afirmar(fixtures.tablas.registros_participacion.length === 2, "sigue sin sincronizar mientras no hay red (los reintentos fallidos no insertan nada)");

console.log("7. Al recuperar la conexión, un reintento manual sincroniza el check-in y encadena la entrega de muestras pendiente");
fixtures.simularSinConexion = false;
await page.click('button:has-text("Reintentar de todas formas")');
await page.waitForTimeout(500);
afirmar(fixtures.tablas.registros_participacion.length === 3, "el check-in de María Gómez quedó sincronizado");
afirmar(fixtures.tablas.muestras_entregadas.length === 2, "la entrega de muestras que estaba colgada del mismo ítem se envió automáticamente al conocerse el id real del registro");
const registroMaria = fixtures.tablas.registros_participacion.find((r) => r.cedula === "987654");
afirmar(
  fixtures.tablas.muestras_entregadas.some((m) => m.registro_participacion_id === registroMaria?.id),
  "la entrega de muestras sincronizada quedó asociada al registro de participación correcto (no a uno cualquiera)",
);
afirmar(!(await page.locator('button:has-text("Cola de sincronización")').isVisible()), "la cola de sincronización queda vacía tras sincronizar todo");

afirmar(erroresConsola.length === 0, `sin errores de consola/página (encontrados: ${erroresConsola.length})`);
if (erroresConsola.length > 0) console.error(erroresConsola.join("\n"));

await browser.close();

if (fallas > 0) {
  console.error(`\n${fallas} verificación(es) fallaron.`);
  process.exit(1);
}
console.log("\nTodas las verificaciones pasaron.");
