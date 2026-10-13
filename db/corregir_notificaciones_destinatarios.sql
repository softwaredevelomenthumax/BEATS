-- =============================================================================
-- Notificaciones: aviso ESCALONADO por etapa y campana solo con lo propio
-- (octubre 2026).
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE: ejecutarlo a mano en el SQL
-- Editor de Supabase. Idempotente. Requiere haber ejecutado antes
-- `corregir_notificaciones.sql`.
--
-- Síntoma: al enviar un documento a firma, los usuarios de TODAS las etapas
-- (y los administradores) recibían el aviso/correo al mismo tiempo.
-- Causa: la cadena de aprobación se inserta completa (una fila por etapa, las
-- tres 'pendiente') y el trigger `fn_notificar_primera_etapa_*` (AFTER INSERT
-- en cada tabla de aprobaciones) avisaba por CADA fila insertada, no solo por
-- la primera.
-- Corrección: los 4 triggers solo avisan cuando la fila insertada es la etapa 1
-- y el documento está 'Pendiente', y solo a los usuarios activos con el rol de
-- esa etapa. Las etapas siguientes las avisa la aplicación (al aprobarse la
-- anterior, `notificarResolucionPaso`), y solo al rol de la siguiente etapa.
-- =============================================================================

-- Aviso de tarea pendiente a los usuarios con el rol indicado.
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
   where u.rol = p_rol
     and coalesce(u.activo, true) is true;
end;
$function$;

create or replace function public.fn_notificar_primera_etapa_evento()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.orden = 1 then perform public.beats_notificar_tarea_pendiente('evento', 'solicitudes_evento', new.evento_id, new.rol_requerido); end if;
  return new;
end;
$function$;

create or replace function public.fn_notificar_primera_etapa_caf()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.orden = 1 then perform public.beats_notificar_tarea_pendiente('caf', 'cafs', new.caf_id, new.rol_requerido); end if;
  return new;
end;
$function$;

create or replace function public.fn_notificar_primera_etapa_convenio()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.orden = 1 then perform public.beats_notificar_tarea_pendiente('convenio', 'convenios_pago_hcp', new.convenio_id, new.rol_requerido); end if;
  return new;
end;
$function$;

create or replace function public.fn_notificar_primera_etapa_convenio_hcp()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.orden = 1 then perform public.beats_notificar_tarea_pendiente('convenioHCP', 'convenios_hcp', new.convenio_hcp_id, new.rol_requerido); end if;
  return new;
end;
$function$;

-- La campana: cada usuario ve SOLO sus notificaciones (ni siquiera los administradores ven las ajenas).
drop policy if exists beats_notif_select on public.notificaciones;
create policy beats_notif_select on public.notificaciones for select to authenticated
  using (para_usuario_id = (select id from public.usuarios where auth_user_id = auth.uid() limit 1));

notify pgrst, 'reload schema';

-- (Opcional) Limpiar avisos de prueba que llegaron a quien aún no le tocaba:
--   delete from public.notificaciones where tipo = 'tarea_pendiente' and leida = false;
