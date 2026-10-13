-- ============================================================================
-- Entrega 24 (parte A) — valor nuevo de enum. EJECUTAR PRIMERO Y SOLO ESTE
-- ARCHIVO, en una ejecución aparte (Postgres no deja usar un valor de enum
-- recién agregado dentro de la misma transacción). Idempotente.
--
--   rol_aprobador : 'persona' = línea de firma ligada a una PERSONA concreta
--                   (solicitante, jefe inmediato, director de área, Compliance
--                   Officer LATAM) y no a un rol.
-- ============================================================================
alter type public.rol_aprobador add value if not exists 'persona';
