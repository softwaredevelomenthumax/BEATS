/**
 * Reduce una foto antes de guardarla: las imágenes se almacenan en base64
 * dentro de `archivos_adjuntos`, así que una foto de 5-8 MB de un celular se
 * redimensiona (lado mayor 1600 px) y se recodifica como JPEG. Usada por el
 * Expediente del evento y por la app de Ejecución en Sitio (fotos tomadas con
 * la cámara).
 */
export interface ImagenComprimida {
  dataUrl: string;
  nombre: string;
  tipo: string;
  tamanoBytes: number;
}

export async function comprimirImagen(archivo: File, opciones: { ladoMaximo?: number; calidad?: number } = {}): Promise<ImagenComprimida> {
  const ladoMaximo = opciones.ladoMaximo ?? 1600;
  const calidad = opciones.calidad ?? 0.8;
  const bitmapUrl = URL.createObjectURL(archivo);
  try {
    const imagen = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("No se pudo leer la imagen."));
      img.src = bitmapUrl;
    });
    const escala = Math.min(1, ladoMaximo / Math.max(imagen.naturalWidth, imagen.naturalHeight));
    const ancho = Math.max(1, Math.round(imagen.naturalWidth * escala));
    const alto = Math.max(1, Math.round(imagen.naturalHeight * escala));
    const lienzo = document.createElement("canvas");
    lienzo.width = ancho;
    lienzo.height = alto;
    const contexto = lienzo.getContext("2d");
    if (!contexto) throw new Error("No se pudo procesar la imagen.");
    contexto.drawImage(imagen, 0, 0, ancho, alto);
    const dataUrl = lienzo.toDataURL("image/jpeg", calidad);
    // Tamaño aproximado del binario a partir del base64.
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    const tamanoBytes = Math.floor((base64.length * 3) / 4);
    const base = archivo.name.replace(/\.[^.]+$/, "") || "foto";
    return { dataUrl, nombre: `${base}.jpg`, tipo: "image/jpeg", tamanoBytes };
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

/** Convierte un `ImagenComprimida` en `File` (para pasarla por `subirArchivo`). */
export async function imagenComprimidaAArchivo(imagen: ImagenComprimida): Promise<File> {
  const respuesta = await fetch(imagen.dataUrl);
  const blob = await respuesta.blob();
  return new File([blob], imagen.nombre, { type: imagen.tipo });
}
