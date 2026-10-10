"""Robot ContaNet: descarga el «Reporte de ventas por producto» (Detallado) desde la aplicación de escritorio ContaNet ERP
y lo carga a la base con las mismas reglas que Configuración -> Cargar datos de la web.

Corre en la PC donde está instalado ContaNet (no en GitHub Actions: necesita la aplicación y una sesión de Windows con
pantalla). Se programa con el Programador de tareas de Windows («ejecutar solo cuando el usuario haya iniciado sesión»).

Pasos:
  1. Usa la ventana de ContaNet abierta (o la abre) y entra a Ventas -> Reporte de ventas por producto.
  2. Rango: del 1 del mes hasta ayer (el día 1 baja el mes anterior completo). Detallado · Soles · Con IGV · filtros en
     Todos · salida Excel. Pulsa Reportar y guarda el archivo en ReporteContanet\\.
  3. Lee el archivo y lo valida: «REPORTE DETALLADO», filtros en TODOS, SOLES, y que cuadre al céntimo con TOTAL GENERAL.
  4. Lo carga: reemplaza ese rango de fechas en contanet_venta con respaldo (se puede deshacer en la web) y verifica.

Uso:
    python contanet_robot.py                          # descarga y carga (lo normal, lo que corre la tarea programada)
    python contanet_robot.py --desde 2026-09-01 --hasta 2026-09-29
    python contanet_robot.py --archivo "…\\reporte.xls"  # solo carga un archivo ya descargado
    python contanet_robot.py --archivo "…" --prueba      # lee, valida y carga dentro de una transacción que se deshace
    python contanet_robot.py --explorar                # solo deja el reporte listo y anota qué ventanas aparecen al reportar
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
import time
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd

AQUI = Path(__file__).resolve().parent
CARPETA = Path(r"C:\Users\USER\Documents\RPA-proyect\ReporteContanet")
EXE = Path(r"C:\CONTANET\Ejecutable ContaNet ERP 3.0.7.94 - SFC_ALIMENTOS_LOCAL\ContaNet.Aplicacion.exe")
CONTAFILES = EXE.parent / "Desktop" / "ContaFiles"   # donde ContaNet guarda solo los reportes en Excel
SISTEMA = "00000000-0000-0000-0000-00000000c0a7"   # usuario técnico del robot en el registro de cargas
CORREO = "Robot ContaNet"

log = logging.getLogger("contanet")


# ============================================================================ lectura y validación del reporte
COLUMNAS = {
    "Fecha": "fecha", "Tipo-Serie-Núm. C.": "comprobante", "RUC o DNI": "doc_cliente", "Cliente": "cliente",
    "Código Comercial": "codigo", "Modelo": "producto", "Und. Vendidas": "und", "P. Unit": "precio_unit",
    "Precio Total": "total", "Cond. Pago": "cond_pago", "Usuario": "usuario", "Cód. Vendedor": "vendedor",
}
USUARIOS = {"ABANC01": "Abancay", "GRANDA01": "Jose Granda", "PANA01": "Pana Norte", "SOL01": "Sol de Oro", "SURCO01": "Surco",
            "TIENDATR01": "Trinidad", "TUPAC01": "Tupac", "VENTAS01": "Canal digital"}
COMPROBANTES = {"BOL": "Boleta", "FAC": "Factura", "NOC": "Nota de crédito", "NOD": "Nota de débito", "OTR": "Nota de venta"}
FILTROS_TODOS = ("Marca:", "Línea:", "Modelo:", "Cliente:", "Vendedor:")


class ErrorReporte(Exception):
    pass


class SinVentas(Exception):
    """ContaNet no tiene ventas en el rango (p. ej. «hoy» muy temprano): no es un error."""


def _texto(v) -> str:
    return "" if v is None or (isinstance(v, float) and pd.isna(v)) else " ".join(str(v).split())


def _medio(cond: str) -> str:
    if cond.startswith("TRANSFERENCIA"):
        return "Transferencia"
    return {"VISA": "Tarjeta", "CONTADO": "Contado"}.get(cond, cond.title())


def leer_reporte(ruta: Path, equivalencias: dict[str, str]) -> dict:
    """Lee el Reporte detallado (.xls o .xlsx) con las mismas reglas que la web (web/src/lib/cargas.ts)."""
    crudo = pd.read_excel(ruta, header=None, dtype=object)
    if not crudo.head(10).isin(["REPORTE DETALLADO"]).any().any():
        raise ErrorReporte("No es un «Reporte detallado» de ContaNet.")
    primera = crudo[0].map(_texto)
    titulos_idx = primera.index[primera.eq("Fecha")]
    if not len(titulos_idx):
        if len(crudo) < 20:  # solo la cabecera: ContaNet no tiene ventas en ese rango (p. ej. temprano en la mañana)
            raise SinVentas("el reporte vino vacío (todavía no hay ventas registradas)")
        raise ErrorReporte("No se encontró la fila de títulos.")
    it = titulos_idx[0]
    cabecera = crudo.iloc[:it]
    fechas = sorted(v for v in cabecera.to_numpy().ravel() if isinstance(v, datetime))
    if len(fechas) < 2:
        raise ErrorReporte("No se encontró el rango de fechas en la cabecera.")
    desde, hasta = fechas[0].date(), fechas[-1].date()
    filtros = {}
    for _, fila in cabecera.iterrows():
        vals = [v for v in fila if _texto(v)]
        for a, b in zip(vals, vals[1:]):
            # Si al rótulo le sigue otro rótulo («Marca:» «Cliente:»), el filtro está en blanco: no se toma el rótulo como valor.
            if isinstance(a, str) and a.strip().endswith(":") and not _texto(b).endswith(":"):
                filtros[a.strip()] = _texto(b)
    aplicados = {k: v for k, v in filtros.items() if k in FILTROS_TODOS and v.upper() != "TODOS"}
    if aplicados:
        raise ErrorReporte(f"El reporte tiene filtros aplicados: {aplicados}.")
    if filtros.get("Moneda:", "SOLES").upper() != "SOLES":
        raise ErrorReporte(f"El reporte está en {filtros['Moneda:']}, no en SOLES.")
    pos = {}
    for i, t in crudo.iloc[it].items():
        if _texto(t) and _texto(t) not in pos:
            pos[_texto(t)] = i
    faltan = [c for c in COLUMNAS if c not in pos]
    if faltan:
        raise ErrorReporte(f"Faltan columnas: {faltan}")

    cuerpo = crudo.iloc[it + 1:]
    es_linea = cuerpo[0].map(lambda v: isinstance(v, datetime))
    total_und = total_venta = None
    for _, fila in cuerpo[~es_linea].iterrows():
        marca = [i for i, v in enumerate(fila) if _texto(v).upper() == "TOTAL GENERAL:"]
        if marca:
            nums = [v for v in list(fila)[marca[0] + 1:] if isinstance(v, (int, float)) and not pd.isna(v)]
            if len(nums) >= 2:
                total_und, total_venta = float(nums[0]), float(nums[1])
            break

    filas = []
    for _, f in cuerpo[es_linea].iterrows():
        g = lambda c: f[pos[c]]
        fh = pd.Timestamp(g("Fecha")).round("s").to_pydatetime()
        comp = _texto(g("Tipo-Serie-Núm. C."))
        tipo, serie, num = (comp.split("/") + ["", "", ""])[:3]
        und, precio, total = float(g("Und. Vendidas") or 0), float(g("P. Unit") or 0), float(g("Precio Total") or 0)
        if tipo == "NOC":
            und, precio, total = -abs(und), abs(precio), -abs(total)
        doc = _texto(g("RUC o DNI")).removesuffix(".0")
        if len(doc) == 7 and doc.isdigit():
            doc = "0" + doc
        cli = _texto(g("Cliente")).upper()
        anon = doc in ("", "0") or cli == "VARIOS"
        codigo = _texto(g("Código Comercial")).upper()
        cond = _texto(g("Cond. Pago")).upper()
        usuario = _texto(g("Usuario"))
        filas.append({
            "fecha": fh.date().isoformat(), "fecha_hora": fh.strftime("%Y-%m-%dT%H:%M:%S"), "comprobante": comp,
            "tipo_comprobante": COMPROBANTES.get(tipo, tipo), "serie": serie, "numero": num,
            "doc_cliente": "" if anon else doc, "tipo_doc_cliente": "" if anon else {8: "DNI", 11: "RUC"}.get(len(doc), ""),
            "cliente": "PÚBLICO GENERAL" if anon else cli, "codigo": codigo, "sku": equivalencias.get(codigo, codigo),
            "producto": _texto(g("Modelo")), "und": round(und, 3), "precio_unit": round(precio, 4), "total": round(total, 4),
            "cond_pago": cond, "medio_pago": _medio(cond), "usuario": usuario, "tienda": USUARIOS.get(usuario, usuario),
            "vendedor": _texto(g("Cód. Vendedor")),
        })
    if not filas:
        raise SinVentas("El reporte no tiene líneas de venta.")
    venta = round(sum(f["total"] for f in filas), 4)
    und_neta = round(sum(f["und"] for f in filas), 3)
    und_abs = round(sum(abs(f["und"]) for f in filas), 3)
    if total_venta is None:
        raise ErrorReporte("El reporte no trae la fila TOTAL GENERAL para verificar.")
    if abs(venta - total_venta) > 0.01 or abs(und_abs - total_und) > 0.001:
        raise ErrorReporte(f"NO cuadra con TOTAL GENERAL: leído S/ {venta:,.3f} y {und_abs:,.0f} und; el reporte dice "
                           f"S/ {total_venta:,.3f} y {total_und:,.0f} und.")
    fuera = sum(1 for f in filas if not desde.isoformat() <= f["fecha"] <= hasta.isoformat())
    if fuera:
        raise ErrorReporte(f"{fuera} líneas con fecha fuera del rango de la cabecera.")
    return {"desde": desde, "hasta": hasta, "filas": filas, "und": und_neta, "venta": venta, "total_general": total_venta}


# ============================================================================ carga a la base
def cargar(ruta: Path, prueba: bool = False, rango: tuple[date, date] | None = None) -> dict:
    from psycopg.types.json import Jsonb

    from conexion import conectar

    with conectar() as con:
        eq = dict(con.execute("select codigo, sku from sku_equivalencia where sistema = 'ContaNet'").fetchall())
        r = leer_reporte(ruta, eq)
        if rango and (r["desde"], r["hasta"]) != rango:
            raise ErrorReporte(f"El reporte trae del {r['desde']:%d/%m/%Y} al {r['hasta']:%d/%m/%Y}, pero se pidió del {rango[0]:%d/%m/%Y} al "
                               f"{rango[1]:%d/%m/%Y} (ContaNet entendió mal la fecha). No se cargó nada.")
        log.info(f"Leído {ruta.name}: {r['desde']} a {r['hasta']} · {len(r['filas']):,} líneas · S/ {r['venta']:,.2f} · cuadra con TOTAL GENERAL")
        with con.transaction(force_rollback=prueba):
            # Mismo camino que la web: carga preparada -> filas -> confirmar_carga (reemplaza el rango con respaldo y verifica).
            con.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps({"sub": SISTEMA, "role": "authenticated"}),))
            con.execute("set local role authenticated")
            cid = con.execute(
                "insert into cargas_web (tipo, archivo, desde, hasta, rangos, filas, und, venta, correo) "
                "values ('contanet', %s, %s, %s, %s, %s, %s, %s, %s) returning id",
                (ruta.name, r["desde"], r["hasta"], Jsonb([{"tienda": None, "desde": str(r["desde"]), "hasta": str(r["hasta"])}]),
                 len(r["filas"]), r["und"], r["venta"], CORREO)).fetchone()[0]
            for i in range(0, len(r["filas"]), 2000):
                con.execute("insert into cargas_web_filas (carga, parte, filas) values (%s, %s, %s)", (cid, i // 2000, Jsonb(r["filas"][i:i + 2000])))
            res = con.execute("select confirmar_carga(%s)", (cid,)).fetchone()[0]
        log.info(f"{'PRUEBA (deshecha): ' if prueba else ''}Cargado y verificado: {res['filas']:,} filas · S/ {float(res['venta']):,.2f} · "
                 f"reemplazó {res['reemplazo_filas']:,} filas (S/ {float(res['reemplazo_venta']):,.2f})")
        return res


# ============================================================================ descarga desde la aplicación
def rango_por_defecto(hoy: date) -> tuple[date, date]:
    """Del 1 del mes hasta ayer; el día 1 baja el mes anterior completo."""
    ayer = hoy - timedelta(days=1)
    return ayer.replace(day=1), ayer


def restaurar(auto, w):
    """Si ContaNet está minimizado, Windows no expone sus botones (solo la barra de título): se restaura y se trae al frente."""
    import ctypes
    handle = w.NativeWindowHandle
    if ctypes.windll.user32.IsIconic(handle):
        log.info("ContaNet estaba minimizado: lo restauro")
        ctypes.windll.user32.ShowWindow(handle, 9)  # SW_RESTORE
        time.sleep(1.5)
    auto.SwitchToThisWindow(handle)
    time.sleep(0.5)
    return w


def ventana_principal(auto, esperar: int = 90):
    w = auto.WindowControl(searchDepth=1, SubName="ContaNet ERP")
    if w.Exists(2):
        return restaurar(auto, w)
    log.info(f"ContaNet no está abierto: lo abro ({EXE})")
    import subprocess
    subprocess.Popen([str(EXE)], cwd=str(EXE.parent))
    if not w.Exists(esperar):
        raise RuntimeError("ContaNet no abrió la ventana principal (¿pide usuario y clave? hay que configurar el inicio de sesión).")
    return w


def _nodos_menu(auto, w) -> list:
    """Filas visibles del menú (UIA solo expone las que se ven): (texto, acción por defecto, control)."""
    out = []
    for c, _ in auto.WalkControl(w, maxDepth=14):
        if c.ControlTypeName == "TreeItemControl":
            try:
                lg = c.GetLegacyIAccessiblePattern()
                out.append((lg.Value.strip(), lg.DefaultAction, c))
            except Exception:
                pass
    return out


def buscar_en_menu(auto, w, texto: str):
    """Busca una opción del menú. Si ContaNet se abrió de cero (carpetas cerradas) o una carpeta abierta tapa a las demás
    (el árbol solo expone las filas visibles), cierra las carpetas abiertas y las abre una por una hasta encontrarla.
    Las carpetas no tienen ExpandCollapse: se usa la acción por defecto («Expandir»/«Contraer»)."""
    def hallar():
        return next((c for v, _, c in _nodos_menu(auto, w) if v == texto), None)

    def accion(nombre: str, que: str):
        c = next((c for v, a, c in _nodos_menu(auto, w) if v == nombre and a == que), None)
        if c is not None:
            c.GetLegacyIAccessiblePattern().DoDefaultAction()
            time.sleep(0.6)

    if (n := hallar()) is not None:
        return n
    log.info(f"No veo «{texto}» en el menú: cierro las carpetas abiertas y lo busco carpeta por carpeta")
    for v, a, _ in _nodos_menu(auto, w):
        if a == "Contraer":
            accion(v, "Contraer")
    if (n := hallar()) is not None:
        return n
    for v in [v for v, a, _ in _nodos_menu(auto, w) if a == "Expandir"]:
        accion(v, "Expandir")
        if (n := hallar()) is not None:
            return n
        accion(v, "Contraer")
    return None


def abrir_reporte(auto, w):
    rep = w.WindowControl(AutomationId="RptConsultaVentasProductoDetallado", searchDepth=6)
    if rep.Exists(2):
        return rep
    log.info("Abro Ventas -> Reporte de ventas por producto")
    w.ButtonControl(Name="VENTAS", searchDepth=8).GetInvokePattern().Invoke()
    time.sleep(1.5)
    nodo = buscar_en_menu(auto, w, "Reporte de ventas por producto")
    if nodo is None:
        raise RuntimeError("No encontré «Reporte de ventas por producto» en el menú de Ventas.")
    # Esta opción del menú solo se abre con doble clic: se trae ContaNet al frente y se confirma antes de hacer clic,
    # para no hacer clic nunca en otra aplicación. (Normalmente no hace falta: el robot deja el reporte abierto.)
    handle = w.NativeWindowHandle
    for _ in range(3):
        auto.SwitchToThisWindow(handle)
        auto.SetForegroundWindow(handle)
        time.sleep(1)
        if auto.GetForegroundWindow() == handle:
            break
    else:
        raise RuntimeError("No pude traer ContaNet al frente para abrir el reporte desde el menú; ábrelo una vez a mano y déjalo abierto.")
    nodo.GetSelectionItemPattern().Select()
    time.sleep(0.5)
    nodo.DoubleClick(simulateMove=False)
    if not rep.Exists(20):
        raise RuntimeError("No se abrió la ventana del reporte.")
    return rep


# Todo se hace con los «patrones» de automatización de Windows (marcar, elegir, escribir, pulsar) y no con el mouse:
# funciona aunque ContaNet esté detrás de otra ventana y nunca hace clic en otra aplicación por error.
def marcar(control, valor: bool):
    patron = control.GetTogglePattern()
    if (patron.ToggleState == 1) != valor:
        patron.Toggle()
        time.sleep(0.3)
    if (control.GetTogglePattern().ToggleState == 1) != valor:
        raise RuntimeError(f"No pude {'marcar' if valor else 'desmarcar'} «{control.Name or control.AutomationId}».")


def elegir(rep, nombre: str):
    rb = rep.RadioButtonControl(Name=nombre, searchDepth=12)
    if not rb.GetSelectionItemPattern().IsSelected:
        rb.GetSelectionItemPattern().Select()
        time.sleep(0.3)
    if not rb.GetSelectionItemPattern().IsSelected:
        # Algunos radios de ContaNet ignoran Select() cuando otro quedó marcado a mano (p. ej. «Dólares» en vez de «Soles», 09/10/2026):
        # su acción por defecto (LegacyIAccessible, «Doble clic») sí los marca, sin mover el mouse.
        rb.GetLegacyIAccessiblePattern().DoDefaultAction()
        time.sleep(0.5)
    if not rb.GetSelectionItemPattern().IsSelected:
        raise RuntimeError(f"No pude elegir «{nombre}».")


def _partes(texto: str) -> tuple[int, int, int] | None:
    import re
    m = re.match(r"^\s*(\d{1,2})/(\d{1,2})/(\d{4})", texto)
    return (int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else None


def poner_fecha(auto, rep, auto_id: str, f: date):
    combo = rep.ComboBoxControl(AutomationId=auto_id, searchDepth=12)
    edit = combo.EditControl(searchDepth=2)
    # 1) ¿El campo muestra día/mes o mes/día? Se escribe una fecha con día 13 (no se puede confundir) y se mira cómo la muestra.
    prueba = date(f.year, f.month, 13)
    formato = None
    for texto in (prueba.isoformat(), f"{prueba.day:02d}/{prueba.month:02d}/{prueba.year}", f"{prueba.month}/{prueba.day}/{prueba.year}"):
        edit.GetValuePattern().SetValue(texto)
        time.sleep(0.5)
        x = _partes(combo.Name)
        if x and x[0] == 13 and x[1] == prueba.month:
            formato = "dm"
            break
        if x and x[1] == 13 and x[0] == prueba.month:
            formato = "md"
            break
    if formato is None:
        raise RuntimeError(f"No pude saber el formato de fecha del campo {auto_id} (muestra «{combo.Name.strip()}»).")
    # 2) Se escribe la fecha pedida y se exige que el campo la muestre exactamente (día y mes en su lugar).
    quiere = (f.day, f.month, f.year) if formato == "dm" else (f.month, f.day, f.year)
    for texto in (f.isoformat(), f"{f.day:02d}/{f.month:02d}/{f.year}", f"{f.month}/{f.day}/{f.year}"):
        edit.GetValuePattern().SetValue(texto)
        time.sleep(0.5)
        if _partes(combo.Name) == quiere:
            return
    raise RuntimeError(f"La fecha {auto_id} quedó en «{combo.Name.strip()}» en vez de {f:%d/%m/%Y}.")


def preparar(auto, rep, desde: date, hasta: date):
    elegir(rep, "Opción 1")
    poner_fecha(auto, rep, "dteInicial", desde)
    poner_fecha(auto, rep, "dteFinal", hasta)
    elegir(rep, "Detallado")
    elegir(rep, "Soles")
    elegir(rep, "Con IGV")
    marcar(rep.CheckBoxControl(AutomationId="chkIbIncluirGratuitos", searchDepth=12), False)
    for cid in ("chkTodosArea", "chkVendedor", "chkTodosCliente", "chkTodosMarca", "chkTodosClase", "chkTodosProducto"):
        marcar(rep.CheckBoxControl(AutomationId=cid, searchDepth=12), True)
    marcar(rep.CheckBoxControl(AutomationId="chkTipoVisualizacion", searchDepth=12), False)
    marcar(rep.CheckBoxControl(AutomationId="chkTipoPDF", searchDepth=12), False)
    marcar(rep.CheckBoxControl(AutomationId="chkEnDemanda", searchDepth=12), False)
    marcar(rep.CheckBoxControl(AutomationId="chkTipoExcel", searchDepth=12), True)
    log.info(f"Reporte listo: {desde:%d/%m/%Y} – {hasta:%d/%m/%Y} · Detallado · Soles · Con IGV · Todos · Excel")


def ventanas_actuales(auto) -> dict:
    return {(c.NativeWindowHandle): (c.Name, c.ClassName) for c in auto.GetRootControl().GetChildren()}


def archivos_recientes(desde_ts: float) -> list[Path]:
    carpetas = [Path.home() / "Downloads", Path.home() / "Documents", Path.home() / "Desktop", CARPETA, Path.home() / "AppData" / "Local" / "Temp"]
    salida = []
    for c in carpetas:
        if c.exists():
            salida += [p for p in c.glob("*.xls*") if p.stat().st_mtime >= desde_ts]
    return sorted(salida, key=lambda p: p.stat().st_mtime)


def explorar(auto, rep):
    """Pulsa Reportar y anota durante 90 s qué ventanas aparecen y qué archivos Excel se crean (para terminar el robot)."""
    antes, t0 = ventanas_actuales(auto), time.time()
    rep.ButtonControl(AutomationId="btnAccion", searchDepth=8).GetInvokePattern().Invoke()
    vistos = set()
    while time.time() - t0 < 90:
        for h, (n, cls) in ventanas_actuales(auto).items():
            if h not in antes and h not in vistos:
                vistos.add(h)
                log.info(f"Ventana nueva: «{n}» clase={cls}")
        for ventana in auto.GetRootControl().GetChildren():
            for c, _ in auto.WalkControl(ventana, maxDepth=3):
                if c.ControlTypeName == "WindowControl" and c.NativeWindowHandle not in vistos and c.ClassName == "#32770":
                    vistos.add(c.NativeWindowHandle)
                    log.info(f"Diálogo: «{c.Name}» dentro de «{ventana.Name}»")
        time.sleep(1)
    for p in archivos_recientes(t0):
        log.info(f"Archivo Excel nuevo: {p}")


def cerrar_excel(auto, nombre: str, espera: int = 60):
    """Cierra la ventana de Excel que abrió ContaNet con el reporte (solo esa; el archivo no se modificó).
    Excel tarda en abrir un archivo grande y mientras tanto rechaza llamadas: se reintenta. Nunca detiene al robot."""
    t0 = time.time()
    while time.time() - t0 < espera:
        try:
            for c in auto.GetRootControl().GetChildren():
                if c.ClassName == "XLMAIN" and nombre in (c.Name or ""):
                    c.GetWindowPattern().Close()
                    time.sleep(2)
                    no = auto.ButtonControl(searchDepth=6, Name="No guardar")
                    if no.Exists(2):
                        no.GetInvokePattern().Invoke()
                    log.info("Cerré el Excel del reporte")
                    return
        except Exception:  # noqa: BLE001 — Excel ocupado: se vuelve a intentar
            pass
        time.sleep(3)
    log.warning("No pude cerrar el Excel del reporte (se puede cerrar a mano; no afecta la carga).")


def aviso_contanet(auto, pid: int) -> str | None:
    """Texto del cuadro de mensaje que ContaNet tenga abierto (y lo cierra), o None si no hay ninguno."""
    for c in auto.GetRootControl().GetChildren():
        if c.ClassName == "#32770" and c.ProcessId == pid:
            mensaje = " ".join(t.Name for t, _ in auto.WalkControl(c, maxDepth=3) if t.ControlTypeName == "TextControl" and t.Name)
            for b, _ in auto.WalkControl(c, maxDepth=3):
                if b.ControlTypeName == "ButtonControl":
                    b.GetInvokePattern().Invoke()
                    break
            return mensaje
    return None


def descargar(desde: date, hasta: date, espera: int = 900) -> Path:
    import shutil

    import uiautomation as auto

    w = ventana_principal(auto)
    rep = abrir_reporte(auto, w)
    preparar(auto, rep, desde, hasta)
    t0 = time.time() - 1
    rep.ButtonControl(AutomationId="btnAccion", searchDepth=8).GetInvokePattern().Invoke()
    log.info("Reportar: espero el Excel en ContaFiles…")
    archivo, tam = None, -1
    pid = w.ProcessId
    while time.time() - t0 < espera:
        time.sleep(3)
        # Si ContaNet muestra un aviso en lugar de generar el Excel (p. ej. «no hay datos»), se lee, se cierra y se informa.
        # Mientras se abre o cierra una ventana (el Excel del reporte), Windows puede fallar un instante al recorrerlas
        # («Un evento no pudo invocar a ninguno de los subscriptores»): eso no es un aviso, se ignora y se sigue esperando.
        try:
            mensaje = aviso_contanet(auto, pid)
        except Exception as e:  # noqa: BLE001
            log.info(f"Aviso: falla momentánea al revisar ventanas ({e}); sigo esperando el Excel")
            mensaje = None
        if mensaje is not None:
            if any(x in mensaje.lower() for x in ("no hay", "no existe", "sin datos", "no se encontr")):
                raise SinVentas(f"ContaNet: {mensaje}")
            raise RuntimeError(f"ContaNet mostró un aviso: {mensaje}")
        nuevos = [x for x in CONTAFILES.glob("Reporte_ConsultaVentasProductoDetallado*.xlsx")
                  if not x.name.startswith("~$") and x.stat().st_mtime >= t0]
        if not nuevos:
            continue
        actual = max(nuevos, key=lambda x: x.stat().st_mtime)
        if actual == archivo and actual.stat().st_size == tam and tam > 0:
            break                                   # terminó de escribirse
        archivo, tam = actual, actual.stat().st_size
    else:
        raise RuntimeError(f"ContaNet no generó el Excel en {espera // 60} minutos.")
    CARPETA.mkdir(parents=True, exist_ok=True)
    destino = CARPETA / f"contanet_{desde:%Y%m%d}_{hasta:%Y%m%d}.xlsx"
    shutil.copy2(archivo, destino)
    log.info(f"Descargado: {archivo.name} ({tam / 1e6:.1f} MB) -> {destino}")
    cerrar_excel(auto, archivo.stem)
    return destino


# ============================================================================ principal
def main() -> None:
    ap = argparse.ArgumentParser(description="Descarga el reporte de ventas de ContaNet y lo carga a la base.")
    ap.add_argument("--desde", type=date.fromisoformat)
    ap.add_argument("--hasta", type=date.fromisoformat)
    ap.add_argument("--archivo", type=Path, help="no descargar: cargar este archivo")
    ap.add_argument("--prueba", action="store_true", help="cargar dentro de una transacción que se deshace")
    ap.add_argument("--explorar", action="store_true")
    ap.add_argument("--hoy", action="store_true", help="avance del día: solo hoy, hasta la hora actual")
    a = ap.parse_args()

    (AQUI / "logs").mkdir(exist_ok=True)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s", datefmt="%Y-%m-%d %H:%M:%S",
                        handlers=[logging.StreamHandler(sys.stdout),
                                  logging.FileHandler(AQUI / "logs" / f"contanet_{date.today():%Y%m}.log", encoding="utf-8")])
    try:
        if a.archivo:
            cargar(a.archivo, a.prueba)
            return
        desde, hasta = (date.today(), date.today()) if a.hoy else rango_por_defecto(date.today())
        desde, hasta = a.desde or desde, a.hasta or hasta
        if a.explorar:
            import uiautomation as auto
            w = ventana_principal(auto)
            rep = abrir_reporte(auto, w)

            preparar(auto, rep, desde, hasta)
            explorar(auto, rep)
            return
        ruta = descargar(desde, hasta, espera=300 if a.hoy else 900)
        cargar(ruta, a.prueba, rango=(desde, hasta))
    except SinVentas as e:
        log.info(f"Sin ventas que cargar en {desde:%d/%m/%Y} – {hasta:%d/%m/%Y}: {e}")
    except Exception as e:  # noqa: BLE001 — se anota en el registro y la tarea termina con error
        log.error(f"ERROR: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
