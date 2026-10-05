import type { ConfigEjecutivo, DatosEjecutivo, FilaDim, FilaMes } from "@/components/ResumenEjecutivo";
import type { clienteSupabase } from "@/lib/supabase/server";
import { conGeo, type FiltroGeo } from "@/lib/contanet";

/** Datos del resumen ejecutivo de un canal, con el periodo y los filtros de la página (función ejecutivo de la base). */
type Supabase = Awaited<ReturnType<typeof clienteSupabase>>;
export type Fuente = "retail" | "spsa" | "oxxo" | `retail:${string}` | "tiendas" | "contanet_tiendas" | "digital" | "digital_lima" | "digital_provincia" | "rappi";
/** Filtros de la página. Una lista vacía (o días = los 7) no filtra. */
export type FiltrosEjecutivo = Partial<Record<"tienda" | "sku" | "tipo" | "medio" | "cliente" | "status" | "cadena" | "zona" | "local", (string | number)[]>
  & { dias: number[]; geo: FiltroGeo }>;

/** Canal del consolidado cuya meta mensual corresponde a cada fuente. Sell-out (SPSA, OXXO) y tipos de retail no tienen meta propia. */
const META_CANAL: Partial<Record<string, string[]>> = {
  retail: ["RETAIL"], tiendas: ["TIENDAS"], contanet_tiendas: ["TIENDAS"], digital: ["LIMA", "PROVINCIA"],
  digital_lima: ["LIMA"], digital_provincia: ["PROVINCIA"], rappi: ["RAPPI"],
};

export async function datosEjecutivo(sb: Supabase, fuente: Fuente, desde: string, hasta: string, filtros: FiltrosEjecutivo = {}): Promise<DatosEjecutivo> {
  const { geo, ...resto } = filtros;
  const p_filtros = Object.fromEntries(Object.entries(resto)
    .filter(([k, v]) => v && v.length && !(k === "dias" && v.length >= 7))
    .map(([k, v]) => [k, (v as (string | number)[]).map(String)]));
  // Canal digital: el filtro por zona va dentro del nombre de la fuente.
  const { data, error } = await sb.rpc("ejecutivo", { p_fuente: conGeo(fuente, geo), desde, hasta, p_filtros });
  if (error) throw new Error(`Error leyendo la base: ${JSON.stringify(error)}`);
  const d = data as Record<"actual" | "anterior" | "meses" | "meses_ly", Record<string, unknown>[]>;
  const n = <T,>(xs: Record<string, unknown>[]) => (xs ?? []).map((r) => ({ ...r, und: Number(r.und ?? 0), venta: Number(r.venta ?? 0) })) as T[];

  // Meta mensual del canal (consolidado). La meta es del canal completo: con filtros de tienda, producto, zona, etc. no se compara.
  const canales = META_CANAL[fuente];
  const filtrado = Object.keys(p_filtros).length > 0 || conGeo(fuente, geo) !== fuente;
  let metas: Record<string, number> | null = null;
  let sinMeta: string | null = !canales ? "Este canal no tiene meta en el consolidado." : filtrado ? "La meta es del canal completo: quita los filtros para compararla." : null;
  if (canales && !filtrado) {
    const { data: m } = await sb.from("consolidado_mensual").select("anio, mes, meta").in("canal", canales).eq("anio", Number(hasta.slice(0, 4)));
    metas = {};
    for (const r of m ?? []) {
      if (r.meta === null) continue;
      const k = `${r.anio}-${String(r.mes).padStart(2, "0")}`;
      metas[k] = (metas[k] ?? 0) + Number(r.meta);
    }
    if (!Object.keys(metas).length) { metas = null; sinMeta = "Todavía no hay metas cargadas para este año."; }
  }
  return { actual: n<FilaDim>(d.actual), anterior: n<FilaDim>(d.anterior), meses: n<FilaMes>(d.meses), mesesLY: n<FilaMes>(d.meses_ly), metas, sinMeta };
}

/** Qué es «cliente» en cada canal. */
export const CONFIG: Record<"retail" | "spsa" | "oxxo" | "tipo" | "tiendas" | "contanet_tiendas" | "digital" | "digital_lima" | "digital_provincia" | "rappi", ConfigEjecutivo> = {
  retail: { dim: "Cliente", dims: "clientes", activos: "Clientes activos", venta: "Venta retail S/",
            nota: "Monto cancelado de los despachos a cada cliente retail (Excel «Ventas RETAIL»); cuadra con el consolidado en RETAIL." },
  spsa: { dim: "Cadena", dims: "cadenas", activos: "Cadenas activas", venta: "Ingreso Calderón S/",
          nota: "Venta a costo (lo que SPSA le paga a Calderón por lo vendido), del portal de Intercorp." },
  oxxo: { dim: "Cluster", dims: "clusters", activos: "Clusters con venta", venta: "Venta neta OXXO S/",
          nota: "Venta neta que reporta OXXO en sus reportes diarios por tienda (sell-out). Cluster A/B/C según OXXO." },
  tipo: { dim: "Cliente", dims: "clientes", activos: "Clientes activos", venta: "Monto S/", nota: "Monto cancelado de los despachos, del Excel de ventas retail." },
  tiendas: { dim: "Tienda", dims: "tiendas", activos: "Tiendas activas", venta: "Venta S/",
             nota: "Del reporte interno (Excel de venta diaria de las tiendas)." },
  contanet_tiendas: { dim: "Tienda", dims: "tiendas", activos: "Tiendas activas", venta: "Venta S/", nota: "Comprobantes de ContaNet de las 7 tiendas, sin RAPPI ni el canal digital." },
  digital: { dim: "Cliente", dims: "clientes", activos: "Clientes activos", venta: "Venta S/",
             nota: "Comprobantes de ContaNet del usuario VENTAS01. Las ventas sin DNI/RUC se agrupan como «PÚBLICO GENERAL»." },
  digital_lima: { dim: "Cliente", dims: "clientes", activos: "Clientes activos", venta: "Venta S/",
                  nota: "Canal digital · Lima (delivery): comprobantes de VENTAS01 que el reporte de ventas virtuales marca como DELIVERY." },
  digital_provincia: { dim: "Cliente", dims: "clientes", activos: "Clientes activos", venta: "Venta S/",
                       nota: "Canal digital · Provincia: comprobantes de VENTAS01 que el reporte de ventas virtuales marca como PROVINCIA." },
  rappi: { dim: "Tienda", dims: "tiendas", activos: "Tiendas activas", venta: "Venta S/", nota: "Ventas de las tiendas cobradas con RAPPI en ContaNet." },
};
