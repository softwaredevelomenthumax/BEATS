import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ToggleCapsula } from "@/components/ui/toggle-capsula";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calcularValorCampo, type CampoPersonalizadoDefinicion } from "@/lib/camposPersonalizados";

interface Props {
  campos: CampoPersonalizadoDefinicion[];
  valores: Record<string, unknown>;
  valoresParaCalculo: Record<string, unknown>;
  onChange: (clave: string, valor: unknown) => void;
  errores?: Record<string, string>;
}

/**
 * Renderiza el subconjunto de Campos Personalizados aplicable a una sección
 * de un formulario. Los valores capturados viven en la columna
 * `campos_personalizados` (jsonb) del documento, con `clave` como llave.
 */
export function CamposPersonalizadosSeccion({ campos, valores, valoresParaCalculo, onChange, errores }: Props) {
  if (campos.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 rounded-md border border-dashed border-border bg-muted/30 p-4 sm:grid-cols-2">
      {campos.map((campo) => (
        <div key={campo.id} className="flex flex-col gap-1.5">
          <Label htmlFor={`cp-${campo.clave}`}>
            {campo.etiqueta}
            {campo.obligatorio && <span className="text-destructive"> *</span>}
          </Label>

          {campo.tipo === "texto" && (
            <Input
              id={`cp-${campo.clave}`}
              value={String(valores[campo.clave] ?? "")}
              onChange={(e) => onChange(campo.clave, e.target.value)}
            />
          )}

          {campo.tipo === "numero" && (
            <Input
              id={`cp-${campo.clave}`}
              type="number"
              min={0}
              value={String(valores[campo.clave] ?? "")}
              onChange={(e) => onChange(campo.clave, e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))}
            />
          )}

          {campo.tipo === "fecha" && (
            <Input
              id={`cp-${campo.clave}`}
              type="date"
              value={String(valores[campo.clave] ?? "")}
              onChange={(e) => onChange(campo.clave, e.target.value)}
            />
          )}

          {campo.tipo === "booleano" && (
            <ToggleCapsula
              value={Boolean(valores[campo.clave]) ? "si" : "no"}
              onValueChange={(v) => onChange(campo.clave, v === "si")}
              opciones={[
                { value: "no", label: "No" },
                { value: "si", label: "Sí" },
              ]}
            />
          )}

          {campo.tipo === "seleccion" && (
            <Select
              value={String(valores[campo.clave] ?? "")}
              onValueChange={(v) => onChange(campo.clave, v)}
            >
              <SelectTrigger id={`cp-${campo.clave}`}>
                <SelectValue placeholder="Selecciona una opción" />
              </SelectTrigger>
              <SelectContent>
                {campo.opciones.map((opcion) => (
                  <SelectItem key={opcion} value={opcion}>
                    {opcion}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {campo.tipo === "calculado" && (
            <Input
              id={`cp-${campo.clave}`}
              disabled
              value={calcularValorCampo(campo, valoresParaCalculo)}
            />
          )}

          {errores?.[campo.clave] && <p className="text-xs text-destructive">{errores[campo.clave]}</p>}
        </div>
      ))}
    </div>
  );
}
