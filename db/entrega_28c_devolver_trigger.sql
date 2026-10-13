-- =============================================================================
-- Devolver / editar un documento Devuelto / enmienda — corrige el trigger real
-- `fn_resguardo_edicion_documento` (octubre 2026).
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Ejecutar a mano en el SQL Editor de
-- Supabase (idempotente), DESPUÉS de `entrega_28b_devolver_documento.sql`.
--
-- Causa del error «No tienes permiso para modificar este documento en su estado
-- actual.»: el trigger solo conocía los estados Borrador y Rechazado (y la
-- ventana de adenda sobre un Aprobado). El estado «Devuelto» (y la enmienda
-- sobre un Pendiente con firmas) se agregaron después y el trigger los trataba
-- como «sin permiso»: no se podía pasar de Pendiente a Devuelto ni editar un
-- Devuelto. Además `beats_devolver_documento` / `beats_anular_documento`
-- (security definer) no activaban la señal `beats.rpc_aprobacion` que el
-- trigger respeta para las funciones del servidor.
--
-- Qué hace este archivo:
--   1. `beats_devolver_documento` y `beats_anular_documento` activan
--      `beats.rpc_aprobacion` (solo dentro de su transacción) antes del UPDATE.
--   2. El trigger conserva TODAS las reglas existentes y agrega:
--        - Devuelto: el creador (o un Administrador) puede editarlo y guardarlo
--          como Devuelto o reenviarlo a Pendiente (nada más).
--        - Enmienda: el creador (o un Administrador) puede abrir la ventana de
--          enmienda sobre un Pendiente (el estado sigue Pendiente) y, mientras
--          esté vigente, editarlo y reenviarlo (el estado sigue Pendiente).
-- Requiere `beats_usuario_actual()` (de agregar_rpc_eliminar_anular_documentos.sql).
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

  perform set_config('beats.rpc_aprobacion', 'on', true);
  execute format('update public.%I set estado = ''Devuelto'' where id = $1', v_tabla) using p_id;
end;
$function$;

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

  perform set_config('beats.rpc_aprobacion', 'on', true);
  execute format(
    'update public.%I set estado = ''Anulado'', motivo_anulacion = $2, anulado_por_id = $3, anulado_en = now() where id = $1',
    v_tabla
  ) using p_id, btrim(p_motivo), v_usuario.id;
end;
$function$;

create or replace function public.fn_resguardo_edicion_documento()
 returns trigger
 language plpgsql
as $function$
declare
  v_admin boolean := coalesce((public.beats_usuario_actual()).es_administrador, false);
  v_yo uuid := current_usuario_id();
begin
  if current_setting('beats.rpc_aprobacion', true) = 'on' then
    return new;
  end if;

  if v_yo = old.creado_por_id and old.estado in ('Borrador', 'Rechazado') then
    if old.estado = 'Borrador' and new.estado not in ('Borrador', 'Pendiente') then
      raise exception 'Desde Borrador solo puedes guardar (Borrador) o enviar a aprobación (Pendiente).';
    end if;
    if old.estado = 'Rechazado' and new.estado not in ('Rechazado', 'Pendiente') then
      raise exception 'Un documento Rechazado solo puede corregirse y reenviarse a Pendiente.';
    end if;
    return new;
  end if;

  -- Devuelto (suspendido para corrección): igual que un Borrador, por el creador o un Administrador.
  if (v_yo = old.creado_por_id or v_admin) and old.estado = 'Devuelto' then
    if new.estado not in ('Devuelto', 'Pendiente') then
      raise exception 'Un documento Devuelto solo puede corregirse y reenviarse a Pendiente.';
    end if;
    return new;
  end if;

  -- Ventana de adenda (ver db/adenda_generalizada.sql) sobre un documento Aprobado.
  if v_yo = old.creado_por_id
     and old.estado = 'Aprobado'
     and old.adenda_ventana_actor_id = v_yo
     and old.adenda_ventana_expira_en is not null
     and old.adenda_ventana_expira_en > now()
  then
    if new.estado <> 'Pendiente' then
      raise exception 'Mientras hay una adenda en curso, el documento solo puede reenviarse a Pendiente.';
    end if;
    return new;
  end if;

  -- Enmienda sobre un Pendiente con firmas: abrir la ventana (el estado sigue Pendiente)...
  if (v_yo = old.creado_por_id or v_admin) and old.estado = 'Pendiente' and new.estado = 'Pendiente'
     and new.adenda_ventana_actor_id = v_yo
     and (old.adenda_ventana_expira_en is null or old.adenda_ventana_expira_en <= now())
  then
    return new;
  end if;
  -- ...y, mientras esté vigente, editarlo y reenviarlo (sigue Pendiente).
  if old.estado = 'Pendiente' and new.estado = 'Pendiente'
     and old.adenda_ventana_actor_id = v_yo
     and old.adenda_ventana_expira_en is not null
     and old.adenda_ventana_expira_en > now()
  then
    return new;
  end if;

  raise exception 'No tienes permiso para modificar este documento en su estado actual.';
end;
$function$;

notify pgrst, 'reload schema';
