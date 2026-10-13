-- =============================================================================
-- Notificaciones (campana) y correos — corrección idempotente (octubre 2026).
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE: ejecutarlo a mano en el SQL
-- Editor de Supabase. Antes, si quieres, corre `diagnostico_notificaciones.sql`.
--
-- Cubre las dos causas más probables de que "no llegan correos ni aparecen
-- notificaciones en la campana":
--   1. La columna `enviar_email` no existe (la app la envía en cada INSERT; si
--      falta, TODO insert de notificación falla en silencio).
--   2. RLS activo sin políticas que permitan: crear una notificación para otro
--      usuario (al pasar el documento a su etapa) y que cada usuario lea/marque
--      las suyas (la campana).
-- NO toca la configuración del correo (`configuracion_integraciones`) ni las
-- funciones/triggers de envío: si tras esto la campana funciona pero los
-- correos no, el problema está en esa integración (ver consulta 4 y 6 del
-- diagnóstico).
-- =============================================================================

alter table public.notificaciones add column if not exists enviar_email boolean not null default true;

alter table public.notificaciones enable row level security;
grant select, insert, update on public.notificaciones to authenticated;

drop policy if exists beats_notif_select on public.notificaciones;
drop policy if exists beats_notif_insert on public.notificaciones;
drop policy if exists beats_notif_update on public.notificaciones;

-- Cada usuario ve (y marca como leídas) solo las suyas; el administrador, todas.
create policy beats_notif_select on public.notificaciones for select to authenticated
  using (
    para_usuario_id = (select id from public.usuarios where auth_user_id = auth.uid() limit 1)
    or exists (select 1 from public.usuarios u where u.auth_user_id = auth.uid() and u.es_administrador is true)
  );
create policy beats_notif_update on public.notificaciones for update to authenticated
  using (para_usuario_id = (select id from public.usuarios where auth_user_id = auth.uid() limit 1))
  with check (para_usuario_id = (select id from public.usuarios where auth_user_id = auth.uid() limit 1));
-- Cualquier usuario autenticado puede crear avisos para otros (es lo que hace
-- la app al avanzar un documento de etapa).
create policy beats_notif_insert on public.notificaciones for insert to authenticated
  with check (true);

notify pgrst, 'reload schema';
