"use client";

import { Info, Lightbulb, Sigma } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useState } from "react";
import { createPortal } from "react-dom";
import { GLOSARIO, type ClaveGlosario } from "@/lib/glosario";

const ANCHO = 312;
const ALTO_ESTIMADO = 340; // alto habitual del recuadro; si abajo no alcanza, se abre hacia arriba

/** Ícono ⓘ que, al pasar el cursor (o tocarlo en el celular), explica qué es el número, cómo se calcula y para qué
 *  sirve. El recuadro se dibuja sobre toda la página (portal) y se reubica para no salirse de la pantalla. */
export function Ayuda({ clave, tamano = 14 }: { clave: ClaveGlosario; tamano?: number }) {
  const e = GLOSARIO[clave];
  const id = useId();
  // Posición del ícono al abrir y alto real del recuadro (se mide al dibujarlo).
  const [ancla, setAncla] = useState<{ left: number; arriba: number; abajo: number; altoVentana: number } | null>(null);
  const [alto, setAlto] = useState(ALTO_ESTIMADO);
  const [usado, setUsado] = useState(false); // el recuadro se crea recién al abrirlo por primera vez
  const pos = ancla;

  function abrir(el: HTMLElement) {
    const r = el.getBoundingClientRect();
    const left = Math.min(Math.max(8, r.left + r.width / 2 - ANCHO / 2), window.innerWidth - ANCHO - 8);
    setUsado(true);
    setAncla({ left, arriba: r.top, abajo: r.bottom, altoVentana: window.innerHeight });
  }
  const cerrar = () => setAncla(null);

  /** Abajo del ícono si entra; si no, arriba; y si no entra en ninguno, se desplaza lo justo para quedar completo. */
  let top = 0;
  if (ancla) {
    const cabeAbajo = ancla.abajo + 8 + alto <= ancla.altoVentana - 8;
    const cabeArriba = ancla.arriba - 8 - alto >= 8;
    top = cabeAbajo || !cabeArriba ? ancla.abajo + 8 : ancla.arriba - 8 - alto;
    top = Math.min(Math.max(8, top), ancla.altoVentana - alto - 8);
  }
  const medir = (el: HTMLDivElement | null) => {
    if (el && Math.abs(el.offsetHeight - alto) > 1) setAlto(el.offsetHeight);
  };

  return (
    <>
      <button type="button" aria-label={`Qué es: ${e.titulo}`} aria-describedby={pos ? id : undefined}
              className="inline-grid place-items-center shrink-0 rounded-full text-[var(--tenue)] hover:text-[var(--acento)] focus-visible:text-[var(--acento)] focus-visible:outline-2 focus-visible:outline-[var(--acento)] cursor-help align-middle"
              onPointerEnter={(ev) => ev.pointerType === "mouse" && abrir(ev.currentTarget)}
              onPointerLeave={(ev) => ev.pointerType === "mouse" && cerrar()}
              onFocus={(ev) => abrir(ev.currentTarget)} onBlur={cerrar}
              onKeyDown={(ev) => ev.key === "Escape" && cerrar()}
              onClick={(ev) => { ev.stopPropagation(); if (!pos) abrir(ev.currentTarget); }}>
        <Info size={tamano} strokeWidth={2} aria-hidden />
      </button>
      {usado && createPortal(
        <AnimatePresence>
          {pos && (
            <motion.div id={id} role="tooltip" ref={medir} initial={{ opacity: 0, y: 4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.98 }} transition={{ duration: 0.14, ease: "easeOut" }}
                        style={{ position: "fixed", left: pos.left, top, width: ANCHO, maxHeight: pos.altoVentana - 16, zIndex: 100 }}
                        className="tarjeta p-4 grid gap-2.5 text-[12.5px] leading-relaxed normal-case tracking-normal font-normal text-left pointer-events-none overflow-hidden !shadow-xl">
              <b className="text-[13.5px] text-[var(--tinta)]">{e.titulo}</b>
              <p className="text-[var(--tinta)]">{e.que}</p>
              <div className="grid gap-1">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--acento)]">
                  <Sigma size={12} aria-hidden /> Cómo se calcula
                </span>
                <p className="rounded-md bg-[var(--superficie-2)] border border-[var(--linea)] px-2.5 py-1.5 text-[var(--tinta)]">{e.formula}</p>
                {"ejemplo" in e && e.ejemplo && <p className="text-[var(--tenue)]"><i>Ejemplo:</i> {e.ejemplo}</p>}
              </div>
              <p className="flex gap-1.5 text-[var(--tenue)]"><Lightbulb size={13} className="shrink-0 mt-0.5 text-[var(--acento)]" aria-hidden /> {e.uso}</p>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
