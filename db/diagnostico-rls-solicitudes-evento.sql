-- =============================================================================
-- Diagnóstico: "No se pudo crear la solicitud de evento: No tienes permiso
-- para realizar esta acción" al dar clic en "Guardar como borrador" en
-- Nueva Solicitud de Evento.
--
-- Ese mensaje en español es la traducción amigable (ver
-- `mensajeErrorAmigable` en src/lib/supabaseClient.ts) de un error real de
-- Postgres: código 42501 ("permission denied") o una violación de Row Level
-- Security. Es decir, no es un bug del formulario ni de la validación —
-- Supabase está rechazando el INSERT que hace `crearEvento()` en
-- src/lib/evento.ts sobre la tabla `solicitudes_evento`.
--
-- Este entorno de trabajo NO tiene acceso al proyecto real de Supabase, así
-- que no puedo ver las políticas de RLS actuales ni el estado real de la
-- tabla. Escribir una política "a ciegas" es riesgoso: ya pasó antes en
-- este proyecto (ver el historial en db/rls-usuarios.propuesta.sql) que un
-- ajuste de RLS mal calibrado provocó "infinite recursion detected in
-- policy" y bloqueó el login de TODOS los usuarios.
--
-- Por eso, antes de proponer una corrección, necesito que corras este
-- diagnóstico en el Editor SQL del Dashboard de Supabase (con tu usuario
-- de administrador de base de datos) y me compartas el resultado completo
-- de las 4 consultas. Con eso puedo escribir la política exacta que hace
-- falta (o corregir la que ya existe), sin arriesgar dejar a alguien más
-- sin acceso.
-- =============================================================================

-- 1) ¿La tabla tiene RLS activado, y "forzado" incluso para el dueño de la tabla?
select relname as tabla, relrowsecurity as rls_activado, relforcerowsecurity as rls_forzado
from pg_class
where relname = 'solicitudes_evento';

-- 2) Todas las políticas actuales sobre la tabla (el detalle importa: rol,
--    comando, USING vs WITH CHECK).
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where tablename = 'solicitudes_evento';

-- 3) Estructura de las columnas clave que suelen usarse en las políticas de
--    este tipo de tabla (estado, creado_por_id) — para confirmar nombres y
--    tipos exactos.
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'solicitudes_evento'
  and column_name in ('estado', 'creado_por_id', 'creado_en')
order by column_name;

-- 4) Grants a nivel de tabla para el rol "authenticated" (además de RLS,
--    Postgres exige el GRANT correspondiente; si falta el GRANT de INSERT,
--    también se ve como "permission denied").
select grantee, privilege_type
from information_schema.role_table_grants
where table_name = 'solicitudes_evento'
order by grantee, privilege_type;

-- 5) Tu propio usuario: rol base, si eres administrador, y si tienes
--    "nueva-evento" concedido explícitamente por paginas_permitidas —
--    para confirmar cuál de los dos mecanismos de acceso del frontend
--    (rol vs. override) no está contemplado en la política de INSERT.
select id, email, rol, es_administrador, paginas_permitidas, empresas_grupo, paises_operacion
from usuarios
where email = 'sebastiangonzalezmd@gmail.com';
