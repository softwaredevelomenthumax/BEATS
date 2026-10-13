import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FirmaCanvas, type FirmaCanvasHandle } from "./FirmaCanvas";
import type { ItemMuestraEntrega, ProductoPlaneadoEjecucion } from "../lib/rpc";

interface Props {
  nombreParticipante: string;
  productos: ProductoPlaneadoEjecucion[];
  enviando: boolean;
  onOmitir: () => void;
  onConfirmar: (items: ItemMuestraEntrega[], firmaDataUrl: string) => void;
}

/**
 * Entrega de muestras médicas — pantalla que sigue INMEDIATAMENTE al
 * check-in de la misma persona (nunca aparece de forma independiente,
 * porque esta app solo tiene acceso a datos vía RPC y el único
 * `registroParticipacionId` válido que puede obtener es el que acaba de
 * devolver `crear_registro_participacion`). Solo se ofrecen los productos
 * ya planeados para el evento (`evento_muestras_planeadas`, devueltos por
 * `validar_codigo_evento_ejecucion`) porque no existe ninguna RPC pública
 * para listar el portafolio completo de productos.
 */
export function FormularioEntregaMuestras({ nombreParticipante, productos, enviando, onOmitir, onConfirmar }: Props) {
  const [cantidades, setCantidades] = React.useState<Record<string, string>>({});
  const firmaRef = React.useRef<FirmaCanvasHandle>(null);

  function setCantidad(productoId: string, valor: string) {
    setCantidades((prev) => ({ ...prev, [productoId]: valor }));
  }

  function itemsSeleccionados(): ItemMuestraEntrega[] {
    return productos
      .map((p) => ({ productoId: p.productoId, cantidad: Number(cantidades[p.productoId] ?? 0) }))
      .filter((i) => i.cantidad > 0);
  }

  function confirmar(e: React.FormEvent) {
    e.preventDefault();
    const items = itemsSeleccionados();
    if (items.length === 0) {
      window.alert("Indica la cantidad entregada de al menos un producto, o usa \"Sin entrega de muestras\".");
      return;
    }
    const firmaDataUrl = firmaRef.current?.obtenerDataUrl();
    if (!firmaDataUrl) {
      window.alert("Falta la firma de confirmación de la entrega.");
      return;
    }
    onConfirmar(items, firmaDataUrl);
  }

  return (
    <form onSubmit={confirmar} className="flex flex-col gap-4 pb-24">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entrega de muestras médicas — {nombreParticipante}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {productos.length === 0 && (
            <p className="text-sm text-muted-foreground">Este evento no tiene productos planeados para entrega.</p>
          )}
          {productos.map((p) => (
            <div key={p.productoId} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">{p.nombre}</div>
                {p.cantidadAproximada != null && (
                  <div className="text-xs text-muted-foreground">Cantidad aproximada planeada: {p.cantidadAproximada}</div>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`muestra-${p.productoId}`} className="text-xs">Cantidad entregada</Label>
                <Input
                  id={`muestra-${p.productoId}`}
                  type="number"
                  min={0}
                  step={1}
                  className="w-24"
                  value={cantidades[p.productoId] ?? ""}
                  onChange={(e) => setCantidad(p.productoId, e.target.value)}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <FirmaCanvas ref={firmaRef} etiqueta="Firma de confirmación de entrega" />
        </CardContent>
      </Card>

      <div className="fixed inset-x-0 bottom-0 flex gap-2 border-t bg-background p-4">
        <Button type="button" variant="outline" className="flex-1 h-11" onClick={onOmitir} disabled={enviando}>
          Sin entrega de muestras
        </Button>
        <Button type="submit" className="flex-1 h-11 text-base" disabled={enviando || productos.length === 0}>
          {enviando ? "Guardando..." : "Confirmar entrega"}
        </Button>
      </div>
    </form>
  );
}
