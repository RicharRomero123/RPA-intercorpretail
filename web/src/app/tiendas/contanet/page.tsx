import type { CargaWeb } from "@/components/HistorialCargas";
import type { Equivalencia } from "@/lib/cargas";
import { avanceContaNet, avanceMesContaNet, clientesPorTienda, maestrosContaNet, metaMes, panelContaNet, productoTienda } from "@/lib/contanet";
import { datosEjecutivo } from "@/lib/ejecutivo";
import { tiposRetail } from "@/lib/retail";
import { clienteSupabase } from "@/lib/supabase/server";
import { vistaContaNet } from "./vista";

export const metadata = { title: "Tiendas · ContaNet · Calderón" };

export default async function TiendasContaNet({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const sb = await clienteSupabase();
  const { data: { user } } = await sb.auth.getUser();
  return vistaContaNet("tiendas", await searchParams, user?.email, {
    tipos: () => tiposRetail(sb),
    ejecutivo: (a, b, f) => datosEjecutivo(sb, "contanet_tiendas", a, b, f),
    maestros: () => maestrosContaNet(sb, "tiendas"),
    panel: (a, b, f) => panelContaNet(sb, "tiendas", a, b, f),
    clientesTiendas: (a, b, f) => clientesPorTienda(sb, "tiendas", a, b, f),
    productoTienda: (a, b, f) => productoTienda(sb, "tiendas", a, b, f),
    avanceMes: (fecha, geo) => avanceMesContaNet(sb, "tiendas", fecha),
    nombreMeta: "TIENDAS",
    avance: async (fecha) => {
      const avance = await avanceContaNet(sb, "tiendas", fecha);
      const meta = avance.fecha ? await metaMes(sb, "TIENDAS", Number(avance.fecha.slice(0, 4)), Number(avance.fecha.slice(5, 7))) : null;
      return { avance, meta };
    },
    carga: async () => {
      const [eq, m, c] = await Promise.all([
        sb.from("sku_equivalencia").select("sistema, codigo, sku"),
        sb.from("sku_maestro").select("sku"),
        sb.from("cargas_web").select("id, creada, correo, tipo, archivo, desde, hasta, filas, venta, estado, reemplazo_venta")
          .eq("tipo", "contanet").in("estado", ["cargada", "deshecha"]).order("creada", { ascending: false }).limit(50),
      ]);
      return { equivalencias: (eq.data ?? []) as Equivalencia[], skus: (m.data ?? []).map((x) => x.sku as string), cargas: (c.data ?? []) as CargaWeb[] };
    },
  });
}
