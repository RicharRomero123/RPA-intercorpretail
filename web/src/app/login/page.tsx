"use client";

import { useActionState } from "react";
import { ingresar } from "./actions";

export default function Login() {
  const [estado, accion, enviando] = useActionState(ingresar, {});
  return (
    <main className="min-h-screen grid place-items-center px-4 bg-[var(--fondo)]">
      <form action={accion} className="w-full max-w-sm grid gap-4 rounded-lg border border-[var(--linea)] bg-[var(--superficie)] p-6">
        <div>
          <p className="text-xs uppercase tracking-wider text-[var(--tenue)]">Turrones Calderón</p>
          <h1 className="text-2xl font-bold">Retail · sell-out</h1>
        </div>
        <label className="grid gap-1 text-sm">
          Correo
          <input id="correo" name="correo" type="email" required autoComplete="email" className="campo" />
        </label>
        <label className="grid gap-1 text-sm">
          Contraseña
          <input id="clave" name="clave" type="password" required autoComplete="current-password" className="campo" />
        </label>
        {estado.error && <p className="text-sm text-[var(--critico)]">{estado.error}</p>}
        <button type="submit" disabled={enviando} className="boton-primario">
          {enviando ? "Ingresando…" : "Ingresar"}
        </button>
        <p className="text-xs text-[var(--tenue)]">El acceso lo da el administrador. Si no tienes usuario, pídelo.</p>
      </form>
    </main>
  );
}
