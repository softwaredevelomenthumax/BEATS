-- =============================================================================
-- Eliminar / anular documentos desde funciones del servidor (octubre 2026).
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Debe ejecutarse a mano en el
-- SQL Editor del proyecto real de Supabase, ANTES de usar la versión nueva de
-- la aplicación (sin estas funciones, "Eliminar borrador", "Anular" y
-- "Gestión avanzada de documentos" muestran un error que lo indica).
--
-- Qué problema resuelve (reportado por el usuario, 4 síntomas con una misma
-- causa de fondo):
--   1. "Eliminar borrador" (quien lo creó, en Borrador) → "No se pudo
--      eliminar: solo quien creó la solicitud puede borrarla...".
--   2. "Anular" un documento Completado → "No se pudo anular: la base de datos
--      no permitió el cambio (probablemente una restricción de permisos)".
--   3. "Gestión avanzada de documentos" (antes "Eliminar documentos firmados")
--      → "No se pudo eliminar: no se encontró el documento (probablemente una
--      restricción de permisos)".
--   Los tres mensajes salen del mismo lugar: un `delete`/`update` hecho
--   directamente desde el navegador que Row Level Security filtró en silencio
--   (0 filas afectadas, sin error de Postgres). Las políticas RLS reales de
--   `solicitudes_evento` y demás tablas NO están en este repositorio (se
--   crearon directo en Supabase), así que reescribirlas "a ciegas" es el
--   mismo riesgo que ya provocó una recursión infinita de políticas en
--   `usuarios` (ver `db/rls-usuarios.propuesta.sql`). En vez de tocar las
--   políticas, esta migración mueve la operación a funciones `security
--   definer` que:
--     - identifican al usuario real con `auth.uid()` (nunca confían en un id
--       enviado por el navegador),
--     - validan en el servidor la MISMA regla de negocio que ya validaba la
--       interfaz (quién puede, en qué estado), y
--     - recién entonces ejecutan el cambio saltándose el RLS.
--   No se modifica ninguna política existente: el resto de la app sigue
--   exactamente igual.
--
--   4. (Síntoma aparte, NO se arregla aquí) "Desde Borrador solo puedes
--      guardar (Borrador) o enviar a aprobación (Pendiente)" al anular un
--      Borrador: ese mensaje lo lanza un trigger de máquina de estados que
--      existe solo en la base real. Es una regla correcta (un Borrador no se
--      anula, se elimina) — la interfaz deja de ofrecer "Anular" en Borrador
--      y esta función también lo rechaza con un mensaje claro.
--
-- Tipos de documento aceptados (mismos valores de `TipoDoc` en la app):
--   evento, caf, convenio, convenioHCP, fmv, notificacionPago
--
-- LÍMITES HONESTOS:
--   - Las funciones asumen que `usuarios.auth_user_id` enlaza con
--     `auth.uid()` (confirmado en src/hooks/useAuth.tsx) y que existen las
--     columnas `es_administrador` y `puede_eliminar_documentos_firmados`
--     (esta última, de `agregar_permiso_eliminar_documentos_firmados.sql`).
--   - Al eliminar, se borran primero las filas dependientes (cadena de
--     aprobación, sesiones, speakers, repositorio, etc.) descubriéndolas por
--     las llaves foráneas reales de la base, sin necesidad de listarlas a
--     mano. Los OTROS documentos principales que referencien al documento
--     (p. ej. un CAF o un convenio vinculado a un evento) NO se borran en
--     cascada: la eliminación se rechaza con un mensaje claro para que se
--     decida a conciencia qué hacer con ellos.
--   - No se tocan filas ya existentes en `auditoria` (igual que antes: la
--     eliminación en sí no registra ninguna acción nueva en auditoría).
-- =============================================================================

-- 1. Usuario de la sesión actual (fila completa de `usuarios`).
create or replace function public.beats_usuario_actual()
returns public.usuarios
language sql
stable
security definer
set search_path to 'public'
as $function$
  select u.* from public.usuarios u where u.auth_user_id = auth.uid() limit 1;
$function$;

-- 2. Nombre de tabla para un tipo de documento (lista cerrada — nunca se
--    interpola texto del navegador en SQL dinámico).
create or replace function public.beats_tabla_documento(p_tipo text)
returns text
language sql
immutable
as $function$
  select case p_tipo
    when 'evento'           then 'solicitudes_evento'
    when 'caf'              then 'cafs'
    when 'convenio'         then 'convenios_pago_hcp'
    when 'convenioHCP'      then 'convenios_hcp'
    when 'fmv'              then 'fmv_checklists'
    when 'notificacionPago' then 'notificaciones_pago_hcp'
    else null
  end;
$function$;

-- 3. Borra, de forma recursiva, las filas que dependen de las filas `p_ids`
--    de `p_tabla` por llave foránea (hijos y nietos). Omite:
--      - FKs con ON DELETE CASCADE / SET NULL / SET DEFAULT (Postgres ya las
--        resuelve solo al borrar el padre),
--      - FKs compuestas,
--      - las 6 tablas de documento principal y `usuarios`: si otro documento
--        depende de este, el DELETE final falla con violación de FK y se
--        traduce a un mensaje claro (ver las funciones de más abajo).
create or replace function public.beats_borrar_dependientes(p_tabla regclass, p_ids text[], p_nivel int default 0)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  fk record;
  hijos text[];
  protegidas regclass[] := array[
    'public.solicitudes_evento'::regclass,
    'public.cafs'::regclass,
    'public.convenios_pago_hcp'::regclass,
    'public.convenios_hcp'::regclass,
    'public.fmv_checklists'::regclass,
    'public.notificaciones_pago_hcp'::regclass,
    'public.usuarios'::regclass
  ];
begin
  if p_nivel > 5 then
    raise exception 'No se puede eliminar: la estructura de dependencias del documento es demasiado profunda.';
  end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    return;
  end if;

  for fk in
    select c.conrelid::regclass as tabla_hija, a.attname::text as columna
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = p_tabla
      and array_length(c.conkey, 1) = 1
      and c.confdeltype in ('a', 'r')
  loop
    if fk.tabla_hija = any (protegidas) then
      continue;
    end if;

    -- Nietos: solo si la tabla hija tiene una columna `id` por la cual
    -- seguir bajando.
    if exists (
      select 1 from pg_attribute
      where attrelid = fk.tabla_hija and attname = 'id' and not attisdropped
    ) then
      execute format('select coalesce(array_agg(id::text), ''{}''::text[]) from %s where %I::text = any ($1)', fk.tabla_hija, fk.columna)
        into hijos using p_ids;
      if array_length(hijos, 1) is not null then
        perform public.beats_borrar_dependientes(fk.tabla_hija, hijos, p_nivel + 1);
      end if;
    end if;

    execute format('delete from %s where %I::text = any ($1)', fk.tabla_hija, fk.columna) using p_ids;
  end loop;
end;
$function$;

-- 4. Borra un documento y sus dependientes. Uso interno de las dos funciones
--    públicas de más abajo (no se concede a `authenticated`).
create or replace function public.beats_borrar_documento(p_tabla text, p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_filas int;
begin
  perform public.beats_borrar_dependientes(p_tabla::regclass, array[p_id::text]);
  execute format('delete from public.%I where id = $1', p_tabla) using p_id;
  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    raise exception 'No se pudo eliminar: el documento ya no existe.';
  end if;
exception
  when foreign_key_violation then
    raise exception 'No se puede eliminar: hay otros documentos vinculados a este (por ejemplo CAF, convenios, FMV o notificaciones de pago). Elimina o anula primero esos documentos.';
end;
$function$;

-- 5. Eliminar un BORRADOR propio: solo quien lo creó y solo en Borrador.
create or replace function public.beats_eliminar_borrador(p_tipo text, p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tabla text := public.beats_tabla_documento(p_tipo);
  v_usuario public.usuarios;
  v_estado text;
  v_creador uuid;
begin
  if v_tabla is null then
    raise exception 'Tipo de documento no válido: %', p_tipo;
  end if;
  v_usuario := public.beats_usuario_actual();
  if v_usuario.id is null then
    raise exception 'No se pudo identificar tu usuario. Cierra sesión y vuelve a ingresar.';
  end if;

  execute format('select estado::text, creado_por_id from public.%I where id = $1', v_tabla)
    into v_estado, v_creador using p_id;
  if v_estado is null then
    raise exception 'No se pudo eliminar: el documento ya no existe.';
  end if;
  if v_estado <> 'Borrador' then
    raise exception 'No se pudo eliminar: solo se pueden eliminar documentos que sigan en Borrador (este está en %).', v_estado;
  end if;
  if v_creador is distinct from v_usuario.id then
    raise exception 'No se pudo eliminar: solo quien creó el documento puede borrarlo.';
  end if;

  perform public.beats_borrar_documento(v_tabla, p_id);
end;
$function$;

-- 6. "Gestión avanzada de documentos": eliminar un documento en cualquier
--    estado (incluidos los ya firmados/Completados). Exige el permiso
--    individual `puede_eliminar_documentos_firmados`. La confirmación con
--    contraseña la hace la interfaz antes de llamar a esta función.
create or replace function public.beats_eliminar_documento_admin(p_tipo text, p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tabla text := public.beats_tabla_documento(p_tipo);
  v_usuario public.usuarios;
begin
  if v_tabla is null then
    raise exception 'Tipo de documento no válido: %', p_tipo;
  end if;
  v_usuario := public.beats_usuario_actual();
  if v_usuario.id is null then
    raise exception 'No se pudo identificar tu usuario. Cierra sesión y vuelve a ingresar.';
  end if;
  if coalesce(v_usuario.puede_eliminar_documentos_firmados, false) is not true then
    raise exception 'No tienes el permiso individual de "Gestión avanzada de documentos firmados".';
  end if;

  perform public.beats_borrar_documento(v_tabla, p_id);
end;
$function$;

-- 7. Anular: solo Administradores, y no desde Borrador (se elimina) ni sobre
--    un documento ya Anulado. Los estados Pendiente/Aprobado/Rechazado/
--    Devuelto/Completado sí se pueden anular. Ojo: si el trigger real de
--    máquina de estados de la base impidiera alguna de esas transiciones, su
--    mensaje original llegará tal cual a la interfaz.
create or replace function public.beats_anular_documento(p_tipo text, p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tabla text := public.beats_tabla_documento(p_tipo);
  v_usuario public.usuarios;
  v_estado text;
begin
  if v_tabla is null then
    raise exception 'Tipo de documento no válido: %', p_tipo;
  end if;
  v_usuario := public.beats_usuario_actual();
  if v_usuario.id is null then
    raise exception 'No se pudo identificar tu usuario. Cierra sesión y vuelve a ingresar.';
  end if;
  if coalesce(v_usuario.es_administrador, false) is not true then
    raise exception 'No se pudo anular: solo un Administrador puede anular documentos.';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Indica el motivo de anulación.';
  end if;

  execute format('select estado::text from public.%I where id = $1', v_tabla) into v_estado using p_id;
  if v_estado is null then
    raise exception 'No se pudo anular: el documento ya no existe.';
  end if;
  if v_estado = 'Anulado' then
    raise exception 'Este documento ya está anulado.';
  end if;
  if v_estado = 'Borrador' then
    raise exception 'Un documento en Borrador no se anula: elimínalo con "Eliminar borrador" (solo quien lo creó).';
  end if;

  execute format(
    'update public.%I set estado = ''Anulado'', motivo_anulacion = $2, anulado_por_id = $3, anulado_en = now() where id = $1',
    v_tabla
  ) using p_id, btrim(p_motivo), v_usuario.id;
end;
$function$;

-- 8. Permisos: solo usuarios autenticados pueden invocar las 3 funciones
--    públicas; las internas (borrar_documento/borrar_dependientes) quedan
--    sin acceso desde el navegador.
revoke all on function public.beats_borrar_dependientes(regclass, text[], int) from public, anon, authenticated;
revoke all on function public.beats_borrar_documento(text, uuid) from public, anon, authenticated;
revoke all on function public.beats_eliminar_borrador(text, uuid) from public, anon;
revoke all on function public.beats_eliminar_documento_admin(text, uuid) from public, anon;
revoke all on function public.beats_anular_documento(text, uuid, text) from public, anon;
grant execute on function public.beats_eliminar_borrador(text, uuid) to authenticated;
grant execute on function public.beats_eliminar_documento_admin(text, uuid) to authenticated;
grant execute on function public.beats_anular_documento(text, uuid, text) to authenticated;

-- 9. Que PostgREST vea las funciones nuevas de inmediato.
notify pgrst, 'reload schema';

-- 10. Verificación recomendada (como cualquier usuario real, desde la app):
--     a) Crea un borrador de Solicitud de Evento y elimínalo → debe
--        desaparecer del tablero sin mensaje de error.
--     b) Con un Administrador, anula un documento Completado → debe quedar
--        "Anulado".
--     c) En "Gestión avanzada de documentos", elimina un documento de prueba.
--     d) Listado de las funciones creadas:
--        select proname from pg_proc where proname like 'beats\_%' escape '\';
