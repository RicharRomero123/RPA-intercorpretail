const f0 = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });
const f1 = new Intl.NumberFormat("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f2 = new Intl.NumberFormat("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const vacio = (x: number | null | undefined): x is null | undefined => x === null || x === undefined || Number.isNaN(x);

export const soles = (x: number | null | undefined) => (vacio(x) ? "—" : `S/ ${f2.format(x)}`);
export const entero = (x: number | null | undefined) => (vacio(x) ? "—" : f0.format(x));
export const decimal1 = (x: number | null | undefined) => (vacio(x) ? "—" : f1.format(x));
export const decimal2 = (x: number | null | undefined) => (vacio(x) ? "—" : f2.format(x));
export const porcentaje = (x: number | null | undefined) => (vacio(x) ? "—" : `${f1.format(x * 100)}%`);

export type TipoColumna = "texto" | "entero" | "decimal1" | "decimal2" | "soles" | "porcentaje" | "estado";

export function formatear(v: unknown, tipo: TipoColumna): string {
  const n = typeof v === "number" ? v : null;
  switch (tipo) {
    case "entero": return entero(n);
    case "decimal1": return decimal1(n);
    case "decimal2": return decimal2(n);
    case "soles": return decimal2(n);
    case "porcentaje": return porcentaje(n);
    default: return v === null || v === undefined ? "" : String(v);
  }
}
