"use client";

import {
  CalendarCheck, ChartLine, Clock, Gauge, LayoutDashboard, LogOut, Package, PanelLeftClose, PanelLeftOpen, Store,
  Warehouse, type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { useState, useSyncExternalStore } from "react";

const ICONOS: Record<string, LucideIcon> = {
  resumen: LayoutDashboard, rotacion: Gauge, evolucion: ChartLine, productos: Package, locales: Store,
  stock: Warehouse, cargas: Clock,
};
const CLAVE_MENU = "calderon-menu-contraido";
const EVENTO_MENU = "calderon-menu";

function leerContraido() {
  try { return localStorage.getItem(CLAVE_MENU) === "1"; } catch { return false; }
}
function suscribir(aviso: () => void) {
  window.addEventListener(EVENTO_MENU, aviso);
  window.addEventListener("storage", aviso);
  return () => { window.removeEventListener(EVENTO_MENU, aviso); window.removeEventListener("storage", aviso); };
}

export type Seccion = { id: keyof typeof ICONOS; titulo: string; contenido: React.ReactNode };

function Usuario({ usuario, salir }: { usuario?: string; salir: () => Promise<void> }) {
  const inicial = (usuario ?? "?").slice(0, 1).toUpperCase();
  return (
    <form action={salir} className="flex items-center gap-2 min-w-0">
      <span className="grid place-items-center size-8 shrink-0 rounded-full bg-[var(--lateral)] text-[#f7b36a] text-sm font-bold" aria-hidden>{inicial}</span>
      <span className="hidden md:block text-sm truncate max-w-56" title={usuario}>{usuario}</span>
      <button type="submit" className="boton !px-2.5" title="Cerrar sesión" aria-label="Cerrar sesión">
        <LogOut size={15} aria-hidden /> <span className="hidden sm:inline">Salir</span>
      </button>
    </form>
  );
}

/** Estructura de la app: menú lateral contraíble (arriba en pantallas chicas), barra superior con la fecha de los
 *  datos y el usuario, y la sección elegida. */
export function Marco({ secciones, encabezado, usuario, salir, datosAl }: {
  secciones: Seccion[]; encabezado: React.ReactNode; usuario?: string; salir: () => Promise<void>; datosAl: string;
}) {
  const [activa, setActiva] = useState(secciones[0].id);
  // Preferencia guardada en el navegador; en el servidor el menú siempre sale expandido.
  const contraido = useSyncExternalStore(suscribir, leerContraido, () => false);
  function alternar() {
    try { localStorage.setItem(CLAVE_MENU, contraido ? "0" : "1"); } catch {}
    window.dispatchEvent(new Event(EVENTO_MENU));
  }
  const actual = secciones.find((s) => s.id === activa) ?? secciones[0];
  const ancho = contraido ? "xl:grid-cols-[72px_1fr]" : "xl:grid-cols-[228px_1fr]";

  return (
    <div className={`min-h-screen xl:grid ${ancho} transition-[grid-template-columns] duration-200`}>
      {/* Menú: lateral en pantallas grandes, barra horizontal en las chicas */}
      <aside className="bg-[var(--lateral)] text-[var(--lateral-tinta)] sticky top-0 z-30 xl:h-screen flex xl:flex-col items-center xl:items-stretch gap-2 px-3 py-2 xl:py-4 overflow-x-auto xl:overflow-hidden">
        <Image src="/assets/logo-calderon.png" alt="Calderón" width={71} height={40} className="xl:hidden shrink-0 h-9 w-auto mr-1" priority />
        <div className={`hidden xl:grid justify-items-center gap-2 pb-4 mb-2 border-b border-white/10 ${contraido ? "px-0" : "px-2"}`}>
          {contraido ? (
            <Image src="/assets/icono-calderon.png" alt="Calderón" width={44} height={44} className="size-11" priority />
          ) : (
            <>
              <Image src="/assets/logo-calderon.png" alt="Turrones y Panetones Calderón" width={176} height={100} className="h-auto w-40 drop-shadow" priority />
              <p className="text-[11px] tracking-wide uppercase text-[#f7b36a] font-semibold whitespace-nowrap">Retail · Sell-out SPSA</p>
            </>
          )}
        </div>
        <nav className="flex xl:flex-col gap-1 xl:flex-1 xl:min-h-0" aria-label="Secciones">
          {secciones.map((s) => {
            const Icono = ICONOS[s.id];
            return (
              <button key={s.id} type="button" title={contraido ? s.titulo : undefined}
                      className={`nav-item whitespace-nowrap ${contraido ? "xl:justify-center xl:px-0" : ""}`}
                      aria-current={activa === s.id ? "page" : undefined}
                      onClick={() => { setActiva(s.id); window.scrollTo({ top: 0 }); }}>
                <Icono size={18} strokeWidth={1.8} aria-hidden className="shrink-0" />
                <span className={contraido ? "xl:sr-only" : ""}>{s.titulo}</span>
              </button>
            );
          })}
        </nav>
        <button type="button" onClick={alternar} className={`hidden xl:flex nav-item ${contraido ? "justify-center !px-0" : ""}`}
                aria-label={contraido ? "Expandir menú" : "Contraer menú"} title={contraido ? "Expandir menú" : "Contraer menú"}>
          {contraido ? <PanelLeftOpen size={18} aria-hidden /> : <><PanelLeftClose size={18} aria-hidden /> Contraer menú</>}
        </button>
      </aside>

      <div className="min-w-0 @container">
        {/* Barra superior: sección actual, fecha de los datos y usuario */}
        <div className="sticky top-[52px] xl:top-0 z-20 bg-[color-mix(in_srgb,var(--fondo)_88%,transparent)] backdrop-blur border-b border-[var(--linea)]">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 2xl:px-10 h-14">
            <span className="flex items-center gap-2 text-sm font-semibold min-w-0">
              {(() => { const Icono = ICONOS[actual.id]; return <Icono size={16} className="text-[var(--acento)] shrink-0" aria-hidden />; })()}
              <span className="truncate">{actual.titulo}</span>
            </span>
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs rounded-full border border-[var(--linea)] bg-[var(--superficie)] px-2.5 py-1">
                <CalendarCheck size={13} className="text-[var(--acento)]" aria-hidden /> Datos al <b>{datosAl}</b>
              </span>
              <Usuario usuario={usuario} salir={salir} />
            </div>
          </div>
        </div>
        <main className="px-4 sm:px-6 2xl:px-10 py-6 grid gap-6 content-start">
          {encabezado}
          <div className="grid gap-6">{actual.contenido}</div>
        </main>
      </div>
    </div>
  );
}
