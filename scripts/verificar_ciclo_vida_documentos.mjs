#!/usr/bin/env node
// Fase de ciclo de vida de documentos (septiembre 2026) — verifica, contra
// CAF como caso de referencia (mismo criterio que Fase 1: CAF es el
// documento "fácil" donde se prueban primero los mecanismos transversales),
// el flujo completo pedido explícitamente por el usuario:
//   1. Reabrir un Borrador para edición las veces que haga falta (guardar
//      borrador repetible) antes de enviarlo a aprobación.
//   2. "Devolver" un documento Pendiente sin ninguna firma todavía —
//      suspende el flujo y lo deja editable en estado "Devuelto".
//   3. Una vez hay al menos una firma, "Devolver" deja de estar disponible
//      y solo queda "Solicitar enmienda" (justificada) para poder corregir
//      y reenviar.
//   4. La regla de los 7 días: si el evento vinculado está a menos de 7
//      días (o ya inició), ninguna corrección se permite y se muestra un
//      mensaje explícito.
//   5. Todo lo anterior queda trazado en Historial y Auditoría.
// Todo contra fixtures locales e interceptación de red — nunca contra
// Supabase real, mismo patrón que el resto de scripts/verificar_*.mjs.
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { interceptarSupabase, crearHandlerResolverAprobacion, resolverCaptchaLogin } from "./lib/fixtures.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rutaBundle = resolve(raiz, "bundle.html");

function fechaISO(diasDesdeHoy) {
  const d = new Date();
  d.setDate(d.getDate() + diasDesdeHoy);
  return d.toISOString().slice(0, 10);
}

const ahora = new Date().toISOString();

function cafBase(id, contraparteNombre, codigoDocumento, estado, eventoOrigenId) {
  return {
    id,
    estado,
    creado_por_id: "usr-admin",
    creado_en: ahora,
    evento_origen_id: eventoOrigenId,
    tipo_contrato: "Contrato de Patrocinio",
    solicitante_nombre: "Laura Gómez",
    solicitante_telefono: "3001234567",
    director_area_nombre: "Carlos Ruiz",
    director_area_cargo: "Director Comercial",
    contraparte_nombre: contraparteNombre,
    contraparte_direccion: "Calle 100 # 10-20, Bogotá",
    due_diligence: "Verificado sin hallazgos.",
    termino_contrato_inicio: fechaISO(30),
    termino_contrato_fin: fechaISO(395),
    contraparte_telefono: "6011234567",
    contraparte_correo: "contacto@clinica.com",
    contraparte_contacto: "Dra. Ana Torres",
    objeto_contrato: "Patrocinio de actividad médica.",
    comentarios: "",
    monto: 2000000,
    moneda: "COP",
    codigo_cobro_cuenta: "",
    codigo_cobro_depto: "",
    codigo_cobro_prod: "",
    codigo_cobro_proyecto: "",
    compania_nombre: "Bausch + Lomb",
    codigo_documento: codigoDocumento,
  };
}

function cadenaCaf(cafId, prefijo) {
  return [
    { id: `${prefijo}-1`, caf_id: cafId, orden: 1, etiqueta: "Dirección Médica", rol_requerido: "medica", estado: "pendiente", pendiente_desde: ahora },
    { id: `${prefijo}-2`, caf_id: cafId, orden: 2, etiqueta: "Legal/Compliance", rol_requerido: "legal_compliance", estado: "pendiente", pendiente_desde: ahora },
    { id: `${prefijo}-3`, caf_id: cafId, orden: 3, etiqueta: "Finanzas", rol_requerido: "finanzas", estado: "pendiente", pendiente_desde: ahora },
    { id: `${prefijo}-4`, caf_id: cafId, orden: 4, etiqueta: "Gerencia General", rol_requerido: "gerencia_general", estado: "pendiente", pendiente_desde: ahora },
  ];
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
    catalogo_valores: [
      { id: "cat-1", catalogo: "tiposDocumento", valor: "Contrato de Patrocinio", orden: 1 },
      { id: "cat-3", catalogo: "monedas", valor: "COP", orden: 1 },
      { id: "cat-5", catalogo: "empresasGrupo", valor: "Bausch + Lomb", orden: 1 },
    ],
    solicitudes_evento: [
      {
        id: "evt-lejano",
        estado: "Aprobado",
        creado_por_id: "usr-admin",
        creado_en: fechaISO(-60),
        nombre_evento: "Congreso de Oftalmología 2027",
        nombre_solicitante: "Admin Prueba",
        pais: "Colombia",
        ciudad: "Bogotá",
        fecha_inicio_evento: fechaISO(120),
        fecha_fin_evento: fechaISO(120),
        participacion_academica: false,
      },
      {
        id: "evt-cercano",
        estado: "Aprobado",
        creado_por_id: "usr-admin",
        creado_en: fechaISO(-30),
        nombre_evento: "Simposio de Catarata 2026",
        nombre_solicitante: "Admin Prueba",
        pais: "Colombia",
        ciudad: "Bogotá",
        fecha_inicio_evento: fechaISO(3),
        fecha_fin_evento: fechaISO(3),
        participacion_academica: false,
      },
    ],
    cafs: [
      // Vinculado a un evento lejano (120 días) para que la regla de los 7
      // días nunca bloquee este flujo — la regla en sí se prueba aparte con
      // "caf-bloqueada" (más abajo). CAF requiere "Evento de origen" para
      // poder enviarse a aprobación (`requerido("eventoOrigenId")` en
      // FormularioCAF), así que no puede quedar null.
      cafBase("caf-1", "Óptica Andina S.A.S.", "CAF-2026-900", "Borrador", "evt-lejano"),
      cafBase("caf-bloqueada", "Fundación Visión Clara", "CAF-2026-901", "Borrador", "evt-cercano"),
    ],
    caf_aprobaciones: [...cadenaCaf("caf-1", "cfa-1"), ...cadenaCaf("caf-bloqueada", "cfa-b")],
    campos_personalizados_definicion: [],
    etiquetas_campo: [],
    v_documentos: [],
    notificaciones: [],
    auditoria: [],
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

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const erroresConsola = [];
page.on("pageerror", (e) => erroresConsola.push(String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error" && !/Failed to load resource/.test(msg.text())) erroresConsola.push(msg.text());
});

await interceptarSupabase(page, fixtures);

console.log("1. Login y abrir el CAF en Borrador");
await page.goto(pathToFileURL(rutaBundle).href);
await page.fill("#email", "admin.prueba@bausch.com");
await page.fill("#password", "clave-segura-123");
await resolverCaptchaLogin(page);
await page.click('button[type="submit"]');
await page.waitForSelector("text=Tablero", { timeout: 5000 });
await page.click("text=Óptica Andina S.A.S.");
await page.waitForSelector("text=Cadena de aprobación", { timeout: 5000 });
afirmar(await page.isVisible('[role="dialog"] >> text=Borrador'), "el CAF abre en estado Borrador");

console.log("2. Reabrir el borrador para edición, guardarlo sin enviarlo (repetible)");
await page.click('button:has-text("Editar borrador")');
await page.waitForSelector("text=Puedes guardar como borrador las veces que quieras", { timeout: 5000 });
await page.getByLabel("Nombre del solicitante *").fill("Laura Gómez Actualizada");
await page.click('button:has-text("Guardar borrador")');
await page.waitForTimeout(300);
afirmar(await page.isVisible('[role="dialog"] >> text=Borrador'), "tras 'Guardar borrador' el CAF sigue en Borrador");

console.log("3. Reabrir de nuevo el mismo borrador y esta vez enviarlo a aprobación");
await page.click('button:has-text("Editar borrador")');
await page.waitForSelector("text=Puedes guardar como borrador las veces que quieras", { timeout: 5000 });
await page.click('button:has-text("Enviar a aprobación")');
await page.waitForTimeout(300);
afirmar(await page.isVisible('[role="dialog"] >> text=Pendiente'), "al 'Enviar a aprobación' el CAF pasa a Pendiente");

console.log("4. Sin firmas todavía: 'Devolver' disponible, 'Solicitar enmienda' no");
afirmar(await page.isVisible('button:has-text("Devolver")'), "el botón 'Devolver' está disponible (ninguna etapa firmada)");
afirmar(!(await page.isVisible('button:has-text("Solicitar enmienda")')), "'Solicitar enmienda' NO está disponible todavía (no hay firmas)");

console.log("5. Devolver el CAF: suspende el flujo y lo deja en 'Devuelto'");
await page.click('button:has-text("Devolver")');
await page.getByPlaceholder("Motivo de la devolución").fill("Falta ajustar el monto antes de continuar.");
await page.click('button:has-text("Confirmar devolución")');
await page.waitForTimeout(300);
afirmar(await page.isVisible('[role="dialog"] >> text=Devuelto'), "el CAF queda en estado Devuelto tras devolverlo");

console.log("6. Un 'Devuelto' se edita igual que un Borrador, y se puede reenviar de nuevo");
afirmar(await page.isVisible('button:has-text("Editar borrador")'), "'Editar borrador' también aplica sobre un documento Devuelto");
await page.click('button:has-text("Editar borrador")');
await page.waitForSelector("text=Puedes guardar como borrador las veces que quieras", { timeout: 5000 });
await page.click('button:has-text("Enviar a aprobación")');
await page.waitForTimeout(300);
afirmar(await page.isVisible('[role="dialog"] >> text=Pendiente'), "tras reenviar desde 'Devuelto' el CAF vuelve a Pendiente");

console.log("7. Aprobar la primera etapa (ya hay una firma)");
await page.getByPlaceholder("Comentario (obligatorio para rechazar)").fill("Aprobado — Dirección Médica");
await page.click('button:has-text("Aprobar")');
await page.waitForTimeout(300);

console.log("8. Con al menos una firma: 'Devolver' desaparece, solo queda 'Solicitar enmienda'");
afirmar(!(await page.isVisible('button:has-text("Devolver")')), "'Devolver' ya NO está disponible (ya hay una etapa firmada)");
afirmar(await page.isVisible('button:has-text("Solicitar enmienda")'), "'Solicitar enmienda' está disponible una vez hay una firma");

console.log("9. Solicitar la enmienda, corregir y reenviar");
await page.click('button:has-text("Solicitar enmienda")');
await page.getByPlaceholder("Justificación de la enmienda").fill("El monto acordado con la contraparte cambió tras la última reunión.");
await page.click('button:has-text("Continuar")');
await page.waitForSelector("text=Editando dentro de una ventana de enmienda", { timeout: 5000 });
await page.getByLabel("Monto *").fill("2500000");
await page.click('button:has-text("Guardar y reenviar")');
await page.waitForTimeout(300);
afirmar(await page.isVisible('[role="dialog"] >> text=Pendiente'), "tras guardar la enmienda el CAF vuelve a Pendiente");
afirmar(await page.isVisible("text=Te toca a ti"), "la cadena de aprobación se reinicia por completo (Dirección Médica vuelve a estar pendiente)");

console.log("10. Historial y Auditoría: los 3 movimientos nuevos quedan trazados");
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
await page.click('button:has-text("Historial y Auditoría")');
await page.waitForSelector("text=Seguimiento cronológico de todos los documentos y aprobaciones", { timeout: 5000 });
afirmar(await page.isVisible("text=Borrador actualizado."), "el historial muestra la entrada de 'Borrador actualizado'");
afirmar(await page.isVisible("text=Falta ajustar el monto antes de continuar."), "el historial muestra el motivo exacto de la devolución");
afirmar(await page.isVisible("text=El monto acordado con la contraparte cambió tras la última reunión."), "el historial muestra la justificación exacta de la enmienda");
await page.click('button:has-text("Devuelto")');
await page.waitForTimeout(200);
afirmar(await page.isVisible("text=Falta ajustar el monto antes de continuar."), "el filtro por acción 'Devuelto' aísla esa entrada");
await page.click('button:has-text("Todas")');
await page.waitForTimeout(200);
await page.click('button:has-text("Enmienda solicitada")');
await page.waitForTimeout(200);
afirmar(await page.isVisible("text=El monto acordado con la contraparte cambió tras la última reunión."), "el filtro por acción 'Enmienda solicitada' aísla esa entrada");
await page.click('button:has-text("Todas")');

console.log("11. Regla de los 7 días: documento vinculado a un evento a 3 días no se puede corregir");
await page.click('button:has-text("Tablero")');
await page.waitForSelector("text=Fundación Visión Clara", { timeout: 5000 });
await page.click("text=Fundación Visión Clara");
await page.waitForSelector("text=Cadena de aprobación", { timeout: 5000 });
afirmar(
  await page.isVisible("text=/solo falta.{0,2}3 días para el inicio del evento vinculado/"),
  "se muestra el mensaje explícito de bloqueo por proximidad del evento (3 días)",
);
afirmar(
  await page.isVisible("text=/política exige al menos 7 días de anticipación/"),
  "el mensaje explica la regla de los 7 días mínimos de anticipación",
);
afirmar(!(await page.isVisible('button:has-text("Editar borrador")')), "'Editar borrador' NO está disponible cuando el evento está a menos de 7 días");

afirmar(erroresConsola.length === 0, `sin errores de consola/página (encontrados: ${erroresConsola.length})`);
if (erroresConsola.length > 0) console.error(erroresConsola.join("\n"));

await browser.close();

if (fallas > 0) {
  console.error(`\n${fallas} verificación(es) fallaron.`);
  process.exit(1);
}
console.log("\nTodas las verificaciones pasaron.");
