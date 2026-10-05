// Vista del módulo Tiendas: recibe los filtros de la URL y una fuente de datos.
import { CalendarDays, Grid3x3, Package, Store, Tags } from "lucide-react";
import { salir } from "@/app/login/actions";
import { Filtros } from "@/components/Filtros";
import { GraficoTendencia, Indicador } from "@/components/Graficos";
import { Marco, type TipoRetail } from "@/components/Marco";
import { PanelCarga } from "@/components/PanelCarga";
import { Pestanas } from "@/components/Pestanas";
import type { DatosCarga } from "@/lib/cargasServidor";
import { Tabla, type Columna } from "@/components/Tabla";
import { Encabezado, FranjaComparacion, ListaBarras, Tarjeta } from "@/components/ui";
import { entero, porcentaje, soles } from "@/lib/formato";
import type { Agrupar } from "@/lib/kpi";
import {
  alinear, COMPARAR, COMPARAR_CORTO, DIAS_SEM, diaSemana, diasEntre, fechaLarga, PERIODOS, rangoComparacion, rangoPeriodo, type Comparar, type Periodo,
} from "@/lib/periodos";
import * as t from "@/lib/tiendas";
import { ResumenEjecutivo } from "@/components/ResumenEjecutivo";
import { CONFIG, type FiltrosEjecutivo } from "@/lib/ejecutivo";
import type { DatosEjecutivo } from "@/components/ResumenEjecutivo";

type Params = { [k: string]: string | string[] | undefined };
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const lista = (v: string | string[] | undefined) => (uno(v) ? uno(v)!.split(",").filter(Boolean) : []);
const variacion = (a: number | null, b: number | null | undefined) => (a !== null && b ? a / b - 1 : null);
const div = (a: number, b: number) => (b ? a / b : null);
/** Nombre corto de la comparación, para títulos de columnas. */
const CORTO: Record<Comparar, string> = { ant: "periodo anterior", sem: "semana anterior", anio: "año anterior", anioSem: "mismo día año anterior", no: "" };

const COL = {
  und: { clave: "und", titulo: "Unidades", tipo: "entero", info: "tUnidades" },
  venta: { clave: "venta", titulo: "Venta S/", tipo: "soles", info: "tVenta" },
  pct: { clave: "pct", titulo: "% venta", tipo: "porcentaje", info: "mix" },
  precio: { clave: "precio", titulo: "Precio prom. S/", tipo: "decimal2", info: "tPrecio" },
  ventaDia: { clave: "venta_dia", titulo: "Venta/día S/", tipo: "soles", info: "tVentaDia" },
  var: { clave: "var", titulo: "Variación", tipo: "porcentaje", info: "variacion" },
} satisfies Record<string, Columna>;

/** De dónde salen los datos (la base, o datos de prueba). */
export type Fuente = { maestros: () => Promise<t.MaestrosTiendas>; panel: (desde: string, hasta: string, f: t.FiltroTiendas) => Promise<t.Panel>; tipos: () => Promise<TipoRetail[]>; ejecutivo: (desde: string, hasta: string, f: FiltrosEjecutivo) => Promise<DatosEjecutivo>; carga?: () => Promise<DatosCarga> };

export async function vistaTiendas(sp: Params, usuario: string | undefined, fuente: Fuente) {
  const [m, tipos] = await Promise.all([fuente.maestros(), fuente.tipos()]);

  if (!m.hasta) {
    return (
      <main className="p-8 grid gap-2">
        <h1 className="text-2xl font-bold">Tiendas</h1>
        <p>La base todavía no tiene la venta de tiendas. Ejecuta rpa/tiendas_excel.py.</p>
      </main>
    );
  }

  // --------------------------------------------------------------- filtros
  const ultimo = m.hasta;
  const primero = m.desde ?? ultimo;
  const periodo = (uno(sp.p) as Periodo) in PERIODOS ? (uno(sp.p) as Periodo) : "mes";
  const [desde, hasta] = rangoPeriodo(periodo, ultimo, primero, uno(sp.d1), uno(sp.d2));
  // En tiendas hay historia desde 2025: por defecto se compara con las mismas fechas del año anterior.
  const comparar = (uno(sp.c) as Comparar) in COMPARAR ? (uno(sp.c) as Comparar) : "anio";
  const comp = rangoComparacion(comparar, desde, hasta);
  const agrupar = (["dia", "semana", "mes"].includes(uno(sp.g) ?? "") ? uno(sp.g) : "dia") as Agrupar;
  const dias = uno(sp.ds) ? [...new Set(uno(sp.ds)!.split("").map(Number).filter((d) => d >= 0 && d <= 6))] : [0, 1, 2, 3, 4, 5, 6];
  const filtro: t.FiltroTiendas = { tiendas: lista(sp.tienda), skus: lista(sp.prod), tipos: lista(sp.tipo), dias };

  // --------------------------------------------------------------- datos
  const [A, B, ej] = await Promise.all([
    fuente.panel(desde, hasta, filtro),
    comp ? fuente.panel(comp[0], comp[1], filtro) : Promise.resolve(null),
    fuente.ejecutivo(desde, hasta, { tienda: filtro.tiendas, sku: filtro.skus, tipo: filtro.tipos, dias: filtro.dias }),
  ]);
  const R = t.total(A.dias), RC = B ? t.total(B.dias) : null;
  const diasVenta = A.dias.filter((d) => d.venta > 0).length;
  const diasVentaC = B ? B.dias.filter((d) => d.venta > 0).length : 0;
  const hayComp = !!B && B.dias.length > 0;
  const nombreComp = CORTO[comparar];
  const colComp = { clave: "venta_c", titulo: `Venta ${nombreComp} S/`, tipo: "soles" } satisfies Columna;
  const conComp = (cols: Columna[]) => (hayComp ? [...cols, colComp, COL.var] : cols);

  // --------------------------------------------------------------- series y tablas
  // La comparación se alinea por fecha equivalente (el 12/09/2026 con el 12/09/2025), no por posición.
  const serieA = t.agrupar(A.dias, agrupar);
  const mover = alinear(comparar, desde, hasta);
  const serieB = new Map(B ? t.agrupar(B.dias.map((d) => ({ ...d, fecha: mover(d.fecha) })), agrupar).map((s) => [s.periodo, s]) : []);
  const tendencia = serieA.map((s) => ({
    periodo: s.periodo, venta: s.venta, und: s.und, costo: 0,
    venta_c: hayComp ? serieB.get(s.periodo)?.venta ?? 0 : null, und_c: hayComp ? serieB.get(s.periodo)?.und ?? 0 : null, costo_c: null,
  }));
  const ventaC = (mapa: Map<string, number>, k: string) => (hayComp ? mapa.get(k) ?? 0 : null);
  const tiendaC = new Map((B?.tiendas ?? []).map((x) => [x.tienda, x.venta]));
  const porTienda = A.tiendas.map((x) => ({
    ...x, pct: div(x.venta, R.venta), precio: div(x.venta, x.und), venta_dia: div(x.venta, x.dias),
    venta_c: ventaC(tiendaC, x.tienda), var: variacion(x.venta, tiendaC.get(x.tienda)),
  })).sort((a, b) => b.venta - a.venta);
  const prodC = new Map((B?.productos ?? []).map((x) => [x.sku, x.venta]));
  const porProducto = A.productos.map((x) => ({
    ...x, pct: div(x.venta, R.venta), precio: div(x.venta, x.und), venta_c: ventaC(prodC, x.sku), var: variacion(x.venta, prodC.get(x.sku)),
  })).sort((a, b) => b.venta - a.venta);
  const porTipo = [...A.tipos].sort((a, b) => b.venta - a.venta);

  // Producto × tienda: una columna de venta por tienda.
  const tiendasCols = porTienda.map((x) => x.tienda);
  const cruce = porProducto.map((p) => ({
    producto: p.producto, venta: p.venta,
    ...Object.fromEntries(A.cruce.filter((c) => c.sku === p.sku).map((c) => [`t_${c.tienda}`, c.venta])),
  }));
  const cruceTotal = { producto: "TOTAL", venta: R.venta, ...Object.fromEntries(porTienda.map((x) => [`t_${x.tienda}`, x.venta])) };

  const totalComp = hayComp ? { venta_c: RC!.venta, var: variacion(R.venta, RC!.venta) } : {};
  const totalFila = { und: R.und, venta: R.venta, pct: R.venta ? 1 : null, precio: div(R.venta, R.und), venta_dia: div(R.venta, diasVenta), ...totalComp };
  const archivo = (n: string) => `tiendas_${n}_${desde}_${hasta}.xlsx`;
  const nDias = diasEntre(desde, hasta);
  const vacio = <p className="text-sm text-[var(--tenue)]">No hay ventas con estos filtros.</p>;
  const rango = `${fechaLarga(desde)} – ${fechaLarga(hasta)}`;
  const textoComp = comp ? `${fechaLarga(comp[0])} – ${fechaLarga(comp[1])}` : "";
  const unidadPeriodo = agrupar === "dia" ? "día" : agrupar;
  const comparadoCon = COMPARAR_CORTO[comparar];

  // --------------------------------------------------------------- encabezado
  const carga = fuente.carga ? await fuente.carga() : null;
  const chips = [
    dias.length < 7 && `Días: ${dias.map((d) => DIAS_SEM[d]).join(", ")}`,
    filtro.tiendas.length && `Tienda: ${filtro.tiendas.join(", ")}`,
    filtro.skus.length && `Producto: ${m.productos.filter((p) => filtro.skus.includes(p.sku)).map((p) => p.producto).join(", ")}`,
    filtro.tipos.length && `Tipo de precio: ${filtro.tipos.join(", ")}`,
  ].filter(Boolean) as string[];

  const encabezado = (
    <header className="grid gap-4">
      <div className="grid gap-1">
        <p className="etiqueta">Tiendas · Reporte interno (Excel de los jefes) · Turrones Calderón</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[28px] font-bold leading-tight">Reporte interno de tiendas</h1>
          {carga && <PanelCarga titulo="Cargar reporte interno" solo="tiendas" equivalencias={carga.equivalencias} skus={carga.skus} correo={usuario} cargas={carga.cargas} />}
        </div>
        <p className="text-sm text-[var(--tenue)]">
          <b className="text-[var(--tinta)]">{PERIODOS[periodo]}</b> · {rango} · {nDias} días
          {diasVenta !== nDias && ` (${diasVenta} con venta)`}
        </p>
      </div>
      <Filtros ultimo={ultimo} primero={primero} compararDefecto="anio" grupos={[
        { clave: "tienda", etiqueta: "Tienda", opciones: m.tiendas.map((x) => ({ valor: x, texto: x })) },
        { clave: "prod", etiqueta: "Producto", buscar: true, opciones: m.productos.map((p) => ({ valor: p.sku, texto: p.producto })) },
        { clave: "tipo", etiqueta: "Tipo de precio", opciones: m.tipos.map((x) => ({ valor: x, texto: x })) },
      ]} />
      <FranjaComparacion desde={desde} hasta={hasta} comp={comp} tipo={comparar} hayDatos={hayComp} />
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => <span key={c} className="text-xs px-2.5 py-1 rounded-full bg-[var(--acento-suave)] text-[var(--acento)] font-medium">{c}</span>)}
        </div>
      )}
    </header>
  );

  // --------------------------------------------------------------- secciones
  const indicadores = (
    <div className="grid gap-4 grid-cols-1 @lg:grid-cols-2 @5xl:grid-cols-4">
      <Indicador comparadoCon={comparadoCon} info="tVenta" icono="venta" titulo="Venta" valor={soles(R.venta)} variacion={variacion(R.venta, RC?.venta)}
                 tendencia={A.dias.map((d) => d.venta)} />
      <Indicador comparadoCon={comparadoCon} info="tUnidades" icono="unidades" titulo="Unidades vendidas" valor={entero(R.und)} variacion={variacion(R.und, RC?.und)}
                 tendencia={A.dias.map((d) => d.und)} />
      <Indicador comparadoCon={comparadoCon} info="tPrecio" icono="ingreso" titulo="Precio promedio por unidad" valor={soles(div(R.venta, R.und))}
                 variacion={RC ? variacion(div(R.venta, R.und), div(RC.venta, RC.und)) : null} />
      <Indicador comparadoCon={comparadoCon} info="tVentaDia" icono="rotacion" titulo="Venta promedio por día" valor={soles(div(R.venta, diasVenta))}
                 variacion={RC ? variacion(div(R.venta, diasVenta), div(RC.venta, diasVentaC)) : null} detalle={`${diasVenta} días con venta`} />
    </div>
  );

  const barrasTienda = (
    <ListaBarras formato={(v) => `${soles(v)} · ${porcentaje(R.venta ? v / R.venta : 0)}`}
                 filas={porTienda.map((x) => ({ etiqueta: x.tienda, valor: x.venta, detalle: `${entero(x.und)} und · ${x.dias} días con venta` }))} />
  );
  const barrasTipo = (
    <ListaBarras formato={(v) => `${soles(v)} · ${porcentaje(R.venta ? v / R.venta : 0)}`}
                 filas={porTipo.map((x) => ({ etiqueta: x.tipo, valor: x.venta, detalle: `${entero(x.und)} und` }))} />
  );

  // Ventas: sumas generales y gráficos.
  const seccionVentas = (
    <>
      {indicadores}
      {A.dias.length === 0 ? vacio : (
        <>
          <div className="grid gap-4 @5xl:grid-cols-3">
            <div className="@5xl:col-span-2 min-w-0">
              <GraficoTendencia datos={tendencia} agrupar={agrupar} conPrevio={hayComp} nombrePrevio={COMPARAR[comparar]} rango={rango}
                                metricas={["venta", "und"]} nombres={{ venta: "Venta" }} info="tEvolucion" />
            </div>
            <Tarjeta info="tVenta" icono={Store} titulo="Venta por tienda" subtitulo={rango}>{barrasTienda}</Tarjeta>
          </div>
          <div className="grid gap-4 @5xl:grid-cols-3">
            <Tarjeta className="@5xl:col-span-2" info="tEvolucion" icono={CalendarDays} titulo={`Detalle por ${unidadPeriodo}`} subtitulo={rango}>
              <Tabla archivo={archivo("detalle")} hoja="Detalle" alto={360}
                     filas={[...tendencia].reverse().map((s) => ({
                       ...s, var: variacion(s.venta, s.venta_c), dia: agrupar === "dia" ? DIAS_SEM[diaSemana(s.periodo)] : "",
                       periodo: agrupar === "mes" ? `${s.periodo.slice(5, 7)}/${s.periodo.slice(0, 4)}` : fechaLarga(s.periodo),
                     }))}
                     columnas={conComp([{ clave: "periodo", titulo: agrupar === "dia" ? "Día" : agrupar === "semana" ? "Semana (lunes)" : "Mes", tipo: "texto" },
                       ...(agrupar === "dia" ? [{ clave: "dia", titulo: "", tipo: "texto" } as Columna] : []), COL.und, COL.venta])}
                     total={{ periodo: "TOTAL", ...totalFila }} />
            </Tarjeta>
            <Tarjeta info="tTipoPrecio" icono={Tags} titulo="Venta por tipo de precio" subtitulo={rango}>{barrasTipo}</Tarjeta>
          </div>
        </>
      )}
    </>
  );

  const detalleTiendas = (
    <>
      <p className="text-sm text-[var(--tenue)] max-w-3xl">Cuánto vende cada tienda y cómo va frente al {nombreComp || "periodo de comparación"}. Ordena la tabla por
        cualquier columna; <b>Venta/día</b> compara tiendas en igualdad aunque hayan abierto distintos días.</p>
      {A.dias.length === 0 ? vacio : (
        <>
          <Tarjeta icono={Store} titulo="Todas las tiendas" subtitulo={`${porTienda.length} tiendas · ${rango}${hayComp ? ` · comparado con ${textoComp}` : ""}`}>
            <Tabla archivo={archivo("tiendas")} hoja="Tiendas" filas={porTienda}
                   columnas={conComp([{ clave: "tienda", titulo: "Tienda", tipo: "texto" }, COL.und, COL.venta, COL.pct, COL.precio,
                     { clave: "dias", titulo: "Días con venta", tipo: "entero" }, COL.ventaDia])}
                   total={{ tienda: "TOTAL", dias: diasVenta, ...totalFila }} />
          </Tarjeta>
          <div className="grid gap-4 @4xl:grid-cols-2">
            <Tarjeta info="tVenta" icono={Store} titulo="Participación por tienda" subtitulo={rango}>{barrasTienda}</Tarjeta>
            <Tarjeta info="tTipoPrecio" icono={Tags} titulo="Venta por tipo de precio" subtitulo={rango}>{barrasTipo}</Tarjeta>
          </div>
        </>
      )}
    </>
  );

  const detalleProductos = (
    <>
      <p className="text-sm text-[var(--tenue)] max-w-3xl">Qué productos empujan la venta de las tiendas (% venta) y a qué precio promedio se venden.
        Los productos usan el SKU oficial de ContaNet.</p>
      {A.dias.length === 0 ? vacio : (
          <Tarjeta info="mix" icono={Package} titulo="Por producto" subtitulo={`${porProducto.length} productos · ${rango}`}>
            <Tabla archivo={archivo("productos")} hoja="Productos" alto={480} buscar filas={porProducto}
                   columnas={conComp([{ clave: "producto", titulo: "Producto", tipo: "texto" }, { clave: "sku", titulo: "SKU", tipo: "texto" },
                     COL.und, COL.venta, COL.pct, COL.precio])}
                   total={{ producto: "TOTAL", ...totalFila }} />
          </Tarjeta>
      )}
    </>
  );

  const detalleCruce = (
    <>
      <p className="text-sm text-[var(--tenue)] max-w-3xl">Cuánto vende cada tienda de cada producto, para ajustar el surtido y la reposición de cada local.</p>
      {A.dias.length === 0 ? vacio : (
          <Tarjeta info="tCruce" icono={Grid3x3} titulo="Venta por producto y tienda" subtitulo={`S/ · ${rango}`}>
            <Tabla archivo={archivo("producto_tienda")} hoja="Producto x tienda" alto={560} buscar filas={cruce}
                   columnas={[{ clave: "producto", titulo: "Producto", tipo: "texto" },
                     ...tiendasCols.map((x) => ({ clave: `t_${x}`, titulo: x, tipo: "soles" }) as Columna),
                     { clave: "venta", titulo: "Total S/", tipo: "soles" }]}
                   total={cruceTotal} />
          </Tarjeta>
      )}
    </>
  );

  // Detalle de ventas: abierto por tienda, por producto y producto × tienda.
  const seccionDetalle = (
    <>
      <Encabezado titulo="Detalle de ventas" descripcion={<>La venta de las tiendas abierta por tienda y por producto. {rango}.</>} />
      <Pestanas pestanas={[
        { id: "tiendas", titulo: "Por tienda", contenido: detalleTiendas },
        { id: "productos", titulo: "Por producto", contenido: detalleProductos },
        { id: "cruce", titulo: "Producto × tienda", contenido: detalleCruce },
      ]} />
    </>
  );

  return (
    <Marco seccion={sp.s} ubicacion="tiendas/interno" tiposRetail={tipos} encabezado={encabezado} usuario={usuario} salir={salir} datosAl={fechaLarga(ultimo)} secciones={[
{ id: "ejecutivo", titulo: "Resumen ejecutivo", contenido: <ResumenEjecutivo datos={ej} desde={desde} hasta={hasta} config={CONFIG.tiendas} archivo="tiendas_interno_ejecutivo" /> },
      { id: "ventas", titulo: "Ventas", contenido: seccionVentas },
      { id: "detalle", titulo: "Detalle de ventas", contenido: seccionDetalle },
    ]} />
  );
}
