-- =============================================================================
-- Fase 2 — evita el correo duplicado de "aprobado en su totalidad".
--
-- Contexto: la base de datos ya tenía, de antes del incidente, un trigger
-- (`fn_notificar_aprobacion_caf`/`_convenio`/`_convenio_hcp`/`_evento`) que
-- envía un correo DIRECTO al creador del documento cuando la cadena de
-- aprobación se completa por entero (todas las etapas en 'aprobado'). El
-- frontend reconstruido (Fase 2, parte 1) también inserta una fila en
-- `notificaciones` para ese mismo caso (`notificarResolucionPaso`, rama
-- `esFinal`), y esa fila cascada por `fn_notificar_por_email()` a un
-- SEGUNDO correo — el creador recibiría dos avisos de "aprobado en su
-- totalidad".
--
-- Solución elegida: agregar una bandera `enviar_email` a `notificaciones`
-- (default true, para no afectar ningún otro caso) y hacer que
-- `fn_notificar_por_email()` respete un `false` explícito. El frontend
-- (ver `src/lib/notificaciones.ts`) pasa `enviarEmail: false` únicamente en
-- la rama `esFinal` de `notificarResolucionPaso` — la campanita en la app
-- sigue avisando ahí (el insert en `notificaciones` no cambia), pero ya no
-- dispara un correo redundante, porque el trigger de aprobación ya lo
-- mandó directamente.
--
-- Ningún otro caso de `notificaciones` se ve afectado: al no pasar
-- `enviarEmail`, el default `true` deja el comportamiento exactamente igual
-- a como está hoy.
--
-- Corre esto en el Editor SQL del Dashboard de Supabase.
-- =============================================================================

-- 1. Nueva columna, con default true — no cambia nada para las filas que ya
--    existen ni para ningún insert que no pase `enviar_email` explícito.
alter table public.notificaciones
  add column if not exists enviar_email boolean not null default true;

-- 2. Mismo cuerpo de `fn_notificar_por_email()` confirmado con
--    `pg_get_functiondef` (ver db/diagnostico-funciones-email.sql), con un
--    único guard agregado al inicio.
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
  v_enlace   text := '';
begin
  if new.enviar_email is false then
    return new; -- se pidió no enviar correo para esta notificación puntual
                -- (hoy solo lo usa el caso "aprobado en su totalidad", que
                -- ya recibe un correo directo desde el trigger de
                -- aprobación del propio documento — ver
                -- fn_notificar_aprobacion_caf/convenio/convenio_hcp/evento).
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

  v_asunto := case new.tipo
    when 'rechazo'         then 'BEATS: una solicitud tuya fue rechazada'
    when 'tarea_pendiente' then 'BEATS: tienes una tarea pendiente'
    when 'etapa_resuelta'  then 'BEATS: un colega ya resolvió una tarea que también te correspondía'
    else 'BEATS: nueva notificación'
  end;

  if new.documento_ref_tipo is not null and new.documento_ref_id is not null then
    v_enlace := fn_enlace_documento_html(v_app_url, new.documento_ref_tipo, new.documento_ref_id);
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-webhook-secret', v_secret
               ),
    body    := jsonb_build_object(
                 'to', v_email,
                 'cc', fn_cc_admin(),
                 'subject', v_asunto,
                 'html', format('<p>Hola %s,</p><p>%s</p>%s', coalesce(v_nombre, ''), new.mensaje, v_enlace)
               ),
      timeout_milliseconds := 20000
  );

  return new;
end;
$function$;

-- 3. Verificación rápida (opcional): confirma que la columna quedó creada
--    con el default correcto.
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'notificaciones' and column_name = 'enviar_email';
