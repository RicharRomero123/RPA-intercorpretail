import type { CargaWeb } from "@/components/HistorialCargas";
import type { Equivalencia } from "@/lib/cargas";
import { avanceContaNet, clientesPorTienda, maestrosContaNet, metaMes, panelContaNet } from "@/lib/contanet";
import { datosEjecutivo } from "@/lib/ejecutivo";
import { tiposRetail } from "@/lib/retail";
import { clienteSupabase } from "@/lib/supabase/server";
import { vistaContaNet } from "@/app/tiendas/contanet/vista";

export const metadata = { title: "Rappi · Calderón" };

export default async function CanalRappi({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const sb = await clienteSupabase();
  const { data: { user } } = await sb.auth.getUser();
  return vistaContaNet("rappi", await searchParams, user?.email, {
    tipos: () => tiposRetail(sb),
    ejecutivo: (a, b, f) => datosEjecutivo(sb, "rappi", a, b, f),
    maestros: () => maestrosContaNet(sb, "rappi"),
    panel: (a, b, f) => panelContaNet(sb, "rappi", a, b, f),
    clientesTiendas: (a, b, f) => clientesPorTienda(sb, "rappi", a, b, f),
    avance: async () => {
      const avance = await avanceContaNet(sb, "rappi");
      const meta = avance.fecha ? await metaMes(sb, "RAPPI", Number(avance.fecha.slice(0, 4)), Number(avance.fecha.slice(5, 7))) : null;
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
