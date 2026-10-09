"use client";

// ¿La venta sube o baja? Sin año anterior para comparar, se compara la venta consigo misma: cada día (línea fina) y su promedio
// de 7 días (línea gruesa, quita el vaivén de los fines de semana). Arriba, los últimos 7 días contra los 7 anteriores; abajo,
// semana a semana con su variación. Los días sin reporte no cuentan como cero: el promedio usa solo los días con dato.
import { useState } from "react";
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { entero, porcentaje, soles } from "@/lib/formato";
import { CAJA, EJE, GRILLA, compacto } from "@/lib/graficos";

export type DiaVenta = { fecha: string; venta: number; und: number };
type Medida = "venta" | "und";
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const DIA = 86_400_000;
const corta = (d: string) => `${Number(d.slice(8, 10))} ${MESES[Number(d.slice(5, 7)) - 1]}`;
const larga = (d: string) => `${DIAS[new Date(ms(d)).getUTCDay()]} ${corta(d)}`;
/** Lunes de la semana de una fecha (aaaa-mm-dd). */
const lunes = (d: string) => new Date(ms(d) - ((new Date(ms(d)).getUTCDay() + 6) % 7) * DIA).toISOString().slice(0, 10);
const signo = (x: number | null) => (x === null ? "—" : `${x >= 0 ? "▲ +" : "▼ "}${porcentaje(x)}`);
const tono = (x: number | null) => (x === null ? "text-[var(--tenue)]" : x >= 0 ? "text-[var(--bueno)]" : "text-[var(--critico)]");

export function TendenciaDiaria({ dias, nombre }: { dias: DiaVenta[]; /** «SPSA», «OXXO» */ nombre: string }) {
  const [medida, setMedida] = useState<Medida>("venta");
  const fmt = (v: number) => (medida === "venta" ? soles(v) : `${entero(v)} und`);
  const orden = [...dias].sort((a, b) => a.fecha.localeCompare(b.fecha));
  // Promedio por día con dato dentro de una ventana de días calendario que termina en t.
  const promedio = (t: number, largo: number) => {
    const v = orden.filter((d) => ms(d.fecha) > t - largo * DIA && ms(d.fecha) <= t);
    return v.length ? v.reduce((s, d) => s + d[medida], 0) / v.length : null;
  };
  const puntos = orden.map((d, i) => ({ fecha: d.fecha, dia: d[medida], media: i >= 2 ? promedio(ms(d.fecha), 7) : null }));
  const ultimo = orden.at(-1);
  const tU = ultimo ? ms(ultimo.fecha) : 0;
  const ahora = promedio(tU, 7), antes = promedio(tU - 7 * DIA, 7);
  const cambio = ahora !== null && antes ? ahora / antes - 1 : null;
  // Semana a semana (lunes a domingo): promedio por día con reporte, para que una semana incompleta no parezca una caída.
  const semanas = [...new Set(orden.map((d) => lunes(d.fecha)))].map((l) => {
    const v = orden.filter((d) => lunes(d.fecha) === l);
    return { lunes: l, dias: v.length, total: v.reduce((s, d) => s + d[medida], 0), media: v.reduce((s, d) => s + d[medida], 0) / v.length };
  }).map((s, i, xs) => ({ ...s, var: i && xs[i - 1].media ? s.media / xs[i - 1].media - 1 : null }));
  const mejor = orden.reduce<DiaVenta | null>((x, d) => (!x || d[medida] > x[medida] ? d : x), null);

  // Proyección. Peso de cada día de la semana (lun…dom) = su venta ÷ el promedio de su semana, mediana de las semanas completas.
  // Esta semana: lo que va ÷ el peso de los días con dato = el nivel; los días que faltan se llenan con ese nivel × su peso.
  // Próxima semana: ese nivel × 7, sin crecer (piso) y creciendo como la mediana de las últimas semanas (con la tendencia).
  const proy = (() => {
    const completas = semanas.filter((s) => s.dias === 7);
    if (!completas.length || !ultimo) return null;
    const dow = (f: string) => (new Date(ms(f)).getUTCDay() + 6) % 7;     // 0 = lunes
    const mediana = (xs: number[]) => { const o = [...xs].sort((a, b) => a - b); return o.length ? (o[(o.length - 1) >> 1] + o[o.length >> 1]) / 2 : 0; };
    const crudo = Array.from({ length: 7 }, (_, i) => mediana(completas.map((s) => {
      const d = orden.find((x) => lunes(x.fecha) === s.lunes && dow(x.fecha) === i);
      return d && s.media ? d[medida] / s.media : 1;
    })));
    const suma = crudo.reduce((a, x) => a + x, 0), peso = crudo.map((x) => (x * 7) / suma);
    const l = lunes(ultimo.fecha), estas = orden.filter((d) => lunes(d.fecha) === l);
    const va = estas.reduce((a, d) => a + d[medida], 0);
    const con = new Set(estas.map((d) => dow(d.fecha)));
    const pesoVa = [...con].reduce((a, i) => a + peso[i], 0);
    if (!pesoVa) return null;
    const nivel = va / pesoVa;
    const faltan = Array.from({ length: 7 }, (_, i) => i).filter((i) => !con.has(i));
    const cierre = va + faltan.reduce((a, i) => a + nivel * peso[i], 0);
    const previas = semanas.filter((s) => s.dias === 7 && s.lunes < l).slice(-4);
    const crec = mediana([...previas.map((s) => s.var).filter((x): x is number => x !== null), ...(previas.length ? [cierre / 7 / previas[previas.length - 1].media - 1] : [])]);
    const sig = new Date(ms(l) + 7 * DIA).toISOString().slice(0, 10), finSig = new Date(ms(l) + 13 * DIA).toISOString().slice(0, 10);
    return { l, finEsta: new Date(ms(l) + 6 * DIA).toISOString().slice(0, 10), va, dias: estas.length, cierre, faltan: faltan.length,
             varCierre: previas.length ? cierre / (previas[previas.length - 1].total) - 1 : null,
             sig, finSig, piso: nivel * 7, tendencia: nivel * 7 * (1 + Math.max(crec, 0)), crec };
  })();

  if (orden.length < 2) return <p className="text-sm text-[var(--tenue)]">Hacen falta al menos dos días con venta para ver si sube o baja.</p>;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-0.5">
          <p className="text-[13px] text-[var(--tenue)]">Últimos 7 días vs los 7 anteriores (promedio por día)</p>
          <p className={`cifra num text-[26px] font-semibold leading-tight ${tono(cambio)}`} key={`${medida}${cambio}`}>{signo(cambio)}</p>
          <p className="text-xs text-[var(--tenue)]">
            {ahora !== null && <>Hoy se vende {fmt(ahora)} por día{antes ? <>; la semana anterior, {fmt(antes)}</> : null}.</>}
            {mejor && <> Mejor día: {larga(mejor.fecha)} ({fmt(mejor[medida])}).</>}
          </p>
        </div>
        <div className="segmento" role="group" aria-label="Medir por">
          {([["venta", "Venta S/"], ["und", "Unidades"]] as [Medida, string][]).map(([k, t]) => (
            <button key={k} type="button" aria-pressed={medida === k} onClick={() => setMedida(k)}>{t}</button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={puntos} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} {...GRILLA} />
          <XAxis dataKey="fecha" tickFormatter={corta} tick={EJE} axisLine={false} tickLine={false} minTickGap={20} dy={6} />
          <YAxis tick={EJE} axisLine={false} tickLine={false} tickFormatter={(v) => compacto(Number(v))} width={48} />
          <Tooltip contentStyle={CAJA} labelFormatter={(d) => larga(String(d))}
                   formatter={(v, n) => [v === null || v === undefined ? "—" : fmt(Number(v)), n === "dia" ? "Ese día" : "Promedio 7 días"]} />
          <Line dataKey="dia" type="linear" stroke="var(--serie-gris)" strokeWidth={1.2} strokeOpacity={0.7} dot={{ r: 1.8, strokeWidth: 0, fill: "var(--serie-gris)" }}
                activeDot={{ r: 3.5 }} isAnimationActive={false} />
          <Line dataKey="media" type="monotone" stroke="var(--serie-1)" strokeWidth={2.6} dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--tenue)]">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-[3px] w-5 rounded bg-[var(--serie-1)]" aria-hidden />Promedio de 7 días: si sube, la venta va en aumento</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-px w-5 bg-[var(--serie-gris)]" aria-hidden />Venta de cada día</span>
      </p>

      {proy && (
        <div className="grid gap-4 rounded-lg border border-[var(--linea)] p-4 @2xl:grid-cols-2 @2xl:divide-x divide-[var(--linea)]">
          <div className="grid content-start gap-1">
            <p className="text-[13px] text-[var(--tenue)]">Esta semana ({corta(proy.l)} – {corta(proy.finEsta)})</p>
            <p className="num text-[22px] font-semibold leading-tight">{fmt(proy.cierre)} <span className="text-sm font-normal text-[var(--tenue)]">cierre estimado</span></p>
            <p className="text-xs text-[var(--tenue)]">
              Van {fmt(proy.va)} en {proy.dias} {proy.dias === 1 ? "día" : "días"}{proy.faltan ? `; faltan ${proy.faltan}, que se estiman con el peso de cada día de la semana` : ""}.
              {proy.varCierre !== null && <> Contra la semana anterior: <b className={tono(proy.varCierre)}>{signo(proy.varCierre)}</b>.</>}
            </p>
          </div>
          <div className="grid content-start gap-1 @2xl:pl-4">
            <p className="text-[13px] text-[var(--tenue)]">Próxima semana ({corta(proy.sig)} – {corta(proy.finSig)})</p>
            <p className="num text-[22px] font-semibold leading-tight">
              {proy.tendencia > proy.piso * 1.005 ? <>{fmt(proy.piso)} <span className="text-[var(--tenue)]">a</span> {fmt(proy.tendencia)}</> : fmt(proy.piso)}
            </p>
            <p className="text-xs text-[var(--tenue)]">
              Desde {fmt(proy.piso)} si se mantiene el ritmo de esta semana{proy.tendencia > proy.piso * 1.005
                ? <>, hasta {fmt(proy.tendencia)} si sigue creciendo como las últimas semanas (mediana {signo(proy.crec)} por semana)</> : null}.
              Es una estimación: no considera promociones, quiebres de stock ni el empuje de diciembre.
            </p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-[var(--linea)]">
        <table className="datos text-[12.5px]">
          <thead>
            <tr><th>Semana (lunes)</th><th className="n">Días con reporte</th><th className="n">{medida === "venta" ? "Venta S/" : "Unidades"}</th>
              <th className="n">Promedio por día</th><th className="n">vs semana anterior</th></tr>
          </thead>
          <tbody>
            {[...semanas].reverse().map((s) => (
              <tr key={s.lunes}>
                <td>{corta(s.lunes)}</td><td className="n num">{s.dias}{s.dias < 7 ? <span className="text-[var(--tenue)]"> de 7</span> : null}</td>
                <td className="n num">{fmt(s.total)}</td><td className="n num">{fmt(s.media)}</td>
                <td className={`n num font-medium ${tono(s.var)}`}>{signo(s.var)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[var(--tenue)]">
        Sin un año anterior de {nombre} para comparar, la venta se compara consigo misma. Se usa el promedio por día con reporte para que una semana
        incompleta (o un día sin reporte) no parezca una caída.
      </p>
    </div>
  );
}
