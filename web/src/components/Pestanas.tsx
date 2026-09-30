"use client";

import { useState } from "react";

/** Pestañas dentro de una sección (por ejemplo, Detalle de ventas → Por local / Por producto). */
export function Pestanas({ pestanas }: { pestanas: { id: string; titulo: string; contenido: React.ReactNode }[] }) {
  const [activa, setActiva] = useState(pestanas[0].id);
  const actual = pestanas.find((p) => p.id === activa) ?? pestanas[0];
  return (
    <div className="grid gap-4">
      <div className="segmento w-fit max-w-full overflow-x-auto" role="tablist" aria-label="Vista del detalle">
        {pestanas.map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected={p.id === actual.id}
                  onClick={() => setActiva(p.id)}>{p.titulo}</button>
        ))}
      </div>
      <div role="tabpanel" className="grid gap-4">{actual.contenido}</div>
    </div>
  );
}
