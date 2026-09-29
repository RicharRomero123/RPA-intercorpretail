import {
  Banknote, ChartLine, CircleAlert, Clock, Gauge, MapPinned, Package, PackageX, PieChart, Store, Timer, TriangleAlert,
  Warehouse,
} from "lucide-react";
import { salir } from "@/app/login/actions";
import { Filtros } from "@/components/Filtros";
import { AreaVentas, Dona, Indicador, Lineas } from "@/components/Graficos";
import { Marco } from "@/components/Marco";
import { Tabla, type Columna } from "@/components/Tabla";
import { Encabezado, ListaBarras, Tarjeta } from "@/components/ui";
import * as db from "@/lib/datos";
import { decimal1, entero, porcentaje, soles } from "@/lib/formato";
import { cobertura, diasConDatos, ESTADOS, filtrarDias, resumen, rotacionPor, serie, type Agrupar, type Estado } from "@/lib/kpi";
import {
  COMPARAR, DIAS_SEM, diaSemana, diasEntre, fechaLarga, PERIODOS, rangoComparacion, rangoPeriodo, sumarDias, type Comparar, type Periodo,
} from "@/lib/periodos";
import { clienteSupabase } from "@/lib/supabase/server";

type Params = Promise<{ [k: string]: string | string[] | undefined }>;
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const lista = (v: string | string[] | undefined) => (uno(v) ? uno(v)!.split(",").filter(Boolean) : []);
const numero = (v: string | string[] | undefined, def: number, min: number, max: number) => {
  const n = Number(uno(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : def;
};
const variacion = (a: number | null, b: number | null | undefined) => (a !== null && b ? a / b - 1 : null);

const COL = {
  und: { clave: "und", titulo: "Unidades", tipo: "entero", info: "unidades" },
  venta: { clave: "venta", titulo: "Venta público S/", tipo: "soles", info: "venta" },
  costo: { clave: "costo", titulo: "Ingreso Calderón S/", tipo: "soles", info: "ingreso" },
  margen: { clave: "margen", titulo: "Margen SPSA S/", tipo: "soles", info: "margen" },
  locales: { clave: "locales", titulo: "Locales con venta", tipo: "entero", info: "locales" },
  rotacion: { clave: "rotacion", titulo: "Und/local/semana", tipo: "decimal1", info: "rotacion" },
  pct: { clave: "pct", titulo: "% venta", tipo: "porcentaje", info: "mix" },
  local: { clave: "local", titulo: "Local", tipo: "texto" },
  cadena: { clave: "cadena", titulo: "Cadena", tipo: "texto" },
  zona: { clave: "zona", titulo: "Zona", tipo: "texto", info: "zona" },
  producto: { clave: "producto", titulo: "Producto", tipo: "texto" },
} satisfies Record<string, Columna>;

const ICONO_ESTADO: Record<Estado, typeof PackageX> = { quiebre: PackageX, sin: CircleAlert, bajo: TriangleAlert, ok: Package, sobre: Warehouse };

export default async function Inicio({ searchParams }: { searchParams: Params }) {
  const sp = await searchParams;
  const sb = await clienteSupabase();
  const { data: { user } } = await sb.auth.getUser();
  const lim = await db.limites(sb);

  if (!lim.ultimo) {
    return (
      <main className="p-8 grid gap-2">
        <h1 className="text-2xl font-bold">Calderón Retail</h1>
        <p>La base todavía no tiene datos. Ejecuta la migración o la carga diaria del robot.</p>
      </main>
    );
  }

  // --------------------------------------------------------------- filtros
  const ultimo = lim.ultimo;
  const primero = lim.primeraVenta ?? ultimo;
  const periodo = (uno(sp.p) as Periodo) in PERIODOS ? (uno(sp.p) as Periodo) : "mes";
  const [desde, hasta] = rangoPeriodo(periodo, ultimo, primero, uno(sp.d1), uno(sp.d2));
  const comparar = (uno(sp.c) as Comparar) in COMPARAR ? (uno(sp.c) as Comparar) : "ant";
  const comp = rangoComparacion(comparar, desde, hasta);
  const agrupar = (["dia", "semana", "mes"].includes(uno(sp.g) ?? "") ? uno(sp.g) : "dia") as Agrupar;
  const dias = uno(sp.ds) ? [...new Set(uno(sp.ds)!.split("").map(Number).filter((d) => d >= 0 && d <= 6))] : [0, 1, 2, 3, 4, 5, 6];
  const ventana = numero(sp.v, 14, 7, 60);
  const cobBaja = numero(sp.cb, 2, 0.5, 8);
  const cobAlta = numero(sp.ca, 13, 4, 52);
  const filtro: db.Filtro = { skus: lista(sp.prod), cadenas: lista(sp.cad), zonas: lista(sp.zona), locales: lista(sp.loc).map(Number) };

  // --------------------------------------------------------------- datos
  const [maestro, actual, previo, recientes, inv, cargas] = await Promise.all([
    db.maestros(sb),
    db.ventas(sb, desde, hasta, filtro),
    comp ? db.ventas(sb, comp[0], comp[1], filtro) : Promise.resolve([]),
    db.ventas(sb, sumarDias(ultimo, -(ventana - 1)), ultimo, filtro),
    lim.fechaInventario ? db.inventario(sb, lim.fechaInventario, filtro) : Promise.resolve([]),
    db.cargas(sb),
  ]);
  const L = filtrarDias(actual, dias);
  const LC = filtrarDias(previo, dias);
  const R = resumen(L);
  const RC = comp ? resumen(LC) : null;
  const cob = cobertura(recientes.filter((f) => f.fecha === ultimo), inv, recientes, ventana, cobBaja, cobAlta);
  const conStock = cob.filter((c) => c.inv_und > 0).length;
  const instock = cob.length ? conStock / cob.length : null;
  const invTot = cob.reduce((a, c) => a + c.inv_und, 0);
  const undDiaTot = cob.reduce((a, c) => a + c.und_dia, 0);
  const semanasTot = undDiaTot > 0 ? invTot / (undDiaTot * 7) : null;
  const quiebres = cob.filter((c) => c.estado === "quiebre" && c.und_v > 0).sort((a, b) => b.perdida_dia - a.perdida_dia);
  const perdidaDia = quiebres.reduce((a, c) => a + c.perdida_dia, 0);
  const porEstado = (Object.keys(ESTADOS) as Estado[]).map((e) => {
    const f = cob.filter((c) => c.estado === e);
    return { estado: e, filas: f.length, inv_und: f.reduce((a, c) => a + c.inv_und, 0) };
  });

  // --------------------------------------------------------------- series y tablas
  const serieA = serie(L, agrupar), serieB = comp ? serie(LC, agrupar) : [];
  const area = serieA.map((s, i) => ({ periodo: s.periodo, actual: s.venta, previo: serieB[i]?.venta ?? null }));
  const diaria = serie(L, "dia");
  const serieProd = serie(L, agrupar, true);
  const nombresProd = [...new Set(serieProd.map((s) => s.producto!))];
  const lineasProd = [...new Set(serieProd.map((s) => s.periodo))].map((p) => ({
    periodo: p, ...Object.fromEntries(nombresProd.map((n) => [n, serieProd.find((s) => s.periodo === p && s.producto === n)?.und ?? null])),
  }));
  const coloresProd = ["var(--serie-1)", "var(--serie-2)", "var(--serie-3)"];
  const porProducto = rotacionPor(L, ["producto"]).map((r) => ({
    ...r, producto: r.clave, precio: r.und ? r.venta / r.und : null, margen_pct: r.venta ? (r.venta - r.costo) / r.venta : null,
  })).sort((a, b) => b.venta - a.venta);
  const porCadena = rotacionPor(L, ["cadena"]).map((r) => ({ ...r, cadena: r.clave }));
  const porZona = rotacionPor(L, ["zona"]);
  const prodCadena = rotacionPor(L, ["producto", "cadena"]);
  const invLocal = new Map<string, number>();
  for (const c of cob) invLocal.set(c.local, (invLocal.get(c.local) ?? 0) + c.inv_und);
  const porLocal = rotacionPor(L, ["local"]).map((r) => ({ ...r, local: r.clave, margen: r.venta - r.costo, inv_und: invLocal.get(r.clave) ?? 0 }));
  const conVenta = porLocal.filter((r) => r.und > 0);
  const coberturaProducto = [...new Set(cob.map((c) => c.producto))].map((p) => {
    const f = cob.filter((c) => c.producto === p);
    const i = f.reduce((a, c) => a + c.inv_und, 0), ud = f.reduce((a, c) => a + c.und_dia, 0);
    const st = f.filter((c) => c.inv_und > 0).length;
    return { producto: p, listados: f.length, con_stock: st, instock: f.length ? st / f.length : null, inv_und: i, und_dia: ud, semanas: ud > 0 ? i / (ud * 7) : null };
  });

  const totalFila = (extra: Record<string, unknown> = {}) => ({ und: R.und, venta: R.venta, costo: R.costo, margen: R.margen, locales: R.locales, rotacion: R.rotacion, pct: R.venta ? 1 : null, ...extra });
  const archivo = (n: string) => `retail_spsa_${n}_${desde}_${hasta}.xlsx`;
  const nDias = diasEntre(desde, hasta), nConDatos = diasConDatos(L);
  const vacio = <p className="text-sm text-[var(--tenue)]">No hay ventas con estos filtros.</p>;
  const textoComp = comp ? `${fechaLarga(comp[0])} – ${fechaLarga(comp[1])}` : "";
  const rango = `${fechaLarga(desde)} – ${fechaLarga(hasta)}`;

  // --------------------------------------------------------------- encabezado
  const chips = [
    dias.length < 7 && `Días: ${dias.map((d) => DIAS_SEM[d]).join(", ")}`,
    filtro.skus.length && `Producto: ${maestro.productos.filter((p) => filtro.skus.includes(p.sku)).map((p) => p.nombre).join(", ")}`,
    filtro.cadenas.length && `Cadena: ${filtro.cadenas.join(", ")}`,
    filtro.zonas.length && `Zona: ${filtro.zonas.join(", ")}`,
    filtro.locales.length && `${filtro.locales.length} local(es)`,
  ].filter(Boolean) as string[];

  const encabezado = (
    <header className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <p className="etiqueta">Canal retail · Turrones Calderón</p>
          <h1 className="text-[28px] font-extrabold leading-tight">Supermercados Peruanos</h1>
          <p className="text-sm text-[var(--tenue)]">
            <b className="text-[var(--tinta)]">{PERIODOS[periodo]}</b> · {fechaLarga(desde)} – {fechaLarga(hasta)} · {nDias} días
            {nConDatos !== nDias && ` (${nConDatos} con venta)`}{comp && <> · comparado con {textoComp}</>} · sin IGV
          </p>
        </div>
      </div>
      <Filtros productos={maestro.productos.map((p) => ({ valor: p.sku, texto: p.nombre }))}
               cadenas={[...new Set(maestro.locales.map((l) => l.cadena))].sort()} zonas={[...new Set(maestro.locales.map((l) => l.zona))].sort()}
               ultimo={ultimo} primero={primero}
               locales={maestro.locales.map((l) => ({ valor: String(l.cod_local), texto: l.nombre, cadena: l.cadena, zona: l.zona }))} />
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => <span key={c} className="text-xs px-2.5 py-1 rounded-full bg-[var(--acento-suave)] text-[var(--acento)] font-medium">{c}</span>)}
        </div>
      )}
    </header>
  );

  // --------------------------------------------------------------- secciones
  const indicadores = (
    <div className="grid gap-4 grid-cols-1 @lg:grid-cols-2 @4xl:grid-cols-3 @7xl:grid-cols-6">
      <Indicador comparadoCon={COMPARAR[comparar].toLowerCase()} info="venta" icono="venta" titulo="Venta al público" valor={soles(R.venta)} variacion={variacion(R.venta, RC?.venta)}
                 tendencia={diaria.map((d) => d.venta)} ayuda="Lo que pagó el consumidor final, sin IGV." />
      <Indicador comparadoCon={COMPARAR[comparar].toLowerCase()} info="ingreso" icono="ingreso" titulo="Ingreso Calderón" valor={soles(R.costo)} variacion={variacion(R.costo, RC?.costo)}
                 tendencia={diaria.map((d) => d.costo)} ayuda="Venta a costo del portal: lo que SPSA paga a Calderón por lo vendido, sin IGV." />
      <Indicador comparadoCon={COMPARAR[comparar].toLowerCase()} info="unidades" icono="unidades" titulo="Unidades vendidas" valor={entero(R.und)} variacion={variacion(R.und, RC?.und)}
                 tendencia={diaria.map((d) => d.und)} />
      <Indicador comparadoCon={COMPARAR[comparar].toLowerCase()} info="rotacion" icono="rotacion" titulo="Und por local / semana" valor={decimal1(R.rotacion)} variacion={variacion(R.rotacion, RC?.rotacion)}
                 detalle={`${R.locales} locales con venta`} ayuda="Unidades ÷ locales con venta ÷ semanas del periodo." />
      <Indicador comparadoCon={COMPARAR[comparar].toLowerCase()} info="instock" icono="instock" titulo="Instock" valor={porcentaje(instock)} detalle={`${conStock} de ${cob.length} con stock`}
                 ayuda="Locales-producto con inventario mayor a cero." />
      <Indicador comparadoCon={COMPARAR[comparar].toLowerCase()} info="cobertura" icono="cobertura" titulo="Semanas de cobertura" valor={decimal1(semanasTot)} detalle={`${entero(invTot)} und en tienda`}
                 ayuda={`Inventario ÷ venta semanal promedio de los últimos ${ventana} días.`} />
    </div>
  );

  const alertas = (
    <ul className="grid gap-2">
      {(["quiebre", "sin", "bajo", "sobre"] as Estado[]).map((e) => {
        const d = porEstado.find((x) => x.estado === e)!;
        const Icono = ICONO_ESTADO[e];
        return (
          <li key={e} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--linea)] px-3 py-2.5">
            <span className="flex items-center gap-2.5 text-sm">
              <span className={`grid place-items-center size-8 rounded-lg estado-${e}`}><Icono size={15} aria-hidden /></span>
              <span className="grid leading-tight"><b className="font-medium">{ESTADOS[e]}</b>
                <span className="text-xs text-[var(--tenue)]">{entero(d.inv_und)} und en stock</span></span>
            </span>
            <b className="num text-lg">{d.filas}</b>
          </li>
        );
      })}
    </ul>
  );

  const seccionResumen = (
    <>
      {indicadores}
      {L.length === 0 ? vacio : (
        <>
          <div className="grid gap-4 @5xl:grid-cols-3">
            <Tarjeta className="@5xl:col-span-2" info="evolucion" icono={ChartLine} titulo={`Venta al público · ${rango}`}
                     subtitulo={`Por ${agrupar === "dia" ? "día" : agrupar}${comp ? ` · línea punteada: ${COMPARAR[comparar].toLowerCase()} (${textoComp})` : ""}`}>
              <AreaVentas datos={area} agrupar={agrupar} conPrevio={!!comp && LC.length > 0} nombrePrevio={COMPARAR[comparar]} />
            </Tarjeta>
            <Tarjeta info="mix" icono={PieChart} titulo="Mix por producto" subtitulo="Participación en la venta al público">
              <Dona datos={porProducto.map((p) => ({ nombre: p.producto, valor: p.venta }))} total={R.venta} etiquetaTotal="Venta total" />
            </Tarjeta>
          </div>
          <div className="grid gap-4 @3xl:grid-cols-2 @6xl:grid-cols-3">
            <Tarjeta info="ventaCadena" icono={Store} titulo="Venta por cadena" subtitulo={`Venta al público · ${rango}`}>
              <ListaBarras formato={(v) => soles(v)} filas={[...porCadena].sort((a, b) => b.venta - a.venta)
                .map((c) => ({ etiqueta: c.cadena, valor: c.venta, detalle: `${c.locales} locales · ${entero(c.und)} und` }))} />
            </Tarjeta>
            <Tarjeta info="rotacion" icono={MapPinned} titulo="Rotación por zona" subtitulo="Unidades por local por semana">
              <ListaBarras formato={(v) => decimal1(v)} filas={porZona.map((z) => ({ etiqueta: z.clave, valor: z.rotacion ?? 0, detalle: `${z.locales} locales` }))} />
            </Tarjeta>
            <Tarjeta info="estadoStock" icono={TriangleAlert} titulo="Alertas de stock" subtitulo={`Locales-producto · inventario al ${lim.fechaInventario ? fechaLarga(lim.fechaInventario) : "—"}`}>
              {alertas}
            </Tarjeta>
          </div>
          <div className="grid gap-4 @5xl:grid-cols-2">
            <Tarjeta icono={Banknote} titulo={`Venta por ${agrupar === "dia" ? "día" : agrupar}`} subtitulo={rango}>
              <Tabla archivo={archivo("venta_diaria")} hoja="Venta" alto={420}
                     filas={[...serieA].reverse().map((s) => ({ ...s, periodo: fechaLarga(s.periodo), dia: agrupar === "dia" ? DIAS_SEM[diaSemana(s.periodo)] : "" }))}
                     columnas={[{ clave: "periodo", titulo: agrupar === "dia" ? "Día" : agrupar === "semana" ? "Semana (lunes)" : "Mes", tipo: "texto" },
                       ...(agrupar === "dia" ? [{ clave: "dia", titulo: "", tipo: "texto" } as Columna] : []), COL.und, COL.venta, COL.costo]}
                     total={{ periodo: "TOTAL", ...totalFila() }} />
            </Tarjeta>
            <Tarjeta icono={Store} titulo="Top 10 locales" subtitulo={`Por venta al público · ${rango}`}>
              <Tabla archivo={archivo("top_locales")} hoja="Top locales" alto={420}
                     filas={[...porLocal].sort((a, b) => b.venta - a.venta).slice(0, 10)}
                     columnas={[COL.local, COL.cadena, COL.und, COL.venta, COL.rotacion]} />
            </Tarjeta>
          </div>
        </>
      )}
    </>
  );

  const seccionRotacion = (
    <>
      <Encabezado titulo="Rotación" descripcion={<>Unidades por local por semana: qué tan bien vende el producto donde ya está. Promedio del periodo:{" "}
        <b className="num text-[var(--tinta)]">{decimal1(R.rotacion)}</b> en {R.locales} locales con venta.</>} />
      {L.length === 0 ? vacio : (
        <>
          <div className="grid gap-4 @3xl:grid-cols-2">
            <Tarjeta info="rotacion" icono={Store} titulo="Por cadena" subtitulo="Und/local/semana">
              <ListaBarras formato={(v) => decimal1(v)} filas={porCadena.map((c) => ({ etiqueta: c.cadena, valor: c.rotacion ?? 0, detalle: `${c.locales} locales` }))} />
            </Tarjeta>
            <Tarjeta info="rotacion" icono={MapPinned} titulo="Por zona" subtitulo="Und/local/semana">
              <ListaBarras formato={(v) => decimal1(v)} filas={porZona.map((z) => ({ etiqueta: z.clave, valor: z.rotacion ?? 0, detalle: `${z.locales} locales` }))} />
            </Tarjeta>
          </div>
          <Tarjeta icono={Gauge} titulo="Producto y cadena">
            <Tabla archivo={archivo("rotacion")} hoja="Rotación" filas={prodCadena}
                   columnas={[COL.producto, COL.cadena, COL.rotacion, COL.locales, COL.und, COL.venta, COL.pct]} total={{ producto: "TOTAL", ...totalFila() }} />
          </Tarjeta>
          <div className="grid gap-4 @4xl:grid-cols-2">
            <Tarjeta titulo="Mayor rotación" subtitulo="Los 10 locales que más rotan">
              <Tabla archivo={archivo("mayor_rotacion")} hoja="Mayor rotación" filas={conVenta.slice(0, 10)} columnas={[COL.local, COL.cadena, COL.rotacion, COL.und]} />
            </Tarjeta>
            <Tarjeta titulo="Menor rotación" subtitulo="Los 10 locales que menos rotan (con alguna venta)">
              <Tabla archivo={archivo("menor_rotacion")} hoja="Menor rotación" filas={conVenta.slice(-10).reverse()} columnas={[COL.local, COL.cadena, COL.rotacion, COL.und]} />
            </Tarjeta>
          </div>
        </>
      )}
    </>
  );

  const seccionEvolucion = (
    <>
      <Encabezado titulo="Evolución" descripcion="Venta del periodo por día, semana o mes, comparada con el periodo elegido." />
      {L.length === 0 ? vacio : (
        <>
          <Tarjeta info="evolucion" icono={ChartLine} titulo={`Venta al público · ${rango}`} subtitulo={comp ? `Línea punteada: ${COMPARAR[comparar].toLowerCase()} (${textoComp})` : undefined}>
            <AreaVentas datos={area} agrupar={agrupar} conPrevio={!!comp && LC.length > 0} nombrePrevio={COMPARAR[comparar]} />
          </Tarjeta>
          <Tarjeta icono={Banknote} titulo={`Detalle por ${agrupar === "dia" ? "día" : agrupar}`}>
            <Tabla archivo={archivo("evolucion")} hoja="Evolución" filas={serieA.map((s) => ({ ...s, margen: s.venta - s.costo, periodo: fechaLarga(s.periodo) }))}
                   columnas={[{ clave: "periodo", titulo: agrupar === "dia" ? "Día" : agrupar === "semana" ? "Semana (lunes)" : "Mes", tipo: "texto" }, COL.und, COL.venta, COL.costo, COL.margen]}
                   total={{ periodo: "TOTAL", ...totalFila() }} />
          </Tarjeta>
        </>
      )}
    </>
  );

  const seccionProductos = (
    <>
      <Encabezado titulo="Productos" descripcion="Unidades, precio promedio de venta al público y margen del retailer por producto." />
      {L.length === 0 ? vacio : (
        <>
          <div className="grid gap-4 @5xl:grid-cols-3">
            <Tarjeta className="@5xl:col-span-2" icono={ChartLine} titulo={`Unidades por ${agrupar === "dia" ? "día" : agrupar}`}>
              <Lineas datos={lineasProd} agrupar={agrupar} series={nombresProd.map((n, i) => ({ clave: n, nombre: n, color: coloresProd[i % 3] }))} />
            </Tarjeta>
            <Tarjeta info="mix" icono={PieChart} titulo="Mix en unidades">
              <Dona datos={porProducto.map((p) => ({ nombre: p.producto, valor: p.und }))} total={R.und} etiquetaTotal="Unidades" formato="entero" />
            </Tarjeta>
          </div>
          <Tarjeta icono={Package} titulo="Resumen por producto">
            <Tabla archivo={archivo("productos")} hoja="Productos" filas={porProducto}
                   columnas={[COL.producto, COL.und, COL.venta, COL.costo, { clave: "precio", titulo: "Precio prom. público S/", tipo: "decimal2", info: "precio" },
                     { clave: "margen_pct", titulo: "Margen SPSA", tipo: "porcentaje", info: "margen" }, COL.pct]}
                   total={{ producto: "TOTAL", ...totalFila({ precio: R.und ? R.venta / R.und : null, margen_pct: R.venta ? R.margen / R.venta : null }) }} />
          </Tarjeta>
        </>
      )}
    </>
  );

  const seccionLocales = (
    <>
      <Encabezado titulo="Cadenas y locales" descripcion="Venta, rotación e inventario de cada local del periodo." />
      {L.length === 0 ? vacio : (
        <>
          <Tarjeta info="ventaCadena" icono={Store} titulo="Venta por cadena">
            <ListaBarras formato={(v) => soles(v)} filas={[...porCadena].sort((a, b) => b.venta - a.venta)
              .map((c) => ({ etiqueta: `${c.cadena} · ${c.locales} locales`, valor: c.venta }))} />
          </Tarjeta>
          <Tarjeta icono={Store} titulo="Locales" subtitulo={`${porLocal.length} locales`}>
            <Tabla archivo={archivo("locales")} hoja="Locales" alto={560} buscar filas={[...porLocal].sort((a, b) => b.venta - a.venta)}
                   columnas={[COL.local, COL.cadena, COL.zona, COL.und, COL.rotacion, COL.venta, COL.costo, COL.margen, { clave: "inv_und", titulo: "Inventario und", tipo: "entero" }]}
                   total={{ local: "TOTAL", ...totalFila({ inv_und: invTot }) }} />
          </Tarjeta>
        </>
      )}
    </>
  );

  const seccionStock = (
    <>
      <Encabezado titulo="Stock y quiebres" descripcion={<>Foto de inventario al {lim.fechaInventario ? fechaLarga(lim.fechaInventario) : "—"}. Semanas de cobertura = inventario ÷
        (venta promedio por día de los últimos {ventana} días × 7). Baja: menos de {cobBaja} · Sobrestock: más de {cobAlta}.</>} />
      {cob.length === 0 ? <p className="text-sm">Todavía no hay inventario cargado.</p> : (
        <>
          <div className="grid gap-4 grid-cols-1 @2xl:grid-cols-3">
            <Indicador comparadoCon={COMPARAR[comparar].toLowerCase()} info="instock" icono="instock" titulo="Instock" valor={porcentaje(instock)} detalle={`${conStock} de ${cob.length} locales-producto`} />
            <Indicador comparadoCon={COMPARAR[comparar].toLowerCase()} info="cobertura" icono="cobertura" titulo="Semanas de cobertura" valor={decimal1(semanasTot)} detalle={`${entero(invTot)} und en tienda`} />
            <Indicador comparadoCon={COMPARAR[comparar].toLowerCase()} info="perdida" icono="venta" titulo="Venta perdida por quiebres" valor={soles(perdidaDia)}
                       detalle={quiebres.length ? `por día · ${quiebres.length} quiebres` : "Sin quiebres"} />
          </div>
          <div className="grid gap-4 @5xl:grid-cols-3">
            <Tarjeta info="estadoStock" icono={TriangleAlert} titulo="Estado del stock">{alertas}</Tarjeta>
            <Tarjeta className="@5xl:col-span-2" info="cobertura" icono={Timer} titulo="Cobertura por producto">
              <Tabla archivo={archivo("cobertura_producto")} hoja="Cobertura" filas={coberturaProducto}
                     columnas={[COL.producto, { clave: "listados", titulo: "Locales", tipo: "entero" }, { clave: "instock", titulo: "Instock", tipo: "porcentaje", info: "instock" },
                       { clave: "inv_und", titulo: "Inventario und", tipo: "entero" }, { clave: "und_dia", titulo: `Venta und/día (${ventana} d)`, tipo: "decimal1", info: "ventaDia" },
                       { clave: "semanas", titulo: "Semanas", tipo: "decimal1", info: "cobertura" }]} />
            </Tarjeta>
          </div>
          {quiebres.length > 0 && (
            <Tarjeta info="perdida" icono={PackageX} titulo="Quiebres a reponer primero" subtitulo="Ordenados por venta perdida por día">
              <Tabla archivo={archivo("quiebres")} hoja="Quiebres" filas={quiebres}
                     columnas={[COL.local, COL.cadena, COL.producto, { clave: "und_dia", titulo: "Venta und/día", tipo: "decimal2", info: "ventaDia" },
                       { clave: "perdida_dia", titulo: "Venta perdida S/ por día", tipo: "soles", info: "perdida" }]} />
            </Tarjeta>
          )}
          <Tarjeta info="cobertura" icono={Warehouse} titulo="Cobertura por local y producto">
            <Tabla archivo={archivo("cobertura")} hoja="Cobertura" alto={620} buscar
                   filas={[...cob].sort((a, b) => (b.semanas ?? Infinity) - (a.semanas ?? Infinity))}
                   columnas={[COL.local, COL.cadena, COL.zona, COL.producto, { clave: "inv_und", titulo: "Inventario", tipo: "entero" },
                     { clave: "und_v", titulo: `Venta ${ventana} d`, tipo: "entero" }, { clave: "und_dia", titulo: "Und/día", tipo: "decimal2", info: "ventaDia" },
                     { clave: "semanas", titulo: "Semanas", tipo: "decimal1", info: "cobertura" }, { clave: "estado", titulo: "Estado", tipo: "estado", info: "estadoStock" }]} />
          </Tarjeta>
        </>
      )}
    </>
  );

  const seccionCargas = (
    <>
      <Encabezado titulo="Cargas" descripcion="Cada día cargado desde el portal de Intercorp. El detalle por local solo se guarda si cuadra al céntimo con el TOTAL del portal." />
      <Tarjeta info="cargas" icono={Clock} titulo="Historial de cargas">
        <Tabla archivo="retail_spsa_cargas.xlsx" hoja="Cargas" alto={620} buscar filas={cargas}
               columnas={[{ clave: "cuando", titulo: "Cargado", tipo: "texto" }, { clave: "fecha", titulo: "Día", tipo: "texto" },
                 { clave: "nivel", titulo: "Nivel", tipo: "texto" }, { clave: "estado", titulo: "Estado", tipo: "texto" },
                 { clave: "filas", titulo: "Filas", tipo: "entero" }, COL.und, { clave: "venta", titulo: "Venta S/", tipo: "soles" },
                 { clave: "detalle", titulo: "Detalle", tipo: "texto" }]} />
      </Tarjeta>
    </>
  );

  return (
    <Marco encabezado={encabezado} usuario={user?.email} salir={salir} datosAl={fechaLarga(ultimo)} secciones={[
      { id: "resumen", titulo: "Resumen", contenido: seccionResumen },
      { id: "rotacion", titulo: "Rotación", contenido: seccionRotacion },
      { id: "evolucion", titulo: "Evolución", contenido: seccionEvolucion },
      { id: "productos", titulo: "Productos", contenido: seccionProductos },
      { id: "locales", titulo: "Cadenas y locales", contenido: seccionLocales },
      { id: "stock", titulo: "Stock y quiebres", contenido: seccionStock },
      { id: "cargas", titulo: "Cargas", contenido: seccionCargas },
    ]} />
  );
}
