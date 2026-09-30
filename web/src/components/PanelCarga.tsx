"use client";

import { Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Equivalencia, Tipo } from "@/lib/cargas";
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
