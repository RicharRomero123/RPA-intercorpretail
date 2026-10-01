// Sección «Avance del día» de las vistas de ContaNet: cómo va el día hora por hora frente al mismo día de la semana pasada.
import { CalendarClock, Clock, Store } from "lucide-react";
import { GraficoAvance } from "@/components/GraficoAvance";
import { Indicador } from "@/components/Graficos";
import { Tabla } from "@/components/Tabla";
import { Tarjeta } from "@/components/ui";
import type { Avance } from "@/lib/contanet";
import { entero, porcentaje, soles } from "@/lib/formato";
import { fechaLarga, sumarDias } from "@/lib/periodos";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const variacion = (a: number, b: number) => (b ? a / b - 1 : null);
const hoyLima = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
const horaLima = (iso: string) => new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

export function seccionAvance(av: Avance, meta: number | null, conTiendas: boolean, archivo: string) {
  if (!av.fecha) return <p className="text-sm text-[var(--tenue)]">Todavía no hay ventas cargadas de ContaNet.</p>;
  const fecha = av.fecha, esHoy = fecha === hoyLima();
  const corte = av.corte ? av.corte.slice(0, 5) : null;
  const horaCorte = esHoy && corte ? Number(corte.slice(0, 2)) : null;
  const antes = sumarDias(fecha, -7);
  const diaSemana = DIAS[new Date(`${fecha}T12:00:00`).getDay()];
  const T = av.tiendas.reduce((a, t) => ({ hoy: a.hoy + t.hoy, antes: a.antes + t.antes_corte, antesDia: a.antesDia + t.antes_dia, tickets: a.tickets + t.tickets,
    ticketsAntes: a.ticketsAntes + t.tickets_antes, ly: a.ly + (t.anio_pasado ?? 0) }),
    { hoy: 0, antes: 0, antesDia: 0, tickets: 0, ticketsAntes: 0, ly: 0 });
  const hayLY = av.tiendas.some((t) => t.anio_pasado !== null);
  // Parte del día que normalmente ya pasó a esta hora (según el mismo día de la semana pasada) y proyección del día.
  const avanceNormal = esHoy && T.antesDia ? T.antes / T.antesDia : null;
  const proyeccion = esHoy && avanceNormal ? T.hoy / avanceNormal : T.hoy;
  const titulo = esHoy ? `Hoy ${fechaLarga(fecha)} hasta las ${corte ?? "—"}` : `${fechaLarga(fecha)} (último día cargado, cerrado)`;
  const compara = esHoy ? `${diaSemana} pasado (${fechaLarga(antes)}) hasta la misma hora` : `${diaSemana} pasado (${fechaLarga(antes)})`;

  // Ritmo para la meta del mes: lo que falta repartido en los días que quedan (incluido el día que se mira).
  const anio = Number(fecha.slice(0, 4)), mes = Number(fecha.slice(5, 7)), dia = Number(fecha.slice(8, 10));
  const diasMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const necesario = meta ? Math.max(0, meta - av.mes) / (diasMes - dia + 1) : null;

  const porTienda = av.tiendas.map((t) => ({ ...t, var: variacion(t.hoy, t.antes_corte), var_tickets: variacion(t.tickets, t.tickets_antes),
    alcanzado: t.anio_pasado ? t.hoy / t.anio_pasado : null }))
    .sort((a, b) => b.hoy - a.hoy);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--linea)] bg-[var(--superficie)] px-3 py-2 text-sm">
        <Clock size={15} className="text-[var(--acento)]" aria-hidden />
        <b>{titulo}</b>
        {esHoy && <span className="rounded bg-[var(--alerta-suave)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--alerta)]">PARCIAL</span>}
        <span className="text-xs text-[var(--tenue)]">· comparado con el {compara}{av.actualizado ? ` · actualizado a las ${horaLima(av.actualizado)}` : ""}</span>
      </div>

      <div className="grid gap-4 grid-cols-1 @lg:grid-cols-2 @5xl:grid-cols-4">
        <Indicador icono="venta" titulo={esHoy ? "Venta de hoy hasta ahora" : "Venta del día"} valor={soles(T.hoy)} variacion={variacion(T.hoy, T.antes)}
                   comparadoCon={`${diaSemana} pasado`} detalle={`${diaSemana} pasado: ${soles(T.antes)}`} />
        <Indicador icono="rotacion" titulo="Tickets" valor={entero(T.tickets)} variacion={variacion(T.tickets, T.ticketsAntes)} comparadoCon={`${diaSemana} pasado`} />
        <Indicador icono="ingreso" titulo="Ticket promedio" valor={soles(T.tickets ? T.hoy / T.tickets : null)}
                   variacion={T.tickets && T.ticketsAntes ? variacion(T.hoy / T.tickets, T.antes / T.ticketsAntes) : null} comparadoCon={`${diaSemana} pasado`} />
        {necesario !== null ? (
          <Indicador icono="cobertura" titulo="Ritmo para la meta del mes" valor={porcentaje(necesario ? T.hoy / necesario : null)}
                     detalle={`necesitas ${soles(necesario)} por día; ${esHoy ? "hoy vas" : "ese día fue"} ${soles(T.hoy)}`
                       + (esHoy && T.antesDia ? ` · a esta hora, el ${diaSemana} pasado llevaba el ${porcentaje(T.antes / T.antesDia)} de su día` : "")} />
        ) : (
          <Indicador icono="cobertura" titulo={`${diaSemana} pasado, día completo`} valor={soles(T.antesDia)} detalle="lo que se vendió todo ese día" />
        )}
      </div>

      {hayLY && av.anio_pasado_fecha && (() => {
        const lyFecha = av.anio_pasado_fecha;
        const pct = T.ly ? T.hoy / T.ly : null, pctProy = T.ly ? proyeccion / T.ly - 1 : null;
        return (
          <Tarjeta icono={CalendarClock} titulo="Frente al mismo día del año pasado"
                   subtitulo={`${diaSemana} ${fechaLarga(lyFecha)} · día completo, del reporte interno (del año pasado solo hay el total del día, no el detalle por hora)`}>
            <div className="grid gap-3 grid-cols-1 @2xl:grid-cols-3 text-sm">
              <div className="rounded-lg border border-[var(--linea)] px-3 py-2"><span className="block text-xs text-[var(--tenue)]">Año pasado, día completo</span>
                <b className="num text-lg">{soles(T.ly)}</b></div>
              <div className="rounded-lg border border-[var(--linea)] px-3 py-2"><span className="block text-xs text-[var(--tenue)]">{esHoy ? "Hoy hasta ahora" : "Ese día este año"}</span>
                <b className="num text-lg">{soles(T.hoy)}</b> <span className="text-xs text-[var(--tenue)]">· {porcentaje(pct)} del año pasado</span></div>
              <div className="rounded-lg border border-[var(--linea)] px-3 py-2"><span className="block text-xs text-[var(--tenue)]">{esHoy ? "Proyección del día" : "Variación"}</span>
                <b className={`num text-lg ${pctProy !== null && pctProy < 0 ? "text-[var(--critico)]" : "text-[var(--bueno)]"}`}>
                  {esHoy ? soles(proyeccion) : ""} {pctProy === null ? "—" : `${pctProy >= 0 ? "+" : ""}${porcentaje(pctProy)}`}</b>
                {esHoy && <span className="block text-xs text-[var(--tenue)]">vs el año pasado, si el resto del día sigue el ritmo del {diaSemana} pasado</span>}</div>
            </div>
            {pct !== null && (
              <div className="grid gap-1">
                <div className="relative h-4 rounded-full bg-[var(--superficie-2)] overflow-hidden">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--serie-1)]" style={{ width: `${Math.min(100, pct * 100)}%` }} />
                  {avanceNormal !== null && (
                    <div className="absolute inset-y-0 w-0.5 bg-[var(--tinta)]" style={{ left: `${Math.min(100, avanceNormal * 100)}%` }} title="Donde normalmente se está a esta hora" />
                  )}
                </div>
                <span className="text-xs text-[var(--tenue)]">
                  Barra: venta {esHoy ? "de hoy" : "del día"} sobre el total del año pasado ({porcentaje(pct)}).
                  {avanceNormal !== null && <> La raya marca dónde se suele estar a esta hora: el {diaSemana} pasado, a las {corte}, llevaba el {porcentaje(avanceNormal)} de su día.</>}
                </span>
              </div>
            )}
          </Tarjeta>
        );
      })()}

      <Tarjeta icono={Clock} titulo="Venta acumulada hora por hora" subtitulo={`${titulo} vs el ${diaSemana} pasado completo (punteado)`}>
        <GraficoAvance horas={av.horas} horaCorte={horaCorte} etiquetaHoy={esHoy ? "Hoy" : fechaLarga(fecha)} etiquetaAntes={`${diaSemana} pasado`} />
      </Tarjeta>

      {conTiendas && (
        <Tarjeta icono={Store} titulo="Por tienda" subtitulo={`${titulo} vs el ${compara}`}>
          <Tabla archivo={`${archivo}.xlsx`} hoja="Avance" filas={porTienda}
                 columnas={[{ clave: "tienda", titulo: "Tienda", tipo: "texto" }, { clave: "hoy", titulo: esHoy ? "Hoy S/" : "Venta S/", tipo: "soles" },
                   { clave: "antes_corte", titulo: `${diaSemana} pasado S/`, tipo: "soles" }, { clave: "var", titulo: "Variación", tipo: "porcentaje" },
                   { clave: "tickets", titulo: "Tickets", tipo: "entero" }, { clave: "var_tickets", titulo: "Var. tickets", tipo: "porcentaje" },
                   { clave: "ultima", titulo: "Última venta", tipo: "texto" }, { clave: "antes_dia", titulo: `${diaSemana} pasado, día completo S/`, tipo: "soles" },
                   ...(hayLY ? [{ clave: "anio_pasado", titulo: `Año pasado, día completo S/`, tipo: "soles" } as const,
                                { clave: "alcanzado", titulo: "% del año pasado", tipo: "porcentaje" } as const] : [])]}
                 total={{ tienda: "TOTAL", hoy: T.hoy, antes_corte: T.antes, var: variacion(T.hoy, T.antes), tickets: T.tickets,
                          var_tickets: variacion(T.tickets, T.ticketsAntes), antes_dia: T.antesDia,
                          ...(hayLY ? { anio_pasado: T.ly, alcanzado: T.ly ? T.hoy / T.ly : null } : {}) }} />
          <p className="text-xs text-[var(--tenue)]">
            {hayLY && <>«Año pasado»: total del {diaSemana} {av.anio_pasado_fecha ? fechaLarga(av.anio_pasado_fecha) : ""} en el reporte interno (S/ 0 = ese día no tuvo venta registrada). </>}
            «Última venta»: hora del último comprobante de esa tienda; si una tienda se quedó muy atrás en la hora, revisa si está registrando en ContaNet.
            El robot actualiza el día varias veces (por defecto 10:00, 13:00, 16:00 y 19:00); el cierre de las 07:30 deja el día anterior completo.
          </p>
        </Tarjeta>
      )}
    </>
  );
}
