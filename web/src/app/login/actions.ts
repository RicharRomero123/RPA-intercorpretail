"use server";

import { redirect } from "next/navigation";
import { clienteSupabase } from "@/lib/supabase/server";

export async function ingresar(_estado: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const supabase = await clienteSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get("correo") ?? "").trim(),
    password: String(form.get("clave") ?? ""),
  });
  if (error) return { error: "Correo o contraseña incorrectos." };
  redirect("/");
}

export async function salir() {
  const supabase = await clienteSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
