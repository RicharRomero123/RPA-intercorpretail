"""Conexión a la base (Supabase) para los robots que corren en la PC, como el de ContaNet.

Lee la configuración del archivo .env de esta carpeta (o de variables de entorno, que tienen prioridad):
    SUPABASE_DB_PASSWORD   contraseña de la base tal cual (sin codificar)  — o bien —
    DATABASE_URL           dirección completa de la base
    SUPABASE_PROJECT_REF, SUPABASE_POOLER_HOST   opcionales
"""
from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import quote

CARPETA = Path(__file__).resolve().parent


def leer_env() -> dict[str, str]:
    cfg: dict[str, str] = {}
    ruta = CARPETA / ".env"
    if ruta.exists():
        for linea in ruta.read_text(encoding="utf-8").splitlines():
            linea = linea.strip()
            if linea and not linea.startswith("#") and "=" in linea:
                k, v = linea.split("=", 1)
                cfg[k.strip()] = v.strip()
    cfg.update({k: v for k, v in os.environ.items() if k.startswith(("SUPABASE_", "DATABASE_URL", "CONTANET_")) and v})
    return cfg


def url_base(cfg: dict[str, str]) -> str:
    """Con SUPABASE_DB_PASSWORD se arma la dirección del pooler de Supabase; si no, se usa DATABASE_URL."""
    if cfg.get("SUPABASE_DB_PASSWORD"):
        ref = cfg.get("SUPABASE_PROJECT_REF") or "eyqeitzesywaukvfllyc"
        host = cfg.get("SUPABASE_POOLER_HOST") or "aws-0-us-east-1.pooler.supabase.com"
        return f"postgresql://postgres.{ref}:{quote(cfg['SUPABASE_DB_PASSWORD'].strip(), safe='')}@{host}:5432/postgres"
    url = (cfg.get("DATABASE_URL") or "").strip()
    if not url:
        raise RuntimeError(f"Falta la conexión a la base: pon SUPABASE_DB_PASSWORD (o DATABASE_URL) en {CARPETA / '.env'}.")
    return url


def conectar():
    import psycopg
    return psycopg.connect(url_base(leer_env()))
