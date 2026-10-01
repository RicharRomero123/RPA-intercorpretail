// Vista de un tipo de retail (por ejemplo, Conveniencia): ventas de Calderón a sus clientes, del Excel de ventas retail.
import { CalendarDays, CircleCheck, Package, Truck, Users } from "lucide-react";
import { salir } from "@/app/login/actions";
import { Filtros } from "@/components/Filtros";
import { GraficoTendencia, Indicador } from "@/components/Graficos";
import { Marco, type TipoRetail } from "@/components/Marco";
import { Pestanas } from "@/components/Pestanas";
import { Tabla, type Columna } from "@/components/Tabla";
import { Encabezado, FranjaComparacion, ListaBarras, Tarjeta } from "@/components/ui";
import { entero, porcentaje, soles } from "@/lib/formato";
import type { Agrupar } from "@/lib/kpi";
import {
  alinear, COMPARAR, COMPARAR_CORTO, diasEntre, fechaLarga, PERIODOS, rangoComparacion, rangoPeriodo, type Comparar, type Periodo,
} from "@/lib/periodos";
import type { FiltroRetail, PanelRetail } from "@/lib/retail";
import { ResumenEjecutivo } from "@/components/ResumenEjecutivo";
import { CONFIG, type FiltrosEjecutivo } from "@/lib/ejecutivo";
import type { DatosEjecutivo } from "@/components/ResumenEjecutivo";
import { agrupar as agruparDias } from "@/lib/tiendas";

type Params = { [k: string]: string | string[] | undefined };
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const lista = (v: string | string[] | undefined) => (uno(v) ? uno(v)!.split(",").filter(Boolean) : []);
const variacion = (a: number | null, b: number | null | undefined) => (a !== null && b ? a / b - 1 : null);
const div = (a: number, b: number) => (b ? a / b : null);
const sumar = (xs: { und: number; venta: number }[]) => xs.reduce((a, x) => ({ und: a.und + x.und, venta: a.venta + x.venta }), { und: 0, venta: 0 });
const CORTO: Record<Comparar, string> = { ant: "periodo anterior", sem: "semana anterior", anio: "año anterior", anioSem: "mismo día año anterior", no: "" };

/** De dónde salen los datos (la base, o datos de prueba). */
export type FuenteRetail = {
  tipos: () => Promise<TipoRetail[]>;
  limites: (tipo: string) => Promise<{ desde: string | null; hasta: string | null }>;
  panel: (tipo: string, desde: string, hasta: string, f: FiltroRetail) => Promise<PanelRetail>;
  ejecutivo: (tipo: string, desde: string, hasta: string, f: FiltrosEjecutivo) => Promise<DatosEjecutivo>;
};

export async function vistaTipo(slug: string, sp: Params, usuario: string | undefined, fuente: FuenteRetail) {
  const tipos = await fuente.tipos();
  const t = tipos.find((x) => x.slug === slug);
  if (!t) return null;
  const lim = await fuente.limites(t.tipo);
  const ultimo = lim.hasta ?? new Date().toISOString().slice(0, 10), primero = lim.desde ?? ultimo;

  // Los despachos son pocos por mes: por defecto el año, por mes, contra el año anterior.
  const periodo = (uno(sp.p) as Periodo) in PERIODOS ? (uno(sp.p) as Periodo) : "anio";
  const [desde, hasta] = rangoPeriodo(periodo, ultimo, primero, uno(sp.d1), uno(sp.d2));
  const comparar = (uno(sp.c) as Comparar) in COMPARAR ? (uno(sp.c) as Comparar) : "anio";
  const comp = rangoComparacion(comparar, desde, hasta);
  const agrupar = (["dia", "semana", "mes"].includes(uno(sp.g) ?? "") ? uno(sp.g) : "mes") as Agrupar;
  const filtro: FiltroRetail = { clientes: lista(sp.cli), skus: lista(sp.prod), status: lista(sp.est) };

  // Opciones de los filtros: del año completo, sin filtrar.
  const [A, B, todo, ej] = await Promise.all([
    fuente.panel(t.tipo, desde, hasta, filtro),
    comp ? fuente.panel(t.tipo, comp[0], comp[1], filtro) : Promise.resolve(null),
    fuente.panel(t.tipo, primero, ultimo, { clientes: [], skus: [], status: [] }),
    fuente.ejecutivo(t.tipo, desde, hasta, { cliente: filtro.clientes, sku: filtro.skus, status: filtro.status }),
  ]);
  const R = sumar(A.dias), RC = B ? sumar(B.dias) : null;
  const hayComp = !!B && B.dias.length > 0;
  const despachos = A.clientes.reduce((a, c) => a + c.despachos, 0);
  const despachosC = B ? B.clientes.reduce((a, c) => a + c.despachos, 0) : 0;
  const nombreComp = CORTO[comparar];

  const serieA = agruparDias(A.dias, agrupar);
  const mover = alinear(comparar, desde, hasta);
  const serieB = new Map(B ? agruparDias(B.dias.map((d) => ({ ...d, fecha: mover(d.fecha) })), agrupar).map((s) => [s.periodo, s]) : []);
  const tendencia = serieA.map((s) => ({ periodo: s.periodo, venta: s.venta, und: s.und, costo: 0,
    venta_c: hayComp ? serieB.get(s.periodo)?.venta ?? 0 : null, und_c: hayComp ? serieB.get(s.periodo)?.und ?? 0 : null, costo_c: null }));

  const cliC = new Map((B?.clientes ?? []).map((c) => [c.cliente, c.venta]));
  const porCliente = A.clientes.map((c) => ({ ...c, pct: div(c.venta, R.venta), precio: div(c.venta, c.und),
    venta_c: hayComp ? cliC.get(c.cliente) ?? 0 : null, var: variacion(c.venta, cliC.get(c.cliente)) })).sort((a, b) => b.venta - a.venta);
  const prodC = new Map((B?.productos ?? []).map((p) => [p.sku, p.venta]));
  const porProducto = A.productos.map((p) => ({ ...p, pct: div(p.venta, R.venta), precio: div(p.venta, p.und),
    venta_c: hayComp ? prodC.get(p.sku) ?? 0 : null, var: variacion(p.venta, prodC.get(p.sku)) })).sort((a, b) => b.venta - a.venta);

  const colComp: Columna[] = hayComp
    ? [{ clave: "venta_c", titulo: `Venta ${nombreComp} S/`, tipo: "soles" }, { clave: "var", titulo: "Variación", tipo: "porcentaje", info: "variacion" }] : [];
  const totalComp = hayComp ? { venta_c: RC!.venta, var: variacion(R.venta, RC!.venta) } : {};
  const total = { und: R.und, venta: R.venta, pct: R.venta ? 1 : null, precio: div(R.venta, R.und), ...totalComp };
  const COL = {
    und: { clave: "und", titulo: "Unidades", tipo: "entero" }, venta: { clave: "venta", titulo: "Monto S/", tipo: "soles" },
    pct: { clave: "pct", titulo: "% monto", tipo: "porcentaje", info: "mix" }, precio: { clave: "precio", titulo: "Precio prom. S/", tipo: "decimal2" },
  } satisfies Record<string, Columna>;
  const rango = `${fechaLarga(desde)} – ${fechaLarga(hasta)}`;
  const archivo = (n: string) => `retail_${slug}_${n}_${desde}_${hasta}.xlsx`;
  const vacio = <p className="text-sm text-[var(--tenue)]">No hay despachos con estos filtros.</p>;
  const comparadoCon = COMPARAR_CORTO[comparar];
  const etiqueta = (p: string) => (agrupar === "mes" ? `${p.slice(5, 7)}/${p.slice(0, 4)}` : fechaLarga(p));
  const opciones = (xs: string[]) => [...new Set(xs)].sort().map((x) => ({ valor: x, texto: x }));

  const encabezado = (
    <header className="grid gap-4">
      <div className="grid gap-1">
        <p className="etiqueta">Retail · {t.tipo} · Turrones Calderón</p>
        <h1 className="text-[28px] font-bold leading-tight">{t.tipo}</h1>
        <p className="text-sm text-[var(--tenue)]">
          <b className="text-[var(--tinta)]">{PERIODOS[periodo]}</b> · {rango} · {diasEntre(desde, hasta)} días
           · montos del Excel de ventas retail
        </p>
      </div>
      <Filtros ultimo={ultimo} primero={primero} compararDefecto="anio" periodoDefecto="anio" agruparDefecto="mes" dias={false} grupos={[
        { clave: "cli", etiqueta: "Cliente", opciones: opciones(todo.clientes.map((c) => c.cliente)) },
        { clave: "prod", etiqueta: "Producto", buscar: true, opciones: todo.productos.map((p) => ({ valor: p.sku, texto: `${p.producto} (${p.sku})` })) },
        { clave: "est", etiqueta: "Estado", opciones: opciones(todo.status.map((s) => s.status)) },
      ]} />
      <FranjaComparacion desde={desde} hasta={hasta} comp={comp} tipo={comparar} hayDatos={hayComp} />
    </header>
  );

  const seccionVentas = (
    <>
      <div className="grid gap-4 grid-cols-1 @lg:grid-cols-2 @5xl:grid-cols-4">
        <Indicador comparadoCon={comparadoCon} icono="venta" titulo="Monto" valor={soles(R.venta)} variacion={variacion(R.venta, RC?.venta)} />
        <Indicador comparadoCon={comparadoCon} icono="unidades" titulo="Unidades" valor={entero(R.und)} variacion={variacion(R.und, RC?.und)} />
        <Indicador comparadoCon={comparadoCon} icono="ingreso" titulo="Precio promedio por unidad" valor={soles(div(R.venta, R.und))}
                   variacion={RC ? variacion(div(R.venta, R.und), div(RC.venta, RC.und)) : null} />
        <Indicador comparadoCon={comparadoCon} icono="rotacion" titulo="Despachos" valor={entero(despachos)} variacion={RC ? variacion(despachos, despachosC) : null}
                   detalle={`${porCliente.length} cliente(s)`} ayuda="Días de despacho por cliente." />
      </div>
      {A.dias.length === 0 ? vacio : (
        <>
          <div className="grid gap-4 @5xl:grid-cols-3">
            <div className="@5xl:col-span-2 min-w-0">
              <GraficoTendencia datos={tendencia} agrupar={agrupar} conPrevio={hayComp} nombrePrevio={COMPARAR[comparar]} rango={rango}
                                metricas={["venta", "und"]} nombres={{ venta: "Monto" }} />
            </div>
            <Tarjeta icono={Users} titulo="Monto por cliente" subtitulo={rango}>
              <ListaBarras formato={(v) => `${soles(v)} · ${porcentaje(R.venta ? v / R.venta : 0)}`}
                           filas={porCliente.map((c) => ({ etiqueta: c.cliente, valor: c.venta, detalle: `${entero(c.und)} und · ${c.despachos} despachos` }))} />
            </Tarjeta>
          </div>
          <div className="grid gap-4 @5xl:grid-cols-3">
            <Tarjeta className="@5xl:col-span-2" icono={CalendarDays} titulo={`Detalle por ${agrupar === "dia" ? "día" : agrupar}`} subtitulo={rango}>
              <Tabla archivo={archivo("detalle")} hoja="Detalle" alto={360}
                     filas={[...tendencia].reverse().map((s) => ({ ...s, periodo: etiqueta(s.periodo), var: variacion(s.venta, s.venta_c) }))}
                     columnas={[{ clave: "periodo", titulo: agrupar === "mes" ? "Mes" : agrupar === "semana" ? "Semana (lunes)" : "Día", tipo: "texto" },
                       COL.und, COL.venta, ...colComp]}
                     total={{ periodo: "TOTAL", ...total }} />
            </Tarjeta>
            <Tarjeta icono={CircleCheck} titulo="Monto por estado" subtitulo={rango}>
              <ListaBarras formato={(v) => `${soles(v)} · ${porcentaje(R.venta ? v / R.venta : 0)}`}
                           filas={[...A.status].sort((a, b) => b.venta - a.venta).map((s) => ({ etiqueta: s.status, valor: s.venta, detalle: `${s.lineas} líneas` }))} />
            </Tarjeta>
          </div>
        </>
      )}
    </>
  );

  const seccionDetalle = (
    <>
      <Encabezado titulo="Detalle de ventas" descripcion={<>Los despachos de {t.tipo.toLowerCase()} abiertos por cliente, por producto y uno por uno. {rango}.</>} />
      {A.dias.length === 0 ? vacio : (
        <Pestanas pestanas={[
          { id: "clientes", titulo: "Por cliente", contenido: (
            <Tarjeta icono={Users} titulo="Por cliente" subtitulo={`${porCliente.length} cliente(s) · ${rango}`}>
              <Tabla archivo={archivo("clientes")} hoja="Clientes" filas={porCliente}
                     columnas={[{ clave: "cliente", titulo: "Cliente", tipo: "texto" }, { clave: "despachos", titulo: "Despachos", tipo: "entero" },
                       COL.und, COL.venta, COL.pct, COL.precio, ...colComp]}
                     total={{ cliente: "TOTAL", despachos, ...total }} />
            </Tarjeta>
          ) },
          { id: "productos", titulo: "Por producto", contenido: (
            <Tarjeta icono={Package} titulo="Por producto" subtitulo={`${porProducto.length} producto(s) · ${rango}`}>
              <Tabla archivo={archivo("productos")} hoja="Productos" buscar filas={porProducto}
                     columnas={[{ clave: "producto", titulo: "Producto", tipo: "texto" }, { clave: "sku", titulo: "SKU", tipo: "texto" },
                       COL.und, COL.venta, COL.pct, COL.precio, ...colComp]}
                     total={{ producto: "TOTAL", ...total }} />
            </Tarjeta>
          ) },
          { id: "despachos", titulo: "Despachos", contenido: (
            <Tarjeta icono={Truck} titulo="Despachos uno por uno" subtitulo={`${A.lineas.length} líneas · ${rango}`}>
              <Tabla archivo={archivo("despachos")} hoja="Despachos" alto={560} buscar
                     filas={A.lineas.map((l) => ({ ...l, fecha: fechaLarga(l.fecha) }))}
                     columnas={[{ clave: "fecha", titulo: "Día de despacho", tipo: "texto" }, { clave: "cliente", titulo: "Cliente", tipo: "texto" },
                       { clave: "sku", titulo: "SKU", tipo: "texto" }, { clave: "producto", titulo: "Producto", tipo: "texto" }, COL.und,
                       { clave: "precio_unitario", titulo: "Precio unit. S/", tipo: "decimal2" }, COL.venta,
                       { clave: "condicion_pago", titulo: "Condición", tipo: "texto" }, { clave: "status", titulo: "Estado", tipo: "texto" },
                       { clave: "detalle_despacho", titulo: "Detalle de despacho", tipo: "texto" }]}
                     total={{ fecha: "TOTAL", und: R.und, venta: R.venta }} />
            </Tarjeta>
          ) },
        ]} />
      )}
    </>
  );

  return (
    <Marco seccion={sp.s} ubicacion={`retail/${slug}`} tiposRetail={tipos} encabezado={encabezado} usuario={usuario} salir={salir} datosAl={fechaLarga(ultimo)} secciones={[
{ id: "ejecutivo", titulo: "Resumen ejecutivo", contenido: <ResumenEjecutivo datos={ej} desde={desde} hasta={hasta} config={CONFIG.tipo} archivo={`retail_${slug}_ejecutivo`} /> },
      { id: "ventas", titulo: "Ventas", contenido: seccionVentas },
      { id: "detalle", titulo: "Detalle de ventas", contenido: seccionDetalle },
    ]} />
  );
}
