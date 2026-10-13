import { Card, CardContent } from "@/components/ui/card";
import { LogoApp } from "@/components/LogoApp";
import { useLogoApp } from "@/hooks/useLogoApp";
import { textoBuild } from "@/lib/buildInfo";
import { BanderaColombia } from "@/components/BanderaColombia";

/**
 * Créditos — texto verbatim recuperado por extracción forense del bundle
 * original (incluye el correo de contacto real, dominio bauschhealth.com).
 *
 * Corrección (septiembre 2026), pedido explícito del usuario:
 * - El logo de la aplicación (el mismo que se precarga en Configuración de
 *   Campos/Variables) ahora se resuelve y se muestra aquí en vez del ícono
 *   de respaldo genérico (ver `useLogoApp`, que completa la resolución que
 *   `LogoApp.tsx` dejaba pendiente).
 * - Texto más grande y centrado en toda la ventana.
 * - Debajo del correo de contacto, se agrega el texto centrado "Humax
 *   Pharmaceutical S.A. · Medellín · Colombia" con un ícono de bandera de
 *   Colombia centrado debajo.
 * - Los dos párrafos de créditos se reemplazan por la redacción exacta
 *   pedida por el usuario (ver ambos bloques de texto abajo).
 *
 * Ajuste de precisión (septiembre 2026), pedido explícito:
 * - El logo crece a un contenedor fijo de 96px (`w-24 h-24`, antes solo
 *   `anchoMax={96}` sin alto fijo — un logo con proporción muy distinta a
 *   cuadrada podía verse más chico de lo esperado dentro del espacio
 *   disponible).
 * - El emoji 🇨🇴 junto al correo se reemplaza por un SVG propio de la
 *   bandera de Colombia (amarillo/azul/rojo, `BanderaColombia.tsx` — no
 *   existía ningún ícono vectorial de banderas de país en la librería de
 *   íconos que ya usa la app, lucide-react).
 *
 * Segundo ajuste de precisión (septiembre 2026), pedido explícito: se quita
 * la etiqueta de texto "Colombia" al lado derecho de la bandera — solo
 * queda el ícono.
 *
 * AJUSTES (septiembre/octubre 2026), pedido explícito: "armoniza el tamaño
 * de las fuentes utilizadas. Aumenta el tamaño del logo, similar a como se
 * ve en la ventana de login."
 * - Logo: antes vivía dentro de un contenedor fijo de 96px (`h-24 w-24`) con
 *   `anchoMax={96}` — se quita ese contenedor (que lo recortaba a un cuadro
 *   chico sin importar qué tan grande se pidiera) y se sube `anchoMax` a
 *   `220`, el mismo valor que usa `PantallaLogin.tsx`, así que ahora se ve
 *   literalmente del mismo tamaño que en la ventana de login.
 * - Fuentes: el cuerpo de texto tenía 3 tamaños ligeramente distintos sin
 *   ningún criterio (`text-lg` en el primer párrafo, `text-[15px]` en el
 *   agradecimiento a TI, `text-[15px]` en el resto) — se unifica todo el
 *   cuerpo de texto a `text-[15px]`, dejando solo la píldora de crédito (ya
 *   intencionalmente destacada, con ícono y fondo propio) como la única
 *   excepción visual, que es lo esperado para un elemento tipo insignia.
 *
 * Entrega 39 (octubre 2026), pedido explícito:
 * - Fuente del mensaje un poco menor para armonizar con el resto de la aplicación: todo el texto de la ventana pasa de
 *   `text-base` (16 px) a `text-[15px]` (los títulos «Desarrollado con Claude» / «Agradecimientos especiales» conservan
 *   su peso semibold).
 * - La bandera de Colombia se reubica justo DEBAJO de «Medellín · Colombia» (antes iba a la derecha de las dos líneas).
 *
 * Entrega 33 (octubre 2026), pedido explícito:
 * - El agradecimiento genérico al equipo de TI se reemplaza por «Agradecimientos especiales» con dos ítems
 *   nominales (Lizeth Núñez, Compliance & Legal Colombia; Ferney Estrada y Jorge Acevedo, TI Colombia).
 * - Armonización del diseño, sobre todo del ancho: la tarjeta pasa de una columna angosta (`max-w-2xl`,
 *   muy alargada en vertical) a dos columnas en pantallas anchas (`max-w-5xl`): a la izquierda la identidad
 *   (logo, autor, versión) y a la derecha el texto y los agradecimientos; abajo, una franja con el contacto.
 *   En pantallas angostas vuelve a apilarse en una sola columna.
 */
export function Creditos() {
  const { logoUrl, anchoPx, altoPx } = useLogoApp();

  return (
    <div className="mx-auto max-w-5xl">
      <Card>
        <CardContent className="flex flex-col gap-8 p-8 md:p-10">
          <div className="grid items-center gap-8 md:grid-cols-[minmax(0,17rem)_1px_minmax(0,1fr)] md:gap-10">
            {/* Identidad: logo, autor y versión */}
            <div className="flex flex-col items-center gap-5 text-center">
              <LogoApp logoUrl={logoUrl} anchoPx={anchoPx} altoPx={altoPx} anchoMax={220} />
              <p data-testid="creditos-build" className="text-sm text-muted-foreground">
                {textoBuild()}
              </p>
            </div>

            <div className="hidden self-stretch md:block" style={{ background: "hsl(var(--border))" }} aria-hidden />

            {/* Texto: descripción y agradecimientos */}
            <div className="flex flex-col gap-5">
              <p className="text-justify text-[15px] leading-relaxed hyphens-auto" lang="es" style={{ color: "hsl(var(--muted-foreground))" }}>
                <strong className="font-bold" style={{ color: "hsl(var(--foreground))" }}>BEATS (Bausch Events Approval &amp; Tracking System)</strong> es una herramienta ideada y desarrollada por{" "}
                <strong className="font-bold" style={{ color: "hsl(var(--foreground))" }}>Sebastian González Avendaño</strong> (Medical Affairs, Colombia), con el propósito de mejorar el proceso de
                aprobación y seguimiento a eventos educativos y promocionales organizados por Bausch Health o en los
                cuales la compañía participa.
              </p>

              <div lang="es" className="space-y-3 rounded-lg border p-5" style={{ borderColor: "hsl(var(--border))" }} data-testid="creditos-agradecimientos">
                <p className="text-[15px] font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                  Desarrollado con Claude (Anthropic).
                </p>
                <p className="text-[15px] font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                  Agradecimientos especiales:
                </p>
                <ul className="list-disc space-y-2.5 pl-5 text-justify text-[15px] leading-relaxed hyphens-auto marker:text-[hsl(var(--primary))]" style={{ color: "hsl(var(--muted-foreground))" }}>
                  <li>
                    A <strong className="font-semibold" style={{ color: "hsl(var(--foreground))" }}>Lizeth Núñez</strong> (Compliance &amp; Legal,
                    Colombia), por servir de referente con su iniciativa de gestión digital de contratos y por sus aportes
                    en la optimización de los procesos de aprobación de eventos educativos y promocionales, así como en la
                    contratación de HCP.
                  </li>
                  <li>
                    Al equipo de TI Colombia, en especial a{" "}
                    <strong className="font-semibold" style={{ color: "hsl(var(--foreground))" }}>Ferney Estrada</strong> y{" "}
                    <strong className="font-semibold" style={{ color: "hsl(var(--foreground))" }}>Jorge Acevedo</strong>, por su soporte
                    técnico y acompañamiento en la integración del sistema al entorno corporativo.
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Contacto */}
          <div
            className="flex flex-col items-center justify-between gap-3 border-t pt-6 text-center sm:flex-row sm:text-left"
            style={{ borderColor: "hsl(var(--border))" }}
          >
            <p className="text-center text-[15px] sm:text-left" style={{ color: "hsl(var(--muted-foreground))" }}>
              En caso de inquietudes, favor contactar a{" "}
              <a
                href="mailto:sebastian.gonzalez@bauschhealth.com"
                className="font-medium hover:underline"
                style={{ color: "hsl(var(--primary))" }}
              >
                sebastian.gonzalez@bauschhealth.com
              </a>
              .
            </p>
            <div className="flex flex-col items-center gap-1.5 text-center text-[15px] font-medium" style={{ color: "hsl(var(--foreground))" }} data-testid="creditos-empresa">
              <span className="sm:whitespace-nowrap">Humax Pharmaceutical S.A., una compañía Bausch Health</span>
              <span>Medellín · Colombia</span>
              <BanderaColombia className="h-4 w-6 shrink-0 rounded-sm shadow-sm" data-testid="creditos-bandera" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
