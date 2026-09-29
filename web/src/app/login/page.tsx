"use client";

import { LogIn } from "lucide-react";
import Image from "next/image";
import { useActionState } from "react";
import { ingresar } from "./actions";

export default function Login() {
  const [estado, accion, enviando] = useActionState(ingresar, {});
  return (
    <main className="min-h-screen grid place-items-center px-4 bg-[var(--fondo)]">
      <div className="w-full max-w-sm grid gap-6">
        <div className="grid justify-items-center gap-3 rounded-xl bg-[var(--lateral)] px-6 py-6">
          <Image src="/assets/logo-calderon.png" alt="Turrones y Panetones Calderón" width={200} height={113} priority className="h-auto w-48" />
          <p className="text-xs tracking-wide uppercase text-[#f7b36a] font-semibold">Retail · Sell-out SPSA</p>
        </div>
        <form action={accion} className="tarjeta grid gap-4 p-6">
          <h1 className="text-xl font-bold">Ingresar</h1>
          <label className="grid gap-1 text-sm">
            Correo
            <input id="correo" name="correo" type="email" required autoComplete="email" className="campo" />
          </label>
          <label className="grid gap-1 text-sm">
            Contraseña
            <input id="clave" name="clave" type="password" required autoComplete="current-password" className="campo" />
          </label>
          {estado.error && <p className="text-sm text-[var(--critico)]" role="alert">{estado.error}</p>}
          <button type="submit" disabled={enviando} className="boton-primario">
            <LogIn size={16} aria-hidden /> {enviando ? "Ingresando…" : "Ingresar"}
          </button>
          <p className="text-xs text-[var(--tenue)]">El acceso lo da el administrador. Si no tienes usuario, pídelo.</p>
        </form>
      </div>
    </main>
  );
}
