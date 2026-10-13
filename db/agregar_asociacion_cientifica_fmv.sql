-- =============================================================================
-- Refactorización de precisión (septiembre 2026): MD FMV Checklist.
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Debe ejecutarse a mano en el
-- SQL Editor del proyecto real de Supabase.
--
-- Agrega `fmv_checklists.asociacion_cientifica` — pedido explícito: después
-- de "Aplica tarifario de asociación médica" debe aparecer un campo de
-- texto "Asociación científica", obligatorio cuando esa respuesta es "Sí".
-- No hay ninguna columna equivalente en el esquema real.
--
-- Antes de ejecutar, confirma que no colisiona con nada existente:
--   select column_name from information_schema.columns
--   where table_name = 'fmv_checklists' and column_name = 'asociacion_cientifica';
-- =============================================================================

alter table public.fmv_checklists
  add column if not exists asociacion_cientifica text;
