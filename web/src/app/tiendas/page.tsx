// Tiendas ya no tiene «Resumen» (pedido del usuario, 2026-10-09): solo Power BI y ContaNet. La ruta /tiendas lleva al Power BI.
import { redirect } from "next/navigation";

export default function Tiendas() {
  redirect("/tiendas/interno");
}
