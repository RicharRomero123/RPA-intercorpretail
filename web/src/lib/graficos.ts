// Estilo común de todos los gráficos (Recharts), para que se lean igual en todo el sitio:
// - ejes en gris, sin líneas de eje ni marcas; rejilla fina y continua solo en la dirección del valor (Few: tinta mínima);
// - real/hoy en naranja, comparación (año o semana anterior) en gris punteado, meta en contorno (IBCS);
// - montos abreviados igual en todos lados («S/ 1.2 M», «S/ 350 mil»).
import type { CSSProperties } from "react";

export const EJE = { fontSize: 12, fill: "var(--tenue)" };
/** Rejilla: solo líneas guía finas, sin trazo punteado. */
export const GRILLA = { stroke: "var(--linea)", strokeOpacity: 0.8 };
/** Recuadro al pasar el mouse. */
export const CAJA: CSSProperties = {
  background: "var(--superficie)", border: "1px solid var(--linea)", borderRadius: 8, fontSize: 12.5,
  boxShadow: "0 6px 20px rgb(0 0 0 / 0.08)", padding: "8px 10px",
};
export const LEYENDA: CSSProperties = { fontSize: 12, paddingTop: 6 };
/** Comparación: gris punteado. */
export const PUNTEADO = "5 4";
/** Barras con esquinas apenas redondeadas. */
export const RADIO_V: [number, number, number, number] = [3, 3, 0, 0];
export const RADIO_H: [number, number, number, number] = [0, 3, 3, 0];

/** Monto corto para ejes y etiquetas: 1.2 M, 350 mil, 820. */
export const compacto = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toLocaleString("es-PE", { maximumFractionDigits: 1 })} M`;
  if (a >= 1e3) return `${Math.round(v / 1e3).toLocaleString("es-PE")} mil`;
  return Math.round(v).toLocaleString("es-PE");
};
