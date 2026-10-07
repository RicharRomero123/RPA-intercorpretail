import type { SupabaseClient } from "@supabase/supabase-js";
import type { Acceso, Modulo } from "./acceso";

/** Acceso del usuario en sesión (la base solo le deja leer su propia fila de usuario_acceso). Sin fila = acceso completo. */
export async function leerAcceso(sb: SupabaseClient): Promise<Acceso> {
  const { data } = await sb.from("usuario_acceso").select("modulos").maybeSingle();
  return { modulos: data?.modulos?.length ? (data.modulos as Modulo[]) : null };
}
