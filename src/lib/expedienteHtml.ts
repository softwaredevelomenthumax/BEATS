import {
  ETIQUETA_CATEGORIA_FINANCIERA_REPOSITORIO,
  ETIQUETA_CATEGORIA_REPOSITORIO_ARCHIVO,
  ETIQUETA_TIPO_DOC,
  type CategoriaRepositorioArchivo,
} from "@/lib/enums";
import { documentosPorSpeaker } from "@/lib/documentosRequeridosEvento";
import type { DocumentoAny } from "@/lib/documentoGenerico";
import { tituloDocumentoGenerico } from "@/lib/documentoGenerico";
import {
  MARCOS_FOTO,
  alcancesFotos,
  conciliar,
  convenioDelSpeaker,
  fotosDelAlcance,
  fotosSinSesion,
  gruposSpeakers,
  type AlcanceAsistencia,
  type GrupoSpeakerExpediente,
} from "@/lib/expediente";
import { filasMuestrasPorEntrega } from "@/lib/expediente";
import { formatearFecha, formatearFechaHora } from "@/lib/fecha";
import { formatearMonto } from "@/lib/dinero";
import { ETIQUETA_FUENTE_ASISTENTES, ETIQUETA_TIPO_ASISTENTE, esc, ciudadesPaisTexto, type FinancieroEvento, type ResumenEvento } from "@/lib/informeEvento";
import { speakersExternosDe } from "@/lib/speakersEvento";
import type { ArchivoAdjunto } from "@/lib/archivosAdjuntos";
import type { DatosExpedienteCargados } from "@/components/expediente/useExpediente";
import type { Evento, RegistroFinancieroEvento, RepositorioArchivoEvento } from "@/types";

/**
 * Entrega 21 (octubre 2026): "Expediente completo" del evento como UN solo
 * archivo .html autocontenido (sin servidor, sin red salvo la tipografía de
 * Google Fonts, con respaldo del sistema). Contiene, identificado por
 * secciones y con índice lateral:
 *   1. Resumen del evento.
 *   2. La Solicitud de evento tal como se imprime en BEATS.
 *   3. Por cada speaker: foto, FMV, convenio de pago, CAF y convenio HCP
 *      (formularios generados), más sus soportes del Expediente (presentación,
 *      evidencia, convenio firmado, CAF corporativo) y su bloque financiero
 *      (orden de compra, facturas, comprobantes).
 *   4. Notificaciones de pago.
 *   5. Lista de asistencia (con firmas) y muestras médicas entregadas.
 *   6. Fotos por sesión/marco.
 *   7. Otros documentos del evento (listas externas, certificados, etc.).
 * Los archivos (imágenes, PDF, presentaciones) viajan DENTRO del HTML en base64.
 */

// --- Qué documentos y archivos entran -------------------------------------------

export interface DocSistema {
  clave: string;
  etiqueta: string;
  doc: DocumentoAny;
}

export interface BloqueSpeakerDocs {
  grupo: GrupoSpeakerExpediente;
  docs: DocSistema[];
}

export interface DocumentosDelEvento {
  evento: DocSistema;
  porSpeaker: BloqueSpeakerDocs[];
  pagos: DocSistema[];
}

/** Mismo emparejamiento documento↔speaker que la pestaña "Documentos del sistema" del Expediente. */
export function listarDocumentosSistema(evento: Evento, datos: DatosExpedienteCargados): DocumentosDelEvento {
  const grupos = gruposSpeakers(evento);
  const porSpeakerDocs = documentosPorSpeaker(evento, datos.convenios, datos.fmvs, datos.cafs, datos.conveniosHcp);
  const porSpeaker: BloqueSpeakerDocs[] = grupos.map((g) => {
    const d = g.sp ? porSpeakerDocs.find((x) => x.speaker.id === g.sp!.id) : undefined;
    const fmv = d?.fmv ?? (g.sp ? null : datos.fmvs[0] ?? null);
    const convenio = d?.convenio ?? (g.sp ? null : datos.convenios[0] ?? null);
    const caf = d?.caf ?? (g.sp ? null : datos.cafs[0] ?? null);
    const convenioHCP = d?.convenioHCP ?? (g.sp ? null : datos.conveniosHcp[0] ?? null);
    const docs: DocSistema[] = [];
    const k = g.speakerId ?? g.nombre;
    if (fmv) docs.push({ clave: `fmv-${k}`, etiqueta: ETIQUETA_TIPO_DOC.fmv, doc: fmv });
    if (convenio) docs.push({ clave: `conv-${k}`, etiqueta: ETIQUETA_TIPO_DOC.convenio, doc: convenio });
    if (caf) docs.push({ clave: `caf-${k}`, etiqueta: ETIQUETA_TIPO_DOC.caf, doc: caf });
    // Entrega 32: un convenio elaborado en el aplicativo corporativo no tiene documento de BEATS que imprimir; solo se muestra su copia firmada.
    if (convenioHCP && !convenioHCP.elaboradoEnContratosCorporativo) docs.push({ clave: `hcp-${k}`, etiqueta: ETIQUETA_TIPO_DOC.convenioHCP, doc: convenioHCP });
    return { grupo: g, docs };
  });
  return {
    evento: { clave: "evento", etiqueta: ETIQUETA_TIPO_DOC.evento, doc: evento },
    porSpeaker,
    pagos: datos.notificaciones.map((n) => ({ clave: `notif-${n.id}`, etiqueta: ETIQUETA_TIPO_DOC.notificacionPago, doc: n })),
  };
}

export function todosLosDocsSistema(d: DocumentosDelEvento): DocSistema[] {
  return [d.evento, ...d.porSpeaker.flatMap((b) => b.docs), ...d.pagos];
}

/** Ids de `archivos_adjuntos` que el HTML necesita incrustar. */
export function idsArchivosExpediente(evento: Evento, datos: DatosExpedienteCargados, alcances: AlcanceAsistencia[]): string[] {
  const ids = new Set<string>();
  for (const a of datos.archivos) if (a.archivoId) ids.add(a.archivoId);
  for (const f of datos.financieros) if (f.archivoId) ids.add(f.archivoId);
  for (const c of datos.conveniosResumen) if (c.archivoFirmadoHCPId) ids.add(c.archivoFirmadoHCPId);
  for (const al of alcances) for (const r of al.registros) if (r.firmaId) ids.add(r.firmaId);
  if (evento.entregaMuestrasMedicas) for (const m of datos.muestras) if (m.firmaConfirmacionId) ids.add(m.firmaConfirmacionId);
  return Array.from(ids);
}

// --- CSS de la aplicación -----------------------------------------------------

const ES_MODO_OSCURO = /prefers-color-scheme\s*:\s*dark/i;

/**
 * Entrega 31 (octubre 2026) — corrección: los formularios incrustados
 * (Solicitud, FMV, Convenio de pago, CAF, Convenio HCP) salían sin diagramación.
 * Causa: antes se descartaba CUALQUIER regla de primer nivel cuyo texto
 * mencionara el modo oscuro, y Tailwind v4 mete todas las utilidades dentro de
 * UN solo `@layer utilities { … }`; en cuanto algún componente usó una
 * utilidad `dark:` (que compila a un `@media (prefers-color-scheme: dark)`
 * anidado), el bloque COMPLETO de utilidades (~66 KB) se quedaba fuera del
 * archivo. Ahora se recorre cada regla por dentro y solo se quitan las ramas
 * de modo oscuro, conservando el resto.
 */
function cssSinModoOscuro(regla: CSSRule): string {
  const hijos = (r: CSSGroupingRule) =>
    Array.from(r.cssRules)
      .map(cssSinModoOscuro)
      .join("\n");
  if (typeof CSSMediaRule !== "undefined" && regla instanceof CSSMediaRule) {
    if (ES_MODO_OSCURO.test(regla.media.mediaText)) return "";
    return `@media ${regla.media.mediaText} {\n${hijos(regla)}\n}`;
  }
  if (typeof CSSLayerBlockRule !== "undefined" && regla instanceof CSSLayerBlockRule) {
    return `@layer ${regla.name} {\n${hijos(regla)}\n}`;
  }
  if (typeof CSSSupportsRule !== "undefined" && regla instanceof CSSSupportsRule) {
    return `@supports ${regla.conditionText} {\n${hijos(regla)}\n}`;
  }
  if (typeof CSSStyleRule !== "undefined" && regla instanceof CSSStyleRule) {
    // Regla con anidamiento CSS (Tailwind v4 anida las variantes dentro de la utilidad).
    const anidadas = (regla as CSSStyleRule & { cssRules?: CSSRuleList }).cssRules;
    if (anidadas && anidadas.length > 0) {
      const internas = Array.from(anidadas).map(cssSinModoOscuro).filter(Boolean).join("\n");
      const propias = regla.style.cssText;
      if (!propias && !internas) return "";
      return `${regla.selectorText} {\n${propias}\n${internas}\n}`;
    }
    return regla.cssText;
  }
  // Otros tipos (@font-face, @keyframes, @property, @container…): tal cual, salvo que mencionen el modo oscuro.
  return ES_MODO_OSCURO.test(regla.cssText) ? "" : regla.cssText;
}

/**
 * Copia las hojas de estilo ya cargadas de la app (Tailwind compilado + tokens
 * de tema), para que los formularios incrustados se vean EXACTAMENTE como en la
 * vista de impresión de BEATS. Se omiten las hojas de otro origen (Google
 * Fonts: el navegador no deja leer sus reglas; se enlaza aparte) y las reglas
 * de modo oscuro (el archivo se fija en claro con `data-theme="light"`).
 */
export function recolectarCssApp(): string {
  const partes: string[] = [];
  for (const hoja of Array.from(document.styleSheets)) {
    let reglas: CSSRuleList;
    try {
      reglas = hoja.cssRules;
    } catch {
      continue;
    }
    for (const regla of Array.from(reglas)) {
      const texto = cssSinModoOscuro(regla);
      if (texto) partes.push(texto);
    }
  }
  return partes.join("\n");
}

// --- Piezas de HTML -----------------------------------------------------------

const ETIQUETA_ESTADO_CLASE: Record<string, string> = {
  Borrador: "draft",
  Pendiente: "pending",
  Aprobado: "approved",
  Rechazado: "rejected",
  Devuelto: "draft",
  Completado: "completed",
  Anulado: "cancelled",
};

const chipEstado = (estado: string) => `<span class="x-chip x-chip-${ETIQUETA_ESTADO_CLASE[estado] ?? "draft"}">${esc(estado)}</span>`;

const iniciales = (nombre: string) => nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

function avatar(nombre: string, fotoUrl: string | undefined, tam = 56): string {
  return fotoUrl
    ? `<img class="x-avatar" style="width:${tam}px;height:${tam}px" src="${esc(fotoUrl)}" alt="${esc(nombre)}">`
    : `<span class="x-avatar x-avatar-ini" style="width:${tam}px;height:${tam}px;font-size:${Math.round(tam / 2.8)}px">${esc(iniciales(nombre))}</span>`;
}

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";

function tabla(encabezados: string[], filas: string[][], clase = ""): string {
  return `<div class="x-tabla-wrap"><table class="x-tabla ${clase}"><thead><tr>${encabezados.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${filas
    .map((f) => `<tr>${f.join("")}</tr>`)
    .join("")}</tbody></table></div>`;
}
const td = (v: unknown) => `<td>${esc(v === "" || v == null ? "—" : v)}</td>`;
const tdHtml = (h: string) => `<td>${h}</td>`;

/** Archivo incrustado: imagen en línea; PDF en visor; cualquier otro tipo como descarga. */
function htmlArchivo(a: ArchivoAdjunto | undefined, titulo: string): string {
  if (!a || !a.dataUrl) return `<p class="x-vacio">Archivo no disponible — ${esc(titulo)}.</p>`;
  const nombre = a.nombre || titulo;
  const enlace = `<a class="x-btn" href="#" data-uri="${esc(a.dataUrl)}" data-nombre="${esc(nombre)}" data-accion="descargar">Descargar ${esc(nombre)}</a>`;
  if (a.tipo.startsWith("image/")) {
    return `<figure class="x-archivo"><img class="x-zoom" src="${esc(a.dataUrl)}" alt="${esc(titulo)}"><figcaption>${esc(nombre)}</figcaption></figure>`;
  }
  if (a.tipo === "application/pdf") {
    return `<div class="x-archivo"><iframe class="x-pdf" title="${esc(titulo)}" data-uri="${esc(a.dataUrl)}"></iframe><p class="x-pie-archivo">${esc(nombre)} · ${enlace}</p></div>`;
  }
  return `<div class="x-archivo x-archivo-generico"><span class="x-icono-archivo">📎</span><span>${esc(nombre)}</span>${enlace}</div>`;
}

function bloque(titulo: string, cuerpo: string, extra = ""): string {
  return `<div class="x-bloque"><h4>${esc(titulo)}${extra}</h4>${cuerpo}</div>`;
}

function htmlDocumento(d: DocSistema, html: string | undefined): string {
  const doc = d.doc;
  const estado = doc.estado;
  const aprobado = "aprobaciones" in doc ? (doc.aprobaciones ?? []).filter((p) => p.estado === "aprobado" && p.fecha).map((p) => p.fecha as string).sort().pop() : undefined;
  return `<details class="x-doc" id="doc-${esc(slug(d.clave))}" open>
  <summary><span class="x-doc-tipo">${esc(d.etiqueta)}</span><span class="x-doc-titulo">${esc(tituloDocumentoGenerico(doc))}</span>${chipEstado(estado)}${aprobado ? `<span class="x-doc-fecha">Aprobado ${esc(formatearFechaHora(aprobado))}</span>` : ""}</summary>
  <div class="x-hoja">${html ?? '<p class="x-vacio">No se pudo generar la vista de este documento.</p>'}</div>
</details>`;
}

const ORDEN_CATEGORIAS: CategoriaRepositorioArchivo[] = ["presentacionAprobada", "evidenciaAprobacionPresentacion", "caf", "convenio", "certificadoParticipacion", "listaAsistencia", "otros", "fotos"];

function htmlFilaRepositorio(f: RepositorioArchivoEvento, archivos: Map<string, ArchivoAdjunto>, evento: Evento): string {
  const etiqueta = ETIQUETA_CATEGORIA_REPOSITORIO_ARCHIVO[f.categoria] ?? f.categoria;
  const ses = f.sesionId ? evento.sesiones.findIndex((s) => s.id === f.sesionId) : -1;
  const sufijo = ses >= 0 ? ` — Sesión ${ses + 1}` : "";
  if (f.noAplica) {
    return bloque(`${etiqueta}${sufijo}`, `<p class="x-noaplica"><b>No aplica.</b> ${esc(f.noAplicaMotivo || "Sin motivo registrado.")}</p>`);
  }
  return bloque(`${etiqueta}${sufijo}`, htmlArchivo(f.archivoId ? archivos.get(f.archivoId) : undefined, etiqueta));
}

function htmlFinanciero(filas: RegistroFinancieroEvento[], archivos: Map<string, ArchivoAdjunto>, evento: Evento): string {
  if (filas.length === 0) return `<p class="x-vacio">Sin órdenes de compra, facturas ni comprobantes de pago.</p>`;
  const conc = conciliar(filas);
  const resumen = conc
    .map(
      (l) => `<div class="x-conc"><span>Orden de compra <b>${esc(formatearMonto(l.ordenCompra, l.moneda))}</b></span><span>Facturado <b>${esc(formatearMonto(l.facturas, l.moneda))}</b></span><span>Pagado <b>${esc(formatearMonto(l.comprobantes, l.moneda))}</b></span>${
        l.alertas.length ? `<ul class="x-alertas">${l.alertas.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : `<span class="x-ok">Cuadra</span>`
      }</div>`,
    )
    .join("");
  const orden: RegistroFinancieroEvento["categoria"][] = ["ordenCompra", "facturas", "comprobantePago"];
  const detalle = orden
    .flatMap((cat) => filas.filter((f) => f.categoria === cat))
    .map((f) => {
      const ses = f.sesionId ? evento.sesiones.findIndex((s) => s.id === f.sesionId) : -1;
      return `<div class="x-fin"><div class="x-fin-cab"><b>${esc(ETIQUETA_CATEGORIA_FINANCIERA_REPOSITORIO[f.categoria])}</b> ${esc(f.numero || "sin número")}<span>${esc(f.fecha ? formatearFecha(f.fecha) : "sin fecha")} · ${esc(f.valor != null ? formatearMonto(f.valor, f.moneda) : "sin valor")}${ses >= 0 ? ` · Sesión ${ses + 1}` : ""}</span></div>${htmlArchivo(archivos.get(f.archivoId), ETIQUETA_CATEGORIA_FINANCIERA_REPOSITORIO[f.categoria])}</div>`;
    })
    .join("");
  return resumen + detalle;
}

/** Entrega 22: sección financiera del evento — presupuesto solicitado, desglose por speaker/sesión y ejecución real. */
function htmlFinancieroEvento(f: FinancieroEvento): string {
  const m = (v: number | null, moneda = f.moneda) => formatearMonto(v, moneda === "—" ? "" : moneda);
  const der = (v: string) => `<td class="x-der">${esc(v)}</td>`;
  const condensado = f.condensado.filter((c) => c.valor !== 0);
  const partes: string[] = [];
  partes.push(`<div class="x-kpis x-kpis-3">
    <div class="x-kpi"><b>${esc(m(f.totalSolicitado))}</b><span>Total solicitado</span></div>
    <div class="x-kpi"><b>${esc(f.presupuestoAprobado.incluido && f.presupuestoAprobado.monto != null ? m(f.presupuestoAprobado.monto) : "—")}</b><span>Presupuesto aprobado</span></div>
    <div class="x-kpi"><b>${esc(f.moneda || "—")}</b><span>Moneda${f.centroCostos ? ` · CC: ${esc(f.centroCostos)}` : ""}</span></div>
  </div>`);
  partes.push(`<div class="x-card"><h3>Presupuesto solicitado (condensado)</h3>${
    condensado.length === 0
      ? `<p class="x-vacio">Sin costos declarados en la solicitud.</p>`
      : tabla(["Concepto", "Valor"], [...condensado.map((c) => [td(c.concepto), der(m(c.valor))]), [`<td><b>Total solicitado</b></td>`, `<td class="x-der"><b>${esc(m(f.totalSolicitado))}</b></td>`]])
  }</div>`);
  if (f.bloques.length > 0) {
    partes.push(`<div class="x-card"><h3>Detalle de costos solicitados</h3>${f.bloques
      .map((b) => {
        const filas = b.lineas.length === 0
          ? [[`<td colspan="3">Sin costos declarados.</td>`]]
          : [
              ...b.lineas.map((l) => [td(l.concepto), td(l.detalle), der(m(l.valor))]),
              [`<td colspan="2"><b>Subtotal — ${esc(b.titulo)}</b></td>`, `<td class="x-der"><b>${esc(m(b.subtotal))}</b></td>`],
            ];
        return `<h4 class="x-subtit">${esc(b.titulo)} <small>${esc(b.subtitulo)}</small></h4>${tabla(["Concepto", "Detalle", "Valor"], filas)}`;
      })
      .join("")}</div>`);
  }
  partes.push(`<div class="x-card"><h3>Ejecución real: orden de compra, facturas y comprobantes de pago</h3>${
    f.ejecucion.registros.length === 0
      ? `<p class="x-vacio">Todavía no se han cargado órdenes de compra, facturas ni comprobantes de pago en el Expediente.</p>`
      : tabla(
          ["Documento", "Número", "Fecha", "Speaker", "Sesión", "Valor"],
          f.ejecucion.registros.map((r) => [td(r.categoria), td(r.numero), td(r.fecha), td(r.speaker), td(r.sesion), der(m(r.valor, r.moneda))]),
        ) +
        f.ejecucion.total
          .map(
            (l) => `<div class="x-conc"><span>Moneda <b>${esc(l.moneda)}</b></span><span>Orden de compra <b>${esc(m(l.ordenCompra, l.moneda))}</b></span><span>Facturado <b>${esc(m(l.facturas, l.moneda))}</b></span><span>Pagado <b>${esc(m(l.comprobantes, l.moneda))}</b></span>${
              l.alertas.length ? `<ul class="x-alertas">${l.alertas.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : `<span class="x-ok">Cuadra</span>`
            }</div>`,
          )
          .join("")
  }</div>`);
  return partes.join("");
}

// --- Documento completo ---------------------------------------------------------

export interface EntradaExpedienteHtml {
  evento: Evento;
  resumen: ResumenEvento;
  datos: DatosExpedienteCargados;
  alcances: AlcanceAsistencia[];
  documentos: DocumentosDelEvento;
  /** `clave` del documento → HTML ya renderizado de su cuerpo imprimible. */
  htmlDocumentos: Map<string, string>;
  archivos: Map<string, ArchivoAdjunto>;
  fotosSpeakers: Map<string, string>;
  logoUrl: string | null;
  generadoPor: string;
  cssApp: string;
}

export function construirExpedienteHtml(e: EntradaExpedienteHtml): string {
  const { evento, resumen, datos, alcances, documentos, htmlDocumentos, archivos, fotosSpeakers } = e;
  const nav: { id: string; etiqueta: string; hijos?: { id: string; etiqueta: string }[] }[] = [];
  const secciones: string[] = [];
  const total = resumen.asistentes.total;
  const nombreEvento = evento.nombreEvento || "Evento";
  const generado = new Date();

  // 1. Resumen -------------------------------------------------------------
  nav.push({ id: "resumen", etiqueta: "Resumen del evento" });
  const kpi = (valor: string | number, etiqueta: string) => `<div class="x-kpi"><b>${esc(valor)}</b><span>${esc(etiqueta)}</span></div>`;
  secciones.push(`<section id="resumen" class="x-seccion">
  <h2><span class="x-num">1</span> Resumen del evento</h2>
  <div class="x-kpis">
    ${kpi(resumen.sedes.length, resumen.multisesion ? "Sesiones" : "Sesión")}
    ${kpi(resumen.speakers.length, "Speakers vinculados")}
    ${kpi(total.total, "Asistentes impactados")}
    ${kpi(resumen.muestras.entrega ? resumen.muestras.totalUnidades : "—", "Muestras entregadas (unidades)")}
  </div>
  <div class="x-grid2">
    <div class="x-card"><h3>Identificación</h3><dl class="x-dl">${resumen.identificacion.map((i) => `<dt>${esc(i.etiqueta)}</dt><dd>${esc(i.valor)}</dd>`).join("")}<dt>Fecha de inicio</dt><dd>${esc(resumen.fechas.inicio)}</dd><dt>Fecha de finalización</dt><dd>${esc(resumen.fechas.fin)}</dd></dl></div>
    <div class="x-card"><h3>Asistentes por tipo</h3>${tabla(
      ["Tipo", "Cantidad"],
      [...ETIQUETA_TIPO_ASISTENTE.map((t) => [td(t.etiqueta), td(total[t.clave])]), [`<td><b>Total</b></td>`, `<td><b>${total.total}</b></td>`]],
    )}<p class="x-nota">Fuente: ${esc(ETIQUETA_FUENTE_ASISTENTES[total.fuente])}${resumen.asistentes.esperados != null ? ` · Esperados en la solicitud: ${esc(resumen.asistentes.esperados)}` : ""}</p></div>
  </div>
  <div class="x-card"><h3>Lugares y fechas</h3>${tabla(
    ["", "Fecha", "Lugar / dirección", "Ciudad", "Departamento / Estado", "País"],
    resumen.sedes.map((s) => [td(s.etiqueta), td(s.fecha), td(s.lugar), td(s.ciudad), td(s.departamento), td(s.pais)]),
  )}</div>
  <div class="x-card"><h3>Speakers vinculados</h3>${
    resumen.speakers.length === 0
      ? `<p class="x-vacio">El evento no tiene speakers vinculados.</p>`
      : `<ul class="x-speakers">${resumen.speakers
          .map((s) => `<li>${avatar(s.nombre, s.speakerId ? fotosSpeakers.get(s.speakerId) : undefined, 40)}<span><b>${esc(s.nombre)}</b><small>${esc(s.tipo === "interno" ? "Speaker interno" : "Speaker externo")} · ${esc(s.sesiones)}</small></span></li>`)
          .join("")}</ul>`
  }</div>
  ${
    resumen.muestras.entrega
      ? `<div class="x-card"><h3>Muestras médicas entregadas</h3>${
          resumen.muestras.porProducto.length === 0
            ? `<p class="x-vacio">Todavía no hay entregas registradas.</p>`
            : tabla(["Muestra", "Unidades", "Entregas"], resumen.muestras.porProducto.map((p) => [td(p.nombre), td(p.unidades), td(p.entregas)]))
        }</div>`
      : ""
  }
</section>`);

  // 2. Solicitud del evento ---------------------------------------------------
  nav.push({ id: "solicitud", etiqueta: "Solicitud de evento" });
  secciones.push(`<section id="solicitud" class="x-seccion"><h2><span class="x-num">2</span> Solicitud de evento</h2>${htmlDocumento(documentos.evento, htmlDocumentos.get(documentos.evento.clave))}</section>`);

  // 3. Speakers ------------------------------------------------------------------
  const asignadoAGrupo = new Set(documentos.porSpeaker.map((b) => b.grupo.speakerId ?? null));
  const filasDe = (speakerId: string | null) => datos.archivos.filter((a) => (a.speakerId ?? null) === speakerId && a.categoria !== "fotos" && (a.archivoId || a.noAplica));
  const ordenCat = (a: RepositorioArchivoEvento) => ORDEN_CATEGORIAS.indexOf(a.categoria);
  let n = 3;
  // Entrega 22: los datos de cada speaker cuelgan de una categoría superior "Speakers" (el índice la muestra
  // como un grupo que se despliega y, en el contenido, abre con "Speakers" y luego cada speaker tal como antes).
  const navSpeakers: { id: string; etiqueta: string }[] = [];
  const seccionesSpeakers: string[] = [];
  const numSpeakers = n++;
  const internos = resumen.speakers.filter((sp) => sp.tipo === "interno");
  documentos.porSpeaker.forEach((b, i) => {
    const g = b.grupo;
    const id = `speaker-${i + 1}-${slug(g.nombre)}`;
    navSpeakers.push({ id, etiqueta: g.nombre });
    const convenio = g.sp ? convenioDelSpeaker(datos.conveniosResumen, g.sp, speakersExternosDe(evento).length) : datos.conveniosResumen[0] ?? null;
    const repo = filasDe(g.speakerId ?? null).sort((x, y) => ordenCat(x) - ordenCat(y));
    const fin = datos.financieros.filter((f) => (f.speakerId ?? null) === (g.speakerId ?? null));
    const resumenSpeaker = resumen.speakers.find((s) => s.nombre === g.nombre);
    seccionesSpeakers.push(`<section id="${id}" class="x-seccion x-speaker">
  <h2><span class="x-num">${numSpeakers}.${i + 1}</span> Speaker: ${esc(g.nombre)}</h2>
  <div class="x-speaker-cab">${avatar(g.nombre, g.speakerId ? fotosSpeakers.get(g.speakerId) : undefined, 72)}<div><b>${esc(g.nombre)}</b><small>${esc(resumenSpeaker?.sesiones ?? "")}</small></div></div>
  <h3 class="x-sub">Documentos generados en BEATS</h3>
  ${b.docs.length === 0 ? `<p class="x-vacio">Todavía no se han creado documentos para este speaker.</p>` : b.docs.map((d) => htmlDocumento(d, htmlDocumentos.get(d.clave))).join("")}
  <h3 class="x-sub">Soportes del Expediente</h3>
  ${
    (convenio?.archivoFirmadoHCPId ? bloque("Convenio HCP — versión firmada por el HCP", htmlArchivo(archivos.get(convenio.archivoFirmadoHCPId), "Convenio HCP firmado")) : "") +
    (repo.length === 0 && !convenio?.archivoFirmadoHCPId ? `<p class="x-vacio">Sin soportes cargados.</p>` : repo.map((f) => htmlFilaRepositorio(f, archivos, evento)).join(""))
  }
  <h3 class="x-sub">Financiero</h3>
  ${htmlFinanciero(fin, archivos, evento)}
</section>`);
  });
  if (internos.length > 0) {
    navSpeakers.push({ id: "speakers-internos", etiqueta: "Speakers internos" });
    seccionesSpeakers.push(`<section id="speakers-internos" class="x-seccion x-speaker">
  <h2><span class="x-num">${numSpeakers}.${documentos.porSpeaker.length + 1}</span> Speakers internos</h2>
  <p class="x-nota">Empleados que dictan la actividad. No generan FMV, convenio, CAF ni facturación.</p>
  <ul class="x-speakers">${internos.map((sp) => `<li>${avatar(sp.nombre, undefined, 40)}<span><b>${esc(sp.nombre)}</b><small>${esc(sp.sesiones)}</small></span></li>`).join("")}</ul>
</section>`);
  }
  if (seccionesSpeakers.length > 0) {
    nav.push({ id: "speakers", etiqueta: "Speakers", hijos: navSpeakers });
    secciones.push(`<section id="speakers" class="x-grupo">
  <div class="x-seccion x-grupo-cab"><h2><span class="x-num">${numSpeakers}</span> Speakers</h2><p class="x-nota">${documentos.porSpeaker.length} speaker(s) externo(s)${internos.length ? ` · ${internos.length} speaker(s) interno(s)` : ""}. Cada uno con sus documentos, soportes y financiero.</p></div>
  ${seccionesSpeakers.join("\n  ")}
</section>`);
  }

  // Soportes sin speaker (o de evento sin speaker externo) -------------------
  const sueltos = filasDe(null).sort((x, y) => ordenCat(x) - ordenCat(y)).filter(() => !asignadoAGrupo.has(null));
  const finSueltos = datos.financieros.filter((f) => !asignadoAGrupo.has(f.speakerId ?? null));
  if (sueltos.length > 0 || finSueltos.length > 0) {
    nav.push({ id: "otros-docs", etiqueta: "Otros documentos del evento" });
    secciones.push(`<section id="otros-docs" class="x-seccion"><h2><span class="x-num">${n++}</span> Otros documentos del evento</h2>
  ${sueltos.map((f) => htmlFilaRepositorio(f, archivos, evento)).join("")}
  ${finSueltos.length ? `<h3 class="x-sub">Financiero sin speaker asignado</h3>${htmlFinanciero(finSueltos, archivos, evento)}` : ""}
</section>`);
  }

  // Notificaciones de pago ---------------------------------------------------------
  if (documentos.pagos.length > 0) {
    nav.push({ id: "pagos", etiqueta: "Notificaciones de pago" });
    secciones.push(`<section id="pagos" class="x-seccion"><h2><span class="x-num">${n++}</span> Notificaciones de pago a HCPs</h2>${documentos.pagos.map((d) => htmlDocumento(d, htmlDocumentos.get(d.clave))).join("")}</section>`);
  }

  // Financiero (entrega 22) ---------------------------------------------------------------
  nav.push({ id: "financiero", etiqueta: "Financiero" });
  secciones.push(`<section id="financiero" class="x-seccion"><h2><span class="x-num">${n++}</span> Financiero — costos asociados al evento</h2>${htmlFinancieroEvento(resumen.financiero)}</section>`);

  // Asistencia ---------------------------------------------------------------------
  nav.push({ id: "asistencia", etiqueta: "Lista de asistencia" });
  const declaraciones = Array.from(new Set(alcances.flatMap((a) => a.registros).map((r) => (r.declaracionTextoMostrado ?? "").trim()).filter(Boolean)));
  secciones.push(`<section id="asistencia" class="x-seccion"><h2><span class="x-num">${n++}</span> Lista de asistencia</h2>
  ${alcances
    .map((a) => {
      const filas = a.registros.map((r) => [
        td(`${r.nombres ?? ""} ${r.apellidos ?? ""}`.trim()),
        td(r.cedula),
        td(r.celular),
        td(r.email),
        td(r.autorizaImagenVoz ? "Sí" : "No"),
        td(r.autorizaDatosPersonales ? "Sí" : "No"),
        tdHtml(r.firmaId && archivos.get(r.firmaId)?.dataUrl ? `<img class="x-firma" src="${esc(archivos.get(r.firmaId)!.dataUrl)}" alt="Firma">` : "—"),
      ]);
      const d = a.distribucion;
      return `<div class="x-card"><h3>${esc(a.etiqueta)} <small>${d.total} asistente(s) · ${esc(ETIQUETA_FUENTE_ASISTENTES[d.fuente])}</small></h3>
      <p class="x-nota">${ETIQUETA_TIPO_ASISTENTE.map((t) => `${esc(t.etiqueta)}: <b>${d[t.clave]}</b>`).join(" · ")}</p>
      ${filas.length ? tabla(["Nombres y apellidos", "Número de documento", "Celular", "Correo electrónico", "Imagen y voz", "Datos personales", "Firma"], filas) : `<p class="x-vacio">Sin registros de check-in en este alcance.</p>`}
      ${a.listasExternas.map((f) => htmlFilaRepositorio(f, archivos, evento)).join("")}</div>`;
    })
    .join("")}
  ${declaraciones.length ? `<div class="x-card x-declaracion"><h3>Declaración de tratamiento de datos personales y uso de imagen y voz (vigente al firmar)</h3>${declaraciones.map((t) => `<p>${esc(t)}</p>`).join("")}</div>` : ""}
</section>`);

  // Muestras --------------------------------------------------------------------------
  if (evento.entregaMuestrasMedicas) {
    nav.push({ id: "muestras", etiqueta: "Muestras médicas" });
    const filas = filasMuestrasPorEntrega(datos.muestras, datos.registros).map((f) => [
      td(f.registro ? `${f.registro.nombres ?? ""} ${f.registro.apellidos ?? ""}`.trim() : ""),
      td(f.registro?.cedula),
      td(datos.nombresProductos[f.productoId] || "Producto"),
      td(f.cantidad),
      tdHtml(f.firmaId && archivos.get(f.firmaId)?.dataUrl ? `<img class="x-firma" src="${esc(archivos.get(f.firmaId)!.dataUrl)}" alt="Firma">` : "—"),
    ]);
    secciones.push(`<section id="muestras" class="x-seccion"><h2><span class="x-num">${n++}</span> Muestras médicas entregadas</h2><div class="x-card">${
      filas.length ? tabla(["Nombres y apellidos", "Número de documento", "Muestra recibida", "Cantidad", "Firma"], filas) : `<p class="x-vacio">Todavía no hay entregas registradas.</p>`
    }</div></section>`);
  }

  // Fotos ---------------------------------------------------------------------------------
  nav.push({ id: "fotos", etiqueta: "Fotos" });
  const marcoTitulo = (clave: string | null) => MARCOS_FOTO.find((m) => m.clave === clave)?.titulo ?? "Foto";
  const galeria = (fotos: RepositorioArchivoEvento[]) =>
    fotos.length === 0
      ? `<p class="x-vacio">Sin fotos cargadas.</p>`
      : `<div class="x-galeria">${fotos.map((f) => `<figure>${htmlArchivo(f.archivoId ? archivos.get(f.archivoId) : undefined, marcoTitulo(f.etiqueta))}<figcaption>${esc(marcoTitulo(f.etiqueta))}${f.origen === "ejecucion" ? " · tomada en sitio" : ""}</figcaption></figure>`).join("")}</div>`;
  const sinSesion = fotosSinSesion(evento, datos.archivos);
  secciones.push(`<section id="fotos" class="x-seccion"><h2><span class="x-num">${n++}</span> Fotos del evento</h2>
  ${alcancesFotos(evento).map((a) => `<div class="x-card"><h3>${esc(a.etiqueta)}</h3>${galeria(fotosDelAlcance(datos.archivos, a.sesionId))}</div>`).join("")}
  ${sinSesion.length ? `<div class="x-card"><h3>Fotos sin sesión asignada</h3>${galeria(sinSesion)}</div>` : ""}
</section>`);

  // Armado -------------------------------------------------------------------------------------
  const logo = e.logoUrl ? `<img class="x-logo" src="${esc(e.logoUrl)}" alt="Logo">` : `<span class="x-logo-txt">BEATS</span>`;
  const ciudades = ciudadesPaisTexto(resumen);
  return `<!doctype html>
<html lang="es" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>Expediente — ${esc(nombreEvento)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${e.cssApp}</style>
<style>${CSS_EXPEDIENTE}</style>
</head>
<body class="x-body">
<header class="x-hero">
  <div class="x-hero-in">
    <div class="x-marca">${logo}<span>BEATS · Expediente del evento</span></div>
    <h1>${esc(nombreEvento)}</h1>
    <div class="x-hero-meta">${chipEstado(evento.estado)}<span>${esc(resumen.fechas.inicio)}${resumen.fechas.fin !== resumen.fechas.inicio ? ` → ${esc(resumen.fechas.fin)}` : ""}</span><span>${esc(ciudades)}</span><span>${esc(evento.empresaGrupo)}</span></div>
  </div>
</header>
<div class="x-layout">
  <nav class="x-nav" aria-label="Índice del expediente"><b>Contenido</b>${nav
    .map((i) =>
      i.hijos && i.hijos.length > 0
        ? `<div class="x-nav-grupo"><a href="#${esc(i.id)}" class="x-nav-padre" data-grupo="${esc(i.id)}" aria-expanded="false">${esc(i.etiqueta)}<span class="x-caret">▸</span></a><div class="x-nav-hijos" hidden>${i.hijos.map((h) => `<a href="#${esc(h.id)}" class="x-nav-hijo">${esc(h.etiqueta)}</a>`).join("")}</div></div>`
        : `<a href="#${esc(i.id)}">${esc(i.etiqueta)}</a>`,
    )
    .join("")}<button type="button" class="x-btn x-imprimir" onclick="window.print()">Imprimir / PDF</button></nav>
  <main class="x-main">${secciones.join("\n")}
    <footer class="x-footer">Generado por BEATS el ${esc(formatearFechaHora(generado))}${e.generadoPor ? ` · ${esc(e.generadoPor)}` : ""}. Documento de solo lectura: refleja el estado del Expediente en ese momento.</footer>
  </main>
</div>
<script>${JS_EXPEDIENTE}</script>
</body>
</html>`;
}

// --- Estilos propios del archivo (identidad BEATS: azul #00a3e0, gris #494c4f, Roboto) ----

const CSS_EXPEDIENTE = `
:root{color-scheme:light}
.x-body{margin:0;background:#f4f7fa;color:#334155;font-family:var(--font-body,"Roboto","Lato",system-ui,sans-serif);font-size:14px;line-height:1.5}
.x-body *{box-sizing:border-box}
.x-hero{background:linear-gradient(135deg,#00a3e0,#0091c8);color:#fff;padding:28px 24px 26px}
.x-hero-in{max-width:1240px;margin:0 auto}
.x-marca{display:flex;align-items:center;gap:12px;font-size:12px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;opacity:.95}
.x-logo{height:34px;max-width:160px;object-fit:contain;background:#fff;border-radius:8px;padding:4px 8px}
.x-logo-txt{background:#fff;color:#00a3e0;font-weight:900;border-radius:8px;padding:4px 10px;letter-spacing:.08em}
.x-hero h1{color:#fff!important;font-size:30px;line-height:1.2;margin:14px 0 10px;font-weight:700}
.x-hero-meta{display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center;font-size:14px}
.x-layout{display:flex;gap:24px;max-width:1240px;margin:0 auto;padding:24px}
.x-nav{position:sticky;top:16px;align-self:flex-start;width:220px;flex:none;background:#fff;border:1px solid #e9ebed;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:2px;max-height:calc(100vh - 32px);overflow:auto}
.x-nav>b{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#64748b;margin-bottom:6px}
.x-nav a{color:#494c4f;text-decoration:none;padding:6px 10px;border-radius:8px;font-size:13px}
.x-nav a:hover,.x-nav a.activo{background:#00a1e414;color:#00a3e0}
.x-imprimir{margin-top:10px;width:100%}
.x-nav-padre{display:flex!important;justify-content:space-between;align-items:center;font-weight:500}
.x-caret{transition:transform .15s;color:#00a3e0}
.x-nav-padre[aria-expanded=true] .x-caret{transform:rotate(90deg)}
.x-nav-hijos{display:flex;flex-direction:column;gap:2px;margin:2px 0 4px 12px;border-left:2px solid #e0f2fe;padding-left:6px}
.x-nav-hijos[hidden]{display:none}
.x-nav-hijo{font-size:12.5px!important}
.x-grupo{display:flex;flex-direction:column;gap:18px;scroll-margin-top:16px}
.x-grupo-cab{padding-bottom:14px}
.x-grupo-cab>h2{margin-bottom:6px}
.x-subtit{margin:14px 0 6px;font-size:13px;color:#334155!important}
.x-subtit small{color:#64748b;font-weight:400;margin-left:6px}
.x-der{text-align:right;white-space:nowrap}
.x-kpis-3{grid-template-columns:repeat(3,1fr)}
.x-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:22px}
.x-seccion{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:22px 24px;scroll-margin-top:16px}
.x-seccion>h2{font-size:19px;margin:0 0 16px;display:flex;align-items:center;gap:10px;color:#0f172a}
.x-num{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;background:#00a3e0;color:#fff;font-size:13px;font-weight:700}
.x-sub{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:#00a3e0!important;margin:22px 0 10px;border-bottom:1px solid #e0f2fe;padding-bottom:6px}
.x-card{border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:14px;background:#fff}
.x-card h3{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#00a3e0!important;margin:0 0 10px}
.x-card h3 small{text-transform:none;letter-spacing:0;color:#64748b;font-weight:400;margin-left:8px}
.x-grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.x-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}
.x-kpi{background:#e3f5fd;border:1px solid #bbe6f8;border-radius:12px;padding:14px 16px;display:flex;flex-direction:column}
.x-kpi b{font-size:28px;line-height:1.1;color:#007fb3}
.x-kpi span{font-size:12px;color:#494c4f}
.x-dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;margin:0}
.x-dl dt{color:#64748b;font-size:12px}
.x-dl dd{margin:0;font-weight:500;color:#0f172a}
.x-tabla-wrap{overflow-x:auto}
.x-tabla{width:100%;border-collapse:collapse;font-size:12.5px}
.x-tabla th{background:#f1f5f9;text-align:left;padding:7px 9px;border:1px solid #e2e8f0;font-weight:700;color:#334155}
.x-tabla td{padding:6px 9px;border:1px solid #e2e8f0;vertical-align:middle}
.x-tabla tr{break-inside:avoid}
.x-firma{height:34px;max-width:110px;object-fit:contain}
.x-chip{display:inline-block;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:500;border:1px solid}
.x-chip-draft{background:#f2f3f4;color:#494c4f;border-color:#e1e3e5}
.x-chip-pending{background:#fff6d9;color:#8a6d1d;border-color:#f3e1a3}
.x-chip-approved{background:#e3f5fd;color:#007fb3;border-color:#bbe6f8}
.x-chip-completed{background:#e6f6ec;color:#1b7a43;border-color:#bfe8cc}
.x-chip-rejected{background:#fef3f2;color:#b42318;border-color:#fecdca}
.x-chip-cancelled{background:#eceae9;color:#57534e;border-color:#d6d3d1}
.x-hero .x-chip{background:rgba(255,255,255,.95)}
.x-avatar{border-radius:50%;object-fit:cover;flex:none;border:2px solid #fff;box-shadow:0 0 0 1px #bbe6f8}
.x-avatar-ini{display:inline-grid;place-items:center;background:#e0f2fe;color:#0284c7;font-weight:700}
.x-speakers{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.x-speakers li{display:flex;gap:12px;align-items:center}
.x-speakers small,.x-speaker-cab small{display:block;color:#64748b}
.x-speaker-cab{display:flex;align-items:center;gap:16px;background:#e0f2fe66;border-radius:12px;padding:12px 16px;margin-bottom:6px;font-size:16px}
.x-doc{border:1px solid #e2e8f0;border-radius:12px;margin-bottom:14px;overflow:hidden}
.x-doc>summary{cursor:pointer;display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;padding:12px 16px;background:#f8fafc;list-style:none}
.x-doc>summary::-webkit-details-marker{display:none}
.x-doc>summary::before{content:"▸";color:#00a3e0;transition:transform .15s}
.x-doc[open]>summary::before{transform:rotate(90deg)}
.x-doc-tipo{font-size:11px;text-transform:uppercase;letter-spacing:.1em;font-weight:700;color:#00a3e0}
.x-doc-titulo{font-weight:500;color:#0f172a;flex:1;min-width:200px}
.x-doc-fecha{font-size:12px;color:#64748b}
.x-hoja{background:#fff;color:#000;padding:28px 36px;font-size:14px;max-width:900px;margin:0 auto}
.x-bloque{border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-bottom:12px}
.x-bloque h4{margin:0 0 8px;font-size:13px;color:#334155!important}
.x-archivo img{max-width:100%;max-height:520px;border-radius:8px;border:1px solid #e2e8f0;cursor:zoom-in}
.x-archivo figcaption,.x-pie-archivo{font-size:12px;color:#64748b;margin:6px 0 0}
.x-pdf{width:100%;height:560px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc}
.x-archivo-generico{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.x-btn{display:inline-block;background:linear-gradient(135deg,#00a3e0,#0091c8);color:#fff!important;text-decoration:none;border:0;border-radius:8px;padding:6px 12px;font-size:12.5px;font-weight:500;cursor:pointer;font-family:inherit}
.x-vacio{color:#94a3b8;font-style:italic;margin:4px 0}
.x-noaplica{margin:0;color:#57534e}
.x-nota{font-size:12.5px;color:#64748b;margin:8px 0}
.x-conc{display:flex;flex-wrap:wrap;gap:6px 22px;font-size:13px;background:#f8fafc;border-radius:10px;padding:10px 14px;margin-bottom:10px}
.x-ok{color:#1b7a43;font-weight:500}
.x-alertas{margin:0;padding-left:18px;color:#b42318;flex-basis:100%}
.x-fin{border-top:1px dashed #e2e8f0;padding-top:10px;margin-top:10px}
.x-fin-cab{display:flex;flex-wrap:wrap;gap:4px 14px;margin-bottom:6px}
.x-fin-cab span{color:#64748b}
.x-galeria{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.x-galeria figure{margin:0}
.x-galeria figure>figcaption{font-weight:500;margin-top:4px}
.x-declaracion p{font-size:11.5px;text-align:justify;white-space:pre-line;color:#475569}
.x-footer{text-align:center;color:#94a3b8;font-size:12px;padding:6px 0 24px}
@media (max-width:900px){.x-layout{flex-direction:column;padding:14px}.x-nav{position:static;width:auto;flex-direction:row;flex-wrap:wrap;max-height:none}.x-grid2,.x-kpis{grid-template-columns:1fr 1fr}.x-hoja{padding:16px}}
@media print{
  @page{size:letter;margin:.5in}
  .x-body{background:#fff}
  .x-nav,.x-imprimir{display:none!important}
  .x-layout{display:block;padding:0;max-width:none}
  .x-hero{-webkit-print-color-adjust:exact;print-color-adjust:exact;padding:16px}
  .x-seccion{break-before:page;border:0;padding:0}
  .x-grupo-cab{break-before:page}
  .x-grupo .x-seccion{break-before:page}
  #resumen{break-before:auto}
  .x-doc>summary::before{display:none}
  .x-doc{border:0}
  .x-pdf{display:none}
  .x-pdf+.x-pie-archivo::before{content:"PDF adjunto (se consulta en el archivo HTML). ";color:#64748b}
  .x-card,.x-bloque,.x-doc{break-inside:auto}
}
`;

// Convierte los data-URI en Blob URLs (visor de PDF, descargas, ampliar imagen) y marca el índice activo.
const JS_EXPEDIENTE = `
(function(){
  function aBlob(uri){
    var m=/^data:([^;,]*)((?:;[^;,]*)*?),(.*)$/.exec(uri); if(!m) return null;
    var mime=m[1]||'application/octet-stream', b64=/;base64/.test(m[2]), datos=m[3], bytes;
    if(b64){var bin=atob(datos);bytes=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);}
    else{bytes=new TextEncoder().encode(decodeURIComponent(datos));}
    return new Blob([bytes],{type:mime});
  }
  var cache={};
  function url(uri){ if(!cache[uri]){var b=aBlob(uri); cache[uri]=b?URL.createObjectURL(b):uri;} return cache[uri]; }
  document.querySelectorAll('iframe[data-uri]').forEach(function(f){ f.src=url(f.getAttribute('data-uri')); });
  document.querySelectorAll('a[data-uri]').forEach(function(a){
    a.href=url(a.getAttribute('data-uri')); a.setAttribute('download',a.getAttribute('data-nombre')||'archivo'); });
  document.querySelectorAll('img.x-zoom').forEach(function(img){
    img.addEventListener('click',function(){ window.open(url(img.src),'_blank'); }); });
  function alternarGrupo(padre,abrir){
    var hijos=padre.parentNode.querySelector('.x-nav-hijos'); if(!hijos) return;
    var ab=typeof abrir==='boolean'?abrir:hijos.hasAttribute('hidden');
    if(ab){hijos.removeAttribute('hidden');}else{hijos.setAttribute('hidden','');}
    padre.setAttribute('aria-expanded',ab?'true':'false');
  }
  document.querySelectorAll('.x-nav-padre').forEach(function(p){
    p.addEventListener('click',function(){ alternarGrupo(p); });
  });
  var enlaces=[].slice.call(document.querySelectorAll('.x-nav a'));
  if('IntersectionObserver' in window){
    var io=new IntersectionObserver(function(es){es.forEach(function(e){ if(e.isIntersecting){ enlaces.forEach(function(a){ a.classList.toggle('activo',a.getAttribute('href')==='#'+e.target.id); });
        var h=document.querySelector('.x-nav-hijo[href="#'+e.target.id+'"]'); if(h){ var pad=h.parentNode.parentNode.querySelector('.x-nav-padre'); if(pad && pad.getAttribute('aria-expanded')!=='true') alternarGrupo(pad,true); } } });},{rootMargin:'-20% 0px -70% 0px'});
    document.querySelectorAll('.x-seccion').forEach(function(s){io.observe(s);});
  }
})();
`;
