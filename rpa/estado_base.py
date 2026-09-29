"""Resumen rápido del estado de la base en Supabase: usuarios, último día cargado y últimas cargas.

Uso:
    python estado_base.py
"""
import psycopg

import api_intercorp as api
from retail_diario import url_base

with psycopg.connect(url_base(api.leer_env())) as con:
    print("Usuarios que pueden entrar a la página:", con.execute("SELECT count(*) FROM auth.users").fetchone()[0])
    print("Último día cargado:", con.execute("SELECT max(fecha) FROM venta_producto_dia").fetchone()[0])
    print("Inventario al:", con.execute("SELECT max(fecha_inv) FROM inventario_local").fetchone()[0])
    print("Últimas cargas:")
    for cuando, fecha, nivel, estado, und, venta in con.execute(
            "SELECT cuando, fecha, nivel, estado, und, venta FROM cargas ORDER BY id DESC LIMIT 6"):
        print(f"  {cuando:%Y-%m-%d %H:%M} | día {fecha} | {nivel:8s} | {estado:9s} | {und or 0:,.0f} und | S/ {venta or 0:,.2f}")
