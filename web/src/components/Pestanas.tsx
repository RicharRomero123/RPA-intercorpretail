"use client";

import { useState } from "react";

/** Pestañas: todo el contenido llega ya calculado del servidor; aquí solo se elige cuál se ve. */
export function Pestanas({ pestanas }: { pestanas: { id: string; titulo: string; contenido: React.ReactNode }[] }) {
  const [activa, setActiva] = useState(pestanas[0]?.id);
  return (
    <div className="grid gap-4">
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-[var(--linea)]">
        {pestanas.map((p) => (
          <button key={p.id} id={`tab-${p.id}`} role="tab" type="button" aria-selected={activa === p.id}
                  aria-controls={`panel-${p.id}`} onClick={() => setActiva(p.id)}
                  className={`px-3 py-2 text-sm -mb-px border-b-2 ${activa === p.id
                    ? "border-[var(--acento)] text-[var(--tinta)] font-semibold" : "border-transparent text-[var(--tenue)] hover:text-[var(--tinta)]"}`}>
            {p.titulo}
          </button>
        ))}
      </div>
      {pestanas.map((p) => (
        <div key={p.id} id={`panel-${p.id}`} role="tabpanel" aria-labelledby={`tab-${p.id}`} hidden={activa !== p.id} className="grid gap-4">
          {p.contenido}
        </div>
      ))}
    </div>
  );
}
