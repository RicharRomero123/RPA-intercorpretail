"use client";

import {
  Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { decimal1, entero, soles } from "@/lib/formato";
import { fechaCorta } from "@/lib/periodos";

const EJE = { fontSize: 12, fill: "var(--tenue)" };
const TOOLTIP = {
  contentStyle: { background: "var(--superficie)", border: "1px solid var(--linea)", borderRadius: 6, fontSize: 13 },
  labelStyle: { color: "var(--tinta)", fontWeight: 600 },
  itemStyle: { color: "var(--tinta)" },
  cursor: { fill: "var(--acento-suave)" },
};

export function Titulo({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold mb-2">{children}</h3>;
}

/** Barras horizontales de una sola serie, con el valor escrito al final de cada barra. */
export function BarrasH({ datos, etiqueta, valor, formato = "decimal1", titulo }: {
  datos: Record<string, unknown>[]; etiqueta: string; valor: string; formato?: "decimal1" | "soles" | "entero";
  titulo: string; // si cada dato trae un campo "detalle" (texto), se muestra en el recuadro al pasar el mouse
}) {
  const fmt = formato === "soles" ? soles : formato === "entero" ? entero : decimal1;
  const alto = Math.max(140, datos.length * 38 + 40);
  return (
    <div className="tarjeta p-4">
      <Titulo>{titulo}</Titulo>
      <ResponsiveContainer width="100%" height={alto}>
        <BarChart data={datos} layout="vertical" margin={{ left: 8, right: 64, top: 4, bottom: 4 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey={etiqueta} width={130} tick={EJE} axisLine={false} tickLine={false} />
          <Tooltip {...TOOLTIP} formatter={(v) => fmt(Number(v))}
                   labelFormatter={(l, p) => (p?.[0]?.payload?.detalle ? `${l} · ${p[0].payload.detalle}` : String(l))} />
          <Bar dataKey={valor} fill="var(--serie-1)" radius={[0, 4, 4, 0]} barSize={20} name={titulo}>
            <LabelList dataKey={valor} position="right" formatter={(v) => fmt(Number(v))} style={{ fontSize: 12, fill: "var(--tinta)" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const etiquetaPeriodo = (agrupar: string) => (p: string) =>
  agrupar === "mes" ? `${p.slice(5, 7)}/${p.slice(0, 4)}` : agrupar === "semana" ? `Sem. ${fechaCorta(p)}` : fechaCorta(p);

/** Venta por día, semana o mes (una sola serie). */
export function BarrasSerie({ datos, agrupar, titulo }: {
  datos: { periodo: string; venta: number; und: number; costo: number }[]; agrupar: string; titulo: string;
}) {
  const et = etiquetaPeriodo(agrupar);
  return (
    <div className="tarjeta p-4">
      <Titulo>{titulo}</Titulo>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={datos} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--linea)" />
          <XAxis dataKey="periodo" tickFormatter={et} tick={EJE} axisLine={false} tickLine={false} minTickGap={12} />
          <YAxis tick={EJE} axisLine={false} tickLine={false} tickFormatter={(v) => entero(Number(v))} width={64} />
          <Tooltip {...TOOLTIP} labelFormatter={(l) => et(String(l))}
                   formatter={(v, n) => [n === "und" ? `${entero(Number(v))} und` : soles(Number(v)), n === "venta" ? "Venta público" : n === "costo" ? "Ingreso Calderón" : "Unidades"]} />
          <Bar dataKey="venta" fill="var(--serie-1)" radius={[4, 4, 0, 0]} name="venta" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Líneas: varias series sobre el mismo eje (productos, o periodo actual vs. comparación). */
export function Lineas({ datos, x, series, titulo, tipoX = "numero", formatoY = "entero" }: {
  datos: Record<string, unknown>[]; x: string; series: { clave: string; nombre: string; color: string }[];
  titulo: string; tipoX?: "dia" | "semana" | "mes" | "numero"; formatoY?: "entero" | "soles";
}) {
  const fy = formatoY === "soles" ? soles : entero;
  const formatoX = tipoX === "numero" ? (v: string) => `Día ${v}` : etiquetaPeriodo(tipoX);
  return (
    <div className="tarjeta p-4">
      <Titulo>{titulo}</Titulo>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={datos} margin={{ left: 8, right: 16, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--linea)" />
          <XAxis dataKey={x} tick={EJE} axisLine={false} tickLine={false} tickFormatter={formatoX} minTickGap={12} />
          <YAxis tick={EJE} axisLine={false} tickLine={false} tickFormatter={(v) => entero(Number(v))} width={64} />
          <Tooltip {...TOOLTIP} labelFormatter={(l) => formatoX(String(l))} formatter={(v) => fy(Number(v))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s) => (
            <Line key={s.clave} dataKey={s.clave} name={s.nombre} stroke={s.color} strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 0, fill: s.color }} activeDot={{ r: 5 }} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
