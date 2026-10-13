# admin-usuarios — cómo desplegarla

Este archivo (`index.ts`) es el **reemplazo completo** de la función Edge
`admin-usuarios` del proyecto de Supabase (`xnjqlwkcbkctoinkroqs`), no un
fragmento para pegar dentro de otro archivo.

## Por qué se reescribió por completo

El código que se compartió como "el real, sacado del dashboard" resultó ser
idéntico a `docs/admin-usuarios-crear_usuario.propuesta.ts` — una propuesta
de este mismo trabajo, pensada como un fragmento aislado para pegarse dentro
de la función real. Ese archivo no tiene `Deno.serve(...)` (ningún punto de
entrada que reciba la petición HTTP), no maneja CORS, y solo cubre la acción
`crear_usuario` — le faltan `resetear_password` y `actualizar_email`. Si eso
fuera de verdad todo el archivo desplegado, la función nunca podría responder
ninguna petición, lo que coincide exactamente con el error reportado
("Failed to send a request to the Edge Function": el navegador nunca llegó
a recibir ninguna respuesta) y con el log visto (solo el evento "Boot", sin
ningún log posterior de una petición real siendo atendida).

El correo de "restablecer contraseña" que sí llegó durante las pruebas no
pasó por esta función: la pantalla de login llama directamente la RPC
`solicitar_restablecimiento_password` (ver
`src/lib/usuarios.ts::solicitarRestablecimientoPassword`), un flujo sin
sesión totalmente independiente de `admin-usuarios`.

## Pasos para desplegar

1. En el Dashboard de Supabase → Authentication → Users, revisa si quedó
   una cuenta huérfana con el correo que intentaste crear (el intento
   fallido pudo o no haber llegado a crear la cuenta de Auth antes de
   fallar). Si existe y no tiene una fila correspondiente en `usuarios`,
   bórrala antes de reintentar — si no, `crear_usuario` fallará con
   "correo ya registrado".
2. Reemplaza el contenido completo de la función `admin-usuarios` en el
   Dashboard (o en tu repo de funciones) con `index.ts`.
3. Verifica las variables de entorno del proyecto — Supabase las inyecta
   automáticamente en toda función Edge, no hace falta configurarlas a
   mano: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
4. Confirma que `configuracion_integraciones` (id = 1) tenga
   `edge_function_url` y `webhook_secret` — sin eso, `crear_usuario` y
   `resetear_password` responden 502 ANTES de tocar Auth (a propósito:
   nunca debe quedar una cuenta creada/reseteada sin forma de que su dueño
   conozca la contraseña).
5. Despliega (`supabase functions deploy admin-usuarios` o el botón
   "Deploy" del Dashboard).
6. Prueba crear un usuario de prueba y confirma en el log de la función que
   aparece más que solo "Boot" (debe verse la petición POST siendo
   atendida).

## Resuelto — contrato del webhook de correo

`configuracion_integraciones.edge_function_url` apunta a `send-email`, una
función que YA EXISTÍA de antes del incidente que perdió el resto del
código (las funciones desplegadas y los secretos de Edge Functions viven
en la infraestructura del proyecto, no en el contenedor que se perdió, así
que sobrevivió intacta). El usuario compartió su código fuente real — no
hace falta ninguna función nueva (se descartó la `enviar-correo` que se
había escrito en un intento anterior, antes de saber que `send-email` ya
existía).

El contrato real de `send-email`, para la vía server-to-server que usa
`admin-usuarios`:
- Header `x-webhook-secret: <webhook_secret>` — NO `Authorization: Bearer`.
- Cuerpo `{ to, subject, html }` — `send-email` no arma el mensaje, espera
  el HTML ya completo (`enviarCorreoNotificacion()` lo construye aquí
  mismo con `htmlCorreoPassword()`).

`send-email` también acepta llamadas autenticadas desde el navegador (con
sesión + rol `medica`) para adjuntar el PDF del Convenio HCP — esa vía no
la usa `admin-usuarios`, es de otra parte de la app.

Si el correo no llega (SMTP caído, secreto desconfigurado, etc.), la
cuenta o el reseteo de todas formas se completan aquí — `admin-usuarios`
nunca propaga esa falla como error (el helper la captura y solo la deja en
el log) — pero sí revisa el log de `send-email` para el motivo exacto.
Para probar `send-email` de forma aislada, sin pasar por `admin-usuarios`
ni por la app, ver `db/prueba-send-email.sql`.
