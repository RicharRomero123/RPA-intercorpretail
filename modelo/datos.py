"""Datos del modelo de pronóstico: se descargan UNA vez de Supabase a archivos locales (carpeta modelo/datos/) y todo el análisis
trabaja con esos archivos, sin volver a consultar la base. Para traer datos nuevos: `python datos.py` o cargar(actualizar=True).

Archivos que deja:
  ventas_diarias.parquet  venta y unidades por día, tienda y SKU. Reporte interno (origen «interno»); los días que el interno
                          aún no trae se completan con ContaNet tiendas (origen «contanet»: misma regla que la web, sin RAPPI ni VENTAS01).
  metas.parquet           real y meta por canal y mes (consolidado).
  descarga.json           cuándo se descargó y hasta qué fecha llega cada fuente.
"""
import json
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd

AQUI = Path(__file__).resolve().parent
CARPETA = AQUI / "datos"
sys.path.insert(0, str(AQUI.parent / "rpa"))  # conexion.py: lee la clave de la base del .env local


def descargar() -> dict:
    from conexion import conectar

    CARPETA.mkdir(exist_ok=True)
    with conectar() as con:
        def tabla(sql: str) -> pd.DataFrame:
            cur = con.execute(sql)
            return pd.DataFrame(cur.fetchall(), columns=[c.name for c in cur.description])

        interno = tabla("""select fecha, tienda, coalesce(sku, codigo) sku, sum(und)::float und, sum(venta)::float venta, 'interno' origen
                           from tiendas_venta group by 1, 2, 3""")
        hasta_interno = interno.fecha.max()
        contanet = tabla(f"""select fecha, tienda, coalesce(sku, codigo) sku, sum(und)::float und, sum(total)::float venta, 'contanet' origen
                             from contanet_venta where en_canal('tiendas', usuario, medio_pago) and fecha > '{hasta_interno}'
                             group by 1, 2, 3""")
        metas = tabla("select anio, mes, canal, real::float, meta::float from consolidado_mensual")
    ventas = pd.concat([interno, contanet], ignore_index=True)
    ventas["fecha"] = pd.to_datetime(ventas.fecha)
    ventas.to_parquet(CARPETA / "ventas_diarias.parquet", index=False)
    metas.to_parquet(CARPETA / "metas.parquet", index=False)
    info = {"descargado": datetime.now().isoformat(timespec="seconds"), "hasta_interno": str(hasta_interno),
            "hasta_contanet": str(contanet.fecha.max()) if len(contanet) else None,
            "filas": len(ventas), "venta_interno": round(float(interno.venta.sum()), 2)}
    (CARPETA / "descarga.json").write_text(json.dumps(info, indent=2), encoding="utf-8")
    return info


def cargar(actualizar: bool = False) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    """(ventas, metas, info) desde los archivos locales; solo consulta la base si no existen o si actualizar=True."""
    if actualizar or not (CARPETA / "ventas_diarias.parquet").exists():
        descargar()
    info = json.loads((CARPETA / "descarga.json").read_text(encoding="utf-8"))
    return pd.read_parquet(CARPETA / "ventas_diarias.parquet"), pd.read_parquet(CARPETA / "metas.parquet"), info


if __name__ == "__main__":
    print(descargar())
