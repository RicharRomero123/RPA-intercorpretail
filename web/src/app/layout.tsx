import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ProveedorAcceso } from "@/components/Acceso";
import { leerAcceso } from "@/lib/accesoServidor";
import { clienteSupabase } from "@/lib/supabase/server";

// Una sola familia, sobria y pensada para cifras (números de ancho fijo para que las columnas se alineen).
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "Calderón · Ventas",
  description: "Ventas de Turrones Calderón por canal: retail (Supermercados Peruanos) y tiendas propias.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const sb = await clienteSupabase();
  const { data: { user } } = await sb.auth.getUser();
  const acceso = user ? await leerAcceso(sb) : { modulos: null };
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col"><ProveedorAcceso acceso={acceso}>{children}</ProveedorAcceso></body>
    </html>
  );
}
