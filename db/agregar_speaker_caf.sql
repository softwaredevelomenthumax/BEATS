-- =============================================================================
-- Ronda de ajustes de formularios — entrega 3 (septiembre 2026): vínculo de
-- CAF a un speaker del repositorio.
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Debe ejecutarse a mano en el
-- SQL Editor del proyecto real de Supabase.
--
-- `convenios_pago_hcp`, `fmv_checklists` y `convenios_hcp` ya tenían una
-- columna `speaker_id` desde antes de esta ronda; `cafs` era la única de
-- los 4 documentos con cadena que no la tenía. Se agrega aquí, en su propia
-- migración chica y separada, porque el formulario de CAF todavía no
-- expone ningún selector que la llene (eso queda para su propia entrega
-- dentro de esta ronda) — por ahora solo prepara la columna para cuando
-- ese selector exista. Mientras tanto, las reglas de dependencia
-- (`lib/reglasDependenciaDocumentos.ts`) y el seguimiento de tareas por
-- speaker (`lib/documentosRequeridosEvento.ts`) se degradan correctamente
-- a nivel de EVENTO completo cuando encuentran esta columna vacía.
--
-- Antes de ejecutar, confirma que no colisiona con nada existente:
--   select column_name from information_schema.columns
--   where table_name = 'cafs' and column_name = 'speaker_id';
-- =============================================================================

alter table public.cafs
  add column if not exists speaker_id uuid references public.speakers(id);
