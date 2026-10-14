SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    CREATE TABLE [dbo].[archivos_adjuntos] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [nombre] NVARCHAR(MAX) NOT NULL,
        [tipo] NVARCHAR(MAX) NOT NULL,
        [tamano_bytes] BIGINT NOT NULL,
        [data_url] NVARCHAR(MAX) NOT NULL,
        [cargado_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT [archivos_adjuntos_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[usuarios] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [nombre] NVARCHAR(MAX) NOT NULL,
        [cargo] NVARCHAR(MAX) NOT NULL,
        [email] NVARCHAR(320) NOT NULL,
        [rol] NVARCHAR(100) NOT NULL,
        [iniciales] NVARCHAR(MAX) NOT NULL,
        [firma_id] UNIQUEIDENTIFIER,
        [debe_cambiar_password] BIT NOT NULL DEFAULT 0,
        [auth_user_id] UNIQUEIDENTIFIER,
        [telefono] NVARCHAR(MAX),
        [paginas_permitidas] NVARCHAR(MAX),
        [empresas_grupo] NVARCHAR(MAX),
        [paises_operacion] NVARCHAR(MAX),
        [es_administrador] BIT NOT NULL DEFAULT 0,
        [administrador_alcance_limitado] BIT NOT NULL DEFAULT 0,
        [numero_documento] NVARCHAR(MAX),
        [pais] NVARCHAR(MAX),
        [estado_provincia] NVARCHAR(MAX),
        [ciudad] NVARCHAR(MAX),
        [observaciones] NVARCHAR(MAX),
        [estado_usuario] NVARCHAR(MAX) NOT NULL DEFAULT N'Confirmado',
        [activo] BIT NOT NULL DEFAULT 1,
        [puede_eliminar_documentos_firmados] BIT NOT NULL DEFAULT 0,
        [area] NVARCHAR(MAX),
        [es_director_area] BIT NOT NULL DEFAULT 0,
        [firma_como_director_area] BIT NOT NULL DEFAULT 0,
        [jefe_inmediato_id] UNIQUEIDENTIFIER,
        [firma_como_jefe_inmediato] BIT NOT NULL DEFAULT 0,
        [firma_como_compliance_latam] BIT NOT NULL DEFAULT 0,
        [archivar_documentos_meses] INT CHECK (archivar_documentos_meses IS NULL OR archivar_documentos_meses >= 0 AND archivar_documentos_meses <= 120),
        [foto_id] UNIQUEIDENTIFIER,
        CONSTRAINT [usuarios_pkey] PRIMARY KEY ([id]),
        CONSTRAINT [UQ_usuarios_email] UNIQUE ([email])
    );

    CREATE TABLE [dbo].[solicitudes_restablecimiento_password] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [usuario_id] UNIQUEIDENTIFIER NOT NULL,
        [creada_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [resuelta] BIT NOT NULL DEFAULT 0,
        [resuelta_en] DATETIMEOFFSET(7),
        CONSTRAINT [solicitudes_restablecimiento_password_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[catalogo_valores] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [catalogo] NVARCHAR(100) NOT NULL,
        [valor] NVARCHAR(MAX) NOT NULL,
        [orden] INT NOT NULL DEFAULT 0,
        CONSTRAINT [catalogo_valores_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[paises_region] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [pais] NVARCHAR(100) NOT NULL,
        [region] NVARCHAR(MAX) NOT NULL,
        CONSTRAINT [paises_region_pkey] PRIMARY KEY ([id]),
        CONSTRAINT [UQ_paises_region_pais] UNIQUE ([pais])
    );

    CREATE TABLE [dbo].[paises_region_ciudades] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [pais_region_id] UNIQUEIDENTIFIER NOT NULL,
        [ciudad] NVARCHAR(MAX) NOT NULL,
        [orden] INT NOT NULL DEFAULT 0,
        CONSTRAINT [paises_region_ciudades_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[speakers] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [nombre_completo] NVARCHAR(MAX) NOT NULL,
        [numero_documento] NVARCHAR(MAX) NOT NULL,
        [especialidad] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [foto_id] UNIQUEIDENTIFIER,
        [direccion] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [pais] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [ciudad] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [telefono] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [email] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [licencia_rethus] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [fecha_vencimiento_rethus] DATE,
        [rethus_indefinido] BIT NOT NULL DEFAULT 0,
        [archivo_rethus_id] UNIQUEIDENTIFIER,
        [hoja_vida_adjunta] BIT NOT NULL DEFAULT 0,
        [fecha_actualizacion_hoja_vida] DATE,
        [archivo_hoja_vida_id] UNIQUEIDENTIFIER,
        [archivo_identidad_id] UNIQUEIDENTIFIER,
        [notas] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [creado_por_id] UNIQUEIDENTIFIER NOT NULL,
        [actualizado_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [estado_provincia] NVARCHAR(MAX),
        [profesion] NVARCHAR(MAX),
        [empresas_grupo_interaccion] NVARCHAR(MAX) NOT NULL DEFAULT N'[]',
        [estado] NVARCHAR(MAX) NOT NULL DEFAULT N'Confirmado',
        CONSTRAINT [speakers_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[solicitudes_evento] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [tipo_doc] NVARCHAR(100) NOT NULL DEFAULT N'evento',
        [estado] NVARCHAR(100) NOT NULL DEFAULT N'Borrador',
        [creado_por_id] UNIQUEIDENTIFIER NOT NULL,
        [creado_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [nombre_solicitante] NVARCHAR(MAX) NOT NULL,
        [nombre_superior_aprueba] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [empresa_grupo] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [datos_hcp] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [tipo_evento] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [area_especialidad] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [linea_terapeutica] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [nombre_evento] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [organizado_por] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [nombre_organizador] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [fecha_inicio_evento] DATE,
        [fecha_fin_evento] DATE,
        [fecha_inicio_estancia] DATE,
        [fecha_fin_estancia] DATE,
        [modalidad_evento] NVARCHAR(100),
        [direccion] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [pais] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [ciudad] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [justificacion_viaticos] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [objetivos_evento] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [numero_asistentes] INT,
        [entrega_muestras_medicas] BIT NOT NULL DEFAULT 0,
        [detalle_muestras_medicas] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [entrega_articulos_promocionales] BIT NOT NULL DEFAULT 0,
        [detalle_articulos_promocionales] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [participacion_academica] BIT NOT NULL DEFAULT 0,
        [detalle_participacion_academica] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [quien_dicta_actividad] NVARCHAR(100),
        [incluido_presupuesto_aprobado] BIT NOT NULL DEFAULT 0,
        [monto_presupuesto_aprobado] DECIMAL(38, 10),
        [anexos] BIT NOT NULL DEFAULT 0,
        [descripcion_anexos] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [carta_invitacion_id] UNIQUEIDENTIFIER,
        [programa_academico_id] UNIQUEIDENTIFIER,
        [honorarios_speaker] DECIMAL(38, 10),
        [inscripcion_no_aplica] BIT NOT NULL DEFAULT 0,
        [monto_inscripcion] DECIMAL(38, 10),
        [detalle_inscripcion] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [actividad_adicional_inscripcion] BIT NOT NULL DEFAULT 0,
        [detalle_actividad_adicional] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [actividad_incluida_inscripcion] BIT NOT NULL DEFAULT 0,
        [detalle_actividad_incluida] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [transporte_no_aplica] BIT NOT NULL DEFAULT 0,
        [transporte_acorde_politica] BIT NOT NULL DEFAULT 1,
        [transporte_motivo_no_acorde] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [tipo_transporte] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [cotizacion_adjunta] BIT NOT NULL DEFAULT 0,
        [taxi] BIT NOT NULL DEFAULT 0,
        [hospedaje_no_aplica] BIT NOT NULL DEFAULT 0,
        [hospedaje_acorde_politica] BIT NOT NULL DEFAULT 1,
        [hospedaje_motivo_no_acorde] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [numero_noches] INT,
        [costo_noche_persona] DECIMAL(38, 10),
        [nombre_hotel] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [categoria_hotel] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [motivo_localidad_distinta] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [alimentos_no_aplica] BIT NOT NULL DEFAULT 0,
        [alimentos_acorde_politica] BIT NOT NULL DEFAULT 1,
        [alimentos_motivo_no_acorde] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [monto_alimentos_dia] DECIMAL(38, 10),
        [comentarios_alimentos] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [condensado_inscripcion] DECIMAL(38, 10),
        [condensado_transporte] DECIMAL(38, 10),
        [condensado_traslado] DECIMAL(38, 10),
        [condensado_hospedaje] DECIMAL(38, 10),
        [condensado_alimentos] DECIMAL(38, 10),
        [condensado_honorarios_speaker] DECIMAL(38, 10),
        [condensado_otro] DECIMAL(38, 10),
        [condensado_otro_especificar] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [comentarios_costo] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [centro_costos] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [moneda] NVARCHAR(MAX) NOT NULL DEFAULT N'USD',
        [comentarios_especiales_no_aplica] BIT NOT NULL DEFAULT 1,
        [comentarios_especiales] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [conteo_personal_medico] INT,
        [conteo_personal_no_medico] INT,
        [conteo_otro_personal] INT,
        [conteo_fuerza_ventas] INT,
        [modalidad_sesiones] NVARCHAR(100) NOT NULL DEFAULT N'Única sesión',
        [factura_modalidad] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [motivo_anulacion] NVARCHAR(MAX),
        [anulado_por_id] UNIQUEIDENTIFIER,
        [anulado_en] DATETIMEOFFSET(7),
        [lista_asistencia_no_aplica] BIT NOT NULL DEFAULT 0,
        [lista_asistencia_no_aplica_motivo] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [speaker_participacion_id] UNIQUEIDENTIFIER,
        [nombre_speaker_participacion] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [adenda_ventana_actor_id] UNIQUEIDENTIFIER,
        [adenda_ventana_expira_en] DATETIMEOFFSET(7),
        [adenda_ventana_justificacion] NVARCHAR(MAX),
        [campos_personalizados] NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
        [advertencia_presupuesto_no_aprobado] BIT NOT NULL DEFAULT 0,
        [estado_provincia] NVARCHAR(MAX),
        [numero_speakers_externos] INT,
        [numero_sesiones] INT,
        [monto_transporte] DECIMAL(38, 10),
        [valor_estimado_taxi] DECIMAL(38, 10),
        [patrocinio_hcp] BIT NOT NULL DEFAULT 0,
        [hcp_numero_documento] NVARCHAR(MAX),
        [hcp_profesion] NVARCHAR(MAX),
        [hcp_especialidad] NVARCHAR(MAX),
        [hcp_direccion] NVARCHAR(MAX),
        [hcp_pais] NVARCHAR(MAX),
        [hcp_estado_provincia] NVARCHAR(MAX),
        [hcp_ciudad] NVARCHAR(MAX),
        [hcp_telefono] NVARCHAR(MAX),
        [hcp_email] NVARCHAR(MAX),
        [snapshot_formato] NVARCHAR(MAX),
        [enviado_a_firma_en] DATETIMEOFFSET(7),
        [incluir_valor_participacion] BIT NOT NULL DEFAULT 0,
        [condensado_valor_participacion] DECIMAL(38, 10),
        CONSTRAINT [solicitudes_evento_pkey] PRIMARY KEY ([id]),
        CONSTRAINT [CK_solicitudes_evento_tipo_doc] CHECK ([tipo_doc] = N'evento')
    );

    CREATE TABLE [dbo].[evento_aprobaciones] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [evento_id] UNIQUEIDENTIFIER NOT NULL,
        [orden] INT NOT NULL,
        [etiqueta] NVARCHAR(MAX) NOT NULL,
        [rol_requerido] NVARCHAR(100) NOT NULL,
        [estado] NVARCHAR(100) NOT NULL DEFAULT N'pendiente',
        [resuelto_por_id] UNIQUEIDENTIFIER,
        [fecha] DATETIMEOFFSET(7),
        [comentario] NVARCHAR(MAX),
        [pendiente_desde] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [firma_congelada_id] UNIQUEIDENTIFIER,
        CONSTRAINT [evento_aprobaciones_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[evento_repositorio_archivos] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [evento_id] UNIQUEIDENTIFIER NOT NULL,
        [categoria] NVARCHAR(100) NOT NULL,
        [archivo_id] UNIQUEIDENTIFIER,
        [sesion_id] UNIQUEIDENTIFIER,
        [conteo_personal_medico] INT,
        [conteo_personal_no_medico] INT,
        [conteo_otro_personal] INT,
        [conteo_fuerza_ventas] INT,
        [speaker_id] UNIQUEIDENTIFIER,
        [no_aplica] BIT NOT NULL DEFAULT 0,
        [no_aplica_motivo] NVARCHAR(MAX),
        [etiqueta] NVARCHAR(MAX),
        [origen] NVARCHAR(MAX) NOT NULL DEFAULT N'manual',
        CONSTRAINT [evento_repositorio_archivos_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[evento_registros_financieros] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [evento_id] UNIQUEIDENTIFIER NOT NULL,
        [categoria] NVARCHAR(100) NOT NULL,
        [archivo_id] UNIQUEIDENTIFIER NOT NULL,
        [numero] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [fecha] DATE,
        [valor] DECIMAL(38, 10),
        [moneda] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [sesion_id] UNIQUEIDENTIFIER,
        [factura_id] UNIQUEIDENTIFIER,
        [speaker_id] UNIQUEIDENTIFIER,
        [facturas_ids] NVARCHAR(MAX) NOT NULL DEFAULT N'[]',
        CONSTRAINT [evento_registros_financieros_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[ajustes_financieros] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [registro_financiero_id] UNIQUEIDENTIFIER NOT NULL,
        [campo] NVARCHAR(100) NOT NULL,
        [valor_anterior] NVARCHAR(MAX) NOT NULL,
        [valor_nuevo] NVARCHAR(MAX) NOT NULL,
        [motivo] NVARCHAR(MAX) NOT NULL,
        [usuario_id] UNIQUEIDENTIFIER NOT NULL,
        [fecha] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT [ajustes_financieros_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[convenios_pago_hcp] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [tipo_doc] NVARCHAR(100) NOT NULL DEFAULT N'convenio',
        [estado] NVARCHAR(100) NOT NULL DEFAULT N'Borrador',
        [creado_por_id] UNIQUEIDENTIFIER NOT NULL,
        [creado_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [evento_origen_id] UNIQUEIDENTIFIER,
        [empleado_responsable_nombre_cargo] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [departamento] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [unidad_negocio_ubicacion] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [tipo_actividad] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [organizado_por] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [organizador] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [speaker_id] UNIQUEIDENTIFIER NOT NULL,
        [hcp_nombre_completo] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [hcp_direccion] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [hcp_pais] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [hcp_ciudad] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [hcp_cedula_licencia] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [hcp_rfc] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [tipo_servicio] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [nombre_evento_servicio] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [fecha_inicio_actividad] DATE,
        [fecha_fin_actividad] DATE,
        [es_consejo_asesores] BIT NOT NULL DEFAULT 0,
        [titulo_consejo_asesores] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [numero_hcp_consejo] INT,
        [justificacion_numero_hcp] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [es_funcionario_gobierno] BIT NOT NULL DEFAULT 0,
        [supuesto_cargo_importante] BIT NOT NULL DEFAULT 0,
        [supuesto_representante_compras] BIT NOT NULL DEFAULT 0,
        [supuesto_influencia_decision_gubernamental] BIT NOT NULL DEFAULT 0,
        [objetivo] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [criterios_seleccion] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [cv_adjunto] BIT NOT NULL DEFAULT 0,
        [contraprestacion_hcp] DECIMAL(38, 10),
        [moneda_contraprestacion] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [consistente_tabulador_tarifas] BIT NOT NULL DEFAULT 0,
        [explicacion_si_no_consistente] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [agenda_reunion] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [archivo_agenda_id] UNIQUEIDENTIFIER,
        [catering_nombre_servicio] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [contraprestacion_catering] DECIMAL(38, 10),
        [lugar_reunion] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [firma_empleado_certifica] BIT NOT NULL DEFAULT 0,
        [sesiones_participacion_ids] NVARCHAR(MAX) NOT NULL DEFAULT N'[]',
        [motivo_anulacion] NVARCHAR(MAX),
        [anulado_por_id] UNIQUEIDENTIFIER,
        [anulado_en] DATETIMEOFFSET(7),
        [adenda_ventana_actor_id] UNIQUEIDENTIFIER,
        [adenda_ventana_expira_en] DATETIMEOFFSET(7),
        [adenda_ventana_justificacion] NVARCHAR(MAX),
        [campos_personalizados] NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
        [hcp_numero_documento] NVARCHAR(MAX),
        [hcp_especialidad] NVARCHAR(MAX),
        [hcp_estado_provincia] NVARCHAR(MAX),
        [advertencia_funcionario_gobierno_confirmada] BIT NOT NULL DEFAULT 0,
        [snapshot_formato] NVARCHAR(MAX),
        [enviado_a_firma_en] DATETIMEOFFSET(7),
        CONSTRAINT [convenios_pago_hcp_pkey] PRIMARY KEY ([id]),
        CONSTRAINT [CK_convenios_pago_hcp_tipo_doc] CHECK ([tipo_doc] = N'convenio')
    );

    CREATE TABLE [dbo].[convenio_aprobaciones] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [convenio_id] UNIQUEIDENTIFIER NOT NULL,
        [orden] INT NOT NULL,
        [etiqueta] NVARCHAR(MAX) NOT NULL,
        [rol_requerido] NVARCHAR(100) NOT NULL,
        [estado] NVARCHAR(100) NOT NULL DEFAULT N'pendiente',
        [resuelto_por_id] UNIQUEIDENTIFIER,
        [fecha] DATETIMEOFFSET(7),
        [comentario] NVARCHAR(MAX),
        [pendiente_desde] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [firma_congelada_id] UNIQUEIDENTIFIER,
        CONSTRAINT [convenio_aprobaciones_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[fmv_checklists] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [tipo_doc] NVARCHAR(100) NOT NULL DEFAULT N'fmv',
        [estado] NVARCHAR(100) NOT NULL DEFAULT N'Borrador',
        [creado_por_id] UNIQUEIDENTIFIER NOT NULL,
        [creado_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [evento_origen_id] UNIQUEIDENTIFIER,
        [speaker_id] UNIQUEIDENTIFIER,
        [region] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [pais] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [fecha] DATE,
        [nombre_completo] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [cv_adjunto] BIT NOT NULL DEFAULT 0,
        [especialidad] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [especialidad_otro] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [licencia_nacional] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [direccion_principal] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [ciudad] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [estado_provincia] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [codigo_postal] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [criterio1] NVARCHAR(100),
        [criterio2] NVARCHAR(100),
        [criterio3] NVARCHAR(100),
        [criterio4] NVARCHAR(100),
        [criterio5] NVARCHAR(100),
        [criterio6] NVARCHAR(100),
        [comentarios_adicionales] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [aplica_tarifario_asociacion] BIT NOT NULL DEFAULT 0,
        [archivo_tarifario_asociacion_id] UNIQUEIDENTIFIER,
        [medical_name] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [medical_role] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [fecha_firma] DATE,
        [firma_electronica] BIT NOT NULL DEFAULT 0,
        [motivo_anulacion] NVARCHAR(MAX),
        [anulado_por_id] UNIQUEIDENTIFIER,
        [anulado_en] DATETIMEOFFSET(7),
        [empresa_grupo] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [campos_personalizados] NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
        [numero_documento] NVARCHAR(MAX),
        [asociacion_cientifica] NVARCHAR(MAX),
        [snapshot_formato] NVARCHAR(MAX),
        [firmado_por_id] UNIQUEIDENTIFIER,
        [firma_congelada_id] UNIQUEIDENTIFIER,
        CONSTRAINT [fmv_checklists_pkey] PRIMARY KEY ([id]),
        CONSTRAINT [CK_fmv_checklists_tipo_doc] CHECK ([tipo_doc] = N'fmv')
    );

    CREATE TABLE [dbo].[notificaciones_pago_hcp] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [tipo_doc] NVARCHAR(100) NOT NULL DEFAULT N'notificacionPago',
        [estado] NVARCHAR(100) NOT NULL DEFAULT N'Borrador',
        [creado_por_id] UNIQUEIDENTIFIER NOT NULL,
        [creado_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [evento_origen_id] UNIQUEIDENTIFIER,
        [convenio_origen_id] UNIQUEIDENTIFIER,
        [speaker_id] UNIQUEIDENTIFIER,
        [nombre_profesional_salud] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [cedula_licencia_profesional] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [productos] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [factura_id] UNIQUEIDENTIFIER,
        [numero_factura] NVARCHAR(MAX),
        [fecha_factura] DATE,
        [valor_factura] DECIMAL(38, 10),
        [moneda_factura] NVARCHAR(MAX),
        [factura_incluye_pago_hcp] BIT NOT NULL DEFAULT 0,
        [factura_incluye_pago_institucion] BIT NOT NULL DEFAULT 0,
        [factura_es_pago_tercero] BIT NOT NULL DEFAULT 0,
        [medical_name] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [medical_role] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [fecha_firma] DATE,
        [firma_electronica] BIT NOT NULL DEFAULT 0,
        [motivo_anulacion] NVARCHAR(MAX),
        [anulado_por_id] UNIQUEIDENTIFIER,
        [anulado_en] DATETIMEOFFSET(7),
        [empresa_grupo] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [campos_personalizados] NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
        [numero_documento_identidad] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [snapshot_formato] NVARCHAR(MAX),
        [firmado_por_id] UNIQUEIDENTIFIER,
        [firma_congelada_id] UNIQUEIDENTIFIER,
        CONSTRAINT [notificaciones_pago_hcp_pkey] PRIMARY KEY ([id]),
        CONSTRAINT [CK_notificaciones_pago_hcp_tipo_doc] CHECK ([tipo_doc] = N'notificacionPago')
    );

    CREATE TABLE [dbo].[auditoria] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [documento_id] UNIQUEIDENTIFIER NOT NULL,
        [tipo_doc] NVARCHAR(100) NOT NULL,
        [documento_nombre] NVARCHAR(MAX) NOT NULL,
        [actor_id] UNIQUEIDENTIFIER NOT NULL,
        [accion] NVARCHAR(100) NOT NULL,
        [detalle] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [ocurrido_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [empresa_grupo] NVARCHAR(MAX),
        [pais] NVARCHAR(MAX),
        CONSTRAINT [auditoria_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[notificaciones] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [para_usuario_id] UNIQUEIDENTIFIER NOT NULL,
        [tipo] NVARCHAR(100) NOT NULL,
        [mensaje] NVARCHAR(MAX) NOT NULL,
        [documento_ref_tipo] NVARCHAR(100),
        [documento_ref_id] UNIQUEIDENTIFIER,
        [leida] BIT NOT NULL DEFAULT 0,
        [creada_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [enviar_email] BIT NOT NULL DEFAULT 1,
        [asunto] NVARCHAR(MAX),
        [clave_evento] NVARCHAR(MAX),
        [variables] NVARCHAR(MAX),
        CONSTRAINT [notificaciones_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[configuracion_formatos] (
        [id] SMALLINT NOT NULL DEFAULT 1,
        [evento_proceso] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [evento_codigo] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [evento_version] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [evento_fecha_emision] DATE,
        [convenio_proceso] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [convenio_codigo] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [convenio_version] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [convenio_fecha_emision] DATE,
        [fmv_proceso] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [fmv_codigo] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [fmv_version] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [fmv_fecha_emision] DATE,
        [notificacion_pago_proceso] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [notificacion_pago_codigo] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [notificacion_pago_version] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [notificacion_pago_fecha_emision] DATE,
        [logo_id] UNIQUEIDENTIFIER,
        [logo_app_id] UNIQUEIDENTIFIER,
        [caf_proceso] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [caf_codigo] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [caf_version] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [caf_fecha_emision] DATE,
        [logo_ancho_px] INT,
        [logo_alto_px] INT,
        [logo_app_ancho_px] INT,
        [logo_app_alto_px] INT,
        [convenio_hcp_proceso] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [convenio_hcp_codigo] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [convenio_hcp_version] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [convenio_hcp_fecha_emision] DATE,
        [declaracion_tratamiento_datos] NVARCHAR(MAX) NOT NULL DEFAULT N'Autorizo de manera voluntaria, previa, explícita, informada e inequívoca a HUMAX PHARMACEUTICAL S.A., su matriz, filiales, compañías relacionadas y sus aliados, en adelante LA COMPAÑÍA en la ejecución de esta actividad para tratar los datos personales recolectados de forma escrita, fotográfica, voz y/o video; de conformidad con la ley colombiana y con la política de protección de datos personales que puede consultarse en nuestra página web www.humax.com.co, las imagenes captadas en fotografías y/o videos pueden ser publicadas en medios digitales y/o impresos (revistas, folletos, volantes, plegables, infográficos, libros, entre otros), tanto en Colombia como en cualquier otro lugar del mundo. Esta autorización comprende la recolección, almacenamiento, uso y circulación de los datos personales para fines exclusivos del objeto social de LA COMPAÑÍA y sus aliados. Entiendo y acepto la normatividad relacionada con competencia. Cualquier consulta y/o reclamación para ejercer su derecho de conocer, rectificar, modificar o suprimir los mismos, podrá realizarla a través de los correos electrónicos: privacidad@bauschhealth.com e info@humax.com.co.',
        CONSTRAINT [configuracion_formatos_pkey] PRIMARY KEY ([id]),
        CONSTRAINT [CK_configuracion_formatos_id] CHECK ([id] = 1)
    );

    CREATE TABLE [dbo].[formato_oficial_fmv] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [archivo_id] UNIQUEIDENTIFIER NOT NULL,
        [fecha_carga] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [vigente_desde] DATE NOT NULL,
        [empresa_grupo] NVARCHAR(MAX),
        CONSTRAINT [formato_oficial_fmv_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[configuracion_fmv] (
        [id] SMALLINT NOT NULL DEFAULT 1,
        [umbral_tier1] INT NOT NULL DEFAULT 15,
        [umbral_tier2] INT NOT NULL DEFAULT 9,
        CONSTRAINT [configuracion_fmv_pkey] PRIMARY KEY ([id]),
        CONSTRAINT [CK_configuracion_fmv_id] CHECK ([id] = 1)
    );

    CREATE TABLE [dbo].[fmv_criterios] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [configuracion_fmv_id] SMALLINT NOT NULL,
        [clave] NVARCHAR(100) NOT NULL,
        [titulo] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [pregunta] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [orden] INT NOT NULL DEFAULT 0,
        CONSTRAINT [fmv_criterios_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[fmv_criterio_opciones] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [criterio_id] UNIQUEIDENTIFIER NOT NULL,
        [valor] NVARCHAR(100) NOT NULL,
        [texto] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        CONSTRAINT [fmv_criterio_opciones_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[configuracion_integraciones] (
        [id] SMALLINT NOT NULL DEFAULT 1,
        [edge_function_url] NVARCHAR(MAX) NOT NULL,
        [webhook_secret] NVARCHAR(MAX) NOT NULL,
        [app_url] NVARCHAR(MAX),
        CONSTRAINT [configuracion_integraciones_pkey] PRIMARY KEY ([id]),
        CONSTRAINT [CK_configuracion_integraciones_id] CHECK ([id] = 1)
    );

    CREATE TABLE [dbo].[sesiones_evento] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [evento_id] UNIQUEIDENTIFIER NOT NULL,
        [fecha] DATE,
        [lugar] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [orden] INT NOT NULL DEFAULT 0,
        [transporte_no_aplica] BIT NOT NULL DEFAULT 0,
        [tipo_transporte] NVARCHAR(MAX),
        [hospedaje_no_aplica] BIT NOT NULL DEFAULT 0,
        [numero_noches] INT,
        [costo_noche_persona] DECIMAL(38, 10),
        [nombre_hotel] NVARCHAR(MAX),
        [categoria_hotel] NVARCHAR(MAX),
        [alimentos_no_aplica] BIT NOT NULL DEFAULT 0,
        [monto_alimentos_dia] DECIMAL(38, 10),
        [numero_asistentes_esperados] INT,
        [monto_transporte] DECIMAL(38, 10),
        [lista_asistencia_no_aplica] BIT NOT NULL DEFAULT 0,
        [lista_asistencia_no_aplica_motivo] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [pais] NVARCHAR(MAX),
        [estado_provincia] NVARCHAR(MAX),
        [ciudad] NVARCHAR(MAX),
        [transporte_acorde_politica] BIT NOT NULL DEFAULT 1,
        [transporte_motivo_no_acorde] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [cotizacion_adjunta] BIT NOT NULL DEFAULT 0,
        [taxi] BIT NOT NULL DEFAULT 0,
        [valor_estimado_taxi] DECIMAL(38, 10),
        [hospedaje_acorde_politica] BIT NOT NULL DEFAULT 1,
        [hospedaje_motivo_no_acorde] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [fecha_inicio_estancia] DATE,
        [fecha_fin_estancia] DATE,
        [motivo_localidad_distinta] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [alimentos_acorde_politica] BIT NOT NULL DEFAULT 1,
        [alimentos_motivo_no_acorde] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [comentarios_alimentos] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        CONSTRAINT [sesiones_evento_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[cafs] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [tipo_doc] NVARCHAR(100) NOT NULL DEFAULT N'caf',
        [estado] NVARCHAR(100) NOT NULL DEFAULT N'Borrador',
        [creado_por_id] UNIQUEIDENTIFIER NOT NULL,
        [creado_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [evento_origen_id] UNIQUEIDENTIFIER NOT NULL,
        [tipo_contrato] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [tipo_contrato_otro_especifique] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [solicitante_nombre] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [solicitante_telefono] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [director_area_nombre] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [director_area_cargo] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [contraparte_nombre] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [contraparte_direccion] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [due_diligence] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [termino_contrato_inicio] DATE,
        [termino_contrato_fin] NVARCHAR(MAX),
        [contraparte_telefono] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [contraparte_correo] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [contraparte_contacto] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [objeto_contrato] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [comentarios] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [monto] DECIMAL(38, 10),
        [moneda] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [codigo_cobro_cuenta] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [codigo_cobro_depto] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [codigo_cobro_prod] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [codigo_cobro_proyecto] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [compania_nombre] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [codigo_documento] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [motivo_anulacion] NVARCHAR(MAX),
        [anulado_por_id] UNIQUEIDENTIFIER,
        [anulado_en] DATETIMEOFFSET(7),
        [adenda_ventana_actor_id] UNIQUEIDENTIFIER,
        [adenda_ventana_expira_en] DATETIMEOFFSET(7),
        [adenda_ventana_justificacion] NVARCHAR(MAX),
        [campos_personalizados] NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
        [speaker_id] UNIQUEIDENTIFIER,
        [snapshot_formato] NVARCHAR(MAX),
        [enviado_a_firma_en] DATETIMEOFFSET(7),
        [elaborado_en_caf_corporativo] BIT NOT NULL DEFAULT 0,
        [contraparte_numero_documento] NVARCHAR(MAX),
        [contraparte_pais] NVARCHAR(MAX),
        [contraparte_estado_provincia] NVARCHAR(MAX),
        [contraparte_ciudad] NVARCHAR(MAX),
        [termino_contrato_determinable] BIT NOT NULL DEFAULT 1,
        [responsables_contrato] NVARCHAR(MAX),
        [aviso_atencion] NVARCHAR(MAX),
        [aviso_con_copia_para] NVARCHAR(MAX),
        CONSTRAINT [cafs_pkey] PRIMARY KEY ([id]),
        CONSTRAINT [CK_cafs_tipo_doc] CHECK ([tipo_doc] = N'caf')
    );

    CREATE TABLE [dbo].[caf_aprobaciones] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [caf_id] UNIQUEIDENTIFIER NOT NULL,
        [orden] INT NOT NULL,
        [etiqueta] NVARCHAR(MAX) NOT NULL,
        [rol_requerido] NVARCHAR(100) NOT NULL,
        [estado] NVARCHAR(100) NOT NULL DEFAULT N'pendiente',
        [resuelto_por_id] UNIQUEIDENTIFIER,
        [fecha] DATETIMEOFFSET(7),
        [comentario] NVARCHAR(MAX),
        [pendiente_desde] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [firma_congelada_id] UNIQUEIDENTIFIER,
        [tipo_firma] NVARCHAR(MAX),
        [automatica] BIT NOT NULL DEFAULT 0,
        [firmantes_ids] NVARCHAR(MAX),
        CONSTRAINT [caf_aprobaciones_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[convenios_hcp] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [tipo_doc] NVARCHAR(100) NOT NULL DEFAULT N'convenioHCP',
        [estado] NVARCHAR(100) NOT NULL DEFAULT N'Borrador',
        [creado_por_id] UNIQUEIDENTIFIER NOT NULL,
        [creado_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [evento_origen_id] UNIQUEIDENTIFIER NOT NULL,
        [caf_id] UNIQUEIDENTIFIER NOT NULL,
        [speaker_id] UNIQUEIDENTIFIER,
        [consultor_nombre] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [consultor_identificacion] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [consultor_credenciales] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [consultor_direccion] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [compania_nombre] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [fecha_efectiva] DATE,
        [objetivo_consultoria] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [servicios_exhibit_a] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [compensacion] DECIMAL(38, 10),
        [moneda] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [plazo_pago_dias] INT,
        [comentarios_pago] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [nombre_director_general] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [clausulas_ajustadas] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [archivo_para_hcp_enviado_en] DATETIMEOFFSET(7),
        [archivo_firmado_hcp_id] UNIQUEIDENTIFIER,
        [consultor_email] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [motivo_anulacion] NVARCHAR(MAX),
        [anulado_por_id] UNIQUEIDENTIFIER,
        [anulado_en] DATETIMEOFFSET(7),
        [objetivo_consultoria_en] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [servicios_exhibit_a_en] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [comentarios_pago_en] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [adenda_ventana_actor_id] UNIQUEIDENTIFIER,
        [adenda_ventana_expira_en] DATETIMEOFFSET(7),
        [adenda_ventana_justificacion] NVARCHAR(MAX),
        [plantilla_version_id] UNIQUEIDENTIFIER,
        [clausulado_snapshot] NVARCHAR(MAX),
        [campos_personalizados] NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
        [snapshot_formato] NVARCHAR(MAX),
        [enviado_a_firma_en] DATETIMEOFFSET(7),
        [cierre_es] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [cierre_en] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [elaborado_en_contratos_corporativo] BIT NOT NULL DEFAULT 0,
        CONSTRAINT [convenios_hcp_pkey] PRIMARY KEY ([id]),
        CONSTRAINT [CK_convenios_hcp_tipo_doc] CHECK ([tipo_doc] = N'convenioHCP')
    );

    CREATE TABLE [dbo].[convenio_hcp_aprobaciones] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [convenio_hcp_id] UNIQUEIDENTIFIER NOT NULL,
        [orden] INT NOT NULL,
        [etiqueta] NVARCHAR(MAX) NOT NULL,
        [rol_requerido] NVARCHAR(100) NOT NULL,
        [estado] NVARCHAR(100) NOT NULL DEFAULT N'pendiente',
        [resuelto_por_id] UNIQUEIDENTIFIER,
        [fecha] DATETIMEOFFSET(7),
        [comentario] NVARCHAR(MAX),
        [pendiente_desde] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [firma_congelada_id] UNIQUEIDENTIFIER,
        CONSTRAINT [convenio_hcp_aprobaciones_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[eventos_codigos_acceso] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [evento_id] UNIQUEIDENTIFIER NOT NULL,
        [codigo] NVARCHAR(100) NOT NULL,
        [activo] BIT NOT NULL DEFAULT 1,
        [creado_por_id] UNIQUEIDENTIFIER NOT NULL,
        [creado_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [expira_en] DATETIMEOFFSET(7),
        CONSTRAINT [eventos_codigos_acceso_pkey] PRIMARY KEY ([id]),
        CONSTRAINT [UQ_eventos_codigos_acceso_codigo] UNIQUE ([codigo])
    );

    CREATE TABLE [dbo].[sesiones_ejecucion_evento] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [evento_id] UNIQUEIDENTIFIER NOT NULL,
        [codigo_acceso_id] UNIQUEIDENTIFIER NOT NULL,
        [token] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [responsable_nombre] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [iniciado_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [expira_en] DATETIMEOFFSET(7),
        CONSTRAINT [sesiones_ejecucion_evento_pkey] PRIMARY KEY ([id]),
        CONSTRAINT [UQ_sesiones_ejecucion_evento_token] UNIQUE ([token])
    );

    CREATE TABLE [dbo].[productos_portafolio] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [nombre] NVARCHAR(MAX) NOT NULL,
        [registro_sanitario] NVARCHAR(MAX),
        [activo] BIT NOT NULL DEFAULT 1,
        [orden] INT NOT NULL DEFAULT 0,
        [logo_id] UNIQUEIDENTIFIER,
        [empresa_grupo] NVARCHAR(MAX),
        [linea_terapeutica] NVARCHAR(MAX),
        CONSTRAINT [productos_portafolio_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[evento_muestras_planeadas] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [evento_id] UNIQUEIDENTIFIER NOT NULL,
        [producto_id] UNIQUEIDENTIFIER NOT NULL,
        [cantidad_aproximada] INT,
        [orden] INT NOT NULL DEFAULT 0,
        CONSTRAINT [evento_muestras_planeadas_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[registros_participacion] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [evento_id] UNIQUEIDENTIFIER NOT NULL,
        [sesion_ejecucion_id] UNIQUEIDENTIFIER NOT NULL,
        [nombres] NVARCHAR(MAX) NOT NULL,
        [apellidos] NVARCHAR(MAX) NOT NULL,
        [cedula] NVARCHAR(MAX) NOT NULL,
        [profesion] NVARCHAR(MAX) NOT NULL,
        [profesion_detalle] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [especialidad] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [especialidad_otra] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [celular] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [email] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [autoriza_imagen_voz] BIT NOT NULL,
        [autoriza_datos_personales] BIT NOT NULL,
        [firma_id] UNIQUEIDENTIFIER NOT NULL,
        [declaracion_texto_mostrado] NVARCHAR(MAX) NOT NULL,
        [interes_visita_medica] NVARCHAR(MAX) NOT NULL,
        [direccion] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [ciudad] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [tipo_participacion] NVARCHAR(MAX) NOT NULL,
        [capturado_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [pais] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [sesion_id] UNIQUEIDENTIFIER,
        [tipo_documento] NVARCHAR(MAX) NOT NULL DEFAULT N'Cédula',
        [estado_provincia] NVARCHAR(MAX),
        CONSTRAINT [registros_participacion_pkey] PRIMARY KEY ([id]),
        CONSTRAINT [CK_registros_participacion_profesion] CHECK ([profesion] IN (N'medico', N'no_medico')),
        CONSTRAINT [CK_registros_participacion_interes_visita_medica] CHECK ([interes_visita_medica] IN (N'si', N'no', N'ya_recibe')),
        CONSTRAINT [CK_registros_participacion_tipo_participacion] CHECK ([tipo_participacion] IN (N'evento', N'taller', N'stand'))
    );

    CREATE TABLE [dbo].[muestras_entregadas] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [registro_participacion_id] UNIQUEIDENTIFIER NOT NULL,
        [evento_id] UNIQUEIDENTIFIER NOT NULL,
        [producto_id] UNIQUEIDENTIFIER NOT NULL,
        [cantidad] INT NOT NULL,
        [firma_confirmacion_id] UNIQUEIDENTIFIER NOT NULL,
        [capturado_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT [muestras_entregadas_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[adendas_solicitud_evento] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [evento_id] UNIQUEIDENTIFIER NOT NULL,
        [solicitado_por_id] UNIQUEIDENTIFIER NOT NULL,
        [solicitado_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [justificacion] NVARCHAR(MAX) NOT NULL,
        [entrega_muestras_medicas_antes] BIT,
        [entrega_muestras_medicas_despues] BIT,
        [muestras_planeadas_antes] NVARCHAR(MAX),
        [muestras_planeadas_despues] NVARCHAR(MAX),
        [snapshot_antes] NVARCHAR(MAX),
        [snapshot_despues] NVARCHAR(MAX),
        [tipo] NVARCHAR(MAX) NOT NULL DEFAULT N'muestras_medicas',
        CONSTRAINT [adendas_solicitud_evento_pkey] PRIMARY KEY ([id]),
        CONSTRAINT [CK_adendas_solicitud_evento_tipo] CHECK ([tipo] IN (N'muestras_medicas', N'formulario_completo'))
    );

    CREATE TABLE [dbo].[adendas_convenio_pago_hcp] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [convenio_id] UNIQUEIDENTIFIER NOT NULL,
        [solicitado_por_id] UNIQUEIDENTIFIER NOT NULL,
        [solicitado_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [justificacion] NVARCHAR(MAX) NOT NULL,
        [snapshot_antes] NVARCHAR(MAX),
        [snapshot_despues] NVARCHAR(MAX),
        CONSTRAINT [adendas_convenio_pago_hcp_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[plantilla_convenio_hcp_version] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [vigente_desde] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [creado_por_id] UNIQUEIDENTIFIER,
        [notas_version] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [numerales] NVARCHAR(MAX) NOT NULL,
        [anexo_c_en] NVARCHAR(MAX) NOT NULL,
        [anexo_c_es] NVARCHAR(MAX) NOT NULL,
        [anexo_d_en] NVARCHAR(MAX) NOT NULL,
        [anexo_d_es] NVARCHAR(MAX) NOT NULL,
        [empresa_grupo] NVARCHAR(MAX),
        CONSTRAINT [plantilla_convenio_hcp_version_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[convenio_hcp_ajustes_clausula] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [convenio_hcp_id] UNIQUEIDENTIFIER NOT NULL,
        [seccion] NVARCHAR(MAX) NOT NULL,
        [texto_en] NVARCHAR(MAX) NOT NULL,
        [texto_es] NVARCHAR(MAX) NOT NULL,
        [justificacion] NVARCHAR(MAX) NOT NULL,
        [creado_por_id] UNIQUEIDENTIFIER NOT NULL,
        [creado_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT [convenio_hcp_ajustes_clausula_pkey] PRIMARY KEY ([id]),
        CONSTRAINT [CK_convenio_hcp_ajustes_clausula_seccion] CHECK ([seccion] IN (N'numeral_1', N'numeral_2', N'numeral_3', N'numeral_4', N'numeral_5', N'numeral_6', N'numeral_7', N'numeral_8', N'numeral_9', N'numeral_10', N'numeral_11', N'numeral_12', N'numeral_13', N'numeral_14', N'numeral_15', N'anexo_c', N'anexo_d'))
    );

    CREATE TABLE [dbo].[etiquetas_campo] (
        [formulario] NVARCHAR(50) NOT NULL,
        [campo_key] NVARCHAR(150) NOT NULL,
        [etiqueta] NVARCHAR(MAX) NOT NULL,
        [actualizado_por_id] UNIQUEIDENTIFIER,
        [actualizado_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [empresa_grupo] NVARCHAR(150) NOT NULL DEFAULT N'',
        CONSTRAINT [etiquetas_campo_pkey] PRIMARY KEY ([formulario], [campo_key], [empresa_grupo]),
        CONSTRAINT [CK_etiquetas_campo_formulario] CHECK ([formulario] IN (N'evento', N'convenio', N'fmv', N'caf', N'notificacionPago', N'convenioHCP'))
    );

    CREATE TABLE [dbo].[configuracion_formatos_empresa] (
        [empresa_grupo] NVARCHAR(150) NOT NULL,
        [evento_proceso] NVARCHAR(MAX),
        [evento_codigo] NVARCHAR(MAX),
        [evento_version] NVARCHAR(MAX),
        [evento_fecha_emision] DATE,
        [convenio_proceso] NVARCHAR(MAX),
        [convenio_codigo] NVARCHAR(MAX),
        [convenio_version] NVARCHAR(MAX),
        [convenio_fecha_emision] DATE,
        [fmv_proceso] NVARCHAR(MAX),
        [fmv_codigo] NVARCHAR(MAX),
        [fmv_version] NVARCHAR(MAX),
        [fmv_fecha_emision] DATE,
        [notificacion_pago_proceso] NVARCHAR(MAX),
        [notificacion_pago_codigo] NVARCHAR(MAX),
        [notificacion_pago_version] NVARCHAR(MAX),
        [notificacion_pago_fecha_emision] DATE,
        [caf_proceso] NVARCHAR(MAX),
        [caf_codigo] NVARCHAR(MAX),
        [caf_version] NVARCHAR(MAX),
        [caf_fecha_emision] DATE,
        [convenio_hcp_proceso] NVARCHAR(MAX),
        [convenio_hcp_codigo] NVARCHAR(MAX),
        [convenio_hcp_version] NVARCHAR(MAX),
        [convenio_hcp_fecha_emision] DATE,
        [logo_id] UNIQUEIDENTIFIER,
        [logo_ancho_px] INT,
        [logo_alto_px] INT,
        [declaracion_tratamiento_datos] NVARCHAR(MAX),
        CONSTRAINT [configuracion_formatos_empresa_pkey] PRIMARY KEY ([empresa_grupo])
    );

    CREATE TABLE [dbo].[campos_personalizados_definicion] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [formulario] NVARCHAR(MAX) NOT NULL,
        [clave] NVARCHAR(MAX) NOT NULL,
        [etiqueta] NVARCHAR(MAX) NOT NULL,
        [tipo] NVARCHAR(MAX) NOT NULL,
        [opciones] NVARCHAR(MAX) NOT NULL DEFAULT N'[]',
        [obligatorio] BIT NOT NULL DEFAULT 0,
        [activo] BIT NOT NULL DEFAULT 1,
        [empresa_grupo] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [pais] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [orden] INT NOT NULL DEFAULT 0,
        [calculado_operador] NVARCHAR(MAX) CHECK ([calculado_operador] IN (N'suma', N'resta')),
        [calculado_campo_a] NVARCHAR(MAX),
        [calculado_campo_b] NVARCHAR(MAX),
        [creado_por_id] UNIQUEIDENTIFIER,
        [actualizado_por_id] UNIQUEIDENTIFIER,
        [creado_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [actualizado_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [seccion] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [ancla_campo] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        CONSTRAINT [campos_personalizados_definicion_pkey] PRIMARY KEY ([id]),
        CONSTRAINT [CK_campos_personalizados_definicion_formulario] CHECK ([formulario] IN (N'evento', N'convenio', N'fmv', N'caf', N'notificacionPago', N'convenioHCP')),
        CONSTRAINT [CK_campos_personalizados_definicion_tipo] CHECK ([tipo] IN (N'texto_corto', N'texto_largo', N'numero', N'fecha', N'lista', N'si_no'))
    );

    CREATE TABLE [dbo].[campos_personalizados_regla_comparacion] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [formulario] NVARCHAR(MAX) NOT NULL,
        [nombre] NVARCHAR(MAX) NOT NULL,
        [operando_a] NVARCHAR(MAX) NOT NULL,
        [operando_b] NVARCHAR(MAX) NOT NULL,
        [operador] NVARCHAR(MAX) NOT NULL,
        [mensaje_error] NVARCHAR(MAX) NOT NULL,
        [empresa_grupo] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [pais] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [activo] BIT NOT NULL DEFAULT 1,
        [orden] INT NOT NULL DEFAULT 0,
        [creado_por_id] UNIQUEIDENTIFIER,
        [actualizado_por_id] UNIQUEIDENTIFIER,
        [creado_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [actualizado_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT [campos_personalizados_regla_comparacion_pkey] PRIMARY KEY ([id]),
        CONSTRAINT [CK_campos_personalizados_regla_comparacion_formulario] CHECK ([formulario] IN (N'evento', N'convenio', N'fmv', N'caf', N'notificacionPago', N'convenioHCP')),
        CONSTRAINT [CK_campos_personalizados_regla_comparacion_operador] CHECK ([operador] IN (N'<=', N'>=', N'=', N'<', N'>'))
    );

    CREATE TABLE [dbo].[evento_speakers_participacion] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [evento_id] UNIQUEIDENTIFIER NOT NULL,
        [orden] INT NOT NULL DEFAULT 0,
        [speaker_id] UNIQUEIDENTIFIER,
        [nombre_speaker] NVARCHAR(MAX),
        [monto_inscripcion] DECIMAL(38, 10),
        [detalle_inscripcion] NVARCHAR(MAX),
        [monto_honorarios] DECIMAL(38, 10),
        [factura_modalidad] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [tipo_speaker] NVARCHAR(MAX) CHECK ([tipo_speaker] IN (N'interno', N'externo')),
        [detalle_honorarios] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        CONSTRAINT [evento_speakers_participacion_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[evento_speaker_presupuestos] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [evento_speaker_id] UNIQUEIDENTIFIER NOT NULL,
        [sesion_id] UNIQUEIDENTIFIER,
        [transporte_no_aplica] BIT NOT NULL DEFAULT 0,
        [transporte_acorde_politica] BIT NOT NULL DEFAULT 1,
        [transporte_motivo_no_acorde] NVARCHAR(MAX),
        [tipo_transporte] NVARCHAR(MAX),
        [valor_transporte] DECIMAL(38, 10),
        [cotizacion_adjunta] BIT NOT NULL DEFAULT 0,
        [taxi] BIT NOT NULL DEFAULT 0,
        [valor_estimado_taxi] DECIMAL(38, 10),
        [hospedaje_no_aplica] BIT NOT NULL DEFAULT 0,
        [hospedaje_acorde_politica] BIT NOT NULL DEFAULT 1,
        [hospedaje_motivo_no_acorde] NVARCHAR(MAX),
        [fecha_inicio_estancia] DATE,
        [fecha_fin_estancia] DATE,
        [costo_noche_persona] DECIMAL(38, 10),
        [nombre_hotel] NVARCHAR(MAX),
        [categoria_hotel] NVARCHAR(MAX),
        [motivo_localidad_distinta] NVARCHAR(MAX),
        [alimentos_no_aplica] BIT NOT NULL DEFAULT 0,
        [alimentos_acorde_politica] BIT NOT NULL DEFAULT 1,
        [alimentos_motivo_no_acorde] NVARCHAR(MAX),
        [monto_alimentos_dia] DECIMAL(38, 10),
        [comentarios_alimentos] NVARCHAR(MAX),
        [horas_participacion] DECIMAL(38, 10),
        CONSTRAINT [evento_speaker_presupuestos_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[configuracion_formatos_historial] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [fecha] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [usuario_id] UNIQUEIDENTIFIER,
        [usuario_email] NVARCHAR(MAX),
        [seccion] NVARCHAR(MAX) NOT NULL,
        [tipo_documento] NVARCHAR(MAX),
        [empresa_grupo] NVARCHAR(MAX),
        [valores] NVARCHAR(MAX) NOT NULL,
        CONSTRAINT [configuracion_formatos_historial_pkey] PRIMARY KEY ([id]),
        CONSTRAINT [CK_configuracion_formatos_historial_seccion] CHECK ([seccion] IN (N'formato', N'declaracion_tratamiento_datos'))
    );

    CREATE TABLE [dbo].[envios_documentos] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [tipo_doc] NVARCHAR(100) NOT NULL,
        [documento_id] UNIQUEIDENTIFIER NOT NULL,
        [destinatario_email] NVARCHAR(MAX) NOT NULL,
        [destinatario_nombre] NVARCHAR(MAX),
        [asunto] NVARCHAR(MAX) NOT NULL,
        [mensaje] NVARCHAR(MAX),
        [archivos_ids] NVARCHAR(MAX) NOT NULL DEFAULT N'[]',
        [enviado_por_id] UNIQUEIDENTIFIER NOT NULL,
        [enviado_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [exito] BIT NOT NULL DEFAULT 1,
        [error] NVARCHAR(MAX),
        CONSTRAINT [envios_documentos_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[recordatorios_documentos_soporte_enviados] (
        [evento_id] UNIQUEIDENTIFIER NOT NULL,
        [fecha_envio] DATE NOT NULL,
        [nivel] NVARCHAR(MAX) NOT NULL,
        [documentos_pendientes] NVARCHAR(MAX) NOT NULL DEFAULT N'[]',
        [enviado_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT [recordatorios_documentos_soporte_enviados_pkey] PRIMARY KEY ([evento_id], [fecha_envio]),
        CONSTRAINT [CK_recordatorios_documentos_soporte_enviados_nivel] CHECK ([nivel] IN (N'normal', N'enfatico'))
    );

    CREATE TABLE [dbo].[registros_fuerza_ventas] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [evento_id] UNIQUEIDENTIFIER NOT NULL,
        [sesion_ejecucion_id] UNIQUEIDENTIFIER,
        [sesion_id] UNIQUEIDENTIFIER,
        [nombre] NVARCHAR(MAX) NOT NULL,
        [cargo] NVARCHAR(MAX) NOT NULL,
        [ciudad] NVARCHAR(MAX) NOT NULL,
        [capturado_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT [registros_fuerza_ventas_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[evento_distribucion_asistentes] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [evento_id] UNIQUEIDENTIFIER NOT NULL,
        [sesion_id] UNIQUEIDENTIFIER,
        [conteo_otro_personal] INT NOT NULL DEFAULT 0,
        [actualizado_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT [evento_distribucion_asistentes_pkey] PRIMARY KEY ([id]),
        CONSTRAINT [CK_evento_distribucion_asistentes_conteo_otro_personal] CHECK ([conteo_otro_personal] >= 0)
    );

    CREATE TABLE [dbo].[notificaciones_config] (
        [clave] NVARCHAR(100) NOT NULL,
        [activo] BIT NOT NULL DEFAULT 1,
        [copiar_administradores] BIT NOT NULL DEFAULT 1,
        [cc_roles] NVARCHAR(MAX) NOT NULL DEFAULT N'[]',
        [cc_usuarios] NVARCHAR(MAX) NOT NULL DEFAULT N'[]',
        [asunto_plantilla] NVARCHAR(MAX),
        [cuerpo_plantilla] NVARCHAR(MAX),
        [actualizado_por_id] UNIQUEIDENTIFIER,
        [actualizado_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [mensaje_plantilla] NVARCHAR(MAX),
        CONSTRAINT [notificaciones_config_pkey] PRIMARY KEY ([clave])
    );

    CREATE TABLE [dbo].[notificaciones_config_historial] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [clave] NVARCHAR(MAX) NOT NULL,
        [cambiado_por_id] UNIQUEIDENTIFIER,
        [cambiado_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [antes] NVARCHAR(MAX),
        [despues] NVARCHAR(MAX),
        CONSTRAINT [notificaciones_config_historial_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[telemetria_sesiones] (
        [id] UNIQUEIDENTIFIER NOT NULL,
        [usuario_id] UNIQUEIDENTIFIER NOT NULL,
        [empresa_grupo] NVARCHAR(MAX),
        [inicio] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [ultimo_latido] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [fin] DATETIMEOFFSET(7),
        [segundos_totales] INT NOT NULL DEFAULT 0,
        [segundos_activos] INT NOT NULL DEFAULT 0,
        [navegador] NVARCHAR(MAX),
        [version_app] NVARCHAR(MAX),
        CONSTRAINT [telemetria_sesiones_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[telemetria_eventos] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [sesion_id] UNIQUEIDENTIFIER,
        [usuario_id] UNIQUEIDENTIFIER NOT NULL,
        [creado_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [categoria] NVARCHAR(MAX) NOT NULL,
        [nombre] NVARCHAR(MAX) NOT NULL,
        [tipo_doc] NVARCHAR(MAX),
        [documento_id] UNIQUEIDENTIFIER,
        [resultado] NVARCHAR(MAX),
        [duracion_ms] INT,
        [activo_ms] INT,
        [tamano_bytes] BIGINT,
        [detalle] NVARCHAR(MAX),
        CONSTRAINT [telemetria_eventos_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[telemetria_reinicios] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [reiniciado_por_id] UNIQUEIDENTIFIER,
        [reiniciado_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [sesiones_borradas] INT,
        [eventos_borrados] INT,
        CONSTRAINT [telemetria_reinicios_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[evento_productos] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [evento_id] UNIQUEIDENTIFIER NOT NULL,
        [producto_id] UNIQUEIDENTIFIER NOT NULL,
        [es_principal] BIT NOT NULL DEFAULT 0,
        [orden] INT NOT NULL DEFAULT 0,
        [creado_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT [evento_productos_pkey] PRIMARY KEY ([id])
    );

    CREATE TABLE [dbo].[backups_registro] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [creado_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [origen] NVARCHAR(MAX) NOT NULL,
        [estado] NVARCHAR(MAX) NOT NULL,
        [creado_por_auth_uid] UNIQUEIDENTIFIER,
        [creado_por_nombre] NVARCHAR(MAX),
        [nombre_archivo] NVARCHAR(MAX),
        [destino] NVARCHAR(MAX),
        [total_tablas] INT,
        [total_filas] BIGINT,
        [tamano_bytes] BIGINT,
        [mensaje] NVARCHAR(MAX),
        CONSTRAINT [backups_registro_pkey] PRIMARY KEY ([id]),
        CONSTRAINT [CK_backups_registro_origen] CHECK ([origen] IN (N'manual', N'programado', N'seguridad', N'restauracion')),
        CONSTRAINT [CK_backups_registro_estado] CHECK ([estado] IN (N'ok', N'error'))
    );

    CREATE TABLE [dbo].[backups_restauracion_activa] (
        [auth_uid] UNIQUEIDENTIFIER NOT NULL,
        [iniciada_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [expira_en] DATETIMEOFFSET(7) NOT NULL,
        CONSTRAINT [backups_restauracion_activa_pkey] PRIMARY KEY ([auth_uid])
    );

    CREATE TABLE [dbo].[evento_anotaciones_pago] (
        [id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [evento_id] UNIQUEIDENTIFIER NOT NULL,
        [speaker_id] UNIQUEIDENTIFIER,
        [sesion_id] UNIQUEIDENTIFIER,
        [registro_id] UNIQUEIDENTIFIER,
        [origen] NVARCHAR(MAX) NOT NULL DEFAULT N'expediente',
        [texto] NVARCHAR(MAX) NOT NULL,
        [autor_id] UNIQUEIDENTIFIER,
        [autor_nombre] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [autor_rol] NVARCHAR(MAX) NOT NULL DEFAULT N'',
        [creado_en] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        [aclarada] BIT NOT NULL DEFAULT 0,
        [aclarada_por_id] UNIQUEIDENTIFIER,
        [aclarada_por_nombre] NVARCHAR(MAX),
        [aclarada_en] DATETIMEOFFSET(7),
        [editada_en] DATETIMEOFFSET(7),
        [editada_por_nombre] NVARCHAR(MAX),
        [editada_veces] INT NOT NULL DEFAULT 0,
        CONSTRAINT [evento_anotaciones_pago_pkey] PRIMARY KEY ([id]),
        CONSTRAINT [CK_evento_anotaciones_pago_origen] CHECK ([origen] IN (N'expediente', N'informe_pagos')),
        CONSTRAINT [CK_evento_anotaciones_pago_texto] CHECK (LEN(LTRIM(RTRIM([texto]))) > 0)
    );

    CREATE UNIQUE INDEX [UX_usuarios_auth_user_id] ON [dbo].[usuarios] ([auth_user_id]) WHERE [auth_user_id] IS NOT NULL;

    ALTER TABLE [dbo].[usuarios] ADD CONSTRAINT [usuarios_firma_id_fkey] FOREIGN KEY ([firma_id]) REFERENCES [dbo].[archivos_adjuntos] ([id]);
    ALTER TABLE [dbo].[usuarios] ADD CONSTRAINT [usuarios_jefe_inmediato_id_fkey] FOREIGN KEY ([jefe_inmediato_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[usuarios] ADD CONSTRAINT [usuarios_foto_id_fkey] FOREIGN KEY ([foto_id]) REFERENCES [dbo].[archivos_adjuntos] ([id]);
    ALTER TABLE [dbo].[solicitudes_restablecimiento_password] ADD CONSTRAINT [solicitudes_restablecimiento_password_usuario_id_fkey] FOREIGN KEY ([usuario_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[paises_region_ciudades] ADD CONSTRAINT [paises_region_ciudades_pais_region_id_fkey] FOREIGN KEY ([pais_region_id]) REFERENCES [dbo].[paises_region] ([id]);
    ALTER TABLE [dbo].[speakers] ADD CONSTRAINT [speakers_foto_id_fkey] FOREIGN KEY ([foto_id]) REFERENCES [dbo].[archivos_adjuntos] ([id]);
    ALTER TABLE [dbo].[speakers] ADD CONSTRAINT [speakers_archivo_rethus_id_fkey] FOREIGN KEY ([archivo_rethus_id]) REFERENCES [dbo].[archivos_adjuntos] ([id]);
    ALTER TABLE [dbo].[speakers] ADD CONSTRAINT [speakers_archivo_hoja_vida_id_fkey] FOREIGN KEY ([archivo_hoja_vida_id]) REFERENCES [dbo].[archivos_adjuntos] ([id]);
    ALTER TABLE [dbo].[speakers] ADD CONSTRAINT [speakers_archivo_identidad_id_fkey] FOREIGN KEY ([archivo_identidad_id]) REFERENCES [dbo].[archivos_adjuntos] ([id]);
    ALTER TABLE [dbo].[speakers] ADD CONSTRAINT [speakers_creado_por_id_fkey] FOREIGN KEY ([creado_por_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[solicitudes_evento] ADD CONSTRAINT [solicitudes_evento_creado_por_id_fkey] FOREIGN KEY ([creado_por_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[solicitudes_evento] ADD CONSTRAINT [solicitudes_evento_carta_invitacion_id_fkey] FOREIGN KEY ([carta_invitacion_id]) REFERENCES [dbo].[archivos_adjuntos] ([id]);
    ALTER TABLE [dbo].[solicitudes_evento] ADD CONSTRAINT [solicitudes_evento_programa_academico_id_fkey] FOREIGN KEY ([programa_academico_id]) REFERENCES [dbo].[archivos_adjuntos] ([id]);
    ALTER TABLE [dbo].[solicitudes_evento] ADD CONSTRAINT [solicitudes_evento_anulado_por_id_fkey] FOREIGN KEY ([anulado_por_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[solicitudes_evento] ADD CONSTRAINT [solicitudes_evento_speaker_participacion_id_fkey] FOREIGN KEY ([speaker_participacion_id]) REFERENCES [dbo].[speakers] ([id]);
    ALTER TABLE [dbo].[solicitudes_evento] ADD CONSTRAINT [solicitudes_evento_adenda_ventana_actor_id_fkey] FOREIGN KEY ([adenda_ventana_actor_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[evento_aprobaciones] ADD CONSTRAINT [evento_aprobaciones_evento_id_fkey] FOREIGN KEY ([evento_id]) REFERENCES [dbo].[solicitudes_evento] ([id]);
    ALTER TABLE [dbo].[evento_aprobaciones] ADD CONSTRAINT [evento_aprobaciones_resuelto_por_id_fkey] FOREIGN KEY ([resuelto_por_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[evento_repositorio_archivos] ADD CONSTRAINT [evento_repositorio_archivos_evento_id_fkey] FOREIGN KEY ([evento_id]) REFERENCES [dbo].[solicitudes_evento] ([id]);
    ALTER TABLE [dbo].[evento_repositorio_archivos] ADD CONSTRAINT [evento_repositorio_archivos_archivo_id_fkey] FOREIGN KEY ([archivo_id]) REFERENCES [dbo].[archivos_adjuntos] ([id]);
    ALTER TABLE [dbo].[evento_repositorio_archivos] ADD CONSTRAINT [evento_repositorio_archivos_sesion_id_fkey] FOREIGN KEY ([sesion_id]) REFERENCES [dbo].[sesiones_evento] ([id]);
    ALTER TABLE [dbo].[evento_repositorio_archivos] ADD CONSTRAINT [evento_repositorio_archivos_speaker_id_fkey] FOREIGN KEY ([speaker_id]) REFERENCES [dbo].[speakers] ([id]);
    ALTER TABLE [dbo].[evento_registros_financieros] ADD CONSTRAINT [evento_registros_financieros_evento_id_fkey] FOREIGN KEY ([evento_id]) REFERENCES [dbo].[solicitudes_evento] ([id]);
    ALTER TABLE [dbo].[evento_registros_financieros] ADD CONSTRAINT [evento_registros_financieros_archivo_id_fkey] FOREIGN KEY ([archivo_id]) REFERENCES [dbo].[archivos_adjuntos] ([id]);
    ALTER TABLE [dbo].[evento_registros_financieros] ADD CONSTRAINT [evento_registros_financieros_sesion_id_fkey] FOREIGN KEY ([sesion_id]) REFERENCES [dbo].[sesiones_evento] ([id]);
    ALTER TABLE [dbo].[evento_registros_financieros] ADD CONSTRAINT [evento_registros_financieros_factura_id_fkey] FOREIGN KEY ([factura_id]) REFERENCES [dbo].[evento_registros_financieros] ([id]);
    ALTER TABLE [dbo].[evento_registros_financieros] ADD CONSTRAINT [evento_registros_financieros_speaker_id_fkey] FOREIGN KEY ([speaker_id]) REFERENCES [dbo].[speakers] ([id]);
    ALTER TABLE [dbo].[ajustes_financieros] ADD CONSTRAINT [ajustes_financieros_registro_financiero_id_fkey] FOREIGN KEY ([registro_financiero_id]) REFERENCES [dbo].[evento_registros_financieros] ([id]);
    ALTER TABLE [dbo].[ajustes_financieros] ADD CONSTRAINT [ajustes_financieros_usuario_id_fkey] FOREIGN KEY ([usuario_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[convenios_pago_hcp] ADD CONSTRAINT [convenios_pago_hcp_creado_por_id_fkey] FOREIGN KEY ([creado_por_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[convenios_pago_hcp] ADD CONSTRAINT [convenios_pago_hcp_evento_origen_id_fkey] FOREIGN KEY ([evento_origen_id]) REFERENCES [dbo].[solicitudes_evento] ([id]);
    ALTER TABLE [dbo].[convenios_pago_hcp] ADD CONSTRAINT [convenios_pago_hcp_speaker_id_fkey] FOREIGN KEY ([speaker_id]) REFERENCES [dbo].[speakers] ([id]);
    ALTER TABLE [dbo].[convenios_pago_hcp] ADD CONSTRAINT [convenios_pago_hcp_archivo_agenda_id_fkey] FOREIGN KEY ([archivo_agenda_id]) REFERENCES [dbo].[archivos_adjuntos] ([id]);
    ALTER TABLE [dbo].[convenios_pago_hcp] ADD CONSTRAINT [convenios_pago_hcp_anulado_por_id_fkey] FOREIGN KEY ([anulado_por_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[convenios_pago_hcp] ADD CONSTRAINT [convenios_pago_hcp_adenda_ventana_actor_id_fkey] FOREIGN KEY ([adenda_ventana_actor_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[convenio_aprobaciones] ADD CONSTRAINT [convenio_aprobaciones_convenio_id_fkey] FOREIGN KEY ([convenio_id]) REFERENCES [dbo].[convenios_pago_hcp] ([id]);
    ALTER TABLE [dbo].[convenio_aprobaciones] ADD CONSTRAINT [convenio_aprobaciones_resuelto_por_id_fkey] FOREIGN KEY ([resuelto_por_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[fmv_checklists] ADD CONSTRAINT [fmv_checklists_creado_por_id_fkey] FOREIGN KEY ([creado_por_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[fmv_checklists] ADD CONSTRAINT [fmv_checklists_evento_origen_id_fkey] FOREIGN KEY ([evento_origen_id]) REFERENCES [dbo].[solicitudes_evento] ([id]);
    ALTER TABLE [dbo].[fmv_checklists] ADD CONSTRAINT [fmv_checklists_speaker_id_fkey] FOREIGN KEY ([speaker_id]) REFERENCES [dbo].[speakers] ([id]);
    ALTER TABLE [dbo].[fmv_checklists] ADD CONSTRAINT [fmv_checklists_archivo_tarifario_asociacion_id_fkey] FOREIGN KEY ([archivo_tarifario_asociacion_id]) REFERENCES [dbo].[archivos_adjuntos] ([id]);
    ALTER TABLE [dbo].[fmv_checklists] ADD CONSTRAINT [fmv_checklists_anulado_por_id_fkey] FOREIGN KEY ([anulado_por_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[fmv_checklists] ADD CONSTRAINT [fmv_checklists_firmado_por_id_fkey] FOREIGN KEY ([firmado_por_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[notificaciones_pago_hcp] ADD CONSTRAINT [notificaciones_pago_hcp_creado_por_id_fkey] FOREIGN KEY ([creado_por_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[notificaciones_pago_hcp] ADD CONSTRAINT [notificaciones_pago_hcp_evento_origen_id_fkey] FOREIGN KEY ([evento_origen_id]) REFERENCES [dbo].[solicitudes_evento] ([id]);
    ALTER TABLE [dbo].[notificaciones_pago_hcp] ADD CONSTRAINT [notificaciones_pago_hcp_speaker_id_fkey] FOREIGN KEY ([speaker_id]) REFERENCES [dbo].[speakers] ([id]);
    ALTER TABLE [dbo].[notificaciones_pago_hcp] ADD CONSTRAINT [notificaciones_pago_hcp_anulado_por_id_fkey] FOREIGN KEY ([anulado_por_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[notificaciones_pago_hcp] ADD CONSTRAINT [notificaciones_pago_hcp_firmado_por_id_fkey] FOREIGN KEY ([firmado_por_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[auditoria] ADD CONSTRAINT [auditoria_actor_id_fkey] FOREIGN KEY ([actor_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[notificaciones] ADD CONSTRAINT [notificaciones_para_usuario_id_fkey] FOREIGN KEY ([para_usuario_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[configuracion_formatos] ADD CONSTRAINT [configuracion_formatos_logo_id_fkey] FOREIGN KEY ([logo_id]) REFERENCES [dbo].[archivos_adjuntos] ([id]);
    ALTER TABLE [dbo].[configuracion_formatos] ADD CONSTRAINT [configuracion_formatos_logo_app_id_fkey] FOREIGN KEY ([logo_app_id]) REFERENCES [dbo].[archivos_adjuntos] ([id]);
    ALTER TABLE [dbo].[formato_oficial_fmv] ADD CONSTRAINT [formato_oficial_fmv_archivo_id_fkey] FOREIGN KEY ([archivo_id]) REFERENCES [dbo].[archivos_adjuntos] ([id]);
    ALTER TABLE [dbo].[fmv_criterios] ADD CONSTRAINT [fmv_criterios_configuracion_fmv_id_fkey] FOREIGN KEY ([configuracion_fmv_id]) REFERENCES [dbo].[configuracion_fmv] ([id]);
    ALTER TABLE [dbo].[fmv_criterio_opciones] ADD CONSTRAINT [fmv_criterio_opciones_criterio_id_fkey] FOREIGN KEY ([criterio_id]) REFERENCES [dbo].[fmv_criterios] ([id]);
    ALTER TABLE [dbo].[sesiones_evento] ADD CONSTRAINT [sesiones_evento_evento_id_fkey] FOREIGN KEY ([evento_id]) REFERENCES [dbo].[solicitudes_evento] ([id]);
    ALTER TABLE [dbo].[cafs] ADD CONSTRAINT [cafs_creado_por_id_fkey] FOREIGN KEY ([creado_por_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[cafs] ADD CONSTRAINT [cafs_evento_origen_id_fkey] FOREIGN KEY ([evento_origen_id]) REFERENCES [dbo].[solicitudes_evento] ([id]);
    ALTER TABLE [dbo].[cafs] ADD CONSTRAINT [cafs_anulado_por_id_fkey] FOREIGN KEY ([anulado_por_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[cafs] ADD CONSTRAINT [cafs_adenda_ventana_actor_id_fkey] FOREIGN KEY ([adenda_ventana_actor_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[cafs] ADD CONSTRAINT [cafs_speaker_id_fkey] FOREIGN KEY ([speaker_id]) REFERENCES [dbo].[speakers] ([id]);
    ALTER TABLE [dbo].[caf_aprobaciones] ADD CONSTRAINT [caf_aprobaciones_caf_id_fkey] FOREIGN KEY ([caf_id]) REFERENCES [dbo].[cafs] ([id]);
    ALTER TABLE [dbo].[caf_aprobaciones] ADD CONSTRAINT [caf_aprobaciones_resuelto_por_id_fkey] FOREIGN KEY ([resuelto_por_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[convenios_hcp] ADD CONSTRAINT [convenios_hcp_creado_por_id_fkey] FOREIGN KEY ([creado_por_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[convenios_hcp] ADD CONSTRAINT [convenios_hcp_evento_origen_id_fkey] FOREIGN KEY ([evento_origen_id]) REFERENCES [dbo].[solicitudes_evento] ([id]);
    ALTER TABLE [dbo].[convenios_hcp] ADD CONSTRAINT [convenios_hcp_caf_id_fkey] FOREIGN KEY ([caf_id]) REFERENCES [dbo].[cafs] ([id]);
    ALTER TABLE [dbo].[convenios_hcp] ADD CONSTRAINT [convenios_hcp_speaker_id_fkey] FOREIGN KEY ([speaker_id]) REFERENCES [dbo].[speakers] ([id]);
    ALTER TABLE [dbo].[convenios_hcp] ADD CONSTRAINT [convenios_hcp_archivo_firmado_hcp_id_fkey] FOREIGN KEY ([archivo_firmado_hcp_id]) REFERENCES [dbo].[archivos_adjuntos] ([id]);
    ALTER TABLE [dbo].[convenios_hcp] ADD CONSTRAINT [convenios_hcp_anulado_por_id_fkey] FOREIGN KEY ([anulado_por_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[convenios_hcp] ADD CONSTRAINT [convenios_hcp_adenda_ventana_actor_id_fkey] FOREIGN KEY ([adenda_ventana_actor_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[convenios_hcp] ADD CONSTRAINT [convenios_hcp_plantilla_version_id_fkey] FOREIGN KEY ([plantilla_version_id]) REFERENCES [dbo].[plantilla_convenio_hcp_version] ([id]);
    ALTER TABLE [dbo].[convenio_hcp_aprobaciones] ADD CONSTRAINT [convenio_hcp_aprobaciones_convenio_hcp_id_fkey] FOREIGN KEY ([convenio_hcp_id]) REFERENCES [dbo].[convenios_hcp] ([id]);
    ALTER TABLE [dbo].[convenio_hcp_aprobaciones] ADD CONSTRAINT [convenio_hcp_aprobaciones_resuelto_por_id_fkey] FOREIGN KEY ([resuelto_por_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[eventos_codigos_acceso] ADD CONSTRAINT [eventos_codigos_acceso_evento_id_fkey] FOREIGN KEY ([evento_id]) REFERENCES [dbo].[solicitudes_evento] ([id]);
    ALTER TABLE [dbo].[eventos_codigos_acceso] ADD CONSTRAINT [eventos_codigos_acceso_creado_por_id_fkey] FOREIGN KEY ([creado_por_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[sesiones_ejecucion_evento] ADD CONSTRAINT [sesiones_ejecucion_evento_evento_id_fkey] FOREIGN KEY ([evento_id]) REFERENCES [dbo].[solicitudes_evento] ([id]);
    ALTER TABLE [dbo].[sesiones_ejecucion_evento] ADD CONSTRAINT [sesiones_ejecucion_evento_codigo_acceso_id_fkey] FOREIGN KEY ([codigo_acceso_id]) REFERENCES [dbo].[eventos_codigos_acceso] ([id]);
    ALTER TABLE [dbo].[productos_portafolio] ADD CONSTRAINT [productos_portafolio_logo_id_fkey] FOREIGN KEY ([logo_id]) REFERENCES [dbo].[archivos_adjuntos] ([id]);
    ALTER TABLE [dbo].[evento_muestras_planeadas] ADD CONSTRAINT [evento_muestras_planeadas_evento_id_fkey] FOREIGN KEY ([evento_id]) REFERENCES [dbo].[solicitudes_evento] ([id]);
    ALTER TABLE [dbo].[evento_muestras_planeadas] ADD CONSTRAINT [evento_muestras_planeadas_producto_id_fkey] FOREIGN KEY ([producto_id]) REFERENCES [dbo].[productos_portafolio] ([id]);
    ALTER TABLE [dbo].[registros_participacion] ADD CONSTRAINT [registros_participacion_evento_id_fkey] FOREIGN KEY ([evento_id]) REFERENCES [dbo].[solicitudes_evento] ([id]);
    ALTER TABLE [dbo].[registros_participacion] ADD CONSTRAINT [registros_participacion_sesion_ejecucion_id_fkey] FOREIGN KEY ([sesion_ejecucion_id]) REFERENCES [dbo].[sesiones_ejecucion_evento] ([id]);
    ALTER TABLE [dbo].[registros_participacion] ADD CONSTRAINT [registros_participacion_firma_id_fkey] FOREIGN KEY ([firma_id]) REFERENCES [dbo].[archivos_adjuntos] ([id]);
    ALTER TABLE [dbo].[registros_participacion] ADD CONSTRAINT [registros_participacion_sesion_id_fkey] FOREIGN KEY ([sesion_id]) REFERENCES [dbo].[sesiones_evento] ([id]);
    ALTER TABLE [dbo].[muestras_entregadas] ADD CONSTRAINT [muestras_entregadas_registro_participacion_id_fkey] FOREIGN KEY ([registro_participacion_id]) REFERENCES [dbo].[registros_participacion] ([id]);
    ALTER TABLE [dbo].[muestras_entregadas] ADD CONSTRAINT [muestras_entregadas_evento_id_fkey] FOREIGN KEY ([evento_id]) REFERENCES [dbo].[solicitudes_evento] ([id]);
    ALTER TABLE [dbo].[muestras_entregadas] ADD CONSTRAINT [muestras_entregadas_producto_id_fkey] FOREIGN KEY ([producto_id]) REFERENCES [dbo].[productos_portafolio] ([id]);
    ALTER TABLE [dbo].[muestras_entregadas] ADD CONSTRAINT [muestras_entregadas_firma_confirmacion_id_fkey] FOREIGN KEY ([firma_confirmacion_id]) REFERENCES [dbo].[archivos_adjuntos] ([id]);
    ALTER TABLE [dbo].[adendas_solicitud_evento] ADD CONSTRAINT [adendas_solicitud_evento_evento_id_fkey] FOREIGN KEY ([evento_id]) REFERENCES [dbo].[solicitudes_evento] ([id]);
    ALTER TABLE [dbo].[adendas_solicitud_evento] ADD CONSTRAINT [adendas_solicitud_evento_solicitado_por_id_fkey] FOREIGN KEY ([solicitado_por_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[adendas_convenio_pago_hcp] ADD CONSTRAINT [adendas_convenio_pago_hcp_convenio_id_fkey] FOREIGN KEY ([convenio_id]) REFERENCES [dbo].[convenios_pago_hcp] ([id]);
    ALTER TABLE [dbo].[adendas_convenio_pago_hcp] ADD CONSTRAINT [adendas_convenio_pago_hcp_solicitado_por_id_fkey] FOREIGN KEY ([solicitado_por_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[plantilla_convenio_hcp_version] ADD CONSTRAINT [plantilla_convenio_hcp_version_creado_por_id_fkey] FOREIGN KEY ([creado_por_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[convenio_hcp_ajustes_clausula] ADD CONSTRAINT [convenio_hcp_ajustes_clausula_convenio_hcp_id_fkey] FOREIGN KEY ([convenio_hcp_id]) REFERENCES [dbo].[convenios_hcp] ([id]);
    ALTER TABLE [dbo].[convenio_hcp_ajustes_clausula] ADD CONSTRAINT [convenio_hcp_ajustes_clausula_creado_por_id_fkey] FOREIGN KEY ([creado_por_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[etiquetas_campo] ADD CONSTRAINT [etiquetas_campo_actualizado_por_id_fkey] FOREIGN KEY ([actualizado_por_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[configuracion_formatos_empresa] ADD CONSTRAINT [configuracion_formatos_empresa_logo_id_fkey] FOREIGN KEY ([logo_id]) REFERENCES [dbo].[archivos_adjuntos] ([id]);
    ALTER TABLE [dbo].[campos_personalizados_definicion] ADD CONSTRAINT [campos_personalizados_definicion_creado_por_id_fkey] FOREIGN KEY ([creado_por_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[campos_personalizados_definicion] ADD CONSTRAINT [campos_personalizados_definicion_actualizado_por_id_fkey] FOREIGN KEY ([actualizado_por_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[campos_personalizados_regla_comparacion] ADD CONSTRAINT [campos_personalizados_regla_comparacion_creado_por_id_fkey] FOREIGN KEY ([creado_por_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[campos_personalizados_regla_comparacion] ADD CONSTRAINT [campos_personalizados_regla_comparacion_actualizado_por_id_fkey] FOREIGN KEY ([actualizado_por_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[evento_speakers_participacion] ADD CONSTRAINT [evento_speakers_participacion_evento_id_fkey] FOREIGN KEY ([evento_id]) REFERENCES [dbo].[solicitudes_evento] ([id]);
    ALTER TABLE [dbo].[evento_speakers_participacion] ADD CONSTRAINT [evento_speakers_participacion_speaker_id_fkey] FOREIGN KEY ([speaker_id]) REFERENCES [dbo].[speakers] ([id]);
    ALTER TABLE [dbo].[evento_speaker_presupuestos] ADD CONSTRAINT [evento_speaker_presupuestos_evento_speaker_id_fkey] FOREIGN KEY ([evento_speaker_id]) REFERENCES [dbo].[evento_speakers_participacion] ([id]);
    ALTER TABLE [dbo].[evento_speaker_presupuestos] ADD CONSTRAINT [evento_speaker_presupuestos_sesion_id_fkey] FOREIGN KEY ([sesion_id]) REFERENCES [dbo].[sesiones_evento] ([id]);
    ALTER TABLE [dbo].[configuracion_formatos_historial] ADD CONSTRAINT [configuracion_formatos_historial_usuario_id_fkey] FOREIGN KEY ([usuario_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[envios_documentos] ADD CONSTRAINT [envios_documentos_enviado_por_id_fkey] FOREIGN KEY ([enviado_por_id]) REFERENCES [dbo].[usuarios] ([id]);
    ALTER TABLE [dbo].[recordatorios_documentos_soporte_enviados] ADD CONSTRAINT [recordatorios_documentos_soporte_enviados_evento_id_fkey] FOREIGN KEY ([evento_id]) REFERENCES [dbo].[solicitudes_evento] ([id]);
    ALTER TABLE [dbo].[registros_fuerza_ventas] ADD CONSTRAINT [registros_fuerza_ventas_evento_id_fkey] FOREIGN KEY ([evento_id]) REFERENCES [dbo].[solicitudes_evento] ([id]);
    ALTER TABLE [dbo].[evento_distribucion_asistentes] ADD CONSTRAINT [evento_distribucion_asistentes_evento_id_fkey] FOREIGN KEY ([evento_id]) REFERENCES [dbo].[solicitudes_evento] ([id]);
    ALTER TABLE [dbo].[evento_productos] ADD CONSTRAINT [evento_productos_evento_id_fkey] FOREIGN KEY ([evento_id]) REFERENCES [dbo].[solicitudes_evento] ([id]);
    ALTER TABLE [dbo].[evento_productos] ADD CONSTRAINT [evento_productos_producto_id_fkey] FOREIGN KEY ([producto_id]) REFERENCES [dbo].[productos_portafolio] ([id]);
    ALTER TABLE [dbo].[evento_anotaciones_pago] ADD CONSTRAINT [evento_anotaciones_pago_evento_id_fkey] FOREIGN KEY ([evento_id]) REFERENCES [dbo].[solicitudes_evento] ([id]);
    ALTER TABLE [dbo].[evento_anotaciones_pago] ADD CONSTRAINT [evento_anotaciones_pago_speaker_id_fkey] FOREIGN KEY ([speaker_id]) REFERENCES [dbo].[speakers] ([id]);
    ALTER TABLE [dbo].[evento_anotaciones_pago] ADD CONSTRAINT [evento_anotaciones_pago_registro_id_fkey] FOREIGN KEY ([registro_id]) REFERENCES [dbo].[evento_registros_financieros] ([id]);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
