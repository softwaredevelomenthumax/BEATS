import * as React from "react";

/**
 * Fase 4 (precargado automático entre formularios) — helper compartido por
 * los `<Select>` de "documento de origen" (Evento/CAF/Speaker/Convenio) de
 * los 5 formularios que lo usan. Ver `src/lib/precargado.ts` para el
 * mapeo campo-a-campo de cada caso; este hook solo resuelve la mecánica
 * genérica de React que se repetiría igual en los 5 formularios:
 *
 *  1. Guarda el id elegido de inmediato (respuesta visual instantánea, sin
 *     esperar la consulta a Supabase).
 *  2. Trae el documento de origen completo y, cuando llega, fusiona los
 *     campos mapeados sobre el valor MÁS RECIENTE del formulario — no el
 *     que había en el momento del clic — para no perder ediciones hechas
 *     mientras la consulta todavía estaba en camino (se guarda en un
 *     `ref` que se actualiza en cada render, en vez de cerrar sobre
 *     `valor` directamente).
 *  3. Si el usuario cambia el origen otra vez antes de que la primera
 *     consulta responda, esa respuesta vieja se descarta (se compara el id
 *     todavía vigente contra el que originó la consulta) — evita que una
 *     respuesta fuera de orden pise la elección más reciente.
 *  4. Si la consulta falla (red, RLS, etc.), el id ya quedado guardado en
 *     el paso 1 no se deshace — el precargado es una comodidad, no un
 *     requisito, y el usuario siempre puede seguir llenando el resto del
 *     formulario a mano.
 */
/**
 * "Tareas Pendientes" → "diligenciar este documento" (ajuste de precisión,
 * septiembre 2026, pedido explícito): permite abrir uno de los 5
 * formularios de creación con el evento (y el speaker, cuando aplica) de
 * origen YA seleccionados, en vez de que el usuario tenga que volver a
 * buscarlos a mano. Reutiliza el mismo mecanismo de precargado que ya
 * dispara el `<Select>` de "Evento de origen"/"HCP" cuando el usuario elige
 * manualmente (`onCambiaEventoOrigen`/`onCambiaSpeaker` de cada
 * formulario) — solo lo dispara UNA vez al montar, y solo si se pidió un
 * valor inicial y el campo todavía está vacío (no pisa una edición en
 * curso si el componente se remonta por otro motivo).
 */
/**
 * Entrega 40 (octubre 2026) — «Tareas Pendientes» no precargaba el evento ni los datos del HCP.
 *
 * Causa: cada escritura del formulario hacía `onChange({ ...valorDeEsteRender, campo })`. Cuando dos
 * escrituras ocurren en el MISMO instante (p. ej. al abrir el formulario desde una tarea: «evento de origen»
 * y «HCP» se eligen a la vez) las dos parten del mismo `valor` ya viejo y la segunda borraba a la primera;
 * además la respuesta de la consulta del evento se descartaba porque su id ya no figuraba en el formulario.
 * `useValorReciente` mantiene el último valor escrito de forma SÍNCRONA, de modo que toda escritura
 * —inmediata o asíncrona— se fusiona sobre lo más reciente y nada se pisa.
 */
export function useValorReciente<Datos>(valor: Datos, onChange: (v: Datos) => void) {
  const valorRef = React.useRef(valor);
  valorRef.current = valor;
  function aplicar(parche: Partial<Datos>): Datos {
    const siguiente = { ...valorRef.current, ...parche };
    valorRef.current = siguiente;
    onChange(siguiente);
    return siguiente;
  }
  return { valorRef, aplicar };
}

/**
 * "Tareas Pendientes" → "diligenciar este documento" (ajuste de precisión,
 * septiembre 2026, pedido explícito): permite abrir uno de los formularios de
 * creación con el evento (y el speaker, cuando aplica) de origen YA
 * seleccionados, en vez de que el usuario tenga que volver a buscarlos a mano.
 * Reutiliza el mismo mecanismo de precargado que ya dispara el `<Select>` de
 * "Evento de origen"/"HCP" cuando el usuario elige manualmente
 * (`onCambiaEventoOrigen`/`onCambiaSpeaker` de cada formulario) — solo lo
 * dispara UNA vez al montar, y solo si se pidió un valor inicial y el campo
 * todavía está vacío (no pisa una edición en curso si el componente se
 * remonta por otro motivo).
 *
 * Entrega 40: `onSpeaker` recibe también el evento de origen (el del formulario
 * todavía no se ha actualizado cuando se llama, así que no se puede leer de ahí),
 * y si la tarea no trae speaker pero el evento tiene exactamente uno
 * (`speakerIdsDelEvento`), se elige solo cuando las opciones terminan de cargar.
 */
export function usePrecargaInicialOrigen(params: {
  eventoOrigenIdInicial?: string;
  speakerIdInicial?: string;
  eventoOrigenIdActual: string;
  speakerIdActual: string | null;
  onEventoOrigen: (id: string) => void;
  onSpeaker: (id: string, eventoOrigenId?: string) => void;
  /** Speakers vinculados al evento ya elegido (de las opciones del formulario); sirve para elegir el único. */
  speakerIdsDelEvento?: string[];
}) {
  const { eventoOrigenIdInicial, speakerIdInicial, eventoOrigenIdActual, speakerIdActual, onEventoOrigen, onSpeaker, speakerIdsDelEvento } = params;
  const yaAplicado = React.useRef(false);
  React.useEffect(() => {
    if (yaAplicado.current) return;
    yaAplicado.current = true;
    if (eventoOrigenIdInicial && !eventoOrigenIdActual) onEventoOrigen(eventoOrigenIdInicial);
    if (speakerIdInicial && !speakerIdActual) onSpeaker(speakerIdInicial, eventoOrigenIdInicial || eventoOrigenIdActual);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unicoResuelto = React.useRef(false);
  const claveSpeakers = (speakerIdsDelEvento ?? []).join("|");
  React.useEffect(() => {
    if (unicoResuelto.current || speakerIdInicial || !eventoOrigenIdInicial) return;
    if (eventoOrigenIdActual !== eventoOrigenIdInicial) return;
    if (speakerIdActual) {
      unicoResuelto.current = true;
      return;
    }
    if (speakerIdsDelEvento && speakerIdsDelEvento.length === 1) {
      unicoResuelto.current = true;
      onSpeaker(speakerIdsDelEvento[0], eventoOrigenIdInicial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventoOrigenIdActual, speakerIdActual, claveSpeakers]);
}

export function useSelectorConPrecargado<Datos>(valor: Datos, onChange: (v: Datos) => void) {
  const { valorRef, aplicar } = useValorReciente(valor, onChange);

  function alElegirOrigen<Origen>(
    clave: keyof Datos,
    id: string,
    traerOrigenPorId: (id: string) => Promise<Origen | null>,
    mapear: (origen: Origen) => Partial<Datos>,
  ) {
    aplicar({ [clave]: id } as unknown as Partial<Datos>);
    traerOrigenPorId(id)
      .then((origen) => {
        if (!origen) return;
        // El usuario ya eligió otro origen distinto mientras esta consulta
        // estaba en camino — esta respuesta llegó tarde, se descarta.
        if (valorRef.current[clave] !== id) return;
        aplicar(mapear(origen));
      })
      .catch(() => {
        /* el id ya quedó guardado; el precargado es best-effort */
      });
  }
  // Los formularios con lógica propia (CAF, Notificación de Pago) escriben sobre el MISMO valor reciente.
  return Object.assign(alElegirOrigen, { aplicar, valorRef });
}
