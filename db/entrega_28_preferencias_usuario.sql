-- ============================================================================
-- Entrega 28 — preferencias de usuario: archivado de documentos por antigüedad del evento.
--
-- EJECUTAR A MANO en el SQL Editor de Supabase (idempotente; una sola vez). Es OPCIONAL: sin esta migración la
-- preferencia «Archivar documentos de eventos finalizados hace más de N meses» se guarda solo en el navegador de cada
-- usuario (localStorage) y la app funciona igual. Con ella, la preferencia queda en el perfil del usuario y lo sigue a
-- cualquier equipo.
--
-- Qué hace:
--  1. Columna `usuarios.archivar_documentos_meses` (entero >= 0; 0 = nunca archivar; null = sin definir).
--  2. RPC `actualizar_mis_preferencias(p_archivar_documentos_meses int)`: cada usuario solo puede cambiar SU propia fila y
--     solo esta columna (mismo patrón que `actualizar_mis_opciones_firma`).
--
-- El archivado es solo de VISTA (no borra ni cambia el estado de ningún documento) — ver `src/lib/archivado.ts`.
-- ============================================================================

alter table public.usuarios add column if not exists archivar_documentos_meses integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'usuarios_archivar_documentos_meses_check'
  ) then
    alter table public.usuarios
      add constraint usuarios_archivar_documentos_meses_check
      check (archivar_documentos_meses is null or (archivar_documentos_meses >= 0 and archivar_documentos_meses <= 120));
  end if;
end $$;

create or replace function public.actualizar_mis_preferencias(p_archivar_documentos_meses integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_actor_id uuid := current_usuario_id();
begin
  if v_actor_id is null then
    raise exception 'No hay una sesión válida.';
  end if;
  if p_archivar_documentos_meses is not null and (p_archivar_documentos_meses < 0 or p_archivar_documentos_meses > 120) then
    raise exception 'El número de meses debe estar entre 0 y 120.';
  end if;
  update public.usuarios
     set archivar_documentos_meses = p_archivar_documentos_meses
   where id = v_actor_id;
end;
$fn$;

grant execute on function public.actualizar_mis_preferencias(integer) to authenticated;

notify pgrst, 'reload schema';
