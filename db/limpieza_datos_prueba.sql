-- =============================================================================
-- LIMPIEZA DE DATOS DE PRUEBA — dejar la base de datos lista para empezar a
-- probar desde cero (septiembre 2026).
--
-- ⚠️  ESTE ARCHIVO NO SE APLICÓ AUTOMÁTICAMENTE Y ES DESTRUCTIVO/IRREVERSIBLE.
-- Debe ejecutarse a mano en el SQL Editor del proyecto real de Supabase, y
-- SOLO después de revisar la sección "PASO 0" (que es de solo lectura) para
-- confirmar que la lista de usuarios a conservar es la correcta. No hay
-- deshacer: si algo sale mal, la única recuperación es un backup/point-in-time
-- restore desde el panel de Supabase.
--
-- =============================================================================
-- CORRECCIÓN (segunda versión de este archivo) — por qué cambió de DELETE a
-- TRUNCATE ... CASCADE
-- =============================================================================
-- La primera versión de este script borraba tabla por tabla con DELETE, en
-- el orden manual que se explica más abajo. Al ejecutarla, Supabase devolvió:
--
--   ERROR 23503: update or delete on table "sesiones_ejecucion_evento"
--   violates foreign key constraint
--   "registros_participacion_sesion_ejecucion_id_fkey" on table
--   "registros_participacion"
--   DETAIL: Key (id)=(...) is still referenced from table
--   "registros_participacion".
--
-- Esto es extraño a primera vista porque el DELETE de `registros_participacion`
-- corre en la línea justo ANTES que el de `sesiones_ejecucion_evento` — en
-- teoría no debería quedar ninguna fila que lo referencie. La explicación más
-- probable: `sesiones_ejecucion_evento` / `registros_participacion` son
-- justamente los datos en vivo del Módulo de Ejecución (alguien escaneando un
-- código de acceso, registrando su participación). Si alguien estaba usando
-- ese módulo mientras corría el script, un INSERT concurrente pudo colarse
-- en la ventana de tiempo entre esos dos DELETE — cada DELETE es una
-- sentencia independiente dentro de la transacción, no hay ningún candado
-- que impida que otra sesión inserte una fila nueva justo en el medio.
--
-- La corrección: en vez de once DELETE ordenados a mano, el Evento y TODO lo
-- que cuelga de él se borra con un solo `TRUNCATE ... CASCADE`. Esto arregla
-- el problema de raíz, no solo el síntoma reportado:
--   - TRUNCATE toma un candado exclusivo sobre la tabla Y sobre todas las
--     tablas que dependen de ella ANTES de borrar nada, así que no queda
--     ninguna ventana para que se cuele un INSERT concurrente.
--   - CASCADE hace que Postgres calcule el orden de borrado siguiendo las
--     llaves foráneas automáticamente — ya no depende de que yo haya
--     revisado a mano cada tabla. (De hecho, revisando esto encontré que la
--     primera versión también tenía el orden invertido entre
--     `eventos_codigos_acceso` y `sesiones_ejecucion_evento` — esta tabla
--     referencia a aquella via `codigo_acceso_id` — que muy probablemente
--     iba a producir un SEGUNDO error parecido al ya reportado. TRUNCATE
--     CASCADE elimina también ese riesgo, sin que haga falta encontrar y
--     corregir cada caso parecido uno por uno.)
--
-- Los únicos pasos que SIGUEN usando DELETE (no se puede usar TRUNCATE) son
-- los que llevan una condición (`where ...`): conservar 5 usuarios puntuales
-- (PASO 9) y conservar los archivos adjuntos que todavía usa su firma
-- (PASO 10). Ahí el riesgo de una condición de carrera es mucho menor (nadie
-- más está creando usuarios nuevos mientras se hacen pruebas), así que se
-- dejan como estaban.
--
-- ORDEN DE BORRADO — se revisaron los `FieldSpec[]` reales de cada tabla en
-- `src/lib/{evento,caf,convenio,convenioHCP,fmv,notificacionPago}.ts` para
-- construir el grafo de dependencias real (casi ninguna de estas tablas
-- tiene `on delete cascade` propio — la única excepción confirmada es
-- `evento_speakers_participacion`/`evento_speaker_presupuestos`, ver
-- `agregar_speakers_evento.sql` — con TRUNCATE ... CASCADE esto ya no importa,
-- Postgres lo resuelve solo). Los 6 documentos que cuelgan de un Evento
-- (Convenio de Pago a HCP, CAF, FMV, Convenio HCP, Notificación de Pago) se
-- borran todos en el mismo TRUNCATE CASCADE que el Evento, junto con:
--   - Repositorio del Evento (archivos y registros financieros)
--   - Sesiones planeadas, códigos de acceso, aprobaciones, speakers de
--     participación + sus presupuestos
--   - Lo ya capturado en sitio (Módulo de Ejecución): registros de
--     participación, muestras entregadas, sesiones de ejecución
-- Todos guardan además `speaker_id` → Speakers se borra aparte, después,
-- porque es el PADRE de esas referencias (truncar el Evento nunca necesita
-- tocar sus padres, solo sus hijos).
--
-- Orden final:
--   1. Evento (Solicitud de Evento) y TODO lo que cuelga de él, directa o
--      indirectamente — un solo TRUNCATE ... CASCADE.
--   2. Repositorio de Speakers (completo).
--   3. Notificaciones (campanita), Historial/Auditoría y solicitudes de
--      restablecimiento de contraseña pendientes (quedarían apuntando a
--      documentos/usuarios que ya no existen).
--   4. Todos los usuarios EXCEPTO los 5 indicados más abajo — su fila en
--      `usuarios` Y su cuenta de Supabase Auth (`auth.users`, que a su vez
--      arrastra en cascada sus propias sesiones/tokens — eso lo maneja
--      Supabase automáticamente).
--   5. Archivos adjuntos (`archivos_adjuntos`, los blobs base64 de CVs,
--      RETHUS, fotos, firmas, etc.) que ya quedaron huérfanos — se
--      conservan únicamente los que todavía use la firma registrada de
--      alguno de los 5 usuarios que se conservan.
--
-- NO TOCA (son catálogos/configuración, no datos de prueba): catalogo_valores,
-- campos_personalizados_definicion, etiquetas_campo, configuracion_formatos*,
-- configuracion_fmv, formato_oficial_fmv, fmv_criterios, fmv_criterio_opciones,
-- plantilla_convenio_hcp_version, paises_region*, productos_portafolio,
-- configuracion_integraciones.
-- =============================================================================

-- Para comparar nombres sin depender de tildes al escribirlos acá abajo, el
-- script usa `translate(...)`, que es una función nativa de Postgres — NO
-- depende de la extensión `unaccent` (que en este proyecto no se pudo usar:
-- ni sin calificar ni calificada como `extensions.unaccent` funcionó, lo
-- que indica que no está instalada, o que este rol no tiene permiso para
-- instalarla). `translate` reemplaza cada vocal con tilde y la "ñ"/"Ñ" por
-- su equivalente sin tilde, letra por letra — cubre los 5 nombres de abajo
-- sin necesitar ninguna extensión ni tocar el `search_path`.

-- Ajusta esta lista si hace falta — son los ÚNICOS 5 usuarios que van a
-- quedar en la base al terminar. La comparación ignora tildes/mayúsculas,
-- así que no importa cómo esté escrito el nombre en la fila real.
-- (Sebastián González, Luis Alejandro Méndez Madriz, Lizeth Núñez, Pedro
-- Pablo Martínez, Carmenza Pardo)

-- =============================================================================
-- PASO 0 — SOLO LECTURA. Ejecuta primero ESTA sección sola y confirma que:
--   (a) "a_conservar" trae EXACTAMENTE esas 5 personas, y
--   (b) "a_borrar" no incluye a nadie que en realidad querías conservar.
-- Si algún nombre no aparece en (a) por una diferencia de escritura que el
-- `translate` de abajo no resuelve (por ejemplo un caracter con tilde que
-- no esté en su lista), ajusta el arreglo de nombres o la lista de
-- caracteres de `translate` antes de seguir.
-- =============================================================================
select id, nombre, email, rol, auth_user_id
from usuarios
where lower(translate(nombre, 'áéíóúÁÉÍÓÚñÑüÜ', 'aeiouAEIOUnNuU')) = any(array[
  'sebastian gonzalez', 'luis alejandro mendez madriz', 'lizeth nunez', 'pedro pablo martinez', 'carmenza pardo'
])
order by nombre;
-- ↑ debe traer 5 filas (a_conservar)

select id, nombre, email, rol, auth_user_id
from usuarios
where lower(translate(nombre, 'áéíóúÁÉÍÓÚñÑüÜ', 'aeiouAEIOUnNuU')) <> all(array[
  'sebastian gonzalez', 'luis alejandro mendez madriz', 'lizeth nunez', 'pedro pablo martinez', 'carmenza pardo'
])
order by nombre;
-- ↑ todo lo que aparezca acá se borra en el PASO 3 (a_borrar)

-- =============================================================================
-- A partir de acá, TODO es destructivo. No sigas si el PASO 0 no dio lo
-- esperado.
-- =============================================================================

begin;

-- --------------------------------------------------------------------------
-- PASO 1 — Evento (Solicitud de Evento) y TODO lo que depende de él, directa
-- o indirectamente: los 6 documentos (Convenio de Pago a HCP, CAF, FMV,
-- Convenio HCP, Notificación de Pago) y sus propias tablas hijas
-- (aprobaciones, adendas, ajustes de clausulado), el Repositorio del Evento,
-- sesiones planeadas, códigos de acceso, speakers de participación + sus
-- presupuestos, y lo ya capturado en sitio por el Módulo de Ejecución
-- (registros de participación, muestras entregadas, sesiones de ejecución).
--
-- CASCADE hace que Postgres siga las llaves foráneas automáticamente y
-- calcule el orden correcto solo — no depende de que yo lo haya revisado
-- tabla por tabla a mano. Al correr esto vas a ver una nota (NOTICE) del
-- Editor SQL listando todas las tablas que se vaciaron en cascada — es
-- informativo, no es un error.
-- --------------------------------------------------------------------------
truncate table public.solicitudes_evento cascade;

-- --------------------------------------------------------------------------
-- PASO 2 — Repositorio de Speakers (completo — ya no queda ningún documento
-- de los 6 anteriores que lo referencie; CASCADE queda como red de
-- seguridad por si alguna otra tabla lo referenciara sin que lo haya
-- detectado en la revisión).
-- --------------------------------------------------------------------------
truncate table public.speakers cascade;

-- --------------------------------------------------------------------------
-- PASO 3 — Notificaciones, Auditoría y solicitudes de restablecimiento
-- pendientes (quedarían apuntando a documentos/usuarios ya borrados).
-- --------------------------------------------------------------------------
truncate table public.notificaciones, public.auditoria, public.solicitudes_restablecimiento_password;

-- --------------------------------------------------------------------------
-- PASO 4 — Usuarios: conservar SOLO los 5 indicados (fila en `usuarios` y su
-- cuenta de Supabase Auth). Necesita DELETE con condición (no se puede hacer
-- con TRUNCATE), así que se guarda primero la lista de `auth_user_id` a
-- borrar en una tabla temporal porque, una vez borrada la fila de
-- `usuarios`, ya no habría forma de recuperar ese id para borrar también la
-- cuenta de Auth.
-- --------------------------------------------------------------------------
create temporary table temp_usuarios_a_borrar as
select id, auth_user_id, nombre
from usuarios
where lower(translate(nombre, 'áéíóúÁÉÍÓÚñÑüÜ', 'aeiouAEIOUnNuU')) <> all(array[
  'sebastian gonzalez', 'luis alejandro mendez madriz', 'lizeth nunez', 'pedro pablo martinez', 'carmenza pardo'
]);

delete from usuarios where id in (select id from temp_usuarios_a_borrar);

delete from auth.users
  where id in (select auth_user_id from temp_usuarios_a_borrar where auth_user_id is not null);

drop table temp_usuarios_a_borrar;

-- --------------------------------------------------------------------------
-- PASO 5 — Archivos adjuntos huérfanos (CVs, RETHUS, fotos, firmas, etc.).
--
-- CORRECCIÓN: la primera versión de este PASO asumía que `usuarios.firma_id`
-- era la ÚNICA tabla que podía seguir referenciando `archivos_adjuntos` a
-- esta altura — eso ignoraba que la propia lista "NO TOCA" del encabezado
-- de este archivo ya nombraba `formato_oficial_fmv` y
-- `productos_portafolio` como catálogos que este script NUNCA borra, y
-- ambos pueden apuntar a un archivo adjunto (`formato_oficial_fmv.archivo_id`
-- — la plantilla oficial de FMV subida como PDF/Word — y
-- `productos_portafolio.logo_id` — el logo de un producto del portafolio).
-- Al no estar excluidos, el DELETE los trataba como huérfanos y fallaba
-- justo como se reportó:
--
--   ERROR: 23503: ... viola la llave foránea
--   "formato_oficial_fmv_archivo_id_fkey" en la tabla "formato_oficial_fmv"
--
-- Se revisó `src/lib/*.ts` por completo (specíficamente cualquier columna
-- `*_id` que apunte a `archivos_adjuntos`) para confirmar que estas dos son
-- las únicas referencias vivas de catálogo que faltaban — todo lo demás
-- que referencia `archivos_adjuntos` (speakers, eventos, convenios, CAFs,
-- FMVs, convenios HCP) ya se borra en el TRUNCATE CASCADE del PASO 1/2, así
-- que no hace falta excluirlo acá.
-- --------------------------------------------------------------------------
delete from archivos_adjuntos
  where id not in (select firma_id from usuarios where firma_id is not null)
    and id not in (select archivo_id from formato_oficial_fmv where archivo_id is not null)
    and id not in (select logo_id from productos_portafolio where logo_id is not null);

commit;

-- =============================================================================
-- Verificación final (opcional) — todas estas consultas deberían devolver 0,
-- excepto la de `usuarios` que debe devolver 5.
-- =============================================================================
-- select count(*) from solicitudes_evento;
-- select count(*) from convenios_pago_hcp;
-- select count(*) from cafs;
-- select count(*) from fmv_checklists;
-- select count(*) from convenios_hcp;
-- select count(*) from notificaciones_pago_hcp;
-- select count(*) from sesiones_ejecucion_evento;
-- select count(*) from registros_participacion;
-- select count(*) from speakers;
-- select count(*) from usuarios;  -- debe dar 5
