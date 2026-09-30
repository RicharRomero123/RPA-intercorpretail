"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { porcentaje, soles } from "@/lib/formato";

export type PuntoCanal = { canal: string; cumpl: number | null; var: number | null; real: number; meta: number; ant: number };
const EJE = { fontSize: 11.5, fill: "var(--tenue)" };
const pct = (v: number) => `${Math.round(v * 100)}%`;
const colorCumpl = (x: number) => (x >= 1 ? "var(--bueno)" : x >= 0.9 ? "var(--alerta)" : "var(--critico)");
const caja = { background: "var(--superficie)", border: "1px solid var(--linea)", borderRadius: 8, fontSize: 12 };

/** Dos gráficos en porcentaje (todos los canales en la misma escala, sin importar su tamaño):
 *  cumplimiento de meta con la línea del 100%, y crecimiento vs el año anterior (a la derecha creció, a la izquierda cayó). */
export function GraficoCanales({ datos, tramo, anioAnt }: { datos: PuntoCanal[]; tramo: string; anioAnt: number }) {
  const alto = Math.max(200, datos.length * 38 + 50);
  const cumpl = datos.filter((d) => d.cumpl !== null).sort((a, b) => (b.cumpl ?? 0) - (a.cumpl ?? 0));
  const crec = datos.filter((d) => d.var !== null).sort((a, b) => (b.var ?? 0) - (a.var ?? 0));
  return (
    <div className="grid gap-6 @4xl:grid-cols-2">
      <div className="grid gap-1 min-w-0">
        <span className="text-sm font-semibold">Cumplimiento de meta ({tramo})</span>
        <span className="text-xs text-[var(--tenue)]">Real ÷ meta · la línea marca el 100%</span>
        <ResponsiveContainer width="100%" height={alto}>
          <BarChart data={cumpl} layout="vertical" margin={{ left: 4, right: 48, top: 22, bottom: 0 }}>
            <CartesianGrid horizontal={false} stroke="var(--linea)" strokeDasharray="3 3" />
            <XAxis type="number" tick={EJE} tickFormatter={(v) => pct(Number(v))} axisLine={false} tickLine={false} domain={[0, (max: number) => Math.max(1.2, max)]} />
            <YAxis type="category" dataKey="canal" tick={EJE} width={88} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: "var(--superficie-2)" }} contentStyle={caja}
                     formatter={(v, _n, p) => [`${porcentaje(Number(v))} · real ${soles(p.payload.real)} vs meta ${soles(p.payload.meta)}`, "Cumplimiento"]} />
            <ReferenceLine x={1} stroke="var(--tinta)" strokeDasharray="4 3" label={{ value: "100%", position: "top", fontSize: 11, fill: "var(--tinta)" }} />
            <Bar dataKey="cumpl" radius={[0, 4, 4, 0]} maxBarSize={22}>
              {cumpl.map((d) => <Cell key={d.canal} fill={colorCumpl(d.cumpl ?? 0)} />)}
              <LabelList dataKey="cumpl" position="right" formatter={(v: unknown) => pct(Number(v))} style={{ fontSize: 11, fontWeight: 600, fill: "var(--tinta)" }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid gap-1 min-w-0">
        <span className="text-sm font-semibold">Crecimiento vs {anioAnt} ({tramo})</span>
        <span className="text-xs text-[var(--tenue)]">A la derecha creció, a la izquierda cayó</span>
        <ResponsiveContainer width="100%" height={alto}>
          <BarChart data={crec} layout="vertical" margin={{ left: 4, right: 48, top: 8, bottom: 0 }}>
            <CartesianGrid horizontal={false} stroke="var(--linea)" strokeDasharray="3 3" />
            <XAxis type="number" tick={EJE} tickFormatter={(v) => pct(Number(v))} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="canal" tick={EJE} width={88} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: "var(--superficie-2)" }} contentStyle={caja}
                     formatter={(v, _n, p) => [`${Number(v) >= 0 ? "+" : ""}${porcentaje(Number(v))} · ${soles(p.payload.real)} vs ${soles(p.payload.ant)}`, "Crecimiento"]} />
            <ReferenceLine x={0} stroke="var(--tinta)" />
            <Bar dataKey="var" radius={4} maxBarSize={22}>
              {crec.map((d) => <Cell key={d.canal} fill={(d.var ?? 0) >= 0 ? "var(--bueno)" : "var(--critico)"} />)}
              <LabelList dataKey="var" position="right" formatter={(v: unknown) => `${Number(v) >= 0 ? "+" : ""}${pct(Number(v))}`}
                         style={{ fontSize: 11, fontWeight: 600, fill: "var(--tinta)" }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
