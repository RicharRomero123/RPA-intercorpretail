"use client";

import {
  CalendarClock, ChevronRight, Crown, Gauge, LoaderCircle, Receipt, RefreshCw, ShoppingBag, Sparkles, Store, TrendingUp, X, type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fechaLarga } from "@/lib/periodos";
import { decimal2, entero, porcentaje, soles } from "@/lib/formato";
import { clienteNavegador } from "@/lib/supabase/navegador";
import { Tabla, type Columna } from "./Tabla";

export type ClienteContaNet = { doc: string; tipo_doc: string; cliente: string; und: number; venta: number; tickets: number; ultima: string };
export type ClienteTienda = { doc: string; tienda: string; venta: number; und: number };
/** Filtros de la página, para que el detalle de compras muestre lo mismo que la tabla. */
export type ConsultaCompras = { canal: string; desde: string; hasta: string; p_tiendas: string[] | null; p_skus: string[] | null; p_medios: string[] | null; p_dias: number[] | null };

const COLORES = ["#c2570c", "#6b2a0f", "#e0a33a", "#8a8f3c", "#3f7d8c", "#a3485a", "#7a6ea8", "#9aa0a6"];
const EJE = { fontSize: 11.5, fill: "var(--tenue)" };
const corto = (s: string) => (s.length > 26 ? `${s.slice(0, 25)}…` : s);
const compacto = (v: number) => (Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : `${Math.round(v)}`);

/** Clientes identificados (DNI/RUC): gráfico de los principales y en qué tiendas compraron, y tabla. Al hacer clic en un
 *  cliente se abre un panel a la derecha con el análisis de sus compras (así no hay tablas con scroll dentro de otra tabla). */
/** Promedios del canal en el periodo, para ubicar a cada cliente (ticket promedio y unidades por ticket). */
export type Referencia = { ticketProm: number | null; undTicket: number | null };

export function ClientesContaNet({ clientes, porTienda, consulta, conTiendas, archivo, referencia }: {
  clientes: ClienteContaNet[]; porTienda: ClienteTienda[]; consulta: ConsultaCompras; conTiendas: boolean; archivo: string; referencia: Referencia;
}) {
  const [elegido, setElegido] = useState<ClienteContaNet | null>(null);
  const tiendas = [...new Set(porTienda.map((x) => x.tienda))]
    .sort((a, b) => porTienda.filter((x) => x.tienda === b).reduce((s, x) => s + x.venta, 0) - porTienda.filter((x) => x.tienda === a).reduce((s, x) => s + x.venta, 0));
  const top = clientes.slice(0, 15).map((c) => ({
    nombre: corto(c.cliente), completo: c.cliente,
    ...Object.fromEntries(porTienda.filter((x) => x.doc === c.doc).map((x) => [x.tienda, x.venta])),
  }));
  const filas = clientes.map((c) => ({
    ...c, ultima: fechaLarga(c.ultima), ticket_prom: c.tickets ? c.venta / c.tickets : null,
    tiendas: porTienda.filter((x) => x.doc === c.doc).sort((a, b) => b.venta - a.venta).map((x) => x.tienda).join(", "),
  }));
  const columnas: Columna[] = [
    { clave: "cliente", titulo: "Cliente", tipo: "texto" }, { clave: "tipo_doc", titulo: "Doc.", tipo: "texto" }, { clave: "doc", titulo: "Número", tipo: "texto" },
    ...(conTiendas ? [{ clave: "tiendas", titulo: "Compró en", tipo: "texto" } as Columna] : []),
    { clave: "tickets", titulo: "Tickets", tipo: "entero" }, { clave: "und", titulo: "Unidades", tipo: "entero" },
    { clave: "venta", titulo: "Venta S/", tipo: "soles" }, { clave: "ticket_prom", titulo: "Ticket prom. S/", tipo: "decimal2" },
    { clave: "ultima", titulo: "Última compra", tipo: "texto" },
  ];

  return (
    <div className="grid gap-4">
      {top.length > 0 && (
        <div className="grid gap-2">
          <span className="text-sm font-semibold">Los 15 clientes que más compraron{conTiendas ? " y en qué tiendas" : ""}</span>
          <ResponsiveContainer width="100%" height={Math.max(260, top.length * 30 + 60)}>
            <BarChart data={top} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid horizontal={false} stroke="var(--linea)" strokeDasharray="3 3" />
              <XAxis type="number" tick={EJE} tickFormatter={(v) => compacto(Number(v))} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="nombre" tick={EJE} width={190} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: "var(--superficie-2)" }} formatter={(v, n) => [soles(Number(v)), String(n)]}
                       labelFormatter={(_, p) => String(p?.[0]?.payload?.completo ?? "")}
                       contentStyle={{ background: "var(--superficie)", border: "1px solid var(--linea)", borderRadius: 8, fontSize: 12 }} />
              {conTiendas && <Legend wrapperStyle={{ fontSize: 12 }} />}
              {tiendas.map((t, i) => <Bar key={t} dataKey={t} name={t} stackId="a" fill={COLORES[i % COLORES.length]} maxBarSize={22} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <Tabla archivo={`${archivo}.xlsx`} hoja="Clientes" alto={640} buscar filas={filas} columnas={columnas}
             abrir={(f) => setElegido(clientes.find((c) => c.doc === f.doc) ?? null)} activa={(f) => f.doc === elegido?.doc} />
      <p className="text-xs text-[var(--tenue)]">Haz clic en un cliente para ver el análisis de sus compras y cada comprobante.</p>
      {elegido && <PanelCliente key={elegido.doc} cliente={elegido} consulta={consulta} referencia={referencia} cerrar={() => setElegido(null)}
                                ranking={{ posicion: clientes.findIndex((c) => c.doc === elegido.doc) + 1, total: clientes.length,
                                           participacion: elegido.venta / (clientes.reduce((a, c) => a + c.venta, 0) || 1) }} />}
    </div>
  );
}

type Linea = { fecha_hora: string; tienda: string; comprobante: string; tipo_comprobante: string; sku: string; producto: string;
               und: number; precio_unit: number; total: number; medio_pago: string; vendedor: string };
type Comprobante = { comprobante: string; tipo: string; fecha_hora: string; tienda: string; medio: string; vendedor: string; lineas: Linea[]; und: number; total: number };

/** Panel lateral con el análisis de compras de un cliente, tal como están en ContaNet. */
type Historial = { dias: { fecha: string; venta: number; und: number; comprobantes: number }[]; hasta: string };

type Ranking = { posicion: number; total: number; participacion: number };

function PanelCliente({ cliente, consulta, referencia, ranking, cerrar }: {
  cliente: ClienteContaNet; consulta: ConsultaCompras; referencia: Referencia; ranking: Ranking; cerrar: () => void;
}) {
  const [lineas, setLineas] = useState<Linea[] | null>(null);
  const [historial, setHistorial] = useState<Historial | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const clave = JSON.stringify(consulta);

  useEffect(() => {
    let vivo = true;
    const q = JSON.parse(clave) as ConsultaCompras;
    clienteNavegador().rpc("contanet_historial_cliente", { p_canal: q.canal, p_doc: cliente.doc }).then(({ data }) => {
      if (!vivo || !data) return;
      const h = data as { dias: Record<string, unknown>[]; hasta: string };
      setHistorial({ hasta: h.hasta, dias: h.dias.map((d) => ({ fecha: String(d.fecha), venta: Number(d.venta), und: Number(d.und), comprobantes: Number(d.comprobantes) })) });
    });
    clienteNavegador().rpc("contanet_compras_cliente", { p_canal: q.canal, desde: q.desde, hasta: q.hasta, p_doc: cliente.doc,
      p_tiendas: q.p_tiendas, p_skus: q.p_skus, p_medios: q.p_medios, p_dias: q.p_dias })
      .then(({ data, error: e }) => {
        if (!vivo) return;
        if (e) setError(e.message);
        else setLineas(((data ?? []) as Record<string, unknown>[]).map((r) => ({ ...(r as Linea), und: Number(r.und), precio_unit: Number(r.precio_unit), total: Number(r.total) })));
      });
    return () => { vivo = false; };
  }, [cliente.doc, clave]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && cerrar();
    window.addEventListener("keydown", tecla);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", tecla); document.body.style.overflow = ""; };
  }, [cerrar]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/35" role="dialog" aria-modal aria-label={`Compras de ${cliente.cliente}`}
         onMouseDown={(e) => e.target === e.currentTarget && cerrar()}>
      <aside className="h-full w-full max-w-[860px] bg-[var(--fondo)] shadow-2xl flex flex-col @container">
        <header className="flex items-start justify-between gap-3 border-b border-[var(--linea)] bg-[var(--superficie)] px-5 py-4">
          <div className="grid gap-0.5 min-w-0">
            <span className="etiqueta">Compras del cliente · {fechaLarga(consulta.desde)} – {fechaLarga(consulta.hasta)}</span>
            <h2 className="text-lg font-bold leading-tight">{cliente.cliente}</h2>
            <span className="text-xs text-[var(--tenue)]">{cliente.tipo_doc} {cliente.doc}</span>
          </div>
          <button type="button" className="boton !px-2 shrink-0" onClick={cerrar} aria-label="Cerrar"><X size={16} aria-hidden /></button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {error ? <p className="text-sm text-[var(--critico)]">No se pudo leer el detalle: {error}</p>
            : !lineas ? <p className="flex items-center gap-2 text-sm text-[var(--tenue)]"><LoaderCircle size={14} className="animate-spin" aria-hidden /> Cargando compras…</p>
            : <Analisis lineas={lineas} historial={historial} referencia={referencia} ranking={ranking} abiertos={abiertos} alternar={(c) => setAbiertos((xs) => {
                const n = new Set(xs); if (n.has(c)) n.delete(c); else n.add(c); return n;
              })} />}
        </div>
      </aside>
    </div>
  );
}

function Dato({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <div className="grid gap-0.5 rounded-lg border border-[var(--linea)] bg-[var(--superficie)] px-3 py-2.5 min-w-0">
      <span className="text-[11px] text-[var(--tenue)]">{titulo}</span>
      <b className="num text-[15px] truncate">{valor}</b>
      {detalle && <span className="text-[11px] text-[var(--tenue)] truncate">{detalle}</span>}
    </div>
  );
}

function Analisis({ lineas, historial, referencia, ranking, abiertos, alternar }: {
  lineas: Linea[]; historial: Historial | null; referencia: Referencia; ranking: Ranking; abiertos: Set<string>; alternar: (c: string) => void;
}) {
  // Comprobantes (uno por fila, con sus líneas adentro).
  const porComp = new Map<string, Comprobante>();
  for (const l of lineas) {
    const c = porComp.get(l.comprobante) ?? { comprobante: l.comprobante, tipo: l.tipo_comprobante, fecha_hora: l.fecha_hora, tienda: l.tienda,
      medio: l.medio_pago, vendedor: l.vendedor, lineas: [], und: 0, total: 0 };
    c.lineas.push(l); c.und += l.und; c.total += l.total;
    porComp.set(l.comprobante, c);
  }
  const comprobantes = [...porComp.values()].sort((a, b) => b.fecha_hora.localeCompare(a.fecha_hora));
  const total = lineas.reduce((a, l) => a + l.total, 0), und = lineas.reduce((a, l) => a + l.und, 0);
  const fechas = [...new Set(lineas.map((l) => l.fecha_hora.slice(0, 10)))].sort();
  const frecuencia = fechas.length > 1
    ? Math.round((new Date(fechas[fechas.length - 1]).getTime() - new Date(fechas[0]).getTime()) / 86_400_000 / (fechas.length - 1)) : null;
  const sumaPor = (k: (l: Linea) => string) => {
    const m = new Map<string, { total: number; und: number; n: number }>();
    for (const l of lineas) { const x = m.get(k(l)) ?? { total: 0, und: 0, n: 0 }; x.total += l.total; x.und += l.und; x.n += 1; m.set(k(l), x); }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  };
  const medios = sumaPor((l) => l.medio_pago || "Sin dato");
  const tiendas = sumaPor((l) => l.tienda);
  const productos = sumaPor((l) => l.sku).map(([sku, x]) => {
    return { sku, producto: lineas.find((l) => l.sku === sku)?.producto ?? sku, ...x, precio: x.und ? x.total / x.und : 0 };
  });
  const max = Math.max(...productos.map((p) => p.total), 1);

  return (
    <div className="grid gap-6">
      {/* Cifras clave */}
      <div className="grid gap-2 grid-cols-2 @lg:grid-cols-4">
        <Dato titulo="Total comprado" valor={soles(total)} detalle={`${entero(und)} unidades`} />
        <Dato titulo="Comprobantes" valor={entero(comprobantes.length)} detalle={`ticket prom. ${soles(total / comprobantes.length)}`} />
        <Dato titulo="Compras" valor={`${fechas.length} día(s)`} detalle={frecuencia ? `una cada ~${frecuencia} días` : "una sola fecha"} />
        <Dato titulo="Pago principal" valor={medios[0]?.[0] ?? "—"} detalle={medios.length > 1 ? `${porcentaje(medios[0][1].total / total)} del total` : "único medio"} />
        <Dato titulo="Primera compra" valor={fechaLarga(fechas[0])} />
        <Dato titulo="Última compra" valor={fechaLarga(fechas[fechas.length - 1])} />
        <Dato titulo="Tiendas" valor={String(tiendas.length)} detalle={tiendas.map(([t]) => t).join(", ")} />
        <Dato titulo="Productos distintos" valor={String(productos.length)} />
      </div>

      <Perfil lineas={lineas} comprobantes={comprobantes} historial={historial} referencia={referencia} ranking={ranking} />
      {historial && historial.dias.length > 0 && <Tendencia historial={historial} />}

      {/* Qué compró */}
      <section className="grid gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><ShoppingBag size={15} className="text-[var(--acento)]" aria-hidden /> Qué compró</h3>
        <ul className="grid gap-1.5">
          {productos.map((p) => (
            <li key={p.sku} className="grid @lg:grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 text-sm">
              <div className="relative h-9 rounded-md overflow-hidden bg-[var(--superficie-2)]">
                <div className="absolute inset-y-0 left-0 rounded-md bg-[color-mix(in_srgb,var(--serie-1)_18%,transparent)]" style={{ width: `${Math.max(2, (p.total / max) * 100)}%` }} />
                <span className="relative z-10 flex h-full items-center gap-2 px-3 min-w-0">
                  <span className="truncate">{p.producto}</span>
                  <span className="text-xs text-[var(--tenue)] shrink-0">{entero(p.und)} und · S/ {decimal2(p.precio)} c/u</span>
                </span>
              </div>
              <span className="num text-right @lg:min-w-40">{soles(p.total)} · {porcentaje(p.total / total)}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Dónde compró */}
      {tiendas.length > 1 && (
        <section className="grid gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Store size={15} className="text-[var(--acento)]" aria-hidden /> Dónde compró</h3>
          <div className="flex flex-wrap gap-2">
            {tiendas.map(([t, x]) => (
              <span key={t} className="rounded-lg border border-[var(--linea)] bg-[var(--superficie)] px-3 py-1.5 text-sm">
                <b className="font-medium">{t}</b> · <span className="num">{soles(x.total)}</span> <span className="text-[var(--tenue)]">({porcentaje(x.total / total)})</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Comprobantes: uno por fila; al hacer clic se ven sus productos */}
      <section className="grid gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Receipt size={15} className="text-[var(--acento)]" aria-hidden /> Comprobantes ({comprobantes.length})</h3>
        <ul className="grid gap-1.5">
          {comprobantes.map((c) => {
            const abierto = abiertos.has(c.comprobante);
            return (
              <li key={c.comprobante} className={`rounded-lg border bg-[var(--superficie)] ${abierto ? "border-[var(--acento)]" : "border-[var(--linea)]"}`}>
                <button type="button" onClick={() => alternar(c.comprobante)} aria-expanded={abierto}
                        className="w-full grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 text-left text-sm">
                  <ChevronRight size={15} className={`transition-transform ${abierto ? "rotate-90 text-[var(--acento)]" : "text-[var(--tenue)]"}`} aria-hidden />
                  <span className="grid min-w-0">
                    <span className="font-medium truncate">{c.tipo} {c.comprobante.split("/").slice(1).join("-")}</span>
                    <span className="text-xs text-[var(--tenue)] truncate">
                      {fechaLarga(c.fecha_hora.slice(0, 10))} {c.fecha_hora.slice(11, 16)} · {c.tienda} · {c.medio} · {c.lineas.length} producto(s)
                    </span>
                  </span>
                  <span className="num text-right"><b>{soles(c.total)}</b><span className="block text-xs text-[var(--tenue)]">{entero(c.und)} und</span></span>
                </button>
                {abierto && (
                  <div className="border-t border-[var(--linea)] px-3 py-2">
                    <table className="w-full text-sm">
                      <thead className="text-[11px] uppercase text-[var(--tenue)]">
                        <tr><th className="text-left font-semibold py-1">Producto</th><th className="text-right font-semibold">Und</th>
                          <th className="text-right font-semibold">Precio</th><th className="text-right font-semibold">Total</th></tr>
                      </thead>
                      <tbody>
                        {c.lineas.map((l, i) => (
                          <tr key={i} className="border-t border-[var(--linea)]">
                            <td className="py-1.5 pr-2">{l.producto}</td><td className="num text-right">{entero(l.und)}</td>
                            <td className="num text-right">{decimal2(l.precio_unit)}</td><td className="num text-right">{decimal2(l.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="pt-1.5 text-[11px] text-[var(--tenue)]">Vendedor {c.vendedor}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

const DIAS = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];
const entre = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
const sumarDias = (f: string, n: number) => new Date(new Date(f).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const moda = <T,>(xs: T[]) => {
  const m = new Map<T, number>();
  xs.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0];
};

type Tono = "acento" | "bueno" | "alerta" | "critico" | "neutro";
const TONO: Record<Tono, { texto: string; fondo: string; barra: string }> = {
  acento: { texto: "text-[var(--acento)]", fondo: "bg-[var(--acento-suave)]", barra: "bg-[var(--acento)]" },
  bueno: { texto: "text-[var(--bueno)]", fondo: "bg-[var(--bueno-suave)]", barra: "bg-[var(--bueno)]" },
  alerta: { texto: "text-[var(--alerta)]", fondo: "bg-[var(--alerta-suave)]", barra: "bg-[var(--alerta)]" },
  critico: { texto: "text-[var(--critico)]", fondo: "bg-[var(--critico-suave)]", barra: "bg-[var(--critico)]" },
  neutro: { texto: "text-[var(--tinta)]", fondo: "bg-[var(--superficie-2)]", barra: "bg-[var(--serie-gris)]" },
};

/** Tarjeta de análisis: qué se evaluó, el resultado, un indicador visual y los parámetros usados. */
function Tarjeta({ icono: Icono, etiqueta, resultado, tono, pastilla, medidor, parametros, regla }: {
  icono: LucideIcon; etiqueta: string; resultado: string; tono: Tono; pastilla?: string;
  medidor?: { valor: number; marcas?: { en: number; texto: string }[]; izquierda?: string; derecha?: string };
  parametros: [string, string][]; regla: string;
}) {
  const t = TONO[tono];
  return (
    <article className="rounded-xl border border-[var(--linea)] bg-[var(--superficie)] p-4 grid gap-3 content-start min-w-0">
      <header className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--tenue)]">
          <span className={`grid place-items-center size-7 rounded-lg ${t.fondo} ${t.texto}`}><Icono size={15} aria-hidden /></span>{etiqueta}
        </span>
        {pastilla && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${t.fondo} ${t.texto}`}>{pastilla}</span>}
      </header>
      <b className={`text-[17px] leading-snug ${t.texto}`}>{resultado}</b>
      {medidor && (
        <div className="grid gap-1">
          <div className="relative h-2 rounded-full bg-[var(--superficie-2)]">
            <div className={`absolute inset-y-0 left-0 rounded-full ${t.barra}`} style={{ width: `${Math.min(100, Math.max(3, medidor.valor * 100))}%` }} />
            {medidor.marcas?.map((m) => <span key={m.texto} className="absolute -top-0.5 h-3 w-px bg-[var(--tenue)]" style={{ left: `${m.en * 100}%` }} title={m.texto} />)}
          </div>
          <div className="relative h-3.5 text-[10px] text-[var(--tenue)]">
            {medidor.izquierda && <span className="absolute left-0">{medidor.izquierda}</span>}
            {medidor.marcas?.map((m) => <span key={m.texto} className="absolute -translate-x-1/2" style={{ left: `${m.en * 100}%` }}>{m.texto}</span>)}
            {medidor.derecha && <span className="absolute right-0">{medidor.derecha}</span>}
          </div>
        </div>
      )}
      <dl className="grid gap-1 text-xs">
        {parametros.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 border-b border-dashed border-[var(--linea)] pb-1 last:border-0">
            <dt className="text-[var(--tenue)]">{k}</dt><dd className="num font-medium text-right">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[10.5px] leading-snug text-[var(--tenue)]">Regla: {regla}</p>
    </article>
  );
}

/** Perfil del cliente: cuatro análisis automáticos, cada uno con su resultado, sus parámetros y la regla aplicada. */
function Perfil({ lineas, comprobantes, historial, referencia, ranking }: {
  lineas: Linea[]; comprobantes: Comprobante[]; historial: Historial | null; referencia: Referencia; ranking: Ranking;
}) {
  const und = lineas.reduce((a, l) => a + l.und, 0), total = lineas.reduce((a, l) => a + l.total, 0);
  const n = comprobantes.length || 1;
  const undComp = und / n, ticket = total / n;

  // 1. Valor: posición entre los clientes identificados
  const top = ranking.posicion / ranking.total;
  const valor: { resultado: string; tono: Tono } = ranking.posicion <= 10 ? { resultado: "Cliente clave · top 10", tono: "acento" }
    : top <= 0.2 ? { resultado: "Cliente importante · top 20%", tono: "bueno" } : { resultado: "Cliente regular", tono: "neutro" };

  // 2. Segmento: unidades por comprobante frente al promedio de las tiendas
  const indice = referencia.undTicket ? undComp / referencia.undTicket : null;
  const segmento: { resultado: string; tono: Tono } = indice === null ? { resultado: "Sin referencia", tono: "neutro" }
    : indice >= 5 ? { resultado: "Compra por volumen · posible revendedor o mayorista", tono: "acento" }
    : indice >= 1.5 ? { resultado: "Compra más que el promedio", tono: "bueno" } : { resultado: "Cliente habitual", tono: "neutro" };

  // 3. Recompra: días sin comprar frente a su frecuencia
  const fechas = historial?.dias.map((d) => d.fecha) ?? [];
  const ultima = fechas[fechas.length - 1];
  const frecuencia = fechas.length > 1 ? entre(fechas[0], ultima) / (fechas.length - 1) : null;
  const recencia = historial && ultima ? entre(ultima, historial.hasta) : null;
  const umbral = frecuencia !== null ? Math.max(1, Math.round(frecuencia * 1.5)) : null;
  const confianza = fechas.length >= 8 ? "alta" : fechas.length >= 4 ? "media" : "baja";
  const recompra: { resultado: string; tono: Tono; pastilla?: string } = recencia === null ? { resultado: "Cargando…", tono: "neutro" }
    : frecuencia === null ? { resultado: "Compró un solo día", tono: "neutro" }
    : recencia <= umbral! ? { resultado: "Al día", tono: "bueno", pastilla: `confianza ${confianza}` }
    : { resultado: `Atrasado ${recencia - Math.round(frecuencia)} días`, tono: "critico", pastilla: `confianza ${confianza}` };
  const proxima = frecuencia !== null && ultima ? sumarDias(ultima, Math.round(frecuencia)) : null;

  // 4. Hábito: día y hora con más comprobantes
  const dias = comprobantes.map((c) => new Date(`${c.fecha_hora.slice(0, 10)}T12:00:00`).getDay());
  const horas = comprobantes.map((c) => Number(c.fecha_hora.slice(11, 13)));
  const [dia, nDia] = moda(dias) ?? [undefined, 0];
  const [hora, nHora] = moda(horas) ?? [undefined, 0];
  const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">Perfil del cliente</h3>
        <span className="flex items-center gap-1.5 rounded-full bg-[var(--acento-suave)] px-2.5 py-1 text-[11px] font-semibold text-[var(--acento)]">
          <Sparkles size={12} aria-hidden /> Detectado automáticamente · {comprobantes.length} comprobante(s), {fechas.length || "…"} día(s) de compra
        </span>
      </div>
      <div className="grid gap-3 @2xl:grid-cols-2">
        <Tarjeta icono={Crown} etiqueta="Valor del cliente" resultado={valor.resultado} tono={valor.tono} pastilla={`#${ranking.posicion} de ${ranking.total}`}
                 medidor={{ valor: 1 - (ranking.posicion - 1) / Math.max(1, ranking.total - 1), izquierda: `#${ranking.total}`, derecha: "#1" }}
                 parametros={[["Compra en el periodo", soles(total)], ["Posición", `${ranking.posicion} de ${ranking.total} identificados`],
                   ["% de la venta identificada", porcentaje(ranking.participacion)]]}
                 regla="top 10 = clave · top 20% = importante · resto = regular (entre los clientes con DNI/RUC)." />
        <Tarjeta icono={Gauge} etiqueta="Segmento" resultado={segmento.resultado} tono={segmento.tono}
                 pastilla={indice !== null ? `índice ${entero(indice)}×` : undefined}
                 medidor={indice !== null ? { valor: Math.min(indice, 10) / 10, marcas: [{ en: 0.15, texto: "1.5×" }, { en: 0.5, texto: "5×" }], izquierda: "0×", derecha: "10×+" } : undefined}
                 parametros={[["Unidades por comprobante", entero(undComp)], ["Promedio de las tiendas", `${entero(referencia.undTicket)} und`],
                   ["Ticket promedio", soles(ticket)], ["Ticket prom. de las tiendas", soles(referencia.ticketProm)]]}
                 regla="índice = sus unidades por comprobante ÷ el promedio de las tiendas. ≥5× volumen · 1.5–5× más que el promedio · menos de 1.5× habitual." />
        <Tarjeta icono={RefreshCw} etiqueta="Recompra" resultado={recompra.resultado} tono={recompra.tono} pastilla={recompra.pastilla}
                 medidor={umbral !== null && recencia !== null ? { valor: recencia / (umbral * 2), marcas: [{ en: 0.5, texto: "alerta" }], izquierda: "hoy", derecha: `${umbral * 2} d` } : undefined}
                 parametros={[["Última compra", ultima ? fechaLarga(ultima) : "—"], ["Días sin comprar", recencia === null ? "—" : String(recencia)],
                   ["Frecuencia habitual", frecuencia === null ? "—" : `cada ~${Math.round(frecuencia)} días`],
                   ["Alerta desde", umbral === null ? "—" : `${umbral} días sin comprar`],
                   ["Próxima compra estimada", proxima ? fechaLarga(proxima) : "—"]]}
                 regla={`al día si los días sin comprar no pasan de 1.5× su frecuencia. Confianza según días de compra: baja <4 · media 4–7 · alta ≥8. Datos hasta el ${historial ? fechaLarga(historial.hasta) : "—"}.`} />
        <Tarjeta icono={CalendarClock} etiqueta="Hábito de compra" tono="neutro"
                 resultado={dia !== undefined && hora !== undefined ? `${DIAS[dia][0].toUpperCase()}${DIAS[dia].slice(1)} · ${hh(hora)}–${hh(hora).slice(0, 2)}:59` : "—"}
                 pastilla={comprobantes.length < 3 ? "pocos datos" : undefined}
                 parametros={[["Día más frecuente", dia !== undefined ? `${DIAS[dia]} (${porcentaje(nDia / n)} de sus comprobantes)` : "—"],
                   ["Hora más frecuente", hora !== undefined ? `${hh(hora)} (${porcentaje(nHora / n)})` : "—"],
                   ["Comprobantes analizados", String(comprobantes.length)]]}
                 regla="el día de la semana y la hora con más comprobantes en el periodo elegido." />
      </div>
    </section>
  );
}

/** Tendencia de compra: todo el historial del cliente en ContaNet, por día (o por semana si es largo). */
function Tendencia({ historial }: { historial: Historial }) {
  const porSemana = historial.dias.length > 45;
  const lunes = (f: string) => { const d = new Date(`${f}T12:00:00`); return sumarDias(f, -((d.getDay() + 6) % 7)); };
  const m = new Map<string, { periodo: string; venta: number; und: number; comprobantes: number }>();
  for (const d of historial.dias) {
    const k = porSemana ? lunes(d.fecha) : d.fecha;
    const x = m.get(k) ?? { periodo: k, venta: 0, und: 0, comprobantes: 0 };
    x.venta += d.venta; x.und += d.und; x.comprobantes += d.comprobantes; m.set(k, x);
  }
  const datos = [...m.values()].sort((a, b) => a.periodo.localeCompare(b.periodo));
  const promedio = datos.reduce((a, d) => a + d.venta, 0) / datos.length;
  const etiqueta = (f: string) => `${porSemana ? "Sem. " : ""}${f.slice(8, 10)}/${f.slice(5, 7)}`;
  return (
    <section className="grid gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><TrendingUp size={15} className="text-[var(--acento)]" aria-hidden /> Tendencia de compra</h3>
      <p className="text-xs text-[var(--tenue)]">Cada barra es un {porSemana ? "semana" : "día"} en que compró (todo lo cargado de ContaNet, no solo el periodo elegido).
        Línea punteada: su compra promedio, {soles(promedio)}.</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={datos} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--linea)" strokeDasharray="3 3" />
          <XAxis dataKey="periodo" tickFormatter={etiqueta} tick={EJE} axisLine={false} tickLine={false} minTickGap={8} />
          <YAxis tick={EJE} tickFormatter={(v) => compacto(Number(v))} axisLine={false} tickLine={false} width={44} />
          <Tooltip cursor={{ fill: "var(--superficie-2)" }} labelFormatter={(f) => (porSemana ? `Semana del ${fechaLarga(String(f))}` : fechaLarga(String(f)))}
                   formatter={(v, n) => (n === "venta" ? [soles(Number(v)), "Compró"] : [String(v), String(n)])}
                   contentStyle={{ background: "var(--superficie)", border: "1px solid var(--linea)", borderRadius: 8, fontSize: 12 }} />
          <ReferenceLine y={promedio} stroke="var(--serie-gris)" strokeDasharray="5 4" />
          <Bar dataKey="venta" name="venta" fill="var(--serie-1)" radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}
