import { CalendarDays, Scale, Store } from "lucide-react";
import { salir } from "@/app/login/actions";
import { Filtros } from "@/components/Filtros";
import { GraficoTendencia, Indicador } from "@/components/Graficos";
import { Marco } from "@/components/Marco";
import { Tabla, type Columna } from "@/components/Tabla";
import { Tarjeta } from "@/components/ui";
import { cobertura, conciliacion, type FilaConciliacion } from "@/lib/contanet";
import { entero, porcentaje, soles } from "@/lib/formato";
import type { Agrupar } from "@/lib/kpi";
import { DIAS_SEM, diaSemana, diasEntre, fechaLarga, inicioMes, lunesDe, PERIODOS, rangoPeriodo, type Periodo } from "@/lib/periodos";
import { tiposRetail } from "@/lib/retail";
import { clienteSupabase } from "@/lib/supabase/server";
import { ResumenEjecutivo } from "@/components/ResumenEjecutivo";
import { CONFIG, datosEjecutivo } from "@/lib/ejecutivo";


export const metadata = { title: "Tiendas · Resumen · Calderón" };

type Params = Promise<{ [k: string]: string | string[] | undefined }>;
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
type Suma = { und_interno: number; venta_interno: number; und_contanet: number; venta_contanet: number };
const cero = (): Suma => ({ und_interno: 0, venta_interno: 0, und_contanet: 0, venta_contanet: 0 });
const sumar = (a: Suma, b: Suma) => { a.und_interno += b.und_interno; a.venta_interno += b.venta_interno; a.und_contanet += b.und_contanet; a.venta_contanet += b.venta_contanet; };
/** Diferencias ContaNet − Reporte interno y cómo leerlas. */
function comparar(s: Suma) {
  const dif = s.venta_contanet - s.venta_interno;
  const pct = s.venta_interno ? dif / s.venta_interno : null;
  const estado = !s.venta_contanet && s.venta_interno ? "Falta en ContaNet" : !s.venta_interno && s.venta_contanet ? "Falta en reporte interno"
    : Math.abs(dif) < 0.005 ? "Cuadra" : Math.abs(pct ?? 1) <= 0.005 ? "Casi igual (≤0.5%)" : "Diferencia";
  return { ...s, dif_und: s.und_contanet - s.und_interno, dif, pct, estado };
}

/** Resumen de tiendas: la venta del Reporte interno (Excel de los jefes) frente a la de ContaNet, por tienda y por día. */
export default async function ResumenTiendas({ searchParams }: { searchParams: Params }) {
  const sp = await searchParams;
  const sb = await clienteSupabase();
  const { data: { user } } = await sb.auth.getUser();
  const [cob, tipos] = await Promise.all([cobertura(sb), tiposRetail(sb)]);
  const hastas = [cob.interno_hasta, cob.contanet_hasta].filter(Boolean) as string[];
  if (!hastas.length) return <main className="p-8"><h1 className="text-2xl font-bold">Tiendas</h1><p>Todavía no hay datos de tiendas.</p></main>;

  // Se mide hasta el último día que tienen las dos fuentes (si solo hay una, hasta su último día).
  const ultimo = hastas.sort()[0];
  const primero = [cob.interno_desde, cob.contanet_desde].filter(Boolean).sort().reverse()[0] ?? ultimo;
  const periodo = (uno(sp.p) as Periodo) in PERIODOS ? (uno(sp.p) as Periodo) : "mes";
  const [desde, hasta] = rangoPeriodo(periodo, ultimo, primero, uno(sp.d1), uno(sp.d2));
  const agrupar = (["dia", "semana", "mes"].includes(uno(sp.g) ?? "") ? uno(sp.g) : "dia") as Agrupar;
  const [filas, ej] = await Promise.all([conciliacion(sb, desde, hasta), datosEjecutivo(sb, "tiendas", desde, hasta)]);

  const T = cero(); filas.forEach((f) => sumar(T, f));
  const total = comparar(T);
  const agrupa = (clave: (f: FilaConciliacion) => string) => {
    const m = new Map<string, Suma>();
    for (const f of filas) { const k = clave(f); const s = m.get(k) ?? cero(); sumar(s, f); m.set(k, s); }
    return [...m.entries()].map(([k, s]) => ({ clave: k, ...comparar(s) }));
  };
  const periodoDe = (f: string) => (agrupar === "dia" ? f : agrupar === "semana" ? lunesDe(f) : inicioMes(f));
  const porTienda = agrupa((f) => f.tienda).sort((a, b) => b.venta_interno - a.venta_interno);
  const porPeriodo = agrupa((f) => periodoDe(f.fecha)).sort((a, b) => a.clave.localeCompare(b.clave));
  const tendencia = porPeriodo.map((p) => ({ periodo: p.clave, venta: p.venta_interno, und: p.und_interno, costo: 0,
    venta_c: p.venta_contanet, und_c: p.und_contanet, costo_c: null }));
  const etiqueta = (p: string) => (agrupar === "mes" ? `${p.slice(5, 7)}/${p.slice(0, 4)}` : fechaLarga(p));
  const rango = `${fechaLarga(desde)} – ${fechaLarga(hasta)}`;
  const archivo = (n: string) => `tiendas_resumen_${n}_${desde}_${hasta}.xlsx`;
  const cols: Columna[] = [
    { clave: "und_interno", titulo: "Und reporte interno", tipo: "entero" }, { clave: "und_contanet", titulo: "Und ContaNet", tipo: "entero" },
    { clave: "dif_und", titulo: "Dif. und", tipo: "entero" },
    { clave: "venta_interno", titulo: "Venta reporte interno S/", tipo: "soles" }, { clave: "venta_contanet", titulo: "Venta ContaNet S/", tipo: "soles" },
    { clave: "dif", titulo: "Diferencia S/", tipo: "soles" }, { clave: "pct", titulo: "Dif. %", tipo: "porcentaje" },
    { clave: "estado", titulo: "Estado", tipo: "texto" },
  ];
  const sinContaNet = !cob.contanet_hasta;

  const encabezado = (
    <header className="grid gap-4">
      <div className="grid gap-1">
        <p className="etiqueta">Tiendas · Resumen · Turrones Calderón</p>
        <h1 className="text-[28px] font-extrabold leading-tight">Reporte interno vs ContaNet</h1>
        <p className="text-sm text-[var(--tenue)]">
          <b className="text-[var(--tinta)]">{PERIODOS[periodo]}</b> · {rango} · {diasEntre(desde, hasta)} días ·
          Reporte interno del {cob.interno_desde ? fechaLarga(cob.interno_desde) : "—"} al {cob.interno_hasta ? fechaLarga(cob.interno_hasta) : "—"} ·
          ContaNet del {cob.contanet_desde ? fechaLarga(cob.contanet_desde) : "—"} al {cob.contanet_hasta ? fechaLarga(cob.contanet_hasta) : "—"}
        </p>
      </div>
      <Filtros ultimo={ultimo} primero={primero} grupos={[]} dias={false} comparar={false} />
    </header>
  );

  const contenido = (
    <>
      {sinContaNet && (
        <p className="tarjeta p-4 text-sm">Todavía no hay datos de ContaNet: súbelos en <b>Tiendas → ContaNet → Cargar reporte ContaNet</b> para ver la comparación.</p>
      )}
      <div className="grid gap-4 grid-cols-1 @lg:grid-cols-2 @5xl:grid-cols-4">
        <Indicador icono="venta" titulo="Venta · Reporte interno" valor={soles(total.venta_interno)} detalle={`${entero(total.und_interno)} und`} />
        <Indicador icono="venta" titulo="Venta · ContaNet" valor={soles(total.venta_contanet)} detalle={`${entero(total.und_contanet)} und`} />
        <Indicador icono="ingreso" titulo="Diferencia (ContaNet − interno)" valor={soles(total.dif)}
                   detalle={total.pct === null ? "—" : `${total.pct >= 0 ? "+" : ""}${porcentaje(total.pct)} sobre el reporte interno`} />
        <Indicador icono="unidades" titulo="Diferencia en unidades" valor={entero(total.dif_und)}
                   detalle={total.und_interno ? `${total.dif_und >= 0 ? "+" : ""}${porcentaje(total.dif_und / total.und_interno)}` : "—"} />
      </div>
      {filas.length === 0 ? <p className="text-sm text-[var(--tenue)]">No hay ventas en este periodo.</p> : (
        <>
          <GraficoTendencia datos={tendencia} agrupar={agrupar} conPrevio={!sinContaNet} nombrePrevio="ContaNet" rango={rango}
                            metricas={["venta", "und"]} nombres={{ venta: "Venta reporte interno", und: "Unidades reporte interno" }} />
          <Tarjeta icono={Store} titulo="Por tienda" subtitulo={`Diferencia = ContaNet − Reporte interno · ${rango}`}>
            <Tabla archivo={archivo("tiendas")} hoja="Por tienda" filas={porTienda.map((t) => ({ ...t, tienda: t.clave }))}
                   columnas={[{ clave: "tienda", titulo: "Tienda", tipo: "texto" }, ...cols]} total={{ tienda: "TOTAL", ...total }} />
          </Tarjeta>
          <Tarjeta icono={CalendarDays} titulo={`Por ${agrupar === "dia" ? "día" : agrupar}`} subtitulo="Para ubicar los días que no cuadran: ordena por «Diferencia S/» o busca «Falta»">
            <Tabla archivo={archivo("periodos")} hoja="Por periodo" alto={520} buscar
                   filas={[...porPeriodo].reverse().map((p) => ({ ...p, periodo: etiqueta(p.clave), dia: agrupar === "dia" ? DIAS_SEM[diaSemana(p.clave)] : "" }))}
                   columnas={[{ clave: "periodo", titulo: agrupar === "mes" ? "Mes" : agrupar === "semana" ? "Semana (lunes)" : "Día", tipo: "texto" },
                     ...(agrupar === "dia" ? [{ clave: "dia", titulo: "", tipo: "texto" } as Columna] : []), ...cols]}
                   total={{ periodo: "TOTAL", ...total }} />
          </Tarjeta>
          <Tarjeta icono={Scale} titulo="Cómo leer esta comparación">
            <ul className="grid gap-1 text-sm list-disc pl-5 text-[var(--tenue)]">
              <li><b className="text-[var(--tinta)]">Reporte interno</b>: los Excel de venta diaria de cada tienda (lo que usa el Power BI de los jefes).</li>
              <li><b className="text-[var(--tinta)]">ContaNet</b>: los comprobantes del ERP de las 7 tiendas, sin lo cobrado con RAPPI (canal aparte, como en el consolidado) ni el usuario VENTAS01 (canal digital); las notas de crédito restan.</li>
              <li>Una diferencia puede venir de ventas no registradas en uno de los dos, anulaciones, o un producto registrado con otro código o precio.</li>
              <li>El periodo llega hasta el último día que tienen las dos fuentes, para no comparar días que una todavía no tiene.</li>
            </ul>
          </Tarjeta>
        </>
      )}
    </>
  );

  return (
    <Marco seccion={sp.s} ubicacion="tiendas/resumen" tiposRetail={tipos} encabezado={encabezado} usuario={user?.email} salir={salir} datosAl={fechaLarga(ultimo)}
           secciones={[{ id: "ejecutivo", titulo: "Resumen ejecutivo", contenido: <ResumenEjecutivo datos={ej} desde={desde} hasta={hasta} config={CONFIG.tiendas} archivo="tiendas_ejecutivo" /> },
             { id: "ventas", titulo: "Interno vs ContaNet", contenido }]} />
  );
}
