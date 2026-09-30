import type { clienteSupabase } from "@/lib/supabase/server";
import type { Agrupar } from "@/lib/kpi";
import { inicioMes, lunesDe } from "@/lib/periodos";

/** Módulo Tiendas: la base devuelve los totales ya sumados (funciones tiendas_maestros y tiendas_panel). */
type Supabase = Awaited<ReturnType<typeof clienteSupabase>>;
const num = (v: unknown) => Number(v ?? 0);

export type MaestrosTiendas = {
  desde: string | null; hasta: string | null; tiendas: string[]; tipos: string[]; productos: { sku: string; producto: string }[];
};
export type Suma = { und: number; venta: number };
export type Panel = {
  dias: (Suma & { fecha: string })[];
  tiendas: (Suma & { tienda: string; dias: number })[];
  productos: (Suma & { sku: string; producto: string })[];
  tipos: (Suma & { tipo: string })[];
  cruce: (Suma & { tienda: string; sku: string })[];
};
export type FiltroTiendas = { tiendas: string[]; skus: string[]; tipos: string[]; dias: number[] };

export async function maestrosTiendas(sb: Supabase): Promise<MaestrosTiendas> {
  const { data, error } = await sb.rpc("tiendas_maestros");
  if (error) throw new Error(`Error leyendo la base: ${JSON.stringify(error)}`);
  return data as MaestrosTiendas;
}

export async function panel(sb: Supabase, desde: string, hasta: string, f: FiltroTiendas): Promise<Panel> {
  const { data, error } = await sb.rpc("tiendas_panel", {
    desde, hasta,
    p_tiendas: f.tiendas.length ? f.tiendas : null,
    p_skus: f.skus.length ? f.skus : null,
    p_tipos: f.tipos.length ? f.tipos : null,
    p_dias: f.dias.length < 7 ? f.dias : null,
  });
  if (error) throw new Error(`Error leyendo la base: ${JSON.stringify(error)}`);
  const d = data as Record<keyof Panel, Record<string, unknown>[]>;
  const suma = <T,>(filas: Record<string, unknown>[]) => filas.map((r) => ({ ...r, und: num(r.und), venta: num(r.venta) })) as T[];
  return {
    dias: suma(d.dias), tiendas: suma(d.tiendas).map((t) => ({ ...(t as Panel["tiendas"][number]), dias: num((t as { dias: unknown }).dias) })),
    productos: suma(d.productos), tipos: suma(d.tipos), cruce: suma(d.cruce),
  };
}

export const total = (filas: Suma[]): Suma => filas.reduce((a, f) => ({ und: a.und + f.und, venta: a.venta + f.venta }), { und: 0, venta: 0 });

/** Serie por día, semana (desde el lunes) o mes. */
export function agrupar(dias: Panel["dias"], g: Agrupar): (Suma & { periodo: string })[] {
  const m = new Map<string, Suma>();
  for (const d of dias) {
    const k = g === "dia" ? d.fecha : g === "semana" ? lunesDe(d.fecha) : inicioMes(d.fecha);
    const s = m.get(k) ?? { und: 0, venta: 0 };
    s.und += d.und; s.venta += d.venta;
    m.set(k, s);
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([periodo, s]) => ({ periodo, ...s }));
}
