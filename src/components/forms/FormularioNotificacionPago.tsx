import { useConfirmar } from "@/hooks/useConfirmar";
import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Accordion } from "@/components/ui/accordion";
import { SeccionAcordeon } from "@/components/forms/SeccionAcordeon";
import { Plus, Trash2 } from "lucide-react";
import { CamposPersonalizadosSeccion } from "@/components/CamposPersonalizadosSeccion";
import { VisorArchivo } from "@/components/archivos/VisorArchivo";
import { facturasParaNotificar, ordenarFacturas } from "@/lib/facturasNotificacionPago";
import { formatearMonto } from "@/lib/dinero";
import type { Evento, NotificacionPagoHcp, RegistroFinancieroEvento } from "@/types";
import { useCatalogo } from "@/lib/catalogos";
import { camposAplicables, camposPorSeccion, type CampoPersonalizadoDefinicion } from "@/lib/camposPersonalizados";
import { etiquetaEfectiva, type EtiquetaCampo } from "@/lib/etiquetasCampo";
import { useSelectorConPrecargado, usePrecargaInicialOrigen } from "@/hooks/usePrecargado";
import { traerEventoPorId } from "@/lib/evento";
import { traerConvenioPorEventoYSpeaker } from "@/lib/convenio";
import { traerSpeakerPorId } from "@/lib/speakers";
import { type SpeakerResumen } from "@/lib/speakers";
import {
  precargarDesdeEventoParaNotificacionPago,
  precargarProductosDesdeEventoParaNotificacionPago,
  precargarIdentificacionHcpParaNotificacionPago,
} from "@/lib/precargado";
import type { ProductoResumen } from "@/lib/productos";
import { FirmaManuscritaUsuario } from "@/components/archivos/FirmaManuscrita";
import { InputMoneda } from "@/components/ui/input-moneda";
import type { OpcionEventoOrigen } from "@/lib/documentosRequeridosEvento";
import { SelectorHcpDelEvento } from "@/components/forms/SelectorHcpDelEvento";

export interface DatosFormularioNotificacionPago {
  eventoOrigenId: string;
  /** Ya no tiene selector propio en el formulario — se resuelve solo, al elegir el HCP (ver `onCambiaSpeaker`). */
  convenioOrigenId: string;
  speakerId: string;
  nombreProfesionalSalud: string;
  /** Ronda de ajustes de formularios (septiembre 2026): campo nuevo — ver `db/agregar_numero_documento_identidad_notificacion_pago.sql`. */
  numeroDocumentoIdentidad: string;
  cedulaLicenciaProfesional: string;
  productos: string;
  facturaId: string | null;
  numeroFactura: string | null;
  fechaFactura: string | null;
  valorFactura: number | null;
  monedaFactura: string | null;
  facturaIncluyePagoHcp: boolean;
  facturaIncluyePagoInstitucion: boolean;
  facturaEsPagoTercero: boolean;
  medicalName: string;
  medicalRole: string;
  empresaGrupo: string;
  camposPersonalizados: Record<string, unknown>;
}

export function notificacionPagoVacia(empresaGrupo: string, usuarioNombre: string, usuarioCargo: string): DatosFormularioNotificacionPago {
  return {
    eventoOrigenId: "",
    convenioOrigenId: "",
    speakerId: "",
    nombreProfesionalSalud: "",
    numeroDocumentoIdentidad: "",
    cedulaLicenciaProfesional: "",
    productos: "",
    facturaId: null,
    numeroFactura: "",
    fechaFactura: "",
    valorFactura: null,
    monedaFactura: "",
    facturaIncluyePagoHcp: false,
    facturaIncluyePagoInstitucion: false,
    facturaEsPagoTercero: false,
    medicalName: usuarioNombre,
    medicalRole: usuarioCargo,
    empresaGrupo,
    camposPersonalizados: {},
  };
}

const ETIQUETA_CAMPO: Record<string, string> = {
  eventoOrigenId: "Evento de origen",
  empresaGrupo: "Empresa del grupo",
  nombreProfesionalSalud: "Nombre del profesional de la salud",
  numeroDocumentoIdentidad: "Número de documento de identidad",
  cedulaLicenciaProfesional: "Número de cédula profesional o licencia",
  productos: "Productos",
  numeroFactura: "Número de factura",
  fechaFactura: "Fecha de factura",
  valorFactura: "Valor de la factura",
  monedaFactura: "Moneda de la factura",
  medicalName: "Nombre de quien certifica",
  medicalRole: "Cargo de quien certifica",
};

export function calcularErroresNotificacionPago(datos: DatosFormularioNotificacionPago): Record<string, string> {
  const errores: Record<string, string> = {};
  const requerido = (clave: keyof DatosFormularioNotificacionPago) => {
    if (!String(datos[clave] ?? "").trim()) {
      errores[clave] = `${ETIQUETA_CAMPO[clave] ?? clave} es obligatorio.`;
    }
  };

  if (!datos.eventoOrigenId) errores.eventoOrigenId = "Selecciona el evento de origen.";
  requerido("empresaGrupo");
  if (!datos.speakerId) errores.speakerId = "Selecciona el HCP del repositorio.";
  requerido("nombreProfesionalSalud");
  requerido("numeroDocumentoIdentidad");
  requerido("cedulaLicenciaProfesional");
  requerido("productos");
  if (!datos.facturaId) errores.numeroFactura = "Selecciona una factura cargada en el Expediente del evento.";
  requerido("numeroFactura");
  requerido("fechaFactura");
  requerido("monedaFactura");
  requerido("medicalName");
  requerido("medicalRole");

  if (!datos.valorFactura || datos.valorFactura <= 0) {
    errores.valorFactura = "El valor de la factura debe ser mayor a cero.";
  }

  // A: "Favor marcar los recuadros aplicables — Regla: al menos uno debe
  // estar marcado" (pedido explícito de la especificación).
  if (!datos.facturaIncluyePagoHcp && !datos.facturaIncluyePagoInstitucion && !datos.facturaEsPagoTercero) {
    errores.facturaIncluyePagoHcp = "Marca al menos uno de los recuadros aplicables.";
  }

  return errores;
}

interface Props {
  valor: DatosFormularioNotificacionPago;
  onChange: (valor: DatosFormularioNotificacionPago) => void;
  errores: Record<string, string>;
  eventosDisponibles: OpcionEventoOrigen[];
  speakersDisponibles: SpeakerResumen[];
  /** Notificaciones de Pago ya creadas (las Anuladas/Rechazadas no cuentan): una factura ya notificada deja de ofrecerse. */
  documentosExistentes?: Pick<NotificacionPagoHcp, "id" | "eventoOrigenId" | "speakerId" | "estado" | "facturaId">[];
  /** Registros financieros del Expediente (facturas, OC, comprobantes) de todos los eventos. Octubre 2026: de aquí salen las facturas elegibles. */
  registrosFinancieros?: RegistroFinancieroEvento[];
  /** Id de la notificación que se está editando: su propio speaker no se excluye. */
  documentoActualId?: string;
  productosDisponibles: ProductoResumen[];
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

export function FormularioNotificacionPago({
  valor,
  onChange,
  errores,
  eventosDisponibles,
  speakersDisponibles,
  documentosExistentes = [],
  registrosFinancieros = [],
  documentoActualId,
  productosDisponibles,
  camposPersonalizadosDefinidos,
  etiquetasCampo,
  empresaGrupo,
  pais,
  firmaUsuarioId,
  soloLectura,
  precargarEventoOrigenId,
  precargarSpeakerId,
}: Props) {
  const { opciones: empresas } = useCatalogo("empresasGrupo");

  function set<K extends keyof DatosFormularioNotificacionPago>(clave: K, v: DatosFormularioNotificacionPago[K]) {
    onChange({ ...valor, [clave]: v });
  }

  function setCampoPersonalizado(clave: string, v: unknown) {
    onChange({ ...valor, camposPersonalizados: { ...valor.camposPersonalizados, [clave]: v } });
  }

  // Fase 4: al elegir el evento de origen, precarga automáticamente el
  // nombre del speaker que participó (mejor esfuerzo, antes de elegir un
  // HCP concreto abajo).
  //
  // Entrega 40 (octubre 2026) — CAUSA REAL de «no me carga los datos del HCP ni del evento» al abrir el formulario
  // desde «Tareas Pendientes» (y de que elegir el HCP a mano no siempre los trajera):
  //  1. Desde la tarea se elegían evento y HCP en el mismo instante; las dos escrituras partían del mismo `valor`
  //     viejo y la segunda borraba el evento, por lo que la respuesta de la consulta del evento se descartaba.
  //  2. `onCambiaSpeaker` leía `valor.eventoOrigenId` de su render: desde la tarea todavía estaba vacío, así que
  //     NUNCA se consultaba el Convenio de Pago (de ahí salían el nombre y el documento) y solo llegaba la cédula.
  //  3. Una sola consulta fallida (`Promise.all`) descartaba también las demás.
  // Ahora todo se escribe sobre el valor MÁS RECIENTE (`aplicar`), el evento se pasa explícito, cada fuente es
  // independiente y, si falta el convenio, el nombre y el documento salen de la ficha del speaker.
  const alElegirOrigen = useSelectorConPrecargado(valor, onChange);
  const { aplicar, valorRef: valorActual } = alElegirOrigen;
  // Productos del evento elegido: se precargan en cuanto el portafolio de productos está disponible (llega aparte).
  const [productosDelEvento, setProductosDelEvento] = React.useState<{ eventoId: string; productosEvento: Evento["productosEvento"] } | null>(null);
  const productosAplicadosDe = React.useRef("");
  function onCambiaEventoOrigen(id: string) {
    alElegirOrigen("eventoOrigenId", id, traerEventoPorId, (evento) => {
      const { nombreProfesionalSalud, ...resto } = precargarDesdeEventoParaNotificacionPago(evento);
      setProductosDelEvento({ eventoId: id, productosEvento: evento.productosEvento });
      return {
        ...resto,
        // El nombre exacto del HCP ya elegido manda sobre el «mejor esfuerzo» del evento.
        ...(valorActual.current.speakerId ? {} : { nombreProfesionalSalud }),
      };
    });
  }
  React.useEffect(() => {
    if (soloLectura || !productosDelEvento || productosDisponibles.length === 0) return;
    if (productosAplicadosDe.current === productosDelEvento.eventoId) return;
    if (valorActual.current.eventoOrigenId !== productosDelEvento.eventoId) return;
    productosAplicadosDe.current = productosDelEvento.eventoId;
    const texto = precargarProductosDesdeEventoParaNotificacionPago(productosDelEvento, productosDisponibles.map((p) => p.nombre));
    if (texto) aplicar({ productos: texto });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productosDelEvento, productosDisponibles]);

  // Ronda de ajustes de formularios (septiembre 2026): al elegir el HCP del
  // Repositorio de Speakers (mismo patrón que CAF, entrega 7) se resuelve
  // el Convenio de Pago a HCP del mismo evento+speaker — "Evento de
  // origen" ya solo lista eventos con Convenio (y FMV) vinculados, así que
  // debería existir siempre — y se precargan sus datos; el speaker es
  // respaldo si el Convenio no trajera algún campo.
  function onCambiaSpeaker(speakerId: string, eventoIndicado?: string) {
    const eventoId = eventoIndicado || valorActual.current.eventoOrigenId;
    aplicar({ speakerId });
    Promise.all([
      eventoId ? traerConvenioPorEventoYSpeaker(eventoId, speakerId).catch(() => null) : Promise.resolve(null),
      traerSpeakerPorId(speakerId).catch(() => null),
    ]).then(([convenio, speaker]) => {
      // Eligió otro HCP mientras tanto: esta respuesta llegó tarde.
      if (valorActual.current.speakerId !== speakerId) return;
      // Octubre 2026: la moneda de la factura sale de la factura elegida del Expediente, no del convenio.
      // Noviembre 2026 (pedido explícito): la cédula / licencia sale SIEMPRE de «Licencia RETHUS / Cédula profesional» del speaker.
      const cambios = precargarIdentificacionHcpParaNotificacionPago(convenio, speaker);
      if (cambios) aplicar(cambios);
    });
  }
  usePrecargaInicialOrigen({
    eventoOrigenIdInicial: precargarEventoOrigenId,
    speakerIdInicial: precargarSpeakerId,
    eventoOrigenIdActual: valor.eventoOrigenId,
    speakerIdActual: valor.speakerId,
    onEventoOrigen: onCambiaEventoOrigen,
    onSpeaker: onCambiaSpeaker,
  });

  // --- Facturas del Expediente (octubre 2026, entrega 25) ---------------------
  // Solo se ofrecen eventos/speakers con al menos una factura cargada y sin
  // notificar; el número de factura se elige de la lista del speaker+evento.
  const eventosConFactura = React.useMemo(
    () =>
      eventosDisponibles
        .map((ev) => ({
          ...ev,
          speakerIds: ev.speakerIds.filter(
            (sid) =>
              (ev.id === valor.eventoOrigenId && sid === valor.speakerId) ||
              facturasParaNotificar({ registros: registrosFinancieros, notificaciones: documentosExistentes, eventoId: ev.id, speakerId: sid, documentoActualId }).length > 0,
          ),
        }))
        .filter((ev) => ev.speakerIds.length > 0),
    [eventosDisponibles, registrosFinancieros, documentosExistentes, documentoActualId, valor.eventoOrigenId, valor.speakerId],
  );
  const facturasDisponibles = React.useMemo(
    () =>
      valor.eventoOrigenId && valor.speakerId
        ? ordenarFacturas(
            facturasParaNotificar({
              registros: registrosFinancieros,
              notificaciones: documentosExistentes,
              eventoId: valor.eventoOrigenId,
              speakerId: valor.speakerId,
              documentoActualId,
            }),
          )
        : [],
    [registrosFinancieros, documentosExistentes, documentoActualId, valor.eventoOrigenId, valor.speakerId],
  );
  const facturaSeleccionada = facturasDisponibles.find((f) => f.archivoId === valor.facturaId || f.id === valor.facturaId) ?? null;
  const eventoActual = eventosDisponibles.find((ev) => ev.id === valor.eventoOrigenId);

  function etiquetaFactura(f: RegistroFinancieroEvento): string {
    const sesion = f.sesionId ? eventoActual?.sesiones?.find((se) => se.id === f.sesionId)?.etiqueta : undefined;
    return [f.numero || "(sin número)", f.fecha, formatearMonto(f.valor, f.moneda), sesion].filter(Boolean).join(" — ");
  }

  function aplicarFactura(f: RegistroFinancieroEvento) {
    aplicar({
      facturaId: f.archivoId,
      numeroFactura: f.numero,
      fechaFactura: f.fecha ?? "",
      valorFactura: f.valor,
      monedaFactura: f.moneda,
    });
  }

  function elegirFactura(registroId: string) {
    const f = facturasDisponibles.find((x) => x.id === registroId);
    if (f) aplicarFactura(f);
  }

  // Al cambiar de evento o de HCP, la factura elegida deja de ser válida: se limpia.
  const claveOrigen = `${valor.eventoOrigenId}::${valor.speakerId}`;
  const claveOrigenAnterior = React.useRef(claveOrigen);
  React.useEffect(() => {
    if (claveOrigenAnterior.current === claveOrigen) return;
    claveOrigenAnterior.current = claveOrigen;
    if (soloLectura) return;
    if (valor.facturaId || valor.numeroFactura) {
      aplicar({ facturaId: null, numeroFactura: "", fechaFactura: "", valorFactura: null, monedaFactura: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveOrigen]);

  // Entrega 40: si el evento + HCP tienen UNA sola factura sin notificar (el caso típico de la tarea
  // «Falta Notificación de Pago»), se elige sola y con ella se cargan fecha, valor y moneda.
  React.useEffect(() => {
    if (soloLectura || valor.facturaId || valor.numeroFactura) return;
    if (!valor.eventoOrigenId || !valor.speakerId || facturasDisponibles.length !== 1) return;
    aplicarFactura(facturasDisponibles[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facturasDisponibles, valor.eventoOrigenId, valor.speakerId, valor.facturaId, valor.numeroFactura]);

  // Ronda de ajustes de formularios (septiembre 2026): "Producto(s)" pasa
  // de texto libre a una lista de selects desde el Portafolio de
  // Productos, con "+ Agregar producto" y un botón de eliminar por fila —
  // pedido explícito. Se sigue guardando como el mismo campo de texto
  // `productos` (sin migración nueva) — una lista de nombres separados por
  // coma, igual que se mostraba antes.
  //
  // Entrega 36 — corrección: «Agregar producto» no hacía nada. La lista se derivaba SOLO del texto guardado
  // (`valor.productos.split(", ").filter(Boolean)`), así que una fila recién agregada (aún sin producto elegido, es
  // decir "") se descartaba al instante y el desplegable nunca aparecía; sin él era imposible cumplir el campo
  // obligatorio. Ahora las filas (incluidas las vacías) viven en un estado local y solo los productos ya elegidos
  // se escriben en `productos`. Si el valor cambia desde fuera (precarga, nueva notificación) las filas se reconstruyen.
  const filasDesdeTexto = (texto: string): string[] => {
    const lista = texto ? texto.split(", ").filter(Boolean) : [];
    return lista.length === 0 && !soloLectura ? [""] : lista;
  };
  const [listaProductos, setListaProductos] = React.useState<string[]>(() => filasDesdeTexto(valor.productos));
  const ultimoProductosEmitido = React.useRef(valor.productos);
  React.useEffect(() => {
    if (valor.productos !== ultimoProductosEmitido.current) {
      ultimoProductosEmitido.current = valor.productos;
      setListaProductos(filasDesdeTexto(valor.productos));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor.productos]);
  function actualizarProductos(siguiente: string[]) {
    setListaProductos(siguiente);
    const texto = siguiente.filter(Boolean).join(", ");
    ultimoProductosEmitido.current = texto;
    set("productos", texto);
  }
  function agregarProducto() {
    actualizarProductos([...listaProductos, ""]);
  }
  function cambiarProducto(indice: number, nombre: string) {
    actualizarProductos(listaProductos.map((p, i) => (i === indice ? nombre : p)));
  }
  const confirmar = useConfirmar();
  async function eliminarProducto(indice: number) {
    // Una fila todavía sin producto elegido se quita sin preguntar.
    if (listaProductos[indice] && !(await confirmar({ titulo: "Quitar producto", mensaje: "¿Quitar este producto de la notificación?" }))) return;
    actualizarProductos(listaProductos.filter((_, i) => i !== indice));
  }

  const etiqueta = (clave: string) =>
    etiquetaEfectiva(etiquetasCampo, "notificacionPago", clave, empresaGrupo, ETIQUETA_CAMPO[clave] ?? clave);

  const aplicables = camposAplicables(camposPersonalizadosDefinidos, "notificacionPago", empresaGrupo, pais);
  const porSeccion = camposPorSeccion(aplicables);
  const valoresParaCalculo = { ...valor, ...valor.camposPersonalizados };

  return (
    <div className="flex flex-col gap-6">
    <Accordion type="multiple" defaultValue={["identificacion", "factura", "certificacion"]} className="flex flex-col gap-3">
      <SeccionAcordeon value="identificacion" titulo="Identificación del HCP">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notif-evento-origen">{etiqueta("eventoOrigenId")} *</Label>
            <Select value={valor.eventoOrigenId} onValueChange={onCambiaEventoOrigen} disabled={soloLectura}>
              <SelectTrigger id="notif-evento-origen"><SelectValue placeholder="Selecciona un evento" /></SelectTrigger>
              <SelectContent>
                {eventosConFactura.map((ev) => (
                  <SelectItem key={ev.id} value={ev.id}>{ev.etiqueta}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errores.eventoOrigenId && <p className="text-xs text-destructive">{errores.eventoOrigenId}</p>}
            <p className="text-xs text-muted-foreground">Solo se listan eventos con FMV Checklist y Convenio de Pago a HCP vinculados y con al menos una factura cargada en el Expediente que aún no tenga Notificación de Pago.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notif-empresa">{etiqueta("empresaGrupo")} *</Label>
            <Select value={valor.empresaGrupo} onValueChange={(v) => set("empresaGrupo", v)} disabled={soloLectura}>
              <SelectTrigger id="notif-empresa"><SelectValue placeholder="Selecciona la empresa" /></SelectTrigger>
              <SelectContent>
                {empresas.map((op) => (
                  <SelectItem key={op} value={op}>{op}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errores.empresaGrupo && <p className="text-xs text-destructive">{errores.empresaGrupo}</p>}
          </div>
          <SelectorHcpDelEvento
            id="notif-speaker"
            valor={valor.speakerId}
            onChange={onCambiaSpeaker}
            onLimpiar={() =>
              aplicar({ speakerId: "", convenioOrigenId: "", nombreProfesionalSalud: "", numeroDocumentoIdentidad: "", cedulaLicenciaProfesional: "" })
            }
            eventoOrigenId={valor.eventoOrigenId}
            eventosDisponibles={eventosConFactura}
            speakersDisponibles={speakersDisponibles}
            nombreDocumento="Notificación de Pago"
            ayuda="Solo se ofrecen los speakers del evento con al menos una factura cargada en el Expediente sin notificar. Al elegir el HCP se precargan sus datos desde el Convenio de Pago y la ficha del speaker."
            avisoExtra={
              !soloLectura && valor.speakerId ? (
                <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => onCambiaSpeaker(valor.speakerId)}>
                  Volver a cargar los datos del HCP
                </Button>
              ) : null
            }
            error={errores.speakerId}
            disabled={soloLectura}
          />
          <Campo label={`${etiqueta("nombreProfesionalSalud")} *`} error={errores.nombreProfesionalSalud}>
            <Input value={valor.nombreProfesionalSalud} disabled={soloLectura} onChange={(e) => set("nombreProfesionalSalud", e.target.value)} />
          </Campo>
          <Campo label={`${etiqueta("numeroDocumentoIdentidad")} *`} error={errores.numeroDocumentoIdentidad}>
            <Input value={valor.numeroDocumentoIdentidad} disabled={soloLectura} onChange={(e) => set("numeroDocumentoIdentidad", e.target.value)} />
          </Campo>
          <Campo label={`${etiqueta("cedulaLicenciaProfesional")} *`} error={errores.cedulaLicenciaProfesional}>
            <Input value={valor.cedulaLicenciaProfesional} disabled={soloLectura} onChange={(e) => set("cedulaLicenciaProfesional", e.target.value)} />
            {!soloLectura && <p className="text-xs text-muted-foreground">Se carga del campo «Licencia RETHUS / Cédula profesional» del speaker elegido.</p>}
          </Campo>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>{etiqueta("productos")}</Label>
            <div className="flex flex-col gap-2">
              {listaProductos.map((nombre, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select value={nombre} onValueChange={(v) => cambiarProducto(i, v)} disabled={soloLectura}>
                    <SelectTrigger id={`notif-producto-${i}`} className="flex-1"><SelectValue placeholder={`Producto ${i + 1}`} /></SelectTrigger>
                    <SelectContent>
                      {productosDisponibles.map((p) => (
                        <SelectItem key={p.id} value={p.nombre}>{p.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" size="icon" variant="ghost" disabled={soloLectura} onClick={() => eliminarProducto(i)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {!soloLectura && (
                <Button type="button" size="sm" variant="outline" className="self-start" onClick={agregarProducto}>
                  <Plus className="h-3.5 w-3.5" /> Agregar producto
                </Button>
              )}
            </div>
            {errores.productos && <p className="text-xs text-destructive">{errores.productos}</p>}
          </div>
        </div>
        {porSeccion.identificacion && (
          <CamposPersonalizadosSeccion
            campos={porSeccion.identificacion}
            valores={valor.camposPersonalizados}
            valoresParaCalculo={valoresParaCalculo}
            onChange={setCampoPersonalizado}
          />
        )}
      </SeccionAcordeon>

      <SeccionAcordeon value="factura" titulo="Factura">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="notif-numero-factura">{etiqueta("numeroFactura")} *</Label>
            <div className="flex items-center gap-2">
              <Select value={facturaSeleccionada?.id ?? ""} onValueChange={elegirFactura} disabled={soloLectura || facturasDisponibles.length === 0}>
                <SelectTrigger id="notif-numero-factura" className="flex-1">
                  <SelectValue
                    placeholder={
                      !valor.eventoOrigenId || !valor.speakerId
                        ? "Primero elige el evento y el HCP"
                        : facturasDisponibles.length === 0
                          ? "No hay facturas cargadas sin notificar"
                          : "Selecciona una factura"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {facturasDisponibles.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{etiquetaFactura(f)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Reemplaza al antiguo campo «Factura (archivo adjunto)»: la factura ya está en el expediente. */}
              {valor.facturaId ? (
                <VisorArchivo archivoId={valor.facturaId} etiqueta="Ver factura" size="default" variant="outline" />
              ) : (
                <Button type="button" variant="outline" disabled title="Selecciona una factura para poder verla">
                  Ver factura
                </Button>
              )}
            </div>
            {errores.numeroFactura && <p className="text-xs text-destructive">{errores.numeroFactura}</p>}
            <p className="text-xs text-muted-foreground">
              Las facturas provienen del Expediente del evento (pestaña Speakers). La fecha, el valor y la moneda se cargan automáticamente al elegirla.
            </p>
          </div>
          <Campo label={`${etiqueta("fechaFactura")} *`} error={errores.fechaFactura}>
            <Input type="date" value={valor.fechaFactura ?? ""} disabled readOnly />
          </Campo>
          <Campo label={`${etiqueta("valorFactura")} *`} error={errores.valorFactura}>
            <InputMoneda value={valor.valorFactura} moneda={valor.monedaFactura ?? ""} disabled onChange={() => {}} />
          </Campo>
          <Campo label={`${etiqueta("monedaFactura")} *`} error={errores.monedaFactura}>
            <Input value={valor.monedaFactura ?? ""} disabled readOnly />
          </Campo>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Favor marcar los recuadros aplicables (al menos uno debe estar marcado)
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="notipago-incluye-pago-hcp"
              checked={valor.facturaIncluyePagoHcp}
              disabled={soloLectura}
              onCheckedChange={(v) => set("facturaIncluyePagoHcp", v === true)}
            />
            <Label htmlFor="notipago-incluye-pago-hcp">La factura incluye pago al HCP</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="notipago-incluye-pago-institucion"
              checked={valor.facturaIncluyePagoInstitucion}
              disabled={soloLectura}
              onCheckedChange={(v) => set("facturaIncluyePagoInstitucion", v === true)}
            />
            <Label htmlFor="notipago-incluye-pago-institucion">La factura incluye pago a la institución</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="notipago-pago-tercero"
              checked={valor.facturaEsPagoTercero}
              disabled={soloLectura}
              onCheckedChange={(v) => set("facturaEsPagoTercero", v === true)}
            />
            <Label htmlFor="notipago-pago-tercero">El pago lo realiza un tercero</Label>
          </div>
          {errores.facturaIncluyePagoHcp && <p className="text-xs text-destructive sm:col-span-2">{errores.facturaIncluyePagoHcp}</p>}
        </div>
        {porSeccion.factura && (
          <CamposPersonalizadosSeccion
            campos={porSeccion.factura}
            valores={valor.camposPersonalizados}
            valoresParaCalculo={valoresParaCalculo}
            onChange={setCampoPersonalizado}
          />
        )}
      </SeccionAcordeon>

      <SeccionAcordeon
        value="certificacion"
        titulo="Certificación"
        descripcion="Al enviar, este documento queda Completado directamente (sin cadena de aprobación)."
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-md border bg-muted/40 p-3 text-sm text-justify leading-relaxed">
            Al someter este formato, confirmo que he revisado esta factura y que concuerda con los términos del
            Convenio de Pago relacionado al mismo y que se han prestado todos los servicios.
          </div>
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
        </div>
      </SeccionAcordeon>
    </Accordion>
    </div>
  );
}

function Campo({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  const id = React.useId();
  // Corrección (formateo de montos, septiembre 2026): ver comentario
  // equivalente en FormularioEvento.tsx — `Campo` ahora acepta más de un
  // hijo (Input + `<p>` de monto formateado); solo el primer elemento
  // válido recibe el `id`.
  let idAsignado = false;
  const hijos = React.Children.map(children, (hijo) => {
    if (!idAsignado && React.isValidElement(hijo)) {
      idAsignado = true;
      return React.cloneElement(hijo, { id } as never);
    }
    return hijo;
  });
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {hijos}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export { ETIQUETA_CAMPO as ETIQUETA_CAMPO_NOTIFICACION_PAGO };
