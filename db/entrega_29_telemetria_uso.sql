-- =============================================================================
-- Entrega 29 — Telemetría de uso de BEATS (tiempos de diligenciamiento, revisión/firma, carga de
-- archivos, sesiones) para la vista «Indicadores de Uso y Gestión» (solo administradores).
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Ejecutar completo en el SQL Editor (idempotente).
-- Requiere `beats_usuario_actual()` y `beats_es_administrador()`
-- (db/agregar_rpc_eliminar_anular_documentos.sql y db/entrega_29_configuracion_notificaciones.sql).
--
-- Privacidad: se registran tiempos y nombres de acciones, NUNCA el contenido de los formularios.
-- Cada usuario solo puede insertar/actualizar sus propias filas; solo un Administrador puede leerlas.
-- Si esta migración no se aplica, la app sigue funcionando: la telemetría se desactiva sola.
-- =============================================================================

create table if not exists public.telemetria_sesiones (
  id                uuid primary key,
  usuario_id        uuid not null,
  empresa_grupo     text,
  inicio            timestamptz not null default now(),
  ultimo_latido     timestamptz not null default now(),
  fin               timestamptz,
  segundos_totales  integer not null default 0,   -- tiempo conectado (pestaña abierta)
  segundos_activos  integer not null default 0,   -- con interacción real (clic, tecla, scroll)
  navegador         text,
  version_app       text
);
create index if not exists idx_telemetria_sesiones_usuario on public.telemetria_sesiones (usuario_id, inicio);
create index if not exists idx_telemetria_sesiones_inicio on public.telemetria_sesiones (inicio);

create table if not exists public.telemetria_eventos (
  id            uuid primary key default gen_random_uuid(),
  sesion_id     uuid,
  usuario_id    uuid not null,
  creado_en     timestamptz not null default now(),
  categoria     text not null,        -- pagina | formulario | revision | archivo | accion
  nombre        text not null,        -- id de página, tipo de documento, nombre de la acción…
  tipo_doc      text,
  documento_id  uuid,
  resultado     text,                 -- enviado | borrador | abandonado | aprobado | rechazado | devuelto | editado | cerrada | ok | error
  duracion_ms   integer,              -- tiempo visible transcurrido
  activo_ms     integer,              -- tiempo con interacción real
  tamano_bytes  bigint,
  detalle       jsonb
);
create index if not exists idx_telemetria_eventos_creado on public.telemetria_eventos (creado_en);
create index if not exists idx_telemetria_eventos_cat on public.telemetria_eventos (categoria, nombre);
create index if not exists idx_telemetria_eventos_usuario on public.telemetria_eventos (usuario_id, creado_en);

create table if not exists public.telemetria_reinicios (
  id                 uuid primary key default gen_random_uuid(),
  reiniciado_por_id  uuid,
  reiniciado_en      timestamptz not null default now(),
  sesiones_borradas  integer,
  eventos_borrados   integer
);

alter table public.telemetria_sesiones  enable row level security;
alter table public.telemetria_eventos   enable row level security;
alter table public.telemetria_reinicios enable row level security;

-- Cada usuario escribe lo suyo.
drop policy if exists telemetria_sesiones_insert on public.telemetria_sesiones;
create policy telemetria_sesiones_insert on public.telemetria_sesiones
  for insert to authenticated
  with check (usuario_id = (public.beats_usuario_actual()).id);

drop policy if exists telemetria_sesiones_update on public.telemetria_sesiones;
create policy telemetria_sesiones_update on public.telemetria_sesiones
  for update to authenticated
  using (usuario_id = (public.beats_usuario_actual()).id)
  with check (usuario_id = (public.beats_usuario_actual()).id);

drop policy if exists telemetria_eventos_insert on public.telemetria_eventos;
create policy telemetria_eventos_insert on public.telemetria_eventos
  for insert to authenticated
  with check (usuario_id = (public.beats_usuario_actual()).id);

-- Solo administradores leen.
drop policy if exists telemetria_sesiones_select on public.telemetria_sesiones;
create policy telemetria_sesiones_select on public.telemetria_sesiones
  for select to authenticated using (public.beats_es_administrador());

drop policy if exists telemetria_eventos_select on public.telemetria_eventos;
create policy telemetria_eventos_select on public.telemetria_eventos
  for select to authenticated using (public.beats_es_administrador());

drop policy if exists telemetria_reinicios_select on public.telemetria_reinicios;
create policy telemetria_reinicios_select on public.telemetria_reinicios
  for select to authenticated using (public.beats_es_administrador());

-- Reinicio de contadores: solo Administrador. La app pide ANTES la contraseña del usuario; aquí se
-- vuelve a exigir el rol en el servidor y se deja constancia (quién, cuándo, cuántas filas).
create or replace function public.beats_telemetria_reiniciar()
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ses integer;
  v_evt integer;
begin
  if not public.beats_es_administrador() then
    raise exception 'Solo un Administrador puede reiniciar los contadores.';
  end if;
  delete from public.telemetria_eventos where true;
  get diagnostics v_evt = row_count;
  delete from public.telemetria_sesiones where true;
  get diagnostics v_ses = row_count;
  insert into public.telemetria_reinicios (reiniciado_por_id, sesiones_borradas, eventos_borrados)
  values ((public.beats_usuario_actual()).id, v_ses, v_evt);
  return json_build_object('sesiones', v_ses, 'eventos', v_evt);
end;
$function$;

grant execute on function public.beats_telemetria_reiniciar() to authenticated;

notify pgrst, 'reload schema';
