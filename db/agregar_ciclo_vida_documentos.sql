-- =============================================================================
-- Ciclo de vida de documentos (borrador reabrible, devolver, enmienda),
-- septiembre 2026.
--
-- ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE. Debe ejecutarse a mano en el
-- SQL Editor del proyecto real de Supabase (xnjqlwkcbkctoinkroqs) ANTES de
-- publicar esta versión de la app: sin este cambio, el nuevo estado
-- "Devuelto" y las 3 nuevas acciones de auditoría no se pueden guardar
-- contra la base real (aunque sí funcionan hoy contra los fixtures locales
-- de scripts/verificar_ciclo_vida_documentos.mjs, que no validan el enum).
--
-- Qué agrega y por qué:
--
--   1. Un valor nuevo "Devuelto" al enum de estado de documento. El código
--      de la app (src/lib/enums.ts, ESTADO_DOC) ya lo trata como un
--      séptimo estado, entre "Rechazado" y "Completado": un documento
--      Pendiente sin ninguna firma en su cadena de aprobación puede
--      "devolverse" (ver devolverDocumento en src/lib/cicloVidaDocumento.ts),
--      quedando editable exactamente igual que un Borrador hasta que se
--      reenvía. El nombre real de este enum en la base (`estado_doc`) es
--      una SUPOSICIÓN por convención de nombres con el resto del esquema —
--      antes de correr esto, confirma el nombre real con:
--        select t.typname, e.enumlabel
--        from pg_type t join pg_enum e on e.enumtypid = t.oid
--        where t.typname ilike '%estado%doc%';
--      y ajusta el nombre en el ALTER TYPE de abajo si no coincide.
--
--   2. Tres valores nuevos al enum de acción de auditoría
--      (`tipo_accion_auditoria`, nombre real confirmado por un comentario
--      ya existente en el código — ver src/lib/convenioHCP.ts):
--      "borrador_actualizado" (cada vez que se guarda un borrador sin
--      enviarlo — repetible las veces que haga falta), "devuelto" (al
--      devolver un documento Pendiente sin firmas) y "enmienda_solicitada"
--      (al abrir la ventana de enmienda sobre un documento Pendiente que ya
--      tiene al menos una firma). Las tres quedan trazadas en Historial y
--      Auditoría igual que cualquier otra acción — ver
--      src/lib/cicloVidaDocumento.ts y los `editarBorrador*` de cada tipo
--      de documento.
--
-- Nota importante sobre "solicitar enmienda": esta función NO agrega
-- columnas nuevas — reutiliza las columnas `adenda_ventana_actor_id` /
-- `adenda_ventana_expira_en` / `adenda_ventana_justificacion` que ya existen
-- en `cafs`, `convenios_pago_hcp`, `convenios_hcp` y `solicitudes_evento`
-- (usadas hasta ahora solo por la Adenda de un documento ya Aprobado). Si
-- esas columnas no existen todavía en tu proyecto real en alguna de las 4
-- tablas, esa es una migración aparte (de una fase anterior) — este archivo
-- no las crea.
--
-- Orden sugerido: ejecutar los dos bloques de una sola vez o por separado,
-- no importa el orden entre ellos.
-- =============================================================================

-- 1. Nuevo estado "Devuelto" — AJUSTA el nombre del tipo si tu enum real no
--    se llama exactamente `estado_doc` (ver consulta de verificación arriba).
ALTER TYPE estado_doc ADD VALUE IF NOT EXISTS 'Devuelto' AFTER 'Rechazado';

-- 2. Tres nuevas acciones de auditoría.
ALTER TYPE tipo_accion_auditoria ADD VALUE IF NOT EXISTS 'borrador_actualizado';
ALTER TYPE tipo_accion_auditoria ADD VALUE IF NOT EXISTS 'devuelto';
ALTER TYPE tipo_accion_auditoria ADD VALUE IF NOT EXISTS 'enmienda_solicitada';

-- Nota de Postgres: `ALTER TYPE ... ADD VALUE` no puede ejecutarse dentro de
-- la misma transacción en la que luego se USA el valor nuevo (en un INSERT/
-- UPDATE, por ejemplo) en versiones de Postgres anteriores a la 12. Si el
-- SQL Editor de Supabase envuelve todo el script en una sola transacción y
-- da un error de "unsafe use of new value" al probarlo enseguida, corre
-- cada ALTER TYPE en su propia ejecución (bloque por bloque) y espera a que
-- cada uno confirme antes del siguiente.
