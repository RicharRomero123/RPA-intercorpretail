// Selección de meses del Resumen general en la URL (?m=): una lista de meses o tramos, p. ej. «9», «1-3,9».
// Se comparte entre la página (servidor) y el selector (cliente), por eso vive aquí y no en el componente.

export const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** Lee «1-3,9» → [1, 2, 3, 9]. Devuelve null si no hay nada o algo no es un mes entre 1 y `hasta`. */
export function leerMeses(texto: string | undefined, hasta: number): number[] | null {
  if (!texto) return null;
  const meses = new Set<number>();
  for (const trozo of texto.split(",")) {
    const [a, b = a] = trozo.split("-").map(Number);
    if (![a, b].every((x) => Number.isInteger(x) && x >= 1 && x <= hasta)) return null;
    for (let m = Math.min(a, b); m <= Math.max(a, b); m++) meses.add(m);
  }
  return meses.size ? [...meses].sort((x, y) => x - y) : null;
}

/** Agrupa meses seguidos: [1, 2, 3, 9] → [[1, 3], [9, 9]]. */
const tramos = (meses: number[]) => meses.reduce<[number, number][]>((t, m) => {
  const u = t.at(-1);
  if (u && u[1] === m - 1) u[1] = m; else t.push([m, m]);
  return t;
}, []);

/** [1, 2, 3, 9] → «1-3,9» para la URL. */
export const escribirMeses = (meses: number[]) => tramos(meses).map(([a, b]) => (a === b ? String(a) : `${a}-${b}`)).join(",");

/** [1, 2, 3, 9] → «Ene–Mar, Sep» (o en minúsculas para dentro de una frase). */
export function nombrarMeses(meses: number[], minusculas = false) {
  const n = (m: number) => (minusculas ? MESES_CORTOS[m - 1].toLowerCase() : MESES_CORTOS[m - 1]);
  return tramos(meses).map(([a, b]) => (a === b ? n(a) : `${n(a)}–${n(b)}`)).join(", ");
}

export const rangoMeses = (desde: number, hasta: number) => Array.from({ length: Math.max(hasta - desde + 1, 0) }, (_, i) => desde + i);
