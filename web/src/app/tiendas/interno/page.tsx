import { clienteSupabase } from "@/lib/supabase/server";
import { datosCarga } from "@/lib/cargasServidor";
import { datosEjecutivo } from "@/lib/ejecutivo";
import { tiposRetail } from "@/lib/retail";
import * as t from "@/lib/tiendas";
import { vistaTiendas } from "../vista";

export const metadata = { title: "Tiendas · Power BI · Calderón" };

type Params = Promise<{ [k: string]: string | string[] | undefined }>;

export default async function TiendasInterno({ searchParams }: { searchParams: Params }) {
  const sb = await clienteSupabase();
  const { data: { user } } = await sb.auth.getUser();
  return vistaTiendas(await searchParams, user?.email, { maestros: () => t.maestrosTiendas(sb), panel: (a, b, f) => t.panel(sb, a, b, f), tipos: () => tiposRetail(sb), ejecutivo: (a, b, f) => datosEjecutivo(sb, "tiendas", a, b, f),
    carga: () => datosCarga(sb, "tiendas") });
}

