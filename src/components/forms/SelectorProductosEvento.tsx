import * as React from "react";
import { Check, ChevronDown, Package, Star, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ProductoEvento } from "@/types";
import type { ProductoResumen } from "@/lib/productos";

/**
 * Entrega 31 (octubre 2026): campo «Productos» de la Solicitud de Evento.
 * Selección múltiple desde el portafolio. Con un solo producto, ese queda
 * automáticamente como «Producto principal del evento»; con varios, el usuario
 * marca exactamente uno.
 */
export function SelectorProductosEvento({
  valor,
  disponibles,
  onChange,
  disabled,
  error,
}: {
  valor: ProductoEvento[];
  disponibles: ProductoResumen[];
  onChange: (productos: ProductoEvento[]) => void;
  disabled?: boolean;
  error?: string;
}) {
  const [busqueda, setBusqueda] = React.useState("");
  const idsSeleccionados = new Set(valor.map((p) => p.productoId));

  const filtrados = disponibles.filter((p) => p.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()));

  function alternar(producto: ProductoResumen) {
    if (idsSeleccionados.has(producto.id)) {
      quitar(producto.id);
      return;
    }
    const nuevos = [...valor, { productoId: producto.id, nombreProducto: producto.nombre, principal: false }];
    onChange(normalizar(nuevos));
  }

  function quitar(productoId: string) {
    const restantes = valor.filter((p) => p.productoId !== productoId);
    onChange(normalizar(restantes));
  }

  function marcarPrincipal(productoId: string) {
    onChange(valor.map((p) => ({ ...p, principal: p.productoId === productoId })));
  }

  // Un solo producto → principal automático. Con varios se conserva la marca existente (si se quitó el principal, queda sin marcar y se exige elegir).
  function normalizar(lista: ProductoEvento[]): ProductoEvento[] {
    if (lista.length === 0) return [];
    if (lista.length === 1) return [{ ...lista[0], principal: true }];
    const principalesValidos = lista.filter((p) => p.principal);
    if (principalesValidos.length === 1) return lista;
    return lista.map((p) => ({ ...p, principal: false }));
  }

  const hayVarios = valor.length > 1;
  const sinPrincipal = hayVarios && !valor.some((p) => p.principal);

  return (
    <div className="flex flex-col gap-2" data-testid="evento-productos">
      <Label htmlFor="evento-productos-boton">Productos</Label>
      <Popover>
        <PopoverTrigger asChild>
          <button
            id="evento-productos-boton"
            type="button"
            disabled={disabled}
            data-testid="evento-productos-boton"
            className={cn(
              "inline-flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-white px-3 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60",
              error ? "border-destructive" : "border-input",
            )}
          >
            <span className={cn("truncate", valor.length === 0 && "text-muted-foreground")}>
              {valor.length === 0 ? "Selecciona uno o varios productos del portafolio" : `${valor.length} producto${valor.length === 1 ? "" : "s"} seleccionado${valor.length === 1 ? "" : "s"}`}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-64 p-2" align="start">
          <Input
            placeholder="Buscar producto…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="mb-2 h-8 text-sm"
            data-testid="evento-productos-buscar"
          />
          <ul className="max-h-64 overflow-auto">
            {filtrados.length === 0 && <li className="px-2 py-2 text-sm text-muted-foreground">Sin coincidencias.</li>}
            {filtrados.map((p) => {
              const marcado = idsSeleccionados.has(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={marcado}
                    onClick={() => alternar(p)}
                    data-testid={`evento-productos-op-${p.id}`}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                  >
                    <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", marcado ? "border-[#00A3E0] bg-[#00A3E0] text-white" : "border-slate-300")}>
                      {marcado && <Check className="h-3 w-3" />}
                    </span>
                    <span className="flex-1 truncate">{p.nombre}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </PopoverContent>
      </Popover>

      {valor.length > 0 && (
        <ul className="flex flex-col gap-1.5" data-testid="evento-productos-seleccionados">
          {valor.map((p) => (
            <li key={p.productoId} className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-sm" data-testid={`evento-producto-${p.productoId}`}>
              <Package className="h-4 w-4 shrink-0 text-[#00A3E0]" />
              <span className="flex-1 truncate font-medium">{p.nombreProducto}</span>
              {hayVarios ? (
                <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                  <input
                    type="radio"
                    name="evento-producto-principal"
                    checked={p.principal}
                    disabled={disabled}
                    onChange={() => marcarPrincipal(p.productoId)}
                    data-testid={`evento-producto-principal-${p.productoId}`}
                  />
                  Producto principal del evento
                </label>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                  <Star className="h-3 w-3" /> Producto principal del evento
                </span>
              )}
              {!disabled && (
                <button type="button" aria-label={`Quitar ${p.nombreProducto}`} onClick={() => quitar(p.productoId)} className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {sinPrincipal && !error && <p className="text-xs text-amber-700">Marca cuál de los productos es el «Producto principal del evento».</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
