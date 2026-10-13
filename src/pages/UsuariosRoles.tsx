import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputEmail } from "@/components/ui/input-email";
import { normalizarEmail } from "@/lib/normalizarTexto";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ToggleCapsula } from "@/components/ui/toggle-capsula";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, KeyRound, Mail, Pencil, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCompania } from "@/hooks/useCompania";
import { useCatalogo } from "@/lib/catalogos";
import { PAISES_OPERACION } from "@/lib/paisesRegion";
import { SelectPaisEstadoCiudad } from "@/components/SelectPaisEstadoCiudad";
import { CapturaFirmaManuscrita } from "@/components/archivos/FirmaManuscrita";
import { AvatarFotoEditable } from "@/components/archivos/AvatarFotoEditable";
import { AvatarUsuario } from "@/components/AvatarUsuario";
import { guardarFotoUsuario } from "@/lib/fotosUsuario";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { NAVEGACION } from "@/lib/navegacion";
import { ROL_USUARIO, ETIQUETA_ROL_USUARIO } from "@/lib/enums";
import {
  traerUsuarios,
  actualizarPerfilUsuario,
  crearUsuario,
  guardarBorradorUsuario,
  editarBorradorUsuario,
  resetearPasswordUsuario,
  actualizarEmailUsuario,
  cambiarActivoUsuario,
  traerSolicitudesRestablecimiento,
  marcarSolicitudResuelta,
  JEFE_ES_EL_MISMO,
  OPCIONES_FIRMA_VACIAS,
  rolPuedeSerComplianceLatam,
  type DatosNuevoUsuario,
  type CambiosPerfilUsuario,
} from "@/lib/usuarios";
import { formatearFechaHora } from "@/lib/fecha";
import type { Usuario, SolicitudRestablecimientoPassword } from "@/types";

const PAGINAS_SELECCIONABLES = NAVEGACION.flatMap((g) => g.items).filter((i) => i.id !== "tablero");

const PERFIL_VACIO: CambiosPerfilUsuario = {
  nombre: "",
  cargo: "",
  telefono: "",
  rol: "marketing",
  paginasPermitidas: [],
  paisesOperacion: [],
  empresasGrupo: [],
  esAdministrador: false,
  administradorAlcanceLimitado: false,
  puedeEliminarDocumentosFirmados: false,
  numeroDocumento: "",
  pais: "",
  estadoProvincia: "",
  ciudad: "",
  observaciones: "",
  firmaId: null,
  fotoId: null,
  ...OPCIONES_FIRMA_VACIAS,
};

/** Valor del desplegable "Jefe inmediato" cuando no hay ninguno (Radix Select no admite "" como valor). */
const SIN_VALOR = "__ninguno__";

function alternar(lista: string[], valor: string): string[] {
  return lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
}

/**
 * Pedido explícito del usuario (septiembre 2026): "Retira el campo
 * 'Iniciales' (no se capturará)" del formulario "Nuevo colaborador". La
 * función Edge `admin-usuarios` (`crearUsuario`, en lib/usuarios.ts) sigue
 * esperando un valor de `iniciales` — no se puede modificar/redesplegar esa
 * función desde aquí (mismo criterio ya documentado para otros campos de
 * esta entrega) — así que en vez de dejarlo vacío se deriva automáticamente
 * del nombre completo, mismo criterio que ya usa `TarjetaSpeaker` para el
 * avatar de respaldo (primeras dos iniciales de las palabras del nombre).
 */
function derivarIniciales(nombre: string): string {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/**
 * CORRECCIÓN DE RENDIMIENTO (septiembre 2026): este componente vivía
 * definido DENTRO del cuerpo de `UsuariosRoles()`. Eso crea una función
 * nueva (un "tipo" de componente distinto para React) en cada render del
 * padre, así que React desmontaba y volvía a montar por completo este
 * subformulario — con TODOS sus inputs, selects y checkboxes — en cada
 * tecla presionada en cualquier campo del diálogo (incluido este mismo),
 * porque escribir dispara `onChange` → `setNuevo`/`setPerfil` → re-render
 * de `UsuariosRoles` → nueva identidad de función → remount. Eso es
 * exactamente lo que se sentía como "escribir carácter por carácter, y
 * esperar": cada tecla reconstruía el formulario entero desde cero. Se
 * saca al ámbito del módulo (como cualquier otro componente de la app) y
 * `empresas`/`paises` — que antes tomaba por clausura del padre — pasan a
 * ser props explícitas.
 */
function CamposPerfil({
  valor,
  onChange,
  empresas,
  paises,
  incluirRolAdministrador = true,
  bloquearEscalamiento = false,
  posiblesJefes,
  idPropio = null,
}: {
  valor: CambiosPerfilUsuario;
  onChange: (v: CambiosPerfilUsuario) => void;
  empresas: string[];
  paises: string[];
  incluirRolAdministrador?: boolean;
  /** Entrega 23: colaboradores activos y confirmados entre los que se elige el "Jefe inmediato". */
  posiblesJefes: { id: string; nombre: string; cargo: string }[];
  /** Id del usuario que se edita (en "Nuevo usuario" es null y "Él mismo" usa `JEFE_ES_EL_MISMO`). */
  idPropio?: string | null;
  /**
   * Hallazgo F39: nadie debe poder otorgarse a sí mismo (ni quitarse)
   * acceso de Administrador o el alcance limitado — se bloquean estos dos
   * campos cuando la persona está editando su propio registro.
   */
  bloquearEscalamiento?: boolean;
}) {
  const requiereAlcance = valor.rol !== "administrador" || valor.administradorAlcanceLimitado;
  const { opciones: areas } = useCatalogo("areasUsuario");
  const hayJefe = Boolean(valor.jefeInmediatoId);
  // Si el valor guardado (área) ya no está en el catálogo, se conserva visible para no perderlo en silencio.
  const opcionesArea = valor.area && !areas.includes(valor.area) ? [valor.area, ...areas] : areas;
  return (
    // Pedido explícito: "Usar formularios colapsables (tipo acordeón) según
    // las secciones que compongan el formulario" — las 4 secciones abren
    // por defecto (type="multiple", defaultValue con las 4 claves) para no
    // esconder campos obligatorios detrás de un clic extra; siguen siendo
    // colapsables si el usuario quiere achicar el diálogo.
    <Accordion type="multiple" defaultValue={["identificacion", "direccion", "alcance", "otros"]} className="flex flex-col gap-2">
      <AccordionItem value="identificacion" className="rounded-md border px-6">
        <AccordionTrigger>Identificación</AccordionTrigger>
        <AccordionContent className="flex flex-col gap-3 pb-6 pt-6">
          <div className="grid grid-cols-2 gap-3">
            {/* Entrega 33, pedido explícito: campo de foto del usuario, igual que en la ventana de Speakers — avatar
                circular a la izquierda (se ve de inmediato al cargarla) con el nombre y el documento a su lado. */}
            <div className="col-span-2 flex items-start gap-4">
              <AvatarFotoEditable
                testId="usr-foto"
                valor={valor.fotoId}
                onChange={(id) => onChange({ ...valor, fotoId: id })}
                nombre={valor.nombre}
                etiqueta="foto del usuario"
                tipoNombreArchivo="Foto usuario"
                comprimir
              />
              <div className="flex flex-1 flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="usr-nombre">Nombre completo *</Label>
                  <Input id="usr-nombre" value={valor.nombre} onChange={(e) => onChange({ ...valor, nombre: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="usr-documento">Número de documento *</Label>
                  <Input id="usr-documento" value={valor.numeroDocumento} onChange={(e) => onChange({ ...valor, numeroDocumento: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="usr-cargo">Cargo *</Label>
              <Input id="usr-cargo" value={valor.cargo} onChange={(e) => onChange({ ...valor, cargo: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="usr-telefono">Teléfono *</Label>
              <Input id="usr-telefono" value={valor.telefono} onChange={(e) => onChange({ ...valor, telefono: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="usr-rol">Rol</Label>
              <Select value={valor.rol} onValueChange={(v) => onChange({ ...valor, rol: v as CambiosPerfilUsuario["rol"] })}>
                <SelectTrigger id="usr-rol"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROL_USUARIO.filter((r) => incluirRolAdministrador || r !== "administrador").map((r) => (
                    <SelectItem key={r} value={r}>{ETIQUETA_ROL_USUARIO[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Entrega 23: Área, director de área, jefe inmediato y Compliance Officer LATAM —
                alimentan las líneas de firma del CAF. */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="usr-area">Área</Label>
              <Select value={valor.area || SIN_VALOR} onValueChange={(v) => onChange({ ...valor, area: v === SIN_VALOR ? "" : v })}>
                <SelectTrigger id="usr-area"><SelectValue placeholder="Sin área" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_VALOR}>Sin área</SelectItem>
                  {opcionesArea.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Las opciones se administran en Configuración de campos → Catálogos → "Áreas (perfil de usuario)".</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="usr-jefe">Jefe inmediato</Label>
              <Select
                value={valor.jefeInmediatoId || SIN_VALOR}
                onValueChange={(v) => onChange({ ...valor, jefeInmediatoId: v === SIN_VALOR ? "" : v, firmaComoJefeInmediato: v === SIN_VALOR ? false : valor.firmaComoJefeInmediato })}
              >
                <SelectTrigger id="usr-jefe"><SelectValue placeholder="Sin jefe cargado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_VALOR}>Sin jefe cargado</SelectItem>
                  {idPropio === null && <SelectItem value={JEFE_ES_EL_MISMO}>Él mismo (este usuario)</SelectItem>}
                  {posiblesJefes.map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.nombre}{j.id === idPropio ? " (él mismo)" : ""}{j.cargo ? ` — ${j.cargo}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Puede ser otro colaborador o el mismo usuario (autofirma la línea "Jefe inmediato").</p>
            </div>
            <div className="col-span-2 flex flex-col gap-2 rounded-md border p-3">
              <span className="text-sm font-medium">Líneas de firma del CAF</span>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={valor.esDirectorArea} onCheckedChange={(c) => onChange({ ...valor, esDirectorArea: c === true, firmaComoDirectorArea: c === true ? false : valor.firmaComoDirectorArea })} />
                Es director de área
              </label>
              {!valor.esDirectorArea && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={valor.firmaComoDirectorArea} onCheckedChange={(c) => onChange({ ...valor, firmaComoDirectorArea: c === true })} />
                  Firma como director de área (aunque no sea director de área)
                </label>
              )}
              <label className={`flex items-center gap-2 text-sm ${hayJefe ? "" : "text-muted-foreground"}`}>
                <Checkbox disabled={!hayJefe} checked={hayJefe && valor.firmaComoJefeInmediato} onCheckedChange={(c) => onChange({ ...valor, firmaComoJefeInmediato: c === true })} />
                Firma como jefe inmediato {!hayJefe && "(primero elige un jefe inmediato)"}
              </label>
              {rolPuedeSerComplianceLatam(valor.rol) && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={valor.firmaComoComplianceLatam} onCheckedChange={(c) => onChange({ ...valor, firmaComoComplianceLatam: c === true })} />
                  Firma como Compliance Officer LATAM
                </label>
              )}
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="direccion" className="rounded-md border px-6">
        <AccordionTrigger>Dirección</AccordionTrigger>
        <AccordionContent className="flex flex-col gap-3 pb-6 pt-6">
          <div className="grid grid-cols-2 gap-3">
            <SelectPaisEstadoCiudad
              idPrefix="usr"
              etiquetaPais="País *"
              etiquetaEstado="Estado/Provincia/Departamento *"
              etiquetaCiudad="Ciudad *"
              valorPais={valor.pais}
              valorEstado={valor.estadoProvincia}
              valorCiudad={valor.ciudad}
              onChangePaisEstadoCiudad={(pais, estadoProvincia, ciudad) => onChange({ ...valor, pais, estadoProvincia, ciudad })}
            />
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="alcance" className="rounded-md border px-6">
        <AccordionTrigger>Alcance y acceso</AccordionTrigger>
        <AccordionContent className="flex flex-col gap-4 pb-6 pt-6">
          <div className="flex flex-col gap-1.5">
            <Label>Empresa(s) del grupo {requiereAlcance && "*"}</Label>
            <div className="flex flex-wrap gap-3 rounded-md border p-2">
              {empresas.map((emp) => (
                <label key={emp} className="flex items-center gap-1.5 text-sm">
                  <Checkbox checked={valor.empresasGrupo.includes(emp)} onCheckedChange={() => onChange({ ...valor, empresasGrupo: alternar(valor.empresasGrupo, emp) })} />
                  {emp}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>País(es) de operación {requiereAlcance && "*"}</Label>
            <div className="flex flex-wrap gap-3 rounded-md border p-2">
              {paises.map((p) => (
                <label key={p} className="flex items-center gap-1.5 text-sm">
                  <Checkbox checked={valor.paisesOperacion.includes(p)} onCheckedChange={() => onChange({ ...valor, paisesOperacion: alternar(valor.paisesOperacion, p) })} />
                  {p}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Páginas permitidas (vacío = usar los permisos por defecto del rol)</Label>
            <div className="grid max-h-40 grid-cols-2 gap-x-4 gap-y-1.5 overflow-y-auto rounded-md border p-2">
              {PAGINAS_SELECCIONABLES.map((item) => (
                <label key={item.id} className="flex items-center gap-1.5 text-sm">
                  <Checkbox checked={valor.paginasPermitidas.includes(item.id)} onCheckedChange={() => onChange({ ...valor, paginasPermitidas: alternar(valor.paginasPermitidas, item.id) })} />
                  {item.etiqueta}
                  {item.exigeAdministrador && <span className="text-[10px] font-semibold uppercase text-muted-foreground">(solo admin.)</span>}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span>Acceso de Administrador (además de su rol)</span>
            <ToggleCapsula
              value={valor.esAdministrador ? "si" : "no"}
              onValueChange={(v) => onChange({ ...valor, esAdministrador: v === "si", administradorAlcanceLimitado: v === "si" ? valor.administradorAlcanceLimitado : false })}
              opciones={[
                { value: "no", label: "No" },
                { value: "si", label: "Sí" },
              ]}
              disabled={bloquearEscalamiento}
            />
          </div>
          {(valor.esAdministrador || valor.rol === "administrador") && (
            <div className="flex flex-col gap-1.5">
              <span>Alcance limitado a sus propios países/empresas</span>
              <ToggleCapsula
                value={valor.administradorAlcanceLimitado ? "si" : "no"}
                onValueChange={(v) => onChange({ ...valor, administradorAlcanceLimitado: v === "si" })}
                opciones={[
                  { value: "no", label: "No" },
                  { value: "si", label: "Sí" },
                ]}
                disabled={bloquearEscalamiento}
              />
            </div>
          )}
          {bloquearEscalamiento && (
            <p className="text-xs text-muted-foreground">
              No puedes cambiar tu propio acceso de Administrador — pídeselo a otro Administrador.
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <span>Gestión avanzada de documentos firmados (Módulo de administración)</span>
            <ToggleCapsula
              value={valor.puedeEliminarDocumentosFirmados ? "si" : "no"}
              onValueChange={(v) => onChange({ ...valor, puedeEliminarDocumentosFirmados: v === "si" })}
              opciones={[
                { value: "no", label: "No" },
                { value: "si", label: "Sí" },
              ]}
              disabled={bloquearEscalamiento}
            />
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="otros" className="rounded-md border px-6">
        <AccordionTrigger>Observaciones y firma</AccordionTrigger>
        <AccordionContent className="flex flex-col gap-3 pb-6 pt-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="usr-observaciones">Observaciones</Label>
            <Input id="usr-observaciones" value={valor.observaciones} onChange={(e) => onChange({ ...valor, observaciones: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Firma manuscrita *</Label>
            <CapturaFirmaManuscrita valor={valor.firmaId} onChange={(firmaId) => onChange({ ...valor, firmaId })} />
            <p className="text-xs text-muted-foreground">Obligatoria — dibújala o carga un archivo antes de confirmar el usuario.</p>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export function UsuariosRoles() {
  const { usuario: sesion } = useAuth();
  const { companiaActual } = useCompania();
  const { opciones: empresas } = useCatalogo("empresasGrupo");
  const paises = PAISES_OPERACION;
  const [usuarios, setUsuarios] = React.useState<Usuario[]>([]);
  const [solicitudes, setSolicitudes] = React.useState<SolicitudRestablecimientoPassword[]>([]);
  const [cargando, setCargando] = React.useState(true);
  const [procesando, setProcesando] = React.useState(false);
  // Entrega 23: candidatos a "Jefe inmediato" (activos y ya confirmados, no borradores).
  const posiblesJefes = usuarios.filter((u) => u.activo && u.estadoUsuario === "Confirmado").map((u) => ({ id: u.id, nombre: u.nombre, cargo: u.cargo }));

  const [abiertoEditar, setAbiertoEditar] = React.useState(false);
  const [editandoId, setEditandoId] = React.useState<string | null>(null);
  const [perfil, setPerfil] = React.useState<CambiosPerfilUsuario>(PERFIL_VACIO);

  const [abiertoNuevo, setAbiertoNuevo] = React.useState(false);
  // Ronda de ajustes de formularios (septiembre 2026), entrega 8: si se
  // abre este diálogo desde "Continuar borrador" en vez de "Nuevo
  // Usuario", este id apunta al borrador que "Confirmar Usuario" debe
  // completar y borrar (ver `crearUsuario`/`guardarBorradorUsuario` en
  // lib/usuarios.ts) — `null` cuando es una creación nueva de cero.
  const [confirmandoBorradorId, setConfirmandoBorradorId] = React.useState<string | null>(null);
  const [nuevo, setNuevo] = React.useState<DatosNuevoUsuario>({
    ...PERFIL_VACIO,
    email: "",
    iniciales: "",
  });
  // Pedido explícito: "campo para verificación de email -doble chequeo-".
  const [confirmarEmail, setConfirmarEmail] = React.useState("");

  const [abiertoCorreo, setAbiertoCorreo] = React.useState<Usuario | null>(null);
  const [nuevoCorreo, setNuevoCorreo] = React.useState("");

  function recargar() {
    setCargando(true);
    // Hallazgo F39: un Administrador de alcance limitado solo debe ver
    // colaboradores dentro de sus propias empresas/países — ver el
    // comentario de `traerUsuarios`/`AlcanceUsuario` en lib/usuarios.ts.
    // Esto es defensa en el cliente; la corrección definitiva es la
    // política RLS propuesta en docs/rls-usuarios.propuesta.sql.
    const alcance =
      sesion?.administradorAlcanceLimitado
        ? { empresasGrupo: sesion.empresasGrupo, paisesOperacion: sesion.paisesOperacion }
        : undefined;
    Promise.all([traerUsuarios(alcance), traerSolicitudesRestablecimiento()])
      .then(([u, s]) => {
        setUsuarios(u);
        setSolicitudes(s);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "No se pudo cargar la información."))
      .finally(() => setCargando(false));
  }

  React.useEffect(recargar, []);

  function abrirEdicion(u: Usuario) {
    setEditandoId(u.id);
    setPerfil({
      nombre: u.nombre,
      cargo: u.cargo,
      telefono: u.telefono,
      rol: u.rol,
      paginasPermitidas: u.paginasPermitidas,
      paisesOperacion: u.paisesOperacion,
      empresasGrupo: u.empresasGrupo,
      esAdministrador: u.esAdministrador,
      administradorAlcanceLimitado: u.administradorAlcanceLimitado,
      puedeEliminarDocumentosFirmados: u.puedeEliminarDocumentosFirmados,
      numeroDocumento: u.numeroDocumento,
      pais: u.pais,
      estadoProvincia: u.estadoProvincia,
      ciudad: u.ciudad,
      observaciones: u.observaciones,
      firmaId: u.firmaId,
      fotoId: u.fotoId,
      area: u.area,
      esDirectorArea: u.esDirectorArea,
      firmaComoDirectorArea: u.firmaComoDirectorArea,
      jefeInmediatoId: u.jefeInmediatoId,
      firmaComoJefeInmediato: u.firmaComoJefeInmediato,
      firmaComoComplianceLatam: u.firmaComoComplianceLatam,
    });
    setAbiertoEditar(true);
  }

  async function guardarEdicion() {
    if (!editandoId) return;
    setProcesando(true);
    try {
      const resultado = await actualizarPerfilUsuario(editandoId, perfil);
      toast.success("Usuario actualizado.");
      // Entrega 33: la foto se guarda aparte (solo si cambió) para que un guardado normal nunca falle por la columna nueva.
      const fotoOriginal = usuarios.find((x) => x.id === editandoId)?.fotoId ?? null;
      if ((perfil.fotoId ?? null) !== fotoOriginal) await guardarFotoConAviso(editandoId, perfil.fotoId);
      // Entrega 23: si la migración 23b aún no se ejecutó, el resto del perfil se guarda pero Área,
      // jefe inmediato y las opciones de firma no.
      if (!resultado.guardoOpcionesFirma) {
        toast.warning("Área, jefe inmediato y opciones de firma no se guardaron: falta ejecutar db/entrega_23b_roles_legal_compliance_perfil.sql.");
      }
      setAbiertoEditar(false);
      recargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setProcesando(false);
    }
  }

  /** Abre el diálogo de "Nuevo Usuario" precargado con un borrador ya guardado, para completarlo o confirmarlo. */
  function continuarBorrador(u: Usuario) {
    setConfirmandoBorradorId(u.id);
    setNuevo({
      nombre: u.nombre,
      cargo: u.cargo,
      email: u.email,
      telefono: u.telefono,
      rol: u.rol,
      iniciales: u.iniciales || derivarIniciales(u.nombre),
      paginasPermitidas: u.paginasPermitidas,
      paisesOperacion: u.paisesOperacion,
      empresasGrupo: u.empresasGrupo,
      esAdministrador: u.esAdministrador,
      administradorAlcanceLimitado: u.administradorAlcanceLimitado,
      puedeEliminarDocumentosFirmados: u.puedeEliminarDocumentosFirmados,
      numeroDocumento: u.numeroDocumento,
      pais: u.pais,
      estadoProvincia: u.estadoProvincia,
      ciudad: u.ciudad,
      observaciones: u.observaciones,
      firmaId: u.firmaId,
      fotoId: u.fotoId,
      area: u.area,
      esDirectorArea: u.esDirectorArea,
      firmaComoDirectorArea: u.firmaComoDirectorArea,
      jefeInmediatoId: u.jefeInmediatoId === u.id ? JEFE_ES_EL_MISMO : u.jefeInmediatoId,
      firmaComoJefeInmediato: u.firmaComoJefeInmediato,
      firmaComoComplianceLatam: u.firmaComoComplianceLatam,
    });
    setConfirmarEmail(u.email);
    setAbiertoNuevo(true);
  }

  /** Guarda la foto de un colaborador; si falta la columna (migración pendiente) avisa en vez de fallar. */
  async function guardarFotoConAviso(usuarioId: string, fotoId: string | null) {
    try {
      const ok = await guardarFotoUsuario(usuarioId, fotoId);
      if (!ok) toast.warning("La foto no se guardó: falta ejecutar db/entrega_33_foto_usuario.sql en Supabase.");
    } catch (e) {
      toast.warning(e instanceof Error ? `La foto no se guardó: ${e.message}` : "La foto no se guardó.");
    }
  }

  function cerrarDialogoNuevo() {
    setAbiertoNuevo(false);
    setConfirmandoBorradorId(null);
    setNuevo({ ...PERFIL_VACIO, email: "", iniciales: "" }); // "iniciales" ya no se captura en el formulario — se recalcula del nombre al confirmar (ver `derivarIniciales`).
    setConfirmarEmail("");
  }

  /** "Guardar como borrador" — nunca crea la cuenta real ni envía correo, ver `guardarBorradorUsuario`. */
  async function guardarBorrador() {
    if (!nuevo.nombre.trim()) {
      toast.error("Indica al menos el nombre para guardar el borrador.");
      return;
    }
    setProcesando(true);
    try {
      const datosBorrador = { ...nuevo, iniciales: derivarIniciales(nuevo.nombre) };
      if (confirmandoBorradorId) {
        await editarBorradorUsuario(confirmandoBorradorId, datosBorrador);
        const fotoOriginal = usuarios.find((x) => x.id === confirmandoBorradorId)?.fotoId ?? null;
        if ((nuevo.fotoId ?? null) !== fotoOriginal) await guardarFotoConAviso(confirmandoBorradorId, nuevo.fotoId);
      } else {
        const creado = await guardarBorradorUsuario(datosBorrador);
        if (nuevo.fotoId) await guardarFotoConAviso(creado.id, nuevo.fotoId);
      }
      toast.success("Borrador de usuario guardado.");
      cerrarDialogoNuevo();
      recargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el borrador.");
    } finally {
      setProcesando(false);
    }
  }

  /** "Confirmar Usuario" — crea la cuenta real y dispara el correo con la contraseña temporal. */
  async function confirmar() {
    if (!nuevo.nombre.trim() || !nuevo.cargo.trim() || !nuevo.email.trim()) {
      toast.error("Completa nombre, cargo y correo.");
      return;
    }
    if (normalizarEmail(nuevo.email) !== normalizarEmail(confirmarEmail)) {
      toast.error("El correo y su verificación no coinciden.");
      return;
    }
    const requiereAlcance = nuevo.rol !== "administrador" || nuevo.administradorAlcanceLimitado;
    if (requiereAlcance && nuevo.paisesOperacion.length === 0) {
      toast.error("Selecciona al menos un país de operación.");
      return;
    }
    if (requiereAlcance && nuevo.empresasGrupo.length === 0) {
      toast.error("Selecciona al menos una empresa del grupo.");
      return;
    }
    // Ajuste de precisión (septiembre 2026), pedido explícito: la firma
    // manuscrita (dibujada o cargada desde archivo) pasa a ser obligatoria
    // para confirmar un Nuevo Usuario.
    if (!nuevo.firmaId) {
      toast.error("Registra la firma manuscrita (dibujada o cargada desde archivo) antes de confirmar.");
      return;
    }
    setProcesando(true);
    try {
      // "Iniciales" ya no es un campo del formulario (pedido explícito del
      // usuario) — se deriva del nombre completo justo antes de confirmar,
      // así el resto del flujo (función Edge `admin-usuarios`) sigue
      // recibiendo el valor que espera sin que el usuario tenga que
      // digitarlo.
      const creado = await crearUsuario({ ...nuevo, iniciales: derivarIniciales(nuevo.nombre) }, confirmandoBorradorId ?? undefined);
      if (nuevo.fotoId && creado.id) await guardarFotoConAviso(creado.id, nuevo.fotoId);
      toast.success(`Usuario confirmado. Se le envió una contraseña temporal a ${nuevo.email}.`);
      cerrarDialogoNuevo();
      recargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo confirmar el usuario.");
    } finally {
      setProcesando(false);
    }
  }

  async function resetearPassword(u: Usuario) {
    setProcesando(true);
    try {
      await resetearPasswordUsuario(u.id);
      toast.success(`Se envió una nueva contraseña temporal al correo de ${u.nombre}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo restablecer la contraseña.");
    } finally {
      setProcesando(false);
    }
  }

  async function resolverSolicitud(s: SolicitudRestablecimientoPassword) {
    const u = usuarios.find((x) => x.id === s.usuarioId);
    setProcesando(true);
    try {
      await resetearPasswordUsuario(s.usuarioId);
      await marcarSolicitudResuelta(s.id);
      toast.success(`Contraseña restablecida${u ? ` para ${u.nombre}` : ""} — se le envió por correo.`);
      recargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo resolver la solicitud.");
    } finally {
      setProcesando(false);
    }
  }

  /**
   * Habilitar/inhabilitar usuarios (septiembre 2026). El alcance ya lo
   * respeta la propia tabla (`recargar()` solo trae, para un Administrador
   * de alcance limitado, a los colaboradores dentro de su empresa/país —
   * ver comentario ahí mismo) — la única regla que falta acá es que nadie
   * se inhabilite a sí mismo.
   */
  async function alternarActivo(u: Usuario) {
    if (u.id === sesion?.id) {
      toast.error("No puedes inhabilitar tu propia cuenta — pídeselo a otro Administrador.");
      return;
    }
    setProcesando(true);
    try {
      await cambiarActivoUsuario(u.id, !u.activo);
      toast.success(u.activo ? `${u.nombre} fue inhabilitado.` : `${u.nombre} fue habilitado.`);
      recargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cambiar el estado del usuario.");
    } finally {
      setProcesando(false);
    }
  }

  async function cambiarCorreo() {
    if (!abiertoCorreo || !nuevoCorreo.trim()) return;
    setProcesando(true);
    try {
      await actualizarEmailUsuario(abiertoCorreo.id, nuevoCorreo.trim());
      toast.success("Correo de inicio de sesión actualizado.");
      setAbiertoCorreo(null);
      setNuevoCorreo("");
      recargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar el correo.");
    } finally {
      setProcesando(false);
    }
  }

  // Selector de compañía del grupo (pedido explícito, octubre 2026): la
  // lista de usuarios solo debe mostrar, además del alcance ya aplicado
  // arriba, a los colaboradores de la compañía con la que se está
  // trabajando — un `empresasGrupo` vacío sigue siendo el comodín
  // "todas las compañías" que ya usa el resto de la app.
  const usuariosDeCompania = usuarios.filter(
    (u) => !companiaActual || u.empresasGrupo.length === 0 || u.empresasGrupo.includes(companiaActual),
  );
  const solicitudesPendientes = solicitudes.filter((s) => !s.resuelta);
  const borradores = usuariosDeCompania.filter((u) => u.estadoUsuario === "Borrador");
  const confirmados = usuariosDeCompania.filter((u) => u.estadoUsuario !== "Borrador");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Usuarios y Roles</h1>
          <p className="text-sm text-muted-foreground">
            Administra usuarios, su rol, alcance de país/empresa y acceso de Administrador.
          </p>
        </div>
        <Button onClick={() => setAbiertoNuevo(true)}>
          <Plus /> Nuevo Usuario
        </Button>
      </div>

      {borradores.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Borradores de usuario</CardTitle>
            <CardDescription>Guardados pero sin confirmar todavía — no tienen cuenta real ni se les ha enviado contraseña.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {borradores.map((u) => (
              <div key={u.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span className="flex items-center gap-2">
                  <AvatarUsuario usuarioId={u.id} fotoId={u.fotoId} nombre={u.nombre} iniciales={u.iniciales} className="size-7" />
                  {u.nombre || "(sin nombre)"} — {u.email || "sin correo todavía"}
                </span>
                <Button size="sm" className="gap-1.5" onClick={() => continuarBorrador(u)}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Continuar
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {solicitudesPendientes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Solicitudes de restablecimiento de contraseña</CardTitle>
            <CardDescription>Un colaborador sin sesión pidió que le restablezcan su contraseña.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {solicitudesPendientes.map((s) => {
              const u = usuarios.find((x) => x.id === s.usuarioId);
              return (
                <div key={s.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <span>
                    {u?.nombre ?? s.usuarioId} — {formatearFechaHora(s.creadaEn)}
                  </span>
                  <Button size="sm" disabled={procesando} onClick={() => resolverSolicitud(s)}>
                    Resetear ahora
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        {/* AJUSTES (septiembre/octubre 2026), pedido explícito: "los marcos
            de las ventanas se han distorsionado/desconfigurado" — esta
            tabla (6 columnas: Nombre/Correo/Rol con badges que pueden
            envolver/Alcance con texto largo de países-empresas/Activo/
            Acciones) no tenía `overflow-x-auto`: en pantallas más angostas
            o con datos largos, en vez de aparecer una barra de scroll
            horizontal DENTRO de la tarjeta, la tabla empujaba el ancho de
            toda la tarjeta (y potencialmente de la página), deformando su
            marco. `overflow-x-auto` aquí contiene ese desborde dentro de la
            tarjeta, sin tocar su `border`/esquinas. */}
        <CardContent className="overflow-x-auto p-0">
          {/* Octubre 2026, pedido explícito: ver TODA la información de cada
              usuario sin barra de desplazamiento horizontal. El contenedor de
              la página ahora es más ancho (`max-w-7xl`, ver `App.tsx`) y las
              columnas de texto largo (Nombre, Correo, Alcance) envuelven en
              vez de empujar el ancho de la tabla; "Activo" y los botones de
              acción nunca se parten (`whitespace-nowrap`). El `overflow-x-auto`
              de la tarjeta queda solo como último respaldo en pantallas muy
              angostas. */}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="min-w-[8rem] p-3 font-medium">Nombre</th>
                <th className="min-w-[12rem] p-3 font-medium">Correo</th>
                <th className="p-3 font-medium">Rol</th>
                <th className="p-3 font-medium">Alcance</th>
                <th className="p-3 font-medium">Activo</th>
                <th className="p-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {cargando && (
                <tr><td className="p-3 text-muted-foreground" colSpan={6}>Cargando...</td></tr>
              )}
              {!cargando && confirmados.map((u) => (
                <tr key={u.id} className={`border-b last:border-0 ${!u.activo ? "text-muted-foreground" : ""}`}>
                  <td className="p-3">
                    <div className="flex items-center gap-2.5">
                      <AvatarUsuario usuarioId={u.id} fotoId={u.fotoId} nombre={u.nombre} iniciales={u.iniciales} className={`size-9 ${!u.activo ? "opacity-50 grayscale" : ""}`} />
                      <span>
                        <span className={!u.activo ? "line-through" : ""}>{u.nombre}</span>
                        {u.id === sesion?.id && <span className="text-muted-foreground"> (tú)</span>}
                      </span>
                    </div>
                  </td>
                  <td className="p-3 [overflow-wrap:anywhere]">{u.email}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary">{ETIQUETA_ROL_USUARIO[u.rol]}</Badge>
                      {u.esAdministrador && <Badge variant="approved">Administrador{u.administradorAlcanceLimitado ? " (limitado)" : ""}</Badge>}
                      {!u.activo && <Badge variant="destructive">Inhabilitado</Badge>}
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground [overflow-wrap:anywhere]">
                    {u.empresasGrupo.join(", ") || "todas"} · {u.paisesOperacion.join(", ") || "todos"}
                  </td>
                  <td className="whitespace-nowrap p-3">
                    <div title={u.id === sesion?.id ? "No puedes inhabilitar tu propia cuenta" : u.activo ? "Inhabilitar" : "Habilitar"}>
                      <ToggleCapsula
                        value={u.activo ? "si" : "no"}
                        onValueChange={() => alternarActivo(u)}
                        opciones={[
                          { value: "no", label: "Inactivo" },
                          { value: "si", label: "Activo" },
                        ]}
                        disabled={procesando || u.id === sesion?.id}
                      />
                    </div>
                  </td>
                  <td className="whitespace-nowrap p-3">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" title="Editar" onClick={() => abrirEdicion(u)}>
                        <Pencil />
                      </Button>
                      <Button size="icon" variant="ghost" title="Cambiar correo" onClick={() => { setAbiertoCorreo(u); setNuevoCorreo(u.email); }}>
                        <Mail />
                      </Button>
                      <Button size="icon" variant="ghost" title="Resetear contraseña" disabled={procesando} onClick={() => resetearPassword(u)}>
                        <KeyRound />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={abiertoNuevo} onOpenChange={(v) => (v ? setAbiertoNuevo(true) : cerrarDialogoNuevo())}>
        {/* AJUSTES (septiembre/octubre 2026), pedido explícito: "Armoniza el
            ancho de todas las ventanas de los formularios, porque en algunas
            [...] se está dejando de ver cierta información. P. ej: en la
            ventana de configuración de usuarios/roles[...] las líneas de los
            cuadros se ven desalineadas, mal diseñadas." Causa real: esta
            ventana usa una cuadrícula de 2 columnas (`CamposPerfil`, más
            abajo) y, tras rondas anteriores que alargaron varias etiquetas
            de rol (p. ej. "Gerencia General / Rep. Legal"), el
            ancho por defecto del diálogo (`max-w-lg`, 512px) ya no le
            alcanza — el texto se corta/envuelve mal dentro de cada celda.
            Se ensancha a `max-w-2xl` (igual que el otro diálogo de este
            mismo archivo y el de Speakers, ver sus comentarios) para que
            las 2 columnas quepan cómodas con las etiquetas actuales.

            AJUSTES (septiembre/octubre 2026), pedido explícito: "No se
            corrigió esto: '[...] si por alguna razón das clic por fuera de
            la ventana del formulario, se cierra y se pierde la
            información. [...]' Valida que quede funcional en todos los
            formularios, especialmente en el de configuración de
            usuarios/roles." Los 6 `Detalle*.tsx` sí tenían este bloqueo
            (`onPointerDownOutside`/`onEscapeKeyDown`) desde una ronda
            anterior — este diálogo de "Nuevo Usuario" (y el de "Editar
            usuario" de abajo) nunca lo tuvo: un clic fuera o Escape
            disparaban `onOpenChange` sin ningún guardia y cerraban el
            diálogo sin preguntar, perdiendo todo lo escrito. Se bloquean
            ambos disparadores igual que en los `Detalle*.tsx`; cerrar sigue
            siendo posible, pero solo con un clic explícito en "Cancelar" o
            en la "X". */}
        <DialogContent
          minimizable
          confirmarCierre
          className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{confirmandoBorradorId ? "Continuar borrador de usuario" : "Nuevo Usuario"}</DialogTitle>
            <DialogDescription>Al confirmar, se le enviará por correo una contraseña temporal — deberá cambiarla al ingresar.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nvo-email">Correo electrónico *</Label>
              <InputEmail id="nvo-email" placeholder="tu.nombre@bauschhealth.com" value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nvo-email-confirmar">Verificar correo electrónico *</Label>
              <InputEmail id="nvo-email-confirmar" value={confirmarEmail} onChange={(e) => setConfirmarEmail(e.target.value)} />
              {confirmarEmail && normalizarEmail(nuevo.email) !== normalizarEmail(confirmarEmail) && (
                <p className="text-xs text-destructive">Los correos no coinciden.</p>
              )}
            </div>
          </div>
          <CamposPerfil valor={nuevo} onChange={(v) => setNuevo({ ...nuevo, ...v })} empresas={empresas} paises={paises} posiblesJefes={posiblesJefes.filter((j) => j.id !== confirmandoBorradorId)} idPropio={null} />
          <DialogFooter>
            <Button variant="outline" onClick={cerrarDialogoNuevo}>Cancelar</Button>
            <Button variant="outline" disabled={procesando} onClick={guardarBorrador}>Guardar como borrador</Button>
            <Button disabled={procesando} className="gap-1.5" onClick={confirmar}>
              <CheckCircle2 className="h-4 w-4" /> Confirmar Usuario
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={abiertoEditar} onOpenChange={setAbiertoEditar}>
        {/* AJUSTES (septiembre/octubre 2026): ver el comentario en el diálogo
            "Nuevo Usuario" de arriba — mismo ancho y mismo bloqueo de cierre
            accidental, por las mismas razones. */}
        <DialogContent
          minimizable
          confirmarCierre
          className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
          </DialogHeader>
          <CamposPerfil valor={perfil} onChange={setPerfil} empresas={empresas} paises={paises} bloquearEscalamiento={editandoId === sesion?.id} posiblesJefes={posiblesJefes} idPropio={editandoId} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbiertoEditar(false)}>Cancelar</Button>
            <Button disabled={procesando} onClick={guardarEdicion}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(abiertoCorreo)} onOpenChange={(v) => !v && setAbiertoCorreo(null)}>
        {/* AJUSTES (septiembre/octubre 2026): mismo bloqueo de cierre
            accidental que los demás diálogos de este archivo — ver el
            comentario en "Nuevo Usuario" arriba. */}
        <DialogContent onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Cambiar correo de inicio de sesión</DialogTitle>
            <DialogDescription>{abiertoCorreo?.nombre}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nuevo-correo">Nuevo correo</Label>
            <InputEmail id="nuevo-correo" value={nuevoCorreo} onChange={(e) => setNuevoCorreo(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbiertoCorreo(null)}>Cancelar</Button>
            <Button disabled={procesando} onClick={cambiarCorreo}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
