-- =============================================================================
-- Entrega 29 — Configuración de notificaciones por correo (qué se envía, a quién y con qué texto).
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Ejecutar COMPLETO a mano en el SQL Editor de
-- Supabase (idempotente). Requisitos previos (ya existentes en la base real):
--   · db/notificaciones-enviar-email.sql y db/agregar_asunto_notificaciones.sql (columnas
--     `enviar_email` y `asunto`; función `fn_notificar_por_email`).
--   · db/agregar_rpc_eliminar_anular_documentos.sql (`beats_usuario_actual()`).
--   · db/entrega_23b_roles_legal_compliance_perfil.sql (`fn_rol_satisface`).
--   · `fn_cc_admin()` y `fn_enlace_documento_html()` (ya usadas por el trigger actual).
--
-- CÓMO FUNCIONA
--   Todo correo transaccional de BEATS nace de una fila en `notificaciones` (la crea la app o las
--   funciones `resolver_aprobacion_*` / `fn_notificar_primera_etapa_*`) y el trigger
--   `fn_notificar_por_email()` lo envía. Esta migración:
--     1. Agrega a `notificaciones` la columna `clave_evento` (qué tipo de aviso es) y `variables`
--        (datos para las plantillas). La app las llena; para las filas que crea la base de datos,
--        un trigger BEFORE INSERT infiere la clave a partir de `tipo` y del texto.
--     2. Crea `notificaciones_config` (una fila por tipo de aviso: activo, copias y plantillas) y
--        su historial de cambios. Solo un Administrador puede leerla/escribirla (RLS).
--     3. Reemplaza `fn_notificar_por_email()` conservando EXACTAMENTE su comportamiento actual
--        cuando no hay configuración para el aviso (sin fila = activo, mismo asunto, mismo cuerpo,
--        misma copia `fn_cc_admin()`); con fila: respeta «activo», agrega copias (roles/usuarios),
--        puede quitar la copia a administradores y renderiza el asunto y el cuerpo desde la plantilla.
--
-- LÍMITES CONOCIDOS (honestos)
--   · Los correos que la base envía DIRECTO con net.http_post, sin pasar por `notificaciones`
--     (los triggers `fn_notificar_aprobacion_caf/convenio/convenio_hcp/evento` —«aprobado en su
--     totalidad» al solicitante—, la rutina diaria de recordatorios y el restablecimiento de
--     contraseña), NO se controlan desde aquí: su código no vive en este repositorio y reescribirlos
--     a ciegas sería arriesgado. La pantalla los muestra marcados como «no configurable aún».
--     Para integrarlos: correr db/diagnostico-funciones-email.sql, pegar el resultado, y cada uno
--     llamaría a `public.beats_config_correo(clave)` (definida abajo) antes de enviar.
--   · Las filas que crea la base de datos solo traen {{nombre}}, {{mensaje}}, {{tipo_documento}},
--     {{fecha}} y {{enlace}}; las que crea la app traen además {{documento}}, {{etapa}}, {{actor}}, etc.
--   · No se probó contra la base real ni contra la Edge Function `send-email`.
-- =============================================================================

-- 0. Utilidades ----------------------------------------------------------------

create or replace function public.beats_es_administrador()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((public.beats_usuario_actual()).es_administrador, false);
$$;

grant execute on function public.beats_es_administrador() to authenticated;

create or replace function public.fn_etiqueta_tipo_doc(p_tipo text)
returns text
language sql
immutable
as $$
  select case p_tipo
    when 'evento' then 'Solicitud de Evento'
    when 'fmv' then 'MD FMV Checklist'
    when 'convenio' then 'Convenio de Pago a HCP'
    when 'caf' then 'CAF'
    when 'convenioHCP' then 'Convenio HCP'
    when 'notificacionPago' then 'Notificación de Pago a HCPs'
    else coalesce(p_tipo, '')
  end;
$$;

-- 1. Columnas nuevas en `notificaciones` ---------------------------------------

alter table public.notificaciones add column if not exists clave_evento text;
alter table public.notificaciones add column if not exists variables jsonb;

-- Clasificación de las filas que NO traen clave (las crea la base de datos).
create or replace function public.fn_notificaciones_clasificar()
returns trigger
language plpgsql
as $function$
begin
  if new.clave_evento is null then
    new.clave_evento := case new.tipo::text
      when 'tarea_pendiente' then 'tarea_pendiente.aprobadores'
      when 'rechazo' then 'rechazo.solicitante'
      when 'etapa_resuelta' then
        case
          when new.mensaje ilike '%aprobado en su totalidad%' then 'aprobacion_final.solicitante'
          when new.mensaje ilike '% ya aprobó la etapa%' or new.mensaje ilike '% ya rechazó la etapa%' then 'etapa_resuelta.colegas'
          else 'etapa_aprobada.solicitante'
        end
      else null
    end;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_notificaciones_clasificar on public.notificaciones;
create trigger trg_notificaciones_clasificar
  before insert on public.notificaciones
  for each row execute function public.fn_notificaciones_clasificar();

-- 2. Configuración por tipo de aviso ---------------------------------------------

create table if not exists public.notificaciones_config (
  clave                  text primary key,
  activo                 boolean not null default true,
  copiar_administradores boolean not null default true,   -- true = como hoy (fn_cc_admin())
  cc_roles               text[]  not null default '{}',
  cc_usuarios            uuid[]  not null default '{}',
  asunto_plantilla       text,                            -- null = asunto por defecto
  cuerpo_plantilla       text,                            -- null = cuerpo por defecto
  actualizado_por_id     uuid,
  actualizado_en         timestamptz not null default now()
);

create table if not exists public.notificaciones_config_historial (
  id             uuid primary key default gen_random_uuid(),
  clave          text not null,
  cambiado_por_id uuid,
  cambiado_en    timestamptz not null default now(),
  antes          jsonb,
  despues        jsonb
);

alter table public.notificaciones_config enable row level security;
alter table public.notificaciones_config_historial enable row level security;

drop policy if exists notificaciones_config_admin on public.notificaciones_config;
create policy notificaciones_config_admin on public.notificaciones_config
  for all to authenticated
  using (public.beats_es_administrador())
  with check (public.beats_es_administrador());

drop policy if exists notificaciones_config_historial_admin on public.notificaciones_config_historial;
create policy notificaciones_config_historial_admin on public.notificaciones_config_historial
  for select to authenticated
  using (public.beats_es_administrador());

create or replace function public.fn_notificaciones_config_marcar()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  new.actualizado_en := now();
  new.actualizado_por_id := (public.beats_usuario_actual()).id;
  return new;
end;
$function$;

drop trigger if exists trg_notificaciones_config_marcar on public.notificaciones_config;
create trigger trg_notificaciones_config_marcar
  before insert or update on public.notificaciones_config
  for each row execute function public.fn_notificaciones_config_marcar();

create or replace function public.fn_notificaciones_config_historial()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.notificaciones_config_historial (clave, cambiado_por_id, antes, despues)
  values (new.clave, (public.beats_usuario_actual()).id, case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new));
  return new;
end;
$function$;

drop trigger if exists trg_notificaciones_config_historial on public.notificaciones_config;
create trigger trg_notificaciones_config_historial
  after insert or update on public.notificaciones_config
  for each row execute function public.fn_notificaciones_config_historial();

-- Para que otras funciones de la base (p. ej. los triggers que envían directo) consulten la regla.
create or replace function public.beats_config_correo(p_clave text)
returns table (activo boolean, asunto_plantilla text, cuerpo_plantilla text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(c.activo, true), c.asunto_plantilla, c.cuerpo_plantilla
  from (select 1) base
  left join public.notificaciones_config c on c.clave = p_clave;
$$;

-- 3. Render de plantillas ----------------------------------------------------------

-- Asunto: texto plano. Sustituye {{variable}}; lo no resuelto se quita; sin saltos de línea.
create or replace function public.fn_render_asunto_correo(p_plantilla text, p_vars jsonb)
returns text
language plpgsql
immutable
as $function$
declare
  v text := coalesce(p_plantilla, '');
  k text;
  val text;
begin
  for k, val in select key, value from jsonb_each_text(coalesce(p_vars, '{}'::jsonb)) loop
    v := replace(v, '{{' || k || '}}', coalesce(val, ''));
  end loop;
  v := regexp_replace(v, '\{\{[a-z_]+\}\}', '', 'g');
  v := regexp_replace(v, '\s+', ' ', 'g');
  return btrim(v);
end;
$function$;

-- Cuerpo: la plantilla es texto plano (se escapa el HTML); líneas en blanco = párrafos;
-- {{enlace}} se reemplaza por el bloque HTML del enlace al documento.
create or replace function public.fn_render_cuerpo_correo(p_plantilla text, p_vars jsonb, p_enlace_html text)
returns text
language plpgsql
immutable
as $function$
declare
  v text := coalesce(p_plantilla, '');
  k text;
  val text;
begin
  v := replace(replace(replace(v, '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
  v := replace(v, E'\r', '');
  for k, val in select key, value from jsonb_each_text(coalesce(p_vars, '{}'::jsonb)) loop
    if k <> 'enlace' then
      v := replace(v, '{{' || k || '}}',
                   replace(replace(replace(coalesce(val, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'));
    end if;
  end loop;
  v := regexp_replace(v, '\{\{(?!enlace\}\})[a-z_]+\}\}', '', 'g');
  v := '<p>' || replace(replace(v, E'\n\n', '</p><p>'), E'\n', '<br>') || '</p>';
  v := replace(v, '<p>{{enlace}}</p>', coalesce(p_enlace_html, ''));
  v := replace(v, '{{enlace}}', coalesce(p_enlace_html, ''));
  v := regexp_replace(v, '<p>\s*(<br>\s*)*</p>', '', 'g');
  return v;
end;
$function$;

-- 4. Trigger de correo (misma base que db/agregar_asunto_notificaciones.sql) -----------

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

-- Verificación opcional:
-- select clave, activo, cc_roles, cc_usuarios, actualizado_en from public.notificaciones_config;
