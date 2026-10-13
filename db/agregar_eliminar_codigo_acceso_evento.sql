-- =============================================================================
-- Eliminar códigos de acceso de Ejecución en Sitio (octubre 2026).
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE: ejecutarlo a mano en el SQL
-- Editor de Supabase. Es idempotente (se puede ejecutar más de una vez).
--
-- Qué habilita: en la ventana del evento, sección "Código de acceso —
-- Ejecución en Sitio", además de "Desactivar" ahora existe "Eliminar". La
-- app borra la fila de `eventos_codigos_acceso` directamente; sin una política
-- de DELETE, Postgres (con RLS activo) filtra el borrado en silencio y la app
-- avisa que no se pudo.
--
-- Regla: solo Administradores (los mismos que ven y gestionan los códigos en
-- la app: `puedeGestionarCodigos`). La app, además, NO elimina un código que
-- ya tenga sesiones de ejecución (`sesiones_ejecucion_evento.codigo_acceso_id`)
-- porque de ellas cuelgan los registros de asistencia, muestras y fotos del
-- evento: esos códigos solo se desactivan. Si por la vía SQL se intentara
-- borrar uno con sesiones, la llave foránea lo impediría igualmente.
-- =============================================================================

alter table public.eventos_codigos_acceso enable row level security;
grant delete on public.eventos_codigos_acceso to authenticated;

drop policy if exists beats_codigos_acceso_delete_admin on public.eventos_codigos_acceso;

create policy beats_codigos_acceso_delete_admin on public.eventos_codigos_acceso
  for delete to authenticated
  using (
    exists (
      select 1
        from public.usuarios u
       where u.auth_user_id = auth.uid()
         and u.es_administrador is true
    )
  );

-- Verificación (opcional): debe listar la política recién creada.
-- select policyname, cmd from pg_policies
--  where schemaname = 'public' and tablename = 'eventos_codigos_acceso';
