import * as React from "react";
import { toast } from "sonner";
import { AlertTriangle, Bell, BellOff, Eye, History, Info, Lock, Mail, RotateCcw, Save, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useConfirmar } from "@/hooks/useConfirmar";
import { traerUsuarios } from "@/lib/usuarios";
import { ROL_USUARIO, ETIQUETA_ROL_USUARIO, rolSatisface } from "@/lib/enums";
import { formatearFechaHora } from "@/lib/fecha";
import { cn } from "@/lib/utils";
import type { Usuario } from "@/types";
import {
  CATALOGO_NOTIFICACIONES,
  ETIQUETA_GRUPO_NOTIFICACION,
  configIgual,
  configPorDefecto,
  enviarCorreoPrueba,
  guardarConfigNotificacion,
  renderizarAsunto,
  renderizarCuerpoHtml,
  renderizarMensaje,
  variablesParaMensaje,
  restablecerConfigNotificacion,
  traerConfigNotificaciones,
  traerHistorialConfigNotificacion,
  variablesDe,
  type CambioConfigNotificacion,
  type ConfigNotificacion,
  type DefinicionNotificacion,
  type GrupoNotificacion,
} from "@/lib/notificacionesConfig";

const ORDEN_GRUPOS: GrupoNotificacion[] = ["flujo", "tareas", "directos"];

/**
 * Entrega 29 — «Configuración de Notificaciones» (solo administradores con la página permitida).
 * Para cada tipo de aviso por correo: activarlo/desactivarlo, elegir a quién se le copia (roles y usuarios,
 * además de —o en lugar de— los administradores) y reconfigurar su asunto y mensaje con variables.
 * Los destinatarios «naturales» de cada aviso (p. ej. quien debe firmar la etapa) siguen la regla del flujo
 * y no se cambian aquí. La campanita dentro de la app no se afecta. Ver `db/entrega_29_configuracion_notificaciones.sql`.
 */
export function ConfiguracionNotificaciones() {
  const { usuario } = useAuth();
  const confirmar = useConfirmar();
  const [guardadas, setGuardadas] = React.useState<Map<string, ConfigNotificacion>>(new Map());
  const [usuarios, setUsuarios] = React.useState<Usuario[]>([]);
  const [cargando, setCargando] = React.useState(true);
  const [errorCarga, setErrorCarga] = React.useState<string | null>(null);
  const [seleccion, setSeleccion] = React.useState<string>(CATALOGO_NOTIFICACIONES[0]!.clave);
  const [borrador, setBorrador] = React.useState<ConfigNotificacion>(configPorDefecto(CATALOGO_NOTIFICACIONES[0]!.clave));
  const [guardando, setGuardando] = React.useState(false);
  const [busquedaUsuario, setBusquedaUsuario] = React.useState("");
  const [historial, setHistorial] = React.useState<CambioConfigNotificacion[]>([]);
  const [pestana, setPestana] = React.useState("destinatarios");
  const refAsunto = React.useRef<HTMLInputElement | null>(null);
  const refCuerpo = React.useRef<HTMLTextAreaElement | null>(null);
  const refMensaje = React.useRef<HTMLTextAreaElement | null>(null);
  const ultimoCampo = React.useRef<"asunto" | "cuerpo" | "mensaje">("cuerpo");

  const def = CATALOGO_NOTIFICACIONES.find((d) => d.clave === seleccion)!;
  const guardada = guardadas.get(seleccion) ?? configPorDefecto(seleccion);
  const hayCambios = !configIgual(borrador, guardada);

  const recargar = React.useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const [config, lista] = await Promise.all([traerConfigNotificaciones(), traerUsuarios().catch(() => [] as Usuario[])]);
      setGuardadas(config);
      setUsuarios(lista);
    } catch (e) {
      setErrorCarga(e instanceof Error ? e.message : "No se pudo cargar la configuración.");
    } finally {
      setCargando(false);
    }
  }, []);
  React.useEffect(() => {
    void recargar();
  }, [recargar]);

  // Al cambiar de aviso (o al recargar) el borrador parte de lo guardado.
  React.useEffect(() => {
    setBorrador(guardadas.get(seleccion) ?? configPorDefecto(seleccion));
    setBusquedaUsuario("");
    void traerHistorialConfigNotificacion(seleccion).then(setHistorial).catch(() => setHistorial([]));
  }, [seleccion, guardadas]);

  const usuariosActivos = React.useMemo(() => usuarios.filter((u) => u.activo && u.email), [usuarios]);
  const nombrePorId = React.useMemo(() => new Map(usuarios.map((u) => [u.id, u.nombre])), [usuarios]);

  async function cambiarSeleccion(clave: string) {
    if (clave === seleccion) return;
    if (hayCambios && !(await confirmar({ titulo: "Cambios sin guardar", mensaje: "Tienes cambios sin guardar en este aviso. ¿Descartarlos?", textoConfirmar: "Descartar" }))) return;
    setSeleccion(clave);
  }

  if (!usuario?.esAdministrador) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" /> Esta ventana es exclusiva para administradores.
        </CardContent>
      </Card>
    );
  }

  function insertarVariable(clave: string) {
    const token = `{{${clave}}}`;
    if (ultimoCampo.current === "asunto" && refAsunto.current) {
      const el = refAsunto.current;
      const ini = el.selectionStart ?? el.value.length;
      const fin = el.selectionEnd ?? ini;
      const base = borrador.asuntoPlantilla ?? def.asuntoPorDefecto;
      const nuevo = base.slice(0, ini) + token + base.slice(fin);
      setBorrador({ ...borrador, asuntoPlantilla: nuevo });
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(ini + token.length, ini + token.length); });
    } else if (ultimoCampo.current === "mensaje" && refMensaje.current) {
      // Octubre 2026: la variable se inserta dentro de la redacción propia de {{mensaje}}.
      const el = refMensaje.current;
      const ini = el.selectionStart ?? el.value.length;
      const fin = el.selectionEnd ?? ini;
      const base = borrador.mensajePlantilla ?? "";
      const nuevo = base.slice(0, ini) + token + base.slice(fin);
      setBorrador({ ...borrador, mensajePlantilla: nuevo });
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(ini + token.length, ini + token.length); });
    } else if (refCuerpo.current) {
      const el = refCuerpo.current;
      const ini = el.selectionStart ?? el.value.length;
      const fin = el.selectionEnd ?? ini;
      const base = borrador.cuerpoPlantilla ?? def.cuerpoPorDefecto;
      const nuevo = base.slice(0, ini) + token + base.slice(fin);
      setBorrador({ ...borrador, cuerpoPlantilla: nuevo });
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(ini + token.length, ini + token.length); });
    }
  }

  async function guardar() {
    setGuardando(true);
    try {
      await guardarConfigNotificacion(borrador);
      toast.success("Configuración guardada. Aplica a los próximos correos.");
      await recargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la configuración.");
    } finally {
      setGuardando(false);
    }
  }

  async function restablecerAviso() {
    if (!(await confirmar({ titulo: "Restablecer aviso", mensaje: `¿Volver «${def.nombre}» a su comportamiento por defecto (activo, copia a administradores, asunto y mensaje originales)?`, textoConfirmar: "Restablecer" }))) return;
    setGuardando(true);
    try {
      await restablecerConfigNotificacion(seleccion);
      toast.success("Aviso restablecido a los valores por defecto.");
      await recargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo restablecer.");
    } finally {
      setGuardando(false);
    }
  }

  const asuntoEfectivo = borrador.asuntoPlantilla ?? def.asuntoPorDefecto;
  const cuerpoEfectivo = borrador.cuerpoPlantilla ?? def.cuerpoPorDefecto;
  // Octubre 2026: si hay redacción propia de {{mensaje}}, la vista previa la usa en lugar del texto de ejemplo.
  const mensajePropio = borrador.mensajePlantilla && borrador.mensajePlantilla.trim() ? borrador.mensajePlantilla : null;
  const varsVista = mensajePropio ? { ...def.ejemplo, mensaje: renderizarMensaje(mensajePropio, def.ejemplo) } : def.ejemplo;
  const asuntoVista = renderizarAsunto(asuntoEfectivo, varsVista);
  const cuerpoVista = renderizarCuerpoHtml(cuerpoEfectivo, varsVista);

  async function probar() {
    if (!usuario) return;
    try {
      await enviarCorreoPrueba(usuario.email, asuntoVista, cuerpoVista);
      toast.success(`Correo de prueba enviado a ${usuario.email}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo enviar la prueba.");
    }
  }

  const totalCopias = (() => {
    const ids = new Set<string>(borrador.ccUsuarios);
    for (const u of usuariosActivos) if (borrador.ccRoles.some((r) => rolSatisface(u.rol, r))) ids.add(u.id);
    return ids.size;
  })();

  const usuariosFiltrados = usuariosActivos.filter((u) => {
    const q = busquedaUsuario.trim().toLowerCase();
    return !q || u.nombre.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.cargo.toLowerCase().includes(q);
  });

  function alternarLista(lista: string[], valor: string): string[] {
    return lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
  }

  function estadoAviso(d: DefinicionNotificacion): { texto: string; variante: "approved" | "draft" | "pending" } {
    if (!d.configurable) return { texto: "Directo (BD)", variante: "draft" };
    const c = guardadas.get(d.clave);
    if (c && !c.activo) return { texto: "Apagado", variante: "draft" };
    if (c && (c.asuntoPlantilla || c.cuerpoPlantilla || c.mensajePlantilla || c.ccRoles.length || c.ccUsuarios.length || !c.copiarAdministradores)) return { texto: "Personalizado", variante: "pending" };
    return { texto: "Por defecto", variante: "approved" };
  }

  return (
    <div className="flex flex-col gap-4" data-testid="config-notificaciones">
      <Card>
        <CardContent className="flex flex-wrap items-start gap-3 py-4 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="min-w-0 flex-1">
            Aquí se decide <strong className="text-foreground">qué avisos salen por correo</strong>, <strong className="text-foreground">a quién se le copia</strong> y
            <strong className="text-foreground"> qué dice cada mensaje</strong>. El destinatario principal de cada aviso lo define el flujo de aprobación (p. ej. quien debe firmar la
            etapa) y no se modifica. Apagar un correo no apaga la campanita dentro de BEATS. Los cambios aplican a los correos siguientes.
          </p>
        </CardContent>
      </Card>

      {errorCarga && (
        <Card className="border-destructive/40">
          <CardContent className="flex items-start gap-2 py-4 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {errorCarga}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Lista de avisos */}
        <Card className="h-fit">
          <CardContent className="flex flex-col gap-4 p-3">
            {cargando && <p className="px-2 py-1 text-sm text-muted-foreground">Cargando…</p>}
            {ORDEN_GRUPOS.map((grupo) => (
              <div key={grupo} className="flex flex-col gap-1">
                <p className="px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{ETIQUETA_GRUPO_NOTIFICACION[grupo]}</p>
                {CATALOGO_NOTIFICACIONES.filter((d) => d.grupo === grupo).map((d) => {
                  const est = estadoAviso(d);
                  const activo = d.clave === seleccion;
                  return (
                    <button
                      key={d.clave}
                      type="button"
                      data-testid={`aviso-${d.clave}`}
                      onClick={() => void cambiarSeleccion(d.clave)}
                      className={cn(
                        "flex flex-col gap-1 rounded-lg border px-3 py-2 text-left transition-colors",
                        activo ? "border-primary bg-accent" : "border-transparent hover:bg-muted",
                      )}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium leading-snug">{d.nombre}</span>
                        {!d.configurable ? <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : guardadas.get(d.clave)?.activo === false ? <BellOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />}
                      </span>
                      <Badge variant={est.variante} className="w-fit px-2 py-0 text-[10px]">{est.texto}</Badge>
                    </button>
                  );
                })}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Editor */}
        <Card className="min-w-0">
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-lg">{def.nombre}</CardTitle>
                <CardDescription className="mt-1">{def.cuando}</CardDescription>
              </div>
              {def.configurable && (
                <label className="flex shrink-0 items-center gap-2 text-sm font-medium">
                  <Switch
                    checked={borrador.activo}
                    onCheckedChange={(v) => setBorrador({ ...borrador, activo: v })}
                    data-testid="aviso-activo"
                    aria-label="Enviar este aviso por correo"
                  />
                  {borrador.activo ? "Se envía por correo" : "No se envía por correo"}
                </label>
              )}
            </div>
            <div className="grid gap-2 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-2">
              <p><span className="font-semibold">Llega a: </span>{def.destinatarios}</p>
              <p><span className="font-semibold">Regla del flujo: </span>{def.regla}</p>
            </div>
          </CardHeader>

          <CardContent>
            {!def.configurable ? (
              <div className="flex items-start gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium text-foreground">Todavía no configurable desde aquí</p>
                  <p className="mt-1">{def.motivoNoConfigurable}</p>
                </div>
              </div>
            ) : (
              <Tabs value={pestana} onValueChange={setPestana}>
                <TabsList>
                  <TabsTrigger value="destinatarios"><Users className="h-4 w-4" /> Copias (a quién más)</TabsTrigger>
                  <TabsTrigger value="mensaje"><Mail className="h-4 w-4" /> Asunto y mensaje</TabsTrigger>
                  <TabsTrigger value="historial"><History className="h-4 w-4" /> Historial</TabsTrigger>
                </TabsList>

                <TabsContent value="destinatarios" className="flex flex-col gap-5">
                  <label className="flex items-start gap-3 rounded-lg border p-3">
                    <Switch checked={borrador.copiarAdministradores} onCheckedChange={(v) => setBorrador({ ...borrador, copiarAdministradores: v })} data-testid="aviso-copia-admin" className="mt-0.5" />
                    <span className="text-sm">
                      <span className="font-medium">Copiar a los administradores</span>
                      <span className="block text-muted-foreground">Es lo que hace BEATS hoy en todos los correos (copia a la cuenta administradora). Apágalo si no quieres esa copia en este aviso.</span>
                    </span>
                  </label>

                  <div className="flex flex-col gap-2">
                    <Label>Con copia a todos los usuarios activos con el rol…</Label>
                    <div className="grid gap-x-4 gap-y-1.5 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-3">
                      {ROL_USUARIO.map((rol) => {
                        const n = usuariosActivos.filter((u) => rolSatisface(u.rol, rol)).length;
                        return (
                          <label key={rol} className="flex items-center gap-2 text-sm">
                            <Checkbox checked={borrador.ccRoles.includes(rol)} onCheckedChange={() => setBorrador({ ...borrador, ccRoles: alternarLista(borrador.ccRoles, rol) })} />
                            <span className="flex-1">{ETIQUETA_ROL_USUARIO[rol]}</span>
                            <span className="text-xs text-muted-foreground">{n}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label>Con copia a estas personas</Label>
                    <Input sinMayusculas placeholder="Buscar por nombre, cargo o correo…" value={busquedaUsuario} onChange={(e) => setBusquedaUsuario(e.target.value)} />
                    <div className="max-h-56 overflow-y-auto rounded-md border">
                      {usuariosFiltrados.length === 0 ? (
                        <p className="p-3 text-sm text-muted-foreground">Sin resultados.</p>
                      ) : (
                        usuariosFiltrados.map((u) => (
                          <label key={u.id} className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-muted/50">
                            <Checkbox checked={borrador.ccUsuarios.includes(u.id)} onCheckedChange={() => setBorrador({ ...borrador, ccUsuarios: alternarLista(borrador.ccUsuarios, u.id) })} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{u.nombre}</span>
                              <span className="block truncate text-xs text-muted-foreground">{u.cargo || ETIQUETA_ROL_USUARIO[u.rol]} · {u.email}</span>
                            </span>
                            <Badge variant="outline" className="shrink-0 text-[10px]">{ETIQUETA_ROL_USUARIO[u.rol]}</Badge>
                          </label>
                        ))
                      )}
                    </div>
                    {borrador.ccUsuarios.some((id) => !usuariosActivos.some((u) => u.id === id)) && (
                      <p className="text-xs text-amber-700">Hay personas seleccionadas que ya no están activas o no tienen correo; no recibirán copia.</p>
                    )}
                  </div>

                  <p className="text-sm text-muted-foreground">
                    {totalCopias === 0 ? "Sin copias adicionales a roles o personas." : `${totalCopias} persona${totalCopias === 1 ? "" : "s"} recibirán copia (más los administradores si está activado).`}
                    {" "}Quien ya es destinatario principal no se repite en copia.
                  </p>
                </TabsContent>

                <TabsContent value="mensaje" className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="asunto-plantilla">Asunto</Label>
                    <Input sinMayusculas
                      id="asunto-plantilla"
                      ref={refAsunto}
                      value={asuntoEfectivo}
                      onFocus={() => (ultimoCampo.current = "asunto")}
                      onChange={(e) => setBorrador({ ...borrador, asuntoPlantilla: e.target.value })}
                      data-testid="aviso-asunto"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="cuerpo-plantilla">Cuerpo del correo</Label>
                    <Textarea sinMayusculas
                      id="cuerpo-plantilla"
                      ref={refCuerpo}
                      rows={9}
                      value={cuerpoEfectivo}
                      onFocus={() => (ultimoCampo.current = "cuerpo")}
                      onChange={(e) => setBorrador({ ...borrador, cuerpoPlantilla: e.target.value })}
                      data-testid="aviso-cuerpo"
                    />
                    <p className="text-xs text-muted-foreground">Texto plano: una línea en blanco separa párrafos. {"{{enlace}}"} pone el botón para abrir el documento.</p>
                  </div>

                  {/* Octubre 2026: {{mensaje}} editable. */}
                  <div className="flex flex-col gap-1.5 rounded-lg border border-dashed p-3">
                    <Label htmlFor="mensaje-plantilla">Redacción de {"{{mensaje}}"} (opcional)</Label>
                    <Textarea sinMayusculas
                      id="mensaje-plantilla"
                      ref={refMensaje}
                      rows={4}
                      value={borrador.mensajePlantilla ?? ""}
                      placeholder={`Vacío = BEATS arma el texto, p. ej.: ${def.ejemplo.mensaje ?? ""}`}
                      onFocus={() => (ultimoCampo.current = "mensaje")}
                      onChange={(e) => setBorrador({ ...borrador, mensajePlantilla: e.target.value })}
                      data-testid="aviso-mensaje-plantilla"
                    />
                    <p className="text-xs text-muted-foreground">
                      Reemplaza el texto que BEATS arma para {"{{mensaje}}"}. Puedes combinarlo con las demás variables
                      ({variablesParaMensaje(def).map((v) => `{{${v.clave}}}`).join(", ")}) para que el correo quede coherente. Déjalo vacío para conservar el texto original.
                    </p>
                    <div>
                      <Button type="button" variant="secondary" size="sm" onClick={() => setBorrador({ ...borrador, mensajePlantilla: def.ejemplo.mensaje ?? "" })}>
                        Partir del texto de ejemplo
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label>Variables (clic para insertar donde está el cursor)</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {variablesDe(def).map((v) => (
                        <button
                          key={v.clave}
                          type="button"
                          title={v.siempre ? v.descripcion : `${v.descripcion} — queda vacía si el aviso lo crea la base de datos`}
                          onClick={() => insertarVariable(v.clave)}
                          className={cn("rounded-full border px-2.5 py-1 font-mono text-xs transition-colors hover:bg-accent", !v.siempre && "border-dashed")}
                        >
                          {`{{${v.clave}}}`}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">Las variables con borde punteado solo se llenan cuando el aviso lo crea la aplicación; si lo crea la base de datos quedan vacías.</p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label className="flex items-center gap-1.5"><Eye className="h-4 w-4" /> Vista previa (con datos de ejemplo)</Label>
                    <div className="overflow-hidden rounded-lg border bg-white text-slate-800 shadow-sm">
                      <div className="border-b bg-slate-50 px-4 py-2 text-sm"><span className="text-slate-500">Asunto: </span><strong>{asuntoVista || "(vacío)"}</strong></div>
                      <div className="px-4 py-3 text-sm leading-relaxed [&_p]:my-2" data-testid="aviso-vista-previa" dangerouslySetInnerHTML={{ __html: cuerpoVista }} />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={() => setBorrador({ ...borrador, asuntoPlantilla: null, cuerpoPlantilla: null, mensajePlantilla: null })}>
                      <RotateCcw /> Volver a la plantilla por defecto
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => void probar()}>
                      <Send /> Enviarme una prueba
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="historial">
                  {guardada.actualizadoEn && (
                    <p className="mb-3 text-sm text-muted-foreground">
                      Última modificación: {formatearFechaHora(guardada.actualizadoEn)}
                      {guardada.actualizadoPorId && nombrePorId.get(guardada.actualizadoPorId) ? ` por ${nombrePorId.get(guardada.actualizadoPorId)}` : ""}.
                    </p>
                  )}
                  {historial.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Este aviso nunca se ha personalizado.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {historial.map((h) => (
                        <li key={h.id} className="rounded-lg border p-3 text-sm">
                          <p className="font-medium">
                            {formatearFechaHora(h.cambiadoEn)} · {h.cambiadoPorId ? nombrePorId.get(h.cambiadoPorId) ?? "Administrador" : "Administrador"}
                          </p>
                          <p className="text-muted-foreground">{resumirCambio(h)}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>

          {def.configurable && (
            <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 rounded-b-xl border-t bg-card px-6 py-3">
              <p className="text-xs text-muted-foreground">{hayCambios ? "Tienes cambios sin guardar." : "Sin cambios pendientes."}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={guardando || !guardadas.has(seleccion)} onClick={() => void restablecerAviso()}>
                  <RotateCcw /> Restablecer aviso
                </Button>
                <Button type="button" variant="secondary" size="sm" disabled={guardando || !hayCambios} onClick={() => setBorrador(guardada)}>
                  Descartar cambios
                </Button>
                <Button type="button" size="sm" disabled={guardando || !hayCambios} onClick={() => void guardar()} data-testid="aviso-guardar">
                  <Save /> {guardando ? "Guardando…" : "Guardar"}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function resumirCambio(h: CambioConfigNotificacion): string {
  const a = h.antes ?? {};
  const d = h.despues ?? {};
  if (!h.antes) return "Primera personalización de este aviso.";
  const partes: string[] = [];
  if (a.activo !== d.activo) partes.push(d.activo === false ? "se apagó el correo" : "se encendió el correo");
  if (a.copiar_administradores !== d.copiar_administradores) partes.push(d.copiar_administradores === false ? "se quitó la copia a administradores" : "se activó la copia a administradores");
  if (JSON.stringify(a.cc_roles) !== JSON.stringify(d.cc_roles) || JSON.stringify(a.cc_usuarios) !== JSON.stringify(d.cc_usuarios)) partes.push("cambiaron las copias");
  if (a.asunto_plantilla !== d.asunto_plantilla) partes.push("cambió el asunto");
  if (a.cuerpo_plantilla !== d.cuerpo_plantilla) partes.push("cambió el mensaje");
  if ((a.mensaje_plantilla ?? null) !== (d.mensaje_plantilla ?? null)) partes.push("cambió la redacción de {{mensaje}}");
  return partes.length ? partes.join("; ").replace(/^./, (c) => c.toUpperCase()) + "." : "Guardado sin cambios de contenido.";
}
