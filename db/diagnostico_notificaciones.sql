-- =============================================================================
-- Diagnóstico de notificaciones (campana) y correos (octubre 2026).
-- Ejecutar en el SQL Editor de Supabase y revisar cada resultado.
-- Solo LEE; no modifica nada.
-- =============================================================================

-- 1. ¿Existe la columna enviar_email y qué columnas tiene la tabla?
select column_name, data_type, column_default from information_schema.columns
 where table_schema = 'public' and table_name = 'notificaciones' order by ordinal_position;

-- 2. ¿RLS activo y qué políticas hay? (si RLS está activo y NO hay política de
--    INSERT/SELECT, la campana queda vacía y las notificaciones no se crean)
select relname, relrowsecurity as rls_activo from pg_class where oid = 'public.notificaciones'::regclass;
select policyname, cmd, roles, qual, with_check from pg_policies where tablename = 'notificaciones';

-- 3. ¿Se están creando filas? (las 15 más recientes)
select id, para_usuario_id, tipo, left(mensaje, 60) as mensaje, leida, creada_en
  from public.notificaciones order by creada_en desc limit 15;

-- 4. Configuración de correo (sin mostrar el secreto)
select id, edge_function_url, app_url, (webhook_secret is not null) as tiene_secreto
  from public.configuracion_integraciones;

-- 5. Triggers sobre notificaciones y sobre las tablas de aprobación
select event_object_table as tabla, trigger_name, action_timing, event_manipulation
  from information_schema.triggers
 where event_object_schema = 'public'
   and (event_object_table = 'notificaciones' or event_object_table like '%aprobaciones' or event_object_table in ('solicitudes_evento','cafs','convenios_pago_hcp','convenios_hcp'))
 order by 1, 2;

-- 6. Resultado de las últimas llamadas HTTP a la función de correo (pg_net):
--    status_code 200 = enviado; 401/403 = secreto incorrecto; 404/5xx = función caída o mal URL.
select id, status_code, left(content::text, 200) as respuesta, error_msg, created
  from net._http_response order by created desc limit 15;

-- 7. Usuarios sin correo (no recibirían nada)
select id, nombre, rol, email from public.usuarios where coalesce(email, '') = '' ;
