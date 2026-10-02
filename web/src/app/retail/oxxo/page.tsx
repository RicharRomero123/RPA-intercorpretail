import { vistaSellout } from "@/app/retail/sellout";
import { CONFIG } from "@/lib/ejecutivo";

export const metadata = { title: "OXXO · Calderón" };

/** OXXO: sell-out de sus reportes diarios (venta neta, unidades y stock por tienda). Cadena = cluster (A/B/C), zona = distrito. */
export default async function Oxxo({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  return vistaSellout(await searchParams, {
    cliente: "OXXO", tipoRetail: "OXXO", ubicacion: "retail/oxxo", titulo: "OXXO", etiqueta: "Retail · Conveniencia",
    corto: "OXXO", fuente: "oxxo", ejecutivo: CONFIG.oxxo, cadena: "Cluster", zona: "Distrito",
    ayudaIngreso: "Estimado: unidades vendidas × precio al que Calderón despachó a OXXO (OXXO no reporta su costo).",
    notaFuente: "es un estimado con el precio de despacho a OXXO y no incluye el costo de producción",
    // Campaña de temporada: el 22/08/2026 entran el 500 g y el 450 g (antes, solo reposición regular de mini turrones).
    temporada: "2026-08-22",
  });
}
