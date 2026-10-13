-- =============================================================================
-- Entrega 20 (octubre 2026) — migraciones a ejecutar A MANO en el SQL Editor de
-- Supabase. TODO es idempotente (se puede ejecutar más de una vez sin riesgo).
--
-- Qué corrige / agrega:
--
--   1. ERROR AL ENVIAR DIRECTO A APROBACIÓN
--      «column "documento_ref_tipo" is of type tipo_doc but expression is of
--      type text».  `beats_notificar_tarea_pendiente` insertaba su parámetro
--      `p_tipo` (text) en `notificaciones.documento_ref_tipo` (enum `tipo_doc`)
--      sin convertirlo. Se corrige con `p_tipo::public.tipo_doc`.
--      (La aplicación ya NO depende de esto para enviar —ahora crea el documento
--      como borrador, crea la cadena y recién entonces lo pasa a Pendiente—, pero
--      el trigger sigue existiendo y debe quedar sano.)
--
--   2. ERROR AL GUARDAR UN CAF
--      «Could not find the 'contraparte_ciudad' column of 'cafs' in the schema
--      cache».  Las columnas de la contraparte del CAF las agrega
--      `agregar_contraparte_caf.sql`; aquí se repiten (idempotente) y se recarga
--      la caché de esquema de PostgREST (`notify pgrst, 'reload schema'`), que es
--      lo que suele faltar cuando la columna ya existe pero la API no la ve.
--
--   3. CATÁLOGO «TIPOS DE CONTRATO» (lista "Tipo de contrato" del CAF)
--      Se agrega el valor `tiposContrato` al enum `catalogo_simple`. IMPORTANTE:
--      Postgres no permite USAR un valor de enum en la misma transacción en la
--      que se agrega; por eso los valores iniciales de la lista están en un
--      archivo APARTE (`sembrar_tipos_contrato.sql`), que se ejecuta DESPUÉS de
--      este (o, si prefieres, los agregas a mano desde Configuración de Campos →
--      Catálogos de opciones → «Tipos de contrato (CAF)»).
--
-- Antes de ejecutar (opcional), para ver el estado actual:
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'cafs' and column_name like 'contraparte_%';
--   select unnest(enum_range(null::catalogo_simple))::text order by 1;
-- =============================================================================

-- 3 (primero, porque ALTER TYPE ... ADD VALUE no tolera estar dentro de un bloque con otros usos)
alter type catalogo_simple add value if not exists 'tiposContrato';

-- 2. Columnas de la contraparte del CAF.
alter table public.cafs
  add column if not exists contraparte_numero_documento text,
  add column if not exists contraparte_pais text,
  add column if not exists contraparte_estado_provincia text,
  add column if not exists contraparte_ciudad text,
  add column if not exists termino_contrato_determinable boolean not null default true;

-- 1. Aviso de tarea pendiente a los usuarios activos con el rol de la etapa.
create or replace function public.beats_notificar_tarea_pendiente(p_tipo text, p_tabla text, p_doc_id uuid, p_rol text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row    jsonb;
  v_nombre text;
begin
  execute format('select to_jsonb(t) from public.%I t where t.id = $1', p_tabla) into v_row using p_doc_id;
  if v_row is null or v_row->>'estado' is distinct from 'Pendiente' then
    return; -- borrador u otro estado: todavía no hay tarea de firma
  end if;

  v_nombre := coalesce(
    nullif(v_row->>'nombre_evento', ''),
    nullif(concat_ws(' · ', nullif(v_row->>'codigo_documento', ''), nullif(v_row->>'compania_nombre', '')), ''),
    nullif(concat_ws(' · ', nullif(v_row->>'hcp_nombre_completo', ''), nullif(v_row->>'nombre_evento_servicio', '')), ''),
    nullif(concat_ws(' · ', nullif(v_row->>'consultor_nombre', ''), nullif(v_row->>'compania_nombre', '')), ''),
    'Documento'
  );

  insert into public.notificaciones (para_usuario_id, tipo, mensaje, documento_ref_tipo, documento_ref_id)
  select u.id,
         'tarea_pendiente',
         format('"%s" está esperando tu aprobación.', v_nombre),
         p_tipo::public.tipo_doc,          -- <-- la corrección: text -> enum
         p_doc_id
    from public.usuarios u
   where u.rol::text = p_rol
     and coalesce(u.activo, true) is true;
end;
$function$;

-- Los 4 triggers de "primera etapa" (se recrean idénticos, pasando el rol como text).
create or replace function public.fn_notificar_primera_etapa_evento()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.orden = 1 then perform public.beats_notificar_tarea_pendiente('evento', 'solicitudes_evento', new.evento_id, new.rol_requerido::text); end if;
  return new;
end;
$function$;

create or replace function public.fn_notificar_primera_etapa_caf()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.orden = 1 then perform public.beats_notificar_tarea_pendiente('caf', 'cafs', new.caf_id, new.rol_requerido::text); end if;
  return new;
end;
$function$;

create or replace function public.fn_notificar_primera_etapa_convenio()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.orden = 1 then perform public.beats_notificar_tarea_pendiente('convenio', 'convenios_pago_hcp', new.convenio_id, new.rol_requerido::text); end if;
  return new;
end;
$function$;

create or replace function public.fn_notificar_primera_etapa_convenio_hcp()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.orden = 1 then perform public.beats_notificar_tarea_pendiente('convenioHCP', 'convenios_hcp', new.convenio_hcp_id, new.rol_requerido::text); end if;
  return new;
end;
$function$;

-- Recarga la caché de esquema de la API (PostgREST): sin esto, columnas nuevas
-- siguen dando «Could not find the '...' column ... in the schema cache».
notify pgrst, 'reload schema';

-- Verificación opcional:
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'cafs' and column_name like 'contraparte_%' order by 1;
--   -- deben aparecer: contraparte_ciudad, contraparte_estado_provincia, contraparte_numero_documento, contraparte_pais (+ las que ya tenía)
--   select 'tiposContrato' = any (enum_range(null::catalogo_simple)::text[]) as enum_ok;
