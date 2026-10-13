import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";

/**
 * Entrega 28 — generación de PDF en el navegador.
 *
 * Hasta ahora BEATS solo «imprimía» (`window.print()`), así que no había forma de tener el PDF de un documento sin
 * que una persona lo exportara a mano. Para adjuntar el PDF del Convenio HCP al correo (y poder elegir qué documentos
 * del paquete se envían en PDF) se necesita producirlo por código. Esta función toma la MISMA hoja que se ve en
 * «Ver / Imprimir / Exportar a PDF» (renderizada fuera de pantalla, ver `components/print/GeneradorPdfDocumentos.tsx`),
 * la parte en páginas Carta y arma el PDF.
 *
 * Cómo se paginan: el navegador paginaría solo al imprimir, pero aquí no hay impresión, así que se reproduce a mano:
 *  - cada anexo del Convenio HCP arranca en hoja propia (`break-before: page`), igual que en la impresión;
 *  - nunca se corta una fila, un párrafo corto, una tabla-fila ni una zona de firma (`break-inside: avoid`);
 *  - un título (h1–h6) no queda solo al final de una hoja;
 *  - un bloque más alto que una hoja (p. ej. un texto de anexo muy largo) se parte entre líneas, nunca por la mitad de una.
 * El membrete (`[data-pdf-membrete]`) se repite en cada hoja, como el `<thead>` que se repite al imprimir. La marca de
 * agua por estado se dibuja como texto vectorial semitransparente.
 *
 * Limitación conocida: cada hoja se incrusta como imagen (JPEG de 192 dpi), así que el texto del PDF no es seleccionable
 * ni buscable. Es lo que permite que el PDF sea idéntico a la vista previa para los 6 tipos de documento sin mantener
 * una segunda maqueta por cada uno.
 */

/** Hoja Carta con márgenes de 0,5 in: 7,5 in × 10 in de área útil = 720 × 960 px CSS (96 dpi). */
export const ANCHO_PAGINA_PX = 720;
export const ALTO_PAGINA_PX = 960;
const MARGEN_PT = 36; // 0,5 in
const PX_A_PT = 0.75;
const SEPARACION_MEMBRETE_PX = 16;
/** Una hoja nunca avanza menos que esto (evita bucles cuando un bloque no tiene ningún corte válido). */
const AVANCE_MINIMO_PX = 48;

export interface MarcaDeAguaPdf {
  texto: string;
  /** `rgba(r, g, b, a)` tal como lo usa la vista en pantalla (`MARCA_AGUA_POR_ESTADO`). */
  color: string;
  /** Tamaño de la vista en pantalla (px); se escala igual que allí (×1,8). */
  tamano: number;
}

export interface OpcionesPdf {
  /** Píxeles por píxel CSS al rasterizar. 2 = 192 dpi. */
  escala?: number;
  calidadJpeg?: number;
  marcaDeAgua?: MarcaDeAguaPdf | null;
  titulo?: string;
}

interface Caja {
  top: number;
  bottom: number;
  esTitulo: boolean;
}

const ETIQUETAS_ATOMICAS = new Set(["TR", "IMG", "SVG", "CANVAS", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "FOOTER", "HR"]);
const ETIQUETAS_TITULO = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);

function esSaltoForzado(cs: CSSStyleDeclaration): boolean {
  const antes = cs.breakBefore || (cs as unknown as { pageBreakBefore?: string }).pageBreakBefore || "";
  return antes === "page" || antes === "always" || antes === "left" || antes === "right";
}

/** ¿El elemento no contiene ningún hijo de bloque? (solo texto e inline) — entonces es un «átomo» de maquetación. */
function esHojaDeBloques(el: HTMLElement): boolean {
  for (const hijo of Array.from(el.children)) {
    const d = getComputedStyle(hijo).display;
    if (d !== "inline" && d !== "none" && d !== "contents" && !d.startsWith("inline-")) return false;
  }
  return true;
}

/** Rectángulos de las líneas de un bloque (para poder partir un bloque más alto que una hoja entre línea y línea). */
function rectsDeLineas(el: HTMLElement, base: number): Caja[] {
  const rango = document.createRange();
  rango.selectNodeContents(el);
  const cajas: Caja[] = [];
  for (const r of Array.from(rango.getClientRects())) {
    if (r.height < 1) continue;
    cajas.push({ top: r.top - base, bottom: r.bottom - base, esTitulo: false });
  }
  return cajas;
}

export interface MapaPaginacion {
  cajas: Caja[];
  forzados: number[];
  alto: number;
}

/** Recorre el cuerpo y devuelve los bloques que no se deben partir y las posiciones donde se fuerza hoja nueva. */
export function medirCuerpo(cuerpo: HTMLElement, altoHojaPx: number): MapaPaginacion {
  const base = cuerpo.getBoundingClientRect().top;
  const cajas: Caja[] = [];
  const forzados: number[] = [];

  const visitar = (padre: HTMLElement) => {
    for (const hijo of Array.from(padre.children) as HTMLElement[]) {
      const cs = getComputedStyle(hijo);
      if (cs.display === "none" || cs.position === "fixed") continue;
      const r = hijo.getBoundingClientRect();
      if (r.height < 0.5) continue;
      const top = r.top - base;
      const bottom = r.bottom - base;
      if (esSaltoForzado(cs) && top > 1) forzados.push(top);

      const evitarCorte = cs.breakInside === "avoid" || (cs as unknown as { pageBreakInside?: string }).pageBreakInside === "avoid";
      const atomico = evitarCorte || ETIQUETAS_ATOMICAS.has(hijo.tagName.toUpperCase()) || esHojaDeBloques(hijo);
      if (!atomico) {
        visitar(hijo);
        continue;
      }
      if (bottom - top > altoHojaPx) {
        // Bloque más alto que una hoja: se parte entre líneas. Si no se logra medir ninguna línea, queda como bloque.
        const lineas = rectsDeLineas(hijo, base);
        if (lineas.length > 0) {
          cajas.push(...lineas);
          continue;
        }
      }
      cajas.push({ top, bottom, esTitulo: ETIQUETAS_TITULO.has(hijo.tagName.toUpperCase()) || hijo.hasAttribute("data-pdf-titulo") });
    }
  };
  visitar(cuerpo);
  cajas.sort((a, b) => a.top - b.top);
  forzados.sort((a, b) => a - b);
  return { cajas, forzados, alto: cuerpo.getBoundingClientRect().height };
}

export interface RangoHoja {
  inicio: number;
  fin: number;
}

/** Reparte el cuerpo en hojas de a lo sumo `altoHojaPx`. Función pura sobre el mapa medido (se prueba sin DOM). */
export function calcularHojas(mapa: MapaPaginacion, altoHojaPx: number): RangoHoja[] {
  const { cajas, forzados, alto } = mapa;
  const hojas: RangoHoja[] = [];
  let inicio = 0;
  let guardia = 0;
  while (inicio < alto - 1 && guardia++ < 500) {
    const limite = inicio + altoHojaPx;
    let fin: number;
    if (alto <= limite + 0.5) {
      fin = alto;
    } else {
      const forzado = forzados.find((f) => f > inicio + 1 && f <= limite + 0.5);
      if (forzado !== undefined) {
        fin = forzado;
      } else {
        // Cortes válidos: los bordes de bloque que ningún bloque atraviesa.
        const candidatos = new Set<number>();
        for (const c of cajas) {
          if (c.bottom <= limite + 0.5 && c.bottom > inicio + AVANCE_MINIMO_PX) candidatos.add(c.bottom);
          if (c.top <= limite + 0.5 && c.top > inicio + AVANCE_MINIMO_PX) candidatos.add(c.top);
        }
        const validos = Array.from(candidatos)
          .filter((c) => !cajas.some((b) => b.top < c - 0.5 && b.bottom > c + 0.5))
          .sort((a, b) => b - a);
        fin = validos.length > 0 ? validos[0] : limite;
        // Un título no queda huérfano al final de la hoja.
        const ultimo = cajas.filter((b) => Math.abs(b.bottom - fin) < 1.5).pop();
        if (ultimo?.esTitulo && ultimo.top > inicio + AVANCE_MINIMO_PX) fin = ultimo.top;
      }
    }
    hojas.push({ inicio, fin });
    // La hoja siguiente arranca en el primer bloque que sigue (se descarta el espacio en blanco entre bloques).
    const siguiente = cajas.find((c) => c.top >= fin - 0.5);
    inicio = siguiente && siguiente.top - fin < 40 ? siguiente.top : fin;
  }
  return hojas.length > 0 ? hojas : [{ inicio: 0, fin: Math.max(alto, 1) }];
}

function esperarImagen(img: HTMLImageElement): Promise<void> {
  if (img.complete && img.naturalWidth > 0) return Promise.resolve();
  return new Promise((resolver) => {
    const fin = () => resolver();
    img.addEventListener("load", fin, { once: true });
    img.addEventListener("error", fin, { once: true });
    setTimeout(fin, 8000);
  });
}

/** Espera a que todas las imágenes de la hoja (logo, firmas manuscritas) terminen de cargar. */
export async function esperarImagenes(raiz: HTMLElement): Promise<void> {
  await Promise.all(Array.from(raiz.querySelectorAll("img")).map(esperarImagen));
}

function parsearColorRgba(color: string): { r: number; g: number; b: number; a: number } {
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return { r: 100, g: 116, b: 139, a: 0.22 };
  const [r, g, b, a] = m[1].split(",").map((x) => parseFloat(x.trim()));
  return { r, g, b, a: Number.isFinite(a) ? a : 1 };
}

function dibujarMarcaDeAgua(pdf: jsPDF, marca: MarcaDeAguaPdf, anchoPt: number, altoPt: number) {
  const { r, g, b, a } = parsearColorRgba(marca.color);
  const GState = (pdf as unknown as { GState: new (o: { opacity: number }) => unknown }).GState;
  pdf.saveGraphicsState();
  pdf.setGState(new GState({ opacity: a }) as never);
  pdf.setTextColor(r, g, b);
  pdf.setFont("helvetica", "bold");
  // Mismo tamaño relativo que la vista en pantalla (fontSize × 1,8 px), a 72 pt por pulgada.
  pdf.setFontSize(marca.tamano * 1.8 * PX_A_PT);
  pdf.text(marca.texto, anchoPt / 2, altoPt / 2, { align: "center", angle: 32, baseline: "middle" });
  pdf.restoreGraphicsState();
}

async function capturar(
  hoja: HTMLElement,
  objetivo: HTMLElement,
  region: { x: number; y: number; ancho: number; alto: number },
  escala: number,
): Promise<HTMLCanvasElement> {
  return html2canvas(objetivo, {
    scale: escala,
    backgroundColor: "#ffffff",
    logging: false,
    useCORS: true,
    x: region.x,
    y: region.y,
    width: region.ancho,
    height: region.alto,
    scrollX: 0,
    scrollY: 0,
    windowWidth: ANCHO_PAGINA_PX + 40,
    windowHeight: Math.max(ALTO_PAGINA_PX, Math.ceil(hoja.getBoundingClientRect().height) + 40),
    onclone: (documento) => {
      // El anfitrión está oculto (`visibility: hidden`) para que el usuario nunca lo vea; en la copia que se
      // fotografía sí debe verse.
      documento.querySelectorAll<HTMLElement>("[data-pdf-anfitrion]").forEach((el) => {
        el.style.visibility = "visible";
      });
    },
  });
}

/**
 * Convierte una hoja ya renderizada (`[data-pdf-hoja]` con un `[data-pdf-cuerpo]` y, opcionalmente, un
 * `[data-pdf-membrete]`) en un PDF Carta.
 */
export async function hojaAPdf(hoja: HTMLElement, opciones: OpcionesPdf = {}): Promise<Blob> {
  const escala = opciones.escala ?? 2;
  const calidad = opciones.calidadJpeg ?? 0.92;
  await esperarImagenes(hoja);

  const cuerpo = hoja.querySelector<HTMLElement>("[data-pdf-cuerpo]");
  if (!cuerpo) throw new Error("La hoja no tiene cuerpo para exportar.");
  const membrete = hoja.querySelector<HTMLElement>("[data-pdf-membrete]");

  const hojaRect = hoja.getBoundingClientRect();
  const altoMembrete = membrete ? Math.ceil(membrete.getBoundingClientRect().height) : 0;
  const reservaMembrete = membrete ? altoMembrete + SEPARACION_MEMBRETE_PX : 0;
  const altoCuerpoPorHoja = ALTO_PAGINA_PX - reservaMembrete;

  const mapa = medirCuerpo(cuerpo, altoCuerpoPorHoja);
  const hojas = calcularHojas(mapa, altoCuerpoPorHoja);
  const cuerpoRect = cuerpo.getBoundingClientRect();

  const pdf = new jsPDF({ unit: "pt", format: "letter", compress: true, orientation: "portrait" });
  if (opciones.titulo) pdf.setProperties({ title: opciones.titulo, creator: "BEATS" });
  const anchoPt = 612;
  const altoPt = 792;

  let imagenMembrete: string | null = null;
  if (membrete) {
    const r = membrete.getBoundingClientRect();
    const lienzo = await capturar(hoja, hoja, { x: r.left, y: r.top, ancho: Math.ceil(r.width), alto: altoMembrete }, escala);
    imagenMembrete = lienzo.toDataURL("image/jpeg", calidad);
  }

  for (let i = 0; i < hojas.length; i++) {
    if (i > 0) pdf.addPage("letter", "portrait");
    const { inicio, fin } = hojas[i];
    const alto = Math.max(1, Math.ceil(fin - inicio));
    const lienzo = await capturar(
      hoja,
      hoja,
      { x: cuerpoRect.left, y: cuerpoRect.top + inicio, ancho: ANCHO_PAGINA_PX, alto },
      escala,
    );
    let yPt = MARGEN_PT;
    if (imagenMembrete) {
      pdf.addImage(imagenMembrete, "JPEG", MARGEN_PT, yPt, ANCHO_PAGINA_PX * PX_A_PT, altoMembrete * PX_A_PT, "membrete", "FAST");
      yPt += reservaMembrete * PX_A_PT;
    }
    pdf.addImage(lienzo.toDataURL("image/jpeg", calidad), "JPEG", MARGEN_PT, yPt, ANCHO_PAGINA_PX * PX_A_PT, alto * PX_A_PT, undefined, "FAST");
    if (opciones.marcaDeAgua) dibujarMarcaDeAgua(pdf, opciones.marcaDeAgua, anchoPt, altoPt);
  }
  void hojaRect;
  return pdf.output("blob");
}
