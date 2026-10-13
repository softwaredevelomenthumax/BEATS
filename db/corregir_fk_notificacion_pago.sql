-- Noviembre 2026 — "No se pudo crear la Notificación de Pago: No se puede completar la operación
-- porque hay información relacionada que lo impide" al guardar un borrador.
--
-- Causa probable: desde la entrega 25, `notificaciones_pago_hcp.factura_id` guarda el id del archivo de la
-- factura cargada en el Expediente del evento (antes era un adjunto propio), y `convenio_origen_id` es solo una
-- referencia interna. Si alguna de las dos columnas conserva una clave foránea del esquema original que apunta a
-- otra tabla, Postgres rechaza el INSERT (código 23503). Mismo tipo de corrección que
-- `corregir_fk_firma_congelada.sql`: se quitan las claves foráneas de ESAS dos columnas (los datos no se tocan).
--
-- Idempotente. Ejecutar completo en el SQL Editor de Supabase. Antes de ejecutarlo puede ver qué existe con:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.notificaciones_pago_hcp'::regclass and contype = 'f';

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'public.notificaciones_pago_hcp'::regclass
      and c.contype = 'f'
      and a.attname in ('factura_id', 'convenio_origen_id')
  loop
    execute format('alter table public.notificaciones_pago_hcp drop constraint %I', r.conname);
    raise notice 'Se quitó la restricción %', r.conname;
  end loop;
end $$;

notify pgrst, 'reload schema';
