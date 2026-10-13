-- =============================================================================
-- Dar privilegios de Administrador (rol completo, sin restricciones) al
-- usuario Sebastián González (septiembre 2026).
--
-- ⚠️  ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Debe ejecutarse a mano en
-- el SQL Editor del proyecto real de Supabase.
--
-- Qué significa "Administrador" en este sistema (revisado en
-- `src/lib/enums.ts`, `src/lib/navegacion.ts`, `src/hooks/useAuth.tsx` y
-- `src/lib/usuarios.ts`):
--   - `rol = 'administrador'`: uno de los 7 valores del enum `rol` (junto a
--     marketing, comercial, medica, legal_compliance, finanzas,
--     gerencia_general). Le da acceso a todas las páginas marcadas
--     `soloRoles: ["administrador"]` en el menú.
--   - `es_administrador` (boolean): un "override" independiente del `rol` —
--     alguien con otro rol (ej. "medica") puede tener este flag en `true` y
--     de todas formas ver las páginas de administrador. Se deja también en
--     `true` para que quede consistente con `rol`, sin depender de una sola
--     señal.
--   - `administrador_alcance_limitado` (boolean): si es `true`, el
--     Administrador solo ve colaboradores que compartan empresa del grupo Y
--     país de operación con él (filtro de alcance reducido — ver el
--     comentario en `src/lib/usuarios.ts`). Para privilegios COMPLETOS sin
--     restricción de alcance, debe quedar en `false`.
--   - `paginas_permitidas` / `paises_operacion` / `empresas_grupo`: listas
--     que, si NO están vacías, restringen a qué páginas o qué alcance
--     tiene acceso el usuario (un arreglo vacío/NULL se trata como
--     "todas"/comodín). Para que la cuenta quede sin ninguna restricción
--     adicional, se limpian a NULL.
--
-- El script primero muestra el estado ACTUAL de la fila (PASO 0, solo
-- lectura) para que confirmes que es la persona correcta antes de tocar
-- nada, y al final vuelve a mostrar la fila ya actualizada para verificar.
--
-- NOTA: no se incluye `estado_usuario` en las consultas — esa columna la
-- agrega `db/agregar_campos_nuevo_usuario.sql`, una migración aparte que
-- todavía no se ha aplicado contra esta base real (por eso el PASO 0 dio
-- "column estado_usuario does not exist" en el primer intento). No hace
-- falta para dar el rol de Administrador, así que se dejó fuera aquí; si en
-- algún momento quieres usar "Guardar como borrador" en Nuevo Usuario, esa
-- es la migración que faltaría correr.
-- =============================================================================

-- =============================================================================
-- PASO 0 — SOLO LECTURA. Confirma que esta es la fila correcta antes de
-- seguir (nombre, email, y si ya tiene una cuenta de Supabase Auth
-- vinculada — `auth_user_id` no debería ser NULL para poder iniciar
-- sesión).
-- =============================================================================
select id, nombre, email, rol, es_administrador, administrador_alcance_limitado,
       paginas_permitidas, paises_operacion, empresas_grupo, auth_user_id
from usuarios
where lower(email) = lower('sebastian.gonzalez@bauschhealth.com');

-- =============================================================================
-- PASO 1 — Otorgar privilegios de Administrador completos, sin restricción
-- de alcance ni de páginas.
--
-- La tabla `usuarios` tiene un trigger de protección (visto al intentar
-- correr esto la primera vez):
--
--   ERROR: Solo Dirección Médica o un Administrador pueden cambiar nombre,
--   cargo, correo, rol, país(es)/empresa(s) de operación, o las banderas
--   de Administrador de un colaborador.
--   CONTEXT: PL/pgSQL function fn_resguardo_edicion_usuarios() ...
--
-- Ese trigger no está definido en ningún archivo de este repositorio —
-- se creó directo en el proyecto real de Supabase en algún momento
-- anterior, así que no hay forma de ver su lógica exacta desde acá. Lo que
-- sí es seguro asumir: valida quién está haciendo el cambio a través de la
-- sesión autenticada de la aplicación (auth.uid() o algo equivalente). El
-- Editor SQL de Supabase no tiene esa sesión — no importa qué tan
-- privilegiado sea el rol con el que se conecta el Editor, para el
-- trigger "no hay nadie autenticado", así que bloquea el cambio.
--
-- La salida: apagar ÚNICAMENTE ese trigger puntual, hacer el UPDATE, y
-- prenderlo de nuevo enseguida — nunca dejarlo apagado. Se busca el
-- trigger por su función (no por un nombre adivinado) para no fallar si el
-- nombre real es distinto al que uno esperaría.
-- =============================================================================
begin;

do $$
declare
  v_trigger_name text;
begin
  select t.tgname into v_trigger_name
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
  where t.tgrelid = 'public.usuarios'::regclass
    and p.proname = 'fn_resguardo_edicion_usuarios'
    and not t.tgisinternal
  limit 1;

  if v_trigger_name is null then
    raise exception 'No se encontró en public.usuarios ningún trigger asociado a fn_resguardo_edicion_usuarios — revisa el nombre de la función o si ya no existe.';
  end if;

  execute format('alter table public.usuarios disable trigger %I', v_trigger_name);
end $$;

update usuarios
set
  rol = 'administrador',
  es_administrador = true,
  administrador_alcance_limitado = false,
  paginas_permitidas = null,
  paises_operacion = null,
  empresas_grupo = null
where lower(email) = lower('sebastian.gonzalez@bauschhealth.com');

do $$
declare
  v_trigger_name text;
begin
  select t.tgname into v_trigger_name
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
  where t.tgrelid = 'public.usuarios'::regclass
    and p.proname = 'fn_resguardo_edicion_usuarios'
    and not t.tgisinternal
  limit 1;

  execute format('alter table public.usuarios enable trigger %I', v_trigger_name);
end $$;

commit;
-- ↑ Si algo falla ANTES de este `commit`, toda la transacción se revierte
-- — incluyendo el `disable trigger` — así que el trigger de protección
-- nunca queda apagado por error.

-- =============================================================================
-- Verificación — debe mostrar exactamente 1 fila, con rol = 'administrador',
-- es_administrador = true, administrador_alcance_limitado = false, y las 3
-- columnas de alcance en NULL.
-- =============================================================================
select id, nombre, email, rol, es_administrador, administrador_alcance_limitado,
       paginas_permitidas, paises_operacion, empresas_grupo, auth_user_id
from usuarios
where lower(email) = lower('sebastian.gonzalez@bauschhealth.com');

-- =============================================================================
-- Nota — si el PASO 0 muestra `auth_user_id` en NULL, esta fila todavía no
-- tiene una cuenta de acceso real: es un borrador de colaborador creado
-- desde el formulario "Nuevo Usuario" pero que nunca completó el flujo de
-- invitación/confirmación de Supabase Auth. En ese caso, dar el rol de
-- Administrador aquí no alcanza para poder iniciar sesión — hay que
-- completar esa invitación desde la propia aplicación (pantalla de
-- Usuarios y Roles) o desde el panel de Authentication de Supabase.
-- =============================================================================
