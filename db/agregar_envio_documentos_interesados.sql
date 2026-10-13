-- AJUSTES (septiembre/octubre 2026), pedido explícito — cuarta ronda de
-- ajustes, punto final: "Cuando se termina el flujo de aprobación de un
-- documento... se debe poder enviar desde la aplicación un mensaje al
-- HCP/Speaker, adjuntando el archivo firmado... [y] al usuario generador de
-- la solicitud de evento, adjuntando los documentos necesarios... El
-- usuario que vaya a enviar el correo debe poder seleccionar de una lista,
-- los documentos que va a enviar."
--
-- ============================================================================
-- IMPORTANTE — MIGRACIÓN REAL PENDIENTE (igual que los demás puntos de este
-- lote que requieren cambios de base de datos): este archivo todavía NO se
-- ha aplicado contra el proyecto real de Supabase. Alguien con acceso a la
-- base de datos debe ejecutarlo.
-- ============================================================================
--
-- CORREGIDO (versión 2 de este archivo): la primera versión asumía que
-- había que escribir una función nueva de Postgres (`net.http_post`) para
-- mandar adjuntos, porque el pipeline de notificaciones normales
-- (`fn_notificar_por_email()`, ver `db/notificaciones-enviar-email.sql`)
-- nunca adjunta archivos. Al revisar el código REAL de la Edge Function
-- `send-email` ya desplegada (el usuario lo compartió), resultó que esa
-- suposición estaba de más: la función YA soporta adjuntos de punta a
-- punta — incluso ya corrigió un bug real ("el archivo enviado pesa 0kb")
-- decodificando el base64 ella misma con `atob` a un `Uint8Array`, en vez
-- de confiarle esa decodificación a `nodemailer`/`Buffer` bajo Deno — y
-- además YA tiene una vía de llamada autenticada pensada exactamente para
-- este caso: `supabase.functions.invoke("send-email", {...})` desde el
-- navegador, con la sesión de quien esté usando la app, restringida en el
-- servidor a `rol === "medica"` ("Solo Dirección Médica puede enviar
-- correos con adjuntos desde la app").
--
-- Por eso `src/lib/enviosDocumentos.ts` llama la Edge Function DIRECTO
-- (sin pasar por ninguna función nueva de Postgres ni por
-- `configuracion_integraciones`/`net.http_post`) — lo único que faltaba a
-- nivel de base de datos es la bitácora de auditoría/compliance de abajo.
--
-- Contrato exacto que espera la función (confirmado en su código fuente):
--   POST (autenticado con la sesión del usuario)
--   { "to": "...", "subject": "...", "html": "...",
--     "attachments": [{ "filename": "...", "content": "<base64 puro>" }] }
-- (`content` es base64 SIN el prefijo "data:...;base64," — ver
-- `enviarDocumentoPorCorreo` en `src/lib/enviosDocumentos.ts`, que lo arma
-- a partir de `archivos_adjuntos.data_url`.)

begin;

-- ----------------------------------------------------------------------------
-- Bitácora de envíos — auditoría/compliance: quién envió qué, a quién, y
-- cuándo. También sirve para que la UI muestre "Enviado el ..." sin
-- depender de que el correo en sí se pueda releer. Se llena desde el
-- frontend (`enviarDocumentoPorCorreo`, inserción directa tras un envío
-- exitoso vía la Edge Function) — no necesita ninguna función de Postgres.
-- ----------------------------------------------------------------------------
create table if not exists public.envios_documentos (
  id uuid primary key default gen_random_uuid(),
  tipo_doc public.tipo_doc not null,
  documento_id uuid not null,
  destinatario_email text not null,
  destinatario_nombre text,
  asunto text not null,
  mensaje text,
  archivos_ids uuid[] not null default '{}',
  enviado_por_id uuid not null references public.usuarios(id),
  enviado_en timestamptz not null default now()
);

comment on table public.envios_documentos is
  'Bitácora de "enviar documento(s) a partes interesadas" (HCP/speaker o '
  'solicitante) tras completarse un flujo de aprobación — ver '
  'src/lib/enviosDocumentos.ts y src/components/EnviarDocumentoDialog.tsx. '
  'El envío en sí ocurre llamando directo a la Edge Function send-email '
  '(supabase.functions.invoke, con la sesión del usuario); esta tabla solo '
  'registra el intento una vez la Edge Function respondió con éxito.';

alter table public.envios_documentos enable row level security;

drop policy if exists envios_documentos_select on public.envios_documentos;
create policy envios_documentos_select on public.envios_documentos
  for select to authenticated using (true);

-- Nota: no se usa `enviado_por_id = auth.uid()` en el check porque, en este
-- esquema, `usuarios.id` no es necesariamente igual a `auth.uid()` (ver la
-- columna separada `usuarios.auth_user_id`) — el valor lo manda el
-- frontend explícitamente (`usuarioSesion.id`), mismo patrón que ya usa
-- `registrarAuditoria()` en el resto de la app.
drop policy if exists envios_documentos_insert on public.envios_documentos;
create policy envios_documentos_insert on public.envios_documentos
  for insert to authenticated with check (true);

commit;
