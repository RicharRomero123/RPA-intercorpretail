import type { CargaWeb } from "@/components/HistorialCargas";
import type { Equivalencia } from "@/lib/cargas";
import { avanceContaNet, avanceMesContaNet, clientesPorTienda, cuadreDigital, maestrosContaNet, metaMes, opcionesDigital, panelContaNet, zonasDigital } from "@/lib/contanet";
import { fechaLarga } from "@/lib/periodos";
import { seccionCuadre } from "./cuadre";
import { datosEjecutivo } from "@/lib/ejecutivo";
import { tiposRetail } from "@/lib/retail";
import { clienteSupabase } from "@/lib/supabase/server";
import { vistaContaNet } from "@/app/tiendas/contanet/vista";

export const metadata = { title: "Canal digital · Calderón" };

export default async function CanalDigital({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const sb = await clienteSupabase();
  const { data: { user } } = await sb.auth.getUser();
  return vistaContaNet("digital", await searchParams, user?.email, {
    tipos: () => tiposRetail(sb),
    ejecutivo: (a, b, f) => datosEjecutivo(sb, "digital", a, b, f),
    maestros: () => maestrosContaNet(sb, "digital"),
    panel: (a, b, f) => panelContaNet(sb, "digital", a, b, f),
    clientesTiendas: (a, b, f) => clientesPorTienda(sb, "digital", a, b, f),
    cuadre: async (a, b) => seccionCuadre(await cuadreDigital(sb, a, b), `${fechaLarga(a)} – ${fechaLarga(b)}`),
    geo: { opciones: () => opcionesDigital(sb, "digital"), zonas: (a, b, f) => zonasDigital(sb, "digital", a, b, f) },
    avanceMes: (fecha, geo) => avanceMesContaNet(sb, "digital", fecha, geo),
    nombreMeta: "LIMA + PROVINCIA",
    avance: async (fecha, geo) => {
      const avance = await avanceContaNet(sb, "digital", fecha, geo);
      // Meta del canal digital = LIMA + PROVINCIA del consolidado (el reporte virtual cuadra con esos dos canales).
      const [a, m] = avance.fecha ? [Number(avance.fecha.slice(0, 4)), Number(avance.fecha.slice(5, 7))] : [0, 0];
      const metas = avance.fecha ? await Promise.all([metaMes(sb, "LIMA", a, m), metaMes(sb, "PROVINCIA", a, m)]) : [null, null];
      const meta = metas.every((x) => x === null) ? null : (metas[0] ?? 0) + (metas[1] ?? 0);
      return { avance, meta };
    },
    carga: async () => {
      const [eq, m, c] = await Promise.all([
        sb.from("sku_equivalencia").select("sistema, codigo, sku"),
        sb.from("sku_maestro").select("sku"),
        sb.from("cargas_web").select("id, creada, correo, tipo, archivo, desde, hasta, filas, venta, estado, reemplazo_venta")
          .in("tipo", ["contanet", "virtual"]).in("estado", ["cargada", "deshecha"]).order("creada", { ascending: false }).limit(50),
      ]);
      return { equivalencias: (eq.data ?? []) as Equivalencia[], skus: (m.data ?? []).map((x) => x.sku as string), cargas: (c.data ?? []) as CargaWeb[] };
    },
  });
}
