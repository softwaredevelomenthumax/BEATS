#!/usr/bin/env node
// Fase 1 (infraestructura de archivos, septiembre 2026) — verifica la carga y
// visualización de archivos vía `archivos_adjuntos` en al menos dos
// formularios distintos, tal como pide el plan de implementación: "un
// script que suba un archivo de prueba en al menos dos formularios
// distintos... confirme que el registro en archivos_adjuntos se crea con el
// data_url correcto, y que el botón 'Ver' lo recupera." (El Repositorio del Evento pasó al Expediente: ver
// verificar_expediente_evento.mjs.) Todo contra fixtures locales — nunca contra Supabase real.
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { interceptarSupabase, crearHandlerResolverAprobacion,
  resolverCaptchaLogin, } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rutaBundle = resolve(raiz, "bundle.html");

// 1x1 PNG transparente — suficientemente válido para que `abrirODescargarArchivo`
// lo trate como imagen (tipo `image/png`) y lo escriba en la ventana emergente.
const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const PNG_BUFFER = Buffer.from(PNG_1X1_BASE64, "base64");

// PDF mínimo — no necesita renderizar contenido real, solo activar la rama
// `application/pdf` de `abrirODescargarArchivo` (iframe con el data_url).
const PDF_BUFFER = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

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
    catalogo_valores: [
      { id: "cat-1", catalogo: "departamentosConvenio", valor: "Marketing", orden: 1 },
      { id: "cat-2", catalogo: "tiposActividadConvenio", valor: "Consultoría", orden: 1 },
      { id: "cat-3", catalogo: "organizadoPorConvenio", valor: "Compañía", orden: 1 },
      { id: "cat-4", catalogo: "monedas", valor: "COP", orden: 1 },
      { id: "cat-5", catalogo: "empresasGrupo", valor: "Bausch + Lomb", orden: 1 },
    ],
    speakers: [{ id: "spk-1", nombre_completo: "Dra. Camila Reyes", especialidad: "Oftalmología" }],
    convenios_pago_hcp: [],
    convenio_aprobaciones: [],
    campos_personalizados_definicion: [],
    etiquetas_campo: [],
    // Evento ya Aprobado, de sesión única — sirve para probar el Repositorio
    // del Evento sin tener que recorrer toda la cadena de aprobación de
    // nuevo (ya cubierta por scripts/verificar_evento.mjs).
    solicitudes_evento: [
      {
        id: "evt-1",
        estado: "Aprobado",
        creado_por_id: "usr-admin",
        creado_en: new Date().toISOString(),
        nombre_evento: "Simposio de Catarata 2026",
        empresa_grupo: "Bausch + Lomb",
        pais: "Colombia",
        ciudad: "Bogotá",
        direccion: "Calle 100 # 10-20",
        fecha_inicio_evento: new Date().toISOString().slice(0, 10),
        fecha_fin_evento: new Date().toISOString().slice(0, 10),
        numero_asistentes: 40,
        modalidad_sesiones: "Única sesión",
      },
    ],
    evento_aprobaciones: [],
    sesiones_evento: [],
    evento_muestras_planeadas: [],
    eventos_codigos_acceso: [],
    evento_repositorio_archivos: [],
    evento_registros_financieros: [],
    archivos_adjuntos: [],
    // País del HCP ahora es siempre un desplegable (SelectPaisCiudad) —
    // necesita el catálogo `paises_region`. Sin `paises_region_ciudades`,
    // Ciudad sigue siendo texto libre, que es lo que este script ya
    // espera (`.fill()`).
    paises_region: [{ id: "pr-1", pais: "Colombia" }],
  },
  rpc: {
    resolver_aprobacion_convenio: crearHandlerResolverAprobacion("convenios_pago_hcp", "convenio_aprobaciones", "convenio"),
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

console.log("1. Login e ir a Nuevo Convenio de Pago a HCP");
await page.goto(pathToFileURL(rutaBundle).href);
await page.fill("#email", "admin.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Tablero", { timeout: 5000 });
await page.click('button:has-text("Convenio de Pago a HCP")');
await page.waitForSelector("text=Nuevo Convenio de Pago a HCP", { timeout: 5000 });

console.log("2. Completar el formulario y adjuntar la agenda de la reunión (CampoArchivo)");
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
await page.getByLabel("Objetivo *").fill("Recoger retroalimentación clínica sobre el portafolio de retina.");
await page.getByLabel("Criterios de selección *").fill("Experiencia clínica y publicaciones en el área.");
await page.getByLabel("Contraprestación al HCP *").fill("3000000");
await page.locator("#convenio-moneda").click();
await page.getByRole("option", { name: "COP", exact: true }).click();
await page.locator("#convenio-firma-certifica").click();

await page.getByLabel("Agenda de la reunión (archivo adjunto, opcional)").setInputFiles({
  name: "agenda-consejo.png",
  mimeType: "image/png",
  buffer: PNG_BUFFER,
});
await page.waitForSelector("text=agenda-consejo.png", { timeout: 5000 });
afirmar(await page.isVisible("text=agenda-consejo.png"), "el chip del archivo cargado muestra el nombre del archivo");

const archivoAgenda = fixtures.tablas.archivos_adjuntos.find((a) => a.nombre === "agenda-consejo.png");
afirmar(!!archivoAgenda, "se creó una fila en archivos_adjuntos para la agenda subida");
afirmar(archivoAgenda?.tipo === "image/png", "la fila guarda el tipo MIME correcto (image/png)");
afirmar(
  typeof archivoAgenda?.data_url === "string" && archivoAgenda.data_url.startsWith("data:image/png;base64,"),
  "la fila guarda el data_url en base64 correctamente (no un string vacío ni truncado)",
);

console.log("3. Enviar el Convenio de Pago y verificar el botón Ver en el detalle");
await page.click('button:has-text("Enviar a aprobación")');
await page.waitForSelector("text=Dra. Camila Reyes", { timeout: 5000 });
await page.click("text=Dra. Camila Reyes");
await page.waitForSelector("text=Cadena de aprobación", { timeout: 5000 });
afirmar(
  await page.isVisible("text=Agenda de la reunión (archivo adjunto)"),
  "el detalle del Convenio de Pago muestra la fila de archivo adjunto (VisorArchivo)",
);

// Fase 8 (hallazgo grande): "Ver / Imprimir / Exportar a PDF" abre un
// diálogo aparte y apilado — el membrete solo vive ahí.
await page.click('button:has-text("Ver / Imprimir / Exportar a PDF")');
await page.waitForSelector("text=Vista oficial del documento", { timeout: 5000 });
afirmar(
  await page.isVisible("text=Convenio de Pago a Profesional de la Salud"),
  "el diálogo de impresión del Convenio de Pago muestra el membrete con el nombre oficial largo del formato",
);
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
afirmar(
  await page.isVisible("text=Agenda de la reunión (archivo adjunto)"),
  "al cerrar la impresión, la vista compacta del Convenio de Pago sigue abierta detrás",
);

const [popupAgenda] = await Promise.all([
  page.waitForEvent("popup"),
  // Texto EXACTO: desde Fase 8 el diálogo también tiene un botón 'Ver /
  // Imprimir / Exportar a PDF' — un match por substring de 'Ver' los confunde.
  page.locator('[role="dialog"]').getByRole("button", { name: "Ver", exact: true }).click(),
]);
await popupAgenda.waitForLoadState("domcontentloaded").catch(() => {});
const htmlPopupAgenda = await popupAgenda.content();
afirmar(
  htmlPopupAgenda.includes("data:image/png;base64,"),
  "el botón 'Ver' abre una ventana nueva con la imagen (data_url) recuperada de archivos_adjuntos",
);
await popupAgenda.close();
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

// Entrega 16: el antiguo "Repositorio del evento — archivos" se reemplazó por el
// Expediente del evento; sus pruebas viven en scripts/verificar_expediente_evento.mjs.

await page.keyboard.press("Escape");
await page.waitForTimeout(200);

afirmar(erroresConsola.length === 0, `sin errores de consola/página (encontrados: ${erroresConsola.length})`);
if (erroresConsola.length > 0) console.error(erroresConsola.join("\n"));

await browser.close();

if (fallas > 0) {
  console.error(`\n${fallas} verificación(es) fallaron.`);
  process.exit(1);
}
console.log("\nTodas las verificaciones pasaron.");
