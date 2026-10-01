import {
  CalendarDays, CircleAlert, MapPinned, Package, PackageX, PieChart, Store, Timer, TriangleAlert, Warehouse,
} from "lucide-react";
import { salir } from "@/app/login/actions";
import { Filtros } from "@/components/Filtros";
import { Dona, GraficoTendencia, Indicador } from "@/components/Graficos";
import { Marco } from "@/components/Marco";
import { Pestanas } from "@/components/Pestanas";
import { Tabla, type Columna } from "@/components/Tabla";
import { VolumenValor, type FilaVV } from "@/components/VolumenValor";
import { Encabezado, FranjaComparacion, ListaBarras, Tarjeta } from "@/components/ui";
import * as db from "@/lib/datos";
import { decimal1, entero, porcentaje, soles } from "@/lib/formato";
import {
  cobertura, diasConDatos, ESTADOS, filtrarDias, resumen, rotacionPor, serie, type Agrupar, type Estado,
} from "@/lib/kpi";
import {
  COMPARAR, COMPARAR_CORTO, DIAS_SEM, diaSemana, diasEntre, fechaLarga, PERIODOS, rangoComparacion, rangoPeriodo, sumarDias, type Comparar, type Periodo,
} from "@/lib/periodos";
import { conciliacionSPSA, tiposRetail } from "@/lib/retail";
import { seccionConciliacion } from "./conciliacion";
import { clienteSupabase } from "@/lib/supabase/server";
import { ResumenEjecutivo } from "@/components/ResumenEjecutivo";
import { CONFIG, datosEjecutivo } from "@/lib/ejecutivo";


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

export const metadata = { title: "Supermercados SPSA · Calderón" };

export default async function SupermercadosSPSA({ searchParams }: { searchParams: Params }) {
  const sp = await searchParams;
  const sb = await clienteSupabase();
  const { data: { user } } = await sb.auth.getUser();
  const [lim, tipos] = await Promise.all([db.limites(sb), tiposRetail(sb)]);

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
  const comparar = (uno(sp.c) as Comparar) in COMPARAR ? (uno(sp.c) as Comparar) : "anio";
  const comp = rangoComparacion(comparar, desde, hasta);
  const agrupar = (["dia", "semana", "mes"].includes(uno(sp.g) ?? "") ? uno(sp.g) : "dia") as Agrupar;
  const dias = uno(sp.ds) ? [...new Set(uno(sp.ds)!.split("").map(Number).filter((d) => d >= 0 && d <= 6))] : [0, 1, 2, 3, 4, 5, 6];
  const ventana = numero(sp.v, 14, 7, 60);
  const cobBaja = numero(sp.cb, 2, 0.5, 8);
  const cobAlta = numero(sp.ca, 13, 4, 52);
  const filtro: db.Filtro = { skus: lista(sp.prod), cadenas: lista(sp.cad), zonas: lista(sp.zona), locales: lista(sp.loc).map(Number) };

  // --------------------------------------------------------------- datos
  const [maestro, actual, previo, recientes, inv, ej] = await Promise.all([
    db.maestros(sb),
    db.ventas(sb, desde, hasta, filtro),
    comp ? db.ventas(sb, comp[0], comp[1], filtro) : Promise.resolve([]),
    db.ventas(sb, sumarDias(ultimo, -(ventana - 1)), ultimo, filtro),
    lim.fechaInventario ? db.inventario(sb, lim.fechaInventario, filtro) : Promise.resolve([]),
    datosEjecutivo(sb, "spsa", desde, hasta, { sku: filtro.skus, cadena: filtro.cadenas, zona: filtro.zonas, local: filtro.locales, dias }),
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
  // Periodo actual y comparación alineados por posición (día 1 con día 1), para el gráfico principal.
  const tendencia = serieA.map((s, i) => ({
    periodo: s.periodo, venta: s.venta, costo: s.costo, und: s.und,
    venta_c: serieB[i]?.venta ?? null, costo_c: serieB[i]?.costo ?? null, und_c: serieB[i]?.und ?? null,
  }));
  const porProducto = rotacionPor(L, ["producto"]).map((r) => ({
    ...r, producto: r.clave, precio: r.und ? r.venta / r.und : null, margen_pct: r.venta ? (r.venta - r.costo) / r.venta : null,
  })).sort((a, b) => b.venta - a.venta);
  const porCadena = rotacionPor(L, ["cadena"]).map((r) => ({ ...r, cadena: r.clave }));
  const porZona = rotacionPor(L, ["zona"]);

  // Una fila por local: venta del periodo + stock actual y su cobertura (ritmo de los últimos N días).
  const stockLocal = new Map<string, { inv: number; undV: number; undDia: number }>();
  for (const c of cob) {
    const s = stockLocal.get(c.local) ?? { inv: 0, undV: 0, undDia: 0 };
    s.inv += c.inv_und; s.undV += c.und_v; s.undDia += c.und_dia;
    stockLocal.set(c.local, s);
  }
  const estadoDe = (inv: number, undV: number, semanas: number | null): Estado =>
    inv <= 0 ? "quiebre" : undV <= 0 ? "sin" : (semanas ?? 0) < cobBaja ? "bajo" : (semanas ?? 0) > cobAlta ? "sobre" : "ok";
  const porLocal = rotacionPor(L, ["local"]).map((r) => {
    const s = stockLocal.get(r.clave);
    const semanas = s && s.undDia > 0 ? s.inv / (s.undDia * 7) : null;
    return { ...r, local: r.clave, inv_und: s?.inv ?? null, semanas, estado: s ? estadoDe(s.inv, s.undV, semanas) : null };
  }).sort((a, b) => b.venta - a.venta);
  // Volumen vs valor: unidades e ingreso por cadena, zona, local y producto.
  const aVV = (claves: Parameters<typeof rotacionPor>[1]): FilaVV[] =>
    rotacionPor(L, claves).map((r) => ({ nombre: r.clave, und: r.und, venta: r.venta, costo: r.costo, locales: r.locales }));
  const volumenValor = { cadena: aVV(["cadena"]), zona: aVV(["zona"]), local: aVV(["local"]), producto: aVV(["producto"]) };
  const coberturaProducto = [...new Set(cob.map((c) => c.producto))].map((p) => {
    const f = cob.filter((c) => c.producto === p);
    const i = f.reduce((a, c) => a + c.inv_und, 0), ud = f.reduce((a, c) => a + c.und_dia, 0);
    const st = f.filter((c) => c.inv_und > 0).length;
    return { producto: p, listados: f.length, instock: f.length ? st / f.length : null, inv_und: i, und_dia: ud, semanas: ud > 0 ? i / (ud * 7) : null };
  });

  const totalFila = (extra: Record<string, unknown> = {}) => ({ und: R.und, venta: R.venta, costo: R.costo, margen: R.margen, locales: R.locales, rotacion: R.rotacion, pct: R.venta ? 1 : null, ...extra });
  const archivo = (n: string) => `retail_spsa_${n}_${desde}_${hasta}.xlsx`;
  const nDias = diasEntre(desde, hasta), nConDatos = diasConDatos(L);
  const vacio = <p className="text-sm text-[var(--tenue)]">No hay ventas con estos filtros.</p>;
  const rango = `${fechaLarga(desde)} – ${fechaLarga(hasta)}`;
  const unidadPeriodo = agrupar === "dia" ? "día" : agrupar;

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
          <p className="etiqueta">Retail · Supermercados · Turrones Calderón</p>
          <h1 className="text-[28px] font-bold leading-tight">Supermercados Peruanos</h1>
          <p className="text-sm text-[var(--tenue)]">
            <b className="text-[var(--tinta)]">{PERIODOS[periodo]}</b> · {fechaLarga(desde)} – {fechaLarga(hasta)} · {nDias} días
            {nConDatos !== nDias && ` (${nConDatos} con venta)`} · sin IGV
          </p>
        </div>
      </div>
      <Filtros ultimo={ultimo} primero={primero} stock grupos={[
        { clave: "prod", etiqueta: "Producto", opciones: maestro.productos.map((p) => ({ valor: p.sku, texto: p.nombre })) },
        { clave: "cad", etiqueta: "Cadena", opciones: [...new Set(maestro.locales.map((l) => l.cadena))].sort().map((c) => ({ valor: c, texto: c })), limpia: ["loc"] },
        { clave: "zona", etiqueta: "Zona", opciones: [...new Set(maestro.locales.map((l) => l.zona))].sort().map((z) => ({ valor: z, texto: z })), limpia: ["loc"] },
        { clave: "loc", etiqueta: "Local", buscar: true,
          opciones: maestro.locales.map((l) => ({ valor: String(l.cod_local), texto: l.nombre, padres: { cad: l.cadena, zona: l.zona } })) },
      ]} />
      <FranjaComparacion desde={desde} hasta={hasta} comp={comp} tipo={comparar} hayDatos={LC.length > 0} />
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
      <Indicador comparadoCon={COMPARAR_CORTO[comparar]} info="venta" icono="venta" titulo="Venta al público" valor={soles(R.venta)} variacion={variacion(R.venta, RC?.venta)}
                 ayuda="Lo que pagó el consumidor final, sin IGV." />
      <Indicador comparadoCon={COMPARAR_CORTO[comparar]} info="ingreso" icono="ingreso" titulo="Ingreso Calderón" valor={soles(R.costo)} variacion={variacion(R.costo, RC?.costo)}
                 ayuda="Venta a costo del portal: lo que SPSA paga a Calderón por lo vendido, sin IGV." />
      <Indicador comparadoCon={COMPARAR_CORTO[comparar]} info="unidades" icono="unidades" titulo="Unidades vendidas" valor={entero(R.und)} variacion={variacion(R.und, RC?.und)} />
      <Indicador comparadoCon={COMPARAR_CORTO[comparar]} info="rotacion" icono="rotacion" titulo="Und por local / semana" valor={decimal1(R.rotacion)} variacion={variacion(R.rotacion, RC?.rotacion)}
                 detalle={`${R.locales} locales con venta`} ayuda="Unidades ÷ locales con venta ÷ semanas del periodo." />
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

  // Ventas: sumas generales y gráficos.
  const seccionVentas = (
    <>
      {indicadores}
      {L.length === 0 ? vacio : (
        <>
          <div className="grid gap-4 @5xl:grid-cols-3">
            <div className="@5xl:col-span-2 min-w-0">
              <GraficoTendencia datos={tendencia} agrupar={agrupar} conPrevio={!!comp && LC.length > 0} nombrePrevio={COMPARAR[comparar]} rango={rango} />
            </div>
            <Tarjeta info="ventaCadena" icono={Store} titulo="Venta por cadena" subtitulo={rango}>
              <ListaBarras formato={(v) => `${soles(v)} · ${porcentaje(R.venta ? v / R.venta : 0)}`} filas={[...porCadena].sort((a, b) => b.venta - a.venta)
                .map((c) => ({ etiqueta: `${c.cadena} · ${c.locales} ${c.locales === 1 ? "local" : "locales"}`, valor: c.venta,
                               detalle: `${c.locales} locales con venta · ${entero(c.und)} und` }))} />
              <p className="text-xs text-[var(--tenue)]">Junto a cada cadena: cuántos de sus locales vendieron en el periodo. A la derecha: su venta y su % del total.</p>
            </Tarjeta>
          </div>
          <div className="grid gap-4 @5xl:grid-cols-3">
            <Tarjeta className="@5xl:col-span-2" info="evolucion" icono={CalendarDays} titulo={`Detalle por ${unidadPeriodo}`} subtitulo={rango}>
              <Tabla archivo={archivo("detalle")} hoja="Detalle" alto={360}
                     filas={[...serieA].reverse().map((s) => ({ ...s, margen: s.venta - s.costo, dia: agrupar === "dia" ? DIAS_SEM[diaSemana(s.periodo)] : "", periodo: fechaLarga(s.periodo) }))}
                     columnas={[{ clave: "periodo", titulo: agrupar === "dia" ? "Día" : agrupar === "semana" ? "Semana (lunes)" : "Mes", tipo: "texto" },
                       ...(agrupar === "dia" ? [{ clave: "dia", titulo: "", tipo: "texto" } as Columna] : []), COL.und, COL.venta, COL.costo, COL.margen]}
                     total={{ periodo: "TOTAL", ...totalFila() }} />
            </Tarjeta>
            <Tarjeta info="mix" icono={PieChart} titulo="Mix de venta por producto" subtitulo={rango}>
              <Dona datos={porProducto.map((p) => ({ nombre: p.producto, valor: p.venta }))} total={R.venta} etiquetaTotal="Venta total" />
            </Tarjeta>
          </div>
        </>
      )}
    </>
  );

  // Volumen vs valor: ¿quién vende más unidades y quién deja más dinero?
  const detalleValor = (
    <>
      <p className="text-sm text-[var(--tenue)] max-w-3xl">Quién vende más unidades y quién deja más dinero a Calderón. Sirve para ver
        oportunidades: lugares que venden mucho pero dejan poco por unidad (mejorar el mix) y lugares que dejan mucho por unidad pero venden poco
        (ganar volumen). El dinero es el <b>ingreso Calderón</b>; el portal no trae el costo de producción, así que no es la ganancia neta.</p>
      {L.length === 0 ? vacio : <VolumenValor datos={volumenValor} archivo={archivo("volumen_valor")} />}
    </>
  );

  // Locales: ¿dónde vende mejor y dónde no?
  const detalleLocales = (
    <>
      <p className="text-sm text-[var(--tenue)] max-w-3xl">Qué tan bien vende cada local y cuánto stock le queda. Ordena la tabla por cualquier columna
        (por ejemplo, por <b>Und/local/semana</b> para ver los mejores y peores). Rotación promedio del periodo:{" "}
        <b className="num text-[var(--tinta)]">{decimal1(R.rotacion)}</b> und por local por semana.</p>
      {L.length === 0 ? vacio : (
        <>
          <div className="grid gap-4 @3xl:grid-cols-2">
            <Tarjeta info="rotacion" icono={Store} titulo="Rotación por cadena" subtitulo="Unidades por local por semana">
              <ListaBarras formato={(v) => decimal1(v)} filas={porCadena.map((c) => ({ etiqueta: `${c.cadena} · ${c.locales} locales`, valor: c.rotacion ?? 0 }))} />
            </Tarjeta>
            <Tarjeta info="rotacion" icono={MapPinned} titulo="Rotación por zona" subtitulo="Unidades por local por semana">
              <ListaBarras formato={(v) => decimal1(v)} filas={porZona.map((z) => ({ etiqueta: `${z.clave} · ${z.locales} locales`, valor: z.rotacion ?? 0 }))} />
            </Tarjeta>
          </div>
          <Tarjeta icono={Store} titulo="Todos los locales" subtitulo={`${porLocal.length} locales · venta de ${rango} · stock al ${lim.fechaInventario ? fechaLarga(lim.fechaInventario) : "—"}`}>
            <Tabla archivo={archivo("locales")} hoja="Locales" alto={620} buscar filas={porLocal}
                   columnas={[COL.local, COL.cadena, COL.zona, COL.und, COL.rotacion, COL.venta, COL.costo,
                     { clave: "inv_und", titulo: "Inventario", tipo: "entero", info: "cobertura" },
                     { clave: "semanas", titulo: "Semanas", tipo: "decimal1", info: "cobertura" },
                     { clave: "estado", titulo: "Estado", tipo: "estado", info: "estadoStock" }]}
                   total={{ local: "TOTAL", ...totalFila({ inv_und: invTot, semanas: semanasTot }) }} />
          </Tarjeta>
        </>
      )}
    </>
  );

  // Productos: ¿qué formato funciona?
  const detalleProductos = (
    <>
      <p className="text-sm text-[var(--tenue)] max-w-3xl">Cuánto aporta cada formato, a qué precio se vende al público y cuánto gana el supermercado con él.</p>
      {L.length === 0 ? vacio : (
          <Tarjeta icono={Package} titulo="Por producto" subtitulo={rango}>
            <Tabla archivo={archivo("productos")} hoja="Productos" filas={porProducto}
                   columnas={[COL.producto, COL.und, COL.rotacion, COL.venta, COL.costo, { clave: "precio", titulo: "Precio prom. público S/", tipo: "decimal2", info: "precio" },
                     { clave: "margen_pct", titulo: "Margen SPSA", tipo: "porcentaje", info: "margen" }, COL.pct]}
                   total={{ producto: "TOTAL", ...totalFila({ precio: R.und ? R.venta / R.und : null, margen_pct: R.venta ? R.margen / R.venta : null }) }} />
          </Tarjeta>
      )}
    </>
  );

  // Detalle de ventas: lo mismo, abierto por local, por producto y volumen vs valor.
  const seccionDetalle = (
    <>
      <Encabezado titulo="Detalle de ventas" descripcion={<>La venta del periodo abierta por local, por producto y por su valor. {rango}.</>} />
      <Pestanas pestanas={[
        { id: "locales", titulo: "Por local", contenido: detalleLocales },
        { id: "productos", titulo: "Por producto", contenido: detalleProductos },
        { id: "valor", titulo: "Volumen vs valor", contenido: detalleValor },
      ]} />
    </>
  );

  // Stock: ¿dónde reponer y dónde dejar de enviar?
  const seccionStock = (
    <>
      <Encabezado titulo="Stock y quiebres" descripcion={<>Inventario al {lim.fechaInventario ? fechaLarga(lim.fechaInventario) : "—"} frente al ritmo de venta de los
        últimos {ventana} días. Reponer primero los quiebres; no enviar más a los locales en sobrestock.</>} />
      {cob.length === 0 ? <p className="text-sm">Todavía no hay inventario cargado.</p> : (
        <>
          <div className="grid gap-4 grid-cols-1 @2xl:grid-cols-3">
            <Indicador info="instock" icono="instock" titulo="Instock" valor={porcentaje(instock)} detalle={`${conStock} de ${cob.length} locales-producto`} />
            <Indicador info="cobertura" icono="cobertura" titulo="Semanas de cobertura" valor={decimal1(semanasTot)} detalle={`${entero(invTot)} und en tienda`} />
            <Indicador info="perdida" icono="venta" titulo="Venta perdida por quiebres" valor={soles(perdidaDia)}
                       detalle={quiebres.length ? `por día · ${quiebres.length} quiebres` : "Sin quiebres"} />
          </div>
          <div className="grid gap-4 @5xl:grid-cols-3">
            <Tarjeta info="estadoStock" icono={TriangleAlert} titulo="Estado del stock">{alertas}</Tarjeta>
            <Tarjeta className="@5xl:col-span-2" info="cobertura" icono={Timer} titulo="Por producto">
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
          <Tarjeta info="cobertura" icono={Warehouse} titulo="Por local y producto" subtitulo="Filtra escribiendo el local o el estado (por ejemplo «Sobrestock»)">
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

  return (
    <Marco seccion={sp.s} ubicacion="retail/spsa" tiposRetail={tipos} encabezado={encabezado} usuario={user?.email} salir={salir} datosAl={fechaLarga(ultimo)} secciones={[
{ id: "ejecutivo", titulo: "Resumen ejecutivo", contenido: <ResumenEjecutivo datos={ej} desde={desde} hasta={hasta} config={CONFIG.spsa} archivo="spsa_ejecutivo" /> },
      { id: "ventas", titulo: "Ventas", contenido: seccionVentas },
      { id: "detalle", titulo: "Detalle de ventas", contenido: seccionDetalle },
      { id: "stock", titulo: "Stock y quiebres", contenido: seccionStock },
      { id: "despachos", titulo: "Despachado vs vendido", contenido: seccionConciliacion(await conciliacionSPSA(sb)) },
    ]} />
  );
}
