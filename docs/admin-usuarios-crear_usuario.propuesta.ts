// =============================================================================
// PROPUESTA — corrección de seguridad E19 (exposición de contraseña temporal
// al crear un colaborador), Fase 0, septiembre 2026.
//
// ESTE ARCHIVO NO SE DESPLEGÓ. La función Edge real `admin-usuarios` vive en
// el proyecto de Supabase (xnjqlwkcbkctoinkroqs), no en este repositorio —
// hay que copiar el fragmento de la acción `crear_usuario` de abajo y
// reemplazar la sección equivalente en el código fuente real de la función
// (Dashboard de Supabase → Edge Functions → admin-usuarios → código fuente),
// y luego desplegarla (`supabase functions deploy admin-usuarios` o desde el
// propio dashboard).
//
// Qué corrige exactamente (ver BEATS_Diagnostico_Implementacion.docx,
// hallazgo E19): hoy el cliente (`generarPasswordTemporal()`, ya eliminado
// de src/lib/auth.ts) genera la contraseña temporal EN EL NAVEGADOR, la
// muestra en pantalla en un campo editable, y la incluye en un toast de
// éxito — quedando visible en el DOM/el historial de toasts incluso después
// de que Dirección Médica/el Administrador cierre sesión, y compartida en
// texto plano hacia la función Edge. La corrección de este archivo hace que
// `crear_usuario` genere la contraseña ELLA MISMA, del lado del servidor, y
// la envíe directo por correo al colaborador nuevo — exactamente el mismo
// patrón de confidencialidad que ya usa `resetear_password` en esta misma
// función (esa acción no se toca aquí, se deja igual).
//
// El código ya asume que el resto de la función (autenticación del llamador,
// creación del usuario en Supabase Auth con `service_role`, envío de correo
// vía `configuracion_integraciones`) ya existe con ese mismo patrón — porque
// `resetear_password` ya lo hace hoy. Si el código real difiere en nombres
// de variables/helpers, ajusta la integración, pero la LÓGICA de abajo
// (validaciones, orden de las validaciones, y el punto exacto donde se
// genera la contraseña) es la que hay que igualar — está verificada contra
// el arnés de pruebas de este proyecto en
// scripts/lib/fixtures.mjs::manejarFuncionAdminUsuarios y
// scripts/verificar_administracion.mjs (pasos 5–6).
// =============================================================================

// --- Tipos y helpers que ya deberían existir en el archivo real; se listan
// aquí solo para que el fragmento de abajo sea legible de forma aislada. ---
//
// interface EstadoLlamador { rol: string; esAdministrador: boolean; administradorAlcanceLimitado: boolean; paisesOperacion: string[]; empresasGrupo: string[]; }
// function autorizado(llamador: EstadoLlamador): boolean { ... } // ya existe
// function enviarCorreoContrasenaTemporal(email: string, password: string): Promise<void> { ... } // ya existe, lo usa resetear_password
// const ALFABETO_PASSWORD = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; // sin 0/O/1/l/I — el mismo alfabeto que ya usa el generador del lado del servidor para resetear_password

function generarPasswordTemporal(longitud = 12): string {
  const ALFABETO_PASSWORD = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const bytes = new Uint8Array(longitud);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < longitud; i++) {
    out += ALFABETO_PASSWORD[bytes[i] % ALFABETO_PASSWORD.length];
  }
  return out;
}

/**
 * Fragmento de reemplazo para la rama `accion === "crear_usuario"` dentro
 * del handler principal de la función Edge `admin-usuarios`.
 *
 * Cambios respecto a la versión actual:
 *  1. YA NO lee `passwordTemporal` del body — si el cliente todavía la
 *     envía (mientras no se haya redesplegado el bundle nuevo), se IGNORA
 *     por completo, nunca se usa.
 *  2. Antes de crear la cuenta en Supabase Auth, revisa
 *     `configuracion_integraciones` — si no está configurada, aborta con
 *     502 SIN tocar Auth (mismo comportamiento que ya tiene
 *     `resetear_password` en esta función; ver ese bloque más abajo en el
 *     archivo real para copiar la forma exacta de esa consulta).
 *  3. Genera la contraseña ella misma, la usa para crear la cuenta de Auth,
 *     y la envía por correo — nunca la incluye en la respuesta HTTP.
 */
async function manejarCrearUsuario(
  bodyPeticion: Record<string, unknown>,
  llamador: { rol: string; esAdministrador: boolean; administradorAlcanceLimitado: boolean; paisesOperacion: string[]; empresasGrupo: string[] },
  supabaseAdmin: any, // cliente de supabase-js creado con la service_role key
): Promise<Response> {
  const nombre = bodyPeticion.nombre as string | undefined;
  const cargo = bodyPeticion.cargo as string | undefined;
  const email = bodyPeticion.email as string | undefined;
  const rol = bodyPeticion.rol as string | undefined;
  const iniciales = bodyPeticion.iniciales as string | undefined;

  // 1. Campos obligatorios — ya NO incluye passwordTemporal.
  if (!nombre || !cargo || !email || !rol || !iniciales) {
    return new Response(JSON.stringify({ error: "Faltan campos obligatorios para crear el usuario." }), { status: 400 });
  }

  const ROLES_VALIDOS = ["marketing", "comercial", "medica", "legal_compliance", "finanzas", "gerencia_general", "administrador"];
  if (!ROLES_VALIDOS.includes(rol)) {
    return new Response(JSON.stringify({ error: `Rol inválido: ${rol}` }), { status: 400 });
  }

  const paisesOperacion = (bodyPeticion.paisesOperacion as string[]) ?? [];
  const empresasGrupo = (bodyPeticion.empresasGrupo as string[]) ?? [];
  const nuevoEsAdministrador = bodyPeticion.esAdministrador === true;
  const nuevoAlcanceLimitado = bodyPeticion.administradorAlcanceLimitado === true;
  const esAdminSinAlcance = rol === "administrador" && !nuevoAlcanceLimitado;

  if (!esAdminSinAlcance && (paisesOperacion.length === 0 || empresasGrupo.length === 0)) {
    return new Response(
      JSON.stringify({ error: "Debes indicar al menos un país de operación y una empresa del grupo." }),
      { status: 400 },
    );
  }

  // 2. Guardas de escalamiento de privilegios (hallazgo F39) — un
  //    Administrador de alcance limitado no puede crear administradores SIN
  //    alcance limitado, ni crear usuarios fuera de su propio alcance.
  if (llamador.administradorAlcanceLimitado) {
    if (nuevoEsAdministrador && !nuevoAlcanceLimitado) {
      return new Response(JSON.stringify({ error: "No puedes crear administradores sin alcance limitado." }), { status: 403 });
    }
    const fueraDeAlcance =
      paisesOperacion.some((p) => !llamador.paisesOperacion.includes(p)) ||
      empresasGrupo.some((e) => !llamador.empresasGrupo.includes(e));
    if (fueraDeAlcance) {
      return new Response(JSON.stringify({ error: "No puedes crear usuarios fuera de tu propio alcance de país/empresa." }), { status: 403 });
    }
  }

  // 3. Verificar que se pueda enviar el correo ANTES de tocar Auth — mismo
  //    patrón que ya usa `resetear_password` en esta función (copiar la
  //    consulta exacta a `configuracion_integraciones` desde ese bloque).
  const { data: integraciones } = await supabaseAdmin
    .from("configuracion_integraciones")
    .select("edge_function_url, webhook_secret")
    .eq("id", 1)
    .maybeSingle();
  if (!integraciones?.edge_function_url || !integraciones?.webhook_secret) {
    return new Response(
      JSON.stringify({ error: "No se pudo enviar el correo con la contraseña temporal. Intenta más tarde." }),
      { status: 502 },
    );
  }

  // 4. Generar la contraseña AQUÍ, del lado del servidor — nunca llega al
  //    cliente que hizo la petición.
  const passwordTemporal = generarPasswordTemporal();

  const { data: nuevaCuentaAuth, error: errorAuth } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: passwordTemporal,
    email_confirm: true,
  });
  if (errorAuth || !nuevaCuentaAuth?.user) {
    return new Response(JSON.stringify({ error: errorAuth?.message ?? "No se pudo crear la cuenta de acceso." }), { status: 500 });
  }

  const { data: filaNueva, error: errorInsert } = await supabaseAdmin
    .from("usuarios")
    .insert({
      nombre,
      cargo,
      email,
      telefono: bodyPeticion.telefono ?? null,
      rol,
      iniciales,
      debe_cambiar_password: true,
      auth_user_id: nuevaCuentaAuth.user.id,
      paginas_permitidas: (bodyPeticion.paginasPermitidas as string[]) ?? null,
      paises_operacion: paisesOperacion,
      empresas_grupo: empresasGrupo,
      es_administrador: nuevoEsAdministrador,
      administrador_alcance_limitado: nuevoAlcanceLimitado,
    })
    .select("*")
    .single();
  if (errorInsert) {
    // La cuenta de Auth ya se creó — si falla el insert en `usuarios`, hay
    // que decidir si se revierte (`supabaseAdmin.auth.admin.deleteUser(...)`)
    // o se deja huérfana para revisión manual. Revisar cuál de las dos hace
    // hoy la función real y mantener el mismo comportamiento.
    return new Response(JSON.stringify({ error: errorInsert.message }), { status: 500 });
  }

  // 5. Enviar la contraseña por correo — usar el mismo helper/integración
  //    que ya usa `resetear_password` en esta función.
  await enviarCorreoContrasenaTemporal(email, passwordTemporal, integraciones);

  // 6. La respuesta NUNCA incluye la contraseña.
  return new Response(JSON.stringify({ usuario: filaNueva }), { status: 200 });
}

/**
 * Placeholder — reemplazar por el helper real que ya usa `resetear_password`
 * en esta misma función para enviar el correo (mismo `edge_function_url` +
 * `webhook_secret` de `configuracion_integraciones`). No se conoce el
 * contrato exacto de ese webhook desde este entorno (no hay acceso al
 * proyecto real de Supabase ni al código fuente completo de la función), así
 * que este cuerpo es solo ilustrativo del PUNTO donde debe llamarse — copiar
 * la implementación real desde el bloque de `resetear_password`, no esta.
 */
async function enviarCorreoContrasenaTemporal(
  email: string,
  password: string,
  integraciones: { edge_function_url: string; webhook_secret: string },
): Promise<void> {
  await fetch(integraciones.edge_function_url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${integraciones.webhook_secret}` },
    body: JSON.stringify({
      para: email,
      asunto: "Tu cuenta de BEATS fue creada",
      contrasenaTemporal: password,
    }),
  });
}
