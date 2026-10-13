import * as React from "react";
import { toast } from "sonner";
import { FiltroMulti, FiltroUnico } from "@/components/ui/filtros-desplegables";
import {
  FileEdit,
  Send,
  CheckCircle2,
  XCircle,
  RefreshCw,
  CheckCheck,
  Ban,
  Trash2,
  FilePlus2,
  FileQuestion,
  FileText,
  Undo2,
  FilePenLine,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { traerAuditoria } from "@/lib/auditoria";
import { traerPaises } from "@/lib/paisesRegion";
import { TIPO_ACCION_AUDITORIA, ETIQUETA_ACCION_AUDITORIA, type TipoAccionAuditoria } from "@/lib/enums";
import { mensajeErrorAmigable } from "@/lib/supabaseClient";
import { formatearFechaHora } from "@/lib/fecha";
import { useUsuariosPorId } from "@/hooks/useUsuariosPorId";
import { AvatarUsuario } from "@/components/AvatarUsuario";
import { useCompania } from "@/hooks/useCompania";
import { useAuth } from "@/hooks/useAuth";
import { alcanceDe, alcanceVisible, paisesPermitidos, resolverAlcanceDocumentos, type AlcanceRegistro } from "@/lib/alcance";
import type { Auditoria } from "@/types";
import { mismoPais } from "@/lib/paisCanonico";

const TODOS_PAISES = "__todos__";

/**
 * Fase 6 (Tablero, Informes y Auditoría enriquecidos) — esta es la pantalla
 * "Historial y Auditoría" real del bundle original (id de página
 * `historial`, línea de tiempo cronológica). Antes de esta fase, esta misma
 * lógica vivía en `Auditoria.tsx` pero cableada al id de página `auditoria`
 * — un cruce de nombres confirmado por extracción directa del bundle: la
 * pantalla `auditoria` del original es en realidad "Auditoría de Eventos"
 * (ver `AuditoriaEventos.tsx`), un checklist de documentos faltantes por
 * evento, completamente distinto de este log cronológico.
 *
 * Se rediseña como línea de tiempo (pastillas de Acción + selector de País,
 * sin filtro de Tipo de documento ni de rango de fechas) para que coincida
 * con la pantalla real, confirmado por extracción directa del bundle
 * original (función `aD`) — antes era una tabla plana con filtros de
 * tipo/acción/fecha, que no es como luce la pantalla real. Se mantiene el
 * límite de "500 filas más recientes" de `traerAuditoria` (Fase 5): es una
 * salvaguarda de volumen propia de esta reconstrucción, no algo que el
 * original necesitara (el original carga todo el historial de una vez al
 * iniciar sesión).
 *
 * Deliberadamente fuera de alcance: la miniatura de firma junto a las
 * entradas de aprobación/rechazo que el original muestra — requeriría
 * resolver el archivo de firma de cada usuario (`Usuario.firmaId`) además
 * de su nombre/cargo, y no aporta información nueva más allá de "quién
 * resolvió esta etapa", que el nombre ya deja claro.
 */

const TIPO_ACCION_AUDITORIA_HISTORIAL: TipoAccionAuditoria[] = [...TIPO_ACCION_AUDITORIA];

const ICONO_Y_COLOR_POR_ACCION: Record<TipoAccionAuditoria, { icono: typeof FileEdit; color: string }> = {
  creacion: { icono: FileEdit, color: "var(--status-draft-fg)" },
  envio: { icono: Send, color: "hsl(var(--primary))" },
  aprobacion_parcial: { icono: CheckCircle2, color: "var(--status-approved-fg)" },
  aprobacion_final: { icono: CheckCircle2, color: "var(--status-approved-fg)" },
  rechazo: { icono: XCircle, color: "var(--status-rejected-fg)" },
  edicion_reenvio: { icono: RefreshCw, color: "hsl(var(--primary))" },
  completado: { icono: CheckCheck, color: "var(--status-approved-fg)" },
  anulacion: { icono: Ban, color: "var(--status-void-fg)" },
  eliminacion: { icono: Trash2, color: "var(--status-rejected-fg)" },
  adenda_solicitada: { icono: FilePlus2, color: "hsl(var(--primary))" },
  borrador_actualizado: { icono: FilePenLine, color: "var(--status-draft-fg)" },
  devuelto: { icono: Undo2, color: "var(--status-draft-fg)" },
  enmienda_solicitada: { icono: FilePlus2, color: "hsl(var(--primary))" },
  anotacion_pago_editada: { icono: FilePenLine, color: "hsl(var(--primary))" },
  anotacion_pago_eliminada: { icono: Trash2, color: "var(--status-rejected-fg)" },
};
const ICONO_Y_COLOR_DEFAULT = { icono: FileQuestion, color: "hsl(var(--muted-foreground))" };

const ES_APROBACION_O_RECHAZO = new Set<TipoAccionAuditoria>(["aprobacion_parcial", "aprobacion_final", "rechazo"]);

export function Historial() {
  const { companiaActual } = useCompania();
  const { usuario } = useAuth();
  const [filas, setFilas] = React.useState<Auditoria[]>([]);
  // Octubre 2026: alcance (compañía/país) de los registros que no lo traen guardado (anteriores a este ajuste).
  const [alcances, setAlcances] = React.useState<Map<string, AlcanceRegistro>>(new Map());
  const [paises, setPaises] = React.useState<string[]>([]);
  const [cargando, setCargando] = React.useState(true);
  const [filtroAccion, setFiltroAccion] = React.useState<string[]>([]);
  const [filtroPais, setFiltroPais] = React.useState<string>(TODOS_PAISES);

  React.useEffect(() => {
    Promise.all([traerAuditoria(), traerPaises()])
      .then(async ([f, p]) => {
        const sinAlcance = f.filter((x) => !x.empresaGrupo || !x.pais);
        if (sinAlcance.length > 0) setAlcances(await resolverAlcanceDocumentos(sinAlcance.map((x) => ({ tipoDoc: x.tipoDoc, documentoId: x.documentoId }))));
        setFilas(f);
        setPaises(p);
      })
      .catch((error) => toast.error(mensajeErrorAmigable(error)))
      .finally(() => setCargando(false));
  }, []);

  const filtradas = React.useMemo(() => {
    // Selector de compañía del grupo (pedido explícito, octubre 2026): un
    // registro de auditoría con `empresaGrupo` vacío (documentos previos a
    // esta funcionalidad, o sin esa columna poblada) se sigue mostrando —
    // mismo comodín "sin restricción" que el resto de la app.
    // Octubre 2026, pedido explícito: restringido por PAÍS y COMPAÑÍA. Cada registro se evalúa con su compañía/país guardados
    // o, si no los trae, con los del documento (o evento de origen). Un registro cuyo alcance no se puede determinar no se
    // muestra a un usuario con restricciones (los usuarios sin restricciones —listas vacías— lo siguen viendo todo).
    let resultado = usuario
      ? filas.filter((f) => {
          const resuelto = alcanceDe(alcances, f.tipoDoc, f.documentoId);
          return alcanceVisible(usuario, companiaActual, { empresaGrupo: f.empresaGrupo ?? resuelto?.empresaGrupo ?? null, pais: f.pais ?? resuelto?.pais ?? null });
        })
      : [];
    if (filtroAccion.length) resultado = resultado.filter((f) => filtroAccion.includes(f.accion));
    if (filtroPais !== TODOS_PAISES) resultado = resultado.filter((f) => mismoPais(f.pais ?? alcanceDe(alcances, f.tipoDoc, f.documentoId)?.pais, filtroPais));
    return [...resultado].sort((a, b) => new Date(b.ocurridoEn).getTime() - new Date(a.ocurridoEn).getTime());
  }, [filas, filtroAccion, filtroPais, companiaActual, usuario, alcances]);

  // El selector de país solo ofrece los países que la persona puede ver.
  const paisesVisibles = React.useMemo(() => {
    const permitidos = usuario ? paisesPermitidos(usuario) : [];
    return permitidos ? paises.filter((p) => permitidos.some((x) => mismoPais(x, p))) : paises;
  }, [paises, usuario]);

  const usuarios = useUsuariosPorId(filtradas.map((f) => f.actorId));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Historial y Auditoría</h1>
        <p className="text-sm text-muted-foreground">Seguimiento cronológico de todos los documentos y aprobaciones — hasta 500 eventos más recientes.</p>
      </div>

      {/* Entrega 30: filtros como listas desplegables + chips de filtros activos. */}
      <div className="flex flex-col gap-3" data-testid="historial-filtros">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground"><span className="text-base font-semibold text-foreground">Eventos</span> · {filtradas.length}</p>
          <div className="flex flex-wrap items-center gap-2" data-testid="historial-filtro-accion">
            <FiltroMulti
              etiqueta="Acción"
              testId="historial-filtro-accion-lista"
              seleccion={filtroAccion}
              onChange={setFiltroAccion}
              opciones={TIPO_ACCION_AUDITORIA_HISTORIAL.map((a) => ({ valor: a, etiqueta: ETIQUETA_ACCION_AUDITORIA[a] }))}
            />
            <FiltroUnico
              etiqueta="País"
              testId="historial-pais"
              valor={filtroPais}
              onChange={setFiltroPais}
              valorPorDefecto={TODOS_PAISES}
              opciones={[{ valor: TODOS_PAISES, etiqueta: "Todos los países" }, ...paisesVisibles.map((p) => ({ valor: p, etiqueta: p }))]}
            />
            {(filtroAccion.length > 0 || filtroPais !== TODOS_PAISES) && (
              <button type="button" className="h-9 rounded-lg px-2 text-sm text-slate-500 hover:text-slate-800" data-testid="historial-limpiar-filtros" onClick={() => { setFiltroAccion([]); setFiltroPais(TODOS_PAISES); }}>
                Limpiar
              </button>
            )}
          </div>
        </div>
        {(filtroAccion.length > 0 || filtroPais !== TODOS_PAISES) && (
          <div className="flex flex-wrap items-center gap-1.5" data-testid="historial-chips">
            {filtroAccion.map((a) => (
              <span key={a} className="inline-flex items-center gap-1 rounded-full bg-[#e0f4fc] py-0.5 pl-2.5 pr-1 text-xs font-medium text-[#0679a8]">
                Acción: {ETIQUETA_ACCION_AUDITORIA[a as TipoAccionAuditoria]}
                <button type="button" aria-label="Quitar filtro" className="rounded-full p-0.5 hover:bg-[#bfe7f7]" onClick={() => setFiltroAccion((p) => p.filter((x) => x !== a))}>✕</button>
              </span>
            ))}
            {filtroPais !== TODOS_PAISES && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#e0f4fc] py-0.5 pl-2.5 pr-1 text-xs font-medium text-[#0679a8]">
                País: {filtroPais}
                <button type="button" aria-label="Quitar filtro" className="rounded-full p-0.5 hover:bg-[#bfe7f7]" onClick={() => setFiltroPais(TODOS_PAISES)}>✕</button>
              </span>
            )}
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-6">
          {cargando && <p className="text-sm text-muted-foreground">Cargando...</p>}
          {!cargando && filtradas.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">No hay eventos de auditoría para este filtro.</p>
          )}
          {!cargando && filtradas.length > 0 && (
            <ol className="relative space-y-6 border-l pl-6">
              {filtradas.map((f) => {
                const { icono: Icono, color } = ICONO_Y_COLOR_POR_ACCION[f.accion] ?? ICONO_Y_COLOR_DEFAULT;
                const actor = usuarios.get(f.actorId);
                const esResolucion = ES_APROBACION_O_RECHAZO.has(f.accion);
                return (
                  <li key={f.id} className="relative">
                    <span
                      className="absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full border-2 bg-card"
                      style={{ borderColor: color }}
                    >
                      <Icono className="h-3.5 w-3.5" style={{ color }} strokeWidth={2.5} />
                    </span>
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <div className="flex items-center gap-2">
                      <AvatarUsuario fotoId={actor?.fotoId ?? null} nombre={actor?.nombre ?? ""} iniciales={actor?.iniciales} className="size-7" fallbackClassName="text-[10px]" />
                      <p className="text-sm">
                        {esResolucion ? (
                          <span>{f.detalle}</span>
                        ) : (
                          <>
                            <span className="font-semibold">{actor?.nombre ?? "—"}</span> <span className="text-muted-foreground">{f.detalle}</span>
                          </>
                        )}
                      </p>
                      </div>
                      <span className="font-mono-tab whitespace-nowrap text-xs text-muted-foreground">
                        {formatearFechaHora(f.ocurridoEn)}
                      </span>
                    </div>
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      {f.documentoNombre}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge variant="outline">{ETIQUETA_ACCION_AUDITORIA[f.accion]}</Badge>
                      {actor?.cargo && <Badge variant="outline">{actor.cargo}</Badge>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
