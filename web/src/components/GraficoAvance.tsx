"use client";

import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { soles } from "@/lib/formato";

export type HoraAvance = { hora: number; hoy: number; antes: number };
const EJE = { fontSize: 11.5, fill: "var(--tenue)" };
const compacto = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : `${Math.round(v)}`);

/** Venta acumulada hora por hora: hoy (hasta la última hora con ventas) vs el mismo día de la semana pasada (día completo). */
export function GraficoAvance({ horas, horaCorte, etiquetaHoy, etiquetaAntes }: {
  horas: HoraAvance[]; horaCorte: number | null; etiquetaHoy: string; etiquetaAntes: string;
}) {
  const desde = Math.min(8, ...horas.map((h) => h.hora)), hasta = Math.max(21, ...horas.map((h) => h.hora));
  // Acumulado hasta cada hora (suma de las horas anteriores, sin variables que se modifican al dibujar).
  const acumulado = (hasta: number, clave: "hoy" | "antes") => horas.filter((x) => x.hora <= hasta).reduce((t, x) => t + x[clave], 0);
  const datos = Array.from({ length: hasta - desde + 1 }, (_, i) => {
    const hora = desde + i;
    return { nombre: `${String(hora).padStart(2, "0")}:00`, hoy: horaCorte === null || hora <= horaCorte ? acumulado(hora, "hoy") : null,
             antes: acumulado(hora, "antes") };
  });
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={datos} margin={{ left: 0, right: 12, top: 10, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--linea)" strokeDasharray="3 3" />
        <XAxis dataKey="nombre" tick={EJE} axisLine={false} tickLine={false} interval={1} />
        <YAxis tick={EJE} tickFormatter={(v) => compacto(Number(v))} axisLine={false} tickLine={false} width={52} />
        <Tooltip formatter={(v, n) => [v === null || v === undefined ? "—" : soles(Number(v)), String(n)]} labelFormatter={(l) => `Acumulado hasta las ${String(l).slice(0, 2)}:59`}
                 contentStyle={{ background: "var(--superficie)", border: "1px solid var(--linea)", borderRadius: 8, fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {horaCorte !== null && <ReferenceLine x={`${String(horaCorte).padStart(2, "0")}:00`} stroke="var(--serie-gris)" strokeDasharray="3 3" />}
        <Line dataKey="antes" name={etiquetaAntes} stroke="var(--serie-gris)" strokeWidth={1.8} strokeDasharray="5 4" dot={false} />
        <Line dataKey="hoy" name={etiquetaHoy} stroke="var(--serie-1)" strokeWidth={2.6} dot={{ r: 3 }} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
