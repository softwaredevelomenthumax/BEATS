-- Octubre 2026 — "Presupuesto condensado": casilla para incluir el "Valor
-- participación" y sumarlo al total. ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE:
-- ejecutarlo a mano en el SQL Editor de Supabase ANTES de usar esta versión
-- (la aplicación escribe estas dos columnas al guardar un evento).
alter table public.solicitudes_evento
  add column if not exists incluir_valor_participacion boolean not null default false,
  add column if not exists condensado_valor_participacion numeric;
notify pgrst, 'reload schema';
