import * as React from "react";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { Telemetria } from "@/lib/telemetria";
import { CompaniaProvider, useCompania } from "@/hooks/useCompania";
import { PantallaLogin } from "@/pages/PantallaLogin";
import { SeleccionCompania } from "@/pages/SeleccionCompania";
import { PantallaCambioPasswordForzado } from "@/pages/PantallaCambioPasswordForzado";
import { Tablero } from "@/pages/Tablero";
import { NuevoCaf } from "@/pages/NuevoCaf";
import { NuevoEvento } from "@/pages/NuevoEvento";
import { NuevoFmv } from "@/pages/NuevoFmv";
import { NuevaNotificacionPago } from "@/pages/NuevaNotificacionPago";
import { NuevoConvenio } from "@/pages/NuevoConvenio";
import { NuevoConvenioHCP } from "@/pages/NuevoConvenioHCP";
import { PlantillaConvenioHcp } from "@/pages/PlantillaConvenioHcp";
import { ConfiguracionCampos } from "@/pages/ConfiguracionCampos";
import { UsuariosRoles } from "@/pages/UsuariosRoles";
import { EliminarDocumentosFirmados } from "@/pages/EliminarDocumentosFirmados";
import { Speakers } from "@/pages/Speakers";
import { InformePorEvento } from "@/pages/InformePorEvento";
import { Expedientes } from "@/pages/Expedientes";
import { Backup } from "@/pages/Backup";
import { useBackupProgramado } from "@/hooks/useBackupProgramado";
import { HcpsImpactados } from "@/pages/HcpsImpactados";
import { InformePagos } from "@/pages/InformePagos";
import { InformeSpeakers } from "@/pages/InformeSpeakers";
import { EjecucionEventos } from "@/pages/EjecucionEventos";
import { PanelEnVivo } from "@/pages/PanelEnVivo";
import { EventosEnVivo } from "@/pages/EventosEnVivo";
import { Historial } from "@/pages/Historial";
import { AuditoriaEventos } from "@/pages/AuditoriaEventos";
import { TareasPendientes } from "@/pages/TareasPendientes";
import { Documentos } from "@/pages/Documentos";
import { ParticipacionSpeaker } from "@/pages/ParticipacionSpeaker";
import { Creditos } from "@/pages/Creditos";
import { IndicadoresUso } from "@/pages/IndicadoresUso";
import { ConfiguracionNotificaciones } from "@/pages/ConfiguracionNotificaciones";
import { navegacionVisible, etiquetaPagina, tituloYSubtitulo, iconoPagina, type PaginaId } from "@/lib/navegacion";
import type { TipoDoc } from "@/lib/enums";
import { NotificacionesBell } from "@/components/NotificacionesBell";
import { DialogoOpcionesFirma } from "@/components/DialogoOpcionesFirma";
import { DialogoPreferencias } from "@/components/DialogoPreferencias";
import { EVENTO_ABRIR_PREFERENCIAS } from "@/lib/archivado";
import { LogoApp } from "@/components/LogoApp";
import { useLogoApp } from "@/hooks/useLogoApp";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AvatarUsuario } from "@/components/AvatarUsuario";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Building2 } from "lucide-react";
import { BandejaVentanasProvider, useBandejaVentanas, PaginaVentanaContexto } from "@/hooks/useBandejaVentanas";
import { VentanasDocumentosProvider } from "@/hooks/useVentanasDocumentos";
import { ConfirmarProvider } from "@/hooks/useConfirmar";
import { ChevronDown, Minus, Pin, PinOff, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "Tareas Pendientes" → "diligenciar este documento" (ajuste de precisión,
 * septiembre 2026, pedido explícito): estado de precarga en tránsito entre
 * `irANuevoDocumento` y la página "nueva-*" de destino. Se aplica una sola
 * vez (la página lo consume al montar vía `usePrecargaInicialOrigen`/lógica
 * equivalente) y se limpia al navegar de nuevo, para no "pegarse" a la
 * página si el usuario luego entra ahí por el sidebar.
 */
interface PrecargaDocumento {
  pagina: PaginaId;
  eventoOrigenId: string;
  speakerId?: string;
}

function ContenidoPagina({
  pagina,
  irA,
  precarga,
  irANuevoDocumento,
}: {
  pagina: PaginaId;
  irA: (p: PaginaId) => void;
  precarga: PrecargaDocumento | null;
  irANuevoDocumento: (tipoDoc: TipoDoc, eventoOrigenId: string, speakerId?: string) => void;
}) {
  const precargaEventoOrigenId = precarga?.pagina === pagina ? precarga.eventoOrigenId : undefined;
  const precargaSpeakerId = precarga?.pagina === pagina ? precarga.speakerId : undefined;

  switch (pagina) {
    case "tablero":
      return <Tablero />;
    case "tareas":
      return <TareasPendientes irANuevoDocumento={irANuevoDocumento} />;
    case "nueva-caf":
      return (
        <NuevoCaf
          onCreado={() => irA("tablero")}
          precargarEventoOrigenId={precargaEventoOrigenId}
          precargarSpeakerId={precargaSpeakerId}
        />
      );
    case "nueva-evento":
      return <NuevoEvento onCreado={() => irA("tablero")} onCancelar={() => irA("tablero")} />;
    case "nueva-fmv":
      return (
        <NuevoFmv
          onCreado={() => irA("tablero")}
          precargarEventoOrigenId={precargaEventoOrigenId}
          precargarSpeakerId={precargaSpeakerId}
        />
      );
    case "nueva-notificacion-pago":
      return (
        <NuevaNotificacionPago
          onCreado={() => irA("tablero")}
          precargarEventoOrigenId={precargaEventoOrigenId}
          precargarSpeakerId={precargaSpeakerId}
        />
      );
    case "nueva-convenio":
      return (
        <NuevoConvenio
          onCreado={() => irA("tablero")}
          onCancelar={() => irA("tablero")}
          precargarEventoOrigenId={precargaEventoOrigenId}
          precargarSpeakerId={precargaSpeakerId}
        />
      );
    case "nueva-convenio-hcp":
      return (
        <NuevoConvenioHCP
          onCreado={() => irA("tablero")}
          precargarEventoOrigenId={precargaEventoOrigenId}
          precargarSpeakerId={precargaSpeakerId}
        />
      );
    case "plantilla-convenio-hcp":
      return <PlantillaConvenioHcp />;
    case "campos":
      return <ConfiguracionCampos />;
    case "roles":
      return <UsuariosRoles />;
    case "eliminar-documentos-firmados":
      return <EliminarDocumentosFirmados />;
    case "speakers":
      return <Speakers />;
    case "documentos":
      return <Documentos />;
    case "informe-participacion-speaker":
      return <ParticipacionSpeaker />;
    case "informe":
      return <InformePorEvento />;
    case "expedientes":
      return <Expedientes />;
    case "backup":
      return <Backup />;
    case "informe-hcps-impactados":
      return <HcpsImpactados />;
    case "informe-pagos":
      return <InformePagos />;
    case "informe-speakers":
      return <InformeSpeakers />;
    case "informe-ejecucion-eventos":
      return <EjecucionEventos />;
    case "panel-en-vivo":
      return <PanelEnVivo />;
    case "eventos-en-vivo":
      return <EventosEnVivo />;
    case "auditoria":
      return <AuditoriaEventos />;
    case "historial":
      return <Historial />;
    case "indicadores-uso":
      return <IndicadoresUso />;
    case "config-notificaciones":
      return <ConfiguracionNotificaciones />;
    case "creditos":
      return <Creditos />;
    default:
      return (
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">{etiquetaPagina(pagina)}</h1>
          <p className="text-sm text-muted-foreground">
            Esta sección todavía no ha sido reconstruida en esta fase.
          </p>
        </div>
      );
  }
}

/**
 * Octubre 2026, pedido explícito: "amplía el ancho de los formularios para
 * garantizar que la información de todos se vea apropiadamente" (p. ej.
 * Usuarios y Roles obligaba a usar barra de desplazamiento horizontal). El
 * tope único de `max-w-5xl` (1024px) se reemplaza por uno por página: las
 * pantallas con tablas o listas densas usan `max-w-7xl` (1280px), las de
 * captura de documentos `max-w-6xl` (1152px), y el resto conserva el ancho
 * ergonómico anterior. En todos los casos el contenedor sigue limitado al
 * ancho de la ventana (`w-full`), nunca lo excede.
 */
const PAGINAS_ANCHO_AMPLIO: ReadonlySet<PaginaId> = new Set<PaginaId>([
  "roles",
  "speakers",
  "campos",
  "documentos",
  "auditoria",
  "historial",
  "informe",
  "expedientes",
  "backup",
  "informe-hcps-impactados",
  "informe-pagos",
  "informe-speakers",
  "informe-ejecucion-eventos",
  "informe-participacion-speaker",
  "eliminar-documentos-firmados",
  "config-notificaciones",
  "indicadores-uso",
]);
const PAGINAS_ANCHO_MEDIO: ReadonlySet<PaginaId> = new Set<PaginaId>([
  "tareas",
  "nueva-evento",
  "nueva-convenio",
  "nueva-fmv",
  "nueva-caf",
  "nueva-convenio-hcp",
  "nueva-notificacion-pago",
  "plantilla-convenio-hcp",
]);

function esPaginaNueva(pagina: PaginaId): boolean {
  return pagina.startsWith("nueva-");
}

function claseAnchoPagina(pagina: PaginaId): string {
  if (PAGINAS_ANCHO_AMPLIO.has(pagina)) return "max-w-7xl";
  if (PAGINAS_ANCHO_MEDIO.has(pagina)) return "max-w-6xl";
  return "max-w-5xl";
}

const PAGINA_POR_TIPO_DOC: Record<TipoDoc, PaginaId> = {
  evento: "nueva-evento",
  fmv: "nueva-fmv",
  convenio: "nueva-convenio",
  caf: "nueva-caf",
  convenioHCP: "nueva-convenio-hcp",
  notificacionPago: "nueva-notificacion-pago",
};

/** Valor de contexto ESTABLE por página (si cambiara en cada render, el efecto de retención de las ventanas entraría en bucle). */
function ProveedorPaginaVentanas({
  pagina,
  retenerVentana,
  children,
}: {
  pagina: PaginaId;
  retenerVentana: (pagina: PaginaId, idVentana: string, retener: boolean) => void;
  children: React.ReactNode;
}) {
  const valor = React.useMemo(
    () => ({ pagina, retener: (idVentana: string, retener: boolean) => retenerVentana(pagina, idVentana, retener) }),
    [pagina, retenerVentana],
  );
  return <PaginaVentanaContexto.Provider value={valor}>{children}</PaginaVentanaContexto.Provider>;
}

function AppShell() {
  const { usuario, cerrarSesion } = useAuth();
  // Entrega 35: rutinas de backup programadas (solo actúa para administradores de alcance completo).
  useBackupProgramado();
  const [opcionesFirmaAbierto, setOpcionesFirmaAbierto] = React.useState(false);
  // Entrega 28: «Mis preferencias» (archivado de documentos). También se abre desde el Tablero con un evento de ventana.
  const [preferenciasAbierto, setPreferenciasAbierto] = React.useState(false);
  React.useEffect(() => {
    const abrir = () => setPreferenciasAbierto(true);
    window.addEventListener(EVENTO_ABRIR_PREFERENCIAS, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_PREFERENCIAS, abrir);
  }, []);
  const { companiaActual, fijarCompania } = useCompania();
  const [paginaActual, setPaginaActual] = React.useState<PaginaId>("tablero");
  const [precarga, setPrecarga] = React.useState<PrecargaDocumento | null>(null);
  const { logoUrl, anchoPx, altoPx } = useLogoApp();

  // Octubre 2026 — ventanas, fase 2: las páginas "Nuevo …" también se pueden
  // minimizar ("_") o cerrar ("X"). Una página minimizada se conserva montada
  // (oculta) con todo lo que se llevaba diligenciado, y aparece en la
  // bandeja; `vivas` son las páginas "Nuevo …" montadas (la actual + las
  // minimizadas). Salir de una página "Nuevo …" SIN minimizar la descarta,
  // como antes.
  const [vivas, setVivas] = React.useState<PaginaId[]>([]);
  const [minimizadas, setMinimizadas] = React.useState<PaginaId[]>([]);
  const bandeja = useBandejaVentanas();

  function irA(pagina: PaginaId) {
    setPrecarga(null);
    setVivas((prev) => {
      const conservadas = prev.filter((p) => !(p === paginaActual && !minimizadas.includes(p)));
      return esPaginaNueva(pagina) && !conservadas.includes(pagina) ? [...conservadas, pagina] : conservadas;
    });
    setMinimizadas((prev) => prev.filter((p) => p !== pagina));
    setPaginaActual(pagina);
  }

  // "Tareas Pendientes" → "diligenciar este documento" (ajuste de precisión,
  // septiembre 2026, pedido explícito): abre la página de creación del
  // documento que falta, con el evento (y speaker, si aplica) ya
  // seleccionados en vez de obligar a buscarlos de nuevo en el selector.
  function irANuevoDocumento(tipoDoc: TipoDoc, eventoOrigenId: string, speakerId?: string) {
    const pagina = PAGINA_POR_TIPO_DOC[tipoDoc];
    if (vivas.includes(pagina) && pagina !== paginaActual) {
      // Ya hay un formulario de ese tipo (minimizado): se ofrece reemplazarlo.
      if (!window.confirm("Ya tienes un formulario de este tipo minimizado. ¿Reemplazarlo por uno nuevo con estos datos? (Se perderá lo diligenciado.)")) {
        irA(pagina);
        return;
      }
      setVivas((prev) => prev.filter((p) => p !== pagina));
      setMinimizadas((prev) => prev.filter((p) => p !== pagina));
    }
    setVivas((prev) => (prev.includes(pagina) ? prev : [...prev, pagina]));
    setPrecarga({ pagina, eventoOrigenId, speakerId });
    setPaginaActual(pagina);
  }

  function minimizarPaginaActual() {
    const pagina = paginaActual;
    setMinimizadas((prev) => (prev.includes(pagina) ? prev : [...prev, pagina]));
    setPrecarga(null);
    setPaginaActual("tablero");
  }

  function cerrarPaginaActual() {
    if (!window.confirm("¿Cerrar este formulario? Se descartará lo que hayas diligenciado.")) return;
    irA("tablero");
  }

  // Páginas "normales" (Speakers, Usuarios…) que tienen una ventana minimizada:
  // se conservan montadas (ocultas) para no perder lo que se estaba escribiendo.
  const [ventanasRetenidas, setVentanasRetenidas] = React.useState<Record<string, PaginaId>>({});
  const retenerVentana = React.useCallback((pagina: PaginaId, idVentana: string, retener: boolean) => {
    setVentanasRetenidas((prev) => {
      if (retener) return prev[idVentana] === pagina ? prev : { ...prev, [idVentana]: pagina };
      if (!(idVentana in prev)) return prev;
      const { [idVentana]: _quitada, ...resto } = prev;
      return resto;
    });
  }, []);
  const paginasRetenidas = Array.from(new Set(Object.values(ventanasRetenidas)));

  const irARef = React.useRef(irA);
  irARef.current = irA;
  const { registrar, quitar, fijarNavegador } = bandeja;
  React.useEffect(() => {
    fijarNavegador((p) => irARef.current(p as PaginaId));
    return () => fijarNavegador(null);
  }, [fijarNavegador]);
  React.useEffect(() => {
    const ids = minimizadas.map((p) => `pagina:${p}`);
    minimizadas.forEach((p) =>
      registrar({ id: `pagina:${p}`, titulo: `${etiquetaPagina(p)} (sin enviar)`, restaurar: () => irARef.current(p) }),
    );
    return () => ids.forEach((id) => quitar(id));
  }, [minimizadas, registrar, quitar]);

  // Entrega 29 — telemetría de uso (tiempos por página, formulario y sesión). Best-effort y autodesactivable.
  const usuarioIdTel = usuario?.id;
  const empresaTel = companiaActual ?? usuario?.empresasGrupo[0] ?? null;
  React.useEffect(() => {
    if (usuarioIdTel) void Telemetria.iniciarSesion({ usuarioId: usuarioIdTel, empresaGrupo: empresaTel });
  }, [usuarioIdTel, empresaTel]);
  React.useEffect(() => {
    if (usuarioIdTel) Telemetria.cambiarPagina(paginaActual);
  }, [usuarioIdTel, paginaActual]);
  const vivasPrevias = React.useRef<PaginaId[]>([]);
  React.useEffect(() => {
    if (!usuarioIdTel) return;
    // Descarte: una página «Nuevo …» que deja de estar viva sin haberse enviado se cuenta como abandono.
    for (const p of vivasPrevias.current) {
      if (!vivas.includes(p)) {
        const tipo = (Object.keys(PAGINA_POR_TIPO_DOC) as TipoDoc[]).find((t) => PAGINA_POR_TIPO_DOC[t] === p);
        if (tipo) Telemetria.formularioDescartado(tipo);
      }
    }
    vivasPrevias.current = vivas;
    for (const p of vivas) {
      const tipo = (Object.keys(PAGINA_POR_TIPO_DOC) as TipoDoc[]).find((t) => PAGINA_POR_TIPO_DOC[t] === p);
      if (tipo) Telemetria.formularioAbierto(tipo, p === paginaActual);
    }
  }, [usuarioIdTel, vivas, paginaActual]);

  // Entrega 32: grupos plegados del menú lateral (acordeón). Se recuerda por navegador; por defecto todo está desplegado.
  const [gruposPlegados, setGruposPlegados] = React.useState<ReadonlySet<string>>(() => {
    try {
      const g = JSON.parse(window.localStorage.getItem("beats.nav.plegados") ?? "[]");
      return new Set<string>(Array.isArray(g) ? g.filter((x): x is string => typeof x === "string") : []);
    } catch {
      return new Set<string>();
    }
  });
  const guardarPlegados = (n: ReadonlySet<string>) => {
    try { window.localStorage.setItem("beats.nav.plegados", JSON.stringify([...n])); } catch { /* sin almacenamiento: solo en memoria */ }
  };
  const alternarGrupo = (etiqueta: string) =>
    setGruposPlegados((prev) => {
      const n = new Set(prev);
      if (n.has(etiqueta)) n.delete(etiqueta); else n.add(etiqueta);
      guardarPlegados(n);
      return n;
    });
  // Al navegar (o ser llevado) a una página, su grupo se despliega para que el menú siempre muestre dónde estás.
  React.useEffect(() => {
    if (!usuario) return;
    const g = navegacionVisible(usuario).find((x) => x.items.some((i) => i.id === paginaActual));
    if (g) setGruposPlegados((prev) => { if (!prev.has(g.etiqueta)) return prev; const n = new Set(prev); n.delete(g.etiqueta); guardarPlegados(n); return n; });
  }, [paginaActual, usuario]);

  // Entrega 34: «Fijados» — accesos que cada usuario ancla arriba del menú (se recuerdan por navegador y usuario).
  const claveFijados = `beats.nav.fijados.${usuario?.id ?? "anon"}`;
  const [fijados, setFijados] = React.useState<string[]>([]);
  React.useEffect(() => {
    try {
      const g = JSON.parse(window.localStorage.getItem(claveFijados) ?? "[]");
      setFijados(Array.isArray(g) ? g.filter((x): x is string => typeof x === "string") : []);
    } catch {
      setFijados([]);
    }
  }, [claveFijados]);
  const alternarFijado = (id: string) =>
    setFijados((prev) => {
      const n = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try { window.localStorage.setItem(claveFijados, JSON.stringify(n)); } catch { /* solo en memoria */ }
      return n;
    });

  if (!usuario) return null;

  const grupos = navegacionVisible(usuario);
  const { titulo, subtitulo } = tituloYSubtitulo(paginaActual);
  const IconoPagina = iconoPagina(paginaActual);

  // Entrega 34: cada entrada del menú (íconos y estilo de siempre) con un alfiler discreto para fijarla arriba.
  const renderItem = (item: (typeof grupos)[number]["items"][number], esCrearDocumento: boolean, seccion: string) => {
                  const Icono = item.icon;
                  const activo = paginaActual === item.id;
                  const fijado = fijados.includes(item.id);
                  return (
                    <div key={`${seccion}-${item.id}`} className="group/nav relative mb-1">
                    <button
                      onClick={() => irA(item.id)}
                      // Rediseño visual (septiembre 2026), pedido explícito:
                      // "estado activo en cápsula azul suave" — se reemplaza
                      // el acento de borde izquierdo por una píldora
                      // (rounded-full) de fondo azul suave, mismo criterio
                      // en toda la nav salvo el grupo "Crear documento" (que
                      // ya tenía su propio tratamiento con borde).
                      className={cn(
                        // Ajuste de precisión: `whitespace-nowrap` para que
                        // ninguna etiqueta del menú (la más larga,
                        // "Notificación de Pago a HCPs", es el caso límite)
                        // envuelva a una segunda línea ni fuerce scroll
                        // horizontal — el `overflow-x-hidden` del <aside>/
                        // <nav> es el respaldo si algo igual desbordara.
                        "flex w-full items-center gap-2.5 whitespace-nowrap rounded-full px-3 py-2.5 text-left text-sm font-medium transition-colors",
                        esCrearDocumento && "border",
                      )}
                      style={
                        esCrearDocumento
                          ? {
                              borderColor: "var(--brand-blue)",
                              color: "var(--brand-blue)",
                              background: activo ? "var(--sidebar-active-bg)" : "#ffffff",
                            }
                          : {
                              background: activo ? "var(--sidebar-active-bg)" : "transparent",
                              color: activo ? "var(--sidebar-active-fg)" : "var(--sidebar-fg)",
                              fontWeight: activo ? 700 : 500,
                            }
                      }
                    >
                      {/* Ajuste de precisión: íconos homogeneizados a 20px
                          (w-5 h-5, antes 16px/h-4 w-4) para balance visual
                          con el resto del menú a zoom 100%. */}
                      <Icono className="h-5 w-5 shrink-0" strokeWidth={2.25} />
                      {item.etiqueta}
                    </button>
                    {!esCrearDocumento && (
                      <button
                        type="button"
                        onClick={() => alternarFijado(item.id)}
                        aria-pressed={fijado}
                        aria-label={fijado ? `Quitar de fijados: ${item.etiqueta}` : `Fijar arriba: ${item.etiqueta}`}
                        title={fijado ? "Quitar de fijados" : "Fijar arriba"}
                        data-testid={`nav-fijar-${item.id}`}
                        className={cn("absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 transition-opacity focus-visible:opacity-100", fijado ? "opacity-100" : "opacity-0 group-hover/nav:opacity-100")}
                        style={{ color: fijado ? "var(--sidebar-active-fg)" : "var(--sidebar-muted)" }}
                      >
                        {fijado ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                  );
  };
  const itemsPorId = new Map(grupos.flatMap((g) => g.items).map((i) => [i.id, i] as const));
  const itemsFijados = fijados.map((id) => itemsPorId.get(id as PaginaId)).filter((i): i is NonNullable<typeof i> => !!i);

  return (
    <VentanasDocumentosProvider>
    <div className="flex h-screen w-full overflow-hidden" style={{ background: "hsl(var(--background))" }}>
      <aside
        // Ajuste de precisión (septiembre 2026), pedido explícito: el
        // sidebar vuelve a 320px (la ronda visual anterior lo había
        // reducido a 260px) — a esa anchura, "Notificación de Pago a HCPs"
        // no necesita envolver en dos líneas ni comprimirse.
        className="flex w-[320px] shrink-0 flex-col overflow-x-hidden border-r no-imprimir"
        style={{ background: "var(--sidebar-bg)", borderColor: "var(--sidebar-border)" }}
      >
        <div className="flex items-center justify-center px-3 py-6">
          <LogoApp logoUrl={logoUrl} anchoPx={anchoPx} altoPx={altoPx} anchoMax={220} nombreDeRespaldo />
        </div>
        <Separator style={{ background: "var(--sidebar-border)" }} />
        <nav className="flex flex-1 flex-col gap-6 overflow-y-auto overflow-x-hidden px-3 pb-4 pt-6">
          {itemsFijados.length > 0 && (
            <div className="flex flex-col gap-1.5" data-testid="nav-fijados">
              <p className="px-3 pb-1.5 text-[10.5px] font-bold uppercase tracking-wider" style={{ color: "var(--sidebar-muted)" }}>Fijados</p>
              {itemsFijados.map((item) => renderItem(item, false, "fijados"))}
            </div>
          )}
          {grupos.map((grupo) => {
            const esCrearDocumento = grupo.etiqueta === "Crear documento";
            return (
              <div key={grupo.etiqueta} className="flex flex-col gap-1.5">
                {/* Entrega 32: categorías tipo acordeón. El encabezado es un botón que pliega/despliega
                    sus opciones; "Principal" (Tablero y Tareas) queda siempre visible. */}
                {grupo.etiqueta === "Principal" || grupo.items.length <= 1 ? (
                  <p
                    className="px-3 pb-1.5 text-[10.5px] font-bold uppercase tracking-wider"
                    style={{ color: "var(--sidebar-muted)" }}
                  >
                    {grupo.etiqueta}
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => alternarGrupo(grupo.etiqueta)}
                    aria-expanded={!gruposPlegados.has(grupo.etiqueta)}
                    data-testid={`nav-grupo-${grupo.etiqueta}`}
                    className="flex w-full items-center justify-between rounded-md px-3 pb-1.5 pt-0.5 text-left text-[10.5px] font-bold uppercase tracking-wider"
                    style={{ color: "var(--sidebar-muted)" }}
                  >
                    <span>{grupo.etiqueta}</span>
                    <span className="flex items-center gap-1.5">
                      {gruposPlegados.has(grupo.etiqueta) && (
                        <span className="rounded-full px-1.5 text-[9.5px] font-medium normal-case" style={{ background: "var(--sidebar-active-bg)", color: "var(--sidebar-active-fg)" }}>{grupo.items.length}</span>
                      )}
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", gruposPlegados.has(grupo.etiqueta) && "-rotate-90")} />
                    </span>
                  </button>
                )}
                {(grupo.etiqueta === "Principal" || grupo.items.length <= 1 || !gruposPlegados.has(grupo.etiqueta)) && grupo.items.map((item) => renderItem(item, esCrearDocumento, grupo.etiqueta))}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex shrink-0 items-center justify-between border-b px-6 py-5 no-imprimir"
          style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}
        >
          <div className="flex items-start gap-3 pb-1">
            {IconoPagina && (
              <div
                className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                style={{ background: "hsl(var(--accent))" }}
              >
                <IconoPagina className="h-5 w-5" style={{ color: "hsl(var(--accent-foreground))" }} />
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold tracking-tight" style={{ color: "var(--brand-gray)" }}>
                {titulo}
              </h1>
              <p className="mt-1.5 text-base font-light" style={{ color: "hsl(var(--muted-foreground))" }}>
                {subtitulo}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NotificacionesBell />
            {usuario.empresasGrupo.length >= 2 && (
              // Selector de compañía del grupo (pedido explícito, octubre
              // 2026): switcher siempre disponible en el header para
              // cambiar de compañía sin cerrar sesión — solo tiene sentido
              // mostrarlo a un usuario con 2+ compañías habilitadas.
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                    <Building2 className="h-3.5 w-3.5" />
                    {companiaActual ?? usuario.empresasGrupo[0]}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {usuario.empresasGrupo.map((empresa) => (
                    <DropdownMenuItem key={empresa} disabled={empresa === companiaActual} onClick={() => fijarCompania(empresa)}>
                      {empresa}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex h-auto items-center gap-2 px-2 py-1.5">
                  {/* Entrega 33: foto del usuario en el avatar (iniciales si no tiene). Se resuelve por id (no por `fotoId`)
                      para que se actualice sola si la persona cambia su foto en esta sesión. */}
                  <AvatarUsuario usuarioId={usuario.id} nombre={usuario.nombre} iniciales={usuario.iniciales} className="h-8 w-8" fallbackClassName="bg-primary text-primary-foreground" />
                  <span className="flex flex-col items-start leading-tight">
                    <span className="text-sm font-medium">{usuario.nombre}</span>
                    {(companiaActual ?? usuario.empresasGrupo[0]) && (
                      <span className="text-xs text-muted-foreground">{companiaActual ?? usuario.empresasGrupo[0]}</span>
                    )}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled>{usuario.cargo}</DropdownMenuItem>
                <DropdownMenuSeparator />
                {/* Entrega 23: opciones de firma del propio usuario (jefe inmediato, director de área, Compliance Officer LATAM). */}
                <DropdownMenuItem onClick={() => setOpcionesFirmaAbierto(true)}>Mis opciones de firma</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPreferenciasAbierto(true)} data-testid="menu-mis-preferencias">Mis preferencias</DropdownMenuItem>
                <DropdownMenuItem onClick={() => cerrarSesion()}>Cerrar sesión</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <DialogoOpcionesFirma abierto={opcionesFirmaAbierto} onCerrar={() => setOpcionesFirmaAbierto(false)} />
        <DialogoPreferencias abierto={preferenciasAbierto} onCerrar={() => setPreferenciasAbierto(false)} />
        <main className="flex-1 overflow-y-auto p-6">
          {/* Rediseño visual (septiembre 2026), pedido explícito: "ancho
              ergonómico" para que los formularios no queden desparramados en
              monitores ultrawide. */}
          <div className={cn("mx-auto w-full px-6 py-8", claseAnchoPagina(paginaActual))}>
            {esPaginaNueva(paginaActual) && (
              <div className="mb-2 flex justify-end gap-1 no-imprimir">
                <button
                  type="button"
                  data-testid="pagina-minimizar"
                  title="Minimizar (queda en la bandeja con lo que llevas diligenciado)"
                  onClick={minimizarPaginaActual}
                  className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                >
                  <Minus className="h-4 w-4" />
                  <span className="sr-only">Minimizar</span>
                </button>
                <button
                  type="button"
                  data-testid="pagina-cerrar"
                  title="Cerrar (descarta lo diligenciado)"
                  onClick={cerrarPaginaActual}
                  className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Cerrar</span>
                </button>
              </div>
            )}
            {Array.from(new Set<PaginaId>([...vivas, ...paginasRetenidas, paginaActual])).map((p) => (
              <div key={p} hidden={p !== paginaActual}>
                <ProveedorPaginaVentanas pagina={p} retenerVentana={retenerVentana}>
                  <ContenidoPagina pagina={p} irA={irA} precarga={precarga} irANuevoDocumento={irANuevoDocumento} />
                </ProveedorPaginaVentanas>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
    </VentanasDocumentosProvider>
  );
}

function Enrutador() {
  const { usuario, cargando, errorSesion } = useAuth();
  const { necesitaSeleccion } = useCompania();

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Cargando BEATS...
      </div>
    );
  }

  if (!usuario) {
    return (
      <>
        {errorSesion && (
          <div className="fixed inset-x-0 top-0 z-50 bg-destructive px-4 py-2 text-center text-sm text-destructive-foreground">
            {errorSesion}
          </div>
        )}
        <PantallaLogin />
      </>
    );
  }

  if (usuario.debeCambiarPassword) {
    return <PantallaCambioPasswordForzado />;
  }

  // Selector de compañía del grupo (pedido explícito, octubre 2026): un
  // usuario con 2+ compañías habilitadas elige con cuál va a trabajar
  // antes de entrar al aplicativo principal.
  if (necesitaSeleccion) {
    return <SeleccionCompania />;
  }

  return <AppShell />;
}

export default function App() {
  return (
    <AuthProvider>
      <CompaniaProvider>
        <Toaster richColors position="top-right" />
        <ConfirmarProvider>
          <BandejaVentanasProvider>
            <Enrutador />
          </BandejaVentanasProvider>
        </ConfirmarProvider>
      </CompaniaProvider>
    </AuthProvider>
  );
}
