import * as React from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, DatabaseBackup, FolderOpen, HardDriveDownload, History, Loader2, RotateCcw, ShieldCheck, TimerReset, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { EVENTO_BACKUP_ACTUALIZADO } from "@/hooks/useBackupProgramado";
import { formatearFechaHora } from "@/lib/fecha";
import { mensajeErrorAmigable } from "@/lib/supabaseClient";
import {
  ETIQUETA_UNIDAD,
  PROGRAMACION_VACIA,
  calcularProxima,
  crearBackup,
  ejecutarRutina,
  elegirCarpeta,
  formatearBytes,
  guardarProgramacion,
  leerProgramacion,
  navegadorPuedeElegirCarpeta,
  permisoEscritura,
  registrarEnHistorial,
  restaurarBackup,
  textoDestino,
  tieneCompresion,
  traerHistorial,
  verificarArchivo,
  type CarpetaDestino,
  type DestinoBackup,
  type FilaHistorialBackup,
  type ModoRestauracion,
  type Programacion,
  type ProgresoBackup,
  type ProgresoRestauracion,
  type ResultadoBackup,
  type ResultadoRestauracion,
  type ResumenArchivo,
  type UnidadIntervalo,
} from "@/lib/backup/api";

const n = (x: number) => x.toLocaleString("es-CO");

function Aviso({ tono, children, testId }: { tono: "info" | "alerta" | "peligro" | "ok"; children: React.ReactNode; testId?: string }) {
  const estilos = {
    info: "border-border bg-accent/40 text-foreground",
    alerta: "border-amber-500/50 bg-amber-500/10 text-foreground",
    peligro: "border-destructive/50 bg-destructive/10 text-foreground",
    ok: "border-emerald-600/40 bg-emerald-600/10 text-foreground",
  }[tono];
  return (
    <div className={`rounded-md border p-3 text-sm ${estilos}`} data-testid={testId}>
      {children}
    </div>
  );
}

function Barra({ valor, total, texto }: { valor: number; total: number; texto: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((valor / total) * 100)) : 0;
  return (
    <div className="flex flex-col gap-1.5" data-testid="backup-progreso">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="truncate">{texto}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function textoProgresoBackup(p: ProgresoBackup): string {
  if (p.fase === "esquema") return "Leyendo la estructura de la base…";
  if (p.fase === "cierre") return "Cerrando el archivo y calculando el sello…";
  return `Tabla ${p.tablaNumero}/${p.totalTablas} — ${p.tabla} · ${n(p.filasLeidas)} de ${n(p.filasTotales)} filas`;
}

function textoProgresoRestauracion(p: ProgresoRestauracion): string {
  switch (p.fase) {
    case "preparando":
      return "Preparando la restauración…";
    case "vaciando":
      return "Vaciando las tablas actuales…";
    case "secuencias":
      return "Ajustando los contadores automáticos…";
    case "comprobando":
      return "Comprobando que los conteos coincidan con la copia…";
    default:
      return `Cargando ${p.tabla} · ${n(p.filasCargadas)} de ${n(p.filasTotales)} filas`;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Selector de destino (compartido por «Crear copia» y por la copia de seguridad previa a restaurar)
// ---------------------------------------------------------------------------------------------------------------------

type TipoDestino = "descarga" | "carpeta";

function useDestino() {
  const [tipo, setTipo] = React.useState<TipoDestino>("descarga");
  const [carpeta, setCarpeta] = React.useState<CarpetaDestino | null>(null);
  const puedeCarpeta = navegadorPuedeElegirCarpeta();

  async function elegir() {
    try {
      const c = await elegirCarpeta();
      if (c) {
        setCarpeta(c);
        setTipo("carpeta");
      }
    } catch (error) {
      toast.error(mensajeErrorAmigable(error));
    }
  }

  async function resolver(): Promise<DestinoBackup | null> {
    if (tipo === "descarga") return { tipo: "descarga" };
    if (!carpeta) {
      toast.error("Elige primero la carpeta donde se guardará la copia.");
      return null;
    }
    if (!(await permisoEscritura(carpeta, true))) {
      toast.error("No se concedió el acceso de escritura a la carpeta.");
      return null;
    }
    return { tipo: "carpeta", carpeta };
  }

  return { tipo, setTipo, carpeta, puedeCarpeta, elegir, resolver };
}

function SelectorDestino({ destino, idPrefijo }: { destino: ReturnType<typeof useDestino>; idPrefijo: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${idPrefijo}-destino`}>Dónde guardar la copia</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={destino.tipo} onValueChange={(v) => destino.setTipo(v as TipoDestino)}>
          <SelectTrigger id={`${idPrefijo}-destino`} className="w-80" data-testid={`${idPrefijo}-destino`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="descarga">Descargar en este equipo (carpeta de descargas)</SelectItem>
            <SelectItem value="carpeta" disabled={!destino.puedeCarpeta}>
              Una carpeta del equipo o de la red
            </SelectItem>
          </SelectContent>
        </Select>
        {destino.puedeCarpeta && (
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void destino.elegir()} data-testid={`${idPrefijo}-elegir-carpeta`}>
            <FolderOpen className="size-4" /> {destino.carpeta ? "Cambiar carpeta…" : "Elegir carpeta…"}
          </Button>
        )}
        {destino.tipo === "carpeta" && destino.carpeta && <Badge variant="secondary">«{destino.carpeta.name}»</Badge>}
      </div>
      {!destino.puedeCarpeta && (
        <p className="text-xs text-muted-foreground">Este navegador solo permite descargar el archivo. Para guardar en una carpeta o en la red usa Chrome o Edge.</p>
      )}
      {destino.tipo === "carpeta" && destino.puedeCarpeta && (
        <p className="text-xs text-muted-foreground">
          Para una unidad de red, elige la carpeta compartida desde su letra de unidad (o su ruta \\servidor\recurso). Elige una subcarpeta propia: el navegador no deja usar carpetas del sistema ni la raíz de una unidad.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Pestaña: crear copia
// ---------------------------------------------------------------------------------------------------------------------

function PestanaCrear({ usuario, alTerminar }: { usuario: { id: string; nombre: string }; alTerminar: () => void }) {
  const destino = useDestino();
  const [progreso, setProgreso] = React.useState<ProgresoBackup | null>(null);
  const [trabajando, setTrabajando] = React.useState(false);
  const [resultado, setResultado] = React.useState<ResultadoBackup | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const control = React.useRef<AbortController | null>(null);

  async function crear() {
    const d = await destino.resolver();
    if (!d) return;
    setTrabajando(true);
    setResultado(null);
    setError(null);
    control.current = new AbortController();
    try {
      const r = await crearBackup({ destino: d, origen: "manual", usuario, alProgreso: setProgreso, senal: control.current.signal });
      setResultado(r);
      toast.success("Backup creado");
      await registrarEnHistorial({ origen: "manual", estado: "ok", nombreArchivo: r.nombreArchivo, destino: r.destinoTexto, tablas: r.tablas, filas: r.filas, bytes: r.bytes, mensaje: null });
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      setError(mensaje);
      await registrarEnHistorial({ origen: "manual", estado: "error", nombreArchivo: null, destino: textoDestino(d), tablas: null, filas: null, bytes: null, mensaje });
    } finally {
      setTrabajando(false);
      setProgreso(null);
      control.current = null;
      alTerminar();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Crear un backup ahora</CardTitle>
          <CardDescription>
            Copia TODAS las tablas de la base de datos (documentos, aprobaciones, usuarios, catálogos, auditoría y los archivos adjuntos) en un único archivo
            {tieneCompresion() ? " comprimido (.gz)" : ""}, con un sello de integridad para poder restaurarlo después con seguridad.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SelectorDestino destino={destino} idPrefijo="bk" />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void crear()} disabled={trabajando} className="gap-1.5" data-testid="bk-crear">
              {trabajando ? <Loader2 className="size-4 animate-spin" /> : <HardDriveDownload className="size-4" />}
              {trabajando ? "Creando backup…" : "Crear backup ahora"}
            </Button>
            {trabajando && (
              <Button variant="ghost" size="sm" onClick={() => control.current?.abort()}>
                Cancelar
              </Button>
            )}
          </div>
          {progreso && <Barra valor={progreso.filasLeidas} total={progreso.filasTotales} texto={textoProgresoBackup(progreso)} />}
          {error && (
            <Aviso tono="peligro" testId="bk-error">
              <p className="flex items-center gap-1.5 font-medium"><XCircle className="size-4" /> No se pudo crear el backup</p>
              <p className="mt-1">{error}</p>
            </Aviso>
          )}
          {resultado && (
            <Aviso tono="ok" testId="bk-resultado">
              <p className="flex items-center gap-1.5 font-medium"><CheckCircle2 className="size-4" /> Backup creado</p>
              <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                <div><dt className="inline text-muted-foreground">Archivo: </dt><dd className="inline font-mono text-xs" data-testid="bk-nombre">{resultado.nombreArchivo}</dd></div>
                <div><dt className="inline text-muted-foreground">Guardado en: </dt><dd className="inline">{resultado.destinoTexto}</dd></div>
                <div><dt className="inline text-muted-foreground">Tamaño: </dt><dd className="inline">{formatearBytes(resultado.bytes)}</dd></div>
                <div><dt className="inline text-muted-foreground">Contenido: </dt><dd className="inline">{n(resultado.tablas)} tablas · {n(resultado.filas)} filas</dd></div>
                <div><dt className="inline text-muted-foreground">Sello: </dt><dd className="inline font-mono text-xs">{resultado.sello.slice(0, 16)}…</dd></div>
              </dl>
              {resultado.avisos.length > 0 && (
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Había actividad mientras se copiaba ({resultado.avisos.length} tabla(s) cambiaron de tamaño)</summary>
                  <ul className="mt-1 list-disc pl-5">{resultado.avisos.map((a) => <li key={a}>{a}</li>)}</ul>
                </details>
              )}
            </Aviso>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Pestaña: restaurar
// ---------------------------------------------------------------------------------------------------------------------

const MODOS: { valor: ModoRestauracion; titulo: string; texto: string }[] = [
  { valor: "completar", titulo: "Completar lo que falta", texto: "Agrega las filas de la copia que no existen hoy. No modifica ni borra nada de lo que ya está. Es el modo más seguro." },
  { valor: "sobrescribir", titulo: "Sobrescribir lo existente", texto: "Agrega lo que falta y devuelve al valor de la copia las filas que ya existen (mismo identificador). No borra las filas creadas después de la copia." },
  { valor: "reemplazar", titulo: "Reemplazar todo (dejar la base como estaba)", texto: "VACÍA todas las tablas y carga la copia: la base queda exactamente como cuando se creó el backup. Se pierde todo lo que se hizo después." },
];

function PestanaRestaurar({ usuario, alTerminar }: { usuario: { id: string; nombre: string }; alTerminar: () => void }) {
  const destinoSeguridad = useDestino();
  const [archivo, setArchivo] = React.useState<File | null>(null);
  const [verificando, setVerificando] = React.useState(false);
  const [resumen, setResumen] = React.useState<ResumenArchivo | null>(null);
  const [modo, setModo] = React.useState<ModoRestauracion>("completar");
  const [entiendo, setEntiendo] = React.useState(false);
  const [palabra, setPalabra] = React.useState("");
  const [progresoSeg, setProgresoSeg] = React.useState<ProgresoBackup | null>(null);
  const [progreso, setProgreso] = React.useState<ProgresoRestauracion | null>(null);
  const [trabajando, setTrabajando] = React.useState(false);
  const [resultado, setResultado] = React.useState<ResultadoRestauracion | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [leidas, setLeidas] = React.useState(0);

  async function alElegirArchivo(f: File | null) {
    setArchivo(f);
    setResumen(null);
    setResultado(null);
    setError(null);
    setEntiendo(false);
    setPalabra("");
    if (!f) return;
    setVerificando(true);
    setLeidas(0);
    try {
      setResumen(await verificarArchivo(f, usuario.id, setLeidas));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setVerificando(false);
    }
  }

  const destructivo = modo === "reemplazar";
  const hacePrevia = modo !== "completar";
  const bloqueoAdmin = destructivo && resumen?.incluyeAlAdministrador === false;
  const confirmado = !destructivo || (entiendo && palabra.trim().toUpperCase() === "RESTAURAR");
  const puede = !!archivo && !!resumen?.valido && !trabajando && confirmado && !bloqueoAdmin;

  async function restaurar() {
    if (!archivo || !resumen) return;
    setError(null);
    setResultado(null);
    let dSeg: DestinoBackup | null = null;
    if (hacePrevia) {
      dSeg = await destinoSeguridad.resolver();
      if (!dSeg) return;
    }
    setTrabajando(true);
    try {
      if (dSeg) {
        // Antes de tocar nada se guarda una copia del estado actual: si la restauración sale mal, se vuelve atrás con ella.
        const previa = await crearBackup({ destino: dSeg, origen: "seguridad", usuario, alProgreso: setProgresoSeg });
        setProgresoSeg(null);
        toast.success(`Copia de seguridad previa guardada: ${previa.nombreArchivo}`);
        await registrarEnHistorial({ origen: "seguridad", estado: "ok", nombreArchivo: previa.nombreArchivo, destino: previa.destinoTexto, tablas: previa.tablas, filas: previa.filas, bytes: previa.bytes, mensaje: "Antes de restaurar" });
      }
      const r = await restaurarBackup(archivo, { modo, resumen, alProgreso: setProgreso });
      setResultado(r);
      if (r.coincide) toast.success("Restauración completada y verificada");
      else toast.warning("Restauración terminada, pero algunos conteos no coinciden");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await registrarEnHistorial({ origen: "restauracion", estado: "error", nombreArchivo: archivo.name, destino: `Modo: ${modo}`, tablas: null, filas: null, bytes: null, mensaje: e instanceof Error ? e.message : String(e) });
    } finally {
      setTrabajando(false);
      setProgreso(null);
      setProgresoSeg(null);
      alTerminar();
    }
  }

  const c = resumen?.cabecera;
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Restaurar desde un backup</CardTitle>
          <CardDescription>Elige un archivo creado por BEATS. Antes de tocar la base se comprueba que esté completo y sin alteraciones.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rs-archivo">Archivo de backup (.ndjson o .ndjson.gz)</Label>
            <input
              id="rs-archivo"
              data-testid="rs-archivo"
              type="file"
              accept=".gz,.ndjson,application/gzip"
              disabled={trabajando}
              className="block w-full max-w-xl text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
              onChange={(e) => void alElegirArchivo(e.target.files?.[0] ?? null)}
            />
          </div>

          {verificando && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="rs-verificando">
              <Loader2 className="size-4 animate-spin" /> Verificando el archivo… {n(leidas)} filas revisadas
            </p>
          )}

          {resumen && !resumen.valido && (
            <Aviso tono="peligro" testId="rs-invalido">
              <p className="flex items-center gap-1.5 font-medium"><XCircle className="size-4" /> Este archivo no se puede restaurar</p>
              <ul className="mt-1 list-disc pl-5">{resumen.errores.map((e) => <li key={e}>{e}</li>)}</ul>
            </Aviso>
          )}

          {resumen?.valido && c && resumen.manifiesto && (
            <Aviso tono="ok" testId="rs-valido">
              <p className="flex items-center gap-1.5 font-medium"><ShieldCheck className="size-4" /> Archivo verificado: completo y sin alteraciones</p>
              <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                <div><dt className="inline text-muted-foreground">Creado: </dt><dd className="inline">{formatearFechaHora(c.creadoEn)}{c.creadoPor ? ` · ${c.creadoPor.nombre}` : ""}</dd></div>
                <div><dt className="inline text-muted-foreground">Versión de BEATS: </dt><dd className="inline">{c.versionApp}</dd></div>
                <div><dt className="inline text-muted-foreground">Proyecto de origen: </dt><dd className="inline font-mono text-xs">{c.proyecto}</dd></div>
                <div><dt className="inline text-muted-foreground">Contenido: </dt><dd className="inline">{n(resumen.manifiesto.tablas.length)} tablas · {n(resumen.manifiesto.totalFilas)} filas</dd></div>
                <div><dt className="inline text-muted-foreground">Tamaño del archivo: </dt><dd className="inline">{archivo ? formatearBytes(archivo.size) : "—"}</dd></div>
                <div><dt className="inline text-muted-foreground">Tipo: </dt><dd className="inline">{c.origen === "programado" ? "Programado" : c.origen === "seguridad" ? "De seguridad (previo a restaurar)" : "Manual"}</dd></div>
              </dl>
            </Aviso>
          )}
          {resumen?.advertencias.map((a) => (
            <Aviso key={a} tono="alerta">{a}</Aviso>
          ))}

          {resumen?.valido && (
            <>
              <fieldset className="flex flex-col gap-2" disabled={trabajando}>
                <legend className="mb-1 text-sm font-medium">Cómo restaurar</legend>
                {MODOS.map((m) => (
                  <label key={m.valor} className={`flex cursor-pointer items-start gap-2.5 rounded-md border p-3 text-sm ${modo === m.valor ? "border-primary bg-primary/5" : ""}`}>
                    <input type="radio" name="modo-restauracion" className="mt-1" checked={modo === m.valor} onChange={() => { setModo(m.valor); setEntiendo(false); setPalabra(""); }} data-testid={`rs-modo-${m.valor}`} />
                    <span>
                      <span className="font-medium">{m.titulo}</span>
                      <span className="block text-xs text-muted-foreground">{m.texto}</span>
                    </span>
                  </label>
                ))}
              </fieldset>

              {hacePrevia && (
                <div className="flex flex-col gap-2 rounded-md border p-3">
                  <p className="text-sm font-medium">Copia de seguridad previa (obligatoria en este modo)</p>
                  <p className="text-xs text-muted-foreground">Antes de modificar la base se guarda una copia de cómo está ahora, para poder volver atrás si algo sale mal.</p>
                  <SelectorDestino destino={destinoSeguridad} idPrefijo="rs-seg" />
                  {progresoSeg && <Barra valor={progresoSeg.filasLeidas} total={progresoSeg.filasTotales} texto={`Copia previa: ${textoProgresoBackup(progresoSeg)}`} />}
                </div>
              )}

              {destructivo && (
                <Aviso tono="peligro" testId="rs-peligro">
                  <p className="flex items-center gap-1.5 font-medium"><AlertTriangle className="size-4" /> Esto borra los datos actuales</p>
                  <ul className="mt-1 list-disc pl-5 text-xs">
                    <li>Todo lo creado o modificado después de {c ? formatearFechaHora(c.creadoEn) : "la copia"} se perderá (queda en la copia de seguridad previa).</li>
                    <li>Nadie debe estar usando BEATS mientras dura la restauración.</li>
                    <li>Los usuarios y sus permisos vuelven a ser los de la copia. {bloqueoAdmin ? "" : "Tu usuario sí figura como administrador en ella."}</li>
                  </ul>
                  {bloqueoAdmin && <p className="mt-2 font-medium">Tu usuario NO figura como administrador en esta copia: si la restauraras perderías el acceso a esta pantalla. Está bloqueado.</p>}
                  {!bloqueoAdmin && (
                    <div className="mt-3 flex flex-col gap-2">
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox checked={entiendo} onCheckedChange={(v) => setEntiendo(v === true)} data-testid="rs-entiendo" />
                        Entiendo que se perderá lo posterior a la copia.
                      </label>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="rs-palabra" className="text-sm">Escribe RESTAURAR para confirmar:</Label>
                        <Input id="rs-palabra" className="h-8 w-40" value={palabra} onChange={(e) => setPalabra(e.target.value)} data-testid="rs-palabra" autoComplete="off" />
                      </div>
                    </div>
                  )}
                </Aviso>
              )}

              <div>
                <Button onClick={() => void restaurar()} disabled={!puede} variant={destructivo ? "destructive" : "default"} className="gap-1.5" data-testid="rs-restaurar">
                  {trabajando ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                  {trabajando ? "Restaurando…" : "Restaurar"}
                </Button>
              </div>
            </>
          )}

          {progreso && <Barra valor={progreso.filasCargadas} total={progreso.filasTotales} texto={textoProgresoRestauracion(progreso)} />}

          {error && (
            <Aviso tono="peligro" testId="rs-error">
              <p className="flex items-center gap-1.5 font-medium"><XCircle className="size-4" /> La restauración no terminó</p>
              <p className="mt-1">{error}</p>
            </Aviso>
          )}

          {resultado && (
            <Aviso tono={resultado.coincide ? "ok" : "alerta"} testId="rs-resultado">
              <p className="flex items-center gap-1.5 font-medium">
                {resultado.coincide ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
                {resultado.coincide ? "Restauración completada: los conteos coinciden con la copia" : "Restauración terminada, pero hay tablas que no coinciden"}
              </p>
              <p className="mt-1">{n(resultado.tablas)} tablas · {n(resultado.filasProcesadas)} filas procesadas · {n(resultado.filasEscritas)} escritas.</p>
              {resultado.omitidas.length > 0 && <p className="mt-1 text-xs">Tablas de la copia que ya no existen en la base y se omitieron: {resultado.omitidas.join(", ")}.</p>}
              {!resultado.coincide && (
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {resultado.comprobacion.filter((x) => !x.ok).map((x) => <li key={x.tabla}>{x.tabla}: la copia trae {n(x.esperadas)} y hoy hay {n(x.actuales)}.</li>)}
                </ul>
              )}
              {hacePrevia && <p className="mt-2 text-xs text-muted-foreground">Recarga la página para que BEATS lea los datos restaurados.</p>}
            </Aviso>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Pestaña: programación
// ---------------------------------------------------------------------------------------------------------------------

function PestanaProgramacion({ usuario }: { usuario: { id: string; nombre: string } }) {
  const [prog, setProg] = React.useState<Programacion | null>(null);
  const [cargando, setCargando] = React.useState(true);
  const [guardando, setGuardando] = React.useState(false);
  const [corriendo, setCorriendo] = React.useState(false);
  const [progreso, setProgreso] = React.useState<ProgresoBackup | null>(null);
  const puedeCarpeta = navegadorPuedeElegirCarpeta();

  const recargar = React.useCallback(async () => {
    const p = (await leerProgramacion(usuario.id)) ?? PROGRAMACION_VACIA(usuario.id);
    setProg(p);
    setCargando(false);
  }, [usuario.id]);

  React.useEffect(() => {
    void recargar();
    window.addEventListener(EVENTO_BACKUP_ACTUALIZADO, recargar);
    return () => window.removeEventListener(EVENTO_BACKUP_ACTUALIZADO, recargar);
  }, [recargar]);

  if (cargando || !prog) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  const cambiar = (parcial: Partial<Programacion>) => setProg({ ...prog, ...parcial });

  async function elegir() {
    try {
      const c = await elegirCarpeta();
      if (c) cambiar({ carpeta: c, carpetaNombre: c.name });
    } catch (error) {
      toast.error(mensajeErrorAmigable(error));
    }
  }

  async function guardar() {
    if (!prog) return;
    if (prog.activa && !prog.carpeta) {
      toast.error("Elige la carpeta donde se guardarán las copias programadas.");
      return;
    }
    if (!Number.isFinite(prog.cada) || prog.cada < 1) {
      toast.error("Indica cada cuánto se repite (mínimo 1).");
      return;
    }
    if (prog.activa && prog.carpeta && !(await permisoEscritura(prog.carpeta, true))) {
      toast.error("No se concedió el acceso de escritura a la carpeta.");
      return;
    }
    setGuardando(true);
    try {
      const siguiente: Programacion = {
        ...prog,
        cada: Math.round(prog.cada),
        conservar: Math.max(0, Math.round(prog.conservar || 0)),
        proximaEjecucion: prog.activa ? calcularProxima(new Date(), prog) : null,
        ultimoEstado: prog.activa ? prog.ultimoEstado : null,
      };
      await guardarProgramacion(siguiente);
      setProg(siguiente);
      toast.success(siguiente.activa ? "Programación guardada" : "Programación desactivada");
    } catch (error) {
      toast.error(mensajeErrorAmigable(error));
    } finally {
      setGuardando(false);
    }
  }

  async function ejecutarAhora() {
    setCorriendo(true);
    try {
      const r = await ejecutarRutina(usuario, { forzar: true, solicitarPermiso: true, alProgreso: setProgreso });
      if (r.tipo === "ok") toast.success("Backup programado completado", { description: r.resultado.nombreArchivo });
      else if (r.tipo === "error") toast.error("Falló el backup", { description: r.mensaje });
      else if (r.tipo === "sin_permiso") toast.error("No se concedió el acceso a la carpeta.");
      else toast.info("Primero guarda la programación con una carpeta de destino.");
      await recargar();
    } finally {
      setCorriendo(false);
      setProgreso(null);
    }
  }

  const estado = prog.ultimoEstado;
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><TimerReset className="size-4" /> Rutina automática de backup</CardTitle>
          <CardDescription>Crea un backup cada cierto tiempo y lo guarda en la carpeta que elijas, sin intervención.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!puedeCarpeta && <Aviso tono="alerta">Este navegador no permite guardar en una carpeta, así que no se pueden programar rutinas. Abre BEATS en Chrome o Edge.</Aviso>}

          <label className="flex items-center gap-3 text-sm">
            <Switch checked={prog.activa} onCheckedChange={(v) => cambiar({ activa: v })} disabled={!puedeCarpeta} data-testid="pg-activa" />
            <span className="font-medium">{prog.activa ? "Rutina activa" : "Rutina desactivada"}</span>
          </label>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pg-cada">Repetir cada</Label>
              <Input id="pg-cada" type="number" min={1} className="h-9 w-24" value={prog.cada} onChange={(e) => cambiar({ cada: Number(e.target.value) })} data-testid="pg-cada" disabled={!puedeCarpeta} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pg-unidad">Unidad</Label>
              <Select value={prog.unidad} onValueChange={(v) => cambiar({ unidad: v as UnidadIntervalo })} disabled={!puedeCarpeta}>
                <SelectTrigger id="pg-unidad" className="h-9 w-36" data-testid="pg-unidad"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ETIQUETA_UNIDAD) as UnidadIntervalo[]).map((u) => <SelectItem key={u} value={u}>{ETIQUETA_UNIDAD[u]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pg-conservar">Conservar las últimas</Label>
              <div className="flex items-center gap-2">
                <Input id="pg-conservar" type="number" min={0} className="h-9 w-24" value={prog.conservar} onChange={(e) => cambiar({ conservar: Number(e.target.value) })} data-testid="pg-conservar" disabled={!puedeCarpeta} />
                <span className="text-xs text-muted-foreground">copias (0 = no borrar nunca)</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Carpeta de destino (del equipo o de la red)</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void elegir()} disabled={!puedeCarpeta} data-testid="pg-elegir-carpeta">
                <FolderOpen className="size-4" /> {prog.carpeta ? "Cambiar carpeta…" : "Elegir carpeta…"}
              </Button>
              {prog.carpeta ? <Badge variant="secondary" data-testid="pg-carpeta">«{prog.carpetaNombre}»</Badge> : <span className="text-xs text-muted-foreground">Ninguna elegida</span>}
            </div>
            <p className="text-xs text-muted-foreground">
              Solo se borran las copias programadas antiguas (las que llevan «_programado» en el nombre); nunca las manuales ni otros archivos de la carpeta.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void guardar()} disabled={guardando || !puedeCarpeta} data-testid="pg-guardar">{guardando ? "Guardando…" : "Guardar programación"}</Button>
            <Button variant="outline" onClick={() => void ejecutarAhora()} disabled={corriendo || !prog.carpeta || !puedeCarpeta} data-testid="pg-ejecutar">
              {corriendo ? "Ejecutando…" : "Ejecutar ahora"}
            </Button>
          </div>
          {progreso && <Barra valor={progreso.filasLeidas} total={progreso.filasTotales} texto={textoProgresoBackup(progreso)} />}

          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 rounded-md border p-3 text-sm sm:grid-cols-3" data-testid="pg-estado">
            <div><dt className="text-xs text-muted-foreground">Última ejecución</dt><dd>{prog.ultimaEjecucion ? formatearFechaHora(prog.ultimaEjecucion) : "—"}</dd></div>
            <div>
              <dt className="text-xs text-muted-foreground">Resultado</dt>
              <dd className="break-words">
                {estado === "ok" && <span className="text-emerald-700 dark:text-emerald-400">Correcta</span>}
                {estado === "error" && <span className="text-destructive">Con error</span>}
                {estado === "sin_permiso" && <span className="text-amber-700 dark:text-amber-400">Esperando autorización de la carpeta</span>}
                {!estado && "—"}
                {prog.ultimoMensaje && <span className="block text-xs text-muted-foreground">{prog.ultimoMensaje}</span>}
              </dd>
            </div>
            <div><dt className="text-xs text-muted-foreground">Próxima ejecución</dt><dd>{prog.activa && prog.proximaEjecucion ? formatearFechaHora(prog.proximaEjecucion) : "—"}</dd></div>
          </dl>

          <Aviso tono="info">
            <p className="font-medium">Cómo funciona</p>
            <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
              <li>La rutina corre <b>mientras BEATS esté abierto</b> en este equipo y con tu sesión iniciada. Si está cerrado a la hora prevista, corre al abrirlo (una sola copia, sin acumular).</li>
              <li>La programación queda guardada en este navegador y en este equipo, igual que el permiso sobre la carpeta. Si usas BEATS en otro equipo, prográmala allí también.</li>
              <li>Al reiniciar el navegador, Chrome/Edge pueden pedir que autorices de nuevo la carpeta: aparecerá un aviso con el botón «Autorizar y ejecutar».</li>
              <li>El intervalo mínimo es de 1 hora. Una copia lee toda la base; con mucha información conviene programarla fuera del horario de trabajo.</li>
            </ul>
          </Aviso>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Pestaña: historial
// ---------------------------------------------------------------------------------------------------------------------

const ETIQUETA_ORIGEN: Record<FilaHistorialBackup["origen"], string> = {
  manual: "Manual",
  programado: "Programado",
  seguridad: "De seguridad",
  restauracion: "Restauración",
};

function PestanaHistorial({ version }: { version: number }) {
  const [filas, setFilas] = React.useState<FilaHistorialBackup[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const cargar = React.useCallback(() => {
    traerHistorial(50)
      .then((f) => {
        setFilas(f);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  React.useEffect(cargar, [cargar, version]);
  React.useEffect(() => {
    window.addEventListener(EVENTO_BACKUP_ACTUALIZADO, cargar);
    return () => window.removeEventListener(EVENTO_BACKUP_ACTUALIZADO, cargar);
  }, [cargar]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><History className="size-4" /> Historial de backups y restauraciones</CardTitle>
        <CardDescription>Las últimas 50 operaciones hechas desde BEATS por cualquier administrador.</CardDescription>
      </CardHeader>
      <CardContent>
        {error && <Aviso tono="peligro">{error}</Aviso>}
        {!error && filas === null && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {filas && filas.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Todavía no hay operaciones registradas.</p>}
        {filas && filas.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="bk-historial">
              <thead>
                <tr className="border-b text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Fecha</th><th className="pr-3">Tipo</th><th className="pr-3">Resultado</th><th className="pr-3">Archivo / destino</th><th className="pr-3">Contenido</th><th>Por</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id} className="border-b align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">{formatearFechaHora(f.creado_en)}</td>
                    <td className="pr-3">{ETIQUETA_ORIGEN[f.origen] ?? f.origen}</td>
                    <td className="pr-3">{f.estado === "ok" ? <Badge variant="approved">Correcto</Badge> : <Badge variant="rejected">Error</Badge>}</td>
                    <td className="pr-3 text-xs">
                      {f.nombre_archivo && <span className="block font-mono">{f.nombre_archivo}</span>}
                      {f.destino && <span className="block text-muted-foreground">{f.destino}</span>}
                      {f.mensaje && <span className="block text-muted-foreground">{f.mensaje}</span>}
                    </td>
                    <td className="pr-3 text-xs whitespace-nowrap">{f.total_filas != null ? `${n(Number(f.total_filas))} filas` : "—"}{f.tamano_bytes != null ? ` · ${formatearBytes(Number(f.tamano_bytes))}` : ""}</td>
                    <td className="text-xs">{f.creado_por_nombre ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Entrega 35 — «Configuración → Backup» (solo Administradores de alcance completo). Ver `lib/backup/` y `db/entrega_35_backup.sql`.
 */
export function Backup() {
  const { usuario } = useAuth();
  const [pestana, setPestana] = React.useState("crear");
  const [versionHistorial, setVersionHistorial] = React.useState(0);

  if (!usuario || !usuario.esAdministrador || usuario.administradorAlcanceLimitado) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Backup</h1>
        <p className="text-sm text-muted-foreground">Solo los Administradores de alcance completo pueden crear o restaurar copias de seguridad de toda la base de datos.</p>
      </div>
    );
  }
  const yo = { id: usuario.id, nombre: usuario.nombre };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><DatabaseBackup className="size-6" /> Backup</h1>
        <p className="text-sm text-muted-foreground">
          Crea una copia de toda la base de datos, restáurala cuando la necesites y programa copias automáticas.
        </p>
      </div>

      <Aviso tono="info" testId="bk-alcance">
        <p className="font-medium">Qué incluye una copia</p>
        <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
          <li><b>Sí:</b> todas las tablas de datos de BEATS (solicitudes, convenios, FMV, CAF, notificaciones de pago, aprobaciones, speakers, usuarios y permisos, catálogos, configuración, plantilla legal, auditoría, telemetría) y los <b>archivos adjuntos</b> (firmas, fotos, soportes, facturas), que BEATS guarda dentro de la base.</li>
          <li><b>No:</b> las cuentas de acceso de Supabase Auth (contraseñas y sesiones), el código y los secretos de las funciones de correo, ni la definición de funciones, permisos (RLS) y triggers de la base: eso se reconstruye con los archivos <code>db/*.sql</code> del proyecto. Para la parte de la plataforma, conserva también los respaldos propios de Supabase.</li>
        </ul>
      </Aviso>

      <Tabs value={pestana} onValueChange={setPestana}>
        <TabsList>
          <TabsTrigger value="crear" data-testid="bk-tab-crear">Crear backup</TabsTrigger>
          <TabsTrigger value="restaurar" data-testid="bk-tab-restaurar">Restaurar</TabsTrigger>
          <TabsTrigger value="programacion" data-testid="bk-tab-programacion">Programación</TabsTrigger>
          <TabsTrigger value="historial" data-testid="bk-tab-historial">Historial</TabsTrigger>
        </TabsList>
        <TabsContent value="crear"><PestanaCrear usuario={yo} alTerminar={() => setVersionHistorial((v) => v + 1)} /></TabsContent>
        <TabsContent value="restaurar"><PestanaRestaurar usuario={yo} alTerminar={() => setVersionHistorial((v) => v + 1)} /></TabsContent>
        <TabsContent value="programacion"><PestanaProgramacion usuario={yo} /></TabsContent>
        <TabsContent value="historial"><PestanaHistorial version={versionHistorial} /></TabsContent>
      </Tabs>
    </div>
  );
}
