-- =============================================================================
-- Rediseño de la ventana "Convenio HCP" (septiembre 2026).
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Debe ejecutarse a mano en el
-- SQL Editor del proyecto real de Supabase.
--
-- Agrega `convenios_hcp.cierre_es` / `cierre_en` — el párrafo de cierre
-- bilingüe "EN TESTIMONIO DE LO CUAL... / IN WITNESS WHEREOF..." que pedía
-- la especificación justo antes del primer panel de firmas. No existía
-- ningún campo equivalente en el esquema (a diferencia de "Considerando/
-- Whereas" y "Servicios — Anexo A", que se repurpusaron sobre
-- `objetivo_consultoria`/`objetivo_consultoria_en` y
-- `servicios_exhibit_a`/`servicios_exhibit_a_en` respectivamente — ver
-- comentario en `src/types.ts` sobre `ConvenioHcp` y
-- `src/lib/textosFijosConvenioHCP.ts`). Se guarda como texto libre editable
-- (mismo criterio que el resto del cuerpo del contrato): se autocompleta con
-- el texto fijo la primera vez que el usuario abre esa sección del
-- formulario y sigue siendo editable después.
--
-- Antes de ejecutar, confirma que no colisiona con nada existente:
--   select column_name from information_schema.columns
--   where table_name = 'convenios_hcp' and column_name in ('cierre_es', 'cierre_en');
-- =============================================================================

alter table public.convenios_hcp
  add column if not exists cierre_es text not null default '';

alter table public.convenios_hcp
  add column if not exists cierre_en text not null default '';
