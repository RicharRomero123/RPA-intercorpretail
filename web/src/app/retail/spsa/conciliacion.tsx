// Sección «Despachado vs vendido» de Supermercados · SPSA: cruza lo que Calderón despachó a SPSA (Excel Ventas RETAIL, el mismo
// del consolidado) con lo que SPSA vendió al público y el stock que reporta en sus tiendas (portal de Intercorp, el bot).
// Despachado − vendido = saldo esperado; contra el stock reportado, la diferencia es lo que está en el CD de SPSA, en tránsito o merma.
import { Hourglass, PackageCheck, Truck } from "lucide-react";
import { AvanceSellout, type AvanceProducto } from "@/components/AvanceSellout";
import { Indicador } from "@/components/Graficos";
import { Tabla } from "@/components/Tabla";
import { Aviso, Encabezado, Tarjeta } from "@/components/ui";
import { entero, porcentaje, soles } from "@/lib/formato";
import { fechaLarga } from "@/lib/periodos";
import type { ConciliacionSellout } from "@/lib/retail";

const div = (a: number, b: number) => (b ? a / b : null);
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const DIA = 86_400_000;
const corta = (t: number) => { const d = new Date(t); return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`; };
/** Días con venta que se promedian para el ritmo actual. */
const VENTANA = 7;

/** Evolución del % vendido de lo despachado y proyección al ritmo de los últimos días, por producto y en total. */
function avance(c: ConciliacionSellout) {
  const hoy = c.hasta_venta!, tHoy = ms(hoy), anio = Number(hoy.slice(0, 4));
  const fin = `${anio}-12-24`, tFin = ms(fin);                       // fin de campaña: Nochebuena
  const desde = ms(c.inicio_venta && c.inicio_venta > c.inicio! ? c.inicio_venta : c.inicio!);
  const diasVenta = [...new Set(c.ventas_dia.map((v) => v.fecha))].sort();
  const ultimos = diasVenta.slice(-VENTANA);
  const restantes = Math.max(Math.round((tFin - tHoy) / DIA), 0);
  const calcular = (skus: string[] | null, producto: string, despachado: number, vendido: number, stock: number) => {
    const es = (sku: string) => !skus || skus.includes(sku);
    const ventas = c.ventas_dia.filter((v) => es(v.sku)), desp = c.despachos.filter((d) => es(d.sku));
    let acV = 0;
    const real = diasVenta.map((d) => {
      acV += ventas.filter((v) => v.fecha === d).reduce((s, v) => s + v.und, 0);
      const acD = desp.filter((x) => x.fecha <= d).reduce((s, x) => s + x.und, 0);
      return { t: ms(d), real: acD ? acV / acD : null };
    });
    const ritmo = ultimos.length ? ventas.filter((v) => ultimos.includes(v.fecha)).reduce((s, v) => s + v.und, 0) / ultimos.length : 0;
    const saldo = Math.max(despachado - vendido, 0);
    const dias = ritmo > 0 ? saldo / ritmo : null;
    const tAgota = dias === null ? null : tHoy + Math.ceil(dias) * DIA;
    const alFin = Math.min(despachado, vendido + ritmo * restantes);
    // Proyección: recta desde hoy hasta que se acaba o hasta fin de campaña.
    const tProy = Math.min(tAgota ?? tFin, tFin);
    const proy = despachado ? [{ t: tHoy, proy: vendido / despachado }, { t: tProy, proy: Math.min(vendido + ritmo * ((tProy - tHoy) / DIA), despachado) / despachado }] : [];
    return {
      fila: { producto, despachado, vendido, pct: div(vendido, despachado), saldo, stock, ritmo, dias,
              agota: tAgota === null ? "—" : tAgota > tFin ? `después del ${corta(tFin)}` : corta(tAgota),
              pct_fin: div(alFin, despachado), sobra: Math.round(despachado - alFin), necesita: restantes ? saldo / restantes : null },
      grafico: { producto, actual: div(vendido, despachado), agota: tAgota !== null && tAgota <= tFin ? corta(tAgota) : null,
                 puntos: [...real, ...proy] } as AvanceProducto,
    };
  };
  return { hoy, fin, tFin, desde, tHoy, ultimos, restantes, calcular };
}

export function seccionConciliacion(c: ConciliacionSellout, nombre = "Supermercados Peruanos", corto = "SPSA") {
  if (!c.productos.length || !c.inicio) {
    return <Aviso titulo={`Todavía no hay despachos a ${nombre}`}>Sube el Excel «Ventas RETAIL» desde Configuración.</Aviso>;
  }
  const filas = c.productos.map((p) => {
    const esperado = p.despachado - p.vendido;
    return { ...p, sellthrough: div(p.vendido, p.despachado), esperado, dif: p.stock - esperado };
  });
  const T = filas.reduce((a, p) => ({ despachado: a.despachado + p.despachado, monto: a.monto + p.monto, vendido: a.vendido + p.vendido,
    costo: a.costo + p.costo, stock: a.stock + p.stock }), { despachado: 0, monto: 0, vendido: 0, costo: 0, stock: 0 });
  const esperado = T.despachado - T.vendido, dif = T.stock - esperado;
  const pctDif = div(Math.abs(dif), esperado) ?? 0;
  const periodo = `${c.temporada ? "temporada, " : ""}del ${fechaLarga(c.inicio)} (primer despacho${c.temporada ? " de la campaña" : ""}) al ${c.hasta_venta ? fechaLarga(c.hasta_venta) : "—"}`;
  const signo = (x: number) => `${x >= 0 ? "+" : "−"}${entero(Math.abs(x))}`;

  return (
    <>
      <Encabezado titulo="Despachado vs vendido"
                  descripcion={<>Lo que Calderón despachó a {nombre} (Excel «Ventas RETAIL», el mismo del consolidado) frente a lo que {corto}
                    vendió al público y el stock que reporta en sus tiendas (portal de Intercorp). {periodo}.</>} />
      <div className="grid gap-4 grid-cols-1 @lg:grid-cols-2 @5xl:grid-cols-4">
        <Indicador icono="unidades" titulo={`Despachado a ${corto}`} valor={`${entero(T.despachado)} und`} detalle={`${soles(T.monto)} facturado`} />
        <Indicador icono="venta" titulo="Vendido al público" valor={`${entero(T.vendido)} und`} detalle={`${soles(T.costo)} a costo (ingreso Calderón)`} />
        <Indicador icono="rotacion" titulo="Sell-through" valor={porcentaje(div(T.vendido, T.despachado))} detalle="vendido ÷ despachado" />
        <Indicador icono="instock" titulo={`Stock en tiendas ${corto}`} valor={`${entero(T.stock)} und`}
                   detalle={`esperado ${entero(esperado)} · diferencia ${signo(dif)} (${porcentaje(pctDif)})`} />
      </div>
      {c.inicio_venta && c.inicio_venta > c.inicio && (
        <Aviso tipo="alerta" titulo={`${corto} reporta ventas desde el ${fechaLarga(c.inicio_venta)}, pero el primer despacho fue el ${fechaLarga(c.inicio)}`}>
          Lo que se vendió entre el {fechaLarga(c.inicio)} y el {fechaLarga(c.inicio_venta)} no está en los reportes, así que el «saldo esperado»
          (despachado − vendido) sale algo más alto que el real. Si el stock supera al esperado en un producto, es stock que ya había antes de la campaña.
        </Aviso>
      )}
      <Aviso tipo={pctDif <= 0.03 ? "bueno" : "alerta"}
             titulo={`Despachado − vendido = ${entero(esperado)} und; ${corto} reporta ${entero(T.stock)} und en tiendas al ${c.fecha_stock ? fechaLarga(c.fecha_stock) : "—"}`}>
        La diferencia ({signo(dif)} und, {porcentaje(pctDif)}) es lo que está en el centro de distribución de {corto}, en tránsito a tiendas o merma.
        Si supera el 3%, conviene revisarla con {corto}.
      </Aviso>
      {c.hasta_venta && c.ventas_dia.length > 0 && (() => {
        const a = avance(c);
        const prods = filas.filter((p) => p.despachado > 0).map((p) => a.calcular([p.sku], p.producto, p.despachado, p.vendido, p.stock));
        const tot = a.calcular(null, "Total", T.despachado, T.vendido, T.stock);
        const dias = (x: number | null) => (x === null ? "—" : `${Math.round(x)} días`);
        return (
          <Tarjeta icono={Hourglass} titulo="Cuánto se ha vendido de lo despachado y cuándo se acaba"
                   subtitulo={`% vendido de lo despachado, día a día · proyección al ritmo de los últimos ${a.ultimos.length} días con reporte, hasta el ${corta(a.tFin)} (fin de campaña)`}>
            <AvanceSellout productos={[{ ...tot.grafico, total: true }, ...prods.map((x) => x.grafico)]} desde={a.desde} hasta={a.tFin} hoy={a.tHoy} />
            <Tabla archivo={`${corto.toLowerCase()}_proyeccion.xlsx`} hoja="Proyección" filas={prods.map((x) => x.fila)}
                   columnas={[{ clave: "producto", titulo: "Producto", tipo: "texto" }, { clave: "despachado", titulo: "Despachado und", tipo: "entero" },
                     { clave: "vendido", titulo: "Vendido und", tipo: "entero" }, { clave: "pct", titulo: "% vendido", tipo: "porcentaje" },
                     { clave: "saldo", titulo: "Por vender und", tipo: "entero" },
                     { clave: "ritmo", titulo: `Venta und/día (últ. ${a.ultimos.length} d)`, tipo: "decimal1" },
                     { clave: "dias", titulo: "Días para acabarse", tipo: "entero" }, { clave: "agota", titulo: "Se acaba el", tipo: "texto" },
                     { clave: "pct_fin", titulo: `% vendido al ${corta(a.tFin)}`, tipo: "porcentaje" },
                     { clave: "sobra", titulo: `Sobraría al ${corta(a.tFin)} und`, tipo: "entero" },
                     { clave: "necesita", titulo: "Und/día para venderlo todo", tipo: "decimal1" }]}
                   total={{ ...tot.fila, producto: "TOTAL" }} />
            <p className="text-xs text-[var(--tenue)]">
              Por vender = despachado − vendido (incluye lo que está en tiendas y en el centro de distribución de {corto}). Días para acabarse = por vender ÷ venta
              por día de los últimos {a.ultimos.length} días con reporte ({dias(tot.fila.dias)} en total). «Und/día para venderlo todo» es el ritmo que haría falta
              para no tener sobrante al {corta(a.tFin)}: si es mayor que la venta por día actual, sobrará producto. La proyección supone que el ritmo se mantiene;
              en campaña navideña suele subir en diciembre.
            </p>
          </Tarjeta>
        );
      })()}
      <Tarjeta icono={PackageCheck} titulo="Por producto" subtitulo={periodo}>
        <Tabla archivo="spsa_despachado_vs_vendido.xlsx" hoja="Despachado vs vendido" filas={filas}
               columnas={[{ clave: "producto", titulo: "Producto", tipo: "texto" }, { clave: "despachado", titulo: "Despachado und", tipo: "entero" },
                 { clave: "monto", titulo: "Facturado S/", tipo: "soles" }, { clave: "vendido", titulo: "Vendido und", tipo: "entero" },
                 { clave: "sellthrough", titulo: "Sell-through", tipo: "porcentaje" }, { clave: "esperado", titulo: "Saldo esperado und", tipo: "entero" },
                 { clave: "stock", titulo: "Stock tiendas und", tipo: "entero" }, { clave: "dif", titulo: "Diferencia und", tipo: "entero" },
                 { clave: "locales", titulo: "Locales con stock", tipo: "entero" }]}
               total={{ producto: "TOTAL", despachado: T.despachado, monto: T.monto, vendido: T.vendido, sellthrough: div(T.vendido, T.despachado),
                        esperado, stock: T.stock, dif }} />
        <p className="text-xs text-[var(--tenue)]">
          Saldo esperado = despachado − vendido. Diferencia = stock reportado − saldo esperado (negativa: falta en tiendas lo que aún está en el CD,
          en tránsito o se perdió). El facturado es el monto del Excel; el vendido es la venta a costo del portal.
        </p>
      </Tarjeta>
      <Tarjeta icono={Truck} titulo={`Despachos a ${nombre}`} subtitulo="Del Excel «Ventas RETAIL»">
        <Tabla archivo="spsa_despachos.xlsx" hoja="Despachos" filas={c.despachos.map((d) => ({ ...d, fecha: fechaLarga(d.fecha) }))}
               columnas={[{ clave: "fecha", titulo: "Día de despacho", tipo: "texto" }, { clave: "producto", titulo: "Producto", tipo: "texto" },
                 { clave: "und", titulo: "Unidades", tipo: "entero" }, { clave: "precio", titulo: "Precio unit. S/", tipo: "decimal2" },
                 { clave: "monto", titulo: "Monto S/", tipo: "soles" }, { clave: "status", titulo: "Estado", tipo: "texto" }]}
               total={{ fecha: "TOTAL", und: T.despachado, monto: T.monto }} />
      </Tarjeta>
    </>
  );
}
