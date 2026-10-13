-- =============================================================================
-- PROPUESTA — corrección de seguridad F39 (privilege escalation / visibilidad
-- entre administradores de empresa), Fase 0, septiembre 2026.
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Debe revisarse y ejecutarse a
-- mano en el SQL Editor del proyecto real de Supabase (xnjqlwkcbkctoinkroqs).
-- No se pudo inspeccionar las políticas RLS actuales de `usuarios` desde este
-- entorno (no hay acceso al proyecto real), así que antes de ejecutar esto:
--
--   1. Corre `select * from pg_policies where tablename = 'usuarios';` y
--      guarda el resultado — si ya existen políticas con estos mismos
--      nombres, hay que decidir si reemplazarlas (DROP POLICY primero) o
--      renombrar las de abajo.
--   2. Corre este archivo completo de una sola vez (o por bloques, en el
--      orden en que aparece) contra una copia de prueba del proyecto si es
--      posible, antes de aplicarlo al proyecto productivo.
--
-- Qué corrige exactamente (ver BEATS_Diagnostico_Implementacion.docx,
-- hallazgo F39): hoy la tabla `usuarios` se lee con `.select("*")` sin
-- ningún filtro server-side, y se actualiza con `.update()` directo desde
-- el cliente (`actualizarPerfilUsuario` en src/lib/usuarios.ts) — incluidos
-- los campos `es_administrador` y `administrador_alcance_limitado`. La
-- corrección aplicada en el código de la app (ver README/plan de
-- implementación) es solo defensa en el cliente: filtra lo que se MUESTRA
-- en pantalla y deshabilita los interruptores al editar el propio perfil,
-- pero cualquiera con las credenciales de un usuario autenticado podría
-- saltarse la interfaz y llamar la API de Supabase directamente. La única
-- forma de que esto quede realmente cerrado es con RLS + un trigger, que es
-- lo que hace este archivo.
--
-- CORRECCIÓN v2 (septiembre 2026) — la v1 de este archivo, ya ejecutada por
-- el usuario contra el proyecto real, dejaba las políticas de SELECT/UPDATE
-- de abajo con un `exists (select 1 from public.usuarios yo where ...)`: una
-- subconsulta sobre LA MISMA tabla `usuarios` dentro de su propia política.
-- Postgres evalúa esa subconsulta re-aplicando la política de SELECT de
-- `usuarios` sobre ella misma, indefinidamente, y aborta con "infinite
-- recursion detected in policy for relation \"usuarios\"" — error que
-- bloqueaba TODO acceso a `usuarios`, incluido el `select` que hace el login
-- para encontrar la fila del usuario que acaba de autenticarse (por eso
-- nadie podía ingresar, no solo los administradores). La v2 mueve el "quién
-- soy yo y cuál es mi alcance" a la función `security definer`
-- `usuario_sesion_actual()` (bloque 2 de abajo): al ser `security definer`,
-- esa función corre con los privilegios de quien la creó (el dueño de la
-- tabla, típicamente el rol `postgres` del SQL Editor de Supabase), y RLS
-- nunca se aplica al dueño de una tabla salvo que esta tenga `FORCE ROW
-- LEVEL SECURITY` (no es el caso aquí) — así que su consulta interna a
-- `usuarios` NO vuelve a disparar la política y no hay recursión. La lógica
-- de negocio (quién ve/edita a quién) es exactamente la misma; solo cambió
-- CÓMO se obtiene "quién soy yo". Si ya ejecutaste la v1, basta con volver a
-- correr este archivo completo — es idempotente (`drop policy if exists`,
-- `create or replace function`, `drop trigger if exists`).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Asegurar que RLS está activo en la tabla.
-- -----------------------------------------------------------------------------
alter table public.usuarios enable row level security;

-- -----------------------------------------------------------------------------
-- 2. Función `security definer` con "quién soy yo" — trae mi propia fila de
--    `usuarios` (por auth.uid()) SIN pasar por las políticas de RLS de
--    `usuarios` (ver explicación de la recursión en el encabezado del
--    archivo). Nunca se expone directamente al cliente vía PostgREST más
--    allá de lo que ya vería de su propia fila igualmente.
-- -----------------------------------------------------------------------------
create or replace function public.usuario_sesion_actual()
returns table (
  rol public.rol_usuario,
  es_administrador boolean,
  administrador_alcance_limitado boolean,
  empresas_grupo text[],
  paises_operacion text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select u.rol, u.es_administrador, u.administrador_alcance_limitado, u.empresas_grupo, u.paises_operacion
  from public.usuarios u
  where u.auth_user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.usuario_sesion_actual() from public;
grant execute on function public.usuario_sesion_actual() to authenticated;

-- -----------------------------------------------------------------------------
-- 3. SELECT — cada quien ve su propia fila; además, quien es Dirección
--    Médica, Administrador, o tiene acceso de Administrador, ve a los demás
--    colaboradores — salvo que tenga "alcance limitado", en cuyo caso solo
--    ve a quienes comparten AL MENOS una empresa del grupo Y al menos un
--    país de operación con él. Un arreglo vacío (`{}`) en cualquiera de los
--    dos lados de la comparación se trata como comodín ("todas"/"todos"),
--    igual que en el resto de la app.
-- -----------------------------------------------------------------------------
drop policy if exists usuarios_select_propio_o_administrador on public.usuarios;
create policy usuarios_select_propio_o_administrador
on public.usuarios
for select
to authenticated
using (
  auth_user_id = auth.uid()
  or exists (
    select 1
    from public.usuario_sesion_actual() yo
    where (yo.rol = 'medica' or yo.rol = 'administrador' or yo.es_administrador)
      and (
        yo.administrador_alcance_limitado is not true
        or (
          (yo.empresas_grupo = '{}' or usuarios.empresas_grupo = '{}' or yo.empresas_grupo && usuarios.empresas_grupo)
          and
          (yo.paises_operacion = '{}' or usuarios.paises_operacion = '{}' or yo.paises_operacion && usuarios.paises_operacion)
        )
      )
  )
);

-- -----------------------------------------------------------------------------
-- 4. UPDATE — mismas reglas de "a quién puede tocar" que el SELECT de
--    arriba, pero SOLO para quien tiene rol de administración (no basta con
--    ver la fila propia para poder editar la de otro). El WITH CHECK repite
--    la condición de alcance para que un administrador de alcance limitado
--    tampoco pueda "sacar" a un colaborador de su alcance reasignándole
--    empresas/países que ya no cruzan con los suyos y perdiéndolo de vista
--    a propósito, ni tampoco asignarle empresas/países FUERA de su propio
--    alcance.
-- -----------------------------------------------------------------------------
drop policy if exists usuarios_update_administrador on public.usuarios;
create policy usuarios_update_administrador
on public.usuarios
for update
to authenticated
using (
  exists (
    select 1
    from public.usuario_sesion_actual() yo
    where (yo.rol = 'medica' or yo.rol = 'administrador' or yo.es_administrador)
      and (
        yo.administrador_alcance_limitado is not true
        or (
          (yo.empresas_grupo = '{}' or usuarios.empresas_grupo = '{}' or yo.empresas_grupo && usuarios.empresas_grupo)
          and
          (yo.paises_operacion = '{}' or usuarios.paises_operacion = '{}' or yo.paises_operacion && usuarios.paises_operacion)
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.usuario_sesion_actual() yo
    where (yo.rol = 'medica' or yo.rol = 'administrador' or yo.es_administrador)
      and (
        yo.administrador_alcance_limitado is not true
        or (
          (yo.empresas_grupo = '{}' or usuarios.empresas_grupo = '{}' or yo.empresas_grupo && usuarios.empresas_grupo)
          and
          (yo.paises_operacion = '{}' or usuarios.paises_operacion = '{}' or yo.paises_operacion && usuarios.paises_operacion)
        )
      )
  )
);

-- -----------------------------------------------------------------------------
-- 5. Backstop de "no autoescalamiento" — un TRIGGER, no una política RLS,
--    porque RLS es por FILA, no por COLUMNA: la política de arriba no puede
--    decir "puedes actualizar esta fila, pero solo estas dos columnas". Un
--    Administrador (incluido uno SIN alcance limitado) pasa el `using`/
--    `with check` de la política de UPDATE incluso sobre su propia fila
--    (porque además de "administrador" también puede ser "propio"), así que
--    sin esto, un Administrador SÍ podría, llamando la API directo,
--    otorgarse a sí mismo más alcance quitándose el límite. El trigger
--    bloquea ESO específicamente, sin importar por dónde llegue el UPDATE
--    (RLS, función Edge con service_role, lo que sea) — excepto para el
--    service_role, que sí necesita poder tocar estas columnas al crear un
--    usuario nuevo (ver función Edge `admin-usuarios`).
-- -----------------------------------------------------------------------------
create or replace function public.bloquear_autoescalamiento_usuarios()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- El service_role (usado por la función Edge admin-usuarios) se identifica
  -- porque auth.uid() es NULL cuando no hay un JWT de usuario final — se le
  -- permite pasar sin restricción, ya que esa función ya hace sus propias
  -- validaciones de autorización del lado del servidor.
  if auth.uid() is null then
    return new;
  end if;

  if old.auth_user_id = auth.uid()
     and (
       new.es_administrador is distinct from old.es_administrador
       or new.administrador_alcance_limitado is distinct from old.administrador_alcance_limitado
     )
  then
    raise exception 'No puedes cambiar tu propio acceso de Administrador.';
  end if;

  return new;
end;
$$;

drop trigger if exists usuarios_bloquear_autoescalamiento on public.usuarios;
create trigger usuarios_bloquear_autoescalamiento
before update on public.usuarios
for each row
execute function public.bloquear_autoescalamiento_usuarios();

-- -----------------------------------------------------------------------------
-- 6. Revisar aparte (no incluido aquí, requiere decisión de negocio):
--
--    a) INSERT/DELETE en `usuarios` — hoy solo pasan por la función Edge
--       `admin-usuarios` (service_role), así que probablemente NO necesitan
--       una política para `authenticated` en absoluto (deberían fallar por
--       defecto, que es el comportamiento correcto). Confirmar que no exista
--       ya una política permisiva de INSERT/DELETE para `authenticated` que
--       deje esa puerta abierta.
--    b) La página "Configuración de Usuarios/Roles" en el front-end filtra
--       la navegación con `paginaVisible()` (src/lib/navegacion.ts), que HOY
--       NO considera `administrador_alcance_limitado` al decidir si mostrar
--       la página — no es el hallazgo F39 principal, pero vale la pena
--       revisarlo en una fase posterior de pulido de permisos (ver hallazgo
--       F23 del diagnóstico, permisos dinámicos por rol).
-- =============================================================================
