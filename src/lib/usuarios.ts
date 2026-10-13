import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";
import { normalizarEmail } from "@/lib/normalizarTexto";
import { rowToFlat } from "@/lib/dbMapping";
import { CAMPOS_USUARIO } from "@/hooks/useAuth";
import type { RolUsuario } from "@/lib/enums";
import type { SolicitudRestablecimientoPassword, Usuario } from "@/types";

/**
 * Alcance de un Administrador de alcance limitado (`administradorAlcanceLimitado
 * = true`): solo debería ver colaboradores que comparten al menos una empresa
 * del grupo Y al menos un país de operación con él. Un valor "todas"/"todos"
 * (arreglo vacío) en cualquiera de los dos lados se trata como comodín, igual
 * que en el resto de la app (ver "todas"/"todos" en la tabla de
 * `UsuariosRoles.tsx`).
 *
 * IMPORTANTE (hallazgo F39 del diagnóstico): este filtro es solo defensa en
 * el cliente — reduce lo que se muestra en pantalla, pero un Administrador de
 * alcance limitado podría llamar `traerUsuarios()` sin `alcance`, o pegarle
 * directo a la API de Supabase, y seguir recibiendo la tabla completa si RLS
 * no lo impide también del lado de la base de datos. La corrección real y
 * definitiva es una política RLS en la tabla `usuarios` — ver
 * `docs/rls-usuarios.propuesta.sql`.
 */
export interface AlcanceUsuario {
  empresasGrupo: string[];
  paisesOperacion: string[];
}

function seCruzan(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return true;
  return a.some((v) => b.includes(v));
}

function dentroDelAlcance(u: Usuario, alcance: AlcanceUsuario): boolean {
  return seCruzan(u.empresasGrupo, alcance.empresasGrupo) && seCruzan(u.paisesOperacion, alcance.paisesOperacion);
}

export async function traerUsuarios(alcance?: AlcanceUsuario): Promise<Usuario[]> {
  const { data, error } = await supabase.from("usuarios").select("*").order("nombre", { ascending: true });
  if (error) throw new Error(mensajeErrorAmigable(error));
  const todos = (data ?? []).map((fila) => rowToFlat<Usuario>(fila, CAMPOS_USUARIO));
  if (!alcance) return todos;
  return todos.filter((u) => dentroDelAlcance(u, alcance));
}

/**
 * Trae varios usuarios de una vez por sus ids — usado por la vista oficial
 * de impresión (Fase 5, post-reconstrucción) para resolver, en un solo
 * viaje, "Elaborado por" (`creadoPorId`) y el nombre de cada aprobador ya
 * resuelto (`resueltoPorId`) de la tabla de Aprobación, sin una consulta
 * por cada uno. Mismo patrón que `traerArchivos` en `archivosAdjuntos.ts`.
 * Ids repetidos o vacíos se ignoran.
 */
export async function traerUsuariosPorIds(ids: string[]): Promise<Map<string, Usuario>> {
  const unicos = Array.from(new Set(ids.filter(Boolean)));
  if (unicos.length === 0) return new Map();
  const { data, error } = await supabase.from("usuarios").select("*").in("id", unicos);
  if (error) throw new Error(mensajeErrorAmigable(error));
  const mapa = new Map<string, Usuario>();
  for (const fila of data ?? []) {
    const usuario = rowToFlat<Usuario>(fila, CAMPOS_USUARIO);
    mapa.set(usuario.id, usuario);
  }
  return mapa;
}

/**
 * Entrega 23 (octubre 2026): datos del perfil que alimentan las líneas de firma
 * del CAF. Ver los comentarios de cada campo en `types.ts` (`Usuario`).
 * `jefeInmediatoId` vale `JEFE_ES_EL_MISMO` mientras se crea el usuario (todavía no
 * tiene id): al guardar se reemplaza por su propio id ("el mismo usuario puede
 * seleccionar ser su propio jefe inmediato").
 */
export const JEFE_ES_EL_MISMO = "__yo__";

export interface OpcionesFirmaPerfil {
  area: string;
  esDirectorArea: boolean;
  firmaComoDirectorArea: boolean;
  jefeInmediatoId: string;
  firmaComoJefeInmediato: boolean;
  firmaComoComplianceLatam: boolean;
}

export const OPCIONES_FIRMA_VACIAS: OpcionesFirmaPerfil = {
  area: "",
  esDirectorArea: false,
  firmaComoDirectorArea: false,
  jefeInmediatoId: "",
  firmaComoJefeInmediato: false,
  firmaComoComplianceLatam: false,
};

/** Roles que pueden firmar como Compliance Officer LATAM (Legal solo, no). */
export function rolPuedeSerComplianceLatam(rol: string): boolean {
  return rol === "compliance" || rol === "legal_compliance";
}

/**
 * Coherencia de las banderas antes de guardar (misma regla que aplica el RPC
 * `actualizar_mis_opciones_firma`): "Firma como director de área" solo tiene
 * sentido si NO es director; "Firma como jefe inmediato" exige un jefe cargado;
 * "Compliance Officer LATAM" solo para Compliance y Legal & Compliance.
 */
function columnasOpcionesFirma(o: OpcionesFirmaPerfil, rol: string, idPropio: string | null): Record<string, unknown> {
  const jefe = o.jefeInmediatoId === JEFE_ES_EL_MISMO ? idPropio : o.jefeInmediatoId || null;
  return {
    area: o.area || null,
    es_director_area: o.esDirectorArea,
    firma_como_director_area: o.esDirectorArea ? false : o.firmaComoDirectorArea,
    jefe_inmediato_id: jefe,
    firma_como_jefe_inmediato: jefe ? o.firmaComoJefeInmediato : false,
    firma_como_compliance_latam: rolPuedeSerComplianceLatam(rol) ? o.firmaComoComplianceLatam : false,
  };
}

/**
 * Las columnas de la entrega 23 solo existen tras ejecutar
 * `db/entrega_23b_*.sql`. Mientras no se haya ejecutado, guardar un usuario NO debe
 * fallar: se reintenta sin esas columnas (los datos nuevos no se guardan y se avisa).
 */
function esColumnaAusente(error: { message?: string } | null): boolean {
  const m = error?.message ?? "";
  return /column|schema cache|does not exist/i.test(m) && /area|es_director_area|firma_como_|jefe_inmediato/i.test(m);
}

async function escribirConOpcionesFirma(
  escribir: (extras: Record<string, unknown>) => PromiseLike<{ error: { message?: string; code?: string } | null }>,
  extras: Record<string, unknown>,
): Promise<{ guardoOpcionesFirma: boolean }> {
  const primero = await escribir(extras);
  if (!primero.error) return { guardoOpcionesFirma: true };
  if (!esColumnaAusente(primero.error)) throw new Error(mensajeErrorAmigable(primero.error));
  const segundo = await escribir({});
  if (segundo.error) throw new Error(mensajeErrorAmigable(segundo.error));
  return { guardoOpcionesFirma: false };
}

/**
 * Campos administrables directamente sobre la tabla `usuarios` — no
 * requieren la función Edge `admin-usuarios` porque no tocan Supabase Auth
 * (a diferencia de crear la cuenta, resetear la contraseña o cambiar el
 * correo de inicio de sesión, que sí la necesitan — ver más abajo).
 */
export interface CambiosPerfilUsuario extends OpcionesFirmaPerfil {
  nombre: string;
  cargo: string;
  telefono: string;
  rol: RolUsuario;
  paginasPermitidas: string[];
  paisesOperacion: string[];
  empresasGrupo: string[];
  esAdministrador: boolean;
  administradorAlcanceLimitado: boolean;
  puedeEliminarDocumentosFirmados: boolean;
  numeroDocumento: string;
  pais: string;
  estadoProvincia: string;
  ciudad: string;
  observaciones: string;
  firmaId: string | null;
  /** Entrega 33: foto de perfil. Se guarda aparte (`guardarFotoUsuario`) para no romper el guardado si falta la columna. */
  fotoId: string | null;
}

export async function actualizarPerfilUsuario(usuarioId: string, cambios: CambiosPerfilUsuario): Promise<{ guardoOpcionesFirma: boolean }> {
  const extras = columnasOpcionesFirma(cambios, cambios.rol, usuarioId);
  return escribirConOpcionesFirma((ex) => supabase
    .from("usuarios")
    .update({
      ...ex,
      nombre: cambios.nombre,
      cargo: cambios.cargo,
      telefono: cambios.telefono || null,
      rol: cambios.rol,
      paginas_permitidas: cambios.paginasPermitidas.length > 0 ? cambios.paginasPermitidas : null,
      paises_operacion: cambios.paisesOperacion.length > 0 ? cambios.paisesOperacion : null,
      empresas_grupo: cambios.empresasGrupo.length > 0 ? cambios.empresasGrupo : null,
      es_administrador: cambios.esAdministrador,
      administrador_alcance_limitado: cambios.administradorAlcanceLimitado,
      puede_eliminar_documentos_firmados: cambios.puedeEliminarDocumentosFirmados,
      numero_documento: cambios.numeroDocumento || null,
      pais: cambios.pais || null,
      estado_provincia: cambios.estadoProvincia || null,
      ciudad: cambios.ciudad || null,
      observaciones: cambios.observaciones || null,
      firma_id: cambios.firmaId,
    })
    .eq("id", usuarioId), extras);
}

/**
 * Habilitar/inhabilitar usuarios (septiembre 2026): a diferencia de
 * `actualizarPerfilUsuario` (los campos del formulario "Editar usuario"),
 * esto se expone como un interruptor directo por fila en la tabla de
 * "Usuarios y Roles" — mismo criterio que `alternarActivo` en
 * `EditorPortafolioProductos.tsx` para productos del portafolio. No toca
 * Supabase Auth (la cuenta de inicio de sesión sigue existiendo) — ver
 * `hooks/useAuth.tsx` para dónde se aplica el efecto real de bloqueo al
 * cargar la sesión, y `db/agregar_activo_usuario.sql` para el límite
 * conocido (no revoca al instante una sesión ya abierta en otra pestaña).
 *
 * El alcance (`AlcanceUsuario`/`dentroDelAlcance` arriba) ya restringe qué
 * filas ve un Administrador de alcance limitado en la pantalla — quien no
 * está en su alcance ni aparece en la tabla, así que no hace falta repetir
 * ese chequeo acá. La única regla que sí vive en la UI (`UsuariosRoles.tsx`)
 * es bloquear que alguien se inhabilite a sí mismo.
 */
export async function cambiarActivoUsuario(usuarioId: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from("usuarios").update({ activo }).eq("id", usuarioId);
  if (error) throw new Error(mensajeErrorAmigable(error));
}

export interface DatosNuevoUsuario extends OpcionesFirmaPerfil {
  nombre: string;
  cargo: string;
  email: string;
  telefono: string;
  rol: RolUsuario;
  iniciales: string;
  paginasPermitidas: string[];
  paisesOperacion: string[];
  empresasGrupo: string[];
  esAdministrador: boolean;
  administradorAlcanceLimitado: boolean;
  puedeEliminarDocumentosFirmados: boolean;
  numeroDocumento: string;
  pais: string;
  estadoProvincia: string;
  ciudad: string;
  observaciones: string;
  firmaId: string | null;
  /** Entrega 33: foto de perfil (ver `CambiosPerfilUsuario.fotoId`). */
  fotoId: string | null;
}

/**
 * Crear un colaborador implica crear su cuenta real en Supabase Auth — eso
 * requiere la service_role key, que nunca debe llegar al navegador, así que
 * pasa por la función Edge `admin-usuarios` (acción `crear_usuario`), no por
 * un `.insert()` directo. La función valida ella misma (con el JWT de quien
 * llama) que sea Dirección Médica o un Administrador, y aplica las reglas
 * de escalamiento de privilegios para administradores de alcance limitado —
 * ver el código fuente real de la función para el detalle completo.
 *
 * FASE 0 (corrección E19, septiembre 2026): este cliente YA NO genera ni
 * envía ninguna contraseña temporal. Al igual que `resetearPasswordUsuario()`
 * más abajo, la contraseña se genera del lado del servidor dentro de la
 * función Edge y se envía directo por correo al colaborador — nunca llega a
 * este cliente ni se muestra en pantalla. Esto requiere actualizar la función
 * Edge real (ver `docs/admin-usuarios-crear_usuario.propuesta.ts`, que no se
 * puede aplicar desde aquí — hay que desplegarla manualmente en Supabase).
 */
export async function crearUsuario(datos: DatosNuevoUsuario, borradorId?: string): Promise<Usuario> {
  const { data, error } = await supabase.functions.invoke("admin-usuarios", {
    body: {
      accion: "crear_usuario",
      nombre: datos.nombre,
      cargo: datos.cargo,
      email: normalizarEmail(datos.email),
      telefono: datos.telefono || undefined,
      rol: datos.rol,
      iniciales: datos.iniciales,
      paginasPermitidas: datos.paginasPermitidas.length > 0 ? datos.paginasPermitidas : undefined,
      paisesOperacion: datos.paisesOperacion,
      empresasGrupo: datos.empresasGrupo,
      esAdministrador: datos.esAdministrador,
      administradorAlcanceLimitado: datos.administradorAlcanceLimitado,
    },
  });
  if (error) throw new Error(await mensajeErrorFuncion(error));
  if (data?.error) throw new Error(data.error);
  const creado = rowToFlat<Usuario>(data.usuario, CAMPOS_USUARIO);

  // Ronda de ajustes de formularios (septiembre 2026), entrega 8: la
  // función Edge `admin-usuarios` (crear_usuario) todavía no conoce las
  // columnas nuevas de esta entrega (numero_documento/pais/estado_provincia/
  // ciudad/observaciones/firma_id) — no se puede modificar/redesplegar
  // desde aquí (mismo criterio que el resto de RPC/Edge reales de esta
  // app). Se completan con un `.update()` directo de seguimiento, mismo
  // mecanismo ya usado por `actualizarPerfilUsuario` — si esto falla, la
  // cuenta ya se creó de todas formas, así que no se revierte nada; solo
  // se avisa.
  try {
    await actualizarPerfilUsuario(creado.id, {
      nombre: datos.nombre,
      cargo: datos.cargo,
      telefono: datos.telefono,
      rol: datos.rol,
      paginasPermitidas: datos.paginasPermitidas,
      paisesOperacion: datos.paisesOperacion,
      empresasGrupo: datos.empresasGrupo,
      esAdministrador: datos.esAdministrador,
      administradorAlcanceLimitado: datos.administradorAlcanceLimitado,
      puedeEliminarDocumentosFirmados: datos.puedeEliminarDocumentosFirmados,
      numeroDocumento: datos.numeroDocumento,
      pais: datos.pais,
      estadoProvincia: datos.estadoProvincia,
      ciudad: datos.ciudad,
      observaciones: datos.observaciones,
      firmaId: datos.firmaId,
      fotoId: datos.fotoId,
      // Entrega 23: Área / jefe inmediato / director de área / Compliance Officer LATAM.
      area: datos.area,
      esDirectorArea: datos.esDirectorArea,
      firmaComoDirectorArea: datos.firmaComoDirectorArea,
      jefeInmediatoId: datos.jefeInmediatoId,
      firmaComoJefeInmediato: datos.firmaComoJefeInmediato,
      firmaComoComplianceLatam: datos.firmaComoComplianceLatam,
    });
  } catch {
    // La cuenta ya existe y el correo con la contraseña temporal ya se
    // envió — un fallo aquí solo significa que estos campos extra quedan
    // vacíos hasta que alguien los edite manualmente después.
  }

  // Si "Confirmar Usuario" partió de un borrador, ese borrador ya cumplió
  // su propósito — se elimina para no dejar una fila duplicada/huérfana
  // (el borrador nunca tuvo cuenta real de Auth, así que borrarlo no
  // afecta nada más).
  if (borradorId) {
    await supabase.from("usuarios").delete().eq("id", borradorId).eq("estado_usuario", "Borrador");
  }

  return { ...creado, ...datos };
}

/**
 * Ronda de ajustes de formularios (septiembre 2026), entrega 8: "Guardar
 * como borrador" — a diferencia de `crearUsuario`, esto NUNCA pasa por la
 * función Edge (no crea ninguna cuenta real de Supabase Auth, no envía
 * ningún correo): es un `.insert()` directo a `usuarios`, con
 * `estado_usuario: 'Borrador'` y `auth_user_id: null`. Ver la nota de
 * seguridad en `db/agregar_campos_nuevo_usuario.sql` — funciona hoy porque
 * esta tabla todavía no tiene RLS real (mismo hallazgo F39 ya documentado).
 */
export async function guardarBorradorUsuario(datos: DatosNuevoUsuario): Promise<Usuario> {
  // Entrega 23: el borrador todavía no tiene id, así que "él mismo como jefe" se resuelve en un
  // segundo paso (abajo). Las columnas nuevas se reintentan sin ellas si la migración falta.
  const extras = columnasOpcionesFirma(datos, datos.rol, null);
  const insertar = (ex: Record<string, unknown>) => supabase
    .from("usuarios")
    .insert({
      ...ex,
      nombre: datos.nombre,
      cargo: datos.cargo,
      email: normalizarEmail(datos.email),
      telefono: datos.telefono || null,
      rol: datos.rol,
      iniciales: datos.iniciales,
      paginas_permitidas: datos.paginasPermitidas.length > 0 ? datos.paginasPermitidas : null,
      paises_operacion: datos.paisesOperacion.length > 0 ? datos.paisesOperacion : null,
      empresas_grupo: datos.empresasGrupo.length > 0 ? datos.empresasGrupo : null,
      es_administrador: datos.esAdministrador,
      administrador_alcance_limitado: datos.administradorAlcanceLimitado,
      puede_eliminar_documentos_firmados: datos.puedeEliminarDocumentosFirmados,
      numero_documento: datos.numeroDocumento || null,
      pais: datos.pais || null,
      estado_provincia: datos.estadoProvincia || null,
      ciudad: datos.ciudad || null,
      observaciones: datos.observaciones || null,
      firma_id: datos.firmaId,
      estado_usuario: "Borrador",
      debe_cambiar_password: false,
      auth_user_id: null,
    })
    .select("*")
    .single();
  let { data, error } = await insertar(extras);
  if (error && esColumnaAusente(error)) ({ data, error } = await insertar({}));
  if (error) throw new Error(mensajeErrorAmigable(error));
  const creado = rowToFlat<Usuario>(data, CAMPOS_USUARIO);
  if (datos.jefeInmediatoId === JEFE_ES_EL_MISMO) {
    await supabase.from("usuarios").update({ jefe_inmediato_id: creado.id, firma_como_jefe_inmediato: datos.firmaComoJefeInmediato }).eq("id", creado.id);
    creado.jefeInmediatoId = creado.id;
  }
  return creado;
}

/** Guarda cambios sobre un borrador ya existente — repetible las veces que haga falta antes de confirmarlo. */
export async function editarBorradorUsuario(usuarioId: string, datos: DatosNuevoUsuario): Promise<void> {
  const extras = columnasOpcionesFirma(datos, datos.rol, usuarioId);
  await escribirConOpcionesFirma((ex) => supabase
    .from("usuarios")
    .update({
      ...ex,
      nombre: datos.nombre,
      cargo: datos.cargo,
      email: normalizarEmail(datos.email),
      telefono: datos.telefono || null,
      rol: datos.rol,
      paginas_permitidas: datos.paginasPermitidas.length > 0 ? datos.paginasPermitidas : null,
      paises_operacion: datos.paisesOperacion.length > 0 ? datos.paisesOperacion : null,
      empresas_grupo: datos.empresasGrupo.length > 0 ? datos.empresasGrupo : null,
      es_administrador: datos.esAdministrador,
      administrador_alcance_limitado: datos.administradorAlcanceLimitado,
      puede_eliminar_documentos_firmados: datos.puedeEliminarDocumentosFirmados,
      numero_documento: datos.numeroDocumento || null,
      pais: datos.pais || null,
      estado_provincia: datos.estadoProvincia || null,
      ciudad: datos.ciudad || null,
      observaciones: datos.observaciones || null,
      firma_id: datos.firmaId,
    })
    .eq("id", usuarioId)
    .eq("estado_usuario", "Borrador"), extras);
}

/**
 * Restablece la contraseña de un colaborador. Por diseño (ver la función
 * Edge), la nueva contraseña NUNCA llega a este cliente — se genera del
 * lado del servidor y se envía directo por correo al colaborador. Quien
 * llama a esta función solo sabe si la operación tuvo éxito o no.
 */
export async function resetearPasswordUsuario(usuarioId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("admin-usuarios", {
    body: { accion: "resetear_password", usuarioId },
  });
  if (error) throw new Error(await mensajeErrorFuncion(error));
  if (data?.error) throw new Error(data.error);
}

/**
 * Cambia el correo de INICIO DE SESIÓN (Supabase Auth) antes de guardar el
 * cambio en la tabla `usuarios` — si la función Edge falla, no se guarda el
 * cambio, para que ambos correos nunca queden desincronizados (ver
 * comentario en la función Edge).
 */
export async function actualizarEmailUsuario(usuarioId: string, nuevoEmail: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("admin-usuarios", {
    body: { accion: "actualizar_email", usuarioId, nuevoEmail: normalizarEmail(nuevoEmail) },
  });
  if (error) throw new Error(await mensajeErrorFuncion(error));
  if (data?.error) throw new Error(data.error);
  const { error: errorTabla } = await supabase.from("usuarios").update({ email: normalizarEmail(nuevoEmail) }).eq("id", usuarioId);
  if (errorTabla) throw new Error(mensajeErrorAmigable(errorTabla));
}

/** `supabase.functions.invoke` no siempre trae el cuerpo del error de la función en `error.message` — se intenta leer el JSON de la respuesta real primero. */
async function mensajeErrorFuncion(error: unknown): Promise<string> {
  const conContexto = error as { context?: Response; message?: string };
  if (conContexto?.context && typeof conContexto.context.json === "function") {
    try {
      const cuerpo = await conContexto.context.json();
      if (cuerpo?.error) return cuerpo.error as string;
    } catch {
      // el cuerpo no era JSON — se usa el mensaje genérico de abajo.
    }
  }
  return conContexto?.message ?? "No se pudo completar la operación.";
}

function filaASolicitud(fila: Record<string, unknown>): SolicitudRestablecimientoPassword {
  return {
    id: fila.id as string,
    usuarioId: fila.usuario_id as string,
    creadaEn: fila.creada_en as string,
    resuelta: Boolean(fila.resuelta),
    resueltaEn: (fila.resuelta_en as string) ?? null,
  };
}

export async function traerSolicitudesRestablecimiento(): Promise<SolicitudRestablecimientoPassword[]> {
  const { data, error } = await supabase
    .from("solicitudes_restablecimiento_password")
    .select("*")
    .order("creada_en", { ascending: false });
  if (error) throw new Error(mensajeErrorAmigable(error));
  return (data ?? []).map(filaASolicitud);
}

/**
 * Un colaborador sin sesión pide que se le restablezca la contraseña (ver
 * el enlace "¿Olvidaste tu contraseña?" en `PantallaLogin.tsx`). Sin sesión
 * no hay forma de que RLS le deje escribir directamente en
 * `solicitudes_restablecimiento_password` (mismo criterio de seguridad que
 * ya se confirmó para resolver una etapa de aprobación o abrir una ventana
 * de adenda: nunca un `.insert()`/`.update()` directo para una operación
 * sensible desde una sesión no autorizada) — se modela como una RPC
 * `SECURITY DEFINER` que busca el usuario por correo y crea la solicitud.
 * No es un detalle confirmado por el bundle original (no había evidencia
 * puntual de esta pantalla) sino la inferencia más consistente con el resto
 * de la arquitectura ya confirmada de la app.
 */
export async function solicitarRestablecimientoPassword(email: string): Promise<void> {
  const { error } = await supabase.rpc("solicitar_restablecimiento_password", { p_email: email.trim() });
  if (error) throw new Error(error.message);
}

export async function marcarSolicitudResuelta(id: string): Promise<void> {
  const { error } = await supabase
    .from("solicitudes_restablecimiento_password")
    .update({ resuelta: true, resuelta_en: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(mensajeErrorAmigable(error));
}

// ---------------------------------------------------------------------------
// Entrega 23 — autoservicio de opciones de firma y directorio mínimo
// ---------------------------------------------------------------------------

/** Persona elegible como jefe inmediato (datos mínimos, sin información sensible). */
export interface EntradaDirectorio {
  id: string;
  nombre: string;
  cargo: string;
  area: string;
  esDirectorArea: boolean;
}

/**
 * Lista mínima de colaboradores activos para el desplegable "Jefe inmediato". Usa el RPC
 * `directorio_usuarios` (cualquier usuario autenticado puede leerlo); si el RPC todavía
 * no existe (migración 23b sin ejecutar) se cae a la lectura directa de `usuarios`.
 */
export async function traerDirectorioUsuarios(): Promise<EntradaDirectorio[]> {
  const { data, error } = await supabase.rpc("directorio_usuarios");
  if (!error && Array.isArray(data)) {
    return (data as Record<string, unknown>[]).map((f) => ({
      id: f.id as string,
      nombre: (f.nombre as string) ?? "",
      cargo: (f.cargo as string) ?? "",
      area: (f.area as string) ?? "",
      esDirectorArea: Boolean(f.es_director_area),
    }));
  }
  const { data: filas, error: errorTabla } = await supabase.from("usuarios").select("id, nombre, cargo, activo").order("nombre", { ascending: true });
  if (errorTabla) throw new Error(mensajeErrorAmigable(errorTabla));
  return (filas ?? [])
    .filter((f) => (f as { activo?: boolean }).activo !== false)
    .map((f) => ({ id: f.id as string, nombre: (f.nombre as string) ?? "", cargo: (f.cargo as string) ?? "", area: "", esDirectorArea: false }));
}

/**
 * El propio usuario ajusta SUS opciones de firma (jefe inmediato y las tres habilitaciones
 * "Firma como…"). Pasa por el RPC `actualizar_mis_opciones_firma`, que solo toca esas columnas
 * de su propia fila — el resto del perfil (rol, área, director de área, privilegios) sigue
 * reservado a Dirección Médica / Administrador.
 */
export async function actualizarMisOpcionesFirma(opciones: {
  jefeInmediatoId: string;
  firmaComoJefeInmediato: boolean;
  firmaComoDirectorArea: boolean;
  firmaComoComplianceLatam: boolean;
}): Promise<void> {
  const { error } = await supabase.rpc("actualizar_mis_opciones_firma", {
    p_jefe_inmediato_id: opciones.jefeInmediatoId || null,
    p_firma_como_jefe_inmediato: opciones.firmaComoJefeInmediato,
    p_firma_como_director_area: opciones.firmaComoDirectorArea,
    p_firma_como_compliance_latam: opciones.firmaComoComplianceLatam,
  });
  if (error) {
    if (/actualizar_mis_opciones_firma|schema cache|could not find the function/i.test(error.message)) {
      throw new Error("Falta ejecutar la migración db/entrega_23b_roles_legal_compliance_perfil.sql en la base de datos.");
    }
    throw new Error(mensajeErrorAmigable(error));
  }
}

/**
 * Entrega 28 — el propio usuario guarda SUS preferencias de visualización (hoy: meses para archivar documentos de eventos
 * finalizados). Pasa por el RPC `actualizar_mis_preferencias` (`db/entrega_28_preferencias_usuario.sql`). Si esa migración
 * todavía no se ha ejecutado devuelve `enPerfil: false` en vez de fallar, y quien llama la guarda en el navegador.
 */
export async function guardarMisPreferencias(preferencias: { archivarDocumentosMeses: number }): Promise<{ enPerfil: boolean }> {
  const { error } = await supabase.rpc("actualizar_mis_preferencias", {
    p_archivar_documentos_meses: preferencias.archivarDocumentosMeses,
  });
  if (!error) return { enPerfil: true };
  if (/actualizar_mis_preferencias|schema cache|could not find the function|does not exist/i.test(error.message)) return { enPerfil: false };
  throw new Error(mensajeErrorAmigable(error));
}
