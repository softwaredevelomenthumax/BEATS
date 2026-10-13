-- =============================================================================
-- Entrega 39a (octubre 2026): valores nuevos del enum `tipo_accion_auditoria` para dejar constancia en la
-- auditoría cuando se EDITA o se ELIMINA una anotación de pago.
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Ejecutar a mano en el SQL Editor de Supabase, ANTES que
-- `entrega_39b_anotaciones_pago_editar_eliminar.sql` y en una ejecución aparte (Postgres no deja usar un
-- valor de enum en la misma transacción en que se crea). Idempotente.
-- =============================================================================
ALTER TYPE tipo_accion_auditoria ADD VALUE IF NOT EXISTS 'anotacion_pago_editada';
ALTER TYPE tipo_accion_auditoria ADD VALUE IF NOT EXISTS 'anotacion_pago_eliminada';
