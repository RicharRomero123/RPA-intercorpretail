import { clienteSupabase } from "@/lib/supabase/server";

export const CLIENTE = "SPSA";

export type FilaVenta = {
  fecha: string; sku: string; producto: string; cod_local: number; local: string; cadena: string; zona: string;
  und: number; venta: number; costo: number;
};
export type FilaInventario = {
  fecha_inv: string; sku: string; producto: string; cod_local: number; local: string; cadena: string; zona: string;
  inv_und: number; inv_costo: number;
};
export type Local = { cod_local: number; nombre: string; cadena: string; zona: string };
export type Producto = { sku: string; nombre: string };
export type Carga = {
  cuando: string; fecha: string; nivel: string; estado: string; filas: number; und: number; venta: number; detalle: string;
};

type Supabase = Awaited<ReturnType<typeof clienteSupabase>>;
const num = (v: unknown) => Number(v ?? 0);

/** Supabase devuelve como máximo 1000 filas por consulta: se piden por páginas hasta traer todo. */
async function todas<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>) {
  const salida: T[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await consulta(i, i + 999);
    if (error) throw new Error(`Error leyendo la base: ${JSON.stringify(error)}`);
    salida.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return salida;
  }
}

export async function limites(sb: Supabase) {
  const ult = await sb.from("venta_producto_dia").select("fecha").eq("cliente", CLIENTE).order("fecha", { ascending: false }).limit(1);
  const pri = await sb.from("venta_producto_dia").select("fecha").eq("cliente", CLIENTE).gt("und", 0).order("fecha").limit(1);
  const inv = await sb.from("inventario_local").select("fecha_inv").eq("cliente", CLIENTE).order("fecha_inv", { ascending: false }).limit(1);
  return {
    ultimo: (ult.data?.[0]?.fecha as string | undefined) ?? null,
    primeraVenta: (pri.data?.[0]?.fecha as string | undefined) ?? null,
    fechaInventario: (inv.data?.[0]?.fecha_inv as string | undefined) ?? null,
  };
}

export async function maestros(sb: Supabase) {
  const [loc, prod] = await Promise.all([
    todas<Local>((a, b) => sb.from("locales").select("cod_local, nombre, cadena, zona").eq("cliente", CLIENTE).order("nombre").range(a, b)),
    todas<Producto>((a, b) => sb.from("productos").select("sku, nombre").eq("cliente", CLIENTE).order("nombre").range(a, b)),
  ]);
  return { locales: loc, productos: prod };
}

export type Filtro = { skus: string[]; cadenas: string[]; zonas: string[]; locales: number[] };

export async function ventas(sb: Supabase, desde: string, hasta: string, f: Filtro): Promise<FilaVenta[]> {
  const filas = await todas<FilaVenta>((a, b) => {
    let q = sb.from("v_venta_local").select("fecha, sku, producto, cod_local, local, cadena, zona, und, venta, costo")
      .eq("cliente", CLIENTE).gte("fecha", desde).lte("fecha", hasta);
    if (f.skus.length) q = q.in("sku", f.skus);
    if (f.cadenas.length) q = q.in("cadena", f.cadenas);
    if (f.zonas.length) q = q.in("zona", f.zonas);
    if (f.locales.length) q = q.in("cod_local", f.locales);
    return q.order("fecha").order("sku").order("cod_local").range(a, b);
  });
  return filas.map((r) => ({ ...r, und: num(r.und), venta: num(r.venta), costo: num(r.costo) }));
}

export async function inventario(sb: Supabase, fecha: string, f: Filtro): Promise<FilaInventario[]> {
  const filas = await todas<FilaInventario>((a, b) => {
    let q = sb.from("v_inventario").select("fecha_inv, sku, producto, cod_local, local, cadena, zona, inv_und, inv_costo")
      .eq("cliente", CLIENTE).eq("fecha_inv", fecha);
    if (f.skus.length) q = q.in("sku", f.skus);
    if (f.cadenas.length) q = q.in("cadena", f.cadenas);
    if (f.zonas.length) q = q.in("zona", f.zonas);
    if (f.locales.length) q = q.in("cod_local", f.locales);
    return q.order("sku").order("cod_local").range(a, b);
  });
  return filas.map((r) => ({ ...r, inv_und: num(r.inv_und), inv_costo: num(r.inv_costo) }));
}

export async function cargas(sb: Supabase): Promise<Carga[]> {
  const { data } = await sb.from("cargas").select("cuando, fecha, nivel, estado, filas, und, venta, detalle")
    .eq("cliente", CLIENTE).order("id", { ascending: false }).limit(300);
  return (data ?? []).map((r) => ({ ...r, und: num(r.und), venta: num(r.venta) })) as Carga[];
}
