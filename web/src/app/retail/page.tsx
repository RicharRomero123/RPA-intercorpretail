import { CalendarDays, Layers } from "lucide-react";
import { salir } from "@/app/login/actions";
import { Filtros } from "@/components/Filtros";
import { GraficoTendencia, Indicador } from "@/components/Graficos";
import { Marco } from "@/components/Marco";
import { PanelCarga } from "@/components/PanelCarga";
import { datosCarga } from "@/lib/cargasServidor";
import { Tabla, type Columna } from "@/components/Tabla";
import { FranjaComparacion, ListaBarras, Tarjeta } from "@/components/ui";
import { entero, porcentaje, soles } from "@/lib/formato";
import type { Agrupar } from "@/lib/kpi";
import {
  alinear, COMPARAR, COMPARAR_CORTO, diasEntre, fechaLarga, PERIODOS, rangoComparacion, rangoPeriodo, type Comparar, type Periodo,
} from "@/lib/periodos";
import { limitesRetail, resumenRetail, tiposRetail, type DiaComponente } from "@/lib/retail";
import { clienteSupabase } from "@/lib/supabase/server";
import { ResumenEjecutivo } from "@/components/ResumenEjecutivo";
import { CONFIG, datosEjecutivo } from "@/lib/ejecutivo";

import { agrupar as agruparDias } from "@/lib/tiendas";

export const metadata = { title: "Retail · Calderón" };

type Params = Promise<{ [k: string]: string | string[] | undefined }>;
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const variacion = (a: number | null, b: number | null | undefined) => (a !== null && b ? a / b - 1 : null);
const div = (a: number, b: number) => (b ? a / b : null);
const sumar = (xs: { und: number; venta: number }[]) => xs.reduce((a, x) => ({ und: a.und + x.und, venta: a.venta + x.venta }), { und: 0, venta: 0 });

/** Resumen de todo el canal retail: despachos de Calderón a cada tipo de retail (Excel «Ventas RETAIL»), lo mismo que el consolidado en RETAIL. */
export default async function ResumenRetail({ searchParams }: { searchParams: Params }) {
  const sp = await searchParams;
  const sb = await clienteSupabase();
  const { data: { user } } = await sb.auth.getUser();
  const [lim, tipos] = await Promise.all([limitesRetail(sb), tiposRetail(sb)]);
  if (!lim.hasta) {
    return <main className="p-8 grid gap-2"><h1 className="text-2xl font-bold">Retail</h1><p>Todavía no hay datos de retail en la base.</p></main>;
  }

  const ultimo = lim.hasta, primero = lim.desde ?? ultimo;
  const periodo = (uno(sp.p) as Periodo) in PERIODOS ? (uno(sp.p) as Periodo) : "anio";
  const [desde, hasta] = rangoPeriodo(periodo, ultimo, primero, uno(sp.d1), uno(sp.d2));
  const comparar = (uno(sp.c) as Comparar) in COMPARAR ? (uno(sp.c) as Comparar) : "anio";
  const comp = rangoComparacion(comparar, desde, hasta);
  const agrupar = (["dia", "semana", "mes"].includes(uno(sp.g) ?? "") ? uno(sp.g) : "mes") as Agrupar;

  const [A, B, ej, carga] = await Promise.all([resumenRetail(sb, desde, hasta), comp ? resumenRetail(sb, comp[0], comp[1]) : Promise.resolve([]),
    datosEjecutivo(sb, "retail", desde, hasta), datosCarga(sb, "retail")]);
  const R = sumar(A), RC = comp ? sumar(B) : null;
  const hayComp = B.length > 0;

  // Por tipo de retail, con sus clientes y su comparación.
  const componentes = [...new Set([...A, ...B].map((x) => x.componente))];
  const porComponente = componentes.map((c) => {
    const a = sumar(A.filter((x) => x.componente === c)), b = sumar(B.filter((x) => x.componente === c));
    const slug = [...A, ...B].find((x) => x.componente === c)!.slug;
    return { componente: c, slug,
             und: a.und, venta: a.venta, pct: div(a.venta, R.venta), precio: div(a.venta, a.und),
             venta_c: hayComp ? b.venta : null, var: variacion(a.venta, b.venta) };
  }).sort((x, y) => y.venta - x.venta);

  // Serie total: la comparación se alinea por fecha equivalente.
  const porDia = (xs: DiaComponente[]) => {
    const m = new Map<string, { fecha: string; und: number; venta: number }>();
    for (const x of xs) {
      const d = m.get(x.fecha) ?? { fecha: x.fecha, und: 0, venta: 0 };
      d.und += x.und; d.venta += x.venta; m.set(x.fecha, d);
    }
    return [...m.values()];
  };
  const serieA = agruparDias(porDia(A), agrupar);
  const mover = alinear(comparar, desde, hasta);
  const serieB = new Map(agruparDias(porDia(B).map((d) => ({ ...d, fecha: mover(d.fecha) })), agrupar).map((s) => [s.periodo, s]));
  const tendencia = serieA.map((s) => ({ periodo: s.periodo, venta: s.venta, und: s.und, costo: 0,
    venta_c: hayComp ? serieB.get(s.periodo)?.venta ?? 0 : null, und_c: hayComp ? serieB.get(s.periodo)?.und ?? 0 : null, costo_c: null }));

  const rango = `${fechaLarga(desde)} – ${fechaLarga(hasta)}`;
  const comparadoCon = COMPARAR_CORTO[comparar];
  const etiquetaPeriodo = (p: string) => (agrupar === "mes" ? `${p.slice(5, 7)}/${p.slice(0, 4)}` : fechaLarga(p));
  const colComp: Columna[] = hayComp ? [{ clave: "venta_c", titulo: "Venta comparación S/", tipo: "soles" }, { clave: "var", titulo: "Variación", tipo: "porcentaje", info: "variacion" }] : [];

  const encabezado = (
    <header className="grid gap-4">
      <div className="grid gap-1">
        <p className="etiqueta">Canal retail · Turrones Calderón</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[28px] font-bold leading-tight">Resumen retail</h1>
          <PanelCarga titulo="Cargar ventas retail" solo="retail" equivalencias={carga.equivalencias} skus={carga.skus} correo={user?.email} cargas={carga.cargas} />
        </div>
        <p className="text-sm text-[var(--tenue)]">
          <b className="text-[var(--tinta)]">{PERIODOS[periodo]}</b> · {rango} · {diasEntre(desde, hasta)} días
          
        </p>
      </div>
      <Filtros ultimo={ultimo} primero={primero} grupos={[]} periodoDefecto="anio" agruparDefecto="mes" dias={false} />
      <FranjaComparacion desde={desde} hasta={hasta} comp={comp} tipo={comparar} hayDatos={hayComp} />
    </header>
  );

  const contenido = (
    <>
      <div className="grid gap-4 grid-cols-1 @lg:grid-cols-3">
        <Indicador comparadoCon={comparadoCon} icono="venta" titulo="Venta retail de Calderón" valor={soles(R.venta)} variacion={variacion(R.venta, RC?.venta)}
                   detalle={`${porComponente.length} componente(s)`} />
        <Indicador comparadoCon={comparadoCon} icono="unidades" titulo="Unidades" valor={entero(R.und)} variacion={variacion(R.und, RC?.und)} />
        <Indicador comparadoCon={comparadoCon} icono="ingreso" titulo="Precio promedio por unidad" valor={soles(div(R.venta, R.und))}
                   variacion={RC ? variacion(div(R.venta, R.und), div(RC.venta, RC.und)) : null} />
      </div>
      {A.length === 0 ? <p className="text-sm text-[var(--tenue)]">No hay ventas retail en este periodo.</p> : (
        <>
          <div className="grid gap-4 @5xl:grid-cols-3">
            <div className="@5xl:col-span-2 min-w-0">
              <GraficoTendencia datos={tendencia} agrupar={agrupar} conPrevio={hayComp} nombrePrevio={COMPARAR[comparar]} rango={rango}
                                metricas={["venta", "und"]} nombres={{ venta: "Venta retail" }} />
            </div>
            <Tarjeta icono={Layers} titulo="Venta por tipo de retail" subtitulo={rango}>
              <ListaBarras formato={(v) => `${soles(v)} · ${porcentaje(R.venta ? v / R.venta : 0)}`}
                           filas={porComponente.map((c) => ({ etiqueta: c.componente, valor: c.venta }))} />
            </Tarjeta>
          </div>
          <Tarjeta icono={Layers} titulo="Por tipo de retail" subtitulo={rango}>
            <Tabla archivo={`retail_resumen_${desde}_${hasta}.xlsx`} hoja="Resumen retail" filas={porComponente}
                   columnas={[{ clave: "componente", titulo: "Tipo de retail", tipo: "texto" },
                     { clave: "und", titulo: "Unidades", tipo: "entero" }, { clave: "venta", titulo: "Venta S/", tipo: "soles" },
                     { clave: "pct", titulo: "% venta", tipo: "porcentaje" }, { clave: "precio", titulo: "Precio prom. S/", tipo: "decimal2" }, ...colComp]}
                   total={{ componente: "TOTAL", und: R.und, venta: R.venta, pct: R.venta ? 1 : null, precio: div(R.venta, R.und),
                            ...(hayComp ? { venta_c: RC!.venta, var: variacion(R.venta, RC!.venta) } : {}) }} />
            <p className="text-xs text-[var(--tenue)]">
              Monto cancelado de los despachos de Calderón a sus clientes retail, del Excel «Ventas RETAIL»: es lo mismo que suma el consolidado
              en RETAIL (cuadra al céntimo mes a mes). Lo que Supermercados Peruanos vendió al público (portal de Intercorp) se ve aparte en
              <b> Retail · SPSA</b>; no se suma aquí para no contar dos veces a SPSA (lo despachado y lo vendido).
            </p>
          </Tarjeta>
          <Tarjeta icono={CalendarDays} titulo={`Detalle por ${agrupar === "dia" ? "día" : agrupar}`} subtitulo={rango}>
            <Tabla archivo={`retail_detalle_${desde}_${hasta}.xlsx`} hoja="Detalle" alto={360}
                   filas={[...tendencia].reverse().map((s) => ({ ...s, periodo: etiquetaPeriodo(s.periodo), var: variacion(s.venta, s.venta_c) }))}
                   columnas={[{ clave: "periodo", titulo: agrupar === "mes" ? "Mes" : agrupar === "semana" ? "Semana (lunes)" : "Día", tipo: "texto" },
                     { clave: "und", titulo: "Unidades", tipo: "entero" }, { clave: "venta", titulo: "Venta S/", tipo: "soles" }, ...colComp]}
                   total={{ periodo: "TOTAL", und: R.und, venta: R.venta, ...(hayComp ? { venta_c: RC!.venta, var: variacion(R.venta, RC!.venta) } : {}) }} />
          </Tarjeta>
        </>
      )}
    </>
  );

  return (
    <Marco seccion={sp.s} ubicacion="retail/resumen" tiposRetail={tipos} encabezado={encabezado} usuario={user?.email} salir={salir} datosAl={fechaLarga(ultimo)}
           secciones={[{ id: "ejecutivo", titulo: "Resumen ejecutivo", contenido: <ResumenEjecutivo datos={ej} desde={desde} hasta={hasta} config={CONFIG.retail} archivo="retail_ejecutivo" /> },
      { id: "ventas", titulo: "Por tipo de retail", contenido }]} />
  );
}
