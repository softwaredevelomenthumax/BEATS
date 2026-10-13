import * as React from "react";
import { Telemetria } from "@/lib/telemetria";
import { DetalleCaf } from "@/components/DetalleCaf";
import { DetalleEvento } from "@/components/DetalleEvento";
import { DetalleFmv } from "@/components/DetalleFmv";
import { DetalleNotificacionPago } from "@/components/DetalleNotificacionPago";
import { DetalleConvenio } from "@/components/DetalleConvenio";
import { DetalleConvenioHCP } from "@/components/DetalleConvenioHCP";
import { ExpedienteEvento } from "@/components/expediente/ExpedienteEvento";
import type { Evento } from "@/types";
import { ClaveVentanaContexto } from "@/components/ui/dialog";
import { useBandejaVentanas } from "@/hooks/useBandejaVentanas";
import type { DocumentoAny } from "@/lib/documentoGenerico";
import { traerDocumentoActualizado } from "@/lib/documentoGenerico";

/**
 * Octubre 2026 — ventanas, fase 2. El estado de las ventanas de documento
 * (las 6 `Detalle*`) vive aquí, en el AppShell, y no en la página que las
 * abrió: así sobreviven al cambio de página, se pueden tener varias abiertas
 * (incluso del mismo tipo) y las minimizadas siguen en la bandeja.
 *
 * - `abrir(doc)`: abre la ventana de ese documento; si ya estaba abierta
 *   (p. ej. minimizada), solo la restaura — nunca se duplica.
 * - Cuando una ventana cambia algo (`onActualizado`), el documento se vuelve
 *   a leer y las páginas que estén montadas se refrescan (cada página se
 *   suscribe con `useAbrirDocumentoGenerico(recargar)`).
 */
interface VentanaAbierta {
  clave: string;
  doc: DocumentoAny;
}

interface Ctx {
  abrir: (doc: DocumentoAny) => void;
  /** Octubre 2026: abre (o restaura) la ventana "Expediente del evento". */
  abrirExpediente: (evento: Evento) => void;
  suscribirRecarga: (fn: () => void) => () => void;
}

const Contexto = React.createContext<Ctx | null>(null);

export function claveDocumento(doc: Pick<DocumentoAny, "tipoDoc" | "id">): string {
  return `doc:${doc.tipoDoc}:${doc.id}`;
}

export function VentanasDocumentosProvider({ children }: { children: React.ReactNode }) {
  const [abiertas, setAbiertas] = React.useState<VentanaAbierta[]>([]);
  const abiertasRef = React.useRef<VentanaAbierta[]>([]);
  abiertasRef.current = abiertas;
  const [expedientes, setExpedientes] = React.useState<Evento[]>([]);
  const expedientesRef = React.useRef<Evento[]>([]);
  expedientesRef.current = expedientes;
  const listeners = React.useRef(new Set<() => void>());
  const bandeja = useBandejaVentanas();

  const abrir = React.useCallback(
    (doc: DocumentoAny) => {
      const clave = claveDocumento(doc);
      if (abiertasRef.current.some((a) => a.clave === clave)) {
        bandeja.restaurar(clave);
        return;
      }
      // Entrega 32: la ventana se abre SIEMPRE con la versión más reciente del documento. Varias pantallas (Expediente,
      // Documentos, Participación del speaker...) guardan su propia copia de la lista y no se refrescan cuando una ventana
      // modifica el documento; abrirlo desde ahí mostraba —y luego imprimía— el contenido anterior a la corrección.
      // Si la lectura falla (sin red) se abre con la copia recibida, como antes.
      void (async () => {
        let fresco: DocumentoAny | null = null;
        try {
          fresco = await traerDocumentoActualizado(doc.tipoDoc, doc.id);
        } catch {
          fresco = null;
        }
        const vigente = fresco ?? doc;
        setAbiertas((prev) => (prev.some((a) => a.clave === clave) ? prev : [...prev, { clave, doc: vigente }]));
      })();
    },
    [bandeja],
  );

  const abrirExpediente = React.useCallback(
    (evento: Evento) => {
      const clave = `expediente:${evento.id}`;
      if (expedientesRef.current.some((e) => e.id === evento.id)) {
        bandeja.restaurar(clave);
        return;
      }
      setExpedientes((prev) => [...prev, evento]);
    },
    [bandeja],
  );

  const suscribirRecarga = React.useCallback((fn: () => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  const cerrar = React.useCallback((clave: string) => {
    setAbiertas((prev) => prev.filter((a) => a.clave !== clave));
  }, []);

  const alActualizar = React.useCallback(async (v: VentanaAbierta) => {
    let fresco: DocumentoAny | null = null;
    try {
      fresco = await traerDocumentoActualizado(v.doc.tipoDoc, v.doc.id);
    } catch {
      fresco = null;
    }
    // Si la ventana ya se cerró (anular, enviar, eliminar...), no se reabre.
    // Si el documento ya no existe (se eliminó), se cierra.
    setAbiertas((prev) =>
      prev.flatMap((a) => (a.clave !== v.clave ? [a] : fresco ? [{ ...a, doc: fresco }] : [])),
    );
    listeners.current.forEach((fn) => fn());
  }, []);

  const valor = React.useMemo<Ctx>(() => ({ abrir, abrirExpediente, suscribirRecarga }), [abrir, abrirExpediente, suscribirRecarga]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      {abiertas.map((v) => (
        <ClaveVentanaContexto.Provider key={v.clave} value={v.clave}>
          <DetalleDe v={v} onCerrar={() => cerrar(v.clave)} onActualizado={() => alActualizar(v)} />
        </ClaveVentanaContexto.Provider>
      ))}
      {expedientes.map((ev) => (
        <ClaveVentanaContexto.Provider key={`expediente:${ev.id}`} value={`expediente:${ev.id}`}>
          <ExpedienteEvento evento={ev} abierto onCerrar={() => setExpedientes((prev) => prev.filter((e) => e.id !== ev.id))} />
        </ClaveVentanaContexto.Provider>
      ))}
    </Contexto.Provider>
  );
}

function DetalleDe({ v, onCerrar, onActualizado }: { v: VentanaAbierta; onCerrar: () => void; onActualizado: () => void }) {
  const doc = v.doc;
  // Entrega 29: cronómetro de revisión/firma mientras la ventana del documento está abierta.
  const tipoMed = doc.tipoDoc;
  const idMed = doc.id;
  React.useEffect(() => {
    Telemetria.revisionAbierta(tipoMed, idMed);
    return () => Telemetria.revisionCerrada(tipoMed, idMed);
  }, [tipoMed, idMed]);
  switch (doc.tipoDoc) {
    case "caf":
      return <DetalleCaf caf={doc} abierto onCerrar={onCerrar} onActualizado={onActualizado} />;
    case "evento":
      return <DetalleEvento evento={doc} abierto onCerrar={onCerrar} onActualizado={onActualizado} />;
    case "fmv":
      return <DetalleFmv fmv={doc} abierto onCerrar={onCerrar} onActualizado={onActualizado} />;
    case "notificacionPago":
      return <DetalleNotificacionPago notificacion={doc} abierto onCerrar={onCerrar} onActualizado={onActualizado} />;
    case "convenio":
      return <DetalleConvenio convenio={doc} abierto onCerrar={onCerrar} onActualizado={onActualizado} />;
    case "convenioHCP":
      return <DetalleConvenioHCP convenio={doc} abierto onCerrar={onCerrar} onActualizado={onActualizado} />;
  }
}

export function useVentanasDocumentos(): Ctx {
  const ctx = React.useContext(Contexto);
  if (!ctx) throw new Error("useVentanasDocumentos debe usarse dentro de VentanasDocumentosProvider.");
  return ctx;
}
