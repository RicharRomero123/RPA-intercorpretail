import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Cliente de Supabase para el servidor (páginas, acciones y rutas), con la sesión del usuario en cookies.
 *  Las consultas pasan por las reglas de seguridad de la base: solo usuarios con sesión pueden leer. */
export async function clienteSupabase() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // En una página (Server Component) no se pueden escribir cookies; proxy.ts ya renueva la sesión.
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {}
      },
    },
  });
}
