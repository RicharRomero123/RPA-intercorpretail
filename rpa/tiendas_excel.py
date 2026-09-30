"""Módulo TIENDAS: consolida los Excel de venta diaria de las tiendas propias en un formato único, normaliza los
códigos al SKU oficial (código ContaNet) y lo carga a la base (Supabase).

Fuentes (la misma carpeta que usa el Power BI, «01. Ventas Diarias»):
  - Carpetas «01. Enero» … «04. Abril»: un archivo por mes con todas las tiendas (ene–abr 2025).
  - Archivos «AVANCE DE VENTA - <TIENDA> …»: un archivo por tienda, acumulado desde may-2025.
Cada archivo tiene una hoja «Data» con: SUCURSAL, CANAL, Fecha, CODIGO, COD. SECUNDARIO, Tipo de Precio,
Categoría-Cliente, Tienda-Cantidad, Tienda-Total Venta S/.

Reglas (iguales al Power BI, para que los totales coincidan):
  - Cantidad y venta se convierten a número; una celda con texto queda vacía (el Power BI la carga en blanco).
  - «Tipo de Precio» vacío se deja como texto vacío.
Normalización de códigos (tabla de equivalencias de data/maestros/Calderon_Referencia_codigos.xlsx):
  - Primero por el CODIGO (sistema «Power BI»); si no está, por el código corto (COD. SECUNDARIO).
  - Si no hay equivalencia, el SKU queda vacío y el código va a la lista de pendientes. Nunca se adivina.

Uso:
    python tiendas_excel.py --revisar                 # consolida y muestra cuadres y pendientes, sin cargar
    python tiendas_excel.py                           # consolida y carga a la base
    python tiendas_excel.py --carpeta "D:\\...\\01. Ventas Diarias"
"""
from __future__ import annotations

import argparse
import io
import sys
import warnings
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

warnings.filterwarnings("ignore", message="Data Validation extension")

CARPETA_DEFECTO = Path(r"C:\Users\USER\Documents\Dashboard\01. Ventas Diarias")
REFERENCIA = Path(r"C:\Users\USER\Documents\RPA-proyect\data\maestros\Calderon_Referencia_codigos.xlsx")
MAESTRA = Path(r"C:\Users\USER\Documents\RPA-proyect\data\maestros\DATA-MAESTRA.xlsx")
LIMA = ZoneInfo("America/Lima")
COLUMNAS = {"SUCURSAL": "tienda", "CANAL": "canal", "Fecha": "fecha", "CODIGO": "codigo", "COD. SECUNDARIO": "codigo_corto",
            "Tipo de Precio": "tipo_precio", "Categoría-Cliente": "categoria_cliente", "Tienda-Cantidad": "und",
            "Tienda-Total Venta S/": "venta"}


def log(m: str) -> None:
    print(f"{datetime.now(LIMA):%H:%M:%S}  {m}", flush=True)


# ----------------------------------------------------------------------------- lectura
def leer_carpeta(carpeta: Path) -> pd.DataFrame:
    archivos = sorted(f for f in carpeta.rglob("*.xlsx") if not f.name.startswith("~$"))
    if not archivos:
        sys.exit(f"No hay archivos .xlsx en {carpeta}")
    partes = []
    for f in archivos:
        d = pd.read_excel(f, sheet_name="Data", dtype={"CODIGO": str, "COD. SECUNDARIO": str})
        faltan = set(COLUMNAS) - set(d.columns)
        if faltan:
            sys.exit(f"{f.name}: faltan columnas {sorted(faltan)}")
        d = d[list(COLUMNAS)].rename(columns=COLUMNAS)
        texto = {c: int((pd.to_numeric(d[c], errors="coerce").isna() & d[c].notna()).sum()) for c in ("und", "venta")}
        for c in ("und", "venta"):
            d[c] = pd.to_numeric(d[c], errors="coerce")
        d["fecha"] = pd.to_datetime(d["fecha"], errors="coerce").dt.date
        d["tipo_precio"] = d["tipo_precio"].fillna("")
        for c in ("tienda", "canal", "codigo", "codigo_corto", "categoria_cliente"):
            d[c] = d[c].astype("string").str.strip()
        d["archivo"] = f.name
        partes.append(d)
        log(f"{f.relative_to(carpeta)}: {len(d):,} filas | {d.fecha.min()} a {d.fecha.max()} | S/ {d.venta.sum():,.2f}"
            + (f" | celdas con texto: cantidad {texto['und']}, venta {texto['venta']}" if any(texto.values()) else ""))
    return pd.concat(partes, ignore_index=True)


# ----------------------------------------------------------------------------- SKU
def equivalencias() -> pd.DataFrame:
    eq = pd.read_excel(REFERENCIA, sheet_name=0, dtype=str)
    eq.columns = ["sistema", "codigo", "sku"]
    return eq.dropna(subset=["codigo", "sku"]).assign(codigo=lambda x: x.codigo.str.strip(), sku=lambda x: x.sku.str.strip())


def maestro() -> pd.DataFrame:
    m = pd.read_excel(MAESTRA, sheet_name="Productos", dtype={"SKU": str})
    m = m.rename(columns={"SKU": "sku", "Producto": "producto", "Código familia": "familia", "Tipo": "tipo",
                          "Unidades por SKU": "unidades", "Presentación": "presentacion", "Gramos": "gramos",
                          "Temporada": "temporada", "Precio referencia S/": "precio_ref"})
    return m.dropna(subset=["sku"])[["sku", "producto", "familia", "tipo", "unidades", "presentacion", "gramos",
                                    "temporada", "precio_ref"]]


def normalizar(v: pd.DataFrame, eq: pd.DataFrame) -> pd.DataFrame:
    por_codigo = eq[eq.sistema == "Power BI"].drop_duplicates("codigo").set_index("codigo")["sku"]
    por_corto = eq[eq.sistema == "Código corto"].drop_duplicates("codigo").set_index("codigo")["sku"]
    v = v.copy()
    v["sku"] = v["codigo"].map(por_codigo)
    falta = v["sku"].isna()
    v.loc[falta, "sku"] = v.loc[falta, "codigo_corto"].map(por_corto)
    v["origen_sku"] = "codigo"
    v.loc[falta & v["sku"].notna(), "origen_sku"] = "codigo_corto"
    v.loc[v["sku"].isna(), "origen_sku"] = "pendiente"
    return v


def pendientes(v: pd.DataFrame) -> pd.DataFrame:
    p = v[v["sku"].isna()]
    return (p.groupby(["codigo", "codigo_corto"], dropna=False)
            .agg(filas=("und", "size"), und=("und", "sum"), venta=("venta", "sum"),
                 tiendas=("tienda", lambda s: ", ".join(sorted(s.dropna().unique()))),
                 desde=("fecha", "min"), hasta=("fecha", "max"))
            .reset_index().sort_values("venta", ascending=False))


# ----------------------------------------------------------------------------- carga
ESQUEMA = Path(__file__).resolve().parent.parent / "supabase" / "002_tiendas.sql"


def cargar(v: pd.DataFrame, m: pd.DataFrame, eq: pd.DataFrame) -> None:
    import psycopg

    import api_intercorp as api
    from retail_diario import url_base

    with psycopg.connect(url_base(api.leer_env())) as con:
        con.execute(ESQUEMA.read_text(encoding="utf-8"))
        with con.transaction():
            con.execute("DELETE FROM sku_equivalencia")
            con.execute("DELETE FROM sku_maestro")
            with con.cursor().copy("COPY sku_maestro (sku, producto, familia, tipo, unidades, presentacion, gramos, "
                                   "temporada, precio_ref) FROM STDIN") as cp:
                for r in m.itertuples(index=False):
                    cp.write_row([None if pd.isna(x) else x for x in r])
            with con.cursor().copy("COPY sku_equivalencia (sistema, codigo, sku) FROM STDIN") as cp:
                for r in eq.drop_duplicates(["sistema", "codigo"]).itertuples(index=False):
                    cp.write_row(list(r))
            # Reemplazo completo de la venta de tiendas: los Excel son la fuente y pueden corregirse hacia atrás.
            con.execute("DELETE FROM tiendas_venta")
            cols = ["fecha", "tienda", "canal", "codigo", "codigo_corto", "sku", "origen_sku", "tipo_precio",
                    "categoria_cliente", "und", "venta", "archivo"]
            buf = io.StringIO()
            v[cols].to_csv(buf, index=False, header=False, na_rep="\\N")
            buf.seek(0)
            with con.cursor().copy(f"COPY tiendas_venta ({', '.join(cols)}) FROM STDIN WITH (FORMAT csv, NULL '\\N')") as cp:
                cp.write(buf.read())
            con.execute("INSERT INTO tiendas_cargas (filas, und, venta, desde, hasta, pendientes, detalle) "
                        "VALUES (%s,%s,%s,%s,%s,%s,%s)",
                        (len(v), round(float(v.und.sum()), 2), round(float(v.venta.sum()), 2), v.fecha.min(), v.fecha.max(),
                         int(v.sku.isna().sum()), f"{v.archivo.nunique()} archivos"))
        # Control: lo cargado debe ser idéntico a lo leído.
        n, und, venta = con.execute("SELECT count(*), round(sum(und),2), round(sum(venta),2) FROM tiendas_venta").fetchone()
    ok = n == len(v) and abs(float(venta) - round(float(v.venta.sum()), 2)) < 0.005 and abs(float(und) - round(float(v.und.sum()), 2)) < 0.005
    log(f"{'CUADRA' if ok else 'NO CUADRA'} carga en la base: {n:,} filas | {float(und):,.2f} und | S/ {float(venta):,.2f}")
    if not ok:
        sys.exit(1)


def main() -> None:
    ap = argparse.ArgumentParser(description="Consolida la venta de tiendas y la carga a la base.")
    ap.add_argument("--carpeta", type=Path, default=CARPETA_DEFECTO)
    ap.add_argument("--revisar", action="store_true", help="solo consolida y muestra cuadres y pendientes")
    a = ap.parse_args()
    v = normalizar(leer_carpeta(a.carpeta), eq := equivalencias())
    log(f"TOTAL: {len(v):,} filas | {v.fecha.min()} a {v.fecha.max()} | {v.und.sum():,.0f} und | S/ {v.venta.sum():,.2f}")
    cob = v.groupby("origen_sku")["venta"].agg(["size", "sum"])
    log("SKU normalizado: " + " | ".join(f"{k}: {int(r['size']):,} filas, S/ {r['sum']:,.2f}" for k, r in cob.iterrows()))
    p = pendientes(v)
    if len(p):
        log(f"{len(p)} códigos sin equivalencia (quedan pendientes, no se adivinan):")
        print(p.to_string(index=False))
    if not a.revisar:
        cargar(v, maestro(), eq)


if __name__ == "__main__":
    main()
