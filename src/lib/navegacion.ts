import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ListChecks,
  CalendarPlus,
  HandCoins,
  ClipboardCheck,
  Stamp,
  Handshake,
  Receipt,
  Stethoscope,
  Users,
  Mic2,
  FolderOpen,
  ScrollText,
  FileBarChart,
  UserCheck,
  Banknote,
  Activity,
  Radio,
  MapPin,
  History,
  UserCog,
  Settings2,
  FileCheck2,
  Info,
  ShieldAlert,
  BellRing,
  Gauge,
  FolderArchive,
  DatabaseBackup,
} from "lucide-react";
import { ROLES_LEGAL_COMPLIANCE, SIGNIFICADO_CAF, type RolUsuario } from "@/lib/enums";
import type { Usuario } from "@/types";

export type PaginaId =
  | "tablero"
  | "tareas"
  | "nueva-evento"
  | "nueva-convenio"
  | "nueva-fmv"
  | "nueva-caf"
  | "nueva-convenio-hcp"
  | "nueva-notificacion-pago"
  | "speakers"
  | "informe-participacion-speaker"
  | "documentos"
  | "auditoria"
  | "informe"
  | "expedientes"
  | "informe-hcps-impactados"
  | "informe-pagos"
  | "informe-speakers"
  | "informe-ejecucion-eventos"
  | "panel-en-vivo"
  | "eventos-en-vivo"
  | "historial"
  | "roles"
  | "campos"
  | "plantilla-convenio-hcp"
  | "eliminar-documentos-firmados"
  | "config-notificaciones"
  | "backup"
  | "indicadores-uso"
  | "creditos";

export interface ItemNavegacion {
  id: PaginaId;
  etiqueta: string;
  icon: LucideIcon;
  /** Roles con acceso por defecto a este item; sin este campo, es visible
   * para cualquiera. Un administrador solo hereda un item restringido si
   * "administrador" está explícitamente en esta lista (ver `paginaVisible`
   * más abajo — recuperado tal cual del bundle original: no es "el admin ve
   * todo", es "el admin ve lo que la lista de roles del item le permita"). */
  soloRoles?: RolUsuario[];
  /**
   * Corrección (octubre 2026), pedido explícito del usuario: un permiso
   * nuevo, otorgado persona por persona (no por rol, ni heredado de
   * `esAdministrador`) — ver `puedeEliminarDocumentosFirmados` en
   * `types.ts`. Cuando un item lo trae, `paginaVisible` lo usa como única
   * autoridad (ignora `soloRoles` y `paginasPermitidas`): si el usuario no
   * tiene ese flag en `true`, el item nunca aparece, sin excepción.
   */
  requierePermiso?: "puedeEliminarDocumentosFirmados";
  /**
   * Entrega 29: ventana exclusiva para Administradores. Además de la lista de «páginas permitidas» (o del
   * acceso por defecto del rol), quien la abre debe tener el acceso de Administrador (`esAdministrador`).
   * Conceder la página a un usuario que no es Administrador NO la habilita.
   */
  exigeAdministrador?: boolean;
  /**
   * Entrega 35: además de ser Administrador, no puede ser de «alcance limitado» (solo ciertos países/empresas). Lo usa
   * «Backup», que copia y restaura TODA la base de datos.
   */
  exigeAdministradorCompleto?: boolean;
}

export interface GrupoNavegacion {
  etiqueta: string;
  items: ItemNavegacion[];
}

/**
 * Navegación recuperada por extracción forense del bundle original
 * (grupos, etiquetas y restricciones de rol son texto/lógica literal del
 * bundle, no una reconstrucción aproximada). Los íconos SÍ son una elección
 * nueva: el bundle minificado solo preserva los nombres de icono como
 * identificadores de una letra (`ht`, `gt`, `nt`, ...), así que el ícono
 * original no es recuperable — se eligió aquí el ícono de lucide-react más
 * afín al significado de cada item.
 */
export const NAVEGACION: GrupoNavegacion[] = [
  {
    etiqueta: "Principal",
    items: [
      { id: "tablero", etiqueta: "Tablero de Documentos", icon: LayoutDashboard },
      { id: "tareas", etiqueta: "Tareas Pendientes", icon: ListChecks },
    ],
  },
  {
    etiqueta: "Crear documento",
    // Ajuste de precisión (septiembre 2026), pedido explícito: orden fijo
    // de los 6 documentos — Solicitud de Evento, MD FMV Checklist, Convenio
    // de Pago a HCP, CAF, Convenio HCP, Notificación de Pago a HCPs (antes
    // el orden era Evento/Convenio de Pago/FMV/CAF/Convenio HCP/Notificación).
    items: [
      { id: "nueva-evento", etiqueta: "Solicitud de Evento", icon: CalendarPlus, soloRoles: ["marketing", "medica"] },
      { id: "nueva-fmv", etiqueta: "MD FMV Checklist", icon: ClipboardCheck, soloRoles: ["medica"] },
      { id: "nueva-convenio", etiqueta: "Convenio de Pago a HCP", icon: HandCoins, soloRoles: ["medica"] },
      { id: "nueva-caf", etiqueta: "CAF", icon: Stamp, soloRoles: ["medica"] },
      { id: "nueva-convenio-hcp", etiqueta: "Convenio HCP", icon: Handshake, soloRoles: ["medica"] },
      { id: "nueva-notificacion-pago", etiqueta: "Notificación de Pago a HCPs", icon: Receipt, soloRoles: ["medica"] },
    ],
  },
  {
    etiqueta: "Administración de HCPs/Speakers",
    items: [
      { id: "speakers", etiqueta: "HCPs/Speakers", icon: Stethoscope },
      {
        id: "informe-participacion-speaker",
        etiqueta: "Participación de HCPs/Speakers",
        icon: Mic2,
        soloRoles: ["medica", ...ROLES_LEGAL_COMPLIANCE],
      },
      { id: "documentos", etiqueta: "Visor Documental", icon: FolderOpen, soloRoles: [...ROLES_LEGAL_COMPLIANCE] },
    ],
  },
  {
    etiqueta: "Informes y Auditoría",
    items: [
      { id: "auditoria", etiqueta: "Auditoría de Eventos", icon: ScrollText, soloRoles: ["medica", ...ROLES_LEGAL_COMPLIANCE] },
      { id: "informe", etiqueta: "Informe por Evento", icon: FileBarChart },
      // Entrega 35: acceso directo al Expediente de un evento (mismo selector que «Informe por Evento»).
      { id: "expedientes", etiqueta: "Expedientes", icon: FolderArchive },
      {
        id: "informe-hcps-impactados",
        etiqueta: "Asistentes Impactados",
        icon: UserCheck,
        soloRoles: ["medica", ...ROLES_LEGAL_COMPLIANCE],
      },
      {
        id: "informe-pagos",
        etiqueta: "Informe de Pagos a HCPs/Speakers",
        icon: Banknote,
        soloRoles: ["medica", ...ROLES_LEGAL_COMPLIANCE],
      },
      { id: "informe-speakers", etiqueta: "Informe de Speakers", icon: Users, soloRoles: ["medica", ...ROLES_LEGAL_COMPLIANCE] },
      {
        id: "informe-ejecucion-eventos",
        etiqueta: "Ejecución de Eventos",
        icon: Activity,
        soloRoles: ["medica", "comercial"],
      },
      { id: "panel-en-vivo", etiqueta: "Panel en Vivo", icon: Radio, soloRoles: ["medica", "comercial"] },
      { id: "eventos-en-vivo", etiqueta: "Eventos en Vivo", icon: MapPin, soloRoles: ["medica", "comercial"] },
      { id: "historial", etiqueta: "Historial y Auditoría", icon: History },
      // Entrega 32: antes estaba en «Configuración»; es un informe, así que vive aquí (sigue exclusivo de administradores).
      {
        id: "indicadores-uso",
        etiqueta: "Indicadores de Uso y Gestión",
        icon: Gauge,
        soloRoles: ["administrador"],
        exigeAdministrador: true,
      },
    ],
  },
  {
    etiqueta: "Configuración",
    items: [
      { id: "roles", etiqueta: "Configuración de Usuarios/Roles", icon: UserCog, soloRoles: ["medica", "administrador"] },
      { id: "campos", etiqueta: "Configuración de Campos/Variables", icon: Settings2, soloRoles: ["medica", "administrador"] },
      {
        id: "plantilla-convenio-hcp",
        // AJUSTES (septiembre/octubre 2026), pedido explícito: quitar el
        // sufijo "— Convenio HCP" del nombre de la sección.
        etiqueta: "Configuración de la Plantilla Legal",
        icon: FileCheck2,
        soloRoles: [...ROLES_LEGAL_COMPLIANCE, "administrador"],
      },
      {
        id: "config-notificaciones",
        etiqueta: "Configuración de Notificaciones",
        icon: BellRing,
        soloRoles: ["administrador"],
        exigeAdministrador: true,
      },
      // Entrega 35: copias de seguridad de toda la base de datos (manuales y programadas) y su restauración.
      {
        id: "backup",
        etiqueta: "Backup",
        icon: DatabaseBackup,
        soloRoles: ["administrador"],
        exigeAdministrador: true,
        exigeAdministradorCompleto: true,
      },
      {
        id: "eliminar-documentos-firmados",
        // Octubre 2026, pedido explícito: "Eliminar Documentos Firmados" →
        // "Gestión avanzada de documentos". El id interno
        // ("eliminar-documentos-firmados") no cambia para no romper permisos
        // (`paginas_permitidas`) ya guardados.
        etiqueta: "Gestión Avanzada de Documentos",
        icon: ShieldAlert,
        requierePermiso: "puedeEliminarDocumentosFirmados",
      },
    ],
  },
  {
    etiqueta: "Créditos",
    items: [{ id: "creditos", etiqueta: "Créditos", icon: Info }],
  },
];

const TODOS_LOS_ITEMS: ItemNavegacion[] = NAVEGACION.flatMap((g) => g.items);

/**
 * Título y subtítulo de cada página, tal como aparecen en el encabezado
 * (ícono + h1 + p) — texto verbatim recuperado del bundle original.
 */
export const TITULO_PAGINA: Record<PaginaId, { titulo: string; subtitulo: string }> = {
  tablero: {
    titulo: "Tablero de Documentos",
    subtitulo: "Estado de solicitudes de evento, convenios de pago a HCP y FMV checklists",
  },
  "nueva-evento": {
    titulo: "Solicitud de Evento",
    subtitulo: "Solicitud de Apoyos para Eventos Educativos y Eventos Promocionales",
  },
  "nueva-convenio": {
    titulo: "Convenio de Pago a HCP",
    subtitulo: "Solicitud de Convenio de Pago por Servicios a un Profesional de la Salud",
  },
  "nueva-caf": { titulo: "CAF", subtitulo: SIGNIFICADO_CAF },
  "nueva-convenio-hcp": {
    titulo: "Convenio HCP",
    subtitulo: "Contrato de Consultoría con el Profesional de la Salud",
  },
  "nueva-fmv": {
    titulo: "MD FMV Checklist",
    subtitulo: "Evaluación de Fair Market Value del Profesional de la Salud",
  },
  "nueva-notificacion-pago": {
    titulo: "Notificación de Pago a HCPs",
    subtitulo: "Certificación de Dirección Médica de que la factura corresponde al Convenio firmado",
  },
  tareas: { titulo: "Tareas Pendientes", subtitulo: "Qué te falta revisar, aprobar o generar en cada solicitud" },
  documentos: {
    titulo: "Visor Documental",
    subtitulo: "Todos los archivos cargados en la aplicación — Legal/Compliance",
  },
  historial: {
    titulo: "Historial y Auditoría",
    subtitulo: "Seguimiento cronológico de todos los documentos y aprobaciones",
  },
  roles: {
    titulo: "Configuración de Usuarios/Roles",
    subtitulo: "Panel de Administración: Gestión de Roles y Personal",
  },
  speakers: {
    titulo: "Repositorio de Speakers — RETHUS y Hoja de Vida",
    subtitulo: "Consulta la vigencia de licencia RETHUS y Hoja de Vida de los speakers/HCP, cuando aplique.",
  },
  campos: {
    titulo: "Configuración de Campos/Variables",
    subtitulo: "Administra las opciones de los menús desplegables de los formularios",
  },
  "plantilla-convenio-hcp": {
    titulo: "Configuración de la Plantilla Legal",
    subtitulo: "Los 15 numerales y los Anexos C/D del contrato, con historial de versiones — Legal/Compliance",
  },
  informe: {
    titulo: "Informe por Evento",
    subtitulo: "Genera una carpeta descargable y un reporte con los documentos de uno o varios eventos",
  },
  auditoria: {
    titulo: "Auditoría de Eventos",
    subtitulo: "Filtra por fecha, accede a los archivos y verifica qué documentos faltan por evento — Dirección Médica y Compliance/Legal",
  },
  "informe-pagos": {
    titulo: "Informe de Pagos a HCPs/Speakers",
    subtitulo: "Pagos por período bajo Convenios firmados, para apoyar el análisis de transferencias de valor — Dirección Médica y Compliance/Legal",
  },
  "informe-hcps-impactados": {
    titulo: "Informe de Asistentes Impactados",
    subtitulo: "Asistentes totalizados y por categoría de actividades con participación académica en un período — Dirección Médica y Compliance/Legal",
  },
  "informe-speakers": {
    titulo: "Informe de Speakers",
    subtitulo: "Listado y datos de todos los Profesionales de la Salud del Repositorio de Speakers — Dirección Médica y Compliance/Legal",
  },
  "informe-participacion-speaker": {
    titulo: "Participación de HCPs/Speakers",
    subtitulo: "Eventos ejecutados por un speaker en un período determinado — Dirección Médica y Compliance/Legal",
  },
  "informe-ejecucion-eventos": {
    titulo: "Informe de Ejecución de Eventos",
    subtitulo: "Check-ins y muestras médicas entregadas en sitio, capturados desde el Módulo de Ejecución — Dirección Médica y Dirección Comercial",
  },
  "panel-en-vivo": {
    titulo: "Panel en Vivo",
    subtitulo: "Avance en vivo de check-ins y muestras entregadas de un evento Aprobado — Dirección Médica y Dirección Comercial",
  },
  "eventos-en-vivo": {
    titulo: "Eventos en Vivo",
    subtitulo: "Todos los eventos Aprobados en curso hoy, por país, en un mapa — Dirección Médica y Dirección Comercial",
  },
  expedientes: {
    titulo: "Expedientes",
    subtitulo: "Elige un evento y consulta su expediente: documentos, soportes por speaker, asistencia, fotos y pagos",
  },
  backup: {
    titulo: "Backup",
    subtitulo: "Copias de seguridad de toda la base de datos, restauración y rutinas automáticas — solo administradores",
  },
  creditos: { titulo: "Créditos", subtitulo: "Acerca de esta herramienta" },
  "config-notificaciones": {
    titulo: "Configuración de Notificaciones",
    subtitulo: "Qué avisos se envían por correo, a quién (copias) y con qué asunto y mensaje — solo administradores",
  },
  "indicadores-uso": {
    titulo: "Indicadores de Uso y Gestión",
    subtitulo: "Cómo se usa BEATS (tiempos, eficiencia, sesiones) y KPI de gestión de los eventos con HCPs — solo administradores",
  },
  "eliminar-documentos-firmados": {
    titulo: "Gestión Avanzada de Documentos",
    subtitulo: "Revisa y elimina documentos creados por error aunque ya estén firmados, y depura el log de auditoría — acceso otorgado individualmente",
  },
};

/**
 * Lógica de permisos de navegación — regla del bundle original (función
 * `pm`, recuperada por extracción forense), adoptada en la Fase 8 tras
 * confirmarla por comparación visual directa contra el bundle original con
 * varios roles de prueba (`scripts/comparacion_visual/probar_rol_medica.mjs`):
 *  1. `tablero` siempre es visible.
 *  2. Si `paginas_permitidas` NO está vacío, esa lista (+ tablero) es la
 *     autoridad — no importan los defaults por rol.
 *  3. Si está vacío: un item SIN `soloRoles` es visible para cualquiera; un
 *     item CON `soloRoles` es visible SOLO si el rol del usuario está
 *     explícitamente en esa lista — "administrador" incluido.
 *
 * Antes de la Fase 8 esta función tenía un `|| usuario.esAdministrador` al
 * final, que hacía que cualquier administrador viera TODOS los items
 * restringidos sin importar su lista de roles — una regla más laxa que la
 * real, dejada así a propósito ("se reporta aparte para que el usuario
 * decida") hasta poder comparar contra el bundle original. La comparación
 * confirmó la regla estricta: con un usuario administrador de rol
 * "marketing", el original solo mostraba en "Crear documento" la
 * "Solicitud de Evento" (el único item con "marketing" en su lista) — NO
 * los otros 5 (todos con `soloRoles: ["medica"]`, sin "administrador"
 * listado) — exactamente lo que faltaba diagnosticar en el hallazgo grande
 * de "un solo punto de entrada para crear documentos". Los `soloRoles` de
 * cada item ya eran fieles al original desde antes (extraídos del bundle,
 * no una aproximación); el único cambio de esta fase es esta función.
 */
export function paginaVisible(usuario: Usuario, item: ItemNavegacion): boolean {
  if (item.id === "tablero") return true;

  if (item.exigeAdministrador && !usuario.esAdministrador) return false;
  if (item.exigeAdministradorCompleto && usuario.administradorAlcanceLimitado) return false;

  if (item.requierePermiso) return usuario[item.requierePermiso] === true;

  if (usuario.paginasPermitidas.length > 0) {
    return usuario.paginasPermitidas.includes(item.id);
  }

  if (!item.soloRoles) return true;
  return item.soloRoles.includes(usuario.rol) || (usuario.esAdministrador && item.soloRoles.includes("administrador"));
}

export function navegacionVisible(usuario: Usuario): GrupoNavegacion[] {
  return NAVEGACION.map((grupo) => ({
    ...grupo,
    items: grupo.items.filter((item) => paginaVisible(usuario, item)),
  })).filter((grupo) => grupo.items.length > 0);
}

export function etiquetaPagina(id: PaginaId): string {
  return TODOS_LOS_ITEMS.find((item) => item.id === id)?.etiqueta ?? id;
}

export function tituloYSubtitulo(id: PaginaId): { titulo: string; subtitulo: string } {
  return TITULO_PAGINA[id] ?? { titulo: etiquetaPagina(id), subtitulo: "" };
}

export function iconoPagina(id: PaginaId): LucideIcon | undefined {
  return TODOS_LOS_ITEMS.find((item) => item.id === id)?.icon;
}
