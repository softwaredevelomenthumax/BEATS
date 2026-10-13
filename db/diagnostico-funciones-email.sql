-- =============================================================================
-- Diagnóstico (parte 2): trae la definición completa de cada función de
-- notificación por correo que ya existe en la base de datos, para
-- confirmar exactamente qué envía cada una, a quién, y si hay riesgo de
-- correos duplicados ahora que el frontend reconstruido (Fase 2, parte 1)
-- también inserta filas en `notificaciones` para los mismos eventos
-- (E1/E20/E24) que ya cubrían los triggers de cada tabla de aprobaciones.
--
-- Corre esto en el Editor SQL del Dashboard de Supabase y pégame el
-- resultado completo (son 11 funciones, puede ser un resultado largo —
-- está bien, lo necesito completo).
-- =============================================================================

select proname, pg_get_functiondef(oid) as definicion
from pg_proc
where proname in (
  'fn_notificar_primera_etapa_caf',
  'fn_notificar_aprobacion_caf',
  'fn_notificar_primera_etapa_convenio',
  'fn_notificar_aprobacion_convenio',
  'fn_notificar_primera_etapa_convenio_hcp',
  'fn_notificar_aprobacion_convenio_hcp',
  'fn_notificar_primera_etapa_evento',
  'fn_notificar_aprobacion_evento',
  'fn_notificar_por_email',
  'fn_notificar_solicitud_restablecimiento',
  'fn_cc_admin'
)
order by proname;
