-- =============================================================================
-- Octubre 2026: segundo campo "Detallar lo que incluye" por speaker externo.
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Ejecutar a mano en el SQL Editor
-- del proyecto real de Supabase.
--
-- Hasta ahora `detalle_inscripcion` cubría "lo que incluye" la cuota de
-- inscripción. Se agrega `detalle_honorarios` para detallar lo que incluyen los
-- honorarios del speaker. Cada detalle solo aplica si su monto es > 0.
-- Mientras la columna no exista, la app sigue funcionando (no persiste el
-- detalle de honorarios).
-- =============================================================================

alter table public.evento_speakers_participacion
  add column if not exists detalle_honorarios text not null default '';
