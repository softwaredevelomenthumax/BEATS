/**
 * Fase 4 — Precargado automático entre formularios.
 *
 * Hasta antes de esta fase, los selectores de "documento de origen"
 * (`eventoOrigenId`, `cafId`, `speakerId`, `convenioOrigenId`) de los 6
 * formularios SOLO guardaban ese id — ningún dato del documento elegido se
 * copiaba a ningún otro campo, así que el usuario terminaba re-tecleando a
 * mano información que la app ya tenía en otro documento relacionado.
 *
 * Este archivo centraliza el mapeo campo-a-campo entre documentos: cada
 * función recibe el documento de origen ya cargado por completo (no el
 * `DocumentoResumen`/`SpeakerResumen` livianos que usan los `<Select>` para
 * listar opciones — esos no traen más que id/nombre) y devuelve un objeto
 * PARCIAL con únicamente los campos del formulario destino que se pueden
 * completar con certeza desde ese origen.
 *
 * Reglas de diseño (decisión explícita del usuario, sesión del
 * 2026-09-21):
 *  - El precargado es AUTOMÁTICO E INMEDIATO: se dispara apenas se elige el
 *    documento de origen, sin necesidad de un botón de confirmación.
 *  - SIEMPRE sobrescribe: si el usuario ya había escrito algo en un campo
 *    mapeado (a mano, o de un precargado anterior) y cambia el documento de
 *    origen, el campo se actualiza al valor del origen recién elegido, sin
 *    preguntar. Todo campo mapeado sigue siendo editable después de
 *    precargado — esto solo rellena un punto de partida.
 *
 * Regla de seguridad propia (no pedida explícitamente, pero necesaria para
 * no romper el formulario destino): un campo destino que es un `<Select>`
 * ligado a un catálogo cerrado (`useCatalogo(...)`) SOLO se mapea aquí si
 * el campo de origen usa ese MISMO catálogo — si no, un valor que no esté
 * en la lista de opciones del Select destino se guardaría en el estado
 * pero se vería como si no se hubiera precargado nada (Radix Select no
 * encuentra el <SelectItem> correspondiente y muestra el placeholder),
 * lo que además haría que la validación de "obligatorio" pase en falso
 * mientras el usuario ve el campo vacío. Cada función de abajo documenta,
 * en su propio comentario, qué campos del origen se dejaron fuera por esta
 * razón (y cuáles sí comparten catálogo y por eso sí se mapean).
 */
import { ubicacionTexto } from "@/lib/ubicacionVisible";
import type { Caf, Convenio, Evento, Speaker } from "@/types";
import { esMultisesion } from "@/lib/documentosRequeridosEvento";

/** Evento → CAF (dispara al elegir "Evento de origen" en Nuevo CAF). */
export function precargarDesdeEventoParaCaf(evento: Evento): { companiaNombre: string; terminoContratoInicio: string } {
  // companiaNombre (Select, catálogo "empresasGrupo") ← evento.empresaGrupo
  // (también Select, mismo catálogo "empresasGrupo") — comparten
  // vocabulario exacto, es seguro. El resto de los campos del CAF
  // (contraparte, montos, códigos de cobro) no tienen equivalente en
  // Evento — nadie los adivina, quedan para que el usuario los escriba.
  // Ronda de ajustes de formularios (septiembre 2026), entrega 7: "Término
  // del contrato – inicio" sí tiene un origen claro — fecha de inicio del
  // evento (Única sesión) o de la primera sesión (Varias sesiones),
  // pedido explícito.
  const inicio = esMultisesion(evento) ? evento.sesiones[0]?.fecha ?? evento.fechaInicioEvento : evento.fechaInicioEvento;
  return { companiaNombre: evento.empresaGrupo, terminoContratoInicio: inicio ?? "" };
}

/**
 * Convenio de Pago a HCP → CAF (dispara al elegir el HCP, una vez resuelto
 * el Convenio del mismo evento/speaker — ver `traerConvenioPorEventoYSpeaker`
 * en `lib/convenio.ts`). Cubre "Nombre/Número de documento/Dirección/País/
 * Estado/Ciudad de la contraparte", "Contacto en la contraparte" (mismo
 * nombre, editable después), "Objetivo del contrato" y "Moneda"/"Monto
 * total" — todos pedidos explícitamente como autocargados desde el
 * Convenio relacionado.
 */
export function precargarDesdeConvenioParaCaf(convenio: Convenio): {
  contraparteNombre: string;
  contraparteNumeroDocumento: string;
  contraparteDireccion: string;
  contrapartePais: string;
  contraparteEstadoProvincia: string;
  contraparteCiudad: string;
  contraparteContacto: string;
  objetoContrato: string;
  moneda: string;
  monto: number;
} {
  return {
    contraparteNombre: convenio.hcpNombreCompleto,
    contraparteNumeroDocumento: convenio.hcpNumeroDocumento,
    contraparteDireccion: convenio.hcpDireccion,
    contrapartePais: convenio.hcpPais,
    contraparteEstadoProvincia: convenio.hcpEstadoProvincia,
    contraparteCiudad: convenio.hcpCiudad,
    contraparteContacto: convenio.hcpNombreCompleto,
    objetoContrato: convenio.objetivo,
    moneda: convenio.monedaContraprestacion,
    monto: convenio.contraprestacionHCP ?? 0,
  };
}

/**
 * Speaker (repositorio) → CAF (dispara al elegir el HCP): "Teléfono"/
 * "Correo electrónico" de la contraparte vienen del Repositorio de
 * Speakers, no del Convenio (que no los tiene) — pedido explícito.
 */
export function precargarDesdeSpeakerParaCaf(speaker: Speaker): { contraparteTelefono: string; contraparteCorreo: string } {
  return { contraparteTelefono: speaker.telefono, contraparteCorreo: speaker.email };
}

/**
 * Speaker (repositorio) → CAF, RESPALDO (entrega 40): si no se encuentra el Convenio de Pago del mismo
 * evento+speaker (o la consulta falla), la identidad de la contraparte se completa desde la ficha del
 * speaker en vez de quedar vacía. Cuando SÍ hay convenio, sus valores tienen prioridad (ver `onCambiaSpeaker`
 * en `FormularioCAF.tsx`): estas claves solo se aplican si el convenio no las trajo.
 */
export function precargarContraparteDesdeSpeakerParaCaf(speaker: Speaker): {
  contraparteNombre: string;
  contraparteNumeroDocumento: string;
  contraparteDireccion: string;
  contrapartePais: string;
  contraparteEstadoProvincia: string;
  contraparteCiudad: string;
  contraparteContacto: string;
} {
  return {
    contraparteNombre: speaker.nombreCompleto,
    contraparteNumeroDocumento: speaker.numeroDocumento,
    contraparteDireccion: speaker.direccion,
    contrapartePais: speaker.pais,
    contraparteEstadoProvincia: speaker.estadoProvincia ?? "",
    contraparteCiudad: speaker.ciudad,
    contraparteContacto: speaker.nombreCompleto,
  };
}

/** Evento → Convenio de Pago a HCP (dispara al elegir "Evento de origen"). */
export function precargarDesdeEventoParaConvenio(evento: Evento): {
  nombreEventoServicio: string;
  fechaInicioActividad: string;
  fechaFinActividad: string;
  organizador: string;
  objetivo: string;
  lugarReunion: string;
} {
  // organizadoPor NO se mapea a propósito: en Convenio es un Select del
  // catálogo "organizadoPorConvenio", pero en Evento es texto libre — no
  // hay garantía de que el valor escrito coincida con una opción del
  // catálogo destino (ver nota de seguridad arriba).
  return {
    nombreEventoServicio: evento.nombreEvento,
    fechaInicioActividad: evento.fechaInicioEvento ?? "",
    fechaFinActividad: evento.fechaFinEvento ?? "",
    organizador: evento.nombreOrganizador,
    objetivo: evento.objetivosEvento,
    lugarReunion: lugarReunionDesdeEvento(evento),
  };
}

/**
 * "Lugar propuesto para la reunión" (Convenio de Pago a HCP), pedido
 * explícito: en "Única sesión" es dirección/ciudad/estado/país del
 * documento; en "Varias sesiones" repite una línea por sesión con el
 * mismo formato ("Sesión N — fecha — dirección, ciudad, estado, país").
 * Sigue siendo editable después de precargarse, como el resto del
 * mecanismo de precargado.
 */
function lugarReunionDesdeEvento(evento: Evento): string {
  const partes = (direccion: string, ciudad: string, estado: string, pais: string) =>
    ubicacionTexto([direccion, ciudad, estado, pais]);
  if (evento.modalidadSesiones === "Varias sesiones") {
    return evento.sesiones
      .map((s, i) => `Sesión ${i + 1} — ${s.fecha ?? "sin fecha"} — ${partes(s.lugar, s.ciudad, s.estadoProvincia, s.pais)}`)
      .join("\n");
  }
  return partes(evento.direccion, evento.ciudad, evento.estadoProvincia, evento.pais);
}

/** Speaker (repositorio) → Convenio de Pago a HCP (dispara al elegir "Speaker"). */
export function precargarDesdeSpeakerParaConvenio(speaker: Speaker): {
  hcpNombreCompleto: string;
  hcpNumeroDocumento: string;
  hcpEspecialidad: string;
  hcpDireccion: string;
  hcpPais: string;
  hcpEstadoProvincia: string;
  hcpCiudad: string;
  hcpCedulaLicencia: string;
} {
  return {
    hcpNombreCompleto: speaker.nombreCompleto,
    hcpNumeroDocumento: speaker.numeroDocumento,
    hcpEspecialidad: speaker.especialidad,
    hcpDireccion: speaker.direccion,
    hcpPais: speaker.pais,
    // Octubre 2026, pedido explícito: "Estado/Provincia/Departamento" se
    // precarga desde la ficha del speaker igual que país y ciudad.
    hcpEstadoProvincia: speaker.estadoProvincia ?? "",
    hcpCiudad: speaker.ciudad,
    // Entrega 28, pedido explícito: «Cédula / licencia» se carga SIEMPRE del
    // campo «Licencia RETHUS / Cédula profesional» del speaker (antes traía su
    // número de documento de identidad, que ya va en `hcpNumeroDocumento`).
    hcpCedulaLicencia: speaker.licenciaRethus ?? "",
  };
}

/**
 * Evento + Speaker → Convenio de Pago a HCP: "Contraprestación al HCP" se
 * autocarga desde los HONORARIOS que ese mismo speaker tiene en la Solicitud
 * de evento (`speakersParticipacion[].montoHonorarios`) — no desde la cuota de
 * inscripción (`montoInscripcion`, que es un concepto independiente) ni desde
 * el evento en general, porque cada speaker externo tiene su propio monto.
 * "Moneda de la contraprestación" se autocarga desde la moneda seleccionada
 * en la solicitud de evento (`Evento.moneda`, mismo catálogo "monedas").
 *
 * Octubre 2026, pedido explícito: antes la contraprestación salía de
 * `montoInscripcion` y la moneda no se precargaba. Se dispara al elegir
 * evento Y speaker (en cualquier orden), desde el componente (no desde
 * `usePrecargado`, porque depende de DOS selectores a la vez).
 */
export function precargarContraprestacionDesdeEventoYSpeaker(
  evento: Evento,
  speakerId: string,
): { contraprestacionHCP: number | null; monedaContraprestacion: string } {
  const sp = evento.speakersParticipacion.find((s) => s.speakerId === speakerId);
  return {
    contraprestacionHCP: sp?.montoHonorarios ?? null,
    monedaContraprestacion: evento.moneda ?? "",
  };
}

/**
 * Evento → Convenio de Pago a HCP: "Número total de HCP que participarán"
 * del Consejo de Asesores se autocarga desde
 * `Evento.numeroSpeakersExternos` (entrega 2 de esta ronda) — pedido
 * explícito, con la salvedad de que el campo sigue editable después
 * ("a criterio del solicitante del formulario").
 */
export function precargarNumeroHCPConsejoDesdeEvento(evento: Evento): { numeroHCPConsejo: number | null } {
  return { numeroHCPConsejo: evento.numeroSpeakersExternos };
}

/**
 * Evento → Convenio HCP (dispara al elegir la opción de "Evento de origen").
 *
 * Ronda de correcciones "Nuevo Convenio HCP" (septiembre 2026), pedido
 * explícito: "Nombre de la compañía" vuelve a precargarse desde el Evento —
 * específicamente desde "Empresa del grupo *" de la Solicitud de Evento
 * (revirtiendo el cambio de la ronda anterior, que lo tomaba del CAF). Sigue
 * siendo editable con el selector existente.
 */
export function precargarDesdeEventoParaConvenioHCP(evento: Evento): { companiaNombre: string } {
  // companiaNombre (Select, catálogo "empresasGrupo") ← evento.empresaGrupo
  // (también Select, mismo catálogo) — mismo vocabulario, seguro.
  return { companiaNombre: evento.empresaGrupo };
}

/**
 * CAF → Convenio HCP (se resuelve automáticamente al elegir la opción de
 * "Evento de origen" — ver `OpcionEventoOrigenConvenioHCP.cafId` en
 * `documentosRequeridosEvento.ts` — el selector "CAF asociado" ya no existe
 * en el formulario).
 *
 * Ronda de correcciones "Nuevo Convenio HCP" (septiembre 2026): "Nombre de
 * la compañía" y los 4 campos de identidad del consultor
 * (nombre/identificación/dirección/correo) dejan de venir de aquí — el
 * primero ahora viene del Evento (`precargarDesdeEventoParaConvenioHCP`) y
 * los segundos del Speaker relacionado con la solicitud del evento
 * (`precargarDesdeSpeakerParaConvenioHCP`). El CAF sigue aportando "Fecha
 * efectiva" y "Moneda"/"Compensación" (Anexo B), que no tienen otro origen
 * claro.
 */
export function precargarDesdeCafParaConvenioHCP(caf: Caf): {
  fechaEfectiva: string;
  moneda: string;
  compensacion: number;
} {
  // moneda (Select, catálogo "monedas") ← caf.moneda (también Select, mismo
  // catálogo) — seguro.
  return {
    fechaEfectiva: caf.terminoContratoInicio ?? "",
    moneda: caf.moneda,
    compensacion: caf.monto,
  };
}

/**
 * Speaker (repositorio) → Convenio HCP — se dispara al elegir la opción de
 * "Evento de origen" (que ya determina el speaker; el selector "Speaker
 * (opcional)" se retiró del formulario).
 *
 * Ronda de correcciones "Nuevo Convenio HCP" (septiembre 2026), pedido
 * explícito: la sección "Consultor" pasa a precargarse COMPLETA desde el
 * Speaker relacionado con la solicitud del evento (revirtiendo el cambio de
 * la ronda anterior, que tomaba nombre/identificación/dirección/correo del
 * CAF) — nombre ← Nombre del speaker; identificación ← Documento del
 * speaker; credenciales ← Profesión + Especialidad (sin cambios); correo
 * electrónico ← Correo electrónico del speaker; dirección ← Dirección,
 * Ciudad y País del speaker concatenados (la especificación no menciona
 * Estado/Provincia acá).
 */
export function precargarDesdeSpeakerParaConvenioHCP(speaker: Speaker): {
  consultorNombre: string;
  consultorIdentificacion: string;
  consultorCredenciales: string;
  consultorEmail: string;
  consultorDireccion: string;
} {
  return {
    consultorNombre: speaker.nombreCompleto,
    consultorIdentificacion: speaker.numeroDocumento,
    consultorCredenciales: [speaker.profesion, speaker.especialidad].filter((p) => p.trim()).join(" — "),
    consultorEmail: speaker.email,
    consultorDireccion: [speaker.direccion, speaker.ciudad, speaker.pais].filter(Boolean).join(", "),
  };
}

/**
 * Evento → FMV (dispara al elegir "Evento de origen"). Ronda de ajustes de
 * formularios (septiembre 2026), entrega 6: se agrega "fecha" (fecha de
 * inicio del evento, o de la primera sesión si es de Varias sesiones,
 * pedido explícito) — antes de esta entrega el FMV no tenía ningún
 * selector de Speaker propio, así que el Evento era la única fuente de
 * precargado; ahora que sí lo tiene (`precargarDesdeSpeakerParaFmv`), esta
 * función se limita a lo que solo el Evento puede dar.
 */
export function precargarDesdeEventoParaFmv(evento: Evento): { pais: string; ciudad: string; empresaGrupo: string; fecha: string } {
  // especialidad NO se mapea: es un Select del catálogo
  // "especialidadesMedicas" y Evento no tiene ningún campo de
  // especialidad médica equivalente.
  const fecha = esMultisesion(evento) ? evento.sesiones[0]?.fecha ?? evento.fechaInicioEvento ?? "" : evento.fechaInicioEvento ?? "";
  return {
    pais: evento.pais,
    ciudad: evento.ciudad,
    empresaGrupo: evento.empresaGrupo,
    fecha,
  };
}

/**
 * Speaker (repositorio) → FMV (dispara al elegir "Seleccionar HCP del
 * Repositorio de HCPs/Speakers"). Ronda de ajustes de formularios
 * (septiembre 2026), entrega 6: el FMV no tenía ningún selector de Speaker
 * hasta esta entrega — todos los datos del HCP se tecleaban a mano.
 * `especialidad` SÍ se mapea aquí (a diferencia de `precargarDesdeEventoParaFmv`)
 * porque el FMV usa el mismo catálogo "especialidadesMedicas" que ya
 * gobierna `Speaker.especialidad` en el Repositorio.
 */
export function precargarDesdeSpeakerParaFmv(speaker: Speaker): {
  nombreCompleto: string;
  numeroDocumento: string;
  especialidad: string;
  licenciaNacional: string;
  direccionPrincipal: string;
  pais: string;
  ciudad: string;
  estadoProvincia: string;
} {
  return {
    nombreCompleto: speaker.nombreCompleto,
    numeroDocumento: speaker.numeroDocumento,
    especialidad: speaker.especialidad,
    licenciaNacional: speaker.licenciaRethus,
    direccionPrincipal: speaker.direccion,
    pais: speaker.pais,
    ciudad: speaker.ciudad,
    estadoProvincia: speaker.estadoProvincia,
  };
}

/**
 * Evento → Notificación de Pago a HCP (dispara al elegir "Evento de
 * origen"). Usa el nombre del speaker que participó en el evento
 * (`nombreSpeakerParticipacion`) como valor inicial de mejor esfuerzo,
 * antes de que el usuario elija un HCP concreto con el selector de
 * Speaker (ronda de ajustes de formularios, septiembre 2026 —
 * `onCambiaSpeaker` en `FormularioNotificacionPago.tsx` pisa este valor
 * con datos exactos del HCP elegido).
 *
 * Entrega 40 (octubre 2026): además se precarga «Empresa del grupo» desde la
 * Solicitud de Evento (mismo catálogo «empresasGrupo», es seguro). Si el evento no trae
 * empresa no se toca la que ya tenía el formulario.
 */
export function precargarDesdeEventoParaNotificacionPago(evento: Evento): { nombreProfesionalSalud: string; empresaGrupo?: string } {
  return {
    nombreProfesionalSalud: evento.nombreSpeakerParticipacion,
    ...(evento.empresaGrupo ? { empresaGrupo: evento.empresaGrupo } : {}),
  };
}

/**
 * Evento → Notificación de Pago: «Productos». Entrega 40. Se arma con los productos del portafolio
 * vinculados a la solicitud (el principal primero), pero SOLO los que existen en el portafolio vigente
 * (`nombresPortafolio`): el campo se muestra como una lista de selects ligada a ese catálogo, y un nombre
 * que no esté ahí se guardaría sin verse (misma regla de seguridad de la cabecera de este archivo).
 * Devuelve `null` si no hay nada que precargar (no se pisa lo que el usuario ya eligió).
 */
export function precargarProductosDesdeEventoParaNotificacionPago(evento: Pick<Evento, "productosEvento">, nombresPortafolio: string[]): string | null {
  const permitidos = new Set(nombresPortafolio);
  const nombres = [...evento.productosEvento]
    .sort((a, b) => Number(b.principal) - Number(a.principal))
    .map((p) => p.nombreProducto)
    .filter((n, i, todos) => !!n && permitidos.has(n) && todos.indexOf(n) === i);
  return nombres.length > 0 ? nombres.join(", ") : null;
}

/**
 * Convenio de Pago a HCP → Notificación de Pago — dispara al elegir el HCP
 * del Repositorio de Speakers (mismo patrón que CAF: se resuelve el
 * Convenio del mismo evento+speaker y se precargan sus datos; ya no hay un
 * selector manual de "Convenio de origen", `convenioOrigenId` se guarda
 * solo para referencia interna). `numeroDocumentoIdentidad` es un campo
 * nuevo de esta ronda — ver
 * `db/agregar_numero_documento_identidad_notificacion_pago.sql`.
 */
export function precargarDesdeConvenioParaNotificacionPago(convenio: Convenio): {
  nombreProfesionalSalud: string;
  numeroDocumentoIdentidad: string;
  cedulaLicenciaProfesional: string;
  monedaFactura: string;
} {
  // monedaFactura (Select, catálogo "monedas") ← convenio.monedaContraprestacion
  // (también Select, mismo catálogo "monedas") — seguro.
  return {
    nombreProfesionalSalud: convenio.hcpNombreCompleto,
    numeroDocumentoIdentidad: convenio.hcpNumeroDocumento,
    cedulaLicenciaProfesional: convenio.hcpCedulaLicencia,
    monedaFactura: convenio.monedaContraprestacion,
  };
}

/**
 * Repositorio de Speakers → Notificación de Pago — noviembre 2026: es la
 * ÚNICA fuente de `cedulaLicenciaProfesional`: el campo «Licencia RETHUS /
 * Cédula profesional» del speaker (`licenciaRethus`). Ya no se toma del
 * Convenio de Pago, cuyo `hcpCedulaLicencia` trae el número de documento.
 */
export function precargarDesdeSpeakerParaNotificacionPago(speaker: Speaker): { cedulaLicenciaProfesional: string } {
  return { cedulaLicenciaProfesional: speaker.licenciaRethus };
}

/**
 * Identificación completa del HCP para la Notificación de Pago — entrega 40.
 *
 * Antes el nombre y el documento dependían SOLO de encontrar el Convenio de Pago (y la consulta del
 * convenio, si fallaba o se hacía antes de tener el evento, tumbaba también la cédula); desde una tarea
 * pendiente el convenio nunca se consultaba y solo llegaba la cédula. Ahora cada fuente es independiente:
 *  - nombre y documento de identidad: del Convenio de Pago del mismo evento+speaker (lo que se certifica
 *    «concuerda con el Convenio»); si no hay convenio, de la ficha del speaker;
 *  - cédula / licencia: SIEMPRE de la ficha del speaker («Licencia RETHUS / Cédula profesional»).
 * Devuelve `null` si no hay ninguna fuente (consulta fallida): en ese caso no se toca el formulario.
 * Con fuente, SIEMPRE sobrescribe los tres campos (si la fuente no trae un dato, queda vacío en vez de
 * conservar el de otro HCP elegido antes).
 */
export function precargarIdentificacionHcpParaNotificacionPago(
  convenio: Convenio | null,
  speaker: Speaker | null,
): { nombreProfesionalSalud: string; numeroDocumentoIdentidad: string; cedulaLicenciaProfesional?: string; convenioOrigenId: string } | null {
  if (!convenio && !speaker) return null;
  const primero = (...valores: Array<string | null | undefined>) => valores.map((v) => (v ?? "").trim()).find(Boolean) ?? "";
  return {
    nombreProfesionalSalud: primero(convenio?.hcpNombreCompleto, speaker?.nombreCompleto),
    numeroDocumentoIdentidad: primero(convenio?.hcpNumeroDocumento, speaker?.numeroDocumento),
    // Sin ficha del speaker (consulta fallida) no se toca la cédula: no se borra lo que ya hubiera.
    ...(speaker ? precargarDesdeSpeakerParaNotificacionPago(speaker) : {}),
    convenioOrigenId: convenio?.id ?? "",
  };
}
