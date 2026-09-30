/**
 * Lector liviano de .xlsx: solo valores (texto, números, fechas), sin formatos. Los reportes de ContaNet traen cientos
 * de miles de celdas combinadas que hacen que las librerías completas (exceljs) tarden minutos; esto lee el mismo
 * archivo en segundos. Un .xlsx es un zip con XML: se descomprime y se recorren las celdas con expresiones regulares.
 */
import { strFromU8, unzipSync } from "fflate";

export type Celda = string | number | boolean | Date | null;
export type Libro = { hojas: string[]; filas: (hoja: string) => Celda[][] };

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decodificar = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTIDADES[e] ?? m);
const atributo = (attrs: string, nombre: string) => attrs.match(new RegExp(`\\b${nombre}="([^"]*)"`))?.[1];
/** Texto de un nodo con <t> (o varios <r><t>), sin las guías fonéticas <rPh>. */
const textoDe = (xml: string) =>
  decodificar([...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));

/** Formatos de número que son fechas: los integrados 14–22 y 45–47, o los propios con d, m, y, h en el código. */
function estilosFecha(estilos: string): boolean[] {
  const propios = new Map<number, string>();
  for (const m of estilos.matchAll(/<numFmt\b([^>]*)\/?>/g)) propios.set(Number(atributo(m[1], "numFmtId")), decodificar(atributo(m[1], "formatCode") ?? ""));
  const xfs = estilos.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? "";
  return [...xfs.matchAll(/<xf\b([^>]*?)(?:\/>|>)/g)].map((m) => {
    const id = Number(atributo(m[1], "numFmtId") ?? 0);
    if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47)) return true;
    const codigo = (propios.get(id) ?? "").replace(/"[^"]*"|\[[^\]]*\]|\\./g, "");
    return /[dmyh]/i.test(codigo) && !/^general$/i.test(codigo);
  });
}

const columna = (ref: string) => {
  let n = 0;
  for (const c of ref.match(/^[A-Z]+/)?.[0] ?? "A") n = n * 26 + c.charCodeAt(0) - 64;
  return n - 1;
};
/** Número de serie de Excel → fecha (UTC), redondeada al segundo. */
const fechaExcel = (v: number) => new Date(Math.round((v - 25569) * 86_400) * 1000);

export function abrirXlsx(datos: ArrayBuffer | Uint8Array): Libro {
  const zip = unzipSync(datos instanceof Uint8Array ? datos : new Uint8Array(datos));
  const leer = (ruta: string) => (zip[ruta] ? strFromU8(zip[ruta]) : "");
  const compartidos = [...leer("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textoDe(m[1]));
  const esFecha = estilosFecha(leer("xl/styles.xml"));

  // Nombre de cada hoja → su archivo dentro del zip.
  const rels = new Map([...leer("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b([^>]*)\/?>/g)]
    .map((m) => [atributo(m[1], "Id"), (atributo(m[1], "Target") ?? "").replace(/^\/?(xl\/)?/, "xl/")]));
  const hojas = [...leer("xl/workbook.xml").matchAll(/<sheet\b([^>]*)\/?>/g)].map((m) => ({
    nombre: decodificar(atributo(m[1], "name") ?? ""), ruta: rels.get(atributo(m[1], "r:id")) ?? "",
  }));

  function filas(hoja: string): Celda[][] {
    const xml = leer(hojas.find((h) => h.nombre === hoja)?.ruta ?? "");
    const salida: Celda[][] = [];
    for (const r of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const fila: Celda[] = [];
      for (const c of (r[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1], cuerpo = c[2] ?? "";
        const tipo = atributo(attrs, "t");
        const v = cuerpo.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let valor: Celda = null;
        if (tipo === "s") valor = v === undefined ? null : compartidos[Number(v)] ?? null;
        else if (tipo === "inlineStr") valor = textoDe(cuerpo);
        else if (tipo === "str") valor = v === undefined ? null : decodificar(v);
        else if (tipo === "b") valor = v === "1";
        else if (tipo === "e") valor = null;
        else if (v !== undefined) {
          const n = Number(v);
          valor = esFecha[Number(atributo(attrs, "s") ?? 0)] ? fechaExcel(n) : n;
        }
        const ref = atributo(attrs, "r");
        fila[ref ? columna(ref) : fila.length] = valor;
      }
      salida.push(Array.from(fila, (x) => x ?? null));
    }
    return salida;
  }
  return { hojas: hojas.map((h) => h.nombre), filas };
}

/** ¿Es un Excel antiguo (.xls, formato binario)? Empieza con la firma D0 CF 11 E0. */
export const esXls = (d: Uint8Array) => d[0] === 0xd0 && d[1] === 0xcf && d[2] === 0x11 && d[3] === 0xe0;

/** Lector de .xls (ContaNet exporta en ese formato): usa SheetJS, cargado solo cuando hace falta. Devuelve lo mismo que
 *  abrirXlsx: valores simples y fechas de Excel convertidas a fecha (UTC). */
export async function abrirXls(datos: Uint8Array): Promise<Libro> {
  const XLSX = await import("xlsx");
  const libro = XLSX.read(datos, { type: "array", dense: true, cellNF: true, cellDates: false, cellStyles: false });
  function filas(hoja: string): Celda[][] {
    const ws = libro.Sheets[hoja] as unknown as { "!data"?: ({ t: string; v?: unknown; z?: string } | undefined)[][] };
    // Array.from (no .map): las filas vacías llegan como huecos y deben quedar como filas vacías.
    return Array.from(ws["!data"] ?? [], (fila) => Array.from(fila ?? [], (c) => {
      if (!c || c.v === undefined || c.t === "e" || c.t === "z") return null;
      if (c.t === "n") return typeof c.z === "string" && XLSX.SSF.is_date(c.z) ? fechaExcel(Number(c.v)) : Number(c.v);
      if (c.t === "b") return Boolean(c.v);
      if (c.t === "d") return c.v as Date;
      return String(c.v);
    }));
  }
  return { hojas: libro.SheetNames, filas };
}
