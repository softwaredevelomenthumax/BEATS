-- =============================================================================
-- Historial/trazabilidad de "Configuración de Formatos" (septiembre 2026),
-- ítems #4 y #5 de esta entrega de Configuración de Campos.
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Debe ejecutarse a mano en el
-- SQL Editor del proyecto real de Supabase ANTES de publicar esta versión
-- de la app: sin esta tabla, guardar la configuración de formatos (global,
-- por empresa, o la Declaración de tratamiento de datos) sigue funcionando
-- igual que antes, pero el nuevo panel de historial en Configuración de
-- Campos → Configuración de Formatos queda vacío (no falla, solo no hay
-- filas que mostrar).
--
-- Qué agrega y por qué:
--
--   `configuracion_formatos_historial` — un registro NUEVO, tipo bitácora
--   (append-only, nunca se actualiza ni se borra en operación normal), por
--   cada vez que se guarda: (a) la configuración de formato de un tipo de
--   documento (global o el override de una empresa — ítem #4, que también
--   agrega el selector de empresa a la sección "global" del editor) o (b)
--   la Declaración de tratamiento de datos (global o por empresa — ítem
--   #5, que la saca de la tarjeta de formatos a su propia sección). Mismo
--   patrón append-only que `formato_oficial_fmv` (ya existente, ver
--   `src/lib/configuracionFormatos.ts`), pero para AMBAS secciones en una
--   sola tabla — la columna `seccion` distingue cuál de las dos cambió,
--   en vez de crear dos tablas de historial casi idénticas.
--
--   Columnas:
--     - `seccion`: 'formato' | 'declaracion_tratamiento_datos'.
--     - `empresa_grupo`: NULL/vacío = configuración global; si no, el
--       nombre de la empresa cuyo override se guardó (mismo valor de texto
--       libre que `configuracion_formatos_empresa.empresa_grupo` — ese
--       catálogo viene de `catalogo_valores` vía `useCatalogo
--       ("empresasGrupo")`, no de una tabla de empresas separada, así que
--       no hay una FK real a la que apuntar).
--     - `valores`: jsonb con una foto completa de lo que quedó guardado en
--       ese momento (para 'formato', el objeto `FormatoDocumentoConfig`
--       del tipo de documento activo; para 'declaracion_tratamiento_datos',
--       el texto de la declaración) — suficiente para reconstruir "qué
--       decía antes" comparando filas consecutivas, sin necesitar un
--       cálculo de diff en el momento de guardar.
--     - `usuario_id`/`usuario_email`: quién guardó, resueltos desde la
--       sesión de Supabase Auth en el cliente (`useAuth()`) al momento de
--       la escritura — ambos nullable por si se guarda sin sesión
--       resuelta todavía (no debería pasar en un panel de administración,
--       pero se prefiere no bloquear el guardado principal si falla el
--       registro del historial).
--
-- Antes de ejecutar, confirma que el nombre no colisiona con nada ya
-- existente:
--   select table_name from information_schema.tables
--   where table_name = 'configuracion_formatos_historial';
-- =============================================================================

create table if not exists public.configuracion_formatos_historial (
  id uuid primary key default gen_random_uuid(),
  fecha timestamptz not null default now(),
  usuario_id uuid references public.usuarios(id),
  usuario_email text,
  seccion text not null check (seccion in ('formato', 'declaracion_tratamiento_datos')),
  tipo_documento text,
  empresa_grupo text,
  valores jsonb not null
);

create index if not exists idx_configuracion_formatos_historial_fecha
  on public.configuracion_formatos_historial(fecha desc);

create index if not exists idx_configuracion_formatos_historial_seccion
  on public.configuracion_formatos_historial(seccion);

-- RLS: sigue el mismo criterio que el resto de tablas de historial/auditoría
-- de solo-administrador (p. ej. `formato_oficial_fmv`) — habilítala y copia
-- sus políticas si tu proyecto ya las tiene en esa tabla equivalente:
--   alter table public.configuracion_formatos_historial enable row level security;
-- (política omitida aquí a propósito, mismo motivo que en
-- agregar_speakers_evento.sql: no adivinar una regla de acceso que no se
-- puede confirmar desde este entorno).
