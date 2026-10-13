-- =============================================================================
-- Ronda de ajustes de formularios — entrega 7 (septiembre 2026): CAF.
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Debe ejecutarse a mano en el
-- SQL Editor del proyecto real de Supabase.
--
-- Qué agrega y por qué:
--
--   1. `cafs.contraparte_numero_documento`, `cafs.contraparte_pais`,
--      `cafs.contraparte_estado_provincia`, `cafs.contraparte_ciudad` —
--      la especificación pide estos 4 datos de la contraparte
--      autocargados desde el Convenio de Pago a HCP relacionado; no había
--      ninguna columna equivalente (`cafs` solo tenía nombre/dirección/
--      teléfono/correo/contacto de la contraparte).
--
--   2. `cafs.termino_contrato_determinable` (boolean, default true) —
--      "Término del contrato – fin" pasa de un campo de texto libre a un
--      toggle "Determinable"/"Fecha específica"; esta columna guarda cuál
--      de las dos eligió el solicitante (`termino_contrato_fin` sigue
--      siendo la fecha, solo se diligencia cuando esta columna es false).
--
-- Antes de ejecutar, confirma que no colisiona con nada existente:
--   select column_name from information_schema.columns
--   where table_name = 'cafs'
--   and column_name in ('contraparte_numero_documento', 'contraparte_pais', 'contraparte_estado_provincia', 'contraparte_ciudad', 'termino_contrato_determinable');
-- =============================================================================

alter table public.cafs
  add column if not exists contraparte_numero_documento text,
  add column if not exists contraparte_pais text,
  add column if not exists contraparte_estado_provincia text,
  add column if not exists contraparte_ciudad text,
  add column if not exists termino_contrato_determinable boolean not null default true;
