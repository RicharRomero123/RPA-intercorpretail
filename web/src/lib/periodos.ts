/** Fechas como texto AAAA-MM-DD, calculadas en UTC para no depender de la zona horaria del servidor. */

export const PERIODOS = {
  ultimo: "Último día",
  "3d": "Últimos 3 días",
  "7d": "Últimos 7 días",
  semana: "Esta semana",
  "semana-ant": "Semana anterior",
  "14d": "Últimos 14 días",
  mes: "Este mes (a la fecha)",
  "mes-ant": "Mes anterior",
  "30d": "Últimos 30 días",
  anio: "Este año (1 de enero a la fecha)",
  inicio: "Desde el inicio",
  personalizado: "Personalizado",
} as const;
export type Periodo = keyof typeof PERIODOS;

/** Contra qué se compara (el orden es el del selector: primero el año pasado al mismo día). */
export const COMPARAR = {
  anio: "Mismo periodo del año pasado (al mismo día)",
  anioSem: "Mismo día de la semana del año pasado (364 días antes)", ant: "Periodo anterior (los mismos días justo antes)",
  sem: "Mismo periodo, semana anterior", no: "Sin comparación",
} as const;
/** Nombre corto para las tarjetas («vs. …»). */
export const COMPARAR_CORTO: Record<keyof typeof COMPARAR, string> = {
  anio: "mismo periodo del año pasado", anioSem: "mismo día de la semana del año pasado", ant: "periodo anterior", sem: "semana anterior", no: "",
};
export type Comparar = keyof typeof COMPARAR;

export const DIAS_SEM = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const aFecha = (s: string) => new Date(`${s}T00:00:00Z`);
const aTexto = (d: Date) => d.toISOString().slice(0, 10);
export const sumarDias = (s: string, n: number) => aTexto(new Date(aFecha(s).getTime() + n * 86_400_000));
export const diasEntre = (a: string, b: string) => Math.round((aFecha(b).getTime() - aFecha(a).getTime()) / 86_400_000) + 1;
/** 0 = lunes ... 6 = domingo */
export const diaSemana = (s: string) => (aFecha(s).getUTCDay() + 6) % 7;
export const lunesDe = (s: string) => sumarDias(s, -diaSemana(s));
export const inicioMes = (s: string) => `${s.slice(0, 7)}-01`;
export const fechaCorta = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
/** Misma fecha un año antes (29/02 pasa a 28/02). */
export const haceUnAnio = (s: string) => {
  const t = `${Number(s.slice(0, 4)) - 1}${s.slice(4)}`;
  return t.endsWith("-02-29") ? `${t.slice(0, 8)}28` : t;
};
/** Fecha equivalente del periodo actual para un día del periodo de comparación (inverso de rangoComparacion). */
export function alinear(c: Comparar, desde: string, hasta: string): (s: string) => string {
  if (c === "anio") return (s) => `${Number(s.slice(0, 4)) + 1}${s.slice(4)}`;
  if (c === "anioSem") return (s) => sumarDias(s, 364);
  const n = c === "sem" ? 7 : diasEntre(desde, hasta);
  return (s) => sumarDias(s, n);
}
export const fechaLarga = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

/** Rango de cada periodo, contado desde el último día con datos (SPSA publica con un día de atraso). */
export function rangoPeriodo(p: Periodo, ultimo: string, primero: string, d1?: string, d2?: string): [string, string] {
  const lunes = lunesDe(ultimo);
  const mes = inicioMes(ultimo);
  switch (p) {
    case "ultimo": return [ultimo, ultimo];
    case "3d": return [sumarDias(ultimo, -2), ultimo];
    case "7d": return [sumarDias(ultimo, -6), ultimo];
    case "semana": return [lunes, ultimo];
    case "semana-ant": return [sumarDias(lunes, -7), sumarDias(lunes, -1)];
    case "14d": return [sumarDias(ultimo, -13), ultimo];
    case "mes": return [mes, ultimo];
    case "mes-ant": { const fin = sumarDias(mes, -1); return [inicioMes(fin), fin]; }
    case "30d": return [sumarDias(ultimo, -29), ultimo];
    case "anio": return [`${ultimo.slice(0, 4)}-01-01`, ultimo];
    case "inicio": return [primero, ultimo];
    case "personalizado": {
      const a = d1 && d1 <= ultimo ? d1 : mes;
      const b = d2 && d2 <= ultimo ? d2 : ultimo;
      return a <= b ? [a, b] : [b, a];
    }
  }
}

export function rangoComparacion(c: Comparar, desde: string, hasta: string): [string, string] | null {
  if (c === "no") return null;
  if (c === "anio") return [haceUnAnio(desde), haceUnAnio(hasta)];
  // 52 semanas exactas: compara jueves con jueves (útil para días sueltos o semanas).
  if (c === "anioSem") return [sumarDias(desde, -364), sumarDias(hasta, -364)];
  if (c === "sem") return [sumarDias(desde, -7), sumarDias(hasta, -7)];
  const n = diasEntre(desde, hasta);
  return [sumarDias(desde, -n), sumarDias(desde, -1)];
}

const NOMBRES_MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const mayus = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const finDeMesDe = (s: string) => sumarDias(`${Number(s.slice(5, 7)) === 12 ? Number(s.slice(0, 4)) + 1 : s.slice(0, 4)}-${String(Number(s.slice(5, 7)) % 12 + 1).padStart(2, "0")}-01`, -1);
/** El periodo dicho en palabras, para que lo entienda cualquiera: «Septiembre 2026», «Enero a septiembre 2026»,
 *  «1 al 15 de septiembre 2026», «Lunes 29 de septiembre 2026» o, si cruza años, las dos fechas. */
export function periodoEnPalabras(desde: string, hasta: string): string {
  const [a1, m1, d1] = [desde.slice(0, 4), Number(desde.slice(5, 7)), Number(desde.slice(8, 10))];
  const [a2, m2, d2] = [hasta.slice(0, 4), Number(hasta.slice(5, 7)), Number(hasta.slice(8, 10))];
  if (a1 !== a2) return `${fechaLarga(desde)} al ${fechaLarga(hasta)}`;
  const mesCompleto = d1 === 1 && hasta === finDeMesDe(hasta);
  if (desde === hasta) return `${mayus(["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"][diaSemana(desde)])} ${d1} de ${NOMBRES_MES[m1 - 1]} ${a1}`;
  if (m1 === m2 && mesCompleto) return `${mayus(NOMBRES_MES[m1 - 1])} ${a1}`;
  if (m1 === m2) return `${d1} al ${d2} de ${NOMBRES_MES[m1 - 1]} ${a1}`;
  if (d1 === 1 && (mesCompleto || m1 === 1)) return `${mayus(NOMBRES_MES[m1 - 1])} a ${NOMBRES_MES[m2 - 1]}${mesCompleto ? "" : ` (al ${d2})`} ${a1}`;
  return `${d1} de ${NOMBRES_MES[m1 - 1]} al ${d2} de ${NOMBRES_MES[m2 - 1]} ${a1}`;
}
