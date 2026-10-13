-- =============================================================================
-- Rutina diaria de recordatorio de documentos de soporte post-evento.
--
-- Pedido explícito del usuario: "A partir del día siguiente a la fecha de
-- finalización de cada evento, generar una 'rutina diaria' de envío de
-- correo recordatorio al creador de la solicitud de evento educativo y
-- promocional para que cargue la información de soporte. [...] el mensaje
-- debería indicar específicamente qué documentos de soporte están
-- pendientes de carga. Si transcurren más de 3 días desde que finalizó el
-- evento y aun no se ha iniciado o completado la carga de los documentos de
-- soporte, crear un correo más enfático pero asertivo recordando la
-- importancia de cargar la información y pon en copia al usuario con rol
-- 'Director Médico' que firmó la aprobación del evento."
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Debe ejecutarse a mano en el
-- SQL Editor del proyecto real de Supabase.
--
-- Por qué esto vive en Postgres (una función + `pg_cron`) y no en una Edge
-- Function nueva: el envío de correo transaccional de esta app YA tiene un
-- mecanismo confirmado y funcionando en la base real — el trigger
-- `fn_notificar_por_email()` (ver `db/notificaciones-enviar-email.sql`, que
-- se extrajo de la base real con `pg_get_functiondef`) llama
-- `net.http_post(...)` directo contra `configuracion_integraciones.edge_function_url`
-- (la función `send-email` ya desplegada) con el header `x-webhook-secret`.
-- Esta rutina reutiliza EXACTAMENTE el mismo mecanismo en vez de inventar
-- una Edge Function nueva — que habría que escribir a ciegas, sin poder
-- probarla contra la base real antes de entregarla.
--
-- LÍMITES HONESTOS de esta entrega (léelos antes de confiar en el cron a
-- ojos cerrados — pruébala a mano primero, ver el paso 5 más abajo):
--   - El checklist de "qué documento falta" replica, en SQL, la MISMA
--     lógica que ya usa "Auditoría de Eventos" en la app
--     (`construirChecklistEvento`, `src/lib/documentosRequeridosEvento.ts`)
--     para: Convenio de Pago a HCP, FMV Checklist, CAF, Lista de
--     asistencia (con su excepción de "No aplica" por sesión/evento), Fotos
--     del evento, y Orden de compra (exenta si el speaker es interno). Se
--     validó columna por columna contra el código fuente real de la app
--     (`src/lib/evento.ts`, `convenio.ts`, `fmv.ts`, `caf.ts`,
--     `repositorioEvento.ts`, `enums.ts`) — no son nombres inventados.
--   - AJUSTE pedido por el usuario (antes de ejecutar esta migración):
--     "Factura" y "Comprobante de pago" NO siguen la regla genérica de
--     arriba (no se avisan de inmediato al día siguiente del fin del
--     evento). Tienen reglas propias, con plazos:
--       · Factura: se avisa solo si ya pasaron 15 días o más desde
--         `fecha_fin_evento` y todavía no hay ninguna fila con
--         categoria = 'facturas' para el evento.
--       · Comprobante de pago: se avisa solo si ya pasaron 75 días o más
--         desde la FECHA DE CARGA de la factura (no desde el fin del
--         evento) y todavía no hay ninguna fila con
--         categoria = 'comprobantePago'. Si el evento no tiene ninguna
--         factura cargada todavía, este aviso de comprobante simplemente
--         no aplica todavía (el de Factura sí puede estar avisando aparte).
--         Si llegara a haber más de una factura cargada para el mismo
--         evento, se usa la más reciente (por `fecha`) como referencia —
--         el caso más conservador, el que más tarda en cumplir el plazo.
--     Límite honesto de este ajuste, ya CONFIRMADO contra la base real
--     (consulta corrida por el usuario sobre
--     `information_schema.columns`): la tabla `evento_registros_financieros`
--     NO tiene columna `creado_en` (a diferencia de casi todas las demás
--     tablas de la app) — sus columnas son únicamente: id, evento_id,
--     categoria, archivo_id, numero, fecha, valor, moneda, sesion_id,
--     factura_id. Por lo tanto esta rutina usa `fecha` como "fecha de carga
--     de la factura" en la práctica (el `coalesce` con `creado_en` queda en
--     el código como defensa sin efecto, por si esa columna se agrega en el
--     futuro). Importante: `fecha` es, en la app, un campo de fecha de
--     factura ingresado a mano en el formulario (ver `fecha` en
--     `RegistroFinancieroEvento`/`repositorioEvento.ts`) — no necesariamente
--     la fecha real en que se subió el archivo al repositorio. Si en la
--     práctica el usuario suele diligenciar ahí la fecha real de la
--     factura (no la de carga), el plazo de 75 días se cuenta desde esa
--     fecha de factura, que puede ser un poco anterior a cuándo
--     efectivamente se cargó al sistema — una aproximación razonable y del
--     mismo lado conservador (el plazo se cumple igual o antes, nunca
--     después) que el resto de aproximaciones de este archivo.
--     Además: para estos dos casos puntuales (Factura y Comprobante de
--     pago), la copia al Director Médico que aprobó el evento es
--     SIEMPRE obligatoria cuando alguno de los dos aparece en la lista de
--     pendientes — a diferencia del resto del checklist, donde esa copia
--     solo se agrega cuando ya pasaron más de 3 días (nivel "enfático").
--   - "Notificación de Pago a HCPs" es una APROXIMACIÓN deliberada: la
--     regla real de la app (`necesitaNotificacionPago`/`facturasSinNotificar`)
--     cruza cada factura cargada contra cuáles ya quedaron referenciadas por
--     una Notificación de Pago, fila por fila — replicar eso en SQL sin
--     poder probarlo contra la base real se sale del alcance razonable de
--     esta entrega. Aquí se usa una regla más simple y más conservadora
--     (evita avisos de más, a costa de poder dejar pasar algún caso borde):
--     se marca como pendiente solo si el evento ya tiene Convenio Y hay al
--     menos una factura cargada en el Repositorio, pero NINGUNA Notificación
--     de Pago todavía. Si en la práctica esto no basta, ajusta el bloque
--     marcado "NOTIFICACIÓN DE PAGO" más abajo.
--   - Un evento sin NINGÚN documento pendiente (paquete realmente completo)
--     nunca genera correo — coherente con que, en ese caso, el evento ya
--     debería pasar a "Completado" automáticamente
--     (`evaluarYCompletarEventosVencidos`, `src/lib/evento.ts`).
--
-- Qué agrega:
--   1. Tabla `recordatorios_documentos_soporte_enviados` — un renglón por
--      evento y día en que se envió un recordatorio, para que la rutina
--      nunca mande dos correos el mismo día al mismo evento (aunque el cron
--      se dispare más de una vez, o se invoque a mano para probar) y para
--      llevar el nivel ('normal'/'enfatico') del último enviado.
--   2. Función `fn_enviar_recordatorios_documentos_soporte()` — recorre los
--      eventos Aprobados cuya fecha de fin ya pasó, arma la lista de
--      documentos de soporte pendientes de cada uno, y si hay al menos uno
--      pendiente, envía el correo (al creador siempre; con copia al
--      Director Médico que aprobó, además, cuando ya pasaron más de 3 días
--      desde el fin del evento).
--   3. Programación con `pg_cron` para que corra una vez al día.
--
-- Antes de ejecutar, confirma que no colisiona con nada existente:
--   select table_name from information_schema.tables
--   where table_schema = 'public' and table_name = 'recordatorios_documentos_soporte_enviados';
--   select proname from pg_proc where proname = 'fn_enviar_recordatorios_documentos_soporte';
-- =============================================================================

-- 1. Tabla de control — evita reenvíos el mismo día y deja rastro de cuándo
--    se avisó y con qué nivel.
create table if not exists public.recordatorios_documentos_soporte_enviados (
  evento_id uuid not null references public.solicitudes_evento(id) on delete cascade,
  fecha_envio date not null,
  nivel text not null check (nivel in ('normal', 'enfatico')),
  documentos_pendientes text[] not null default '{}',
  enviado_en timestamptz not null default now(),
  primary key (evento_id, fecha_envio)
);

comment on table public.recordatorios_documentos_soporte_enviados is
  'Rastro de los recordatorios diarios de documentos de soporte ya enviados (rutina fn_enviar_recordatorios_documentos_soporte) — evita reenviar el mismo día.';

alter table public.recordatorios_documentos_soporte_enviados enable row level security;

-- Nadie necesita leer/escribir esto desde el cliente — solo lo toca la
-- función `security definer` de abajo. Sin ninguna policy, RLS activo
-- bloquea todo acceso directo vía la API (anon/authenticated), que es lo
-- que se quiere: esta tabla es contabilidad interna de la rutina.

-- 2. La función. `security definer` porque corre sola (sin sesión de
--    usuario, disparada por `pg_cron`) y necesita leer tablas que RLS
--    normalmente restringe por usuario.
create or replace function public.fn_enviar_recordatorios_documentos_soporte()
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_url          text;
  v_secret       text;
  v_app_url      text;
  v_evento       record;
  v_pendientes   text[];
  v_requiere_ext boolean;
  v_interno      boolean;
  v_dias         integer;
  v_nivel        text;
  v_creador      record;
  v_medico       record;
  v_asunto       text;
  v_html         text;
  v_lista_html   text;
  v_ya_enviado   boolean;
  v_tiene_convenio boolean;
  v_lista_satisfecha boolean;
  v_factura_jsonb jsonb;
  v_fecha_carga_factura date;
  v_incluye_factura boolean;
  v_incluye_comprobante boolean;
begin
  select edge_function_url, webhook_secret, app_url into v_url, v_secret, v_app_url
    from configuracion_integraciones
    where id = 1;

  if v_url is null or v_secret is null then
    raise notice 'fn_enviar_recordatorios_documentos_soporte: integración de correo no configurada todavía — nada que hacer.';
    return;
  end if;

  for v_evento in
    select *
    from solicitudes_evento
    where estado = 'Aprobado'
      and fecha_fin_evento is not null
      and fecha_fin_evento < current_date
  loop
    v_pendientes := '{}';
    v_incluye_factura := false;
    v_incluye_comprobante := false;
    v_requiere_ext := coalesce(v_evento.participacion_academica, false) and v_evento.quien_dicta_actividad = 'Speaker externo';
    v_interno := coalesce(v_evento.participacion_academica, false) and v_evento.quien_dicta_actividad = 'Speaker interno';

    if v_requiere_ext then
      if not exists (
        select 1 from convenios_pago_hcp
        where evento_origen_id = v_evento.id and estado not in ('Rechazado', 'Anulado', 'Borrador')
      ) then
        v_pendientes := array_append(v_pendientes, 'Convenio de Pago a HCP');
      end if;

      if not exists (
        select 1 from fmv_checklists
        where evento_origen_id = v_evento.id and estado not in ('Rechazado', 'Anulado', 'Borrador')
      ) then
        v_pendientes := array_append(v_pendientes, 'FMV Checklist');
      end if;

      if not v_interno
         and not exists (
           select 1 from cafs
           where evento_origen_id = v_evento.id and estado not in ('Rechazado', 'Anulado', 'Borrador')
         )
         and not exists (
           select 1 from evento_repositorio_archivos
           where evento_id = v_evento.id and categoria = 'caf'
         )
      then
        v_pendientes := array_append(v_pendientes, 'CAF');
      end if;

      -- NOTIFICACIÓN DE PAGO — aproximación deliberada, ver la nota grande
      -- al inicio del archivo.
      v_tiene_convenio := exists (select 1 from convenios_pago_hcp where evento_origen_id = v_evento.id);
      if v_tiene_convenio
         and exists (select 1 from evento_registros_financieros where evento_id = v_evento.id and categoria = 'facturas')
         and not exists (select 1 from notificaciones_pago_hcp where evento_origen_id = v_evento.id and estado not in ('Rechazado', 'Anulado', 'Borrador'))
      then
        v_pendientes := array_append(v_pendientes, 'Notificación de Pago a HCPs');
      end if;
    end if;

    -- LISTA DE ASISTENCIA — replica listaAsistenciaSatisfecha()
    -- (src/lib/documentosRequeridosEvento.ts): en "Varias sesiones", cada
    -- sesión debe tener su archivo cargado O su "No aplica" con motivo; en
    -- "Única sesión", es la misma regla a nivel del evento.
    if v_evento.modalidad_sesiones = 'Varias sesiones' then
      v_lista_satisfecha := not exists (
        select 1 from sesiones_evento s
        where s.evento_id = v_evento.id
          and not (
            (s.lista_asistencia_no_aplica and coalesce(s.lista_asistencia_no_aplica_motivo, '') <> '')
            or exists (
              select 1 from evento_repositorio_archivos a
              where a.evento_id = v_evento.id and a.categoria = 'listaAsistencia' and a.sesion_id = s.id
            )
          )
      ) and exists (select 1 from sesiones_evento where evento_id = v_evento.id);
    else
      v_lista_satisfecha :=
        (coalesce(v_evento.lista_asistencia_no_aplica, false) and coalesce(v_evento.lista_asistencia_no_aplica_motivo, '') <> '')
        or exists (select 1 from evento_repositorio_archivos where evento_id = v_evento.id and categoria = 'listaAsistencia');
    end if;
    if not v_lista_satisfecha then
      v_pendientes := array_append(v_pendientes, 'Lista de asistencia');
    end if;

    -- FOTOS DEL EVENTO
    if not exists (select 1 from evento_repositorio_archivos where evento_id = v_evento.id and categoria = 'fotos') then
      v_pendientes := array_append(v_pendientes, 'Fotos del evento (evidencia)');
    end if;

    -- FINANCIEROS (exentos si el speaker es interno — mismo criterio que
    -- CATEGORIAS_FINANCIERAS_CHECKLIST en el checklist de la app).
    -- "Factura" y "Comprobante de pago" NO van aquí — tienen reglas propias
    -- con plazo, más abajo (pedido explícito del usuario antes de ejecutar
    -- esta migración). "Orden de compra" sigue con el aviso inmediato de
    -- siempre (el usuario no pidió cambiarla).
    if not v_interno then
      if not exists (select 1 from evento_registros_financieros where evento_id = v_evento.id and categoria = 'ordenCompra') then
        v_pendientes := array_append(v_pendientes, 'Orden de compra');
      end if;
    end if;

    -- FACTURA — regla propia con plazo: solo se avisa si ya pasaron 15 días
    -- o más desde el fin del evento (no al día siguiente, como el resto del
    -- checklist). Misma exención por speaker interno que el resto de
    -- FINANCIEROS.
    if not v_interno
       and (current_date - v_evento.fecha_fin_evento) >= 15
       and not exists (select 1 from evento_registros_financieros where evento_id = v_evento.id and categoria = 'facturas')
    then
      v_pendientes := array_append(v_pendientes, 'Factura');
      v_incluye_factura := true;
    end if;

    -- COMPROBANTE DE PAGO — regla propia con plazo, pero contado desde la
    -- FECHA DE CARGA DE LA FACTURA (no desde el fin del evento): 75 días o
    -- más. Si no hay ninguna factura cargada todavía, este ítem no aplica
    -- (ver nota grande al inicio del archivo sobre la columna de fecha de
    -- carga usada aquí, y sobre cuál factura se toma cuando hay más de una).
    if not v_interno then
      select to_jsonb(erf) into v_factura_jsonb
      from evento_registros_financieros erf
      where erf.evento_id = v_evento.id and erf.categoria = 'facturas'
      order by erf.fecha desc nulls last
      limit 1;

      v_fecha_carga_factura := null;
      if v_factura_jsonb is not null then
        v_fecha_carga_factura := coalesce(
          (v_factura_jsonb ->> 'creado_en')::date,
          (v_factura_jsonb ->> 'fecha')::date
        );
      end if;

      if v_fecha_carga_factura is not null
         and (current_date - v_fecha_carga_factura) >= 75
         and not exists (select 1 from evento_registros_financieros where evento_id = v_evento.id and categoria = 'comprobantePago')
      then
        v_pendientes := array_append(v_pendientes, 'Comprobante de pago');
        v_incluye_comprobante := true;
      end if;
    end if;

    -- Nada pendiente: ningún correo para este evento.
    if array_length(v_pendientes, 1) is null then
      continue;
    end if;

    -- Ya se le avisó hoy a este evento (cron disparado más de una vez, o
    -- ejecución manual de prueba) — no duplicar.
    select exists (
      select 1 from recordatorios_documentos_soporte_enviados
      where evento_id = v_evento.id and fecha_envio = current_date
    ) into v_ya_enviado;
    if v_ya_enviado then
      continue;
    end if;

    v_dias := current_date - v_evento.fecha_fin_evento;
    v_nivel := case when v_dias > 3 then 'enfatico' else 'normal' end;

    select id, nombre, email into v_creador from usuarios where id = v_evento.creado_por_id;
    if v_creador.email is null or v_creador.email = '' then
      raise notice 'fn_enviar_recordatorios_documentos_soporte: evento % sin correo de creador registrado — se omite.', v_evento.id;
      continue;
    end if;

    -- Copia al Director Médico: por la regla general, solo a partir del
    -- nivel "enfático" (más de 3 días desde el fin del evento). Pero para
    -- Factura y Comprobante de pago la copia es SIEMPRE obligatoria cuando
    -- cualquiera de los dos aparece en la lista de pendientes — pedido
    -- explícito del usuario, independiente de ese umbral de 3 días.
    v_medico := null;
    if v_nivel = 'enfatico' or v_incluye_factura or v_incluye_comprobante then
      select u.id, u.nombre, u.email into v_medico
      from evento_aprobaciones ea
      join usuarios u on u.id = ea.resuelto_por_id
      where ea.evento_id = v_evento.id and ea.rol_requerido = 'medica' and ea.estado = 'aprobado'
      limit 1;
    end if;

    select string_agg(format('<li>%s</li>', doc), '') into v_lista_html
    from unnest(v_pendientes) as doc;

    v_asunto := case
      when v_nivel = 'enfatico' then format('BEATS: urge cargar documentos de soporte — %s', v_evento.nombre_evento)
      else format('BEATS: documentos de soporte pendientes — %s', v_evento.nombre_evento)
    end;

    v_html := case
      when v_nivel = 'enfatico' then format(
        '<p>Hola %s,</p>'
        '<p>El evento <strong>%s</strong> finalizó el %s — ya pasaron más de 3 días y todavía hay documentos de soporte sin cargar. '
        'Te pedimos encarecidamente completar la carga lo antes posible para poder cerrar el expediente del evento:</p>'
        '<ul>%s</ul>'
        '<p>%s</p>',
        coalesce(v_creador.nombre, ''), v_evento.nombre_evento, to_char(v_evento.fecha_fin_evento, 'DD/MM/YYYY'),
        v_lista_html,
        case when v_app_url is not null then format('<p><a href="%s">Abrir BEATS</a></p>', v_app_url) else '' end
      )
      else format(
        '<p>Hola %s,</p>'
        '<p>El evento <strong>%s</strong> finalizó el %s. Recuerda cargar los siguientes documentos de soporte '
        '(la información se puede ir cargando de a poco, no hace falta tenerlo todo de una vez):</p>'
        '<ul>%s</ul>'
        '<p>%s</p>',
        coalesce(v_creador.nombre, ''), v_evento.nombre_evento, to_char(v_evento.fecha_fin_evento, 'DD/MM/YYYY'),
        v_lista_html,
        case when v_app_url is not null then format('<p><a href="%s">Abrir BEATS</a></p>', v_app_url) else '' end
      )
    end;

    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-webhook-secret', v_secret
                 ),
      body    := jsonb_build_object(
                   'to', v_creador.email,
                   'cc', case when v_medico.email is not null then jsonb_build_array(v_medico.email) else null end,
                   'subject', v_asunto,
                   'html', v_html
                 ),
      timeout_milliseconds := 20000
    );

    insert into recordatorios_documentos_soporte_enviados (evento_id, fecha_envio, nivel, documentos_pendientes)
    values (v_evento.id, current_date, v_nivel, v_pendientes)
    on conflict (evento_id, fecha_envio) do update set nivel = excluded.nivel, documentos_pendientes = excluded.documentos_pendientes;
  end loop;
end;
$function$;

comment on function public.fn_enviar_recordatorios_documentos_soporte() is
  'Rutina diaria: recordatorio por correo de documentos de soporte pendientes para eventos ya finalizados. Ver la nota grande al inicio de agregar_recordatorios_documentos_soporte.sql.';

-- 3. Prueba manual ANTES de programar el cron (recomendado): corre esto a
--    mano y revisa en los logs ("Logs" → "Postgres Logs" del Dashboard) los
--    `raise notice`, y confirma en tu bandeja/la de un evento de prueba que
--    el correo llegó con la lista correcta.
--      select fn_enviar_recordatorios_documentos_soporte();

-- 4. Programación con pg_cron — una vez al día, 13:00 UTC (8:00 a.m.
--    Colombia, UTC-5). Ajusta la hora si lo prefieres distinto; el formato
--    es el de cron estándar (minuto hora día-mes mes día-semana).
--    Requiere la extensión pg_cron habilitada en el proyecto (Database →
--    Extensions, en el Dashboard de Supabase) — igual que pg_net, que ya
--    debe estar activa porque `fn_notificar_por_email()` la usa hoy.
select cron.schedule(
  'recordatorios-documentos-soporte-diario',
  '0 13 * * *',
  $$select public.fn_enviar_recordatorios_documentos_soporte();$$
);

-- 5. Verificación rápida (opcional): confirma que el cron quedó programado.
select jobname, schedule, active from cron.job where jobname = 'recordatorios-documentos-soporte-diario';
