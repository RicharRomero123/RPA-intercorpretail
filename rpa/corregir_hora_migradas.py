"""Corrección única: las cargas pasadas desde la PC ("[migrado desde la PC]") se guardaron con la hora de Lima
tomada como UTC, así que aparecen 5 horas antes. Se les suma 5 horas. Es repetible: solo toca las que aún no
se corrigieron (se marca el detalle con "[hora corregida]")."""
import psycopg

import api_intercorp as api
from retail_diario import url_base

with psycopg.connect(url_base(api.leer_env())) as con:
    n = con.execute(
        "UPDATE cargas SET cuando = cuando + interval '5 hours', detalle = detalle || ' [hora corregida]' "
        "WHERE detalle LIKE '%migrado desde la PC%' AND detalle NOT LIKE '%hora corregida%'").rowcount
    con.commit()
    print("Cargas corregidas:", n)
    print("Ejemplo:", con.execute("SELECT cuando AT TIME ZONE 'America/Lima', fecha, nivel FROM cargas "
                                  "WHERE detalle LIKE '%hora corregida%' ORDER BY id DESC LIMIT 1").fetchone())
