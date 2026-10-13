-- Entrega 22b — "No tienes permiso" al guardar una Solicitud de Evento con formato "Virtual".
-- Causa: el formulario guarda País = 'N/A' en eventos Virtuales y las políticas de
-- solicitudes_evento exigen fn_usuario_tiene_acceso_pais(pais), que rechaza 'N/A'.
-- Ajuste mínimo: se conservan TODAS las condiciones vigentes (empresa, creador, rol, estado)
-- y solo se exime la comparación por país cuando pais = 'N/A' (evento sin país).
-- Idempotente. Ejecutar completo.
begin;

drop policy if exists solicitudes_evento_insert on public.solicitudes_evento;
create policy solicitudes_evento_insert on public.solicitudes_evento
  for insert to authenticated
  with check (
    creado_por_id = current_usuario_id()
    and current_rol() = any (array['marketing'::rol_usuario, 'medica'::rol_usuario])
    and fn_usuario_tiene_acceso_empresa(empresa_grupo)
    and (fn_usuario_tiene_acceso_pais(pais) or pais = 'N/A')
  );

drop policy if exists solicitudes_evento_select on public.solicitudes_evento;
create policy solicitudes_evento_select on public.solicitudes_evento
  for select to authenticated
  using (
    fn_usuario_tiene_acceso_empresa(empresa_grupo)
    and (fn_usuario_tiene_acceso_pais(pais) or pais = 'N/A')
  );

drop policy if exists solicitudes_evento_update on public.solicitudes_evento;
create policy solicitudes_evento_update on public.solicitudes_evento
  for update to authenticated
  using (
    creado_por_id = current_usuario_id()
    and estado = any (array['Borrador'::estado_doc, 'Rechazado'::estado_doc])
    and fn_usuario_tiene_acceso_empresa(empresa_grupo)
    and (fn_usuario_tiene_acceso_pais(pais) or pais = 'N/A')
  )
  with check (
    creado_por_id = current_usuario_id()
    and estado = any (array['Borrador'::estado_doc, 'Pendiente'::estado_doc, 'Rechazado'::estado_doc])
    and fn_usuario_tiene_acceso_empresa(empresa_grupo)
    and (fn_usuario_tiene_acceso_pais(pais) or pais = 'N/A')
  );

commit;
notify pgrst, 'reload schema';
