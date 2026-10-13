-- =============================================================================
-- Entrega 32 — Convenio HCP elaborado en el aplicativo corporativo de contratos
-- =============================================================================
-- Igual que el CAF (`cafs.elaborado_en_caf_corporativo`, entrega 16), al crear un
-- Convenio HCP se puede elegir si se elabora en BEATS (con su cadena de aprobación:
-- Visto Bueno Legal/Compliance -> Firma Gerencia General / Rep. Legal) o en el
-- aplicativo corporativo de contratos. En ese caso BEATS solo registra que el
-- convenio existe: no hay cadena de aprobación ni notificaciones a aprobadores,
-- el documento queda «Aprobado» y la copia firmada se carga en el Expediente del
-- evento (`archivo_firmado_hcp_id`).
--
-- Idempotente. Sin esta columna la app sigue funcionando para los convenios
-- normales; solo falla (con un mensaje claro) al registrar uno corporativo.
--
-- Supuesto a verificar contra la base real: la política RLS de `convenios_hcp`
-- permite insertar directamente con estado 'Aprobado' (como ya se asumió para
-- `cafs` en la entrega 16). Si no, ajustar la política para ese caso.
-- =============================================================================

alter table public.convenios_hcp
  add column if not exists elaborado_en_contratos_corporativo boolean not null default false;

comment on column public.convenios_hcp.elaborado_en_contratos_corporativo is
  'true = el convenio se elaboró en el aplicativo corporativo de contratos (sin cadena de aprobación en BEATS); la copia firmada se carga en el Expediente.';

-- Verificación:
--   select column_name, data_type, column_default
--   from information_schema.columns
--   where table_name = 'convenios_hcp' and column_name = 'elaborado_en_contratos_corporativo';
