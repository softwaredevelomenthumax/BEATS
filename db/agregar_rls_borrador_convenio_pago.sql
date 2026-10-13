-- =============================================================================
-- Permisos (RLS) para guardar BORRADORES de la Solicitud de Convenio de Pago a
-- HCP (octubre 2026).
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE: ejecutarlo a mano en el SQL
-- Editor de Supabase. Requiere `agregar_rpc_eliminar_anular_documentos.sql`
-- (usa `beats_usuario_actual`). Es idempotente.
--
-- Síntoma que corrige: al dar "Guardar como borrador" en Nuevo Convenio de Pago
-- a HCP aparecía "No se pudo crear el convenio de pago: No tienes permiso para
-- realizar esta acción." (código 42501 / violación de Row Level Security).
--
-- Por qué pasa: el cliente hace `insert(...).select("*")`, es decir
-- INSERT ... RETURNING. Con RLS activo, Postgres exige que la fila recién creada
-- cumpla TAMBIÉN la política de LECTURA (SELECT) y la de INSERT. Si las políticas
-- de `convenios_pago_hcp` no contemplan una fila en estado 'Borrador' del propio
-- creador, todo el INSERT se rechaza aunque el usuario sí pueda enviar a
-- aprobación.
--
-- Qué hace este script: AGREGA políticas PERMISIVAS (las permisivas se suman con
-- OR a las que ya existen, así que no pueden quitarle acceso a nadie) que dejan
-- al creador de un documento:
--   - verlo, crearlo como 'Borrador' y editarlo mientras siga en Borrador o
--     Devuelto;
--   - crear y ver los pasos de su cadena de aprobación (`convenio_aprobaciones`).
-- No se toca ninguna política existente (a diferencia de un ajuste "a ciegas",
-- no hay riesgo de la recursión infinita que ya bloqueó el login una vez; las
-- políticas usan funciones SECURITY DEFINER, no subconsultas a `usuarios`).
--
-- Si después de aplicarlo el error continúa, corre el diagnóstico de abajo y
-- compártelo: el siguiente sospechoso sería un trigger o una columna con GRANT
-- restringido, no una política.
-- =============================================================================

-- ---- Diagnóstico (solo lectura; correr ANTES si quieres ver el estado actual)
-- select relname, relrowsecurity, relforcerowsecurity from pg_class where relname in ('convenios_pago_hcp','convenio_aprobaciones');
-- select tablename, policyname, permissive, roles, cmd, qual, with_check from pg_policies where tablename in ('convenios_pago_hcp','convenio_aprobaciones') order by tablename, cmd;
-- select grantee, privilege_type from information_schema.role_table_grants where table_name = 'convenios_pago_hcp' order by 1, 2;
-- select tgname, tgenabled from pg_trigger where tgrelid = 'public.convenios_pago_hcp'::regclass and not tgisinternal;

alter table public.convenios_pago_hcp enable row level security;
alter table public.convenio_aprobaciones enable row level security;

grant select, insert, update on public.convenios_pago_hcp to authenticated;
grant select, insert on public.convenio_aprobaciones to authenticated;

-- ¿El `usuarios.id` indicado es el del usuario de la sesión actual?
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

-- ¿El convenio de pago indicado fue creado por el usuario de la sesión actual?
create or replace function public.beats_es_creador_convenio_pago(p_convenio_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
      from public.convenios_pago_hcp c
      join public.usuarios u on u.id = c.creado_por_id
     where c.id = p_convenio_id and u.auth_user_id = auth.uid()
  );
$function$;
grant execute on function public.beats_es_creador_convenio_pago(uuid) to authenticated;

-- ---- convenios_pago_hcp ------------------------------------------------------
drop policy if exists beats_convenio_pago_creador_select on public.convenios_pago_hcp;
create policy beats_convenio_pago_creador_select on public.convenios_pago_hcp
  for select to authenticated
  using (public.beats_es_usuario_actual(creado_por_id));

drop policy if exists beats_convenio_pago_borrador_insert on public.convenios_pago_hcp;
create policy beats_convenio_pago_borrador_insert on public.convenios_pago_hcp
  for insert to authenticated
  with check (public.beats_es_usuario_actual(creado_por_id) and estado::text = 'Borrador');

drop policy if exists beats_convenio_pago_borrador_update on public.convenios_pago_hcp;
create policy beats_convenio_pago_borrador_update on public.convenios_pago_hcp
  for update to authenticated
  using (public.beats_es_usuario_actual(creado_por_id) and estado::text in ('Borrador', 'Devuelto'))
  with check (public.beats_es_usuario_actual(creado_por_id));

-- ---- convenio_aprobaciones ---------------------------------------------------
-- (el cliente crea los pasos de la cadena también cuando el convenio es un
-- borrador; sin esta política ese INSERT se rechaza aunque el convenio sí exista)
drop policy if exists beats_convenio_aprob_creador_select on public.convenio_aprobaciones;
create policy beats_convenio_aprob_creador_select on public.convenio_aprobaciones
  for select to authenticated
  using (public.beats_es_creador_convenio_pago(convenio_id));

drop policy if exists beats_convenio_aprob_creador_insert on public.convenio_aprobaciones;
create policy beats_convenio_aprob_creador_insert on public.convenio_aprobaciones
  for insert to authenticated
  with check (public.beats_es_creador_convenio_pago(convenio_id));

notify pgrst, 'reload schema';
