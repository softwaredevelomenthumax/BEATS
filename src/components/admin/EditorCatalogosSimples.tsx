import { useConfirmar } from "@/hooks/useConfirmar";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Accordion } from "@/components/ui/accordion";
import { SeccionAcordeon } from "@/components/forms/SeccionAcordeon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ArrowUp, ArrowDown, Pencil, Check, X, Search } from "lucide-react";
import { CATALOGO_SIMPLE, type CatalogoSimple } from "@/lib/enums";
import {
  traerCatalogos,
  crearValorCatalogo,
  actualizarValorCatalogo,
  eliminarValorCatalogo,
  type ValorCatalogo,
} from "@/lib/catalogos";
import { mensajeErrorAmigable } from "@/lib/supabaseClient";
import { PAISES_OPERACION } from "@/lib/paisesRegion";
import { etiquetaSpeakerInterno, parsearSpeakerInterno, valorSpeakerInterno } from "@/lib/speakersEvento";

/**
 * Ronda de instrucciones históricas (cluster A, A4): editor de
 * administración genérico para cualquiera de los catálogos de
 * `CATALOGO_SIMPLE` (líneas terapéuticas, monedas, tipos de evento, etc.),
 * respondiendo puntualmente a la instrucción de que "Línea terapéutica"
 * fuera configurable desde Configuración de Campos como los demás campos
 * — hasta esta ronda `catalogo_valores` solo se leía en toda la app, sin
 * ningún editor capaz de agregar/quitar valores. Se construyó como un
 * único editor reutilizable (no uno por catálogo) porque los ~13 catálogos
 * comparten exactamente la misma forma (lista ordenada de textos).
 */
const ETIQUETA_CATALOGO: Record<CatalogoSimple, string> = {
  empresasGrupo: "Empresas del grupo",
  tiposEvento: "Tipos de evento",
  areasEspecialidadEvento: "Áreas / especialidad (Evento)",
  categoriasHotel: "Categorías de hotel",
  monedas: "Monedas",
  centrosCostos: "Centros de costos",
  tiposTransporte: "Tipos de transporte",
  departamentosConvenio: "Departamentos (Convenio)",
  especialidadesMedicas: "Especialidades médicas (FMV)",
  lineasTerapeuticas: "Líneas terapéuticas",
  tiposActividadConvenio: "Tipos de actividad (Convenio)",
  // Reorganización FormularioEvento (septiembre 2026), decisión confirmada:
  // catálogo único, compartido entre Convenio y Evento (antes había uno
  // separado, "organizadoPorEvento", que se eliminó de este editor).
  organizadoPorConvenio: "Organizado por",
  tiposDocumento: "Tipos de documento",
  estados: "Estados / Provincia / Departamento",
  tiposParticipacionAcademica: "Tipos de participación académica",
  tiposServicioConvenio: "Tipos de servicio (Convenio de Pago a HCP)",
  regiones: "Regiones (FMV)",
  profesiones: "Profesiones (Nuevo Speaker)",
  tiposContrato: "Tipos de contrato (CAF)",
  speakersInternos: "Speakers internos (Solicitud de Evento)",
  areasUsuario: "Áreas (perfil de usuario)",
};

export function EditorCatalogosSimples() {
  const [catalogoElegido, setCatalogoElegido] = React.useState<CatalogoSimple>("lineasTerapeuticas");
  const [valores, setValores] = React.useState<ValorCatalogo[]>([]);
  const [cargando, setCargando] = React.useState(true);
  const [nuevoValor, setNuevoValor] = React.useState("");
  const [guardando, setGuardando] = React.useState(false);
  const [filtro, setFiltro] = React.useState("");
  const [editandoId, setEditandoId] = React.useState<string | null>(null);
  const [valorEditado, setValorEditado] = React.useState("");
  // Entrega 22: el catálogo "Speakers internos" guarda "Nombre | País" — se captura en dos campos.
  const [nuevoPais, setNuevoPais] = React.useState("");
  const [paisEditado, setPaisEditado] = React.useState("");
  const esSpeakersInternos = catalogoElegido === "speakersInternos";

  function recargar() {
    setCargando(true);
    traerCatalogos()
      .then(setValores)
      .catch((error) => toast.error(mensajeErrorAmigable(error)))
      .finally(() => setCargando(false));
  }

  React.useEffect(recargar, []);

  const valoresDelCatalogo = valores.filter((v) => v.catalogo === catalogoElegido).sort((a, b) => a.orden - b.orden);
  const valoresFiltrados = filtro.trim()
    ? valoresDelCatalogo.filter((v) => v.valor.toLowerCase().includes(filtro.trim().toLowerCase()))
    : valoresDelCatalogo;

  async function agregar() {
    if (!nuevoValor.trim()) return;
    if (esSpeakersInternos && !nuevoPais.trim()) {
      toast.error("Selecciona el país del speaker interno.");
      return;
    }
    setGuardando(true);
    try {
      const siguienteOrden = valoresDelCatalogo.length > 0 ? Math.max(...valoresDelCatalogo.map((v) => v.orden)) + 1 : 0;
      await crearValorCatalogo(catalogoElegido, esSpeakersInternos ? valorSpeakerInterno(nuevoValor, nuevoPais) : nuevoValor, siguienteOrden);
      setNuevoValor("");
      setNuevoPais("");
      toast.success("Valor agregado.");
      recargar();
    } catch (error) {
      toast.error(mensajeErrorAmigable(error));
    } finally {
      setGuardando(false);
    }
  }

  const confirmar = useConfirmar();
  async function eliminar(v: ValorCatalogo) {
    if (!(await confirmar({ titulo: "Eliminar valor", mensaje: `¿Eliminar el valor "${v.valor}"? Esta acción no se puede deshacer.` }))) return;
    try {
      await eliminarValorCatalogo(v.id);
      toast.success("Valor eliminado.");
      recargar();
    } catch (error) {
      toast.error(mensajeErrorAmigable(error));
    }
  }

  function iniciarEdicion(v: ValorCatalogo) {
    setEditandoId(v.id);
    if (esSpeakersInternos) {
      const sp = parsearSpeakerInterno(v.valor);
      setValorEditado(sp.nombre);
      setPaisEditado(sp.pais);
    } else {
      setValorEditado(v.valor);
    }
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setValorEditado("");
  }

  async function guardarEdicion(v: ValorCatalogo) {
    const nuevo = esSpeakersInternos ? valorSpeakerInterno(valorEditado, paisEditado) : valorEditado.trim();
    if (!valorEditado.trim() || nuevo === v.valor || (esSpeakersInternos && !paisEditado.trim())) {
      cancelarEdicion();
      return;
    }
    try {
      await actualizarValorCatalogo(v.id, { valor: nuevo });
      toast.success("Valor renombrado.");
      cancelarEdicion();
      recargar();
    } catch (error) {
      toast.error(mensajeErrorAmigable(error));
    }
  }

  // Reordenar intercambia el `orden` con el vecino inmediato (en la lista
  // ordenada por `orden`, sin filtrar por búsqueda, para que mover un
  // elemento sea siempre respecto a su posición real en el catálogo).
  async function mover(v: ValorCatalogo, direccion: -1 | 1) {
    const idx = valoresDelCatalogo.findIndex((x) => x.id === v.id);
    const vecino = valoresDelCatalogo[idx + direccion];
    if (!vecino) return;
    try {
      await Promise.all([
        actualizarValorCatalogo(v.id, { orden: vecino.orden }),
        actualizarValorCatalogo(vecino.id, { orden: v.orden }),
      ]);
      recargar();
    } catch (error) {
      toast.error(mensajeErrorAmigable(error));
    }
  }

  return (
    <Accordion type="single" collapsible defaultValue="catalogos-simples" className="flex flex-col gap-3">
      <SeccionAcordeon
        value="catalogos-simples"
        titulo="Catálogos de opciones"
        descripcion={'Valores de los desplegables de cada formulario (líneas terapéuticas, monedas, tipos de evento, "organizado por", etc.) — agrégalos o quítalos aquí sin tocar código.'}
      >
        <div className="flex max-w-sm flex-col gap-1.5">
          <Label htmlFor="catalogo-elegido">Catálogo</Label>
          <Select value={catalogoElegido} onValueChange={(v) => setCatalogoElegido(v as CatalogoSimple)}>
            <SelectTrigger id="catalogo-elegido"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATALOGO_SIMPLE.map((c) => (
                <SelectItem key={c} value={c}>{ETIQUETA_CATALOGO[c] ?? c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!cargando && valoresDelCatalogo.length > 3 && (
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar valor..."
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="pl-8"
            />
          </div>
        )}

        {cargando && <p className="text-sm text-muted-foreground">Cargando...</p>}
        {!cargando && valoresDelCatalogo.length === 0 && (
          <p className="text-sm text-muted-foreground">Este catálogo todavía no tiene ningún valor cargado.</p>
        )}
        {!cargando && valoresDelCatalogo.length > 0 && valoresFiltrados.length === 0 && (
          <p className="text-sm text-muted-foreground">Ningún valor coincide con la búsqueda.</p>
        )}
        <div className="flex flex-col gap-2">
          {valoresFiltrados.map((v) => {
            const idx = valoresDelCatalogo.findIndex((x) => x.id === v.id);
            const enEdicion = editandoId === v.id;
            return (
              <div key={v.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                {enEdicion ? (
                  <div className="flex flex-1 flex-wrap gap-2">
                    <Input
                      autoFocus
                      value={valorEditado}
                      onChange={(e) => setValorEditado(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") guardarEdicion(v);
                        if (e.key === "Escape") cancelarEdicion();
                      }}
                      className="h-8 min-w-40 flex-1"
                    />
                    {esSpeakersInternos && <SelectPaisSpeaker valor={paisEditado} onChange={setPaisEditado} className="h-8 w-48" />}
                  </div>
                ) : (
                  <span>{esSpeakersInternos ? etiquetaSpeakerInterno(parsearSpeakerInterno(v.valor)) : v.valor}</span>
                )}
                <div className="flex shrink-0 items-center gap-1">
                  {enEdicion ? (
                    <>
                      <Button size="icon" variant="ghost" onClick={() => guardarEdicion(v)}><Check className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={cancelarEdicion}><X className="h-4 w-4" /></Button>
                    </>
                  ) : (
                    <>
                      <Button size="icon" variant="ghost" disabled={idx <= 0} onClick={() => mover(v, -1)}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" disabled={idx >= valoresDelCatalogo.length - 1} onClick={() => mover(v, 1)}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => iniciarEdicion(v)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => eliminar(v)}><Trash2 className="h-4 w-4" /></Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex max-w-xl flex-wrap items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="catalogo-nuevo-valor">{esSpeakersInternos ? "Nombre del speaker interno" : "Agregar valor"}</Label>
            <Input
              id="catalogo-nuevo-valor"
              value={nuevoValor}
              onChange={(e) => setNuevoValor(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") agregar(); }}
            />
          </div>
          {esSpeakersInternos && (
            <div className="flex flex-col gap-1.5">
              <Label>País</Label>
              <SelectPaisSpeaker valor={nuevoPais} onChange={setNuevoPais} className="w-48" />
            </div>
          )}
          <Button onClick={agregar} disabled={guardando || !nuevoValor.trim() || (esSpeakersInternos && !nuevoPais)}>
            <Plus className="h-4 w-4" /> Agregar
          </Button>
        </div>
      </SeccionAcordeon>
    </Accordion>
  );
}

/** Lista de países de operación del grupo (misma lista fija de "Usuarios y Roles"). */
function SelectPaisSpeaker({ valor, onChange, className }: { valor: string; onChange: (v: string) => void; className?: string }) {
  const opciones = valor && !PAISES_OPERACION.includes(valor) ? [valor, ...PAISES_OPERACION] : PAISES_OPERACION;
  return (
    <Select value={valor} onValueChange={onChange}>
      <SelectTrigger className={className} aria-label="País del speaker interno"><SelectValue placeholder="País" /></SelectTrigger>
      <SelectContent>
        {opciones.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
