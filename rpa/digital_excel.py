"""Carga el Excel de ventas virtuales («REPORTE DE VENTAS … PROVINCIA - DELIVERY», hoja 2026) a la tabla digital_ventas.

De ahí sale la división del Canal digital (usuario VENTAS01 de ContaNet) en Lima (DELIVERY) y Provincia, con distrito y
departamento por comprobante, y la historia del canal antes de que ContaNet esté cargado. El archivo trae el año completo:
la carga reemplaza toda la tabla y verifica que lo guardado cuadre al céntimo con el Excel.

Uso:  python digital_excel.py "REPORTE DE VENTAS 2026 PROVINCIA - DELIVERY.xlsx" [--prueba]
"""
import argparse
import re
from pathlib import Path

import pandas as pd

from conexion import conectar

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
    d = pd.read_excel(ruta, sheet_name="2026", usecols=range(20))
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
        "codigo": codigo, "sku": codigo.map(lambda c: eq.get(c) or (c if c in skus else None)),
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
                "und", "precio_unit", "total", "medio_pago", "canal", "distrito", "provincia", "departamento", "salio_de", "observacion", "archivo"]
        with con.transaction(force_rollback=a.prueba):
            antes = con.execute("select count(*), coalesce(sum(total), 0) from digital_ventas").fetchone()
            con.execute("delete from digital_ventas")
            with con.cursor().copy(f"copy digital_ventas ({', '.join(cols)}) from stdin") as cp:
                for fila in d[cols].astype(object).where(d[cols].notna(), None).itertuples(index=False):
                    cp.write_row(fila)
            n, s = con.execute("select count(*), coalesce(sum(total), 0) from digital_ventas").fetchone()
            if n != filas or abs(float(s) - total) > 0.005:
                raise SystemExit(f"No cuadra: se leyeron {filas} líneas y S/ {total}, se guardaron {n} y S/ {s}. No se cambió nada.")
        print(f"{'PRUEBA (deshecha): ' if a.prueba else ''}Cargado y verificado: {n:,} líneas · S/ {float(s):,.2f} "
              f"(reemplazó {antes[0]:,} líneas · S/ {float(antes[1]):,.2f})")


if __name__ == "__main__":
    main()
