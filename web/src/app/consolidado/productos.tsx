// Productos más vendidos entre todos los canales: unidades de cada SKU por mes (función sku_mensual).
// Entran los canales con detalle por producto (Tiendas, Lima, Provincia y Retail); B2B y Rappi no lo tienen.
import { Pestanas } from "@/components/Pestanas";
import { Tabla, type Columna } from "@/components/Tabla";
import { porcentaje } from "@/lib/formato";

export type FilaSku = { mes: number; canal: string; sku: string; producto: string; und: number; venta: number };

const CANALES = ["TIENDAS", "RETAIL", "LIMA", "PROVINCIA"];
type Reg = { sku: string; producto: string; und: number; venta: number; puesto?: number; part?: number | null;
             [k: string]: string | number | null | undefined };
const nombreCanal = (c: string) => c.charAt(0) + c.slice(1).toLowerCase();

export function ProductosTop({ filas, mesCorte, etiquetaMes, sinDetalle, totalNegocio, archivo }: {
  filas: FilaSku[]; mesCorte: number; etiquetaMes: (m: number) => string;
  sinDetalle: { canal: string; monto: number }[]; totalNegocio: number; archivo: string;
}) {
  const meses = Array.from({ length: mesCorte }, (_, i) => i + 1);
  const porSku = new Map<string, Reg>();
  for (const f of filas) {
    if (f.mes > mesCorte) continue;
    const x: Reg = porSku.get(f.sku) ?? { sku: f.sku, producto: f.producto, und: 0, venta: 0 };
    x[`m${f.mes}`] = Number(x[`m${f.mes}`] ?? 0) + f.und;
    x[f.canal] = Number(x[f.canal] ?? 0) + f.und;
    x[`${f.canal}_m${f.mes}`] = Number(x[`${f.canal}_m${f.mes}`] ?? 0) + f.und;
    x.und += f.und;
    x.venta += f.venta;
    porSku.set(f.sku, x);
  }
  const totalUnd = [...porSku.values()].reduce((s, x) => s + Number(x.und), 0);
  const todos = [...porSku.values()].sort((a, b) => Number(b.und) - Number(a.und))
    .map((x, i): Reg => ({ ...x, puesto: i + 1, part: totalUnd ? Number(x.und) / totalUnd : null }));
  const top = todos.filter((x) => x.sku !== "SIN SKU").slice(0, 10);
  const suma = (lista: Reg[], clave: string) => lista.reduce((s, x) => s + Number(x[clave] ?? 0), 0);
  const total = (lista: Reg[], titulo: string) => ({
    sku: "", producto: titulo, und: suma(lista, "und"), venta: suma(lista, "venta"), part: totalUnd ? suma(lista, "und") / totalUnd : null,
    ...Object.fromEntries([...meses.map((m) => `m${m}`), ...CANALES].map((k) => [k, suma(lista, k)])),
  });

  const base: Columna[] = [{ clave: "puesto", titulo: "#", tipo: "entero" }, { clave: "producto", titulo: "Producto", tipo: "texto" },
                           { clave: "sku", titulo: "SKU", tipo: "texto" }];
  const porMes: Columna[] = [...base, ...meses.map((m) => ({ clave: `m${m}`, titulo: `${etiquetaMes(m)} und`, tipo: "entero" }) as Columna),
    { clave: "und", titulo: "Total und", tipo: "entero" }, { clave: "venta", titulo: "Venta S/", tipo: "soles" },
    { clave: "part", titulo: "% de las und", tipo: "porcentaje" }];
  const ventaSku = todos.reduce((s, x) => s + x.venta, 0);
  const cuadre = totalNegocio - ventaSku - sinDetalle.reduce((s, x) => s + x.monto, 0);
  const exacto = (x: number) => `S/ ${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const maxUnd = Number(top[0]?.und ?? 0);
  const partTop = totalUnd ? suma(top, "und") / totalUnd : null;

  // Tabla de doble entrada: cada producto del top 10 con una fila por canal (y su total), los meses en columnas.
  const und = (x: number | undefined) => (x ? Math.round(x).toLocaleString("en-US") : "—");
  const cruce = (
    <div className="grid gap-2">
      <div className="overflow-x-auto rounded-lg border border-[var(--linea)]">
        <table className="datos text-[12.5px]">
          <thead>
            <tr>
              <th>#</th><th>Producto</th><th>Canal</th>
              {meses.map((m) => <th key={m} className="n">{etiquetaMes(m)}</th>)}
              <th className="n !bg-[var(--acento-suave)]">Total und</th>
            </tr>
          </thead>
          <tbody>
            {top.flatMap((x) => {
              const canales = CANALES.filter((c) => Number(x[c] ?? 0) > 0);
              return [
                ...canales.map((c, i) => (
                  <tr key={`${x.sku}-${c}`}>
                    {i === 0 && <td rowSpan={canales.length + 1} className="num text-[var(--tenue)] align-top">{x.puesto}</td>}
                    {i === 0 && <td rowSpan={canales.length + 1} className="align-top"><b>{x.producto}</b><span className="block text-[11px] text-[var(--tenue)]">{x.sku}</span></td>}
                    <td className="whitespace-nowrap">{nombreCanal(c)}</td>
                    {meses.map((m) => <td key={m} className="n num">{und(Number(x[`${c}_m${m}`] ?? 0))}</td>)}
                    <td className="n num !bg-[var(--acento-suave)]">{und(Number(x[c]))}</td>
                  </tr>
                )),
                <tr key={`${x.sku}-total`} className="font-semibold border-b-2 border-[var(--linea)]">
                  <td>Total</td>
                  {meses.map((m) => <td key={m} className="n num">{und(Number(x[`m${m}`] ?? 0))}</td>)}
                  <td className="n num !bg-[var(--acento-suave)]">{und(x.und)}</td>
                </tr>,
              ];
            })}
            {CANALES.map((c, i) => (
              <tr key={`tot-${c}`} className="total">
                {i === 0 && <td colSpan={2} rowSpan={CANALES.length + 1} className="align-top">TOTAL TOP 10</td>}
                <td>{nombreCanal(c)}</td>
                {meses.map((m) => <td key={m} className="n num">{und(suma(top, `${c}_m${m}`))}</td>)}
                <td className="n num">{und(suma(top, c))}</td>
              </tr>
            ))}
            <tr className="total">
              <td>Total</td>
              {meses.map((m) => <td key={m} className="n num">{und(suma(top, `m${m}`))}</td>)}
              <td className="n num">{und(suma(top, "und"))}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[var(--tenue)]">Unidades. Cada producto muestra solo los canales donde se vendió; la fila «Total» suma sus canales.</p>
    </div>
  );

  const ranking = (
    <div className="grid gap-4">
      <ol className="grid gap-1.5">
        {top.map((x) => (
          <li key={String(x.sku)} className="grid grid-cols-[1.5rem_minmax(0,14rem)_1fr_auto] items-center gap-3 text-sm">
            <span className="num text-[var(--tenue)] text-right">{x.puesto}</span>
            <span className="truncate" title={`${x.producto} · ${x.sku}`}>{String(x.producto)}</span>
            <span className="h-3 rounded bg-[var(--acento-suave)]">
              <span className="block h-3 rounded bg-[var(--acento)]" style={{ width: `${maxUnd ? (Number(x.und) / maxUnd) * 100 : 0}%` }} />
            </span>
            <span className="num text-right whitespace-nowrap">{Number(x.und).toLocaleString("en-US")} und · {porcentaje(x.part)}</span>
          </li>
        ))}
      </ol>
      <Tabla archivo={`top10_sku_${archivo}.xlsx`} hoja="Top 10" filas={top} columnas={porMes} total={total(top, "TOTAL TOP 10")} />
    </div>
  );

  return (
    <div className="grid gap-4">
      <p className="text-sm text-[var(--tenue)] max-w-4xl">
        Los 10 productos con más <b className="text-[var(--tinta)]">unidades</b> vendidas en el año sumando todos los canales: concentran
        el <b className="text-[var(--tinta)]">{porcentaje(partTop)}</b> de las {totalUnd.toLocaleString("en-US")} unidades.
      </p>
      <Pestanas pestanas={[
        { id: "top", titulo: "Top 10 por mes", contenido: ranking },
        { id: "canal", titulo: "Top 10 por canal y mes", contenido: cruce },
        { id: "todos", titulo: `Todos los SKU (${todos.length})`,
          contenido: <Tabla archivo={`sku_por_mes_${archivo}.xlsx`} hoja="SKU por mes" filas={todos} columnas={porMes} total={total(todos, "TOTAL")} buscar alto={520} /> },
      ]} />
      {/* Cuadre con el total del negocio: productos + canales sin detalle por producto */}
      <div className="w-fit max-w-full overflow-x-auto rounded-lg border border-[var(--linea)]">
        <table className="datos text-[12.5px]">
          <thead><tr><th>Cuadre con el total del negocio (ene–{etiquetaMes(mesCorte).toLowerCase()})</th><th className="n">Venta S/</th></tr></thead>
          <tbody>
            <tr><td>Productos (Tiendas, Retail, Lima y Provincia)</td><td className="n num">{exacto(ventaSku)}</td></tr>
            {sinDetalle.map((x) => <tr key={x.canal}><td>+ {x.canal} (no trae detalle por producto)</td><td className="n num">{exacto(x.monto)}</td></tr>)}
            <tr className="total"><td>= Total del negocio</td><td className="n num">{exacto(totalNegocio)}</td></tr>
            {Math.abs(cuadre) >= 1 && <tr><td>Diferencia por revisar</td><td className="n num text-[var(--critico)]">{exacto(cuadre)}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[var(--tenue)] max-w-4xl">
        Las tablas de productos suman solo los canales que traen el detalle por producto; cada uno cuadra al sol con su monto de arriba.
        {sinDetalle.length > 0 && <> {sinDetalle.map((x) => x.canal).join(" y ")} se venden pero su archivo no dice qué producto, por eso se suman aparte.</>}
      </p>
    </div>
  );
}
