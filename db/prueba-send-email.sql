-- =============================================================================
-- Prueba manual de `send-email` DIRECTAMENTE por SQL, sin pasar por el
-- aplicativo (ni por la pantalla de "Nuevo colaborador", ni por
-- admin-usuarios). Sirve para aislar el problema: si esto funciona, el SMTP
-- y el webhook_secret están bien configurados y cualquier falla que veas
-- después en la app viene de otro lado — si esto YA falla, el problema
-- está en send-email o en su configuración SMTP, sin ninguna otra pieza de
-- por medio.
--
-- Usa `pg_net`, la extensión de Supabase que deja hacer peticiones HTTP
-- asíncronas directamente desde Postgres. Ya suele venir habilitada en
-- proyectos de Supabase; si no, el primer paso la habilita.
--
-- CONTRATO REAL de send-email (confirmado con su código fuente):
--   header  x-webhook-secret: <el mismo valor que INTERNAL_WEBHOOK_SECRET
--           y que configuracion_integraciones.webhook_secret>
--   cuerpo  { to, subject, html }  — NO { para, asunto, contrasenaTemporal }
--           (send-email no arma el mensaje, espera el HTML ya completo)
--
-- Corre esto en el Editor SQL del Dashboard de Supabase.
-- =============================================================================

-- 1. Habilita la extensión si todavía no está activa (no hace nada si ya
--    lo está — es seguro correrlo siempre).
create extension if not exists pg_net;

-- 2. Dispara la llamada HTTP a send-email usando la URL y el secreto que
--    ya están guardados en configuracion_integraciones — así la prueba usa
--    exactamente lo mismo que usaría admin-usuarios en un caso real.
--
--    Cambia el correo de "to" por uno tuyo antes de correrlo.
select net.http_post(
  url := (select edge_function_url from configuracion_integraciones where id = 1),
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-webhook-secret', (select webhook_secret from configuracion_integraciones where id = 1)
  ),
  body := jsonb_build_object(
    'to', 'tu.correo.de.prueba@dominio.com',
    'subject', 'Prueba manual de send-email (sin pasar por la app)',
    'html', '<p>Esto es una prueba manual — si te llegó, <b>send-email</b> funciona correctamente.</p>'
  )
) as id_de_la_peticion;
-- Esto devuelve un número (ej. 42) — el id de la petición. Anótalo, lo
-- necesitas en el paso 3.

-- 3. Revisa la respuesta real de send-email. La llamada de pg_net es
--    ASÍNCRONA: la respuesta puede tardar uno o dos segundos en aparecer
--    acá — si la primera vez sale vacío, espera un momento y vuelve a
--    correr este SELECT (reemplaza 42 por el id que te dio el paso 2).
select id, status_code, content, headers, error_msg, created
from net._http_response
where id = 42
order by id desc;

-- Cómo leer el resultado:
--   status_code = 200 y content = {"status":"enviado"}
--     → el correo se envió correctamente. Revisa la bandeja (y spam) del
--       correo que pusiste en "to".
--   status_code = 401 y content = {"error":"unauthorized"}
--     → el webhook_secret guardado en configuracion_integraciones no
--       coincide con INTERNAL_WEBHOOK_SECRET (el secreto de la función).
--       Vuelve a igualarlos: actualiza configuracion_integraciones.webhook_secret
--       (SQL) y el secreto INTERNAL_WEBHOOK_SECRET (Dashboard → Edge
--       Functions → Secrets) al mismo valor nuevo.
--   status_code = 500 con "faltan variables de entorno SMTP_..."
--     → alguno de los secretos SMTP_HOSTNAME/SMTP_PORT/SMTP_USERNAME/
--       SMTP_PASSWORD/SMTP_FROM ya no existe o se borró.
--   status_code = 502
--     → send-email sí se autenticó y armó el correo, pero SMTP falló al
--       enviarlo (ej. la contraseña de aplicación de Google se revocó) —
--       el "content" de la respuesta trae el error real de nodemailer.
--   error_msg con algo de "timeout"/"connection" y status_code vacío
--     → no se pudo ni conectar al servidor SMTP.
--   Nada de fila nueva después de esperar varios segundos
--     → revisa que `edge_function_url` apunte de verdad a
--       ".../functions/v1/send-email" y que la función esté "Active".
