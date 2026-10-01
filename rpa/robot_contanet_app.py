"""Programa «Robot ContaNet» (se empaqueta como RobotContaNet.exe).

Ventana para configurar y ejecutar el robot de ContaNet en cualquier PC:
  - Ruta de ContaNet (se detecta sola en C:\\CONTANET; se puede cambiar con «Buscar…»).
  - Carpeta donde ContaNet deja los Excel (ContaFiles) y carpeta donde el robot guarda las copias.
  - Conexión directa a la base (Supabase): la contraseña se guarda solo en esta PC, nunca dentro del programa.
  - ▶ Ejecutar ahora · Probar · Programar diario (crea la tarea de Windows) · Quitar programación.
Con «--auto» corre sin ventana (lo usa la tarea programada) y anota todo en el registro.

Configuración: %LOCALAPPDATA%\\RobotContaNet\\config.json · Registro: %LOCALAPPDATA%\\RobotContaNet\\logs\\
"""
from __future__ import annotations

import json
import logging
import os
import queue
import subprocess
import sys
import threading
from datetime import date
from pathlib import Path

import contanet_robot as robot

NOMBRE = "Robot ContaNet"
TAREA = "Calderon - Robot ContaNet"                 # cierre: del 1 del mes hasta ayer
TAREA_AVANCE = "Calderon - Robot ContaNet (avance)"  # avance del día: solo hoy, varias veces al día
DATOS = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "RobotContaNet"
CONFIG = DATOS / "config.json"
LOGS = DATOS / "logs"
log = logging.getLogger("contanet")


# ============================================================================ configuración
def detectar_contanet() -> str:
    for raiz in (Path(r"C:\CONTANET"), Path(r"C:\Program Files"), Path(r"C:\Program Files (x86)")):
        if raiz.exists():
            for p in raiz.glob("**/ContaNet.Aplicacion.exe"):
                return str(p)
    return ""


def cargar_config() -> dict:
    cfg = {"contanet_exe": "", "contafiles": "", "carpeta_reportes": str(Path.home() / "Documents" / "ReporteContanet"),
           "hora": "07:30", "avances": "10:00, 13:00, 16:00, 19:00", "db_password": "", "database_url": ""}
    if CONFIG.exists():
        cfg.update(json.loads(CONFIG.read_text(encoding="utf-8")))
    if not cfg["contanet_exe"] or not Path(cfg["contanet_exe"]).exists():
        cfg["contanet_exe"] = cfg["contanet_exe"] or detectar_contanet()
    return cfg


def guardar_config(cfg: dict) -> None:
    DATOS.mkdir(parents=True, exist_ok=True)
    CONFIG.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")


def aplicar(cfg: dict) -> None:
    """Pasa la configuración al robot y a la conexión."""
    exe = Path(cfg["contanet_exe"])
    robot.EXE = exe
    robot.CONTAFILES = Path(cfg["contafiles"]) if cfg.get("contafiles") else exe.parent / "Desktop" / "ContaFiles"
    robot.CARPETA = Path(cfg["carpeta_reportes"])
    if cfg.get("db_password"):
        os.environ["SUPABASE_DB_PASSWORD"] = cfg["db_password"]
    if cfg.get("database_url"):
        os.environ["DATABASE_URL"] = cfg["database_url"]


def preparar_registro(*extra: logging.Handler) -> None:
    LOGS.mkdir(parents=True, exist_ok=True)
    log.handlers.clear()
    log.setLevel(logging.INFO)
    archivo = logging.FileHandler(LOGS / f"contanet_{date.today():%Y%m}.log", encoding="utf-8")
    archivo.setFormatter(logging.Formatter("%(asctime)s  %(message)s", "%Y-%m-%d %H:%M:%S"))
    log.addHandler(archivo)
    for h in extra:
        log.addHandler(h)


# ============================================================================ acciones
def ejecutar(hoy: bool = False) -> bool:
    """Cierre (del 1 del mes hasta ayer) o, con hoy=True, avance del día (solo hoy hasta la hora actual)."""
    desde, hasta = (date.today(), date.today()) if hoy else robot.rango_por_defecto(date.today())
    try:
        log.info(f"Inicio {'avance del día' if hoy else 'cierre'} · {desde:%d/%m/%Y} – {hasta:%d/%m/%Y} · ContaNet: {robot.EXE}")
        ruta = robot.descargar(desde, hasta, espera=300 if hoy else 900)
        robot.cargar(ruta)
        log.info("Listo.")
        return True
    except robot.SinVentas as e:
        log.info(f"Sin ventas que cargar todavía: {e}")
        return True
    except Exception as e:  # noqa: BLE001
        log.error(f"ERROR: {e}")
        return False


def probar() -> bool:
    ok = True
    if robot.EXE.exists():
        log.info(f"ContaNet encontrado: {robot.EXE}")
    else:
        log.error(f"No encuentro ContaNet en: {robot.EXE}")
        ok = False
    if robot.CONTAFILES.exists():
        log.info(f"Carpeta de reportes de ContaNet: {robot.CONTAFILES}")
    else:
        log.warning(f"Aún no existe {robot.CONTAFILES} (ContaNet la crea al generar el primer reporte).")
    try:
        import uiautomation as auto
        abierto = auto.WindowControl(searchDepth=1, SubName="ContaNet ERP").Exists(1)
        log.info("ContaNet está abierto." if abierto else "ContaNet está cerrado: el robot lo abrirá al ejecutar.")
    except Exception as e:  # noqa: BLE001
        log.warning(f"No pude revisar si ContaNet está abierto: {e}")
    try:
        from conexion import conectar
        with conectar() as con:
            n, hasta = con.execute("select count(*), max(fecha) from contanet_venta").fetchone()
        log.info(f"Conexión a la base OK · ContaNet cargado hasta {hasta:%d/%m/%Y} ({n:,} líneas)." if hasta else "Conexión a la base OK.")
    except Exception as e:  # noqa: BLE001
        log.error(f"No pude conectar a la base: {e}")
        ok = False
    return ok


def comando_auto() -> tuple[str, str]:
    """Programa y argumentos que ejecuta la tarea programada (este programa con --auto)."""
    if getattr(sys, "frozen", False):
        return sys.executable, "--auto"
    return sys.executable, f'"{Path(__file__).resolve()}" --auto'


def horas(texto: str) -> list[str]:
    """«10:00, 13:00, 16:00» -> ['10:00', '13:00', '16:00'] (valida HH:MM)."""
    salida = []
    for h in texto.replace(";", ",").split(","):
        h = h.strip()
        if not h:
            continue
        hh, _, mm = h.partition(":")
        if not (hh.isdigit() and mm.isdigit() and 0 <= int(hh) < 24 and 0 <= int(mm) < 60):
            raise ValueError(f"Hora no válida: «{h}» (usa HH:MM)")
        salida.append(f"{int(hh):02d}:{int(mm):02d}")
    return salida


def registrar_tarea(nombre: str, horarios: list[str], extra: str, descripcion: str) -> bool:
    exe, args = comando_auto()
    disparos = ",".join(f"(New-ScheduledTaskTrigger -Daily -At '{h}')" for h in horarios)
    ps = (f"$a = New-ScheduledTaskAction -Execute '{exe}' -Argument '{(args + ' ' + extra).strip()}' -WorkingDirectory '{DATOS}';"
          f"$t = @({disparos});"
          "$p = New-ScheduledTaskPrincipal -UserId \"$env:USERDOMAIN\\$env:USERNAME\" -LogonType Interactive -RunLevel Limited;"
          "$s = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries;"
          f"Register-ScheduledTask -TaskName '{nombre}' -Description '{descripcion}' "
          "-Action $a -Trigger $t -Principal $p -Settings $s -Force | Out-Null")
    r = subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, text=True, creationflags=0x08000000)
    if r.returncode != 0:
        log.error(f"No pude programar «{nombre}»: {r.stderr.strip()[:300]}")
    return r.returncode == 0


def quitar_tarea(nombre: str) -> None:
    subprocess.run(["schtasks", "/Delete", "/TN", nombre, "/F"], capture_output=True, text=True, creationflags=0x08000000)


def programar(hora: str, avances: str) -> bool:
    try:
        cierre, intradia = (horas(hora) or ["07:30"])[:1], horas(avances)
    except ValueError as e:
        log.error(str(e))
        return False
    ok = registrar_tarea(TAREA, cierre, "", "Cierre: descarga de ContaNet del 1 del mes hasta ayer y carga a la base.")
    if ok:
        log.info(f"Cierre programado todos los días a las {cierre[0]} (del 1 del mes hasta ayer).")
    if intradia:
        if registrar_tarea(TAREA_AVANCE, intradia, "--hoy", "Avance del día: descarga de ContaNet de hoy hasta la hora actual."):
            log.info(f"Avance del día programado a las {', '.join(intradia)} (solo hoy).")
        else:
            ok = False
    else:
        quitar_tarea(TAREA_AVANCE)
        log.info("Sin avances durante el día.")
    log.info("Las tareas corren si la sesión de Windows está abierta.")
    return ok


def quitar_programacion() -> None:
    quitar_tarea(TAREA)
    quitar_tarea(TAREA_AVANCE)
    log.info("Programación quitada.")


def estado_tarea() -> str:
    def proxima(nombre: str) -> str:
        r = subprocess.run(["powershell", "-NoProfile", "-Command",
                            f"$i = Get-ScheduledTaskInfo -TaskName '{nombre}' -ErrorAction SilentlyContinue; if ($i) {{ $i.NextRunTime.ToString('dd/MM HH:mm') }}"],
                           capture_output=True, text=True, creationflags=0x08000000)
        return r.stdout.strip()
    c, a = proxima(TAREA), proxima(TAREA_AVANCE)
    if not c and not a:
        return "Sin programación diaria"
    return f"Programado · próximo cierre: {c or '—'} · próximo avance del día: {a or '—'}"


# ============================================================================ ventana
def ventana() -> None:
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk

    cfg = cargar_config()
    cola: queue.Queue[str] = queue.Queue()

    class AlaVentana(logging.Handler):
        def emit(self, registro):
            cola.put(self.format(registro))

    manejador = AlaVentana()
    manejador.setFormatter(logging.Formatter("%(asctime)s  %(message)s", "%H:%M:%S"))
    preparar_registro(manejador)

    raiz = tk.Tk()
    raiz.title(NOMBRE)
    raiz.geometry("820x640")
    raiz.minsize(680, 520)
    estilo = ttk.Style()
    estilo.configure("Accion.TButton", font=("Segoe UI", 11, "bold"), padding=8)

    marco = ttk.Frame(raiz, padding=14)
    marco.pack(fill="both", expand=True)
    ttk.Label(marco, text="Robot ContaNet", font=("Segoe UI", 16, "bold")).grid(row=0, column=0, columnspan=3, sticky="w")
    ttk.Label(marco, text="Descarga el «Reporte de ventas por producto» (Detallado · Soles · Con IGV) y lo carga directo a la base.",
              foreground="#666").grid(row=1, column=0, columnspan=3, sticky="w", pady=(0, 10))

    campos: dict[str, tk.StringVar] = {}

    def fila(n: int, etiqueta: str, clave: str, buscar: str | None = None, oculto: bool = False):
        ttk.Label(marco, text=etiqueta).grid(row=n, column=0, sticky="w", pady=3)
        var = tk.StringVar(value=cfg.get(clave, ""))
        campos[clave] = var
        ttk.Entry(marco, textvariable=var, show="•" if oculto else "").grid(row=n, column=1, sticky="ew", padx=6)
        if buscar == "archivo":
            ttk.Button(marco, text="Buscar…", command=lambda: var.set(filedialog.askopenfilename(
                title="ContaNet.Aplicacion.exe", filetypes=[("ContaNet", "ContaNet.Aplicacion.exe"), ("Programas", "*.exe")]) or var.get())).grid(row=n, column=2)
        elif buscar == "carpeta":
            ttk.Button(marco, text="Buscar…", command=lambda: var.set(filedialog.askdirectory() or var.get())).grid(row=n, column=2)

    fila(2, "Programa ContaNet (.exe)", "contanet_exe", "archivo")
    fila(3, "Carpeta ContaFiles (vacío = la de ContaNet)", "contafiles", "carpeta")
    fila(4, "Guardar los reportes en", "carpeta_reportes", "carpeta")
    fila(5, "Contraseña de la base (Supabase)", "db_password", oculto=True)
    if cfg.get("database_url") and not cfg.get("db_password"):
        ttk.Label(marco, text="✓ Conexión guardada. Escribe la contraseña solo si quieres cambiarla.", foreground="#0f8a4a").grid(row=5, column=2, sticky="w")
    fila(6, "Cierre diario (HH:MM)", "hora")
    fila(7, "Avances del día (horas, separadas por coma)", "avances")
    marco.columnconfigure(1, weight=1)

    def guardar() -> dict:
        nuevo = {**cfg, **{k: v.get().strip() for k, v in campos.items()}}
        guardar_config(nuevo)
        aplicar(nuevo)
        cfg.update(nuevo)
        return nuevo

    botones = ttk.Frame(marco)
    botones.grid(row=8, column=0, columnspan=3, sticky="ew", pady=(12, 6))
    estado = tk.StringVar(value=estado_tarea())

    def en_hilo(funcion, *args):
        def correr():
            for b in botones.winfo_children():
                b.state(["disabled"])
            try:
                funcion(*args)
            finally:
                for b in botones.winfo_children():
                    b.state(["!disabled"])
                estado.set(estado_tarea())
        threading.Thread(target=correr, daemon=True).start()

    ttk.Button(botones, text="▶  Ejecutar cierre", style="Accion.TButton", command=lambda: (guardar(), en_hilo(ejecutar))).pack(side="left")
    ttk.Button(botones, text="Avance de hoy", command=lambda: (guardar(), en_hilo(ejecutar, True))).pack(side="left", padx=(6, 0))
    ttk.Button(botones, text="Probar", command=lambda: (guardar(), en_hilo(probar))).pack(side="left", padx=6)
    ttk.Button(botones, text="Programar diario", command=lambda: (guardar(), en_hilo(programar, cfg["hora"] or "07:30", cfg.get("avances", "")))).pack(side="left")
    ttk.Button(botones, text="Quitar programación", command=lambda: en_hilo(quitar_programacion)).pack(side="left", padx=6)
    ttk.Button(botones, text="Guardar", command=lambda: (guardar(), log.info("Configuración guardada."))).pack(side="right")
    ttk.Label(marco, textvariable=estado, foreground="#0f8a4a").grid(row=9, column=0, columnspan=3, sticky="w")

    texto = tk.Text(marco, height=16, wrap="word", font=("Consolas", 9), background="#1e1e1e", foreground="#e8e8e8")
    texto.grid(row=10, column=0, columnspan=3, sticky="nsew", pady=(8, 0))
    marco.rowconfigure(10, weight=1)
    ttk.Label(marco, text=f"Registro completo: {LOGS}", foreground="#888").grid(row=11, column=0, columnspan=3, sticky="w", pady=(4, 0))

    def leer_cola():
        while not cola.empty():
            texto.insert("end", cola.get() + "\n")
            texto.see("end")
        raiz.after(300, leer_cola)

    aplicar(cfg)
    if not cfg["contanet_exe"]:
        log.warning("No encontré ContaNet: indica la ruta con «Buscar…».")
    if not (cfg.get("db_password") or cfg.get("database_url") or os.environ.get("SUPABASE_DB_PASSWORD")):
        log.warning("Falta la contraseña de la base.")
    leer_cola()

    def cerrar():
        if any(t.is_alive() for t in threading.enumerate() if t is not threading.main_thread()):
            if not messagebox.askyesno(NOMBRE, "El robot está trabajando. ¿Cerrar de todos modos?"):
                return
        raiz.destroy()

    raiz.protocol("WM_DELETE_WINDOW", cerrar)
    raiz.mainloop()


def main() -> None:
    if "--probar" in sys.argv:          # revisión sin ventana: ContaNet, carpetas y conexión a la base
        cfg = cargar_config()
        aplicar(cfg)
        preparar_registro()
        sys.exit(0 if probar() else 1)
    if "--auto" in sys.argv:
        cfg = cargar_config()
        aplicar(cfg)
        preparar_registro()
        sys.exit(0 if ejecutar(hoy="--hoy" in sys.argv) else 1)
    ventana()


if __name__ == "__main__":
    main()
