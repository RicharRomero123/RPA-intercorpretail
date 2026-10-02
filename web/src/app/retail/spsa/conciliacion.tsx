// Sección «Despachado vs vendido» de Supermercados · SPSA: cruza lo que Calderón despachó a SPSA (Excel Ventas RETAIL, el mismo
// del consolidado) con lo que SPSA vendió al público y el stock que reporta en sus tiendas (portal de Intercorp, el bot).
// Despachado − vendido = saldo esperado; contra el stock reportado, la diferencia es lo que está en el CD de SPSA, en tránsito o merma.
import { PackageCheck, Truck } from "lucide-react";
import { Indicador } from "@/components/Graficos";
import { Tabla } from "@/components/Tabla";
import { Aviso, Encabezado, Tarjeta } from "@/components/ui";
import { entero, porcentaje, soles } from "@/lib/formato";
import { fechaLarga } from "@/lib/periodos";
import type { ConciliacionSellout } from "@/lib/retail";

const div = (a: number, b: number) => (b ? a / b : null);

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
