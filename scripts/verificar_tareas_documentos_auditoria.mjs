#!/usr/bin/env node
// Fase 6 — verifica las pantallas que antes caían en el placeholder
// genérico ("Tareas Pendientes", "Visor Documental", "Participación de
// HCPs/Speakers") y la separación entre "Auditoría de Eventos" (checklist
// de documentos faltantes por evento) e "Historial y Auditoría" (línea de
// tiempo) — antes ambas mal cableadas al mismo id de página `auditoria`.
// Todo contra fixtures locales, mismo patrón que el resto de `verificar_*.mjs`.
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { interceptarSupabase, resolverCaptchaLogin } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rutaBundle = resolve(raiz, "bundle.html");

function fechaISO(diasDesdeHoy) {
  const d = new Date();
  d.setDate(d.getDate() + diasDesdeHoy);
  return d.toISOString().slice(0, 10);
}

const ahora = new Date().toISOString();

const fixtures = {
  usuariosAuth: [
    { id: "auth-md", email: "medica.prueba@bausch.com", password: "clave-medica-123" },
    { id: "auth-lc", email: "legal.prueba@bausch.com", password: "clave-legal-123" },
  ],
  tablas: {
    usuarios: [
      {
        id: "usr-md", nombre: "Dra. Marcela Duque", cargo: "Directora Médica", email: "medica.prueba@bausch.com",
        rol: "medica", iniciales: "MD", firma_id: null, debe_cambiar_password: false, auth_user_id: "auth-md",
        telefono: "", paginas_permitidas: [], empresas_grupo: ["Bausch + Lomb"], paises_operacion: ["Colombia"],
        es_administrador: true, administrador_alcance_limitado: false,
      },
      {
        id: "usr-lc", nombre: "Laura Cifuentes", cargo: "Legal/Compliance", email: "legal.prueba@bausch.com",
        rol: "legal_compliance", iniciales: "LC", firma_id: null, debe_cambiar_password: false, auth_user_id: "auth-lc",
        telefono: "", paginas_permitidas: [], empresas_grupo: ["Bausch + Lomb"], paises_operacion: ["Colombia"],
        es_administrador: true, administrador_alcance_limitado: false,
      },
    ],
    paises_region: [
      { id: "pr-1", pais: "Colombia", region: "Andina" },
      { id: "pr-2", pais: "México", region: "Norte" },
    ],
    archivos_adjuntos: [
      { id: "arc-rethus", nombre: "rethus-julian-mesa.pdf", tipo: "application/pdf", tamano_bytes: 1000, data_url: "data:application/pdf;base64,AAAA", cargado_en: fechaISO(-30) },
      { id: "arc-fotos", nombre: "fotos-evento-retina.jpg", tipo: "image/jpeg", tamano_bytes: 2000, data_url: "data:image/jpeg;base64,AAAA", cargado_en: fechaISO(-5) },
      { id: "arc-carta", nombre: "carta-invitacion-retina.pdf", tipo: "application/pdf", tamano_bytes: 1500, data_url: "data:application/pdf;base64,AAAA", cargado_en: fechaISO(-40) },
      { id: "arc-oc", nombre: "orden-compra-500.pdf", tipo: "application/pdf", tamano_bytes: 1200, data_url: "data:application/pdf;base64,AAAA", cargado_en: fechaISO(-9) },
      { id: "arc-comp", nombre: "comprobante-pago-500.pdf", tipo: "application/pdf", tamano_bytes: 1200, data_url: "data:application/pdf;base64,AAAA", cargado_en: fechaISO(-3) },
      { id: "arc-fac", nombre: "factura-099.pdf", tipo: "application/pdf", tamano_bytes: 1200, data_url: "data:application/pdf;base64,AAAA", cargado_en: fechaISO(-4) },
    ],
    speakers: [
      {
        id: "spk-1", nombre_completo: "Dr. Julián Mesa", numero_documento: "CC-3001", especialidad: "Retina",
        direccion: "", pais: "Colombia", ciudad: "Bogotá", telefono: "", email: "", licencia_rethus: "RTH-01",
        fecha_vencimiento_rethus: fechaISO(200), rethus_indefinido: false, archivo_rethus_id: "arc-rethus",
        hoja_vida_adjunta: false, fecha_actualizacion_hoja_vida: null, archivo_hoja_vida_id: null, archivo_identidad_id: null,
        notas: "", creado_por_id: "usr-md", actualizado_en: ahora,
      },
    ],
    solicitudes_evento: [
      {
        id: "evt-1", estado: "Aprobado", creado_por_id: "usr-md", creado_en: fechaISO(-20),
        nombre_evento: "Congreso Retina 2026", nombre_solicitante: "Dra. Marcela Duque", pais: "Colombia", ciudad: "Bogotá",
        fecha_inicio_evento: fechaISO(-10), fecha_fin_evento: fechaISO(-9),
        participacion_academica: true, quien_dicta_actividad: "Speaker externo",
        carta_invitacion_id: "arc-carta",
      },
      {
        id: "evt-2", estado: "Aprobado", creado_por_id: "usr-md", creado_en: fechaISO(-15),
        nombre_evento: "Simposio de Glaucoma", nombre_solicitante: "Dra. Marcela Duque", pais: "México", ciudad: "CDMX",
        fecha_inicio_evento: fechaISO(-6), fecha_fin_evento: fechaISO(-6),
        participacion_academica: true, quien_dicta_actividad: "Speaker externo",
      },
      {
        id: "evt-3", estado: "Pendiente", creado_por_id: "usr-md", creado_en: fechaISO(-2),
        nombre_evento: "Taller de Catarata", nombre_solicitante: "Dra. Marcela Duque", pais: "Colombia", ciudad: "Medellín",
        fecha_inicio_evento: fechaISO(20), fecha_fin_evento: fechaISO(20),
        participacion_academica: false,
      },
    ],
    evento_aprobaciones: [
      { id: "ea-1-1", evento_id: "evt-1", orden: 1, etiqueta: "Gerente / Director de la Unidad de Negocio", rol_requerido: "comercial", estado: "aprobado", pendiente_desde: fechaISO(-20) },
      { id: "ea-1-2", evento_id: "evt-1", orden: 2, etiqueta: "Director Médico", rol_requerido: "medica", estado: "aprobado", pendiente_desde: fechaISO(-19) },
      { id: "ea-1-3", evento_id: "evt-1", orden: 3, etiqueta: "Compliance Officer", rol_requerido: "legal_compliance", estado: "aprobado", pendiente_desde: fechaISO(-18) },
      { id: "ea-2-1", evento_id: "evt-2", orden: 1, etiqueta: "Gerente / Director de la Unidad de Negocio", rol_requerido: "comercial", estado: "aprobado", pendiente_desde: fechaISO(-15) },
      { id: "ea-2-2", evento_id: "evt-2", orden: 2, etiqueta: "Director Médico", rol_requerido: "medica", estado: "aprobado", pendiente_desde: fechaISO(-14) },
      { id: "ea-2-3", evento_id: "evt-2", orden: 3, etiqueta: "Compliance Officer", rol_requerido: "legal_compliance", estado: "aprobado", pendiente_desde: fechaISO(-13) },
      { id: "ea-3-1", evento_id: "evt-3", orden: 1, etiqueta: "Gerente / Director de la Unidad de Negocio", rol_requerido: "comercial", estado: "aprobado", pendiente_desde: fechaISO(-2) },
      { id: "ea-3-2", evento_id: "evt-3", orden: 2, etiqueta: "Director Médico", rol_requerido: "medica", estado: "pendiente", pendiente_desde: fechaISO(-2) },
      { id: "ea-3-3", evento_id: "evt-3", orden: 3, etiqueta: "Compliance Officer", rol_requerido: "legal_compliance", estado: "pendiente", pendiente_desde: fechaISO(-2) },
    ],
    sesiones_evento: [],
    evento_muestras_planeadas: [],
    eventos_codigos_acceso: [],
    evento_repositorio_archivos: [
      { id: "era-1", evento_id: "evt-1", categoria: "listaAsistencia", archivo_id: "arc-fotos", sesion_id: null, conteo_personal_medico: 5, conteo_personal_no_medico: 2, conteo_otro_personal: 0, conteo_fuerza_ventas: 1 },
      { id: "era-2", evento_id: "evt-1", categoria: "fotos", archivo_id: "arc-fotos", sesion_id: null, conteo_personal_medico: null, conteo_personal_no_medico: null, conteo_otro_personal: null, conteo_fuerza_ventas: null },
    ],
    evento_registros_financieros: [
      { id: "erf-1", evento_id: "evt-1", categoria: "ordenCompra", archivo_id: "arc-oc", numero: "OC-500", fecha: fechaISO(-11), valor: 500000, moneda: "COP", sesion_id: null, factura_id: null },
      { id: "erf-2", evento_id: "evt-1", categoria: "comprobantePago", archivo_id: "arc-comp", numero: "COMP-500", fecha: fechaISO(-3), valor: 300000, moneda: "COP", sesion_id: null, factura_id: null },
      { id: "erf-fac-1", evento_id: "evt-1", categoria: "facturas", archivo_id: "arc-fac", numero: "FAC-2026-099", fecha: fechaISO(-5), valor: 300000, moneda: "COP", sesion_id: null, factura_id: null },
    ],
    convenios_pago_hcp: [
      {
        id: "cnv-1", estado: "Aprobado", creado_por_id: "usr-md", creado_en: fechaISO(-18), evento_origen_id: "evt-1",
        speaker_id: "spk-1", hcp_nombre_completo: "Dr. Julián Mesa", hcp_cedula_licencia: "CC-3001",
        nombre_evento_servicio: "Congreso Retina 2026", tipo_servicio: "Ponencia",
        fecha_inicio_actividad: fechaISO(-10), fecha_fin_actividad: fechaISO(-9),
        contraprestacion_hcp: 500000, moneda_contraprestacion: "COP",
      },
    ],
    convenio_aprobaciones: [
      { id: "ca-1-1", convenio_id: "cnv-1", orden: 1, etiqueta: "Jefe de Unidad de Negocios", rol_requerido: "comercial", estado: "aprobado", pendiente_desde: fechaISO(-18) },
      { id: "ca-1-2", convenio_id: "cnv-1", orden: 2, etiqueta: "Director Médico", rol_requerido: "medica", estado: "aprobado", pendiente_desde: fechaISO(-17) },
      { id: "ca-1-3", convenio_id: "cnv-1", orden: 3, etiqueta: "Área Legal", rol_requerido: "legal_compliance", estado: "aprobado", pendiente_desde: fechaISO(-16) },
    ],
    fmv_checklists: [
      { id: "fmv-1", estado: "Completado", creado_por_id: "usr-md", creado_en: fechaISO(-17), evento_origen_id: "evt-1", nombre_completo: "Dr. Julián Mesa", especialidad: "Retina" },
    ],
    cafs: [
      {
        id: "caf-1", estado: "Rechazado", creado_por_id: "usr-md", creado_en: fechaISO(-8), evento_origen_id: "evt-1",
        contraparte_nombre: "Dr. Julián Mesa", monto: 500000, moneda: "COP",
      },
    ],
    caf_aprobaciones: [
      { id: "cfa-1-1", caf_id: "caf-1", orden: 1, etiqueta: "Dirección Médica", rol_requerido: "medica", estado: "rechazado", comentario: "Falta soporte de la actividad.", pendiente_desde: fechaISO(-8) },
      { id: "cfa-1-2", caf_id: "caf-1", orden: 2, etiqueta: "Legal/Compliance", rol_requerido: "legal_compliance", estado: "pendiente", pendiente_desde: fechaISO(-8) },
      { id: "cfa-1-3", caf_id: "caf-1", orden: 3, etiqueta: "Finanzas", rol_requerido: "finanzas", estado: "pendiente", pendiente_desde: fechaISO(-8) },
      { id: "cfa-1-4", caf_id: "caf-1", orden: 4, etiqueta: "Gerencia General", rol_requerido: "gerencia_general", estado: "pendiente", pendiente_desde: fechaISO(-8) },
    ],
    convenios_hcp: [],
    convenio_hcp_aprobaciones: [],
    notificaciones_pago_hcp: [],
    auditoria: [
      { id: "aud-1", documento_id: "evt-1", tipo_doc: "evento", documento_nombre: "Congreso Retina 2026", actor_id: "usr-md", accion: "creacion", detalle: "Creado.", ocurrido_en: fechaISO(-20) + "T09:00:00Z", empresa_grupo: "Bausch + Lomb", pais: "Colombia" },
      { id: "aud-2", documento_id: "evt-1", tipo_doc: "evento", documento_nombre: "Congreso Retina 2026", actor_id: "usr-md", accion: "aprobacion_final", detalle: "Aprobado.", ocurrido_en: fechaISO(-18) + "T09:00:00Z", empresa_grupo: "Bausch + Lomb", pais: "Colombia" },
      { id: "aud-3", documento_id: "caf-1", tipo_doc: "caf", documento_nombre: "CAF — Dr. Julián Mesa", actor_id: "usr-md", accion: "rechazo", detalle: "Rechazado en la etapa Dirección Médica.", ocurrido_en: fechaISO(-8) + "T09:00:00Z", empresa_grupo: null, pais: "Colombia" },
    ],
    v_documentos: [],
    notificaciones: [],
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

console.log("1. Login como Dirección Médica (Dra. Marcela Duque)");
await page.goto(pathToFileURL(rutaBundle).href);
await page.fill("#email", "medica.prueba@bausch.com");
await page.fill("#password", "clave-medica-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Tablero", { timeout: 5000 });

console.log("2. Tareas Pendientes: aprobaciones pendientes de tu firma");
await page.click('button:has-text("Tareas Pendientes")');
await page.waitForSelector("text=Aprobaciones pendientes de tu firma", { timeout: 5000 });
afirmar(await page.isVisible("text=Taller de Catarata"), "el evento con la etapa 'Director Médico' pendiente aparece en la lista de aprobaciones");
afirmar(await page.isVisible("text=Línea: Director Médico"), "se identifica la línea exacta que le corresponde resolver");
afirmar(await page.isVisible("text=/Pendiente hace \\d+ día/"), "se muestra hace cuántos días está pendiente");

console.log("3. Tareas Pendientes: tareas encadenadas de Dirección Médica");
afirmar(await page.isVisible("text=Tareas de FMV Checklist / Convenio de Pago"), "se ve la sección de FMV/Convenio (solo Dirección Médica)");
const filaSimposio = page.locator("div", { has: page.getByText("Simposio de Glaucoma", { exact: true }) }).first();
afirmar(await page.getByText("Falta FMV Checklist").isVisible(), "Simposio de Glaucoma (sin Convenio ni FMV vinculados) muestra 'Falta FMV Checklist'");
afirmar(await page.getByText("Falta Convenio de Pago").isVisible(), "Simposio de Glaucoma también muestra 'Falta Convenio de Pago'");
afirmar(await page.isVisible("text=Tareas de CAF"), "se ve la sección de CAF");
afirmar(await page.getByText("Falta CAF").isVisible(), "Congreso Retina 2026 (con Convenio y FMV, sin CAF activo) muestra 'Falta CAF'");
afirmar(await page.isVisible("text=Tareas de Notificación de Pago a HCPs"), "se ve la sección de Notificación de Pago");
afirmar(await page.getByText("Falta Notificación de Pago").isVisible(), "Congreso Retina 2026 (con factura sin notificar) muestra 'Falta Notificación de Pago'");
void filaSimposio;

console.log("4. Tareas Pendientes: tus solicitudes con motivo de rechazo");
await page.waitForSelector("text=Tus solicitudes", { timeout: 5000 });
afirmar(await page.isVisible('text=Motivo del rechazo (Dirección Médica): "Falta soporte de la actividad."'), "el CAF rechazado muestra el motivo exacto de su etapa");
afirmar(await page.isVisible("text=Aprobado — sin acciones pendientes de tu parte."), "el Convenio ya Aprobado se marca sin acciones pendientes");

console.log("5. Auditoría de Eventos: checklist de documentos por evento");
await page.click('button:has-text("Auditoría de Eventos")');
await page.waitForSelector("text=Filtra los eventos por rango de fechas", { timeout: 5000 });
await page.waitForSelector("text=Congreso Retina 2026", { timeout: 5000 });
const filaRetina = page.locator("div.rounded-lg.border", { hasText: "Congreso Retina 2026" }).first();
afirmar(await filaRetina.getByText("2 documento(s) faltante(s)").isVisible(), "Congreso Retina 2026 muestra exactamente 2 documentos faltantes (CAF y Notificación de Pago)");
await filaRetina.getByRole("button", { name: "Congreso Retina 2026", exact: false }).click();
await page.waitForSelector("text=Documentos del paquete de cierre", { timeout: 5000 });
afirmar(await page.isVisible("text=Convenio de Pago a HCP"), "el ítem 'Convenio de Pago a HCP' aparece en el checklist expandido");
afirmar(await page.isVisible("text=Facturas"), "el ítem 'Facturas' aparece en el checklist expandido (categoría financiera del Repositorio)");

console.log("6. Historial y Auditoría: línea de tiempo con filtros");
await page.click('button:has-text("Historial y Auditoría")');
await page.waitForSelector("text=Seguimiento cronológico de todos los documentos y aprobaciones", { timeout: 5000 });
afirmar(await page.isVisible("text=Rechazado en la etapa Dirección Médica."), "sin filtros se ve la entrada de rechazo del CAF");
await page.click('button:has-text("Rechazo")');
await page.waitForTimeout(300);
afirmar(await page.isVisible("text=Rechazado en la etapa Dirección Médica."), "al filtrar por acción 'Rechazo' sigue viéndose la entrada del CAF");
afirmar(!(await page.isVisible("text=Congreso Retina 2026").catch(() => false)) || !(await page.getByText("Aprobado.").isVisible().catch(() => false)), "al filtrar por 'Rechazo' ya no se ve la entrada de aprobación del evento");
await page.click('button:has-text("Todas")');

console.log("7. Participación de HCPs/Speakers");
await page.click('button:has-text("Participación de HCPs/Speakers")');
await page.waitForSelector("text=Participación de un Speaker por Período", { timeout: 5000 });
await page.getByLabel("Speaker").click();
await page.getByRole("option", { name: /Julián Mesa/ }).click();
await page.waitForSelector("text=Congreso Retina 2026", { timeout: 5000 });
afirmar(await page.isVisible("text=Ponencia"), "se ve el tipo de servicio del Convenio vinculado");
{
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    page.click('button:has-text("Exportar CSV")'),
  ]);
  const rutaDescarga = await descarga.path();
  const fs = await import("node:fs");
  const contenido = fs.readFileSync(rutaDescarga, "utf8");
  afirmar(contenido.includes("Julián Mesa") && contenido.includes("Congreso Retina 2026"), "el CSV exportado incluye al speaker y el evento");
}

console.log("8. Cambio de sesión: Legal/Compliance ve 'Visor Documental' (Dirección Médica no la tiene en su menú)");
afirmar(!(await page.isVisible('button:has-text("Visor Documental")')), "Dirección Médica no ve 'Visor Documental' en su menú (soloRoles: legal_compliance)");
await page.click('button:has-text("Dra. Marcela Duque")');
await page.click('[role="menuitem"]:has-text("Cerrar sesión")');
await page.waitForSelector("text=Iniciar sesión", { timeout: 5000 });
await page.fill("#email", "legal.prueba@bausch.com");
await page.fill("#password", "clave-legal-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Tablero", { timeout: 5000 });

console.log("9. Visor Documental: listado plano de archivos + búsqueda");
await page.click('button:has-text("Visor Documental")');
await page.waitForSelector("text=Visor Documental", { timeout: 5000 });
await page.waitForSelector("text=rethus-julian-mesa.pdf", { timeout: 5000 });
afirmar(await page.isVisible("text=rethus-julian-mesa.pdf"), "el soporte RETHUS del speaker aparece en el listado");
afirmar(await page.isVisible("text=carta-invitacion-retina.pdf"), "la carta de invitación del evento aparece en el listado");
afirmar(await page.isVisible("text=factura-099.pdf"), "la factura del Repositorio del Evento aparece en el listado");
await page.fill('input[placeholder*="Buscar por nombre"]', "rethus");
await page.waitForTimeout(300);
afirmar(await page.isVisible("text=rethus-julian-mesa.pdf"), "el filtro de búsqueda deja ver el archivo que coincide");
afirmar(!(await page.isVisible("text=carta-invitacion-retina.pdf")), "el filtro de búsqueda oculta los archivos que no coinciden");

afirmar(erroresConsola.length === 0, `sin errores de consola/página (encontrados: ${erroresConsola.length})`);
if (erroresConsola.length > 0) console.error(erroresConsola.join("\n"));

await browser.close();

if (fallas > 0) {
  console.error(`\n${fallas} verificación(es) fallaron.`);
  process.exit(1);
}
console.log("\nTodas las verificaciones pasaron.");
