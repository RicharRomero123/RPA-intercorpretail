import { notFound, redirect } from "next/navigation";
import { datosEjecutivo } from "@/lib/ejecutivo";
import { limitesRetail, panelRetail, tiposRetail } from "@/lib/retail";
import { clienteSupabase } from "@/lib/supabase/server";
import { vistaTipo } from "./vista";

export const metadata = { title: "Retail · Calderón" };

export default async function TipoRetail({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  // Clientes con sell-out tienen su propia vista (ventas por tienda, stock, despachado vs vendido): la dirección antigua lleva ahí.
  const propia: Record<string, string> = { oxxo: "/retail/oxxo", "supermercados-peruanos": "/retail/spsa" };
  if (propia[slug]) redirect(propia[slug]);
  const sb = await clienteSupabase();
  const { data: { user } } = await sb.auth.getUser();
  const vista = await vistaTipo(slug, sp, user?.email, {
    tipos: () => tiposRetail(sb), limites: (t) => limitesRetail(sb, t), panel: (t, a, b, f) => panelRetail(sb, t, a, b, f),
    ejecutivo: (t, a, b, f) => datosEjecutivo(sb, `retail:${t}`, a, b, f),
  });
  return vista ?? notFound();
}
