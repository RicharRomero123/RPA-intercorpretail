"use client";

import { useAcceso } from "./Acceso";
import { puede } from "@/lib/acceso";

import { ChevronDown, LogOut, Settings } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/** Perfil en la barra superior: al hacer clic se abre un menú con Configuración y Cerrar sesión. */
export function MenuUsuario({ usuario, salir, oscuro = false }: { usuario?: string; salir: () => Promise<void>; oscuro?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const acceso = useAcceso();
  const caja = useRef<HTMLDivElement>(null);
  const inicial = (usuario ?? "?").slice(0, 1).toUpperCase();

  // Se cierra al hacer clic fuera o con Esc.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("pointerdown", fuera); document.removeEventListener("keydown", tecla); };
  }, [abierto]);

  return (
    <div ref={caja} className="relative">
      <button type="button" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto} aria-haspopup="menu"
              className={`flex items-center gap-2 rounded-full pl-1 pr-2 py-1 border border-transparent ${oscuro ? "text-[var(--lateral-tinta)] hover:bg-[var(--lateral-activo)]" : "hover:bg-[var(--superficie)] hover:border-[var(--linea)]"}`}>
        <span className={`grid place-items-center size-8 shrink-0 rounded-full text-sm font-bold ${oscuro ? "bg-[#f48c1a] text-[var(--lateral)]" : "bg-[var(--lateral)] text-[#f7b36a]"}`} aria-hidden>{inicial}</span>
        <span className="hidden md:block text-sm truncate max-w-56">{usuario}</span>
        <ChevronDown size={15} className={`${oscuro ? "" : "text-[var(--tenue)]"} transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden />
      </button>
      <AnimatePresence>
        {abierto && (
          <motion.div role="menu" initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={{ duration: 0.15, ease: "easeOut" }}
                      className="absolute right-0 mt-2 w-64 tarjeta !shadow-xl p-1.5 z-40 origin-top-right text-[var(--tinta)]">
            <div className="px-3 py-2 border-b border-[var(--linea)] mb-1">
              <p className="text-xs text-[var(--tenue)]">Sesión iniciada como</p>
              <p className="text-sm font-medium truncate" title={usuario}>{usuario}</p>
            </div>
{puede(acceso, "configuracion") && (
            <Link href="/configuracion" role="menuitem" onClick={() => setAbierto(false)}
                  className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm hover:bg-[var(--superficie-2)]">
              <Settings size={16} className="text-[var(--tenue)]" aria-hidden /> Configuración
            </Link>)}
            <form action={salir}>
              <button type="submit" role="menuitem"
                      className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-[var(--critico)] hover:bg-[var(--critico-suave)]">
                <LogOut size={16} aria-hidden /> Cerrar sesión
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
