import { supabase } from "@/lib/supabaseClient";
import { normalizarEmail } from "@/lib/normalizarTexto";

/**
 * Capa de mapeo fila (snake_case, tal como vive en Postgres) <-> objeto
 * "flat" (camelCase, tal como lo consume la UI/el estado de los
 * formularios). Cada documento define un arreglo de FieldSpec y usa
 * rowToFlat/flatToRow para convertir en ambas direcciones sin repetir la
 * lógica de "¿qué hago si viene null?" en cada formulario.
 */
export interface FieldSpec {
  /** Clave del objeto "flat" usado en el estado de React. */
  key: string;
  /** Nombre real de la columna en la tabla de Postgres. */
  column: string;
  toFlat: (valorColumna: unknown) => unknown;
  toRow: (valorFlat: unknown) => unknown;
}

/** Texto simple: nunca null en el estado, se guarda como "" si falta. */
export function t(column: string, key: string = column): FieldSpec {
  return {
    key,
    column,
    toFlat: (v) => (v == null ? "" : String(v)),
    toRow: (v) => (v == null ? "" : String(v)),
  };
}

/**
 * Entrega 31: correo electrónico — se guarda siempre en minúscula y sin espacios,
 * así «ANA@X.COM» y «ana@x.com» son el mismo dato (nunca un duplicado).
 */
export function em(column: string, key: string = column): FieldSpec {
  return {
    key,
    column,
    toFlat: (v) => (v == null ? "" : String(v)),
    toRow: (v) => normalizarEmail(v == null ? "" : String(v)),
  };
}

/**
 * Texto opcional/nullable: en el estado se ve como "" para simplificar los
 * inputs controlados, pero al guardar una cadena vacía se convierte de
 * vuelta a null (columnas verdaderamente opcionales, p. ej. fechas
 * guardadas como texto, comentarios de anulación, ids de referencia).
 */
export function s0(column: string, key: string = column): FieldSpec {
  return {
    key,
    column,
    toFlat: (v) => (v == null ? "" : String(v)),
    toRow: (v) => (v == null || v === "" ? null : String(v)),
  };
}

/** Booleano, default false. */
export function b(column: string, key: string = column): FieldSpec {
  return {
    key,
    column,
    toFlat: (v) => Boolean(v),
    toRow: (v) => Boolean(v),
  };
}

/** Numérico, default 0 (nunca NaN/null en el estado). */
export function n0(column: string, key: string = column): FieldSpec {
  return {
    key,
    column,
    toFlat: (v) => (v == null || v === "" ? 0 : Number(v)),
    toRow: (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? 0 : Number(v)),
  };
}

/** Numérico nullable: a diferencia de `n0` (que fuerza 0), aquí `null` es un valor legítimo ("todavía no aplica"). */
export function n0n(column: string, key: string = column): FieldSpec {
  return {
    key,
    column,
    toFlat: (v) => (v == null || v === "" ? null : Number(v)),
    toRow: (v) => (v == null || v === "" ? null : Number(v)),
  };
}

/** Arreglo de texto/uuid (p. ej. `uuid[]`), default []. */
export function arr(column: string, key: string = column): FieldSpec {
  return {
    key,
    column,
    toFlat: (v) => (Array.isArray(v) ? v : []),
    toRow: (v) => (Array.isArray(v) ? v : []),
  };
}

/** JSON/JSONB con un valor por defecto explícito ({}, [] o un objeto tipado). */
export function j<T>(column: string, valorPorDefecto: T, key: string = column): FieldSpec {
  return {
    key,
    column,
    toFlat: (v) => (v == null ? valorPorDefecto : (v as T)),
    toRow: (v) => (v == null ? valorPorDefecto : v),
  };
}

export function rowToFlat<F = Record<string, unknown>>(
  row: Record<string, unknown>,
  specs: FieldSpec[],
): F {
  const flat: Record<string, unknown> = {};
  for (const spec of specs) {
    flat[spec.key] = spec.toFlat(row[spec.column]);
  }
  // Octubre 2026: fecha de envío a firma (ver db/agregar_fecha_envio_a_firma.sql).
  // Se lee aparte (y NO está en `CAMPOS_*`) para que `flatToRow` nunca intente
  // escribirla y nada falle si la columna todavía no existe.
  if ("enviado_a_firma_en" in row) flat.enviadoAFirmaEn = (row.enviado_a_firma_en as string | null) ?? null;
  return flat as F;
}

export function flatToRow(
  flat: Record<string, unknown>,
  specs: FieldSpec[],
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const spec of specs) {
    // `id` es siempre generado por el servidor (uuid con default en
    // Postgres) y nunca debe formar parte de un payload de insert/update —
    // como `crear*`/`editarYReenviar*` de cada documento no traen un `id`
    // real en su `datos` (el formulario nunca lo edita), `t("id")` convertía
    // el `undefined` en `""` y eso se enviaba literalmente como
    // `id: ""` tanto al crear como, más grave, al actualizar un documento
    // existente (sobrescribiendo su id real). `rowToFlat` sigue necesitando
    // `t("id")` en cada `CAMPOS_*` para leer el id real al traer filas —
    // esta es la única función que debe ignorarlo.
    if (spec.column === "id") continue;
    row[spec.column] = spec.toRow(flat[spec.key]);
  }
  return row;
}

/**
 * Fase de ciclo de vida de documentos (septiembre 2026) — variante de
 * `flatToRow` para un UPDATE genuinamente parcial: solo convierte las
 * claves que el objeto `flat` realmente tiene (`Object.hasOwn`), en vez de
 * recorrer TODOS los `specs` y rellenar con el valor por defecto de cada
 * tipo (`t()` → `""`, `s0()`/`n0n()` → `null`, etc.) cualquier clave
 * ausente. Ese comportamiento de `flatToRow` es correcto para `crear*`
 * (donde `datos` es el objeto COMPLETO de un formulario "Nuevo ..." y las
 * pocas claves ausentes — `estado`/`creadoPorId`/`creadoEn` — siempre se
 * sobrescriben a mano justo después), pero es un error real en cualquier
 * `editarBorrador*`/`editarYReenviar*`/enmienda que reciba un objeto tipo
 * `DatosFormularioX` (que nunca incluye esas columnas de sistema): usar
 * `flatToRow` ahí escribía silenciosamente `creado_por_id: ""` y
 * `creado_en: ""` en cada guardado — encontrado al escribir las pruebas de
 * esta misma fase (`scripts/verificar_ciclo_vida_documentos.mjs`), donde
 * guardar un borrador dejaba el estado real corrupto y rompía el ícono de
 * la tarjeta del Tablero. Se usa en su lugar en todas esas funciones.
 */
export function flatToRowParcial(
  flat: Record<string, unknown>,
  specs: FieldSpec[],
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const spec of specs) {
    if (spec.column === "id") continue;
    if (!Object.hasOwn(flat, spec.key)) continue;
    row[spec.column] = spec.toRow(flat[spec.key]);
  }
  return row;
}

const TAMANO_PAGINA = 1000;

/**
 * Supabase limita cada select a 1000 filas por defecto. Esta función junta
 * todas las páginas de una tabla en un solo arreglo — se usa en la carga
 * inicial ("traer todo") tanto como en exportaciones/reportes que sí
 * necesitan el histórico completo.
 */
export async function traerTodasLasFilas<T = Record<string, unknown>>(
  tabla: string,
  opciones: {
    select?: string;
    ordenarPor?: string;
    ascendente?: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    modificar?: (query: any) => any;
  } = {},
): Promise<T[]> {
  const filas: T[] = [];
  let desde = 0;

  for (;;) {
    let query = supabase
      .from(tabla)
      .select(opciones.select ?? "*")
      .range(desde, desde + TAMANO_PAGINA - 1);

    if (opciones.ordenarPor) {
      query = query.order(opciones.ordenarPor, { ascending: opciones.ascendente ?? true });
    }
    if (opciones.modificar) {
      query = opciones.modificar(query);
    }

    const { data, error } = await query;
    if (error) throw error;

    const pagina = (data ?? []) as T[];
    filas.push(...pagina);

    if (pagina.length < TAMANO_PAGINA) break;
    desde += TAMANO_PAGINA;
  }

  return filas;
}
