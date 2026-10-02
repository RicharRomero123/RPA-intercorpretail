import { vistaSellout } from "@/app/retail/sellout";
import { CONFIG } from "@/lib/ejecutivo";

export const metadata = { title: "Supermercados SPSA · Calderón" };

export default async function SupermercadosSPSA({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  return vistaSellout(await searchParams, {
    cliente: "SPSA", tipoRetail: "Supermercados Peruanos", ubicacion: "retail/spsa", titulo: "Supermercados Peruanos", etiqueta: "Retail · Supermercados",
    corto: "SPSA", fuente: "spsa", ejecutivo: CONFIG.spsa, cadena: "Cadena", zona: "Zona",
    ayudaIngreso: "Venta a costo del portal: lo que SPSA paga a Calderón por lo vendido.",
    notaFuente: "el portal no trae el costo de producción",
  });
}
