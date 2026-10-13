import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useFotoUsuario } from "@/lib/fotosUsuario";
import { cn } from "@/lib/utils";

/** Iniciales (máx. 2) de un nombre completo — mismo criterio que el avatar de los speakers. */
export function inicialesDeNombre(nombre: string): string {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Entrega 33 — avatar circular de un colaborador: su foto si la tiene y, si no, sus iniciales. Es el equivalente, para los
 * usuarios, del avatar que ya se usa con los speakers; así toda referencia a una persona en la app se ve igual.
 *
 * Basta con el `usuarioId` (la foto se resuelve y se guarda en caché de forma agrupada, ver `lib/fotosUsuario.ts`). Si ya se
 * tiene el objeto `Usuario`, pasar también `fotoId` evita la consulta del usuario.
 */
export function AvatarUsuario({
  usuarioId,
  fotoId,
  nombre = "",
  iniciales,
  className,
  fallbackClassName,
}: {
  usuarioId?: string | null;
  fotoId?: string | null;
  nombre?: string;
  iniciales?: string;
  className?: string;
  fallbackClassName?: string;
}) {
  const foto = useFotoUsuario(usuarioId, fotoId);
  return (
    <Avatar className={cn("size-8", className)} data-testid="avatar-usuario">
      {foto && <AvatarImage src={foto} alt={nombre} />}
      <AvatarFallback className={cn("text-xs font-semibold", fallbackClassName)}>{iniciales || inicialesDeNombre(nombre) || "—"}</AvatarFallback>
    </Avatar>
  );
}
