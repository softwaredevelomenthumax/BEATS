// =============================================================================
// admin-usuarios — función Edge completa y autocontenida.
//
// REEMPLAZO COMPLETO, no un fragmento. Se escribe desde cero porque el
// archivo que el usuario reportó como "el código real que saqué de
// Supabase" es idéntico a `docs/admin-usuarios-crear_usuario.propuesta.ts`
// (un fragmento de ESTE MISMO EQUIPO, pensado para pegarse dentro de una
// función más grande, sin `Deno.serve(...)`, sin manejo de CORS y sin las
// acciones `resetear_password`/`actualizar_email`). Si eso es en efecto todo
// el archivo desplegado hoy, la función nunca pudo responder ninguna
// petición — lo que explica exactamente el error reportado ("Failed to
// send a request to the Edge Function": el navegador nunca recibió
// respuesta, no que el servidor la rechazara) y el log visto (solo "Boot",
// nada más: no hay ningún `serve()` que reciba la petición HTTP entrante).
//
// El correo de "restablecer contraseña" que sí llegó no pasó por aquí: la
// pantalla de login llama la RPC `solicitar_restablecimiento_password`
// directamente (ver `src/lib/usuarios.ts::solicitarRestablecimientoPassword`),
// que es un flujo separado sin sesión, no la acción `resetear_password` de
// esta función. Por eso ese flujo funcionó mientras `crear_usuario` fallaba
// por completo: son dos caminos distintos.
//
// Contratos del lado del cliente (verificados en src/lib/usuarios.ts):
//   accion "crear_usuario"      → { nombre, cargo, email, telefono?, rol,
//                                    iniciales, paginasPermitidas?,
//                                    paisesOperacion, empresasGrupo,
//                                    esAdministrador, administradorAlcanceLimitado }
//                                  respuesta: { usuario: <fila de la tabla usuarios> }
//   accion "resetear_password"  → { usuarioId }
//                                  respuesta: { ok: true } (nunca la contraseña)
//   accion "actualizar_email"   → { usuarioId, nuevoEmail }
//                                  respuesta: { ok: true }
//                                  (el cliente actualiza usuarios.email por su cuenta
//                                   después de que esta acción confirme el cambio en Auth)
//
// Autorización: quien llama debe ser Dirección Médica o un Administrador
// (mismo criterio documentado en src/lib/usuarios.ts). Un Administrador de
// alcance limitado además queda sujeto a las guardas F39 de abajo.
//
// Envío de correo (contraseña temporal / nueva contraseña tras reseteo):
// usa `configuracion_integraciones.edge_function_url` + `webhook_secret`.
// CONTRATO REAL CONFIRMADO (septiembre 2026): `edge_function_url` apunta a
// la función `send-email`, que YA EXISTÍA de antes (sobrevivió al
// incidente que perdió el resto del código, porque las funciones
// desplegadas y los secretos de Edge Functions viven en la infraestructura
// del proyecto, no en el contenedor que se perdió) y el usuario compartió
// su código fuente real. Su contrato es distinto al que se había asumido
// por defecto en la propuesta de Fase 0:
//   - Autenticación server-to-server: header `x-webhook-secret` con el
//     mismo valor que `webhook_secret` — NO `Authorization: Bearer`.
//   - Cuerpo: `{ to, subject, html, cc?, attachments? }` — NO
//     `{ para, asunto, contrasenaTemporal }`. `send-email` no arma el
//     mensaje; espera el HTML ya completo. Por eso `enviarCorreoNotificacion`
//     construye aquí mismo el HTML del correo de la contraseña temporal.
// El helper sigue con try/catch de punta a punta y NUNCA propaga una
// excepción: una falla de red o de contrato aquí no debe volver a poder
// tumbar la función completa. Si el webhook falla, la cuenta/reseteo ya se
// hizo correctamente y la función igual responde 200, solo que sin poder
// avisar por correo.
// =============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(cuerpo: unknown, status: number): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

const ROLES_VALIDOS = ["marketing", "comercial", "medica", "legal", "compliance", "legal_compliance", "finanzas", "gerencia_general", "administrador"];

const ALFABETO_PASSWORD = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; // sin 0/O/1/l/I

function generarPasswordTemporal(longitud = 12): string {
  let out = "";
  const bytes = new Uint8Array(longitud);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < longitud; i++) {
    out += ALFABETO_PASSWORD[bytes[i] % ALFABETO_PASSWORD.length];
  }
  return out;
}

function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

interface EstadoLlamador {
  id: string;
  rol: string;
  esAdministrador: boolean;
  administradorAlcanceLimitado: boolean;
  paisesOperacion: string[];
  empresasGrupo: string[];
}

function autorizado(llamador: EstadoLlamador): boolean {
  return llamador.rol === "medica" || llamador.esAdministrador;
}

/** Un conjunto vacío en cualquiera de los dos lados actúa como comodín ("todas"/"todos"), igual que el resto de la app. */
function seCruzan(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return true;
  return a.some((v) => b.includes(v));
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** HTML del correo de contraseña temporal — `send-email` no arma el mensaje, espera el HTML ya completo. */
function htmlCorreoPassword(contrasenaTemporal: string): string {
  const passEscapada = escaparHtml(contrasenaTemporal);
  return `
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="margin-bottom: 4px;">BEATS</h2>
      <p>Tu contraseña temporal es:</p>
      <p style="font-size: 20px; font-weight: 700; letter-spacing: 1px; background: #f4f4f5; padding: 12px 16px; border-radius: 8px; display: inline-block;">${passEscapada}</p>
      <p>Deberás cambiarla la primera vez que inicies sesión.</p>
      <p style="color: #71717a; font-size: 13px;">Si no esperabas este correo, contacta a un administrador de BEATS.</p>
    </div>`;
}

/**
 * Envía un correo transaccional vía `send-email` (ver contrato real en la
 * nota de cabecera del archivo). Deliberadamente NUNCA propaga una
 * excepción: una falla de red o de contrato aquí no debe volver a poder
 * tumbar la función completa.
 */
async function enviarCorreoNotificacion(
  integraciones: { edge_function_url: string; webhook_secret: string },
  destino: { para: string; asunto: string; contrasenaTemporal: string },
): Promise<{ enviado: boolean; motivo?: string }> {
  try {
    const respuesta = await fetch(integraciones.edge_function_url as string, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-secret": integraciones.webhook_secret,
      },
      body: JSON.stringify({
        to: destino.para,
        subject: destino.asunto,
        html: htmlCorreoPassword(destino.contrasenaTemporal),
      }),
    });
    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => "");
      return { enviado: false, motivo: `send-email respondió ${respuesta.status}: ${detalle}` };
    }
    return { enviado: true };
  } catch (err) {
    console.error("enviarCorreoNotificacion: fallo no bloqueante", err);
    return { enviado: false, motivo: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}

async function manejarCrearUsuario(
  body: Record<string, unknown>,
  llamador: EstadoLlamador,
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<Response> {
  const nombre = body.nombre as string | undefined;
  const cargo = body.cargo as string | undefined;
  const email = (body.email as string | undefined)?.trim();
  const rol = body.rol as string | undefined;
  const iniciales = body.iniciales as string | undefined;

  if (!nombre || !cargo || !email || !rol || !iniciales) {
    return json({ error: "Faltan campos obligatorios para crear el usuario." }, 400);
  }
  if (!emailValido(email)) {
    return json({ error: "El correo no tiene un formato válido." }, 400);
  }
  if (!ROLES_VALIDOS.includes(rol)) {
    return json({ error: `Rol inválido: ${rol}` }, 400);
  }

  const paisesOperacion = (body.paisesOperacion as string[]) ?? [];
  const empresasGrupo = (body.empresasGrupo as string[]) ?? [];
  const nuevoEsAdministrador = body.esAdministrador === true;
  const nuevoAlcanceLimitado = body.administradorAlcanceLimitado === true;
  const esAdminSinAlcance = rol === "administrador" && !nuevoAlcanceLimitado;

  if (!esAdminSinAlcance && (paisesOperacion.length === 0 || empresasGrupo.length === 0)) {
    return json({ error: "Debes indicar al menos un país de operación y una empresa del grupo." }, 400);
  }

  // Guardas de escalamiento de privilegios (F39): un Administrador de
  // alcance limitado no puede crear administradores sin alcance limitado,
  // ni usuarios fuera de su propio alcance de país/empresa.
  if (llamador.administradorAlcanceLimitado) {
    if (nuevoEsAdministrador && !nuevoAlcanceLimitado) {
      return json({ error: "No puedes crear administradores sin alcance limitado." }, 403);
    }
    const fueraDeAlcance =
      paisesOperacion.some((p) => !llamador.paisesOperacion.includes(p)) ||
      empresasGrupo.some((e) => !llamador.empresasGrupo.includes(e));
    if (fueraDeAlcance) {
      return json({ error: "No puedes crear usuarios fuera de tu propio alcance de país/empresa." }, 403);
    }
  }

  // Se verifica que el correo se pueda enviar ANTES de tocar Auth — igual
  // que `resetear_password` más abajo: nunca debe quedar una cuenta creada
  // sin ninguna forma de que su dueño llegue a conocer la contraseña.
  const { data: integraciones } = await supabaseAdmin
    .from("configuracion_integraciones")
    .select("edge_function_url, webhook_secret")
    .eq("id", 1)
    .maybeSingle();
  if (!integraciones?.edge_function_url || !integraciones?.webhook_secret) {
    return json({ error: "No se pudo enviar el correo con la contraseña temporal. Intenta más tarde." }, 502);
  }

  const passwordTemporal = generarPasswordTemporal();

  const { data: nuevaCuentaAuth, error: errorAuth } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: passwordTemporal,
    email_confirm: true,
  });
  if (errorAuth || !nuevaCuentaAuth?.user) {
    return json({ error: errorAuth?.message ?? "No se pudo crear la cuenta de acceso." }, 500);
  }

  const { data: filaNueva, error: errorInsert } = await supabaseAdmin
    .from("usuarios")
    .insert({
      nombre,
      cargo,
      email,
      telefono: (body.telefono as string | undefined) || null,
      rol,
      iniciales,
      debe_cambiar_password: true,
      auth_user_id: nuevaCuentaAuth.user.id,
      paginas_permitidas: (body.paginasPermitidas as string[] | undefined)?.length ? (body.paginasPermitidas as string[]) : null,
      paises_operacion: paisesOperacion,
      empresas_grupo: empresasGrupo,
      es_administrador: nuevoEsAdministrador,
      administrador_alcance_limitado: nuevoAlcanceLimitado,
    })
    .select("*")
    .single();

  if (errorInsert) {
    // La cuenta de Auth ya se creó — se revierte para no dejar una cuenta
    // huérfana sin fila en `usuarios` (nadie podría iniciar sesión con ella
    // de todas formas, pero tampoco debe quedar viva sin control desde acá).
    await supabaseAdmin.auth.admin.deleteUser(nuevaCuentaAuth.user.id).catch((err: unknown) => {
      console.error("manejarCrearUsuario: no se pudo revertir la cuenta de Auth huérfana", err);
    });
    return json({ error: errorInsert.message }, 500);
  }

  // `integraciones` ya se confirmó arriba — si el webhook igual falla en
  // tiempo de ejecución (red, contrato no coincide), se deja constancia en
  // el log pero no se revierte la cuenta ya creada: a diferencia del chequeo
  // de configuración, esto es un caso que no se puede simular por adelantado.
  const correo = await enviarCorreoNotificacion(integraciones as { edge_function_url: string; webhook_secret: string }, {
    para: email,
    asunto: "Tu cuenta de BEATS fue creada",
    contrasenaTemporal: passwordTemporal,
  });
  if (!correo.enviado) {
    console.error("manejarCrearUsuario: la cuenta se creó pero el correo no se pudo enviar —", correo.motivo);
  }

  // La respuesta NUNCA incluye la contraseña.
  return json({ usuario: filaNueva }, 200);
}

async function manejarResetearPassword(
  body: Record<string, unknown>,
  llamador: EstadoLlamador,
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<Response> {
  const usuarioId = body.usuarioId as string | undefined;
  if (!usuarioId) {
    return json({ error: "Falta el id del usuario." }, 400);
  }

  const { data: fila, error: errorFila } = await supabaseAdmin
    .from("usuarios")
    .select("id, email, auth_user_id, paises_operacion, empresas_grupo")
    .eq("id", usuarioId)
    .maybeSingle();
  if (errorFila || !fila) {
    return json({ error: "No se encontró el usuario indicado." }, 404);
  }

  if (llamador.administradorAlcanceLimitado) {
    const paisesFila = (fila.paises_operacion as string[]) ?? [];
    const empresasFila = (fila.empresas_grupo as string[]) ?? [];
    if (!seCruzan(paisesFila, llamador.paisesOperacion) || !seCruzan(empresasFila, llamador.empresasGrupo)) {
      return json({ error: "No puedes restablecer la contraseña de un usuario fuera de tu alcance." }, 403);
    }
  }

  // Igual que `crear_usuario`: se verifica que el correo se pueda enviar
  // ANTES de tocar Auth, para nunca dejar restablecida una contraseña que
  // su dueño no tiene forma de conocer.
  const { data: integraciones } = await supabaseAdmin
    .from("configuracion_integraciones")
    .select("edge_function_url, webhook_secret")
    .eq("id", 1)
    .maybeSingle();
  if (!integraciones?.edge_function_url || !integraciones?.webhook_secret) {
    return json({ error: "No se pudo enviar el correo con la nueva contraseña. Intenta más tarde." }, 502);
  }

  if (!fila.auth_user_id) {
    return json({ error: "Este usuario no tiene una cuenta de acceso asociada." }, 400);
  }

  const passwordNueva = generarPasswordTemporal();
  const { error: errorAuth } = await supabaseAdmin.auth.admin.updateUserById(fila.auth_user_id as string, {
    password: passwordNueva,
  });
  if (errorAuth) {
    return json({ error: errorAuth.message ?? "No se pudo restablecer la contraseña." }, 500);
  }

  const { error: errorUpdate } = await supabaseAdmin
    .from("usuarios")
    .update({ debe_cambiar_password: true })
    .eq("id", usuarioId);
  if (errorUpdate) {
    console.error("manejarResetearPassword: la contraseña se restableció pero no se pudo marcar debe_cambiar_password", errorUpdate);
  }

  const correo = await enviarCorreoNotificacion(integraciones as { edge_function_url: string; webhook_secret: string }, {
    para: fila.email as string,
    asunto: "Tu contraseña de BEATS fue restablecida",
    contrasenaTemporal: passwordNueva,
  });
  if (!correo.enviado) {
    console.error("manejarResetearPassword: la contraseña se restableció pero el correo no se pudo enviar —", correo.motivo);
  }

  // Nunca se devuelve la contraseña — solo confirmación de éxito.
  return json({ ok: true }, 200);
}

async function manejarActualizarEmail(
  body: Record<string, unknown>,
  llamador: EstadoLlamador,
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<Response> {
  const usuarioId = body.usuarioId as string | undefined;
  const nuevoEmail = (body.nuevoEmail as string | undefined)?.trim();
  if (!usuarioId || !nuevoEmail) {
    return json({ error: "Falta el id del usuario o el nuevo correo." }, 400);
  }
  if (!emailValido(nuevoEmail)) {
    return json({ error: "El correo no tiene un formato válido." }, 400);
  }

  const { data: fila, error: errorFila } = await supabaseAdmin
    .from("usuarios")
    .select("id, auth_user_id, paises_operacion, empresas_grupo")
    .eq("id", usuarioId)
    .maybeSingle();
  if (errorFila || !fila?.auth_user_id) {
    return json({ error: "El usuario indicado no tiene una cuenta de acceso vinculada." }, 400);
  }

  if (llamador.administradorAlcanceLimitado) {
    const paisesFila = (fila.paises_operacion as string[]) ?? [];
    const empresasFila = (fila.empresas_grupo as string[]) ?? [];
    if (!seCruzan(paisesFila, llamador.paisesOperacion) || !seCruzan(empresasFila, llamador.empresasGrupo)) {
      return json({ error: "No puedes cambiar el correo de un usuario fuera de tu alcance." }, 403);
    }
  }

  // Solo se actualiza Supabase Auth aquí — el cliente actualiza la tabla
  // `usuarios` por su cuenta después de recibir la confirmación (ver
  // src/lib/usuarios.ts::actualizarEmailUsuario), para que ambos correos
  // nunca queden desincronizados si esto falla.
  const { error: errorAuth } = await supabaseAdmin.auth.admin.updateUserById(fila.auth_user_id as string, {
    email: nuevoEmail,
    email_confirm: true,
  });
  if (errorAuth) {
    return json({ error: errorAuth.message ?? "No se pudo actualizar el correo de inicio de sesión." }, 500);
  }

  return json({ ok: true }, 200);
}

Deno.serve(async (req: Request) => {
  // Preflight CORS — sin esto, el navegador nunca llega a entregar la
  // petición real y supabase-js reporta exactamente "Failed to send a
  // request to the Edge Function" (no hay respuesta que leer).
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "Método no soportado." }, 405);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("admin-usuarios: faltan variables de entorno del proyecto Supabase.");
      return json({ error: "La función no está configurada correctamente." }, 500);
    }

    const encabezadoAuth = req.headers.get("authorization") ?? "";
    const jwtLlamador = encabezadoAuth.replace(/^Bearer\s+/i, "").trim();
    if (!jwtLlamador) {
      return json({ error: "No autenticado." }, 401);
    }

    // Cliente con la service_role/secret key — nunca llega al navegador,
    // solo vive en este entorno de servidor. Se usa TAMBIÉN para validar el
    // JWT de quien llama, pasándolo explícitamente a `auth.getUser(jwt)` en
    // vez de crear un segundo cliente con la clave "anon" del proyecto: así
    // no depende de que `SUPABASE_ANON_KEY` esté en el mismo formato/vigente
    // que la clave publishable que usa el cliente (este proyecto usa el
    // sistema nuevo de claves de Supabase — `sb_publishable_...` — y la
    // variable de entorno legada podía no coincidir, lo que hacía fallar
    // esta validación con un "Sesión inválida o expirada" engañoso incluso
    // con una sesión perfectamente válida).
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: datosUsuarioAuth, error: errorUsuarioAuth } = await supabaseAdmin.auth.getUser(jwtLlamador);
    if (errorUsuarioAuth || !datosUsuarioAuth?.user) {
      console.error("admin-usuarios: auth.getUser() rechazó el JWT del llamador —", errorUsuarioAuth?.message);
      return json({ error: "Sesión inválida o expirada." }, 401);
    }

    const { data: filaLlamador, error: errorFilaLlamador } = await supabaseAdmin
      .from("usuarios")
      .select("id, rol, es_administrador, administrador_alcance_limitado, paises_operacion, empresas_grupo")
      .eq("auth_user_id", datosUsuarioAuth.user.id)
      .maybeSingle();
    if (errorFilaLlamador || !filaLlamador) {
      return json({ error: "No se encontró tu usuario en BEATS." }, 403);
    }

    const llamador: EstadoLlamador = {
      id: filaLlamador.id as string,
      rol: filaLlamador.rol as string,
      esAdministrador: Boolean(filaLlamador.es_administrador),
      administradorAlcanceLimitado: Boolean(filaLlamador.administrador_alcance_limitado),
      paisesOperacion: (filaLlamador.paises_operacion as string[]) ?? [],
      empresasGrupo: (filaLlamador.empresas_grupo as string[]) ?? [],
    };

    if (!autorizado(llamador)) {
      return json({ error: "No tienes permisos para administrar usuarios." }, 403);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "El cuerpo de la petición no es JSON válido." }, 400);
    }

    const accion = body.accion as string | undefined;
    switch (accion) {
      case "crear_usuario":
        return await manejarCrearUsuario(body, llamador, supabaseAdmin);
      case "resetear_password":
        return await manejarResetearPassword(body, llamador, supabaseAdmin);
      case "actualizar_email":
        return await manejarActualizarEmail(body, llamador, supabaseAdmin);
      default:
        return json({ error: `Acción no reconocida: ${accion}` }, 400);
    }
  } catch (err) {
    // Red de seguridad final: cualquier excepción no prevista SIEMPRE
    // produce una Response (con encabezados CORS) en vez de tumbar la
    // función sin responder — la clase exacta de bug que causó el
    // "Failed to send a request to the Edge Function" original.
    console.error("admin-usuarios: error no controlado", err);
    return json({ error: "Ocurrió un error inesperado. Intenta de nuevo." }, 500);
  }
});
