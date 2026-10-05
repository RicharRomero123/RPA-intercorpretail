/**
 * Lectura de los Excel que se suben en Configuración → Cargar datos. Corre en el navegador (el archivo no viaja entero
 * al servidor) y aplica las mismas reglas que los lectores en Python:
 *   - ContaNet «Reporte detallado» (rpa-proyect/src/erp.py): cabecera con rango de fechas y filtros, una fila por línea
 *     de comprobante y la fila TOTAL GENERAL para verificar. Reemplaza todo el rango de fechas de la cabecera.
 *   - Venta diaria de tiendas (rpa/tiendas_excel.py): hoja «Data» con 9 columnas. Reemplaza, por cada tienda del
 *     archivo, desde su primer hasta su último día.
 *   - Ventas retail de Calderón (OXXO y otros clientes retail): una fila por despacho, con RAZON SOCIAL CLIENTE, SKU,
 *     CANTIDAD, MONTO CANCELADO y DÍA DE DESPACHO. Reemplaza, por cada cliente del archivo, desde su primer hasta su
 *     último despacho. Cada cliente se asigna a un tipo de retail en la vista previa.
 *   - Ventas virtuales (rpa/digital_excel.py): hoja con Nro Comprobante, Canal (DELIVERY/PROVINCIA), Distrito, Provincia y
 *     Departamento. Clasifica el canal digital de ContaNet en Lima y Provincia. Reemplaza el rango de fechas del archivo.
 *   - Reporte diario de OXXO (rpa/oxxo_excel.py): sell-out por tienda y EAN con venta, unidades y stock. Reemplaza los días
 *     del archivo (venta por tienda, por producto y stock).
 */
import { abrirXls, abrirXlsx, esXls, type Celda, type Libro } from "./xlsx";

export type Tipo = "contanet" | "tiendas" | "retail" | "virtual" | "oxxo";
export type Aviso = { nivel: "ok" | "aviso" | "error"; texto: string };
export type Rango = { tienda: string | null; desde: string; hasta: string };
export type ResumenTienda = { tienda: string; desde: string; hasta: string; filas: number; und: number; venta: number };
export type Pendiente = { codigo: string; detalle: string; filas: number; venta: number };
export type Fila = Record<string, string | number | null>;
export type Lectura = {
  tipo: Tipo; archivo: string; desde: string; hasta: string; rangos: Rango[];
  filas: Fila[]; und: number; venta: number; porTienda: ResumenTienda[];
  avisos: Aviso[]; pendientes: Pendiente[]; puedeCargar: boolean;
  /** Solo retail: clientes del archivo (se les asigna un tipo de retail antes de cargar). */
  clientes?: { cliente: string; ruc: string }[];
};
export type Equivalencia = { sistema: string; codigo: string; sku: string };

export class ErrorArchivo extends Error {}

// ------------------------------------------------------------------ utilidades
const texto = (v: Celda) => (v === null ? "" : v instanceof Date ? v.toISOString() : String(v)).trim().replace(/\s+/g, " ");
const diaISO = (d: Date) => d.toISOString().slice(0, 10);
const redondear = (x: number, dec: number) => Math.round(x * 10 ** dec) / 10 ** dec;
const numero = (v: Celda): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v.trim()))) return Number(v.trim());
  return null;
};
/** Fecha de celda: fecha de Excel, número de serie o texto dd/mm/aaaa. */
function fechaDe(v: Celda): string | null {
  if (v instanceof Date) return diaISO(v);
  if (typeof v === "number" && v > 20000 && v < 80000) return diaISO(new Date(Math.round((v - 25569) * 86_400_000)));
  const m = typeof v === "string" ? v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/) : null;
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}
const fmt = (x: number, d = 2) => x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

function resumirPorTienda(filas: Fila[], clave: string, grupo = "tienda"): ResumenTienda[] {
  const m = new Map<string, ResumenTienda>();
  for (const f of filas) {
    const t = String(f[grupo]), dia = String(f.fecha);
    const r = m.get(t) ?? { tienda: t, desde: dia, hasta: dia, filas: 0, und: 0, venta: 0 };
    r.filas += 1; r.und += Number(f.und ?? 0); r.venta += Number(f[clave] ?? 0);
    if (dia < r.desde) r.desde = dia;
    if (dia > r.hasta) r.hasta = dia;
    m.set(t, r);
  }
  return [...m.values()].map((r) => ({ ...r, und: redondear(r.und, 3), venta: redondear(r.venta, 4) })).sort((a, b) => b.venta - a.venta);
}

function listarPendientes(filas: Fila[], clave: string, detalle: (f: Fila) => string): Pendiente[] {
  const m = new Map<string, Pendiente>();
  for (const f of filas.filter((x) => !x.sku)) {
    const k = String(f.codigo ?? "(vacío)");
    const p = m.get(k) ?? { codigo: k, detalle: detalle(f), filas: 0, venta: 0 };
    p.filas += 1; p.venta += Number(f[clave] ?? 0);
    m.set(k, p);
  }
  return [...m.values()].sort((a, b) => b.venta - a.venta);
}

// ------------------------------------------------------------------ ContaNet
const COLUMNAS_CONTANET = {
  "Fecha": "fecha", "Tipo-Serie-Núm. C.": "comprobante", "RUC o DNI": "doc_cliente", "Cliente": "cliente",
  "Código Comercial": "codigo", "Modelo": "producto", "Und. Vendidas": "und", "P. Unit": "precio_unit",
  "Precio Total": "total", "Cond. Pago": "cond_pago", "Usuario": "usuario", "Cód. Vendedor": "vendedor",
} as const;
/** Usuario del ERP → tienda. Un usuario nuevo aparece con su código y un aviso hasta que se agregue aquí. */
export const USUARIOS_CONTANET: Record<string, string> = {
  ABANC01: "Abancay", GRANDA01: "Jose Granda", PANA01: "Pana Norte", SOL01: "Sol de Oro", SURCO01: "Surco",
  TIENDATR01: "Trinidad", TUPAC01: "Tupac", VENTAS01: "Canal digital",
};
const COMPROBANTES: Record<string, string> = { BOL: "Boleta", FAC: "Factura", NOC: "Nota de crédito", NOD: "Nota de débito", OTR: "Nota de venta" };
const FILTROS_TODOS = ["Marca:", "Línea:", "Modelo:", "Cliente:", "Vendedor:"];

function medioPago(cond: string) {
  if (cond.startsWith("TRANSFERENCIA")) return "Transferencia";
  if (cond === "VISA") return "Tarjeta";
  if (cond === "CONTADO") return "Contado";
  return cond.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

function leerContaNet(archivo: string, filas: Celda[][], eq: Equivalencia[], skus: Set<string>): Lectura {
  const iTitulos = filas.findIndex((f) => texto(f[0] ?? null) === "Fecha");
  if (iTitulos < 0) throw new ErrorArchivo("No se encontró la fila de títulos (columna «Fecha»).");
  const cabecera = filas.slice(0, iTitulos);
  const fechas = cabecera.flat().filter((v): v is Date => v instanceof Date).map(diaISO).sort();
  if (fechas.length < 2) throw new ErrorArchivo("No se encontró el rango de fechas en la cabecera del reporte.");
  const desde = fechas[0], hasta = fechas[fechas.length - 1];

  const filtros: Record<string, string> = {};
  for (const f of cabecera) {
    const vals = f.filter((v) => v !== null && texto(v) !== "");
    vals.forEach((v, i) => { if (typeof v === "string" && v.trim().endsWith(":") && i + 1 < vals.length) filtros[v.trim()] = texto(vals[i + 1]); });
  }
  const aplicados = FILTROS_TODOS.filter((k) => filtros[k] && filtros[k].toUpperCase() !== "TODOS");
  if (aplicados.length) {
    throw new ErrorArchivo(`El reporte se exportó con filtros (${aplicados.map((k) => `${k} ${filtros[k]}`).join(", ")}). Expórtalo con TODOS.`);
  }
  if ((filtros["Moneda:"] ?? "SOLES").toUpperCase() !== "SOLES") throw new ErrorArchivo(`El reporte está en ${filtros["Moneda:"]}; expórtalo en SOLES.`);

  const pos: Record<string, number> = {};
  filas[iTitulos].forEach((t, i) => { if (t !== null && !(texto(t) in pos)) pos[texto(t)] = i; });
  const faltan = Object.keys(COLUMNAS_CONTANET).filter((c) => !(c in pos));
  if (faltan.length) throw new ErrorArchivo(`Faltan columnas en el reporte: ${faltan.join(", ")}.`);
  const col = (f: Celda[], nombre: keyof typeof COLUMNAS_CONTANET) => f[pos[nombre]] ?? null;

  const cuerpo = filas.slice(iTitulos + 1);
  const lineas = cuerpo.filter((f) => f[0] instanceof Date);
  let totalUnd: number | null = null, totalVenta: number | null = null;
  for (const f of cuerpo.filter((x) => !(x[0] instanceof Date))) {
    const i = f.findIndex((v) => texto(v).toUpperCase() === "TOTAL GENERAL:");
    if (i >= 0) {
      const nums = f.slice(i + 1).filter((v): v is number => typeof v === "number");
      if (nums.length >= 2) [totalUnd, totalVenta] = nums;
      break;
    }
  }

  const porContaNet = new Map(eq.filter((e) => e.sistema === "ContaNet").map((e) => [e.codigo, e.sku]));
  const salida: Fila[] = lineas.map((f) => {
    const fh = new Date((f[0] as Date).getTime());
    const comprobante = texto(col(f, "Tipo-Serie-Núm. C."));
    const [tipo = "", serie = "", num = ""] = comprobante.split("/");
    let und = numero(col(f, "Und. Vendidas")) ?? 0, precio = numero(col(f, "P. Unit")) ?? 0, total = numero(col(f, "Precio Total")) ?? 0;
    if (tipo === "NOC") { und = -Math.abs(und); precio = Math.abs(precio); total = -Math.abs(total); }
    let doc = texto(col(f, "RUC o DNI")).replace(/\.0$/, "");
    if (/^\d{7}$/.test(doc)) doc = `0${doc}`;
    const clienteTxt = texto(col(f, "Cliente")).toUpperCase();
    const anonimo = doc === "" || doc === "0" || clienteTxt === "VARIOS";
    const codigo = texto(col(f, "Código Comercial")).toUpperCase();
    const cond = texto(col(f, "Cond. Pago")).toUpperCase();
    const usuario = texto(col(f, "Usuario"));
    return {
      fecha: diaISO(fh), fecha_hora: fh.toISOString().slice(0, 19), comprobante,
      tipo_comprobante: COMPROBANTES[tipo] ?? tipo, serie, numero: num,
      doc_cliente: anonimo ? "" : doc, tipo_doc_cliente: anonimo ? "" : doc.length === 8 ? "DNI" : doc.length === 11 ? "RUC" : "",
      cliente: anonimo ? "PÚBLICO GENERAL" : clienteTxt,
      // El código de ContaNet es el SKU oficial: si no tiene equivalencia (variantes que se unen), queda su propio código.
      codigo, sku: porContaNet.get(codigo) ?? codigo, producto: texto(col(f, "Modelo")),
      und: redondear(und, 3), precio_unit: redondear(precio, 4), total: redondear(total, 4),
      cond_pago: cond, medio_pago: medioPago(cond), usuario, tienda: USUARIOS_CONTANET[usuario] ?? usuario, vendedor: texto(col(f, "Cód. Vendedor")),
    };
  });

  const venta = redondear(salida.reduce((a, f) => a + Number(f.total), 0), 4);
  const und = redondear(salida.reduce((a, f) => a + Number(f.und), 0), 3);
  const undAbs = redondear(salida.reduce((a, f) => a + Math.abs(Number(f.und)), 0), 3);
  const avisos: Aviso[] = [{ nivel: "ok", texto: `Reporte detallado de ContaNet del ${fechaCorta(desde)} al ${fechaCorta(hasta)}, filtros en TODOS y en SOLES.` }];
  if (!salida.length) avisos.push({ nivel: "error", texto: "El reporte no tiene líneas de venta." });
  if (totalVenta === null || totalUnd === null) {
    avisos.push({ nivel: "aviso", texto: "El reporte no trae la fila TOTAL GENERAL: no se puede verificar que se leyó completo." });
  } else if (Math.abs(venta - totalVenta) > 0.01 || Math.abs(undAbs - totalUnd) > 0.001) {
    avisos.push({ nivel: "error", texto: `NO cuadra con el TOTAL GENERAL del reporte: se leyó S/ ${fmt(venta, 3)} y ${fmt(undAbs, 0)} und; el reporte dice S/ ${fmt(totalVenta, 3)} y ${fmt(totalUnd, 0)} und.` });
  } else {
    avisos.push({ nivel: "ok", texto: `Cuadra al céntimo con el TOTAL GENERAL del reporte: S/ ${fmt(totalVenta, 3)} · ${fmt(totalUnd, 0)} und.` });
  }
  const fuera = salida.filter((f) => String(f.fecha) < desde || String(f.fecha) > hasta).length;
  if (fuera) avisos.push({ nivel: "error", texto: `${fuera} líneas tienen fecha fuera del rango de la cabecera.` });
  const sinTienda = [...new Set(salida.map((f) => String(f.usuario)).filter((u) => !USUARIOS_CONTANET[u]))];
  if (sinTienda.length) avisos.push({ nivel: "aviso", texto: `Usuarios del ERP sin tienda asignada (quedan con su código): ${sinTienda.join(", ")}.` });
  const nuevos = [...new Map(salida.filter((f) => !porContaNet.has(String(f.codigo)) && !skus.has(String(f.codigo)))
    .map((f) => [String(f.codigo), `${f.codigo} (${f.producto})`])).values()];
  if (nuevos.length) avisos.push({ nivel: "aviso", texto: `Códigos de ContaNet que aún no están en el maestro de SKU (se cargan con su propio código): ${nuevos.join(", ")}.` });
  const nc = salida.filter((f) => f.tipo_comprobante === "Nota de crédito").length;
  if (nc) avisos.push({ nivel: "ok", texto: `${nc} líneas de notas de crédito: se guardan en negativo para que las sumas den la venta neta.` });

  return cerrar({
    tipo: "contanet", archivo, desde, hasta, rangos: [{ tienda: null, desde, hasta }], filas: salida, und, venta,
    porTienda: resumirPorTienda(salida, "total"), avisos,
    pendientes: listarPendientes(salida, "total", (f) => String(f.producto ?? "")),
  });
}

// ------------------------------------------------------------------ Tiendas
const COLUMNAS_TIENDAS = {
  "SUCURSAL": "tienda", "CANAL": "canal", "Fecha": "fecha", "CODIGO": "codigo", "COD. SECUNDARIO": "codigo_corto",
  "Tipo de Precio": "tipo_precio", "Categoría-Cliente": "categoria_cliente", "Tienda-Cantidad": "und", "Tienda-Total Venta S/": "venta",
} as const;

function leerTiendas(archivo: string, filas: Celda[][], eq: Equivalencia[]): Lectura {
  const pos: Record<string, number> = {};
  (filas[0] ?? []).forEach((t, i) => { if (t !== null && !(texto(t) in pos)) pos[texto(t)] = i; });
  const faltan = Object.keys(COLUMNAS_TIENDAS).filter((c) => !(c in pos));
  if (faltan.length) throw new ErrorArchivo(`A la hoja «Data» le faltan columnas: ${faltan.join(", ")}.`);
  const col = (f: Celda[], nombre: keyof typeof COLUMNAS_TIENDAS) => f[pos[nombre]] ?? null;

  const porCodigo = new Map(eq.filter((e) => e.sistema === "Power BI").map((e) => [e.codigo, e.sku]));
  const porCorto = new Map(eq.filter((e) => e.sistema === "Código corto").map((e) => [e.codigo, e.sku]));
  const cod = (v: Celda) => { const s = texto(v).replace(/\.0$/, ""); return s === "" ? null : s; };
  let conTexto = 0, sinFecha = 0;
  const salida: Fila[] = [];
  for (const f of filas.slice(1)) {
    const celdas = Object.keys(COLUMNAS_TIENDAS).map((c) => col(f, c as keyof typeof COLUMNAS_TIENDAS));
    if (celdas.every((v) => v === null || texto(v) === "")) continue; // fila vacía
    const fecha = fechaDe(col(f, "Fecha"));
    if (!fecha) { sinFecha += 1; continue; }
    const undC = col(f, "Tienda-Cantidad"), ventaC = col(f, "Tienda-Total Venta S/");
    const und = numero(undC), venta = numero(ventaC);
    if (venta === null && ventaC !== null && texto(ventaC) !== "") conTexto += 1;
    const codigo = cod(col(f, "CODIGO")), corto = cod(col(f, "COD. SECUNDARIO"));
    const skuCodigo = codigo ? porCodigo.get(codigo) : undefined;
    const skuCorto = !skuCodigo && corto ? porCorto.get(corto) : undefined;
    salida.push({
      fecha, tienda: texto(col(f, "SUCURSAL")) || null, canal: texto(col(f, "CANAL")) || null, codigo, codigo_corto: corto,
      sku: skuCodigo ?? skuCorto ?? null, origen_sku: skuCodigo ? "codigo" : skuCorto ? "codigo_corto" : "pendiente",
      tipo_precio: texto(col(f, "Tipo de Precio")), categoria_cliente: texto(col(f, "Categoría-Cliente")) || null,
      und: und === null ? null : redondear(und, 2), venta: venta === null ? null : redondear(venta, 2),
    });
  }
  const dias = salida.map((f) => String(f.fecha)).sort();
  const porTienda = resumirPorTienda(salida, "venta");
  const avisos: Aviso[] = [];
  if (!salida.length) avisos.push({ nivel: "error", texto: "La hoja «Data» no tiene filas de venta." });
  else avisos.push({ nivel: "ok", texto: `Hoja «Data» con las 9 columnas: ${porTienda.length} tienda(s) del ${fechaCorta(dias[0])} al ${fechaCorta(dias[dias.length - 1])}.` });
  if (sinFecha) avisos.push({ nivel: "error", texto: `${sinFecha} filas con datos pero sin fecha válida: corrígelas en el Excel.` });
  if (salida.some((f) => !f.tienda)) avisos.push({ nivel: "error", texto: "Hay filas sin SUCURSAL: corrígelas en el Excel." });
  if (conTexto) avisos.push({ nivel: "aviso", texto: `${conTexto} celdas de venta tienen texto (por ejemplo «-»): se toman como vacías, igual que el Power BI.` });

  return cerrar({
    tipo: "tiendas", archivo, desde: dias[0] ?? "", hasta: dias[dias.length - 1] ?? "",
    rangos: porTienda.map((t) => ({ tienda: t.tienda, desde: t.desde, hasta: t.hasta })), filas: salida,
    und: redondear(salida.reduce((a, f) => a + Number(f.und ?? 0), 0), 3),
    venta: redondear(salida.reduce((a, f) => a + Number(f.venta ?? 0), 0), 4),
    porTienda, avisos, pendientes: listarPendientes(salida, "venta", (f) => (f.codigo_corto ? `Código corto ${f.codigo_corto}` : "")),
  });
}

// ------------------------------------------------------------------ Retail (ventas de Calderón a clientes retail)
/** Encabezado normalizado: mayúsculas, sin tildes ni espacios dobles. */
const normal = (v: Celda) => texto(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
const COLUMNAS_RETAIL = {
  "RAZON SOCIAL EMISOR": "emisor", "RUC": "ruc", "RAZON SOCIAL CLIENTE": "cliente", "CANTIDAD": "und",
  "PRECIO UNITARIO": "precio_unitario", "TIPO DE VENTA": "tipo_venta", "SKU": "codigo", "PRODUCTO": "producto",
  "MONTO CANCELADO": "venta", "CONDICION DE PAGO": "condicion_pago", "DIRECCION": "direccion",
  "DETALLE DE DESPACHO": "detalle_despacho", "DIA DE DESPACHO": "fecha", "STATUS": "status",
} as const;
const OBLIGATORIAS_RETAIL = ["RAZON SOCIAL CLIENTE", "CANTIDAD", "SKU", "MONTO CANCELADO", "DIA DE DESPACHO"];
/** Monto o cantidad escritos como texto: «S/ 4,252.25», «1,560». */
const montoDe = (v: Celda): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = texto(v).replace(/S\/\.?/gi, "").replace(/[\s,]/g, "");
  return t !== "" && Number.isFinite(Number(t)) ? Number(t) : null;
};
const esRetail = (filas: Celda[][]) => filas.slice(0, 10).findIndex((f) => {
  const t = f.map(normal);
  return t.includes("RAZON SOCIAL CLIENTE") && t.includes("MONTO CANCELADO");
});

function leerRetail(archivo: string, filas: Celda[][], iTitulos: number, eq: Equivalencia[], skus: Set<string>): Lectura {
  const pos: Record<string, number> = {};
  filas[iTitulos].forEach((t, i) => { const k = normal(t); if (k && !(k in pos)) pos[k] = i; });
  const faltan = OBLIGATORIAS_RETAIL.filter((c) => !(c in pos));
  if (faltan.length) throw new ErrorArchivo(`Faltan columnas: ${faltan.join(", ")}.`);
  const col = (f: Celda[], nombre: keyof typeof COLUMNAS_RETAIL) => (nombre in pos ? f[pos[nombre]] ?? null : null);

  const porContaNet = new Map(eq.filter((e) => e.sistema === "ContaNet").map((e) => [e.codigo, e.sku]));
  let sinFecha = 0, sinCliente = 0, sinMonto = 0;
  const salida: Fila[] = [];
  for (const f of filas.slice(iTitulos + 1)) {
    const celdas = Object.keys(COLUMNAS_RETAIL).map((c) => col(f, c as keyof typeof COLUMNAS_RETAIL));
    if (celdas.every((v) => v === null || texto(v) === "")) continue;
    const fecha = fechaDe(col(f, "DIA DE DESPACHO"));
    const cliente = texto(col(f, "RAZON SOCIAL CLIENTE"));
    const monto = montoDe(col(f, "MONTO CANCELADO")), und = montoDe(col(f, "CANTIDAD"));
    if (!fecha) { sinFecha += 1; continue; }
    if (!cliente) { sinCliente += 1; continue; }
    if (monto === null) sinMonto += 1;
    const codigo = texto(col(f, "SKU")).toUpperCase() || null;
    const precio = montoDe(col(f, "PRECIO UNITARIO"));
    salida.push({
      fecha, emisor: texto(col(f, "RAZON SOCIAL EMISOR")) || null, ruc: texto(col(f, "RUC")).replace(/\.0$/, "") || null, cliente,
      und: und === null ? null : redondear(und, 3), precio_unitario: precio === null ? null : redondear(precio, 4),
      tipo_venta: texto(col(f, "TIPO DE VENTA")) || null, codigo,
      sku: codigo ? porContaNet.get(codigo) ?? (skus.has(codigo) ? codigo : null) : null, producto: texto(col(f, "PRODUCTO")) || null,
      venta: monto === null ? null : redondear(monto, 4), condicion_pago: texto(col(f, "CONDICION DE PAGO")) || null,
      direccion: texto(col(f, "DIRECCION")) || null, detalle_despacho: texto(col(f, "DETALLE DE DESPACHO")) || null,
      status: texto(col(f, "STATUS")) || null,
    });
  }
  const dias = salida.map((x) => String(x.fecha)).sort();
  const porCliente = resumirPorTienda(salida, "venta", "cliente");
  const clientes = porCliente.map((c) => ({ cliente: c.tienda, ruc: String(salida.find((x) => x.cliente === c.tienda)?.ruc ?? "") }));
  const avisos: Aviso[] = [];
  if (!salida.length) avisos.push({ nivel: "error", texto: "El archivo no tiene filas de venta." });
  else avisos.push({ nivel: "ok", texto: `Ventas retail: ${clientes.length} cliente(s), despachos del ${fechaCorta(dias[0])} al ${fechaCorta(dias[dias.length - 1])}.` });
  if (sinFecha) avisos.push({ nivel: "error", texto: `${sinFecha} filas sin DÍA DE DESPACHO válido: corrígelas en el Excel.` });
  if (sinCliente) avisos.push({ nivel: "error", texto: `${sinCliente} filas sin RAZON SOCIAL CLIENTE: corrígelas en el Excel.` });
  if (sinMonto) avisos.push({ nivel: "aviso", texto: `${sinMonto} filas sin MONTO CANCELADO: se cargan con monto vacío.` });
  const estados = [...new Set(salida.map((x) => String(x.status ?? "Sin estado")))];
  if (estados.length) avisos.push({ nivel: "ok", texto: `Estados en el archivo: ${estados.join(", ")}. Se cargan todos; en la web puedes filtrar por estado.` });

  return cerrar({
    tipo: "retail", archivo, desde: dias[0] ?? "", hasta: dias[dias.length - 1] ?? "",
    rangos: porCliente.map((c) => ({ tienda: c.tienda, desde: c.desde, hasta: c.hasta })), filas: salida,
    und: redondear(salida.reduce((a, x) => a + Number(x.und ?? 0), 0), 3),
    venta: redondear(salida.reduce((a, x) => a + Number(x.venta ?? 0), 0), 4),
    porTienda: porCliente, avisos, clientes,
    pendientes: listarPendientes(salida, "venta", (x) => String(x.producto ?? "")),
  });
}

// ------------------------------------------------------------------ Ventas virtuales (canal digital: Lima delivery y Provincia)
/** Hoja con las ventas virtuales: una fila por línea de comprobante del usuario VENTAS01, con su canal y zona.
 *  Mismas reglas que rpa/digital_excel.py. ContaNet es el monto oficial; este archivo solo clasifica cada comprobante. */
const OBLIGATORIAS_VIRTUAL = ["FECHA REGISTRO", "NRO COMPROBANTE", "TOTAL LINEA", "CANAL", "DEPARTAMENTO"];
const esVirtual = (filas: Celda[][]) => filas.slice(0, 5).findIndex((f) => {
  const t = f.map(normal);
  return OBLIGATORIAS_VIRTUAL.every((c) => t.includes(c));
});
const CANAL_VIRTUAL: Record<string, string> = { DELIVERY: "LIMA", PROVINCIA: "PROVINCIA" };
/** «B008-3140», «BOL/B008/00004837», «OTR/NV08/00000001» → ["B008", 3140]. */
function comprobanteDe(v: string): [string, number] | null {
  const m = v.trim().toUpperCase().match(/^(?:[A-Z]{3}\/)?([A-Z]{1,2}\d{2,3}|SN)[-/]0*(\d+)$/);
  return m ? [m[1], Number(m[2])] : null;
}
/** YAPE → Yape; BCP/BBVA → Transferencia; EFECTIVO → Contado (como en ContaNet). */
function medioDe(v: string): string {
  const t = v.toUpperCase();
  if (t.includes("YAPE")) return "Yape";
  if (t.includes("BCP") || t.includes("BBVA")) return "Transferencia";
  if (t.includes("EFECTIVO")) return "Contado";
  return v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : "";
}
/** «ica» → «Ica», «LA LIBERTAD» → «La Libertad», «PE-AMA» → «Amazonas». */
function lugarDe(v: string): string | null {
  if (!v) return null;
  if (v.toUpperCase() === "PE-AMA") return "Amazonas";
  return v.toLowerCase().split(" ").map((w, i) => (i && ["de", "del", "la", "las", "los", "el"].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}

/** SKU oficial a partir de la DESCRIPCIÓN (en el Excel virtual el mismo código se usó para productos distintos según el mes).
 *  Mismas reglas que rpa/digital_excel.py: si ninguna calza, queda sin SKU (pendiente), nunca uno adivinado. */
const REGLAS_SKU: [string[], string][] = [
  [["promocion", "30", "turroncitos", "ajonjoli"], "TUR12477"], [["promocion", "30", "turroncitos", "tradicional"], "TUR12478"],
  [["ramo", "san val"], "RTSV1116"], [["turroncito", "madre"], "TUR1110"], [["turroncito", "san valentin"], "TUR1111"],
  [["turroncito", "ajonjoli"], "TA1115"], [["turroncito", "tradicional"], "TT1114"], [["turron", "fiestas patrias"], "TFP1119"],
  [["turron", "ajonjoli", "900"], "TKA1111"], [["turron", "ajonjoli", "450"], "TMA1113"],
  [["turron", "tradicional", "950"], "TK1110"], [["turron", "tradicional", "500"], "TMT1112"],
  [["chocopaneton"], "CHP1126"], [["paneton", "ziploc"], "PZ1125"], [["paneton", "caja"], "PAN1124"], [["paneton", "bolsa"], "PB1124"],
  [["taper", "alfaj"], "ALFA1145"], [["alfajores", "taper"], "ALFA1145"], [["taper", "oreja"], "OREJA1146"], [["oreja", "taper"], "OREJA1146"],
  [["taper", "empanada"], "EMP1147"], [["taper", "milhoja"], "MH11152"], [["taper", "pionono"], "PIONONO1149"],
  [["empanada"], "EMP1132"], [["milhoja"], "MH1135"], [["rosquita"], "ROS1133"], [["pie de manzana"], "PYE1134"],
];
function skuPorDescripcion(desc: string): string | null {
  if (!desc) return null;
  const t = desc.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return REGLAS_SKU.find(([palabras]) => palabras.every((w) => t.includes(w)))?.[1] ?? null;
}

function leerVirtual(archivo: string, filas: Celda[][], iTitulos: number, eq: Equivalencia[], skus: Set<string>): Lectura {
  const pos: Record<string, number> = {};
  filas[iTitulos].forEach((t, i) => { const k = normal(t); if (k && !(k in pos)) pos[k] = i; });
  const col = (f: Celda[], nombre: string) => (nombre in pos ? f[pos[nombre]] ?? null : null);
  const porContaNet = new Map(eq.filter((e) => e.sistema === "ContaNet").map((e) => [e.codigo, e.sku]));
  const salida: Fila[] = [];
  let sinNumero = 0, sinFecha = 0;
  const malos = new Set<string>(), canales = new Set<string>();
  for (const f of filas.slice(iTitulos + 1)) {
    const fecha = fechaDe(col(f, "FECHA REGISTRO"));
    const total = numero(col(f, "TOTAL LINEA"));
    if (!fecha) { if (f.some((v) => texto(v) !== "")) sinFecha += 1; continue; }
    let nro = texto(col(f, "NRO COMPROBANTE"));
    if (!nro) { sinNumero += 1; nro = `SN-${sinNumero}`; }
    const sn = comprobanteDe(nro);
    if (!sn) { malos.add(nro); continue; }
    const canalTxt = texto(col(f, "CANAL")).toUpperCase();
    const canal = CANAL_VIRTUAL[canalTxt];
    if (!canal) { canales.add(canalTxt || "(vacío)"); continue; }
    const codigo = texto(col(f, "CODIGO")).toUpperCase() || null;
    const doc = texto(col(f, "DOCUMENTO")).replace(/\.0$/, "") || null;
    salida.push({
      fecha, comprobante: `${sn[0]}-${sn[1]}`, serie: sn[0], numero: sn[1],
      tipo_comprobante: sn[0] === "SN" ? "Otro" : sn[0].startsWith("B") ? "Boleta" : sn[0].startsWith("F") ? "Factura" : "Otro",
      cliente: texto(col(f, "TERCERO")) || null, doc_cliente: doc, codigo,
      sku: skuPorDescripcion(texto(col(f, "DESCRIPCION"))) ?? (texto(col(f, "DESCRIPCION")) ? null
             : codigo ? porContaNet.get(codigo) ?? (skus.has(codigo) ? codigo : null) : null),
      producto: texto(col(f, "DESCRIPCION")) || null,
      und: numero(col(f, "CANTIDAD")), precio_unit: numero(col(f, "PRECIO UNITARIO")), total: total === null ? null : redondear(total, 4),
      medio_pago: medioDe(texto(col(f, "MEDIO PAGO"))), canal,
      distrito: lugarDe(texto(col(f, "DISTRITO"))), provincia: lugarDe(texto(col(f, "PROVINCIA"))), departamento: lugarDe(texto(col(f, "DEPARTAMENTO"))),
      salio_de: texto(col(f, "SALIO DE")) || null, observacion: texto(col(f, "OBSERVACION")) || null,
    });
  }
  const dias = salida.map((x) => String(x.fecha)).sort();
  const avisos: Aviso[] = [];
  if (!salida.length) avisos.push({ nivel: "error", texto: "El archivo no tiene ventas." });
  else avisos.push({ nivel: "ok", texto: `Ventas virtuales del ${fechaCorta(dias[0])} al ${fechaCorta(dias[dias.length - 1])}: ${salida.length} líneas. Se reemplazan esas fechas; después el cruce con ContaNet se recalcula solo.` });
  if (malos.size) avisos.push({ nivel: "error", texto: `Números de comprobante que no se entienden: ${[...malos].slice(0, 8).join(", ")}. Corrígelos en el Excel.` });
  if (canales.size) avisos.push({ nivel: "error", texto: `Canal desconocido (debe ser DELIVERY o PROVINCIA): ${[...canales].join(", ")}.` });
  if (sinFecha) avisos.push({ nivel: "error", texto: `${sinFecha} filas sin Fecha Registro válida: corrígelas en el Excel.` });
  if (sinNumero) avisos.push({ nivel: "aviso", texto: `${sinNumero} líneas sin número de comprobante: se cargan igual (no se podrán cruzar con ContaNet).` });
  avisos.push({ nivel: "ok", texto: "ContaNet es el monto oficial: este archivo solo dice si cada comprobante es de Lima o Provincia y de qué zona." });
  return cerrar({
    tipo: "virtual", archivo, desde: dias[0] ?? "", hasta: dias[dias.length - 1] ?? "",
    rangos: [{ tienda: null, desde: dias[0] ?? "", hasta: dias[dias.length - 1] ?? "" }], filas: salida,
    und: redondear(salida.reduce((a, x) => a + Number(x.und ?? 0), 0), 3),
    venta: redondear(salida.reduce((a, x) => a + Number(x.total ?? 0), 0), 4),
    porTienda: resumirPorTienda(salida, "total", "canal"), avisos,
    pendientes: listarPendientes(salida, "total", (x) => String(x.producto ?? "")),
  });
}

// ------------------------------------------------------------------ OXXO (sell-out diario por tienda)
/** Reporte diario que manda OXXO («…_PROVEEDORES_DIARIO_…» o «BaseInventario_…»): una fila por día, tienda y EAN.
 *  Mismas reglas que rpa/oxxo_excel.py. El «ACUMULADO_MENSUAL» no trae stock: se rechaza para no borrar el stock del mes. */
const OBLIGATORIAS_OXXO = ["FECHA", "NOMBRE", "DISTRITO", "CLUSTER", "EAN", "DESCRIPCION", "VENTAS NETAS(SIN IGV)", "UNIDADES VENDIDAS NETAS", "STOCK"];
const esOxxo = (filas: Celda[][]) => filas.slice(0, 5).findIndex((f) => {
  const t = f.map(normal);
  return OBLIGATORIAS_OXXO.every((c) => t.includes(c));
});

function leerOxxo(archivo: string, filas: Celda[][], iTitulos: number, eq: Equivalencia[]): Lectura {
  const pos: Record<string, number> = {};
  filas[iTitulos].forEach((t, i) => { const k = normal(t); if (k && !(k in pos)) pos[k] = i; });
  const col = (f: Celda[], nombre: string) => (nombre in pos ? f[pos[nombre]] ?? null : null);
  const skuOxxo = new Map(eq.filter((e) => e.sistema === "OXXO").map((e) => [e.codigo, e.sku]));
  const salida: Fila[] = [];
  let sinFecha = 0, conStock = 0;
  const vistas = new Set<string>(), repetidas: string[] = [];
  for (const f of filas.slice(iTitulos + 1)) {
    const tienda = texto(col(f, "NOMBRE"));
    if (!tienda && !texto(col(f, "FECHA"))) continue;
    const fecha = fechaDe(col(f, "FECHA"));
    if (!fecha) { sinFecha += 1; continue; }
    const ean = texto(col(f, "EAN")).replace(/\.0$/, "");
    const k = `${fecha}|${tienda}|${ean}`;
    if (vistas.has(k)) repetidas.push(`${fechaCorta(fecha)} · ${tienda} · ${ean}`);
    vistas.add(k);
    const stock = numero(col(f, "STOCK"));
    if (stock !== null) conStock += 1;
    const cluster = texto(col(f, "CLUSTER")).toUpperCase();
    const estado = texto(col(f, "ESTADO DEL CODIGO")).toUpperCase().charAt(0);
    salida.push({
      fecha, cliente: "OXXO", tienda, distrito: lugarDe(texto(col(f, "DISTRITO"))), cluster: cluster ? `Cluster ${cluster}` : "Sin cluster",
      ean, codigo: ean, sku: skuOxxo.get(ean) ?? null, descripcion: texto(col(f, "DESCRIPCION")),
      estado: estado === "A" ? "Activo" : estado === "I" ? "Inactivo" : "",
      und: numero(col(f, "UNIDADES VENDIDAS NETAS")) ?? 0, venta: redondear(numero(col(f, "VENTAS NETAS(SIN IGV)")) ?? 0, 4), stock: stock ?? 0,
    });
  }
  const dias = salida.map((x) => String(x.fecha)).sort();
  const tiendas = new Set(salida.map((x) => x.tienda)).size;
  const avisos: Aviso[] = [];
  if (!salida.length) avisos.push({ nivel: "error", texto: "El archivo no tiene filas de venta." });
  else if (!conStock) avisos.push({ nivel: "error", texto: "El archivo no trae STOCK (parece el «ACUMULADO MENSUAL»). Sube los reportes diarios: si se carga este, se borraría el stock de esos días." });
  else avisos.push({ nivel: "ok", texto: `Reporte de OXXO del ${fechaCorta(dias[0])} al ${fechaCorta(dias[dias.length - 1])}: ${tiendas} tiendas. Se reemplazan esos días (venta y stock).` });
  if (sinFecha) avisos.push({ nivel: "error", texto: `${sinFecha} filas sin FECHA válida: corrígelas en el Excel.` });
  if (repetidas.length) avisos.push({ nivel: "error", texto: `${repetidas.length} fila(s) repetidas (mismo día, tienda y EAN), ej.: ${repetidas.slice(0, 3).join(" | ")}. OXXO manda una sola fila por tienda y producto: revisa el archivo.` });
  if (dias.length && dias[0] !== dias[dias.length - 1]) {
    const unicos = [...new Set(dias)];
    const total = Math.round((Date.parse(dias[dias.length - 1]) - Date.parse(dias[0])) / 86_400_000) + 1;
    if (unicos.length < total) avisos.push({ nivel: "aviso", texto: `Faltan ${total - unicos.length} día(s) entre el ${fechaCorta(dias[0])} y el ${fechaCorta(dias[dias.length - 1])}: en esos días se borra lo que haya en la base.` });
  }
  return cerrar({
    tipo: "oxxo", archivo, desde: dias[0] ?? "", hasta: dias[dias.length - 1] ?? "",
    rangos: [{ tienda: null, desde: dias[0] ?? "", hasta: dias[dias.length - 1] ?? "" }], filas: salida,
    und: redondear(salida.reduce((a, x) => a + Number(x.und), 0), 3), venta: redondear(salida.reduce((a, x) => a + Number(x.venta), 0), 4),
    porTienda: resumirPorTienda(salida, "venta", "cliente"), avisos,
    pendientes: listarPendientes(salida, "venta", (x) => String(x.descripcion ?? "")),
  });
}

// ------------------------------------------------------------------ entrada
const fechaCorta = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

function cerrar(l: Omit<Lectura, "puedeCargar">): Lectura {
  // Filas idénticas en todas sus columnas en los Excel que se llenan a mano (retail y virtuales): puede ser una línea copiada
  // dos veces. Se avisa y no se borra, porque también puede ser real (la boleta B008-4474 tiene dos líneas iguales y ContaNet
  // también las trae). No aplica a ContaNet (sale del sistema) ni a tiendas (su hoja Data repite filas iguales de ventas reales).
  const vistas = new Map<string, number>();
  for (const f of l.tipo === "retail" || l.tipo === "virtual" ? l.filas : []) { const k = JSON.stringify(f); vistas.set(k, (vistas.get(k) ?? 0) + 1); }
  const repetidas = [...vistas.entries()].filter(([, n]) => n > 1);
  if (repetidas.length) {
    const extra = repetidas.reduce((a, [, n]) => a + n - 1, 0);
    const ejemplos = repetidas.slice(0, 3).map(([k]) => { const f = JSON.parse(k) as Fila;
      return [f.fecha, f.comprobante ?? f.tienda ?? f.cliente, f.producto ?? f.codigo, f.und].filter((x) => x !== null && x !== undefined).join(" · "); });
    l.avisos.push({ nivel: "aviso", texto: `${extra} fila(s) repetidas exactamente igual dentro del archivo (ej.: ${ejemplos.join(" | ")}). Si fue una línea copiada dos veces, corrígela en el Excel; si es una venta real repetida, carga igual.` });
  }
  if (l.pendientes.length) {
    const filas = l.pendientes.reduce((a, p) => a + p.filas, 0);
    l.avisos.push({ nivel: "aviso", texto: `${l.pendientes.length} código(s) sin SKU oficial (${filas} filas): se cargan igual y quedan pendientes de asignar en la tabla de equivalencias.` });
  } else if (l.filas.length) {
    l.avisos.push({ nivel: "ok", texto: "Todos los códigos tienen su SKU oficial." });
  }
  return { ...l, puedeCargar: l.filas.length > 0 && !l.avisos.some((a) => a.nivel === "error") };
}

/** Lee un Excel subido y reconoce si es un reporte de ContaNet o de tiendas. */
export async function leerArchivo(archivo: string, datos: ArrayBuffer | Uint8Array, eq: Equivalencia[], skus: string[]): Promise<Lectura> {
  const bytes = datos instanceof Uint8Array ? datos : new Uint8Array(datos);
  let libro: Libro;
  try {
    libro = esXls(bytes) ? await abrirXls(bytes) : abrirXlsx(bytes);
  } catch {
    throw new ErrorArchivo("No se pudo abrir como Excel (.xlsx o .xls).");
  }
  const data = libro.hojas.find((h) => h.trim().toLowerCase() === "data");
  if (data) return leerTiendas(archivo, libro.filas(data), eq);
  for (const hoja of libro.hojas) {
    const filas = libro.filas(hoja);
    const iOxxo = esOxxo(filas);
    if (iOxxo >= 0) return leerOxxo(archivo, filas, iOxxo, eq);
    const iVirtual = esVirtual(filas);
    if (iVirtual >= 0) return leerVirtual(archivo, filas, iVirtual, eq, new Set(skus));
    const iRetail = esRetail(filas);
    if (iRetail >= 0) return leerRetail(archivo, filas, iRetail, eq, new Set(skus));
    if (filas.slice(0, 10).some((f) => f.some((v) => texto(v).toUpperCase() === "REPORTE DETALLADO"))) {
      return leerContaNet(archivo, filas, eq, new Set(skus));
    }
  }
  throw new ErrorArchivo("No se reconoce el archivo: no es un «Reporte detallado» de ContaNet, ni un Excel de tienda con hoja «Data», ni un Excel de ventas retail (RAZON SOCIAL CLIENTE, MONTO CANCELADO…), ni el reporte de ventas virtuales (Nro Comprobante, Canal, Departamento…), ni el reporte diario de OXXO (NOMBRE, CLUSTER, EAN, STOCK…).");
}
