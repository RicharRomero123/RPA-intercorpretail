"use client";

// Estado global «la página está trayendo datos nuevos». Cada filtro o enlace que cambia la página se registra mientras carga;
// el marco (Marco) lo lee para atenuar y bloquear el contenido viejo y mostrar un solo indicador de carga.
import { useSyncExternalStore } from "react";

let activos = 0;
let desde: number | null = null;   // cuándo empezó la carga actual (para avisar si tarda)
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((f) => f());

/** Registra una carga en curso; devuelve la función que la da por terminada. */
export function empezarCarga(): () => void {
  if (activos++ === 0) { desde = Date.now(); avisar(); }
  let hecho = false;
  return () => {
    if (hecho) return;
    hecho = true;
    if (--activos === 0) { desde = null; avisar(); }
  };
}

const suscribir = (f: () => void) => { oyentes.add(f); return () => { oyentes.delete(f); }; };
/** Momento en que empezó la carga actual, o null si no hay ninguna. */
export const useInicioCarga = () => useSyncExternalStore(suscribir, () => desde, () => null);
