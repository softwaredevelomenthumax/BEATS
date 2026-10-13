// Arnés de pruebas compartido: simula Supabase (Auth + PostgREST + RPC) por
// completo mediante `page.route`, para que los scripts `verificar_*.mjs`
// jamás toquen el proyecto real de Supabase. Cada script arma su propio
// conjunto de fixtures (tablas en memoria) y usa `interceptarSupabase(page,
// fixtures)` antes de navegar al bundle.
//
// Esto reconstruye, con datos simulados, un subconjunto de PostgREST y
// GoTrue suficiente para que `@supabase/supabase-js` funcione sin darse
// cuenta de que no hay servidor real: filtros `eq./neq./in./is.`, `select`,
// `order`, paginación por header `Range`, `maybeSingle()`/`single()`
// (vía header `Accept: application/vnd.pgrst.object+json`), insert/update/
// delete básicos, y `rpc/<fn>` despachado a un handler por fixture.

const HOST_SUPABASE = "xnjqlwkcbkctoinkroqs.supabase.co";

/**
 * @typedef {Object} Fixtures
 * @property {Record<string, any[]>} tablas - filas por nombre de tabla, en formato de columna (snake_case), tal como viven en Postgres.
 * @property {{id: string, email: string, password: string}[]} [usuariosAuth] - credenciales válidas para signInWithPassword.
 * @property {Record<string, (params: URLSearchParams, body: any) => any>} [rpc] - handlers de funciones RPC por nombre.
 */

function generarId(prefijo = "id") {
  return `${prefijo}-${Math.random().toString(36).slice(2, 10)}`;
}

// Une la fila real de cada tabla de documento con lo que expone `v_documentos`
// (id, tipo_doc, estado, creado_por_id, creado_en, nombre). Se amplía en
// cada fase a medida que se reconstruye la tabla correspondiente.
const MAPEO_V_DOCUMENTOS = {
  cafs: { tipoDoc: "caf", nombre: (f) => f.codigo_documento || `CAF — ${f.compania_nombre || "sin compañía"}` },
  fmv_checklists: { tipoDoc: "fmv", nombre: (f) => `FMV — ${f.nombre_completo || "sin nombre"}` },
  notificaciones_pago_hcp: {
    tipoDoc: "notificacionPago",
    nombre: (f) => f.numero_factura || `Notificación de Pago — ${f.nombre_profesional_salud || "sin HCP"}`,
  },
  convenios_pago_hcp: {
    tipoDoc: "convenio",
    nombre: (f) => `Convenio de Pago — ${f.hcp_nombre_completo || f.nombre_evento_servicio || "sin HCP"}`,
  },
  convenios_hcp: {
    tipoDoc: "convenioHCP",
    nombre: (f) => `Convenio HCP — ${f.consultor_nombre || "sin consultor"} / ${f.compania_nombre || "sin compañía"}`,
  },
  solicitudes_evento: {
    tipoDoc: "evento",
    nombre: (f) => f.nombre_evento || "Solicitud de Evento sin nombre",
  },
};

// Cada tabla de documento con cadena de aprobación tiene su tabla hija de
// `<algo>_aprobaciones` — confirmado por extracción directa del bundle
// original que el cliente NUNCA escribe esa tabla hija directamente (ni al
// resolver una etapa, que pasa por RPC, ni al "editar y reenviar" un
// documento rechazado, que solo hace un `.update()` sobre la tabla del
// documento). Esto solo tiene sentido si RLS bloquea la escritura directa a
// esas tablas y un trigger/función del lado del servidor reinicia la cadena
// cuando el documento vuelve a `Pendiente` — el mismo servidor que expone
// `resolver_aprobacion_<tipo>` como RPC en vez de permitir `.update()`
// directo. Esta factoría simula ese trigger para que los fixtures se
// comporten como el servidor real.
const TABLA_APROBACIONES_POR_DOCUMENTO = {
  cafs: { tabla: "caf_aprobaciones", fk: "caf_id" },
  convenios_pago_hcp: { tabla: "convenio_aprobaciones", fk: "convenio_id" },
  convenios_hcp: { tabla: "convenio_hcp_aprobaciones", fk: "convenio_hcp_id" },
  solicitudes_evento: { tabla: "evento_aprobaciones", fk: "evento_id" },
};

function reiniciarCadenaAprobacionSiReenviado(tablaDocumento, filaActualizada, fixtures) {
  const info = TABLA_APROBACIONES_POR_DOCUMENTO[tablaDocumento];
  if (!info || filaActualizada.estado !== "Pendiente") return;
  const pasos = (fixtures.tablas[info.tabla] ?? []).filter((p) => p[info.fk] === filaActualizada.id);
  const ahora = new Date().toISOString();
  for (const paso of pasos) {
    paso.estado = "pendiente";
    paso.resuelto_por_id = null;
    paso.fecha = null;
    paso.comentario = null;
    paso.pendiente_desde = ahora;
  }
}

// Simula las funciones RPC `resolver_aprobacion_<tipo>` que existen en el
// proyecto real de Supabase (confirmado por extracción directa del bundle
// original: la resolución de una etapa de aprobación SIEMPRE pasa por RPC,
// nunca por un `.update()` directo desde el cliente, para caf/convenio/
// convenio_hcp/evento). La función real hace, atómicamente en el server:
// (1) actualizar el paso de `<tabla_aprobaciones>` indicado por `p_orden`,
// (2) transicionar el documento a Rechazado si la acción fue "rechazado",
// o a Aprobado si esa era la última etapa pendiente. Esta factoría arma un
// handler de fixtures que reproduce ese mismo contrato para las pruebas.
function crearHandlerResolverAprobacion(tablaDocumento, tablaAprobaciones, prefijoFk) {
  return (body, fixtures) => {
    const documentoId = body[`p_${prefijoFk}_id`];
    const orden = body.p_orden;
    const accion = body.p_accion;
    const comentario = body.p_comentario ?? null;

    const pasos = (fixtures.tablas[tablaAprobaciones] ?? []).filter((p) => p[`${prefijoFk}_id`] === documentoId);
    const paso = pasos.find((p) => p.orden === orden);
    if (!paso) throw new Error(`No se encontró el paso de aprobación orden=${orden} para ${documentoId}`);

    const actor = (fixtures.tablas.usuarios ?? [])[0];
    paso.estado = accion;
    paso.resuelto_por_id = actor?.id ?? null;
    paso.fecha = new Date().toISOString();
    paso.comentario = comentario;

    const documento = (fixtures.tablas[tablaDocumento] ?? []).find((d) => d.id === documentoId);
    if (documento) {
      if (accion === "rechazado") {
        documento.estado = "Rechazado";
      } else if (pasos.every((p) => p.estado === "aprobado")) {
        documento.estado = "Aprobado";
      }
    }
    return null;
  };
}

/**
 * Simula las RPC `abrir_ventana_adenda_<tipo>`/`cerrar_ventana_adenda_<tipo>`
 * (confirmado por extracción directa del bundle original, funciones `PC`/`FC`
 * para Evento y `XC`/`ZC` para Convenio de Pago): abrir/cerrar la ventana de
 * adenda de un documento ya Aprobado pasa por RPC dedicada, nunca por
 * `.update()` directo sobre las columnas `adenda_ventana_*`. `parametroId` es
 * el nombre del parámetro RPC que trae el id del documento (p.ej.
 * `p_evento_id`, `p_convenio_id`) — varía por tipo de documento.
 */
function crearHandlerAbrirVentanaAdenda(tablaDocumento, parametroId) {
  return (body, fixtures) => {
    const documentoId = body[parametroId];
    const documento = (fixtures.tablas[tablaDocumento] ?? []).find((d) => d.id === documentoId);
    if (!documento) throw new Error("No se encontró el documento para abrir la ventana de adenda.");
    const adendaId = generarId("adenda");
    const expiraEn = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    documento.adenda_ventana_actor_id = adendaId;
    documento.adenda_ventana_expira_en = expiraEn;
    documento.adenda_ventana_justificacion = body.p_justificacion ?? null;
    return { adenda_id: adendaId, expira_en: expiraEn };
  };
}

function crearHandlerCerrarVentanaAdenda(tablaDocumento, parametroId) {
  return (body, fixtures) => {
    const documentoId = body[parametroId];
    const documento = (fixtures.tablas[tablaDocumento] ?? []).find((d) => d.id === documentoId);
    if (documento) {
      documento.adenda_ventana_actor_id = null;
      documento.adenda_ventana_expira_en = null;
      documento.adenda_ventana_justificacion = null;
    }
    return null;
  };
}

// Roles válidos según el enum real `rol_usuario` (confirmado por
// `enums.csv` Y por la constante `ROLES_VALIDOS` del código fuente real de
// la función Edge `admin-usuarios` que el usuario compartió — coinciden
// exactamente).
const ROLES_VALIDOS_ADMIN_USUARIOS = [
  "marketing",
  "comercial",
  "medica",
  "legal_compliance",
  "finanzas",
  "gerencia_general",
  "administrador",
];

/**
 * Simula la función Edge `admin-usuarios` (código fuente real compartido por
 * el usuario) — Deno + service_role, invocada por el cliente vía
 * `supabase.functions.invoke("admin-usuarios", {body})`, nunca por REST/RPC
 * directo. Reproduce, con las mismas reglas, las 3 acciones
 * (`crear_usuario`/`resetear_password`/`actualizar_email`) y el chequeo de
 * autorización del llamador (Dirección Médica o Administrador) + las
 * guardas de escalamiento de privilegios para administradores de alcance
 * limitado. Devuelve `{status, body}` — el llamador (el route handler de
 * `interceptarSupabase`) lo traduce a `route.fulfill`.
 */
function manejarFuncionAdminUsuarios(bodyPeticion, tokenAcceso, sesiones, fixtures) {
  const usuarioAuth = sesiones.get(tokenAcceso);
  if (!usuarioAuth) {
    return { status: 401, body: { error: "No autorizado." } };
  }
  const llamador = (fixtures.tablas.usuarios ?? []).find((u) => u.auth_user_id === usuarioAuth.id);
  const llamadorAutorizado =
    !!llamador && (llamador.rol === "medica" || llamador.rol === "administrador" || llamador.es_administrador === true);
  if (!llamadorAutorizado) {
    return { status: 403, body: { error: "No tienes permisos para administrar usuarios." } };
  }

  const accion = bodyPeticion?.accion;

  if (accion === "crear_usuario") {
    // FASE 0 (corrección E19, septiembre 2026): el cliente ya no genera ni
    // envía ninguna contraseña temporal — la función Edge debe generarla
    // ella misma, igual que ya hace `resetear_password` más abajo, y
    // abortar ANTES de crear la cuenta de Supabase Auth si no puede
    // enviarla por correo (mismo patrón, ver ese bloque para el porqué).
    const { nombre, cargo, email, rol, iniciales } = bodyPeticion;
    if (!nombre || !cargo || !email || !rol || !iniciales) {
      return { status: 400, body: { error: "Faltan campos obligatorios para crear el usuario." } };
    }
    if (!ROLES_VALIDOS_ADMIN_USUARIOS.includes(rol)) {
      return { status: 400, body: { error: `Rol inválido: ${rol}` } };
    }
    const esAdminSinAlcance = rol === "administrador" && bodyPeticion.administradorAlcanceLimitado !== true;
    const paisesOperacion = bodyPeticion.paisesOperacion ?? [];
    const empresasGrupo = bodyPeticion.empresasGrupo ?? [];
    if (!esAdminSinAlcance && (paisesOperacion.length === 0 || empresasGrupo.length === 0)) {
      return {
        status: 400,
        body: { error: "Debes indicar al menos un país de operación y una empresa del grupo." },
      };
    }
    if (llamador.administrador_alcance_limitado === true) {
      const nuevoEsAdminSinAlcance = bodyPeticion.esAdministrador === true && bodyPeticion.administradorAlcanceLimitado !== true;
      if (nuevoEsAdminSinAlcance) {
        return {
          status: 403,
          body: { error: "No puedes crear administradores sin alcance limitado." },
        };
      }
      const fueraDeAlcance =
        paisesOperacion.some((p) => !(llamador.paises_operacion ?? []).includes(p)) ||
        empresasGrupo.some((e) => !(llamador.empresas_grupo ?? []).includes(e));
      if (fueraDeAlcance) {
        return {
          status: 403,
          body: { error: "No puedes crear usuarios fuera de tu propio alcance de país/empresa." },
        };
      }
    }

    const integraciones = (fixtures.tablas.configuracion_integraciones ?? []).find((f) => f.id === 1);
    if (!integraciones?.edge_function_url || !integraciones?.webhook_secret) {
      // Igual que `resetear_password`: si no se puede enviar el correo con
      // la contraseña temporal, se aborta ANTES de crear la cuenta de
      // Supabase Auth — nunca queda un usuario creado sin forma de conocer
      // su contraseña.
      return {
        status: 502,
        body: { error: "No se pudo enviar el correo con la contraseña temporal. Intenta más tarde." },
      };
    }
    const passwordTemporal = `Temp${Math.random().toString(36).slice(2, 10)}!`;
    // Solo para introspección del propio test (Node) — nunca se expone al
    // navegador/cliente, igual que la contraseña de un reseteo.
    fixtures._ultimaPasswordGeneradaCrear = passwordTemporal;

    const authUserId = generarId("authuser");
    (fixtures.usuariosAuth ??= []).push({ id: authUserId, email, password: passwordTemporal });
    const filaNueva = {
      id: generarId("usuarios"),
      nombre,
      cargo,
      email,
      telefono: bodyPeticion.telefono ?? null,
      rol,
      iniciales,
      firma_id: null,
      debe_cambiar_password: true,
      auth_user_id: authUserId,
      paginas_permitidas: bodyPeticion.paginasPermitidas ?? null,
      paises_operacion: paisesOperacion,
      empresas_grupo: empresasGrupo,
      es_administrador: bodyPeticion.esAdministrador === true,
      administrador_alcance_limitado: bodyPeticion.administradorAlcanceLimitado === true,
    };
    (fixtures.tablas.usuarios ??= []).push(filaNueva);
    return { status: 200, body: { usuario: filaNueva } };
  }

  if (accion === "resetear_password") {
    const objetivo = (fixtures.tablas.usuarios ?? []).find((u) => u.id === bodyPeticion.usuarioId);
    if (!objetivo) {
      return { status: 404, body: { error: "No se encontró el usuario indicado." } };
    }
    const integraciones = (fixtures.tablas.configuracion_integraciones ?? []).find((f) => f.id === 1);
    if (!integraciones?.edge_function_url || !integraciones?.webhook_secret) {
      // Igual que la función real: si no se puede enviar el correo, se
      // aborta ANTES de tocar Supabase Auth.
      return {
        status: 502,
        body: { error: "No se pudo enviar el correo con la nueva contraseña. Intenta más tarde." },
      };
    }
    const nuevaPassword = `Temp${Math.random().toString(36).slice(2, 10)}!`;
    // Solo para introspección del propio test (Node) — nunca se expone al
    // navegador/cliente, igual que la función real nunca la devuelve.
    fixtures._ultimaPasswordGenerada = nuevaPassword;
    if (!objetivo.auth_user_id) {
      const nuevoAuthId = generarId("authuser");
      objetivo.auth_user_id = nuevoAuthId;
      (fixtures.usuariosAuth ??= []).push({ id: nuevoAuthId, email: objetivo.email, password: nuevaPassword });
    } else {
      const cuentaAuth = (fixtures.usuariosAuth ?? []).find((u) => u.id === objetivo.auth_user_id);
      if (cuentaAuth) cuentaAuth.password = nuevaPassword;
    }
    return { status: 200, body: { ok: true } };
  }

  if (accion === "actualizar_email") {
    const objetivo = (fixtures.tablas.usuarios ?? []).find((u) => u.id === bodyPeticion.usuarioId);
    if (!objetivo?.auth_user_id) {
      return { status: 400, body: { error: "El usuario indicado no tiene una cuenta de acceso vinculada." } };
    }
    const cuentaAuth = (fixtures.usuariosAuth ?? []).find((u) => u.id === objetivo.auth_user_id);
    if (cuentaAuth) cuentaAuth.email = bodyPeticion.nuevoEmail;
    return { status: 200, body: { ok: true } };
  }

  return { status: 400, body: { error: `Acción no reconocida: ${accion}` } };
}

/**
 * Simula la RPC `SECURITY DEFINER` `solicitar_restablecimiento_password`
 * (diseño inferido, ver docstring en `src/lib/usuarios.ts`): busca el
 * usuario por correo y crea la fila en
 * `solicitudes_restablecimiento_password` — sin sesión, por eso se modela
 * como RPC y no como `.insert()` directo. Si el correo no existe, no
 * lanza error (evita filtrar qué correos están registrados), igual que el
 * patrón típico de "olvidé mi contraseña".
 */
function crearHandlerSolicitarRestablecimientoPassword() {
  return (body, fixtures) => {
    const email = body.p_email;
    const usuario = (fixtures.tablas.usuarios ?? []).find((u) => u.email === email);
    if (usuario) {
      (fixtures.tablas.solicitudes_restablecimiento_password ??= []).push({
        id: generarId("solicitud"),
        usuario_id: usuario.id,
        creada_en: new Date().toISOString(),
        resuelta: false,
        resuelta_en: null,
      });
    }
    return null;
  };
}

// --- Fase 7: las 4 RPC públicas (sin login) de "BEATS — Ejecución en
// Sitio" (`ejecucion.html`). Código fuente real exportado por el usuario
// con `pg_get_functiondef` — estos handlers reproducen, en el mismo orden,
// exactamente las mismas validaciones y los mismos mensajes de error en
// español (verbatim) que la función real de Postgres, para que un test
// contra fixtures se comporte igual que contra el proyecto real. La única
// pieza que no tiene sentido reproducir es el `for update` de fila
// compartida de `registrar_muestra_entregada` (control de concurrencia de
// Postgres) — aquí las pruebas corren en un solo hilo.

/**
 * `validar_codigo_evento_ejecucion(p_codigo, p_responsable_nombre)` — punto
 * de entrada sin login: valida el código de `eventos_codigos_acceso`,
 * SIEMPRE inserta una fila nueva en `sesiones_ejecucion_evento` (nunca
 * reutiliza una existente) y devuelve su `token` más todo el contexto del
 * evento.
 */
function crearHandlerValidarCodigoEjecucion() {
  return (body, fixtures) => {
    const responsable = String(body.p_responsable_nombre ?? "").trim();
    if (!responsable) {
      throw new Error("Debes indicar el nombre de quien atiende el evento.");
    }

    const codigoNormalizado = String(body.p_codigo ?? "").trim().toUpperCase();
    const ahora = Date.now();
    const codigo = (fixtures.tablas.eventos_codigos_acceso ?? []).find((c) => c.codigo === codigoNormalizado);
    if (!codigo || !codigo.activo || (codigo.expira_en && new Date(codigo.expira_en).getTime() <= ahora)) {
      throw new Error("Código inválido o expirado.");
    }

    const evento = (fixtures.tablas.solicitudes_evento ?? []).find((e) => e.id === codigo.evento_id);
    if (!evento || evento.estado !== "Aprobado") {
      throw new Error("Código inválido o expirado.");
    }

    const token = generarId("token");
    (fixtures.tablas.sesiones_ejecucion_evento ??= []).push({
      id: generarId("sesion-ejec"),
      evento_id: evento.id,
      codigo_acceso_id: codigo.id,
      token,
      responsable_nombre: responsable,
      iniciado_en: new Date().toISOString(),
      expira_en: null,
    });

    const productosPlaneados = (fixtures.tablas.evento_muestras_planeadas ?? [])
      .filter((m) => m.evento_id === evento.id)
      .sort((a, b) => a.orden - b.orden)
      .map((m) => {
        const producto = (fixtures.tablas.productos_portafolio ?? []).find((p) => p.id === m.producto_id);
        return { productoId: m.producto_id, nombre: producto?.nombre ?? "", cantidadAproximada: m.cantidad_aproximada ?? null };
      });

    const especialidades = (fixtures.tablas.catalogo_valores ?? [])
      .filter((c) => c.catalogo === "areasEspecialidadEvento")
      .sort((a, b) => a.orden - b.orden)
      .map((c) => c.valor);

    const tiposDocumento = (fixtures.tablas.catalogo_valores ?? [])
      .filter((c) => c.catalogo === "tiposDocumento")
      .sort((a, b) => a.orden - b.orden)
      .map((c) => c.valor);

    const configuracion = (fixtures.tablas.configuracion_formatos ?? []).find((c) => c.id === 1);

    const sesiones = (fixtures.tablas.sesiones_evento ?? [])
      .filter((s) => s.evento_id === evento.id)
      .sort((a, b) => a.orden - b.orden)
      .map((s) => ({ id: s.id, fecha: s.fecha, lugar: s.lugar }));

    return {
      token,
      evento_id: evento.id,
      nombre_evento: evento.nombre_evento,
      entrega_muestras_medicas: evento.entrega_muestras_medicas,
      productos_planeados: productosPlaneados,
      especialidades,
      declaracion_tratamiento_datos: configuracion?.declaracion_tratamiento_datos ?? null,
      modalidad_sesiones: evento.modalidad_sesiones,
      sesiones,
      participacion_academica: evento.participacion_academica,
      tipos_documento: tiposDocumento,
    };
  };
}

/**
 * `crear_registro_participacion(...)` — inserta el archivo de la firma en
 * `archivos_adjuntos` y el registro en `registros_participacion`, devuelve
 * el `uuid` generado. Reproduce las validaciones en el MISMO orden que la
 * función real (nombre/apellido/cédula obligatorios, profesión/interés/
 * participación dentro de los valores permitidos, sesión obligatoria en
 * evento multisesión) con los mismos mensajes en español.
 */
function crearHandlerCrearRegistroParticipacion() {
  return (body, fixtures) => {
    const sesion = (fixtures.tablas.sesiones_ejecucion_evento ?? []).find((s) => s.token === body.p_token);
    if (!sesion || (sesion.expira_en && new Date(sesion.expira_en).getTime() <= Date.now())) {
      throw new Error("Sesión de trabajo inválida o expirada. Vuelve a ingresar el código de acceso.");
    }
    const evento = (fixtures.tablas.solicitudes_evento ?? []).find((e) => e.id === sesion.evento_id);
    if (!evento || evento.estado !== "Aprobado") {
      throw new Error("Sesión de trabajo inválida o expirada. Vuelve a ingresar el código de acceso.");
    }

    const nombres = String(body.p_nombres ?? "").trim();
    const apellidos = String(body.p_apellidos ?? "").trim();
    const cedula = String(body.p_cedula ?? "").trim();
    let tipoDocumento = String(body.p_tipo_documento ?? "").trim();

    if (!nombres) throw new Error("El nombre es obligatorio.");
    if (!apellidos) throw new Error("El apellido es obligatorio.");
    if (!cedula) throw new Error("El número de documento es obligatorio.");
    if (!tipoDocumento) tipoDocumento = "Cédula";
    if (!["medico", "no_medico"].includes(body.p_profesion)) {
      throw new Error("La profesión indicada no es válida.");
    }
    if (!["si", "no", "ya_recibe"].includes(body.p_interes_visita_medica)) {
      throw new Error("El interés en visita médica indicado no es válido.");
    }
    if (!["evento", "taller", "stand"].includes(body.p_tipo_participacion)) {
      throw new Error("El tipo de participación indicado no es válido.");
    }

    if (body.p_sesion_id) {
      const existeSesion = (fixtures.tablas.sesiones_evento ?? []).some(
        (se) => se.id === body.p_sesion_id && se.evento_id === evento.id,
      );
      if (!existeSesion) throw new Error("La sesión indicada no pertenece a este evento.");
    } else if (evento.modalidad_sesiones === "Varias sesiones") {
      throw new Error("Debes indicar a cuál sesión del evento corresponde este registro de asistencia.");
    }

    const configuracion = (fixtures.tablas.configuracion_formatos ?? []).find((c) => c.id === 1);
    const declaracion = configuracion?.declaracion_tratamiento_datos ?? "";

    const firmaId = generarId("archivo");
    (fixtures.tablas.archivos_adjuntos ??= []).push({
      id: firmaId,
      nombre: `firma_participante_${cedula}.png`,
      tipo: "image/png",
      tamano_bytes: String(body.p_firma_data_url ?? "").length,
      data_url: body.p_firma_data_url ?? "",
      cargado_en: new Date().toISOString(),
    });

    const registroId = generarId("registro-part");
    (fixtures.tablas.registros_participacion ??= []).push({
      id: registroId,
      evento_id: evento.id,
      sesion_ejecucion_id: sesion.id,
      nombres,
      apellidos,
      cedula,
      tipo_documento: tipoDocumento,
      profesion: body.p_profesion,
      profesion_detalle: body.p_profesion_detalle ?? "",
      especialidad: body.p_especialidad ?? "",
      especialidad_otra: body.p_especialidad_otra ?? "",
      celular: body.p_celular ?? "",
      email: body.p_email ?? "",
      autoriza_imagen_voz: Boolean(body.p_autoriza_imagen_voz),
      autoriza_datos_personales: Boolean(body.p_autoriza_datos_personales),
      firma_id: firmaId,
      declaracion_texto_mostrado: declaracion,
      interes_visita_medica: body.p_interes_visita_medica,
      direccion: body.p_direccion ?? "",
      pais: body.p_pais ?? "",
      ciudad: body.p_ciudad ?? "",
      tipo_participacion: body.p_tipo_participacion,
      sesion_id: body.p_sesion_id ?? null,
      capturado_en: new Date().toISOString(),
    });

    return registroId;
  };
}

/**
 * `registrar_muestra_entregada(...)` — valida el LOTE completo antes de
 * insertar nada (todo o nada), rechazando cualquier producto que ese mismo
 * médico (por cédula, en este evento) ya hubiera recibido con el mensaje
 * exacto de la función real. Solo después inserta una firma compartida y
 * una fila de `muestras_entregadas` por cada producto del lote.
 */
function crearHandlerRegistrarMuestraEntregada() {
  return (body, fixtures) => {
    const sesion = (fixtures.tablas.sesiones_ejecucion_evento ?? []).find((s) => s.token === body.p_token);
    if (!sesion || (sesion.expira_en && new Date(sesion.expira_en).getTime() <= Date.now())) {
      throw new Error("Sesión de trabajo inválida o expirada. Vuelve a ingresar el código de acceso.");
    }
    const evento = (fixtures.tablas.solicitudes_evento ?? []).find((e) => e.id === sesion.evento_id);
    if (!evento || evento.estado !== "Aprobado") {
      throw new Error("Sesión de trabajo inválida o expirada. Vuelve a ingresar el código de acceso.");
    }
    if (!evento.entrega_muestras_medicas) {
      throw new Error("Este evento no tiene habilitada la entrega de muestras médicas.");
    }

    const items = Array.isArray(body.p_items) ? body.p_items : [];
    if (items.length === 0) {
      throw new Error("Debes indicar al menos un producto a entregar.");
    }

    const registro = (fixtures.tablas.registros_participacion ?? []).find(
      (r) => r.id === body.p_registro_participacion_id,
    );
    if (!registro) throw new Error("No existe el registro de participación indicado.");
    if (registro.evento_id !== evento.id) {
      throw new Error("El registro de participación indicado no pertenece a este evento.");
    }

    for (const item of items) {
      const productoId = item.productoId;
      const cantidad = Number(item.cantidad);
      if (!productoId) throw new Error("Uno de los productos del lote no es válido.");
      if (!(cantidad > 0)) throw new Error("La cantidad entregada debe ser mayor que cero para cada producto.");

      const yaEntregado = (fixtures.tablas.muestras_entregadas ?? []).some((me) => {
        const rp = (fixtures.tablas.registros_participacion ?? []).find((r) => r.id === me.registro_participacion_id);
        return rp && rp.evento_id === evento.id && rp.cedula === registro.cedula && me.producto_id === productoId;
      });
      if (yaEntregado) {
        const producto = (fixtures.tablas.productos_portafolio ?? []).find((p) => p.id === productoId);
        throw new Error(
          `Este médico ya recibió muestra de "${producto?.nombre ?? "este producto"}" en este evento. No se puede registrar de nuevo.`,
        );
      }
    }

    const firmaId = generarId("archivo");
    (fixtures.tablas.archivos_adjuntos ??= []).push({
      id: firmaId,
      nombre: `firma_confirmacion_muestra_${registro.cedula}.png`,
      tipo: "image/png",
      tamano_bytes: String(body.p_firma_data_url ?? "").length,
      data_url: body.p_firma_data_url ?? "",
      cargado_en: new Date().toISOString(),
    });

    const ids = [];
    for (const item of items) {
      const nuevoId = generarId("muestra");
      (fixtures.tablas.muestras_entregadas ??= []).push({
        id: nuevoId,
        registro_participacion_id: registro.id,
        evento_id: evento.id,
        producto_id: item.productoId,
        cantidad: Number(item.cantidad),
        firma_confirmacion_id: firmaId,
        capturado_en: new Date().toISOString(),
      });
      ids.push(nuevoId);
    }
    return ids;
  };
}

/**
 * `resumen_ejecucion_evento(p_codigo)` — la RPC pública y sin login de
 * "BEATS — Marquesina" (Fase 8). A diferencia de
 * `validar_codigo_evento_ejecucion`, el código fuente real de ESTA función
 * NO valida `expira_en` del código (solo que exista y esté `activo`) ni el
 * `estado` del evento, y su único mensaje de error es "Código inválido."
 * (idéntico exista o no el evento) — se reproduce tal cual, sin agregar
 * validaciones que la función real no tiene.
 */
function crearHandlerResumenEjecucionEvento() {
  return (body, fixtures) => {
    const codigoNormalizado = String(body.p_codigo ?? "").trim().toUpperCase();
    const codigo = (fixtures.tablas.eventos_codigos_acceso ?? []).find((c) => c.codigo === codigoNormalizado);
    if (!codigo || !codigo.activo) {
      throw new Error("Código inválido.");
    }

    const evento = (fixtures.tablas.solicitudes_evento ?? []).find((e) => e.id === codigo.evento_id);
    if (!evento) {
      throw new Error("Código inválido.");
    }

    const registros = (fixtures.tablas.registros_participacion ?? []).filter((r) => r.evento_id === evento.id);
    const totalRegistros = registros.length;
    const totalEvento = registros.filter((r) => r.tipo_participacion === "evento").length;
    const totalTaller = registros.filter((r) => r.tipo_participacion === "taller").length;
    const totalStand = registros.filter((r) => r.tipo_participacion === "stand").length;

    const cantidadPorProducto = new Map();
    for (const m of fixtures.tablas.muestras_entregadas ?? []) {
      if (m.evento_id !== evento.id) continue;
      cantidadPorProducto.set(m.producto_id, (cantidadPorProducto.get(m.producto_id) ?? 0) + m.cantidad);
    }
    const productos = [...cantidadPorProducto.entries()]
      .map(([productoId, cantidadTotal]) => {
        const producto = (fixtures.tablas.productos_portafolio ?? []).find((p) => p.id === productoId);
        const archivo = producto?.logo_id
          ? (fixtures.tablas.archivos_adjuntos ?? []).find((a) => a.id === producto.logo_id)
          : null;
        return {
          orden: producto?.orden ?? 0,
          nombre: producto?.nombre ?? "",
          cantidadTotal,
          logoDataUrl: archivo?.data_url ?? null,
        };
      })
      .sort((a, b) => a.orden - b.orden)
      .map(({ nombre, cantidadTotal, logoDataUrl }) => ({ nombre, cantidadTotal, logoDataUrl }));

    return {
      nombre_evento: evento.nombre_evento,
      direccion: evento.direccion,
      ciudad: evento.ciudad,
      fecha_inicio_evento: evento.fecha_inicio_evento,
      fecha_fin_evento: evento.fecha_fin_evento,
      total_registros: totalRegistros,
      total_evento: totalEvento,
      total_taller: totalTaller,
      total_stand: totalStand,
      productos,
    };
  };
}

function sintetizarVDocumentos(tablas) {
  const filas = [];
  for (const [tabla, mapeo] of Object.entries(MAPEO_V_DOCUMENTOS)) {
    for (const fila of tablas[tabla] ?? []) {
      filas.push({
        id: fila.id,
        tipo_doc: mapeo.tipoDoc,
        estado: fila.estado,
        creado_por_id: fila.creado_por_id,
        creado_en: fila.creado_en ?? new Date().toISOString(),
        nombre: mapeo.nombre(fila),
      });
    }
  }
  return filas;
}

function aplicarFiltroEq(filas, columna, valor, negar = false) {
  return filas.filter((fila) => {
    const coincide =
      valor === "null" ? fila[columna] == null : String(fila[columna]) === valor;
    return negar ? !coincide : coincide;
  });
}

function aplicarFiltroIn(filas, columna, listaCruda) {
  // listaCruda viene como "(a,b,c)"
  const valores = listaCruda.replace(/^\(|\)$/g, "").split(",");
  return filas.filter((fila) => valores.includes(String(fila[columna])));
}

function aplicarFiltroComparacion(filas, columna, valor, comparador) {
  return filas.filter((fila) => {
    const v = fila[columna];
    if (v == null) return false;
    return comparador(String(v), valor);
  });
}

/** Aplica los parámetros de query de PostgREST (filtros, order) a un arreglo de filas. */
function filtrarFilas(filas, searchParams) {
  let resultado = filas.slice();
  for (const [clave, valor] of searchParams.entries()) {
    if (["select", "order", "limit", "offset"].includes(clave)) continue;
    const [operador, ...resto] = valor.split(".");
    const argumento = resto.join(".");
    if (operador === "eq") resultado = aplicarFiltroEq(resultado, clave, argumento);
    else if (operador === "neq") resultado = aplicarFiltroEq(resultado, clave, argumento, true);
    else if (operador === "in") resultado = aplicarFiltroIn(resultado, clave, argumento);
    else if (operador === "is") resultado = aplicarFiltroEq(resultado, clave, argumento);
    else if (operador === "gte") resultado = aplicarFiltroComparacion(resultado, clave, argumento, (a, b) => a >= b);
    else if (operador === "lte") resultado = aplicarFiltroComparacion(resultado, clave, argumento, (a, b) => a <= b);
    else if (operador === "gt") resultado = aplicarFiltroComparacion(resultado, clave, argumento, (a, b) => a > b);
    else if (operador === "lt") resultado = aplicarFiltroComparacion(resultado, clave, argumento, (a, b) => a < b);
  }
  const orden = searchParams.get("order");
  if (orden) {
    const [columna, direccion] = orden.split(".");
    resultado.sort((a, b) => {
      if (a[columna] === b[columna]) return 0;
      const mayor = a[columna] > b[columna] ? 1 : -1;
      return direccion === "desc" ? -mayor : mayor;
    });
  }
  return resultado;
}

/**
 * Aplica paginación a un arreglo de filas ya filtrado — soporta las DOS
 * formas en que un cliente PostgREST puede pedir un rango, porque no son
 * intercambiables en la práctica:
 *
 * 1. Header HTTP `Range: <desde>-<hasta>` (con `Range-Unit: items`) — la
 *    forma "de libro de texto" de `.range()` en `@supabase/supabase-js`.
 * 2. Query params `?offset=<n>&limit=<n>` — la forma que en realidad usan
 *    las versiones de `supabase-js`/`postgrest-js` que se ven en los 3
 *    bundles reales de este proyecto (confirmado por captura directa de
 *    los headers/URL de una petición real: NUNCA mandan header `Range`,
 *    solo `offset`/`limit` en la URL).
 *
 * Encontrado en la Fase 8 (comparación visual contra el bundle original):
 * como `traerTodasLasFilas` del lado reconstruido nunca lee este header (ve
 * la nota más abajo, junto al `content-range`), esta función antes solo
 * soportaba la forma 1 y cuando NO había header `Range` devolvía la tabla
 * COMPLETA sin recortar — inofensivo contra el bundle reconstruido (con
 * fixtures de prueba de pocas filas, la tabla completa ya es más chica que
 * el límite pedido, así que el loop de paginación para solo, por
 * casualidad, en la primera vuelta), pero catastrófico contra el bundle
 * original: como su loop de paginación seguía pidiendo mientras la
 * respuesta no viniera vacía, y esta función nunca devolvía una página
 * vacía (siempre la tabla completa, sin importar el offset pedido), el
 * bundle original quedaba pidiendo páginas para siempre y el login nunca
 * terminaba de cargar ("Iniciando sesión..." indefinido).
 */
function aplicarRange(filas, rangeHeader, searchParams) {
  if (rangeHeader) {
    const m = /(\d+)-(\d+)/.exec(rangeHeader);
    if (m) {
      const desde = Number(m[1]);
      const hasta = Number(m[2]);
      return { pagina: filas.slice(desde, hasta + 1), total: filas.length, desde, paginado: true };
    }
  }
  const offsetParam = searchParams?.get("offset");
  const limitParam = searchParams?.get("limit");
  if (offsetParam != null || limitParam != null) {
    const desde = Number(offsetParam ?? 0) || 0;
    const limite = limitParam != null ? Number(limitParam) : filas.length;
    return { pagina: filas.slice(desde, desde + limite), total: filas.length, desde, paginado: true };
  }
  return { pagina: filas, total: filas.length, desde: 0, paginado: false };
}

/**
 * Instala la interceptación de red de Supabase en una página de Playwright.
 * @param {import('playwright').Page} page
 * @param {Fixtures} fixtures
 */

// ---------------------------------------------------------------------------
// RPC `beats_eliminar_borrador` / `beats_eliminar_documento_admin` /
// `beats_anular_documento` (octubre 2026): simulan en JS las 3 funciones
// `security definer` de `db/agregar_rpc_eliminar_anular_documentos.sql`
// (misma regla de negocio, mismos mensajes), para que los `verificar_*.mjs`
// que anulan/eliminan documentos sigan funcionando sin Supabase real. Se
// usan por defecto cuando el fixture no define su propio handler.
// ---------------------------------------------------------------------------
const TABLA_POR_TIPO_DOC = {
  evento: "solicitudes_evento",
  caf: "cafs",
  convenio: "convenios_pago_hcp",
  convenioHCP: "convenios_hcp",
  fmv: "fmv_checklists",
  notificacionPago: "notificaciones_pago_hcp",
};

function usuarioDeSesion(fixtures, usuarioAuth) {
  const fila = (fixtures.tablas.usuarios ?? []).find((u) => u.auth_user_id === usuarioAuth?.id);
  if (!fila) throw new Error("No se pudo identificar tu usuario. Cierra sesión y vuelve a ingresar.");
  return fila;
}

function resolverTablaDocumento(fixtures, tipo) {
  const tabla = TABLA_POR_TIPO_DOC[tipo];
  if (!tabla) throw new Error(`Tipo de documento no válido: ${tipo}`);
  return { tabla, filas: (fixtures.tablas[tabla] = fixtures.tablas[tabla] ?? []) };
}

/** Borra el documento y las filas de otras tablas que lo referencien por cualquier columna `*_id` (sin tocar auditoría). */
function borrarDocumentoYDependientes(fixtures, tabla, id) {
  const principales = new Set(Object.values(TABLA_POR_TIPO_DOC));
  for (const [nombre, filas] of Object.entries(fixtures.tablas)) {
    if (principales.has(nombre) || nombre === "usuarios" || nombre === "auditoria") continue;
    fixtures.tablas[nombre] = filas.filter((f) => !Object.entries(f).some(([k, v]) => k.endsWith("_id") && k !== "id" && v === id));
  }
  fixtures.tablas[tabla] = fixtures.tablas[tabla].filter((f) => f.id !== id);
}

const HANDLERS_RPC_DOCUMENTOS = {
  beats_eliminar_borrador: (body, fixtures, usuarioAuth) => {
    const usuario = usuarioDeSesion(fixtures, usuarioAuth);
    const { tabla, filas } = resolverTablaDocumento(fixtures, body.p_tipo);
    const doc = filas.find((f) => f.id === body.p_id);
    if (!doc) throw new Error("No se pudo eliminar: el documento ya no existe.");
    if (doc.estado !== "Borrador") throw new Error(`No se pudo eliminar: solo se pueden eliminar documentos que sigan en Borrador (este está en ${doc.estado}).`);
    if (doc.creado_por_id !== usuario.id) throw new Error("No se pudo eliminar: solo quien creó el documento puede borrarlo.");
    borrarDocumentoYDependientes(fixtures, tabla, doc.id);
    return null;
  },
  beats_eliminar_documento_admin: (body, fixtures, usuarioAuth) => {
    const usuario = usuarioDeSesion(fixtures, usuarioAuth);
    const { tabla, filas } = resolverTablaDocumento(fixtures, body.p_tipo);
    if (usuario.puede_eliminar_documentos_firmados !== true) {
      throw new Error('No tienes el permiso individual de "Gestión avanzada de documentos firmados".');
    }
    const doc = filas.find((f) => f.id === body.p_id);
    if (!doc) throw new Error("No se pudo eliminar: el documento ya no existe.");
    borrarDocumentoYDependientes(fixtures, tabla, doc.id);
    return null;
  },
  beats_contar_auditoria_rango: (body, fixtures, usuarioAuth) => {
    const usuario = usuarioDeSesion(fixtures, usuarioAuth);
    if (usuario.puede_eliminar_documentos_firmados !== true) {
      throw new Error('No tienes el permiso individual de "Gestión avanzada de documentos firmados".');
    }
    const d = new Date(body.p_desde).getTime();
    const h = new Date(body.p_hasta).getTime();
    if (!(d <= h)) throw new Error('Indica un rango válido: la fecha/hora "desde" debe ser anterior o igual a "hasta".');
    return (fixtures.tablas.auditoria ?? []).filter((f) => { const t = new Date(f.ocurrido_en).getTime(); return t >= d && t <= h; }).length;
  },
  beats_eliminar_auditoria_rango: (body, fixtures, usuarioAuth) => {
    const usuario = usuarioDeSesion(fixtures, usuarioAuth);
    if (usuario.puede_eliminar_documentos_firmados !== true) {
      throw new Error('No tienes el permiso individual de "Gestión avanzada de documentos firmados".');
    }
    const d = new Date(body.p_desde).getTime();
    const h = new Date(body.p_hasta).getTime();
    if (!(d <= h)) throw new Error('Indica un rango válido: la fecha/hora "desde" debe ser anterior o igual a "hasta".');
    const antes = (fixtures.tablas.auditoria ?? []).length;
    fixtures.tablas.auditoria = (fixtures.tablas.auditoria ?? []).filter((f) => { const t = new Date(f.ocurrido_en).getTime(); return !(t >= d && t <= h); });
    return antes - fixtures.tablas.auditoria.length;
  },
  beats_devolver_documento: (body, fixtures, usuarioAuth) => {
    const usuario = usuarioDeSesion(fixtures, usuarioAuth);
    const { filas } = resolverTablaDocumento(fixtures, body.p_tipo);
    const doc = filas.find((f) => f.id === body.p_id);
    if (!doc) throw new Error("No se pudo devolver: el documento ya no existe.");
    if (doc.estado !== "Pendiente") throw new Error(`No se pudo devolver: solo se puede devolver un documento Pendiente (este está en ${doc.estado}).`);
    if (!(usuario.es_administrador === true || doc.creado_por_id === usuario.id)) throw new Error("No se pudo devolver: solo quien creó el documento (o un Administrador) puede devolverlo.");
    doc.estado = "Devuelto";
    return null;
  },
  beats_anular_documento: (body, fixtures, usuarioAuth) => {
    const usuario = usuarioDeSesion(fixtures, usuarioAuth);
    const { filas } = resolverTablaDocumento(fixtures, body.p_tipo);
    if (usuario.es_administrador !== true) throw new Error("No se pudo anular: solo un Administrador puede anular documentos.");
    if (!body.p_motivo || !String(body.p_motivo).trim()) throw new Error("Indica el motivo de anulación.");
    const doc = filas.find((f) => f.id === body.p_id);
    if (!doc) throw new Error("No se pudo anular: el documento ya no existe.");
    if (doc.estado === "Anulado") throw new Error("Este documento ya está anulado.");
    if (doc.estado === "Borrador") {
      throw new Error('Un documento en Borrador no se anula: elimínalo con "Eliminar borrador" (solo quien lo creó).');
    }
    doc.estado = "Anulado";
    doc.motivo_anulacion = String(body.p_motivo).trim();
    doc.anulado_por_id = usuario.id;
    doc.anulado_en = new Date().toISOString();
    return null;
  },
};

export async function interceptarSupabase(page, fixtures) {
  const sesiones = new Map(); // access_token -> usuarioAuth

  await page.route(`https://${HOST_SUPABASE}/**`, async (route) => {
    // `fixtures.simularSinConexion = true` simula una falla de RED real
    // (no un rechazo de negocio): aborta la petición antes de tocar
    // cualquier lógica de fixtures, para que el `fetch` de supabase-js
    // rechace igual que si el dispositivo no tuviera internet. Usado por
    // las pruebas de la cola offline de "Ejecución en Sitio" (Fase 7) —
    // `context.setOffline()` por sí solo NO alcanza aquí, porque una
    // petición ya interceptada y resuelta por `page.route` nunca llega a
    // la capa de red real donde esa emulación actúa.
    if (fixtures.simularSinConexion) {
      return route.abort("internetdisconnected");
    }

    const request = route.request();
    const url = new URL(request.url());
    const metodo = request.method();

    // --- Auth: login por contraseña ---
    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
      const body = request.postDataJSON();
      const usuarioAuth = (fixtures.usuariosAuth ?? []).find(
        (u) => u.email === body.email && u.password === body.password,
      );
      if (!usuarioAuth) {
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "invalid_grant", error_description: "Invalid login credentials" }),
        });
      }
      const accessToken = generarId("token");
      sesiones.set(accessToken, usuarioAuth);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: accessToken,
          refresh_token: generarId("refresh"),
          expires_in: 3600,
          token_type: "bearer",
          user: { id: usuarioAuth.id, email: usuarioAuth.email },
        }),
      });
    }

    // --- Auth: refresh token (autoRefreshToken) ---
    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token") {
      const accessToken = generarId("token");
      const cualquiera = [...sesiones.values()][0];
      if (cualquiera) sesiones.set(accessToken, cualquiera);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: accessToken,
          refresh_token: generarId("refresh"),
          expires_in: 3600,
          token_type: "bearer",
          user: cualquiera ? { id: cualquiera.id, email: cualquiera.email } : null,
        }),
      });
    }

    // --- Auth: usuario actual / update password ---
    if (url.pathname === "/auth/v1/user") {
      const auth = request.headers()["authorization"] ?? "";
      const token = auth.replace(/^Bearer\s+/, "");
      const usuarioAuth = sesiones.get(token);
      if (metodo === "PUT") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ id: usuarioAuth?.id, email: usuarioAuth?.email }),
        });
      }
      if (!usuarioAuth) {
        return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({}) });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: usuarioAuth.id, email: usuarioAuth.email }),
      });
    }

    if (url.pathname === "/auth/v1/logout") {
      return route.fulfill({ status: 204, body: "" });
    }

    // --- Función Edge admin-usuarios ---
    if (url.pathname === "/functions/v1/admin-usuarios" && metodo === "POST") {
      const auth = request.headers()["authorization"] ?? "";
      const token = auth.replace(/^Bearer\s+/, "");
      const bodyPeticion = request.postDataJSON();
      const { status, body } = manejarFuncionAdminUsuarios(bodyPeticion ?? {}, token, sesiones, fixtures);
      return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    }

    // --- RPC ---
    const matchRpc = /^\/rest\/v1\/rpc\/(.+)$/.exec(url.pathname);
    if (matchRpc) {
      const nombreFn = matchRpc[1];
      const handler = fixtures.rpc?.[nombreFn] ?? HANDLERS_RPC_DOCUMENTOS[nombreFn];
      if (!handler) {
        return route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ message: `RPC no simulada en fixtures: ${nombreFn}` }),
        });
      }
      const body = request.postDataJSON();
      try {
        const tokenRpc = (request.headers()["authorization"] ?? "").replace(/^Bearer\s+/, "");
        const resultado = await handler(body ?? {}, fixtures, sesiones.get(tokenRpc));
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(resultado) });
      } catch (e) {
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ message: e instanceof Error ? e.message : String(e) }),
        });
      }
    }

    // --- REST: tablas ---
    const matchTabla = /^\/rest\/v1\/([^/]+)$/.exec(url.pathname);
    if (matchTabla) {
      const tabla = matchTabla[1];
      fixtures.tablas[tabla] = fixtures.tablas[tabla] ?? [];

      // `v_documentos` es una VISTA real que en Postgres es un UNION sobre
      // las 6 tablas de documento. Un fixture estático se desincroniza en
      // cuanto el propio test inserta un CAF/Evento/etc., así que aquí se
      // sintetiza dinámicamente a partir de las tablas fuente — además de
      // cualquier fila sembrada a mano en fixtures.tablas.v_documentos
      // (útil para tipos de documento que todavía no tienen tabla propia
      // reconstruida, p. ej. `solicitudes_evento` antes de la Fase 4).
      const filasTabla =
        tabla === "v_documentos" && metodo === "GET"
          ? [...sintetizarVDocumentos(fixtures.tablas), ...(fixtures.tablas.v_documentos ?? [])]
          : fixtures.tablas[tabla];

      if (metodo === "GET") {
        const filtradas = filtrarFilas(filasTabla, url.searchParams);
        const { pagina, total, desde, paginado } = aplicarRange(filtradas, request.headers()["range"], url.searchParams);
        const single = /application\/vnd\.pgrst\.object\+json/.test(request.headers()["accept"] ?? "");
        if (single) {
          if (pagina.length === 0) {
            return route.fulfill({
              status: 406,
              contentType: "application/json",
              body: JSON.stringify({ message: "No se encontró la fila" }),
            });
          }
          return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(pagina[0]) });
        }
        // Content-Range real de PostgREST: `<desde>-<hasta>/<total>` cuando
        // la página trae filas, o `*/<total>` cuando viene vacía (offset
        // más allá del final de los datos). Antes esto SIEMPRE reportaba
        // `0-N/total` sin importar el offset real pedido Y, cuando no había
        // header `Range` (el caso real: ver `aplicarRange` arriba, ningún
        // bundle manda ese header — los 3 paginan con query params
        // `offset`/`limit`), devolvía la tabla COMPLETA sin recortar en vez
        // de la página pedida. Contra el bundle reconstruido esto era
        // inofensivo por pura casualidad (fixtures de prueba con pocas
        // filas: la tabla completa ya es más chica que el límite pedido,
        // así que el loop de paginación para en la primera vuelta sin que
        // el bug se note). Contra el bundle original (Fase 8, comparación
        // visual) era catastrófico: como la respuesta nunca venía vacía sin
        // importar cuánto creciera el offset, su loop de paginación
        // (que sigue pidiendo mientras la página no venga vacía) nunca
        // terminaba — el login se quedaba colgado en "Iniciando sesión...".
        const contentRange = pagina.length === 0 ? `*/${total}` : `${desde}-${desde + pagina.length - 1}/${total}`;
        return route.fulfill({
          status: paginado ? 206 : 200,
          contentType: "application/json",
          headers: { "content-range": contentRange },
          body: JSON.stringify(pagina),
        });
      }

      // .single()/.maybeSingle() encadenados sobre insert()/update() ponen
      // este Accept header y esperan un OBJETO, no un arreglo de un solo
      // elemento — hay que responder igual que PostgREST real o el cliente
      // termina leyendo `data.id` sobre un arreglo (undefined) en vez del
      // objeto insertado.
      const single = /application\/vnd\.pgrst\.object\+json/.test(request.headers()["accept"] ?? "");

      if (metodo === "POST") {
        const body = request.postDataJSON();
        const columnasConflicto = url.searchParams.get("on_conflict")?.split(",") ?? null;
        const filasBody = Array.isArray(body) ? body : [body];

        // `.upsert(fila, {onConflict: "col"})` manda `?on_conflict=col` +
        // `Prefer: resolution=merge-duplicates` — sin esto, cada guardado de
        // una fila "singleton" (p.ej. `configuracion_formatos`, id=1)
        // acumularía duplicados en vez de reemplazar la fila existente,
        // como sí hace PostgREST real.
        if (columnasConflicto) {
          const resultado = [];
          for (const filaBody of filasBody) {
            const existente = filasTabla.find((f) => columnasConflicto.every((c) => f[c] === filaBody[c]));
            if (existente) {
              Object.assign(existente, filaBody);
              resultado.push(existente);
            } else {
              const nueva = { id: filaBody.id ?? generarId(tabla), ...filaBody };
              filasTabla.push(nueva);
              resultado.push(nueva);
            }
          }
          const cuerpoUpsert = single ? resultado[0] : resultado;
          return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(cuerpoUpsert) });
        }

        const nuevasFilas = filasBody.map((fila) => ({
          id: fila.id ?? generarId(tabla),
          ...fila,
        }));
        // Entrega 36: `fixtures.alInsertar[tabla](fila)` simula un trigger BEFORE INSERT de la base (p. ej. autor y fecha).
        const gancho = fixtures.alInsertar?.[tabla];
        if (gancho) nuevasFilas.forEach((f) => gancho(f));
        filasTabla.push(...nuevasFilas);
        const cuerpoRespuesta = single ? nuevasFilas[0] : nuevasFilas;
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(cuerpoRespuesta) });
      }

      if (metodo === "PATCH") {
        const body = request.postDataJSON();
        const objetivo = filtrarFilas(filasTabla, url.searchParams);
        for (const fila of objetivo) {
          const antes = { ...fila };
          Object.assign(fila, body);
          // Entrega 36: `fixtures.alActualizar[tabla](fila, antes)` simula un trigger BEFORE UPDATE.
          fixtures.alActualizar?.[tabla]?.(fila, antes);
          reiniciarCadenaAprobacionSiReenviado(tabla, fila, fixtures);
        }
        const cuerpoRespuesta = single ? objetivo[0] : objetivo;
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cuerpoRespuesta) });
      }

      if (metodo === "DELETE") {
        const objetivo = filtrarFilas(filasTabla, url.searchParams);
        fixtures.tablas[tabla] = filasTabla.filter((f) => !objetivo.includes(f));
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(objetivo) });
      }
    }

    // Cualquier otra llamada a Supabase no contemplada: se marca como error
    // explícito en vez de dejarla pasar a la red real.
    return route.fulfill({
      status: 501,
      contentType: "application/json",
      body: JSON.stringify({ message: `Ruta no simulada en fixtures: ${metodo} ${url.pathname}` }),
    });
  });
}

// Fase 8 (hallazgo grande): el login ahora exige resolver un reto
// matemático simple ("¿cuánto es A+B?", campo #login-captcha) antes de
// dejar enviar el formulario — ver src/pages/PantallaLogin.tsx. Todos los
// scripts verificar_*.mjs que hacen login deben llamar a este helper
// después de llenar #email/#password y antes de hacer click en el botón
// de submit, o el login queda bloqueado por la verificación de seguridad.
async function resolverCaptchaLogin(page) {
  const textoPagina = await page.locator("body").innerText();
  const match = textoPagina.match(/¿cuánto es\s*(\d+)\s*\+\s*(\d+)\?/);
  if (!match) {
    throw new Error("No se encontró el reto de verificación de seguridad (#login-captcha) en la pantalla de login.");
  }
  const respuesta = Number(match[1]) + Number(match[2]);
  await page.fill("#login-captcha", String(respuesta));
}

export {
  HOST_SUPABASE,
  crearHandlerResolverAprobacion,
  crearHandlerAbrirVentanaAdenda,
  crearHandlerCerrarVentanaAdenda,
  crearHandlerSolicitarRestablecimientoPassword,
  crearHandlerValidarCodigoEjecucion,
  crearHandlerCrearRegistroParticipacion,
  crearHandlerRegistrarMuestraEntregada,
  crearHandlerResumenEjecucionEvento,
  resolverCaptchaLogin,
};
