"use client";

import { useSearchParams } from "next/navigation";

/** Muestra su contenido en todas las secciones menos en el Resumen ejecutivo (la primera de la página, sin «?s=»). Sirve para lo
 *  que en el resumen solo repite información, como la franja «2026 ⟷ 2025»: ahí cada indicador ya dice contra qué se compara. */
export function FueraDelResumen({ children }: { children: React.ReactNode }) {
  const s = useSearchParams().get("s") ?? "ejecutivo";
  return s === "ejecutivo" ? null : <>{children}</>;
}
