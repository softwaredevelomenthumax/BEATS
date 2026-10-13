-- =============================================================================
-- Fix: "function public.beats_notificar_tarea_pendiente(unknown, unknown, uuid,
-- rol_aprobador) does not exist" al guardar/enviar un documento (octubre 2026).
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE: ejecutarlo a mano en el SQL Editor
-- de Supabase. Idempotente. Requiere haber ejecutado antes
-- `corregir_notificaciones_destinatarios.sql`.
--
-- Causa: en las tablas de aprobaciones la columna `rol_requerido` es del tipo
-- ENUM `rol_aprobador`, no `text`. Los 4 triggers `fn_notificar_primera_etapa_*`
-- llamaban a `beats_notificar_tarea_pendiente(..., new.rol_requerido)` y la
-- función recibe `p_rol text`; Postgres NO convierte un enum a text de forma
-- implícita en la llamada, así que no encuentra la función y el INSERT de la
-- cadena de aprobación (la etapa 1) falla — incluso al guardar un BORRADOR,
-- porque el error ocurre al resolver la función, antes de que ella misma
-- descarte los documentos que no están 'Pendiente'.
-- Corrección: los triggers pasan `new.rol_requerido::text`, y la función compara
-- `u.rol::text = p_rol` (por si `usuarios.rol` también es un enum).
-- =============================================================================

create or replace function public.beats_notificar_tarea_pendiente(p_tipo text, p_tabla text, p_doc_id uuid, p_rol text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  select u.id, 'tarea_pendiente', format('"%s" está esperando tu aprobación.', v_nombre), p_tipo, p_doc_id
    from public.usuarios u
   where u.rol::text = p_rol
     and coalesce(u.activo, true) is true;
end;
$function$;

create or replace function public.fn_notificar_primera_etapa_evento()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.orden = 1 then perform public.beats_notificar_tarea_pendiente('evento', 'solicitudes_evento', new.evento_id, new.rol_requerido::text); end if;
  return new;
end;
$function$;

create or replace function public.fn_notificar_primera_etapa_caf()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.orden = 1 then perform public.beats_notificar_tarea_pendiente('caf', 'cafs', new.caf_id, new.rol_requerido::text); end if;
  return new;
end;
$function$;

create or replace function public.fn_notificar_primera_etapa_convenio()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.orden = 1 then perform public.beats_notificar_tarea_pendiente('convenio', 'convenios_pago_hcp', new.convenio_id, new.rol_requerido::text); end if;
  return new;
end;
$function$;

create or replace function public.fn_notificar_primera_etapa_convenio_hcp()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.orden = 1 then perform public.beats_notificar_tarea_pendiente('convenioHCP', 'convenios_hcp', new.convenio_hcp_id, new.rol_requerido::text); end if;
  return new;
end;
$function$;

notify pgrst, 'reload schema';
