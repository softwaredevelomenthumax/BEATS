import type { Caf, Convenio, ConvenioHcp, Evento, Fmv, NotificacionPagoHcp } from "@/types";
import type { DocumentoAny } from "@/lib/documentoGenerico";
import type { EstadoDoc, TipoDoc } from "@/lib/enums";
import { ETIQUETA_TIPO_DOC } from "@/lib/enums";
import { traerEventos, nombreEvento, eliminarDocumentoFirmadoAdmin as eliminarEventoAdmin } from "@/lib/evento";
import { traerCafs, nombreCaf, eliminarDocumentoFirmadoAdmin as eliminarCafAdmin } from "@/lib/caf";
import { traerConvenios, nombreConvenio, eliminarDocumentoFirmadoAdmin as eliminarConvenioAdmin } from "@/lib/convenio";
import { traerConveniosHCP, nombreConvenioHCP, eliminarDocumentoFirmadoAdmin as eliminarConvenioHCPAdmin } from "@/lib/convenioHCP";
import { traerFmvs, nombreFmv, eliminarDocumentoFirmadoAdmin as eliminarFmvAdmin } from "@/lib/fmv";
import { traerNotificacionesPago, nombreNotificacionPago, eliminarDocumentoFirmadoAdmin as eliminarNotificacionPagoAdmin } from "@/lib/notificacionPago";

/**
 * (La pantalla se llama ahora "Gestión avanzada de documentos".)
 *
 * Corrección (octubre 2026), pedido explícito del usuario: "Genera un
 * formulario... para ver y eliminar sin rastro, documentos que se hayan
 * creado por error, a pesar de estar firmados" — este módulo junta los 6
 * tipos de documento en una sola lista plana para la nueva pantalla
 * admin-only `EliminarDocumentosFirmados.tsx`, y expone un único punto de
 * entrada para borrar cualquiera de ellos sin dejar rastro en auditoría.
 *
 * Deliberadamente se excluyen los documentos en estado "Borrador": esos ya
 * tienen su propia vía de eliminación (el botón "Eliminar borrador",
 * creator-only, en cada formulario — ver `eliminarBorrador*` en cada
 * `lib/*.ts`). Esta pantalla es específicamente para documentos que ya
 * avanzaron de Borrador (Pendiente, Devuelto, Aprobado, Completado,
 * Anulado) — el caso que pidió el usuario es el de uno ya firmado/
 * completado por error, pero no hay razón para impedir borrar uno en
 * cualquier otro estado posterior a Borrador desde esta misma pantalla.
 */
export interface DocumentoAdminResumen {
  tipoDoc: TipoDoc;
  id: string;
  nombre: string;
  estado: EstadoDoc;
  creadoEn: string;
  /**
   * Documento completo — permite abrir su vista de detalle ("Ver documento")
   * desde la pantalla de Gestión avanzada de documentos para confirmar
   * visualmente que es el que se quiere eliminar (octubre 2026, pedido
   * explícito).
   */
  documento: DocumentoAny;
}

export async function traerDocumentosParaEliminacionAdmin(): Promise<DocumentoAdminResumen[]> {
  const [eventos, cafs, convenios, conveniosHCP, fmvs, notificaciones] = await Promise.all([
    traerEventos(),
    traerCafs(),
    traerConvenios(),
    traerConveniosHCP(),
    traerFmvs(),
    traerNotificacionesPago(),
  ]);

  const resumenes: DocumentoAdminResumen[] = [
    ...eventos.map((e: Evento) => ({ tipoDoc: "evento" as const, id: e.id, nombre: nombreEvento(e), estado: e.estado, creadoEn: e.creadoEn, documento: e })),
    ...cafs.map((c: Caf) => ({ tipoDoc: "caf" as const, id: c.id, nombre: nombreCaf(c), estado: c.estado, creadoEn: c.creadoEn, documento: c })),
    ...convenios.map((c: Convenio) => ({ tipoDoc: "convenio" as const, id: c.id, nombre: nombreConvenio(c), estado: c.estado, creadoEn: c.creadoEn, documento: c })),
    ...conveniosHCP.map((c: ConvenioHcp) => ({ tipoDoc: "convenioHCP" as const, id: c.id, nombre: nombreConvenioHCP(c), estado: c.estado, creadoEn: c.creadoEn, documento: c })),
    ...fmvs.map((f: Fmv) => ({ tipoDoc: "fmv" as const, id: f.id, nombre: nombreFmv(f), estado: f.estado, creadoEn: f.creadoEn, documento: f })),
    ...notificaciones.map((n: NotificacionPagoHcp) => ({ tipoDoc: "notificacionPago" as const, id: n.id, nombre: nombreNotificacionPago(n), estado: n.estado, creadoEn: n.creadoEn, documento: n })),
  ];

  return resumenes
    .filter((d) => d.estado !== "Borrador")
    .sort((a, b) => (a.creadoEn < b.creadoEn ? 1 : -1));
}

export { ETIQUETA_TIPO_DOC };

export async function eliminarDocumentoSinRastroAdmin(tipoDoc: TipoDoc, documentoId: string): Promise<void> {
  switch (tipoDoc) {
    case "evento":
      return eliminarEventoAdmin(documentoId);
    case "caf":
      return eliminarCafAdmin(documentoId);
    case "convenio":
      return eliminarConvenioAdmin(documentoId);
    case "convenioHCP":
      return eliminarConvenioHCPAdmin(documentoId);
    case "fmv":
      return eliminarFmvAdmin(documentoId);
    case "notificacionPago":
      return eliminarNotificacionPagoAdmin(documentoId);
  }
}
