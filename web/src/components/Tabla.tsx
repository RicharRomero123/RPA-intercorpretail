"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Download, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { formatear, type TipoColumna } from "@/lib/formato";
import type { ClaveGlosario } from "@/lib/glosario";
import { ESTADOS } from "@/lib/kpi";
import { Ayuda } from "./Ayuda";

export type Columna = { clave: string; titulo: string; tipo: TipoColumna; info?: ClaveGlosario };
type Fila = Record<string, unknown>;

const esNumero = (t: TipoColumna) => !["texto", "estado"].includes(t);
/** Columnas de variación (var, var_tickets, crec…): se muestran con signo y en verde/rojo. */
const esVariacion = (c: Columna) => c.tipo === "porcentaje" && /^(var|crec)/.test(c.clave);
/** Columnas de dinero (soles, o decimales con «S/» en el título): cada celda lleva el símbolo «S/» y el título ya no lo repite. */
const esDinero = (c: Columna) => c.tipo === "soles" || (c.tipo === "decimal2" && /S\/\s*$/.test(c.titulo));
const tituloDe = (c: Columna) => (esDinero(c) ? c.titulo.replace(/\s*S\/\s*$/, "") : c.titulo);
const conSoles = (c: Columna, v: unknown, texto: string) =>
  esDinero(c) && typeof v === "number" && Number.isFinite(v) ? `${v < 0 ? "−" : ""}S/ ${texto.replace(/^[-−]/, "")}` : texto;
const claseCelda = (c: Columna, v: unknown) => {
  if (!esNumero(c.tipo)) return "";
  if (esVariacion(c) && typeof v === "number" && Number.isFinite(v) && v !== 0) return `n ${v > 0 ? "sube" : "baja"}`;
  return "n";
};
const conSigno = (c: Columna, v: unknown, texto: string) =>
  esVariacion(c) && typeof v === "number" && Number.isFinite(v) ? (v > 0 ? `+${texto}` : v < 0 ? `−${texto.replace("-", "")}` : texto) : texto;
const FORMATO_EXCEL: Partial<Record<TipoColumna, string>> = {
  entero: "#,##0", decimal1: "#,##0.0", decimal2: "#,##0.00", soles: "#,##0.00", porcentaje: "0.00%",
};

/** Tabla ordenable (clic en el encabezado), con buscador, fila TOTAL opcional y descarga a Excel (.xlsx).
 *  Con «abrir», cada fila tiene una flecha y al hacer clic se abre su detalle (por ejemplo, las compras de un cliente en un panel). */
export function Tabla({ columnas, filas, total, archivo, hoja = "Datos", alto, buscar = false, abrir, activa }: {
  columnas: Columna[]; filas: Fila[]; total?: Fila; archivo: string; hoja?: string; alto?: number; buscar?: boolean;
  abrir?: (f: Fila) => void; activa?: (f: Fila) => boolean;
}) {
  const extra = abrir ? 1 : 0;
  const [orden, setOrden] = useState<{ clave: string; dir: 1 | -1 } | null>(null);
  const [texto, setTexto] = useState("");
  const visibles = useMemo(() => {
    const t = texto.trim().toLowerCase();
    const base = t ? filas.filter((f) => columnas.some((c) => !esNumero(c.tipo) && String(c.tipo === "estado" ? ESTADOS[f[c.clave] as keyof typeof ESTADOS] ?? "" : f[c.clave] ?? "").toLowerCase().includes(t))) : filas;
    if (!orden) return base;
    return [...base].sort((a, b) => {
      const x = a[orden.clave], y = b[orden.clave];
      if (x === y) return 0;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * orden.dir;
    });
  }, [filas, orden, texto, columnas]);

  const ordenar = (c: Columna) =>
    setOrden((o) => (o?.clave === c.clave ? { clave: c.clave, dir: (o.dir * -1) as 1 | -1 } : { clave: c.clave, dir: esNumero(c.tipo) ? -1 : 1 }));

  async function descargar() {
    const ExcelJS = (await import("exceljs")).default;
    const libro = new ExcelJS.Workbook();
    const ws = libro.addWorksheet(hoja.slice(0, 31));
    ws.columns = columnas.map((c) => ({ header: c.titulo, key: c.clave, width: Math.max(12, c.titulo.length + 2),
      style: FORMATO_EXCEL[c.tipo] ? { numFmt: FORMATO_EXCEL[c.tipo] } : {} }));
    ws.getRow(1).font = { bold: true };
    const valor = (f: Fila, c: Columna) => (c.tipo === "estado" ? ESTADOS[f[c.clave] as keyof typeof ESTADOS] : f[c.clave] ?? null);
    for (const f of visibles) ws.addRow(Object.fromEntries(columnas.map((c) => [c.clave, valor(f, c)])));
    if (total && !texto) ws.addRow(Object.fromEntries(columnas.map((c) => [c.clave, total[c.clave] ?? null]))).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    const buffer = await libro.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url; a.download = archivo; a.click();
    URL.revokeObjectURL(url);
  }

  const celda = (f: Fila, c: Columna) =>
    c.tipo === "estado" ? (
      <span className={`estado estado-${String(f[c.clave])}`}>{ESTADOS[f[c.clave] as keyof typeof ESTADOS]}</span>
    ) : conSoles(c, f[c.clave], conSigno(c, f[c.clave], formatear(f[c.clave], c.tipo)));

  return (
    <div className="grid gap-3 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {buscar ? (
          <label className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--tenue)]" aria-hidden />
            <input className="campo !pl-8 w-64 max-w-full" placeholder="Buscar…" value={texto} onChange={(e) => setTexto(e.target.value)}
                   aria-label="Buscar en la tabla" />
          </label>
        ) : <span className="text-xs text-[var(--tenue)]">{filas.length} filas</span>}
        <button type="button" className="boton" onClick={descargar}><Download size={14} aria-hidden /> Excel</button>
      </div>
      <div className="rounded-lg border border-[var(--linea)] overflow-auto" style={alto ? { maxHeight: alto } : undefined}>
        <table className="datos">
          <thead>
            <tr>
              {abrir && <th className="w-8" aria-label="Ver detalle" />}
              {columnas.map((c) => {
                const Icono = orden?.clave !== c.clave ? ArrowUpDown : orden.dir === 1 ? ArrowUp : ArrowDown;
                return (
                  <th key={c.clave} className={esNumero(c.tipo) ? "n" : ""} onClick={() => ordenar(c)}
                      aria-sort={orden?.clave === c.clave ? (orden.dir === 1 ? "ascending" : "descending") : "none"}>
                    <span className={`inline-flex items-center gap-1 ${esNumero(c.tipo) ? "flex-row-reverse" : ""}`}>
                      {tituloDe(c)}{c.info && <Ayuda clave={c.info} tamano={12} />}<Icono size={12} className={`orden ${orden?.clave === c.clave ? "text-[var(--acento)]" : ""}`} aria-hidden />
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibles.map((f, i) => {
              const esActiva = activa?.(f) ?? false;
              return (
                <tr key={i} className={abrir ? `cursor-pointer ${esActiva ? "!bg-[var(--acento-suave)]" : ""}` : ""} onClick={abrir ? () => abrir(f) : undefined}>
                  {abrir && (
                    <td className="!px-1.5">
                      <button type="button" className="grid place-items-center size-6 rounded hover:bg-[var(--superficie-2)]" aria-label="Ver detalle"
                              onClick={(e) => { e.stopPropagation(); abrir(f); }}>
                        <ChevronRight size={15} className={esActiva ? "text-[var(--acento)]" : ""} aria-hidden />
                      </button>
                    </td>
                  )}
                  {columnas.map((c) => <td key={c.clave} className={claseCelda(c, f[c.clave])}>{celda(f, c)}</td>)}
                </tr>
              );
            })}
            {visibles.length === 0 && (
              <tr><td colSpan={columnas.length + extra} className="text-center text-[var(--tenue)] py-6">Sin resultados</td></tr>
            )}
            {total && !texto && (
              <tr className="total">
                {abrir && <td />}
                {columnas.map((c) => <td key={c.clave} className={claseCelda(c, total[c.clave])}>{conSoles(c, total[c.clave], conSigno(c, total[c.clave], formatear(total[c.clave], c.tipo)))}</td>)}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {buscar && <span className="text-xs text-[var(--tenue)]">{visibles.length} de {filas.length} filas</span>}
    </div>
  );
}
