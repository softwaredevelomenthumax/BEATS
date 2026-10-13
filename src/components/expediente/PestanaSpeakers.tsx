import * as React from "react";
import { toast } from "sonner";
import { Building2, ChevronDown, ExternalLink, FileSignature, Send } from "lucide-react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CampoArchivo } from "@/components/archivos/CampoArchivo";
import { EnviarDocumentoDialog } from "@/components/EnviarDocumentoDialog";
import { useAbrirDocumentoGenerico } from "@/hooks/useAbrirDocumentoGenerico";
import { useAuth } from "@/hooks/useAuth";
import { useCatalogo } from "@/lib/catalogos";
import { guardarArchivoFirmadoConvenioHCP, marcarArchivoEnviadoHCP } from "@/lib/convenioHCP";
import { documentosPorSpeaker } from "@/lib/documentosRequeridosEvento";
import { formatearFechaHora } from "@/lib/fecha";
import { speakersExternosDe } from "@/lib/speakersEvento";
import {
  ETIQUETA_ETAPA_CONVENIO_HCP,
  convenioDelSpeaker,
  documentoRepoResuelto,
  etapaConvenioHcp,
  filasFinancierasDelSpeaker,
  filasRepoDelSpeaker,
  gruposSpeakers,
  modalidadFacturaSpeaker,
  sesionesDelSpeaker,
  conciliar,
  type GrupoSpeakerExpediente,
} from "@/lib/expediente";
import { formatearMonto } from "@/lib/dinero";
import {
  estadoFacturas,
  facturasCubiertas,
  facturasPendientesDePago,
  facturasSinNotificacion,
  notificacionDeFactura,
  situacionComprobantes,
  validarNuevaFactura,
  validarNuevoComprobante,
} from "@/lib/facturacionSpeaker";
import { AnotacionesPago } from "@/components/pagos/AnotacionesPago";
import { anotacionesDelSpeaker } from "@/lib/anotacionesPago";
import { ArchivoOpcionalConNoAplica, AvatarSpeaker, BloqueExpediente, EstadoChip, FormRegistroFinanciero, ListaRegistrosFinancieros, useFotosSpeakers } from "./piezas";
import type { DatosExpedienteCargados } from "./useExpediente";
import { useAccionesExpediente } from "./useAccionesExpediente";
import type { Evento } from "@/types";

interface Props {
  evento: Evento;
  datos: DatosExpedienteCargados;
  recargar: (silencioso?: boolean) => Promise<void>;
}

/**
 * Pestaña "Speakers": un bloque por cada speaker externo con TODO lo que el
 * proceso exige por speaker — orden de compra, convenio (con envío al HCP y
 * carga de la versión firmada), CAF, presentación aprobada y su evidencia,
 * facturas (según la modalidad) y comprobantes de pago.
 */
export function PestanaSpeakers({ evento, datos, recargar }: Props) {
  const grupos = gruposSpeakers(evento);
  const fotos = useFotosSpeakers(grupos.map((g) => g.speakerId).filter((x): x is string => !!x));
  const acciones = useAccionesExpediente(evento.id, recargar);

  if (grupos.length === 0) {
    // Sin speaker externo: solo presentación y evidencia (si hay participación académica), a nivel del evento.
    if (!evento.participacionAcademica) {
      return <p className="text-sm text-muted-foreground">Este evento no tiene participación académica con speaker externo — no hay documentos por speaker.</p>;
    }
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">Speaker interno: no aplican orden de compra, convenio, CAF ni facturas. Solo la presentación y su aprobación.</p>
        <BloqueSpeaker evento={evento} fotoUrl={undefined} grupo={{ sp: null, nombre: "Evento", speakerId: null }} datos={datos} recargar={recargar} acciones={acciones} soloPresentacion />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {grupos.map((g) => (
        <BloqueSpeaker key={g.sp?.id ?? g.nombre} fotoUrl={g.speakerId ? fotos.get(g.speakerId) : undefined} evento={evento} grupo={g} datos={datos} recargar={recargar} acciones={acciones} />
      ))}
    </div>
  );
}

function BloqueSpeaker({
  evento,
  grupo,
  datos,
  recargar,
  acciones,
  soloPresentacion,
  fotoUrl,
}: Props & { grupo: GrupoSpeakerExpediente; acciones: ReturnType<typeof useAccionesExpediente>; soloPresentacion?: boolean; fotoUrl?: string }) {
  const { usuario } = useAuth();
  const { abrir } = useAbrirDocumentoGenerico();
  const { opciones: monedas } = useCatalogo("monedas");
  const { sp, nombre, speakerId } = grupo;
  const [mostrarEnvio, setMostrarEnvio] = React.useState(false);

  const totalSpeakers = speakersExternosDe(evento).length;
  const contexto = `${evento.nombreEvento} ${nombre}`;
  const docs = sp ? documentosPorSpeaker(evento, datos.convenios, datos.fmvs, datos.cafs, datos.conveniosHcp).find((d) => d.speaker.id === sp.id) : undefined;

  const pres = filasRepoDelSpeaker(datos.archivos, "presentacionAprobada", speakerId);
  const evid = filasRepoDelSpeaker(datos.archivos, "evidenciaAprobacionPresentacion", speakerId);
  const presOk = documentoRepoResuelto(pres);
  const evidOk = documentoRepoResuelto(evid);

  const avatar = <AvatarSpeaker nombre={nombre} fotoUrl={fotoUrl} className="size-8" />;
  const cabecera = (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-accent/40 px-3.5 py-2.5">
      <span className="flex items-center gap-2.5 text-sm font-semibold">{avatar} {nombre}</span>
    </div>
  );
  /** Cabecera del speaker como disparador del acordeón de todo su bloque. */
  const cabeceraAcordeon = (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger className="group flex flex-1 items-center justify-between gap-2 rounded-lg bg-accent/40 px-3.5 py-2.5 text-left">
        <span className="flex items-center gap-2.5 text-sm font-semibold">{avatar} {nombre}</span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );

  const bloquePresentacion = (
    <BloqueExpediente
      titulo="Presentación aprobada y evidencia de aprobación"
      estado={<EstadoChip hecho={presOk.hecho && evidOk.hecho} />}
      testId={`exp-presentacion-${nombre}`}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ArchivoOpcionalConNoAplica
          etiqueta="Presentación aprobada"
          nombreTipo="Presentacion aprobada"
          contexto={contexto}
          filas={pres}
          textoNoAplica="No aplica presentación"
          onCargar={(archivoId) => acciones.cargarArchivoUnico({ categoria: "presentacionAprobada", archivoId, speakerId })}
          onNoAplica={(motivo) => acciones.declararNoAplica({ categoria: "presentacionAprobada", motivo, speakerId })}
          onQuitar={acciones.quitarArchivo}
          testId={`exp-pres-${nombre}`}
        />
        <ArchivoOpcionalConNoAplica
          etiqueta="Evidencia de aprobación de la presentación"
          nombreTipo="Evidencia aprobacion presentacion"
          contexto={contexto}
          filas={evid}
          textoNoAplica="No aplica aprobación"
          onCargar={(archivoId) => acciones.cargarArchivoUnico({ categoria: "evidenciaAprobacionPresentacion", archivoId, speakerId })}
          onNoAplica={(motivo) => acciones.declararNoAplica({ categoria: "evidenciaAprobacionPresentacion", motivo, speakerId })}
          onQuitar={acciones.quitarArchivo}
          testId={`exp-evid-${nombre}`}
        />
      </div>
    </BloqueExpediente>
  );

  if (soloPresentacion) {
    return <div className="flex flex-col gap-3">{cabecera}{bloquePresentacion}</div>;
  }

  // --- Orden de compra ---
  const oc = filasFinancierasDelSpeaker(datos.financieros, "ordenCompra", speakerId);
  // --- Convenio HCP ---
  const convenio = sp ? convenioDelSpeaker(datos.conveniosResumen, sp, totalSpeakers) : datos.conveniosResumen[0] ?? null;
  const etapa = etapaConvenioHcp(convenio);
  const convenioCompleto = convenio ? datos.conveniosHcp.find((c) => c.id === convenio.id) : undefined;
  // Entrega 32: convenio elaborado en el aplicativo corporativo de contratos (mismo criterio que el CAF corporativo).
  const convenioCorporativo = Boolean(convenio?.elaboradoEnContratosCorporativo);
  const puedeEnviar = usuario?.rol === "medica" && (etapa === "pendiente_envio" || etapa === "enviado");

  async function guardarFirmado(archivoId: string | null): Promise<boolean> {
    if (!convenio) return false;
    try {
      await guardarArchivoFirmadoConvenioHCP(convenio.id, archivoId);
      toast.success(archivoId ? "Versión firmada registrada como definitiva." : "Se quitó la versión firmada.");
      await recargar(true);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar la versión firmada.");
      return false;
    }
  }

  async function alEnviadoAlHcp() {
    if (!convenio) return;
    try {
      await marcarArchivoEnviadoHCP(convenio.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "El correo se envió, pero no se pudo registrar la fecha de envío.");
    }
    await recargar(true);
  }

  // --- CAF ---
  const cafDoc = docs?.caf ?? null;
  const cafCopias = filasRepoDelSpeaker(datos.archivos, "caf", speakerId).filter((f) => f.archivoId);
  const cafCopia = cafCopias[0] ?? null;

  // --- Facturas ---
  const facturas = filasFinancierasDelSpeaker(datos.financieros, "facturas", speakerId);
  const comprobantes = filasFinancierasDelSpeaker(datos.financieros, "comprobantePago", speakerId);
  const modalidad = sp ? modalidadFacturaSpeaker(evento, sp) : "unica";
  const sesionesFactura = sp ? sesionesDelSpeaker(evento, sp) : [];
  const nombreSesion = (id: string | null) => {
    const i = evento.sesiones.findIndex((s) => s.id === id);
    return i >= 0 ? `Sesión ${i + 1}${evento.sesiones[i].fecha ? ` (${evento.sesiones[i].fecha})` : ""}` : null;
  };
  const conciliacion = conciliar([...oc, ...facturas, ...comprobantes]);
  // Entrega 37: lo que se puede cargar depende de la modalidad marcada en la solicitud del evento y de lo ya cargado.
  const estadoFac = estadoFacturas({ modalidad, sesiones: sesionesFactura, facturas });
  const porSesion = estadoFac.modalidad === "por_sesion";
  const cubiertas = facturasCubiertas(facturas, comprobantes);
  const pendientesDePago = facturasPendientesDePago(facturas, comprobantes);
  const situacionPago = situacionComprobantes(facturas, comprobantes);
  const sinNotificacion = facturasSinNotificacion(facturas, datos.notificaciones);
  const numerosFacturas = (lista: typeof facturas) => lista.map((f) => f.numero || "sin número").join(", ");
  /** Estado de cada factura: su Notificación de Pago a HCPs (una por factura) y su comprobante de pago. */
  const estadoDeFactura = (f: (typeof facturas)[number]) => {
    const n = notificacionDeFactura(f, datos.notificaciones);
    const pagada = cubiertas.has(f.id);
    return (
      <span className="mt-1 flex flex-wrap gap-1.5" data-testid="factura-estado">
        <Badge variant={n ? (n.estado === "Aprobado" || n.estado === "Completado" ? "approved" : "pending") : "pending"}>
          {n ? `Notificación de pago: ${n.estado}` : "Sin notificación de pago"}
        </Badge>
        <Badge variant={pagada ? "approved" : "pending"}>{pagada ? "Con comprobante de pago" : "Pendiente de pago"}</Badge>
      </span>
    );
  };
  // Entrega 36: el campo de comentarios sigue la configuración del evento — con varios speakers cada bloque tiene los suyos;
  // si este speaker factura por sesión, cada comentario puede indicar a qué sesión aplica; con factura única, aplica a todo el pago.
  const anotaciones = anotacionesDelSpeaker(datos.anotaciones, evento.id, speakerId, totalSpeakers <= 1);
  const sesionesComentario = modalidad === "por_sesion" && sesionesFactura.length > 0 ? sesionesFactura.map((s) => ({ id: s.id, etiqueta: nombreSesion(s.id) ?? "Sesión" })) : [];
  const monedaInicial = evento.moneda || monedas[0] || "";

  return (
    <AccordionPrimitive.Root type="single" collapsible defaultValue="speaker" className="rounded-xl border p-3" data-testid={`exp-speaker-${nombre}`}>
     <AccordionPrimitive.Item value="speaker">
      {cabeceraAcordeon}
      <AccordionPrimitive.Content>
      <div className="mt-3 flex flex-col gap-3">
      {/* 1. CAF: solo si se elaboró fuera de BEATS (aplicativo corporativo) */}
      {(cafDoc?.elaboradoEnCafCorporativo || !!cafCopia) && (
          <BloqueExpediente
            titulo="CAF"
            estado={<EstadoChip hecho={!!cafDoc && cafDoc.estado !== "Borrador" && (!cafDoc.elaboradoEnCafCorporativo || !!cafCopia)} />}
            testId={`exp-caf-${nombre}`}
          >
            {cafDoc ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => abrir(cafDoc)}><ExternalLink /> Ver CAF</Button>
                <Badge variant={cafDoc.estado === "Aprobado" || cafDoc.estado === "Completado" ? "approved" : "pending"}>{cafDoc.estado}</Badge>
                {cafDoc.elaboradoEnCafCorporativo && (
                  <Badge variant="outline" className="gap-1"><Building2 className="size-3" /> Elaborado en CAF corporativo</Badge>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Todavía no hay CAF para este speaker en BEATS.</p>
            )}
            <div className="flex flex-col gap-1">
              <CampoArchivo
                etiqueta={cafDoc?.elaboradoEnCafCorporativo ? "CAF del aplicativo corporativo (copia firmada)" : "Copia externa firmada del CAF (opcional)"}
                valor={cafCopia?.archivoId ?? null}
                onChange={(id) => {
                  if (id) void acciones.cargarArchivoUnico({ categoria: "caf", archivoId: id, speakerId });
                  else if (cafCopia) void acciones.quitarArchivo(cafCopia);
                }}
                aceptar="application/pdf,image/*"
                contexto={contexto}
                nombreTipo="Caf firmado"
              />
            </div>
          </BloqueExpediente>
      )}

      {/* 2. Convenio HCP */}
      <BloqueExpediente
        titulo="Convenio HCP"
        estado={<Badge variant={etapa === "firmado" ? "approved" : etapa === "sin_convenio" ? "cancelled" : "pending"}>{ETIQUETA_ETAPA_CONVENIO_HCP[etapa]}</Badge>}
        testId={`exp-convenio-${nombre}`}
      >
        {!convenio ? (
          <p className="text-xs text-muted-foreground">Este speaker todavía no tiene Convenio HCP en el sistema.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {convenioCompleto && (
                <Button size="sm" variant="outline" onClick={() => abrir(convenioCompleto)}>
                  <ExternalLink /> {convenioCorporativo ? "Ver registro del convenio" : "Ver convenio (aprobado en BEATS)"}
                </Button>
              )}
              {convenioCorporativo && (
                <Badge variant="outline" className="gap-1" data-testid={`exp-convenio-corporativo-${nombre}`}><Building2 className="size-3" /> Elaborado en contratos corporativo</Badge>
              )}
              {puedeEnviar && (
                <Button size="sm" variant="outline" onClick={() => setMostrarEnvio(true)} data-testid={`exp-enviar-hcp-${nombre}`}>
                  <Send /> {etapa === "enviado" ? "Reenviar al HCP" : "Enviar al HCP para firma"}
                </Button>
              )}
            </div>
            {convenio.archivoParaHCPEnviadoEn && (
              <p className="text-xs text-muted-foreground">Enviado al HCP el {formatearFechaHora(convenio.archivoParaHCPEnviadoEn)}.</p>
            )}
            {usuario?.rol !== "medica" && (etapa === "pendiente_envio" || etapa === "enviado") && (
              <p className="text-xs text-muted-foreground">El envío al HCP lo realiza Dirección Médica.</p>
            )}
            {(etapa === "pendiente_envio" || etapa === "enviado" || etapa === "firmado" || etapa === "corporativo_pendiente_copia") && (
              <div className="flex flex-col gap-1">
                <CampoArchivo
                  etiqueta={convenioCorporativo ? "Convenio HCP del aplicativo corporativo (copia firmada)" : "Versión firmada por el HCP"}
                  valor={convenio.archivoFirmadoHCPId}
                  onChange={guardarFirmado}
                  aceptar="application/pdf,image/*"
                  ayuda="El convenio que el HCP revisó, firmó y devolvió. Al cargarlo queda como la versión definitiva."
                  contexto={convenio.consultorNombre || nombre}
                  nombreTipo="Convhcp version firmada"
                  idConsecutivo={convenio.id}
                />
                {etapa === "firmado" && <p className="text-xs font-medium text-status-approved-fg"><FileSignature className="mr-1 inline size-3.5" />Versión definitiva registrada.</p>}
              </div>
            )}
            {etapa === "en_aprobacion" && <p className="text-xs text-muted-foreground">El convenio todavía está en el flujo de aprobación ({convenio.estado}).</p>}
          </>
        )}
        {convenio && (
          <EnviarDocumentoDialog
            open={mostrarEnvio}
            onOpenChange={setMostrarEnvio}
            titulo="Enviar convenio al HCP para firma"
            tipoDoc="convenioHCP"
            documentoId={convenio.id}
            destinatarioEmailInicial={convenio.consultorEmail}
            destinatarioNombreInicial={convenio.consultorNombre}
            asuntoInicial={`Convenio de prestación de servicios — ${convenio.consultorNombre}`}
            mensajeInicial={`Estimado/a ${convenio.consultorNombre},\n\nAdjunto el convenio ya aprobado y firmado por nuestra Gerencia General / Representante Legal. Por favor revísalo, fírmalo y devuélvenoslo para completar el trámite.\n\nGracias.`}
            tituloDocumentosPdf="Convenio para firma (PDF generado automáticamente)"
            documentosPdf={
              convenioCompleto
                ? [
                    {
                      clave: `convenioHCP-${convenioCompleto.id}`,
                      etiqueta: `Convenio HCP — ${convenioCompleto.consultorNombre}`,
                      detalle: "Versión en PDF del convenio, lista para que el HCP la revise y firme (sin marca de agua).",
                      doc: convenioCompleto,
                      conMarcaDeAgua: false,
                      generarAlAbrir: true,
                      marcadoInicial: true,
                    },
                  ]
                : []
            }
            onEnviado={alEnviadoAlHcp}
          />
        )}
      </BloqueExpediente>

      {/* 3. Presentación aprobada y evidencia */}
      {bloquePresentacion}

      {/* 4. Orden de compra */}
      <BloqueExpediente titulo="Orden de compra" estado={<EstadoChip hecho={oc.length > 0} />} testId={`exp-oc-${nombre}`}>
        <ListaRegistrosFinancieros items={oc} onQuitar={acciones.quitarFinanciero} vacio="Todavía no hay orden de compra cargada." />
        <FormRegistroFinanciero
          etiquetaArchivo="Orden de compra"
          nombreTipo="Orden de compra"
          contexto={contexto}
          monedas={monedas}
          monedaInicial={monedaInicial}
          textoBoton="Agregar orden de compra"
          onAgregar={(registro) => acciones.agregarFinanciero({ categoria: "ordenCompra", speakerId, registro })}
        />
      </BloqueExpediente>

      {/* Facturas */}
      <BloqueExpediente
        titulo={porSesion ? "Facturas — una por sesión" : "Factura única"}
        estado={<EstadoChip hecho={estadoFac.completo} texto={estadoFac.completo ? undefined : `${estadoFac.cupos.filter((c) => c.factura).length} de ${estadoFac.capacidad}`} />}
        testId={`exp-facturas-${nombre}`}
      >
        <p className="text-xs text-muted-foreground">
          Modalidad de factura de este speaker (definida en la solicitud del evento):{" "}
          <span className="font-medium">{porSesion ? `Factura por sesión — hasta ${estadoFac.capacidad} facturas, una por sesión` : "Factura única (toda su participación) — una sola factura"}</span>.
          Cada factura requiere su propia Notificación de Pago a HCPs.
        </p>
        {porSesion ? (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {estadoFac.cupos.map((cupo) => {
              const s = sesionesFactura.find((x) => x.id === cupo.sesionId);
              if (!s) return null;
              return (
                <div key={s.id} className="flex flex-col gap-2 rounded-md border p-2.5" data-testid={`exp-cupo-factura-${nombre}`}>
                  <p className="text-xs font-medium text-muted-foreground">{nombreSesion(s.id)}{s.lugar ? ` — ${s.lugar}` : ""}</p>
                  <ListaRegistrosFinancieros items={cupo.factura ? [cupo.factura] : []} onQuitar={acciones.quitarFinanciero} vacio="Sin factura para esta sesión." extra={estadoDeFactura} />
                  {!cupo.factura && (
                    <FormRegistroFinanciero
                      etiquetaArchivo="Factura"
                      nombreTipo="Factura"
                      contexto={`${contexto} sesion ${evento.sesiones.findIndex((x) => x.id === s.id) + 1}`}
                      monedas={monedas}
                      monedaInicial={monedaInicial}
                      textoBoton="Agregar factura de esta sesión"
                      onAgregar={(registro) =>
                        acciones.agregarFinanciero({
                          categoria: "facturas",
                          speakerId,
                          sesionId: s.id,
                          registro,
                          validar: (regs) => validarNuevaFactura({ modalidad, sesiones: sesionesFactura, facturas: filasFinancierasDelSpeaker(regs, "facturas", speakerId), sesionId: s.id }),
                        })
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <>
            <ListaRegistrosFinancieros items={estadoFac.cupos[0]?.factura ? [estadoFac.cupos[0].factura] : []} nombreSesion={nombreSesion} onQuitar={acciones.quitarFinanciero} vacio="Todavía no hay factura cargada." extra={estadoDeFactura} />
            {!estadoFac.cupos[0]?.factura ? (
              <FormRegistroFinanciero
                etiquetaArchivo="Factura"
                nombreTipo="Factura"
                contexto={contexto}
                monedas={monedas}
                monedaInicial={monedaInicial}
                textoBoton="Agregar factura"
                onAgregar={(registro) =>
                  acciones.agregarFinanciero({
                    categoria: "facturas",
                    speakerId,
                    registro,
                    validar: (regs) => validarNuevaFactura({ modalidad, sesiones: sesionesFactura, facturas: filasFinancierasDelSpeaker(regs, "facturas", speakerId) }),
                  })
                }
              />
            ) : (
              <p className="text-xs text-muted-foreground" data-testid="factura-unica-completa">
                Este speaker factura una sola vez (factura única) y su factura ya está cargada. Si necesitas cambiarla, elimínala y carga la correcta.
              </p>
            )}
          </>
        )}
        {estadoFac.sobrantes.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-md border border-dashed border-destructive/40 p-2.5" data-testid="facturas-sobrantes">
            <p className="text-xs text-destructive">
              Hay {estadoFac.sobrantes.length} factura(s) por fuera de lo que admite la modalidad de este speaker (cargadas antes de esta regla o de una sesión que ya no está). Revísalas y elimina las que sobren.
            </p>
            <ListaRegistrosFinancieros items={estadoFac.sobrantes} nombreSesion={nombreSesion} onQuitar={acciones.quitarFinanciero} vacio="" extra={estadoDeFactura} />
          </div>
        )}
        {facturas.length > 0 && sinNotificacion.length > 0 && (
          <p className="text-xs text-amber-700" data-testid="facturas-sin-notificacion">
            Falta la Notificación de Pago a HCPs de: {numerosFacturas(sinNotificacion)}. Se genera una por factura desde «Tareas pendientes».
          </p>
        )}
      </BloqueExpediente>

      {/* Comprobantes de pago */}
      <BloqueExpediente
        titulo="Comprobantes de pago"
        estado={<EstadoChip hecho={situacionPago === "todo_cubierto"} texto={situacionPago === "hay_pendientes" ? `Faltan ${pendientesDePago.length} de ${facturas.length}` : undefined} />}
        testId={`exp-pagos-${nombre}`}
      >
        <ListaRegistrosFinancieros items={comprobantes} nombreSesion={nombreSesion} onQuitar={acciones.quitarFinanciero} vacio="Todavía no hay comprobantes de pago." facturas={facturas} />
        {situacionPago === "sin_facturas" && (
          <p className="text-xs text-muted-foreground" data-testid="comprobante-sin-facturas">
            Para cargar un comprobante de pago primero hay que cargar la factura: cada comprobante cubre una o más facturas.
          </p>
        )}
        {situacionPago === "todo_cubierto" && (
          <p className="text-xs font-medium text-status-approved-fg" data-testid="comprobante-todo-cubierto">
            Todas las facturas de este speaker ({facturas.length}) ya están cubiertas por comprobantes de pago.
          </p>
        )}
        {situacionPago === "hay_pendientes" && (
          <>
            <p className="text-xs text-muted-foreground" data-testid="comprobante-pendientes">
              Facturas sin comprobante de pago ({pendientesDePago.length} de {facturas.length}): <span className="font-medium">{numerosFacturas(pendientesDePago)}</span>.
            </p>
            <FormRegistroFinanciero
              etiquetaArchivo="Comprobante de pago"
              nombreTipo="Comprobante de pago"
              contexto={contexto}
              monedas={monedas}
              monedaInicial={monedaInicial}
              textoBoton="Agregar comprobante de pago"
              facturasDisponibles={pendientesDePago}
              sesionesComentario={sesionesComentario}
              nombreSesion={nombreSesion}
              testId={`exp-form-comprobante-${nombre}`}
              onAgregar={(registro) =>
                acciones.agregarFinanciero({
                  categoria: "comprobantePago",
                  speakerId,
                  registro,
                  validar: (regs) =>
                    validarNuevoComprobante({
                      facturas: filasFinancierasDelSpeaker(regs, "facturas", speakerId),
                      comprobantes: filasFinancierasDelSpeaker(regs, "comprobantePago", speakerId),
                      facturasIds: registro.facturasRelacionadasIds ?? [],
                    }),
                })
              }
            />
          </>
        )}
        <AnotacionesPago
          titulo="Comentarios sobre el pago"
          ayuda={
            porSesion && sesionesComentario.length > 0
              ? `Este speaker factura por sesión (${sesionesComentario.length} sesiones): indica a qué sesión aplica cada comentario.`
              : totalSpeakers > 1
                ? `Comentarios sobre el pago de ${nombre} (el evento tiene ${totalSpeakers} speakers).`
                : "Comentarios sobre el pago de este evento (factura única)."
          }
          anotaciones={anotaciones}
          sesiones={sesionesComentario}
          nombreSesion={nombreSesion}
          onAgregar={(texto, sesionId) => acciones.agregarAnotacion({ speakerId, sesionId, texto })}
          onCambiarAclarada={acciones.cambiarAclarada} onEditar={acciones.editarAnotacion} onEliminar={acciones.eliminarAnotacion}
          testId={`exp-anotaciones-${nombre}`}
        />
      </BloqueExpediente>

      {/* Conciliación */}
      {conciliacion.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-dashed p-3 text-sm" data-testid={`exp-conciliacion-${nombre}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contraste de valores</p>
          {conciliacion.map((l) => (
            <div key={l.moneda} className="flex flex-col gap-1">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <span>Orden de compra: <b>{formatearMonto(l.ordenCompra, l.moneda)}</b></span>
                <span>Facturado: <b>{formatearMonto(l.facturas, l.moneda)}</b></span>
                <span>Pagado: <b>{formatearMonto(l.comprobantes, l.moneda)}</b></span>
              </div>
              {l.alertas.length === 0 ? (
                <span className="text-xs text-status-approved-fg">Los valores cuadran.</span>
              ) : (
                l.alertas.map((a) => <span key={a} className="text-xs text-destructive">• {a}</span>)
              )}
            </div>
          ))}
          {anotaciones.length > 0 && (
            <AnotacionesPago titulo="Anotaciones sobre el pago" anotaciones={anotaciones} puedeAgregar={false} nombreSesion={nombreSesion} onCambiarAclarada={acciones.cambiarAclarada} onEditar={acciones.editarAnotacion} onEliminar={acciones.eliminarAnotacion} testId={`exp-hallazgos-anotaciones-${nombre}`} />
          )}
        </div>
      )}
      </div>
      </AccordionPrimitive.Content>
     </AccordionPrimitive.Item>
    </AccordionPrimitive.Root>
  );
}
