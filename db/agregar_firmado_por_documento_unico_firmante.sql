-- ============================================================================
-- "Firmado por" en FMV y Notificación de Pago a HCP (octubre 2026)
-- ============================================================================
-- Pedido explícito del usuario: "En el formulario FMV y en sus vistas en
-- versión impresión/PDF, el campo 'Firma electrónica: Sí' no hace
-- referencia a si está firmado o no, sino que debe mostrar la firma
-- autógrafa." Correcto: `firma_electronica` siempre queda en `true` al
-- firmar (no distingue nada) y nunca se guardaba QUIÉN firmó de verdad —
-- solo `medical_name`/`medical_role` como texto libre, sin ligar a la
-- firma manuscrita real de un usuario.
--
-- Esta columna guarda ese usuario (`firmarYCompletarDocumentoUnicoFirmante`
-- en `src/lib/documentoUnicoFirmante.ts` ya quedó actualizado para
-- escribirla) — puede ser un Administrador firmando en nombre del
-- creador, así que no necesariamente es `creado_por_id`.
-- ============================================================================

alter table fmv_checklists
  add column if not exists firmado_por_id uuid null references usuarios(id);

alter table notificaciones_pago_hcp
  add column if not exists firmado_por_id uuid null references usuarios(id);

-- Verificación — debe mostrar las dos columnas nuevas, ambas nullable.
select table_name, column_name, is_nullable
from information_schema.columns
where table_name in ('fmv_checklists', 'notificaciones_pago_hcp')
  and column_name = 'firmado_por_id';

-- Nota: los documentos YA firmados antes de esta migración quedan con
-- `firmado_por_id` en NULL — el front-end cae de vuelta a `creado_por_id`
-- en ese caso (ver comentario en `CuerpoFMV`/`CuerpoNotificacionPago`,
-- `src/components/print/DocumentoImprimible.tsx`), que es la mejor
-- aproximación posible retroactivamente ya que `puedeFirmar` normalmente
-- lo firma el propio creador.
