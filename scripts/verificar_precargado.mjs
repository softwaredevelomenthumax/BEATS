#!/usr/bin/env node
// Fase 4 — Precargado automático entre formularios: verifica que elegir un
// "documento de origen" (Evento/CAF/Speaker/Convenio) en los 5 formularios
// que lo permiten precarga de inmediato los campos mapeados en
// src/lib/precargado.ts, que ese precargado SIEMPRE sobrescribe (decisión
// explícita del usuario) al cambiar de origen, y que dos orígenes distintos
// del mismo formulario (p. ej. Evento y Speaker en Convenio de Pago a HCP)
// no se pisan entre sí porque mapean a campos distintos. Todo contra
// fixtures locales — nunca contra Supabase real.
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { interceptarSupabase,
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
        empresas_grupo: ["Bausch + Lomb", "Bausch Health"],
        paises_operacion: ["Colombia"],
        es_administrador: true,
        administrador_alcance_limitado: false,
        paginas_permitidas: [],
      },
    ],
    // v_documentos NO se siembra a mano: el arnés de fixtures (igual que
    // la vista real en Postgres) la sintetiza dinámicamente a partir de
    // `solicitudes_evento`/`cafs`/`convenios_pago_hcp` (ver
    // sintetizarVDocumentos en scripts/lib/fixtures.mjs) — sembrar además
    // filas estáticas aquí duplicaría cada opción en los <Select> de
    // "documento de origen".
    catalogo_valores: [
      { id: "cat-1", catalogo: "empresasGrupo", valor: "Bausch + Lomb", orden: 1 },
      { id: "cat-2", catalogo: "empresasGrupo", valor: "Bausch Health", orden: 2 },
      { id: "cat-3", catalogo: "monedas", valor: "USD", orden: 1 },
      { id: "cat-4", catalogo: "monedas", valor: "COP", orden: 2 },
      // A7: "Organizado por" (Convenio de Pago a HCP) ahora es un
      // desplegable y "Nombre del organizador" solo se muestra cuando el
      // valor elegido es "Otro"/"Tercero" (esOrganizadoPorOtro) — se
      // necesita esta opción en el catálogo para poder revelar el campo y
      // verificar que el precargado de `organizador` (desde el evento de
      // origen) sí llega al campo, aunque el precargado en sí NO toca
      // `organizadoPor` (ver la nota en src/lib/precargado.ts).
      { id: "cat-5", catalogo: "organizadoPorConvenio", valor: "Otro", orden: 1 },
    ],
    // Select país siempre visible (SelectPaisCiudad) — necesita el
    // catálogo `paises_region` para poder mostrar "Colombia" como texto
    // seleccionado en el combobox de hcpPais/FMV país. No se define
    // `paises_region_ciudades`: sin catálogo de ciudades, Ciudad sigue
    // siendo texto libre, que es lo que estas verificaciones ya esperan
    // (`.inputValue()` sobre Ciudad).
    paises_region: [{ id: "pr-1", pais: "Colombia" }],
    // Filas COMPLETAS de cada documento de origen — a diferencia de
    // v_documentos (arriba, solo id/nombre para listar opciones en los
    // <Select>), estas son las que traerEventoPorId/traerCafPorId/
    // traerSpeakerPorId/traerConvenioPorId (Fase 4) consultan de verdad al
    // elegir un origen, para poder precargar sus campos.
    solicitudes_evento: [
      {
        id: "evt-1",
        estado: "Aprobado",
        creado_por_id: "usr-admin",
        creado_en: new Date().toISOString(),
        nombre_evento: "Simposio de Retina 2026",
        empresa_grupo: "Bausch + Lomb",
        pais: "Colombia",
        ciudad: "Bogotá",
        fecha_inicio_evento: "2026-10-01",
        fecha_fin_evento: "2026-10-03",
        nombre_organizador: "Fundación Retina",
        nombre_speaker_participacion: "Dr. Mauricio Salazar",
      },
      {
        id: "evt-2",
        estado: "Aprobado",
        creado_por_id: "usr-admin",
        creado_en: new Date().toISOString(),
        nombre_evento: "Congreso de Catarata 2026",
        empresa_grupo: "Bausch Health",
        pais: "México",
        ciudad: "Ciudad de México",
        fecha_inicio_evento: "2026-11-05",
        fecha_fin_evento: "2026-11-07",
        nombre_organizador: "Sociedad Mexicana de Oftalmología",
        nombre_speaker_participacion: "Dra. Valentina Ríos",
      },
    ],
    cafs: [
      {
        id: "caf-1",
        estado: "Aprobado",
        creado_por_id: "usr-admin",
        creado_en: new Date().toISOString(),
        compania_nombre: "Bausch Health",
        codigo_documento: "CAF-2026-900",
      },
    ],
    speakers: [
      {
        id: "spk-1",
        nombre_completo: "Dr. Andrés Beltrán",
        numero_documento: "CC 80112233",
        licencia_rethus: "RETHUS 55667",
        especialidad: "Cirugía Refractiva",
        direccion: "Calle 45 #12-08",
        pais: "Colombia",
        ciudad: "Medellín",
        telefono: "3009998877",
        email: "andres.beltran@example.com",
        creado_por_id: "usr-admin",
        actualizado_en: new Date().toISOString(),
      },
    ],
    convenios_pago_hcp: [
      {
        id: "conv-1",
        estado: "Aprobado",
        creado_por_id: "usr-admin",
        creado_en: new Date().toISOString(),
        hcp_nombre_completo: "Dra. Carolina Ibáñez",
        hcp_cedula_licencia: "CC 43219876",
        moneda_contraprestacion: "USD",
      },
    ],
    convenio_aprobaciones: [],
    caf_aprobaciones: [],
    campos_personalizados_definicion: [],
    etiquetas_campo: [],
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
  if (msg.type() === "error" && !/Failed to load resource/.test(msg.text())) erroresConsola.push(msg.text());
});

await interceptarSupabase(page, fixtures);

async function textoSelect(id) {
  return (await page.locator(`#${id}`).innerText()).trim();
}

console.log("1. Login e ir a Nueva CAF");
await page.goto(pathToFileURL(rutaBundle).href);
await page.fill("#email", "admin.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.getByRole("button", { name: /Bausch \+ Lomb/ }).click({ timeout: 10000 }).catch(() => {}); // selector de compañía (usuario con varias compañías)
await page.waitForSelector("text=Tablero", { timeout: 20000 });
await page.click('button:has-text("CAF")');
await page.waitForSelector("text=Nueva CAF", { timeout: 5000 });

console.log("2. CAF — elegir el evento de origen precarga la compañía");
await page.getByLabel("Evento de origen *").click();
await page.getByRole("option", { name: "Simposio de Retina 2026" }).click();
await page.waitForTimeout(250);
afirmar((await textoSelect("caf-compania")).includes("Bausch + Lomb"), "la compañía se precarga con la del evento (Bausch + Lomb) sin que el usuario la elija");

console.log("3. Nuevo Convenio de Pago a HCP — Evento precarga actividad/fechas, Speaker precarga HCP, sin pisarse entre sí");
await page.click('button:has-text("Convenio de Pago a HCP")');
await page.waitForSelector("text=Nuevo Convenio de Pago a HCP", { timeout: 5000 });

// A7: "Nombre del organizador" solo se muestra cuando "Organizado por" es
// "Otro"/"Tercero" — se elige esa opción primero para poder verificar más
// abajo que el precargado del evento sí llega al campo `organizador`
// (el precargado no toca `organizadoPor`, así que esto no interfiere con
// eso, solo asegura que el campo condicional esté visible).
await page.locator("#convenio-organizado-por").click();
await page.getByRole("option", { name: "Otro" }).click();

await page.getByLabel("Evento de origen").click();
await page.getByRole("option", { name: "Simposio de Retina 2026" }).click();
await page.waitForTimeout(250);
afirmar((await page.getByLabel("Nombre del evento / servicio *").inputValue()) === "Simposio de Retina 2026", "nombreEventoServicio se precarga con el nombre del evento");
afirmar((await page.getByLabel("Inicio de la actividad").inputValue()) === "2026-10-01", "fechaInicioActividad se precarga con la fecha de inicio del evento");
afirmar((await page.getByLabel("Fin de la actividad").inputValue()) === "2026-10-03", "fechaFinActividad se precarga con la fecha de fin del evento");
afirmar((await page.getByLabel("Organizador *").inputValue()) === "Fundación Retina", "organizador se precarga con el organizador del evento");

await page.getByLabel("Speaker *").click();
await page.getByRole("option", { name: /Andrés Beltrán/ }).click();
await page.waitForTimeout(250);
afirmar((await page.getByLabel("Nombre completo del HCP *").inputValue()) === "Dr. Andrés Beltrán", "hcpNombreCompleto se precarga con el nombre del speaker elegido");
afirmar((await page.getByLabel("Dirección del HCP *").inputValue()) === "Calle 45 #12-08", "hcpDireccion se precarga con la dirección del speaker");
// hcpPais ahora es un <Select> (SelectPaisCiudad) — se verifica el texto
// mostrado en el combobox en vez de un inputValue.
afirmar((await textoSelect("convenio-hcp-pais")).includes("Colombia"), "hcpPais se precarga con el país del speaker");
afirmar((await page.getByLabel("Ciudad del HCP *").inputValue()) === "Medellín", "hcpCiudad se precarga con la ciudad del speaker");
afirmar((await page.getByLabel("Cédula / licencia del HCP *").inputValue()) === "RETHUS 55667", "hcpCedulaLicencia se precarga con la Licencia RETHUS / Cédula profesional del speaker (entrega 28)");
afirmar(
  (await page.getByLabel("Nombre del evento / servicio *").inputValue()) === "Simposio de Retina 2026",
  "elegir el speaker NO pisa los campos ya precargados desde el evento (mapean a campos distintos)",
);

console.log("4. Convenio — cambiar el evento de origen SIEMPRE sobrescribe con el valor del nuevo origen (decisión explícita del usuario)");
await page.getByLabel("Evento de origen").click();
await page.getByRole("option", { name: "Congreso de Catarata 2026" }).click();
await page.waitForTimeout(250);
afirmar((await page.getByLabel("Nombre del evento / servicio *").inputValue()) === "Congreso de Catarata 2026", "nombreEventoServicio se actualiza al cambiar el evento, aunque ya tuviera un valor distinto");
afirmar((await page.getByLabel("Inicio de la actividad").inputValue()) === "2026-11-05", "fechaInicioActividad se actualiza al nuevo evento");
afirmar((await page.getByLabel("Organizador *").inputValue()) === "Sociedad Mexicana de Oftalmología", "organizador se actualiza al nuevo evento");
afirmar(
  (await page.getByLabel("Nombre completo del HCP *").inputValue()) === "Dr. Andrés Beltrán",
  "en cambio, los campos del HCP (precargados desde el Speaker) NO cambian al cambiar solo el evento — orígenes independientes",
);

console.log("5. Nuevo Convenio HCP — Evento precarga fecha efectiva, CAF precarga compañía, Speaker precarga datos del consultor");
await page.click('button:has-text("Convenio HCP")');
await page.waitForSelector("text=Nuevo Convenio HCP", { timeout: 5000 });

await page.getByLabel("Evento de origen *").click();
await page.getByRole("option", { name: "Simposio de Retina 2026" }).click();
await page.waitForTimeout(250);
afirmar((await page.getByLabel("Fecha efectiva").inputValue()) === "2026-10-01", "fechaEfectiva se precarga con la fecha de inicio del evento");

await page.getByLabel("CAF asociado *").click();
await page.getByRole("option", { name: "CAF-2026-900" }).click();
await page.waitForTimeout(250);
afirmar((await textoSelect("cvhcp-compania")).includes("Bausch Health"), "companiaNombre se precarga con la compañía del CAF elegido (no la del evento — el CAF es el origen más específico)");

await page.getByLabel("Speaker (opcional)").click();
await page.getByRole("option", { name: /Andrés Beltrán/ }).click();
await page.waitForTimeout(250);
afirmar((await page.getByLabel("Nombre del consultor / HCP *").inputValue()) === "Dr. Andrés Beltrán", "consultorNombre se precarga con el nombre del speaker");
afirmar((await page.getByLabel("Identificación del consultor *").inputValue()) === "CC 80112233", "consultorIdentificacion se precarga con el documento del speaker");
afirmar((await page.getByLabel("Correo del consultor *").inputValue()) === "andres.beltran@example.com", "consultorEmail se precarga con el correo del speaker");
afirmar((await page.getByLabel("Credenciales del consultor").inputValue()) === "Cirugía Refractiva", "consultorCredenciales toma la especialidad del speaker como punto de partida");

console.log("6. Nuevo FMV Checklist — el evento de origen precarga país y ciudad");
await page.click('button:has-text("FMV Checklist")');
await page.waitForSelector("text=Nuevo FMV Checklist", { timeout: 5000 });
await page.getByLabel("Evento de origen").click();
await page.getByRole("option", { name: "Simposio de Retina 2026" }).click();
await page.waitForTimeout(250);
// País ahora es un <Select> (SelectPaisCiudad) — se verifica el texto
// mostrado en el combobox en vez de un inputValue.
afirmar((await textoSelect("fmv-pais")).includes("Colombia"), "país se precarga con el país del evento");
afirmar((await page.getByLabel("Ciudad *").inputValue()) === "Bogotá", "ciudad se precarga con la ciudad del evento");

console.log("7. Nueva Notificación de Pago a HCP — Evento precarga el nombre del HCP, Convenio lo sobrescribe con datos más precisos");
await page.click('button:has-text("Notificación de Pago a HCPs")');
await page.waitForSelector("text=Nueva Notificación de Pago a HCP", { timeout: 5000 });

await page.getByLabel("Evento de origen").click();
await page.getByRole("option", { name: "Simposio de Retina 2026" }).click();
await page.waitForTimeout(250);
afirmar(
  (await page.getByLabel("Nombre del profesional de la salud *").inputValue()) === "Dr. Mauricio Salazar",
  "nombreProfesionalSalud se precarga con el speaker que participó en el evento",
);

await page.getByLabel("Convenio de origen").click();
await page.getByRole("option", { name: /Carolina Ibáñez/ }).click();
await page.waitForTimeout(250);
afirmar(
  (await page.getByLabel("Nombre del profesional de la salud *").inputValue()) === "Dra. Carolina Ibáñez",
  "al elegir el convenio, nombreProfesionalSalud se actualiza con el HCP del convenio (más preciso que el del evento)",
);
afirmar((await page.getByLabel("Cédula / licencia profesional *").inputValue()) === "CC 43219876", "cedulaLicenciaProfesional se precarga con la del convenio");
afirmar((await textoSelect("notif-moneda")).includes("USD"), "monedaFactura se precarga con la moneda del convenio");

afirmar(erroresConsola.length === 0, `sin errores de consola/página (encontrados: ${erroresConsola.length})`);
if (erroresConsola.length > 0) console.error(erroresConsola.join("\n"));

await browser.close();

if (fallas > 0) {
  console.error(`\n${fallas} verificación(es) fallaron.`);
  process.exit(1);
}
console.log("\nTodas las verificaciones pasaron.");
