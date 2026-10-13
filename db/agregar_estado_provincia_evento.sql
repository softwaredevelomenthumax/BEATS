-- =============================================================================
-- Ronda de ajustes de formularios — Solicitud de Evento, entrega 1
-- (septiembre 2026): Estado/Provincia/Departamento + país/ciudad por sesión.
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Debe ejecutarse a mano en el
-- SQL Editor del proyecto real de Supabase ANTES de publicar esta versión de
-- la app: sin este cambio, los campos nuevos no se pueden guardar contra la
-- base real (aunque sí funcionan hoy contra los fixtures locales de
-- scripts/verificar_evento.mjs, que no validan columnas reales).
--
-- Qué agrega y por qué:
--
--   1. `solicitudes_evento.estado_provincia` (text, nullable) — Estado/
--      Provincia/Departamento del evento cuando es de "Única sesión". Se
--      llama `estado_provincia`, NO `estado`, porque esa columna ya existe
--      y es el estado del DOCUMENTO (Borrador/Pendiente/Aprobado/...) — un
--      nombre distinto evita cualquier ambigüedad o colisión.
--
--   2. `sesiones_evento.pais`, `sesiones_evento.estado_provincia`,
--      `sesiones_evento.ciudad` (text, nullable cada una) — hasta ahora cada
--      sesión de un evento de "Varias sesiones" solo tenía `lugar` (texto
--      libre); el ajuste pide país/estado/ciudad propios por sesión, igual
--      que ya existen a nivel de documento para "Única sesión".
--
-- Catálogo nuevo (no requiere migración, ya es de escritura libre desde la
-- UI vía `catalogo_valores`/`EditorCatalogosSimples`): agrega las opciones
-- que necesites al catálogo `estados` desde Configuración de Campos →
-- Catálogos simples, exactamente igual que ya haces con "Tipos de evento" o
-- "Categorías de hotel". No hace falta ningún ALTER aquí para eso.
--
-- Antes de ejecutar, confirma los nombres reales de tabla con:
--   select column_name from information_schema.columns
--   where table_name = 'solicitudes_evento' and column_name in ('estado', 'pais', 'ciudad');
--   select column_name from information_schema.columns
--   where table_name = 'sesiones_evento';
-- =============================================================================

alter table public.solicitudes_evento
  add column if not exists estado_provincia text;

alter table public.sesiones_evento
  add column if not exists pais text,
  add column if not exists estado_provincia text,
  add column if not exists ciudad text;
