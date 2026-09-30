"use client";

import { CalendarRange, ChevronDown, GitCompareArrows, ListFilter, LoaderCircle, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { COMPARAR, DIAS_SEM, PERIODOS } from "@/lib/periodos";

type Opcion = { valor: string; texto: string };

/** Lista con casillas dentro de un desplegable; vacía = todos. */
function Multiple({ id, etiqueta, opciones, elegidos, cambiar, buscar = false }: {
  id: string; etiqueta: string; opciones: Opcion[]; elegidos: string[]; cambiar: (v: string[]) => void; buscar?: boolean;
}) {
  const [texto, setTexto] = useState("");
  const visibles = opciones.filter((o) => o.texto.toLowerCase().includes(texto.toLowerCase()));
  const resumen = elegidos.length === 0 ? "Todos" : elegidos.length === 1
    ? opciones.find((o) => o.valor === elegidos[0])?.texto ?? "1" : `${elegidos.length} elegidos`;
  return (
    <details className="relative">
      <summary className={`campo cursor-pointer list-none flex items-center gap-2 ${elegidos.length ? "!border-[var(--acento)]" : ""}`}>
        <span className="text-[var(--tenue)]">{etiqueta}</span>
        <span className="truncate max-w-36 font-medium">{resumen}</span>
        <ChevronDown size={14} className="text-[var(--tenue)]" aria-hidden />
      </summary>
      <div className="flotante w-72 p-2 grid gap-2">
        {buscar && (
          <label className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--tenue)]" aria-hidden />
            <input id={`${id}-buscar`} className="campo w-full !pl-8" placeholder="Buscar…" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </label>
        )}
        <div className="max-h-64 overflow-auto grid gap-0.5">
          {visibles.map((o) => (
            <label key={o.valor} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-md hover:bg-[var(--superficie-2)] cursor-pointer">
              <input type="checkbox" className="accent-[var(--acento)]" checked={elegidos.includes(o.valor)}
                     onChange={(e) => cambiar(e.target.checked ? [...elegidos, o.valor] : elegidos.filter((v) => v !== o.valor))} />
              {o.texto}
            </label>
          ))}
          {visibles.length === 0 && <p className="text-xs text-[var(--tenue)] px-2 py-1">Sin resultados</p>}
        </div>
        {elegidos.length > 0 && (
          <button type="button" className="boton justify-center" onClick={() => cambiar([])}><X size={14} aria-hidden /> Quitar filtro</button>
        )}
      </div>
    </details>
  );
}

/** Un filtro de lista (producto, cadena, tienda…). «padres»: la opción solo aparece si coincide con lo elegido en esos
 *  otros filtros (por ejemplo, locales de la cadena elegida). «limpia»: filtros que se vacían al cambiar este. */
export type Grupo = {
  clave: string; etiqueta: string; opciones: (Opcion & { padres?: Record<string, string> })[]; limpia?: string[]; buscar?: boolean;
};

export function Filtros({ grupos, ultimo, primero, stock = false, compararDefecto = "anio", periodoDefecto = "mes", agruparDefecto = "dia", dias: conDias = true, comparar = true }: {
  grupos: Grupo[]; ultimo: string; primero: string; stock?: boolean; compararDefecto?: string; periodoDefecto?: string; agruparDefecto?: string;
  /** false: la página no filtra por día de la semana. */
  dias?: boolean;
  /** false: la página no compara periodos (se oculta el selector). */
  comparar?: boolean;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const sp = useSearchParams();
  const [cargando, iniciar] = useTransition();
  const lista = (k: string) => (sp.get(k) ? sp.get(k)!.split(",").filter(Boolean) : []);

  function poner(cambios: Record<string, string | string[] | null>) {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(cambios)) {
      const texto = Array.isArray(v) ? v.join(",") : v;
      if (texto === null || texto === "") p.delete(k); else p.set(k, texto);
    }
    iniciar(() => router.push(`${ruta}?${p.toString()}`, { scroll: false }));
  }

  const periodo = sp.get("p") ?? periodoDefecto;
  const agrupar = sp.get("g") ?? agruparDefecto;
  const dias = sp.get("ds") ? sp.get("ds")!.split("").map(Number) : [0, 1, 2, 3, 4, 5, 6];
  const visibles = (g: Grupo) => g.opciones.filter((o) =>
    Object.entries(o.padres ?? {}).every(([k, v]) => !lista(k).length || lista(k).includes(v)));
  const activos = grupos.filter((g) => lista(g.clave).length).length + (dias.length < 7 ? 1 : 0);

  return (
    <div className="grid gap-3" aria-label="Filtros">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex items-center">
          <CalendarRange size={15} className="absolute left-2.5 text-[var(--tenue)] pointer-events-none" aria-hidden />
          <select id="f-periodo" className="campo !pl-8 font-medium" value={periodo} onChange={(e) => poner({ p: e.target.value })} aria-label="Periodo">
            {Object.entries(PERIODOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </label>
        {periodo === "personalizado" && (
          <span className="flex items-center gap-1.5">
            <input id="f-d1" type="date" className="campo" min={primero} max={ultimo} defaultValue={sp.get("d1") ?? ""}
                   onChange={(e) => poner({ d1: e.target.value })} aria-label="Desde" />
            <span className="text-sm text-[var(--tenue)]">–</span>
            <input id="f-d2" type="date" className="campo" min={primero} max={ultimo} defaultValue={sp.get("d2") ?? ultimo}
                   onChange={(e) => poner({ d2: e.target.value })} aria-label="Hasta" />
          </span>
        )}
        {comparar && (
        <label className="relative flex items-center">
          <GitCompareArrows size={15} className="absolute left-2.5 text-[var(--tenue)] pointer-events-none" aria-hidden />
          <select id="f-comparar" className="campo !pl-8" value={sp.get("c") ?? compararDefecto} onChange={(e) => poner({ c: e.target.value })} aria-label="Comparar con">
            {Object.entries(COMPARAR).map(([k, t]) => <option key={k} value={k}>{k === "no" ? t : `vs. ${t.toLowerCase()}`}</option>)}
          </select>
        </label>
        )}
        <div className="segmento" role="group" aria-label="Agrupar gráficos por">
          {[["dia", "Día"], ["semana", "Semana"], ["mes", "Mes"]].map(([k, t]) => (
            <button key={k} type="button" aria-pressed={agrupar === k} onClick={() => poner({ g: k === agruparDefecto ? null : k })}>{t}</button>
          ))}
        </div>

        {(grupos.length > 0 || stock || conDias) && <details className="relative">
          <summary className={`boton list-none ${activos ? "!border-[var(--acento)] !text-[var(--acento)]" : ""}`}>
            <ListFilter size={15} aria-hidden /> Filtros
            {activos > 0 && <span className="grid place-items-center size-5 rounded-full bg-[var(--acento)] text-white text-[11px]">{activos}</span>}
          </summary>
          <div className="flotante w-[min(92vw,560px)] p-4 grid gap-4 right-0 lg:left-0 lg:right-auto">
            {conDias && <div className="grid gap-2">
              <span className="etiqueta">Días de la semana</span>
              <div className="segmento w-fit" role="group" aria-label="Días de la semana">
                {DIAS_SEM.map((d, i) => (
                  <button key={d} type="button" aria-pressed={dias.includes(i)}
                          onClick={() => {
                            const nuevo = dias.includes(i) ? dias.filter((x) => x !== i) : [...dias, i].sort();
                            if (nuevo.length) poner({ ds: nuevo.length === 7 ? null : nuevo.join("") });
                          }}>{d}</button>
                ))}
              </div>
            </div>}
            {grupos.length > 0 && <div className="grid gap-2">
              <span className="etiqueta">Segmentar</span>
              <div className="flex flex-wrap gap-2">
                {grupos.map((g) => (
                  <Multiple key={g.clave} id={`f-${g.clave}`} etiqueta={g.etiqueta} opciones={visibles(g)} elegidos={lista(g.clave)} buscar={g.buscar}
                            cambiar={(v) => poner({ [g.clave]: v, ...Object.fromEntries((g.limpia ?? []).map((k) => [k, null])) })} />
                ))}
              </div>
            </div>}
            {stock && <div className="grid gap-2">
              <span className="etiqueta flex items-center gap-1.5"><SlidersHorizontal size={13} aria-hidden /> Parámetros de stock</span>
              <div className="grid sm:grid-cols-3 gap-2 text-xs text-[var(--tenue)]">
                <label className="grid gap-1">Ventana de venta (días)
                  <input id="f-v" type="number" min={7} max={60} className="campo" defaultValue={sp.get("v") ?? "14"}
                         onBlur={(e) => poner({ v: e.target.value === "14" ? null : e.target.value })} />
                </label>
                <label className="grid gap-1">Cobertura baja (&lt; semanas)
                  <input id="f-cb" type="number" min={0.5} max={8} step={0.5} className="campo" defaultValue={sp.get("cb") ?? "2"}
                         onBlur={(e) => poner({ cb: e.target.value === "2" ? null : e.target.value })} />
                </label>
                <label className="grid gap-1">Sobrestock (&gt; semanas)
                  <input id="f-ca" type="number" min={4} max={52} className="campo" defaultValue={sp.get("ca") ?? "13"}
                         onBlur={(e) => poner({ ca: e.target.value === "13" ? null : e.target.value })} />
                </label>
              </div>
            </div>}
          </div>
        </details>}

        {sp.toString() && (
          <button type="button" className="boton" onClick={() => iniciar(() => router.push(ruta))}>
            <RotateCcw size={14} aria-hidden /> Restablecer
          </button>
        )}
        {cargando && (
          <span className="flex items-center gap-1.5 text-xs text-[var(--tenue)]" role="status">
            <LoaderCircle size={14} className="animate-spin" aria-hidden /> Actualizando…
          </span>
        )}
      </div>
    </div>
  );
}
