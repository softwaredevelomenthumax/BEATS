import { TriangleAlert } from "lucide-react";

/**
 * Entrega 32. El Convenio HCP se imprime (vista previa, impresión y PDF) en DOS columnas: inglés y español. La ventana
 * del documento en pantalla muestra un solo idioma a la vez, así que quien corrige solo uno de los dos textos ve su cambio
 * en pantalla pero, al imprimir, la otra columna sigue con el texto anterior (y parece que "no se guardó").
 * Este aviso aparece cuando exactamente uno de los dos idiomas cambió respecto del texto original.
 */
export function idiomaDesalineado(actual: { es: string; en: string }, original?: { es: string; en: string }): "es" | "en" | null {
  if (!original) return null;
  const cambioEs = (actual.es ?? "") !== (original.es ?? "");
  const cambioEn = (actual.en ?? "") !== (original.en ?? "");
  if (cambioEs && !cambioEn) return "es";
  if (cambioEn && !cambioEs) return "en";
  return null;
}

export function AvisoIdiomaDesalineado({ actual, original }: { actual: { es: string; en: string }; original?: { es: string; en: string } }) {
  const cambio = idiomaDesalineado(actual, original);
  if (!cambio) return null;
  const modificado = cambio === "es" ? "español" : "inglés";
  const pendiente = cambio === "es" ? "inglés" : "español";
  return (
    <p
      className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 sm:col-span-2"
      data-testid="aviso-idioma-desalineado"
      role="status"
    >
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
      <span>
        Modificaste el texto en {modificado}, pero el texto en {pendiente} sigue igual al original. La vista previa, la impresión y el PDF son
        bilingües: mostrarán el {pendiente} anterior junto al {modificado} nuevo. Actualiza también el {pendiente} si el cambio debe verse en ambas columnas.
      </span>
    </p>
  );
}
