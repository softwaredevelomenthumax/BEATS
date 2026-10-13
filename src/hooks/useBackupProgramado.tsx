import * as React from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { navegadorPuedeElegirCarpeta, formatearBytes } from "@/lib/backup/api";
import { ejecutarRutina } from "@/lib/backup/programacion";

/** Evento de ventana que avisa a la pantalla «Backup» que una rutina corrió en segundo plano (para refrescar lo que muestra). */
export const EVENTO_BACKUP_ACTUALIZADO = "beats:backup-actualizado";

const CADA_MS = 60_000;

/**
 * Entrega 35 — dispara las rutinas de backup programadas mientras BEATS está abierto. Solo para Administradores de
 * alcance completo, en navegadores que permiten escribir en una carpeta (Chrome / Edge). Revisa cada minuto y al volver a
 * la pestaña; si la rutina está vencida (también si venció con BEATS cerrado) la ejecuta una vez.
 *
 * Si el navegador pide volver a autorizar la carpeta (pasa al reiniciar el navegador), no puede hacerlo solo —necesita un
 * clic—: muestra un aviso con el botón «Autorizar y ejecutar».
 */
export function useBackupProgramado() {
  const { usuario } = useAuth();
  const usuarioId = usuario?.id ?? null;
  const nombre = usuario?.nombre ?? "";
  const habilitado = !!usuario && usuario.esAdministrador && !usuario.administradorAlcanceLimitado && navegadorPuedeElegirCarpeta();

  React.useEffect(() => {
    if (!habilitado || !usuarioId) return;
    const yo = { id: usuarioId, nombre };
    let avisoMostrado = false;
    let detenido = false;

    async function revisar() {
      if (detenido) return;
      const estado = await ejecutarRutina(yo).catch(() => null);
      if (!estado || estado.tipo === "no_corresponde") return;
      window.dispatchEvent(new Event(EVENTO_BACKUP_ACTUALIZADO));
      if (estado.tipo === "ok") {
        toast.success("Backup programado completado", { description: `${estado.resultado.nombreArchivo} · ${formatearBytes(estado.resultado.bytes)}` });
      } else if (estado.tipo === "error") {
        toast.error("Falló el backup programado", { description: estado.mensaje, duration: 15_000 });
      } else if (estado.tipo === "sin_permiso" && !avisoMostrado) {
        avisoMostrado = true;
        toast.warning("Hay un backup programado pendiente", {
          description: `El navegador necesita que autorices de nuevo la carpeta «${estado.programacion.carpetaNombre}».`,
          duration: Infinity,
          action: {
            label: "Autorizar y ejecutar",
            onClick: () => {
              void ejecutarRutina(yo, { forzar: true, solicitarPermiso: true }).then((r) => {
                window.dispatchEvent(new Event(EVENTO_BACKUP_ACTUALIZADO));
                if (r.tipo === "ok") toast.success("Backup programado completado", { description: r.resultado.nombreArchivo });
                else if (r.tipo === "error") toast.error("Falló el backup programado", { description: r.mensaje });
                else if (r.tipo === "sin_permiso") toast.error("No se concedió el acceso a la carpeta.");
              });
            },
          },
        });
      }
    }

    void revisar();
    const reloj = window.setInterval(() => void revisar(), CADA_MS);
    const alVolver = () => {
      if (document.visibilityState === "visible") void revisar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      detenido = true;
      window.clearInterval(reloj);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [habilitado, usuarioId, nombre]);
}
