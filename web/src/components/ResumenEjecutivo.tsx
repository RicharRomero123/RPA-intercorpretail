"use client";

import { LineChart, Package, PieChart, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { entero, porcentaje, soles } from "@/lib/formato";
import { GraficoTendencia, Indicador } from "./Graficos";
import { Tabla, type Columna } from "./Tabla";
import { Tarjeta } from "./ui";
import { EJE, GRILLA, CAJA, LEYENDA, compacto } from "@/lib/graficos";

/** Venta por «cliente» (tienda, cadena, razón social…) y SKU en un periodo. */
export type FilaDim = { dim: string; sku: string; producto: string; und: number; venta: number };
/** Venta por mes y SKU (para la evolución). */
export type FilaMes = { mes: string; sku: string; producto: string; und: number; venta: number };
/** Qué es «cliente» en cada canal (cadena, tienda, razón social…) y cómo se llama la venta. */
export type ConfigEjecutivo = { dim: string; dims: string; activos: string; venta: string; nota?: string };
export type DatosEjecutivo = { actual: FilaDim[]; anterior: FilaDim[]; meses: FilaMes[]; mesesLY: FilaMes[] };

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const COLORES = ["#c2570c", "#6b2a0f", "#e0a33a", "#8a8f3c", "#3f7d8c", "#c9c2b8"];
const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const dmy = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
const menosUnAnio = (s: string) => `${Number(s.slice(0, 4)) - 1}${s.slice(4)}`;
const finDeMes = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
const corto = (s: string) => (s.length > 24 ? `${s.slice(0, 23)}…` : s);
const variacion = (a: number, b: number | null | undefined) => (b ? a / b - 1 : null);
const div = (a: number, b: number) => (b ? a / b : null);
type Suma = { und: number; venta: number };
const sumar = (xs: Suma[]): Suma => xs.reduce((a, x) => ({ und: a.und + x.und, venta: a.venta + x.venta }), { und: 0, venta: 0 });
function porClave<T extends Suma>(xs: T[], clave: (x: T) => string) {
  const m = new Map<string, Suma>();
  for (const x of xs) { const k = clave(x); const s = m.get(k) ?? { und: 0, venta: 0 }; s.und += x.und; s.venta += x.venta; m.set(k, s); }
  return m;
}

/** Participación por «cliente» con cada barra partida en sus 5 SKU principales (los mismos colores para todos) y «Otros». */
function ParticipacionPorSku({ C, total, dim }: { C: FilaDim[]; total: number; dim: string }) {
  const nombre = new Map(C.map((f) => [f.sku, f.producto]));
  const topSku = [...porClave(C, (f) => f.sku).entries()].sort((a, b) => b[1].venta - a[1].venta).slice(0, 5).map(([s]) => s);
  const dims = [...porClave(C, (f) => f.dim).entries()].sort((a, b) => b[1].venta - a[1].venta);
  const visibles = dims.slice(0, 10);
  const datos = visibles.map(([d, s]) => {
    const deDim = C.filter((f) => f.dim === d);
    const fila: Record<string, number | string> = { nombre: corto(d), completo: d, total: s.venta };
    for (const k of topSku) fila[k] = deDim.filter((f) => f.sku === k).reduce((a, f) => a + f.venta, 0);
    fila.otros = s.venta - topSku.reduce((a, k) => a + Number(fila[k]), 0);
    return fila;
  });
  const series = [...topSku.map((k) => ({ clave: k, nombre: nombre.get(k) ?? k })), { clave: "otros", nombre: "Otros productos" }];
  return (
    <div className="grid gap-2">
      <ResponsiveContainer width="100%" height={Math.max(220, datos.length * 34 + 70)}>
        <BarChart data={datos} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} {...GRILLA} />
          <XAxis type="number" tick={EJE} tickFormatter={(v) => compacto(Number(v))} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="nombre" tick={EJE} width={170} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "var(--superficie-2)" }}
                   formatter={(v, n, p) => [`${soles(Number(v))} · ${porcentaje(Number(v) / Number(p?.payload?.total || 1))}`, String(n)]}
                   labelFormatter={(_, p) => { const x = p?.[0]?.payload; return x ? `${x.completo} · ${soles(Number(x.total))} (${porcentaje(Number(x.total) / (total || 1))} del total)` : ""; }}
                   contentStyle={CAJA} />
          <Legend wrapperStyle={LEYENDA} />
          {series.map((s, i) => <Bar key={s.clave} dataKey={s.clave} name={s.nombre} stackId="a" fill={COLORES[i]} maxBarSize={24} />)}
        </BarChart>
      </ResponsiveContainer>
      <ul className="grid gap-1 text-xs @2xl:grid-cols-2">
        {visibles.map(([d, s]) => (
          <li key={d} className="flex justify-between gap-3 border-b border-dashed border-[var(--linea)] pb-1">
            <span className="truncate">{d}</span><span className="num shrink-0">{soles(s.venta)} · {porcentaje(div(s.venta, total))}</span>
          </li>
        ))}
      </ul>
      {dims.length > visibles.length && <p className="text-xs text-[var(--tenue)]">Se muestran los 10 {dim.toLowerCase()}s con más venta de {dims.length}.</p>}
    </div>
  );
}

/** Resumen ejecutivo en 4 vistas: 1) resumen, 2) evolución del negocio, 3) performance por cliente, 4) performance por SKU.
 *  Usa el periodo y los filtros de la página y siempre compara con las mismas fechas del año anterior. */
export function ResumenEjecutivo({ datos, desde, hasta, config, archivo }: {
  datos: DatosEjecutivo; desde: string; hasta: string; config: ConfigEjecutivo; archivo: string;
}) {
  const { actual: C, anterior: L } = datos;
  const RC = sumar(C), RL = sumar(L);
  const hayLY = RL.venta !== 0 || RL.und !== 0;
  const dimC = porClave(C, (f) => f.dim), dimL = porClave(L, (f) => f.dim);
  const activos = [...dimC.values()].filter((s) => s.venta > 0).length;
  const activosL = [...dimL.values()].filter((s) => s.venta > 0).length;
  const textoPeriodo = `${dmy(desde)} – ${dmy(hasta)}`;
  const textoLY = `${dmy(menosUnAnio(desde))} – ${dmy(menosUnAnio(hasta))}`;
  const anioAnt = Number(hasta.slice(0, 4)) - 1;
  const comparadoCon = `mismas fechas ${anioAnt}`;

  // 2. Evolución: 12 meses que terminan en el mes de «hasta» (el último, cortado al mismo día que el periodo).
  const mesFin = hasta.slice(0, 7);
  const parcial = hasta < finDeMes(mesFin);
  const ventana: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(Number(mesFin.slice(0, 4)), Number(mesFin.slice(5, 7)) - 1 - i, 1));
    ventana.push(d.toISOString().slice(0, 7));
  }
  const totMes = porClave(datos.meses, (f) => f.mes), totMesLY = porClave(datos.mesesLY, (f) => f.mes);
  const anioFin = mesFin.slice(0, 4);
  const evolucion = ventana.map((m, i) => {
    const t = totMes.get(m) ?? { und: 0, venta: 0 }, p = i ? totMes.get(ventana[i - 1]) : undefined, a = totMesLY.get(m);
    // Acumulado del año: solo para los meses del año del periodo (enero ya está dentro de la ventana).
    const delAnio = m.slice(0, 4) === anioFin ? ventana.filter((x) => x.slice(0, 4) === anioFin && x <= m) : null;
    const ac = delAnio ? sumar(delAnio.map((x) => totMes.get(x) ?? { und: 0, venta: 0 })) : null;
    const acL = delAnio && delAnio.some((x) => totMesLY.has(x)) ? sumar(delAnio.map((x) => totMesLY.get(x) ?? { und: 0, venta: 0 })) : null;
    return { mes: `${nombreMes(m)}${m === mesFin && parcial ? ` (al ${hasta.slice(8, 10)})` : ""}`, clave: m, und: t.und, venta: t.venta,
             var_mes: p ? variacion(t.venta, p.venta) : null, venta_ly: a?.venta ?? null, var_ly: variacion(t.venta, a?.venta),
             acumulado: ac?.venta ?? null, acumulado_ly: acL?.venta ?? null, var_acum: ac && acL ? variacion(ac.venta, acL.venta) : null };
  });
  const tendencia = evolucion.map((e) => ({ periodo: `${e.clave}-01`, venta: e.venta, und: e.und, costo: 0,
    venta_c: e.venta_ly, und_c: totMesLY.get(e.clave)?.und ?? null, costo_c: null }));

  // 3. Por cliente (incluye a los del año anterior que no compraron en el periodo, para que el TOTAL cuadre).
  const porDim = [...dimC.entries()].map(([dim, s]) => ({ dim, und: s.und, venta: s.venta, pct: div(s.venta, RC.venta),
    venta_ly: hayLY ? dimL.get(dim)?.venta ?? 0 : null, var: variacion(s.venta, dimL.get(dim)?.venta) })).sort((a, b) => b.venta - a.venta);
  const perdidos = [...dimL.entries()].filter(([d]) => !dimC.has(d)).map(([dim, s]) => ({ dim, und: 0, venta: 0, pct: 0, venta_ly: s.venta, var: -1 }));

  // 4. Por SKU: mix, cliente principal y evolución de los últimos 6 meses de la ventana.
  const seis = ventana.slice(-6);
  const skuC = porClave(C, (f) => f.sku), skuL = porClave(L, (f) => f.sku);
  const nombreSku = new Map([...datos.meses, ...C].map((f) => [f.sku, f.producto]));
  const porSku = [...skuC.entries()].map(([sku, s]) => {
    const deSku = porClave(C.filter((f) => f.sku === sku), (f) => f.dim);
    const [principal, sp] = [...deSku.entries()].sort((a, b) => b[1].venta - a[1].venta)[0] ?? ["—", { venta: 0 }];
    const evo = Object.fromEntries(seis.map((m) => [`m_${m}`, sumar(datos.meses.filter((f) => f.mes === m && f.sku === sku)).venta]));
    return { producto: nombreSku.get(sku) ?? sku, sku, und: s.und, venta: s.venta, mix: div(s.venta, RC.venta),
             var: hayLY ? variacion(s.venta, skuL.get(sku)?.venta) : null, principal, principal_pct: div(sp.venta, s.venta), ...evo };
  }).sort((a, b) => b.venta - a.venta);
  const totalSeis = Object.fromEntries(seis.map((m) => [`m_${m}`, totMes.get(m)?.venta ?? 0]));

  const vacio = !C.length;
  const sinDatos = <p className="text-sm text-[var(--tenue)]">Sin ventas con este periodo y estos filtros.</p>;

  return (
    <div className="grid gap-6">
      <p className="text-sm text-[var(--tenue)] -mt-2">
        Usa el <b className="text-[var(--tinta)]">periodo y los filtros de arriba</b> ({textoPeriodo}) y siempre se compara con
        las <b className="text-[var(--tinta)]">mismas fechas del año anterior</b> ({hayLY ? textoLY : `${textoLY}: sin datos`}).
        {config.nota && <> {config.nota}</>}
      </p>

      {/* 1. Resumen ejecutivo */}
      <section className="grid gap-4">
        <h2 className="text-lg font-bold">1. Resumen ejecutivo</h2>
        <div className="grid gap-4 grid-cols-1 @lg:grid-cols-2 @5xl:grid-cols-4">
          <Indicador icono="venta" titulo={config.venta} valor={soles(RC.venta)} variacion={hayLY ? variacion(RC.venta, RL.venta) : null}
                     comparadoCon={comparadoCon} detalle={textoPeriodo} />
          <Indicador icono="unidades" titulo="Unidades" valor={entero(RC.und)} variacion={hayLY ? variacion(RC.und, RL.und) : null} comparadoCon={comparadoCon} />
          <Indicador icono="rotacion" titulo={config.activos} valor={entero(activos)} variacion={hayLY ? variacion(activos, activosL) : null}
                     comparadoCon={comparadoCon} detalle="con venta en el periodo" />
          <Indicador icono="ingreso" titulo={`Crecimiento vs ${anioAnt}`}
                     valor={hayLY ? `${RC.venta >= RL.venta ? "+" : ""}${porcentaje(variacion(RC.venta, RL.venta))}` : "—"}
                     detalle={hayLY ? `${soles(RC.venta - RL.venta)} frente a ${soles(RL.venta)}` : `Sin datos de ${anioAnt} en esas fechas`} />
        </div>
        {!vacio && (
          <Tarjeta icono={PieChart} titulo={`Participación por ${config.dim.toLowerCase()} y sus 5 productos principales`} subtitulo={textoPeriodo}>
            <ParticipacionPorSku C={C} total={RC.venta} dim={config.dim} />
          </Tarjeta>
        )}
      </section>

      {/* 2. Evolución del negocio */}
      <section className="grid gap-4">
        <h2 className="text-lg font-bold">2. Evolución del negocio</h2>
        <GraficoTendencia datos={tendencia} agrupar="mes" conPrevio={tendencia.some((t) => t.venta_c)} nombrePrevio="Mismo mes, año anterior"
                          rango={`${nombreMes(ventana[0])} – ${nombreMes(mesFin)}`} metricas={["venta", "und"]} nombres={{ venta: config.venta.replace(" S/", "") }} />
        <Tarjeta icono={LineChart} titulo="Mes a mes y acumulado del año"
                 subtitulo={`Los 12 meses que terminan en ${nombreMes(mesFin)}, con los filtros de arriba. Acumulado: de enero a ese mes vs el mismo tramo del año anterior.`}>
          <Tabla archivo={`${archivo}_evolucion.xlsx`} hoja="Evolución" filas={[...evolucion].reverse()}
                 columnas={[{ clave: "mes", titulo: "Mes", tipo: "texto" }, { clave: "und", titulo: "Unidades", tipo: "entero" },
                   { clave: "venta", titulo: "Venta S/", tipo: "soles" }, { clave: "var_mes", titulo: "vs mes anterior", tipo: "porcentaje" },
                   { clave: "venta_ly", titulo: "Mismo mes año ant. S/", tipo: "soles" }, { clave: "var_ly", titulo: "vs año anterior", tipo: "porcentaje" },
                   { clave: "acumulado", titulo: "Acumulado año S/", tipo: "soles" }, { clave: "acumulado_ly", titulo: "Acumulado año ant. S/", tipo: "soles" },
                   { clave: "var_acum", titulo: "Var. acumulado", tipo: "porcentaje" }]} />
        </Tarjeta>
      </section>

      {/* 3. Performance por cliente */}
      <section className="grid gap-4">
        <h2 className="text-lg font-bold">3. Performance por {config.dim.toLowerCase()}</h2>
        <Tarjeta icono={Users} titulo={`Por ${config.dim.toLowerCase()}`} subtitulo={`${textoPeriodo} vs ${textoLY}`}>
          {vacio ? sinDatos : (
            <Tabla archivo={`${archivo}_por_${config.dim.toLowerCase()}.xlsx`} hoja={config.dim} buscar filas={[...porDim, ...perdidos]}
                   columnas={[{ clave: "dim", titulo: config.dim, tipo: "texto" }, { clave: "und", titulo: "Unidades", tipo: "entero" },
                     { clave: "venta", titulo: "Venta S/", tipo: "soles" }, { clave: "pct", titulo: "% participación", tipo: "porcentaje" },
                     ...(hayLY ? [{ clave: "venta_ly", titulo: "Año anterior S/", tipo: "soles" } as Columna,
                                  { clave: "var", titulo: "Crecimiento", tipo: "porcentaje", info: "variacion" } as Columna] : [])]}
                   total={{ dim: "TOTAL", und: RC.und, venta: RC.venta, pct: 1, venta_ly: hayLY ? RL.venta : null, var: hayLY ? variacion(RC.venta, RL.venta) : null }} />
          )}
        </Tarjeta>
      </section>

      {/* 4. Performance por SKU */}
      <section className="grid gap-4">
        <h2 className="text-lg font-bold">4. Performance por SKU</h2>
        <Tarjeta icono={Package} titulo="Por producto" subtitulo={`${textoPeriodo} · evolución: venta S/ de ${nombreMes(seis[0])} a ${nombreMes(mesFin)}`}>
          {vacio ? sinDatos : (
            <Tabla archivo={`${archivo}_por_sku.xlsx`} hoja="Por SKU" alto={560} buscar filas={porSku}
                   columnas={[{ clave: "producto", titulo: "Producto", tipo: "texto" }, { clave: "sku", titulo: "SKU", tipo: "texto" },
                     { clave: "und", titulo: "Unidades", tipo: "entero" }, { clave: "venta", titulo: "Venta S/", tipo: "soles" },
                     { clave: "mix", titulo: "Mix %", tipo: "porcentaje", info: "mix" },
                     ...(hayLY ? [{ clave: "var", titulo: `vs ${anioAnt}`, tipo: "porcentaje" } as Columna] : []),
                     { clave: "principal", titulo: `${config.dim} principal`, tipo: "texto" }, { clave: "principal_pct", titulo: "% del SKU", tipo: "porcentaje" },
                     ...seis.map((m) => ({ clave: `m_${m}`, titulo: nombreMes(m), tipo: "soles" }) as Columna)]}
                   total={{ producto: "TOTAL", und: RC.und, venta: RC.venta, mix: 1, var: hayLY ? variacion(RC.venta, RL.venta) : null, ...totalSeis }} />
          )}
        </Tarjeta>
      </section>
    </div>
  );
}
