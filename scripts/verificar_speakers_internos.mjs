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

console.log("2. Participación académica = Sí, Speaker interno, 2 speakers (única sesión)");
afirmar(await page.locator('text=Transporte, hospedaje y alimentos').count() > 0, "antes de elegir speakers, el bloque general de T/H/A existe");
const seccion = page.locator('[data-state]:has(#evento-detalle-participacion)').first();
await page.locator('button:has-text("Sí")').first().waitFor();
// El interruptor "Sí" de la sección de participación académica
await page.evaluate(() => {
  const cab = [...document.querySelectorAll("h3,button,div")].find((e) => e.textContent?.trim().startsWith("Participación académica"));
  cab?.scrollIntoView();
});
const toggle = page.locator('xpath=//*[normalize-space(text())="Participación académica"]/ancestor::*[self::h3 or self::div][1]//button[normalize-space()="Sí"]').first();
await toggle.click();
await page.getByLabel("Detalle *").first().waitFor();
await page.locator("#evento-quien-dicta").click();
await page.getByRole("option", { name: "Speaker interno" }).click();
await page.locator("#evento-numero-speakers").fill("2");
await page.waitForTimeout(300);
afirmar(await page.getByText("Speakers internos — identificación y presupuesto").isVisible(), "aparece la sección 'Speakers internos'");
afirmar(await page.locator("#evento-speaker-0").isVisible() && await page.locator("#evento-speaker-1").isVisible(), "hay una casilla de nombre por cada speaker interno");
afirmar((await page.getByLabel("Honorarios del speaker *").count()) === 0, "no se piden honorarios a un speaker interno");
afirmar((await page.getByText("Modalidad de factura").count()) === 0, "no se pide modalidad de factura a un speaker interno");
afirmar((await page.getByText("Valor del transporte *").count()) === 2, "cada speaker interno tiene su bloque de transporte (2)");
afirmar((await page.getByText("Costo de noche por persona *").count()) === 2, "cada speaker interno tiene su bloque de hospedaje (2)");
afirmar((await page.getByText("Monto autorizado de alimentos por día *").count()) === 2, "cada speaker interno tiene su bloque de alimentos (2)");
afirmar((await page.locator("text=Aplica a la única sesión del evento.").count()) === 0, "el bloque general de T/H/A ya no se muestra (se captura por speaker)");

console.log("3. El condensado suma el paquete de los dos speakers internos");
await page.locator("#evento-speaker-0").fill("Ana Interna");
await page.locator("#evento-speaker-1").fill("Beto Interno");
const valores = page.getByLabel("Valor del transporte *");
await valores.nth(0).fill("100");
await valores.nth(1).fill("250");
await page.waitForTimeout(300);
const transp = await page.getByLabel("Transporte", { exact: true }).inputValue().catch(() => "");
afirmar(/^\$?350([.,]00)?$/.test(transp), `transporte condensado = 100 + 250 = 350 — vio: "${transp}"`);

console.log("4. Cambiar a Speaker externo reinicia las casillas y pide honorarios");
await page.locator("#evento-quien-dicta").click();
await page.getByRole("option", { name: "Speaker externo" }).click();
await page.locator("#evento-numero-speakers").fill("1");
await page.waitForTimeout(300);
afirmar(await page.getByText("Speakers externos — identificación, cuota y presupuesto").isVisible(), "aparece la sección 'Speakers externos'");
afirmar((await page.getByLabel("Honorarios del speaker *").count()) === 1, "el speaker externo sí tiene honorarios");
afirmar((await page.getByText("Valor del transporte *").count()) === 1, "y también su bloque de transporte");

await browser.close();
if (erroresConsola.length) { console.error("Errores de consola:", erroresConsola.slice(0, 5)); fallas++; }
if (fallas) { console.error(`\n${fallas} verificación(es) fallaron.`); process.exit(1); }
console.log("\nTodas las verificaciones pasaron.");
