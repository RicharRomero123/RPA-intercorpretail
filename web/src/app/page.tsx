import { salir } from "@/app/login/actions";
import { Filtros } from "@/components/Filtros";
import { BarrasH, BarrasSerie, Lineas } from "@/components/Graficos";
import { Pestanas } from "@/components/Pestanas";
import { Tabla, type Columna } from "@/components/Tabla";
import * as db from "@/lib/datos";
import { decimal1, entero, porcentaje, soles } from "@/lib/formato";
import {
  acumulado, cobertura, diasConDatos, ESTADOS, filtrarDias, resumen, rotacionPor, serie, type Agrupar, type Estado,
} from "@/lib/kpi";
import {
  COMPARAR, DIAS_SEM, diasEntre, fechaLarga, PERIODOS, rangoComparacion, rangoPeriodo, sumarDias,
  type Comparar, type Periodo,
} from "@/lib/periodos";
import { clienteSupabase } from "@/lib/supabase/server";

type Params = Promise<{ [k: string]: string | string[] | undefined }>;
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const lista = (v: string | string[] | undefined) => (uno(v) ? uno(v)!.split(",").filter(Boolean) : []);
const numero = (v: string | string[] | undefined, def: number, min: number, max: number) => {
  const n = Number(uno(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : def;
};

function Indicador({ titulo, valor, delta, ayuda, sub }: {
  titulo: string; valor: string; delta?: number | null; ayuda?: string; sub?: string;
}) {
  return (
    <div className="tarjeta p-4 grid gap-1" title={ayuda}>
      <span className="text-xs text-[var(--tenue)]">{titulo}</span>
      <b className="num text-xl font-semibold whitespace-nowrap">{valor}</b>
      {delta !== undefined && delta !== null && Number.isFinite(delta) ? (
        <span className={`text-xs font-semibold ${delta >= 0 ? "text-[var(--bueno)]" : "text-[var(--critico)]"}`}>
          {delta >= 0 ? "▲" : "▼"} {porcentaje(Math.abs(delta))} <span className="font-normal text-[var(--tenue)]">vs. comparación</span>
        </span>
      ) : sub ? <span className="text-xs text-[var(--tenue)]">{sub}</span> : null}
    </div>
  );
}

const variacion = (a: number | null, b: number | null) => (a !== null && b ? a / b - 1 : null);

const COL = {
  und: { clave: "und", titulo: "Unidades", tipo: "entero" },
  venta: { clave: "venta", titulo: "Venta público S/", tipo: "soles" },
  costo: { clave: "costo", titulo: "Ingreso Calderón S/", tipo: "soles" },
  margen: { clave: "margen", titulo: "Margen SPSA S/", tipo: "soles" },
  locales: { clave: "locales", titulo: "Locales con venta", tipo: "entero" },
  rotacion: { clave: "rotacion", titulo: "Und/local/semana", tipo: "decimal1" },
  pct: { clave: "pct", titulo: "% venta", tipo: "porcentaje" },
} satisfies Record<string, Columna>;

export default async function Inicio({ searchParams }: { searchParams: Params }) {
  const sp = await searchParams;
  const sb = await clienteSupabase();
  const { data: { user } } = await sb.auth.getUser();
  const lim = await db.limites(sb);

  if (!lim.ultimo) {
    return (
      <main className="p-6 grid gap-2">
        <h1 className="text-2xl font-bold">Retail SPSA</h1>
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
  const inicioVentana = sumarDias(ultimo, -(ventana - 1));
  const [maestro, actual, previo, recientes, inv, cargas] = await Promise.all([
    db.maestros(sb),
    db.ventas(sb, desde, hasta, filtro),
    comp ? db.ventas(sb, comp[0], comp[1], filtro) : Promise.resolve([]),
    db.ventas(sb, inicioVentana, ultimo, filtro),
    lim.fechaInventario ? db.inventario(sb, lim.fechaInventario, filtro) : Promise.resolve([]),
    db.cargas(sb),
  ]);
  const L = filtrarDias(actual, dias);
  const LC = filtrarDias(previo, dias);
  const R = resumen(L);
  const RC = comp ? resumen(LC) : null;
  const listados = recientes.filter((f) => f.fecha === ultimo);
  const cob = cobertura(listados, inv, recientes, ventana, cobBaja, cobAlta);
  const conStock = cob.filter((c) => c.inv_und > 0).length;
  const instock = cob.length ? conStock / cob.length : null;
  const invTot = cob.reduce((a, c) => a + c.inv_und, 0);
  const undDiaTot = cob.reduce((a, c) => a + c.und_dia, 0);
  const semanasTot = undDiaTot > 0 ? invTot / (undDiaTot * 7) : null;
  const quiebres = cob.filter((c) => c.estado === "quiebre" && c.und_v > 0).sort((a, b) => b.perdida_dia - a.perdida_dia);
  const perdidaDia = quiebres.reduce((a, c) => a + c.perdida_dia, 0);

  const nDias = diasEntre(desde, hasta);
  const nConDatos = diasConDatos(L);
  const nombresProd = maestro.productos.map((p) => ({ valor: p.sku, texto: p.nombre }));
  const cadenas = [...new Set(maestro.locales.map((l) => l.cadena))].sort();
  const zonas = [...new Set(maestro.locales.map((l) => l.zona))].sort();
  const etiquetas = [
    `${PERIODOS[periodo]}: ${fechaLarga(desde)} al ${fechaLarga(hasta)} (${nDias} días${nConDatos !== nDias ? `, ${nConDatos} con venta` : ""})`,
    comp ? `comparado con ${fechaLarga(comp[0])} al ${fechaLarga(comp[1])}` : "sin comparación",
    dias.length < 7 ? `días: ${dias.map((d) => DIAS_SEM[d]).join(", ")}` : "",
    filtro.skus.length ? `producto: ${nombresProd.filter((p) => filtro.skus.includes(p.valor)).map((p) => p.texto).join(", ")}` : "",
    filtro.cadenas.length ? `cadena: ${filtro.cadenas.join(", ")}` : "",
    filtro.zonas.length ? `zona: ${filtro.zonas.join(", ")}` : "",
    filtro.locales.length ? `${filtro.locales.length} local(es)` : "",
  ].filter(Boolean);

  // --------------------------------------------------------------- tablas y series
  const rotCadena = rotacionPor(L, ["cadena"]).map((r) => ({ ...r, detalle: `${r.locales} locales · ${entero(r.und)} und` }));
  const rotZona = rotacionPor(L, ["zona"]).map((r) => ({ ...r, detalle: `${r.locales} locales · ${entero(r.und)} und` }));
  const rotProdCadena = rotacionPor(L, ["producto", "cadena"]);
  const rotLocal = rotacionPor(L, ["local"]).map((r) => ({ ...r, local: r.clave }));
  const conVenta = rotLocal.filter((r) => r.und > 0);
  const invLocal = new Map<string, number>();
  for (const c of cob) invLocal.set(c.local, (invLocal.get(c.local) ?? 0) + c.inv_und);
  const tablaLocales = rotLocal.map((r) => ({ ...r, margen: r.venta - r.costo, inv_und: invLocal.get(r.local) ?? 0 }))
    .sort((a, b) => b.venta - a.venta);

  const serieActual = serie(L, agrupar);
  const serieProd = serie(L, agrupar, true);
  const nombresSerie = [...new Set(serieProd.map((s) => s.producto!))];
  const lineasProd = [...new Set(serieProd.map((s) => s.periodo))].map((periodo) => ({
    periodo, ...Object.fromEntries(nombresSerie.map((n) => [n, serieProd.find((s) => s.periodo === periodo && s.producto === n)?.und ?? null])),
  }));
  const accA = acumulado(L), accB = comp ? acumulado(LC) : [];
  const comparacion = Array.from({ length: Math.max(accA.length, accB.length) }, (_, i) => ({ dia: i + 1, actual: accA[i] ?? null, previo: accB[i] ?? null }));
  const porProducto = rotacionPor(L, ["producto"]).map((r) => ({
    ...r, precio: r.und ? r.venta / r.und : null, margen_pct: r.venta ? (r.venta - r.costo) / r.venta : null,
  })).sort((a, b) => b.venta - a.venta);

  const resumenEstados = (Object.keys(ESTADOS) as Estado[]).map((e) => {
    const f = cob.filter((c) => c.estado === e);
    return { estado: e, filas: f.length, inv_und: f.reduce((a, c) => a + c.inv_und, 0) };
  });
  const coberturaProducto = [...new Set(cob.map((c) => c.producto))].map((p) => {
    const f = cob.filter((c) => c.producto === p);
    const inv = f.reduce((a, c) => a + c.inv_und, 0), ud = f.reduce((a, c) => a + c.und_dia, 0);
    const listadosP = f.length, stockP = f.filter((c) => c.inv_und > 0).length;
    return { producto: p, listados: listadosP, con_stock: stockP, instock: listadosP ? stockP / listadosP : null, inv_und: inv, und_dia: ud, semanas: ud > 0 ? inv / (ud * 7) : null };
  });

  const totalFila = (extra: Record<string, unknown> = {}) => ({ und: R.und, venta: R.venta, costo: R.costo, margen: R.margen, locales: R.locales, rotacion: R.rotacion, pct: R.venta ? 1 : null, ...extra });
  const archivo = (n: string) => `retail_spsa_${n}_${desde}_${hasta}.xlsx`;

  // --------------------------------------------------------------- pestañas
  const indicadores = (
    <>
      <section className="grid gap-3">
        <div>
          <h2 className="text-lg font-bold">1 · Rotación: unidades por local por semana</h2>
          <p className="text-sm text-[var(--tenue)]">Qué tan bien vende el producto donde ya está, comparable entre cadenas, zonas y locales.
            Promedio del periodo: <b className="num">{decimal1(R.rotacion)}</b> und/local/semana en {R.locales} locales con venta.</p>
        </div>
        {L.length === 0 ? <p className="text-sm">Sin ventas con estos filtros.</p> : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <BarrasH titulo="Por cadena" datos={rotCadena} etiqueta="clave" valor="rotacion" />
              <BarrasH titulo="Por zona" datos={rotZona} etiqueta="clave" valor="rotacion" />
            </div>
            <Tabla archivo={archivo("rotacion")} hoja="Rotación" filas={rotProdCadena}
                   columnas={[{ clave: "producto", titulo: "Producto", tipo: "texto" }, { clave: "cadena", titulo: "Cadena", tipo: "texto" },
                     COL.rotacion, COL.locales, COL.und, COL.venta, COL.pct]} total={{ producto: "TOTAL", ...totalFila() }} />
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-2"><h3 className="text-sm font-semibold">Locales con mayor rotación</h3>
                <Tabla archivo={archivo("top_locales")} hoja="Mayor rotación" filas={conVenta.slice(0, 10)}
                       columnas={[{ clave: "local", titulo: "Local", tipo: "texto" }, { clave: "cadena", titulo: "Cadena", tipo: "texto" }, COL.rotacion, COL.und]} /></div>
              <div className="grid gap-2"><h3 className="text-sm font-semibold">Locales con menor rotación (con alguna venta)</h3>
                <Tabla archivo={archivo("menor_rotacion")} hoja="Menor rotación" filas={conVenta.slice(-10).reverse()}
                       columnas={[{ clave: "local", titulo: "Local", tipo: "texto" }, { clave: "cadena", titulo: "Cadena", tipo: "texto" }, COL.rotacion, COL.und]} /></div>
            </div>
          </>
        )}
      </section>
      <section className="grid gap-3">
        <div>
          <h2 className="text-lg font-bold">2 · Instock y venta perdida por quiebres</h2>
          <p className="text-sm text-[var(--tenue)]">Foto de inventario al {lim.fechaInventario ? fechaLarga(lim.fechaInventario) : "—"}.
            Quiebre = sin stock en un local que vendía en los últimos {ventana} días; venta perdida = su venta promedio por día × precio promedio.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Indicador titulo="Instock total" valor={porcentaje(instock)} sub={`${conStock} de ${cob.length} locales-producto con stock`} />
          <Indicador titulo="Quiebres con venta previa" valor={entero(quiebres.length)} />
          <Indicador titulo="Venta perdida estimada por día" valor={soles(perdidaDia)} sub={quiebres.length ? `≈ ${soles(perdidaDia * 7)} por semana` : "Sin quiebres"} />
        </div>
        <Tabla archivo={archivo("instock")} hoja="Instock" filas={coberturaProducto}
               columnas={[{ clave: "producto", titulo: "Producto", tipo: "texto" }, { clave: "listados", titulo: "Locales reportados", tipo: "entero" },
                 { clave: "con_stock", titulo: "Con stock", tipo: "entero" }, { clave: "instock", titulo: "Instock", tipo: "porcentaje" }]} />
        {quiebres.length > 0 && (
          <Tabla archivo={archivo("quiebres")} hoja="Quiebres" filas={quiebres}
                 columnas={[{ clave: "local", titulo: "Local", tipo: "texto" }, { clave: "cadena", titulo: "Cadena", tipo: "texto" },
                   { clave: "producto", titulo: "Producto", tipo: "texto" }, { clave: "und_dia", titulo: "Venta und/día", tipo: "decimal2" },
                   { clave: "perdida_dia", titulo: "Venta perdida S/ por día", tipo: "soles" }]} />
        )}
      </section>
      <section className="grid gap-3">
        <div>
          <h2 className="text-lg font-bold">3 · Semanas de cobertura y stock sin movimiento</h2>
          <p className="text-sm text-[var(--tenue)]">Semanas = inventario ÷ (venta promedio por día de los últimos {ventana} días × 7).
            Baja: menos de {cobBaja} · Sobrestock: más de {cobAlta} · Sin movimiento: con stock y sin venta en {ventana} días (se cambia en ⚙ Parámetros).</p>
        </div>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          {resumenEstados.map((e) => (
            <div key={e.estado} className="tarjeta p-3 grid gap-1">
              <span className={`estado estado-${e.estado} w-fit`}>{ESTADOS[e.estado]}</span>
              <b className="num text-lg">{entero(e.filas)}</b>
              <span className="text-xs text-[var(--tenue)]">{entero(e.inv_und)} und en stock</span>
            </div>
          ))}
        </div>
        <Tabla archivo={archivo("cobertura_producto")} hoja="Cobertura" filas={coberturaProducto}
               columnas={[{ clave: "producto", titulo: "Producto", tipo: "texto" }, { clave: "inv_und", titulo: "Inventario und", tipo: "entero" },
                 { clave: "und_dia", titulo: `Venta und/día (${ventana} días)`, tipo: "decimal1" }, { clave: "semanas", titulo: "Semanas de cobertura", tipo: "decimal1" }]} />
      </section>
    </>
  );

  const evolucion = L.length === 0 ? <p className="text-sm">Sin ventas con estos filtros.</p> : (
    <>
      <BarrasSerie titulo={`Venta al público por ${agrupar === "dia" ? "día" : agrupar} (S/ sin IGV)`} datos={serieActual} agrupar={agrupar} />
      {comp && LC.length > 0 && (
        <Lineas titulo={`Venta acumulada: actual vs. ${COMPARAR[comparar].toLowerCase()}`} datos={comparacion} x="dia" formatoY="soles"
                series={[{ clave: "actual", nombre: "Actual", color: "var(--serie-1)" }, { clave: "previo", nombre: COMPARAR[comparar], color: "var(--serie-gris)" }]} />
      )}
      <Tabla archivo={archivo("evolucion")} hoja="Evolución" filas={serieActual.map((s) => ({ ...s, margen: s.venta - s.costo, periodo: fechaLarga(s.periodo) }))}
             columnas={[{ clave: "periodo", titulo: agrupar === "dia" ? "Día" : agrupar === "semana" ? "Semana (lunes)" : "Mes", tipo: "texto" },
               COL.und, COL.venta, COL.costo, COL.margen]} total={{ periodo: "TOTAL", ...totalFila() }} />
    </>
  );

  const productoTab = L.length === 0 ? <p className="text-sm">Sin ventas con estos filtros.</p> : (
    <>
      <Lineas titulo={`Unidades por ${agrupar === "dia" ? "día" : agrupar} y producto`} datos={lineasProd} x="periodo" tipoX={agrupar}
              series={nombresSerie.map((n, i) => ({ clave: n, nombre: n, color: i === 0 ? "var(--serie-1)" : "var(--serie-2)" }))} />
      <Tabla archivo={archivo("productos")} hoja="Productos" filas={porProducto}
             columnas={[{ clave: "clave", titulo: "Producto", tipo: "texto" }, COL.und, COL.venta, COL.costo,
               { clave: "precio", titulo: "Precio prom. público S/", tipo: "decimal2" }, { clave: "margen_pct", titulo: "Margen SPSA", tipo: "porcentaje" }, COL.pct]}
             total={{ clave: "TOTAL", ...totalFila({ precio: R.und ? R.venta / R.und : null, margen_pct: R.venta ? R.margen / R.venta : null }) }} />
    </>
  );

  const localesTab = L.length === 0 ? <p className="text-sm">Sin ventas con estos filtros.</p> : (
    <>
      <BarrasH titulo="Venta al público por cadena (S/)" datos={rotacionPor(L, ["cadena"]).sort((a, b) => b.venta - a.venta)
        .map((r) => ({ ...r, detalle: `${r.locales} locales · ${entero(r.und)} und` }))} etiqueta="clave" valor="venta" formato="soles" />
      <Tabla archivo={archivo("locales")} hoja="Locales" alto={560} filas={tablaLocales}
             columnas={[{ clave: "local", titulo: "Local", tipo: "texto" }, { clave: "cadena", titulo: "Cadena", tipo: "texto" }, { clave: "zona", titulo: "Zona", tipo: "texto" },
               COL.und, COL.rotacion, COL.venta, COL.costo, COL.margen, { clave: "inv_und", titulo: "Inventario und", tipo: "entero" }]}
             total={{ local: "TOTAL", ...totalFila({ inv_und: invTot }) }} />
    </>
  );

  const coberturaTab = cob.length === 0 ? <p className="text-sm">Todavía no hay inventario cargado.</p> : (
    <Tabla archivo={archivo("cobertura")} hoja="Cobertura" alto={620}
           filas={[...cob].sort((a, b) => (b.semanas ?? Infinity) - (a.semanas ?? Infinity))}
           columnas={[{ clave: "local", titulo: "Local", tipo: "texto" }, { clave: "cadena", titulo: "Cadena", tipo: "texto" }, { clave: "zona", titulo: "Zona", tipo: "texto" },
             { clave: "producto", titulo: "Producto", tipo: "texto" }, { clave: "inv_und", titulo: "Inventario und", tipo: "entero" },
             { clave: "und_v", titulo: `Venta ${ventana} días`, tipo: "entero" }, { clave: "und_dia", titulo: "Und por día", tipo: "decimal2" },
             { clave: "semanas", titulo: "Semanas de cobertura", tipo: "decimal1" }, { clave: "estado", titulo: "Estado", tipo: "estado" }]} />
  );

  const cargasTab = (
    <Tabla archivo="retail_spsa_cargas.xlsx" hoja="Cargas" alto={560} filas={cargas}
           columnas={[{ clave: "cuando", titulo: "Cargado", tipo: "texto" }, { clave: "fecha", titulo: "Día", tipo: "texto" },
             { clave: "nivel", titulo: "Nivel", tipo: "texto" }, { clave: "estado", titulo: "Estado", tipo: "texto" },
             { clave: "filas", titulo: "Filas", tipo: "entero" }, COL.und, { clave: "venta", titulo: "Venta S/", tipo: "soles" },
             { clave: "detalle", titulo: "Detalle", tipo: "texto" }]} />
  );

  return (
    <main className="mx-auto w-full max-w-[1280px] px-4 py-6 grid gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="etiqueta">Turrones Calderón · canal retail</p>
          <h1 className="text-3xl font-extrabold tracking-tight">Supermercados Peruanos</h1>
          <p className="text-sm text-[var(--tenue)]">Datos hasta el <b>{fechaLarga(ultimo)}</b> · SPSA publica con un día de atraso · montos sin IGV</p>
        </div>
        <form action={salir} className="flex items-center gap-2 text-sm">
          <span className="text-[var(--tenue)]">{user?.email}</span>
          <button type="submit" className="boton">Salir</button>
        </form>
      </header>

      <Filtros productos={nombresProd} cadenas={cadenas} zonas={zonas} ultimo={ultimo} primero={primero}
               locales={maestro.locales.map((l) => ({ valor: String(l.cod_local), texto: l.nombre, cadena: l.cadena, zona: l.zona }))} />
      <p className="text-sm" aria-live="polite">{etiquetas.join(" · ")}</p>

      <section className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6" aria-label="Indicadores principales">
        <Indicador titulo="Venta al público" valor={soles(R.venta)} delta={RC && variacion(R.venta, RC.venta)} ayuda="Lo que pagó el consumidor final, sin IGV." />
        <Indicador titulo="Ingreso Calderón" valor={soles(R.costo)} delta={RC && variacion(R.costo, RC.costo)} ayuda="Venta a costo del portal: lo que SPSA paga a Calderón por lo vendido, sin IGV." />
        <Indicador titulo="Unidades" valor={entero(R.und)} delta={RC && variacion(R.und, RC.und)} />
        <Indicador titulo="Und por local por semana" valor={decimal1(R.rotacion)} delta={RC && variacion(R.rotacion, RC.rotacion)} ayuda="Unidades ÷ locales con venta ÷ semanas del periodo." />
        <Indicador titulo="Instock" valor={porcentaje(instock)} sub={`${conStock} de ${cob.length} con stock`} ayuda="Locales-producto con inventario > 0." />
        <Indicador titulo="Semanas de cobertura" valor={decimal1(semanasTot)} sub={`Inventario ${entero(invTot)} und`} ayuda={`Inventario ÷ venta semanal de los últimos ${ventana} días.`} />
      </section>

      <Pestanas pestanas={[
        { id: "kpi", titulo: "🎯 Indicadores", contenido: indicadores },
        { id: "evo", titulo: "📈 Evolución", contenido: evolucion },
        { id: "prod", titulo: "📦 Por producto", contenido: productoTab },
        { id: "loc", titulo: "🏬 Cadena y local", contenido: localesTab },
        { id: "cob", titulo: "📊 Cobertura y quiebres", contenido: coberturaTab },
        { id: "cargas", titulo: "🧾 Cargas", contenido: cargasTab },
      ]} />
    </main>
  );
}
