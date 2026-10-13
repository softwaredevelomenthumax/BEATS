-- =============================================================================
-- Permisos (RLS) de los speakers de un evento (octubre 2026).
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE: ejecutarlo a mano en el SQL
-- Editor de Supabase. Requiere `agregar_speakers_evento.sql` y
-- `agregar_rpc_eliminar_anular_documentos.sql` (usa `beats_usuario_actual`).
--
-- Síntoma que corrige: al guardar (borrador o enviar a aprobación) una
-- Solicitud de Evento con speakers, aparecía "No se pudieron guardar los
-- speakers de este evento: no tienes permiso para realizar esta acción" —
-- incluso con rol Dirección Médica. Causa: las tablas
-- `evento_speakers_participacion` y `evento_speaker_presupuestos` se crearon
-- sin políticas de acceso, así que (con RLS activo) el INSERT se rechaza para
-- cualquier usuario autenticado y el documento quedaba creado SIN speakers.
--
-- Regla que se aplica (calcada de cómo ya se comporta el resto del evento):
--   - LEER: quien puede leer el evento (la subconsulta a `solicitudes_evento`
--     pasa por las políticas de esa tabla).
--   - ESCRIBIR: quien creó el evento, los Administradores y Dirección Médica
--     (rol `medica`) — los mismos que editan/reenvían un evento.
-- Es idempotente: se puede ejecutar más de una vez.
-- =============================================================================

alter table public.evento_speakers_participacion enable row level security;
alter table public.evento_speaker_presupuestos enable row level security;

grant select, insert, update, delete on public.evento_speakers_participacion to authenticated;
grant select, insert, update, delete on public.evento_speaker_presupuestos to authenticated;

-- ¿puede el usuario actual modificar los speakers de ese evento?
create or replace function public.beats_puede_editar_speakers_evento(p_evento_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
      from public.solicitudes_evento e
      join public.usuarios u on u.auth_user_id = auth.uid()
     where e.id = p_evento_id
       and (e.creado_por_id = u.id or u.es_administrador is true or u.rol = 'medica')
  );
$function$;
grant execute on function public.beats_puede_editar_speakers_evento(uuid) to authenticated;

drop policy if exists beats_speakers_evento_select on public.evento_speakers_participacion;
drop policy if exists beats_speakers_evento_insert on public.evento_speakers_participacion;
drop policy if exists beats_speakers_evento_update on public.evento_speakers_participacion;
drop policy if exists beats_speakers_evento_delete on public.evento_speakers_participacion;

create policy beats_speakers_evento_select on public.evento_speakers_participacion
  for select to authenticated
  using (exists (select 1 from public.solicitudes_evento e where e.id = evento_id));
create policy beats_speakers_evento_insert on public.evento_speakers_participacion
  for insert to authenticated
  with check (public.beats_puede_editar_speakers_evento(evento_id));
create policy beats_speakers_evento_update on public.evento_speakers_participacion
  for update to authenticated
  using (public.beats_puede_editar_speakers_evento(evento_id))
  with check (public.beats_puede_editar_speakers_evento(evento_id));
create policy beats_speakers_evento_delete on public.evento_speakers_participacion
  for delete to authenticated
  using (public.beats_puede_editar_speakers_evento(evento_id));

drop policy if exists beats_speaker_presupuestos_select on public.evento_speaker_presupuestos;
drop policy if exists beats_speaker_presupuestos_insert on public.evento_speaker_presupuestos;
drop policy if exists beats_speaker_presupuestos_update on public.evento_speaker_presupuestos;
drop policy if exists beats_speaker_presupuestos_delete on public.evento_speaker_presupuestos;

create policy beats_speaker_presupuestos_select on public.evento_speaker_presupuestos
  for select to authenticated
  using (exists (select 1 from public.evento_speakers_participacion s where s.id = evento_speaker_id));
create policy beats_speaker_presupuestos_insert on public.evento_speaker_presupuestos
  for insert to authenticated
  with check (exists (select 1 from public.evento_speakers_participacion s where s.id = evento_speaker_id and public.beats_puede_editar_speakers_evento(s.evento_id)));
create policy beats_speaker_presupuestos_update on public.evento_speaker_presupuestos
  for update to authenticated
  using (exists (select 1 from public.evento_speakers_participacion s where s.id = evento_speaker_id and public.beats_puede_editar_speakers_evento(s.evento_id)))
  with check (exists (select 1 from public.evento_speakers_participacion s where s.id = evento_speaker_id and public.beats_puede_editar_speakers_evento(s.evento_id)));
create policy beats_speaker_presupuestos_delete on public.evento_speaker_presupuestos
  for delete to authenticated
  using (exists (select 1 from public.evento_speakers_participacion s where s.id = evento_speaker_id and public.beats_puede_editar_speakers_evento(s.evento_id)));

notify pgrst, 'reload schema';

-- -----------------------------------------------------------------------------
-- Si TAMBIÉN las tablas `sesiones_evento` / `evento_muestras_planeadas` dan
-- "no tienes permiso" al guardar, aplica el mismo patrón allí. Si un evento
-- ya quedó creado sin speakers por este error, hay que volver a capturarlo
-- (los documentos ya enviados a firma no se editan: anúlalo y crea uno nuevo).
-- -----------------------------------------------------------------------------
