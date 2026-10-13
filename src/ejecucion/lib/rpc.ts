// Acceso a datos de "BEATS — Ejecución en Sitio". Por diseño (confirmado en
// el plan de reconstrucción y coherente con que esta app no tiene sesión de
// usuario / RLS de por medio) TODO el acceso a datos pasa por las 4 RPC que
// ya existen y funcionan en el proyecto real de Supabase — nunca `.from()`
// directo sobre una tabla. El código fuente real de las 4 funciones fue
// exportado por el usuario con `pg_get_functiondef` y es la fuente de
// verdad para: nombres/orden de parámetros, mensajes de error (reproducidos
// aquí LITERALMENTE, en español, porque la UI los muestra tal cual) y forma
// exacta de la respuesta (columnas en snake_case a nivel de fila, pero con
// claves ya en camelCase dentro de los `jsonb_build_object` que arma la
// propia función — no hay que "adivinar" un mapeo ahí, se respeta el que ya
// trae la función).
import { supabase } from "@/lib/supabaseClient";
import { mensajeErrorAmigable } from "@/lib/supabaseClient";
import { aMayusculas, normalizarEmail } from "@/lib/normalizarTexto";

/**
 * Todas las llamadas de esta app pasan por aquí para poder distinguir, de
 * forma consistente, un fallo de RED (candidato a la cola offline — ver
 * `colaOffline.ts`) de un rechazo de NEGOCIO que la propia función devolvió
 * (p.ej. "Código inválido o expirado.") — un rechazo de negocio no se
 * arregla reintentando, así que nunca se encola.
 */
export class ErrorEjecucion extends Error {
  esFalloDeRed: boolean;
  constructor(mensaje: string, esFalloDeRed: boolean) {
    super(mensaje);
    this.name = "ErrorEjecucion";
    this.esFalloDeRed = esFalloDeRed;
  }
}

function esMensajeDeFalloDeRed(mensaje: string): boolean {
  return /failed to fetch|networkerror|network request failed|load failed|net::/i.test(mensaje);
}

async function llamarRpc<T>(nombre: string, params: Record<string, unknown>): Promise<T> {
  let resultado: { data: unknown; error: { message: string } | null };
  try {
    resultado = await supabase.rpc(nombre, params);
  } catch (e) {
    // La propia llamada `fetch` rechazó (típico de estar sin conexión) antes
    // de que supabase-js alcanzara a construir una respuesta con `{error}`.
    throw new ErrorEjecucion(mensajeErrorAmigable(e), true);
  }
  if (resultado.error) {
    const mensaje = resultado.error.message ?? "Ocurrió un error inesperado.";
    if (esMensajeDeFalloDeRed(mensaje)) {
      throw new ErrorEjecucion(
        "No hay conexión a internet. La operación se guardó y se sincronizará automáticamente.",
        true,
      );
    }
    throw new ErrorEjecucion(mensaje, false);
  }
  return resultado.data as T;
}

async function llamarRpcUnaFila<T>(nombre: string, params: Record<string, unknown>): Promise<T> {
  let resultado: { data: unknown; error: { message: string } | null };
  try {
    resultado = await supabase.rpc(nombre, params).single();
  } catch (e) {
    throw new ErrorEjecucion(mensajeErrorAmigable(e), true);
  }
  if (resultado.error) {
    const mensaje = resultado.error.message ?? "Ocurrió un error inesperado.";
    if (esMensajeDeFalloDeRed(mensaje)) {
      throw new ErrorEjecucion(
        "No hay conexión a internet. Verifica la red e inténtalo de nuevo.",
        true,
      );
    }
    throw new ErrorEjecucion(mensaje, false);
  }
  return resultado.data as T;
}

/** Producto planeado para el evento — tal como lo arma `jsonb_build_object` dentro de `validar_codigo_evento_ejecucion` (claves ya en camelCase). */
export interface ProductoPlaneadoEjecucion {
  productoId: string;
  nombre: string;
  cantidadAproximada: number | null;
}

export interface SesionEventoEjecucion {
  id: string;
  fecha: string | null;
  lugar: string;
}

/** Fila cruda que devuelve PostgREST para `validar_codigo_evento_ejecucion` (columnas en snake_case). */
interface FilaValidarCodigo {
  token: string;
  evento_id: string;
  nombre_evento: string;
  entrega_muestras_medicas: boolean;
  productos_planeados: ProductoPlaneadoEjecucion[] | null;
  especialidades: string[] | null;
  declaracion_tratamiento_datos: string | null;
  modalidad_sesiones: string;
  sesiones: SesionEventoEjecucion[] | null;
  participacion_academica: boolean;
  tipos_documento: string[] | null;
}

/** Estado de trabajo ya validado — lo que queda activo en esta app mientras dura la sesión de ejecución (persistido en localStorage, ver `sesion.ts`). */
export interface SesionEjecucionActiva {
  token: string;
  eventoId: string;
  nombreEvento: string;
  entregaMuestrasMedicas: boolean;
  productosPlaneados: ProductoPlaneadoEjecucion[];
  especialidades: string[];
  declaracionTratamientoDatos: string;
  modalidadSesiones: string;
  sesiones: SesionEventoEjecucion[];
  participacionAcademica: boolean;
  tiposDocumento: string[];
  responsableNombre: string;
}

/**
 * `validar_codigo_evento_ejecucion(p_codigo, p_responsable_nombre)` — punto
 * de entrada sin login de la app: valida el código de
 * `eventos_codigos_acceso`, abre una nueva fila en
 * `sesiones_ejecucion_evento` (SIEMPRE inserta una nueva, nunca reutiliza
 * una existente) y devuelve el `token` de esa sesión más todo el contexto
 * del evento que el resto del formulario necesita.
 */
export async function validarCodigoEjecucion(
  codigo: string,
  responsableNombre: string,
): Promise<SesionEjecucionActiva> {
  const fila = await llamarRpcUnaFila<FilaValidarCodigo>("validar_codigo_evento_ejecucion", {
    p_codigo: codigo.trim(),
    p_responsable_nombre: aMayusculas(responsableNombre.trim()),
  });
  return {
    token: fila.token,
    eventoId: fila.evento_id,
    nombreEvento: fila.nombre_evento,
    entregaMuestrasMedicas: fila.entrega_muestras_medicas,
    productosPlaneados: fila.productos_planeados ?? [],
    especialidades: fila.especialidades ?? [],
    declaracionTratamientoDatos: fila.declaracion_tratamiento_datos ?? "",
    modalidadSesiones: fila.modalidad_sesiones,
    sesiones: fila.sesiones ?? [],
    participacionAcademica: fila.participacion_academica,
    tiposDocumento: fila.tipos_documento ?? [],
    responsableNombre: responsableNombre.trim(),
  };
}

/** Los únicos 2 valores que ofrece el formulario nuevo (`FormularioCheckIn`) — `'taller'` sigue siendo válido a nivel de función/BD por compatibilidad con datos históricos, pero ya no se ofrece aquí (ver la nota de cabecera de `crear_registro_participacion` en el código fuente real). */
export const TIPO_PARTICIPACION_EJECUCION = ["evento", "stand"] as const;
export type TipoParticipacionEjecucion = (typeof TIPO_PARTICIPACION_EJECUCION)[number];

export const PROFESION_EJECUCION = ["medico", "no_medico"] as const;
export type ProfesionEjecucion = (typeof PROFESION_EJECUCION)[number];

export const INTERES_VISITA_MEDICA = ["si", "no", "ya_recibe"] as const;
export type InteresVisitaMedica = (typeof INTERES_VISITA_MEDICA)[number];

export interface DatosCheckIn {
  nombres: string;
  apellidos: string;
  cedula: string;
  tipoDocumento: string;
  profesion: ProfesionEjecucion;
  profesionDetalle: string;
  especialidad: string;
  especialidadOtra: string;
  celular: string;
  email: string;
  autorizaImagenVoz: boolean;
  autorizaDatosPersonales: boolean;
  firmaDataUrl: string;
  interesVisitaMedica: InteresVisitaMedica;
  direccion: string;
  pais: string;
  /** Octubre 2026: Estado/Provincia/Departamento (obligatorio en el formulario). Ver `registrarEstadoProvinciaParticipacion`. */
  estadoProvincia: string;
  ciudad: string;
  tipoParticipacion: TipoParticipacionEjecucion;
  sesionId: string | null;
}

/**
 * `crear_registro_participacion(...)` — inserta el registro de asistencia
 * (más el archivo de firma en `archivos_adjuntos`) y devuelve el `uuid`
 * generado, que es la única forma (dado que esta app solo puede leer/
 * escribir vía RPC) de obtener un `p_registro_participacion_id` válido para
 * después llamar `registrar_muestra_entregada`.
 */
export async function crearRegistroParticipacion(token: string, datos: DatosCheckIn): Promise<string> {
  const registroId = await llamarRpc<string>("crear_registro_participacion", {
    p_token: token,
    p_nombres: aMayusculas(datos.nombres.trim()),
    p_apellidos: aMayusculas(datos.apellidos.trim()),
    p_cedula: aMayusculas(datos.cedula.trim()),
    p_tipo_documento: datos.tipoDocumento,
    p_profesion: datos.profesion,
    p_profesion_detalle: aMayusculas(datos.profesionDetalle ?? ""),
    p_especialidad: datos.especialidad,
    p_especialidad_otra: aMayusculas(datos.especialidadOtra ?? ""),
    p_celular: datos.celular,
    p_email: normalizarEmail(datos.email),
    p_autoriza_imagen_voz: datos.autorizaImagenVoz,
    p_autoriza_datos_personales: datos.autorizaDatosPersonales,
    p_firma_data_url: datos.firmaDataUrl,
    p_interes_visita_medica: datos.interesVisitaMedica,
    p_direccion: aMayusculas(datos.direccion ?? ""),
    p_pais: datos.pais,
    p_ciudad: datos.ciudad,
    p_tipo_participacion: datos.tipoParticipacion,
    p_sesion_id: datos.sesionId,
  });
  await registrarEstadoProvinciaParticipacion(token, registroId, datos.estadoProvincia);
  return registroId;
}

/**
 * Octubre 2026 — "Estado/Provincia/Departamento" del participante.
 *
 * `crear_registro_participacion` no tiene ese parámetro y no se modifica (su
 * código fuente real no está en este repositorio, y reescribirla "a ciegas"
 * podría romper el check-in). En su lugar, una RPC NUEVA y aparte
 * (`registrar_estado_provincia_participacion`, ver `db/agregar_ajustes_ejecucion_expediente.sql`)
 * completa la columna `registros_participacion.estado_provincia` de la fila
 * recién creada. Es "mejor esfuerzo": si la migración todavía no se aplicó, o
 * la llamada falla, el registro de asistencia YA quedó guardado y NO se
 * revierte ni se encola de nuevo (duplicaría a la persona); solo se avisa por
 * consola.
 */
export async function registrarEstadoProvinciaParticipacion(token: string, registroId: string, estadoProvincia: string | undefined): Promise<void> {
  // `undefined` = ítem de la cola offline creado antes de existir este campo.
  const estado = (estadoProvincia ?? "").trim();
  if (!estado) return;
  const parametros = { p_token: token, p_registro_participacion_id: registroId, p_estado_provincia: estado };
  for (let intento = 0; intento < 2; intento++) {
    try {
      await llamarRpc<unknown>("registrar_estado_provincia_participacion", parametros);
      return;
    } catch (e) {
      if (intento === 1) console.warn("No se pudo guardar el Estado/Provincia/Departamento del participante (¿falta aplicar la migración?):", e);
    }
  }
}

export interface ItemMuestraEntrega {
  productoId: string;
  cantidad: number;
}

/**
 * `registrar_muestra_entregada(...)` — valida el lote COMPLETO antes de
 * insertar nada (todo o nada) y rechaza cualquier producto que ese mismo
 * médico (por cédula, en este evento) ya hubiera recibido, con el mensaje
 * exacto `Este médico ya recibió muestra de "<producto>" en este evento.
 * No se puede registrar de nuevo.` — ese es un rechazo de NEGOCIO (no se
 * encola, ver `ErrorEjecucion.esFalloDeRed`).
 */
export async function registrarMuestraEntregada(
  token: string,
  registroParticipacionId: string,
  items: ItemMuestraEntrega[],
  firmaDataUrl: string,
): Promise<string[]> {
  return llamarRpc<string[]>("registrar_muestra_entregada", {
    p_token: token,
    p_registro_participacion_id: registroParticipacionId,
    p_items: items.map((i) => ({ productoId: i.productoId, cantidad: i.cantidad })),
    p_firma_data_url: firmaDataUrl,
  });
}

// --- Octubre 2026 (Expediente del evento): fuerza de ventas y fotos ----------
// Dos RPC NUEVAS (ver `db/agregar_expediente_evento.sql`) — no tocan las 4 que
// ya existen. Igual que el resto de esta app, TODO pasa por RPC.

export interface DatosFuerzaVentas {
  nombre: string;
  cargo: string;
  ciudad: string;
  sesionId: string | null;
}

/** `registrar_fuerza_ventas_ejecucion(...)` — anota a una persona de la fuerza de ventas presente en el evento. */
export async function registrarFuerzaVentas(token: string, datos: DatosFuerzaVentas): Promise<string> {
  return llamarRpc<string>("registrar_fuerza_ventas_ejecucion", {
    p_token: token,
    p_nombre: aMayusculas(datos.nombre.trim()),
    p_cargo: aMayusculas(datos.cargo.trim()),
    p_ciudad: aMayusculas(datos.ciudad.trim()),
    p_sesion_id: datos.sesionId,
  });
}

export type MarcoFotoEjecucion = "grupal" | "actividad_1" | "actividad_2" | "speaker";

export interface FotoEventoEjecucion {
  etiqueta: MarcoFotoEjecucion;
  archivoId: string;
  dataUrl: string;
  /** Octubre 2026: sesión a la que pertenece la foto (`null` = evento de sesión única). */
  sesionId?: string | null;
}

/** `listar_fotos_evento_ejecucion(p_token)` — las fotos del evento ya guardadas (para saber qué marcos faltan). */
export async function listarFotosEvento(token: string): Promise<FotoEventoEjecucion[]> {
  const filas = await llamarRpc<FotoEventoEjecucion[] | null>("listar_fotos_evento_ejecucion", { p_token: token });
  return filas ?? [];
}

/** `registrar_foto_evento_ejecucion(...)` — guarda (o reemplaza) la foto de un marco; el servidor impone el máximo de 4. */
export async function registrarFotoEvento(
  token: string,
  datos: { etiqueta: MarcoFotoEjecucion; dataUrl: string; nombre: string; tipo: string; tamanoBytes: number; sesionId?: string | null },
): Promise<string> {
  return llamarRpc<string>("registrar_foto_evento_ejecucion", {
    p_token: token,
    p_etiqueta: datos.etiqueta,
    p_data_url: datos.dataUrl,
    p_nombre: datos.nombre,
    p_tipo: datos.tipo,
    p_tamano_bytes: datos.tamanoBytes,
    p_sesion_id: datos.sesionId ?? null,
  });
}
