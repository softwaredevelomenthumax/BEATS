-- =============================================================================
-- Asunto propio por notificación (octubre 2026).
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE: ejecutarlo a mano en el SQL
-- Editor de Supabase. Idempotente. Requiere `notificaciones-enviar-email.sql`
-- (columna `enviar_email`).
--
-- Para qué: avisar a creador y participantes del flujo cuando se termina
-- (aprobado) o se rechaza/devuelve un documento. Esos correos necesitan su
-- propio asunto ("solicitud aprobada en su totalidad", "una solicitud que
-- aprobaste fue rechazada", "una solicitud tuya fue devuelta"), no el
-- genérico por tipo. Se agrega la columna `asunto` (opcional) y el trigger de
-- correo la usa cuando viene; si no, queda exactamente igual que antes.
-- (Cuerpo de la función = el confirmado en notificaciones-enviar-email.sql,
-- con un único cambio: el cálculo de `v_asunto`.)
-- =============================================================================

alter table public.notificaciones add column if not exists asunto text;

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

  v_asunto := coalesce(nullif(new.asunto, ''), case new.tipo
    when 'rechazo'         then 'BEATS: una solicitud tuya fue rechazada'
    when 'tarea_pendiente' then 'BEATS: tienes una tarea pendiente'
    when 'etapa_resuelta'  then 'BEATS: un colega ya resolvió una tarea que también te correspondía'
    else 'BEATS: nueva notificación'
  end);

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

notify pgrst, 'reload schema';
