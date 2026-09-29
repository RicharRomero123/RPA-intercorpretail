"use client";

import { Boxes, Gem, Star, Sprout, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { entero, porcentaje, soles } from "@/lib/formato";
import { Ayuda } from "./Ayuda";
import { Tabla } from "./Tabla";

export type FilaVV = { nombre: string; und: number; venta: number; costo: number; locales: number };
type Dimension = "cadena" | "zona" | "local" | "producto";
const NOMBRES: Record<Dimension, string> = { cadena: "Cadena", zona: "Zona", local: "Local", producto: "Producto" };

type Cuadrante = "estrella" | "volumen" | "valor" | "desarrollar";
const CUADRANTES: Record<Cuadrante, { nombre: string; que: string; color: string; icono: LucideIcon }> = {
  estrella: { nombre: "Estrellas", que: "Venden mucho y cada caja deja más", color: "var(--bueno)", icono: Star },
  volumen: { nombre: "Volumen", que: "Venden mucho, pero cada caja deja menos", color: "var(--serie-1)", icono: Boxes },
  valor: { nombre: "Valor", que: "Cada caja deja más, pero venden poco", color: "var(--serie-2)", icono: Gem },
  desarrollar: { nombre: "Por desarrollar", que: "Venden poco y cada caja deja menos", color: "var(--serie-gris)", icono: Sprout },
};

const mediana = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0;
};
const compacto = (v: number) => (Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : `${Math.round(v)}`);

/** Volumen (unidades) contra valor (ingreso Calderón) por cadena, zona, local o producto, con cuadrantes y tabla enlazada. */
export function VolumenValor({ datos, archivo }: { datos: Record<Dimension, FilaVV[]>; archivo: string }) {
  const [dim, setDim] = useState<Dimension>("cadena");
  const [foco, setFoco] = useState<Cuadrante | null>(null);

  const { filas, medU, medIU, totU, totI } = useMemo(() => {
    const base = datos[dim].filter((d) => d.und > 0);
    const totU = base.reduce((a, d) => a + d.und, 0), totI = base.reduce((a, d) => a + d.costo, 0);
    const medU = mediana(base.map((d) => d.und)), medIU = mediana(base.map((d) => d.costo / d.und));
    const filas = base.map((d) => {
      const altoU = d.und >= medU, altoI = d.costo / d.und >= medIU;
      const cuadrante: Cuadrante = altoU && altoI ? "estrella" : altoU ? "volumen" : altoI ? "valor" : "desarrollar";
      const pctU = totU ? d.und / totU : 0, pctI = totI ? d.costo / totI : 0;
      return { ...d, cuadrante, grupo: CUADRANTES[cuadrante].nombre, pct_und: pctU, pct_ingreso: pctI,
               ingreso_und: d.und ? d.costo / d.und : null, precio: d.und ? d.venta / d.und : null, brecha: (pctI - pctU) * 100 };
    }).sort((a, b) => b.costo - a.costo);
    return { filas, medU, medIU, totU, totI };
  }, [datos, dim]);

  const visibles = foco ? filas.filter((f) => f.cuadrante === foco) : filas;
  const conteo = (c: Cuadrante) => filas.filter((f) => f.cuadrante === c).length;
  const promedioUnidad = totU ? totI / totU : 0;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="segmento" role="group" aria-label="Comparar por">
          {(Object.keys(NOMBRES) as Dimension[]).map((d) => (
            <button key={d} type="button" aria-pressed={dim === d} onClick={() => { setDim(d); setFoco(null); }}>Por {NOMBRES[d].toLowerCase()}</button>
          ))}
        </div>
        <span className="text-xs text-[var(--tenue)]">Ingreso promedio por unidad: <b className="num text-[var(--tinta)]">{soles(promedioUnidad)}</b></span>
      </div>

      {/* Cuadrantes: resumen y filtro de la tabla */}
      <div className="grid gap-3 grid-cols-2 @4xl:grid-cols-4">
        {(Object.keys(CUADRANTES) as Cuadrante[]).map((c) => {
          const q = CUADRANTES[c], Icono = q.icono, activo = foco === c;
          return (
            <button key={c} type="button" onClick={() => setFoco(activo ? null : c)} aria-pressed={activo}
                    className={`tarjeta p-3 text-left grid gap-1 transition-colors ${activo ? "!border-[var(--acento)] ring-1 ring-[var(--acento)]" : "hover:border-[var(--acento)]"}`}>
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span className="grid place-items-center size-7 rounded-md" style={{ background: `color-mix(in srgb, ${q.color} 16%, transparent)`, color: q.color }}>
                  <Icono size={15} aria-hidden />
                </span>
                {q.nombre} <b className="num ml-auto">{conteo(c)}</b>
              </span>
              <span className="text-xs text-[var(--tenue)]">{q.que}</span>
            </button>
          );
        })}
      </div>

      <section className="tarjeta p-5 grid gap-3 min-w-0">
        <header className="flex items-center gap-1.5 text-[15px] font-semibold">
          Unidades vs ingreso por caja · por {NOMBRES[dim].toLowerCase()}<Ayuda clave="volumenValor" />
        </header>
        <ResponsiveContainer width="100%" height={360}>
          <ScatterChart margin={{ left: 12, right: 16, top: 12, bottom: 16 }}>
            <CartesianGrid stroke="var(--linea)" strokeDasharray="3 3" />
            <XAxis type="number" dataKey="und" name="Unidades" tick={{ fontSize: 11.5, fill: "var(--tenue)" }} tickFormatter={compacto}
                   axisLine={false} tickLine={false} label={{ value: "Unidades vendidas →", position: "insideBottomRight", offset: -10, fontSize: 11.5, fill: "var(--tenue)" }} />
            <YAxis type="number" dataKey="ingreso_und" name="Ingreso por caja" domain={["auto", "auto"]}
                   tick={{ fontSize: 11.5, fill: "var(--tenue)" }} tickFormatter={(v) => `S/ ${Number(v).toFixed(1)}`}
                   axisLine={false} tickLine={false} width={62}
                   label={{ value: "Ingreso por caja →", angle: -90, position: "insideLeft", offset: -4, dy: 50, fontSize: 11.5, fill: "var(--tenue)" }} />
            <ZAxis type="number" dataKey="costo" range={[40, 520]} name="Ingreso total" />
            <ReferenceLine x={medU} stroke="var(--serie-gris)" strokeDasharray="5 4" />
            <ReferenceLine y={medIU} stroke="var(--serie-gris)" strokeDasharray="5 4" />
            <Tooltip wrapperStyle={{ zIndex: 20 }} cursor={{ strokeDasharray: "3 3" }}
                     content={({ active, payload }) => {
                       const d = active && payload?.[0]?.payload as (typeof filas)[number] | undefined;
                       if (!d) return null;
                       const q = CUADRANTES[d.cuadrante];
                       return (
                         <div className="tarjeta px-3 py-2 text-xs grid gap-1 min-w-52">
                           <b className="text-[13px]">{d.nombre}</b>
                           <span style={{ color: q.color }} className="font-semibold">{q.nombre}</span>
                           <span className="flex justify-between gap-4"><span className="text-[var(--tenue)]">Unidades</span><b className="num">{entero(d.und)} ({porcentaje(d.pct_und)})</b></span>
                           <span className="flex justify-between gap-4"><span className="text-[var(--tenue)]">Ingreso Calderón</span><b className="num">{soles(d.costo)} ({porcentaje(d.pct_ingreso)})</b></span>
                           <span className="flex justify-between gap-4"><span className="text-[var(--tenue)]">Ingreso por unidad</span><b className="num">{soles(d.ingreso_und)}</b></span>
                         </div>
                       );
                     }} />
            {(Object.keys(CUADRANTES) as Cuadrante[]).map((c) => (
              <Scatter key={c} name={CUADRANTES[c].nombre} data={filas.filter((f) => f.cuadrante === c)} fill={CUADRANTES[c].color}
                       fillOpacity={foco && foco !== c ? 0.15 : 0.85} stroke="var(--superficie)" strokeWidth={1} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
        <p className="text-xs text-[var(--tenue)]">Derecha = vende más cajas · Arriba = cada caja deja más dinero · Punto más grande = más ingreso total.
          Líneas punteadas: valor del medio de unidades ({entero(medU)}) y de ingreso por caja ({soles(medIU)}). Haz clic en un cuadrante de arriba para resaltarlo y filtrar la tabla.</p>
      </section>

      <section className="tarjeta p-5 grid gap-3 min-w-0">
        <header className="text-[15px] font-semibold">{foco ? `${CUADRANTES[foco].nombre} · ` : ""}Detalle por {NOMBRES[dim].toLowerCase()}</header>
        <Tabla archivo={archivo} hoja="Volumen vs valor" buscar={dim === "local"} alto={dim === "local" ? 560 : undefined} filas={visibles}
               columnas={[{ clave: "nombre", titulo: NOMBRES[dim], tipo: "texto" }, { clave: "grupo", titulo: "Cuadrante", tipo: "texto", info: "volumenValor" },
                 { clave: "und", titulo: "Unidades", tipo: "entero", info: "unidades" }, { clave: "pct_und", titulo: "% unidades", tipo: "porcentaje" },
                 { clave: "costo", titulo: "Ingreso Calderón S/", tipo: "soles", info: "ingreso" }, { clave: "pct_ingreso", titulo: "% ingreso", tipo: "porcentaje" },
                 { clave: "ingreso_und", titulo: "Ingreso por caja S/", tipo: "decimal2", info: "ingresoUnidad" },
                 { clave: "brecha", titulo: "Valor − volumen (pts)", tipo: "decimal1", info: "brecha" }]} />
      </section>
    </div>
  );
}
