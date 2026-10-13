-- =============================================================================
-- Ronda de ajustes de formularios — entrega 4 (septiembre 2026): gate de
-- "presupuesto aprobado" con diálogo cancelar/continuar en Solicitud de
-- Evento.
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Debe ejecutarse a mano en el
-- SQL Editor del proyecto real de Supabase.
--
-- Agrega `solicitudes_evento.advertencia_presupuesto_no_aprobado`
-- (boolean, default false) — true cuando el solicitante respondió "No" a
-- "¿El evento está incluido en algún presupuesto aprobado?" y eligió
-- "Continuar" en vez de "Cancelar solicitud". Se imprime como nota antes
-- del panel de firmas (ver `NotaAdvertencia` en
-- `src/components/print/DocumentoImprimible.tsx`), como pide
-- explícitamente el usuario ("referencia para que los responsables de la
-- matriz de aprobación decidan aprobar o rechazar el evento").
--
-- Antes de ejecutar, confirma que no colisiona con nada existente:
--   select column_name from information_schema.columns
--   where table_name = 'solicitudes_evento' and column_name = 'advertencia_presupuesto_no_aprobado';
-- =============================================================================

alter table public.solicitudes_evento
  add column if not exists advertencia_presupuesto_no_aprobado boolean not null default false;
