/**
 * FASE 0 (corrección de seguridad E19, septiembre 2026): este archivo antes
 * exportaba `generarPasswordTemporal()`, usado para que Dirección
 * Médica/un Administrador generara y VIERA en pantalla la contraseña
 * temporal de un colaborador nuevo. Ese patrón exponía la contraseña en el
 * cliente (toast, campo editable) y quedaba en el DOM/en el historial de
 * toasts incluso después de cerrar sesión.
 *
 * Se eliminó por completo: ahora `crearUsuario()` (en `lib/usuarios.ts`) ya
 * no envía ni recibe ninguna contraseña — igual que `resetearPasswordUsuario()`,
 * la función Edge `admin-usuarios` debe generarla ella misma del lado del
 * servidor y enviarla directo por correo al colaborador nuevo. Ver
 * `docs/admin-usuarios-crear_usuario.propuesta.ts` para el cambio propuesto
 * en esa función Edge (su código fuente real no vive en este repositorio).
 *
 * Este archivo se conserva vacío (en vez de borrarlo) como referencia de
 * por qué el generador de contraseñas ya no existe aquí.
 */
export {};
