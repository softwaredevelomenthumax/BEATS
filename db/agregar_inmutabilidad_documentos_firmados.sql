-- =============================================================================
-- Inmutabilidad de documentos ya firmados/aprobados.
--
-- Pedido explícito del usuario: "Una vez un documento fue firmado o
-- aprobado, la información de la matriz de firmas no debe cambiar; es
-- decir, si por alguna razón uno de los responsables del flujo de
-- aprobación tenía una firma autógrafa 'X', con la cual firmó el
-- documento y luego de un tiempo, en el módulo de 'usuarios y roles',
-- modificó dicha firma, todos los documentos que hayan sido firmados con
-- la firma anterior deben seguir apareciendo así, tal cual. Lo mismo debe
-- pasar si por alguna razón un documento se firmó con unos campos,
-- etiquetas, etc y en un tiempo posterior, el formato se actualiza,
-- adicionando, modificando o quitando algún(os) campos. En esos casos,
-- los formularios que fueron firmados antes de esos cambios, deben
-- permanecer fijos, sin cambios."
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Debe ejecutarse a mano en el
-- SQL Editor del proyecto real de Supabase. Es una migración más grande
-- que las anteriores de esta ronda — lee TODA la nota antes de correrla.
--
-- Qué problema resuelve, en concreto (dos causas de "esto no debería
-- cambiar y cambió", confirmadas en el código fuente real):
--   1. La firma manuscrita de cada firmante en la "Cadena de aprobación"
--      se resuelve HOY en vivo contra `usuarios.firma_id` (ver
--      `FirmaManuscritaUsuario`/`resolverFirmaId` en los 4
--      `Detalle*.tsx` con cadena de aprobación y en
--      `DocumentoImprimible.tsx`) — si un usuario cambia su firma
--      manuscrita en "Usuarios y Roles" DESPUÉS de haber firmado un
--      documento, ese documento, al volver a abrirse, muestra la firma
--      NUEVA, no la que realmente usó al firmar.
--   2. Las etiquetas de campo (`etiquetas_campo`) y los campos
--      personalizados (`campos_personalizados_definicion`) también se
--      resuelven en vivo contra la configuración ACTUAL
--      (`etiquetaEfectiva`/`camposAplicables`) — si Legal/Compliance edita
--      una etiqueta o agrega/quita un campo personalizado después de que
--      un documento ya quedó aprobado, ese documento cambia de apariencia
--      retroactivamente.
--
-- Solución (mismo principio que ya usa esta app para la plantilla legal
-- del Convenio HCP — "cada Convenio HCP concreto congela un snapshot de
-- la versión vigente al momento de firmarse", ver `plantillaConvenioHCP.ts`
-- — aplicado aquí vía TRIGGERS de Postgres en vez de tocar las funciones
-- RPC de aprobación (`resolver_aprobacion_evento`/`_caf`/`_convenio`/
-- `_convenio_hcp`): esta migración NUNCA vio el código fuente real de esas
-- 4 funciones RPC — no existe un archivo en este repo con su definición
-- extraída, a diferencia de `fn_notificar_por_email()` — así que
-- reescribirlas a ciegas sería el mismo riesgo que ya se evitó para la
-- rutina de recordatorios (ver `agregar_recordatorios_documentos_soporte.sql`).
-- Un TRIGGER `before update`, en cambio, se dispara sin importar qué
-- función haya hecho el UPDATE por dentro, así que no hace falta tocar ni
-- arriesgar esas 4 funciones):
--   1. Columna nueva `firma_congelada_id` en las 4 tablas de cadena de
--      aprobación (`evento_aprobaciones`, `caf_aprobaciones`,
--      `convenio_aprobaciones`, `convenio_hcp_aprobaciones`): un trigger
--      `before update` copia `usuarios.firma_id` del resolutor hacia esta
--      columna la primera vez (y cada vez) que el paso pasa a
--      `estado = 'aprobado'`. FMV y Notificación de Pago a HCP NO llevan
--      esta columna porque no tienen cadena de aprobación con firma
--      manuscrita — son de un solo firmante, con "firma electrónica"
--      (checkbox), no una imagen (ver `firma_electronica`/`fecha_firma`
--      en `fmv.ts`/`notificacionPago.ts`).
--   2. Columna nueva `snapshot_formato` (jsonb) en las 6 tablas de
--      documento (`solicitudes_evento`, `cafs`, `fmv_checklists`,
--      `notificaciones_pago_hcp`, `convenios_pago_hcp`, `convenios_hcp`):
--      un trigger `before update` guarda, cada vez que el documento pasa a
--      `estado` en ('Aprobado', 'Completado'), las filas CRUDAS (sin
--      procesar) de `etiquetas_campo` y `campos_personalizados_definicion`
--      vigentes en ese momento para el tipo de documento y la empresa del
--      grupo correspondientes — NO el resultado ya calculado, para poder
--      reutilizar tal cual las mismas funciones del frontend
--      (`etiquetaEfectiva`/`camposAplicables`, en
--      `src/lib/etiquetasCampo.ts`/`camposPersonalizados.ts`) contra el
--      snapshot en vez de contra la configuración en vivo, sin duplicar
--      esa lógica en SQL. `cafs`/`convenios_pago_hcp`/`convenios_hcp` no
--      tienen su propia columna de empresa — se resuelve vía
--      `evento_origen_id` hacia `solicitudes_evento.empresa_grupo`.
--
-- LÍMITES HONESTOS de esta entrega (léelos antes de confiar en esto a
-- ciegas — ver el paso 6, de verificación manual, antes de dar por buena
-- la migración):
--   - Se asume que las columnas `id` de todas las tablas involucradas son
--     `uuid` (como en el resto de migraciones de esta ronda) y que
--     `usuarios.firma_id` es el nombre real de la columna de firma
--     manuscrita (confirmado en `src/hooks/useAuth.tsx`,
--     `s0("firma_id", "firmaId")`). Si tu esquema real difiere, los
--     `alter table`/triggers de abajo fallarán con un error claro en vez
--     de corromper nada — no hacen falta reintentos silenciosos.
--   - El snapshot se vuelve a tomar CADA VEZ que el documento entra de
--     nuevo a 'Aprobado'/'Completado' (no solo la primera vez) — a
--     propósito: si un documento fue devuelto, editado y reenviado a
--     aprobación, el snapshot debe reflejar la configuración vigente en
--     ESA aprobación más reciente, no la de una aprobación anterior ya
--     superada. Mientras el documento esté en un estado no-terminal
--     (Borrador/Pendiente/Devuelto), el snapshot existente (si lo hay, de
--     una aprobación previa) se conserva tal cual — se sobrescribe
--     recién al volver a quedar aprobado.
--   - El front-end (`DocumentoImprimible.tsx` y los 4 `Detalle*.tsx` con
--     cadena de aprobación) TODAVÍA NO se modificó en esta misma entrega
--     para LEER `firma_congelada_id`/`snapshot_formato` — esta migración
--     deja los datos listos del lado de la base, pero conectar la lectura
--     del lado del código (para que la vista impresa/compacta realmente
--     prefiera el snapshot sobre la configuración en vivo cuando el
--     documento ya está en un estado terminal) es un cambio de código
--     aparte, en curso en esta misma ronda de trabajo.
-- =============================================================================

-- 1. Columnas nuevas de firma congelada — las 4 tablas de cadena de
--    aprobación con firma manuscrita.
alter table public.evento_aprobaciones       add column if not exists firma_congelada_id uuid null ;  -- sin FK: guarda el id del archivo de firma (ver corregir_fk_firma_congelada.sql)
alter table public.caf_aprobaciones          add column if not exists firma_congelada_id uuid null ;  -- sin FK: guarda el id del archivo de firma (ver corregir_fk_firma_congelada.sql)
alter table public.convenio_aprobaciones     add column if not exists firma_congelada_id uuid null ;  -- sin FK: guarda el id del archivo de firma (ver corregir_fk_firma_congelada.sql)
alter table public.convenio_hcp_aprobaciones add column if not exists firma_congelada_id uuid null ;  -- sin FK: guarda el id del archivo de firma (ver corregir_fk_firma_congelada.sql)

-- 2. Trigger genérico de firma congelada: se usa igual en las 4 tablas de
--    arriba porque todas comparten los mismos nombres de columna
--    (`estado`, `resuelto_por_id`, `firma_congelada_id`) — confirmado
--    columna por columna contra `src/lib/aprobaciones.ts` y los 4
--    `resolverPaso*` de `src/lib/{evento,caf,convenio,convenioHCP}.ts`.
create or replace function public.fn_congelar_firma_aprobacion()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.estado = 'aprobado' and (old.estado is distinct from new.estado or old.firma_congelada_id is null) then
    select firma_id into new.firma_congelada_id from public.usuarios where id = new.resuelto_por_id;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_congelar_firma on public.evento_aprobaciones;
create trigger trg_congelar_firma before update on public.evento_aprobaciones
  for each row execute function public.fn_congelar_firma_aprobacion();

drop trigger if exists trg_congelar_firma on public.caf_aprobaciones;
create trigger trg_congelar_firma before update on public.caf_aprobaciones
  for each row execute function public.fn_congelar_firma_aprobacion();

drop trigger if exists trg_congelar_firma on public.convenio_aprobaciones;
create trigger trg_congelar_firma before update on public.convenio_aprobaciones
  for each row execute function public.fn_congelar_firma_aprobacion();

drop trigger if exists trg_congelar_firma on public.convenio_hcp_aprobaciones;
create trigger trg_congelar_firma before update on public.convenio_hcp_aprobaciones
  for each row execute function public.fn_congelar_firma_aprobacion();

-- 3. Columna nueva de snapshot de formato — las 6 tablas de documento.
alter table public.solicitudes_evento      add column if not exists snapshot_formato jsonb null;
alter table public.cafs                    add column if not exists snapshot_formato jsonb null;
alter table public.fmv_checklists          add column if not exists snapshot_formato jsonb null;
alter table public.notificaciones_pago_hcp add column if not exists snapshot_formato jsonb null;
alter table public.convenios_pago_hcp      add column if not exists snapshot_formato jsonb null;
alter table public.convenios_hcp           add column if not exists snapshot_formato jsonb null;

-- 4. Función que arma el snapshot (etiquetas + campos personalizados
--    crudos) para un `tipoDoc`/`empresaGrupo` dados — reutilizada por los 6
--    triggers de abajo. `p_empresa_grupo` puede venir vacío/null (se
--    incluyen igual las filas "globales", con `empresa_grupo = ''`, que ya
--    es como `etiquetaEfectiva`/`camposAplicables` las tratan en el
--    frontend).
create or replace function public.fn_armar_snapshot_formato(p_tipo_doc text, p_empresa_grupo text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'etiquetas', coalesce((
      select jsonb_agg(to_jsonb(e))
      from public.etiquetas_campo e
      where e.formulario = p_tipo_doc
        and (e.empresa_grupo = p_empresa_grupo or e.empresa_grupo is null or e.empresa_grupo = '')
    ), '[]'::jsonb),
    'camposPersonalizados', coalesce((
      select jsonb_agg(to_jsonb(c))
      from public.campos_personalizados_definicion c
      where c.formulario = p_tipo_doc
    ), '[]'::jsonb),
    'congeladoEn', now()
  );
$function$;

-- 5. Un trigger por tabla de documento — cada una resuelve su propio
--    `tipoDoc` (literal fijo) y su propia `empresa_grupo` (directa, o vía
--    `evento_origen_id` para CAF/Convenio de Pago a HCP/Convenio HCP, que
--    no tienen columna de empresa propia — confirmado en
--    `src/lib/{caf,convenio,convenioHCP}.ts`, ninguno mapea
--    `empresa_grupo`).
create or replace function public.fn_congelar_snapshot_evento()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.estado in ('Aprobado', 'Completado') and old.estado is distinct from new.estado then
    new.snapshot_formato := public.fn_armar_snapshot_formato('evento', new.empresa_grupo);
  end if;
  return new;
end;
$function$;
drop trigger if exists trg_congelar_snapshot on public.solicitudes_evento;
create trigger trg_congelar_snapshot before update on public.solicitudes_evento
  for each row execute function public.fn_congelar_snapshot_evento();

create or replace function public.fn_congelar_snapshot_fmv()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.estado in ('Aprobado', 'Completado') and old.estado is distinct from new.estado then
    new.snapshot_formato := public.fn_armar_snapshot_formato('fmv', new.empresa_grupo);
  end if;
  return new;
end;
$function$;
drop trigger if exists trg_congelar_snapshot on public.fmv_checklists;
create trigger trg_congelar_snapshot before update on public.fmv_checklists
  for each row execute function public.fn_congelar_snapshot_fmv();

create or replace function public.fn_congelar_snapshot_notificacion_pago()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.estado in ('Aprobado', 'Completado') and old.estado is distinct from new.estado then
    new.snapshot_formato := public.fn_armar_snapshot_formato('notificacionPago', new.empresa_grupo);
  end if;
  return new;
end;
$function$;
drop trigger if exists trg_congelar_snapshot on public.notificaciones_pago_hcp;
create trigger trg_congelar_snapshot before update on public.notificaciones_pago_hcp
  for each row execute function public.fn_congelar_snapshot_notificacion_pago();

create or replace function public.fn_congelar_snapshot_caf()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_empresa text;
begin
  if new.estado in ('Aprobado', 'Completado') and old.estado is distinct from new.estado then
    select empresa_grupo into v_empresa from public.solicitudes_evento where id = new.evento_origen_id;
    new.snapshot_formato := public.fn_armar_snapshot_formato('caf', v_empresa);
  end if;
  return new;
end;
$function$;
drop trigger if exists trg_congelar_snapshot on public.cafs;
create trigger trg_congelar_snapshot before update on public.cafs
  for each row execute function public.fn_congelar_snapshot_caf();

create or replace function public.fn_congelar_snapshot_convenio()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_empresa text;
begin
  if new.estado in ('Aprobado', 'Completado') and old.estado is distinct from new.estado then
    select empresa_grupo into v_empresa from public.solicitudes_evento where id = new.evento_origen_id;
    new.snapshot_formato := public.fn_armar_snapshot_formato('convenio', v_empresa);
  end if;
  return new;
end;
$function$;
drop trigger if exists trg_congelar_snapshot on public.convenios_pago_hcp;
create trigger trg_congelar_snapshot before update on public.convenios_pago_hcp
  for each row execute function public.fn_congelar_snapshot_convenio();

create or replace function public.fn_congelar_snapshot_convenio_hcp()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_empresa text;
begin
  if new.estado in ('Aprobado', 'Completado') and old.estado is distinct from new.estado then
    select empresa_grupo into v_empresa from public.solicitudes_evento where id = new.evento_origen_id;
    new.snapshot_formato := public.fn_armar_snapshot_formato('convenioHCP', v_empresa);
  end if;
  return new;
end;
$function$;
drop trigger if exists trg_congelar_snapshot on public.convenios_hcp;
create trigger trg_congelar_snapshot before update on public.convenios_hcp
  for each row execute function public.fn_congelar_snapshot_convenio_hcp();

-- 6. Verificación manual ANTES de dar esto por terminado (recomendado):
--    aprueba (o deja que termine de aprobarse) un documento de prueba de
--    cada tipo y confirma que quedó su snapshot:
--      select id, estado, firma_congelada_id from evento_aprobaciones where evento_id = '<id de prueba>';
--      select id, estado, snapshot_formato from solicitudes_evento where id = '<id de prueba>';
--    Si `firma_congelada_id`/`snapshot_formato` quedan en null después de
--    aprobar, compara los nombres reales de columnas de tu base
--    (`select column_name from information_schema.columns where table_name = '...'`)
--    contra los que asume esta migración (ver "LÍMITES HONESTOS" arriba).
