"""Carga el Excel de ventas virtuales («REPORTE DE VENTAS … PROVINCIA - DELIVERY», hoja 2026) a la tabla digital_ventas.

De ahí sale la división del Canal digital (usuario VENTAS01 de ContaNet) en Lima (DELIVERY) y Provincia, con distrito y
departamento por comprobante, y la historia del canal antes de que ContaNet esté cargado. El archivo trae el año completo:
la carga reemplaza toda la tabla y verifica que lo guardado cuadre al céntimo con el Excel.

Uso:  python digital_excel.py "REPORTE DE VENTAS 2026 PROVINCIA - DELIVERY.xlsx" [--prueba]
"""
import argparse
import json
import re
import unicodedata
from pathlib import Path

import pandas as pd

from psycopg.types.json import Jsonb

from conexion import conectar

SISTEMA = "00000000-0000-0000-0000-00000000c0a7"  # usuario del robot (si no se indica --correo)

# SKU oficial a partir de la DESCRIPCIÓN: en el Excel virtual el mismo código se usó para productos distintos según el mes
# (TUR1110 fue el 950 g y también el turroncito del Día de la Madre), así que la descripción manda y el código es el último recurso.
# Cada regla: palabras que deben estar (sin tildes, en minúscula) → SKU. Si ninguna calza, queda sin SKU (pendiente), nunca uno adivinado.
REGLAS_SKU = [
    (("promocion", "30", "turroncitos", "ajonjoli"), "TUR12477"), (("promocion", "30", "turroncitos", "tradicional"), "TUR12478"),
    (("ramo", "san val"), "RTSV1116"), (("turroncito", "madre"), "TUR1110"), (("turroncito", "san valentin"), "TUR1111"),
    (("turroncito", "ajonjoli"), "TA1115"), (("turroncito", "tradicional"), "TT1114"), (("turron", "fiestas patrias"), "TFP1119"),
    (("turron", "ajonjoli", "900"), "TKA1111"), (("turron", "ajonjoli", "450"), "TMA1113"),
    (("turron", "tradicional", "950"), "TK1110"), (("turron", "tradicional", "500"), "TMT1112"),
    (("chocopaneton",), "CHP1126"), (("paneton", "ziploc"), "PZ1125"), (("paneton", "caja"), "PAN1124"), (("paneton", "bolsa"), "PB1124"),
    (("taper", "alfaj"), "ALFA1145"), (("alfajores", "taper"), "ALFA1145"), (("taper", "oreja"), "OREJA1146"), (("oreja", "taper"), "OREJA1146"),
    (("taper", "empanada"), "EMP1147"), (("taper", "milhoja"), "MH11152"), (("taper", "pionono"), "PIONONO1149"),
    (("empanada",), "EMP1132"), (("milhoja",), "MH1135"), (("rosquita",), "ROS1133"), (("pie de manzana",), "PYE1134"),
]


def sku_por_descripcion(desc: str | None) -> str | None:
    if not desc:
        return None
    t = unicodedata.normalize("NFD", str(desc)).encode("ascii", "ignore").decode().lower()
    for palabras, sku in REGLAS_SKU:
        if all(p in t for p in palabras):
            return sku
    return None


CANAL = {"DELIVERY": "LIMA", "PROVINCIA": "PROVINCIA"}
TIPO = {"B": "Boleta", "F": "Factura"}


def medio(v) -> str:
    """YAPE → Yape; BCP/BBVA → Transferencia; EFECTIVO → Contado (mismos nombres que ContaNet)."""
    t = str(v or "").upper()
    if "YAPE" in t:
        return "Yape"
    if "BCP" in t or "BBVA" in t:
        return "Transferencia"
    return "Contado" if "EFECTIVO" in t else (str(v).strip().title() if v else "")


def comprobante(v) -> tuple[str, int] | None:
    """«B008-3140», «BOL/B008/00004837», «OTR/NV08/00000001» → ('B008', 3140)."""
    m = re.match(r"^(?:[A-Z]{3}/)?([A-Z]{1,2}\d{2,3}|SN)[-/]0*(\d+)$", str(v).strip().upper())
    return (m.group(1), int(m.group(2))) if m else None


def texto(v) -> str | None:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    t = str(v).strip()
    return (t[:-2] if re.fullmatch(r"\d+\.0", t) else t) or None


def lugar(v) -> str | None:
    """Nombre de lugar con mayúscula inicial en cada palabra («ica» → «Ica», «LA LIBERTAD» → «La Libertad»)."""
    t = texto(v)
    if t and t.upper() == "PE-AMA":   # código ISO de Amazonas en la lista de validación del Excel
        return "Amazonas"
    return " ".join(w if w.lower() in ("de", "del", "la", "las", "los", "el") and i else w.capitalize()
                    for i, w in enumerate(t.lower().split())) if t else None


def leer(ruta: Path, eq: dict[str, str], skus: set[str]) -> pd.DataFrame:
    # La hoja con las ventas: «2026» en el Excel actual o «Pedidos» en la plantilla; si no, la primera que tenga las columnas.
    hojas = pd.ExcelFile(ruta).sheet_names
    hoja = next((h for h in ("2026", "Pedidos") if h in hojas), None)
    if hoja is None:
        hoja = next(h for h in hojas if {"Fecha Registro", "Nro Comprobante", "Total Linea"} <= set(pd.read_excel(ruta, sheet_name=h, nrows=0).columns))
    d = pd.read_excel(ruta, sheet_name=hoja)
    d = d[d["Fecha Registro"].notna()].copy()
    # Líneas sin número de comprobante (pocas): se cargan igual con la serie «SN» para no perder venta.
    sin_num = d["Nro Comprobante"].isna()
    d.loc[sin_num, "Nro Comprobante"] = [f"SN-{i + 1}" for i in range(int(sin_num.sum()))]
    malos = d[d["Nro Comprobante"].map(comprobante).isna()]
    if len(malos):
        raise SystemExit(f"Comprobantes que no se entienden: {malos['Nro Comprobante'].unique()[:10]}")
    sin_canal = d[~d.Canal.astype(str).str.strip().str.upper().isin(CANAL)]
    if len(sin_canal):
        raise SystemExit(f"Filas con canal desconocido: {sin_canal.Canal.unique()}")
    sn = d["Nro Comprobante"].map(comprobante)
    codigo = d["Código"].map(texto).str.upper()
    out = pd.DataFrame({
        "fecha": pd.to_datetime(d["Fecha Registro"]).dt.date,
        "serie": sn.map(lambda x: x[0]), "numero": sn.map(lambda x: x[1]),
        "cliente": d["Tercero"].map(texto), "doc_cliente": d["Documento"].map(texto),
        "codigo": codigo,
        "sku": [sku_por_descripcion(dsc) or (None if dsc else (eq.get(c) or (c if c in skus else None)))
                for c, dsc in zip(codigo, d["Descripción"].map(texto))],
        "producto": d["Descripción"].map(texto),
        "und": pd.to_numeric(d["Cantidad"], errors="coerce"), "precio_unit": pd.to_numeric(d["Precio Unitario"], errors="coerce"),
        "total": pd.to_numeric(d["Total Linea"], errors="coerce").round(4),
        "medio_pago": d["Medio pago"].map(medio), "canal": d.Canal.astype(str).str.strip().str.upper().map(CANAL),
        "distrito": d["Distrito"].map(lugar), "provincia": d["Provincia"].map(lugar), "departamento": d["Departamento"].map(lugar),
        "salio_de": d["Salió de"].map(texto), "observacion": d["Observación"].map(texto),
    })
    out["comprobante"] = out.serie + "-" + out.numero.astype(str)
    out["tipo_comprobante"] = out.serie.str[0].map(TIPO).where(out.serie != "SN").fillna("Otro")
    out["archivo"] = ruta.name
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("archivo", type=Path)
    ap.add_argument("--prueba", action="store_true", help="carga y verifica, pero deshace todo")
    ap.add_argument("--correo", help="usuario de la web a nombre de quien queda la carga")
    a = ap.parse_args()
    with conectar() as con:
        eq = dict(con.execute("select codigo, sku from sku_equivalencia where sistema = 'ContaNet'").fetchall())
        skus = {r[0] for r in con.execute("select sku from sku_maestro")}
        d = leer(a.archivo, eq, skus)
        total, filas = round(float(d.total.sum()), 2), len(d)
        print(f"Leído {a.archivo.name}: {filas:,} líneas · {d.fecha.min()} a {d.fecha.max()} · S/ {total:,.2f} · "
              + " · ".join(f"{k} S/ {v:,.2f}" for k, v in d.groupby("canal").total.sum().items()))
        sin_sku = d[d.sku.isna()].codigo.unique()
        if len(sin_sku):
            print(f"Códigos sin SKU oficial (se cargan igual): {list(sin_sku)}")
        cols = ["fecha", "comprobante", "serie", "numero", "tipo_comprobante", "cliente", "doc_cliente", "codigo", "sku", "producto",
                "und", "precio_unit", "total", "medio_pago", "canal", "distrito", "provincia", "departamento", "salio_de", "observacion"]
        filas_json = json.loads(d[cols].assign(fecha=d.fecha.astype(str)).to_json(orient="records", force_ascii=False))
        uid = con.execute("select id from auth.users where email = %s", (a.correo,)).fetchone() if a.correo else None
        sub = str(uid[0]) if uid else SISTEMA
        with con.transaction(force_rollback=a.prueba):
            # Mismo camino que el botón «Cargar ventas virtuales» de la web: carga preparada -> filas -> confirmar_carga
            # (reemplaza las fechas del archivo, deja respaldo para deshacer y verifica al céntimo).
            con.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps({"sub": sub, "role": "authenticated"}),))
            con.execute("set local role authenticated")
            desde, hasta = str(d.fecha.min()), str(d.fecha.max())
            cid = con.execute(
                "insert into cargas_web (tipo, archivo, desde, hasta, rangos, filas, und, venta, correo) "
                "values ('virtual', %s, %s, %s, %s, %s, %s, %s, %s) returning id",
                (a.archivo.name, desde, hasta, Jsonb([{"tienda": None, "desde": desde, "hasta": hasta}]), filas,
                 round(float(d.und.fillna(0).sum()), 3), total, a.correo or "Carga desde rpa")).fetchone()[0]
            for k in range(0, filas, 2000):
                con.execute("insert into cargas_web_filas (carga, parte, filas) values (%s, %s, %s)", (cid, k // 2000, Jsonb(filas_json[k:k + 2000])))
            res = con.execute("select confirmar_carga(%s)", (cid,)).fetchone()[0]
        print(f"{'PRUEBA (deshecha): ' if a.prueba else ''}Cargado y verificado: {res}")


if __name__ == "__main__":
    main()
