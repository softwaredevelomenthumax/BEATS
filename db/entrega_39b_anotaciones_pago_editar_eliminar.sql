-- =============================================================================
-- Entrega 39b (octubre 2026): editar y eliminar anotaciones de pago, con constancia en la auditoría.
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Ejecutar COMPLETO a mano en el SQL Editor de Supabase
-- (idempotente), DESPUÉS de `entrega_36_pagos_anotaciones_facturas.sql` y `entrega_39a_enum_auditoria_anotaciones.sql`.
--
-- Qué hace:
--   1. evento_anotaciones_pago: columnas editada_en / editada_por_nombre / editada_veces (quién y cuándo editó por última vez).
--   2. Trigger de UPDATE: el texto sigue siendo inmutable por UPDATE directo; solo cambia cuando lo hace la función
--      `beats_editar_anotacion_pago` (que activa una marca de transacción).
--   3. beats_editar_anotacion_pago(id, texto) y beats_eliminar_anotacion_pago(id): security definer. Solo pueden usarlas
--      el AUTOR de la anotación o un administrador. Cada una escribe en `auditoria` (en la misma transacción, con el
--      usuario de la sesión, no el que diga el navegador) el texto anterior y el nuevo (o el eliminado).
--   La tabla sigue SIN privilegio DELETE ni UPDATE de `texto` para el navegador: solo se puede por estas funciones.
-- =============================================================================

alter table public.evento_anotaciones_pago add column if not exists editada_en timestamptz;
alter table public.evento_anotaciones_pago add column if not exists editada_por_nombre text;
alter table public.evento_anotaciones_pago add column if not exists editada_veces integer not null default 0;

-- Trigger de UPDATE: igual que el de la entrega 36, pero permite cambiar el texto cuando viene de la función de edición.
create or replace function public.fn_anotacion_pago_aclarar()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_usuario public.usuarios;
  v_edicion boolean := coalesce(current_setting('beats.anotacion_edicion', true), '') = 'on';
begin
  new.id := old.id;
  new.evento_id := old.evento_id;
  new.speaker_id := old.speaker_id;
  new.sesion_id := old.sesion_id;
  new.registro_id := old.registro_id;
  new.origen := old.origen;
  new.autor_id := old.autor_id;
  new.autor_nombre := old.autor_nombre;
  new.autor_rol := old.autor_rol;
  new.creado_en := old.creado_en;
  if not v_edicion then
    new.texto := old.texto;
    new.editada_en := old.editada_en;
    new.editada_por_nombre := old.editada_por_nombre;
    new.editada_veces := old.editada_veces;
  end if;
  if new.aclarada is distinct from old.aclarada then
    v_usuario := public.beats_usuario_actual();
    if v_usuario.id is null then
      raise exception 'No se pudo identificar tu usuario. Cierra sesión y vuelve a ingresar.';
    end if;
    new.aclarada_por_id := v_usuario.id;
    new.aclarada_por_nombre := coalesce(v_usuario.nombre, '');
    new.aclarada_en := now();
  else
    new.aclarada_por_id := old.aclarada_por_id;
    new.aclarada_por_nombre := old.aclarada_por_nombre;
    new.aclarada_en := old.aclarada_en;
  end if;
  return new;
end;
$function$;

-- Editar -----------------------------------------------------------------------
create or replace function public.beats_editar_anotacion_pago(p_id uuid, p_texto text)
returns public.evento_anotaciones_pago
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_usuario public.usuarios;
  v_nota public.evento_anotaciones_pago;
  v_evento public.solicitudes_evento;
  v_texto text := btrim(coalesce(p_texto, ''));
  v_resultado public.evento_anotaciones_pago;
begin
  v_usuario := public.beats_usuario_actual();
  if v_usuario.id is null then
    raise exception 'No se pudo identificar tu usuario. Cierra sesión y vuelve a ingresar.';
  end if;
  if v_texto = '' then
    raise exception 'Escribe la anotación.';
  end if;
  select * into v_nota from public.evento_anotaciones_pago where id = p_id;
  if v_nota.id is null then
    raise exception 'La anotación ya no existe.';
  end if;
  if v_nota.autor_id is distinct from v_usuario.id and not coalesce(v_usuario.es_administrador, false) then
    raise exception 'Solo quien escribió la anotación o un administrador puede editarla.';
  end if;
  if v_texto = v_nota.texto then
    return v_nota;
  end if;
  select * into v_evento from public.solicitudes_evento where id = v_nota.evento_id;

  perform set_config('beats.anotacion_edicion', 'on', true);
  update public.evento_anotaciones_pago
     set texto = v_texto,
         editada_en = now(),
         editada_por_nombre = coalesce(v_usuario.nombre, ''),
         editada_veces = editada_veces + 1
   where id = p_id
   returning * into v_resultado;
  perform set_config('beats.anotacion_edicion', 'off', true);

  insert into public.auditoria (documento_id, tipo_doc, documento_nombre, actor_id, accion, detalle, empresa_grupo, pais)
  values (
    v_nota.evento_id, 'evento', coalesce(nullif(v_evento.nombre_evento, ''), '(sin nombre)'), v_usuario.id,
    'anotacion_pago_editada',
    format('Anotación de pago editada por %s. Texto anterior: "%s". Texto nuevo: "%s". (Autor original: %s, %s)',
      coalesce(v_usuario.nombre, ''), v_nota.texto, v_texto, v_nota.autor_nombre, to_char(v_nota.creado_en at time zone 'America/Bogota', 'DD/MM/YYYY HH24:MI')),
    nullif(v_evento.empresa_grupo, ''), nullif(v_evento.pais, '')
  );
  return v_resultado;
end;
$function$;

-- Eliminar ---------------------------------------------------------------------
create or replace function public.beats_eliminar_anotacion_pago(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_usuario public.usuarios;
  v_nota public.evento_anotaciones_pago;
  v_evento public.solicitudes_evento;
begin
  v_usuario := public.beats_usuario_actual();
  if v_usuario.id is null then
    raise exception 'No se pudo identificar tu usuario. Cierra sesión y vuelve a ingresar.';
  end if;
  select * into v_nota from public.evento_anotaciones_pago where id = p_id;
  if v_nota.id is null then
    raise exception 'La anotación ya no existe.';
  end if;
  if v_nota.autor_id is distinct from v_usuario.id and not coalesce(v_usuario.es_administrador, false) then
    raise exception 'Solo quien escribió la anotación o un administrador puede eliminarla.';
  end if;
  select * into v_evento from public.solicitudes_evento where id = v_nota.evento_id;

  insert into public.auditoria (documento_id, tipo_doc, documento_nombre, actor_id, accion, detalle, empresa_grupo, pais)
  values (
    v_nota.evento_id, 'evento', coalesce(nullif(v_evento.nombre_evento, ''), '(sin nombre)'), v_usuario.id,
    'anotacion_pago_eliminada',
    format('Anotación de pago eliminada por %s. Texto eliminado: "%s". (Autor original: %s, %s%s)',
      coalesce(v_usuario.nombre, ''), v_nota.texto, v_nota.autor_nombre, to_char(v_nota.creado_en at time zone 'America/Bogota', 'DD/MM/YYYY HH24:MI'),
      case when v_nota.aclarada then '; estaba marcada como aclarada' else '' end),
    nullif(v_evento.empresa_grupo, ''), nullif(v_evento.pais, '')
  );
  delete from public.evento_anotaciones_pago where id = p_id;
end;
$function$;

revoke all on function public.beats_editar_anotacion_pago(uuid, text) from public;
revoke all on function public.beats_eliminar_anotacion_pago(uuid) from public;
grant execute on function public.beats_editar_anotacion_pago(uuid, text) to authenticated;
grant execute on function public.beats_eliminar_anotacion_pago(uuid) to authenticated;
