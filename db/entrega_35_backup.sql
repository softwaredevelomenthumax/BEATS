-- =============================================================================
-- Entrega 35 (octubre 2026): Backup y restauración de toda la base de datos.
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE: ejecutarlo a mano en el SQL Editor
-- de Supabase (es idempotente: se puede correr más de una vez). Requiere haber
-- ejecutado antes `agregar_rpc_eliminar_anular_documentos.sql` (usa
-- `beats_usuario_actual`).
--
-- Pantalla «Configuración → Backup» (solo administradores). El navegador no
-- puede hacer un `pg_dump`, y leer las tablas con `.from().select()` NO es una
-- copia confiable: RLS le ocultaría filas al administrador y la lectura no
-- distinguiría tablas nuevas. Por eso el respaldo y la restauración pasan por
-- estas funciones `security definer`, que:
--   · lista TODAS las tablas de `public` (también las que se creen después);
--   · leen cada tabla completa, por páginas con paginación por llave (sin
--     saltar ni repetir filas si alguien trabaja mientras se respalda), y la
--     devuelven como TEXTO json: así los números grandes y los decimales
--     (montos) viajan sin pasar por el `Number` de JavaScript;
--   · restauran con `jsonb_populate_recordset`, con los triggers de usuario
--     apagados durante la carga (si no, `fn_resguardo_edicion_documento` y la
--     inmutabilidad de los documentos firmados rechazarían o alterarían filas)
--     y recuperan las secuencias.
--
-- NO se respaldan: las tablas internas `backups_*` (el historial y el candado de
-- restauración), el esquema `auth` (contraseñas y sesiones de Supabase Auth), el
-- código/secretos de las Edge Functions, ni la definición de funciones, políticas
-- RLS y triggers (eso vive en los `db/*.sql` del proyecto y en los respaldos de
-- la propia plataforma de Supabase).
--
-- Todas exigen ser administrador de alcance completo (`usuarios.es_administrador` y no `administrador_alcance_limitado`). Durante una
-- restauración que reemplaza `usuarios`, el administrador deja de existir un
-- instante: por eso `beats_backup_iniciar_restauracion` deja un candado de
-- máximo 3 horas, ligado a su sesión (`auth.uid()`), que las demás funciones de
-- restauración aceptan mientras dure.
-- =============================================================================

-- 1. Tablas internas (sin políticas: solo se tocan desde estas funciones).
create table if not exists public.backups_registro (
  id uuid primary key default gen_random_uuid(),
  creado_en timestamptz not null default now(),
  origen text not null check (origen in ('manual', 'programado', 'seguridad', 'restauracion')),
  estado text not null check (estado in ('ok', 'error')),
  creado_por_auth_uid uuid,
  creado_por_nombre text,
  nombre_archivo text,
  destino text,
  total_tablas integer,
  total_filas bigint,
  tamano_bytes bigint,
  mensaje text
);
alter table public.backups_registro enable row level security;

create table if not exists public.backups_restauracion_activa (
  auth_uid uuid primary key,
  iniciada_en timestamptz not null default now(),
  expira_en timestamptz not null
);
alter table public.backups_restauracion_activa enable row level security;

-- 2. Control de acceso.
create or replace function public.beats_backup_exigir_admin(p_durante_restauracion boolean default false)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_usuario public.usuarios;
begin
  v_usuario := public.beats_usuario_actual();
  -- Un administrador de ALCANCE LIMITADO (solo ciertos países/empresas) no puede sacar ni reemplazar toda la base.
  if v_usuario.id is not null
     and coalesce(v_usuario.es_administrador, false) is true
     and coalesce((to_jsonb(v_usuario) ->> 'administrador_alcance_limitado')::boolean, false) is not true then
    return;
  end if;
  if p_durante_restauracion and exists (
    select 1 from public.backups_restauracion_activa a where a.auth_uid = auth.uid() and a.expira_en > now()
  ) then
    return;
  end if;
  raise exception 'Solo los administradores (sin alcance limitado) pueden usar las copias de seguridad.';
end;
$function$;

-- 3. Tablas respaldables (todas las de `public`, salvo las internas `backups_*`).
create or replace function public.beats_backup_tablas()
returns text[]
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v text[];
begin
  perform public.beats_backup_exigir_admin(true);
  select coalesce(array_agg(c.relname::text order by c.relname), '{}') into v
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition and c.relname not like 'backups\_%';
  return v;
end;
$function$;

-- 4. Esquema: columnas, llaves, relaciones, enums, conteo exacto por tabla y tamaño.
create or replace function public.beats_backup_esquema()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_n bigint;
  v_cols jsonb;
  v_pk jsonb;
  v_tablas jsonb := '[]'::jsonb;
  v_fk jsonb;
  v_enums jsonb;
begin
  perform public.beats_backup_exigir_admin(true);

  for r in
    select c.oid, c.relname::text as nombre
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition and c.relname not like 'backups\_%'
    order by c.relname
  loop
    execute format('select count(*) from public.%I', r.nombre) into v_n;

    select coalesce(jsonb_agg(jsonb_build_object(
             'nombre', a.attname,
             'tipo', format_type(a.atttypid, a.atttypmod),
             'obligatoria', a.attnotnull,
             'generada', a.attgenerated <> '',
             'identidad', a.attidentity <> ''
           ) order by a.attnum), '[]'::jsonb)
      into v_cols
    from pg_attribute a where a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped;

    select coalesce(jsonb_agg(a.attname order by k.ord), '[]'::jsonb)
      into v_pk
    from pg_index i
      cross join lateral unnest(i.indkey) with ordinality k(attnum, ord)
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
    where i.indrelid = r.oid and i.indisprimary;

    v_tablas := v_tablas || jsonb_build_array(jsonb_build_object(
      'nombre', r.nombre,
      'filas', v_n,
      'bytes', pg_total_relation_size(r.oid),
      'columnas', v_cols,
      'llave', v_pk
    ));
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
           'tabla', cl.relname,
           'columnas', (select jsonb_agg(att.attname order by u.ord)
                        from unnest(co.conkey) with ordinality u(attnum, ord)
                        join pg_attribute att on att.attrelid = co.conrelid and att.attnum = u.attnum),
           'ref_esquema', rn.nspname,
           'ref_tabla', rcl.relname
         )), '[]'::jsonb)
    into v_fk
  from pg_constraint co
    join pg_class cl on cl.oid = co.conrelid
    join pg_namespace ns on ns.oid = cl.relnamespace
    join pg_class rcl on rcl.oid = co.confrelid
    join pg_namespace rn on rn.oid = rcl.relnamespace
  where co.contype = 'f' and ns.nspname = 'public' and cl.relname not like 'backups\_%';

  select coalesce(jsonb_agg(jsonb_build_object(
           'nombre', t.typname,
           'valores', (select jsonb_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid)
         ) order by t.typname), '[]'::jsonb)
    into v_enums
  from pg_type t join pg_namespace n on n.oid = t.typnamespace
  where t.typtype = 'e' and n.nspname = 'public';

  return jsonb_build_object(
    'generado_en', now(),
    'base', current_database(),
    'version_postgres', version(),
    'tablas', v_tablas,
    'relaciones', v_fk,
    'enums', v_enums
  );
end;
$function$;

-- 5. Secuencias (último valor entregado), para dejarlas al día tras restaurar.
create or replace function public.beats_backup_secuencias()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v jsonb;
begin
  perform public.beats_backup_exigir_admin(true);
  select coalesce(jsonb_agg(jsonb_build_object('nombre', sequencename, 'ultimo', last_value) order by sequencename), '[]'::jsonb)
    into v
  from pg_sequences where schemaname = 'public' and last_value is not null;
  return v;
end;
$function$;

-- 6. Lectura de una página de una tabla.
--    p_despues: llave de la última fila ya leída ({"col": valor, ...}; {"ctid": "(0,5)"} en tablas sin llave primaria).
--    Devuelve {"n": filas, "datos": "<arreglo json COMO TEXTO>", "ultima": llave de la última fila}.
create or replace function public.beats_backup_leer(p_tabla text, p_despues jsonb default null, p_limite integer default 200)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_oid oid;
  v_pk text[];
  v_t text;
  v_r text;
  v_p_asc text;
  v_p_desc text;
  v_obj text;
  v_sql text;
  v_res jsonb;
begin
  perform public.beats_backup_exigir_admin(true);
  select c.oid into v_oid
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = p_tabla and c.relkind in ('r', 'p') and not c.relispartition and c.relname not like 'backups\_%';
  if v_oid is null then
    raise exception 'La tabla "%" no existe o no se puede respaldar.', p_tabla;
  end if;
  p_limite := greatest(1, least(coalesce(p_limite, 200), 2000));

  select array_agg(a.attname::text order by k.ord) into v_pk
  from pg_index i
    cross join lateral unnest(i.indkey) with ordinality k(attnum, ord)
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
  where i.indrelid = v_oid and i.indisprimary;

  if v_pk is not null then
    select string_agg(format('__t.%I', x), ', ' order by o),
           string_agg(format('__r.%I', x), ', ' order by o),
           string_agg(format('__p.%I', x), ', ' order by o),
           string_agg(format('__p.%I desc', x), ', ' order by o),
           string_agg(format('%L, __p.%I', x, x), ', ' order by o)
      into v_t, v_r, v_p_asc, v_p_desc, v_obj
    from unnest(v_pk) with ordinality u(x, o);

    v_sql := format(
      $q$ with pagina as (
            select __t.* from public.%1$I __t %2$s order by %3$s limit %4$s
          )
          select jsonb_build_object(
            'n', (select count(*) from pagina),
            'datos', coalesce((select jsonb_agg(to_jsonb(__p) order by %5$s) from pagina __p), '[]'::jsonb)::text,
            'ultima', (select jsonb_build_object(%6$s) from pagina __p order by %7$s limit 1)
          ) $q$,
      p_tabla,
      case when p_despues is null then ''
           else format('cross join jsonb_populate_record(null::public.%I, $1) __r where (%s) > (%s)', p_tabla, v_t, v_r) end,
      v_t, p_limite, v_p_asc, v_obj, v_p_desc);
  else
    -- Sin llave primaria: se pagina por ctid (posición física; estable mientras nadie borre filas).
    v_sql := format(
      $q$ with pagina as (
            select __t.ctid as __k, __t.* from public.%1$I __t %2$s order by __t.ctid limit %3$s
          )
          select jsonb_build_object(
            'n', (select count(*) from pagina),
            'datos', coalesce((select jsonb_agg(to_jsonb(__p) - '__k' order by __p.__k) from pagina __p), '[]'::jsonb)::text,
            'ultima', (select jsonb_build_object('ctid', __p.__k::text) from pagina __p order by __p.__k desc limit 1)
          ) $q$,
      p_tabla,
      case when p_despues is null then '' else 'where __t.ctid > ($1->>''ctid'')::tid' end,
      p_limite);
  end if;

  execute v_sql into v_res using p_despues;
  return v_res;
end;
$function$;

-- 7. Restauración.
create or replace function public.beats_backup_iniciar_restauracion()
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_expira timestamptz := now() + interval '3 hours';
begin
  -- Un administrador la inicia; quien ya tiene un candado vigente puede renovarlo (p. ej. para reintentar tras un error
  -- cuando `usuarios` quedó vacía a medio camino).
  perform public.beats_backup_exigir_admin(true);
  delete from public.backups_restauracion_activa where expira_en <= now();
  insert into public.backups_restauracion_activa (auth_uid, iniciada_en, expira_en)
  values (auth.uid(), now(), v_expira)
  on conflict (auth_uid) do update set iniciada_en = excluded.iniciada_en, expira_en = excluded.expira_en;
  return v_expira;
end;
$function$;

create or replace function public.beats_backup_finalizar_restauracion()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.beats_backup_exigir_admin(true);
  delete from public.backups_restauracion_activa where auth_uid = auth.uid();
end;
$function$;

-- Vacía las tablas indicadas en UNA sola sentencia (sin CASCADE: si alguna tabla que no está en la lista depende de
-- ellas, Postgres aborta en vez de borrar datos que la copia no trae).
create or replace function public.beats_backup_vaciar(p_tablas text[])
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_validas text[];
  v_lista text;
begin
  perform public.beats_backup_exigir_admin(true);
  if not exists (select 1 from public.backups_restauracion_activa a where a.auth_uid = auth.uid() and a.expira_en > now()) then
    raise exception 'Primero inicia la restauración (beats_backup_iniciar_restauracion).';
  end if;
  select array_agg(c.relname::text) into v_validas
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition and c.relname not like 'backups\_%'
    and c.relname = any (p_tablas);
  if v_validas is null or cardinality(v_validas) <> cardinality(p_tablas) then
    raise exception 'La lista incluye tablas que no existen o no se pueden vaciar.';
  end if;
  select string_agg(format('public.%I', t), ', ') into v_lista from unnest(v_validas) t;
  execute 'truncate table ' || v_lista || ' restart identity';
  return cardinality(v_validas);
end;
$function$;

-- Carga una página de filas. p_filas es el arreglo json COMO TEXTO (tal como lo entregó beats_backup_leer).
--   p_modo 'completar'   : inserta lo que falta y NO toca lo existente.
--   p_modo 'sobrescribir': inserta lo que falta y reemplaza lo existente con el mismo id (llave primaria).
create or replace function public.beats_backup_restaurar(p_tabla text, p_filas text, p_modo text default 'completar')
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_oid oid;
  v_filas jsonb;
  v_total integer;
  v_pk text[];
  v_cols text;
  v_set text;
  v_override text := '';
  v_sql text;
  v_n bigint := 0;
  v_replica boolean := false;
  v_triggers text[];
  v_tg text;
begin
  perform public.beats_backup_exigir_admin(true);
  if p_modo not in ('completar', 'sobrescribir') then
    raise exception 'Modo de restauración desconocido: %', p_modo;
  end if;
  if not exists (select 1 from public.backups_restauracion_activa a where a.auth_uid = auth.uid() and a.expira_en > now()) then
    raise exception 'Primero inicia la restauración (beats_backup_iniciar_restauracion).';
  end if;
  select c.oid into v_oid
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = p_tabla and c.relkind in ('r', 'p') and not c.relispartition and c.relname not like 'backups\_%';
  if v_oid is null then
    raise exception 'La tabla "%" no existe o no se puede restaurar.', p_tabla;
  end if;

  v_filas := p_filas::jsonb;
  v_total := jsonb_array_length(v_filas);
  if v_total = 0 then
    return jsonb_build_object('recibidas', 0, 'escritas', 0, 'sin_triggers', null);
  end if;

  -- Solo las columnas que la copia trae Y que la tabla puede recibir (las generadas se recalculan; una columna nueva
  -- que la copia no conoce queda con su valor por defecto en vez de NULL).
  select string_agg(format('%I', a.attname), ', ' order by a.attnum) into v_cols
  from pg_attribute a
  where a.attrelid = v_oid and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
    and exists (select 1 from jsonb_object_keys(v_filas -> 0) k where k = a.attname);
  if v_cols is null then
    raise exception 'La copia de "%" no trae ninguna columna que exista hoy en la tabla.', p_tabla;
  end if;
  if exists (select 1 from pg_attribute a where a.attrelid = v_oid and a.attnum > 0 and not a.attisdropped and a.attidentity = 'a') then
    v_override := ' overriding system value';
  end if;

  select array_agg(a.attname::text order by k.ord) into v_pk
  from pg_index i
    cross join lateral unnest(i.indkey) with ordinality k(attnum, ord)
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
  where i.indrelid = v_oid and i.indisprimary;

  -- Triggers de usuario apagados durante la carga: `session_replication_role = replica` si el rol puede (también apaga
  -- las llaves foráneas, útil con referencias circulares); si no, se apaga cada trigger de usuario de esta tabla y se
  -- vuelve a encender al terminar (si algo falla, la transacción entera se revierte y quedan como estaban).
  begin
    perform set_config('session_replication_role', 'replica', true);
    v_replica := current_setting('session_replication_role') = 'replica';
  exception when others then
    v_replica := false;
  end;
  if not v_replica then
    select array_agg(t.tgname::text) into v_triggers
    from pg_trigger t where t.tgrelid = v_oid and not t.tgisinternal and t.tgenabled <> 'D';
    foreach v_tg in array coalesce(v_triggers, '{}') loop
      execute format('alter table public.%I disable trigger %I', p_tabla, v_tg);
    end loop;
  end if;

  if v_pk is null then
    -- Sin llave primaria no hay cómo reconocer una fila repetida: se compara el contenido completo.
    v_sql := format(
      'insert into public.%1$I (%2$s)%3$s select %2$s from jsonb_populate_recordset(null::public.%1$I, $1::jsonb) __f
         where not exists (select 1 from public.%1$I __e where to_jsonb(__e) = to_jsonb(__f))',
      p_tabla, v_cols, v_override);
  else
    select string_agg(format('%1$I = excluded.%1$I', a.attname), ', ' order by a.attnum) into v_set
    from pg_attribute a
    where a.attrelid = v_oid and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
      and exists (select 1 from jsonb_object_keys(v_filas -> 0) k where k = a.attname)
      and a.attname <> all (v_pk);
    v_sql := format(
      'insert into public.%1$I (%2$s)%3$s select %2$s from jsonb_populate_recordset(null::public.%1$I, $1::jsonb) __f',
      p_tabla, v_cols, v_override);
    if p_modo = 'sobrescribir' and v_set is not null then
      v_sql := v_sql || format(' on conflict (%s) do update set %s', (select string_agg(format('%I', x), ', ') from unnest(v_pk) x), v_set);
    else
      v_sql := v_sql || ' on conflict do nothing';
    end if;
  end if;

  execute v_sql using p_filas;
  get diagnostics v_n = row_count;

  if not v_replica then
    foreach v_tg in array coalesce(v_triggers, '{}') loop
      execute format('alter table public.%I enable trigger %I', p_tabla, v_tg);
    end loop;
  end if;

  return jsonb_build_object('recibidas', v_total, 'escritas', v_n, 'sin_triggers', case when v_replica then 'replica' else 'por_tabla' end);
end;
$function$;

create or replace function public.beats_backup_ajustar_secuencias(p_secuencias jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s jsonb;
  v_reg regclass;
  v_n integer := 0;
begin
  perform public.beats_backup_exigir_admin(true);
  for s in select * from jsonb_array_elements(coalesce(p_secuencias, '[]'::jsonb)) loop
    v_reg := to_regclass(format('public.%I', s ->> 'nombre'));
    if v_reg is not null and (s ->> 'ultimo') is not null then
      perform setval(v_reg, (s ->> 'ultimo')::bigint, true);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$function$;

-- 8. Historial de copias y restauraciones.
create or replace function public.beats_backup_registrar(
  p_origen text, p_estado text, p_nombre_archivo text, p_destino text,
  p_tablas integer, p_filas bigint, p_bytes bigint, p_mensaje text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_usuario public.usuarios;
  v_id uuid;
begin
  perform public.beats_backup_exigir_admin(true);
  v_usuario := public.beats_usuario_actual();
  insert into public.backups_registro
    (origen, estado, creado_por_auth_uid, creado_por_nombre, nombre_archivo, destino, total_tablas, total_filas, tamano_bytes, mensaje)
  values
    (p_origen, p_estado, auth.uid(),
     coalesce(to_jsonb(v_usuario) ->> 'nombre', to_jsonb(v_usuario) ->> 'nombre_completo', to_jsonb(v_usuario) ->> 'email'),
     p_nombre_archivo, p_destino, p_tablas, p_filas, p_bytes, p_mensaje)
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.beats_backup_historial(p_limite integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v jsonb;
begin
  perform public.beats_backup_exigir_admin(true);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.creado_en desc), '[]'::jsonb) into v
  from (select * from public.backups_registro order by creado_en desc limit greatest(1, least(coalesce(p_limite, 50), 500))) x;
  return v;
end;
$function$;

-- 9. Permisos: solo usuarios autenticados (cada función vuelve a exigir ser administrador).
revoke all on function public.beats_backup_exigir_admin(boolean) from public, anon, authenticated;
revoke all on function public.beats_backup_tablas() from public, anon;
revoke all on function public.beats_backup_esquema() from public, anon;
revoke all on function public.beats_backup_secuencias() from public, anon;
revoke all on function public.beats_backup_leer(text, jsonb, integer) from public, anon;
revoke all on function public.beats_backup_iniciar_restauracion() from public, anon;
revoke all on function public.beats_backup_finalizar_restauracion() from public, anon;
revoke all on function public.beats_backup_vaciar(text[]) from public, anon;
revoke all on function public.beats_backup_restaurar(text, text, text) from public, anon;
revoke all on function public.beats_backup_ajustar_secuencias(jsonb) from public, anon;
revoke all on function public.beats_backup_registrar(text, text, text, text, integer, bigint, bigint, text) from public, anon;
revoke all on function public.beats_backup_historial(integer) from public, anon;

grant execute on function public.beats_backup_tablas() to authenticated;
grant execute on function public.beats_backup_esquema() to authenticated;
grant execute on function public.beats_backup_secuencias() to authenticated;
grant execute on function public.beats_backup_leer(text, jsonb, integer) to authenticated;
grant execute on function public.beats_backup_iniciar_restauracion() to authenticated;
grant execute on function public.beats_backup_finalizar_restauracion() to authenticated;
grant execute on function public.beats_backup_vaciar(text[]) to authenticated;
grant execute on function public.beats_backup_restaurar(text, text, text) to authenticated;
grant execute on function public.beats_backup_ajustar_secuencias(jsonb) to authenticated;
grant execute on function public.beats_backup_registrar(text, text, text, text, integer, bigint, bigint, text) to authenticated;
grant execute on function public.beats_backup_historial(integer) to authenticated;

notify pgrst, 'reload schema';
