import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { InputMayuscula } from "@/components/ui/input-mayuscula";
import { InputEmail } from "@/components/ui/input-email";
import { aMayusculas, esEmailValido, normalizarEmail } from "@/lib/normalizarTexto";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SelectPaisEstadoCiudad } from "@/components/SelectPaisEstadoCiudad";
import { FirmaCanvas, type FirmaCanvasHandle } from "./FirmaCanvas";
import {
  INTERES_VISITA_MEDICA,
  PROFESION_EJECUCION,
  TIPO_PARTICIPACION_EJECUCION,
  type DatosCheckIn,
  type SesionEjecucionActiva,
} from "../lib/rpc";

const ESPECIALIDAD_OTRA = "__otra__";

const ETIQUETA_PROFESION: Record<(typeof PROFESION_EJECUCION)[number], string> = {
  medico: "Médico",
  no_medico: "No médico",
};

const ETIQUETA_INTERES: Record<(typeof INTERES_VISITA_MEDICA)[number], string> = {
  si: "Sí, quiere recibir visita médica",
  no: "No",
  ya_recibe: "Ya recibe visita médica",
};

const ETIQUETA_PARTICIPACION: Record<(typeof TIPO_PARTICIPACION_EJECUCION)[number], string> = {
  evento: "Evento",
  stand: "Stand",
};

interface Props {
  sesion: SesionEjecucionActiva;
  enviando: boolean;
  onCancelar: () => void;
  onEnviar: (datos: DatosCheckIn) => void;
}

/**
 * `FormularioCheckIn` — nombre tomado literalmente del comentario de
 * cabecera de `crear_registro_participacion` en el código fuente real, que
 * aclara que el formulario actual solo ofrece 2 de las 3 opciones
 * históricas de `tipo_participacion` ('evento'/'stand'; 'taller' se
 * mantiene válido a nivel de función solo por compatibilidad con datos
 * viejos).
 *
 * La validación "de verdad" (obligatoriedad de nombre/apellido/cédula,
 * valores permitidos de profesión/interés/participación, sesión requerida
 * en evento multisesión, etc.) la hace la propia RPC — este formulario solo
 * marca visualmente los campos obligatorios; el mensaje de error que se
 * muestra si algo falta es el que la función devuelve, verbatim.
 */
export function FormularioCheckIn({ sesion, enviando, onCancelar, onEnviar }: Props) {
  const [nombres, setNombres] = React.useState("");
  const [apellidos, setApellidos] = React.useState("");
  const [cedula, setCedula] = React.useState("");
  const [tipoDocumento, setTipoDocumento] = React.useState(sesion.tiposDocumento[0] ?? "Cédula");
  const [profesion, setProfesion] = React.useState<DatosCheckIn["profesion"]>("medico");
  const [profesionDetalle, setProfesionDetalle] = React.useState("");
  const [especialidad, setEspecialidad] = React.useState("");
  const [especialidadOtra, setEspecialidadOtra] = React.useState("");
  const [celular, setCelular] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [autorizaImagenVoz, setAutorizaImagenVoz] = React.useState(false);
  const [autorizaDatosPersonales, setAutorizaDatosPersonales] = React.useState(false);
  const [interesVisitaMedica, setInteresVisitaMedica] = React.useState<DatosCheckIn["interesVisitaMedica"]>("si");
  const [direccion, setDireccion] = React.useState("");
  const [pais, setPais] = React.useState("");
  const [estadoProvincia, setEstadoProvincia] = React.useState("");
  const [ciudad, setCiudad] = React.useState("");
  // Octubre 2026: errores por campo (los `<Select>` de Radix no soportan el
  // atributo nativo `required`, así que la validación de obligatorios es manual).
  const [errores, setErrores] = React.useState<Record<string, string>>({});
  const [tipoParticipacion, setTipoParticipacion] = React.useState<DatosCheckIn["tipoParticipacion"]>("evento");
  const [sesionId, setSesionId] = React.useState<string>(sesion.sesiones[0]?.id ?? "");

  const firmaRef = React.useRef<FirmaCanvasHandle>(null);
  const esMultisesion = sesion.modalidadSesiones === "Varias sesiones";

  /** Octubre 2026, pedido explícito: Tipo de documento, Especialidad, Celular, Correo, Dirección, País, Estado/Provincia/Departamento y Ciudad son obligatorios. */
  function calcularErrores(): Record<string, string> {
    const e: Record<string, string> = {};
    const vacio = (v: string) => !v.trim();
    if (vacio(tipoDocumento)) e.tipoDocumento = "Selecciona el tipo de documento.";
    if (profesion === "medico") {
      if (!especialidad) e.especialidad = "Selecciona la especialidad.";
      else if (especialidad === ESPECIALIDAD_OTRA && vacio(especialidadOtra)) e.especialidadOtra = "Indica cuál es la especialidad.";
    }
    if (vacio(celular)) e.celular = "El celular es obligatorio.";
    if (vacio(email)) e.email = "El correo electrónico es obligatorio.";
    else if (!esEmailValido(email)) e.email = "Escribe un correo electrónico válido.";
    if (vacio(direccion)) e.direccion = "La dirección es obligatoria.";
    if (vacio(pais)) e.pais = "Selecciona el país.";
    if (vacio(estadoProvincia)) e.estadoProvincia = "Selecciona el estado/provincia/departamento.";
    if (vacio(ciudad)) e.ciudad = "Selecciona la ciudad.";
    return e;
  }

  function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    const erroresCalculados = calcularErrores();
    setErrores(erroresCalculados);
    if (Object.keys(erroresCalculados).length > 0) {
      window.alert("Revisa los campos marcados con * antes de guardar.");
      return;
    }
    const firmaDataUrl = firmaRef.current?.obtenerDataUrl();
    if (!firmaDataUrl) {
      firmaRef.current?.limpiar();
      window.alert("Falta la firma del participante.");
      return;
    }
    onEnviar({
      nombres: aMayusculas(nombres.trim()),
      apellidos: aMayusculas(apellidos.trim()),
      cedula: aMayusculas(cedula.trim()),
      tipoDocumento,
      profesion,
      profesionDetalle: aMayusculas(profesionDetalle.trim()),
      especialidad: especialidad === ESPECIALIDAD_OTRA ? "" : especialidad,
      especialidadOtra: especialidad === ESPECIALIDAD_OTRA ? aMayusculas(especialidadOtra.trim()) : "",
      celular: celular.trim(),
      email: normalizarEmail(email),
      autorizaImagenVoz,
      autorizaDatosPersonales,
      firmaDataUrl,
      interesVisitaMedica,
      direccion: aMayusculas(direccion.trim()),
      pais,
      estadoProvincia,
      ciudad,
      tipoParticipacion,
      sesionId: esMultisesion ? sesionId || null : null,
    });
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-4 pb-24">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos del participante</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ci-nombres">Nombres *</Label>
            <InputMayuscula id="ci-nombres" required value={nombres} onChange={(e) => setNombres(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ci-apellidos">Apellidos *</Label>
            <InputMayuscula id="ci-apellidos" required value={apellidos} onChange={(e) => setApellidos(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ci-cedula">Número de documento *</Label>
            <InputMayuscula id="ci-cedula" required value={cedula} onChange={(e) => setCedula(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ci-tipo-documento">Tipo de documento *</Label>
            <Select value={tipoDocumento} onValueChange={setTipoDocumento}>
              <SelectTrigger id="ci-tipo-documento" aria-invalid={!!errores.tipoDocumento}><SelectValue placeholder="Selecciona el tipo de documento" /></SelectTrigger>
              <SelectContent>
                {Array.from(new Set([...(sesion.tiposDocumento.length > 0 ? sesion.tiposDocumento : ["Cédula"]), ...(tipoDocumento ? [tipoDocumento] : [])])).map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errores.tipoDocumento && <p className="text-xs text-destructive">{errores.tipoDocumento}</p>}
          </div>

          {esMultisesion && (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="ci-sesion">Sesión a la que corresponde este registro *</Label>
              <Select value={sesionId} onValueChange={setSesionId}>
                <SelectTrigger id="ci-sesion"><SelectValue placeholder="Selecciona una sesión" /></SelectTrigger>
                <SelectContent>
                  {sesion.sesiones.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {(s.fecha ? `${s.fecha} — ` : "") + (s.lugar || "sin lugar")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ci-profesion">Profesión *</Label>
            <Select value={profesion} onValueChange={(v) => setProfesion(v as DatosCheckIn["profesion"])}>
              <SelectTrigger id="ci-profesion"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROFESION_EJECUCION.map((p) => (
                  <SelectItem key={p} value={p}>{ETIQUETA_PROFESION[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {profesion === "no_medico" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ci-profesion-detalle">¿Cuál profesión?</Label>
              <InputMayuscula id="ci-profesion-detalle" value={profesionDetalle} onChange={(e) => setProfesionDetalle(e.target.value)} />
            </div>
          )}
          {profesion === "medico" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ci-especialidad">Especialidad *</Label>
                <Select value={especialidad} onValueChange={setEspecialidad}>
                  <SelectTrigger id="ci-especialidad" aria-invalid={!!errores.especialidad}><SelectValue placeholder="Selecciona una especialidad" /></SelectTrigger>
                  <SelectContent>
                    {sesion.especialidades.map((e) => (
                      <SelectItem key={e} value={e}>{e}</SelectItem>
                    ))}
                    <SelectItem value={ESPECIALIDAD_OTRA}>Otra</SelectItem>
                  </SelectContent>
                </Select>
                {errores.especialidad && <p className="text-xs text-destructive">{errores.especialidad}</p>}
              </div>
              {especialidad === ESPECIALIDAD_OTRA && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ci-especialidad-otra">¿Cuál especialidad? *</Label>
                  <InputMayuscula id="ci-especialidad-otra" value={especialidadOtra} onChange={(e) => setEspecialidadOtra(e.target.value)} />
                  {errores.especialidadOtra && <p className="text-xs text-destructive">{errores.especialidadOtra}</p>}
                </div>
              )}
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ci-celular">Celular *</Label>
            <Input id="ci-celular" type="tel" inputMode="tel" value={celular} onChange={(e) => setCelular(e.target.value)} aria-invalid={!!errores.celular} />
            {errores.celular && <p className="text-xs text-destructive">{errores.celular}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ci-email">Correo electrónico *</Label>
            <InputEmail id="ci-email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errores.email} />
            {errores.email && <p className="text-xs text-destructive">{errores.email}</p>}
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="ci-direccion">Dirección *</Label>
            <InputMayuscula id="ci-direccion" value={direccion} onChange={(e) => setDireccion(e.target.value)} aria-invalid={!!errores.direccion} />
            {errores.direccion && <p className="text-xs text-destructive">{errores.direccion}</p>}
          </div>
          {/* País → Estado/Provincia/Departamento → Ciudad: listas desplegables dependientes, las mismas de los demás formularios de BEATS. */}
          <SelectPaisEstadoCiudad
            idPrefix="ci"
            etiquetaPais="País *"
            etiquetaEstado="Estado/Provincia/Departamento *"
            etiquetaCiudad="Ciudad *"
            valorPais={pais}
            valorEstado={estadoProvincia}
            valorCiudad={ciudad}
            onChangePaisEstadoCiudad={(p, e, c) => {
              setPais(p);
              setEstadoProvincia(e);
              setCiudad(c);
            }}
            errorPais={errores.pais}
            errorEstado={errores.estadoProvincia}
            errorCiudad={errores.ciudad}
          />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ci-tipo-participacion">Tipo de participación *</Label>
            <Select value={tipoParticipacion} onValueChange={(v) => setTipoParticipacion(v as DatosCheckIn["tipoParticipacion"])}>
              <SelectTrigger id="ci-tipo-participacion"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPO_PARTICIPACION_EJECUCION.map((t) => (
                  <SelectItem key={t} value={t}>{ETIQUETA_PARTICIPACION[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ci-interes">Interés en visita médica *</Label>
            <Select value={interesVisitaMedica} onValueChange={(v) => setInteresVisitaMedica(v as DatosCheckIn["interesVisitaMedica"])}>
              <SelectTrigger id="ci-interes"><SelectValue /></SelectTrigger>
              <SelectContent>
                {INTERES_VISITA_MEDICA.map((i) => (
                  <SelectItem key={i} value={i}>{ETIQUETA_INTERES[i]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {sesion.declaracionTratamientoDatos && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tratamiento de datos personales</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="max-h-40 overflow-y-auto rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              {sesion.declaracionTratamientoDatos}
            </p>
            <label className="flex items-start gap-2 text-sm" htmlFor="ci-autoriza-datos">
              <Checkbox
                id="ci-autoriza-datos"
                checked={autorizaDatosPersonales}
                onCheckedChange={(v) => setAutorizaDatosPersonales(v === true)}
              />
              Autorizo el tratamiento de mis datos personales según lo descrito arriba.
            </label>
            <label className="flex items-start gap-2 text-sm" htmlFor="ci-autoriza-imagen">
              <Checkbox
                id="ci-autoriza-imagen"
                checked={autorizaImagenVoz}
                onCheckedChange={(v) => setAutorizaImagenVoz(v === true)}
              />
              Autorizo el uso de mi imagen y voz en fotografías/videos de este evento.
            </label>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <FirmaCanvas ref={firmaRef} etiqueta="Firma del participante" />
        </CardContent>
      </Card>

      <div className="fixed inset-x-0 bottom-0 flex gap-2 border-t bg-background p-4">
        <Button type="button" variant="outline" className="flex-1 h-11" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Button>
        <Button type="submit" className="flex-1 h-11 text-base" disabled={enviando}>
          {enviando ? "Guardando..." : "Guardar registro"}
        </Button>
      </div>
    </form>
  );
}
