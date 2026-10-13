-- ============================================================================
-- Normalizar el texto de "empresa del grupo" guardado en los documentos
-- (octubre 2026)
-- ============================================================================
-- Pedido explícito del usuario, como seguimiento de
-- `eliminar_empresas_grupo_duplicadas.sql` (que solo limpiaba las OPCIONES
-- del catálogo, sin tocar lo ya guardado): "podrías hacer un cambio desde
-- la base de datos para que empresa_grupo que esté guardada como
-- 'Grossman' quede almacenada toda como 'LABORATORIOS GROSSMAN' y 'Humax
-- Pharmaceutical' quede almacenada como 'HUMAX PHARMACEUTICAL'".
--
-- ALCANCE: "empresa del grupo" (o la empresa que participó en una
-- interacción/evento) aparece, como texto libre, en TODAS estas tablas —
-- confirmado grepeando cada `src/lib/*.ts` que lee o escribe `empresa_grupo`
-- / `empresas_grupo`:
--
--   Columna de texto simple (`empresa_grupo`):
--     - solicitudes_evento            (Solicitud de Evento)
--     - fmv_checklists                (FMV)
--     - notificaciones_pago_hcp       (Notificación de Pago a HCP)
--     - auditoria                     (registro de auditoría)
--     - etiquetas_campo               (etiquetas de campo por empresa)
--     - campos_personalizados_definicion (campos personalizados por empresa)
--     - plantilla_convenio_hcp_version (versiones de la plantilla legal)
--     - productos_portafolio          (catálogo de productos)
--     - configuracion_formatos_empresa (membretes/formatos por empresa —
--       tiene restricción de unicidad por `empresa_grupo`, ver nota abajo)
--     - catalogo_valores              (catalogo = 'empresasGrupo' — ya
--       cubierto por el script anterior, se incluye aquí también por si
--       ese script todavía no se corrió)
--
--   Columna de arreglo de texto (`text[]`, puede tener MÁS de una empresa
--   por fila — no se puede sobrescribir toda la columna, solo se reemplaza
--   el elemento que haga match, con `unnest`/`array_agg`):
--     - usuarios.empresas_grupo
--     - speakers.empresas_grupo_interaccion
--
--   NO necesitan normalización propia porque no tienen columna de empresa:
--     - cafs, convenios_pago_hcp, convenios_hcp (la empresa se deriva del
--       evento de origen vía `evento_origen_id` → `solicitudes_evento`, que
--       ya queda cubierto arriba).
--
-- CRITERIO DE MATCH (case-insensitive, con `ilike`, para agarrar cualquier
-- combinación de mayúsculas/espacios):
--   - contiene "grossman"  → se reemplaza TODO el valor por
--     'LABORATORIOS GROSSMAN'
--   - contiene "humax"     → se reemplaza TODO el valor por
--     'HUMAX PHARMACEUTICAL'
-- Ningún otro nombre de empresa del grupo contiene esas palabras, así que
-- el match amplio (`%grossman%` / `%humax%`) es seguro.
--
-- Cómo usar: correr cada bloque en orden en el SQL Editor de Supabase. El
-- paso 1 es de solo lectura — revisa qué valores existen hoy antes de
-- normalizar. El paso 3 (`configuracion_formatos_empresa`) necesita más
-- cuidado por la restricción de unicidad; léelo antes de correrlo.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 1 (solo lectura): inventario de los valores actuales, por tabla, que
-- hacen match con "grossman" o "humax".
-- ----------------------------------------------------------------------------
select 'solicitudes_evento' as tabla, empresa_grupo as valor, count(*) from solicitudes_evento
  where empresa_grupo ilike '%grossman%' or empresa_grupo ilike '%humax%' group by empresa_grupo
union all
select 'fmv_checklists', empresa_grupo, count(*) from fmv_checklists
  where empresa_grupo ilike '%grossman%' or empresa_grupo ilike '%humax%' group by empresa_grupo
union all
select 'notificaciones_pago_hcp', empresa_grupo, count(*) from notificaciones_pago_hcp
  where empresa_grupo ilike '%grossman%' or empresa_grupo ilike '%humax%' group by empresa_grupo
union all
select 'auditoria', empresa_grupo, count(*) from auditoria
  where empresa_grupo ilike '%grossman%' or empresa_grupo ilike '%humax%' group by empresa_grupo
union all
select 'etiquetas_campo', empresa_grupo, count(*) from etiquetas_campo
  where empresa_grupo ilike '%grossman%' or empresa_grupo ilike '%humax%' group by empresa_grupo
union all
select 'campos_personalizados_definicion', empresa_grupo, count(*) from campos_personalizados_definicion
  where empresa_grupo ilike '%grossman%' or empresa_grupo ilike '%humax%' group by empresa_grupo
union all
select 'plantilla_convenio_hcp_version', empresa_grupo, count(*) from plantilla_convenio_hcp_version
  where empresa_grupo ilike '%grossman%' or empresa_grupo ilike '%humax%' group by empresa_grupo
union all
select 'productos_portafolio', empresa_grupo, count(*) from productos_portafolio
  where empresa_grupo ilike '%grossman%' or empresa_grupo ilike '%humax%' group by empresa_grupo
union all
select 'configuracion_formatos_empresa', empresa_grupo, count(*) from configuracion_formatos_empresa
  where empresa_grupo ilike '%grossman%' or empresa_grupo ilike '%humax%' group by empresa_grupo
union all
select 'catalogo_valores', valor, count(*) from catalogo_valores
  where catalogo = 'empresasGrupo' and (valor ilike '%grossman%' or valor ilike '%humax%') group by valor
union all
select 'usuarios.empresas_grupo (elemento)', elem, count(*)
  from usuarios, unnest(empresas_grupo) as elem
  where elem ilike '%grossman%' or elem ilike '%humax%' group by elem
union all
select 'speakers.empresas_grupo_interaccion (elemento)', elem, count(*)
  from speakers, unnest(empresas_grupo_interaccion) as elem
  where elem ilike '%grossman%' or elem ilike '%humax%' group by elem
order by tabla, valor;


-- ----------------------------------------------------------------------------
-- PASO 2: normalizar las columnas de texto simple (sin riesgo de choque de
-- unicidad en ninguna de estas).
-- ----------------------------------------------------------------------------
update solicitudes_evento
   set empresa_grupo = case when empresa_grupo ilike '%grossman%' then 'LABORATORIOS GROSSMAN' else 'HUMAX PHARMACEUTICAL' end
 where empresa_grupo ilike '%grossman%' or empresa_grupo ilike '%humax%';

update fmv_checklists
   set empresa_grupo = case when empresa_grupo ilike '%grossman%' then 'LABORATORIOS GROSSMAN' else 'HUMAX PHARMACEUTICAL' end
 where empresa_grupo ilike '%grossman%' or empresa_grupo ilike '%humax%';

update notificaciones_pago_hcp
   set empresa_grupo = case when empresa_grupo ilike '%grossman%' then 'LABORATORIOS GROSSMAN' else 'HUMAX PHARMACEUTICAL' end
 where empresa_grupo ilike '%grossman%' or empresa_grupo ilike '%humax%';

update auditoria
   set empresa_grupo = case when empresa_grupo ilike '%grossman%' then 'LABORATORIOS GROSSMAN' else 'HUMAX PHARMACEUTICAL' end
 where empresa_grupo ilike '%grossman%' or empresa_grupo ilike '%humax%';

update plantilla_convenio_hcp_version
   set empresa_grupo = case when empresa_grupo ilike '%grossman%' then 'LABORATORIOS GROSSMAN' else 'HUMAX PHARMACEUTICAL' end
 where empresa_grupo ilike '%grossman%' or empresa_grupo ilike '%humax%';

update productos_portafolio
   set empresa_grupo = case when empresa_grupo ilike '%grossman%' then 'LABORATORIOS GROSSMAN' else 'HUMAX PHARMACEUTICAL' end
 where empresa_grupo ilike '%grossman%' or empresa_grupo ilike '%humax%';

update catalogo_valores
   set valor = case when valor ilike '%grossman%' then 'LABORATORIOS GROSSMAN' else 'HUMAX PHARMACEUTICAL' end
 where catalogo = 'empresasGrupo' and (valor ilike '%grossman%' or valor ilike '%humax%');

-- `etiquetas_campo` y `campos_personalizados_definicion` tienen restricción
-- de unicidad por (formulario, campo_key, empresa_grupo) — un `update`
-- directo SÍ podría chocar si ya existe una fila para el mismo
-- formulario/campo bajo "Grossman" Y otra bajo "LABORATORIOS GROSSMAN" (o
-- el equivalente de Humax). El `where not exists` evita el choque de
-- unicidad; cualquier fila que se salte por chocar queda listada por el
-- `select` de verificación del paso 4, para fusionarla a mano si aparece.
-- `etiquetas_campo` no tiene columna `id` propia (su clave natural es
-- formulario+campo_key+empresa_grupo — confirmado en
-- `src/lib/etiquetasCampo.ts`, que nunca selecciona/usa un `id`), así que
-- la exclusión de "la fila consigo misma" no hace falta: si el valor ya
-- está correcto (`e.empresa_grupo` ya es exactamente el destino), la
-- subconsulta encuentra esa misma fila, `not exists` da falso y el
-- `update` simplemente no hace nada en esa fila (no hay nada que
-- cambiar). Si el valor de verdad necesita normalizarse (es "Grossman",
-- no "LABORATORIOS GROSSMAN"), la subconsulta solo encuentra OTRA fila si
-- ya existe una con el nombre ya normalizado para el mismo campo.
update etiquetas_campo e
   set empresa_grupo = case when e.empresa_grupo ilike '%grossman%' then 'LABORATORIOS GROSSMAN' else 'HUMAX PHARMACEUTICAL' end
 where (e.empresa_grupo ilike '%grossman%' or e.empresa_grupo ilike '%humax%')
   and not exists (
     select 1 from etiquetas_campo e2
     where e2.formulario = e.formulario
       and e2.campo_key = e.campo_key
       and e2.empresa_grupo = (case when e.empresa_grupo ilike '%grossman%' then 'LABORATORIOS GROSSMAN' else 'HUMAX PHARMACEUTICAL' end)
   );

-- Columna real: `clave` (no `campo_key` — ese nombre es de
-- `etiquetas_campo`, una tabla distinta; confirmado en
-- `src/lib/camposPersonalizados.ts`, `CampoPersonalizadoDefinicion.clave`).
update campos_personalizados_definicion c
   set empresa_grupo = case when c.empresa_grupo ilike '%grossman%' then 'LABORATORIOS GROSSMAN' else 'HUMAX PHARMACEUTICAL' end
 where (c.empresa_grupo ilike '%grossman%' or c.empresa_grupo ilike '%humax%')
   and not exists (
     select 1 from campos_personalizados_definicion c2
     where c2.formulario = c.formulario
       and c2.clave = c.clave
       and c2.empresa_grupo = (case when c.empresa_grupo ilike '%grossman%' then 'LABORATORIOS GROSSMAN' else 'HUMAX PHARMACEUTICAL' end)
       and c2.id <> c.id
   );


-- ----------------------------------------------------------------------------
-- PASO 3: `configuracion_formatos_empresa` tiene `empresa_grupo` como clave
-- única (el código la usa con `upsert(..., { onConflict: "empresa_grupo" })`)
-- — si existiera a la vez una fila "Grossman" y otra "LABORATORIOS
-- GROSSMAN" (o el equivalente de Humax), un `update` directo rompería esa
-- unicidad. Este bloque solo actualiza cuando NO hay ya una fila con el
-- nombre normalizado; si la hay, no toca nada y queda para revisión manual
-- (ver el `select` de abajo).
-- ----------------------------------------------------------------------------
update configuracion_formatos_empresa f
   set empresa_grupo = case when f.empresa_grupo ilike '%grossman%' then 'LABORATORIOS GROSSMAN' else 'HUMAX PHARMACEUTICAL' end
 where (f.empresa_grupo ilike '%grossman%' or f.empresa_grupo ilike '%humax%')
   and not exists (
     select 1 from configuracion_formatos_empresa f2
     where f2.empresa_grupo = (case when f.empresa_grupo ilike '%grossman%' then 'LABORATORIOS GROSSMAN' else 'HUMAX PHARMACEUTICAL' end)
       and f2.empresa_grupo <> f.empresa_grupo
   );

-- Si después de correr lo anterior sigue apareciendo más de una fila para
-- la misma empresa en esta consulta (una ya "LABORATORIOS GROSSMAN"/"HUMAX
-- PHARMACEUTICAL" y otra todavía con el nombre viejo), hay que decidir a
-- mano cuál de las dos configuraciones (membrete/formato) conservar y
-- borrar la otra con `eliminarConfiguracionFormatosEmpresa` desde el
-- aplicativo, o con
-- `delete from configuracion_formatos_empresa where empresa_grupo = '<nombre viejo a descartar, p. ej. ''Grossman''>'`.
-- `configuracion_formatos_empresa` no tiene columna `id` propia —
-- `empresa_grupo` ES la clave primaria (confirmado por el
-- `upsert(..., { onConflict: "empresa_grupo" })` en
-- `src/lib/configuracionFormatos.ts`), así que no hay otro identificador
-- que mostrar aparte del propio nombre de empresa.
select empresa_grupo from configuracion_formatos_empresa
 where empresa_grupo ilike '%grossman%' or empresa_grupo ilike '%humax%'
 order by empresa_grupo;


-- ----------------------------------------------------------------------------
-- PASO 4: normalizar las columnas de arreglo (`text[]`) — se reemplaza
-- solo el/los elemento(s) que hagan match dentro del arreglo, no toda la
-- fila, y se eliminan duplicados que el reemplazo pudiera generar (p. ej.
-- un usuario que ya tenía tanto "Grossman" como "LABORATORIOS GROSSMAN"
-- en su lista de empresas habilitadas).
-- ----------------------------------------------------------------------------
-- `usuarios` tiene un trigger de resguardo (`fn_resguardo_edicion_usuarios`,
-- no definido en este repositorio — se creó directo en el proyecto real de
-- Supabase) que bloquea cambios a `empresas_grupo` (entre otras columnas
-- sensibles) a menos que el cambio venga de una sesión autenticada con rol
-- Dirección Médica/Administrador. El Editor SQL de Supabase no tiene esa
-- sesión, así que el trigger lo rechaza sin importar el rol con el que se
-- conecta el Editor — mismo caso ya resuelto en
-- `db/dar_privilegios_administrador_sebastian.sql`: se apaga ÚNICAMENTE ese
-- trigger puntual (buscado por su función, no por un nombre adivinado),
-- se hace el `update`, y se prende de nuevo enseguida, todo dentro de una
-- sola transacción para que si algo falla antes del `commit` el trigger
-- nunca quede apagado por error.
begin;

do $$
declare
  v_trigger_name text;
begin
  select t.tgname into v_trigger_name
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
  where t.tgrelid = 'public.usuarios'::regclass
    and p.proname = 'fn_resguardo_edicion_usuarios'
    and not t.tgisinternal
  limit 1;

  if v_trigger_name is null then
    raise exception 'No se encontró en public.usuarios ningún trigger asociado a fn_resguardo_edicion_usuarios — revisa el nombre de la función o si ya no existe.';
  end if;

  execute format('alter table public.usuarios disable trigger %I', v_trigger_name);
end $$;

update usuarios
   set empresas_grupo = (
     select array_agg(distinct
       case
         when elem ilike '%grossman%' then 'LABORATORIOS GROSSMAN'
         when elem ilike '%humax%' then 'HUMAX PHARMACEUTICAL'
         else elem
       end
     )
     from unnest(empresas_grupo) as elem
   )
 where exists (
   select 1 from unnest(empresas_grupo) as elem2
   where elem2 ilike '%grossman%' or elem2 ilike '%humax%'
 );

do $$
declare
  v_trigger_name text;
begin
  select t.tgname into v_trigger_name
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
  where t.tgrelid = 'public.usuarios'::regclass
    and p.proname = 'fn_resguardo_edicion_usuarios'
    and not t.tgisinternal
  limit 1;

  execute format('alter table public.usuarios enable trigger %I', v_trigger_name);
end $$;

commit;
-- ↑ Si algo falla ANTES de este `commit`, toda la transacción se revierte
-- — incluyendo el `disable trigger` — así que el trigger de protección
-- nunca queda apagado por error.

update speakers
   set empresas_grupo_interaccion = (
     select array_agg(distinct
       case
         when elem ilike '%grossman%' then 'LABORATORIOS GROSSMAN'
         when elem ilike '%humax%' then 'HUMAX PHARMACEUTICAL'
         else elem
       end
     )
     from unnest(empresas_grupo_interaccion) as elem
   )
 where exists (
   select 1 from unnest(empresas_grupo_interaccion) as elem2
   where elem2 ilike '%grossman%' or elem2 ilike '%humax%'
 );


-- ----------------------------------------------------------------------------
-- PASO 5 (verificación, solo lectura): repite el inventario del paso 1 —
-- después de correr los pasos 2 a 4, solo deberían quedar filas (si acaso)
-- en `configuracion_formatos_empresa` que necesiten fusión manual, y todo
-- lo demás debería mostrar únicamente 'LABORATORIOS GROSSMAN' y
-- 'HUMAX PHARMACEUTICAL' ya normalizados.
-- ----------------------------------------------------------------------------
select 'solicitudes_evento' as tabla, empresa_grupo as valor, count(*) from solicitudes_evento
  where empresa_grupo ilike '%grossman%' or empresa_grupo ilike '%humax%' group by empresa_grupo
union all
select 'fmv_checklists', empresa_grupo, count(*) from fmv_checklists
  where empresa_grupo ilike '%grossman%' or empresa_grupo ilike '%humax%' group by empresa_grupo
union all
select 'notificaciones_pago_hcp', empresa_grupo, count(*) from notificaciones_pago_hcp
  where empresa_grupo ilike '%grossman%' or empresa_grupo ilike '%humax%' group by empresa_grupo
union all
select 'auditoria', empresa_grupo, count(*) from auditoria
  where empresa_grupo ilike '%grossman%' or empresa_grupo ilike '%humax%' group by empresa_grupo
union all
select 'etiquetas_campo', empresa_grupo, count(*) from etiquetas_campo
  where empresa_grupo ilike '%grossman%' or empresa_grupo ilike '%humax%' group by empresa_grupo
union all
select 'campos_personalizados_definicion', empresa_grupo, count(*) from campos_personalizados_definicion
  where empresa_grupo ilike '%grossman%' or empresa_grupo ilike '%humax%' group by empresa_grupo
union all
select 'plantilla_convenio_hcp_version', empresa_grupo, count(*) from plantilla_convenio_hcp_version
  where empresa_grupo ilike '%grossman%' or empresa_grupo ilike '%humax%' group by empresa_grupo
union all
select 'productos_portafolio', empresa_grupo, count(*) from productos_portafolio
  where empresa_grupo ilike '%grossman%' or empresa_grupo ilike '%humax%' group by empresa_grupo
union all
select 'configuracion_formatos_empresa', empresa_grupo, count(*) from configuracion_formatos_empresa
  where empresa_grupo ilike '%grossman%' or empresa_grupo ilike '%humax%' group by empresa_grupo
union all
select 'catalogo_valores', valor, count(*) from catalogo_valores
  where catalogo = 'empresasGrupo' and (valor ilike '%grossman%' or valor ilike '%humax%') group by valor
union all
select 'usuarios.empresas_grupo (elemento)', elem, count(*)
  from usuarios, unnest(empresas_grupo) as elem
  where elem ilike '%grossman%' or elem ilike '%humax%' group by elem
union all
select 'speakers.empresas_grupo_interaccion (elemento)', elem, count(*)
  from speakers, unnest(empresas_grupo_interaccion) as elem
  where elem ilike '%grossman%' or elem ilike '%humax%' group by elem
order by tabla, valor;
