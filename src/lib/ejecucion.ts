import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";
import type { MuestraEntregada, RegistroFuerzaVentas, RegistroParticipacion, SesionEjecucionEvento } from "@/types";

/**
 * Lectura de las tablas que alimenta `ejecucion.html` (Fase 7) — usadas acá
 * solo para los informes agregados de la Fase 6 (Ejecución de Eventos,
 * Asistentes Impactados, Informe por Evento, Panel en Vivo, Eventos en
 * Vivo). Nunca se escribe aquí — ver el docstring de `RegistroParticipacion`
 * en `types.ts`.
 */

function filaARegistroParticipacion(fila: Record<string, unknown>): RegistroParticipacion {
  return {
    id: fila.id as string,
    eventoId: fila.evento_id as string,
    sesionEjecucionId: fila.sesion_ejecucion_id as string,
    nombres: fila.nombres as string,
    apellidos: fila.apellidos as string,
    cedula: fila.cedula as string,
    tipoDocumento: (fila.tipo_documento as string) ?? "Cédula",
    profesion: fila.profesion as string,
    profesionDetalle: (fila.profesion_detalle as string) ?? "",
    especialidad: (fila.especialidad as string) ?? "",
    especialidadOtra: (fila.especialidad_otra as string) ?? "",
    celular: (fila.celular as string) ?? "",
    email: (fila.email as string) ?? "",
    autorizaImagenVoz: Boolean(fila.autoriza_imagen_voz),
    autorizaDatosPersonales: Boolean(fila.autoriza_datos_personales),
    interesVisitaMedica: (fila.interes_visita_medica as string) ?? "",
    direccion: (fila.direccion as string) ?? "",
    ciudad: (fila.ciudad as string) ?? "",
    pais: (fila.pais as string) ?? "",
    estadoProvincia: (fila.estado_provincia as string) ?? "",
    tipoParticipacion: fila.tipo_participacion as string,
    capturadoEn: fila.capturado_en as string,
    firmaId: (fila.firma_id as string) ?? null,
    declaracionTextoMostrado: (fila.declaracion_texto_mostrado as string) ?? "",
    // El nombre real de esta columna no está confirmado (la RPC recibe
    // `p_sesion_id`): se leen las dos variantes razonables.
    sesionEventoId: ((fila.sesion_id ?? fila.sesion_evento_id) as string | null | undefined) ?? null,
  };
}

export async function traerRegistrosParticipacion(eventoId?: string): Promise<RegistroParticipacion[]> {
  let consulta = supabase.from("registros_participacion").select("*").order("capturado_en", { ascending: false });
  if (eventoId) consulta = consulta.eq("evento_id", eventoId);
  const { data, error } = await consulta;
  if (error) throw new Error(mensajeErrorAmigable(error));
  return (data ?? []).map(filaARegistroParticipacion);
}

function filaAMuestraEntregada(fila: Record<string, unknown>): MuestraEntregada {
  return {
    id: fila.id as string,
    registroParticipacionId: fila.registro_participacion_id as string,
    eventoId: fila.evento_id as string,
    productoId: fila.producto_id as string,
    cantidad: Number(fila.cantidad ?? 0),
    capturadoEn: fila.capturado_en as string,
    firmaConfirmacionId: (fila.firma_confirmacion_id as string) ?? null,
  };
}

export async function traerMuestrasEntregadas(eventoId?: string): Promise<MuestraEntregada[]> {
  let consulta = supabase.from("muestras_entregadas").select("*").order("capturado_en", { ascending: false });
  if (eventoId) consulta = consulta.eq("evento_id", eventoId);
  const { data, error } = await consulta;
  if (error) throw new Error(mensajeErrorAmigable(error));
  return (data ?? []).map(filaAMuestraEntregada);
}

function filaASesionEjecucion(fila: Record<string, unknown>): SesionEjecucionEvento {
  return {
    id: fila.id as string,
    eventoId: fila.evento_id as string,
    codigoAccesoId: fila.codigo_acceso_id as string,
    responsableNombre: (fila.responsable_nombre as string) ?? "",
    iniciadoEn: fila.iniciado_en as string,
    expiraEn: (fila.expira_en as string) ?? null,
  };
}

export async function traerSesionesEjecucion(eventoId?: string): Promise<SesionEjecucionEvento[]> {
  let consulta = supabase.from("sesiones_ejecucion_evento").select("*").order("iniciado_en", { ascending: false });
  if (eventoId) consulta = consulta.eq("evento_id", eventoId);
  const { data, error } = await consulta;
  if (error) throw new Error(mensajeErrorAmigable(error));
  return (data ?? []).map(filaASesionEjecucion);
}

export interface CodigoAccesoConEvento {
  id: string;
  eventoId: string;
  codigo: string;
  activo: boolean;
  creadoEn: string;
  expiraEn: string | null;
}

function filaACodigoAcceso(fila: Record<string, unknown>): CodigoAccesoConEvento {
  return {
    id: fila.id as string,
    eventoId: fila.evento_id as string,
    codigo: fila.codigo as string,
    activo: Boolean(fila.activo),
    creadoEn: fila.creado_en as string,
    expiraEn: (fila.expira_en as string) ?? null,
  };
}

/** Todos los códigos de acceso ACTIVOS hoy — la base de "Panel en Vivo" y "Eventos en Vivo" (eventos que alguien podría estar ejecutando ahora mismo). */
export async function traerCodigosAccesoActivos(): Promise<CodigoAccesoConEvento[]> {
  const { data, error } = await supabase.from("eventos_codigos_acceso").select("*").eq("activo", true);
  if (error) throw new Error(mensajeErrorAmigable(error));
  return (data ?? []).map(filaACodigoAcceso);
}

/**
 * Agregados de ejecución de UN evento: conteo de participantes por tipo de
 * participación, y total de muestras entregadas por producto. Se calcula en
 * memoria a partir de las filas ya traídas — el volumen por evento es
 * pequeño (cientos de filas, no miles), así que no hace falta una RPC de
 * agregación dedicada para esta fase.
 */
export interface ResumenEjecucionEvento {
  totalParticipantes: number;
  porTipoParticipacion: { tipo: string; cantidad: number }[];
  totalMuestras: number;
  porProductoId: { productoId: string; cantidad: number }[];
}

export function calcularResumenEjecucion(
  registros: RegistroParticipacion[],
  muestras: MuestraEntregada[],
): ResumenEjecucionEvento {
  const porTipo = new Map<string, number>();
  for (const r of registros) {
    porTipo.set(r.tipoParticipacion, (porTipo.get(r.tipoParticipacion) ?? 0) + 1);
  }
  const porProducto = new Map<string, number>();
  for (const m of muestras) {
    porProducto.set(m.productoId, (porProducto.get(m.productoId) ?? 0) + m.cantidad);
  }
  return {
    totalParticipantes: registros.length,
    porTipoParticipacion: Array.from(porTipo.entries()).map(([tipo, cantidad]) => ({ tipo, cantidad })),
    totalMuestras: Array.from(porProducto.values()).reduce((a, b) => a + b, 0),
    porProductoId: Array.from(porProducto.entries()).map(([productoId, cantidad]) => ({ productoId, cantidad })),
  };
}

/**
 * Octubre 2026 (Expediente del evento): fuerza de ventas anotada desde la app
 * de Ejecución (`registrar_fuerza_ventas_ejecucion`). Si la migración
 * `db/agregar_expediente_evento.sql` todavía no se aplicó, la tabla no existe:
 * se devuelve una lista vacía en vez de romper el Expediente.
 */
export async function traerRegistrosFuerzaVentas(eventoId: string): Promise<RegistroFuerzaVentas[]> {
  const { data, error } = await supabase
    .from("registros_fuerza_ventas")
    .select("*")
    .eq("evento_id", eventoId)
    .order("capturado_en", { ascending: false });
  if (error) {
    console.warn("No se pudo leer registros_fuerza_ventas (¿falta aplicar la migración del Expediente?):", error.message);
    return [];
  }
  return (data ?? []).map((fila) => ({
    id: fila.id as string,
    eventoId: fila.evento_id as string,
    sesionId: (fila.sesion_id as string) ?? null,
    nombre: (fila.nombre as string) ?? "",
    cargo: (fila.cargo as string) ?? "",
    ciudad: (fila.ciudad as string) ?? "",
    capturadoEn: fila.capturado_en as string,
  }));
}

export async function eliminarRegistroFuerzaVentas(id: string): Promise<void> {
  const { error } = await supabase.from("registros_fuerza_ventas").delete().eq("id", id);
  if (error) throw new Error(mensajeErrorAmigable(error));
}
