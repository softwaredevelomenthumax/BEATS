-- =============================================================================
-- Entrega 20 — valores iniciales del catálogo «Tipos de contrato» (lista "Tipo de
-- contrato" del CAF). OPCIONAL y APARTE de `entrega_20_migraciones.sql`:
-- ejecútalo DESPUÉS de aquel (en otra ejecución del SQL Editor), porque Postgres
-- no deja usar un valor de enum recién agregado dentro de la misma transacción.
--
-- Son valores de ejemplo: edítalos, quítalos o agrega los tuyos desde
-- Configuración de Campos → Catálogos de opciones → «Tipos de contrato (CAF)».
-- No duplica: solo inserta los que todavía no existen.
-- =============================================================================

insert into public.catalogo_valores (catalogo, valor, orden)
select 'tiposContrato'::catalogo_simple, v.valor, v.orden
from (values
  ('Contrato de prestación de servicios', 0),
  ('Contrato de consultoría', 1),
  ('Contrato de patrocinio', 2),
  ('Acuerdo de confidencialidad', 3),
  ('Contrato de arrendamiento', 4),
  ('Contrato de suministro', 5)
) as v(valor, orden)
where not exists (
  select 1 from public.catalogo_valores c
   where c.catalogo = 'tiposContrato'::catalogo_simple and c.valor = v.valor
);

-- Verificación opcional:
--   select valor, orden from public.catalogo_valores where catalogo = 'tiposContrato' order by orden;
