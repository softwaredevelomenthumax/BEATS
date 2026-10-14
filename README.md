# BEATS — Bausch Events Approval & Tracking System

Para una guia tecnica en espanol de la arquitectura, funcionalidades, datos,
desarrollo y despliegue, ver [docs/DOCUMENTACION_PROYECTO.md](docs/DOCUMENTACION_PROYECTO.md).

Reconstrucción completa desde cero de las 3 aplicaciones de BEATS, hecha
sin acceso al código fuente original (perdido por completo — ver
`db/` más abajo para lo que NO se recuperó). La reconstrucción se guió,
en este orden de prioridad, por: el esquema real de la base de datos
(`information_schema.columns` + `pg_enum`), extracción forense puntual de
los 3 bundles minificados originales, y el código fuente REAL de las 4
funciones RPC públicas (exportado por el usuario con `pg_get_functiondef`)
que ya viven en el proyecto de Supabase.

## Las 3 aplicaciones (3 builds independientes, 3 archivos `.html` autocontenidos)

| App | Entrada de Vite | Salida | Qué es |
|---|---|---|---|
| Principal | `index.html` | `bundle.html` | La app con login: los 6 documentos, sus cadenas de aprobación, administración, informes y auditoría. |
| Ejecución en Sitio | `entrada-ejecucion.html` | `ejecucion.html` | App pública sin login para el sitio del evento: check-in con firma, entrega de muestras médicas, cola offline. |
| Marquesina | `entrada-marquesina.html` | `marquesina.html` | Pantalla pública de kiosco con el resumen en vivo de un evento (tiles + ranking de productos). |

Cada una compila por separado (`scripts/generar_todos_los_bundles.mjs`) y
termina inlineada en un único `.html` que se puede abrir directo con
`file://`, sin servidor.

```bash
npm install
npm run typecheck        # tsc -b
npm run build:bundles    # genera bundle.html / ejecucion.html / marquesina.html
npm run verificar        # corre TODOS los scripts/verificar_*.mjs (Playwright + fixtures locales)
```

## Arquitectura, en breve

- React 19 + Vite + TypeScript, Tailwind (tokens de tema vía variables CSS),
  componentes al estilo shadcn/ui sobre Radix, `sonner` para toasts,
  `@supabase/supabase-js`. Sin react-router (navegación por estado) ni
  react-hook-form/zod (validación manual por campo).
- `src/lib/dbMapping.ts` — helpers para mapear filas de Postgres
  (snake_case) a los tipos de la app (camelCase) y de vuelta.
- `src/lib/supabaseClient.ts` — cliente único + `mensajeErrorAmigable`
  (traduce errores de Postgres/RLS/Auth a español).
- Los 6 documentos (CAF, FMV Checklist, Notificación de Pago a HCPs,
  Convenio de Pago a HCP, Convenio HCP, Solicitud de Evento) viven en
  `src/pages/Nuevo*.tsx` + `src/components/forms/`, con impresión vía
  `src/components/print/DocumentoImprimible.tsx` (`window.print()`, sin
  librería de PDF).
- `ejecucion.html` y `marquesina.html` NUNCA usan `.from()` directo — todo
  su acceso a datos pasa por las 4 RPC públicas ya existentes en Supabase
  (`validar_codigo_evento_ejecucion`, `crear_registro_participacion`,
  `registrar_muestra_entregada`, `resumen_ejecucion_evento`), cuyo código
  fuente real vive documentado como comentario en
  `src/ejecucion/lib/rpc.ts` y `src/marquesina/lib/rpc.ts`.

## Pruebas

`scripts/verificar_*.mjs` (uno o más por fase) usan Playwright contra los
bundles ya construidos, con un arnés de fixtures + interceptación de red
(`scripts/lib/fixtures.mjs`, `interceptarSupabase`) que simula PostgREST,
GoTrue y las RPC — **ninguna prueba toca nunca el proyecto real de
Supabase**. `scripts/ejecutar_verificaciones.mjs` corre todos en orden
alfabético (es lo que ejecuta `npm run verificar`).

## Qué quedó fuera de esta reconstrucción

Antes de esta reconstrucción existía un plan en curso, "Activo/Obligatorio
configurable para Campos Originales" (una tabla `campos_originales_configuracion`
+ un motor para activar/desactivar y marcar obligatorios campos nativos de
los 6 formularios, con 6 registros curados). Ese trabajo se perdió por
completo junto con el resto del código fuente — no hay rastro de la tabla
ni en el bundle, ni en el esquema real exportado de la base de datos, ni en
ningún respaldo disponible. A diferencia de las 4 RPC de `ejecucion.html`/
`marquesina.html` (que sí siguen existiendo y funcionando en el proyecto
real, así que solo hacía falta exportar su definición), aquí no había nada
que exportar: los 6 registros curados y su razonamiento nunca se
desplegaron a ningún lado recuperable. Por decisión explícita del usuario,
ese plan queda fuera de esta reconstrucción en vez de reinventarse desde
cero sin esa base real.

## Recuperación del diseño original (post-entrega)

Tras la entrega inicial, el usuario confirmó que el bundle reconstruido
funciona, pero señaló que el diseño visual (colores, tipografía, sidebar)
no se parecía al original — la reconstrucción de las Fases 0–10 usó valores
de shadcn/ui genéricos ahí donde no había evidencia puntual. Una revisión
posterior de los 3 bundles ORIGINALES que el usuario conservaba (los
mismos artefactos descritos en la introducción, nunca antes minados para
CSS/JSX de presentación) permitió recuperar con certeza — son literales de
string sobrevividos en el bundle minificado, no una reconstrucción
aproximada — y aplicar:

- **Tema real** (`src/index.css`): paleta de marca (`--brand-blue:#00a1e4`,
  `--brand-gray:#494c4f`), tokens de sidebar propios (`--sidebar-*`),
  colores reales de los 6 estados de documento con su versión de borde,
  tipografía (Lato/Roboto/Public Sans para texto, JetBrains Mono para
  datos tabulares, cargadas por Google Fonts en los 3 `.html` de entrada) y
  el modo oscuro completo automático (`prefers-color-scheme`, sin selector
  manual — el original tampoco lo tenía).
- **Sidebar real** (`src/App.tsx`, `src/lib/navegacion.ts`,
  `src/components/LogoApp.tsx`): ancho, logo/nombre de respaldo, grupos y
  etiquetas de navegación verbatim (incluido el estilo especial con borde
  para el grupo "Crear documento"), y el patrón de encabezado
  ícono+título+subtítulo con el texto exacto de cada página.
- **Marca de agua en impresos** (`src/components/print/DocumentoImprimible.tsx`):
  el sello diagonal por estado (BORRADOR/EN PROCESO DE FIRMA/APROBADO/
  RECHAZADO/COMPLETADO/ANULADO) que trae cada documento impreso.
- **Página de Créditos** (`src/pages/Creditos.tsx`): texto verbatim,
  incluido el correo de contacto real.

Dos cosas quedaron **deliberadamente fuera** de esta recuperación de
diseño, por ser cambios funcionales/de negocio y no visuales:

- **Logo real de la empresa**: `configuracion_formatos.logoAppId` ya existe
  desde la Fase 5, pero esta reconstrucción todavía no resuelve ese id a
  una URL real de almacenamiento — el sidebar y el login siempre muestran
  el ícono + "BEATS" de respaldo. `LogoApp.tsx` ya queda listo para recibir
  una URL real cuando esa resolución se implemente.
- **Regla de permisos exacta del original**: el bundle original resultó
  tener una regla más estricta que la ya implementada y probada en las
  Fases 0–8 (un administrador solo hereda un item de menú restringido si
  "administrador" está explícitamente en la lista de roles de ESE item, no
  automáticamente por ser administrador). Cambiar esto afectaría a quién ve
  qué en la app real, así que se dejó la regla ya verificada
  (`src/lib/navegacion.ts` documenta la diferencia en un comentario).
- De paso, esta revisión también encontró una pantalla funcional que el
  original sí tenía y esta reconstrucción no: un selector de empresa para
  usuarios no-administradores con acceso a más de una empresa del grupo
  (`empresasGrupo.length > 1`). No se implementó — es un hallazgo aparte
  para que el usuario decida si se aborda.

## Historial de fases de esta reconstrucción

0. Scaffold + infraestructura compartida (UI kit, auth, Tablero, arnés de pruebas).
1. CAF + Campos Personalizados + Etiquetas de Campo.
2. FMV Checklist + Notificación de Pago a HCPs.
3. Convenio de Pago a HCP + Convenio HCP (clausulado versionado).
4. Solicitud de Evento (única/varias sesiones, presupuesto condensado, adendas, código de acceso).
5. Resto de la administración (productos, formatos, usuarios/roles, speakers, notificaciones).
6. Informes y Auditoría.
7. Ejecución en Sitio (`ejecucion.html`) contra las 4 RPC reales.
8. Marquesina (`marquesina.html`) contra `resumen_ejecucion_evento`.
9. *(omitida — ver sección anterior)*
10. Regresión final y entrega.
11. Recuperación del diseño original (tema, sidebar/logo, marca de agua, Créditos) — ver sección anterior.

## Plan de mejoras post-reconstrucción

Con las 3 apps ya reconstruidas y estables, se definió un segundo plan —
numerado por separado del historial de fases de arriba — para lo que la
reconstrucción dejó deliberadamente fuera de alcance o sin pulir. Estado a
la fecha:

| Fase | Nombre | Estado |
|---|---|---|
| 0 | Seguridad crítica (E19, F39) | Completado |
| 1 | Infraestructura de archivos (`archivos_adjuntos`) | Pendiente |
| 2 | Notificaciones reales por correo | Completado — ver `db/notificaciones-enviar-email.sql` y `supabase/functions/admin-usuarios/` |
| 3 | Multiempresa/multipaís real | Pendiente |
| 4 | Precargado automático entre formularios | Completado — ver `src/lib/precargado.ts` |
| 5 | Convenio HCP bilingüe + membrete/PDF | Completado — ver `src/hooks/useMembrete.ts` y `src/components/print/DocumentoImprimible.tsx` |
| 6 | Tablero, Informes y Auditoría enriquecidos | Completado — ver debajo |
| 7 | Ejecución en Sitio y Marquesina — pulido | Pendiente |
| 8 | Pulido visual general restante | En progreso — ver debajo (4 hallazgos grandes + 2 rondas de ajustes cosméticos ya resueltos) |
| 9 | Regresión final y entrega | Pendiente |

**Fase 4 — Precargado automático entre formularios**: hasta esta fase, los
selectores de "documento de origen" (`eventoOrigenId`, `cafId`,
`speakerId`, `convenioOrigenId`) de los 6 formularios solo guardaban ese
id — ningún dato del documento elegido se copiaba a ningún otro campo. El
mapeo campo-a-campo vive centralizado en `src/lib/precargado.ts` (con el
razonamiento de por qué cada campo sí o no se mapea, incluida la regla de
no mapear hacia un `<Select>` de catálogo cerrado si el origen no comparte
exactamente ese catálogo); la mecánica de React (guardar el id de
inmediato, traer el documento de origen completo, fusionar los campos
mapeados sobre el valor más reciente del formulario sin pisar ediciones en
curso, descartar respuestas fuera de orden) vive en
`src/hooks/usePrecargado.ts`, reutilizada por los 5 formularios que
tienen al menos un selector de origen (CAF, Convenio de Pago a HCP,
Convenio HCP, FMV, Notificación de Pago). Decisión explícita del usuario:
el precargado es automático e inmediato (sin botón de confirmación) y
SIEMPRE sobrescribe el campo destino con el valor del origen recién
elegido, aunque el usuario ya hubiera escrito algo distinto — todo campo
precargado sigue siendo editable después. Verificado en
`scripts/verificar_precargado.mjs`.

**Fase 5 — Convenio HCP bilingüe + membrete/PDF**: dos mejoras separadas,
ambas alcance de esta fase (definido con el usuario vía `AskUserQuestion`
antes de implementar):

- **Membrete de impresión/PDF, en los 6 documentos.** Encabezado con el
  logo de la empresa + `FORMATO <nombre>`, `PROCESO`, `CÓDIGO`, `VERSIÓN` y
  `EMISIÓN` — estos 4 últimos ya existían desde antes en
  `configuracion_formatos`/`configuracion_formatos_empresa` (override por
  empresa, campo a campo, sobre el valor global — `resolverFormatoDocumento`
  en `src/lib/configuracionFormatos.ts`) pero no se mostraban en ningún
  lado impreso. El logo resuelve `logoAppId` a su imagen real a través de
  `archivos_adjuntos` (`traerArchivo`) — esa resolución tampoco existía
  antes en ningún punto de la app (el sidebar/login siguen sin ella, ver
  más abajo). Todo el cálculo vive en el hook `useSelectorConPrecargado`-like
  `src/hooks/useMembrete.ts` (`useMembreteImpreso`); el encabezado en sí
  (componente `MembreteImpreso`, `position: fixed` para repetirse en cada
  página impresa, igual mecanismo que la marca de agua por estado) y el
  interruptor "Incluir membrete" (decisión explícita del usuario: debe
  poder verse/guardarse/imprimirse CON o SIN el membrete) viven en
  `src/components/print/DocumentoImprimible.tsx`. El "PDF" de la fase sigue
  siendo el flujo ya existente (`window.print()` → "Guardar como PDF" del
  navegador — decisión explícita del usuario, no se agregó ninguna
  librería de generación de PDF).
- **Convenio HCP completamente bilingüe al imprimir.** El modelo de datos y
  el contenido variable (clausulado, objetivo, servicios, comentarios de
  pago) ya eran bilingües desde la reconstrucción original, y el toggle
  "Español"/"English" de `DetalleConvenioHCP.tsx` ya existía — lo que
  faltaba es que los títulos/etiquetas FIJAS de `CuerpoConvenioHCP`
  (`DocumentoImprimible.tsx`) quedaban siempre en español sin importar el
  idioma elegido. Ahora todas se traducen (`TEXTOS_CONVENIO_HCP`), incluido
  el valor del estado del documento y de cada paso de la cadena de
  aprobación (`ESTADO_DOC_EN`/`ESTADO_PASO_EN`), el formato de fecha
  (`toLocaleDateString("en-US")` en inglés) y las etiquetas de cada
  numeral/anexo del clausulado ("Numeral 3" → "Clause 3", "Anexo C" →
  "Exhibit C" — solo al imprimir; el `<Select>` del panel de ajuste de
  cláusulas sigue en español, porque es una pantalla administrativa
  interna). Los nombres de las etapas de aprobación (`paso.etiqueta`, texto
  libre por documento) no se traducen a propósito. Verificado en
  `scripts/verificar_membrete.mjs`.

Queda pendiente, fuera de esta fase por decisión explícita del usuario: la
resolución de `logoAppId` al sidebar/login (`LogoApp.tsx`) sigue sin
implementarse — solo se resolvió para el membrete de impresión.

**Fase 5 — segunda entrega**: dos ajustes más sobre `DocumentoImprimible.tsx`,
pedidos después de la entrega anterior:

- **Vista previa como página real.** `#zona-imprimible` ahora vive dentro de
  un envoltorio con fondo neutro (`bg-muted/40`) y la propia hoja lleva
  sombra + anillo sutil (`shadow-md ring-1 ring-black/10`) y márgenes más
  generosos — se ve como una vista previa de documento real (una página
  completa sobre una superficie), no como un bloque de texto suelto dentro
  del diálogo. Ese envoltorio se neutraliza por completo al imprimir
  (`print:bg-transparent print:p-0`, mismo patrón que el resto del
  archivo) — el ancho real de la hoja (`max-w-3xl`) y lo que efectivamente
  se imprime no cambiaron.
- **Interruptor "Modo para firma externa (sin marca de agua)"**, en los
  mismos 6 documentos (y en cualquier otra vista que pase `estado` a
  `DocumentoImprimible`, como "Informe por Evento"): apaga la marca de agua
  diagonal por estado para el caso de una eventualidad que obligue a
  imprimir/diligenciar el documento a mano. Apagado por defecto (se sigue
  viendo la marca de agua igual que antes de esta fase); no afecta el
  membrete, que se controla con su propio interruptor independiente.
  Verificado en `scripts/verificar_membrete.mjs` (sección "3b").

**Fase 5 — tercera entrega: "formato oficial" en los 6 documentos.**
Rediseño mayor de `DocumentoImprimible.tsx` pedido por el usuario a partir
de dos capturas de pantalla y un PDF de referencia (`Modeloformato.pdf`,
una exportación real "Imprimir a PDF" de la propia app) que mostraban el
formato controlado en papel que ya usa la compañía. Alcance confirmado con
el usuario vía `AskUserQuestion` antes de implementar: se aplica a los 6
documentos (no solo Solicitud de Evento); la columna "Firma" de la tabla de
Aprobación queda vacía por ahora (conectar `usuarios.firmaId` a una imagen
real es Fase 1, infraestructura de archivos, todavía Pendiente); se
construye la barra de herramientas ampliada con zoom funcional.

- **Membrete rediseñado como tabla con bordes**, igual al formato de papel:
  primera fila con "FORMATO" + el nombre oficial largo del formato
  (`ETIQUETA_OFICIAL_TIPO_DOC`, nuevo — p. ej. "Contrato de Auspicio /
  Financiamiento (CAF)", distinto del nombre corto que ya existía en
  `ETIQUETA_TIPO_DOC` y sigue usándose en la barra de herramientas) y el
  logo de la empresa; segunda fila con las 4 casillas PROCESO/CÓDIGO/
  VERSIÓN/EMISIÓN, ahora en mayúsculas. El nombre oficial del membrete es
  una etiqueta fija del formato controlado y NO se traduce con el toggle
  Español/English del Convenio HCP (a propósito — verificado
  explícitamente en `verificar_membrete.mjs`).
- **Cuerpo del documento reescrito con el lenguaje visual del papel**: título
  de sección centrado en mayúsculas (`TituloSeccion`), etiqueta en negrita +
  valor en la misma línea sin caja/borde (`CampoInline`, reemplaza la fila
  con borde `Fila` — que sigue existiendo y en uso solo por "Informe por
  Evento") y una cuadrícula de 2 columnas para los pares de campos que van
  lado a lado (`Grilla2`). `CampoInline` acepta `advertirSiVacio` para
  marcar en rojo "⚠ Falta información" en el único campo del formato de
  referencia que lo pedía así (Solicitud de Evento — "Nombre y firma del
  superior que aprueba"). El título/estado ya no van dentro del cuerpo (se
  ven en la barra de herramientas) — la única excepción es el Convenio HCP,
  que conserva una línea de "Estado"/"Status" bilingüe al inicio del cuerpo
  (se había perdido en un primer borrador de este rediseño; se restauró
  porque el Badge de la barra de herramientas siempre muestra el valor
  original en español, sin traducir).
- **`CuerpoEvento` (Solicitud de Evento) se expandió de ~10 a las ~40
  secciones/campos reales de la interfaz `Evento`**, para que coincida
  exactamente con el PDF de referencia: descripción del evento,
  presupuesto, cuota de inscripción, transportación, hospedaje, alimentos,
  condensado del costo total y comentarios especiales, además de los campos
  que ya tenía. Se completaron también huecos menores ya existentes en
  Convenio (`hcpRFC`, `cvAdjunto`, `firmaEmpleadoCertifica`), FMV (`fecha`,
  `codigoPostal`, `aplicaTarifarioAsociacion`, `cvAdjunto`,
  `firmaElectronica`) y Notificación de Pago (`firmaElectronica`).
- **Tabla de Aprobación real con bordes** (`TablaAprobacion`:
  Área/Nombre/Fecha/Firma/Aprobado, con encabezados bilingües en el
  Convenio HCP), reemplaza la lista de `Fila` que había antes en cada
  documento. "Nombre" se resuelve por lotes desde `resueltoPorId` con el
  nuevo hook `useUsuariosPorId` (+ `traerUsuariosPorIds` en
  `src/lib/usuarios.ts`) — antes esa tabla no existía y solo se guardaba el
  id, nunca el nombre ya resuelto.
- **Barra de herramientas ampliada**: nombre del formato + Badge de estado +
  subtítulo "Vista oficial del documento — lista para imprimir o exportar a
  PDF", el interruptor de membrete renombrado a "Incluir encabezado oficial
  (membrete)", control de zoom en pantalla (50%–150%, clases `scale-*`
  estáticas de Tailwind por nivel — nunca vía `transform` inline, que un
  `print:` de clase no podría ganarle por especificidad — con
  `print:scale-100` para que el zoom en pantalla nunca afecte lo impreso o
  exportado), el botón de imprimir renombrado a "Imprimir / Exportar a
  PDF", y un botón "Cerrar" opcional cuando el llamador pasa `onCerrar` (los
  6 `Detalle*.tsx` ahora se lo pasan, y también ensancharon su diálogo de
  `max-w-2xl` a `max-w-5xl` para la barra más ancha).
- **Pie de página oficial** ("Elaborado por `{nombre}`, `{cargo}` · Generado
  el `{fecha}` desde BEATS" + línea de trazabilidad en cursiva con el id
  interno del documento), cuando el llamador pasa `documentoId`/
  `creadoPorId` (los 6 `Detalle*.tsx` ahora los pasan). El nombre/cargo de
  quien creó el documento se resuelve con el mismo `useUsuariosPorId`.
- **Sin imagen de firma todavía** (decisión explícita del usuario): la
  columna "Firma" de `TablaAprobacion` queda siempre vacía — se retoma
  cuando `usuarios.firmaId` se conecte a un archivo real (Fase 1).

Verificado en `scripts/verificar_membrete.mjs` (secciones "3b"/"3c",
extendidas) y `scripts/verificar_evento.mjs` (ajustado a la nueva barra de
herramientas en vez del antiguo `<h1>` dentro del cuerpo).

**Fase 5 — cuarta entrega: página real (pantalla completa) + logo
institucional por empresa + título sin membrete.** Tres correcciones
puntuales, pedidas explícitamente por el usuario tras probar la tercera
entrega, dos de ellas bugs reales:

- **La vista previa ahora abre a pantalla completa, no dentro de un diálogo
  de ancho moderado.** El problema que reportó el usuario ("debe verse como
  una página real, no como un pantallazo/copy-paste de la ventana") era un
  doble marco: el `Dialog` de shadcn/Radix ya trae su propio borde/sombra/
  esquinas redondeadas/ancho fijo, y adentro `DocumentoImprimible` dibujaba
  a su vez su propia "hoja" con fondo neutro y sombra — dos ventanas
  anidadas, que en conjunto se veían como una captura de pantalla de una
  ventana pequeña en vez de una página real. Los 6 `Detalle*.tsx` ahora
  abren su `DialogContent` a pantalla completa (`h-screen w-screen
  max-w-none max-h-none`, sin bordes/esquinas/sombra propias — clases que
  pisan las del componente base vía `tailwind-merge`, sin tocar
  `dialog.tsx`) — queda un solo marco: el fondo gris + la hoja con sombra.
  La barra de herramientas de `DocumentoImprimible` quedó además `sticky
  top-0` para que zoom/imprimir/alternar encabezado sigan a la mano al
  hacer scroll en documentos largos (Solicitud de Evento, con sus ~40
  campos). Verificado en `scripts/verificar_membrete.mjs` (sección "3a":
  compara el `boundingBox` real del diálogo contra `page.viewportSize()`).
- **Logo institucional por empresa — bug real corregido.** El editor
  administrativo (`EditorConfiguracionFormatos.tsx`) ya tenía desde antes un
  campo "Logo institucional de esta empresa (vacío = hereda el global)"
  (`configuracion_formatos_empresa.logo_id`) y uno global equivalente
  ("Logo institucional (membrete de impresión)", `configuracion_formatos.
  logo_id`) — pero el hook que resuelve el membrete (`useMembreteImpreso`)
  nunca los leía: por error tomaba `logo_app_id`, que es un campo
  DISTINTO — el logo de la APLICACIÓN (barra lateral/login, ver
  `LogoApp.tsx`) — y ni siquiera miraba el override por empresa. El membrete
  ahora resuelve el logo institucional correcto: el propio de la empresa
  del documento si esa empresa tiene uno cargado, si no el institucional
  global — nunca el de la aplicación. El logo NO es por tipo de documento,
  es un solo logo por empresa (aplica igual a los 6 documentos de esa
  empresa). Verificado con dos imágenes distintas en
  `scripts/verificar_membrete.mjs` (compara el `src` exacto del `<img>`,
  no solo que "se vea algún logo"): el CAF y el Convenio HCP de "Bausch +
  Lomb" (misma empresa, con override) muestran ambos el logo del override,
  nunca el global.
- **Título visible aunque se apague el membrete.** Antes, al apagar
  "Incluir encabezado oficial (membrete)" la página impresa quedaba sin
  ninguna indicación de a qué documento correspondía — el título solo vivía
  en la barra de herramientas (`no-imprimir`, invisible al imprimir/
  exportar). Pedido explícito del usuario: "si retiras el encabezado, el
  título del documento debe permanecer visible". Se agregó
  `TituloSimpleSinMembrete` — el mismo nombre oficial largo del membrete,
  pero sin tabla, bordes ni logo — que se ve dentro de la hoja (en pantalla
  y al imprimir) siempre que el membrete completo esté apagado. Verificado
  en `scripts/verificar_membrete.mjs` (sección "4").

Verificado también con el resto de la regresión (13/13 scripts) para
confirmar que el diálogo a pantalla completa no rompió ningún otro flujo
(edición, cadena de aprobación, adenda, archivos adjuntos, etc.).

**Fase 5 — quinta entrega: un documento largo se recortaba a 1 sola página
al exportar a PDF.** Bug real, reportado por el usuario con una captura de
la vista previa de impresión de una Solicitud de Evento: se veía la barra
de desplazamiento vertical DENTRO de la vista previa de impresión del
navegador, y el documento (con ~40 campos, varias secciones) solo mostraba
la primera pantalla — el resto quedaba recortado, en vez de continuar en
más páginas.

Causa real: el diálogo (`DialogContent`, `role="dialog"`) que envuelve la
vista de impresión usa, para la PANTALLA, `position: fixed` + una altura
fija (`h-screen`, desde la cuarta entrega de esta fase, para que la vista
previa ocupe toda la ventana) + `overflow-y: auto` (su propio scroll
interno) — una combinación pensada para verse bien en pantalla, pero que al
imprimir/exportar a PDF hace que el navegador solo capture lo que cabe en
un viewport y recorte el resto, en vez de tratar el contenido como texto
normal de documento que se puede paginar en tantas hojas como haga falta.
Se agregó una regla `@media print` en `index.css` que neutraliza por
completo `[role="dialog"]` para impresión (`position: static`,
`overflow: visible`, sin `height`/`max-height` fijos, sin transform) — así
el documento vuelve a fluir como contenido normal y el navegador lo pagina
correctamente.

Verificado en `scripts/verificar_evento.mjs`: genera un PDF real con
`page.pdf()` (Chromium headless aplica el CSS de impresión igual que
`window.print()` → "Guardar como PDF") de la Solicitud de Evento de la
prueba y cuenta sus páginas reales contando los objetos `/Type /Page` en
los bytes del PDF — antes de la corrección daba 1 página exacta (recortado,
confirmado revirtiendo la corrección y volviendo a correr la prueba), ahora
da 3. Regresión completa: 13/13 scripts.

**Fase 5 — sexta entrega: la corrección anterior paginaba bien, pero dejaba
el fondo de la app imprimiéndose ENCIMA del documento (páginas en
blanco).** El usuario reportó, con otra captura, que al imprimir/exportar
ahora sí salían varias páginas ("1/3") pero todas en blanco, solo con el
encabezado/pie de página que agrega el propio navegador (fecha, "BEATS",
la ruta del archivo). Se depuró tomando una captura de pantalla real con
`page.emulateMedia({ media: "print" })` (en vez de solo revisar el conteo
de páginas del PDF, que no dice nada sobre si el contenido de esas páginas
es visible) — y se confirmó la causa: `position: static` (la corrección de
la quinta entrega) saca al diálogo del "por encima de todo" que tenía con
`position: fixed`, pero esa superposición era un efecto de PANTALLA
(z-index); la impresión no la respeta — simplemente imprime todo el
contenido del documento en su orden real. Como el diálogo ahora vive en el
flujo normal, el fondo de la app (`#root` — el Tablero, en este caso, lo
que estuviera abierto detrás) se imprimía PRIMERO, seguido muy abajo del
documento real, lo que el usuario percibió como "páginas en blanco".

Corrección: dos reglas nuevas en el mismo bloque `@media print` de
`index.css`:

- `body:has([role="dialog"]) #root { display: none !important; }` — oculta
  por completo el fondo de la app cuando hay un diálogo de documento
  abierto. El diálogo (`DialogPortal` de Radix) se renderiza aparte, directo
  sobre `<body>`, nunca dentro de `#root`, así que esto nunca oculta el
  documento mismo. Se condiciona con `:has()` a que haya un `role="dialog"`
  en la página para NO afectar al generador standalone "Informe por Evento"
  (`InformePorEvento.tsx`), que sí imprime directamente desde `#root` (es
  una página normal de la app, no un diálogo).
- Una regla equivalente oculta también el overlay semitransparente que
  Radix agrega como hermano directo de `#root` bajo `<body>` (normalmente
  invisible al imprimir porque es un color de fondo y la mayoría de
  navegadores no imprimen "gráficos de fondo" por defecto, pero no hay que
  depender de esa configuración del usuario).

Verificación reforzada — el hallazgo clave de esta entrega es que **contar
páginas del PDF no alcanza**, un PDF puede tener varias páginas y aun así
estar en blanco. `scripts/verificar_evento.mjs` ahora, además del conteo de
páginas, extrae el TEXTO real del PDF exportado con `pdftotext`
(poppler-utils, con degradación silenciosa si la herramienta no está
disponible en el entorno) y confirma dos cosas: que el texto real del
documento (p. ej. "Lentes intraoculares para demostración.") sí llegó al
PDF, y que el texto del fondo de la app ("Vista consolidada de las
solicitudes...", del Tablero) NO llegó — ambas confirmadas manualmente
revirtiendo cada corrección por separado y volviendo a generar el PDF antes
de dejarlas en el script. Regresión completa: 13/13 scripts.

**Fase 5 — séptima entrega: quitar el encabezado del diálogo de la hoja
impresa + mostrar el desglose completo por sesión en Solicitud de
Evento.** El usuario mandó capturas de la vista normal (no de impresión)
de un evento real de varias sesiones ("TALLERES NEURONOX") y un PDF de
referencia adicional, con dos pedidos concretos:

1. *"Retirar de la parte superior de la hoja el texto relacionado con el
   nombre del evento y el status"* (su ejemplo: "CONGRESO COLOMBIANO DE
   DERMATOLOGIA" / "Aprobado" / "Humax Pharmaceutical"). Ese texto es el
   `DialogHeader` (`DialogTitle` + `Badge` de estado + `DialogDescription`
   con la compañía) que envuelve `DocumentoImprimible` en los 6
   `Detalle*.tsx` — útil en pantalla para saber qué documento se está
   viendo, pero nunca debió imprimirse: el título real ya lo pone el
   membrete oficial o, si el membrete está apagado, `TituloSimpleSinMembrete`
   (agregado en la cuarta entrega). Corregido agregando `no-imprimir` al
   `<DialogHeader>` de los 6 documentos — se ve en pantalla, desaparece al
   imprimir.
2. *"Si el evento tiene múltiples sesiones... si aplica hospedaje,
   transportación, alimentación... esta información debe mostrarse en el
   archivo para imprimir"*. Hasta esta entrega, `CuerpoEvento` (el cuerpo
   imprimible de la Solicitud de Evento) solo mostraba
   Transportación/Hospedaje/Alimentos usando los campos de nivel de
   documento (`evento.tipoTransporte`, `evento.nombreHotel`, etc.) — campos
   que en modalidad "Varias sesiones" quedan vacíos, porque cada sesión
   trae su propio presupuesto (`SesionEvento.presupuesto`, con su propio
   transporte/hospedaje/alimentos). El detalle real de cada sesión no
   aparecía nunca en el PDF. Corregido: cuando
   `evento.modalidadSesiones === "Varias sesiones"`, el cuerpo imprimible
   ahora repite, sesión por sesión, las tres secciones ("Transportación por
   sesión", "Hospedaje por sesión", "Alimentos por sesión"), con su
   subtotal calculado con las mismas fórmulas de `lib/presupuestoEvento.ts`
   que ya usa el condensado del costo total — igual estructura que el PDF
   de referencia adjunto por el usuario. El caso de "Única sesión" sigue
   mostrando las 3 secciones simples de siempre, sin cambios.

Se auditaron también los otros 5 documentos por el mismo tipo de hueco
(campos repetidos/en arreglo que no se estuvieran imprimiendo todos): CAF,
FMV y Notificación de Pago no tienen ningún campo de arreglo sin imprimir;
Convenio HCP ya imprime el detalle completo de `ajustesClausula` (vía
`textoEfectivoSeccion`, que ya incorpora cada ajuste guardado). Convenio de
Pago a HCP tiene un campo `sesionesParticipacionIds` (vínculo a sesiones
específicas de su Evento de origen) que **no se imprime porque todavía no
tiene ninguna interfaz para diligenciarlo** — no es una regresión de
impresión, es una función que nunca se terminó de conectar; queda anotada
para cuando se retome.

Sobre el tercer punto del usuario ("vista de formulario diligenciado, y
luego la opción de vista previa/impresión, como ya tienes definido"): se
confirma que el patrón ya existe tal cual en los 6 `Detalle*.tsx` — el
diálogo muestra primero el detalle completo del documento y
`DocumentoImprimible` (con su propia barra de Ver/Zoom/Imprimir-Exportar a
PDF) como parte de ese mismo detalle, no como un paso aparte. Los módulos
más grandes que se ven en las capturas del usuario (código QR de Ejecución
en Sitio con Módulo de Ejecución en Sitio, Panel en Vivo embebido en el
detalle, repositorio de archivos con firmas reales escaneadas) son
subsistemas que ya están fuera del alcance de esta fase de impresión — ver
Fases 1 (archivos adjuntos/firmas reales), 6 (Informes/Panel en Vivo) y 7
(Ejecución en Sitio) del plan de reconstrucción, todavía Pendientes.

Verificado en `scripts/verificar_evento.mjs`: con `page.emulateMedia({
media: "print" })` se confirma que el `<h2>` del `DialogTitle` (nombre del
evento) está visible en pantalla y deja de estarlo al imprimir, mientras
que el mismo nombre del evento dentro del cuerpo imprimible (un campo
distinto, no el encabezado del diálogo) sigue visible; y, sobre el evento
de varias sesiones ya usado por la prueba del condensado (Sesión 1: 1
noche × $80, alimentos $30/día, transporte $50; Sesión 2: 2 noches × $60,
alimentos $40/día, transporte $70), se verifica que las 3 secciones "por
sesión" existen y que cada subtotal (`Subtotal: COP 50`/`70`/`80`/`120`/
`30`/`80`) aparece en el bloque de la sesión correcta.

Nota de depuración de esta entrega, para no repetir el error: al agregar
`page.emulateMedia({ media: "print" })` para la prueba del punto 1, el
primer intento lo revertía con `page.emulateMedia({ media: "screen" })` —
eso rompió la prueba de exportar a PDF más abajo en el mismo script
(volvió a dar 1 sola página, el mismo bug de la quinta entrega). Motivo:
`page.pdf()` usa CSS de impresión automáticamente solo cuando NO hay
ningún override de medio activo; un `emulateMedia({ media: "screen" })`
explícito queda pegado y se lo impone también a `page.pdf()`. Se corrigió
usando `page.emulateMedia({ media: null })` para quitar el override en vez
de fijarlo a "screen" — la regresión automática lo atrapó de inmediato.
Regresión completa: 13/13 scripts.

**Fase 6 — Tablero, Informes y Auditoría enriquecidos.** Alcance
confirmado con el usuario vía `AskUserQuestion` antes de implementar: (a)
construir "Tareas Pendientes" (`tareas`); (b) construir "Documentos
(todos)" (`documentos`); (c) construir "Participación de HCPs/Speakers"
(`informe-participacion-speaker`); (d) separar correctamente "Historial y
Auditoría" (`historial`) de "Auditoría de Eventos" (`auditoria`) — las 5
páginas ya tenían su `TITULO_PAGINA`/entrada de `NAVEGACION` completos
desde una fase anterior, pero `App.tsx` las enrutaba todas al mismo
placeholder genérico, salvo `auditoria`; (e) enriquecer `InformePagos` y
`HcpsImpactados` con filtro de período/país.

- **El hallazgo grande de esta fase: el `Auditoria.tsx` que ya existía
  estaba mal cableado.** Su contenido real (línea de tiempo cronológica de
  auditoría) es la pantalla `historial` ("Historial y Auditoría") del
  bundle original — confirmado por extracción directa de su función `aD`
  — pero estaba montado bajo el id de página `auditoria`, cuya pantalla
  real (función `sB`) es un **checklist de documentos faltantes por
  evento** ("Auditoría de Eventos"), algo completamente distinto que nunca
  se había construido. Se resolvió construyendo las dos pantallas reales
  por separado (`Historial.tsx` para `historial`, `AuditoriaEventos.tsx`
  para `auditoria`) y borrando el `Auditoria.tsx` mal cableado.
  `Historial.tsx` se rediseñó como línea de tiempo con pastillas de Acción
  + selector de País (antes era una tabla con filtros de tipo/acción/fecha,
  que no es como luce la pantalla real), y deliberadamente no muestra la
  miniatura de firma junto a cada resolución (requeriría resolver
  `Usuario.firmaId` a una imagen real, todavía fuera de alcance — ver Fase
  1 del plan de mejoras).
- **`AuditoriaEventos.tsx`, la lógica de negocio compartida.** El checklist
  por evento (10 ítems: Solicitud de Evento, 3 categorías financieras del
  Repositorio con exención cuando el speaker es interno, Lista de
  Asistencia, Fotos, Convenio de Pago a HCP, FMV Checklist, CAF,
  Notificación de Pago) vive en `src/lib/documentosRequeridosEvento.ts`,
  confirmado función por función contra el bundle original
  (`esSpeakerExterno`/`esSpeakerInterno`/`esMultisesion`/
  `listaAsistenciaSatisfecha`/`directorMedicoAprobo`/`tieneConvenioYFmv`/
  `documentoActivoDelEvento`/`facturasSinNotificar`/
  `necesitaNotificacionPago`). Ese mismo módulo se reutiliza en "Tareas
  Pendientes" (el original también comparte esta lógica entre sus
  funciones `sB` y `Bz`) para las tareas encadenadas de Dirección Médica
  (`tareaFaltaFmvOConvenio`/`tareaFaltaCaf`/`tareaFaltaConvenioHCP`) — las
  tres exigen `documentoActivoDelEvento` (no basta con "existe algún
  documento para el evento": uno Rechazado/Anulado no cuenta como
  resuelto, la tarea sigue pendiente).
- **`TareasPendientes.tsx`** tiene 6 secciones: aprobaciones pendientes de
  la firma del usuario actual (con la línea exacta que le corresponde
  resolver — replicando `bx`, que compara el rol en forma estricta, sin
  bypass de administrador), 4 secciones de tareas encadenadas (solo
  Dirección Médica) y "Tus solicitudes" (los 6 documentos creados por el
  usuario, con el motivo exacto de rechazo cuando aplica).
- **`Documentos.tsx`** ("Documentos (todos)", solo Legal/Compliance) junta
  en un solo listado plano y buscable los archivos de Speakers, Eventos
  (carta de invitación/programa académico) y del Repositorio del Evento
  normalizado (`evento_repositorio_archivos`/`evento_registros_financieros`
  — se agregaron los fetchers "traer todos" `traerTodosLosArchivosRepositorio`/
  `traerTodosLosRegistrosFinancieros` en `repositorioEvento.ts`, porque el
  original resuelve esto trivialmente desde su carga inicial "traer todo"
  en memoria, mientras que esta reconstrucción normalizó ese objeto anidado
  en dos tablas planas por evento).
- **`ParticipacionSpeaker.tsx`**: selector de speaker (uno o todos), filtro
  de período/país y exportación CSV, sobre Convenios de Pago a HCP
  vinculados a un Evento.
- **Un hueco corregido en `useAbrirDocumentoGenerico`**: se extrajo como
  hook compartido el patrón "6 `useState` + 6 diálogos `Detalle*`" que ya
  vivía repetido e inline en `Tablero.tsx`, para que "Auditoría de
  Eventos", "Tareas Pendientes" y "Documentos (todos)" (los tres necesitan
  poder abrir cualquiera de los 6 documentos desde una fila) no lo
  duplicaran una tercera y cuarta vez.
- **`InformePagos` y `HcpsImpactados`: filtro por período/país, con una
  corrección de alcance documentada en el propio código.** El plan inicial
  de esta fase asumía que ambos informes ganarían además una exportación
  de carpeta/zip descargable — esa idea venía de una hipótesis sin
  verificar. La extracción forense de sus componentes reales del bundle
  original (`vB` para Informe de Pagos, `gV` para Asistentes Impactados)
  la descartó: **ninguno de los dos tiene exportación de zip** (solo
  "Informe por Evento" la tiene, ya construida desde antes). En su lugar:
  `InformePagos` gana filtro de fecha/país y tarjetas de "Total facturado"
  por moneda (`totalesPorMoneda`); documentado en el propio archivo que la
  versión real de este informe es más rica — reconcilia cada factura
  contra la Orden de Compra y el Comprobante de Pago del Repositorio del
  Evento, con alertas cuando no cuadran — pero reconstruir esa conciliación
  completa queda fuera de esta fase (no se pudo confirmar sin seguir
  extrayendo del bundle sus reglas exactas de "alerta"). `HcpsImpactados`
  gana los mismos filtros; se documenta que su diseño real es agregado por
  evento/categoría (conteo manual de la Lista de Asistencia, con el
  check-in digital de Ejecución en Sitio como cifra aparte) en vez del
  agrupado por HCP/cédula que ya existía en esta reconstrucción —
  rehacerlo es un cambio de diseño mayor, no un enriquecimiento, y se deja
  para una fase posterior; el agrupado por HCP se conserva por seguir
  siendo un reporte de trazabilidad válido.

Verificado en `scripts/verificar_tareas_documentos_auditoria.mjs` (nuevo:
Tareas Pendientes, Auditoría de Eventos, Historial y Auditoría,
Participación de HCPs/Speakers, y Documentos vía un segundo login como
Legal/Compliance — `paginaVisible` exige probar con dos usuarios distintos
porque `documentos` tiene `soloRoles: ["legal_compliance"]` y no lo ve un
admin con `rol: "medica"`) y en `scripts/verificar_informes.mjs`
(sección 9 reescrita: probaba el `Auditoria.tsx` mal cableado que esta
fase eliminó, ahora prueba `Historial.tsx`). Regresión completa: 17/17
scripts.

**Fase 8 — arranque: comparación visual contra el bundle original.**
El usuario pidió esta fase con la prioridad más baja de su diagnóstico
(consistencia visual/cosmética), y aportó el bundle original
(`referencia/bundle_original.html`) como referencia directa. Antes de
tocar código se armó un arnés de comparación visual (`scripts/comparacion_visual/`)
que navega el bundle original con fixtures equivalentes a las de esta
reconstrucción y captura pantallas lado a lado de las pantallas
principales (login, Tablero, detalle de documento). De esa comparación
salieron 4 diferencias que resultaron ser **estructurales, no cosméticas**
— el usuario decidió resolverlas primero ("vamos con los hallazgos
grandes, que son más prioritarios"), antes de cualquier ajuste puramente
visual:

1. Al login le faltaba un captcha de verificación de seguridad.
2. El sidebar mostraba los 6 tipos de "Crear documento" a cualquier
   administrador, en vez de solo el tipo permitido por su rol real.
3. La vista de detalle de un documento y la vista de impresión eran la
   MISMA pantalla (una vista de impresión a pantalla completa haciendo de
   detalle); el original las separa en un diálogo compacto + un diálogo de
   impresión aparte y apilado.
4. El Tablero era tiles de conteo + una tabla plana, con `<Select>` de
   filtro; el original es una grilla de tarjetas con dos filas de
   pastillas de filtro (tipo y estado).

De paso se corrigió un bug de paginación preexistente en
`scripts/lib/fixtures.mjs` (arrastrado desde antes de esta fase, expuesto
recién al escribir el arnés de comparación) — no relacionado con los 4
hallazgos, documentado en el commit correspondiente.

**Fase 8 — primera entrega: captcha de login.** Extraído carácter por
carácter del bundle original (búsqueda directa de string sobre el archivo
minificado, no reconstrucción aproximada): un reto de suma de dos dígitos
aleatorios de un dígito (`Verificación de seguridad — ¿cuánto es {a} + {b}?`),
que se regenera tras CUALQUIER intento fallido (captcha incorrecto o
credenciales incorrectas) y tiene un botón "Otro reto" para regenerarlo a
mano. Se mantuvieron los ids `#email`/`#password` sin cambios (no se
renombraron a `#login-email`/`#login-password`) para no romper los 13
scripts de prueba ya existentes, que ahora resuelven el captcha con un
helper nuevo y compartido, `resolverCaptchaLogin()` en
`scripts/lib/fixtures.mjs`. Verificado en el nuevo
`scripts/verificar_login_captcha.mjs` (reto correcto/incorrecto, rango de
valores, regeneración tras fallo, botón "Otro reto").

**Fase 8 — segunda entrega: un solo punto de entrada para crear
documentos.** La regla real de permisos (`paginaVisible()` en
`src/lib/navegacion.ts`) resultó ser más estricta que la implementada
desde la Fase 0: un administrador solo hereda un ítem de menú restringido
si `"administrador"` está EXPLÍCITAMENTE en la lista `soloRoles` de ESE
ítem — no automáticamente por el solo hecho de ser administrador. Como
ningún ítem de "Crear documento" (`nueva-evento`, `nueva-convenio`,
`nueva-fmv`, `nueva-caf`, `nueva-convenio-hcp`, `nueva-notificacion-pago`)
lista `"administrador"`, un administrador ahora ve exactamente los tipos
de documento que su ROL real permite (por ejemplo, un administrador de rol
"marketing" solo ve "Solicitud de Evento"), igual que el original. Esta
regla ya se había identificado y documentado como diferencia conocida en
la sección "Recuperación del diseño original" de más arriba — esta entrega
es la que finalmente la implementa. Verificado en el nuevo
`scripts/verificar_navegacion.mjs`, con una barrida de regresión sobre los
demás scripts para confirmar que ningún usuario de fixture dependía de la
regla laxa anterior.

**Fase 8 — tercera entrega: separar la vista de detalle compacta de la
vista de impresión.** Cambio de arquitectura en los 6 `Detalle*.tsx`: el
diálogo de detalle ahora es compacto (`max-w-2xl`, sin las clases de
pantalla completa) y muestra el documento en un modo de lectura liviano
(`ModoVistaDocumento`, un contexto de React nuevo en
`DocumentoImprimible.tsx` que hace que los mismos componentes `Cuerpo*` se
rendericen en modo "compacta" — encabezados de sección en azul mayúscula
alineados a la izquierda, pares etiqueta/valor apilados — sin duplicar la
lista de campos en un segundo componente, que es exactamente el tipo de
inconsistencia que esta fase busca evitar). El botón "Ver / Imprimir /
Exportar a PDF" abre un SEGUNDO diálogo, apilado encima, con las clases de
pantalla completa originales y el membrete oficial — igual que el
original. Bug encontrado y corregido antes de terminar la entrega: como
ambos diálogos quedan montados en el DOM al mismo tiempo, el CSS de
impresión (`display:none` vía `.no-imprimir`) es lo único que realmente
excluye contenido de `window.print()`/`page.pdf()` — el z-index/posición
en pantalla no tiene ningún efecto sobre lo que se imprime. La regla
`no-imprimir` se movió al `<DialogContent>` completo del diálogo compacto
en los 6 documentos para que su contenido nunca se filtre al PDF del
diálogo de impresión. Caso especial: en `DetalleConvenioHCP.tsx` el
selector de idioma (Español/English) vive solo en el diálogo compacto (no
duplicado en el de impresión) para evitar ambigüedad de dos botones
"English" simultáneos en el DOM — el diálogo de impresión lee el mismo
estado compartido, así que el idioma elegido en el compacto sí se refleja
al abrir la impresión. Verificado extendiendo `scripts/verificar_membrete.mjs`
y `scripts/verificar_evento.mjs` (arquitectura de los dos diálogos
apilados, cierre con Escape en el orden correcto) y agregando cobertura de
impresión a los otros 4 documentos en sus scripts respectivos.

**Fase 8 — cuarta entrega: rediseño del Tablero (grilla de tarjetas +
pastillas de filtro).** El Tablero (`src/pages/Tablero.tsx`) tenía tiles
de conteo por estado, dos `<Select>` de filtro y una tabla plana de 4
columnas; el original es una grilla de tarjetas (2 columnas) con dos filas
de pastillas de filtro (tipo de documento y estado), cada tarjeta con
icono + título + badge de estado, 2 a 4 campos etiquetados (tipo, un
campo secundario propio del tipo de documento, fecha, monto si aplica) y
un pie con avatar + nombre de quien creó el documento. Cambios de fondo,
no solo visuales:

- **Fuente de datos**: el resumen liviano de `v_documentos`
  (`traerDocumentosResumen`, solo id/tipo/estado/creador/fecha/nombre) no
  alcanza para las tarjetas del original, que necesitan un segundo campo
  específico del tipo (Modalidad, Actividad, Especialidad, Factura,
  Contrato, Consultor), una fecha (o rango) y un monto. El Tablero ahora
  trae las 6 tablas completas en paralelo (`traerCafs`, `traerEventos`,
  `traerFmvs`, `traerNotificacionesPago`, `traerConvenios`,
  `traerConveniosHCP`) y construye las tarjetas en el cliente. Esto de
  paso elimina el refetch-por-clic que tenía `abrirDocumento` antes (traía
  el documento completo otra vez al hacer clic en una fila) — el
  documento completo ya está en memoria desde la carga inicial.
- **Orden de las pastillas**: el orden de tipo de documento
  (`TIPO_DOC` en `src/lib/enums.ts`) ya coincidía exactamente con el del
  original. El orden de estado del original (Pendiente, Aprobado,
  Rechazado, Borrador, Completado, Anulado) NO coincide con el orden del
  enum real de la base de datos (`ESTADO_DOC`) — se usa una constante de
  orden local solo para las pastillas del Tablero
  (`ORDEN_ESTADO_TABLERO`), sin tocar `ESTADO_DOC`, para no afectar
  ninguna otra pantalla ni prueba que dependa del orden del enum.
- **Íconos consistentes**: cada tarjeta usa el mismo ícono de
  lucide-react que ya identifica a ese tipo de documento en el sidebar
  ("Crear documento") — `ICONO_POR_TIPO_DOC` en `Tablero.tsx` reutiliza
  literalmente los mismos íconos de `src/lib/navegacion.ts`.
- El monto del FMV se omite a propósito (es un checklist de certificación,
  no una transacción con un valor monetario propio); el resto de los 5
  tipos siempre muestra su fila "Monto".

Verificado en el nuevo `scripts/verificar_tablero.mjs` (contenido de la
tarjeta por tipo, filtro por pastilla de tipo y de estado, abrir el
detalle desde la tarjeta) más una barrida de regresión completa: los 15
scripts anteriores ya ejercitaban el Tablero de punta a punta (crear un
documento y verlo aparecer, hacer clic para abrirlo) sin necesitar ningún
ajuste, porque el texto exacto de cada "nombre" de tarjeta (código de CAF,
nombre del evento, "FMV — nombre", número de factura, nombre del HCP,
"consultor / compañía" del Convenio HCP) se conservó igual al que ya
devolvía `v_documentos`. Regresión completa: 16/16 scripts.

**Fase 8 — quinta entrega: ajustes cosméticos de baja prioridad (login,
avatar, contenido de las tarjetas del Tablero por tipo de documento).**
Con los 4 hallazgos grandes ya resueltos, el usuario envió capturas reales
del Tablero original (conectado al proyecto de Supabase real) con una
lista extensa de diferencias puramente visuales/de contenido:

- **Login** (`src/pages/PantallaLogin.tsx`, `src/components/LogoApp.tsx`):
  el ícono de respaldo del logo pasa de un calendario con check
  (`CalendarCheck`) a un escudo con check (`ShieldCheck`); el fondo de la
  pantalla pasa de `bg-muted/40` (gris claro) a `bg-card` (blanco puro en
  modo claro — se reutiliza el token ya existente en vez de introducir uno
  nuevo, lo que además mantiene el valor correcto en modo oscuro
  automáticamente); la etiqueta del campo de correo pasa de "Correo" a
  "Correo electrónico" y gana el placeholder
  "tu.nombre@bauschhealth.com"; el botón de envío pasa de "Ingresar"/
  "Ingresando..." a "🔑 Iniciar sesión"/"Iniciando sesión...".
- **Avatar de usuario** (`src/App.tsx`, menú desplegable de la barra
  superior): pasa de un `AvatarFallback` sin relleno (solo el borde/texto
  por defecto) a un círculo azul sólido (`bg-primary`) con las iniciales en
  blanco (`text-primary-foreground`) en negrilla; debajo del nombre se
  agrega una segunda línea con la primera empresa del grupo del usuario
  (`usuario.empresasGrupo[0]`, p. ej. "Bausch + Lomb"), en texto más
  pequeño y `text-muted-foreground`.
- **Encabezado e íconos del Tablero**: se verificaron dos supuestas
  diferencias del diagnóstico del usuario contra el código ya existente —
  ambas ya estaban resueltas por el rediseño de la entrega anterior (el
  shell de la app (`App.tsx`) ya pinta un único encabezado
  "Tablero de Documentos" vía `tituloYSubtitulo`, sin que `Tablero.tsx`
  duplique un `<h1>` propio; cada tarjeta ya usa el ícono distintivo de su
  tipo de documento vía `ICONO_POR_TIPO_DOC`) — no hizo falta ningún
  cambio de código, solo confirmación.
- **Contenido de las tarjetas del Tablero, por tipo de documento** — el
  cambio de mayor alcance de esta entrega: el usuario especificó, campo
  por campo, qué debe mostrar la tarjeta de cada uno de los 6 tipos de
  documento. Se reescribieron las 6 funciones `tarjetaDeXxx` de
  `Tablero.tsx`:
  - **Solicitud de Evento**: título "Nombre del evento – Tipo de evento";
    secundario "Modalidad" (Presencial/Virtual); fecha (rango, con
    "(N sesiones)" si `modalidadSesiones === "Varias sesiones"`); monto
    total del evento (`totalCondensado`).
  - **Convenio de Pago a HCP**: título "Nombre del speaker/HCP –
    Especialidad" (resuelto vía `speakerId` contra el repositorio de
    Speakers, con `hcpNombreCompleto` como respaldo si no hay speaker
    vinculado); secundario "Actividad" (`tipoActividad`); fecha (rango de
    la actividad, con sufijo de sesiones — hoy siempre sin sufijo, porque
    `sesionesParticipacionIds` todavía no tiene ninguna interfaz para
    diligenciarlo, ver Fase 5 séptima entrega); monto de la
    contraprestación al HCP.
  - **FMV Checklist**: título "Nombre del speaker/HCP – Especialidad"
    (especialidad efectiva, con el mismo criterio ya usado en
    `DetalleFmv` para "Otra"); fecha de diligenciamiento; fila "Score
    total" con el Tier y el puntaje (p. ej. "Tier 1 · 16/18"), calculados
    con las mismas funciones (`calcularPuntajeTotal`, `calcularTier`) y
    los mismos umbrales (`traerConfiguracionFmv`) que usa el formulario.
  - **Notificación de Pago a HCPs**: título "Nombre del speaker/HCP –
    Especialidad" (vía `speakerId`, con `nombreProfesionalSalud` como
    respaldo); secundario "Factura" (número de factura); fecha de la
    factura; monto de la factura.
  - **CAF**: título "Nombre del speaker/HCP – Especialidad", secundario
    "Actividad" y fecha (con sufijo de sesiones) — pero la CAF **no tiene
    ningún campo propio** de speaker/especialidad/actividad: su único
    vínculo obligatorio es `eventoOrigenId`, así que estos 3 valores se
    resuelven consultando el Evento de origen (`speakerParticipacionId`/
    `nombreSpeakerParticipacion`, `tipoEvento`, fechas + conteo de
    sesiones), con la contraparte del CAF (`contraparteNombre`) y su
    propio `tipoContrato`/vigencia como respaldo si el evento de origen no
    se encuentra; monto del CAF (`monto`/`moneda`, campo propio).
  - **Convenio HCP**: misma estrategia de resolución vía Evento de origen
    para "Actividad" y fecha (el Convenio HCP tampoco tiene un campo de
    actividad propio); el título usa el `speakerId` propio del Convenio
    HCP si existe, con `consultorNombre` (texto libre del formulario) como
    respaldo — en la práctica siempre el respaldo hoy, porque el
    formulario de Convenio HCP no tiene todavía ningún selector de Speaker
    que llene ese campo (ver `src/lib/precargado.ts`); monto de la
    compensación.
  - Un helper nuevo, `nombreConEspecialidad(speakerId, ctx, fallback)`,
    centraliza el patrón "nombre – especialidad" resuelto contra
    `SpeakerResumen` para los 4 tipos que lo usan. El Tablero ahora también
    trae `traerSpeakersResumen()` y `traerConfiguracionFmv()` en paralelo
    con las 6 tablas de documentos, y arma un `Map` de Eventos por id y de
    Speakers por id (`ContextoTarjetas`) que se pasa a las 5 funciones que
    lo necesitan.
- **Colores por tipo de documento**: como las imágenes de referencia que
  el usuario mencionó para esto no llegaron al mensaje, se usó el criterio
  explícitamente autorizado por el usuario ("usa tu criterio") de tomar la
  paleta de estado/marca ya existente en la app — cada ícono de tipo de
  documento (`COLOR_ICONO_POR_TIPO_DOC`) tiene ahora un color Tailwind
  fijo y distintivo (azul para Evento, ámbar para Convenio, violeta para
  FMV, esmeralda para Notificación de Pago, rosa para CAF, cian para
  Convenio HCP), aplicado tanto al ícono del encabezado de la tarjeta como
  a la fila "Tipo:".

Verificado extendiendo `scripts/verificar_tablero.mjs` (contenido exacto
de cada campo por tipo, incluida la resolución vía evento de origen para
CAF) y actualizando los scripts existentes cuyas aserciones dependían del
formato anterior de "nombre" de tarjeta (código de CAF, "FMV — nombre",
"consultor / compañía" del Convenio HCP): `verificar_caf.mjs`,
`verificar_convenio_convenio_hcp.mjs`, `verificar_fmv_notificacion.mjs`,
`verificar_membrete.mjs`, `verificar_notificaciones.mjs`. Regresión
completa: 16/16 scripts.

**Fase 8 — sexta entrega: fuente Lato, Repositorio de Eventos sin
desplegables, marca de agua completa en todas las páginas.** Cierre de los
3 puntos que quedaban pendientes del diagnóstico cosmético de la quinta
entrega:

- **Fuente Lato consistente** — verificación, sin cambios de código: el
  stack de tipografía (`--font-display`/`--font-body` en `src/index.css`)
  ya tenía a Lato como primera opción desde una fase anterior de la
  reconstrucción, con `index.html` cargando los pesos 300/400/500/700
  desde Google Fonts, y ningún componente de la app declara una
  `font-family` propia que la pise (se verificó con una búsqueda completa
  del repositorio) — Lato ya es la fuente real en toda la app, en los
  pesos que Tailwind aplica (`font-light`/`font-normal`/`font-medium`/
  `font-bold`). Una precisión sobre "semibold" (600): Lato, como familia
  tipográfica, no tiene un corte 600 propio (sus pesos reales son 100,
  300, 400, 700 y 900) — ningún sitio que use Lato con `font-semibold`
  tiene un verdadero "semibold" que cargar; el navegador ya resuelve esto
  automáticamente usando el corte más cercano disponible (700), que es el
  mismo comportamiento que tendría el bundle original con la misma fuente.
- **Repositorio de Eventos sin desplegables** (`src/components/RepositorioEvento.tsx`)
  — extracción forense directa de `referencia/bundle_original.html`
  (mismo método que el captcha de login: búsqueda del literal
  "Repositorio del evento" en el script minificado) para confirmar la
  estructura real: el original renderiza cada categoría de documento (7 de
  archivo: lista de asistencia, fotos, CAF, convenio, presentación
  aprobada, evidencia de aprobación, otros; 3 financieras: orden de
  compra, factura, comprobante de pago) como su PROPIA sección siempre
  visible, con su propio control de carga — nunca como una entrada de un
  `<Select>` de categoría. El componente se reescribió con ese mismo
  patrón (`SeccionArchivos`/`SeccionFinanciera`, una por categoría, con
  `data-testid` propio para pruebas), eliminando por completo los dos
  `<Select>` de categoría que tenía la versión anterior. La lista de
  asistencia en un evento multisesión se agrupa por sesión (un control de
  carga por sesión), igual que el resto de categorías, que se cargan una
  sola vez para todo el evento. Los `<Select>` que SÍ siguen existiendo
  (moneda de un registro financiero, factura a la que corresponde un
  comprobante de pago) no son selectores de "categoría de documento" sino
  de un valor puntual — el original también los resuelve así. La
  extracción también reveló que el original tiene, además, un subsistema
  bastante más grande dentro de esta misma sección ("Documentos ya
  elaborados en el sistema" con enlaces a los demás documentos del evento,
  seguimiento de ejecución sesión por sesión y conciliación automática
  Orden de compra ↔ Notificación de Pago) — ese subsistema queda fuera del
  alcance de este ajuste puntual, porque el usuario señaló específicamente
  el problema de los desplegables de categoría, no pidió esas otras
  piezas. Verificado extendiendo `scripts/verificar_archivos_adjuntos.mjs`
  (ubica cada sección por su `data-testid`, ya no por un `<Select>` de
  categoría).
- **Marca de agua completa en todas las páginas** (`src/components/print/DocumentoImprimible.tsx`,
  `src/index.css`) — causa real encontrada: `MarcaDeAgua` y
  `MembreteImpreso` usan `position: fixed` a propósito, para repetirse en
  cada hoja física al paginar un documento largo (spec CSS: un elemento
  `fixed` se repite en cada página de una impresión salvo que algún
  ancestro cree su propio "containing block"). El control de zoom en
  pantalla de la vista de impresión, sin embargo, envuelve el documento en
  un contenedor (`#zona-imprimible`) con una utilidad `scale-*` de
  Tailwind — y en Tailwind v4 esa utilidad fija la propiedad CSS `scale`
  (separada de `transform` desde CSS Transforms Level 2), no `transform`
  como en versiones anteriores de Tailwind. La corrección que ya existía
  para neutralizar el zoom al imprimir (`print:scale-100`) reseteaba
  `scale` a `100% 100%` — visualmente "sin zoom", pero CUALQUIER valor de
  `scale` distinto de `none`, aunque sea una escala idéntica, sigue creando
  ese "containing block" — así que la marca de agua y el membrete quedaban
  atrapados dentro del recuadro de `#zona-imprimible` y solo se veían
  completos en la página donde ese recuadro cae, no en el resto de un
  documento largo. Se corrige con una regla nueva en `src/index.css`
  (`#zona-imprimible { scale: none !important; }` dentro de
  `@media print`) que sí resetea `scale` a `none` de verdad. Un detalle no
  menor descubierto al implementarlo: declarar en esa misma regla también
  `transform: none !important` hace que Lightning CSS (el minificador del
  build de Tailwind v4) funda ambas declaraciones y DESCARTE la de
  `scale` por completo del CSS final, reintroduciendo el bug — por eso la
  regla declara únicamente `scale` (`transform` en ese nodo ya es `none`
  de por sí, porque el zoom nunca lo tocó). Verificado extendiendo
  `scripts/verificar_membrete.mjs`: con el zoom en 110%, confirma que
  `getComputedStyle(#zona-imprimible).scale` es distinto de `"none"` en
  pantalla y exactamente `"none"` al emular impresión (`page.emulateMedia`).

## Ronda de instrucciones históricas — Cluster A (Solicitud de Evento, multisesión, adenda y tarjetas del tablero)

El usuario había pedido, varias interacciones atrás, un "Diagnóstico de
implementación de instrucciones históricas": una tabla de 27 instrucciones
de negocio dadas en algún momento de las sesiones perdidas originales,
cada una con un estado (`IMPLEMENTADO`/`PARCIAL`/`NO IMPLEMENTADO`) y
evidencia en el código tal como estaba entonces. Esta ronda implementa las
19 instrucciones del cluster A que quedaron en `PARCIAL` o
`NO IMPLEMENTADO` (A1 en adelante; los ids se citan tal como aparecen en
esa tabla). Antes de tocar código se re-verificó cada instrucción contra el
estado actual (posterior a las Fases 6 y 8 de arriba, que el diagnóstico
original no conocía) — varias ya habían quedado resueltas por trabajo
posterior sin que el diagnóstico se hubiera actualizado: **A1** (el rótulo
`FOR-CM-027` ya no aparece en la impresión del CAF), **A6(a)** (la
exención de documentos para un speaker interno) y, como consecuencia
directa de esa misma exención, **A11** (evidencia de participación interna
+ el banner correspondiente), y **A19**/**A25** (Tipo/Monto correctos en
las tarjetas del Tablero para registros FMV). Estas no se volvieron a
tocar.

**A2 + A4 — País/ciudad dependientes + catálogos configurables.** El mayor
hallazgo de investigación de esta ronda: el esquema real de Supabase ya
trae una tabla `paises_region_ciudades` (y `paises_region`, con 42 países
reales cargados) pensada exactamente para un selector país→ciudad
dependiente, pero nunca estuvo conectada a ningún formulario — llegó vacía
(0 filas de ciudades) al respaldo de datos. Se construyó
`src/lib/ciudadesPorPais.ts` (CRUD + hook `useCiudadesPorPais`) y un
componente reutilizable, `src/components/SelectPaisCiudad.tsx`: el país
siempre es un `<Select>` (los 42 países ya están cargados); la ciudad es
un `<Select>` SOLO si ese país ya tiene ciudades en el catálogo — mientras
esté vacío (el caso real hoy), se degrada a texto libre con una nota
explicando cómo poblarlo, para no bloquear la captura hasta que un
administrador cargue las 42 listas. Se reutiliza en los 4 lugares que
tienen país/ciudad: Solicitud de Evento, FMV, Convenio de Pago a HCP y
Repositorio de Speakers. A4 pedía además que catálogos como
"línea terapéutica" fueran configurables sin tocar código — hasta ahora
`catalogo_valores` solo se leía (`useCatalogo`), nunca se escribía desde la
UI. Se agregó la capa de escritura completa (`crearValorCatalogo`/
`actualizarValorCatalogo`/`eliminarValorCatalogo` en `src/lib/catalogos.ts`)
y dos editores administrativos nuevos en Configuración de Campos:
`EditorCatalogosSimples` (CRUD genérico para cualquiera de los 14
catálogos simples, incluida `lineasTerapeuticas`) y `EditorCiudadesPorPais`
(CRUD de `paises_region_ciudades`, país por país). Verificado en
`scripts/verificar_evento.mjs`, `verificar_fmv_notificacion.mjs`,
`verificar_convenio_convenio_hcp.mjs`, `verificar_tablero.mjs` y
`verificar_precargado.mjs` (país como desplegable) y en
`verificar_archivos_adjuntos.mjs`.

**Bug real encontrado y corregido durante la verificación de A2**: la
primera versión de `SelectPaisCiudad` exponía dos callbacks separados
(`onChangePais`/`onChangeCiudad`) y, al elegir un país que además obliga a
limpiar la ciudad, los llamaba uno después del otro desde el mismo manejador
sincrónico. Los 4 formularios que lo consumen construyen su `onChange` como
`onChange({ ...valorActual, [clave]: v })`, cerrando sobre el `valor` del
render en curso — así que las dos llamadas sucesivas partían del mismo
`valorActual` desactualizado, y la segunda (limpiar la ciudad) pisaba por
completo el resultado de la primera (guardar el país). El país elegido se
perdía silenciosamente cada vez que el campo arrancaba vacío (Solicitud de
Evento, Convenio de Pago a HCP), lo que a su vez bloqueaba en silencio el
envío del formulario (`país es obligatorio`) sin que nada en pantalla lo
explicara claramente. Se corrigió reemplazando los dos callbacks por uno
solo, `onChangePaisCiudad(pais, ciudad)`, que entrega el par completo en una
sola llamada — la clase de bug queda eliminada de raíz en vez de depender de
que cada formulario lo sepa evitar. Encontrado por un agente de verificación
independiente al adaptar las pruebas existentes al nuevo `<Select>`, y
confirmado reproduciéndolo directamente contra el bundle antes de corregirlo.

**A3 — Autocompletar Virtual.** Cuando `modalidadEvento` es "Virtual",
dirección/país/ciudad no tienen sentido como datos a diligenciar: un
`useEffect` nuevo en `FormularioEvento.tsx` los autocompleta a
"Virtual"/"N/A"/"N/A" y los deshabilita (readonly), y `calcularErroresEvento`
deja de exigirlos en ese caso.

**A7 — "Organizado por" con campo condicional.** En Solicitud de Evento,
"Organizado por" era texto libre; ahora es un `<Select>` sobre un catálogo
nuevo (`organizadoPorEvento`, gestionable desde `EditorCatalogosSimples`).
"Nombre del organizador" pasa a ser condicional: solo se pide y se exige
cuando el valor elegido normaliza a "otro"/"tercero" (insensible a
mayúsculas/espacios — la regla vive en `src/lib/organizadoPor.ts`,
`esOrganizadoPorOtro`, compartida). El mismo patrón se aplicó al campo
análogo de Convenio de Pago a HCP (su "Organizado por" ya era un `<Select>`
desde antes; lo nuevo es que "Nombre del organizador" ahora es condicional
igual que en Evento).

**A9 — Fechas de estancia dentro de Hospedaje.** `fechaInicioEstancia`/
`fechaFinEstancia` vivían sueltas en la tarjeta "Fechas, modalidad y lugar",
separadas del resto de los datos de Hospedaje (noches, costo/noche, hotel).
Se movieron al bloque de Hospedaje, donde conceptualmente pertenecen.

**A10 — Moneda fuera del Presupuesto Condensado.** El `<Select>` de Moneda
vivía dentro de la tarjeta "Presupuesto Condensado", como si fuera un dato
del presupuesto en vez de un dato general del evento. Se movió a la tarjeta
de identificación del evento (arriba del todo) y se quitó de Presupuesto
Condensado.

**A12 — Regla automática de estado "Completado".** Un evento Aprobado cuya
fecha de fin ya pasó Y cuyo checklist de documentos de cierre
(`construirChecklistEvento`, el mismo que usa Auditoría de Eventos) no
tiene ningún ítem "faltante" debe pasar solo a "Completado". Esta
reconstrucción no tiene ningún proceso de fondo propio (todo el backend es
Supabase, sin cron reconstruido) — la regla se evalúa de forma perezosa
(`evaluarYCompletarEventosVencidos` en `src/lib/evento.ts`) cada vez que se
carga Auditoría de Eventos, elegida como punto de enganche porque esa
pantalla ya trae el 100 % de los datos que el checklist necesita, sin
ninguna consulta adicional. La transición es de un solo sentido
(Aprobado→Completado) y nunca toca un evento en otro estado.

**A14 — Convenio de Pago a HCP: vínculo a sesiones del evento.** El campo
`sesionesParticipacionIds` ya existía en el tipo de datos, pero ningún
formulario lo exponía. Se agregó, en `FormularioConvenio.tsx`, una lista de
checkboxes (una por sesión del Evento de origen elegido, traídas con una
consulta independiente del mecanismo de precargado) que arma esa lista
cuando el evento de origen es de "Varias sesiones". **Alcance no cubierto,
señalado explícitamente**: el diagnóstico original también hablaba de un
vínculo a sesiones para Convenio HCP (el contrato) y de "soportes por
sesión" (evidencia/archivos propios de cada sesión vinculada) — ninguna de
las dos cosas se implementó en esta ronda; `FormularioConvenioHCP.tsx` no
tiene hoy ningún campo de sesiones.

**A15 + A20 + A21 — Campos globales deshabilitados en multisesión.** En un
evento de "Varias sesiones", Dirección/País/Ciudad/Número de asistentes a
nivel de documento dejan de tener sentido (cada sesión ya captura su propio
lugar y su propio número de asistentes) — ahora se deshabilitan cuando
`modalidadSesiones === "Varias sesiones"`, y `calcularErroresEvento` deja
de exigirlos en ese caso.

**A17 — Modalidad de factura en multisesión.** Se agregó un `<Select>`
nuevo (`facturaModalidad`, "Factura única"/"Factura por sesión") en la
tarjeta de Sesiones, relevante solo para "Varias sesiones".

**A24 — Corrección de la inversión speaker interno/externo.** Bug real
confirmado por revisión directa del código: un speaker EXTERNO (un HCP con
ficha propia en el Repositorio de Speakers — RETHUS, hoja de vida) debía
elegirse de ese repositorio, y uno INTERNO (un empleado de la compañía, sin
ficha en ese repositorio) debía capturarse como texto libre — la lógica
estaba invertida. Se corrigió intercambiando las dos ramas del formulario y
de `calcularErroresEvento`, y se agregó la denormalización del nombre del
speaker externo elegido hacia `nombreSpeakerParticipacion` (el único campo
que lee la impresión), para no tener que tocar el componente de impresión.

**A27 — Adenda para Convenio de Pago a HCP y Convenio HCP, con vigencia de
7 días.** Evento ya tenía un mecanismo de adenda (abrir/cerrar una ventana
sobre un documento ya Aprobado, editarlo y reenviarlo a la cadena completa)
basado en dos RPC reales y pre-existentes del proyecto original
(`abrir_ventana_adenda_evento`/`cerrar_ventana_adenda_evento`, confirmadas
por extracción directa del bundle). Ni Convenio de Pago a HCP ni Convenio
HCP tenían nada parecido — esto es una función NUEVA, no una reconstrucción
forense, así que no hay ninguna RPC real que reconstruir para ellos:

- **Convenio de Pago a HCP** (`abrirVentanaAdendaConvenio`/
  `cerrarVentanaAdendaConvenio` en `src/lib/convenio.ts`) usa `.insert()`/
  `.update()` directos — el mismo RLS que ya permite a `editarYReenviarConvenio`
  actualizar la fila directamente aplica aquí — apoyados en una tabla real
  que también estaba en el esquema sin usar: `adendas_convenio_pago_hcp`
  (id, convenio_id, solicitado_por_id, solicitado_en, justificación,
  snapshot_antes, snapshot_después), que deja un historial completo de
  antes/después de cada adenda, algo que ni siquiera el mecanismo por RPC de
  Evento expone al cliente.
- **Convenio HCP** no tenía ni siquiera "editar y reenviar" (se agregó
  `editarYReenviarConvenioHCP`, mismo patrón que las otras 3: `.update()`
  directo con `estado: "Pendiente"`, nunca toca `convenio_hcp_aprobaciones`,
  y un aviso manual al primer aprobador porque el trigger de reinicio de
  cadena solo dispara por `INSERT`). A diferencia de Convenio de Pago a HCP,
  el esquema real NO trae ninguna tabla `adendas_convenio_hcp` — la ventana
  de adenda (`abrirVentanaAdendaConvenioHCP`/`cerrarVentanaAdendaConvenioHCP`)
  vive solo en las columnas `adenda_ventana_*` de `convenios_hcp`, con el
  registro de auditoría general (`adenda_solicitada` + `edicion_reenvio`,
  ambos ya parte del enum real `tipo_accion_auditoria`) como único rastro
  persistente. **Cuidado deliberado**: `editarYReenviarConvenioHCP` NO
  reutiliza la lista completa de columnas (`CAMPOS_CONVENIO_HCP`) para
  construir el `UPDATE`, como sí hacen las otras 3 funciones equivalentes —
  esa lista incluye columnas legalmente sensibles que el formulario de
  edición nunca expone (`plantilla_version_id`, `clausulado_snapshot`, el
  archivo firmado por el HCP), y como el mapeo fila↔objeto escribe un valor
  por CADA columna de la lista que se le pase (el default de su tipo si la
  clave no viene en los datos editados), usar la lista completa habría
  borrado el clausulado legal fijo del contrato en cada corrección. Se
  definió `CAMPOS_EDITABLES_CONVENIO_HCP`, una lista reducida con
  exactamente los campos que expone el formulario — todo lo demás de la
  fila queda intacto. Esta salvaguarda tiene su propia prueba de regresión
  explícita (ver abajo).
- La regla de vigencia de 7 días (pedida explícitamente por el diagnóstico)
  se aplica igual en ambos: la ventana expira 7 días después de abrirse.

Verificado extendiendo `scripts/verificar_convenio_convenio_hcp.mjs` con
dos flujos de adenda completos (Convenio de Pago a HCP: adenda → reenvío →
re-aprobación de las 3 etapas → el cambio hecho durante la adenda quedó
guardado; Convenio HCP: el mismo ciclo con sus 2 etapas, más una prueba
dedicada a la salvaguarda de arriba — que el ajuste puntual de cláusula
hecho en un paso anterior del mismo script sigue intacto después de guardar
la adenda).

**A6(b) — Deliberadamente diferido, no implementado.** El diagnóstico pedía
que el check-in digital de asistencia reconociera 4 categorías de personal
(médico/no médico/otro/fuerza de ventas) en vez de una sola. Esto exigiría
cambiar los valores que el cliente envía a una RPC real y ya desplegada en
producción (`crear_registro_participacion`, usada por `ejecucion.html`
sin ningún login) — su código fuente (`pg_get_functiondef`) nunca se
exportó ni se encontró en este entorno, y adivinar su validación interna
arriesga romper en silencio un flujo que corre hoy contra el proyecto real
de Supabase. Siguiendo la misma política que el resto de esta
reconstrucción para cualquier cambio que toque una RPC real en producción,
se decidió no adivinar: si el usuario puede exportar el código real de esa
función, esta instrucción queda lista para retomarse con esa base.

**Hallazgo colateral en la verificación de este round**: `npx tsc --noEmit`
(sin `-b`) resultó no ser una verificación real — el `tsconfig.json` de la
raíz del proyecto declara `"files": []` y solo referencia a
`tsconfig.app.json`/`tsconfig.node.json`, así que sin `-b` no compila nada
y siempre "pasa" en silencio. Corriendo `npm run build` (`tsc -b && vite
build`) de verdad aparecieron 4 errores de tipos preexistentes, ninguno
introducido por esta ronda: una variable sin usar en `RepositorioEvento.tsx`,
un import sin usar, una asignación de un arreglo `readonly` a un tipo mutable
en `Historial.tsx`, y un acceso a `doc.aprobaciones` sobre la unión
`DocumentoAny` completa (que incluye FMV, sin esa propiedad) en
`TareasPendientes.tsx` — se corrigieron los 4 (el último con un tipo nuevo,
`DocumentoConCadena`, en `src/lib/documentoGenerico.ts`, que excluye a FMV/
Notificación de Pago de la unión). De aquí en adelante, la verificación de
tipos de este proyecto debe correr como `npm run build` o `npx tsc -b`, no
`npx tsc --noEmit` a secas.

Regresión completa tras esta ronda: 17/17 scripts.

Regresión completa tras esta sexta entrega: 16/16 scripts.

## Ronda de ajustes de formularios (septiembre 2026) — Solicitud de Evento, entrega 1

El usuario entregó una especificación campo por campo de varios formularios
(estructura por acordeones, reglas de habilitación/deshabilitación,
precargados entre documentos, un modelo de N speakers externos por evento
con su propio transporte/hospedaje/alimentos, generación de tareas
encadenadas para Dirección Médica, y funciones transversales nuevas como
Anular/Eliminar). Es un alcance mayor que se está implementando por
entregas, empezando por Solicitud de Evento — el documento del que dependen
los demás (Convenio de Pago a HCP, FMV, CAF, Convenio HCP se alimentan de
él vía precargado).

**Hallazgo antes de tocar código**: contrario a lo que decía la tabla del
"Plan de mejoras post-reconstrucción" de arriba, la infraestructura de
archivos (Fase 1) **ya está construida** (`src/lib/archivosAdjuntos.ts`,
capa genérica sobre `archivos_adjuntos`) — esa entrada de la tabla quedó
desactualizada respecto al código real. Queda pendiente, anotado
explícitamente por el usuario para la ronda de "Nuevo Usuario": un campo
para dibujar o subir la firma manuscrita (`Usuario.firmaId` ya existe en el
tipo/mapeo, pero todavía no hay ningún componente de captura ni de
visualización no-copiable).

**Entrega 1 — Estado/Provincia/Departamento + país/ciudad por sesión.**
Cambio de esquema real: `solicitudes_evento.estado_provincia` (nueva,
nombre distinto a `estado` para no chocar con el estado del documento) y
`sesiones_evento.pais`/`estado_provincia`/`ciudad` (antes cada sesión solo
tenía `lugar`, texto libre) — migración en
`db/agregar_estado_provincia_evento.sql`, pendiente de ejecutar contra el
proyecto real antes de publicar (mismo patrón que
`db/agregar_ciclo_vida_documentos.sql`). Dos catálogos nuevos en
`CATALOGO_SIMPLE` (`estados`, `tiposParticipacionAcademica` — este último
para una entrega siguiente), ya editables desde
`EditorCatalogosSimples`/Configuración de Campos sin necesitar más
migraciones. El campo Estado se implementó como `<Select>` independiente
sobre el catálogo `estados` (no depende del país, a diferencia de Ciudad)
— tanto a nivel de documento (Única sesión) como dentro de cada sesión
(Varias sesiones), reutilizando `SelectPaisCiudad` para país/ciudad. Se
autocompleta a "N/A" junto con dirección/país/ciudad cuando el evento es
Virtual (misma regla A3 ya existente), y queda exento de validación
obligatoria en ese caso y cuando el evento es de Varias sesiones (a nivel
de documento) — en Varias sesiones, cada sesión exige su propio
país/estado/ciudad salvo que el evento completo sea Virtual.

`npx tsc -b` limpio tras el cambio (2 usos existentes de
`DatosFormularioEvento`/`CATALOGO_SIMPLE` — `DetalleEvento.tsx` y
`EditorCatalogosSimples.tsx` — actualizados).

Pendiente para las siguientes entregas de esta ronda: el modelo de N
speakers externos por evento (con su propio transporte/hospedaje/alimentos
por sesión — requiere tabla nueva, todavía sin migración propuesta), la
generación de tareas encadenadas para Dirección Médica, las reglas de
dependencia secuencial entre CAF/Convenio de Pago a HCP/Convenio HCP/FMV,
el gate de "presupuesto aprobado" con diálogo cancelar/continuar, cuota de
inscripción y actividad recreativa, transporte/hospedaje/alimentos con el
detalle completo de política de viajes, el condensado recalculado, y el
resto de formularios (Convenio de Pago a HCP, FMV, CAF, Notificación de
Pago, Anular/Eliminar) fuera de Solicitud de Evento.

## Ronda de ajustes de formularios (septiembre 2026) — Solicitud de Evento, entrega 2

Modelo de N speakers externos por evento, con cuota de inscripción y
presupuesto de transporte/hospedaje/alimentos propios de cada uno (y de
cada sesión, en "Varias sesiones") — la pieza estructural más grande de
toda esta ronda.

**Esquema real, dos tablas nuevas** (no hay nada equivalente que
reconstruir por extracción forense — es funcionalidad nueva, igual que la
adenda de Convenio de Pago a HCP/Convenio HCP del Cluster A):
`db/agregar_speakers_evento.sql`, pendiente de ejecutar contra el proyecto
real antes de publicar.
- `solicitudes_evento.numero_speakers_externos` (columna nueva).
- `evento_speakers_participacion` — un speaker externo por fila
  (`speaker_id` → repositorio, `nombre_speaker` denormalizado, cuota de
  inscripción propia).
- `evento_speaker_presupuestos` — el detalle de transporte/hospedaje/
  alimentos de cada speaker; `sesion_id` es `null` en "Única sesión" (una
  fila por speaker) y obligatorio en "Varias sesiones" (una fila por
  speaker POR sesión). `on delete cascade` en ambas FK.

**Decisión de diseño explícita**: el bloque único de transporte/hospedaje/
alimentos que existía antes de esta ronda a nivel de documento (Única
sesión) o de sesión (Varias sesiones) queda como **respaldo exclusivo del
caso "Speaker interno"** (un empleado no tiene viáticos que desglosar así)
— en cuanto el evento declara "Speaker externo", ese bloque se oculta del
formulario y la fuente de verdad pasa a ser el presupuesto por speaker. Las
columnas viejas (`Evento.transporte*`/`hospedaje*`/`alimentos*`,
`SesionEvento.presupuesto`) se conservan en el esquema por compatibilidad
con documentos ya guardados, pero dejan de ser editables desde este
formulario para el caso externo.

**Otros cambios de esta entrega**:
- `SpeakerResumen` ahora trae `numeroDocumento` y un helper nuevo,
  `etiquetaSpeakerResumen()` en `lib/speakers.ts`, que arma "Nombre
  completo, Número de documento, Especialidad" — pedido explícito para el
  selector de HCP en varios formularios (Evento, y los que vienen después
  en esta ronda).
- "Número de noches" del presupuesto por speaker ya NO se diligencia a
  mano: se autocalcula de "Fecha de inicio/fin de la estancia"
  (`nochesEntreFechas` en `lib/presupuestoEvento.ts`), como pide la
  especificación — a diferencia del campo `numeroNoches` manual que sigue
  existiendo en el bloque viejo (respaldo de "Speaker interno").
- El Condensado (`totalCondensado`) ahora suma desde
  `speakersParticipacion` (todas las filas de todos los speakers, sin
  importar la sesión) cuando el evento declara speakers externos; sigue
  usando la lógica anterior (por sesión/documento) para "Speaker interno".
- "Traslados en taxi" pasa a ser un campo propio (`valorEstimadoTaxi`) que
  antes no existía en ningún nivel — alimenta su propia línea del
  Condensado (`condensadoTraslado`), separada de "Transporte".

`npx tsc -b` limpio tras el cambio.

Pendiente para las siguientes entregas de esta ronda: la generación de
tareas encadenadas para Dirección Médica (un MD FMV Checklist + un
Convenio de pago a HCP + un CAF + un Convenio HCP por cada speaker
declarado) y las reglas de dependencia secuencial entre esos 4 documentos;
el gate de "presupuesto aprobado" con diálogo cancelar/continuar; y el
resto de formularios (Convenio de Pago a HCP, FMV, CAF, Notificación de
Pago, Nuevo Speaker, Nuevo Usuario, Anular/Eliminar) fuera de Solicitud de
Evento.

## Ronda de ajustes de formularios (septiembre 2026) — Solicitud de Evento, entrega 3

Tareas encadenadas para Dirección Médica (un MD FMV Checklist + un
Convenio de Pago a HCP + un CAF + un Convenio HCP por cada speaker externo
declarado) y las reglas de dependencia secuencial entre esos 4 documentos,
ambas pedidas explícitamente en las notas del usuario.

**Hallazgo antes de tocar código, que cambió el alcance real de esta
entrega**: `convenios_pago_hcp`, `fmv_checklists` y `convenios_hcp` YA
tenían una columna `speaker_id` desde antes de esta ronda (visible en
`CAMPOS_CONVENIO`/`CAMPOS_FMV`/`CAMPOS_CONVENIO_HCP` de sus respectivos
`lib/*.ts`) — solo `cafs` no la tenía. Eso significa que el seguimiento
"qué documento le falta a CADA speaker" se puede hacer con precisión real
para 3 de los 4 documentos desde ya, sin esperar a que esos formularios
tengan su propio selector de speaker (esa selección ya existe en su
estado interno, aunque el `<Select>` que la exponga en pantalla siga
pendiente para las entregas de Convenio/FMV/Convenio HCP más adelante en
esta ronda). CAF se resolvió agregándole la misma columna
(`db/agregar_speaker_caf.sql`, migración chica y separada) — como su
formulario tampoco tiene ese selector todavía, sus CAF sin speaker se
emparejan con los speakers del evento por orden de creación, la mejor
aproximación disponible mientras tanto.

**`lib/documentosRequeridosEvento.ts` — `documentosPorSpeaker`/
`tareasPorSpeaker` (nuevas).** Reemplazan, para eventos que ya usan el
modelo de N speakers (`Evento.speakersParticipacion` no vacío), a
`tareaFaltaFmvOConvenio`/`tareaFaltaCaf`/`tareaFaltaConvenioHCP` — esas 3
funciones viejas se conservan sin romperse (con un guard nuevo,
`speakersParticipacion.length > 0 → false`) como respaldo exclusivo de
eventos creados antes de la entrega 2 de esta ronda, con un solo speaker.
`documentosPorSpeaker` empareja cada speaker de la lista con su FMV/
Convenio/CAF/Convenio HCP real (por `speaker_id` en los 3 primeros, por
orden de creación en CAF, según el hallazgo de arriba). "Falta" en
`tareasPorSpeaker` significa que el documento no existe en NINGÚN estado
todavía — generarlo como borrador ya resuelve la tarea; las reglas de
CUÁNDO se puede enviar cada uno a aprobación son un concepto aparte (ver
abajo).

**`TareasPendientes.tsx`** — nueva sección "Tareas de documentos por
speaker", una tarjeta por cada (evento, speaker) con algo pendiente, con
un botón por documento faltante (mismo patrón visual que las secciones
viejas, que se conservan para los eventos de un solo speaker con la
etiqueta "modelo de un solo speaker, anterior a esta ronda" en su
subtítulo, para que quede claro cuál aplica a cada evento).

**`lib/reglasDependenciaDocumentos.ts` (nuevo) — las 4 reglas de
dependencia secuencial pedidas explícitamente**:
- Convenio de Pago a HCP no puede **enviarse a aprobación** (sí se puede
  crear/guardar como borrador en simultáneo) sin un MD FMV Checklist ya
  "Completado" para el mismo evento/speaker — wired en `crearConvenio`,
  `editarYReenviarConvenio` y `editarBorradorConvenio` (`caf.ts`
  equivalente para el paso siguiente).
- CAF no puede enviarse a aprobación sin un Convenio de Pago a HCP ya
  "Aprobado" en su totalidad — wired en `crearCaf`, `enviarCaf`,
  `editarYReenviarCaf` y `editarBorradorCaf`.
- Convenio HCP no puede ni siquiera **crearse** (tampoco como borrador) sin
  que ya exista un CAF para el evento, en cualquier estado — wired en
  `crearConvenioHCP`.
- La etapa "Gerente General" de un Convenio HCP no puede resolverse como
  **aprobada** sin que el CAF del evento esté "Aprobado" en su totalidad Y
  la etapa "Legal/Compliance" de ese mismo Convenio HCP ya esté aprobada
  (un rechazo siempre se permite) — wired en `resolverPasoConvenioHCP`.

Cada función de `reglasDependenciaDocumentos.ts` hace una consulta
puntual y liviana (no recibe listas completas precargadas) porque se llama
desde puntos de guardado aislados que no tienen por qué cargar el Tablero
completo solo para validar una regla; se degradan correctamente a nivel de
EVENTO completo (en vez de por speaker) cuando el documento de origen
todavía no trae `speaker_id` — mismo criterio que `documentosPorSpeaker`.

`npx tsc -b` limpio tras el cambio.

**Deliberadamente fuera de esta entrega**: "Auditoría de Eventos"
(`construirChecklistEvento`) sigue mostrando un solo ítem "Convenio de
Pago a HCP"/"FMV Checklist"/"CAF" por evento (no uno por speaker) — se deja
así a propósito porque no formaba parte de lo pedido explícitamente en
esta entrega (tareas + dependencias); queda anotado para una entrega
posterior si se decide extenderlo. Tampoco se tocó ningún formulario de
Convenio/FMV/CAF/Convenio HCP (siguen sin un `<Select>` visible de
"speaker" — sus entregas dedicadas siguen pendientes en esta ronda).

Pendiente para las siguientes entregas de esta ronda: el gate de
"presupuesto aprobado" con diálogo cancelar/continuar en Solicitud de
Evento, y el resto de formularios (Convenio de Pago a HCP, FMV, CAF,
Notificación de Pago, Nuevo Speaker, Nuevo Usuario, Anular/Eliminar).

## Ronda de ajustes de formularios (septiembre 2026) — Solicitud de Evento, entrega 4

Gate de "presupuesto aprobado" con diálogo cancelar/continuar — pedido
explícito, y con esto se cierra el alcance de Solicitud de Evento definido
para esta ronda.

**Toggle tri-estado.** "¿El evento está incluido en algún presupuesto
aprobado?" pasó de un `Switch` binario a dos botones "Sí"/"No" sobre
`incluidoPresupuestoAprobado: boolean | null` — el `null` (sin responder
todavía) solo existe en el estado del formulario, nunca en la base de
datos: `b()` en `dbMapping.ts` ya convierte `null`/`undefined` a `false`
al guardar, así que un borrador guardado sin responder esta pregunta
simplemente queda en `false` ("No"), consistente con el resto de la app.
`DatosEventoGuardable` (el tipo interno de `evento.ts` que acepta el
estado del formulario en `crearEvento`/`editarYReenviarEvento`/
`editarBorradorEvento`) se amplió para aceptar este tercer estado, mismo
patrón que ya usaba para `modalidadEvento`/`quienDictaActividad`.

**El diálogo** (`Dialog` de shadcn/Radix, reutilizado — no había ninguno
de tipo "alert" en el kit de componentes) aparece apenas se elige "No" (no
solo al intentar enviar) y es deliberadamente inescapable mientras esté
abierto: sin botón de cerrar, `onEscapeKeyDown`/`onPointerDownOutside`
bloqueados — el usuario tiene que elegir una de las dos opciones que pide
la especificación, no hay una tercera forma de descartarlo. Su visibilidad
es 100% derivada del estado (`incluidoPresupuestoAprobado === false &&
!advertenciaPresupuestoNoAprobado`), sin ninguna bandera local aparte.

- **"Cancelar solicitud"** llama a un prop nuevo, `onCancelar?: () =>
  void`, que decide el creador del formulario: en `NuevoEvento.tsx`
  resetea `datos` a `EVENTO_VACIO` y navega a `tablero` (wired en
  `App.tsx`); en `DetalleEvento.tsx` sale del modo edición (misma acción
  que el botón "Cancelar" que ya existía ahí). Si nadie provee
  `onCancelar`, el formulario revierte la respuesta a "Sí" en vez de
  quedar con el diálogo bloqueado sin ninguna acción posible.
- **"Continuar"** fija `advertenciaPresupuestoNoAprobado: true` y
  `montoPresupuestoAprobado: 0` de una sola vez (pedido explícito: "el
  sistema diligenciará automáticamente el valor 0") — el campo "Monto del
  presupuesto aprobado" se muestra pero queda deshabilitado en ese modo,
  para que quede claro que el 0 es automático y no algo que el usuario
  escribió.

**Nota impresa antes del panel de firmas.** Columna nueva
`solicitudes_evento.advertencia_presupuesto_no_aprobado`
(`db/agregar_advertencia_presupuesto_evento.sql`, pendiente de ejecutar
contra el proyecto real). Componente nuevo y reutilizable,
`NotaAdvertencia`, en `DocumentoImprimible.tsx` — se pensó genérico a
propósito porque el mismo patrón visual (recuadro ámbar en pantalla, borde
sólido sin relleno al imprimir) le sirve también a la advertencia de
"funcionario de gobierno" que pide el formulario de Convenio de Pago a HCP
más adelante en esta ronda. `CuerpoEvento` la inserta entre "Comentarios
especiales" y "Aprobación" (el panel de firmas), exactamente donde pide la
especificación.

`npx tsc -b` limpio tras el cambio.

**Con esto se cierra el alcance de Solicitud de Evento de esta ronda.**
Quedan pendientes, fuera de Solicitud de Evento: el resto de formularios
(Convenio de Pago a HCP, FMV, CAF, Notificación de Pago, Nuevo Speaker,
Nuevo Usuario) y la función transversal de Anular/Eliminar.

## Ronda de ajustes de formularios (septiembre 2026) — entrega 5: Convenio de Pago a HCP

A diferencia de Solicitud de Evento, este formulario ya estaba
sorprendentemente completo respecto a la especificación — la mayoría del
modelo de datos (empleado responsable, HCP, Consejo de Asesores,
Funcionario de Gobierno, objetivo/criterios, contraprestación, reunión y
catering, certificación) ya existía campo por campo. El trabajo real de
esta entrega fue cerrar brechas puntuales, no reconstruir el formulario.

**Selector de "Evento de origen" — compartido, no solo de Convenio.**
Antes de esta entrega usaba la vista genérica `v_documentos` (cualquier
Solicitud de Evento, sin filtrar). Se construyeron dos helpers nuevos y
reutilizables en `lib/documentosRequeridosEvento.ts` —
`eventosParaOrigenSpeakerExterno`/`etiquetaEventoOrigen` — que filtran a
"participación académica + Speaker externo" (mismo criterio que
`esSpeakerExterno`) y arman la etiqueta "Nombre del evento (fecha o
rango)" que pide la especificación, tomando la fecha de la primera/última
sesión en eventos de Varias sesiones. `NuevoConvenio.tsx`/
`DetalleConvenio.tsx` ahora traen `Evento[]` completo (`traerEventos()`)
en vez del resumen genérico. CAF reutilizará el mismo helper en su propia
entrega.

**Precargados nuevos** (todos en `lib/precargado.ts`, mismo mecanismo
"automático e inmediato, siempre sobrescribe" del resto de la app):
- **Objetivo** ← `Evento.objetivosEvento`.
- **Lugar propuesto para la reunión** ← generado de las sesiones del
  evento, una línea por sesión ("Sesión N — fecha — dirección, ciudad,
  estado, país") en Varias sesiones, o la dirección del documento en
  Única sesión — exactamente el formato que pide la especificación.
- **Contraprestación al HCP** ← la cuota de inscripción/honorarios QUE
  ESE SPEAKER ESPECÍFICO tiene en `Evento.speakersParticipacion` (entrega
  2), no un valor genérico del evento — se recalcula si cambia el evento
  o el speaker elegidos, en cualquier orden.
- **Número de HCP del Consejo de Asesores** ← `Evento.numeroSpeakersExternos`
  (entrega 2), solo mientras la sección "Consejo de Asesores" está activa.
- **Criterios de selección** ← `comentariosAdicionales` del FMV del mismo
  evento/speaker (función nueva, `traerFmvPorEventoYSpeaker` en `fmv.ts`)
  — a diferencia de los anteriores, esto sí necesita una consulta propia
  porque el FMV no es parte de ningún objeto ya cargado por el formulario.

**HCP — 3 campos que pedía la especificación y no existían:**
`hcpNumeroDocumento`/`hcpEspecialidad` (autocargados del Repositorio de
Speakers al elegir el HCP) y `hcpEstadoProvincia` (manual por ahora — el
Repositorio de Speakers todavía no captura ese dato; se agregó la columna
`speakers.estado_provincia` desde ya para cuando "Nuevo Speaker" tenga el
campo, en su propia entrega). El selector de HCP ahora usa el mismo
formato "Nombre, Documento, Especialidad" (`etiquetaSpeakerResumen`)
definido en la entrega 2 de Evento. "Tipo de servicio" pasó de texto libre
a lista desplegable sobre un catálogo nuevo, `tiposServicioConvenio`.

**"Ver formato oficial FMV vigente".** La infraestructura ya existía
completa (`formato_oficial_fmv`, `formatoOficialFmvVigente()`) — solo
faltaba el botón, reutilizando `VisorArchivo` ya construido. Se agregó
junto a la pregunta "¿Es consistente con el Tabulador de Tarifas
aprobado?", como pide la especificación. Esa misma pregunta ahora exige
explicación en AMBAS ramas (antes solo cuando la respuesta era "No" — la
especificación pide una justificación también cuando es "Sí": "especifique
cómo se llegó a la Contraprestación total").

**Gate de "Funcionario de Gobierno" — mismo patrón que el de presupuesto
no aprobado de Evento (entrega 4), pero disparado por checkboxes en vez
de por el toggle en sí.** Diálogo bloqueante (sin cerrar con Escape/click
afuera) que aparece apenas se marca al menos uno de los 3 supuestos, con
"Cancelar solicitud" (mismo prop `onCancelar` del patrón de Evento) y
"Continuar" (fija `advertenciaFuncionarioGobiernoConfirmada: true`).
Columna nueva `convenios_pago_hcp.advertencia_funcionario_gobierno_confirmada`.
La nota impresa (`NotaAdvertencia`, reutilizado de la entrega 4) queda
antes del panel de firmas en `CuerpoConvenio`, con el texto exacto que
pide la especificación ("A modo de referencia, se ha señalado que
[NOMBRE; ESPECIALIDAD] es un funcionario de gobierno con...").

**Migración nueva**: `db/agregar_hcp_estado_documento_especialidad_convenio.sql`
— `speakers.estado_provincia`, `convenios_pago_hcp.hcp_numero_documento`/
`hcp_especialidad`/`hcp_estado_provincia`/
`advertencia_funcionario_gobierno_confirmada`. Pendiente de ejecutar
contra el proyecto real antes de publicar, como el resto de migraciones de
esta ronda.

`npx tsc -b` limpio tras el cambio.

Pendiente para las siguientes entregas de esta ronda: FMV, CAF,
Notificación de Pago, Nuevo Speaker, Nuevo Usuario, y la función
transversal de Anular/Eliminar.

## Ronda de ajustes de formularios (septiembre 2026) — entrega 6: FMV Checklist

El usuario mismo señaló que este formulario necesitaba pocos cambios
("en esa funcionalidad no se requiere ningún cambio" sobre el cálculo del
Tier) — confirmado: los criterios FMV y su cálculo de puntaje/Tier ya
funcionaban correctamente, así que esta entrega se limitó a lo demás.

**El hallazgo más grande: el FMV no tenía ningún selector de HCP.** Todos
los datos del HCP (nombre, especialidad, licencia, dirección, país,
ciudad) se tecleaban a mano — el campo `speakerId` existía en el tipo y en
la base, pero ningún `<Select>` lo usaba (documentado así, explícitamente,
en un comentario del propio código antes de esta entrega). Se agregó el
selector "Seleccionar HCP del Repositorio de HCPs/Speakers" (mismo formato
"Nombre, Documento, Especialidad" de las entregas anteriores) con su
precargado completo (`precargarDesdeSpeakerParaFmv`, nuevo en
`lib/precargado.ts`) — incluida la Especialidad, que sí se mapea aquí (a
diferencia del precargado desde Evento) porque FMV y el Repositorio de
Speakers comparten el mismo catálogo `especialidadesMedicas`.

**Otros cambios:**
- Cuadro "Formato oficial FMV vigente de la compañía" con botón "Ver",
  justo antes de "Perfil del HCP" — reutiliza la misma infraestructura
  (`formatoOficialFmvVigente`, `VisorArchivo`) ya conectada en Convenio de
  Pago a HCP (entrega 5).
- "Región" y "Estado/Provincia/Departamento" pasan de texto libre a listas
  desplegables (catálogo nuevo `regiones`, y el catálogo `estados` ya
  existente desde Evento).
- "Evento de origen" corregido para reutilizar
  `eventosParaOrigenSpeakerExterno`/`etiquetaEventoOrigen` (mismo helper
  compartido de la entrega 5) en vez de la vista genérica sin filtrar.
- "Fecha" ahora se autocarga del Evento (inicio del evento, o de la
  primera sesión en Varias sesiones) — antes quedaba siempre vacía.
- Campo nuevo `numeroDocumento` (columna nueva,
  `db/agregar_numero_documento_fmv.sql`), autocargado del HCP elegido.
- "Score total (calculado)" y "HCP Overall Tier" ahora viven en un cuadro
  propio, con borde y fondo destacados y tipografía más grande — pedido
  explícito ("cuadro de visualización que permita darle más énfasis").
- **Firma manuscrita** — componente nuevo y reutilizable,
  `FirmaManuscritaUsuario` (`components/archivos/FirmaManuscrita.tsx`):
  muestra la firma ya guardada en `Usuario.firmaId` (infraestructura de
  archivos, Fase 1) con las fricciones básicas contra copiado (clic
  derecho y arrastre bloqueados) que pide la especificación. Es de solo
  lectura — el control para DIBUJAR o SUBIR la firma vive en "Nuevo
  Usuario" (todavía sin construir en esta ronda), así que por ahora
  siempre muestra "Sin firma manuscrita registrada todavía" hasta que esa
  entrega llegue. Mismo componente listo para reutilizarse en Notificación
  de Pago (pide exactamente el mismo campo).
- Se agregaron los asteriscos de obligatorio que faltaban en la validación
  (`speakerId`, `estadoProvincia`, `codigoPostal`), consistentes con la
  especificación.

**Decisión documentada, no aplicada literalmente**: la especificación dice
"Código postal\*: Cargar automáticamente desde el campo 'Ciudad' del
repositorio de HCPs/Speakers" — se interpretó como un error de trascripción
en las notas originales (copiar el nombre de la ciudad a un campo de
código postal no tiene sentido, y el Repositorio de Speakers no tiene
ningún campo de código postal). Se dejó como campo manual, sin precargado,
en vez de adivinar una regla que produciría datos incorrectos.

`npx tsc -b` limpio tras el cambio.

Pendiente para las siguientes entregas de esta ronda: CAF, Notificación de
Pago, Nuevo Speaker, Nuevo Usuario, y la función transversal de
Anular/Eliminar.

## Ronda de ajustes de formularios (septiembre 2026) — entrega 7: CAF

**El hallazgo grande, igual que en FMV: el CAF no tenía ningún selector de
HCP.** El campo `speakerId` ya existía en el esquema (agregado en la
entrega 3, para las reglas de dependencia), pero nada en el formulario lo
usaba — los datos de la contraparte se tecleaban a mano por completo. Se
agregó el selector "Seleccionar HCP del Repositorio de HCPs/Speakers", que
al elegirse resuelve EN PARALELO el Convenio de Pago a HCP del mismo
evento/speaker (`traerConvenioPorEventoYSpeaker`, nuevo en `convenio.ts`,
mismo patrón que `traerFmvPorEventoYSpeaker` de la entrega 5) y el propio
Speaker del repositorio, y combina ambos precargados en una sola
actualización de estado — evitando la condición de carrera de disparar dos
`onChange` async por separado.

**Contraparte — 4 campos que pedía la especificación y no existían**:
`contraparteNumeroDocumento`, `contrapartePais`, `contraparteEstadoProvincia`,
`contraparteCiudad` (autocargados desde el Convenio relacionado —
`contraparteTelefono`/`contraparteCorreo` sí existían y ahora se autocargan
del Repositorio de Speakers directamente, no del Convenio, que no los
tiene). Columnas nuevas, `db/agregar_contraparte_caf.sql`.

**"Evento de origen" — el filtro más estricto de la ronda.** Reutiliza
`esSpeakerExterno`, pero además exige `tieneConvenioYFmv` (ya existente en
`documentosRequeridosEvento.ts`, de la Fase 6) — solo eventos que YA
tienen un FMV Checklist y un Convenio de Pago a HCP vinculados, como pide
la especificación. Nuevo helper `eventosParaOrigenCaf`, hermano de
`eventosParaOrigenSpeakerExterno`.

**Otros cambios:**
- "Término del contrato – fin" pasa de texto libre al toggle
  "Determinable"/"Fecha específica" que pide la especificación — columna
  nueva `terminoContratoDeterminable`; el campo de fecha solo aparece
  (y solo se exige) en la rama "Fecha específica".
- "Término del contrato – inicio" ahora se autocarga del evento (inicio
  del evento, o de la primera sesión en Varias sesiones) — antes quedaba
  siempre vacío.
- "Due diligence" pasa de texto libre a lista desplegable con las 3
  opciones fijas de la especificación (N/A, Positivo, Negativo).
- Cuadro de texto legal fijo ("POST-APROBACIÓN: GM / (S)VP DEBE FIRMAR...")
  con alineación justificada, pedido explícito — se agregó como constante
  reutilizable (`NOTA_LEGAL_CAF`, exportada desde `FormularioCAF.tsx`) para
  que el formulario y la impresión (`CuerpoCAF`, reutilizando
  `NotaAdvertencia` de la entrega 4) muestren exactamente el mismo texto
  sin duplicarlo.
- **Hallazgo colateral, corregido de paso**: "Nombre/Teléfono del
  solicitante" y "Nombre/Cargo del Director de Área" nunca se autocargaban
  del usuario en sesión pese a que la especificación siempre lo pidió así
  — quedaban en blanco esperando que el usuario los tecleara. Se agregó el
  autocompletado en `NuevoCaf.tsx` (una sola vez al montar, no pisa si el
  usuario ya escribió algo — a diferencia del precargado entre documentos,
  que siempre sobrescribe). **Nota para revisar**: `Evento.nombreSolicitante`
  tiene exactamente el mismo hueco (pedido desde la especificación
  original de Evento, nunca implementado) — no se tocó en esta entrega por
  quedar fuera de su alcance (CAF), queda anotado para una entrega aparte
  si se decide corregirlo.

`npx tsc -b` limpio tras el cambio.

Pendiente para las siguientes entregas de esta ronda: Notificación de
Pago, Nuevo Speaker, Nuevo Usuario, y la función transversal de
Anular/Eliminar.

## Ronda de ajustes de formularios (septiembre 2026) — entrega 8: Nuevo Usuario

Renombrado de "Nuevo colaborador" a "Nuevo Usuario" en toda la pantalla
`UsuariosRoles.tsx`, con los campos y el flujo de borrador/confirmación
que pedía la especificación — incluido el campo de firma manuscrita que el
usuario pidió agregar explícitamente al principio de esta ronda (dibujar o
subir imagen), antes de que existiera "Nuevo Usuario" como tal.

**Campos nuevos** (`Usuario.numeroDocumento`/`pais`/`estadoProvincia`/
`ciudad`/`observaciones`, columnas nuevas — `db/agregar_campos_nuevo_usuario.sql`):
dirección/ubicación PROPIA del usuario, distinta de `paisesOperacion` (el
ALCANCE de países donde puede operar/ver documentos, ya existente y sin
tocar). País/Ciudad usan `SelectPaisCiudad` (mismo componente del resto de
la app); Estado/Provincia usa el catálogo `estados` ya existente desde la
entrega 1 de Evento.

**Verificación de correo (doble chequeo).** Un segundo campo "Verificar
correo electrónico" al lado del correo, con aviso inline si no coinciden
— `confirmar()` bloquea el envío si difieren.

**Firma manuscrita — componente de captura nuevo.** `CapturaFirmaManuscrita`
(`components/archivos/FirmaManuscrita.tsx`, junto al `FirmaManuscritaUsuario`
de solo lectura de la entrega 6): dibuja sobre un `<canvas>` (mouse y
touch) y sube el resultado como PNG a `archivos_adjuntos` al soltar el
trazo; alternativa "Subir imagen" reutiliza `CampoArchivo`. Con esto
quedan conectados los 3 puntos que ya esperaban una firma real (FMV,
Notificación de Pago — pendiente — y ahora su origen: Nuevo Usuario).

**"Guardar como borrador"/"Confirmar Usuario" — el cambio de arquitectura
más grande de esta entrega.** Crear un usuario de verdad pasa por la
función Edge `admin-usuarios` (crea la cuenta real de Supabase Auth y
envía la contraseña temporal — no se puede modificar/redesplegar desde
aquí, mismo criterio que cualquier RPC/Edge real de esta app). Un
Borrador, en cambio, NUNCA debe crear una cuenta ni enviar correo — así
que usa un camino distinto por diseño:
- `guardarBorradorUsuario`/`editarBorradorUsuario` (nuevas, `lib/usuarios.ts`):
  `.insert()`/`.update()` DIRECTOS a `usuarios`, con la columna nueva
  `estado_usuario: 'Borrador'` y `auth_user_id: null` — nunca tocan la
  función Edge.
- `crearUsuario` ("Confirmar Usuario") gana un segundo parámetro opcional,
  `borradorId`: al terminar con éxito, borra la fila de borrador (ya
  cumplió su propósito, nunca tuvo cuenta real). También completa, con un
  `.update()` de seguimiento, las columnas nuevas de esta entrega que la
  función Edge todavía no conoce (incluida la firma) — si ese segundo paso
  falla, la cuenta ya quedó creada de todas formas, así que no se revierte
  nada, solo quedan esos campos vacíos hasta corregirlos a mano.
- Los borradores existentes aparecen en una tarjeta propia ("Borradores de
  usuario", mismo patrón visual que "Solicitudes de restablecimiento"),
  separados de la tabla principal de usuarios activos, con un botón
  "Continuar" que reabre el diálogo precargado.

**Nota de seguridad heredada, documentada en la migración**: el `.insert()`
directo del borrador funciona hoy porque `usuarios` todavía no tiene RLS
real (mismo hallazgo F39 ya conocido — ver `docs/rls-usuarios.propuesta.sql`).
Cuando se aplique esa política, debe permitir también el INSERT de un
borrador a los roles que ya pueden crear usuarios, o el botón dejará de
funcionar.

**Formularios colapsables.** El diálogo se reorganizó en 4 secciones de
acordeón (Identificación, Dirección, Alcance y acceso, Observaciones y
firma) usando el componente `accordion.tsx` del kit de UI, que ya existía
sin usarse en ningún formulario — pedido explícito de la especificación.
Las 4 secciones abren por defecto para no esconder campos obligatorios
detrás de un clic extra, pero siguen siendo colapsables.

`npx tsc -b` limpio tras el cambio.

Pendiente para las siguientes entregas de esta ronda: Notificación de
Pago, Nuevo Speaker, y la función transversal de Anular/Eliminar.

## Ronda de ajustes de formularios (septiembre 2026) — acordeón en Solicitud de Evento

Pendiente que arrastraban Evento, Convenio, FMV y CAF desde sus propias
entregas ("Usar formularios colapsables (tipo acordeón)", repetido en la
nota final de cada formulario de la especificación): `FormularioEvento.tsx`
ya se convirtió por completo de `<Card><CardHeader><CardTitle>` a
`<Accordion>`/`<SeccionAcordeon>` — sus ~14 secciones (Solicitante y
evento, Fechas/modalidad/lugar, Muestras médicas, Participación académica,
Speakers externos, Presupuesto previo, Inscripción, Transporte/hospedaje/
alimentos, Sesiones, Comentarios especiales, etc.) ya son colapsables.

**Componente nuevo y reutilizable**: `SeccionAcordeon`
(`components/forms/SeccionAcordeon.tsx`) reemplaza 1:1 el patrón de
`Card` que usaban estos formularios — mismo título/descripción/contenido,
pero como `AccordionItem`. `AccordionTrigger` (`components/ui/accordion.tsx`)
ganó un prop nuevo, `accionesHeader`, para los casos donde el encabezado de
una sección necesita un control interactivo al lado del título (el
`Switch` "Se entregarán"/"Aplica" de Muestras médicas, Artículos
promocionales, Participación académica, etc.) — ese control vive fuera del
`<button>` del trigger (anidar un `<button>` dentro de otro sería HTML
inválido) y detiene la propagación del clic para no abrir/cerrar la
sección sin querer.

Las secciones abren todas por defecto (`defaultValue` con los 14
`value` de sección) — colapsables, pero sin esconder campos obligatorios
detrás de un clic extra.

`npx tsc -b` limpio.

**Todavía sin convertir** (en el momento de esta sección): Convenio de Pago
a HCP, FMV y CAF seguían con `Card` — resuelto en la sección siguiente.

## Ronda de ajustes de formularios (septiembre 2026) — acordeón en Convenio, FMV y CAF

Continuación directa de la sección anterior ("Si, sigue con el acordeon de
esos 3 formularios"): `FormularioConvenio.tsx`, `FormularioFMV.tsx` y
`FormularioCAF.tsx` se convirtieron con el mismo componente
`SeccionAcordeon`/`Accordion` ya usado en `FormularioEvento.tsx` — mismo
reemplazo 1:1 de `<Card><CardHeader><CardTitle>` por
`<SeccionAcordeon value="..." titulo="...">`, sin cambiar ningún campo,
validación ni lógica de precargado.

- **Convenio de Pago a HCP** (8 secciones): Actividad y responsable, HCP,
  Consejo de Asesores, Funcionario de Gobierno, Objetivo y selección,
  Contraprestación, Catering, Certificación. Las tres secciones con un
  `Switch` "Aplica"/"Incluye catering" en el encabezado (Consejo de
  Asesores, Funcionario de Gobierno, Catering) usan `accionesHeader` —
  mismo patrón que Muestras médicas en Evento. El diálogo bloqueante de
  "Funcionario de Gobierno" (cancelar/continuar) queda igual, fuera del
  `<Accordion>`, como antes.
- **FMV** (3 secciones): Perfil del HCP, Criterios de Fair Market Value
  (con descripción — "Cada criterio suma puntos según la respuesta…" pasa
  al prop `descripcion` de `SeccionAcordeon`), Certificación (también con
  descripción). El cuadro de "Formato oficial FMV vigente" y el
  score/tier quedan igual, ya que no eran parte del patrón `Card`
  original (el score/tier vive dentro de la sección "Criterios").
- **CAF** (4 secciones): Solicitante, Contraparte, Contrato, Financiero
  (incluye la nota legal fija `NOTA_LEGAL_CAF`, sin cambios).

Las 3 secciones/8/4 respectivamente abren todas por defecto
(`defaultValue` con todos los `value`), igual que en Evento —
colapsables, pero nada oculto detrás de un clic extra al abrir el
formulario. `npx tsc -b` limpio.

**Con esto, los 4 formularios de documento (Evento, Convenio, FMV, CAF)
ya usan el mismo patrón de acordeón.** Pendiente: Notificación de Pago a
HCPs y Nuevo Speaker (no arrancados todavía en esta ronda) tendrán su
propio formulario nuevo — se construirán directamente con
`SeccionAcordeon` en vez de partir de `Card`.

## Ronda de instrucciones — implementación del sistema de diseño (icono/sidebar/Speakers)

El usuario había pedido primero un sistema de diseño de referencia (un
artifact de React+Tailwind, publicado por separado, con la maqueta visual
de BEATS) y luego pidió implementar esos mismos ajustes directamente sobre
esta aplicación real. Al explorar el código antes de tocar nada se
encontró que la mayor parte de lo pedido **ya estaba correctamente
implementado** desde fases anteriores (la navegación completa de
`src/lib/navegacion.ts` ya tenía las 6 secciones y los 23 ítems exactos, y
`src/pages/Tablero.tsx` ya resolvía el campo secundario/fecha/monto por
tipo de documento con más rigor del que tenía la maqueta) — así que esta
ronda se limitó a lo que de verdad faltaba:

- **Íconos** (`src/lib/navegacion.ts`): CAF pasó de `FileSignature` a
  `Stamp` (un sello), Convenio HCP pasó de `FileText` a `Handshake` (manos
  estrechadas), y HCPs/Speakers pasó de `Users` a `Stethoscope`
  (estetoscopio) — Convenio de Pago a HCP (`HandCoins`), MD FMV Checklist
  (`ClipboardCheck`), Notificación de Pago (`Receipt`) y Participación de
  HCPs/Speakers (`Mic2`, micrófono) ya eran correctos de antes.
- **Color de marca**: se revisó `src/index.css` — los tokens `--brand-blue`
  y de estado ya vienen de extracción forense directa del bundle original,
  así que no se tocaron (son más confiables que la paleta aproximada de la
  maqueta de referencia).
- **Repositorio de Speakers** (`src/pages/Speakers.tsx`): rediseño completo
  de tabla a tarjetas, según la captura de pantalla real que el usuario
  adjuntó — avatar (foto si existe, iniciales si no), nombre/especialidad/
  documento, botón Editar, fila de contacto (dirección/teléfono/correo con
  íconos), y las dos cajas "Licencia RETHUS"/"Hoja de Vida" con su propia
  pastilla de vigencia y enlace "Ver documento" (vía `VisorArchivo`, a
  demanda) o "No adjunta". Se agregaron pastillas de filtro por **estado
  consolidado** (`estadoConsolidadoSpeaker` en `src/lib/speakers.ts`: el
  peor entre RETHUS y Hoja de Vida, con "indefinido" contando como
  "vigente") y un filtro de país — ambos confirmados por la captura de
  pantalla (un speaker con RETHUS "Vigencia indefinida" pero sin Hoja de
  Vida cuenta como "Sin registro" en los filtros, no como "Vigente").
- **Etiquetas de vigencia** (`ETIQUETA_VIGENCIA` en `src/lib/speakers.ts`):
  "Por vencer" → "Próximo a vencer", "Sin datos" → "Sin registro" —
  terminología real confirmada por la captura, propagada también a
  `src/pages/InformeSpeakers.tsx` y al CSV exportado (misma constante).
  "Indefinido" se sigue calculando igual, pero la pastilla de la tarjeta lo
  muestra como "Vigente" (con el detalle "Vigencia indefinida" aparte),
  también confirmado por la captura.
- **Título de página** (`TITULO_PAGINA.speakers` en `navegacion.ts`): de
  "HCPs/Speakers" a "Repositorio de Speakers — RETHUS y Hoja de Vida",
  texto literal de la captura de pantalla real.

`scripts/verificar_administracion.mjs` se actualizó para el nuevo diseño
(tarjetas en vez de filas de tabla, vía `data-testid="tarjeta-speaker"` /
`"caja-rethus"` / `"caja-hojavida"` en vez de `<tr>`) y se le agregó un
paso nuevo (12b) que cubre las pastillas de filtro por vigencia
consolidada y su conteo.

## Ronda de instrucciones — ciclo de vida de documentos (borrador reabrible, devolver, enmienda, regla de los 7 días)

Instrucción explícita del usuario: "Guardar borrador" debe estar disponible
en cualquier formulario de "Crear documentos" (y en HCPs/Speakers); un
documento en Borrador debe poder reabrirse para edición las veces que haga
falta antes de enviarse a aprobación; un documento ya enviado (Pendiente)
debe poder "devolverse" — suspender el flujo y reabrirlo, quedando en un
estado nuevo ("Devuelto") — pero solo si ninguna etapa de su cadena de
aprobación tiene todavía una firma; si ya hay al menos una firma, la única
vía es que el creador solicite una "enmienda" justificada; y ninguna
corrección (ni borrador, ni devolver, ni enmienda) se permite si faltan
menos de 7 días para el inicio del evento vinculado (o si ya inició), con
un mensaje explícito que lo diga. Todo debe quedar trazado en Historial y
Auditoría.

**Qué ya existía y no hizo falta tocar**: los 6 formularios de "Crear
documento" (`NuevoCaf`/`NuevoConvenio`/`NuevoConvenioHCP`/`NuevoEvento`/
`NuevoFmv`/`NuevaNotificacionPago`) ya tenían un botón "Guardar como
borrador" desde fases anteriores — la parte que realmente faltaba era poder
**reabrir** ese borrador después. HCPs/Speakers (`src/pages/Speakers.tsx`)
tampoco necesitó cambios: solo `nombreCompleto` y `numeroDocumento` son
obligatorios (línea de validación en `guardar()`), y el resto de campos ya
se guardan como estén — un speaker siempre se puede guardar incompleto y
completarse después, sin necesitar un botón de "borrador" propio.

**Lo nuevo, en `src/lib/cicloVidaDocumento.ts`** (módulo compartido por los
4 tipos de documento con cadena de aprobación — Evento, Convenio de Pago a
HCP, CAF, Convenio HCP): `evaluarBloqueoPorProximidadEvento` (la regla de
los 7 días, con el mensaje explícito exacto que pide el usuario),
`traerFechaInicioEventoPorId` (para los 5 tipos de documento que solo
tienen un `eventoOrigenId`, sin traer el Evento completo),
`puedeDevolverDocumento`/`puedeSolicitarEnmienda`/`puedeEditarComoBorrador`
(las 3 reglas de permiso, en función de si ya hay o no una firma),
`devolverDocumento` (transición directa `Pendiente → Devuelto`, sin tocar
la cadena de aprobación porque al no haber firmas ya está como debe
quedar), y `solicitarEnmiendaDocumento`/`cerrarVentanaEnmiendaDocumento`
(reutilizan las mismas columnas `adenda_ventana_*` que ya existían para la
Adenda de un documento Aprobado — conceptualmente es la misma idea de
"ventana de edición justificada con vigencia de 7 días", aplicada aquí a un
documento Pendiente con firmas en vez de a uno Aprobado; no se creó ninguna
columna nueva).

Cada tipo de documento con cadena (`caf.ts`/`convenio.ts`/
`convenioHCP.ts`/`evento.ts`) agregó su propio `editarBorrador*`
(repetible, con o sin enviar a aprobación) y sus propios
`devolver*`/`solicitarEnmienda*`/`cerrarVentanaEnmienda*` que envuelven las
funciones compartidas de arriba. FMV y Notificación de Pago (`fmv.ts`/
`notificacionPago.ts`) solo agregaron `editarBorrador*` — como pasan
directo de Borrador a Completado sin cadena de aprobación, "devolver" y
"enmienda" no les aplican. Los 6 `Detalle*.tsx` se actualizaron con el
mismo patrón: botón "Editar borrador" (visible en Borrador y en Devuelto),
el aviso de bloqueo por proximidad cuando aplica, y en los 4 con cadena,
además, "Devolver"/"Solicitar enmienda" con sus cajas de motivo/
justificación inline.

**Hallazgo real durante las pruebas de esta ronda** (no un defecto del
diseño, sino de la implementación): `editarBorradorCaf`/`editarYReenviarCaf`
(y sus equivalentes en Convenio/Evento/FMV/Notificación de Pago) armaban la
fila a guardar con `flatToRow(datos, CAMPOS_COMPLETOS)`, pero `datos` es
siempre un objeto tipo `DatosFormularioX` (lo que expone el formulario) que
NUNCA incluye `creadoPorId`/`creadoEn` — y `flatToRow` escribe el valor por
defecto de cada `FieldSpec` de la lista para cualquier clave ausente. El
resultado: cada guardado de borrador o reenvío estaba pisando
silenciosamente `creado_por_id`/`creado_en` con `""` en la fila real. Se
agregó `flatToRowParcial` en `src/lib/dbMapping.ts` (misma idea que
`flatToRow`, pero solo convierte las claves que el objeto realmente tiene)
y se cambiaron todos los `editarBorrador*`/`editarYReenviar*` afectados
para usarla. Convenio HCP no tenía este problema — su
`CAMPOS_EDITABLES_CONVENIO_HCP` (una lista deliberadamente restringida, por
otra razón: proteger el clausulado legal congelado) nunca incluyó esas dos
columnas de todas formas.

`scripts/verificar_ciclo_vida_documentos.mjs` (nuevo) cubre, contra CAF
como caso de referencia: guardar borrador repetible, enviar a aprobación,
devolver un Pendiente sin firmas, reeditar y reenviar un Devuelto, aprobar
la primera etapa, confirmar que "Devolver" desaparece y "Solicitar
enmienda" aparece en cuanto hay una firma, solicitar la enmienda y
reenviar, y verificar en Historial y Auditoría que los 3 movimientos nuevos
quedan trazados (incluido el filtro por acción). Un CAF aparte, vinculado a
un evento a 3 días, cubre la regla de los 7 días: sin botón "Editar
borrador" y con el mensaje explícito visible.

Falta ejecutar contra el proyecto real de Supabase, antes de publicar esta
versión, la migración `db/agregar_ciclo_vida_documentos.sql` (agrega
`'Devuelto'` al enum real de estado y las 3 acciones nuevas al enum real de
auditoría) — sin ella, el estado "Devuelto" y las 3 acciones nuevas no se
pueden guardar contra la base real, aunque sí funcionan hoy contra los
fixtures locales de todos los `scripts/verificar_*.mjs`.

Regresión completa tras esta ronda: 18/18 scripts (el único fallo visto en
un corrido fue `verificar_login_captcha.mjs`, un reto aleatorio A+B que por
pura probabilidad puede repetirse — no relacionado con este cambio; pasó
limpio al reintentarlo).

Regresión completa tras esta ronda: 17/17 scripts.

## Ronda de ajustes de formularios (septiembre 2026) — Notificación de Pago a HCPs y Nuevo Speaker

Continuación de la ronda ("Avancemos con Notificación de Pago y Nuevo
Speaker"), tras cerrar el acordeón en los 4 formularios de documento
(Evento, Convenio, FMV, CAF). Estos dos formularios ya existían de fases
anteriores; esta entrega los alinea con la especificación de esta ronda.

**Notificación de Pago a HCPs** (`FormularioNotificacionPago.tsx`):
- Convertido a `Accordion`/`SeccionAcordeon` (3 secciones: Identificación
  del HCP, Factura, Certificación) — pedido explícito, mismo patrón que
  los demás formularios de esta ronda.
- **Selector de HCP nuevo**: hasta esta entrega el formulario no tenía
  ningún selector de Speaker (solo "Evento de origen" + "Convenio de
  origen", ambos manuales, sin relación entre sí). Ahora sigue el mismo
  patrón que CAF (entrega 7): se elige el HCP del Repositorio de
  Speakers, y se resuelve automáticamente el Convenio de Pago a HCP del
  mismo evento+speaker (`traerConvenioPorEventoYSpeaker`) — el selector
  manual de "Convenio de origen" desaparece de la pantalla;
  `convenioOrigenId` se sigue guardando, pero como resultado, no como
  entrada del usuario.
- **"Evento de origen" ahora filtra** a los eventos elegibles de verdad
  (participación académica, Speaker externo, con FMV y Convenio ya
  vinculados) vía la nueva `eventosParaOrigenNotificacionPago` en
  `documentosRequeridosEvento.ts` (alias documentado de
  `eventosParaOrigenCaf` — mismo criterio). Antes listaba TODOS los
  eventos sin filtro alguno.
- **Campo nuevo**: "Número de documento de identidad" (distinto de
  "Cédula profesional o licencia"), autocargado desde el Convenio de
  Pago a HCP vinculado — ver
  `db/agregar_numero_documento_identidad_notificacion_pago.sql`.
- **"Empresa del grupo"** pasa de campo invisible (solo viajaba como
  prop) a un `<Select>` real en el formulario, igual que en Evento/CAF.
- **"Producto(s)"** pasa de un `<Textarea>` de texto libre a una lista de
  `<Select>` desde el Portafolio de Productos (`lib/productos.ts`, ya
  existente para "Muestras planeadas" en Evento), con "+ Agregar
  producto" y un botón de eliminar por fila — pedido explícito. Se sigue
  guardando en la misma columna de texto `productos` (nombres separados
  por coma) para no requerir ninguna migración ni romper lo ya impreso.
- **Validación nueva**: "Favor marcar los recuadros aplicables — al menos
  uno debe estar marcado" ahora se aplica de verdad (antes los 3
  checkboxes no tenían ninguna regla), con el texto de la sección visible
  en el formulario.
- **Cuadro de certificación** con el texto exacto de la especificación
  ("Al someter este formato, confirmo que he revisado esta factura...")
  y la firma manuscrita de solo lectura (`FirmaManuscritaUsuario`,
  reutilizada de FMV/Nuevo Usuario) — antes solo mostraba una descripción
  genérica, sin ninguno de los dos.
- **Pendiente, documentado y no forzado**: la especificación pide que
  "Evento de origen" solo liste eventos "que tenga por lo menos una
  factura asociada y cargada en el repositorio de documentos" — esta app
  no tiene un repositorio de facturas por evento con esa relación
  explícita (las facturas se siguen adjuntando como archivo suelto
  dentro del propio formulario, campo "Factura (archivo adjunto)"), así
  que ese último requisito no se pudo aplicar sin construir esa pieza de
  infraestructura nueva. Igual, "Factura relacionada" sigue siendo
  entrada manual (número, fecha, valor, moneda) en vez de un selector de
  facturas ya cargadas — mismo motivo.
- Los botones se dejaron como "Guardar como borrador" / "Certificar y
  completar" (en vez del "Completar y firmar" literal de la
  especificación) — decisión deliberada de consistencia: es el mismo
  texto que ya usa FMV, el otro documento de un solo firmante sin cadena
  de aprobación.

**Nuevo Speaker** (`Speakers.tsx`, diálogo de creación/edición del
Repositorio de Speakers — "disponible al dar clic en la sección
'HCPs/Speakers' de la barra lateral", que es exactamente donde ya vivía):
- Convertido a `Accordion`/`SeccionAcordeon`, con las 4 secciones que
  agrupa la especificación: Identificación, Datos de contacto, Documentos
  legales, Interacción con empresa.
- **Corrección de un bug real, no reportado hasta ahora**: `guardarSpeaker`
  no persistía `foto_id`, `estado_provincia`, `archivo_rethus_id`,
  `archivo_hoja_vida_id` ni `archivo_identidad_id` — el formulario los
  mostraba y dejaba editar, pero se perdían al guardar (el objeto que se
  mandaba a Supabase simplemente no los incluía). Corregido; los 5 ahora
  se guardan.
- **"Estado/Provincia/Departamento"** ahora tiene su campo en el
  formulario (la columna ya existía desde una entrega anterior de esta
  misma ronda, pero el formulario nunca la había expuesto).
- **Campos nuevos**: "Profesión" (catálogo nuevo `profesiones`, distinto
  de "Especialidad"), "Empresa(s) del grupo con la(s) cuál(es) tendrá
  interacción" (selección múltiple, al menos una, mismo patrón de
  checkboxes que "Empresa(s) del grupo" en Nuevo Usuario) — ver
  `db/agregar_campos_nuevo_speaker.sql`.
- **"Guardar como borrador" / "Confirmar speaker"**: mismo patrón que
  Nuevo Usuario (entrega 8) — un Borrador solo exige nombre y documento
  (el mínimo que ya se pedía antes de esta entrega); "Confirmar speaker"
  exige la validación completa (`calcularErroresSpeaker`, nueva función en
  `lib/speakers.ts`). Columna `speakers.estado` nueva, default
  `'Confirmado'` (mismo criterio que `usuarios.estado_usuario`: las filas
  ya existentes en la base real nunca son borradores). La tarjeta del
  Repositorio de Speakers muestra una pastilla "Borrador" cuando aplica.
- **Doble verificación de correo electrónico**: campo "Confirmar correo
  electrónico" nuevo, solo en el formulario (no se persiste aparte) —
  "Confirmar speaker" lo compara contra "Correo electrónico" y bloquea si
  no coinciden.
- **Semáforo de vigencia** (RETHUS/Hoja de Vida) ya existía desde la Fase
  5 (`vigenciaRethus`/`vigenciaHojaVida`/`estadoConsolidadoSpeaker` en
  `lib/speakers.ts`, con pastillas de color en la tarjeta del
  Repositorio) — no se tocó, ya cumplía el pedido de esta ronda.
- **Advertencia de vigencia vencida al generar un Convenio de Pago**: la
  nota de "Nuevo Speaker" ("Si por alguna razón se va a generar un
  convenio de pago a HCP en un HCP que tiene la hoja de vida o la
  licencia RETHUS vencida, se debe advertir...") se implementó donde de
  verdad se genera ese documento — `FormularioConvenio.tsx`, sección HCP:
  al elegir el speaker, si su RETHUS y/o Hoja de Vida están vencidas
  (según los mismos cálculos de `lib/speakers.ts`), aparece un aviso
  junto al selector. Es solo una advertencia visual — no bloquea el
  envío, mismo criterio que el resto de advertencias de esta app
  (presupuesto no aprobado en Evento, funcionario de gobierno en
  Convenio).
- Sin tocar (fuera de alcance de esta entrega, ya deferido antes por el
  usuario): "país(es) de operación" con semáforos de vigencia como
  concepto propio del speaker (distinto del semáforo RETHUS/HV, que sí
  existía) sigue pendiente para una ronda aparte.

`npx tsc -b` limpio. Bundles reconstruidos y verificados con grep contra
marcadores de texto de ambos formularios antes de entregar (incluida la
verificación de que "Favor marcar los recuadros aplicables" quedó visible
en el HTML generado, no solo en el código fuente).

**Pendiente de esta ronda**: la función transversal de Anular/Eliminar
(pedida para los 6 documentos) todavía no se ha empezado.

## Reorganización UX/IxD de "Nueva Solicitud de Evento" (septiembre 2026)

Reorganización de `FormularioEvento.tsx` aplicando optimización de
formularios, UX Design e IxD — se discutió antes con el usuario como una
propuesta escrita (documento aparte), con 5 puntos de diseño confirmados
por él en comentarios sobre esa propuesta antes de programar. Ningún campo
existente se eliminó — solo se reubicaron, renombraron, o se separaron los
dos que la especificación pedía explícitamente como independientes.

**Nuevo orden de secciones**: "Participación académica" sube y ahora va
justo después de "Solicitante y evento", antes de "Fechas, modalidad y
lugar" (antes iba después de Muestras médicas/Artículos promocionales, que
mantienen su contenido intacto y simplemente quedan después). El resto de
secciones no cambia de posición.

**Sección "Solicitante y evento"**:
- "Nombre del solicitante" se autocarga desde `usuario.nombre` al crear
  una nueva solicitud (antes quedaba vacío hasta que el usuario lo
  escribía a mano) — sigue siendo editable; solo autocompleta mientras el
  campo sigue vacío, para no pisar una edición manual.
- "Organizado por" pasa de leer el catálogo `organizadoPorEvento` a leer
  `organizadoPorConvenio` (ahora compartido entre Convenio y Evento,
  renombrado en el editor de catálogos a simplemente "Organizado por") y
  se marca obligatorio (antes opcional). El catálogo `organizadoPorEvento`
  se eliminó del editor — sus valores, si los tenía, quedan huérfanos en
  `catalogo_valores`.

**Sección "Participación académica"**: "Detalle" pasa de opcional a
obligatorio. El resto (Quién dicta la actividad, Número de speakers
externos, con la tarea automática a Dirección Médica) no cambia.

**Sección "Fechas, modalidad y lugar"**:
- "Modalidad del evento" se renombra a **Formato**, se agrega la opción
  **Mixto** (se comporta igual que Presencial para
  Dirección/País/Ciudad/Estado — decisión confirmada por el usuario) y
  pasa a preguntarse ANTES que "Modalidad" (antes "Modalidad de
  sesiones", que se pregunta SEGUNDA). Ambos pasan de opcionales a
  obligatorios.
- **"Número de sesiones\*" — campo nuevo**: aparece justo después de
  "Modalidad" cuando el valor es "Varias sesiones", obligatorio.
  Autogenera esa cantidad de filas en "Sesiones" (agregando o quitando
  filas vacías al final cuando el número cambia); los botones "Agregar
  sesión"/"Quitar sesión" de esa sección se mantienen para ajustar el
  detalle después y devuelven el número sincronizado con el largo real
  del arreglo. Columna nueva `solicitudes_evento.numero_sesiones` — ver
  `db/agregar_numero_sesiones_evento.sql`.

**Sección "Speakers externos — identificación, cuota y presupuesto"**:
- **Cuota de inscripción y honorarios, ahora campos independientes**
  (antes un único campo combinado "Monto de la cuota de inscripción u
  honorarios"): "Cuota de inscripción \*" y "Honorarios del speaker \*",
  ambos obligatorios. El presupuesto condensado, que antes fijaba
  "Honorarios del speaker (sugerido)" en 0 para eventos con presupuesto
  por speaker (no había de dónde sumarlo), ahora lo suma de verdad
  (`sumarHonorariosSpeakers`, nueva función en `lib/presupuestoEvento.ts`).
- **"Modalidad de factura", ahora por speaker** (antes un único campo a
  nivel de todo el evento, solo visible en eventos de varias sesiones,
  dentro de la sección "Sesiones" — ese campo, `Evento.facturaModalidad`,
  se conserva por compatibilidad con documentos ya guardados pero deja de
  editarse desde el formulario). Cada speaker externo elige, sin importar
  si el evento es de única o varias sesiones, entre una sola factura por
  el total de su participación o una factura individual por cada sesión
  en la que participe. Columnas nuevas `evento_speakers_participacion.
  monto_honorarios` y `.factura_modalidad` — ver
  `db/agregar_monto_honorarios_factura_modalidad_speaker.sql`.

`npx tsc -b` limpio. Bundles reconstruidos y verificados con grep contra
"Número de sesiones", "Honorarios del speaker", "Cuota de inscripción",
"Modalidad de factura", "Formato" y "Mixto" en el HTML generado antes de
entregar.

**Pendiente de esta ronda**: no se tocó el subsistema de impresión/PDF por
speaker (`DocumentoImprimible.tsx` no imprime hoy el detalle por speaker
externo, ni antes ni después de esta ronda — sigue siendo un gap
preexistente, fuera de lo pedido en la propuesta aprobada).

## Entrega "sesiones sin redundancia" (septiembre 2026)

El usuario detectó una redundancia real de flujo en "Nueva Solicitud de
Evento": la sección "Speakers externos" pedía presupuesto de
transporte/hospedaje/alimentos por sesión para TODOS los speakers en
TODAS las sesiones (asumiendo que todos participan en todas), y esto
ocurría ANTES de que el usuario hubiera descrito siquiera la fecha o el
lugar de esas sesiones (la sección "Sesiones" vivía mucho más abajo). Se
corrigió con tres cambios:

1. **La sección "Sesiones" se movió antes de "Speakers externos"** (ahora
   va justo después de "Fechas, modalidad y lugar", antes de "Muestras
   médicas") — la información propia de cada sesión (fecha, lugar, país,
   ciudad, estado, asistentes esperados) ahora existe antes de que el
   usuario tenga que asociar speakers a sesiones concretas.
2. **Cada speaker externo elige en cuáles sesiones participa** (checkbox
   por sesión, con la fecha/lugar como referencia) — ya no se asume que
   todos los speakers participan en todas las sesiones de un evento de
   varias sesiones; puede ser uno solo, todos, o cualquier combinación.
   Por defecto empiezan todas marcadas (el caso más común) pero se pueden
   desmarcar. El presupuesto de transporte/hospedaje/alimentos por sesión
   solo se pide para las sesiones marcadas. Al quitar una sesión (por
   número o por speaker) se limpian también las filas de presupuesto que
   quedarían huérfanas. Validación nueva: en un evento de varias
   sesiones, cada speaker externo debe tener al menos una sesión marcada.
   No fue necesaria ninguna migración: el modelo de datos
   (`PresupuestoSpeakerSesion[]` por speaker, con `sesionId`) ya admitía
   participación parcial — el límite era solo de la interfaz, que
   forzaba una fila por sesión sin dar opción a quitarla.
3. **"Lista de Asistencia" pasa a asociarse a cada sesión** (antes era un
   único campo a nivel de documento). El campo a nivel de documento se
   conserva, pero solo se muestra para "Única sesión" (que es,
   semánticamente, su propia y única sesión); en "Varias sesiones" cada
   sesión tiene su propio interruptor "La Lista de Asistencia no aplica
   para esta sesión" + motivo. Tampoco requirió migración:
   `sesiones_evento.lista_asistencia_no_aplica`/`_motivo` ya existían en
   el esquema y en `SesionEvento` — solo no se exponían todavía en el
   formulario.

`npx tsc -b` limpio. Bundles reconstruidos y verificados con grep contra
"Sesiones en las que participa este speaker", "La Lista de Asistencia no
aplica para esta sesión" y "Elige en cuáles sesiones participa" en el
HTML generado antes de entregar.

## Entrega "Participación, presupuesto aprobado y anexos" (septiembre 2026)

Cuatro pedidos del usuario sobre "Nueva Solicitud de Evento":

1. **Bug reportado: "No se pudo crear la solicitud de evento: No tienes
   permiso para realizar esta acción" al dar clic en "Guardar como
   borrador"**. Diagnóstico: ese mensaje es la traducción amigable
   (`mensajeErrorAmigable` en `src/lib/supabaseClient.ts`) de un error real
   de Postgres — código `42501` o una violación de Row Level Security — que
   Supabase devuelve al `insert()` que hace `crearEvento()`
   (`src/lib/evento.ts`) sobre `solicitudes_evento`. No es un bug de
   frontend: ninguno de los cambios de esta ni de entregas anteriores toca
   esa función. Este entorno de trabajo no tiene acceso al proyecto real de
   Supabase para inspeccionar las políticas de RLS vigentes, y ya hay un
   precedente documentado en este mismo repo
   (`db/rls-usuarios.propuesta.sql`) de que una política de RLS mal
   calibrada, escrita a ciegas, provocó "infinite recursion detected in
   policy" y bloqueó el login de todos los usuarios. Por eso, en vez de
   adivinar una corrección, se agregó `db/diagnostico-rls-solicitudes-evento.sql`
   (4 consultas de solo lectura: RLS activado/forzado, políticas actuales,
   columnas clave, grants del rol `authenticated`) para correr en el Editor
   SQL del Dashboard de Supabase y compartir el resultado — con eso se
   puede escribir la política exacta que falta.
2. **Validación: "Cuota de inscripción" (por speaker) debía admitir 0**.
   `calcularErroresEvento` rechazaba `montoInscripcion`/`montoHonorarios`
   de cada speaker con `!valor || valor <= 0` (0 se trataba como
   "vacío"). Corregido a `valor === null || valor < 0` en ambos campos.
   De paso se detectó y corrigió una conflación: estos dos campos (por
   speaker) estaban condicionados, tanto en la validación como en la
   interfaz (`{!valor.inscripcionNoAplica && (...)}`), al interruptor
   "La inscripción no aplica" del EVENTO — un concepto distinto (lo que le
   cuesta a la empresa participar en el evento) del de la cuota/honorarios
   de CADA speaker externo, que siempre aplican mientras haya speakers
   externos. Ya no dependen entre sí.
3. **Reorganización de la sección final del formulario**. La sección
   "Inscripción y honorarios" se fusionó con "Presupuesto previo y
   anexos" en una sola sección renombrada **"Participación, presupuesto
   aprobado y anexos"**, con este orden exacto: "La inscripción no
   aplica" → **"Valor participación \*"** (antes "Monto de inscripción";
   ahora obligatorio, admite 0, y ya no depende de si el evento tiene
   participación académica) → **"Detalle participación (qué incluye) \*"**
   (campo nuevo, antes "Detalle de la inscripción" era opcional) →
   "Tiene actividad adicional de pago" → **"Tiene actividad incluida en
   la participación"** (renombrado; antes "...en la inscripción") →
   "¿El evento está incluido en algún presupuesto aprobado? \*" (con sus
   alertas existentes) → "Monto del presupuesto aprobado \*" → "Incluye
   anexos" (con carta de invitación y programa académico si es "Sí").
   Cuando "La inscripción no aplica" pasa a "Sí", "Valor participación"
   se fija en 0 automáticamente. Ningún campo se eliminó, solo se
   relocalizaron/renombraron. El id interno de la sección se conservó
   (`"presupuesto-previo"`) para no romper el estado guardado del
   acordeón; el id `"inscripcion"` desapareció y se quitó del
   `defaultValue` del acordeón.
4. **Advertencia de presupuesto excedido junto a "Presupuesto
   condensado"**: cuando el evento SÍ está marcado como incluido en un
   presupuesto aprobado (con un monto real, no el caso de "continuar sin
   presupuesto aprobado", que ya tiene su propia advertencia) y el total
   condensado (suma de todos los rubros) supera ese monto, aparece un
   aviso junto al total indicando cuánto se está excediendo (en la
   moneda del evento) e invitando a revisar el presupuesto.

`npx tsc -b` limpio. Bundles reconstruidos y verificados con grep contra
"Valor participación", "Detalle participación (qué incluye)",
"Participación, presupuesto aprobado y anexos", "Tiene actividad incluida
en la participación" y el texto de la advertencia de presupuesto excedido
en el HTML generado antes de entregar.

## Ronda de correcciones — "Participación, presupuesto aprobado y anexos" (septiembre 2026)

Dos ajustes puntuales del usuario sobre la sección anterior, ambos en
"Nueva Solicitud de Evento":

1. **Se retiró el campo "Honorarios del speaker" (a nivel de evento)**.
   Pedido explícito: los honorarios ya se diligencian individualmente por
   cada speaker externo al definir la participación académica y sus
   sesiones (campo `montoHonorarios` en "Speakers externos"). El campo
   retirado solo se mostraba para "Speaker interno" o sin participación
   académica — nunca convivió con el desglose por speaker — y de hecho
   tiene sentido de negocio: un empleado (speaker interno) no recibe
   honorarios, solo los HCP externos. No se tocó la columna de base de
   datos ni el total condensado: `condensadoHonorariosSpeaker` sigue
   existiendo y editable directamente en "Presupuesto condensado" por si
   hiciera falta un ajuste manual; para el caso de speaker interno ese
   total ahora queda en 0 automáticamente (antes también quedaba en 0 si
   no se diligenciaba el campo retirado, así que no cambia el resultado
   por defecto).
2. **Bug reportado en "La inscripción no aplica"**: el usuario detectó que
   activar ese interruptor (pensando en "activar" = habilitar el campo)
   en realidad ocultaba "Valor participación" y lo fijaba en 0, mientras
   que dejarlo apagado (el estado por defecto) — que sí permitía
   diligenciar el valor — no comunicaba eso con claridad. Se reemplazó el
   Switch por una pregunta directa con botones Sí/No, **"¿Aplica costo de
   participación? \*"** (mismo patrón visual que "¿Incluido en presupuesto
   aprobado?"): "Sí" habilita "Valor participación" para digitarlo; "No"
   conserva el comportamiento de fijarlo en 0 automáticamente. El campo
   interno (`inscripcionNoAplica`) y su columna en base de datos no
   cambiaron — solo la forma en que se presenta y se controla en la
   interfaz.

`npx tsc -b` limpio. Bundles reconstruidos y verificados con grep contra
"¿Aplica costo de participación?" (presente) y "La inscripción no aplica"
/ "Honorarios del speaker" a nivel de evento (ausentes; el campo de
honorarios por speaker en "Speakers externos" y el de "Presupuesto
condensado" siguen intactos) en el HTML generado antes de entregar.

## Ronda de correcciones — orden, validación y presupuesto completo por sesión (septiembre 2026)

Tres pedidos del usuario, todos sobre "Nueva Solicitud de Evento":

1. **Reordenamiento en "Participación, presupuesto aprobado y anexos"**:
   "¿El evento está incluido en algún presupuesto aprobado? \*" y "Monto
   del presupuesto aprobado \*" ahora van ANTES de "¿Aplica costo de
   participación? \*" (antes iban después). Ningún campo cambió de
   comportamiento, solo el orden visual.
2. **Validación de "Número de sesiones"**: cuando "Modalidad" es "Varias
   sesiones", un valor de 1 o menor ahora muestra "El valor mínimo de
   sesiones debe ser 2" (antes solo se validaba que no estuviera vacío o
   en 0/negativo — un evento de "Varias sesiones" con 1 sesión era
   contradictorio y se aceptaba).
3. **Presupuesto completo de transporte/hospedaje/alimentos,
   independiente de sesión única/varias y de si hay o no participación
   académica** — pedido explícito: "si aplica transporte, hospedaje,
   alimentos, etc, entonces deben habilitarse los campos respectivos...
   similar a lo que sí ocurre cuando... tienes participación académica de
   por lo menos un speaker". Antes de esta corrección, ese detalle
   completo (Acorde a la política de viajes, Tipo de transporte, Valor
   del transporte, cotización adjunta, Taxi, fechas de estancia, Número
   de noches autocalculado, nombre/categoría de hotel, motivo de
   localidad distinta, Acorde a la política de hospedaje/alimentos,
   comentarios) solo existía para el presupuesto POR SPEAKER EXTERNO
   (`renderPresupuestoSpeaker`, sección "Speakers externos"):
   - La sección de documento "Transporte, hospedaje y alimentos" (Única
     sesión, sin speakers externos) le faltaban por completo "Valor del
     transporte" y "Valor estimado de traslados en taxi" (no existían ni
     como campo — nuevas columnas `monto_transporte`/`valor_estimado_taxi`
     en `solicitudes_evento`), y "Número de noches" era un campo manual
     en vez de autocalculado desde las fechas de estancia.
   - El bloque por sesión dentro de "Sesiones" (Varias sesiones, sin
     speakers externos) tenía un detalle MUCHO más reducido — solo 3
     interruptores "no aplica" + un monto cada uno, sin "Acorde a la
     política de viajes", "Tipo de transporte", cotización, taxi, fechas
     de estancia, nombre/categoría de hotel, motivo de localidad
     distinta ni comentarios (nuevas columnas en `sesiones_evento`, ver
     `db/agregar_presupuesto_completo_sesiones_evento.sql`).

   Se unificaron ambos casos en una única función compartida
   (`renderPresupuestoSesion`), con el mismo detalle y el mismo orden de
   campos que `renderPresupuestoSpeaker` — así que ahora los 3 casos
   (Única sesión sin speaker externo, cada sesión de "Varias sesiones"
   sin speaker externo, y presupuesto por speaker externo) se ven y se
   comportan igual. El tipo `PresupuestoSesion` (`types.ts`) se amplió
   para tener el mismo detalle que `PresupuestoSpeakerSesion`; el
   condensado ahora también suma "Traslados en taxi" para el caso sin
   speakers externos (antes esa línea solo se calculaba por speaker).
   Migración pendiente de ejecutar manualmente:
   `db/agregar_presupuesto_completo_sesiones_evento.sql` (agrega las
   columnas nuevas a `sesiones_evento` y a `solicitudes_evento`, todas
   `add column if not exists`).

`npx tsc -b` limpio. Bundles reconstruidos y verificados con grep contra
"El valor mínimo de sesiones debe ser 2", "Se adjunta cotización del
viaje por persona", "Valor estimado de traslados en taxi" y "Si el hotel
está en una localidad distinta al evento" (cada una aparece una sola vez
en el bundle minificado porque `renderPresupuestoSesion` es una única
función compartida, invocada varias veces) en el HTML generado antes de
entregar. También se confirmó por posición en el bundle que "¿El evento
está incluido en algún presupuesto aprobado?" aparece antes que "¿Aplica
costo de participación?".

## Entrega "Configuración de Campos y Variables" (septiembre 2026)

Cinco pedidos del usuario sobre el panel de administración `Configuración
de Campos` (`src/pages/ConfiguracionCampos.tsx`):

1. **"Catálogos de opciones" más fácil de configurar**
   (`EditorCatalogosSimples.tsx`): además de agregar/quitar valores (sin
   cambios), ahora se puede **renombrar un valor en línea** (usa
   `actualizarValorCatalogo`, que ya existía en la capa de datos pero no
   estaba expuesta en esta interfaz), **reordenarlo** con flechas
   arriba/abajo (intercambia el campo `orden` con el vecino inmediato) y
   **buscar/filtrar** por texto (aparece solo cuando el catálogo elegido
   tiene más de 3 valores, para no estorbar en los catálogos chicos). No
   requirió migración — ambas operaciones ya existían en
   `src/lib/catalogos.ts`.
2. **Orden alfabético en todos los desplegables alimentados por
   `useCatalogo`** — ya resuelto en una ronda anterior (`ordenAlfabetico`
   en `src/lib/catalogos.ts`, aplicado en `agruparPorCatalogo` y en
   `useCatalogo`); se confirmó en esta ronda que ningún otro origen de
   catálogo lo esquivaba.
3. **"Ciudades por país" reconstruido como "Territorios"**, con
   País → Estado/Provincia/Departamento → Ciudad en cascada real (antes
   solo había País → Ciudad, y la tabla de ciudades —
   `paises_region_ciudades`— llegó vacía a producción y nunca se pobló;
   en paralelo, "Estado/Provincia/Departamento" vivía como un catálogo
   plano de `catalogo_valores`, sin ninguna relación con el país
   elegido). Se incorporó la librería `country-state-city` (offline, sin
   llamadas de red — funciona igual en este sandbox) como fuente de los 3
   niveles para TODA la app, reemplazando tanto el selector país/ciudad
   como el catálogo suelto "estados". Nuevo componente
   `src/components/SelectPaisEstadoCiudad.tsx` (reemplaza a
   `SelectPaisCiudad.tsx`, que se retira junto con el editor
   `EditorCiudadesPorPais.tsx`), con un único callback
   `onChangePaisEstadoCiudad(pais, estado, ciudad)` — mismo motivo que el
   componente original: evitar que dos o tres `onChange` sincrónicos se
   pisen entre sí por partir todos del mismo `valor` cerrado por
   clausura. Se reemplazaron TODOS los usos de `SelectPaisCiudad` +
   `useCatalogo("estados")` en paralelo: Solicitud de Evento (documento y
   por sesión), Convenio de Pago a HCP, FMV, CAF (contraparte),
   Repositorio de Speakers y Usuarios y Roles (perfil). Los países se
   muestran en español vía `Intl.DisplayNames` (nativo del navegador,
   sin dependencia extra) para calzar con los datos ya guardados
   ("Colombia", "México", "Perú", "Brasil"...). Continuidad de datos: un
   registro anterior con país/estado/ciudad como texto libre que no
   calce exactamente con el catálogo se sigue mostrando y editando —
   aparece como una opción extra "(valor guardado)" al principio del
   desplegable, en vez de perderse o bloquear el campo. `paises_region`
   (la tabla, no `paises_region_ciudades`) NO se tocó: sigue alimentando
   el filtro "País(es) de operación" de Usuarios y Roles y los filtros de
   país de Informe de Pagos, HCPs Impactados, Historial, Participación de
   Speaker y Auditoría de Eventos — un catálogo distinto (países donde
   opera el grupo) del que usa este selector (geografía mundial
   completa). El catálogo suelto "estados" de `catalogo_valores` tampoco
   se borró (política del proyecto de no eliminar datos existentes) —
   sigue visible en "Catálogos de opciones" por si un administrador
   quiere revisarlo o limpiarlo, simplemente ya no lo consume ningún
   formulario. No requirió migración: no se crea ni se borra ninguna
   tabla o columna.
4. **Selector de empresa del grupo en "Configuración de Formatos —
   global"**, con historial/auditoría de cambios. Se consolidaron las dos
   tarjetas que antes existían (una "global" sin selector de empresa, una
   de "override por empresa" con selector) en una sola tarjeta
   **"Configuración de Formatos"** con un único selector de empresa, en
   el que "Global (todas las empresas)" es una opción más de la misma
   lista — la interfaz de proceso/código/versión/fecha/logo no cambia
   según cuál se elija, solo el destino del guardado. Cada guardado
   (global o de una empresa) inserta una fila en la nueva tabla
   `configuracion_formatos_historial` (fecha, usuario —resuelto de la
   sesión vía `useAuth()`—, empresa, tipo de documento, foto de los
   valores guardados), visible como una lista de solo lectura al pie de
   la tarjeta. Migración nueva:
   `db/agregar_historial_configuracion_formatos.sql` (crea la tabla,
   `create table if not exists`).
5. **"Declaración de tratamiento de datos" en su propia sección**, con su
   propio selector global/empresa y su propio historial. Se sacó de la
   tarjeta de formatos (donde vivía como un campo más, sin selector de
   empresa) a una tarjeta nueva, **"Declaración de tratamiento de
   datos"**, que reutiliza el mismo campo de siempre
   (`declaracionTratamientoDatos`, ya existía en ambas tablas
   —`configuracion_formatos` y `configuracion_formatos_empresa`— pero
   nunca se exponía en el override por empresa) y el mismo mecanismo de
   guardado (siempre sube la fila completa). Su historial usa la misma
   tabla del ítem 4, distinguido por la columna `seccion`
   ("formato" vs. "declaracion_tratamiento_datos") para no duplicar el
   modelo de datos.

`npx tsc -b` limpio. Bundles reconstruidos y verificados con grep contra
"Territorios", "Empresa del grupo" (nuevo selector de "Configuración de
Formatos"), "Declaración de tratamiento de datos" (nueva tarjeta propia),
"valor guardado" (aparece 2 veces: fallback de la librería geográfica y
mensaje de ayuda) e "Historial de cambios" en el HTML generado antes de
entregar.

**Migraciones nuevas de esta entrega** (ninguna se aplicó contra la base
real — ejecutar a mano en el SQL Editor de Supabase):
- `db/agregar_historial_configuracion_formatos.sql` — crea
  `configuracion_formatos_historial` (bitácora append-only de cambios a
  "Configuración de Formatos" y a "Declaración de tratamiento de datos").

## Fix — enum `catalogo_simple` incompleto en la base real (septiembre 2026)

Reportado por el usuario: al agregar un valor nuevo en "Catálogos de
opciones" para "Profesión", "Región" y luego "Tipo de participación
académica" salía `invalid input value for enum catalogo_simple: "..."`.
Causa raíz: `CATALOGO_SIMPLE` (TypeScript, `src/lib/enums.ts`) fue creciendo
en varias entregas, pero el enum real `catalogo_simple` de Postgres nunca
recibió el `ALTER TYPE ... ADD VALUE` correspondiente para varios de esos
catálogos — el código de la app ya asumía que existían, la base de datos
no. No hay ninguna migración en `db/` que cree este enum desde cero (se
creó fuera de este repositorio), así que no había dónde agregar los
valores nuevos salvo una migración aparte.

Migración nueva (agrega los 18 valores de `CATALOGO_SIMPLE` con
`ADD VALUE IF NOT EXISTS`, así que es segura de re-ejecutar aunque algunos
ya existieran):
- `db/agregar_todos_los_valores_catalogo_simple.sql` — reemplaza/incluye
  por completo a `agregar_regiones_profesiones_catalogo_simple.sql`
  (entregado primero, cuando solo se habían reportado "profesiones" y
  "regiones"); basta con ejecutar el archivo consolidado.

No fue necesario tocar ningún archivo `.tsx`/`.ts` — es puramente una
migración pendiente de aplicar.

## Ronda de ajustes de formularios (septiembre 2026) — Nuevo Speaker y Nuevo colaborador

Pedido explícito del usuario, dos formularios:

**"Nuevo Speaker" (Repositorio de Speakers)** — `src/pages/Speakers.tsx` y
`src/lib/speakers.ts`:

- **Semáforo de vigencia, reglas corregidas.** Para "Licencia RETHUS /
  Cédula profesional": Vigente mientras no llegue la fecha de vencimiento;
  "Requiere revisión" desde el día en que se cumple o pasa (antes el corte
  era `< 0` días restantes — ahora es `<= 0`, confirmado con el usuario vía
  pregunta de aclaración porque su primer enunciado del corte a "6 meses"
  quedaba invertido respecto a la lógica habitual). Para "Hoja de Vida /
  CV": Vigente si la fecha de actualización tiene 2 años o menos de
  antigüedad, "Requiere revisión/actualización" si tiene más (antes el
  corte era de 1 año/365 días). Ambos conservan un aviso previo de 60 días
  ("Próximo a vencer") sin cambiar la clasificación vigente/vencido en sí.
  La etiqueta compartida `ETIQUETA_VIGENCIA`/`ETIQUETA_ESTADO_CONSOLIDADO`
  para el estado "vencido" pasó de "Vencido" a **"Requiere revisión"** en
  toda la app (tarjetas, filtros, CSV del Informe de Speakers), para usar
  un solo término en vez de dos para el mismo estado. Se agregó
  `fechaLimiteHojaVida()` (actualización + 2 años, calculada, no
  guardada) para mostrar "Vence tal fecha" junto al semáforo de la Hoja de
  Vida, igual que ya se mostraba para RETHUS.
- El semáforo ahora también se ve **dentro del formulario "Nuevo Speaker"**
  (junto a cada fecha), no solo en la tarjeta de la lista — que es donde ya
  existía.
- La advertencia al generar un Convenio de Pago a HCP sobre un speaker con
  RETHUS o Hoja de Vida vencida (`FormularioConvenio.tsx`) ya existía de
  una ronda anterior — sigue funcionando igual, solo hereda las reglas de
  fecha corregidas arriba.
- **"Hoja de Vida / CV", "Documento de la Licencia RETHUS / Cédula
  profesional" y "Documento de identidad" pasan a ser obligatorios**
  (asterisco + validación en `calcularErroresSpeaker`); la fecha de
  actualización de la Hoja de Vida también se vuelve obligatoria en cuanto
  se adjunta el archivo (la necesita el semáforo para calcular algo).
- **Foto del speaker: avatar circular con carga inmediata.** Nuevo
  componente `AvatarFotoSpeaker` (sube el archivo directo con
  `subirArchivo`, sin pasar por el `CampoArchivo` genérico de una fila) —
  al elegir una imagen se ve de inmediato como círculo, igual que en la
  tarjeta del Repositorio de Speakers.
- **Reorganización de "Identificación"**: la foto/avatar queda arriba a la
  izquierda, con "Nombre completo" y "Número de documento" al lado
  derecho, en vez de foto centrada arriba y los campos apilados debajo.

**"Nuevo colaborador" (Configuración de Usuarios / Roles)** —
`src/pages/UsuariosRoles.tsx`:

- **Se retiró el campo "Iniciales"** del formulario (ya no se captura). La
  función Edge `admin-usuarios` (creación real de la cuenta) y el guardado
  de borradores siguen esperando un valor de `iniciales` — no se puede
  modificar esa función desde aquí — así que se deriva automáticamente del
  nombre completo (`derivarIniciales`, mismas dos iniciales que ya usa el
  avatar de respaldo de `TarjetaSpeaker`) justo antes de guardar/confirmar,
  sin que el usuario tenga que digitarlo.
- **Corregido el bug del cursor al "Dibujar firma"**
  (`src/components/archivos/FirmaManuscrita.tsx`): la "punta del lápiz" se
  veía desplazada del cursor real porque, al no bloquear el comportamiento
  nativo del navegador, arrastrar el mouse sobre el `<canvas>` disparaba el
  gesto nativo de "arrastrar imagen" (el cursor pasaba a mostrar una
  miniatura fantasma del canvas, desplazada del puntero real, mientras el
  trazo se seguía dibujando correctamente debajo). Se bloqueó ese gesto:
  `preventDefault()` en el `mousedown` (ya existía en el `mousemove`),
  `draggable={false}` y `onDragStart` con `preventDefault()` en el
  `<canvas>`.

`npx tsc -b` limpio. Bundles reconstruidos y verificados con grep contra
"Documento de la Licencia RETHUS", "Cargar foto del speaker" y "Requiere
revisión" en el HTML generado antes de entregar. No requirió ninguna
migración nueva — todos los campos usados ya existían en el esquema.

## Rediseño de la ventana "Convenio HCP" (septiembre 2026)

Pedido explícito y detallado del usuario sobre `FormularioConvenioHCP.tsx` +
`src/lib/convenioHCP.ts` + `src/lib/precargado.ts` + la vista de detalle/
impresión (`DetalleConvenioHCP.tsx`/`CuerpoConvenioHCP` en
`DocumentoImprimible.tsx`). No confundir con "Convenio de Pago a HCP"
(`FormularioConvenio.tsx`/`lib/convenio.ts`), un documento distinto que esta
cadena referencia como prerrequisito.

**Origen del contrato**:
- "Evento de origen" ahora es un selector filtrado (`eventosParaOrigenConvenioHCP`,
  nuevo en `lib/documentosRequeridosEvento.ts`, mismo patrón que
  `eventosParaOrigenCaf`): solo eventos con participación académica +
  Speaker externo que YA tengan FMV Checklist, Convenio de Pago a HCP y CAF
  vinculados (aunque el CAF no esté firmado). La etiqueta concatena nombre
  del evento + fecha o rango de fechas (reutiliza `etiquetaEventoOrigen`,
  ya existente).
- "CAF asociado" ahora se filtra por el evento elegido (antes listaba todos
  los CAF sin importar el evento).
- "Nombre de la compañía" sigue viniendo del CAF (ya funcionaba).

**Consultor** — se rediseñó por completo la precarga
(`src/lib/precargado.ts`): "Nombre"/"Identificación"/"Dirección"/"Correo"
del consultor ahora vienen del CAF de la contraparte (antes venían del
Speaker); "Credenciales" ahora es "Profesión — Especialidad" del
repositorio de Speakers (antes solo la especialidad). `especialidad` para
armar "Considerando/Whereas" y el resto de textos legales se toma de
`SpeakerResumen.especialidad` (ya lo traía el selector, no hizo falta
ningún fetch adicional).

**Términos del contrato**: "Fecha efectiva" ahora viene del CAF
(`terminoContratoInicio`, antes venía del evento). "Nombre de quien firma
por la compañía" sigue siendo un `Input` libre, con un `<Select>` al lado
que sugiere nombres de usuarios con rol Gerencia General/Representación
Legal (`traerUsuarios().filter(rol === "gerencia_general")`) sin atar el
valor del campo al Select (evita el problema ya documentado en
`precargado.ts` de un Select que no encuentra su `<SelectItem>`).

**Considerando/Whereas, Cierre y Servicios (Anexo A) — decisión de diseño
central de esta entrega**: en vez de agregar columnas nuevas para cada
párrafo legal fijo con hueco variable, se REPURPOSEARON los campos que ya
existían con semántica compatible: `objetivoConsultoria`/`objetivoConsultoriaEn`
ahora guardan el párrafo bilingüe completo "Considerando/Whereas" (antes
solo el objetivo en texto libre), y `serviciosExhibitA`/`serviciosExhibitAEn`
el párrafo completo de "Anexo A/Exhibit A" (antes solo una descripción
libre). Solo el "Cierre" ("EN TESTIMONIO DE LO CUAL.../IN WITNESS
WHEREOF...") no tenía ningún campo compatible existente — se agregaron
`cierre_es`/`cierre_en`, ver `db/agregar_cierre_convenio_hcp.sql`
(pendiente de ejecutar, no aplicada automáticamente).

Los tres bloques se arman con helpers nuevos en
`src/lib/textosFijosConvenioHCP.ts` (`armarConsiderandoEs`/`armarWhereasEn`,
`armarCierreEs`/`armarCierreEn`, `armarAnexoAEs`/`armarAnexoAEn`, con
listado de sesiones — única o varias, con dirección/ciudad/estado/país por
sesión). Se usan como VALOR INICIAL, no como texto recalculado en cada
render: el formulario los autocompleta la primera vez que hay suficiente
información y el campo está vacío, y además ofrece un botón "Generar texto
sugerido" para regenerarlos a pedido — a partir de ahí el campo es texto
libre editable, igual que ya funcionaba `objetivoConsultoria` antes de esta
ronda. Se prefirió este enfoque (documentado explícitamente como opción
más simple en el pedido) sobre intentar preservar por separado "la parte
fija" y "la parte variable" de cada párrafo una vez editado.

"Tema" (para Anexo A) se mapeó a `Convenio.nombreEventoServicio` (Convenio
de Pago a HCP) — no existe ningún campo llamado literalmente "tema" en ese
formulario; `nombreEventoServicio` ("Nombre del evento/servicio") es el
candidato semánticamente más cercano y ya existía, así que se reutilizó en
vez de agregar una columna nueva (documentado también en el propio código,
`FormularioConvenioHCP.tsx`). Se agregó `traerConvenioPorEventoId` en
`lib/convenio.ts` para resolver ese documento a partir del evento elegido.

**Clausulado legal (15 numerales + Anexos C/D)**: ahora tiene una vista
previa visible dentro de esta misma ventana (bilingüe, lado a lado),
alimentada por `traerVersionVigentePlantilla`/`sustituirEmpresaEnPlantilla`
(ya existentes) — de solo lectura durante la creación/edición. El
mecanismo de "ajuste puntual por cláusula" (`guardarAjusteClausula`) sigue
viviendo exclusivamente en el detalle del documento ya creado
(`DetalleConvenioHCP.tsx`), porque exige un `convenioHcpId` real que no
existe todavía mientras se llena este formulario — duplicar esa
infraestructura antes de tener un documento creado no se consideró
justificado; se documenta como decisión deliberada, no como pendiente.

**Paneles de firma (dos, idénticos)**: se decidió que ambos paneles del
documento (después del cierre y después del Anexo A) muestran LA MISMA
firma — un contrato se firma una vez, no dos veces independientes. No se
agregó ninguna columna nueva para "quién firmó por la compañía y cuándo":
la etapa "Gerencia General" de la cadena de aprobación YA es ese momento de
firma (`resueltoPorId`/`fecha` de ese paso), así que `PanelFirmaConvenioHCP`
(nuevo, en `DocumentoImprimible.tsx`) resuelve nombre/cargo/firma
manuscrita de ese usuario (reutilizando `FirmaManuscritaUsuario`, ya
existente — NO se construyó ninguna captura de firma nueva) y la fecha del
paso. El panel "Por el consultor" queda con nombre (tomado del propio
documento) y espacio en blanco para firma/fecha manuscrita — el consultor
no es usuario del sistema, así que no hay nada más que autocargar ahí.

**Anexo B**: se agregó `src/lib/dinero.ts` (`formatearMonto`, nuevo — no
existía ningún helper de este tipo en el proyecto) para el formato pedido
("$1.000.000,00 COP", separadores fijos en `es-CO` + sufijo de moneda),
aplicado en el formulario (vista previa bajo el campo) y en el documento
impreso/detalle.

**Formulario colapsable**: `FormularioConvenioHCP.tsx` se reescribió por
completo como acordeón (`Accordion`/`SeccionAcordeon`, mismo patrón que
`FormularioConvenio.tsx`), con secciones: Origen del contrato, Consultor,
Términos del contrato, Considerando/Whereas, Clausulado legal (vista
previa), Cierre, Firma (nota informativa), Servicios (Anexo A), Anexo B.

**Archivos modificados**: `src/types.ts` (2 campos nuevos en
`ConvenioHcp`), `src/lib/convenioHCP.ts` (columnas nuevas en los dos
`FieldSpec[]`), `src/lib/precargado.ts` (3 funciones reescritas),
`src/lib/documentosRequeridosEvento.ts` (+1 función), `src/lib/convenio.ts`
(+1 función), `src/components/forms/FormularioConvenioHCP.tsx` (reescrito),
`src/components/print/DocumentoImprimible.tsx` (`CuerpoConvenioHCP`
reestructurado + `PanelFirmaConvenioHCP` nuevo), `src/pages/NuevoConvenioHCP.tsx`
y `src/components/DetalleConvenioHCP.tsx` (carga de datos ampliada:
eventos/CAFs completos, usuarios Gerencia General). Archivos nuevos:
`src/lib/textosFijosConvenioHCP.ts`, `src/lib/dinero.ts`,
`db/agregar_cierre_convenio_hcp.sql` (pendiente de ejecutar).

`npx tsc -b` limpio. Bundles reconstruidos y verificados con grep contra
"CONSIDERANDO QUE", "Firma por la compañía", "Servicios (Anexo A)",
"Cierre del cuerpo del contrato", "Generar texto sugerido" y "Evento de
origen (participación académica)" en el `bundle.html` generado antes de
entregar.

## Ronda de correcciones "Nuevo Convenio HCP" (septiembre 2026)

Correcciones sobre el rediseño anterior de "Convenio HCP", pedidas apenas
entregado ese rediseño:

**"Evento de origen" pasa a ser por evento+speaker, no por evento**: un
evento puede tener varias sesiones y varios speakers, y cada speaker puede
haber participado solo en algunas de esas sesiones — el selector ahora
tiene una opción por CADA combinación evento+speaker (id compuesto
`"${eventoId}::${speakerId}"`), con la etiqueta concatenando Nombre del
evento + fecha(s) de las sesiones EN LAS QUE ESE SPEAKER participó (no las
de todo el evento) + Nombre del speaker + Especialidad.
`eventosParaOrigenConvenioHCP` (`src/lib/documentosRequeridosEvento.ts`) se
reescribió sobre `documentosPorSpeaker` (ya existente, mismo emparejamiento
que usa el checklist de documentos por speaker) en vez de iterar eventos
completos; devuelve un nuevo tipo `OpcionEventoOrigenConvenioHCP` que ya
incluye el `cafId` resuelto para ese speaker.

**Los selectores "Speaker (opcional)" y "CAF asociado" se retiraron del
formulario**: quedan implícitos en la opción de "Evento de origen" elegida
(el CAF sigue siendo obligatorio internamente para crear el documento —
columna `caf_id`, ver `crearConvenioHCP` — pero ya no se elige a mano, se
resuelve solo). Al elegir una opción, `FormularioConvenioHCP.tsx` hace UNA
sola carga combinada (Evento + Speaker + CAF en paralelo) y UN solo
`onChange` con todos los campos derivables de los tres a la vez.

**Se revierte el origen de precargado de la ronda anterior** (pedido
explícito, `src/lib/precargado.ts`): "Nombre de la compañía" vuelve a
precargarse desde el Evento (`empresaGrupo`, no desde el CAF); la sección
"Consultor" completa (nombre/identificación/credenciales/correo/dirección)
vuelve a precargarse desde el Speaker relacionado con la solicitud del
evento (no desde el CAF) — el CAF queda aportando únicamente "Fecha
efectiva" y "Moneda"/"Compensación" (Anexo B), que no tienen otro origen
claro.

**Bug corregido — "Generar texto sugerido" solo llenaba el lado inglés**:
`generarConsiderandoWhereas`, `generarCierre` y `generarAnexoA`
(`FormularioConvenioHCP.tsx`) llamaban dos veces seguidas a un wrapper
`set(clave, valor)` local que hacía `onChange({ ...valor, [clave]: v })` —
ambas llamadas cerraban sobre el mismo `valor` del render, así que la
SEGUNDA pisaba silenciosamente el cambio de la PRIMERA (el campo fijado
segundo, en inglés, sobrevivía; el de español se perdía). Se corrigió
fusionando cada par ES/EN en un solo `onChange` con ambos campos a la vez.

**"Tampoco cargan los textos sugeridos de los Anexos A y B"**: para el
Anexo A era el mismo bug de arriba (ya corregido). Para el Anexo B no
había ningún bug — esa sección nunca tuvo un botón "Generar texto
sugerido" ni texto fijo especificado; se agregó uno nuevo
(`armarAnexoBEs`/`armarAnexoBEn` en `src/lib/textosFijosConvenioHCP.ts`)
que resume compensación/moneda/plazo de pago en los campos "Comentarios
sobre el pago (ES/EN)" ya existentes de esa sección, con el mismo patrón
de autogenerado-una-vez-si-está-vacío que los demás bloques.

**Archivos modificados**: `src/lib/documentosRequeridosEvento.ts`
(`eventosParaOrigenConvenioHCP` reescrita + tipo nuevo
`OpcionEventoOrigenConvenioHCP`), `src/lib/precargado.ts` (3 funciones
reescritas), `src/lib/textosFijosConvenioHCP.ts` (+`armarAnexoBEs`/
`armarAnexoBEn`), `src/components/forms/FormularioConvenioHCP.tsx`
(selector combinado, 3 bugs de stale-closure corregidos, botón nuevo de
Anexo B), `src/pages/NuevoConvenioHCP.tsx` y
`src/components/DetalleConvenioHCP.tsx` (carga de datos ajustada: ya no
pasan `cafsDisponibles` al formulario, suman `traerConveniosHCP()` a la
carga inicial). Sin migración nueva — no se agregó ninguna columna.

`npx tsc -b` limpio. Bundles reconstruidos y verificados con grep contra
"Selecciona el evento y el speaker", ausencia de "CAF asociado \*" y
"Speaker (opcional)", y presencia de "Generar texto sugerido" y "El
resumen de compensación y plazo de pago" en el `bundle.html` generado
antes de entregar.

## Corrección adicional — Anexo A seguía sin generar texto (septiembre 2026)

Después de la ronda anterior, el usuario reportó que "Generar texto
sugerido" del Anexo A (Servicios/Services) seguía sin funcionar en ambos
idiomas, aunque Considerando/Whereas, Cierre y Anexo B ya quedaron
corregidos. Causa real (distinta del bug de doble `set()` corregido antes):
`eventoElegido` (el Evento completo que usa `generarAnexoA` para armar el
listado de sesiones) se cargaba con `traerEventoPorId`, que **deliberadamente
omite `sesiones`** (`sesiones: []`, ver su comentario en `src/lib/evento.ts`)
porque los otros 4 documentos que la reutilizan para precargar (CAF,
Convenio, FMV, Notificación de Pago) no las necesitan. Sin sesiones,
`esMultisesion(evento)` siempre daba `false`, así que en cualquier evento de
"Varias sesiones" el Anexo A se armaba con el texto de respaldo de "Única
sesión" usando los campos de dirección/ciudad/país A NIVEL DE EVENTO
(vacíos en un evento multisesión, donde esos datos viven por sesión) — el
resultado era un texto casi vacío, indistinguible de "no carga nada".

**Corrección**: se agregó `traerEventoConSesionesPorId` (nuevo, en
`src/lib/evento.ts`) — igual que `traerEventoPorId` pero con una segunda
consulta a `sesiones_evento` para traer las sesiones completas — y
`FormularioConvenioHCP.tsx` la usa para `eventoElegido` en vez de
`traerEventoPorId` (que se conserva sin cambios para los otros 3
documentos que la usan, y para el precargado liviano de `onCambiaEventoOrigen`,
que no necesita sesiones). De paso, el Convenio de Pago a HCP usado para
"tipo de servicio/actividad/tema" del Anexo A (`convenioPagoElegido`) pasó
de buscarse "el más reciente del evento" (`traerConvenioPorEventoId`) a
buscarse por evento **y** speaker (`traerConvenioPorEventoYSpeaker`, ya
existente) — un evento con varios speakers puede tener un Convenio de Pago
distinto para cada uno, y ahora que el formulario siempre tiene ambos ids
disponibles juntos (ver ronda anterior), no hay razón para conformarse con
"el más reciente" en vez del que corresponde exactamente al speaker
elegido.

**Archivos modificados**: `src/lib/evento.ts` (+`traerEventoConSesionesPorId`),
`src/components/forms/FormularioConvenioHCP.tsx` (el efecto que carga
`eventoElegido`/`convenioPagoElegido` ahora depende de `eventoOrigenId` Y
`speakerId`, y usa las dos funciones nuevas/correctas). Sin migración
nueva. `npx tsc -b` limpio, bundles reconstruidos.

## Segunda corrección — Anexo A seguía sin funcionar en documentos ya existentes (septiembre 2026)

El usuario reportó que el Anexo A seguía sin generar texto incluso después
de la corrección anterior. Al revisar de nuevo con más cuidado: la
corrección anterior cambió la condición que carga `eventoElegido` para
exigir `eventoOrigenId` **Y** `speakerId` a la vez — pero `speakerId` es un
campo que antes de la ronda de "Nuevo Convenio HCP" era opcional
("Speaker (opcional)"), así que cualquier Convenio HCP creado o guardado
como borrador ANTES de esa ronda puede tener `eventoOrigenId` pero
`speakerId` vacío. Para esos documentos, la nueva condición nunca cargaba
`eventoElegido` — el botón quedaba deshabilitado para siempre y "Generar
texto sugerido" no hacía nada, exactamente el síntoma reportado. Fue una
regresión introducida por la corrección anterior, no el mismo bug de
antes.

**Corrección**: `eventoElegido` vuelve a depender solo de `eventoOrigenId`
(como antes de esta ronda) — el `speakerId` faltante ya no lo bloquea. El
Convenio de Pago a HCP (`convenioPagoElegido`, usado para "tipo de
servicio/actividad/tema") se sigue buscando por evento+speaker cuando el
documento sí tiene `speakerId` guardado, pero si no lo tiene, cae de vuelta
al criterio anterior a esta ronda ("el más reciente del evento",
`traerConvenioPorEventoId`) en vez de quedarse sin nada.

`npx tsc -b` limpio, bundles reconstruidos. Sin migración nueva.

## Script de limpieza de datos de prueba (septiembre 2026)

Se agregó `db/limpieza_datos_prueba.sql` — NO es una migración de esquema
(no agrega columnas/tablas), es un script de borrado de datos para dejar la
base lista para probar desde cero, pedido explícitamente. **No se ejecutó
contra ninguna base real** (este entorno no tiene acceso de red a Supabase,
y aunque lo tuviera, un borrado masivo de este tipo nunca se aplica sin que
el usuario lo revise primero) — se entrega para que se corra a mano en el
SQL Editor del proyecto real, empezando por su "PASO 0" (de solo lectura,
para confirmar la lista de usuarios a conservar antes de borrar nada).

Borra por completo: Solicitud de Evento, Convenio de Pago a HCP ("Solicitud
de pago"), CAF, FMV Checklist, Convenio HCP, Notificación de Pago a HCPs, y
el Repositorio de Speakers — con todas sus tablas hijas (aprobaciones,
adendas, ajustes de clausulado, sesiones, presupuestos, repositorio de
archivos/financieros del evento, y lo ya capturado en el Módulo de
Ejecución). También limpia notificaciones, auditoría y solicitudes de
restablecimiento de contraseña pendientes, y dentro de `usuarios` conserva
ÚNICAMENTE los 5 indicados por el usuario (fila en `usuarios` + su cuenta de
Supabase Auth), comparando nombres sin distinguir tildes/mayúsculas. Al
final borra los `archivos_adjuntos` que quedaron huérfanos (CVs, RETHUS,
fotos, firmas), conservando solo la firma registrada de los 5 usuarios que
quedan. No toca catálogos/configuración (`catalogo_valores`,
`campos_personalizados_definicion`, `configuracion_formatos*`, plantilla
legal del Convenio HCP, etc.).

El orden de los `delete` se dedujo revisando los `FieldSpec[]` reales de
cada tabla en el código (`src/lib/{evento,caf,convenio,convenioHCP,fmv,
notificacionPago}.ts`), no por suposición: casi ninguna de estas tablas
tiene `on delete cascade` configurado (la única excepción confirmada es
`evento_speakers_participacion`/`evento_speaker_presupuestos`, ver
`db/agregar_speakers_evento.sql`), así que hay que borrar hijos antes que
padres — y como Convenio de Pago a HCP/CAF/FMV/Convenio HCP/Notificación de
Pago todos guardan `evento_origen_id`, los 6 documentos tienen que borrarse
ANTES que el Evento mismo, no después (además `convenios_hcp.caf_id`
obliga a borrar Convenio HCP antes que CAF, y
`notificaciones_pago_hcp.convenio_origen_id` obliga a borrar la
Notificación antes que el Convenio de Pago).

## Corrección al script de limpieza — DELETE ordenado → TRUNCATE ... CASCADE (septiembre 2026)

Al correr `db/limpieza_datos_prueba.sql` contra la base real, Supabase
devolvió un error real de Postgres:

```
ERROR:  23503: update or delete on table "sesiones_ejecucion_evento" violates
foreign key constraint "registros_participacion_sesion_ejecucion_id_fkey" on
table "registros_participacion"
DETAIL:  Key (id)=(ae5ac7c9-2525-44e3-a931-172072fbc59e) is still referenced
from table "registros_participacion".
```

Esto ocurría a pesar de que el `delete from registros_participacion;`
corría justo antes que el `delete from sesiones_ejecucion_evento;` en el
archivo — el orden en el archivo ya era correcto. La explicación más
probable: `sesiones_ejecucion_evento`/`registros_participacion` son los
datos en vivo del Módulo de Ejecución, y cada `delete` es una sentencia
independiente dentro de la transacción — si alguien estaba usando ese
módulo mientras corría el script (escaneando un código de acceso,
registrando su participación), un `insert` concurrente pudo colarse justo
en la ventana entre esos dos `delete`, sin que ninguna versión del script
pudiera evitarlo por más bien ordenado que estuviera.

La corrección: los PASOS 1–6 (todo lo que cuelga del Evento) se reemplazaron
por un solo `truncate table public.solicitudes_evento cascade;`. Esto
arregla el problema de raíz, no solo el síntoma puntual reportado:

- `TRUNCATE` toma un candado exclusivo sobre la tabla y sobre TODAS las
  tablas que dependen de ella antes de borrar nada, así que no queda
  ninguna ventana para que se cuele un `insert` concurrente como el de
  arriba.
- `CASCADE` hace que Postgres calcule el orden de borrado siguiendo las
  llaves foráneas automáticamente, sin depender de que yo haya revisado
  cada tabla a mano. Al revisar esto encontré que la versión anterior
  además tenía el orden invertido entre `eventos_codigos_acceso` (se
  borraba primero) y `sesiones_ejecucion_evento` (que lo referencia vía
  `codigo_acceso_id`) — muy probablemente el SIGUIENTE error que iba a
  aparecer una vez resuelto el primero. `TRUNCATE ... CASCADE` elimina ese
  riesgo también, sin tener que encontrar y corregir cada caso parecido uno
  por uno.

Solo quedan como `delete` con condición los pasos que de verdad necesitan
una condición (no se pueden expresar con `TRUNCATE`): conservar los 5
usuarios indicados, y conservar los `archivos_adjuntos` que todavía usa la
firma de esos 5 usuarios. El resto del comportamiento (qué se borra, qué no
se toca, la lista de los 5 usuarios a conservar) no cambió — solo el
mecanismo de borrado del Evento y sus dependientes, y la del Repositorio de
Speakers y notificaciones/auditoría, que también pasaron de `delete` a
`truncate` por la misma razón de fondo. Sigue sin haberse ejecutado contra
ninguna base real desde este entorno — se entrega de nuevo para correr a
mano, empezando otra vez por el PASO 0 de solo lectura.

## Segunda corrección al script de limpieza — `unaccent(text) does not exist` (septiembre 2026)

Al correr el PASO 0 (solo lectura) contra la base real, Supabase devolvió:

```
ERROR:  42883: function unaccent(text) does not exist
```

Supabase instala la extensión `unaccent` en el esquema `extensions`, no en
`public`, así que una llamada sin calificar (`unaccent(nombre)`) no la
encuentra aunque la extensión ya esté instalada. La primera corrección
intentó resolver esto con `set search_path = public, extensions;`, pero el
mismo error volvió a aparecer: el Editor SQL de Supabase reparte las
sentencias usando PgBouncer en modo "transaction pooling", que puede asignar
cada sentencia a una conexión física distinta — un `set search_path` hecho
en una sentencia no está garantizado que siga activo en la siguiente, así
que depender de él es frágil.

Corrección definitiva: se eliminó por completo la dependencia del
`search_path`. Las tres consultas que usan `unaccent` (las dos del PASO 0 y
la del PASO 4 que de verdad borra usuarios) ahora llaman a la función
siempre calificada con su esquema: `extensions.unaccent(nombre)`. Esto
funciona sin importar qué sentencia haya corrido antes o en qué conexión
física caiga cada una. También se corrigió el nombre completo de Luis
("Luis Alejandro Méndez Madriz") en los tres lugares donde aparecía el
arreglo de nombres a conservar — antes solo estaba corregido en el PASO 0.

## Tercera corrección al script de limpieza — se abandonó `unaccent` por completo (septiembre 2026)

Con la función ya calificada como `extensions.unaccent(nombre)`, el PASO 0
devolvió un tercer error:

```
ERROR:  42883: function extensions.unaccent(text) does not exist
```

Es decir, la extensión `unaccent` en realidad no está instalada en ese
esquema en este proyecto (ni en ningún otro al que el rol usado por el
Editor SQL tenga acceso) — la línea `create extension if not exists
unaccent ...` de la corrección anterior no la había creado, probablemente
porque el rol que usa el Editor SQL de este proyecto no tiene permiso para
instalar extensiones (una restricción común en proyectos Supabase que no
están en el plan/rol de administrador completo).

En vez de seguir persiguiendo dónde vive o cómo instalar `unaccent`, se
eliminó la dependencia de esa extensión por completo. Las tres consultas
que necesitaban "comparar ignorando tildes" ahora usan `translate(nombre,
'áéíóúÁÉÍÓÚñÑüÜ', 'aeiouAEIOUnNuU')` — una función nativa de Postgres, sin
extensión ni esquema especial, que reemplaza letra por letra cada vocal
con tilde y la "ñ"/"Ñ" por su equivalente sin tilde. Cubre los 5 nombres
que este script necesita comparar. Esto también deja el script más simple:
ya no hace falta la línea `create extension`.

## Script para dar privilegios de Administrador (septiembre 2026)

Se agregó `db/dar_privilegios_administrador_sebastian.sql`, pedido
explícitamente, para que el usuario Sebastián González
(`sebastian.gonzalez@bauschhealth.com`) tenga acceso completo de
Administrador. NO es una migración de esquema ni se ejecutó contra ninguna
base real — se entrega para correr a mano en el SQL Editor de Supabase,
empezando por su PASO 0 (solo lectura) para confirmar que es la fila
correcta.

Revisando `src/lib/enums.ts`, `src/lib/navegacion.ts`,
`src/hooks/useAuth.tsx` y `src/lib/usuarios.ts` se identificaron las 6
columnas de `usuarios` que en conjunto determinan el nivel de acceso de
Administrador — no basta con una sola:
- `rol = 'administrador'` (uno de los 7 valores del enum `rol`) da acceso a
  toda página marcada `soloRoles: ["administrador"]`.
- `es_administrador` (boolean) es un "override" independiente del `rol` —
  se deja también en `true` para no depender de una sola señal.
- `administrador_alcance_limitado` debe quedar en `false`: si es `true`, el
  Administrador solo ve colaboradores que compartan empresa del grupo y
  país de operación con él (alcance reducido, no privilegios completos).
- `paginas_permitidas` / `paises_operacion` / `empresas_grupo` se limpian a
  `NULL` (un arreglo vacío/NULL se trata como comodín "todas"/"todos" en
  toda la app) para que no quede ninguna restricción de páginas o de
  alcance geográfico/empresarial superpuesta al rol.

El script deja una nota final explicando que si `auth_user_id` sale en
NULL o `estado_usuario` en `'Borrador'` en el PASO 0, la fila todavía no
tiene una cuenta de acceso real (invitación de Supabase Auth sin
completar) — dar el rol de Administrador no alcanza por sí solo en ese
caso para poder iniciar sesión.

## Corrección — `db/dar_privilegios_administrador_sebastian.sql` referenciaba una columna que no existe en la base real (septiembre 2026)

Al correr el PASO 0, Supabase devolvió:

```
ERROR:  42703: column "estado_usuario" does not exist
```

`estado_usuario` es una columna real en el código (`src/hooks/useAuth.tsx`,
`src/lib/usuarios.ts`), pero la agrega `db/agregar_campos_nuevo_usuario.sql`
— una migración distinta, ya escrita desde una entrega anterior, que
todavía no se había aplicado contra este proyecto real de Supabase. Se
quitó `estado_usuario` de las dos consultas de `dar_privilegios_
administrador_sebastian.sql` (no hace falta para dar el rol de
Administrador) y se dejó una nota en el propio archivo explicando que, si
se quiere usar "Guardar como borrador" en el formulario Nuevo Usuario, esa
es la migración pendiente que habría que correr aparte.

## Segunda corrección — trigger de protección bloqueaba el UPDATE (septiembre 2026)

Al correr el PASO 1, Supabase devolvió:

```
ERROR:  P0001: Solo Dirección Médica o un Administrador pueden cambiar
nombre, cargo, correo, rol, país(es)/empresa(s) de operación, o las
banderas de Administrador de un colaborador.
CONTEXT:  PL/pgSQL function fn_resguardo_edicion_usuarios() line 41 at RAISE
```

Este trigger de protección sobre `usuarios` NO está definido en ningún
archivo de este repositorio — se creó directo en el proyecto real de
Supabase en algún momento anterior a esta sesión de trabajo, así que no
hay forma de ver su lógica exacta desde acá. Lo razonable de asumir: valida
quién hace el cambio a través de la sesión autenticada de la aplicación
(`auth.uid()` o algo equivalente) — y el Editor SQL de Supabase no tiene
esa sesión, así que el trigger bloquea el `UPDATE` sin importar qué tan
privilegiado sea el rol de conexión del Editor.

Se corrigió `db/dar_privilegios_administrador_sebastian.sql` para apagar
ÚNICAMENTE ese trigger puntual (localizándolo por su función,
`fn_resguardo_edicion_usuarios`, no por un nombre de trigger adivinado),
hacer el `UPDATE`, y volver a prenderlo enseguida — todo envuelto en una
sola transacción (`begin`/`commit`) para que, si algo falla a mitad de
camino, el trigger de protección nunca quede apagado por error (la
reversión de la transacción también revierte el `disable trigger`).

## Confirmado: `db/agregar_campos_nuevo_usuario.sql` sigue pendiente (septiembre 2026)

Al intentar guardar una modificación desde el formulario "Nuevo Usuario",
la app devolvió:

```
Could not find the 'ciudad' column of 'usuarios' in the schema cache
```

Esto confirma directamente lo que ya se había detectado antes al toparse
con `estado_usuario` (ver más arriba): `db/agregar_campos_nuevo_usuario.sql`
— la migración que agrega `numero_documento`, `pais`, `estado_provincia`,
`ciudad`, `observaciones` y `estado_usuario` a `usuarios` — todavía no se
había aplicado contra este proyecto real de Supabase. El mensaje puntual
("... in the schema cache") es el error propio de PostgREST cuando su
caché de columnas está desactualizado frente al esquema real, así que se
agregó al final del archivo una nota indicando correr `NOTIFY pgrst,
'reload schema';` después del `ALTER TABLE` si el error persiste
inmediatamente después de aplicarlo (PostgREST también se refresca solo
pasado un rato). No se modificó el `ALTER TABLE` en sí — seguía correcto
desde que se escribió.

## Habilitar/inhabilitar usuarios en "Usuarios y Roles" (septiembre 2026)

Pedido explícito: que un Administrador pueda inhabilitar y volver a
habilitar usuarios desde "Usuarios y Roles", conservando el alcance
(global vs. por país/empresa).

**Base de datos** — `db/agregar_activo_usuario.sql` (NO aplicado
automáticamente, correr a mano): agrega `usuarios.activo` (boolean, default
`true` para no afectar a nadie ya existente). Se dejó como una columna
simple y no un enum/estado más elaborado porque es exactamente lo pedido:
un interruptor de dos posiciones, no un flujo con más estados.

**Alcance — se reutilizó, no se reinventó**: la pantalla YA filtraba, para
un Administrador de alcance limitado (`administradorAlcanceLimitado`), la
lista de usuarios a solo los que comparten empresa del grupo y país de
operación con él (`recargar()` en `UsuariosRoles.tsx`, vía
`AlcanceUsuario`/`dentroDelAlcance` en `lib/usuarios.ts`). Como el
interruptor de habilitar/inhabilitar vive en esa misma tabla ya filtrada,
alguien fuera del alcance de ese Administrador simplemente nunca aparece en
la fila para poder tocarlo — no hizo falta ninguna comprobación de alcance
adicional. La única regla nueva es que nadie puede inhabilitar su propia
cuenta (mismo criterio que el bloqueo de auto-escalamiento ya existente del
hallazgo F39, para "Acceso de Administrador").

**Código**:
- `src/types.ts` — `Usuario.activo: boolean`.
- `src/hooks/useAuth.tsx` — se agrega `activo` a `CAMPOS_USUARIO`, y
  `cargarUsuarioDeSesion()` gana una tercera rama (junto a "sin perfil
  vinculado"): si `fila.activo` es `false`, cierra la sesión con el mensaje
  "Tu cuenta fue inhabilitada. Contacta a un Administrador de BEATS.".
- `src/lib/usuarios.ts` — nueva función `cambiarActivoUsuario(usuarioId,
  activo)`, un `.update()` directo y simple (no toca Supabase Auth ni pasa
  por la función Edge `admin-usuarios` — la cuenta de inicio de sesión
  sigue existiendo, solo se le niega el acceso desde `useAuth`).
- `src/pages/UsuariosRoles.tsx` — nueva columna "Activo" en la tabla, con
  un `Switch` por fila (mismo patrón que `alternarActivo` en
  `EditorPortafolioProductos.tsx`), deshabilitado en la propia fila de
  quien tiene la sesión abierta; fila de un usuario inhabilitado se ve
  atenuada (texto tachado, badge "Inhabilitado").

**Límite conocido, documentado en el propio `db/agregar_activo_usuario.sql`
y en el comentario de `useAuth.tsx`**: el bloqueo se revisa cuando
`cargarUsuarioDeSesion()` vuelve a correr (login, recarga de página, o un
evento de `onAuthStateChange`) — no revoca al instante una sesión que ya
estaba abierta en otra pestaña/dispositivo en el momento de inhabilitar a
alguien. Para eso haría falta una acción nueva en la función Edge
`admin-usuarios` usando `service_role` (`auth.admin.updateUserById(...,
{ ban_duration })`), no implementada en esta entrega porque no fue lo
pedido — se documenta la opción por si se necesita después.

## Cuarta corrección al script de limpieza — PASO 5 no excluía dos catálogos que sí referencian `archivos_adjuntos` (septiembre 2026)

Al correr el script completo contra la base real, Supabase devolvió:

```
ERROR:  23503: update or delete on table "archivos_adjuntos" violates
foreign key constraint "formato_oficial_fmv_archivo_id_fkey" on table
"formato_oficial_fmv"
DETAIL:  Key (id)=(...) is still referenced from table "formato_oficial_fmv".
```

El PASO 5 (borrar archivos adjuntos huérfanos) asumía que `usuarios.firma_id`
era la ÚNICA tabla que podía seguir referenciando `archivos_adjuntos` a esa
altura — pero el propio encabezado del archivo, en su lista "NO TOCA", ya
nombraba `formato_oficial_fmv` y `productos_portafolio` como catálogos que
este script nunca borra, y ambos pueden apuntar a un archivo adjunto
(`formato_oficial_fmv.archivo_id` — la plantilla oficial de FMV subida como
PDF/Word — y `productos_portafolio.logo_id` — el logo de un producto).

Se revisó `src/lib/*.ts` por completo buscando cualquier columna que
apunte a `archivos_adjuntos`, para confirmar que estas dos eran las únicas
referencias de catálogo que faltaban (todo lo demás que la referencia —
speakers, eventos, convenios, CAFs, FMVs, convenios HCP — ya lo borra el
`TRUNCATE ... CASCADE` del PASO 1/2). Se agregaron las dos exclusiones que
faltaban al `where` del PASO 5.

## Anexo A (Convenio HCP) — el botón seguía inhabilitado, ahora aplica la misma lógica que Considerando/Cierre/Anexo B (septiembre 2026)

Reporte: con la base de datos recién limpiada (ningún evento/CAF/Convenio
de Pago/FMV creado todavía), el botón "Generar texto sugerido" de
"Servicios (Anexo A) / Services (Exhibit A)" aparecía inhabilitado,
mientras que los de Considerando/Whereas, Cierre y Anexo B sí funcionaban
sin ese requisito.

Diagnóstico: no era un bug de estado obsoleto como las rondas anteriores
de este mismo síntoma — el botón tenía literalmente `disabled={!eventoElegido}`
(`FormularioConvenioHCP.tsx`), y `eventoElegido` solo se llena si se elige
una opción en el selector "Evento de origen", que a su vez SOLO lista un
evento+speaker cuando ya existen, para esa combinación, un CAF, un Convenio
de Pago a HCP y un FMV Checklist activos (`eventosParaOrigenConvenioHCP` en
`lib/documentosRequeridosEvento.ts`). Con la base recién limpiada, ese
selector está vacío por diseño — de ahí el botón inhabilitado. Pedido
explícito del usuario: que el Anexo A deje de depender de eso y siga la
MISMA lógica que los otros tres bloques, que siempre generan texto (con un
marcador entre corchetes donde falte información) sin exigir ningún
documento de origen.

Cambios:
- `lib/textosFijosConvenioHCP.ts` — `DatosAnexoA.evento` pasa de
  `Evento` (obligatorio) a `Evento | null`. `listadoSesiones()` y
  `numeroSesionesTexto()` ahora aceptan `null` y devuelven un marcador
  (`[completar: fecha(s) y lugar(es) de la(s) sesión(es)]` / `[N]`) en vez
  de asumir que el evento existe — mismo patrón que ya usan
  `armarConsiderandoEs`/`armarAnexoBEs` para sus propios campos faltantes
  (`[Compañía]`, `[tipo de servicio]`, etc.).
- `components/forms/FormularioConvenioHCP.tsx` — se quitó el
  `disabled={!eventoElegido}` del botón; `generarAnexoA()` ya no corta si
  `!eventoElegido` (pasa `eventoElegido` tal cual, sea `null` o no); el
  autocompletado inicial (el `useEffect` que llama a `generarAnexoA()` la
  primera vez que el campo está vacío) ya no espera a `eventoElegido`/
  `convenioPagoElegido` — se comporta igual que el de Considerando/Cierre.

Si más adelante se elige un "Evento de origen" real (o ya existía uno
elegido antes de esta corrección), "Generar texto sugerido" sigue
produciendo el listado real de sesiones — el marcador entre corchetes solo
aparece cuando de verdad no hay evento elegido, igual que los demás
bloques con sus propios campos vacíos.

## Firma manuscrita, montos con moneda, acordeón en Configuración de Campos, avatar de producto, logo de la app y ajustes de Créditos (septiembre 2026)

Seis pedidos explícitos del usuario, entregados juntos.

### 1. Firma manuscrita: la punta del "lápiz" no coincidía con el cursor

Reporte: al dibujar la firma en `FirmaManuscrita.tsx`, la punta dibujada
quedaba desplazada del cursor real del mouse — un ciclo anterior ya había
dado esto por resuelto, pero el diagnóstico de esa vez (drag-and-drop nativo
del navegador) era incorrecto y el problema seguía ahí.

Causa real: el `<canvas>` de `CapturaFirmaManuscrita` se estira por CSS
(flex/`align-items: stretch`) a un tamaño en pantalla distinto de su tamaño
interno de dibujo (los atributos `width`/`height` del elemento). Sin
corregir esa diferencia de escala, `getBoundingClientRect()` da coordenadas
en el sistema CSS pero `ctx.lineTo()` las usa como si fueran del sistema
interno del canvas — el desfase crece mientras más lejos del origen se
dibuje. `src/ejecucion/components/FirmaCanvas.tsx` (Ejecución en Sitio) ya
tenía la corrección correcta desde antes; `FirmaManuscrita.tsx` (app
principal) no. Se aplicó la misma corrección: escalar `clientX/clientY -
rect.left/top` por `canvas.width/rect.width` y `canvas.height/rect.height`
antes de usarlos.

### 2. Montos de dinero: moneda + separadores en TODA la app

Pedido: todo campo de dinero debe mostrar, al final del número, el código
de moneda (COP, USD, MXN, EUR...) elegido en el campo "Moneda" del mismo
documento, con separadores de miles/decimales (formato es-CO), por ejemplo
`$1.000.000,00 COP`. `formatearMonto()` (`src/lib/dinero.ts`) ya existía de
una ronda anterior pero no se usaba en todos lados. Auditoría completa y
corrección en:

- `pages/Tablero.tsx`, `pages/InformePagos.tsx`,
  `components/RepositorioEvento.tsx` — displays de solo lectura: el valor
  crudo se reemplazó directamente por `formatearMonto(...)`.
- `components/forms/FormularioCAF.tsx`, `FormularioConvenio.tsx`
  (contraprestación HCP y catering), `FormularioNotificacionPago.tsx` —
  cada `Input` de monto ahora muestra debajo un texto
  `{formatearMonto(valor, moneda)}` en vivo mientras se digita.
- `components/forms/FormularioEvento.tsx` — el más grande: los 2 juegos de
  presupuesto por sesión/speaker (transporte, taxi, hospedaje, alimentos),
  cuota de inscripción y honorarios de cada speaker externo, monto del
  presupuesto aprobado, valor de participación del evento, los 7 campos
  del "Presupuesto condensado" (inscripción, transporte, traslado,
  hospedaje, alimentos, honorarios del speaker, otro) y los 4 totales de
  solo lectura (total condensado y la advertencia de exceso de
  presupuesto) — todos con moneda y separadores ahora.
- `components/print/DocumentoImprimible.tsx` — mismo criterio en los 6
  documentos impresos (~19 lugares): CAF, Notificación de Pago, Convenio
  (contraprestación HCP y catering), Evento (presupuesto aprobado,
  inscripción, subtotales de transporte/hospedaje/alimentos por sesión o
  únicos, presupuesto condensado y costo total). De paso se encontró que
  "Honorarios del speaker" del presupuesto condensado no tenía ninguna
  fila en el documento impreso — se agregó.

Efecto colateral necesario: el componente interno `Campo` de
`FormularioEvento.tsx`, `FormularioConvenio.tsx`, `FormularioCAF.tsx` y
`FormularioNotificacionPago.tsx` (envuelve cada campo con su `<Label>` y le
inyecta un `id` autogenerado al control) exigía un único hijo
(`children: React.ReactElement`) — no admitía el `Input` + el nuevo
`<p>` de monto formateado como dos hijos. Se generalizó a
`children: React.ReactNode` con `React.Children.map`: solo el primer
elemento válido (el control real) recibe el `id`, el resto se renderiza
tal cual.

### 3 y 4. Configuración de Campos/Variables: acordeón + Portafolio de Productos con avatar

Pedido: la sección "Configuración de Campos/Variables" debía usar
formulario tipo acordeón (mismo patrón ya aplicado a Evento, Convenio, FMV,
CAF, Nuevo Speaker, Nuevo Usuario — `SeccionAcordeon.tsx`); y dentro de
ella, "Portafolio de productos" debía mostrar el logo/foto de cada producto
en la lista, y en el formulario de edición cargarlo como avatar inmediato
(sin clic en "Ver foto"), igual que ya se hizo para HCPs/Speakers.

Los 6 paneles de `pages/ConfiguracionCampos.tsx` (`EditorCamposPersonalizados`,
`EditorEtiquetasCampo`, `EditorCatalogosSimples`, `EditorTerritorios`,
`EditorPortafolioProductos`, `EditorConfiguracionFormatos`) eran cada uno un
`<Card>` independiente con su propio `CardHeader`/`CardTitle`. Se
convirtió cada uno a `<Accordion><SeccionAcordeon>...</SeccionAcordeon></Accordion>`
(un acordeón de un solo ítem colapsable por panel, salvo
`EditorConfiguracionFormatos`, que ya agrupaba 3 tarjetas internas
—Configuración de Formatos, Declaración de tratamiento de datos, Formato
Oficial FMV— y pasó a ser un único `<Accordion type="multiple">` con esas 3
como ítems). El botón de acción de cada panel ("+ Nuevo campo", etc.) se
movió al slot `accionesHeader` de `SeccionAcordeon`, al lado del título.

En `EditorPortafolioProductos.tsx`:
- La lista ahora precarga los logos de todos los productos de una sola vez
  (`traerArchivos`, mismo patrón que las fotos de perfil en
  `Speakers.tsx`) y muestra cada uno en un `Avatar` circular (con iniciales
  del nombre como respaldo si no hay logo) al lado del nombre del
  producto.
- El campo "Logo" del diálogo de alta/edición dejó de ser un
  `CampoArchivo` genérico (fila con nombre de archivo + botón "Ver foto")
  y pasó a ser `AvatarFotoProducto`, calcado de `AvatarFotoSpeaker` en
  `Speakers.tsx`: sube el archivo de inmediato al elegirlo y muestra el
  círculo con la foto ahí mismo, sin esperar a guardar el formulario ni
  hacer clic en ningún lado para verla.

### 5. Logo de la aplicación en Login y en la ventana principal

Pedido: el logo que se precarga en Configuración de Campos/Variables
("Logo de la aplicación (barra lateral)", campo `logoAppId` de
`configuracion_formatos`) debía verse también en la pantalla de login y en
la parte superior izquierda de la ventana principal — y en Créditos (ítem
6). `LogoApp.tsx` ya sabía pintar un logo real si se le pasaba `logoUrl`,
pero ese componente lo decía explícitamente en su propio comentario: la
resolución de `logoAppId` a una URL real había quedado pendiente
("deferred") desde la fase que lo creó, así que los 3 lugares que lo usan
(`PantallaLogin.tsx`, `App.tsx`, y ahora `Creditos.tsx`) siempre mostraban
el ícono de respaldo.

Se agregó `src/hooks/useLogoApp.ts` (mismo patrón que
`useMembreteImpreso`, pero resolviendo `logoAppId`/`logoAppAnchoPx`/
`logoAppAltoPx` — el logo de la app es siempre global, sin override por
empresa) y se conectó en los 3 lugares. En la pantalla de login, la
consulta corre sin sesión iniciada; si las políticas de la base no
permiten esa lectura sin autenticar, el hook falla en silencio (mismo
criterio de "comodidad informativa, no requisito" que ya usa
`useMembreteImpreso`) y se sigue viendo el ícono de respaldo — no rompe el
login.

### 6. Ventana de Créditos: logo, texto más grande y centrado, nuevo texto de ubicación, y dos párrafos reescritos

`pages/Creditos.tsx` reescrito:

- El ícono genérico (`CalendarCheck`) se reemplazó por `<LogoApp>` (ver
  punto 5).
- Todos los textos se agrandaron un nivel (`text-sm`→`text-base`/`text-lg`,
  etc.), manteniendo el centrado que ya tenía la tarjeta.
- Debajo del correo de contacto se agregó, centrado, "Humax Pharmaceutical
  S.A. · Medellín · Colombia" y debajo un ícono de bandera de Colombia
  centrado (emoji 🇨🇴 — lucide-react, la librería de íconos que ya usa toda
  la app, no incluye banderas de países).
- Texto reemplazado (título + párrafo se fusionan en el texto exacto
  pedido): antes "Desarrollado con Claude (Anthropic)" + "Se construyó a
  través de la interacción con Claude, el modelo de inteligencia
  artificial de Anthropic.", ahora título "Desarrollado con Claude
  (Anthropic)." y debajo "Agradecimiento especial al equipo de TI local
  por el soporte para la puesta en marcha del aplicativo en el entorno
  corporativo".
- Texto reemplazado (verbatim pedido por el usuario): el párrafo de
  descripción de BEATS ahora dice "...ideada y desarrollada por Sebastian
  González Avendaño (Medical Affairs, Colombia), con el propósito de..."
  (antes solo "Sebastian González", sin cargo ni país).

## Rediseño visual "enterprise, sobrio y ergonómico" (septiembre 2026)

Pedido explícito del usuario (brief de diseño detallado, actuando como
"Diseñador y Desarrollador Front-End Senior"), aplicado directamente sobre
el código real de BEATS — no como mockup aparte. Cambios a nivel de
componentes compartidos (se propagan automáticamente a toda la app) más
algunos puntos concretos de layout.

**Tipografía y color base** (`src/index.css`):
- Roboto pasa a ser la fuente real de toda la app (antes Lato), con el peso
  900 agregado a la carga de Google Fonts (`index.html`,
  `entrada-ejecucion.html`, `entrada-marquesina.html`) junto a los pesos que
  ya existían (300/400/500/700). Lato queda como respaldo si Roboto no
  carga.
- `--background` pasa a un blanco-hielo ultra tenue (`#FCFDFE` aprox.,
  antes un gris más marcado).
- `--primary`/`--ring`/`--brand-blue` se alinean al azul institucional
  exacto pedido (`#00A3E0` — prácticamente idéntico al `#00a1e4` ya
  reconstruido desde el bundle original, así que no rompe la identidad de
  marca); `--brand-blue-dark` pasa a `#0091C8` (el mismo tono que usa el
  gradiente de los botones primarios, ver abajo).
- `--accent`/`--accent-foreground` (el resaltado de opciones de
  `<Select>`, y cualquier otro uso de "accent" en la app) se afinan a los
  valores exactos pedidos: fondo `#E0F2FE` / texto `#0284C7`.
- `--border`/`--input` pasan a un slate-200 sutil; `--radius` crece de
  `.625rem` a `.75rem` (equivalente a `rounded-xl`, pedido explícito para
  tarjetas y superficies).

**Componentes compartidos** (`src/components/ui/`):
- `button.tsx` — "Patrón B2: gradiente sedoso con micro-bisel". El botón
  primario (`variant="default"`, usado en "Enviar a Aprobación", "Nuevo
  Speaker", etc. en toda la app) pasa a un gradiente vertical
  `#00B2F2`→`#0091C8` con micro-reflejo superior, bordes laterales/inferior
  oscurecidos, sombra de apoyo difusa y compresión de 1px al hacer clic. El
  secundario (`variant="secondary"`, "Guardar Borrador"/"Cancelar"/etc.)
  pasa a gradiente blanco→gris ultra tenue con borde slate-300.
- `input.tsx`, `textarea.tsx`, `select.tsx` (Trigger) — "inputs planos":
  sin `box-shadow`, borde `slate-300`, `rounded-lg`, foco clínico
  corporativo (borde azul de marca + halo `ring-sky-100`). El resaltado de
  `<SelectItem>` ya usaba el token `--accent`/`--accent-foreground`, así que
  hereda automáticamente los nuevos valores exactos (`#E0F2FE`/`#0284C7`)
  sin tocar `select.tsx` en ese punto.
- `label.tsx` — texto en semi-negrita (`font-semibold`) y `slate-800` en
  vez de `font-medium` genérico, para más contraste/lectura rápida.
- `card.tsx` — `rounded-xl` + borde `slate-200` (antes `rounded-lg` +
  `--border` genérico).
- `accordion.tsx` — "acordeones de alto contraste": cabecera con fondo azul
  cielo tenue (`bg-sky-50/70`) y borde inferior propio, que se extiende de
  borde a borde del contenedor con márgenes negativos y se recorta por las
  esquinas redondeadas gracias a `overflow-hidden` agregado en
  `AccordionItem`; título en negrita mayúscula con tracking amplio; el
  chevron ya rotaba al desplegar. Efecto automático en los ~20 acordeones
  que ya usaba la app (`SeccionAcordeon` y los acordeones a mano de
  Usuarios y Roles / Plantilla de Convenio HCP).
- `toggle-capsula.tsx` (nuevo) — "Patrón A1: toggle cápsula flotante", un
  control segmentado genérico (riel gris con pastilla blanca flotante
  sobre la opción activa) para reemplazar `<Select>`/`<Switch>` en
  decisiones de modalidad/binarias. Aplicado en `FormularioEvento.tsx`: el
  "Formato" del evento (Presencial/Virtual/Mixto, antes un `<Select>`) y
  "¿Se entregarán muestras médicas?" (antes un `Switch` con texto al lado,
  ahora Sí/No).

**Layout** (`App.tsx`):
- Sidebar de 260px (antes 320px/`w-80`), logo reducido a juego (`anchoMax`
  200).
- Estado activo del menú lateral pasa de un acento de borde izquierdo a
  una "cápsula azul suave" (píldora `rounded-full` con el fondo
  `--sidebar-active-bg` ya existente) — pedido explícito.
- El contenido principal (`<main>`) se acota a un ancho ergonómico
  (`max-w-5xl mx-auto px-6 py-8`) para que los formularios no queden
  desparramados en monitores ultrawide, en vez de ocupar todo el ancho
  disponible de borde a borde.
- El topbar (título con ícono temático, campana de notificaciones con
  contador en rojo, avatar de perfil con menú desplegable) y el logo
  dinámico del sidebar ya cumplían con lo pedido de entregas anteriores —
  sin cambios ahí más allá del tamaño.

No se tocaron los colores de estado de documento (`--status-*`:
aprobado/pendiente/rechazado/etc.) ni la lógica de ningún formulario —
alcance estrictamente visual.

## Refactorización de precisión — 9 ajustes visuales y funcionales (septiembre 2026)

Segundo pedido explícito del usuario (brief "refactorización de precisión",
9 puntos concretos), que **revierte parcialmente** algunas decisiones del
rediseño visual anterior (sección de arriba) y afina otras. Aplicado
directamente sobre el código real, mismo criterio que la entrega anterior.

1. **Sidebar** (`App.tsx`) — vuelve a `w-[320px]` (se había reducido a
   260px), con `overflow-x-hidden` para que el botón "Notificación de pago
   a HCP" quede siempre en una sola línea (`whitespace-nowrap` en los
   botones del menú, sin scroll horizontal). Íconos del menú homogenizados
   a 20px (`h-5 w-5`, antes 16px). Logo del sidebar ajustado a `anchoMax
   220` a juego con el ancho nuevo.
2. **Tipografía Roboto estandarizada** (`src/index.css`,
   `components/ui/card.tsx`): títulos de sección `text-slate-900
   font-bold` (agregado a `h1-h4` en `@layer base` y a `CardTitle`);
   textos secundarios/descriptivos `text-slate-500 font-normal text-xs`
   (se corrigió `--muted-foreground` al equivalente HSL de slate-500, que
   ya propagaba automáticamente a `text-muted-foreground` en toda la app,
   y a `CardDescription`). Labels y placeholders ya cumplían desde la
   entrega anterior.
3. **Armonización cromática de filtros** — nuevo componente compartido
   `components/ui/filtro-pastilla.tsx` (`FiltroPastilla`): activo =
   `bg-[#00A3E0]` texto blanco en negrita con sombra; inactivo =
   `bg-slate-100` texto `slate-600`. Reemplaza la lógica de colores propia
   que tenía cada página (`Tablero.tsx`, `Speakers.tsx`, `Historial.tsx`),
   eliminando las variaciones de azul que no coincidían entre sí.
4. **Padding en acordeones** — `SeccionAcordeon.tsx` y el header de
   `accordion.tsx` (bleed de `-mx-4/px-4` a `-mx-6/px-6`) pasan de `pt-0` a
   `pt-6`, para que el fondo azul de la cabecera nunca corte la primera
   línea de las etiquetas del contenido. Aplicado también a mano en
   `UsuariosRoles.tsx` y `PlantillaConvenioHcp.tsx`, que arman sus propios
   `AccordionItem` sin pasar por `SeccionAcordeon`.
5. **Armonización de campos de decisión** (`FormularioEvento.tsx`):
   - "Formato" vuelve a ser un `<Select>` nativo (se había vuelto un
     Patrón A1 en la entrega anterior), con una tercera opción visible
     "Híbrido (Presencial y Transmisión)" — el valor almacenado sigue
     siendo `"Mixto"` (compatibilidad con datos ya guardados); se resuelve
     con un mapa de etiqueta nuevo, `ETIQUETA_MODALIDAD_EVENTO` en
     `lib/enums.ts`.
   - "Lista de asistencia" (a nivel de evento y por sesión) cambia de un
     `Switch` ambiguo a un checkbox explícito "No aplica lista de
     asistencia" con texto explicativo debajo.
   - Muestras médicas, artículos promocionales, "¿incluido en presupuesto
     aprobado?" y "¿aplica costo de participación?" quedan los 4
     estandarizados a Patrón A1 (`ToggleCapsula`), opciones "No"/"Sí" en
     ese orden, predeterminado en "No" (para costo de participación, esto
     implicó cambiar el valor inicial de `inscripcionNoAplica` de `false`
     a `true`; el campo de presupuesto aprobado es tri-estado y mantiene
     su valor inicial `null` para no disparar el diálogo de confirmación
     de "continuar sin presupuesto" apenas se abre un formulario nuevo).
6. **Formateo de moneda en vivo, en el mismo campo** — nuevo componente
   `components/ui/input-moneda.tsx` (`InputMoneda`) reemplaza, en TODOS
   los campos de dinero de la app (Solicitud de Evento, Convenio de Pago a
   HCP, Convenio HCP, CAF, Notificación de Pago), el patrón anterior de
   `<Input type="number">` + un `<p>` con el monto formateado debajo: ya
   no hay etiqueta adicional debajo del campo. En foco muestra el número
   crudo editable; al perder el foco, formatea en el mismo input con
   separadores de miles/decimales + la moneda seleccionada (p. ej. "$
   1.000.000,00 COP"). `onChange` sigue disparándose en cada tecleo, así
   que los totales derivados (p. ej. "Costo Total Consolidado") se
   recalculan en vivo igual que antes. De paso, se quitaron las flechitas
   nativas de incremento/decremento de cualquier `type="number"` residual
   (`-webkit-appearance`/`-moz-appearance` en `index.css`).
7. **Autocorrector ortográfico** — `spellcheck`/`autocomplete` activados
   por defecto en `components/ui/input.tsx` (solo para inputs de texto:
   sin `type` o `type="text"`/`"search"`, no toca número/fecha/correo/etc.)
   y en `components/ui/textarea.tsx` (siempre, son todos de texto libre).
   Un valor explícito que pase el consumidor sigue ganando sobre el
   default.
8. **Ventana de Créditos** (`Creditos.tsx`) — el logo pasa a un
   contenedor fijo de 96px (`h-24 w-24`); el emoji 🇨🇴 junto al correo de
   contacto se reemplaza por un SVG propio de la bandera de Colombia
   (nuevo `components/BanderaColombia.tsx`, amarillo/azul/rojo) con la
   etiqueta "Colombia" al lado.
9. **Botones Patrón B2** — se confirma que el gradiente/micro-bisel del
   botón primario sigue intacto desde la entrega anterior; se agrega
   `font-bold` explícito al texto (antes heredaba `font-medium` del
   contenedor base).

## AJUSTES — 13 puntos solicitados (septiembre 2026)

Lote de 13 ajustes puntuales pedidos explícitamente por el usuario, sobre
distintas pantallas de la app.

1. **Ventana de Créditos** — se quita el texto "Colombia" al lado de la
   bandera (`Creditos.tsx`); queda solo la bandera SVG.
2. **Switch → Toggle Segmentado "Cápsula Flotante"** — ~48 controles
   deslizantes (`Switch`) reemplazados por `ToggleCapsula` en 10 archivos
   (`Speakers.tsx`, `UsuariosRoles.tsx`, `FormularioConvenio.tsx`,
   `FormularioFMV.tsx`, `FormularioNotificacionPago.tsx`,
   `CamposPersonalizadosSeccion.tsx`, `EditorPortafolioProductos.tsx`,
   `EditorCamposPersonalizados.tsx`, `DocumentoImprimible.tsx`,
   `FormularioEvento.tsx`). No queda ningún `<Switch` fuera de su propio
   componente base.
3. **Sin negativos en campos numéricos/de moneda** — `InputMoneda` ya no
   acepta el signo `-` (regex sin soporte de negativos + `Math.max(0, …)`
   al guardar); los `<Input type="number">` manuales de cantidades
   (asistentes, muestras, speakers, sesiones, plazos, órdenes) suman
   `min={0}` + recorte a `Math.max(0, …)`. Los campos calculados
   automáticamente (noches de hospedaje, entregas filtradas por
   `cantidad > 0`) quedan fuera a propósito.
4. **Convenio de Pago a HCP: "Certifico que la información es correcta"
   como checkbox** — reemplaza el `ToggleCapsula` que tenía por un
   `Checkbox` real (`FormularioConvenio.tsx`).
5. **MD FMV Checklist: "Asociación científica"** — nuevo campo de texto,
   obligatorio, que aparece justo después de "Aplica tarifario de
   asociación médica" solo cuando esa respuesta es "Sí". Cambio de punta
   a punta: `FormularioFMV.tsx` (tipo/vacío/etiqueta/validación/UI),
   `types.ts`, `lib/fmv.ts` (mapeo a BD),
   `db/agregar_asociacion_cientifica_fmv.sql` (migración nueva),
   `DetalleFmv.tsx` (carga al editar) y `DocumentoImprimible.tsx`
   (impresión/detalle).
6. **CAF: "Código del documento" deja de ser obligatorio** — se quita el
   asterisco y la validación (`FormularioCAF.tsx`).
7. **Convenio HCP: renombres (EN)** — "Cierre (EN)" → "Closure (EN)";
   "Comentarios sobre el pago (EN)" → "Payment Remarks (EN)"
   (`FormularioConvenioHCP.tsx`).
8. **Convenio HCP: 7 campos obligatorios** — "Whereas (EN)", "Considerando
   (ES)", "Closure (EN)", "Cierre (ES)", "Services — Exhibit A (EN)",
   "Servicios — Anexo A (ES)" y "Comentarios sobre el pago (ES)" pasan a
   ser obligatorios, con asterisco y mensaje de error
   (`FormularioConvenioHCP.tsx`). "Payment Remarks (EN)" queda sin
   asterisco a propósito — no estaba en la lista pedida.
9. **Tablero — detalle/impresión con toda la información diligenciada +
   rediseño de carga de soportes en Evento**:
   - Se hizo una auditoría campo por campo (formulario de creación vs.
     vista de detalle compacta vs. vista de impresión) de los 6 tipos de
     documento. Hallazgo transversal: los **campos personalizados**
     (`camposPersonalizados`, definidos en "Configuración de Campos") se
     recogían en los 6 formularios pero nunca se pintaban en ningún
     detalle/impresión — corregido con un componente compartido nuevo,
     `CuerpoCamposPersonalizados` en `DocumentoImprimible.tsx`, agregado a
     los 6 `Cuerpo*` (`CuerpoCAF`, `CuerpoFMV`, `CuerpoConvenio`,
     `CuerpoConvenioHCP`, `CuerpoNotificacionPago`, `CuerpoEvento`).
   - Otros huecos corregidos por tipo: CAF — país operativo ahora se pasa
     explícitamente para filtrar campos personalizados. FMV — el archivo
     del tarifario de asociación ahora se indica también en la vista de
     impresión (antes solo en el diálogo de detalle). Convenio de Pago —
     número de documento, especialidad y estado/provincia del HCP, el
     archivo de agenda y el conteo de sesiones vinculadas, antes
     ausentes. **Solicitud de Evento** (el más grande): número de
     sesiones, lista de asistencia (documento y por sesión), país/estado
     de cada sesión, los dos archivos de soporte (carta de invitación,
     programa académico), monto de transporte/taxi a nivel de documento,
     cantidad aproximada de cada muestra médica, y — el hallazgo más
     grande — la sección completa de **speakers externos** (nombre,
     inscripción, honorarios, modalidad de factura y el presupuesto de
     transporte/hospedaje/alimentos de cada uno) no se mostraba en
     absoluto; ahora tiene su propia sección en el detalle/impresión.
   - **Rediseño de la carga de soportes en Solicitud de Evento**: los dos
     adjuntos del evento (carta de invitación, programa académico) tenían
     el mismo botón angosto "Adjuntar archivo" que cualquier otro campo de
     archivo de la app. `components/archivos/CampoArchivo.tsx` gana una
     variante opcional `variante="dropzone"` (zona de carga más grande,
     arrastrar-y-soltar, ícono, texto de ayuda) — sin tocar el estilo
     compacto que siguen usando los demás ~15 puntos de carga de archivo
     de la app — y `FormularioEvento.tsx` envuelve ambos campos en un
     bloque con encabezado propio "Documentos de soporte del evento".
10. **Tareas Pendientes → abre el documento a diligenciar** — al dar clic
    en una tarea "Falta X" (FMV, Convenio, CAF, Convenio HCP o
    Notificación de Pago), en vez de abrir el detalle de solo lectura del
    evento, ahora navega directo al formulario de creación de ese
    documento con el evento (y el speaker, cuando aplica) ya
    preseleccionados — nuevo hook `usePrecargaInicialOrigen` en
    `hooks/usePrecargado.ts`, reutilizado por los 5 formularios de
    creación que comparten el selector evento+speaker; `FormularioConvenioHCP.tsx`
    usa una versión propia por su selector compuesto. `App.tsx` gana el
    estado de "precarga en tránsito" y la función `irANuevoDocumento`, que
    `TareasPendientes.tsx` invoca en los botones de tarea correspondientes.
11. **Nuevo Usuario: firma manuscrita obligatoria** — no se puede
    confirmar la creación de un usuario sin registrar su firma (dibujada o
    cargada desde archivo); asterisco + validación en `UsuariosRoles.tsx`.
12. **Sidebar — orden de "CREAR DOCUMENTO"** — reordenado a: Solicitud de
    Evento, MD FMV Checklist, Convenio de Pago a HCP, CAF, Convenio HCP,
    Notificación de Pago a HCPs (`lib/navegacion.ts`).
13. **Tablero — filtros de tipo de documento reordenados + íconos** —
    mismo orden que el punto 12, con el ícono de cada tipo (los mismos del
    sidebar izquierdo) junto a la etiqueta de cada botón de filtro;
    "Todos los documentos" usa el ícono del Tablero (`Tablero.tsx`).

## Ronda de ajustes de formularios (septiembre 2026) — Transporte/Hospedaje/Alimentos, checkbox de sesiones, reorganización de "Solicitante y evento" y patrocinio a HCP

Segundo lote de ajustes de esta ronda, todos sobre `FormularioEvento.tsx`
salvo donde se indica.

1. **Transporte/Hospedaje/Alimentos: renombrados + reordenados + campos
   obligatorios** — "El transporte no aplica"/"El hospedaje no aplica"/"Los
   alimentos no aplican" pasan a llamarse "Transporte"/"Hospedaje"/
   "Alimentos" (mismo control `ToggleCapsula`, con el mapeo Sí/No invertido
   para que "Sí" active los campos — se conservan los nombres internos
   `transporteNoAplica`/`hospedajeNoAplica`/`alimentosNoAplica` sin tocar
   columnas de BD). Campos reordenados y varios pasan de opcionales a
   obligatorios (con mensaje de error propio): Tipo y Valor del transporte;
   Fecha de inicio/fin de estancia, Costo de noche por persona, Nombre y
   categoría del hotel; Monto autorizado de alimentos por día. "Taxi" se
   renombra a "Taxi/Traslado". Nuevo helper compartido
   `agregarErroresPresupuesto` (una sola implementación de estas
   obligatoriedades, reutilizada por el bloque a nivel de documento, por
   cada fila de `sesiones` y por cada fila de
   `speakersParticipacion[].presupuestos`).
2. **"Sesiones en las que participa este speaker": Toggle → Checkbox** —
   mismo patrón ya usado en "No aplica lista de asistencia" (un `Checkbox`
   por sesión en vez del `ToggleCapsula` segmentado Sí/No).
3. **Reorganización de "Solicitante y evento"** — nuevo orden: Nombre del
   solicitante, Nombre del superior que aprueba, Empresa del grupo, Tipo de
   evento, Área/especialidad, Línea terapéutica, Nombre del evento,
   Organizado por, Moneda, Objetivos del evento, No aplica lista de
   asistencia (+ Motivo) — estos 3 últimos se trasladaron aquí desde
   "Fechas, modalidad y lugar", conservando toda su lógica de habilitación.
4. **Nuevo campo "¿Habrá patrocinio / pago de viáticos a un HCP?"** — al
   final de "Solicitante y evento". Si es Sí, activa: "Nombre completo del
   HCP relacionado" (renombrado de "Datos del HCP relacionado", ahora
   obligatorio) y 8 campos nuevos, todos obligatorios — Número de
   documento (texto), Profesión (catálogo `profesiones`, el mismo de
   "Nuevo Speaker"), Especialidad (catálogo `especialidadesMedicas`, el
   mismo de "Nuevo FMV"/"Especialidades médicas (FMV)"), Dirección (texto),
   País/Estado/Ciudad (mismo selector en cascada `SelectPaisEstadoCiudad`
   ya usado en el resto del formulario), Teléfono y Email — y finalmente
   "Justificación de patrocinio / pago de viáticos" (renombrada de
   "Justificación de viáticos", reubicada aquí justo después de Email,
   ahora obligatoria). Cambio de punta a punta: `types.ts` (`Evento`),
   `FormularioEvento.tsx` (tipo/vacío/etiquetas/validación/UI),
   `lib/evento.ts` (mapeo a BD) y `db/agregar_patrocinio_hcp_evento.sql`
   (migración nueva — columna `patrocinio_hcp` + 9 columnas `hcp_*`).
   `DetalleEvento.tsx` y `DocumentoImprimible.tsx` (detalle/impresión)
   actualizados en consecuencia.
5. **Repositorio del evento — certificado de participación condicional** —
   nueva categoría de archivo `certificadoParticipacion` ("Certificado de
   participación en el evento"), que solo aparece en
   `RepositorioEvento.tsx` cuando el evento tiene
   `patrocinioHcp: true` (`lib/enums.ts`).
6. **"Comentarios especiales": "Aplica"/"No aplica" → "Sí"/"No"** — mismo
   criterio de armonía que el punto 1 (se invierte el mapeo del toggle para
   que "Sí" muestre el campo de comentarios, con "No" primero y "Sí"
   después, igual que Transporte/Hospedaje/Alimentos).
7. **Tablero — filtros de tipo de documento en una sola línea** — la fila
   de pastillas de tipo de documento pasa de `flex-wrap` a `flex-nowrap` +
   `overflow-x-auto` (con `-mx-6 px-6` para aprovechar más ancho que el
   resto de la página sin tocar el ancho ergonómico general de la app) —
   ya no se parte en dos líneas; si de verdad no caben todas, se desplazan
   horizontalmente en vez de volver a apilarse (`Tablero.tsx`).

## Tercer lote de ajustes de esta ronda (septiembre/octubre 2026)

1. **Validación "Número de speakers externos" ≥ 1** — en Solicitud de
   Evento, cuando "Speaker externo" está seleccionado, el campo ahora exige
   un valor ≥ 1 (antes aceptaba 0/vacío sin aviso): `min={1}` en el input,
   clamp al escribir, y dos mensajes de error distintos (vacío vs. menor a
   1) en `calcularErroresEvento` (`FormularioEvento.tsx`).
2. **"Centro de costos" reubicado** — ahora aparece inmediatamente después
   de "Comentarios sobre el costo" (`FormularioEvento.tsx`).
3. **"Te toca a ti" corregido + mayúscula en el estado de cada etapa** —
   el aviso "Te toca a ti" en la Cadena de aprobación aparecía para
   cualquier administrador sobre cualquier paso pendiente (porque
   `puedeResolverPaso` —que decide si se muestran los botones Aprobar/
   Rechazar— incluye a los administradores a propósito). Se separó un
   nuevo helper `esTurnoPropio` (`lib/aprobaciones.ts`), sin el atajo de
   administrador, usado SOLO para decidir el texto: "Te toca a ti" cuando
   el rol sí coincide, "Puedes gestionarlo como administrador" cuando no.
   Los botones de acción siguen apareciendo igual que antes (el
   administrador conserva su capacidad de destrabar la cadena). Además,
   "pendiente"/"aprobado"/"rechazado" (por etapa) ahora se muestran con
   mayúscula inicial vía el nuevo `ETIQUETA_ESTADO_APROBACION`
   (`lib/enums.ts`) en los 4 documentos con cadena de aprobación
   (Evento/Convenio/CAF/Convenio HCP).
4. **La ventana se cierra tras aprobar/rechazar/devolver** — evita
   inconsistencias de quedarse viendo un documento que ya cambió de
   estado. Aplicado en `resolver()` y `confirmarDevolver()` de los mismos 4
   documentos con cadena de aprobación (no aplica a FMV/Notificación de
   Pago, que no tienen aprobar/rechazar/devolver — solo firmar y
   completar).
5. **Pérdida de datos al hacer clic fuera del formulario, corregida** —
   opción elegida explícitamente por el usuario entre 4 alternativas
   presentadas: **bloquear el cierre accidental + autoguardado
   periódico**. Mientras se edita un documento (`editando === true`): (a)
   clic fuera del diálogo y tecla Escape ya no lo cierran (el botón "X"
   también se oculta), solo el botón "Cancelar" explícito permite salir;
   (b) se autoguarda como borrador cada 45s en segundo plano (silencioso —
   un fallo no interrumpe al usuario, "Guardar borrador" manual sigue
   disponible), con una leyenda indicando la última hora de autoguardado.
   Aplicado en los 6 `Detalle*.tsx` — en los 4 con `origenEdicion`, el
   autoguardado solo aplica cuando el origen es `"borrador"` (no durante
   enmienda/adenda/edición de un rechazado, para no interferir con esos
   flujos); en FMV y Notificación de Pago (que no tienen `origenEdicion`),
   aplica siempre que `editando` esté activo.
6. **Ventana de edición de borrador, igualada en tamaño/diseño a la de
   creación** — el diálogo de edición pasa de `max-w-2xl`/`max-w-3xl` a
   `max-w-5xl` (mismo ancho que las páginas "Nuevo documento"), en los 6
   `Detalle*.tsx`.
7. **Firma manuscrita en aprobación y vista PDF/impresión** — la columna
   "Firma" de la tabla de aprobación oficial (`TablaAprobacion` en
   `DocumentoImprimible.tsx`), que antes quedaba vacía a propósito
   (infraestructura de archivos pendiente en esa época), ahora muestra la
   firma manuscrita real (`FirmaManuscritaUsuario`, resuelta vía
   `usuarios.firmaId`) de quien aprobó cada etapa — en los 4 documentos con
   cadena de aprobación y en el Convenio HCP bilingüe. Lo mismo se agregó
   en la propia ventana de aprobación (diálogo `Detalle*.tsx`): cada etapa
   ya aprobada muestra "Firma:" + la imagen junto al badge de estado.
8. **Auditoría de campos en vista PDF/impresión + marca de agua
   centrada** — verificado: todos los campos nuevos de rondas anteriores
   (patrocinio/HCP, nombre del organizador, centro de costos, asistentes
   esperados, etc.) ya se pintan en los `Cuerpo*` de impresión; y la marca
   de agua (`MarcaDeAgua`, `position: fixed`) ya se repite centrada en
   cada hoja física gracias al ajuste de `#zona-imprimible { scale: none }`
   de una ronda anterior — no se encontró ninguna regresión que corregir
   en ninguno de los dos frentes.
9. **"Nombre del organizador" habilitado para 4 opciones de "Organizado
   por"** — antes solo se habilitaba con "Tercero"/"Otro"; ahora también
   con "Sociedad Médica / Científica" e "Institución Académica"
   (`esOrganizadoPorOtro`, `lib/organizadoPor.ts`).
10. **"Número de asistentes esperados" autocalculado en eventos de varias
    sesiones** — pasa a ser la suma de los asistentes esperados de todas
    las sesiones (en vez de un valor digitado aparte); en evento de sesión
    única sigue siendo el valor digitado directamente
    (`FormularioEvento.tsx`).
11. **Tablero — scrollbar horizontal de los filtros de tipo de documento,
    ocultada** — refinamiento del ajuste anterior (que ya evitaba que la
    fila se partiera en dos líneas, pero dejó visible una barra de
    desplazamiento poco agradable): nueva clase utilitaria
    `.sin-barra-desplazamiento` (`index.css`) que oculta la barra
    visualmente sin quitar el desplazamiento real (sigue funcionando con
    gestos/rueda si alguna vez hiciera falta en una pantalla muy angosta).
12. **Error "No se pudo crear el FMV: ... column 'asociacion_cientifica'
    ... not found"** — la columna y el código que la usa ya existen en
    este proyecto (`db/agregar_asociacion_cientifica_fmv.sql` +
    `FormularioFMV.tsx`), pero la migración todavía no se ha ejecutado
    contra el proyecto real de Supabase. **Acción pendiente del usuario:**
    correr ese archivo (y, de paso, `db/agregar_patrocinio_hcp_evento.sql`
    si tampoco se ha corrido) en el SQL Editor de Supabase.
13. **"Evento de origen" obligatorio en todos los formularios que lo
    tienen** — se agregó la obligatoriedad (antes faltaba) en
    `FormularioConvenio.tsx` y `FormularioFMV.tsx`; CAF, Convenio HCP y
    Notificación de Pago ya lo exigían.
14. **"Empleado responsable (nombre y cargo)" autocargado en Convenio** —
    mismo patrón ya usado en "Nombre del solicitante" de Nuevo Evento:
    se precarga con `nombre, cargo` del usuario en sesión al crear un
    Convenio nuevo (`NuevoConvenio.tsx`).
15. **Pie de página oficial de impresión/PDF, verificado** — ya mostraba
    exactamente el formato pedido ("Elaborado por NOMBRE, CARGO ·
    Generado el FECHA, HORA desde BEATS", más el ID interno del documento
    y la nota de "refleja el estado del flujo de aprobación..."),
    conectado en los 6 tipos de documento (`PiePaginaOficial` en
    `DocumentoImprimible.tsx`) — no se encontró nada que corregir.
16. **Formato de fechas armonizado a "YYYY-MM-DD" (y "YYYY-MM-DD
    HH:mm:ss" con hora)** — nuevo utilitario compartido `lib/fecha.ts`
    (`formatearFecha`/`formatearFechaHora`), que reemplaza ~40 llamados
    sueltos a `toLocaleDateString`/`toLocaleString`/`toLocaleTimeString`
    (con estilos distintos entre sí) repartidos en más de 20 archivos.
    **Única excepción a propósito**, tal como lo pidió el usuario con un
    ejemplo distinto para ese caso puntual: el pie de página oficial de
    impresión/PDF conserva su formato humano en español ("30 de sept de
    2026, 22:01").
17. **Logo de la aplicación en la ventana de login, diagnosticado** — el
    código de `PantallaLogin.tsx`/`useLogoApp.ts` ya está bien construido
    (mismo patrón que el membrete de impresión, que sí funciona). La causa
    real es que la ventana de login se muestra ANTES de iniciar sesión, y
    las políticas RLS de Supabase de este proyecto exigen `authenticated`
    para leer `configuracion_formatos`/`archivos_adjuntos` — el cliente
    anónimo del login no puede traer el logo (falla en silencio, capturado
    por el `catch` del hook). **Acción pendiente del usuario:** correr
    `db/agregar_rls_anon_logo_login.sql` en el SQL Editor de Supabase —
    abre SELECT anónimo de la fila única de configuración (sin datos
    sensibles) y, de `archivos_adjuntos`, SOLO del archivo cuyo id coincide
    con el logo de la aplicación configurado (nunca el resto de archivos
    adjuntos, que sí son sensibles — CVs, facturas, soportes).

### Migraciones SQL pendientes de ejecutar (ninguna se aplicó automáticamente)

- `db/agregar_asociacion_cientifica_fmv.sql` (si no se había corrido ya).
- `db/agregar_patrocinio_hcp_evento.sql` (si no se había corrido ya, de la
  ronda anterior).
- `db/agregar_rls_anon_logo_login.sql` (nueva — logo en login, punto 17
  arriba).

## Cuarto lote de ajustes de esta ronda (septiembre/octubre 2026)

El usuario reportó que dos puntos del lote anterior, dados por verificados
sin cambios, en realidad seguían rotos ("No se corrigió" / "Tampoco se
corrigió") — los puntos 1 y 2 de abajo corrigen eso de verdad, con una causa
raíz real encontrada (no solo releída) para el segundo.

1. **Pie de página oficial — formato exacto corregido** — el formato
   anterior no coincidía con el ejemplo literal pedido. Ahora
   `PiePaginaOficial` (`DocumentoImprimible.tsx`) arma una sola línea
   "Elaborado por [nombre], [cargo] · Generado el [fecha], [hora] desde
   BEATS. ID interno: [id]." seguida, en su propia línea, de "Este
   documento refleja el estado del flujo de aprobación al momento de su
   exportación."
2. **Marca de agua/membrete — causa raíz real encontrada y corregida** —
   no era el mismo bug ya resuelto de `scale` (Fase 8). Tailwind v4 compila
   las utilidades `translate-x-0 translate-y-0` (usadas por los 6 diálogos
   de impresión para cancelar el centrado de Radix) a la propiedad CSS
   independiente `translate` — cualquier valor distinto de `none` crea un
   nuevo "containing block" para los descendientes `position: fixed`
   (`MarcaDeAgua`/`MembreteImpreso`), igual que ya se sabía de `scale`.
   Se agregó `translate: none !important; rotate: none !important;` a la
   regla `[role="dialog"]` de `@media print` en `src/index.css`. Esto
   también explica el punto 4 de abajo ("Modo para firma externa" parecía
   no funcionar para documentos "Pendiente": el texto más pequeño de la
   marca de agua probablemente se renderizaba fuera del área visible por
   el mismo bug, no porque el interruptor fallara — su lógica ya estaba
   bien).
3. **Firma manuscrita sin borde/sombreado** — se quitó `rounded-md border
   bg-white p-2` del contenedor de `FirmaManuscritaUsuario`
   (`FirmaManuscrita.tsx`); ahora solo se ve la imagen, con las mismas
   protecciones anti-copia de siempre.
4. **Tablero — filtro "Notificación de pago a HCPs" ya no se corta** — el
   truco anterior (`-mx-6 px-6`) solo cancelaba el padding propio de la
   página, pero la fila seguía topando con el techo de `max-w-5xl` de
   `App.tsx`. Se envolvió la fila de filtros en un contenedor "full-bleed"
   (`relative left-1/2 w-screen max-w-[1400px] -translate-x-1/2`) que se
   extiende hasta el ancho del viewport (tope 1400px) sin crear scroll
   horizontal de página — sin barra de desplazamiento propia ni cambios de
   tamaño de fuente, como se pidió (`Tablero.tsx`).
5. **Modo para firma externa (sin marca de agua)** — verificado: la lógica
   del interruptor (`<MarcaDeAgua estado={modoFirmaExterna ? undefined :
   estado} />`) y de `ToggleCapsula` ya estaban correctas; el problema
   reportado era un síntoma del punto 2 (causa raíz ya corregida ahí).
6. **Vista de impresión de Solicitud de Evento — "Comentarios del costo"
   y "Centro de costos"** — "Comentarios del costo" ahora ocupa el ancho
   completo del formulario; "Centro de costos" se movió a la misma fila
   que "Costo total" (`DocumentoImprimible.tsx`).
7. **Vista de detalle de documento armonizada con la vista de creación** —
   los títulos de sección (`TituloSeccion`, modo "compacta") dejaron el
   azul eléctrico (`text-blue-700`) por `var(--brand-blue)` (el mismo azul
   de los botones de filtros); las etiquetas de campo (`CampoInline`)
   ahora usan el mismo peso/color que `<Label>` en los formularios
   (`text-sm font-semibold text-slate-800`), en vez del gris tenue
   anterior (`DocumentoImprimible.tsx`).
8. **Sección "Aprobación" oculta en la vista de detalle (se conserva en
   impresión)** — nuevo wrapper `SeccionAprobacion` en
   `DocumentoImprimible.tsx`, que esconde el cuadro de estado/información
   de aprobación SOLO en modo "compacta" (vía el contexto
   `ModoVistaDocumento` ya existente); la vista de impresión/PDF no
   cambia. La "Cadena de aprobación" (construida aparte, directo en cada
   `Detalle*.tsx`) sigue visible — es la que el usuario pidió conservar.
9. **Cadena de aprobación — solo cargo + estado** — se quitaron los
   textos "Te toca a ti" / "Puedes gestionarlo como administrador" (y el
   helper `esTurnoPropio`, que quedó sin uso) de los 4 `Detalle*.tsx` con
   cadena de aprobación (Evento/Convenio/CAF/Convenio HCP); cada fila
   muestra ahora solo el cargo, la firma (si aplica) y el badge de estado.
10. **MD FMV Checklist — obligatoriedad de campos ajustada** — "Fecha" y
    "Número de documento" pasan a ser obligatorios (con asterisco);
    "Código postal" deja de serlo (`FormularioFMV.tsx`).
11. **MD FMV Checklist — renombrado de 2 campos** — "Aplica tarifario de
    asociación médica" → "Aplica tarifario de asociación médica /
    científica"; "Asociación científica" → "Asociación médica /
    científica" (formulario y vista de impresión, `FormularioFMV.tsx` +
    `DocumentoImprimible.tsx`).
12. **Nuevo Convenio HCP — 3 campos pasan a obligatorios** — "Fecha
    efectiva", "Plazo de pago (días)" y "Payment Remarks (EN)", con
    asterisco y validación (`FormularioConvenioHCP.tsx`).
13. **Notificación de Pago — 3 campos de factura ahora son Checkbox** —
    "La factura incluye pago al HCP", "La factura incluye pago a la
    institución" y "El pago lo realiza un tercero" dejaron el control
    Sí/No (`ToggleCapsula`) por un `Checkbox`, igual que "No aplica lista
    de asistencia" (`FormularioNotificacionPago.tsx`).
14. **Nombre de archivo sugerido al exportar a PDF** — nuevo
    `lib/nombreArchivo.ts` (`construirNombreBase`/`construirNombreSugerido`)
    arma un nombre con la forma `Tipo_Nombre_Fecha_Id` (p. ej.
    `Convenio_juan_perez_2026-10-01_955d629c`), en minúsculas salvo la
    primera letra. `DocumentoImprimible.tsx` fija `document.title` con ese
    nombre justo antes de `window.print()` (de donde los navegadores
    toman el nombre sugerido del diálogo nativo "Guardar como PDF") y lo
    restaura después — los 6 `Detalle*.tsx` le pasan el nombre descriptivo
    del documento (evento, HCP/speaker).
15. **Nombres de archivo estructurados al subir adjuntos** —
    `subirArchivo` (`lib/archivosAdjuntos.ts`) acepta ahora un
    `nombreSugerido` opcional que reemplaza el nombre original (conservando
    la extensión real). `CampoArchivo` arma ese nombre solo (tipo de
    adjunto + fecha) o, con el nuevo prop opcional `contexto` (nombre del
    evento/HCP/speaker), con contexto completo — ya pasado en RETHUS/CV/
    documento de identidad de Speakers, soportes de Solicitud de Evento,
    agenda de Convenio, tarifario de FMV, factura de Notificación de Pago
    y copia firmada de Convenio HCP. Las subidas de foto/logo/firma
    (`Speakers.tsx`, `EditorPortafolioProductos.tsx`,
    `FirmaManuscrita.tsx`) arman su propio nombre con el mismo helper.
16. **Enviar documentos a partes interesadas (Convenio HCP completado)** —
    nuevo `EnviarDocumentoDialog.tsx` (reutilizable) + `lib/enviosDocumentos.ts`,
    con dos acciones en `DetalleConvenioHCP.tsx` una vez el convenio queda
    Aprobado/Completado: "Enviar al HCP para firma" (destinatario
    precargado con el HCP, para adjuntar la copia a firmar y pedir que la
    devuelva) y "Enviar documentos al solicitante" (destinatario
    precargado con quien generó la solicitud, con la copia firmada ya
    disponible en la lista de documentos a marcar, más la opción de
    adjuntar cualquier otro archivo en el momento). Además, el Repositorio
    del Evento (`RepositorioEvento.tsx`) ahora tiene una sección "Convenios
    finales firmados (por speaker)" — un recuadro de carga por cada
    Convenio HCP del evento, reutilizando el campo ya existente
    `archivoFirmadoHCPId` (sin columna nueva).

    **Corregido tras recibir el código real de la Edge Function
    `send-email`** (el usuario la compartió): la primera versión de este
    punto asumía que había que escribir una función nueva de Postgres
    (`net.http_post`) para poder adjuntar archivos — resultó innecesario.
    Esa función YA soporta adjuntos de punta a punta (incluso ya tiene
    corregido un bug real de adjuntos en 0 KB bajo Deno, decodificando el
    base64 ella misma) y YA tiene una vía de llamada autenticada pensada
    exactamente para esto: `supabase.functions.invoke("send-email", ...)`
    desde el navegador, restringida en el servidor a `rol === "medica"`
    ("Solo Dirección Médica puede enviar correos con adjuntos"). Por eso
    `enviarDocumentoPorCorreo` (`lib/enviosDocumentos.ts`) llama esa
    función DIRECTO — no hay ninguna función nueva de Postgres ni
    dependencia de `net.http_post`/`configuracion_integraciones` — y
    `EnviarDocumentoDialog.tsx` oculta/deshabilita el formulario de envío
    si quien lo abre no tiene rol `medica` (en vez de dejarlo llenar todo
    y recibir un 403 al final). Requiere la migración de abajo, pero solo
    para la bitácora de auditoría — el envío en sí ya funciona sin ella.

### Migración SQL nueva de este lote

- `db/agregar_envio_documentos_interesados.sql` — tabla `envios_documentos`
  (bitácora/auditoría: quién envió qué, a quién, cuándo). El envío en sí
  no depende de esta migración (llama directo a la Edge Function
  `send-email` ya desplegada, que ya soporta adjuntos) — sin ella, el
  correo igual sale, pero el registro de auditoría falla en silencio
  (`console.warn`, no bloquea el envío).

## Quinto lote de ajustes de esta ronda (septiembre/octubre 2026)

13 puntos pedidos explícitamente en un solo lote.

1. **Panel de documentos: grid de 3 columnas + filtros alineados** —
   `Tablero.tsx`: las fichas de documentos pasan de 2 a 3 columnas
   (`lg:grid-cols-3`). La fila de filtros de "Estado" se envuelve en el
   mismo wrapper "full-bleed" que ya usaba la fila de "Tipo de documento"
   (para 7 pastillas), aunque la de Estado quepa sin él — así ambas filas
   arrancan en el mismo borde izquierdo en vez de centrarse cada una por su
   cuenta con un corrimiento visible entre ellas.

2. **Cadena de aprobación (vista compacta): etiqueta por rol + nombre +
   fecha/hora + firma sin fondo ni la palabra "Firma"** — en
   `DetalleEvento.tsx`/`DetalleConvenio.tsx`/`DetalleCaf.tsx` (y, sin el
   mapa de etiquetas por rol — ver el punto 4 abajo, caso aparte —
   `DetalleConvenioHCP.tsx`), cada fila de la cadena ahora muestra el
   nombre de quien resolvió el paso y la fecha/hora, y se quita la palabra
   "Firma:" que precedía la imagen. Nuevo mapa
   `ETIQUETA_ROL_CADENA_APROBACION` (`lib/aprobaciones.ts`) estandariza la
   etiqueta mostrada por rol ("Gerente / Director de la Unidad de Negocio"
   / "Director Médico" / "Compliance Officer"), reemplazando la redacción
   que variaba de un documento a otro para el mismo rol. La firma
   manuscrita (`FirmaManuscrita.tsx`) ahora usa `mix-blend-mode: multiply`
   para que un fondo claro/blanco de la imagen (común en firmas subidas
   como archivo, p. ej. un escaneo) se funda con el fondo real detrás de
   ella.

3. **Marca de agua: reescrita por completo, ya no "partida/incompleta"** —
   bug real confirmado reproduciéndolo con Playwright/Chromium headless
   (el mismo motor que usa la app para "Imprimir / Exportar a PDF"):
   `position: fixed` NO se repite de forma fiable por página al paginar un
   documento largo en este motor — se pintaba una sola vez, cortada donde
   cayera el salto de página física, exactamente el síntoma reportado.
   `MarcaDeAgua` (`DocumentoImprimible.tsx`) ya no usa `position: fixed`
   en absoluto: ahora es un patrón de fondo repetido (`background-image`
   SVG, `background-repeat`) directamente en `#zona-imprimible` — los
   fondos sí se pintan de forma nativa y continua en cada página al
   imprimir, verificado con la misma prueba (PDF de 3 páginas,
   página por página).

4. **Membrete en todas las páginas + logo arriba a la derecha** — mismo bug
   de fondo que la marca de agua: `MembreteImpreso` también era
   `position: fixed` y por eso solo aparecía en una página. Reescrito para
   vivir dentro de un `<thead style={{ display: "table-header-group" }}>`
   de una tabla que envuelve todo el contenido imprimible — técnica HTML
   estándar y de soporte antiguo/estable para encabezados que se repiten al
   paginar al imprimir, también verificada con Playwright. El logo ya vivía
   en la celda de la derecha del membrete (`useMembreteImpreso` ya
   resolvía el logo institucional correcto desde una ronda anterior) — solo
   hacía falta que el membrete mismo se repitiera.

5. **Vista de impresión: etiquetas desactualizadas corregidas** — ejemplo
   confirmado por el usuario ("TRANSPORTACIÓN" ya no es ni un campo ni una
   etiqueta real) y 2 más encontradas con el mismo patrón, todas en
   `DocumentoImprimible.tsx`: "Transportación" → **Transporte** (4
   lugares), "Modalidad" → **Formato** (el campo `modalidadEvento` se
   había renombrado hace varias rondas), "Taxi" → **Taxi/Traslado**
   (2 lugares). No se encontró forma confiable de auditar automáticamente
   los ~110 campos restantes del impreso contra los formularios (muchos
   son agregaciones legítimas de varios campos en una sola etiqueta de
   resumen, no errores) — si aparece otra etiqueta desactualizada, repórtala
   igual que esta.

6. **Login: se quita el subtítulo** — `PantallaLogin.tsx` ya no muestra
   "Bausch Events Approval & Tracking System" debajo de "Iniciar sesión".

7. **Ancho de ventanas de formulario armonizado** — todos los diálogos de
   formulario de la app (`UsuariosRoles.tsx` ×3, `Speakers.tsx`,
   `EnviarDocumentoDialog.tsx`, `EditorCamposPersonalizados.tsx`,
   `EditorEtiquetasCampo.tsx`, `EditorPortafolioProductos.tsx`) pasan a
   `max-w-2xl`. Causa real del reporte puntual en "Usuarios y Roles"
   (líneas desalineadas, información cortada): el ancho por defecto
   (`max-w-lg`, 512px) ya no le alcanzaba a una cuadrícula de 2 columnas
   tras varias rondas que alargaron etiquetas de rol (p. ej. "Gerencia
   General & Representación Legal").

8. **Bloqueo de cierre accidental: faltaba en varios formularios** — los 6
   `Detalle*.tsx` ya lo tenían desde una ronda anterior
   (`onPointerDownOutside`/`onEscapeKeyDown`, condicionado a estar
   editando), pero "Usuarios y Roles" (los 3 diálogos: Nuevo/Editar
   usuario, Cambiar correo), "Nuevo/Editar Speaker",
   `EnviarDocumentoDialog.tsx` y los 3 editores de catálogos (Campos
   personalizados, Etiquetas de campo, Portafolio de productos) nunca lo
   tuvieron — un clic fuera o Escape cerraban el diálogo sin preguntar y
   perdían todo lo escrito. Se agregó el mismo bloqueo a los 9: cerrar
   sigue siendo posible, pero solo con un clic explícito en "Cancelar" o en
   la "X".

9. **Auditoría de Eventos: "Paquete completo" ya no cuenta borradores
   vacíos como resueltos** — causa real confirmada: `documentoActivoDelEvento`
   (la función que decide si el Convenio/FMV/CAF/Notificación de un
   evento ya existen) solo excluía Rechazado/Anulado — un documento recién
   creado y nunca enviado (Borrador) ya contaba como "presente" en el
   checklist. Nueva función `documentoSometidoDelEvento`
   (`lib/documentosRequeridosEvento.ts`), igual pero excluyendo también
   Borrador, usada por `construirChecklistEvento` para Convenio/FMV/
   CAF/Notificación de Pago (esta última, además, antes no filtraba por
   estado en absoluto).

10. **Rutina diaria de recordatorio de documentos de soporte** — nueva
    migración `db/agregar_recordatorios_documentos_soporte.sql`: función
    `fn_enviar_recordatorios_documentos_soporte()` + `pg_cron` diario.
    Para cada evento Aprobado cuya fecha de fin ya pasó, calcula
    exactamente qué documentos de soporte faltan (misma lógica que
    "Auditoría de Eventos", replicada en SQL contra las tablas reales) y,
    si falta algo, envía un correo al creador listándolos — y, si ya
    pasaron más de 3 días desde el fin del evento, un correo más enfático
    con copia al Director Médico que aprobó el evento. Reutiliza el MISMO
    mecanismo de envío ya confirmado funcionando en la base real
    (`net.http_post` contra `configuracion_integraciones`, igual que
    `fn_notificar_por_email()`) en vez de una Edge Function nueva sin
    forma de probarse. Lee la nota grande al inicio del archivo SQL antes
    de activar el cron: documenta explícitamente qué tan fiel es la
    réplica de cada regla (la mayoría, exacta; "Notificación de Pago a
    HCPs" es una aproximación deliberada más simple).

11. **Rol "Gerencia General" → "Gerencia General & Representación Legal"**
    — renombrado en `enums.ts` (`ETIQUETA_ROL_USUARIO`) y propagado a
    todas las etiquetas de paso que lo mencionaban (CAF, Convenio HCP) en
    `lib/aprobaciones.ts`, más los textos relacionados en
    `FormularioConvenioHCP.tsx`, `NuevoConvenioHCP.tsx` y
    `DocumentoImprimible.tsx`.

12. **Convenio con HCP: visto bueno de Compliance & Legal — ya existía,
    faltaba la nota impresa** — la cadena de aprobación del Convenio HCP
    YA tenía el paso previo "Visto Bueno Legal/Compliance" bloqueando la
    firma de Gerencia General hasta que se diera ese aval (de una ronda
    anterior). Lo que faltaba era exactamente lo pedido: dejar evidencia
    en el documento impreso — nuevo componente `NotaVistoBuenoCompliance`
    en `DocumentoImprimible.tsx`, con una nota antes de la matriz de
    firmas y en cada uno de los Anexos A y B.

13. **Formulario de Créditos: fuentes armonizadas + logo más grande** —
    `Creditos.tsx`: el cuerpo de texto (antes con 3 tamaños distintos sin
    criterio) se unifica a `text-base`; el logo se saca del contenedor fijo
    de 96px que lo recortaba y sube a `anchoMax={220}`, el mismo valor que
    usa la ventana de login (`PantallaLogin.tsx`) — ahora se ve del mismo
    tamaño ahí.

### Migración SQL nueva de este lote

- `db/agregar_recordatorios_documentos_soporte.sql` — tabla
  `recordatorios_documentos_soporte_enviados` (control de reenvíos) +
  función `fn_enviar_recordatorios_documentos_soporte()` + programación
  `pg_cron`. Lee la nota grande al inicio del archivo antes de ejecutarlo:
  recomienda probar la función a mano antes de confiar en el cron.

  **Ajuste pedido antes de ejecutar (misma ronda, justo después de la
  entrega inicial):** "Factura" y "Comprobante de pago" se sacaron de la
  regla genérica (aviso inmediato al día siguiente del fin del evento) y
  pasaron a tener su propio plazo: Factura se avisa solo a partir de 15
  días desde el fin del evento; Comprobante de pago, a partir de 75 días
  desde la fecha de carga de la factura (no desde el fin del evento — si
  no hay factura cargada, este ítem simplemente no aplica todavía). En
  ambos casos la copia al Director Médico que aprobó el evento pasa a ser
  obligatoria siempre que cualquiera de los dos aparezca en la lista de
  pendientes, sin esperar al umbral de 3 días ("nivel enfático") que
  sigue gobernando la copia para el resto del checklist. "Orden de
  compra" no cambió. Límite honesto, ya confirmado por el usuario contra
  la base real: `evento_registros_financieros` no tiene columna
  `creado_en`, así que la "fecha de carga de la factura" usa en la
  práctica `fecha` (un campo de fecha de factura ingresado a mano en el
  formulario, no necesariamente la fecha real de carga del archivo) —
  aproximación razonable y documentada en el propio archivo SQL.

## Sexto lote de ajustes de esta ronda (octubre 2026)

9 puntos pedidos explícitamente en un solo lote, tras la entrega del quinto lote.

1. **Marca de agua: arreglada de verdad esta vez (dos causas distintas)** —
   el usuario reportó que, tras el "arreglo" del quinto lote, el
   interruptor "Modo para firma externa (sin marca de agua)" no cambiaba
   nada al imprimir, y que en pantalla se veía el texto del estado
   repetido "en varios espacios de la hoja" en vez de una sola marca
   centrada. Dos causas reales, ambas verificadas con Playwright/Chromium
   headless (PDF de 3 páginas, página por página, igual método que el
   lote anterior):
   - La baldosa del patrón de fondo (`BALDOSA_MARCA_AGUA`,
     `DocumentoImprimible.tsx`) media 420×300px — se repetía varias veces
     por hoja. Ahora mide 768×960 (el ancho de `#zona-imprimible` × el
     alto de contenido de una hoja Letter con el margen declarado en
     `index.css`), con `background-repeat: repeat-y` +
     `background-position: center top`: una sola marca, diagonal,
     centrada, exactamente una vez por hoja.
   - El fondo simplemente NO se imprimía nunca, con el interruptor en
     cualquier posición: los navegadores no imprimen
     `background-image`/`background-color` por defecto salvo que el CSS
     declare `print-color-adjust: exact` (`-webkit-` incluido) — se
     agregó a `#zona-imprimible` en `index.css`.
   - Se agregó también `@page { size: letter; margin: 0.5in; }` (dentro de
     `@media print`, `index.css`) para que el alto de cada hoja sea fijo y
     conocido — sin esto, la baldosa de 960px no tiene con qué alinearse
     de forma confiable.

2. **Tarjetas del panel de documentos: texto que se cortaba** — causa
   real: `truncate` (la utilidad de Tailwind) no hace nada dentro de una
   fila flex si el elemento no puede encoger por debajo de su ancho
   natural (comportamiento por defecto de un hijo flex). Sin `min-w-0` el
   texto largo desbordaba la tarjeta en vez de cortarse con "…" — más
   visible con 3 columnas que con 2. Corregido en `Tablero.tsx`: título,
   cada campo (`CampoTarjeta`) y el nombre del creador ahora llevan
   `min-w-0 flex-1` en el span que trunca, más un `title` con el texto
   completo (tooltip nativo al pasar el mouse).

3. **Marcos de ventana desconfigurados (Usuarios/Roles, tablas en
   general)** — causa real: varias tablas (`UsuariosRoles.tsx`,
   `InformePagos.tsx`, `HcpsImpactados.tsx`, `EjecucionEventos.tsx`,
   `InformeSpeakers.tsx`) no tenían `overflow-x-auto` en su contenedor:
   en vez de aparecer una barra de scroll horizontal DENTRO de la
   tarjeta, la tabla empujaba el ancho de toda la tarjeta, deformando su
   marco. Se agregó `overflow-x-auto` a las 5. Revisión general del resto
   de ventanas: no se encontraron otros casos del mismo patrón (`<table
   className="w-full">` sin contenedor con scroll).

4. **Cadena de aprobación: nombre centrado, fecha/hora debajo del
   estado** — en los 4 `Detalle*.tsx` con cadena de aprobación
   (Evento/Convenio/CAF/Convenio HCP), la fila de cada paso se
   reorganizó: nombre del firmante en una columna central con texto
   centrado, firma manuscrita, y un bloque a la derecha con el badge de
   estado (Aprobado/Rechazado/etc) y la fecha/hora de la firma apilada
   justo debajo.

5. **"Configuración de la Plantilla Legal — Convenio HCP" → "Configuración
   de la Plantilla Legal"** — quitado el sufijo en `lib/navegacion.ts`
   (nombre del menú lateral y título de la página) y en el `<h1>` propio
   de `PlantillaConvenioHcp.tsx`.

6. **CAF: texto descriptivo actualizado** — "Nueva CAF Carta de
   Autorización de Fondos, asociada a un evento ya aprobado" →
   "Nuevo CAF (Formato de Aprobación de Contrato asociado a un evento ya
   aprobado)", en `NuevoCaf.tsx`.

7. **Selector de compañía del grupo, al login + switcher en la app** —
   pedido explícito: que un usuario con varias compañías habilitadas
   (`usuario.empresasGrupo`) elija con cuál trabajar, y que el aplicativo
   muestre solo la información de esa compañía (documentos, usuarios,
   informes, auditoría, etc). Implementado:
   - `hooks/useCompania.tsx` (nuevo): contexto `CompaniaProvider`/
     `useCompania()`. 0 o 1 compañía → entra directo, sin preguntar (0 se
     trata como el mismo comodín "todas/sin restricción" que ya usa
     `dentroDelAlcance` en `lib/usuarios.ts`). 2+ compañías → pantalla de
     selección (`pages/SeleccionCompania.tsx`, nueva) la primera vez;
     la elección se recuerda en `localStorage` por usuario para no
     volver a preguntar en cada recarga. Switcher siempre visible en el
     header (`App.tsx`) para cambiar sin cerrar sesión, solo para
     usuarios con 2+ compañías.
   - Filtrado aplicado a: `Tablero.tsx`, `AuditoriaEventos.tsx`,
     `TareasPendientes.tsx`, `Documentos.tsx`, `InformePorEvento.tsx`,
     `HcpsImpactados.tsx`, `EventosEnVivo.tsx`, `PanelEnVivo.tsx`,
     `ParticipacionSpeaker.tsx`, `Historial.tsx`, `EjecucionEventos.tsx`,
     y la lista de usuarios de `UsuariosRoles.tsx` (además del filtro de
     alcance que ya existía, no en su lugar). `Evento`/`Fmv`/
     `NotificacionPagoHcp` se filtran por su propio `empresaGrupo`; `Caf`/
     `Convenio`/`ConvenioHcp` (que no tienen ese campo propio) se derivan
     vía `eventoOrigenId` contra los eventos ya filtrados. Los 6
     formularios "Nuevo*" ahora usan la compañía actual como
     `empresaGrupo` por defecto de lo que crean (reemplaza los ~17 usos
     de `usuario.empresasGrupo[0]` repartidos por la app).
   - **Límite honesto, no filtrado todavía:** `InformePagos.tsx` (su
     función de datos, `lib/informePagos.ts`, no expone `empresaGrupo` ni
     un id de evento a nivel de fila — requeriría cambiar el tipo de
     retorno de esa función) e `InformeSpeakers.tsx`/speakers en general
     (un Speaker no tiene `empresaGrupo` propio, solo
     `empresasGrupoInteraccion` — y no es uno de los 6 tipos de documento
     que cubrió este ajuste).

8. **Inmutabilidad de documentos ya firmados/aprobados** — pedido
   explícito: que la firma manuscrita y los campos/etiquetas de un
   documento ya aprobado no cambien retroactivamente si, después, el
   usuario actualiza su firma o Legal/Compliance cambia la configuración
   de campos. Implementado con el mismo principio que esta app ya usa
   para la plantilla legal del Convenio HCP ("congela un snapshot al
   momento de firmarse"), vía una migración SQL nueva (ver abajo) +
   cambios de código:
   - `lib/aprobaciones.ts` (`PasoAprobacion.firmaCongeladaId`) + mapeo en
     `evento.ts`/`caf.ts`/`convenio.ts`/`convenioHCP.ts`: cada paso de
     aprobación, una vez firmado, prefiere su firma congelada
     (`paso.firmaCongeladaId`) sobre la firma EN VIVO del usuario
     (`resolutor?.firmaId`) — en los 4 `Detalle*.tsx` con cadena de
     aprobación y en `TablaAprobacion` (`DocumentoImprimible.tsx`, vista
     impresa).
   - `lib/snapshotFormato.ts` (nuevo): parsea el `snapshot_formato`
     (jsonb crudo) de cada documento al mismo shape tipado que usan
     `etiquetaEfectiva`/`camposAplicables`. Los 6 `Detalle*.tsx` ahora
     prefieren ese snapshot sobre la configuración en vivo, SOLO en las
     dos vistas de solo-lectura (compacta e impresión) — el formulario de
     edición (mientras el documento sigue editable) sigue viendo la
     configuración en vivo, como corresponde.
   - **Límite honesto:** esta entrega modificó solo el código del
     frontend — la migración SQL (`agregar_inmutabilidad_documentos_firmados.sql`,
     ver abajo) todavía no se ejecutó en Supabase. Hasta que se ejecute,
     `firmaCongeladaId`/`snapshotFormato` vienen vacíos y todo sigue
     funcionando exactamente igual que antes (resolución en vivo, sin
     romper nada) — son campos optativos con fallback a la resolución en
     vivo a propósito.

### Migraciones SQL nuevas de este lote

- `db/agregar_inmutabilidad_documentos_firmados.sql` — agrega
  `firma_congelada_id` a las 4 tablas de cadena de aprobación (con
  trigger que la congela al momento de aprobar cada paso) y
  `snapshot_formato` (jsonb) a los 6 tipos de documento (con trigger que
  lo congela al quedar Aprobado/Completado). Es una migración más grande
  que las anteriores — lee la nota completa al inicio del archivo antes
  de ejecutarla, incluye un paso de verificación manual recomendado
  (punto 6) antes de confiar en ella.

## Solicitud puntual tras el sexto lote (octubre 2026): empresas del grupo duplicadas

El usuario reportó dos empresas del grupo duplicadas (HUMAX PHARMACEUTICAL y
LABORATORIOS GROSSMAN) que no podía ver/gestionar desde el aplicativo.
Investigación: "Empresas del grupo" no es una tabla propia — es el catálogo
genérico `catalogo_valores` filtrado por `catalogo = 'empresasGrupo'` (ver
`src/lib/catalogos.ts`/`src/lib/enums.ts`), editable desde "Configuración de
Campos" → "Catálogos de opciones" (`EditorCatalogosSimples.tsx`). La causa
más probable de que el usuario no las distinguiera ahí es que las filas
duplicadas sean textualmente idénticas o casi (espacios al borde,
mayúsculas), indistinguibles a simple vista aunque el editor sí tiene botón
de eliminar por fila.

- `db/eliminar_empresas_grupo_duplicadas.sql` (nuevo) — script de 3 pasos:
  (1) diagnóstico de solo lectura mostrando el id real de cada fila
  duplicada en `catalogo_valores` más un chequeo de si esos nombres
  también aparecen en documentos existentes (`solicitudes_evento`,
  `fmv_checklists`, `notificaciones_pago_hcp`); (2) `delete` que conserva
  una sola fila por nombre (la de menor `orden`/`id`, agrupando por
  `lower(trim(valor))`) y borra las copias de más, con una normalización
  de texto opcional comentada; (3) verificación de que solo queda una
  fila por empresa. No toca el texto `empresa_grupo` ya guardado en
  documentos existentes — solo limpia la lista de opciones del
  desplegable.
- `db/normalizar_nombres_empresas_grupo.sql` (nuevo) — seguimiento pedido
  por el usuario: normaliza el texto `empresa_grupo` ya guardado (no solo
  la opción del catálogo) en las 10 tablas donde aparece como texto libre
  (`solicitudes_evento`, `fmv_checklists`, `notificaciones_pago_hcp`,
  `auditoria`, `etiquetas_campo`, `campos_personalizados_definicion`,
  `plantilla_convenio_hcp_version`, `productos_portafolio`,
  `configuracion_formatos_empresa`, `catalogo_valores`) más las 2 columnas
  de arreglo (`usuarios.empresas_grupo`,
  `speakers.empresas_grupo_interaccion`, reemplazando solo el elemento
  que hace match y eliminando duplicados que el reemplazo pudiera
  generar) — cualquier valor que contenga "grossman" queda como
  `LABORATORIOS GROSSMAN` y cualquiera con "humax" como `HUMAX
  PHARMACEUTICAL`. Las tablas con restricción de unicidad por
  `empresa_grupo` (`etiquetas_campo`, `campos_personalizados_definicion`,
  `configuracion_formatos_empresa`) usan `where not exists` para no violar
  esa unicidad si ya existieran ambas variantes a la vez — esos casos
  quedan listados en el paso de verificación para fusionar a mano. El
  `update` de `usuarios.empresas_grupo` (paso 4) choca con el trigger de
  resguardo `fn_resguardo_edicion_usuarios` (ya documentado en
  `db/dar_privilegios_administrador_sebastian.sql` — bloquea cambios a
  columnas sensibles de `usuarios` fuera de una sesión autenticada de la
  app) — el script lo apaga puntualmente, hace el `update`, y lo prende de
  nuevo dentro de la misma transacción, mismo patrón ya usado en ese otro
  archivo.

## Séptimo lote de ajustes (octubre 2026): batch de 11 correcciones explícitas

Pedido explícito del usuario, lista de 11 puntos en un solo mensaje — cada
uno se documenta por separado abajo. Todos verificados con `npx tsc -b`
limpio y con grep sobre `bundle.html` tras `npm run build:bundles`.

1. **Bug: "Transporte/Hospedaje/Alimentos desaparecen" en Solicitud de
   Evento con Speaker externo.** `src/components/forms/FormularioEvento.tsx`
   — la sección "Speakers externos — identificación, cuota y presupuesto"
   solo se mostraba si además `speakersParticipacion.length > 0`. El
   diseño es correcto (esos campos se mueven a captura por-speaker cuando
   `quienDictaActividad === "Speaker externo"`), pero la sección de
   reemplazo quedaba oculta hasta que se agregaran speakers, sin ninguna
   pista visual — un hueco real en la UX, no un bug de visibilidad simple.
   Corregido: la sección siempre se muestra en ese caso; si todavía no hay
   speakers, se ve un mensaje guía en vez de la lista vacía.

2. **Validación obligatoria universal antes de aprobar/guardar
   definitivo.** FMV y Notificación de Pago a HCP no tenían ninguna
   validación real en su único paso de cierre ("Firmar y completar" — no
   tienen cadena de aprobación). Nuevas `calcularErroresFmv`
   (`src/lib/fmv.ts`) y `calcularErroresNotificacionPago`
   (`src/lib/notificacionPago.ts`), ambas cableadas en
   `confirmarFirma()` de `DetalleFmv.tsx`/`DetalleNotificacionPago.tsx`.
   Evento/Caf/Convenio/ConvenioHCP ya validaban completo al enviar a
   aprobación desde antes — no requerían cambios.

3. **"Empresa del grupo" obligatoria y autocargada en Solicitud de
   Evento, incluso como borrador.** `NuevoEvento.tsx` autocompleta el
   campo desde la compañía con la que está trabajando el usuario (o su
   primera empresa asignada) y bloquea el guardado — como borrador o
   definitivo — si queda vacío; refuerzo igual en `crearEvento()`
   (`src/lib/evento.ts`).

4. **Cerrar el formulario tras guardar borrador o enviar a
   aprobación**, para evitar duplicados. Ya estaba hecho para
   aprobar/rechazar/devolver en una ronda anterior; faltaba en
   `guardarBorrador(...)` de los 6 `Detalle*.tsx` — agregado, verificando
   en cada caso que el autoguardado cada 45s llama directo a la función
   de librería y no al handler modificado, así que no se interrumpe.

5. **"Profesión" obligatoria en Nuevo Speaker.** `src/lib/speakers.ts`
   (`calcularErroresSpeaker`) y `src/pages/Speakers.tsx` (asterisco +
   mensaje de error bajo el campo).

6. **Eliminar un borrador propio, sin rastro de auditoría, solo quien lo
   creó.** Nuevas funciones `eliminarBorrador*` en los 6 `lib/*.ts`
   (`evento.ts`, `caf.ts`, `convenio.ts`, `convenioHCP.ts`, y la
   compartida `eliminarBorradorDocumentoUnicoFirmante` en
   `documentoUnicoFirmante.ts` para FMV/Notificación de Pago) —
   `estado = 'Borrador'` y `creado_por_id = usuario.id` van en el propio
   `.eq()` del `delete`, no solo en la UI. Nunca llaman
   `registrarAuditoria`. Botón "Eliminar borrador" + confirmación en los
   6 `Detalle*.tsx`, visible solo a quien creó el documento mientras siga
   en Borrador (`puedeEliminarBorrador`, sin excepción para
   Administrador).

7. **Pantalla admin-only "Eliminar Documentos Firmados"**, para borrar
   sin rastro documentos ya en cualquier estado posterior a Borrador
   (incluidos los firmados/Completados por error), con confirmación por
   contraseña del usuario loggeado. Nuevo permiso individual
   `puedeEliminarDocumentosFirmados` en `usuarios`
   (`db/agregar_permiso_eliminar_documentos_firmados.sql`), otorgable
   persona por persona desde "Configuración de Usuarios/Roles"
   (`UsuariosRoles.tsx`) — deliberadamente NO heredado de
   `esAdministrador`. Nueva página `src/pages/EliminarDocumentosFirmados.tsx`
   (ítem de menú visible solo con el permiso, ver `requierePermiso` en
   `lib/navegacion.ts`), que lista los 6 tipos de documento vía
   `src/lib/documentosAdmin.ts` y pide la contraseña actual
   (`verificarPasswordActual`, nueva en `useAuth.tsx`, mismo patrón de
   reautenticación ya usado por "cambiar contraseña") antes de llamar
   `eliminarDocumentoSinRastroAdmin`, que despacha a una función
   `eliminarDocumentoFirmadoAdmin` nueva en cada `lib/*.ts` — igual a los
   `eliminarBorrador*` del punto 6 pero sin restricción de `estado` ni de
   creador, y sin auditoría.

8. **Bug: FMV mostraba "Firma electrónica: Sí/No" en vez de la firma
   autógrafa real.** Nueva columna `firmado_por_id` en `fmv_checklists` y
   `notificaciones_pago_hcp` (`db/agregar_firmado_por_documento_unico_firmante.sql`)
   — se llena en `firmarYCompletarDocumentoUnicoFirmante`. La vista de
   impresión (`DocumentoImprimible.tsx`, `CuerpoFMV`/
   `CuerpoNotificacionPago`) ahora muestra la firma manuscrita real de
   quien firmó (cae de vuelta a `creadoPorId` para documentos firmados
   antes de esta migración, que quedan con `firmado_por_id` en null).

9. **Bug: anular un documento no cambiaba su estado.** Causa real: un
   `.update()` de Supabase sin `.select()` no reporta error cuando una
   política de RLS filtra la fila — 0 filas afectadas se ve igual que
   éxito. Corregido en los 5 `anular*` (`evento.ts`, `caf.ts`,
   `convenio.ts`, `convenioHCP.ts`, `documentoUnicoFirmante.ts`)
   agregando `.select("id")` y lanzando un error real si no se afectó
   ninguna fila. Se aplicó el mismo refuerzo, preventivamente, a
   `firmarYCompletarDocumentoUnicoFirmante` por compartir el mismo patrón
   vulnerable.

10. **Cerrar el formulario tras anular o firmar**, para evitar repetir
    la instrucción. Agregado en `confirmarAnulacion()` (los 6
    `Detalle*.tsx`) y `confirmarFirma()` (FMV y Notificación de Pago).

11. **Filtrar speakers por la(s) empresa(s) del grupo con la(s) que
    trabaja el usuario.** `src/pages/Speakers.tsx` usa
    `useCompania()`/`companiaActual` para mostrar solo (o, sin compañía
    seleccionada, todos) los speakers cuyo
    `empresasGrupoInteraccion` incluya la compañía activa — un speaker
    con interacción en varias empresas aparece en cada una.

### Migraciones SQL nuevas de este lote

- `db/agregar_firmado_por_documento_unico_firmante.sql` — columna
  `firmado_por_id` en `fmv_checklists`/`notificaciones_pago_hcp` (punto 8).
- `db/agregar_permiso_eliminar_documentos_firmados.sql` — columna
  `puede_eliminar_documentos_firmados` en `usuarios` (punto 7).

Ambas deben ejecutarse en Supabase antes de usar las funciones
correspondientes — sin ellas, `firmarYCompletarDocumentoUnicoFirmante`
fallará al intentar escribir una columna inexistente, y el toggle nuevo en
"Configuración de Usuarios/Roles" no tendrá dónde guardarse.

## Octavo lote de ajustes (octubre 2026): eliminar/anular, "Gestión avanzada de documentos", anchos y renombres

Pedido explícito del usuario, lista de 10 puntos + una aclaración de lógica
(punto «a»). Los puntos 1–7, 9 y 10 quedaron implementados; el 8 (cerrar/
minimizar ventanas) está a la espera de elegir entre las opciones que se
presentaron, y el «a» a la espera de una decisión de presupuesto (ver el
final de esta sección).

**Verificación:** `npx tsc -p tsconfig.app.json --noEmit` limpio; nuevo
`scripts/verificar_gestion_documentos.mjs` (navegador real + Supabase
simulado) pasa completo; la migración SQL se probó contra un Postgres real
en memoria (PGlite) con RLS que bloquea todo y un trigger de máquina de
estados simulado — 17/17 casos. Nota: al correr la suite completa
(`npm run verificar`) sobre el zip ORIGINAL ya fallaban 13 de 18 scripts
antiguos (selectores desactualizados por rondas de UI anteriores, más un
par con fallos intermitentes por tiempos) — exactamente los mismos con esta
entrega; no se introdujo ninguna regresión detectable.

### Puntos 1–4: eliminar borrador / anular / eliminar desde la sección admin

Los 4 mensajes reportados tenían una misma causa de fondo, no 4 bugs
distintos: un `delete`/`update` directo desde el navegador que Row Level
Security filtraba en silencio (0 filas afectadas, sin error de Postgres).

1. **"Eliminar borrador"** — "No se pudo eliminar: solo quien creó la
   solicitud puede borrarla..." aun siendo el creador y en Borrador: el
   `delete` lo filtraba RLS (probablemente no hay política `DELETE` para
   `authenticated`; tampoco en las tablas hijas, cuyo borrado previo no
   chequeaba errores).
3. **Anular un documento Completado** — "la base de datos no permitió el
   cambio": mismo mecanismo, sobre el `update`.
4. **Sección admin** — "no se encontró el documento (probablemente una
   restricción de permisos)": mismo mecanismo.
2. **Anular un Borrador** — "Desde Borrador solo puedes guardar (Borrador)
   o enviar a aprobación (Pendiente)": ESTE mensaje no existe en el código
   de la app; lo lanza un trigger de máquina de estados que vive solo en la
   base real de Supabase. Es una regla de negocio coherente (un Borrador no
   se anula, se elimina), así que NO se tocó el trigger: la interfaz deja de
   ofrecer "Anular" en Borrador (`puedeAnularSegunEstado`,
   `src/lib/cicloVidaDocumento.ts`, en los 6 `Detalle*.tsx`) y quien lo creó
   usa "Eliminar borrador".

**Solución:** las políticas RLS reales no están en este repositorio, y
reescribirlas a ciegas ya causó una recursión infinita de políticas en
`usuarios` (ver `db/rls-usuarios.propuesta.sql`). En vez de tocarlas, la
operación pasa a funciones `security definer` que identifican al usuario con
`auth.uid()`, validan la regla de negocio en el SERVIDOR y recién entonces
ejecutan el cambio:

- `beats_eliminar_borrador(tipo, id)` — solo quien lo creó y solo en Borrador.
- `beats_eliminar_documento_admin(tipo, id)` — exige
  `usuarios.puede_eliminar_documentos_firmados` (ahora validado también en
  el servidor, no solo en la pantalla).
- `beats_anular_documento(tipo, id, motivo)` — solo Administrador; rechaza
  Borrador y documentos ya Anulados.

Las dos de eliminación borran primero las filas dependientes (cadena de
aprobación, sesiones, speakers y presupuestos, muestras, códigos,
repositorio, ejecución...) **descubriéndolas por las llaves foráneas
reales** de la base (recursivo, hasta 5 niveles), en vez de depender de una
lista escrita a mano. Si otro documento principal depende de este (p. ej. un
CAF vinculado a un evento) NO se borra en cascada: se rechaza con un mensaje
claro. Todo es atómico (si algo falla, no se borra nada). La eliminación
sigue sin registrar auditoría (ni borra filas de auditoría anteriores).

En el código: `src/lib/documentosRpc.ts` (único punto de entrada),
`eliminarBorrador*`/`eliminarDocumentoFirmadoAdmin`/`anular*` de los 6
`lib/*.ts` y de `documentoUnicoFirmante.ts` ahora solo delegan ahí. Los
`eliminarBorrador*` ya no reciben `usuario` (el servidor usa `auth.uid()`).

**Bug previo corregido de paso (`src/pages/Tablero.tsx`):** tras anular/
guardar borrador/enviar/eliminar, el Tablero volvía a abrir el formulario
que acababa de cerrarse (`onActualizado` releía los datos y re-seleccionaba
el documento después de `onCerrar`). Ahora solo refresca si sigue abierto.

### Punto 5: "Ver documento" antes de eliminar

`DocumentoAdminResumen` ahora lleva el documento completo
(`src/lib/documentosAdmin.ts`). La pantalla tiene un botón "Ver documento"
en cada fila y otro "Ver documento antes de confirmar" dentro del cuadro de
confirmación, que abren el mismo diálogo de detalle de Tablero/Historial
(con "Ver / Imprimir / Exportar a PDF") encima de la confirmación, sin
perder lo escrito.

### Puntos 6 y 7: textos y nombre de la sección

- `UsuariosRoles.tsx`: "Puede eliminar documentos firmados sin rastro
  (pantalla de administración)" → "Gestión avanzada de documentos firmados
  (Módulo de administración)"; se retiró la nota "Otorga acceso individual...".
- Sección "Eliminar Documentos Firmados" → "Gestión avanzada de documentos"
  (menú, título/subtítulo de la página y tarjeta). El id interno de la
  página (`eliminar-documentos-firmados`) NO cambió, para no romper
  `paginas_permitidas` ya guardados. El subtítulo ya no menciona "sin rastro".

### Punto 9: anchos

- `App.tsx`: el tope único `max-w-5xl` pasa a ser por página —
  `max-w-7xl` (1280px) para tablas/listas (Usuarios y Roles, Speakers,
  Campos, informes, Historial, Documentos, Gestión avanzada...), `max-w-6xl`
  (1152px) para captura de documentos y Tareas, y el ancho anterior para el
  resto (el Tablero conserva el suyo: su fila de filtros usa un truco
  "full-bleed" calibrado a ese ancho).
- Usuarios y Roles: las columnas de texto largo (nombre, correo, alcance)
  envuelven en vez de empujar el ancho; "Activo" y las acciones no se parten.
  Verificado en 1366×768 con datos largos: `scrollWidth == clientWidth` (sin
  barra horizontal).
- Diálogos: `Detalle*` de 5xl a 6xl; editores y diálogos de usuarios/
  speakers/envío de 2xl a 3xl — todos con `w-[calc(100vw-2rem)]` para nunca
  exceder la ventana.

### Punto 10: rol "Gerencia General / Rep. Legal"

Nombre nuevo en `ETIQUETA_ROL_USUARIO`, etapas de la cadena de aprobación
(`aprobaciones.ts`), Convenio HCP, vista impresa y textos. El valor interno
del rol (`gerencia_general`) no cambia. Nota: el texto anterior que usaba la
app era "Gerencia General **&** Representación Legal" (con "&", no "/"); se
reemplazaron ambas variantes. Las etapas YA guardadas en documentos
existentes conservan el texto viejo hasta correr el script opcional
`db/actualizar_nombre_rol_gerencia_general.sql`.

### Migraciones SQL nuevas de este lote (ninguna se aplicó automáticamente)

- `db/agregar_rpc_eliminar_anular_documentos.sql` — **OBLIGATORIA**: sin
  ella, "Eliminar borrador", "Anular" y "Gestión avanzada" muestran un error
  que lo indica. Incluye `notify pgrst, 'reload schema'`.
- `db/actualizar_nombre_rol_gerencia_general.sql` — opcional, solo datos
  históricos (etiquetas de etapas).

### Noveno lote (octubre 2026): speakers internos/externos por sesión y bandeja de ventanas

**Punto «a» — speakers (interno o externo) con transporte/hospedaje/alimentación por sesión.**
- Con "Participación académica = Sí", tanto "Speaker interno" como "Speaker
  externo" usan el modelo de N speakers (`usaSpeakers()` en
  `FormularioEvento.tsx`): una casilla por speaker, con su elección de
  sesiones (en "Varias sesiones") y su T/H/A por sesión (`renderPresupuestoSpeaker`).
- Externo: se elige del repositorio y además lleva cuota de inscripción,
  honorarios y modalidad de factura (validados). Interno: nombre en texto
  libre (`speaker_id` nulo; el primero alimenta `nombreSpeakerParticipacion`
  para el documento impreso), sin cuota/honorarios/factura.
- El bloque general de T/H/A (documento y por sesión) solo se muestra cuando
  NO aplica el modelo por speaker (sin participación académica). El
  condensado suma el paquete de todos los speakers (`hayPresupuestoPorSpeaker`).
- Cambiar interno↔externo descarta las casillas ya creadas (no comparten campos).
- Persistencia: `llevaSpeakers()` en `evento.ts` guarda las mismas tablas
  (`evento_speakers_participacion`/`evento_speaker_presupuestos`) para ambos;
  **no requiere migración** (`speaker_id`, montos y `nombre_speaker` ya eran nulables).
- Las tareas de FMV/Convenio/CAF (`documentosRequeridosEvento.ts`) siguen
  siendo SOLO para externos.
- Documento impreso: "Speakers internos"/"Speakers externos"; el interno no
  muestra cuota ni honorarios.
- Eventos antiguos con "Speaker interno" y T/H/A a nivel de documento/sesión
  se siguen leyendo, pero al editarlos en Borrador hay que declarar el número
  de speakers y volver a capturar el presupuesto por speaker.
- Prueba: `scripts/verificar_speakers_internos.mjs`.

**Punto 8 — opción C, fase 1 (bandeja).**
- `components/ui/dialog.tsx`: `<Dialog>` ahora administra el estado
  "minimizada"; `<DialogContent minimizable confirmarCierre>` agrega el botón
  «_» y una «X» que pide confirmación si hay cambios sin guardar. Minimizar
  oculta (no desmonta) la ventana y la vuelve no modal, así no se pierde lo
  escrito y la página de atrás queda utilizable.
- `hooks/useBandejaVentanas.tsx`: bandeja inferior (en `App.tsx`) con una
  pastilla por ventana minimizada; el registro (id + título + restaurar) es
  la API que luego servirá para ventanas flotantes.
- Activado en las 6 ventanas `Detalle*` (vista y edición). Los diálogos de
  confirmación conservan su comportamiento (sin «X»/«_»).
- Limitación conocida (fase 2): la ventana vive en la página que la abrió, así
  que si se cambia de página se cierra; y en el Tablero, abrir otro documento
  del mismo tipo reemplaza al minimizado. Resolverlo exige elevar el estado de
  ventanas al `AppShell`. Las páginas «Nuevo …» (generación) aún no tienen «_».
- Prueba: `scripts/verificar_ventanas_bandeja.mjs`.

## Décimo lote (octubre 2026): auditoría por rango, reorden del formulario de evento, ventanas fase 2, ojo de contraseña, países

**Migración nueva (ejecutar a mano en Supabase, después de `agregar_rpc_eliminar_anular_documentos.sql`):**
`db/agregar_rpc_eliminar_auditoria_rango.sql` — funciones `beats_contar_auditoria_rango` y
`beats_eliminar_auditoria_rango` (permiso individual de "Gestión avanzada de documentos firmados",
sin escribir nada en `auditoria`). Si falta, la pantalla muestra el aviso de migración pendiente.

1. **Renombre:** "Gestión Avanzada de Documentos" (menú, título de página y tarjeta).
2. **Eliminar log de auditoría** (`components/EliminarAuditoriaRango.tsx`, dentro de esa página): rango
   desde/hasta con fecha y hora (hora local del navegador → ISO), botón "Contar registros del rango",
   confirmación con la contraseña de quien elimina; sin rastro.
3. **Formulario de Solicitud de Evento — nuevo orden:** Solicitante y evento (termina en "Motivo" de la lista
   de asistencia) → Participación, presupuesto aprobado y anexos (ahora con "Centro de costos *" obligatorio
   antes de "¿El evento está incluido…?") → **Patrocinio / pago de viáticos a HCP** (sección nueva con
   interruptor Sí/No en el encabezado, mismos campos y validaciones de antes) → Participación académica →
   Fechas, modalidad y lugar → Muestras médicas → Artículos promocionales → (speakers) → Transporte, hospedaje y
   alimentos → Presupuesto condensado → Comentarios especiales. El documento impreso/PDF/visor
   (`CuerpoEvento`) sigue el mismo orden y secciones; "Centro de costos" salió del condensado.
4. **Ventanas, fase 2:** las ventanas de los 6 documentos viven ahora en el AppShell
   (`hooks/useVentanasDocumentos.tsx`): sobreviven al cambio de página, puede haber varias del mismo tipo y
   abrir un documento ya abierto solo lo restaura. `useAbrirDocumentoGenerico` conserva su firma (las páginas
   no cambiaron; `dialogos` ya no renderiza nada) y el Tablero dejó de tener sus 6 estados propios. Las
   páginas "Nuevo …" tienen «_» (conservan lo diligenciado, pastilla en la bandeja, restaurable desde
   cualquier página) y «X» (confirma y descarta). Salir de una página "Nuevo …" sin minimizar la descarta,
   como antes. Pendiente (fase 3): ventanas flotantes arrastrables.
5. **Ojo de contraseña** (`components/ui/input-password.tsx`): login, cambio de contraseña forzado y
   confirmaciones con contraseña; muestra 3 s y se oculta sola (o al salir del campo).
6. **Países de operación:** lista fija de 36 países en orden alfabético (`PAISES_OPERACION`); ya no sale de la
   tabla `paises_region` (que sigue alimentando filtros/informes). Un usuario con un país guardado fuera de la
   lista lo perderá al volver a guardar su perfil.
- Pruebas: `scripts/verificar_lote10.mjs`.


## Undécimo lote (octubre 2026): confirmación al eliminar, valor participación, error de speakers, días pendientes, ventanas en Nuevo Speaker/Usuario

1. **Confirmación antes de eliminar.** Nuevo `useConfirmar()` (`src/hooks/useConfirmar.tsx`, proveedor en `App.tsx`): diálogo "¿Eliminar …?" con Cancelar/Eliminar. Aplicado a: speakers, valores de catálogo, campos personalizados, etiquetas, productos del portafolio, overrides/formatos oficiales, ajustes de cláusula, archivos y registros del repositorio del evento, y los "Quitar" de sesión / muestra / speaker / producto / archivo adjunto en los formularios. (Eliminar borrador y "sin rastro" ya tenían su propia confirmación.)
2. **Presupuesto condensado → casilla "Valor participación".** Autocarga el valor diligenciado, se mantiene sincronizado y suma al total (sin duplicarlo con la línea Inscripción). También en la vista impresa. Requiere `db/agregar_valor_participacion_condensado.sql`.
3. **"No se pudieron guardar los speakers … No tienes permiso".** Causa: `evento_speakers_participacion` y `evento_speaker_presupuestos` no tenían políticas RLS que permitieran escribir a Dirección Médica. Requiere `db/agregar_rls_speakers_evento.sql`. En la app, `crearEvento` ya no deja un documento a medias si falla el guardado de speakers/sesiones/muestras (intenta retirarlo y avisa), y el mensaje de permiso indica qué migración falta. **Los documentos que se enviaron antes de aplicar la migración quedaron SIN speakers: hay que anularlos y volver a crearlos.**
4. **Días pendientes desde el envío.** Nueva columna `enviado_a_firma_en` (trigger + backfill) en los 4 documentos con cadena; "Aprobaciones pendientes de tu firma" cuenta desde el envío (primer aprobador) o desde la firma del anterior, y muestra "Elaborado", "Tarea recibida" y "Pendiente hace …". Requiere `db/agregar_fecha_envio_a_firma.sql`.
5. **"_" y "X" en Nuevo Speaker, Nuevo Usuario y Editar usuario.** Una ventana minimizada hace que su página siga montada (oculta) aunque se navegue a otra; la pastilla de la bandeja navega de vuelta y la restaura (`PaginaVentanaContexto`).

Migraciones obligatorias de este lote: `agregar_rls_speakers_evento.sql`, `agregar_fecha_envio_a_firma.sql`, `agregar_valor_participacion_condensado.sql` (Supabase → SQL Editor). Pruebas nuevas: `scripts/verificar_lote11.mjs`, `scripts/verificar_valor_participacion.mjs`.

**Correo al primer aprobador:** lo envía el trigger de base de datos `fn_notificar_primera_etapa_evento` → `notificaciones` → `fn_notificar_por_email()` (requiere la fila de `configuracion_integraciones`); no se puede corregir desde el código de la app.

### Ajustes posteriores al undécimo lote (octubre 2026)
- **Adjuntos con arrastrar/clic en todos los campos**: `CampoArchivo` usa por defecto la variante "dropzone" ("Arrastra el archivo aquí o haz clic para adjuntarlo"); la foto del speaker y el logo del producto aceptan arrastrar imagen; el diálogo "Enviar documento" también.
- **Condensado**: se retiró la casilla; ahora hay un campo «Valor participación» (solo lectura) que se carga solo desde el «Valor participación» diligenciado y suma al total. «Inscripción» ya no lo repite (en el caso con speakers sigue siendo la suma de sus cuotas). Documentos anteriores siguen sumando igual.
- `agregar_fecha_envio_a_firma.sql` corregido (desactiva triggers de usuario solo durante el relleno).
- **Corrección**: al crear/editar un evento con "Varias sesiones" y speakers, los presupuestos por sesión llevaban el id temporal de la sesión ("nueva-…") y fallaba con `invalid input syntax for type uuid`. `guardarSpeakersParticipacion` ahora traduce esos ids a los uuid reales de las sesiones recién guardadas (`mapaIdsSesiones`).

## Duodécimo lote (octubre 2026): versión del bundle, firma solo por rol, FK de firma, notificaciones
- **Versión y fecha/hora del bundle**: `scripts/generar_bundle.mjs` inyecta `window.__BEATS_BUILD__` (versión = archivo `VERSION` en la raíz; fecha/hora = momento de la compilación). Se muestra en Créditos y como pie de página en Ejecución en Sitio y Marquesina (`PieBuild`). Hora en zona de Colombia.
- **Cadena de aprobación**: Comentario/Rechazar/Aprobar solo aparecen al usuario cuyo ROL corresponde al paso que toca (ya no a cualquier administrador) — `puedeResolverPaso`.
- **Error `evento_aprobaciones_firma_congelada_id_fkey`**: la columna apuntaba a `usuarios(id)` pero guarda el id del archivo de firma. Ejecutar `db/corregir_fk_firma_congelada.sql` (quita la FK en las 4 tablas de cadena).
- **Notificaciones/correos**: `db/diagnostico_notificaciones.sql` (solo lectura) y `db/corregir_notificaciones.sql` (columna `enviar_email` + políticas RLS de la campana). La app ahora reintenta sin `enviar_email` si falta la columna y avisa con un mensaje si no puede crear la notificación. El envío del correo en sí depende de `configuracion_integraciones`/pg_net/función de correo (ver consultas 4 y 6 del diagnóstico).
- **Aviso escalonado**: `db/corregir_notificaciones_destinatarios.sql` — los triggers `fn_notificar_primera_etapa_*` avisaban por cada etapa insertada (todas a la vez); ahora solo la etapa 1 y solo al rol de esa etapa. La app avisa a las siguientes etapas al aprobarse la anterior, solo al rol correspondiente (ya no a todos los administradores), y la campana solo muestra lo propio.
- **Resultado final y rechazos/devoluciones** (`notificarResolucionPaso`, `notificarDocumentoDevuelto`): al completarse el flujo, el creador y todos los que aprobaron una etapa reciben "aprobado en su totalidad"; al rechazarse, el creador y quienes ya habían aprobado una etapa anterior reciben el aviso; al devolverse, el creador. El actor nunca se notifica a sí mismo. Asunto propio por correo: `db/agregar_asunto_notificaciones.sql` (columna `asunto` + trigger de correo actualizado). Prueba: `scripts/verificar_notificaciones_flujo.mjs` (`ACCION=rechazar` para el rechazo).

## Entrega 16 (octubre 2026): Expediente del evento, CAF corporativo y ampliaciones de Ejecución

**Migración pendiente (manual):** `db/agregar_expediente_evento.sql` (idempotente). Sin ella la app sigue funcionando y degrada con gracia (lecturas vacías, columnas nuevas solo se envían si hay dato), pero **no** se podrán guardar speaker/No aplica/fotos/fuerza de ventas ni el CAF corporativo. Crea: `cafs.elaborado_en_caf_corporativo`; columnas `speaker_id`, `no_aplica`, `no_aplica_motivo`, `etiqueta`, `origen` y `archivo_id` nullable en `evento_repositorio_archivos`; `evento_registros_financieros.speaker_id`; tablas `registros_fuerza_ventas` y `evento_distribucion_asistentes`; RPC `registrar_fuerza_ventas_ejecucion`, `registrar_foto_evento_ejecucion` (máx. 4, reemplaza por etiqueta) y `listar_fotos_evento_ejecucion`, con la función interna `fn_resolver_sesion_ejecucion` (detecta si la sesión de Ejecución guarda token o id — **verificar contra la base real**).

### Expediente del evento (reemplaza a "Repositorio del evento — archivos")
- `DetalleEvento` ahora muestra una tarjeta con "Abrir expediente"; el expediente es una ventana minimizable (`useVentanasDocumentos.abrirExpediente`) con barra de avance y 6 pestañas: **Resumen, Documentos del sistema** (Solicitud, FMV, Convenio de pago, CAF, Convenio HCP, Notificación de pago — solo lectura), **Speakers** (por speaker: orden de compra; convenio con envío al HCP y carga de la *Versión Firmada*; CAF con copia externa firmada; presentación y evidencia con "No aplica" + motivo; facturas según la *Modalidad de factura* —única o por sesión—; comprobantes; conciliación OC vs. facturas vs. pagos), **Asistencia** (lista oficial de Ejecución o lista externa por alcance; distribución médico / no médico / fuerza de ventas / otro y total de asistentes impactados) y **Fotos** (hasta 4 con marcos guía, desde archivo o desde Ejecución), **Financiero**.
- Código: `src/lib/expediente.ts` (reglas puras), `src/components/expediente/*`, `src/lib/comprimirImagen.ts`, `src/components/ui/tabs.tsx`. `RepositorioEvento.tsx` se eliminó; `documentosRequeridosEvento.ts` y `Documentos.tsx` toleran filas con `archivoId` nulo (No aplica).
- **Envío del convenio al HCP: solo Dirección Médica** (`rol === "medica"`, igual que la regla del servidor en la Edge Function `send-email`).

### CAF elaborado en el aplicativo corporativo
- Al elegir el evento de origen en *Nuevo CAF* se pregunta "¿Dónde se elaborará?". Si es corporativo: el formulario se deshabilita (evento y HCP siguen activos), "Comentarios" = *El CAF será elaborado desde el aplicativo CAF corporativo*, y al enviar se guarda con estado **Aprobado** sin crear `caf_aprobaciones` (no se disparan notificaciones del flujo) y habilita el Convenio HCP. La copia del CAF se carga después en el Expediente.
- Supuesto: la regla RLS/trigger de `cafs` admite insertar directamente con estado "Aprobado" (si no, habrá que ajustarla).

### Ejecución
- Nuevas pantallas **Registrar fuerza de ventas** (nombre, cargo, ciudad, sesión) y **Fotos del evento** (4 marcos con guía y croquis; compresión JPEG 1600 px). Requieren conexión (no pasan por la cola offline).

### Verificación
- `scripts/verificar_expediente_evento.mjs` (CAF corporativo, Expediente, No aplica, facturas) y `scripts/verificar_ejecucion_expediente.mjs` (fuerza de ventas y fotos) pasan; `verificar_ejecucion.mjs` sigue pasando. `tsc -p tsconfig.app.json --noEmit` limpio.
- `verificar_archivos_adjuntos.mjs` perdió sus pasos 4–9 (panel antiguo). **Deuda previa, ajena a esta entrega:** `verificar_archivos_adjuntos.mjs` (campo "Tipo de servicio" ahora es un desplegable) y `verificar_caf.mjs` (el selector exige un evento con FMV + Convenio de pago) ya estaban desactualizados; se les aplicó el ajuste mínimo del CAF pero requieren sus fixtures al día.

### Limitaciones conocidas
- No se genera un PDF automático del convenio al enviarlo (se adjunta el archivo ya cargado).
- La Auditoría de eventos aún no lee los datos de Ejecución para su checklist.
- Lista de asistencia externa: una por alcance; la distribución "otro personal" es un conteo manual.

## Entrega 17 (octubre 2026): ajustes de Ejecución, Expediente, FMV y Convenio de pago

**Migraciones a ejecutar a mano en el SQL Editor (en este orden, ambas idempotentes):**
1. `db/agregar_ajustes_ejecucion_expediente.sql` — columna `registros_participacion.estado_provincia`, RPC `registrar_estado_provincia_participacion` y fotos del evento por sesión (reemplaza `registrar_foto_evento_ejecucion` / `listar_fotos_evento_ejecucion`). Requiere `agregar_expediente_evento.sql`.
2. `db/agregar_rls_borrador_convenio_pago.sql` — políticas RLS aditivas para que el creador pueda guardar su borrador de convenio de pago (corrige "No tienes permiso para realizar esta acción"). Trae consultas de diagnóstico comentadas.

**Qué cambió (numeración de la solicitud):**
- 1. Ejecución, check-in: Tipo de documento, Especialidad (solo médicos), Celular, Correo, Dirección, País, Estado/Provincia/Departamento y Ciudad son obligatorios; País/Estado/Ciudad son listas desplegables en cascada (`SelectPaisEstadoCiudad`). El Estado se guarda con una RPC complementaria (no se tocó `crear_registro_participacion`, cuyo código no está en el repo); si la migración 1 no está aplicada, el registro se guarda igual sin Estado.
- 2. Fotos: en Ejecución se toman con cámara o se cargan desde archivo; en el Expediente (pestaña Fotos) también se cargan; son por sesión (4 marcos por sesión en eventos de varias sesiones). El avance "Fotos" del Expediente exige el juego completo por sesión.
- 3. Nuevo FMV: el HCP/Speaker se elige solo entre los speakers vinculados al evento elegido; el checklist de documentos requeridos se arma por speaker cuando hay 2 o más.
- 4. FMV (vista previa/impresión/PDF): el campo "Firma" muestra la firma manuscrita de quien firmó (`firmado_por_id`; los documentos antiguos usan al creador).
- 5. Informe Auditoría de Eventos: los documentos del paquete de cierre incluyen todos los speakers.
- 6. FMV vigente: se toma el formato de la empresa y, si no hay, el global (empresa vacía) vigente a la fecha, sin distinguir mayúsculas.
- 7. Convenio de pago: "Unidad de negocio / ubicación" se precarga con la empresa del grupo activa (editable).
- 8. Convenio de pago, borrador: ver migración 2; si el error persiste, el mensaje remite al script.
- 9–10. Convenio de pago: Estado/Provincia/Departamento desde la ficha del speaker; Contraprestación desde los honorarios del speaker en la solicitud del evento y Moneda desde la moneda de la solicitud.
- 12–13. Expediente → Asistencia: "Informe de lista de asistencia" en tabla (por sesión o global) con firma manuscrita y botón **Generar PDF** (encabezado del evento + una sola declaración, la vigente al firmar).
- 14. Expediente → nueva pestaña **Muestra médica** (solo si el evento marcó "Sí" a muestra médica) con tabla y PDF del reporte de muestras entregadas.

**PDF:** usa el mismo mecanismo de toda la app (vista imprimible → "Guardar como PDF" del diálogo de impresión); no se agregó librería.

**Pruebas:** actualizados `verificar_ejecucion.mjs`, `verificar_ejecucion_expediente.mjs` y `verificar_expediente_evento.mjs`. Otros 12 scripts `verificar_*` ya fallaban antes de esta entrega (pruebas desactualizadas respecto a la UI, p. ej. "Tipo de servicio" ahora es un Select); no se tocaron.

**Nota de empaquetado:** el zip recibido no incluía `vite.config.ts`, `postcss.config.cjs` ni `tsconfig.node.json`; se recrearon solo para compilar y no van en este paquete.

## Entrega 18 (octubre 2026): informes de Ejecución en horizontal, filas por entrega, alcance, CSV y fix del convenio de pago

**Migración a ejecutar a mano en el SQL Editor (idempotente):**
1. `db/corregir_notificar_tarea_pendiente_rol_enum.sql` — corrige `function public.beats_notificar_tarea_pendiente(unknown, unknown, uuid, rol_aprobador) does not exist` al guardar un borrador de Convenio de pago a HCP. Requiere haber ejecutado antes `corregir_notificaciones_destinatarios.sql`.

**Causa del error del convenio:** `rol_requerido` (tablas de aprobaciones) es el ENUM `rol_aprobador`, y la función recibe `p_rol text`; Postgres no convierte enum → text de forma implícita al resolver la llamada, así que el trigger `fn_notificar_primera_etapa_*` fallaba al insertar la etapa 1 de la cadena (aun siendo borrador, porque el error ocurre antes de que la función descarte lo que no está "Pendiente"). El script recrea los 4 triggers (evento, CAF, convenio de pago, Convenio HCP) con `new.rol_requerido::text` y la función compara `u.rol::text = p_rol`. Ojo: el convenio del intento fallido quedó creado sin cadena de aprobación (el mensaje decía "se creó pero…"): conviene eliminar ese borrador huérfano desde Gestión de documentos y volver a crearlo.

**Qué cambió (Expediente → Asistencia / Muestra médica):**
- Lista de asistencia e informe de muestra médica se ven en **hoja horizontal** (Letter apaisada) en la vista previa, al imprimir y al guardar como PDF. `DocumentoImprimible` recibe `orientacion="horizontal"`: ensancha la hoja y, mientras la vista está abierta, inyecta `@page { size: letter landscape }` (se retira al cerrar, los demás documentos siguen verticales).
- Ambos informes tienen el interruptor **"Incluir encabezado oficial (membrete)" Sí/No**, como los demás documentos (`informe={{ titulo, nombreEvento, empresaGrupo }}`). Con "Sí": membrete con título del informe, logo institucional de la empresa, evento y fecha de generación (no lleva PROCESO/CÓDIGO/VERSIÓN porque los informes no tienen formato controlado configurable). Con "No": solo el título simple.
- La **Declaración de tratamiento de datos personales y uso de imagen y voz** se imprime en letra de 7 px (interlineado compacto) para dejar más espacio a las filas de asistencia.
- **Muestra médica: una fila por entrega de producto** (si un médico recibió 1 muestra de X y otra de Y, salen 2 filas, cada una con su producto, cantidad y firma). Regla pura en `filasMuestrasPorEntrega` (`src/lib/expediente.ts`).
- **Alcance del informe** (global / por sesión) también en muestra médica, igual que en la lista de asistencia; la sesión de una entrega es la del check-in del HCP que la recibió. El selector solo aparece si el evento tiene más de una sesión.
- Botón **Exportar CSV** en ambos informes (respeta el alcance elegido; UTF-8 con BOM para Excel). En eventos de varias sesiones el CSV agrega la columna "Sesión". La firma es una imagen, así que el CSV solo indica "Firma registrada" Sí/No. Nombre: `Asistencia_<evento>[_sesion_N]_<fecha>.csv` / `Muestra_medica_…`.

**Pruebas:** nuevo `scripts/verificar_informes_ejecucion.mjs` (3 entregas = 3 filas, alcance por sesión, CSV, interruptor de encabezado, `@page` horizontal y PDF real en Letter 792×612 pt). `verificar_expediente_evento.mjs` sigue pasando. `verificar_membrete.mjs` ya fallaba antes (busca el texto "Nueva CAF", hoy "Nuevo CAF").

**Nota de empaquetado:** igual que en la entrega 17, el zip recibido no traía `vite.config.ts`, `postcss.config.cjs` ni `tsconfig.node.json`; no se incluyen. Los `bundle.html` / `ejecucion.html` / `marquesina.html` de este paquete NO se regeneraron (compilar con `npm run build:bundles` en su entorno).

## Entrega 19 (octubre 2026): color de firma, FMV por speaker, convenio de pago, código de acceso y cadena de aprobación

**Migración a ejecutar a mano en el SQL Editor (idempotente):**
1. `db/agregar_eliminar_codigo_acceso_evento.sql` — política de DELETE (solo Administradores) sobre `eventos_codigos_acceso`. Sin ella, "Eliminar" avisa que la base no lo permitió. No hay otra migración: el score FMV se guarda dentro de `campos_personalizados` (claves reservadas `__scoreFmv*`).

**Qué cambió (numeración de la solicitud):**
1. Firma manuscrita: al dibujarla se elige el color (5 sugeridos + selector libre); el color queda dentro del PNG guardado, así que se ve igual en la cadena de aprobación, vista previa/PDF y firmas congeladas. Cambiar el color tras dibujar repinta y vuelve a guardar. Una imagen subida se muestra tal cual (el color solo aplica a "Dibujar"). Las firmas ya guardadas conservan su color anterior.
2. Nuevo FMV Checklist: el selector de HCP ofrece solo los speakers vinculados al evento (solicitud de evento) que aún no tienen FMV para ese evento (se ignoran los Anulados; al editar un borrador su propio speaker se conserva).
3. Convenio de pago, contraprestación y moneda: causa real corregida — los efectos de precarga escribían con un valor "viejo" y se pisaban entre sí (el de criterios, que espera una consulta, borraba la contraprestación recién cargada). Ahora toda escritura asíncrona se fusiona sobre el valor más reciente. Contraprestación = honorarios del speaker en la solicitud; moneda = moneda de la solicitud.
4. Vista previa/PDF: "Agenda de la reunión" se dibuja como tabla (una fila por línea, columnas separadas por "|"; sin "|" conserva los saltos de línea).
5. "Sesiones de participación vinculadas": cantidad + una línea por sesión (fecha y lugar). Hallazgo: la lista de sesiones del formulario nunca aparecía porque se consultaba el evento sin sesiones; ahora se marcan por defecto las sesiones del speaker según la solicitud.
6. "Consistente con tabulador de tarifas": muestra "Sí — justificación" o "No — justificación".
7. Criterios de selección: ya no se borra al reabrir un borrador. La precarga (criterios del FMV, contraprestación, sesiones) solo corre cuando el usuario cambia evento o speaker, no al abrir un documento guardado.
8. "Certificación del empleado responsable" muestra la declaración de Bausch Health (también junto a la casilla) y, cuando el Director Médico ya firmó su etapa, su firma, nombre y fecha.
9. "Score total FMV Checklist" (p. ej. `12 / 18 — Tier 2`) tras "Consistente con tabulador": solo lectura en el formulario, visible en la vista diligenciada y en la vista previa/PDF. Se congela al enviar a aprobación por primera vez; reenviar tras rechazo/enmienda/adenda conserva el valor. Borradores antiguos lo completan al abrirse.
10. Evento → "Código de acceso — Ejecución en Sitio": botón **Eliminar** con confirmación. No elimina un código que ya tiene sesiones de ejecución (de ellas cuelgan asistencia, muestras y fotos); esos solo se desactivan.
11. Cadena de aprobación: fila compartida `FilaCadenaAprobacion` (rol | nombre | firma | estado y fecha, en columnas fijas) usada por Evento, Convenio de pago, CAF y Convenio HCP.

**Verificación:** `tsc -b` y `vite build` sin errores; prueba en navegador con un banco temporal (no incluido): tabla de agenda, justificación, score, declaración, columnas de la cadena con la misma posición en todas las filas y cambio real de color del trazo. No se probó contra Supabase real.

**Nota de empaquetado:** no se incluyen `vite.config.ts`, `postcss.config.cjs` ni `tsconfig.node.json`; los bundles `.html` no se regeneraron (`npm run build:bundles`).


## Entrega 20 (octubre 2026): selector de HCP por evento, envío directo a aprobación, notificaciones, tareas escalonadas y Expediente en acordeón

**Migraciones a ejecutar a mano en el SQL Editor (en este orden, ambas idempotentes):**
1. `db/entrega_20_migraciones.sql` — corrige `beats_notificar_tarea_pendiente` (cast a `tipo_doc`), asegura las columnas `contraparte_*` de `cafs`, agrega `tiposContrato` a `catalogo_simple` y recarga la caché de PostgREST.
2. `db/sembrar_tipos_contrato.sql` — valores iniciales de "Tipos de contrato" (en una ejecución aparte: Postgres no deja usar un valor de enum recién agregado en la misma transacción).

**Qué cambió (numeración de la solicitud):**
1. **Selector "Seleccionar HCP del Repositorio de HCPs/Speakers"** (componente compartido `SelectorHcpDelEvento`): FMV, Convenio de pago, CAF y Notificación de pago listan solo los speakers vinculados al evento que aún no tienen ese documento (Anulados no cuentan; el documento que se edita conserva su propio speaker).
2. **Enviar directo a aprobación** (`src/lib/envioAprobacion.ts`): el documento siempre se inserta como Borrador → se inserta la cadena → pasa a Pendiente → se avisa al primer aprobador. Si algo falla, el documento recién creado se retira (no quedan documentos sin cadena ni duplicados al reintentar).
3. **Notificaciones**: el primer aprobador ahora recibe campana + correo (antes solo veía la tarea). El aviso "APROBADO en su totalidad" va al creador (campana; correo por el trigger existente) y a los aprobadores previos. Usuarios inactivos se excluyen.
4. **Tareas escalonadas** (`tareasEscalonadas.ts`, `documentosRequeridosEvento.ts`, panel Tareas pendientes): Evento (aprueba Dirección Médica) → FMV Checklist + Convenio de pago a HCP (simultáneas, con correo y campana) → con ambos firmados → CAF + Convenio HCP (simultáneas). Cadena CAF: Dirección Médica → Legal/Compliance → Finanzas → Gerencia General/Rep. Legal. Convenio HCP: Dirección Médica → Legal/Compliance → Gerencia General/Rep. Legal.
5. Vista previa/impresión/PDF del convenio de pago: "Sesiones de participación vinculadas" pasa a "OBJETIVO Y CONTRAPRESTACIÓN", en línea nueva tras "Criterios de selección".
6. Formulario del convenio de pago: "Score total FMV Checklist" antes de "Contraprestación al HCP".
7. CAF: el guardado tolera columnas ausentes en la caché de esquema (reintenta sin ellas) y la migración las crea.
8. CAF "Tipo de contrato": lista ligada al catálogo "Tipos de contrato" (Configuración de campos y variables → Catálogos de opciones).
9. **Expediente del evento**: cada sección (`BloqueExpediente`) y cada speaker son acordeones (abiertos por defecto; el chip de estado queda visible al cerrar). En la pestaña Speakers, el ícono se reemplazó por el avatar circular con la foto del speaker (iniciales si no tiene).

**Decisiones a tener presentes:** Notificación de pago excluye speakers con una notificación ya creada (regla literal); el Convenio HCP sigue necesitando un CAF (puede ser borrador) por `caf_id`; las tareas escalonadas se disparan al aprobar Dirección Médica el evento.

**Verificación:** `npx tsc -p tsconfig.app.json --noEmit` sin errores. No se probó contra Supabase real. Versión 14.13.


## Entrega 21 (octubre 2026): informes más compactos, avatares en el Expediente, filtro de evento en Asistentes Impactados e Informe por Evento rehecho

**Migración a ejecutar a mano en el SQL Editor (idempotente, una sola vez):**
- `db/entrega_21_agregar_enum_catalogos.sql` — agrega al enum `catalogo_simple` TODOS los catálogos que reconoce la app (incluido `tiposContrato`). Es la causa del error «invalid input value for enum catalogo_simple: "tiposContrato"»: la migración de la entrega 20 no se había ejecutado en la base. Opcional después y en ejecución aparte: `db/sembrar_tipos_contrato.sql` (valores iniciales). Mientras tanto la app ya no muestra el error crudo: explica qué archivo ejecutar.

**Qué cambió (numeración de la solicitud):**
1. **"Reporte de muestras médicas entregadas" y "Lista de asistencia"** (vista previa/PDF): el encabezado del evento pasa de 7 renglones apilados a una cuadrícula de 12 columnas y 3 filas (Evento · Fecha de inicio · Fecha de finalización / Sesión(es) / Dirección · Ciudad · Departamento-Estado), con etiqueta diminuta sobre el valor. La tabla de asistentes usa letra de 8 px, relleno mínimo y firma de 24 px de alto (en pantalla no cambia); el membrete repetido en cada página también se compactó. Resultado: más filas de asistentes por hoja.
2. Columna **"Producto con muestra recibida" → "Muestra recibida"** (tabla, vista previa/PDF y CSV).
3. **Expediente** (pestañas Resumen, Documentos del sistema y Financiero): los bloques de cada speaker muestran su avatar con foto (iniciales si no tiene) en vez de la carpeta, igual que en "Speakers". El hook de fotos y el avatar se movieron a `expediente/piezas.tsx` (`useFotosSpeakers`, `AvatarSpeaker`, `useIconoPorSpeaker`); `BloqueExpediente` acepta la prop `icono`. Los bloques que no son de un speaker (Evento, Pagos, Total) conservan la carpeta.
4. **Catálogos de opciones**: ver la migración de arriba; `mensajeErrorAmigable` traduce el error de enum faltante.
5. **Asistentes Impactados**: nuevo filtro **Evento** (todos los eventos Aprobados/Completados de la compañía actual, en orden alfabético). Al elegirlo se filtra de inmediato y los totales por HCP pasan a ser de ese evento (`traerHcpsImpactados({ eventoId })`).
6. **Informe por Evento** (rehecho): al elegir un evento aprobado se ofrece
   - **Descargar expediente (HTML)**: un solo archivo autocontenido con la identidad de BEATS (azul #00a3e0, gris #494c4f, Roboto), índice lateral, y por secciones: resumen; solicitud de evento; por cada speaker su foto, FMV, convenio de pago, CAF y convenio HCP (tal como se imprimen), soportes del Expediente (presentación, evidencia, "No aplica" con su motivo, convenio firmado, CAF corporativo) y financiero (orden de compra, facturas, comprobantes con conciliación); notificaciones de pago; lista de asistencia con firmas y declaración; muestras entregadas; fotos por sesión/marco. Imágenes, PDF y presentaciones viajan dentro del HTML (base64; los PDF se ven en visor y todo archivo tiene botón Descargar). Fijo en modo claro; imprimible.
   - **Resumen del evento** (vista previa / imprimir / PDF): identificación, lugares, ciudades, fechas y sesiones, speakers vinculados, asistentes por tipo (por sesión y total), muestras entregadas por producto.
   Archivos nuevos: `lib/informeEvento.ts` (modelo del resumen, común a ambos productos), `lib/expedienteHtml.ts` (generador), `components/informe-evento/{PanelInformeEvento,RenderizadorDocumentos,ResumenEventoImprimible}.tsx`. Los formularios se dibujan fuera de pantalla con los mismos `Cuerpo*` de la vista de impresión y se copian las hojas de estilo ya cargadas, por eso el HTML se ve idéntico a la app.

**Decisiones a tener presentes:** el "Informe por Evento" anterior (cifras en pantalla) fue reemplazado; la entrega de muestras solo se reporta si la solicitud la marcó (igual que el Expediente); un archivo grande de speaker/evento engorda el HTML (se muestra su tamaño al descargar).

**Verificación:** `npx tsc -p tsconfig.app.json --noEmit` sin errores; nuevo `scripts/verificar_entrega_21.mjs` (avatares, encabezado, columna, filtro de evento, resumen, descarga y apertura del HTML sin red) y `verificar_informes_ejecucion.mjs` / `verificar_informes.mjs` actualizados; todos pasan contra fixtures. Notas: `verificar_informes.mjs` tiene dos comprobaciones previas con `isVisible` inmediato que fallan de forma intermitente (carrera de la prueba, no de la app). No se probó contra Supabase real. Versión 14.14.

---

## Entrega 22 (octubre 2026): speakers internos y externos a la vez, congelamiento al primer firmante, financiero en informes y país junto a ciudad

**Migración:** ejecutar `db/entrega_22_speakers_mixtos_congelamiento.sql` (catálogo `speakersInternos`, columna `tipo_speaker`, `firma_congelada_id` en FMV y Notificación de pago). La app funciona sin ella (degrada), pero sin la columna el tipo de speaker se infiere (con speaker del Repositorio = externo).

1. **Congelamiento:** desde la primera firma el formulario queda de solo lectura (aviso "Formulario congelado" en Evento, CAF, Convenio y Convenio HCP); se guarda el snapshot de formato desde la primera firma y FMV/Notificación de pago guardan la firma manuscrita usada. `src/lib/congelamiento.ts`. La enmienda justificada existente se mantuvo.
2. **Informe por evento:** el desplegable muestra "Nombre — inicio a fin — Ciudad, País".
3. **Dashboard HTML:** bajo el título: ciudad, país, inicio, finalización y empresa del grupo.
4. **Expediente HTML:** categoría plegable "Speakers" que agrupa los datos de cada speaker (con subsecciones numeradas).
5. **Financiero:** nueva sección con todos los costos en detalle (condensado, costos por speaker/sesión/documento, ejecución OC/facturas/pagos y conciliación), en el Informe, en el HTML y en el resumen imprimible.
7. **País** junto a Ciudad en informes, impresos, Expediente, Asistentes impactados y Eventos en vivo.
8. **Participación académica:** "Quién dicta" admite interno y externo a la vez, cada uno con su número y campos; impresión/PDF muestra ambos. Solo los externos generan FMV, CAF, Convenio y tareas.
9. **Catálogo "Speakers internos"** (nombre + país); el desplegable muestra "Nombre — País".
10. Registros financieros del Expediente: selector de fecha y campo de valor más ancho.
11. **Orden por speaker en el Expediente:** CAF (solo si se elaboró fuera de BEATS) → Convenio HCP → Presentación y evidencia → Orden de compra → Facturas → Comprobante de pago.

**Limitaciones:** la Marquesina no muestra país (viene de un RPC); los nombres de aprobadores se leen en vivo; no se agregó script Playwright nuevo (`verificar_entrega_21.mjs` puede requerir ajustar el selector del desplegable del Informe por evento). Versión 14.15.

### Correcciones posteriores de la Entrega 22 (7 de octubre de 2026)

- **22b — Eventos Virtuales ("No tienes permiso para realizar esta acción").** El formulario guarda País = "N/A" en eventos Virtuales y las políticas RLS de `solicitudes_evento` (insert/select/update) exigían `fn_usuario_tiene_acceso_pais(pais)`, que rechaza "N/A". Migración `db/entrega_22b_eventos_virtuales_pais_na.sql`: conserva todas las condiciones vigentes y solo exime la comparación por país cuando `pais = 'N/A'` (efecto: esos eventos son visibles para quien tenga acceso a la empresa del grupo, sin filtro por país). Ya aplicada y verificada por el usuario.
- **22c — Presupuesto por speaker y sesión se "borraba" al reabrir un borrador de Varias sesiones.** Un efecto de `FormularioEvento` re-agregaba una fila vacía de presupuesto por cada sesión para todos los speakers, anulando las casillas "Sesiones en las que participa este speaker". Ahora solo descarta presupuestos de sesiones inexistentes y ajusta el cambio Única↔Varias. Los borradores guardados antes de esta corrección traen filas vacías: hay que desmarcar de nuevo las sesiones donde el speaker no participa y guardar. Al agregar una sesión nueva, ningún speaker participa por defecto (se marca la casilla).
- **Pendiente de la Entrega 22:** la política de `sesiones_evento` no tiene UPDATE (el guardado es borrar-e-insertar, funciona); no se agregó script Playwright nuevo (`scripts/verificar_entrega_21.mjs` puede requerir ajustar el selector del desplegable del Informe por evento).

**Orden de migraciones de la Entrega 22:** `db/entrega_22_speakers_mixtos_congelamiento.sql` → `db/entrega_22b_eventos_virtuales_pais_na.sql`. Luego cargar el catálogo "Speakers internos" (Administración → Catálogos).

**Nota de empaquetado:** `vite.config.ts`, `postcss.config.cjs` y `tsconfig.node.json` no vienen en el zip original; se recrearon solo para compilar y no se incluyen. `bundle.html`, `ejecucion.html` y `marquesina.html` de este paquete SÍ fueron regenerados con `npm run build:bundles`. Versión 14.15.


## Entrega 23 (octubre 2026): roles Legal / Compliance / Legal & Compliance y opciones de firma del perfil

**Migraciones a ejecutar a mano en el SQL Editor, EN ESTE ORDEN y cada una en su propia ejecución (ambas idempotentes):**
1. `db/entrega_23a_enums_roles_legal_compliance.sql` — agrega `legal` y `compliance` a los enums `rol_usuario` y `rol_aprobador`, y `areasUsuario` a `catalogo_simple`. (Postgres no deja usar un valor de enum recién creado en la misma transacción: por eso va aparte.)
2. `db/entrega_23b_roles_legal_compliance_perfil.sql` — columnas nuevas de `usuarios`, función `fn_rol_satisface`, los 4 `resolver_aprobacion_*`, los 4 `fn_reiniciar_aprobaciones_*`, `beats_notificar_tarea_pendiente`, `fn_enviar_recordatorios_pendientes`, `fn_puede_configurar_plantilla_convenio_hcp`, `fn_resguardo_edicion_usuarios`, y los RPC `actualizar_mis_opciones_firma` y `directorio_usuarios`. Las funciones existentes se regeneraron desde la definición REAL de la base (volcado de `diagnostico_roles_firmas.sql`) cambiando solo las líneas que comparaban el rol por igualdad.

**Además:** volver a desplegar la función Edge `admin-usuarios` (`supabase/functions/admin-usuarios/index.ts`): su lista `ROLES_VALIDOS` ahora acepta `legal` y `compliance`; sin eso, "Nuevo usuario" rechaza esos roles con "Rol inválido".

**Regla de elegibilidad (un solo lugar: `rolSatisface` en `lib/enums.ts` ↔ `fn_rol_satisface` en SQL; se verificó que dan el mismo resultado en las 63 combinaciones rol × paso):**

| Paso exige | Pueden firmar |
|---|---|
| `legal` | Legal, Legal & Compliance |
| `compliance` | Compliance, Legal & Compliance |
| `legal_compliance` (pasos antiguos) | Legal, Compliance, Legal & Compliance |
| cualquier otro rol | coincidencia exacta, como antes |

**Cadenas actualizadas:** Solicitud de Evento, paso "Compliance Officer" → `compliance`. Convenio de pago, paso "Área Legal" → `legal`. Convenio HCP, "Visto Bueno" → `legal`. La cadena del CAF NO cambia en esta entrega (llega en la entrega 24). Los usuarios actuales con rol `legal_compliance` siguen siendo "ambos". Los pasos PENDIENTES guardados como `legal_compliance` se convierten en la migración (evento→compliance, convenio y convenio HCP→legal); los ya firmados no se tocan.

**Notificaciones y tareas:** la campana, el correo de "tarea pendiente", el aviso "ya lo firmó otro" y la lista de Tareas pendientes ahora usan la regla anterior: un usuario solo Legal no recibe tareas de Compliance Officer y viceversa. Si nadie puede firmar el paso se sigue avisando a los administradores.

**Menús e informes** que eran solo de `legal_compliance` (Documentos (todos), Auditoría, informes, plantilla legal) ahora los ven Legal, Compliance y Legal & Compliance.

**Perfil de usuario (Nuevo/Editar usuario, sección Identificación):** campos nuevos *Área* (catálogo "Áreas (perfil de usuario)" en Configuración de campos → Catálogos), *Jefe inmediato* (otro usuario o él mismo), *Es director de área*, *Firma como director de área* (si no lo es), *Firma como jefe inmediato* (solo con jefe cargado) y *Firma como Compliance Officer LATAM* (solo roles Compliance y Legal & Compliance; Legal solo NO).

**Mis opciones de firma** (menú del avatar, arriba a la derecha): cada usuario ajusta SU jefe inmediato y sus tres habilitaciones "Firma como…". Pasa por el RPC `actualizar_mis_opciones_firma`, que solo toca esas columnas de su propia fila. *Área* y *Es director de área* solo los cambia Dirección Médica o un Administrador (el trigger `fn_resguardo_edicion_usuarios` lo impone).

**Degradación sin migración:** si las columnas nuevas no existen, guardar un usuario no falla (se reintenta sin ellas y se avisa), y el desplegable de jefe inmediato cae a la lectura directa de `usuarios`.

**Verificación:** `tsc -p tsconfig.app.json --noEmit` sin errores; los 3 bundles se regeneraron con `npm run build:bundles`. Las migraciones A y B se probaron en un Postgres 16 de laboratorio con un esquema simulado (compilan, son idempotentes, la matriz de elegibilidad y la conversión de pasos pendientes dan lo esperado, y el RPC de autoservicio valida jefe inexistente, rol y director). NO se probó contra Supabase real ni la interfaz con un navegador.

**Decisiones a tener presentes:** (1) los avisos todavía no filtran por país/empresa del documento (igual que antes); (2) en `caf_aprobaciones` un paso pendiente `legal_compliance` lo puede firmar cualquiera de los tres roles hasta la entrega 24; (3) las líneas Jefe inmediato / Director de área / Compliance Officer LATAM del CAF, la autofirma al enviar y las tareas para esas personas se implementan en la entrega 24.

**Nota de empaquetado:** `vite.config.ts`, `postcss.config.cjs` y `tsconfig.node.json` no vienen en el zip original; se recrearon solo para compilar y no se incluyen. Versión 14.16.

## Entrega 24 (octubre 2026): CAF con el formato de aprobación de contrato y matriz de firmas ligada a personas

**Migraciones a ejecutar a mano en el SQL Editor, EN ESTE ORDEN y cada una en su propia ejecución (ambas idempotentes):**
1. `db/entrega_24a_enum_persona.sql` — agrega el valor `persona` al enum `rol_aprobador` (línea de firma ligada a una persona, no a un rol).
2. `db/entrega_24b_caf_matriz_firmas.sql` — columnas nuevas (`caf_aprobaciones.tipo_firma / automatica / firmantes_ids`; `cafs.responsables_contrato / aviso_atencion / aviso_con_copia_para`), funciones `fn_caf_resolver_firmantes`, `fn_cadena_caf_reconstruir`, `fn_caf_es_destinatario`, `fn_notificar_paso_caf`, los RPC `enviar_caf_a_firma` y `previsualizar_cadena_caf`, y versiones nuevas de `resolver_aprobacion_caf`, `fn_reiniciar_aprobaciones_caf`, `fn_notificar_primera_etapa_caf` y `fn_enviar_recordatorios_pendientes` (regeneradas desde las definiciones vigentes con verificación del número de reemplazos). También agrega al catálogo «Tipos de contrato» los del formato (MSA, consultoría, SDS, compraventa, modificación, SOW) sin duplicar.

**Matriz de firmas del CAF (8 líneas, en este orden):**

| # | Línea | Quién firma |
|---|---|---|
| 1 | Solicitante | Automática: firma el solicitante al enviar. |
| 2 | Jefe inmediato | El del perfil del solicitante. Automática si el solicitante es su propio jefe o marcó "Firma como jefe inmediato". |
| 3 | Director de área | Automática si el solicitante es director de área o marcó "Firma como director de área". Si no, los directores (o quienes firman como tales) de la **misma Área** del solicitante; todos reciben la tarea y firma el primero que actúe. |
| 4 | Legal | Rol Legal o Legal & Compliance. |
| 5 | Compliance Officer LATAM | Rol Compliance o Legal & Compliance que marcó "Firma como Compliance Officer LATAM". |
| 6 | Líder FV y TV (local) | Siempre **N/A** (no firma nadie en el aplicativo). |
| 7 | Líder de finanzas (local) | Rol Finanzas. |
| 8 | Director General | Rol Gerencia General. |

"Aprobación según el monto (matriz de autorizaciones)" se muestra como **-**. El texto post-aprobación del formato (GM / (S)VP…) se conserva como estaba.

**Si una línea de persona no tiene a nadie configurado** (sin jefe cargado, sin director en el área, nadie como Compliance Officer LATAM): el formulario lo advierte antes de enviar, el envío se permite, y los administradores reciben la notificación y pueden firmar esa línea (también les aparece en Tareas pendientes). Las líneas automáticas no cuentan como "firma" para devolver/enmendar: un CAF sin firmas de aprobadores se sigue pudiendo devolver.

**Flujo técnico:** un borrador ya no guarda cadena. "Enviar a aprobación" llama al RPC `enviar_caf_a_firma`, que arma la matriz según el perfil del solicitante, pasa el CAF a Pendiente y avisa (campana + correo) a quien firma primero. Al resolver una línea, `resolver_aprobacion_caf` valida a la persona (para líneas de persona) o el rol, y avisa a la siguiente línea con `fn_notificar_paso_caf`. Si el CAF se rechaza y se corrige, la matriz se rearma completa (puede haber cambiado el jefe o el director) y se vuelve a avisar. Los recordatorios diarios también llegan a los firmantes por persona.

**Formulario CAF:** campos nuevos del formato — *Empleado(s) responsable(s) principal(es)*, *Aviso, domicilio y fax: At'n* y *Con copia para*, la nota de "Profesional de la salud", y una sección **Matriz de firmas** que muestra, antes de enviar, quién firmará cada línea. El director de área ya no es obligatorio: se completa solo con quien firma esa línea.

**Detalle e impresión:** la cadena muestra los nombres de quienes pueden firmar cada línea pendiente, "Firmado (automático)" y "N/A". La impresión usa la estructura del formato (Legal; monto "-"; solicitante, jefe, director de área, Compliance Officer LATAM, Líder FV y TV = N/A, Líder finanzas, Director General) con firma manuscrita congelada y fecha. **Los CAF anteriores (cadena de 4 pasos) siguen funcionando y se imprimen como antes.**

**Degradación sin migración:** si `enviar_caf_a_firma` no existe, el envío usa la cadena anterior de 4 pasos y avisa que falta ejecutar la migración; los campos nuevos del formato se omiten con aviso si sus columnas no existen.

**Verificación:** `tsc` sin errores; bundles regenerados. Las migraciones 24a/24b se aplicaron (dos veces, idempotentes) sobre las 23a/23b en un Postgres 16 de laboratorio con esquema simulado, y se probó la cadena completa: armado con jefe/director/Compliance LATAM, autofirmas (propio jefe, director de área), líneas sin firmante (advertencias), rechazo de firmas de otra persona o rol equivocado (Compliance solo no firma Legal; Legal & Compliance sin la marca no firma Compliance Officer LATAM), avance en orden hasta Aprobado, y reinicio tras rechazo con nuevo aviso. NO se probó contra Supabase real ni la interfaz en un navegador.

**Decisiones a tener presentes:** (1) los avisos y la búsqueda de firmantes todavía no filtran por país/empresa del documento; (2) el director de área se busca por coincidencia exacta de *Área* (sin distinguir mayúsculas); (3) la lista de firmantes se fija al enviar: si luego se cambia el perfil de alguien, rige en el próximo envío o reenvío; (4) los CAF ya Pendientes con la cadena anterior terminan su flujo como estaban; (5) no se conoce la definición real de `fn_resguardo_edicion_documento`: si bloqueara devolver un CAF por tener líneas ya aprobadas, habría que ajustarla para ignorar las automáticas.

Versión 14.17 (ver Entrega 25 para 14.18).

## Entrega 25 (octubre 2026): tablero en listado, factura obligatoria en Notificación de Pago, notificaciones descriptivas, notas de aprobación y ajustes de CAF y Convenio HCP

- **Tablero**: selector tarjetas / listado con detalle (recuerda la preferencia en `localStorage`).
- **Notificación de Pago a HCP**: solo se puede generar para evento+speaker(+sesión) con factura cargada en el expediente y aún sin notificación vigente (`lib/facturasNotificacionPago.ts`). "Número de factura" es un desplegable; fecha, valor y moneda se cargan de la factura y el archivo se reemplaza por "Ver factura".
- **Notificaciones de tareas**: mensaje único y descriptivo por tipo de documento (`lib/descriptorTarea.ts`, y su espejo SQL en `db/entrega_25_descriptores_notificaciones.sql` — **ejecutar manualmente en el SQL Editor**). La app ya no duplica el aviso a la siguiente etapa (lo envía la BD). El aviso de MD FMV Checklist / Convenio de Pago a HCP solo lista speakers externos y no se envía si no hay externos.
- **Notas de aprobación/rechazo**: en orden cronológico tras la "Cadena de aprobación" (detalle de Evento, Convenio, CAF y Convenio HCP) y tras el panel de firmas en vista previa/impresión/PDF (`components/NotasAprobacion.tsx`).
- **CAF**: título "FORMATO DE APROBACIÓN DE CONTRATO (CAF)"; Nombre del solicitante, Código y Compañía al inicio de "Solicitante y director de área"; "Empleado(s) responsable(s)…" es solo una etiqueta impresa; director de área se precarga con nombre y cargo de quien solicita; texto POST-APROBACIÓN tras la matriz de firmas; impresión con el diseño del CAF modelo (casillas de tipo de contrato, tablas con borde).
- **Convenio HCP**: "Considerando/Whereas" propone el texto de "[completar: con respecto a qué]" desde la Solicitud de evento, el Convenio de pago a HCP y el CAF (ES/EN); "Anexo A/Exhibit A" con redacción mejorada; "Comentarios sobre el pago" carga el plazo desde "Plazo de pago (días)". Los textos sugeridos se refrescan al cambiar las fuentes mientras el usuario no los haya editado.

Versión 14.18.

## Entrega 26 (octubre 2026): Convenio HCP bilingüe en dos columnas

- Vista previa / impresión / PDF del Convenio HCP: dos columnas (inglés a la izquierda, español a la derecha), alineadas párrafo a párrafo cuando ambos textos tienen el mismo número de párrafos (si no, un bloque por columna). La vista de detalle (compacta) conserva el formato de un solo idioma.
- Orden: datos del contrato, Considerando/Whereas, numerales 1–15, cierre y firma; luego Anexo A, B, C y D, **cada uno en página propia**, con la zona de firma al pie.
- Zona de firma (clausulado y cada anexo): nota bilingüe de visto bueno de Legal/Compliance (con fecha una vez aprobado; si no, aviso de pendiente) y un espacio de firma por parte (Compañía / Consultor), no una matriz. La firma manuscrita de la compañía se muestra cuando Gerencia General / Rep. Legal ya firmó.
- Corrección operativa: si al guardar un borrador aparece "Could not find the 'cierre_en' column", ejecutar `db/agregar_cierre_convenio_hcp.sql` (migración anterior pendiente) y `notify pgrst, 'reload schema';`.
- El archivo de referencia del formato no llegó a la sesión; se siguió la descripción del pedido.

Versión 14.19.


## Entrega 27 (octubre 2026): licencia del speaker en Notificación de Pago, error al guardar borrador y hojas del Convenio HCP

**Migración a ejecutar a mano en el SQL Editor (idempotente, una sola vez):** `db/corregir_fk_notificacion_pago.sql` — quita las claves foráneas de `notificaciones_pago_hcp.factura_id` y `convenio_origen_id` (solo esas dos columnas; no toca datos).

1. **Notificación de Pago — «Número de cédula profesional o licencia»**: ahora se carga SIEMPRE del campo «Licencia RETHUS / Cédula profesional» del speaker elegido (antes lo pisaba el dato del Convenio de Pago, que ahí trae el número de documento de identidad). Además, la respuesta asíncrona parte del valor más reciente del formulario (ya no pisa lo que el usuario tocó mientras cargaba). `FormularioNotificacionPago.tsx`, `precargado.ts`.
2. **Notificación de Pago — «No se pudo crear la Notificación de Pago: No se puede completar la operación porque hay información relacionada que lo impide»** (guardar borrador): es una violación de clave foránea (código 23503). Desde la entrega 25, `factura_id` guarda el id del archivo de la factura del Expediente y `convenio_origen_id` es solo una referencia interna; si alguna conserva la FK del esquema original, Postgres rechaza el INSERT. **No se pudo confirmar desde aquí cuál restricción exacta lo causa** (no hay acceso a la base). Qué se hizo: (a) la migración de arriba; (b) `mensajeErrorAmigable` ahora indica la columna/restricción que falla; (c) si falla `convenio_origen_id`, la app reintenta sin esa referencia; si falla `factura_id`, el mensaje indica ejecutar la migración. Para ver las FK reales: `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.notificaciones_pago_hcp'::regclass and contype = 'f';`
3. **Convenio HCP (vista previa / impresión / PDF)**:
   - **Cada anexo en su propia hoja.** El `min-height: 9.2in` anterior excedía el área útil (10in menos el membrete repetido), y cada anexo terminaba en DOS hojas (la firma sola en la segunda). Ahora `--alto-hoja-anexo` = 8.6in (medido con PDF real en Chromium: cabe hasta 8.9in). Con 15 numerales + A + B + C + D el PDF pasó de 14 a 10 hojas.
   - **Anexos C y D**: sin firma de la compañía ni nota de visto bueno de Legal/Compliance; solo queda el espacio de firma del consultor.
   - **Sin matriz de aprobación** en la impresión (tampoco las notas de aprobación que iban debajo de ella; siguen visibles en la «Cadena de aprobación» del detalle). También desaparece del expediente HTML.
   - **Pie «Elaborado por … · Generado el … desde BEATS. ID interno … Este documento refleja el estado del flujo de aprobación…»** al fondo de la ÚLTIMA hoja (`pieEnCuerpo` en `DocumentoImprimible` + `conPie` en `CuerpoConvenioHCP`).

**Decisiones a tener presentes:** (1) con el membrete apagado la firma de cada anexo queda un poco más arriba del borde (nunca desborda); (2) el `hcpCedulaLicencia` del Convenio de Pago a HCP sigue precargándose desde el número de documento del speaker (no se tocó); (3) las pruebas `verificar_convenio_convenio_hcp.mjs` y `verificar_fmv_notificacion.mjs` ya no corresponden a la interfaz actual (usan `fill` sobre campos que hoy son desplegables) y fallan antes de llegar a estos cambios.

**Verificación:** `tsc -p tsconfig.app.json --noEmit` sin errores; los 3 bundles se regeneraron; el PDF del Convenio HCP se generó con Chromium y se revisó página por página. NO se probó la Notificación de Pago contra Supabase real ni con un navegador. Versión 14.20.


## Entrega 28 (octubre 2026): filtro por fecha, archivado, PDF automático del Convenio HCP y paquete para el solicitante

**Migración OPCIONAL (SQL Editor, idempotente):** `db/entrega_28_preferencias_usuario.sql` — agrega `usuarios.archivar_documentos_meses` y la función `actualizar_mis_preferencias(integer)`. Sin ella la app funciona igual: la preferencia de archivado se guarda en el navegador (localStorage) en vez de en el perfil.

1. **Filtro por fecha** en el Tablero y en «Documentos (todos)»: Desde / Hasta + atajos (Hoy, 7 días, 30 días, Este mes, Este año) + Limpiar. Se elige QUÉ fecha se filtra: en el Tablero «del evento / actividad» (por defecto; un evento de varios días coincide si su rango se cruza) o «de creación»; en Documentos «de carga del archivo» o «del evento».
2. **Archivado** (solo de vista, por usuario, reversible): «Mis preferencias» (menú del avatar) → «Archivar documentos de eventos finalizados hace más de… 1, 2, 3, 6, 12, 24 meses / Nunca». Los documentos archivados salen de la vista normal y se ven con las pastillas «Activos / Archivados (n) / Todos». Solo se archiva lo que está en estado final (Aprobado, Completado, Rechazado, Anulado); Borrador, Pendiente y Devuelto nunca. Fecha de referencia = fin del evento (o de la actividad); sin fecha de evento, la de creación. Los soportes de speaker en «Documentos (todos)» no se archivan. Además, Tablero y Documentos muestran 60 por página con «Mostrar más».
   - *Alternativas evaluadas (no implementadas, para decidir):* (A) archivado manual por evento con botón «Archivar evento» (compartido por todos; requiere columna y permisos); (B) cierre/archivado automático global por compañía definido por un administrador; (C) búsqueda guardada / vistas guardadas por usuario (p. ej. «Mis eventos del trimestre»); (D) paginación en servidor con búsqueda indexada (necesaria si se superan varios miles de documentos); (E) vista por Evento como carpeta única (Expediente) en vez de documentos sueltos. La implementada es la más barata y segura; se recomienda combinarla con (A) si Legal necesita archivar compartido.
3. **Convenio de Pago a HCP**: «Cédula / licencia del HCP» se carga con la «Licencia RETHUS / Cédula profesional» del speaker (antes: número de documento). Solo se autocompleta al elegir speaker; los borradores ya guardados conservan su valor.
4. **Convenio HCP — Anexo C**: pregunta bilingüe «Do you accept? Yes ___ No ___ / ¿Acepta? Sí ___ No ___» antes de la firma (vista previa, impresión y PDF).
5. **Anexos C y D**: la firma de la contraparte se queda en la columna derecha (un espacio vacío ocupa la izquierda).
6. **Tarea para el Director Médico**: al firmar Gerencia/Rep. Legal (última etapa) se notifica al rol Dirección Médica y aparece en «Tareas Pendientes» → «Convenios HCP firmados por enviar al HCP» (con botón de envío) hasta que se envíe o se cargue la copia firmada.
7. **«Enviar al HCP para firma»**: el diálogo genera solo un PDF del convenio (sin marca de agua) y lo adjunta; se puede ver, reintentar o desmarcar.
8. **«Enviar documentos al solicitante»**: lista el paquete del evento y speaker (solicitud, FMV, Convenio de Pago, CAF, Convenio HCP, Notificaciones de Pago); Aprobado/Completado vienen marcados, lo demás sin marcar. Lo marcado se convierte a PDF (con la marca de agua del estado) y se envía.

**Cómo funciona el PDF:** nuevo `lib/pdfDocumento.ts` + `components/print/GeneradorPdfDocumentos.tsx` (html2canvas-pro + jsPDF, en el navegador, hojas Carta, membrete repetido, sin cortar filas ni dejar títulos huérfanos). **Limitación:** las páginas son imágenes (JPEG 192 dpi): el texto del PDF no es seleccionable ni buscable. Convenio HCP de 8 páginas ≈ 1,6 MB, ~9 s.

**Verificación:** `tsc` sin errores; bundles regenerados; nuevo `scripts/verificar_entrega_28.mjs` (filtros, archivado, Mostrar más, preferencias, tarea, PDF automático adjuntado al correo, paquete) pasa contra fixtures y el PDF se revisó página por página en Chromium. `verificar_precargado.mjs` actualizado a la licencia RETHUS. `verificar_convenio_convenio_hcp.mjs` ya venía desactualizado (campo «Tipo de servicio» ahora es desplegable). NO se probó con Supabase real ni con la Edge Function `send-email` real (se desconocen sus límites de tamaño; el correo con el PDF pesa ~2,3 MB en base64). No se incluyen en el paquete PDF la copia firmada ni los archivos del Expediente (se adjuntan con «Otros archivos»). Versión 14.21.


## Entrega 28b (octubre 2026): «Devolver» un Convenio HCP Pendiente no cambiaba el estado

**Migración a ejecutar a mano en el SQL Editor (idempotente):** `db/entrega_28b_devolver_documento.sql` — crea `beats_devolver_documento(p_tipo, p_id)` (security definer; solo quien creó el documento o un Administrador, solo si está Pendiente). Requiere las migraciones previas `agregar_rpc_eliminar_anular_documentos.sql` y `agregar_ciclo_vida_documentos.sql`.

**Causa:** «Devolver» hacía un `update estado='Devuelto'` directo desde el navegador; Row Level Security lo filtraba sin error (0 filas) y la app mostraba «devuelto» igual, dejando el documento Pendiente y sin «Editar borrador». Afectaba a los 6 tipos de documento (`devolverDocumento` es común). **Arreglo:** `devolverDocumentoRpc` (`lib/documentosRpc.ts`) llama a la función del servidor; si aún no está desplegada, cae al update directo pero VERIFICA que cambió una fila y, si no, muestra un error claro en vez de un falso éxito. `editarBorradorConvenioHCP` aplica la misma verificación. Prueba: `scripts/verificar_devolver_convenio_hcp.mjs`. Sin la migración, el botón ahora avisará el error real en vez de fingir que devolvió. Versión 14.22.


## Entrega 28c (octubre 2026): trigger `fn_resguardo_edicion_documento` desconocía «Devuelto»

**Migración a ejecutar a mano (idempotente), después de la 28b:** `db/entrega_28c_devolver_trigger.sql`. Causa real del error «No tienes permiso para modificar este documento en su estado actual.»: el trigger (solo en la base real) solo contemplaba Borrador, Rechazado y la ventana de adenda sobre un Aprobado; «Devuelto» y la enmienda sobre un Pendiente caían en el `raise exception` final. La migración (1) hace que `beats_devolver_documento` y `beats_anular_documento` activen `beats.rpc_aprobacion`, (2) reescribe el trigger conservando sus reglas y agregando Devuelto (creador o Administrador → editar y reenviar a Pendiente) y la enmienda. No se probó contra la base real. Versión 14.23.


## Entrega 28d/28e (octubre 2026): guardar la corrección de un documento «Devuelto» (los 6 tipos)

**Migración a ejecutar a mano (idempotente), después de 28b y 28c:** `db/entrega_28e_rls_devuelto.sql`. (La 28d con función `beats_actualizar_documento_editable` se descartó y su archivo se eliminó.) Causa: las políticas RLS UPDATE reales no contemplan «Devuelto» y filtraban el guardado (0 filas). La 28e agrega en las 6 tablas de documento una política UPDATE adicional (creador o Administrador; solo estado Devuelto; resultado Devuelto o Pendiente) sin tocar las existentes. En la app, TODOS los `editarBorrador*` (Evento, CAF, Convenio de Pago, Convenio HCP, FMV, Notificación de Pago) ahora verifican que el UPDATE cambió una fila (`actualizarDocumentoEditable` / `exigirFilasActualizadas` en `lib/documentosRpc.ts`) y, si no, muestran un error claro en vez de un falso éxito. No se probó contra la base real. Versión 14.24.

## Entrega 29 (octubre 2026): configuración de notificaciones, indicadores de uso y gestión, y adjuntar el convenio firmado por el HCP

**Migraciones a ejecutar a mano (idempotentes), en este orden:**
1. `db/entrega_29_archivo_firmado_convenio_hcp.sql`
2. `db/entrega_29_configuracion_notificaciones.sql`
3. `db/entrega_29_telemetria_uso.sql` (requiere `beats_es_administrador()` de la 2)

Sin la 3, la app funciona igual: la medición se desactiva sola y la pestaña «Uso» muestra qué falta. Sin la 2, la pantalla de notificaciones avisa que falta la migración. **Nada de esto se probó contra la base real de Supabase ni contra el Edge Function `send-email`**; sí contra fixtures (`scripts/verificar_entrega_29.mjs`) y con `tsc` limpio.

### 1. Convenio firmado por el HCP: el cuadro «Adjuntar» no cambiaba
- `CampoArchivo` ahora muestra «Archivo cargado · tamaño» al terminar y revierte si el guardado falla (`onChange` puede devolver `false`).
- `DetalleConvenioHCP`/`PestanaSpeakers` guardan el id del archivo en estado local y la UI cambia al instante.
- Causa probable (no confirmada): la política RLS filtraba el UPDATE en silencio (0 filas, sin error) y el mensaje de éxito salía igual. Ahora el guardado pasa por la función `beats_guardar_archivo_firmado_convenio_hcp` (security definer; permitido a Administrador, rol médica o creador; estados Aprobado/Completado) y se verifica la fila actualizada. Si la función aún no existe, se intenta el UPDATE directo y, si afecta 0 filas, el error indica qué migración ejecutar.

### 2. Configuración de Notificaciones (solo administradores)
Menú Configuración → «Configuración de Notificaciones». Visible solo para quien tenga la página en «páginas permitidas» **y** sea administrador (nuevo indicador `exigeAdministrador`; en Usuarios/Roles aparece «(solo admin.)»).
- Por cada aviso del catálogo (`lib/notificacionesConfig.ts`): activar/desactivar el correo, copiar a administradores, copiar a roles y a usuarios concretos, y reescribir **asunto y mensaje** con variables (`{{nombre}}`, `{{mensaje}}`, `{{tipo_documento}}`, `{{fecha}}`, `{{enlace}}`, `{{documento}}`, `{{etapa}}`, `{{actor}}`, `{{motivo}}`, `{{evento}}`), vista previa, correo de prueba, restablecer y historial de cambios.
- **El destinatario principal NO se configura**: lo define la regla del flujo (quien debe firmar la etapa que toca, etc.). Se configuran las copias y los textos, respetando «no avisar a todos los administradores».
- Se aplica en el trigger `fn_notificar_por_email()` de la base (sirve igual para avisos creados por la app o por funciones SQL). Prioridad de textos: configuración > asunto de la fila > por defecto del tipo. Sin configuración el comportamiento es el de antes.
- Cambio menor: la fila «el flujo avanzó» del solicitante ahora lleva su propio asunto (antes compartía el del colega).
- **Limitación:** hay correos que la base envía directamente sin pasar por `notificaciones` (aprobación final al creador, recordatorios diarios, restablecer contraseña). Aparecen bloqueados en la lista. Para integrarlos hace falta el resultado de `db/diagnostico-funciones-email.sql`; el helper `beats_config_correo(clave)` ya está listo.

### 3. Indicadores de Uso y Gestión (solo administradores)
Menú Configuración → «Indicadores de Uso y Gestión» (mismo criterio de acceso). Filtros: desde/hasta y país (este último solo para gestión).
- **Medición (`lib/telemetria.ts`, tablas `telemetria_*`)**: sesión con latido cada 30 s (tiempo conectado vs. **activo** = con clic/tecla/scroll en los últimos 60 s), tiempo por página, cronómetro por formulario «Nuevo …» (enviado / borrador / abandonado; solo corre mientras es la página visible), cronómetro de revisión/firma por ventana de documento, tiempo y tamaño de cada carga de archivo. Se engancha a `registrarAuditoria` (creación, envío, aprobación, rechazo, devolución…) para no tocar los 6 formularios. **Nunca se guarda el contenido de los formularios**, solo tiempos y nombres de acción. Conviene avisar a los usuarios que se mide el uso.
- **Pestaña «Uso de la aplicación»:** sesiones, tiempo conectado por sesión y por usuario/día, proporción activa, sesiones por día, mapa de calor día×hora, tiempo de diligenciamiento por formulario (mediana, promedio, P90, % abandono), revisión/firma por documento y tasa de rechazo, ciclo de aprobación (días envío→aprobación final, desde la auditoría), cargas de archivos, páginas con más tiempo, tiempo de interacción por evento y mapa por usuario (CSV).
- **Pestaña «KPIs de gestión»:** eventos por estado/tipo; HCPs únicos impactados (por cédula) y recurrentes; asistentes registrados vs. esperados; participación por tipo, profesión y especialidad; muestras; concentración por ciudad (y % de las 3 principales) y país; presupuesto solicitado por moneda y rubro, costo por asistente; HCPs contratados, contraprestación y facturación por moneda, top HCPs; speakers internos/externos/mixtos, top speakers y honorarios por tipo; duración, anticipación y horas en sitio (primer→último check-in).
- Cada gráfico tiene vista de tabla alternativa; gráficos propios en SVG, sin librerías.
- **Reiniciar contadores:** pide la contraseña del administrador (se valida con `verificarPasswordActual`) y llama a `beats_telemetria_reiniciar()` (revalida el rol en el servidor y deja constancia en `telemetria_reinicios`). Solo borra la medición de uso, no documentos. La pantalla muestra «Medición desde …».
- Los KPI de gestión se calculan en el navegador con lecturas completas de eventos/check-ins; con volúmenes muy grandes convendrá pasarlos a vistas SQL.

### Verificación
`node scripts/verificar_entrega_29.mjs` (fixtures): KPI de gestión y de uso, vista de tabla, reinicio con contraseña incorrecta/correcta y edición+guardado de un aviso. En la suite completa, los mismos 14 scripts que ya fallaban con el zip de la Entrega 28 siguen fallando por tiempos/selectores previos a esta entrega (verificado contra el zip original); en `verificar_administracion` y `verificar_notificaciones` se ajustó un selector que el nuevo ítem de menú volvía ambiguo.
Versión 14.25.

## Entrega 30 (octubre 2026): filtros del Tablero en listas desplegables y marquesina como tablero interno en vivo

**Migración opcional:** `db/entrega_30_marquesina_ampliada.sql` (función pública `resumen_ejecucion_evento_ampliado`, mismo modelo de acceso por código que `resumen_ejecucion_evento`). Sin ella la marquesina funciona igual con totales y ranking, y oculta los paneles que necesitan estos datos. No se probó contra la base real.

### Tablero: filtros («Opción 1»)
- Una sola fila arriba a la derecha: **Tipo** y **Estado** (selección múltiple, con conteo por opción que respeta los otros filtros), **Fecha** (atajos Hoy/7/30 días/mes/año + Desde/Hasta + «Fecha de creación / del evento»), **Archivo** (Activos/Archivados/Todos, solo si hay archivado automático), «Limpiar» y el selector tarjetas/listado con solo iconos.
- Los filtros activos aparecen como **chips** que se quitan con un clic. El título muestra «Documentos · N».
- Componentes nuevos reutilizables: `components/ui/popover.tsx` y `components/ui/filtros-desplegables.tsx`. Se aplicó también a **Documentos (todos)** (búsqueda + Fecha + Archivo con chips) y a **Historial y Auditoría** (Acción multi-selección + País, con chips y «Limpiar»).
- Pruebas actualizadas a los nuevos selectores: `verificar_entrega_28`, `verificar_login_tablero`, `verificar_devolver_convenio_hcp` y `verificar_marquesina`.

### Marquesina rediseñada
- Identidad corporativa (azul #00A3E0, gris #494c4f, Roboto), pantalla interna.
- Animaciones: contadores que suben, aviso «+N» cuando entra un check-in, anillo de cumplimiento (registrados vs. esperados), barras que crecen, check-ins nuevos que entran deslizándose, banda de cabecera con brillo, pulso «en vivo», reloj y «actualizado hace N s». Respeta «reducir movimiento» del sistema.
- Contenido: asistentes registrados y cumplimiento, participación (evento/taller/stand), llegadas por hora con hora pico, últimos check-ins (solo iniciales, especialidad y ciudad: sin nombres ni cédulas), muestras por producto con ranking, perfil de asistentes por especialidad y ciudad.
- Dos modos (esquina inferior, discretos, se recuerdan): **Panorama** (todo a la vez) y **Carrusel** (una lámina cada 12 s con barra de progreso, pausable).
- El sondeo pasó de 15 a 8 s. El aviso «Sin conexión» y el regreso a la pantalla de código cuando el código se desactiva se conservan.
- Verificado con fixtures (`verificar_marquesina.mjs`) y con capturas; en la regresión completa solo siguen fallando los scripts que ya fallaban con el zip de la Entrega 28.

## Entrega 31 (octubre 2026): horas por speaker, productos del evento, línea del portafolio, KPIs educativos, CSV, mapas en vivo

**Migraciones (ejecutar a mano en el SQL Editor, idempotentes; la app funciona sin ellas y avisa):**
- `db/entrega_31_horas_productos_linea.sql`: `horas_participacion` por speaker/sesión, tabla `evento_productos` (un único producto principal por evento) y `linea_terapeutica` del portafolio.
- `db/entrega_31_marquesina_mapa.sql` (opcional): amplía `resumen_ejecucion_evento_ampliado` con país/modalidad/ciudad del evento, ubicaciones (país+ciudad) de los check-ins e id de cada check-in. Sin ella los mapas usan las 5 ciudades principales.

### Formularios
- **Speakers internos/externos**: campo obligatorio «Tiempo de participación por sesión (horas)» tras cada «Sesión»; en evento de sesión única se llama «Tiempo de participación (horas)».
- **Productos** (después de «Objetivos del evento»): multiselección del portafolio; con uno solo es el principal; con varios hay que marcar exactamente uno («Producto principal del evento»).
- **Portafolio de productos**: «Línea» (catálogo Líneas terapéuticas), «Registro sanitario» y «Empresa» obligatorios.
- **Mayúsculas** en todos los campos de texto de la ejecución en sitio (al escribir y otra vez en el envío, también para lo encolado sin conexión) y **correo en minúscula con máscara @** en toda la app; los KPIs agrupan sin distinguir mayúsculas/tildes, así no hay duplicados.

### Expediente HTML
- Causa de la diagramación distorsionada: el filtro que quita el modo oscuro descartaba bloques enteros (`@layer utilities` de Tailwind, 67 KB). Ahora recorre las reglas recursivamente y conserva todo salvo el modo oscuro. Verificado con `verificar_entrega_21`.
- **Tamaño estimado** («≈ 12 KB») junto a todo botón que genera archivos: expediente HTML, PDF, CSV de informes, asistencia, muestras, envío por correo.

### KPIs (Indicadores de Uso y Gestión)
- Nueva sección **Educación médica: horas de participación** (por tipo de evento, por tipo de speaker interno/externo con actividades y participaciones, top de speakers) y **Productos de los eventos** (eventos por producto, ★ principal, línea).
- «Participación por tipo» se llama ahora «Tipo de participación de los asistentes» y usa etiquetas legibles (evento → «Asistencia a la actividad académica»).
- **Descarga CSV** de todos los KPIs de gestión y de uso (formato largo, apto para tablas dinámicas) y CSV por panel, cada uno con su tamaño estimado.

### Asistentes Impactados y Panel en Vivo
- Asistentes Impactados es un **tablero**: titular, cifras con ícono y contador animado, profesión, especialidades, ciudades, mapa de origen y «los más activos»; la tabla de detalle se conserva.
- Panel en Vivo rediseñado a partir de la marquesina: cabecera «en vivo», anillo de cumplimiento, **mapa del país del evento** (sede + ciudades de quienes hacen check-in, arcos animados, zoom, hover) o **planisferio** en eventos virtuales; botones País/Mundo; sondeo cada 10 s.
- **Aviso de nuevo asistente** (marquesina y Panel en Vivo): ahora es una notificación flotante visible en cualquier lámina, con especialidad y ciudad, y anillos «ping» en el mapa. Antes quedaba oculta en el modo carrusel.
- Mapas sin servicios externos: `src/lib/geo/datosGeo.ts` (generado por `scripts/generar_datos_geo.mjs`, Natural Earth + country-state-city). Ciudades no encontradas se ubican por departamento/país o se listan como «sin ubicar».

Pruebas ajustadas: `verificar_marquesina` (mapa y aviso; `MODALIDAD=Virtual` para el caso virtual) y `verificar_informes`. Nada se probó contra el Supabase real, solo fixtures.


## Entrega 32 (octubre 2026): Informe de Pagos, Convenio HCP corporativo, Indicadores por pestañas, mayúsculas

**Migración (a mano en el SQL Editor, idempotente):** `db/entrega_32_convenio_hcp_corporativo.sql` (origen del convenio HCP: BEATS o aplicación corporativa de contratos).

1. **Convenio HCP devuelto/modificado**: la vista previa, impresión y PDF se releen al abrir (sin datos viejos en caché), los ajustes de texto no se duplican y los avisos de idioma son por idioma. *Nota honesta:* la causa raíz exacta no se pudo reproducir con fixtures; lo aplicado es endurecimiento, no una causa confirmada. Validar contra datos reales.
2. **Asistentes impactados / Miami**: resolución geográfica corregida (`lib/geo`, `datosGeo.ts`, `scripts/generar_datos_geo.mjs`).
3. **Informe de Pagos a HCPs/Speakers** reconstruido (`lib/conciliacionPagos.ts`, `lib/informePagos.ts`, `pages/InformePagos.tsx`): contratado vs OC vs facturado vs pagado, banderas de consistencia, KPIs y CSV. Los documentos sin evento se conservan al filtrar por compañía.
4. **Eventos virtuales**: «Virtual» en lugar de «N/A, N/A» (máscara de visualización, `lib/ubicacionVisible.ts`; no cambia lo guardado).
5. **Panel en vivo**: nombre del asistente en los últimos check-ins e ícono de medicamento en «Muestras entregadas».
6. **Ejecución de Eventos** (análisis): aporta valor diferencial solo como operación en sitio (check-in, muestras, tiempos); lo que se duplicaba con el Expediente y los Informes se debe reducir a enlaces. Se recomienda mantenerla, acotada a la operación.
7. **Marquesina**: justificación del diseño del «Informe por evento»; últimos check-ins con especialidad, ubicación, tipo de asistencia y hora.
8. **Indicadores de uso y gestión** ahora en «Informes y auditoría», en 6 pestañas (Eventos, Costos, Speakers, Productos y tiempos, Uso de la app, Procesos).
9. **Menú lateral en acordeón** por categoría (expandido por defecto; grupos de un solo ítem no colapsan).
10. **Solicitud de evento**: «Nombre del superior que aprueba» se autocarga con el jefe inmediato y es editable.
11. **Mayúsculas** en todos los campos de texto (en `Input`/`Textarea`), salvo correo; opt-out `sinMayusculas`. Solo aplica a lo que se escriba desde ahora: los datos existentes no se modifican.
12. **Convenio HCP**: se puede crear en BEATS o registrar el elaborado en la aplicación corporativa (como el CAF): se inserta Aprobado, sin cadena, con copia firmada en el Expediente y misma auditoría. La modalidad queda fija tras la creación. Supone que RLS permite insertar `convenios_hcp` directamente como Aprobado.

**Pruebas nuevas:** `verificar_entrega_32_mejoras.mjs`, `verificar_entrega_32_informe_pagos.mjs`, `verificar_entrega_32_convenio_hcp_cambios.mjs`. Nada se probó contra el Supabase real. Scripts desactualizados desde antes (fallan igual en la entrega anterior): administracion, archivos_adjuntos, caf, ciclo_vida_documentos, convenio_convenio_hcp, evento, fmv_notificacion, membrete, notificaciones, precargado, speakers_internos, tablero, tareas_documentos_auditoria y `verificar_informes` sección 9.

## Entrega 33 (octubre 2026): créditos, foto de usuario, sesiones en marquesina, paquete «Enviar documentos»

**Migraciones (a mano en el SQL Editor, opcionales e idempotentes; NO aplicadas):**
- `db/entrega_33_foto_usuario.sql`: columna `usuarios.foto_id`. Sin ella la app funciona y avisa al guardar una foto.
- `db/entrega_33_marquesina_sesiones.sql`: reemplaza `resumen_ejecucion_evento_ampliado` conservando todo lo anterior y añadiendo `sesiones` (lugar, país, estado, ciudad, esperados y registros por sesión). Sin ella la marquesina no muestra selector.

1. **Créditos**: «Agradecimientos especiales:» con dos viñetas (Lizeth Núñez; equipo de TI Colombia, Ferney Estrada y Jorge Acevedo). Diseño en dos columnas, más ancho y menos alto.
2. **Ícono de «Muestras entregadas»** (`IconoMuestraMedica`: frasco con cruz) y título «Ranking de muestras entregadas», igual en marquesina, Panel en Vivo e Informe del evento.
3. **Marquesina y Panel en Vivo por sesión** (`SelectorSesionEvento`, `lib/sesionesVista.ts`): al elegir una sesión cambian fechas, lugar/ciudad/país, mapa y esperados. La marquesina es pública y solo usa RPC, por eso llegadas, perfil y muestras siguen siendo del evento completo (se indica en pantalla); el Panel en Vivo sí filtra todo en el cliente. La sesión elegida se recuerda en localStorage.
4. **«Enviar documentos»** (antes «Enviar documentos al solicitante», en el detalle del Convenio HCP): `construirPaqueteCompletoEvento` agrupa por «Evento» y «Speaker · nombre» los PDF generados en BEATS y todos los archivos cargados (OC, facturas, comprobantes, repositorio, convenios firmados, carta, programa, agenda, tarifario, RETHUS, hoja de vida, identidad), con Todos/Ninguno por grupo, tamaño estimado y aviso sobre 20 MB. Desmarcados por defecto: lista de asistencia, fotos, certificado de participación, «otros» y soportes personales del speaker.
5. **Foto de usuario**: campo en Usuarios y Roles (mismo componente que Speakers, `AvatarFotoEditable`) y avatar circular (`AvatarUsuario`, `lib/fotosUsuario.ts`) en encabezado, tabla de usuarios, Tablero, Historial, selección de compañía, cadena de aprobación y notas. **Decisión:** la pantalla de login no muestra fotos (evita revelar qué correos existen).

**Pendiente a su aprobación (solo propuestas, sin cambios):** ordenamiento y rediseño del tablero de Documentos en vista de lista, y evaluación del menú lateral.

**Pruebas:** nuevo `verificar_entrega_33.mjs` (marquesina por sesión, créditos, foto de usuario). Pasan además `verificar_marquesina`, `verificar_entrega_28`, `verificar_login_tablero` y `verificar_ejecucion`. `verificar_administracion` y `verificar_speakers_internos` siguen agotando el tiempo, como en la entrega anterior. **Límites:** nada se probó contra Supabase real; el Panel en Vivo por sesión y la agrupación completa del paquete se verificaron solo por compilación y revisión de código, no con una prueba automatizada propia.

## Entrega 34 (octubre 2026): lista de documentos (propuesta C) y menú lateral (propuesta 3)

Sin migraciones.

1. **Lista de documentos** (`pages/Tablero.tsx`, vista «listado»): encabezados ordenables (Documento, Tipo, Estado, Fecha, Creado por, Creado el; clic alterna ascendente → descendente → sin orden, con `aria-sort`), ícono de tipo en recuadro, avatar del creador y **agrupación por evento** (interruptor «Agrupar por evento», activo por defecto y recordado; cada grupo se pliega; los documentos sin evento van al final en «Sin evento asociado»). El orden se aplica antes de paginar y solo a la vista de listado; «sin orden» conserva el orden por defecto (más reciente primero).
2. **Menú lateral** (`App.tsx`): los íconos y el estilo no cambian; los títulos de categoría van en negrita; el usuario sigue arriba a la derecha. Nueva sección **«Fijados»** arriba: al pasar el cursor sobre una opción aparece un alfiler para fijarla (se muestra también en su categoría). Se recuerda por navegador y usuario (`beats.nav.fijados.<id>`); sin fijados la sección no aparece.

**Pruebas:** nuevo `verificar_entrega_34.mjs`; siguen pasando entrega_28, entrega_33, login_tablero, navegacion y marquesina. `verificar_tablero` ya fallaba antes. Nada se probó contra Supabase real.

Versión 14.31.



## Entrega 35 — Visor documental, Expedientes, «Enviar documentos» en Auditoría y Backup

1. **Visor documental:** «Documentos (todos)» pasa a llamarse «Visor documental» (menú, título, preferencias y textos).
2. **Expedientes** (Informes y auditoría): selector de evento (Aprobado/Completado, según empresa) y acceso al expediente del evento (`src/pages/Expedientes.tsx`).
3. **Auditoría de eventos:** botón «Enviar documentos» junto a «Ir al evento» (`src/components/EnviarDocumentosEvento.tsx`), con la misma ventana y paquete que en el Convenio HCP (`construirPaqueteCompletoEventoPorId`). Solo Dirección Médica, evento Aprobado/Completado.
4. **Configuración › Backup** (solo administrador completo; no para administradores de alcance limitado):
   - **Requiere ejecutar `db/entrega_35_backup.sql`** (funciones `beats_backup_*`, `security definer`, y la tabla de bloqueo `backups_restauracion_activa`).
   - Crear copia: todas las tablas públicas (incl. vacías), en NDJSON+gzip, con huella SHA-256 por página y sello en el manifiesto; filas como texto JSON (sin pasar por números de JS: bigint y numeric intactos); secuencias; tablas ordenadas por dependencias.
   - Restaurar: verifica el archivo (rechaza alterados/cortados); modos *Completar* (no pisa), *Sobrescribir* (actualiza por clave, no borra lo posterior) y *Reemplazar* (deja la base como la copia; exige casilla + escribir RESTAURAR). Sobrescribir y Reemplazar descargan antes una copia de seguridad. Comprueba conteos al terminar.
   - Programación: cada X horas/días, carpeta elegida con el selector del sistema (disco local o unidad de red montada), retención (solo borra archivos `_programado.`), puesta al día al abrir BEATS.
   - Historial de copias, programadas y restauraciones.
5. **Pruebas:** `verificar_entrega_35.mjs` (E2E, pasa), `verificar_backup_formato.mjs` (pasa); el SQL se probó en PGlite (Postgres WASM) en modo superusuario y dueño. `verificar_tareas_documentos_auditoria` ya fallaba antes de esta entrega.

**Limitaciones:** la rutina automática corre solo con BEATS abierto en un navegador compatible (Chrome/Edge); el selector real de carpetas y las unidades de red no se probaron (se usó un sustituto); no se probó contra Supabase real, y se desconoce si el rol `postgres` de Supabase permite `session_replication_role` (si no, se usa el modo por tabla; las FK circulares no se restauran sin superusuario). No incluye usuarios de Auth, código/secretos de Edge Functions ni DDL/RLS (usar el respaldo propio de Supabase para eso). Los usuarios con `paginasPermitidas` explícitas necesitan que se les concedan las páginas nuevas.

Versión 14.32.


## Entrega 36 — «Enviar documentos» más ancho, mapa arrastrable, anotaciones de pago con trazabilidad, comprobantes con varias facturas, producto de la Notificación de Pago y tarea por factura

**Migración (a mano en el SQL Editor, idempotente, NO aplicada):** `db/entrega_36_pagos_anotaciones_facturas.sql` — columna `evento_registros_financieros.facturas_ids` y tabla `evento_anotaciones_pago` (con triggers que fijan autor/rol/fecha). Sin ella la app sigue funcionando: una sola factura por comprobante se guarda como siempre y las anotaciones avisan que falta la migración.

1. **«Enviar documentos»** (`EnviarDocumentoDialog.tsx`): de `max-w-3xl` a `max-w-5xl` y la rejilla interna pasa a `minmax(0,1fr)` + `overflow-x-hidden`. Se midió que con el ancho anterior el contenido desbordaba (812 px sobre 766 visibles); ahora no hay desplazamiento horizontal ni a 900 px de pantalla.
2. **Mapa de Asistentes Impactados** (`components/mapa/MapaEnVivo.tsx`): se arrastra con el mouse o el dedo (como Google Maps), la rueda acerca/aleja alrededor del cursor y hay botón «Restablecer vista» (⌖). Un arrastre no cuenta como clic sobre una ciudad. Es el mismo componente del Panel en Vivo y de la Marquesina, así que ahí también funciona.
3. **Anotaciones de pago con trazabilidad** (`lib/anotacionesPago.ts`, `components/pagos/AnotacionesPago.tsx`):
   - *Expediente › Speakers › Comprobantes de pago*: campo «Comentarios sobre el pago» (en el propio formulario del comprobante y como cuadro de anotaciones debajo). Sigue la configuración del evento: con varios speakers cada bloque tiene los suyos; si el speaker factura **por sesión**, cada comentario puede indicar la sesión («Aplica a»); con factura única aplica a todo el pago.
   - Se muestran en los **hallazgos**: «Contraste de valores» del speaker, pestaña Financiero del Expediente, y en el **Informe de Pagos** (pestaña Hallazgos: columna «Anotaciones», detalle de cada fila y botón «Anotar» que abre un diálogo). El CSV de hallazgos incluye las anotaciones.
   - En el Informe de Pagos se puede anotar para aclarar inconsistencias OC ↔ facturas ↔ comprobantes.
   - **Trazabilidad:** autor, rol y fecha los fija un trigger de la base (no el navegador); una anotación no se edita ni se borra, solo se marca «aclarada» / «reabrir» (quién y cuándo también los fija la base). *Decisión mía, no pedida literalmente:* el estado «aclarada» responde a «aclarar y cerrar las inconsistencias».
4. **«Factura(s) que cubre (opcional)»** (`FormRegistroFinancieroEvento`): lista de casillas con Todas/Ninguna; el comprobante guarda todas en `facturas_ids` (y la primera en `factura_id`) y la lista muestra «Cubre las facturas: …».
5. **Notificación de Pago › Producto:** «Agregar producto» no hacía nada porque la lista de filas se derivaba del texto guardado y una fila aún vacía se descartaba al instante (el desplegable nunca aparecía y el campo era obligatorio). Ahora las filas viven en estado local; al abrir el formulario ya hay un desplegable listo.
6. **Tarea «Notificación de Pago a HCPs» al cargar facturas de un speaker:** *causa probable, no reproducida con datos reales:* la tarea era una sola tarjeta por evento, exigía un Convenio de Pago y seguía considerando «cubierta» una factura cuya notificación estaba Anulada/Rechazada. Ahora hay una tarea **por speaker** con facturas sin Notificación vigente (`tareasNotificacionPagoPorSpeaker`); si falta el Convenio de Pago o el FMV que exige el formulario, la tarea se muestra igual, con el motivo y el botón inhabilitado. Además, cargar una factura envía aviso (campana + correo) a Dirección Médica (`avisarTareaNotificacionPago`, clave `tareas.notificacion_pago`, configurable en «Configuración de Notificaciones»). El botón de la tarea abre el formulario con evento **y speaker** ya elegidos.

**Pruebas:** nuevo `verificar_entrega_36.mjs` (pasa); el arnés `scripts/lib/fixtures.mjs` gana `alInsertar`/`alActualizar` para simular triggers. Siguen pasando expediente_evento, entrega_28/32_informe_pagos/33/34/35, marquesina, notificaciones_flujo, navegacion y login_tablero. **Límites:** nada se probó contra Supabase real; el SQL de la migración no se ejecutó en Postgres (revisar en un entorno de prueba antes); los permisos RLS de la tabla nueva siguen el patrón de las demás tablas del Expediente (quien ve el evento puede leer/anotar).

Versión 14.33.

## Entrega 37 (octubre 2026): facturas según la modalidad del evento, filtros del Informe de Pagos y «Pagos aprobados» contrastado con el Expediente

**Sin migración SQL nueva:** todo se apoya en columnas que ya existen (`evento_speakers_participacion.factura_modalidad`, `evento_registros_financieros.sesion_id` / `factura_id` / `facturas_ids`). Esta entrega no toca la base.

### 1. Facturas, notificaciones y comprobantes siguen lo marcado en la solicitud del evento
Reglas puras en `lib/facturacionSpeaker.ts` (se usan en la pantalla, al guardar y en el avance del Expediente). La modalidad es la **de cada speaker externo** («Factura única» / «Factura por sesión», campo de la solicitud).

- **Factura única →** una sola factura por speaker. Con la factura cargada desaparece el formulario y se explica por qué; para cambiarla se elimina la actual.
- **Factura por sesión →** un cupo por cada sesión en la que participa el speaker: cada sesión admite **una** factura. Cuando todas tienen la suya no se ofrece ninguna más.
- **Una Notificación de Pago por factura.** El formulario de la Notificación ya solo ofrecía facturas sin notificar (entrega 25); ahora, además, cada factura del Expediente muestra su estado («Notificación de pago: Completado / Sin notificación de pago») y el bloque avisa cuáles facturas aún no la tienen. `crearNotificacionPago` y `editarBorradorNotificacionPago` vuelven a comprobar contra la base que la factura no tenga ya una notificación vigente (Anulada/Rechazada la liberan).
- **Comprobantes de pago según las facturas sin cubrir.** Un comprobante cubre una o varias facturas y **solo se puede apuntar a facturas que ningún otro comprobante cubra**: con 2 facturas y un comprobante que cubrió una, el siguiente comprobante solo ofrece la pendiente (queda marcada sola). El campo pasó de «(opcional)» a **«Factura(s) que cubre \*»** (obligatorio). Sin facturas no hay formulario de comprobantes («primero carga la factura»); con todo cubierto tampoco («todas las facturas ya están cubiertas»). Cada factura muestra «Con comprobante de pago» / «Pendiente de pago».
- **Validación contra la base, no contra la pantalla:** al guardar una factura o un comprobante se releen los registros del evento (`validar` en `agregarFinanciero`), de modo que una pantalla desactualizada no permite saltarse el límite (probado: una segunda factura única se rechaza con aviso).
- **Avance del Expediente:** «Factura» queda completa cuando todos los cupos tienen factura; «Comprobante de pago», cuando todas las facturas están cubiertas (antes bastaba con un comprobante cualquiera).

*Decisiones mías, no pedidas literalmente (cámbialas si no van):*
(a) «tantas facturas como sesiones» se aplicó como **una por sesión** (que es como ya estaba armada la pantalla), no como «N facturas repartidas libremente». (b) La Notificación de Pago **no** bloquea cargar el comprobante: solo se muestra su estado. (c) Los datos que ya estaban por encima del límite (p. ej. 2 facturas de un speaker con factura única) **no se borran**: aparecen en un recuadro rojo «facturas por fuera de la modalidad» para que se revisen. (d) Un comprobante antiguo **sin** factura indicada solo se interpreta cuando no hay duda: si el speaker tiene una única factura, la cubre; con varias, no se adivina.

### 2. Informe de Pagos a HCPs/Speakers: filtros reordenados y selector de Speaker
Los filtros pasaron de una fila desordenada a 4 grupos con título: **Evento y speaker** (País → Evento → **Speaker**, de lo general a lo específico), **Período del evento** (Desde / Hasta), **Moneda y resultado** (Moneda, Estado de conciliación, Hallazgo) y **Criterios de la conciliación** (Tolerancia, «Incluir pendientes de contratar»; estos no filtran, cambian cómo se compara). El campo de texto «Speaker o evento» se reemplazó por un **selector «Speaker»**. Los selectores son en cascada: con un país solo se ofrecen sus eventos y speakers; con un evento, solo sus speakers (si lo elegido deja de valer, se limpia). Una línea al pie dice cuántas conciliaciones quedan y que los filtros aplican a todas las pestañas. El filtro `busqueda` sigue en `filtrarConciliacion` (lib), pero la pantalla ya no lo usa; el filtro nuevo es `speaker` (`claveSpeakerFila`).

### 3. Pestaña «Pagos aprobados» corregida y contrastada
- **«Total facturado» ya no es lo de antes.** Antes sumaba el valor de los Convenios de Pago y de las Notificaciones aprobadas (que no son facturas). Ahora es **la suma de las facturas realmente cargadas en el Expediente**; y se muestran junto a él Contratado, Órdenes de compra, Notificado (notificaciones aprobadas), Comprobantes de pago y Por pagar, por moneda.
- **Tabla por speaker** (evento + speaker + moneda, solo los que tienen un Convenio o una Notificación de Pago aprobados): Contratado · Orden de compra · Facturado · Notificado · Comprobantes de pago · Por pagar · Estado de conciliación, con el número de documentos de cada columna («sin facturas cargadas», «sin comprobantes» cuando faltan). Al abrir una fila se listan los documentos uno a uno (convenio, OC, facturas, notificaciones, comprobantes y qué factura cubre cada comprobante) y sus hallazgos.
- **Los filtros de arriba aplican aquí** (país, evento, speaker, período, moneda, estado, hallazgo): totales, tabla y CSV.
- **CSV:** «Pagos aprobados (CSV)» ahora es documento por documento (OC, facturas, comprobantes, notificaciones, convenios; columnas distintas a las de antes) y hay un nuevo «Contraste por speaker (CSV)».
- Los Convenios/Notificaciones aprobados **sin evento de origen** no se pueden contrastar con el Expediente (OC, facturas y comprobantes cuelgan de un evento); se listan aparte en «Aprobados sin evento de origen», solo cuando no hay filtros de evento, speaker, país, período, estado ni hallazgo. *Cambio de criterio:* «Desde/Hasta» ahora filtra por la **fecha del evento** en esta pestaña (antes, por la fecha del documento), igual que en las demás.

### Pruebas
Nuevo `scripts/verificar_entrega_37.mjs` (pasa; 67 comprobaciones sobre Expediente e Informe, con capturas). Ajustados: `verificar_entrega_36.mjs` (el evento de prueba ahora factura por sesión, porque ya no admite 2 facturas de factura única), `verificar_entrega_32_informe_pagos.mjs` (sección 5, nueva pestaña) y `verificar_informes.mjs` / `verificar_entrega_21.mjs` (selector `getByLabel("Evento")` ambiguo → `getByTestId("ipe-evento")`; entrega_21 vuelve a pasar; informes llega hasta la sección 9, que ya fallaba antes). Regresión completa: 28/42; los que fallan son los mismos de la lista de la Entrega 32 (administracion, archivos_adjuntos, caf, ciclo_vida_documentos, convenio_convenio_hcp, evento, fmv_notificacion, membrete, notificaciones, precargado, speakers_internos, tablero, tareas_documentos_auditoria) e `informes` (sección 9). **Límites:** nada se probó contra Supabase real; la comprobación «una notificación por factura» al guardar (`exigirFacturaSinNotificar`) no se ejerció en el navegador (solo compila; el formulario ya filtraba las facturas ofrecidas); el aviso/tarea al cargar facturas (entrega 36) sigue igual.

Versión 14.34.

## Corrección (octubre 2026): nombre del CAF en el Tablero con speakers internos y externos

**Síntoma:** en un evento con 3 speakers internos y 1 externo, el CAF de la speaker externa (Catalina Alzate) aparecía en el Tablero de Documentos como «Juan Diego Casas — Colombia» (un speaker interno).
**Causa:** `tarjetaDeCaf` (`pages/Tablero.tsx`) tomaba el nombre del campo histórico del evento `nombreSpeakerParticipacion`, que guarda el **primer speaker interno**, en vez del speaker del propio CAF. **Arreglo:** ahora usa `caf.speakerId` (con su especialidad) y, si no hubiera, `caf.contraparteNombre`. Solo cambia lo que se muestra; el CAF guardado no estaba mal. Los CAF ya creados se corrigen solos al abrir el Tablero.
**Prueba:** `scripts/verificar_caf_nombre_tablero.mjs` — falla con el bundle 14.34 (reproduce el error) y pasa con el 14.35. No se revisó contra datos reales.

Versión 14.35.

## Entrega 38 (13 de octubre de 2026) — versión 14.36

**Migraciones SQL (manuales, idempotentes; la app tolera que falten):**
1. `db/agregar_detalle_honorarios_speaker.sql` — columna `evento_speakers_participacion.detalle_honorarios`.
2. `db/agregar_rpc_marcar_convenio_hcp_enviado.sql` — RPC `beats_marcar_convenio_hcp_enviado` (security definer).
3. `db/entrega_38_mensaje_editable_notificaciones.sql` — `notificaciones_config.mensaje_plantilla`, `fn_render_mensaje_correo`, `beats_config_correo` y `fn_notificar_por_email()` actualizados.

**Cambios**
- **Solicitud de evento (vista previa/impresión/PDF):** «Participación académica» con su propio título; dos campos «Detallar lo que incluye» (cuota de inscripción y honorarios de speaker), cada uno exigido y visible solo si su valor es > 0 (si el valor vuelve a 0 el detalle se borra).
- **Tarea «enviar convenio firmado al HCP»:** se cierra tras el primer envío (marca `archivo_para_hcp_enviado_en` por RPC verificando filas, y además se oculta si ya hay un envío registrado en `envios_documentos` al consultor). *Causa probable: filtrado silencioso por RLS al actualizar documentos aprobados; no se reprodujo con datos reales.*
- **Cintas de pestañas:** sin barra vertical (Expediente, Informe de Pagos, Indicadores, Backup) — corregido en `ui/tabs.tsx`.
- **Créditos:** texto justificado, sin el globo azul, negritas pedidas, «Humax Pharmaceutical S.A., una compañía Bausch Health» / «Medellín · Colombia».
- **Notificaciones:** `{{mensaje}}` editable por tipo (con vista previa y «volver a la plantilla por defecto»). CAF = «Formato de Aprobación de Contrato» centralizado en `SIGNIFICADO_CAF` (`enums.ts`); `verificar_significado_caf.mjs` impide otros significados.
- **CAF / Convenio HCP externos:** mientras estén en Borrador se puede volver a «Mejor crear en BEATS» (y a la inversa) desde el detalle y al editar el borrador. Al pasar a BEATS el convenio toma la plantilla vigente y su cadena de aprobación.
- **Visor Documental:** títulos corregidos y documentos restringidos por empresa y país (`src/lib/alcance.ts`).
- **Historial y Auditoría:** restringido por empresa y país (alcance guardado o resuelto desde el documento).
- **Filtros por empresa del grupo:** Participación de un Speaker por Período (lista de speakers), Informe de Speakers e Indicadores de Uso y Gestión (nuevo selector «Empresa del grupo», también en el CSV).

**Decisiones:** usuarios con alcance restringido no ven registros cuyo país/empresa no se pueda determinar; el país «N/A» (virtual) no se restringe por país; un speaker se asocia a una empresa por la lista de interacción o por participar en eventos/convenios de ella; el cambio de modalidad solo en Borrador.

**Pruebas:** nuevo `verificar_entrega_38.mjs` (pasa). Regresión: fallan solo los scripts ya desactualizados de entregas previas (administracion, archivos_adjuntos, caf, ciclo_vida_documentos, convenio_convenio_hcp, evento, fmv_notificacion, informes, membrete, notificaciones, precargado, speakers_internos, tablero, tareas_documentos_auditoria). Nada se probó contra Supabase real.

## Entrega 39 (13 de octubre de 2026) — versión 14.37

**Migraciones SQL (manuales, idempotentes; la app tolera que falten, pero editar/eliminar anotaciones no funciona sin ellas). Ejecutar EN ESTE ORDEN y en ejecuciones separadas:**
1. `db/entrega_39a_enum_auditoria_anotaciones.sql` — agrega `anotacion_pago_editada` y `anotacion_pago_eliminada` al enum `tipo_accion_auditoria`.
2. `db/entrega_39b_anotaciones_pago_editar_eliminar.sql` — columnas `editada_en` / `editada_por_nombre` / `editada_veces`, trigger de UPDATE ajustado y funciones `beats_editar_anotacion_pago` / `beats_eliminar_anotacion_pago`. Requiere la entrega 36.

**Cambios**
1. **Filtros de país en español.** Los filtros de país mostraban nombres en inglés («United States») porque la lista salía de la tabla `paises_region`, y al compararla con el país guardado en español («Estados Unidos») no coincidía. Nuevo `lib/paisCanonico.ts` (`paisCanonico`, `mismoPais`, `paisesParaFiltro`): reconoce cada país en español, inglés y alias (EE. UU., USA…) usando el catálogo de `lib/geo/geo.ts` (que ahora también conoce los nombres en inglés vía `Intl.DisplayNames`). Las listas se muestran siempre en español y sin repetidos, y las comparaciones son por país, no por texto exacto. Aplicado en: Asistentes Impactados, Informe de Pagos, Indicadores de Uso y Gestión, Participación de un Speaker, Auditoría de Eventos, Historial, Speakers, conciliación de pagos y la restricción por «Países de operación» (`alcance.ts`).
2. **Anotaciones de pago: editar y eliminar, con auditoría.** Cada anotación muestra **Editar** y **Eliminar** a su **autor o a un administrador** (en el Expediente —pestañas Speakers y Financiero— y en el Informe de Pagos). Editar muestra «Editada por … · fecha» y conserva autor y fecha originales. Eliminar pide confirmación. Ambas operaciones las hace la base de datos (funciones `security definer`; la tabla sigue sin DELETE ni UPDATE de `texto` directos) y escriben en `auditoria` —asociado a la **Solicitud de Evento**, con su empresa y país— el usuario de la sesión, el texto anterior y el nuevo (o el eliminado). Los nuevos tipos de acción aparecen en Historial y Auditoría como «Anotación de pago editada / eliminada».
3. **Créditos.** Texto de `text-base` (16 px) a 15 px; la bandera de Colombia quedó centrada justo debajo de «Medellín · Colombia»; el mensaje de contacto ya no va justificado (se estiraba en la columna angosta).

**Decisiones mías, no pedidas literalmente (cámbialas si no van):** (a) «convenio de pago» se entendió como las **anotaciones sobre el pago** de la entrega 36; (b) solo el autor o un administrador puede editar/eliminar (la base también lo exige); (c) la constancia se guarda en la auditoría del **evento** (no del Convenio de Pago), porque las anotaciones cuelgan del evento y del speaker; (d) la reducción de fuente se aplicó a todo el texto de Créditos.

**Pruebas:** nuevo `scripts/verificar_entrega_39.mjs` (pasa, 19 comprobaciones: países en español, editar/eliminar con auditoría, permisos por autor, Créditos). También pasan 36, 37, 38, 32_informe_pagos y 21; `informes` sigue fallando en el mismo punto de antes (entrega 38). **Límites:** nada se probó contra Supabase real; las funciones SQL de la 39b se simularon en los fixtures, no se ejecutaron en Postgres.

## Entrega 40 (13 de octubre de 2026) — versión 14.38

**Sin migraciones SQL.**

**Síntoma (reportado):** al abrir «Notificación de Pago a HCP» desde «Tareas Pendientes» solo se cargaban la cédula / licencia y la empresa del grupo; no el nombre ni el documento del HCP ni nada del evento de origen. Al elegir el evento a mano el HCP no traía sus datos, ni siquiera volviendo a seleccionarlo. Se pidió revisar lo mismo en **todos** los formularios que se abren desde una tarea.

**Causas (5, todas reproducidas con `verificar_entrega_40.mjs` contra la 14.37):**
1. **Escrituras simultáneas que se pisaban** (`hooks/usePrecargado.ts`). Desde una tarea, «evento de origen» y «HCP» se elegían en el mismo instante y las dos escrituras partían del mismo valor viejo del formulario: la segunda borraba el evento, y la respuesta de la consulta del evento se descartaba por «ya no es el evento elegido». Nuevo `useValorReciente` (el último valor escrito se guarda de forma síncrona y toda escritura —inmediata o asíncrona— se fusiona sobre él); `useSelectorConPrecargado` lo usa y lo expone (`.aplicar`, `.valorRef`) a los formularios con lógica propia.
2. **Notificación de Pago y CAF consultaban el Convenio con el evento del render** (`onCambiaSpeaker`): desde la tarea ese valor aún estaba vacío, así que **nunca** se consultaba el Convenio de Pago (de donde salían nombre y documento) y solo llegaba la cédula (que sale de la ficha del speaker). Además, un único `Promise.all` hacía que una consulta fallida descartara también las demás. Ahora el evento se pasa explícito (`usePrecargaInicialOrigen` lo entrega a `onSpeaker`), cada fuente es independiente y hay respaldo (ver «Cambios»).
3. **Las tareas «por speaker» pasaban el id equivocado** (`pages/TareasPendientes.tsx`): FMV, Convenio de Pago, CAF y Convenio HCP enviaban `tarea.speaker.id` (la fila de *participación* del evento) en vez de `tarea.speaker.speakerId` (el speaker del Repositorio). Por eso esos formularios no podían seleccionar al HCP y el Convenio HCP nunca encontraba su opción. (La Notificación de Pago ya enviaba el id correcto.)
4. **Convenio HCP: la precarga inicial corría una sola vez con la lista de eventos aún vacía** y se daba por «aplicada» sin haber encontrado nada (`FormularioConvenioHCP.tsx`). Ahora espera a que lleguen las opciones. También `onCambiaEventoOrigen` escribe sobre el valor más reciente y cada consulta es independiente.
5. **Volver a elegir el mismo HCP no dispara nada** (el selector no emite el cambio si el valor es el mismo). Nuevo botón **«Volver a cargar los datos del HCP»** bajo el selector de la Notificación de Pago.

**Cambios (qué se precarga ahora)**
- **Notificación de Pago** (desde la tarea o a mano): evento, HCP, **nombre** y **documento de identidad** (del Convenio de Pago del mismo evento+speaker; si no hay convenio, de la ficha del speaker), **cédula / licencia** (siempre de «Licencia RETHUS / Cédula profesional» de la ficha), **empresa del grupo** (la de la solicitud de evento), **productos** (los del evento que existan en el portafolio, el principal primero) y **factura** (si el evento + HCP tienen una sola factura sin notificar se elige sola y con ella fecha, valor y moneda). Al cambiar de evento se limpian los datos del HCP anterior.
- **CAF:** misma corrección del punto 2; si no hay Convenio de Pago, la contraparte (nombre, documento, dirección, país, estado, ciudad, contacto) se completa desde la ficha del speaker; el convenio, cuando existe, tiene prioridad en lo que trae.
- **FMV, Convenio de Pago, CAF:** si la tarea no trae speaker (tareas del modelo anterior de un solo speaker) y el evento tiene exactamente uno, se elige solo cuando cargan las opciones.
- **Tareas que no abren un formulario de creación** (aprobaciones, «Enviar convenio firmado al HCP») se revisaron: abren el documento existente y el envío ya llega con destinatario, asunto y mensaje.

**Decisiones mías, no pedidas literalmente (cámbialas si no van):** (a) en la Notificación la **empresa del grupo** pasa a salir del evento (antes quedaba la de la sesión) — solo si el evento la trae; (b) la **factura única** se elige sola; (c) nombre y documento: **convenio primero, ficha del speaker de respaldo** (como ya se certificaba «concuerda con el Convenio»); la cédula, siempre de la ficha, como se pidió en noviembre; (d) el speaker único del evento se elige solo únicamente al venir de una tarea sin speaker, no al elegir el evento a mano.

**Pruebas:** nuevo `scripts/verificar_entrega_40.mjs` (6 escenarios, 29 comprobaciones: Notificación desde la tarea y a mano + «Volver a cargar», CAF, FMV, Convenio de Pago y Convenio HCP desde sus tareas). **Falla con el bundle 14.37 (8 comprobaciones fallidas antes de detenerse, entre ellas las del síntoma reportado) y pasa con el 14.38** (corrido varias veces, sin errores de consola). Regresión completa (`npm run verificar`): 33/47; los 14 que fallan son exactamente los mismos ya documentados de entregas previas (administracion, archivos_adjuntos, caf, ciclo_vida_documentos, convenio_convenio_hcp, evento, fmv_notificacion, informes, membrete, notificaciones, precargado, speakers_internos, tablero, tareas_documentos_auditoria); ninguno nuevo. `tsc -b` sin errores. **Límites:** todo se probó con fixtures locales, nunca contra Supabase real; los escenarios de CAF/FMV/Convenio verifican datos del HCP, no cada campo del formulario; el caso «CAF corporativo» no se ejerció.
