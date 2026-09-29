"""Descarga de ventas retail (Supermercados Peruanos) del portal B2B de Intercorp, sin navegador.

El portal está hecho con Vaadin: no tiene una API de reportes; la pantalla se comunica con el servidor
por un canal propio (UIDL) donde cada botón, filtro y tabla es un "conector" con un número. Este
script habla ese mismo idioma: ingresa con usuario y clave del .env, abre Comercial > Ventas, filtra
marca y fechas, lee la tabla y descarga el detalle Producto-Local (zip).

El formato de cada mensaje se copió de lo que envía el navegador (ver capturar_protocolo.py).

Uso:
    python api_intercorp.py            # rango FECHA_DESDE / FECHA_HASTA del .env
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import zipfile
from datetime import date, datetime
from pathlib import Path

import requests

CARPETA = Path(__file__).resolve().parent
BASE = "https://b2b.intercorpretail.pe/Supermercados/BBRe-commerce/main"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/153.0.0.0 Safari/537.36")


def leer_env() -> dict[str, str]:
    """Configuración desde el archivo .env (en la PC) o desde variables de entorno (en GitHub Actions).
    Las variables de entorno tienen prioridad."""
    cfg = {}
    ruta = CARPETA / ".env"
    if ruta.exists():
        for linea in ruta.read_text(encoding="utf-8").splitlines():
            linea = linea.strip()
            if linea and not linea.startswith("#") and "=" in linea:
                k, v = linea.split("=", 1)
                cfg[k.strip()] = v.strip()
    for k in ("INTERCORP_USUARIO", "INTERCORP_CLAVE", "INTERCORP_JSESSIONID", "MARCA", "DATABASE_URL",
              "SUPABASE_DB_PASSWORD", "SUPABASE_PROJECT_REF", "SUPABASE_POOLER_HOST"):
        if os.environ.get(k):
            cfg[k] = os.environ[k]
    return cfg


class IngresoRechazado(RuntimeError):
    """El portal rechazó usuario o clave. No se reintenta: varios fallos seguidos bloquean el usuario."""


def leer_uidl(texto: str) -> list | dict:
    """Las respuestas de Vaadin empiezan con 'for(;;);' para que no se ejecuten como script."""
    return json.loads(texto.removeprefix("for(;;);"))


class PortalVaadin:
    def __init__(self):
        self.http = requests.Session()
        self.http.headers["User-Agent"] = UA
        self.ui_id = None
        self.csrf = None
        self.sync_id = 0
        self.client_id = 0
        self.estado: dict = {}      # estado de cada conector (id -> propiedades)
        self.tipos: dict = {}       # id -> tipo de componente
        self.jerarquia: dict = {}   # id -> hijos
        self.clasicos: dict = {}    # id -> árbol UIDL clásico (menú, desplegables, fechas)
        self.mapeo_tipos: dict = {} # nombre de clase Java -> número de tipo
        self.opciones: dict = {}    # desplegable -> {clave: texto}
        self.filas: dict = {}       # tabla -> filas recibidas
        self.reseteados: set = set()  # tablas que recibieron datos nuevos desde la última marca

    # ------------------------------------------------------------ sesión
    def usar_sesion(self, jsessionid: str, routeid: str = "") -> None:
        """Usa una sesión copiada del navegador (respaldo si el ingreso automático falla)."""
        dominio = "b2b.intercorpretail.pe"
        self.http.cookies.set("JSESSIONID", jsessionid, domain=dominio, path="/Supermercados/BBRe-commerce")
        if routeid:
            self.http.cookies.set("ROUTEID", routeid, domain=dominio, path="/")

    def iniciar_sesion(self, usuario: str, clave: str) -> None:
        """Ingresa con usuario y clave, igual que el formulario del portal.

        El portal redirige a su servidor de ingreso (Keycloak, ssoinretail.bbr.cl); se llena el formulario
        y el servidor devuelve al portal con la sesión (JSESSIONID) ya creada."""
        r = self.http.get(BASE, timeout=60)  # sigue las redirecciones hasta la página de ingreso
        if "initApplication(" in r.text:
            return  # ya había sesión
        form = re.search(r'<form[^>]*id="kc-form-login"[^>]*action="([^"]+)"', r.text)
        if not form:
            raise RuntimeError(f"No se encontró el formulario de ingreso en {r.url}")
        accion = form.group(1).replace("&amp;", "&")
        # Campos ocultos del formulario (los deshabilitados no se envían, igual que en el navegador).
        datos = {}
        for campo in re.findall(r"<input[^>]*>", r.text):
            nombre = re.search(r'name="([^"]+)"', campo)
            if not nombre or " disabled" in campo:
                continue
            valor = re.search(r'value="([^"]*)"', campo)
            datos[nombre.group(1)] = valor.group(1) if valor else ""
        datos.update({"username": usuario, "password": clave, "login": "Ingresar"})
        r = self.http.post(accion, data=datos, timeout=60, headers={"Referer": r.url, "Origin": "https://ssoinretail.bbr.cl"})
        if "initApplication(" not in r.text:
            error = re.search(r'id="input-error"[^>]*>\s*([^<]+)', r.text)
            if error or "kc-form-login" in r.text:
                raise IngresoRechazado("El portal rechazó el ingreso: "
                                       + (error.group(1).strip() if error else "volvió a mostrar el formulario"))
            raise RuntimeError(f"El ingreso terminó en una página inesperada: {r.url}")
        log("Sesión iniciada con usuario y clave")

    # ------------------------------------------------------------ arranque
    def abrir(self) -> None:
        r = self.http.get(BASE, allow_redirects=False, timeout=60)
        if r.status_code in (301, 302, 303, 307) or "ssoinretail" in r.headers.get("Location", ""):
            raise RuntimeError("La sesión no es válida o caducó: el portal redirige al ingreso.")
        r.raise_for_status()
        m = re.search(r'initApplication\("([^"]+)"\s*,\s*(\{.*?\})\);', r.text, re.S)
        if not m:
            (CARPETA / "capturas").mkdir(exist_ok=True)
            (CARPETA / "capturas" / "api_bootstrap.html").write_text(r.text, encoding="utf-8")
            raise RuntimeError("No se encontró la configuración de arranque; se guardó en capturas/api_bootstrap.html")
        app_id = m.group(1)
        cfg = json.loads(re.sub(r"(\w+)\s*:", r'"\1":', m.group(2))) if not m.group(2).lstrip().startswith('{"') \
            else json.loads(m.group(2))
        self.app_id, self.cfg_arranque = app_id, cfg

        # El navegador pide la primera pantalla enviando sus datos (tamaño, zona horaria, etc.).
        ahora = int(time.time() * 1000)
        datos = {
            "v-browserDetails": "1", "theme": cfg.get("theme", ""), "v-appId": app_id,
            "v-sh": "900", "v-sw": "1440", "v-cw": "1400", "v-ch": "800", "v-curdate": str(ahora),
            "v-tzo": "300", "v-dstd": "0", "v-rtzo": "300", "v-dston": "false", "v-tzid": "America/Lima",
            "v-vw": "1400", "v-vh": "800", "v-loc": BASE, "v-wn": f"{app_id}-0.1",
        }
        r = self.http.post(f"{BASE}/?v-{ahora}", data=datos, timeout=60,
                           headers={"Content-Type": "application/x-www-form-urlencoded"})
        r.raise_for_status()
        inicio = json.loads(r.text.removeprefix("for(;;);"))
        self.ui_id = inicio.get("v-uiId")
        uidl = json.loads(inicio["uidl"]) if isinstance(inicio.get("uidl"), str) else inicio
        self.csrf = uidl.get("Vaadin-Security-Key")
        self._aplicar(uidl)
        log(f"Pantalla abierta: uiId={self.ui_id} | csrf={'sí' if self.csrf else 'NO'} | "
              f"componentes={len(self.tipos)}")

    # ------------------------------------------------------------ estado
    def _aplicar(self, uidl: dict) -> None:
        self.sync_id = uidl.get("syncId", self.sync_id)
        self.client_id = uidl.get("clientId", self.client_id)
        for cid, props in (uidl.get("state") or {}).items():
            self.estado.setdefault(cid, {}).update(props)
        self.tipos.update(uidl.get("types") or {})
        self.jerarquia.update(uidl.get("hierarchy") or {})
        self.mapeo_tipos.update(uidl.get("typeMappings") or {})
        # Las opciones de los desplegables y las filas de las tablas llegan por su "DataCommunicator",
        # un conector hijo del componente: se guardan a nombre del padre.
        padres = {h: p for p, hs in self.jerarquia.items() for h in hs}
        for cid, interfaz, metodo, args in uidl.get("rpc") or []:
            if interfaz != "com.vaadin.shared.data.DataCommunicatorClientRpc":
                continue
            dueño = padres.get(cid, cid)
            if metodo == "reset":
                self.opciones[dueño] = {}
                self.filas[dueño] = []
                self.reseteados.add(dueño)
            elif metodo == "setData":
                inicio, filas = args
                for r in filas:
                    if "n" in r:
                        self.opciones.setdefault(dueño, {})[r["k"]] = r["n"]
                lista = self.filas.setdefault(dueño, [])
                lista[inicio:inicio + len(filas)] = [r for r in filas if "d" in r]
        # Los componentes antiguos (menú, desplegables, fechas) llegan como "changes" en formato UIDL clásico.
        for cambio in uidl.get("changes") or []:
            if isinstance(cambio, list) and len(cambio) >= 3 and isinstance(cambio[2], list):
                cid = str(cambio[1].get("pid")) if isinstance(cambio[1], dict) else None
                if cid:
                    self.clasicos[cid] = cambio[2]

    def items_menu(self) -> list[dict]:
        """Recorre los menús (MenuBar) y devuelve cada ítem con su id, texto y conector."""
        salida = []

        def recorrer(nodo, cid, ruta):
            if not isinstance(nodo, list) or not nodo:
                return
            if nodo[0] == "item" and len(nodo) > 1 and isinstance(nodo[1], dict):
                texto = re.sub(r"<[^>]+>", "", str(nodo[1].get("text", ""))).strip()
                ruta = ruta + [texto]
                salida.append({"conector": cid, "id": nodo[1].get("id"), "texto": texto, "ruta": " > ".join(ruta)})
            for hijo in nodo[1:]:
                recorrer(hijo, cid, ruta)

        for cid, arbol in self.clasicos.items():
            recorrer(arbol, cid, [])
        return salida

    def textos(self) -> list[tuple[str, str]]:
        """Pares (id, texto visible) de los componentes que tienen caption, texto o html."""
        salida = []
        for cid, p in self.estado.items():
            for campo in ("caption", "text", "html"):
                if isinstance(p.get(campo), str) and p[campo].strip():
                    salida.append((cid, re.sub(r"<[^>]+>", " ", p[campo]).strip()))
        return salida

    def menus(self) -> list[str]:
        """Textos de los menús del menubar (Vaadin los manda como 'variables' en el estado heredado)."""
        todo = json.dumps(self.estado, ensure_ascii=False)
        return sorted(set(re.findall(r'"text":\s*"([^"]{2,40})"', todo)))

    def clic_menu(self, ruta: str) -> dict:
        """Hace clic en un ítem del menú por su ruta visible, p. ej. 'Comercial > Ventas'."""
        item = next((i for i in self.items_menu() if i["ruta"] == ruta), None)
        if not item:
            raise RuntimeError(f"No existe el menú '{ruta}'")
        # Variable clásica de Vaadin: [conector, "v", "v", [nombre, [tipo, valor]]]; "i" = entero.
        return self.rpc([[item["conector"], "v", "v", ["clickedId", ["i", item["id"]]]]])

    # ------------------------------------------------------------ pantalla Ventas
    def buscar(self, tipo_clase: str, cerca_de: str | None = None) -> list[str]:
        """Conectores cuyo tipo contiene `tipo_clase` (p. ej. 'ComboBox', 'DateTimeField')."""
        mapa = {str(v): k for k, v in self.mapeo_tipos.items()}
        return sorted((c for c, t in self.tipos.items() if tipo_clase in mapa.get(str(t), "")), key=int)

    def elegir_combo(self, conector: str, texto: str) -> None:
        opciones = self.opciones.get(conector, {})
        clave = next((k for k, n in opciones.items() if texto.lower() in n.lower()), None)
        if clave is None:
            raise RuntimeError(f"El desplegable {conector} no tiene '{texto}'. Opciones: {list(opciones.values())}")
        # Mismo orden que el navegador (capturado con capturar_protocolo.py): abrir la lista sin filtro,
        # pedir sus filas y seleccionar por clave.
        datos = next((h for h in self.jerarquia.get(conector, [])), None)
        llamadas = [[conector, "com.vaadin.shared.ui.combobox.ComboBoxServerRpc", "setFilter", [""]]]
        if datos:
            llamadas.append([datos, "com.vaadin.shared.data.DataRequestRpc", "requestRows", [0, len(opciones), 0, 0]])
        llamadas.append([conector, "com.vaadin.shared.data.selection.SelectionServerRpc", "select", [clave]])
        self.rpc(llamadas)

    def poner_fecha(self, conector: str, f) -> None:
        # El navegador manda el texto en null y la fecha por partes (año, mes, día).
        self.rpc([[conector, "com.vaadin.shared.ui.datefield.AbstractDateFieldServerRpc", "update",
                   [None, {"YEAR": f.year, "MONTH": f.month, "DAY": f.day}]]])
        quedo = self.estado.get(conector, {}).get("resolutions", {})
        if (quedo.get("YEAR"), quedo.get("MONTH"), quedo.get("DAY")) != (f.year, f.month, f.day):
            raise RuntimeError(f"La fecha del conector {conector} quedó en {quedo}, no en {f:%d-%m-%Y}")

    def clic(self, conector: str) -> dict:
        detalle = {"button": "LEFT", "clientX": 0, "clientY": 0, "relativeX": 0, "relativeY": 0,
                   "altKey": False, "ctrlKey": False, "metaKey": False, "shiftKey": False, "type": 1}
        return self.rpc([[conector, "com.vaadin.shared.ui.button.ButtonServerRpc", "click", [detalle]]])

    def conector_con_texto(self, texto: str) -> str | None:
        """El conector (el más reciente) cuyo caption es exactamente `texto`."""
        return max((c for c, p in self.estado.items() if (p.get("caption") or "").strip() == texto),
                   key=int, default=None)

    def sondear(self) -> bool:
        """Hace una consulta periódica si el portal la pidió. Devuelve False si no hay ninguna activa."""
        sondeo = next(((c, p["pollInterval"]) for c, p in self.estado.items()
                       if isinstance(p.get("pollInterval"), int) and p["pollInterval"] > 0), None)
        if not sondeo:
            return False
        time.sleep(sondeo[1] / 1000)
        self.rpc([[sondeo[0], "com.vaadin.shared.ui.ui.UIServerRpc", "poll", []]])
        return True

    def descargar_dato_fuente(self, destino: Path, maximo_s: int = 900) -> Path:
        """Menú de descarga > 'Descargar Dato Fuente Período' > 'Sí' > espera el enlace del zip y lo baja."""
        mapa = {str(v): k for k, v in self.mapeo_tipos.items()}
        popup = max((c for c, t in self.tipos.items() if "BbrPopupButton" in mapa.get(str(t), "")
                     and "icon_Download" in json.dumps(self.estado.get(c, {}))), key=int, default=None)
        if not popup:
            raise RuntimeError("No se encontró el botón de descarga")
        self.rpc([[popup, "cl.bbr.core.components.widgets.bbrpopupbutton.client.BbrPopupButtonServerRpc",
                   "setPopupVisible", [True]]])
        accion = self.conector_con_texto("Descargar Dato Fuente Período")
        if not accion:
            raise RuntimeError("No apareció la opción 'Descargar Dato Fuente Período'")
        self.clic(accion)
        patron = r'https?://[^"]*/download/b2b_files/[^"]+'
        previos = set(re.findall(patron, json.dumps(self.estado)))  # enlaces de descargas anteriores
        si = self.conector_con_texto("Sí")
        if si:
            self.clic(si)
        t0 = time.perf_counter()
        while time.perf_counter() - t0 < maximo_s:
            nuevos = [u for u in re.findall(patron, json.dumps(self.estado)) if u not in previos]
            if nuevos:
                break
            if not self.sondear():
                time.sleep(1)
        else:
            raise RuntimeError(f"El archivo no estuvo listo en {maximo_s} s")
        url = nuevos[-1]
        log(f"Archivo listo en {time.perf_counter() - t0:.0f} s: {url.rsplit('/', 1)[-1]}")
        r = self.http.get(url, timeout=600)
        r.raise_for_status()
        destino.mkdir(parents=True, exist_ok=True)
        archivo = destino / requests.utils.unquote(url.rsplit("/", 1)[-1])
        archivo.write_bytes(r.content)
        log(f"Descargado {archivo.name} ({len(r.content) / 1024:.0f} KB)")
        return archivo

    def esperar_datos(self, grid: str, maximo_s: int = 300) -> None:
        """El portal arma el informe en segundo plano y activa una consulta periódica (poll); el navegador
        pregunta cada cierto tiempo y los datos llegan en una de esas respuestas. Se hace lo mismo.

        Se da por terminado cuando la tabla recibió datos nuevos (reset) y ya no hay consulta periódica:
        así, al generar varios días seguidos, nunca se leen los totales del día anterior."""
        t0 = time.perf_counter()
        while time.perf_counter() - t0 < maximo_s:
            sondeo = next(((c, p["pollInterval"]) for c, p in self.estado.items()
                           if isinstance(p.get("pollInterval"), int) and p["pollInterval"] > 0), None)
            if grid in self.reseteados and not sondeo:
                return
            if not sondeo:
                if time.perf_counter() - t0 > 10:
                    raise RuntimeError("El portal no inició la generación del informe (sin consulta periódica)")
                time.sleep(0.5)
                continue
            cid, intervalo = sondeo
            time.sleep(intervalo / 1000)
            self.rpc([[cid, "com.vaadin.shared.ui.ui.UIServerRpc", "poll", []]])
        raise RuntimeError(f"El informe no terminó en {maximo_s} s")

    def tabla(self, grid: str) -> tuple[list[str], list[list[str]], list[str]]:
        """Encabezados, filas y pie (totales) de una tabla (Grid) ya cargada."""
        st = self.estado.get(grid, {})
        cab = st.get("header", {}).get("rows", [{}])[0].get("cells", {})
        # Cada columna es un conector hijo de la tabla; en su estado, "id" (o "internalId") es la clave
        # que usan el encabezado y el pie. Las filas traen los valores con el número de conector de la columna.
        claves_fila = set().union(*(r["d"].keys() for r in self.filas.get(grid, []))) if self.filas.get(grid) else set()
        columnas = [c for c in self.jerarquia.get(grid, []) if c in claves_fila or
                    {"id", "internalId"} & set(self.estado.get(c, {}))]
        orden = [(c, str(self.estado.get(c, {}).get("id", self.estado.get(c, {}).get("internalId", i))))
                 for i, c in enumerate(columnas)]
        if os.environ.get("API_DEBUG"):
            print("columnas:", [(c, self.estado.get(c)) for c in columnas][:3], "claves fila:", sorted(claves_fila)[:12])
        nombres = [re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", (cab.get(cid_col, {}).get("html")
                   or cab.get(cid_col, {}).get("text") or ""))).strip() for _, cid_col in orden]
        filas = [[str(r["d"].get(c, "")) for c, _ in orden] for r in self.filas.get(grid, [])]
        pie_celdas = (st.get("footer", {}).get("rows") or [{}])[0].get("cells", {})
        pie = [str(pie_celdas.get(cid_col, {}).get("text") or "") for _, cid_col in orden]
        return nombres, filas, pie

    # ------------------------------------------------------------ llamadas
    def rpc(self, llamadas: list) -> dict:
        cuerpo = {"csrfToken": self.csrf, "rpc": llamadas, "syncId": self.sync_id, "clientId": self.client_id}
        r = self.http.post(f"{BASE}/UIDL/?v-uiId={self.ui_id}", json=cuerpo, timeout=300)
        r.raise_for_status()
        respuesta = leer_uidl(r.text)
        uidl = respuesta[0] if isinstance(respuesta, list) else respuesta
        if "meta" in uidl and uidl["meta"].get("appError"):
            raise RuntimeError(f"El portal respondió con error: {uidl['meta']['appError']}")
        self._aplicar(uidl)
        return uidl


def numero(texto: str) -> float:
    """'5,968.00' -> 5968.0 (el portal usa coma de miles y punto decimal)."""
    t = str(texto or "").replace(",", "").strip()
    return float(t) if t else 0.0


def ingresar(cfg: dict) -> PortalVaadin:
    """Inicia sesión (usuario y clave del .env; o un JSESSIONID copiado, si no hay clave) y abre el portal."""
    portal = PortalVaadin()
    if cfg.get("INTERCORP_USUARIO") and cfg.get("INTERCORP_CLAVE"):
        portal.iniciar_sesion(cfg["INTERCORP_USUARIO"], cfg["INTERCORP_CLAVE"])
    elif cfg.get("INTERCORP_JSESSIONID"):
        portal.usar_sesion(cfg["INTERCORP_JSESSIONID"], cfg.get("INTERCORP_ROUTEID", ""))
    else:
        raise RuntimeError("Faltan INTERCORP_USUARIO e INTERCORP_CLAVE (.env o variables de entorno).")
    portal.abrir()
    return portal


class PantallaVentas:
    """Comercial > Ventas con la marca elegida; se prepara una vez y genera cuantos rangos se quiera."""

    def __init__(self, portal: PortalVaadin, marca: str):
        self.p = portal
        portal.clic_menu("Comercial > Ventas")
        # En la pantalla hay 3 desplegables (Proveedor, Marcas, Formato) y 2 fechas (Desde, Hasta), en ese orden.
        proveedor, marcas, _ = portal.buscar("ComboBox")[:3]
        self.proveedor = portal.estado[proveedor].get("selectedItemCaption")
        portal.elegir_combo(marcas, marca)
        self.marca = portal.estado[marcas].get("selectedItemCaption")
        self.f_desde, self.f_hasta = portal.buscar("DateTimeField")[:2]
        self.boton = portal.conector_con_texto("Generar Informe")
        log(f"Ventas lista | proveedor {self.proveedor} | marca {self.marca}")

    def ultima_fecha(self) -> date:
        """El último día que el portal deja consultar (el más reciente publicado por SPSA)."""
        return date.fromisoformat(self.p.estado[self.f_hasta]["rangeEnd"][:10])

    def primera_fecha(self) -> date:
        return date.fromisoformat(self.p.estado[self.f_hasta]["rangeStart"][:10])

    def fecha_inventario(self) -> date | None:
        """La fecha del inventario que muestra el portal ('Mostrar inventario al 28-09-2026')."""
        for _, texto in self.p.textos():
            m = re.search(r"inventario al (\d{2})-(\d{2})-(\d{4})", texto)
            if m:
                return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        return None

    def generar(self, desde: date, hasta: date) -> dict:
        """Genera el informe del rango y devuelve filas por producto y la fila TOTAL, con números."""
        self.p.poner_fecha(self.f_desde, desde)
        self.p.poner_fecha(self.f_hasta, hasta)
        grid = max((c for c, p in self.p.estado.items() if "header" in p and "footer" in p), key=int)
        self.p.reseteados.discard(grid)
        self.p.clic(self.boton)
        grid = max((c for c, p in self.p.estado.items() if "header" in p and "footer" in p), key=int)
        self.p.esperar_datos(grid)
        nombres, filas, pie = self.p.tabla(grid)
        idx = {n: i for i, n in enumerate(nombres)}

        def fila(v):
            return {"und": numero(v[idx["Vta. Unid."]]), "venta": numero(v[idx["Vta. Púb (s/IGV)"]]),
                    "costo": numero(v[idx["Vta. Costo (s/IGV)"]]), "inv_und": numero(v[idx["Inv. Unid."]]),
                    "inv_costo": numero(v[idx["Inv. a Costo Prom. (s/IGV)"]])}

        return {"productos": [{"sku": v[idx["Cód. SPSA"]], "producto": v[idx["Descripción Producto"]], **fila(v)}
                              for v in filas],
                "total": fila(pie) if any(pie) else {k: 0.0 for k in ("und", "venta", "costo", "inv_und", "inv_costo")}}

    def descargar_detalle(self, destino: Path) -> Path:
        """Descarga el detalle Producto-Local del último rango generado y devuelve el CSV extraído."""
        archivo = self.p.descargar_dato_fuente(destino)
        if not zipfile.is_zipfile(archivo):
            return archivo
        with zipfile.ZipFile(archivo) as z:
            nombres = [n for n in z.namelist() if n.lower().endswith(".csv")]
            z.extractall(destino)
        archivo.unlink()
        return destino / nombres[0]


def log(mensaje: str) -> None:
    print(f"{datetime.now():%H:%M:%S}  {mensaje}", flush=True)


def main() -> None:
    cfg = leer_env()
    desde = date.fromisoformat(cfg.get("FECHA_DESDE") or "2026-09-01")
    hasta = date.fromisoformat(cfg.get("FECHA_HASTA") or "2026-09-27")
    t0 = time.perf_counter()
    try:
        portal = ingresar(cfg)
    except IngresoRechazado as e:
        sys.exit(f"{e}. No se reintenta para no bloquear el usuario: revisa el .env.")
    ventas = PantallaVentas(portal, cfg.get("MARCA") or "CALDERON")
    r = ventas.generar(desde, hasta)
    log(f"{desde:%d-%m-%Y} al {hasta:%d-%m-%Y}: {len(r['productos'])} productos | total {r['total']}")
    destino = CARPETA / "descargas" / f"api_{desde:%Y%m%d}_{hasta:%Y%m%d}"
    csv_detalle = ventas.descargar_detalle(destino)
    log(f"Listo en {time.perf_counter() - t0:.1f} s: {csv_detalle}")


if __name__ == "__main__":
    main()
