#!/usr/bin/env node
// Entrega 32 — verificaciones de las mejoras de interfaz y de flujo:
//  (4) máscara «Virtual» en la ubicación, (5) nombres en el Panel en vivo, (8) Indicadores dentro de «Informes y Auditoría»
//  con pestañas, (9) menú lateral tipo acordeón, (10) superior que aprueba autocargado, (11) mayúsculas en los campos de
//  texto (no en correo) y (12) Convenio HCP elaborado en el aplicativo corporativo de contratos.
import { chromium } from "playwright";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { interceptarSupabase, resolverCaptchaLogin } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rutaBundle = resolve(raiz, "bundle.html");
const ahora = new Date();
const dia = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

const reg = (id, nombres, apellidos, especialidad, tipo, ciudad = "Bogotá") => ({
  id, evento_id: "evt-v", sesion_ejecucion_id: "ses-1", nombres, apellidos, cedula: `CC-${id}`, tipo_documento: "Cédula", profesion: "Médico", profesion_detalle: "",
  especialidad, especialidad_otra: "", celular: "3000000000", email: `${id}@example.com`, autoriza_imagen_voz: true, autoriza_datos_personales: true, firma_id: null,
  declaracion_texto_mostrado: "Declaro...", interes_visita_medica: "Sí", direccion: "", ciudad, tipo_participacion: tipo, capturado_en: ahora.toISOString(), pais: "Colombia",
});

const fixtures = {
  usuariosAuth: [{ id: "auth-admin", email: "admin.prueba@bausch.com", password: "clave-segura-123" }],
  tablas: {
    usuarios: [
      { id: "usr-admin", nombre: "Admin Prueba", cargo: "Dirección Médica", email: "admin.prueba@bausch.com", rol: "medica", iniciales: "AP", firma_id: null, debe_cambiar_password: false, auth_user_id: "auth-admin", telefono: "", paginas_permitidas: [], empresas_grupo: ["Bausch + Lomb"], paises_operacion: ["Colombia"], es_administrador: true, administrador_alcance_limitado: false, jefe_inmediato_id: "usr-jefe" },
      { id: "usr-jefe", nombre: "Laura Jefa", cargo: "Directora Médica", email: "laura@bausch.com", rol: "medica", iniciales: "LJ", firma_id: null, debe_cambiar_password: false, auth_user_id: "auth-jefe", telefono: "", paginas_permitidas: [], empresas_grupo: ["Bausch + Lomb"], paises_operacion: ["Colombia"], es_administrador: false, administrador_alcance_limitado: false },
    ],
    catalogo_valores: [
      { id: "cat-1", catalogo: "monedas", valor: "COP", orden: 1 },
      { id: "cat-2", catalogo: "empresasGrupo", valor: "Bausch + Lomb", orden: 1 },
    ],
    speakers: [{ id: "spk-1", nombre_completo: "Dra. Camila Reyes", especialidad: "Oftalmología", numero_documento: "CC-12345", email: "camila@example.com" }],
    solicitudes_evento: [
      { id: "evt-1", estado: "Aprobado", creado_por_id: "usr-admin", creado_en: ahora.toISOString(), nombre_evento: "Simposio Presencial 2026", empresa_grupo: "Bausch + Lomb", pais: "Colombia", ciudad: "Bogotá", direccion: "Calle 100", fecha_inicio_evento: dia(10), fecha_fin_evento: dia(10), numero_asistentes: 40, modalidad_sesiones: "Única sesión", participacion_academica: true, quien_dicta_actividad: "Speaker externo" },
      { id: "evt-v", estado: "Aprobado", creado_por_id: "usr-admin", creado_en: ahora.toISOString(), nombre_evento: "Webinar Virtual 2026", empresa_grupo: "Bausch + Lomb", pais: "N/A", estado_provincia: "N/A", ciudad: "N/A", direccion: "Virtual", modalidad_evento: "Virtual", fecha_inicio_evento: dia(-1), fecha_fin_evento: dia(0), numero_asistentes: 30, modalidad_sesiones: "Única sesión" },
    ],
    evento_aprobaciones: [], sesiones_evento: [], evento_muestras_planeadas: [],
    eventos_codigos_acceso: [{ id: "cod-1", evento_id: "evt-v", codigo: "ABC123", activo: true, creado_por_id: "usr-admin", creado_en: ahora.toISOString(), expira_en: null }],
    evento_speakers_participacion: [{ id: "esp-1", evento_id: "evt-1", orden: 1, speaker_id: "spk-1", nombre_speaker: "Dra. Camila Reyes", monto_honorarios: 3000000, monto_inscripcion: 0, factura_modalidad: "", tipo_speaker: "externo" }],
    evento_speaker_presupuestos: [],
    fmv_checklists: [{ id: "fmv-1", estado: "Aprobado", evento_origen_id: "evt-1", speaker_id: "spk-1", nombre_completo: "Dra. Camila Reyes", creado_por_id: "usr-admin", creado_en: ahora.toISOString(), fecha: dia(0) }],
    fmv_aprobaciones: [],
    convenios_pago_hcp: [{ id: "cp-1", estado: "Aprobado", evento_origen_id: "evt-1", speaker_id: "spk-1", creado_por_id: "usr-admin", creado_en: ahora.toISOString(), hcp_nombre_completo: "Dra. Camila Reyes", hcp_cedula_licencia: "CC-12345", contraprestacion_hcp: 3000000, moneda_contraprestacion: "COP", fecha_inicio_actividad: dia(10) }],
    convenio_aprobaciones: [],
    cafs: [{ id: "caf-1", estado: "Aprobado", evento_origen_id: "evt-1", speaker_id: "spk-1", creado_por_id: "usr-admin", creado_en: ahora.toISOString(), codigo_documento: "CAF-1", compania_nombre: "Bausch + Lomb", contraparte_nombre: "Dra. Camila Reyes" }],
    caf_aprobaciones: [],
    notificaciones_pago_hcp: [],
    convenios_hcp: [], convenio_hcp_aprobaciones: [], convenio_hcp_ajustes_clausula: [],
    plantilla_convenio_hcp_version: [],
    campos_personalizados_definicion: [], etiquetas_campo: [], evento_repositorio_archivos: [], evento_registros_financieros: [],
    registros_participacion: [
      reg("r1", "Ana", "Torres", "Oftalmología", "Asistente"),
      reg("r2", "Luis", "Mora", "Cardiología", "Speaker", "Medellín"),
    ],
    muestras_entregadas: [], productos_portafolio: [],
    archivos_adjuntos: [], notificaciones: [], paises_region: [{ id: "pr-1", pais: "Colombia" }],
  },
  rpc: {},
};

let fallas = 0;
const afirmar = (c, m) => { if (c) console.log(`  OK  ${m}`); else { console.error(`  X   ${m}`); fallas++; } };
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
await interceptarSupabase(page, fixtures);
await page.goto(pathToFileURL(rutaBundle).href);
await page.fill("#email", "admin.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Informe de Pagos", { timeout: 10000 });

console.log("9. Menú lateral tipo acordeón");
const grupo = page.getByTestId("nav-grupo-Informes y Auditoría");
afirmar((await grupo.getAttribute("aria-expanded")) === "true", "el grupo «Informes y Auditoría» arranca desplegado");
afirmar(await page.locator('nav button:has-text("Informe de Pagos")').isVisible(), "se ven las opciones del grupo desplegado");
await grupo.click();
afirmar((await grupo.getAttribute("aria-expanded")) === "false", "al pulsar el encabezado el grupo se pliega");
afirmar(!(await page.locator('nav button:has-text("Informe de Pagos")').isVisible()), "las opciones del grupo plegado dejan de verse");
afirmar(await page.locator('nav button:has-text("Tablero de Documentos")').isVisible(), "el grupo «Principal» siempre está visible");
const guardado = await page.evaluate(() => localStorage.getItem("beats.nav.plegados"));
afirmar(Boolean(guardado && guardado.includes("Informes y Auditoría")), "el estado plegado se recuerda en el navegador");
await grupo.click();
afirmar(await page.locator('nav button:has-text("Informe de Pagos")').isVisible(), "al volver a pulsar se despliega");

console.log("8. «Indicadores de Uso y Gestión» dentro de «Informes y Auditoría» con pestañas");
const orden = await page.evaluate(() => {
  const nav = document.querySelector("nav");
  const textos = [...nav.querySelectorAll("button")].map((b) => b.textContent?.trim() ?? "");
  return textos;
});
const iInformes = orden.findIndex((t) => t.startsWith("Informes y Auditoría"));
const iConfig = orden.findIndex((t) => t.startsWith("Configuración") && !t.includes("Usuarios") && !t.includes("Campos") && !t.includes("Plantilla") && !t.includes("Notificaciones"));
const iInd = orden.findIndex((t) => t.includes("Indicadores de Uso y Gestión"));
afirmar(iInd > iInformes && (iConfig === -1 || iInd < iConfig), "el ítem está después del encabezado «Informes y Auditoría» y antes de «Configuración»");
await page.locator('nav button:has-text("Indicadores de Uso y Gestión")').click();
await page.waitForSelector('[data-testid="indicadores-pestanas"]', { timeout: 8000 });
const pestanas = await page.locator('[data-testid="indicadores-pestanas"] [role="tab"]').allInnerTexts();
afirmar(pestanas.length === 6, `la ventana tiene 6 pestañas temáticas (${pestanas.join(" | ")})`);
await page.waitForSelector('[data-testid="descargar-kpis-gestion"]', { timeout: 8000 });
afirmar(await page.getByTestId("descargar-kpis-gestion").isVisible(), "las pestañas de gestión ofrecen la descarga de KPIs en CSV");
await page.getByTestId("ind-tab-costos").click();
afirmar(await page.locator("text=Presupuesto solicitado").isVisible(), "la pestaña «Costos y contratación» muestra sus paneles");
await page.getByTestId("ind-tab-speakers").click();
afirmar(await page.locator("text=Eventos según quién dicta").isVisible(), "la pestaña «Speakers y educación» muestra sus paneles");
await page.getByTestId("ind-tab-eventos").click();
afirmar(await page.locator("text=Cumplimiento de asistencia").isVisible(), "la pestaña «Eventos y asistentes» muestra la asistencia");

console.log("4. «Virtual» en lugar de «N/A, N/A» (solo visualización)");
await page.locator('nav button:has-text("Ejecución de Eventos")').click();
const filaV = page.locator("tr", { hasText: "Webinar Virtual 2026" });
await filaV.waitFor({ timeout: 8000 });
const textoFila = await filaV.innerText();
afirmar(/Virtual/.test(textoFila.replace("Webinar Virtual 2026", "")), "la ubicación del evento virtual se muestra como «Virtual»");
afirmar(!/N\/A/.test(textoFila), "no aparece «N/A» en la fila");
afirmar(fixtures.tablas.solicitudes_evento.find((e) => e.id === "evt-v").ciudad === "N/A", "la base de datos sigue guardando «N/A» (máscara solo de visualización)");

console.log("5. Panel en vivo: nombres en los últimos check-ins");
await page.locator('nav button:has-text("Panel en Vivo")').click();
await page.waitForSelector('[data-testid="panel-vivo-ultimos"]', { timeout: 8000 });
const ultimos = await page.getByTestId("panel-vivo-ultimos").innerText();
afirmar(ultimos.includes("Ana Torres") && ultimos.includes("Luis Mora"), "los últimos check-ins muestran el nombre del asistente");
afirmar(ultimos.includes("Oftalmología") && ultimos.includes("Medellín"), "y siguen mostrando especialidad y ciudad");

console.log("10 y 11. Solicitud de evento: superior que aprueba autocargado y mayúsculas");
await page.locator('nav button:has-text("Solicitud de Evento")').click();
await page.waitForSelector("text=Nombre del superior que aprueba", { timeout: 8000 });
const campoSuperior = page.locator('label:has-text("Nombre del superior que aprueba")').locator("..").locator("input");
await page.waitForFunction(() => [...document.querySelectorAll("input")].some((i) => i.value === "LAURA JEFA"), null, { timeout: 8000 }).catch(() => {});
afirmar((await campoSuperior.inputValue()) === "LAURA JEFA", "se cargó el jefe inmediato del usuario (en mayúsculas)");
await campoSuperior.fill("pedro pérez");
afirmar((await campoSuperior.inputValue()) === "PEDRO PÉREZ", "el campo sigue siendo editable y convierte lo escrito en minúsculas");
const campoSolicitante = page.locator('label:has-text("Nombre del solicitante")').locator("..").locator("input").first();
afirmar((await campoSolicitante.inputValue()) === "ADMIN PRUEBA", "el nombre del solicitante también queda en mayúsculas");

console.log("12. Convenio HCP: crearlo en BEATS o en el aplicativo corporativo");
await page.locator('nav button:has-text("Convenio HCP")').first().click();
await page.waitForSelector("text=Nuevo Convenio HCP", { timeout: 8000 });
await page.locator("#cvhcp-evento-origen").click();
await page.getByRole("option").first().click();
await page.waitForSelector('[data-testid="cvhcp-pregunta-modalidad"]', { timeout: 8000 });
afirmar(true, "al elegir el evento pregunta dónde se elaborará el convenio");
await page.getByTestId("cvhcp-modalidad-corporativo").click();
await page.waitForSelector('[data-testid="cvhcp-banner-corporativo"]', { timeout: 5000 });
afirmar(await page.getByTestId("cvhcp-banner-corporativo").isVisible(), "aparece el aviso de convenio del aplicativo corporativo");
afirmar(await page.locator("#cvhcp-evento-origen").isEnabled(), "el evento de origen sigue activo");
afirmar(await page.locator("#cvhcp-considerando-es").isDisabled(), "el resto del formulario queda deshabilitado");
await page.click('button:has-text("Enviar a aprobación")');
await page.waitForTimeout(1500);
const filas = fixtures.tablas.convenios_hcp;
afirmar(filas.length === 1, "se creó el registro del convenio");
afirmar(filas[0]?.elaborado_en_contratos_corporativo === true, "queda marcado como elaborado en el aplicativo corporativo");
afirmar(filas[0]?.estado === "Aprobado", "queda Aprobado directamente (sin cadena de aprobación)");
afirmar(fixtures.tablas.convenio_hcp_aprobaciones.length === 0, "no se crearon pasos de aprobación");
afirmar(!filas[0]?.clausulado_snapshot, "no se exigió ni copió la plantilla legal");
await page.waitForTimeout(500);

console.log("12b. Detalle y Expediente del convenio corporativo");
await page.locator('nav button:has-text("Tablero de Documentos")').click();
await page.waitForSelector("text=Dra. Camila Reyes", { timeout: 8000 });
await page.getByTestId("tablero-filtro-tipo").click();
await page.getByTestId("tablero-filtro-tipo-convenioHCP").click();
await page.keyboard.press("Escape");
await page.getByText("Dra. Camila Reyes").first().click();
await page.waitForSelector('[data-testid="cvhcp-detalle-corporativo"]', { timeout: 8000 });
afirmar(true, "el detalle explica que se elaboró en el aplicativo corporativo");
afirmar((await page.locator('button:has-text("Ver / Imprimir / Exportar a PDF")').count()) === 0, "no se ofrece imprimir/PDF (no hay texto legal en BEATS)");
afirmar((await page.locator('button:has-text("Enviar al HCP para firma")').count()) === 0, "no se ofrece enviar el convenio al HCP desde BEATS");
afirmar(/sin cadena de aprobación/i.test(await page.locator('[role="dialog"]').last().innerText()), "la sección de aprobaciones indica que no hay cadena en BEATS");
await page.keyboard.press("Escape");

afirmar(errores.length === 0, `sin errores de página (${errores.length})`);
if (errores.length) console.error(errores.join("\n"));
await browser.close();
if (fallas > 0) { console.error(`\n${fallas} verificación(es) fallaron.`); process.exit(1); }
console.log("\nTodas las verificaciones pasaron.");
