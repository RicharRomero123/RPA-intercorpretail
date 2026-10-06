// Formato de cada archivo que se sube a la web: columnas que lee el cargador (lib/cargas.ts) y plantilla descargable.
// Las plantillas viven en public/formatos y se generan con rpa/crear_formatos.py (mismas columnas que aquí).
import type { Tipo } from "./cargas";

export type Formato = {
  nombre: string;
  /** Plantilla en Excel para descargar; null cuando el archivo sale tal cual de un sistema (ContaNet). */
  plantilla: string | null;
  origen: string;
  columnas: string[];
  obligatorias: string[];
  /** Qué se reemplaza al cargar: así un mismo reporte subido dos veces no duplica la venta. */
  reemplazo: string;
};

export const FORMATOS: Record<Tipo, Formato> = {
  contanet: {
    nombre: "Reporte detallado de ContaNet", plantilla: null,
    origen: "Se exporta tal cual desde ContaNet: Reporte detallado de ventas, filtros en TODOS, moneda SOLES, guardado como .xlsx. No se arma a mano.",
    columnas: ["Fecha", "Tipo-Serie-Núm. C.", "RUC o DNI", "Cliente", "Código Comercial", "Modelo", "Und. Vendidas", "P. Unit", "Precio Total",
      "Cond. Pago", "Usuario", "Cód. Vendedor"],
    obligatorias: ["Fecha", "Tipo-Serie-Núm. C.", "Código Comercial", "Und. Vendidas", "Precio Total", "Usuario"],
    reemplazo: "todo el rango de fechas de la cabecera del reporte",
  },
  tiendas: {
    nombre: "Power BI de tiendas", plantilla: "/formatos/Formato - Power BI de tiendas.xlsx",
    origen: "Excel «AVANCE DE VENTA» de cada tienda: hoja llamada «Data», títulos en la fila 1, una fila por día, producto y tipo de precio.",
    columnas: ["SUCURSAL", "CANAL", "Fecha", "CODIGO", "COD. SECUNDARIO", "Tipo de Precio", "Categoría-Cliente", "Tienda-Cantidad", "Tienda-Total Venta S/"],
    obligatorias: ["SUCURSAL", "CANAL", "Fecha", "CODIGO", "COD. SECUNDARIO", "Tipo de Precio", "Categoría-Cliente", "Tienda-Cantidad", "Tienda-Total Venta S/"],
    reemplazo: "por cada tienda del archivo, desde su primer hasta su último día",
  },
  retail: {
    nombre: "Ventas retail (despachos a cadenas)", plantilla: "/formatos/Formato - Ventas retail.xlsx",
    origen: "Excel «Ventas RETAIL»: una fila por despacho a cada cadena (SPSA, OXXO, Tottus, etc.).",
    columnas: ["RAZON SOCIAL EMISOR", "RUC", "RAZON SOCIAL CLIENTE", "CANTIDAD", "PRECIO UNITARIO", "TIPO DE VENTA", "SKU", "PRODUCTO",
      "MONTO CANCELADO", "CONDICION DE PAGO", "DIRECCION", "DETALLE DE DESPACHO", "DIA DE DESPACHO", "STATUS"],
    obligatorias: ["RAZON SOCIAL CLIENTE", "CANTIDAD", "SKU", "MONTO CANCELADO", "DIA DE DESPACHO"],
    reemplazo: "por cada cliente del archivo, desde su primer hasta su último despacho",
  },
  virtual: {
    nombre: "Ventas virtuales (Lima delivery y Provincia)", plantilla: "/formatos/Formato - Ventas virtuales.xlsx",
    origen: "Reporte de ventas virtuales: una fila por producto de cada comprobante. Canal = DELIVERY (Lima) o PROVINCIA.",
    columnas: ["MES", "Fecha Registro", "Nro Comprobante", "Tercero", "Documento", "Código", "Descripción", "Cantidad", "Precio Unitario",
      "Total Linea", "Medio pago", "Canal", "Distrito", "Provincia", "Departamento", "Salió de", "Observación"],
    obligatorias: ["Fecha Registro", "Nro Comprobante", "Total Linea", "Canal", "Departamento"],
    reemplazo: "todo el rango de fechas del archivo",
  },
  oxxo: {
    nombre: "Reporte diario de OXXO (sell-out por tienda)", plantilla: "/formatos/Formato - Reporte diario OXXO.xlsx",
    origen: "Lo manda OXXO cada día («…_PROVEEDORES_DIARIO_aaaammdd.xlsx»): una fila por tienda y producto con venta, unidades y stock. Se sube tal cual; se pueden subir varios días a la vez. El «ACUMULADO MENSUAL» no sirve: no trae stock.",
    columnas: ["FECHA", "NOMBRE", "DISTRITO", "CLUSTER", "SUPERGRUPO", "CATEGORIA", "SUBCATEGORIA", "ESTADO DEL CODIGO", "EAN", "DESCRIPCION",
      "Ventas netas(sin IGV)", "Unidades vendidas netas", "STOCK"],
    obligatorias: ["FECHA", "NOMBRE", "DISTRITO", "CLUSTER", "EAN", "DESCRIPCION", "Ventas netas(sin IGV)", "Unidades vendidas netas", "STOCK"],
    reemplazo: "los días del archivo (venta por tienda, por producto y stock)",
  },
};
