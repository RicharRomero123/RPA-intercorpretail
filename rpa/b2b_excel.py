"""Carga el Excel «Ventas B2B» (pedidos a empresas) a b2b_ventas, con el producto limpio al SKU de ContaNet.

Uso:  python b2b_excel.py "Ventas B2B 2026.xlsx" [--prueba]
Reemplaza todo el año del archivo y verifica el total al céntimo. Con --prueba solo muestra el resumen y el mapeo.
Los productos sin SKU en ContaNet hechos con la marca del cliente («maquila») van al SKU del producto base, marcados como maquila.
"""
import argparse
import re
import unicodedata
from datetime import date, datetime
from pathlib import Path

import openpyxl

from conexion import conectar

# Producto como viene en el Excel (normalizado: sin tildes, mayúsculas, espacios simples) -> (SKU de ContaNet, maquila)
SKU = {
    "TPT": ("TT1114", False), "TPT 156G": ("TT1114", False),          # turroncito tradicional 70 g (156 g: mismo producto, confirmado)
    "TPA": ("TA1115", False),
    "TKT": ("TK1110", False), "TURRON 950G TRADICIONAL CALDERON": ("TK1110", False),
    "TKA": ("TKA1111", False),
    "TMT": ("TMT1112", False), "TURRON 500G TRADICIONAL CALDERON": ("TMT1112", False),
    "TMA": ("TMA1113", False),
    "TMT FP 500G": ("TFP1119", False), "TFP": ("TFP1119", False),     # 500 g Fiestas Patrias
    "TURRON 120G SV": ("TUR1111", False),                              # San Valentín 120 g
    "TDMADRE": ("TUR1110", False),                                     # turroncito Día de la Madre
    "BDMADRE 500G": ("PAN1127", False),                                # chocopanetón 500 g Día de la Madre (caja de panetón)
    "ROSQUITAS": ("ROS1133", False), "ALFAJORES": ("ALFA1145", False), "EMPANADAS": ("EMP1147", False),
    "OREJITAS": ("OREJA1146", False), "PANETON": ("PAN1124", False), "CHOCOTON": ("CHP1126", False),
    # Maquila: marca del cliente, al SKU del producto base
    "TURRON TRADICIONAL MAQUILA 475G": ("TMT1112", True), "TURRON TRADICIONAL MAQUILA 500G": ("TMT1112", True),
    "TURRON 70G MAQUILA DIA DE LA MADRE": ("TT1114", True), "TURRON 70G MAQUILA DIA DEL FARMACEUTICO": ("TT1114", True),
}
COLUMNAS = {"DIA DE DESPACHO": "fecha", "RUC": "ruc", "RAZON SOCIAL CLIENTE": "cliente", "NOMBRE": "contacto", "NUMERO": "telefono",
            "PRODUCTO": "producto_excel", "CANTIDAD": "und", "PRECIO UNITARIO": "precio", "MONTO CANCELADO": "venta",
            "CONDICION DE PAGO": "condicion_pago", "DIRECCION": "direccion", "DETALLE DE DESPACHO": "detalle", "STATUS": "status"}


def normal(v) -> str:
    t = "" if v is None else str(v).strip()
    t = unicodedata.normalize("NFD", t).encode("ascii", "ignore").decode().upper()
    return re.sub(r"\s+", " ", t)


def texto(v) -> str | None:
    if v is None:
        return None
    t = str(v).strip()
    return t[:-2] if t.endswith(".0") and t[:-2].isdigit() else (t or None)


def leer(ruta: Path) -> list[dict]:
    ws = openpyxl.load_workbook(ruta, data_only=True, read_only=True).active
    filas = list(ws.iter_rows(values_only=True))
    pos = {normal(t): i for i, t in reversed(list(enumerate(filas[0]))) if normal(t)}
    faltan = [c for c in ("RAZON SOCIAL CLIENTE", "CANTIDAD", "PRODUCTO", "MONTO CANCELADO", "DIA DE DESPACHO") if c not in pos]
    if faltan:
        raise SystemExit(f"Faltan columnas: {', '.join(faltan)}")
    salida, sin_sku = [], set()
    for f in filas[1:]:
        r = {k: (f[pos[c]] if c in pos and pos[c] < len(f) else None) for c, k in COLUMNAS.items()}
        if r["cliente"] is None and r["venta"] is None:
            continue
        fecha = r["fecha"]
        r["fecha"] = fecha.date() if isinstance(fecha, datetime) else fecha if isinstance(fecha, date) else datetime.strptime(str(fecha)[:10], "%Y-%m-%d").date()
        for k in ("ruc", "cliente", "contacto", "telefono", "producto_excel", "condicion_pago", "direccion", "detalle", "status"):
            r[k] = texto(r[k])
        r["und"], r["venta"] = float(r["und"] or 0), round(float(r["venta"] or 0), 2)
        r["precio"] = None if r["precio"] is None else float(r["precio"])
        sku = SKU.get(normal(r["producto_excel"]))
        if not sku:
            sin_sku.add(r["producto_excel"])
        r["sku"], r["maquila"] = sku if sku else (None, False)
        salida.append(r)
    if sin_sku:
        raise SystemExit(f"Productos sin SKU (agrégalos a SKU en b2b_excel.py): {sorted(sin_sku)}")
    return salida


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("archivo")
    ap.add_argument("--prueba", action="store_true")
    a = ap.parse_args()
    ruta = Path(a.archivo)
    filas = leer(ruta)
    anios = sorted({r["fecha"].year for r in filas})
    total = round(sum(r["venta"] for r in filas), 2)
    print(f"Leídas {len(filas)} filas · {filas and min(r['fecha'] for r in filas)} a {filas and max(r['fecha'] for r in filas)} · S/ {total:,.2f}")
    por_mes: dict[str, float] = {}
    for r in filas:
        k = r["fecha"].strftime("%Y-%m")
        por_mes[k] = por_mes.get(k, 0) + r["venta"]
    for k, v in sorted(por_mes.items()):
        print(f"  {k}: S/ {v:,.2f}")
    if a.prueba:
        for p in sorted({(r["producto_excel"], r["sku"], r["maquila"]) for r in filas}):
            print(f"  {p[0]!r:45} -> {p[1]}{' (maquila)' if p[2] else ''}")
        return
    with conectar() as con:
        skus = {s for (s,) in con.execute("select sku from sku_maestro").fetchall()}
        malos = sorted({r["sku"] for r in filas} - skus)
        if malos:
            raise SystemExit(f"SKU que no están en sku_maestro: {malos}")
        con.execute("delete from b2b_ventas where extract(year from fecha) = any(%s)", (anios,))
        cols = ["fecha", "ruc", "cliente", "contacto", "telefono", "producto_excel", "sku", "maquila", "und", "precio", "venta",
                "condicion_pago", "direccion", "detalle", "status"]
        with con.cursor() as cur:
            cur.executemany(f"insert into b2b_ventas ({', '.join(cols)}, archivo) values ({', '.join(['%s'] * (len(cols) + 1))})",
                            [[r[c] for c in cols] + [ruta.name] for r in filas])
        (n, s), = con.execute("select count(*), coalesce(round(sum(venta), 2), 0) from b2b_ventas where extract(year from fecha) = any(%s)", (anios,)).fetchall()
        if n != len(filas) or abs(float(s) - total) > 0.005:
            raise SystemExit(f"No cuadra: base {n} filas S/ {s} vs archivo {len(filas)} filas S/ {total}")
        con.commit()
    print(f"Cargado y verificado: {n} filas · S/ {float(s):,.2f}")


if __name__ == "__main__":
    main()
