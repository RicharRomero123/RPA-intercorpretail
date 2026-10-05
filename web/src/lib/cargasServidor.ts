// Datos que necesita el botón de carga de una vista: equivalencias de SKU, SKU oficiales e historial de cargas de ese tipo.
import type { clienteSupabase } from "@/lib/supabase/server";
import type { CargaWeb } from "@/components/HistorialCargas";
import type { Equivalencia, Tipo } from "./cargas";

type Supabase = Awaited<ReturnType<typeof clienteSupabase>>;
export type DatosCarga = { equivalencias: Equivalencia[]; skus: string[]; cargas: CargaWeb[] };

export async function datosCarga(sb: Supabase, tipo: Tipo): Promise<DatosCarga> {
  const [eq, m, c] = await Promise.all([
    sb.from("sku_equivalencia").select("sistema, codigo, sku"),
    sb.from("sku_maestro").select("sku"),
    sb.from("cargas_web").select("id, creada, correo, tipo, archivo, desde, hasta, filas, venta, estado, reemplazo_venta")
      .eq("tipo", tipo).in("estado", ["cargada", "deshecha"]).order("creada", { ascending: false }).limit(50),
  ]);
  return { equivalencias: (eq.data ?? []) as Equivalencia[], skus: (m.data ?? []).map((x) => x.sku as string), cargas: (c.data ?? []) as CargaWeb[] };
}
