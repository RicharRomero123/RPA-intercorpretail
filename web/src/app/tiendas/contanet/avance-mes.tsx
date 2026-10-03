// Sección «Avance del mes» de las vistas de ContaNet: cómo va el mes contra el año pasado (mismo corte, misma fecha calendario)
// y contra la meta del mes del consolidado, y en cuánto cerraría.
// Proyección: lo vendido en los días cerrados + los días que faltan con la venta del mismo día de la semana del año pasado
// × el ritmo actual (lo vendido ÷ lo que se vendió esos mismos días el año pasado). Sin año pasado: promedio diario × días que faltan.
import { CalendarRange, Flag, Store } from "lucide-react";
import { GraficoAvanceMes, type PuntoMes } from "@/components/GraficoAvanceMes";
import { Indicador } from "@/components/Graficos";
import { Tabla } from "@/components/Tabla";
import { Aviso, Tarjeta } from "@/components/ui";
import type { AvanceMes } from "@/lib/contanet";
import { porcentaje, soles } from "@/lib/formato";
import { fechaLarga } from "@/lib/periodos";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const variacion = (a: number, b: number | null) => (b ? a / b - 1 : null);
const hoyLima = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());

export function seccionAvanceMes(m: AvanceMes, meta: number | null, conTiendas: boolean, dim: string, archivo: string, nombreMeta: string) {
  if (!m.fecha) return <p className="text-sm text-[var(--tenue)]">Todavía no hay ventas cargadas de ContaNet.</p>;
  const mes = MESES[Number(m.fecha.slice(5, 7)) - 1], anio = Number(m.fecha.slice(0, 4));
  const esHoy = m.fecha === hoyLima();
  // Días cerrados: hasta ayer si el último día cargado es hoy (hoy va a medias); si no, hasta el último día cargado.
  const cerrados = m.dias.filter((d) => d.venta !== null && (!esHoy || d.dia < m.fecha!));
  const hoy = esHoy ? m.dias.find((d) => d.dia === m.fecha) : undefined;
  const faltan = m.dias.filter((d) => d.venta === null || (esHoy && d.dia === m.fecha));
  const real = m.dias.reduce((a, d) => a + (d.venta ?? 0), 0);
  const realCerrado = cerrados.reduce((a, d) => a + (d.venta ?? 0), 0);
  const lyCorte = m.dias.filter((d) => d.venta !== null).reduce((a, d) => a + (d.ly_fecha ?? 0), 0);
  const lyMes = m.dias.reduce((a, d) => a + (d.ly_fecha ?? 0), 0);
  const lySemCerrado = cerrados.reduce((a, d) => a + (d.ly_sem ?? 0), 0);
  const conLY = lySemCerrado > 0 && faltan.every((d) => d.ly_sem !== null);
  const ritmo = conLY ? realCerrado / lySemCerrado : null;
  const promedio = cerrados.length ? realCerrado / cerrados.length : 0;
  const esperadoDia = (d: AvanceMes["dias"][number]) => (conLY ? (d.ly_sem ?? 0) * ritmo! : promedio);
  // Hoy: lo que ya se vendió o lo esperado del día completo, lo que sea mayor.
  const proyeccion = realCerrado + faltan.reduce((a, d) => a + (hoy && d.dia === hoy.dia ? Math.max(hoy.venta ?? 0, esperadoDia(d)) : esperadoDia(d)), 0);
  const necesario = meta !== null && faltan.length ? Math.max(0, meta - realCerrado) / faltan.length : null;

  // Serie acumulada para el gráfico.
  let acR = 0, acP = 0, acL = 0;
  const puntos: PuntoMes[] = m.dias.map((d) => {
    acL += d.ly_fecha ?? 0;
    const esFalta = faltan.includes(d);
    if (!esFalta) acR += d.venta ?? 0;
    const valorDia = esFalta ? (hoy && d.dia === hoy.dia ? Math.max(hoy.venta ?? 0, esperadoDia(d)) : esperadoDia(d)) : (d.venta ?? 0);
    acP += valorDia;
    const ultimoCerrado = cerrados.length && d.dia === cerrados[cerrados.length - 1].dia;
    return { dia: Number(d.dia.slice(8, 10)), real: esFalta ? (hoy && d.dia === hoy.dia ? acR + (hoy.venta ?? 0) : null) : acR,
             proyeccion: esFalta || ultimoCerrado ? acP : null, anterior: lyMes ? acL : null };
  });

  // Cuánto se debería llevar a la fecha para ir en camino a la meta: la meta repartida como se vendió el mes el año pasado
  // (sin año pasado, en partes iguales por día).
  // Si hoy va a medias, la referencia llega hasta ayer (para no pedirle a hoy el día completo).
  const lyHasta = cerrados.reduce((a, d) => a + (d.ly_fecha ?? 0), 0);
  const parteEsperada = lyMes > 0 ? lyHasta / lyMes : cerrados.length / m.dias.length;
  const deberiasLlevar = meta !== null ? meta * parteEsperada : null;
  const filas = m.tiendas.map((t) => ({ ...t, var: variacion(t.mes, t.ly_corte), proy: t.ly_corte ? t.mes * ((t.ly_mes ?? 0) / t.ly_corte) : null }));
  const corteTxt = esHoy ? `hoy ${fechaLarga(m.fecha)}${m.corte ? ` hasta las ${m.corte.slice(0, 5)}` : ""}` : `al ${fechaLarga(m.fecha)}`;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--linea)] bg-[var(--superficie)] px-3 py-2 text-sm">
        <CalendarRange size={15} className="text-[var(--acento)]" aria-hidden />
        <b>{mes.charAt(0).toUpperCase() + mes.slice(1)} {anio}: del 1 {corteTxt}</b>
        <span className="text-xs text-[var(--tenue)]">· {cerrados.length} días cerrados, faltan {faltan.length - (hoy ? 1 : 0)} días{hoy ? " más el de hoy" : ""}
          · meta del mes: {nombreMeta}</span>
      </div>

      {meta !== null && (() => {
        // Barra de la meta del mes: se llena con lo acumulado (sólido) y la proyección hasta el cierre (claro).
        const ancho = (v: number) => `${Math.min(100, Math.max(0, (v / meta) * 100))}%`;
        const vaBien = deberiasLlevar !== null && real >= deberiasLlevar;
        return (
          <Tarjeta icono={Flag} titulo={`Meta de ${mes}: ${soles(meta)}`} subtitulo={`Meta del mes según el consolidado (${nombreMeta})`}>
            <div className="grid gap-2">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <span className="text-sm"><b className="num text-[22px] text-[var(--acento)]">{soles(real)}</b>
                  <span className="text-[var(--tenue)]"> acumulado · </span><b className="num">{porcentaje(real / meta)}</b> de la meta</span>
                <span className="text-sm text-[var(--tenue)]">faltan <b className="num text-[var(--tinta)]">{soles(Math.max(0, meta - real))}</b></span>
              </div>
              <div className="relative h-7 rounded-md bg-[var(--superficie-2)] border border-[var(--linea)] overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-[color-mix(in_srgb,var(--serie-1)_22%,transparent)] border-r border-dashed border-[var(--serie-1)]"
                     style={{ width: ancho(proyeccion) }} title={`Proyección al cierre: ${soles(proyeccion)}`} />
                <div className="absolute inset-y-0 left-0 bg-[var(--serie-1)]" style={{ width: ancho(real) }} title={`Acumulado: ${soles(real)}`} />
                {deberiasLlevar !== null && (
                  <div className="absolute -inset-y-0.5 w-0.5 bg-[var(--tinta)]" style={{ left: ancho(deberiasLlevar) }}
                       title={`Deberías llevar ${soles(deberiasLlevar)} a esta fecha`} />
                )}
              </div>
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-[var(--tenue)]">
                <span><span className="inline-block size-2.5 rounded-sm bg-[var(--serie-1)] align-middle" /> acumulado {soles(real)}</span>
                <span><span className="inline-block size-2.5 rounded-sm bg-[color-mix(in_srgb,var(--serie-1)_22%,transparent)] border border-dashed border-[var(--serie-1)] align-middle" />
                  {" "}proyección al cierre {soles(proyeccion)} ({porcentaje(proyeccion / meta)})</span>
                {deberiasLlevar !== null && <span><span className="inline-block w-0.5 h-3 bg-[var(--tinta)] align-middle" /> a esta fecha deberías llevar{" "}
                  <b className="num text-[var(--tinta)]">{soles(deberiasLlevar)}</b>{" "}
                  (<b className={vaBien ? "text-[var(--bueno)]" : "text-[var(--critico)]"}>{vaBien ? "vas adelante" : "vas atrás"} por {soles(Math.abs(real - deberiasLlevar))}</b>)</span>}
              </div>
              <p className="text-xs text-[var(--tenue)]">
                La raya marca cuánto de la meta tendría que estar cubierto hoy para llegar al cierre:{" "}
                {lyMes > 0 ? `a esta fecha, en ${mes} ${anio - 1} ya se había vendido el ${porcentaje(parteEsperada)} del mes` : "la meta repartida en partes iguales por día"}.
              </p>
            </div>
          </Tarjeta>
        );
      })()}

      <div className="grid gap-4 grid-cols-1 @lg:grid-cols-2 @5xl:grid-cols-4">
        <Indicador icono="venta" titulo="Venta del mes a la fecha" valor={soles(real)} variacion={lyCorte ? variacion(real, lyCorte) : null}
                   comparadoCon={`${anio - 1} al mismo corte`} detalle={lyCorte ? undefined : "sin dato del año pasado"} />
        <Indicador icono="cobertura" titulo="Avance de la meta del mes" valor={meta ? porcentaje(real / meta) : "—"}
                   detalle={meta ? `de ${soles(meta)} · faltan ${soles(Math.max(0, meta - real))}` : "sin meta en el consolidado"} />
        <Indicador icono="rotacion" titulo="Proyección al cierre" valor={soles(proyeccion)}
                   detalle={meta ? `${porcentaje(proyeccion / meta)} de la meta${lyMes ? ` · ${variacion(proyeccion, lyMes)! >= 0 ? "+" : "−"}${porcentaje(Math.abs(variacion(proyeccion, lyMes)!))} vs ${mes} ${anio - 1}` : ""}`
                     : lyMes ? `${porcentaje(variacion(proyeccion, lyMes))} vs ${mes} ${anio - 1}` : "con el promedio diario del mes"} />
        <Indicador icono="ingreso" titulo="Necesario por día para la meta" valor={necesario === null ? "—" : soles(necesario)}
                   detalle={necesario === null ? "sin meta" : cerrados.length ? `vas ${soles(realCerrado / cerrados.length)} por día en promedio` : ""} />
      </div>

      {meta !== null && (
        <Aviso tipo={proyeccion >= meta ? "bueno" : proyeccion >= meta * 0.9 ? "alerta" : "critico"}
               titulo={proyeccion >= meta ? `Al ritmo actual, ${mes} cerraría en ${soles(proyeccion)}: llega a la meta (${porcentaje(proyeccion / meta)})`
                 : `Al ritmo actual, ${mes} cerraría en ${soles(proyeccion)}: ${porcentaje(proyeccion / meta)} de la meta, faltarían ${soles(meta - proyeccion)}`}>
          {conLY ? <>Proyección: lo vendido + cada día que falta con la venta del mismo día de la semana de {anio - 1} × el ritmo actual
            ({ritmo! >= 1 ? "+" : "−"}{porcentaje(Math.abs(ritmo! - 1))} vs esos mismos días de {anio - 1}). Captura el peso de cada semana del mes
            (en octubre, la semana del Señor de los Milagros).</> : <>Proyección con el promedio diario de lo que va del mes (no hay venta del año pasado para este canal).</>}
          {" "}Es una estimación: temprano en el mes cambia más.
        </Aviso>
      )}

      <Tarjeta icono={CalendarRange} titulo={`${mes.charAt(0).toUpperCase() + mes.slice(1)} día a día, acumulado`}
               subtitulo={`Real hasta ${esHoy ? "hoy" : fechaLarga(m.fecha)} · proyección punteada hasta el ${fechaLarga(m.fin!)} · ${anio - 1} misma fecha (gris)${meta ? " · línea de meta" : ""}`}>
        <GraficoAvanceMes puntos={puntos} meta={meta} etiquetaAnterior={`${mes} ${anio - 1}`} />
      </Tarjeta>

      {conTiendas && filas.length > 0 && (
        <Tarjeta icono={Store} titulo={`Por ${dim.toLowerCase()}`} subtitulo={`Del 1 ${corteTxt} vs ${anio - 1} al mismo corte`}>
          <Tabla archivo={`${archivo}.xlsx`} hoja="Avance del mes" filas={filas}
                 columnas={[{ clave: "tienda", titulo: dim, tipo: "texto" }, { clave: "mes", titulo: `${mes} ${anio} a la fecha S/`, tipo: "soles" },
                   { clave: "ly_corte", titulo: `${anio - 1} mismo corte S/`, tipo: "soles" }, { clave: "var", titulo: "Variación", tipo: "porcentaje" },
                   { clave: "ly_mes", titulo: `${mes} ${anio - 1} completo S/`, tipo: "soles" },
                   { clave: "proy", titulo: "Proyección al cierre S/", tipo: "soles" }]}
                 total={{ tienda: "TOTAL", mes: real, ly_corte: lyCorte || null, var: lyCorte ? variacion(real, lyCorte) : null, ly_mes: lyMes || null, proy: proyeccion }} />
          <p className="text-xs text-[var(--tenue)]">Proyección por {dim.toLowerCase()}: lo que lleva × (su {mes} {anio - 1} completo ÷ lo que llevaba a esta fecha en
            {" "}{anio - 1}). El total usa la proyección día a día de arriba, por eso puede no ser la suma exacta de las filas.</p>
        </Tarjeta>
      )}
    </>
  );
}
