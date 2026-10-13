-- =============================================================================
-- Devolver un documento Pendiente desde una función del servidor (octubre 2026).
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Ejecutar a mano en el SQL Editor
-- de Supabase (idempotente). Requiere `db/agregar_rpc_eliminar_anular_documentos.sql`
-- (usa `beats_usuario_actual` y `beats_tabla_documento`) y el valor 'Devuelto'
-- del enum (`db/agregar_ciclo_vida_documentos.sql`).
--
-- Problema: «Devolver» hacía un `update ... set estado = 'Devuelto'` directo
-- desde el navegador; Row Level Security lo filtraba en silencio (0 filas, sin
-- error) y el documento seguía Pendiente y sin poder editarse. Aquí el cambio
-- lo hace una función `security definer` que valida en el servidor la misma
-- regla que la interfaz: solo quien creó el documento (o un Administrador), y
-- solo si está Pendiente. (La regla «sin ninguna firma todavía» sigue
-- validándose en la app, que es quien conoce la cadena de aprobación.)
-- =============================================================================
create or replace function public.beats_devolver_documento(p_tipo text, p_id uuid)
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
    raise exception 'No se pudo devolver: el documento ya no existe.';
  end if;
  if v_estado <> 'Pendiente' then
    raise exception 'No se pudo devolver: solo se puede devolver un documento Pendiente (este está en %).', v_estado;
  end if;
  if not (coalesce(v_usuario.es_administrador, false) or v_creador = v_usuario.id) then
    raise exception 'No se pudo devolver: solo quien creó el documento (o un Administrador) puede devolverlo.';
  end if;

  execute format('update public.%I set estado = ''Devuelto'' where id = $1', v_tabla) using p_id;
end;
$function$;

revoke all on function public.beats_devolver_documento(text, uuid) from public, anon;
grant execute on function public.beats_devolver_documento(text, uuid) to authenticated;
notify pgrst, 'reload schema';
