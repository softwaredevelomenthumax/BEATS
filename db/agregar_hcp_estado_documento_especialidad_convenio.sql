-- =============================================================================
-- Ronda de ajustes de formularios — entrega 5 (septiembre 2026): Convenio
-- de Pago a HCP.
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Debe ejecutarse a mano en el
-- SQL Editor del proyecto real de Supabase.
--
-- Qué agrega y por qué:
--
--   1. `speakers.estado_provincia` — Estado/Provincia/Departamento del HCP.
--      El formulario "Nuevo Speaker" todavía no tiene un campo que la
--      llene (su propia entrega en esta ronda sigue pendiente); se agrega
--      aquí para que Convenio de Pago a HCP (y los demás documentos que
--      auto-cargan datos del HCP) tengan la columna lista desde ya.
--
--   2. `convenios_pago_hcp.hcp_numero_documento`,
--      `convenios_pago_hcp.hcp_especialidad` — autocargados desde el
--      Repositorio de Speakers al elegir el HCP (la especificación los
--      pide mostrar junto al resto de datos del HCP, aunque sin
--      asterisco de obligatorio).
--
--   3. `convenios_pago_hcp.hcp_estado_provincia` — Estado/Provincia/
--      Departamento del HCP en este convenio; manual por ahora (ver
--      punto 1 — se autocargará cuando "Nuevo Speaker" tenga el campo).
--
--   4. `convenios_pago_hcp.advertencia_funcionario_gobierno_confirmada`
--      (boolean, default false) — true una vez el usuario elige
--      "Continuar" en el diálogo de advertencia de funcionario de
--      gobierno (mismo patrón que
--      `solicitudes_evento.advertencia_presupuesto_no_aprobado` de la
--      entrega 4). Dispara la nota impresa antes del panel de firmas.
--
-- Antes de ejecutar, confirma que no colisiona con nada existente:
--   select column_name from information_schema.columns
--   where table_name = 'speakers' and column_name = 'estado_provincia';
--   select column_name from information_schema.columns
--   where table_name = 'convenios_pago_hcp'
--   and column_name in ('hcp_numero_documento', 'hcp_especialidad', 'hcp_estado_provincia', 'advertencia_funcionario_gobierno_confirmada');
-- =============================================================================

alter table public.speakers
  add column if not exists estado_provincia text;

alter table public.convenios_pago_hcp
  add column if not exists hcp_numero_documento text,
  add column if not exists hcp_especialidad text,
  add column if not exists hcp_estado_provincia text,
  add column if not exists advertencia_funcionario_gobierno_confirmada boolean not null default false;
