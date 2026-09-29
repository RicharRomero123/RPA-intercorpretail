"use client";

import {
  ChartLine, Clock, Gauge, LayoutDashboard, LogOut, Package, Store, Warehouse, type LucideIcon,
} from "lucide-react";
import { useState } from "react";

const ICONOS: Record<string, LucideIcon> = {
  resumen: LayoutDashboard, rotacion: Gauge, evolucion: ChartLine, productos: Package, locales: Store,
  stock: Warehouse, cargas: Clock,
};

export type Seccion = { id: keyof typeof ICONOS; titulo: string; contenido: React.ReactNode };

/** Estructura de la app: menú lateral (arriba en el celular), encabezado con filtros y la sección elegida. */
export function Marco({ secciones, encabezado, usuario, salir, datosAl }: {
  secciones: Seccion[]; encabezado: React.ReactNode; usuario?: string; salir: () => Promise<void>; datosAl: string;
}) {
  const [activa, setActiva] = useState(secciones[0].id);
  const actual = secciones.find((s) => s.id === activa) ?? secciones[0];
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="bg-[var(--lateral)] text-[var(--lateral-tinta)] lg:sticky lg:top-0 lg:h-screen flex lg:flex-col gap-2 p-3 overflow-x-auto">
        <div className="hidden lg:flex items-center gap-2.5 px-2 py-3 mb-2">
          <span className="grid place-items-center size-9 rounded-lg bg-[var(--acento)] text-white font-extrabold font-[family-name:var(--font-archivo)]">C</span>
          <div className="leading-tight">
            <p className="text-white font-semibold text-sm">Calderón Retail</p>
            <p className="text-[11px]">Sell-out · SPSA</p>
          </div>
        </div>
        <p className="hidden lg:block etiqueta px-3 !text-[var(--lateral-tinta)] opacity-70">Análisis</p>
        <nav className="flex lg:flex-col gap-1 lg:flex-1" aria-label="Secciones">
          {secciones.map((s) => {
            const Icono = ICONOS[s.id];
            return (
              <button key={s.id} type="button" className="nav-item whitespace-nowrap" aria-current={activa === s.id ? "page" : undefined}
                      onClick={() => { setActiva(s.id); window.scrollTo({ top: 0 }); }}>
                <Icono size={17} strokeWidth={1.8} aria-hidden /> {s.titulo}
              </button>
            );
          })}
        </nav>
        <div className="hidden lg:grid gap-2 border-t border-white/10 pt-3 px-1">
          <p className="text-[11px] px-2">Datos al <b className="text-white">{datosAl}</b></p>
          <form action={salir} className="flex items-center justify-between gap-2 px-2">
            <span className="text-xs truncate" title={usuario}>{usuario}</span>
            <button type="submit" className="grid place-items-center size-8 rounded-md hover:bg-[var(--lateral-activo)] hover:text-white"
                    title="Cerrar sesión" aria-label="Cerrar sesión">
              <LogOut size={16} aria-hidden />
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 px-4 lg:px-8 py-6 grid gap-6 content-start">
        {encabezado}
        <div className="grid gap-6">{actual.contenido}</div>
      </main>
    </div>
  );
}
