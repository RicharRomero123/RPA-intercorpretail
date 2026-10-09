"use client";

// Compras por departamento: mapa del Perú pintado por intensidad (5 niveles del naranja de la marca; sin compras en gris) y, al
// costado, la lista con un círculo proporcional a la venta. El mapa dice dónde; la lista dice cuánto (en el mapa Loreto se ve
// enorme y Callao casi no se ve: el tamaño del departamento no es la venta). Pasar el mouse o el foco por un departamento resalta
// el mismo en el otro lado; tocarlo filtra toda la página a ese departamento.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { entero, porcentaje, soles } from "@/lib/formato";
import mapa from "@/lib/mapas/peru-departamentos.json";
import { AvisoCargando } from "./AvisoCargando";

export type FilaDepartamento = { departamento: string; venta: number; pedidos: number; clientes: number; detalle?: string; filtrable?: boolean };
const NIVELES = [22, 40, 58, 78, 100];   // % del naranja de la marca en cada nivel
const clave = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
const relleno = (nivel: number | null) => (nivel === null ? "var(--neutro-suave)" : `color-mix(in srgb, var(--serie-1) ${NIVELES[nivel]}%, var(--superficie))`);

export function MapaDepartamentos({ filas, sinUbicar = 0 }: { filas: FilaDepartamento[]; sinUbicar?: number }) {
  const router = useRouter(), ruta = usePathname(), sp = useSearchParams();
  const [cargando, iniciar] = useTransition();
  const [foco, setFoco] = useState<string | null>(null);
  const elegido = sp.get("dep");

  const conVenta = filas.filter((f) => f.venta > 0).sort((a, b) => b.venta - a.venta);
  const total = conVenta.reduce((a, f) => a + f.venta, 0) + sinUbicar;
  const max = conVenta[0]?.venta ?? 1;
  // Cortes por cuantiles (la venta está muy concentrada: con cortes iguales casi todo quedaría en el primer nivel).
  const orden = conVenta.map((f) => f.venta).sort((a, b) => a - b);
  const cortes = [0.2, 0.4, 0.6, 0.8].map((q) => orden[Math.min(orden.length - 1, Math.floor(q * orden.length))] ?? 0);
  const nivelDe = (v: number) => (v > 0 ? cortes.filter((c) => v > c).length : null);
  const porClave = new Map(filas.map((f) => [clave(f.departamento), f]));

  const elegir = (f: FilaDepartamento | undefined) => {
    if (!f || f.filtrable === false) return;
    const p = new URLSearchParams(sp.toString());
    if (elegido === f.departamento) p.delete("dep"); else p.set("dep", f.departamento);
    iniciar(() => router.push(`${ruta}?${p}`, { scroll: false }));
  };
  const activo = foco ?? elegido;
  const fActiva = activo ? porClave.get(clave(activo)) : undefined;
  // El resaltado se dibuja al final para que su borde quede encima de los vecinos.
  const deps = [...mapa.departamentos].sort((a, b) => Number(clave(a.nombre) === clave(activo ?? "")) - Number(clave(b.nombre) === clave(activo ?? "")));

  return (
    <div className="grid gap-6 @3xl:grid-cols-[minmax(240px,1fr)_minmax(260px,1.1fr)] @3xl:items-start">
      <AvisoCargando activo={cargando} />
      <figure className="grid gap-3 m-0">
        <p className="min-h-10 text-sm" aria-live="polite">
          {fActiva && fActiva.venta > 0
            ? <><b>{fActiva.departamento}</b> · <span className="num">{soles(fActiva.venta)}</span> · {entero(fActiva.pedidos)} pedidos ·{" "}
                <span className="num">{porcentaje(fActiva.venta / (total || 1))}</span> del total{fActiva.detalle && <span className="block text-xs text-[var(--tenue)]">{fActiva.detalle}</span>}</>
            : activo ? <><b>{activo}</b> · sin compras en el periodo</>
            : <span className="text-[var(--tenue)]">Pasa el mouse o toca un departamento.</span>}
        </p>
        <svg viewBox={`0 0 ${mapa.ancho} ${mapa.alto}`} className="w-full max-w-[420px] mx-auto h-auto" role="group" aria-label="Mapa del Perú por departamento">
          {deps.map((dep) => {
            const f = porClave.get(clave(dep.nombre));
            const v = f?.venta ?? 0, nivel = nivelDe(v);
            const on = clave(dep.nombre) === clave(activo ?? "");
            const puede = v > 0 && f?.filtrable !== false;
            return (
              <path key={dep.nombre} d={dep.d} fill={relleno(nivel)} stroke={on ? "var(--tinta)" : "var(--superficie)"} strokeWidth={on ? 2 : 0.9}
                    strokeLinejoin="round" className={`transition-[stroke] duration-150 outline-none ${puede ? "cursor-pointer" : ""}`}
                    tabIndex={v > 0 ? 0 : -1} role={puede ? "button" : undefined}
                    aria-label={`${dep.nombre}: ${v > 0 ? `${soles(v)}, ${f?.pedidos ?? 0} pedidos` : "sin compras"}`}
                    onMouseEnter={() => setFoco(dep.nombre)} onMouseLeave={() => setFoco(null)} onFocus={() => setFoco(dep.nombre)} onBlur={() => setFoco(null)}
                    onClick={() => puede && elegir(f)} onKeyDown={(e) => { if (puede && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); elegir(f); } }}>
                <title>{dep.nombre}</title>
              </path>
            );
          })}
        </svg>
        <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--tenue)]">
          {NIVELES.map((_, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="inline-block size-3 rounded-sm" style={{ background: relleno(i) }} aria-hidden />
              {i === 0 ? `hasta ${soles(cortes[0]).replace(/\.\d\d$/, "")}` : i === NIVELES.length - 1 ? `más de ${soles(cortes[3]).replace(/\.\d\d$/, "")}` : `hasta ${soles(cortes[i]).replace(/\.\d\d$/, "")}`}
            </span>
          ))}
          <span className="flex items-center gap-1"><span className="inline-block size-3 rounded-sm bg-[var(--neutro-suave)] border border-[var(--linea)]" aria-hidden />sin compras</span>
        </figcaption>
      </figure>

      <ol className="grid gap-0.5">
        {conVenta.map((f, i) => {
          const on = clave(f.departamento) === clave(activo ?? "");
          const diametro = 8 + 22 * Math.sqrt(f.venta / max);
          const fila = (
            <>
              <span className="num w-5 text-right text-xs text-[var(--tenue)]">{i + 1}</span>
              <span className="grid size-[30px] place-items-center" aria-hidden>
                <span className="rounded-full" style={{ width: diametro, height: diametro, background: relleno(nivelDe(f.venta)), boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--serie-1) 55%, transparent)" }} />
              </span>
              <span className="min-w-0">
                <span className={`block truncate text-sm ${on ? "font-semibold" : "font-medium"}`}>{f.departamento}</span>
                {f.detalle && <span className="block truncate text-[11px] text-[var(--tenue)]">{f.detalle}</span>}
              </span>
              <span className="text-right">
                <span className="num block text-sm">{soles(f.venta)}</span>
                <span className="num block text-[11px] text-[var(--tenue)]">{porcentaje(f.venta / (total || 1))} · {entero(f.pedidos)} pedidos</span>
              </span>
            </>
          );
          const clase = `grid grid-cols-[20px_30px_1fr_auto] items-center gap-2 rounded-md px-1.5 py-1 ${on ? "bg-[var(--acento-suave)]" : ""}`;
          return (
            <li key={f.departamento} onMouseEnter={() => setFoco(f.departamento)} onMouseLeave={() => setFoco(null)}>
              {f.filtrable === false
                ? <div className={clase}>{fila}</div>
                : <button type="button" className={`${clase} presionable w-full text-left hover:bg-[var(--superficie-2)]`} aria-pressed={elegido === f.departamento}
                          onClick={() => elegir(f)} onFocus={() => setFoco(f.departamento)} onBlur={() => setFoco(null)}
                          title={elegido === f.departamento ? "Quitar el filtro" : `Ver solo ${f.departamento}`}>{fila}</button>}
            </li>
          );
        })}
        {sinUbicar > 0 && (
          <li className="grid grid-cols-[20px_30px_1fr_auto] items-center gap-2 px-1.5 py-1 text-[var(--tenue)]">
            <span /><span /><span className="text-sm">Sin ubicar</span><span className="num text-right text-sm">{soles(sinUbicar)}</span>
          </li>
        )}
        <li className="px-1.5 pt-2 text-xs text-[var(--tenue)]">Toca un departamento (en el mapa o aquí) para ver toda la página solo con él.</li>
      </ol>
    </div>
  );
}
