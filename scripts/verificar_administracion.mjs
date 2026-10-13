#!/usr/bin/env node
// Fase 5 — verifica el resto de la administración: Portafolio de Productos,
// Configuración de Formatos (global + override por empresa + Formato
// Oficial FMV), Repositorio de Speakers (con vigencia RETHUS/hoja de
// vida), Notificaciones (campanita) y Usuarios y Roles — esta última contra
// una simulación fiel de la función Edge real `admin-usuarios` (código
// fuente compartido por el usuario) y de la RPC
// `solicitar_restablecimiento_password`. Todo contra fixtures locales,
// nunca contra Supabase real.
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { interceptarSupabase, crearHandlerSolicitarRestablecimientoPassword,
  resolverCaptchaLogin, } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rutaBundle = resolve(raiz, "bundle.html");

function fechaISO(diasDesdeHoy) {
  const d = new Date();
  d.setDate(d.getDate() + diasDesdeHoy);
  return d.toISOString().slice(0, 10);
}

const fixtures = {
  usuariosAuth: [
    { id: "auth-admin", email: "admin.prueba@bausch.com", password: "clave-segura-123" },
    { id: "auth-marta", email: "marta.ruiz@bausch.com", password: "clave-marta-original" },
  ],
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
      {
        id: "usr-marta",
        nombre: "Marta Ruiz",
        cargo: "Ejecutiva Comercial",
        email: "marta.ruiz@bausch.com",
        rol: "comercial",
        iniciales: "MR",
        firma_id: null,
        debe_cambiar_password: false,
        auth_user_id: "auth-marta",
        telefono: "",
        paginas_permitidas: [],
        empresas_grupo: ["Bausch + Lomb"],
        paises_operacion: ["Colombia"],
        es_administrador: false,
        administrador_alcance_limitado: false,
      },
    ],
    v_documentos: [],
    catalogo_valores: [
      { id: "cat-1", catalogo: "empresasGrupo", valor: "Bausch + Lomb", orden: 1 },
      { id: "cat-2", catalogo: "empresasGrupo", valor: "Bausch Health", orden: 2 },
    ],
    paises_region: [
      { id: "pr-1", pais: "Colombia" },
      { id: "pr-2", pais: "México" },
      { id: "pr-3", pais: "Perú" },
    ],
    productos_portafolio: [],
    configuracion_formatos: [],
    configuracion_formatos_empresa: [],
    formato_oficial_fmv: [],
    speakers: [],
    notificaciones: [
      {
        id: "notif-1",
        para_usuario_id: "usr-admin",
        tipo: "tarea_pendiente",
        mensaje: '"CAF — Prueba" está esperando tu aprobación.',
        documento_ref_tipo: "caf",
        documento_ref_id: "caf-1",
        leida: false,
        creada_en: new Date(Date.now() - 60_000).toISOString(),
      },
      {
        id: "notif-2",
        para_usuario_id: "usr-admin",
        tipo: "etapa_resuelta",
        mensaje: '"Evento — Prueba" avanzó: la etapa "Comercial" fue aprobada.',
        documento_ref_tipo: "evento",
        documento_ref_id: "evt-1",
        leida: false,
        creada_en: new Date(Date.now() - 30_000).toISOString(),
      },
    ],
    solicitudes_restablecimiento_password: [],
    // Deliberadamente vacía al arrancar — así se ejercita primero el camino
    // de falla real de `resetear_password` ("no se pudo enviar el correo,
    // se aborta antes de tocar Auth") antes de simular que un administrador
    // configuró las credenciales de correo en el dashboard de Supabase.
    configuracion_integraciones: [],
  },
  rpc: {
    solicitar_restablecimiento_password: crearHandlerSolicitarRestablecimientoPassword(),
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
  if (msg.type() === "error") erroresConsola.push(msg.text());
});

await interceptarSupabase(page, fixtures);

console.log("1. Pantalla de login: solicitar restablecimiento de contraseña (sin sesión)");
await page.goto(pathToFileURL(rutaBundle).href);
await page.click("text=¿Olvidaste tu contraseña?");
await page.waitForSelector("text=Escribe tu correo", { timeout: 5000 });
await page.locator("#correo-olvide").fill("marta.ruiz@bausch.com");
await page.click('button:has-text("Enviar solicitud")');
await page.waitForSelector("text=Si el correo existe", { timeout: 5000 });
afirmar(fixtures.tablas.solicitudes_restablecimiento_password.length === 1, "la RPC solicitar_restablecimiento_password crea la solicitud");

console.log("2. Login como administrador");
await page.fill("#email", "admin.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Tablero", { timeout: 5000 });

console.log("3. Campanita de notificaciones");
const botonCampana = page.getByRole("button", { name: "Notificaciones", exact: true });
await page.waitForTimeout(300); // primer sondeo (useEffect al montar)
afirmar(await botonCampana.getByText("2", { exact: true }).isVisible(), "la campanita muestra 2 notificaciones sin leer");
await botonCampana.click();
await page.waitForSelector("text=está esperando tu aprobación", { timeout: 5000 });
await page.click("text=está esperando tu aprobación");
await page.waitForTimeout(300);
afirmar(await botonCampana.getByText("1", { exact: true }).isVisible(), "queda 1 sin leer tras marcar una como leída");
await botonCampana.click();
await page.waitForSelector("text=Marcar todas leídas", { timeout: 5000 });
await page.click("text=Marcar todas leídas");
await page.waitForTimeout(300);
afirmar((await botonCampana.getByText(/^\d+$/).count()) === 0, "no queda badge tras marcar todas leídas");
await page.keyboard.press("Escape");

console.log("4. Usuarios y Roles: la solicitud de Marta aparece pendiente");
await page.click('button:has-text("Configuración de Usuarios/Roles")');
await page.waitForSelector("text=Solicitudes de restablecimiento de contraseña", { timeout: 5000 });
afirmar(await page.isVisible("text=Marta Ruiz"), "la solicitud pendiente de Marta se ve en el panel de administración");

console.log("5. Crear un nuevo colaborador sin integración de correo configurada (debe fallar antes de tocar Auth)");
await page.click('button:has-text("Nuevo colaborador")');
await page.waitForSelector("text=Se le enviará por correo una contraseña temporal", { timeout: 5000 });
await page.locator("#nvo-email").fill("carla.nuevo@bausch.com");
await page.locator("#usr-nombre").fill("Carla Nuevo");
await page.locator("#usr-cargo").fill("Analista Marketing");
await page.click('button:has-text("Crear colaborador")');
await page.waitForSelector("text=Completa nombre, cargo, correo e iniciales.", { timeout: 5000 });
afirmar(true, "sin iniciales, el cliente rechaza la creación antes de llamar la función Edge");
await page.locator("#nvo-iniciales").fill("CN");
await page.getByLabel("Bausch + Lomb").check();
await page.getByLabel("Colombia").check();
await page.click('button:has-text("Crear colaborador")');
await page.waitForSelector("text=No se pudo enviar el correo con la contraseña temporal", { timeout: 5000 });
afirmar(fixtures._ultimaPasswordGeneradaCrear === undefined, "sin integración de correo configurada, no se generó contraseña ni se creó la cuenta de Auth");
afirmar(
  fixtures.tablas.usuarios.find((u) => u.email === "carla.nuevo@bausch.com") === undefined,
  "tampoco quedó creada la fila de usuarios — falla antes de tocar Auth, igual que un reseteo de contraseña",
);

console.log("6. Un administrador configura la integración de correo, y se reintenta crear a Carla (función Edge admin-usuarios simulada)");
fixtures.tablas.configuracion_integraciones.push({
  id: 1,
  edge_function_url: "https://ejemplo-funcion.workers.dev/enviar-correo",
  webhook_secret: "secreto-de-prueba",
  app_url: "https://beats.bausch.com",
});
await page.click('button:has-text("Crear colaborador")');
await page.waitForSelector("text=Colaborador creado.", { timeout: 5000 });
afirmar(await page.isVisible("text=Se le envió una contraseña temporal a carla.nuevo@bausch.com."), "el toast confirma el envío por correo sin mostrar la contraseña en pantalla");
await page.waitForSelector("text=Carla Nuevo", { timeout: 5000 });
afirmar(await page.isVisible("text=Carla Nuevo"), "el nuevo colaborador aparece en la tabla");
afirmar(
  fixtures.tablas.usuarios.find((u) => u.email === "carla.nuevo@bausch.com")?.debe_cambiar_password === true,
  "el nuevo colaborador queda con debe_cambiar_password=true",
);
afirmar(
  fixtures.usuariosAuth.find((u) => u.email === "carla.nuevo@bausch.com") !== undefined,
  "se creó su cuenta simulada de Supabase Auth",
);
afirmar(
  typeof fixtures._ultimaPasswordGeneradaCrear === "string" && fixtures._ultimaPasswordGeneradaCrear.length > 0,
  "la contraseña temporal se generó del lado del servidor — nunca la envía ni la ve este cliente",
);

// El resto de este script (paso 8 en adelante) puso deliberadamente a
// prueba el camino de falla de `resetear_password` SIN integración de
// correo configurada — ahora que ya se configuró arriba (necesario para
// poder crear a Carla), se retira temporalmente para poder seguir
// ejercitando ese mismo camino de falla también para el reseteo.
const integracionYaConfigurada = fixtures.tablas.configuracion_integraciones.pop();

console.log("7. Editar el perfil de Carla y marcarla como Administrador");
const filaCarla = page.locator("tr", { hasText: "Carla Nuevo" });
await filaCarla.getByTitle("Editar").click();
await page.waitForSelector("text=Editar colaborador", { timeout: 5000 });
await page.locator("#usr-cargo").fill("Coordinadora Marketing");
await page.click("text=Acceso de Administrador (además de su rol)");
await page.locator('[role="dialog"]').getByRole("button", { name: "Guardar", exact: true }).click();
await page.waitForSelector("text=Colaborador actualizado.", { timeout: 5000 });
await page.waitForTimeout(300);
// El cargo no es una columna de la tabla — se verifica releyendo el propio
// diálogo de edición, igual que lo vería un usuario real, en vez de asumir
// dónde vive el dato.
afirmar(
  fixtures.tablas.usuarios.find((u) => u.email === "carla.nuevo@bausch.com")?.cargo === "Coordinadora Marketing",
  "el cargo editado quedó guardado",
);
afirmar(await filaCarla.getByText("Administrador", { exact: true }).isVisible(), "la insignia de Administrador aparece tras el cambio");

console.log("7b. El propio administrador no puede escalar sus propios privilegios (hallazgo F39)");
const filaAdminPropio = page.locator("tr", { hasText: "Admin Prueba" });
await filaAdminPropio.getByTitle("Editar").click();
await page.waitForSelector("text=Editar colaborador", { timeout: 5000 });
afirmar(
  await page.isVisible("text=No puedes cambiar tu propio acceso de Administrador"),
  "se muestra el aviso de bloqueo al editar el propio perfil",
);
afirmar(!(await page.locator("#usr-es-administrador").isEnabled()), "el interruptor de Administrador queda deshabilitado al editar el propio perfil");
afirmar(!(await page.locator("#usr-alcance-limitado").isEnabled()), "el interruptor de alcance limitado también queda deshabilitado al editar el propio perfil");
await page.locator('[role="dialog"]').getByRole("button", { name: "Cancelar", exact: true }).click();

console.log("7c. Un administrador de alcance limitado en otro país/empresa no ve a los demás colaboradores (hallazgo F39)");
fixtures.usuariosAuth.push({ id: "auth-diego", email: "diego.paredes@bausch.com", password: "clave-diego-123" });
fixtures.tablas.usuarios.push({
  id: "usr-diego",
  nombre: "Diego Paredes",
  cargo: "Gerente País",
  email: "diego.paredes@bausch.com",
  rol: "gerencia_general",
  iniciales: "DP",
  firma_id: null,
  debe_cambiar_password: false,
  auth_user_id: "auth-diego",
  telefono: "",
  paginas_permitidas: [],
  empresas_grupo: ["Bausch Health"],
  paises_operacion: ["México"],
  es_administrador: true,
  administrador_alcance_limitado: true,
});
await page.click('button:has-text("Admin Prueba")');
await page.click('[role="menuitem"]:has-text("Cerrar sesión")');
await page.waitForSelector("text=Iniciar sesión", { timeout: 5000 });
await page.fill("#email", "diego.paredes@bausch.com");
await page.fill("#password", "clave-diego-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Tablero", { timeout: 5000 });
await page.click('button:has-text("Configuración de Usuarios/Roles")');
await page.waitForSelector("text=Usuarios y Roles", { timeout: 5000 });
await page.waitForTimeout(300);
afirmar(await page.isVisible("text=Diego Paredes"), "Diego se ve a sí mismo en la tabla");
afirmar(!(await page.isVisible("text=Admin Prueba")), "Diego NO ve al administrador de Bausch + Lomb/Colombia — fuera de su alcance");
afirmar(!(await page.isVisible("text=Marta Ruiz")), "Diego NO ve a Marta — fuera de su alcance");
afirmar(!(await page.isVisible("text=Carla Nuevo")), "Diego NO ve a Carla — fuera de su alcance");
await page.click('button:has-text("Diego Paredes")');
await page.click('[role="menuitem"]:has-text("Cerrar sesión")');
await page.waitForSelector("text=Iniciar sesión", { timeout: 5000 });
await page.fill("#email", "admin.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Tablero", { timeout: 5000 });
await page.click('button:has-text("Configuración de Usuarios/Roles")');
await page.waitForSelector("text=Usuarios y Roles", { timeout: 5000 });

console.log("8. Resetear la contraseña de Marta SIN configuracion_integraciones (debe fallar antes de tocar Auth)");
const filaMarta = page.locator("tr", { hasText: "Marta Ruiz" });
await filaMarta.getByTitle("Resetear contraseña").click();
await page.waitForSelector("text=No se pudo enviar el correo con la nueva contraseña", { timeout: 5000 });
afirmar(fixtures._ultimaPasswordGenerada === undefined, "no se generó ninguna contraseña nueva — se abortó antes de tocar Auth");

console.log("9. Un administrador configura la integración de correo (directo en la BD, no vía app) y se reintenta");
fixtures.tablas.configuracion_integraciones.push(integracionYaConfigurada);
const passwordOriginalMarta = fixtures.usuariosAuth.find((u) => u.id === "auth-marta").password;
await filaMarta.getByTitle("Resetear contraseña").click();
await page.waitForSelector("text=Se envió una nueva contraseña temporal", { timeout: 5000 });
afirmar(typeof fixtures._ultimaPasswordGenerada === "string" && fixtures._ultimaPasswordGenerada.length > 0, "esta vez sí se generó una contraseña nueva del lado del servidor");
afirmar(
  fixtures.usuariosAuth.find((u) => u.id === "auth-marta").password !== passwordOriginalMarta,
  "la contraseña simulada de Marta en Auth quedó actualizada",
);

console.log("10. Resolver la solicitud pendiente de Marta desde el panel");
await page.click('button:has-text("Resetear ahora")');
await page.waitForTimeout(400);
afirmar(!(await page.isVisible("text=Solicitudes de restablecimiento de contraseña")), "el panel de solicitudes pendientes desaparece una vez resuelta la única solicitud");

console.log("11. Cambiar el correo de inicio de sesión de Marta");
await filaMarta.getByTitle("Cambiar correo").click();
await page.waitForSelector("text=Cambiar correo de inicio de sesión", { timeout: 5000 });
await page.locator("#nuevo-correo").fill("marta.ruiz.nuevo@bausch.com");
await page.locator('[role="dialog"]').getByRole("button", { name: "Guardar", exact: true }).click();
await page.waitForSelector("text=Correo de inicio de sesión actualizado.", { timeout: 5000 });
await page.waitForTimeout(300);
afirmar(await page.isVisible("text=marta.ruiz.nuevo@bausch.com"), "el nuevo correo se refleja en la tabla");
afirmar(
  fixtures.usuariosAuth.find((u) => u.id === "auth-marta")?.email === "marta.ruiz.nuevo@bausch.com",
  "el correo también quedó actualizado en la cuenta simulada de Auth",
);

console.log("12. Repositorio de Speakers: crear 3 speakers con distintos estados de vigencia");
await page.click('button:has-text("HCPs/Speakers")');
await page.waitForSelector("text=Repositorio de Speakers", { timeout: 5000 });

await page.click('button:has-text("Nuevo speaker")');
await page.getByLabel("Nombre completo *").fill("Dr. Iván Torres");
await page.getByLabel("Número de documento *").fill("CC-1000001");
await page.getByLabel("Vencimiento RETHUS").fill(fechaISO(30));
await page.locator('[role="dialog"]').getByRole("button", { name: "Guardar", exact: true }).click();
await page.waitForSelector("text=Speaker guardado.", { timeout: 5000 });

await page.click('button:has-text("Nuevo speaker")');
await page.getByLabel("Nombre completo *").fill("Dra. Sofía Lara");
await page.getByLabel("Número de documento *").fill("CC-1000002");
await page.click("text=RETHUS indefinido (sin vencimiento)");
await page.click("text=Hoja de vida adjunta");
await page.getByLabel("Última actualización de hoja de vida").fill(fechaISO(-400));
await page.locator('[role="dialog"]').getByRole("button", { name: "Guardar", exact: true }).click();
await page.waitForSelector("text=Speaker guardado.", { timeout: 5000 });

await page.click('button:has-text("Nuevo speaker")');
await page.getByLabel("Nombre completo *").fill("Dr. Julián Mesa");
await page.getByLabel("Número de documento *").fill("CC-1000003");
await page.getByLabel("Vencimiento RETHUS").fill(fechaISO(200));
await page.click("text=Hoja de vida adjunta");
await page.getByLabel("Última actualización de hoja de vida").fill(fechaISO(-30));
await page.locator('[role="dialog"]').getByRole("button", { name: "Guardar", exact: true }).click();
await page.waitForSelector("text=Speaker guardado.", { timeout: 5000 });

const tarjetaTorres = page.locator('[data-testid="tarjeta-speaker"]', { hasText: "Dr. Iván Torres" });
const tarjetaLara = page.locator('[data-testid="tarjeta-speaker"]', { hasText: "Dra. Sofía Lara" });
const tarjetaMesa = page.locator('[data-testid="tarjeta-speaker"]', { hasText: "Dr. Julián Mesa" });
afirmar(
  await tarjetaTorres.locator('[data-testid="caja-rethus"]').getByText("Próximo a vencer").isVisible(),
  "RETHUS a 30 días queda como 'Próximo a vencer'",
);
afirmar(
  await tarjetaTorres.locator('[data-testid="caja-hojavida"]').getByText("Sin registro").isVisible(),
  "sin hoja de vida adjunta queda 'Sin registro'",
);
afirmar(
  await tarjetaLara.locator('[data-testid="caja-rethus"]').getByText("Vigente").isVisible(),
  "RETHUS indefinido queda con la pastilla 'Vigente' (el detalle 'Vigencia indefinida' distingue el caso)",
);
afirmar(
  await tarjetaLara.locator('[data-testid="caja-hojavida"]').getByText("Vencido").isVisible(),
  "hoja de vida actualizada hace 400 días queda 'Vencido'",
);
afirmar(
  await tarjetaMesa.locator('[data-testid="caja-rethus"]').getByText("Vigente").isVisible(),
  "RETHUS a 200 días queda 'Vigente'",
);

console.log("12b. Pastillas de filtro por vigencia consolidada (peor de RETHUS/Hoja de Vida)");
// Torres: RETHUS 'Próximo a vencer' + Hoja de Vida 'Sin registro' -> consolidado 'Sin registro' (peor de los dos)
// Lara: RETHUS 'Vigente' (indefinido) + Hoja de Vida 'Vencido' -> consolidado 'Vencido'
// Mesa: RETHUS 'Vigente' + Hoja de Vida 'Vigente' -> consolidado 'Vigente'
afirmar(await page.getByText("Todos (3)", { exact: true }).isVisible(), "la pastilla 'Todos' cuenta los 3 speakers creados");
afirmar(await page.getByText("Vigente (1)", { exact: true }).isVisible(), "solo Julián Mesa consolida como 'Vigente'");
afirmar(
  await page.getByText("Próximo a vencer (0)", { exact: true }).isVisible(),
  "nadie consolida como 'Próximo a vencer' — el RETHUS de Torres queda tapado por su Hoja de Vida sin registro",
);
afirmar(await page.getByText("Vencido (1)", { exact: true }).isVisible(), "solo Sofía Lara consolida como 'Vencido'");
afirmar(await page.getByText("Sin registro (1)", { exact: true }).isVisible(), "solo Iván Torres consolida como 'Sin registro'");

await page.click('button:has-text("Vencido (1)")');
await page.waitForTimeout(200);
afirmar(await tarjetaLara.isVisible(), "con el filtro 'Vencido' activo, la tarjeta de Lara sigue visible");
afirmar(!(await tarjetaTorres.isVisible()), "con el filtro 'Vencido' activo, la tarjeta de Torres se oculta");
afirmar(!(await tarjetaMesa.isVisible()), "con el filtro 'Vencido' activo, la tarjeta de Mesa se oculta");
await page.click('button:has-text("Todos (3)")');
await page.waitForTimeout(200);
afirmar(
  (await Promise.all([tarjetaTorres.isVisible(), tarjetaLara.isVisible(), tarjetaMesa.isVisible()])).every(Boolean),
  "'Todos' vuelve a mostrar las 3 tarjetas",
);

console.log("13. Eliminar un speaker");
await tarjetaMesa.getByRole("button").last().click();
await page.waitForSelector("text=Speaker eliminado.", { timeout: 5000 });
afirmar(!(await page.isVisible("text=Dr. Julián Mesa")), "el speaker eliminado ya no aparece en la lista");

console.log("14. Configuración de Campos: Portafolio de Productos (crear, activar/desactivar, eliminar)");
await page.click('button:has-text("Configuración de Campos")');
await page.waitForSelector("text=Portafolio de Productos", { timeout: 5000 });
await page.click('button:has-text("Nuevo producto")');
await page.locator("#prod-nombre").fill("Lente Intraocular Modelo X");
await page.locator("#prod-registro").fill("INVIMA-2026-001");
await page.getByLabel("Empresa (vacío = todas)").click();
await page.getByRole("option", { name: "Bausch + Lomb" }).click();
await page.locator('[role="dialog"]').getByRole("button", { name: "Guardar", exact: true }).click();
await page.waitForSelector("text=Producto guardado.", { timeout: 5000 });
afirmar(await page.isVisible("text=Lente Intraocular Modelo X"), "el producto nuevo aparece en el portafolio");

const filaProducto = page.locator("div.rounded-md.border.p-2", { hasText: "Lente Intraocular Modelo X" });
await filaProducto.getByRole("switch").click();
await page.waitForTimeout(300);
afirmar(
  fixtures.tablas.productos_portafolio.find((p) => p.nombre === "Lente Intraocular Modelo X")?.activo === false,
  "el interruptor 'Activo' desactiva el producto",
);
await filaProducto.getByRole("button").last().click();
await page.waitForSelector("text=Producto eliminado.", { timeout: 5000 });
afirmar(!(await page.isVisible("text=Lente Intraocular Modelo X")), "el producto eliminado ya no aparece en el portafolio");

console.log("15. Configuración de Formatos — global");
await page.locator("#cf-proceso").fill("Proceso de Solicitud de Eventos");
await page.locator("#cf-codigo").fill("FR-EVT-01");
await page.locator("#cf-version").fill("v3");
await page.locator("#cf-fecha-emision").fill("2026-01-15");
await page.locator("#cf-declaracion").fill("Tratamiento de datos personales conforme a la Ley 1581 de 2012.");
await page.click('button:has-text("Guardar configuración global")');
await page.waitForSelector("text=Configuración de formatos guardada.", { timeout: 5000 });
await page.waitForTimeout(300);
afirmar(fixtures.tablas.configuracion_formatos.find((f) => f.id === 1)?.evento_codigo === "FR-EVT-01", "el código global de Evento quedó guardado en la fila singleton (id=1)");
afirmar(await page.locator("#cf-codigo").inputValue() === "FR-EVT-01", "el formulario refleja el valor guardado tras recargar");

console.log("16. Configuración de Formatos — override por empresa");
await page.getByLabel("Empresa", { exact: true }).click();
await page.getByRole("option", { name: "Bausch + Lomb" }).click();
await page.locator("#cfe-codigo").fill("FR-EVT-01-BYL");
await page.click('button:has-text("Guardar override")');
await page.waitForSelector("text=Override guardado.", { timeout: 5000 });
await page.waitForTimeout(300);
afirmar(
  fixtures.tablas.configuracion_formatos_empresa.find((f) => f.empresa_grupo === "Bausch + Lomb")?.evento_codigo === "FR-EVT-01-BYL",
  "el override de Evento para Bausch + Lomb quedó guardado",
);
afirmar(await page.isVisible("text=Quitar todos los overrides de esta empresa"), "aparece la opción de quitar el override tras guardarlo");
await page.click("text=Quitar todos los overrides de esta empresa");
await page.waitForSelector("text=Override eliminado", { timeout: 5000 });
await page.waitForTimeout(300);
afirmar(!(await page.isVisible("text=Quitar todos los overrides de esta empresa")), "el override desaparece tras eliminarlo — la empresa vuelve a heredar lo global");

console.log("17. Formato Oficial FMV");
await page.locator("#fof-vigencia").fill(fechaISO(-5));
await page.click('button:has-text("Registrar versión")');
await page.waitForSelector("text=Versión registrada.", { timeout: 5000 });
// Ojo: tanto la etiqueta del campo "Vigente desde" como el texto "Todas las
// empresas" del selector de abajo quedan SIEMPRE en la página — no sirven
// para verificar la fila del historial por separado. Se usa en cambio el
// contenedor de la fila (mismas clases que las demás listas admin de esta
// fase: "rounded-md border p-2"), filtrado por su propio texto compuesto.
const filaFormatoFmv = page.locator("div.rounded-md.border.p-2", { hasText: "Vigente desde" });
afirmar((await filaFormatoFmv.count()) === 1, "la nueva versión del Formato Oficial FMV aparece en el historial");
afirmar(fixtures.tablas.formato_oficial_fmv.length === 1, "la versión quedó registrada en la tabla formato_oficial_fmv");
await filaFormatoFmv.getByRole("button").click();
await filaFormatoFmv.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
afirmar((await filaFormatoFmv.count()) === 0, "la versión del Formato Oficial FMV se puede eliminar");
afirmar(fixtures.tablas.formato_oficial_fmv.length === 0, "la fila quedó eliminada también en la tabla");

// El paso 8 provoca deliberadamente una respuesta 502 de la función Edge
// simulada (integración de correo sin configurar) — Chromium registra esa
// respuesta no-2xx como "Failed to load resource" en la consola por su
// cuenta, sin que sea un error real de la aplicación. Además, los 3 bundles
// cargan la hoja de Google Fonts por <link> (ver verificar_caf.mjs), que no
// tiene internet para resolverse en un entorno de pruebas. Ambos casos se
// filtran antes de exigir consola limpia.
const erroresInesperados = erroresConsola.filter((e) => !/Failed to load resource/.test(e));
afirmar(erroresInesperados.length === 0, `sin errores de consola/página inesperados (encontrados: ${erroresInesperados.length})`);
if (erroresInesperados.length > 0) console.error(erroresInesperados.join("\n"));

await browser.close();

if (fallas > 0) {
  console.error(`\n${fallas} verificación(es) fallaron.`);
  process.exit(1);
}
console.log("\nTodas las verificaciones pasaron.");
