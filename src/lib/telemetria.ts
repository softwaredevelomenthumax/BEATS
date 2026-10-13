import { supabase } from "@/lib/supabaseClient";
import { infoBuild } from "@/lib/buildInfo";

/**
 * Entrega 29 — telemetría de uso. Mide, sin guardar nunca el contenido de los formularios:
 *   - SESIONES: cuánto tiempo está conectado cada usuario (pestaña abierta) y cuánto de ese tiempo hubo
 *     interacción real (clic, tecla, scroll, toque). Un latido cada 30 s actualiza la fila de la sesión.
 *   - PÁGINAS: tiempo en cada pantalla.
 *   - FORMULARIOS: tiempo de diligenciamiento de cada «Nuevo …» (desde que se abre hasta guardar/enviar o abandonar).
 *   - REVISIÓN: tiempo con la ventana de un documento abierta hasta aprobar / rechazar / devolver / editar.
 *   - ARCHIVOS: duración y tamaño de cada carga.
 *   - ACCIONES: PDF, correos, descargas, etc.
 * El cierre de formularios y revisiones se engancha a `registrarAuditoria` (alAuditar): como TODO flujo de los 6
 * documentos ya audita su creación, envío, aprobación, rechazo, devolución y edición, un solo punto los cubre a todos.
 *
 * Es «mejor esfuerzo»: si las tablas no existen (migración `db/entrega_29_telemetria_uso.sql` sin aplicar) o fallan
 * varias veces seguidas, se desactiva sola y NUNCA interrumpe el trabajo del usuario.
 */

type Categoria = "pagina" | "formulario" | "revision" | "archivo" | "accion";

interface EventoPendiente {
  sesion_id: string | null;
  usuario_id: string;
  creado_en: string;
  categoria: Categoria;
  nombre: string;
  tipo_doc: string | null;
  documento_id: string | null;
  resultado: string | null;
  duracion_ms: number | null;
  activo_ms: number | null;
  tamano_bytes: number | null;
  detalle: Record<string, unknown> | null;
}

interface Cronometro {
  categoria: Categoria;
  nombre: string;
  tipoDoc: string | null;
  documentoId: string | null;
  duracionMs: number;
  activoMs: number;
  corriendo: boolean;
  marca: number;
}

const UMBRAL_INACTIVIDAD_MS = 60_000;
const INTERVALO_TICK_MS = 1_000;
const INTERVALO_LATIDO_MS = 30_000;
const INTERVALO_VACIADO_MS = 15_000;
const MIN_PAGINA_MS = 2_000;
const MIN_FORMULARIO_ABANDONADO_ACTIVO_MS = 10_000;
const MAX_FALLOS = 5;

let habilitada = true;
let fallos = 0;
let usuarioId: string | null = null;
let empresaGrupo: string | null = null;
let sesionId: string | null = null;
let inicioSesion = 0;
let segundosActivosSesion = 0;
let ultimaActividad = 0;
let ultimaMarcaTick = 0;
let temporizadores: number[] = [];
let cola: EventoPendiente[] = [];
const cronometros = new Map<string, Cronometro>();
let paginaActual: string | null = null;
let escuchando = false;

const ahora = () => Date.now();

function marcarActividad() {
  ultimaActividad = ahora();
}

function pestanaVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

function usuarioActivo(): boolean {
  return pestanaVisible() && ahora() - ultimaActividad < UMBRAL_INACTIVIDAD_MS;
}

function nuevoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function fallar(error: unknown) {
  fallos += 1;
  if (fallos >= MAX_FALLOS) {
    habilitada = false;
    console.info("Telemetría desactivada (la migración db/entrega_29_telemetria_uso.sql no está aplicada o no hay permiso).", error);
  }
}

function tick() {
  const t = ahora();
  const dt = Math.min(t - ultimaMarcaTick, 5_000);
  ultimaMarcaTick = t;
  if (!pestanaVisible()) return;
  const activo = usuarioActivo();
  if (activo) segundosActivosSesion += dt / 1000;
  for (const c of cronometros.values()) {
    if (!c.corriendo) continue;
    c.duracionMs += dt;
    if (activo) c.activoMs += dt;
  }
}

async function vaciar() {
  if (!habilitada || cola.length === 0) return;
  const lote = cola;
  cola = [];
  const { error } = await supabase.from("telemetria_eventos").insert(lote);
  if (error) {
    fallar(error);
    if (habilitada) cola = [...lote, ...cola].slice(-200);
  } else {
    fallos = 0;
  }
}

async function latido(fin = false) {
  if (!habilitada || !sesionId) return;
  const t = ahora();
  const fila: Record<string, unknown> = {
    ultimo_latido: new Date(t).toISOString(),
    segundos_totales: Math.round((t - inicioSesion) / 1000),
    segundos_activos: Math.round(segundosActivosSesion),
  };
  if (fin) fila.fin = new Date(t).toISOString();
  const { error } = await supabase.from("telemetria_sesiones").update(fila).eq("id", sesionId);
  if (error) fallar(error);
}

function encolar(e: Omit<EventoPendiente, "sesion_id" | "usuario_id" | "creado_en">) {
  if (!habilitada || !usuarioId) return;
  cola.push({ ...e, sesion_id: sesionId, usuario_id: usuarioId, creado_en: new Date().toISOString() });
  if (cola.length >= 25) void vaciar();
}

function alOcultar() {
  if (document.visibilityState === "hidden") {
    void vaciar();
    void latido();
  }
}

export const Telemetria = {
  /** Abre la sesión de medición del usuario. Idempotente por usuario. */
  async iniciarSesion(params: { usuarioId: string; empresaGrupo?: string | null }) {
    if (!habilitada || (sesionId && usuarioId === params.usuarioId)) return;
    usuarioId = params.usuarioId;
    empresaGrupo = params.empresaGrupo ?? null;
    sesionId = nuevoId();
    inicioSesion = ahora();
    segundosActivosSesion = 0;
    ultimaActividad = inicioSesion;
    ultimaMarcaTick = inicioSesion;
    const { error } = await supabase.from("telemetria_sesiones").insert({
      id: sesionId,
      usuario_id: usuarioId,
      empresa_grupo: empresaGrupo,
      inicio: new Date(inicioSesion).toISOString(),
      navegador: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
      version_app: infoBuild()?.version ?? "desarrollo",
    });
    if (error) {
      fallar(error);
      if (!habilitada) return;
    }
    if (!escuchando && typeof window !== "undefined") {
      escuchando = true;
      for (const ev of ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"]) {
        window.addEventListener(ev, marcarActividad, { passive: true, capture: true });
      }
      document.addEventListener("visibilitychange", alOcultar);
      window.addEventListener("pagehide", alOcultar);
    }
    temporizadores = [
      window.setInterval(tick, INTERVALO_TICK_MS),
      window.setInterval(() => void latido(), INTERVALO_LATIDO_MS),
      window.setInterval(() => void vaciar(), INTERVALO_VACIADO_MS),
    ];
  },

  /** Cierra la sesión (al cerrar sesión). Cierra también lo que quedara abierto. */
  async finalizarSesion() {
    if (!sesionId) return;
    this.cerrarPagina();
    for (const clave of Array.from(cronometros.keys())) this.cerrar(clave, "cerrada", { solo: ["revision"] });
    for (const t of temporizadores) window.clearInterval(t);
    temporizadores = [];
    await vaciar().catch(() => undefined);
    await latido(true).catch(() => undefined);
    sesionId = null;
    usuarioId = null;
    cronometros.clear();
    paginaActual = null;
  },

  // ---- Cronómetros genéricos -------------------------------------------------------------------------

  abrir(clave: string, datos: { categoria: Categoria; nombre: string; tipoDoc?: string | null; documentoId?: string | null }, corriendo = true) {
    if (!habilitada || !usuarioId) return;
    if (cronometros.has(clave)) {
      if (corriendo) this.reanudar(clave);
      return;
    }
    cronometros.set(clave, {
      categoria: datos.categoria,
      nombre: datos.nombre,
      tipoDoc: datos.tipoDoc ?? null,
      documentoId: datos.documentoId ?? null,
      duracionMs: 0,
      activoMs: 0,
      corriendo,
      marca: ahora(),
    });
  },

  pausar(clave: string) {
    const c = cronometros.get(clave);
    if (c) c.corriendo = false;
  },

  reanudar(clave: string) {
    const c = cronometros.get(clave);
    if (c) c.corriendo = true;
  },

  existe(clave: string): boolean {
    return cronometros.has(clave);
  },

  /** Cierra el cronómetro y registra el evento con su resultado. `solo` limita a ciertas categorías. */
  cerrar(clave: string, resultado: string, opciones: { detalle?: Record<string, unknown>; solo?: Categoria[]; minActivoMs?: number } = {}) {
    const c = cronometros.get(clave);
    if (!c) return;
    if (opciones.solo && !opciones.solo.includes(c.categoria)) return;
    cronometros.delete(clave);
    if (opciones.minActivoMs !== undefined && c.activoMs < opciones.minActivoMs) return;
    if (c.categoria === "pagina" && c.duracionMs < MIN_PAGINA_MS) return;
    encolar({
      categoria: c.categoria,
      nombre: c.nombre,
      tipo_doc: c.tipoDoc,
      documento_id: c.documentoId,
      resultado,
      duracion_ms: Math.round(c.duracionMs),
      activo_ms: Math.round(c.activoMs),
      tamano_bytes: null,
      detalle: opciones.detalle ?? null,
    });
  },

  // ---- Páginas ---------------------------------------------------------------------------------------

  cambiarPagina(pagina: string) {
    if (pagina === paginaActual) return;
    this.cerrarPagina();
    paginaActual = pagina;
    this.abrir(`pagina:${pagina}`, { categoria: "pagina", nombre: pagina });
  },

  cerrarPagina() {
    if (paginaActual) this.cerrar(`pagina:${paginaActual}`, "ok");
    paginaActual = null;
  },

  // ---- Formularios «Nuevo …» -------------------------------------------------------------------------

  formularioAbierto(tipoDoc: string, visible: boolean) {
    const clave = `form:${tipoDoc}`;
    if (!this.existe(clave)) this.abrir(clave, { categoria: "formulario", nombre: tipoDoc, tipoDoc }, visible);
    else if (visible) this.reanudar(clave);
    else this.pausar(clave);
  },

  formularioDescartado(tipoDoc: string) {
    // Solo cuenta como abandono si hubo trabajo real (evita aperturas accidentales).
    this.cerrar(`form:${tipoDoc}`, "abandonado", { minActivoMs: MIN_FORMULARIO_ABANDONADO_ACTIVO_MS });
  },

  // ---- Revisión / firma (ventana de un documento) ----------------------------------------------------

  revisionAbierta(tipoDoc: string, documentoId: string) {
    this.abrir(`rev:${tipoDoc}:${documentoId}`, { categoria: "revision", nombre: tipoDoc, tipoDoc, documentoId });
  },

  revisionCerrada(tipoDoc: string, documentoId: string) {
    this.cerrar(`rev:${tipoDoc}:${documentoId}`, "cerrada", { minActivoMs: 3_000 });
  },

  /**
   * Gancho de `registrarAuditoria`: cada transición auditada cierra el cronómetro que corresponda.
   *  - creacion / envio → el formulario «Nuevo …» del tipo (borrador si el detalle lo dice).
   *  - aprobacion_* / rechazo / devuelto / enmienda_solicitada / edicion_reenvio / borrador_actualizado → la ventana de revisión del documento.
   */
  alAuditar(params: { tipoDoc: string; documentoId: string; accion: string; detalle?: string }) {
    if (!habilitada || !usuarioId) return;
    const { tipoDoc, documentoId, accion } = params;
    const esBorrador = /borrador/i.test(params.detalle ?? "");
    if (accion === "creacion" || accion === "envio") {
      const clave = `form:${tipoDoc}`;
      if (this.existe(clave)) {
        this.cerrar(clave, esBorrador ? "borrador" : "enviado", { detalle: { documento_id: documentoId, accion } });
        // Se reabre en pausa por si el usuario vuelve a abrir otro formulario del mismo tipo.
      } else if (accion === "creacion") {
        encolar({ categoria: "formulario", nombre: tipoDoc, tipo_doc: tipoDoc, documento_id: documentoId, resultado: esBorrador ? "borrador" : "enviado", duracion_ms: null, activo_ms: null, tamano_bytes: null, detalle: { sin_cronometro: true } });
      }
      return;
    }
    const resultadoPorAccion: Record<string, string> = {
      aprobacion_parcial: "aprobado",
      aprobacion_final: "aprobado",
      rechazo: "rechazado",
      devuelto: "devuelto",
      enmienda_solicitada: "enmienda",
      edicion_reenvio: "editado",
      borrador_actualizado: "editado",
    };
    const resultado = resultadoPorAccion[accion];
    if (!resultado) return;
    const clave = `rev:${tipoDoc}:${documentoId}`;
    if (this.existe(clave)) {
      this.cerrar(clave, resultado, { detalle: { accion } });
      // La ventana sigue abierta: se reabre para medir lo que sigue (p. ej. la siguiente acción sobre el mismo documento).
      this.abrir(clave, { categoria: "revision", nombre: tipoDoc, tipoDoc, documentoId });
    }
  },

  // ---- Archivos y acciones puntuales -----------------------------------------------------------------

  archivo(params: { nombre: string; duracionMs: number; tamanoBytes: number; ok: boolean }) {
    encolar({
      categoria: "archivo",
      nombre: params.nombre,
      tipo_doc: null,
      documento_id: null,
      resultado: params.ok ? "ok" : "error",
      duracion_ms: Math.round(params.duracionMs),
      activo_ms: null,
      tamano_bytes: params.tamanoBytes,
      detalle: null,
    });
  },

  accion(nombre: string, extra: { tipoDoc?: string | null; documentoId?: string | null; duracionMs?: number; resultado?: string; detalle?: Record<string, unknown> } = {}) {
    encolar({
      categoria: "accion",
      nombre,
      tipo_doc: extra.tipoDoc ?? null,
      documento_id: extra.documentoId ?? null,
      resultado: extra.resultado ?? "ok",
      duracion_ms: extra.duracionMs !== undefined ? Math.round(extra.duracionMs) : null,
      activo_ms: null,
      tamano_bytes: null,
      detalle: extra.detalle ?? null,
    });
  },

  /** Mide una operación async y la registra como acción. */
  async medir<T>(nombre: string, operacion: () => Promise<T>, extra: { tipoDoc?: string | null; documentoId?: string | null } = {}): Promise<T> {
    const t0 = ahora();
    try {
      const r = await operacion();
      this.accion(nombre, { ...extra, duracionMs: ahora() - t0, resultado: "ok" });
      return r;
    } catch (e) {
      this.accion(nombre, { ...extra, duracionMs: ahora() - t0, resultado: "error" });
      throw e;
    }
  },
};
