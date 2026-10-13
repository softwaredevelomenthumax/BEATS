-- =============================================================================
-- Pedido explícito del usuario (septiembre 2026): "independiente de si el
-- evento es de una o varias sesiones y de si lleva o no participación
-- académica, si aplica transporte, hospedaje, alimentos, etc, entonces
-- deben habilitarse los campos respectivos... similar a lo que sí ocurre
-- cuando... tienes participación académica de por lo menos un speaker."
--
-- El detalle completo de transporte/hospedaje/alimentos (Acorde a la
-- política de viajes, Tipo de transporte, cotización adjunta, taxi, fechas
-- de estancia, nombre/categoría de hotel, motivo de localidad distinta,
-- comentarios, etc.) ya existía SOLO para el presupuesto por speaker
-- externo (`evento_speaker_presupuestos`, ver
-- `db/agregar_speakers_evento.sql`). Esta migración agrega el mismo
-- detalle a:
--   1) `sesiones_evento` — para que cada sesión de un evento de "Varias
--      sesiones" SIN speakers externos tenga el mismo detalle (antes solo
--      tenía transporte_no_aplica/tipo_transporte/monto_transporte,
--      hospedaje_no_aplica/numero_noches/costo_noche_persona/nombre_hotel/
--      categoria_hotel, alimentos_no_aplica/monto_alimentos_dia).
--   2) `solicitudes_evento` — dos columnas que faltaban incluso para
--      "Única sesión" sin speakers externos: el monto del transporte
--      ("Valor del transporte") y el valor estimado de taxi.
--
-- Ver `PresupuestoSesion` en `src/types.ts` (tipo ampliado) y el comentario
-- en `Evento` (las 2 columnas nuevas de `solicitudes_evento`).
--
-- Todo `add column if not exists` — segura de re-ejecutar.
-- =============================================================================

alter table sesiones_evento
  add column if not exists transporte_acorde_politica boolean not null default true,
  add column if not exists transporte_motivo_no_acorde text not null default '',
  add column if not exists cotizacion_adjunta boolean not null default false,
  add column if not exists taxi boolean not null default false,
  add column if not exists valor_estimado_taxi numeric,
  add column if not exists hospedaje_acorde_politica boolean not null default true,
  add column if not exists hospedaje_motivo_no_acorde text not null default '',
  add column if not exists fecha_inicio_estancia date,
  add column if not exists fecha_fin_estancia date,
  add column if not exists motivo_localidad_distinta text not null default '',
  add column if not exists alimentos_acorde_politica boolean not null default true,
  add column if not exists alimentos_motivo_no_acorde text not null default '',
  add column if not exists comentarios_alimentos text not null default '';

alter table solicitudes_evento
  add column if not exists monto_transporte numeric,
  add column if not exists valor_estimado_taxi numeric;

-- Pre-flight (ejecutar antes para confirmar el estado actual, opcional):
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_name in ('sesiones_evento', 'solicitudes_evento')
--   and column_name in (
--     'transporte_acorde_politica', 'transporte_motivo_no_acorde',
--     'cotizacion_adjunta', 'taxi', 'valor_estimado_taxi',
--     'hospedaje_acorde_politica', 'hospedaje_motivo_no_acorde',
--     'fecha_inicio_estancia', 'fecha_fin_estancia',
--     'motivo_localidad_distinta', 'alimentos_acorde_politica',
--     'alimentos_motivo_no_acorde', 'comentarios_alimentos', 'monto_transporte'
--   )
-- order by table_name, column_name;
