"""Pasa los datos ya descargados en la PC (rpa_intercorp/datos/retail_spsa.db) a la base del proyecto
(Supabase si hay DATABASE_URL; si no, al SQLite local de prueba) y comprueba que los totales cuadren.

Uso:
    python migrar_base_local.py --origen ..\\..\\rpa_intercorp\\datos\\retail_spsa.db
"""
import argparse
import sqlite3
from pathlib import Path

import pandas as pd

import api_intercorp as api
from retail_diario import CLIENTE, Base, ZONA, cadena, log, nombre_local, nombre_producto


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--origen", type=Path, required=True, help="retail_spsa.db de la PC")
    a = ap.parse_args()
    with sqlite3.connect(a.origen) as o:
        t = {n: pd.read_sql(f"SELECT * FROM {n}", o) for n in
             ("productos", "locales", "venta_producto_dia", "venta_local_dia", "inventario_local", "cargas")}
    bd = Base(api.leer_env().get("DATABASE_URL"))
    try:
        bd.varios("INSERT INTO productos (cliente, sku, producto, nombre, marca, umb, estado) VALUES (%s,%s,%s,%s,%s,%s,%s) "
                  "ON CONFLICT (cliente, sku) DO NOTHING",
                  [(CLIENTE, r.sku, r.producto, nombre_producto(r.producto), r.marca, r.umb, r.estado)
                   for r in t["productos"].itertuples()])
        bd.varios("INSERT INTO locales (cliente, cod_local, local, nombre, cadena, zona, formato, tipo, estado) "
                  "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (cliente, cod_local) DO NOTHING",
                  [(CLIENTE, int(r.cod_local), r.local, nombre_local(r.local), cadena(r.local),
                    ZONA.get(int(r.cod_local), "Por confirmar"), r.formato, r.tipo, r.estado)
                   for r in t["locales"].itertuples()])
        for tabla, cols, clave in (
                ("venta_producto_dia", ["fecha", "sku", "und", "venta", "costo"], "fecha"),
                ("venta_local_dia", ["fecha", "sku", "cod_local", "und", "venta", "costo"], "fecha"),
                ("inventario_local", ["fecha_inv", "sku", "cod_local", "inv_und", "inv_costo"], "fecha_inv")):
            df = t[tabla]
            for f in sorted(df[clave].unique()):
                bd.ejecutar(f"DELETE FROM {tabla} WHERE cliente = %s AND {clave} = %s", (CLIENTE, f))
            bd.varios(f"INSERT INTO {tabla} (cliente, {', '.join(cols)}) VALUES ({', '.join(['%s'] * (len(cols) + 1))})",
                      [(CLIENTE, *[int(v) if c == "cod_local" else v for c, v in zip(cols, fila)])
                       for fila in df[cols].itertuples(index=False, name=None)])
            log(f"{tabla}: {len(df)} filas")
        bd.varios("INSERT INTO cargas (cuando, cliente, fecha, nivel, estado, filas, und, venta, detalle) "
                  "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                  [(r.cuando, CLIENTE, r.fecha, r.nivel, r.estado, r.filas, r.und, r.venta,
                    (r.detalle or "") + " [migrado desde la PC]") for r in t["cargas"].itertuples()])
        bd.confirmar()
    except Exception:
        bd.deshacer()
        raise
    # Control: los totales de la base nueva deben ser idénticos a los de la PC.
    for tabla, campos in (("venta_producto_dia", "und, venta, costo"), ("venta_local_dia", "und, venta, costo"),
                          ("inventario_local", "inv_und, inv_costo")):
        nuevo = bd.uno(f"SELECT COUNT(*), {', '.join(f'ROUND(SUM({c}), 2)' for c in campos.split(', '))} "
                       f"FROM {tabla} WHERE cliente = %s", (CLIENTE,))
        with sqlite3.connect(a.origen) as o:
            viejo = o.execute(f"SELECT COUNT(*), {', '.join(f'ROUND(SUM({c}), 2)' for c in campos.split(', '))} "
                              f"FROM {tabla}").fetchone()
        ok = all(abs(float(x) - float(y)) < 0.005 for x, y in zip(nuevo, viejo))
        log(f"{'CUADRA' if ok else 'NO CUADRA'} {tabla}: base nueva {tuple(float(x) for x in nuevo)} | PC {viejo}")


if __name__ == "__main__":
    main()
