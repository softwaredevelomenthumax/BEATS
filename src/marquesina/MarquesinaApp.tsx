import * as React from "react";
import { PantallaCodigoMarquesina } from "./components/PantallaCodigoMarquesina";
import { TableroMarquesina } from "./components/TableroMarquesina";
import { ErrorMarquesina, traerAmpliadoMarquesina, traerResumenEjecucionEvento, type AmpliadoMarquesina, type ResumenEjecucionEvento } from "./lib/rpc";
import { borrarCodigoGuardado, guardarCodigo, leerCodigoGuardado } from "./lib/almacenamiento";

// Entrega 30: sondeo más frecuente (la pantalla es animada y se nota cuando llega un check-in).
const INTERVALO_SONDEO_MS = 8_000;

export function MarquesinaApp() {
  const [codigo, setCodigo] = React.useState<string | null>(() => leerCodigoGuardado());
  const [resumen, setResumen] = React.useState<ResumenEjecucionEvento | null>(null);
  const [ampliado, setAmpliado] = React.useState<AmpliadoMarquesina | null>(null);
  const [sinConexion, setSinConexion] = React.useState(false);
  const [ultimaActualizacion, setUltimaActualizacion] = React.useState<Date | null>(null);
  const [errorCodigo, setErrorCodigo] = React.useState<string | null>(null);
  const [cargandoInicial, setCargandoInicial] = React.useState(() => Boolean(leerCodigoGuardado()));

  const sondear = React.useCallback(async (codigoActual: string) => {
    try {
      const [nuevoResumen, extra] = await Promise.all([traerResumenEjecucionEvento(codigoActual), traerAmpliadoMarquesina(codigoActual)]);
      setResumen(nuevoResumen);
      if (extra) setAmpliado(extra);
      setSinConexion(false);
      setUltimaActualizacion(new Date());
    } catch (e) {
      const error = e instanceof ErrorMarquesina ? e : new ErrorMarquesina(String(e), false);
      if (error.esFalloDeRed) {
        // Falla transitoria de red: se mantiene el último resumen conocido
        // en pantalla (un kiosco no debería quedar en blanco por un
        // problema de conectividad pasajero) y se sigue reintentando cada
        // 15s automáticamente.
        setSinConexion(true);
      } else {
        // Rechazo de negocio ("Código inválido.") — típicamente porque se
        // generó un código nuevo para el evento y el guardado quedó
        // inactivo. Reintentar no lo va a arreglar: se vuelve a pedir el
        // código.
        borrarCodigoGuardado();
        setCodigo(null);
        setResumen(null);
        setAmpliado(null);
        setSinConexion(false);
        setErrorCodigo(error.message);
      }
    } finally {
      setCargandoInicial(false);
    }
  }, []);

  React.useEffect(() => {
    if (!codigo) return;
    sondear(codigo);
    const intervalo = window.setInterval(() => sondear(codigo), INTERVALO_SONDEO_MS);
    return () => window.clearInterval(intervalo);
  }, [codigo, sondear]);

  function alValidarCodigo(codigoValidado: string, resumenInicial: ResumenEjecucionEvento) {
    guardarCodigo(codigoValidado);
    setCodigo(codigoValidado);
    setResumen(resumenInicial);
    setSinConexion(false);
    setUltimaActualizacion(new Date());
    setErrorCodigo(null);
  }

  function cambiarCodigo() {
    borrarCodigoGuardado();
    setCodigo(null);
    setResumen(null);
    setAmpliado(null);
    setErrorCodigo(null);
  }

  if (cargandoInicial) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Cargando BEATS — Marquesina...
      </div>
    );
  }

  if (!codigo || !resumen) {
    return <PantallaCodigoMarquesina errorInicial={errorCodigo} onValidado={alValidarCodigo} />;
  }

  return (
    <TableroMarquesina
      resumen={resumen}
      ampliado={ampliado}
      sinConexion={sinConexion}
      ultimaActualizacion={ultimaActualizacion}
      onCambiarCodigo={cambiarCodigo}
    />
  );
}
