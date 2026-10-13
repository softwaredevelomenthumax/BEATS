-- Diagnóstico (solo lectura): triggers y funciones que gobiernan el cambio de estado de los documentos.
-- Ejecutar en el SQL Editor de Supabase y enviar el resultado completo.
-- El mensaje «No tienes permiso para modificar este documento en su estado actual.» no existe en el código de la app:
-- lo lanza un trigger/función que vive solo en la base real.
select c.relname as tabla, t.tgname as trigger, pg_get_triggerdef(t.oid) as definicion_trigger,
       p.proname as funcion, pg_get_functiondef(p.oid) as codigo_funcion
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal
  and c.relname in ('convenios_hcp', 'convenios_pago_hcp', 'cafs', 'solicitudes_evento')
order by c.relname, t.tgname;

-- Funciones que contienen el mensaje (por si lo lanza una función llamada desde otra).
-- Se busca en prosrc (código) y se excluyen agregadas/ventana, que no admiten pg_get_functiondef.
select p.proname, pg_get_functiondef(p.oid) as codigo
from pg_proc p
where p.prokind in ('f', 'p')
  and p.prosrc ilike '%No tienes permiso para modificar este documento%';
