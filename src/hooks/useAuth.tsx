import * as React from "react";
import { Telemetria } from "@/lib/telemetria";
import { toast } from "sonner";
import { supabase, mensajeErrorAmigable } from "@/lib/supabaseClient";
import { rowToFlat, flatToRow, t, s0, b, type FieldSpec } from "@/lib/dbMapping";
import type { Usuario } from "@/types";

export const CAMPOS_USUARIO: FieldSpec[] = [
  t("id"),
  t("nombre"),
  t("cargo"),
  t("email"),
  t("rol"),
  t("iniciales"),
  s0("firma_id", "firmaId"),
  { key: "fotoId", column: "foto_id", toFlat: (v) => (v ? String(v) : null), toRow: (v) => (v ? v : null) }, // Entrega 33 (`db/entrega_33_foto_usuario.sql`); columna ausente → null.
  b("debe_cambiar_password", "debeCambiarPassword"),
  s0("auth_user_id", "authUserId"),
  t("telefono"),
  { key: "paginasPermitidas", column: "paginas_permitidas", toFlat: (v) => (Array.isArray(v) ? v : []), toRow: (v) => v },
  { key: "empresasGrupo", column: "empresas_grupo", toFlat: (v) => (Array.isArray(v) ? v : []), toRow: (v) => v },
  { key: "paisesOperacion", column: "paises_operacion", toFlat: (v) => (Array.isArray(v) ? v : []), toRow: (v) => v },
  b("es_administrador", "esAdministrador"),
  b("administrador_alcance_limitado", "administradorAlcanceLimitado"),
  // Entrega 23 (octubre 2026): Área, director de área, jefe inmediato y Compliance Officer LATAM
  // (`db/entrega_23b_*.sql`). Si la migración todavía no se aplicó, las columnas faltan y
  // estos campos quedan en su valor vacío/falso.
  t("area"),
  b("es_director_area", "esDirectorArea"),
  b("firma_como_director_area", "firmaComoDirectorArea"),
  s0("jefe_inmediato_id", "jefeInmediatoId"),
  b("firma_como_jefe_inmediato", "firmaComoJefeInmediato"),
  b("firma_como_compliance_latam", "firmaComoComplianceLatam"),
  // Entrega 28: preferencia de archivado (`db/entrega_28_preferencias_usuario.sql`). Columna ausente → null.
  { key: "archivarDocumentosMeses", column: "archivar_documentos_meses", toFlat: (v) => (typeof v === "number" ? v : null), toRow: (v) => v },
  b("puede_eliminar_documentos_firmados", "puedeEliminarDocumentosFirmados"),
  t("numero_documento", "numeroDocumento"),
  t("pais"),
  t("estado_provincia", "estadoProvincia"),
  t("ciudad"),
  t("observaciones"),
  { key: "estadoUsuario", column: "estado_usuario", toFlat: (v) => ((v as string) === "Borrador" ? "Borrador" : "Confirmado"), toRow: (v) => v },
  { key: "activo", column: "activo", toFlat: (v) => v !== false, toRow: (v) => v },
];

interface AuthContextValue {
  usuario: Usuario | null;
  cargando: boolean;
  errorSesion: string | null;
  iniciarSesion: (email: string, password: string) => Promise<void>;
  cerrarSesion: () => Promise<void>;
  cambiarPasswordVoluntario: (actual: string, nueva: string) => Promise<void>;
  cambiarPasswordForzado: (nueva: string) => Promise<void>;
  verificarPasswordActual: (password: string) => Promise<boolean>;
  /** Entrega 23: vuelve a leer el perfil del usuario en sesión (p. ej. tras cambiar sus opciones de firma). */
  recargarUsuario: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

async function buscarUsuarioPorAuthId(authUserId: string): Promise<Usuario | null> {
  const { data, error } = await supabase
    .from("usuarios")
    .select("*")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return rowToFlat<Usuario>(data, CAMPOS_USUARIO);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = React.useState<Usuario | null>(null);
  const [cargando, setCargando] = React.useState(true);
  const [errorSesion, setErrorSesion] = React.useState<string | null>(null);

  const cargarUsuarioDeSesion = React.useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) {
      setUsuario(null);
      setCargando(false);
      return;
    }
    try {
      const fila = await buscarUsuarioPorAuthId(session.user.id);
      if (!fila) {
        setErrorSesion(
          "Tu cuenta no tiene un perfil de colaborador vinculado en BEATS. Contacta a Dirección Médica.",
        );
        await supabase.auth.signOut();
        setUsuario(null);
      } else if (!fila.activo) {
        // Habilitar/inhabilitar usuarios (septiembre 2026): un Administrador
        // inhabilitó esta cuenta — se cierra la sesión igual que el caso de
        // arriba (perfil sin vincular). Límite conocido: esto solo se revisa
        // cuando esta función vuelve a correr (login, recarga de página, o
        // un evento de `onAuthStateChange`), así que una sesión YA abierta
        // en otra pestaña no se corta al instante — ver la nota completa en
        // `db/agregar_activo_usuario.sql`.
        setErrorSesion("Tu cuenta fue inhabilitada. Contacta a un Administrador de BEATS.");
        await supabase.auth.signOut();
        setUsuario(null);
      } else {
        setUsuario(fila);
      }
    } catch (e) {
      setErrorSesion(mensajeErrorAmigable(e));
      setUsuario(null);
    } finally {
      setCargando(false);
    }
  }, []);

  React.useEffect(() => {
    cargarUsuarioDeSesion();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      cargarUsuarioDeSesion();
    });
    return () => sub.subscription.unsubscribe();
  }, [cargarUsuarioDeSesion]);

  const iniciarSesion = React.useCallback(async (email: string, password: string) => {
    setErrorSesion(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(mensajeErrorAmigable(error));
  }, []);

  const cerrarSesion = React.useCallback(async () => {
    // Se descartan los toasts pendientes (por ejemplo, uno que mostrara datos
    // sensibles del colaborador que cierra sesión) para que no queden
    // visibles al iniciar sesión otra persona en el mismo navegador.
    toast.dismiss();
    // Entrega 29: se cierra la sesión de medición ANTES de perder el token (las escrituras dependen de él).
    await Telemetria.finalizarSesion().catch(() => undefined);
    await supabase.auth.signOut();
    setUsuario(null);
  }, []);

  const cambiarPasswordVoluntario = React.useCallback(
    async (actual: string, nueva: string) => {
      if (!usuario) throw new Error("No hay una sesión activa.");
      const { error: errorReautenticacion } = await supabase.auth.signInWithPassword({
        email: usuario.email,
        password: actual,
      });
      if (errorReautenticacion) {
        throw new Error("La contraseña actual no es correcta.");
      }
      const { error } = await supabase.auth.updateUser({ password: nueva });
      if (error) throw new Error(mensajeErrorAmigable(error));
      const { error: errorUpdate } = await supabase
        .from("usuarios")
        .update(flatToRow({ debeCambiarPassword: false }, [b("debe_cambiar_password", "debeCambiarPassword")]))
        .eq("id", usuario.id);
      if (errorUpdate) throw new Error(mensajeErrorAmigable(errorUpdate));
      await cargarUsuarioDeSesion();
    },
    [usuario, cargarUsuarioDeSesion],
  );

  const cambiarPasswordForzado = React.useCallback(
    async (nueva: string) => {
      if (!usuario) throw new Error("No hay una sesión activa.");
      const { error } = await supabase.auth.updateUser({ password: nueva });
      if (error) throw new Error(mensajeErrorAmigable(error));
      const { error: errorUpdate } = await supabase
        .from("usuarios")
        .update(flatToRow({ debeCambiarPassword: false }, [b("debe_cambiar_password", "debeCambiarPassword")]))
        .eq("id", usuario.id);
      if (errorUpdate) throw new Error(mensajeErrorAmigable(errorUpdate));
      await cargarUsuarioDeSesion();
    },
    [usuario, cargarUsuarioDeSesion],
  );

  /**
   * Corrección (octubre 2026), pedido explícito del usuario: la pantalla de
   * "eliminar documentos firmados sin rastro" debe "pedir confirmación con
   * la contraseña del usuario loggeado" antes de cada eliminación. Mismo
   * patrón de reautenticación que `cambiarPasswordVoluntario` arriba —
   * `signInWithPassword` con el correo del usuario YA logueado solo
   * refresca su propia sesión (no la reemplaza por otra cuenta), así que es
   * seguro llamarlo aquí y descartar la sesión devuelta, solo revisando si
   * hubo error.
   */
  const verificarPasswordActual = React.useCallback(
    async (password: string) => {
      if (!usuario) return false;
      const { error } = await supabase.auth.signInWithPassword({ email: usuario.email, password });
      return !error;
    },
    [usuario],
  );

  const value: AuthContextValue = {
    usuario,
    cargando,
    errorSesion,
    iniciarSesion,
    cerrarSesion,
    cambiarPasswordVoluntario,
    cambiarPasswordForzado,
    verificarPasswordActual,
    recargarUsuario: cargarUsuarioDeSesion,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
