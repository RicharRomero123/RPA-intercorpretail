import { tiposRetail } from "@/lib/retail";
import { clienteSupabase } from "@/lib/supabase/server";
import type { FilaSku } from "./productos";
import { vistaConsolidado, type Celda, type DatosTiendas } from "./vista";

export const metadata = { title: "Resumen general · Calderón" };

export default async function ResumenGeneral({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const sp = await searchParams;
  const sb = await clienteSupabase();
  const { data: { user } } = await sb.auth.getUser();
  const [{ data: filas }, { data: cargas }, tipos] = await Promise.all([
    sb.from("consolidado_mensual").select("canal, anio, mes, real, meta"),
    sb.from("consolidado_cargas").select("archivo, corte").order("id", { ascending: false }).limit(1),
    tiposRetail(sb),
  ]);
  const corte = (cargas?.[0] as { corte?: string } | undefined)?.corte;
  // Unidades por SKU y mes de todos los canales con detalle por producto, hasta el fin del mes del corte.
  const { data: sku } = corte ? await sb.rpc("sku_mensual", { p_anio: Number(corte.slice(0, 4)),
    p_corte: new Date(Date.UTC(Number(corte.slice(0, 4)), Number(corte.slice(5, 7)), 0)).toISOString().slice(0, 10) }) : { data: [] };
  const productos: FilaSku[] = ((sku ?? []) as FilaSku[]).map((f) => ({ ...f, und: Number(f.und), venta: Number(f.venta) }));
  // B2B: sus pedidos (Excel «Ventas B2B», ya con SKU de ContaNet) hasta el fin del mes del corte, como un canal más con detalle por producto.
  if (corte) {
    const finCorte = new Date(Date.UTC(Number(corte.slice(0, 4)), Number(corte.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const [{ data: b2b }, { data: nombres }] = await Promise.all([
      sb.from("b2b_ventas").select("fecha, sku, und, venta").gte("fecha", `${corte.slice(0, 4)}-01-01`).lte("fecha", finCorte),
      sb.from("sku_maestro").select("sku, producto"),
    ]);
    const nombre = new Map((nombres ?? []).map((n) => [String(n.sku), String(n.producto)]));
    const porMesSku = new Map<string, FilaSku>();
    for (const f of b2b ?? []) {
      const mes = Number(String(f.fecha).slice(5, 7)), s = String(f.sku ?? "SIN SKU"), k = `${mes}|${s}`;
      const x = porMesSku.get(k) ?? { mes, canal: "B2B", sku: s, producto: nombre.get(s) ?? s, und: 0, venta: 0 };
      x.und += Number(f.und); x.venta += Number(f.venta);
      porMesSku.set(k, x);
    }
    productos.push(...porMesSku.values());
  }
  // Tiendas: meta de cada tienda (Excel «Metas tiendas») y su venta real por mes (Power BI).
  const anio = corte ? Number(corte.slice(0, 4)) : null;
  const [{ data: metasT }, { data: ventasT }] = anio ? await Promise.all([
    sb.from("meta_tienda").select("mes, tienda, meta").eq("anio", anio),
    sb.rpc("tiendas_mensual", { p_anio: anio }),
  ]) : [{ data: [] }, { data: null }];
  const vt = ventasT as { hasta: string | null; filas: { anio: number; mes: number; tienda: string; venta: number }[] } | null;
  const tiendas: DatosTiendas = {
    metas: (metasT ?? []).map((f) => ({ mes: Number(f.mes), tienda: String(f.tienda), meta: Number(f.meta) })),
    ventas: (vt?.filas ?? []).map((f) => ({ ...f, venta: Number(f.venta) })), hasta: vt?.hasta ?? null,
  };
  const celdas: Celda[] = (filas ?? []).map((f) => ({ ...(f as Celda), real: f.real === null ? null : Number(f.real), meta: f.meta === null ? null : Number(f.meta) }));
  // Tiendas sale del Power BI (al día que llegue), no del Excel consolidado; el total del negocio se recalcula con esa diferencia.
  const pbi = new Map<string, number>();
  for (const f of tiendas.ventas) pbi.set(`${f.anio}-${f.mes}`, (pbi.get(`${f.anio}-${f.mes}`) ?? 0) + f.venta);
  for (const [k, venta] of pbi) {
    const [a, m] = k.split("-").map(Number);
    const t = celdas.find((c) => c.canal === "TIENDAS" && c.anio === a && c.mes === m);
    const tot = celdas.find((c) => c.canal === "CALDERON" && c.anio === a && c.mes === m);
    if (!t || !tot) continue;
    tot.real = (tot.real ?? 0) - (t.real ?? 0) + venta;
    t.real = venta;
  }
  // El corte del Excel consolidado es el de Tiendas (los demás canales del Excel vienen con el mes completo). Si el Power BI llega más
  // lejos dentro del mismo mes, el corte de la página pasa a ser el del Power BI.
  const carga = (cargas?.[0] as { archivo: string; corte: string } | undefined) ?? null;
  const hastaT = tiendas.hasta ? String(tiendas.hasta) : null;
  const cargaEf = carga && hastaT && hastaT > String(carga.corte) && hastaT.slice(0, 7) === String(carga.corte).slice(0, 7)
    ? { ...carga, corte: hastaT } : carga;
  return vistaConsolidado(celdas, cargaEf, tipos, user?.email, sp, productos, tiendas);
}
