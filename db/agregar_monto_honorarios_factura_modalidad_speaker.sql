-- =============================================================================
-- Reorganización UX/IxD de "Nueva Solicitud de Evento" (septiembre 2026).
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Debe ejecutarse a mano en el
-- SQL Editor del proyecto real de Supabase.
--
-- Agrega a `evento_speakers_participacion` (ver `db/agregar_speakers_evento.sql`,
-- que crea la tabla) dos columnas nuevas pedidas explícitamente por la
-- propuesta aprobada:
--
--   * `monto_honorarios` — antes de esta ronda, un único campo
--     (`monto_inscripcion`) cubría tanto la cuota de inscripción como los
--     honorarios del speaker. La especificación es explícita en que "el
--     monto de inscripción y el monto de honorarios del speaker son campos
--     independientes", así que se separan en dos columnas.
--   * `factura_modalidad` — la modalidad de factura ("Factura única" /
--     "Factura por sesión") pasa de ser un único campo a nivel de todo el
--     evento (`solicitudes_evento.factura_modalidad`, que se conserva por
--     compatibilidad con documentos ya guardados pero deja de editarse
--     desde el formulario) a ser propia de cada speaker externo.
--
-- Antes de ejecutar, confirma que no colisiona con nada existente:
--   select column_name from information_schema.columns
--   where table_name = 'evento_speakers_participacion'
--     and column_name in ('monto_honorarios', 'factura_modalidad');
-- =============================================================================

alter table public.evento_speakers_participacion
  add column if not exists monto_honorarios numeric,
  add column if not exists factura_modalidad text not null default '';
