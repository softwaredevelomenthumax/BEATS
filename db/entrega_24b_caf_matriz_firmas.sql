-- ============================================================================
-- Entrega 24 (parte B) — CAF con matriz de firmas ampliada, ligada a personas.
-- EJECUTAR DESPUÉS de entrega_24a_enum_persona.sql (en otra ejecución). Idempotente.
--
-- Cadena nueva del CAF (8 líneas, en este orden):
--   1 Solicitante            → firma automática del solicitante al enviar.
--   2 Jefe inmediato         → el del perfil del solicitante. Automática si el solicitante es su
--                              propio jefe o marcó "Firma como jefe inmediato".
--   3 Director de área       → automática si el solicitante es director de área o marcó "Firma como
--                              director de área". Si no: los directores (o quienes firman como tales)
--                              de la MISMA área del solicitante; firma el primero que actúe.
--   4 Legal                  → rol Legal o Legal & Compliance.
--   5 Compliance Officer LATAM → rol Compliance o Legal & Compliance con "Firma como Compliance
--                              Officer LATAM" marcado en su perfil.
--   6 Líder FV y TV (local)  → siempre "N/A" (no firma nadie en el aplicativo).
--   7 Líder de finanzas      → rol Finanzas.
--   8 Director General       → rol Gerencia General.
-- Si una línea de persona no tiene a nadie configurado (sin jefe, sin director en el área, sin
-- Compliance Officer LATAM), el envío avisa y se notifica a los administradores, que pueden firmarla.
-- Los CAF anteriores (cadena de 4 pasos) siguen funcionando igual.
-- ============================================================================

-- 1. Columnas ----------------------------------------------------------------
alter table public.caf_aprobaciones add column if not exists tipo_firma text;
alter table public.caf_aprobaciones add column if not exists automatica boolean not null default false;
alter table public.caf_aprobaciones add column if not exists firmantes_ids uuid[];

alter table public.cafs add column if not exists responsables_contrato text;
alter table public.cafs add column if not exists aviso_atencion text;
alter table public.cafs add column if not exists aviso_con_copia_para text;

-- 2. Quién firma cada línea (la usan el envío, el reinicio y la vista previa del formulario) ----
create or replace function public.fn_caf_resolver_firmantes(p_solicitante uuid)
returns table (orden int, tipo_firma text, etiqueta text, rol_requerido text, automatica boolean, firmantes uuid[], advertencia text)
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  s        usuarios%rowtype;
  v_ids    uuid[];
begin
  select * into s from usuarios where id = p_solicitante;
  if not found then
    raise exception 'No existe el solicitante indicado.';
  end if;

  -- 1. Solicitante
  return query select 1, 'solicitante'::text, 'Solicitante'::text, 'persona'::text, true, array[s.id], null::text;

  -- 2. Jefe inmediato
  if s.firma_como_jefe_inmediato or s.jefe_inmediato_id = s.id then
    return query select 2, 'jefe_inmediato'::text, 'Jefe inmediato'::text, 'persona'::text, true, array[s.id], null::text;
  else
    v_ids := array(select u.id from usuarios u where u.id = s.jefe_inmediato_id and coalesce(u.activo, true) is true);
    return query select 2, 'jefe_inmediato'::text, 'Jefe inmediato'::text, 'persona'::text, false, v_ids,
      case when cardinality(v_ids) = 0
           then 'El solicitante no tiene un jefe inmediato cargado en su perfil: la línea "Jefe inmediato" quedará a cargo de un administrador.' end;
  end if;

  -- 3. Director de área
  if s.es_director_area or s.firma_como_director_area then
    return query select 3, 'director_area'::text, 'Director de área'::text, 'persona'::text, true, array[s.id], null::text;
  else
    v_ids := array(
      select u.id from usuarios u
       where coalesce(u.activo, true) is true
         and (u.es_director_area or u.firma_como_director_area)
         and nullif(btrim(coalesce(s.area, '')), '') is not null
         and lower(btrim(coalesce(u.area, ''))) = lower(btrim(s.area))
         and u.id <> s.id
       order by u.nombre);
    return query select 3, 'director_area'::text, 'Director de área'::text, 'persona'::text, false, v_ids,
      case when nullif(btrim(coalesce(s.area, '')), '') is null
           then 'El solicitante no tiene un área en su perfil: la línea "Director de área" quedará a cargo de un administrador.'
           when cardinality(v_ids) = 0
           then format('No hay un director de área (ni quien firme como tal) en el área "%s": la línea "Director de área" quedará a cargo de un administrador.', s.area) end;
  end if;

  -- 4. Legal (rol Legal o Legal & Compliance)
  return query select 4, 'legal'::text, 'Legal'::text, 'legal'::text, false, null::uuid[],
    case when not exists (select 1 from usuarios u where coalesce(u.activo, true) is true and public.fn_rol_satisface(u.rol::text, 'legal'))
         then 'No hay ningún usuario activo con rol Legal o Legal & Compliance.' end;

  -- 5. Compliance Officer LATAM (Compliance o Legal & Compliance que confirmó firmar como tal)
  v_ids := array(
    select u.id from usuarios u
     where coalesce(u.activo, true) is true
       and u.firma_como_compliance_latam
       and u.rol::text in ('compliance', 'legal_compliance')
     order by u.nombre);
  return query select 5, 'compliance_officer'::text, 'Compliance Officer LATAM'::text, 'persona'::text, false, v_ids,
    case when cardinality(v_ids) = 0
         then 'Nadie tiene marcada la opción "Firma como Compliance Officer LATAM": la línea quedará a cargo de un administrador.' end;

  -- 6. Líder FV y TV (local): siempre N/A
  return query select 6, 'lider_fv_tv'::text, 'Líder FV y TV (local)'::text, 'persona'::text, true, null::uuid[], null::text;

  -- 7. Líder de finanzas (local)
  return query select 7, 'lider_finanzas'::text, 'Líder de finanzas (local)'::text, 'finanzas'::text, false, null::uuid[],
    case when not exists (select 1 from usuarios u where coalesce(u.activo, true) is true and public.fn_rol_satisface(u.rol::text, 'finanzas'))
         then 'No hay ningún usuario activo con rol Finanzas.' end;

  -- 8. Director General
  return query select 8, 'director_general'::text, 'Director General'::text, 'gerencia_general'::text, false, null::uuid[],
    case when not exists (select 1 from usuarios u where coalesce(u.activo, true) is true and public.fn_rol_satisface(u.rol::text, 'gerencia_general'))
         then 'No hay ningún usuario activo con rol Gerencia General.' end;
end;
$fn$;

-- 3. Arma (o rearma) la cadena de un CAF; devuelve las advertencias ---------------------------
create or replace function public.fn_cadena_caf_reconstruir(p_caf_id uuid)
returns text[]
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_caf   cafs%rowtype;
  v_fila  record;
  v_adv   text[] := '{}';
begin
  select * into v_caf from cafs where id = p_caf_id;
  if not found then
    raise exception 'No existe el CAF indicado.';
  end if;

  delete from caf_aprobaciones where caf_id = p_caf_id;

  for v_fila in select * from public.fn_caf_resolver_firmantes(v_caf.creado_por_id) order by orden loop
    insert into caf_aprobaciones (caf_id, orden, etiqueta, rol_requerido, estado, pendiente_desde,
                                  tipo_firma, automatica, firmantes_ids, resuelto_por_id, fecha, firma_congelada_id)
    values (
      p_caf_id, v_fila.orden, v_fila.etiqueta, v_fila.rol_requerido::rol_aprobador,
      case when v_fila.automatica then 'aprobado'::estado_aprobacion else 'pendiente'::estado_aprobacion end,
      now(),
      v_fila.tipo_firma, v_fila.automatica, v_fila.firmantes,
      case when v_fila.automatica and v_fila.firmantes is not null then v_fila.firmantes[1] end,
      case when v_fila.automatica then now() end,
      case when v_fila.automatica and v_fila.firmantes is not null
           then (select u.firma_id from usuarios u where u.id = v_fila.firmantes[1]) end
    );
    if v_fila.advertencia is not null then
      v_adv := v_adv || v_fila.advertencia;
    end if;
  end loop;

  return v_adv;
end;
$fn$;

-- 4. ¿Esta persona es destinataria de la línea que hoy toca firmar? (recordatorios) -------------
create or replace function public.fn_caf_es_destinatario(p_caf_id uuid, p_usuario_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select exists (
    select 1
      from caf_aprobaciones a
     where a.caf_id = p_caf_id
       and a.estado = 'pendiente'
       and a.orden = (select min(x.orden) from caf_aprobaciones x where x.caf_id = p_caf_id and x.estado = 'pendiente')
       and a.rol_requerido::text = 'persona'
       and (
         p_usuario_id = any (coalesce(a.firmantes_ids, '{}'::uuid[]))
         or (cardinality(coalesce(a.firmantes_ids, '{}'::uuid[])) = 0
             and exists (select 1 from usuarios u where u.id = p_usuario_id and u.es_administrador and coalesce(u.activo, true) is true))
       )
  );
$fn$;

-- 5. Notificación (campana + correo, por el trigger de correo de `notificaciones`) de la línea pendiente ----
--    `p_mensaje` puede traer {etapa}, que se reemplaza por el nombre de la línea.
create or replace function public.fn_notificar_paso_caf(p_caf_id uuid, p_orden int default null, p_mensaje text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_paso   caf_aprobaciones%rowtype;
  v_msg    text;
  v_solo_admin boolean := false;
begin
  select * into v_paso from caf_aprobaciones
   where caf_id = p_caf_id and estado = 'pendiente' and (p_orden is null or orden = p_orden)
   order by orden limit 1;
  if not found then
    return;
  end if;

  v_msg := coalesce(
    replace(p_mensaje, '{etapa}', v_paso.etiqueta),
    format('%s, está pendiente de tu aprobación en BEATS (etapa: %s).', public.fn_descriptor_caf(p_caf_id), v_paso.etiqueta)
  );

  if v_paso.rol_requerido::text = 'persona' then
    if cardinality(coalesce(v_paso.firmantes_ids, '{}'::uuid[])) > 0 then
      insert into notificaciones (para_usuario_id, tipo, mensaje, documento_ref_tipo, documento_ref_id)
      select u.id, 'tarea_pendiente', v_msg, 'caf', p_caf_id
        from usuarios u
       where u.id = any (v_paso.firmantes_ids) and coalesce(u.activo, true) is true;
    else
      insert into notificaciones (para_usuario_id, tipo, mensaje, documento_ref_tipo, documento_ref_id)
      select u.id, 'tarea_pendiente',
             v_msg || ' Nadie tiene configurada esta firma: como administrador, revisa el perfil de los usuarios o resuélvela tú.',
             'caf', p_caf_id
        from usuarios u
       where u.es_administrador and coalesce(u.activo, true) is true;
    end if;
  else
    insert into notificaciones (para_usuario_id, tipo, mensaje, documento_ref_tipo, documento_ref_id)
    select u.id, 'tarea_pendiente', v_msg, 'caf', p_caf_id
      from usuarios u
     where public.fn_rol_satisface(u.rol::text, v_paso.rol_requerido::text)
       and coalesce(u.activo, true) is true;
  end if;
end;
$fn$;

-- 6. Envío a firma: arma la cadena, pasa a Pendiente y avisa ------------------------------------
create or replace function public.enviar_caf_a_firma(p_caf_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_caf   cafs%rowtype;
  v_adv   text[];
  v_paso  record;
begin
  select * into v_caf from cafs where id = p_caf_id for update;
  if not found then
    raise exception 'No existe el CAF indicado.';
  end if;
  if public.current_usuario_id() is null then
    raise exception 'No hay una sesión válida.';
  end if;
  if public.current_usuario_id() is distinct from v_caf.creado_por_id and not public.current_es_administrador() then
    raise exception 'Solo quien creó el CAF (o un administrador) puede enviarlo a aprobación.';
  end if;
  if v_caf.estado::text not in ('Borrador', 'Devuelto') then
    raise exception 'El CAF no está en un estado desde el que se pueda enviar a aprobación (%).', v_caf.estado;
  end if;
  if coalesce(v_caf.elaborado_en_caf_corporativo, false) then
    raise exception 'Un CAF elaborado en el aplicativo corporativo no tiene cadena de aprobación en BEATS.';
  end if;

  v_adv := public.fn_cadena_caf_reconstruir(p_caf_id);

  update cafs set estado = 'Pendiente' where id = p_caf_id;

  -- Quién debe firmar primero (las líneas automáticas ya quedaron firmadas).
  perform public.fn_notificar_paso_caf(p_caf_id);

  -- Líneas de persona sin firmante configurado: aviso a los administradores desde ya
  -- (la que toque primero se avisa arriba; estas son las que llegarán después).
  for v_paso in
    select a.etiqueta from caf_aprobaciones a
     where a.caf_id = p_caf_id and a.estado = 'pendiente' and a.rol_requerido::text = 'persona'
       and cardinality(coalesce(a.firmantes_ids, '{}'::uuid[])) = 0
       and a.orden > (select min(x.orden) from caf_aprobaciones x where x.caf_id = p_caf_id and x.estado = 'pendiente')
  loop
    insert into notificaciones (para_usuario_id, tipo, mensaje, documento_ref_tipo, documento_ref_id)
    select u.id, 'tarea_pendiente',
           format('%s: nadie tiene configurada la firma "%s". Revisa el perfil de los usuarios para que el CAF no se detenga.',
                  public.fn_descriptor_caf(p_caf_id), v_paso.etiqueta),
           'caf', p_caf_id
      from usuarios u where u.es_administrador and coalesce(u.activo, true) is true;
  end loop;

  return jsonb_build_object('advertencias', to_jsonb(v_adv));
end;
$fn$;
grant execute on function public.enviar_caf_a_firma(uuid) to authenticated;

-- 7. Vista previa de las firmas (formulario, antes de enviar) -----------------------------------
drop function if exists public.previsualizar_cadena_caf();
create or replace function public.previsualizar_cadena_caf(p_solicitante uuid default null)
returns table (orden int, tipo_firma text, etiqueta text, automatica boolean, firmantes jsonb, advertencia text)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select r.orden, r.tipo_firma, r.etiqueta, r.automatica,
         coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'nombre', u.nombre, 'cargo', u.cargo) order by u.nombre)
                     from usuarios u where u.id = any (coalesce(r.firmantes, '{}'::uuid[]))), '[]'::jsonb),
         r.advertencia
    from public.fn_caf_resolver_firmantes(coalesce(p_solicitante, public.current_usuario_id())) r
   where coalesce(p_solicitante, public.current_usuario_id()) is not null and public.current_usuario_id() is not null
   order by r.orden;
$fn$;
grant execute on function public.previsualizar_cadena_caf(uuid) to authenticated;

-- 8. El aviso automático de "primera etapa" del CAF pasa a hacerlo `enviar_caf_a_firma` ------------
--    (la primera línea ahora es el propio solicitante, ya firmada).
create or replace function public.fn_notificar_primera_etapa_caf()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  -- Cadena anterior (4 pasos, sin tipo_firma): se avisa como siempre. Cadena nueva: la avisa el RPC.
  if new.orden = 1 and new.tipo_firma is null then
    perform public.beats_notificar_tarea_pendiente('caf', 'cafs', new.caf_id, new.rol_requerido::text);
  end if;
  return new;
end;
$fn$;

-- 9. Funciones existentes, actualizadas ------------------------------------------------------------
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

  if coalesce(v_etapa.automatica, false) then
    raise exception 'Esta línea de firma es automática: no requiere una acción.';
  end if;

  if v_etapa.rol_requerido::text = 'persona' then
    -- Línea de firma ligada a PERSONAS (solicitante, jefe inmediato, director de área,
    -- Compliance Officer LATAM): firma quien quedó en `firmantes_ids` al armar la cadena.
    -- Si nadie quedó configurado, solo un administrador puede destrabarla.
    if cardinality(coalesce(v_etapa.firmantes_ids, '{}'::uuid[])) > 0 then
      if not (v_actor_id = any (v_etapa.firmantes_ids)) then
        raise exception 'Esta línea de firma (%) corresponde a otra persona.', v_etapa.etiqueta;
      end if;
    elsif not public.current_es_administrador() then
      raise exception 'Esta línea de firma (%) no tiene firmante configurado: avisa a un administrador.', v_etapa.etiqueta;
    end if;
  elsif not public.fn_rol_satisface(v_actor_rol::text, v_etapa.rol_requerido::text) then
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

      perform public.fn_notificar_paso_caf(p_caf_id, v_siguiente.orden, v_mensaje_siguiente);
    end if;
  end if;

  return v_nuevo_estado;
end;
$function$;

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
    v_nombre_caf := coalesce(nullif(new.contraparte_nombre, ''), '(sin contraparte)') || ' — CAF';

    if exists (select 1 from caf_aprobaciones where caf_id = new.id and tipo_firma is not null) then
      -- Cadena nueva (entrega 24): se vuelve a armar completa, porque quién firma cada línea
      -- puede haber cambiado (jefe, director de área, etc.) y las líneas automáticas se firman de nuevo.
      perform public.fn_cadena_caf_reconstruir(new.id);
      perform public.fn_notificar_paso_caf(
        new.id, null,
        format('El CAF "%s", corregido y reenviado, está pendiente de tu aprobación (etapa: {etapa}).', v_nombre_caf)
      );
    else
      -- Cadena anterior de 4 pasos (CAF creados antes de la entrega 24): se reinicia igual que antes.
      update caf_aprobaciones
        set estado = 'pendiente', resuelto_por_id = null, fecha = null, comentario = null
        where caf_id = new.id;

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
  end if;
  return new;
end;
$function$;

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
      join usuarios u on (
        case when p.rol_requerido::text = 'persona'
             then p.tipo_doc = 'caf'::tipo_doc and public.fn_caf_es_destinatario(p.doc_id, u.id)
             else public.fn_rol_satisface(u.rol::text, p.rol_requerido::text) end
      )
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


-- 10. Tipos de contrato del formato (no duplica los que ya existan) --------------------------------
insert into public.catalogo_valores (catalogo, valor, orden)
select 'tiposContrato'::catalogo_simple, v.valor,
       coalesce((select max(orden) from public.catalogo_valores where catalogo = 'tiposContrato'::catalogo_simple), -1) + v.n
from (values
  ('Contrato maestro de prestación de servicios (MSA)', 1),
  ('Contrato de servicios de consultoría', 2),
  ('Contratos de servicios SDS', 3),
  ('Contrato de compraventa', 4),
  ('Modificación', 5),
  ('Declaración de trabajo (SOW)', 6)
) as v(valor, n)
where not exists (
  select 1 from public.catalogo_valores c
   where c.catalogo = 'tiposContrato'::catalogo_simple and lower(c.valor) = lower(v.valor)
);

notify pgrst, 'reload schema';
