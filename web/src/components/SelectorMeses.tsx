"use client";

// Meses del Resumen general: un botón que dice qué meses se están viendo («Meses: Ene–Sep») y abre una lista con casillas.
// Se marcan los meses que se quieran (seguidos o no) y se aplica; sin marcar nada, o con todos los cerrados, vuelve a lo normal.
// Los cambios no se ven hasta «Aplicar», así se puede marcar con calma. Se cierra con la ✕, con Esc o con un clic fuera.
import { CalendarDays, ChevronDown, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { escribirMeses, MESES_CORTOS, nombrarMeses, rangoMeses } from "@/lib/meses";
import { AvisoCargando } from "./AvisoCargando";

export function SelectorMeses({ elegidos, hasta, cerrados, enCurso }: {
  /** Meses de la URL; null = lo normal (los meses cerrados). */ elegidos: number[] | null;
  /** Último mes con datos. */ hasta: number;
  /** Último mes cerrado (lo normal va de enero a este). */ cerrados: number;
  /** Texto del mes en curso, p. ej. «al 9»; null si el último mes ya cerró. */ enCurso: string | null;
}) {
  const caja = useRef<HTMLDetailsElement>(null);
  const router = useRouter(), ruta = usePathname(), params = useSearchParams();
  const [cargando, iniciar] = useTransition();
  const normales = rangoMeses(1, cerrados);
  const actuales = elegidos ?? normales;
  const [marcados, setMarcados] = useState<number[]>(actuales);
  const disponibles = rangoMeses(1, hasta);
  const todos = normales.length > 0 && normales.every((m) => marcados.includes(m));
  const algunos = normales.some((m) => marcados.includes(m));

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
  // La casilla «todos» queda a medias cuando solo hay algunos meses cerrados marcados.
  const casillaTodos = useRef<HTMLInputElement>(null);
  useEffect(() => { if (casillaTodos.current) casillaTodos.current.indeterminate = algunos && !todos; }, [algunos, todos]);

  const alternar = (m: number) => setMarcados((x) => (x.includes(m) ? x.filter((y) => y !== m) : [...x, m].sort((a, b) => a - b)));
  const aplicar = () => {
    const q = new URLSearchParams(params.toString());
    const normal = !marcados.length || (marcados.length === normales.length && normales.every((m) => marcados.includes(m)));
    if (normal) q.delete("m"); else q.set("m", escribirMeses(marcados));
    cerrar(true);
    iniciar(() => router.push(`${ruta}${q.size ? `?${q}` : ""}`, { scroll: false }));
  };
  const nombreMes = (m: number) => `${MESES_CORTOS[m - 1]}${m === hasta && enCurso ? ` (${enCurso})` : ""}`;
  const trimestres = [1, 2, 3, 4].map((t) => ({ t, meses: rangoMeses(t * 3 - 2, Math.min(t * 3, hasta)) })).filter((x) => x.meses.length);
  const igual = (a: number[], b: number[]) => a.length === b.length && a.every((m) => b.includes(m));

  return (
    <details ref={caja} className="relative w-fit" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) setMarcados(actuales); }}>
      <summary className="presionable cursor-pointer list-none inline-flex items-center gap-2 rounded-full bg-[var(--acento-suave)] px-3.5 h-9
                          text-[15px] font-semibold text-[var(--acento)] hover:brightness-95"
               aria-label={`Meses: ${nombrarMeses(actuales)}. Cambiar meses`}>
        <CalendarDays size={16} aria-hidden />
        <span>Meses: {actuales.length ? nombrarMeses(actuales) : "—"}{!elegidos && <span className="font-normal opacity-80"> (cerrados)</span>}</span>
        <ChevronDown size={15} aria-hidden />
      </summary>
      <div className="flotante left-0 w-[min(94vw,300px)] p-3 grid gap-3" role="dialog" aria-label="Elegir meses">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">¿Qué meses quieres ver?</p>
          <button type="button" className="boton presionable !h-8 !px-2" onClick={() => cerrar(true)} aria-label="Cerrar" title="Cerrar (Esc)">
            <X size={16} aria-hidden />
          </button>
        </div>

        <fieldset className="grid gap-0.5">
          <legend className="sr-only">Meses</legend>
          {normales.length > 0 && (
            <label className="flex items-center gap-2.5 rounded-md px-2 h-9 text-sm font-semibold hover:bg-[var(--superficie-2)] cursor-pointer border-b border-[var(--linea)] mb-1">
              <input ref={casillaTodos} type="checkbox" className="size-4 accent-[var(--acento)]" checked={todos}
                     onChange={() => setMarcados((x) => (todos ? x.filter((m) => !normales.includes(m)) : [...new Set([...x, ...normales])].sort((a, b) => a - b)))} />
              Meses cerrados ({nombrarMeses(normales)})
            </label>
          )}
          <div className="grid grid-cols-2 gap-x-1 gap-y-0.5">
            {disponibles.map((m) => (
              <label key={m} className="flex items-center gap-2.5 rounded-md px-2 h-9 text-sm hover:bg-[var(--superficie-2)] cursor-pointer">
                <input type="checkbox" className="size-4 accent-[var(--acento)]" checked={marcados.includes(m)} onChange={() => alternar(m)} />
                {nombreMes(m)}
              </label>
            ))}
          </div>
        </fieldset>

        {trimestres.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--tenue)]">
            Solo un trimestre:
            {trimestres.map(({ t, meses }) => (
              <button key={t} type="button" aria-pressed={igual(marcados, meses)} onClick={() => setMarcados(meses)}
                      className="presionable rounded-full border border-[var(--linea)] px-2.5 h-7 font-medium text-[var(--tinta)] hover:bg-[var(--superficie-2)]
                                 aria-pressed:border-[var(--acento)] aria-pressed:bg-[var(--acento-suave)] aria-pressed:text-[var(--acento)]">
                T{t}
              </button>
            ))}
          </div>
        )}

        <p className="text-xs text-[var(--tenue)]" aria-live="polite">
          {marcados.length ? `Verás: ${nombrarMeses(marcados)}` : `Sin marcar: se ven los meses cerrados (${nombrarMeses(normales)})`}
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
