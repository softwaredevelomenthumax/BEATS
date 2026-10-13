-- =============================================================================
-- Entrega 25 (octubre 2026) — texto de las notificaciones «pendiente de tu aprobación»
--
-- Las funciones resolver_aprobacion_* / fn_notificar_paso_caf arman el aviso de las
-- etapas SIGUIENTES con  format('%s, está pendiente de tu aprobación en BEATS (etapa: %s).',
-- fn_descriptor_X(id), etiqueta). Este script solo reemplaza fn_descriptor_X por versiones
-- más informativas (actividad, speaker, fechas, costos con «$» y moneda). La app (TypeScript,
-- src/lib/descriptorTarea.ts) arma el MISMO texto para el primer aprobador.
--
-- Idempotente. Ejecutar completo en el SQL Editor. Solo lectura de datos: no modifica tablas.
-- Las funciones leen las filas como jsonb, así que si alguna columna no existe el dato
-- simplemente se omite del texto (no falla).
-- =============================================================================

-- Formato de dinero igual al de la app: $1.234.567,89 COP
create or replace function public.fn_formato_dinero(p_valor numeric, p_moneda text)
returns text language sql immutable as $$
  select '$' || translate(to_char(coalesce(p_valor, 0), 'FM999,999,999,999,990.00'), ',.', '.,')
         || case when nullif(trim(coalesce(p_moneda, '')), '') is null then '' else ' ' || trim(p_moneda) end;
$$;

-- dd/mm/yyyy
create or replace function public.fn_fecha_aviso(p_fecha text)
returns text language sql immutable as $$
  select case when p_fecha ~ '^\d{4}-\d{2}-\d{2}' then to_char(left(p_fecha, 10)::date, 'DD/MM/YYYY') else coalesce(p_fecha, '') end;
$$;

-- «del d1 al d2» / «el d» / ''
create or replace function public.fn_rango_aviso(p_inicio text, p_fin text)
returns text language sql immutable as $$
  select case
    when nullif(p_inicio, '') is not null and nullif(p_fin, '') is not null and left(p_inicio, 10) <> left(p_fin, 10)
      then 'del ' || public.fn_fecha_aviso(p_inicio) || ' al ' || public.fn_fecha_aviso(p_fin)
    when coalesce(nullif(p_inicio, ''), nullif(p_fin, '')) is not null
      then 'el ' || public.fn_fecha_aviso(coalesce(nullif(p_inicio, ''), p_fin))
    else '' end;
$$;

drop function if exists public.fn_descriptor_evento(uuid);
create function public.fn_descriptor_evento(p_evento_id uuid)
returns text language plpgsql stable security definer set search_path to 'public' as $$
declare
  v        jsonb;
  s        text := 'Una solicitud de evento';
  v_sedes  text;
  v_donde  text;
  v_cuando text;
  v_spk    text[];
  v_n      int;
  v_total  numeric;
begin
  select to_jsonb(t) into v from public.solicitudes_evento t where t.id = p_evento_id;
  if v is null then return s; end if;

  if nullif(v->>'tipo_evento', '') is not null then s := s || format(' de tipo "%s"', v->>'tipo_evento'); end if;
  if nullif(v->>'nombre_evento', '') is not null then s := s || format(' ("%s")', v->>'nombre_evento'); end if;

  select string_agg(
           coalesce(nullif(se.lugar, ''), nullif(se.ciudad, ''), 'sede por definir')
           || case when se.fecha is not null then ' el ' || to_char(se.fecha, 'DD/MM/YYYY') else '' end,
           '; ' order by se.orden)
    into v_sedes
    from public.sesiones_evento se where se.evento_id = p_evento_id;

  if v->>'modalidad_sesiones' = 'Varias sesiones' and v_sedes is not null then
    s := s || ', en varias sedes: ' || v_sedes;
  else
    v_donde := case when v->>'modalidad_evento' = 'Virtual' then 'de modalidad virtual'
                    else 'en ' || coalesce(nullif(v->>'ciudad', ''), nullif(v->>'direccion', ''), 'sede por definir') end;
    v_cuando := public.fn_rango_aviso(v->>'fecha_inicio_evento', v->>'fecha_fin_evento');
    s := s || ', ' || v_donde || case when v_cuando <> '' then ' ' || v_cuando else '' end;
  end if;

  select array_agg(nullif(trim(sp.nombre_speaker), '') order by sp.orden)
    into v_spk from public.evento_speakers_participacion sp where sp.evento_id = p_evento_id;
  v_spk := array_remove(coalesce(v_spk, '{}'), null);
  v_n := coalesce(array_length(v_spk, 1), 0);
  if v_n = 1 then
    s := s || ', con el speaker ' || v_spk[1];
  elsif v_n > 1 then
    s := s || ', con los speakers ' || array_to_string(v_spk[1:v_n - 1], ', ') || ' y ' || v_spk[v_n];
  end if;

  v_total := coalesce((v->>'condensado_inscripcion')::numeric, 0) + coalesce((v->>'condensado_transporte')::numeric, 0)
           + coalesce((v->>'condensado_traslado')::numeric, 0) + coalesce((v->>'condensado_hospedaje')::numeric, 0)
           + coalesce((v->>'condensado_alimentos')::numeric, 0) + coalesce((v->>'condensado_honorarios_speaker')::numeric, 0)
           + coalesce((v->>'condensado_otro')::numeric, 0)
           + case when coalesce((v->>'incluir_valor_participacion')::boolean, false)
                  then coalesce((v->>'condensado_valor_participacion')::numeric, 0) else 0 end;
  if v_total > 0 then s := s || ', con presupuesto total de ' || public.fn_formato_dinero(v_total, v->>'moneda'); end if;

  if nullif(v->>'nombre_solicitante', '') is not null then s := s || ', solicitada por ' || (v->>'nombre_solicitante'); end if;
  return s;
end;
$$;

drop function if exists public.fn_descriptor_convenio(uuid);
create function public.fn_descriptor_convenio(p_convenio_id uuid)
returns text language plpgsql stable security definer set search_path to 'public' as $$
declare
  v jsonb; s text; v_act text; v_cuando text; v_creador text;
begin
  select to_jsonb(t) into v from public.convenios_pago_hcp t where t.id = p_convenio_id;
  if v is null then return 'Una solicitud de convenio de pago a HCP'; end if;

  s := 'Una solicitud de convenio de pago a HCP para ' || coalesce(nullif(v->>'hcp_nombre_completo', ''), 'un HCP')
       || case when nullif(v->>'hcp_especialidad', '') is not null then ' (' || (v->>'hcp_especialidad') || ')' else '' end;

  v_act := concat_ws(' ', nullif(v->>'tipo_actividad', ''),
                     case when nullif(v->>'nombre_evento_servicio', '') is not null then '"' || (v->>'nombre_evento_servicio') || '"' end);
  if v_act <> '' then s := s || ', por la actividad ' || v_act; end if;
  v_cuando := public.fn_rango_aviso(v->>'fecha_inicio_actividad', v->>'fecha_fin_actividad');
  if v_cuando <> '' then s := s || ' ' || v_cuando; end if;

  if nullif(v->>'contraprestacion_hcp', '') is not null then
    s := s || ', con contraprestación de ' || public.fn_formato_dinero((v->>'contraprestacion_hcp')::numeric, v->>'moneda_contraprestacion');
  end if;
  select u.nombre into v_creador from public.usuarios u where u.id = (v->>'creado_por_id')::uuid;
  if nullif(v_creador, '') is not null then s := s || ', solicitada por ' || v_creador; end if;
  return s;
end;
$$;

drop function if exists public.fn_descriptor_caf(uuid);
create function public.fn_descriptor_caf(p_caf_id uuid)
returns text language plpgsql stable security definer set search_path to 'public' as $$
declare
  v jsonb; s text; v_vig text; v_obj text;
begin
  select to_jsonb(t) into v from public.cafs t where t.id = p_caf_id;
  if v is null then return 'Una solicitud de CAF'; end if;

  s := 'Una solicitud de CAF' || case when nullif(v->>'tipo_contrato', '') is not null then ' (' || (v->>'tipo_contrato') || ')' else '' end;
  if nullif(v->>'contraparte_nombre', '') is not null then s := s || ' con ' || (v->>'contraparte_nombre'); end if;
  v_obj := nullif(trim(coalesce(v->>'objeto_contrato', '')), '');
  if v_obj is not null then s := s || ', por "' || case when length(v_obj) > 120 then left(v_obj, 119) || '…' else v_obj end || '"'; end if;
  if nullif(v->>'monto', '') is not null then s := s || ', con monto de ' || public.fn_formato_dinero((v->>'monto')::numeric, v->>'moneda'); end if;
  v_vig := public.fn_rango_aviso(v->>'termino_contrato_inicio', v->>'termino_contrato_fin');
  if v_vig <> '' then s := s || ' y vigencia ' || v_vig; end if;
  if nullif(v->>'solicitante_nombre', '') is not null then s := s || ', solicitada por ' || (v->>'solicitante_nombre'); end if;
  return s;
end;
$$;

drop function if exists public.fn_descriptor_convenio_hcp(uuid);
create function public.fn_descriptor_convenio_hcp(p_convenio_hcp_id uuid)
returns text language plpgsql stable security definer set search_path to 'public' as $$
declare
  v jsonb; s text; v_creador text;
begin
  select to_jsonb(t) into v from public.convenios_hcp t where t.id = p_convenio_hcp_id;
  if v is null then return 'Una solicitud de Convenio HCP'; end if;

  s := 'Una solicitud de Convenio HCP con ' || coalesce(nullif(v->>'consultor_nombre', ''), 'un HCP');
  if nullif(v->>'compensacion', '') is not null then
    s := s || ', con compensación de ' || public.fn_formato_dinero((v->>'compensacion')::numeric, v->>'moneda');
  end if;
  if nullif(v->>'plazo_pago_dias', '') is not null then s := s || ', plazo de pago de ' || (v->>'plazo_pago_dias') || ' días'; end if;
  if nullif(v->>'fecha_efectiva', '') is not null then s := s || ' y fecha efectiva ' || public.fn_fecha_aviso(v->>'fecha_efectiva'); end if;
  select u.nombre into v_creador from public.usuarios u where u.id = (v->>'creado_por_id')::uuid;
  if nullif(v_creador, '') is not null then s := s || ', elaborada por ' || v_creador; end if;
  return s;
end;
$$;

-- Aviso de la PRIMERA etapa cuando un documento se inserta ya como «Pendiente» (trigger
-- fn_notificar_primera_etapa_*): mismo texto que las etapas siguientes.
create or replace function public.beats_notificar_tarea_pendiente(p_tipo text, p_tabla text, p_doc_id uuid, p_rol text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_row        jsonb;
  v_descriptor text;
  v_etapa      text;
  v_mensaje    text;
begin
  execute format('select to_jsonb(t) from public.%I t where t.id = $1', p_tabla) into v_row using p_doc_id;
  if v_row is null or v_row->>'estado' is distinct from 'Pendiente' then
    return; -- borrador u otro estado: todavía no hay tarea de firma
  end if;

  v_descriptor := case p_tipo
    when 'evento'      then public.fn_descriptor_evento(p_doc_id)
    when 'convenio'    then public.fn_descriptor_convenio(p_doc_id)
    when 'caf'         then public.fn_descriptor_caf(p_doc_id)
    when 'convenioHCP' then public.fn_descriptor_convenio_hcp(p_doc_id)
    else null end;

  v_etapa := case p_tipo
    when 'evento'      then (select etiqueta from public.evento_aprobaciones where evento_id = p_doc_id and estado = 'pendiente' order by orden limit 1)
    when 'convenio'    then (select etiqueta from public.convenio_aprobaciones where convenio_id = p_doc_id and estado = 'pendiente' order by orden limit 1)
    when 'caf'         then (select etiqueta from public.caf_aprobaciones where caf_id = p_doc_id and estado = 'pendiente' order by orden limit 1)
    when 'convenioHCP' then (select etiqueta from public.convenio_hcp_aprobaciones where convenio_hcp_id = p_doc_id and estado = 'pendiente' order by orden limit 1)
    else null end;

  v_mensaje := coalesce(
    case when v_descriptor is not null
      then format('%s, está pendiente de tu aprobación en BEATS%s.', v_descriptor, case when v_etapa is not null then format(' (etapa: %s)', v_etapa) else '' end) end,
    format('"%s" está esperando tu aprobación.', coalesce(nullif(v_row->>'nombre_evento', ''), nullif(v_row->>'codigo_documento', ''), 'Documento')));

  insert into public.notificaciones (para_usuario_id, tipo, mensaje, documento_ref_tipo, documento_ref_id)
  select u.id, 'tarea_pendiente', v_mensaje, p_tipo::public.tipo_doc, p_doc_id
    from public.usuarios u
   where public.fn_rol_satisface(u.rol::text, p_rol)
     and coalesce(u.activo, true) is true;
end;
$function$;

-- Prueba rápida (opcional): reemplaza el id por el de un documento real.
-- select public.fn_descriptor_evento('00000000-0000-0000-0000-000000000000');
