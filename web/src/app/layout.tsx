import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Una sola familia, sobria y pensada para cifras (números de ancho fijo para que las columnas se alineen).
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "Calderón · Ventas",
  description: "Ventas de Turrones Calderón por canal: retail (Supermercados Peruanos) y tiendas propias.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
