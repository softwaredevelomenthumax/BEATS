-- =============================================================================
-- Entrega 21 (octubre 2026) — ERROR AL AGREGAR UN VALOR EN "Catálogos de opciones":
--   invalid input value for enum catalogo_simple: "tiposContrato"
--
-- CAUSA: el valor `tiposContrato` existe en la aplicación (lista "Tipo de contrato"
-- del CAF) pero NO en el enum `catalogo_simple` de la base de datos: la migración
-- `entrega_20_migraciones.sql` todavía no se ha ejecutado (o se ejecutó incompleta).
-- La aplicación no puede crear valores de un enum; solo el SQL Editor puede.
--
-- QUÉ HACER: pega y ejecuta ESTE archivo completo, UNA sola vez, en el SQL Editor de
-- Supabase. Es idempotente (repetirlo no hace daño) y deja el enum al día con TODOS
-- los catálogos que hoy reconoce la app, así que sirve también para cualquier otro
-- catálogo que dé el mismo error. Después, opcionalmente y en una ejecución APARTE
-- (Postgres no deja usar un valor de enum recién agregado en la misma transacción),
-- ejecuta `sembrar_tipos_contrato.sql` para cargar valores iniciales de "Tipos de contrato".
-- =============================================================================

alter type public.catalogo_simple add value if not exists 'empresasGrupo';
alter type public.catalogo_simple add value if not exists 'tiposEvento';
alter type public.catalogo_simple add value if not exists 'areasEspecialidadEvento';
alter type public.catalogo_simple add value if not exists 'categoriasHotel';
alter type public.catalogo_simple add value if not exists 'monedas';
alter type public.catalogo_simple add value if not exists 'centrosCostos';
alter type public.catalogo_simple add value if not exists 'tiposTransporte';
alter type public.catalogo_simple add value if not exists 'departamentosConvenio';
alter type public.catalogo_simple add value if not exists 'especialidadesMedicas';
alter type public.catalogo_simple add value if not exists 'lineasTerapeuticas';
alter type public.catalogo_simple add value if not exists 'tiposActividadConvenio';
alter type public.catalogo_simple add value if not exists 'organizadoPorConvenio';
alter type public.catalogo_simple add value if not exists 'tiposDocumento';
alter type public.catalogo_simple add value if not exists 'estados';
alter type public.catalogo_simple add value if not exists 'tiposParticipacionAcademica';
alter type public.catalogo_simple add value if not exists 'tiposServicioConvenio';
alter type public.catalogo_simple add value if not exists 'regiones';
alter type public.catalogo_simple add value if not exists 'profesiones';
alter type public.catalogo_simple add value if not exists 'tiposContrato';

-- Recarga la caché de esquema de la API (PostgREST).
notify pgrst, 'reload schema';

-- Verificación (debe devolver una fila por cada catálogo, con presente = true):
--   select v as catalogo, v = any (enum_range(null::catalogo_simple)::text[]) as presente
--     from unnest(array['empresasGrupo','tiposEvento','areasEspecialidadEvento','categoriasHotel','monedas','centrosCostos','tiposTransporte','departamentosConvenio','especialidadesMedicas','lineasTerapeuticas','tiposActividadConvenio','organizadoPorConvenio','tiposDocumento','estados','tiposParticipacionAcademica','tiposServicioConvenio','regiones','profesiones','tiposContrato']) as v;
