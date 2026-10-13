-- =============================================================================
-- Entrega 33 (octubre 2026) — foto de perfil de los colaboradores.
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Ejecutarlo completo en el SQL Editor (idempotente).
-- Es OPCIONAL: sin él la aplicación funciona igual; el campo «Foto» de «Usuarios y Roles» avisa que falta la columna
-- y todos los avatares siguen mostrando las iniciales.
--
-- `usuarios.foto_id` apunta al archivo (`archivos_adjuntos`) con la foto, igual que `speakers.foto_id`.
-- Si se borra el archivo, la foto simplemente se quita (on delete set null).
-- =============================================================================

alter table public.usuarios
  add column if not exists foto_id uuid references public.archivos_adjuntos (id) on delete set null;

comment on column public.usuarios.foto_id is 'Foto de perfil del colaborador (archivos_adjuntos). Se muestra como avatar circular en toda la aplicación.';

notify pgrst, 'reload schema';
