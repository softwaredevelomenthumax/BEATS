-- ============================================================================
-- Entrega 23 (parte B) — roles Legal / Compliance / Legal&Compliance, perfil de
-- usuario (Área, jefe inmediato, director de área, Compliance Officer LATAM) y
-- elegibilidad de firmantes en el servidor.
--
-- EJECUTAR DESPUÉS de entrega_23a_enums_roles_legal_compliance.sql (que debe
-- haberse ejecutado antes, en su propia ejecución). Idempotente.
--
-- Qué hace:
--  1. Columnas nuevas en `usuarios` (todas con valor por defecto: nada se rompe).
--  2. `fn_rol_satisface(rol_usuario, rol_requerido)`: ÚNICO lugar donde se decide
--     qué rol de usuario puede firmar cada paso:
--        requiere 'legal'            → legal, legal_compliance
--        requiere 'compliance'       → compliance, legal_compliance
--        requiere 'legal_compliance' → legal, compliance, legal_compliance
--                                      (pasos antiguos / "cualquiera de los tres")
--        cualquier otro rol          → coincidencia exacta (como hasta hoy)
--  3. Reemplaza (CREATE OR REPLACE, con el código REAL de tu base) los 4 RPC
--     resolver_aprobacion_*, los 4 fn_reiniciar_aprobaciones_*, el aviso de
--     primera etapa, los recordatorios y el permiso de la plantilla legal para
--     que usen fn_rol_satisface en vez de comparar el rol por igualdad.
--  4. Resguardo de edición de usuarios: Área y "Es director de área" solo los
--     cambia quien configura (Dirección Médica / Administrador).
--  5. RPC `actualizar_mis_opciones_firma` (autoservicio acotado) y
--     `directorio_usuarios` (lista mínima para elegir jefe inmediato).
--  6. Convierte los pasos PENDIENTES que hoy exigen 'legal_compliance':
--        Solicitud de Evento → 'compliance'   (Compliance Officer)
--        Convenio de pago    → 'legal'
--        Convenio HCP        → 'legal'        (Visto Bueno)
--     Los pasos ya firmados NO se tocan (historial intacto).
--
-- Los usuarios existentes con rol legal_compliance siguen siendo "ambos": no
-- cambia nada para ellos.
-- ============================================================================

-- 1. Columnas nuevas de `usuarios` -------------------------------------------
alter table public.usuarios add column if not exists area text;
alter table public.usuarios add column if not exists es_director_area boolean not null default false;
alter table public.usuarios add column if not exists firma_como_director_area boolean not null default false;
alter table public.usuarios add column if not exists jefe_inmediato_id uuid references public.usuarios(id) on delete set null;
alter table public.usuarios add column if not exists firma_como_jefe_inmediato boolean not null default false;
alter table public.usuarios add column if not exists firma_como_compliance_latam boolean not null default false;

-- 2. Elegibilidad de firmantes -------------------------------------------------
create or replace function public.fn_rol_satisface(p_rol_usuario text, p_rol_requerido text)
returns boolean
language sql
immutable
as $fn$
  select coalesce(
    case p_rol_requerido
      when 'legal'            then p_rol_usuario in ('legal', 'legal_compliance')
      when 'compliance'       then p_rol_usuario in ('compliance', 'legal_compliance')
      when 'legal_compliance' then p_rol_usuario in ('legal', 'compliance', 'legal_compliance')
      else p_rol_usuario = p_rol_requerido
    end,
    false);
$fn$;

-- 3 y 4. Funciones existentes, con el código real de tu base y el cambio mínimo
-- resolver_aprobacion_evento
CREATE OR REPLACE FUNCTION public.resolver_aprobacion_evento(p_evento_id uuid, p_orden integer, p_accion estado_aprobacion, p_comentario text DEFAULT NULL::text)
 RETURNS estado_doc
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id     uuid := current_usuario_id();
  v_actor_rol    rol_usuario := current_rol();
  v_etapa        evento_aprobaciones%rowtype;
  v_evento       solicitudes_evento%rowtype;
  v_siguiente    evento_aprobaciones%rowtype;
  v_nuevo_estado estado_doc;
  v_accion_audit tipo_accion_auditoria;
  v_comentario   text := nullif(trim(coalesce(p_comentario, '')), '');
begin
  if v_actor_id is null then
    raise exception 'No hay una sesión válida.';
  end if;

  if p_accion not in ('aprobado', 'rechazado') then
    raise exception 'Acción inválida: solo se puede aprobar o rechazar una etapa.';
  end if;

  if p_accion = 'rechazado' and v_comentario is null then
    raise exception 'El motivo es obligatorio para rechazar.';
  end if;

  -- Bloquea la fila de la etapa para evitar que dos llamadas concurrentes
  -- (ej. las dos personas con rol legal_compliance) resuelvan la misma
  -- etapa dos veces.
  select * into v_etapa
    from evento_aprobaciones
    where evento_id = p_evento_id and orden = p_orden
    for update;

  if not found then
    raise exception 'No existe esa etapa de aprobación para este evento.';
  end if;

  if v_etapa.estado <> 'pendiente' then
    raise exception 'Esta etapa ya fue resuelta (%).', v_etapa.estado;
  end if;

  if not public.fn_rol_satisface(v_actor_rol::text, v_etapa.rol_requerido::text) then
    raise exception 'No tienes el rol requerido para resolver esta etapa.';
  end if;

  -- El flujo de firmas es secuencial (Dirección Comercial → Dirección
  -- Médica → Compliance/Legal — ver src/lib/aprobaciones.ts): una etapa solo
  -- se puede resolver una vez que TODAS las anteriores (orden menor) ya
  -- quedaron en 'aprobado'. Sin este chequeo, alguien con el rol de una
  -- etapa POSTERIOR podía aprobarla aunque una etapa previa siguiera
  -- pendiente — y como el correo automático de "aprobado en todas sus
  -- etapas" (ver triggers_email_resend.sql) se dispara cuando ya no queda
  -- ninguna etapa pendiente con orden mayor, eso producía el correo de
  -- aprobación total reportado por el cliente aun con la firma de Dirección
  -- Comercial (la primera etapa) todavía pendiente.
  if exists (
    select 1 from evento_aprobaciones
    where evento_id = p_evento_id and orden < p_orden and estado <> 'aprobado'
  ) then
    raise exception 'Todavía falta que se resuelvan, en orden, las etapas anteriores de este documento.';
  end if;

  select * into v_evento from solicitudes_evento where id = p_evento_id for update;
  if not found then
    raise exception 'No existe la solicitud de evento indicada.';
  end if;

  if v_evento.estado <> 'Pendiente' then
    raise exception 'Este documento no está en espera de aprobación.';
  end if;

  -- Restricción por país de operación (arquitectura multi-empresa/país, ver
  -- Usuario.paisesOperacion en src/types.ts): esta función es `security
  -- definer` y por lo tanto NO pasa por RLS al leer/escribir aquí dentro —
  -- este chequeo explícito es el límite de seguridad real para que alguien
  -- solo pueda aprobar eventos de los países en los que opera.
  if not fn_usuario_tiene_acceso_pais(v_evento.pais) then
    raise exception 'No tienes acceso para aprobar documentos de ese país.';
  end if;

  -- Vía de escape para el trigger de resguardo (ver auth_migracion.sql):
  -- solo dentro de esta transacción, así que no afecta a nadie más.
  perform set_config('beats.rpc_aprobacion', 'on', true);

  update evento_aprobaciones
    set estado = p_accion,
        resuelto_por_id = v_actor_id,
        fecha = now(),
        comentario = v_comentario
    where id = v_etapa.id;

  -- Recalcula el estado del documento a partir de TODAS sus etapas —mismo
  -- criterio que estadoDesdeAprobaciones() en src/lib/aprobaciones.ts—:
  -- cualquier etapa rechazada manda a Rechazado; si todas están aprobadas,
  -- Aprobado; si no, sigue Pendiente.
  select
    case
      when bool_or(estado = 'rechazado') then 'Rechazado'
      when bool_and(estado = 'aprobado') then 'Aprobado'
      else 'Pendiente'
    end
    into v_nuevo_estado
    from evento_aprobaciones
    where evento_id = p_evento_id;

  update solicitudes_evento set estado = v_nuevo_estado where id = p_evento_id;

  v_accion_audit := case
    when p_accion = 'rechazado' then 'rechazo'
    when v_nuevo_estado = 'Aprobado' then 'aprobacion_final'
    else 'aprobacion_parcial'
  end;

  -- empresa_grupo/pais: copia denormalizada para que el filtro por país/
  -- empresa de "Historial y Auditoría" funcione sin tener que hacer join
  -- (mismo motivo documentado en anular_eliminar_documentos.sql) — el
  -- evento ya trae ambos campos directamente, sin necesidad de otra tabla.
  insert into auditoria (documento_id, tipo_doc, documento_nombre, actor_id, accion, detalle, empresa_grupo, pais)
  values (
    p_evento_id, 'evento', coalesce(nullif(v_evento.nombre_evento, ''), '(sin nombre)'), v_actor_id, v_accion_audit,
    format('%s por: %s (%s)',
      case when p_accion = 'aprobado' then 'Aprobado' else 'Rechazado' end,
      (select nombre from usuarios where id = v_actor_id),
      v_etapa.etiqueta),
    nullif(v_evento.empresa_grupo, ''), nullif(v_evento.pais, '')
  );

  if p_accion = 'rechazado' then
    insert into notificaciones (para_usuario_id, tipo, mensaje, documento_ref_tipo, documento_ref_id)
    values (
      v_evento.creado_por_id,
      'rechazo',
      format('%s fue rechazada por %s (%s). Motivo: "%s"',
        fn_descriptor_evento(p_evento_id),
        (select nombre from usuarios where id = v_actor_id),
        v_etapa.etiqueta,
        v_comentario),
      'evento',
      p_evento_id
    );
  elsif v_nuevo_estado = 'Pendiente' then
    -- Avanzó a la siguiente etapa: además del correo (ver
    -- triggers_email_resend.sql), se deja una notificación de "tarea
    -- pendiente" en la campana para cada usuario con el rol de esa próxima
    -- etapa — antes esto solo pasaba por correo, así que la campana nunca
    -- reflejaba las tareas de aprobación (solo los rechazos).
    select * into v_siguiente
      from evento_aprobaciones
      where evento_id = p_evento_id and estado = 'pendiente'
      order by orden asc
      limit 1;

    if found then
      insert into notificaciones (para_usuario_id, tipo, mensaje, documento_ref_tipo, documento_ref_id)
      select u.id, 'tarea_pendiente',
        format('%s, está pendiente de tu aprobación en BEATS (etapa: %s).', fn_descriptor_evento(p_evento_id), v_siguiente.etiqueta),
        'evento', p_evento_id
      from usuarios u
      where public.fn_rol_satisface(u.rol::text, v_siguiente.rol_requerido::text)
        and coalesce(u.activo, true) is true;
    end if;
  end if;

  return v_nuevo_estado;
end;
$function$;

-- resolver_aprobacion_convenio
CREATE OR REPLACE FUNCTION public.resolver_aprobacion_convenio(p_convenio_id uuid, p_orden integer, p_accion estado_aprobacion, p_comentario text DEFAULT NULL::text)
 RETURNS estado_doc
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id     uuid := current_usuario_id();
  v_actor_rol    rol_usuario := current_rol();
  v_etapa        convenio_aprobaciones%rowtype;
  v_convenio     convenios_pago_hcp%rowtype;
  v_siguiente    convenio_aprobaciones%rowtype;
  v_nuevo_estado estado_doc;
  v_accion_audit tipo_accion_auditoria;
  v_comentario   text := nullif(trim(coalesce(p_comentario, '')), '');
  -- El Convenio de Pago a HCP no tiene columna propia de país (a diferencia
  -- de empresa_grupo, que sí tiene su propio eje vía unidad_negocio_
  -- ubicacion) — se toma del evento de origen, igual que empresaDeDocumento/
  -- paisDeDocumento del lado del cliente (ver src/lib/aprobaciones.ts).
  v_pais         text;
begin
  if v_actor_id is null then
    raise exception 'No hay una sesión válida.';
  end if;

  if p_accion not in ('aprobado', 'rechazado') then
    raise exception 'Acción inválida: solo se puede aprobar o rechazar una etapa.';
  end if;

  if p_accion = 'rechazado' and v_comentario is null then
    raise exception 'El motivo es obligatorio para rechazar.';
  end if;

  select * into v_etapa
    from convenio_aprobaciones
    where convenio_id = p_convenio_id and orden = p_orden
    for update;

  if not found then
    raise exception 'No existe esa etapa de aprobación para este convenio.';
  end if;

  if v_etapa.estado <> 'pendiente' then
    raise exception 'Esta etapa ya fue resuelta (%).', v_etapa.estado;
  end if;

  if not public.fn_rol_satisface(v_actor_rol::text, v_etapa.rol_requerido::text) then
    raise exception 'No tienes el rol requerido para resolver esta etapa.';
  end if;

  -- Mismo chequeo de orden secuencial que resolver_aprobacion_evento —
  -- ver el comentario detallado ahí arriba.
  if exists (
    select 1 from convenio_aprobaciones
    where convenio_id = p_convenio_id and orden < p_orden and estado <> 'aprobado'
  ) then
    raise exception 'Todavía falta que se resuelvan, en orden, las etapas anteriores de este documento.';
  end if;

  select * into v_convenio from convenios_pago_hcp where id = p_convenio_id for update;
  if not found then
    raise exception 'No existe el convenio de pago indicado.';
  end if;

  if v_convenio.estado <> 'Pendiente' then
    raise exception 'Este documento no está en espera de aprobación.';
  end if;

  if v_convenio.evento_origen_id is not null then
    select pais into v_pais from solicitudes_evento where id = v_convenio.evento_origen_id;
  end if;

  -- Restricción por país de operación — ver el comentario detallado en
  -- resolver_aprobacion_evento más arriba.
  if not fn_usuario_tiene_acceso_pais(v_pais) then
    raise exception 'No tienes acceso para aprobar documentos de ese país.';
  end if;

  perform set_config('beats.rpc_aprobacion', 'on', true);

  update convenio_aprobaciones
    set estado = p_accion,
        resuelto_por_id = v_actor_id,
        fecha = now(),
        comentario = v_comentario
    where id = v_etapa.id;

  select
    case
      when bool_or(estado = 'rechazado') then 'Rechazado'
      when bool_and(estado = 'aprobado') then 'Aprobado'
      else 'Pendiente'
    end
    into v_nuevo_estado
    from convenio_aprobaciones
    where convenio_id = p_convenio_id;

  update convenios_pago_hcp set estado = v_nuevo_estado where id = p_convenio_id;

  v_accion_audit := case
    when p_accion = 'rechazado' then 'rechazo'
    when v_nuevo_estado = 'Aprobado' then 'aprobacion_final'
    else 'aprobacion_parcial'
  end;

  insert into auditoria (documento_id, tipo_doc, documento_nombre, actor_id, accion, detalle, empresa_grupo, pais)
  values (
    p_convenio_id, 'convenio',
    coalesce(nullif(v_convenio.hcp_nombre_completo, ''), '(sin nombre)') || ' — Convenio de Pago',
    v_actor_id, v_accion_audit,
    format('%s por: %s (%s)',
      case when p_accion = 'aprobado' then 'Aprobado' else 'Rechazado' end,
      (select nombre from usuarios where id = v_actor_id),
      v_etapa.etiqueta),
    nullif(v_convenio.unidad_negocio_ubicacion, ''), v_pais
  );

  if p_accion = 'rechazado' then
    insert into notificaciones (para_usuario_id, tipo, mensaje, documento_ref_tipo, documento_ref_id)
    values (
      v_convenio.creado_por_id,
      'rechazo',
      format('%s fue rechazado por %s (%s). Motivo: "%s"',
        fn_descriptor_convenio(p_convenio_id),
        (select nombre from usuarios where id = v_actor_id),
        v_etapa.etiqueta,
        v_comentario),
      'convenio',
      p_convenio_id
    );
  elsif v_nuevo_estado = 'Pendiente' then
    -- Mismo cierre de brecha que resolver_aprobacion_evento: deja una
    -- notificación de "tarea pendiente" en la campana para cada usuario con
    -- el rol de la siguiente etapa.
    select * into v_siguiente
      from convenio_aprobaciones
      where convenio_id = p_convenio_id and estado = 'pendiente'
      order by orden asc
      limit 1;

    if found then
      insert into notificaciones (para_usuario_id, tipo, mensaje, documento_ref_tipo, documento_ref_id)
      select u.id, 'tarea_pendiente',
        format('%s, está pendiente de tu aprobación en BEATS (etapa: %s).', fn_descriptor_convenio(p_convenio_id), v_siguiente.etiqueta),
        'convenio', p_convenio_id
      from usuarios u
      where public.fn_rol_satisface(u.rol::text, v_siguiente.rol_requerido::text)
        and coalesce(u.activo, true) is true;
    end if;
  end if;

  return v_nuevo_estado;
end;
$function$;

-- resolver_aprobacion_convenio_hcp
CREATE OR REPLACE FUNCTION public.resolver_aprobacion_convenio_hcp(p_convenio_hcp_id uuid, p_orden integer, p_accion estado_aprobacion, p_comentario text DEFAULT NULL::text)
 RETURNS estado_doc
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id      uuid := current_usuario_id();
  v_actor_rol     rol_usuario := current_rol();
  v_etapa         convenio_hcp_aprobaciones%rowtype;
  v_convenio      convenios_hcp%rowtype;
  v_siguiente     convenio_hcp_aprobaciones%rowtype;
  v_nuevo_estado  estado_doc;
  v_accion_audit  tipo_accion_auditoria;
  v_comentario    text := nullif(trim(coalesce(p_comentario, '')), '');
  v_nombre_doc    text;
  -- El Convenio HCP no tiene columna propia de país (eventoOrigenId siempre
  -- es obligatorio) — se toma del evento de origen, igual que
  -- paisDeDocumento() del lado del cliente.
  v_pais          text;
begin
  if v_actor_id is null then
    raise exception 'No hay una sesión válida.';
  end if;

  if p_accion not in ('aprobado', 'rechazado') then
    raise exception 'Acción inválida: solo se puede aprobar o rechazar una etapa.';
  end if;

  if p_accion = 'rechazado' and v_comentario is null then
    raise exception 'El motivo es obligatorio para rechazar.';
  end if;

  select * into v_etapa
    from convenio_hcp_aprobaciones
    where convenio_hcp_id = p_convenio_hcp_id and orden = p_orden
    for update;

  if not found then
    raise exception 'No existe esa etapa de aprobación para este Convenio HCP.';
  end if;

  if v_etapa.estado <> 'pendiente' then
    raise exception 'Esta etapa ya fue resuelta (%).', v_etapa.estado;
  end if;

  if not public.fn_rol_satisface(v_actor_rol::text, v_etapa.rol_requerido::text) then
    raise exception 'No tienes el rol requerido para resolver esta etapa.';
  end if;

  -- Mismo chequeo de orden secuencial que resolver_aprobacion_caf/evento/convenio.
  if exists (
    select 1 from convenio_hcp_aprobaciones
    where convenio_hcp_id = p_convenio_hcp_id and orden < p_orden and estado <> 'aprobado'
  ) then
    raise exception 'Todavía falta que se resuelvan, en orden, las etapas anteriores de este documento.';
  end if;

  select * into v_convenio from convenios_hcp where id = p_convenio_hcp_id for update;
  if not found then
    raise exception 'No existe el Convenio HCP indicado.';
  end if;

  if v_convenio.estado <> 'Pendiente' then
    raise exception 'Este documento no está en espera de aprobación.';
  end if;

  -- Ajuste pedido por el cliente: el CAF y el Convenio HCP se pueden seguir
  -- diligenciando en paralelo (ver cafVigente()/tareaConvenioHCPPendiente()
  -- en src/lib/aprobaciones.ts — la CREACIÓN del Convenio HCP no exige CAF
  -- Aprobado), pero la firma final de Gerencia General (orden 2) del
  -- Convenio HCP no se puede resolver mientras el CAF vinculado no esté
  -- Aprobado en su totalidad (incluida la propia firma de Gerencia General
  -- en el CAF). Sin este chequeo, el gerente general podría firmar el
  -- contrato de consultoría antes de que el CAF que lo autoriza esté
  -- completo. Solo aplica a la etapa 2 (Legal/Compliance en la etapa 1
  -- puede dejar su Visto Bueno sin esperar al CAF).
  if p_orden = 2 and p_accion = 'aprobado' then
    if (select estado from cafs where id = v_convenio.caf_id) is distinct from 'Aprobado' then
      raise exception 'El CAF vinculado a este Convenio HCP todavía no está Aprobado en su totalidad — no se puede firmar el Convenio HCP hasta que el CAF quede aprobado por Gerencia General.';
    end if;
  end if;

  v_nombre_doc := coalesce(nullif(v_convenio.nombre_director_general, ''), '(sin firmante)') || ' — Convenio HCP';
  select pais into v_pais from solicitudes_evento where id = v_convenio.evento_origen_id;

  -- Restricción por país de operación (arquitectura multi-empresa/país) —
  -- ver el comentario detallado en resolver_aprobacion_evento, db/rpc_aprobaciones.sql.
  if not fn_usuario_tiene_acceso_pais(v_pais) then
    raise exception 'No tienes acceso para aprobar documentos de ese país.';
  end if;

  perform set_config('beats.rpc_aprobacion', 'on', true);

  update convenio_hcp_aprobaciones
    set estado = p_accion,
        resuelto_por_id = v_actor_id,
        fecha = now(),
        comentario = v_comentario
    where id = v_etapa.id;

  select
    case
      when bool_or(estado = 'rechazado') then 'Rechazado'
      when bool_and(estado = 'aprobado') then 'Aprobado'
      else 'Pendiente'
    end
    into v_nuevo_estado
    from convenio_hcp_aprobaciones
    where convenio_hcp_id = p_convenio_hcp_id;

  update convenios_hcp set estado = v_nuevo_estado where id = p_convenio_hcp_id;

  v_accion_audit := case
    when p_accion = 'rechazado' then 'rechazo'
    when v_nuevo_estado = 'Aprobado' then 'aprobacion_final'
    else 'aprobacion_parcial'
  end;

  insert into auditoria (documento_id, tipo_doc, documento_nombre, actor_id, accion, detalle, empresa_grupo, pais)
  values (
    p_convenio_hcp_id, 'convenioHCP', v_nombre_doc,
    v_actor_id, v_accion_audit,
    format('%s por: %s (%s)',
      case when p_accion = 'aprobado' then 'Aprobado' else 'Rechazado' end,
      (select nombre from usuarios where id = v_actor_id),
      v_etapa.etiqueta),
    nullif(v_convenio.compania_nombre, ''), v_pais
  );

  if p_accion = 'rechazado' then
    insert into notificaciones (para_usuario_id, tipo, mensaje, documento_ref_tipo, documento_ref_id)
    values (
      v_convenio.creado_por_id,
      'rechazo',
      format('%s fue rechazado por %s (%s). Motivo: "%s"',
        fn_descriptor_convenio_hcp(p_convenio_hcp_id),
        (select nombre from usuarios where id = v_actor_id),
        v_etapa.etiqueta,
        v_comentario),
      'convenioHCP',
      p_convenio_hcp_id
    );
  elsif v_nuevo_estado = 'Pendiente' then
    select * into v_siguiente
      from convenio_hcp_aprobaciones
      where convenio_hcp_id = p_convenio_hcp_id and estado = 'pendiente'
      order by orden asc
      limit 1;

    if found then
      insert into notificaciones (para_usuario_id, tipo, mensaje, documento_ref_tipo, documento_ref_id)
      select u.id, 'tarea_pendiente',
        format('%s, está pendiente de tu aprobación en BEATS (etapa: %s).', fn_descriptor_convenio_hcp(p_convenio_hcp_id), v_siguiente.etiqueta),
        'convenioHCP', p_convenio_hcp_id
      from usuarios u
      where public.fn_rol_satisface(u.rol::text, v_siguiente.rol_requerido::text)
        and coalesce(u.activo, true) is true;
    end if;
  end if;

  return v_nuevo_estado;
end;
$function$;

-- resolver_aprobacion_caf
CREATE OR REPLACE FUNCTION public.resolver_aprobacion_caf(p_caf_id uuid, p_orden integer, p_accion estado_aprobacion, p_comentario text DEFAULT NULL::text)
 RETURNS estado_doc
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id     uuid := current_usuario_id();
  v_actor_rol    rol_usuario := current_rol();
  v_etapa        caf_aprobaciones%rowtype;
  v_caf          cafs%rowtype;
  v_siguiente    caf_aprobaciones%rowtype;
  v_nuevo_estado estado_doc;
  v_accion_audit tipo_accion_auditoria;
  v_comentario   text := nullif(trim(coalesce(p_comentario, '')), '');
  v_nombre_caf   text;
  -- El CAF no tiene columna propia de país (eventoOrigenId siempre es
  -- obligatorio a diferencia de Convenio/Notificación de Pago) — se toma
  -- del evento de origen, igual que paisDeDocumento() del lado del cliente.
  v_pais         text;
  -- Aviso cruzado con el Convenio HCP del mismo evento (pedido: "cuando el
  -- CAF va a aprobación de legal/compliance, el sistema le debe avisar...
  -- que está disponible el convenio para que le dé el visto bueno... cuando
  -- está firmado por finanzas... se puede notificar a la gerencia general
  -- que hay un CAF y el respectivo convenio asociado, pendientes de firma...
  -- y que el convenio tiene el aval de legal/compliance"). Desde que se
  -- desacopló la creación del Convenio HCP de esperar al CAF Aprobado (ver
  -- cafVigente en src/lib/aprobaciones.ts), puede existir ya un Convenio HCP
  -- del mismo evento en cualquiera de las 4 etapas del CAF.
  v_convenio_hcp      convenios_hcp%rowtype;
  v_tiene_convenio    boolean := false;
  v_convenio_con_aval boolean := false;
  v_mensaje_siguiente text;
begin
  if v_actor_id is null then
    raise exception 'No hay una sesión válida.';
  end if;

  if p_accion not in ('aprobado', 'rechazado') then
    raise exception 'Acción inválida: solo se puede aprobar o rechazar una etapa.';
  end if;

  if p_accion = 'rechazado' and v_comentario is null then
    raise exception 'El motivo es obligatorio para rechazar.';
  end if;

  select * into v_etapa
    from caf_aprobaciones
    where caf_id = p_caf_id and orden = p_orden
    for update;

  if not found then
    raise exception 'No existe esa etapa de aprobación para este CAF.';
  end if;

  if v_etapa.estado <> 'pendiente' then
    raise exception 'Esta etapa ya fue resuelta (%).', v_etapa.estado;
  end if;

  if not public.fn_rol_satisface(v_actor_rol::text, v_etapa.rol_requerido::text) then
    raise exception 'No tienes el rol requerido para resolver esta etapa.';
  end if;

  -- Mismo chequeo de orden secuencial que resolver_aprobacion_evento/_convenio.
  if exists (
    select 1 from caf_aprobaciones
    where caf_id = p_caf_id and orden < p_orden and estado <> 'aprobado'
  ) then
    raise exception 'Todavía falta que se resuelvan, en orden, las etapas anteriores de este documento.';
  end if;

  select * into v_caf from cafs where id = p_caf_id for update;
  if not found then
    raise exception 'No existe el CAF indicado.';
  end if;

  if v_caf.estado <> 'Pendiente' then
    raise exception 'Este documento no está en espera de aprobación.';
  end if;

  v_nombre_caf := coalesce(nullif(v_caf.contraparte_nombre, ''), '(sin contraparte)') || ' — CAF';
  select pais into v_pais from solicitudes_evento where id = v_caf.evento_origen_id;

  -- Restricción por país de operación (arquitectura multi-empresa/país) —
  -- ver el comentario detallado en resolver_aprobacion_evento, db/rpc_aprobaciones.sql.
  if not fn_usuario_tiene_acceso_pais(v_pais) then
    raise exception 'No tienes acceso para aprobar documentos de ese país.';
  end if;

  perform set_config('beats.rpc_aprobacion', 'on', true);

  update caf_aprobaciones
    set estado = p_accion,
        resuelto_por_id = v_actor_id,
        fecha = now(),
        comentario = v_comentario
    where id = v_etapa.id;

  select
    case
      when bool_or(estado = 'rechazado') then 'Rechazado'
      when bool_and(estado = 'aprobado') then 'Aprobado'
      else 'Pendiente'
    end
    into v_nuevo_estado
    from caf_aprobaciones
    where caf_id = p_caf_id;

  update cafs set estado = v_nuevo_estado where id = p_caf_id;

  v_accion_audit := case
    when p_accion = 'rechazado' then 'rechazo'
    when v_nuevo_estado = 'Aprobado' then 'aprobacion_final'
    else 'aprobacion_parcial'
  end;

  insert into auditoria (documento_id, tipo_doc, documento_nombre, actor_id, accion, detalle, empresa_grupo, pais)
  values (
    p_caf_id, 'caf', v_nombre_caf,
    v_actor_id, v_accion_audit,
    format('%s por: %s (%s)',
      case when p_accion = 'aprobado' then 'Aprobado' else 'Rechazado' end,
      (select nombre from usuarios where id = v_actor_id),
      v_etapa.etiqueta),
    nullif(v_caf.compania_nombre, ''), v_pais
  );

  if p_accion = 'rechazado' then
    insert into notificaciones (para_usuario_id, tipo, mensaje, documento_ref_tipo, documento_ref_id)
    values (
      v_caf.creado_por_id,
      'rechazo',
      format('%s fue rechazado por %s (%s). Motivo: "%s"',
        fn_descriptor_caf(p_caf_id),
        (select nombre from usuarios where id = v_actor_id),
        v_etapa.etiqueta,
        v_comentario),
      'caf',
      p_caf_id
    );
  elsif v_nuevo_estado = 'Pendiente' then
    select * into v_siguiente
      from caf_aprobaciones
      where caf_id = p_caf_id and estado = 'pendiente'
      order by orden asc
      limit 1;

    if found then
      v_mensaje_siguiente := format('%s, está pendiente de tu aprobación en BEATS (etapa: %s).', fn_descriptor_caf(p_caf_id), v_siguiente.etiqueta);

      -- ¿Ya existe un Convenio HCP (contrato de consultoría) para este mismo
      -- evento? Puede haberse creado en simultáneo al CAF, sin esperar a que
      -- este quedara Aprobado.
      select * into v_convenio_hcp
        from convenios_hcp
        where evento_origen_id = v_caf.evento_origen_id
        order by creado_en desc
        limit 1;
      v_tiene_convenio := found;

      if v_tiene_convenio and v_siguiente.rol_requerido::text in ('legal_compliance', 'legal', 'compliance') then
        -- El CAF llega a la etapa de Legal/Compliance: avisar también que el
        -- Convenio HCP está disponible para su Visto Bueno — aclarando que
        -- NO es la firma del convenio, sino su aval como Legal/Compliance
        -- (esa etapa la resuelve aparte, dentro del propio Convenio HCP).
        v_mensaje_siguiente := v_mensaje_siguiente || format(
          ' El Convenio HCP (contrato de consultoría) de este mismo evento también está disponible para tu Visto Bueno — no es la firma del convenio, sino tu aval como Legal/Compliance.'
        );
      elsif v_tiene_convenio and v_siguiente.rol_requerido = 'gerencia_general' then
        -- El CAF queda firmado por Finanzas y pasa a Gerencia General (la
        -- última etapa): avisar que el CAF y el Convenio HCP asociado están
        -- pendientes de su firma, indicando si el convenio ya cuenta con el
        -- aval de Legal/Compliance.
        select bool_or(rol_requerido::text in ('legal_compliance', 'legal') and estado = 'aprobado') into v_convenio_con_aval
          from convenio_hcp_aprobaciones
          where convenio_hcp_id = v_convenio_hcp.id;

        v_mensaje_siguiente := v_mensaje_siguiente || format(
          ' El Convenio HCP asociado a este evento también está pendiente de tu firma%s.',
          case when v_convenio_con_aval then ' (ya cuenta con el aval de Legal/Compliance)' else ' (todavía sin el aval de Legal/Compliance)' end
        );
      end if;

      insert into notificaciones (para_usuario_id, tipo, mensaje, documento_ref_tipo, documento_ref_id)
      select u.id, 'tarea_pendiente', v_mensaje_siguiente, 'caf', p_caf_id
      from usuarios u
      where public.fn_rol_satisface(u.rol::text, v_siguiente.rol_requerido::text)
        and coalesce(u.activo, true) is true;
    end if;
  end if;

  return v_nuevo_estado;
end;
$function$;

-- fn_reiniciar_aprobaciones_evento
CREATE OR REPLACE FUNCTION public.fn_reiniciar_aprobaciones_evento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_primera_etapa evento_aprobaciones%rowtype;
begin
  if old.estado = 'Rechazado' and new.estado = 'Pendiente' then
    update evento_aprobaciones
      set estado = 'pendiente', resuelto_por_id = null, fecha = null, comentario = null
      where evento_id = new.id;

    -- Reenvío tras corrección: hay que avisarle de nuevo a la primera etapa
    -- (Dirección Comercial) igual que al crear el documento por primera vez
    -- (ver trg_evento_aprobaciones_creadas en triggers_email_resend.sql) —
    -- esto es un UPDATE, no un INSERT, así que ese trigger no se dispara solo.
    select * into v_primera_etapa from evento_aprobaciones where evento_id = new.id and orden = 1;
    if found then
      insert into notificaciones (para_usuario_id, tipo, mensaje, documento_ref_tipo, documento_ref_id)
      select u.id, 'tarea_pendiente',
        format('La solicitud de evento "%s", corregida y reenviada, está pendiente de tu aprobación (etapa: %s).',
          coalesce(nullif(new.nombre_evento, ''), '(sin nombre)'), v_primera_etapa.etiqueta),
        'evento', new.id
      from usuarios u
      where public.fn_rol_satisface(u.rol::text, v_primera_etapa.rol_requerido::text)
        and coalesce(u.activo, true) is true;
    end if;
  end if;
  return new;
end;
$function$;

-- fn_reiniciar_aprobaciones_convenio
CREATE OR REPLACE FUNCTION public.fn_reiniciar_aprobaciones_convenio()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_primera_etapa convenio_aprobaciones%rowtype;
begin
  if old.estado = 'Rechazado' and new.estado = 'Pendiente' then
    update convenio_aprobaciones
      set estado = 'pendiente', resuelto_por_id = null, fecha = null, comentario = null
      where convenio_id = new.id;

    -- Mismo motivo que en fn_reiniciar_aprobaciones_evento arriba.
    select * into v_primera_etapa from convenio_aprobaciones where convenio_id = new.id and orden = 1;
    if found then
      insert into notificaciones (para_usuario_id, tipo, mensaje, documento_ref_tipo, documento_ref_id)
      select u.id, 'tarea_pendiente',
        format('El convenio de pago a HCP "%s", corregido y reenviado, está pendiente de tu aprobación (etapa: %s).',
          coalesce(nullif(new.hcp_nombre_completo, ''), '(sin nombre)') || ' — Convenio de Pago', v_primera_etapa.etiqueta),
        'convenio', new.id
      from usuarios u
      where public.fn_rol_satisface(u.rol::text, v_primera_etapa.rol_requerido::text)
        and coalesce(u.activo, true) is true;
    end if;
  end if;
  return new;
end;
$function$;

-- fn_reiniciar_aprobaciones_convenio_hcp
CREATE OR REPLACE FUNCTION public.fn_reiniciar_aprobaciones_convenio_hcp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_primera_etapa convenio_hcp_aprobaciones%rowtype;
  v_nombre_doc    text;
begin
  if old.estado = 'Rechazado' and new.estado = 'Pendiente' then
    update convenio_hcp_aprobaciones
      set estado = 'pendiente', resuelto_por_id = null, fecha = null, comentario = null
      where convenio_hcp_id = new.id;

    v_nombre_doc := coalesce(nullif(new.nombre_director_general, ''), '(sin firmante)') || ' — Convenio HCP';

    select * into v_primera_etapa from convenio_hcp_aprobaciones where convenio_hcp_id = new.id and orden = 1;
    if found then
      insert into notificaciones (para_usuario_id, tipo, mensaje, documento_ref_tipo, documento_ref_id)
      select u.id, 'tarea_pendiente',
        format('El Convenio HCP "%s", corregido y reenviado, está pendiente de tu aprobación (etapa: %s).',
          v_nombre_doc, v_primera_etapa.etiqueta),
        'convenioHCP', new.id
      from usuarios u
      where public.fn_rol_satisface(u.rol::text, v_primera_etapa.rol_requerido::text)
        and coalesce(u.activo, true) is true;
    end if;
  end if;
  return new;
end;
$function$;

-- fn_reiniciar_aprobaciones_caf
CREATE OR REPLACE FUNCTION public.fn_reiniciar_aprobaciones_caf()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_primera_etapa caf_aprobaciones%rowtype;
  v_nombre_caf    text;
begin
  if old.estado = 'Rechazado' and new.estado = 'Pendiente' then
    update caf_aprobaciones
      set estado = 'pendiente', resuelto_por_id = null, fecha = null, comentario = null
      where caf_id = new.id;

    v_nombre_caf := coalesce(nullif(new.contraparte_nombre, ''), '(sin contraparte)') || ' — CAF';

    select * into v_primera_etapa from caf_aprobaciones where caf_id = new.id and orden = 1;
    if found then
      insert into notificaciones (para_usuario_id, tipo, mensaje, documento_ref_tipo, documento_ref_id)
      select u.id, 'tarea_pendiente',
        format('El CAF "%s", corregido y reenviado, está pendiente de tu aprobación (etapa: %s).',
          v_nombre_caf, v_primera_etapa.etiqueta),
        'caf', new.id
      from usuarios u
      where public.fn_rol_satisface(u.rol::text, v_primera_etapa.rol_requerido::text)
        and coalesce(u.activo, true) is true;
    end if;
  end if;
  return new;
end;
$function$;

-- beats_notificar_tarea_pendiente
CREATE OR REPLACE FUNCTION public.beats_notificar_tarea_pendiente(p_tipo text, p_tabla text, p_doc_id uuid, p_rol text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row    jsonb;
  v_nombre text;
begin
  execute format('select to_jsonb(t) from public.%I t where t.id = $1', p_tabla) into v_row using p_doc_id;
  if v_row is null or v_row->>'estado' is distinct from 'Pendiente' then
    return; -- borrador u otro estado: todavía no hay tarea de firma
  end if;

  v_nombre := coalesce(
    nullif(v_row->>'nombre_evento', ''),
    nullif(concat_ws(' · ', nullif(v_row->>'codigo_documento', ''), nullif(v_row->>'compania_nombre', '')), ''),
    nullif(concat_ws(' · ', nullif(v_row->>'hcp_nombre_completo', ''), nullif(v_row->>'nombre_evento_servicio', '')), ''),
    nullif(concat_ws(' · ', nullif(v_row->>'consultor_nombre', ''), nullif(v_row->>'compania_nombre', '')), ''),
    'Documento'
  );

  insert into public.notificaciones (para_usuario_id, tipo, mensaje, documento_ref_tipo, documento_ref_id)
  select u.id,
         'tarea_pendiente',
         format('"%s" está esperando tu aprobación.', v_nombre),
         p_tipo::public.tipo_doc,          -- <-- la corrección: text -> enum
         p_doc_id
    from public.usuarios u
   where public.fn_rol_satisface(u.rol::text, p_rol)
     and coalesce(u.activo, true) is true;
end;
$function$;

-- fn_enviar_recordatorios_pendientes
CREATE OR REPLACE FUNCTION public.fn_enviar_recordatorios_pendientes()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_url     text;
  v_secret  text;
  v_app_url text;
  v_fila    record;
begin
  select edge_function_url, webhook_secret, app_url into v_url, v_secret, v_app_url
    from configuracion_integraciones
    where id = 1;

  if v_url is null then
    return;
  end if;

  for v_fila in
    with pendientes as (
      select se.id as doc_id, 'evento'::tipo_doc as tipo_doc, ea.rol_requerido, ea.etiqueta,
        fn_asunto_documento('evento', se.id) as detalle,
        coalesce((select fecha from evento_aprobaciones where evento_id = se.id and orden = ea.orden - 1), se.creado_en) as desde
      from evento_aprobaciones ea
      join solicitudes_evento se on se.id = ea.evento_id
      where se.estado = 'Pendiente' and ea.estado = 'pendiente'
        and ea.orden = (select min(orden) from evento_aprobaciones where evento_id = se.id and estado = 'pendiente')

      union all

      select cv.id, 'convenio'::tipo_doc, ca.rol_requerido, ca.etiqueta,
        fn_asunto_documento('convenio', cv.id),
        coalesce((select fecha from convenio_aprobaciones where convenio_id = cv.id and orden = ca.orden - 1), cv.creado_en)
      from convenio_aprobaciones ca
      join convenios_pago_hcp cv on cv.id = ca.convenio_id
      where cv.estado = 'Pendiente' and ca.estado = 'pendiente'
        and ca.orden = (select min(orden) from convenio_aprobaciones where convenio_id = cv.id and estado = 'pendiente')

      union all

      select c.id, 'caf'::tipo_doc, cfa.rol_requerido, cfa.etiqueta,
        fn_asunto_documento('caf', c.id),
        coalesce((select fecha from caf_aprobaciones where caf_id = c.id and orden = cfa.orden - 1), c.creado_en)
      from caf_aprobaciones cfa
      join cafs c on c.id = cfa.caf_id
      where c.estado = 'Pendiente' and cfa.estado = 'pendiente'
        and cfa.orden = (select min(orden) from caf_aprobaciones where caf_id = c.id and estado = 'pendiente')

      union all

      select ch.id, 'convenioHCP'::tipo_doc, cha.rol_requerido, cha.etiqueta,
        fn_asunto_documento('convenioHCP', ch.id),
        coalesce((select fecha from convenio_hcp_aprobaciones where convenio_hcp_id = ch.id and orden = cha.orden - 1), ch.creado_en)
      from convenio_hcp_aprobaciones cha
      join convenios_hcp ch on ch.id = cha.convenio_hcp_id
      where ch.estado = 'Pendiente' and cha.estado = 'pendiente'
        and cha.orden = (select min(orden) from convenio_hcp_aprobaciones where convenio_hcp_id = ch.id and estado = 'pendiente')
    ),
    lineas as (
      select u.id as usuario_id, u.email, u.nombre,
        (current_date - p.desde::date) as dias,
        format('<li>%s <span style="color:#6b7280;">(etapa: %s · pendiente hace %s día(s))</span></li>',
          p.detalle, p.etiqueta, greatest(current_date - p.desde::date, 0)) as linea
      from pendientes p
      join usuarios u on public.fn_rol_satisface(u.rol::text, p.rol_requerido::text)
      where u.email is not null and u.email <> ''
    )
    select usuario_id, email, nombre,
           string_agg(linea, '' order by dias desc) as items_html,
           count(*) as total
    from lineas
    group by usuario_id, email, nombre
  loop
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
      body    := jsonb_build_object(
        'to', v_fila.email,
        'cc', fn_cc_admin(),
        'subject', format('Recordatorio: tienes %s tarea(s) pendiente(s) en BEATS', v_fila.total),
        'html', format(
          '<p>Hola %s,</p><p>Este es un recordatorio automático: sigues teniendo tareas pendientes de tu aprobación en BEATS.</p><ul>%s</ul>%s<p style="font-size:12px;color:#6b7280;">Si tienes alguna inquietud sobre cualquiera de estas tareas, contacta a quien creó cada documento (dentro de BEATS) o a <a href="mailto:%s">%s</a> (administrador de la plataforma).</p>',
          coalesce(v_fila.nombre, ''), v_fila.items_html,
          case when v_app_url is null or v_app_url = '' then ''
            else format('<p><a href="%s" style="display:inline-block;padding:8px 16px;background:#16213e;color:#ffffff;text-decoration:none;border-radius:6px;">Abrir BEATS</a></p>', v_app_url)
          end,
          fn_cc_admin(), fn_cc_admin()
        )
      ),
      timeout_milliseconds := 20000
    );
  end loop;
end;
$function$;

-- fn_puede_configurar_plantilla_convenio_hcp
CREATE OR REPLACE FUNCTION public.fn_puede_configurar_plantilla_convenio_hcp()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select current_rol()::text in ('legal', 'compliance', 'legal_compliance', 'administrador') or current_es_administrador();
$function$;

-- fn_resguardo_edicion_usuarios
CREATE OR REPLACE FUNCTION public.fn_resguardo_edicion_usuarios()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  -- 1) Nadie cambia sus PROPIOS campos de privilegio, ni siquiera alguien
  --    con fn_puede_configurar() = true (Dirección Médica, rol
  --    administrador, o es_administrador). Este bloque va ANTES del bypass
  --    de fn_puede_configurar() del punto 2 — es justamente ese bypass el
  --    que dejaba esta puerta abierta.
  if new.auth_user_id = auth.uid() and (
    new.rol is distinct from old.rol
    or new.es_administrador is distinct from old.es_administrador
    or new.administrador_alcance_limitado is distinct from old.administrador_alcance_limitado
    or new.paises_operacion is distinct from old.paises_operacion
    or new.empresas_grupo is distinct from old.empresas_grupo
  ) then
    raise exception 'No puedes cambiar tu propio rol, bandera de Administrador, alcance limitado, país(es) o empresa(s) de operación — pide a otro Administrador o a Dirección Médica que lo haga.';
  end if;

  -- 2) Con acceso de configuración (y habiendo pasado el punto 1, es decir,
  --    editando a OTRA persona, o sin tocar ninguno de esos campos en su
  --    propia fila), puede editar cualquier otro campo libremente — sujeto,
  --    además, a fn_puede_gestionar_usuario() en la política RLS de
  --    usuarios_update (administrador_alcance_limitado.sql), que sigue
  --    aplicando por separado.
  if fn_puede_configurar() then
    return new;
  end if;

  -- 3) Sin acceso de configuración: solo autoservicio inocuo (nombre,
  --    cargo, teléfono, correo, firma). Se agregan aquí paises_operacion/
  --    empresas_grupo (antes no estaban en esta lista — cualquier usuario
  --    podía, en teoría, ampliarse su propio alcance de documentos con un
  --    PATCH directo a la API, sin pasar por la UI).
  if new.nombre is distinct from old.nombre
     or new.cargo is distinct from old.cargo
     or new.email is distinct from old.email
     or new.rol is distinct from old.rol
     or new.area is distinct from old.area
     or new.es_director_area is distinct from old.es_director_area
     or new.es_administrador is distinct from old.es_administrador
     or new.administrador_alcance_limitado is distinct from old.administrador_alcance_limitado
     or new.paises_operacion is distinct from old.paises_operacion
     or new.empresas_grupo is distinct from old.empresas_grupo then
    raise exception 'Solo Dirección Médica o un Administrador pueden cambiar nombre, cargo, correo, rol, área, la condición de director de área, país(es)/empresa(s) de operación, o las banderas de Administrador de un colaborador.';
  end if;

  return new;
end;
$function$;

-- 5. Autoservicio acotado y directorio ---------------------------------------
-- El usuario solo puede cambiar SUS PROPIAS opciones de firma; el resto de su fila
-- (rol, área, director, privilegios, activo...) queda fuera de su alcance.
create or replace function public.actualizar_mis_opciones_firma(
  p_jefe_inmediato_id uuid,
  p_firma_como_jefe_inmediato boolean,
  p_firma_como_director_area boolean,
  p_firma_como_compliance_latam boolean
) returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_yo usuarios%rowtype;
begin
  select * into v_yo from usuarios where auth_user_id = auth.uid() limit 1;
  if not found then
    raise exception 'No hay una sesión válida.';
  end if;

  if p_jefe_inmediato_id is not null and not exists (
    select 1 from usuarios where id = p_jefe_inmediato_id and coalesce(activo, true) is true
  ) then
    raise exception 'El jefe inmediato elegido no existe o está inhabilitado.';
  end if;

  update usuarios
     set jefe_inmediato_id = p_jefe_inmediato_id,
         firma_como_jefe_inmediato = (p_jefe_inmediato_id is not null and coalesce(p_firma_como_jefe_inmediato, false)),
         firma_como_director_area = (not v_yo.es_director_area and coalesce(p_firma_como_director_area, false)),
         firma_como_compliance_latam = (v_yo.rol::text in ('compliance', 'legal_compliance') and coalesce(p_firma_como_compliance_latam, false))
   where id = v_yo.id;
end;
$fn$;
revoke all on function public.actualizar_mis_opciones_firma(uuid, boolean, boolean, boolean) from public;
grant execute on function public.actualizar_mis_opciones_firma(uuid, boolean, boolean, boolean) to authenticated;

-- Directorio mínimo (sin datos sensibles) para los desplegables de jefe inmediato.
create or replace function public.directorio_usuarios()
returns table (id uuid, nombre text, cargo text, area text, es_director_area boolean)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select u.id, u.nombre, u.cargo, u.area, u.es_director_area
    from usuarios u
   where coalesce(u.activo, true) is true
     and coalesce(u.estado_usuario, 'Confirmado') <> 'Borrador'
     and exists (select 1 from usuarios yo where yo.auth_user_id = auth.uid())
   order by u.nombre;
$fn$;
revoke all on function public.directorio_usuarios() from public;
grant execute on function public.directorio_usuarios() to authenticated;

-- 6. Pasos PENDIENTES (documentos en curso) ------------------------------------
-- Se marca la bandera de sesión que usan los RPC de aprobación, por si tu base
-- tiene un trigger que solo deja modificar pasos desde ellos.
select set_config('beats.rpc_aprobacion', 'on', true);
update public.evento_aprobaciones         set rol_requerido = 'compliance' where rol_requerido::text = 'legal_compliance' and estado::text = 'pendiente';
update public.convenio_aprobaciones       set rol_requerido = 'legal'      where rol_requerido::text = 'legal_compliance' and estado::text = 'pendiente';
update public.convenio_hcp_aprobaciones   set rol_requerido = 'legal'      where rol_requerido::text = 'legal_compliance' and estado::text = 'pendiente';
-- (caf_aprobaciones queda como está: la cadena nueva del CAF llega en la entrega 24;
--  un paso 'legal_compliance' pendiente lo puede firmar cualquiera de los tres roles.)

notify pgrst, 'reload schema';

-- Verificación (solo lectura):
-- select public.fn_rol_satisface('legal','compliance')            as legal_no_firma_compliance,   -- false
--        public.fn_rol_satisface('compliance','compliance')       as compliance_si,               -- true
--        public.fn_rol_satisface('legal_compliance','legal')      as lc_firma_legal,              -- true
--        public.fn_rol_satisface('legal_compliance','compliance') as lc_firma_compliance;         -- true
-- select column_name from information_schema.columns
--  where table_name = 'usuarios' and column_name in ('area','es_director_area','firma_como_director_area','jefe_inmediato_id','firma_como_jefe_inmediato','firma_como_compliance_latam');
