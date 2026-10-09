"use client";

// Productos más vendidos (Resumen general): 1) ranking del periodo en barras horizontales partidas por canal y 2) mapa de calor
// producto × mes, donde cada fila se pinta contra su propio máximo (muestra la temporada de cada producto). Selector Unidades /
// Venta S/; pasar el mouse por un producto resalta su fila en los dos gráficos. Los números completos están en las tablas de abajo.
import { useState } from "react";
import { entero, porcentaje, soles } from "@/lib/formato";

export type ProductoGrafico = {
  sku: string; producto: string; und: number; venta: number;
  canales: Record<string, { und: number; venta: number }>;
  /** Por columna del mapa de calor (mes, semana o día). */ meses: Record<string, { und: number; venta: number }>;
};
/** Orden y color fijos de cada canal (paleta validada: se distinguen entre sí, también con daltonismo, en claro y oscuro). */
const CANALES: { clave: string; nombre: string; color: string }[] = [
  { clave: "TIENDAS", nombre: "Tiendas", color: "var(--canal-tiendas)" }, { clave: "LIMA", nombre: "Lima", color: "var(--canal-lima)" },
  { clave: "RETAIL", nombre: "Retail", color: "var(--canal-retail)" }, { clave: "PROVINCIA", nombre: "Provincia", color: "var(--canal-provincia)" },
];
type Medida = "und" | "venta";

export function GraficosProductos({ productos, meses, etiquetas, total, grupos: todos = CANALES, soloGrupos, nombreGrupos = "canal", unidad = "mes", plural = "meses" }: {
  productos: ProductoGrafico[]; /** Columnas del mapa de calor: meses (1–12) o periodos («2026-10-05»). */ meses: (number | string)[];
  /** Nombre de cada columna para mostrar. */ etiquetas: Record<string, string>; total: { und: number; venta: number };
  /** Cómo se parte cada barra del ranking (por defecto, los canales); vacío = barra de un solo color. */ grupos?: { clave: string; nombre: string; color: string }[];
  /** Solo estos grupos (p. ej. los canales elegidos arriba). */ soloGrupos?: string[]; nombreGrupos?: string; /** Columna del mapa de calor en palabras: «mes», «semana», «día». */ unidad?: string; plural?: string;
}) {
  const etiquetaMes = (m: number | string) => etiquetas[m] ?? String(m);
  const grupos = soloGrupos ? todos.filter((g) => soloGrupos.includes(g.clave)) : todos;
  const [medida, setMedida] = useState<Medida>("und");
  const [foco, setFoco] = useState<string | null>(null);
  const [celda, setCelda] = useState<{ sku: string; mes: number | string } | null>(null);
  const fmt = (v: number) => (medida === "und" ? `${entero(v)} und` : soles(v));
  const orden = [...productos].sort((a, b) => b[medida] - a[medida]);
  const max = orden[0]?.[medida] || 1;
  const celdaSel = celda ? orden.find((p) => p.sku === celda.sku) : undefined;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--tenue)]" aria-label="Colores de las barras">
          {grupos.map((c) => (
            <li key={c.clave} className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm" style={{ background: c.color }} aria-hidden />{c.nombre}</li>
          ))}
        </ul>
        <div className="segmento" role="group" aria-label="Medir por">
          {([["und", "Unidades"], ["venta", "Venta S/"]] as [Medida, string][]).map(([k, t]) => (
            <button key={k} type="button" aria-pressed={medida === k} onClick={() => setMedida(k)}>{t}</button>
          ))}
        </div>
      </div>

      {/* 1. Ranking: barras partidas por canal (2 px de separación entre tramos) */}
      <section className="grid gap-2" aria-labelledby="pg-ranking">
        <h4 id="pg-ranking" className="text-sm font-semibold">Ranking del periodo · {medida === "und" ? "unidades" : "venta"}{grupos.length ? ` por ${nombreGrupos}` : ""}</h4>
        <ol className="grid gap-1">
          {orden.map((p, i) => {
            const on = foco === p.sku;
            return (
              <li key={p.sku} onMouseEnter={() => setFoco(p.sku)} onMouseLeave={() => setFoco(null)}
                  className={`grid grid-cols-[1.25rem_minmax(0,13rem)_1fr_auto] items-center gap-3 rounded-md px-1.5 py-1 text-sm ${on ? "bg-[var(--superficie-2)]" : ""}`}>
                <span className="num text-right text-xs text-[var(--tenue)]">{i + 1}</span>
                <span className={`truncate ${on ? "font-semibold" : ""}`} title={`${p.producto} · ${p.sku}`}>{p.producto}</span>
                <span className="flex h-3.5 gap-[2px]" style={{ width: `${(p[medida] / max) * 100}%` }}
                      title={grupos.filter((c) => p.canales[c.clave]?.[medida]).map((c) => `${c.nombre}: ${fmt(p.canales[c.clave][medida])}`).join(" · ")}>
                  {grupos.length ? grupos.map((c) => {
                    const v = p.canales[c.clave]?.[medida] ?? 0;
                    return v > 0 ? <span key={c.clave} className="h-full first:rounded-l-sm last:rounded-r-sm" style={{ flexGrow: v, background: c.color }} /> : null;
                  }) : <span className="h-full grow rounded-sm bg-[var(--serie-1)]" />}
                </span>
                <span className="num whitespace-nowrap text-right text-xs">
                  {fmt(p[medida])} <span className="text-[var(--tenue)]">· {porcentaje(p[medida] / (total[medida] || 1))}</span>
                </span>
              </li>
            );
          })}
        </ol>
        <p className="text-xs text-[var(--tenue)]">El % es sobre el total de todos los productos.{grupos.length ? ` Pasa el mouse por una barra para ver cuánto aporta cada ${nombreGrupos}.` : ""}</p>
      </section>

      {/* 2. Mapa de calor producto × mes: cada fila contra su propio máximo */}
      <section className="grid gap-2" aria-labelledby="pg-calor">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 id="pg-calor" className="text-sm font-semibold">En qué {plural} se vende cada producto</h4>
          <p className="min-h-5 text-xs" aria-live="polite">
            {celda && celdaSel
              ? <><b>{celdaSel.producto}</b> · {etiquetaMes(celda.mes)}: <span className="num">{fmt(celdaSel.meses[celda.mes]?.[medida] ?? 0)}</span></>
              : <span className="text-[var(--tenue)]">Pasa el mouse o toca una celda para ver el número.</span>}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-separate border-spacing-[3px] text-xs">
            <thead>
              <tr>
                <th className="text-left font-medium text-[var(--tenue)]"><span className="sr-only">Producto</span></th>
                {meses.map((m) => <th key={m} scope="col" className="font-medium text-[var(--tenue)]">{etiquetaMes(m)}</th>)}
              </tr>
            </thead>
            <tbody>
              {orden.map((p) => {
                const tope = Math.max(...meses.map((m) => p.meses[m]?.[medida] ?? 0), 1);
                const on = foco === p.sku;
                return (
                  <tr key={p.sku} onMouseEnter={() => setFoco(p.sku)} onMouseLeave={() => setFoco(null)}>
                    <th scope="row" className={`max-w-[13rem] truncate pr-2 text-left text-[13px] ${on ? "font-semibold" : "font-normal"}`} title={p.producto}>{p.producto}</th>
                    {meses.map((m) => {
                      const v = p.meses[m]?.[medida] ?? 0, r = v / tope;
                      const sel = celda?.sku === p.sku && celda.mes === m;
                      return (
                        <td key={m} tabIndex={0} aria-label={`${p.producto}, ${etiquetaMes(m)}: ${fmt(v)}`}
                            onMouseEnter={() => setCelda({ sku: p.sku, mes: m })} onFocus={() => setCelda({ sku: p.sku, mes: m })} onClick={() => setCelda({ sku: p.sku, mes: m })}
                            className={`h-7 min-w-9 rounded outline-none ${sel ? "ring-2 ring-[var(--tinta)]" : ""} ${on ? "ring-1 ring-[var(--linea)]" : ""}`}
                            style={{ background: v > 0 ? `color-mix(in srgb, var(--serie-1) ${Math.round(12 + r * 83)}%, var(--superficie))` : "var(--neutro-suave)" }} />
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="flex flex-wrap items-center gap-2 text-xs text-[var(--tenue)]">
          Cada fila se pinta contra el mejor {unidad} de ese producto:
          <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-10 rounded-sm" style={{ background: "linear-gradient(90deg, color-mix(in srgb, var(--serie-1) 12%, var(--superficie)), var(--serie-1))" }} aria-hidden /> poco → su mejor {unidad}</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block size-3 rounded-sm bg-[var(--neutro-suave)]" aria-hidden /> sin venta</span>
        </p>
      </section>
    </div>
  );
}
