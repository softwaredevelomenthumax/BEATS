# Documentación del proyecto BEATS

## 1. Propósito y alcance

BEATS (Bausch Events Approval & Tracking System) es un sistema web para
solicitar, aprobar, documentar y dar seguimiento a eventos educativos o
promocionales, convenios y pagos relacionados con profesionales de la salud
(HCPs/Speakers). El repositorio contiene tres aplicaciones web que comparten
estilos, tipos y acceso a datos, pero se compilan como páginas HTML separadas.

Esta guía describe la implementación que existe en el código fuente de este
repositorio. No sustituye los procedimientos de negocio ni certifica la
configuracion del proyecto Supabase desplegado. El README conserva tambien
historia de reconstrucción y decisiones anteriores; cuando una nota histórica
parezca diferir del código actual o de la base desplegada, hay que verificarlo
antes de operar en producción.

## 2. Aplicaciones

| Aplicación | Entrada de desarrollo | Archivo compilado | Uso |
|---|---|---|---|
| Principal | `index.html` | `bundle.html` | Aplicacion autenticada para crear documentos, gestionar usuarios, aprobar, consultar expedientes e informes. |
| Ejecución en Sitio | `entrada-ejecucion.html` | `ejecucion.html` | Aplicación pública del evento para registrar asistencia, firmas y entrega de muestras. |
| Marquesina | `entrada-marquesina.html` | `marquesina.html` | Tablero público de evento en vivo para mostrar conteos, ubicaciones y ranking de productos. |

Los archivos compilados se generan por separado y llevan JavaScript y CSS
inlineados. Esto los hace autocontenidos respecto al bundle de la aplicación,
pero no convierte al sistema en una aplicación sin red: la autenticación y los
datos dependen de Supabase y las fuentes se cargan desde Google Fonts.

## 3. Tecnologias y arquitectura

- React 19, TypeScript y Vite para las interfaces y la compilacion.
- Tailwind CSS, variables de tema y componentes React accesibles basados en
  Radix UI; `lucide-react` provee iconos y `sonner` muestra notificaciones.
- `@supabase/supabase-js` es el cliente de autenticacion y datos. La
  configuracion compartida esta en `src/lib/supabaseClient.ts`.
- No se usa un router de URL para la aplicacion principal: `src/App.tsx`
  mantiene la pagina activa en estado y representa las paginas correspondientes.
- `src/lib/dbMapping.ts` traduce filas PostgreSQL (`snake_case`) a modelos
  TypeScript de interfaz (`camelCase`) y de regreso.
- Los tipos y valores de negocio se centralizan en `src/lib/enums.ts` y
  `src/types.ts`.
- `src/lib/` contiene acceso a datos y logica de negocio; `src/hooks/`,
  estado y ciclo de vida compartidos; `src/pages/`, pantallas completas;
  `src/components/`, formularios, controles y piezas visuales.

### Flujo de datos

1. La aplicacion principal autentica con Supabase Auth.
2. Busca el perfil del colaborador en `public.usuarios` mediante
   `auth_user_id`; el perfil determina rol, estado y alcance.
3. Las paginas consumen los modulos de `src/lib/`, que consultan tablas o
   funciones RPC de Supabase. Las protecciones definitivas de datos deben
   mantenerse en el backend/base (por ejemplo, RLS); ocultar una opcion del
   menu no sustituye autorizacion del servidor.
4. Los formularios transforman las filas con los mapeadores, validan los
   datos de interfaz y crean o actualizan documentos, aprobaciones y registros
   asociados.
5. Ejecucion y Marquesina son publicas y limitan el acceso a codigos de evento
   y RPC especificas, sin consultar tablas desde esas interfaces.

## 4. Funcionalidades de la aplicacion principal

### 4.1 Inicio, usuarios y permisos

- Inicio y cierre de sesion, persistencia de sesion, cambio voluntario o
  forzado de contrasena y recuperacion de acceso.
- Perfil del usuario ligado a la identidad de Supabase Auth. Una cuenta sin
  perfil asociado o inhabilitada no puede continuar.
- Administracion de usuarios: alta como borrador o confirmacion de cuenta,
  correo, telefono, ubicacion, rol, alcance por empresa/pais, paginas
  permitidas, opciones de firma y habilitacion/deshabilitacion.
- Roles incluidos en el modelo: marketing, comercial, medica, legal,
  compliance, legal_compliance, finanzas, gerencia_general y administrador.
  Las etapas de aprobacion pueden exigir un rol o una persona especifica.
- Una autorizacion especial controla la gestion avanzada de documentos
  firmados; no se deduce simplemente de ser administrador.
- Las opciones visibles se organizan en grupos de navegacion y se condicionan
  por rol, permisos y alcance. La politica de base/servidor sigue siendo la
  autoridad para permitir operaciones.

### 4.2 Documentos y aprobaciones

La aplicacion contempla seis tipos de documento:

1. Solicitud de Evento.
2. MD FMV Checklist.
3. Convenio de Pago a HCP.
4. CAF.
5. Convenio HCP.
6. Notificacion de Pago a HCPs.

Los formularios permiten guardar borradores, enlazar documentos relacionados,
precargar informacion cuando corresponde, enviar a aprobacion y consultar la
cadena de firmas. Segun el documento y la configuracion, se registran actores,
fechas, comentarios, firmas congeladas y trazabilidad de cambios.

Los estados de documento definidos por la aplicacion son Borrador, Pendiente,
Aprobado, Rechazado, Devuelto, Completado y Anulado. Los estados de cada paso
de aprobacion son pendiente, aprobado y rechazado. La disponibilidad exacta de
cada transicion depende tambien de que las migraciones correspondientes esten
aplicadas en la base desplegada.

Capacidades relacionadas:

- Reenviar y devolver documentos en los casos permitidos; solicitar adendas o
  enmiendas segun estado y firmas.
- Abrir y cerrar ventanas temporales de adenda para ciertos documentos.
- Mantener snapshots de formato y contenido legal en flujos que los requieren.
- Previsualizar e imprimir documentos con marca de agua por estado y opciones
  de membrete; el flujo de PDF usa la impresion del navegador y su opcion
  "Guardar como PDF".
- Convenio HCP cuenta con contenido bilingue en los flujos de impresion
  descritos en el codigo.
- Cuando un CAF se elabora en el sistema corporativo externo, BEATS puede
  registrar ese hecho y adjuntar el CAF firmado en el expediente.

### 4.3 Eventos, HCPs y expedientes

- La Solicitud de Evento recoge informacion del solicitante, organizacion,
  evento, presupuesto, ubicacion, participantes, muestras y soportes.
- Los eventos pueden modelar una o varias sesiones, con fecha, lugar,
  ubicacion, asistentes esperados y datos de logistica.
- El repositorio de HCPs/Speakers almacena perfiles, informacion profesional,
  archivos de soporte y participaciones.
- Productos del portafolio pueden vincularse a eventos y a muestras
  planeadas/entregadas.
- El expediente de evento centraliza documentos, archivos, sesiones,
  participacion, fotos, speakers y registros financieros.
- CAFs, convenios, checklists, notificaciones de pago y otros documentos
  pueden vincularse al evento, al HCP o entre si segun el flujo.
- La app ofrece filtros de archivado/preferencias y consultas de documentos
  segun su ciclo de vida.

### 4.4 Administracion y configuracion

Las pantallas administrativas incluyen:

- Usuarios y roles, alcance por empresa/pais y permisos por pagina/persona.
- Configuracion de campos personalizados, reglas de comparacion y etiquetas
  de campos por formulario.
- Catalogos simples y territorios/ciudades por pais.
- Portafolio de productos.
- Formatos de documentos, datos de membrete, logos y valores por empresa.
- Plantillas/versiones legales del Convenio HCP.
- Configuracion de notificaciones.
- Gestion avanzada de documentos firmados, sujeta al permiso especial.
- Backup y restauracion, restringidos a administradores de alcance completo.

### 4.5 Bandejas, informes y auditoría

La navegacion principal incluye tablero de documentos y tareas pendientes. La
aplicación también ofrece:

| Grupo | Pantallas |
|---|---|
| Principal | Tablero de Documentos; Tareas Pendientes. |
| Crear documento | Solicitud de Evento; MD FMV Checklist; Convenio de Pago a HCP; CAF; Convenio HCP; Notificación de Pago a HCPs. |
| Administración de HCPs/Speakers | HCPs/Speakers; Participación de HCPs/Speakers; Visor Documental. |
| Informes y Auditoría | Auditoría de Eventos; Informe por Evento; Expedientes; Asistentes Impactados; Informe de Pagos a HCPs/Speakers; Informe de Speakers; Ejecución de Eventos; Panel en Vivo; Eventos en Vivo; Historial y Auditoría; Indicadores de Uso y Gestión. |
| Configuración | Configuración de Usuarios/Roles; Configuración de Campos/Variables; Configuración de la Plantilla Legal; Configuración de Notificaciones; Backup; Gestión Avanzada de Documentos. |
| Créditos | Créditos. |

Los elementos se muestran según el rol, los permisos asignados y, en ciertas
pantallas, el tipo de administrador. Las consultas incluyen informes de pagos,
speakers y participación, asistentes impactados, ejecución, mapas/eventos en
vivo e indicadores de uso. Las anotaciones de pago conservan su trazabilidad
en los flujos implementados.

### 4.6 Notificaciones, correo y telemetria

- Notificaciones dentro de la aplicacion para tareas, rechazos y resolucion de
  etapas.
- Flujos de correo para eventos configurados mediante funciones Edge y la
  integración de correo del proyecto; el detalle operativo está en
  `supabase/functions/admin-usuarios/README.md` y los scripts SQL relacionados.
- Recordatorios y preferencias de notificacion dependen de las funciones y
  configuracion del proyecto Supabase.
- Telemetria registra actividad de uso como sesiones, cambios de pagina,
  formularios y operaciones de archivos; el sistema contempla desactivacion
  segun su implementacion/configuracion.

## 5. Ejecucion en Sitio

`src/ejecucion/` implementa una aplicacion publica para el equipo que opera un
evento:

- Acceso por codigo de evento.
- Captura de check-in de asistentes, datos de contacto/profesion y consentimientos.
- Captura de firma manuscrita en pantalla.
- Registro de entrega de muestras y firma de confirmacion.
- Registro de personal de fuerza de ventas y consulta de fotos del evento.
- Cola offline en IndexedDB para check-ins y entregas que no pudieron enviarse.
  Se reintenta al recuperar la conexion; el panel de cola permite revisar y
  reintentar operaciones agotadas.

La sincronizacion offline aplica a esas operaciones implementadas; no significa
que toda la aplicacion o todos los archivos queden disponibles sin conexion.
Las operaciones del servidor se realizan mediante las RPC publicas
`validar_codigo_evento_ejecucion`, `crear_registro_participacion`,
`registrar_muestra_entregada` y `resumen_ejecucion_evento`.

## 6. Marquesina

`src/marquesina/` es una pantalla de kiosco que se abre con un codigo de evento.
Presenta el resumen en vivo: conteos de asistentes, tipos de participacion,
ranking de productos y, cuando la funcion ampliada esta instalada, llegadas por
hora, ubicaciones, ciudades, especialidades, sesiones y ultimos registros.
El codigo se conserva localmente en el navegador para no pedirlo en cada
recarga. El acceso al resumen usa la RPC `resumen_ejecucion_evento` y,
opcionalmente, `resumen_ejecucion_evento_ampliado`.

## 7. Datos, archivos e integraciones actuales

- La aplicación del repositorio está cableada a Supabase y PostgreSQL; no está
  implementada una API para SQL Server.
- `src/lib/supabaseClient.ts` inicializa el cliente compartido. El frontend usa
  una clave publica/publishable, no debe contener una `service_role` ni otro
  secreto privilegiado.
- Las tablas y permisos reales dependen de las migraciones SQL de `db/` y de
  la configuracion desplegada en Supabase.
- En el codigo actual, los adjuntos se convierten a Data URL/base64 y se
  guardan en `public.archivos_adjuntos` con metadatos; el limite por defecto
  del cargador es 16 MiB por archivo. Este mecanismo aumenta el tamano de los
  datos por la codificacion base64 y no es Supabase Storage. Debe considerarse
  al planear capacidad y una migracion de archivos grandes.
- La funcion Edge `admin-usuarios` gestiona operaciones administrativas de
  cuenta. Los servicios de correo y otros secretos viven en el entorno de
  backend, no deben trasladarse al HTML del navegador.
- Ejecucion/Marquesina dependen de funciones RPC que deben existir en el
  proyecto. Revisar sus migraciones/definiciones antes de desplegar una version.

### Nota sobre SQL Server

`db/sqlserver_esquema_inicial.sql` es una conversión preliminar del esquema
exportado: crea estructura para una base SQL Server vacia. No migra los datos
de Supabase, las identidades de Supabase Auth, los archivos, las politicas RLS,
las funciones RPC/Edge ni los procesos de correo. Tampoco es el proveedor de
datos usado por el frontend actual. Para que la aplicacion use SQL Server se
necesita una API backend segura, migracion y reconciliacion de datos/archivos,
equivalentes de autenticacion y permisos, conversion de las operaciones SQL/RPC
y cambios coordinados en el cliente web. No ejecutar el esquema inicial sobre
una base de produccion.

## 8. Estructura del repositorio

| Ruta | Contenido |
|---|---|
| `index.html`, `entrada-ejecucion.html`, `entrada-marquesina.html` | Entradas HTML de las tres aplicaciones. |
| `src/App.tsx` | Shell, navegacion y composicion de la app principal. |
| `src/pages/` | Pantallas principales: formularios, tablero, informes, expediente y configuracion. |
| `src/components/` | Formularios, piezas compartidas, archivos, impresion, expediente, mapas y controles de interfaz. |
| `src/hooks/` | Estado compartido de autenticacion, empresa, ventanas, preferencias, membrete y backups programados. |
| `src/lib/` | Acceso a Supabase, mapeo, reglas de negocio, documentos, catalogos, informes, archivos y utilidades. |
| `src/ejecucion/` | Aplicacion publica de Ejecucion en Sitio, RPC y cola offline. |
| `src/marquesina/` | Aplicacion publica de Marquesina, resumen y persistencia local. |
| `db/` | Scripts incrementales PostgreSQL/Supabase, diagnosticos y propuestas; tambien incluye el esquema SQL Server preliminar. |
| `supabase/functions/` | Codigo de funciones Edge presente en el repositorio. |
| `scripts/` | Generacion de bundles, datos geograficos y verificaciones automatizadas. |
| `fixtures/` | Datos de prueba locales. |
| `public/` | Recursos estaticos incluidos en las compilaciones. |
| `docs/` | Documentacion y propuestas tecnicas. |
| `VERSION` | Version mostrada en los bundles y en pantallas de informacion. |

## 9. Desarrollo, compilacion y comprobaciones

Requisitos: Node.js y npm instalados. Desde la carpeta raiz del repositorio:

```cmd
npm install
npm run dev
```

Vite inicia el servidor de desarrollo. Para una prueba accesible desde otros
equipos, Vite admite opciones de host y puerto, pero publicar el servidor de
desarrollo en la red debe ser aprobado por Sistemas/Seguridad; no es el modo
recomendado de alojamiento de produccion.

Comandos definidos en `package.json`:

| Comando | Funcion |
|---|---|
| `npm run typecheck` | Ejecuta la comprobacion de TypeScript (`tsc -b`). |
| `npm run build` | Comprueba tipos y genera una compilacion Vite convencional. |
| `npm run build:bundles` | Comprueba tipos, compila las tres entradas por separado y produce los tres HTML autocontenidos. |
| `npm run verificar` | Ejecuta en orden alfabetico todos los `scripts/verificar_*.mjs`. |
| `npm run lint` | Ejecuta Oxlint. |
| `npm run preview` | Previsualiza una compilacion Vite convencional. |

Para regenerar los archivos que se pueden copiar a un servidor web:

```cmd
npm run build:bundles
```

El proceso esta en `scripts/generar_todos_los_bundles.mjs`; inlinea CSS/JS
mediante `scripts/generar_bundle.mjs`, agrega version/fecha de compilacion y
elimina las carpetas intermedias `dist-*`. Genera los tres archivos de salida
uno por uno; si una compilación se interrumpe, conviene volver a ejecutar el
comando y confirmar que las tres salidas se actualizaron.

## 10. Estrategia de pruebas

Los `scripts/verificar_*.mjs` automatizan flujos con Playwright y fixtures
locales. `scripts/lib/fixtures.mjs` intercepta las llamadas HTTP y simula un
subconjunto de Auth, PostgREST y RPC; por diseno las verificaciones no deben
escribir en el proyecto Supabase real. `npm run verificar` ejecuta la suite
completa de scripts `verificar_*.mjs`.

Las pruebas validan comportamiento del frontend y contratos simulados, no
reemplazan una prueba de integracion contra un ambiente Supabase de prueba, ni
verifican automaticamente que cada migracion SQL este aplicada en produccion.
Antes de una liberacion, comprobar ambas cosas con autorizacion y datos de
prueba.

## 11. Despliegue y operacion

Los bundles pueden servirse desde un servidor web estatico aprobado por la
organizacion. Una vez publicados, sus rutas dependen de la configuracion del
servidor; por ejemplo, la pagina principal puede ser `/bundle.html` o el
administrador puede publicarla como `/`. Las otras paginas son
`/ejecucion.html` y `/marquesina.html`.

Un bundle no crea por si mismo un dominio, un puerto o un sitio de IIS. El
equipo de infraestructura debe configurar alojamiento, DNS, HTTPS y firewall
conforme a las politicas de la empresa. Para funcionar, el navegador debe poder
alcanzar los servicios Supabase autorizados y los dominios externos necesarios.
No alojar datos o servicios productivos abriendo puertos ni exponiendo el
servidor de desarrollo sin aprobacion.

## 12. Consideraciones antes de cambiar de proveedor

Una migracion de Supabase a SQL Server requiere mas que convertir los archivos
`.sql`. Como minimo:

1. Inventariar y exportar datos, adjuntos y usuarios de autenticacion de forma
   protegida.
2. Elegir el destino de archivos grandes (SQL Server o almacenamiento de
   archivos aprobado) y definir acceso, retencion y backups.
3. Construir una API/backend que autentique, autorice y conecte a SQL Server;
   el navegador no debe recibir credenciales de SQL Server.
4. Reemplazar las consultas PostgREST, RPC, Auth, RLS y funciones Edge con
   contratos de backend equivalentes.
5. Migrar y reconciliar datos manteniendo identificadores y relaciones;
   verificar conteos, adjuntos, permisos y flujos de aprobacion en un ambiente
   de prueba.
6. Cambiar el frontend de forma coordinada, ejecutar regresion y planear
   reversa antes del cambio productivo.

Hasta completar esos pasos, Supabase es el backend activo de la aplicacion.
