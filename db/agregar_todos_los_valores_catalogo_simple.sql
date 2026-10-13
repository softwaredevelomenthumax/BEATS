-- =============================================================================
-- Fix (septiembre 2026): sincronizar el enum `catalogo_simple` en Postgres
-- con TODOS los valores que ya reconoce la aplicación (`CATALOGO_SIMPLE` en
-- src/lib/enums.ts).
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Debe ejecutarse a mano en el
-- SQL Editor del proyecto real de Supabase.
--
-- Contexto: el usuario reportó primero "invalid input value for enum
-- catalogo_simple: 'profesiones'" (al agregar una Profesión nueva) y luego
-- el mismo error con "tiposParticipacionAcademica" (al agregar un Tipo de
-- participación académica nuevo). Ambos catálogos llevaban tiempo
-- disponibles en el editor de "Catálogos de opciones" del lado de la
-- aplicación, pero nunca se agregaron al enum real en la base de datos —
-- cada catálogo nuevo que se agregó a `CATALOGO_SIMPLE` (TypeScript)
-- necesitaba su propio `ALTER TYPE ... ADD VALUE`, y ese paso se fue
-- quedando pendiente en varias entregas.
--
-- Para no seguir corrigiendo este mismo error catálogo por catálogo cada
-- vez que se reporte, este archivo agrega TODOS los valores que la
-- aplicación ya usa hoy, incluidos los que ya funcionaban (con
-- `IF NOT EXISTS`, así que repetir un valor ya existente no falla ni
-- cambia nada). Ejecutarlo una sola vez deja el enum al día con el código
-- actual.
--
-- Si en el futuro se agrega un catálogo nuevo a `CATALOGO_SIMPLE`, hay que
-- recordar este mismo paso (una migración nueva con su
-- `ALTER TYPE ... ADD VALUE IF NOT EXISTS`) — quedó documentado aquí como
-- referencia del patrón a seguir.
-- =============================================================================

alter type catalogo_simple add value if not exists 'empresasGrupo';
alter type catalogo_simple add value if not exists 'tiposEvento';
alter type catalogo_simple add value if not exists 'areasEspecialidadEvento';
alter type catalogo_simple add value if not exists 'categoriasHotel';
alter type catalogo_simple add value if not exists 'monedas';
alter type catalogo_simple add value if not exists 'centrosCostos';
alter type catalogo_simple add value if not exists 'tiposTransporte';
alter type catalogo_simple add value if not exists 'departamentosConvenio';
alter type catalogo_simple add value if not exists 'especialidadesMedicas';
alter type catalogo_simple add value if not exists 'lineasTerapeuticas';
alter type catalogo_simple add value if not exists 'tiposActividadConvenio';
alter type catalogo_simple add value if not exists 'organizadoPorConvenio';
alter type catalogo_simple add value if not exists 'tiposDocumento';
alter type catalogo_simple add value if not exists 'estados';
alter type catalogo_simple add value if not exists 'tiposParticipacionAcademica';
alter type catalogo_simple add value if not exists 'tiposServicioConvenio';
alter type catalogo_simple add value if not exists 'regiones';
alter type catalogo_simple add value if not exists 'profesiones';

-- Verificación opcional después de ejecutar (deben aparecer los 18 valores
-- de arriba, en orden alfabético):
--   select unnest(enum_range(null::catalogo_simple))::text as valor
--   order by valor;
-- =============================================================================
-- NOTA: este archivo reemplaza/incluye por completo a
-- `agregar_regiones_profesiones_catalogo_simple.sql` (entregado antes en
-- esta misma conversación) — basta con ejecutar este archivo; no hace falta
-- correr ambos, aunque hacerlo tampoco causaría error (los `ADD VALUE IF
-- NOT EXISTS` son idempotentes).
-- =============================================================================
