-- =============================================================================
-- Corrige: al aprobar/firmar un documento aparecía
--   insert or update on table "evento_aprobaciones" violates foreign key
--   constraint "evento_aprobaciones_firma_congelada_id_fkey"
--
-- Causa: `firma_congelada_id` se creó con `references public.usuarios(id)`, pero
-- el trigger `fn_congelar_firma_aprobacion` guarda ahí `usuarios.firma_id` (el
-- id del ARCHIVO de la firma manuscrita, no de un usuario) → el id no existe
-- en `usuarios` y la FK rechaza la firma.
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE: ejecutarlo a mano en el SQL
-- Editor de Supabase. Idempotente. Quita la FK equivocada de las 4 tablas.
-- =============================================================================
do $do$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as tabla, c.conname
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.contype = 'f'
       and a.attname = 'firma_congelada_id'
       and c.conrelid::regclass::text in (
         'evento_aprobaciones', 'caf_aprobaciones', 'convenio_aprobaciones', 'convenio_hcp_aprobaciones',
         'public.evento_aprobaciones', 'public.caf_aprobaciones', 'public.convenio_aprobaciones', 'public.convenio_hcp_aprobaciones')
  loop
    execute format('alter table %s drop constraint %I', r.tabla, r.conname);
  end loop;
end
$do$;

notify pgrst, 'reload schema';
