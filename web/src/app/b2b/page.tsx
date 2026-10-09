// B2B: pedidos a empresas (Excel «Ventas B2B», tabla b2b_ventas) con el producto limpio al SKU de ContaNet.
// Venta = pedidos entregados (cuadra con el canal B2B del consolidado); los pendientes van aparte. Meta y año pasado: consolidado.
import { Building2, CalendarRange, ClipboardList, Package } from "lucide-react";
import { salir } from "@/app/login/actions";
import { GraficoConsolidado } from "@/components/GraficoConsolidado";
import { GraficosProductos } from "@/components/GraficosProductos";
import { Marco } from "@/components/Marco";
import { BarraVariacion, Medidor } from "@/components/ResumenEjecutivo";
import { SelectorMeses } from "@/components/SelectorMeses";
import { Tabla } from "@/components/Tabla";
import { Aviso, Tarjeta } from "@/components/ui";
import { entero, millones, porcentaje, soles } from "@/lib/formato";
import { leerMeses, MESES_CORTOS, nombrarMeses, rangoMeses } from "@/lib/meses";
import { fechaLarga } from "@/lib/periodos";
import { tiposRetail } from "@/lib/retail";
import { clienteSupabase } from "@/lib/supabase/server";

export const metadata = { title: "B2B · Calderón" };

type Pedido = { fecha: string; ruc: string | null; cliente: string; contacto: string | null; producto_excel: string; sku: string | null;
                maquila: boolean; und: number; precio: number | null; venta: number; condicion_pago: string | null; status: string | null; detalle: string | null };
const div = (a: number, b: number) => (b ? a / b : null);
const signo = (x: number | null) => (x === null ? "—" : `${x >= 0 ? "▲ +" : "▼ "}${porcentaje(x)}`);
const colorVar = (x: number | null) => (x === null ? "" : x >= 0 ? "text-[var(--bueno)]" : "text-[var(--critico)]");
const estado = (c: number | null) => (c === null ? null : c >= 1 ? { texto: "En meta", tinta: "text-[var(--bueno)]", fondo: "bg-[var(--bueno-suave)]" }
  : c >= 0.9 ? { texto: "Cerca de la meta", tinta: "text-[var(--alerta)]", fondo: "bg-[var(--alerta-suave)]" }
  : { texto: "Bajo la meta", tinta: "text-[var(--critico)]", fondo: "bg-[var(--critico-suave)]" });
const entregado = (p: Pedido) => (p.status ?? "").toLowerCase().startsWith("entregad");

export default async function B2B({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const sp = await searchParams;
  const sb = await clienteSupabase();
  const { data: { user } } = await sb.auth.getUser();
  const [{ data: filas }, { data: maestro }, tipos] = await Promise.all([
    sb.from("b2b_ventas").select("fecha, ruc, cliente, contacto, producto_excel, sku, maquila, und, precio, venta, condicion_pago, status, detalle").order("fecha"),
    sb.from("sku_maestro").select("sku, producto"),
    tiposRetail(sb),
  ]);
  const pedidos = ((filas ?? []) as Pedido[]).map((p) => ({ ...p, und: Number(p.und), venta: Number(p.venta), precio: p.precio === null ? null : Number(p.precio) }));
  const nombreSku = new Map((maestro ?? []).map((m) => [String(m.sku), String(m.producto)]));
  const encabezado = (
    <header className="grid gap-1">
      <p className="etiqueta">Ventas a empresas · Turrones Calderón</p>
      <h1 className="text-[28px] font-bold leading-tight">B2B</h1>
    </header>
  );
  if (!pedidos.length) {
    return <Marco ubicacion="b2b" tiposRetail={tipos} encabezado={encabezado} usuario={user?.email} salir={salir} seccion={sp.s} datosAl="—"
                  secciones={[{ id: "ventas", titulo: "Resumen", contenido: <Aviso titulo="Todavía no hay pedidos B2B cargados">Carga el Excel «Ventas B2B» con rpa/b2b_excel.py.</Aviso> }]} />;
  }

  // Pedido del usuario (2026-10-09): los pendientes ya se cuentan como venta completa (pagaron la inicial); se avisa cuáles son.
  const ok = pedidos, pendientes = pedidos.filter((p) => !entregado(p));
  const ultimo = pedidos.filter(entregado).at(-1)?.fecha ?? pedidos.at(-1)!.fecha;   // último despacho entregado («datos al»)
  const finUlt = pedidos.at(-1)!.fecha;
  const anio = Number(finUlt.slice(0, 4)), mesUlt = Number(finUlt.slice(5, 7));
  const { data: cons } = await sb.from("consolidado_mensual").select("anio, mes, real, meta").eq("canal", "B2B").in("anio", [anio, anio - 1]);
  const meta = (m: number) => Number(cons?.find((c) => c.anio === anio && c.mes === m)?.meta ?? 0);
  const ant = (m: number) => Number(cons?.find((c) => c.anio === anio - 1 && c.mes === m)?.real ?? 0);
  const cerrados = mesUlt;   // B2B va por pedido: se ven todos los meses con pedidos, incluido el de los pendientes
  const sel = leerMeses(Array.isArray(sp.m) ? sp.m[0] : sp.m, mesUlt);
  const lista = sel ?? rangoMeses(1, cerrados);
  const tramo = lista.length ? nombrarMeses(lista, true) : "—";
  const delAnio = ok.filter((p) => Number(p.fecha.slice(0, 4)) === anio);
  const enLista = delAnio.filter((p) => lista.includes(Number(p.fecha.slice(5, 7))));
  const ventaMes = (m: number) => delAnio.filter((p) => Number(p.fecha.slice(5, 7)) === m).reduce((a, p) => a + p.venta, 0);

  // Cifras del periodo (como el Resumen general): real, vs año pasado, vs meta y cumplimiento.
  const real = enLista.reduce((a, p) => a + p.venta, 0), und = enLista.reduce((a, p) => a + p.und, 0);
  const metaP = lista.reduce((a, m) => a + meta(m), 0), antP = lista.reduce((a, m) => a + ant(m), 0);
  const vAnt = antP ? real / antP - 1 : null, vMeta = metaP ? real / metaP - 1 : null;
  const realAnio = delAnio.reduce((a, p) => a + p.venta, 0), metaAnio = rangoMeses(1, 12).reduce((a, m) => a + meta(m), 0);
  const metaHoy = rangoMeses(1, cerrados).reduce((a, m) => a + meta(m), 0);
  const [r, mt] = sel ? [real, metaP] : [realAnio, metaAnio];
  const nivel = div(r, mt), esperado = !sel && metaAnio ? metaHoy / metaAnio : 1;
  const est = estado(sel ? nivel : metaHoy ? realAnio / metaHoy : null);
  const stats = [
    { titulo: `Var % ${anio} vs ${anio - 1}`, valor: signo(vAnt), clase: colorVar(vAnt), grafico: <BarraVariacion v={vAnt} />, contexto: <>{tramo} · {anio - 1}: {soles(antP)}</> },
    { titulo: `Var % ${anio} vs meta`, valor: signo(vMeta), clase: colorVar(vMeta), grafico: <BarraVariacion v={vMeta} />, contexto: <>{tramo} · meta {soles(metaP)}</> },
    { titulo: sel ? `Cumplimiento ${tramo}` : `Nivel de cumplimiento ${anio}`, valor: nivel === null ? "—" : porcentaje(nivel), clase: sel ? est?.tinta : "",
      grafico: mt ? <Medidor c={nivel} marca={esperado} color={sel ? (nivel !== null && nivel >= 1 ? "var(--bueno)" : nivel !== null && nivel >= 0.9 ? "var(--alerta)" : "var(--critico)") : "var(--serie-1)"} /> : null,
      contexto: <>{!sel && <>A hoy debías ir en {porcentaje(esperado)} · </>}Meta {sel ? tramo : "anual"} {millones(mt)} · faltan {millones(Math.max(mt - r, 0))}
        {est && <span className={`ml-1.5 rounded px-1.5 py-0.5 font-medium ${est.fondo} ${est.tinta}`}>{est.texto}</span>}</> },
  ];

  // Por cliente y por producto (SKU de ContaNet), en el periodo.
  const agrupar = <K extends string>(clave: (p: Pedido) => K) => {
    const m = new Map<K, Pedido[]>();
    for (const p of enLista) m.set(clave(p), [...(m.get(clave(p)) ?? []), p]);
    return [...m.entries()];
  };
  const porCliente = agrupar((p) => p.cliente).map(([cliente, ps]) => ({
    cliente, ruc: ps[0].ruc, pedidos: new Set(ps.map((p) => p.fecha)).size, und: ps.reduce((a, p) => a + p.und, 0), venta: ps.reduce((a, p) => a + p.venta, 0),
    part: div(ps.reduce((a, p) => a + p.venta, 0), real), ultimo: fechaLarga(ps.at(-1)!.fecha),
    maquila: ps.some((p) => p.maquila) ? "Sí" : "",
  })).sort((a, b) => b.venta - a.venta);
  const porSku = agrupar((p) => p.sku ?? "SIN SKU").map(([sku, ps]) => {
    const u = ps.reduce((a, p) => a + p.und, 0), v = ps.reduce((a, p) => a + p.venta, 0);
    const uMaq = ps.filter((p) => p.maquila).reduce((a, p) => a + p.und, 0);
    return { sku, producto: nombreSku.get(sku) ?? sku, und: u, und_maquila: uMaq, venta: v, precio: div(v, u), part: div(v, real),
             clientes: new Set(ps.map((p) => p.cliente)).size, ps };
  }).sort((a, b) => b.venta - a.venta);
  const mesesVer = lista.filter((m) => m <= mesUlt);

  const contenido = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <SelectorMeses key={`meses-${sp.m ?? ""}`} elegidos={sel} hasta={mesUlt} cerrados={cerrados} enCurso={null} />
        <span className="text-xs text-[var(--tenue)]">Cambia los meses de toda la página</span>
      </div>

      <div className="grid gap-5 rounded-xl border border-[var(--linea)] bg-[var(--superficie)] p-4 @4xl:grid-cols-[minmax(200px,0.8fr)_2.6fr] @4xl:gap-6 @4xl:px-5">
        <div className="grid content-center gap-1">
          <p className="text-[13px] text-[var(--tenue)]">Venta B2B {anio}</p>
          <p key={real} className="cifra num text-[28px] @5xl:text-[30px] font-semibold leading-tight tracking-[-0.02em]">{soles(real)}</p>
          <p className="text-xs text-[var(--tenue)]">{tramo} · {entero(und)} unidades · {porCliente.length} clientes</p>
        </div>
        <dl className="grid gap-5 @2xl:gap-0 @2xl:grid-cols-3 @2xl:divide-x divide-[var(--linea)]">
          {stats.map((k) => (
            <div key={k.titulo} className="grid content-start gap-1.5 @2xl:px-4 @2xl:first:pl-0 @2xl:last:pr-0">
              <dt className="text-[13px] text-[var(--tenue)]">{k.titulo}</dt>
              <dd key={k.valor} className={`cifra num text-[20px] font-semibold leading-tight tracking-[-0.015em] ${k.clase ?? ""}`}>{k.valor}</dd>
              <dd>{k.grafico}</dd>
              <dd className="text-xs leading-relaxed text-[var(--tenue)]">{k.contexto}</dd>
            </div>
          ))}
        </dl>
      </div>

      {pendientes.length > 0 && (
        <Aviso titulo={`La venta incluye ${pendientes.length} ${pendientes.length === 1 ? "pedido pendiente de entrega" : "pedidos pendientes de entrega"} por ${soles(pendientes.reduce((a, p) => a + p.venta, 0))}`}>
          {pendientes.map((p) => `${p.cliente} · ${p.producto_excel} × ${entero(p.und)} para el ${fechaLarga(p.fecha)}`).join(" · ")}. Se cuenta completo (ya pagó la inicial),
          aunque el consolidado todavía no lo tiene.
        </Aviso>
      )}

      <Tarjeta icono={CalendarRange} titulo={`Mes a mes ${anio}`} subtitulo={`Venta entregada vs meta del consolidado y ${anio - 1}`}>
        <GraficoConsolidado anio={anio} mesCorte={0} diaCorte={0}
                            meses={rangoMeses(1, 12).map((m) => ({ mes: m, real: m <= mesUlt ? ventaMes(m) : null, meta: meta(m) || null, anterior: ant(m) || null }))} />
      </Tarjeta>

      <Tarjeta icono={Building2} titulo="Por cliente" subtitulo={`${tramo} · de más a menos venta`}>
        <Tabla archivo={`b2b_clientes_${anio}.xlsx`} hoja="Clientes" filas={porCliente}
               columnas={[{ clave: "cliente", titulo: "Cliente", tipo: "texto" }, { clave: "ruc", titulo: "RUC", tipo: "texto" },
                 { clave: "pedidos", titulo: "Pedidos", tipo: "entero" }, { clave: "und", titulo: "Unidades", tipo: "entero" },
                 { clave: "venta", titulo: "Venta S/", tipo: "soles" }, { clave: "part", titulo: "% de la venta", tipo: "porcentaje" },
                 { clave: "maquila", titulo: "Maquila", tipo: "texto" }, { clave: "ultimo", titulo: "Último pedido", tipo: "texto" }]}
               total={{ cliente: "TOTAL", pedidos: porCliente.reduce((a, c) => a + c.pedidos, 0), und, venta: real, part: 1 }} />
      </Tarjeta>

      <Tarjeta icono={Package} titulo="Por producto (SKU de ContaNet)" subtitulo={`${tramo} · la maquila (marca del cliente) se cuenta en su producto base`}>
        {mesesVer.length > 0 && (
          <GraficosProductos meses={mesesVer} etiquetas={Object.fromEntries(mesesVer.map((m) => [m, MESES_CORTOS[m - 1]]))} total={{ und, venta: real }}
                             nombreGrupos="tipo" grupos={[{ clave: "CAL", nombre: "Marca Calderón", color: "var(--serie-1)" }, { clave: "MAQ", nombre: "Maquila", color: "var(--serie-2)" }]}
                             productos={porSku.slice(0, 10).map((x) => ({
                               sku: x.sku, producto: x.producto, und: x.und, venta: x.venta,
                               canales: { CAL: { und: x.und - x.und_maquila, venta: x.ps.filter((p) => !p.maquila).reduce((a, p) => a + p.venta, 0) },
                                          MAQ: { und: x.und_maquila, venta: x.ps.filter((p) => p.maquila).reduce((a, p) => a + p.venta, 0) } },
                               meses: Object.fromEntries(mesesVer.map((m) => {
                                 const delMes = x.ps.filter((p) => Number(p.fecha.slice(5, 7)) === m);
                                 return [m, { und: delMes.reduce((a, p) => a + p.und, 0), venta: delMes.reduce((a, p) => a + p.venta, 0) }];
                               })),
                             }))} />
        )}
        <Tabla archivo={`b2b_productos_${anio}.xlsx`} hoja="Productos" filas={porSku.map((x) => ({ sku: x.sku, producto: x.producto, und: x.und, und_maquila: x.und_maquila, venta: x.venta, precio: x.precio, clientes: x.clientes, part: x.part }))}
               columnas={[{ clave: "producto", titulo: "Producto", tipo: "texto" }, { clave: "sku", titulo: "SKU", tipo: "texto" },
                 { clave: "und", titulo: "Unidades", tipo: "entero" }, { clave: "und_maquila", titulo: "De ellas, maquila", tipo: "entero" },
                 { clave: "venta", titulo: "Venta S/", tipo: "soles" }, { clave: "precio", titulo: "Precio prom. S/", tipo: "decimal2" },
                 { clave: "clientes", titulo: "Clientes", tipo: "entero" }, { clave: "part", titulo: "% de la venta", tipo: "porcentaje" }]}
               total={{ producto: "TOTAL", und, und_maquila: porSku.reduce((a, x) => a + x.und_maquila, 0), venta: real, precio: div(real, und), part: 1 }} />
      </Tarjeta>
    </>
  );

  const detalle = (
    <Tarjeta icono={ClipboardList} titulo="Todos los pedidos" subtitulo={`Excel «Ventas B2B» con el producto limpio al SKU de ContaNet · ${pedidos.length} filas`}>
      <Tabla archivo={`b2b_pedidos_${anio}.xlsx`} hoja="Pedidos" buscar alto={560}
             filas={[...pedidos].reverse().map((p) => ({ ...p, dia: fechaLarga(p.fecha), producto: p.sku ? nombreSku.get(p.sku) ?? p.sku : "—", maquila: p.maquila ? "Sí" : "" }))}
             columnas={[{ clave: "dia", titulo: "Despacho", tipo: "texto" }, { clave: "cliente", titulo: "Cliente", tipo: "texto" },
               { clave: "producto_excel", titulo: "Producto (Excel)", tipo: "texto" }, { clave: "producto", titulo: "Producto ContaNet", tipo: "texto" },
               { clave: "sku", titulo: "SKU", tipo: "texto" }, { clave: "maquila", titulo: "Maquila", tipo: "texto" },
               { clave: "und", titulo: "Unidades", tipo: "entero" }, { clave: "precio", titulo: "Precio S/", tipo: "decimal2" },
               { clave: "venta", titulo: "Monto S/", tipo: "soles" }, { clave: "condicion_pago", titulo: "Pago", tipo: "texto" },
               { clave: "status", titulo: "Estado", tipo: "texto" }]} />
    </Tarjeta>
  );

  return (
    <Marco ubicacion="b2b" tiposRetail={tipos} encabezado={encabezado} usuario={user?.email} salir={salir} seccion={sp.s} datosAl={fechaLarga(ultimo)}
           secciones={[{ id: "ventas", titulo: "Resumen", contenido },
                       { id: "detalle", titulo: `Pedidos${pendientes.length ? ` · ${pendientes.length} pendiente${pendientes.length > 1 ? "s" : ""}` : ""}`, contenido: detalle }]} />
  );
}

