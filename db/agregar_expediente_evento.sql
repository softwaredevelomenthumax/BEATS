-- =============================================================================
-- Expediente del evento (octubre 2026): repositorio por speaker, "No aplica"
-- con motivo, fotos con marco guía, fuerza de ventas desde Ejecución y CAF
-- elaborado en el aplicativo corporativo.
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Debe ejecutarse a mano en el
-- SQL Editor del proyecto real de Supabase. Es idempotente (se puede correr
-- más de una vez). Requiere `agregar_rpc_eliminar_anular_documentos.sql`
-- (usa `beats_usuario_actual`) solo si quieres reutilizar sus políticas; aquí
-- las políticas nuevas se definen sin depender de ella.
--
-- Qué hace:
--   1. cafs: columna `elaborado_en_caf_corporativo`.
--   2. evento_repositorio_archivos: `speaker_id`, `no_aplica` (+ motivo),
--      `etiqueta` (marco de la foto) y `origen`; `archivo_id` pasa a ser
--      opcional (una fila "No aplica" no tiene archivo).
--   3. evento_registros_financieros: `speaker_id`.
--   4. registros_fuerza_ventas: personal de fuerza de ventas registrado en
--      Ejecución (nombre, cargo, ciudad).
--   5. evento_distribucion_asistentes: conteo manual de "Otro personal".
--   6. 3 RPC nuevas para la app de Ejecución en Sitio (sin sesión de
--      usuario, igual que las 4 que ya existen): registrar fuerza de ventas,
--      registrar/reemplazar una foto y listar las fotos ya tomadas.
--
-- NO se modifica ninguna de las 4 RPC existentes de Ejecución
-- (`validar_codigo_evento_ejecucion`, `crear_registro_participacion`,
-- `registrar_muestra_entregada`, ...).
--
-- Sobre el `token` de Ejecución: no tengo a la vista el código real de
-- `validar_codigo_evento_ejecucion`, así que `fn_resolver_sesion_ejecucion`
-- detecta en tiempo de ejecución si `sesiones_ejecucion_evento` tiene una
-- columna `token` (la usa) o si el token es el propio `id` de la sesión. Si
-- ninguna de las dos hipótesis es cierta, las 3 RPC nuevas devolverán
-- "Sesión de ejecución inválida o expirada." — en ese caso pásame el
-- `pg_get_functiondef` de `crear_registro_participacion` y ajusto SOLO esa
-- función auxiliar.
--
-- Antes de ejecutar, confirma que no colisiona con nada existente:
--   select table_name, column_name from information_schema.columns
--   where table_name in ('evento_repositorio_archivos','evento_registros_financieros','cafs')
--     and column_name in ('speaker_id','no_aplica','etiqueta','origen','elaborado_en_caf_corporativo');
-- =============================================================================

-- 1. CAF elaborado en el aplicativo corporativo ------------------------------
alter table public.cafs
  add column if not exists elaborado_en_caf_corporativo boolean not null default false;

-- 2. Repositorio de archivos: por speaker, "No aplica", etiqueta de foto -----
alter table public.evento_repositorio_archivos
  add column if not exists speaker_id uuid references public.speakers(id) on delete set null,
  add column if not exists no_aplica boolean not null default false,
  add column if not exists no_aplica_motivo text,
  add column if not exists etiqueta text,
  add column if not exists origen text not null default 'manual';

alter table public.evento_repositorio_archivos alter column archivo_id drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'evento_repo_no_aplica_motivo_chk') then
    alter table public.evento_repositorio_archivos
      add constraint evento_repo_no_aplica_motivo_chk
      check (
        (no_aplica and coalesce(length(trim(no_aplica_motivo)), 0) > 0 and archivo_id is null)
        or (not no_aplica and archivo_id is not null)
      );
  end if;
end $$;

create index if not exists evento_repo_evento_speaker_idx
  on public.evento_repositorio_archivos (evento_id, speaker_id);

-- 3. Registros financieros por speaker --------------------------------------
alter table public.evento_registros_financieros
  add column if not exists speaker_id uuid references public.speakers(id) on delete set null;

create index if not exists evento_fin_evento_speaker_idx
  on public.evento_registros_financieros (evento_id, speaker_id);

-- 4. Fuerza de ventas registrada desde Ejecución ----------------------------
create table if not exists public.registros_fuerza_ventas (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.solicitudes_evento(id) on delete cascade,
  sesion_ejecucion_id uuid,
  sesion_id uuid,
  nombre text not null,
  cargo text not null,
  ciudad text not null,
  capturado_en timestamptz not null default now()
);
create index if not exists registros_fuerza_ventas_evento_idx on public.registros_fuerza_ventas (evento_id);

alter table public.registros_fuerza_ventas enable row level security;
grant select, delete on public.registros_fuerza_ventas to authenticated;

drop policy if exists beats_fuerza_ventas_select on public.registros_fuerza_ventas;
create policy beats_fuerza_ventas_select on public.registros_fuerza_ventas
  for select to authenticated
  using (exists (select 1 from public.solicitudes_evento e where e.id = evento_id));

-- Corregir un registro equivocado: quien puede ver el evento puede quitarlo.
drop policy if exists beats_fuerza_ventas_delete on public.registros_fuerza_ventas;
create policy beats_fuerza_ventas_delete on public.registros_fuerza_ventas
  for delete to authenticated
  using (exists (select 1 from public.solicitudes_evento e where e.id = evento_id));

-- 5. "Otro personal" (conteo manual) por evento o por sesión -----------------
create table if not exists public.evento_distribucion_asistentes (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.solicitudes_evento(id) on delete cascade,
  sesion_id uuid,
  conteo_otro_personal integer not null default 0 check (conteo_otro_personal >= 0),
  actualizado_en timestamptz not null default now()
);
create unique index if not exists evento_distribucion_unica_idx
  on public.evento_distribucion_asistentes (evento_id, coalesce(sesion_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table public.evento_distribucion_asistentes enable row level security;
grant select, insert, update, delete on public.evento_distribucion_asistentes to authenticated;

drop policy if exists beats_distribucion_all on public.evento_distribucion_asistentes;
create policy beats_distribucion_all on public.evento_distribucion_asistentes
  for all to authenticated
  using (exists (select 1 from public.solicitudes_evento e where e.id = evento_id))
  with check (exists (select 1 from public.solicitudes_evento e where e.id = evento_id));

-- 6. RPC para la app de Ejecución en Sitio ----------------------------------

-- Auxiliar interna (NO se expone a anon/authenticated): resuelve el token de
-- Ejecución a (sesión de ejecución, evento). Ver la nota de cabecera.
create or replace function public.fn_resolver_sesion_ejecucion(p_token text)
returns table (sesion_ejecucion_id uuid, evento_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tiene_token boolean;
begin
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'sesiones_ejecucion_evento' and column_name = 'token'
  ) into v_tiene_token;

  if v_tiene_token then
    return query execute
      'select s.id, s.evento_id from public.sesiones_ejecucion_evento s
        where s.token::text = $1 and (s.expira_en is null or s.expira_en > now()) limit 1'
      using p_token;
  else
    return query execute
      'select s.id, s.evento_id from public.sesiones_ejecucion_evento s
        where s.id::text = $1 and (s.expira_en is null or s.expira_en > now()) limit 1'
      using p_token;
  end if;
end;
$function$;
revoke all on function public.fn_resolver_sesion_ejecucion(text) from public, anon, authenticated;

-- Fuerza de ventas: nombre, cargo y ciudad.
create or replace function public.registrar_fuerza_ventas_ejecucion(
  p_token text,
  p_nombre text,
  p_cargo text,
  p_ciudad text,
  p_sesion_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sesion uuid;
  v_evento uuid;
  v_id uuid;
begin
  select r.sesion_ejecucion_id, r.evento_id into v_sesion, v_evento from public.fn_resolver_sesion_ejecucion(p_token) r;
  if v_evento is null then
    raise exception 'Sesión de ejecución inválida o expirada.';
  end if;
  if coalesce(trim(p_nombre), '') = '' or coalesce(trim(p_cargo), '') = '' or coalesce(trim(p_ciudad), '') = '' then
    raise exception 'Nombre, cargo y ciudad son obligatorios.';
  end if;

  insert into public.registros_fuerza_ventas (evento_id, sesion_ejecucion_id, sesion_id, nombre, cargo, ciudad)
  values (v_evento, v_sesion, p_sesion_id, trim(p_nombre), trim(p_cargo), trim(p_ciudad))
  returning id into v_id;
  return v_id;
end;
$function$;
grant execute on function public.registrar_fuerza_ventas_ejecucion(text, text, text, text, uuid) to anon, authenticated;

-- Foto del evento: máximo 4, una por marco (grupal, actividad_1, actividad_2,
-- speaker). Si ya había una foto en ese marco, se reemplaza.
create or replace function public.registrar_foto_evento_ejecucion(
  p_token text,
  p_etiqueta text,
  p_data_url text,
  p_nombre text,
  p_tipo text,
  p_tamano_bytes integer,
  p_sesion_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_evento uuid;
  v_archivo uuid;
  v_previo record;
begin
  select r.evento_id into v_evento from public.fn_resolver_sesion_ejecucion(p_token) r;
  if v_evento is null then
    raise exception 'Sesión de ejecución inválida o expirada.';
  end if;
  if p_etiqueta not in ('grupal', 'actividad_1', 'actividad_2', 'speaker') then
    raise exception 'Marco de foto no válido.';
  end if;
  if coalesce(p_data_url, '') = '' or p_data_url not like 'data:image/%' then
    raise exception 'La foto no es una imagen válida.';
  end if;
  if length(p_data_url) > 6000000 then
    raise exception 'La foto es demasiado pesada.';
  end if;

  -- Reemplaza la foto previa del mismo marco (si la hay).
  for v_previo in
    select id, archivo_id from public.evento_repositorio_archivos
     where evento_id = v_evento and categoria = 'fotos' and etiqueta = p_etiqueta
  loop
    delete from public.evento_repositorio_archivos where id = v_previo.id;
    delete from public.archivos_adjuntos where id = v_previo.archivo_id;
  end loop;

  if (select count(*) from public.evento_repositorio_archivos where evento_id = v_evento and categoria = 'fotos') >= 4 then
    raise exception 'Este evento ya tiene 4 fotos. Reemplaza una de las existentes.';
  end if;

  insert into public.archivos_adjuntos (nombre, tipo, tamano_bytes, data_url, cargado_en)
  values (coalesce(nullif(trim(p_nombre), ''), 'Foto_evento.jpg'), coalesce(nullif(p_tipo, ''), 'image/jpeg'), coalesce(p_tamano_bytes, 0), p_data_url, now())
  returning id into v_archivo;

  insert into public.evento_repositorio_archivos (evento_id, categoria, archivo_id, sesion_id, etiqueta, origen)
  values (v_evento, 'fotos', v_archivo, p_sesion_id, p_etiqueta, 'ejecucion');

  return v_archivo;
end;
$function$;
grant execute on function public.registrar_foto_evento_ejecucion(text, text, text, text, text, integer, uuid) to anon, authenticated;

-- Fotos ya tomadas (para mostrar qué marcos faltan en la app de Ejecución).
create or replace function public.listar_fotos_evento_ejecucion(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_evento uuid;
begin
  select r.evento_id into v_evento from public.fn_resolver_sesion_ejecucion(p_token) r;
  if v_evento is null then
    raise exception 'Sesión de ejecución inválida o expirada.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('etiqueta', e.etiqueta, 'archivoId', e.archivo_id, 'dataUrl', a.data_url))
      from public.evento_repositorio_archivos e
      join public.archivos_adjuntos a on a.id = e.archivo_id
     where e.evento_id = v_evento and e.categoria = 'fotos' and e.etiqueta is not null
  ), '[]'::jsonb);
end;
$function$;
grant execute on function public.listar_fotos_evento_ejecucion(text) to anon, authenticated;
