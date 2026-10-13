import * as React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ToggleCapsula } from "@/components/ui/toggle-capsula";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion } from "@/components/ui/accordion";
import { SeccionAcordeon } from "@/components/forms/SeccionAcordeon";
import { Badge } from "@/components/ui/badge";
import { CamposPersonalizadosSeccion } from "@/components/CamposPersonalizadosSeccion";
import { CampoArchivo } from "@/components/archivos/CampoArchivo";
import { SelectPaisEstadoCiudad } from "@/components/SelectPaisEstadoCiudad";
import { useCatalogo } from "@/lib/catalogos";
import { camposAplicables, camposPorSeccion, type CampoPersonalizadoDefinicion } from "@/lib/camposPersonalizados";
import { etiquetaEfectiva, type EtiquetaCampo } from "@/lib/etiquetasCampo";
import { CRITERIO_FMV_KEY, RESPUESTA_CRITERIO, type CriterioFmvKey, type RespuestaCriterio } from "@/lib/enums";
import { calcularPuntajeTotal, calcularTier, type ConfiguracionFmv } from "@/lib/fmvConfig";
import { useSelectorConPrecargado, usePrecargaInicialOrigen } from "@/hooks/usePrecargado";
import { traerEventoPorId } from "@/lib/evento";
import { traerSpeakerPorId } from "@/lib/speakers";
import { type SpeakerResumen } from "@/lib/speakers";
import { SelectorHcpDelEvento } from "@/components/forms/SelectorHcpDelEvento";
import { precargarDesdeEventoParaFmv, precargarDesdeSpeakerParaFmv } from "@/lib/precargado";
import { traerFormatoOficialFmv, formatoOficialFmvVigente } from "@/lib/configuracionFormatos";
import { VisorArchivo } from "@/components/archivos/VisorArchivo";
import { FirmaManuscritaUsuario } from "@/components/archivos/FirmaManuscrita";
import type { OpcionEventoOrigen } from "@/lib/documentosRequeridosEvento";

export interface DatosFormularioFmv {
  eventoOrigenId: string;
  speakerId: string;
  region: string;
  pais: string;
  fecha: string;
  nombreCompleto: string;
  numeroDocumento: string;
  cvAdjunto: boolean;
  especialidad: string;
  especialidadOtro: string;
  licenciaNacional: string;
  direccionPrincipal: string;
  ciudad: string;
  estadoProvincia: string;
  codigoPostal: string;
  criterio1: RespuestaCriterio | null;
  criterio2: RespuestaCriterio | null;
  criterio3: RespuestaCriterio | null;
  criterio4: RespuestaCriterio | null;
  criterio5: RespuestaCriterio | null;
  criterio6: RespuestaCriterio | null;
  comentariosAdicionales: string;
  aplicaTarifarioAsociacion: boolean;
  archivoTarifarioAsociacionId: string | null;
  /** Ajuste de precisión (septiembre 2026), pedido explícito: obligatorio
   * solo cuando `aplicaTarifarioAsociacion` es `true`. */
  asociacionCientifica: string;
  medicalName: string;
  medicalRole: string;
  empresaGrupo: string;
  camposPersonalizados: Record<string, unknown>;
}

export function fmvVacio(empresaGrupo: string, pais: string, usuarioNombre: string, usuarioCargo: string): DatosFormularioFmv {
  return {
    eventoOrigenId: "",
    speakerId: "",
    region: "",
    pais,
    fecha: "",
    nombreCompleto: "",
    numeroDocumento: "",
    cvAdjunto: false,
    especialidad: "",
    especialidadOtro: "",
    licenciaNacional: "",
    direccionPrincipal: "",
    ciudad: "",
    estadoProvincia: "",
    codigoPostal: "",
    criterio1: null,
    criterio2: null,
    criterio3: null,
    criterio4: null,
    criterio5: null,
    criterio6: null,
    comentariosAdicionales: "",
    aplicaTarifarioAsociacion: false,
    archivoTarifarioAsociacionId: null,
    asociacionCientifica: "",
    medicalName: usuarioNombre,
    medicalRole: usuarioCargo,
    empresaGrupo,
    camposPersonalizados: {},
  };
}

const ETIQUETA_CAMPO: Record<string, string> = {
  eventoOrigenId: "Evento de origen",
  speakerId: "HCP del repositorio",
  region: "Región",
  pais: "País",
  fecha: "Fecha",
  numeroDocumento: "Número de documento",
  nombreCompleto: "Nombre completo del HCP",
  especialidad: "Especialidad",
  licenciaNacional: "Licencia nacional",
  direccionPrincipal: "Dirección principal",
  ciudad: "Ciudad",
  estadoProvincia: "Estado / Provincia",
  codigoPostal: "Código postal",
  medicalName: "Nombre de quien certifica",
  medicalRole: "Cargo de quien certifica",
  asociacionCientifica: "Asociación médica / científica",
};

export function calcularErroresFmv(datos: DatosFormularioFmv): Record<string, string> {
  const errores: Record<string, string> = {};
  const requerido = (clave: keyof DatosFormularioFmv) => {
    if (!String(datos[clave] ?? "").trim()) {
      errores[clave] = `${ETIQUETA_CAMPO[clave] ?? clave} es obligatorio.`;
    }
  };

  // AJUSTES (septiembre/octubre 2026), pedido explícito: "Evento de origen"
  // pasa a ser obligatorio en todos los formularios que lo tienen — antes
  // era opcional aquí (y en Convenio de Pago a HCP).
  requerido("eventoOrigenId");
  requerido("region");
  requerido("pais");
  requerido("speakerId");
  requerido("nombreCompleto");
  requerido("especialidad");
  if (datos.especialidad === "Otra") requerido("especialidadOtro");
  requerido("licenciaNacional");
  requerido("direccionPrincipal");
  requerido("ciudad");
  requerido("estadoProvincia");
  // AJUSTES (septiembre/octubre 2026), pedido explícito: "Fecha" y "Número
  // de documento" deben ser obligatorios; "Código postal" deja de serlo.
  requerido("fecha");
  requerido("numeroDocumento");
  requerido("medicalName");
  requerido("medicalRole");
  // Ajuste de precisión (septiembre 2026), pedido explícito: obligatorio
  // solo cuando aplica el tarifario de asociación médica.
  if (datos.aplicaTarifarioAsociacion) requerido("asociacionCientifica");

  for (const clave of CRITERIO_FMV_KEY) {
    if (!datos[clave]) {
      errores[clave] = "Responde este criterio antes de certificar.";
    }
  }

  return errores;
}

interface Props {
  valor: DatosFormularioFmv;
  onChange: (valor: DatosFormularioFmv) => void;
  errores: Record<string, string>;
  eventosDisponibles: OpcionEventoOrigen[];
  speakersDisponibles: SpeakerResumen[];
  /**
   * Octubre 2026, pedido explícito: "Seleccionar HCP del Repositorio de
   * HCPs/Speakers" solo ofrece a los speakers del evento a quienes TODAVÍA no
   * se les ha creado su FMV Checklist para ese evento. Se pasan los FMV ya
   * existentes (cualquier estado salvo Anulado) para excluirlos.
   */
  fmvsExistentes?: Array<{ id: string; eventoOrigenId: string | null; speakerId: string | null; estado: string }>;
  /** Id del FMV que se está editando (borrador): su propio speaker no se excluye. */
  documentoActualId?: string;
  configuracion: ConfiguracionFmv;
  camposPersonalizadosDefinidos: CampoPersonalizadoDefinicion[];
  etiquetasCampo: EtiquetaCampo[];
  empresaGrupo: string;
  pais: string;
  /** Firma manuscrita ya registrada del usuario en sesión (`Usuario.firmaId`) — ver `FirmaManuscritaUsuario`. */
  firmaUsuarioId?: string | null;
  soloLectura?: boolean;
  /** Ver `usePrecargaInicialOrigen` — viene de "Tareas Pendientes" cuando se abre este formulario para diligenciar una tarea concreta. */
  precargarEventoOrigenId?: string;
  precargarSpeakerId?: string;
}

export function FormularioFMV({
  valor,
  onChange,
  errores,
  eventosDisponibles,
  speakersDisponibles,
  fmvsExistentes = [],
  documentoActualId,
  configuracion,
  camposPersonalizadosDefinidos,
  etiquetasCampo,
  empresaGrupo,
  pais,
  firmaUsuarioId,
  precargarEventoOrigenId,
  precargarSpeakerId,
  soloLectura,
}: Props) {
  const { opciones: especialidades } = useCatalogo("especialidadesMedicas");
  const { opciones: regiones } = useCatalogo("regiones");
  // Octubre 2026: el aviso "todavía no hay un formato oficial FMV vigente" se
  // mostraba (a) mientras la consulta seguía en camino y (b) aunque hubiera uno
  // vigente registrado para "todas las empresas". Ahora hay un estado de carga
  // y `formatoOficialFmvVigente` ya acepta el formato global como respaldo.
  const [formatoFmv, setFormatoFmv] = React.useState<
    { estado: "cargando" } | { estado: "listo"; archivoId: string | null; vigenteDesde: string | null; empresa: string }
  >({ estado: "cargando" });

  React.useEffect(() => {
    let cancelado = false;
    setFormatoFmv({ estado: "cargando" });
    traerFormatoOficialFmv()
      .then((versiones) => {
        if (cancelado) return;
        const vigente = formatoOficialFmvVigente(versiones, empresaGrupo);
        setFormatoFmv({
          estado: "listo",
          archivoId: vigente?.archivoId ?? null,
          vigenteDesde: vigente?.vigenteDesde ?? null,
          empresa: vigente?.empresaGrupo ?? "",
        });
      })
      .catch(() => !cancelado && setFormatoFmv({ estado: "listo", archivoId: null, vigenteDesde: null, empresa: "" }));
    return () => {
      cancelado = true;
    };
  }, [empresaGrupo]);
  const formatoFmvId = formatoFmv.estado === "listo" ? formatoFmv.archivoId : null;

  function set<K extends keyof DatosFormularioFmv>(clave: K, v: DatosFormularioFmv[K]) {
    onChange({ ...valor, [clave]: v });
  }

  function setCampoPersonalizado(clave: string, v: unknown) {
    onChange({ ...valor, camposPersonalizados: { ...valor.camposPersonalizados, [clave]: v } });
  }

  // Fase 4 / entrega 6 de esta ronda: al elegir el evento de origen o el
  // speaker, precarga automáticamente los campos derivables de cada uno
  // (ver src/lib/precargado.ts) — no se pisan entre sí y el usuario los
  // puede seguir editando después.
  const alElegirOrigen = useSelectorConPrecargado(valor, onChange);
  function onCambiaEventoOrigen(id: string) {
    alElegirOrigen("eventoOrigenId", id, traerEventoPorId, precargarDesdeEventoParaFmv);
  }
  function onCambiaSpeaker(id: string) {
    alElegirOrigen("speakerId", id, traerSpeakerPorId, precargarDesdeSpeakerParaFmv);
  }
  usePrecargaInicialOrigen({
    eventoOrigenIdInicial: precargarEventoOrigenId,
    speakerIdInicial: precargarSpeakerId,
    eventoOrigenIdActual: valor.eventoOrigenId,
    speakerIdActual: valor.speakerId,
    onEventoOrigen: onCambiaEventoOrigen,
    onSpeaker: onCambiaSpeaker,
    speakerIdsDelEvento: eventosDisponibles.find((ev) => ev.id === valor.eventoOrigenId)?.speakerIds,
  });

  const etiqueta = (clave: string) =>
    etiquetaEfectiva(etiquetasCampo, "fmv", clave, empresaGrupo, ETIQUETA_CAMPO[clave] ?? clave);

  const aplicables = camposAplicables(camposPersonalizadosDefinidos, "fmv", empresaGrupo, pais);
  const porSeccion = camposPorSeccion(aplicables);
  const valoresParaCalculo = { ...valor, ...valor.camposPersonalizados };

  const respuestas: Record<CriterioFmvKey, RespuestaCriterio | null> = {
    criterio1: valor.criterio1,
    criterio2: valor.criterio2,
    criterio3: valor.criterio3,
    criterio4: valor.criterio4,
    criterio5: valor.criterio5,
    criterio6: valor.criterio6,
  };
  const puntaje = calcularPuntajeTotal(respuestas);
  const tier = calcularTier(puntaje, configuracion.umbralTier1, configuracion.umbralTier2);
  const variantePorTier = { "Tier 1": "approved", "Tier 2": "pending", "Tier 3": "rejected" } as const;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 rounded-md border border-blue-200 bg-blue-50 p-3">
        <p className="text-sm font-medium text-blue-900">Formato oficial FMV vigente de la compañía</p>
        <p className="text-xs text-blue-800">Solo como referencia/consulta.</p>
        <div>
          <VisorArchivo archivoId={formatoFmvId} etiqueta="Ver" size="sm" variant="outline" />
          {formatoFmv.estado === "cargando" && <p className="text-xs text-muted-foreground">Consultando el formato oficial vigente…</p>}
          {formatoFmv.estado === "listo" && formatoFmvId && formatoFmv.vigenteDesde && (
            <p className="text-xs text-muted-foreground">
              Vigente desde {formatoFmv.vigenteDesde} — {formatoFmv.empresa || "todas las empresas"}
            </p>
          )}
          {formatoFmv.estado === "listo" && !formatoFmvId && (
            <p className="text-xs text-muted-foreground">
              {formatoFmv.vigenteDesde
                ? "Hay un formato oficial FMV vigente registrado en Configuración de Campos, pero todavía no tiene un archivo adjunto."
                : "Todavía no hay un formato oficial FMV vigente cargado en Configuración de Campos."}
            </p>
          )}
        </div>
      </div>

    <Accordion type="multiple" defaultValue={["perfil", "criterios", "certificacion"]} className="flex flex-col gap-3">
      <SeccionAcordeon value="perfil" titulo="Perfil del HCP">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="fmv-evento-origen">Evento de origen (participación académica) *</Label>
            <Select value={valor.eventoOrigenId} onValueChange={onCambiaEventoOrigen} disabled={soloLectura}>
              <SelectTrigger id="fmv-evento-origen"><SelectValue placeholder="Selecciona un evento" /></SelectTrigger>
              <SelectContent>
                {eventosDisponibles.map((ev) => (
                  <SelectItem key={ev.id} value={ev.id}>{ev.etiqueta}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errores.eventoOrigenId && <p className="text-xs text-destructive">{errores.eventoOrigenId}</p>}
            <p className="text-xs text-muted-foreground">Al elegir el evento, se precargan país, ciudad y fecha — puedes corregirlos si hace falta.</p>
          </div>

          <SelectorHcpDelEvento
            id="fmv-speaker"
            valor={valor.speakerId}
            onChange={onCambiaSpeaker}
            onLimpiar={() => onChange({ ...valor, speakerId: "" })}
            eventoOrigenId={valor.eventoOrigenId}
            eventosDisponibles={eventosDisponibles}
            speakersDisponibles={speakersDisponibles}
            documentosExistentes={fmvsExistentes}
            documentoActualId={documentoActualId}
            nombreDocumento="FMV Checklist"
            ayuda="Al elegir el HCP, se precargan sus datos — puedes corregirlos si hace falta."
            error={errores.speakerId}
            disabled={soloLectura}
          />

          <Campo label={`${etiqueta("nombreCompleto")} *`} error={errores.nombreCompleto}>
            <Input value={valor.nombreCompleto} disabled={soloLectura} onChange={(e) => set("nombreCompleto", e.target.value)} />
          </Campo>
          <Campo label={`${etiqueta("numeroDocumento")} *`} error={errores.numeroDocumento}>
            <Input value={valor.numeroDocumento} disabled={soloLectura} onChange={(e) => set("numeroDocumento", e.target.value)} />
          </Campo>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fmv-region">{etiqueta("region")} *</Label>
            <Select value={valor.region} onValueChange={(v) => set("region", v)} disabled={soloLectura}>
              <SelectTrigger id="fmv-region"><SelectValue placeholder="Selecciona una región" /></SelectTrigger>
              <SelectContent>
                {regiones.map((op) => (
                  <SelectItem key={op} value={op}>{op}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errores.region && <p className="text-xs text-destructive">{errores.region}</p>}
          </div>
          <SelectPaisEstadoCiudad
            idPrefix="fmv"
            etiquetaPais={`${etiqueta("pais")} *`}
            etiquetaEstado={`${etiqueta("estadoProvincia")} *`}
            etiquetaCiudad={`${etiqueta("ciudad")} *`}
            valorPais={valor.pais}
            valorEstado={valor.estadoProvincia}
            valorCiudad={valor.ciudad}
            onChangePaisEstadoCiudad={(pais, estadoProvincia, ciudad) => onChange({ ...valor, pais, estadoProvincia, ciudad })}
            errorPais={errores.pais}
            errorEstado={errores.estadoProvincia}
            errorCiudad={errores.ciudad}
            disabled={soloLectura}
          />
          <Campo label={`${etiqueta("fecha")} *`} error={errores.fecha}>
            <Input type="date" value={valor.fecha} disabled={soloLectura} onChange={(e) => set("fecha", e.target.value)} />
          </Campo>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fmv-especialidad">{etiqueta("especialidad")} *</Label>
            <Select value={valor.especialidad} onValueChange={(v) => set("especialidad", v)} disabled={soloLectura}>
              <SelectTrigger id="fmv-especialidad"><SelectValue placeholder="Selecciona una especialidad" /></SelectTrigger>
              <SelectContent>
                {especialidades.map((op) => (
                  <SelectItem key={op} value={op}>{op}</SelectItem>
                ))}
                <SelectItem value="Otra">Otra</SelectItem>
              </SelectContent>
            </Select>
            {errores.especialidad && <p className="text-xs text-destructive">{errores.especialidad}</p>}
          </div>
          {valor.especialidad === "Otra" && (
            <Campo label="Especifique la especialidad *" error={errores.especialidadOtro}>
              <Input value={valor.especialidadOtro} disabled={soloLectura} onChange={(e) => set("especialidadOtro", e.target.value)} />
            </Campo>
          )}
          <Campo label={`${etiqueta("licenciaNacional")} *`} error={errores.licenciaNacional}>
            <Input value={valor.licenciaNacional} disabled={soloLectura} onChange={(e) => set("licenciaNacional", e.target.value)} />
          </Campo>

          <Campo label={`${etiqueta("direccionPrincipal")} *`} error={errores.direccionPrincipal}>
            <Input value={valor.direccionPrincipal} disabled={soloLectura} onChange={(e) => set("direccionPrincipal", e.target.value)} />
          </Campo>
          <Campo label={etiqueta("codigoPostal")} error={errores.codigoPostal}>
            <Input value={valor.codigoPostal} disabled={soloLectura} onChange={(e) => set("codigoPostal", e.target.value)} />
          </Campo>

          <div className="flex flex-col gap-1.5">
            <Label>Hoja de vida / CV adjunto</Label>
            <ToggleCapsula
              value={valor.cvAdjunto ? "si" : "no"}
              onValueChange={(v) => set("cvAdjunto", v === "si")}
              opciones={[
                { value: "no", label: "No" },
                { value: "si", label: "Sí" },
              ]}
              disabled={soloLectura}
            />
          </div>
        </div>
        {porSeccion.perfil && (
          <CamposPersonalizadosSeccion
            campos={porSeccion.perfil}
            valores={valor.camposPersonalizados}
            valoresParaCalculo={valoresParaCalculo}
            onChange={setCampoPersonalizado}
          />
        )}
      </SeccionAcordeon>

      <SeccionAcordeon
        value="criterios"
        titulo="Criterios de Fair Market Value"
        descripcion="Cada criterio suma puntos según la respuesta (A=3, B=2, C=1, D=0)."
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border-2 border-primary bg-primary/5 p-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Score total (calculado)</p>
              <p className="text-2xl font-bold tabular-nums text-foreground">{puntaje} <span className="text-base font-normal text-muted-foreground">/ 18</span></p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">HCP Overall Tier</p>
              <Badge variant={variantePorTier[tier]} className="text-base font-bold">{tier}</Badge>
            </div>
          </div>
          {configuracion.criterios.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Todavía no hay criterios configurados. Un administrador debe definirlos en Configuración de Campos.
            </p>
          )}
          {configuracion.criterios.map((criterioDef) => (
            <div key={criterioDef.clave} className="flex flex-col gap-1.5 border-b pb-3 last:border-0 last:pb-0">
              <Label htmlFor={`fmv-${criterioDef.clave}`}>
                {criterioDef.titulo} *
                <span className="ml-1 font-normal text-muted-foreground">— {criterioDef.pregunta}</span>
              </Label>
              <Select
                value={valor[criterioDef.clave] ?? undefined}
                onValueChange={(v) => set(criterioDef.clave, v as RespuestaCriterio)}
                disabled={soloLectura}
              >
                <SelectTrigger id={`fmv-${criterioDef.clave}`}><SelectValue placeholder="Selecciona una opción" /></SelectTrigger>
                <SelectContent>
                  {(criterioDef.opciones.length > 0
                    ? criterioDef.opciones
                    : RESPUESTA_CRITERIO.map((valorLetra) => ({ id: valorLetra, valor: valorLetra, texto: valorLetra }))
                  ).map((opcion) => (
                    <SelectItem key={opcion.id} value={opcion.valor}>
                      {opcion.valor} — {opcion.texto}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errores[criterioDef.clave] && <p className="text-xs text-destructive">{errores[criterioDef.clave]}</p>}
            </div>
          ))}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fmv-comentarios">Comentarios adicionales</Label>
            <Textarea id="fmv-comentarios" value={valor.comentariosAdicionales} disabled={soloLectura} onChange={(e) => set("comentariosAdicionales", e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Aplica tarifario de asociación médica / científica</Label>
            <ToggleCapsula
              value={valor.aplicaTarifarioAsociacion ? "si" : "no"}
              onValueChange={(v) => set("aplicaTarifarioAsociacion", v === "si")}
              opciones={[
                { value: "no", label: "No" },
                { value: "si", label: "Sí" },
              ]}
              disabled={soloLectura}
            />
          </div>
          {valor.aplicaTarifarioAsociacion && (
            <Campo label="Asociación médica / científica *" error={errores.asociacionCientifica}>
              <Input
                value={valor.asociacionCientifica}
                disabled={soloLectura}
                onChange={(e) => set("asociacionCientifica", e.target.value)}
              />
            </Campo>
          )}
          {valor.aplicaTarifarioAsociacion && (
            <CampoArchivo
              etiqueta="Tarifario de la asociación médica (archivo adjunto)"
              valor={valor.archivoTarifarioAsociacionId}
              onChange={(id) => set("archivoTarifarioAsociacionId", id)}
              aceptar="application/pdf,image/*"
              disabled={soloLectura}
              contexto={valor.nombreCompleto}
            />
          )}
        </div>
      </SeccionAcordeon>

      <SeccionAcordeon
        value="certificacion"
        titulo="Certificación"
        descripcion="Al enviar, este documento queda Completado directamente (sin cadena de aprobación)."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label={`${etiqueta("medicalName")} *`} error={errores.medicalName}>
            <Input value={valor.medicalName} disabled={soloLectura} onChange={(e) => set("medicalName", e.target.value)} />
          </Campo>
          <Campo label={`${etiqueta("medicalRole")} *`} error={errores.medicalRole}>
            <Input value={valor.medicalRole} disabled={soloLectura} onChange={(e) => set("medicalRole", e.target.value)} />
          </Campo>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Firma manuscrita</Label>
            <FirmaManuscritaUsuario firmaId={firmaUsuarioId} />
          </div>
        </div>
      </SeccionAcordeon>
    </Accordion>
    </div>
  );
}

function Campo({ label, error, children }: { label: string; error?: string; children: React.ReactElement }) {
  const id = React.useId();
  const hijo = React.isValidElement(children) ? React.cloneElement(children, { id } as never) : children;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {hijo}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export { ETIQUETA_CAMPO as ETIQUETA_CAMPO_FMV };
