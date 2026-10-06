"use client";

// Producto por tienda: qué producto deja más ingreso y cuál vende más unidades en cada tienda, y un mapa de calor
// tienda × producto con la participación de cada producto dentro de la tienda (un solo color: más intenso = más peso).
import { Fragment, useMemo, useState } from "react";
import type { ProductoTienda as Fila } from "@/lib/contanet";
import { entero, porcentaje, soles } from "@/lib/formato";
import { Tabla } from "./Tabla";

type Metrica = "venta" | "und";
const NOMBRE: Record<Metrica, string> = { venta: "Venta S/", und: "Unidades" };
/** Columnas del mapa: los productos que más pesan en el total; el resto va a «Otros». */
const COLUMNAS = 8;

export function ProductoTienda({ filas, dim, archivo }: { filas: Fila[]; dim: string; archivo: string }) {
  const [metrica, setMetrica] = useState<Metrica>("venta");
  const valor = (x: { und: number; venta: number }) => x[metrica];
  const fmt = (v: number) => (metrica === "venta" ? soles(v) : `${entero(v)} und`);

  const { tiendas, lideres, productos, celdas, maxPct } = useMemo(() => {
    const porTienda = new Map<string, Fila[]>();
    for (const f of filas) porTienda.set(f.tienda, [...(porTienda.get(f.tienda) ?? []), f]);
    const total = (xs: Fila[], m: Metrica) => xs.reduce((a, x) => a + x[m], 0);
    const tiendas = [...porTienda.keys()].sort((a, b) => total(porTienda.get(b)!, metrica) - total(porTienda.get(a)!, metrica));
    const lider = (xs: Fila[], m: Metrica) => [...xs].sort((a, b) => b[m] - a[m])[0];
    const lideres = tiendas.map((t) => {
      const xs = porTienda.get(t)!;
      const v = lider(xs, "venta"), u = lider(xs, "und");
      return { tienda: t, venta: v, pctVenta: v.venta / (total(xs, "venta") || 1), und: u, pctUnd: u.und / (total(xs, "und") || 1) };
    });
    const global = new Map<string, { sku: string; producto: string; v: number }>();
    for (const f of filas) {
      const g = global.get(f.sku) ?? { sku: f.sku, producto: f.producto || f.sku, v: 0 };
      g.v += valor(f); global.set(f.sku, g);
    }
    const orden = [...global.values()].sort((a, b) => b.v - a.v);
    const productos = orden.slice(0, COLUMNAS);
    const hayOtros = orden.length > COLUMNAS;
    const dentro = new Set(productos.map((p) => p.sku));
    let maxPct = 0;
    const celdas = new Map<string, { v: number; pct: number; lider: boolean }>();
    for (const t of tiendas) {
      const xs = porTienda.get(t)!, tot = total(xs, metrica) || 1, top = lider(xs, metrica);
      for (const p of productos) {
        const v = xs.filter((x) => x.sku === p.sku).reduce((a, x) => a + valor(x), 0);
        celdas.set(`${t}|${p.sku}`, { v, pct: v / tot, lider: top?.sku === p.sku && v > 0 });
        maxPct = Math.max(maxPct, v / tot);
      }
      if (hayOtros) {
        const v = xs.filter((x) => !dentro.has(x.sku)).reduce((a, x) => a + valor(x), 0);
        celdas.set(`${t}|otros`, { v, pct: v / tot, lider: false });
      }
    }
    return { tiendas, lideres, productos: hayOtros ? [...productos, { sku: "otros", producto: "Otros productos", v: 0 }] : productos, celdas, maxPct };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, metrica]);

  if (!filas.length) return null;
  const distintos = lideres.filter((l) => l.venta.sku !== l.und.sku).length;

  return (
    <div className="grid gap-6">
      {/* 1. Producto líder de cada tienda: el que más ingreso deja y el que más unidades vende. */}
      <div className="grid gap-2">
        <div className="grid gap-0.5">
          <h3 className="text-sm font-semibold">Producto líder por {dim.toLowerCase()}</h3>
          <p className="text-xs text-[var(--tenue)]">
            El que más ingreso deja y el que más unidades vende en cada {dim.toLowerCase()}; entre paréntesis, su peso dentro de la {dim.toLowerCase()}.
            {distintos > 0 && <> En <b className="text-[var(--tinta)]">{distintos}</b> de {lideres.length} el producto que más vende en unidades no es el que más ingreso deja.</>}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-xs text-[var(--tenue)] border-b border-[var(--linea)]">
                <th className="py-2 pr-3 font-medium">{dim}</th>
                <th className="py-2 pr-3 font-medium">Más ingreso</th>
                <th className="py-2 font-medium">Más unidades</th>
              </tr>
            </thead>
            <tbody>
              {lideres.map((l) => (
                <tr key={l.tienda} className="border-b border-[var(--linea)] last:border-0 align-top">
                  <td className="py-2 pr-3 font-medium">{l.tienda}</td>
                  <td className="py-2 pr-3">
                    <span className="block">{l.venta.producto}</span>
                    <span className="num text-xs text-[var(--tenue)]">{soles(l.venta.venta)} ({porcentaje(l.pctVenta)})</span>
                  </td>
                  <td className="py-2">
                    <span className="block">{l.und.producto}</span>
                    <span className="num text-xs text-[var(--tenue)]">{entero(l.und.und)} und ({porcentaje(l.pctUnd)})</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Mapa de calor tienda × producto: participación de cada producto dentro de la tienda. */}
      <div className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-0.5">
            <h3 className="text-sm font-semibold">Peso de cada producto en la {dim.toLowerCase()} ({NOMBRE[metrica].replace(" S/", "")})</h3>
            <p className="text-xs text-[var(--tenue)]">
              % de la {metrica === "venta" ? "venta" : "cantidad vendida"} de cada {dim.toLowerCase()} que hace cada producto. Más intenso = más peso;
              con borde, el líder de la {dim.toLowerCase()}. Pasa el cursor para ver el monto.
            </p>
          </div>
          <div className="segmento" role="group" aria-label="Medir por">
            {(["venta", "und"] as Metrica[]).map((m) => (
              <button key={m} type="button" aria-pressed={metrica === m} onClick={() => setMetrica(m)}>{NOMBRE[m]}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="grid gap-[2px] min-w-[640px] text-xs" style={{ gridTemplateColumns: `minmax(110px, 1.2fr) repeat(${productos.length}, minmax(64px, 1fr))` }}>
            <span />
            {productos.map((p) => (
              <span key={p.sku} className="px-1 pb-1 text-[11px] leading-tight text-[var(--tenue)] self-end" title={`${p.producto} (${p.sku})`}>{p.producto}</span>
            ))}
            {tiendas.map((t) => (
              <Fragment key={t}>
                <span className="flex items-center pr-2 font-medium text-[13px] truncate">{t}</span>
                {productos.map((p) => {
                  const c = celdas.get(`${t}|${p.sku}`) ?? { v: 0, pct: 0, lider: false };
                  const fuerza = maxPct ? Math.round((c.pct / maxPct) * 62) : 0;
                  return (
                    <span key={p.sku} title={`${t} · ${p.producto}: ${fmt(c.v)} (${porcentaje(c.pct)} de la ${dim.toLowerCase()})`}
                          className={`num h-10 grid place-items-center rounded-md ${c.lider ? "font-semibold ring-2 ring-inset ring-[var(--tinta)]" : ""}`}
                          style={{ background: `color-mix(in srgb, var(--serie-1) ${fuerza}%, var(--superficie-2))` }}>
                      {c.v ? porcentaje(c.pct) : "—"}
                    </span>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </div>

      <details className="grid gap-2">
        <summary className="cursor-pointer text-sm font-medium w-fit">Ver la tabla completa {dim.toLowerCase()} × producto</summary>
        <Tabla archivo={archivo} hoja={`${dim} x producto`} alto={420} buscar
               filas={filas.map((f) => {
                 const tot = filas.filter((x) => x.tienda === f.tienda).reduce((a, x) => ({ v: a.v + x.venta, u: a.u + x.und }), { v: 0, u: 0 });
                 return { ...f, pct_venta: tot.v ? f.venta / tot.v : null, pct_und: tot.u ? f.und / tot.u : null };
               }).sort((a, b) => a.tienda.localeCompare(b.tienda) || b.venta - a.venta)}
               columnas={[{ clave: "tienda", titulo: dim, tipo: "texto" }, { clave: "producto", titulo: "Producto", tipo: "texto" },
                 { clave: "sku", titulo: "SKU", tipo: "texto" }, { clave: "und", titulo: "Unidades", tipo: "entero" },
                 { clave: "pct_und", titulo: `% und de la ${dim.toLowerCase()}`, tipo: "porcentaje" }, { clave: "venta", titulo: "Venta S/", tipo: "soles" },
                 { clave: "pct_venta", titulo: `% venta de la ${dim.toLowerCase()}`, tipo: "porcentaje" }]} />
      </details>
    </div>
  );
}
