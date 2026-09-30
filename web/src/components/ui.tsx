import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import type { ClaveGlosario } from "@/lib/glosario";
import { porcentaje } from "@/lib/formato";
import { Ayuda } from "./Ayuda";

/** Tarjeta con encabezado (ícono, título, subtítulo) y contenido. */
export function Tarjeta({ titulo, subtitulo, icono: Icono, accion, children, className = "", info }: {
  titulo?: string; subtitulo?: React.ReactNode; icono?: LucideIcon; accion?: React.ReactNode;
  children: React.ReactNode; className?: string; info?: ClaveGlosario;
}) {
  return (
    <section className={`tarjeta p-5 grid gap-4 content-start min-w-0 ${className}`}>
      {(titulo || accion) && (
        <header className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {Icono && (
              <span className="grid place-items-center size-8 rounded-lg bg-[var(--acento-suave)] text-[var(--acento)] shrink-0">
                <Icono size={16} strokeWidth={2} aria-hidden />
              </span>
            )}
            <div className="min-w-0">
              {titulo && <h3 className="text-[15px] font-semibold leading-tight flex items-center gap-1.5">{titulo}{info && <Ayuda clave={info} />}</h3>}
              {subtitulo && <p className="text-xs text-[var(--tenue)] mt-0.5">{subtitulo}</p>}
            </div>
          </div>
          {accion}
        </header>
      )}
      {children}
    </section>
  );
}

/** Variación porcentual con flecha y color (verde sube, rojo baja). */
export function Variacion({ valor }: { valor: number | null | undefined }) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return null;
  const sube = valor >= 0;
  const Icono = sube ? TrendingUp : TrendingDown;
  return (
    <span className={`pastilla ${sube ? "pastilla-sube" : "pastilla-baja"}`}>
      <Icono size={12} strokeWidth={2.5} aria-hidden /> {porcentaje(Math.abs(valor))}
    </span>
  );
}

const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const dmy = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

/** Franja que dice en palabras qué fechas se están viendo y contra cuáles se comparan. */
export function FranjaComparacion({ desde, hasta, comp, tipo, hayDatos = true }: {
  desde: string; hasta: string; comp: [string, string] | null; tipo: "anio" | "ant" | "sem" | "no"; hayDatos?: boolean;
}) {
  const dias = Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 86_400_000) + 1;
  const regla = tipo === "anio" ? `mismo corte: ${Number(hasta.slice(8, 10))} de ${MESES_LARGOS[Number(hasta.slice(5, 7)) - 1]}, un año antes`
    : tipo === "ant" ? `los ${dias} días justo antes` : tipo === "sem" ? "las mismas fechas, 7 días antes" : "";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-[var(--linea)] bg-[var(--superficie)] px-3 py-2 text-sm">
      <span className="flex items-center gap-2">
        <span className="rounded bg-[var(--acento)] px-1.5 py-0.5 text-[11px] font-bold text-white">{hasta.slice(0, 4)}</span>
        <b className="num">{dmy(desde)} – {dmy(hasta)}</b><span className="text-xs text-[var(--tenue)]">({dias} días)</span>
      </span>
      {comp ? (
        <>
          <span className="text-[var(--tenue)]" aria-hidden>⟷</span>
          <span className="flex items-center gap-2">
            <span className="rounded bg-[var(--serie-gris)] px-1.5 py-0.5 text-[11px] font-bold text-white">{comp[1].slice(0, 4)}</span>
            <b className="num">{dmy(comp[0])} – {dmy(comp[1])}</b>
          </span>
          <span className="text-xs text-[var(--tenue)]">· {regla}{!hayDatos && " · sin datos en esas fechas, no hay comparación"}</span>
        </>
      ) : <span className="text-xs text-[var(--tenue)]">· sin comparación</span>}
    </div>
  );
}

/** Título de sección con descripción. */
export function Encabezado({ titulo, descripcion }: { titulo: string; descripcion?: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <h2 className="text-xl font-bold">{titulo}</h2>
      {descripcion && <p className="text-sm text-[var(--tenue)] max-w-3xl">{descripcion}</p>}
    </div>
  );
}

/** Ranking en barras horizontales hechas con HTML (texto siempre legible, sin gráfico pesado). */
export function ListaBarras({ filas, formato }: {
  filas: { etiqueta: string; valor: number; detalle?: string }[]; formato: (v: number) => string;
}) {
  const max = Math.max(...filas.map((f) => f.valor), 0) || 1;
  return (
    <ul className="grid gap-2">
      {filas.map((f) => (
        <li key={f.etiqueta} className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm" title={f.detalle}>
          <div className="relative h-8 rounded-md overflow-hidden bg-[var(--superficie-2)]">
            <div className="absolute inset-y-0 left-0 rounded-md bg-[color-mix(in_srgb,var(--serie-1)_18%,transparent)]"
                 style={{ width: `${Math.max(2, (f.valor / max) * 100)}%` }} />
            <span className="relative z-10 flex h-full items-center px-3 truncate">{f.etiqueta}</span>
          </div>
          <span className="num text-right min-w-20">{formato(f.valor)}</span>
        </li>
      ))}
    </ul>
  );
}
