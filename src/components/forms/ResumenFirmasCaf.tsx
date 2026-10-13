import * as React from "react";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { previsualizarCadenaCaf, type LineaFirmaPrevia } from "@/lib/caf";

/**
 * Entrega 24 — "Matriz de firmas" del CAF, en el formulario: muestra, ANTES de enviar, quién firmará
 * cada línea del formato según el perfil del solicitante (jefe inmediato, área/director de área,
 * Compliance Officer LATAM…) y cuáles se firman solas. Es solo informativa: se arma en el servidor
 * (`previsualizar_cadena_caf`) con las mismas reglas con las que se arma la cadena real al enviar.
 */
export function ResumenFirmasCaf({
  solicitanteId,
  onCargado,
}: {
  /** Quien enviará el CAF (por defecto, el usuario en sesión). */
  solicitanteId?: string;
  onCargado?: (lineas: LineaFirmaPrevia[]) => void;
}) {
  const [lineas, setLineas] = React.useState<LineaFirmaPrevia[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const alCargar = React.useRef(onCargado);
  alCargar.current = onCargado;

  React.useEffect(() => {
    let cancelado = false;
    previsualizarCadenaCaf(solicitanteId)
      .then((l) => {
        if (cancelado) return;
        setLineas(l);
        alCargar.current?.(l);
      })
      .catch((e) => {
        if (!cancelado) setError(e instanceof Error ? e.message : "No se pudo calcular la matriz de firmas.");
      });
    return () => {
      cancelado = true;
    };
  }, [solicitanteId]);

  if (error) {
    return (
      <p className="text-xs text-muted-foreground">
        No se pudo mostrar la matriz de firmas ({error}). Si acabas de actualizar la aplicación, ejecuta <code>db/entrega_24b_caf_matriz_firmas.sql</code>.
      </p>
    );
  }
  if (!lineas) return <p className="text-xs text-muted-foreground">Calculando la matriz de firmas…</p>;

  return (
    <div className="flex flex-col gap-2" data-testid="caf-matriz-firmas">
      <p className="text-xs text-muted-foreground">
        Estas son las firmas del formato según tu perfil. Las marcadas como automáticas se firman solas al enviar; el resto recibe una tarea pendiente, una notificación y un correo cuando le toque.
      </p>
      <ul className="flex flex-col gap-1.5">
        {lineas.map((l) => {
          const noAplica = l.tipoFirma === "lider_fv_tv";
          return (
            <li key={l.orden} className="flex flex-col gap-0.5 rounded-md border p-2 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span className="font-medium">{l.etiqueta}</span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {noAplica ? (
                  "N/A"
                ) : l.automatica ? (
                  <>
                    <CheckCircle2 className="size-3.5 text-emerald-600" />
                    Firma automática{l.firmantes[0] ? ` (${l.firmantes[0].nombre})` : ""}
                  </>
                ) : l.firmantes.length > 0 ? (
                  <>
                    <Clock className="size-3.5" />
                    {l.firmantes.map((f) => f.nombre).join(", ")}
                  </>
                ) : l.advertencia ? (
                  <>
                    <AlertTriangle className="size-3.5 text-amber-600" />
                    Sin firmante configurado
                  </>
                ) : (
                  <>
                    <Clock className="size-3.5" />
                    Según el rol
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {lineas.some((l) => l.advertencia) && (
        <div className="flex flex-col gap-1 rounded-md border border-amber-300/60 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {lineas.filter((l) => l.advertencia).map((l) => (
            <p key={l.orden}>{l.advertencia}</p>
          ))}
          <p>Puedes enviar el CAF igual: se avisará a los administradores para que no se detenga.</p>
        </div>
      )}
    </div>
  );
}
