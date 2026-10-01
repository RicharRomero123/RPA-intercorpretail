"use client";

import {
  Bike, Building2, CalendarCheck, ChartLine, ChevronDown, Clock, Database, FileSpreadsheet, Globe, LayoutDashboard, LayoutGrid, Map, MapPin, PanelLeftClose, PanelLeftOpen, Presentation,
  ShoppingBasket, ShoppingCart, Store, TableProperties, Tag, Truck, Warehouse, type LucideIcon,
} from "lucide-react";
import { AnimatePresence, MotionConfig, motion, type Transition } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { MenuUsuario } from "./MenuUsuario";
import { useState, useSyncExternalStore } from "react";

const ICONOS = { ejecutivo: Presentation, avance: Clock, ventas: ChartLine, detalle: TableProperties, stock: Warehouse, despachos: Truck } satisfies Record<string, LucideIcon>;
type IdSeccion = keyof typeof ICONOS;

type Hoja = { id: IdSeccion; titulo: string };
/** Un punto del menú: un grupo (con hijos), una página con secciones, o un enlace. Sin ruta ni hijos = «Pronto». */
type Nodo = { id: string; titulo: string; icono: LucideIcon; ruta?: string; secciones?: Hoja[]; hijos?: Nodo[] };
export type TipoRetail = { tipo: string; slug: string };

const EJECUTIVO: Hoja = { id: "ejecutivo", titulo: "Resumen ejecutivo" };
/** Resumen general de todos los canales: va arriba de los módulos. */
const GENERAL: Nodo = { id: "consolidado", titulo: "Resumen general", icono: LayoutGrid, ruta: "/consolidado" };
const VENTAS: Hoja[] = [EJECUTIVO, { id: "ventas", titulo: "Ventas" }, { id: "detalle", titulo: "Detalle de ventas" }];
/** Vistas de ContaNet: además, el avance del día (se actualiza varias veces al día). */
const CONTANET: Hoja[] = [EJECUTIVO, { id: "avance", titulo: "Avance del día" }, ...VENTAS.slice(1)];
/** Módulos de la app, uno por canal de venta. Retail se abre en sus tipos (Supermercados · SPSA y los que se carguen). */
function menu(tipos: TipoRetail[]): Nodo[] {
  return [
    { id: "retail", titulo: "Retail", icono: ShoppingCart, hijos: [
      { id: "retail/resumen", titulo: "Resumen", icono: LayoutDashboard, ruta: "/retail", secciones: [EJECUTIVO, { id: "ventas", titulo: "Por tipo de retail" }] },
      { id: "retail/spsa", titulo: "Supermercados · SPSA", icono: ShoppingBasket, ruta: "/retail/spsa",
        secciones: [...VENTAS, { id: "stock", titulo: "Stock y quiebres" }, { id: "despachos", titulo: "Despachado vs vendido" }] },
      // Supermercados Peruanos ya está arriba (vista SPSA del bot); los demás clientes retail, cada uno con su vista.
      ...tipos.filter((t) => t.slug !== "supermercados-peruanos").map((t) => ({ id: `retail/${t.slug}`, titulo: t.tipo, icono: Tag, ruta: `/retail/tipo/${t.slug}`, secciones: VENTAS })),
    ] },
    { id: "tiendas", titulo: "Tiendas", icono: Store, hijos: [
      { id: "tiendas/resumen", titulo: "Resumen", icono: LayoutDashboard, ruta: "/tiendas", secciones: [EJECUTIVO, { id: "ventas", titulo: "Interno vs ContaNet" }] },
      { id: "tiendas/interno", titulo: "Reporte interno", icono: FileSpreadsheet, ruta: "/tiendas/interno", secciones: VENTAS },
      { id: "tiendas/contanet", titulo: "ContaNet", icono: Database, ruta: "/tiendas/contanet", secciones: CONTANET },
    ] },
    { id: "canales/digital", titulo: "Canal digital", icono: Globe, ruta: "/canales/digital", secciones: CONTANET },
    { id: "canales/rappi", titulo: "Rappi", icono: Bike, ruta: "/canales/rappi", secciones: CONTANET },
    { id: "b2b", titulo: "B2B", icono: Building2 },
    { id: "lima", titulo: "Lima", icono: MapPin },
    { id: "provincia", titulo: "Provincia", icono: Map },
  ];
}
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

export type Seccion = { id: IdSeccion; titulo: string; contenido: React.ReactNode };

/** Estructura de la app: menú lateral contraíble (barra superior en pantallas chicas), barra con la fecha de los datos
 *  y el usuario, y la sección elegida. */
export function Marco({ ubicacion, tiposRetail, secciones, encabezado, usuario, salir, datosAl, seccion }: {
  /** Dónde está la página en el menú, por ejemplo «retail/spsa» o «tiendas». */
  ubicacion: string; tiposRetail: TipoRetail[];
  /** Sección pedida en la URL (?s=detalle), la pasa la página. */
  seccion?: string | string[];
  secciones: Seccion[]; encabezado: React.ReactNode; usuario?: string; salir: () => Promise<void>; datosAl: string;
}) {
  // La sección elegida va en la URL (?s=detalle) para que se mantenga al recargar o al compartir el enlace.
  const pedida = Array.isArray(seccion) ? seccion[0] : seccion;
  const [activa, setActiva] = useState(() => secciones.find((x) => x.id === pedida)?.id ?? secciones[0].id);
  // Abiertos al entrar: el módulo y el tipo de la página actual (retail, retail/spsa).
  const [abiertos, setAbiertos] = useState<string[]>(() => ubicacion.split("/").map((_, i, xs) => xs.slice(0, i + 1).join("/")));
  const guardado = useSyncExternalStore(suscribirMenu, leerContraido, () => false);
  const grande = useSyncExternalStore(suscribirPantalla, () => window.matchMedia(CONSULTA_GRANDE).matches, () => true);
  const contraido = grande && guardado; // en pantallas chicas el menú es una barra horizontal
  const actual = secciones.find((s) => s.id === activa) ?? secciones[0];
  const IconoActual = ICONOS[actual.id];

  function elegir(id: IdSeccion) {
    setActiva(id);
    const p = new URLSearchParams(window.location.search);
    if (id === secciones[0].id) p.delete("s"); else p.set("s", id);
    window.history.replaceState(null, "", `${window.location.pathname}${p.size ? `?${p}` : ""}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const arbol = grande && !contraido; // menú lateral completo; si no, íconos (contraído) o barra horizontal (celular)

  function rama(n: Nodo, nivel: number): React.ReactNode {
    const Icono = n.icono;
    const clase = `nav-item relative whitespace-nowrap overflow-hidden shrink-0 xl:w-full ${contraido ? "xl:justify-center xl:px-0" : ""} ${nivel ? "!py-1.5 text-[13.5px]" : ""}`;
    if (!n.ruta && !n.hijos) {
      return (
        <span key={n.id} className={`${clase} opacity-45 cursor-not-allowed hover:!bg-transparent hover:!text-inherit`} aria-disabled
              title={`${n.titulo}: se activa cuando carguemos sus datos`}>
          <Icono size={18} strokeWidth={1.8} aria-hidden className="relative shrink-0" />
          {!contraido && <span className="relative flex-1 flex items-center justify-between gap-2">{n.titulo}
            <span className="text-[10px] rounded px-1.5 py-0.5 bg-white/10 text-white/60">Pronto</span></span>}
        </span>
      );
    }
    const esActual = n.id === ubicacion;
    const enCamino = esActual || ubicacion.startsWith(`${n.id}/`);
    const plegable = !!(n.hijos || n.secciones);
    const abierto = arbol ? abiertos.includes(n.id) : enCamino;
    const titulo = (
      <>
        {esActual && !n.secciones && (
          <motion.span layoutId="nav-activo" transition={RESORTE} className="absolute inset-0 rounded-lg bg-[var(--lateral-activo)] xl:shadow-[inset_3px_0_0_#f48c1a]" />
        )}
        <Icono size={nivel ? 16 : 18} strokeWidth={1.8} aria-hidden className={`relative shrink-0 ${enCamino ? "text-[#f48c1a]" : ""}`} />
        {!contraido && <span className="relative flex-1 text-left">{n.titulo}</span>}
        {arbol && plegable && <ChevronDown size={15} aria-hidden className={`relative shrink-0 opacity-70 transition-transform ${abierto ? "" : "-rotate-90"}`} />}
      </>
    );
    const estiloTitulo = `${clase} ${enCamino ? "!text-white font-semibold" : ""}`;
    const primera = n.ruta ?? n.hijos?.find((h) => h.ruta)?.ruta ?? "/";
    const hijos = n.hijos
      ? n.hijos.map((h) => rama(h, nivel + 1))
      : (n.secciones ?? []).map((sec) => {
          const IconoSec = ICONOS[sec.id];
          const esActiva = esActual && activa === sec.id;
          const cont = (
            <>
              {esActiva && (
                <motion.span layoutId="nav-activo" transition={RESORTE} className="absolute inset-0 rounded-lg bg-[var(--lateral-activo)] xl:shadow-[inset_3px_0_0_#f48c1a]" />
              )}
              <IconoSec size={15} strokeWidth={1.8} aria-hidden className="relative shrink-0" />
              {!contraido && <span className="relative">{sec.titulo}</span>}
            </>
          );
          const claseSec = `nav-item relative whitespace-nowrap overflow-hidden shrink-0 xl:w-full ${contraido ? "xl:justify-center xl:px-0" : ""} !py-1.5 text-[13px]`;
          return esActual ? (
            <button key={sec.id} type="button" className={claseSec} title={contraido ? sec.titulo : undefined}
                    aria-current={esActiva ? "page" : undefined} onClick={() => elegir(sec.id)}>{cont}</button>
          ) : (
            // Enlace simple (no next/link): el <Link> con «?s=» en este menú provoca un error de hidratación en Next 16.
            <a key={sec.id} href={sec.id === n.secciones![0].id ? n.ruta! : `${n.ruta}?s=${sec.id}`} className={claseSec}
                  title={contraido ? sec.titulo : undefined}>{cont}</a>
          );
        });
    return (
      <div key={n.id} className="contents xl:grid xl:gap-0.5">
        {arbol && plegable ? (
          <button type="button" className={estiloTitulo} aria-expanded={abierto}
                  onClick={() => setAbiertos((xs) => (xs.includes(n.id) ? xs.filter((x) => x !== n.id) : [...xs, n.id]))}>{titulo}</button>
        ) : (
          <Link href={primera} className={estiloTitulo} title={contraido ? n.titulo : undefined} aria-current={esActual ? "page" : undefined}>{titulo}</Link>
        )}
        <AnimatePresence initial={false}>
          {abierto && plegable && (
            <motion.div key="hijos"
                        className={`contents xl:grid xl:gap-0.5 xl:overflow-hidden ${arbol ? "xl:ml-[19px] xl:pl-2 xl:border-l xl:border-white/10" : ""}`}
                        initial={arbol ? { height: 0, opacity: 0 } : false} animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: "easeOut" }}>
              {hijos}
            </motion.div>
          )}
        </AnimatePresence>
        {!arbol && nivel === 0 && enCamino && <span className="shrink-0 self-stretch w-px xl:w-auto xl:h-px bg-white/10 mx-1 xl:mx-0 xl:my-1" aria-hidden />}
      </div>
    );
  }

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

          {/* Módulos (canales) → tipos → secciones; cada grupo se abre y cierra con un clic en su título */}
          <nav className="flex xl:flex-col gap-1 xl:flex-1 xl:min-h-0 xl:overflow-y-auto" aria-label="Módulos">
            {rama(GENERAL, 0)}
            {!contraido && <span className="hidden xl:block px-3 pt-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-white/40">Módulos</span>}
            {menu(tiposRetail).map((n) => rama(n, 0))}
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
                <MenuUsuario usuario={usuario} salir={salir} />
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
