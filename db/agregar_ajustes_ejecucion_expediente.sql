-- =============================================================================
-- Ajustes de Ejecución en Sitio y Expediente del evento (octubre 2026).
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE: ejecutarlo a mano en el SQL Editor
-- de Supabase. REQUIERE haber ejecutado antes `agregar_expediente_evento.sql`
-- (usa `fn_resolver_sesion_ejecucion`, `evento_repositorio_archivos` y las
-- columnas `etiqueta`/`origen`). Es idempotente.
--
-- Qué hace:
--   1. `registros_participacion.estado_provincia` — Estado/Provincia/Departamento
--      del asistente (campo nuevo y obligatorio del formulario de Ejecución).
--   2. RPC NUEVA `registrar_estado_provincia_participacion` — completa ese dato
--      justo después de `crear_registro_participacion`. NO se modifica
--      `crear_registro_participacion` (su código real no está en este
--      repositorio; reescribirla "a ciegas" podría romper el check-in). El
--      cliente la llama en modo "mejor esfuerzo": si esta migración aún no se
--      aplicó, el registro de asistencia se guarda igual, solo sin el Estado.
--   3. Fotos del evento POR SESIÓN: `registrar_foto_evento_ejecucion` y
--      `listar_fotos_evento_ejecucion` se reemplazan (misma firma). Ahora el
--      máximo de 4 fotos (una por marco) aplica a cada sesión de un evento de
--      "Varias sesiones", y la lista devuelve el `sesionId` de cada foto.
--      (Son funciones de `agregar_expediente_evento.sql`, creadas en este mismo
--      proyecto, por eso sí es seguro reemplazarlas.)
--
-- Antes de ejecutar, confirma que no colisiona con nada existente:
--   select column_name from information_schema.columns
--   where table_name = 'registros_participacion' and column_name = 'estado_provincia';
-- =============================================================================

-- 1. Estado/Provincia/Departamento del asistente -----------------------------
alter table public.registros_participacion
  add column if not exists estado_provincia text;

-- 2. Completar el Estado/Provincia del registro recién creado ----------------
-- Solo escribe si el registro es de la MISMA sesión de ejecución (mismo token)
-- y todavía no tiene Estado: no se puede usar para sobrescribir datos ajenos.
create or replace function public.registrar_estado_provincia_participacion(
  p_token text,
  p_registro_participacion_id uuid,
  p_estado_provincia text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sesion uuid;
  v_evento uuid;
begin
  select r.sesion_ejecucion_id, r.evento_id into v_sesion, v_evento
    from public.fn_resolver_sesion_ejecucion(p_token) r;
  if v_evento is null then
    raise exception 'Sesión de ejecución inválida o expirada.';
  end if;
  if coalesce(trim(p_estado_provincia), '') = '' then
    raise exception 'El estado/provincia/departamento es obligatorio.';
  end if;

  update public.registros_participacion
     set estado_provincia = trim(p_estado_provincia)
   where id = p_registro_participacion_id
     and evento_id = v_evento
     and sesion_ejecucion_id = v_sesion
     and estado_provincia is null;
end;
$function$;
grant execute on function public.registrar_estado_provincia_participacion(text, uuid, text) to anon, authenticated;

-- 3. Fotos del evento por sesión ---------------------------------------------
create or replace function public.registrar_foto_evento_ejecucion(
  p_token text,
  p_etiqueta text,
  p_data_url text,
  p_nombre text,
  p_tipo text,
  p_tamano_bytes integer,
  p_sesion_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_evento uuid;
  v_archivo uuid;
  v_previo record;
  v_multisesion boolean;
begin
  select r.evento_id into v_evento from public.fn_resolver_sesion_ejecucion(p_token) r;
  if v_evento is null then
    raise exception 'Sesión de ejecución inválida o expirada.';
  end if;
  if p_etiqueta not in ('grupal', 'actividad_1', 'actividad_2', 'speaker') then
    raise exception 'Marco de foto no válido.';
  end if;
  if coalesce(p_data_url, '') = '' or p_data_url not like 'data:image/%' then
    raise exception 'La foto no es una imagen válida.';
  end if;
  if length(p_data_url) > 6000000 then
    raise exception 'La foto es demasiado pesada.';
  end if;

  -- ¿El evento es de varias sesiones? Entonces la foto debe indicar su sesión.
  select (e.modalidad_sesiones = 'Varias sesiones'
          and exists (select 1 from public.sesiones_evento s where s.evento_id = e.id))
    into v_multisesion
    from public.solicitudes_evento e
   where e.id = v_evento;

  if v_multisesion then
    if p_sesion_id is null then
      raise exception 'Elige la sesión a la que corresponde la foto.';
    end if;
    if not exists (select 1 from public.sesiones_evento s where s.id = p_sesion_id and s.evento_id = v_evento) then
      raise exception 'La sesión indicada no pertenece a este evento.';
    end if;
  else
    p_sesion_id := null; -- evento de sesión única: un solo juego de fotos
  end if;

  -- Reemplaza la foto previa del mismo marco EN LA MISMA SESIÓN (si la hay).
  for v_previo in
    select id, archivo_id from public.evento_repositorio_archivos
     where evento_id = v_evento and categoria = 'fotos' and etiqueta = p_etiqueta
       and sesion_id is not distinct from p_sesion_id
  loop
    delete from public.evento_repositorio_archivos where id = v_previo.id;
    delete from public.archivos_adjuntos where id = v_previo.archivo_id;
  end loop;

  -- Máximo 4 fotos por sesión (o por evento, si es de sesión única).
  if (select count(*) from public.evento_repositorio_archivos
       where evento_id = v_evento and categoria = 'fotos'
         and sesion_id is not distinct from p_sesion_id) >= 4 then
    raise exception 'Esta sesión ya tiene 4 fotos. Reemplaza una de las existentes.';
  end if;

  insert into public.archivos_adjuntos (nombre, tipo, tamano_bytes, data_url, cargado_en)
  values (coalesce(nullif(trim(p_nombre), ''), 'Foto_evento.jpg'), coalesce(nullif(p_tipo, ''), 'image/jpeg'), coalesce(p_tamano_bytes, 0), p_data_url, now())
  returning id into v_archivo;

  insert into public.evento_repositorio_archivos (evento_id, categoria, archivo_id, sesion_id, etiqueta, origen)
  values (v_evento, 'fotos', v_archivo, p_sesion_id, p_etiqueta, 'ejecucion');

  return v_archivo;
end;
$function$;
grant execute on function public.registrar_foto_evento_ejecucion(text, text, text, text, text, integer, uuid) to anon, authenticated;

create or replace function public.listar_fotos_evento_ejecucion(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_evento uuid;
begin
  select r.evento_id into v_evento from public.fn_resolver_sesion_ejecucion(p_token) r;
  if v_evento is null then
    raise exception 'Sesión de ejecución inválida o expirada.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'etiqueta', e.etiqueta,
             'archivoId', e.archivo_id,
             'dataUrl', a.data_url,
             'sesionId', e.sesion_id))
      from public.evento_repositorio_archivos e
      join public.archivos_adjuntos a on a.id = e.archivo_id
     where e.evento_id = v_evento and e.categoria = 'fotos' and e.etiqueta is not null
  ), '[]'::jsonb);
end;
$function$;
grant execute on function public.listar_fotos_evento_ejecucion(text) to anon, authenticated;

notify pgrst, 'reload schema';
