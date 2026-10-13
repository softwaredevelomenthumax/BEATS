-- =============================================================================
-- Entrega 38 (octubre 2026) — la variable {{mensaje}} de las notificaciones pasa a ser EDITABLE.
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Ejecutar COMPLETO a mano en el SQL Editor de
-- Supabase (idempotente). Requiere haber aplicado antes db/entrega_29_configuracion_notificaciones.sql.
--
-- Problema: {{mensaje}} era siempre el texto que arma la app o la base de datos; algunos no tenían una
-- redacción apropiada y, al combinarlos con otras variables ({{tipo_documento}}, {{fecha}}…), el correo
-- quedaba incoherente.
--
-- Solución: columna `mensaje_plantilla` en `notificaciones_config`. Si tiene texto, reemplaza el valor de
-- {{mensaje}} (se puede combinar con las demás variables); si es null, todo funciona como hasta ahora.
-- `fn_notificar_por_email()` se reemplaza conservando EXACTAMENTE el resto de su comportamiento.
-- =============================================================================

alter table public.notificaciones_config add column if not exists mensaje_plantilla text;

-- Texto plano de {{mensaje}}: sustituye las demás variables (no {{mensaje}} ni {{enlace}}), quita las no
-- resueltas y conserva los saltos de línea (a diferencia del asunto). El escape de HTML lo hace luego el cuerpo.
create or replace function public.fn_render_mensaje_correo(p_plantilla text, p_vars jsonb)
returns text
language plpgsql
immutable
as $function$
declare
  v text := replace(coalesce(p_plantilla, ''), E'\r', '');
  k text;
  val text;
begin
  for k, val in select key, value from jsonb_each_text(coalesce(p_vars, '{}'::jsonb)) loop
    if k not in ('mensaje', 'enlace') then
      v := replace(v, '{{' || k || '}}', coalesce(val, ''));
    end if;
  end loop;
  v := regexp_replace(v, '\{\{(?!enlace\}\})[a-z_]+\}\}', '', 'g');
  v := regexp_replace(v, '[ \t]+\n', E'\n', 'g');
  return btrim(v);
end;
$function$;

-- Que otras funciones de la base puedan consultar también la redacción propia.
drop function if exists public.beats_config_correo(text);
create or replace function public.beats_config_correo(p_clave text)
returns table (activo boolean, asunto_plantilla text, cuerpo_plantilla text, mensaje_plantilla text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(c.activo, true), c.asunto_plantilla, c.cuerpo_plantilla, c.mensaje_plantilla
  from (select 1) base
  left join public.notificaciones_config c on c.clave = p_clave;
$$;

create or replace function public.fn_notificar_por_email()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_email    text;
  v_nombre   text;
  v_url      text;
  v_secret   text;
  v_app_url  text;
  v_asunto   text;
  v_cuerpo   text;
  v_enlace   text := '';
  v_cfg      public.notificaciones_config%rowtype;
  v_hay_cfg  boolean := false;
  v_vars     jsonb;
  v_cc_base  jsonb;
  v_cc_extra text[] := '{}';
  v_cc       jsonb;
begin
  if new.enviar_email is false then
    return new; -- la app pidió no enviar correo para este aviso (ya lo envía otro trigger de la base)
  end if;

  select email, nombre into v_email, v_nombre
    from usuarios
    where id = new.para_usuario_id;

  if v_email is null or v_email = '' then
    return new; -- el usuario no tiene correo registrado
  end if;

  select edge_function_url, webhook_secret, app_url into v_url, v_secret, v_app_url
    from configuracion_integraciones
    where id = 1;

  if v_url is null then
    return new; -- integración de correo aún no configurada
  end if;

  -- Configuración del tipo de aviso (si existe).
  if new.clave_evento is not null then
    select * into v_cfg from public.notificaciones_config where clave = new.clave_evento;
    v_hay_cfg := found;
    if v_hay_cfg and v_cfg.activo is false then
      return new; -- un Administrador desactivó el correo de este tipo de aviso (la campanita sigue)
    end if;
  end if;

  if new.documento_ref_tipo is not null and new.documento_ref_id is not null then
    v_enlace := fn_enlace_documento_html(v_app_url, new.documento_ref_tipo, new.documento_ref_id);
  end if;

  v_vars := coalesce(new.variables, '{}'::jsonb)
            || jsonb_build_object(
                 'nombre', coalesce(v_nombre, ''),
                 'mensaje', coalesce(new.mensaje, ''),
                 'tipo_documento', public.fn_etiqueta_tipo_doc(new.documento_ref_tipo::text),
                 'fecha', to_char(now() at time zone 'America/Bogota', 'DD/MM/YYYY HH24:MI')
               );

  -- Octubre 2026: si el Administrador redactó la variable {{mensaje}}, reemplaza el texto original de la fila.
  -- Se renderiza con las DEMÁS variables (nombre, tipo_documento, fecha, documento, etapa, actor, motivo, evento…).
  if v_hay_cfg and nullif(btrim(coalesce(v_cfg.mensaje_plantilla, '')), '') is not null then
    v_vars := v_vars || jsonb_build_object('mensaje', public.fn_render_mensaje_correo(v_cfg.mensaje_plantilla, v_vars));
    new.mensaje := v_vars ->> 'mensaje';
  end if;

  -- Asunto: plantilla configurada > asunto propio de la fila > asunto genérico por tipo (como antes).
  if v_hay_cfg and nullif(btrim(coalesce(v_cfg.asunto_plantilla, '')), '') is not null then
    v_asunto := public.fn_render_asunto_correo(v_cfg.asunto_plantilla, v_vars);
  end if;
  if nullif(v_asunto, '') is null then
    v_asunto := coalesce(nullif(new.asunto, ''), case new.tipo
      when 'rechazo'         then 'BEATS: una solicitud tuya fue rechazada'
      when 'tarea_pendiente' then 'BEATS: tienes una tarea pendiente'
      when 'etapa_resuelta'  then 'BEATS: un colega ya resolvió una tarea que también te correspondía'
      else 'BEATS: nueva notificación'
    end);
  end if;

  -- Cuerpo: plantilla configurada, o el de siempre («Hola X», mensaje, enlace).
  if v_hay_cfg and nullif(btrim(coalesce(v_cfg.cuerpo_plantilla, '')), '') is not null then
    v_cuerpo := public.fn_render_cuerpo_correo(v_cfg.cuerpo_plantilla, v_vars, v_enlace);
  else
    v_cuerpo := format('<p>Hola %s,</p><p>%s</p>%s', coalesce(v_nombre, ''), new.mensaje, v_enlace);
  end if;

  -- Copias: administradores (como hoy, salvo que se desactive) + roles y usuarios elegidos.
  v_cc_base := case when v_hay_cfg and v_cfg.copiar_administradores is false then null else to_jsonb(fn_cc_admin()) end;
  if v_hay_cfg then
    v_cc_extra := array(
      select distinct u.email
        from usuarios u
        where coalesce(u.activo, true) is true
          and coalesce(u.email, '') <> ''
          and u.email <> v_email
          and (
            u.id = any (v_cfg.cc_usuarios)
            or exists (select 1 from unnest(v_cfg.cc_roles) r where public.fn_rol_satisface(u.rol::text, r))
          )
    );
  end if;

  v_cc := case
    when coalesce(array_length(v_cc_extra, 1), 0) = 0 then v_cc_base
    when v_cc_base is null or jsonb_typeof(v_cc_base) = 'null' then to_jsonb(v_cc_extra)
    when jsonb_typeof(v_cc_base) = 'array' then
      (select jsonb_agg(distinct e) from (select jsonb_array_elements_text(v_cc_base) as e union select unnest(v_cc_extra)) t)
    else to_jsonb(concat_ws(', ', v_cc_base #>> '{}', array_to_string(v_cc_extra, ', ')))
  end;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-webhook-secret', v_secret
               ),
    body    := jsonb_build_object(
                 'to', v_email,
                 'cc', v_cc,
                 'subject', v_asunto,
                 'html', v_cuerpo
               ),
    timeout_milliseconds := 20000
  );

  return new;
end;
$function$;

notify pgrst, 'reload schema';
