import * as React from "react";
import { toast } from "sonner";
import { Search, FileStack } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { VisorArchivo } from "@/components/archivos/VisorArchivo";
import { useAbrirDocumentoGenerico } from "@/hooks/useAbrirDocumentoGenerico";
import { useCompania } from "@/hooks/useCompania";
import { useAuth } from "@/hooks/useAuth";
import { empresaPermitida, empresasPermitidas, paisPermitido, paisesPermitidos } from "@/lib/alcance";
import { traerEventos } from "@/lib/evento";
import { traerFmvs } from "@/lib/fmv";
import { traerSpeakers } from "@/lib/speakers";
import { traerTodosLosArchivosRepositorio, traerTodosLosRegistrosFinancieros } from "@/lib/repositorioEvento";
import { traerArchivos, type ArchivoAdjunto } from "@/lib/archivosAdjuntos";
import { ETIQUETA_CATEGORIA_REPOSITORIO_ARCHIVO, ETIQUETA_CATEGORIA_FINANCIERA_REPOSITORIO } from "@/lib/enums";
import { mensajeErrorAmigable } from "@/lib/supabaseClient";
import { formatearFecha } from "@/lib/fecha";
import { FiltroFechaDesplegable, FiltroUnico, resumenRango } from "@/components/ui/filtros-desplegables";
import type { VistaArchivado } from "@/components/ui/filtro-archivado";
import { Button } from "@/components/ui/button";
import { useMesesArchivado } from "@/hooks/useArchivado";
import { estaArchivado } from "@/lib/archivado";
import { RANGO_VACIO, hayRango, coincideRango, intervaloCoincideRango, type RangoFechas } from "@/lib/filtroFechas";
import type { EstadoDoc } from "@/lib/enums";
import type { Evento, Speaker } from "@/types";

interface FilaDocumento {
  archivoId: string;
  categoria: string;
  origen: string;
  tipoOrigen: string;
  onAbrirOrigen?: () => void;
  /** Entrega 28: datos del documento de origen para filtrar por fecha de evento y archivar (los soportes de speaker no tienen). */
  estadoOrigen?: EstadoDoc;
  fechaInicioOrigen?: string | null;
  fechaFinOrigen?: string | null;
}

const TAMANO_PAGINA = 60;
type BaseFecha = "carga" | "evento";
const BASES_FECHA: { valor: BaseFecha; etiqueta: string }[] = [
  { valor: "carga", etiqueta: "Fecha de carga del archivo" },
  { valor: "evento", etiqueta: "Fecha del evento" },
];

function datosOrigenEvento(e: Evento) {
  return { estadoOrigen: e.estado, fechaInicioOrigen: e.fechaInicioEvento, fechaFinOrigen: e.fechaFinEvento };
}

/**
 * Fase 6 (Tablero, Informes y Auditoría enriquecidos) — "Documentos
 * (todos)" (id de página `documentos`): un listado plano de TODOS los
 * archivos cargados en la aplicación, sin importar de qué documento
 * vienen — confirmado por extracción directa del bundle original (función
 * `Fz`, vista de Legal/Compliance). Antes de esta fase caía en el
 * placeholder genérico.
 *
 * Fuentes de archivo reconstruidas: soportes de Speakers (RETHUS/hoja de
 * vida/identidad), anexos de la Solicitud de Evento (carta de
 * invitación/programa académico) + todo su Repositorio del Evento (7
 * categorías de archivo + 3 financieras), y el tarifario de asociación
 * científica del FMV Checklist — exactamente las mismas fuentes que el
 * original, adaptadas al esquema normalizado de esta reconstrucción
 * (`evento_repositorio_archivos`/`evento_registros_financieros` en vez de
 * un objeto anidado en el Evento, ver `lib/repositorioEvento.ts`).
 */
export function Documentos() {
  const { companiaActual } = useCompania();
  const { usuario } = useAuth();
  const [busqueda, setBusqueda] = React.useState("");
  const [cargando, setCargando] = React.useState(true);
  const [rangoFechas, setRangoFechas] = React.useState<RangoFechas>(RANGO_VACIO);
  const [baseFecha, setBaseFecha] = React.useState<BaseFecha>("carga");
  const [vistaArchivado, setVistaArchivado] = React.useState<VistaArchivado>("activos");
  const [visibles, setVisibles] = React.useState(TAMANO_PAGINA);
  const mesesArchivado = useMesesArchivado();
  const [filas, setFilas] = React.useState<Array<FilaDocumento & { archivo: ArchivoAdjunto }>>([]);

  const { abrir, dialogos } = useAbrirDocumentoGenerico();

  React.useEffect(() => {
    Promise.all([traerEventos(), traerFmvs(), traerSpeakers(), traerTodosLosArchivosRepositorio(), traerTodosLosRegistrosFinancieros()])
      .then(async ([eventosCrudos, fmvsCrudos, speakers, archivosRepo, financierosRepo]) => {
        // Selector de compañía del grupo (pedido explícito, octubre 2026):
        // "Visor Documental" solo debe listar archivos de la compañía
        // con la que se está trabajando. Los archivos de Repositorio del
        // Evento se filtran indirecto: se descartan si su evento no quedó
        // en `eventosPorIdLocal` (ya filtrado por compañía).
        //
        // Octubre 2026, pedido explícito: además se restringe por PAÍS y por
        // COMPAÑÍA del usuario — los documentos se ven solo donde el speaker
        // tiene relación o donde se generó el documento, nunca para todo el
        // mundo. Sin usuario en sesión no se lista nada.
        if (!usuario) {
          setFilas([]);
          return;
        }
        const empresasOk = empresasPermitidas(usuario, companiaActual);
        const paisesOk = paisesPermitidos(usuario);
        // Un evento de varias sesiones puede tener su país en las sesiones.
        const eventos = eventosCrudos.filter(
          (e) => empresaPermitida(empresasOk, e.empresaGrupo) && [e.pais, ...e.sesiones.map((s) => s.pais)].some((p) => paisPermitido(paisesOk, p)),
        );
        const fmvs = fmvsCrudos.filter(
          (f) => empresaPermitida(empresasOk, f.empresaGrupo) && (paisPermitido(paisesOk, f.pais) || (f.eventoOrigenId != null && eventos.some((e) => e.id === f.eventoOrigenId))),
        );
        const eventosPorIdLocal = new Map(eventos.map((e) => [e.id, e]));

        // Un speaker tiene relación con el alcance si interactúa con una de las compañías permitidas Y (está en un país
        // permitido O participa en un evento ya dentro del alcance).
        const speakersDeEventos = new Set(eventos.flatMap((e) => e.speakersParticipacion.map((sp) => sp.speakerId).filter((id): id is string => Boolean(id))));
        const speakersEnAlcance = (speakers as Speaker[]).filter(
          (s) =>
            (!empresasOk || s.empresasGrupoInteraccion.some((emp) => empresaPermitida(empresasOk, emp))) &&
            (paisPermitido(paisesOk, s.pais) || speakersDeEventos.has(s.id)),
        );

        const pendientes: FilaDocumento[] = [];

        for (const s of speakersEnAlcance) {
          if (s.archivoRethusId) pendientes.push({ archivoId: s.archivoRethusId, categoria: "Licencia RETHUS", origen: s.nombreCompleto, tipoOrigen: "Speaker" });
          if (s.archivoHojaVidaId) pendientes.push({ archivoId: s.archivoHojaVidaId, categoria: "Hoja de Vida / CV", origen: s.nombreCompleto, tipoOrigen: "Speaker" });
          if (s.archivoIdentidadId) pendientes.push({ archivoId: s.archivoIdentidadId, categoria: "Documento de identidad", origen: s.nombreCompleto, tipoOrigen: "Speaker" });
        }

        for (const e of eventos) {
          const origen = e.nombreEvento || "(sin nombre)";
          if (e.cartaInvitacionId) pendientes.push({ archivoId: e.cartaInvitacionId, categoria: "Carta de invitación", origen, tipoOrigen: "Solicitud de Evento", onAbrirOrigen: () => abrir(e), ...datosOrigenEvento(e) });
          if (e.programaAcademicoId) pendientes.push({ archivoId: e.programaAcademicoId, categoria: "Programa académico", origen, tipoOrigen: "Solicitud de Evento", onAbrirOrigen: () => abrir(e), ...datosOrigenEvento(e) });
        }

        for (const a of archivosRepo) {
          if (!a.archivoId) continue; // fila "No aplica": no hay archivo que listar
          const evento = eventosPorIdLocal.get(a.eventoId);
          if (!evento) continue; // sin evento en esta compañía: fuera de alcance.
          pendientes.push({
            archivoId: a.archivoId,
            categoria: ETIQUETA_CATEGORIA_REPOSITORIO_ARCHIVO[a.categoria],
            origen: evento.nombreEvento || "(sin nombre)",
            tipoOrigen: "Solicitud de Evento",
            onAbrirOrigen: () => abrir(evento),
            ...datosOrigenEvento(evento),
          });
        }
        for (const f of financierosRepo) {
          const evento = eventosPorIdLocal.get(f.eventoId);
          if (!evento) continue; // sin evento en esta compañía: fuera de alcance.
          pendientes.push({
            archivoId: f.archivoId,
            categoria: ETIQUETA_CATEGORIA_FINANCIERA_REPOSITORIO[f.categoria],
            origen: evento.nombreEvento || "(sin nombre)",
            tipoOrigen: "Solicitud de Evento",
            onAbrirOrigen: () => abrir(evento),
            ...datosOrigenEvento(evento),
          });
        }

        for (const f of fmvs) {
          if (f.archivoTarifarioAsociacionId) {
            pendientes.push({
              archivoId: f.archivoTarifarioAsociacionId,
              categoria: "Tarifario de asociación científica",
              origen: f.nombreCompleto || "(sin nombre)",
              tipoOrigen: "FMV Checklist",
              onAbrirOrigen: () => abrir(f),
              estadoOrigen: f.estado,
              fechaInicioOrigen: f.fecha,
              fechaFinOrigen: f.fecha,
            });
          }
        }

        const archivos = await traerArchivos(pendientes.map((p) => p.archivoId));
        const completas = pendientes
          .map((p) => {
            const archivo = archivos.get(p.archivoId);
            return archivo ? { ...p, archivo } : null;
          })
          .filter((f): f is FilaDocumento & { archivo: ArchivoAdjunto } => f !== null)
          .sort((a, b) => new Date(b.archivo.cargadoEn).getTime() - new Date(a.archivo.cargadoEn).getTime());
        setFilas(completas);
      })
      .catch((error) => toast.error(mensajeErrorAmigable(error)))
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companiaActual, usuario]);

  const estaFilaArchivada = React.useCallback(
    (f: FilaDocumento & { archivo: ArchivoAdjunto }) =>
      // Los soportes de speaker (sin documento de origen con fecha) nunca se archivan.
      Boolean(mesesArchivado && f.estadoOrigen) &&
      estaArchivado({ estado: f.estadoOrigen as EstadoDoc, fechaFin: f.fechaFinOrigen, fechaInicio: f.fechaInicioOrigen, creadoEn: f.archivo.cargadoEn }, mesesArchivado),
    [mesesArchivado],
  );

  const sinArchivado = React.useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filas.filter((f) => {
      if (q && !(f.archivo.nombre.toLowerCase().includes(q) || f.origen.toLowerCase().includes(q) || f.categoria.toLowerCase().includes(q))) return false;
      return baseFecha === "carga"
        ? coincideRango(f.archivo.cargadoEn, rangoFechas)
        : intervaloCoincideRango(f.fechaInicioOrigen ?? f.archivo.cargadoEn, f.fechaFinOrigen ?? f.fechaInicioOrigen ?? f.archivo.cargadoEn, rangoFechas);
    });
  }, [filas, busqueda, rangoFechas, baseFecha]);

  const cantidadArchivados = React.useMemo(() => sinArchivado.filter(estaFilaArchivada).length, [sinArchivado, estaFilaArchivada]);

  const filtradas = React.useMemo(() => {
    if (!mesesArchivado || vistaArchivado === "todos") return sinArchivado;
    return sinArchivado.filter((f) => estaFilaArchivada(f) === (vistaArchivado === "archivados"));
  }, [sinArchivado, estaFilaArchivada, mesesArchivado, vistaArchivado]);

  React.useEffect(() => {
    setVisibles(TAMANO_PAGINA);
  }, [busqueda, rangoFechas, baseFecha, vistaArchivado, mesesArchivado, companiaActual]);

  return (
    <div className="mx-auto flex max-w-full flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Visor Documental</h1>
        <p className="text-sm text-muted-foreground">
          Todos los documentos y archivos cargados en la aplicación: soportes de speakers, anexos y repositorio de eventos, y tarifarios de FMV
          Checklist. {filas.length} archivo(s) en total.
        </p>
      </div>

      {/* Entrega 30: búsqueda + filtros como listas desplegables a la derecha, con chips de filtros activos. */}
      <div className="flex flex-col gap-3" data-testid="documentos-filtros">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-9 pl-9" placeholder="Buscar por nombre de archivo, HCP/evento o categoría..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          </div>
          <FiltroFechaDesplegable rango={rangoFechas} onRango={setRangoFechas} base={baseFecha} onBase={setBaseFecha} bases={BASES_FECHA} testId="documentos-filtro-fechas" />
          {mesesArchivado > 0 && (
            <FiltroUnico
              etiqueta="Archivo"
              testId="filtro-archivado"
              valor={vistaArchivado}
              onChange={(v) => setVistaArchivado(v as VistaArchivado)}
              valorPorDefecto="activos"
              opciones={[
                { valor: "activos", etiqueta: "Activos" },
                { valor: "archivados", etiqueta: "Archivados", conteo: cantidadArchivados },
                { valor: "todos", etiqueta: "Todos" },
              ]}
            />
          )}
          {(hayRango(rangoFechas) || (mesesArchivado > 0 && vistaArchivado !== "activos")) && (
            <button type="button" className="h-9 rounded-lg px-2 text-sm text-slate-500 hover:text-slate-800" data-testid="documentos-limpiar-filtros" onClick={() => { setRangoFechas(RANGO_VACIO); setVistaArchivado("activos"); }}>
              Limpiar
            </button>
          )}
        </div>
        {(resumenRango(rangoFechas) || (mesesArchivado > 0 && vistaArchivado !== "activos")) && (
          <div className="flex flex-wrap items-center gap-1.5" data-testid="documentos-chips">
            {resumenRango(rangoFechas) && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#e0f4fc] py-0.5 pl-2.5 pr-1 text-xs font-medium text-[#0679a8]">
                Fecha: {resumenRango(rangoFechas)}
                <button type="button" aria-label="Quitar filtro" className="rounded-full p-0.5 hover:bg-[#bfe7f7]" onClick={() => setRangoFechas(RANGO_VACIO)}>✕</button>
              </span>
            )}
            {mesesArchivado > 0 && vistaArchivado !== "activos" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#e0f4fc] py-0.5 pl-2.5 pr-1 text-xs font-medium text-[#0679a8]">
                Archivo: {vistaArchivado === "archivados" ? "Archivados" : "Todos"}
                <button type="button" aria-label="Quitar filtro" className="rounded-full p-0.5 hover:bg-[#bfe7f7]" onClick={() => setVistaArchivado("activos")}>✕</button>
              </span>
            )}
          </div>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2 pt-6">
          {cargando && <p className="text-sm text-muted-foreground">Cargando...</p>}
          {!cargando && filtradas.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-14 text-center">
              <FileStack className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm font-medium">No hay documentos con este filtro</p>
            </div>
          )}
          {!cargando &&
            filtradas.slice(0, visibles).map((f, idx) => (
              <div key={`${f.archivo.id}-${idx}`} className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{f.archivo.nombre}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span className="rounded-full border px-2 py-0.5">{f.categoria}</span>
                    <span>{f.tipoOrigen} — {f.origen}</span>
                    <span>· {formatearFecha(f.archivo.cargadoEn)}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {f.onAbrirOrigen && (
                    <button onClick={f.onAbrirOrigen} className="text-xs font-medium text-primary hover:underline">
                      Ver origen
                    </button>
                  )}
                  <VisorArchivo archivoId={f.archivo.id} etiqueta="Ver archivo" size="sm" variant="ghost" />
                </div>
              </div>
            ))}
          {!cargando && filtradas.length > 0 && (
            <div className="flex flex-col items-center gap-2 pt-2 text-xs text-muted-foreground" data-testid="documentos-paginacion">
              <span>
                Mostrando {Math.min(visibles, filtradas.length)} de {filtradas.length} archivo(s)
              </span>
              {visibles < filtradas.length && (
                <Button variant="outline" size="sm" onClick={() => setVisibles((v) => v + TAMANO_PAGINA)} data-testid="documentos-mostrar-mas">
                  Mostrar más
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      {dialogos}
    </div>
  );
}
