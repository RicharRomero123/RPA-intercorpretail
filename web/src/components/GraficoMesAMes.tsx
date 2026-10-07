"use client";

// Mes a mes del Resumen ejecutivo: barra de venta por mes, la meta como raya sobre la barra (marcador de meta) y el año anterior como
// punto gris. Bajo cada mes, su % de cumplimiento con el color y la palabra del estado. Tocar un mes con venta lo elige.
import { Bar, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { porcentaje, soles } from "@/lib/formato";
import { CAJA, EJE, GRILLA, RADIO_V, compacto } from "@/lib/graficos";

export type PuntoMes = { mes: number; real: number | null; meta: number | null; anterior: number | null };
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const colorEstado = (c: number | null) => (c === null ? "var(--tenue)" : c >= 1 ? "var(--bueno)" : c >= 0.9 ? "var(--alerta)" : "var(--critico)");

/** Meta: raya horizontal un poco más ancha que la barra, a la altura de la meta. */
function Marca(p: { x?: number; y?: number; width?: number }) {
  if (p.x === undefined || p.y === undefined || !p.width) return <g />;
  return <rect x={p.x - 4} y={p.y - 1.5} width={p.width + 8} height={3} rx={1.5} fill="var(--serie-2)" />;
}

export function GraficoMesAMes({ datos, anio, seleccion, alElegir }: {
  datos: PuntoMes[]; anio: number; seleccion: Set<number>; alElegir: (mes: number) => void;
}) {
  const filas = datos.map((d) => ({ ...d, nombre: MESES[d.mes - 1], cumpl: d.real !== null && d.meta ? d.real / d.meta : null }));
  const hayMeta = filas.some((f) => f.meta), hayLY = filas.some((f) => f.anterior);
  const elegir = (d: { payload?: { mes?: number; real?: number | null } }) => { if (d?.payload?.mes && d.payload.real !== null) alElegir(d.payload.mes); };

  // Eje de meses: el mes y, debajo, su cumplimiento.
  const Tick = (p: { x?: number | string; y?: number | string; index?: number }) => {
    const f = filas[p.index ?? 0];
    return (
      <g transform={`translate(${p.x},${p.y})`}>
        <text dy={12} textAnchor="middle" fontSize={12} fill={seleccion.has(f.mes) ? "var(--tinta)" : "var(--tenue)"} fontWeight={seleccion.has(f.mes) ? 600 : 400}>{f.nombre}</text>
        {hayMeta && <text dy={27} textAnchor="middle" fontSize={11} fill={colorEstado(f.cumpl)} fontWeight={600}>{f.cumpl === null ? "" : porcentaje(f.cumpl)}</text>}
      </g>
    );
  };

  return (
    <div className="grid gap-2">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--tenue)]" aria-label="Leyenda">
        <li className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm bg-[var(--serie-1)]" aria-hidden />Venta {anio}</li>
        {hayMeta && <li className="flex items-center gap-1.5"><span className="inline-block h-[3px] w-4 rounded bg-[var(--serie-2)]" aria-hidden />Meta del mes</li>}
        {hayLY && <li className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-full bg-[var(--serie-gris)]" aria-hidden />Venta {anio - 1}</li>}
        {hayMeta && <li>Bajo cada mes: % de la meta (verde ≥ 100%, ámbar 90–99%, rojo &lt; 90%)</li>}
      </ul>
      <ResponsiveContainer width="100%" height={310}>
        <ComposedChart data={filas} margin={{ left: 0, right: 8, top: 10, bottom: 18 }}>
          <CartesianGrid vertical={false} {...GRILLA} />
          <XAxis dataKey="nombre" tick={Tick} interval={0} axisLine={false} tickLine={false} height={hayMeta ? 36 : 22} />
          <XAxis dataKey="nombre" xAxisId="meta" hide />
          <YAxis tick={EJE} tickFormatter={(v) => compacto(Number(v))} axisLine={false} tickLine={false} width={52} />
          <Tooltip cursor={{ fill: "var(--superficie-2)" }} contentStyle={CAJA} isAnimationActive={false}
                   content={({ active, payload }) => {
                     const f = active && payload?.[0]?.payload as (typeof filas)[number] | undefined;
                     if (!f) return null;
                     return (
                       <div style={CAJA} className="grid gap-0.5">
                         <b>{MESES[f.mes - 1]} {anio}</b>
                         <span>Venta: {f.real === null ? "sin venta todavía" : soles(f.real)}</span>
                         {f.meta !== null && <span>Meta: {soles(f.meta)}{f.cumpl !== null && <> · <b style={{ color: colorEstado(f.cumpl) }}>{porcentaje(f.cumpl)}</b></>}</span>}
                         {f.anterior !== null && <span>{anio - 1}: {soles(f.anterior)}</span>}
                         {f.real !== null && <span className="text-[var(--tenue)]">Toca para ver solo este mes</span>}
                       </div>
                     );
                   }} />
          <Bar dataKey="real" name={`Venta ${anio}`} radius={RADIO_V} maxBarSize={34} isAnimationActive={false} onClick={elegir} style={{ cursor: "pointer" }}>
            {filas.map((f) => <Cell key={f.mes} fill="var(--serie-1)" fillOpacity={seleccion.size && !seleccion.has(f.mes) ? 0.3 : 1} />)}
          </Bar>
          {hayMeta && <Bar dataKey="meta" name="Meta" xAxisId="meta" maxBarSize={34} isAnimationActive={false} shape={Marca} onClick={elegir} />}
          {hayLY && <Line dataKey="anterior" name={`Venta ${anio - 1}`} stroke="none" isAnimationActive={false}
                          dot={{ r: 3.5, fill: "var(--serie-gris)", stroke: "var(--superficie)", strokeWidth: 1.5 }} activeDot={{ r: 5 }} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
