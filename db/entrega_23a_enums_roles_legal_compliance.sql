-- ============================================================================
-- Entrega 23 (parte A) — valores nuevos de enums. EJECUTAR PRIMERO Y SOLO ESTE
-- ARCHIVO, en una ejecución aparte (Postgres no deja usar un valor de enum
-- recién agregado dentro de la misma transacción). Idempotente.
--
--   rol_usuario / rol_aprobador : 'legal' y 'compliance' (además del
--                                 'legal_compliance' ya existente = ambos).
--   catalogo_simple             : 'areasUsuario' (catálogo "Áreas" del perfil).
-- ============================================================================
alter type public.rol_usuario add value if not exists 'legal';
alter type public.rol_usuario add value if not exists 'compliance';
alter type public.rol_aprobador add value if not exists 'legal';
alter type public.rol_aprobador add value if not exists 'compliance';
alter type public.catalogo_simple add value if not exists 'areasUsuario';

-- Verificación (solo lectura):
-- select t.typname, string_agg(e.enumlabel, ', ' order by e.enumsortorder)
--   from pg_type t join pg_enum e on e.enumtypid = t.oid
--  where t.typname in ('rol_usuario', 'rol_aprobador') group by 1;
