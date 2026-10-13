-- =============================================================================
-- Entrega 33 (octubre 2026) — Marquesina: selector de SESIÓN en eventos de varias sesiones.
--
-- Amplía `resumen_ejecucion_evento_ampliado` (conserva TODAS las claves de las entregas 30 y 31) con la clave
-- `sesiones`: una fila por sesión del evento con su fecha, lugar, país/estado/ciudad, asistentes esperados y cuántos
-- check-ins se registraron en ella. Con eso la marquesina deja elegir la sesión y mostrar sus fechas Y su localización
-- (antes solo se veían las fechas generales del evento).
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE: ejecutarlo completo en el SQL Editor (idempotente; reemplaza la función).
-- Es OPCIONAL: sin él la marquesina funciona igual y simplemente no muestra el selector de sesión.
--
-- Nota sobre `registros_participacion`: según la base, la sesión del check-in vive en `sesion_id` o en
-- `sesion_evento_id` (la app ya lee las dos variantes). Aquí se lee la que exista con `to_jsonb(r)`, así la función
-- no falla aunque falte alguna de las dos columnas.
-- Privacidad: igual que antes, NO se devuelven nombres, cédulas ni contactos.
-- =============================================================================

create or replace function public.resumen_ejecucion_evento_ampliado(p_codigo text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_evento uuid;
  v_esperados integer;
  v_pais text;
  v_modalidad text;
  v_ciudad_evento text;
begin
  select c.evento_id into v_evento
  from public.eventos_codigos_acceso c
  where c.codigo = upper(trim(p_codigo)) and c.activo
  limit 1;
  if v_evento is null then
    raise exception 'Código inválido.';
  end if;

  select coalesce(
           e.numero_asistentes,
           nullif((select sum(s.numero_asistentes_esperados) from public.sesiones_evento s where s.evento_id = e.id), 0)
         )
    into v_esperados
  from public.solicitudes_evento e
  where e.id = v_evento;

  select coalesce(e.pais, ''), coalesce(e.modalidad_evento, ''), coalesce(e.ciudad, '')
    into v_pais, v_modalidad, v_ciudad_evento
  from public.solicitudes_evento e
  where e.id = v_evento;

  return jsonb_build_object(
    'esperados', v_esperados,
    'evento', jsonb_build_object('pais', v_pais, 'modalidad', v_modalidad, 'ciudad', v_ciudad_evento),
    'sesiones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id,
               'numero', s.numero,
               'fecha', s.fecha,
               'lugar', coalesce(s.lugar, ''),
               'pais', coalesce(s.pais, ''),
               'estadoProvincia', coalesce(s.estado_provincia, ''),
               'ciudad', coalesce(s.ciudad, ''),
               'esperados', s.numero_asistentes_esperados,
               'registros', (
                 select count(*)::int
                 from public.registros_participacion r
                 where r.evento_id = v_evento
                   and coalesce(to_jsonb(r)->>'sesion_id', to_jsonb(r)->>'sesion_evento_id') = s.id::text
               )
             ) order by s.numero)
      from (
        select x.*, (row_number() over (order by x.orden, x.fecha nulls last, x.id))::int as numero
        from public.sesiones_evento x
        where x.evento_id = v_evento
      ) s
    ), '[]'::jsonb),
    'ubicaciones', coalesce((
      select jsonb_agg(jsonb_build_object('pais', x.pais, 'ciudad', x.ciudad, 'total', x.total) order by x.total desc)
      from (
        select coalesce(r.pais, '') as pais, coalesce(r.ciudad, '') as ciudad, count(*)::int as total
        from public.registros_participacion r
        where r.evento_id = v_evento and coalesce(r.ciudad, '') <> ''
        group by 1, 2
        order by 3 desc
        limit 300
      ) x
    ), '[]'::jsonb),
    'llegadasPorHora', coalesce((
      select jsonb_agg(jsonb_build_object('hora', h.hora, 'total', h.total) order by h.hora)
      from (
        select date_trunc('hour', r.capturado_en) as hora, count(*)::int as total
        from public.registros_participacion r
        where r.evento_id = v_evento
        group by 1
      ) h
    ), '[]'::jsonb),
    'ultimos', coalesce((
      select jsonb_agg(u order by u.capturadoEn desc)
      from (
        select
          r.id::text as id,
          coalesce(r.pais, '') as pais,
          upper(left(coalesce(r.nombres, ''), 1)) || upper(left(coalesce(r.apellidos, ''), 1)) as iniciales,
          coalesce(nullif(r.especialidad, ''), nullif(r.especialidad_otra, ''), nullif(r.profesion, ''), '') as especialidad,
          coalesce(r.ciudad, '') as ciudad,
          r.tipo_participacion as tipo,
          r.capturado_en as "capturadoEn"
        from public.registros_participacion r
        where r.evento_id = v_evento
        order by r.capturado_en desc
        limit 8
      ) u
    ), '[]'::jsonb),
    'especialidades', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', x.nombre, 'total', x.total) order by x.total desc)
      from (
        select coalesce(nullif(r.especialidad, ''), nullif(r.especialidad_otra, ''), nullif(r.profesion, ''), 'Sin dato') as nombre, count(*)::int as total
        from public.registros_participacion r
        where r.evento_id = v_evento
        group by 1
        order by 2 desc
        limit 6
      ) x
    ), '[]'::jsonb),
    'ciudades', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', x.nombre, 'total', x.total) order by x.total desc)
      from (
        select coalesce(nullif(r.ciudad, ''), 'Sin dato') as nombre, count(*)::int as total
        from public.registros_participacion r
        where r.evento_id = v_evento
        group by 1
        order by 2 desc
        limit 5
      ) x
    ), '[]'::jsonb)
  );
end;
$function$;

grant execute on function public.resumen_ejecucion_evento_ampliado(text) to anon, authenticated;

notify pgrst, 'reload schema';
