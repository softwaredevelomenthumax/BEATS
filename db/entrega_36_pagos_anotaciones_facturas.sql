-- =============================================================================
-- Entrega 36 (octubre 2026): anotaciones de pago con trazabilidad y comprobantes
-- que cubren una o varias facturas.
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Debe ejecutarse a mano en el
-- SQL Editor del proyecto real de Supabase. Es idempotente (se puede correr
-- más de una vez). Requiere `agregar_rpc_eliminar_anular_documentos.sql`
-- (función `beats_usuario_actual()`), que ya forma parte de la base.
--
-- Qué hace:
--   1. evento_registros_financieros.facturas_ids (uuid[]): todas las facturas
--      que cubre un comprobante de pago. `factura_id` se conserva (primera
--      factura elegida) por compatibilidad con lo ya guardado.
--   2. evento_anotaciones_pago: comentarios sobre el pago de un speaker en un
--      evento (Expediente › Comprobantes de pago) y anotaciones para aclarar
--      hallazgos (Informe de Pagos a HCPs/Speakers).
--        - Trazabilidad: el AUTOR, su rol y la fecha los fija un trigger a
--          partir de la sesión (no se pueden falsificar desde el navegador).
--        - Una anotación NO se edita ni se borra. Solo se puede marcar como
--          «aclarada» (o reabrir); quién y cuándo también los fija un trigger.
--
-- Antes de ejecutar, confirma que no colisiona con nada existente:
--   select table_name, column_name from information_schema.columns
--   where (table_name = 'evento_registros_financieros' and column_name = 'facturas_ids')
--      or table_name = 'evento_anotaciones_pago';
-- =============================================================================

-- 1. Comprobante de pago ↔ varias facturas ---------------------------------
alter table public.evento_registros_financieros
  add column if not exists facturas_ids uuid[] not null default '{}';

-- Lo ya guardado: la factura única pasa a la lista.
update public.evento_registros_financieros
   set facturas_ids = array[factura_id]
 where factura_id is not null and coalesce(array_length(facturas_ids, 1), 0) = 0;

-- 2. Anotaciones de pago -----------------------------------------------------
create table if not exists public.evento_anotaciones_pago (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.solicitudes_evento(id) on delete cascade,
  speaker_id uuid references public.speakers(id) on delete set null,
  sesion_id uuid,
  registro_id uuid references public.evento_registros_financieros(id) on delete set null,
  origen text not null default 'expediente' check (origen in ('expediente', 'informe_pagos')),
  texto text not null check (length(trim(texto)) > 0),
  autor_id uuid,
  autor_nombre text not null default '',
  autor_rol text not null default '',
  creado_en timestamptz not null default now(),
  aclarada boolean not null default false,
  aclarada_por_id uuid,
  aclarada_por_nombre text,
  aclarada_en timestamptz
);
create index if not exists evento_anotaciones_pago_evento_idx
  on public.evento_anotaciones_pago (evento_id, speaker_id);

-- Autor y fecha: los fija la base, no el navegador.
create or replace function public.fn_anotacion_pago_autor()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_usuario public.usuarios;
begin
  v_usuario := public.beats_usuario_actual();
  if v_usuario.id is null then
    raise exception 'No se pudo identificar tu usuario. Cierra sesión y vuelve a ingresar.';
  end if;
  new.autor_id := v_usuario.id;
  new.autor_nombre := coalesce(v_usuario.nombre, '');
  new.autor_rol := coalesce(v_usuario.rol::text, '');
  new.creado_en := now();
  new.aclarada := false;
  new.aclarada_por_id := null;
  new.aclarada_por_nombre := null;
  new.aclarada_en := null;
  return new;
end;
$function$;

drop trigger if exists trg_anotacion_pago_autor on public.evento_anotaciones_pago;
create trigger trg_anotacion_pago_autor
  before insert on public.evento_anotaciones_pago
  for each row execute function public.fn_anotacion_pago_autor();

-- Solo cambia el estado «aclarada»; el resto de la fila es inmutable.
create or replace function public.fn_anotacion_pago_aclarar()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_usuario public.usuarios;
begin
  new.id := old.id;
  new.evento_id := old.evento_id;
  new.speaker_id := old.speaker_id;
  new.sesion_id := old.sesion_id;
  new.registro_id := old.registro_id;
  new.origen := old.origen;
  new.texto := old.texto;
  new.autor_id := old.autor_id;
  new.autor_nombre := old.autor_nombre;
  new.autor_rol := old.autor_rol;
  new.creado_en := old.creado_en;
  if new.aclarada is distinct from old.aclarada then
    v_usuario := public.beats_usuario_actual();
    if v_usuario.id is null then
      raise exception 'No se pudo identificar tu usuario. Cierra sesión y vuelve a ingresar.';
    end if;
    new.aclarada_por_id := v_usuario.id;
    new.aclarada_por_nombre := coalesce(v_usuario.nombre, '');
    new.aclarada_en := now();
  else
    new.aclarada_por_id := old.aclarada_por_id;
    new.aclarada_por_nombre := old.aclarada_por_nombre;
    new.aclarada_en := old.aclarada_en;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_anotacion_pago_aclarar on public.evento_anotaciones_pago;
create trigger trg_anotacion_pago_aclarar
  before update on public.evento_anotaciones_pago
  for each row execute function public.fn_anotacion_pago_aclarar();

alter table public.evento_anotaciones_pago enable row level security;
-- Sin DELETE a propósito: lo anotado queda como evidencia.
grant select, insert, update (aclarada) on public.evento_anotaciones_pago to authenticated;

drop policy if exists beats_anotaciones_pago_select on public.evento_anotaciones_pago;
create policy beats_anotaciones_pago_select on public.evento_anotaciones_pago
  for select to authenticated
  using (exists (select 1 from public.solicitudes_evento e where e.id = evento_id));

drop policy if exists beats_anotaciones_pago_insert on public.evento_anotaciones_pago;
create policy beats_anotaciones_pago_insert on public.evento_anotaciones_pago
  for insert to authenticated
  with check (exists (select 1 from public.solicitudes_evento e where e.id = evento_id));

drop policy if exists beats_anotaciones_pago_update on public.evento_anotaciones_pago;
create policy beats_anotaciones_pago_update on public.evento_anotaciones_pago
  for update to authenticated
  using (exists (select 1 from public.solicitudes_evento e where e.id = evento_id))
  with check (exists (select 1 from public.solicitudes_evento e where e.id = evento_id));
