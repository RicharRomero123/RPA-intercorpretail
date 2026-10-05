import { tiposRetail } from "@/lib/retail";
import { clienteSupabase } from "@/lib/supabase/server";
import type { FilaSku } from "./productos";
import { vistaConsolidado, type Celda } from "./vista";

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
  const celdas: Celda[] = (filas ?? []).map((f) => ({ ...(f as Celda), real: f.real === null ? null : Number(f.real), meta: f.meta === null ? null : Number(f.meta) }));
  return vistaConsolidado(celdas, (cargas?.[0] as { archivo: string; corte: string } | undefined) ?? null, tipos, user?.email, sp, productos);
}
