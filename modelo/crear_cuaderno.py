"""Genera el cuaderno 01_exploracion.ipynb (análisis de la venta diaria de tiendas antes de armar el modelo)."""
from pathlib import Path

import nbformat as nbf

md, code = nbf.v4.new_markdown_cell, nbf.v4.new_code_cell
celdas = [
    md("""# 01 · Exploración de la venta diaria de tiendas
Antes de armar el modelo de pronóstico: cómo se comporta la venta por día, semana, mes y tienda, y qué tan bien proyecta
la regla simple actual (mismo día del año pasado × crecimiento reciente). Todo sale de los archivos locales de `datos/`:
**no consulta la base** (para traer datos nuevos: `cargar(actualizar=True)` o `python datos.py`)."""),
    code("""import pandas as pd, numpy as np, matplotlib.pyplot as plt
import matplotlib.ticker as mt
from datos import cargar

plt.rcParams.update({"figure.figsize": (12, 4), "axes.spines.top": False, "axes.spines.right": False,
                     "axes.grid": True, "grid.alpha": .25, "font.size": 10})
NARANJA, GRIS, CAFE = "#ec8416", "#b8a79a", "#5c1a07"
miles = mt.FuncFormatter(lambda v, _: f"{v/1e3:,.0f} mil")

ventas, metas, info = cargar()
info"""),
    md("## 1. Cuadre de la data\nEl total del reporte interno debe ser **S/ 20,974,761.04** (igual a los Excel del Power BI)."),
    code("""interno = ventas[ventas.origen == "interno"]
print(f"Reporte interno: S/ {interno.venta.sum():,.2f}  ·  {interno.fecha.min():%d/%m/%Y} a {interno.fecha.max():%d/%m/%Y}")
print(f"Completado con ContaNet: {ventas[ventas.origen=='contanet'].fecha.dt.date.nunique()} días hasta {ventas.fecha.max():%d/%m/%Y}")
(ventas.groupby("tienda")
   .agg(desde=("fecha", "min"), hasta=("fecha", "max"), dias=("fecha", "nunique"), venta=("venta", "sum"))
   .sort_values("venta", ascending=False).style.format({"venta": "S/ {:,.0f}", "desde": "{:%d/%m/%Y}", "hasta": "{:%d/%m/%Y}"}))"""),
    md("## 2. Venta diaria total (todas las tiendas)\nLínea fina = cada día; línea gruesa = promedio de 7 días."),
    code("""dia = ventas.groupby("fecha").venta.sum().asfreq("D", fill_value=0)
fig, ax = plt.subplots()
ax.plot(dia.index, dia, color=GRIS, lw=.6)
ax.plot(dia.index, dia.rolling(7).mean(), color=NARANJA, lw=2, label="promedio 7 días")
ax.yaxis.set_major_formatter(miles); ax.set_title("Venta diaria · tiendas · S/"); ax.legend(); plt.show()"""),
    md("## 3. 2026 contra 2025, mes a mes\nMeses completos; el mes en curso se compara hasta el mismo día."),
    code("""ultimo = dia.index.max()
m = dia.to_frame("venta"); m["anio"], m["mes"], m["d"] = m.index.year, m.index.month, m.index.day
corte = lambda x: x[(x.mes < ultimo.month) | ((x.mes == ultimo.month) & (x.d <= ultimo.day))]
t = corte(m).pivot_table(index="mes", columns="anio", values="venta", aggfunc="sum")
t["crecimiento"] = t[2026] / t[2025] - 1
t.style.format({2025: "S/ {:,.0f}", 2026: "S/ {:,.0f}", "crecimiento": "{:+.1%}"}, na_rep="—")"""),
    code("""fig, ax = plt.subplots()
x = np.arange(len(t)); ax.bar(x - .2, t[2025], .4, color=GRIS, label="2025"); ax.bar(x + .2, t[2026], .4, color=NARANJA, label="2026")
ax.set_xticks(x, ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][:len(t)])
ax.yaxis.set_major_formatter(miles); ax.set_title("Venta por mes · 2025 vs 2026"); ax.legend(); plt.show()"""),
    md("## 4. Día de la semana\nÍndice = venta del día ÷ promedio de su semana (1.00 = día promedio). Muestra qué días pesan más."),
    code("""s = dia[dia > 0].to_frame("venta"); s["semana"] = s.index.to_period("W"); s["dia"] = s.index.dayofweek
s["indice"] = s.venta / s.groupby("semana").venta.transform("mean")
ind = s.groupby("dia").indice.agg(["mean", "std"]); ind.index = ["lun","mar","mié","jue","vie","sáb","dom"]
ax = ind["mean"].plot.bar(color=NARANJA, yerr=ind["std"], capsize=3, title="Índice por día de la semana (barra = dispersión)")
ax.axhline(1, color=CAFE, lw=1); plt.show(); ind.round(2)"""),
    md("## 5. Día del mes (quincenas y fin de mes)\nÍndice del día del mes vs el promedio de su mes."),
    code("""s["mes"] = s.index.to_period("M"); s["dmes"] = s.index.day
s["ind_mes"] = s.venta / s.groupby("mes").venta.transform("mean")
dm = s.groupby("dmes").ind_mes.mean()
ax = dm.plot.bar(color=[NARANJA if d in (1, 2, 15, 16, 30, 31) else GRIS for d in dm.index], title="Índice por día del mes (naranja: quincena y fin/inicio de mes)")
ax.axhline(1, color=CAFE, lw=1); plt.show()"""),
    md("## 6. Tiendas: tamaño y crecimiento"),
    code("""tm = ventas.assign(anio=ventas.fecha.dt.year, mes=ventas.fecha.dt.month, d=ventas.fecha.dt.day)
tm = corte(tm).pivot_table(index="tienda", columns="anio", values="venta", aggfunc="sum")
tm["crecimiento"] = tm[2026] / tm[2025] - 1; tm["% 2026"] = tm[2026] / tm[2026].sum()
tm.sort_values(2026, ascending=False).style.format({2025: "S/ {:,.0f}", 2026: "S/ {:,.0f}", "crecimiento": "{:+.1%}", "% 2026": "{:.1%}"}, na_rep="—")"""),
    md("""## 7. Línea base: la regla simple actual
**Pronóstico = venta del mismo día de la semana del año pasado (364 días antes) × crecimiento de las últimas 4 semanas**
(últimas 4 semanas de este año ÷ las mismas 4 semanas del año pasado). Se prueba día por día de julio a septiembre 2026
usando solo lo que se sabía antes de ese día. **El modelo tiene que ganarle a esta regla.**"""),
    code("""def regla(f):
    ly = dia.get(f - pd.Timedelta(days=364))
    num = dia[f - pd.Timedelta(days=28): f - pd.Timedelta(days=1)].sum()
    den = dia[f - pd.Timedelta(days=392): f - pd.Timedelta(days=365)].sum()
    return ly * num / den if ly and den else np.nan

prueba = pd.DataFrame({"real": dia["2026-07-01":"2026-09-30"]})
prueba = prueba[prueba.real > 0]
prueba["pronostico"] = [regla(f) for f in prueba.index]
prueba["error"] = (prueba.pronostico - prueba.real).abs() / prueba.real
print(f"Error medio: {prueba.error.mean():.1%}  ·  precisión: {1 - prueba.error.mean():.1%}  ·  días: {prueba.error.notna().sum()}")
prueba.groupby(prueba.index.month).error.mean().rename(lambda x: ["Jul","Ago","Sep"][x-7]).map("{:.1%}".format)"""),
    code("""fig, ax = plt.subplots()
ax.plot(prueba.index, prueba.real, color=NARANJA, lw=2, label="real")
ax.plot(prueba.index, prueba.pronostico, color=GRIS, lw=1.5, ls="--", label="pronóstico (regla)")
ax.yaxis.set_major_formatter(miles); ax.set_title("Real vs pronóstico de la regla · jul–sep 2026"); ax.legend(); plt.show()
prueba.sort_values("error", ascending=False).head(8).style.format({"real": "S/ {:,.0f}", "pronostico": "S/ {:,.0f}", "error": "{:.1%}"})"""),
    md("""## Qué mirar
- **Sección 4 y 5:** si el día de la semana y la quincena mueven mucho la venta, el modelo debe usarlos como variables.
- **Sección 7:** los días con mayor error (feriados, fechas que cambiaron de día de la semana) dicen qué le falta a la regla.
- Siguiente cuaderno: `02_modelo.ipynb`, con las variables y la comparación contra esta línea base."""),
]
nb = nbf.v4.new_notebook(cells=celdas, metadata={"kernelspec": {"name": "python3", "display_name": "Python 3", "language": "python"}})
nbf.write(nb, Path(__file__).with_name("01_exploracion.ipynb"))
print("ok")
