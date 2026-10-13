#!/usr/bin/env node
// Fase 4 — verifica la Solicitud de Evento, el caso difícil del plan: única
// sesión vs. varias sesiones, presupuesto condensado (auto-cálculo y su
// asimetría de transporte), muestras médicas planeadas, la cadena fija de
// 3 etapas, rechazo → editar y reenviar (con el reinicio de cadena
// server-side simulado en fixtures.mjs), la ventana de adenda sobre un
// evento ya Aprobado, y el código de acceso para Ejecución en Sitio. Todo
// contra fixtures locales — nunca contra Supabase real.
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import {
  interceptarSupabase,
  crearHandlerResolverAprobacion,
  crearHandlerAbrirVentanaAdenda,
  crearHandlerCerrarVentanaAdenda,
  resolverCaptchaLogin,
} from "./lib/fixtures.mjs";

/**
 * Cuenta las páginas reales de un PDF generado con `page.pdf()` contando
 * los objetos `/Type /Page` (sin contar `/Type /Pages`, el nodo padre del
 * árbol de páginas — de ahí el lookahead negativo). Suficiente para un
 * conteo de regresión (¿el documento largo generó más de 1 página?, no
 * hace falta un parser de PDF completo) — usado para la Fase 5 (quinta
 * entrega): un documento largo (Solicitud de Evento) se estaba exportando
 * a PDF con SOLO la primera página, recortado por el diálogo que envuelve
 * la vista de impresión (ver el `@media print` nuevo en `index.css`).
 *
 * IMPORTANTE: contar páginas NO basta — un PDF puede tener varias páginas
 * y aun así estar en blanco (esto pasó de verdad: la primera corrección de
 * la quinta entrega arregló la paginación pero dejó el FONDO de la app
 * imprimiéndose por encima del documento real, visto por el usuario como
 * "página en blanco, solo con el encabezado/pie del navegador"). Por eso
 * `contarPaginasPdf` siempre se usa junto con `extraerTextoPdf` — que
 * confirma que el TEXTO real del documento (no solo el conteo de páginas)
 * llegó al PDF.
 */
function contarPaginasPdf(bufferPdf) {
  const texto = bufferPdf.toString("latin1");
  const coincidencias = texto.match(/\/Type\s*\/Page(?!s)/g);
  return coincidencias ? coincidencias.length : 0;
}

/**
 * Extrae el texto real de un PDF con `pdftotext` (poppler-utils, ya
 * disponible en este entorno) — a diferencia de `contarPaginasPdf`, esto
 * prueba que el CONTENIDO del documento (no solo la estructura de páginas)
 * llegó al PDF exportado. Si `pdftotext` no está disponible en el entorno
 * donde corre este script, se degrada con un aviso en vez de fallar toda
 * la suite por una herramienta externa opcional.
 */
function extraerTextoPdf(rutaPdf) {
  try {
    return execFileSync("pdftotext", ["-layout", rutaPdf, "-"], { encoding: "utf-8" });
  } catch {
    console.warn("  (aviso: 'pdftotext' no está disponible en este entorno — se omite la verificación de texto del PDF)");
    return null;
  }
}

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rutaBundle = resolve(raiz, "bundle.html");

const fixtures = {
  usuariosAuth: [{ id: "auth-admin", email: "admin.prueba@bausch.com", password: "clave-segura-123" }],
  tablas: {
    usuarios: [
      {
        id: "usr-admin",
        nombre: "Admin Prueba",
        cargo: "Marketing",
        email: "admin.prueba@bausch.com",
        // Fase 8: "comercial" no puede crear Solicitud de Evento bajo la
        // regla real de permisos (ver navegacion.ts) — solo "marketing" y
        // "medica" tienen ese item en su `soloRoles`, y ya no basta con ser
        // administrador (ver el hallazgo grande "un solo punto de entrada
        // para crear documentos"). Este usuario sigue siendo administrador
        // para el resto del script (aprobar/anular/generar código, que usan
        // reglas de permiso separadas, no `paginaVisible`).
        rol: "marketing",
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
      { id: "cat-1", catalogo: "empresasGrupo", valor: "Bausch + Lomb", orden: 1 },
      { id: "cat-2", catalogo: "empresasGrupo", valor: "Bausch Health", orden: 2 },
      { id: "cat-3", catalogo: "tiposEvento", valor: "Congreso Médico", orden: 1 },
      { id: "cat-4", catalogo: "tiposEvento", valor: "Simposio", orden: 2 },
      { id: "cat-5", catalogo: "areasEspecialidadEvento", valor: "Oftalmología", orden: 1 },
      { id: "cat-6", catalogo: "areasEspecialidadEvento", valor: "Glaucoma", orden: 2 },
      { id: "cat-7", catalogo: "lineasTerapeuticas", valor: "Superficie ocular", orden: 1 },
      { id: "cat-8", catalogo: "tiposTransporte", valor: "Aéreo", orden: 1 },
      { id: "cat-9", catalogo: "tiposTransporte", valor: "Terrestre", orden: 2 },
      { id: "cat-10", catalogo: "categoriasHotel", valor: "5 estrellas", orden: 1 },
      { id: "cat-11", catalogo: "centrosCostos", valor: "CC-Comercial-001", orden: 1 },
      { id: "cat-12", catalogo: "monedas", valor: "COP", orden: 1 },
      { id: "cat-13", catalogo: "monedas", valor: "USD", orden: 2 },
    ],
    // País ahora siempre se ve como desplegable (SelectPaisCiudad) —
    // necesita el catálogo `paises_region` poblado. No se define
    // `paises_region_ciudades` a propósito: sin ciudades cargadas para
    // "Colombia", el campo Ciudad se degrada a texto libre (ver
    // SelectPaisCiudad.tsx), que es lo que este script necesita para
    // poder `.fill()` Bogotá/Cali/Medellín.
    paises_region: [{ id: "pr-1", pais: "Colombia" }],
    speakers: [{ id: "spk-1", nombre_completo: "Dr. Iván Restrepo", especialidad: "Oftalmología", activo: true }],
    productos_portafolio: [
      { id: "prod-1", nombre: "Lente Intraocular X200", empresa_grupo: "Bausch + Lomb", activo: true, orden: 1 },
      { id: "prod-2", nombre: "Solución de Lentes de Contacto Pro", empresa_grupo: "Bausch + Lomb", activo: true, orden: 2 },
    ],
    solicitudes_evento: [],
    evento_aprobaciones: [],
    sesiones_evento: [],
    evento_muestras_planeadas: [],
    eventos_codigos_acceso: [],
    campos_personalizados_definicion: [],
    etiquetas_campo: [],
  },
  rpc: {
    resolver_aprobacion_evento: crearHandlerResolverAprobacion("solicitudes_evento", "evento_aprobaciones", "evento"),
    abrir_ventana_adenda_evento: crearHandlerAbrirVentanaAdenda("solicitudes_evento", "p_evento_id"),
    cerrar_ventana_adenda_evento: crearHandlerCerrarVentanaAdenda("solicitudes_evento", "p_evento_id"),
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

console.log("1. Login e ir a Nueva Solicitud de Evento (única sesión)");
await page.goto(pathToFileURL(rutaBundle).href);
await page.fill("#email", "admin.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Tablero", { timeout: 5000 });
await page.click('button:has-text("Solicitud de Evento")');
await page.waitForSelector("text=Nueva Solicitud de Evento", { timeout: 5000 });
afirmar(await page.isVisible("text=Nueva Solicitud de Evento"), "se abre el formulario de Nueva Solicitud de Evento");

console.log("2. Completar el evento de única sesión, con muestras médicas y presupuesto");
await page.getByLabel("Nombre del solicitante *").fill("Laura Gómez");
await page.getByLabel("Empresa del grupo *").click();
await page.getByRole("option", { name: "Bausch + Lomb" }).click();
await page.getByLabel("Tipo de evento *").click();
await page.getByRole("option", { name: "Congreso Médico" }).click();
await page.getByLabel("Área / especialidad *").click();
await page.getByRole("option", { name: "Oftalmología" }).click();
await page.getByLabel("Nombre del evento *").fill("Simposio de Catarata 2026");
await page.getByLabel("Fecha de inicio del evento *").fill("2026-11-10");
await page.getByLabel("Fecha de fin del evento *").fill("2026-11-11");
await page.getByLabel("Dirección *").fill("Calle 100 # 10-20");
await page.getByLabel("País *").click();
await page.getByRole("option", { name: "Colombia" }).click();
await page.getByLabel("Ciudad *").fill("Bogotá");
await page.getByLabel("Objetivos del evento *").fill("Actualizar conocimientos en cirugía de catarata.");

console.log("   Muestras médicas planeadas");
await page.click("#evento-entrega-muestras");
await page.getByLabel("Detalle *").first().fill("Lentes intraoculares para demostración.");
await page.click('button:has-text("Agregar producto")');
await page.getByLabel("Producto").click();
await page.getByRole("option", { name: "Lente Intraocular X200" }).click();
await page.getByLabel("Cantidad aproximada").fill("5");

console.log("   Inscripción, honorarios y transporte/hospedaje/alimentos (única sesión)");
await page.getByLabel("Honorarios del speaker", { exact: true }).fill("150");
await page.getByLabel("Monto de inscripción").fill("300");
await page.getByLabel("Número de noches").fill("2");
await page.getByLabel("Costo por noche/persona").fill("100");
await page.getByLabel("Monto de alimentos por día").fill("50");

await page.getByLabel("Moneda *").click();
await page.getByRole("option", { name: "COP", exact: true }).click();

console.log("3. Verificar el presupuesto condensado auto-calculado");
await page.waitForTimeout(300);
afirmar(
  (await page.getByLabel("Hospedaje (sugerido, editable)").inputValue()) === "200",
  "hospedaje condensado = noches × costo/noche (2 × 100 = 200)",
);
afirmar(
  (await page.getByLabel("Alimentos (sugerido, editable)").inputValue()) === "100",
  "alimentos condensado = monto/día × noches (50 × 2 = 100)",
);
afirmar(
  (await page.getByLabel("Inscripción (sugerido, editable)").inputValue()) === "300",
  "inscripción condensada copiada del monto de inscripción",
);
afirmar(
  (await page.getByLabel("Honorarios del speaker (sugerido, editable)").inputValue()) === "150",
  "honorarios del speaker condensados copiados del campo de honorarios",
);
const totalTexto = await page.getByTestId("evento-total-condensado").innerText();
afirmar(totalTexto.includes("750"), `el total condensado es 750 (inscripción+hospedaje+alimentos+honorarios) — vio: "${totalTexto}"`);

await page.click('button:has-text("Enviar a aprobación")');
await page.waitForSelector("text=Simposio de Catarata 2026", { timeout: 5000 });
afirmar(await page.isVisible("text=Simposio de Catarata 2026"), "el evento de única sesión aparece en el Tablero tras enviarlo");
afirmar(await page.isVisible("text=Pendiente"), "el evento queda en estado Pendiente");

console.log("4. Aprobar las 3 etapas de la cadena fija");
await page.click("text=Simposio de Catarata 2026");
await page.waitForSelector("text=Cadena de aprobación", { timeout: 5000 });
for (const etapa of ["Gerente / Director de la Unidad de Negocio", "Director Médico", "Compliance Officer"]) {
  afirmar(await page.isVisible(`text=${etapa}`), `se ve la etapa: ${etapa}`);
  await page.getByPlaceholder("Comentario (obligatorio para rechazar)").fill(`Aprobado — ${etapa}`);
  await page.click('button:has-text("Aprobar")');
  await page.waitForTimeout(300);
}
const quedoAprobado = await page
  .waitForSelector('[role="dialog"] >> text=Aprobado', { timeout: 3000 })
  .then(() => true)
  .catch(() => false);
afirmar(quedoAprobado, "el evento queda Aprobado tras la última etapa");

/*
 * Fase 5 (post-reconstrucción, séptima entrega) — el usuario reportó, con
 * capturas, que la parte superior de la hoja impresa mostraba texto que no
 * pertenece al FORMATO oficial en papel: el nombre del evento y el estado
 * ("CONGRESO COLOMBIANO DE DERMATOLOGIA" / "Aprobado" / "Humax
 * Pharmaceutical"). Ese texto era el `DialogHeader` (DialogTitle + Badge +
 * DialogDescription) que en ese momento envolvía `DocumentoImprimible`
 * directamente en el mismo diálogo.
 *
 * Fase 8 (hallazgo grande "separar vista de detalle compacta de la vista de
 * impresión") — esto queda resuelto de raíz, no solo con CSS: el encabezado
 * compacto (nombre del evento + badge de estado) y la vista de impresión
 * ahora viven en DOS DIÁLOGOS SEPARADOS Y APILADOS (ver DetalleEvento.tsx).
 * El diálogo de impresión ni siquiera tiene ese encabezado en su DOM — no
 * hace falta ocultarlo con `@media print` porque nunca estuvo ahí.
 */
console.log("   El encabezado del diálogo (nombre del evento + estado) vive en el diálogo compacto; el de impresión es aparte y apilado");
const tituloDialogoCompacto = page.locator('[role="dialog"] h2', { hasText: "Simposio de Catarata 2026" }).first();
afirmar(await tituloDialogoCompacto.isVisible(), "en el diálogo compacto sí se ve el nombre del evento en el encabezado");
await page.click('button:has-text("Ver / Imprimir / Exportar a PDF")');
await page.waitForSelector("text=Vista oficial del documento", { timeout: 5000 });
const dialogoImpresion = page.locator('[role="dialog"]').last();
afirmar(
  (await dialogoImpresion.locator("h2", { hasText: "Simposio de Catarata 2026" }).count()) === 0,
  "el diálogo de impresión no contiene ningún encabezado (h2) con el nombre del evento — ese título solo vive en el diálogo compacto, aparte",
);
afirmar(
  await dialogoImpresion.locator("text=Lentes intraoculares para demostración.").first().isVisible(),
  "el cuerpo imprimible (CuerpoEvento) sí se ve dentro del diálogo de impresión",
);

console.log("   Vista de impresión (CuerpoEvento)");
afirmar(
  await dialogoImpresion.isVisible().then(() => page.isVisible('[role="dialog"] >> text=Solicitud de Evento')),
  "la barra de herramientas de la vista oficial muestra el nombre del formato ('Solicitud de Evento')",
);
afirmar(
  await page.isVisible("text=Solicitud de Apoyos para Eventos Educativos y Eventos Promocionales"),
  "el membrete muestra el nombre oficial largo del formato",
);
afirmar(await page.isVisible("text=Lentes intraoculares para demostración."), "el cuerpo imprimible muestra el detalle de muestras médicas");

console.log("   Exportar a PDF: el documento largo debe paginarse completo (con su texto real), no recortarse a 1 sola página ni quedar en blanco");
const carpetaTemp = mkdtempSync(resolve(tmpdir(), "beats-pdf-"));
const rutaPdf = resolve(carpetaTemp, "evento.pdf");
// `printBackground: false` a propósito — el ajuste por defecto de la
// mayoría de navegadores ("Gráficos de fondo" apagado), para que esta
// prueba no dependa de un color de fondo para "ocultar" al overlay del
// diálogo: si el fondo de la app se filtrara al PDF (el bug real que
// reportó el usuario), su TEXTO tendría que aparecer igual, con o sin
// gráficos de fondo.
await page.pdf({ path: rutaPdf, format: "Letter", printBackground: false });
const bufferPdf = readFileSync(rutaPdf);
const paginasPdf = contarPaginasPdf(bufferPdf);
afirmar(paginasPdf > 1, `el PDF exportado tiene más de 1 página (tiene: ${paginasPdf}) — antes quedaba recortado a la primera pantalla visible del diálogo`);
const textoPdf = extraerTextoPdf(rutaPdf);
if (textoPdf !== null) {
  afirmar(textoPdf.includes("Lentes intraoculares para demostración."), "el PDF exportado contiene el texto real del documento (no quedó en blanco)");
  afirmar(!textoPdf.includes("Vista consolidada de las solicitudes"), "el PDF exportado NO incluye el fondo de la app (el Tablero) detrás del documento — antes se filtraba y se veía como páginas en blanco");
}
rmSync(carpetaTemp, { recursive: true, force: true });

// Fase 8: cerrar el diálogo de impresión — "Adenda o ajuste al formulario"
// vive en el diálogo compacto detrás, que sigue abierto.
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

console.log("5. Ventana de adenda sobre el evento ya Aprobado");
await page.click('button:has-text("Adenda o ajuste al formulario")');
await page.getByPlaceholder("Justificación de la adenda").fill("Se debe ajustar la ciudad del evento por cambio de sede.");
await page.click('button:has-text("Continuar")');
await page.waitForSelector("text=vuelve a Pendiente y se reinicia la cadena", { timeout: 5000 });
await page.getByLabel("Ciudad *").fill("Medellín");
await page.click('button:has-text("Guardar y reenviar")');
await page.waitForTimeout(300);
afirmar(await page.isVisible("text=Pendiente"), "tras guardar la adenda, el evento vuelve a Pendiente");
const cadenaReiniciada = await page.locator('[role="dialog"] >> text=Te toca a ti').count();
afirmar(cadenaReiniciada === 0 || (await page.isVisible("text=Gerente / Director de la Unidad de Negocio")), "la cadena de aprobación vuelve a mostrarse desde la primera etapa");

console.log("6. Re-aprobar las 3 etapas tras la adenda");
for (const etapa of ["Gerente / Director de la Unidad de Negocio", "Director Médico", "Compliance Officer"]) {
  await page.getByPlaceholder("Comentario (obligatorio para rechazar)").fill(`Re-aprobado tras adenda — ${etapa}`);
  await page.click('button:has-text("Aprobar")');
  await page.waitForTimeout(300);
}
const quedoAprobadoDeNuevo = await page
  .waitForSelector('[role="dialog"] >> text=Aprobado', { timeout: 3000 })
  .then(() => true)
  .catch(() => false);
afirmar(quedoAprobadoDeNuevo, "el evento vuelve a quedar Aprobado tras re-aprobar la cadena reiniciada por la adenda");
afirmar(await page.isVisible("text=Medellín"), "el cambio hecho durante la adenda (ciudad) quedó guardado");

console.log("7. Código de acceso para Ejecución en Sitio");
await page.click('button:has-text("Generar código de acceso")');
await page.waitForTimeout(300);
afirmar(await page.getByText("Activo", { exact: true }).isVisible(), "se genera un código de acceso activo");
await page.click('button:has-text("Desactivar")');
await page.waitForTimeout(300);
afirmar(await page.getByText("Inactivo", { exact: true }).isVisible(), "el código de acceso se puede desactivar");
afirmar((await page.getByText("Activo", { exact: true }).count()) === 0, "ya no queda ningún código marcado como Activo tras desactivarlo");

console.log("8. Anular el evento");
await page.click('button:has-text("Anular")');
await page.getByPlaceholder("Motivo de anulación").fill("El evento fue cancelado por el organizador.");
await page.click('button:has-text("Confirmar anulación")');
await page.waitForTimeout(300);
afirmar(await page.isVisible("text=Anulado"), "el evento queda Anulado");

await page.keyboard.press("Escape");
await page.waitForTimeout(200);

console.log("9. Crear un evento de varias sesiones (suma del presupuesto condensado)");
await page.click('button:has-text("Solicitud de Evento")');
await page.waitForSelector("text=Nueva Solicitud de Evento", { timeout: 5000 });
await page.getByLabel("Nombre del solicitante *").fill("Carlos Ruiz");
await page.getByLabel("Empresa del grupo *").click();
await page.getByRole("option", { name: "Bausch + Lomb" }).click();
await page.getByLabel("Tipo de evento *").click();
await page.getByRole("option", { name: "Simposio" }).click();
await page.getByLabel("Área / especialidad *").click();
await page.getByRole("option", { name: "Glaucoma" }).click();
await page.getByLabel("Nombre del evento *").fill("Congreso de Glaucoma 2026");
await page.getByLabel("Fecha de inicio del evento *").fill("2026-12-01");
await page.getByLabel("Fecha de fin del evento *").fill("2026-12-03");
await page.getByLabel("Dirección *").fill("Avenida 5 # 20-30");
await page.getByLabel("País *").click();
await page.getByRole("option", { name: "Colombia" }).click();
await page.getByLabel("Ciudad *").fill("Cali");
await page.getByLabel("Objetivos del evento *").fill("Compartir avances en el manejo del glaucoma.");
await page.getByLabel("Moneda *").click();
await page.getByRole("option", { name: "COP", exact: true }).click();

await page.locator("#evento-modalidad-sesiones").click();
await page.getByRole("option", { name: "Varias sesiones" }).click();
await page.waitForSelector("text=Sesiones", { timeout: 5000 });

async function completarSesion(indice, { noches, costoNoche, alimentosDia, transporte }) {
  await page.click('button:has-text("Agregar sesión")');
  const contenedor = page.locator(".rounded-md.border.p-3", { hasText: `Sesión ${indice + 1}` });
  await contenedor.getByLabel("Lugar *").fill(`Centro de Convenciones ${indice + 1}`);
  await contenedor.getByPlaceholder("Noches").fill(String(noches));
  await contenedor.getByPlaceholder("Costo noche/persona").fill(String(costoNoche));
  await contenedor.getByPlaceholder("Monto alimentos/día").fill(String(alimentosDia));
  await contenedor.getByPlaceholder("Monto transporte").fill(String(transporte));
}

await completarSesion(0, { noches: 1, costoNoche: 80, alimentosDia: 30, transporte: 50 });
await completarSesion(1, { noches: 2, costoNoche: 60, alimentosDia: 40, transporte: 70 });

await page.waitForTimeout(300);
afirmar(
  (await page.getByLabel("Hospedaje (sugerido, editable)").inputValue()) === "200",
  "hospedaje condensado suma las 2 sesiones (1×80 + 2×60 = 200)",
);
afirmar(
  (await page.getByLabel("Alimentos (sugerido, editable)").inputValue()) === "110",
  "alimentos condensado suma las 2 sesiones (30×1 + 40×2 = 110)",
);
afirmar(
  (await page.getByLabel("Transporte (suma de sesiones, editable)").inputValue()) === "120",
  "transporte condensado suma las 2 sesiones (50 + 70 = 120) — solo posible en Varias sesiones",
);

await page.click('button:has-text("Enviar a aprobación")');
await page.waitForSelector("text=Congreso de Glaucoma 2026", { timeout: 5000 });
afirmar(await page.isVisible("text=Congreso de Glaucoma 2026"), "el evento de varias sesiones aparece en el Tablero");

/*
 * Fase 5 (post-reconstrucción, séptima entrega) — el usuario mostró, con
 * capturas de un evento real de varias sesiones, que la vista de
 * impresión debe mostrar el desglose de Transportación/Hospedaje/
 * Alimentos DE CADA SESIÓN (no solo los campos de nivel de documento, que
 * en "Varias sesiones" quedan vacíos) — igual que ya lo hace el PDF de
 * referencia que adjuntó ("TRANSPORTACIÓN/HOSPEDAJE/ALIMENTOS POR
 * SESIÓN"). Se verifica aquí contra las 2 sesiones creadas arriba:
 * Sesión 1 (Centro de Convenciones 1: 1 noche×80, alimentos 30/día,
 * transporte 50) y Sesión 2 (Centro de Convenciones 2: 2 noches×60,
 * alimentos 40/día, transporte 70) — mismos montos que ya prueba el
 * condensado (200/110/120), ahora verificados también por sesión
 * individual en el cuerpo imprimible.
 */
console.log("   Vista de impresión de un evento de varias sesiones: debe mostrar el desglose de transporte/hospedaje/alimentos DE CADA SESIÓN");
await page.click("text=Congreso de Glaucoma 2026");
await page.waitForSelector("text=Cadena de aprobación", { timeout: 5000 });
// Fase 8: el cuerpo impreso (con sus <p> de una sola línea "Etiqueta:
// valor") solo vive en el diálogo de impresión, aparte del compacto.
await page.click('button:has-text("Ver / Imprimir / Exportar a PDF")');
await page.waitForSelector('[role="dialog"] >> text=Transportación por sesión', { timeout: 5000 });
const dialogoImpresionEvento = page.locator('[role="dialog"]').last();
afirmar(await dialogoImpresionEvento.locator("text=Transportación por sesión").isVisible(), "el cuerpo imprimible tiene la sección 'Transportación por sesión'");
afirmar(await dialogoImpresionEvento.locator("text=Hospedaje por sesión").isVisible(), "el cuerpo imprimible tiene la sección 'Hospedaje por sesión'");
afirmar(await dialogoImpresionEvento.locator("text=Alimentos por sesión").isVisible(), "el cuerpo imprimible tiene la sección 'Alimentos por sesión'");
afirmar(
  await dialogoImpresionEvento.locator("text=Sesión 1 — Centro de Convenciones 1").first().isVisible(),
  "se identifica la Sesión 1 por su lugar dentro de cada bloque por-sesión",
);
afirmar(
  await dialogoImpresionEvento.locator("text=Sesión 2 — Centro de Convenciones 2").first().isVisible(),
  "se identifica la Sesión 2 por su lugar dentro de cada bloque por-sesión",
);
// Se busca el texto completo de cada línea ("Subtotal: COP 50") en vez de
// solo "COP 50" — varios subtotales distintos comparten el mismo monto
// (p. ej. hospedaje de la Sesión 1 y alimentos de la Sesión 2 dan ambos
// 80), así que el texto completo de la etiqueta es lo que desambigua.
async function verSubtotal(texto, mensaje) {
  afirmar(await dialogoImpresionEvento.locator("p", { hasText: texto }).first().isVisible(), mensaje);
}
await verSubtotal("Subtotal: COP 50", "subtotal de transporte de la Sesión 1 (50)");
await verSubtotal("Subtotal: COP 70", "subtotal de transporte de la Sesión 2 (70)");
await verSubtotal("Subtotal: COP 80", "subtotal de hospedaje de la Sesión 1 (1 noche × 80 = 80)");
await verSubtotal("Subtotal: COP 120", "subtotal de hospedaje de la Sesión 2 (2 noches × 60 = 120)");
await verSubtotal("Subtotal: COP 30", "subtotal de alimentos de la Sesión 1 (30/día × 1 = 30)");
afirmar(
  (await dialogoImpresionEvento.locator("p", { hasText: "Subtotal: COP 80" }).count()) === 2,
  "subtotal de alimentos de la Sesión 2 (40/día × 2 = 80) coexiste con el de hospedaje de la Sesión 1, también 80",
);
// Fase 8: dos diálogos apilados — dos Escape para volver al Tablero.
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

console.log("10. Rechazar en la primera etapa, editar y reenviar, y verificar que la cadena se reinicia");
await page.click("text=Congreso de Glaucoma 2026");
await page.waitForSelector("text=Cadena de aprobación", { timeout: 5000 });
await page.getByPlaceholder("Comentario (obligatorio para rechazar)").fill("Falta claridad en el objetivo del evento.");
await page.click('button:has-text("Rechazar")');
await page.waitForTimeout(300);
afirmar(await page.isVisible("text=Rechazado"), "el evento queda Rechazado tras el rechazo en la primera etapa");

await page.click('button:has-text("Editar y reenviar")');
await page.waitForSelector("text=Nombre del solicitante *", { timeout: 5000 });
await page.getByLabel("Objetivos del evento *").fill("Compartir avances en el manejo del glaucoma, con foco en cirugía mínimamente invasiva.");
await page.click('button:has-text("Guardar y reenviar")');
await page.waitForTimeout(300);
afirmar(await page.isVisible("text=Pendiente"), "tras editar y reenviar, el evento vuelve a Pendiente");
afirmar(await page.isVisible("text=Gerente / Director de la Unidad de Negocio"), "la cadena de aprobación se reinicia desde la primera etapa (nunca se escribió evento_aprobaciones desde el cliente)");

for (const etapa of ["Gerente / Director de la Unidad de Negocio", "Director Médico", "Compliance Officer"]) {
  await page.getByPlaceholder("Comentario (obligatorio para rechazar)").fill(`Aprobado tras corrección — ${etapa}`);
  await page.click('button:has-text("Aprobar")');
  await page.waitForTimeout(300);
}
const glaucomaAprobado = await page
  .waitForSelector('[role="dialog"] >> text=Aprobado', { timeout: 3000 })
  .then(() => true)
  .catch(() => false);
afirmar(glaucomaAprobado, "el evento de varias sesiones queda Aprobado tras reenviarlo y re-aprobar toda la cadena");

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
