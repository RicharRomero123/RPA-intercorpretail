"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { AvisoCargando } from "./AvisoCargando";

/** Enlace que cambia filtros de la misma página (p. ej. «ver solo esta tienda») sin recargarla ni saltar arriba, y muestra el aviso
 *  global de carga mientras llegan los datos. Ctrl/Cmd/clic medio siguen abriendo en otra pestaña como un enlace normal. */
export function EnlaceCarga({ href, className, children, ...resto }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const router = useRouter();
  const [cargando, iniciar] = useTransition();
  return (
    <>
      <a href={href} className={className} {...resto}
         onClick={(e) => {
           if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
           e.preventDefault();
           iniciar(() => router.push(href, { scroll: false }));
         }}>
        {children}
      </a>
      <AvisoCargando activo={cargando} />
    </>
  );
}
