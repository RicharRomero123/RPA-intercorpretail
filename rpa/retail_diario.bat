@echo off
rem Respaldo local del bot de Supermercados Peruanos (el principal corre en GitHub Actions).
rem Carga los d??as que falten; si ya est??n cargados termina en segundos. Lo usa la tarea ??Calderon - Retail SPSA (respaldo)??.
cd /d "%~dp0"
if not exist "%LOCALAPPDATA%\RobotContaNet\logs" mkdir "%LOCALAPPDATA%\RobotContaNet\logs"
set PYTHONIOENCODING=utf-8
"C:\Users\USER\AppData\Local\Microsoft\WindowsApps\python.exe" retail_diario.py >> "%LOCALAPPDATA%\RobotContaNet\logs\spsa.log" 2>&1
