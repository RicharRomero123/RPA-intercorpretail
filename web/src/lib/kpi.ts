import type { FilaInventario, FilaVenta } from "./datos";
import { diaSemana, inicioMes, lunesDe } from "./periodos";

export type Resumen = { und: number; venta: number; costo: number; margen: number; locales: number; rotacion: number | null };

const suma = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);

/** Días con datos en las filas (para la rotación se cuentan solo los días que realmente entran al cálculo). */
export const diasConDatos = (filas: FilaVenta[]) => new Set(filas.map((f) => f.fecha)).size;

export function filtrarDias(filas: FilaVenta[], dias: number[]) {
  const set = new Set(dias);
  return dias.length === 7 ? filas : filas.filter((f) => set.has(diaSemana(f.fecha)));
}

/** Rotación = unidades ÷ locales con venta ÷ semanas (días con datos ÷ 7). */
export function resumen(filas: FilaVenta[]): Resumen {
  const und = suma(filas, (f) => f.und);
  const venta = suma(filas, (f) => f.venta);
  const costo = suma(filas, (f) => f.costo);
  const locales = new Set(filas.filter((f) => f.und > 0).map((f) => f.cod_local)).size;
  const semanas = diasConDatos(filas) / 7;
  return { und, venta, costo, margen: venta - costo, locales, rotacion: locales && semanas ? und / locales / semanas : null };
}

export type FilaRotacion = {
  clave: string; cadena?: string; zona?: string; producto?: string;
  und: number; venta: number; costo: number; locales: number; rotacion: number | null; pct: number;
};

/** Rotación y totales agrupados por una o varias columnas (cadena, zona, local, producto). */
export function rotacionPor(filas: FilaVenta[], claves: (keyof FilaVenta)[]): FilaRotacion[] {
  const semanas = diasConDatos(filas) / 7;
  const grupos = new Map<string, { base: FilaVenta; und: number; venta: number; costo: number; locales: Set<number> }>();
  for (const f of filas) {
    const k = claves.map((c) => String(f[c])).join(" · ");
    const g = grupos.get(k) ?? { base: f, und: 0, venta: 0, costo: 0, locales: new Set<number>() };
    g.und += f.und; g.venta += f.venta; g.costo += f.costo;
    if (f.und > 0) g.locales.add(f.cod_local);
    grupos.set(k, g);
  }
  const total = suma([...grupos.values()], (g) => g.venta);
  return [...grupos.entries()].map(([clave, g]) => ({
    clave,
    cadena: g.base.cadena, zona: g.base.zona, producto: g.base.producto,
    und: g.und, venta: g.venta, costo: g.costo, locales: g.locales.size,
    rotacion: g.locales.size && semanas ? g.und / g.locales.size / semanas : null,
    pct: total ? g.venta / total : 0,
  })).sort((a, b) => (b.rotacion ?? -1) - (a.rotacion ?? -1));
}

export type Agrupar = "dia" | "semana" | "mes";
export type PuntoSerie = { periodo: string; und: number; venta: number; costo: number };

export function serie(filas: FilaVenta[], agrupar: Agrupar, porProducto = false): (PuntoSerie & { producto?: string })[] {
  const clavePeriodo = (d: string) => (agrupar === "semana" ? lunesDe(d) : agrupar === "mes" ? inicioMes(d) : d);
  const m = new Map<string, PuntoSerie & { producto?: string }>();
  for (const f of filas) {
    const periodo = clavePeriodo(f.fecha);
    const k = porProducto ? `${periodo}|${f.producto}` : periodo;
    const p = m.get(k) ?? { periodo, und: 0, venta: 0, costo: 0, ...(porProducto ? { producto: f.producto } : {}) };
    p.und += f.und; p.venta += f.venta; p.costo += f.costo;
    m.set(k, p);
  }
  return [...m.values()].sort((a, b) => a.periodo.localeCompare(b.periodo));
}

/** Venta acumulada día a día (día 1, 2, 3...) para comparar dos periodos de igual largo. */
export function acumulado(filas: FilaVenta[]): number[] {
  const porDia = serie(filas, "dia");
  let a = 0;
  return porDia.map((p) => (a += p.venta));
}

// ----------------------------------------------------------------------------- stock
export const ESTADOS = {
  quiebre: "Quiebre (sin stock)",
  sin: "Sin movimiento",
  bajo: "Cobertura baja",
  ok: "Normal",
  sobre: "Sobrestock",
} as const;
export type Estado = keyof typeof ESTADOS;

export type FilaCobertura = {
  cod_local: number; local: string; cadena: string; zona: string; sku: string; producto: string;
  inv_und: number; inv_costo: number; und_v: number; und_dia: number; semanas: number | null; precio: number | null;
  estado: Estado; perdida_dia: number;
};

/**
 * Cobertura por local y producto.
 * - listados: locales-producto que el portal reporta el último día (el detalle incluye los que tienen stock o venta).
 * - ventana: ventas de los últimos N días, para el ritmo de venta.
 * Semanas = inventario ÷ (venta promedio por día × 7). Quiebre = sin stock donde se venía vendiendo;
 * venta perdida por día = venta promedio por día × precio promedio del producto.
 */
export function cobertura(listados: FilaVenta[], inv: FilaInventario[], ventana: FilaVenta[], diasVentana: number,
                          baja: number, alta: number): FilaCobertura[] {
  const clave = (l: number, s: string) => `${l}|${s}`;
  const stock = new Map(inv.map((i) => [clave(i.cod_local, i.sku), i]));
  const venta = new Map<string, { und: number; venta: number }>();
  const precio = new Map<string, { und: number; venta: number }>();
  for (const f of ventana) {
    const v = venta.get(clave(f.cod_local, f.sku)) ?? { und: 0, venta: 0 };
    v.und += f.und; v.venta += f.venta; venta.set(clave(f.cod_local, f.sku), v);
    const p = precio.get(f.sku) ?? { und: 0, venta: 0 };
    p.und += f.und; p.venta += f.venta; precio.set(f.sku, p);
  }
  const vistos = new Set<string>();
  const filas: FilaCobertura[] = [];
  for (const l of listados) {
    const k = clave(l.cod_local, l.sku);
    if (vistos.has(k)) continue;
    vistos.add(k);
    const i = stock.get(k);
    const v = venta.get(k) ?? { und: 0, venta: 0 };
    const pr = precio.get(l.sku);
    const invUnd = i?.inv_und ?? 0;
    const undDia = v.und / diasVentana;
    const semanas = undDia > 0 ? invUnd / (undDia * 7) : null;
    const precioProm = pr && pr.und > 0 ? pr.venta / pr.und : null;
    let estado: Estado;
    if (invUnd <= 0) estado = "quiebre";
    else if (v.und <= 0) estado = "sin";
    else if ((semanas ?? 0) < baja) estado = "bajo";
    else if ((semanas ?? 0) > alta) estado = "sobre";
    else estado = "ok";
    filas.push({
      cod_local: l.cod_local, local: l.local, cadena: l.cadena, zona: l.zona, sku: l.sku, producto: l.producto,
      inv_und: invUnd, inv_costo: i?.inv_costo ?? 0, und_v: v.und, und_dia: undDia, semanas, precio: precioProm, estado,
      perdida_dia: estado === "quiebre" && undDia > 0 && precioProm ? undDia * precioProm : 0,
    });
  }
  return filas;
}
