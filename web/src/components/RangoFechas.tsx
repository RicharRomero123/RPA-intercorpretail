"use client";

// Selector de fechas en un solo botón (como el de Airbnb): a la izquierda los periodos rápidos (último día, esta semana,
// este mes…) y a la derecha dos meses; un clic marca el inicio y el segundo el fin. Lo elegido a mano queda como «Personalizado».
import { CalendarRange, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { useRef, useState } from "react";
import { DIAS_SEM, diaSemana, fechaLarga, inicioMes, PERIODOS, rangoPeriodo, sumarDias, type Periodo } from "@/lib/periodos";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const mover = (mes: string, n: number) => {
  const [a, m] = mes.split("-").map(Number), t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
};
const corto = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;

function Mes({ mes, primero, ultimo, desde, hasta, elegir, encima }: {
  mes: string; primero: string; ultimo: string; desde: string; hasta: string; elegir: (d: string) => void; encima: (d: string | null) => void;
}) {
  const fin = sumarDias(mover(mes, 1), -1);
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
            <button key={d} type="button" disabled={fuera} onClick={() => elegir(d)} onMouseEnter={() => encima(d)}
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
  const [vista, setVista] = useState(() => inicioMes(hasta));   // mes de la derecha (en el celular, el único)
  const [inicio, setInicio] = useState<string | null>(null);   // primer clic, esperando el fin
  const [sobre, setSobre] = useState<string | null>(null);
  const cerrar = () => { setInicio(null); if (caja.current) caja.current.open = false; };

  // Mientras se elige, el rango se dibuja desde el primer clic hasta el día bajo el cursor.
  const [a, b] = inicio ? [inicio, sobre ?? inicio].sort() : [desde, hasta];
  function elegir(d: string) {
    if (!inicio) { setInicio(d); return; }
    const [x, y] = [inicio, d].sort();
    poner({ p: "personalizado", d1: x, d2: y });
    cerrar();
  }
  const minVista = inicioMes(primero), maxVista = inicioMes(ultimo);

  return (
    <details ref={caja} className="relative" onToggle={(e) => { if (!(e.target as HTMLDetailsElement).open) setInicio(null); }}>
      <summary className="campo cursor-pointer list-none flex items-center gap-2 !h-9 font-medium">
        <CalendarRange size={15} className="text-[var(--tenue)]" aria-hidden />
        <span>{periodo === "personalizado" ? "Del" : PERIODOS[periodo]}</span>
        <span className="num text-[var(--tenue)] font-normal">{desde === hasta ? fechaLarga(desde) : `${corto(desde)} – ${fechaLarga(hasta)}`}</span>
        <ChevronDown size={14} className="text-[var(--tenue)]" aria-hidden />
      </summary>
      <div className="flotante w-[min(94vw,760px)] p-3 grid gap-3 sm:grid-cols-[180px_1fr] left-0">
        <div className="grid content-start gap-0.5 sm:border-r sm:border-[var(--linea)] sm:pr-3" role="group" aria-label="Periodos rápidos">
          {(Object.keys(PERIODOS) as Periodo[]).filter((k) => k !== "personalizado").map((k) => (
            <button key={k} type="button" onClick={() => { poner({ p: k === periodoDefecto ? null : k, d1: null, d2: null }); cerrar(); }}
                    className={`text-left text-[13px] px-2.5 py-1.5 rounded-md hover:bg-[var(--superficie-2)] ${k === periodo ? "bg-[var(--acento-suave)] font-semibold" : ""}`}>
              {PERIODOS[k]}
            </button>
          ))}
        </div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <button type="button" className="boton !h-8 !px-2" disabled={vista <= minVista} onClick={() => setVista(mover(vista, -1))} aria-label="Mes anterior">
              <ChevronLeft size={15} aria-hidden />
            </button>
            <p className="text-xs text-[var(--tenue)]">
              {inicio ? `Desde ${fechaLarga(inicio)}: elige el día final` : "Elige el día inicial y luego el final"}
            </p>
            <button type="button" className="boton !h-8 !px-2" disabled={vista >= maxVista} onClick={() => setVista(mover(vista, 1))} aria-label="Mes siguiente">
              <ChevronRight size={15} aria-hidden />
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[mover(vista, -1), vista].map((m, i) => (
              <div key={m} className={i ? "grid" : "hidden sm:grid"}>
                <Mes mes={m} primero={primero} ultimo={ultimo} desde={a} hasta={b} elegir={elegir} encima={setSobre} />
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[var(--tenue)]">Hay datos del {fechaLarga(primero)} al {fechaLarga(ultimo)}.</p>
        </div>
      </div>
    </details>
  );
}
