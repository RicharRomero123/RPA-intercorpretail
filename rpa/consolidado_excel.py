"""Consolidado de todos los canales: lee el Excel «Consolidado-all-canales» (hoja VENTAS NEGOCIO) y lo carga a la base.

El Excel tiene un bloque por canal (CALDERON = total del negocio, TIENDAS, RETAIL, PROVINCIA, LIMA, B2B, RAPPI, …):
    <CANAL>
    TOTAL | enero … diciembre | <total>
    2025        | venta real por mes
    real 2026   | venta real por mes (vacío = mes sin cerrar)
    meta 2026   | meta por mes
    VAR …, N.CUMPLI %   (se recalculan en la web; no se cargan)
La fecha de corte es la fecha que aparece en la cabecera de algún bloque (p. ej. 25/09/2026).

Controles (si alguno falla, no se carga nada):
  - Cada mes, la suma de los canales debe dar el total CALDERON (real 2025, real 2026 y meta 2026), al céntimo.

Uso:
    python consolidado_excel.py --revisar                     # lee y muestra los cuadres, sin cargar
    python consolidado_excel.py [--archivo "…\\Consolidado-all-canales.xlsx"]
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path

import openpyxl

ARCHIVO = Path(r"C:\Users\USER\Documents\RPA-proyect\Consolidado-all-canales.xlsx")
ESQUEMA = Path(__file__).resolve().parent.parent / "supabase" / "009_consolidado.sql"
TOTAL = "CALDERON"
# Canales descontinuados: solo se toman los años en que estuvieron activos. El bloque B2C trae en «real 2026» un valor
# suelto (ene-2026) que el total CALDERON no incluye; se ignora y se avisa.
DESCONTINUADOS = {"B2C-DESCONTINUADO": 2025}


def leer(ruta: Path) -> tuple[list[tuple], datetime | None]:
    ws = openpyxl.load_workbook(ruta, data_only=True)["VENTAS NEGOCIO"]
    filas = [list(f) for f in ws.iter_rows(values_only=True)]
    salida, corte, canal, anio_meta = [], None, None, None
    for i, f in enumerate(filas):
        cab = f[0]
        for v in f[1:14]:
            if isinstance(v, datetime):
                corte = max(corte, v) if corte else v
        siguiente = filas[i + 1][0] if i + 1 < len(filas) else None
        if isinstance(cab, str) and cab.strip() and str(siguiente).strip().upper() == "TOTAL":
            canal = cab.strip().upper()
            continue
        if canal is None or cab is None:
            continue
        clave = str(cab).strip().lower()
        valores = f[1:13]
        if isinstance(cab, (int, float)) and 2000 < cab < 2100:
            tipo, anio = "real", int(cab)
        elif clave.startswith("real "):
            tipo, anio = "real", int(clave.split()[1])
        elif clave.startswith("meta "):
            tipo, anio = "meta", int(clave.split()[1])
        else:
            continue
        if canal in DESCONTINUADOS and anio > DESCONTINUADOS[canal]:
            sueltos = [v for v in valores if isinstance(v, (int, float)) and v]
            if sueltos:
                print(f"  AVISO: {canal} tiene {tipo} {anio} = {sum(sueltos):,.2f} pero está descontinuado; no se carga (el total CALDERON no lo incluye).")
            continue
        for mes, v in enumerate(valores, start=1):
            if isinstance(v, (int, float)):
                salida.append((canal, anio, mes, tipo, round(float(v), 2)))
    return salida, corte


def armar(filas: list[tuple]) -> dict[tuple, dict]:
    """(canal, año, mes) -> {real, meta}."""
    d: dict[tuple, dict] = {}
    for canal, anio, mes, tipo, v in filas:
        d.setdefault((canal, anio, mes), {"real": None, "meta": None})[tipo] = v
    return d


def controlar(d: dict[tuple, dict]) -> list[str]:
    errores = []
    canales = {c for c, _, _ in d} - {TOTAL}
    for (c, anio, mes), x in sorted(d.items()):
        if c != TOTAL:
            continue
        for tipo in ("real", "meta"):
            if x[tipo] is None:
                continue
            suma = sum((d.get((k, anio, mes), {}).get(tipo) or 0) for k in canales)
            if abs(suma - x[tipo]) > 0.01:
                errores.append(f"{tipo} {anio}-{mes:02d}: canales suman {suma:,.2f} y el total CALDERON dice {x[tipo]:,.2f}")
    return errores


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--archivo", type=Path, default=ARCHIVO)
    ap.add_argument("--revisar", action="store_true")
    ap.add_argument("--corte", type=lambda x: datetime.strptime(x, "%Y-%m-%d"),
                    help="AAAA-MM-DD: hasta qué día llega la data de verdad (p. ej. el reporte interno de tiendas). Si es el último día "
                         "del mes, ese mes cuenta como cerrado; si no, queda «en curso». Por defecto: la fecha más reciente del Excel.")
    a = ap.parse_args()
    filas, corte = leer(a.archivo)
    if a.corte:
        print(f"Corte indicado a mano: {a.corte:%d/%m/%Y} (el Excel dice {corte:%d/%m/%Y})" if corte else f"Corte indicado a mano: {a.corte:%d/%m/%Y}")
        corte = a.corte
    d = armar(filas)
    canales = sorted({c for c, _, _ in d})
    print(f"{a.archivo.name}: {len(d)} celdas canal-mes · canales {canales} · corte {corte:%d/%m/%Y}" if corte else "sin fecha de corte")
    for anio in sorted({k[1] for k in d}):
        for tipo in ("real", "meta"):
            t = sum((x[tipo] or 0) for (c, y, _), x in d.items() if c == TOTAL and y == anio)
            if t:
                print(f"  {TOTAL} {tipo} {anio}: S/ {t:,.2f}")
    errores = controlar(d)
    if errores:
        print("NO CUADRA (no se carga):", *errores, sep="\n  ")
        sys.exit(1)
    print("Cuadra: en cada mes la suma de los canales es igual al total CALDERON.")
    if a.revisar:
        return

    import psycopg

    import api_intercorp as api
    from retail_diario import url_base

    with psycopg.connect(url_base(api.leer_env())) as con:
        con.execute(ESQUEMA.read_text(encoding="utf-8"))
        with con.transaction():
            con.execute("DELETE FROM consolidado_mensual")
            with con.cursor().copy("COPY consolidado_mensual (canal, anio, mes, real, meta) FROM STDIN") as cp:
                for (c, anio, mes), x in sorted(d.items()):
                    cp.write_row([c, anio, mes, x["real"], x["meta"]])
            con.execute("INSERT INTO consolidado_cargas (archivo, corte, detalle) VALUES (%s, %s, %s)",
                        (a.archivo.name, corte.date() if corte else None, f"{len(d)} celdas · {len(canales)} canales"))
        n = con.execute("SELECT count(*) FROM consolidado_mensual").fetchone()[0]
    print(f"Cargado: {n} celdas canal-mes.")


if __name__ == "__main__":
    main()
