-- ============================================================================
-- Eliminar empresas del grupo duplicadas (octubre 2026)
-- ============================================================================
-- Pedido explícito del usuario: "necesito una consulta en sql para eliminar
-- dos empresas del grupo que aparecen duplicadas: HUMAX PHARMACEUTICAL y
-- LABORATORIOS GROSSMAN, pero que no puedo verlas desde el aplicativo."
--
-- DÓNDE VIVE "Empresas del grupo" EN LA BASE DE DATOS
-- ----------------------------------------------------------------------------
-- La lista de empresas del grupo que alimenta los desplegables del
-- aplicativo (Solicitud de Evento, FMV, Notificación de Pago, el selector
-- de usuario en "Usuarios y roles", el nuevo selector de compañía del
-- login, etc.) NO es una tabla propia de "empresas" — es un catálogo
-- genérico: la tabla `catalogo_valores` (columnas id, catalogo, valor,
-- orden), filtrada por `catalogo = 'empresasGrupo'` (ver
-- `src/lib/catalogos.ts` y el enum `catalogo_simple` en
-- `src/lib/enums.ts`).
--
-- Ese catálogo SÍ tiene un editor dentro del aplicativo: "Configuración de
-- Campos" → sección "Catálogos de opciones" → catálogo "Empresas del
-- grupo" (componente `EditorCatalogosSimples.tsx`), con botón de eliminar
-- por fila. Si el usuario no las ve ahí, la causa más probable es que las
-- dos filas duplicadas sean textualmente idénticas o casi idénticas (un
-- espacio de más al final, mayúsculas/minúsculas distintas, etc.) y por
-- eso no se distinguen a simple vista cuál de las dos filas idénticas hay
-- que borrar — exactamente el caso que este script resuelve desde SQL,
-- donde sí se puede ver el id real de cada fila.
--
-- IMPORTANTE (coherente con el resto de este proyecto): esto NO borra ni
-- modifica el texto `empresa_grupo` ya guardado en documentos existentes
-- (`solicitudes_evento`, `fmv_checklists`, `notificaciones_pago_hcp`,
-- `usuarios.empresas_grupo`, etc.) — esos quedan intactos tal cual estaban,
-- aunque la opción del catálogo se elimine. Solo se limpia la lista de
-- OPCIONES del desplegable.
--
-- Cómo usar este archivo: ejecutar cada bloque por separado, en orden, en
-- el SQL Editor de Supabase. El paso 1 es de solo lectura (diagnóstico) —
-- revisar su resultado antes de correr el paso 2 (el que borra).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASO 1 (solo lectura): ver exactamente qué filas existen hoy para estas
-- dos empresas dentro del catálogo "empresasGrupo", con su id real y señales
-- que explican por qué podrían verse "iguales" en el desplegable (espacios,
-- mayúsculas).
-- ----------------------------------------------------------------------------
select
  id,
  catalogo,
  valor,
  orden,
  length(valor)            as largo_caracteres,
  (valor <> trim(valor))   as tiene_espacios_al_borde,
  lower(trim(valor))       as valor_normalizado
from catalogo_valores
where catalogo = 'empresasGrupo'
  and lower(trim(valor)) in ('humax pharmaceutical', 'laboratorios grossman')
order by valor_normalizado, orden, id;

-- Diagnóstico complementario (solo lectura): confirma que no hay otra tabla
-- de "empresas" por separado — busca estos dos nombres en cualquier lugar
-- donde el texto libre de empresa_grupo se guarda en documentos, para
-- que quede claro que borrar la opción del catálogo no toca esos registros.
select 'solicitudes_evento' as tabla, empresa_grupo, count(*)
from solicitudes_evento
where lower(trim(empresa_grupo)) in ('humax pharmaceutical', 'laboratorios grossman')
group by empresa_grupo
union all
select 'fmv_checklists', empresa_grupo, count(*)
from fmv_checklists
where lower(trim(empresa_grupo)) in ('humax pharmaceutical', 'laboratorios grossman')
group by empresa_grupo
union all
select 'notificaciones_pago_hcp', empresa_grupo, count(*)
from notificaciones_pago_hcp
where lower(trim(empresa_grupo)) in ('humax pharmaceutical', 'laboratorios grossman')
group by empresa_grupo;


-- ----------------------------------------------------------------------------
-- PASO 2 (destructivo): borra las filas DUPLICADAS del catálogo, dejando
-- una sola fila por nombre (la de menor `orden`, y si hay empate, la de
-- menor `id` — es decir, se conserva siempre la más antigua/la que estaba
-- primero en la lista, y se eliminan las copias de más).
--
-- Si "HUMAX PHARMACEUTICAL" o "LABORATORIOS GROSSMAN" tienen variantes de
-- texto (espacios, mayúsculas) en vez de ser idénticas letra por letra, este
-- paso las trata igual como duplicadas entre sí (se agrupan por
-- `lower(trim(valor))`) y de paso deja la fila que sobrevive con el texto
-- prolijo (sin espacios de más).
-- ----------------------------------------------------------------------------
with filas as (
  select
    id,
    valor,
    orden,
    lower(trim(valor)) as clave,
    row_number() over (
      partition by lower(trim(valor))
      order by orden asc, id asc
    ) as posicion
  from catalogo_valores
  where catalogo = 'empresasGrupo'
    and lower(trim(valor)) in ('humax pharmaceutical', 'laboratorios grossman')
)
delete from catalogo_valores
where id in (select id from filas where posicion > 1);

-- Prolijidad opcional: si la fila que sobrevivió quedó con espacios de más
-- o una mezcla de mayúsculas distinta a la deseada, se puede normalizar el
-- texto así (ajustar el texto exacto entre comillas si se prefiere otra
-- capitalización):
-- update catalogo_valores set valor = 'HUMAX PHARMACEUTICAL'
--   where catalogo = 'empresasGrupo' and lower(trim(valor)) = 'humax pharmaceutical';
-- update catalogo_valores set valor = 'LABORATORIOS GROSSMAN'
--   where catalogo = 'empresasGrupo' and lower(trim(valor)) = 'laboratorios grossman';


-- ----------------------------------------------------------------------------
-- PASO 3 (verificación, solo lectura): confirmar que ya queda una sola fila
-- por empresa.
-- ----------------------------------------------------------------------------
select id, valor, orden
from catalogo_valores
where catalogo = 'empresasGrupo'
  and lower(trim(valor)) in ('humax pharmaceutical', 'laboratorios grossman')
order by valor;
