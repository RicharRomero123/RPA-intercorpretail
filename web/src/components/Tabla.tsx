"use client";

import { useMemo, useState } from "react";
import { formatear, type TipoColumna } from "@/lib/formato";
import { ESTADOS } from "@/lib/kpi";

export type Columna = { clave: string; titulo: string; tipo: TipoColumna };
type Fila = Record<string, unknown>;

const esNumero = (t: TipoColumna) => !["texto", "estado"].includes(t);
const FORMATO_EXCEL: Partial<Record<TipoColumna, string>> = {
  entero: "#,##0", decimal1: "#,##0.0", decimal2: "#,##0.00", soles: "#,##0.00", porcentaje: "0.0%",
};

/** Tabla ordenable (clic en el encabezado), con fila TOTAL opcional y descarga a Excel (.xlsx). */
export function Tabla({ columnas, filas, total, archivo, hoja = "Datos", alto }: {
  columnas: Columna[]; filas: Fila[]; total?: Fila; archivo: string; hoja?: string; alto?: number;
}) {
  const [orden, setOrden] = useState<{ clave: string; dir: 1 | -1 } | null>(null);
  const ordenadas = useMemo(() => {
    if (!orden) return filas;
    return [...filas].sort((a, b) => {
      const x = a[orden.clave], y = b[orden.clave];
      if (x === y) return 0;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * orden.dir;
    });
  }, [filas, orden]);

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
    for (const f of ordenadas) ws.addRow(Object.fromEntries(columnas.map((c) => [c.clave, valor(f, c)])));
    if (total) ws.addRow(Object.fromEntries(columnas.map((c) => [c.clave, total[c.clave] ?? null]))).font = { bold: true };
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
    ) : formatear(f[c.clave], c.tipo);

  return (
    <div className="grid gap-2">
      <div className="tarjeta overflow-auto" style={alto ? { maxHeight: alto } : undefined}>
        <table className="datos">
          <thead>
            <tr>
              {columnas.map((c) => (
                <th key={c.clave} className={esNumero(c.tipo) ? "n" : ""} onClick={() => ordenar(c)}
                    aria-sort={orden?.clave === c.clave ? (orden.dir === 1 ? "ascending" : "descending") : "none"}>
                  {c.titulo}{orden?.clave === c.clave ? (orden.dir === 1 ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((f, i) => (
              <tr key={i}>
                {columnas.map((c) => <td key={c.clave} className={esNumero(c.tipo) ? "n" : ""}>{celda(f, c)}</td>)}
              </tr>
            ))}
            {total && (
              <tr className="total">
                {columnas.map((c) => <td key={c.clave} className={esNumero(c.tipo) ? "n" : ""}>{formatear(total[c.clave], c.tipo)}</td>)}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-[var(--tenue)]">
        <span>{filas.length} filas</span>
        <button type="button" className="boton" onClick={descargar}>⬇ Descargar en Excel</button>
      </div>
    </div>
  );
}
