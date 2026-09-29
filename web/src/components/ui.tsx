import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { porcentaje } from "@/lib/formato";

/** Tarjeta con encabezado (ícono, título, subtítulo) y contenido. */
export function Tarjeta({ titulo, subtitulo, icono: Icono, accion, children, className = "" }: {
  titulo?: string; subtitulo?: React.ReactNode; icono?: LucideIcon; accion?: React.ReactNode;
  children: React.ReactNode; className?: string;
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
              {titulo && <h3 className="text-[15px] font-semibold leading-tight">{titulo}</h3>}
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
