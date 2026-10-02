import type { TipoRetail } from "@/components/Marco";
import type { clienteSupabase } from "@/lib/supabase/server";

/** Retail por tipos: la base devuelve los totales ya sumados (funciones retail_resumen, retail_limites y retail_panel). */
type Supabase = Awaited<ReturnType<typeof clienteSupabase>>;
const num = (v: unknown) => Number(v ?? 0);
const leer = async <T,>(p: PromiseLike<{ data: unknown; error: unknown }>) => {
  const { data, error } = await p;
  if (error) throw new Error(`Error leyendo la base: ${JSON.stringify(error)}`);
  return data as T;
};

/** Tipos de retail cargados desde el Excel de ventas retail (para el menú). */
export async function tiposRetail(sb: Supabase): Promise<TipoRetail[]> {
  return (await leer<TipoRetail[]>(sb.from("retail_tipos").select("tipo, slug").order("tipo"))) ?? [];
}

export async function limitesRetail(sb: Supabase, tipo?: string): Promise<{ desde: string | null; hasta: string | null }> {
  return leer(sb.rpc("retail_limites", tipo ? { p_tipo: tipo } : {}));
}

export type DiaComponente = { fecha: string; componente: string; slug: string; und: number; venta: number };
export async function resumenRetail(sb: Supabase, desde: string, hasta: string): Promise<DiaComponente[]> {
  const filas = await leer<Record<string, unknown>[]>(sb.rpc("retail_resumen", { desde, hasta }));
  return (filas ?? []).map((r) => ({ ...(r as DiaComponente), und: num(r.und), venta: num(r.venta) }));
}

export type FiltroRetail = { clientes: string[]; skus: string[]; status: string[] };
export type PanelRetail = {
  dias: { fecha: string; und: number; venta: number; lineas: number }[];
  clientes: { cliente: string; tipo: string; und: number; venta: number; despachos: number }[];
  productos: { sku: string; producto: string; und: number; venta: number }[];
  status: { status: string; und: number; venta: number; lineas: number }[];
  lineas: { fecha: string; cliente: string; tipo: string; sku: string; producto: string; und: number; precio_unitario: number | null;
            venta: number; condicion_pago: string | null; status: string | null; detalle_despacho: string | null }[];
};
export async function panelRetail(sb: Supabase, tipo: string, desde: string, hasta: string, f: FiltroRetail): Promise<PanelRetail> {
  const d = await leer<Record<keyof PanelRetail, Record<string, unknown>[]>>(sb.rpc("retail_panel", {
    desde, hasta, p_tipo: tipo,
    p_clientes: f.clientes.length ? f.clientes : null, p_skus: f.skus.length ? f.skus : null, p_status: f.status.length ? f.status : null,
  }));
  const n = <T,>(xs: Record<string, unknown>[], extra: string[] = []) =>
    xs.map((r) => ({ ...r, und: num(r.und), venta: num(r.venta), ...Object.fromEntries(extra.map((k) => [k, r[k] === null ? null : num(r[k])])) })) as T[];
  return {
    dias: n(d.dias, ["lineas"]), clientes: n(d.clientes, ["despachos"]), productos: n(d.productos),
    status: n(d.status, ["lineas"]), lineas: n(d.lineas, ["precio_unitario"]),
  };
}

/** Supermercados Peruanos: lo despachado por Calderón (Excel Ventas RETAIL) vs lo vendido al público y el stock en tiendas (portal). */
export type ConciliacionSellout = {
  inicio: string | null; inicio_venta?: string | null; hasta_venta: string | null; fecha_stock: string | null;
  productos: { sku: string; producto: string; primero: string | null; ultimo: string | null; despachado: number; monto: number;
               vendido: number; costo: number; venta: number; stock: number; locales: number | null }[];
  despachos: { fecha: string; sku: string; producto: string; und: number; precio: number; monto: number; status: string | null }[];
};
export type ConciliacionSPSA = ConciliacionSellout;
/** Despachado (Excel Ventas RETAIL) vs vendido y stock en tiendas de un cliente con sell-out (SPSA, OXXO). */
export async function conciliacionSellout(sb: Supabase, cliente: string, tipo: string): Promise<ConciliacionSellout> {
  const d = await leer<ConciliacionSellout>(sb.rpc("sellout_conciliacion", { p_cliente: cliente, p_tipo: tipo }));
  const n = <T extends object>(xs: T[], claves: (keyof T)[]) =>
    xs.map((x) => ({ ...x, ...Object.fromEntries(claves.map((k) => [k, num(x[k])])) })) as T[];
  return { ...d, productos: n(d.productos ?? [], ["despachado", "monto", "vendido", "costo", "venta", "stock"]),
           despachos: n(d.despachos ?? [], ["und", "precio", "monto"]) };
}
