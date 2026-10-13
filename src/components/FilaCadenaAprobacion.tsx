import { Badge } from "@/components/ui/badge";
import { FirmaManuscritaUsuario } from "@/components/archivos/FirmaManuscrita";
import { AvatarUsuario } from "@/components/AvatarUsuario";
import { ETIQUETA_ESTADO_APROBACION } from "@/lib/enums";
import { formatearFechaHora } from "@/lib/fecha";
import type { PasoAprobacion } from "@/lib/aprobaciones";

/**
 * Octubre 2026, pedido explícito: "en todas las vistas de la cadena de
 * aprobación, los campos de los responsables de la firma deben verse
 * alineados apropiadamente para garantizar la armonía visual".
 *
 * Antes cada fila era un `flex flex-wrap` con piezas de ancho variable (el rol,
 * el nombre, la firma y el estado), así que las columnas no coincidían de una
 * fila a otra y, con una firma presente, todo se corría. Ahora las 4 vistas de
 * detalle (Evento, Convenio de pago, CAF y Convenio HCP) usan esta única
 * fila, con una rejilla de columnas fijas:
 *   rol | nombre (centrado) | firma (centrada) | estado + fecha (a la derecha)
 * En pantallas angostas la fila se apila en una sola columna.
 */
export function FilaCadenaAprobacion({
  paso,
  etiquetaRol,
  nombre,
  firmaId,
  firmantesPendientes,
}: {
  paso: PasoAprobacion;
  /** Texto del rol/etapa a mostrar (cada documento decide si usa la etiqueta del paso o la del rol). */
  etiquetaRol: string;
  /** Nombre de quien resolvió el paso (solo si ya lo aprobó). */
  nombre?: string;
  /** Firma de quien aprobó — ya resuelta (`firmaCongeladaId ?? firma actual`). */
  firmaId?: string | null;
  /**
   * Entrega 24 (CAF): nombres de quienes pueden firmar una línea de persona que sigue pendiente
   * (se muestra como "Firma: Ana, Luis"). Lista vacía = nadie configurado → lo destraba un administrador.
   */
  firmantesPendientes?: string[];
}) {
  // Entrega 24: "Líder FV y TV (local)" nunca firma en el aplicativo: se muestra como N/A.
  const noAplica = paso.tipoFirma === "lider_fv_tv";
  const textoNombre =
    nombre ??
    (paso.estado === "pendiente" && paso.rolRequerido === "persona" && firmantesPendientes
      ? firmantesPendientes.length > 0
        ? `Firma: ${firmantesPendientes.join(", ")}`
        : "Sin firmante configurado (lo resuelve un administrador)"
      : "");
  return (
    <div className="grid grid-cols-1 items-center gap-x-4 gap-y-1 rounded-md border p-2 text-sm sm:grid-cols-[minmax(9rem,1.1fr)_minmax(8rem,1fr)_9rem_8.5rem]">
      <span className="font-medium">{etiquetaRol}</span>
      <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground sm:justify-center" title={textoNombre}>
        {/* Entrega 33: avatar (foto o iniciales) de quien resolvió la etapa. */}
        {!noAplica && nombre && paso.resueltoPorId && <AvatarUsuario usuarioId={paso.resueltoPorId} nombre={nombre} className="size-6 shrink-0" fallbackClassName="text-[10px]" />}
        <span className="min-w-0 truncate sm:text-center">{noAplica ? "" : textoNombre}</span>
      </span>
      <div className="flex min-h-10 items-center sm:justify-center">
        {paso.estado === "aprobado" && !noAplica ? <FirmaManuscritaUsuario firmaId={firmaId} /> : null}
      </div>
      <div className="flex flex-col items-start gap-0.5 sm:items-end">
        <Badge variant={noAplica ? "outline" : paso.estado === "aprobado" ? "approved" : paso.estado === "rechazado" ? "rejected" : "pending"}>
          {noAplica ? "N/A" : paso.automatica && paso.estado === "aprobado" ? "Firmado (automático)" : ETIQUETA_ESTADO_APROBACION[paso.estado]}
        </Badge>
        {paso.estado === "aprobado" && !noAplica && paso.fecha && (
          <span className="text-[11px] text-muted-foreground">{formatearFechaHora(paso.fecha)}</span>
        )}
      </div>
    </div>
  );
}
