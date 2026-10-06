"""Carga las metas por tienda y mes del Excel «Metas tiendas 2026» (hoja «R.Facturación 2026») a la tabla meta_tienda.

En la hoja, cada tienda tiene un bloque «Ventas 2026 <tienda>» seguido de la fila «Meta 2026» (enero … diciembre).
Control (si falla, no se carga nada): cada mes, la suma de las metas de las tiendas debe dar la meta TIENDAS del
consolidado, al céntimo. La carga reemplaza las metas del año.

Uso:
    python metas_tiendas_excel.py --revisar          # lee y muestra el cuadre, sin cargar
    python metas_tiendas_excel.py [--archivo "…\\Metas tiendas 2026.xlsx"]
"""
import argparse
from pathlib import Path

import openpyxl

from conexion import conectar

ARCHIVO = Path(r"C:\Users\USER\Documents\RPA-proyect\metas-tiendas\Metas tiendas 2026.xlsx")
ESQUEMA = Path(__file__).resolve().parent.parent / "supabase" / "030_meta_tienda.sql"
HOJA = "R.Facturación 2026"


def leer(ruta: Path) -> tuple[int, dict[str, list[float]]]:
    filas = [list(f) for f in openpyxl.load_workbook(ruta, data_only=True)[HOJA].iter_rows(values_only=True)]
    metas, anio = {}, None
    for i, f in enumerate(filas[1:], start=1):
        t = str(f[0] or "").strip()
        if not (t.startswith("Meta ") and t[5:9].isdigit()):
            continue
        # La fila de arriba dice de qué tienda es: «Ventas <año> <tienda>» (en el bloque del total dice «Total venta <año>»).
        arriba = str(filas[i - 1][0] or "").strip()
        if arriba.startswith(f"Ventas {t[5:9]} "):
            anio = int(t[5:9])
            metas[arriba[12:].strip()] = [float(v or 0) for v in f[1:13]]
    if not metas:
        raise SystemExit("No encontré bloques «Ventas <año> <tienda>» con su fila «Meta <año>».")
    return anio, metas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--archivo", type=Path, default=ARCHIVO)
    ap.add_argument("--revisar", action="store_true", help="solo lee y muestra el cuadre")
    a = ap.parse_args()
    anio, metas = leer(a.archivo)
    with conectar() as con:
        cons = dict(con.execute("select mes, meta from consolidado_mensual where canal = 'TIENDAS' and anio = %s", (anio,)).fetchall())
        print(f"{a.archivo.name}: {len(metas)} tiendas, metas {anio}: {', '.join(metas)}")
        malos = []
        for m in range(1, 13):
            s = round(sum(v[m - 1] for v in metas.values()), 2)
            c = round(float(cons.get(m) or 0), 2)
            print(f"  mes {m:2}: tiendas S/ {s:>14,.2f} · consolidado TIENDAS S/ {c:>14,.2f}{'' if abs(s - c) < 0.01 else '  <-- NO CUADRA'}")
            if abs(s - c) >= 0.01:
                malos.append(m)
        if malos:
            raise SystemExit(f"No se carga: la suma de las tiendas no da la meta TIENDAS del consolidado en los meses {malos}.")
        print(f"Total año: S/ {sum(sum(v) for v in metas.values()):,.2f} · cuadra con el consolidado")
        if a.revisar:
            return
        con.execute(ESQUEMA.read_text(encoding="utf-8"))
        with con.transaction():
            con.execute("delete from meta_tienda where anio = %s", (anio,))
            con.cursor().executemany("insert into meta_tienda (anio, mes, tienda, meta, archivo) values (%s, %s, %s, %s, %s)",
                                     [(anio, m + 1, t, round(v[m], 2), a.archivo.name) for t, v in metas.items() for m in range(12)])
            n, tot = con.execute("select count(*), sum(meta) from meta_tienda where anio = %s", (anio,)).fetchone()
        print(f"Cargado: {n} filas · S/ {float(tot):,.2f}")


if __name__ == "__main__":
    main()
