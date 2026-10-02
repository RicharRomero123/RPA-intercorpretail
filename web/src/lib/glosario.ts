/**
 * Explicación de cada indicador, en lenguaje simple, con la fórmula exacta que usa la página.
 * Se muestra en el ícono de información (ⓘ) junto a indicadores, gráficos y columnas.
 * Si cambia un cálculo en kpi.ts, hay que actualizar aquí su fórmula.
 */
export type Explicacion = { titulo: string; que: string; formula: string; ejemplo?: string; uso: string };

export const GLOSARIO = {
  venta: {
    titulo: "Venta al público",
    que: "Lo que pagaron los clientes en caja por nuestros productos en los locales de Supermercados Peruanos.",
    formula: "Suma de la venta al público de cada local y día del periodo (columna de venta al público del portal).",
    uso: "Mide el tamaño del negocio en el canal. Si sube, los clientes están comprando más.",
  },
  ingreso: {
    titulo: "Ingreso Calderón",
    que: "Lo que Supermercados Peruanos le paga a Calderón por las unidades que se vendieron (el precio de compra del supermercado).",
    formula: "Suma de la «venta a costo» de cada local y día del periodo (columna de venta a costo del portal).",
    uso: "Es el ingreso real de Calderón en este canal. Es el número que importa para la empresa.",
  },
  margen: {
    titulo: "Margen SPSA",
    que: "Lo que gana el supermercado por vender nuestros productos. No es la ganancia de Calderón.",
    formula: "Venta al público − Ingreso Calderón.  En %: margen ÷ venta al público.",
    ejemplo: "Venta S/ 100 y costo S/ 70 → margen S/ 30, es decir 30%.",
    uso: "Sirve para negociar: si el supermercado gana poco con un producto, tiende a darle menos espacio.",
  },
  unidades: {
    titulo: "Unidades vendidas",
    que: "Cantidad de cajas vendidas a clientes en los locales.",
    formula: "Suma de las unidades vendidas de cada local y día del periodo.",
    uso: "Muestra el volumen real, sin el efecto de cambios de precio.",
  },
  rotacion: {
    titulo: "Unidades por local por semana (rotación)",
    que: "Cuánto vende, en promedio, cada local donde el producto tuvo venta, en una semana. Compara locales grandes y chicos en igualdad.",
    formula: "Unidades ÷ locales con venta ÷ (días con datos ÷ 7).",
    ejemplo: "700 unidades en 50 locales durante 14 días → 700 ÷ 50 ÷ 2 = 7 unidades por local por semana.",
    uso: "Es el indicador que usa el supermercado para decidir si mantiene o retira un producto. Alta rotación = argumento para pedir más locales.",
  },
  instock: {
    titulo: "Instock",
    que: "Porcentaje de locales que tienen el producto disponible en el estante.",
    formula: "Locales-producto con inventario mayor a 0 ÷ locales-producto que reporta el portal (último día cargado).",
    ejemplo: "200 de 208 con stock → 96.2%.",
    uso: "Si baja, hay clientes que no encuentran el producto: es venta que se pierde. Lo ideal es estar cerca de 100%.",
  },
  cobertura: {
    titulo: "Semanas de cobertura",
    que: "Para cuántas semanas alcanza el stock que hay hoy en los locales, si se sigue vendiendo al mismo ritmo.",
    formula: "Inventario actual ÷ (venta promedio por día de los últimos N días × 7).  N = 14 por defecto (Filtros → Parámetros).",
    ejemplo: "1,400 unidades en tienda y se venden 20 por día → 1,400 ÷ 140 = 10 semanas.",
    uso: "Poca cobertura = riesgo de quiebre, hay que reponer. Mucha cobertura = sobrestock: conviene no enviar más o mover el producto.",
  },
  perdida: {
    titulo: "Venta perdida por quiebres",
    que: "Venta estimada que se deja de hacer cada día en locales que se quedaron sin stock pero que venían vendiendo.",
    formula: "Por cada quiebre: unidades vendidas por día (últimos N días) × precio promedio de venta del producto. Luego se suman.",
    uso: "Pone en soles el costo de no reponer a tiempo. Ayuda a priorizar qué locales abastecer primero.",
  },
  variacion: {
    titulo: "Variación",
    que: "Cuánto subió o bajó el número frente al periodo de comparación elegido en los filtros.",
    formula: "(Valor del periodo ÷ valor de la comparación) − 1.",
    ejemplo: "S/ 120 frente a S/ 100 → +20%.",
    uso: "Verde = mejoró, rojo = empeoró. Revisa siempre contra qué fechas se compara (aparece debajo del título).",
  },
  mix: {
    titulo: "Mix por producto",
    que: "Qué parte de la venta aporta cada producto.",
    formula: "Venta del producto ÷ venta total del periodo.",
    uso: "Muestra qué formato empuja el negocio y si depende de uno solo.",
  },
  precio: {
    titulo: "Precio promedio al público",
    que: "El precio al que, en promedio, se vendió cada unidad al cliente.",
    formula: "Venta al público ÷ unidades vendidas.",
    uso: "Si baja sin que hayas cambiado el precio, probablemente hubo promociones o descuentos del supermercado.",
  },
  evolucion: {
    titulo: "Venta en el tiempo",
    que: "La venta al público de cada día, semana o mes del periodo elegido.",
    formula: "Suma de la venta al público de todos los locales, agrupada por día, semana (desde el lunes) o mes. La línea punteada es el periodo de comparación, alineado por posición (día 1 con día 1).",
    uso: "Permite ver tendencias, días fuertes y el efecto de acciones comerciales.",
  },
  ventaCadena: {
    titulo: "Venta por cadena",
    que: "Cuánto se vende en cada cadena de Supermercados Peruanos (Plaza Vea, Makro, Vivanda…).",
    formula: "Suma de la venta al público de los locales de cada cadena. La cadena se deduce del nombre del local.",
    uso: "Muestra dónde está concentrado el negocio y en qué cadena crecer.",
  },
  zona: {
    titulo: "Zona",
    que: "Si el local está en Lima o en provincia.",
    formula: "Se asigna según el nombre del local (tabla de zonas del proyecto). «Por confirmar» = falta asignarla.",
    uso: "Compara el desempeño en Lima y provincias para decidir dónde expandirse.",
  },
  locales: {
    titulo: "Locales con venta",
    que: "Cantidad de locales que vendieron al menos una unidad en el periodo.",
    formula: "Locales distintos con unidades vendidas mayores a 0.",
    uso: "Mide el alcance real del producto en la cadena.",
  },
  estadoStock: {
    titulo: "Estado del stock",
    que: "Clasificación de cada local-producto según cuánto le dura el inventario.",
    formula: "Quiebre: inventario 0 · Sin movimiento: tiene stock pero no vendió en N días · Cobertura baja: menos de 2 semanas · Sobrestock: más de 13 semanas · Normal: entre ambos. Los límites se cambian en Filtros → Parámetros.",
    uso: "Indica qué hacer en cada local: reponer, activar la venta o dejar de enviar.",
  },
  ventaDia: {
    titulo: "Venta por día (N días)",
    que: "Ritmo de venta reciente del local: cuántas unidades vende en un día promedio.",
    formula: "Unidades vendidas en los últimos N días ÷ N.  N = 14 por defecto (Filtros → Parámetros).",
    uso: "Es la base para calcular la cobertura y la venta perdida.",
  },
  volumenValor: {
    titulo: "Volumen vs valor",
    que: "Compara cuánto se vende en unidades con cuánto dinero deja. Cada punto es una cadena, zona, local o producto.",
    formula: "Horizontal: unidades vendidas. Vertical: ingreso Calderón por caja (ingreso ÷ unidades). Tamaño del punto: ingreso total. Las líneas punteadas son la mediana de cada eje (el valor del medio) y parten el gráfico en 4 cuadrantes.",
    uso: "Estrellas: cuidarlas. Volumen: venden mucho pero dejan poco por unidad → subir el valor (mix, precio). Valor: dejan mucho por unidad pero venden poco → ganar volumen (exhibición, stock). Por desarrollar: revisar si conviene seguir.",
  },
  ingresoUnidad: {
    titulo: "Ingreso por unidad",
    que: "Cuánto dinero recibe Calderón, en promedio, por cada caja vendida en ese lugar.",
    formula: "Ingreso Calderón ÷ unidades vendidas.",
    ejemplo: "S/ 7,000 de ingreso con 700 cajas → S/ 10 por caja.",
    uso: "Si es más alto que el promedio, ahí se vende una mezcla de mayor valor (por ejemplo, más cajas grandes).",
  },
  brecha: {
    titulo: "Diferencia valor − volumen",
    que: "Compara su parte del dinero con su parte de las unidades.",
    formula: "% del ingreso total − % de las unidades totales (en puntos porcentuales).",
    ejemplo: "Aporta 20% del ingreso con 15% de las unidades → +5 pts: deja más dinero del que su volumen haría esperar.",
    uso: "Positivo = vende productos de mayor valor. Negativo = vende mucho pero de menor valor: oportunidad de mejorar el mix.",
  },
  cargas: {
    titulo: "Cargas",
    que: "Registro de cada día que el robot descargó del portal de Intercorp.",
    formula: "«producto» = tabla del portal por producto; «local» = detalle por local. El detalle solo se guarda si su suma cuadra al céntimo con el TOTAL del portal.",
    uso: "Permite comprobar que los datos están completos y al día.",
  },
  // ------------------------------------------------------------- módulo Tiendas
  tVenta: {
    titulo: "Venta de tiendas",
    que: "Lo que se vendió en caja en las tiendas propias de Calderón.",
    formula: "Suma de la columna «Tienda-Total Venta S/» de los Excel de venta diaria de cada tienda (carpeta «01. Ventas Diarias»), la misma que usa el Power BI.",
    uso: "Es el ingreso del canal Tiendas. Cuadra al céntimo con el Power BI.",
  },
  tUnidades: {
    titulo: "Unidades vendidas",
    que: "Cantidad de productos vendidos en las tiendas.",
    formula: "Suma de la columna «Tienda-Cantidad» de los Excel de venta diaria.",
    uso: "Muestra el volumen real, sin el efecto de cambios de precio.",
  },
  tPrecio: {
    titulo: "Precio promedio por unidad",
    que: "A cuánto se vendió, en promedio, cada unidad.",
    formula: "Venta ÷ unidades.",
    ejemplo: "S/ 1,000 con 40 unidades → S/ 25 por unidad.",
    uso: "Si baja, se está vendiendo más al por mayor, con precios especiales o más productos baratos.",
  },
  tVentaDia: {
    titulo: "Venta promedio por día",
    que: "Cuánto vende en un día normal de atención.",
    formula: "Venta ÷ días con venta. En el total de todas las tiendas: venta total ÷ días del periodo con venta.",
    uso: "Compara tiendas o periodos de distinto largo en igualdad (por ejemplo, una tienda que abrió a mitad de mes).",
  },
  tTipoPrecio: {
    titulo: "Tipo de precio",
    que: "Con qué lista de precios se hizo la venta: Unidad (público), Mayor (mayorista), especiales, trabajadores…",
    formula: "Suma de la venta según la columna «Tipo de Precio» del Excel.",
    uso: "Muestra cuánto del negocio es venta al público y cuánto es venta al por mayor o con precio especial.",
  },
  tEvolucion: {
    titulo: "Venta en el tiempo",
    que: "La venta de cada día, semana o mes del periodo elegido.",
    formula: "Suma de la venta de las tiendas elegidas, agrupada por día, semana (desde el lunes) o mes. La línea punteada es el periodo de comparación, alineado por fecha equivalente (el 12/09/2026 con el 12/09/2025 si se compara con el año anterior).",
    uso: "Permite ver la temporada, días fuertes y cómo va frente al año pasado.",
  },
  tCruce: {
    titulo: "Producto por tienda",
    que: "Cuánto vende cada tienda de cada producto.",
    formula: "Suma de la venta por producto y tienda en el periodo.",
    uso: "Muestra qué producto funciona en qué tienda, para ajustar el surtido y la reposición.",
  },
} satisfies Record<string, Explicacion>;

export type ClaveGlosario = keyof typeof GLOSARIO;
