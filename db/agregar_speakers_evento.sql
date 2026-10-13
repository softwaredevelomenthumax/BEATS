-- =============================================================================
-- Ronda de ajustes de formularios — Solicitud de Evento, entrega 2
-- (septiembre 2026): modelo de N speakers externos por evento, cada uno con
-- su propia cuota de inscripción y su propio presupuesto de
-- transporte/hospedaje/alimentos (por sesión, si el evento es de "Varias
-- sesiones").
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Debe ejecutarse a mano en el
-- SQL Editor del proyecto real de Supabase ANTES de publicar esta versión de
-- la app: sin este cambio, el modelo de N speakers no se puede guardar
-- contra la base real (aunque sí funciona hoy contra los fixtures locales
-- de scripts/verificar_evento.mjs, que no validan columnas/tablas reales).
--
-- A diferencia de la migración anterior de esta ronda
-- (agregar_estado_provincia_evento.sql, que solo agregaba columnas), esta
-- crea DOS TABLAS NUEVAS — no hay ninguna tabla real equivalente que
-- reconstruir por extracción forense: antes de esta ronda el esquema real
-- solo modelaba UN speaker externo por evento
-- (solicitudes_evento.speaker_participacion_id, que se conserva sin cambios
-- por compatibilidad con documentos ya guardados, pero el formulario ya no
-- lo usa para el caso "Speaker externo" — ver README).
--
-- Qué agrega y por qué:
--
--   1. `solicitudes_evento.numero_speakers_externos` (integer, nullable) —
--      cuántos speakers externos declaró el solicitante; gobierna cuántas
--      filas de la tabla 2 existen para ese evento.
--
--   2. `evento_speakers_participacion` — un speaker externo participando en
--      la actividad académica del evento. `speaker_id` referencia
--      `speakers` (Repositorio de HCPs/Speakers); `nombre_speaker` es una
--      copia denormalizada del nombre+documento+especialidad concatenados
--      (mismo patrón que `nombre_speaker_participacion` en
--      `solicitudes_evento`), para no tener que resolver el repositorio de
--      nuevo en la impresión si el speaker se edita o elimina después.
--
--   3. `evento_speaker_presupuestos` — el detalle de transporte/hospedaje/
--      alimentos de CADA speaker de la tabla 2. `sesion_id` es NULL cuando
--      el evento es de "Única sesión" (una sola fila por speaker) y
--      referencia `sesiones_evento` cuando es de "Varias sesiones" (una
--      fila por speaker POR sesión) — por eso NO lleva `not null`.
--      `on delete cascade` en ambas FK: al borrar el speaker (o la sesión)
--      se borra su presupuesto, sin dejar filas huérfanas.
--
-- Antes de ejecutar, confirma que estos nombres no colisionan con nada ya
-- existente:
--   select table_name from information_schema.tables
--   where table_name in ('evento_speakers_participacion', 'evento_speaker_presupuestos');
-- =============================================================================

alter table public.solicitudes_evento
  add column if not exists numero_speakers_externos integer;

create table if not exists public.evento_speakers_participacion (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.solicitudes_evento(id) on delete cascade,
  orden integer not null default 0,
  speaker_id uuid references public.speakers(id),
  nombre_speaker text,
  monto_inscripcion numeric,
  detalle_inscripcion text
);

create index if not exists idx_evento_speakers_participacion_evento_id
  on public.evento_speakers_participacion(evento_id);

create table if not exists public.evento_speaker_presupuestos (
  id uuid primary key default gen_random_uuid(),
  evento_speaker_id uuid not null references public.evento_speakers_participacion(id) on delete cascade,
  sesion_id uuid references public.sesiones_evento(id) on delete cascade,
  transporte_no_aplica boolean not null default false,
  transporte_acorde_politica boolean not null default true,
  transporte_motivo_no_acorde text,
  tipo_transporte text,
  valor_transporte numeric,
  cotizacion_adjunta boolean not null default false,
  taxi boolean not null default false,
  valor_estimado_taxi numeric,
  hospedaje_no_aplica boolean not null default false,
  hospedaje_acorde_politica boolean not null default true,
  hospedaje_motivo_no_acorde text,
  fecha_inicio_estancia date,
  fecha_fin_estancia date,
  costo_noche_persona numeric,
  nombre_hotel text,
  categoria_hotel text,
  motivo_localidad_distinta text,
  alimentos_no_aplica boolean not null default false,
  alimentos_acorde_politica boolean not null default true,
  alimentos_motivo_no_acorde text,
  monto_alimentos_dia numeric,
  comentarios_alimentos text
);

create index if not exists idx_evento_speaker_presupuestos_evento_speaker_id
  on public.evento_speaker_presupuestos(evento_speaker_id);

-- RLS: sigue el mismo criterio que el resto de tablas hijas de un
-- documento con cadena de aprobación (p. ej. sesiones_evento,
-- evento_muestras_planeadas) — habilítala y copia sus políticas si tu
-- proyecto ya las tiene en esas tablas equivalentes:
--   alter table public.evento_speakers_participacion enable row level security;
--   alter table public.evento_speaker_presupuestos enable row level security;
-- (políticas omitidas aquí a propósito — cópialas de sesiones_evento para
-- no adivinar una regla de acceso que no se puede confirmar desde este
-- entorno).
