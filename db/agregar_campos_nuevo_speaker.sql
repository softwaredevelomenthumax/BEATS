-- =============================================================================
-- Ronda de ajustes de formularios (septiembre 2026) — Nuevo Speaker.
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Debe ejecutarse a mano en el
-- SQL Editor del proyecto real de Supabase.
--
-- Qué agrega y por qué:
--
--   1. `speakers.profesion` — "Profesión: Lista desplegable desde el
--      campo 'Profesiones' de la sección 'Configuración de
--      campos/variables'", pedido explícito, sin columna equivalente
--      (distinto de `especialidad`, que ya existía).
--
--   2. `speakers.empresas_grupo_interaccion` (text[]) — "Empresa(s) del
--      grupo con la(s) cuál(es) tendrá interacción*: Campo para
--      seleccionar al menos una opción (sin límite)". Arreglo, mismo
--      patrón que `usuarios.empresas_grupo` (multi-selección existente
--      para usuarios) — no había ninguna columna equivalente en
--      `speakers`.
--
--   3. `speakers.estado` (text, default 'Confirmado') — "Confirmado" |
--      "Borrador". Implementa "Guardar como borrador"/"Confirmar
--      speaker" (mismo patrón que `usuarios.estado_usuario`, entrega 8 —
--      ver `db/agregar_campos_nuevo_usuario.sql`): un Borrador es un
--      registro incompleto guardado para retomar después, sin la
--      validación completa del formulario. El valor default 'Confirmado'
--      es a propósito: todos los speakers YA EXISTENTES en la tabla real
--      son registros completos, nunca borradores.
--
-- `speakers.estado_provincia` ya se había agregado en una entrega
-- anterior de esta misma ronda (ver `db/agregar_hcp_estado_documento_
-- especialidad_convenio.sql`) pero el formulario "Nuevo Speaker" todavía
-- no tenía un campo para capturarlo — esta entrega sí lo expone.
--
-- Antes de ejecutar, confirma que no colisiona con nada existente:
--   select column_name from information_schema.columns
--   where table_name = 'speakers'
--   and column_name in ('profesion', 'empresas_grupo_interaccion', 'estado');
-- =============================================================================

alter table public.speakers
  add column if not exists profesion text,
  add column if not exists empresas_grupo_interaccion text[] not null default '{}',
  add column if not exists estado text not null default 'Confirmado';
