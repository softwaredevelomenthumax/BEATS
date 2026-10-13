import { Accordion } from "@/components/ui/accordion";
import { SeccionAcordeon } from "@/components/forms/SeccionAcordeon";
import { Country } from "country-state-city";
import { MapPin } from "lucide-react";

/**
 * Ítem #3 de la entrega — reemplaza a `EditorCiudadesPorPais.tsx`
 * ("Ciudades por país"), renombrado a "Territorios" en toda la UI.
 *
 * Antes, este panel administraba manualmente `paises_region_ciudades`
 * (tabla que llegó vacía a producción y nunca se pobló) para "activar" el
 * desplegable de ciudad país por país. Ahora el selector de País → Estado
 * → Ciudad de los formularios (`SelectPaisEstadoCiudad.tsx`) se alimenta
 * directamente de `country-state-city`, un catálogo ISO offline con los 3
 * niveles completos para los ~250 países del mundo — ya no hace falta
 * cargar ciudades a mano ni país por país.
 *
 * `paises_region` (la tabla, NO `paises_region_ciudades`) se conserva
 * intacta y se sigue usando en otras partes de la app (el multi-selector
 * "País(es) de operación" de Usuarios y Roles, y los filtros de país de
 * Informe de Pagos, HCPs Impactados, Historial, Participación de Speaker y
 * Auditoría de Eventos — ver `src/lib/paisesRegion.ts`) — es la lista de
 * países donde opera el grupo, un catálogo distinto al de geografía
 * mundial que usa este selector. `paises_region_ciudades` tampoco se
 * borra (nunca tuvo datos que perder), solo deja de tener un editor de
 * administración propio, ya que el selector de formularios no la
 * consulta.
 */
export function EditorTerritorios() {
  const totalPaises = Country.getAllCountries().length;

  return (
    <Accordion type="single" collapsible defaultValue="territorios" className="flex flex-col gap-3">
      <SeccionAcordeon
        value="territorios"
        titulo="Territorios"
        descripcion="País, estado/provincia/departamento y ciudad de Solicitud de Evento, FMV, Convenio de Pago a HCP, Repositorio de Speakers y Usuarios y Roles."
      >
        <div className="flex items-start gap-3 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="flex flex-col gap-1">
            <p className="text-foreground">
              Los tres niveles (país, estado/provincia/departamento y ciudad) ahora vienen de un catálogo geográfico
              estándar ({totalPaises} países, con sus divisiones y ciudades) — ya no es necesario cargar países ni
              ciudades a mano aquí: los desplegables de los formularios se completan automáticamente en cascada al
              elegir el país y, luego, el estado/departamento.
            </p>
            <p>
              Un registro anterior a este cambio, guardado con un país, estado o ciudad que no coincida exactamente
              con el catálogo (por ejemplo, un valor cargado como texto libre), se sigue mostrando y se puede seguir
              editando sin problema — el formulario lo respeta como "valor guardado" hasta que se reemplace por una
              opción del catálogo.
            </p>
            <p>
              La lista de países donde opera el grupo (usada en Usuarios y Roles → "País(es) de operación", y en los
              filtros de país de Informe de Pagos, HCPs Impactados, Historial, Participación de Speaker y Auditoría
              de Eventos) es un catálogo aparte y no cambia con esta actualización.
            </p>
          </div>
        </div>
      </SeccionAcordeon>
    </Accordion>
  );
}
