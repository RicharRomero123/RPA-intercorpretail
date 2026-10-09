// Vista del Resumen general: el Excel «Consolidado-all-canales» (VENTAS NEGOCIO) mapeado a la web.
// Por canal y por mes: 2025, real, meta, variación vs 2025, variación vs meta y cumplimiento.
import { CalendarRange, Grid3x3, Layers, Package, Store, TrendingUp } from "lucide-react";
import Link from "next/link";
import { salir } from "@/app/login/actions";
import { GraficoCanales } from "@/components/GraficoCanales";
import { EvolucionCanales } from "@/components/EvolucionCanales";
import { GraficoConsolidado } from "@/components/GraficoConsolidado";
import { BarraVariacion, Medidor } from "@/components/ResumenEjecutivo";
import { Marco, type TipoRetail } from "@/components/Marco";
import { SelectorCanales } from "@/components/SelectorCanales";
import { SelectorMeses } from "@/components/SelectorMeses";
import { Tabla } from "@/components/Tabla";
import { Tarjeta } from "@/components/ui";
import { millones, porcentaje, soles } from "@/lib/formato";
import { leerMeses, nombrarMeses, rangoMeses } from "@/lib/meses";
import { fechaLarga } from "@/lib/periodos";
import { type FilaSku, ProductosTop } from "./productos";

const TOTAL = "CALDERON";
const ORDEN = ["TIENDAS", "RETAIL", "LIMA", "PROVINCIA", "B2B", "RAPPI", "B2C-DESCONTINUADO"];
const RUTA: Record<string, string> = { TIENDAS: "/tiendas", RETAIL: "/retail", RAPPI: "/canales/rappi" };
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const nombre = (c: string) => (c === TOTAL ? "Total del negocio" : c.length <= 3 ? c
  : c.charAt(0) + c.slice(1).toLowerCase().replace("-descontinuado", " (descontinuado)"));
const div = (a: number, b: number) => (b ? a / b : null);
/** Monto en soles redondeado, con su símbolo: «S/ 1,234,567». */
const miles = (x: number | null) => (x === null ? "—" : `S/ ${Math.round(x).toLocaleString("en-US")}`);
const signo = (x: number | null) => (x === null ? "—" : `${x >= 0 ? "+" : ""}${porcentaje(x)}`);
export type Celda = { canal: string; anio: number; mes: number; real: number | null; meta: number | null };
/** Tiendas: meta por tienda y mes (Excel «Metas tiendas») y venta real por tienda y mes del año y el anterior. */
export type DatosTiendas = {
  metas: { mes: number; tienda: string; meta: number }[];
  ventas: { anio: number; mes: number; tienda: string; venta: number }[];
  hasta: string | null;
};

/** Color del cumplimiento: verde ≥ 100%, ámbar 90–99%, rojo < 90%. */
const colorCumpl = (x: number | null) => (x === null ? "text-[var(--tenue)]" : x >= 1 ? "bg-[var(--bueno-suave)] text-[var(--bueno)]"
  : x >= 0.9 ? "bg-[var(--alerta-suave)] text-[var(--alerta)]" : "bg-[var(--critico-suave)] text-[var(--critico)]");
/** Etiqueta del cumplimiento, igual que en el resumen de cada canal. */
const estado = (c: number | null) => (c === null ? null : c >= 1 ? { texto: "En meta", tinta: "text-[var(--bueno)]", fondo: "bg-[var(--bueno-suave)]" }
  : c >= 0.9 ? { texto: "Cerca de la meta", tinta: "text-[var(--alerta)]", fondo: "bg-[var(--alerta-suave)]" }
  : { texto: "Bajo la meta", tinta: "text-[var(--critico)]", fondo: "bg-[var(--critico-suave)]" });
const colorVar = (x: number | null) => (x === null ? "text-[var(--tenue)]" : x >= 0 ? "text-[var(--bueno)]" : "text-[var(--critico)]");

export function vistaConsolidado(celdas: Celda[], carga: { archivo: string; corte: string } | null, tipos: TipoRetail[], usuario: string | undefined,
                                 sp: { [k: string]: string | string[] | undefined }, productos: FilaSku[] = [],
                                 tiendas: DatosTiendas = { metas: [], ventas: [], hasta: null }) {
  if (!celdas.length || !carga?.corte) {
    return <main className="p-8"><h1 className="text-2xl font-bold">Resumen general</h1><p>Todavía no se cargó el consolidado (rpa/consolidado_excel.py).</p></main>;
  }

  const corte = String(carga.corte);
  const anio = Number(corte.slice(0, 4)), mesCorte = Number(corte.slice(5, 7)), diaCorte = Number(corte.slice(8, 10));
  const enCurso = new Date(Date.UTC(anio, mesCorte, 0)).getUTCDate() !== diaCorte;
  const todosCanales = [...new Set(celdas.map((c) => c.canal))].filter((c) => c !== TOTAL)
    .sort((a, b) => (ORDEN.indexOf(a) + 1 || 99) - (ORDEN.indexOf(b) + 1 || 99))
    .filter((c) => celdas.some((x) => x.canal === c && x.anio === anio && (x.real || x.meta)));
  // Canales elegidos arriba (?c=TIENDAS,LIMA), como el filtro de Excel: el total pasa a ser la suma de esos canales.
  const pedidoC = String(Array.isArray(sp.c) ? sp.c[0] : sp.c ?? "").split(",").filter((c) => todosCanales.includes(c));
  const selC = pedidoC.length && pedidoC.length < todosCanales.length ? todosCanales.filter((c) => pedidoC.includes(c)) : null;
  const canales = selC ?? todosCanales;
  const datos = !selC ? celdas : [...celdas.filter((c) => selC.includes(c.canal)),
    ...Object.values(celdas.filter((c) => selC.includes(c.canal)).reduce<Record<string, Celda>>((t, c) => {
      const k = `${c.anio}-${c.mes}`, x = (t[k] ??= { canal: TOTAL, anio: c.anio, mes: c.mes, real: null, meta: null });
      if (c.real !== null) x.real = (x.real ?? 0) + c.real;
      if (c.meta !== null) x.meta = (x.meta ?? 0) + c.meta;
      return t;
    }, {}))];
  const nombreTotal = selC ? (selC.length === 1 ? nombre(selC[0]) : "Total de los canales elegidos") : "Total del negocio";
  /** Página de detalle: la del canal, o la del único canal elegido cuando el total es ese canal. */
  const rutaDe = (c: string) => RUTA[c === TOTAL && selC?.length === 1 ? selC[0] : c];
  const nombreDe = (c: string) => (c === TOTAL ? nombreTotal : nombre(c));
  const val = (canal: string, a: number, mes: number, tipo: "real" | "meta") => datos.find((c) => c.canal === canal && c.anio === a && c.mes === mes)?.[tipo] ?? null;
  /** Suma de una lista de meses (seguidos o no). */
  const sumaEn = (canal: string, a: number, meses: number[], tipo: "real" | "meta") => meses.reduce((s, m) => s + (val(canal, a, m, tipo) ?? 0), 0);
  const suma = (canal: string, a: number, hasta: number, tipo: "real" | "meta", desde = 1) => sumaEn(canal, a, rangoMeses(desde, hasta), tipo);
  // Resúmenes justos: solo meses cerrados (el mes en curso tiene meta y año anterior de mes completo). El mes en curso va aparte.
  const cerr = enCurso ? mesCorte - 1 : mesCorte;
  // Meses elegidos arriba (?m=9, ?m=1-3,9): mandan en toda la página. Sin elegir: los meses cerrados del año.
  const sel = leerMeses(Array.isArray(sp.m) ? sp.m[0] : sp.m, mesCorte);
  const lista = sel ?? rangoMeses(1, cerr);
  const tramo = lista.length ? nombrarMeses(lista, true) : "—";
  const tipoTramo = sel ? (sel.length > 1 ? "elegidos" : "elegido") : "cerrado";
  const mesTxt = `${MESES[mesCorte - 1]} al ${diaCorte}`;

  /** Cifras de un canal: real a la fecha (incluye el mes en curso), cumplimiento y variación con meses cerrados, y el mes en curso aparte. */
  const aLaFecha = (c: string) => {
    const real = sumaEn(c, anio, lista, "real"), meta = sumaEn(c, anio, lista, "meta"), ant = sumaEn(c, anio - 1, lista, "real");
    const realMes = enCurso ? val(c, anio, mesCorte, "real") : null, metaMes = enCurso ? val(c, anio, mesCorte, "meta") : null;
    const realFecha = suma(c, anio, mesCorte, "real"), metaAnio = suma(c, anio, 12, "meta");
    return { canal: nombreDe(c), real, meta, cumpl: div(real, meta), ant, var: div(real, ant) === null ? null : real / ant - 1,
             realMes, metaMes, avanceMes: realMes !== null && metaMes ? realMes / metaMes : null,
             realFecha, metaAnio, avance: div(realFecha, metaAnio), realAnt: suma(c, anio - 1, 12, "real") };
  };
  const T = aLaFecha(TOTAL);
  const porCanal = canales.map(aLaFecha).map((x) => ({ ...x, part: div(x.realFecha, T.realFecha) })).sort((a, b) => b.realFecha - a.realFecha);

  /** Bloque mensual de un canal, igual que en el Excel: filas 2025 / real / meta / variaciones / cumplimiento. */
  const bloque = (c: string) => {
    const meses = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1, real = val(c, anio, m, "real"), meta = val(c, anio, m, "meta"), ant = val(c, anio - 1, m, "real");
      return { mes: m, real, meta, anterior: ant, varAnt: real !== null && ant ? real / ant - 1 : null,
               varMeta: real !== null && meta ? real / meta - 1 : null, cumpl: real !== null && meta ? real / meta : null };
    });
    const x = aLaFecha(c);
    const filas: { titulo: string; celdas: (string | null)[]; fecha: string; anio: string; clase?: (i: number) => string; destacar?: boolean }[] = [
      { titulo: `${anio - 1}`, celdas: meses.map((m) => miles(m.anterior)), fecha: miles(x.ant), anio: miles(x.realAnt) },
      { titulo: `Real ${anio}`, celdas: meses.map((m) => (m.real === null ? "—" : miles(m.real))), fecha: miles(x.real), anio: miles(x.realFecha), destacar: true },
      { titulo: `Meta ${anio}`, celdas: meses.map((m) => miles(m.meta)), fecha: miles(x.meta), anio: miles(x.metaAnio) },
      { titulo: `Var. vs ${anio - 1}`, celdas: meses.map((m) => signo(m.varAnt)), fecha: signo(x.var), anio: "", clase: (i) => colorVar(i < 12 ? meses[i].varAnt : x.var) },
      { titulo: "Var. vs meta", celdas: meses.map((m) => signo(m.varMeta)), fecha: signo(x.cumpl === null ? null : x.cumpl - 1), anio: "",
        clase: (i) => colorVar(i < 12 ? meses[i].varMeta : x.cumpl === null ? null : x.cumpl - 1) },
      { titulo: "Cumplimiento", celdas: meses.map((m) => (m.cumpl === null ? "—" : porcentaje(m.cumpl))), fecha: x.cumpl === null ? "—" : porcentaje(x.cumpl),
        anio: x.avance === null ? "—" : `${porcentaje(x.avance)} de la meta`, clase: (i) => `rounded ${colorCumpl(i < 12 ? meses[i].cumpl : x.cumpl)}` },
    ];
    return (
      <div className="grid gap-4">
        <div className="grid gap-3 grid-cols-2 @3xl:grid-cols-5 text-sm">
          {[["Real a la fecha", soles(x.realFecha)], [`Cumplimiento ${tramo}`, x.cumpl === null ? "—" : porcentaje(x.cumpl)],
            [`vs ${anio - 1} (${tramo})`, signo(x.var)], ...(enCurso ? [[`${mesTxt} vs su meta`, x.avanceMes === null ? "—" : porcentaje(x.avanceMes)]] : []),
            [`Avance de la meta ${anio}`, x.avance === null ? "—" : porcentaje(x.avance)]].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-[var(--linea)] bg-[var(--superficie)] px-3 py-2">
              <span className="block text-[11px] text-[var(--tenue)]">{k}</span><b className="num text-base">{v}</b>
            </div>
          ))}
        </div>
        <GraficoConsolidado meses={meses} anio={anio} mesCorte={enCurso ? mesCorte : 0} diaCorte={diaCorte} />
        <div className="overflow-x-auto rounded-lg border border-[var(--linea)]">
          <table className="datos text-[12.5px]">
            <thead>
              <tr>
                <th>{nombreDe(c)}</th>
                {MESES.map((m, i) => <th key={m} className="n">{m}{i + 1 === mesCorte && enCurso ? ` (al ${diaCorte})` : ""}</th>)}
                <th className="n !bg-[var(--acento-suave)]">{tramo.charAt(0).toUpperCase() + tramo.slice(1)} ({tipoTramo})</th>
                <th className="n">Año {anio - 1} · a la fecha · meta</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.titulo} className={f.destacar ? "font-semibold" : ""}>
                  <td className="whitespace-nowrap">{f.titulo}</td>
                  {f.celdas.map((v, i) => (
                    <td key={i} className={`n !px-1.5 ${i + 1 > mesCorte && f.titulo.startsWith("Real") ? "text-[var(--tenue)]" : ""}`}>
                      <span className={`block px-1.5 py-0.5 num ${f.clase ? f.clase(i) : ""}`}>{v}</span>
                    </td>
                  ))}
                  <td className="n !px-1.5 !bg-[var(--acento-suave)]"><span className={`block px-1.5 py-0.5 num font-semibold ${f.clase ? f.clase(12) : ""}`}>{f.fecha}</span></td>
                  <td className="n !px-1.5"><span className="block px-1.5 py-0.5 num">{f.anio}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[var(--tenue)]">
          La columna «{tramo} ({tipoTramo})» suma {sel ? "los meses elegidos arriba" : "solo meses cerrados para comparar parejo"}.{enCurso && <> {MESES[mesCorte - 1]} va al {diaCorte}: su meta y su {anio - 1} son
          del mes completo, por eso su cumplimiento sube hasta el cierre.</>} Última columna: {anio - 1} completo · real {anio} a la fecha · meta {anio} del año.
        </p>
        {rutaDe(c) && <Link href={rutaDe(c)!} className="text-sm font-medium text-[var(--acento)] hover:underline w-fit">Ver el detalle de {nombreDe(c)} →</Link>}
      </div>
    );
  };

  /** Tiendas: cada tienda contra su meta (Excel «Metas tiendas»), con la venta real de la base al último día cargado. */
  const seccionTiendas = (() => {
    if (!tiendas.metas.length || !tiendas.hasta || (selC && !selC.includes("TIENDAS"))) return null;
    const hastaT = tiendas.hasta, mesT = Number(hastaT.slice(5, 7)), diaT = Number(hastaT.slice(8, 10));
    const enCursoT = new Date(Date.UTC(anio, mesT, 0)).getUTCDate() !== diaT;
    const listaT = sel ? sel.filter((m) => m <= mesT) : rangoMeses(1, enCursoT ? mesT - 1 : mesT);
    const tramoT = listaT.length ? nombrarMeses(listaT, true) : "—";
    const mesTxtT = `${MESES[mesT - 1]} al ${diaT}`;
    const metaDe = (t: string, m: number) => tiendas.metas.find((x) => x.tienda === t && x.mes === m)?.meta ?? null;
    const realDe = (t: string, a: number, m: number) => tiendas.ventas.find((x) => x.tienda === t && x.anio === a && x.mes === m)?.venta ?? null;
    const sumaT = (f: (m: number) => number | null, meses: number[]) => meses.reduce((a, m) => a + (f(m) ?? 0), 0);
    const nombres = [...new Set(tiendas.metas.map((x) => x.tienda))];
    const filas = nombres.map((t) => {
      const real = sumaT((m) => realDe(t, anio, m), listaT), meta = sumaT((m) => metaDe(t, m), listaT), ant = sumaT((m) => realDe(t, anio - 1, m), listaT);
      const realMes = enCursoT ? realDe(t, anio, mesT) ?? 0 : null, metaMes = enCursoT ? metaDe(t, mesT) : null;
      const realFecha = sumaT((m) => realDe(t, anio, m), rangoMeses(1, mesT)), metaAnio = sumaT((m) => metaDe(t, m), rangoMeses(1, 12));
      return { tienda: t, real, meta, cumpl: div(real, meta), ant, var: ant ? real / ant - 1 : null, realMes, metaMes,
               avanceMes: realMes !== null && metaMes ? realMes / metaMes : null, realFecha, metaAnio, avance: div(realFecha, metaAnio) };
    }).sort((a, b) => b.metaAnio - a.metaAnio);
    const tot = filas.reduce((a, x) => ({ real: a.real + x.real, meta: a.meta + x.meta, ant: a.ant + x.ant, realMes: a.realMes + (x.realMes ?? 0),
      metaMes: a.metaMes + (x.metaMes ?? 0), realFecha: a.realFecha + x.realFecha, metaAnio: a.metaAnio + x.metaAnio }),
      { real: 0, meta: 0, ant: 0, realMes: 0, metaMes: 0, realFecha: 0, metaAnio: 0 });
    const meses = Array.from({ length: mesT }, (_, i) => i + 1);
    const cumplDe = (r: number | null, mt: number | null) => (r !== null && mt ? r / mt : null);
    const celda = (k: string | number, r: number | null, mt: number | null, m: number) => (
      <td key={k} className="n !p-1">
        <span className={`block rounded px-2 py-1 num text-center ${m === mesT && enCursoT ? "opacity-60" : ""} ${colorCumpl(cumplDe(r, mt))}`}
              title={`real ${r === null ? "—" : soles(r)} · meta ${mt === null ? "—" : soles(mt)}`}>
          {cumplDe(r, mt) === null ? "—" : porcentaje(cumplDe(r, mt)!)}
        </span>
      </td>
    );
    return (
      <Tarjeta icono={Store} titulo="Tiendas: real vs meta de cada tienda"
               subtitulo={`Meta de cada tienda (Excel «Metas tiendas ${anio}») · venta real del Power BI al ${fechaLarga(hastaT)} · ${sel ? "meses elegidos" : "meses cerrados"}: ${tramoT}${enCursoT ? ` · ${mesTxtT} aparte` : ""}`}>
        <Tabla archivo={`resumen_general_tiendas_${hastaT}.xlsx`} hoja="Tiendas" filas={filas}
               columnas={[{ clave: "tienda", titulo: "Tienda", tipo: "texto" }, { clave: "real", titulo: `Real ${tramoT} S/`, tipo: "soles" },
                 { clave: "meta", titulo: `Meta ${tramoT} S/`, tipo: "soles" }, { clave: "cumpl", titulo: "Cumplimiento", tipo: "porcentaje" },
                 { clave: "var", titulo: `Var. vs ${anio - 1}`, tipo: "porcentaje" },
                 ...(enCursoT ? [{ clave: "realMes", titulo: `${mesTxtT} S/`, tipo: "soles" } as const, { clave: "metaMes", titulo: `Meta ${MESES[mesT - 1]} S/`, tipo: "soles" } as const,
                   { clave: "avanceMes", titulo: `${MESES[mesT - 1]} vs meta`, tipo: "porcentaje" } as const] : []),
                 { clave: "metaAnio", titulo: `Meta año ${anio} S/`, tipo: "soles" }, { clave: "avance", titulo: "Avance anual", tipo: "porcentaje" }]}
               total={{ ...tot, tienda: "TOTAL", cumpl: div(tot.real, tot.meta), var: tot.ant ? tot.real / tot.ant - 1 : null,
                        avanceMes: enCursoT && tot.metaMes ? tot.realMes / tot.metaMes : null, avance: div(tot.realFecha, tot.metaAnio) }} />
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold">Cumplimiento de cada tienda, mes a mes</h3>
          <div className="overflow-x-auto rounded-lg border border-[var(--linea)]">
            <table className="datos">
              <thead>
                <tr>
                  <th>Tienda</th>
                  {meses.map((m) => <th key={m} className="n">{MESES[m - 1]}{m === mesT && enCursoT ? ` (al ${diaT})` : ""}</th>)}
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.tienda}>
                    <td><Link href={`/tiendas/contanet?tienda=${encodeURIComponent(f.tienda)}`} className="hover:underline">{f.tienda}</Link></td>
                    {meses.map((m) => celda(m, realDe(f.tienda, anio, m), metaDe(f.tienda, m), m))}
                  </tr>
                ))}
                <tr className="total">
                  <td>TOTAL</td>
                  {meses.map((m) => celda(m, nombres.reduce((a, t) => a + (realDe(t, anio, m) ?? 0), 0), nombres.reduce((a, t) => a + (metaDe(t, m) ?? 0), 0), m))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-[var(--tenue)]">
            Real ÷ meta de cada mes · verde ≥ 100% · ámbar 90–99% · rojo &lt; 90%. Pasa el cursor para ver real y meta; toca una tienda para ver su detalle.
            La venta real es la del Power BI de tiendas (ContaNet va aparte y solo se compara en Tiendas → Power BI vs ContaNet).
          </p>
        </div>
      </Tarjeta>
    );
  })();

  const productosV = selC ? productos.filter((f) => selC.includes(f.canal)) : productos;
  const semaforo = [...canales, TOTAL].map((c) => ({ canal: c, celdas: Array.from({ length: mesCorte }, (_, i) => {
    const r = val(c, anio, i + 1, "real"), mt = val(c, anio, i + 1, "meta");
    return { mes: i + 1, r, cumpl: r !== null && mt ? r / mt : null };
  }) }));

  const encabezado = (
    <header className="grid gap-1">
      <p className="etiqueta">{selC ? selC.map(nombre).join(" · ") : "Todos los canales"} · Turrones Calderón</p>
      <h1 className="text-[28px] font-bold leading-tight">Resumen general {anio}</h1>
      <p className="text-sm text-[var(--tenue)] max-w-4xl">
        Venta <b className="text-[var(--tinta)]">real</b> de cada canal frente a su <b className="text-[var(--tinta)]">meta</b> y frente a {anio - 1}, con
        cierre al <b className="text-[var(--tinta)]">{fechaLarga(corte)}</b>. Fuente: «{carga.archivo}»{tiendas.hasta && <>; Tiendas, del Power BI al <b className="text-[var(--tinta)]">{fechaLarga(tiendas.hasta)}</b></>}.
      </p>
    </header>
  );

  const contenido = (
    <>
      {/* 1. Total del negocio en los meses elegidos (por defecto, los cerrados): real, var. vs año pasado, var. vs meta y cumplimiento */}
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SelectorMeses key={`meses-${sp.m ?? ""}`} elegidos={sel} hasta={mesCorte} cerrados={cerr} enCurso={enCurso ? `al ${diaCorte}` : null} />
          <SelectorCanales key={`canales-${sp.c ?? ""}`} opciones={todosCanales.map((c) => ({ clave: c, nombre: nombre(c) }))} elegidos={selC} />
          <span className="text-xs text-[var(--tenue)]">Estos filtros cambian toda la página</span>
        </div>
        {(() => {
          const nombre = tramo;
          const parcial = enCurso && lista.includes(mesCorte);
          const real = sumaEn(TOTAL, anio, lista, "real"), meta = sumaEn(TOTAL, anio, lista, "meta"), ant = sumaEn(TOTAL, anio - 1, lista, "real");
          const etiqueta = `${nombre}${parcial ? ` (${MESES[mesCorte - 1].toLowerCase()} al ${diaCorte})` : sel ? "" : " cerrado"}`;
          const nota = parcial ? ` · ${MESES[mesCorte - 1]} va al ${diaCorte}: su meta y ${anio - 1} son del mes completo` : "";
          // Mismo diseño que el resumen de cada canal: la venta grande y tres cifras con color (verde bien, rojo mal) y su barra.
          const vAnt = ant ? real / ant - 1 : null, vMeta = meta ? real / meta - 1 : null;
          const diasMes = new Date(Date.UTC(anio, mesCorte, 0)).getUTCDate();
          // Sin meses elegidos: lo vendido en el año ÷ meta del año; la raya marca dónde deberías ir hoy. Con meses elegidos: esos meses ÷ su meta.
          const metaHoy = suma(TOTAL, anio, mesCorte - 1, "meta") + (val(TOTAL, anio, mesCorte, "meta") ?? 0) * (diaCorte / diasMes);
          const [r, mt] = sel ? [real, meta] : [T.realFecha, T.metaAnio];
          const nivel = mt ? r / mt : null, esperado = !sel && mt ? metaHoy / mt : 1;
          const est = estado(sel ? nivel : metaHoy ? T.realFecha / metaHoy : null);
          const stats = [
            { titulo: `Var % ${anio} vs ${anio - 1}`, valor: vAnt === null ? "—" : `${vAnt >= 0 ? "▲" : "▼"} ${signo(vAnt)}`, clase: colorVar(vAnt),
              grafico: <BarraVariacion v={vAnt} />, contexto: <>{etiqueta} · {anio - 1}: {soles(ant)}{nota}</> },
            { titulo: `Var % ${anio} vs meta`, valor: vMeta === null ? "—" : `${vMeta >= 0 ? "▲" : "▼"} ${signo(vMeta)}`, clase: colorVar(vMeta),
              grafico: <BarraVariacion v={vMeta} />, contexto: <>{etiqueta} · meta {soles(meta)}{nota}</> },
            { titulo: sel ? `Cumplimiento ${nombre}` : `Nivel de cumplimiento ${anio}`, valor: nivel === null ? "—" : porcentaje(nivel), clase: sel ? est?.tinta : "",
              grafico: mt ? <Medidor c={nivel} marca={esperado} color={sel ? (nivel !== null && nivel >= 1 ? "var(--bueno)" : nivel !== null && nivel >= 0.9 ? "var(--alerta)" : "var(--critico)") : "var(--serie-1)"} /> : null,
              contexto: <>{!sel && <>A hoy debías ir en {porcentaje(esperado)} · </>}Meta {sel ? nombre : "anual"} {millones(mt)} · faltan {millones(Math.max(mt - r, 0))}
                {est && <span className={`ml-1.5 rounded px-1.5 py-0.5 font-medium ${est.fondo} ${est.tinta}`}>{est.texto}</span>}</> },
          ];
          return (
            <div className="grid gap-5 rounded-xl border border-[var(--linea)] bg-[var(--superficie)] p-4 @4xl:grid-cols-[minmax(200px,0.8fr)_2.6fr] @4xl:gap-6 @4xl:px-5">
              <div className="grid content-center gap-1">
                <p className="text-[13px] text-[var(--tenue)]">Real {anio} · {nombreTotal.toLowerCase()}</p>
                <p key={real} className="cifra num text-[28px] @5xl:text-[30px] font-semibold leading-tight tracking-[-0.02em]">{soles(real)}</p>
                <p className="text-xs text-[var(--tenue)]">{etiqueta}</p>
              </div>
              <dl className="grid gap-5 @2xl:gap-0 @2xl:grid-cols-3 @2xl:divide-x divide-[var(--linea)]">
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
          );
        })()}
      </div>

      {/* 2. Mes a mes: el total del negocio (primera pestaña) y cada canal, como el Excel */}
      {/* Un solo bloque: el canal o la suma de los canales elegidos arriba (el filtro de Canales reemplaza a las pestañas). */}
      <Tarjeta icono={CalendarRange} titulo={`Mes a mes: ${nombreTotal.charAt(0).toLowerCase() + nombreTotal.slice(1)}`}
               subtitulo={`Como en el Excel: ${anio - 1}, real, meta, variaciones y cumplimiento de cada mes · para ver un canal, elígelo en «Canales» arriba`}>
        {bloque(TOTAL)}
      </Tarjeta>

      {/* 2b. Evolución de cada canal en curvas */}
      {canales.length > 0 && (
        <Tarjeta icono={TrendingUp} titulo={selC?.length === 1 ? `Evolución mes a mes: ${nombre(selC[0])}` : "Evolución mes a mes por canal"}
                 subtitulo={`Venta real ${anio} ${selC?.length === 1 ? "del canal" : "de cada canal"}, con su meta y ${anio - 1}`}>
          <EvolucionCanales filtrado={!!selC} mesCorte={mesCorte} parcial={enCurso ? `al ${diaCorte}` : null}
                            series={canales.map((c) => {
                              // Unidades: del detalle por producto (solo los canales que lo traen; el consolidado solo tiene soles).
                              const conUnidades = productos.some((f) => f.canal === c);
                              return { canal: c, nombre: nombre(c), conUnidades, meses: rangoMeses(1, mesCorte).map((m) => ({
                                mes: m, real: val(c, anio, m, "real"), meta: val(c, anio, m, "meta"), ant: val(c, anio - 1, m, "real"),
                                und: conUnidades ? productos.filter((f) => f.canal === c && f.mes === m).reduce((a, f) => a + f.und, 0) || null : null })) };
                            })} />
        </Tarjeta>
      )}

      {/* 3. Análisis por canal: cumplimiento y crecimiento de cada uno */}
      <Tarjeta icono={Layers} titulo="Análisis por canal" subtitulo={`Meses cerrados (${tramo}): real vs meta y vs ${anio - 1}${enCurso ? ` · ${mesTxt} aparte` : ""} · año: avance de la meta`}>
        <GraficoCanales tramo={tramo} anioAnt={anio - 1}
                        datos={[...porCanal, { ...T, canal: "Total" }].map((x) => ({ canal: x.canal, cumpl: x.cumpl, var: x.var, real: x.real, meta: x.meta, ant: x.ant }))} />
        <Tabla archivo={`resumen_general_canales_${corte}.xlsx`} hoja="Canales" filas={porCanal}
               columnas={[{ clave: "canal", titulo: "Canal", tipo: "texto" }, { clave: "real", titulo: `Real ${tramo} S/`, tipo: "soles" },
                 { clave: "meta", titulo: `Meta ${tramo} S/`, tipo: "soles" }, { clave: "cumpl", titulo: "Cumplimiento", tipo: "porcentaje" },
                 { clave: "ant", titulo: `${anio - 1} ${tramo} S/`, tipo: "soles" }, { clave: "var", titulo: `Var. vs ${anio - 1}`, tipo: "porcentaje" },
                 ...(enCurso ? [{ clave: "realMes", titulo: `${mesTxt} S/`, tipo: "soles" } as const, { clave: "avanceMes", titulo: `${MESES[mesCorte - 1]} vs meta`, tipo: "porcentaje" } as const] : []),
                 { clave: "metaAnio", titulo: `Meta año ${anio} S/`, tipo: "soles" }, { clave: "avance", titulo: "Avance anual", tipo: "porcentaje" },
                 { clave: "part", titulo: "% del total", tipo: "porcentaje" }]}
               total={{ ...T, canal: "TOTAL", part: 1 }} />
      </Tarjeta>

      {/* 3b. Tiendas: real vs meta de cada tienda */}
      {seccionTiendas}

      {/* 4. Productos más vendidos entre todos los canales */}
      {productosV.length > 0 && (
        <Tarjeta icono={Package} titulo={`Productos más vendidos: ${selC ? selC.map(nombre).join(", ") : "todos los canales"}`}
                 subtitulo={`Unidades de cada SKU por mes, ${sel ? tramo : `ene–${MESES[mesCorte - 1].toLowerCase()}`} ${anio}, sumando los canales con detalle por producto`}>
          <ProductosTop filas={productosV} canales={selC ?? undefined} nombreTotal={nombreTotal} meses={sel ?? rangoMeses(1, mesCorte)} periodo={sel ? tramo : nombrarMeses(rangoMeses(1, mesCorte), true)} archivo={corte}
                        etiquetaMes={(m) => `${MESES[m - 1]}${m === mesCorte && enCurso ? ` (al ${diaCorte})` : ""}`}
                        totalNegocio={sel ? sumaEn(TOTAL, anio, sel, "real") : T.realFecha}
                        sinDetalle={canales.filter((c) => c === "B2B" || c === "RAPPI")
                          .map((c) => ({ canal: nombre(c), monto: sel ? sumaEn(c, anio, sel, "real") : suma(c, anio, mesCorte, "real") })).filter((x) => x.monto)} />
        </Tarjeta>
      )}

      {/* 5. Semáforo */}
      <Tarjeta icono={Grid3x3} titulo="Semáforo de cumplimiento de meta" subtitulo="Real ÷ meta de cada mes · verde ≥ 100% · ámbar 90–99% · rojo < 90%">
        <div className="overflow-x-auto rounded-lg border border-[var(--linea)]">
          <table className="datos">
            <thead>
              <tr>
                <th>Canal</th>
                {semaforo[0].celdas.map((c) => <th key={c.mes} className="n">{MESES[c.mes - 1]}{c.mes === mesCorte && enCurso ? ` (al ${diaCorte})` : ""}</th>)}
              </tr>
            </thead>
            <tbody>
              {semaforo.map((f) => (
                <tr key={f.canal} className={f.canal === TOTAL ? "total" : ""}>
                  <td>{f.canal === TOTAL ? "TOTAL" : nombre(f.canal)}</td>
                  {f.celdas.map((c) => (
                    <td key={c.mes} className="n !p-1">
                      <span className={`block rounded px-2 py-1 num text-center ${c.mes === mesCorte && enCurso ? "opacity-60" : ""} ${sel && !sel.includes(c.mes) ? "opacity-30" : ""} ${colorCumpl(c.cumpl)}`}
                            title={c.r === null ? "sin dato" : `real ${soles(c.r)}`}>{c.cumpl === null ? "—" : porcentaje(c.cumpl)}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </>
  );

  return (
    <Marco seccion={sp.s} ubicacion="consolidado" tiposRetail={tipos} encabezado={encabezado} usuario={usuario} salir={salir} datosAl={fechaLarga(corte)}
           secciones={[{ id: "ventas", titulo: "Resumen general", contenido }]} />
  );
}
