import type { ConfigEjecutivo, DatosEjecutivo, FilaDim, FilaMes } from "@/components/ResumenEjecutivo";
import type { clienteSupabase } from "@/lib/supabase/server";

/** Datos del resumen ejecutivo de un canal, con el periodo y los filtros de la página (función ejecutivo de la base). */
type Supabase = Awaited<ReturnType<typeof clienteSupabase>>;
export type Fuente = "retail" | "spsa" | `retail:${string}` | "tiendas" | "contanet_tiendas" | "digital" | "rappi";
/** Filtros de la página. Una lista vacía (o días = los 7) no filtra. */
export type FiltrosEjecutivo = Partial<Record<"tienda" | "sku" | "tipo" | "medio" | "cliente" | "status" | "cadena" | "zona" | "local", (string | number)[]>
  & { dias: number[] }>;

export async function datosEjecutivo(sb: Supabase, fuente: Fuente, desde: string, hasta: string, filtros: FiltrosEjecutivo = {}): Promise<DatosEjecutivo> {
  const p_filtros = Object.fromEntries(Object.entries(filtros)
    .filter(([k, v]) => v && v.length && !(k === "dias" && v.length >= 7))
    .map(([k, v]) => [k, v!.map(String)]));
  const { data, error } = await sb.rpc("ejecutivo", { p_fuente: fuente, desde, hasta, p_filtros });
  if (error) throw new Error(`Error leyendo la base: ${JSON.stringify(error)}`);
  const d = data as Record<"actual" | "anterior" | "meses" | "meses_ly", Record<string, unknown>[]>;
  const n = <T,>(xs: Record<string, unknown>[]) => (xs ?? []).map((r) => ({ ...r, und: Number(r.und ?? 0), venta: Number(r.venta ?? 0) })) as T[];
  return { actual: n<FilaDim>(d.actual), anterior: n<FilaDim>(d.anterior), meses: n<FilaMes>(d.meses), mesesLY: n<FilaMes>(d.meses_ly) };
}

/** Qué es «cliente» en cada canal. */
export const CONFIG: Record<"retail" | "spsa" | "tipo" | "tiendas" | "contanet_tiendas" | "digital" | "rappi", ConfigEjecutivo> = {
  retail: { dim: "Cliente", dims: "clientes", activos: "Clientes activos", venta: "Venta retail S/",
            nota: "Monto cancelado de los despachos a cada cliente retail (Excel «Ventas RETAIL»); cuadra con el consolidado en RETAIL." },
  spsa: { dim: "Cadena", dims: "cadenas", activos: "Cadenas activas", venta: "Ingreso Calderón S/",
          nota: "Venta a costo (lo que SPSA le paga a Calderón por lo vendido), del portal de Intercorp." },
  tipo: { dim: "Cliente", dims: "clientes", activos: "Clientes activos", venta: "Monto S/", nota: "Monto cancelado de los despachos, del Excel de ventas retail." },
  tiendas: { dim: "Tienda", dims: "tiendas", activos: "Tiendas activas", venta: "Venta S/",
             nota: "Del reporte interno (Excel de venta diaria de las tiendas)." },
  contanet_tiendas: { dim: "Tienda", dims: "tiendas", activos: "Tiendas activas", venta: "Venta S/", nota: "Comprobantes de ContaNet de las 7 tiendas, sin RAPPI ni el canal digital." },
  digital: { dim: "Cliente", dims: "clientes", activos: "Clientes activos", venta: "Venta S/",
             nota: "Comprobantes de ContaNet del usuario VENTAS01. Las ventas sin DNI/RUC se agrupan como «PÚBLICO GENERAL»." },
  rappi: { dim: "Tienda", dims: "tiendas", activos: "Tiendas activas", venta: "Venta S/", nota: "Ventas de las tiendas cobradas con RAPPI en ContaNet." },
};
