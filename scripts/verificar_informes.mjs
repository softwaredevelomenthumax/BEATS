#!/usr/bin/env node
// Fase 6 — verifica Informes y Auditoría: Informe por Evento (impresión),
// HCPs Impactados, Informe de Pagos (CSV), Informe de Speakers (CSV),
// Ejecución de Eventos (agregados), Panel en Vivo, Eventos en Vivo y
// Auditoría (log con filtros). Todo contra fixtures locales — las tablas
// de "ejecución en sitio" (registros_participacion/muestras_entregadas) se
// siembran directo como filas, ya que su escritura real (RPC pública) se
// reconstruye recién en la Fase 7; esta fase solo las LEE.
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { interceptarSupabase,
  resolverCaptchaLogin, } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rutaBundle = resolve(raiz, "bundle.html");

function fechaISO(diasDesdeHoy) {
  const d = new Date();
  d.setDate(d.getDate() + diasDesdeHoy);
  return d.toISOString().slice(0, 10);
}

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
    catalogo_valores: [{ id: "cat-1", catalogo: "empresasGrupo", valor: "Bausch + Lomb", orden: 1 }],
    productos_portafolio: [
      { id: "prod-1", nombre: "Lente Intraocular Modelo X", registro_sanitario: "INVIMA-01", activo: true, orden: 1, empresa_grupo: "Bausch + Lomb" },
      { id: "prod-2", nombre: "Solución Oftálmica Y", registro_sanitario: "INVIMA-02", activo: true, orden: 2, empresa_grupo: "Bausch + Lomb" },
    ],
    solicitudes_evento: [
      {
        id: "evt-1",
        estado: "Aprobado",
        creado_por_id: "usr-admin",
        creado_en: new Date().toISOString(),
        nombre_evento: "Congreso Retina 2026",
        empresa_grupo: "Bausch + Lomb",
        pais: "Colombia",
        ciudad: "Bogotá",
        direccion: "Calle 100 # 15-20",
        fecha_inicio_evento: fechaISO(-2),
        fecha_fin_evento: fechaISO(-1),
        numero_asistentes: 50,
        entrega_muestras_medicas: true,
      },
    ],
    evento_aprobaciones: [],
    sesiones_evento: [],
    evento_muestras_planeadas: [],
    eventos_codigos_acceso: [
      { id: "cod-1", evento_id: "evt-1", codigo: "ABC123", activo: true, creado_por_id: "usr-admin", creado_en: new Date().toISOString(), expira_en: null },
    ],
    registros_participacion: [
      { id: "reg-1", evento_id: "evt-1", sesion_ejecucion_id: "ses-1", nombres: "Carlos", apellidos: "Pérez", cedula: "CC-1001", tipo_documento: "Cédula", profesion: "Médico", profesion_detalle: "", especialidad: "Oftalmología", especialidad_otra: "", celular: "3001234567", email: "carlos.perez@example.com", autoriza_imagen_voz: true, autoriza_datos_personales: true, firma_id: null, declaracion_texto_mostrado: "Declaro...", interes_visita_medica: "Sí", direccion: "", ciudad: "Bogotá", tipo_participacion: "Asistente", capturado_en: new Date().toISOString(), pais: "Colombia" },
      { id: "reg-2", evento_id: "evt-1", sesion_ejecucion_id: "ses-1", nombres: "María", apellidos: "López", cedula: "CC-1002", tipo_documento: "Cédula", profesion: "Médico", profesion_detalle: "", especialidad: "Cardiología", especialidad_otra: "", celular: "3007654321", email: "maria.lopez@example.com", autoriza_imagen_voz: true, autoriza_datos_personales: true, firma_id: null, declaracion_texto_mostrado: "Declaro...", interes_visita_medica: "No", direccion: "", ciudad: "Bogotá", tipo_participacion: "Speaker", capturado_en: new Date().toISOString(), pais: "Colombia" },
      { id: "reg-3", evento_id: "evt-1", sesion_ejecucion_id: "ses-1", nombres: "Carlos", apellidos: "Pérez", cedula: "CC-1001", tipo_documento: "Cédula", profesion: "Médico", profesion_detalle: "", especialidad: "Oftalmología", especialidad_otra: "", celular: "3001234567", email: "carlos.perez@example.com", autoriza_imagen_voz: true, autoriza_datos_personales: true, firma_id: null, declaracion_texto_mostrado: "Declaro...", interes_visita_medica: "Sí", direccion: "", ciudad: "Bogotá", tipo_participacion: "Asistente", capturado_en: new Date().toISOString(), pais: "Colombia" },
    ],
    muestras_entregadas: [
      { id: "mue-1", registro_participacion_id: "reg-1", evento_id: "evt-1", producto_id: "prod-1", cantidad: 3, firma_confirmacion_id: null, capturado_en: new Date().toISOString() },
      { id: "mue-2", registro_participacion_id: "reg-2", evento_id: "evt-1", producto_id: "prod-2", cantidad: 5, firma_confirmacion_id: null, capturado_en: new Date().toISOString() },
      { id: "mue-3", registro_participacion_id: "reg-3", evento_id: "evt-1", producto_id: "prod-1", cantidad: 2, firma_confirmacion_id: null, capturado_en: new Date().toISOString() },
    ],
    convenios_pago_hcp: [
      {
        id: "cnv-1",
        estado: "Aprobado",
        creado_por_id: "usr-admin",
        creado_en: new Date().toISOString(),
        hcp_nombre_completo: "Dr. Pedro Ruiz",
        hcp_cedula_licencia: "CC-2001",
        nombre_evento_servicio: "Consultoría en manejo de glaucoma",
        fecha_inicio_actividad: fechaISO(-10),
        contraprestacion_hcp: 500000,
        moneda_contraprestacion: "COP",
      },
    ],
    convenio_aprobaciones: [],
    // Entrega 32: el Informe de Pagos concilia también Convenio HCP y registros financieros del Expediente.
    convenios_hcp: [], convenio_hcp_aprobaciones: [], convenio_hcp_ajustes_clausula: [], evento_registros_financieros: [], evento_speakers_participacion: [],
    notificaciones_pago_hcp: [
      {
        id: "npg-1",
        estado: "Completado",
        creado_por_id: "usr-admin",
        creado_en: new Date().toISOString(),
        nombre_profesional_salud: "Dra. Ana Gómez",
        cedula_licencia_profesional: "CC-2002",
        productos: "Lente Intraocular Modelo X",
        numero_factura: "FAC-2026-099",
        fecha_factura: fechaISO(-5),
        valor_factura: 300000,
        moneda_factura: "COP",
        empresa_grupo: "Bausch + Lomb",
      },
    ],
    speakers: [
      { id: "spk-1", nombre_completo: "Dr. Julián Mesa", numero_documento: "CC-3001", especialidad: "Retina", direccion: "", pais: "Colombia", ciudad: "Bogotá", telefono: "", email: "", licencia_rethus: "RTH-01", fecha_vencimiento_rethus: fechaISO(200), rethus_indefinido: false, archivo_rethus_id: null, hoja_vida_adjunta: false, fecha_actualizacion_hoja_vida: null, archivo_hoja_vida_id: null, archivo_identidad_id: null, notas: "", creado_por_id: "usr-admin", actualizado_en: new Date().toISOString() },
    ],
    auditoria: [
      { id: "aud-1", documento_id: "evt-1", tipo_doc: "evento", documento_nombre: "Congreso Retina 2026", actor_id: "usr-admin", accion: "creacion", detalle: "Creado.", ocurrido_en: fechaISO(-10) + "T09:00:00Z", empresa_grupo: "Bausch + Lomb", pais: "Colombia" },
      { id: "aud-2", documento_id: "evt-1", tipo_doc: "evento", documento_nombre: "Congreso Retina 2026", actor_id: "usr-admin", accion: "aprobacion_final", detalle: "Aprobado.", ocurrido_en: fechaISO(-3) + "T09:00:00Z", empresa_grupo: "Bausch + Lomb", pais: "Colombia" },
      { id: "aud-3", documento_id: "cnv-1", tipo_doc: "convenio", documento_nombre: "Convenio — Dr. Pedro Ruiz", actor_id: "usr-admin", accion: "rechazo", detalle: "Rechazado en la etapa X.", ocurrido_en: fechaISO(-8) + "T09:00:00Z", empresa_grupo: null, pais: null },
    ],
    v_documentos: [],
    notificaciones: [],
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

console.log("1. Login como administrador");
await page.goto(pathToFileURL(rutaBundle).href);
await page.fill("#email", "admin.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Tablero", { timeout: 5000 });

console.log("2. Informe por Evento (entrega 21: expediente HTML + resumen imprimible)");
await page.click('button:has-text("Informe por Evento")');
await page.waitForSelector("text=Elige un evento aprobado", { timeout: 5000 });
await page.getByTestId("ipe-evento").click();
await page.getByRole("option", { name: /Congreso Retina 2026/ }).click();
await page.waitForSelector('[data-testid="panel-informe-evento"]', { timeout: 5000 });
await page.waitForSelector('[data-testid="informe-evento-kpis"]', { timeout: 8000 });
afirmar(await page.getByTestId("descargar-expediente-html").isVisible(), "ofrece descargar el expediente completo en HTML");
await page.getByTestId("ver-resumen-evento").click();
await page.waitForSelector('[data-testid="resumen-evento-contenido"]', { timeout: 5000 });
afirmar(await page.isVisible("text=Lente Intraocular Modelo X"), "el resumen desglosa las muestras por producto");
afirmar(await page.isVisible("text=Total del evento"), "el resumen incluye el total de asistentes");
await page.keyboard.press("Escape");

console.log("3. HCPs Impactados");
await page.click('button:has-text("Asistentes Impactados")');
await page.waitForSelector("text=Profesionales de la salud que registraron participación", { timeout: 5000 });
const filaCarlos = page.locator("tr", { hasText: "Carlos Pérez" });
await filaCarlos.waitFor({ timeout: 5000 }).catch(() => {});
afirmar(await filaCarlos.isVisible(), "Carlos Pérez aparece como HCP impactado (2 registros agrupados por cédula)");
afirmar(await filaCarlos.getByText("2", { exact: true }).isVisible(), "sus 2 registros de participación se agrupan en un solo total");
afirmar(await page.locator("tr", { hasText: "María López" }).isVisible(), "María López también aparece como HCP impactada");

console.log("4. Informe de Pagos + exportación CSV");
await page.click('button:has-text("Informe de Pagos")');
await page.click('[data-testid="pagos-tab-documentos"]');
await page.waitForSelector("text=Speakers con Convenio o Notificación de Pago ya", { timeout: 5000 });
await page.waitForSelector("text=Dr. Pedro Ruiz", { timeout: 8000 }).catch(() => {});
afirmar(await page.isVisible("text=Dr. Pedro Ruiz"), "el Convenio de Pago Aprobado aparece en el informe");
afirmar(await page.isVisible("text=Dra. Ana Gómez"), "la Notificación de Pago Completada aparece en el informe");
{
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    page.click('button:has-text("Pagos aprobados (CSV)")'),
  ]);
  const rutaDescarga = await descarga.path();
  const fs = await import("node:fs");
  const contenido = fs.readFileSync(rutaDescarga, "utf8");
  afirmar(contenido.includes("Dr. Pedro Ruiz") && contenido.includes("500000"), "el CSV de pagos exportado incluye el convenio con su monto");
  afirmar(contenido.includes("Dra. Ana Gómez") && contenido.includes("FAC-2026-099"), "el CSV de pagos exportado incluye la notificación con su número de factura");
}

console.log("5. Informe de Speakers + exportación CSV");
await page.click('button:has-text("Informe de Speakers")');
await page.waitForSelector("text=Repositorio completo de speakers", { timeout: 5000 });
// Esperar el NOMBRE del speaker (no solo el encabezado estático de la
// página) evita una carrera: el encabezado se pinta antes de que resuelva
// la carga asíncrona de speakers, y bajo más carga del sistema (p.ej.
// corriendo dentro de la regresión completa, con varios navegadores ya
// abiertos) esa carga puede tardar más que un `waitForTimeout` fijo.
await page.waitForSelector("text=Dr. Julián Mesa", { timeout: 5000 });
afirmar(await page.isVisible("text=Dr. Julián Mesa"), "el speaker aparece en el informe");
afirmar(await page.isVisible("text=Vigente"), "su vigencia RETHUS calculada se muestra correctamente");
{
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    page.click('button:has-text("Exportar CSV")'),
  ]);
  const rutaDescarga = await descarga.path();
  const fs = await import("node:fs");
  const contenido = fs.readFileSync(rutaDescarga, "utf8");
  afirmar(contenido.includes("Julián Mesa") && contenido.includes("Vigente"), "el CSV de speakers exportado incluye la vigencia calculada");
}

console.log("6. Ejecución de Eventos (agregados)");
await page.click('button:has-text("Ejecución de Eventos")');
await page.waitForSelector("text=Totales de participación y muestras entregadas", { timeout: 5000 });
const filaEjecucion = page.locator("tr", { hasText: "Congreso Retina 2026" });
await filaEjecucion.waitFor({ timeout: 8000 }).catch(() => {});
afirmar(await filaEjecucion.getByText("3", { exact: true }).isVisible(), "el total de participantes agregado del evento es 3");
afirmar(await filaEjecucion.getByText("10", { exact: true }).isVisible(), "el total de muestras entregadas agregado del evento es 10 (3+5+2)");

console.log("7. Panel en Vivo");
await page.click('button:has-text("Panel en Vivo")');
await page.waitForSelector("text=Conteos de ejecución en sitio", { timeout: 5000 });
await page.waitForSelector("text=Congreso Retina 2026", { timeout: 5000 });
await page.waitForTimeout(500);
afirmar(await page.isVisible("text=Total registrados"), "el Panel en Vivo muestra la tarjeta de total registrados");
// Entrega 31: el Panel en Vivo se rediseñó como tablero; el total tiene su propio data-testid.
afirmar((await page.getByTestId("panel-vivo-total").textContent())?.trim() === "3", "el Panel en Vivo muestra 3 participantes en vivo");

console.log("8. Eventos en Vivo (agrupado por país)");
await page.click('button:has-text("Eventos en Vivo")');
await page.waitForSelector("text=agrupados por país", { timeout: 5000 });
await page.waitForSelector("text=Congreso Retina 2026", { timeout: 8000 }).catch(() => {});
afirmar(await page.isVisible("text=Colombia"), "Colombia aparece como país con eventos activos");
afirmar(await page.isVisible("text=Congreso Retina 2026"), "el evento activo aparece dentro de la tarjeta de su país");

console.log("9. Historial y Auditoría: línea de tiempo con filtro por Acción");
// Fase 6: "Auditoría" (id de página `auditoria`, mal cableada antes de esta
// fase) fue reemplazada por dos pantallas reales del bundle original:
// "Auditoría de Eventos" (checklist de documentos faltantes por evento,
// cubierta en scripts/verificar_tareas_documentos_auditoria.mjs) e
// "Historial y Auditoría" (esta línea de tiempo cronológica, id `historial`).
await page.click('button:has-text("Historial y Auditoría")');
await page.waitForSelector("text=Seguimiento cronológico de todos los documentos y aprobaciones", { timeout: 5000 });
afirmar(await page.isVisible("text=Creado."), "sin filtros se ve la entrada de creación del evento");
afirmar(await page.isVisible("text=Aprobado."), "sin filtros se ve la entrada de aprobación final del evento");
afirmar(await page.isVisible("text=Rechazado en la etapa X."), "sin filtros se ve la entrada de rechazo del convenio");
await page.click('button:has-text("Rechazo")');
await page.waitForTimeout(300);
afirmar(await page.isVisible("text=Rechazado en la etapa X."), "al filtrar por acción 'Rechazo' sigue viéndose la entrada del convenio");
afirmar(!(await page.isVisible("text=Creado.")), "al filtrar por 'Rechazo' ya no se ve la entrada de creación");
afirmar(!(await page.isVisible("text=Aprobado.")), "al filtrar por 'Rechazo' ya no se ve la entrada de aprobación final");
await page.click('button:has-text("Todas")');
await page.waitForTimeout(300);
afirmar((await page.locator("ol > li").count()) === 3, "al volver a 'Todas' se ven las 3 entradas de auditoría sembradas");

afirmar(erroresConsola.length === 0, `sin errores de consola/página (encontrados: ${erroresConsola.length})`);
if (erroresConsola.length > 0) console.error(erroresConsola.join("\n"));

await browser.close();

if (fallas > 0) {
  console.error(`\n${fallas} verificación(es) fallaron.`);
  process.exit(1);
}
console.log("\nTodas las verificaciones pasaron.");
