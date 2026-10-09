"use client";

// % vendido de lo despachado, día a día, un mini gráfico por producto (todos con la misma escala 0–100% y las mismas fechas,
// para compararlos de un vistazo). Línea llena = lo real; punteada = la proyección al ritmo de los últimos días hasta fin de campaña.
import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { porcentaje } from "@/lib/formato";
import { CAJA, EJE, PUNTEADO } from "@/lib/graficos";

export type PuntoAvance = { t: number; real?: number | null; proy?: number | null };
export type AvanceProducto = { producto: string; actual: number | null; agota: string | null; puntos: PuntoAvance[]; total?: boolean };

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fecha = (t: number) => { const d = new Date(t); return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`; };

export function AvanceSellout({ productos, desde, hasta, hoy }: { productos: AvanceProducto[]; desde: number; hasta: number; hoy: number }) {
  const ticks = [desde, hoy, hasta];
  return (
    <div className="grid gap-4 grid-cols-1 @2xl:grid-cols-2 @5xl:grid-cols-3">
      {productos.map((p) => (
        <figure key={p.producto} className={`grid gap-1 rounded-lg border p-3 ${p.total ? "border-[var(--tinta)]" : "border-[var(--linea)]"}`}>
          <figcaption className="flex items-baseline justify-between gap-2">
            <span className={`truncate text-sm ${p.total ? "font-semibold" : "font-medium"}`} title={p.producto}>{p.producto}</span>
            <b className="num text-lg">{p.actual === null ? "—" : porcentaje(p.actual)}</b>
          </figcaption>
          <p className="text-xs text-[var(--tenue)]">{p.agota ? <>Al ritmo actual se acaba el <b className="text-[var(--tinta)]">{p.agota}</b></> : "Al ritmo actual no se acaba antes de fin de campaña"}</p>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={p.puntos} margin={{ left: 0, right: 6, top: 6, bottom: 0 }}>
                <XAxis dataKey="t" type="number" domain={[desde, hasta]} ticks={ticks} tickFormatter={fecha} tick={EJE} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`} tick={EJE} axisLine={false} tickLine={false} width={36} />
                <ReferenceLine y={1} stroke="var(--linea)" />
                <ReferenceLine x={hoy} stroke="var(--tenue)" strokeDasharray="2 3" />
                <Tooltip contentStyle={CAJA} labelFormatter={(t) => fecha(Number(t))}
                         formatter={(v, n) => [v === null || v === undefined ? "—" : porcentaje(Number(v)), n === "real" ? "Vendido" : "Proyección"]} />
                <Area dataKey="real" type="monotone" stroke="var(--serie-1)" strokeWidth={2} fill="var(--serie-1)" fillOpacity={0.14} dot={false}
                      isAnimationActive={false} connectNulls />
                <Line dataKey="proy" type="linear" stroke="var(--serie-1)" strokeWidth={1.6} strokeDasharray={PUNTEADO} dot={false} isAnimationActive={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </figure>
      ))}
    </div>
  );
}
