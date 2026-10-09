// Accesos por usuario (tabla usuario_acceso, 031_accesos.sql). Sin fila = acceso completo; con fila, solo esos módulos.
// La base ya bloquea los datos con sus reglas; aquí solo se decide a qué páginas se deja entrar y qué se muestra en el menú.

export type Modulo = "consolidado" | "retail" | "tiendas" | "digital" | "rappi" | "configuracion";
/** null = acceso completo. */
export type Acceso = { modulos: Modulo[] | null };

/** Rutas de cada módulo (prefijos). */
export const RUTAS: Record<Modulo, string[]> = {
  consolidado: ["/consolidado", "/b2b"], retail: ["/retail"], tiendas: ["/tiendas"], digital: ["/canales/digital"], rappi: ["/canales/rappi"],
  configuracion: ["/configuracion"],
};
/** Página de entrada de cada módulo (la primera permitida es el inicio del usuario). */
const INICIO: Record<Modulo, string> = {
  consolidado: "/consolidado", retail: "/retail", tiendas: "/tiendas/interno", digital: "/canales/digital", rappi: "/canales/rappi", configuracion: "/configuracion",
};

export const puede = (a: Acceso, m: Modulo) => a.modulos === null || a.modulos.includes(m);

/** ¿Puede abrir esta ruta? La portada «/» siempre (redirige a su inicio). */
export function rutaPermitida(a: Acceso, ruta: string) {
  if (a.modulos === null || ruta === "/") return true;
  return a.modulos.some((m) => RUTAS[m]?.some((r) => ruta === r || ruta.startsWith(`${r}/`)));
}

export const inicioDe = (a: Acceso) => (a.modulos === null ? "/consolidado" : INICIO[a.modulos[0]] ?? "/login");
