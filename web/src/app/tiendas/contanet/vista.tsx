// Vista Tiendas · ContaNet: venta de las tiendas según el ERP (comprobantes), con más detalle que el reporte interno:
// tickets, hora, medio de pago, tipo de comprobante y clientes identificados.
import { CalendarDays, Clock, CreditCard, FileText, IdCard, Package, Store } from "lucide-react";
import { salir } from "@/app/login/actions";
import { Filtros } from "@/components/Filtros";
import { GraficoTendencia, Indicador } from "@/components/Graficos";
import type { CargaWeb } from "@/components/HistorialCargas";
import { Marco, type TipoRetail } from "@/components/Marco";
import { PanelCarga } from "@/components/PanelCarga";
import { Pestanas } from "@/components/Pestanas";
import { Tabla, type Columna } from "@/components/Tabla";
import { Aviso, Encabezado, FranjaComparacion, ListaBarras, Tarjeta } from "@/components/ui";
import type { Equivalencia } from "@/lib/cargas";
import { parametros, type CanalContaNet, type FiltroContaNet, type MaestrosContaNet, type PanelContaNet } from "@/lib/contanet";
import { ClientesContaNet, type ClienteTienda } from "@/components/ClientesContaNet";
import type { Avance } from "@/lib/contanet";
import { seccionAvance } from "./avance";
import { entero, porcentaje, soles } from "@/lib/formato";
import type { Agrupar } from "@/lib/kpi";
import {
  alinear, COMPARAR, COMPARAR_CORTO, DIAS_SEM, diaSemana, diasEntre, fechaLarga, PERIODOS, rangoComparacion, rangoPeriodo, type Comparar, type Periodo,
} from "@/lib/periodos";
import { agrupar as agruparDias } from "@/lib/tiendas";
import { ResumenEjecutivo } from "@/components/ResumenEjecutivo";
import { CONFIG, type FiltrosEjecutivo } from "@/lib/ejecutivo";
import type { DatosEjecutivo } from "@/components/ResumenEjecutivo";

type Params = { [k: string]: string | string[] | undefined };
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const lista = (v: string | string[] | undefined) => (uno(v) ? uno(v)!.split(",").filter(Boolean) : []);
const variacion = (a: number | null, b: number | null | undefined) => (a !== null && b ? a / b - 1 : null);
const div = (a: number, b: number) => (b ? a / b : null);
const sumar = (xs: { und: number; venta: number; tickets: number }[]) =>
  xs.reduce((a, x) => ({ und: a.und + x.und, venta: a.venta + x.venta, tickets: a.tickets + x.tickets }), { und: 0, venta: 0, tickets: 0 });
const CORTO: Record<Comparar, string> = { ant: "periodo anterior", sem: "semana anterior", anio: "año anterior", anioSem: "mismo día año anterior", no: "" };

export type FuenteContaNet = {
  tipos: () => Promise<TipoRetail[]>;
  maestros: () => Promise<MaestrosContaNet>;
  panel: (desde: string, hasta: string, f: FiltroContaNet) => Promise<PanelContaNet>;
  carga: () => Promise<{ equivalencias: Equivalencia[]; skus: string[]; cargas: CargaWeb[] }>;
  ejecutivo: (desde: string, hasta: string, f: FiltrosEjecutivo) => Promise<DatosEjecutivo>;
  clientesTiendas: (desde: string, hasta: string, f: FiltroContaNet) => Promise<ClienteTienda[]>;
  avance: (fecha?: string) => Promise<{ avance: Avance; meta: number | null }>;
};

/** Cómo se muestra cada canal del reporte de ContaNet. */
/** «dim»: qué es la columna «tienda» en cada canal (en el canal digital: Lima/Provincia, el distrito o el departamento). */
const CANALES: Record<CanalContaNet, { ubicacion: string; etiqueta: string; titulo: string; porTienda: boolean; porMedio: boolean; nota: string; dim: string }> = {
  tiendas: { ubicacion: "tiendas/contanet", etiqueta: "Tiendas · ContaNet (ERP)", titulo: "Tiendas según ContaNet", porTienda: true, porMedio: true,
             nota: "Las 7 tiendas, sin lo cobrado con RAPPI (está en el módulo Rappi) ni el usuario VENTAS01 (está en Canal digital).", dim: "Tienda" },
  digital: { ubicacion: "canales/digital/resumen", etiqueta: "Canal digital · ContaNet (usuario VENTAS01)", titulo: "Canal digital", porTienda: true, porMedio: true, dim: "Subcanal",
             nota: "Todo lo registrado en ContaNet por el usuario VENTAS01." },
  rappi: { ubicacion: "canales/rappi", etiqueta: "Rappi · ContaNet (cobrado con RAPPI)", titulo: "Rappi", porTienda: true, porMedio: false,
           nota: "Ventas de las tiendas con condición de pago RAPPI en ContaNet.", dim: "Tienda" },
  digital_lima: { ubicacion: "canales/digital/lima", etiqueta: "Canal digital · Lima (delivery)", titulo: "Canal digital · Lima", porTienda: true, porMedio: true,
                  dim: "Distrito", nota: "Comprobantes de VENTAS01 que el reporte de ventas virtuales marca como DELIVERY (= canal LIMA del consolidado)." },
  digital_provincia: { ubicacion: "canales/digital/provincia", etiqueta: "Canal digital · Provincia", titulo: "Canal digital · Provincia", porTienda: true,
                       porMedio: true, dim: "Departamento",
                       nota: "Comprobantes de VENTAS01 que el reporte de ventas virtuales marca como PROVINCIA (= canal PROVINCIA del consolidado)." },
};

export async function vistaContaNet(canal: CanalContaNet, sp: Params, usuario: string | undefined, fuente: FuenteContaNet) {
  const cfg = CANALES[canal];
  const [tipos, m, carga] = await Promise.all([fuente.tipos(), fuente.maestros(), fuente.carga()]);
  const boton = <PanelCarga titulo="Cargar reporte ContaNet" solo="contanet" equivalencias={carga.equivalencias} skus={carga.skus} correo={usuario} cargas={carga.cargas} />;

  if (!m.hasta) {
    const vacio = (
      <Tarjeta icono={FileText} titulo="Todavía no hay datos de ContaNet">
        <p className="text-sm text-[var(--tenue)] max-w-2xl">Exporta desde ContaNet el <b>Reporte detallado</b> de ventas (filtros en TODOS, moneda SOLES, en .xlsx) y
          súbelo con el botón. Verás la vista previa con el cuadre contra el TOTAL GENERAL antes de confirmar.</p>
        <div>{boton}</div>
      </Tarjeta>
    );
    return <Marco seccion={sp.s} ubicacion={cfg.ubicacion} tiposRetail={tipos} usuario={usuario} salir={salir} datosAl="—"
                  encabezado={<h1 className="text-[28px] font-bold leading-tight">{cfg.titulo}</h1>}
                  secciones={[{ id: "ejecutivo", titulo: "Resumen ejecutivo", contenido: vacio }, { id: "avance", titulo: "Avance del día", contenido: vacio },
                    { id: "ventas", titulo: "Ventas", contenido: vacio },
                    { id: "detalle", titulo: "Detalle de ventas", contenido: vacio }]} />;
  }

  const ultimo = m.hasta, primero = m.desde ?? ultimo;
  const periodo = (uno(sp.p) as Periodo) in PERIODOS ? (uno(sp.p) as Periodo) : "mes";
  const [desde, hasta] = rangoPeriodo(periodo, ultimo, primero, uno(sp.d1), uno(sp.d2));
  const comparar = (uno(sp.c) as Comparar) in COMPARAR ? (uno(sp.c) as Comparar) : "anio";
  const comp = rangoComparacion(comparar, desde, hasta);
  const agrupar = (["dia", "semana", "mes"].includes(uno(sp.g) ?? "") ? uno(sp.g) : "dia") as Agrupar;
  const dias = uno(sp.ds) ? [...new Set(uno(sp.ds)!.split("").map(Number).filter((d) => d >= 0 && d <= 6))] : [0, 1, 2, 3, 4, 5, 6];
  const filtro: FiltroContaNet = { tiendas: lista(sp.tienda), skus: lista(sp.prod), medios: lista(sp.medio), dias };

  const [A, B, ej, cliTiendas, av] = await Promise.all([fuente.panel(desde, hasta, filtro), comp ? fuente.panel(comp[0], comp[1], filtro) : Promise.resolve(null),
    fuente.ejecutivo(desde, hasta, { tienda: filtro.tiendas, sku: filtro.skus, medio: filtro.medios, dias: filtro.dias }),
    fuente.clientesTiendas(desde, hasta, filtro), fuente.avance(uno(sp.dia))]);
  const R = sumar(A.dias), RC = B ? sumar(B.dias) : null;
  const hayComp = !!B && B.dias.length > 0;
  const diasVenta = A.dias.filter((d) => d.venta > 0).length;
  const nombreComp = CORTO[comparar];
  const comparadoCon = COMPARAR_CORTO[comparar];

  const serieA = agruparDias(A.dias, agrupar);
  const mover = alinear(comparar, desde, hasta);
  const serieB = new Map(B ? agruparDias(B.dias.map((d) => ({ ...d, fecha: mover(d.fecha) })), agrupar).map((s) => [s.periodo, s]) : []);
  const ticketsPor = (xs: PanelContaNet["dias"], k: (f: string) => string) => {
    const mm = new Map<string, number>();
    for (const d of xs) mm.set(k(d.fecha), (mm.get(k(d.fecha)) ?? 0) + d.tickets);
    return mm;
  };
  const claveGrupo = (f: string) => agruparDias([{ fecha: f, und: 0, venta: 0 }], agrupar)[0].periodo;
  const ticketsA = ticketsPor(A.dias, claveGrupo);
  const tendencia = serieA.map((s) => ({ periodo: s.periodo, venta: s.venta, und: s.und, costo: 0, tickets: ticketsA.get(s.periodo) ?? 0,
    venta_c: hayComp ? serieB.get(s.periodo)?.venta ?? 0 : null, und_c: hayComp ? serieB.get(s.periodo)?.und ?? 0 : null, costo_c: null }));

  const conComp = <T extends { venta: number }>(xs: T[], clave: (x: T) => string, prev: T[] | undefined) => {
    const mm = new Map((prev ?? []).map((x) => [clave(x), x.venta]));
    return xs.map((x) => ({ ...x, pct: div(x.venta, R.venta), venta_c: hayComp ? mm.get(clave(x)) ?? 0 : null, var: variacion(x.venta, mm.get(clave(x))) }))
      .sort((a, b) => b.venta - a.venta);
  };
  const porTienda = conComp(A.tiendas, (x) => x.tienda, B?.tiendas).map((x) => ({ ...x, ticket_prom: div(x.venta, x.tickets), venta_dia: div(x.venta, x.dias) }));
  const porProducto = conComp(A.productos, (x) => x.sku, B?.productos).map((x) => ({ ...x, precio: div(x.venta, x.und) }));
  const porHora = A.horas.map((h) => ({ ...h, hora_txt: `${String(h.hora).padStart(2, "0")}:00 – ${String(h.hora).padStart(2, "0")}:59`,
    pct: div(h.venta, R.venta), ticket_prom: div(h.venta, h.tickets) }));
  const porMedio = [...A.medios].sort((a, b) => b.venta - a.venta).map((x) => ({ ...x, pct: div(x.venta, R.venta), ticket_prom: div(x.venta, x.tickets) }));
  const porComprobante = [...A.comprobantes].sort((a, b) => b.venta - a.venta).map((x) => ({ ...x, pct: div(x.venta, R.venta) }));

  const colComp: Columna[] = hayComp
    ? [{ clave: "venta_c", titulo: `Venta ${nombreComp} S/`, tipo: "soles" }, { clave: "var", titulo: "Variación", tipo: "porcentaje", info: "variacion" }] : [];
  const totalComp = hayComp ? { venta_c: RC!.venta, var: variacion(R.venta, RC!.venta) } : {};
  const total = { und: R.und, venta: R.venta, tickets: R.tickets, pct: R.venta ? 1 : null, ticket_prom: div(R.venta, R.tickets), precio: div(R.venta, R.und), ...totalComp };
  const COL = {
    und: { clave: "und", titulo: "Unidades", tipo: "entero" }, venta: { clave: "venta", titulo: "Venta S/", tipo: "soles" },
    tickets: { clave: "tickets", titulo: "Tickets", tipo: "entero" }, pct: { clave: "pct", titulo: "% venta", tipo: "porcentaje", info: "mix" },
    ticket: { clave: "ticket_prom", titulo: "Ticket prom. S/", tipo: "decimal2" },
  } satisfies Record<string, Columna>;
  const rango = `${fechaLarga(desde)} – ${fechaLarga(hasta)}`;
  const archivo = (n: string) => `tiendas_contanet_${n}_${desde}_${hasta}.xlsx`;
  const vacio = <p className="text-sm text-[var(--tenue)]">No hay ventas con estos filtros.</p>;
  const etiqueta = (p: string) => (agrupar === "mes" ? `${p.slice(5, 7)}/${p.slice(0, 4)}` : fechaLarga(p));
  const barras = (filas: { etiqueta: string; valor: number; detalle?: string }[]) =>
    <ListaBarras formato={(v) => `${soles(v)} · ${porcentaje(R.venta ? v / R.venta : 0)}`} filas={filas} />;

  const encabezado = (
    <header className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <p className="etiqueta">{cfg.etiqueta} · Turrones Calderón</p>
          <h1 className="text-[28px] font-bold leading-tight">{cfg.titulo}</h1>
          <p className="text-sm text-[var(--tenue)]">
            <b className="text-[var(--tinta)]">{PERIODOS[periodo]}</b> · {rango} · {diasEntre(desde, hasta)} días
            {diasVenta !== diasEntre(desde, hasta) && ` (${diasVenta} con venta)`}
            {" "}· ContaNet cargado del {fechaLarga(primero)} al {fechaLarga(ultimo)}
          </p>
          <p className="text-xs text-[var(--tenue)]">{cfg.nota}</p>
        </div>
        {boton}
      </div>
      <Filtros ultimo={ultimo} primero={primero} grupos={[
        ...(cfg.porTienda ? [{ clave: "tienda", etiqueta: cfg.dim, opciones: m.tiendas.map((x) => ({ valor: x, texto: x })) }] : []),
        { clave: "prod", etiqueta: "Producto", buscar: true, opciones: m.productos.map((p) => ({ valor: p.sku, texto: `${p.producto} (${p.sku})` })) },
        ...(cfg.porMedio ? [{ clave: "medio", etiqueta: "Medio de pago", opciones: m.medios.map((x) => ({ valor: x, texto: x })) }] : []),
      ]} />
      <FranjaComparacion desde={desde} hasta={hasta} comp={comp} tipo={comparar} hayDatos={hayComp} />
      {canal.startsWith("digital") && (
        <Aviso titulo="Lima y Provincia salen del reporte de ventas virtuales, cruzado con ContaNet comprobante por comprobante">
          Antes del 01/09/2026 (cuando empieza ContaNet) la venta sale de ese mismo reporte, sin hora ni tickets por hora. Lo que ContaNet registra y
          el reporte aún no trae (días más nuevos, notas de crédito) aparece como «Sin clasificar» en el resumen del canal digital.
        </Aviso>
      )}
      {canal === "tiendas" && comp && comp[0] < primero && (
        <Aviso titulo={`La comparación usa el reporte interno de tiendas (ContaNet empieza el ${fechaLarga(primero)})`}>
          Para fechas anteriores se compara con la venta del reporte interno (el del Power BI). Ahí hay venta y unidades, pero no tickets, horas,
          medios de pago ni clientes: esas comparaciones salen «—».
        </Aviso>
      )}
    </header>
  );

  const seccionVentas = (
    <>
      <div className="grid gap-4 grid-cols-1 @lg:grid-cols-2 @5xl:grid-cols-4">
        <Indicador comparadoCon={comparadoCon} icono="venta" titulo="Venta" valor={soles(R.venta)} variacion={variacion(R.venta, RC?.venta)}
                   tendencia={A.dias.map((d) => d.venta)} ayuda="Suma del precio total de los comprobantes; las notas de crédito restan." />
        <Indicador comparadoCon={comparadoCon} icono="unidades" titulo="Unidades" valor={entero(R.und)} variacion={variacion(R.und, RC?.und)}
                   tendencia={A.dias.map((d) => d.und)} />
        <Indicador comparadoCon={comparadoCon} icono="rotacion" titulo="Tickets" valor={entero(R.tickets)} variacion={variacion(R.tickets, RC?.tickets)}
                   detalle={`${entero(div(R.tickets, diasVenta) ?? 0)} por día`} ayuda="Comprobantes emitidos (boletas, facturas, notas de venta), sin notas de crédito." />
        <Indicador comparadoCon={comparadoCon} icono="ingreso" titulo="Ticket promedio" valor={soles(div(R.venta, R.tickets))}
                   variacion={RC ? variacion(div(R.venta, R.tickets), div(RC.venta, RC.tickets)) : null} ayuda="Venta ÷ tickets: cuánto gasta en promedio cada cliente." />
      </div>
      {A.dias.length === 0 ? vacio : (
        <>
          <div className="grid gap-4 @5xl:grid-cols-3">
            <div className="@5xl:col-span-2 min-w-0">
              <GraficoTendencia datos={tendencia} agrupar={agrupar} conPrevio={hayComp} nombrePrevio={COMPARAR[comparar]} rango={rango}
                                metricas={["venta", "und"]} nombres={{ venta: "Venta" }} />
            </div>
            {cfg.porTienda ? (
              <Tarjeta icono={Store} titulo={`Venta por ${cfg.dim.toLowerCase()}`} subtitulo={rango}>
                {barras(porTienda.map((x) => ({ etiqueta: x.tienda, valor: x.venta, detalle: `${entero(x.tickets)} tickets · ${entero(x.und)} und` })))}
              </Tarjeta>
            ) : (
              <Tarjeta icono={Package} titulo="Productos más vendidos" subtitulo={rango}>
                {barras(porProducto.slice(0, 8).map((x) => ({ etiqueta: x.producto, valor: x.venta, detalle: `${entero(x.und)} und` })))}
              </Tarjeta>
            )}
          </div>
          <div className="grid gap-4 @5xl:grid-cols-3">
            <Tarjeta className="@5xl:col-span-2" icono={CalendarDays} titulo={`Detalle por ${agrupar === "dia" ? "día" : agrupar}`} subtitulo={rango}>
              <Tabla archivo={archivo("detalle")} hoja="Detalle" alto={360}
                     filas={[...tendencia].reverse().map((s) => ({ ...s, dia: agrupar === "dia" ? DIAS_SEM[diaSemana(s.periodo)] : "",
                       periodo: etiqueta(s.periodo), ticket_prom: div(s.venta, s.tickets), var: variacion(s.venta, s.venta_c) }))}
                     columnas={[{ clave: "periodo", titulo: agrupar === "mes" ? "Mes" : agrupar === "semana" ? "Semana (lunes)" : "Día", tipo: "texto" },
                       ...(agrupar === "dia" ? [{ clave: "dia", titulo: "", tipo: "texto" } as Columna] : []),
                       COL.tickets, COL.und, COL.venta, COL.ticket, ...colComp]}
                     total={{ periodo: "TOTAL", ...total }} />
            </Tarjeta>
            {cfg.porMedio ? (
              <Tarjeta icono={CreditCard} titulo="Venta por medio de pago" subtitulo={rango}>
                {barras(porMedio.map((x) => ({ etiqueta: x.medio, valor: x.venta, detalle: `${entero(x.tickets)} tickets` })))}
              </Tarjeta>
            ) : (
              <Tarjeta icono={Package} titulo="Productos más vendidos" subtitulo={rango}>
                {barras(porProducto.slice(0, 8).map((x) => ({ etiqueta: x.producto, valor: x.venta, detalle: `${entero(x.und)} und` })))}
              </Tarjeta>
            )}
          </div>
        </>
      )}
    </>
  );

  const seccionDetalle = (
    <>
      <Encabezado titulo="Detalle de ventas" descripcion={<>{cfg.titulo}: la venta abierta por {cfg.porTienda ? `${cfg.dim.toLowerCase()}, ` : ""}producto, hora, medio de pago y cliente. {rango}.</>} />
      {A.dias.length === 0 ? vacio : (
        <Pestanas pestanas={[
          ...(!cfg.porTienda ? [] : [{ id: "tiendas", titulo: `Por ${cfg.dim.toLowerCase()}`, contenido: (
            <Tarjeta icono={Store} titulo={`Por ${cfg.dim.toLowerCase()}`} subtitulo={rango}>
              <Tabla archivo={archivo("tiendas")} hoja={cfg.dim} filas={porTienda}
                     columnas={[{ clave: "tienda", titulo: cfg.dim, tipo: "texto" }, { clave: "dias", titulo: "Días con venta", tipo: "entero" },
                       COL.tickets, COL.und, COL.venta, COL.pct, COL.ticket, { clave: "venta_dia", titulo: "Venta/día S/", tipo: "soles" }, ...colComp]}
                     total={{ tienda: "TOTAL", dias: diasVenta, venta_dia: div(R.venta, diasVenta), ...total }} />
            </Tarjeta>
          ) }]),
          { id: "productos", titulo: "Por producto", contenido: (
            <Tarjeta icono={Package} titulo="Por producto" subtitulo={`${porProducto.length} productos · ${rango}`}>
              <Tabla archivo={archivo("productos")} hoja="Productos" alto={520} buscar filas={porProducto}
                     columnas={[{ clave: "producto", titulo: "Producto", tipo: "texto" }, { clave: "sku", titulo: "SKU", tipo: "texto" },
                       { clave: "tickets", titulo: "Tickets con el producto", tipo: "entero" }, COL.und, COL.venta, COL.pct,
                       { clave: "precio", titulo: "Precio prom. S/", tipo: "decimal2" }, ...colComp]}
                     total={{ producto: "TOTAL", ...total }} />
            </Tarjeta>
          ) },
          { id: "horas", titulo: "Por hora", contenido: (
            <div className="grid gap-4 @5xl:grid-cols-2">
              <Tarjeta icono={Clock} titulo="Venta por hora del día" subtitulo={`Todas las tiendas elegidas · ${rango}`}>
                {barras(porHora.map((h) => ({ etiqueta: h.hora_txt, valor: h.venta, detalle: `${entero(h.tickets)} tickets` })))}
              </Tarjeta>
              <Tarjeta icono={Clock} titulo="Detalle por hora" subtitulo={rango}>
                <Tabla archivo={archivo("horas")} hoja="Horas" filas={porHora}
                       columnas={[{ clave: "hora_txt", titulo: "Hora", tipo: "texto" }, COL.tickets, COL.und, COL.venta, COL.pct, COL.ticket]}
                       total={{ hora_txt: "TOTAL", ...total }} />
              </Tarjeta>
            </div>
          ) },
          { id: "pagos", titulo: "Pago y comprobante", contenido: (
            <div className="grid gap-4 @5xl:grid-cols-2">
              <Tarjeta icono={CreditCard} titulo="Por medio de pago" subtitulo={rango}>
                <Tabla archivo={archivo("medios")} hoja="Medios de pago" filas={porMedio}
                       columnas={[{ clave: "medio", titulo: "Medio de pago", tipo: "texto" }, COL.tickets, COL.venta, COL.pct, COL.ticket]}
                       total={{ medio: "TOTAL", ...total }} />
              </Tarjeta>
              <Tarjeta icono={FileText} titulo="Por tipo de comprobante" subtitulo={rango}>
                <Tabla archivo={archivo("comprobantes")} hoja="Comprobantes" filas={porComprobante}
                       columnas={[{ clave: "tipo", titulo: "Comprobante", tipo: "texto" }, { clave: "documentos", titulo: "Documentos", tipo: "entero" },
                         COL.und, COL.venta, COL.pct]}
                       total={{ tipo: "TOTAL", documentos: A.comprobantes.reduce((a, x) => a + x.documentos, 0), und: R.und, venta: R.venta, pct: 1 }} />
              </Tarjeta>
            </div>
          ) },
          { id: "clientes", titulo: "Clientes identificados", contenido: (
            <Tarjeta icono={IdCard} titulo="Clientes con DNI o RUC" subtitulo={`Los 200 que más compraron · ${rango} · el resto es público general`}>
              <ClientesContaNet clientes={A.clientes} porTienda={cliTiendas} conTiendas={cfg.porTienda} archivo={archivo("clientes").replace(".xlsx", "")}
                                consulta={{ canal, desde, hasta, ...parametros(filtro) }}
                                referencia={{ ticketProm: div(R.venta, R.tickets), undTicket: div(R.und, R.tickets) }} />
            </Tarjeta>
          ) },
        ]} />
      )}
    </>
  );

  return (
    <Marco seccion={sp.s} ubicacion={cfg.ubicacion} tiposRetail={tipos} encabezado={encabezado} usuario={usuario} salir={salir} datosAl={fechaLarga(ultimo)} secciones={[
      { id: "ejecutivo", titulo: "Resumen ejecutivo", contenido: <ResumenEjecutivo datos={ej} desde={desde} hasta={hasta} config={CONFIG[canal === "tiendas" ? "contanet_tiendas" : canal]} archivo={`${canal}_contanet_ejecutivo`} /> },
      { id: "avance", titulo: "Avance del día", contenido: seccionAvance(av.avance, av.meta, cfg.porTienda, `${canal}_avance_${av.avance.fecha}`, cfg.titulo, cfg.dim) },
      { id: "ventas", titulo: "Ventas", contenido: seccionVentas },
      { id: "detalle", titulo: "Detalle de ventas", contenido: seccionDetalle },
    ]} />
  );
}
