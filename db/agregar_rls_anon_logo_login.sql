-- =============================================================================
-- AJUSTES (septiembre/octubre 2026), pedido explícito: "Aun no aparece el
-- logo del aplicativo (precargado en la sección de 'Configuración de
-- campos/variables') en la ventana de login."
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Debe ejecutarse a mano en el
-- SQL Editor del proyecto real de Supabase.
--
-- Diagnóstico: `PantallaLogin.tsx` y el hook `useLogoApp.ts` YA están bien
-- construidos — resuelven `configuracion_formatos.logo_app_id` y luego
-- cargan el archivo real desde `archivos_adjuntos` (mismo patrón que el
-- membrete de los documentos impresos). El problema no está en el código
-- de la app: la ventana de login se muestra ANTES de que exista una sesión
-- autenticada de Supabase, y las políticas RLS de este proyecto (ver
-- `rls-usuarios.propuesta.sql`, que ya documenta el mismo patrón "todo
-- exige `to authenticated`") casi con certeza restringen el SELECT de
-- `configuracion_formatos` y `archivos_adjuntos` a usuarios autenticados.
-- Resultado: el cliente anónimo del login recibe un error de RLS (o cero
-- filas), `useLogoApp` lo captura en su `catch` y simplemente no muestra
-- nada — sin romper la pantalla, pero sin el logo tampoco.
--
-- Antes de ejecutar, confirma las políticas actuales (para no duplicar
-- nombres ni abrir más de lo necesario):
--   select * from pg_policies where tablename in ('configuracion_formatos', 'archivos_adjuntos');
--
-- Qué hace este archivo:
--   1. Permite SELECT anónimo (rol `anon`) de TODA la fila única de
--      `configuracion_formatos` (id = 1) — no contiene datos sensibles,
--      solo metadatos de formato (proceso/código/versión por tipo de
--      documento, ids de logo, y el texto de la declaración de tratamiento
--      de datos), todos pensados para aparecer impresos/visibles de todas
--      formas.
--   2. Permite SELECT anónimo de `archivos_adjuntos`, pero ÚNICAMENTE de la
--      fila cuyo id coincide con el `logo_app_id` configurado en ese
--      momento — NO abre la tabla completa (que sí contiene adjuntos
--      sensibles: CVs, facturas, soportes) a usuarios no autenticados, solo
--      el logo de la aplicación que de por sí es público en la pantalla de
--      login.
-- =============================================================================

alter table public.configuracion_formatos enable row level security;

drop policy if exists "configuracion_formatos_select_anon_login" on public.configuracion_formatos;
create policy "configuracion_formatos_select_anon_login"
  on public.configuracion_formatos
  for select
  to anon
  using (true);

alter table public.archivos_adjuntos enable row level security;

drop policy if exists "archivos_adjuntos_select_anon_logo_app" on public.archivos_adjuntos;
create policy "archivos_adjuntos_select_anon_logo_app"
  on public.archivos_adjuntos
  for select
  to anon
  using (
    id in (select logo_app_id from public.configuracion_formatos where logo_app_id is not null)
  );
