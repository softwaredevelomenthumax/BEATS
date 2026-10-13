-- =============================================================================
-- Diagnóstico: ¿ya existen triggers de Postgres que envían correo real por
-- documentos (aprobaciones, notificaciones, etc.), de antes del incidente?
--
-- send-email menciona en sus propios comentarios un archivo
-- "db/triggers_email_resend.sql" y una función `fn_cc_admin()` — indicio de
-- que el envío de correo por documentos ya se hacía con triggers de
-- Postgres llamando a send-email vía pg_net, no desde el código de la
-- aplicación. Como la base de datos NUNCA se perdió (solo el código del
-- frontend que vivía en el contenedor), es muy posible que esos triggers
-- sigan ahí, activos, funcionando — y que la Fase 2 completa (no solo la
-- parte de notificaciones dentro de la app) ya esté resuelta.
--
-- Corre esto en el Editor SQL del Dashboard de Supabase y pégame el
-- resultado completo de las 3 consultas.
-- =============================================================================

-- 1. ¿Existe fn_cc_admin() (la función que arma el "cc" al administrador,
--    según el propio comentario de send-email)?
select proname, pg_get_functiondef(oid) as definicion
from pg_proc
where proname = 'fn_cc_admin';

-- 2. Búsqueda amplia: cualquier función en la base de datos que mencione
--    "send-email" o "http_post" en su código — sea cual sea su nombre.
--    Esta es la consulta más importante: si "triggers_email_resend.sql" ya
--    se aplicó, aparecerá aquí seguro.
select proname, pg_get_functiondef(oid) as definicion
from pg_proc
where prosrc ilike '%send-email%' or prosrc ilike '%http_post%';

-- 3. Todos los triggers del esquema público, para ver a qué tablas están
--    enganchados y en qué función se apoya cada uno (aunque su nombre no
--    diga "email").
select event_object_table as tabla, trigger_name, action_timing, event_manipulation, action_statement
from information_schema.triggers
where event_object_schema = 'public'
order by event_object_table, trigger_name;
