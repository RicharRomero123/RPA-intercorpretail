// Productos más vendidos entre todos los canales: unidades de cada SKU por mes (función sku_mensual).
// Entran los canales con detalle por producto (Tiendas, Lima, Provincia y Retail); B2B y Rappi no lo tienen.
import { Pestanas } from "@/components/Pestanas";
import { Tabla, type Columna } from "@/components/Tabla";
import { porcentaje, soles } from "@/lib/formato";

export type FilaSku = { mes: number; canal: string; sku: string; producto: string; und: number; venta: number };

const CANALES = ["TIENDAS", "RETAIL", "LIMA", "PROVINCIA"];
type Reg = { sku: string; producto: string; und: number; venta: number; puesto?: number; part?: number | null;
             [k: string]: string | number | null | undefined };
const nombreCanal = (c: string) => c.charAt(0) + c.slice(1).toLowerCase();

export function ProductosTop({ filas, mesCorte, etiquetaMes, sinDetalle, archivo }: {
  filas: FilaSku[]; mesCorte: number; etiquetaMes: (m: number) => string;
  sinDetalle: { canales: string; monto: number; part: number | null }; archivo: string;
}) {
  const meses = Array.from({ length: mesCorte }, (_, i) => i + 1);
  const porSku = new Map<string, Reg>();
  for (const f of filas) {
    if (f.mes > mesCorte) continue;
    const x: Reg = porSku.get(f.sku) ?? { sku: f.sku, producto: f.producto, und: 0, venta: 0 };
    x[`m${f.mes}`] = Number(x[`m${f.mes}`] ?? 0) + f.und;
    x[f.canal] = Number(x[f.canal] ?? 0) + f.und;
    x.und += f.und;
    x.venta += f.venta;
    porSku.set(f.sku, x);
  }
  const totalUnd = [...porSku.values()].reduce((s, x) => s + Number(x.und), 0);
  const todos = [...porSku.values()].sort((a, b) => Number(b.und) - Number(a.und))
    .map((x, i) => ({ ...x, puesto: i + 1, part: totalUnd ? Number(x.und) / totalUnd : null }));
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
  const porCanal: Columna[] = [...base, ...CANALES.map((c) => ({ clave: c, titulo: `${nombreCanal(c)} und`, tipo: "entero" }) as Columna),
    { clave: "und", titulo: "Total und", tipo: "entero" }, { clave: "venta", titulo: "Venta S/", tipo: "soles" }];
  const maxUnd = Number(top[0]?.und ?? 0);
  const partTop = totalUnd ? suma(top, "und") / totalUnd : null;

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
        { id: "canal", titulo: "Top 10 por canal",
          contenido: <Tabla archivo={`top10_sku_canal_${archivo}.xlsx`} hoja="Por canal" filas={top} columnas={porCanal} total={total(top, "TOTAL TOP 10")} /> },
        { id: "todos", titulo: `Todos los SKU (${todos.length})`,
          contenido: <Tabla archivo={`sku_por_mes_${archivo}.xlsx`} hoja="SKU por mes" filas={todos} columnas={porMes} total={total(todos, "TOTAL")} buscar alto={520} /> },
      ]} />
      <p className="text-xs text-[var(--tenue)] max-w-4xl">
        Entran Tiendas, Retail (despachos), Lima y Provincia, que traen el detalle por producto y cuadran con los montos de arriba.
        {sinDetalle.monto > 0 && <> {sinDetalle.canales} no traen detalle por producto y quedan fuera ({soles(sinDetalle.monto)},
          {" "}{porcentaje(sinDetalle.part)} de la venta).</>}
      </p>
    </div>
  );
}
