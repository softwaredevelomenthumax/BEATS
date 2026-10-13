import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";
import { rowToFlat, t, s0, b, arr, type FieldSpec, em } from "@/lib/dbMapping";
import { construirCSV } from "@/lib/csv";
import type { Speaker } from "@/types";

/**
 * Resumen mínimo de `speakers`, usado como selector de referencia (FK) en
 * los formularios de Convenio de Pago a HCP, Convenio HCP y Evento
 * (participación académica). El Repositorio de Speakers completo (CRUD,
 * vigencia RETHUS/hoja de vida) vive más abajo en este mismo archivo
 * (Fase 5).
 */
export interface SpeakerResumen {
  id: string;
  nombreCompleto: string;
  numeroDocumento: string;
  especialidad: string;
}

export async function traerSpeakersResumen(): Promise<SpeakerResumen[]> {
  const { data, error } = await supabase
    .from("speakers")
    .select("id, nombre_completo, numero_documento, especialidad")
    .order("nombre_completo", { ascending: true });
  if (error) throw new Error(mensajeErrorAmigable(error));
  return (data ?? []).map((fila) => ({
    id: fila.id as string,
    nombreCompleto: fila.nombre_completo as string,
    numeroDocumento: (fila.numero_documento as string) ?? "",
    especialidad: (fila.especialidad as string) ?? "",
  }));
}

/**
 * Ronda de ajustes de formularios (septiembre 2026): en varios formularios
 * (Evento, Convenio de Pago a HCP, FMV, CAF) el selector de HCP/Speaker
 * debe mostrar "Nombre completo, Número de documento, Especialidad"
 * concatenados — centralizado aquí para no repetir el formato en cada
 * formulario.
 */
export function etiquetaSpeakerResumen(s: SpeakerResumen): string {
  const partes = [s.nombreCompleto, s.numeroDocumento, s.especialidad].filter(Boolean);
  return partes.join(", ");
}

const CAMPOS_SPEAKER: FieldSpec[] = [
  t("id"),
  t("nombre_completo", "nombreCompleto"),
  t("numero_documento", "numeroDocumento"),
  t("profesion"),
  t("especialidad"),
  s0("foto_id", "fotoId"),
  t("direccion"),
  t("pais"),
  t("estado_provincia", "estadoProvincia"),
  t("ciudad"),
  t("telefono"),
  em("email"),
  t("licencia_rethus", "licenciaRethus"),
  s0("fecha_vencimiento_rethus", "fechaVencimientoRethus"),
  b("rethus_indefinido", "rethusIndefinido"),
  s0("archivo_rethus_id", "archivoRethusId"),
  b("hoja_vida_adjunta", "hojaVidaAdjunta"),
  s0("fecha_actualizacion_hoja_vida", "fechaActualizacionHojaVida"),
  s0("archivo_hoja_vida_id", "archivoHojaVidaId"),
  s0("archivo_identidad_id", "archivoIdentidadId"),
  arr("empresas_grupo_interaccion", "empresasGrupoInteraccion"),
  t("notas"),
  t("estado"),
  t("creado_por_id", "creadoPorId"),
  t("actualizado_en", "actualizadoEn"),
];

/**
 * Fase 4 (precargado automático entre formularios): trae un solo Speaker
 * completo por id — usada por Nuevo Convenio de Pago a HCP y Nuevo
 * Convenio HCP al elegir "Speaker" (el selector solo tiene el
 * `SpeakerResumen` liviano — id/nombre/especialidad — para listar
 * opciones, no el resto de los datos de contacto que hacen falta para
 * precargar).
 */
export async function traerSpeakerPorId(id: string): Promise<Speaker | null> {
  const { data, error } = await supabase.from("speakers").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(mensajeErrorAmigable(error));
  if (!data) return null;
  return rowToFlat<Speaker>(data, CAMPOS_SPEAKER);
}

export async function traerSpeakers(): Promise<Speaker[]> {
  const { data, error } = await supabase
    .from("speakers")
    .select("*")
    .order("nombre_completo", { ascending: true });
  if (error) throw new Error(mensajeErrorAmigable(error));
  return (data ?? []).map((fila) => rowToFlat<Speaker>(fila, CAMPOS_SPEAKER));
}

/**
 * Ronda de ajustes de formularios (septiembre 2026): antes de esta ronda,
 * `guardarSpeaker` no persistía `foto_id`, `estado_provincia`,
 * `archivo_rethus_id`, `archivo_hoja_vida_id` ni `archivo_identidad_id` —
 * el formulario los mostraba y dejaba editar, pero se perdían al guardar
 * (hallazgo encontrado al construir el resto de esta entrega). Esta
 * versión los persiste todos, además de los campos nuevos de esta ronda
 * (`profesion`, `empresasGrupoInteraccion`, `estado`).
 *
 * `guardarComoBorrador`: "Guardar como borrador"/"Confirmar speaker",
 * mismo patrón que Nuevo Usuario (entrega 8) — un Borrador se guarda sin
 * pasar la validación completa (ver `calcularErroresSpeaker`); default
 * `false` para no romper las llamadas existentes (edición desde el
 * Repositorio de Speakers, que siempre confirma).
 */
export async function guardarSpeaker(speaker: Partial<Speaker>, actorId: string, guardarComoBorrador = false): Promise<void> {
  const fila: Record<string, unknown> = {
    nombre_completo: speaker.nombreCompleto ?? "",
    numero_documento: speaker.numeroDocumento ?? "",
    profesion: speaker.profesion ?? "",
    especialidad: speaker.especialidad ?? "",
    foto_id: speaker.fotoId || null,
    direccion: speaker.direccion ?? "",
    pais: speaker.pais ?? "",
    estado_provincia: speaker.estadoProvincia ?? "",
    ciudad: speaker.ciudad ?? "",
    telefono: speaker.telefono ?? "",
    email: speaker.email ?? "",
    licencia_rethus: speaker.licenciaRethus ?? "",
    fecha_vencimiento_rethus: speaker.rethusIndefinido ? null : speaker.fechaVencimientoRethus || null,
    rethus_indefinido: speaker.rethusIndefinido ?? false,
    archivo_rethus_id: speaker.archivoRethusId || null,
    hoja_vida_adjunta: speaker.hojaVidaAdjunta ?? false,
    fecha_actualizacion_hoja_vida: speaker.fechaActualizacionHojaVida || null,
    archivo_hoja_vida_id: speaker.archivoHojaVidaId || null,
    archivo_identidad_id: speaker.archivoIdentidadId || null,
    empresas_grupo_interaccion: speaker.empresasGrupoInteraccion ?? [],
    notas: speaker.notas ?? "",
    estado: guardarComoBorrador ? "Borrador" : "Confirmado",
    actualizado_en: new Date().toISOString(),
  };
  if (speaker.id) {
    const { error } = await supabase.from("speakers").update(fila).eq("id", speaker.id);
    if (error) throw new Error(mensajeErrorAmigable(error));
  } else {
    const { error } = await supabase.from("speakers").insert({ ...fila, creado_por_id: actorId });
    if (error) throw new Error(mensajeErrorAmigable(error));
  }
}

const ETIQUETA_CAMPO_SPEAKER: Record<string, string> = {
  nombreCompleto: "Nombre completo",
  numeroDocumento: "Número de documento",
  profesion: "Profesión",
  especialidad: "Especialidad",
  pais: "País",
  estadoProvincia: "Estado/Provincia/Departamento",
  ciudad: "Ciudad",
  telefono: "Teléfono",
  email: "Correo electrónico",
  licenciaRethus: "Licencia RETHUS / Cédula profesional",
};

/**
 * Validación completa para "Confirmar speaker" — "Guardar como borrador"
 * no pasa por aquí (mismo criterio que Nuevo Usuario/FMV/CAF: un borrador
 * se guarda con lo que haya, la validación se exige recién al confirmar).
 */
export function calcularErroresSpeaker(datos: Partial<Speaker>): Record<string, string> {
  const errores: Record<string, string> = {};
  const requerido = (clave: keyof Speaker) => {
    if (!String(datos[clave] ?? "").trim()) {
      errores[clave] = `${ETIQUETA_CAMPO_SPEAKER[clave] ?? clave} es obligatorio.`;
    }
  };

  requerido("nombreCompleto");
  requerido("numeroDocumento");
  // Corrección (octubre 2026), pedido explícito del usuario: "Profesión"
  // pasa a ser obligatoria en Nuevo Speaker (antes se podía confirmar el
  // speaker sin ella).
  requerido("profesion");
  requerido("especialidad");
  requerido("pais");
  requerido("estadoProvincia");
  requerido("ciudad");
  requerido("telefono");
  requerido("email");
  requerido("licenciaRethus");

  if (datos.email && !/^\S+@\S+\.\S+$/.test(datos.email.trim())) {
    errores.email = "El correo electrónico no es válido.";
  }
  if (!datos.rethusIndefinido && !datos.fechaVencimientoRethus) {
    errores.fechaVencimientoRethus = "Indica la fecha de vencimiento o marca vigencia indefinida.";
  }
  if (!datos.empresasGrupoInteraccion || datos.empresasGrupoInteraccion.length === 0) {
    errores.empresasGrupoInteraccion = "Selecciona al menos una empresa del grupo con la que tendrá interacción.";
  }

  // Pedido explícito del usuario (septiembre 2026): "Hoja de Vida / CV",
  // "Licencia RETHUS / Cédula profesional" y "Documento de identidad" son
  // campos obligatorios (marcados con *) — los tres documentos adjuntos, no
  // solo el número de licencia (que ya era obligatorio arriba). Se exige
  // también la fecha de actualización de la Hoja de Vida en cuanto se
  // adjunta, porque sin ella no se puede calcular el semáforo de vigencia.
  if (!datos.archivoHojaVidaId) {
    errores.archivoHojaVidaId = "La Hoja de Vida / CV es obligatoria.";
  } else if (!datos.fechaActualizacionHojaVida) {
    errores.fechaActualizacionHojaVida = "Indica la fecha de actualización de la Hoja de Vida.";
  }
  if (!datos.archivoRethusId) {
    errores.archivoRethusId = "El documento de la Licencia RETHUS / Cédula profesional es obligatorio.";
  }
  if (!datos.archivoIdentidadId) {
    errores.archivoIdentidadId = "El documento de identidad es obligatorio.";
  }

  return errores;
}

export async function eliminarSpeaker(id: string): Promise<void> {
  const { error } = await supabase.from("speakers").delete().eq("id", id);
  if (error) throw new Error(mensajeErrorAmigable(error));
}

export type EstadoVigencia = "vigente" | "porVencer" | "vencido" | "indefinido" | "sinDatos";

const DIAS_ALERTA_VENCIMIENTO = 60;

// Regla del semáforo — pedido explícito del usuario (septiembre 2026),
// confirmado por su respuesta a la pregunta de aclaración sobre RETHUS:
// "Mientras no llegue la fecha de vencimiento, la licencia estará vigente.
// Si la fecha de vencimiento es igual a la fecha actual o anterior a la
// fecha actual, se debe marcar como 'Requiere revisión'." — el corte es
// estricto en el día de hoy (`diasRestantes <= 0`, no `< 0` como antes de
// esta ronda), sin importar cuántos días falten. "Próximo a vencer" se deja
// como una alerta previa informativa (últimos `DIAS_ALERTA_VENCIMIENTO`
// días) que NO cambia la clasificación vigente/vencido en sí — solo avisa
// con antelación — así que sigue contando como "no vencido todavía".
function calcularVigenciaPorFecha(fecha: string | null, indefinido: boolean): EstadoVigencia {
  if (indefinido) return "indefinido";
  if (!fecha) return "sinDatos";
  const hoy = new Date();
  const vencimiento = new Date(`${fecha}T00:00:00`);
  const diasRestantes = Math.floor((vencimiento.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
  if (diasRestantes <= 0) return "vencido";
  if (diasRestantes <= DIAS_ALERTA_VENCIMIENTO) return "porVencer";
  return "vigente";
}

/**
 * Vigencia de la licencia RETHUS/Cédula profesional: indefinida, o por
 * fecha de vencimiento — "Vigente" mientras no llegue esa fecha,
 * "Requiere revisión" (`vencido`) desde el día en que se cumple o pasa.
 */
export function vigenciaRethus(speaker: Pick<Speaker, "fechaVencimientoRethus" | "rethusIndefinido">): EstadoVigencia {
  return calcularVigenciaPorFecha(speaker.fechaVencimientoRethus, speaker.rethusIndefinido);
}

const DIAS_VIGENCIA_HOJA_VIDA = 730; // 2 años — pedido explícito del usuario.

/**
 * Fecha límite calculada de la Hoja de Vida: actualización + 2 años. Se
 * calcula, no se guarda — la única fecha que captura el formulario es
 * `fechaActualizacionHojaVida`; esta función solo deriva el "vence el…"
 * para mostrarlo junto al semáforo (mismo criterio informativo que ya
 * existía para RETHUS con `detalleRethus`).
 */
export function fechaLimiteHojaVida(fechaActualizacion: string | null): string | null {
  if (!fechaActualizacion) return null;
  const f = new Date(`${fechaActualizacion}T00:00:00`);
  f.setFullYear(f.getFullYear() + 2);
  return f.toISOString().slice(0, 10);
}

/**
 * Vigencia de la Hoja de Vida / CV — pedido explícito del usuario
 * (septiembre 2026): "Vigente (si la fecha de actualización es menor o
 * igual a 2 años) y Requiere revisión/actualización (si la fecha de
 * actualización es mayor a 2 años)". Antes de esta ronda el corte era de 1
 * año (365/305 días) — se reemplaza por el de 2 años pedido ahora, con el
 * mismo margen de aviso previo de `DIAS_ALERTA_VENCIMIENTO` días antes del
 * corte (igual criterio que RETHUS, para que ambos semáforos se sientan
 * consistentes).
 */
export function vigenciaHojaVida(speaker: Pick<Speaker, "hojaVidaAdjunta" | "fechaActualizacionHojaVida">): EstadoVigencia {
  if (!speaker.hojaVidaAdjunta) return "sinDatos";
  if (!speaker.fechaActualizacionHojaVida) return "sinDatos";
  const hoy = new Date();
  const actualizacion = new Date(`${speaker.fechaActualizacionHojaVida}T00:00:00`);
  const diasTranscurridos = Math.floor((hoy.getTime() - actualizacion.getTime()) / (1000 * 60 * 60 * 24));
  if (diasTranscurridos > DIAS_VIGENCIA_HOJA_VIDA) return "vencido";
  if (diasTranscurridos > DIAS_VIGENCIA_HOJA_VIDA - DIAS_ALERTA_VENCIMIENTO) return "porVencer";
  return "vigente";
}

// Etiquetas ajustadas a la terminología real de la aplicación (confirmada
// por captura de pantalla del Repositorio de Speakers del usuario): "Por
// vencer" → "Próximo a vencer", "Sin datos" → "Sin registro". "Indefinido"
// no es una pastilla de filtro propia — en la tarjeta se muestra como
// "Vigente" con el detalle "Vigencia indefinida" (ver EstadoConsolidado
// más abajo), pero esta etiqueta se deja disponible por si algún consumo
// puntual necesita distinguirlo explícitamente.
//
// "Vencido" → "Requiere revisión" (ronda "regla del semáforo", septiembre
// 2026): pedido explícito del usuario para RETHUS y Hoja de Vida, exacto en
// ambos casos ("Requiere revisión/actualización"); se aplicó el mismo texto
// en todo el resto de consumos de este estado (filtros, CSV) para no tener
// dos palabras distintas para el mismo estado en distintas pantallas.
export const ETIQUETA_VIGENCIA: Record<EstadoVigencia, string> = {
  vigente: "Vigente",
  porVencer: "Próximo a vencer",
  vencido: "Requiere revisión",
  indefinido: "Indefinido",
  sinDatos: "Sin registro",
};

/**
 * Estado consolidado de un speaker (RETHUS + Hoja de Vida combinados) para
 * las pastillas de filtro del Repositorio de Speakers — el peor de los dos
 * estados manda, con "indefinido" contando como "vigente" (confirmado por
 * captura de pantalla: un speaker con RETHUS "Vigencia indefinida" pero sin
 * Hoja de Vida cuenta como "Sin registro" en los filtros, no como
 * "Vigente").
 */
export type EstadoConsolidado = "vigente" | "porVencer" | "vencido" | "sinDatos";

const SEVERIDAD_VIGENCIA: Record<EstadoVigencia, number> = {
  vencido: 3,
  sinDatos: 2,
  porVencer: 1,
  vigente: 0,
  indefinido: 0,
};

export function estadoConsolidadoSpeaker(speaker: Speaker): EstadoConsolidado {
  const rethus = vigenciaRethus(speaker);
  const hojaVida = vigenciaHojaVida(speaker);
  const peor = SEVERIDAD_VIGENCIA[rethus] >= SEVERIDAD_VIGENCIA[hojaVida] ? rethus : hojaVida;
  return peor === "indefinido" ? "vigente" : peor;
}

export const ETIQUETA_ESTADO_CONSOLIDADO: Record<EstadoConsolidado, string> = {
  vigente: "Vigente",
  porVencer: "Próximo a vencer",
  vencido: "Requiere revisión",
  sinDatos: "Sin registro",
};

/** CSV del repositorio completo de Speakers para el "Informe de Speakers" — incluye la vigencia ya calculada, no solo los campos crudos. */
export function construirCSVSpeakers(speakers: Speaker[]): string {
  const encabezados = [
    "Nombre completo",
    "Documento",
    "Especialidad",
    "País",
    "Ciudad",
    "Teléfono",
    "Correo",
    "Licencia RETHUS",
    "Vigencia RETHUS",
    "Vigencia hoja de vida",
  ];
  const cuerpo = speakers.map((s) => [
    s.nombreCompleto,
    s.numeroDocumento,
    s.especialidad,
    s.pais,
    s.ciudad,
    s.telefono,
    s.email,
    s.licenciaRethus,
    ETIQUETA_VIGENCIA[vigenciaRethus(s)],
    ETIQUETA_VIGENCIA[vigenciaHojaVida(s)],
  ]);
  return construirCSV(encabezados, cuerpo);
}
