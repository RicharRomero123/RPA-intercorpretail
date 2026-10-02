"""Carga los reportes diarios de OXXO (sell-out por tienda) a las tablas de sell-out, con cliente = 'OXXO'.

Cada archivo (PROVEEDORES_DIARIO_… o BaseInventario_…) trae, para un día: tienda (NOMBRE), DISTRITO, CLUSTER (A/B/C),
EAN, DESCRIPCION, venta neta, unidades vendidas netas y STOCK. Se guarda igual que Supermercados Peruanos:
  locales             una fila por tienda (cadena = «Cluster A/B/C», zona = distrito); el código se asigna una vez y se conserva
  productos           sku = EAN de OXXO (su SKU de Calderón está en sku_equivalencia, sistema 'OXXO')
  venta_local_dia     venta y unidades por día, tienda y EAN; «costo» = unidades × precio de despacho a OXXO (ingreso Calderón estimado)
  venta_producto_dia  lo mismo sumado por día y EAN
  inventario_local    stock por día, tienda y EAN (inv_costo con el mismo precio de despacho)
Reemplaza los días de los archivos y verifica que lo guardado cuadre al céntimo con lo leído.

Uso:  python oxxo_excel.py "C:\\...\\DATA-OXXO" [--prueba]
"""
import argparse
import re
from pathlib import Path

import pandas as pd

from conexion import conectar

CLIENTE = "OXXO"


def lugar(v) -> str | None:
    t = None if pd.isna(v) else str(v).strip()
    if not t:
        return None
    return " ".join(w if w in ("de", "del", "la", "las", "los", "el") and i else w.capitalize() for i, w in enumerate(t.lower().split()))


def leer(carpeta: Path) -> pd.DataFrame:
    archivos = sorted(f for f in carpeta.glob("*.xlsx") if not f.name.startswith("~$"))
    if not archivos:
        raise SystemExit(f"No hay archivos .xlsx en {carpeta}")
    partes = []
    for f in archivos:
        d = pd.read_excel(f, dtype=str)
        faltan = {"FECHA", "NOMBRE", "DISTRITO", "CLUSTER", "EAN", "DESCRIPCION", "Ventas netas(sin IGV)", "Unidades vendidas netas", "STOCK"} - set(d.columns)
        if faltan:
            raise SystemExit(f"{f.name}: faltan columnas {sorted(faltan)}")
        d["archivo"] = f.name
        partes.append(d)
    d = pd.concat(partes, ignore_index=True)
    d = d[d.FECHA.notna() & d.NOMBRE.notna()].copy()
    # Las fechas vienen como fecha de Excel («2026-09-16 00:00:00») o como texto día/mes/año («1/09/2026»).
    iso = pd.to_datetime(d.FECHA, format="%Y-%m-%d %H:%M:%S", errors="coerce")
    dmy = pd.to_datetime(d.FECHA, format="%d/%m/%Y", errors="coerce")
    d["fecha"] = iso.fillna(dmy).dt.date
    if d.fecha.isna().any():
        raise SystemExit(f"Fechas que no se entienden: {d[d.fecha.isna()].FECHA.unique()[:5]}")
    for c, n in (("Ventas netas(sin IGV)", "venta"), ("Unidades vendidas netas", "und"), ("STOCK", "stock")):
        d[n] = pd.to_numeric(d[c], errors="coerce").fillna(0)
    d["tienda"] = d.NOMBRE.str.strip()
    d["ean"] = d.EAN.str.strip().str.replace(r"\.0$", "", regex=True)
    d["distrito"] = d.DISTRITO.map(lugar)
    d["cluster"] = ("Cluster " + d.CLUSTER.str.strip().str.upper()).where(d.CLUSTER.notna() & (d.CLUSTER.str.strip() != ""), "Sin cluster")
    d["estado"] = d["ESTADO DEL CODIGO"].fillna("").str.strip().str.upper().str[:1].map({"A": "Activo", "I": "Inactivo"}).fillna("")
    dup = d.duplicated(["fecha", "tienda", "ean"], keep=False)
    if dup.any():
        raise SystemExit(f"Hay filas repetidas (mismo día, tienda y EAN): {d[dup][['fecha', 'tienda', 'ean']].head().to_dict('records')}")
    return d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("carpeta", type=Path)
    ap.add_argument("--prueba", action="store_true", help="carga y verifica, pero deshace todo")
    a = ap.parse_args()
    d = leer(a.carpeta)
    dias = sorted(d.fecha.unique())
    print(f"Leídos {d.archivo.nunique()} archivos: {dias[0]} a {dias[-1]} ({len(dias)} días) · {d.tienda.nunique()} tiendas · "
          f"{d.und.sum():,.0f} und · S/ {d.venta.sum():,.2f} · stock último día {d[d.fecha == dias[-1]].stock.sum():,.0f}")
    with conectar() as con, con.transaction(force_rollback=a.prueba):
        # Precio de despacho a OXXO por SKU de Calderón (promedio ponderado del Excel Ventas RETAIL): ingreso Calderón estimado.
        eq = dict(con.execute("select codigo, sku from sku_equivalencia where sistema = %s", (CLIENTE,)).fetchall())
        precio = {r[0]: float(r[1]) for r in con.execute(
            """select coalesce(v.sku, v.codigo), sum(v.monto) / nullif(sum(v.cantidad), 0) from retail_ventas v
               join retail_clientes c on c.cliente = v.cliente where c.tipo = 'OXXO' group by 1""")}
        d["precio"] = d.ean.map(lambda e: precio.get(eq.get(e)))
        sin_precio = d[d.precio.isna() & (d.und != 0)].DESCRIPCION.unique()
        if len(sin_precio):
            print(f"Sin precio de despacho (ingreso Calderón queda en 0): {list(sin_precio)}")
        d["costo"] = (d.und * d.precio.fillna(0)).round(4)
        d["inv_costo"] = (d.stock * d.precio.fillna(0)).round(4)

        # Tiendas: el código se asigna una vez (por nombre) y se conserva.
        cod = dict(con.execute("select nombre, cod_local from locales where cliente = %s", (CLIENTE,)).fetchall())
        siguiente = max(cod.values(), default=0) + 1
        ult = d.sort_values("fecha").groupby("tienda").last()
        for t, r in ult.iterrows():
            if t not in cod:
                cod[t] = siguiente
                siguiente += 1
            con.execute("""insert into locales (cliente, cod_local, local, nombre, cadena, zona, formato, tipo, estado)
                           values (%s, %s, %s, %s, %s, %s, 'OXXO', 'Tienda de conveniencia', 'ACTIVO')
                           on conflict (cliente, cod_local) do update set local = excluded.local, nombre = excluded.nombre,
                             cadena = excluded.cadena, zona = excluded.zona""",
                        (CLIENTE, cod[t], t, t, r.cluster, r.distrito or "Sin distrito"))
        d["cod_local"] = d.tienda.map(cod)
        for e, r in d.sort_values("fecha").groupby("ean").last().iterrows():
            con.execute("""insert into productos (cliente, sku, producto, nombre, marca, umb, estado) values (%s, %s, %s, %s, 'CALDERON', 'UN', %s)
                           on conflict (cliente, sku) do update set producto = excluded.producto, nombre = excluded.nombre, estado = excluded.estado""",
                        (CLIENTE, e, r.DESCRIPCION.strip(), r.DESCRIPCION.strip().capitalize(), r.estado.upper() or "ACTIVO"))

        desde, hasta = dias[0], dias[-1]
        for t in ("venta_local_dia", "venta_producto_dia"):
            con.execute(f"delete from {t} where cliente = %s and fecha between %s and %s", (CLIENTE, desde, hasta))
        con.execute("delete from inventario_local where cliente = %s and fecha_inv between %s and %s", (CLIENTE, desde, hasta))
        with con.cursor().copy("copy venta_local_dia (cliente, fecha, sku, cod_local, und, venta, costo) from stdin") as cp:
            for r in d.itertuples():
                cp.write_row((CLIENTE, r.fecha, r.ean, int(r.cod_local), r.und, round(r.venta, 4), r.costo))
        g = d.groupby(["fecha", "ean"])[["und", "venta", "costo"]].sum().reset_index()
        with con.cursor().copy("copy venta_producto_dia (cliente, fecha, sku, und, venta, costo) from stdin") as cp:
            for r in g.itertuples():
                cp.write_row((CLIENTE, r.fecha, r.ean, r.und, round(r.venta, 4), round(r.costo, 4)))
        with con.cursor().copy("copy inventario_local (cliente, fecha_inv, sku, cod_local, inv_und, inv_costo) from stdin") as cp:
            for r in d.itertuples():
                cp.write_row((CLIENTE, r.fecha, r.ean, int(r.cod_local), r.stock, r.inv_costo))

        n, u, v = con.execute("select count(*), coalesce(sum(und), 0), coalesce(sum(venta), 0) from venta_local_dia where cliente = %s and fecha between %s and %s",
                              (CLIENTE, desde, hasta)).fetchone()
        s = con.execute("select coalesce(sum(inv_und), 0) from inventario_local where cliente = %s and fecha_inv between %s and %s", (CLIENTE, desde, hasta)).fetchone()[0]
        if n != len(d) or abs(float(u) - d.und.sum()) > 0.001 or abs(float(v) - d.venta.sum()) > 0.005 or abs(float(s) - d.stock.sum()) > 0.001:
            raise SystemExit(f"No cuadra: leído {len(d)} filas, {d.und.sum()} und, S/ {d.venta.sum():.2f}; guardado {n}, {u}, S/ {v}. No se cambió nada.")
        for dia, x in d.groupby("fecha"):
            con.execute("insert into cargas (cliente, fecha, nivel, estado, filas, und, venta, detalle) values (%s, %s, 'local', 'ok', %s, %s, %s, %s)",
                        (CLIENTE, dia, len(x), float(x.und.sum()), round(float(x.venta.sum()), 2), "reporte diario de OXXO"))
        print(f"{'PRUEBA (deshecha): ' if a.prueba else ''}Cargado y verificado: {n:,} filas · {float(u):,.0f} und · S/ {float(v):,.2f} · "
              f"{len(cod)} tiendas")


if __name__ == "__main__":
    main()
