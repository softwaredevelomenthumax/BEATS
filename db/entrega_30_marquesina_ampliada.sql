-- =============================================================================
-- Entrega 30 — Marquesina ampliada: datos adicionales para el tablero en vivo
-- (llegadas por hora, asistentes esperados, últimos check-ins, perfil de asistentes).
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Ejecutar completo en el SQL Editor (idempotente).
-- Es OPCIONAL: sin esta función la marquesina sigue mostrando los totales y el ranking de productos
-- (usa solo `resumen_ejecucion_evento`) y oculta los paneles que necesitan estos datos.
--
-- Mismo modelo de acceso que `resumen_ejecucion_evento`: función pública (anon) que exige un código de
-- evento activo. Privacidad: NO devuelve nombres, cédulas ni contactos; de los últimos check-ins solo las
-- iniciales, la especialidad y la ciudad.
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

  return jsonb_build_object(
    'esperados', v_esperados,
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
