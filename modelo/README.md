# Modelo de pronóstico de venta (tiendas)

Carpeta de trabajo local para construir y probar el modelo antes de llevarlo a la web.

- `datos.py` — descarga **una sola vez** la historia de Supabase a `datos/` (no se sube a GitHub). Para traer datos nuevos:
  `python datos.py`. Lee la clave de la base del `.env` local (vía `rpa/conexion.py`) y **solo lee**, no escribe.
- `01_exploracion.ipynb` — comportamiento de la venta (día de la semana, quincenas, meses, tiendas) y la línea base
  (regla: mismo día del año pasado × crecimiento de 4 semanas) que el modelo debe superar.
- `crear_cuaderno.py` — regenera el cuaderno 01 desde código.

Abrir en VS Code: abrir el `.ipynb`, elegir el kernel **Python 3.14** y «Ejecutar todo».
Fuente: reporte interno (`tiendas_venta`, desde 02/01/2025); los días que aún no trae se completan con ContaNet tiendas.
