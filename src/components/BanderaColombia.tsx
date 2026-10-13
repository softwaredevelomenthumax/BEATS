/**
 * Ajuste de precisión (septiembre 2026), pedido explícito: SVG propio de la
 * bandera de Colombia (reemplaza el emoji 🇨🇴 en la ventana de Créditos) —
 * no existe un ícono vectorial de banderas de país en lucide-react, la
 * librería de íconos que ya usa la app. Proporción real 2:3 (amarillo ocupa
 * la mitad superior; azul y rojo, un cuarto cada uno de la mitad inferior).
 */
export function BanderaColombia({ className, ...resto }: { className?: string; "data-testid"?: string }) {
  return (
    <svg
      viewBox="0 0 3 2"
      className={className}
      role="img"
      aria-label="Bandera de Colombia"
      xmlns="http://www.w3.org/2000/svg"
      {...resto}
    >
      <rect width="3" height="2" fill="#FCD116" />
      <rect width="3" height="1" y="1" fill="#003893" />
      <rect width="3" height="0.5" y="1.5" fill="#CE1126" />
    </svg>
  );
}
