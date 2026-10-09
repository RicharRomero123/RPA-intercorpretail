"use client";

// Evolución mes a mes por canal (Resumen general), en curvas. «Todos juntos»: una línea por canal para compararlos (venta,
// cumplimiento o crecimiento vs el año pasado), con el nombre al final de cada línea. «Uno por canal»: cada canal con su propia
// escala (real, meta y año pasado), porque Tiendas vende tanto que en un solo gráfico de soles aplasta a los demás.
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { entero, porcentaje, soles } from "@/lib/formato";
import { CAJA, EJE, GRILLA, PUNTEADO, compacto } from "@/lib/graficos";

export type MesDeCanal = { mes: number; real: number | null; meta: number | null; ant: number | null; und?: number | null;
  /** Unidades de cada SKU en el mes (de más a menos), para explicar el total. */ skus?: { producto: string; und: number }[] };
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
const VER_SKU = 8;

/** Recuadro del modo Unidades: el total del mes y qué SKU lo hicieron (los 8 con más unidades y el resto junto). */
function DetalleSku({ active, payload, etiqueta, color }: {
  active?: boolean; payload?: { payload: MesDeCanal }[]; etiqueta: (m: number) => string; color: string;
}) {
  const x = payload?.[0]?.payload;
  if (!active || !x || !x.und) return null;
  const total = x.und, skus = x.skus ?? [], resto = skus.slice(VER_SKU).reduce((a, s) => a + s.und, 0);
  return (
    <div style={CAJA} className="grid min-w-56 max-w-80 gap-1.5 text-xs">
      <p className="flex items-baseline justify-between gap-3 font-semibold">
        <span>{etiqueta(x.mes)}</span><span className="num" style={{ color }}>{entero(total)} und</span>
      </p>
      <ul className="grid gap-1">
        {skus.slice(0, VER_SKU).map((s) => (
          <li key={s.producto} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
            <span className="truncate" title={s.producto}>{s.producto}</span>
            <span className="num">{entero(s.und)}</span>
            <span className="num w-12 text-right text-[var(--tenue)]">{porcentaje(s.und / total)}</span>
          </li>
        ))}
        {resto > 0 && (
          <li className="grid grid-cols-[1fr_auto_auto] gap-2 text-[var(--tenue)]">
            <span>Otros {skus.length - VER_SKU} SKU</span><span className="num">{entero(resto)}</span>
            <span className="num w-12 text-right">{porcentaje(resto / total)}</span>
          </li>
        )}
      </ul>
    </div>
  );
}

export function EvolucionCanales({ series, mesCorte, parcial, filtrado = false }: {
  series: SerieCanal[]; /** Último mes con datos. */ mesCorte: number; /** Texto del mes en curso, p. ej. «al 9»; null si ya cerró. */ parcial: string | null;
  /** Hay canales elegidos arriba: se ve cada canal por separado, sin «Todos juntos». */ filtrado?: boolean;
}) {
  const [eleccion, setVista] = useState<Vista>("juntos");
  const vista: Vista = filtrado ? "separados" : eleccion;
  const [medida, setMedida] = useState<Medida>("venta");
  const [foco, setFoco] = useState<string | null>(null);
  const [grande, setGrande] = useState<string | null>(null);
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

  const filasDe = (s: SerieCanal) => meses.map((m) => s.meses.find((x) => x.mes === m) ?? { mes: m, real: null, meta: null, ant: null });
  const resumenDe = (s: SerieCanal) => {
    const filas = filasDe(s);
    const real = filas.reduce((a, x) => a + (x.real ?? 0), 0), meta = filas.filter((x) => x.real !== null).reduce((a, x) => a + (x.meta ?? 0), 0);
    const und = filas.reduce((a, x) => a + (x.und ?? 0), 0);
    return { real, meta, und, texto: porCanalUnd ? (s.conUnidades ? `${entero(und)} und` : "") : `${compacto(real)}${meta ? ` · ${porcentaje(real / meta)} de la meta` : ""}` };
  };
  /** Gráfico de un canal: pequeño en la grilla o grande en la ventana. */
  const grafico = (s: SerieCanal, grande: boolean) => (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={filasDe(s)} margin={{ left: grande ? 8 : 0, right: grande ? 16 : 6, top: grande ? 12 : 6, bottom: 0 }}>
        <CartesianGrid vertical={false} {...GRILLA} />
        <XAxis dataKey="mes" tickFormatter={(m) => (grande ? etiqueta(Number(m)) : MESES[Number(m) - 1])} tick={EJE} axisLine={false} tickLine={false}
               interval={grande ? 0 : "preserveStartEnd"} minTickGap={8} dy={grande ? 6 : 0} />
        <YAxis tick={EJE} axisLine={false} tickLine={false} width={grande ? 56 : 44} tickFormatter={(v) => compacto(Number(v))} />
        {porCanalUnd
          ? <Tooltip wrapperStyle={{ zIndex: 20 }} content={<DetalleSku etiqueta={etiqueta} color={color(s.canal)} />} />
          : <Tooltip contentStyle={CAJA} labelFormatter={(m) => etiqueta(Number(m))}
                     formatter={(v, n) => [v === null || v === undefined ? "—" : soles(Number(v)), n === "real" ? "Real" : n === "meta" ? "Meta" : "Año pasado"]} />}
        {!porCanalUnd && <Line dataKey="ant" type="monotone" stroke="var(--serie-gris)" strokeWidth={grande ? 1.8 : 1.4} dot={false} connectNulls isAnimationActive={false} />}
        {!porCanalUnd && <Line dataKey="meta" type="monotone" stroke="var(--tinta)" strokeOpacity={0.55} strokeWidth={grande ? 1.8 : 1.4} strokeDasharray={PUNTEADO} dot={false} connectNulls isAnimationActive={false} />}
        <Line dataKey={porCanalUnd ? "und" : "real"} type="monotone" stroke={color(s.canal)} strokeWidth={grande ? 3 : 2.4}
              dot={{ r: grande ? 3.5 : 2.2, strokeWidth: 0, fill: color(s.canal) }} activeDot={{ r: grande ? 6 : 4 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
  // Ventana con un solo canal en grande. Se puede pasar al canal anterior/siguiente con las flechas (o ← →).
  const conGrafico = series.filter((s) => !(porCanalUnd && !s.conUnidades));
  const iGrande = conGrafico.findIndex((s) => s.canal === grande);
  const sGrande = iGrande >= 0 ? conGrafico[iGrande] : null;
  const mover = (d: number) => setGrande(conGrafico[(iGrande + d + conGrafico.length) % conGrafico.length].canal);
  const ventana = sGrande && (
    <dialog ref={(d) => { if (d && !d.open) d.showModal(); }} onClose={() => setGrande(null)} aria-label={`Gráfico de ${sGrande.nombre}`}
            onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}
            onKeyDown={(e) => { if (e.key === "ArrowRight") mover(1); if (e.key === "ArrowLeft") mover(-1); }}
            className="m-auto w-[min(96vw,1100px)] max-h-[94vh] overflow-y-auto rounded-xl border border-[var(--linea)] bg-[var(--superficie)] p-0 text-[var(--tinta)] shadow-2xl backdrop:bg-black/50">
      <div className="grid gap-4 p-4 @container">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-block size-3 rounded-sm" style={{ background: color(sGrande.canal) }} aria-hidden />
            <h3 className="text-lg font-semibold">{sGrande.nombre}</h3>
            <span className="num text-sm text-[var(--tenue)]">{resumenDe(sGrande).texto}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="segmento" role="group" aria-label="Qué medir">
              {([["venta", "Venta S/"], ["und", "Unidades"]] as [Medida, string][]).map(([k, t]) => (
                <button key={k} type="button" aria-pressed={k === "und" ? enUnd : !enUnd} onClick={() => setMedida(k)}
                        disabled={k === "und" && !sGrande.conUnidades}>{t}</button>
              ))}
            </div>
            {conGrafico.length > 1 && <>
              <button type="button" className="boton presionable !h-8 !px-2" onClick={() => mover(-1)} aria-label="Canal anterior" title="Canal anterior (←)"><ChevronLeft size={16} aria-hidden /></button>
              <button type="button" className="boton presionable !h-8 !px-2" onClick={() => mover(1)} aria-label="Canal siguiente" title="Canal siguiente (→)"><ChevronRight size={16} aria-hidden /></button>
            </>}
            <button type="button" className="boton presionable !h-8 !px-2" onClick={(e) => e.currentTarget.closest("dialog")?.close()} aria-label="Cerrar" title="Cerrar (Esc)"><X size={16} aria-hidden /></button>
          </div>
        </div>
        <p className="text-xs text-[var(--tenue)]">
          {porCanalUnd ? "Unidades de cada mes · pasa el mouse por un mes para ver qué SKU las hicieron." : "Línea de color: real · punteada: meta · gris: año pasado."}
        </p>
        <div className="h-[min(56vh,460px)]">{grafico(sGrande, true)}</div>
        <div className="overflow-x-auto rounded-lg border border-[var(--linea)]">
          <table className="datos text-[12.5px]">
            <thead>
              <tr><th>Mes</th>{porCanalUnd
                ? <><th className="n">Unidades</th><th>SKU que más vendió</th></>
                : <><th className="n">Real S/</th><th className="n">Meta S/</th><th className="n">Cumplimiento</th><th className="n">Año pasado S/</th><th className="n">vs año pasado</th></>}</tr>
            </thead>
            <tbody>
              {filasDe(sGrande).filter((x) => x.real !== null || x.und).map((x) => (
                <tr key={x.mes}>
                  <td>{etiqueta(x.mes)}</td>
                  {porCanalUnd
                    ? <><td className="n num">{x.und ? entero(x.und) : "—"}</td>
                        <td>{x.skus?.[0] ? `${x.skus[0].producto} · ${entero(x.skus[0].und)} (${porcentaje(x.skus[0].und / (x.und || 1))})` : "—"}</td></>
                    : <><td className="n num">{x.real === null ? "—" : soles(x.real)}</td><td className="n num">{x.meta ? soles(x.meta) : "—"}</td>
                        <td className="n num">{x.real !== null && x.meta ? porcentaje(x.real / x.meta) : "—"}</td>
                        <td className="n num">{x.ant ? soles(x.ant) : "—"}</td>
                        <td className={`n num ${x.real !== null && x.ant ? (x.real >= x.ant ? "text-[var(--bueno)]" : "text-[var(--critico)]") : ""}`}>{x.real !== null && x.ant ? signo(x.real / x.ant - 1) : "—"}</td></>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </dialog>
  );

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
            · cada gráfico con su propia escala{porCanalUnd ? " · pasa el mouse por un mes para ver qué SKU hicieron esas unidades · en unidades no hay meta ni año pasado" : ""}
          </p>
          <div className={`grid gap-4 grid-cols-1 ${series.length > 1 ? "@2xl:grid-cols-2 @5xl:grid-cols-3" : ""}`}>
            {series.map((s) => {
              const r = resumenDe(s);
              return (
                <figure key={s.canal} className="grid gap-1 rounded-lg border border-[var(--linea)] p-3">
                  <figcaption className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold"><span className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: color(s.canal) }} aria-hidden />{s.nombre}</span>
                    <span className="flex items-center gap-2">
                      <span className="num text-xs text-[var(--tenue)]">{r.texto}</span>
                      {!(porCanalUnd && !s.conUnidades) && (
                        <button type="button" className="presionable grid size-7 place-items-center rounded-md text-[var(--tenue)] hover:bg-[var(--superficie-2)] hover:text-[var(--tinta)]"
                                onClick={() => setGrande(s.canal)} aria-label={`Ampliar el gráfico de ${s.nombre}`} title="Ampliar">
                          <Maximize2 size={14} aria-hidden />
                        </button>
                      )}
                    </span>
                  </figcaption>
                  {porCanalUnd && !s.conUnidades ? (
                    <p className="grid h-40 place-items-center text-center text-xs text-[var(--tenue)]">Este canal no trae detalle por producto: no hay unidades.</p>
                  ) : <div className={series.length > 1 ? "h-40" : "h-72"}>{grafico(s, false)}</div>}
                </figure>
              );
            })}
          </div>
        </>
      )}
      {ventana}
    </div>
  );
}
