-- =============================================================================
-- Ronda de ajustes de formularios — Solicitud de Evento, entrega "Ajustes"
-- (septiembre 2026): "¿Habrá patrocinio / pago de viáticos a un HCP?"
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Debe ejecutarse a mano en el
-- SQL Editor del proyecto real de Supabase ANTES de publicar esta versión de
-- la app: sin este cambio, los campos nuevos no se pueden guardar contra la
-- base real (aunque sí funcionan hoy contra los fixtures locales de
-- scripts/verificar_evento.mjs, que no validan columnas reales).
--
-- Qué agrega y por qué:
--
--   1. `solicitudes_evento.patrocinio_hcp` (boolean, default false) — nuevo
--      campo "¿Habrá patrocinio / pago de viáticos a un HCP?" (Sí/No). Si es
--      Sí, activa "Nombre completo del HCP relacionado" (columna ya
--      existente `datos_hcp`, que solo se renombró en pantalla) + los 8
--      campos nuevos de abajo + "Justificación de patrocinio / pago de
--      viáticos" (columna ya existente `justificacion_viaticos`, también
--      solo renombrada en pantalla).
--
--   2. `solicitudes_evento.hcp_numero_documento`, `hcp_profesion`,
--      `hcp_especialidad`, `hcp_direccion`, `hcp_pais`,
--      `hcp_estado_provincia`, `hcp_ciudad`, `hcp_telefono`, `hcp_email`
--      (text, nullable cada una) — datos del HCP relacionado. Mismo prefijo
--      `hcp_` ya usado para columnas equivalentes en `convenios_pago_hcp`
--      (ver `db/agregar_hcp_estado_documento_especialidad_convenio.sql`).
--
-- Catálogos nuevos usados por "Profesión"/"Especialidad" (no requieren
-- migración, ya son de escritura libre desde la UI vía
-- `catalogo_valores`/`EditorCatalogosSimples`): reusan los catálogos ya
-- existentes "profesiones" y "especialidadesMedicas" (el mismo que usa
-- "Nuevo Speaker"/"Nuevo FMV" — etiquetado "Especialidades médicas (FMV)"
-- en el editor). No hace falta ningún ALTER aquí para eso.
--
-- Antes de ejecutar, confirma que no colisiona con nada existente:
--   select column_name from information_schema.columns
--   where table_name = 'solicitudes_evento'
--   and column_name in ('patrocinio_hcp', 'hcp_numero_documento', 'hcp_profesion',
--     'hcp_especialidad', 'hcp_direccion', 'hcp_pais', 'hcp_estado_provincia',
--     'hcp_ciudad', 'hcp_telefono', 'hcp_email');
-- =============================================================================

alter table public.solicitudes_evento
  add column if not exists patrocinio_hcp boolean not null default false,
  add column if not exists hcp_numero_documento text,
  add column if not exists hcp_profesion text,
  add column if not exists hcp_especialidad text,
  add column if not exists hcp_direccion text,
  add column if not exists hcp_pais text,
  add column if not exists hcp_estado_provincia text,
  add column if not exists hcp_ciudad text,
  add column if not exists hcp_telefono text,
  add column if not exists hcp_email text;
