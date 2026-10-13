#!/usr/bin/env node
// Octubre 2026 — Solicitud de Evento: con participación académica, tanto un
// speaker INTERNO como uno EXTERNO tienen casillas por speaker, con sus
// sesiones y su transporte/hospedaje/alimentos por sesión; solo el externo
// suma cuota, honorarios y modalidad de factura. El condensado suma el
// paquete de todos los speakers.
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
    evento_speakers_participacion: [],
    evento_speaker_presupuestos: [],
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
const afirmar = (c, m) => { if (c) console.log(`  OK  ${m}`); else { console.error(`  X   ${m}`); fallas++; } };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const erroresConsola = [];
page.on("pageerror", (e) => erroresConsola.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) erroresConsola.push(m.text()); });
await interceptarSupabase(page, fixtures);

console.log("1. Login y formulario");
await page.goto(pathToFileURL(rutaBundle).href);
await page.fill("#email", "admin.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Tablero", { timeout: 8000 });
await page.click('button:has-text("Solicitud de Evento")');
await page.waitForSelector("text=Nueva Solicitud de Evento", { timeout: 5000 });
console.log("2. Casilla de Valor participación en el presupuesto condensado");
const total = page.getByTestId("evento-total-condensado");
await page.locator('xpath=//label[contains(.,"¿Aplica costo de participación?")]/following-sibling::*//button[normalize-space()="Sí"]').first().click();
const valorPart = page.getByText("Valor participación *").locator("xpath=ancestor::*[.//input][1]").locator("input").first();
await valorPart.fill("500000");
await page.waitForTimeout(300);
afirmar((await page.locator("#evento-incluir-valor-participacion").count()) === 0, "ya no existe la casilla «Incluir el Valor participación…»");
afirmar(!(await page.locator("main").innerText()).includes("sumarlo al total"), "no queda el texto «sumarlo al total»");
const campo = page.getByTestId("condensado-valor-participacion").locator("input").first();
await page.waitForTimeout(300);
afirmar(/500[.,]000/.test(await campo.inputValue()), "el campo «Valor participación» del condensado se autocarga con 500.000");
afirmar(/500[.,]000/.test(await total.innerText()) && !/1[.,]000[.,]000/.test(await total.innerText()), "el total suma 500.000 una sola vez");
await valorPart.fill("800000");
await page.waitForTimeout(300);
afirmar(/800[.,]000/.test(await campo.inputValue()) && /800[.,]000/.test(await total.innerText()), "si cambia el valor, el campo y el total se actualizan (800.000)");
await browser.close();
if (erroresConsola.length) { console.error("Errores de consola:", erroresConsola.slice(0, 5)); fallas++; }
if (fallas) { console.error(`\n${fallas} verificación(es) fallaron.`); process.exit(1); }
console.log("\nTodas las verificaciones pasaron.");
