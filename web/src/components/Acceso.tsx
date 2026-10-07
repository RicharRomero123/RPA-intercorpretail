"use client";

import { createContext, useContext } from "react";
import type { Acceso } from "@/lib/acceso";

/** Acceso del usuario en sesión, para el menú y los botones (los datos ya los filtra la base). */
const Contexto = createContext<Acceso>({ modulos: null });
export function ProveedorAcceso({ acceso, children }: { acceso: Acceso; children: React.ReactNode }) {
  return <Contexto.Provider value={acceso}>{children}</Contexto.Provider>;
}
export const useAcceso = () => useContext(Contexto);
