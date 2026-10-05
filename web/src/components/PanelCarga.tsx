"use client";

import { Download, Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Equivalencia, Tipo } from "@/lib/cargas";
import { FORMATOS } from "@/lib/formatos";
import { CargarDatos } from "./CargarDatos";
import { HistorialCargas, type CargaWeb } from "./HistorialCargas";

/** Botón «Cargar reporte» que abre, encima de la página, la carga con vista previa, confirmación e historial. */
export function PanelCarga({ titulo, solo, equivalencias, skus, correo, cargas }: {
  titulo: string; solo: Tipo; equivalencias: Equivalencia[]; skus: string[]; correo?: string; cargas: CargaWeb[];
}) {
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    window.addEventListener("keydown", cerrar);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", cerrar); document.body.style.overflow = ""; };
  }, [abierto]);

  return (
    <>
      <button type="button" className="boton-primario" onClick={() => setAbierto(true)}><Upload size={15} aria-hidden /> {titulo}</button>
      {abierto && (
        <div className="fixed inset-0 z-50 grid place-items-start justify-items-center overflow-y-auto bg-black/45 p-3 sm:p-8" role="dialog" aria-modal aria-label={titulo}
             onMouseDown={(e) => e.target === e.currentTarget && setAbierto(false)}>
          <div className="tarjeta w-full max-w-5xl p-5 grid gap-5 @container">
            <header className="flex items-start justify-between gap-3">
              <div className="grid gap-1">
                <h2 className="text-lg font-bold">{titulo}</h2>
                <p className="text-sm text-[var(--tenue)]">Revisa la vista previa, confirma y recién ahí se guarda. Si algo sale mal, la última carga se puede deshacer.</p>
              </div>
              <button type="button" className="boton !px-2" onClick={() => setAbierto(false)} aria-label="Cerrar"><X size={16} aria-hidden /></button>
            </header>
            <FormatoArchivo tipo={solo} />
            <CargarDatos equivalencias={equivalencias} skus={skus} correo={correo} solo={solo} />
            <div className="grid gap-2">
              <span className="etiqueta">Cargas anteriores</span>
              <HistorialCargas cargas={cargas} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Formato que espera el cargador: columnas, plantilla para descargar y qué se reemplaza (para no duplicar). */
export function FormatoArchivo({ tipo }: { tipo: Tipo }) {
  const f = FORMATOS[tipo];
  return (
    <details className="rounded-lg border border-[var(--linea)] bg-[var(--superficie)] px-4 py-3 text-sm">
      <summary className="cursor-pointer font-semibold">Formato del archivo: {f.nombre}</summary>
      <div className="grid gap-3 pt-3">
        <p className="text-[var(--tenue)]">{f.origen}</p>
        <div className="flex flex-wrap gap-1.5">
          {f.columnas.map((c) => (
            <span key={c} className={`rounded px-2 py-0.5 text-xs border ${f.obligatorias.includes(c) ? "border-[var(--acento)] font-semibold" : "border-[var(--linea)] text-[var(--tenue)]"}`}>{c}</span>
          ))}
        </div>
        <p className="text-xs text-[var(--tenue)]">En negrita, las columnas obligatorias. El orden no importa; los títulos sí deben llamarse así.</p>
        <p className="text-xs"><b>Sin duplicados:</b> al cargar se reemplaza {f.reemplazo}. Si subes el mismo reporte dos veces, o uno más nuevo que
          repite días, la venta no se suma dos veces: queda la del último archivo.{(tipo === "retail" || tipo === "virtual") && " Si dentro del archivo hay filas idénticas, la vista previa te avisa antes de confirmar."}{tipo === "oxxo" && " Si una tienda y producto se repite el mismo día, no deja cargar."}</p>
        {f.plantilla && (
          <a href={f.plantilla} download className="boton w-fit"><Download size={15} aria-hidden /> Descargar formato en Excel</a>
        )}
      </div>
    </details>
  );
}
