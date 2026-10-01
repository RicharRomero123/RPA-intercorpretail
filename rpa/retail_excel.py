"""Carga el Excel «Ventas RETAIL» (despachos de Calderón a clientes retail) por el mismo camino que el botón de la web:
cargas_web -> cargas_web_filas -> confirmar_carga (reemplaza los mismos clientes y fechas, deja respaldo y verifica al céntimo).

Uso:  python retail_excel.py "Ventas RETAIL 2026.xlsx" --correo usuario@dominio [--prueba]
Los tipos de retail de cada cliente salen de TIPOS (los clientes ya clasificados en la base conservan su tipo).
"""
import argparse
import json
import unicodedata
from datetime import date, datetime
from pathlib import Path

import openpyxl
from psycopg.types.json import Jsonb

from conexion import conectar

# Tipo de retail por cliente (razón social tal como viene en el Excel).
TIPOS = {
    "SUPERMERCADOS PERUANOS": "Supermercados",
    "TOTTUS": "Supermercados",
    "OXXO (CADENA DE COMERCIO PERU S.A.C": "Conveniencia",
    "PEDIDOS YA MARKET (DELIVERY HERO DMART PERU S.A.C.)": "Delivery / quick commerce",
    "VENDOMATICA": "Vending",
    "GSI": "Por clasificar",
}
COLUMNAS = {
    "RAZON SOCIAL EMISOR": "emisor", "RUC": "ruc", "RAZON SOCIAL CLIENTE": "cliente", "CANTIDAD": "und",
    "PRECIO UNITARIO": "precio_unitario", "TIPO DE VENTA": "tipo_venta", "SKU": "codigo", "PRODUCTO": "producto",
    "MONTO CANCELADO": "venta", "CONDICION DE PAGO": "condicion_pago", "DIRECCION": "direccion",
    "DETALLE DE DESPACHO": "detalle_despacho", "DIA DE DESPACHO": "fecha", "STATUS": "status",
}


def normal(v) -> str:
    t = "" if v is None else str(v).strip()
    return unicodedata.normalize("NFD", t).encode("ascii", "ignore").decode().upper()


def texto(v) -> str | None:
    if v is None:
        return None
    t = str(v).strip()
    return t[:-2] if t.endswith(".0") and t[:-2].isdigit() else (t or None)


def leer(ruta: Path, eq: dict[str, str], skus: set[str]) -> dict:
    ws = openpyxl.load_workbook(ruta, data_only=True, read_only=True).active
    filas = list(ws.iter_rows(values_only=True))
    pos = {normal(t): i for i, t in reversed(list(enumerate(filas[0]))) if normal(t)}
    faltan = [c for c in ("RAZON SOCIAL CLIENTE", "CANTIDAD", "SKU", "MONTO CANCELADO", "DIA DE DESPACHO") if c not in pos]
    if faltan:
        raise SystemExit(f"Faltan columnas: {', '.join(faltan)}")
    salida = []
    for f in filas[1:]:
        r = {k: (f[pos[c]] if c in pos and pos[c] < len(f) else None) for c, k in COLUMNAS.items()}
        if all(v is None or str(v).strip() == "" for v in r.values()):
            continue
        fecha = r["fecha"]
        if isinstance(fecha, datetime):
            fecha = fecha.date()
        if not isinstance(fecha, date) or not texto(r["cliente"]):
            raise SystemExit(f"Fila sin fecha o sin cliente: {f}")
        codigo = (texto(r["codigo"]) or "").upper() or None
        salida.append({
            "fecha": fecha.isoformat(), "emisor": texto(r["emisor"]), "ruc": texto(r["ruc"]), "cliente": texto(r["cliente"]),
            "und": None if r["und"] is None else round(float(r["und"]), 3),
            "precio_unitario": None if r["precio_unitario"] is None else round(float(r["precio_unitario"]), 4),
            "tipo_venta": texto(r["tipo_venta"]), "codigo": codigo,
            "sku": (eq.get(codigo) or (codigo if codigo in skus else None)) if codigo else None, "producto": texto(r["producto"]),
            "venta": None if r["venta"] is None else round(float(r["venta"]), 4), "condicion_pago": texto(r["condicion_pago"]),
            "direccion": texto(r["direccion"]), "detalle_despacho": texto(r["detalle_despacho"]), "status": texto(r["status"]),
        })
    clientes = sorted({x["cliente"] for x in salida})
    rangos = [{"tienda": c, "desde": min(x["fecha"] for x in salida if x["cliente"] == c),
               "hasta": max(x["fecha"] for x in salida if x["cliente"] == c)} for c in clientes]
    return {"filas": salida, "rangos": rangos, "clientes": clientes,
            "desde": min(x["fecha"] for x in salida), "hasta": max(x["fecha"] for x in salida),
            "und": round(sum(x["und"] or 0 for x in salida), 3), "venta": round(sum(x["venta"] or 0 for x in salida), 4)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("archivo")
    ap.add_argument("--correo", required=True, help="usuario de la web a nombre de quien queda la carga")
    ap.add_argument("--prueba", action="store_true", help="carga y verifica, pero deshace todo al final")
    a = ap.parse_args()
    ruta = Path(a.archivo)
    with conectar() as con:
        eq = dict(con.execute("select codigo, sku from sku_equivalencia where sistema = 'ContaNet'").fetchall())
        skus = {r[0] for r in con.execute("select sku from sku_maestro")}
        ya = dict(con.execute("select cliente, tipo from retail_clientes").fetchall())
        uid = con.execute("select id from auth.users where email = %s", (a.correo,)).fetchone()
        if not uid:
            raise SystemExit(f"No existe el usuario {a.correo}")
        r = leer(ruta, eq, skus)
        ruc = {x["cliente"]: x["ruc"] for x in r["filas"]}
        faltan = [c for c in r["clientes"] if c not in ya and c not in TIPOS]
        if faltan:
            raise SystemExit(f"Clientes sin tipo de retail: {faltan}")
        clientes = [{"cliente": c, "ruc": ruc[c] or "", "tipo": ya.get(c) or TIPOS[c]} for c in r["clientes"]]
        print(f"Leído {ruta.name}: {len(r['filas'])} filas · {r['desde']} a {r['hasta']} · {r['und']:,.0f} und · S/ {r['venta']:,.2f}")
        with con.transaction(force_rollback=a.prueba):
            con.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps({"sub": str(uid[0]), "role": "authenticated"}),))
            con.execute("set local role authenticated")
            cid = con.execute(
                "insert into cargas_web (tipo, archivo, desde, hasta, rangos, filas, und, venta, correo, clientes) "
                "values ('retail', %s, %s, %s, %s, %s, %s, %s, %s, %s) returning id",
                (ruta.name, r["desde"], r["hasta"], Jsonb(r["rangos"]), len(r["filas"]), r["und"], r["venta"], a.correo, Jsonb(clientes))).fetchone()[0]
            con.execute("insert into cargas_web_filas (carga, parte, filas) values (%s, 0, %s)", (cid, Jsonb(r["filas"])))
            res = con.execute("select confirmar_carga(%s)", (cid,)).fetchone()[0]
        print(f"{'PRUEBA (deshecha): ' if a.prueba else ''}Cargado y verificado: {res}")


if __name__ == "__main__":
    main()
