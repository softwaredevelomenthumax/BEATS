import * as React from "react";
import { traerArchivo, subirArchivo, type ArchivoAdjunto } from "@/lib/archivosAdjuntos";
import { construirNombreBase } from "@/lib/nombreArchivo";
import { Button } from "@/components/ui/button";
import { CampoArchivo } from "@/components/archivos/CampoArchivo";

/**
 * Ronda de ajustes de formularios (septiembre 2026), entrega 6: "Firma
 * manuscrita: Se visualiza la firma manuscrita del usuario que realizó o
 * está realizando la solicitud. NOTA: No debe permitir copiar la imagen
 * que se está mostrando (por razones de seguridad)." — pedido idéntico en
 * FMV, Notificación de Pago, y (a futuro) el campo para capturarla en
 * "Nuevo Usuario" (todavía sin construir en esta ronda). Este componente
 * es solo de LECTURA: muestra la firma ya guardada en `Usuario.firmaId`
 * (infraestructura de archivos, Fase 1) — no ofrece ningún control para
 * dibujar o subir una nueva, eso vive en el formulario de Nuevo Usuario.
 * Mientras esa entrega no llegue, `firmaId` está vacío para todos los
 * usuarios y este componente simplemente lo dice, sin romper nada.
 *
 * "No copiable" es una fricción razonable, no una garantía absoluta (un
 * usuario decidido siempre puede hacer una captura de pantalla) — se
 * bloquean los caminos obvios: clic derecho, arrastrar la imagen, y
 * selección de texto/imagen alrededor.
 */
export function FirmaManuscritaUsuario({ firmaId }: { firmaId: string | null | undefined }) {
  const [archivo, setArchivo] = React.useState<ArchivoAdjunto | null>(null);
  const [cargando, setCargando] = React.useState(false);

  React.useEffect(() => {
    if (!firmaId) {
      setArchivo(null);
      return;
    }
    let cancelado = false;
    setCargando(true);
    traerArchivo(firmaId)
      .then((a) => { if (!cancelado) setArchivo(a); })
      .catch(() => { if (!cancelado) setArchivo(null); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [firmaId]);

  if (!firmaId) {
    return <p className="text-xs text-muted-foreground">Sin firma manuscrita registrada todavía.</p>;
  }
  if (cargando) {
    return <p className="text-xs text-muted-foreground">Cargando firma…</p>;
  }
  if (!archivo) {
    return <p className="text-xs text-muted-foreground">La firma registrada ya no está disponible.</p>;
  }
  return (
    <div
      className="w-fit max-w-full select-none"
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      style={{ userSelect: "none" }}
    >
      {/*
       * AJUSTES (septiembre/octubre 2026), pedido explícito: "la firma
       * manuscrita debe verse sin ningún borde ni sombreado. Solo debe
       * verse la imagen que corresponda" — se retira el contenedor con
       * `border`/`bg-white`/`p-2` que envolvía la imagen; la protección
       * "no copiable" (clic derecho, arrastre, selección) se mantiene
       * igual, solo que aplicada directamente sobre la imagen.
       *
       * AJUSTES (septiembre/octubre 2026), pedido explícito (cadena de
       * aprobación en `Detalle*.tsx`): "la firma manuscrita (la imagen) sin
       * fondo". La firma dibujada a mano en `CapturaFirmaManuscrita` (más
       * abajo en este archivo) ya se guarda sobre un `<canvas>` sin pintar
       * ningún fondo, así que su PNG exportado ya es transparente donde no
       * hay trazo — pero una firma subida como archivo (la alternativa
       * "Subir imagen" del mismo componente) casi siempre trae un fondo
       * blanco/claro opaco (foto o escaneo sobre papel). `mix-blend-mode:
       * multiply` hace que cualquier fondo claro de la imagen se funda con
       * el fondo real detrás de ella (quedando efectivamente invisible
       * sobre los fondos claros donde se usa esta firma — filas de la
       * cadena de aprobación, impresos) sin necesitar procesar/recortar la
       * imagen en sí.
       */}
      <img
        src={archivo.dataUrl}
        alt="Firma manuscrita"
        draggable={false}
        className="pointer-events-none h-16 max-w-full select-none object-contain mix-blend-multiply"
      />
    </div>
  );
}

/** Colores sugeridos para la firma manuscrita (además del selector libre). */
const COLORES_FIRMA = [
  { nombre: "Negro", valor: "#1e293b" },
  { nombre: "Azul tinta", valor: "#1d4ed8" },
  { nombre: "Azul marino", valor: "#1e3a8a" },
  { nombre: "Verde", valor: "#15803d" },
  { nombre: "Rojo", valor: "#b91c1c" },
] as const;

/**
 * Ronda de ajustes de formularios (septiembre 2026), entrega 8: el control
 * para CAPTURAR la firma manuscrita (dibujarla o subir un archivo de
 * imagen) que "Nuevo Usuario" tenía pendiente desde la entrega 6 — pedido
 * explícito del usuario. Dibuja sobre un `<canvas>` (mouse y touch) y sube
 * el resultado como PNG vía `subirArchivo` (infraestructura de archivos,
 * Fase 1) al soltar el trazo; la alternativa "Subir imagen" usa el mismo
 * `CampoArchivo` que el resto de la app. `onChange` recibe el nuevo
 * `archivoId` (o `null` si se borra) — quien use este componente decide
 * cuándo guardarlo (`CambiosPerfilUsuario.firmaId`/`DatosNuevoUsuario.firmaId`).
 */
export function CapturaFirmaManuscrita({
  valor,
  onChange,
  disabled,
}: {
  valor: string | null;
  onChange: (archivoId: string | null) => void;
  disabled?: boolean;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const dibujando = React.useRef(false);
  const [subiendo, setSubiendo] = React.useState(false);
  const [modo, setModo] = React.useState<"dibujar" | "subir">("dibujar");
  // Octubre 2026, pedido explícito: "al configurar la firma manuscrita, el
  // sistema debe permitir escoger el color de esta. Y de este color se deberá
  // mostrar en todos los documentos que se firmen." El color se "hornea" en el
  // PNG que se sube (fondo transparente + trazo del color elegido), así que
  // todas las vistas que ya muestran la firma (cadena de aprobación, vista
  // previa, impresión/PDF, firma congelada de cada etapa) la ven con ese color
  // sin ningún cambio adicional. Los trazos se conservan en memoria para poder
  // repintarlos si se cambia el color después de dibujar.
  const [color, setColor] = React.useState<string>(COLORES_FIRMA[0].valor);
  const trazos = React.useRef<Array<Array<{ x: number; y: number }>>>([]);

  // SEGUNDA CORRECCIÓN (septiembre 2026) — la anterior no era la causa real:
  // "la punta del 'lápiz' no es la punta del cursor del mouse, sino que se
  // muestra en la parte lateral" es el síntoma clásico de dibujar en un
  // <canvas> sin corregir la diferencia entre su tamaño INTERNO (los
  // atributos `width`/`height`, el sistema de coordenadas que usa
  // `ctx.lineTo`) y su tamaño RENDERIZADO en pantalla (el que da
  // `getBoundingClientRect`, que puede ser distinto por el layout —por
  // ejemplo un contenedor flex que lo estira). Sin corregir eso, un punto a
  // la mitad del ancho visible del lienzo se dibuja internamente más cerca
  // del borde — el trazo queda desplazado hacia un lado, más notorio
  // mientras más lejos del borde izquierdo esté el cursor, exactamente como
  // se reportó. Este mismo componente ya tenía la corrección correcta en
  // OTRO lugar de la app (`FirmaCanvas.tsx`, Módulo de Ejecución) — se
  // reutiliza acá el mismo cálculo de escala.
  function posicion(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const punto = "touches" in e ? e.touches[0] : e;
    const escalaX = canvas.width / rect.width;
    const escalaY = canvas.height / rect.height;
    return { x: (punto.clientX - rect.left) * escalaX, y: (punto.clientY - rect.top) * escalaY };
  }

  function empezarTrazo(e: React.MouseEvent | React.TouchEvent) {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    dibujando.current = true;
    const ctx = canvas.getContext("2d");
    const { x, y } = posicion(e, canvas);
    trazos.current.push([{ x, y }]);
    ctx?.beginPath();
    ctx?.moveTo(x, y);
  }

  function seguirTrazo(e: React.MouseEvent | React.TouchEvent) {
    if (!dibujando.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = posicion(e, canvas);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = color;
    ctx.lineTo(x, y);
    ctx.stroke();
    trazos.current[trazos.current.length - 1]?.push({ x, y });
  }

  /** Repinta todos los trazos guardados con `colorNuevo` sobre el lienzo (transparente). */
  function repintar(colorNuevo: string) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = colorNuevo;
    for (const trazo of trazos.current) {
      if (trazo.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(trazo[0].x, trazo[0].y);
      if (trazo.length === 1) ctx.lineTo(trazo[0].x + 0.01, trazo[0].y);
      for (const p of trazo.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }

  async function elegirColor(nuevo: string) {
    setColor(nuevo);
    if (trazos.current.length === 0) return;
    repintar(nuevo);
    await guardarLienzo();
  }

  async function terminarTrazo() {
    if (!dibujando.current) return;
    dibujando.current = false;
    await guardarLienzo();
  }

  async function guardarLienzo() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSubiendo(true);
    try {
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) return;
      const archivo = new File([blob], "firma-manuscrita.png", { type: "image/png" });
      const nombreSugerido = construirNombreBase({ tipo: "Firma", fecha: new Date() });
      const subido = await subirArchivo(archivo, { maxBytes: 2 * 1024 * 1024, nombreSugerido });
      onChange(subido.id);
    } catch {
      // Se deja el trazo en pantalla aunque la subida falle — el usuario puede reintentar limpiando y volviendo a firmar.
    } finally {
      setSubiendo(false);
    }
  }

  function limpiar() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    trazos.current = [];
    onChange(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button type="button" size="sm" variant={modo === "dibujar" ? "default" : "outline"} disabled={disabled} onClick={() => setModo("dibujar")}>
          Dibujar
        </Button>
        <Button type="button" size="sm" variant={modo === "subir" ? "default" : "outline"} disabled={disabled} onClick={() => setModo("subir")}>
          Subir imagen
        </Button>
      </div>
      {modo === "dibujar" ? (
        <div className="flex flex-col gap-1.5">
          <canvas
            ref={canvasRef}
            width={320}
            height={120}
            draggable={false}
            className="touch-none select-none rounded-md border bg-white"
            style={{ WebkitUserDrag: "none" } as React.CSSProperties}
            onMouseDown={empezarTrazo}
            onMouseMove={seguirTrazo}
            onMouseUp={terminarTrazo}
            onMouseLeave={terminarTrazo}
            onTouchStart={empezarTrazo}
            onTouchMove={seguirTrazo}
            onTouchEnd={terminarTrazo}
            onDragStart={(e) => e.preventDefault()}
          />
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Color de la firma">
            <span className="text-xs text-muted-foreground">Color de la firma:</span>
            {COLORES_FIRMA.map((c) => (
              <button
                key={c.valor}
                type="button"
                title={c.nombre}
                aria-label={c.nombre}
                aria-pressed={color.toLowerCase() === c.valor}
                disabled={disabled || subiendo}
                onClick={() => void elegirColor(c.valor)}
                className={`h-6 w-6 rounded-full border-2 transition ${color.toLowerCase() === c.valor ? "border-primary ring-2 ring-primary/40" : "border-border"}`}
                style={{ backgroundColor: c.valor }}
              />
            ))}
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              Otro:
              <input
                type="color"
                value={color}
                disabled={disabled || subiendo}
                onChange={(e) => void elegirColor(e.target.value)}
                className="h-6 w-8 cursor-pointer rounded border bg-transparent p-0"
                aria-label="Elegir otro color para la firma"
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="ghost" disabled={disabled || subiendo} onClick={limpiar}>
              Limpiar
            </Button>
            {subiendo && <span className="text-xs text-muted-foreground">Guardando…</span>}
          </div>
          <p className="text-xs text-muted-foreground">
            La firma se guarda con el color elegido y así se verá en todos los documentos que firmes. Si cambias el color después de dibujar, la firma se vuelve a guardar.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <CampoArchivo etiqueta="Imagen de la firma" valor={valor} onChange={onChange} aceptar="image/*" disabled={disabled} />
          <p className="text-xs text-muted-foreground">
            Una imagen subida se muestra tal cual está. Para elegir el color de la firma, usa la opción «Dibujar».
          </p>
        </div>
      )}
      {valor && modo === "dibujar" && <FirmaManuscritaUsuario firmaId={valor} />}
    </div>
  );
}

