#!/usr/bin/env node
// Fase 3 — verifica el ciclo completo del Convenio de Pago a HCP (con sus
// condicionales de Consejo de Asesores / Funcionario de Gobierno) y del
// Convenio HCP (contrato de consultoría, con su clausulado legal
// versionado, la sustitución de {{empresa}}, un ajuste puntual de cláusula
// y la impresión bilingüe). Todo contra fixtures locales.
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { interceptarSupabase, crearHandlerResolverAprobacion,
  resolverCaptchaLogin, } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rutaBundle = resolve(raiz, "bundle.html");

const fixtures = {
  usuariosAuth: [{ id: "auth-admin", email: "admin.prueba@bausch.com", password: "clave-segura-123" }],
  tablas: {
    usuarios: [
      {
        id: "usr-admin",
        nombre: "Admin Prueba",
        cargo: "Dirección Médica",
        email: "admin.prueba@bausch.com",
        rol: "medica",
        iniciales: "AP",
        firma_id: null,
        debe_cambiar_password: false,
        auth_user_id: "auth-admin",
        telefono: "",
        paginas_permitidas: [],
        empresas_grupo: ["Bausch + Lomb"],
        paises_operacion: ["Colombia"],
        es_administrador: true,
        administrador_alcance_limitado: false,
      },
    ],
    v_documentos: [
      {
        id: "evt-1",
        tipo_doc: "evento",
        estado: "Aprobado",
        creado_por_id: "usr-admin",
        creado_en: new Date().toISOString(),
        nombre: "Simposio de Retina 2026",
      },
    ],
    catalogo_valores: [
      { id: "cat-1", catalogo: "departamentosConvenio", valor: "Marketing", orden: 1 },
      { id: "cat-2", catalogo: "tiposActividadConvenio", valor: "Consultoría", orden: 1 },
      { id: "cat-3", catalogo: "organizadoPorConvenio", valor: "Compañía", orden: 1 },
      { id: "cat-4", catalogo: "monedas", valor: "COP", orden: 1 },
      { id: "cat-5", catalogo: "monedas", valor: "USD", orden: 2 },
      { id: "cat-6", catalogo: "empresasGrupo", valor: "Bausch + Lomb", orden: 1 },
    ],
    speakers: [
      { id: "spk-1", nombre_completo: "Dra. Camila Reyes", especialidad: "Oftalmología" },
    ],
    cafs: [
      {
        id: "caf-99",
        estado: "Aprobado",
        creado_por_id: "usr-admin",
        creado_en: new Date().toISOString(),
        codigo_documento: "CAF-2026-099",
        compania_nombre: "Bausch + Lomb",
      },
    ],
    caf_aprobaciones: [],
    plantilla_convenio_hcp_version: [
      {
        id: "plantilla-1",
        vigente_desde: new Date(Date.now() - 86400000).toISOString(),
        creado_por_id: "usr-admin",
        notas_version: "Versión inicial de prueba",
        numerales: [
          {
            numero: 1,
            textoEs: "1. Término. Vigente desde la Fecha Efectiva. {{empresa}} podrá terminar en cualquier momento.",
            textoEn: "1. Term. Effective from the Effective Date. {{empresa}} may terminate at any time.",
          },
          {
            numero: 2,
            textoEs: "2. Servicios. El Consultor prestará servicios a {{empresa}}.",
            textoEn: "2. Services. Consultant shall provide services to {{empresa}}.",
          },
          ...Array.from({ length: 13 }, (_, i) => ({ numero: i + 3, textoEs: "", textoEn: "" })),
        ],
        anexo_c_en: "Exhibit C: data processing authorization for {{empresa}}.",
        anexo_c_es: "Anexo C: autorización de tratamiento de datos para {{empresa}}.",
        anexo_d_en: "Exhibit D: habeas data of {{empresa}}.",
        anexo_d_es: "Anexo D: habeas data de {{empresa}}.",
        empresa_grupo: null,
      },
    ],
    convenios_pago_hcp: [],
    convenio_aprobaciones: [],
    convenios_hcp: [],
    convenio_hcp_aprobaciones: [],
    convenio_hcp_ajustes_clausula: [],
    campos_personalizados_definicion: [],
    etiquetas_campo: [],
    // País del HCP ahora es siempre un desplegable (SelectPaisCiudad) —
    // necesita el catálogo `paises_region`. Sin `paises_region_ciudades`,
    // Ciudad sigue siendo texto libre, que es lo que este script ya
    // espera (`.fill()`).
    paises_region: [{ id: "pr-1", pais: "Colombia" }],
  },
  rpc: {
    resolver_aprobacion_convenio: crearHandlerResolverAprobacion("convenios_pago_hcp", "convenio_aprobaciones", "convenio"),
    resolver_aprobacion_convenio_hcp: crearHandlerResolverAprobacion("convenios_hcp", "convenio_hcp_aprobaciones", "convenio_hcp"),
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
const page = await browser.newPage();
const erroresConsola = [];
page.on("pageerror", (e) => erroresConsola.push(String(e)));
page.on("console", (msg) => {
  // Filtra "Failed to load resource": incluye la hoja de Google Fonts que
  // los bundles cargan por <link> (ver verificar_caf.mjs) y que no hay
  // internet para resolver en un entorno de pruebas — no es un error de la app.
  if (msg.type() === "error" && !/Failed to load resource/.test(msg.text())) erroresConsola.push(msg.text());
});

await interceptarSupabase(page, fixtures);

console.log("1. Login e ir a Nuevo Convenio de Pago a HCP");
await page.goto(pathToFileURL(rutaBundle).href);
await page.fill("#email", "admin.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Tablero", { timeout: 5000 });
await page.click('button:has-text("Convenio de Pago a HCP")');
await page.waitForSelector("text=Nuevo Convenio de Pago a HCP", { timeout: 5000 });
afirmar(await page.isVisible("text=Nuevo Convenio de Pago a HCP"), "se abre el formulario de Nuevo Convenio de Pago a HCP");

console.log("2. Completar el formulario con los condicionales activados");
await page.getByLabel("Empleado responsable (nombre y cargo) *").fill("Laura Gómez — Gerente de Marketing");
await page.locator("#convenio-departamento").click();
await page.getByRole("option", { name: "Marketing" }).click();
await page.getByLabel("Unidad de negocio / ubicación *").fill("Bogotá");
await page.locator("#convenio-tipo-actividad").click();
await page.getByRole("option", { name: "Consultoría" }).click();
await page.locator("#convenio-organizado-por").click();
await page.getByRole("option", { name: "Compañía" }).click();
// A7: "Nombre del organizador" ahora solo se muestra cuando "Organizado
// por" es "Otro"/"Tercero" — "Compañía" ya identifica un organizador
// concreto, así que el campo queda oculto (y no es obligatorio) y no hay
// nada que llenar aquí.
await page.getByLabel("Tipo de servicio *").fill("Asesoría médica");
await page.getByLabel("Nombre del evento / servicio *").fill("Consejo Asesor Retina 2026");
await page.getByLabel("Lugar de la reunión *").fill("Hotel Marriott, Bogotá");
await page.getByLabel("Agenda de la reunión *").fill("9am bienvenida, 10am discusión clínica, 12pm cierre.");
await page.locator("#convenio-speaker").click();
await page.getByRole("option", { name: "Dra. Camila Reyes" }).click();
await page.getByLabel("Nombre completo del HCP *").fill("Dra. Camila Reyes");
await page.getByLabel("Cédula / licencia del HCP *").fill("CC-12345");
await page.getByLabel("Dirección del HCP *").fill("Calle 10 # 5-20");
await page.getByLabel("País del HCP *").click();
await page.getByRole("option", { name: "Colombia" }).click();
await page.getByLabel("Ciudad del HCP *").fill("Bogotá");

await page.locator("#convenio-es-consejo").click();
await page.getByLabel("Título del Consejo de Asesores *").fill("Consejo Asesor de Retina");
await page.getByLabel("Número de HCPs convocados *").fill("5");
await page.getByLabel("Justificación del número de HCPs *").fill("Cobertura nacional de subespecialistas en retina.");

await page.locator("#convenio-es-gobierno").click();
await page.locator("#convenio-supuesto-cargo").click();

await page.getByLabel("Objetivo *").fill("Recoger retroalimentación clínica sobre el portafolio de retina.");
await page.getByLabel("Criterios de selección *").fill("Experiencia clínica y publicaciones en el área.");
await page.getByLabel("Contraprestación al HCP *").fill("3000000");
await page.locator("#convenio-moneda").click();
await page.getByRole("option", { name: "COP", exact: true }).click();
await page.locator("#convenio-firma-certifica").click();

await page.click('button:has-text("Enviar a aprobación")');
await page.waitForSelector("text=Consejo Asesor de Retina", { timeout: 5000 }).catch(() => {});
await page.waitForSelector("text=Dra. Camila Reyes", { timeout: 5000 });
afirmar(await page.isVisible("text=Pendiente"), "el Convenio de Pago queda en estado Pendiente");

console.log("3. Aprobar las 3 etapas de la cadena del Convenio de Pago");
await page.click("text=Dra. Camila Reyes");
await page.waitForSelector("text=Cadena de aprobación", { timeout: 5000 });
for (const etapa of ["Jefe de Unidad de Negocios", "Director Médico", "Área Legal"]) {
  afirmar(await page.isVisible(`text=${etapa}`), `se ve la etapa: ${etapa}`);
  await page.getByPlaceholder("Comentario (obligatorio para rechazar)").fill(`Aprobado — ${etapa}`);
  await page.click('button:has-text("Aprobar")');
  await page.waitForTimeout(300);
}
const convenioQuedoAprobado = await page
  .waitForSelector('[role="dialog"] >> text=Aprobado', { timeout: 3000 })
  .then(() => true)
  .catch(() => false);
afirmar(convenioQuedoAprobado, "el Convenio de Pago queda Aprobado tras la última etapa (vía RPC resolver_aprobacion_convenio)");

console.log("4. Ventana de adenda sobre el Convenio de Pago ya Aprobado (A27)");
// A diferencia de Evento (que reutiliza RPCs reales pre-existentes), esta
// es una función NUEVA (abrirVentanaAdendaConvenio/cerrarVentanaAdendaConvenio
// en src/lib/convenio.ts) que usa `.insert()`/`.update()` directos sobre la
// tabla real `adendas_convenio_pago_hcp` — sin handler de RPC especial, el
// interceptor genérico de tablas de fixtures.mjs ya la cubre.
await page.click('button:has-text("Adenda o ajuste al formulario")');
await page.getByPlaceholder("Justificación de la adenda").fill("El HCP solicitó cambiar la ciudad de la reunión.");
await page.click('button:has-text("Continuar")');
await page.waitForSelector("text=vuelve a Pendiente y se reinicia la cadena", { timeout: 5000 });
await page.getByLabel("Ciudad del HCP *").fill("Medellín");
await page.click('button:has-text("Guardar y reenviar")');
await page.waitForTimeout(300);
afirmar(await page.isVisible("text=Pendiente"), "tras guardar la adenda, el Convenio de Pago vuelve a Pendiente");

console.log("4b. Re-aprobar las 3 etapas tras la adenda");
for (const etapa of ["Jefe de Unidad de Negocios", "Director Médico", "Área Legal"]) {
  await page.getByPlaceholder("Comentario (obligatorio para rechazar)").fill(`Re-aprobado tras adenda — ${etapa}`);
  await page.click('button:has-text("Aprobar")');
  await page.waitForTimeout(300);
}
const convenioQuedoAprobadoTrasAdenda = await page
  .waitForSelector('[role="dialog"] >> text=Aprobado', { timeout: 3000 })
  .then(() => true)
  .catch(() => false);
afirmar(convenioQuedoAprobadoTrasAdenda, "el Convenio de Pago vuelve a quedar Aprobado tras re-aprobar la cadena reiniciada por la adenda");
afirmar(await page.isVisible("text=Medellín"), "el cambio hecho durante la adenda (ciudad del HCP) quedó guardado");
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

console.log("5. Anular el Convenio de Pago ya aprobado");
await page.click("text=Dra. Camila Reyes");
await page.waitForSelector("text=Cadena de aprobación", { timeout: 5000 });
await page.click('button:has-text("Anular")');
await page.getByPlaceholder("Motivo de anulación").fill("Se cancela la reunión del consejo asesor.");
await page.click('button:has-text("Confirmar anulación")');
await page.waitForTimeout(300);
afirmar(await page.isVisible('[role="dialog"] >> text=Anulado'), "el Convenio de Pago queda Anulado");
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

console.log("6. Nuevo Convenio HCP: clausulado con sustitución de {{empresa}}");
await page.click('button:has-text("Convenio HCP")');
await page.waitForSelector("text=Nuevo Convenio HCP", { timeout: 5000 });
await page.locator("#cvhcp-evento-origen").click();
await page.getByRole("option", { name: "Simposio de Retina 2026" }).click();
await page.locator("#cvhcp-caf").click();
await page.getByRole("option", { name: "CAF-2026-099" }).click();
await page.getByLabel("Nombre del consultor / HCP *").fill("Dra. Camila Reyes");
await page.getByLabel("Identificación del consultor *").fill("CC-12345");
await page.getByLabel("Correo del consultor *").fill("camila.reyes@example.com");
await page.locator("#cvhcp-direccion").fill("Calle 10 # 5-20, Bogotá");
await page.locator("#cvhcp-compania").click();
await page.getByRole("option", { name: "Bausch + Lomb" }).click();
await page.getByLabel("Firma por la compañía (Director General) *").fill("Carlos Ruiz");
await page.locator("#cvhcp-objetivo-es").fill("Asesoría médica especializada en retina.");
await page.locator("#cvhcp-servicios-es").fill("Servicios de consultoría clínica durante el evento.");
await page.getByLabel("Compensación *").fill("8000000");
await page.locator("#cvhcp-moneda").click();
await page.getByRole("option", { name: "COP", exact: true }).click();

await page.click('button:has-text("Enviar a aprobación")');
// Fase 8 (rediseño del Tablero): el Convenio HCP no tiene todavía ningún
// selector de Speaker en su formulario (`speakerId` siempre queda null en
// esta reconstrucción — ver src/lib/precargado.ts), así que el título de
// su tarjeta cae al nombre del consultor tal cual se escribió en el
// formulario, sin especialidad ni compañía. Como el Convenio de Pago a
// HCP anterior en esta misma prueba SÍ resuelve un speaker (título "Dra.
// Camila Reyes – Oftalmología"), se usa `exact: true` para no confundir
// ambas tarjetas (una es substring de la otra).
await page.getByText("Dra. Camila Reyes", { exact: true }).waitFor({ timeout: 5000 }).catch(() => {});
afirmar(await page.getByText("Dra. Camila Reyes", { exact: true }).isVisible(), "el Convenio HCP aparece en el Tablero tras enviarlo");

console.log("7. Abrir el Convenio HCP e imprimir con {{empresa}} sustituido");
await page.getByText("Dra. Camila Reyes", { exact: true }).click();
await page.waitForSelector("text=Clausulado", { timeout: 5000 });
afirmar(
  await page.isVisible("text=Bausch + Lomb podrá terminar en cualquier momento"),
  "el numeral 1 muestra el nombre real de la compañía en vez de {{empresa}}",
);
afirmar(
  await page.isVisible("text=autorización de tratamiento de datos para Bausch + Lomb"),
  "el Anexo C también sustituye {{empresa}}",
);

console.log("8. Cambiar a inglés y verificar el clausulado bilingüe");
await page.click('button:has-text("English")');
afirmar(
  await page.isVisible("text=Bausch + Lomb may terminate at any time"),
  "el clausulado en inglés también sustituye {{empresa}}",
);
await page.click('button:has-text("Español")');

console.log("9. Ajustar el Numeral 2 solo para este contrato");
// Nota: el Select de sección arranca ya con "Numeral 1" seleccionado por
// defecto (primer valor de SECCIONES_CLAUSULADO), y Radix Select no dispara
// onValueChange si se reselecciona el mismo valor — por eso la prueba ajusta
// el Numeral 2 (un valor distinto al default), que sí dispara el cambio y
// abre el panel de ajuste.
await page.locator("#convenio-hcp-seccion-ajuste").click();
await page.getByRole("option", { name: "Numeral 2", exact: true }).click();
await page.waitForSelector("#ajuste-texto-es", { timeout: 5000 });
await page.locator("#ajuste-texto-es").fill("2. Servicios (ajustado). Este contrato tiene una duración especial de 6 meses.");
await page.locator("#ajuste-justificacion").fill("El comité legal solicitó acortar el plazo para este caso puntual.");
await page.click('button:has-text("Guardar ajuste")');
await page.waitForTimeout(300);
afirmar(
  await page.isVisible("text=Este contrato tiene una duración especial de 6 meses"),
  "el ajuste puntual de cláusula reemplaza el texto de la plantilla en la impresión",
);

console.log("10. Aprobar las 2 etapas de la cadena del Convenio HCP");
for (const etapa of ["Visto Bueno Legal/Compliance", "Firma Gerencia General"]) {
  afirmar(await page.isVisible(`text=${etapa}`), `se ve la etapa: ${etapa}`);
  await page.getByPlaceholder("Comentario (obligatorio para rechazar)").fill(`Aprobado — ${etapa}`);
  await page.click('button:has-text("Aprobar")');
  await page.waitForTimeout(300);
}
const convenioHcpQuedoAprobado = await page
  .waitForSelector('[role="dialog"] >> text=Aprobado', { timeout: 3000 })
  .then(() => true)
  .catch(() => false);
afirmar(convenioHcpQuedoAprobado, "el Convenio HCP queda Aprobado tras la última etapa (vía RPC resolver_aprobacion_convenio_hcp)");
afirmar(
  !(await page.isVisible("text=Ajustar una cláusula")),
  "una vez Aprobado, ya no se puede ajustar el clausulado (texto fijo)",
);

console.log("11. Ventana de adenda sobre el Convenio HCP ya Aprobado (A27)");
// El Convenio HCP nunca tuvo "editar y reenviar" en ninguna fase anterior
// (editarYReenviarConvenioHCP es nueva) — a diferencia de Convenio de Pago
// a HCP, el esquema real no trae ninguna tabla `adendas_convenio_hcp`, así
// que aquí la ventana vive solo en las columnas `adenda_ventana_*` de
// `convenios_hcp`. La prueba clave: el clausulado ajustado en el paso 9
// (Numeral 2) NO debe perderse al guardar la adenda — eso es justo lo que
// `CAMPOS_EDITABLES_CONVENIO_HCP` (una lista reducida, no la lista completa
// de columnas) existe para evitar.
await page.click('button:has-text("Adenda o ajuste al formulario")');
await page.getByPlaceholder("Justificación de la adenda").fill("Se requiere actualizar la firma autorizada por la compañía.");
await page.click('button:has-text("Continuar")');
await page.waitForSelector("text=vuelve a Pendiente y se reinicia la cadena", { timeout: 5000 });
await page.getByLabel("Firma por la compañía (Director General) *").fill("Camilo Restrepo");
await page.click('button:has-text("Guardar y reenviar")');
await page.waitForTimeout(300);
afirmar(await page.isVisible("text=Pendiente"), "tras guardar la adenda, el Convenio HCP vuelve a Pendiente");

console.log("11b. Re-aprobar las 2 etapas tras la adenda");
for (const etapa of ["Visto Bueno Legal/Compliance", "Firma Gerencia General"]) {
  await page.getByPlaceholder("Comentario (obligatorio para rechazar)").fill(`Re-aprobado tras adenda — ${etapa}`);
  await page.click('button:has-text("Aprobar")');
  await page.waitForTimeout(300);
}
const convenioHcpQuedoAprobadoTrasAdenda = await page
  .waitForSelector('[role="dialog"] >> text=Aprobado', { timeout: 3000 })
  .then(() => true)
  .catch(() => false);
afirmar(convenioHcpQuedoAprobadoTrasAdenda, "el Convenio HCP vuelve a quedar Aprobado tras re-aprobar la cadena reiniciada por la adenda");
afirmar(await page.isVisible("text=Camilo Restrepo"), "el cambio hecho durante la adenda (firma del Director General) quedó guardado");
afirmar(
  await page.isVisible("text=Este contrato tiene una duración especial de 6 meses"),
  "el ajuste puntual de cláusula del Numeral 2 sigue intacto tras la adenda — editarYReenviarConvenioHCP no borró el clausulado_snapshot",
);

afirmar(erroresConsola.length === 0, `sin errores de consola/página (encontrados: ${erroresConsola.length})`);
if (erroresConsola.length > 0) console.error(erroresConsola.join("\n"));

await browser.close();

if (fallas > 0) {
  console.error(`\n${fallas} verificación(es) fallaron.`);
  process.exit(1);
}
console.log("\nTodas las verificaciones pasaron.");
