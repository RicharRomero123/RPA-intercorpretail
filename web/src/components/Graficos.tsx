"use client";

import {
  Banknote, Boxes, Coins, Gauge, PackageCheck, Timer, type LucideIcon,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { entero, porcentaje, soles } from "@/lib/formato";
import { fechaCorta } from "@/lib/periodos";
import type { ClaveGlosario } from "@/lib/glosario";
import { useState } from "react";
import { Ayuda } from "./Ayuda";
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

export type PuntoTendencia = {
  periodo: string; venta: number; costo: number; und: number;
  venta_c: number | null; costo_c: number | null; und_c: number | null;
};
const METRICAS = {
  venta: { nombre: "Venta al público", formato: soles, info: "venta" },
  costo: { nombre: "Ingreso Calderón", formato: soles, info: "ingreso" },
  und: { nombre: "Unidades", formato: entero, info: "unidades" },
} as const;

/** Gráfico principal: una métrica a la vez (selector), con total, promedio, mejor periodo y la comparación punteada. */
export function GraficoTendencia({ datos, agrupar, conPrevio, nombrePrevio, rango }: {
  datos: PuntoTendencia[]; agrupar: string; conPrevio: boolean; nombrePrevio: string; rango: string;
}) {
  const [m, setM] = useState<keyof typeof METRICAS>("venta");
  const met = METRICAS[m];
  const et = etiquetaPeriodo(agrupar);
  const serie = datos.map((d) => ({ periodo: d.periodo, actual: d[m], previo: d[`${m}_c` as const] }));
  const total = serie.reduce((a, d) => a + d.actual, 0);
  const mejor = serie.reduce<(typeof serie)[number] | null>((x, d) => (!x || d.actual > x.actual ? d : x), null);
  const unidad = agrupar === "dia" ? "día" : agrupar;
  return (
    <section className="tarjeta p-5 grid gap-4 min-w-0">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1 min-w-0">
          <span className="flex items-center gap-1.5 text-[15px] font-semibold">{met.nombre} · {rango}<Ayuda clave="evolucion" /></span>
          <span className="text-xs text-[var(--tenue)]">
            Total <b className="num text-[var(--tinta)]">{met.formato(total)}</b>
            {" · "}Promedio por {unidad} <b className="num text-[var(--tinta)]">{met.formato(serie.length ? total / serie.length : 0)}</b>
            {mejor && <>{" · "}Mejor {unidad} <b className="text-[var(--tinta)]">{et(mejor.periodo)}</b> ({met.formato(mejor.actual)})</>}
            {conPrevio && <>{" · "}punteado: {nombrePrevio.toLowerCase()}</>}
          </span>
        </div>
        <div className="segmento" role="group" aria-label="Métrica del gráfico">
          {(Object.keys(METRICAS) as (keyof typeof METRICAS)[]).map((k) => (
            <button key={k} type="button" aria-pressed={m === k} onClick={() => setM(k)}>{METRICAS[k].nombre.split(" ")[0]}</button>
          ))}
        </div>
      </header>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={serie} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="grad-tendencia" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--serie-1)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--serie-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--linea)" strokeDasharray="3 3" />
          <XAxis dataKey="periodo" tickFormatter={et} tick={EJE} axisLine={false} tickLine={false} minTickGap={16} dy={6} />
          <YAxis tick={EJE} axisLine={false} tickLine={false} tickFormatter={(v) => compacto(Number(v))} width={48} />
          <Tooltip wrapperStyle={{ zIndex: 20 }} cursor={{ stroke: "var(--serie-gris)", strokeDasharray: "3 3" }}
                   content={<Recuadro titulo={et} formato={met.formato} />} />
          {conPrevio && (
            <Area type="monotone" dataKey="previo" name={nombrePrevio} stroke="var(--serie-gris)" strokeWidth={1.5}
                  strokeDasharray="5 4" fill="none" dot={false} activeDot={{ r: 3 }} connectNulls />
          )}
          <Area type="monotone" dataKey="actual" name={met.nombre} stroke="var(--serie-1)" strokeWidth={2.2}
                fill="url(#grad-tendencia)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--superficie)" }} />
        </AreaChart>
      </ResponsiveContainer>
    </section>
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
        {/* El total va debajo del gráfico (z-0) y el gráfico con su recuadro emergente encima (z-10), para que el
            recuadro al pasar el mouse nunca quede tapado por el texto del centro. */}
        <div className="absolute inset-0 z-10">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={datos} dataKey="valor" nameKey="nombre" innerRadius="68%" outerRadius="95%" paddingAngle={2}
                   stroke="var(--superficie)" strokeWidth={2} startAngle={90} endAngle={-270}>
                {datos.map((d, i) => <Cell key={d.nombre} fill={colores[i % colores.length]} />)}
              </Pie>
              <Tooltip content={<Recuadro titulo={() => "Participación"} formato={(v) => `${fmt(v)} · ${porcentaje(total ? v / total : 0)}`} />}
                       wrapperStyle={{ zIndex: 20 }}
                       allowEscapeViewBox={{ x: true, y: true }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="absolute inset-0 z-0 grid place-content-center text-center pointer-events-none">
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
export function Indicador({ icono, titulo, valor, variacion, detalle, tendencia, ayuda, comparadoCon = "comparación", info }: {
  icono: keyof typeof ICONOS; titulo: string; valor: string; variacion?: number | null; detalle?: string;
  tendencia?: number[]; ayuda?: string; comparadoCon?: string; info?: ClaveGlosario;
}) {
  const Icono = ICONOS[icono];
  const puntos = (tendencia ?? []).map((v, i) => ({ i, v }));
  const hayVariacion = variacion !== null && variacion !== undefined && Number.isFinite(variacion);
  return (
    <div className="tarjeta p-4 grid gap-2 min-w-0 content-start overflow-hidden" title={ayuda}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 min-w-0 text-[13px] font-medium text-[var(--tenue)]"><span className="truncate">{titulo}</span>{info && <Ayuda clave={info} />}</span>
        <span className="grid place-items-center size-8 shrink-0 rounded-lg bg-[var(--acento-suave)] text-[var(--acento)]">
          <Icono size={16} strokeWidth={2} aria-hidden />
        </span>
      </div>
      <b className="num text-[clamp(18px,1.6vw,23px)] leading-tight font-semibold break-words">{valor}</b>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-[var(--tenue)] min-h-5">
        <Variacion valor={variacion} />
        <span>{hayVariacion ? `vs. ${comparadoCon}` : detalle}</span>
        {hayVariacion && <Ayuda clave="variacion" tamano={12} />}
      </div>
      {/* Tendencia diaria del periodo: franja a todo el ancho, debajo del valor, para no quitarle espacio al texto */}
      {puntos.length > 1 && (
        <div className="h-11 -mx-4 -mb-4 mt-1" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={puntos} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}>
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
  );
}
