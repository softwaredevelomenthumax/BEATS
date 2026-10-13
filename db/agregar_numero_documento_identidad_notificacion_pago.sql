-- =============================================================================
-- Ronda de ajustes de formularios (septiembre 2026) — Notificación de Pago a
-- Profesionales de la Salud (HCPs).
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Debe ejecutarse a mano en el
-- SQL Editor del proyecto real de Supabase.
--
-- Agrega `notificaciones_pago_hcp.numero_documento_identidad` — pedido
-- explícito de la especificación ("Número de documento de identidad*:
-- Cargar automáticamente desde el campo 'Número de documento' del
-- formulario de 'Solicitud de convenio de pago a HCP'..."), que no tenía
-- ninguna columna equivalente en el esquema real (solo existía
-- `cedula_licencia_profesional`, un campo distinto).
--
-- Antes de ejecutar, confirma que no colisiona con nada existente:
--   select column_name from information_schema.columns
--   where table_name = 'notificaciones_pago_hcp' and column_name = 'numero_documento_identidad';
-- =============================================================================

alter table public.notificaciones_pago_hcp
  add column if not exists numero_documento_identidad text not null default '';
