import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputPassword } from "@/components/ui/input-password";
import { Label } from "@/components/ui/label";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, ShieldAlert, Eye } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  traerDocumentosParaEliminacionAdmin,
  eliminarDocumentoSinRastroAdmin,
  ETIQUETA_TIPO_DOC,
  type DocumentoAdminResumen,
} from "@/lib/documentosAdmin";
import type { EstadoDoc, TipoDoc } from "@/lib/enums";
import { formatearFechaHora } from "@/lib/fecha";
import { EliminarAuditoriaRango } from "@/components/EliminarAuditoriaRango";
import { useAbrirDocumentoGenerico } from "@/hooks/useAbrirDocumentoGenerico";

const VARIANTE_POR_ESTADO: Record<EstadoDoc, BadgeProps["variant"]> = {
  Borrador: "draft",
  Pendiente: "pending",
  Aprobado: "approved",
  Rechazado: "rejected",
  Devuelto: "draft",
  Completado: "completed",
  Anulado: "cancelled",
};

/**
 * "Gestión avanzada de documentos" (antes "Eliminar Documentos Firmados" —
 * renombrada en octubre 2026, pedido explícito). Cada fila y el cuadro de
 * confirmación tienen un botón "Ver documento" que abre su vista de detalle
 * (la misma de Tablero/Historial, con "Ver / Imprimir / Exportar a PDF")
 * para confirmar visualmente que es el documento correcto ANTES de
 * eliminarlo.
 *
 * Corrección (octubre 2026), pedido explícito del usuario: "Genera un
 * formulario (al que pueda darse acceso solo para administradores, por
 * usuario), para ver y eliminar sin rastro, documentos que se hayan creado
 * por error, a pesar de estar firmados pero que no tengan información
 * relevante. El formulario debe mostrarlos y permitir, con un botón, que
 * se eliminen. Para esto, debe pedir confirmación con la contraseña del
 * usuario loggeado."
 *
 * Acceso: gestionado individualmente desde "Configuración de Usuarios/
 * Roles" (`usuario.puedeEliminarDocumentosFirmados`) — NO heredado de
 * `esAdministrador`. El guard de abajo es la última línea de defensa en
 * esta pantalla (la visibilidad en el menú ya la oculta por completo si no
 * se tiene el permiso, ver `paginaVisible` en `lib/navegacion.ts`), por si
 * alguien llegara aquí por otra vía.
 *
 * La eliminación en sí (`eliminarDocumentoSinRastroAdmin`, en
 * `lib/documentosAdmin.ts`) deliberadamente NO registra auditoría, tal
 * como se pidió — ver esa nota para el detalle completo.
 */
export function EliminarDocumentosFirmados() {
  const { usuario, verificarPasswordActual } = useAuth();
  const [documentos, setDocumentos] = React.useState<DocumentoAdminResumen[]>([]);
  const [cargando, setCargando] = React.useState(true);
  const [busqueda, setBusqueda] = React.useState("");
  const [filtroTipo, setFiltroTipo] = React.useState<TipoDoc | "todos">("todos");
  const [objetivo, setObjetivo] = React.useState<DocumentoAdminResumen | null>(null);
  const [password, setPassword] = React.useState("");
  const [procesando, setProcesando] = React.useState(false);

  function recargar() {
    setCargando(true);
    traerDocumentosParaEliminacionAdmin()
      .then(setDocumentos)
      .catch((e) => toast.error(e instanceof Error ? e.message : "No se pudieron cargar los documentos."))
      .finally(() => setCargando(false));
  }

  React.useEffect(recargar, []);

  // "Ver documento": reutiliza el mismo diálogo de detalle que el resto de la
  // app. Si desde ahí se anula o se edita algo, la lista se refresca.
  const { abrir: abrirDocumento, dialogos: dialogosDocumento } = useAbrirDocumentoGenerico(recargar);

  if (!usuario?.puedeEliminarDocumentosFirmados) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="h-5 w-5" /> Acceso restringido
          </CardTitle>
          <CardDescription>
            No tienes el permiso individual necesario para esta pantalla. Pídele a un Administrador que te lo otorgue
            desde "Configuración de Usuarios/Roles".
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const filtrados = documentos.filter((d) => {
    if (filtroTipo !== "todos" && d.tipoDoc !== filtroTipo) return false;
    if (busqueda.trim() && !d.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())) return false;
    return true;
  });

  function abrirConfirmacion(doc: DocumentoAdminResumen) {
    setObjetivo(doc);
    setPassword("");
  }

  async function confirmarEliminacion() {
    if (!objetivo) return;
    if (!password.trim()) {
      toast.error("Ingresa tu contraseña para confirmar.");
      return;
    }
    setProcesando(true);
    try {
      const passwordValida = await verificarPasswordActual(password);
      if (!passwordValida) {
        toast.error("Contraseña incorrecta.");
        return;
      }
      await eliminarDocumentoSinRastroAdmin(objetivo.tipoDoc, objetivo.id);
      toast.success("Documento eliminado sin rastro de auditoría.");
      setObjetivo(null);
      setPassword("");
      recargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar el documento.");
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="h-5 w-5" /> Gestión Avanzada de Documentos
          </CardTitle>
          <CardDescription>
            Permite revisar y eliminar cualquier documento (en cualquier estado posterior a Borrador, incluidos los
            ya firmados/Completados) sin dejar rastro en el registro de auditoría. Pensado para documentos creados
            por error. Usa "Ver documento" para confirmar visualmente que es el correcto. La eliminación es
            irreversible y pide tu contraseña como confirmación en cada caso.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Buscar por nombre..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="max-w-xs"
        />
        <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as TipoDoc | "todos")}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Tipo de documento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los tipos</SelectItem>
            {Object.entries(ETIQUETA_TIPO_DOC).map(([valor, etiqueta]) => (
              <SelectItem key={valor} value={valor}>
                {etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2 pt-6">
          {cargando && <p className="text-sm text-muted-foreground">Cargando documentos...</p>}
          {!cargando && filtrados.length === 0 && (
            <p className="text-sm text-muted-foreground">No hay documentos que coincidan con el filtro.</p>
          )}
          {filtrados.map((doc) => (
            <div
              key={`${doc.tipoDoc}-${doc.id}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{ETIQUETA_TIPO_DOC[doc.tipoDoc]}</Badge>
                  <Badge variant={VARIANTE_POR_ESTADO[doc.estado]}>{doc.estado}</Badge>
                </div>
                <p className="font-medium">{doc.nombre}</p>
                <p className="text-xs text-muted-foreground">Creado: {formatearFechaHora(doc.creadoEn)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => abrirDocumento(doc.documento)}>
                  <Eye className="h-4 w-4" /> Ver documento
                </Button>
                <Button variant="destructive" size="sm" onClick={() => abrirConfirmacion(doc)}>
                  <Trash2 className="h-4 w-4" /> Eliminar sin rastro
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!objetivo} onOpenChange={(v) => !v && setObjetivo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar eliminación sin rastro</DialogTitle>
            <DialogDescription>
              Vas a eliminar "{objetivo?.nombre}" ({objetivo && ETIQUETA_TIPO_DOC[objetivo.tipoDoc]}) de forma
              permanente, sin que quede registrado en el historial de auditoría. Ingresa tu contraseña para
              confirmar.
            </DialogDescription>
          </DialogHeader>
          {objetivo && (
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => abrirDocumento(objetivo.documento)}>
              <Eye className="h-4 w-4" /> Ver documento antes de confirmar
            </Button>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password-confirmacion">Tu contraseña</Label>
            <InputPassword
              id="password-confirmacion"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setObjetivo(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={procesando} onClick={confirmarEliminacion}>
              Confirmar eliminación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EliminarAuditoriaRango />

      {dialogosDocumento}
    </div>
  );
}
