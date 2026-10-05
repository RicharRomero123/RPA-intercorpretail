// Vista del Resumen general: el Excel «Consolidado-all-canales» (VENTAS NEGOCIO) mapeado a la web.
// Por canal y por mes: 2025, real, meta, variación vs 2025, variación vs meta y cumplimiento.
import { CalendarRange, Grid3x3, Layers, Package } from "lucide-react";
import Link from "next/link";
import { salir } from "@/app/login/actions";
import { GraficoCanales } from "@/components/GraficoCanales";
import { GraficoConsolidado } from "@/components/GraficoConsolidado";
import { Indicador } from "@/components/Graficos";
import { Marco, type TipoRetail } from "@/components/Marco";
import { Pestanas } from "@/components/Pestanas";
import { Tabla } from "@/components/Tabla";
import { Tarjeta } from "@/components/ui";
import { porcentaje, soles } from "@/lib/formato";
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

/** Color del cumplimiento: verde ≥ 100%, ámbar 90–99%, rojo < 90%. */
const colorCumpl = (x: number | null) => (x === null ? "text-[var(--tenue)]" : x >= 1 ? "bg-[var(--bueno-suave)] text-[var(--bueno)]"
  : x >= 0.9 ? "bg-[var(--alerta-suave)] text-[var(--alerta)]" : "bg-[var(--critico-suave)] text-[var(--critico)]");
const colorVar = (x: number | null) => (x === null ? "text-[var(--tenue)]" : x >= 0 ? "text-[var(--bueno)]" : "text-[var(--critico)]");

export function vistaConsolidado(celdas: Celda[], carga: { archivo: string; corte: string } | null, tipos: TipoRetail[], usuario: string | undefined,
                                 sp: { [k: string]: string | string[] | undefined }, productos: FilaSku[] = []) {
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
        cierre al <b className="text-[var(--tinta)]">{fechaLarga(corte)}</b>. Fuente: «{carga.archivo}».
      </p>
    </header>
  );

  const contenido = (
    <>
      {/* 1. Total del negocio a la fecha */}
      <div className="grid gap-4 grid-cols-1 @lg:grid-cols-2 @5xl:grid-cols-4">
        <Indicador icono="venta" titulo={`Real ${anio} a la fecha`} valor={soles(T.realFecha)} detalle={`1 ene – ${diaCorte} ${MESES[mesCorte - 1].toLowerCase()}`} />
        <Indicador icono="rotacion" titulo="Cumplimiento de meta" valor={T.cumpl === null ? "—" : porcentaje(T.cumpl)}
                   detalle={`${tramo} cerrado · meta ${soles(T.meta)}`} />
        <Indicador icono="ingreso" titulo={`Crecimiento vs ${anio - 1}`} valor={signo(T.var)} detalle={`${tramo} cerrado · ${anio - 1}: ${soles(T.ant)}`} />
        <Indicador icono="cobertura" titulo="Avance meta anual" valor={T.avance === null ? "—" : porcentaje(T.avance)}
                   detalle={`de ${soles(T.metaAnio)}${enCurso && T.avanceMes !== null ? ` · ${mesTxt}: ${porcentaje(T.avanceMes)} de su meta` : ""}`} />
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

      {/* 4. Productos más vendidos entre todos los canales */}
      {productos.length > 0 && (
        <Tarjeta icono={Package} titulo="Productos más vendidos: todos los canales"
                 subtitulo={`Unidades de cada SKU por mes, ene–${MESES[mesCorte - 1].toLowerCase()} ${anio}, sumando los canales con detalle por producto`}>
          <ProductosTop filas={productos} mesCorte={mesCorte} archivo={corte}
                        etiquetaMes={(m) => `${MESES[m - 1]}${m === mesCorte && enCurso ? ` (al ${diaCorte})` : ""}`}
                        sinDetalle={(() => {
                          const fuera = canales.filter((c) => c === "B2B" || c === "RAPPI");
                          const monto = fuera.reduce((s, c) => s + suma(c, anio, mesCorte, "real"), 0);
                          return { canales: fuera.map(nombre).join(" y "), monto, part: div(monto, T.realFecha) };
                        })()} />
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
