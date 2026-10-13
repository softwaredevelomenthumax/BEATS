-- ============================================================================
-- Permiso individual "Eliminar Documentos Firmados" (octubre 2026)
-- ============================================================================
-- Pedido explícito del usuario: "Genera un formulario (al que pueda darse
-- acceso solo para administradores, por usuario), para ver y eliminar sin
-- rastro, documentos que se hayan creado por error, a pesar de estar
-- firmados pero que no tengan información relevante... Para esto, debe
-- pedir confirmación con la contraseña del usuario loggeado."
--
-- Este permiso es deliberadamente INDEPENDIENTE de `es_administrador`: se
-- otorga persona por persona desde "Configuración de Usuarios/Roles", no
-- se hereda de ningún rol ni de la bandera de Administrador. Ver
-- `src/pages/EliminarDocumentosFirmados.tsx`, `src/lib/documentosAdmin.ts`
-- y `puedeEliminarDocumentosFirmados` en `src/types.ts`.
-- ============================================================================

alter table usuarios
  add column if not exists puede_eliminar_documentos_firmados boolean not null default false;

-- Verificación — debe mostrar la columna nueva, not null, default false.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name = 'usuarios'
  and column_name = 'puede_eliminar_documentos_firmados';

-- Opcional: otorgar el permiso de una vez a un usuario puntual por su
-- correo (ajusta el correo antes de ejecutar esta parte). Mismo criterio
-- de "por si la UI todavía no lo refleja" que el resto de scripts
-- puntuales de esta carpeta — normalmente basta con el toggle en
-- "Configuración de Usuarios/Roles" una vez la columna exista.
-- update usuarios set puede_eliminar_documentos_firmados = true where email = 'correo@dominio.com';
