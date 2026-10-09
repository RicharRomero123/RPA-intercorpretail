"use client";

// Evolución mes a mes por canal (Resumen general), en curvas. «Todos juntos»: una línea por canal para compararlos (venta,
// cumplimiento o crecimiento vs el año pasado), con el nombre al final de cada línea. «Uno por canal»: cada canal con su propia
// escala (real, meta y año pasado), porque Tiendas vende tanto que en un solo gráfico de soles aplasta a los demás.
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { entero, porcentaje, soles } from "@/lib/formato";
import { CAJA, EJE, GRILLA, PUNTEADO, compacto } from "@/lib/graficos";

export type MesDeCanal = { mes: number; real: number | null; meta: number | null; ant: number | null; und?: number | null };
export type SerieCanal = { canal: string; nombre: string; meses: MesDeCanal[]; /** Trae detalle por producto (unidades). */ conUnidades: boolean };
type Vista = "juntos" | "separados";
type Medida = "venta" | "und" | "cumpl" | "crec";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const COLOR: Record<string, string> = {
  TIENDAS: "var(--canal-tiendas)", LIMA: "var(--canal-lima)", RETAIL: "var(--canal-retail)", PROVINCIA: "var(--canal-provincia)",
  B2B: "var(--canal-b2b)", RAPPI: "var(--canal-rappi)",
};
const color = (c: string) => COLOR[c] ?? "var(--serie-gris)";
const signo = (x: number) => `${x >= 0 ? "+" : ""}${porcentaje(x)}`;

export function EvolucionCanales({ series, mesCorte, parcial, filtrado = false }: {
  series: SerieCanal[]; /** Último mes con datos. */ mesCorte: number; /** Texto del mes en curso, p. ej. «al 9»; null si ya cerró. */ parcial: string | null;
  /** Hay canales elegidos arriba: se ve cada canal por separado, sin «Todos juntos». */ filtrado?: boolean;
}) {
  const [eleccion, setVista] = useState<Vista>("juntos");
  const vista: Vista = filtrado ? "separados" : eleccion;
  const [medida, setMedida] = useState<Medida>("venta");
  const [foco, setFoco] = useState<string | null>(null);
  const etiqueta = (m: number) => `${MESES[m - 1]}${m === mesCorte && parcial ? ` (${parcial})` : ""}`;
  const valor = (x: MesDeCanal) => (medida === "venta" ? x.real : medida === "und" ? x.und ?? null : medida === "cumpl" ? (x.real !== null && x.meta ? x.real / x.meta : null)
    : x.real !== null && x.ant ? x.real / x.ant - 1 : null);
  const fmt = (v: number) => (medida === "venta" ? soles(v) : medida === "und" ? `${entero(v)} und` : medida === "cumpl" ? porcentaje(v) : signo(v));
  const enUnd = medida === "und";
  // Por canal solo hay soles o unidades; si estaba en cumplimiento o crecimiento, se ve en soles.
  const porCanalUnd = vista === "separados" && enUnd;
  const visibles = enUnd ? series.filter((s) => s.conUnidades) : series;
  const sinUnd = series.filter((s) => !s.conUnidades).map((s) => s.nombre);
  const meses = Array.from({ length: mesCorte }, (_, i) => i + 1);
  const datos = meses.map((m) => ({ mes: m, ...Object.fromEntries(series.map((s) => [s.canal, valor(s.meses.find((x) => x.mes === m) ?? { mes: m, real: null, meta: null, ant: null })])) }));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {!filtrado && (
          <div className="segmento" role="group" aria-label="Cómo ver los canales">
            {([["juntos", "Todos juntos"], ["separados", "Uno por canal"]] as [Vista, string][]).map(([k, t]) => (
              <button key={k} type="button" aria-pressed={vista === k} onClick={() => setVista(k)}>{t}</button>
            ))}
          </div>
        )}
        <div className="segmento" role="group" aria-label="Qué medir">
          {((vista === "juntos" ? [["venta", "Venta S/"], ["und", "Unidades"], ["cumpl", "Cumplimiento"], ["crec", "vs año pasado"]]
            : [["venta", "Venta S/"], ["und", "Unidades"]]) as [Medida, string][]).map(([k, t]) => (
            <button key={k} type="button" aria-pressed={medida === k || (vista === "separados" && k === "venta" && !enUnd)} onClick={() => setMedida(k)}>{t}</button>
          ))}
        </div>
      </div>

      {vista === "juntos" ? (
        <>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Canales">
            {visibles.map((s) => (
              <li key={s.canal}>
                <button type="button" onMouseEnter={() => setFoco(s.canal)} onMouseLeave={() => setFoco(null)} onFocus={() => setFoco(s.canal)} onBlur={() => setFoco(null)}
                        className={`flex items-center gap-1.5 ${foco && foco !== s.canal ? "opacity-40" : ""}`}>
                  <span className="inline-block h-[3px] w-4 rounded" style={{ background: color(s.canal) }} aria-hidden />{s.nombre}
                </button>
              </li>
            ))}
          </ul>
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={datos} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} {...GRILLA} />
              <XAxis dataKey="mes" tickFormatter={(m) => etiqueta(Number(m))} tick={EJE} axisLine={false} tickLine={false} dy={6} />
              <YAxis tick={EJE} axisLine={false} tickLine={false} width={52}
                     tickFormatter={(v) => (medida === "venta" || enUnd ? compacto(Number(v)) : `${Math.round(Number(v) * 100)}%`)} />
              {medida === "cumpl" && <ReferenceLine y={1} stroke="var(--tinta)" strokeDasharray="3 3" label={{ value: "meta", position: "insideTopRight", fill: "var(--tenue)", fontSize: 11 }} />}
              {medida === "crec" && <ReferenceLine y={0} stroke="var(--tinta)" strokeDasharray="3 3" />}
              <Tooltip contentStyle={CAJA} labelFormatter={(m) => etiqueta(Number(m))} itemSorter={(x) => -Number(x.value ?? 0)}
                       formatter={(v, n) => [v === null || v === undefined ? "—" : fmt(Number(v)), series.find((s) => s.canal === n)?.nombre ?? String(n)]} />
              {visibles.map((s) => (
                <Line key={s.canal} dataKey={s.canal} name={s.canal} type="monotone" stroke={color(s.canal)} connectNulls isAnimationActive={false}
                      strokeWidth={foco === s.canal ? 3.2 : 2.2} strokeOpacity={foco && foco !== s.canal ? 0.18 : 1}
                      dot={{ r: 2.5, strokeWidth: 0, fill: color(s.canal) }} activeDot={{ r: 4.5 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-[var(--tenue)]">
            {enUnd ? `Unidades vendidas cada mes, de los canales con detalle por producto${sinUnd.length ? ` (${sinUnd.join(" y ")} no lo traen)` : ""}.`
              : medida === "venta" ? "Venta real de cada mes. Tiendas está muy por encima del resto: para ver bien la forma de cada canal, usa «Uno por canal» o «Cumplimiento»."
              : medida === "cumpl" ? "Real ÷ meta de cada mes: sobre la línea punteada, el canal superó su meta ese mes."
              : "Crecimiento de cada mes contra el mismo mes del año pasado: sobre la línea, creció; debajo, cayó."}
            {parcial && <> {MESES[mesCorte - 1]} va {parcial}: su meta y su año pasado son del mes completo.</>} Pasa el mouse por un canal para resaltarlo.
          </p>
        </>
      ) : (
        <>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--tenue)]">
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-[3px] w-5 rounded bg-[var(--tinta)]" aria-hidden />{porCanalUnd ? "Unidades" : "Real"} {"(color del canal)"}</span>
            {!porCanalUnd && <>
              <span className="inline-flex items-center gap-1.5"><span className="inline-block w-5 border-t-2 border-dashed border-[var(--tinta)]" aria-hidden />Meta</span>
              <span className="inline-flex items-center gap-1.5"><span className="inline-block h-px w-5 bg-[var(--serie-gris)]" aria-hidden />Año pasado</span>
            </>}
            · cada gráfico con su propia escala{porCanalUnd ? " · en unidades no hay meta ni año pasado (el consolidado solo trae soles)" : ""}
          </p>
          <div className={`grid gap-4 grid-cols-1 ${series.length > 1 ? "@2xl:grid-cols-2 @5xl:grid-cols-3" : ""}`}>
            {series.map((s) => {
              const filas = meses.map((m) => s.meses.find((x) => x.mes === m) ?? { mes: m, real: null, meta: null, ant: null });
              const real = filas.reduce((a, x) => a + (x.real ?? 0), 0), meta = filas.filter((x) => x.real !== null).reduce((a, x) => a + (x.meta ?? 0), 0);
              const und = filas.reduce((a, x) => a + (x.und ?? 0), 0);
              return (
                <figure key={s.canal} className="grid gap-1 rounded-lg border border-[var(--linea)] p-3">
                  <figcaption className="flex items-baseline justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-semibold"><span className="inline-block size-2.5 rounded-sm" style={{ background: color(s.canal) }} aria-hidden />{s.nombre}</span>
                    <span className="num text-xs text-[var(--tenue)]">{porCanalUnd ? (s.conUnidades ? `${entero(und)} und` : "") : <>{compacto(real)}{meta ? ` · ${porcentaje(real / meta)} de la meta` : ""}</>}</span>
                  </figcaption>
                  {porCanalUnd && !s.conUnidades ? (
                    <p className="grid h-40 place-items-center text-center text-xs text-[var(--tenue)]">Este canal no trae detalle por producto: no hay unidades.</p>
                  ) : <div className={series.length > 1 ? "h-40" : "h-72"}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={filas} margin={{ left: 0, right: 6, top: 6, bottom: 0 }}>
                        <CartesianGrid vertical={false} {...GRILLA} />
                        <XAxis dataKey="mes" tickFormatter={(m) => MESES[Number(m) - 1]} tick={EJE} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
                        <YAxis tick={EJE} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => compacto(Number(v))} />
                        <Tooltip contentStyle={CAJA} labelFormatter={(m) => etiqueta(Number(m))}
                                 formatter={(v, n) => [v === null || v === undefined ? "—" : porCanalUnd ? `${entero(Number(v))} und` : soles(Number(v)), n === "real" || n === "und" ? (porCanalUnd ? "Unidades" : "Real") : n === "meta" ? "Meta" : "Año pasado"]} />
                        {!porCanalUnd && <Line dataKey="ant" type="monotone" stroke="var(--serie-gris)" strokeWidth={1.4} dot={false} connectNulls isAnimationActive={false} />}
                        {!porCanalUnd && <Line dataKey="meta" type="monotone" stroke="var(--tinta)" strokeOpacity={0.55} strokeWidth={1.4} strokeDasharray={PUNTEADO} dot={false} connectNulls isAnimationActive={false} />}
                        <Line dataKey={porCanalUnd ? "und" : "real"} type="monotone" stroke={color(s.canal)} strokeWidth={2.4} dot={{ r: 2.2, strokeWidth: 0, fill: color(s.canal) }} activeDot={{ r: 4 }} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>}
                </figure>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
