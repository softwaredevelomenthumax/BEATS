import { rolSatisface, type EstadoAprobacion, type RolAprobador } from "@/lib/enums";
import type { Usuario } from "@/types";

// AJUSTES (septiembre/octubre 2026), pedido explícito: el rol "Gerencia
// General" pasa a llamarse "Gerencia General / Rep. Legal" en
// toda la app — las etiquetas de paso de abajo que lo mencionan (CAF,
// Convenio HCP) se actualizaron para que coincida.

export interface PasoAprobacion {
  id?: string;
  orden: number;
  etiqueta: string;
  rolRequerido: RolAprobador;
  estado: EstadoAprobacion;
  resueltoPorId?: string;
  fecha?: string;
  comentario?: string;
  pendienteDesde: string;
  /**
   * Firma manuscrita congelada en el momento en que este paso quedó
   * `aprobado` (ver `db/agregar_inmutabilidad_documentos_firmados.sql`):
   * "si por alguna razón uno de los responsables del flujo de aprobación
   * tenía una firma autógrafa 'X', con la cual firmó el documento y luego
   * de un tiempo ... modificó dicha firma, todos los documentos que hayan
   * sido firmados con la firma anterior deben seguir apareciendo así, tal
   * cual". Se prefiere sobre la firma en vivo del resolutor cuando existe.
   */
  firmaCongeladaId?: string | null;
  /**
   * Entrega 24 (CAF con matriz de firmas ampliada): qué línea del formato es
   * ("solicitante", "jefe_inmediato", "director_area", "legal", "compliance_officer",
   * "lider_fv_tv", "lider_finanzas", "director_general"). Vacío en los CAF anteriores
   * (cadena de 4 pasos) y en los demás documentos.
   */
  tipoFirma?: string | null;
  /** Línea que el sistema firma sola (solicitante; jefe/director cuando el propio solicitante firma como tal; Líder FV y TV = N/A). No cuenta como "firma" de un aprobador. */
  automatica?: boolean;
  /** Líneas de persona (`rolRequerido === "persona"`): quiénes pueden firmarla. Vacío = nadie configurado → solo un administrador. */
  firmantesIds?: string[];
}

/**
 * ¿Este usuario es quien debe firmar el paso? Líneas de persona: está en `firmantesIds` (o, si
 * nadie quedó configurado, es administrador). Resto: lo decide el rol, como siempre.
 */
export function puedeFirmarPaso(usuario: Usuario, paso: PasoAprobacion): boolean {
  if (paso.automatica) return false;
  if (paso.rolRequerido === "persona") {
    const ids = paso.firmantesIds ?? [];
    return ids.length > 0 ? ids.includes(usuario.id) : usuario.esAdministrador;
  }
  return rolSatisface(usuario.rol, paso.rolRequerido);
}

/**
 * Cadena de aprobación fija del CAF, confirmada por extracción directa del
 * bundle original (función `yx()`): 4 pasos secuenciales, en este orden
 * exacto. No es una convención inventada — es el comportamiento real que
 * ya corre contra el proyecto de Supabase del usuario.
 */
export function crearCadenaAprobacionCaf(): PasoAprobacion[] {
  const ahora = new Date().toISOString();
  return [
    { orden: 1, etiqueta: "Dirección Médica", rolRequerido: "medica", estado: "pendiente", pendienteDesde: ahora },
    { orden: 2, etiqueta: "Legal/Compliance", rolRequerido: "legal_compliance", estado: "pendiente", pendienteDesde: ahora },
    { orden: 3, etiqueta: "Finanzas", rolRequerido: "finanzas", estado: "pendiente", pendienteDesde: ahora },
    { orden: 4, etiqueta: "Gerencia General / Rep. Legal", rolRequerido: "gerencia_general", estado: "pendiente", pendienteDesde: ahora },
  ];
}

/**
 * Cadena de aprobación fija del Convenio de Pago a HCP, confirmada por
 * extracción directa del bundle original (función `vx()`): 3 pasos
 * secuenciales, independientes de los condicionales del formulario
 * (Consejo de Asesores / Funcionario de Gobierno no agregan etapas).
 */
export function crearCadenaAprobacionConvenio(): PasoAprobacion[] {
  const ahora = new Date().toISOString();
  return [
    { orden: 1, etiqueta: "Jefe de Unidad de Negocios", rolRequerido: "comercial", estado: "pendiente", pendienteDesde: ahora },
    { orden: 2, etiqueta: "Director Médico", rolRequerido: "medica", estado: "pendiente", pendienteDesde: ahora },
    // Entrega 23: firma Legal (solo) o Legal & Compliance — no Compliance (solo).
    { orden: 3, etiqueta: "Área Legal", rolRequerido: "legal", estado: "pendiente", pendienteDesde: ahora },
  ];
}

/**
 * Cadena de aprobación fija del Convenio HCP (contrato de consultoría),
 * confirmada por extracción directa del bundle original (función `Nx()`):
 * 2 pasos secuenciales.
 */
export function crearCadenaAprobacionConvenioHCP(): PasoAprobacion[] {
  const ahora = new Date().toISOString();
  return [
    // Entrega 23: el Visto Bueno lo da Legal (solo) o Legal & Compliance.
    { orden: 1, etiqueta: "Visto Bueno Legal/Compliance", rolRequerido: "legal", estado: "pendiente", pendienteDesde: ahora },
    { orden: 2, etiqueta: "Firma Gerencia General / Rep. Legal", rolRequerido: "gerencia_general", estado: "pendiente", pendienteDesde: ahora },
  ];
}

/**
 * Cadena de aprobación fija de la Solicitud de Evento, confirmada por
 * extracción directa del bundle original (función `_x()`): 3 pasos
 * secuenciales, siempre los mismos sin importar la modalidad (única/varias
 * sesiones) ni ningún otro condicional del formulario.
 */
export function crearCadenaAprobacionEvento(): PasoAprobacion[] {
  const ahora = new Date().toISOString();
  return [
    { orden: 1, etiqueta: "Gerente / Director de la Unidad de Negocio", rolRequerido: "comercial", estado: "pendiente", pendienteDesde: ahora },
    { orden: 2, etiqueta: "Director Médico", rolRequerido: "medica", estado: "pendiente", pendienteDesde: ahora },
    // Entrega 23: firma Compliance (solo) o Legal & Compliance — no Legal (solo).
    { orden: 3, etiqueta: "Compliance Officer", rolRequerido: "compliance", estado: "pendiente", pendienteDesde: ahora },
  ];
}

/**
 * Un paso solo se puede resolver si todos los pasos anteriores (por orden)
 * ya fueron aprobados — cadena estrictamente secuencial. Confirmado por
 * extracción directa del bundle (función `xx(pasos, indice)`).
 */
export function pasosPreviosAprobados(pasos: PasoAprobacion[], indice: number): boolean {
  return pasos.slice(0, indice).every((p) => p.estado === "aprobado");
}

/** El primer paso todavía sin resolver (pendiente), o undefined si la cadena ya terminó. */
export function pasoActual(pasos: PasoAprobacion[]): PasoAprobacion | undefined {
  return pasos.find((p) => p.estado === "pendiente");
}

/**
 * AJUSTES (septiembre/octubre 2026), pedido explícito: "en la sección cadena
 * de aprobación, muestra lo siguiente: Etiqueta 'Gerente / Director de la
 * Unidad de Negocio', 'Director Médico', 'Compliance Officer', según
 * corresponda al tipo de documento." Hoy cada cadena trae su propia
 * `etiqueta` por paso, con variaciones de redacción para el mismo rol entre
 * un documento y otro (p. ej. el rol `comercial` aparece como "Jefe de
 * Unidad de Negocios" en Convenio pero "Gerente / Director de la Unidad de
 * Negocio" en Evento; `legal_compliance` aparece como "Área Legal",
 * "Legal/Compliance" o "Visto Bueno Legal/Compliance" según el documento).
 * Este mapa estandariza la ETIQUETA MOSTRADA en la vista compacta de
 * "Cadena de aprobación" (`Detalle*.tsx`) por rol, con las 3 etiquetas
 * pedidas — se usa solo para mostrar, nunca para cambiar a quién le toca
 * resolver cada paso (eso lo sigue decidiendo `rolRequerido`, sin tocar).
 *
 * Deliberadamente NO cubre `finanzas` ni `gerencia_general` (sin una
 * etiqueta de reemplazo pedida) ni se aplica al paso "Visto Bueno
 * Legal/Compliance" del Convenio HCP (ver `DetalleConvenioHCP.tsx`): ese
 * paso es a propósito un visto bueno previo, no una revisión formal de
 * Compliance, distinción que el ajuste más reciente de ese documento dejó
 * registrada también en el impreso — "Compliance Officer" ahí sugeriría una
 * revisión formal que no es lo que ese paso representa.
 */
export const ETIQUETA_ROL_CADENA_APROBACION: Partial<Record<RolAprobador, string>> = {
  comercial: "Gerente / Director de la Unidad de Negocio",
  medica: "Director Médico",
  // Entrega 23: Legal y Compliance ya son firmas distintas. `legal_compliance` se
  // conserva para pasos ya guardados con el rol antiguo (se muestra como antes).
  legal: "Legal",
  compliance: "Compliance Officer",
  legal_compliance: "Compliance Officer",
};

/**
 * Un usuario puede resolver un paso si: el paso está pendiente, todos los
 * anteriores ya se aprobaron, y su rol coincide con el requerido (o es
 * administrador — los administradores pueden resolver cualquier etapa).
 */
export function puedeResolverPaso(usuario: Usuario, pasos: PasoAprobacion[], indice: number): boolean {
  const paso = pasos[indice];
  if (!paso || paso.estado !== "pendiente") return false;
  if (!pasosPreviosAprobados(pasos, indice)) return false;
  // Octubre 2026, pedido explícito: Comentario/Rechazar/Aprobar SOLO para el
  // usuario cuyo rol corresponde al paso que toca firmar (ni siquiera los
  // administradores: la firma es del rol del flujo).
  return puedeFirmarPaso(usuario, paso);
}

/**
 * AJUSTES (septiembre/octubre 2026), pedido explícito: "aparece un mensaje
 * que dice 'te toca a ti', cuando no necesariamente corresponde el turno
 * de firma al usuario logeado — corrige esto". La causa: `puedeResolverPaso`
 * (de donde cada Detalle*.tsx deriva `indiceActionable`) deja actuar a
 * cualquier administrador sobre CUALQUIER paso pendiente — correcto para
 * mostrar los botones Aprobar/Rechazar (un administrador sí puede
 * destrabar la cadena), pero no para el mensaje "Te toca a ti", que debe
 * reservarse para cuando el paso de verdad corresponde al ROL del usuario
 * en sesión. Se separa en una función propia (en vez de tocar
 * `puedeResolverPaso`, que sigue gobernando qué botones se muestran) para
 * no afectar esa lógica de permisos — mismo `paso`/`indice`, sin el
 * `usuario.esAdministrador ||` que hace que el aviso aparezca de más.
 */
export function esTurnoPropio(usuario: Usuario, pasos: PasoAprobacion[], indice: number): boolean {
  const paso = pasos[indice];
  if (!paso || paso.estado !== "pendiente") return false;
  if (!pasosPreviosAprobados(pasos, indice)) return false;
  if (paso.rolRequerido === "persona" && (paso.firmantesIds ?? []).length === 0) return false;
  return puedeFirmarPaso(usuario, paso);
}

/**
 * Un documento con cadena de aprobación solo es editable mientras ningún
 * paso se haya resuelto todavía (ni aprobado ni rechazado) — confirmado por
 * extracción directa del bundle (función `Sx`). Una vez el primer paso se
 * resuelve, la única forma de volver a editar es "Editar y reenviar", que
 * reinicia la cadena desde cero (ver `editarYReenviar*` en la capa de datos
 * de cada documento).
 */
export function esEditablePorCadena(pasos: PasoAprobacion[]): boolean {
  return !pasos.some((p) => !p.automatica && (p.estado === "aprobado" || p.estado === "rechazado"));
}

export function cadenaCompletamenteAprobada(pasos: PasoAprobacion[]): boolean {
  return pasos.every((p) => p.estado === "aprobado");
}

export function cadenaTieneRechazo(pasos: PasoAprobacion[]): boolean {
  return pasos.some((p) => p.estado === "rechazado");
}

/**
 * La primera etapa rechazada de la cadena (o null si no hay ninguna) — el
 * mismo motivo que "Tus solicitudes" en Tareas Pendientes (Fase 6) muestra
 * bajo cada documento rechazado. Confirmado por extracción directa del
 * bundle original (función `Wx`).
 */
export function lineaRechazada(pasos: PasoAprobacion[]): { linea: PasoAprobacion } | null {
  const linea = pasos.find((p) => p.estado === "rechazado");
  return linea ? { linea } : null;
}

/**
 * Octubre 2026 — fecha en que una etapa le "llegó" a su responsable, que es
 * la que debe contar los días de "Pendiente hace…":
 *   - primera etapa: cuando el documento se envió realmente a firma
 *     (`enviadoAFirmaEn`; si la migración `agregar_fecha_envio_a_firma.sql`
 *     todavía no existe, se cae a la fecha propia de la etapa);
 *   - siguientes: cuando firmó la etapa anterior (`fecha` de esa etapa).
 */
export function fechaRecepcionPaso(
  doc: { enviadoAFirmaEn?: string | null; creadoEn: string; aprobaciones: PasoAprobacion[] },
  indice: number,
): string {
  const paso = doc.aprobaciones[indice];
  if (indice <= 0) return doc.enviadoAFirmaEn || paso?.pendienteDesde || doc.creadoEn;
  return doc.aprobaciones[indice - 1]?.fecha || paso?.pendienteDesde || doc.creadoEn;
}

/** Ids de quienes ya aprobaron alguna etapa de la cadena (para avisarles el resultado final o un rechazo posterior). */
export function idsAprobadoresPrevios(pasos: PasoAprobacion[]): string[] {
  return Array.from(new Set(pasos.filter((p) => p.estado === "aprobado" && p.resueltoPorId).map((p) => p.resueltoPorId as string)));
}
