"""Crea (o actualiza) las tablas, vistas y reglas de acceso en Supabase ejecutando supabase/001_retail.sql.
El script es repetible: se puede correr varias veces sin borrar datos.

Uso:
    python crear_esquema.py
"""
from pathlib import Path

import psycopg

import api_intercorp as api
from retail_diario import url_base

SQL = Path(__file__).resolve().parent.parent / "supabase" / "001_retail.sql"

with psycopg.connect(url_base(api.leer_env()), autocommit=True) as con:
    con.execute(SQL.read_text(encoding="utf-8"))
    tablas = [r[0] for r in con.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1")]
    rls = [r[0] for r in con.execute(
        "SELECT relname FROM pg_class WHERE relrowsecurity AND relnamespace = 'public'::regnamespace ORDER BY 1")]
    usuarios = con.execute("SELECT count(*) FROM auth.users").fetchone()[0]
print("Tablas y vistas:", ", ".join(tablas))
print("Con reglas de acceso (solo usuarios con sesión):", ", ".join(rls))
print("Usuarios creados en Authentication:", usuarios)
