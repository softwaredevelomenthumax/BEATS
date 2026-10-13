-- =============================================================================
-- Ronda de ajustes de formularios — entrega 6 (septiembre 2026): FMV Checklist.
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Debe ejecutarse a mano en el
-- SQL Editor del proyecto real de Supabase.
--
-- Agrega `fmv_checklists.numero_documento` — la especificación pide
-- mostrarlo junto al resto de los datos del HCP (autocargado del
-- Repositorio de Speakers al elegir el HCP), sin asterisco de obligatorio.
-- No hay ninguna columna equivalente en el esquema real.
--
-- El resto de los campos que pedía esta entrega ("Región", "Evento de
-- origen") ya eran columnas de texto libre existentes — no necesitan
-- ninguna migración, solo se les agregó un catálogo/filtro del lado de la
-- aplicación.
--
-- Antes de ejecutar, confirma que no colisiona con nada existente:
--   select column_name from information_schema.columns
--   where table_name = 'fmv_checklists' and column_name = 'numero_documento';
-- =============================================================================

alter table public.fmv_checklists
  add column if not exists numero_documento text;
