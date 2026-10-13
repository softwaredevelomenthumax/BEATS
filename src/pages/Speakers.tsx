import { useConfirmar } from "@/hooks/useConfirmar";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputEmail } from "@/components/ui/input-email";
import { normalizarEmail } from "@/lib/normalizarTexto";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleCapsula } from "@/components/ui/toggle-capsula";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Accordion } from "@/components/ui/accordion";
import { SeccionAcordeon } from "@/components/forms/SeccionAcordeon";
import { Plus, Pencil, Trash2, MapPin, Phone, Mail, Globe, Check } from "lucide-react";
import { FiltroPastilla } from "@/components/ui/filtro-pastilla";
import { CampoArchivo } from "@/components/archivos/CampoArchivo";
import { VisorArchivo } from "@/components/archivos/VisorArchivo";
import { AvatarFotoEditable } from "@/components/archivos/AvatarFotoEditable";
import { SelectPaisEstadoCiudad } from "@/components/SelectPaisEstadoCiudad";
import { useAuth } from "@/hooks/useAuth";
import { useCompania } from "@/hooks/useCompania";
import { useCatalogo } from "@/lib/catalogos";
import { traerArchivos, type ArchivoAdjunto } from "@/lib/archivosAdjuntos";
import { formatearFecha } from "@/lib/fecha";
import {
  traerSpeakers,
  guardarSpeaker,
  eliminarSpeaker,
  calcularErroresSpeaker,
  vigenciaRethus,
  vigenciaHojaVida,
  fechaLimiteHojaVida,
  estadoConsolidadoSpeaker,
  ETIQUETA_VIGENCIA,
  ETIQUETA_ESTADO_CONSOLIDADO,
  type EstadoVigencia,
  type EstadoConsolidado,
} from "@/lib/speakers";
import type { Speaker } from "@/types";
import { mismoPais, paisesParaFiltro } from "@/lib/paisCanonico";

function alternar(lista: string[], valor: string): string[] {
  return lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
}

const VARIANTE_POR_VIGENCIA: Record<EstadoVigencia, BadgeProps["variant"]> = {
  vigente: "approved",
  porVencer: "pending",
  vencido: "rejected",
  // "Indefinido" se muestra con el mismo estilo que "Vigente" (pastilla
  // azul) — confirmado por captura de pantalla del usuario: el detalle
  // "Vigencia indefinida" ya distingue el caso, la pastilla no necesita un
  // color propio para eso.
  indefinido: "approved",
  sinDatos: "draft",
};

const TODOS = "__todos__";
const FILTROS_ESTADO: (EstadoConsolidado | typeof TODOS)[] = [TODOS, "vigente", "porVencer", "vencido", "sinDatos"];

function etiquetaFiltroEstado(f: EstadoConsolidado | typeof TODOS): string {
  return f === TODOS ? "Todos" : ETIQUETA_ESTADO_CONSOLIDADO[f];
}

const VACIO: Partial<Speaker> = {
  nombreCompleto: "",
  numeroDocumento: "",
  profesion: "",
  especialidad: "",
  direccion: "",
  pais: "",
  estadoProvincia: "",
  ciudad: "",
  telefono: "",
  email: "",
  licenciaRethus: "",
  fechaVencimientoRethus: null,
  rethusIndefinido: false,
  hojaVidaAdjunta: false,
  fechaActualizacionHojaVida: null,
  empresasGrupoInteraccion: [],
  notas: "",
};

function BadgeVigencia({ estado }: { estado: EstadoVigencia }) {
  // "Indefinido" se muestra como "Vigente" en esta pastilla — confirmado
  // por la captura de pantalla real del Repositorio de Speakers: el
  // detalle "Vigencia indefinida" (ver detalleRethus) ya distingue el
  // caso, la pastilla no necesita su propio texto para eso. La etiqueta
  // "Indefinido" tal cual sigue disponible para otros consumos (Informe de
  // Speakers, CSV) donde la distinción sí es útil.
  const etiqueta = estado === "indefinido" ? ETIQUETA_VIGENCIA.vigente : ETIQUETA_VIGENCIA[estado];
  return <Badge variant={VARIANTE_POR_VIGENCIA[estado]}>{etiqueta}</Badge>;
}

/** "20556 · Vigencia indefinida" o "20556 · Vence 12 dic 2026" o "—" si no hay dato. */
function detalleRethus(s: Speaker): string {
  if (s.rethusIndefinido) return s.licenciaRethus ? `${s.licenciaRethus} · Vigencia indefinida` : "Vigencia indefinida";
  if (!s.fechaVencimientoRethus) return s.licenciaRethus || "—";
  const fecha = formatearFecha(s.fechaVencimientoRethus);
  return s.licenciaRethus ? `${s.licenciaRethus} · Vence ${fecha}` : `Vence ${fecha}`;
}

function formatearFechaCorta(fecha: string): string {
  return formatearFecha(fecha);
}

/** "Actualizada 12 dic 2024 · Vence 12 dic 2026" o "—" si no hay dato. */
function detalleHojaVida(s: Speaker): string {
  if (!s.hojaVidaAdjunta || !s.fechaActualizacionHojaVida) return "—";
  const actualizacion = formatearFechaCorta(s.fechaActualizacionHojaVida);
  const limite = fechaLimiteHojaVida(s.fechaActualizacionHojaVida);
  return limite ? `Actualizada ${actualizacion} · Vence ${formatearFechaCorta(limite)}` : `Actualizada ${actualizacion}`;
}

/** Caja "LICENCIA RETHUS" / "HOJA DE VIDA" de la tarjeta del speaker —
 * pastilla de vigencia + detalle + enlace "Ver documento" (a demanda, vía
 * VisorArchivo) o "No adjunta" cuando no hay archivo cargado. */
function CajaVigencia({
  titulo,
  estado,
  detalle,
  archivoId,
  testId,
}: {
  titulo: string;
  estado: EstadoVigencia;
  detalle: string;
  archivoId: string | null;
  testId: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border p-3" style={{ borderColor: "hsl(var(--border))" }} data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</span>
        <BadgeVigencia estado={estado} />
      </div>
      <p className="text-sm font-medium">{detalle}</p>
      {archivoId ? (
        <VisorArchivo archivoId={archivoId} etiqueta="Ver documento" size="sm" variant="ghost" />
      ) : (
        <p className="text-sm text-muted-foreground">No adjunta</p>
      )}
    </div>
  );
}

function TarjetaSpeaker({
  speaker: s,
  foto,
  onEditar,
  onEliminar,
}: {
  speaker: Speaker;
  foto: ArchivoAdjunto | undefined;
  onEditar: (s: Speaker) => void;
  onEliminar: (s: Speaker) => void;
}) {
  const iniciales = s.nombreCompleto
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <Card data-testid="tarjeta-speaker">
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Avatar className="h-12 w-12">
              {foto && <AvatarImage src={foto.dataUrl} alt={s.nombreCompleto} />}
              <AvatarFallback className="bg-[var(--sidebar-active-bg)] font-semibold text-[var(--brand-blue)]">
                {iniciales || "?"}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="flex items-center gap-2 font-bold uppercase leading-tight">
                {s.nombreCompleto}
                {s.estado === "Borrador" && <Badge variant="draft">Borrador</Badge>}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {s.especialidad || "Sin especialidad"} · Doc. {s.numeroDocumento}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button size="sm" variant="outline" onClick={() => onEditar(s)}>
              <Pencil /> Editar
            </Button>
            <Button size="icon" variant="ghost" onClick={() => onEliminar(s)}>
              <Trash2 />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
          {s.direccion && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> {s.direccion}
              {s.ciudad || s.pais ? `, ${[s.ciudad, s.pais].filter(Boolean).join(", ")}` : ""}
            </span>
          )}
          {s.telefono && (
            <span className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" /> {s.telefono}
            </span>
          )}
          {s.email && (
            <span className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> {s.email}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CajaVigencia testId="caja-rethus" titulo="Licencia RETHUS" estado={vigenciaRethus(s)} detalle={detalleRethus(s)} archivoId={s.archivoRethusId} />
          <CajaVigencia testId="caja-hojavida" titulo="Hoja de Vida" estado={vigenciaHojaVida(s)} detalle={detalleHojaVida(s)} archivoId={s.archivoHojaVidaId} />
        </div>
      </CardContent>
    </Card>
  );
}

export function Speakers() {
  const confirmar = useConfirmar();
  const { usuario } = useAuth();
  const { companiaActual } = useCompania();
  const [speakers, setSpeakers] = React.useState<Speaker[]>([]);
  const [fotos, setFotos] = React.useState<Map<string, ArchivoAdjunto>>(new Map());
  const [cargando, setCargando] = React.useState(true);
  const [procesando, setProcesando] = React.useState(false);
  const [abierto, setAbierto] = React.useState(false);
  const [editando, setEditando] = React.useState<Partial<Speaker>>(VACIO);
  const [correoConfirmacion, setCorreoConfirmacion] = React.useState("");
  const [erroresForm, setErroresForm] = React.useState<Record<string, string>>({});
  const [busqueda, setBusqueda] = React.useState("");
  const [filtroEstado, setFiltroEstado] = React.useState<EstadoConsolidado | typeof TODOS>(TODOS);
  const [filtroPais, setFiltroPais] = React.useState<string>(TODOS);

  function recargar() {
    setCargando(true);
    traerSpeakers()
      .then((lista) => {
        setSpeakers(lista);
        // Fotos de perfil: se cargan de una sola vez para toda la lista (a
        // diferencia de RETHUS/Hoja de Vida, que se ven a demanda con
        // VisorArchivo) — son el avatar de la tarjeta, así que necesitan
        // estar listas desde el primer render, no tras un clic.
        const idsFoto = lista.map((s) => s.fotoId).filter((id): id is string => !!id);
        return traerArchivos(idsFoto).then(setFotos);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "No se pudieron cargar los speakers."))
      .finally(() => setCargando(false));
  }

  React.useEffect(recargar, []);

  function nuevo() {
    setEditando(VACIO);
    setCorreoConfirmacion("");
    setErroresForm({});
    setAbierto(true);
  }

  function editar(s: Speaker) {
    setEditando(s);
    setCorreoConfirmacion(s.email);
    setErroresForm({});
    setAbierto(true);
  }

  // Ronda de ajustes de formularios (septiembre 2026): "Guardar como
  // borrador"/"Confirmar speaker" — mismo patrón que Nuevo Usuario
  // (entrega 8). Un borrador solo exige nombre y documento (mismo mínimo
  // que ya se pedía antes de esta ronda); "Confirmar speaker" exige la
  // validación completa (`calcularErroresSpeaker`), incluida la doble
  // verificación del correo electrónico.
  async function guardar(comoBorrador: boolean) {
    if (!usuario) return;
    if (comoBorrador) {
      if (!editando.nombreCompleto?.trim() || !editando.numeroDocumento?.trim()) {
        toast.error("Nombre completo y número de documento son obligatorios.");
        return;
      }
    } else {
      const erroresCalculados = calcularErroresSpeaker(editando);
      if (normalizarEmail(editando.email) !== normalizarEmail(correoConfirmacion)) {
        erroresCalculados.correoConfirmacion = "Los dos correos electrónicos no coinciden.";
      }
      setErroresForm(erroresCalculados);
      if (Object.keys(erroresCalculados).length > 0) {
        toast.error("Revisa los campos marcados antes de confirmar el speaker.");
        return;
      }
    }
    setProcesando(true);
    try {
      await guardarSpeaker(editando, usuario.id, comoBorrador);
      toast.success(comoBorrador ? "Speaker guardado como borrador." : "Speaker confirmado.");
      setAbierto(false);
      recargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el speaker.");
    } finally {
      setProcesando(false);
    }
  }

  async function eliminar(s: Speaker) {
    if (!(await confirmar({ titulo: "Eliminar speaker", mensaje: `¿Eliminar a ${s.nombreCompleto || "este speaker"}? Esta acción no se puede deshacer.` }))) return;
    setProcesando(true);
    try {
      await eliminarSpeaker(s.id);
      toast.success("Speaker eliminado.");
      recargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar.");
    } finally {
      setProcesando(false);
    }
  }

  // Corrección (octubre 2026), pedido explícito del usuario: "de acuerdo
  // con la empresa con la que estés logueado para trabajar, puedes
  // filtrar los speakers por el campo 'Empresa(s) del grupo con la(s)
  // cuál(es) tendrá interacción' — muéstralos en cada empresa donde tenga
  // alguna interacción". A diferencia del filtro de `empresaGrupo` (un
  // único valor) que ya usan Evento/FMV/Notificación de Pago vía
  // `filtrarPorEmpresaGrupo`, un speaker puede tener interacción con
  // VARIAS empresas a la vez (`empresasGrupoInteraccion` es un arreglo) —
  // así que aparece en cada una de ellas, no en una sola. Sin compañía
  // seleccionada (0 o 1 empresa en el usuario — el mismo comodín
  // "todas/sin restricción" del resto de la app), no se filtra nada.
  const speakersDeLaCompania = companiaActual
    ? speakers.filter((s) => (s.empresasGrupoInteraccion ?? []).includes(companiaActual))
    : speakers;

  const paisesDisponibles = paisesParaFiltro(speakersDeLaCompania.map((s) => s.pais));

  const filtrados = speakersDeLaCompania.filter((s) => {
    const q = busqueda.trim().toLowerCase();
    const coincideBusqueda =
      !q ||
      s.nombreCompleto.toLowerCase().includes(q) ||
      s.especialidad.toLowerCase().includes(q) ||
      s.numeroDocumento.includes(q);
    const coincideEstado = filtroEstado === TODOS || estadoConsolidadoSpeaker(s) === filtroEstado;
    const coincidePais = filtroPais === TODOS || mismoPais(s.pais, filtroPais);
    return coincideBusqueda && coincideEstado && coincidePais;
  });

  function contarPorEstado(f: EstadoConsolidado | typeof TODOS): number {
    if (f === TODOS) return speakersDeLaCompania.length;
    return speakersDeLaCompania.filter((s) => estadoConsolidadoSpeaker(s) === f).length;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <Input
          placeholder="Buscar por nombre, especialidad o documento..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="max-w-sm"
        />
        <Button onClick={nuevo}>
          <Plus /> Nuevo Speaker
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTROS_ESTADO.map((f) => (
            <FiltroPastilla key={f} activo={filtroEstado === f} onClick={() => setFiltroEstado(f)}>
              {etiquetaFiltroEstado(f)} ({contarPorEstado(f)})
            </FiltroPastilla>
          ))}
        </div>
        <Select value={filtroPais} onValueChange={setFiltroPais}>
          <SelectTrigger className="w-48">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <SelectValue placeholder="Todos los países" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los países</SelectItem>
            {paisesDisponibles.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {cargando && <p className="text-sm text-muted-foreground">Cargando...</p>}
      {!cargando && filtrados.length === 0 && (
        <p className="text-sm text-muted-foreground">No hay speakers que coincidan con estos filtros.</p>
      )}
      <div className="flex flex-col gap-4">
        {filtrados.map((s) => (
          <TarjetaSpeaker key={s.id} speaker={s} foto={s.fotoId ? fotos.get(s.fotoId) : undefined} onEditar={editar} onEliminar={eliminar} />
        ))}
      </div>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        {/* AJUSTES (septiembre/octubre 2026), pedido explícito: "Armoniza el
            ancho de todas las ventanas de los formularios" — ver el
            comentario en `UsuariosRoles.tsx` (mismo síntoma: cuadrícula de 2
            columnas que ya no cabía cómoda en `max-w-lg`). Se ensancha igual
            a `max-w-2xl` para que todos los diálogos de formulario de la app
            compartan el mismo ancho.

            AJUSTES (septiembre/octubre 2026), pedido explícito: "Valida que
            quede funcional [el bloqueo de cierre accidental] en todos los
            formularios" — ver el comentario completo en `UsuariosRoles.tsx`.
            Este diálogo tampoco lo tenía. */}
        <DialogContent
          minimizable
          confirmarCierre
          className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>
              {editando.id ? "Editar speaker" : "Nuevo Speaker"}
              {editando.estado === "Borrador" && <Badge variant="draft" className="ml-2">Borrador</Badge>}
            </DialogTitle>
          </DialogHeader>
          <FormularioSpeaker
            valor={editando}
            onChange={setEditando}
            correoConfirmacion={correoConfirmacion}
            onChangeCorreoConfirmacion={setCorreoConfirmacion}
            errores={erroresForm}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button variant="outline" disabled={procesando} onClick={() => guardar(true)}>Guardar como borrador</Button>
            <Button disabled={procesando} onClick={() => guardar(false)}>
              <Check className="h-4 w-4" /> Confirmar speaker
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Ronda de ajustes de formularios (septiembre 2026): "Usar formularios
 * colapsables (tipo acordeón) según las secciones que compongan el
 * formulario" — pedido explícito, mismo patrón que el resto de los
 * formularios de esta ronda. 4 secciones, tal como las agrupa la
 * especificación: Identificación, Datos de contacto, Documentos legales,
 * Interacción con empresa.
 */
function FormularioSpeaker({
  valor,
  onChange,
  correoConfirmacion,
  onChangeCorreoConfirmacion,
  errores,
}: {
  valor: Partial<Speaker>;
  onChange: (v: Partial<Speaker>) => void;
  correoConfirmacion: string;
  onChangeCorreoConfirmacion: (v: string) => void;
  errores: Record<string, string>;
}) {
  const { opciones: profesiones } = useCatalogo("profesiones");
  const { opciones: especialidades } = useCatalogo("especialidadesMedicas");
  const { opciones: empresas } = useCatalogo("empresasGrupo");

  function set<K extends keyof Speaker>(clave: K, v: Speaker[K]) {
    onChange({ ...valor, [clave]: v });
  }

  return (
    <Accordion type="multiple" defaultValue={["identificacion", "contacto", "legales", "interaccion"]} className="flex flex-col gap-3">
      <SeccionAcordeon value="identificacion" titulo="Identificación">
        <div className="grid grid-cols-2 gap-3">
          {/* Pedido explícito del usuario (septiembre 2026), diseño de
              formulario: la foto se ve de inmediato como avatar circular
              arriba a la izquierda, con Nombre completo y Documento de
              identidad al lado derecho — mismo patrón visual que la
              tarjeta del Repositorio de Speakers (`TarjetaSpeaker`). */}
          <div className="col-span-2 flex items-start gap-4">
            <AvatarFotoEditable
              valor={valor.fotoId ?? null}
              onChange={(id) => set("fotoId", id)}
              nombre={valor.nombreCompleto ?? ""}
              etiqueta="foto del speaker"
            />
            <div className="flex flex-1 flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="spk-nombre">Nombre completo *</Label>
                <Input id="spk-nombre" value={valor.nombreCompleto ?? ""} onChange={(e) => set("nombreCompleto", e.target.value)} />
                {errores.nombreCompleto && <p className="text-xs text-destructive">{errores.nombreCompleto}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="spk-documento">Número de documento *</Label>
                <Input id="spk-documento" value={valor.numeroDocumento ?? ""} onChange={(e) => set("numeroDocumento", e.target.value)} />
                {errores.numeroDocumento && <p className="text-xs text-destructive">{errores.numeroDocumento}</p>}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="spk-profesion">Profesión *</Label>
            <Select value={valor.profesion ?? ""} onValueChange={(v) => set("profesion", v)}>
              <SelectTrigger id="spk-profesion"><SelectValue placeholder="Selecciona una profesión" /></SelectTrigger>
              <SelectContent>
                {profesiones.map((op) => (
                  <SelectItem key={op} value={op}>{op}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errores.profesion && <p className="text-xs text-destructive">{errores.profesion}</p>}
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="spk-especialidad">Especialidad *</Label>
            <Select value={valor.especialidad ?? ""} onValueChange={(v) => set("especialidad", v)}>
              <SelectTrigger id="spk-especialidad"><SelectValue placeholder="Selecciona una especialidad" /></SelectTrigger>
              <SelectContent>
                {especialidades.map((op) => (
                  <SelectItem key={op} value={op}>{op}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errores.especialidad && <p className="text-xs text-destructive">{errores.especialidad}</p>}
          </div>
        </div>
      </SeccionAcordeon>

      <SeccionAcordeon value="contacto" titulo="Datos de contacto">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="spk-direccion">Dirección</Label>
            <Input id="spk-direccion" value={valor.direccion ?? ""} onChange={(e) => set("direccion", e.target.value)} />
          </div>
          <SelectPaisEstadoCiudad
            idPrefix="spk"
            etiquetaPais="País *"
            etiquetaEstado="Estado/Provincia/Departamento *"
            etiquetaCiudad="Ciudad *"
            valorPais={valor.pais ?? ""}
            valorEstado={valor.estadoProvincia ?? ""}
            valorCiudad={valor.ciudad ?? ""}
            onChangePaisEstadoCiudad={(pais, estadoProvincia, ciudad) => onChange({ ...valor, pais, estadoProvincia, ciudad })}
            errorPais={errores.pais}
            errorEstado={errores.estadoProvincia}
            errorCiudad={errores.ciudad}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="spk-telefono">Teléfono *</Label>
            <Input id="spk-telefono" value={valor.telefono ?? ""} onChange={(e) => set("telefono", e.target.value)} />
            {errores.telefono && <p className="text-xs text-destructive">{errores.telefono}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="spk-email">Correo electrónico *</Label>
            <InputEmail id="spk-email" value={valor.email ?? ""} onChange={(e) => set("email", e.target.value)} />
            {errores.email && <p className="text-xs text-destructive">{errores.email}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="spk-email-confirmacion">Confirmar correo electrónico *</Label>
            <InputEmail
              id="spk-email-confirmacion"
              value={correoConfirmacion}
              onChange={(e) => onChangeCorreoConfirmacion(e.target.value)}
            />
            {errores.correoConfirmacion && <p className="text-xs text-destructive">{errores.correoConfirmacion}</p>}
          </div>
        </div>
      </SeccionAcordeon>

      <SeccionAcordeon value="legales" titulo="Documentos legales">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="spk-licencia">Licencia RETHUS / Cédula profesional *</Label>
            <Input id="spk-licencia" value={valor.licenciaRethus ?? ""} onChange={(e) => set("licenciaRethus", e.target.value)} />
            {errores.licenciaRethus && <p className="text-xs text-destructive">{errores.licenciaRethus}</p>}
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>Vigencia indefinida (no vence)</Label>
            <ToggleCapsula
              value={valor.rethusIndefinido ?? false ? "si" : "no"}
              onValueChange={(v) => set("rethusIndefinido", v === "si")}
              opciones={[
                { value: "no", label: "No" },
                { value: "si", label: "Sí" },
              ]}
            />
          </div>
          {!valor.rethusIndefinido && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="spk-vencimiento-rethus">Fecha de vencimiento</Label>
              <Input id="spk-vencimiento-rethus" type="date" value={valor.fechaVencimientoRethus ?? ""} onChange={(e) => set("fechaVencimientoRethus", e.target.value)} />
              {errores.fechaVencimientoRethus && <p className="text-xs text-destructive">{errores.fechaVencimientoRethus}</p>}
              {/* Regla del semáforo pedida por el usuario (septiembre 2026):
                  vigente mientras no llegue la fecha de vencimiento;
                  "Requiere revisión" desde el día en que se cumple o pasa. */}
              {valor.fechaVencimientoRethus && (
                <BadgeVigencia estado={vigenciaRethus({ fechaVencimientoRethus: valor.fechaVencimientoRethus ?? null, rethusIndefinido: valor.rethusIndefinido ?? false })} />
              )}
            </div>
          )}
          <div className="col-span-2">
            <CampoArchivo
              etiqueta="Documento de la Licencia RETHUS / Cédula profesional *"
              valor={valor.archivoRethusId ?? null}
              onChange={(id) => set("archivoRethusId", id)}
              aceptar="application/pdf,image/*"
              contexto={valor.nombreCompleto}
            />
            {errores.archivoRethusId && <p className="text-xs text-destructive">{errores.archivoRethusId}</p>}
          </div>
          <div className="col-span-2">
            <CampoArchivo
              etiqueta="Hoja de Vida / CV *"
              valor={valor.archivoHojaVidaId ?? null}
              onChange={(id) => onChange({ ...valor, archivoHojaVidaId: id, hojaVidaAdjunta: !!id })}
              aceptar="application/pdf"
              contexto={valor.nombreCompleto}
            />
            {errores.archivoHojaVidaId && <p className="text-xs text-destructive">{errores.archivoHojaVidaId}</p>}
          </div>
          {valor.hojaVidaAdjunta && (
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="spk-fecha-hoja-vida">Fecha de actualización *</Label>
              <Input id="spk-fecha-hoja-vida" type="date" value={valor.fechaActualizacionHojaVida ?? ""} onChange={(e) => set("fechaActualizacionHojaVida", e.target.value)} />
              {errores.fechaActualizacionHojaVida && <p className="text-xs text-destructive">{errores.fechaActualizacionHojaVida}</p>}
              {/* Regla del semáforo pedida por el usuario (septiembre 2026):
                  vigente si la fecha de actualización tiene 2 años o menos
                  de antigüedad; "Requiere revisión/actualización" si tiene
                  más de 2 años. Se muestra también la fecha límite
                  calculada (actualización + 2 años) para que quede claro
                  cuándo vence, aunque no se guarde como campo aparte. */}
              {valor.fechaActualizacionHojaVida && (
                <div className="flex items-center gap-2">
                  <BadgeVigencia estado={vigenciaHojaVida({ hojaVidaAdjunta: true, fechaActualizacionHojaVida: valor.fechaActualizacionHojaVida ?? null })} />
                  {(() => {
                    const limite = fechaLimiteHojaVida(valor.fechaActualizacionHojaVida ?? null);
                    return limite ? <span className="text-xs text-muted-foreground">Vence {formatearFechaCorta(limite)}</span> : null;
                  })()}
                </div>
              )}
            </div>
          )}
          <div className="col-span-2">
            <CampoArchivo
              etiqueta="Documento de identidad *"
              valor={valor.archivoIdentidadId ?? null}
              onChange={(id) => set("archivoIdentidadId", id)}
              aceptar="application/pdf,image/*"
              contexto={valor.nombreCompleto}
            />
            {errores.archivoIdentidadId && <p className="text-xs text-destructive">{errores.archivoIdentidadId}</p>}
          </div>
        </div>
      </SeccionAcordeon>

      <SeccionAcordeon value="interaccion" titulo="Interacción con empresa">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Empresa(s) del grupo con la(s) cuál(es) tendrá interacción *</Label>
            <div className="flex flex-wrap gap-3 rounded-md border p-2">
              {empresas.map((emp) => (
                <label key={emp} className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={(valor.empresasGrupoInteraccion ?? []).includes(emp)}
                    onCheckedChange={() => onChange({ ...valor, empresasGrupoInteraccion: alternar(valor.empresasGrupoInteraccion ?? [], emp) })}
                  />
                  {emp}
                </label>
              ))}
            </div>
            {errores.empresasGrupoInteraccion && <p className="text-xs text-destructive">{errores.empresasGrupoInteraccion}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="spk-notas">Observaciones</Label>
            <Textarea id="spk-notas" value={valor.notas ?? ""} onChange={(e) => set("notas", e.target.value)} />
          </div>
        </div>
      </SeccionAcordeon>
    </Accordion>
  );
}
