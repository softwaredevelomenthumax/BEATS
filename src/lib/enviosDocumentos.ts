import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";
import { traerArchivos } from "@/lib/archivosAdjuntos";
import type { TipoDoc } from "@/lib/enums";

/**
 * AJUSTES (septiembre/octubre 2026), pedido explícito: "Cuando se termina el
 * flujo de aprobación de un documento, el sistema debe habilitar una
 * ventana... para que se pueda enviar a las partes interesadas una copia de
 * uno o varios de esos documentos" — al HCP/speaker (adjuntando el archivo
 * firmado, pidiendo que lo revise/firme y lo devuelva) y/o al usuario
 * generador de la solicitud (adjuntando los documentos que el remitente
 * elija de una lista).
 *
 * CORREGIDO tras recibir el código real de la Edge Function `send-email`
 * (el usuario la compartió): a diferencia de lo que se había supuesto
 * (una función nueva de Postgres vía `net.http_post`), la Edge Function YA
 * soporta adjuntos de punta a punta — incluye la corrección de un bug real
 * ya resuelto ("el archivo enviado pesa 0kb"): decodifica el base64 ella
 * misma con `atob` a un `Uint8Array`, evitando el manejo de `Buffer` de
 * nodemailer bajo Deno. Y, más importante: YA tiene una vía de llamada
 * autenticada pensada exactamente para esto — `supabase.functions.invoke`
 * desde el navegador, con la sesión del usuario, restringida en el
 * servidor a `rol === "medica"` ("Solo Dirección Médica puede enviar
 * correos con adjuntos desde la app"). No hace falta ninguna función nueva
 * de Postgres ni `net.http_post` — se llama la Edge Function directo.
 *
 * Contrato exacto que espera la función (confirmado en su código fuente):
 * `{ to, cc?, subject, html, attachments?: [{ filename, content }] }`,
 * donde `content` es base64 PURO (sin el prefijo `data:...;base64,`).
 */
export async function enviarDocumentoPorCorreo(datos: {
  tipoDoc: TipoDoc;
  documentoId: string;
  destinatarioEmail: string;
  destinatarioNombre?: string;
  asunto: string;
  mensajeHtml: string;
  archivosIds: string[];
  /** `usuarios.id` de quien envía — para la bitácora (ver abajo). No es lo mismo que `auth.uid()` en este esquema. */
  enviadoPorId: string;
}): Promise<void> {
  const archivos = await traerArchivos(datos.archivosIds);
  const attachments = datos.archivosIds
    .map((id) => archivos.get(id))
    .filter((archivo): archivo is NonNullable<typeof archivo> => Boolean(archivo))
    .map((archivo) => ({
      filename: archivo.nombre,
      // data_url trae "data:<mime>;base64,<...>" — la Edge Function espera
      // el base64 puro, sin ese prefijo.
      content: archivo.dataUrl.replace(/^data:[^,]*;base64,/, ""),
    }));

  // `supabase.functions.invoke` adjunta automáticamente el token de la
  // sesión activa (Authorization: Bearer ...) — es justo la vía autenticada
  // que la función ya espera para esta acción.
  const { error } = await supabase.functions.invoke("send-email", {
    body: {
      to: datos.destinatarioEmail,
      subject: datos.asunto,
      html: datos.mensajeHtml,
      attachments,
    },
  });
  if (error) {
    // La función devuelve `{ error: "mensaje" }` en el cuerpo de la
    // respuesta no-2xx — supabase-js no lo expone en `error.message`
    // (solo dice "non-2xx status code"), así que se intenta leer el
    // cuerpo real para dar un mensaje útil (p. ej. "Solo Dirección Médica
    // puede enviar correos con adjuntos desde la app.").
    let mensaje = error.message;
    try {
      const contexto = (error as { context?: Response }).context;
      const cuerpo = await contexto?.clone().json();
      if (cuerpo?.error) mensaje = cuerpo.error;
    } catch {
      // Si no se pudo leer el cuerpo, se deja el mensaje genérico de arriba.
    }
    throw new Error(mensajeErrorAmigable({ message: mensaje }));
  }

  // Bitácora de auditoría/compliance — ver `db/agregar_envio_documentos_interesados.sql`
  // (tabla `envios_documentos`, migración nueva, todavía sin aplicar). Se
  // intenta después de un envío exitoso, pero nunca bloquea ni revierte el
  // envío si falla (p. ej. si la migración todavía no se aplicó).
  await supabase
    .from("envios_documentos")
    .insert({
      tipo_doc: datos.tipoDoc,
      documento_id: datos.documentoId,
      destinatario_email: datos.destinatarioEmail,
      destinatario_nombre: datos.destinatarioNombre ?? null,
      asunto: datos.asunto,
      mensaje: datos.mensajeHtml,
      archivos_ids: datos.archivosIds,
      enviado_por_id: datos.enviadoPorId,
    })
    .then(({ error: errorBitacora }) => {
      if (errorBitacora) console.warn("No se pudo registrar el envío en la bitácora:", errorBitacora.message);
    });
}

/**
 * Octubre 2026: correos (en minúsculas) a los que ya se envió cada documento de un tipo, según la bitácora
 * `envios_documentos`. Sirve de respaldo para cerrar la tarea «Enviar el convenio firmado al HCP» aunque la marca
 * `archivo_para_hcp_enviado_en` no se haya podido guardar. Nunca lanza: sin bitácora devuelve un mapa vacío.
 */
export async function traerDestinatariosEnviosPorDocumento(tipoDoc: TipoDoc): Promise<Map<string, Set<string>>> {
  const mapa = new Map<string, Set<string>>();
  try {
    const { data, error } = await supabase.from("envios_documentos").select("documento_id, destinatario_email").eq("tipo_doc", tipoDoc);
    if (error) throw error;
    for (const fila of data ?? []) {
      const id = fila.documento_id as string;
      const conjunto = mapa.get(id) ?? new Set<string>();
      conjunto.add(String(fila.destinatario_email ?? "").trim().toLowerCase());
      mapa.set(id, conjunto);
    }
  } catch (error) {
    console.warn("No se pudo leer la bitácora de envíos:", error);
  }
  return mapa;
}
