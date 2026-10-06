// Sección «Avance del día» de las vistas de ContaNet (Tiendas, Rappi, Canal digital): cómo va un día específico hora por hora
// frente al mismo día de la semana pasada, con su detalle (tiendas, productos, medios de pago, clientes).
import { CalendarClock, ChevronLeft, ChevronRight, Clock, CreditCard, IdCard, Package, Store } from "lucide-react";
import { GraficoAvance } from "@/components/GraficoAvance";
import { Indicador } from "@/components/Graficos";
import { Tabla } from "@/components/Tabla";
import { Aviso, Tarjeta } from "@/components/ui";
import type { Avance } from "@/lib/contanet";
import { entero, porcentaje, soles } from "@/lib/formato";
import { fechaLarga, sumarDias } from "@/lib/periodos";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const variacion = (a: number, b: number) => (b ? a / b - 1 : null);
/** «jueves 01/10/2026»: la fecha siempre con su día de la semana, para que se vea que se compara el mismo día. */
const conDia = (f: string) => `${DIAS[new Date(`${f}T12:00:00`).getDay()]} ${fechaLarga(f)}`;
const hoyLima = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
const horaLima = (iso: string) => new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

/** Elegir el día a analizar: el último cargado por defecto, o cualquier día del reporte de ContaNet. */
function SelectorDia({ fecha, primera, ultima }: { fecha: string; primera: string | null; ultima: string | null }) {
  const anterior = sumarDias(fecha, -1), siguiente = sumarDias(fecha, 1);
  const enlace = "inline-flex items-center gap-1 rounded-md border border-[var(--linea)] px-2 py-1 text-xs hover:bg-[var(--superficie-2)]";
  return (
    <form method="get" className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="s" value="avance" />
      <span className="text-xs text-[var(--tenue)]">Día a analizar</span>
      {(!primera || anterior >= primera) && <a className={enlace} href={`?s=avance&dia=${anterior}`}><ChevronLeft size={13} aria-hidden />Anterior</a>}
      <input type="date" name="dia" defaultValue={fecha} min={primera ?? undefined} max={ultima ?? undefined}
             className="rounded-md border border-[var(--linea)] bg-[var(--superficie)] px-2 py-1 text-xs" />
      <button type="submit" className="rounded-md bg-[var(--acento)] px-2.5 py-1 text-xs font-semibold text-white">Ver día</button>
      {(!ultima || siguiente <= ultima) && <a className={enlace} href={`?s=avance&dia=${siguiente}`}>Siguiente<ChevronRight size={13} aria-hidden /></a>}
      {ultima && fecha !== ultima && <a className={enlace} href="?s=avance">Último día cargado ({fechaLarga(ultima)})</a>}
    </form>
  );
}

export function seccionAvance(av: Avance, meta: number | null, conTiendas: boolean, archivo: string, canal = "El canal", dim = "Tienda") {
  if (!av.fecha) return <p className="text-sm text-[var(--tenue)]">Todavía no hay ventas cargadas de ContaNet.</p>;
  const fecha = av.fecha, esHoy = fecha === hoyLima();
  const corte = av.corte ? av.corte.slice(0, 5) : null;
  const horaCorte = esHoy && corte ? Number(corte.slice(0, 2)) : null;
  const antes = sumarDias(fecha, -7);
  const diaSemana = DIAS[new Date(`${fecha}T12:00:00`).getDay()];
  const T = av.tiendas.reduce((a, t) => ({ hoy: a.hoy + t.hoy, antes: a.antes + t.antes_corte, antesDia: a.antesDia + t.antes_dia, tickets: a.tickets + t.tickets,
    ticketsAntes: a.ticketsAntes + t.tickets_antes, ly: a.ly + (t.anio_pasado ?? 0), lyFecha: a.lyFecha + (t.anio_pasado_fecha_igual ?? 0) }),
    { hoy: 0, antes: 0, antesDia: 0, tickets: 0, ticketsAntes: 0, ly: 0, lyFecha: 0 });
  const TF = T.lyFecha;
  const hayLY = av.tiendas.some((t) => t.anio_pasado !== null);
  // Parte del día que normalmente ya pasó a esta hora (según el mismo día de la semana pasada) y proyección del día.
  const avanceNormal = esHoy && T.antesDia ? T.antes / T.antesDia : null;
  const proyeccion = esHoy && avanceNormal ? T.hoy / avanceNormal : T.hoy;
  const titulo = esHoy ? `Hoy ${conDia(fecha)} hasta las ${corte ?? "—"}` : `${conDia(fecha)} (${fecha === av.ultima_carga ? "último día cargado, " : ""}día cerrado)`;
  const compara = esHoy ? `${conDia(antes)} hasta la misma hora` : conDia(antes);

  // Ritmo para la meta del mes: lo que falta repartido en los días que quedan (incluido el día que se mira).
  const anio = Number(fecha.slice(0, 4)), mes = Number(fecha.slice(5, 7)), dia = Number(fecha.slice(8, 10));
  const diasMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const necesario = meta ? Math.max(0, meta - av.mes) / (diasMes - dia + 1) : null;

  const porTienda = av.tiendas.map((t) => ({ ...t, var: variacion(t.hoy, t.antes_corte), var_tickets: variacion(t.tickets, t.tickets_antes),
    alcanzado: t.anio_pasado ? t.hoy / t.anio_pasado : null }))
    .sort((a, b) => b.hoy - a.hoy);
  const productos = av.productos.map((x) => ({ ...x, producto: x.producto ?? x.sku, pct: T.hoy ? x.hoy / T.hoy : null, var: variacion(x.hoy, x.antes_corte) }));
  const medios = av.medios.filter((x) => x.hoy || x.antes_corte)
    .map((x) => ({ ...x, pct: T.hoy ? x.hoy / T.hoy : null, var: variacion(x.hoy, x.antes_corte), ticket_prom: x.tickets ? x.hoy / x.tickets : null }));
  const undDia = productos.reduce((a, x) => a + x.und, 0);

  return (
    <>
      <SelectorDia fecha={fecha} primera={av.primera} ultima={av.ultima_carga} />
      {T.hoy === 0 && (
        <Aviso tipo="alerta" titulo={`${canal} no tiene ventas en ContaNet el ${conDia(fecha)}${esHoy && corte ? ` hasta las ${corte}` : ""}`}>
          El reporte cargado sí trae ese día (es el mismo Excel de ContaNet de las tiendas); el {conDia(antes)} vendió {soles(T.antesDia)}.
        </Aviso>
      )}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--linea)] bg-[var(--superficie)] px-3 py-2 text-sm">
        <Clock size={15} className="text-[var(--acento)]" aria-hidden />
        <b>{titulo}</b>
        {esHoy && <span className="rounded border border-[var(--alerta)] px-1.5 py-px text-[11px] font-semibold text-[var(--alerta)]">Parcial</span>}
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
        // Dos referencias del año pasado (día completo, Power BI): el mismo día de la semana (la recomendada) y la misma fecha.
        // Cada una se lee en tres pasos: cuánto se vendió ese día el año pasado, cuánto lleva hoy y en cuánto cerraría hoy.
        const refs = [
          { titulo: "Mismo día de la semana", fecha: av.anio_pasado_fecha, total: T.ly, principal: true },
          ...(av.anio_pasado_misma_fecha ? [{ titulo: "Misma fecha", fecha: av.anio_pasado_misma_fecha, total: TF, principal: false }] : []),
        ];
        const cierre = esHoy ? proyeccion : T.hoy;
        const principal = refs[0];
        const varPrincipal = principal.total ? cierre / principal.total - 1 : null;
        const signo = (x: number) => (x >= 0 ? "+" : "−");
        const color = (x: number | null) => (x === null ? "" : x >= 0 ? "text-[var(--bueno)]" : "text-[var(--critico)]");
        return (
          <Tarjeta icono={CalendarClock} titulo="Frente al año pasado"
                   subtitulo="El año pasado sale del Power BI, que solo tiene el total del día (no la venta por hora)">
            {varPrincipal !== null && (
              <p className="text-[15px] leading-snug">
                {esHoy ? "Si el resto del día sigue el ritmo del " + diaSemana + " pasado, hoy cerraría " : "Ese día cerró "}
                <b className={`num ${color(varPrincipal)}`}>{signo(varPrincipal)}{porcentaje(Math.abs(varPrincipal))}</b>
                {" "}{varPrincipal >= 0 ? "por encima" : "por debajo"} del {conDia(principal.fecha)}
                {" "}(<b className="num">{signo(cierre - principal.total)}{soles(Math.abs(cierre - principal.total))}</b>).
              </p>
            )}
            <div className="grid gap-4 @4xl:grid-cols-2">
              {refs.map((r) => {
                const escala = Math.max(r.total, cierre, T.hoy) * 1.04 || 1;
                const ancho = (v: number) => `${Math.min(100, (v / escala) * 100)}%`;
                const pct = r.total ? T.hoy / r.total : null;
                const varCierre = r.total ? cierre / r.total - 1 : null;
                const falta = r.total - T.hoy;
                return (
                  <div key={r.titulo} className={`grid gap-3 rounded-lg border p-4 text-sm ${r.principal ? "border-[var(--tinta)]/25" : "border-[var(--linea)]"}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <b className="flex items-center gap-1.5">{r.titulo}
                        {r.principal && <span className="rounded border border-[var(--acento)] px-1.5 py-px text-[10px] font-semibold text-[var(--acento)]">recomendada</span>}</b>
                      <span className="text-xs text-[var(--tenue)]">{conDia(fecha)} vs {conDia(r.fecha)}</span>
                    </div>

                    {/* Barras en la misma escala: gris = año pasado (día completo); naranja = hoy hasta ahora; naranja claro = lo que falta para la proyección. */}
                    <div className="grid gap-2">
                      <div className="grid gap-1">
                        <div className="flex justify-between gap-2 text-xs"><span className="text-[var(--tenue)]">Año pasado · {conDia(r.fecha)} · día completo</span>
                          <b className="num">{soles(r.total)}</b></div>
                        <div className="relative h-4 rounded bg-[var(--superficie-2)]">
                          <div className="absolute inset-y-0 left-0 rounded bg-[var(--serie-gris)]" style={{ width: ancho(r.total) }} />
                        </div>
                      </div>
                      <div className="grid gap-1">
                        <div className="flex justify-between gap-2 text-xs">
                          <span className="text-[var(--tenue)]">{esHoy ? `Hoy hasta las ${corte ?? "—"}` : `Este año · ${conDia(fecha)}`}{esHoy && <> · <span className="text-[var(--acento)]">proyección al cierre</span></>}</span>
                          <b className="num">{soles(T.hoy)}{esHoy && <span className="font-normal text-[var(--tenue)]"> → {soles(proyeccion)}</span>}</b></div>
                        <div className="relative h-4 rounded bg-[var(--superficie-2)]">
                          {esHoy && <div className="absolute inset-y-0 left-0 rounded border border-dashed border-[var(--serie-1)] bg-[color-mix(in_srgb,var(--serie-1)_18%,transparent)]" style={{ width: ancho(proyeccion) }} />}
                          <div className="absolute inset-y-0 left-0 rounded bg-[var(--serie-1)]" style={{ width: ancho(T.hoy) }} />
                          <div className="absolute -inset-y-1 w-0.5 bg-[var(--tinta)]" style={{ left: ancho(r.total) }} title="Total del día del año pasado" />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 border-t border-[var(--linea)] pt-3">
                      <span className="grid gap-0.5">
                        <span className="text-[11px] text-[var(--tenue)]">{esHoy ? "Hoy ya vendió" : "Vendió"}</span>
                        <b className="num text-base">{porcentaje(pct)}</b>
                        <span className="text-[11px] text-[var(--tenue)]">del día completo del año pasado{esHoy ? (falta > 0 ? ` · faltan ${soles(falta)} para igualarlo` : " · ya lo superó") : ""}</span>
                      </span>
                      <span className="grid gap-0.5">
                        <span className="text-[11px] text-[var(--tenue)]">{esHoy ? "Cerraría" : "Variación"}</span>
                        <b className={`num text-base ${color(varCierre)}`}>{varCierre === null ? "—" : `${signo(varCierre)}${porcentaje(Math.abs(varCierre))}`}</b>
                        <span className="text-[11px] text-[var(--tenue)]">vs año pasado ({varCierre === null ? "—" : `${signo(cierre - r.total)}${soles(Math.abs(cierre - r.total))}`})</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-[var(--tenue)]">
              {esHoy && <>Proyección: lo vendido hasta ahora más lo que falta según el ritmo del {diaSemana} pasado (a las {corte} llevaba el {porcentaje(avanceNormal)} de
                su día). La raya negra marca el total del año pasado: cuando la barra naranja la pasa, hoy ya superó ese día. </>}
              «Mismo día de la semana» compara {diaSemana} con {diaSemana} (364 días antes) y es la referencia más justa; «Misma fecha» puede caer en otro día de la semana.
            </p>
          </Tarjeta>
        );
      })()}

      <Tarjeta icono={Clock} titulo="Venta acumulada hora por hora" subtitulo={`${titulo} vs el ${diaSemana} pasado completo (punteado)`}>
        <GraficoAvance horas={av.horas} horaCorte={horaCorte} etiquetaHoy={esHoy ? "Hoy" : fechaLarga(fecha)} etiquetaAntes={`${diaSemana} pasado`} />
      </Tarjeta>

      {conTiendas && (
        <Tarjeta icono={Store} titulo={`Por ${dim.toLowerCase()}`} subtitulo={`${titulo} vs el ${compara}`}>
          <Tabla archivo={`${archivo}.xlsx`} hoja="Avance" filas={porTienda}
                 columnas={[{ clave: "tienda", titulo: dim, tipo: "texto" }, { clave: "hoy", titulo: `${esHoy ? "Hoy " : ""}${conDia(fecha)} S/`, tipo: "soles" },
                   { clave: "antes_corte", titulo: `${conDia(antes)} S/`, tipo: "soles" }, { clave: "var", titulo: "Variación", tipo: "porcentaje" },
                   { clave: "tickets", titulo: "Tickets", tipo: "entero" }, { clave: "var_tickets", titulo: "Var. tickets", tipo: "porcentaje" },
                   { clave: "ultima", titulo: "Última venta", tipo: "texto" }, { clave: "antes_dia", titulo: `${conDia(antes)}, día completo S/`, tipo: "soles" },
                   ...(hayLY ? [{ clave: "anio_pasado", titulo: `${av.anio_pasado_fecha ? conDia(av.anio_pasado_fecha) : "Año pasado"} (mismo día) S/`, tipo: "soles" } as const,
                                { clave: "alcanzado", titulo: "% alcanzado", tipo: "porcentaje" } as const,
                                { clave: "anio_pasado_fecha_igual", titulo: `${av.anio_pasado_misma_fecha ? conDia(av.anio_pasado_misma_fecha) : "Año pasado"} (misma fecha) S/`, tipo: "soles" } as const] : [])]}
                 total={{ tienda: "TOTAL", hoy: T.hoy, antes_corte: T.antes, var: variacion(T.hoy, T.antes), tickets: T.tickets,
                          var_tickets: variacion(T.tickets, T.ticketsAntes), antes_dia: T.antesDia,
                          ...(hayLY ? { anio_pasado: T.ly, alcanzado: T.ly ? T.hoy / T.ly : null, anio_pasado_fecha_igual: TF } : {}) }} />
          <p className="text-xs text-[var(--tenue)]">
            {hayLY && <>«Año pasado»: total del día en el Power BI, el {diaSemana} {av.anio_pasado_fecha ? fechaLarga(av.anio_pasado_fecha) : ""} y la misma fecha
              {av.anio_pasado_misma_fecha ? ` ${fechaLarga(av.anio_pasado_misma_fecha)}` : ""} (S/ 0 = ese día no tuvo venta registrada). </>}
            «Última venta»: hora del último comprobante de esa tienda; si una tienda se quedó muy atrás en la hora, revisa si está registrando en ContaNet.
            El robot actualiza el día varias veces (por defecto 10:00, 13:00, 16:00 y 19:00); el cierre de las 07:30 deja el día anterior completo.
          </p>
        </Tarjeta>
      )}

      <div className="grid gap-4 @5xl:grid-cols-2">
        <Tarjeta icono={Package} titulo="Productos del día" subtitulo={`${titulo} vs el ${compara}`}>
          <Tabla archivo={`${archivo}_productos.xlsx`} hoja="Productos" filas={productos}
                 columnas={[{ clave: "producto", titulo: "Producto", tipo: "texto" }, { clave: "hoy", titulo: `${conDia(fecha)} S/`, tipo: "soles" },
                   { clave: "pct", titulo: "% del día", tipo: "porcentaje" }, { clave: "und", titulo: "Und", tipo: "entero" },
                   { clave: "antes_corte", titulo: `${conDia(antes)} S/`, tipo: "soles" }, { clave: "var", titulo: "Variación", tipo: "porcentaje" }]}
                 total={{ producto: "TOTAL", hoy: T.hoy, pct: T.hoy ? 1 : null, und: undDia, antes_corte: T.antes, var: variacion(T.hoy, T.antes) }} />
        </Tarjeta>
        <Tarjeta icono={CreditCard} titulo="Medios de pago del día" subtitulo={`${titulo} vs el ${compara}`}>
          <Tabla archivo={`${archivo}_medios.xlsx`} hoja="Medios de pago" filas={medios}
                 columnas={[{ clave: "medio", titulo: "Medio de pago", tipo: "texto" }, { clave: "hoy", titulo: `${conDia(fecha)} S/`, tipo: "soles" },
                   { clave: "pct", titulo: "% del día", tipo: "porcentaje" }, { clave: "tickets", titulo: "Tickets", tipo: "entero" },
                   { clave: "ticket_prom", titulo: "Ticket prom. S/", tipo: "soles" },
                   { clave: "antes_corte", titulo: `${conDia(antes)} S/`, tipo: "soles" }, { clave: "var", titulo: "Variación", tipo: "porcentaje" }]}
                 total={{ medio: "TOTAL", hoy: T.hoy, pct: T.hoy ? 1 : null, tickets: T.tickets, ticket_prom: T.tickets ? T.hoy / T.tickets : null,
                          antes_corte: T.antes, var: variacion(T.hoy, T.antes) }} />
        </Tarjeta>
      </div>

      {av.clientes.length > 0 && (
        <Tarjeta icono={IdCard} titulo="Principales clientes del día" subtitulo={`${conDia(fecha)} · clientes con DNI/RUC (las ventas sin documento no se listan)`}>
          <Tabla archivo={`${archivo}_clientes.xlsx`} hoja="Clientes" filas={av.clientes.map((c) => ({ ...c, pct: T.hoy ? c.venta / T.hoy : null }))}
                 columnas={[{ clave: "cliente", titulo: "Cliente", tipo: "texto" }, { clave: "doc", titulo: "DNI/RUC", tipo: "texto" },
                   ...(conTiendas ? [{ clave: "tiendas", titulo: dim, tipo: "texto" } as const] : []),
                   { clave: "venta", titulo: "Venta S/", tipo: "soles" }, { clave: "pct", titulo: "% del día", tipo: "porcentaje" },
                   { clave: "tickets", titulo: "Tickets", tipo: "entero" }, { clave: "hora", titulo: "Última compra", tipo: "texto" }]} />
        </Tarjeta>
      )}
    </>
  );
}
