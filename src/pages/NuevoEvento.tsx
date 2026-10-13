import * as React from "react";
import { traerDirectorioUsuarios } from "@/lib/usuarios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  FormularioEvento,
  EVENTO_VACIO,
  calcularErroresEvento,
  type DatosFormularioEvento,
} from "@/components/forms/FormularioEvento";
import { useAuth } from "@/hooks/useAuth";
import { useCompania } from "@/hooks/useCompania";
import { crearEvento } from "@/lib/evento";
import { traerCamposPersonalizados, type CampoPersonalizadoDefinicion } from "@/lib/camposPersonalizados";
import { traerEtiquetasCampo, type EtiquetaCampo } from "@/lib/etiquetasCampo";
import { traerSpeakersResumen, type SpeakerResumen } from "@/lib/speakers";
import { traerProductosResumen, type ProductoResumen } from "@/lib/productos";

export function NuevoEvento({ onCreado, onCancelar }: { onCreado?: () => void; onCancelar?: () => void }) {
  const { usuario } = useAuth();
  const { companiaActual } = useCompania();
  const [datos, setDatos] = React.useState<DatosFormularioEvento>(EVENTO_VACIO);
  const [errores, setErrores] = React.useState<Record<string, string>>({});
  const [enviando, setEnviando] = React.useState(false);
  const [campos, setCampos] = React.useState<CampoPersonalizadoDefinicion[]>([]);
  const [etiquetas, setEtiquetas] = React.useState<EtiquetaCampo[]>([]);
  const [speakers, setSpeakers] = React.useState<SpeakerResumen[]>([]);
  const [productos, setProductos] = React.useState<ProductoResumen[]>([]);

  React.useEffect(() => {
    traerCamposPersonalizados().then(setCampos).catch(() => setCampos([]));
    traerEtiquetasCampo().then(setEtiquetas).catch(() => setEtiquetas([]));
    traerSpeakersResumen().then(setSpeakers).catch(() => setSpeakers([]));
    traerProductosResumen().then(setProductos).catch(() => setProductos([]));
  }, []);

  // Reorganización FormularioEvento (septiembre 2026), decisión confirmada:
  // "Nombre del solicitante" se autocarga desde el usuario en sesión y
  // sigue siendo editable — antes quedaba vacío hasta que el usuario lo
  // escribía a mano. Solo lo autocompleta mientras el campo sigue vacío,
  // para no pisar una edición manual ya hecha.
  React.useEffect(() => {
    if (!usuario) return;
    setDatos((d) => (d.nombreSolicitante ? d : { ...d, nombreSolicitante: usuario.nombre.toLocaleUpperCase("es") }));
  }, [usuario]);

  // Entrega 32: «Nombre del superior que aprueba» se autocarga con el jefe inmediato que el usuario tiene
  // registrado en su perfil (mismo origen que el CAF). Sigue siendo editable y, como los otros autocargados,
  // solo se llena mientras el campo esté vacío para no pisar lo que ya se escribió. Sin jefe registrado queda vacío.
  const jefeInmediatoId = usuario?.jefeInmediatoId ?? "";
  const usuarioId = usuario?.id ?? "";
  const nombreUsuario = usuario?.nombre ?? "";
  React.useEffect(() => {
    if (!jefeInmediatoId) return;
    let vivo = true;
    const aplicar = (nombre: string) => {
      if (vivo && nombre) setDatos((d) => (d.nombreSuperiorAprueba ? d : { ...d, nombreSuperiorAprueba: nombre.toLocaleUpperCase("es") }));
    };
    if (jefeInmediatoId === usuarioId) {
      aplicar(nombreUsuario); // se eligió a sí mismo como jefe inmediato
    } else {
      traerDirectorioUsuarios()
        .then((dir) => aplicar(dir.find((x) => x.id === jefeInmediatoId)?.nombre ?? ""))
        .catch(() => { /* sin directorio: el campo queda editable y vacío */ });
    }
    return () => { vivo = false; };
  }, [jefeInmediatoId, usuarioId, nombreUsuario]);

  if (!usuario) return null;
  const empresaGrupo = companiaActual ?? usuario.empresasGrupo[0] ?? "";
  const pais = usuario.paisesOperacion[0] ?? "";

  // Corrección (octubre 2026), pedido explícito del usuario: "Empresa del
  // grupo" se autocarga desde la compañía con la que el usuario está
  // trabajando (`companiaActual`/`useCompania`) — antes quedaba vacía
  // hasta que el usuario la elegía a mano en un desplegable con TODAS las
  // empresas del catálogo, lo que permitía dejarla sin diligenciar (o
  // elegir una empresa distinta a la propia) y que la solicitud quedara en
  // una "zona gris": invisible para cualquier filtro por compañía. Mismo
  // patrón que el autocompletado de "Nombre del solicitante" — solo
  // mientras el campo siga vacío, para no pisar una edición manual ya
  // hecha (p. ej. un administrador con varias empresas que de verdad
  // necesite registrar la solicitud bajo otra).
  React.useEffect(() => {
    if (!empresaGrupo) return;
    setDatos((d) => (d.empresaGrupo ? d : { ...d, empresaGrupo }));
  }, [empresaGrupo]);

  async function guardar(comoBorrador: boolean) {
    if (!usuario) return;
    // Corrección (octubre 2026), pedido explícito: "Ningún formulario de
    // Solicitud de Evento se debe guardar, así sea como borrador, si
    // falta, por lo menos, el campo 'Empresa del grupo'" — a diferencia
    // del resto de la validación completa (que solo corre al enviar a
    // aprobación), este chequeo puntual corre SIEMPRE, incluso al guardar
    // como borrador.
    if (!datos.empresaGrupo.trim()) {
      setErrores((e) => ({ ...e, empresaGrupo: "Empresa del grupo es obligatorio." }));
      toast.error("Indica la empresa del grupo antes de guardar — ni siquiera como borrador.");
      return;
    }
    if (!comoBorrador) {
      const erroresCalculados = calcularErroresEvento(datos);
      setErrores(erroresCalculados);
      if (Object.keys(erroresCalculados).length > 0) {
        toast.error("Revisa los campos marcados antes de enviar.");
        return;
      }
    }
    setEnviando(true);
    try {
      await crearEvento(datos, usuario, comoBorrador);
      toast.success(comoBorrador ? "Solicitud de Evento guardada como borrador." : "Solicitud de Evento enviada a aprobación.");
      setDatos(EVENTO_VACIO);
      setErrores({});
      onCreado?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar la Solicitud de Evento.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Nueva Solicitud de Evento</h1>
        <p className="text-sm text-muted-foreground">
          Cadena de aprobación: Gerente / Director de la Unidad de Negocio → Director Médico → Compliance Officer.
        </p>
      </div>

      <FormularioEvento
        valor={datos}
        onChange={setDatos}
        errores={errores}
        speakersDisponibles={speakers}
        productosDisponibles={productos}
        camposPersonalizadosDefinidos={campos}
        etiquetasCampo={etiquetas}
        empresaGrupo={empresaGrupo}
        pais={pais}
        onCancelar={() => {
          setDatos(EVENTO_VACIO);
          setErrores({});
          onCancelar?.();
        }}
      />

      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={enviando} onClick={() => guardar(true)}>
          Guardar como borrador
        </Button>
        <Button disabled={enviando} onClick={() => guardar(false)}>
          Enviar a aprobación
        </Button>
      </div>
    </div>
  );
}
