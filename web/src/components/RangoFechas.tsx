"use client";

// Selector del periodo. El botón muestra el periodo en palabras («Agosto 2026») y es el único lugar donde se cambia. Al abrirlo,
// tres pestañas: «Meses» (lo más usado: un toque = el mes completo; arrastrar = varios meses), «Rápidos» (6 atajos) y
// «Fechas exactas» (calendario de dos meses: un clic marca el inicio y el segundo el fin).
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DIAS_SEM, diaSemana, fechaLarga, inicioMes, periodoEnPalabras, rangoPeriodo, sumarDias, type Periodo } from "@/lib/periodos";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
/** Los atajos que quedan: los demás («últimos 3/14/30 días»…) se resuelven mejor con «Meses» o «Fechas exactas». */
const RAPIDOS: [Periodo, string][] = [["ultimo", "Último día con datos"], ["7d", "Últimos 7 días"], ["semana", "Esta semana"],
  ["semana-ant", "Semana anterior"], ["mes", "Este mes"], ["mes-ant", "Mes anterior"]];
const mover = (mes: string, n: number) => {
  const [a, m] = mes.split("-").map(Number), t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
};
const finDeMes = (mes: string) => sumarDias(mover(mes, 1), -1);
type Pestana = "meses" | "rapidos" | "fechas";

function Mes({ mes, primero, ultimo, desde, hasta, elegir, encima }: {
  mes: string; primero: string; ultimo: string; desde: string; hasta: string; elegir: (d: string) => void; encima: (d: string | null) => void;
}) {
  const fin = finDeMes(mes);
  const dias: (string | null)[] = [...Array(diaSemana(mes)).fill(null)];
  for (let d = mes; d <= fin; d = sumarDias(d, 1)) dias.push(d);
  return (
    <div className="grid gap-2 content-start">
      <p className="text-sm font-semibold text-center capitalize">{MESES[Number(mes.slice(5, 7)) - 1]} {mes.slice(0, 4)}</p>
      <div className="grid grid-cols-7 text-center text-[11px] text-[var(--tenue)]">{DIAS_SEM.map((d) => <span key={d}>{d.slice(0, 2)}</span>)}</div>
      <div className="grid grid-cols-7 gap-y-0.5" onMouseLeave={() => encima(null)}>
        {dias.map((d, i) => {
          if (!d) return <span key={`v${i}`} />;
          const fuera = d < primero || d > ultimo;
          const borde = d === desde || d === hasta, dentro = d > desde && d < hasta;
          return (
            <button key={d} type="button" disabled={fuera} onClick={() => elegir(d)} onMouseEnter={() => encima(d)} onFocus={() => encima(d)}
                    aria-label={fechaLarga(d)} aria-pressed={borde || dentro}
                    className={`num h-9 text-[13px] ${dentro ? "bg-[var(--acento-suave)]" : ""} ${d === desde && hasta > desde ? "rounded-l-full bg-[var(--acento-suave)]" : ""}
                      ${d === hasta && hasta > desde ? "rounded-r-full bg-[var(--acento-suave)]" : ""} disabled:text-[var(--linea)] disabled:cursor-not-allowed`}>
              <span className={`grid place-items-center size-9 mx-auto rounded-full ${borde ? "bg-[var(--acento)] text-white font-semibold" : fuera ? "" : "hover:ring-1 hover:ring-[var(--tinta)]"}`}>
                {Number(d.slice(8, 10))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function RangoFechas({ periodo, periodoDefecto, d1, d2, primero, ultimo, poner }: {
  periodo: Periodo; periodoDefecto: string; d1?: string; d2?: string; primero: string; ultimo: string;
  poner: (cambios: Record<string, string | null>) => void;
}) {
  const caja = useRef<HTMLDetailsElement>(null);
  const [desde, hasta] = rangoPeriodo(periodo, ultimo, primero, d1, d2);
  const [pestana, setPestana] = useState<Pestana>("meses");
  const [anio, setAnio] = useState(() => Number(hasta.slice(0, 4)));
  // «Meses»: rango que se está marcando (arrastrando, o con Shift sobre otro mes) para pintarlo antes de soltar.
  const [marcando, setMarcando] = useState<{ a: string; b: string; arrastre: boolean } | null>(null);
  const [vista, setVista] = useState(() => inicioMes(hasta));   // «Fechas exactas»: mes de la derecha (en el celular, el único)
  const [inicio, setInicio] = useState<string | null>(null);   // «Fechas exactas»: primer clic, esperando el fin
  const [sobre, setSobre] = useState<string | null>(null);
  const cerrar = () => { setInicio(null); setMarcando(null); if (caja.current) caja.current.open = false; };
  const cerrarYVolver = () => { cerrar(); caja.current?.querySelector("summary")?.focus(); };

  // Se cierra con la ✕, con Esc (devolviendo el foco al botón) y al hacer clic fuera, como cualquier ventana emergente.
  useEffect(() => {
    const cerrarAqui = () => { setInicio(null); setMarcando(null); if (caja.current) caja.current.open = false; };
    const fuera = (e: PointerEvent) => { if (caja.current?.open && !caja.current.contains(e.target as Node)) cerrarAqui(); };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape" && caja.current?.open) { cerrarAqui(); caja.current.querySelector("summary")?.focus(); }
    };
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("pointerdown", fuera); document.removeEventListener("keydown", tecla); };
  }, []);

  // «Meses»: un toque = ese mes; arrastrar = varios meses (se pinta mientras arrastras y se aplica al soltar); Shift + clic (o
  // Shift + Enter) extiende el rango desde el primer mes del periodo actual. Mouse y dedo igual: el mes bajo el puntero se busca por
  // posición (en pantallas táctiles el dedo queda «capturado» por el primer botón y los demás no reciben eventos).
  const aplicarMeses = (a: string, b: string) => {
    const [x, y] = [a, b].sort();
    poner({ p: "personalizado", d1: `${x}-01`, d2: finDeMes(`${y}-01`) });
  };
  const anclaActual = desde.slice(0, 7);
  const mesBajo = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest("[data-mes]") as HTMLElement | null)?.dataset.mes ?? null;
  function bajar(e: React.PointerEvent, m: string) {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);   // soltar fuera de la grilla también cuenta
    setMarcando(e.shiftKey ? { a: anclaActual, b: m, arrastre: true } : { a: m, b: m, arrastre: true });
  }
  function moverPuntero(e: React.PointerEvent) {
    const m = mesBajo(e.clientX, e.clientY);
    if (!m) return;
    if (marcando?.arrastre) { if (m !== marcando.b) setMarcando({ ...marcando, b: m }); }
    else if (e.shiftKey && e.pointerType === "mouse") setMarcando({ a: anclaActual, b: m, arrastre: false });
    else if (marcando) setMarcando(null);
  }
  function soltar() {
    if (!marcando?.arrastre) return;
    aplicarMeses(marcando.a, marcando.b);
    cerrar();
  }
  function teclaMes(e: React.MouseEvent, m: string) {   // Enter/Espacio llegan como clic con detail 0
    if (e.detail !== 0) return;
    aplicarMeses(e.shiftKey ? anclaActual : m, m);
    cerrar();
  }
  const anioMin = Number(primero.slice(0, 4)), anioMax = Number(ultimo.slice(0, 4));
  const mesCompleto = (m: string) => desde <= `${m}-01` && hasta >= (finDeMes(`${m}-01`) < ultimo ? finDeMes(`${m}-01`) : ultimo);

  // «Fechas exactas»: el rango se dibuja desde el primer clic hasta el día bajo el cursor.
  const [a, b] = inicio ? [inicio, sobre ?? inicio].sort() : [desde, hasta];
  function elegirDia(d: string) {
    if (!inicio) { setInicio(d); return; }
    const [x, y] = [inicio, d].sort();
    poner({ p: "personalizado", d1: x, d2: y });
    cerrar();
  }
  const minVista = inicioMes(primero), maxVista = inicioMes(ultimo);

  return (
    <details ref={caja} className="relative" onToggle={(e) => { if (!(e.target as HTMLDetailsElement).open) { setInicio(null); setMarcando(null); } }}>
      <summary className="presionable cursor-pointer list-none inline-flex items-center gap-2 rounded-full bg-[var(--acento-suave)] px-3.5 h-9
                          text-[15px] font-semibold text-[var(--acento)] hover:brightness-95" aria-label={`Periodo: ${periodoEnPalabras(desde, hasta)}. Cambiar periodo`}>
        <CalendarDays size={16} aria-hidden /> {periodoEnPalabras(desde, hasta)}
        <ChevronDown size={15} aria-hidden />
      </summary>
      <div className="flotante w-[min(94vw,640px)] p-3 grid gap-3 left-0" role="dialog" aria-label="Elegir periodo">
        <div className="flex items-center justify-between gap-3">
          <div className="segmento" role="tablist" aria-label="Cómo elegir el periodo">
            {([["meses", "Meses"], ["rapidos", "Rápidos"], ["fechas", "Fechas exactas"]] as [Pestana, string][]).map(([k, t]) => (
              <button key={k} type="button" role="tab" aria-selected={pestana === k} onClick={() => setPestana(k)}>{t}</button>
            ))}
          </div>
          <button type="button" className="boton presionable !h-8 !px-2" onClick={cerrarYVolver} aria-label="Cerrar" title="Cerrar (Esc)">
            <X size={16} aria-hidden />
          </button>
        </div>

        {pestana === "meses" && (
          <div className="grid gap-3" role="tabpanel" aria-label="Meses">
            <div className="flex items-center justify-between">
              <button type="button" className="boton !h-8 !px-2" disabled={anio <= anioMin} onClick={() => setAnio(anio - 1)} aria-label="Año anterior"><ChevronLeft size={15} aria-hidden /></button>
              <p className="num text-[15px] font-semibold">{anio}</p>
              <button type="button" className="boton !h-8 !px-2" disabled={anio >= anioMax} onClick={() => setAnio(anio + 1)} aria-label="Año siguiente"><ChevronRight size={15} aria-hidden /></button>
            </div>
            <p className="text-sm text-[var(--tenue)]" aria-live="polite">
              {marcando && marcando.a !== marcando.b
                ? <>Suelta para ver <b className="text-[var(--tinta)]">{periodoEnPalabras(`${[marcando.a, marcando.b].sort()[0]}-01`, finDeMes(`${[marcando.a, marcando.b].sort()[1]}-01`))}</b></>
                : <>Toca un mes · <b className="text-[var(--tinta)]">arrastra</b> para elegir varios · Shift + clic extiende el rango</>}
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 select-none" style={{ touchAction: "none" }}
                 onPointerMove={moverPuntero} onPointerUp={soltar} onPointerLeave={() => { if (marcando && !marcando.arrastre) setMarcando(null); }}
                 onPointerCancel={() => setMarcando(null)}>
              {MESES_CORTOS.map((nombre, i) => {
                const m = `${anio}-${String(i + 1).padStart(2, "0")}`;
                const sinDatos = `${m}-01` > ultimo || finDeMes(`${m}-01`) < primero;
                const enCurso = ultimo.slice(0, 7) === m && ultimo < finDeMes(`${m}-01`);
                const [ra, rb] = marcando ? [marcando.a, marcando.b].sort() : [null, null];
                const enMarca = ra !== null && rb !== null && m >= ra && m <= rb;
                const extremo = enMarca && (m === ra || m === rb);
                const elegido = !marcando && !sinDatos && mesCompleto(m);
                const lleno = elegido || extremo;
                return (
                  <button key={m} type="button" data-mes={m} disabled={sinDatos} aria-pressed={elegido}
                          onPointerDown={(e) => bajar(e, m)} onClick={(e) => teclaMes(e, m)}
                          title={sinDatos ? "Todavía no hay datos de este mes" : undefined}
                          className={`presionable grid h-12 place-content-center rounded-lg border text-sm transition-colors duration-100
                            ${lleno ? "border-[var(--acento)] bg-[var(--acento)] text-white font-semibold"
                              : enMarca ? "border-[var(--acento)] bg-[var(--acento-suave)] text-[var(--tinta)] font-medium"
                              : "border-[var(--linea)] hover:border-[var(--acento)]"}
                            disabled:cursor-not-allowed disabled:text-[var(--linea)] disabled:hover:border-[var(--linea)]`}>
                    <span>{nombre}</span>
                    {enCurso && <span className={`text-[11px] ${lleno ? "text-white/85" : "text-[var(--tenue)]"}`}>al {Number(ultimo.slice(8, 10))}</span>}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              {anio === anioMax
                ? <button type="button" className="boton presionable" aria-pressed={periodo === "anio"}
                          onClick={() => { poner({ p: periodoDefecto === "anio" ? null : "anio", d1: null, d2: null }); cerrar(); }}>Año a la fecha</button>
                : <button type="button" className="boton presionable" onClick={() => { aplicarMeses(`${anio}-01`, `${anio}-12`); cerrar(); }}>Año {anio} completo</button>}
            </div>
          </div>
        )}

        {pestana === "rapidos" && (
          <div className="grid gap-1 sm:grid-cols-2" role="tabpanel" aria-label="Rápidos">
            {RAPIDOS.map(([k, t]) => (
              <button key={k} type="button" aria-pressed={k === periodo} onClick={() => { poner({ p: k === periodoDefecto ? null : k, d1: null, d2: null }); cerrar(); }}
                      className={`presionable text-left text-sm px-3 py-2.5 rounded-md border border-transparent hover:border-[var(--linea)] ${k === periodo ? "bg-[var(--acento-suave)] font-semibold" : ""}`}>
                {t}
              </button>
            ))}
          </div>
        )}

        {pestana === "fechas" && (
          <div className="grid gap-2" role="tabpanel" aria-label="Fechas exactas">
            <div className="flex items-center justify-between">
              <button type="button" className="boton !h-8 !px-2" disabled={vista <= minVista} onClick={() => setVista(mover(vista, -1))} aria-label="Mes anterior">
                <ChevronLeft size={15} aria-hidden />
              </button>
              <p className="text-xs text-[var(--tenue)]" aria-live="polite">
                {inicio ? `Desde ${fechaLarga(inicio)}: elige el día final` : "Elige el día inicial y luego el final"}
              </p>
              <button type="button" className="boton !h-8 !px-2" disabled={vista >= maxVista} onClick={() => setVista(mover(vista, 1))} aria-label="Mes siguiente">
                <ChevronRight size={15} aria-hidden />
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[mover(vista, -1), vista].map((m, i) => (
                <div key={m} className={i ? "grid" : "hidden sm:grid"}>
                  <Mes mes={m} primero={primero} ultimo={ultimo} desde={a} hasta={b} elegir={elegirDia} encima={setSobre} />
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-[11px] text-[var(--tenue)] border-t border-[var(--linea)] pt-2">Hay datos del {fechaLarga(primero)} al {fechaLarga(ultimo)}.</p>
      </div>
    </details>
  );
}
