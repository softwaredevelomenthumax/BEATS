-- =============================================================================
-- Octubre 2026 — registrar que el Convenio HCP ya se envió al HCP.
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Ejecutar a mano en el SQL Editor de
-- Supabase (idempotente).
--
-- Síntoma: aunque el convenio ya se había enviado al HCP, la tarea «Enviar el
-- convenio firmado al HCP» seguía apareciendo en Tareas pendientes.
-- Causa probable (mismo patrón de las entregas 28b / 28e / 29): el UPDATE directo de
-- `archivo_para_hcp_enviado_en` sobre un convenio Aprobado/Completado lo filtra Row Level
-- Security (o el trigger de resguardo) sin devolver error, y la app no lo verificaba.
--
-- Qué hace: función `security definer` que valida en el servidor quién puede
-- (Administrador, Dirección Médica o quien creó el convenio) y en qué estado, y
-- registra SOLO la primera fecha de envío (si ya existe, no la sobrescribe).
-- Requiere `beats_usuario_actual()` (db/agregar_rpc_eliminar_anular_documentos.sql).
-- =============================================================================

create or replace function public.beats_marcar_convenio_hcp_enviado(p_convenio_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_usuario public.usuarios;
  v_estado  text;
  v_creador uuid;
begin
  v_usuario := public.beats_usuario_actual();
  if v_usuario.id is null then
    raise exception 'No se pudo identificar tu usuario. Cierra sesión y vuelve a ingresar.';
  end if;

  select estado::text, creado_por_id into v_estado, v_creador
    from public.convenios_hcp where id = p_convenio_id;
  if v_estado is null then
    raise exception 'El Convenio HCP ya no existe.';
  end if;
  if v_estado not in ('Aprobado', 'Completado') then
    raise exception 'Solo se registra el envío de un Convenio HCP Aprobado o Completado (este está en %).', v_estado;
  end if;
  if not (coalesce(v_usuario.es_administrador, false)
          or v_usuario.rol::text = 'medica'
          or v_creador = v_usuario.id) then
    raise exception 'No tienes permiso para registrar el envío de este Convenio HCP.';
  end if;

  perform set_config('beats.rpc_aprobacion', 'on', true);
  update public.convenios_hcp
     set archivo_para_hcp_enviado_en = coalesce(archivo_para_hcp_enviado_en, now())
   where id = p_convenio_id;
end;
$function$;

grant execute on function public.beats_marcar_convenio_hcp_enviado(uuid) to authenticated;

notify pgrst, 'reload schema';
