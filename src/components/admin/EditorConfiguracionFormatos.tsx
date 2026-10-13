import { useConfirmar } from "@/hooks/useConfirmar";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion } from "@/components/ui/accordion";
import { SeccionAcordeon } from "@/components/forms/SeccionAcordeon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, History } from "lucide-react";
import { useCatalogo } from "@/lib/catalogos";
import { useAuth } from "@/hooks/useAuth";
import { ETIQUETA_TIPO_DOC } from "@/lib/enums";
import {
  traerConfiguracionFormatos,
  guardarConfiguracionFormatos,
  traerConfiguracionFormatosEmpresas,
  guardarConfiguracionFormatosEmpresa,
  eliminarConfiguracionFormatosEmpresa,
  traerFormatoOficialFmv,
  registrarFormatoOficialFmv,
  eliminarFormatoOficialFmv,
  traerConfiguracionFormatosHistorial,
  registrarConfiguracionFormatosHistorial,
} from "@/lib/configuracionFormatos";
import { CampoArchivo } from "@/components/archivos/CampoArchivo";
import { VisorArchivo } from "@/components/archivos/VisorArchivo";
import { formatearFecha, formatearFechaHora } from "@/lib/fecha";
import type {
  ConfiguracionFormatos,
  ConfiguracionFormatosEmpresa,
  ConfiguracionFormatosHistorialEntrada,
  ConfiguracionFormatosPorDoc,
  FormatoOficialFmv,
} from "@/types";

const TIPOS: (keyof ConfiguracionFormatosPorDoc)[] = ["evento", "convenio", "convenioHCP", "fmv", "notificacionPago", "caf"];

const FORMATO_VACIO = { proceso: "", codigo: "", version: "", fechaEmision: null as string | null };

/** Valor especial del selector de empresa para "aplica a todas" — distinto
 * de "" (que Radix Select reserva/trata como vacío) para poder usarlo como
 * `value` de un `SelectItem`. Se traduce a `empresaGrupo: ""` (global) al
 * guardar/registrar historial. */
const GLOBAL = "__global__";

function fechaHistorial(fecha: string): string {
  try {
    return formatearFechaHora(fecha);
  } catch {
    return fecha;
  }
}

/** Lista de solo lectura, compacta, de las últimas entradas de historial de
 * una sección — mismo espíritu que el historial de "Formato Oficial FMV"
 * ya existente (Card 3), reutilizado para los ítems #4 y #5. */
function ListaHistorial({ entradas }: { entradas: ConfiguracionFormatosHistorialEntrada[] }) {
  if (entradas.length === 0) {
    return <p className="text-xs text-muted-foreground">Todavía no hay cambios registrados en el historial.</p>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {entradas.slice(0, 8).map((h) => (
        <div key={h.id} className="rounded-md border p-2 text-xs text-muted-foreground">
          <span className="text-foreground">{fechaHistorial(h.fecha)}</span>
          {" — "}
          {h.usuarioEmail ?? "usuario desconocido"}
          {" — "}
          {h.empresaGrupo ? h.empresaGrupo : "Global (todas las empresas)"}
          {h.tipoDocumento ? ` — ${ETIQUETA_TIPO_DOC[h.tipoDocumento] ?? h.tipoDocumento}` : ""}
        </div>
      ))}
    </div>
  );
}

export function EditorConfiguracionFormatos() {
  const { usuario } = useAuth();
  const { opciones: empresas } = useCatalogo("empresasGrupo");
  const [global, setGlobal] = React.useState<ConfiguracionFormatos | null>(null);
  const [porEmpresa, setPorEmpresa] = React.useState<ConfiguracionFormatosEmpresa[]>([]);
  const [formatosOficialesFmv, setFormatosOficialesFmv] = React.useState<FormatoOficialFmv[]>([]);
  const [historial, setHistorial] = React.useState<ConfiguracionFormatosHistorialEntrada[]>([]);
  const [cargando, setCargando] = React.useState(true);
  const [tipoActivo, setTipoActivo] = React.useState<keyof ConfiguracionFormatosPorDoc>("evento");
  // Ítem #4: un único selector de empresa gobierna si la tarjeta de
  // "Configuración de Formatos" edita la configuración global o el
  // override de una empresa puntual — antes eran dos tarjetas separadas
  // (una sin ningún selector, siempre global, y otra con selector, solo
  // para overrides); se consolidan en una para que "elegir la empresa a la
  // que pertenece" sea un único gesto en un único lugar, con "Global" como
  // una opción más de la misma lista en vez de la ausencia de selección.
  const [empresaFormato, setEmpresaFormato] = React.useState<string>(GLOBAL);
  const [empresaDeclaracion, setEmpresaDeclaracion] = React.useState<string>(GLOBAL);
  const [borradorDeclaracion, setBorradorDeclaracion] = React.useState("");
  const [nuevaVigencia, setNuevaVigencia] = React.useState("");
  const [nuevaVigenciaEmpresa, setNuevaVigenciaEmpresa] = React.useState("");
  const [nuevaVigenciaArchivoId, setNuevaVigenciaArchivoId] = React.useState<string | null>(null);

  function recargar() {
    setCargando(true);
    Promise.all([
      traerConfiguracionFormatos(),
      traerConfiguracionFormatosEmpresas(),
      traerFormatoOficialFmv(),
      traerConfiguracionFormatosHistorial(),
    ])
      .then(([g, e, f, h]) => {
        setGlobal(g);
        setPorEmpresa(e);
        setFormatosOficialesFmv(f);
        setHistorial(h);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "No se pudo cargar la configuración de formatos."))
      .finally(() => setCargando(false));
  }

  React.useEffect(recargar, []);

  function registrarHistorial(entrada: Parameters<typeof registrarConfiguracionFormatosHistorial>[0]) {
    registrarConfiguracionFormatosHistorial({
      ...entrada,
      usuarioId: usuario?.id ?? null,
      usuarioEmail: usuario?.email ?? null,
    }).then(() => traerConfiguracionFormatosHistorial().then(setHistorial));
  }

  const empresaFormatoConfig = porEmpresa.find((e) => e.empresaGrupo === empresaFormato) ?? null;
  const [borradorEmpresa, setBorradorEmpresa] = React.useState(FORMATO_VACIO);

  // El borrador se resincroniza cada vez que se cambia de empresa/tipo de
  // documento o llega una recarga desde el servidor — se guarda con un
  // botón explícito (igual que el resto de editores admin) en vez de
  // disparar un upsert por cada tecla.
  React.useEffect(() => {
    if (empresaFormato === GLOBAL) return;
    setBorradorEmpresa(empresaFormatoConfig?.formatos[tipoActivo] ?? { ...FORMATO_VACIO });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaFormato, tipoActivo, empresaFormatoConfig]);

  React.useEffect(() => {
    if (!global) return;
    if (empresaDeclaracion === GLOBAL) {
      setBorradorDeclaracion(global.declaracionTratamientoDatos);
    } else {
      const config = porEmpresa.find((e) => e.empresaGrupo === empresaDeclaracion);
      setBorradorDeclaracion(config?.declaracionTratamientoDatos ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaDeclaracion, global, porEmpresa]);

  async function guardarGlobal() {
    if (!global) return;
    try {
      await guardarConfiguracionFormatos(global);
      toast.success("Configuración de formatos guardada.");
      registrarHistorial({ seccion: "formato", tipoDocumento: tipoActivo, empresaGrupo: "", valores: global.formatos[tipoActivo] });
      recargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    }
  }

  async function guardarEmpresaFormato() {
    if (empresaFormato === GLOBAL) return;
    const base: ConfiguracionFormatosEmpresa = empresaFormatoConfig ?? {
      empresaGrupo: empresaFormato,
      formatos: {},
      logoId: null,
      logoAnchoPx: null,
      logoAltoPx: null,
      declaracionTratamientoDatos: null,
    };
    const actualizado = { ...base, formatos: { ...base.formatos, [tipoActivo]: borradorEmpresa } };
    try {
      await guardarConfiguracionFormatosEmpresa(actualizado);
      toast.success("Override guardado.");
      registrarHistorial({ seccion: "formato", tipoDocumento: tipoActivo, empresaGrupo: empresaFormato, valores: borradorEmpresa });
      recargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el override.");
    }
  }

  /** El logo se guarda apenas se carga/quita — a diferencia de proceso/código/versión, no tiene sentido esperar al botón "Guardar" para un archivo que ya se subió. */
  async function guardarLogo(logoId: string | null, logoApp = false) {
    try {
      if (empresaFormato === GLOBAL) {
        if (!global) return;
        await guardarConfiguracionFormatos({ ...global, [logoApp ? "logoAppId" : "logoId"]: logoId });
      } else {
        const base: ConfiguracionFormatosEmpresa = empresaFormatoConfig ?? {
          empresaGrupo: empresaFormato,
          formatos: {},
          logoId: null,
          logoAnchoPx: null,
          logoAltoPx: null,
          declaracionTratamientoDatos: null,
        };
        await guardarConfiguracionFormatosEmpresa({ ...base, logoId });
      }
      recargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el logo.");
    }
  }

  const confirmar = useConfirmar();
  async function eliminarOverrideEmpresa() {
    if (!(await confirmar({ titulo: "Quitar overrides", mensaje: "¿Quitar todos los overrides de esta empresa? Volverá a usar la configuración global." }))) return;
    if (empresaFormato === GLOBAL) return;
    try {
      await eliminarConfiguracionFormatosEmpresa(empresaFormato);
      toast.success("Override eliminado — esa empresa vuelve a usar la configuración global.");
      recargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar.");
    }
  }

  // Ítem #5: la Declaración de tratamiento de datos vive en el mismo campo
  // de siempre (`configuracion_formatos.declaracion_tratamiento_datos` /
  // `configuracion_formatos_empresa.declaracion_tratamiento_datos` — la
  // tabla no cambia), pero ahora se guarda desde su propia tarjeta con su
  // propio selector global/empresa, reutilizando las mismas funciones de
  // guardado (siempre suben la fila completa) sin tocar los demás campos.
  async function guardarDeclaracion() {
    try {
      if (empresaDeclaracion === GLOBAL) {
        if (!global) return;
        const actualizado = { ...global, declaracionTratamientoDatos: borradorDeclaracion };
        await guardarConfiguracionFormatos(actualizado);
        registrarHistorial({ seccion: "declaracion_tratamiento_datos", empresaGrupo: "", valores: { declaracionTratamientoDatos: borradorDeclaracion } });
      } else {
        const base: ConfiguracionFormatosEmpresa = porEmpresa.find((e) => e.empresaGrupo === empresaDeclaracion) ?? {
          empresaGrupo: empresaDeclaracion,
          formatos: {},
          logoId: null,
          logoAnchoPx: null,
          logoAltoPx: null,
          declaracionTratamientoDatos: null,
        };
        await guardarConfiguracionFormatosEmpresa({ ...base, declaracionTratamientoDatos: borradorDeclaracion });
        registrarHistorial({
          seccion: "declaracion_tratamiento_datos",
          empresaGrupo: empresaDeclaracion,
          valores: { declaracionTratamientoDatos: borradorDeclaracion },
        });
      }
      toast.success("Declaración de tratamiento de datos guardada.");
      recargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la declaración.");
    }
  }

  async function agregarFormatoOficialFmv() {
    if (!nuevaVigencia) {
      toast.error("Indica la fecha de vigencia.");
      return;
    }
    try {
      await registrarFormatoOficialFmv(nuevaVigencia, nuevaVigenciaEmpresa, nuevaVigenciaArchivoId);
      toast.success("Versión registrada.");
      setNuevaVigencia("");
      setNuevaVigenciaArchivoId(null);
      recargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar.");
    }
  }

  async function quitarFormatoOficialFmv(id: string) {
    if (!(await confirmar({ titulo: "Eliminar formato", mensaje: "¿Eliminar este formato oficial? Esta acción no se puede deshacer." }))) return;
    try {
      await eliminarFormatoOficialFmv(id);
      recargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar.");
    }
  }

  if (cargando || !global) {
    return (
      <Card>
        <CardHeader><CardTitle>Configuración de Formatos</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Cargando...</p></CardContent>
      </Card>
    );
  }

  const valoresFormatoActivos = empresaFormato === GLOBAL ? global.formatos[tipoActivo] : borradorEmpresa;
  const historialFormato = historial.filter((h) => h.seccion === "formato");
  const historialDeclaracion = historial.filter((h) => h.seccion === "declaracion_tratamiento_datos");

  return (
    <Accordion
      type="multiple"
      defaultValue={["configuracion-formatos", "declaracion-tratamiento-datos", "formato-oficial-fmv"]}
      className="flex flex-col gap-3"
    >
      <SeccionAcordeon
        value="configuracion-formatos"
        titulo="Configuración de Formatos"
        descripcion="Proceso/código/versión/fecha de emisión de cada tipo de documento, para el encabezado de impresión — global o, si se elige una empresa, un override que reemplaza campo por campo (uno vacío hereda el valor global)."
      >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:max-w-xl">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cf-empresa">Empresa del grupo</Label>
              <Select value={empresaFormato} onValueChange={setEmpresaFormato}>
                <SelectTrigger id="cf-empresa"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={GLOBAL}>Global (todas las empresas)</SelectItem>
                  {empresas.map((e) => (
                    <SelectItem key={e} value={e}>{e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cf-tipo">Tipo de documento</Label>
              <Select value={tipoActivo} onValueChange={(v) => setTipoActivo(v as keyof ConfiguracionFormatosPorDoc)}>
                <SelectTrigger id="cf-tipo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t} value={t}>{ETIQUETA_TIPO_DOC[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cf-proceso">Proceso</Label>
              <Input
                id="cf-proceso"
                placeholder={empresaFormato !== GLOBAL ? global.formatos[tipoActivo].proceso : undefined}
                value={valoresFormatoActivos.proceso}
                onChange={(e) =>
                  empresaFormato === GLOBAL
                    ? setGlobal({ ...global, formatos: { ...global.formatos, [tipoActivo]: { ...global.formatos[tipoActivo], proceso: e.target.value } } })
                    : setBorradorEmpresa({ ...borradorEmpresa, proceso: e.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cf-codigo">Código</Label>
              <Input
                id="cf-codigo"
                placeholder={empresaFormato !== GLOBAL ? global.formatos[tipoActivo].codigo : undefined}
                value={valoresFormatoActivos.codigo}
                onChange={(e) =>
                  empresaFormato === GLOBAL
                    ? setGlobal({ ...global, formatos: { ...global.formatos, [tipoActivo]: { ...global.formatos[tipoActivo], codigo: e.target.value } } })
                    : setBorradorEmpresa({ ...borradorEmpresa, codigo: e.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cf-version">Versión</Label>
              <Input
                id="cf-version"
                placeholder={empresaFormato !== GLOBAL ? global.formatos[tipoActivo].version : undefined}
                value={valoresFormatoActivos.version}
                onChange={(e) =>
                  empresaFormato === GLOBAL
                    ? setGlobal({ ...global, formatos: { ...global.formatos, [tipoActivo]: { ...global.formatos[tipoActivo], version: e.target.value } } })
                    : setBorradorEmpresa({ ...borradorEmpresa, version: e.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cf-fecha-emision">Fecha de emisión</Label>
              <Input
                id="cf-fecha-emision"
                type="date"
                value={valoresFormatoActivos.fechaEmision ?? ""}
                onChange={(e) =>
                  empresaFormato === GLOBAL
                    ? setGlobal({ ...global, formatos: { ...global.formatos, [tipoActivo]: { ...global.formatos[tipoActivo], fechaEmision: e.target.value || null } } })
                    : setBorradorEmpresa({ ...borradorEmpresa, fechaEmision: e.target.value || null })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CampoArchivo
              etiqueta={empresaFormato === GLOBAL ? "Logo institucional (membrete de impresión)" : "Logo institucional de esta empresa (vacío = hereda el global)"}
              valor={empresaFormato === GLOBAL ? global.logoId : (empresaFormatoConfig?.logoId ?? null)}
              onChange={(id) => guardarLogo(id)}
              aceptar="image/*"
            />
            {empresaFormato === GLOBAL && (
              <CampoArchivo
                etiqueta="Logo de la aplicación (barra lateral)"
                valor={global.logoAppId}
                onChange={(id) => guardarLogo(id, true)}
                aceptar="image/*"
              />
            )}
          </div>

          <div className="flex gap-2">
            <Button className="w-fit" onClick={empresaFormato === GLOBAL ? guardarGlobal : guardarEmpresaFormato}>
              {empresaFormato === GLOBAL ? "Guardar configuración global" : "Guardar override de la empresa"}
            </Button>
            {empresaFormato !== GLOBAL && empresaFormatoConfig && (
              <Button variant="ghost" className="w-fit gap-1.5 text-destructive" onClick={eliminarOverrideEmpresa}>
                <Trash2 className="h-3.5 w-3.5" /> Quitar todos los overrides de esta empresa
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-1.5 border-t pt-3">
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground"><History className="h-3.5 w-3.5" /> Historial de cambios</Label>
            <ListaHistorial entradas={historialFormato} />
          </div>
      </SeccionAcordeon>

      <SeccionAcordeon
        value="declaracion-tratamiento-datos"
        titulo="Declaración de tratamiento de datos"
        descripcion="Texto legal que se imprime en los formatos — global o, si se elige una empresa, un texto propio de esa empresa (vacío = hereda el global)."
      >
          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <Label htmlFor="cfd-empresa">Empresa del grupo</Label>
            <Select value={empresaDeclaracion} onValueChange={setEmpresaDeclaracion}>
              <SelectTrigger id="cfd-empresa"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={GLOBAL}>Global (todas las empresas)</SelectItem>
                {empresas.map((e) => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cf-declaracion">Declaración de tratamiento de datos</Label>
            <Textarea
              id="cf-declaracion"
              rows={4}
              placeholder={empresaDeclaracion !== GLOBAL ? global.declaracionTratamientoDatos : undefined}
              value={borradorDeclaracion}
              onChange={(e) => setBorradorDeclaracion(e.target.value)}
            />
          </div>
          <Button className="w-fit" onClick={guardarDeclaracion}>Guardar declaración</Button>

          <div className="flex flex-col gap-1.5 border-t pt-3">
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground"><History className="h-3.5 w-3.5" /> Historial de cambios</Label>
            <ListaHistorial entradas={historialDeclaracion} />
          </div>
      </SeccionAcordeon>

      <SeccionAcordeon
        value="formato-oficial-fmv"
        titulo="Formato Oficial FMV"
        descripcion="Historial de versiones vigentes del formulario FMV oficial (vacío = aplica a todas las empresas)."
      >
          {formatosOficialesFmv.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
              <span>
                Vigente desde {formatearFecha(f.vigenteDesde)} — {f.empresaGrupo || "todas las empresas"}
              </span>
              <div className="flex items-center gap-1">
                <VisorArchivo archivoId={f.archivoId} etiqueta="Ver" size="sm" variant="outline" />
                <Button size="icon" variant="ghost" onClick={() => quitarFormatoOficialFmv(f.id)}><Trash2 /></Button>
              </div>
            </div>
          ))}
          <div className="w-full">
            <CampoArchivo
              etiqueta="PDF del formato oficial (opcional al registrar)"
              valor={nuevaVigenciaArchivoId}
              onChange={setNuevaVigenciaArchivoId}
              aceptar="application/pdf"
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fof-vigencia">Vigente desde</Label>
              <Input id="fof-vigencia" type="date" value={nuevaVigencia} onChange={(e) => setNuevaVigencia(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fof-empresa">Empresa (opcional)</Label>
              <Select value={nuevaVigenciaEmpresa || "__todas__"} onValueChange={(v) => setNuevaVigenciaEmpresa(v === "__todas__" ? "" : v)}>
                <SelectTrigger id="fof-empresa" className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todas__">Todas las empresas</SelectItem>
                  {empresas.map((e) => (
                    <SelectItem key={e} value={e}>{e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="gap-1.5" onClick={agregarFormatoOficialFmv}><Plus className="h-3.5 w-3.5" /> Registrar versión</Button>
          </div>
      </SeccionAcordeon>
    </Accordion>
  );
}
