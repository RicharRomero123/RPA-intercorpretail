"use client";

import { LoaderCircle, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { empezarCarga, useInicioCarga } from "@/lib/cargando";

/** Registra en el estado global que este filtro o enlace está trayendo datos (no dibuja nada: el aviso lo muestra el marco). */
export function AvisoCargando({ activo }: { activo: boolean }) {
  useEffect(() => (activo ? empezarCarga() : undefined), [activo]);
  return null;
}

const LENTO_MS = 15_000;

/** Píldora de carga; si pasan 15 s cambia a «Está tardando más de lo normal» con Reintentar. Se monta de nuevo en cada carga. */
function Pildora() {
  const [lento, setLento] = useState(false);
  useEffect(() => { const t = setTimeout(() => setLento(true), LENTO_MS); return () => clearTimeout(t); }, []);
  return lento ? (
    <div className="pildora-carga lenta">
      Está tardando más de lo normal
      <button type="button" className="boton presionable !h-7 !px-2.5" onClick={() => window.location.reload()}>
        <RotateCcw size={13} aria-hidden /> Reintentar
      </button>
    </div>
  ) : (
    <div className="pildora-carga"><LoaderCircle size={15} className="animate-spin" aria-hidden />Actualizando datos…</div>
  );
}

/** El único indicador de carga de la página (va en el marco): línea de progreso arriba de todo y la píldora bajo la barra superior.
 *  El contenedor role="status" queda siempre montado para que los lectores de pantalla anuncien el cambio. */
export function IndicadorCarga() {
  const inicio = useInicioCarga();
  return (
    <div role="status" aria-live="polite" className="aviso-cargando">
      {inicio !== null && (
        <>
          <div className="barra-carga" aria-hidden />
          <Pildora key={inicio} />
        </>
      )}
    </div>
  );
}
