// Vista del Resumen general: el Excel «Consolidado-all-canales» (VENTAS NEGOCIO) mapeado a la web.
// Por canal y por mes: 2025, real, meta, variación vs 2025, variación vs meta y cumplimiento.
import { CalendarRange, Grid3x3, Layers, Package, Store } from "lucide-react";
import Link from "next/link";
import { salir } from "@/app/login/actions";
import { GraficoCanales } from "@/components/GraficoCanales";
import { GraficoConsolidado } from "@/components/GraficoConsolidado";
import { Indicador } from "@/components/Graficos";
import { Marco, type TipoRetail } from "@/components/Marco";
import { Pestanas } from "@/components/Pestanas";
import { Tabla } from "@/components/Tabla";
import { Tarjeta } from "@/components/ui";
import { millones, porcentaje, soles } from "@/lib/formato";
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
  const val = (canal: string, a: number, mes: number, tipo: "real" | "meta") => celdas.find((c) => c.canal === canal && c.anio === a && c.mes === mes)?.[tipo] ?? null;
  const suma = (canal: string, a: number, hasta: number, tipo: "real" | "meta", desde = 1) => {
    let s = 0;
    for (let m = desde; m <= hasta; m++) s += val(canal, a, m, tipo) ?? 0;
    return s;
  };
  const canales = [...new Set(celdas.map((c) => c.canal))].filter((c) => c !== TOTAL)
    .sort((a, b) => (ORDEN.indexOf(a) + 1 || 99) - (ORDEN.indexOf(b) + 1 || 99))
    .filter((c) => suma(c, anio, 12, "real") || suma(c, anio, 12, "meta"));
  // Resúmenes justos: solo meses cerrados (el mes en curso tiene meta y año anterior de mes completo). El mes en curso va aparte.
  const cerr = enCurso ? mesCorte - 1 : mesCorte;
  const tramo = cerr ? `ene–${MESES[cerr - 1].toLowerCase()}` : "—";
  const mesTxt = `${MESES[mesCorte - 1]} al ${diaCorte}`;

  /** Cifras de un canal: real a la fecha (incluye el mes en curso), cumplimiento y variación con meses cerrados, y el mes en curso aparte. */
  const aLaFecha = (c: string) => {
    const real = suma(c, anio, cerr, "real"), meta = suma(c, anio, cerr, "meta"), ant = suma(c, anio - 1, cerr, "real");
    const realMes = enCurso ? val(c, anio, mesCorte, "real") : null, metaMes = enCurso ? val(c, anio, mesCorte, "meta") : null;
    const realFecha = suma(c, anio, mesCorte, "real"), metaAnio = suma(c, anio, 12, "meta");
    return { canal: nombre(c), real, meta, cumpl: div(real, meta), ant, var: div(real, ant) === null ? null : real / ant - 1,
             realMes, metaMes, avanceMes: realMes !== null && metaMes ? realMes / metaMes : null,
             realFecha, metaAnio, avance: div(realFecha, metaAnio), realAnt: suma(c, anio - 1, 12, "real") };
  };
  const T = aLaFecha(TOTAL);
  // Filtro de meses de las 4 tarjetas: un mes («m=8») o un rango («m=3-6»). Sin filtro: los meses cerrados.
  const pedido = String(Array.isArray(sp.m) ? sp.m[0] : sp.m ?? "").split("-").map(Number);
  const valido = (x: number) => Number.isInteger(x) && x >= 1 && x <= mesCorte;
  const sel: [number, number] | null = pedido.length && pedido.every(valido)
    ? [Math.min(...pedido), Math.max(...pedido)] : null;
  /** Enlace de cada mes: con un mes ya marcado, el segundo clic arma el rango entre los dos; si no, marca solo ese mes. */
  const enlaceMes = (m: number | null) => {
    const q = new URLSearchParams();
    if (typeof sp.s === "string") q.set("s", sp.s);
    let r: [number, number] | null = m ? [m, m] : null;
    if (m && sel && sel[0] === sel[1]) r = m === sel[0] ? null : [Math.min(m, sel[0]), Math.max(m, sel[0])];
    if (r) q.set("m", r[0] === r[1] ? String(r[0]) : `${r[0]}-${r[1]}`);
    return `?${q.toString()}`;
  };
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
                <th>{nombre(c)}</th>
                {MESES.map((m, i) => <th key={m} className="n">{m}{i + 1 === mesCorte && enCurso ? ` (al ${diaCorte})` : ""}</th>)}
                <th className="n !bg-[var(--acento-suave)]">{tramo.charAt(0).toUpperCase() + tramo.slice(1)} (cerrado)</th>
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
          La columna «{tramo} (cerrado)» suma solo meses cerrados para comparar parejo.{enCurso && <> {MESES[mesCorte - 1]} va al {diaCorte}: su meta y su {anio - 1} son
          del mes completo, por eso su cumplimiento sube hasta el cierre.</>} Última columna: {anio - 1} completo · real {anio} a la fecha · meta {anio} del año.
        </p>
        {RUTA[c] && <Link href={RUTA[c]} className="text-sm font-medium text-[var(--acento)] hover:underline w-fit">Ver el detalle de {nombre(c)} →</Link>}
      </div>
    );
  };

  /** Tiendas: cada tienda contra su meta (Excel «Metas tiendas»), con la venta real de la base al último día cargado. */
  const seccionTiendas = (() => {
    if (!tiendas.metas.length || !tiendas.hasta) return null;
    const hastaT = tiendas.hasta, mesT = Number(hastaT.slice(5, 7)), diaT = Number(hastaT.slice(8, 10));
    const enCursoT = new Date(Date.UTC(anio, mesT, 0)).getUTCDate() !== diaT;
    const cerrT = enCursoT ? mesT - 1 : mesT;
    const tramoT = cerrT ? `ene–${MESES[cerrT - 1].toLowerCase()}` : "—";
    const mesTxtT = `${MESES[mesT - 1]} al ${diaT}`;
    const metaDe = (t: string, m: number) => tiendas.metas.find((x) => x.tienda === t && x.mes === m)?.meta ?? null;
    const realDe = (t: string, a: number, m: number) => tiendas.ventas.find((x) => x.tienda === t && x.anio === a && x.mes === m)?.venta ?? null;
    const sumaT = (f: (m: number) => number | null, hasta: number) => Array.from({ length: hasta }, (_, i) => f(i + 1) ?? 0).reduce((a, x) => a + x, 0);
    const nombres = [...new Set(tiendas.metas.map((x) => x.tienda))];
    const filas = nombres.map((t) => {
      const real = sumaT((m) => realDe(t, anio, m), cerrT), meta = sumaT((m) => metaDe(t, m), cerrT), ant = sumaT((m) => realDe(t, anio - 1, m), cerrT);
      const realMes = enCursoT ? realDe(t, anio, mesT) ?? 0 : null, metaMes = enCursoT ? metaDe(t, mesT) : null;
      const realFecha = sumaT((m) => realDe(t, anio, m), mesT), metaAnio = sumaT((m) => metaDe(t, m), 12);
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
               subtitulo={`Meta de cada tienda (Excel «Metas tiendas ${anio}») · venta real del Power BI al ${fechaLarga(hastaT)} · meses cerrados: ${tramoT}${enCursoT ? ` · ${mesTxtT} aparte` : ""}`}>
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

  const semaforo = [...canales, TOTAL].map((c) => ({ canal: c, celdas: Array.from({ length: mesCorte }, (_, i) => {
    const r = val(c, anio, i + 1, "real"), mt = val(c, anio, i + 1, "meta");
    return { mes: i + 1, r, cumpl: r !== null && mt ? r / mt : null };
  }) }));

  const encabezado = (
    <header className="grid gap-1">
      <p className="etiqueta">Todos los canales · Turrones Calderón</p>
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
          <nav className="segmento w-fit max-w-full overflow-x-auto" aria-label="Meses de los indicadores">
            <Link href={enlaceMes(null)} aria-current={sel === null}>Acumulado {tramo}</Link>
            {Array.from({ length: mesCorte }, (_, i) => i + 1).map((m) => (
              <Link key={m} href={enlaceMes(m)} aria-current={sel !== null && m >= sel[0] && m <= sel[1]}>
                {MESES[m - 1]}{m === mesCorte && enCurso ? ` (al ${diaCorte})` : ""}
              </Link>
            ))}
          </nav>
          <span className="text-xs text-[var(--tenue)]">Un clic: un mes · otro clic en otro mes: el rango entre los dos</span>
        </div>
        {(() => {
          const [a, b] = sel ?? [1, cerr];
          const nombre = a === b ? MESES[a - 1].toLowerCase() : `${MESES[a - 1].toLowerCase()}–${MESES[b - 1].toLowerCase()}`;
          const parcial = enCurso && b === mesCorte;
          const real = suma(TOTAL, anio, b, "real", a), meta = suma(TOTAL, anio, b, "meta", a), ant = suma(TOTAL, anio - 1, b, "real", a);
          const etiqueta = `${nombre}${parcial ? ` (${MESES[b - 1].toLowerCase()} al ${diaCorte})` : sel ? "" : " cerrado"}`;
          const nota = parcial ? ` · ${MESES[b - 1]} va al ${diaCorte}: su meta y ${anio - 1} son del mes completo` : "";
          return (
            <div className="grid gap-4 grid-cols-1 @lg:grid-cols-2 @5xl:grid-cols-4">
              <Indicador icono="venta" titulo={`Real ${anio}`} valor={soles(real)} detalle={etiqueta} />
              <Indicador icono="ingreso" titulo={`Var % ${anio} vs ${anio - 1}`} valor={signo(ant ? real / ant - 1 : null)}
                         detalle={`${etiqueta} · ${anio - 1}: ${soles(ant)}${nota}`} />
              <Indicador icono="rotacion" titulo={`Var % ${anio} vs meta`} valor={signo(meta ? real / meta - 1 : null)}
                         detalle={`${etiqueta} · meta ${soles(meta)}${nota}`} />
              {/* Sin meses elegidos: lo vendido en el año ÷ meta de todo el año. Con meses elegidos: esos meses ÷ su meta. */}
              {(() => {
                const [r, mt, txt] = sel ? [real, meta, `meta ${nombre}`] : [T.realFecha, T.metaAnio, "meta anual"];
                return (
                  <Indicador icono="cobertura" titulo={sel ? `Cumplimiento ${nombre}` : `Nivel de cumplimiento ${anio}`} valor={mt ? porcentaje(r / mt) : "—"}
                             detalle={`de ${millones(mt)} de ${txt} · faltan ${millones(Math.max(mt - r, 0))}`} />
                );
              })()}
            </div>
          );
        })()}
      </div>

      {/* 2. Mes a mes: el total del negocio (primera pestaña) y cada canal, como el Excel */}
      <Tarjeta icono={CalendarRange} titulo="Mes a mes: total del negocio y por canal" subtitulo={`Como en el Excel: ${anio - 1}, real, meta, variaciones y cumplimiento de cada mes`}>
        <Pestanas pestanas={[TOTAL, ...canales].map((c) => ({ id: c, titulo: c === TOTAL ? "Total" : nombre(c), contenido: bloque(c) }))} />
      </Tarjeta>

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
      {productos.length > 0 && (
        <Tarjeta icono={Package} titulo="Productos más vendidos: todos los canales"
                 subtitulo={`Unidades de cada SKU por mes, ene–${MESES[mesCorte - 1].toLowerCase()} ${anio}, sumando los canales con detalle por producto`}>
          <ProductosTop filas={productos} mesCorte={mesCorte} archivo={corte}
                        etiquetaMes={(m) => `${MESES[m - 1]}${m === mesCorte && enCurso ? ` (al ${diaCorte})` : ""}`}
                        totalNegocio={T.realFecha}
                        sinDetalle={canales.filter((c) => c === "B2B" || c === "RAPPI")
                          .map((c) => ({ canal: nombre(c), monto: suma(c, anio, mesCorte, "real") })).filter((x) => x.monto)} />
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
                      <span className={`block rounded px-2 py-1 num text-center ${c.mes === mesCorte && enCurso ? "opacity-60" : ""} ${colorCumpl(c.cumpl)}`}
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
