// Productos más vendidos del sell-out (OXXO, SPSA): el mismo bloque que en el Resumen general. Ranking de SKU partido por
// cadena/cluster, mapa de calor producto × día (o semana/mes) y abajo las tablas: Top 10 por periodo y todos los SKU.
import { GraficosProductos } from "@/components/GraficosProductos";
import { Pestanas } from "@/components/Pestanas";
import { Tabla, type Columna } from "@/components/Tabla";
import type { FilaVenta } from "@/lib/datos";
import { porcentaje } from "@/lib/formato";
import type { Agrupar } from "@/lib/kpi";
import { inicioMes, lunesDe } from "@/lib/periodos";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
/** Colores de las partes de cada barra (hasta 4 cadenas o clusters; con más, la barra va de un solo color). */
const COLORES = ["var(--serie-1)", "var(--serie-2)", "var(--serie-3)", "var(--serie-gris)"];
type Reg = { sku: string; producto: string; und: number; venta: number; costo: number; puesto?: number; part?: number | null;
             [k: string]: string | number | null | undefined };

export function TopSku({ filas, agrupar, archivo, nombreCadena }: {
  filas: FilaVenta[]; agrupar: Agrupar; archivo: string; /** «Cluster», «Cadena»… */ nombreCadena: string;
}) {
  // Columnas del mapa de calor: las del agrupado elegido; con más de 31 días se pasa a semanas para que se lea.
  const dias = new Set(filas.map((f) => f.fecha)).size;
  const unidad: Agrupar = agrupar === "dia" && dias > 31 ? "semana" : agrupar;
  const periodoDe = (d: string) => (unidad === "semana" ? lunesDe(d) : unidad === "mes" ? inicioMes(d) : d);
  const etiqueta = (p: string) => unidad === "mes" ? `${MESES[Number(p.slice(5, 7)) - 1]} ${p.slice(2, 4)}`
    : `${unidad === "semana" ? "Sem " : ""}${Number(p.slice(8, 10))} ${MESES[Number(p.slice(5, 7)) - 1].toLowerCase()}`;

  const porSku = new Map<string, Reg>();
  for (const f of filas) {
    const p = periodoDe(f.fecha);
    const x: Reg = porSku.get(f.sku) ?? { sku: f.sku, producto: f.producto, und: 0, venta: 0, costo: 0 };
    x[`p_${p}`] = Number(x[`p_${p}`] ?? 0) + f.und;
    x[`v_${p}`] = Number(x[`v_${p}`] ?? 0) + f.venta;
    x[`c_${f.cadena}`] = Number(x[`c_${f.cadena}`] ?? 0) + f.und;
    x[`cv_${f.cadena}`] = Number(x[`cv_${f.cadena}`] ?? 0) + f.venta;
    x.und += f.und; x.venta += f.venta; x.costo += f.costo;
    porSku.set(f.sku, x);
  }
  const periodos = [...new Set(filas.map((f) => periodoDe(f.fecha)))].sort();
  const cadenas = [...new Set(filas.map((f) => f.cadena))].sort((a, b) => (a.startsWith("Sin") ? 1 : 0) - (b.startsWith("Sin") ? 1 : 0) || a.localeCompare(b));
  const grupos = cadenas.length <= COLORES.length ? cadenas.map((c, i) => ({ clave: c, nombre: c, color: COLORES[i] })) : [];
  const totalUnd = filas.reduce((s, f) => s + f.und, 0), totalVenta = filas.reduce((s, f) => s + f.venta, 0);
  const todos = [...porSku.values()].sort((a, b) => b.und - a.und || b.venta - a.venta)
    .map((x, i): Reg => ({ ...x, puesto: i + 1, part: totalUnd ? x.und / totalUnd : null }));
  const top = todos.slice(0, 10);
  const suma = (l: Reg[], k: string) => l.reduce((s, x) => s + Number(x[k] ?? 0), 0);
  const total = (l: Reg[], titulo: string) => ({ sku: "", producto: titulo, und: suma(l, "und"), venta: suma(l, "venta"), costo: suma(l, "costo"),
    part: totalUnd ? suma(l, "und") / totalUnd : null, ...Object.fromEntries(periodos.map((p) => [`p_${p}`, suma(l, `p_${p}`)])) });

  const columnas: Columna[] = [{ clave: "puesto", titulo: "#", tipo: "entero" }, { clave: "producto", titulo: "Producto", tipo: "texto" },
    { clave: "sku", titulo: "SKU", tipo: "texto" }, ...periodos.map((p) => ({ clave: `p_${p}`, titulo: `${etiqueta(p)} und`, tipo: "entero" }) as Columna),
    { clave: "und", titulo: "Total und", tipo: "entero" }, { clave: "venta", titulo: "Venta público S/", tipo: "soles" },
    { clave: "costo", titulo: "Ingreso Calderón S/", tipo: "soles" }, { clave: "part", titulo: "% de las und", tipo: "porcentaje" }];
  const partTop = totalUnd ? suma(top, "und") / totalUnd : null;
  const plural = unidad === "dia" ? "días" : unidad === "semana" ? "semanas" : "meses";

  return (
    <div className="grid gap-4">
      <p className="text-sm text-[var(--tenue)] max-w-4xl">
        {todos.length > 10 ? <>Los 10 productos con más <b className="text-[var(--tinta)]">unidades</b> vendidas al público en el periodo: concentran
          el <b className="text-[var(--tinta)]">{porcentaje(partTop)}</b> de las {Math.round(totalUnd).toLocaleString("en-US")} unidades.</>
          : <>Los {todos.length} productos vendidos al público en el periodo, de más a menos <b className="text-[var(--tinta)]">unidades</b> ({Math.round(totalUnd).toLocaleString("en-US")} en total).</>}
        {unidad !== agrupar && <> El mapa de calor va por semanas porque el periodo tiene más de 31 días.</>}
      </p>
      <GraficosProductos meses={periodos} etiquetas={Object.fromEntries(periodos.map((p) => [p, etiqueta(p)]))} total={{ und: totalUnd, venta: totalVenta }}
                         grupos={grupos} nombreGrupos={nombreCadena.toLowerCase()} unidad={unidad === "dia" ? "día" : unidad} plural={plural}
                         productos={top.map((x) => ({
                           sku: x.sku, producto: x.producto, und: x.und, venta: x.venta,
                           canales: Object.fromEntries(cadenas.map((c) => [c, { und: Number(x[`c_${c}`] ?? 0), venta: Number(x[`cv_${c}`] ?? 0) }])),
                           meses: Object.fromEntries(periodos.map((p) => [p, { und: Number(x[`p_${p}`] ?? 0), venta: Number(x[`v_${p}`] ?? 0) }])),
                         }))} />
      <h4 className="text-sm font-semibold">Los números, en detalle</h4>
      <Pestanas pestanas={[
        { id: "top", titulo: `Top 10 por ${unidad === "dia" ? "día" : unidad}`,
          contenido: <Tabla archivo={`${archivo}_top10_sku.xlsx`} hoja="Top 10" filas={top} columnas={columnas} total={total(top, "TOTAL TOP 10")} /> },
        { id: "todos", titulo: `Todos los SKU (${todos.length})`,
          contenido: <Tabla archivo={`${archivo}_sku.xlsx`} hoja="SKU" filas={todos} columnas={columnas} total={total(todos, "TOTAL")} buscar alto={520} /> },
      ]} />
    </div>
  );
}
