"use client";

import { LoaderCircle, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { entero, soles } from "@/lib/formato";
import { clienteNavegador } from "@/lib/supabase/navegador";

export type CargaWeb = {
  id: string; creada: string; correo: string | null; tipo: string; archivo: string; desde: string; hasta: string;
  filas: number; venta: number; estado: string; reemplazo_venta: number | null;
};
const TIPO: Record<string, string> = { contanet: "ContaNet", tiendas: "Tiendas", retail: "Retail", virtual: "Ventas virtuales" };
const fecha = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
const cuando = (s: string) => new Date(s).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" });

/** Archivos cargados desde la web. La última carga vigente de cada tipo se puede deshacer (vuelve lo que había antes). */
export function HistorialCargas({ cargas }: { cargas: CargaWeb[] }) {
  const router = useRouter();
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  // Se puede deshacer una carga vigente si ninguna carga vigente posterior del mismo tipo cubre sus fechas
  // (las cargas vienen de la más nueva a la más vieja). Así, los avances del día no impiden deshacer el cierre.
  const ultimas = new Set(cargas.filter((c, i) => c.estado === "cargada" && !cargas.slice(0, i).some((o) =>
    o.estado === "cargada" && o.tipo === c.tipo && o.desde <= c.hasta && o.hasta >= c.desde)).map((c) => c.id));

  async function deshacer(c: CargaWeb) {
    if (!window.confirm(`¿Deshacer la carga de «${c.archivo}»? Se quitan sus ${entero(c.filas)} filas y vuelven las que había antes en la base.`)) return;
    setTrabajando(c.id); setMensaje(null);
    const { data, error } = await clienteNavegador().rpc("deshacer_carga", { p_id: c.id });
    setTrabajando(null);
    const r = data as Record<string, number> | null;
    setMensaje(error ? `No se pudo deshacer: ${error.message}` : `Carga deshecha: se quitaron ${entero(Number(r?.quitadas))} filas y volvieron ${entero(Number(r?.devueltas))}.`);
    if (!error) router.refresh();
  }

  if (!cargas.length) return <p className="text-sm text-[var(--tenue)]">Todavía no se cargó ningún archivo desde la web.</p>;
  return (
    <div className="grid gap-2">
      {mensaje && <p className="text-sm font-medium">{mensaje}</p>}
      <div className="overflow-auto max-h-[420px] rounded-lg border border-[var(--linea)]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[var(--superficie-2)] text-left text-xs uppercase text-[var(--tenue)]">
            <tr>{["Cargado", "Por", "Tipo", "Archivo", "Fechas", "Filas", "Venta S/", "Estado", ""].map((t) => <th key={t} className="px-3 py-2 font-semibold whitespace-nowrap">{t}</th>)}</tr>
          </thead>
          <tbody>
            {cargas.map((c) => (
              <tr key={c.id} className={`border-t border-[var(--linea)] ${c.estado === "deshecha" ? "opacity-55" : ""}`}>
                <td className="px-3 py-2 whitespace-nowrap">{cuando(c.creada)}</td>
                <td className="px-3 py-2">{c.correo ?? "—"}</td>
                <td className="px-3 py-2">{TIPO[c.tipo] ?? c.tipo}</td>
                <td className="px-3 py-2 max-w-72 truncate" title={c.archivo}>{c.archivo}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fecha(c.desde)} – {fecha(c.hasta)}</td>
                <td className="px-3 py-2 num text-right">{entero(c.filas)}</td>
                <td className="px-3 py-2 num text-right">{soles(Number(c.venta)).replace("S/ ", "")}</td>
                <td className="px-3 py-2">{c.estado === "cargada" ? "Vigente" : "Deshecha"}</td>
                <td className="px-3 py-2 text-right">
                  {ultimas.has(c.id) && (
                    <button type="button" className="boton !py-1 !px-2 text-xs" disabled={trabajando !== null} onClick={() => deshacer(c)}>
                      {trabajando === c.id ? <LoaderCircle size={13} className="animate-spin" aria-hidden /> : <Undo2 size={13} aria-hidden />} Deshacer
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[var(--tenue)]">Se puede deshacer una carga si ninguna carga posterior cubre sus mismas fechas. La base guarda la copia de lo
        reemplazado en las 2 últimas cargas de varios días y las 4 últimas de un solo día (avances), por tipo.</p>
    </div>
  );
}
