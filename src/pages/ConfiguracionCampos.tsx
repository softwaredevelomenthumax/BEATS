import { EditorCamposPersonalizados } from "@/components/admin/EditorCamposPersonalizados";
import { EditorEtiquetasCampo } from "@/components/admin/EditorEtiquetasCampo";
import { EditorPortafolioProductos } from "@/components/admin/EditorPortafolioProductos";
import { EditorConfiguracionFormatos } from "@/components/admin/EditorConfiguracionFormatos";
import { EditorCatalogosSimples } from "@/components/admin/EditorCatalogosSimples";
import { EditorTerritorios } from "@/components/admin/EditorTerritorios";

export function ConfiguracionCampos() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Configuración de Campos</h1>
        <p className="text-sm text-muted-foreground">
          Panel de administración para extender y renombrar los campos de cada formulario, el portafolio de productos y los formatos de impresión — sin tocar código.
        </p>
      </div>
      <EditorCamposPersonalizados />
      <EditorEtiquetasCampo />
      <EditorCatalogosSimples />
      <EditorTerritorios />
      <EditorPortafolioProductos />
      <EditorConfiguracionFormatos />
    </div>
  );
}
