"use client";

import {
  Banknote, Boxes, Coins, Gauge, PackageCheck, Timer, type LucideIcon,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { entero, porcentaje, soles } from "@/lib/formato";
import { fechaCorta } from "@/lib/periodos";
import { Variacion } from "./ui";

const EJE = { fontSize: 11.5, fill: "var(--tenue)" };
const compacto = (v: number) =>
  Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : `${Math.round(v)}`;

export const etiquetaPeriodo = (agrupar: string) => (p: string) =>
  agrupar === "mes" ? `${p.slice(5, 7)}/${p.slice(0, 4)}` : agrupar === "semana" ? `Sem. ${fechaCorta(p)}` : fechaCorta(p);

type Fila = { name?: string; value?: unknown; color?: string; dataKey?: unknown };
/** Recuadro que aparece al pasar el mouse, con el mismo estilo de las tarjetas. */
function Recuadro({ active, payload, label, titulo, formato }: {
  active?: boolean; payload?: Fila[]; label?: unknown; titulo: (l: string) => string; formato: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tarjeta px-3 py-2 text-xs grid gap-1 min-w-40">
      <b className="text-[13px]">{titulo(String(label))}</b>
      {payload.filter((p) => p.value !== null && p.value !== undefined).map((p) => (
        <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-[var(--tenue)]">
            <span className="size-2 rounded-full" style={{ background: p.color }} />{p.name}
          </span>
          <b className="num">{formato(Number(p.value))}</b>
        </div>
      ))}
    </div>
  );
}

/** Venta por periodo en área con degradado; la comparación va como línea punteada gris. */
export function AreaVentas({ datos, agrupar, conPrevio, nombrePrevio }: {
  datos: { periodo: string; actual: number | null; previo?: number | null }[]; agrupar: string;
  conPrevio: boolean; nombrePrevio: string;
}) {
  const et = etiquetaPeriodo(agrupar);
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={datos} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="grad-venta" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--serie-1)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--serie-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--linea)" strokeDasharray="3 3" />
        <XAxis dataKey="periodo" tickFormatter={et} tick={EJE} axisLine={false} tickLine={false} minTickGap={16} dy={6} />
        <YAxis tick={EJE} axisLine={false} tickLine={false} tickFormatter={(v) => compacto(Number(v))} width={48} />
        <Tooltip cursor={{ stroke: "var(--serie-gris)", strokeDasharray: "3 3" }}
                 content={<Recuadro titulo={et} formato={soles} />} />
        {conPrevio && (
          <Area type="monotone" dataKey="previo" name={nombrePrevio} stroke="var(--serie-gris)" strokeWidth={1.5}
                strokeDasharray="5 4" fill="none" dot={false} activeDot={{ r: 3 }} connectNulls />
        )}
        <Area type="monotone" dataKey="actual" name="Venta al público" stroke="var(--serie-1)" strokeWidth={2.2}
              fill="url(#grad-venta)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--superficie)" }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Líneas de varias series (p. ej. unidades por producto). */
export function Lineas({ datos, series, agrupar }: {
  datos: Record<string, unknown>[]; series: { clave: string; nombre: string; color: string }[]; agrupar: string;
}) {
  const et = etiquetaPeriodo(agrupar);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-4 text-xs text-[var(--tenue)]">
        {series.map((s) => (
          <span key={s.clave} className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: s.color }} />{s.nombre}</span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={datos} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--linea)" strokeDasharray="3 3" />
          <XAxis dataKey="periodo" tickFormatter={et} tick={EJE} axisLine={false} tickLine={false} minTickGap={16} dy={6} />
          <YAxis tick={EJE} axisLine={false} tickLine={false} tickFormatter={(v) => compacto(Number(v))} width={48} />
          <Tooltip cursor={{ stroke: "var(--serie-gris)", strokeDasharray: "3 3" }}
                   content={<Recuadro titulo={et} formato={(v) => `${entero(v)} und`} />} />
          {series.map((s) => (
            <Line key={s.clave} type="monotone" dataKey={s.clave} name={s.nombre} stroke={s.color} strokeWidth={2.2}
                  dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--superficie)" }} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Anillo de participación con el total al centro y leyenda con porcentajes. */
export function Dona({ datos, total, etiquetaTotal, formato = "soles" }: {
  datos: { nombre: string; valor: number }[]; total: number; etiquetaTotal: string; formato?: "soles" | "entero";
}) {
  const colores = ["var(--serie-1)", "var(--serie-2)", "var(--serie-3)", "var(--serie-gris)"];
  const fmt = formato === "soles" ? soles : entero;
  return (
    <div className="grid gap-4">
      <div className="relative h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={datos} dataKey="valor" nameKey="nombre" innerRadius="68%" outerRadius="95%" paddingAngle={2}
                 stroke="var(--superficie)" strokeWidth={2} startAngle={90} endAngle={-270}>
              {datos.map((d, i) => <Cell key={d.nombre} fill={colores[i % colores.length]} />)}
            </Pie>
            <Tooltip content={<Recuadro titulo={() => "Participación"} formato={fmt} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 grid place-content-center text-center pointer-events-none">
          <span className="text-[11px] text-[var(--tenue)]">{etiquetaTotal}</span>
          <b className="num text-base">{fmt(total)}</b>
        </div>
      </div>
      <ul className="grid gap-2 text-sm">
        {datos.map((d, i) => (
          <li key={d.nombre} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 min-w-0"><span className="size-2.5 rounded-sm shrink-0" style={{ background: colores[i % colores.length] }} />
              <span className="truncate">{d.nombre}</span></span>
            <span className="num text-[var(--tenue)]">{porcentaje(total ? d.valor / total : 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ICONOS: Record<string, LucideIcon> = { venta: Banknote, ingreso: Coins, unidades: Boxes, rotacion: Gauge, instock: PackageCheck, cobertura: Timer };

/** Indicador principal: ícono, valor, variación y minigráfico de tendencia. */
export function Indicador({ icono, titulo, valor, variacion, detalle, tendencia, ayuda }: {
  icono: keyof typeof ICONOS; titulo: string; valor: string; variacion?: number | null; detalle?: string;
  tendencia?: number[]; ayuda?: string;
}) {
  const Icono = ICONOS[icono];
  const puntos = (tendencia ?? []).map((v, i) => ({ i, v }));
  return (
    <div className="tarjeta p-4 grid gap-3 min-w-0" title={ayuda}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-[var(--tenue)]">{titulo}</span>
        <span className="grid place-items-center size-8 rounded-lg bg-[var(--acento-suave)] text-[var(--acento)]">
          <Icono size={16} strokeWidth={2} aria-hidden />
        </span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="grid gap-1 min-w-0">
          <b className="num text-[22px] leading-none font-semibold whitespace-nowrap">{valor}</b>
          <div className="flex items-center gap-1.5 text-xs text-[var(--tenue)] min-h-5">
            <Variacion valor={variacion} />
            <span className="truncate">{variacion !== null && variacion !== undefined && Number.isFinite(variacion) ? "vs. comparación" : detalle}</span>
          </div>
        </div>
        {puntos.length > 1 && (
          <div className="h-10 w-24 shrink-0" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={puntos} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
                <defs>
                  <linearGradient id={`spark-${icono}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--serie-1)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--serie-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke="var(--serie-1)" strokeWidth={1.6} fill={`url(#spark-${icono})`}
                      dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
