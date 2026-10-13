import * as React from "react";
import { toast } from "sonner";
import { CheckCircle2, MessageSquarePlus, Pencil, RotateCcw, StickyNote, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatearFechaHora } from "@/lib/fecha";
import { ETIQUETA_ROL_USUARIO, type RolUsuario } from "@/lib/enums";
import { mensajeErrorAmigable } from "@/lib/supabaseClient";
import { useAuth } from "@/hooks/useAuth";
import { useConfirmar } from "@/hooks/useConfirmar";
import { puedeGestionarAnotacion } from "@/lib/anotacionesPago";
import type { AnotacionPago } from "@/types";

const TODAS = "__todas__";

export interface OpcionSesionAnotacion {
  id: string;
  etiqueta: string;
}

function etiquetaRol(rol: string): string {
  return (ETIQUETA_ROL_USUARIO as Record<string, string>)[rol as RolUsuario] ?? rol;
}

/**
 * Entrega 36 — lista de anotaciones de pago con trazabilidad (quién, con qué rol y cuándo) y, si se permite, el cuadro
 * para agregar una nueva. Se usa en el Expediente (comentarios del comprobante de pago y sección de hallazgos) y en el
 * Informe de Pagos (aclarar inconsistencias entre orden de compra, facturas y comprobantes). Se pueden marcar como aclaradas
 * (con autor y fecha).
 *
 * Entrega 39: el AUTOR de la anotación (o un administrador) puede EDITARLA o ELIMINARLA. Cada cambio queda en el registro
 * de auditoría con el usuario que lo hizo (lo registra la base de datos, ver `db/entrega_39b_*.sql`); la anotación editada
 * muestra «Editada por … · fecha».
 */
export function AnotacionesPago({
  anotaciones,
  titulo = "Anotaciones sobre el pago",
  ayuda,
  puedeAgregar = true,
  sesiones = [],
  nombreSesion,
  placeholder = "Escribe una anotación sobre el pago…",
  etiquetaBoton = "Agregar anotación",
  onAgregar,
  onCambiarAclarada,
  onEditar,
  onEliminar,
  testId,
}: {
  anotaciones: AnotacionPago[];
  titulo?: string;
  ayuda?: string;
  puedeAgregar?: boolean;
  /** Solo si el speaker factura por sesión: permite indicar a qué sesión aplica la anotación. */
  sesiones?: OpcionSesionAnotacion[];
  nombreSesion?: (id: string | null) => string | null;
  placeholder?: string;
  etiquetaBoton?: string;
  onAgregar?: (texto: string, sesionId: string | null) => Promise<void>;
  onCambiarAclarada?: (id: string, aclarada: boolean) => Promise<void>;
  /** Entrega 39: edita el texto (solo autor o administrador; la base lo exige y deja constancia en la auditoría). */
  onEditar?: (id: string, texto: string) => Promise<void>;
  /** Entrega 39: elimina la anotación (solo autor o administrador; la base deja constancia en la auditoría). */
  onEliminar?: (id: string) => Promise<void>;
  testId?: string;
}) {
  const [texto, setTexto] = React.useState("");
  const [sesionId, setSesionId] = React.useState(TODAS);
  const [guardando, setGuardando] = React.useState(false);
  const [cambiando, setCambiando] = React.useState<string | null>(null);
  const { usuario } = useAuth();
  const confirmar = useConfirmar();
  const [editandoId, setEditandoId] = React.useState<string | null>(null);
  const [textoEdicion, setTextoEdicion] = React.useState("");
  const [ocupadaId, setOcupadaId] = React.useState<string | null>(null);

  function empezarEdicion(a: AnotacionPago) {
    setEditandoId(a.id);
    setTextoEdicion(a.texto);
  }

  async function guardarEdicion(a: AnotacionPago) {
    if (!onEditar) return;
    const nuevo = textoEdicion.trim();
    if (!nuevo) return toast.error("La anotación no puede quedar vacía. Si quieres quitarla, elimínala.");
    if (nuevo === a.texto.trim()) {
      setEditandoId(null);
      return;
    }
    setOcupadaId(a.id);
    try {
      await onEditar(a.id, nuevo);
      setEditandoId(null);
    } catch (error) {
      toast.error(mensajeErrorAmigable(error));
    } finally {
      setOcupadaId(null);
    }
  }

  async function eliminar(a: AnotacionPago) {
    if (!onEliminar) return;
    const ok = await confirmar({
      titulo: "Eliminar anotación",
      mensaje: "¿Eliminar esta anotación? Quedará constancia en el registro de auditoría de quién la eliminó y de su texto, pero no se podrá recuperar en la pantalla.",
      textoConfirmar: "Eliminar",
    });
    if (!ok) return;
    setOcupadaId(a.id);
    try {
      await onEliminar(a.id);
    } catch (error) {
      toast.error(mensajeErrorAmigable(error));
    } finally {
      setOcupadaId(null);
    }
  }

  async function agregar() {
    if (!onAgregar) return;
    if (!texto.trim()) return toast.error("Escribe la anotación antes de agregarla.");
    setGuardando(true);
    try {
      await onAgregar(texto.trim(), sesionId === TODAS ? null : sesionId);
      setTexto("");
      setSesionId(TODAS);
    } catch (error) {
      toast.error(mensajeErrorAmigable(error));
    } finally {
      setGuardando(false);
    }
  }

  async function alternar(a: AnotacionPago) {
    if (!onCambiarAclarada) return;
    setCambiando(a.id);
    try {
      await onCambiarAclarada(a.id, !a.aclarada);
    } catch (error) {
      toast.error(mensajeErrorAmigable(error));
    } finally {
      setCambiando(null);
    }
  }

  const pendientes = anotaciones.filter((a) => !a.aclarada).length;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed p-2.5" data-testid={testId ?? "anotaciones-pago"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <StickyNote className="size-3.5" /> {titulo}
        </p>
        {anotaciones.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {anotaciones.length} anotación(es) · {pendientes === 0 ? "todas aclaradas" : `${pendientes} sin aclarar`}
          </span>
        )}
      </div>
      {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}

      {anotaciones.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="anotaciones-vacio">Todavía no hay anotaciones.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {anotaciones.map((a) => {
            const sesion = a.sesionId && nombreSesion ? nombreSesion(a.sesionId) : null;
            return (
              <li key={a.id} className="rounded-md border bg-background p-2 text-sm" data-testid="anotacion-pago">
                {editandoId === a.id ? (
                  <div className="flex flex-col gap-1.5">
                    <Textarea sinMayusculas rows={3} value={textoEdicion} onChange={(e) => setTextoEdicion(e.target.value)} data-testid="anotacion-edicion-texto" />
                    <div className="flex flex-wrap gap-1.5">
                      <Button type="button" size="sm" className="h-7 px-2 text-xs" disabled={ocupadaId === a.id} onClick={() => void guardarEdicion(a)} data-testid="anotacion-edicion-guardar">
                        Guardar cambios
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={ocupadaId === a.id} onClick={() => setEditandoId(null)} data-testid="anotacion-edicion-cancelar">
                        <X /> Cancelar
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">El cambio queda en el registro de auditoría con tu nombre, el texto anterior y el nuevo.</p>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap break-words" data-testid="anotacion-texto-guardado">{a.texto}</p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted-foreground">
                  <span data-testid="anotacion-autor">
                    <b className="font-medium text-foreground">{a.autorNombre || "Usuario no identificado"}</b>
                    {a.autorRol ? ` (${etiquetaRol(a.autorRol)})` : ""} · {formatearFechaHora(a.creadoEn)}
                  </span>
                  {a.editadaEn && (
                    <span data-testid="anotacion-editada" className="italic">
                      Editada por {a.editadaPorNombre || "—"} · {formatearFechaHora(a.editadaEn)}
                    </span>
                  )}
                  <Badge variant="outline">{a.origen === "informe_pagos" ? "Informe de Pagos" : "Expediente"}</Badge>
                  {sesion && <Badge variant="outline">{sesion}</Badge>}
                  {a.aclarada ? (
                    <span className="inline-flex items-center gap-1 text-status-approved-fg" data-testid="anotacion-aclarada">
                      <CheckCircle2 className="size-3.5" /> Aclarada por {a.aclaradaPorNombre || "—"}{a.aclaradaEn ? ` · ${formatearFechaHora(a.aclaradaEn)}` : ""}
                    </span>
                  ) : (
                    <Badge variant="pending">Sin aclarar</Badge>
                  )}
                  {onCambiarAclarada && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      disabled={cambiando === a.id}
                      onClick={() => void alternar(a)}
                      data-testid={a.aclarada ? "anotacion-reabrir" : "anotacion-aclarar"}
                    >
                      {a.aclarada ? <><RotateCcw /> Reabrir</> : <><CheckCircle2 /> Marcar como aclarada</>}
                    </Button>
                  )}
                  {editandoId !== a.id && puedeGestionarAnotacion(a, usuario) && (
                    <>
                      {onEditar && (
                        <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={ocupadaId === a.id} onClick={() => empezarEdicion(a)} data-testid="anotacion-editar">
                          <Pencil /> Editar
                        </Button>
                      )}
                      {onEliminar && (
                        <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs text-destructive hover:text-destructive" disabled={ocupadaId === a.id} onClick={() => void eliminar(a)} data-testid="anotacion-eliminar">
                          <Trash2 /> Eliminar
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {puedeAgregar && onAgregar && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Nueva anotación</Label>
          <Textarea sinMayusculas rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={placeholder} data-testid="anotacion-texto" />
          {sesiones.length > 0 && (
            <div className="flex flex-col gap-1 sm:max-w-xs">
              <Label className="text-xs">Aplica a</Label>
              <Select value={sesionId} onValueChange={setSesionId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODAS}>Todo el pago (todas las sesiones)</SelectItem>
                  {sesiones.map((s) => (<SelectItem key={s.id} value={s.id}>{s.etiqueta}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button type="button" size="sm" variant="outline" className="w-fit" disabled={guardando} onClick={() => void agregar()} data-testid="anotacion-agregar">
            <MessageSquarePlus /> {etiquetaBoton}
          </Button>
          <p className="text-[11px] text-muted-foreground">Queda registrado quién la escribió y cuándo. Quien la escribió (o un administrador) puede editarla o eliminarla; cada cambio queda en el registro de auditoría.</p>
        </div>
      )}
    </div>
  );
}
