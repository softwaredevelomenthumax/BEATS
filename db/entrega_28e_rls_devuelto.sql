-- =============================================================================
-- Permitir guardar/reenviar un documento «Devuelto» — los 6 tipos, todos los
-- usuarios (octubre 2026).
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Ejecutar a mano en el SQL Editor
-- (idempotente), después de `entrega_28b_devolver_documento.sql` y
-- `entrega_28c_devolver_trigger.sql`. REEMPLAZA a la idea de la 28d (no se usa).
--
-- Problema: las políticas RLS UPDATE reales no contemplaban el estado «Devuelto»
-- (solo Borrador/Rechazado): al corregir un documento devuelto, el UPDATE se
-- filtraba en silencio (0 filas) y la app mostraba «la base de datos no permitió
-- el cambio». Aquí se agrega, en cada una de las 6 tablas de documento, UNA
-- política adicional de UPDATE (las políticas permisivas se suman con OR: no se
-- modifica ni se quita ninguna existente):
--   - quién: quien creó el documento o un Administrador (todos los usuarios);
--   - cuándo: solo mientras el documento está en estado Devuelto;
--   - qué estado resultante: Devuelto (guardar) o Pendiente (reenviar).
-- El trigger `fn_resguardo_edicion_documento` (28c) ya aplica la misma regla.
-- =============================================================================

create or replace function public.beats_es_usuario_actual(p_usuario_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.usuarios u
     where u.id = p_usuario_id and u.auth_user_id = auth.uid()
  );
$function$;
grant execute on function public.beats_es_usuario_actual(uuid) to authenticated;

create or replace function public.beats_es_administrador_actual()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce((select u.es_administrador from public.usuarios u where u.auth_user_id = auth.uid() limit 1), false);
$function$;
grant execute on function public.beats_es_administrador_actual() to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['solicitudes_evento', 'cafs', 'fmv_checklists', 'convenios_pago_hcp', 'convenios_hcp', 'notificaciones_pago_hcp']
  loop
    execute format('grant update on public.%I to authenticated', t);
    execute format('drop policy if exists beats_%s_devuelto_update on public.%I', t, t);
    execute format(
      'create policy beats_%s_devuelto_update on public.%I for update to authenticated '
      || 'using (estado::text = ''Devuelto'' and (public.beats_es_usuario_actual(creado_por_id) or public.beats_es_administrador_actual())) '
      || 'with check (estado::text in (''Devuelto'', ''Pendiente'') and (public.beats_es_usuario_actual(creado_por_id) or public.beats_es_administrador_actual()))',
      t, t
    );
  end loop;
end
$$;

notify pgrst, 'reload schema';

-- Verificación (opcional): select tablename, policyname, cmd from pg_policies where policyname like 'beats\_%\_devuelto\_update' escape '\';
