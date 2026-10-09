"use client";

// Canales del Resumen general, como el filtro de Excel: un botón que dice qué canales se están viendo («Canales: Todos») y abre
// una lista con casillas («Todos» arriba). Se aplica con «Aplicar»; sin marcar nada, o con todos, vuelve a todos los canales.
// Se cierra con la ✕, con Esc o con un clic fuera.
import { ChevronDown, Layers, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { AvisoCargando } from "./AvisoCargando";

export function SelectorCanales({ opciones, elegidos }: {
  /** Canales que hay, en orden: clave (va en la URL) y nombre para mostrar. */ opciones: { clave: string; nombre: string }[];
  /** Canales de la URL; null = todos. */ elegidos: string[] | null;
}) {
  const caja = useRef<HTMLDetailsElement>(null);
  const router = useRouter(), ruta = usePathname(), params = useSearchParams();
  const [cargando, iniciar] = useTransition();
  const claves = opciones.map((o) => o.clave);
  const actuales = elegidos ?? claves;
  const [marcados, setMarcados] = useState<string[]>(actuales);
  const todos = marcados.length === claves.length;
  const nombres = (l: string[]) => (l.length === claves.length || !l.length ? "Todos" : opciones.filter((o) => l.includes(o.clave)).map((o) => o.nombre).join(", "));

  const cerrar = (volver = false) => {
    if (!caja.current) return;
    caja.current.open = false;
    if (volver) caja.current.querySelector("summary")?.focus();
  };
  useEffect(() => {
    const fuera = (e: PointerEvent) => { if (caja.current?.open && !caja.current.contains(e.target as Node)) cerrar(); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape" && caja.current?.open) cerrar(true); };
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("pointerdown", fuera); document.removeEventListener("keydown", tecla); };
  }, []);
  const casillaTodos = useRef<HTMLInputElement>(null);
  useEffect(() => { if (casillaTodos.current) casillaTodos.current.indeterminate = marcados.length > 0 && !todos; }, [marcados, todos]);

  const alternar = (c: string) => setMarcados((x) => (x.includes(c) ? x.filter((y) => y !== c) : claves.filter((k) => k === c || x.includes(k))));
  const aplicar = () => {
    const q = new URLSearchParams(params.toString());
    if (todos || !marcados.length) q.delete("c"); else q.set("c", marcados.join(","));
    cerrar(true);
    iniciar(() => router.push(`${ruta}${q.size ? `?${q}` : ""}`, { scroll: false }));
  };

  return (
    <details ref={caja} className="relative w-fit" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) setMarcados(actuales); }}>
      <summary className="presionable cursor-pointer list-none inline-flex items-center gap-2 rounded-full bg-[var(--acento-suave)] px-3.5 h-9
                          text-[15px] font-semibold text-[var(--acento)] hover:brightness-95"
               aria-label={`Canales: ${nombres(actuales)}. Cambiar canales`}>
        <Layers size={16} aria-hidden />
        <span className="max-w-[60vw] truncate">Canales: {nombres(actuales)}</span>
        <ChevronDown size={15} aria-hidden />
      </summary>
      <div className="flotante left-0 w-[min(94vw,260px)] p-3 grid gap-3" role="dialog" aria-label="Elegir canales">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">¿Qué canales quieres ver?</p>
          <button type="button" className="boton presionable !h-8 !px-2" onClick={() => cerrar(true)} aria-label="Cerrar" title="Cerrar (Esc)">
            <X size={16} aria-hidden />
          </button>
        </div>
        <fieldset className="grid gap-0.5">
          <legend className="sr-only">Canales</legend>
          <label className="flex items-center gap-2.5 rounded-md px-2 h-9 text-sm font-semibold hover:bg-[var(--superficie-2)] cursor-pointer border-b border-[var(--linea)] mb-1">
            <input ref={casillaTodos} type="checkbox" className="size-4 accent-[var(--acento)]" checked={todos}
                   onChange={() => setMarcados(todos ? [] : claves)} />
            Todos los canales
          </label>
          {opciones.map((o) => (
            <label key={o.clave} className="flex items-center gap-2.5 rounded-md px-2 h-9 text-sm hover:bg-[var(--superficie-2)] cursor-pointer">
              <input type="checkbox" className="size-4 accent-[var(--acento)]" checked={marcados.includes(o.clave)} onChange={() => alternar(o.clave)} />
              {o.nombre}
            </label>
          ))}
        </fieldset>
        <p className="text-xs text-[var(--tenue)]" aria-live="polite">
          {marcados.length ? `Verás: ${nombres(marcados)}` : "Sin marcar: se ven todos los canales"}
        </p>
        <div className="flex items-center justify-between gap-2">
          <button type="button" className="boton presionable" onClick={() => setMarcados([])} disabled={!marcados.length}>Limpiar</button>
          <button type="button" className="boton-primario presionable" onClick={aplicar}>Aplicar</button>
        </div>
      </div>
      <AvisoCargando activo={cargando} />
    </details>
  );
}
