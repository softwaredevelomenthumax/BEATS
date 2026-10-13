#!/usr/bin/env node
// Fase 5 (post-reconstrucción) — verifica el membrete de impresión/PDF (logo
// + PROCESO/CÓDIGO/VERSIÓN/EMISIÓN, con override por empresa sobre el valor
// global, y el interruptor "Incluir encabezado oficial (membrete)"), el
// Convenio HCP completamente bilingüe al imprimir (encabezados/etiquetas
// fijas, no solo el clausulado y los campos de contenido, que ya eran
// bilingües desde antes), y el "formato oficial" de la tercera entrega:
// barra de herramientas con zoom, tabla de Aprobación con bordes y pie de
// página ("Elaborado por..."/"ID interno"). Todo contra fixtures locales,
// nunca contra Supabase real.
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { interceptarSupabase,
  resolverCaptchaLogin, } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rutaBundle = resolve(raiz, "bundle.html");

// Fase 8: en la vista de detalle compacta, un campo etiqueta/valor (p. ej.
// "Estado" / "Pendiente") se pinta como dos <span> en líneas separadas (no
// como el string "Etiqueta: valor" de una sola línea que usa la vista de
// impresión) — ver CampoInline en modo "compacta", DocumentoImprimible.tsx.
// Este helper ubica el par por su etiqueta exacta y lee el valor en el
// <span> inmediatamente siguiente, sin depender del formato de una sola línea.
async function valorCampoCompacto(page, etiqueta) {
  const contenedor = page
    .locator('[role="dialog"] div')
    .filter({ has: page.getByText(etiqueta, { exact: true }) })
    .last();
  return contenedor.locator("span").nth(1).innerText();
}

// PNG 1x1 transparente (logo institucional GLOBAL) y PNG 1x1 rojo (logo
// institucional propio de "Bausch + Lomb") — dos imágenes DISTINTAS a
// propósito, para poder comprobar con el `src` exacto del <img> del
// membrete que el override de empresa (Fase 5, cuarta entrega —
// `configuracion_formatos_empresa.logo_id`) realmente gana sobre el logo
// institucional global (`configuracion_formatos.logo_id`), no solo que "se
// ve algún logo".
const LOGO_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const LOGO_EMPRESA_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4IScHAAK2AQU0pnWqAAAAAElFTkSuQmCC";

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
      { id: "cat-1", catalogo: "tiposDocumento", valor: "Contrato de Patrocinio", orden: 1 },
      { id: "cat-2", catalogo: "monedas", valor: "COP", orden: 1 },
      { id: "cat-3", catalogo: "empresasGrupo", valor: "Bausch + Lomb", orden: 1 },
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
    campos_personalizados_definicion: [],
    etiquetas_campo: [],

    // Formato global (id=1): valores por defecto para CAF y Convenio HCP —
    // el Convenio HCP NO tiene override de empresa más abajo, así que su
    // membrete debe mostrar exactamente estos 4 valores (prueba que
    // `resolverFormatoDocumento` cae al global cuando no hay override).
    configuracion_formatos: [
      {
        id: 1,
        caf_proceso: "Gestión Comercial",
        caf_codigo: "FOR-CM-010",
        caf_version: "3",
        caf_fecha_emision: "2025-01-15",
        convenio_hcp_proceso: "Legal",
        convenio_hcp_codigo: "FOR-LG-005",
        convenio_hcp_version: "2",
        convenio_hcp_fecha_emision: "2024-06-01",
        // Logo INSTITUCIONAL global (membrete) — distinto de `logo_app_id`
        // (logo de la aplicación/barra lateral, no se usa en el membrete).
        logo_id: "archivo-logo-global",
      },
    ],
    // Override de empresa: toca los 4 campos de CAF Y el logo institucional
    // — el CAF de la prueba pertenece a "Bausch + Lomb" y debe ver estos
    // valores en vez de los globales; el Convenio HCP (mismo empresaGrupo)
    // también hereda este mismo logo (el logo NO es por tipo de documento,
    // es un solo logo por empresa) pero SÍ sigue usando el PROCESO/CÓDIGO
    // global, porque este override no trae ningún campo `convenio_hcp_*`.
    configuracion_formatos_empresa: [
      {
        empresa_grupo: "Bausch + Lomb",
        caf_proceso: "Comercial BL",
        caf_codigo: "FOR-BL-099",
        caf_version: "5",
        caf_fecha_emision: "2026-02-01",
        logo_id: "archivo-logo-bausch-lomb",
      },
    ],
    archivos_adjuntos: [
      {
        id: "archivo-logo-global",
        nombre: "logo-global.png",
        tipo: "image/png",
        tamano_bytes: 68,
        data_url: LOGO_DATA_URL,
        cargado_en: new Date().toISOString(),
      },
      {
        id: "archivo-logo-bausch-lomb",
        nombre: "logo-bausch-lomb.png",
        tipo: "image/png",
        tamano_bytes: 71,
        data_url: LOGO_EMPRESA_DATA_URL,
        cargado_en: new Date().toISOString(),
      },
    ],

    // Convenio HCP: mismos fixtures de plantilla que verificar_convenio_convenio_hcp.mjs
    // (numeral 1 con texto real, para poder verificar la traducción de
    // "Numeral" -> "Clause" y del resto de encabezados fijos).
    speakers: [{ id: "spk-1", nombre_completo: "Dra. Camila Reyes", especialidad: "Oftalmología" }],
    plantilla_convenio_hcp_version: [
      {
        id: "plantilla-1",
        vigente_desde: new Date(Date.now() - 86400000).toISOString(),
        creado_por_id: "usr-admin",
        notas_version: "Versión inicial de prueba",
        numerales: [
          {
            numero: 1,
            textoEs: "1. Término. Vigente desde la Fecha Efectiva.",
            textoEn: "1. Term. Effective from the Effective Date.",
          },
          ...Array.from({ length: 14 }, (_, i) => ({ numero: i + 2, textoEs: "", textoEn: "" })),
        ],
        anexo_c_en: "Exhibit C: data processing authorization.",
        anexo_c_es: "Anexo C: autorización de tratamiento de datos.",
        anexo_d_en: "",
        anexo_d_es: "",
        empresa_grupo: null,
      },
    ],
    convenios_pago_hcp: [],
    convenio_aprobaciones: [],
    convenios_hcp: [],
    convenio_hcp_aprobaciones: [],
    convenio_hcp_ajustes_clausula: [],
  },
  rpc: {},
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

console.log("1. Login e ir a Nueva CAF");
await page.goto(pathToFileURL(rutaBundle).href);
await page.fill("#email", "admin.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Tablero", { timeout: 5000 });
await page.click('button:has-text("CAF")');
await page.waitForSelector("text=Nueva CAF", { timeout: 5000 });

console.log("2. Completar y enviar un CAF de Bausch + Lomb");
await page.getByLabel("Evento de origen").click();
await page.getByRole("option", { name: "Simposio de Retina 2026" }).click();
await page.getByLabel("Nombre del solicitante *").fill("Laura Gómez");
await page.getByLabel("Teléfono del solicitante *").fill("3001234567");
await page.getByLabel("Nombre del director de área *").fill("Carlos Ruiz");
await page.getByLabel("Cargo del director de área *").fill("Director Comercial");
await page.getByLabel("Nombre de la contraparte *").fill("Clínica Oftalmológica S.A.S.");
await page.getByLabel("Dirección de la contraparte *").fill("Calle 100 # 10-20, Bogotá");
await page.getByLabel("Teléfono de la contraparte *").fill("6011234567");
await page.getByLabel("Correo de la contraparte *").fill("contacto@clinica.com");
await page.getByLabel("Contacto de la contraparte *").fill("Dra. Ana Torres");
await page.getByLabel("Tipo de contrato").click();
await page.getByRole("option", { name: "Contrato de Patrocinio" }).click();
await page.getByLabel("Objeto del contrato *").fill("Patrocinio de simposio médico.");
await page.getByLabel("Due diligence *").fill("Verificado sin hallazgos.");
await page.getByLabel("Monto *").fill("5000000");
await page.getByLabel("Moneda").click();
await page.getByRole("option", { name: "COP", exact: true }).click();
await page.getByLabel("Compañía").click();
await page.getByRole("option", { name: "Bausch + Lomb" }).click();
await page.getByLabel("Código del documento *").fill("CAF-2026-501");
await page.click('button:has-text("Enviar a aprobación")');
// Fase 8 (rediseño del Tablero): la tarjeta ya no muestra el código del
// documento — usa el nombre de la contraparte como identificador único.
await page.waitForSelector("text=Clínica Oftalmológica S.A.S.", { timeout: 5000 });

console.log("3. Abrir el CAF (vista compacta) y luego 'Ver / Imprimir / Exportar a PDF' para ver el membrete con el override de empresa");
await page.click("text=Clínica Oftalmológica S.A.S.");
await page.waitForSelector("text=Cadena de aprobación", { timeout: 5000 });
// Fase 8 (hallazgo grande): el membrete/marca de agua/zoom/pie de página
// viven en el diálogo de IMPRESIÓN, separado y apilado sobre el diálogo de
// detalle compacto — ya no aparecen en la vista compacta por defecto.
afirmar(
  !(await page.isVisible("text=Vista oficial del documento").catch(() => false)),
  "la vista compacta NO muestra el membrete/toolbar de impresión hasta que se pide explícitamente",
);
await page.click('button:has-text("Ver / Imprimir / Exportar a PDF")');
await page.waitForSelector("text=Vista oficial del documento", { timeout: 5000 });
afirmar(
  await page.isVisible("text=FORMATO DE APROBACIÓN DE CONTRATO (CAF)"),
  "el membrete muestra el nombre oficial largo del formato CAF",
);
afirmar(await page.isVisible("text=PROCESO: Comercial BL"), "el membrete usa el PROCESO del override de empresa, no el global");
afirmar(await page.isVisible("text=CÓDIGO: FOR-BL-099"), "el membrete usa el CÓDIGO del override de empresa");
afirmar(await page.isVisible("text=VERSIÓN: 5"), "el membrete usa la VERSIÓN del override de empresa");
// El logo tarda una consulta más que el resto del membrete (useMembreteImpreso
// primero resuelve el formato, luego — en un segundo `await` — el logo vía
// `traerArchivo`), así que se espera el selector en vez de comprobarlo al vuelo.
const logoEnCaf = await page
  .waitForSelector('img[alt="Logo de la empresa"]', { timeout: 3000 })
  .then((el) => el.getAttribute("src"))
  .catch(() => null);
afirmar(logoEnCaf === LOGO_EMPRESA_DATA_URL, "el logo institucional del CAF es el override de 'Bausch + Lomb' (configuracion_formatos_empresa.logo_id), NO el logo global ni el de la aplicación");
afirmar(await page.isVisible("text=Incluir encabezado oficial (membrete)"), "se ve el interruptor para incluir/quitar el membrete");

console.log("3a. La ventana de IMPRESIÓN ocupa toda la pantalla (página real), apilada sobre el diálogo compacto (más chico) detrás");
const dialogosAbiertos = page.locator('[role="dialog"]');
afirmar((await dialogosAbiertos.count()) === 2, "hay 2 diálogos apilados: el compacto detrás y el de impresión encima");
const cajaDialogoImpresion = await dialogosAbiertos.last().boundingBox();
const cajaDialogoCompacto = await dialogosAbiertos.first().boundingBox();
const tamanoVentana = page.viewportSize();
afirmar(
  Boolean(cajaDialogoImpresion) &&
    Math.abs(cajaDialogoImpresion.width - tamanoVentana.width) < 2 &&
    Math.abs(cajaDialogoImpresion.height - tamanoVentana.height) < 2,
  `el diálogo de impresión ocupa toda la ventana (${cajaDialogoImpresion?.width}x${cajaDialogoImpresion?.height} vs. ventana ${tamanoVentana.width}x${tamanoVentana.height})`,
);
afirmar(
  Boolean(cajaDialogoCompacto) && cajaDialogoCompacto.width < tamanoVentana.width - 100,
  "el diálogo compacto detrás sigue siendo un modal moderado, no pantalla completa",
);

console.log("3b. Barra de herramientas del formato oficial: badge, subtítulo, zoom y pie de página");
afirmar(await page.isVisible("text=Vista oficial del documento"), "se ve el subtítulo 'Vista oficial del documento — lista para imprimir o exportar a PDF'");
afirmar(await page.isVisible("text=Imprimir / Exportar a PDF"), "el botón de imprimir está renombrado a 'Imprimir / Exportar a PDF'");
afirmar(await page.isVisible("text=100%"), "el zoom arranca en 100%");
await page.click('button[aria-label="Acercar"]');
afirmar(await page.isVisible("text=110%"), "el botón de acercar sube el zoom a 110%");

// Fase 8 (ajuste cosmético — marca de agua completa en todas las páginas):
// con el zoom en pantalla en 110%, `#zona-imprimible` usa la utilidad
// `scale-*` de Tailwind v4 — que fija la propiedad CSS `scale` (NO
// `transform`, separada desde CSS Transforms Level 2). En cuanto se emula
// impresión, tanto `scale` como `transform` deben quedar en `none` —
// cualquier otro valor (incluida una escala idéntica, "100% 100%") crea un
// "containing block" nuevo para `MarcaDeAgua`/`MembreteImpreso` (ambos
// `position: fixed` a propósito, ver sus comentarios), y dejan de
// repetirse en cada página física al imprimir un documento largo — solo se
// ven completos en la página donde cae el recuadro de #zona-imprimible.
const scaleEnPantalla = await page.locator("#zona-imprimible").evaluate((el) => getComputedStyle(el).scale);
afirmar(scaleEnPantalla !== "none", "en pantalla, el zoom del 110% sí aplica un scale real a #zona-imprimible (confirma que la prueba siguiente es significativa)");
await page.emulateMedia({ media: "print" });
const scaleEnImpresion = await page.locator("#zona-imprimible").evaluate((el) => getComputedStyle(el).scale);
afirmar(
  scaleEnImpresion === "none",
  "al imprimir, #zona-imprimible queda con scale:none (ni siquiera '100% 100%', que también contaría como una escala 'real' para CSS) — así la marca de agua y el membrete, ambos position:fixed, usan la página como containing block y se repiten completos en cada hoja, en vez de quedar anclados al recuadro de #zona-imprimible",
);
await page.emulateMedia({ media: "screen" });

await page.click('button[aria-label="Alejar"]');
await page.click('button[aria-label="Alejar"]');
afirmar(await page.isVisible("text=90%"), "el botón de alejar baja el zoom (110% -> 100% -> 90%)");
await page.click('button[aria-label="Acercar"]');
afirmar(await page.isVisible("text=100%"), "el zoom vuelve a 100%");
afirmar(await page.isVisible("text=Elaborado por Admin Prueba, Dirección Médica"), "el pie de página muestra 'Elaborado por' con el nombre/cargo de quien creó el documento");
afirmar(await page.isVisible("text=Documento generado por BEATS"), "el pie de página muestra la línea de trazabilidad con el id interno");
afirmar(await page.isVisible("text=Área que aprueba"), "la tabla de Aprobación tiene encabezado 'Área que aprueba'");
afirmar(await page.isVisible('button:has-text("Cerrar")'), "al pasar onCerrar, la barra de herramientas agrega su propio botón 'Cerrar'");

console.log("3c. Vista previa como página real + Modo para firma externa (sin marca de agua)");
afirmar(await page.isVisible("text=EN PROCESO DE FIRMA"), "por defecto se ve la marca de agua del estado (CAF recién enviado, Pendiente)");
afirmar(await page.isVisible("text=Modo para firma externa"), "se ve el interruptor de modo para firma externa");
await page.click("#interruptor-firma-externa");
await page.waitForTimeout(150);
afirmar(!(await page.isVisible("text=EN PROCESO DE FIRMA")), "al activar el modo para firma externa, la marca de agua desaparece");
afirmar(
  await page.isVisible("text=FORMATO DE APROBACIÓN DE CONTRATO (CAF)"),
  "el membrete sigue viéndose — el modo firma externa solo quita la marca de agua, no el membrete",
);
await page.click("#interruptor-firma-externa");
await page.waitForTimeout(150);
afirmar(await page.isVisible("text=EN PROCESO DE FIRMA"), "al desactivarlo, la marca de agua vuelve a verse");

console.log("4. Apagar y volver a encender el interruptor de membrete — el título debe seguir visible sin el membrete");
await page.click("#interruptor-membrete");
await page.waitForTimeout(150);
afirmar(
  await page.isVisible("text=FORMATO DE APROBACIÓN DE CONTRATO (CAF)"),
  "al apagar el membrete, el título simple del documento (sin tabla ni logo) sigue viéndose — pedido explícito del usuario",
);
afirmar(!(await page.isVisible('img[alt="Logo de la empresa"]')), "al apagar el membrete, el logo ya no se ve (solo el título simple)");
afirmar(!(await page.isVisible("text=PROCESO: Comercial BL")), "al apagar el membrete, la fila PROCESO/CÓDIGO/VERSIÓN ya no se ve");
await page.click("#interruptor-membrete");
await page.waitForTimeout(150);
afirmar(await page.isVisible('img[alt="Logo de la empresa"]'), "al volver a encenderlo, el membrete completo (con logo) reaparece");
afirmar(await page.isVisible("text=PROCESO: Comercial BL"), "al volver a encenderlo, la fila PROCESO/CÓDIGO/VERSIÓN reaparece");
// Fase 8: dos diálogos apilados — el primer Escape cierra solo el de
// impresión (queda el compacto detrás); el segundo cierra el compacto.
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
afirmar(await page.isVisible("text=Cadena de aprobación"), "el primer Escape solo cierra el diálogo de impresión — el compacto sigue abierto detrás");
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

console.log("5. Nuevo Convenio HCP (sin CAF asociado — no es obligatorio en el formulario)");
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
// Fase 8 (rediseño del Tablero): el Convenio HCP no tiene selector de
// Speaker (`speakerId` siempre null en esta reconstrucción), así que el
// título de su tarjeta cae al nombre del consultor escrito en el
// formulario, sin especialidad ni compañía.
await page.getByText("Dra. Camila Reyes", { exact: true }).waitFor({ timeout: 5000 }).catch(() => {});

console.log("6. Abrir el Convenio HCP (vista compacta): el cuerpo (Clausulado/Estado) ya se ve, reutilizado tal cual del formato de impresión");
await page.getByText("Dra. Camila Reyes", { exact: true }).click();
await page.waitForSelector("text=Clausulado", { timeout: 5000 });
afirmar((await valorCampoCompacto(page, "Estado")) === "Pendiente", "en español el campo 'Estado' de la vista compacta vale 'Pendiente'");
afirmar(await page.isVisible("text=Clausulado (Español)"), "el título del clausulado está en español por defecto, ya en la vista compacta");
// Fase 8: el membrete/logo/pie de página solo viven en el diálogo de
// impresión — separado y apilado sobre el compacto.
afirmar(
  !(await page.isVisible("text=Convenio de Consultoría con Profesional de la Salud (Convenio HCP)").catch(() => false)),
  "la vista compacta NO muestra el nombre oficial largo del membrete hasta abrir la impresión",
);
await page.click('button:has-text("Ver / Imprimir / Exportar a PDF")');
await page.waitForSelector("text=Vista oficial del documento", { timeout: 5000 });
afirmar(
  await page.isVisible("text=Convenio de Consultoría con Profesional de la Salud (Convenio HCP)"),
  "el membrete del Convenio HCP muestra su propio nombre oficial largo de formato",
);
afirmar(await page.isVisible("text=PROCESO: Legal"), "el Convenio HCP usa el PROCESO global (no hay override para este tipo de documento)");
afirmar(await page.isVisible("text=CÓDIGO: FOR-LG-005"), "el Convenio HCP usa el CÓDIGO global");
// El logo NO es por tipo de documento — es un solo logo por empresa — así
// que el Convenio HCP de la misma empresa "Bausch + Lomb" también debe ver
// el logo del override, aunque el resto de sus casillas (PROCESO/CÓDIGO)
// venga del formato global.
const logoEnConvenioHcp = await page
  .waitForSelector('img[alt="Logo de la empresa"]', { timeout: 3000 })
  .then((el) => el.getAttribute("src"))
  .catch(() => null);
afirmar(logoEnConvenioHcp === LOGO_EMPRESA_DATA_URL, "el logo del Convenio HCP también es el override de 'Bausch + Lomb' — el logo no es por tipo de documento, sino por empresa");
afirmar(await page.isVisible("text=Elaborado por Admin Prueba, Dirección Médica"), "el pie de página oficial también se ve en el Convenio HCP (diálogo de impresión)");
// Fase 8: el interruptor Español/English vive solo en el diálogo compacto
// (mismo estado compartido) — se cierra la impresión para volver a él.
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
afirmar(await page.isVisible("text=Clausulado"), "al cerrar la impresión, el diálogo compacto sigue abierto detrás");

console.log("7. Cambiar a English (desde el diálogo compacto): encabezados/etiquetas fijas también se traducen, no solo el contenido");
await page.click('button:has-text("English")');
afirmar((await valorCampoCompacto(page, "Status")) === "Pending", "la etiqueta 'Estado' y el valor del estado se traducen a 'Status'/'Pending' en el cuerpo");
afirmar(await page.isVisible("text=Contract origin"), "el encabezado de sección 'Origen del contrato' se traduce");
afirmar(await page.isVisible("text=Consulting objective"), "la etiqueta 'Objetivo de la consultoría' se traduce");
afirmar(await page.isVisible("text=Exhibit B — Payment terms"), "el encabezado 'Anexo B' se traduce a 'Exhibit B'");
afirmar(await page.isVisible("text=Approval"), "el encabezado de la sección de aprobación se traduce a 'Approval'");
afirmar(await page.isVisible("text=Approving area"), "la tabla de Aprobación traduce su encabezado 'Área que aprueba' a 'Approving area'");
afirmar(await page.isVisible("text=Clauses (English)"), "el título del clausulado se traduce a 'Clauses (English)'");
afirmar(await page.isVisible("text=Clause 1"), "la etiqueta 'Numeral 1' se traduce a 'Clause 1' al imprimir en inglés");
afirmar(await page.isVisible("text=Exhibit C"), "la etiqueta 'Anexo C' se traduce a 'Exhibit C' al imprimir en inglés");
afirmar(await page.isVisible("text=1. Term. Effective from the Effective Date."), "el contenido del numeral sigue viniendo del texto en inglés ya existente");

console.log("7b. El membrete (etiqueta fija de formato) NO se traduce al cambiar a English — se confirma reabriendo la impresión");
await page.click('button:has-text("Ver / Imprimir / Exportar a PDF")');
await page.waitForSelector("text=Vista oficial del documento", { timeout: 5000 });
afirmar(
  await page.isVisible("text=Convenio de Consultoría con Profesional de la Salud (Convenio HCP)"),
  "el membrete (nombre oficial del formato) NO se traduce al cambiar a English — es una etiqueta fija de formato controlado, no contenido del documento",
);
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

await page.click('button:has-text("Español")');
afirmar(!(await page.isVisible('text="Status"').catch(() => false)), "al volver a español, la etiqueta 'Status' deja de verse");
afirmar((await valorCampoCompacto(page, "Estado")) === "Pendiente", "al volver a español, el campo 'Estado' vuelve a valer 'Pendiente'");

afirmar(erroresConsola.length === 0, `sin errores de consola/página (encontrados: ${erroresConsola.length})`);
if (erroresConsola.length > 0) console.error(erroresConsola.join("\n"));

await browser.close();

if (fallas > 0) {
  console.error(`\n${fallas} verificación(es) fallaron.`);
  process.exit(1);
}
console.log("\nTodas las verificaciones pasaron.");
