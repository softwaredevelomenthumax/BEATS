import * as React from "react";
import { ubicacionTexto } from "@/lib/ubicacionVisible";
import { Button } from "@/components/ui/button";
import { ToggleCapsula } from "@/components/ui/toggle-capsula";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Printer, X, ZoomIn, ZoomOut } from "lucide-react";
import type { Caf, Convenio, ConvenioHcp, Evento, Fmv, FormatoDocumentoConfig, NotificacionPagoHcp, Usuario } from "@/types";
import type { PasoAprobacion } from "@/lib/aprobaciones";
import { NotasAprobacionImpresa } from "@/components/NotasAprobacion";
import {
  costoAlimentosSesion,
  costoAlimentosSpeaker,
  costoHospedajeSesion,
  costoHospedajeSpeaker,
  costoTrasladoTaxiSpeaker,
  costoTransporteSesion,
  costoTransporteSpeaker,
  presupuestoSesionVacio,
  totalCondensado,
} from "@/lib/presupuestoEvento";
import type { EtiquetaCampo } from "@/lib/etiquetasCampo";
import { etiquetaEfectiva } from "@/lib/etiquetasCampo";
import { CRITERIO_FMV_KEY, ETIQUETA_TIPO_DOC, SIGNIFICADO_CAF, type EstadoDoc, type TipoDoc } from "@/lib/enums";
import { PUNTAJE_POR_RESPUESTA, calcularPuntajeTotal, calcularTier, type ConfiguracionFmv } from "@/lib/fmvConfig";
import { SECCIONES_CLAUSULADO, textoEfectivoSeccion } from "@/lib/plantillaConvenioHCP";
import { useMembreteImpreso } from "@/hooks/useMembrete";
import { useUsuariosPorId } from "@/hooks/useUsuariosPorId";
import { construirNombreBase } from "@/lib/nombreArchivo";
import { NOTA_LEGAL_CAF, NOTA_PROFESIONAL_SALUD_CAF } from "@/components/forms/FormularioCAF";
import { FirmaManuscritaUsuario } from "@/components/archivos/FirmaManuscrita";
import { formatearMonto } from "@/lib/dinero";
import { EtiquetaTamano } from "@/components/ui/etiqueta-tamano";
import { estimarBytesPdf } from "@/lib/tamanoEstimado";
import { traerEventoConSesionesPorId } from "@/lib/evento";
import { leerScoreFmv, sesionesVinculadasDeConvenio, textoScoreFmv, type SesionesVinculadas } from "@/lib/convenioDerivados";
import { TEXTO_CERTIFICACION_EMPLEADO_CONVENIO } from "@/lib/textosFijosConvenio";
import { formatearFecha, formatearFechaHora } from "@/lib/fecha";
import { fechaAviso } from "@/lib/descriptorTarea";
import { camposAplicables, type CampoPersonalizadoDefinicion } from "@/lib/camposPersonalizados";

/**
 * Marca de agua diagonal por estado del documento — REESCRITA por completo
 * (septiembre/octubre 2026), pedido explícito: "Me indicaste que se había
 * corregido el tema de las marcas de agua; sin embargo, el error persiste y
 * se muestra fragmentada/partida/incompleta y no como te lo pedí."
 *
 * Causa real (confirmada reproduciendo el bug con Playwright/Chromium
 * headless — el mismo motor que usa esta app para "Imprimir / Exportar a
 * PDF" vía `window.print()` — generando un PDF de varias páginas y
 * comparándolo página por página): la versión anterior dibujaba UNA sola
 * palabra con `position: fixed`, asumiendo (como documentaban los
 * comentarios de rondas previas) que así se repetiría igual en cada hoja.
 * En la práctica NO es así en este motor: un elemento `position: fixed`
 * dentro de un documento largo que se pagina para imprimir NO se repite por
 * página — se pinta UNA sola vez, anclado cerca del inicio del documento
 * completo, y la paginación simplemente lo corta donde caiga el salto de
 * página física. Eso es exactamente "partida/incompleta": se veía completa
 * (o parcialmente) en una sola hoja y ausente en el resto, según cuánto
 * contenido tuviera el documento antes de ese punto. Ningún ajuste de
 * `scale`/`translate`/`rotate` (los bugs de "containing block" corregidos en
 * rondas anteriores) podía arreglar esto, porque el problema nunca fue de
 * posicionamiento sino de que `position: fixed` no repite por página aquí.
 *
 * Solución: un patrón de fondo (`background-image` en SVG) aplicado
 * directamente como el fondo de `#zona-imprimible`. Un `background` SÍ se
 * pinta de forma nativa y continua a través de todas las páginas al
 * imprimir contenido largo — comportamiento estándar de CSS impreso, sin
 * ningún truco de posicionamiento — así que aparece en cada hoja, siempre,
 * sin excepción.
 *
 * SEGUNDO AJUSTE (misma ronda, tras probar esta entrega), pedido explícito:
 * "Independiente de si marco 'Sí' o 'No' en firma externa, no cambia (ni se
 * quita ni se pone) al Imprimir/Exportar PDF. Lo otro es que en la vista
 * previa me muestra el texto del estado en varios espacios de la hoja. Yo
 * quiero ver una sola marca de agua, diagonal, centrada, en cada hoja del
 * documento." Dos causas distintas, dos correcciones:
 *   1. El primer `background-repeat: repeat` de esta entrega usaba una
 *      baldosa chica (420×300) — se repetía varias veces por cada hoja
 *      visible (de ahí "en varios espacios"), en vez de una sola vez.
 *      Corregido: la baldosa ahora mide lo mismo que UNA hoja completa
 *      (ver `BALDOSA_MARCA_AGUA` abajo, calculada a partir de las mismas
 *      proporciones de una hoja Letter) y `background-repeat` pasa a
 *      `repeat-y` con `background-position: center top` — nunca repite
 *      horizontalmente (la baldosa es más ancha que `#zona-imprimible`, así
 *      que un segundo mosaico lateral nunca llega a verse) y verticalmente
 *      repite exactamente una vez por cada "hoja" de alto, centrada. Mismo
 *      método verificado empíricamente (Playwright/Chromium headless,
 *      `page.pdf()` de varias páginas, inspección página por página con
 *      `pdftoppm`) igual que el resto de esta fase.
 *   2. Que no se viera NINGÚN cambio al imprimir, en ninguna de las dos
 *      posiciones del interruptor, apuntaba a que el fondo no se estaba
 *      imprimiendo en absoluto (no a un problema del interruptor en sí: su
 *      lógica en React — `estadoParaMarcaAgua`/`estiloFondoMarcaAgua` más
 *      abajo — ya estaba y sigue correcta). Causa confirmada: los
 *      navegadores, por defecto, NO imprimen `background-image`/
 *      `background-color` al exportar a PDF/imprimir, a menos que el CSS
 *      declare explícitamente `print-color-adjust: exact` (y su variante
 *      `-webkit-print-color-adjust: exact` para Chromium) — sin esa
 *      declaración, el fondo se omite SIEMPRE al imprimir, con el
 *      interruptor en cualquier posición, que es exactamente "no cambia (ni
 *      se quita ni se pone)". Se agregó esa declaración a `#zona-imprimible`
 *      en `index.css` (no solo dentro de `@media print`, para que tampoco
 *      haga falta activar manualmente "Gráficos de fondo" en el diálogo de
 *      impresión del navegador).
 */
export const MARCA_AGUA_POR_ESTADO: Record<EstadoDoc, { texto: string; color: string; fontSize: number }> = {
  Borrador: { texto: "BORRADOR", color: "rgba(100, 116, 139, 0.24)", fontSize: 30 },
  Pendiente: { texto: "EN PROCESO DE FIRMA", color: "rgba(217, 119, 6, 0.22)", fontSize: 19 },
  Aprobado: { texto: "APROBADO", color: "rgba(5, 150, 105, 0.20)", fontSize: 30 },
  Rechazado: { texto: "RECHAZADO", color: "rgba(220, 38, 38, 0.22)", fontSize: 26 },
  Devuelto: { texto: "DEVUELTO", color: "rgba(100, 116, 139, 0.24)", fontSize: 28 },
  Completado: { texto: "COMPLETADO", color: "rgba(5, 150, 105, 0.20)", fontSize: 24 },
  Anulado: { texto: "ANULADO", color: "rgba(87, 83, 78, 0.24)", fontSize: 28 },
};

/**
 * Tamaño (px) de la baldosa del patrón de fondo — pedido explícito: "una
 * sola marca de agua ... centrada, en cada hoja del documento". El ALTO de
 * la baldosa (960px) está calculado para coincidir EXACTAMENTE con el alto
 * de contenido de una hoja Letter física con el margen declarado en
 * `index.css` (`@page { size: letter; margin: 0.5in; }`, agregado en esta
 * misma ronda): 11in − 2×0.5in = 10in × 96px/in = 960px. Si la baldosa no
 * coincide EXACTO con ese alto por página, la marca de agua va quedando
 * "desfasada" página tras página (se probó primero con una baldosa calculada
 * solo a partir del ancho — proporción 8.5:11 — y, aunque se veía bien en la
 * página 1, para la página 3 ya había quedado visiblemente corrida hacia
 * arriba: confirmado generando un PDF de 3 páginas real con Playwright/
 * Chromium headless y comparándolas, antes de fijar este valor). El ANCHO
 * (768px) coincide con el ancho de `#zona-imprimible` (`max-w-3xl`): con
 * `background-repeat: repeat-y` + `background-position: center top` (ver
 * `construirFondoMarcaDeAgua`), el patrón nunca repite lateralmente (no hay
 * espacio para un segundo mosaico al lado) y repite verticalmente EXACTO una
 * vez por hoja, centrada — verificado con la misma prueba (PDF de 3 páginas,
 * página por página).
 */
const BALDOSA_MARCA_AGUA = { ancho: 768, alto: 960 };

/**
 * Construye el `background-image` (SVG inline en base64) con la palabra del
 * estado, UNA sola vez, en diagonal y centrada dentro de la baldosa (que
 * mide una hoja completa — ver `BALDOSA_MARCA_AGUA`). Se aplica como estilo
 * de `#zona-imprimible` en vez de como un elemento propio — ver el
 * comentario grande de arriba.
 */
function construirFondoMarcaDeAgua(estado: EstadoDoc): React.CSSProperties | null {
  const config = MARCA_AGUA_POR_ESTADO[estado];
  if (!config) return null;
  const { ancho, alto } = BALDOSA_MARCA_AGUA;
  const cx = ancho / 2;
  const cy = alto / 2;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}">` +
    `<text x="${cx}" y="${cy}" transform="rotate(-32 ${cx} ${cy})" ` +
    `font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="${config.fontSize * 1.8}" ` +
    `fill="${config.color}" text-anchor="middle" dominant-baseline="middle" letter-spacing="1.5">` +
    `${config.texto}</text></svg>`;
  const url = `data:image/svg+xml;base64,${btoa(svg)}`;
  return {
    backgroundImage: `url("${url}")`,
    backgroundRepeat: "repeat-y",
    backgroundPosition: "center top",
    backgroundSize: `${ancho}px ${alto}px`,
  };
}

const VARIANTE_POR_ESTADO: Record<EstadoDoc, BadgeProps["variant"]> = {
  Borrador: "draft",
  Pendiente: "pending",
  Aprobado: "approved",
  Rechazado: "rejected",
  Devuelto: "draft",
  Completado: "completed",
  Anulado: "cancelled",
};

/**
 * Encabezado oficial ("membrete", Fase 5 post-reconstrucción — segunda
 * entrega) — tabla con bordes, igual al formato controlado que usa la
 * compañía en papel: celda izquierda con "FORMATO" + el nombre del formato,
 * celda derecha con el logo, y una segunda fila con las 4 casillas de
 * control (PROCESO/CÓDIGO/VERSIÓN/EMISIÓN — ya existían en
 * `configuracion_formatos` desde antes pero no se mostraban en ningún lado
 * impreso — ver `useMembreteImpreso`). Es opcional — el interruptor "Incluir
 * encabezado oficial" de `DocumentoImprimible` decide si se ve/guarda/
 * imprime con o sin él.
 *
 * REESCRITO (septiembre/octubre 2026), pedido explícito: "cuando se
 * selecciona la opción de mostrar membrete en los documentos, este debe
 * aparecer en todas las páginas de dicho documento." Igual que la marca de
 * agua (ver el comentario grande en `MarcaDeAgua`/`construirFondoMarcaDeAgua`
 * más arriba), este componente usaba `position: fixed` asumiendo que se
 * repetiría por página — confirmado con la misma prueba (Playwright/
 * Chromium headless, PDF de varias páginas) que NO es así: se pintaba una
 * sola vez. Ya NO lleva `position: fixed` — ahora es un elemento normal del
 * flujo del documento, y es quien lo envuelve (`DocumentoImprimible`, ver
 * `<thead style={{ display: "table-header-group" }}>` más abajo) el que lo
 * hace repetirse en cada hoja, con la técnica HTML estándar y de soporte
 * muy antiguo/estable para encabezados de tabla que se repiten al imprimir
 * (también verificada con la misma prueba).
 */
export function MembreteImpreso({
  tipo,
  formato,
  logoUrl,
}: {
  tipo: TipoDoc;
  formato: FormatoDocumentoConfig | null;
  logoUrl: string | null;
}) {
  const fechaEmision = formato?.fechaEmision ? formatearFecha(formato.fechaEmision) : "";
  return (
    <table className="w-full table-fixed border-collapse border border-black bg-white text-[10.5px] text-black">
      <tbody>
        <tr>
          <td colSpan={3} className="border border-black p-2 text-center align-middle">
            <p className="text-[9px] font-semibold tracking-[0.25em] text-gray-500">FORMATO</p>
            <p className="mt-1 text-[13px] font-bold uppercase leading-snug">{ETIQUETA_OFICIAL_TIPO_DOC[tipo]}</p>
          </td>
          {/* AJUSTES (septiembre/octubre 2026), pedido explícito: "el membrete
              debe mostrar el logo (en el área superior derecha)". Esta celda
              ya era la última de la fila (derecha); `useMembreteImpreso`
              (ver su propio comentario) ya resuelve el logo INSTITUCIONAL
              configurado en "Configuración de campos / variables" desde una
              corrección de una ronda anterior. */}
          <td className="border border-black p-2 text-center align-middle">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo de la empresa" className="mx-auto h-10 w-auto max-w-full object-contain" />
            ) : (
              <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">Logo</span>
            )}
          </td>
        </tr>
        <tr>
          <td className="border border-black p-1.5 text-center">
            <span className="font-semibold">PROCESO:</span> {formato?.proceso || ""}
          </td>
          <td className="border border-black p-1.5 text-center">
            <span className="font-semibold">CÓDIGO:</span> {formato?.codigo || ""}
          </td>
          <td className="border border-black p-1.5 text-center">
            <span className="font-semibold">VERSIÓN:</span> {formato?.version || ""}
          </td>
          <td className="border border-black p-1.5 text-center">
            <span className="font-semibold">EMISIÓN:</span> {fechaEmision}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * Membrete de los informes del Expediente (Octubre 2026): misma tabla con
 * bordes del membrete oficial, pero sin las casillas PROCESO/CÓDIGO/VERSIÓN
 * (los informes no tienen un formato controlado configurado): título del
 * informe + logo institucional y, debajo, el evento y la fecha de generación.
 */
function MembreteInforme({ titulo, nombreEvento, logoUrl }: { titulo: string; nombreEvento: string; logoUrl: string | null }) {
  const fecha = new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
  return (
    <table className="w-full table-fixed border-collapse border border-black bg-white text-[10.5px] text-black" data-testid="membrete-informe">
      <tbody>
        <tr>
          <td colSpan={3} className="border border-black px-2 py-1 text-center align-middle">
            <p className="text-[8px] font-semibold tracking-[0.25em] text-gray-500">INFORME</p>
            <p className="text-[12px] font-bold uppercase leading-tight">{titulo}</p>
          </td>
          <td className="border border-black px-2 py-1 text-center align-middle">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo de la empresa" className="mx-auto h-8 w-auto max-w-full object-contain" />
            ) : (
              <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">Logo</span>
            )}
          </td>
        </tr>
        <tr>
          <td colSpan={3} className="border border-black px-1.5 py-0.5 text-center">
            <span className="font-semibold">EVENTO:</span> {nombreEvento}
          </td>
          <td className="border border-black px-1.5 py-0.5 text-center">
            <span className="font-semibold">GENERADO:</span> {fecha}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** Nombre largo de formato oficial por tipo de documento (celda "FORMATO" del membrete). */
const ETIQUETA_OFICIAL_TIPO_DOC: Record<TipoDoc, string> = {
  evento: "Solicitud de Apoyos para Eventos Educativos y Eventos Promocionales",
  caf: `${SIGNIFICADO_CAF.toUpperCase()} (CAF)`,
  fmv: "Checklist de Fair Market Value",
  notificacionPago: "Notificación de Pago a Profesionales de la Salud",
  convenio: "Convenio de Pago a Profesional de la Salud",
  convenioHCP: "Convenio de Consultoría con Profesional de la Salud (Convenio HCP)",
};

const CLASES_ZOOM: Record<number, string> = {
  50: "scale-50",
  60: "scale-[0.6]",
  70: "scale-[0.7]",
  80: "scale-[0.8]",
  90: "scale-90",
  100: "scale-100",
  110: "scale-[1.1]",
  120: "scale-[1.2]",
  130: "scale-[1.3]",
  140: "scale-[1.4]",
  150: "scale-[1.5]",
};
const NIVELES_ZOOM = Object.keys(CLASES_ZOOM).map(Number).sort((a, b) => a - b);

/**
 * Pie de página oficial (Fase 5, segunda entrega): "Elaborado por..." con
 * el nombre/cargo de quien creó el documento (`creadoPorId`, resuelto a
 * través de `useUsuariosPorId`) y la hora en que se generó/exportó esta
 * vista (no la fecha de creación del documento), más una línea de
 * trazabilidad con el id interno. Solo se pinta cuando el llamador pasa
 * `documentoId` — los generadores que no son uno de los 6 documentos (como
 * "Informe por Evento") no lo llevan.
 */
export function PiePaginaOficial({ documentoId, creador, className = "mt-10" }: { documentoId: string; creador?: Usuario; className?: string }) {
  const ahora = new Date();
  const fecha = ahora.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
  const hora = ahora.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false });
  return (
    <footer className={`${className} border-t border-gray-300 pt-3 text-center text-[10px] text-gray-500`} style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
      <p>
        {creador && (
          <>
            Elaborado por {creador.nombre}, {creador.cargo} · Generado el {fecha}, {hora} desde BEATS.{" "}
          </>
        )}
        ID interno: {documentoId}.
      </p>
      <p className="mt-1 italic">Este documento refleja el estado del flujo de aprobación al momento de su exportación.</p>
    </footer>
  );
}

/**
 * Título simple, sin tabla ni logo (Fase 5, cuarta entrega): cuando el
 * usuario apaga "Incluir encabezado oficial (membrete)", antes de esta
 * entrega la página impresa quedaba sin ninguna indicación de a qué
 * documento correspondía (el título solo vivía en la barra de herramientas,
 * que es `no-imprimir`). Pedido explícito del usuario: "si retiras el
 * encabezado, el título del documento debe permanecer visible". Reutiliza
 * el mismo nombre oficial largo del membrete (`ETIQUETA_OFICIAL_TIPO_DOC`)
 * pero sin tabla/bordes/logo — solo el título, igual que en los formatos de
 * referencia del usuario cuando se imprimen sin el encabezado con logo.
 */
export function TituloSimpleSinMembrete({ tipo }: { tipo: TipoDoc }) {
  return (
    <h1 className="mb-4 border-b border-black pb-2 text-center text-[14px] font-bold uppercase leading-snug tracking-wide text-black">
      {ETIQUETA_OFICIAL_TIPO_DOC[tipo]}
    </h1>
  );
}

/**
 * Contenedor de impresión: la barra de herramientas queda oculta al
 * imprimir (clase `no-imprimir`, definida en index.css); solo el
 * <div id="zona-imprimible"> se ve en el papel. Mismo patrón que el bundle
 * original: window.print() sobre una zona marcada, sin librerías de PDF.
 * `estado`, cuando se pasa, dibuja la marca de agua diagonal correspondiente
 * (BORRADOR/EN PROCESO DE FIRMA/APROBADO/RECHAZADO/COMPLETADO/ANULADO)
 * detrás del contenido.
 *
 * `tipo`/`empresaGrupo` (Fase 5), cuando se pasan, activan el membrete de
 * arriba y el interruptor "Incluir encabezado oficial" — se ve tanto en la
 * vista previa en pantalla como en lo que efectivamente se guarda/imprime,
 * porque controla lo mismo que se ve en el momento de imprimir
 * (`window.print()` captura el DOM tal como está en pantalla). Se dejan
 * opcionales para que generadores que no son uno de los 6 documentos (como
 * "Informe por Evento") sigan usando este mismo contenedor sin membrete.
 *
 * Fase 5 (segunda entrega, post-reconstrucción) — ajustes pedidos
 * explícitamente por el usuario, sobre la primera entrega:
 *  - Barra de herramientas ampliada: nombre del formato + estado + subtítulo
 *    "Vista oficial del documento", control de zoom (`scale-*` de Tailwind
 *    — NUNCA vía `transform` inline, que un `print:` de clase no podría
 *    ganarle por especificidad) y el botón de imprimir renombrado a
 *    "Imprimir / Exportar a PDF". `onCerrar`, si se pasa, agrega un botón
 *    "Cerrar" (llama al mismo cierre que ya usa el diálogo contenedor).
 *  - `documentoId`/`creadoPorId`, si se pasan, agregan el pie de página
 *    oficial de arriba.
 *  - "Modo para firma externa (sin marca de agua)" sigue igual que en la
 *    primera entrega: apaga la marca de agua diagonal por estado para
 *    imprimir/diligenciar a mano en una eventualidad. Apagado por defecto.
 *
 * Fase 8 (ajuste cosmético — marca de agua completa en todas las páginas):
 * el zoom en pantalla se anulaba para impresión con `print:scale-100` —
 * visualmente "sin zoom", pero esa clase de Tailwind v4 fija la propiedad
 * CSS `scale` (independiente de `transform` desde CSS Transforms Level 2),
 * a `100% 100%` — NO a `none`. Cualquier valor de `scale` (o de
 * `transform`) distinto de `none`, aunque sea una escala idéntica, crea un
 * "containing block" nuevo para los descendientes con `position: fixed`
 * (spec CSS, no un detalle de Chromium). `MarcaDeAgua` y `MembreteImpreso`
 * son ambos `position: fixed` A PROPÓSITO (ver sus comentarios) para
 * repetirse en cada hoja física al paginar un documento largo — con
 * `#zona-imprimible` de por medio con `scale: 100% 100%`, en cambio,
 * quedaban anclados al recuadro de esa capa (como si fueran
 * `position: absolute` respecto a ella) y solo se veían completos en la
 * página donde ese recuadro cae, no en el resto. Tailwind no trae una
 * utilidad lista para resetear `scale` a `none` (solo a un porcentaje), así
 * que el reset real vive en `src/index.css`
 * (`#zona-imprimible { scale: none !important; }` dentro de
 * `@media print`) — a propósito SIN declarar también `transform: none` en
 * esa misma regla (ver el comentario en `index.css`: el minificador de
 * Tailwind v4 funde ambas declaraciones en una sola y descarta la de
 * `scale`, reintroduciendo el bug). Por eso este nodo ya NO lleva ninguna
 * clase `print:` de transform/scale — solo el `${CLASES_ZOOM[zoom]}` del
 * zoom en pantalla, que la regla de `index.css` neutraliza para impresión.
 *
 * Fase 5 (cuarta entrega) — dos correcciones más, pedidas explícitamente
 * por el usuario tras probar la tercera entrega:
 *  - La vista previa en pantalla debía verse "como una página real, no como
 *    un pantallazo de la ventana": antes, el diálogo (ancho moderado,
 *    bordes/sombra/esquinas redondeadas propias) envolvía a su vez la
 *    "hoja" con su propio fondo/sombra — dos marcos anidados, que en
 *    conjunto se veían como una captura de pantalla de una ventana pequeña
 *    en vez de una página real. Los 6 `Detalle*.tsx` ahora abren el diálogo
 *    a pantalla completa (`h-screen w-screen`, sin bordes/esquinas propias)
 *    — queda un solo marco (el fondo neutro + la hoja con sombra, ya
 *    existente desde la segunda entrega). La barra de herramientas queda
 *    `sticky top-0` para que zoom/imprimir/alternar encabezado sigan a la
 *    mano aunque el documento sea largo y haya que hacer scroll.
 *  - Si se apaga "Incluir encabezado oficial (membrete)", el título del
 *    documento (`TituloSimpleSinMembrete`, arriba) se sigue viendo dentro
 *    de la hoja — antes desaparecía por completo, porque el título vivía
 *    solo en la barra de herramientas (`no-imprimir`).
 */
export function DocumentoImprimible({
  children,
  estado,
  tipo,
  empresaGrupo,
  documentoId,
  creadoPorId,
  nombreDocumento,
  onCerrar,
  informe,
  orientacion = "vertical",
  pieEnCuerpo = false,
}: {
  children: React.ReactNode;
  estado?: EstadoDoc;
  tipo?: TipoDoc;
  empresaGrupo?: string;
  documentoId?: string;
  creadoPorId?: string;
  /**
   * AJUSTES (septiembre/octubre 2026), pedido explícito: nombre descriptivo
   * del documento (nombre del evento, del HCP/speaker, etc. — lo que mejor
   * identifique al documento puntual) usado para sugerir el nombre de
   * archivo al exportar a PDF (ver `imprimir`, abajo). Opcional: sin él, el
   * nombre sugerido solo usa el tipo de documento, la fecha y el id.
   */
  nombreDocumento?: string;
  onCerrar?: () => void;
  /**
   * Octubre 2026: informes del Expediente (lista de asistencia, muestra
   * médica) — no son uno de los 6 documentos con formato configurable
   * (`tipo`), pero sí llevan el mismo interruptor "Incluir encabezado
   * oficial (membrete)" (Sí/No). Con "Sí" se pinta un membrete con el título
   * del informe, el logo institucional de la empresa y el evento; con "No"
   * solo queda el título simple, igual que los demás documentos.
   */
  informe?: { titulo: string; nombreEvento: string; empresaGrupo: string };
  /**
   * Octubre 2026: "horizontal" imprime en hoja Letter apaisada (11in × 8.5in)
   * y ensancha la vista previa para que coincida; sirve a tablas anchas.
   */
  orientacion?: "vertical" | "horizontal";
  /**
   * Noviembre 2026: el cuerpo del documento dibuja por sí mismo el pie «Elaborado por…» (lo hace el Convenio HCP,
   * para fijarlo en la zona inferior de su ÚLTIMA hoja). Evita que se pinte dos veces.
   */
  pieEnCuerpo?: boolean;
}) {
  const [mostrarMembrete, setMostrarMembrete] = React.useState(true);
  const [modoFirmaExterna, setModoFirmaExterna] = React.useState(false);
  const [zoom, setZoom] = React.useState(100);
  // Los informes no tienen formato configurable, pero sí logo institucional (que no depende del tipo).
  const { formato, logoUrl } = useMembreteImpreso(tipo ?? (informe ? "evento" : undefined), informe?.empresaGrupo ?? empresaGrupo ?? "");
  const usuariosResueltos = useUsuariosPorId([creadoPorId]);
  const tieneMembrete = Boolean(tipo || informe) && mostrarMembrete;
  const horizontal = orientacion === "horizontal";

  // `@page` no se puede condicionar con una clase: se inyecta una regla de
  // impresión mientras la vista horizontal esté montada y se retira al cerrar,
  // para no afectar a los demás documentos (que son verticales).
  React.useEffect(() => {
    if (!horizontal) return;
    const estilo = document.createElement("style");
    estilo.setAttribute("data-orientacion-impresion", "horizontal");
    estilo.textContent = "@media print { @page { size: letter landscape; margin: 0.5in; } }";
    document.head.appendChild(estilo);
    return () => {
      estilo.remove();
    };
  }, [horizontal]);
  // Entrega 31: tamaño estimado del PDF, medido sobre el contenido real de la hoja (texto, imágenes y número de páginas).
  const [bytesPdf, setBytesPdf] = React.useState<number | null>(null);
  React.useEffect(() => {
    const medir = () => {
      const zona = document.getElementById("zona-imprimible");
      if (!zona) return;
      const imagenes = Array.from(zona.querySelectorAll("img")).reduce((a, img) => {
        const src = img.getAttribute("src") ?? "";
        return a + (src.startsWith("data:") ? Math.round((src.length * 3) / 4) : 15 * 1024);
      }, 0);
      const paginas = Math.max(1, Math.ceil(zona.scrollHeight / (horizontal ? 720 : 960)));
      setBytesPdf(estimarBytesPdf({ filas: Math.round(zona.innerText.length / 90), paginas, imagenesBytes: imagenes }));
    };
    const t = window.setTimeout(medir, 600);
    return () => window.clearTimeout(t);
  });
  const estadoParaMarcaAgua = modoFirmaExterna ? undefined : estado;
  const estiloFondoMarcaAgua = estadoParaMarcaAgua ? construirFondoMarcaDeAgua(estadoParaMarcaAgua) : null;

  function cambiarZoom(direccion: 1 | -1) {
    const indiceActual = NIVELES_ZOOM.indexOf(zoom);
    const siguiente = NIVELES_ZOOM[indiceActual + direccion];
    if (siguiente) setZoom(siguiente);
  }

  /**
   * AJUSTES (septiembre/octubre 2026), pedido explícito: "cuando doy clic en
   * el botón 'Imprimir / Exportar a PDF', y luego en 'Guardar', el sistema
   * me debe sugerir un nombre de archivo" con una estructura lógica
   * (tipo + nombre + fecha + id). El diálogo nativo "Guardar como PDF" de
   * los navegadores toma el nombre sugerido de `document.title` en el
   * momento en que se llama `window.print()` — no existe otra API para
   * esto sin una librería de generación de PDF (fuera del alcance: el
   * mecanismo de impresión de esta app es, a propósito, `window.print()`
   * sobre el DOM, ver comentario grande más arriba). `window.print()` es
   * bloqueante (no retorna hasta cerrar el diálogo de impresión en los
   * navegadores de escritorio soportados), así que basta con restaurar el
   * título original justo después, sin depender del evento `afterprint`.
   */
  function imprimir() {
    const tituloOriginal = document.title;
    document.title = construirNombreBase({ tipo, nombre: nombreDocumento, fecha: new Date(), idConsecutivo: documentoId });
    window.print();
    document.title = tituloOriginal;
  }

  return (
    <div>
      <div className="no-imprimir sticky top-0 z-30 mb-4 flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-2.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {tipo && (
            <span className="rounded bg-muted px-2 py-1 text-xs font-bold uppercase tracking-wide text-foreground">
              {ETIQUETA_TIPO_DOC[tipo]}
            </span>
          )}
          {estado && <Badge variant={VARIANTE_POR_ESTADO[estado]}>{estado}</Badge>}
          {tipo && (
            <span className="text-xs text-muted-foreground">
              Vista oficial del documento — lista para imprimir o exportar a PDF
            </span>
          )}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-4">
          {(tipo || informe) && (
            <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
              Incluir encabezado oficial (membrete)
              <ToggleCapsula
                value={mostrarMembrete ? "si" : "no"}
                onValueChange={(v) => setMostrarMembrete(v === "si")}
                opciones={[
                  { value: "no", label: "No" },
                  { value: "si", label: "Sí" },
                ]}
              />
            </div>
          )}
          {estado && (
            <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
              Modo para firma externa (sin marca de agua)
              <ToggleCapsula
                value={modoFirmaExterna ? "si" : "no"}
                onValueChange={(v) => setModoFirmaExterna(v === "si")}
                opciones={[
                  { value: "no", label: "No" },
                  { value: "si", label: "Sí" },
                ]}
              />
            </div>
          )}
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={zoom <= NIVELES_ZOOM[0]}
              onClick={() => cambiarZoom(-1)}
              aria-label="Alejar"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="w-10 text-center text-sm font-mono-tab text-muted-foreground">{zoom}%</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={zoom >= NIVELES_ZOOM[NIVELES_ZOOM.length - 1]}
              onClick={() => cambiarZoom(1)}
              aria-label="Acercar"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
          <Button onClick={imprimir}>
            <Printer /> Imprimir / Exportar a PDF
          </Button>
          <EtiquetaTamano bytes={bytesPdf} testId="pdf-tamano-estimado" />
          {onCerrar && (
            <Button variant="outline" onClick={onCerrar}>
              <X /> Cerrar
            </Button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg bg-muted/40 px-4 py-8 print:overflow-visible print:bg-transparent print:p-0">
        <div
          id="zona-imprimible"
          className={`relative mx-auto ${horizontal ? "max-w-[1056px]" : "max-w-3xl"} origin-top bg-white px-14 py-12 text-sm text-black shadow-md ring-1 ring-black/10 print:p-0 print:shadow-none print:ring-0 ${CLASES_ZOOM[zoom]}`}
          style={estiloFondoMarcaAgua ?? undefined}
        >
          {/*
           * AJUSTES (septiembre/octubre 2026), pedido explícito: ver el
           * comentario grande de `MarcaDeAgua`/`construirFondoMarcaDeAgua` y
           * de `MembreteImpreso` más arriba. Ya no hay un elemento propio
           * `position: fixed` para cada uno (ni para la marca de agua —
           * ahora el `background-image` de este mismo nodo, ver `style` de
           * arriba — ni para el membrete): el membrete se repite en cada
           * página porque vive en un `<thead>` con
           * `display: table-header-group` de una tabla que envuelve TODO el
           * contenido imprimible — técnica HTML estándar y de soporte
           * antiguo/estable para encabezados que se repiten al paginar al
           * imprimir, verificada igual que la del fondo (Playwright/
           * Chromium headless, PDF de varias páginas).
           */}
          <table className="w-full border-collapse">
            {tieneMembrete && (
              <thead style={{ display: "table-header-group" }}>
                <tr>
                  <td className="pb-4">
                    {informe ? (
                      <MembreteInforme titulo={informe.titulo} nombreEvento={informe.nombreEvento} logoUrl={logoUrl} />
                    ) : (
                      <MembreteImpreso tipo={tipo!} formato={formato} logoUrl={logoUrl} />
                    )}
                  </td>
                </tr>
              </thead>
            )}
            <tbody>
              <tr>
                <td className="align-top">
                  {tipo && !tieneMembrete && <TituloSimpleSinMembrete tipo={tipo} />}
                  {informe && !tieneMembrete && (
                    <h1 className="mb-3 border-b border-black pb-2 text-center text-[14px] font-bold uppercase leading-snug tracking-wide text-black">{informe.titulo}</h1>
                  )}
                  {children}
                  {documentoId && !pieEnCuerpo && (
                    <PiePaginaOficial documentoId={documentoId} creador={creadoPorId ? usuariosResueltos.get(creadoPorId) : undefined} />
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function Fila({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 border-b border-gray-200 py-1.5">
      <div className="col-span-1 font-medium text-gray-600">{etiqueta}</div>
      <div className="col-span-2">{valor || "—"}</div>
    </div>
  );
}

/**
 * Componentes compartidos del "formato oficial" (Fase 5, segunda entrega):
 * título de sección centrado en mayúsculas, campo de etiqueta en negrita +
 * valor en la misma línea (en vez de la fila con borde/caja de `Fila`,
 * usada todavía por "Informe por Evento") y una cuadrícula de 2 columnas
 * para los pares de campos que van lado a lado, igual al formato de papel
 * que ya usa la compañía.
 */
/**
 * Fase 8 (hallazgo grande "separar vista de detalle compacta de la vista de
 * impresión"): en el original, la vista de detalle compacta de los 6
 * documentos muestra los MISMOS campos, en el MISMO orden, que su
 * respectivo formato de impresión — solo que con un estilo más liviano
 * (secciones en azul en vez de centradas en negro, pares etiqueta-gris/
 * valor-negro en vez de "Etiqueta: valor" en una sola línea, sin membrete
 * ni marca de agua). En vez de escribir un segundo componente por cada uno
 * de los 6 documentos que repita la misma lista de campos (con el riesgo de
 * que ambas vistas se desincronicen con el tiempo — justo la clase de
 * inconsistencia que esta fase busca evitar), los `Cuerpo*` de abajo se
 * reutilizan tal cual para AMBAS vistas: este contexto decide únicamente
 * cómo se pintan `TituloSeccion`/`CampoInline`, sin que cada `Cuerpo*` sepa
 * en qué vista está. `CuerpoCompacto`, más abajo, es el wrapper que activa
 * el modo "compacta"; sin ese wrapper el modo por defecto sigue siendo
 * "impresion" (el de siempre, sin cambios).
 */
const ModoVistaDocumento = React.createContext<"impresion" | "compacta">("impresion");

/**
 * AJUSTES (septiembre/octubre 2026), pedido explícito: "No muestres la
 * sección 'Aprobación' (que incluye el cuadro con el estado y la
 * información de la aprobación). Esto es útil para la vista impresión/
 * previa/pdf. Pero si deja la cadena de aprobación, para que el usuario
 * vaya visualizando en qué estado se encuentra el documento" — la tabla
 * "Aprobación" (`TablaAprobacion`, con Área/Nombre/Fecha/Firma/Aprobado) es
 * la versión de ESTE componente pensada para el papel; la vista de detalle
 * (modo "compacta") ya tiene su PROPIA "Cadena de aprobación" (lista con
 * badges de estado, botones Aprobar/Rechazar, firma manuscrita — ver
 * `Detalle*.tsx`), así que mostrar también esta tabla ahí era información
 * duplicada. Se envuelve el título + la tabla en este wrapper, que no
 * pinta nada en modo "compacta" mientras deja la vista de impresión
 * intacta.
 */
function SeccionAprobacion({ children }: { children: React.ReactNode }) {
  const modo = React.useContext(ModoVistaDocumento);
  if (modo === "compacta") return null;
  return <>{children}</>;
}

function TituloSeccion({ children }: { children: React.ReactNode }) {
  const modo = React.useContext(ModoVistaDocumento);
  if (modo === "compacta") {
    // AJUSTES (septiembre/octubre 2026), pedido explícito: "los títulos de
    // las secciones usan un azul 'eléctrico' que no tiene nada que ver con
    // los colores del aplicativo. Sugiero usar el mismo azul de los botones
    // de filtros" — `text-blue-700` (azul genérico de Tailwind) se
    // reemplaza por `var(--brand-blue)` (`#00A3E0`), el mismo color exacto
    // que usan las pastillas activas de filtro (`FiltroPastilla`) y el
    // resto de acentos de marca de la app.
    return <h2 className="mt-3 text-xs font-bold uppercase tracking-wide text-[var(--brand-blue)] first:mt-0">{children}</h2>;
  }
  return <h2 className="mt-1 text-center text-[13px] font-bold uppercase tracking-wide text-black">{children}</h2>;
}

/**
 * Ronda de ajustes de formularios (septiembre 2026), entrega 4: cuadro de
 * advertencia para el documento impreso — pedido explícito para el caso de
 * "evento sin presupuesto aprobado" ("dejará una nota al final del
 * documento, antes del panel de firmas... esto servirá como referencia
 * para que los responsables de la matriz de aprobación decidan"). Se deja
 * como componente reutilizable porque el mismo patrón aplica a la
 * advertencia de "funcionario de gobierno" de Convenio de Pago a HCP, en
 * una entrega posterior de esta ronda.
 */
function NotaAdvertencia({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 rounded-md border border-amber-500 bg-amber-50 p-2 text-[12px] text-amber-900 print:border-black print:bg-transparent">
      {children}
    </div>
  );
}

/** Entrega 22: "Quién dicta la actividad" cuando hay speakers internos, externos o ambos. */
function descripcionQuienDicta(evento: Evento): string {
  const internos = evento.speakersParticipacion.filter((sp) => sp.tipo === "interno");
  const externos = evento.speakersParticipacion.filter((sp) => sp.tipo === "externo");
  if (internos.length === 0 && externos.length === 0) return [evento.quienDictaActividad, evento.nombreSpeakerParticipacion].filter(Boolean).join(" — ");
  const partes: string[] = [];
  if (internos.length > 0) partes.push(`Speaker${internos.length > 1 ? "s" : ""} interno${internos.length > 1 ? "s" : ""}: ${internos.map((sp) => sp.nombreSpeaker || "(sin nombre)").join("; ")}`);
  if (externos.length > 0) partes.push(`Speaker${externos.length > 1 ? "s" : ""} externo${externos.length > 1 ? "s" : ""}: ${externos.map((sp) => sp.nombreSpeaker || "(sin nombre)").join("; ")}`);
  return partes.join(" · ");
}

function CampoInline({
  etiqueta,
  valor,
  advertirSiVacio,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  /** Fase 5: cuando el valor viene vacío, muestra "⚠ Falta información" en vez de "—" — para
   * campos que el formato oficial en papel espera ver diligenciados (evidenciado en el PDF de
   * referencia del usuario para "Nombre y firma del superior que aprueba"). */
  advertirSiVacio?: boolean;
}) {
  const modo = React.useContext(ModoVistaDocumento);
  const vacio = valor === "" || valor == null || valor === false;
  const valorMostrado = vacio ? (
    advertirSiVacio ? (
      <span className={modo === "compacta" ? "font-medium text-destructive" : "font-semibold text-red-600"}>
        ⚠ Falta información
      </span>
    ) : (
      "—"
    )
  ) : (
    valor
  );
  if (modo === "compacta") {
    // AJUSTES (septiembre/octubre 2026), pedido explícito: "organiza el
    // formato visual para que se vea acorde a la ventana 'original' del
    // documento... ajusta el código de colores, fuentes, tamaños de
    // fuentes... usa fuentes en bold, semibold, normal, etc, según
    // corresponda" — el nombre del campo pasa de `text-[11px]` gris apagado
    // a la MISMA tipografía que usa `<Label>` en los formularios de
    // creación/edición (`text-sm font-semibold text-slate-800`, ver
    // `components/ui/label.tsx`), para que el detalle se lea como una
    // continuación de esa misma vista en vez de un estilo aparte.
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-slate-800">{etiqueta}</span>
        <span className="text-sm font-normal text-foreground">{valorMostrado}</span>
      </div>
    );
  }
  return (
    <div className="text-[12px] leading-relaxed">
      <span className="font-semibold">{etiqueta}:</span> {valorMostrado}
    </div>
  );
}

/**
 * Wrapper que activa el modo "compacta" (ver comentario de
 * `ModoVistaDocumento` arriba) para cualquier `Cuerpo*` que reciba como
 * `children` — así la vista de detalle compacta reutiliza exactamente los
 * mismos componentes de campos que la vista de impresión, sin membrete, sin
 * marca de agua y sin el "papel" de fondo blanco.
 */
export function CuerpoCompacto({ children }: { children: React.ReactNode }) {
  return (
    <ModoVistaDocumento.Provider value="compacta">
      <div className="flex flex-col gap-2.5 text-sm">{children}</div>
    </ModoVistaDocumento.Provider>
  );
}

/**
 * Línea "Creado por {nombre}, {cargo} · {fecha}" que el original muestra
 * bajo el título de la vista de detalle compacta de los 6 documentos.
 */
export function CreadoPorLinea({ creadoPorId, creadoEn }: { creadoPorId?: string | null; creadoEn: string }) {
  const usuarios = useUsuariosPorId([creadoPorId]);
  const creador = creadoPorId ? usuarios.get(creadoPorId) : undefined;
  const fecha = creadoEn ? formatearFecha(creadoEn) : "";
  return (
    <p className="text-xs text-muted-foreground">
      Creado por {creador?.nombre ?? "—"}
      {creador?.cargo ? `, ${creador.cargo}` : ""} · {fecha}
    </p>
  );
}

function Grilla2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">{children}</div>;
}

/**
 * AJUSTES (septiembre 2026), pedido explícito — hallazgo del audit "el
 * detalle/impresión debe mostrar toda la información diligenciada": los
 * campos personalizados por empresa/país (`camposPersonalizados`, definidos
 * en "Configuración de Campos") se recogían en los 6 formularios de
 * creación/edición, pero nunca se pintaban ni en la vista de detalle
 * compacta ni en la vista de impresión de ningún documento — quedaban
 * "invisibles" una vez guardados. Componente único, reutilizado por los 6
 * `Cuerpo*` de abajo, para no repetir la lógica de `camposAplicables` +
 * formateo por tipo seis veces.
 */
function CuerpoCamposPersonalizados({
  tipoDoc,
  valores,
  definiciones,
  empresaGrupo,
  pais,
}: {
  tipoDoc: TipoDoc;
  valores: Record<string, unknown>;
  definiciones: CampoPersonalizadoDefinicion[];
  empresaGrupo: string;
  pais: string;
}) {
  const aplicables = camposAplicables(definiciones, tipoDoc, empresaGrupo, pais);
  if (aplicables.length === 0) return null;
  return (
    <>
      <TituloSeccion>Campos personalizados</TituloSeccion>
      <Grilla2>
        {aplicables.map((def) => {
          const valor = valores[def.clave];
          const texto =
            def.tipo === "booleano"
              ? valor
                ? "Sí"
                : "No"
              : valor == null || valor === ""
                ? "—"
                : String(valor);
          return <CampoInline key={def.id} etiqueta={def.etiqueta} valor={texto} />;
        })}
      </Grilla2>
    </>
  );
}

const ENCABEZADOS_APROBACION_ES = { area: "Área que aprueba", nombre: "Nombre", fecha: "Fecha", firma: "Firma", aprobado: "Aprobado", si: "Sí", no: "No" };
const ENCABEZADOS_APROBACION_EN = { area: "Approving area", nombre: "Name", fecha: "Date", firma: "Signature", aprobado: "Approved", si: "Yes", no: "No" };

/**
 * Tabla de aprobación del "formato oficial" — reemplaza la lista de `Fila`
 * por documento por una tabla real con bordes (Área/Nombre/Fecha/Firma/
 * Aprobado), igual al PDF de referencia del usuario. "Nombre" se resuelve
 * vía `resolverNombre` (normalmente `useUsuariosPorId` sobre los
 * `resueltoPorId` de los pasos).
 *
 * AJUSTES (septiembre/octubre 2026), pedido explícito: "en la ventana de
 * aprobación y en los documentos en vista pdf/impresión, debe aparecer,
 * además de la información actual, en el campo 'Firma', la firma
 * manuscrita" — la columna ya no queda vacía: se resuelve el `firmaId` del
 * usuario que resolvió el paso (vía `resolverFirmaId`, opcional para no
 * romper ningún llamador existente) y se reutiliza `FirmaManuscritaUsuario`
 * (misma protección de no-copiable que en el resto de la app).
 */
function TablaAprobacion({
  pasos,
  resolverNombre,
  resolverFirmaId,
  encabezados = ENCABEZADOS_APROBACION_ES,
}: {
  pasos: PasoAprobacion[];
  resolverNombre: (id?: string) => string;
  resolverFirmaId?: (id?: string) => string | null | undefined;
  encabezados?: typeof ENCABEZADOS_APROBACION_ES;
}) {
  return (
    <table className="w-full border-collapse border border-gray-400 text-[11px]">
      <thead>
        <tr className="bg-gray-100">
          <th className="border border-gray-400 p-1.5 text-left font-semibold">{encabezados.area}</th>
          <th className="border border-gray-400 p-1.5 text-left font-semibold">{encabezados.nombre}</th>
          <th className="border border-gray-400 p-1.5 text-left font-semibold">{encabezados.fecha}</th>
          <th className="border border-gray-400 p-1.5 text-left font-semibold">{encabezados.firma}</th>
          <th className="border border-gray-400 p-1.5 text-left font-semibold">{encabezados.aprobado}</th>
        </tr>
      </thead>
      <tbody>
        {pasos.map((paso) => (
          <tr key={paso.orden}>
            <td className="border border-gray-400 p-1.5 font-medium">{paso.etiqueta}</td>
            <td className="border border-gray-400 p-1.5">{resolverNombre(paso.resueltoPorId)}</td>
            <td className="border border-gray-400 p-1.5">{paso.fecha ? formatearFecha(paso.fecha) : "—"}</td>
            <td className="border border-gray-400 p-1.5">
              {/* Una vez firmado, la firma manuscrita no debe cambiar aunque el
                  usuario actualice su firma después — se prefiere
                  `paso.firmaCongeladaId` cuando existe, y solo se cae a
                  `resolverFirmaId` (resolución en vivo) para pasos antiguos
                  aprobados antes de esta migración (ver
                  `db/agregar_inmutabilidad_documentos_firmados.sql`). */}
              {paso.estado === "aprobado" && (paso.firmaCongeladaId || resolverFirmaId) ? (
                <FirmaManuscritaUsuario firmaId={paso.firmaCongeladaId ?? resolverFirmaId?.(paso.resueltoPorId)} />
              ) : (
                <span className="text-gray-300">—</span>
              )}
            </td>
            <td className="border border-gray-400 p-1.5 font-semibold">
              {paso.estado === "aprobado" ? (
                <span className="text-emerald-700">{encabezados.si}</span>
              ) : paso.estado === "rechazado" ? (
                <span className="text-red-700">{encabezados.no}</span>
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Entrega 24 — matriz de firmas del CAF con la estructura del formato de aprobación de contrato:
 * (1) Legal; (2) aprobación según el monto (matriz de autorizaciones: "-"); (3) las demás firmas.
 * Cada línea muestra el nombre de quien firmó, su firma manuscrita (congelada) y la fecha;
 * "Líder FV y TV (local)" siempre figura como N/A. Los CAF anteriores (cadena de 4 pasos)
 * siguen imprimiéndose con `TablaAprobacion`.
 */
function MatrizFirmasCaf({
  pasos,
  resolverNombre,
  resolverFirmaId,
}: {
  pasos: PasoAprobacion[];
  resolverNombre: (id?: string) => string;
  resolverFirmaId: (id?: string) => string | null | undefined;
}) {
  const por = (tipo: string) => pasos.find((p) => p.tipoFirma === tipo);
  const Linea = ({ etiqueta, paso, noAplica }: { etiqueta: string; paso?: PasoAprobacion; noAplica?: boolean }) => (
    <tr>
      <td className="w-[34%] border border-gray-400 p-1.5 font-medium uppercase">{etiqueta}</td>
      <td className="border border-gray-400 p-1.5">{noAplica ? "N/A" : paso?.estado === "aprobado" ? resolverNombre(paso.resueltoPorId) : ""}</td>
      <td className="w-[30%] border border-gray-400 p-1.5">
        {!noAplica && paso?.estado === "aprobado" ? (
          <div className="flex flex-col gap-0.5">
            <FirmaManuscritaUsuario firmaId={paso.firmaCongeladaId ?? resolverFirmaId(paso.resueltoPorId)} />
            {paso.fecha && <span className="text-[10px] text-gray-600">{formatearFecha(paso.fecha)}</span>}
          </div>
        ) : (
          <span className="text-gray-300">{noAplica ? "N/A" : "—"}</span>
        )}
      </td>
    </tr>
  );
  const Encabezado = ({ children }: { children: React.ReactNode }) => (
    <tr>
      <th colSpan={3} className="border border-gray-400 bg-gray-100 p-1.5 text-left font-semibold uppercase">{children}</th>
    </tr>
  );
  return (
    <table className="w-full border-collapse border border-gray-400 text-[11px]" data-testid="caf-matriz-firmas-impresa">
      <thead>
        <tr>
          <th colSpan={3} className="border border-gray-400 p-1.5 text-left font-semibold uppercase">
            Autorizaciones requeridas:{" "}
            <span className="font-normal">acuda a la matriz de autorizaciones correspondiente para determinar quién debe autorizar el contrato:</span>
          </th>
        </tr>
        <tr className="bg-gray-100">
          <th className="border border-gray-400 p-1.5 text-left font-semibold">Línea de firma</th>
          <th className="border border-gray-400 p-1.5 text-left font-semibold">Nombre</th>
          <th className="border border-gray-400 p-1.5 text-left font-semibold">Firma y fecha</th>
        </tr>
      </thead>
      <tbody>
        <Encabezado>1. Dirección comercial, dirección médica y área legal/compliance</Encabezado>
        <Linea etiqueta="Legal" paso={por("legal")} />
        <Encabezado>2. Aprobación de acuerdo al monto del contrato según la matriz de autorizaciones, en su caso:</Encabezado>
        <tr>
          <td className="border border-gray-400 p-1.5 font-medium uppercase">Monto =</td>
          <td className="border border-gray-400 p-1.5">-</td>
          <td className="border border-gray-400 p-1.5">
            <span className="text-[10px] uppercase text-gray-600">Requiere autorización de:</span> -
          </td>
        </tr>
        <Encabezado>3. Se requieren además las siguientes firmas: tras obtener las siguientes firmas y la del contrato, ir al paso 4</Encabezado>
        <Linea etiqueta="Nombre de solicitante" paso={por("solicitante")} />
        <Linea etiqueta="Nombre de jefe inmediato" paso={por("jefe_inmediato")} />
        <Linea etiqueta="Nombre de director de área" paso={por("director_area")} />
        <Linea etiqueta="Compliance Officer LATAM" paso={por("compliance_officer")} />
        <Linea etiqueta="Nombre líder FV y TV (local)" noAplica />
        <Linea etiqueta="Nombre líder finanzas (local)" paso={por("lider_finanzas")} />
        <Linea etiqueta="Nombre de director general" paso={por("director_general")} />
      </tbody>
    </table>
  );
}

/** Qué casilla del «Tipo de contrato» del formato corresponde al valor guardado (el catálogo es configurable: se compara por palabras clave). */
function tipoContratoMarcado(caf: Pick<Caf, "tipoContrato" | "tipoContratoOtroEspecifique">) {
  const valor = caf.tipoContrato.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const msa = /\bmsa\b|maestro/.test(valor);
  const consultoria = !msa && /consultor/.test(valor);
  const sds = /\bsds\b/.test(valor);
  const compraventa = /compraventa/.test(valor);
  const modificacion = /modificaci/.test(valor);
  const declaracion = !modificacion && /declaraci|\bsow\b/.test(valor);
  const conocido = msa || consultoria || sds || compraventa || modificacion || declaracion;
  const otro = valor.trim() !== "" && !conocido;
  return {
    msa,
    consultoria,
    sds,
    compraventa,
    modificacion,
    declaracion,
    otro,
    otroTexto: caf.tipoContrato === "Otro" ? caf.tipoContratoOtroEspecifique : caf.tipoContrato,
  };
}

export function CuerpoCAF({
  caf,
  etiquetasCampo,
  empresaGrupo,
  pais = "",
  camposPersonalizadosDefinidos = [],
}: {
  caf: Caf;
  etiquetasCampo: EtiquetaCampo[];
  empresaGrupo: string;
  /**
   * AJUSTES (septiembre 2026): país operativo de quien diligenció el
   * documento — el mismo que se usa al crear/editar para filtrar qué campos
   * personalizados aplican (`camposAplicables`). El CAF no lo guarda como
   * campo propio (a diferencia de evento/fmv), así que el llamador lo pasa
   * explícitamente (el mismo `pais` que ya tenía disponible para el
   * formulario de edición); opcional para no romper llamadores existentes.
   */
  pais?: string;
  /** AJUSTES (septiembre 2026): opcional para no romper llamadores existentes; sin definiciones, la sección simplemente no aparece. */
  camposPersonalizadosDefinidos?: CampoPersonalizadoDefinicion[];
}) {
  const etq = (clave: string, porDefecto: string) => etiquetaEfectiva(etiquetasCampo, "caf", clave, empresaGrupo, porDefecto);
  const usuarios = useUsuariosPorId(caf.aprobaciones.map((p) => p.resueltoPorId));
  const matrizNueva = caf.aprobaciones.some((p) => p.tipoFirma);
  const modo = React.useContext(ModoVistaDocumento);
  const resolverNombre = (id?: string) => (id ? usuarios.get(id)?.nombre ?? "—" : "—");
  const resolverFirmaId = (id?: string) => (id ? usuarios.get(id)?.firmaId : null);

  // Vista de detalle (compacta): campos simples. Entrega 25: «Nombre del solicitante»,
  // «Código del documento» y «Compañía» van primero, bajo «Solicitante y director de área»;
  // «Empleado(s) responsable(s)…» es solo una etiqueta del formato impreso, no un campo.
  if (modo === "compacta") {
    return (
      <div className="flex flex-col gap-4">
        <TituloSeccion>Solicitante y director de área</TituloSeccion>
        <CampoInline etiqueta={etq("solicitanteNombre", "Nombre del solicitante")} valor={caf.solicitanteNombre} />
        <CampoInline etiqueta={etq("codigoDocumento", "Código del documento")} valor={caf.codigoDocumento} />
        <CampoInline etiqueta={etq("companiaNombre", "Compañía")} valor={caf.companiaNombre} />
        <Grilla2>
          <CampoInline etiqueta={etq("solicitanteTelefono", "Teléfono del solicitante")} valor={caf.solicitanteTelefono} />
          <CampoInline etiqueta={etq("directorAreaNombre", "Director de área")} valor={caf.directorAreaNombre} />
        </Grilla2>
        <CampoInline etiqueta={etq("directorAreaCargo", "Cargo del director de área")} valor={caf.directorAreaCargo} />

        <TituloSeccion>Contraparte</TituloSeccion>
        <Grilla2>
          <CampoInline etiqueta={etq("contraparteNombre", "Nombre de la contraparte")} valor={caf.contraparteNombre} />
          <CampoInline etiqueta="Número de documento de la contraparte" valor={caf.contraparteNumeroDocumento} />
          <CampoInline etiqueta={etq("contraparteTelefono", "Teléfono de la contraparte")} valor={caf.contraparteTelefono} />
          <CampoInline etiqueta={etq("contraparteCorreo", "Correo de la contraparte")} valor={caf.contraparteCorreo} />
          <CampoInline etiqueta={etq("contraparteContacto", "Contacto de la contraparte")} valor={caf.contraparteContacto} />
        </Grilla2>
        <CampoInline etiqueta={etq("contraparteDireccion", "Dirección de la contraparte")} valor={caf.contraparteDireccion} />
        <Grilla2>
          <CampoInline etiqueta="País de la contraparte" valor={caf.contrapartePais} />
          <CampoInline etiqueta="Estado/Provincia/Departamento de la contraparte" valor={caf.contraparteEstadoProvincia} />
        </Grilla2>
        <CampoInline etiqueta="Ciudad de la contraparte" valor={caf.contraparteCiudad} />
        {(caf.avisoAtencion || caf.avisoConCopiaPara) && (
          <Grilla2>
            <CampoInline etiqueta="Aviso, domicilio y fax — At'n" valor={caf.avisoAtencion} />
            <CampoInline etiqueta="Con copia para (depto., domicilio y fax)" valor={caf.avisoConCopiaPara} />
          </Grilla2>
        )}

        <TituloSeccion>Contrato</TituloSeccion>
        <CampoInline
          etiqueta={etq("tipoContrato", "Tipo de contrato")}
          valor={caf.tipoContrato === "Otro" ? caf.tipoContratoOtroEspecifique : caf.tipoContrato}
        />
        <CampoInline etiqueta={etq("objetoContrato", "Objeto del contrato")} valor={caf.objetoContrato} />
        <CampoInline etiqueta={etq("dueDiligence", "Due diligence")} valor={caf.dueDiligence} />
        {(caf.terminoContratoInicio || !caf.terminoContratoDeterminable) && (
          <CampoInline
            etiqueta="Término del contrato"
            valor={`${caf.terminoContratoInicio ?? ""} — ${caf.terminoContratoDeterminable ? "Determinable" : caf.terminoContratoFin ?? ""}`}
          />
        )}
        {caf.comentarios && <CampoInline etiqueta="Comentarios" valor={caf.comentarios} />}
        <NotaAdvertencia>
          <strong>Profesional de la salud:</strong> {NOTA_PROFESIONAL_SALUD_CAF}
        </NotaAdvertencia>

        <TituloSeccion>Financiero</TituloSeccion>
        <Grilla2>
          <CampoInline etiqueta={etq("monto", "Monto")} valor={formatearMonto(caf.monto, caf.moneda)} />
          <CampoInline
            etiqueta="Código de cobro"
            valor={[caf.codigoCobroCuenta, caf.codigoCobroDepto, caf.codigoCobroProd, caf.codigoCobroProyecto].filter(Boolean).join(" / ")}
          />
        </Grilla2>

        <CuerpoCamposPersonalizados
          tipoDoc="caf"
          valores={caf.camposPersonalizados}
          definiciones={camposPersonalizadosDefinidos}
          empresaGrupo={empresaGrupo}
          pais={pais}
        />
      </div>
    );
  }

  // Impresión / vista previa / PDF: estructura del «Formato de aprobación de contrato» modelo.
  const celda = "border border-gray-400 p-1.5 align-top";
  const etiquetaCelda = `${celda} bg-gray-100 font-medium uppercase`;
  const tipo = tipoContratoMarcado(caf);
  const Casilla = ({ marcada }: { marcada: boolean }) => (
    <span className="mr-1.5 inline-block w-3 text-center font-bold" aria-hidden="true">{marcada ? "☒" : "☐"}</span>
  );
  const direccionContraparte = [caf.contraparteDireccion, caf.contraparteCiudad, caf.contraparteEstadoProvincia, caf.contrapartePais].filter(Boolean).join(", ");
  const diligencias = ["Positivo", "Negativo", "N/A"];
  const coincideDiligencia = (op: string) => caf.dueDiligence.trim().toLowerCase().replace(/\s+/g, "") === op.toLowerCase().replace(/\s+/g, "");

  return (
    <div className="flex flex-col gap-3 text-[11px]" data-testid="caf-formato-oficial">
      <p className="text-[12px] font-bold uppercase">
        {etq("tipoContrato", "Tipo de contrato")}: <span className="font-normal">seleccione con una "X"</span>
      </p>
      <table className="w-full border-collapse border border-gray-400" data-testid="caf-tipos-contrato">
        <tbody>
          <tr>
            <td className={`${celda} w-1/2 uppercase`}><Casilla marcada={tipo.msa} />Contrato maestro de prestación de servicios (MSA)</td>
            <td className={`${celda} w-1/2 uppercase`}><Casilla marcada={tipo.consultoria} />Contrato de servicios de consultoría</td>
          </tr>
          <tr>
            <td className={`${celda} uppercase`}><Casilla marcada={tipo.sds} />Contratos de servicios SDS</td>
            <td className={`${celda} uppercase`}><Casilla marcada={tipo.compraventa} />Contrato de compraventa</td>
          </tr>
          <tr>
            <td colSpan={2} className={`${celda} uppercase`}>
              <Casilla marcada={tipo.modificacion} />Modificación – adjunte copia de contratos relacionados, modificaciones previas, declaraciones de trabajo activas (SOW)
            </td>
          </tr>
          <tr>
            <td colSpan={2} className={`${celda} uppercase`}>
              <Casilla marcada={tipo.declaracion} />*Declaración de trabajo – en su caso, adjunte MSA correspondiente / contrato, modificaciones, SOW previas
            </td>
          </tr>
          <tr>
            <td colSpan={2} className={celda}>
              <span className="uppercase"><Casilla marcada={tipo.otro} />Otro <span className="italic">(especifique)</span>:</span> {tipo.otro ? tipo.otroTexto : ""}
            </td>
          </tr>
        </tbody>
      </table>

      <h2 className="mt-1 text-center text-[12px] font-bold uppercase tracking-wide">Solicitante y director de área</h2>
      <table className="w-full border-collapse border border-gray-400">
        <tbody>
          <tr>
            <td className={`${etiquetaCelda} w-[22%]`}>{etq("solicitanteNombre", "Nombre del solicitante")}</td>
            <td className={celda} colSpan={5}>{caf.solicitanteNombre || "—"}</td>
          </tr>
          <tr>
            <td className={etiquetaCelda}>{etq("codigoDocumento", "Código del documento")}</td>
            <td className={celda} colSpan={5}>{caf.codigoDocumento || "—"}</td>
          </tr>
          <tr>
            <td className={etiquetaCelda}>{etq("companiaNombre", "Compañía")}</td>
            <td className={celda} colSpan={5}>{caf.companiaNombre || "—"}</td>
          </tr>
          <tr>
            <td className={etiquetaCelda}>Tel.</td>
            <td className={celda} colSpan={5}>{caf.solicitanteTelefono || "—"}</td>
          </tr>
          <tr>
            {/* Etiqueta del formato (no es un campo del formulario). */}
            <td colSpan={6} className={`${celda} uppercase`} data-testid="caf-etiqueta-responsables">
              Empleado(s) como responsable(s) principal(es) de la administración y cumplimiento del contrato{" "}
              <span className="italic">(solamente director y superiores)</span>:
              {caf.responsablesContrato ? <span className="ml-1 font-normal normal-case">{caf.responsablesContrato}</span> : null}
            </td>
          </tr>
          <tr>
            <td className={etiquetaCelda}>{etq("directorAreaNombre", "Nombre del director de área")}</td>
            <td className={celda} colSpan={3}>{caf.directorAreaNombre || "—"}</td>
            <td className={`${etiquetaCelda} w-[10%]`}>{etq("directorAreaCargo", "Cargo")}</td>
            <td className={celda}>{caf.directorAreaCargo || "—"}</td>
          </tr>
        </tbody>
      </table>

      <p className="mt-1 text-[12px] font-bold uppercase">
        Información del contrato: <span className="font-normal">lista de partes adicionales por separado</span>
      </p>
      <table className="w-full border-collapse border border-gray-400">
        <tbody>
          <tr>
            <td className={`${etiquetaCelda} w-[22%]`}>{etq("contraparteNombre", "Nombre de la compañía contraparte")}</td>
            <td className={celda} colSpan={4}>
              {caf.contraparteNombre || "—"}
              {caf.contraparteNumeroDocumento ? <span className="text-gray-600"> — Doc.: {caf.contraparteNumeroDocumento}</span> : null}
            </td>
          </tr>
          <tr>
            <td className={etiquetaCelda}>{etq("contraparteDireccion", "Dirección contraparte")}</td>
            <td className={celda} colSpan={4}>{direccionContraparte || "—"}</td>
          </tr>
          <tr>
            <td className={etiquetaCelda}>{etq("dueDiligence", "Due diligence")}</td>
            <td className={celda}>
              {diligencias.map((op) => (
                <div key={op} className="uppercase"><Casilla marcada={coincideDiligencia(op)} />{op}</div>
              ))}
            </td>
            <td className={etiquetaCelda}>Término del contrato <span className="normal-case">(DD/MM/AAAA)</span></td>
            <td className={celda}>
              <span className="font-medium uppercase">Comienzo:</span> {caf.terminoContratoInicio ? fechaAviso(caf.terminoContratoInicio) : "—"}
            </td>
            <td className={celda}>
              <span className="font-medium uppercase">Final:</span> {caf.terminoContratoDeterminable ? "Determinable" : caf.terminoContratoFin ? fechaAviso(caf.terminoContratoFin) : "—"}
            </td>
          </tr>
          <tr>
            <td className={etiquetaCelda}>{etq("contraparteTelefono", "Teléfono")}</td>
            <td className={celda}>{caf.contraparteTelefono || "—"}</td>
            <td className={etiquetaCelda}>{etq("contraparteCorreo", "Correo electrónico")}</td>
            <td className={celda} colSpan={2}>{caf.contraparteCorreo || "—"}</td>
          </tr>
          <tr>
            <td className={etiquetaCelda}>{etq("contraparteContacto", "Contacto")}:</td>
            <td className={celda} colSpan={4}>{caf.contraparteContacto || "—"}</td>
          </tr>
          <tr>
            <td className={etiquetaCelda}>Aviso, domicilio &amp; fax:</td>
            <td className={celda} colSpan={2}><span className="font-medium uppercase">At'n:</span> {caf.avisoAtencion || "—"}</td>
            <td className={celda} colSpan={2}><span className="font-medium uppercase">Con copia para (depto., domicilio &amp; fax):</span> {caf.avisoConCopiaPara || "—"}</td>
          </tr>
          <tr>
            <td className={etiquetaCelda}>{etq("objetoContrato", "Objeto del contrato")} <span className="normal-case">(obligatorio)</span></td>
            <td className={`${celda} whitespace-pre-wrap`} colSpan={4}>{caf.objetoContrato || "—"}</td>
          </tr>
          <tr>
            <td className={etiquetaCelda}>Comentarios</td>
            <td className={`${celda} whitespace-pre-wrap`} colSpan={4}>{caf.comentarios || ""}</td>
          </tr>
          <tr>
            <td className={etiquetaCelda}>Profesional de la salud</td>
            <td className={`${celda} text-justify uppercase`} colSpan={4}>{NOTA_PROFESIONAL_SALUD_CAF}</td>
          </tr>
          <tr>
            <td className={etiquetaCelda}>Total $ {etq("monto", "Monto")}</td>
            <td className={celda} colSpan={4}>{formatearMonto(caf.monto, caf.moneda)}</td>
          </tr>
          <tr>
            <td className={etiquetaCelda}>Código de cobro</td>
            <td className={celda}><span className="font-medium uppercase">Cuenta:</span> {caf.codigoCobroCuenta}</td>
            <td className={celda}><span className="font-medium uppercase">Depto:</span> {caf.codigoCobroDepto}</td>
            <td className={celda}><span className="font-medium uppercase">Prod #:</span> {caf.codigoCobroProd}</td>
            <td className={celda}><span className="font-medium uppercase">Proyecto:</span> {caf.codigoCobroProyecto}</td>
          </tr>
        </tbody>
      </table>

      <CuerpoCamposPersonalizados
        tipoDoc="caf"
        valores={caf.camposPersonalizados}
        definiciones={camposPersonalizadosDefinidos}
        empresaGrupo={empresaGrupo}
        pais={pais}
      />

      <SeccionAprobacion>
        {matrizNueva ? (
          <MatrizFirmasCaf pasos={caf.aprobaciones} resolverNombre={resolverNombre} resolverFirmaId={resolverFirmaId} />
        ) : (
          <>
            <TituloSeccion>Aprobación</TituloSeccion>
            <TablaAprobacion pasos={caf.aprobaciones} resolverNombre={resolverNombre} resolverFirmaId={resolverFirmaId} />
          </>
        )}
        <NotasAprobacionImpresa pasos={caf.aprobaciones} resolverNombre={resolverNombre} />
      </SeccionAprobacion>

      {/* Entrega 25: el texto POST-APROBACIÓN va DESPUÉS de la matriz de firmas (y de las notas de aprobación). */}
      <p className="mt-1 border border-gray-400 p-1.5 text-justify text-[10.5px]" data-testid="caf-post-aprobacion">
        {NOTA_LEGAL_CAF}
      </p>
    </div>
  );
}

export function CuerpoFMV({
  fmv,
  configuracion,
  etiquetasCampo,
  empresaGrupo,
  pais = "",
  camposPersonalizadosDefinidos = [],
}: {
  fmv: Fmv;
  configuracion: ConfiguracionFmv;
  etiquetasCampo: EtiquetaCampo[];
  empresaGrupo: string;
  /** AJUSTES (septiembre 2026): país operativo usado para filtrar campos personalizados (ver nota en `CuerpoCAF`). */
  pais?: string;
  camposPersonalizadosDefinidos?: CampoPersonalizadoDefinicion[];
}) {
  const etq = (clave: string, porDefecto: string) => etiquetaEfectiva(etiquetasCampo, "fmv", clave, empresaGrupo, porDefecto);
  const respuestas = {
    criterio1: fmv.criterio1,
    criterio2: fmv.criterio2,
    criterio3: fmv.criterio3,
    criterio4: fmv.criterio4,
    criterio5: fmv.criterio5,
    criterio6: fmv.criterio6,
  };
  const puntaje = calcularPuntajeTotal(respuestas);
  const tier = calcularTier(puntaje, configuracion.umbralTier1, configuracion.umbralTier2);
  // Corrección (octubre 2026), pedido explícito del usuario: "el campo
  // 'Firma electrónica: Sí' no hace referencia a si está firmado o no,
  // sino que debe mostrar la firma autógrafa" — se resuelve quién firmó
  // de verdad (`firmadoPorId`, con `creadoPorId` como respaldo para
  // documentos firmados antes de que existiera esa columna) y se muestra
  // su firma manuscrita en vez del texto "Sí/No".
  // Octubre 2026: se usa `||` (no `??`) porque `firmadoPorId` llega como "" —
  // no `null` — cuando la columna está vacía (`s0` en `lib/fmv.ts` convierte
  // null en ""). Con `??` el respaldo (`creadoPorId`) nunca se aplicaba y la
  // celda "Firma" quedaba sin la firma manuscrita en los FMV creados ya
  // firmados (que no guardaban `firmado_por_id`).
  const idFirmante = fmv.firmadoPorId || fmv.creadoPorId;
  const usuariosFirma = useUsuariosPorId([idFirmante]);
  const firmante = idFirmante ? usuariosFirma.get(idFirmante) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <CampoInline etiqueta={etq("nombreCompleto", "Nombre completo")} valor={fmv.nombreCompleto} />
      <CampoInline etiqueta="Número de documento" valor={fmv.numeroDocumento} />
      <CampoInline etiqueta="Fecha" valor={fmv.fecha ? formatearFecha(fmv.fecha) : "—"} />

      <TituloSeccion>Perfil del HCP</TituloSeccion>
      <Grilla2>
        <CampoInline etiqueta={etq("region", "Región")} valor={fmv.region} />
        <CampoInline etiqueta={etq("pais", "País")} valor={fmv.pais} />
        <CampoInline
          etiqueta={etq("especialidad", "Especialidad")}
          valor={fmv.especialidad === "Otra" ? fmv.especialidadOtro : fmv.especialidad}
        />
        <CampoInline etiqueta={etq("licenciaNacional", "Licencia nacional")} valor={fmv.licenciaNacional} />
      </Grilla2>
      <CampoInline
        etiqueta={etq("direccionPrincipal", "Dirección")}
        valor={`${fmv.direccionPrincipal}, ${fmv.ciudad}, ${fmv.estadoProvincia}, ${fmv.pais} ${fmv.codigoPostal}`.replace(/\s+/g, " ").trim()}
      />

      <TituloSeccion>Criterios de Fair Market Value</TituloSeccion>
      {CRITERIO_FMV_KEY.map((clave) => {
        const criterioDef = configuracion.criterios.find((c) => c.clave === clave);
        const respuesta = fmv[clave];
        return (
          <CampoInline
            key={clave}
            etiqueta={criterioDef?.titulo ?? clave}
            valor={respuesta ? `${respuesta} (${PUNTAJE_POR_RESPUESTA[respuesta]} pts)` : "—"}
          />
        );
      })}
      <Grilla2>
        <CampoInline etiqueta="Puntaje total" valor={`${puntaje} / 18`} />
        <CampoInline etiqueta="Tier" valor={tier} />
      </Grilla2>
      <Grilla2>
        <CampoInline etiqueta="¿Aplica tarifario de asociación médica / científica?" valor={fmv.aplicaTarifarioAsociacion ? "Sí" : "No"} />
        <CampoInline etiqueta="CV adjunto" valor={fmv.cvAdjunto ? "Sí" : "No"} />
      </Grilla2>
      {fmv.aplicaTarifarioAsociacion && (
        <Grilla2>
          <CampoInline etiqueta="Asociación médica / científica" valor={fmv.asociacionCientifica} />
          <CampoInline etiqueta="Tarifario de la asociación (archivo adjunto)" valor={fmv.archivoTarifarioAsociacionId ? "Sí" : "No"} />
        </Grilla2>
      )}
      {fmv.comentariosAdicionales && <CampoInline etiqueta="Comentarios adicionales" valor={fmv.comentariosAdicionales} />}

      <CuerpoCamposPersonalizados
        tipoDoc="fmv"
        valores={fmv.camposPersonalizados}
        definiciones={camposPersonalizadosDefinidos}
        empresaGrupo={empresaGrupo}
        pais={pais}
      />

      <TituloSeccion>Certificación</TituloSeccion>
      <Grilla2>
        <CampoInline etiqueta={etq("medicalName", "Nombre de quien certifica")} valor={fmv.medicalName} />
        <CampoInline etiqueta={etq("medicalRole", "Cargo de quien certifica")} valor={fmv.medicalRole} />
      </Grilla2>
      <Grilla2>
        <CampoInline etiqueta="Fecha de firma" valor={fmv.fechaFirma ? formatearFecha(fmv.fechaFirma) : "—"} />
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Firma</span>
          {(fmv.fechaFirma || fmv.estado === "Completado") && (fmv.firmaCongeladaId || firmante) ? (
            <FirmaManuscritaUsuario firmaId={fmv.firmaCongeladaId ?? firmante?.firmaId} />
          ) : (
            <span className="text-sm">—</span>
          )}
        </div>
      </Grilla2>
    </div>
  );
}

export function CuerpoNotificacionPago({
  notificacion,
  etiquetasCampo,
  empresaGrupo,
  pais = "",
  camposPersonalizadosDefinidos = [],
}: {
  notificacion: NotificacionPagoHcp;
  etiquetasCampo: EtiquetaCampo[];
  empresaGrupo: string;
  /** AJUSTES (septiembre 2026): país operativo usado para filtrar campos personalizados (ver nota en `CuerpoCAF`). */
  pais?: string;
  camposPersonalizadosDefinidos?: CampoPersonalizadoDefinicion[];
}) {
  const etq = (clave: string, porDefecto: string) => etiquetaEfectiva(etiquetasCampo, "notificacionPago", clave, empresaGrupo, porDefecto);
  // Ver nota larga sobre esta resolución en `CuerpoFMV`, mismo patrón.
  const idFirmante = notificacion.firmadoPorId || notificacion.creadoPorId; // `||`: ver nota en CuerpoFMV
  const usuariosFirma = useUsuariosPorId([idFirmante]);
  const firmante = idFirmante ? usuariosFirma.get(idFirmante) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <TituloSeccion>Identificación del HCP</TituloSeccion>
      <Grilla2>
        <CampoInline etiqueta={etq("nombreProfesionalSalud", "Nombre del profesional de la salud")} valor={notificacion.nombreProfesionalSalud} />
        <CampoInline etiqueta={etq("numeroDocumentoIdentidad", "Número de documento de identidad")} valor={notificacion.numeroDocumentoIdentidad} />
      </Grilla2>
      <CampoInline etiqueta={etq("cedulaLicenciaProfesional", "Número de cédula profesional o licencia")} valor={notificacion.cedulaLicenciaProfesional} />
      <CampoInline etiqueta={etq("productos", "Productos")} valor={notificacion.productos} />

      <TituloSeccion>Factura</TituloSeccion>
      <Grilla2>
        <CampoInline etiqueta={etq("numeroFactura", "Número de factura")} valor={notificacion.numeroFactura} />
        <CampoInline
          etiqueta={etq("fechaFactura", "Fecha de factura")}
          valor={notificacion.fechaFactura ? formatearFecha(notificacion.fechaFactura) : "—"}
        />
      </Grilla2>
      <CampoInline
        etiqueta={etq("valorFactura", "Valor de la factura")}
        valor={notificacion.valorFactura != null ? formatearMonto(notificacion.valorFactura, notificacion.monedaFactura ?? "") : "—"}
      />
      <CampoInline
        etiqueta="Detalle de la factura"
        valor={[
          notificacion.facturaIncluyePagoHcp ? "Incluye pago al HCP" : null,
          notificacion.facturaIncluyePagoInstitucion ? "Incluye pago a la institución" : null,
          notificacion.facturaEsPagoTercero ? "Pago realizado por un tercero" : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      />
      <CampoInline etiqueta="Factura (archivo adjunto)" valor={notificacion.facturaId ? "Sí" : "No"} />

      <CuerpoCamposPersonalizados
        tipoDoc="notificacionPago"
        valores={notificacion.camposPersonalizados}
        definiciones={camposPersonalizadosDefinidos}
        empresaGrupo={empresaGrupo}
        pais={pais}
      />

      <TituloSeccion>Certificación</TituloSeccion>
      <Grilla2>
        <CampoInline etiqueta={etq("medicalName", "Nombre de quien certifica")} valor={notificacion.medicalName} />
        <CampoInline etiqueta={etq("medicalRole", "Cargo de quien certifica")} valor={notificacion.medicalRole} />
      </Grilla2>
      <Grilla2>
        <CampoInline etiqueta="Fecha de firma" valor={notificacion.fechaFirma ? formatearFecha(notificacion.fechaFirma) : "—"} />
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Firma</span>
          {(notificacion.fechaFirma || notificacion.estado === "Completado") && (notificacion.firmaCongeladaId || firmante) ? (
            <FirmaManuscritaUsuario firmaId={notificacion.firmaCongeladaId ?? firmante?.firmaId} />
          ) : (
            <span className="text-sm">—</span>
          )}
        </div>
      </Grilla2>
    </div>
  );
}

/**
 * Octubre 2026, pedido explícito: "Agenda de la reunión" debe verse en varias
 * líneas, simulando una tabla (así como se diligenció, con "|" como separador
 * de columnas). Cada línea del texto pasa a ser una fila y cada tramo entre
 * "|" una celda; si el texto no usa "|", se conservan los saltos de línea.
 */
function AgendaEnTabla({ texto }: { texto: string }) {
  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lineas.length === 0) return <>—</>;
  if (!lineas.some((l) => l.includes("|"))) {
    return <span className="block whitespace-pre-wrap">{lineas.join("\n")}</span>;
  }
  const filas = lineas.map((l) => l.split("|").map((c) => c.trim()));
  const columnas = Math.max(...filas.map((f) => f.length));
  return (
    <table className="mt-1 w-full border-collapse border border-gray-400 text-[11px] font-normal">
      <tbody>
        {filas.map((celdas, i) => (
          <tr key={i} className={i === 0 ? "bg-gray-100 font-semibold" : undefined}>
            {Array.from({ length: columnas }, (_, c) => (
              <td key={c} className="border border-gray-400 p-1 align-top">{celdas[c] ?? ""}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Cantidad de sesiones vinculadas y una línea por sesión (fecha y lugar). Ver `sesionesVinculadasDeConvenio`. */
function SesionesVinculadasConvenio({ eventoOrigenId, sesionIds }: { eventoOrigenId: string | null; sesionIds: string[] }) {
  const [info, setInfo] = React.useState<SesionesVinculadas | null>(null);
  const clave = sesionIds.join(",");
  React.useEffect(() => {
    if (!eventoOrigenId) {
      setInfo(null);
      return;
    }
    let cancelado = false;
    traerEventoConSesionesPorId(eventoOrigenId)
      .then((ev) => { if (!cancelado) setInfo(ev ? sesionesVinculadasDeConvenio(ev, sesionIds) : null); })
      .catch(() => { if (!cancelado) setInfo(null); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventoOrigenId, clave]);

  if (!info) return <>{sesionIds.length > 0 ? `${sesionIds.length} sesión(es)` : "—"}</>;
  return (
    <span className="block">
      <span className="font-semibold">{info.cantidad}</span> sesión(es)
      <span className="mt-0.5 flex flex-col gap-0.5">
        {info.lineas.map((linea, i) => (
          <span key={i} className="block">• {linea}</span>
        ))}
      </span>
    </span>
  );
}

export function CuerpoConvenio({
  convenio,
  empresaGrupo = "",
  pais = "",
  camposPersonalizadosDefinidos = [],
}: {
  convenio: Convenio;
  /** AJUSTES (septiembre 2026): opcionales para no romper llamadores existentes — habilitan los campos personalizados. */
  empresaGrupo?: string;
  pais?: string;
  camposPersonalizadosDefinidos?: CampoPersonalizadoDefinicion[];
}) {
  const usuarios = useUsuariosPorId(convenio.aprobaciones.map((p) => p.resueltoPorId));
  const pasoDirectorMedico = convenio.aprobaciones.find((p) => p.rolRequerido === "medica");
  const directorMedicoFirmo = pasoDirectorMedico?.estado === "aprobado";
  const directorMedico = directorMedicoFirmo ? usuarios.get(pasoDirectorMedico?.resueltoPorId ?? "") : undefined;
  const scoreFmv = leerScoreFmv(convenio.camposPersonalizados);

  return (
    <div className="flex flex-col gap-4">
      <TituloSeccion>Actividad y responsable</TituloSeccion>
      <Grilla2>
        <CampoInline etiqueta="Empleado responsable" valor={convenio.empleadoResponsableNombreCargo} />
        <CampoInline etiqueta="Departamento" valor={convenio.departamento} />
        <CampoInline etiqueta="Unidad de negocio / ubicación" valor={convenio.unidadNegocioUbicacion} />
        <CampoInline etiqueta="Tipo de actividad" valor={convenio.tipoActividad} />
        <CampoInline etiqueta="Organizado por" valor={convenio.organizadoPor} />
        <CampoInline etiqueta="Nombre del organizador" valor={convenio.organizador} />
        <CampoInline etiqueta="Tipo de servicio" valor={convenio.tipoServicio} />
        <CampoInline etiqueta="Evento / servicio" valor={convenio.nombreEventoServicio} />
        <CampoInline etiqueta="Fechas de la actividad" valor={[convenio.fechaInicioActividad, convenio.fechaFinActividad].filter(Boolean).join(" — ")} />
        <CampoInline etiqueta="Lugar de la reunión" valor={convenio.lugarReunion} />
      </Grilla2>
      <CampoInline etiqueta="Agenda de la reunión" valor={convenio.agendaReunion ? <AgendaEnTabla texto={convenio.agendaReunion} /> : ""} />
      <CampoInline etiqueta="Agenda de la reunión (archivo adjunto)" valor={convenio.archivoAgendaId ? "Sí" : "No"} />

      <TituloSeccion>HCP</TituloSeccion>
      <Grilla2>
        <CampoInline etiqueta="Nombre completo" valor={convenio.hcpNombreCompleto} />
        <CampoInline etiqueta="Número de documento" valor={convenio.hcpNumeroDocumento} />
        <CampoInline etiqueta="Cédula / licencia" valor={convenio.hcpCedulaLicencia} />
        <CampoInline etiqueta="RFC" valor={convenio.hcpRFC} />
        <CampoInline etiqueta="Especialidad" valor={convenio.hcpEspecialidad} />
      </Grilla2>
      <CampoInline
        etiqueta="Dirección"
        valor={`${convenio.hcpDireccion}, ${convenio.hcpCiudad}, ${convenio.hcpEstadoProvincia}, ${convenio.hcpPais}`}
      />

      {convenio.esConsejoAsesores && (
        <>
          <TituloSeccion>Consejo de Asesores</TituloSeccion>
          <CampoInline etiqueta="Título" valor={convenio.tituloConsejoAsesores} />
          <Grilla2>
            <CampoInline etiqueta="Número de HCPs" valor={convenio.numeroHCPConsejo} />
            <CampoInline etiqueta="Justificación" valor={convenio.justificacionNumeroHCP} />
          </Grilla2>
        </>
      )}

      {convenio.esFuncionarioGobierno && (
        <>
          <TituloSeccion>Funcionario de Gobierno</TituloSeccion>
          <CampoInline
            etiqueta="Supuestos aplicables"
            valor={[
              convenio.supuestoCargoImportante ? "Cargo importante" : null,
              convenio.supuestoRepresentanteCompras ? "Representante de compras" : null,
              convenio.supuestoInfluenciaDecisionGubernamental ? "Influencia en decisión gubernamental" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
        </>
      )}

      <TituloSeccion>Objetivo y contraprestación</TituloSeccion>
      <CampoInline etiqueta="Objetivo" valor={convenio.objetivo} />
      <CampoInline etiqueta="Criterios de selección" valor={convenio.criteriosSeleccion} />
      {/* Entrega 20, pedido explícito: "Sesiones de participación vinculadas"
          (número de sesiones y detalle) va en esta sección, en una línea nueva
          después de "Criterios de selección" (antes estaba en "Actividad y
          responsable"). */}
      <CampoInline
        etiqueta="Sesiones de participación vinculadas"
        valor={<SesionesVinculadasConvenio eventoOrigenId={convenio.eventoOrigenId} sesionIds={convenio.sesionesParticipacionIds} />}
      />
      {/* Entrega 20, pedido explícito: el score va ANTES de "Contraprestación al HCP". */}
      <CampoInline etiqueta="Score total FMV Checklist" valor={textoScoreFmv(scoreFmv)} />
      <Grilla2>
        <CampoInline
          etiqueta="Contraprestación al HCP"
          valor={convenio.contraprestacionHCP != null ? formatearMonto(convenio.contraprestacionHCP, convenio.monedaContraprestacion) : "—"}
        />
        <CampoInline etiqueta="CV adjunto" valor={convenio.cvAdjunto ? "Sí" : "No"} />
      </Grilla2>
      {/* Octubre 2026, pedido explícito: la justificación se muestra tanto si la
          respuesta fue Sí como si fue No (antes solo aparecía con "No"). */}
      <CampoInline
        etiqueta="Consistente con tabulador de tarifas"
        valor={[convenio.consistenteTabuladorTarifas ? "Sí" : "No", convenio.explicacionSiNoConsistente.trim()].filter(Boolean).join(" — ")}
      />
      {(convenio.cateringNombreServicio || convenio.contraprestacionCatering) && (
        <CampoInline
          etiqueta="Catering"
          valor={`${convenio.cateringNombreServicio}${convenio.contraprestacionCatering != null ? ` — ${formatearMonto(convenio.contraprestacionCatering, convenio.monedaContraprestacion)}` : ""}`}
        />
      )}
      <div className="flex flex-col gap-1">
        <CampoInline
          etiqueta="Certificación del empleado responsable"
          valor={convenio.firmaEmpleadoCertifica ? TEXTO_CERTIFICACION_EMPLEADO_CONVENIO : "No certificado"}
        />
        {/* Octubre 2026: firma del Director Médico (además de la que aparece en la
            matriz de aprobación) cuando el documento ya fue firmado por esa etapa. */}
        {convenio.firmaEmpleadoCertifica && directorMedicoFirmo && pasoDirectorMedico && (
          <div className="mt-1 flex flex-col gap-0.5">
            <FirmaManuscritaUsuario firmaId={pasoDirectorMedico.firmaCongeladaId ?? directorMedico?.firmaId} />
            <span className="text-[12px] font-semibold">{directorMedico?.nombre ?? "—"}</span>
            <span className="text-[11px] text-muted-foreground">Director Médico{pasoDirectorMedico.fecha ? ` · ${formatearFecha(pasoDirectorMedico.fecha)}` : ""}</span>
          </div>
        )}
      </div>

      {convenio.advertenciaFuncionarioGobiernoConfirmada && (
        <NotaAdvertencia>
          A modo de referencia, se ha señalado que {convenio.hcpNombreCompleto}
          {convenio.hcpEspecialidad ? `; ${convenio.hcpEspecialidad}` : ""} es un funcionario de gobierno
          {[
            convenio.supuestoCargoImportante ? "con un cargo de importancia" : null,
            convenio.supuestoRepresentanteCompras ? "representante de compras, comprador o miembro de comité de compras/adquisiciones" : null,
            convenio.supuestoInfluenciaDecisionGubernamental
              ? "con influencia en decisiones de una agencia gubernamental, entidad, centro de salud, institución, sistema, universidad, organismo público u hospital"
              : null,
          ]
            .filter(Boolean)
            .map((texto, i) => ` ${i > 0 ? "y " : ""}${texto}`)
            .join("")}
          . El solicitante optó por continuar la solicitud pese a esta advertencia — referencia para que los
          responsables de la matriz de aprobación decidan aprobar o rechazar el convenio.
        </NotaAdvertencia>
      )}

      <CuerpoCamposPersonalizados
        tipoDoc="convenio"
        valores={convenio.camposPersonalizados}
        definiciones={camposPersonalizadosDefinidos}
        empresaGrupo={empresaGrupo}
        pais={pais}
      />

      <SeccionAprobacion>
        <TituloSeccion>Aprobación</TituloSeccion>
        <TablaAprobacion pasos={convenio.aprobaciones} resolverNombre={(id) => (id ? usuarios.get(id)?.nombre ?? "—" : "—")} resolverFirmaId={(id) => (id ? usuarios.get(id)?.firmaId : null)} />
        <NotasAprobacionImpresa pasos={convenio.aprobaciones} resolverNombre={(id) => (id ? usuarios.get(id)?.nombre ?? "—" : "—")} />
      </SeccionAprobacion>
    </div>
  );
}

export function CuerpoEvento({
  evento,
  empresaGrupo = "",
  pais = "",
  camposPersonalizadosDefinidos = [],
}: {
  evento: Evento;
  /** AJUSTES (septiembre 2026): opcionales para no romper llamadores existentes — habilitan los campos personalizados. */
  empresaGrupo?: string;
  pais?: string;
  camposPersonalizadosDefinidos?: CampoPersonalizadoDefinicion[];
}) {
  const total = totalCondensado(evento);
  const usuarios = useUsuariosPorId(evento.aprobaciones.map((p) => p.resueltoPorId));

  return (
    <div className="flex flex-col gap-4">
      <TituloSeccion>Solicitante y evento</TituloSeccion>
      <CampoInline etiqueta="Nombre de quien solicita" valor={evento.nombreSolicitante} />
      <CampoInline
        etiqueta="Nombre y firma del superior que aprueba (Unidad de Negocio)"
        valor={evento.nombreSuperiorAprueba}
        advertirSiVacio
      />
      <CampoInline etiqueta="Empresa del grupo que realizará el gasto" valor={evento.empresaGrupo} />
      <Grilla2>
        <CampoInline etiqueta="Tipo de evento" valor={evento.tipoEvento} />
        <CampoInline etiqueta="Área de especialidad médica" valor={evento.areaEspecialidad} />
      </Grilla2>
      <CampoInline etiqueta="Línea terapéutica" valor={evento.lineaTerapeutica} />
      <CampoInline etiqueta="Nombre del evento" valor={evento.nombreEvento} />
      <Grilla2>
        <CampoInline etiqueta="Organizado por" valor={evento.organizadoPor} />
        <CampoInline etiqueta="Nombre del organizador" valor={evento.nombreOrganizador} />
      </Grilla2>
      <CampoInline etiqueta="Objetivos del evento" valor={evento.objetivosEvento} />
      {evento.modalidadSesiones !== "Varias sesiones" && (
        <CampoInline
          etiqueta="Lista de asistencia"
          valor={evento.listaAsistenciaNoAplica ? `No aplica — ${evento.listaAsistenciaNoAplicaMotivo}` : "Aplica"}
        />
      )}

      <TituloSeccion>Participación, presupuesto aprobado y anexos</TituloSeccion>
      <CampoInline etiqueta="Centro de costos" valor={evento.centroCostos} />
      <Grilla2>
        <CampoInline etiqueta="¿Incluido en presupuesto aprobado?" valor={evento.incluidoPresupuestoAprobado ? "Sí" : "No"} />
        <CampoInline
          etiqueta="Monto del presupuesto aprobado"
          valor={evento.montoPresupuestoAprobado != null ? formatearMonto(evento.montoPresupuestoAprobado, evento.moneda) : "—"}
        />
        <CampoInline etiqueta="Anexos" valor={evento.anexos ? evento.descripcionAnexos || "Sí" : "No"} />
        {evento.anexos && (
          <CampoInline
            etiqueta="Documentos anexos cargados"
            valor={[
              evento.cartaInvitacionId ? "Carta de invitación" : null,
              evento.programaAcademicoId ? "Programa académico" : null,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          />
        )}
      </Grilla2>

      <TituloSeccion>Cuota de inscripción</TituloSeccion>
      <Grilla2>
        <CampoInline
          etiqueta="Monto"
          valor={evento.inscripcionNoAplica ? "No aplica" : evento.montoInscripcion != null ? formatearMonto(evento.montoInscripcion, evento.moneda) : "—"}
        />
        <CampoInline etiqueta="Detalle" valor={evento.detalleInscripcion} />
      </Grilla2>
      <Grilla2>
        <CampoInline
          etiqueta="¿Incluye actividad adicional?"
          valor={evento.actividadAdicionalInscripcion ? `Sí — ${evento.detalleActividadAdicional}` : "No"}
        />
        <CampoInline
          etiqueta="¿Incluye alguna actividad?"
          valor={evento.actividadIncluidaInscripcion ? `Sí — ${evento.detalleActividadIncluida}` : "No"}
        />
      </Grilla2>


      {/* AJUSTES (septiembre 2026): "Datos del HCP relacionado" se renombró a
          "Nombre completo del HCP relacionado" y ahora depende de "¿Habrá
          patrocinio / pago de viáticos a un HCP?" — ver el bloque condicional
          más abajo, junto a los demás datos nuevos del HCP relacionado. */}
      <TituloSeccion>Patrocinio / pago de viáticos a HCP</TituloSeccion>
      <CampoInline etiqueta="Patrocinio / pago de viáticos a HCP" valor={evento.patrocinioHcp ? "Sí" : "No"} />
      {evento.patrocinioHcp && (
        <>
          <CampoInline etiqueta="Nombre completo del HCP relacionado" valor={evento.datosHCP} />
          <Grilla2>
            <CampoInline etiqueta="Número de documento del HCP relacionado" valor={evento.hcpNumeroDocumento} />
            <CampoInline etiqueta="Profesión del HCP relacionado" valor={evento.hcpProfesion} />
          </Grilla2>
          <Grilla2>
            <CampoInline etiqueta="Especialidad del HCP relacionado" valor={evento.hcpEspecialidad} />
            <CampoInline etiqueta="Dirección del HCP relacionado" valor={evento.hcpDireccion} />
          </Grilla2>
          <CampoInline
            etiqueta="País/Estado/Ciudad del HCP relacionado"
            valor={`${evento.hcpPais}, ${evento.hcpEstadoProvincia}, ${evento.hcpCiudad}`}
          />
          <Grilla2>
            <CampoInline etiqueta="Teléfono del HCP relacionado" valor={evento.hcpTelefono} />
            <CampoInline etiqueta="Email del HCP relacionado" valor={evento.hcpEmail} />
          </Grilla2>
          <CampoInline etiqueta="Justificación de patrocinio / pago de viáticos" valor={evento.justificacionViaticos} />
        </>
      )}


      <TituloSeccion>Participación académica</TituloSeccion>
      <CampoInline
        etiqueta="Participación académica"
        valor={
          evento.participacionAcademica
            ? `Sí — ${[descripcionQuienDicta(evento), evento.detalleParticipacionAcademica].filter(Boolean).join(" — ")}`
            : "No"
        }
      />

      <TituloSeccion>Fechas, modalidad y lugar</TituloSeccion>
      <Grilla2>
        <CampoInline etiqueta="Fecha del evento" valor={[evento.fechaInicioEvento, evento.fechaFinEvento].filter(Boolean).join(" — ")} />
        <CampoInline etiqueta="Fechas de estancia" valor={[evento.fechaInicioEstancia, evento.fechaFinEstancia].filter(Boolean).join(" — ")} />
      </Grilla2>
      <Grilla2>
        {/* CORRECCIÓN (septiembre/octubre 2026), pedido explícito: mismo tipo de
            bug que "Transportación" (ver comentario más arriba) — el campo real
            en el formulario (`FormularioEvento.tsx`, `datos.modalidadEvento`,
            sección "Fechas, modalidad y lugar") se renombró de "Modalidad" a
            "Formato" hace varias rondas; el impreso seguía mostrando el nombre
            viejo. */}
        <CampoInline etiqueta="Formato" valor={evento.modalidadEvento} />
        <CampoInline
          etiqueta="¿Única sesión o varias sesiones?"
          valor={
            evento.modalidadSesiones === "Varias sesiones"
              ? `Varias sesiones${evento.numeroSesiones != null ? ` (${evento.numeroSesiones})` : ""}`
              : "Única sesión"
          }
        />
      </Grilla2>
      <CampoInline
        etiqueta="Dirección, país, ciudad"
        valor={ubicacionTexto([evento.direccion, evento.ciudad, evento.estadoProvincia, evento.pais])}
      />
      <CampoInline etiqueta="Número de asistentes esperados" valor={evento.numeroAsistentes} />

      <CampoInline
        etiqueta="Muestras médicas"
        valor={
          evento.entregaMuestrasMedicas
            ? `Sí — ${[
                evento.detalleMuestrasMedicas,
                evento.muestrasPlaneadas
                  .map((m) => `${m.nombreProducto}${m.cantidadAproximada != null ? ` (${m.cantidadAproximada})` : ""}`)
                  .join(", "),
              ]
                .filter(Boolean)
                .join(" — ")}`
            : "No"
        }
      />
      <CampoInline
        etiqueta="Artículos promocionales"
        valor={evento.entregaArticulosPromocionales ? `Sí — ${evento.detalleArticulosPromocionales}` : "No"}
      />
      {evento.modalidadSesiones === "Varias sesiones" && evento.sesiones.length > 0 && (
        <>
          <TituloSeccion>Sesiones</TituloSeccion>
          {evento.sesiones.map((s, i) => (
            <div key={s.id} className="flex flex-col gap-1">
              <CampoInline
                etiqueta={`Sesión ${i + 1}`}
                valor={`${ubicacionTexto([s.lugar, s.ciudad, s.estadoProvincia, s.pais])}${s.fecha ? ` — ${formatearFecha(s.fecha)}` : ""}${s.numeroAsistentesEsperados != null ? ` — ${s.numeroAsistentesEsperados} asistentes esperados` : ""}`}
              />
              <CampoInline
                etiqueta="Lista de asistencia"
                valor={s.listaAsistenciaNoAplica ? `No aplica — ${s.listaAsistenciaNoAplicaMotivo}` : "Aplica"}
              />
            </div>
          ))}
        </>
      )}

      {(["interno", "externo"] as const).map((tipoBloque) => {
        const delTipo = evento.speakersParticipacion.filter((sp) => sp.tipo === tipoBloque);
        if (delTipo.length === 0) return null;
        const esInternoBloque = tipoBloque === "interno";
        return (
        <React.Fragment key={tipoBloque}>
          <TituloSeccion>{esInternoBloque ? "Speakers internos" : "Speakers externos"}</TituloSeccion>
          {delTipo.map((sp, i) => (
            <div key={sp.id} className="flex flex-col gap-1 border-b border-gray-200 pb-2">
              <p className="text-[12px] font-semibold uppercase">
                Speaker {esInternoBloque ? "interno" : "externo"} {i + 1} — {sp.nombreSpeaker || "(sin nombre)"}
              </p>
              {!esInternoBloque && (
              <Grilla2>
                <CampoInline
                  etiqueta="Monto de inscripción"
                  valor={sp.montoInscripcion != null ? formatearMonto(sp.montoInscripcion, evento.moneda) : "—"}
                />
                <CampoInline
                  etiqueta="Monto de honorarios"
                  valor={sp.montoHonorarios != null ? formatearMonto(sp.montoHonorarios, evento.moneda) : "—"}
                />
                {(sp.montoInscripcion ?? 0) > 0 && (
                  <CampoInline etiqueta="Cuota de inscripción — lo que incluye" valor={sp.detalleInscripcion} />
                )}
                {(sp.montoHonorarios ?? 0) > 0 && (
                  <CampoInline etiqueta="Honorarios de speaker — lo que incluye" valor={sp.detalleHonorarios} />
                )}
                <CampoInline etiqueta="Modalidad de factura" valor={sp.facturaModalidad} />
              </Grilla2>
              )}
              {sp.presupuestos.map((p, j) => (
                <div key={p.id} className="ml-3 mt-1 flex flex-col gap-1 rounded border border-gray-100 p-2">
                  <p className="text-[11px] font-semibold text-gray-500">
                    {p.sesionId ? `Presupuesto — sesión ${evento.sesiones.findIndex((s) => s.id === p.sesionId) + 1}` : `Presupuesto ${sp.presupuestos.length > 1 ? j + 1 : ""}`}
                  </p>
                  <Grilla2>
                    <CampoInline
                      etiqueta="Transporte"
                      valor={p.transporteNoAplica ? "No aplica" : `${p.tipoTransporte} — ${formatearMonto(costoTransporteSpeaker(p), evento.moneda)}`}
                    />
                    <CampoInline etiqueta="Taxi/Traslado" valor={p.taxi ? formatearMonto(costoTrasladoTaxiSpeaker(p), evento.moneda) : "No"} />
                    <CampoInline
                      etiqueta="Hospedaje"
                      valor={p.hospedajeNoAplica ? "No aplica" : `${p.nombreHotel} — ${formatearMonto(costoHospedajeSpeaker(p), evento.moneda)}`}
                    />
                    <CampoInline
                      etiqueta="Alimentos"
                      valor={p.alimentosNoAplica ? "No aplica" : formatearMonto(costoAlimentosSpeaker(p), evento.moneda)}
                    />
                  </Grilla2>
                </div>
              ))}
            </div>
          ))}
        </React.Fragment>
        );
      })}

      {evento.modalidadSesiones === "Varias sesiones" && evento.sesiones.length > 0 ? (
        <>
          {/*
           * Fase 5 (post-reconstrucción, séptima entrega) — en "Varias
           * sesiones" cada sesión trae su propio presupuesto de
           * transporte/hospedaje/alimentos (`SesionEvento.presupuesto`, ver
           * types.ts) y hasta esta entrega el cuerpo impreso solo mostraba
           * los campos de nivel de documento (que en ese modo quedan
           * vacíos) — el detalle real de cada sesión no aparecía en el PDF.
           * Corregido para reflejar, sesión por sesión, exactamente lo que
           * ya se ve en el PDF de referencia del usuario
           * ("TRANSPORTE/HOSPEDAJE/ALIMENTOS POR SESIÓN"), reutilizando
           * las mismas fórmulas de subtotal de `lib/presupuestoEvento.ts`
           * que ya usa el condensado del costo total.
           *
           * CORRECCIÓN (septiembre/octubre 2026), pedido explícito: "no usamos
           * un campo ni una etiqueta llamada 'TRANSPORTACIÓN', pero el pdf [...]
           * aun lo muestra así, cuando en realidad el nombre es diferente" — el
           * campo/etiqueta real en el formulario (`FormularioEvento.tsx`,
           * `datos.tipoTransporte`/`montoTransporte`/etc., sección "Transporte,
           * hospedaje y alimentos") es "Transporte", no "Transportación". Se
           * corrige aquí y en los otros 3 lugares de este archivo que todavía
           * decían "Transportación".
           */}
          <TituloSeccion>Transporte por sesión</TituloSeccion>
          {evento.sesiones.map((s, i) => {
            const p = s.presupuesto ?? presupuestoSesionVacio();
            return (
              <div key={s.id} className="flex flex-col gap-1">
                <p className="text-[12px] font-semibold uppercase">
                  Sesión {i + 1} — {s.lugar || "—"}
                </p>
                {p.transporteNoAplica ? (
                  <CampoInline etiqueta="Transporte" valor="No aplica" />
                ) : (
                  <Grilla2>
                    <CampoInline etiqueta="Tipo de transporte" valor={p.tipoTransporte} />
                    <CampoInline etiqueta="Subtotal" valor={formatearMonto(costoTransporteSesion(p), evento.moneda)} />
                  </Grilla2>
                )}
              </div>
            );
          })}

          <TituloSeccion>Hospedaje por sesión</TituloSeccion>
          {evento.sesiones.map((s, i) => {
            const p = s.presupuesto ?? presupuestoSesionVacio();
            return (
              <div key={s.id} className="flex flex-col gap-1">
                <p className="text-[12px] font-semibold uppercase">
                  Sesión {i + 1} — {s.lugar || "—"}
                </p>
                {p.hospedajeNoAplica ? (
                  <CampoInline etiqueta="Hospedaje" valor="No aplica" />
                ) : (
                  <>
                    <Grilla2>
                      <CampoInline etiqueta="Hotel" valor={`${p.nombreHotel} — ${p.categoriaHotel}`} />
                      <CampoInline etiqueta="Número de noches" valor={p.numeroNoches} />
                    </Grilla2>
                    <Grilla2>
                      <CampoInline
                        etiqueta="Costo por noche/persona"
                        valor={p.costoNochePersona != null ? formatearMonto(p.costoNochePersona, evento.moneda) : "—"}
                      />
                      <CampoInline etiqueta="Subtotal" valor={formatearMonto(costoHospedajeSesion(p), evento.moneda)} />
                    </Grilla2>
                  </>
                )}
              </div>
            );
          })}

          <TituloSeccion>Alimentos por sesión</TituloSeccion>
          {evento.sesiones.map((s, i) => {
            const p = s.presupuesto ?? presupuestoSesionVacio();
            return (
              <div key={s.id} className="flex flex-col gap-1">
                <p className="text-[12px] font-semibold uppercase">
                  Sesión {i + 1} — {s.lugar || "—"}
                </p>
                {p.alimentosNoAplica ? (
                  <CampoInline etiqueta="Alimentos" valor="No aplica" />
                ) : (
                  <Grilla2>
                    <CampoInline
                      etiqueta="Monto por día"
                      valor={p.montoAlimentosDia != null ? `${formatearMonto(p.montoAlimentosDia, evento.moneda)} / día` : "—"}
                    />
                    <CampoInline etiqueta="Subtotal" valor={formatearMonto(costoAlimentosSesion(p), evento.moneda)} />
                  </Grilla2>
                )}
              </div>
            );
          })}
        </>
      ) : (
        <>
          <TituloSeccion>Transporte</TituloSeccion>
          {evento.transporteNoAplica ? (
            <CampoInline etiqueta="Transporte" valor="No aplica" />
          ) : (
            <Grilla2>
              <CampoInline etiqueta="Tipo de transporte" valor={evento.tipoTransporte} />
              <CampoInline etiqueta="Monto de transporte" valor={evento.montoTransporte != null ? formatearMonto(evento.montoTransporte, evento.moneda) : "—"} />
              <CampoInline etiqueta="¿Acorde a política?" valor={evento.transporteAcordePolitica ? "Sí" : `No — ${evento.transporteMotivoNoAcorde}`} />
              <CampoInline etiqueta="Cotización adjunta" valor={evento.cotizacionAdjunta ? "Sí" : "No"} />
              <CampoInline
                etiqueta="Taxi/Traslado"
                valor={evento.taxi ? (evento.valorEstimadoTaxi != null ? formatearMonto(evento.valorEstimadoTaxi, evento.moneda) : "Sí") : "No"}
              />
            </Grilla2>
          )}

          <TituloSeccion>Hospedaje</TituloSeccion>
          {evento.hospedajeNoAplica ? (
            <CampoInline etiqueta="Hospedaje" valor="No aplica" />
          ) : (
            <Grilla2>
              <CampoInline etiqueta="Hotel" valor={`${evento.nombreHotel} — ${evento.categoriaHotel}`} />
              <CampoInline etiqueta="¿Acorde a política?" valor={evento.hospedajeAcordePolitica ? "Sí" : `No — ${evento.hospedajeMotivoNoAcorde}`} />
              <CampoInline etiqueta="Noches" valor={evento.numeroNoches} />
              <CampoInline etiqueta="Costo por noche/persona" valor={evento.costoNochePersona != null ? formatearMonto(evento.costoNochePersona, evento.moneda) : "—"} />
              {evento.motivoLocalidadDistinta && <CampoInline etiqueta="Motivo de localidad distinta" valor={evento.motivoLocalidadDistinta} />}
            </Grilla2>
          )}

          <TituloSeccion>Alimentos</TituloSeccion>
          {evento.alimentosNoAplica ? (
            <CampoInline etiqueta="Alimentos" valor="No aplica" />
          ) : (
            <Grilla2>
              <CampoInline etiqueta="¿Acorde a política?" valor={evento.alimentosAcordePolitica ? "Sí" : `No — ${evento.alimentosMotivoNoAcorde}`} />
              <CampoInline etiqueta="Monto por día" valor={evento.montoAlimentosDia != null ? formatearMonto(evento.montoAlimentosDia, evento.moneda) : "—"} />
            </Grilla2>
          )}
        </>
      )}
      {evento.comentariosAlimentos && <CampoInline etiqueta="Comentarios de alimentos" valor={evento.comentariosAlimentos} />}

      <TituloSeccion>Condensado del costo total</TituloSeccion>
      <Grilla2>
        <CampoInline etiqueta="Inscripción" valor={formatearMonto(evento.condensadoInscripcion ?? 0, evento.moneda)} />
        {evento.incluirValorParticipacion && (
          <CampoInline etiqueta="Valor participación" valor={formatearMonto(evento.condensadoValorParticipacion ?? 0, evento.moneda)} />
        )}
        <CampoInline etiqueta="Transporte" valor={formatearMonto(evento.condensadoTransporte ?? 0, evento.moneda)} />
        <CampoInline etiqueta="Traslado" valor={evento.condensadoTraslado != null ? formatearMonto(evento.condensadoTraslado, evento.moneda) : "—"} />
        <CampoInline etiqueta="Hospedaje" valor={formatearMonto(evento.condensadoHospedaje ?? 0, evento.moneda)} />
        <CampoInline etiqueta="Alimentos" valor={formatearMonto(evento.condensadoAlimentos ?? 0, evento.moneda)} />
        <CampoInline etiqueta="Honorarios del speaker" valor={formatearMonto(evento.condensadoHonorariosSpeaker ?? 0, evento.moneda)} />
        <CampoInline
          etiqueta="Otro"
          valor={evento.condensadoOtro != null ? `${formatearMonto(evento.condensadoOtro, evento.moneda)}${evento.condensadoOtroEspecificar ? ` — ${evento.condensadoOtroEspecificar}` : ""}` : "0"}
        />
      </Grilla2>
      {/*
       * AJUSTES (septiembre/octubre 2026), pedido explícito: "el campo
       * Comentarios del costo (etiqueta y textbox) debe ocupar el ancho del
       * formulario. Por consiguiente, el campo 'centro de costos' debe
       * aparecer al lado de 'Costo total'" — se saca "Comentarios del
       * costo" de la rejilla de 2 columnas (ancho completo, como el resto
       * de comentarios de texto libre de este documento) y "Centro de
       * costos" pasa a compartir fila con "Costo total".
       */}
      <CampoInline etiqueta="Comentarios del costo" valor={evento.comentariosCosto} />
      <CampoInline etiqueta="Costo total" valor={formatearMonto(total, evento.moneda)} />

      <TituloSeccion>Comentarios especiales</TituloSeccion>
      <CampoInline etiqueta="Comentarios especiales" valor={evento.comentariosEspecialesNoAplica ? "No aplica" : evento.comentariosEspeciales} />

      {evento.advertenciaPresupuestoNoAprobado && (
        <NotaAdvertencia>
          Este evento no está incluido en un presupuesto aprobado. El solicitante optó por continuar la solicitud
          pese a esta advertencia — referencia para que los responsables de la matriz de aprobación decidan aprobar
          o rechazar el evento.
        </NotaAdvertencia>
      )}

      <CuerpoCamposPersonalizados
        tipoDoc="evento"
        valores={evento.camposPersonalizados}
        definiciones={camposPersonalizadosDefinidos}
        empresaGrupo={empresaGrupo}
        pais={pais}
      />

      <SeccionAprobacion>
        <TituloSeccion>Aprobación</TituloSeccion>
        <TablaAprobacion pasos={evento.aprobaciones} resolverNombre={(id) => (id ? usuarios.get(id)?.nombre ?? "—" : "—")} resolverFirmaId={(id) => (id ? usuarios.get(id)?.firmaId : null)} />
        <NotasAprobacionImpresa pasos={evento.aprobaciones} resolverNombre={(id) => (id ? usuarios.get(id)?.nombre ?? "—" : "—")} />
      </SeccionAprobacion>
    </div>
  );
}

/**
 * Fase 5 (post-reconstrucción) — textos fijos de `CuerpoConvenioHCP` en los
 * dos idiomas que ya soporta el resto del documento (clausulado, objetivo,
 * servicios, comentarios de pago — todos bilingües desde antes). Hasta
 * antes de esta fase estos títulos/etiquetas quedaban en español sin
 * importar el valor de `idioma`: el toggle "Español"/"English" de
 * `DetalleConvenioHCP` solo cambiaba el CONTENIDO variable, no el resto del
 * documento — esto lo completa. Los nombres de las etapas de la cadena de
 * aprobación (`paso.etiqueta`, p. ej. "Legal/Compliance") NO se traducen
 * aquí a propósito: son texto libre guardado por documento, no una etiqueta
 * fija de la interfaz.
 */
const TEXTOS_CONVENIO_HCP = {
  es: {
    estado: "Estado",
    origenContrato: "Origen del contrato",
    nombreCompania: "Nombre de la compañía",
    consultorHcp: "Consultor / HCP",
    identificacionConsultor: "Identificación del consultor",
    credenciales: "Credenciales",
    correoConsultor: "Correo del consultor",
    direccionConsultor: "Dirección del consultor",
    terminosContrato: "Términos del contrato",
    fechaEfectiva: "Fecha efectiva",
    firmaCompania: "Firma por la compañía",
    considerando: "Considerando",
    serviciosAnexoA: "Servicios (Anexo A)",
    ajustesClausulas: "Ajustes a cláusulas",
    cierre: "Cierre",
    firmaTitulo: "Firma",
    porLaCompania: "Por la compañía",
    porElConsultor: "Por el consultor",
    nombreFirma: "Nombre",
    cargoFirma: "Cargo",
    fechaFirma: "Fecha",
    sinFirmaAun: "Sin firma registrada todavía — se completa cuando Gerencia General / Rep. Legal apruebe su etapa.",
    firmaManuscritaConsultor: "Espacio para firma manuscrita del consultor",
    anexoBTitulo: "Anexo B — Términos de pago",
    compensacion: "Compensación",
    plazoPago: "Plazo de pago",
    dias: "días",
    comentariosPago: "Comentarios sobre el pago",
    clausulado: "Clausulado (Español)",
    aprobacion: "Aprobación",
    locale: "es-CO",
    encabezadosAprobacion: ENCABEZADOS_APROBACION_ES,
  },
  en: {
    estado: "Status",
    origenContrato: "Contract origin",
    nombreCompania: "Company name",
    consultorHcp: "Consultant / HCP",
    identificacionConsultor: "Consultant ID",
    credenciales: "Credentials",
    correoConsultor: "Consultant email",
    direccionConsultor: "Consultant address",
    terminosContrato: "Contract terms",
    fechaEfectiva: "Effective date",
    firmaCompania: "Signed for the company by",
    considerando: "Whereas",
    serviciosAnexoA: "Services (Exhibit A)",
    ajustesClausulas: "Clause adjustments",
    cierre: "Closing",
    firmaTitulo: "Signature",
    porLaCompania: "For the company",
    porElConsultor: "For the Consultant",
    nombreFirma: "Name",
    cargoFirma: "Title",
    fechaFirma: "Date",
    sinFirmaAun: "No signature recorded yet — filled in once Gerencia General / Rep. Legal approves its stage.",
    firmaManuscritaConsultor: "Space for the Consultant's handwritten signature",
    anexoBTitulo: "Exhibit B — Payment terms",
    compensacion: "Compensation",
    plazoPago: "Payment term",
    dias: "days",
    comentariosPago: "Payment comments",
    clausulado: "Clauses (English)",
    aprobacion: "Approval",
    locale: "en-US",
    encabezadosAprobacion: ENCABEZADOS_APROBACION_EN,
  },
} as const;

/**
 * Rediseño de la ventana "Convenio HCP" (septiembre 2026): panel de firma
 * bilingüe, pedido dos veces en el documento (después del cierre del cuerpo
 * y después del Anexo A) con la MISMA información — se decidió que ambos
 * paneles muestran el mismo dato de firma (una sola firma real por
 * documento), no dos firmas independientes (ver nota de diseño en el
 * README). "Por la compañía" resuelve la identidad de quien firmó a partir
 * de la etapa "Gerencia General / Rep. Legal" ya aprobada de la cadena de aprobación —
 * no se agregó ninguna columna nueva para esto: `resueltoPorId`/`fecha` de
 * ese paso YA son la firma. "Por el consultor" queda en blanco a propósito
 * (firma manuscrita sobre la copia impresa) salvo el nombre, que se toma
 * del propio documento.
 */
function PanelFirmaConvenioHCP({
  convenio,
  idioma,
  usuarios,
}: {
  convenio: ConvenioHcp;
  idioma: "es" | "en";
  usuarios: Map<string, Usuario>;
}) {
  const t = TEXTOS_CONVENIO_HCP[idioma];
  const pasoGerencia = convenio.aprobaciones.find((p) => p.rolRequerido === "gerencia_general");
  const firmante = pasoGerencia?.estado === "aprobado" && pasoGerencia.resueltoPorId ? usuarios.get(pasoGerencia.resueltoPorId) : undefined;
  const fechaFirma = pasoGerencia?.estado === "aprobado" && pasoGerencia.fecha ? formatearFechaHora(pasoGerencia.fecha) : "";
  return (
    <div className="grid grid-cols-1 gap-4 border-t border-gray-300 pt-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold text-gray-600">{t.porLaCompania} {convenio.companiaNombre}:</p>
        {firmante ? (
          <>
            <FirmaManuscritaUsuario firmaId={pasoGerencia?.firmaCongeladaId ?? firmante.firmaId} />
            <CampoInline etiqueta={t.nombreFirma} valor={firmante.nombre} />
            <CampoInline etiqueta={t.cargoFirma} valor={firmante.cargo} />
            <CampoInline etiqueta={t.fechaFirma} valor={fechaFirma} />
          </>
        ) : (
          <p className="text-xs text-muted-foreground">{t.sinFirmaAun}</p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold text-gray-600">{t.porElConsultor}:</p>
        <p className="text-xs italic text-muted-foreground">{t.firmaManuscritaConsultor}</p>
        <CampoInline etiqueta={t.nombreFirma} valor={convenio.consultorNombre} />
        <CampoInline etiqueta={t.fechaFirma} valor="" />
      </div>
    </div>
  );
}

/**
 * AJUSTES (septiembre/octubre 2026), pedido explícito: "garantiza que se
 * involucre un punto de control previo que sea el Visto Bueno de
 * Compliance & Legal... deja evidencia en el documento impreso de que
 * previo a la firma, el convenio tuvo el visto bueno de Compliance &
 * Legal (incluye una nota en el convenio -ubicado antes de la matriz de
 * firmas- y en cada uno de los anexos A y B". La cadena de aprobación del
 * Convenio HCP YA tenía ese paso previo ("Visto Bueno Legal/Compliance",
 * `crearCadenaAprobacionConvenioHCP` en `lib/aprobaciones.ts`) y YA bloquea
 * la firma de Gerencia General / Rep. Legal hasta que se dé ese
 * aval (`puedeFirmarConvenioHCPGerenciaGeneral`, `lib/reglasDependenciaDocumentos.ts`)
 * — lo que faltaba era justamente esta nota impresa.
 */
function NotaVistoBuenoCompliance({ convenio, idioma }: { convenio: ConvenioHcp; idioma: "es" | "en" }) {
  const paso = convenio.aprobaciones.find((p) => p.rolRequerido === "legal" || p.rolRequerido === "legal_compliance");
  const aprobado = paso?.estado === "aprobado";
  const fecha = aprobado && paso?.fecha ? formatearFechaHora(paso.fecha) : "";
  const texto =
    idioma === "en"
      ? aprobado
        ? `Prior to signature, this agreement received Legal & Compliance sign-off${fecha ? ` (${fecha})` : ""}.`
        : "This agreement is still pending Legal & Compliance sign-off."
      : aprobado
        ? `Previo a la firma, el presente convenio contó con el visto bueno de Legal & Compliance${fecha ? ` (${fecha})` : ""}.`
        : "Este convenio está pendiente del visto bueno de Legal & Compliance.";
  return <p className="text-xs italic text-muted-foreground">{texto}</p>;
}

/**
 * Traducción de `EstadoDoc` (Fase 5, tercera entrega — se restaura tras el
 * rediseño de "formato oficial"): el estado del documento ahora se ve
 * principalmente en el Badge de la barra de herramientas, siempre en el
 * valor original en español (`EstadoDoc` no es bilingüe como tipo), así que
 * se conserva esta línea traducida dentro del cuerpo del Convenio HCP para
 * que el documento impreso en inglés siga siendo bilingüe también en esto,
 * como ya pedía el usuario en la primera entrega de esta fase.
 */
const ESTADO_DOC_EN: Record<EstadoDoc, string> = {
  Borrador: "Draft",
  Pendiente: "Pending",
  Aprobado: "Approved",
  Rechazado: "Rejected",
  Devuelto: "Returned",
  Completado: "Completed",
  Anulado: "Cancelled",
};

function CuerpoConvenioHCPCompacto({
  convenio,
  idioma = "es",
  empresaGrupo = "",
  pais = "",
  camposPersonalizadosDefinidos = [],
}: {
  convenio: ConvenioHcp;
  idioma?: "es" | "en";
  /** AJUSTES (septiembre 2026): opcionales para no romper llamadores existentes — habilitan los campos personalizados. */
  empresaGrupo?: string;
  pais?: string;
  camposPersonalizadosDefinidos?: CampoPersonalizadoDefinicion[];
}) {
  const t = TEXTOS_CONVENIO_HCP[idioma];
  const usuarios = useUsuariosPorId(convenio.aprobaciones.map((p) => p.resueltoPorId));
  const resolverNombre = (id?: string) => (id ? usuarios.get(id)?.nombre ?? "—" : "—");

  return (
    <div className="flex flex-col gap-4">
      <CampoInline etiqueta={t.estado} valor={idioma === "en" ? ESTADO_DOC_EN[convenio.estado] : convenio.estado} />

      <TituloSeccion>{t.origenContrato}</TituloSeccion>
      <Grilla2>
        <CampoInline etiqueta={t.nombreCompania} valor={convenio.companiaNombre} />
        <CampoInline etiqueta={t.consultorHcp} valor={convenio.consultorNombre} />
        <CampoInline etiqueta={t.identificacionConsultor} valor={convenio.consultorIdentificacion} />
        <CampoInline etiqueta={t.credenciales} valor={convenio.consultorCredenciales} />
        <CampoInline etiqueta={t.correoConsultor} valor={convenio.consultorEmail} />
        <CampoInline etiqueta={t.direccionConsultor} valor={convenio.consultorDireccion} />
      </Grilla2>

      <TituloSeccion>{t.terminosContrato}</TituloSeccion>
      <Grilla2>
        <CampoInline etiqueta={t.fechaEfectiva} valor={convenio.fechaEfectiva ? formatearFecha(convenio.fechaEfectiva) : "—"} />
        <CampoInline etiqueta={t.firmaCompania} valor={convenio.nombreDirectorGeneral} />
      </Grilla2>

      <TituloSeccion>{t.considerando}</TituloSeccion>
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed">
        {idioma === "en" ? convenio.objetivoConsultoriaEn || convenio.objetivoConsultoria : convenio.objetivoConsultoria}
      </p>

      <TituloSeccion>{t.clausulado}</TituloSeccion>
      {SECCIONES_CLAUSULADO.map((seccion) => {
        const texto = textoEfectivoSeccion(convenio, seccion.valor);
        const cuerpo = idioma === "en" ? texto.en : texto.es;
        if (!cuerpo) return null;
        // La etiqueta de cada numeral/anexo ("Numeral 3", "Anexo C") vive
        // centralizada en español en `SECCIONES_CLAUSULADO` — se usa igual
        // en el <Select> del panel de ajustes, así que no se traduce ahí;
        // aquí sí se traduce al imprimir en inglés ("Clause 3", "Exhibit C").
        const etiquetaSeccion =
          idioma === "en" ? seccion.etiqueta.replace(/^Numeral/, "Clause").replace(/^Anexo/, "Exhibit") : seccion.etiqueta;
        return (
          <div key={seccion.valor} className="border-b border-gray-200 py-2">
            <p className="mb-1 text-xs font-semibold text-gray-600">{etiquetaSeccion}</p>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{cuerpo}</p>
          </div>
        );
      })}
      {convenio.clausulasAjustadas && <CampoInline etiqueta={t.ajustesClausulas} valor={convenio.clausulasAjustadas} />}

      <TituloSeccion>{t.cierre}</TituloSeccion>
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{idioma === "en" ? convenio.cierreEn : convenio.cierreEs}</p>

      <NotaVistoBuenoCompliance convenio={convenio} idioma={idioma} />
      <TituloSeccion>{t.firmaTitulo}</TituloSeccion>
      <PanelFirmaConvenioHCP convenio={convenio} idioma={idioma} usuarios={usuarios} />

      <TituloSeccion>{t.serviciosAnexoA}</TituloSeccion>
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed">
        {idioma === "en" ? convenio.serviciosExhibitAEn || convenio.serviciosExhibitA : convenio.serviciosExhibitA}
      </p>
      <NotaVistoBuenoCompliance convenio={convenio} idioma={idioma} />

      <TituloSeccion>{t.firmaTitulo}</TituloSeccion>
      <PanelFirmaConvenioHCP convenio={convenio} idioma={idioma} usuarios={usuarios} />

      <TituloSeccion>{t.anexoBTitulo}</TituloSeccion>
      <Grilla2>
        <CampoInline etiqueta={t.compensacion} valor={formatearMonto(convenio.compensacion, convenio.moneda)} />
        <CampoInline etiqueta={t.plazoPago} valor={convenio.plazoPagoDias != null ? `${convenio.plazoPagoDias} ${t.dias}` : "—"} />
      </Grilla2>
      <CampoInline etiqueta={t.comentariosPago} valor={idioma === "en" ? convenio.comentariosPagoEn || convenio.comentariosPago : convenio.comentariosPago} />
      <NotaVistoBuenoCompliance convenio={convenio} idioma={idioma} />

      <CuerpoCamposPersonalizados
        tipoDoc="convenioHCP"
        valores={convenio.camposPersonalizados}
        definiciones={camposPersonalizadosDefinidos}
        empresaGrupo={empresaGrupo}
        pais={pais}
      />

      <SeccionAprobacion>
        <TituloSeccion>{t.aprobacion}</TituloSeccion>
        <TablaAprobacion pasos={convenio.aprobaciones} resolverNombre={resolverNombre} resolverFirmaId={(id) => (id ? usuarios.get(id)?.firmaId : null)} encabezados={t.encabezadosAprobacion} />
        <NotasAprobacionImpresa pasos={convenio.aprobaciones} resolverNombre={resolverNombre} idioma={idioma === "en" ? "en" : "es"} />
      </SeccionAprobacion>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Convenio HCP — formato de impresión BILINGÜE en dos columnas (inglés a la
// izquierda, español a la derecha). Cada anexo arranca en página propia y
// lleva su propio espacio de firma (no una matriz) más la nota de visto bueno
// de Legal/Compliance. La vista compacta de detalle conserva el formato de un
// solo idioma (`CuerpoConvenioHCPCompacto`).
// ---------------------------------------------------------------------------

/**
 * Noviembre 2026: cada anexo arranca en hoja propia (`break-before: page`) y se estira hasta el final de esa hoja para que la
 * zona de firma quede al pie. El alto NO puede ser el de la hoja completa: `@page` deja 10in de área útil y el membrete que
 * se repite en cada hoja ocupa ~1.1in, así que el anterior `min-height: 9.2in` desbordaba y cada anexo terminaba en DOS hojas
 * (la firma sola en la segunda). `--alto-hoja-anexo` es el alto útil del anexo con el membrete puesto (medido con un PDF real en Chromium: hasta 8.9in cabe en una hoja; se deja 8.6in de margen); sin membrete sobra espacio y la firma sube un poco, pero nunca se desborda.
 */
const PAGINA_ANEXO: React.CSSProperties = {
  ...({ breakBefore: "page", pageBreakBefore: "always" } as React.CSSProperties),
  minHeight: "var(--alto-hoja-anexo, 8.6in)",
};
const SIN_CORTE: React.CSSProperties = { breakInside: "avoid", pageBreakInside: "avoid" };

function parrafos(texto: string): string[] {
  return (texto ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

/** Dos columnas alineadas párrafo a párrafo (EN | ES). Si los dos textos no tienen el mismo número de párrafos, se muestran como un solo bloque por columna. */
function ParesBilingues({ en, es, etiquetaEn, etiquetaEs }: { en: string; es: string; etiquetaEn?: string; etiquetaEs?: string }) {
  const pEn = parrafos(en);
  const pEs = parrafos(es);
  const alineados = pEn.length === pEs.length && pEn.length > 0;
  const filas: Array<[string, string]> = alineados ? pEn.map((x, i) => [x, pEs[i]]) : [[en, es]];
  if (!en && !es) return null;
  return (
    <div className="flex flex-col">
      {(etiquetaEn || etiquetaEs) && (
        <div className="grid grid-cols-2 gap-x-6" style={SIN_CORTE} data-pdf-titulo>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">{etiquetaEn}</p>
          <p className="border-l border-gray-300 pl-6 text-[11px] font-semibold uppercase tracking-wide text-gray-600">{etiquetaEs}</p>
        </div>
      )}
      {filas.map(([a, b], i) => (
        <div key={i} className="grid grid-cols-2 gap-x-6 py-1" style={SIN_CORTE}>
          <p className="whitespace-pre-wrap text-justify text-[12px] leading-relaxed">{a}</p>
          <p className="whitespace-pre-wrap border-l border-gray-300 pl-6 text-justify text-[12px] leading-relaxed">{b}</p>
        </div>
      ))}
    </div>
  );
}

function EncabezadoBilingue({ en, es }: { en: string; es: string }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 border-b-2 border-gray-800 pb-1" style={SIN_CORTE} data-pdf-titulo>
      <h3 className="text-sm font-bold uppercase">{en}</h3>
      <h3 className="border-l border-gray-300 pl-6 text-sm font-bold uppercase">{es}</h3>
    </div>
  );
}

function FilaDatoBilingue({ en, es, valor }: { en: string; es: string; valor: string }) {
  return (
    <tr style={SIN_CORTE}>
      <td className="w-[40%] border border-gray-400 bg-gray-50 px-2 py-1 align-top text-[11px] font-semibold">{en} / <span className="font-normal">{es}</span></td>
      <td className="border border-gray-400 px-2 py-1 align-top text-[12px]">{valor || "—"}</td>
    </tr>
  );
}

function NotaLegalComplianceBilingue({ convenio }: { convenio: ConvenioHcp }) {
  const paso = convenio.aprobaciones.find((p) => p.rolRequerido === "legal" || p.rolRequerido === "legal_compliance");
  const aprobado = paso?.estado === "aprobado";
  const fecha = aprobado && paso?.fecha ? formatearFechaHora(paso.fecha) : "";
  const en = aprobado
    ? `Prior to signature, this agreement received Legal & Compliance sign-off${fecha ? ` (${fecha})` : ""}.`
    : "This agreement is pending Legal & Compliance sign-off.";
  const es = aprobado
    ? `Previo a la firma, el presente convenio contó con el visto bueno de Legal & Compliance${fecha ? ` (${fecha})` : ""}.`
    : "Este convenio está pendiente del visto bueno de Legal & Compliance.";
  return (
    <div className="grid grid-cols-2 gap-x-6 rounded border border-gray-400 bg-gray-50 px-3 py-1.5" style={SIN_CORTE}>
      <p className="text-[11px] italic">{en}</p>
      <p className="border-l border-gray-300 pl-6 text-[11px] italic">{es}</p>
    </div>
  );
}

/** Casilla en blanco para marcar a mano («Sí ____ No ____»); es un borde, no guiones bajos, para que imprima igual en cualquier tipografía. */
function Rayita() {
  return <span className="mx-1 inline-block h-3 w-10 border-b border-gray-700 align-baseline" />;
}

/**
 * Entrega 28, pedido explícito: el Anexo C debe incluir la pregunta «¿Acepta? Sí__ No__» en español e inglés.
 * Misma estructura de dos columnas (EN | ES) que el resto del documento.
 */
function PreguntaAceptaBilingue() {
  return (
    <div className="grid grid-cols-2 gap-x-6 pt-3" style={SIN_CORTE} data-pregunta-acepta>
      <p className="text-[12px] font-semibold">
        Do you accept?<span className="ml-3 font-normal">Yes<Rayita /></span><span className="ml-3 font-normal">No<Rayita /></span>
      </p>
      <p className="border-l border-gray-300 pl-6 text-[12px] font-semibold">
        ¿Acepta?<span className="ml-3 font-normal">Sí<Rayita /></span><span className="ml-3 font-normal">No<Rayita /></span>
      </p>
    </div>
  );
}

function LineaFirma({ en, es, valor }: { en: string; es: string; valor?: string }) {
  return (
    <div className="flex items-end gap-2 text-[11px]">
      <span className="whitespace-nowrap font-semibold">{en} / <span className="font-normal">{es}</span>:</span>
      <span className="min-h-[1.1rem] flex-1 border-b border-gray-700 px-1 text-[12px]">{valor ?? ""}</span>
    </div>
  );
}

/**
 * Zona de firma de un anexo o del clausulado. Con `firmaCompania` (clausulado y anexos A y B) lleva la nota de visto bueno de
 * Legal/Compliance y el espacio de firma de la compañía; sin él (anexos C y D — noviembre 2026, pedido explícito) solo queda el
 * espacio del consultor: esos anexos no los firma la compañía ni llevan la nota de Legal/Compliance.
 */
function ZonaFirmaConvenioHCP({ convenio, usuarios, firmaCompania = true }: { convenio: ConvenioHcp; usuarios: Map<string, Usuario>; firmaCompania?: boolean }) {
  const paso = convenio.aprobaciones.find((p) => p.rolRequerido === "gerencia_general");
  const firmante = paso?.estado === "aprobado" && paso.resueltoPorId ? usuarios.get(paso.resueltoPorId) : undefined;
  const fechaFirma = paso?.estado === "aprobado" && paso.fecha ? formatearFechaHora(paso.fecha) : "";
  return (
    <div className="mt-auto flex flex-col gap-3 pt-4" style={SIN_CORTE} data-zona-firma={firmaCompania ? "compania-y-consultor" : "consultor"}>
      {firmaCompania && <NotaLegalComplianceBilingue convenio={convenio} />}
      <div className="grid grid-cols-2 gap-x-10 pt-2">
        {/* Entrega 28: en los anexos C y D la única firma que aplica es la de la contraparte, y debe quedar en la
            columna DERECHA (la izquierda se deja vacía) para no «saltar» de lado respecto a los demás anexos. */}
        {!firmaCompania && <div aria-hidden="true" data-zona-firma-vacia />}
        {firmaCompania && (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase">
              {convenio.companiaNombre || "—"} <span className="font-normal normal-case text-gray-600">· For the Company / Por la compañía</span>
            </p>
            <div className="flex min-h-[3.2rem] items-end border-b border-gray-700">
              {firmante && <FirmaManuscritaUsuario firmaId={paso?.firmaCongeladaId ?? firmante.firmaId} />}
            </div>
            <p className="-mt-1 text-[10px] text-gray-600">Signature / Firma</p>
            <LineaFirma en="Name" es="Nombre" valor={firmante?.nombre} />
            <LineaFirma en="Title" es="Cargo" valor={firmante?.cargo} />
            <LineaFirma en="Date" es="Fecha" valor={fechaFirma} />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase">
            {convenio.consultorNombre || "—"} <span className="font-normal normal-case text-gray-600">· For the Consultant / Por el consultor</span>
          </p>
          <div className="min-h-[3.2rem] border-b border-gray-700" />
          <p className="-mt-1 text-[10px] text-gray-600">Signature / Firma</p>
          <LineaFirma en="Name" es="Nombre" valor={convenio.consultorNombre} />
          <LineaFirma en="ID" es="Identificación" valor={convenio.consultorIdentificacion} />
          <LineaFirma en="Date" es="Fecha" />
        </div>
      </div>
    </div>
  );
}

/**
 * Hoja propia de un anexo. La última hoja del documento (`pie`) cierra con el pie «Elaborado por… Generado el… ID interno…»
 * pegado al fondo: la zona de firma (`mt-auto`) empuja todo hacia abajo y el pie queda debajo de ella.
 */
function HojaAnexoConvenioHCP({ anexo, pie, children }: { anexo: string; pie?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3" style={PAGINA_ANEXO} data-hoja-anexo={anexo}>
      {children}
      {pie}
    </div>
  );
}

function CuerpoConvenioHCPBilingue({
  convenio,
  empresaGrupo = "",
  pais = "",
  camposPersonalizadosDefinidos = [],
  conPie = false,
}: {
  convenio: ConvenioHcp;
  empresaGrupo?: string;
  pais?: string;
  camposPersonalizadosDefinidos?: CampoPersonalizadoDefinicion[];
  /** Pinta el pie «Elaborado por…» al fondo de la última hoja (ver `HojaAnexoConvenioHCP`). */
  conPie?: boolean;
}) {
  const usuarios = useUsuariosPorId([...convenio.aprobaciones.map((p) => p.resueltoPorId), convenio.creadoPorId]);
  // Anexos C y D (plantilla) que realmente se imprimen; el último de toda la lista (A, B, C, D) lleva el pie.
  const anexosC_D = SECCIONES_CLAUSULADO.filter((s) => !s.valor.startsWith("numeral_")).filter((sec) => {
    const t = textoEfectivoSeccion(convenio, sec.valor);
    return !!(t.en || t.es);
  });
  const ultimoAnexo = anexosC_D.length > 0 ? anexosC_D[anexosC_D.length - 1].valor : "anexo_b";
  const pieDe = (anexo: string) =>
    conPie && anexo === ultimoAnexo ? <PiePaginaOficial documentoId={convenio.id} creador={usuarios.get(convenio.creadoPorId)} className="mt-3" /> : undefined;
  const seccion = (valor: string) => textoEfectivoSeccion(convenio, valor);
  const numerales = SECCIONES_CLAUSULADO.filter((s) => s.valor.startsWith("numeral_"));
  const letraAnexo = (etiqueta: string) => etiqueta.replace(/^Anexo\s+/, "");

  return (
    <div className="flex flex-col gap-4">
      {/* Datos del contrato */}
      <table className="w-full border-collapse" style={SIN_CORTE}>
        <tbody>
          <FilaDatoBilingue en="Company" es="Compañía" valor={convenio.companiaNombre} />
          <FilaDatoBilingue en="Consultant / HCP" es="Consultor / HCP" valor={convenio.consultorNombre} />
          <FilaDatoBilingue en="Consultant ID" es="Identificación del consultor" valor={convenio.consultorIdentificacion} />
          <FilaDatoBilingue en="Credentials" es="Credenciales" valor={convenio.consultorCredenciales} />
          <FilaDatoBilingue en="Consultant email" es="Correo del consultor" valor={convenio.consultorEmail} />
          <FilaDatoBilingue en="Consultant address" es="Dirección del consultor" valor={convenio.consultorDireccion} />
          <FilaDatoBilingue en="Effective date" es="Fecha efectiva" valor={convenio.fechaEfectiva ? formatearFecha(convenio.fechaEfectiva) : ""} />
          <FilaDatoBilingue en="Signed for the company by" es="Firma por la compañía" valor={convenio.nombreDirectorGeneral} />
        </tbody>
      </table>

      {/* Considerando / Whereas */}
      <ParesBilingues en={convenio.objetivoConsultoriaEn || convenio.objetivoConsultoria} es={convenio.objetivoConsultoria} />

      {/* Clausulado (numerales) */}
      {numerales.map((sec) => {
        const t = seccion(sec.valor);
        if (!t.en && !t.es) return null;
        const n = sec.etiqueta.replace(/^Numeral\s+/, "");
        return <ParesBilingues key={sec.valor} en={t.en} es={t.es} etiquetaEn={`Clause ${n}`} etiquetaEs={`Numeral ${n}`} />;
      })}
      {convenio.clausulasAjustadas && (
        <ParesBilingues en={convenio.clausulasAjustadas} es={convenio.clausulasAjustadas} etiquetaEn="Clause adjustments" etiquetaEs="Ajustes a cláusulas" />
      )}

      {/* Cierre + firma del clausulado */}
      <div className="flex flex-col gap-3" style={SIN_CORTE}>
        <ParesBilingues en={convenio.cierreEn} es={convenio.cierreEs} />
        <ZonaFirmaConvenioHCP convenio={convenio} usuarios={usuarios} />
      </div>

      {/* Anexo A */}
      <HojaAnexoConvenioHCP anexo="anexo_a">
        <EncabezadoBilingue en="Exhibit A — Services" es="Anexo A — Servicios" />
        <ParesBilingues en={convenio.serviciosExhibitAEn || convenio.serviciosExhibitA} es={convenio.serviciosExhibitA} />
        <ZonaFirmaConvenioHCP convenio={convenio} usuarios={usuarios} />
      </HojaAnexoConvenioHCP>

      {/* Anexo B */}
      <HojaAnexoConvenioHCP anexo="anexo_b" pie={pieDe("anexo_b")}>
        <EncabezadoBilingue en="Exhibit B — Payment terms" es="Anexo B — Términos de pago" />
        <table className="w-full border-collapse" style={SIN_CORTE}>
          <tbody>
            <FilaDatoBilingue en="Compensation" es="Compensación" valor={formatearMonto(convenio.compensacion, convenio.moneda)} />
            <FilaDatoBilingue en="Payment term" es="Plazo de pago" valor={convenio.plazoPagoDias != null ? `${convenio.plazoPagoDias} días / days` : ""} />
          </tbody>
        </table>
        <ParesBilingues en={convenio.comentariosPagoEn || convenio.comentariosPago} es={convenio.comentariosPago} etiquetaEn="Payment remarks" etiquetaEs="Comentarios sobre el pago" />
        <ZonaFirmaConvenioHCP convenio={convenio} usuarios={usuarios} />
      </HojaAnexoConvenioHCP>

      {/* Anexos de la plantilla (C, D…): sin firma de la compañía ni nota de Legal/Compliance */}
      {anexosC_D.map((sec) => {
        const t = seccion(sec.valor);
        const letra = letraAnexo(sec.etiqueta);
        return (
          <HojaAnexoConvenioHCP key={sec.valor} anexo={sec.valor} pie={pieDe(sec.valor)}>
            <EncabezadoBilingue en={`Exhibit ${letra}`} es={`Anexo ${letra}`} />
            <ParesBilingues en={t.en} es={t.es} />
            {sec.valor === "anexo_c" && <PreguntaAceptaBilingue />}
            <ZonaFirmaConvenioHCP convenio={convenio} usuarios={usuarios} firmaCompania={false} />
          </HojaAnexoConvenioHCP>
        );
      })}

      <CuerpoCamposPersonalizados
        tipoDoc="convenioHCP"
        valores={convenio.camposPersonalizados}
        definiciones={camposPersonalizadosDefinidos}
        empresaGrupo={empresaGrupo}
        pais={pais}
      />
      {/* Noviembre 2026 (pedido explícito): el Convenio HCP ya no muestra la matriz de aprobación; el estado de la cadena
          se consulta en el detalle del documento. */}
    </div>
  );
}

export function CuerpoConvenioHCP(props: {
  convenio: ConvenioHcp;
  idioma?: "es" | "en";
  empresaGrupo?: string;
  pais?: string;
  camposPersonalizadosDefinidos?: CampoPersonalizadoDefinicion[];
  /** Vista de impresión: dibuja el pie «Elaborado por…» al fondo de la última hoja (usar junto con `pieEnCuerpo` de `DocumentoImprimible`). */
  conPie?: boolean;
}) {
  const modo = React.useContext(ModoVistaDocumento);
  return modo === "compacta" ? <CuerpoConvenioHCPCompacto {...props} /> : <CuerpoConvenioHCPBilingue {...props} />;
}
