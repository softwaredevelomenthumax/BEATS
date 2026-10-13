import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";
import type {
  ConfiguracionFormatos,
  ConfiguracionFormatosEmpresa,
  ConfiguracionFormatosHistorialEntrada,
  ConfiguracionFormatosPorDoc,
  FormatoDocumentoConfig,
  FormatoOficialFmv,
} from "@/types";

/**
 * Prefijo de columna en `configuracion_formatos`/`configuracion_formatos_empresa`
 * para cada tipo de documento — confirmado por el esquema real de ambas
 * tablas (mismos 4 sufijos `_proceso`/`_codigo`/`_version`/`_fecha_emision`
 * repetidos 6 veces, uno por tipo de documento).
 */
const PREFIJO_POR_TIPO: Record<keyof ConfiguracionFormatosPorDoc, string> = {
  evento: "evento",
  convenio: "convenio",
  convenioHCP: "convenio_hcp",
  fmv: "fmv",
  notificacionPago: "notificacion_pago",
  caf: "caf",
};

const TIPOS = Object.keys(PREFIJO_POR_TIPO) as (keyof ConfiguracionFormatosPorDoc)[];

function formatoDesdeFila(fila: Record<string, unknown>, prefijo: string): FormatoDocumentoConfig {
  return {
    proceso: (fila[`${prefijo}_proceso`] as string) ?? "",
    codigo: (fila[`${prefijo}_codigo`] as string) ?? "",
    version: (fila[`${prefijo}_version`] as string) ?? "",
    fechaEmision: (fila[`${prefijo}_fecha_emision`] as string) ?? null,
  };
}

function filaDesdeFormatos(formatos: Partial<ConfiguracionFormatosPorDoc>): Record<string, unknown> {
  const fila: Record<string, unknown> = {};
  for (const tipo of TIPOS) {
    const f = formatos[tipo];
    if (!f) continue;
    const prefijo = PREFIJO_POR_TIPO[tipo];
    fila[`${prefijo}_proceso`] = f.proceso || "";
    fila[`${prefijo}_codigo`] = f.codigo || "";
    fila[`${prefijo}_version`] = f.version || "";
    fila[`${prefijo}_fecha_emision`] = f.fechaEmision || null;
  }
  return fila;
}

/**
 * `configuracion_formatos` es una fila única (`id` smallint, siempre 1 —
 * confirmado por el default `1` de la columna en el esquema real). Si por
 * algún motivo no existe todavía (BD recién creada), se crea con valores
 * vacíos en el primer guardado.
 */
export async function traerConfiguracionFormatos(): Promise<ConfiguracionFormatos> {
  const { data, error } = await supabase.from("configuracion_formatos").select("*").eq("id", 1).maybeSingle();
  if (error) throw new Error(mensajeErrorAmigable(error));
  const fila = data ?? {};
  const formatos = {} as ConfiguracionFormatosPorDoc;
  for (const tipo of TIPOS) formatos[tipo] = formatoDesdeFila(fila, PREFIJO_POR_TIPO[tipo]);
  return {
    formatos,
    logoId: (fila.logo_id as string) ?? null,
    logoAnchoPx: (fila.logo_ancho_px as number) ?? null,
    logoAltoPx: (fila.logo_alto_px as number) ?? null,
    logoAppId: (fila.logo_app_id as string) ?? null,
    logoAppAnchoPx: (fila.logo_app_ancho_px as number) ?? null,
    logoAppAltoPx: (fila.logo_app_alto_px as number) ?? null,
    declaracionTratamientoDatos: (fila.declaracion_tratamiento_datos as string) ?? "",
  };
}

export async function guardarConfiguracionFormatos(config: ConfiguracionFormatos): Promise<void> {
  const fila: Record<string, unknown> = {
    id: 1,
    ...filaDesdeFormatos(config.formatos),
    logo_id: config.logoId,
    logo_ancho_px: config.logoAnchoPx,
    logo_alto_px: config.logoAltoPx,
    logo_app_id: config.logoAppId,
    logo_app_ancho_px: config.logoAppAnchoPx,
    logo_app_alto_px: config.logoAppAltoPx,
    declaracion_tratamiento_datos: config.declaracionTratamientoDatos,
  };
  const { error } = await supabase.from("configuracion_formatos").upsert(fila, { onConflict: "id" });
  if (error) throw new Error(mensajeErrorAmigable(error));
}

export async function traerConfiguracionFormatosEmpresas(): Promise<ConfiguracionFormatosEmpresa[]> {
  const { data, error } = await supabase
    .from("configuracion_formatos_empresa")
    .select("*")
    .order("empresa_grupo", { ascending: true });
  if (error) throw new Error(mensajeErrorAmigable(error));
  return (data ?? []).map((fila) => {
    const formatos: Partial<ConfiguracionFormatosPorDoc> = {};
    for (const tipo of TIPOS) {
      const prefijo = PREFIJO_POR_TIPO[tipo];
      // Un override de empresa solo aplica el campo si al menos uno de sus
      // 4 valores está presente — si los 4 vienen null, ese tipo de
      // documento simplemente no tiene override y hereda el global.
      const f = formatoDesdeFila(fila, prefijo);
      if (f.proceso || f.codigo || f.version || f.fechaEmision) formatos[tipo] = f;
    }
    return {
      empresaGrupo: fila.empresa_grupo as string,
      formatos,
      logoId: (fila.logo_id as string) ?? null,
      logoAnchoPx: (fila.logo_ancho_px as number) ?? null,
      logoAltoPx: (fila.logo_alto_px as number) ?? null,
      declaracionTratamientoDatos: (fila.declaracion_tratamiento_datos as string) ?? null,
    };
  });
}

export async function guardarConfiguracionFormatosEmpresa(config: ConfiguracionFormatosEmpresa): Promise<void> {
  const fila: Record<string, unknown> = {
    empresa_grupo: config.empresaGrupo,
    ...filaDesdeFormatos(config.formatos),
    logo_id: config.logoId,
    logo_ancho_px: config.logoAnchoPx,
    logo_alto_px: config.logoAltoPx,
    declaracion_tratamiento_datos: config.declaracionTratamientoDatos,
  };
  const { error } = await supabase
    .from("configuracion_formatos_empresa")
    .upsert(fila, { onConflict: "empresa_grupo" });
  if (error) throw new Error(mensajeErrorAmigable(error));
}

export async function eliminarConfiguracionFormatosEmpresa(empresaGrupo: string): Promise<void> {
  const { error } = await supabase.from("configuracion_formatos_empresa").delete().eq("empresa_grupo", empresaGrupo);
  if (error) throw new Error(mensajeErrorAmigable(error));
}

/**
 * Resuelve el formato efectivo de un tipo de documento para una empresa:
 * el override de empresa gana campo por campo (no todo-o-nada) sobre el
 * valor global — así una empresa puede fijar solo el código y heredar el
 * resto.
 */
export function resolverFormatoDocumento(
  tipo: keyof ConfiguracionFormatosPorDoc,
  empresaGrupo: string,
  global: ConfiguracionFormatos,
  porEmpresa: ConfiguracionFormatosEmpresa[],
): FormatoDocumentoConfig {
  const base = global.formatos[tipo];
  const override = porEmpresa.find((e) => e.empresaGrupo === empresaGrupo)?.formatos[tipo];
  if (!override) return base;
  return {
    proceso: override.proceso || base.proceso,
    codigo: override.codigo || base.codigo,
    version: override.version || base.version,
    fechaEmision: override.fechaEmision ?? base.fechaEmision,
  };
}

const CAMPOS_FORMATO_FMV = "id, archivo_id, fecha_carga, vigente_desde, empresa_grupo";

function filaAFormatoOficialFmv(fila: Record<string, unknown>): FormatoOficialFmv {
  return {
    id: fila.id as string,
    archivoId: (fila.archivo_id as string) ?? null,
    fechaCarga: fila.fecha_carga as string,
    vigenteDesde: fila.vigente_desde as string,
    empresaGrupo: (fila.empresa_grupo as string) ?? "",
  };
}

export async function traerFormatoOficialFmv(): Promise<FormatoOficialFmv[]> {
  const { data, error } = await supabase
    .from("formato_oficial_fmv")
    .select(CAMPOS_FORMATO_FMV)
    .order("vigente_desde", { ascending: false });
  if (error) throw new Error(mensajeErrorAmigable(error));
  return (data ?? []).map(filaAFormatoOficialFmv);
}

/**
 * Registra una nueva versión del formato oficial FMV, opcionalmente con el
 * PDF real ya cargado (`archivoId`, Fase 1 — infraestructura de archivos,
 * septiembre 2026: antes quedaba siempre en null por no existir todavía la
 * conexión a `archivos_adjuntos`).
 */
export async function registrarFormatoOficialFmv(
  vigenteDesde: string,
  empresaGrupo: string,
  archivoId: string | null = null,
): Promise<FormatoOficialFmv> {
  const { data, error } = await supabase
    .from("formato_oficial_fmv")
    .insert({ vigente_desde: vigenteDesde, empresa_grupo: empresaGrupo || null, archivo_id: archivoId })
    .select(CAMPOS_FORMATO_FMV)
    .single();
  if (error) throw new Error(mensajeErrorAmigable(error));
  return filaAFormatoOficialFmv(data);
}

export async function eliminarFormatoOficialFmv(id: string): Promise<void> {
  const { error } = await supabase.from("formato_oficial_fmv").delete().eq("id", id);
  if (error) throw new Error(mensajeErrorAmigable(error));
}

/**
 * La versión vigente es la de `vigenteDesde` más reciente que ya llegó.
 *
 * Corrección (octubre 2026): antes solo se consideraban las versiones de la
 * MISMA empresa (`v.empresaGrupo === empresaGrupo`), así que un formato
 * registrado como "todas las empresas" (`empresaGrupo` vacío) nunca se
 * encontraba al abrir un FMV de una empresa concreta, y el formulario decía
 * "todavía no hay un formato oficial FMV vigente" aunque sí lo hubiera. Ahora
 * se prefiere la versión vigente de la propia empresa y, si no tiene, se usa
 * la global.
 */
export function formatoOficialFmvVigente(versiones: FormatoOficialFmv[], empresaGrupo: string): FormatoOficialFmv | null {
  const hoy = new Date().toISOString().slice(0, 10);
  const masReciente = (lista: FormatoOficialFmv[]) =>
    lista.filter((v) => v.vigenteDesde <= hoy).sort((a, b) => (a.vigenteDesde < b.vigenteDesde ? 1 : -1))[0] ?? null;
  const normalizar = (v: string | null | undefined) => (v || "").trim().toLowerCase();
  const propia = empresaGrupo
    ? masReciente(versiones.filter((v) => normalizar(v.empresaGrupo) === normalizar(empresaGrupo)))
    : null;
  return propia ?? masReciente(versiones.filter((v) => !normalizar(v.empresaGrupo)));
}

// Ítems #4/#5 de la entrega "Configuración de Formatos" (septiembre 2026):
// bitácora append-only de cambios, sobre `configuracion_formatos_historial`
// (ver migración `db/agregar_historial_configuracion_formatos.sql`). Mismo
// criterio que el resto de esta capa: si la tabla todavía no existe en la
// base real (migración pendiente de aplicar), `traer...` devuelve lista
// vacía en vez de reventar el resto del panel, y `registrar...` no bloquea
// el guardado principal si falla — se seguirá pudiendo guardar formatos y
// la declaración aunque el historial no se pueda escribir todavía.
function filaAHistorialEntrada(fila: Record<string, unknown>): ConfiguracionFormatosHistorialEntrada {
  return {
    id: fila.id as string,
    fecha: fila.fecha as string,
    usuarioId: (fila.usuario_id as string) ?? null,
    usuarioEmail: (fila.usuario_email as string) ?? null,
    seccion: fila.seccion as ConfiguracionFormatosHistorialEntrada["seccion"],
    tipoDocumento: (fila.tipo_documento as keyof ConfiguracionFormatosPorDoc) ?? null,
    empresaGrupo: (fila.empresa_grupo as string) ?? "",
    valores: fila.valores,
  };
}

export async function traerConfiguracionFormatosHistorial(): Promise<ConfiguracionFormatosHistorialEntrada[]> {
  const { data, error } = await supabase
    .from("configuracion_formatos_historial")
    .select("*")
    .order("fecha", { ascending: false })
    .limit(200);
  if (error) {
    console.error(mensajeErrorAmigable(error));
    return [];
  }
  return (data ?? []).map(filaAHistorialEntrada);
}

export async function registrarConfiguracionFormatosHistorial(entrada: {
  seccion: ConfiguracionFormatosHistorialEntrada["seccion"];
  tipoDocumento?: keyof ConfiguracionFormatosPorDoc | null;
  empresaGrupo: string;
  valores: unknown;
  usuarioId?: string | null;
  usuarioEmail?: string | null;
}): Promise<void> {
  const { error } = await supabase.from("configuracion_formatos_historial").insert({
    seccion: entrada.seccion,
    tipo_documento: entrada.tipoDocumento ?? null,
    empresa_grupo: entrada.empresaGrupo || null,
    valores: entrada.valores,
    usuario_id: entrada.usuarioId ?? null,
    usuario_email: entrada.usuarioEmail ?? null,
  });
  if (error) {
    // No se relanza: el registro de historial es un "además", no debe
    // impedir que el guardado principal (ya confirmado antes de llamar
    // esta función) se reporte como exitoso al usuario.
    console.error(mensajeErrorAmigable(error));
  }
}
