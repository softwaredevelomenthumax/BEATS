-- =============================================================================
-- Renombre del rol "Gerencia General / Representación Legal" →
-- "Gerencia General / Rep. Legal" (octubre 2026, pedido explícito).
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Es OPCIONAL y solo afecta datos
-- históricos: en la aplicación, el nombre del rol sale de
-- `ETIQUETA_ROL_USUARIO` (src/lib/enums.ts) — el valor interno del rol sigue
-- siendo `gerencia_general`, así que NO hay nada que migrar en `usuarios`.
--
-- Lo único que queda guardado como texto en la base es la ETIQUETA de cada
-- etapa de la cadena de aprobación de los documentos YA CREADOS (una fila por
-- etapa, copiada al momento de crear el documento). Los documentos nuevos ya
-- nacen con la etiqueta nueva; este script alinea los existentes para que la
-- cadena de aprobación se vea igual en todos.
--
-- No toca estados, firmas ni fechas — solo el texto de `etiqueta`. Cubre las
-- dos variantes que pudieron quedar guardadas ("&" y "/") y la etapa de firma
-- del Convenio HCP ("Firma Gerencia General ...").
-- =============================================================================

-- 0. Vista previa (solo lectura): cuántas filas cambiarían, por tabla.
select 'evento_aprobaciones' as tabla, count(*) from public.evento_aprobaciones where etiqueta ~ 'Gerencia General (&|/) Representación Legal'
union all select 'caf_aprobaciones', count(*) from public.caf_aprobaciones where etiqueta ~ 'Gerencia General (&|/) Representación Legal'
union all select 'convenio_aprobaciones', count(*) from public.convenio_aprobaciones where etiqueta ~ 'Gerencia General (&|/) Representación Legal'
union all select 'convenio_hcp_aprobaciones', count(*) from public.convenio_hcp_aprobaciones where etiqueta ~ 'Gerencia General (&|/) Representación Legal';

begin;

update public.evento_aprobaciones
  set etiqueta = regexp_replace(etiqueta, 'Gerencia General (&|/) Representación Legal', 'Gerencia General / Rep. Legal', 'g')
  where etiqueta ~ 'Gerencia General (&|/) Representación Legal';

update public.caf_aprobaciones
  set etiqueta = regexp_replace(etiqueta, 'Gerencia General (&|/) Representación Legal', 'Gerencia General / Rep. Legal', 'g')
  where etiqueta ~ 'Gerencia General (&|/) Representación Legal';

update public.convenio_aprobaciones
  set etiqueta = regexp_replace(etiqueta, 'Gerencia General (&|/) Representación Legal', 'Gerencia General / Rep. Legal', 'g')
  where etiqueta ~ 'Gerencia General (&|/) Representación Legal';

update public.convenio_hcp_aprobaciones
  set etiqueta = regexp_replace(etiqueta, 'Gerencia General (&|/) Representación Legal', 'Gerencia General / Rep. Legal', 'g')
  where etiqueta ~ 'Gerencia General (&|/) Representación Legal';

commit;

-- Verificación: debe devolver 0 filas en cada tabla.
select 'evento_aprobaciones' as tabla, count(*) from public.evento_aprobaciones where etiqueta ~ 'Representación Legal'
union all select 'caf_aprobaciones', count(*) from public.caf_aprobaciones where etiqueta ~ 'Representación Legal'
union all select 'convenio_aprobaciones', count(*) from public.convenio_aprobaciones where etiqueta ~ 'Representación Legal'
union all select 'convenio_hcp_aprobaciones', count(*) from public.convenio_hcp_aprobaciones where etiqueta ~ 'Representación Legal';
