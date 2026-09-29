"use client";

import {
  CalendarCheck, ChartLine, Clock, Gauge, LayoutDashboard, LogOut, Package, PanelLeftClose, PanelLeftOpen, Store,
  Warehouse, type LucideIcon,
} from "lucide-react";
import { AnimatePresence, MotionConfig, motion, type Transition } from "motion/react";
import Image from "next/image";
import { useState, useSyncExternalStore } from "react";

const ICONOS: Record<string, LucideIcon> = {
  resumen: LayoutDashboard, rotacion: Gauge, evolucion: ChartLine, productos: Package, locales: Store,
  stock: Warehouse, cargas: Clock,
};
const ANCHO = { abierto: 236, cerrado: 76 };
/** Resorte suave: el menú se acomoda sin rebote brusco. */
const RESORTE: Transition = { type: "spring", stiffness: 210, damping: 30, mass: 0.9 };
const FUNDIDO: Transition = { duration: 0.18, ease: "easeOut" };

// ---------------------------------------------------------------- preferencia guardada y tamaño de pantalla
const CLAVE_MENU = "calderon-menu-contraido";
const EVENTO_MENU = "calderon-menu";
function leerContraido() {
  try { return localStorage.getItem(CLAVE_MENU) === "1"; } catch { return false; }
}
function suscribirMenu(aviso: () => void) {
  window.addEventListener(EVENTO_MENU, aviso);
  window.addEventListener("storage", aviso);
  return () => { window.removeEventListener(EVENTO_MENU, aviso); window.removeEventListener("storage", aviso); };
}
const CONSULTA_GRANDE = "(min-width: 1280px)";
function suscribirPantalla(aviso: () => void) {
  const mq = window.matchMedia(CONSULTA_GRANDE);
  mq.addEventListener("change", aviso);
  return () => mq.removeEventListener("change", aviso);
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

/** Estructura de la app: menú lateral contraíble (barra superior en pantallas chicas), barra con la fecha de los datos
 *  y el usuario, y la sección elegida. */
export function Marco({ secciones, encabezado, usuario, salir, datosAl }: {
  secciones: Seccion[]; encabezado: React.ReactNode; usuario?: string; salir: () => Promise<void>; datosAl: string;
}) {
  const [activa, setActiva] = useState(secciones[0].id);
  const guardado = useSyncExternalStore(suscribirMenu, leerContraido, () => false);
  const grande = useSyncExternalStore(suscribirPantalla, () => window.matchMedia(CONSULTA_GRANDE).matches, () => true);
  const contraido = grande && guardado; // en pantallas chicas el menú es una barra horizontal
  const actual = secciones.find((s) => s.id === activa) ?? secciones[0];
  const IconoActual = ICONOS[actual.id];

  function alternar() {
    try { localStorage.setItem(CLAVE_MENU, guardado ? "0" : "1"); } catch {}
    window.dispatchEvent(new Event(EVENTO_MENU));
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen xl:flex">
        <motion.aside
          initial={false}
          animate={{ width: grande ? (contraido ? ANCHO.cerrado : ANCHO.abierto) : "100%" }}
          transition={RESORTE}
          className="bg-[var(--lateral)] text-[var(--lateral-tinta)] sticky top-0 z-30 shrink-0 xl:h-screen flex xl:flex-col items-center xl:items-stretch gap-2 px-3 py-2 xl:py-4 overflow-x-auto xl:overflow-hidden">

          {/* Logo y botón para contraer/expandir */}
          <Image src="/assets/logo-calderon.png" alt="Calderón" width={71} height={40} className="xl:hidden shrink-0 h-9 w-auto mr-1" priority />
          <div className={`hidden xl:flex items-center gap-2 pb-4 mb-2 border-b border-white/10 ${contraido ? "flex-col" : "justify-between pl-1"}`}>
            <div className="relative flex items-center justify-center" style={{ width: contraido ? 52 : 150, height: contraido ? 32 : 86 }}>
              <AnimatePresence initial={false} mode="popLayout">
                {contraido ? (
                  <motion.div key="icono" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.7 }} transition={FUNDIDO}>
                    <Image src="/assets/logo-calderon.png" alt="Calderón" width={52} height={29} className="w-[52px] h-auto" priority />
                  </motion.div>
                ) : (
                  <motion.div key="logo" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -12 }} transition={{ ...FUNDIDO, delay: 0.06 }} className="grid gap-1">
                    <Image src="/assets/logo-calderon.png" alt="Turrones y Panetones Calderón" width={150} height={85} className="h-auto w-[150px] drop-shadow" priority />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <motion.button type="button" onClick={alternar} whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
                           className="grid place-items-center size-8 shrink-0 rounded-md text-[var(--lateral-tinta)] hover:bg-[var(--lateral-activo)] hover:text-white"
                           aria-label={contraido ? "Expandir menú" : "Contraer menú"} title={contraido ? "Expandir menú" : "Contraer menú"}>
              {contraido ? <PanelLeftOpen size={17} aria-hidden /> : <PanelLeftClose size={17} aria-hidden />}
            </motion.button>
          </div>

          {/* Secciones */}
          <nav className="flex xl:flex-col gap-1 xl:flex-1 xl:min-h-0" aria-label="Secciones">
            {secciones.map((s) => {
              const Icono = ICONOS[s.id];
              const esActiva = activa === s.id;
              return (
                <button key={s.id} type="button" title={contraido ? s.titulo : undefined}
                        className={`nav-item relative whitespace-nowrap overflow-hidden shrink-0 xl:w-full ${contraido ? "xl:justify-center xl:px-0" : ""}`}
                        aria-current={esActiva ? "page" : undefined}
                        onClick={() => { setActiva(s.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                  {esActiva && (
                    <motion.span layoutId="nav-activo" transition={RESORTE}
                                 className="absolute inset-0 rounded-lg bg-[var(--lateral-activo)] xl:shadow-[inset_3px_0_0_#f48c1a]" />
                  )}
                  <Icono size={18} strokeWidth={1.8} aria-hidden className="relative shrink-0" />
                  <AnimatePresence initial={false}>
                    {!contraido && (
                      <motion.span key="texto" className="relative" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                                   exit={{ opacity: 0, x: -6 }} transition={FUNDIDO}>
                        {s.titulo}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              );
            })}
          </nav>
        </motion.aside>

        <div className="flex-1 min-w-0 @container">
          {/* Barra superior: sección actual, fecha de los datos y usuario */}
          <div className="sticky top-[52px] xl:top-0 z-20 bg-[color-mix(in_srgb,var(--fondo)_88%,transparent)] backdrop-blur border-b border-[var(--linea)]">
            <div className="flex items-center justify-between gap-3 px-4 sm:px-6 2xl:px-10 h-14">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={actual.id} className="flex items-center gap-2 text-sm font-semibold min-w-0"
                             initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={FUNDIDO}>
                  <IconoActual size={16} className="text-[var(--acento)] shrink-0" aria-hidden />
                  <span className="truncate">{actual.titulo}</span>
                </motion.span>
              </AnimatePresence>
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
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={actual.id} className="grid gap-6"
                          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
                {actual.contenido}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </MotionConfig>
  );
}
