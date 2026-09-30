"use client";

import { Bar, CartesianGrid, ComposedChart, LabelList, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { porcentaje, soles } from "@/lib/formato";

export type MesCanal = { mes: number; real: number | null; meta: number | null; anterior: number | null };
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const EJE = { fontSize: 11.5, fill: "var(--tenue)" };
const compacto = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : `${Math.round(v)}`);

/** Real vs meta por mes (barras lado a lado) con el % de cumplimiento encima de cada mes y el año anterior punteado. */
export function GraficoConsolidado({ meses, anio, mesCorte, diaCorte }: { meses: MesCanal[]; anio: number; mesCorte: number; diaCorte: number }) {
  const datos = meses.map((m) => ({
    ...m, nombre: `${MESES[m.mes - 1]}${m.mes === mesCorte ? ` (al ${diaCorte})` : ""}`,
    cumpl: m.real !== null && m.meta ? m.real / m.meta : null,
  }));
  return (
    <ResponsiveContainer width="100%" height={330}>
      <ComposedChart data={datos} margin={{ left: 0, right: 8, top: 22, bottom: 0 }} barGap={2}>
        <CartesianGrid vertical={false} stroke="var(--linea)" strokeDasharray="3 3" />
        <XAxis dataKey="nombre" tick={EJE} axisLine={false} tickLine={false} interval={0} />
        <YAxis tick={EJE} tickFormatter={(v) => compacto(Number(v))} axisLine={false} tickLine={false} width={52} />
        <Tooltip formatter={(v, n) => [v === null || v === undefined ? "—" : n === "Cumplimiento" ? porcentaje(Number(v)) : soles(Number(v)), String(n)]}
                 contentStyle={{ background: "var(--superficie)", border: "1px solid var(--linea)", borderRadius: 8, fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="meta" name={`Meta ${anio}`} fill="color-mix(in srgb, var(--serie-2) 22%, transparent)" stroke="var(--serie-2)" strokeWidth={1}
             radius={[4, 4, 0, 0]} maxBarSize={30} />
        <Bar dataKey="real" name={`Real ${anio}`} fill="var(--serie-1)" radius={[4, 4, 0, 0]} maxBarSize={30}>
          <LabelList dataKey="cumpl" position="top" formatter={(v: unknown) => (v === null || v === undefined ? "" : `${Math.round(Number(v) * 100)}%`)}
                     style={{ fontSize: 10.5, fill: "var(--tinta)", fontWeight: 600 }} />
        </Bar>
        <Line dataKey="anterior" name={`Real ${anio - 1}`} stroke="var(--serie-gris)" strokeWidth={1.6} strokeDasharray="5 4" dot={false} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
