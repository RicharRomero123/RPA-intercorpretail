"use client";

import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { soles } from "@/lib/formato";
import { CAJA, compacto, EJE, GRILLA, LEYENDA, PUNTEADO } from "@/lib/graficos";

export type PuntoMes = { dia: number; real: number | null; proyeccion: number | null; anterior: number | null };

/** Venta acumulada del mes: real hasta hoy, proyección hasta el cierre (punteada), año pasado (gris) y la meta (línea). */
export function GraficoAvanceMes({ puntos, meta, etiquetaAnterior }: { puntos: PuntoMes[]; meta: number | null; etiquetaAnterior: string }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={puntos} margin={{ left: 0, right: 12, top: 14, bottom: 0 }}>
        <CartesianGrid vertical={false} {...GRILLA} />
        <XAxis dataKey="dia" tick={EJE} axisLine={false} tickLine={false} interval={1} />
        <YAxis tick={EJE} tickFormatter={(v) => compacto(Number(v))} axisLine={false} tickLine={false} width={56}
               domain={[0, (max: number) => Math.max(max, meta ?? 0) * 1.05]} />
        <Tooltip formatter={(v, n) => [v === null || v === undefined ? "—" : soles(Number(v)), String(n)]} labelFormatter={(l) => `Acumulado al día ${l}`}
                 contentStyle={CAJA} />
        <Legend wrapperStyle={LEYENDA} />
        {meta !== null && <ReferenceLine y={meta} stroke="var(--serie-2)" strokeDasharray="2 3"
                                         label={{ value: `Meta ${compacto(meta)}`, position: "insideTopLeft", fontSize: 11, fill: "var(--serie-2)" }} />}
        <Line dataKey="anterior" name={etiquetaAnterior} stroke="var(--serie-gris)" strokeWidth={1.6} strokeDasharray={PUNTEADO} dot={false} connectNulls />
        <Line dataKey="proyeccion" name="Proyección al cierre" stroke="var(--serie-1)" strokeWidth={1.8} strokeDasharray="6 4" dot={false} connectNulls />
        <Line dataKey="real" name="Real acumulado" stroke="var(--serie-1)" strokeWidth={2.6} dot={false} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
