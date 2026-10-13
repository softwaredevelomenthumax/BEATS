// Enums de Postgres, valores exactos exportados desde el proyecto real de
// Supabase (pg_enum). No modificar sin volver a exportar desde la BD.

export const TIPO_DOC = [
  "evento",
  "convenio",
  "fmv",
  "notificacionPago",
  "caf",
  "convenioHCP",
] as const;
export type TipoDoc = (typeof TIPO_DOC)[number];

/**
 * Fase de ciclo de vida de documentos (septiembre 2026): se agrega
 * "Devuelto" — un documento Pendiente que su creador (o un administrador)
 * decide suspender y reabrir para edición, siempre que ningún paso de su
 * cadena de aprobación se haya firmado todavía (ver
 * `puedeDevolverDocumento` en `lib/cicloVidaDocumento.ts`). Se comporta como
 * un Borrador para efectos de edición (editable las veces que haga falta
 * antes de reenviarlo), pero se distingue en el Tablero/Historial para que
 * quede claro que alguna vez se envió a aprobación y se devolvió — no que
 * nunca se envió.
 *
 * IMPORTANTE — requiere migración real: este valor todavía no existe en el
 * enum `estado_doc` del proyecto real de Supabase. Ver
 * `db/agregar_ciclo_vida_documentos.sql` para el `ALTER TYPE` que hay que
 * ejecutar contra la base de datos real antes de que esta transición
 * funcione fuera de las pruebas con fixtures locales.
 */
export const ESTADO_DOC = [
  "Borrador",
  "Pendiente",
  "Aprobado",
  "Rechazado",
  "Devuelto",
  "Completado",
  "Anulado",
] as const;
export type EstadoDoc = (typeof ESTADO_DOC)[number];

export const ESTADO_APROBACION = ["pendiente", "aprobado", "rechazado"] as const;
export type EstadoAprobacion = (typeof ESTADO_APROBACION)[number];

/**
 * AJUSTES (septiembre/octubre 2026), pedido explícito: "Pendiente",
 * "Aprobado", etc. deben iniciar con mayúscula en pantalla. `EstadoDoc` (el
 * estado del documento completo) ya se guarda capitalizado — este mapa es
 * para `EstadoAprobacion` (el estado de cada PASO de la cadena de
 * aprobación), que se guarda en minúscula y antes se mostraba tal cual en
 * la "Cadena de aprobación" de cada Detalle*.tsx.
 */
export const ETIQUETA_ESTADO_APROBACION: Record<EstadoAprobacion, string> = {
  pendiente: "Pendiente",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
};

// Entrega 23 (octubre 2026): el rol "Legal & Compliance" se divide. Un usuario
// puede tener rol Legal (solo), Compliance (solo) o Legal & Compliance (ambos —
// el valor `legal_compliance` que ya existía, así los usuarios actuales no
// cambian). Cualquiera de los tres puede coexistir en el mismo país. Qué rol
// puede firmar cada paso se decide en UN solo lugar: `rolSatisface` (y su
// gemela en SQL, `fn_rol_satisface`, ver `db/entrega_23b_*.sql`).
export const ROL_USUARIO = [
  "marketing",
  "comercial",
  "medica",
  "legal",
  "compliance",
  "legal_compliance",
  "finanzas",
  "gerencia_general",
  "administrador",
] as const;
export type RolUsuario = (typeof ROL_USUARIO)[number];

export const ROL_APROBADOR = [
  "comercial",
  "medica",
  "legal",
  "compliance",
  "legal_compliance",
  "finanzas",
  "gerencia_general",
  // Entrega 24: línea de firma ligada a una PERSONA (solicitante, jefe inmediato, director de área,
  // Compliance Officer LATAM), no a un rol — ver `firmantesIds` en `PasoAprobacion`.
  "persona",
] as const;
export type RolAprobador = (typeof ROL_APROBADOR)[number];

/** Los tres roles del área legal/cumplimiento (para menús e informes que antes eran solo de `legal_compliance`). */
export const ROLES_LEGAL_COMPLIANCE: readonly RolUsuario[] = ["legal", "compliance", "legal_compliance"];

/**
 * ¿Un usuario con `rolUsuario` puede firmar un paso que exige `rolRequerido`?
 *   - requiere `legal`            → legal, legal_compliance
 *   - requiere `compliance`       → compliance, legal_compliance
 *   - requiere `legal_compliance` → cualquiera de los tres (pasos antiguos)
 *   - cualquier otro rol          → coincidencia exacta, como siempre
 * IMPORTANTE: mantener idéntica a `fn_rol_satisface` (SQL).
 */
export function rolSatisface(rolUsuario: string | null | undefined, rolRequerido: string | null | undefined): boolean {
  if (!rolUsuario || !rolRequerido) return false;
  switch (rolRequerido) {
    case "legal":
      return rolUsuario === "legal" || rolUsuario === "legal_compliance";
    case "compliance":
      return rolUsuario === "compliance" || rolUsuario === "legal_compliance";
    case "legal_compliance":
      return rolUsuario === "legal" || rolUsuario === "compliance" || rolUsuario === "legal_compliance";
    default:
      return rolUsuario === rolRequerido;
  }
}

/**
 * Fase de ciclo de vida de documentos (septiembre 2026): 3 acciones nuevas
 * para trazar en Historial y Auditoría los movimientos pedidos explícitamente
 * por el usuario — guardar/editar un borrador ya existente
 * (`borrador_actualizado`; la creación inicial sigue usando "creacion", con
 * su propio `detalle` distinguiendo si se guardó como borrador o se envió),
 * devolver un documento Pendiente sin firmas (`devuelto`), y solicitar una
 * enmienda sobre un documento Pendiente que ya tiene al menos una firma
 * (`enmienda_solicitada` — distinta de "adenda_solicitada", que sigue siendo
 * exclusiva de documentos ya Aprobados). Ver `lib/cicloVidaDocumento.ts`.
 *
 * IMPORTANTE — requiere migración real: estos 3 valores todavía no existen
 * en el enum `tipo_accion_auditoria` del proyecto real de Supabase. Ver
 * `db/agregar_ciclo_vida_documentos.sql`.
 */
export const TIPO_ACCION_AUDITORIA = [
  "creacion",
  "envio",
  "aprobacion_parcial",
  "aprobacion_final",
  "rechazo",
  "edicion_reenvio",
  "completado",
  "anulacion",
  "eliminacion",
  "adenda_solicitada",
  "borrador_actualizado",
  "devuelto",
  "enmienda_solicitada",
  // Entrega 39 — requiere `db/entrega_39a_enum_auditoria_anotaciones.sql`.
  "anotacion_pago_editada",
  "anotacion_pago_eliminada",
] as const;
export type TipoAccionAuditoria = (typeof TIPO_ACCION_AUDITORIA)[number];

export const TIPO_NOTIFICACION = ["rechazo", "tarea_pendiente", "etapa_resuelta"] as const;
export type TipoNotificacion = (typeof TIPO_NOTIFICACION)[number];

// Ronda de ajustes de formularios (septiembre 2026), entrega "reorganización
// FormularioEvento": se agrega "Mixto" — decisión confirmada por el usuario
// en la propuesta (ver comentario del documento): un evento Mixto se
// comporta, para efectos de Dirección/País/Ciudad/Estado, igual que uno
// Presencial (ambos se piden; solo "Virtual" los oculta/autocompleta).
export const MODALIDAD_EVENTO = ["Presencial", "Virtual", "Mixto"] as const;
export type ModalidadEvento = (typeof MODALIDAD_EVENTO)[number];

// Ajuste de precisión (septiembre 2026), pedido explícito: la opción que
// internamente sigue siendo "Mixto" (mismo valor ya guardado en la base de
// datos y usado en toda la lógica de Dirección/País/Ciudad — ver el
// comentario de arriba) se debe MOSTRAR como "Híbrido (Presencial y
// Transmisión)" en el desplegable. Se resuelve con un mapa de etiqueta de
// presentación en vez de renombrar el valor almacenado, para no romper
// eventos ya guardados con "Mixto".
export const ETIQUETA_MODALIDAD_EVENTO: Record<ModalidadEvento, string> = {
  Presencial: "Presencial",
  Virtual: "Virtual",
  Mixto: "Híbrido (Presencial y Transmisión)",
};

export const MODALIDAD_SESIONES = ["Única sesión", "Varias sesiones"] as const;
export type ModalidadSesiones = (typeof MODALIDAD_SESIONES)[number];

export const QUIEN_DICTA_ACTIVIDAD = ["Speaker interno", "Speaker externo"] as const;
export type QuienDictaActividad = (typeof QUIEN_DICTA_ACTIVIDAD)[number];

export const RESPUESTA_CRITERIO = ["A", "B", "C", "D"] as const;
export type RespuestaCriterio = (typeof RESPUESTA_CRITERIO)[number];

export const CRITERIO_FMV_KEY = [
  "criterio1",
  "criterio2",
  "criterio3",
  "criterio4",
  "criterio5",
  "criterio6",
] as const;
export type CriterioFmvKey = (typeof CRITERIO_FMV_KEY)[number];

export const CATEGORIA_REPOSITORIO_ARCHIVO = [
  "listaAsistencia",
  "fotos",
  "caf",
  "convenio",
  "presentacionAprobada",
  "evidenciaAprobacionPresentacion",
  /**
   * AJUSTES (septiembre 2026), pedido explícito: NOTA del adjunto — si
   * "¿Habrá patrocinio / pago de viáticos a un HCP?" es Sí, debe habilitarse
   * la opción para cargar, como soporte, el certificado de participación en
   * el evento. Se muestra en `RepositorioEvento.tsx` solo cuando
   * `evento.patrocinioHcp` es true (ver ese componente).
   */
  "certificadoParticipacion",
  "otros",
] as const;
export type CategoriaRepositorioArchivo = (typeof CATEGORIA_REPOSITORIO_ARCHIVO)[number];

export const CATEGORIA_FINANCIERA_REPOSITORIO = [
  "ordenCompra",
  "facturas",
  "comprobantePago",
] as const;
export type CategoriaFinancieraRepositorio = (typeof CATEGORIA_FINANCIERA_REPOSITORIO)[number];

/** Fase 1 (infraestructura de archivos, septiembre 2026) — etiquetas para el Repositorio del Evento. */
export const ETIQUETA_CATEGORIA_REPOSITORIO_ARCHIVO: Record<CategoriaRepositorioArchivo, string> = {
  listaAsistencia: "Lista de asistencia",
  fotos: "Fotos",
  caf: "CAF",
  convenio: "Convenio",
  presentacionAprobada: "Presentación aprobada",
  evidenciaAprobacionPresentacion: "Evidencia de aprobación de la presentación",
  certificadoParticipacion: "Certificado de participación en el evento",
  otros: "Otros",
};

export const ETIQUETA_CATEGORIA_FINANCIERA_REPOSITORIO: Record<CategoriaFinancieraRepositorio, string> = {
  ordenCompra: "Orden de compra",
  facturas: "Factura",
  comprobantePago: "Comprobante de pago",
};

export const CAMPO_AJUSTE_FINANCIERO = ["numero", "fecha", "valor", "moneda"] as const;
export type CampoAjusteFinanciero = (typeof CAMPO_AJUSTE_FINANCIERO)[number];

export const CATALOGO_SIMPLE = [
  "empresasGrupo",
  "tiposEvento",
  "areasEspecialidadEvento",
  "categoriasHotel",
  "monedas",
  "centrosCostos",
  "tiposTransporte",
  "departamentosConvenio",
  "especialidadesMedicas",
  "lineasTerapeuticas",
  "tiposActividadConvenio",
  /**
   * Reorganización FormularioEvento (septiembre 2026), decisión confirmada:
   * "Organizado por" pasa a ser un único catálogo compartido entre Convenio
   * y Evento (antes existían dos: "organizadoPorConvenio" y
   * "organizadoPorEvento" — este último se eliminó del editor de catálogos;
   * sus valores, si los tenía, quedan huérfanos en `catalogo_valores`).
   */
  "organizadoPorConvenio",
  "tiposDocumento",
  /**
   * Ronda de ajustes de formularios (septiembre 2026): "Estado/Provincia/
   * Departamento" se pidió como catálogo propio ("Estados"), independiente
   * del selector país→ciudad de ese momento — no dependía del país
   * elegido, a diferencia de ciudad.
   *
   * Ítem #3 de la entrega "Territorios" (septiembre 2026): el
   * estado/provincia/departamento pasó a ser parte del selector en
   * cascada País → Estado → Ciudad (`SelectPaisEstadoCiudad.tsx`,
   * alimentado por el catálogo geográfico `country-state-city`, no por
   * este catálogo suelto) — ya ningún formulario consume `useCatalogo
   * ("estados")`. Se deja el tipo aquí y no se borra la fila del
   * catálogo/sus valores en `catalogo_valores` (política del proyecto de
   * no eliminar datos existentes); un administrador todavía puede verlos y
   * limpiarlos manualmente desde "Catálogos de opciones" si ya no los
   * necesita.
   */
  "estados",
  /** Catálogo para "Tipo de participación académica" en Solicitud de Evento. */
  "tiposParticipacionAcademica",
  /** Ronda de ajustes de formularios, entrega 5: "Tipo de servicio (convenio)" en Convenio de Pago a HCP. */
  "tiposServicioConvenio",
  /** Ronda de ajustes de formularios, entrega 6 (FMV): "Región" pasa de texto libre a catálogo. */
  "regiones",
  /** Ronda de ajustes de formularios (septiembre 2026): "Profesión" en Nuevo Speaker. */
  "profesiones",
  /**
   * Entrega 20 (octubre 2026): "Tipos de contrato" — alimenta la lista "Tipo de
   * contrato" del CAF (antes usaba por error el catálogo "Tipos de documento",
   * que son tipos de documento de identidad). REQUIERE el valor en el enum
   * `catalogo_simple` de la base: `db/entrega_20_migraciones.sql`.
   */
  "tiposContrato",
  /**
   * Entrega 22 (octubre 2026): "Speakers internos" — empleados que dictan
   * actividades. Cada valor es "Nombre | País" (ver `lib/speakersEvento.ts`).
   * REQUIERE el valor en el enum `catalogo_simple`:
   * `db/entrega_22_speakers_mixtos_congelamiento.sql`.
   */
  "speakersInternos",
  /**
   * Entrega 23 (octubre 2026): "Áreas" del perfil de usuario (campo "Área" en
   * Nuevo/Editar usuario). REQUIERE el valor en el enum `catalogo_simple`:
   * `db/entrega_23a_enums_roles_legal_compliance.sql`.
   */
  "areasUsuario",
] as const;
export type CatalogoSimple = (typeof CATALOGO_SIMPLE)[number];

// Etiquetas legibles de cada tipo de documento — nombre + código regulatorio
// (confirmado en el bundle original).
/**
 * Octubre 2026, pedido explícito: el ÚNICO significado válido de la sigla CAF es «Formato de Aprobación de Contrato».
 * Cuando la app muestre el significado entre paréntesis debe usar estas constantes (nunca escribirlo a mano): en
 * documentos y notificaciones aparecían significados distintos e incorrectos.
 */
export const SIGNIFICADO_CAF = "Formato de Aprobación de Contrato";
export const CAF_CON_SIGNIFICADO = `CAF (${SIGNIFICADO_CAF})`;

export const ETIQUETA_TIPO_DOC: Record<TipoDoc, string> = {
  evento: "Solicitud de Evento",
  convenio: "Convenio de Pago a HCP",
  fmv: "FMV Checklist",
  notificacionPago: "Notificación de Pago a HCPs",
  caf: "CAF",
  convenioHCP: "Convenio HCP",
};

export const CODIGO_REGULATORIO_TIPO_DOC: Partial<Record<TipoDoc, string>> = {
  evento: "FOR-CM-027",
  fmv: "MD",
  notificacionPago: "FOR-CM-020",
};

export const ETIQUETA_ROL_USUARIO: Record<RolUsuario, string> = {
  marketing: "Marketing",
  comercial: "Comercial",
  medica: "Médica",
  legal: "Legal",
  compliance: "Compliance",
  legal_compliance: "Legal & Compliance",
  finanzas: "Finanzas",
  // AJUSTES (septiembre/octubre 2026), pedido explícito: "Gerencia General"
  // → "Gerencia General / Rep. Legal" en todas las instancias.
  gerencia_general: "Gerencia General / Rep. Legal",
  administrador: "Administrador",
};

export const ETIQUETA_ACCION_AUDITORIA: Record<TipoAccionAuditoria, string> = {
  creacion: "Creación",
  envio: "Envío",
  aprobacion_parcial: "Aprobación parcial",
  aprobacion_final: "Aprobación final",
  rechazo: "Rechazo",
  edicion_reenvio: "Edición y reenvío",
  completado: "Completado",
  anulacion: "Anulación",
  eliminacion: "Eliminación",
  adenda_solicitada: "Adenda solicitada",
  borrador_actualizado: "Borrador actualizado",
  devuelto: "Devuelto",
  enmienda_solicitada: "Enmienda solicitada",
  anotacion_pago_editada: "Anotación de pago editada",
  anotacion_pago_eliminada: "Anotación de pago eliminada",
};
