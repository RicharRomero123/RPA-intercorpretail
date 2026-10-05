import { ArrowLeft, CalendarCheck, CircleCheck, CircleX, Clock, DatabaseZap, History, Upload } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { salir } from "@/app/login/actions";
import { CargarDatos } from "@/components/CargarDatos";
import { HistorialCargas, type CargaWeb } from "@/components/HistorialCargas";
import { MenuUsuario } from "@/components/MenuUsuario";
import { FormatoArchivo } from "@/components/PanelCarga";
import { Tabla } from "@/components/Tabla";
import { Encabezado, Tarjeta } from "@/components/ui";
import * as db from "@/lib/datos";
import type { Equivalencia } from "@/lib/cargas";
import { entero } from "@/lib/formato";
import { fechaLarga } from "@/lib/periodos";
import { clienteSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Configuración · Calderón Retail" };

function Dato({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <div className="grid gap-0.5 rounded-lg border border-[var(--linea)] px-4 py-3">
      <span className="text-xs text-[var(--tenue)]">{titulo}</span>
      <b className="num text-lg">{valor}</b>
      {detalle && <span className="text-xs text-[var(--tenue)]">{detalle}</span>}
    </div>
  );
}

/** Configuración: estado de los datos y registro de cargas del robot (no es parte del análisis). */
export default async function Configuracion() {
  const sb = await clienteSupabase();
  const { data: { user } } = await sb.auth.getUser();
  const [lim, cargas, eq, maestro, web] = await Promise.all([
    db.limites(sb), db.cargas(sb),
    sb.from("sku_equivalencia").select("sistema, codigo, sku"),
    sb.from("sku_maestro").select("sku"),
    sb.from("cargas_web").select("id, creada, correo, tipo, archivo, desde, hasta, filas, venta, estado, reemplazo_venta")
      .in("estado", ["cargada", "deshecha"]).order("creada", { ascending: false }).limit(200),
  ]);
  const ultima = cargas[0];
  const ok = cargas.filter((c) => c.estado === "ok").length;
  const problemas = cargas.filter((c) => c.estado !== "ok");
  const cuando = (s?: string) => (s ? new Date(s).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" }) : "—");

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-20 bg-[var(--lateral)] text-[var(--lateral-tinta)]">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 2xl:px-10 h-14">
          <div className="flex items-center gap-3">
            <Image src="/assets/logo-calderon.png" alt="Calderón" width={64} height={36} className="h-8 w-auto" priority />
            <Link href="/" className="flex items-center gap-1.5 text-sm rounded-md px-2.5 py-1.5 hover:bg-[var(--lateral-activo)] hover:text-white">
              <ArrowLeft size={16} aria-hidden /> Volver al dashboard
            </Link>
          </div>
          <MenuUsuario usuario={user?.email} salir={salir} oscuro />
        </div>
      </div>

      <main className="@container px-4 sm:px-6 2xl:px-10 py-6 grid gap-6 max-w-6xl">
        <Encabezado titulo="Configuración" descripcion="Carga de los Excel diarios, estado de los datos y registro de las descargas automáticas del portal de Intercorp." />

        <Tarjeta icono={Upload} titulo="Cargar datos" subtitulo="ContaNet, reporte interno de tiendas, ventas retail, ventas virtuales y OXXO: la web reconoce sola qué archivo es">
          <div className="grid gap-2 @3xl:grid-cols-2">
            {(["tiendas", "retail", "virtual", "oxxo", "contanet"] as const).map((t) => <FormatoArchivo key={t} tipo={t} />)}
          </div>
          <CargarDatos equivalencias={(eq.data ?? []) as Equivalencia[]} skus={(maestro.data ?? []).map((m) => m.sku as string)} correo={user?.email} />
        </Tarjeta>

        <Tarjeta icono={History} titulo="Archivos cargados desde la web" subtitulo="Los más recientes primero · la última carga de cada tipo se puede deshacer">
          <HistorialCargas cargas={(web.data ?? []) as CargaWeb[]} />
        </Tarjeta>

        <div className="grid gap-4 @4xl:grid-cols-2">
          <Tarjeta icono={CalendarCheck} titulo="Estado de los datos">
            <div className="grid gap-3 grid-cols-2">
              <Dato titulo="Venta cargada hasta" valor={lim.ultimo ? fechaLarga(lim.ultimo) : "—"} detalle="SPSA publica con un día de atraso" />
              <Dato titulo="Inventario al" valor={lim.fechaInventario ? fechaLarga(lim.fechaInventario) : "—"} />
              <Dato titulo="Primera venta registrada" valor={lim.primeraVenta ? fechaLarga(lim.primeraVenta) : "—"} />
              <Dato titulo="Última carga" valor={cuando(ultima?.cuando)} detalle={ultima ? `día ${fechaLarga(ultima.fecha)} · ${ultima.estado}` : undefined} />
            </div>
          </Tarjeta>
          <Tarjeta icono={DatabaseZap} titulo="Carga automática">
            <ul className="grid gap-2 text-sm">
              <li className="flex gap-2"><Clock size={16} className="shrink-0 mt-0.5 text-[var(--acento)]" aria-hidden />
                Todos los días a las 7, 8, 9, 10, 11 y 12 h (Lima) un robot revisa el portal y carga el día anterior si ya fue publicado.</li>
              <li className="flex gap-2"><CircleCheck size={16} className="shrink-0 mt-0.5 text-[var(--bueno)]" aria-hidden />
                El detalle por local solo se guarda si su suma cuadra al céntimo con el TOTAL del portal.</li>
              <li className="flex gap-2"><CircleX size={16} className="shrink-0 mt-0.5 text-[var(--critico)]" aria-hidden />
                Si a las 12 h el día anterior sigue sin publicarse, GitHub envía un correo de aviso.</li>
            </ul>
            <div className="grid gap-3 grid-cols-2">
              <Dato titulo="Cargas correctas" valor={entero(ok)} detalle="en las últimas 300" />
              <Dato titulo="Con problemas" valor={entero(problemas.length)} detalle={problemas.length ? "revisa la tabla" : "ninguna"} />
            </div>
          </Tarjeta>
        </div>

        <Tarjeta info="cargas" icono={Clock} titulo="Historial de cargas" subtitulo="Las más recientes primero">
          <Tabla archivo="retail_spsa_cargas.xlsx" hoja="Cargas" alto={620} buscar
                 filas={cargas.map((c) => ({ ...c, cuando: cuando(c.cuando), fecha: fechaLarga(c.fecha) }))}
                 columnas={[{ clave: "cuando", titulo: "Cargado", tipo: "texto" }, { clave: "fecha", titulo: "Día", tipo: "texto" },
                   { clave: "nivel", titulo: "Nivel", tipo: "texto" }, { clave: "estado", titulo: "Estado", tipo: "texto" },
                   { clave: "filas", titulo: "Filas", tipo: "entero" }, { clave: "und", titulo: "Unidades", tipo: "entero" },
                   { clave: "venta", titulo: "Venta S/", tipo: "soles" }, { clave: "detalle", titulo: "Detalle", tipo: "texto" }]} />
        </Tarjeta>
      </main>
    </div>
  );
}
