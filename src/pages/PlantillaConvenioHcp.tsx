import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useAuth } from "@/hooks/useAuth";
import { useCompania } from "@/hooks/useCompania";
import {
  CANTIDAD_NUMERALES,
  traerVersionesPlantilla,
  publicarNuevaVersionPlantilla,
} from "@/lib/plantillaConvenioHCP";
import type { NumeralClausulado, PlantillaConvenioHcpVersion } from "@/types";
import { formatearFechaHora } from "@/lib/fecha";

function numeralesVacios(): NumeralClausulado[] {
  return Array.from({ length: CANTIDAD_NUMERALES }, (_, i) => ({ numero: i + 1, textoEs: "", textoEn: "" }));
}

export function PlantillaConvenioHcp() {
  const { usuario } = useAuth();
  const { companiaActual } = useCompania();
  const [versiones, setVersiones] = React.useState<PlantillaConvenioHcpVersion[]>([]);
  const [cargando, setCargando] = React.useState(true);
  const [notasVersion, setNotasVersion] = React.useState("");
  const [numerales, setNumerales] = React.useState<NumeralClausulado[]>(numeralesVacios());
  const [anexoCEs, setAnexoCEs] = React.useState("");
  const [anexoCEn, setAnexoCEn] = React.useState("");
  const [anexoDEs, setAnexoDEs] = React.useState("");
  const [anexoDEn, setAnexoDEn] = React.useState("");
  const [publicando, setPublicando] = React.useState(false);

  function recargar() {
    setCargando(true);
    traerVersionesPlantilla()
      .then(setVersiones)
      .catch((e) => toast.error(e instanceof Error ? e.message : "No se pudieron cargar las versiones."))
      .finally(() => setCargando(false));
  }

  React.useEffect(recargar, []);

  function cargarDesdeVersion(v: PlantillaConvenioHcpVersion) {
    setNotasVersion("");
    setNumerales(
      numeralesVacios().map((n) => v.numerales.find((m) => m.numero === n.numero) ?? n),
    );
    setAnexoCEs(v.anexoCEs);
    setAnexoCEn(v.anexoCEn);
    setAnexoDEs(v.anexoDEs);
    setAnexoDEn(v.anexoDEn);
    toast.message("Contenido de la versión cargado en el formulario — ajústalo y publica una nueva versión.");
  }

  function setNumeral(numero: number, campo: "textoEs" | "textoEn", valor: string) {
    setNumerales((prev) => prev.map((n) => (n.numero === numero ? { ...n, [campo]: valor } : n)));
  }

  async function publicar() {
    if (!usuario) return;
    if (!notasVersion.trim()) {
      toast.error("Indica una nota describiendo qué cambia en esta versión.");
      return;
    }
    setPublicando(true);
    try {
      await publicarNuevaVersionPlantilla(
        { notasVersion, numerales, anexoCEn, anexoCEs, anexoDEn, anexoDEs },
        usuario.id,
        companiaActual ?? usuario.empresasGrupo[0] ?? "",
      );
      toast.success("Nueva versión de la plantilla legal publicada. Los contratos ya creados no se ven afectados.");
      setNotasVersion("");
      recargar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo publicar la versión.");
    } finally {
      setPublicando(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Configuración de la Plantilla Legal</h1>
        <p className="text-sm text-muted-foreground">
          Historial de versiones del clausulado (15 numerales + Anexos C y D, bilingüe ES/EN). Usa{" "}
          <code>{"{{empresa}}"}</code> donde el texto deba llevar el nombre de la compañía — se reemplaza
          automáticamente al crear cada Convenio HCP. Publicar una versión nueva nunca modifica los contratos ya
          creados: cada uno conserva un snapshot congelado de la versión vigente al momento de firmarse.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Historial de versiones</CardTitle>
        </CardHeader>
        <CardContent>
          {cargando && <p className="text-sm text-muted-foreground">Cargando...</p>}
          {!cargando && versiones.length === 0 && (
            <p className="text-sm text-muted-foreground">Todavía no hay ninguna versión publicada.</p>
          )}
          <div className="flex flex-col gap-2">
            {versiones.map((v, i) => (
              <div key={v.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <div>
                  <span className="font-medium">{i === 0 ? "Vigente" : "Histórica"}</span>{" "}
                  <span className="text-muted-foreground">
                    — {formatearFechaHora(v.vigenteDesde)}{v.notasVersion ? ` · ${v.notasVersion}` : ""}
                  </span>
                </div>
                <Button size="sm" variant="outline" onClick={() => cargarDesdeVersion(v)}>
                  Usar como base
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Publicar nueva versión</CardTitle>
          <CardDescription>Se agrega al historial (append-only) y pasa a ser la versión vigente.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plantilla-notas">Notas de la versión *</Label>
            <Input sinMayusculas id="plantilla-notas" value={notasVersion} onChange={(e) => setNotasVersion(e.target.value)} placeholder="p.ej. Actualización cláusula de confidencialidad" />
          </div>

          <Accordion type="multiple" className="w-full">
            {numerales.map((n) => (
              <AccordionItem key={n.numero} value={`numeral-${n.numero}`}>
                <AccordionTrigger>Numeral {n.numero}</AccordionTrigger>
                <AccordionContent className="grid grid-cols-1 gap-3 pb-6 pt-6 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`numeral-${n.numero}-es`}>Español</Label>
                    <Textarea sinMayusculas id={`numeral-${n.numero}-es`} rows={4} value={n.textoEs} onChange={(e) => setNumeral(n.numero, "textoEs", e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`numeral-${n.numero}-en`}>English</Label>
                    <Textarea sinMayusculas id={`numeral-${n.numero}-en`} rows={4} value={n.textoEn} onChange={(e) => setNumeral(n.numero, "textoEn", e.target.value)} />
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
            <AccordionItem value="anexo-c">
              <AccordionTrigger>Anexo C</AccordionTrigger>
              <AccordionContent className="grid grid-cols-1 gap-3 pb-6 pt-6 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="anexo-c-es">Español</Label>
                  <Textarea sinMayusculas id="anexo-c-es" rows={4} value={anexoCEs} onChange={(e) => setAnexoCEs(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="anexo-c-en">English</Label>
                  <Textarea sinMayusculas id="anexo-c-en" rows={4} value={anexoCEn} onChange={(e) => setAnexoCEn(e.target.value)} />
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="anexo-d">
              <AccordionTrigger>Anexo D</AccordionTrigger>
              <AccordionContent className="grid grid-cols-1 gap-3 pb-6 pt-6 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="anexo-d-es">Español</Label>
                  <Textarea sinMayusculas id="anexo-d-es" rows={4} value={anexoDEs} onChange={(e) => setAnexoDEs(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="anexo-d-en">English</Label>
                  <Textarea sinMayusculas id="anexo-d-en" rows={4} value={anexoDEn} onChange={(e) => setAnexoDEn(e.target.value)} />
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="flex justify-end">
            <Button disabled={publicando} onClick={publicar}>
              Publicar nueva versión
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
