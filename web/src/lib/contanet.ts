import type { clienteSupabase } from "@/lib/supabase/server";

/** Tiendas · ContaNet: la base devuelve los totales ya sumados (contanet_maestros, contanet_panel, tiendas_conciliacion). */
type Supabase = Awaited<ReturnType<typeof clienteSupabase>>;
const num = (v: unknown) => Number(v ?? 0);
const leer = async <T,>(p: PromiseLike<{ data: unknown; error: unknown }>) => {
  const { data, error } = await p;
  if (error) throw new Error(`Error leyendo la base: ${JSON.stringify(error)}`);
  return data as T;
};
/** Convierte a número las columnas indicadas (la base devuelve los numeric como texto o número). */
const numeros = <T,>(xs: Record<string, unknown>[], claves: string[]) =>
  xs.map((r) => ({ ...r, ...Object.fromEntries(claves.map((k) => [k, num(r[k])])) })) as T[];

export type MaestrosContaNet = {
  desde: string | null; hasta: string | null; tiendas: string[]; medios: string[]; productos: { sku: string; producto: string }[];
};
/** Canal dentro del reporte de ContaNet: tiendas, canal digital (usuario VENTAS01) —total, Lima o Provincia— o Rappi (cobrado con RAPPI). */
export type CanalContaNet = "tiendas" | "digital" | "digital_lima" | "digital_provincia" | "rappi";
export const maestrosContaNet = (sb: Supabase, canal: CanalContaNet) => leer<MaestrosContaNet>(sb.rpc("contanet_maestros", { p_canal: canal }));

type Base = { und: number; venta: number; tickets: number };
export type PanelContaNet = {
  dias: (Base & { fecha: string })[];
  tiendas: (Base & { tienda: string; dias: number })[];
  productos: (Base & { sku: string; producto: string })[];
  horas: (Base & { hora: number })[];
  medios: (Base & { medio: string })[];
  comprobantes: { tipo: string; und: number; venta: number; documentos: number }[];
  clientes: (Base & { doc: string; tipo_doc: string; cliente: string; ultima: string })[];
};
/** Filtro por zona del canal digital: subcanal (Lima/Provincia), distrito, provincia, departamento. */
export type ClaveGeo = "subc" | "dist" | "prov" | "dep";
export type FiltroGeo = Partial<Record<ClaveGeo, string[]>>;
export type FiltroContaNet = { tiendas: string[]; skus: string[]; medios: string[]; dias: number[]; geo?: FiltroGeo };

/** El filtro por zona viaja dentro del nombre del canal ('digital_provincia|{"dep":["Áncash"]}'): así lo aplican todas las funciones. */
export function conGeo(canal: string, geo?: FiltroGeo): string {
  const g = Object.fromEntries(Object.entries(geo ?? {}).filter(([, v]) => v && v.length));
  return Object.keys(g).length ? `${canal}|${JSON.stringify(g)}` : canal;
}

export type OpcionesGeo = Record<ClaveGeo, string[]>;

/** Cuadre del canal digital: ContaNet (VENTAS01) vs reporte de ventas virtuales, comprobante por comprobante. */
export type CuadreDigital = {
  inicio: string | null;
  resumen: { estado: string; comprobantes: number; contanet: number; reporte: number }[];
  por_dia: { fecha: string; contanet: number; reporte: number; sobra: number; falta: number; dif_monto: number }[];
  detalle: { estado: string; comprobante: string; tipo: string | null; cliente: string | null; medio: string | null; fecha_contanet: string | null;
             fecha_reporte: string | null; contanet: number | null; reporte: number | null; canal: string | null; zona: string | null; motivo: string | null }[];
};
export async function cuadreDigital(sb: Supabase, desde: string, hasta: string): Promise<CuadreDigital> {
  const d = await leer<CuadreDigital>(sb.rpc("digital_cuadre", { desde, hasta }));
  const opc = (v: unknown) => (v === null || v === undefined ? null : num(v));
  return {
    inicio: d.inicio,
    resumen: numeros(d.resumen ?? [], ["comprobantes", "contanet", "reporte"]),
    por_dia: numeros(d.por_dia ?? [], ["contanet", "reporte", "sobra", "falta", "dif_monto"]),
    detalle: (d.detalle ?? []).map((x) => ({ ...x, contanet: opc(x.contanet), reporte: opc(x.reporte) })),
  };
}
export const opcionesDigital = (sb: Supabase, canal: CanalContaNet) => leer<OpcionesGeo>(sb.rpc("digital_opciones", { p_canal: canal }));

export type Zona = { subcanal: string; departamento: string; provincia: string; distrito: string; venta: number; und: number; pedidos: number; clientes: number };
export async function zonasDigital(sb: Supabase, canal: CanalContaNet, desde: string, hasta: string, f: FiltroContaNet): Promise<Zona[]> {
  const { p_skus, p_medios, p_dias } = parametros(f);
  const filas = await leer<Record<string, unknown>[]>(sb.rpc("digital_zonas", { p_canal: conGeo(canal, f.geo), desde, hasta, p_skus, p_medios, p_dias }));
  return numeros<Zona>(filas ?? [], ["venta", "und", "pedidos", "clientes"]);
}

export async function panelContaNet(sb: Supabase, canal: CanalContaNet, desde: string, hasta: string, f: FiltroContaNet): Promise<PanelContaNet> {
  const d = await leer<Record<keyof PanelContaNet, Record<string, unknown>[]>>(sb.rpc("contanet_panel", {
    p_canal: conGeo(canal, f.geo), desde, hasta, p_tiendas: f.tiendas.length ? f.tiendas : null, p_skus: f.skus.length ? f.skus : null,
    p_medios: f.medios.length ? f.medios : null, p_dias: f.dias.length < 7 ? f.dias : null,
  }));
  const b = ["und", "venta", "tickets"];
  return {
    dias: numeros(d.dias, b), tiendas: numeros(d.tiendas, [...b, "dias"]), productos: numeros(d.productos, b),
    horas: numeros(d.horas, [...b, "hora"]), medios: numeros(d.medios, b), comprobantes: numeros(d.comprobantes, ["und", "venta", "documentos"]),
    clientes: numeros(d.clientes, b),
  };
}

/** Filtros de la página en el formato de las funciones de la base. */
export const parametros = (f: FiltroContaNet) => ({
  p_tiendas: f.tiendas.length ? f.tiendas : null, p_skus: f.skus.length ? f.skus : null,
  p_medios: f.medios.length ? f.medios : null, p_dias: f.dias.length < 7 ? f.dias : null,
});

/** Venta de los 200 clientes principales por tienda (gráfico «en qué tiendas compró»). */
export async function clientesPorTienda(sb: Supabase, canal: CanalContaNet, desde: string, hasta: string, f: FiltroContaNet) {
  const filas = await leer<Record<string, unknown>[]>(sb.rpc("contanet_clientes_tiendas", { p_canal: conGeo(canal, f.geo), desde, hasta, ...parametros(f) }));
  return numeros<{ doc: string; tienda: string; venta: number; und: number }>(filas ?? [], ["venta", "und"]);
}

export type FilaConciliacion = { fecha: string; tienda: string; und_interno: number; venta_interno: number; und_contanet: number; venta_contanet: number };
export async function conciliacion(sb: Supabase, desde: string, hasta: string): Promise<FilaConciliacion[]> {
  const filas = await leer<Record<string, unknown>[]>(sb.rpc("tiendas_conciliacion", { desde, hasta }));
  return numeros(filas ?? [], ["und_interno", "venta_interno", "und_contanet", "venta_contanet"]);
}

export type Cobertura = { interno_desde: string | null; interno_hasta: string | null; contanet_desde: string | null; contanet_hasta: string | null };
export const cobertura = (sb: Supabase) => leer<Cobertura>(sb.rpc("tiendas_cobertura"));

/** Avance del día (función contanet_avance): por hora y por tienda, hoy vs el mismo día de la semana pasada. */
export type Avance = {
  fecha: string | null; corte: string | null; actualizado: string | null; mes: number; dias_mes: number;
  /** Primer y último día del reporte de ContaNet cargado (para elegir el día). */
  primera: string | null; ultima_carga: string | null;
  /** Mismo día de la semana del año pasado (364 días antes): solo el total del día por tienda (reporte interno). */
  anio_pasado_fecha: string | null;
  /** La misma fecha del año pasado (puede ser otro día de la semana). */
  anio_pasado_misma_fecha: string | null;
  horas: { hora: number; hoy: number; antes: number; tickets: number }[];
  tiendas: { tienda: string; hoy: number; antes_corte: number; antes_dia: number; tickets: number; tickets_antes: number; ultima: string | null; anio_pasado: number | null; anio_pasado_fecha_igual: number | null }[];
  /** Detalle del día: productos y medios de pago (vs el mismo día de la semana pasada a la misma hora) y principales clientes. */
  productos: { sku: string; producto: string | null; hoy: number; und: number; antes_corte: number }[];
  medios: { medio: string; hoy: number; antes_corte: number; tickets: number }[];
  clientes: { doc: string; cliente: string | null; venta: number; tickets: number; hora: string | null; tiendas: string | null }[];
};
/** Avance de un día (por defecto el último día del reporte cargado, el mismo para todos los canales). */
export async function avanceContaNet(sb: Supabase, canal: CanalContaNet, fecha?: string, geo?: FiltroGeo): Promise<Avance> {
  const p_fecha = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null;
  const d = await leer<Record<string, unknown>>(sb.rpc("contanet_avance", { p_canal: conGeo(canal, geo), p_fecha }));
  return {
    fecha: (d.fecha as string) ?? null, corte: (d.corte as string) ?? null, actualizado: (d.actualizado as string) ?? null,
    anio_pasado_fecha: (d.anio_pasado_fecha as string) ?? null, anio_pasado_misma_fecha: (d.anio_pasado_misma_fecha as string) ?? null,
    mes: num(d.mes), dias_mes: num(d.dias_mes),
    primera: (d.primera as string) ?? null, ultima_carga: (d.ultima_carga as string) ?? null,
    productos: numeros(d.productos as Record<string, unknown>[], ["hoy", "und", "antes_corte"]),
    medios: numeros(d.medios as Record<string, unknown>[], ["hoy", "antes_corte", "tickets"]),
    clientes: numeros(d.clientes as Record<string, unknown>[], ["venta", "tickets"]),
    horas: numeros(d.horas as Record<string, unknown>[], ["hora", "hoy", "antes", "tickets"]),
    tiendas: numeros<Avance["tiendas"][number]>(d.tiendas as Record<string, unknown>[], ["hoy", "antes_corte", "antes_dia", "tickets", "tickets_antes"])
      .map((t, i) => {
        const r = (d.tiendas as Record<string, unknown>[])[i];
        return { ...t, anio_pasado: r.anio_pasado === null ? null : num(r.anio_pasado),
                 anio_pasado_fecha_igual: r.anio_pasado_fecha_igual === null ? null : num(r.anio_pasado_fecha_igual) };
      }),
  };
}

/** Meta del mes de un canal en el consolidado (Excel «Consolidado-all-canales»), si existe. */
export async function metaMes(sb: Supabase, canalConsolidado: string, anio: number, mes: number): Promise<number | null> {
  const { data } = await sb.from("consolidado_mensual").select("meta").eq("canal", canalConsolidado).eq("anio", anio).eq("mes", mes).maybeSingle();
  return data?.meta === null || data?.meta === undefined ? null : Number(data.meta);
}
