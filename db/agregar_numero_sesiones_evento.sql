-- =============================================================================
-- Reorganización UX/IxD de "Nueva Solicitud de Evento" (septiembre 2026).
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Debe ejecutarse a mano en el
-- SQL Editor del proyecto real de Supabase.
--
-- Agrega `solicitudes_evento.numero_sesiones` — pedido explícito de la
-- propuesta aprobada: un campo "Número de sesiones*" que aparece justo
-- después de "Modalidad" cuando el evento es de "Varias sesiones" y
-- autogenera esa cantidad de filas en `sesiones_evento`. Antes de esta
-- ronda no existía ninguna columna equivalente — la cantidad de sesiones
-- era implícita en el número de filas ya guardadas.
--
-- Antes de ejecutar, confirma que no colisiona con nada existente:
--   select column_name from information_schema.columns
--   where table_name = 'solicitudes_evento' and column_name = 'numero_sesiones';
-- =============================================================================

alter table public.solicitudes_evento
  add column if not exists numero_sesiones integer;
