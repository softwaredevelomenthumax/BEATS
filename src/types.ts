import type {
  CategoriaFinancieraRepositorio,
  CategoriaRepositorioArchivo,
  EstadoDoc,
  ModalidadEvento,
  ModalidadSesiones,
  QuienDictaActividad,
  RespuestaCriterio,
  RolUsuario,
  TipoAccionAuditoria,
  TipoDoc,
  TipoNotificacion,
} from "@/lib/enums";
import type { PasoAprobacion } from "@/lib/aprobaciones";

/** Fila de la tabla `usuarios`, forma "flat" ya usada por la UI. */
export interface Usuario {
  id: string;
  nombre: string;
  cargo: string;
  email: string;
  rol: RolUsuario;
  iniciales: string;
  firmaId: string | null;
  /** Entrega 33: foto de perfil (`archivos_adjuntos`), `usuarios.foto_id`. `null` = sin foto o columna aún no creada (`db/entrega_33_foto_usuario.sql`). */
  fotoId: string | null;
  debeCambiarPassword: boolean;
  authUserId: string | null;
  telefono: string;
  paginasPermitidas: string[];
  empresasGrupo: string[];
  paisesOperacion: string[];
  esAdministrador: boolean;
  administradorAlcanceLimitado: boolean;
  /**
   * Entrega 23 (octubre 2026) — datos que alimentan las líneas de firma del CAF
   * ("Jefe inmediato", "Director de área", "Compliance Officer LATAM"). Columnas
   * nuevas, ver `db/entrega_23b_roles_legal_compliance_perfil.sql`.
   *  - `area`: valor del catálogo "Áreas" ("" = sin área).
   *  - `esDirectorArea` / `firmaComoDirectorArea`: es director de su área, o puede
   *    firmar como tal aunque no lo sea (habilitación, no reemplazo).
   *  - `jefeInmediatoId`: otro usuario, o él mismo ("" = sin jefe cargado).
   *  - `firmaComoJefeInmediato`: puede firmar la línea "Jefe inmediato" (solo con jefe cargado).
   *  - `firmaComoComplianceLatam`: solo roles Compliance / Legal & Compliance.
   */
  area: string;
  esDirectorArea: boolean;
  firmaComoDirectorArea: boolean;
  jefeInmediatoId: string;
  firmaComoJefeInmediato: boolean;
  firmaComoComplianceLatam: boolean;
  /**
   * Entrega 28 — preferencia del usuario: archivar (ocultar de la vista normal) los documentos de eventos que terminaron hace
   * más de N meses (0 = nunca). `null` = la columna `usuarios.archivar_documentos_meses` aún no existe / sin valor — en ese
   * caso rige la preferencia guardada en este navegador. Ver `lib/archivado.ts` y `db/entrega_28_preferencias_usuario.sql`.
   */
  archivarDocumentosMeses?: number | null;
  /**
   * Corrección (octubre 2026), pedido explícito del usuario: "Genera un
   * formulario (al que pueda darse acceso solo para administradores, por
   * usuario), para ver y eliminar sin rastro, documentos... a pesar de
   * estar firmados" — un permiso nuevo y separado de `esAdministrador`
   * (no todo Administrador debe poder hacer esto; se otorga persona por
   * persona). Ver `src/pages/EliminarDocumentosFirmados.tsx` y
   * `db/agregar_permiso_eliminar_documentos_firmados.sql`.
   */
  puedeEliminarDocumentosFirmados: boolean;
  /**
   * Ronda de ajustes de formularios (septiembre 2026), entrega 8: campos
   * que pedía la especificación de "Nuevo Usuario" y no existían —
   * documento de identidad y dirección propia (distinta de
   * `paisesOperacion`, que es el ALCANCE de países que puede operar, no su
   * ubicación). `estadoUsuario` implementa "Guardar como borrador"/
   * "Confirmar Usuario": un Borrador es una fila sin cuenta real de
   * Supabase Auth todavía (`authUserId: null`) — "Confirmar Usuario" es lo
   * que de verdad crea la cuenta y dispara el correo con la contraseña
   * temporal (ver `lib/usuarios.ts`). Columnas nuevas, ver
   * `db/agregar_campos_nuevo_usuario.sql`.
   */
  numeroDocumento: string;
  pais: string;
  estadoProvincia: string;
  ciudad: string;
  observaciones: string;
  estadoUsuario: "Borrador" | "Confirmado";
  /**
   * Habilitar/inhabilitar usuarios (septiembre 2026): un Administrador
   * puede inhabilitar temporalmente a un colaborador sin borrar su fila.
   * `false` cierra su sesión automáticamente la próxima vez que `useAuth`
   * cargue el usuario (ver `hooks/useAuth.tsx` y
   * `db/agregar_activo_usuario.sql`). Columna nueva, default `true`.
   */
  activo: boolean;
}

/** Fila de la vista `v_documentos` — usada por el Tablero para listar los
 * 6 tipos de documento en una sola consulta. */
export interface DocumentoResumen {
  id: string;
  tipoDoc: TipoDoc;
  estado: EstadoDoc;
  creadoPorId: string;
  creadoEn: string;
  nombre: string;
}

export interface Caf {
  id: string;
  tipoDoc: "caf";
  /**
   * Octubre 2026 (Expediente del evento): el CAF se elaboró en el aplicativo
   * CAF corporativo, no en BEATS. El formulario se registra con todos los
   * campos deshabilitados, sin cadena de aprobación (ni notificaciones) y
   * queda "Aprobado" para no frenar el Convenio HCP; la copia firmada se
   * carga después en el Expediente del evento. Columna nueva
   * `elaborado_en_caf_corporativo` — ver `db/agregar_expediente_evento.sql`.
   */
  elaboradoEnCafCorporativo: boolean;
  estado: EstadoDoc;
  creadoPorId: string;
  creadoEn: string;
  eventoOrigenId: string;
  /**
   * Ronda de ajustes de formularios (septiembre 2026), entrega 3: vínculo
   * al speaker del repositorio — columna nueva, ver
   * `db/agregar_speaker_caf.sql`. El formulario de CAF todavía no expone un
   * selector propio que la llene (queda para la entrega de CAF de esta
   * misma ronda); mientras tanto queda `null` y las reglas de dependencia
   * (`lib/reglasDependenciaDocumentos.ts`) se aplican a nivel de evento.
   */
  speakerId: string | null;
  tipoContrato: string;
  tipoContratoOtroEspecifique: string;
  solicitanteNombre: string;
  solicitanteTelefono: string;
  directorAreaNombre: string;
  directorAreaCargo: string;
  contraparteNombre: string;
  /**
   * Ronda de ajustes de formularios (septiembre 2026), entrega 7: campos
   * de la contraparte que pedía la especificación y no existían —
   * autocargados desde el Convenio de Pago a HCP relacionado (documento,
   * país, estado, ciudad) o desde el Repositorio de Speakers (teléfono,
   * correo, ya existentes). Columnas nuevas, ver
   * `db/agregar_contraparte_caf.sql`.
   */
  contraparteNumeroDocumento: string;
  contrapartePais: string;
  contraparteEstadoProvincia: string;
  contraparteCiudad: string;
  contraparteDireccion: string;
  dueDiligence: string;
  terminoContratoInicio: string | null;
  terminoContratoFin: string | null;
  /**
   * Ronda de ajustes de formularios (septiembre 2026), entrega 7: "Término
   * del contrato – fin" es un toggle "Determinable"/"Fecha específica" —
   * `true` = Determinable (sin fecha), `false` = Fecha específica
   * (`terminoContratoFin` guarda la fecha elegida). Columna nueva.
   */
  terminoContratoDeterminable: boolean;
  contraparteTelefono: string;
  contraparteCorreo: string;
  contraparteContacto: string;
  objetoContrato: string;
  comentarios: string;
  /** Entrega 24 (formato CAF): empleado(s) responsable(s) principal(es) de la administración y cumplimiento del contrato. */
  responsablesContrato: string;
  /** Entrega 24: "Aviso, domicilio y fax" → At'n. */
  avisoAtencion: string;
  /** Entrega 24: "Aviso, domicilio y fax" → con copia para (depto, domicilio y fax). */
  avisoConCopiaPara: string;
  monto: number;
  moneda: string;
  codigoCobroCuenta: string;
  codigoCobroDepto: string;
  codigoCobroProd: string;
  codigoCobroProyecto: string;
  companiaNombre: string;
  codigoDocumento: string;
  motivoAnulacion: string | null;
  anuladoPorId: string | null;
  anuladoEn: string | null;
  adendaVentanaActorId: string | null;
  adendaVentanaExpiraEn: string | null;
  adendaVentanaJustificacion: string | null;
  camposPersonalizados: Record<string, unknown>;
  /**
   * Snapshot congelado de etiquetas de campo + campos personalizados en el
   * momento en que este documento quedó Aprobado/Completado (columna
   * `snapshot_formato`, jsonb) — ver `src/lib/snapshotFormato.ts` y
   * `db/agregar_inmutabilidad_documentos_firmados.sql`. `unknown` porque
   * llega crudo (snake_case) desde la base; se parsea con
   * `parsearSnapshotFormato`.
   */
  snapshotFormato?: unknown;
  aprobaciones: PasoAprobacion[];
  /** Cuándo se envió realmente a firma (ver db/agregar_fecha_envio_a_firma.sql); null/ausente en documentos anteriores a la migración. */
  enviadoAFirmaEn?: string | null;
}

/**
 * FMV Checklist ("Fair Market Value") — documento de un solo firmante, sin
 * cadena de aprobación: pasa directo de Borrador a Completado al firmar.
 * Trae además el sistema de scoring/Tier (ver `src/lib/fmvConfig.ts`).
 */
export interface Fmv {
  id: string;
  tipoDoc: "fmv";
  estado: EstadoDoc;
  creadoPorId: string;
  creadoEn: string;
  eventoOrigenId: string | null;
  speakerId: string | null;
  region: string;
  pais: string;
  fecha: string | null;
  nombreCompleto: string;
  /**
   * Ronda de ajustes de formularios (septiembre 2026), entrega 6: la
   * especificación pide mostrar el número de documento del HCP junto al
   * resto de sus datos (autocargado del Repositorio de Speakers, sin
   * asterisco de obligatorio) — no existía ninguna columna equivalente.
   * Columna nueva, ver `db/agregar_numero_documento_fmv.sql`.
   */
  numeroDocumento: string;
  cvAdjunto: boolean;
  especialidad: string;
  especialidadOtro: string;
  licenciaNacional: string;
  direccionPrincipal: string;
  ciudad: string;
  estadoProvincia: string;
  codigoPostal: string;
  criterio1: RespuestaCriterio | null;
  criterio2: RespuestaCriterio | null;
  criterio3: RespuestaCriterio | null;
  criterio4: RespuestaCriterio | null;
  criterio5: RespuestaCriterio | null;
  criterio6: RespuestaCriterio | null;
  comentariosAdicionales: string;
  aplicaTarifarioAsociacion: boolean;
  archivoTarifarioAsociacionId: string | null;
  /** Ajuste de precisión (septiembre 2026), pedido explícito: obligatorio
   * solo cuando `aplicaTarifarioAsociacion` es `true`. IMPORTANTE — requiere
   * migración real: columna nueva, todavía no existe en el proyecto real de
   * Supabase (ver `db/`). */
  asociacionCientifica: string;
  medicalName: string;
  medicalRole: string;
  fechaFirma: string | null;
  firmaElectronica: boolean;
  /**
   * Corrección (octubre 2026), pedido explícito del usuario: "el campo
   * 'Firma electrónica: Sí' no hace referencia a si está firmado o no,
   * sino que debe mostrar la firma autógrafa" — guarda quién firmó de
   * verdad (`usuario.id` de la sesión que firmó, no necesariamente
   * `creadoPorId`) para poder mostrar su firma manuscrita real en vez de
   * un simple "Sí/No". `null` hasta que se firma, o en documentos
   * firmados antes de esta migración.
   */
  firmadoPorId: string | null;
  /**
   * Entrega 22: id del archivo de la firma manuscrita que usó quien firmó, congelado al firmar
   * (`db/entrega_22_speakers_mixtos_congelamiento.sql`). Si existe, las vistas la prefieren a la firma "en vivo" del usuario.
   */
  firmaCongeladaId?: string | null;
  motivoAnulacion: string | null;
  anuladoPorId: string | null;
  anuladoEn: string | null;
  empresaGrupo: string;
  camposPersonalizados: Record<string, unknown>;
  /**
   * Snapshot congelado de etiquetas de campo + campos personalizados en el
   * momento en que este documento quedó Aprobado/Completado — ver
   * `src/lib/snapshotFormato.ts` y
   * `db/agregar_inmutabilidad_documentos_firmados.sql`.
   */
  snapshotFormato?: unknown;
}

/**
 * Convenio de Pago a HCP — cadena de aprobación fija de 3 etapas (ver
 * `crearCadenaAprobacionConvenio` en aprobaciones.ts). Trae condicionales
 * de Consejo de Asesores y Funcionario de Gobierno, y un vínculo opcional a
 * sesiones de un Evento (multi-sesión) — ese vínculo detallado se activa en
 * la Fase 4, cuando exista la estructura de sesiones del Evento.
 */
export interface Convenio {
  id: string;
  tipoDoc: "convenio";
  estado: EstadoDoc;
  creadoPorId: string;
  creadoEn: string;
  eventoOrigenId: string | null;
  empleadoResponsableNombreCargo: string;
  departamento: string;
  unidadNegocioUbicacion: string;
  tipoActividad: string;
  organizadoPor: string;
  organizador: string;
  speakerId: string;
  hcpNombreCompleto: string;
  /**
   * Ronda de ajustes de formularios (septiembre 2026), entrega 5: 3 campos
   * que la especificación pide mostrar junto al resto de datos del HCP
   * (número de documento y especialidad, autocargados desde el
   * repositorio; estado/provincia, manual por ahora — el Repositorio de
   * Speakers todavía no captura ese dato, ver `Speaker.estadoProvincia` en
   * este mismo archivo). Columnas nuevas, ver
   * `db/agregar_hcp_estado_documento_especialidad_convenio.sql`.
   */
  hcpNumeroDocumento: string;
  hcpEspecialidad: string;
  hcpEstadoProvincia: string;
  hcpDireccion: string;
  hcpPais: string;
  hcpCiudad: string;
  hcpCedulaLicencia: string;
  hcpRFC: string;
  tipoServicio: string;
  nombreEventoServicio: string;
  fechaInicioActividad: string | null;
  fechaFinActividad: string | null;
  esConsejoAsesores: boolean;
  tituloConsejoAsesores: string;
  numeroHCPConsejo: number | null;
  justificacionNumeroHCP: string;
  esFuncionarioGobierno: boolean;
  supuestoCargoImportante: boolean;
  supuestoRepresentanteCompras: boolean;
  supuestoInfluenciaDecisionGubernamental: boolean;
  /**
   * Ronda de ajustes de formularios (septiembre 2026), entrega 5: true una
   * vez el usuario eligió "Continuar" en el diálogo de advertencia de
   * funcionario de gobierno (mismo patrón que
   * `Evento.advertenciaPresupuestoNoAprobado`) — dispara la nota impresa
   * antes del panel de firmas.
   */
  advertenciaFuncionarioGobiernoConfirmada: boolean;
  objetivo: string;
  criteriosSeleccion: string;
  cvAdjunto: boolean;
  contraprestacionHCP: number | null;
  monedaContraprestacion: string;
  consistenteTabuladorTarifas: boolean;
  explicacionSiNoConsistente: string;
  agendaReunion: string;
  archivoAgendaId: string | null;
  cateringNombreServicio: string;
  contraprestacionCatering: number | null;
  lugarReunion: string;
  firmaEmpleadoCertifica: boolean;
  sesionesParticipacionIds: string[];
  motivoAnulacion: string | null;
  anuladoPorId: string | null;
  anuladoEn: string | null;
  adendaVentanaActorId: string | null;
  adendaVentanaExpiraEn: string | null;
  adendaVentanaJustificacion: string | null;
  camposPersonalizados: Record<string, unknown>;
  /**
   * Snapshot congelado de etiquetas de campo + campos personalizados en el
   * momento en que este documento quedó Aprobado/Completado — ver
   * `src/lib/snapshotFormato.ts` y
   * `db/agregar_inmutabilidad_documentos_firmados.sql`.
   */
  snapshotFormato?: unknown;
  aprobaciones: PasoAprobacion[];
  /** Cuándo se envió realmente a firma (ver db/agregar_fecha_envio_a_firma.sql); null/ausente en documentos anteriores a la migración. */
  enviadoAFirmaEn?: string | null;
}

/** Un numeral fijo del clausulado legal (1 a 15), bilingüe. */
export interface NumeralClausulado {
  numero: number;
  textoEs: string;
  textoEn: string;
}

/** Contenido versionado de la plantilla legal del Convenio HCP. */
export interface PlantillaConvenioHcpVersion {
  id: string;
  vigenteDesde: string;
  creadoPorId: string | null;
  notasVersion: string;
  numerales: NumeralClausulado[];
  anexoCEn: string;
  anexoCEs: string;
  anexoDEn: string;
  anexoDEs: string;
  empresaGrupo: string | null;
}

/** Snapshot congelado de la plantilla en el momento de crear un Convenio HCP concreto. */
export interface ClausuladoSnapshot {
  numerales: NumeralClausulado[];
  anexoCEn: string;
  anexoCEs: string;
  anexoDEn: string;
  anexoDEs: string;
}

/**
 * Ajuste puntual de una cláusula para un Convenio HCP específico — no
 * modifica la plantilla global, solo este documento. `seccion` es una de
 * las claves de `SECCIONES_CLAUSULADO` (`numeral_1`..`numeral_15`,
 * `anexo_c`, `anexo_d`).
 */
export interface AjusteClausulaConvenioHcp {
  id: string;
  convenioHcpId: string;
  seccion: string;
  textoEn: string;
  textoEs: string;
  justificacion: string;
  creadoPorId: string;
  creadoEn: string;
}

/**
 * Convenio HCP — contrato de consultoría formal, vinculado siempre a un
 * Evento y a un CAF ya existentes. Clausulado legal versionado (ver
 * `plantillaConvenioHCP.ts`), con cadena de aprobación propia de 2 etapas
 * (ver `crearCadenaAprobacionConvenioHCP` en aprobaciones.ts). El envío al
 * HCP para firma externa por correo y la carga de la copia firmada
 * (confirmados en el bundle original) se dejan fuera de esta fase — no hay
 * todavía infraestructura de envío de correo/almacenamiento de archivos
 * reconstruida — y quedan para una fase posterior de administración.
 */
export interface ConvenioHcp {
  id: string;
  tipoDoc: "convenioHCP";
  /**
   * Entrega 32: el convenio se elaboró en el aplicativo corporativo de contratos, no en BEATS. Se registra solo
   * con el evento y el HCP, sin cadena de aprobación (ni notificaciones) y queda «Aprobado»; la copia firmada se
   * carga en el Expediente del evento. Columna `elaborado_en_contratos_corporativo` — ver
   * `db/entrega_32_convenio_hcp_corporativo.sql`. Mismas reglas que `Caf.elaboradoEnCafCorporativo`.
   */
  elaboradoEnContratosCorporativo: boolean;
  estado: EstadoDoc;
  creadoPorId: string;
  creadoEn: string;
  eventoOrigenId: string;
  cafId: string;
  speakerId: string | null;
  consultorNombre: string;
  consultorIdentificacion: string;
  consultorCredenciales: string;
  consultorDireccion: string;
  consultorEmail: string;
  companiaNombre: string;
  fechaEfectiva: string | null;
  /**
   * Rediseño de la ventana "Convenio HCP" (septiembre 2026): repurposed —
   * antes de esta ronda guardaba solo el "objetivo de la consultoría" en
   * texto libre; ahora guarda el párrafo bilingüe completo "CONSIDERANDO
   * QUE.../EN VIRTUD DE LO CUAL..." ("Whereas.../NOW, THEREFORE...") que
   * pedía la especificación, con el texto fijo + el hueco variable ya
   * ensamblados como VALOR INICIAL editable (ver
   * `armarConsiderandoEs`/`armarWhereasEn` en
   * `lib/textosFijosConvenioHCP.ts`) — una vez el usuario lo edita, el
   * campo guarda lo que sea que haya quedado, fijo o no. Se decidió
   * reutilizar este campo en vez de agregar columnas nuevas porque el
   * significado es compatible (ambos son "la sección de motivación del
   * contrato en cada idioma") y evita duplicar el texto legal fijo en cada
   * fila — mismo criterio que ya usa el clausulado versionado.
   */
  objetivoConsultoria: string;
  objetivoConsultoriaEn: string;
  /**
   * Repurposed igual que `objetivoConsultoria` — antes solo la descripción
   * libre de los servicios; ahora el párrafo bilingüe completo del "Anexo
   * A" (intro fija + enumeración de sesiones + cierre fijo), ensamblado
   * como valor inicial editable por `armarAnexoAEs`/`armarAnexoAEn`.
   */
  serviciosExhibitA: string;
  serviciosExhibitAEn: string;
  compensacion: number | null;
  moneda: string;
  plazoPagoDias: number | null;
  comentariosPago: string;
  comentariosPagoEn: string;
  nombreDirectorGeneral: string;
  clausulasAjustadas: string;
  /**
   * Rediseño de la ventana "Convenio HCP" (septiembre 2026): párrafo de
   * cierre bilingüe "EN TESTIMONIO DE LO CUAL.../IN WITNESS WHEREOF..." —
   * columnas nuevas, ver `db/agregar_cierre_convenio_hcp.sql`. A diferencia
   * de `objetivoConsultoria`/`serviciosExhibitA`, no había ningún campo
   * existente con semántica compatible para repurposear, así que este sí
   * necesitó columnas nuevas.
   */
  cierreEs: string;
  cierreEn: string;
  archivoParaHCPEnviadoEn: string | null;
  archivoFirmadoHCPId: string | null;
  motivoAnulacion: string | null;
  anuladoPorId: string | null;
  anuladoEn: string | null;
  adendaVentanaActorId: string | null;
  adendaVentanaExpiraEn: string | null;
  adendaVentanaJustificacion: string | null;
  plantillaVersionId: string | null;
  clausuladoSnapshot: ClausuladoSnapshot | null;
  camposPersonalizados: Record<string, unknown>;
  /**
   * Snapshot congelado de etiquetas de campo + campos personalizados en el
   * momento en que este documento quedó Aprobado/Completado — ver
   * `src/lib/snapshotFormato.ts` y
   * `db/agregar_inmutabilidad_documentos_firmados.sql`.
   */
  snapshotFormato?: unknown;
  aprobaciones: PasoAprobacion[];
  /** Cuándo se envió realmente a firma (ver db/agregar_fecha_envio_a_firma.sql); null/ausente en documentos anteriores a la migración. */
  enviadoAFirmaEn?: string | null;
  ajustesClausula: AjusteClausulaConvenioHcp[];
}

/**
 * Notificación de Pago a HCPs — documento de un solo firmante, sin cadena
 * de aprobación, igual que FMV.
 */
export interface NotificacionPagoHcp {
  id: string;
  tipoDoc: "notificacionPago";
  estado: EstadoDoc;
  creadoPorId: string;
  creadoEn: string;
  eventoOrigenId: string | null;
  convenioOrigenId: string | null;
  speakerId: string | null;
  nombreProfesionalSalud: string;
  /**
   * Ronda de ajustes de formularios (septiembre 2026): "Número de
   * documento de identidad", autocargado desde el Convenio de Pago a HCP
   * relacionado — distinto de `cedulaLicenciaProfesional` (la licencia
   * RETHUS). Ver `db/agregar_numero_documento_identidad_notificacion_pago.sql`.
   */
  numeroDocumentoIdentidad: string;
  cedulaLicenciaProfesional: string;
  productos: string;
  facturaId: string | null;
  numeroFactura: string | null;
  fechaFactura: string | null;
  valorFactura: number | null;
  monedaFactura: string | null;
  facturaIncluyePagoHcp: boolean;
  facturaIncluyePagoInstitucion: boolean;
  facturaEsPagoTercero: boolean;
  medicalName: string;
  medicalRole: string;
  fechaFirma: string | null;
  firmaElectronica: boolean;
  /**
   * Corrección (octubre 2026), pedido explícito del usuario: "el campo
   * 'Firma electrónica: Sí' no hace referencia a si está firmado o no,
   * sino que debe mostrar la firma autógrafa" — guarda quién firmó de
   * verdad (`usuario.id` de la sesión que firmó, no necesariamente
   * `creadoPorId`) para poder mostrar su firma manuscrita real en vez de
   * un simple "Sí/No". `null` hasta que se firma, o en documentos
   * firmados antes de esta migración.
   */
  firmadoPorId: string | null;
  /**
   * Entrega 22: id del archivo de la firma manuscrita que usó quien firmó, congelado al firmar
   * (`db/entrega_22_speakers_mixtos_congelamiento.sql`). Si existe, las vistas la prefieren a la firma "en vivo" del usuario.
   */
  firmaCongeladaId?: string | null;
  motivoAnulacion: string | null;
  anuladoPorId: string | null;
  anuladoEn: string | null;
  empresaGrupo: string;
  camposPersonalizados: Record<string, unknown>;
  /**
   * Snapshot congelado de etiquetas de campo + campos personalizados en el
   * momento en que este documento quedó Aprobado/Completado — ver
   * `src/lib/snapshotFormato.ts` y
   * `db/agregar_inmutabilidad_documentos_firmados.sql`.
   */
  snapshotFormato?: unknown;
}

/**
 * El desglose de presupuesto de transporte/hospedaje/alimentos se repite
 * igual para el evento de "Única sesión" (a nivel del documento) que para
 * cada fila de `sesiones_evento` en modalidad "Varias sesiones" —
 * confirmado literal en el bundle original (mismas 10 claves, mismas
 * fórmulas de costo `hC`/`gC`/`_C` reconstruidas en `lib/presupuestoEvento.ts`).
 */
/**
 * Corrección (septiembre 2026), pedido explícito del usuario: "si aplica
 * transporte, hospedaje, alimentos, etc, entonces deben habilitarse los
 * campos respectivos... similar a lo que sí ocurre cuando... tienes
 * participación académica de por lo menos un speaker" — es decir, este
 * tipo (usado para "Única sesión" y para cada fila de `sesiones_evento`
 * en "Varias sesiones" cuando NO hay speakers externos) debía tener el
 * mismo detalle que `PresupuestoSpeakerSesion` (usado cuando sí hay
 * speakers externos), y antes de esta corrección le faltaban la mayoría de
 * los campos ("Acorde a la política de viajes", "Tipo de transporte" ya
 * existía pero no se exponía en el formulario de "Varias sesiones",
 * cotización adjunta, taxi, fechas de estancia, motivo de localidad
 * distinta, "Acorde a la política" de hospedaje/alimentos, comentarios).
 * Se agregan los campos que faltaban para igualar el detalle; los que ya
 * existían (`tipoTransporte`, `montoTransporte`, `nombreHotel`,
 * `categoriaHotel`) se conservan con su mismo nombre — no se duplican con
 * los nombres que usa `PresupuestoSpeakerSesion` (p. ej. `valorTransporte`)
 * para no requerir renombrar columnas ya existentes. Columnas nuevas en
 * `sesiones_evento`, ver `db/agregar_presupuesto_completo_sesiones_evento.sql`.
 */
export interface PresupuestoSesion {
  transporteNoAplica: boolean;
  transporteAcordePolitica: boolean;
  transporteMotivoNoAcorde: string;
  tipoTransporte: string;
  montoTransporte: number | null;
  cotizacionAdjunta: boolean;
  taxi: boolean;
  valorEstimadoTaxi: number | null;
  hospedajeNoAplica: boolean;
  hospedajeAcordePolitica: boolean;
  hospedajeMotivoNoAcorde: string;
  fechaInicioEstancia: string | null;
  fechaFinEstancia: string | null;
  numeroNoches: number | null;
  costoNochePersona: number | null;
  nombreHotel: string;
  categoriaHotel: string;
  motivoLocalidadDistinta: string;
  alimentosNoAplica: boolean;
  alimentosAcordePolitica: boolean;
  alimentosMotivoNoAcorde: string;
  montoAlimentosDia: number | null;
  comentariosAlimentos: string;
}

/** Fila de `sesiones_evento` — solo existe cuando `modalidadSesiones === "Varias sesiones"`. */
export interface SesionEvento {
  id: string;
  fecha: string | null;
  lugar: string;
  /**
   * Ronda de ajustes de formularios (septiembre 2026): país/estado/ciudad
   * propios de cada sesión (antes solo existía `lugar`, texto libre) —
   * columnas nuevas `pais`/`estado_provincia`/`ciudad` en `sesiones_evento`.
   * Ver `db/agregar_estado_provincia_speakers_evento.sql`.
   */
  pais: string;
  estadoProvincia: string;
  ciudad: string;
  numeroAsistentesEsperados: number | null;
  presupuesto: PresupuestoSesion;
  listaAsistenciaNoAplica: boolean;
  listaAsistenciaNoAplicaMotivo: string;
}

/**
 * Entrega 31 (octubre 2026): producto del portafolio relacionado con el
 * evento (objetivo promocional). Si hay uno solo, es el principal; si hay
 * varios, exactamente uno lleva `principal: true`. Fila de `evento_productos`
 * (ver `db/entrega_31_horas_productos_linea.sql`).
 */
export interface ProductoEvento {
  productoId: string;
  nombreProducto: string;
  principal: boolean;
}

/** Fila de `evento_muestras_planeadas` — producto del portafolio + cantidad aproximada a entregar. */
export interface MuestraPlaneada {
  id: string;
  productoId: string;
  nombreProducto: string;
  cantidadAproximada: number | null;
}

/**
 * Solicitud de Evento (`solicitudes_evento`) — el documento más grande de
 * los 6, con condicionales anidados y dos modalidades de sesión completas.
 * Reconstruido campo por campo desde el esquema real + extracción forense
 * directa del bundle original (arreglo de columnas `xC`, funciones
 * `jC`/`MC`/`kC`/`AC`/`_x`/`PC`/`FC`).
 *
 * Decisiones de alcance deliberadas para esta fase (documentadas, no
 * silenciosas): los campos de archivo (`cartaInvitacionId`,
 * `programaAcademicoId`) y el repositorio de archivos/registros
 * financieros por evento (`evento_repositorio_archivos`,
 * `evento_registros_financieros`) quedan sin infraestructura real de carga
 * de archivos, igual que `archivoAgendaId` en Convenio y
 * `archivoTarifarioAsociacionId` en FMV — no existe todavía un backend de
 * Storage reconstruido. Se retoma cuando se reconstruya ese subsistema.
 */
/**
 * Ronda de ajustes de formularios (septiembre 2026), entrega 2: presupuesto
 * de transporte/hospedaje/alimentos propio de CADA speaker externo (y de
 * cada sesión, en un evento de "Varias sesiones") — reemplaza, para
 * eventos que declaran speakers externos, al bloque único de
 * transporte/hospedaje/alimentos a nivel de documento o de sesión que
 * existía antes de esta ronda (esos campos viejos — `Evento.transporte*`/
 * `hospedaje*`/`alimentos*` y `SesionEvento.presupuesto` — se conservan en
 * el esquema por compatibilidad con documentos ya guardados, pero dejan de
 * ser editables desde el formulario: la fuente de verdad ahora es esta
 * tabla). `sesionId` es `null` cuando el evento es de "Única sesión" (una
 * sola fila por speaker) y obligatorio cuando es de "Varias sesiones" (una
 * fila por speaker POR sesión). Fila de `evento_speaker_presupuestos` — ver
 * `db/agregar_speakers_evento.sql`.
 */
export interface PresupuestoSpeakerSesion {
  id: string;
  sesionId: string | null;
  /**
   * Entrega 31 (octubre 2026): tiempo de participación del speaker en esta
   * sesión (horas, admite decimales: 1.5 = una hora y media). Obligatorio.
   * Con "Única sesión" se rotula "Tiempo de participación (horas)". Columna
   * nueva `horas_participacion` en `evento_speaker_presupuestos`, ver
   * `db/entrega_31_horas_productos_linea.sql`.
   */
  horasParticipacion: number | null;
  transporteNoAplica: boolean;
  transporteAcordePolitica: boolean;
  transporteMotivoNoAcorde: string;
  tipoTransporte: string;
  valorTransporte: number | null;
  cotizacionAdjunta: boolean;
  taxi: boolean;
  valorEstimadoTaxi: number | null;
  hospedajeNoAplica: boolean;
  hospedajeAcordePolitica: boolean;
  hospedajeMotivoNoAcorde: string;
  fechaInicioEstancia: string | null;
  fechaFinEstancia: string | null;
  costoNochePersona: number | null;
  nombreHotel: string;
  categoriaHotel: string;
  motivoLocalidadDistinta: string;
  alimentosNoAplica: boolean;
  alimentosAcordePolitica: boolean;
  alimentosMotivoNoAcorde: string;
  montoAlimentosDia: number | null;
  comentariosAlimentos: string;
}

/**
 * Ronda de ajustes de formularios (septiembre 2026), entrega 2: un speaker
 * externo participando en la actividad de un Evento — antes de esta ronda
 * solo existía un speaker externo por evento (`Evento.speakerParticipacionId`,
 * que se conserva por compatibilidad pero deja de usarse para el caso
 * externo). El número de filas de este arreglo se gobierna desde
 * `Evento.numeroSpeakersExternos`. Fila de `evento_speakers_participacion`.
 */
export interface SpeakerParticipacionEvento {
  id: string;
  orden: number;
  /**
   * Entrega 22 (octubre 2026): un evento puede tener AL MISMO TIEMPO speakers
   * internos y externos. Cada fila declara de cuál tipo es. Columna opcional
   * `tipo_speaker` (ver `db/entrega_22_speakers_mixtos_congelamiento.sql`); si
   * la columna todavía no existe se infiere: con `speaker_id` del Repositorio
   * es externo, sin él es interno (así se guardaban hasta ahora).
   */
  tipo: "interno" | "externo";
  /** Externo: id del Repositorio de HCPs/Speakers. Interno: siempre `null` (se elige del catálogo "Speakers internos"). */
  speakerId: string | null;
  /** Interno: "Nombre — País" tal como se eligió del catálogo "Speakers internos". */
  nombreSpeaker: string;
  montoInscripcion: number | null;
  /**
   * Ronda de ajustes de formularios (septiembre 2026), entrega "reorganización
   * FormularioEvento": honorarios del speaker, separados de `montoInscripcion`
   * — la especificación es explícita en que "el monto de inscripción y el
   * monto de honorarios del speaker son campos independientes". Antes de
   * esta entrega un único campo (`montoInscripcion`) cubría ambos conceptos.
   * Columna nueva `monto_honorarios` en `evento_speakers_participacion`, ver
   * `db/agregar_monto_honorarios_factura_modalidad_speaker.sql`.
   */
  montoHonorarios: number | null;
  /** "Detallar lo que incluye" la cuota de inscripción — solo se diligencia si `montoInscripcion` > 0. */
  detalleInscripcion: string;
  /**
   * Octubre 2026: "Detallar lo que incluye" los honorarios del speaker — solo
   * se diligencia si `montoHonorarios` > 0. Columna nueva `detalle_honorarios`
   * en `evento_speakers_participacion` (ver `db/agregar_detalle_honorarios_speaker.sql`).
   */
  detalleHonorarios: string;
  /**
   * Ronda de ajustes de formularios (septiembre 2026), entrega "reorganización
   * FormularioEvento": modalidad de factura, ahora por speaker (antes era un
   * único campo a nivel de todo el evento — `Evento.facturaModalidad`, que
   * se conserva por compatibilidad con documentos ya guardados pero deja de
   * editarse desde el formulario). "Factura única" (todas las sesiones en
   * las que participa este speaker) o "Factura por sesión". Columna nueva
   * `factura_modalidad` en `evento_speakers_participacion`.
   */
  facturaModalidad: string;
  /** Una fila si es Única sesión (`sesionId: null`); una por sesión si es Varias sesiones. */
  presupuestos: PresupuestoSpeakerSesion[];
}

export interface Evento {
  id: string;
  tipoDoc: "evento";
  estado: EstadoDoc;
  creadoPorId: string;
  creadoEn: string;

  nombreSolicitante: string;
  nombreSuperiorAprueba: string;
  empresaGrupo: string;
  /**
   * AJUSTES (septiembre 2026), pedido explícito: este campo se renombra en
   * pantalla de "Datos del HCP relacionado" a "Nombre completo del HCP
   * relacionado" y pasa a mostrarse (y exigirse) solo dentro del bloque
   * condicional de "¿Habrá patrocinio / pago de viáticos a un HCP?" — se
   * conserva el nombre interno `datosHCP` (sin renombrar columna de BD,
   * mismo criterio que el resto de renombrados de esta ronda).
   */
  datosHCP: string;
  tipoEvento: string;
  areaEspecialidad: string;
  lineaTerapeutica: string;
  nombreEvento: string;
  organizadoPor: string;
  nombreOrganizador: string;
  /**
   * AJUSTES (septiembre 2026), pedido explícito: nuevo campo "¿Habrá
   * patrocinio / pago de viáticos a un HCP?" (Sí/No) en la sección
   * "Solicitante y evento" — activa el bloque de datos del HCP relacionado
   * (`datosHCP` + los 8 campos `hcp*` de abajo) y la "Justificación de
   * patrocinio / pago de viáticos" (`justificacionViaticos`, renombrada).
   * También habilita, en el repositorio de documentos del evento, la
   * categoría "Certificado de participación en el evento" — ver
   * `RepositorioEvento.tsx`. Columna nueva `patrocinio_hcp` en
   * `solicitudes_evento`.
   */
  patrocinioHcp: boolean;
  /** Número de documento del HCP relacionado — obligatorio cuando `patrocinioHcp` es true. Columna nueva `hcp_numero_documento`. */
  hcpNumeroDocumento: string;
  /** Profesión del HCP relacionado — catálogo "Profesiones" (`useCatalogo("profesiones")`). Columna nueva `hcp_profesion`. */
  hcpProfesion: string;
  /** Especialidad del HCP relacionado — catálogo "Especialidades médicas (FMV)" (`useCatalogo("especialidadesMedicas")`). Columna nueva `hcp_especialidad`. */
  hcpEspecialidad: string;
  /** Dirección del HCP relacionado. Columna nueva `hcp_direccion`. */
  hcpDireccion: string;
  /** País del HCP relacionado — mismo selector en cascada país→estado→ciudad que el resto del formulario (`SelectPaisEstadoCiudad`). Columna nueva `hcp_pais`. */
  hcpPais: string;
  /** Estado/Provincia/Departamento del HCP relacionado. Columna nueva `hcp_estado_provincia`. */
  hcpEstadoProvincia: string;
  /** Ciudad del HCP relacionado. Columna nueva `hcp_ciudad`. */
  hcpCiudad: string;
  /** Teléfono del HCP relacionado. Columna nueva `hcp_telefono`. */
  hcpTelefono: string;
  /** Email del HCP relacionado. Columna nueva `hcp_email`. */
  hcpEmail: string;

  fechaInicioEvento: string | null;
  fechaFinEvento: string | null;
  modalidadSesiones: ModalidadSesiones;
  /**
   * Ronda de ajustes de formularios (septiembre 2026), entrega "reorganización
   * FormularioEvento": número de sesiones declarado explícitamente por el
   * usuario cuando `modalidadSesiones` es "Varias sesiones" — antes no
   * existía como campo propio; la cantidad de sesiones era implícita en el
   * largo del arreglo `sesiones`, que se llenaba fila por fila con
   * "Agregar sesión"/"Quitar sesión". Ahora este número autogenera esas
   * filas (y se mantiene sincronizado si el usuario agrega/quita alguna
   * manualmente después). Columna nueva `numero_sesiones` en
   * `solicitudes_evento`.
   */
  numeroSesiones: number | null;
  facturaModalidad: string;
  listaAsistenciaNoAplica: boolean;
  listaAsistenciaNoAplicaMotivo: string;

  fechaInicioEstancia: string | null;
  fechaFinEstancia: string | null;
  modalidadEvento: ModalidadEvento | null;
  direccion: string;
  pais: string;
  /**
   * Ronda de ajustes de formularios (septiembre 2026): Estado/Provincia/
   * Departamento del evento (única sesión) — catálogo propio "Estados", ver
   * `CATALOGO_SIMPLE`. Columna nueva `estado_provincia` en
   * `solicitudes_evento` (no `estado`, que ya es el `EstadoDoc` del
   * documento) — ver `db/agregar_estado_provincia_speakers_evento.sql`.
   */
  estadoProvincia: string;
  ciudad: string;
  /**
   * AJUSTES (septiembre 2026), pedido explícito: se renombra en pantalla a
   * "Justificación de patrocinio / pago de viáticos", pasa a ser
   * obligatorio y se reubica dentro del bloque de "¿Habrá patrocinio / pago
   * de viáticos a un HCP?" (inmediatamente después del Email del HCP
   * relacionado) — habilitado solo cuando `patrocinioHcp` es true. Se
   * conserva el nombre interno (sin renombrar columna de BD).
   */
  justificacionViaticos: string;
  objetivosEvento: string;
  numeroAsistentes: number | null;

  entregaMuestrasMedicas: boolean;
  detalleMuestrasMedicas: string;
  entregaArticulosPromocionales: boolean;
  detalleArticulosPromocionales: string;
  participacionAcademica: boolean;
  detalleParticipacionAcademica: string;
  quienDictaActividad: QuienDictaActividad | null;
  speakerParticipacionId: string | null;
  nombreSpeakerParticipacion: string;
  /**
   * Ronda de ajustes de formularios (septiembre 2026), entrega 2: número de
   * speakers externos declarado por el solicitante — gobierna cuántas filas
   * de `speakersParticipacion` existen. Solo aplica cuando
   * `quienDictaActividad === "Speaker externo"`; el caso "Speaker interno"
   * sigue siendo un único `nombreSpeakerParticipacion` de texto libre (un
   * empleado interno no tiene cuota de inscripción ni viáticos propios que
   * reconstruir aquí).
   */
  numeroSpeakersExternos: number | null;
  speakersParticipacion: SpeakerParticipacionEvento[];

  incluidoPresupuestoAprobado: boolean;
  montoPresupuestoAprobado: number | null;
  /**
   * Ronda de ajustes de formularios (septiembre 2026), entrega 4: true
   * cuando el solicitante respondió "No" a "¿El evento está incluido en
   * algún presupuesto aprobado?" y eligió "Continuar" en el diálogo de
   * advertencia — se imprime como nota antes del panel de firmas (ver
   * `CuerpoEvento` en `DocumentoImprimible.tsx`). Columna nueva, ver
   * `db/agregar_advertencia_presupuesto_evento.sql`.
   */
  advertenciaPresupuestoNoAprobado: boolean;
  anexos: boolean;
  descripcionAnexos: string;
  cartaInvitacionId: string | null;
  programaAcademicoId: string | null;

  honorariosSpeaker: number | null;
  inscripcionNoAplica: boolean;
  montoInscripcion: number | null;
  detalleInscripcion: string;
  actividadAdicionalInscripcion: boolean;
  detalleActividadAdicional: string;
  actividadIncluidaInscripcion: boolean;
  detalleActividadIncluida: string;

  transporteNoAplica: boolean;
  transporteAcordePolitica: boolean;
  transporteMotivoNoAcorde: string;
  tipoTransporte: string;
  /**
   * Corrección (septiembre 2026), pedido explícito del usuario: faltaban
   * en la sección "Transporte, hospedaje y alimentos" del evento (Única
   * sesión) — antes solo existían para el presupuesto por speaker
   * (`PresupuestoSpeakerSesion.valorTransporte`/`valorEstimadoTaxi`).
   * Columnas nuevas `monto_transporte`/`valor_estimado_taxi` en
   * `solicitudes_evento`, ver
   * `db/agregar_presupuesto_completo_sesiones_evento.sql`.
   */
  montoTransporte: number | null;
  cotizacionAdjunta: boolean;
  taxi: boolean;
  valorEstimadoTaxi: number | null;

  hospedajeNoAplica: boolean;
  hospedajeAcordePolitica: boolean;
  hospedajeMotivoNoAcorde: string;
  numeroNoches: number | null;
  costoNochePersona: number | null;
  nombreHotel: string;
  categoriaHotel: string;
  motivoLocalidadDistinta: string;

  alimentosNoAplica: boolean;
  alimentosAcordePolitica: boolean;
  alimentosMotivoNoAcorde: string;
  montoAlimentosDia: number | null;
  comentariosAlimentos: string;

  condensadoInscripcion: number | null;
  condensadoTransporte: number | null;
  condensadoTraslado: number | null;
  condensadoHospedaje: number | null;
  condensadoAlimentos: number | null;
  condensadoHonorariosSpeaker: number | null;
  condensadoOtro: number | null;
  /** Octubre 2026: casilla "incluir Valor participación" en el condensado + su valor autocargado. */
  incluirValorParticipacion: boolean;
  condensadoValorParticipacion: number | null;
  condensadoOtroEspecificar: string;
  comentariosCosto: string;
  centroCostos: string;
  moneda: string;

  comentariosEspecialesNoAplica: boolean;
  comentariosEspeciales: string;

  motivoAnulacion: string | null;
  anuladoPorId: string | null;
  anuladoEn: string | null;

  adendaVentanaActorId: string | null;
  adendaVentanaExpiraEn: string | null;
  adendaVentanaJustificacion: string | null;

  camposPersonalizados: Record<string, unknown>;
  /**
   * Snapshot congelado de etiquetas de campo + campos personalizados en el
   * momento en que este documento quedó Aprobado/Completado — ver
   * `src/lib/snapshotFormato.ts` y
   * `db/agregar_inmutabilidad_documentos_firmados.sql`.
   */
  snapshotFormato?: unknown;

  aprobaciones: PasoAprobacion[];
  /** Cuándo se envió realmente a firma (ver db/agregar_fecha_envio_a_firma.sql); null/ausente en documentos anteriores a la migración. */
  enviadoAFirmaEn?: string | null;
  sesiones: SesionEvento[];
  muestrasPlaneadas: MuestraPlaneada[];
  /** Entrega 31: productos del portafolio relacionados con el evento (uno marcado como principal). */
  productosEvento: ProductoEvento[];
}

/**
 * Fila de `evento_repositorio_archivos` — Repositorio del Evento (Fase 1,
 * infraestructura de archivos, septiembre 2026; hallazgos D4-D35 del
 * diagnóstico). `sesionId` solo aplica en eventos multisesión (ver
 * `Evento.modalidadSesiones`). Los 4 conteos son específicos de la
 * categoría `listaAsistencia` (cuántas personas de cada tipo asistieron
 * según esa lista) — confirmado por el esquema real de la tabla; se dejan
 * en `null` para cualquier otra categoría.
 */
export interface RepositorioArchivoEvento {
  id: string;
  eventoId: string;
  categoria: CategoriaRepositorioArchivo;
  /** `null` solo en una fila "No aplica" (Expediente del evento, octubre 2026). */
  archivoId: string | null;
  sesionId: string | null;
  /** Speaker al que pertenece el documento (CAF, presentación, evidencia...). `null` = documento del evento completo. */
  speakerId: string | null;
  noAplica: boolean;
  noAplicaMotivo: string;
  /** Marco de la foto (`grupal`, `actividad_1`, `actividad_2`, `speaker`) — solo para `categoria === "fotos"`. */
  etiqueta: string | null;
  /** `manual` (cargado en el Expediente) o `ejecucion` (tomado desde la app de Ejecución en Sitio). */
  origen: "manual" | "ejecucion";
  conteoPersonalMedico: number | null;
  conteoPersonalNoMedico: number | null;
  conteoOtroPersonal: number | null;
  conteoFuerzaVentas: number | null;
}

/**
 * Fila de `evento_registros_financieros` — el otro lado del Repositorio del
 * Evento (Fase 1). `facturaId` es una referencia opcional a OTRO registro de
 * esta misma tabla (no a `archivos_adjuntos`) — por ejemplo, un comprobante
 * de pago que referencia la factura que cubre; se deja como una relación
 * simple (mismo evento) en vez de inferir una FK más estricta, porque no hay
 * evidencia de un trigger o RPC real que la valide.
 */
export interface RegistroFinancieroEvento {
  id: string;
  eventoId: string;
  categoria: CategoriaFinancieraRepositorio;
  archivoId: string;
  numero: string;
  fecha: string | null;
  valor: number | null;
  moneda: string;
  sesionId: string | null;
  facturaId: string | null;
  /**
   * Entrega 36: todas las facturas que cubre un comprobante de pago (una o varias; ids de registros de categoría
   * «facturas»). `facturaId` conserva la primera por compatibilidad. Columna `facturas_ids`
   * (`db/entrega_36_pagos_anotaciones_facturas.sql`); si aún no existe se usa solo `facturaId`.
   */
  facturasIds: string[];
  /** Speaker al que corresponde la OC/factura/comprobante (Expediente del evento, octubre 2026). */
  speakerId: string | null;
}

/**
 * Entrega 36 — anotación sobre el pago de un speaker en un evento (fila de `evento_anotaciones_pago`). Nace en el
 * Expediente (comentarios del comprobante de pago) o en el Informe de Pagos (aclaración de un hallazgo). Es inmutable:
 * solo se puede marcar como aclarada. Autor, rol y fecha los fija la base de datos, por eso hay trazabilidad.
 */
export interface AnotacionPago {
  id: string;
  eventoId: string;
  speakerId: string | null;
  sesionId: string | null;
  /** Comprobante (u otro registro financiero) al que se refiere, si aplica. */
  registroId: string | null;
  origen: "expediente" | "informe_pagos";
  texto: string;
  autorId: string | null;
  autorNombre: string;
  autorRol: string;
  creadoEn: string;
  aclarada: boolean;
  aclaradaPorNombre: string | null;
  aclaradaEn: string | null;
  /** Entrega 39: última edición del texto (null si nunca se editó). */
  editadaEn?: string | null;
  editadaPorNombre?: string | null;
  editadaVeces?: number;
}

/** Fila de `eventos_codigos_acceso` — habilita `ejecucion.html` (Fase 7) para ese evento. */
export interface CodigoAccesoEvento {
  id: string;
  eventoId: string;
  codigo: string;
  activo: boolean;
  creadoPorId: string;
  creadoEn: string;
  expiraEn: string | null;
}

/** Fila de `productos_portafolio` — usada tanto por el selector mínimo de
 * "muestras planeadas" del Evento (Fase 4, `traerProductosResumen`) como por
 * el CRUD completo del Portafolio de Productos (Fase 5, hub de
 * Configuración de Campos). `logoId` queda deferred como los demás campos
 * de archivo (`archivoTarifarioAsociacionId`, etc.) — sin infraestructura de
 * Storage reconstruida todavía. */
export interface ProductoPortafolio {
  id: string;
  nombre: string;
  registroSanitario: string;
  activo: boolean;
  orden: number;
  logoId: string | null;
  empresaGrupo: string;
  /** Entrega 31: Línea terapéutica (catálogo «Líneas terapéuticas»). Obligatoria en productos nuevos. */
  lineaTerapeutica: string;
}

/** Los mismos 4 campos (proceso/código/versión/fecha de emisión) se repiten
 * para cada uno de los 6 tipos de documento, tanto en la configuración
 * global (`configuracion_formatos`, fila única id=1) como en el override
 * por empresa (`configuracion_formatos_empresa`, una fila por
 * `empresaGrupo`) — confirmado por el esquema real de ambas tablas. */
export interface FormatoDocumentoConfig {
  proceso: string;
  codigo: string;
  version: string;
  fechaEmision: string | null;
}

export type ConfiguracionFormatosPorDoc = Record<
  "evento" | "convenio" | "convenioHCP" | "fmv" | "notificacionPago" | "caf",
  FormatoDocumentoConfig
>;

/** `configuracion_formatos` — fila única (id=1) con los valores globales por
 * defecto para los 6 tipos de documento, más el logo institucional y el
 * texto de la declaración de tratamiento de datos. */
export interface ConfiguracionFormatos {
  formatos: ConfiguracionFormatosPorDoc;
  logoId: string | null;
  logoAnchoPx: number | null;
  logoAltoPx: number | null;
  logoAppId: string | null;
  logoAppAnchoPx: number | null;
  logoAppAltoPx: number | null;
  declaracionTratamientoDatos: string;
}

/** `configuracion_formatos_empresa` — override opcional por empresa del
 * grupo: cada campo es nullable y, si está vacío, la impresión usa el valor
 * global de `configuracion_formatos` (esa resolución vive en
 * `lib/configuracionFormatos.ts`, no en esta tabla). No incluye Convenio HCP
 * por separado del resto — sí lo incluye, ver esquema real. */
export interface ConfiguracionFormatosEmpresa {
  empresaGrupo: string;
  formatos: Partial<ConfiguracionFormatosPorDoc>;
  logoId: string | null;
  logoAnchoPx: number | null;
  logoAltoPx: number | null;
  declaracionTratamientoDatos: string | null;
}

/** `formato_oficial_fmv` — historial de versiones del PDF oficial del
 * formulario FMV, opcionalmente por empresa (vacío = aplica a todas). La
 * versión vigente es la de `vigenteDesde` más reciente que ya pasó. La
 * carga real del archivo (`archivoId`) queda deferred — mismo criterio que
 * el resto de campos de archivo de esta reconstrucción. */
export interface FormatoOficialFmv {
  id: string;
  archivoId: string | null;
  fechaCarga: string;
  vigenteDesde: string;
  empresaGrupo: string;
}

/** `configuracion_formatos_historial` — bitácora append-only (ítems #4/#5 de
 * la entrega "Configuración de Formatos"): una fila por cada vez que se
 * guarda la configuración de formato de un tipo de documento (`seccion`
 * "formato") o la Declaración de tratamiento de datos (`seccion`
 * "declaracion_tratamiento_datos"), global o de una empresa. `valores` es
 * una foto de lo que quedó guardado en ese momento — ver comentario en la
 * migración `db/agregar_historial_configuracion_formatos.sql`. */
export interface ConfiguracionFormatosHistorialEntrada {
  id: string;
  fecha: string;
  usuarioId: string | null;
  usuarioEmail: string | null;
  seccion: "formato" | "declaracion_tratamiento_datos";
  tipoDocumento: keyof ConfiguracionFormatosPorDoc | null;
  empresaGrupo: string;
  valores: unknown;
}

/**
 * `speakers` — Repositorio de Speakers, con el cálculo de vigencia de la
 * licencia RETHUS y de la hoja de vida (ver `lib/speakers.ts`, funciones
 * `vigenciaRethus`/`vigenciaHojaVida`). Los 3 campos de archivo
 * (`archivoRethusId`, `archivoHojaVidaId`, `archivoIdentidadId`) quedan
 * deferred, igual que en el resto de la reconstrucción — `hojaVidaAdjunta`
 * es un booleano manual independiente de si hay archivo cargado.
 */
export interface Speaker {
  id: string;
  nombreCompleto: string;
  numeroDocumento: string;
  /**
   * Ronda de ajustes de formularios (septiembre 2026): "Profesión" —
   * distinta de `especialidad` (que ya existía). Ver
   * `db/agregar_campos_nuevo_speaker.sql`.
   */
  profesion: string;
  especialidad: string;
  fotoId: string | null;
  direccion: string;
  pais: string;
  /**
   * Ronda de ajustes de formularios (septiembre 2026): Estado/Provincia/
   * Departamento del HCP — catálogo "estados" (ver `CATALOGO_SIMPLE`). El
   * formulario "Nuevo Speaker" todavía no expone un campo para capturarlo
   * (su propia entrega en esta ronda sigue pendiente); columna lista desde
   * ahora para cuando lo tenga.
   */
  estadoProvincia: string;
  ciudad: string;
  telefono: string;
  email: string;
  licenciaRethus: string;
  fechaVencimientoRethus: string | null;
  rethusIndefinido: boolean;
  archivoRethusId: string | null;
  hojaVidaAdjunta: boolean;
  fechaActualizacionHojaVida: string | null;
  archivoHojaVidaId: string | null;
  archivoIdentidadId: string | null;
  /**
   * Ronda de ajustes de formularios (septiembre 2026): "Empresa(s) del
   * grupo con la(s) cuál(es) tendrá interacción*" — selección múltiple,
   * al menos una. Ver `db/agregar_campos_nuevo_speaker.sql`.
   */
  empresasGrupoInteraccion: string[];
  notas: string;
  /**
   * "Guardar como borrador"/"Confirmar speaker" — mismo patrón que
   * `Usuario.estadoUsuario` (entrega 8). Ver
   * `db/agregar_campos_nuevo_speaker.sql`.
   */
  estado: "Borrador" | "Confirmado";
  creadoPorId: string;
  actualizadoEn: string;
}

/** Fila de `notificaciones` — campanita del encabezado. `documentoRefTipo`/
 * `documentoRefId` son opcionales (una notificación puede no apuntar a un
 * documento concreto). */
export interface Notificacion {
  id: string;
  paraUsuarioId: string;
  tipo: TipoNotificacion;
  mensaje: string;
  documentoRefTipo: TipoDoc | null;
  documentoRefId: string | null;
  leida: boolean;
  creadaEn: string;
}

/** Fila de `solicitudes_restablecimiento_password` — un usuario sin sesión
 * pide que un administrador le restablezca la contraseña (ver
 * `PantallaLogin.tsx`, enlace "Olvidé mi contraseña"); un administrador la
 * resuelve desde Usuarios y Roles llamando a la función Edge
 * `admin-usuarios` (acción `resetear_password`). */
export interface SolicitudRestablecimientoPassword {
  id: string;
  usuarioId: string;
  creadaEn: string;
  resuelta: boolean;
  resueltaEn: string | null;
}

export interface Auditoria {
  id: string;
  documentoId: string;
  tipoDoc: TipoDoc;
  documentoNombre: string;
  actorId: string;
  accion: TipoAccionAuditoria;
  detalle: string;
  ocurridoEn: string;
  empresaGrupo: string | null;
  pais: string | null;
}

/**
 * Fase 6 (Informes y Auditoría) — lectura de las tablas de "Ejecución en
 * Sitio" (`ejecucion.html`, reconstruida en la Fase 7). Estas 3 interfaces
 * son de SOLO LECTURA en esta fase: los informes las consultan directo con
 * `.from()` (RLS ya le permite lectura al personal autenticado), pero
 * ESCRIBIRLAS solo pasa por las RPC públicas
 * (`crear_registro_participacion`/`registrar_muestra_entregada`) que se
 * reconstruyen en la Fase 7 — nunca por `.insert()` directo desde el app
 * principal, mismo criterio ya confirmado para el resto de operaciones
 * sensibles de esta reconstrucción.
 */
export interface RegistroParticipacion {
  id: string;
  eventoId: string;
  sesionEjecucionId: string;
  nombres: string;
  apellidos: string;
  cedula: string;
  tipoDocumento: string;
  profesion: string;
  profesionDetalle: string;
  especialidad: string;
  especialidadOtra: string;
  celular: string;
  email: string;
  autorizaImagenVoz: boolean;
  autorizaDatosPersonales: boolean;
  interesVisitaMedica: string;
  direccion: string;
  ciudad: string;
  pais: string;
  /** Octubre 2026: Estado/Provincia/Departamento (columna nueva, ver `db/agregar_ajustes_ejecucion_expediente.sql`; vacío en registros anteriores). */
  estadoProvincia: string;
  tipoParticipacion: string;
  capturadoEn: string;
  /** Sesión del evento a la que se asoció el registro (si la columna existe en la base real). */
  sesionEventoId?: string | null;
  /** Archivo (`archivos_adjuntos`) con la firma manuscrita capturada en el check-in. */
  firmaId: string | null;
  /** Texto de la declaración de tratamiento de datos / uso de imagen y voz que se le mostró a la persona al firmar (la vigente en ese momento). */
  declaracionTextoMostrado: string;
}

/** Fila de `registros_fuerza_ventas` — personal de fuerza de ventas anotado en Ejecución en Sitio. */
export interface RegistroFuerzaVentas {
  id: string;
  eventoId: string;
  sesionId: string | null;
  nombre: string;
  cargo: string;
  ciudad: string;
  capturadoEn: string;
}

export interface MuestraEntregada {
  id: string;
  registroParticipacionId: string;
  eventoId: string;
  productoId: string;
  cantidad: number;
  capturadoEn: string;
  /** Archivo (`archivos_adjuntos`) con la firma manuscrita con la que la persona confirmó haber recibido las muestras. */
  firmaConfirmacionId: string | null;
}

/** Una "sesión de ejecución" es el turno en que un código de acceso quedó activo en el sitio del evento — el registro de participación se ancla a ella, no directo al código. */
export interface SesionEjecucionEvento {
  id: string;
  eventoId: string;
  codigoAccesoId: string;
  responsableNombre: string;
  iniciadoEn: string;
  expiraEn: string | null;
}
