@echo off
REM Robot ContaNet: descarga el reporte de ventas y lo carga a la base. Lo ejecuta la tarea programada «Calderon - Robot ContaNet».
cd /d "%~dp0"
"C:\Users\USER\AppData\Local\Python\pythoncore-3.14-64\python.exe" contanet_robot.py %*
