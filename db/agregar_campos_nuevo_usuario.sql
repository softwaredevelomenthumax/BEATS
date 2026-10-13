-- =============================================================================
-- Ronda de ajustes de formularios — entrega 8 (septiembre 2026): Nuevo
-- Usuario (antes "Nuevo colaborador").
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Debe ejecutarse a mano en el
-- SQL Editor del proyecto real de Supabase.
--
-- Qué agrega y por qué:
--
--   1. `usuarios.numero_documento` — documento de identidad, pedido
--      explícito, sin columna equivalente.
--
--   2. `usuarios.pais`, `usuarios.estado_provincia`, `usuarios.ciudad` —
--      dirección/ubicación PROPIA del usuario. Distinta a
--      `paises_operacion` (ya existente, arreglo — el ALCANCE de países
--      donde puede operar/ver documentos), que no se toca.
--
--   3. `usuarios.observaciones` — texto libre, pedido explícito.
--
--   4. `usuarios.estado_usuario` (text, default 'Confirmado') —
--      "Confirmado" | "Borrador". Implementa "Guardar como borrador"/
--      "Confirmar Usuario": un Borrador es una fila sin cuenta real de
--      Supabase Auth (`auth_user_id` null, sin contraseña temporal
--      enviada); "Confirmar Usuario" es la acción que de verdad crea la
--      cuenta. El valor default 'Confirmado' es a propósito: todas las
--      filas YA EXISTENTES en la tabla real son usuarios reales y activos,
--      nunca borradores.
--
-- NOTA DE SEGURIDAD, heredada del mismo hallazgo F39 ya documentado para
-- esta tabla (ver docs/rls-usuarios.propuesta.sql): "Guardar como
-- borrador" en esta entrega hace un `.insert()` DIRECTO a `usuarios`
-- desde el cliente (a diferencia de "Confirmar Usuario", que sigue
-- pasando por la función Edge `admin-usuarios` porque esa sí crea la
-- cuenta real de Auth) — funciona hoy porque esta tabla todavía no tiene
-- RLS real, el mismo gap ya conocido. Cuando se aplique
-- `docs/rls-usuarios.propuesta.sql`, esa política debe permitir también
-- el INSERT de un borrador (`estado_usuario = 'Borrador'`) a los roles que
-- ya pueden crear usuarios (Dirección Médica/Administrador), o el botón
-- "Guardar como borrador" dejará de funcionar.
--
-- Antes de ejecutar, confirma que no colisiona con nada existente:
--   select column_name from information_schema.columns
--   where table_name = 'usuarios'
--   and column_name in ('numero_documento', 'pais', 'estado_provincia', 'ciudad', 'observaciones', 'estado_usuario');
-- =============================================================================

alter table public.usuarios
  add column if not exists numero_documento text,
  add column if not exists pais text,
  add column if not exists estado_provincia text,
  add column if not exists ciudad text,
  add column if not exists observaciones text,
  add column if not exists estado_usuario text not null default 'Confirmado';

-- =============================================================================
-- IMPORTANTE después de correr el ALTER TABLE de arriba:
--
-- El mensaje "Could not find the 'ciudad' column of 'usuarios' in the
-- schema cache" es el error propio de PostgREST (la capa que expone la
-- base como API a la app) cuando su caché de columnas quedó desactualizada
-- frente al esquema real. PostgREST normalmente detecta un cambio de
-- esquema solo — pero si el formulario "Nuevo Usuario" sigue fallando con
-- ese mismo mensaje justo después de correr el ALTER TABLE, fuerza el
-- refresco corriendo esto también:
--
--   NOTIFY pgrst, 'reload schema';
--
-- (Si no tienes permiso para ejecutar NOTIFY sobre ese canal, con esperar
-- uno o dos minutos y volver a intentar en la app suele bastar — Supabase
-- refresca ese caché automáticamente cada cierto tiempo.)
-- =============================================================================
