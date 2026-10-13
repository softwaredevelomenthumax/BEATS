-- =============================================================================
-- Eliminar el log de auditoría por rango de fecha y hora (octubre 2026).
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE: ejecutarlo a mano en el SQL
-- Editor de Supabase. Requiere haber ejecutado antes
-- `agregar_rpc_eliminar_anular_documentos.sql` (usa `beats_usuario_actual`).
--
-- Pantalla "Gestión Avanzada de Documentos" → "Eliminar registros de
-- auditoría". Mismas reglas que la eliminación de documentos:
--   - solo quien tiene el permiso individual "Gestión avanzada de documentos
--     firmados" (`usuarios.puede_eliminar_documentos_firmados`);
--   - sin rastro: NO se escribe ninguna fila nueva en `auditoria`;
--   - la contraseña de quien elimina se verifica en la aplicación antes de
--     llamar a esta función.
-- El rango es [p_desde, p_hasta] (ambos extremos incluidos) sobre
-- `auditoria.ocurrido_en`. Devuelve cuántas filas se contaron / eliminaron.
-- =============================================================================

create or replace function public.beats_contar_auditoria_rango(p_desde timestamptz, p_hasta timestamptz)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_usuario public.usuarios;
  v_total integer;
begin
  v_usuario := public.beats_usuario_actual();
  if v_usuario.id is null then
    raise exception 'No se pudo identificar tu usuario. Cierra sesión y vuelve a ingresar.';
  end if;
  if coalesce(v_usuario.puede_eliminar_documentos_firmados, false) is not true then
    raise exception 'No tienes el permiso individual de "Gestión avanzada de documentos firmados".';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'Indica un rango válido: la fecha/hora "desde" debe ser anterior o igual a "hasta".';
  end if;
  select count(*) into v_total from public.auditoria where ocurrido_en >= p_desde and ocurrido_en <= p_hasta;
  return v_total;
end;
$function$;

create or replace function public.beats_eliminar_auditoria_rango(p_desde timestamptz, p_hasta timestamptz)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_usuario public.usuarios;
  v_total integer;
begin
  v_usuario := public.beats_usuario_actual();
  if v_usuario.id is null then
    raise exception 'No se pudo identificar tu usuario. Cierra sesión y vuelve a ingresar.';
  end if;
  if coalesce(v_usuario.puede_eliminar_documentos_firmados, false) is not true then
    raise exception 'No tienes el permiso individual de "Gestión avanzada de documentos firmados".';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'Indica un rango válido: la fecha/hora "desde" debe ser anterior o igual a "hasta".';
  end if;
  delete from public.auditoria where ocurrido_en >= p_desde and ocurrido_en <= p_hasta;
  get diagnostics v_total = row_count;
  return v_total;
end;
$function$;

grant execute on function public.beats_contar_auditoria_rango(timestamptz, timestamptz) to authenticated;
grant execute on function public.beats_eliminar_auditoria_rango(timestamptz, timestamptz) to authenticated;

notify pgrst, 'reload schema';
