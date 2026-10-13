import * as React from "react";
import { toast } from "sonner";
import { Clock, User, FileSignature, HandCoins, ClipboardCheck, Receipt, CheckCircle2, XCircle, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useCompania, filtrarPorEmpresaGrupo, filtrarPorEventoOrigen } from "@/hooks/useCompania";
import { useAbrirDocumentoGenerico } from "@/hooks/useAbrirDocumentoGenerico";
import { traerEventos } from "@/lib/evento";
import { traerConvenios } from "@/lib/convenio";
import { traerFmvs } from "@/lib/fmv";
import { traerNotificacionesPago } from "@/lib/notificacionPago";
import { traerCafs } from "@/lib/caf";
import { traerConveniosHCP } from "@/lib/convenioHCP";
import { traerTodosLosRegistrosFinancieros } from "@/lib/repositorioEvento";
import { pasosPreviosAprobados, lineaRechazada, puedeFirmarPaso } from "@/lib/aprobaciones";
import { fechaRecepcionPaso } from "@/lib/aprobaciones";
import { tituloDocumentoGenerico, diasTranscurridos, type DocumentoAny, type DocumentoConCadena } from "@/lib/documentoGenerico";
import {
  tareaFaltaFmvOConvenio,
  tareaFaltaCaf,
  tareaFaltaConvenioHCPEscalonada,
  documentoActivoDelEvento,
  tareasPorSpeaker,
  tareasNotificacionPagoPorSpeaker,
} from "@/lib/documentosRequeridosEvento";
import { convenioHcpPendienteDeEnvio } from "@/lib/tareasEscalonadas";
import { traerDestinatariosEnviosPorDocumento } from "@/lib/enviosDocumentos";
import { ETIQUETA_TIPO_DOC } from "@/lib/enums";
import { mensajeErrorAmigable } from "@/lib/supabaseClient";
import { formatearFecha, formatearFechaHora } from "@/lib/fecha";
import type { Caf, Convenio, ConvenioHcp, Evento, Fmv, NotificacionPagoHcp, RegistroFinancieroEvento } from "@/types";
import type { EstadoDoc, TipoDoc } from "@/lib/enums";

const VARIANTE_POR_ESTADO: Record<EstadoDoc, BadgeProps["variant"]> = {
  Borrador: "draft",
  Pendiente: "pending",
  Aprobado: "approved",
  Rechazado: "rejected",
  Devuelto: "draft",
  Completado: "completed",
  Anulado: "cancelled",
};

function PillPendiente({ dias }: { dias: number }) {
  return (
    <span
      className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-semibold"
      style={{ background: "var(--status-pending-bg)", color: "var(--status-pending-fg)" }}
    >
      <Clock className="h-3 w-3" /> Pendiente hace {dias} día(s)
    </span>
  );
}

function SeccionTareas({ titulo, subtitulo, vacio, children }: { titulo: string; subtitulo?: string; vacio: boolean; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
        {subtitulo && <CardDescription>{subtitulo}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {vacio ? <p className="text-sm text-muted-foreground">Nada pendiente aquí por ahora.</p> : children}
      </CardContent>
    </Card>
  );
}

/**
 * Fase 6 (Tablero, Informes y Auditoría enriquecidos) — "Tareas Pendientes"
 * (id de página `tareas`): antes de esta fase caía en el placeholder
 * genérico pese a que `navegacion.ts` ya tenía su título/subtítulo
 * correctos. Confirmado por extracción directa del bundle original
 * (función `Bz`): 6 secciones — aprobaciones que te tocan a ti, 4 secciones
 * de "documento siguiente en la cadena" visibles solo para Dirección
 * Médica, y tus propias solicitudes con su estado. Las reglas de "qué le
 * falta a un evento" (FMV/Convenio → CAF → Convenio HCP → Notificación de
 * Pago) están centralizadas en `lib/documentosRequeridosEvento.ts` —
 * compartidas con Auditoría de Eventos.
 */
export function TareasPendientes({
  irANuevoDocumento,
}: {
  /**
   * "Tareas Pendientes" → "diligenciar este documento" (ajuste de precisión,
   * septiembre 2026, pedido explícito): al dar clic en una tarea de "falta
   * X", abre el formulario de creación de ese documento con el evento (y
   * speaker, si aplica) ya seleccionados, en vez de solo abrir el detalle
   * de solo lectura del evento.
   */
  irANuevoDocumento: (tipoDoc: TipoDoc, eventoOrigenId: string, speakerId?: string) => void;
}) {
  const { usuario } = useAuth();
  const { companiaActual } = useCompania();
  const [eventos, setEventos] = React.useState<Evento[] | null>(null);
  const [convenios, setConvenios] = React.useState<Convenio[] | null>(null);
  const [fmvs, setFmvs] = React.useState<Fmv[] | null>(null);
  const [notificaciones, setNotificaciones] = React.useState<NotificacionPagoHcp[] | null>(null);
  const [cafs, setCafs] = React.useState<Caf[] | null>(null);
  const [conveniosHCP, setConveniosHCP] = React.useState<ConvenioHcp[] | null>(null);
  const [financierosRepo, setFinancierosRepo] = React.useState<RegistroFinancieroEvento[] | null>(null);
  const [enviosConvenioHcp, setEnviosConvenioHcp] = React.useState<Map<string, Set<string>>>(new Map());

  function cargarTodo() {
    Promise.all([
      traerEventos(),
      traerConvenios(),
      traerFmvs(),
      traerNotificacionesPago(),
      traerCafs(),
      traerConveniosHCP(),
      traerTodosLosRegistrosFinancieros(),
      traerDestinatariosEnviosPorDocumento("convenioHCP"),
    ])
      .then(([e, c, f, n, ca, chcp, fr, envios]) => {
        setEnviosConvenioHcp(envios);
        setEventos(e);
        setConvenios(c);
        setFmvs(f);
        setNotificaciones(n);
        setCafs(ca);
        setConveniosHCP(chcp);
        setFinancierosRepo(fr);
      })
      .catch((error) => toast.error(mensajeErrorAmigable(error)));
  }

  React.useEffect(cargarTodo, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { abrir, dialogos } = useAbrirDocumentoGenerico(cargarTodo);

  const cargando = eventos === null || convenios === null || fmvs === null || notificaciones === null || cafs === null || conveniosHCP === null || financierosRepo === null;

  if (!usuario || cargando) {
    return <p className="text-sm text-muted-foreground">Cargando...</p>;
  }

  const esMedica = usuario.rol === "medica";

  // Selector de compañía del grupo (pedido explícito, octubre 2026): las
  // tareas pendientes solo deben cubrir documentos de la compañía con la
  // que se está trabajando — mismo criterio de filtrado que el Tablero.
  const eventosDeCompania = filtrarPorEmpresaGrupo(eventos, companiaActual);
  const fmvsDeCompania = filtrarPorEmpresaGrupo(fmvs, companiaActual);
  const notificacionesDeCompania = filtrarPorEmpresaGrupo(notificaciones, companiaActual);
  const idsEventosDeCompania = new Set(eventosDeCompania.map((e) => e.id));
  const conveniosDeCompania = filtrarPorEventoOrigen(convenios, idsEventosDeCompania);
  const cafsDeCompania = filtrarPorEventoOrigen(cafs, idsEventosDeCompania);
  const conveniosHCPDeCompania = filtrarPorEventoOrigen(conveniosHCP, idsEventosDeCompania);

  const docsConCadena: DocumentoConCadena[] = [...eventosDeCompania, ...conveniosDeCompania, ...cafsDeCompania, ...conveniosHCPDeCompania];
  const aprobacionesPendientes = docsConCadena
    .flatMap((doc) => {
      if (doc.estado !== "Pendiente") return [];
      return doc.aprobaciones
        .map((paso, idx) => ({ doc, paso, idx }))
        .filter(
          ({ paso, idx }) => paso.estado === "pendiente" && pasosPreviosAprobados(doc.aprobaciones, idx) && puedeFirmarPaso(usuario, paso),
        );
    })
    .map((x) => ({ ...x, recibidaEn: fechaRecepcionPaso(x.doc, x.idx) }))
    .sort((a, b) => new Date(a.recibidaEn).getTime() - new Date(b.recibidaEn).getTime());

  const tareasFmvConvenio = esMedica
    ? eventosDeCompania.map((ev) => ({ ev, tarea: tareaFaltaFmvOConvenio(ev, conveniosDeCompania, fmvsDeCompania) })).filter(({ tarea }) => tarea.pendiente)
    : [];
  const tareasCaf = esMedica ? eventosDeCompania.filter((ev) => tareaFaltaCaf(ev, conveniosDeCompania, fmvsDeCompania, cafsDeCompania)) : [];
  const tareasConvenioHCP = esMedica
    ? eventosDeCompania.filter((ev) => tareaFaltaConvenioHCPEscalonada(ev, conveniosDeCompania, fmvsDeCompania, conveniosHCPDeCompania))
    : [];
  // Entrega 36: una tarea por speaker con facturas sin Notificación de Pago vigente (antes: una por evento, y solo con Convenio).
  const tareasNotificacionPago = esMedica
    ? eventosDeCompania.flatMap((ev) =>
        tareasNotificacionPagoPorSpeaker(ev, conveniosDeCompania, filtrarPorEventoOrigen(fmvs, idsEventosDeCompania), notificacionesDeCompania, financierosRepo).map((tarea) => ({ ev, tarea })),
      )
    : [];
  // Ronda de ajustes de formularios (septiembre 2026), entrega 3: modelo de
  // N speakers externos — una tarjeta por cada speaker con documentos
  // pendientes, en vez de una tarjeta por evento (`tareaFaltaFmvOConvenio`/
  // `tareaFaltaCaf`/`tareaFaltaConvenioHCP` siguen cubriendo los eventos
  // creados antes de esta ronda, con un solo speaker).
  const tareasSpeakers = esMedica
    ? eventosDeCompania.flatMap((ev) =>
        tareasPorSpeaker(ev, conveniosDeCompania, fmvsDeCompania, cafsDeCompania, conveniosHCPDeCompania)
          .filter((t) => t.pendiente)
          .map((tarea) => ({ ev, tarea })),
      )
    : [];

  // Entrega 28: Convenios HCP ya firmados por Gerencia General / Rep. Legal que Dirección Médica aún no ha enviado al HCP.
  const tareasEnviarConvenioHCP = esMedica
    ? conveniosHCPDeCompania
        .filter(convenioHcpPendienteDeEnvio)
        // Octubre 2026: respaldo — si la bitácora ya registra un envío al correo del HCP, la tarea se cierra aunque la fecha no se haya podido guardar.
        .filter((c) => !enviosConvenioHcp.get(c.id)?.has(c.consultorEmail.trim().toLowerCase()))
        .map((c) => {
          const pasoFirma = c.aprobaciones.find((p) => p.rolRequerido === "gerencia_general" && p.estado === "aprobado");
          return { convenio: c, evento: eventosDeCompania.find((e) => e.id === c.eventoOrigenId), firmadoEn: pasoFirma?.fecha ?? c.creadoEn };
        })
        .sort((a, b) => new Date(a.firmadoEn).getTime() - new Date(b.firmadoEn).getTime())
    : [];

  const misSolicitudes: DocumentoAny[] = [...docsConCadena, ...fmvsDeCompania, ...notificacionesDeCompania]
    .filter((doc) => doc.creadoPorId === usuario.id)
    .sort((a, b) => new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime());

  const nadaPendiente =
    aprobacionesPendientes.length === 0 &&
    tareasFmvConvenio.length === 0 &&
    tareasCaf.length === 0 &&
    tareasConvenioHCP.length === 0 &&
    tareasSpeakers.length === 0 &&
    tareasEnviarConvenioHCP.length === 0 &&
    tareasNotificacionPago.length === 0 &&
    misSolicitudes.length === 0;

  return (
    <div className="mx-auto flex max-w-full flex-col gap-5">
      <p className="text-xs text-muted-foreground">
        Esta pantalla siempre refleja en vivo lo que tienes pendiente. Las tareas se generan por escalones: primero MD FMV Checklist y Convenio de Pago a HCP; cuando ambos están firmados, CAF y Convenio HCP. Cada escalón también te llega por correo y en la campana.
      </p>

      <SeccionTareas
        titulo="Aprobaciones pendientes de tu firma"
        subtitulo={aprobacionesPendientes.length > 0 ? `${aprobacionesPendientes.length} línea(s) esperando tu resolución, de más antigua a más reciente` : undefined}
        vacio={aprobacionesPendientes.length === 0}
      >
        {aprobacionesPendientes.map(({ doc, paso, recibidaEn }) => (
          <button
            key={`${doc.id}-${paso.etiqueta}`}
            onClick={() => abrir(doc)}
            className="flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left transition-colors hover:bg-accent"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{tituloDocumentoGenerico(doc)}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Badge variant="outline">{ETIQUETA_TIPO_DOC[doc.tipoDoc]}</Badge> Línea: {paso.etiqueta}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Elaborado: {formatearFecha(doc.creadoEn)} · Tarea recibida: {formatearFechaHora(recibidaEn)}
              </p>
            </div>
            <PillPendiente dias={diasTranscurridos(recibidaEn)} />
          </button>
        ))}
      </SeccionTareas>

      {esMedica && (
        <SeccionTareas
          titulo="Convenios HCP firmados por enviar al HCP"
          subtitulo="Gerencia General / Rep. Legal ya firmó el convenio: falta enviarlo al HCP para su firma"
          vacio={tareasEnviarConvenioHCP.length === 0}
        >
          {tareasEnviarConvenioHCP.map(({ convenio, evento, firmadoEn }) => (
            <div key={convenio.id} className="rounded-md border p-3" data-testid="tarea-enviar-convenio-hcp">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">
                  {convenio.consultorNombre || "(consultor sin nombre)"}
                  {evento ? ` — ${evento.nombreEvento}` : ""}
                </p>
                <PillPendiente dias={diasTranscurridos(firmadoEn)} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Firmado por la compañía el {formatearFechaHora(firmadoEn)}.</p>
              <div className="mt-2">
                <Button size="sm" className="gap-1.5" onClick={() => abrir(convenio)}>
                  <Send className="h-3.5 w-3.5" /> Enviar convenio firmado al HCP
                </Button>
              </div>
            </div>
          ))}
        </SeccionTareas>
      )}

      {esMedica && (
        <SeccionTareas
          titulo="Tareas de documentos por speaker"
          subtitulo="Por cada speaker externo: primero MD FMV Checklist y Convenio de Pago a HCP; cuando ambos están firmados, CAF y Convenio HCP (se trabajan al mismo tiempo)"
          vacio={tareasSpeakers.length === 0}
        >
          {tareasSpeakers.map(({ ev, tarea }) => (
            <div key={`${ev.id}-${tarea.speaker.id}`} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">
                  {ev.nombreEvento} — {tarea.speaker.nombreSpeaker || "(speaker sin nombre)"}
                </p>
                <PillPendiente dias={diasTranscurridos(ev.creadoEn)} />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {tarea.faltaFmv && (
                  <Button size="sm" className="gap-1.5" onClick={() => irANuevoDocumento("fmv", ev.id, tarea.speaker.speakerId ?? undefined)}>
                    <ClipboardCheck className="h-3.5 w-3.5" /> Falta MD FMV Checklist
                  </Button>
                )}
                {tarea.faltaConvenio && (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => irANuevoDocumento("convenio", ev.id, tarea.speaker.speakerId ?? undefined)}>
                    <HandCoins className="h-3.5 w-3.5" /> Falta Convenio de Pago
                  </Button>
                )}
                {tarea.faltaCaf && (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => irANuevoDocumento("caf", ev.id, tarea.speaker.speakerId ?? undefined)}>
                    <FileSignature className="h-3.5 w-3.5" /> Falta CAF
                  </Button>
                )}
                {tarea.faltaConvenioHCP && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={tarea.convenioHCPEsperaCaf}
                    title={tarea.convenioHCPEsperaCaf ? "Primero genera el CAF (puede quedar en borrador o en trámite): el Convenio HCP se vincula a él." : undefined}
                    onClick={() => irANuevoDocumento("convenioHCP", ev.id, tarea.speaker.speakerId ?? undefined)}
                  >
                    <FileSignature className="h-3.5 w-3.5" /> Falta Convenio HCP
                  </Button>
                )}
              </div>
              {tarea.convenioHCPEsperaCaf && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  El Convenio HCP se vincula al CAF: genera primero el CAF (aunque sea en borrador) y podrás diligenciar ambos al mismo tiempo.
                </p>
              )}
            </div>
          ))}
        </SeccionTareas>
      )}

      {esMedica && (
        <SeccionTareas
          titulo="Tareas de FMV Checklist / Convenio de Pago"
          subtitulo="Eventos con participación académica ya aprobados por Dirección Médica a los que aún les falta alguno de estos documentos (modelo de un solo speaker, anterior a esta ronda)"
          vacio={tareasFmvConvenio.length === 0}
        >
          {tareasFmvConvenio.map(({ ev, tarea }) => (
            <div key={ev.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{ev.nombreEvento}</p>
                <PillPendiente dias={diasTranscurridos(ev.creadoEn)} />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {tarea.faltaFmv && (
                  <Button size="sm" className="gap-1.5" onClick={() => irANuevoDocumento("fmv", ev.id)}>
                    <ClipboardCheck className="h-3.5 w-3.5" /> Falta FMV Checklist
                  </Button>
                )}
                {tarea.faltaConvenio && (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => irANuevoDocumento("convenio", ev.id)}>
                    <HandCoins className="h-3.5 w-3.5" /> Falta Convenio de Pago
                  </Button>
                )}
              </div>
            </div>
          ))}
        </SeccionTareas>
      )}

      {esMedica && (
        <SeccionTareas
          titulo="Tareas de CAF"
          subtitulo="Eventos con FMV Checklist completado y Convenio de Pago a HCP aprobado a los que aún les falta el CAF (modelo de un solo speaker, anterior a esta ronda)"
          vacio={tareasCaf.length === 0}
        >
          {tareasCaf.map((ev) => (
            <div key={ev.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{ev.nombreEvento}</p>
                <PillPendiente dias={diasTranscurridos(ev.creadoEn)} />
              </div>
              <div className="mt-2">
                <Button size="sm" className="gap-1.5" onClick={() => irANuevoDocumento("caf", ev.id)}>
                  <FileSignature className="h-3.5 w-3.5" /> Falta CAF
                </Button>
              </div>
            </div>
          ))}
        </SeccionTareas>
      )}

      {esMedica && (
        <SeccionTareas
          titulo="Tareas de Convenio HCP"
          subtitulo="Eventos con FMV Checklist completado y Convenio de Pago a HCP aprobado a los que aún les falta el Convenio HCP (contrato de consultoría) — modelo de un solo speaker, anterior a esta ronda"
          vacio={tareasConvenioHCP.length === 0}
        >
          {tareasConvenioHCP.map((ev) => (
            <div key={ev.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{ev.nombreEvento}</p>
                <PillPendiente dias={diasTranscurridos(ev.creadoEn)} />
              </div>
              <div className="mt-2">
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={!documentoActivoDelEvento(cafsDeCompania, ev.id)}
                  title={!documentoActivoDelEvento(cafsDeCompania, ev.id) ? "Primero genera el CAF (puede quedar en borrador o en trámite): el Convenio HCP se vincula a él." : undefined}
                  onClick={() => irANuevoDocumento("convenioHCP", ev.id)}
                >
                  <FileSignature className="h-3.5 w-3.5" /> Falta Convenio HCP
                </Button>
                {!documentoActivoDelEvento(cafsDeCompania, ev.id) && (
                  <p className="mt-1.5 text-xs text-muted-foreground">Genera primero el CAF (aunque sea en borrador) y podrás diligenciar ambos al mismo tiempo.</p>
                )}
              </div>
            </div>
          ))}
        </SeccionTareas>
      )}

      {esMedica && (
        <SeccionTareas
          titulo="Tareas de Notificación de Pago a HCPs"
          subtitulo="Speakers con facturas cargadas en el Expediente a los que aún les falta la Notificación de Pago"
          vacio={tareasNotificacionPago.length === 0}
        >
          {tareasNotificacionPago.map(({ ev, tarea }) => (
            <div key={`${ev.id}-${tarea.speakerId ?? "sin-speaker"}`} className="rounded-md border p-3" data-testid="tarea-notificacion-pago">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{ev.nombreEvento} — {tarea.nombre}</p>
                <PillPendiente dias={diasTranscurridos(ev.creadoEn)} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {tarea.facturas.length} factura(s) sin Notificación de Pago: {tarea.facturas.map((f) => f.numero || "sin número").join(", ")}
              </p>
              {tarea.motivoBloqueo && <p className="mt-1 text-xs text-amber-700">{tarea.motivoBloqueo}</p>}
              <div className="mt-2">
                <Button size="sm" className="gap-1.5" disabled={!tarea.puedeGenerarse} onClick={() => irANuevoDocumento("notificacionPago", ev.id, tarea.speakerId ?? undefined)}>
                  <Receipt className="h-3.5 w-3.5" /> Falta Notificación de Pago
                </Button>
              </div>
            </div>
          ))}
        </SeccionTareas>
      )}

      <SeccionTareas titulo="Tus solicitudes" subtitulo="Estado de todo lo que has creado, incluyendo el motivo cuando algo fue rechazado" vacio={misSolicitudes.length === 0}>
        {misSolicitudes.map((doc) => {
          const rechazo = "aprobaciones" in doc ? lineaRechazada(doc.aprobaciones) : null;
          return (
            <button
              key={`${doc.tipoDoc}-${doc.id}`}
              onClick={() => abrir(doc)}
              className="flex w-full flex-col gap-1.5 rounded-md border p-3 text-left transition-colors hover:bg-accent"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-medium">{tituloDocumentoGenerico(doc)}</p>
                <Badge variant={VARIANTE_POR_ESTADO[doc.estado]}>{doc.estado}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                <Badge variant="outline">{ETIQUETA_TIPO_DOC[doc.tipoDoc]}</Badge> · Creado {formatearFecha(doc.creadoEn)}
              </p>
              {rechazo && (
                <p className="mt-1 flex items-start gap-1.5 text-xs" style={{ color: "var(--status-rejected-fg)" }}>
                  <XCircle className="mt-0.5 h-3 w-3 shrink-0" /> Motivo del rechazo ({rechazo.linea.etiqueta}): "{rechazo.linea.comentario}"
                </p>
              )}
              {doc.estado === "Aprobado" && (
                <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--status-approved-fg)" }}>
                  <CheckCircle2 className="h-3 w-3" /> Aprobado — sin acciones pendientes de tu parte.
                </p>
              )}
            </button>
          );
        })}
      </SeccionTareas>

      {nadaPendiente && <p className="text-sm text-muted-foreground">No hay actividad para mostrar en Tareas Pendientes.</p>}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <User className="h-3.5 w-3.5" /> Usuario: {usuario.nombre}
      </div>

      {dialogos}
    </div>
  );
}
