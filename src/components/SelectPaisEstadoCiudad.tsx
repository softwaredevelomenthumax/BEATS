import * as React from "react";
import { Country, State, City } from "country-state-city";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ordenAlfabetico } from "@/lib/catalogos";

/**
 * Ítem #3 de la entrega (reemplaza `SelectPaisCiudad.tsx` + el catálogo
 * suelto "estados" de `catalogo_valores`): selector dependiente de 3
 * niveles País → Estado/Provincia/Departamento → Ciudad.
 *
 * `paises_region`/`paises_region_ciudades` (la fuente del viejo
 * `SelectPaisCiudad`) solo tenían países cargados — la tabla de ciudades
 * llegó vacía y nunca se pobló, así que el desplegable de ciudad quedaba
 * casi siempre en texto libre. En paralelo, el catálogo "estados" (de
 * `catalogo_valores`, editable en Catálogos de opciones) era una lista
 * plana de nombres de estado/departamento SIN ninguna relación con el país
 * elegido — un usuario en Colombia veía provincias de Argentina mezcladas.
 *
 * En vez de intentar mantener sincronizadas dos tablas de la base de datos
 * (una con 2 niveles, vacía) con una jerarquía real de 3 niveles, este
 * componente usa `country-state-city` — un dataset ISO país→estado→ciudad
 * completo y offline (sin llamadas de red, funciona en este sandbox) — como
 * fuente de verdad para los TRES niveles. `paises_region` se deja intacta:
 * sigue alimentando el filtro "País(es) de operación" y otros lugares que
 * solo necesitan la lista de países donde opera el grupo (ver
 * `src/lib/paisesRegion.ts`), un uso distinto al de este selector.
 *
 * Los nombres de país se muestran en español vía `Intl.DisplayNames`
 * (nativo del navegador, sin dependencia extra) para que coincidan con los
 * datos ya guardados ("Colombia", "México", "Perú", "Brasil", ...). Estado
 * y ciudad vienen tal como los expone la librería (para Latinoamérica ya
 * están en español/nombre local: "Antioquia", "Bogotá D.C.", etc.).
 *
 * Continuidad de datos: los eventos/convenios/FMV/speakers ya guardados
 * tienen país/estado/ciudad como texto libre, que puede no calzar
 * exactamente con la librería (acentos, alias, un valor que ya no existe
 * en el dataset). En cada nivel, si el valor guardado no aparece entre las
 * opciones de la librería, se agrega como una opción extra al principio de
 * la lista (marcada "valor guardado") — así el registro histórico sigue
 * siendo visible y editable sin perder el dato, aunque no sea una opción
 * "oficial" de la librería.
 */

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

interface Opcion {
  value: string;
  label: string;
}

let cacheNombresPaises: Opcion[] | null = null;

function nombresPaises(): Opcion[] {
  if (cacheNombresPaises) return cacheNombresPaises;
  let nombrePorIso: ((iso: string) => string | undefined) | null = null;
  try {
    const dn = new Intl.DisplayNames(["es"], { type: "region" });
    nombrePorIso = (iso: string) => dn.of(iso);
  } catch {
    nombrePorIso = undefined as unknown as (iso: string) => string | undefined;
  }
  cacheNombresPaises = Country.getAllCountries()
    .map((c) => ({ value: nombrePorIso?.(c.isoCode) || c.name, iso: c.isoCode }))
    .map((c) => ({ value: c.value, label: c.value }));
  cacheNombresPaises.sort((a, b) => ordenAlfabetico(a.label, b.label));
  return cacheNombresPaises;
}

function isoDePais(valorPais: string): string | null {
  if (!valorPais) return null;
  const objetivo = normalizar(valorPais);
  const dn = (() => {
    try {
      return new Intl.DisplayNames(["es"], { type: "region" });
    } catch {
      return null;
    }
  })();
  for (const c of Country.getAllCountries()) {
    const nombreEs = dn?.of(c.isoCode);
    if (normalizar(c.name) === objetivo || (nombreEs && normalizar(nombreEs) === objetivo)) {
      return c.isoCode;
    }
  }
  return null;
}

function isoDeEstado(isoPais: string, valorEstado: string): string | null {
  if (!valorEstado) return null;
  const objetivo = normalizar(valorEstado);
  const estado = State.getStatesOfCountry(isoPais).find((s) => normalizar(s.name) === objetivo);
  return estado?.isoCode ?? null;
}

function conValorGuardado(opciones: Opcion[], valorGuardado: string): Opcion[] {
  if (!valorGuardado) return opciones;
  const yaExiste = opciones.some((o) => normalizar(o.value) === normalizar(valorGuardado));
  if (yaExiste) return opciones;
  return [{ value: valorGuardado, label: `${valorGuardado} (valor guardado)` }, ...opciones];
}

interface Props {
  idPrefix: string;
  etiquetaPais: string;
  etiquetaEstado: string;
  etiquetaCiudad: string;
  valorPais: string;
  valorEstado: string;
  valorCiudad: string;
  /**
   * Un solo callback para los 3 valores juntos — mismo motivo que en el
   * `SelectPaisCiudad` original: si el país cambia y hay que limpiar
   * estado/ciudad, dos o tres llamadas `onChange` separadas y sincrónicas
   * pisarían el resultado unas a otras porque todas parten del mismo
   * `valorActual` cerrado por clausura en el render en curso. Un único
   * callback que entrega el trío completo evita esa clase de bug de raíz.
   */
  onChangePaisEstadoCiudad: (pais: string, estado: string, ciudad: string) => void;
  errorPais?: string;
  errorEstado?: string;
  errorCiudad?: string;
  disabled?: boolean;
}

export function SelectPaisEstadoCiudad({
  idPrefix,
  etiquetaPais,
  etiquetaEstado,
  etiquetaCiudad,
  valorPais,
  valorEstado,
  valorCiudad,
  onChangePaisEstadoCiudad,
  errorPais,
  errorEstado,
  errorCiudad,
  disabled,
}: Props) {
  const opcionesPais = React.useMemo(() => conValorGuardado(nombresPaises(), valorPais), [valorPais]);
  const isoPais = React.useMemo(() => isoDePais(valorPais), [valorPais]);

  const estadosDelPais = React.useMemo(
    () => (isoPais ? State.getStatesOfCountry(isoPais) : []),
    [isoPais],
  );
  const opcionesEstado = React.useMemo(() => {
    const base = estadosDelPais.map((s) => ({ value: s.name, label: s.name })).sort((a, b) => ordenAlfabetico(a.label, b.label));
    return conValorGuardado(base, valorEstado);
  }, [estadosDelPais, valorEstado]);

  const isoEstado = React.useMemo(() => (isoPais ? isoDeEstado(isoPais, valorEstado) : null), [isoPais, valorEstado]);

  const ciudadesDelEstado = React.useMemo(() => {
    if (!isoPais) return [];
    if (isoEstado) return City.getCitiesOfState(isoPais, isoEstado);
    if (estadosDelPais.length === 0) return City.getCitiesOfCountry(isoPais) ?? [];
    return [];
  }, [isoPais, isoEstado, estadosDelPais]);
  const opcionesCiudad = React.useMemo(() => {
    const base = ciudadesDelEstado
      .map((c) => ({ value: c.name, label: c.name }))
      .sort((a, b) => ordenAlfabetico(a.label, b.label));
    return conValorGuardado(base, valorCiudad);
  }, [ciudadesDelEstado, valorCiudad]);

  function alElegirPais(nuevoPais: string) {
    // País nuevo: se limpian estado y ciudad salvo que, por coincidencia,
    // el valor actual también exista en el país nuevo (poco común, pero se
    // revisa igual por consistencia con el resto del formulario).
    const nuevoIso = isoDePais(nuevoPais);
    const estadosNuevoPais = nuevoIso ? State.getStatesOfCountry(nuevoIso) : [];
    const estadoSigueSiendoValido = estadosNuevoPais.some((s) => normalizar(s.name) === normalizar(valorEstado));
    const nuevoEstado = estadoSigueSiendoValido ? valorEstado : "";
    onChangePaisEstadoCiudad(nuevoPais, nuevoEstado, nuevoEstado ? valorCiudad : "");
  }

  function alElegirEstado(nuevoEstado: string) {
    const nuevoIsoEstado = isoPais ? isoDeEstado(isoPais, nuevoEstado) : null;
    const ciudadesNuevoEstado = nuevoIsoEstado && isoPais ? City.getCitiesOfState(isoPais, nuevoIsoEstado) : [];
    const ciudadSigueSiendoValida = ciudadesNuevoEstado.some((c) => normalizar(c.name) === normalizar(valorCiudad));
    onChangePaisEstadoCiudad(valorPais, nuevoEstado, ciudadSigueSiendoValida ? valorCiudad : "");
  }

  function alElegirCiudad(nuevaCiudad: string) {
    onChangePaisEstadoCiudad(valorPais, valorEstado, nuevaCiudad);
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-pais`}>{etiquetaPais}</Label>
        <Select value={valorPais} onValueChange={alElegirPais} disabled={disabled}>
          <SelectTrigger id={`${idPrefix}-pais`}><SelectValue placeholder="Selecciona un país" /></SelectTrigger>
          <SelectContent>
            {opcionesPais.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errorPais && <p className="text-xs text-destructive">{errorPais}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-estado`}>{etiquetaEstado}</Label>
        <Select value={valorEstado} onValueChange={alElegirEstado} disabled={disabled || !valorPais}>
          <SelectTrigger id={`${idPrefix}-estado`}><SelectValue placeholder="Selecciona un estado/departamento" /></SelectTrigger>
          <SelectContent>
            {opcionesEstado.map((e) => (
              <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!valorPais && <p className="text-xs text-muted-foreground">Elige primero un país.</p>}
        {valorPais && opcionesEstado.length === 0 && (
          <p className="text-xs text-muted-foreground">Este país no tiene divisiones de estado/provincia en el catálogo.</p>
        )}
        {errorEstado && <p className="text-xs text-destructive">{errorEstado}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-ciudad`}>{etiquetaCiudad}</Label>
        <Select value={valorCiudad} onValueChange={alElegirCiudad} disabled={disabled || !valorPais}>
          <SelectTrigger id={`${idPrefix}-ciudad`}><SelectValue placeholder="Selecciona una ciudad" /></SelectTrigger>
          <SelectContent>
            {opcionesCiudad.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {valorPais && opcionesCiudad.length === 0 && (
          <p className="text-xs text-muted-foreground">No hay ciudades en el catálogo para esta selección.</p>
        )}
        {errorCiudad && <p className="text-xs text-destructive">{errorCiudad}</p>}
      </div>
    </>
  );
}
