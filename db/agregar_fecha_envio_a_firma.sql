-- =============================================================================
-- Fecha en que un documento se envió realmente a firma (octubre 2026).
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE: ejecutarlo a mano en el SQL
-- Editor de Supabase.
--
-- Problema: "Aprobaciones pendientes de tu firma" contaba los días desde la
-- fecha de creación del documento (`pendiente_desde` de la etapa se fija al
-- crear, no al enviar). Solución:
--   - Columna `enviado_a_firma_en` en los 4 documentos con cadena de
--     aprobación; un trigger la fija cada vez que el documento PASA a
--     'Pendiente' (al crearlo ya enviado, al enviar un borrador, al reenviar
--     uno rechazado/devuelto).
--   - Relleno de los existentes: último 'envio'/'edicion_reenvio' de
--     `auditoria`; si no hay, la fecha de creación.
-- La aplicación calcula con eso: primera etapa = `enviado_a_firma_en`;
-- siguientes = fecha en que firmó la anterior (`fecha` de la etapa previa).
-- =============================================================================

alter table public.solicitudes_evento add column if not exists enviado_a_firma_en timestamptz;
alter table public.cafs add column if not exists enviado_a_firma_en timestamptz;
alter table public.convenios_pago_hcp add column if not exists enviado_a_firma_en timestamptz;
alter table public.convenios_hcp add column if not exists enviado_a_firma_en timestamptz;

create or replace function public.beats_fijar_enviado_a_firma()
returns trigger
language plpgsql
as $function$
begin
  if tg_op = 'INSERT' then
    if new.estado = 'Pendiente' then
      new.enviado_a_firma_en := now();
    end if;
  elsif new.estado = 'Pendiente' and old.estado is distinct from 'Pendiente' then
    new.enviado_a_firma_en := now();
  end if;
  return new;
end;
$function$;

do $do$
declare
  t text;
begin
  foreach t in array array['solicitudes_evento','cafs','convenios_pago_hcp','convenios_hcp'] loop
    execute format('drop trigger if exists trg_beats_enviado_a_firma on public.%I', t);
    execute format('create trigger trg_beats_enviado_a_firma before insert or update of estado on public.%I for each row execute function public.beats_fijar_enviado_a_firma()', t);
  end loop;
end
$do$;

-- Relleno de los documentos que ya están (o estuvieron) en firma.
do $do$
declare
  t text;
begin
  foreach t in array array['solicitudes_evento','cafs','convenios_pago_hcp','convenios_hcp'] loop
    -- Los triggers de resguardo (fn_resguardo_edicion_documento) bloquean
    -- editar documentos en ciertos estados, incluso para este relleno de
    -- una sola columna: se desactivan solo durante el UPDATE y se reactivan.
    execute format('alter table public.%I disable trigger user', t);
    execute format($f$
      update public.%1$I d
         set enviado_a_firma_en = coalesce(
               (select max(a.ocurrido_en) from public.auditoria a
                 where a.documento_id = d.id and a.accion in ('envio', 'edicion_reenvio')),
               d.creado_en)
       where d.enviado_a_firma_en is null and d.estado <> 'Borrador'
    $f$, t);
    execute format('alter table public.%I enable trigger user', t);
  end loop;
end
$do$;

notify pgrst, 'reload schema';
