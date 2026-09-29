"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { COMPARAR, DIAS_SEM, PERIODOS } from "@/lib/periodos";

type Opcion = { valor: string; texto: string };

/** Lista desplegable con casillas; vacía = todos. */
function Multiple({ id, etiqueta, opciones, elegidos, cambiar, buscar = false }: {
  id: string; etiqueta: string; opciones: Opcion[]; elegidos: string[]; cambiar: (v: string[]) => void; buscar?: boolean;
}) {
  const [texto, setTexto] = useState("");
  const visibles = opciones.filter((o) => o.texto.toLowerCase().includes(texto.toLowerCase()));
  const resumen = elegidos.length === 0 ? "Todos" : elegidos.length === 1
    ? opciones.find((o) => o.valor === elegidos[0])?.texto ?? "1" : `${elegidos.length} elegidos`;
  return (
    <details className="relative">
      <summary className="campo cursor-pointer list-none flex items-center gap-2 min-w-40">
        <span className="text-[var(--tenue)]">{etiqueta}:</span> <span className="truncate max-w-40">{resumen}</span> <span aria-hidden>▾</span>
      </summary>
      <div className="absolute z-20 mt-1 w-72 tarjeta p-2 shadow-lg grid gap-1">
        {buscar && <input id={`${id}-buscar`} className="campo" placeholder="Buscar…" value={texto} onChange={(e) => setTexto(e.target.value)} />}
        <div className="max-h-64 overflow-auto grid gap-0.5">
          {visibles.map((o) => (
            <label key={o.valor} className="flex items-center gap-2 text-sm px-1 py-0.5 rounded hover:bg-[var(--acento-suave)]">
              <input type="checkbox" checked={elegidos.includes(o.valor)}
                     onChange={(e) => cambiar(e.target.checked ? [...elegidos, o.valor] : elegidos.filter((v) => v !== o.valor))} />
              {o.texto}
            </label>
          ))}
        </div>
        {elegidos.length > 0 && <button type="button" className="boton text-xs" onClick={() => cambiar([])}>Quitar filtro</button>}
      </div>
    </details>
  );
}

export function Filtros({ productos, cadenas, zonas, locales, ultimo, primero }: {
  productos: Opcion[]; cadenas: string[]; zonas: string[]; locales: (Opcion & { cadena: string; zona: string })[];
  ultimo: string; primero: string;
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

  const periodo = sp.get("p") ?? "mes";
  const dias = sp.get("ds") ? sp.get("ds")!.split("").map(Number) : [0, 1, 2, 3, 4, 5, 6];
  const cad = lista("cad"), zon = lista("zona");
  const localesOp = locales.filter((l) => (!cad.length || cad.includes(l.cadena)) && (!zon.length || zon.includes(l.zona)));

  return (
    <section className="tarjeta p-3 grid gap-3" aria-label="Filtros">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="etiqueta">Periodo</span>
          <select id="f-periodo" className="campo" value={periodo} onChange={(e) => poner({ p: e.target.value })}>
            {Object.entries(PERIODOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </label>
        {periodo === "personalizado" && (
          <>
            <input id="f-d1" type="date" className="campo" min={primero} max={ultimo} defaultValue={sp.get("d1") ?? ""}
                   onChange={(e) => poner({ d1: e.target.value })} aria-label="Desde" />
            <span className="text-sm">al</span>
            <input id="f-d2" type="date" className="campo" min={primero} max={ultimo} defaultValue={sp.get("d2") ?? ultimo}
                   onChange={(e) => poner({ d2: e.target.value })} aria-label="Hasta" />
          </>
        )}
        <label className="flex items-center gap-2 text-sm">
          <span className="etiqueta">Comparar con</span>
          <select id="f-comparar" className="campo" value={sp.get("c") ?? "ant"} onChange={(e) => poner({ c: e.target.value })}>
            {Object.entries(COMPARAR).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-1" role="group" aria-label="Agrupar gráficos por">
          <span className="etiqueta mr-1">Agrupar</span>
          {[["dia", "Día"], ["semana", "Semana"], ["mes", "Mes"]].map(([k, t]) => (
            <button key={k} type="button" className="chip-filtro" aria-pressed={(sp.get("g") ?? "dia") === k}
                    onClick={() => poner({ g: k === "dia" ? null : k })}>{t}</button>
          ))}
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Días de la semana">
          <span className="etiqueta mr-1">Días</span>
          {DIAS_SEM.map((d, i) => (
            <button key={d} type="button" className="chip-filtro" aria-pressed={dias.includes(i)}
                    onClick={() => {
                      const nuevo = dias.includes(i) ? dias.filter((x) => x !== i) : [...dias, i].sort();
                      if (nuevo.length) poner({ ds: nuevo.length === 7 ? null : nuevo.join("") });
                    }}>{d}</button>
          ))}
        </div>
        {cargando && <span className="text-xs text-[var(--tenue)]" role="status">Actualizando…</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Multiple id="f-prod" etiqueta="Producto" opciones={productos} elegidos={lista("prod")} cambiar={(v) => poner({ prod: v })} />
        <Multiple id="f-cad" etiqueta="Cadena" opciones={cadenas.map((c) => ({ valor: c, texto: c }))} elegidos={cad}
                  cambiar={(v) => poner({ cad: v, loc: null })} />
        <Multiple id="f-zona" etiqueta="Zona" opciones={zonas.map((z) => ({ valor: z, texto: z }))} elegidos={zon}
                  cambiar={(v) => poner({ zona: v, loc: null })} />
        <Multiple id="f-loc" etiqueta="Local" opciones={localesOp} elegidos={lista("loc")} cambiar={(v) => poner({ loc: v })} buscar />
        <details className="relative">
          <summary className="campo cursor-pointer list-none">⚙ Parámetros</summary>
          <div className="absolute z-20 mt-1 w-80 tarjeta p-3 shadow-lg grid gap-3 text-sm">
            <label className="grid gap-1">Ventana de venta reciente (días)
              <input id="f-v" type="number" min={7} max={60} className="campo" defaultValue={sp.get("v") ?? "14"}
                     onBlur={(e) => poner({ v: e.target.value === "14" ? null : e.target.value })} />
            </label>
            <label className="grid gap-1">Cobertura baja: menos de (semanas)
              <input id="f-cb" type="number" min={0.5} max={8} step={0.5} className="campo" defaultValue={sp.get("cb") ?? "2"}
                     onBlur={(e) => poner({ cb: e.target.value === "2" ? null : e.target.value })} />
            </label>
            <label className="grid gap-1">Sobrestock: más de (semanas)
              <input id="f-ca" type="number" min={4} max={52} className="campo" defaultValue={sp.get("ca") ?? "13"}
                     onBlur={(e) => poner({ ca: e.target.value === "13" ? null : e.target.value })} />
            </label>
            <p className="text-xs text-[var(--tenue)]">Se aplican al salir de cada campo.</p>
          </div>
        </details>
        {sp.toString() && <button type="button" className="boton" onClick={() => iniciar(() => router.push(ruta))}>Limpiar filtros</button>}
      </div>
    </section>
  );
}
