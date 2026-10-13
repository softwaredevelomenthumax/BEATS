import * as React from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DocumentoImprimible } from "@/components/print/DocumentoImprimible";
import { ETIQUETA_FUENTE_ASISTENTES, ETIQUETA_TIPO_ASISTENTE, ciudadesPaisTexto, type ResumenEvento } from "@/lib/informeEvento";
import { formatearMonto } from "@/lib/dinero";
import type { Evento } from "@/types";

const TH = "border border-gray-400 bg-gray-100 px-1.5 py-1 text-left text-[10px] font-semibold";
const TD = "border border-gray-300 px-1.5 py-1 align-top text-[10px]";

function Titulo({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="mb-1.5 mt-4 flex items-center gap-2 border-b border-gray-300 pb-1 text-[11px] font-bold uppercase tracking-wide text-gray-700" style={{ breakAfter: "avoid" }}>
      <span className="inline-flex size-4 items-center justify-center rounded-full bg-[#00a3e0] text-[9px] text-white">{n}</span>
      {children}
    </h2>
  );
}

/**
 * Entrega 21: "Resumen del evento" — una sola hoja (a veces dos) con la
 * identificación del evento, lugares y fechas, sesiones, speakers vinculados,
 * asistentes impactados por tipo, y muestras entregadas por producto. Usa el
 * mismo visor de impresión de los demás informes (membrete opcional, zoom y
 * "Imprimir / Exportar a PDF").
 */
export function ResumenEventoImprimible({ abierto, onCerrar, evento, resumen }: { abierto: boolean; onCerrar: () => void; evento: Evento; resumen: ResumenEvento }) {
  const total = resumen.asistentes.total;
  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="left-0 top-0 h-screen w-screen max-w-none max-h-none translate-x-0 translate-y-0 overflow-y-auto rounded-none border-0 shadow-none" data-testid="vista-resumen-evento">
        <DialogTitle className="sr-only">Resumen del evento</DialogTitle>
        <DocumentoImprimible
          nombreDocumento={`Resumen ${evento.nombreEvento}`}
          onCerrar={onCerrar}
          informe={{ titulo: "Resumen del evento", nombreEvento: evento.nombreEvento, empresaGrupo: evento.empresaGrupo }}
        >
          <div className="text-[11px] leading-snug text-black" data-testid="resumen-evento-contenido">
            <Titulo n={1}>Identificación del evento</Titulo>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              {resumen.identificacion.map((i) => (
                <div key={i.etiqueta} className="flex gap-1.5 border-b border-gray-200 pb-0.5">
                  <span className="w-32 shrink-0 text-gray-500">{i.etiqueta}</span>
                  <span className="font-medium">{i.valor}</span>
                </div>
              ))}
              <div className="flex gap-1.5 border-b border-gray-200 pb-0.5">
                <span className="w-32 shrink-0 text-gray-500">Fecha de inicio</span>
                <span className="font-medium">{resumen.fechas.inicio}</span>
              </div>
              <div className="flex gap-1.5 border-b border-gray-200 pb-0.5">
                <span className="w-32 shrink-0 text-gray-500">Fecha de finalización</span>
                <span className="font-medium">{resumen.fechas.fin}</span>
              </div>
            </div>

            <Titulo n={2}>Lugares, ciudades y fechas {resumen.multisesion ? `(${resumen.sedes.length} sesiones)` : ""}</Titulo>
            <p className="mb-1 text-gray-600">Ciudad(es) y país: <b className="text-black">{ciudadesPaisTexto(resumen)}</b></p>
            <table className="w-full border-collapse" data-testid="resumen-sedes">
              <thead>
                <tr>
                  <th className={TH}>Sesión</th>
                  <th className={TH}>Fecha</th>
                  <th className={TH}>Lugar / dirección</th>
                  <th className={TH}>Ciudad</th>
                  <th className={TH}>Departamento / Estado</th>
                  <th className={TH}>País</th>
                  <th className={TH}>Asistentes esperados</th>
                </tr>
              </thead>
              <tbody>
                {resumen.sedes.map((s) => (
                  <tr key={s.etiqueta} style={{ breakInside: "avoid" }}>
                    <td className={TD}>{s.etiqueta}</td>
                    <td className={TD}>{s.fecha}</td>
                    <td className={TD}>{s.lugar}</td>
                    <td className={TD}>{s.ciudad}</td>
                    <td className={TD}>{s.departamento}</td>
                    <td className={TD}>{s.pais}</td>
                    <td className={TD}>{s.asistentesEsperados ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <Titulo n={3}>Speakers vinculados ({resumen.speakers.length})</Titulo>
            {resumen.speakers.length === 0 ? (
              <p className="text-gray-500">El evento no tiene speakers vinculados.</p>
            ) : (
              <table className="w-full border-collapse" data-testid="resumen-speakers">
                <thead>
                  <tr><th className={TH}>Speaker</th><th className={TH}>Tipo</th><th className={TH}>Participa en</th></tr>
                </thead>
                <tbody>
                  {resumen.speakers.map((s, i) => (
                    <tr key={`${s.nombre}-${i}`} style={{ breakInside: "avoid" }}>
                      <td className={TD}>{s.nombre}</td>
                      <td className={TD}>{s.tipo === "interno" ? "Interno" : "Externo"}</td>
                      <td className={TD}>{s.sesiones}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <Titulo n={4}>Financiero — costos asociados al evento</Titulo>
            <SeccionFinanciera resumen={resumen} />

            <Titulo n={5}>Asistentes impactados — {total.total} en total</Titulo>
            <p className="mb-1 text-gray-600">
              Fuente: {ETIQUETA_FUENTE_ASISTENTES[total.fuente]}
              {resumen.asistentes.esperados != null ? ` · Esperados en la solicitud: ${resumen.asistentes.esperados}` : ""}
            </p>
            <table className="w-full border-collapse" data-testid="resumen-asistentes">
              <thead>
                <tr>
                  <th className={TH}>Alcance</th>
                  {ETIQUETA_TIPO_ASISTENTE.map((t) => <th key={t.clave} className={TH}>{t.etiqueta}</th>)}
                  <th className={TH}>Total</th>
                </tr>
              </thead>
              <tbody>
                {resumen.asistentes.porAlcance.length > 1 &&
                  resumen.asistentes.porAlcance.map((a) => (
                    <tr key={a.etiqueta} style={{ breakInside: "avoid" }}>
                      <td className={TD}>{a.etiqueta}</td>
                      {ETIQUETA_TIPO_ASISTENTE.map((t) => <td key={t.clave} className={TD}>{a.distribucion[t.clave]}</td>)}
                      <td className={TD}>{a.distribucion.total}</td>
                    </tr>
                  ))}
                <tr className="font-bold">
                  <td className={`${TD} bg-gray-50`}>Total del evento</td>
                  {ETIQUETA_TIPO_ASISTENTE.map((t) => <td key={t.clave} className={`${TD} bg-gray-50`}>{total[t.clave]}</td>)}
                  <td className={`${TD} bg-gray-50`}>{total.total}</td>
                </tr>
              </tbody>
            </table>

            <Titulo n={6}>Muestras médicas entregadas</Titulo>
            {!resumen.muestras.entrega ? (
              <p className="text-gray-500">El evento no contempló entrega de muestras médicas.</p>
            ) : (
              <>
                <p className="mb-1 text-gray-600">
                  Total: <b className="text-black">{resumen.muestras.totalUnidades}</b> unidad(es) en <b className="text-black">{resumen.muestras.entregas}</b> entrega(s) a <b className="text-black">{resumen.muestras.personas}</b> persona(s).
                  {resumen.muestras.previstas ? ` Previstas en la solicitud: ${resumen.muestras.previstas}.` : ""}
                </p>
                {resumen.muestras.porProducto.length === 0 ? (
                  <p className="text-gray-500">Todavía no hay entregas registradas desde Ejecución en Sitio.</p>
                ) : (
                  <table className="w-full border-collapse" data-testid="resumen-muestras">
                    <thead>
                      <tr><th className={TH}>Muestra / producto</th><th className={TH}>Unidades entregadas</th><th className={TH}>Entregas</th></tr>
                    </thead>
                    <tbody>
                      {resumen.muestras.porProducto.map((p) => (
                        <tr key={p.nombre} style={{ breakInside: "avoid" }}>
                          <td className={TD}>{p.nombre}</td>
                          <td className={TD}>{p.unidades}</td>
                          <td className={TD}>{p.entregas}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>
        </DocumentoImprimible>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Entrega 22: detalle de todos los costos del evento — presupuesto solicitado (condensado y desglose por
 * speaker/sesión) y ejecución real (orden de compra, facturas y comprobantes de pago del Expediente).
 */
export function SeccionFinanciera({ resumen }: { resumen: ResumenEvento }) {
  const f = resumen.financiero;
  const m = (v: number | null) => formatearMonto(v, f.moneda);
  const conValor = f.condensado.filter((c) => c.valor !== 0);
  return (
    <div data-testid="resumen-financiero">
      <p className="mb-1 text-gray-600">
        Moneda: <b className="text-black">{f.moneda || "—"}</b>
        {f.centroCostos ? <> · Centro de costos: <b className="text-black">{f.centroCostos}</b></> : null}
        {f.presupuestoAprobado.incluido && f.presupuestoAprobado.monto != null ? <> · Presupuesto aprobado: <b className="text-black">{m(f.presupuestoAprobado.monto)}</b></> : null}
      </p>

      <p className="mb-0.5 mt-1 font-semibold">Presupuesto solicitado (condensado)</p>
      <table className="w-full border-collapse" data-testid="resumen-fin-condensado">
        <thead><tr><th className={TH}>Concepto</th><th className={`${TH} text-right`}>Valor</th></tr></thead>
        <tbody>
          {conValor.length === 0 && <tr><td className={TD} colSpan={2}>Sin costos declarados en la solicitud.</td></tr>}
          {conValor.map((c) => (
            <tr key={c.concepto} style={{ breakInside: "avoid" }}><td className={TD}>{c.concepto}</td><td className={`${TD} text-right`}>{m(c.valor)}</td></tr>
          ))}
          <tr className="font-bold"><td className={`${TD} bg-gray-50`}>Total solicitado</td><td className={`${TD} bg-gray-50 text-right`}>{m(f.totalSolicitado)}</td></tr>
        </tbody>
      </table>

      {f.bloques.length > 0 && (
        <>
          <p className="mb-0.5 mt-2 font-semibold">Detalle de costos por {resumen.speakers.length > 0 ? "speaker" : "sesión"}</p>
          <table className="w-full border-collapse" data-testid="resumen-fin-detalle">
            <thead><tr><th className={TH}>Responsable / sesión</th><th className={TH}>Concepto</th><th className={TH}>Detalle</th><th className={`${TH} text-right`}>Valor</th></tr></thead>
            <tbody>
              {f.bloques.flatMap((b) => [
                ...(b.lineas.length === 0
                  ? [<tr key={`${b.titulo}-v`}><td className={TD}><b>{b.titulo}</b> <span className="text-gray-500">({b.subtitulo})</span></td><td className={TD} colSpan={3}>Sin costos declarados.</td></tr>]
                  : b.lineas.map((l, i) => (
                      <tr key={`${b.titulo}-${i}`} style={{ breakInside: "avoid" }}>
                        <td className={TD}>{i === 0 ? <><b>{b.titulo}</b> <span className="text-gray-500">({b.subtitulo})</span></> : ""}</td>
                        <td className={TD}>{l.concepto}</td>
                        <td className={TD}>{l.detalle || "—"}</td>
                        <td className={`${TD} text-right`}>{m(l.valor)}</td>
                      </tr>
                    ))),
                ...(b.lineas.length > 0
                  ? [<tr key={`${b.titulo}-s`} className="font-semibold"><td className={`${TD} bg-gray-50`} colSpan={3}>Subtotal — {b.titulo}</td><td className={`${TD} bg-gray-50 text-right`}>{m(b.subtotal)}</td></tr>]
                  : []),
              ])}
            </tbody>
          </table>
        </>
      )}

      <p className="mb-0.5 mt-2 font-semibold">Ejecución real: orden de compra, facturas y pagos</p>
      {f.ejecucion.registros.length === 0 ? (
        <p className="text-gray-500">Todavía no se han cargado órdenes de compra, facturas ni comprobantes de pago en el Expediente.</p>
      ) : (
        <>
          <table className="w-full border-collapse" data-testid="resumen-fin-registros">
            <thead><tr><th className={TH}>Documento</th><th className={TH}>Número</th><th className={TH}>Fecha</th><th className={TH}>Speaker</th><th className={TH}>Sesión</th><th className={`${TH} text-right`}>Valor</th></tr></thead>
            <tbody>
              {f.ejecucion.registros.map((r, i) => (
                <tr key={i} style={{ breakInside: "avoid" }}>
                  <td className={TD}>{r.categoria}</td><td className={TD}>{r.numero || "—"}</td><td className={TD}>{r.fecha || "—"}</td>
                  <td className={TD}>{r.speaker || "—"}</td><td className={TD}>{r.sesion || "—"}</td>
                  <td className={`${TD} text-right`}>{formatearMonto(r.valor, r.moneda)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="mt-1 w-full border-collapse" data-testid="resumen-fin-conciliacion">
            <thead><tr><th className={TH}>Moneda</th><th className={`${TH} text-right`}>Orden de compra</th><th className={`${TH} text-right`}>Facturado</th><th className={`${TH} text-right`}>Pagado</th><th className={TH}>Estado</th></tr></thead>
            <tbody>
              {f.ejecucion.total.map((l) => (
                <tr key={l.moneda} style={{ breakInside: "avoid" }}>
                  <td className={TD}>{l.moneda}</td>
                  <td className={`${TD} text-right`}>{formatearMonto(l.ordenCompra, l.moneda === "—" ? "" : l.moneda)}</td>
                  <td className={`${TD} text-right`}>{formatearMonto(l.facturas, l.moneda === "—" ? "" : l.moneda)}</td>
                  <td className={`${TD} text-right`}>{formatearMonto(l.comprobantes, l.moneda === "—" ? "" : l.moneda)}</td>
                  <td className={TD}>{l.alertas.length === 0 ? "Cuadra" : l.alertas.join(" ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
