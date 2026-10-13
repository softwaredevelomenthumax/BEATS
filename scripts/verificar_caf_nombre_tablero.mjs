#!/usr/bin/env node
// Octubre 2026 — el CAF de un speaker EXTERNO en un evento con speakers internos debe verse en el Tablero con el nombre del
// speaker externo del CAF, no con el del primer speaker interno del evento (campo histórico nombre_speaker_participacion).
import { chromium } from "playwright";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { interceptarSupabase, resolverCaptchaLogin } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ahora = new Date();
const dia = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const fixtures = {
  usuariosAuth: [{ id: "auth-admin", email: "admin.prueba@bausch.com", password: "clave-segura-123" }],
  tablas: {
    usuarios: [{ id: "usr-admin", nombre: "Admin Prueba", cargo: "Dirección Médica", email: "admin.prueba@bausch.com", rol: "medica", iniciales: "AP", firma_id: null, debe_cambiar_password: false, auth_user_id: "auth-admin", telefono: "", paginas_permitidas: [], empresas_grupo: ["Bausch + Lomb"], paises_operacion: ["Colombia"], es_administrador: true, administrador_alcance_limitado: false }],
    catalogo_valores: [{ id: "cat-1", catalogo: "monedas", valor: "COP", orden: 1 }, { id: "cat-2", catalogo: "empresasGrupo", valor: "Bausch + Lomb", orden: 1 }],
    speakers: [{ id: "spk-ext", nombre_completo: "Catalina Alzate", especialidad: "Oftalmología", numero_documento: "CC-1", email: "c@x.co" }],
    solicitudes_evento: [{ id: "evt-1", estado: "Aprobado", creado_por_id: "usr-admin", creado_en: ahora.toISOString(), nombre_evento: "Simposio Mixto 2026", empresa_grupo: "Bausch + Lomb", pais: "Colombia", ciudad: "Bogotá", moneda: "COP", fecha_inicio_evento: dia(5), fecha_fin_evento: dia(5), numero_asistentes: 40, modalidad_sesiones: "Única sesión", participacion_academica: true, quien_dicta_actividad: "Ambos", nombre_speaker_participacion: "Juan Diego Casas — Colombia" }],
    evento_aprobaciones: [], sesiones_evento: [], evento_muestras_planeadas: [], eventos_codigos_acceso: [],
    evento_speakers_participacion: [
      { id: "esp-1", evento_id: "evt-1", orden: 1, speaker_id: null, nombre_speaker: "Juan Diego Casas — Colombia", monto_honorarios: 0, monto_inscripcion: 0, factura_modalidad: "", tipo_speaker: "interno" },
      { id: "esp-2", evento_id: "evt-1", orden: 2, speaker_id: "spk-ext", nombre_speaker: "Catalina Alzate", monto_honorarios: 3000000, monto_inscripcion: 0, factura_modalidad: "Factura única", tipo_speaker: "externo" },
    ],
    evento_speaker_presupuestos: [], fmv_checklists: [], fmv_aprobaciones: [], convenios_pago_hcp: [], convenio_aprobaciones: [],
    convenios_hcp: [], convenio_hcp_aprobaciones: [], convenio_hcp_ajustes_clausula: [],
    cafs: [{ id: "caf-1", estado: "Pendiente", creado_por_id: "usr-admin", creado_en: ahora.toISOString(), evento_origen_id: "evt-1", speaker_id: "spk-ext", contraparte_nombre: "Catalina Alzate", compania_nombre: "Bausch + Lomb", monto: 3000000, moneda: "COP" }],
    caf_aprobaciones: [], notificaciones_pago_hcp: [], campos_personalizados_definicion: [], etiquetas_campo: [], evento_repositorio_archivos: [], evento_registros_financieros: [],
    archivos_adjuntos: [], notificaciones: [], paises_region: [{ id: "pr-1", pais: "Colombia" }],
  },
  rpc: {},
};
let fallas = 0;
const afirmar = (c, m) => { if (c) console.log(`  OK  ${m}`); else { console.error(`  X   ${m}`); fallas++; } };
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
await interceptarSupabase(page, fixtures);
await page.goto(pathToFileURL(resolve(raiz, "bundle.html")).href);
await page.fill("#email", "admin.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Simposio Mixto 2026", { timeout: 10000 });
const cuerpo = await page.locator("body").innerText();
afirmar(/Catalina Alzate/.test(cuerpo), "el CAF aparece en el Tablero con el nombre de la speaker externa (Catalina Alzate)");
afirmar(!/Juan Diego Casas/.test(cuerpo), "ya no aparece con el nombre del speaker interno");
afirmar(/Oftalmología/.test(cuerpo), "y se acompaña de su especialidad");
afirmar(errores.length === 0, "sin errores de página");
await browser.close();
if (fallas) process.exit(1);
console.log("Todas las verificaciones pasaron.");
