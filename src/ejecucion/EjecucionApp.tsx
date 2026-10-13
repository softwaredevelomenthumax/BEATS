import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PantallaCodigoAcceso } from "./components/PantallaCodigoAcceso";
import { FormularioCheckIn } from "./components/FormularioCheckIn";
import { FormularioFuerzaVentas } from "./components/FormularioFuerzaVentas";
import { PantallaFotosEvento } from "./components/PantallaFotosEvento";
import { FormularioEntregaMuestras } from "./components/FormularioEntregaMuestras";
import { PanelColaOffline } from "./components/PanelColaOffline";
import {
  ErrorEjecucion,
  crearRegistroParticipacion,
  registrarMuestraEntregada,
  registrarFuerzaVentas,
  type DatosFuerzaVentas,
  type DatosCheckIn,
  type ItemMuestraEntrega,
  type SesionEjecucionActiva,
} from "./lib/rpc";
import {
  MAX_INTENTOS_AUTOMATICOS,
  actualizarItemCola,
  encolarMuestra,
  encolarRegistro,
  eliminarDeCola,
  listarCola,
  type ItemCola,
} from "./lib/colaOffline";
import { borrarSesionGuardada, guardarSesion, leerSesionGuardada } from "./lib/sesion";

const INTERVALO_DRENADO_MS = 25_000;

type Pantalla = "codigo" | "menu" | "checkin" | "muestras" | "confirmacion" | "fuerzaVentas" | "fotos";

interface RegistroEnCurso {
  registroId: string | null; // null mientras el check-in sigue en la cola offline
  colaId: string | null; // id del ítem de cola asociado, si quedó pendiente
  nombreCompleto: string;
}

export function EjecucionApp() {
  const [sesion, setSesion] = React.useState<SesionEjecucionActiva | null>(() => leerSesionGuardada());
  const [pantalla, setPantalla] = React.useState<Pantalla>(() => (leerSesionGuardada() ? "menu" : "codigo"));
  const [enviando, setEnviando] = React.useState(false);
  const [registroEnCurso, setRegistroEnCurso] = React.useState<RegistroEnCurso | null>(null);
  const [mensajeConfirmacion, setMensajeConfirmacion] = React.useState("");
  const [cola, setCola] = React.useState<ItemCola[]>([]);
  // `FormularioCheckIn`/`FormularioEntregaMuestras` reaparecen en la MISMA
  // posición del árbol cada vez que se hace un nuevo registro (checkin ->
  // confirmación -> checkin de la siguiente persona) — sin una `key` que
  // cambie, React reutilizaría la misma instancia y arrastraría los datos
  // (nombre, firma, checkboxes...) de la persona anterior al formulario en
  // blanco de la siguiente.
  const [numeroRegistro, setNumeroRegistro] = React.useState(0);

  const refrescarCola = React.useCallback(() => {
    listarCola().then(setCola).catch(() => {});
  }, []);

  React.useEffect(() => {
    refrescarCola();
  }, [refrescarCola]);

  // --- Drenado de la cola offline ---------------------------------------
  const intentarDrenarUno = React.useCallback(
    async (item: ItemCola, opciones?: { resetear?: boolean }) => {
      const base = opciones?.resetear ? { ...item, intentos: 0, agotado: false } : item;
      try {
        if (base.tipo === "registro") {
          const registroId = await crearRegistroParticipacion(base.token, base.datos);
          await eliminarDeCola(base.id);
          toast.success(`Registro de ${base.datos.nombres} ${base.datos.apellidos} sincronizado.`);
          if (base.entregaMuestrasPendiente) {
            try {
              await registrarMuestraEntregada(
                base.token,
                registroId,
                base.entregaMuestrasPendiente.items,
                base.entregaMuestrasPendiente.firmaDataUrl,
              );
              toast.success("Entrega de muestras sincronizada.");
            } catch (e) {
              const error = e instanceof ErrorEjecucion ? e : new ErrorEjecucion(String(e), false);
              if (error.esFalloDeRed) {
                await encolarMuestra(
                  base.token,
                  registroId,
                  base.entregaMuestrasPendiente.items,
                  base.entregaMuestrasPendiente.firmaDataUrl,
                  `${base.datos.nombres} ${base.datos.apellidos}`,
                );
              } else {
                toast.error(`No se pudo sincronizar la entrega de muestras: ${error.message}`);
              }
            }
          }
        } else {
          await registrarMuestraEntregada(base.token, base.registroParticipacionId, base.items, base.firmaDataUrl);
          await eliminarDeCola(base.id);
          toast.success(`Entrega de muestras de ${base.nombreParticipante} sincronizada.`);
        }
      } catch (e) {
        const error = e instanceof ErrorEjecucion ? e : new ErrorEjecucion(String(e), false);
        if (error.esFalloDeRed) {
          const actualizado: ItemCola = {
            ...base,
            intentos: base.intentos + 1,
            ultimoError: error.message,
            agotado: base.intentos + 1 >= MAX_INTENTOS_AUTOMATICOS,
          };
          await actualizarItemCola(actualizado);
        } else {
          // Rechazo de negocio (p.ej. "muestra duplicada" o una sesión que
          // mientras tanto quedó inválida): reintentar no lo va a arreglar,
          // así que se retira de la cola y se avisa para seguimiento manual.
          await eliminarDeCola(base.id);
          toast.error(`No se pudo sincronizar — ${descripcion(base)}: ${error.message}`);
        }
      }
      refrescarCola();
    },
    [refrescarCola],
  );

  const drenarTodo = React.useCallback(async () => {
    const pendientes = await listarCola();
    for (const item of pendientes) {
      if (item.agotado) continue;
      await intentarDrenarUno(item);
    }
  }, [intentarDrenarUno]);

  React.useEffect(() => {
    drenarTodo();
    const intervalo = window.setInterval(drenarTodo, INTERVALO_DRENADO_MS);
    const alReconectar = () => drenarTodo();
    window.addEventListener("online", alReconectar);
    return () => {
      window.clearInterval(intervalo);
      window.removeEventListener("online", alReconectar);
    };
  }, [drenarTodo]);

  // --- Flujo de código de acceso -----------------------------------------
  function alValidarCodigo(nuevaSesion: SesionEjecucionActiva) {
    setSesion(nuevaSesion);
    guardarSesion(nuevaSesion);
    setPantalla("menu");
  }

  function cambiarCodigo() {
    setSesion(null);
    borrarSesionGuardada();
    setPantalla("codigo");
  }

  // --- Flujo de check-in ---------------------------------------------------
  async function enviarCheckIn(datos: DatosCheckIn) {
    if (!sesion) return;
    setEnviando(true);
    const nombreCompleto = `${datos.nombres} ${datos.apellidos}`.trim();
    try {
      const registroId = await crearRegistroParticipacion(sesion.token, datos);
      setRegistroEnCurso({ registroId, colaId: null, nombreCompleto });
      if (sesion.entregaMuestrasMedicas) {
        setPantalla("muestras");
      } else {
        setMensajeConfirmacion(`Registro de ${nombreCompleto} guardado correctamente.`);
        setPantalla("confirmacion");
      }
    } catch (e) {
      const error = e instanceof ErrorEjecucion ? e : new ErrorEjecucion(String(e), false);
      if (error.esFalloDeRed) {
        const item = await encolarRegistro(sesion.token, datos);
        setRegistroEnCurso({ registroId: null, colaId: item.id, nombreCompleto });
        refrescarCola();
        if (sesion.entregaMuestrasMedicas) {
          toast.message("Sin conexión — el registro se guardó y se sincronizará automáticamente.");
          setPantalla("muestras");
        } else {
          setMensajeConfirmacion(
            `Registro de ${nombreCompleto} guardado sin conexión. Se sincronizará automáticamente.`,
          );
          setPantalla("confirmacion");
        }
      } else {
        toast.error(error.message);
      }
    } finally {
      setEnviando(false);
    }
  }

  // --- Flujo de entrega de muestras ---------------------------------------
  async function confirmarEntregaMuestras(items: ItemMuestraEntrega[], firmaDataUrl: string) {
    if (!sesion || !registroEnCurso) return;
    setEnviando(true);
    try {
      if (registroEnCurso.registroId) {
        // Check-in ya sincronizado: se puede llamar la RPC directamente.
        try {
          await registrarMuestraEntregada(sesion.token, registroEnCurso.registroId, items, firmaDataUrl);
          setMensajeConfirmacion(`Registro y entrega de muestras de ${registroEnCurso.nombreCompleto} guardados correctamente.`);
          setPantalla("confirmacion");
        } catch (e) {
          const error = e instanceof ErrorEjecucion ? e : new ErrorEjecucion(String(e), false);
          if (error.esFalloDeRed) {
            await encolarMuestra(sesion.token, registroEnCurso.registroId, items, firmaDataUrl, registroEnCurso.nombreCompleto);
            refrescarCola();
            setMensajeConfirmacion(
              `Registro de ${registroEnCurso.nombreCompleto} guardado. La entrega de muestras se sincronizará automáticamente.`,
            );
            setPantalla("confirmacion");
          } else {
            toast.error(error.message);
          }
        }
      } else if (registroEnCurso.colaId) {
        // El check-in sigue en la cola offline: se cuelga la entrega de
        // muestras de ese mismo ítem para enviarla en cuanto se sincronice
        // y se conozca el `registroParticipacionId` real.
        const pendientes = await listarCola();
        const item = pendientes.find((i) => i.id === registroEnCurso.colaId);
        if (item && item.tipo === "registro") {
          await actualizarItemCola({ ...item, entregaMuestrasPendiente: { items, firmaDataUrl } });
        }
        refrescarCola();
        setMensajeConfirmacion(
          `Registro y entrega de muestras de ${registroEnCurso.nombreCompleto} guardados sin conexión. Se sincronizarán automáticamente.`,
        );
        setPantalla("confirmacion");
      }
    } finally {
      setEnviando(false);
    }
  }

  function omitirEntregaMuestras() {
    if (!registroEnCurso) return;
    const sufijo = registroEnCurso.registroId
      ? "guardado correctamente."
      : "guardado sin conexión. Se sincronizará automáticamente.";
    setMensajeConfirmacion(`Registro de ${registroEnCurso.nombreCompleto} ${sufijo}`);
    setPantalla("confirmacion");
  }

  // --- Fuerza de ventas (octubre 2026) -------------------------------------
  async function enviarFuerzaVentas(datos: DatosFuerzaVentas) {
    if (!sesion) return;
    setEnviando(true);
    try {
      await registrarFuerzaVentas(sesion.token, datos);
      setRegistroEnCurso(null);
      setMensajeConfirmacion(`${datos.nombre} quedó registrado como fuerza de ventas.`);
      setNumeroRegistro((n) => n + 1);
      setPantalla("confirmacion");
    } catch (e) {
      const error = e instanceof ErrorEjecucion ? e : new ErrorEjecucion(String(e), false);
      toast.error(error.esFalloDeRed ? "Sin conexión: el registro no se pudo enviar. Inténtalo de nuevo cuando tengas internet." : error.message);
    } finally {
      setEnviando(false);
    }
  }

  function nuevoRegistro() {
    setRegistroEnCurso(null);
    setNumeroRegistro((n) => n + 1);
    setPantalla("checkin");
  }

  function volverAlMenu() {
    setRegistroEnCurso(null);
    setPantalla("menu");
  }

  if (!sesion || pantalla === "codigo") {
    return <PantallaCodigoAcceso onValidado={alValidarCodigo} />;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="flex items-center justify-between border-b bg-background px-4 py-3">
        <div>
          <div className="text-sm font-semibold">{sesion.nombreEvento}</div>
          <div className="text-xs text-muted-foreground">Responsable: {sesion.responsableNombre}</div>
        </div>
        <div className="flex items-center gap-2">
          <PanelColaOffline items={cola} onReintentar={intentarDrenarUno} />
          <Button variant="ghost" size="sm" onClick={cambiarCodigo}>
            Cambiar código
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl p-4">
        {pantalla === "menu" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">¿Qué deseas hacer?</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button className="h-14 text-base" onClick={nuevoRegistro}>
                Nuevo registro de asistencia
              </Button>
              <Button variant="outline" className="h-14 text-base" onClick={() => setPantalla("fuerzaVentas")} data-testid="menu-fuerza-ventas">
                Registrar fuerza de ventas
              </Button>
              <Button variant="outline" className="h-14 text-base" onClick={() => setPantalla("fotos")} data-testid="menu-fotos">
                Fotos del evento
              </Button>
            </CardContent>
          </Card>
        )}

        {pantalla === "checkin" && (
          <FormularioCheckIn
            key={numeroRegistro}
            sesion={sesion}
            enviando={enviando}
            onCancelar={volverAlMenu}
            onEnviar={enviarCheckIn}
          />
        )}

        {pantalla === "fuerzaVentas" && (
          <FormularioFuerzaVentas key={numeroRegistro} sesion={sesion} enviando={enviando} onCancelar={volverAlMenu} onEnviar={enviarFuerzaVentas} />
        )}

        {pantalla === "fotos" && <PantallaFotosEvento sesion={sesion} onVolver={volverAlMenu} />}

        {pantalla === "muestras" && registroEnCurso && (
          <FormularioEntregaMuestras
            key={numeroRegistro}
            nombreParticipante={registroEnCurso.nombreCompleto}
            productos={sesion.productosPlaneados}
            enviando={enviando}
            onOmitir={omitirEntregaMuestras}
            onConfirmar={confirmarEntregaMuestras}
          />
        )}

        {pantalla === "confirmacion" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Listo</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm">{mensajeConfirmacion}</p>
              <div className="flex gap-2">
                <Button className="flex-1 h-11" onClick={nuevoRegistro}>
                  Nuevo registro
                </Button>
                <Button variant="outline" className="flex-1 h-11" onClick={volverAlMenu}>
                  Volver al menú
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

function descripcion(item: ItemCola): string {
  return item.tipo === "registro" ? `${item.datos.nombres} ${item.datos.apellidos}` : item.nombreParticipante;
}
