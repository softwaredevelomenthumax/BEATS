-- Entrega 22 (octubre 2026) — speakers internos + externos en una misma solicitud y congelamiento de formularios.
-- Idempotente. Ejecutar completo en el SQL Editor de Supabase.

-- 1) Nuevo catálogo simple "Speakers internos" (valor = "Nombre | País").
--    (Si tu versión de Postgres no permite usar el valor nuevo en la misma transacción, ejecuta esta línea sola primero.)
alter type public.catalogo_simple add value if not exists 'speakersInternos';

-- 2) Tipo de cada speaker de la solicitud (interno / externo).
alter table public.evento_speakers_participacion
  add column if not exists tipo_speaker text null check (tipo_speaker in ('interno','externo'));

-- 3) Firma manuscrita congelada en documentos de un solo firmante.
alter table public.fmv_checklists            add column if not exists firma_congelada_id uuid null;
alter table public.notificaciones_pago_hcp   add column if not exists firma_congelada_id uuid null;

create or replace function public.fn_congelar_firma_unico_firmante() returns trigger
language plpgsql as $$
begin
  if new.firma_congelada_id is null and new.firmado_por_id is not null
     and (tg_op = 'INSERT' or old.firmado_por_id is distinct from new.firmado_por_id) then
    select firma_id into new.firma_congelada_id from public.usuarios where id = new.firmado_por_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_congelar_firma_fmv on public.fmv_checklists;
create trigger trg_congelar_firma_fmv before insert or update on public.fmv_checklists
  for each row execute function public.fn_congelar_firma_unico_firmante();
drop trigger if exists trg_congelar_firma_notif_pago on public.notificaciones_pago_hcp;
create trigger trg_congelar_firma_notif_pago before insert or update on public.notificaciones_pago_hcp
  for each row execute function public.fn_congelar_firma_unico_firmante();

-- 4) Siembra de speakers internos: se carga desde Administración → Catálogos → "Speakers internos" (nombre + país).

notify pgrst, 'reload schema';
