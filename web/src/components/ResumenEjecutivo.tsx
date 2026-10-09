"use client";

// Resumen ejecutivo (el mismo en todos los canales). Un solo periodo: el del filtro de arriba. La barra de la meta del año también
// elige el periodo (un mes o el año a la fecha) escribiendo en ese mismo filtro, así todo lo de la página habla del mismo tramo.
// Notación fija en todo el resumen: real en naranja, meta como contorno café, año anterior en gris; verde/ámbar/rojo solo para el
// estado frente a la meta y siempre con su palabra («En meta», «Cerca de la meta», «Bajo la meta»).
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { entero, millones, porcentaje, soles } from "@/lib/formato";
import { AvisoCargando } from "./AvisoCargando";
import { GraficoMesAMes } from "./GraficoMesAMes";
import type { Comparar } from "@/lib/periodos";
import { Tabla, type Columna } from "./Tabla";

/** Venta por «cliente» (tienda, cadena, razón social…) y SKU en un periodo. */
export type FilaDim = { dim: string; sku: string; producto: string; und: number; venta: number };
/** Venta por mes y SKU (para la evolución). */
export type FilaMes = { mes: string; sku: string; producto: string; und: number; venta: number };
/** Qué es «cliente» en cada canal (cadena, tienda, razón social…) y cómo se llama la venta. */
export type ConfigEjecutivo = { dim: string; dims: string; activos: string; venta: string; nota?: string };
export type DatosEjecutivo = { actual: FilaDim[]; anterior: FilaDim[]; meses: FilaMes[]; mesesLY: FilaMes[];
  /** Meta mensual del canal («2026-07» → S/), o null con el motivo en sinMeta. */
  metas?: Record<string, number> | null; sinMeta?: string | null;
  /** Meta mensual de cada tienda (solo canales de tiendas). */
  metasDim?: Record<string, Record<string, number>> | null };

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const pad = (m: number) => String(m).padStart(2, "0");
const dmy = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
const menosUnAnio = (s: string) => `${Number(s.slice(0, 4)) - 1}${s.slice(4)}`;
const finDeMes = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
const div = (a: number, b: number) => (b ? a / b : null);
const signo = (x: number | null) => (x === null ? "—" : `${x >= 0 ? "+" : "−"}${porcentaje(Math.abs(x))}`);
type Suma = { und: number; venta: number };
const sumar = (xs: Suma[]): Suma => xs.reduce((a, x) => ({ und: a.und + x.und, venta: a.venta + x.venta }), { und: 0, venta: 0 });
function porClave<T extends Suma>(xs: T[], clave: (x: T) => string) {
  const m = new Map<string, Suma>();
  for (const x of xs) { const k = clave(x); const s = m.get(k) ?? { und: 0, venta: 0 }; s.und += x.und; s.venta += x.venta; m.set(k, s); }
  return m;
}
/** Meses («2026-03») que toca el periodo. */
function mesesEntre(desde: string, hasta: string) {
  const r: string[] = [];
  for (let a = Number(desde.slice(0, 4)), m = Number(desde.slice(5, 7)); `${a}-${pad(m)}` <= hasta.slice(0, 7); m === 12 ? (a++, m = 1) : m++) r.push(`${a}-${pad(m)}`);
  return r;
}
/** Estado frente a la meta: color + palabra (nunca solo color). */
function estado(c: number | null) {
  if (c === null) return null;
  if (c >= 1) return { texto: "En meta", tinta: "text-[var(--bueno)]", fondo: "bg-[var(--bueno-suave)]" };
  if (c >= 0.9) return { texto: "Cerca de la meta", tinta: "text-[var(--alerta)]", fondo: "bg-[var(--alerta-suave)]" };
  return { texto: "Bajo la meta", tinta: "text-[var(--critico)]", fondo: "bg-[var(--critico-suave)]" };
}
const colorVar = (x: number | null) => (x === null ? "" : x >= 0 ? "text-[var(--bueno)]" : "text-[var(--critico)]");

/** Cambia el periodo del filtro de arriba (la misma URL que usa el calendario). */
function usePeriodo() {
  const router = useRouter(), ruta = usePathname(), sp = useSearchParams();
  const [cargando, iniciar] = useTransition();
  const ir = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(cambios)) if (v === null) p.delete(k); else p.set(k, v);
    iniciar(() => router.push(`${ruta}?${p}`, { scroll: false }));
  };
  return { ir, cargando };
}

/** Tiendas (o clientes) contra su meta: barra del real con una marca de la meta (gráfico de bala). Tocar una fila filtra la página. */
/** Variación como barra que nace en el centro: a la derecha (verde) si sube, a la izquierda (rojo) si baja. ±25% llena el lado. */
export function BarraVariacion({ v, tope = 0.25 }: { v: number | null; tope?: number }) {
  const ancho = v === null ? 0 : Math.min(Math.abs(v) / tope, 1) * 50;
  return (
    <div className="relative h-2 rounded-full bg-[var(--neutro-suave)]" aria-hidden>
      <span className="absolute inset-y-[-3px] left-1/2 w-px bg-[var(--tenue)] opacity-50" />
      {v !== null && <span className={`barra-crece absolute inset-y-0 rounded-full ${v >= 0 ? "left-1/2 bg-[var(--bueno)]" : "right-1/2 bg-[var(--critico)]"}`}
                           style={{ width: `${ancho}%`, transformOrigin: v >= 0 ? "left" : "right" }} />}
    </div>
  );
}

/** Cumplimiento como medidor: se llena hasta el % y una raya café marca la meta (o, en el año a la fecha, dónde deberías ir hoy). */
export function Medidor({ c, marca, color }: { c: number | null; marca: number; color: string }) {
  const escala = Math.max(1, marca, (c ?? 0) * 1.05);
  return (
    <div className="relative h-2 rounded-full bg-[var(--neutro-suave)]" aria-hidden>
      {c !== null && <span className="barra-crece absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(c / escala, 1) * 100}%`, background: color, transformOrigin: "left" }} />}
      <span className="absolute inset-y-[-4px] w-[3px] rounded-full bg-[var(--serie-2)]" style={{ left: `calc(${(marca / escala) * 100}% - 1.5px)` }} />
    </div>
  );
}

/** Bloque del resumen sin caja: una línea fina arriba, título y contenido (las cajas quedan solo para los indicadores). */
function Seccion({ titulo, subtitulo, accion, children }: { titulo: string; subtitulo?: React.ReactNode; accion?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-[var(--linea)] pt-6 min-w-0">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[17px] font-semibold tracking-[-0.01em]">{titulo}</h3>
          {subtitulo && <p className="mt-0.5 text-[13px] text-[var(--tenue)]">{subtitulo}</p>}
        </div>
        {accion}
      </header>
      {children}
    </section>
  );
}

/** Columnas de la lista de tiendas: nombre, barra, venta, % de la meta y crecimiento (en angosto: nombre, barra y venta). */
const COLUMNAS = "grid grid-cols-[minmax(84px,140px)_1fr_auto] @3xl:grid-cols-[150px_1fr_130px_200px_150px] items-center gap-x-3 gap-y-1 rounded-md px-2 py-1.5";

function DimsVsMeta({ filas, conMeta, filtrable, ir, dim, contra }: {
  filas: { dim: string; venta: number; meta: number | null; ly: number | null; pct: number | null }[];
  conMeta: boolean; filtrable: boolean; ir: (c: Record<string, string | null>) => void; dim: string;
  /** Contra qué se compara («2025», «el periodo anterior»); vacío = sin comparación. */ contra: string;
}) {
  const escala = Math.max(...filas.map((f) => Math.max(f.venta, f.meta ?? 0)), 1);
  return (
    <ul className="grid gap-1.5">
      {/* Qué es cada columna (en pantallas angostas cada % lleva su etiqueta al lado). */}
      <li className={`${COLUMNAS} hidden @3xl:grid !py-0 text-xs font-medium text-[var(--tenue)]`} aria-hidden>
        <span>{dim}</span>
        <span>{conMeta ? "Venta frente a su meta (raya café)" : "Venta"}</span>
        <span className="text-right">Venta</span>
        <span className="text-right">{conMeta ? "Cumplimiento de su meta" : "% del total"}</span>
        <span className="text-right">{contra ? `Crecimiento vs ${contra}` : ""}</span>
      </li>
      {filas.map((f, i) => {
        const c = f.meta ? f.venta / f.meta : null, est = estado(c), v = f.ly ? f.venta / f.ly - 1 : null;
        const contenido = (
          <>
            <span className="flex min-w-0 items-baseline gap-2"><span className="num w-4 shrink-0 text-right text-xs text-[var(--tenue)]">{i + 1}</span><span className="truncate text-sm font-medium" title={f.dim}>{f.dim}</span></span>
            <span className="relative h-3 rounded-full bg-[var(--neutro-suave)]" aria-hidden>
              <span className="barra-crece absolute inset-y-0 left-0 rounded-full bg-[var(--serie-1)]" style={{ width: `${(f.venta / escala) * 100}%`, transformOrigin: "left" }} />
              {f.meta !== null && <span className="absolute inset-y-[-5px] w-[3px] rounded-full bg-[var(--serie-2)]" style={{ left: `calc(${(f.meta / escala) * 100}% - 1.5px)` }} />}
            </span>
            <span className="num text-sm text-right">{soles(f.venta)}</span>
            <span className="text-xs text-right">
              {conMeta
                ? (est ? <span className={`rounded px-1.5 py-0.5 font-medium ${est.fondo} ${est.tinta}`}>{porcentaje(c)}<span className="@3xl:hidden"> de su meta</span> · {est.texto}</span> : "—")
                : <span className="num text-[var(--tenue)]">{porcentaje(f.pct)} del total</span>}
            </span>
            <span className={`num text-xs text-right ${colorVar(v)}`}>{v === null ? (contra ? "—" : "") : <>{v >= 0 ? "▲" : "▼"} {signo(v)}<span className="@3xl:hidden"> vs {contra}</span></>}</span>
          </>
        );
        const clase = COLUMNAS;
        return (
          <li key={f.dim}>
            {filtrable
              ? <button type="button" className={`${clase} presionable w-full text-left hover:bg-[var(--superficie-2)]`} onClick={() => ir({ tienda: f.dim })}
                        title={`Ver solo ${f.dim}`}>{contenido}</button>
              : <div className={clase}>{contenido}</div>}
          </li>
        );
      })}
      {filtrable && <li className="px-2 pt-1 text-xs text-[var(--tenue)]">Toca una {dim.toLowerCase()} para ver toda la página solo con ella.</li>}
    </ul>
  );
}

/** Resumen ejecutivo: barra de la meta del año, la conclusión, 4 indicadores, quién cumple, mes a mes y productos. */
export function ResumenEjecutivo({ datos, desde, hasta, config, archivo, comparacion }: {
  datos: DatosEjecutivo; desde: string; hasta: string; config: ConfigEjecutivo; archivo: string;
  /** Contra qué se comparan indicadores, tiendas y productos (el «Comparar con» de arriba): sin indicar = mismas fechas del año
   *  anterior; null = sin comparación. El mes a mes compara siempre con el año anterior. */
  comparacion?: { tipo: Comparar; desde: string; hasta: string } | null;
}) {
  const { ir, cargando } = usePeriodo();
  const { actual: C, anterior: L } = datos;
  const RC = sumar(C), RL = sumar(L);
  const hayLY = comparacion !== null && RL.venta !== 0;
  const anio = Number(hasta.slice(0, 4)), anioAnt = anio - 1;
  const clave = (m: number) => `${anio}-${pad(m)}`;
  const totMes = porClave(datos.meses, (f) => f.mes), totLY = porClave(datos.mesesLY, (f) => f.mes);
  const metas = datos.metas ?? null;
  const reales = Array.from({ length: 12 }, (_, i) => { const t = totMes.get(clave(i + 1)); return t && (t.venta || t.und) ? t.venta : null; });
  const ultimoMes = reales.reduce<number>((u, r, i) => (r !== null ? i + 1 : u), 0);

  // Periodo: los meses que toca, si es «año a la fecha» y si algún extremo corta un mes.
  const mesesPer = mesesEntre(desde, hasta);
  const acumulado = desde === `${anio}-01-01` && Number(hasta.slice(5, 7)) >= ultimoMes;
  const parcial = !desde.endsWith("-01") || hasta < finDeMes(hasta.slice(0, 7));
  const seleccion = new Set(acumulado ? [] : mesesPer.filter((m) => m.startsWith(`${anio}-`)).map((m) => Number(m.slice(5, 7))));
  const unMes = mesesPer.length === 1 && !parcial;
  const etiqueta = acumulado ? `ene–${MESES[Number(hasta.slice(5, 7)) - 1].toLowerCase()} ${anio}`
    : unMes ? `${MESES_LARGOS[Number(hasta.slice(5, 7)) - 1]} ${anio}`
    : !parcial ? `${MESES[Number(desde.slice(5, 7)) - 1].toLowerCase()}–${MESES[Number(hasta.slice(5, 7)) - 1].toLowerCase()} ${anio}`
    : `${dmy(desde)} – ${dmy(hasta)}`;
  const cmp = comparacion === undefined ? { tipo: "anio" as Comparar, desde: menosUnAnio(desde), hasta: menosUnAnio(hasta) } : comparacion;
  const textoLY = cmp ? `${dmy(cmp.desde)} – ${dmy(cmp.hasta)}` : "";
  const contraQue = !cmp ? "" : cmp.tipo === "anio" ? String(anioAnt) : cmp.tipo === "anioSem" ? `${anioAnt} (mismo día de la semana)`
    : cmp.tipo === "sem" ? "la semana anterior" : "el periodo anterior";
  const cortoQue = !cmp ? "" : cmp.tipo === "anio" || cmp.tipo === "anioSem" ? String(anioAnt) : cmp.tipo === "sem" ? "sem. ant." : "per. ant.";

  // Indicadores. Var % vs meta: el periodo contra su meta. Nivel de cumplimiento: año a la fecha contra la meta del año;
  // con meses elegidos, esos meses contra su meta.
  const metaPer = metas ? mesesPer.reduce((a, k) => a + (metas[k] ?? 0), 0) : 0;
  const metaAnual = metas ? Array.from({ length: 12 }, (_, i) => metas[clave(i + 1)] ?? 0).reduce((a, x) => a + x, 0) : 0;
  const varLY = hayLY ? RC.venta / RL.venta - 1 : null;
  const varMeta = metaPer ? RC.venta / metaPer - 1 : null;
  const [nivel, metaNivel] = acumulado ? [div(RC.venta, metaAnual), metaAnual] : [div(RC.venta, metaPer), metaPer];
  const notaParcial = parcial && metaPer ? " (la meta es del mes completo)" : "";

  // La conclusión en una frase.
  // Lo fijo va en peso normal; lo que cambia con los datos (periodo, verbos y porcentajes) en negrita, y los % con su color.
  const dato = (x: React.ReactNode, clase = "") => <b className={`font-semibold text-[var(--tinta)] ${clase}`}>{x}</b>;
  const partes: React.ReactNode[] = [
    varLY !== null && <span key="ly">{dato(varLY >= 0 ? "crece" : "cae")} {dato(signo(varLY), colorVar(varLY))} contra {dato(contraQue)}</span>,
    varMeta !== null && (varMeta >= 0
      ? <span key="m">{dato("supera")} su meta en {dato(signo(varMeta), colorVar(varMeta))}</span>
      : <span key="m">va {dato(signo(varMeta), colorVar(varMeta))} {dato("bajo")} su meta</span>),
  ].filter(Boolean);

  // Quién cumple: por tienda/cliente, con su meta si existe.
  const dimC = porClave(C, (f) => f.dim), dimL = porClave(L, (f) => f.dim);
  const metasDim = datos.metasDim ?? null;
  const filasDim = [...dimC.entries()].map(([d, s]) => ({
    dim: d, venta: s.venta, ly: hayLY ? dimL.get(d)?.venta ?? 0 : null, pct: div(s.venta, RC.venta),
    meta: metasDim?.[d] ? mesesPer.reduce((a, k) => a + (metasDim[d][k] ?? 0), 0) : null,
  })).sort((a, b) => b.venta - a.venta);
  const conMetaDim = filasDim.some((f) => f.meta);
  const filtrable = config.dim === "Tienda";

  // Mes a mes del año calendario: real, año anterior y meta.
  const hastaMes = (i: number, f: (j: number) => number) => Array.from({ length: i + 1 }, (_, j) => (reales[j] !== null ? f(j) : 0)).reduce((a, x) => a + x, 0);
  const mesAMes = Array.from({ length: 12 }, (_, i) => {
    const k = clave(i + 1), r = reales[i], ly = totLY.get(k)?.venta ?? null, m = metas?.[k] ?? null;
    const acR = hastaMes(i, (j) => reales[j] ?? 0), acM = hastaMes(i, (j) => metas?.[clave(j + 1)] ?? 0), acL = hastaMes(i, (j) => totLY.get(clave(j + 1))?.venta ?? 0);
    return { mes: `${MESES[i]} ${anio}`, n: i + 1, und: totMes.get(k)?.und ?? null, venta: r, ly, var_ly: r !== null && ly ? r / ly - 1 : null,
             meta: m, var_meta: r !== null && m ? r / m - 1 : null, cumpl: r !== null && m ? r / m : null,
             acumulado: r !== null ? acR : null, acumulado_meta: r !== null && metas ? acM : null, cumpl_acum: r !== null && acM ? acR / acM : null,
             var_acum: r !== null && acL ? acR / acL - 1 : null };
  }).filter((f) => f.venta !== null || f.meta);

  // Productos del periodo, con su evolución de los últimos 6 meses con venta hasta el fin del periodo.
  const seis = [...totMes.keys()].filter((k) => k <= hasta.slice(0, 7)).sort().slice(-6);
  const skuC = porClave(C, (f) => f.sku), skuL = porClave(L, (f) => f.sku);
  const nombreSku = new Map([...datos.meses, ...C].map((f) => [f.sku, f.producto]));
  const porSku = [...skuC.entries()].map(([sku, s]) => {
    const deSku = porClave(C.filter((f) => f.sku === sku), (f) => f.dim);
    const [principal, sp] = [...deSku.entries()].sort((a, b) => b[1].venta - a[1].venta)[0] ?? ["—", { venta: 0 }];
    const evo = Object.fromEntries(seis.map((m) => [`m_${m}`, sumar(datos.meses.filter((f) => f.mes === m && f.sku === sku)).venta]));
    return { producto: nombreSku.get(sku) ?? sku, sku, und: s.und, venta: s.venta, mix: div(s.venta, RC.venta),
             var: hayLY ? (skuL.get(sku)?.venta ? s.venta / skuL.get(sku)!.venta - 1 : null) : null, principal, principal_pct: div(sp.venta, s.venta), ...evo };
  }).sort((a, b) => b.venta - a.venta);
  const totalSeis = Object.fromEntries(seis.map((m) => [`m_${m}`, totMes.get(m)?.venta ?? 0]));
  const nombreMes = (k: string) => `${MESES[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;

  const vacio = !C.length;
  const esperado = acumulado && metaAnual ? metaPer / metaAnual : 1;   // en el año a la fecha: dónde deberías ir hoy
  const estNivel = acumulado ? estado(metaPer ? RC.venta / metaPer : null) : estado(nivel);
  const colorNivel = acumulado ? "var(--serie-1)" : nivel !== null && nivel >= 1 ? "var(--bueno)" : nivel !== null && nivel >= 0.9 ? "var(--alerta)" : "var(--critico)";
  const stats: { titulo: string; valor: string; clase?: string; grafico: React.ReactNode; contexto: React.ReactNode }[] = [
    ...(cmp ? [{ titulo: `Var % contra ${contraQue}`, valor: varLY === null ? "—" : `${varLY >= 0 ? "▲" : "▼"} ${signo(varLY)}`, clase: colorVar(varLY),
      grafico: <BarraVariacion v={varLY} />, contexto: hayLY ? `${soles(RL.venta)} del ${textoLY}` : `Sin venta del ${textoLY}` }] : []),
    { titulo: "Var % contra meta", valor: signo(varMeta), clase: colorVar(varMeta), grafico: <BarraVariacion v={varMeta} />,
      contexto: metaPer ? <>Meta {etiqueta}: {soles(metaPer)}{notaParcial}</> : datos.sinMeta ?? "Sin meta para este periodo." },
    { titulo: acumulado ? `Nivel de cumplimiento ${anio}` : `Cumplimiento ${etiqueta}`, valor: metaNivel ? porcentaje(nivel) : "—",
      clase: acumulado ? "" : estNivel?.tinta,
      grafico: metaNivel ? <Medidor c={nivel} marca={esperado} color={colorNivel} /> : null,
      contexto: metaNivel
        ? <>{acumulado && <>A hoy debías ir en {porcentaje(esperado)} · </>}Meta {millones(metaNivel)} · faltan {millones(Math.max(metaNivel - RC.venta, 0))}
            {estNivel && <span className={`ml-1.5 rounded px-1.5 py-0.5 font-medium ${estNivel.fondo} ${estNivel.tinta}`}>{estNivel.texto}</span>}</>
        : datos.sinMeta ?? "Sin meta para este periodo." },
  ];

  return (
    <div className="grid gap-8">
      <AvisoCargando activo={cargando} />

      <section className="grid gap-3" aria-labelledby="re-conclusion">
        <h2 id="re-conclusion" className="text-xl font-normal text-[var(--tenue)] text-balance">
          {vacio ? <>Sin ventas en {dato(etiqueta)} con estos filtros.</>
            : <>La venta de {dato(etiqueta)} {partes.length ? partes.map((x, i) => <span key={i}>{i ? " y " : ""}{x}</span>) : <>suma {dato(soles(RC.venta))}</>}.</>}
        </h2>
        <div className="grid gap-5 rounded-xl border border-[var(--linea)] bg-[var(--superficie)] p-4 @4xl:grid-cols-[minmax(200px,0.8fr)_2.6fr] @4xl:gap-6 @4xl:px-5">
          <div className="grid content-center gap-1">
            <p className="text-[13px] text-[var(--tenue)]">Venta {etiqueta}</p>
            <p key={RC.venta} className="cifra num text-[28px] @5xl:text-[30px] font-semibold leading-tight tracking-[-0.02em]">{soles(RC.venta)}</p>
            <p className="text-xs text-[var(--tenue)]">{entero(RC.und)} unidades</p>
          </div>
          <dl className={`grid gap-5 @2xl:gap-0 ${stats.length === 3 ? "@2xl:grid-cols-3" : "@2xl:grid-cols-2"} @2xl:divide-x divide-[var(--linea)]`}>
            {stats.map((k) => (
              <div key={k.titulo} className="grid content-start gap-1.5 @2xl:px-4 @2xl:first:pl-0 @2xl:last:pr-0">
                <dt className="text-[13px] text-[var(--tenue)]">{k.titulo}</dt>
                <dd key={k.valor} className={`cifra num text-[20px] font-semibold leading-tight tracking-[-0.015em] ${k.clase ?? ""}`}>{k.valor}</dd>
                <dd>{k.grafico}</dd>
                <dd className="text-xs leading-relaxed text-[var(--tenue)]">{k.contexto}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {!vacio && filasDim.length > 1 && (
        <Seccion titulo={conMetaDim ? `${config.dims.charAt(0).toUpperCase()}${config.dims.slice(1)} frente a su meta` : `Venta por ${config.dim.toLowerCase()}`}
                 subtitulo={`${etiqueta} · ${filasDim.length} ${config.dims}`}>
          <DimsVsMeta filas={filasDim.slice(0, 15)} conMeta={conMetaDim} filtrable={filtrable} ir={ir} dim={config.dim} contra={hayLY ? contraQue : ""} />
          {filasDim.length > 15 && <p className="text-xs text-[var(--tenue)]">Se muestran las 15 con más venta; la tabla completa está en Detalle.</p>}
        </Seccion>
      )}

      <Seccion titulo={`Mes a mes ${anio}`}
               accion={seleccion.size > 0 && <button type="button" className="boton presionable !h-8 shrink-0" onClick={() => ir({ p: "anio", d1: null, d2: null })}>Ver el año a la fecha</button>}
               subtitulo="Toca un mes para ver toda la página solo con ese mes">
        <GraficoMesAMes anio={anio} seleccion={seleccion}
                            alElegir={(m) => ir({ p: "personalizado", d1: `${anio}-${pad(m)}-01`, d2: finDeMes(`${anio}-${pad(m)}`) })}
                            datos={Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, real: reales[i], meta: metas?.[clave(i + 1)] ?? null,
                                                                          anterior: totLY.get(clave(i + 1))?.venta ?? null }))} />
        <Tabla archivo={`${archivo}_mes_a_mes.xlsx`} hoja="Mes a mes" filas={mesAMes}
               columnas={[{ clave: "mes", titulo: "Mes", tipo: "texto" }, { clave: "und", titulo: "Unidades", tipo: "entero" },
                 { clave: "venta", titulo: "Venta S/", tipo: "soles" }, { clave: "ly", titulo: `${anioAnt} S/`, tipo: "soles" },
                 { clave: "var_ly", titulo: `vs ${anioAnt}`, tipo: "porcentaje" },
                 ...(metas ? [{ clave: "meta", titulo: "Meta S/", tipo: "soles" } as Columna, { clave: "var_meta", titulo: "vs meta", tipo: "porcentaje" } as Columna,
                   { clave: "cumpl", titulo: "Cumplimiento", tipo: "porcentaje" } as Columna] : []),
                 { clave: "acumulado", titulo: "Acumulado S/", tipo: "soles" }, { clave: "var_acum", titulo: `Acum. vs ${anioAnt}`, tipo: "porcentaje" },
                 ...(metas ? [{ clave: "cumpl_acum", titulo: "Cumpl. acumulado", tipo: "porcentaje" } as Columna] : [])]} />
      </Seccion>

      <Seccion titulo={`Productos · ${etiqueta}`} subtitulo={`Venta y mix del periodo; evolución de ${seis.length ? `${nombreMes(seis[0])} a ${nombreMes(seis[seis.length - 1])}` : "—"}`}>
        {vacio ? <p className="text-sm text-[var(--tenue)]">Sin ventas con este periodo y estos filtros.</p> : (
          <Tabla archivo={`${archivo}_por_sku.xlsx`} hoja="Por SKU" alto={560} buscar filas={porSku}
                 columnas={[{ clave: "producto", titulo: "Producto", tipo: "texto" }, { clave: "sku", titulo: "SKU", tipo: "texto" },
                   { clave: "und", titulo: "Unidades", tipo: "entero" }, { clave: "venta", titulo: "Venta S/", tipo: "soles" },
                   { clave: "mix", titulo: "Mix %", tipo: "porcentaje", info: "mix" },
                   ...(hayLY ? [{ clave: "var", titulo: `vs ${cortoQue}`, tipo: "porcentaje" } as Columna] : []),
                   { clave: "principal", titulo: `${config.dim} principal`, tipo: "texto" }, { clave: "principal_pct", titulo: "% del SKU", tipo: "porcentaje" },
                   ...seis.map((m) => ({ clave: `m_${m}`, titulo: nombreMes(m), tipo: "soles" }) as Columna)]}
                 total={{ producto: "TOTAL", und: RC.und, venta: RC.venta, mix: 1, var: hayLY ? RC.venta / RL.venta - 1 : null, ...totalSeis }} />
        )}
      </Seccion>
    </div>
  );
}
