-- =============================================================================
-- Entrega 29 — guardar la copia firmada por el HCP en un Convenio HCP Aprobado.
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Ejecutar a mano en el SQL Editor de
-- Supabase (idempotente).
--
-- Síntoma: al cargar «Copia firmada por el HCP» aparecía el aviso de éxito, pero el
-- cuadro de «adjuntar» no cambiaba (seguía vacío).
-- Causa probable (mismo patrón de 28b / 28e): el UPDATE de `archivo_firmado_hcp_id`
-- sobre un convenio en estado Aprobado/Completado lo filtraba Row Level Security sin
-- devolver error (0 filas) y la app no lo verificaba. NO se pudo confirmar contra la base
-- real; la función de abajo no depende de qué política exacta lo bloquee.
--
-- Qué hace: función `security definer` que valida en el servidor quién puede (Administrador,
-- Dirección Médica o quien creó el convenio) y en qué estado (Aprobado / Completado) y recién
-- entonces actualiza SOLO esa columna. Activa `beats.rpc_aprobacion` para que el trigger
-- `fn_resguardo_edicion_documento` la deje pasar (mismo mecanismo que beats_devolver_documento).
-- Requiere `beats_usuario_actual()` (db/agregar_rpc_eliminar_anular_documentos.sql).
-- =============================================================================

create or replace function public.beats_guardar_archivo_firmado_convenio_hcp(p_convenio_id uuid, p_archivo_id uuid)
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
    raise exception 'No se pudo guardar la copia firmada: el Convenio HCP ya no existe.';
  end if;
  if v_estado not in ('Aprobado', 'Completado') then
    raise exception 'La copia firmada solo se puede cargar cuando el Convenio HCP está Aprobado o Completado (este está en %).', v_estado;
  end if;
  if not (coalesce(v_usuario.es_administrador, false)
          or v_usuario.rol::text = 'medica'
          or v_creador = v_usuario.id) then
    raise exception 'No tienes permiso para cargar la copia firmada de este Convenio HCP (Administrador, Dirección Médica o quien lo creó).';
  end if;

  perform set_config('beats.rpc_aprobacion', 'on', true);
  update public.convenios_hcp set archivo_firmado_hcp_id = p_archivo_id where id = p_convenio_id;
end;
$function$;

grant execute on function public.beats_guardar_archivo_firmado_convenio_hcp(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
