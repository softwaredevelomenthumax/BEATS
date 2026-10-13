import { toast } from "sonner";
import {
  agregarArchivoRepositorioEvento,
  eliminarArchivoRepositorioEvento,
  eliminarArchivosRepositorioPorAlcance,
  agregarRegistroFinancieroEvento,
  eliminarRegistroFinancieroEvento,
  traerRegistrosFinancierosEvento,
} from "@/lib/repositorioEvento";
import { agregarAnotacionPago, cambiarAclaradaAnotacionPago, editarAnotacionPago, eliminarAnotacionPago } from "@/lib/anotacionesPago";
import { avisarTareaNotificacionPago } from "@/lib/tareasEscalonadas";
import { mensajeErrorAmigable } from "@/lib/supabaseClient";
import { useConfirmarQuitar, type DatosNuevoRegistroFinanciero } from "./piezas";
import type { CategoriaFinancieraRepositorio, CategoriaRepositorioArchivo } from "@/lib/enums";
import type { RegistroFinancieroEvento, RepositorioArchivoEvento } from "@/types";

/**
 * Acciones de escritura del Expediente — todas terminan en `recargar(true)`
 * (recarga silenciosa) para que las pestañas muestren el estado real de la
 * base y no uno inferido en memoria.
 */
export function useAccionesExpediente(eventoId: string, recargar: (silencioso?: boolean) => Promise<void>) {
  const confirmarQuitar = useConfirmarQuitar();

  function falla(error: unknown, porDefecto: string) {
    toast.error(error instanceof Error ? error.message : porDefecto);
  }

  /** Carga (o reemplaza) el único archivo de una categoría para un speaker/evento/sesión. */
  async function cargarArchivoUnico(datos: {
    categoria: CategoriaRepositorioArchivo;
    archivoId: string;
    speakerId?: string | null;
    sesionId?: string | null;
  }) {
    try {
      await eliminarArchivosRepositorioPorAlcance({ eventoId, categoria: datos.categoria, speakerId: datos.speakerId ?? null, sesionId: datos.sesionId });
      await agregarArchivoRepositorioEvento({ eventoId, ...datos });
      toast.success("Archivo agregado al expediente.");
      await recargar(true);
    } catch (error) {
      falla(error, "No se pudo agregar el archivo.");
    }
  }

  async function declararNoAplica(datos: { categoria: CategoriaRepositorioArchivo; motivo: string; speakerId?: string | null }) {
    try {
      await eliminarArchivosRepositorioPorAlcance({ eventoId, categoria: datos.categoria, speakerId: datos.speakerId ?? null });
      await agregarArchivoRepositorioEvento({
        eventoId,
        categoria: datos.categoria,
        speakerId: datos.speakerId ?? null,
        noAplica: true,
        noAplicaMotivo: datos.motivo,
      });
      toast.success("Quedó registrado como “No aplica”.");
      await recargar(true);
    } catch (error) {
      falla(error, "No se pudo guardar la declaración.");
    }
  }

  async function quitarArchivo(fila: RepositorioArchivoEvento) {
    const titulo = fila.noAplica ? "Cambiar declaración" : "Quitar archivo";
    const mensaje = fila.noAplica ? "Se borra la declaración de “No aplica” para que puedas cargar el archivo." : "¿Quitar este archivo del expediente? No se puede deshacer.";
    if (!(await confirmarQuitar(titulo, mensaje))) return;
    try {
      await eliminarArchivoRepositorioEvento(fila.id);
      await recargar(true);
    } catch (error) {
      falla(error, "No se pudo quitar el archivo.");
    }
  }

  async function agregarArchivoSuelto(datos: {
    categoria: CategoriaRepositorioArchivo;
    archivoId: string;
    speakerId?: string | null;
    sesionId?: string | null;
    etiqueta?: string | null;
    conteos?: { medico?: number | null; noMedico?: number | null; fuerzaVentas?: number | null; otro?: number | null };
  }) {
    try {
      await agregarArchivoRepositorioEvento({
        eventoId,
        categoria: datos.categoria,
        archivoId: datos.archivoId,
        speakerId: datos.speakerId ?? null,
        sesionId: datos.sesionId ?? null,
        etiqueta: datos.etiqueta ?? null,
        conteoPersonalMedico: datos.conteos?.medico ?? null,
        conteoPersonalNoMedico: datos.conteos?.noMedico ?? null,
        conteoFuerzaVentas: datos.conteos?.fuerzaVentas ?? null,
        conteoOtroPersonal: datos.conteos?.otro ?? null,
      });
      toast.success("Archivo agregado al expediente.");
      await recargar(true);
    } catch (error) {
      falla(error, "No se pudo agregar el archivo.");
    }
  }

  async function agregarFinanciero(datos: {
    categoria: CategoriaFinancieraRepositorio;
    speakerId?: string | null;
    sesionId?: string | null;
    registro: DatosNuevoRegistroFinanciero;
    /**
     * Entrega 37: regla de negocio a comprobar contra los registros MÁS RECIENTES de la base (no contra lo que mostraba la
     * pantalla, que otra persona pudo cambiar). Devuelve el motivo del rechazo o `null` si se puede guardar.
     */
    validar?: (registrosDelEvento: RegistroFinancieroEvento[]) => string | null;
  }) {
    try {
      if (datos.validar) {
        const motivo = datos.validar(await traerRegistrosFinancierosEvento(eventoId));
        if (motivo) {
          toast.error(motivo);
          await recargar(true);
          return;
        }
      }
      const facturasIds = datos.categoria === "comprobantePago" ? datos.registro.facturasRelacionadasIds ?? [] : [];
      const creado = await agregarRegistroFinancieroEvento({
        eventoId,
        categoria: datos.categoria,
        archivoId: datos.registro.archivoId,
        numero: datos.registro.numero,
        fecha: datos.registro.fecha || null,
        valor: datos.registro.valor,
        moneda: datos.registro.moneda,
        sesionId: datos.sesionId ?? null,
        facturasIds,
        speakerId: datos.speakerId ?? null,
      });
      // Entrega 36: una factura nueva activa la tarea «Notificación de Pago a HCP» (la tarea es viva; esto es el aviso).
      if (datos.categoria === "facturas") {
        void avisarTareaNotificacionPago({ eventoId, speakerId: datos.speakerId ?? null, numerosFactura: [datos.registro.numero] });
      }
      // Entrega 36: el comentario del comprobante se guarda como anotación (autor y fecha los fija la base).
      const comentario = datos.categoria === "comprobantePago" ? datos.registro.comentario?.trim() : "";
      if (comentario) {
        try {
          await agregarAnotacionPago({
            eventoId,
            speakerId: datos.speakerId ?? null,
            sesionId: datos.registro.comentarioSesionId ?? null,
            registroId: creado.id,
            origen: "expediente",
            texto: comentario,
          });
          toast.success("Comprobante y comentario agregados.");
        } catch (errorComentario) {
          toast.warning(`El comprobante se agregó, pero el comentario no se pudo guardar: ${errorComentario instanceof Error ? errorComentario.message : mensajeErrorAmigable(errorComentario)}`);
        }
      } else {
        toast.success("Registro financiero agregado.");
      }
      await recargar(true);
    } catch (error) {
      falla(error, "No se pudo agregar el registro.");
    }
  }

  async function quitarFinanciero(id: string) {
    if (!(await confirmarQuitar("Eliminar registro", "¿Eliminar este registro financiero? No se puede deshacer."))) return;
    try {
      await eliminarRegistroFinancieroEvento(id);
      await recargar(true);
    } catch (error) {
      falla(error, "No se pudo eliminar el registro.");
    }
  }

  /** Entrega 36: anotación de pago hecha desde el Expediente (autor y fecha los fija la base de datos). */
  async function agregarAnotacion(datos: { speakerId: string | null; sesionId?: string | null; texto: string }) {
    await agregarAnotacionPago({ eventoId, speakerId: datos.speakerId, sesionId: datos.sesionId ?? null, origen: "expediente", texto: datos.texto });
    toast.success("Anotación agregada.");
    await recargar(true);
  }

  async function cambiarAclarada(id: string, aclarada: boolean) {
    await cambiarAclaradaAnotacionPago(id, aclarada);
    await recargar(true);
  }

  /** Entrega 39: edita el texto de una anotación (la base deja constancia en la auditoría). */
  async function editarAnotacion(id: string, texto: string) {
    await editarAnotacionPago(id, texto);
    toast.success("Anotación editada.");
    await recargar(true);
  }

  /** Entrega 39: elimina una anotación (la base deja constancia en la auditoría). */
  async function eliminarAnotacion(id: string) {
    await eliminarAnotacionPago(id);
    toast.success("Anotación eliminada.");
    await recargar(true);
  }

  return { agregarAnotacion, cambiarAclarada, editarAnotacion, eliminarAnotacion, cargarArchivoUnico, declararNoAplica, quitarArchivo, agregarArchivoSuelto, agregarFinanciero, quitarFinanciero };
}
