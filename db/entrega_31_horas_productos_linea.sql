-- =============================================================================
-- Entrega 31 (octubre 2026): horas de participación por speaker/sesión,
-- productos del evento (con producto principal) y «Línea» del portafolio.
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE: ejecutarlo a mano en el SQL
-- Editor de Supabase. Requiere `agregar_speakers_evento.sql` y
-- `agregar_rls_speakers_evento.sql` (usa `beats_puede_editar_speakers_evento`).
-- Es idempotente: se puede ejecutar más de una vez.
--
-- Sin este archivo la app sigue funcionando: las horas y la Línea simplemente
-- no se guardan (la app avisa), y los productos del evento no se leen/guardan.
-- =============================================================================

-- 1) Tiempo de participación (horas) por speaker y sesión.
alter table public.evento_speaker_presupuestos
  add column if not exists horas_participacion numeric(6,2);

-- 2) «Línea» del portafolio de productos (catálogo «Líneas terapéuticas»).
alter table public.productos_portafolio
  add column if not exists linea_terapeutica text;

-- 3) Productos relacionados con cada evento; exactamente uno es el principal.
create table if not exists public.evento_productos (
  id           uuid primary key default gen_random_uuid(),
  evento_id    uuid not null references public.solicitudes_evento(id) on delete cascade,
  producto_id  uuid not null references public.productos_portafolio(id) on delete restrict,
  es_principal boolean not null default false,
  orden        integer not null default 0,
  creado_en    timestamptz not null default now(),
  unique (evento_id, producto_id)
);

-- Un solo producto principal por evento.
create unique index if not exists evento_productos_un_principal
  on public.evento_productos (evento_id) where es_principal;

create index if not exists evento_productos_producto_idx on public.evento_productos (producto_id);

alter table public.evento_productos enable row level security;
grant select, insert, update, delete on public.evento_productos to authenticated;

drop policy if exists beats_evento_productos_select on public.evento_productos;
drop policy if exists beats_evento_productos_insert on public.evento_productos;
drop policy if exists beats_evento_productos_update on public.evento_productos;
drop policy if exists beats_evento_productos_delete on public.evento_productos;

create policy beats_evento_productos_select on public.evento_productos
  for select to authenticated
  using (exists (select 1 from public.solicitudes_evento e where e.id = evento_id));
create policy beats_evento_productos_insert on public.evento_productos
  for insert to authenticated
  with check (public.beats_puede_editar_speakers_evento(evento_id));
create policy beats_evento_productos_update on public.evento_productos
  for update to authenticated
  using (public.beats_puede_editar_speakers_evento(evento_id))
  with check (public.beats_puede_editar_speakers_evento(evento_id));
create policy beats_evento_productos_delete on public.evento_productos
  for delete to authenticated
  using (public.beats_puede_editar_speakers_evento(evento_id));
