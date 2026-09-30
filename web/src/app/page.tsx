import { redirect } from "next/navigation";

/** La portada abre el resumen general de todos los canales. */
export default function Inicio() {
  redirect("/consolidado");
}
