#!/usr/bin/env node
// Fase 2 — verifica las notificaciones IN-APP (tabla `notificaciones`, la
// campanita del encabezado) que se pueden corregir sin depender de un
// proveedor de correo real (ver docs/notificaciones-reales-correo.md, que
// explica por qué el envío real de correo queda fuera de este script):
//
//  - E1: se notifica al primer aprobador apenas un documento se reenvía tras
//    un rechazo (la cadena se reinicia desde la etapa 1 con un UPDATE que
//    este arnés sí puede simular). Al ENVIAR un documento por primera vez
//    (crear/enviarCaf), ese primer aviso ya NO lo crea el frontend — desde
//    que se descubrió que la base de datos real tiene, de antes del
//    incidente, un trigger AFTER INSERT (`fn_notificar_primera_etapa_caf`,
//    activo hoy contra Supabase) que hace exactamente lo mismo apenas se
//    inserta la primera fila de `caf_aprobaciones`, la llamada explícita del
//    frontend se quitó para no duplicar el aviso (y el correo que cascada de
//    él). Este arnés de fixtures no ejecuta triggers reales de Postgres, así
//    que el paso 2 de abajo verifica la ausencia deliberada de esa llamada,
//    no su presencia.
//  - E1: se notifica al creador cuando la cadena queda aprobada en su
//    totalidad (antes no existía ningún aviso de "proceso completado") — la
//    base de datos real también envía un correo DIRECTO en ese momento
//    (`fn_notificar_aprobacion_caf`), así que esta notificación in-app ahora
//    se crea con `enviar_email: false` para no duplicar ese correo (ver
//    db/notificaciones-enviar-email.sql) — la campanita sigue funcionando
//    igual, solo cambia si dispara un segundo correo redundante.
//  - E20: Finanzas y Gerencia General SÍ reciben su notificación de tarea
//    pendiente cuando les toca actuar — se verifica iniciando sesión
//    directamente como un usuario con cada uno de esos roles (no un
//    administrador), exactamente el escenario que reportó el hallazgo.
//  - E24: cuando dos personas comparten el mismo rol aprobador, la que NO
//    actuó recibe un aviso de que la otra ya resolvió la etapa (para no
//    duplicar la revisión) — se verifica tanto en aprobación como en
//    rechazo.
//
// Usa un solo CAF (cadena de 4 etapas: Dirección Médica, Legal/Compliance,
// Finanzas, Gerencia General — el caso exacto de E20) para el camino feliz,
// y un segundo CAF para el camino de rechazo + reenvío. Todo contra
// fixtures locales — nunca contra Supabase real.
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { interceptarSupabase, crearHandlerResolverAprobacion,
  resolverCaptchaLogin, } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rutaBundle = resolve(raiz, "bundle.html");

function usuario(id, nombre, rol, extra = {}) {
  return {
    id,
    nombre,
    cargo: "Colaborador de prueba",
    email: `${id}@bausch.com`,
    rol,
    iniciales: nombre.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase(),
    firma_id: null,
    debe_cambiar_password: false,
    auth_user_id: `auth-${id}`,
    telefono: "",
    paginas_permitidas: [],
    empresas_grupo: ["Bausch + Lomb"],
    paises_operacion: ["Colombia"],
    es_administrador: false,
    administrador_alcance_limitado: false,
    ...extra,
  };
}

const USUARIOS = [
  usuario("usr-creador", "Laura Gómez", "medica"),
  usuario("usr-medica-a", "Ana Medica", "medica"),
  usuario("usr-medica-b", "Bruno Medica", "medica"),
  usuario("usr-legal", "Carla Legal", "legal_compliance"),
  usuario("usr-finanzas", "Diego Finanzas", "finanzas"),
  usuario("usr-gerencia", "Elena Gerencia", "gerencia_general"),
];

const fixtures = {
  usuariosAuth: USUARIOS.map((u) => ({ id: u.auth_user_id, email: u.email, password: "clave-segura-123" })),
  tablas: {
    usuarios: USUARIOS,
    v_documentos: [
      {
        id: "evt-1",
        tipo_doc: "evento",
        estado: "Aprobado",
        creado_por_id: "usr-creador",
        creado_en: new Date().toISOString(),
        nombre: "Simposio de Retina 2026",
      },
    ],
    catalogo_valores: [
      { id: "cat-1", catalogo: "tiposDocumento", valor: "Contrato de Patrocinio", orden: 1 },
      { id: "cat-2", catalogo: "monedas", valor: "COP", orden: 1 },
      { id: "cat-3", catalogo: "empresasGrupo", valor: "Bausch + Lomb", orden: 1 },
    ],
    cafs: [],
    caf_aprobaciones: [],
    campos_personalizados_definicion: [],
    etiquetas_campo: [],
    notificaciones: [],
  },
  rpc: {
    resolver_aprobacion_caf: crearHandlerResolverAprobacion("cafs", "caf_aprobaciones", "caf"),
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

function notificacionesPara(usuarioId, filtro = () => true) {
  return fixtures.tablas.notificaciones.filter((n) => n.para_usuario_id === usuarioId).filter(filtro);
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const erroresConsola = [];
page.on("pageerror", (e) => erroresConsola.push(String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error" && !/Failed to load resource/.test(msg.text())) erroresConsola.push(msg.text());
});

await interceptarSupabase(page, fixtures);

async function iniciarSesion(email) {
  await page.fill("#email", email);
  await page.fill("#password", "clave-segura-123");
  await resolverCaptchaLogin(page);
  await page.click('button[type="submit"]');
  await page.waitForSelector("text=Tablero", { timeout: 5000 });
}

async function cerrarSesion(nombreMostrado) {
  await page.click(`button:has-text("${nombreMostrado}")`);
  await page.click('[role="menuitem"]:has-text("Cerrar sesión")');
  await page.waitForSelector("text=Iniciar sesión", { timeout: 5000 });
}

async function verNotificacionesEnPantalla() {
  await page.getByRole("button", { name: "Notificaciones", exact: true }).click();
}

console.log("1. Login como creadora (medica) y crear + enviar el CAF");
await page.goto(pathToFileURL(rutaBundle).href);
await iniciarSesion("usr-creador@bausch.com");
await page.click('button:has-text("CAF")');
await page.waitForSelector("text=Nueva CAF", { timeout: 5000 });
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
await page.getByLabel("Código del documento *").fill("CAF-2026-777");
await page.click('button:has-text("Enviar a aprobación")');
await page.waitForSelector("text=Clínica Oftalmológica S.A.S.", { timeout: 5000 });

console.log("2. E1 — el envío ya no notifica al primer aprobador desde el frontend (lo hace el trigger de base de datos, no simulado aquí)");
afirmar(
  !notificacionesPara("usr-medica-a").some((n) => n.tipo === "tarea_pendiente" && n.mensaje.includes("CAF-2026-777")),
  "Ana Medica NO recibe 'tarea_pendiente' del frontend al enviarse el CAF — en producción la crea fn_notificar_primera_etapa_caf() (trigger AFTER INSERT sobre caf_aprobaciones), no el cliente",
);
afirmar(
  !notificacionesPara("usr-medica-b").some((n) => n.tipo === "tarea_pendiente"),
  "Bruno Medica tampoco la recibe del frontend, por el mismo motivo",
);
await cerrarSesion("Laura Gómez");

console.log("3. Bruno (medica) aprueba la etapa 1 — E24: Ana (su par) queda avisada de que ya se resolvió");
await iniciarSesion("usr-medica-b@bausch.com");
await page.click("text=Clínica Oftalmológica S.A.S.");
await page.waitForSelector("text=Cadena de aprobación", { timeout: 5000 });
await page.getByPlaceholder("Comentario (obligatorio para rechazar)").fill("Aprobado — Dirección Médica");
await page.click('button:has-text("Aprobar")');
await page.waitForTimeout(300);
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

afirmar(
  notificacionesPara("usr-medica-a").some((n) => n.tipo === "etapa_resuelta" && /ya aprobó/.test(n.mensaje) && n.mensaje.includes("Bruno Medica")),
  "E24: Ana Medica recibe el aviso de que Bruno ya aprobó la etapa — no necesita revisarla también",
);
afirmar(
  !notificacionesPara("usr-medica-b").some((n) => n.tipo === "etapa_resuelta" && /ya aprobó/.test(n.mensaje)),
  "E24: el propio actor (Bruno) no se autonotifica de su propia acción",
);
afirmar(
  notificacionesPara("usr-creador").some((n) => n.tipo === "etapa_resuelta" && n.mensaje.includes("avanzó")),
  "el creador recibe el aviso de que el CAF avanzó una etapa (no es la última)",
);
afirmar(
  notificacionesPara("usr-legal").some((n) => n.tipo === "tarea_pendiente"),
  "Legal/Compliance queda notificado como siguiente etapa",
);
await cerrarSesion("Bruno Medica");

console.log("4. E24 visible en pantalla: Ana entra y ve el aviso de que ya no tiene nada que hacer");
await iniciarSesion("usr-medica-a@bausch.com");
await verNotificacionesEnPantalla();
afirmar(await page.isVisible("text=Bruno Medica ya aprobó"), "el mensaje de Bruno ya aprobó se ve en la campanita de Ana");
await page.keyboard.press("Escape");
await cerrarSesion("Ana Medica");

console.log("5. Legal/Compliance aprueba la etapa 2");
await iniciarSesion("usr-legal@bausch.com");
await page.click("text=Clínica Oftalmológica S.A.S.");
await page.waitForSelector("text=Cadena de aprobación", { timeout: 5000 });
await page.getByPlaceholder("Comentario (obligatorio para rechazar)").fill("Aprobado — Legal/Compliance");
await page.click('button:has-text("Aprobar")');
await page.waitForTimeout(300);
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
afirmar(
  notificacionesPara("usr-finanzas").some((n) => n.tipo === "tarea_pendiente"),
  "Finanzas queda notificado como siguiente etapa",
);
await cerrarSesion("Carla Legal");

console.log("6. E20 — Finanzas (no administrador) SÍ ve su notificación y aprueba su etapa");
await iniciarSesion("usr-finanzas@bausch.com");
await verNotificacionesEnPantalla();
afirmar(await page.isVisible("text=está esperando tu aprobación"), "Finanzas ve en su propia campanita el aviso de tarea pendiente (hallazgo E20)");
await page.keyboard.press("Escape");
await page.click("text=Clínica Oftalmológica S.A.S.");
await page.waitForSelector("text=Cadena de aprobación", { timeout: 5000 });
afirmar(await page.isVisible('button:has-text("Aprobar")'), "Finanzas puede efectivamente actuar sobre su etapa (no solo verla)");
await page.getByPlaceholder("Comentario (obligatorio para rechazar)").fill("Aprobado — Finanzas");
await page.click('button:has-text("Aprobar")');
await page.waitForTimeout(300);
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
afirmar(
  notificacionesPara("usr-gerencia").some((n) => n.tipo === "tarea_pendiente"),
  "Gerencia General queda notificada como siguiente (y última) etapa",
);
await cerrarSesion("Diego Finanzas");

console.log("7. E20 — Gerencia General (no administrador) SÍ ve su notificación y aprueba la etapa final");
await iniciarSesion("usr-gerencia@bausch.com");
await verNotificacionesEnPantalla();
afirmar(await page.isVisible("text=está esperando tu aprobación"), "Gerencia General ve en su propia campanita el aviso de tarea pendiente (hallazgo E20)");
await page.keyboard.press("Escape");
await page.click("text=Clínica Oftalmológica S.A.S.");
await page.waitForSelector("text=Cadena de aprobación", { timeout: 5000 });
await page.getByPlaceholder("Comentario (obligatorio para rechazar)").fill("Aprobado — Gerencia General");
await page.click('button:has-text("Aprobar")');
await page.waitForTimeout(300);
const quedoAprobado = await page
  .waitForSelector('[role="dialog"] >> text=Aprobado', { timeout: 3000 })
  .then(() => true)
  .catch(() => false);
afirmar(quedoAprobado, "el CAF queda Aprobado tras la última etapa");
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

console.log("8. E1 — el creador queda notificado de que el CAF quedó aprobado EN SU TOTALIDAD (antes no existía este aviso)");
const notifAprobacionTotal = notificacionesPara("usr-creador").find(
  (n) => n.tipo === "etapa_resuelta" && n.mensaje.includes("aprobado en su totalidad"),
);
afirmar(
  Boolean(notifAprobacionTotal),
  "el creador recibe un aviso distinto ('aprobado en su totalidad') al de las etapas intermedias, cuando la cadena termina",
);
afirmar(
  notifAprobacionTotal?.enviar_email === false,
  "esa notificación se crea con enviar_email:false — el correo de 'aprobado en su totalidad' ya lo manda directo el trigger de aprobación de la base de datos, este insert no debe duplicarlo",
);
const notifEtapaIntermedia = notificacionesPara("usr-creador").find(
  (n) => n.tipo === "etapa_resuelta" && n.mensaje.includes("avanzó"),
);
afirmar(
  notifEtapaIntermedia?.enviar_email !== false,
  "en cambio, el aviso de una etapa intermedia (no final) sí deja enviar_email en su valor por defecto (true) — ahí no hay ningún correo directo con el que duplicarse",
);
await cerrarSesion("Elena Gerencia");

console.log("9. Login como creadora para ver en pantalla el aviso de aprobación total");
await iniciarSesion("usr-creador@bausch.com");
await verNotificacionesEnPantalla();
afirmar(await page.isVisible("text=fue aprobado en su totalidad"), "Laura (creadora) ve el aviso de aprobación total en su propia campanita");
await page.keyboard.press("Escape");

console.log("10. Segundo CAF: camino de rechazo + reenvío (E24 en rechazo, E1 en el reenvío)");
await page.click('button:has-text("CAF")');
await page.waitForSelector("text=Nueva CAF", { timeout: 5000 });
await page.getByLabel("Evento de origen").click();
await page.getByRole("option", { name: "Simposio de Retina 2026" }).click();
await page.getByLabel("Nombre del solicitante *").fill("Laura Gómez");
await page.getByLabel("Teléfono del solicitante *").fill("3001234567");
await page.getByLabel("Nombre del director de área *").fill("Carlos Ruiz");
await page.getByLabel("Cargo del director de área *").fill("Director Comercial");
await page.getByLabel("Nombre de la contraparte *").fill("Óptica Central S.A.S.");
await page.getByLabel("Dirección de la contraparte *").fill("Carrera 15 # 80-20, Bogotá");
await page.getByLabel("Teléfono de la contraparte *").fill("6017654321");
await page.getByLabel("Correo de la contraparte *").fill("contacto@opticacentral.com");
await page.getByLabel("Contacto de la contraparte *").fill("Sr. Iván Cárdenas");
await page.getByLabel("Tipo de contrato").click();
await page.getByRole("option", { name: "Contrato de Patrocinio" }).click();
await page.getByLabel("Objeto del contrato *").fill("Patrocinio de rueda de prensa.");
await page.getByLabel("Due diligence *").fill("Verificado sin hallazgos.");
await page.getByLabel("Monto *").fill("2000000");
await page.getByLabel("Moneda").click();
await page.getByRole("option", { name: "COP", exact: true }).click();
await page.getByLabel("Compañía").click();
await page.getByRole("option", { name: "Bausch + Lomb" }).click();
await page.getByLabel("Código del documento *").fill("CAF-2026-778");
await page.click('button:has-text("Enviar a aprobación")');
await page.waitForSelector("text=Óptica Central S.A.S.", { timeout: 5000 });
afirmar(
  !notificacionesPara("usr-medica-a", (n) => n.mensaje.includes("CAF-2026-778")).some((n) => n.tipo === "tarea_pendiente"),
  "el segundo CAF tampoco notifica de entrada al primer aprobador desde el frontend (mismo motivo que el paso 2)",
);
await cerrarSesion("Laura Gómez");

console.log("11. Bruno rechaza la etapa 1 — E24: Ana también queda avisada del rechazo");
await iniciarSesion("usr-medica-b@bausch.com");
await page.click("text=Óptica Central S.A.S.");
await page.waitForSelector("text=Cadena de aprobación", { timeout: 5000 });
await page.getByPlaceholder("Comentario (obligatorio para rechazar)").fill("Falta el due diligence de la contraparte.");
await page.click('button:has-text("Rechazar")');
await page.waitForTimeout(300);
afirmar(await page.isVisible('[role="dialog"] >> text=Rechazado'), "el CAF queda Rechazado en la primera etapa");
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
afirmar(
  notificacionesPara("usr-creador", (n) => n.mensaje.includes("CAF-2026-778")).some((n) => n.tipo === "rechazo"),
  "la creadora recibe la notificación de rechazo",
);
afirmar(
  notificacionesPara("usr-medica-a", (n) => n.mensaje.includes("CAF-2026-778")).some((n) => n.tipo === "etapa_resuelta" && /ya rechazó/.test(n.mensaje)),
  "E24: Ana también queda avisada de que Bruno ya rechazó la etapa (no solo en aprobación)",
);
await cerrarSesion("Bruno Medica");

console.log("12. Editar y reenviar — E1: SÍ se notifica al primer aprobador (aquí el frontend es el único emisor posible)");
await iniciarSesion("usr-creador@bausch.com");
await page.click("text=Óptica Central S.A.S.");
await page.waitForSelector("text=Cadena de aprobación", { timeout: 5000 });
await page.click('button:has-text("Editar y reenviar")');
await page.waitForSelector("text=Nueva CAF", { timeout: 5000 }).catch(() => {});
await page.getByLabel("Due diligence *").fill("Verificado con hallazgos menores, ya subsanados.");
await page.click('button:has-text("Guardar y reenviar")');
await page.waitForTimeout(300);
afirmar(await page.isVisible("text=Pendiente"), "tras editar y reenviar, el CAF vuelve a Pendiente");
// A diferencia del envío original (paso 10, ahora sin aviso del frontend),
// editarYReenviarCaf reinicia la cadena con un UPDATE — que
// fn_notificar_primera_etapa_caf() (trigger AFTER INSERT) nunca ve — así
// que aquí la llamada explícita de notificarTareaPendiente() se mantuvo a
// propósito: es el único aviso posible para este caso. Debe haber
// exactamente 1 (no 0, y no más de 1 — nada más la generó).
const notificacionesPrevias = notificacionesPara("usr-medica-a", (n) => n.mensaje.includes("CAF-2026-778") && n.tipo === "tarea_pendiente").length;
afirmar(notificacionesPrevias === 1, `el primer aprobador queda notificado exactamente una vez tras el reenvío (encontradas: ${notificacionesPrevias})`);

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
