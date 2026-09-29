"""Carga diaria de la venta retail de Supermercados Peruanos (portal B2B de Intercorp) a la base de datos.

SPSA publica una vez al día la venta del día anterior. Este programa:
  1. Entra al portal por API (api_intercorp.py) con usuario y clave (.env o variables de entorno).
  2. Mira cuál es el último día publicado y carga, día por día, los que faltan en la base.
  3. De cada día guarda la venta por producto y, si el día está dentro de los últimos 45 días (límite del
     portal), el detalle por local. El detalle debe cuadrar al céntimo con el TOTAL del portal; si no
     cuadra, ese día no se guarda y queda anotado en la tabla "cargas".
  4. Guarda el inventario por local con la fecha que indica el portal ("inventario al ...").

Base: si hay DATABASE_URL (Supabase / PostgreSQL) escribe ahí; si no, en datos/retail_spsa.db (SQLite) para
probar en la PC.

Uso:
    python retail_diario.py                    # carga los días que faltan (hasta el último publicado)
    python retail_diario.py --desde 2026-08-15 --hasta 2026-09-05
    python retail_diario.py --avisar-si-falta  # termina con error (código 3) si ayer aún no está publicado
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit
from zoneinfo import ZoneInfo

import pandas as pd

import api_intercorp as api

CARPETA = Path(__file__).resolve().parent
CLIENTE = "SPSA"
DIAS_DETALLE = 45  # el portal solo entrega el detalle Producto-Local de los últimos 45 días
ZONAS = CARPETA / "zonas_locales.csv"
LIMA = ZoneInfo("America/Lima")


def log(mensaje: str) -> None:
    print(f"{datetime.now(LIMA):%Y-%m-%d %H:%M:%S}  {mensaje}", flush=True)


api.log = log


# ----------------------------------------------------------------------------- base de datos
def url_base(cfg: dict) -> str | None:
    """Dirección de la base. Con SUPABASE_DB_PASSWORD (la contraseña tal cual, sin codificar) se arma sola con el
    usuario y el servidor del pooler de Supabase; si no, se usa DATABASE_URL completa."""
    if cfg.get("SUPABASE_DB_PASSWORD"):
        ref = cfg.get("SUPABASE_PROJECT_REF") or "eyqeitzesywaukvfllyc"
        host = cfg.get("SUPABASE_POOLER_HOST") or "aws-0-us-east-1.pooler.supabase.com"
        return f"postgresql://postgres.{ref}:{quote(cfg['SUPABASE_DB_PASSWORD'].strip(), safe='')}@{host}:5432/postgres"
    return (cfg.get("DATABASE_URL") or "").strip() or None


class Base:
    """Conexión a PostgreSQL (Supabase) o, sin dirección, a un SQLite local. Las consultas se escriben con
    %s y la misma sintaxis de 'upsert' (ON CONFLICT), que ambos aceptan."""

    def __init__(self, url: str | None):
        self.pg = bool(url)
        if self.pg:
            import psycopg
            p = urlsplit(url)
            log(f"Base: PostgreSQL | usuario {p.username} | servidor {p.hostname}:{p.port} | "
                f"contraseña de {len(unquote(p.password or ''))} caracteres")
            self.con = psycopg.connect(url, autocommit=False)
            log("Base: conectada a Supabase")
        else:
            ruta = CARPETA / "datos" / "retail_spsa.db"
            ruta.parent.mkdir(exist_ok=True)
            self.con = sqlite3.connect(ruta)
            self.con.executescript((CARPETA.parent / "supabase" / "001_retail.sql").read_text(encoding="utf-8")
                                   .split("-- Vista que usa el front")[0]
                                   .replace("bigserial primary key", "integer primary key autoincrement")
                                   .replace("timestamptz not null default now()", "text")
                                   .replace("numeric(14,2)", "real"))
            log(f"Base: SQLite local ({ruta})")

    def _sql(self, sql: str) -> str:
        return sql if self.pg else sql.replace("%s", "?")

    def uno(self, sql: str, params=()):
        cur = self.con.cursor()
        cur.execute(self._sql(sql), params)
        return cur.fetchone()

    def ejecutar(self, sql: str, params=()) -> None:
        self.con.cursor().execute(self._sql(sql), params)

    def varios(self, sql: str, filas) -> None:
        filas = list(filas)
        if filas:
            self.con.cursor().executemany(self._sql(sql), filas)

    def confirmar(self) -> None:
        self.con.commit()

    def deshacer(self) -> None:
        self.con.rollback()


def anotar(bd: Base, fecha: date, nivel: str, estado: str, filas: int = 0, und: float = 0, venta: float = 0,
           detalle: str = "") -> None:
    bd.ejecutar("INSERT INTO cargas (cuando, cliente, fecha, nivel, estado, filas, und, venta, detalle) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (datetime.now(LIMA).isoformat(timespec="seconds"), CLIENTE, fecha.isoformat(), nivel, estado, filas,
                 und, venta, detalle))


# ----------------------------------------------------------------------------- maestros
def cadena(local: str) -> str:
    """Cadena según el nombre del local del portal. Los locales con sufijo 'MK' se agrupan en Makro."""
    if local.startswith("PVO-"):
        return "Plaza Vea (PVO)"
    if "VIVANDA" in local:
        return "Vivanda"
    if local.startswith("MAKRO") or local.endswith("-MK"):
        return "Makro"
    if "EMAX" in local:
        return "Economax"
    return "Plaza Vea"


def nombre_local(local: str) -> str:
    for p in ("SPSA-", "PVO-"):
        local = local.removeprefix(p)
    return local.replace("-–-", " ").replace("-", " ").title().replace("Pvea", "Plaza Vea").replace(" Mk", " (MK)")


def nombre_producto(desc: str) -> str:
    return {"CALDERON-TURRON-CJX500GR": "Turrón caja 500 g",
            "CALDERON-TURRON-CJX950GR": "Turrón caja 950 g"}.get(desc, desc.title())


ZONA = (pd.read_csv(ZONAS, sep=";", encoding="utf-8-sig").set_index("cod_local")["zona"].to_dict()
        if ZONAS.exists() else {})


def guardar_maestros(bd: Base, df: pd.DataFrame) -> None:
    # La zona solo se escribe al crear el local, para no pisar correcciones hechas a mano en la base.
    bd.varios("INSERT INTO productos (cliente, sku, producto, nombre, marca, umb, estado) VALUES (%s,%s,%s,%s,%s,%s,%s) "
              "ON CONFLICT (cliente, sku) DO UPDATE SET producto = excluded.producto, marca = excluded.marca, "
              "umb = excluded.umb, estado = excluded.estado",
              [(CLIENTE, r.sku, r.producto, nombre_producto(r.producto), r.marca, r.umb, r.estado_prod)
               for r in df.drop_duplicates("sku").itertuples()])
    bd.varios("INSERT INTO locales (cliente, cod_local, local, nombre, cadena, zona, formato, tipo, estado) "
              "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) "
              "ON CONFLICT (cliente, cod_local) DO UPDATE SET local = excluded.local, nombre = excluded.nombre, "
              "cadena = excluded.cadena, formato = excluded.formato, tipo = excluded.tipo, estado = excluded.estado",
              [(CLIENTE, int(r.cod_local), r.local, nombre_local(r.local), cadena(r.local),
                ZONA.get(int(r.cod_local), "Por confirmar"), r.formato, r.tipo, r.estado_local)
               for r in df.drop_duplicates("cod_local").itertuples()])


# ----------------------------------------------------------------------------- carga de un día
def leer_detalle(ruta: Path) -> pd.DataFrame:
    df = pd.read_csv(ruta, encoding="cp1252", dtype={"COD_SPSA": str})
    df.columns = ["periodo", "sku", "cod_prov", "producto", "marca", "estado_prod", "umb", "cod_local", "cod_local_prov",
                  "local", "estado_local", "formato", "tipo", "und", "venta", "costo", "inv_und", "inv_costo"]
    return df


def cuadra(a: float, b: float) -> bool:
    return abs(round(a, 2) - round(b, 2)) < 0.005


def cargar_dia(bd: Base, ventas: api.PantallaVentas, dia: date, con_detalle: bool, fecha_inv: date | None) -> None:
    t0 = time.perf_counter()
    r = ventas.generar(dia, dia)
    tot = r["total"]
    f = dia.isoformat()
    # 1) Venta por producto (tabla del portal): se reemplaza el día completo, en una sola transacción.
    try:
        bd.ejecutar("DELETE FROM venta_producto_dia WHERE cliente = %s AND fecha = %s", (CLIENTE, f))
        bd.varios("INSERT INTO venta_producto_dia (cliente, fecha, sku, und, venta, costo) VALUES (%s,%s,%s,%s,%s,%s)",
                  [(CLIENTE, f, p["sku"], p["und"], p["venta"], p["costo"]) for p in r["productos"]])
        anotar(bd, dia, "producto", "ok", len(r["productos"]), tot["und"], tot["venta"])
        bd.confirmar()
    except Exception:
        bd.deshacer()
        raise
    resumen = f"{dia:%d-%m-%Y}: {tot['und']:,.0f} und | S/ {tot['venta']:,.2f}"
    if not con_detalle:
        log(f"{resumen} | solo por producto ({time.perf_counter() - t0:.1f} s)")
        return
    if tot["und"] == 0 and tot["venta"] == 0 and tot["inv_und"] == 0:
        log(f"{resumen} | sin movimiento, no hay detalle")
        return
    # 2) Detalle por local: debe cuadrar con el TOTAL del portal antes de guardarse.
    csv = ventas.descargar_detalle(CARPETA / "descargas" / f"{dia:%Y%m%d}")
    df = leer_detalle(csv)
    sumas = {k: float(df[k].sum()) for k in ("und", "venta", "costo", "inv_und", "inv_costo")}
    difs = [f"{k}: detalle {sumas[k]:,.2f} vs portal {tot[k]:,.2f}" for k in sumas if not cuadra(sumas[k], tot[k])]
    if difs:
        anotar(bd, dia, "local", "no cuadra", len(df), sumas["und"], sumas["venta"], "; ".join(difs))
        bd.confirmar()
        log(f"{resumen} | DETALLE NO CUADRA, no se guarda: {'; '.join(difs)}")
        return
    try:
        guardar_maestros(bd, df)
        bd.ejecutar("DELETE FROM venta_local_dia WHERE cliente = %s AND fecha = %s", (CLIENTE, f))
        bd.varios("INSERT INTO venta_local_dia (cliente, fecha, sku, cod_local, und, venta, costo) "
                  "VALUES (%s,%s,%s,%s,%s,%s,%s)",
                  [(CLIENTE, f, r.sku, int(r.cod_local), r.und, r.venta, r.costo) for r in df.itertuples()])
        # El inventario del detalle es siempre el más reciente del portal (no el de ese día): una foto por fecha.
        if fecha_inv:
            fi = fecha_inv.isoformat()
            bd.ejecutar("DELETE FROM inventario_local WHERE cliente = %s AND fecha_inv = %s", (CLIENTE, fi))
            bd.varios("INSERT INTO inventario_local (cliente, fecha_inv, sku, cod_local, inv_und, inv_costo) "
                      "VALUES (%s,%s,%s,%s,%s,%s)",
                      [(CLIENTE, fi, r.sku, int(r.cod_local), r.inv_und, r.inv_costo) for r in df.itertuples()])
        anotar(bd, dia, "local", "ok", len(df), sumas["und"], sumas["venta"])
        bd.confirmar()
    except Exception:
        bd.deshacer()
        raise
    log(f"{resumen} | {len(df)} filas por local, cuadra al céntimo ({time.perf_counter() - t0:.1f} s)")


# ----------------------------------------------------------------------------- ejecución
def ultimo_cargado(bd: Base) -> date | None:
    fila = bd.uno("SELECT MAX(fecha) FROM venta_producto_dia WHERE cliente = %s", (CLIENTE,))
    if not fila or not fila[0]:
        return None
    return fila[0] if isinstance(fila[0], date) else date.fromisoformat(str(fila[0])[:10])


def ejecutar(desde: date | None, hasta: date | None) -> int:
    cfg = api.leer_env()
    bd = Base(url_base(cfg))
    t0 = time.perf_counter()
    try:
        portal = api.ingresar(cfg)
    except api.IngresoRechazado as e:
        log(f"ERROR: {e}. No se reintenta para no bloquear el usuario: revisa usuario y clave.")
        return 2
    ventas = api.PantallaVentas(portal, cfg.get("MARCA") or "CALDERON")
    ultima, fecha_inv = ventas.ultima_fecha(), ventas.fecha_inventario()
    inicio_detalle = ultima - timedelta(days=DIAS_DETALLE - 1)
    log(f"Portal: último día publicado {ultima:%d-%m-%Y}"
        + (f" | inventario al {fecha_inv:%d-%m-%Y}" if fecha_inv else ""))
    if desde is None:
        previo = ultimo_cargado(bd)
        desde = previo + timedelta(days=1) if previo else inicio_detalle
    hasta = min(hasta or ultima, ultima)
    if desde > hasta:
        log(f"Nada que cargar: la base ya tiene hasta el {hasta:%d-%m-%Y}")
        return 0
    dias = [desde + timedelta(days=i) for i in range((hasta - desde).days + 1)]
    log(f"Se cargarán {len(dias)} días: {desde:%d-%m-%Y} al {hasta:%d-%m-%Y}")
    errores = 0
    for dia in dias:
        try:
            cargar_dia(bd, ventas, dia, con_detalle=dia >= inicio_detalle, fecha_inv=fecha_inv)
            errores = 0
        except Exception as e:  # un día con problema no detiene los demás
            errores += 1
            anotar(bd, dia, "producto", "error", detalle=f"{type(e).__name__}: {e}")
            bd.confirmar()
            log(f"{dia:%d-%m-%Y}: ERROR {type(e).__name__}: {e}")
            if errores >= 3:
                log("3 errores seguidos: se detiene la carga")
                return 1
            portal = api.ingresar(cfg)  # la pantalla pudo quedar en mal estado: se vuelve a entrar
            ventas = api.PantallaVentas(portal, cfg.get("MARCA") or "CALDERON")
    log(f"Fin en {time.perf_counter() - t0:.0f} s")
    return 0


def main() -> None:
    ap = argparse.ArgumentParser(description="Carga diaria de venta retail SPSA a la base de datos.")
    ap.add_argument("--desde", type=date.fromisoformat, help="AAAA-MM-DD (por defecto: el día siguiente al último cargado)")
    ap.add_argument("--hasta", type=date.fromisoformat, help="AAAA-MM-DD (por defecto: el último día publicado)")
    ap.add_argument("--avisar-si-falta", action="store_true",
                    help="termina con código 3 si, al final, la base no tiene el día de ayer (SPSA aún no lo publica)")
    a = ap.parse_args()
    codigo = ejecutar(a.desde, a.hasta)
    if codigo == 0 and a.avisar_si_falta:
        ayer = datetime.now(LIMA).date() - timedelta(days=1)
        cfg = api.leer_env()
        ultimo = ultimo_cargado(Base(url_base(cfg)))
        if not ultimo or ultimo < ayer:
            log(f"AVISO: SPSA aún no publica el {ayer:%d-%m-%Y} (la base llega hasta el {ultimo}).")
            codigo = 3
    sys.exit(codigo)


if __name__ == "__main__":
    main()
