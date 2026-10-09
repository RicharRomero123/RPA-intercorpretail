// Resumen del Canal digital: SOLO el total de sus dos partes, Lima · delivery y Provincia (el detalle está en cada página).
// Meses cerrados: consolidado (LIMA y PROVINCIA, real y meta) y su año anterior; mes en curso: ContaNet al último día cargado,
// dividido con el Excel de ventas virtuales. Unidades por SKU: sku_mensual. Aparte, el cuadre del Excel virtual con ContaNet.
import { CalendarRange, Map as IconoMapa, MapPin, TrendingUp } from "lucide-react";
import Link from "next/link";
import { salir } from "@/app/login/actions";
import { EvolucionCanales } from "@/components/EvolucionCanales";
import { Marco } from "@/components/Marco";
import { BarraVariacion, Medidor } from "@/components/ResumenEjecutivo";
import { Tabla } from "@/components/Tabla";
import { Tarjeta } from "@/components/ui";
import { avanceMesContaNet, cuadreDigital, metaMes } from "@/lib/contanet";
import { millones, porcentaje, soles } from "@/lib/formato";
import { MESES_CORTOS, rangoMeses } from "@/lib/meses";
import { fechaLarga } from "@/lib/periodos";
import { tiposRetail } from "@/lib/retail";
import { clienteSupabase } from "@/lib/supabase/server";
import { seccionCuadre } from "./cuadre";

export const metadata = { title: "Canal digital · Calderón" };

const PARTES = [
  { canal: "LIMA", base: "digital_lima" as const, nombre: "Lima · delivery", ruta: "/canales/digital/lima", icono: MapPin },
  { canal: "PROVINCIA", base: "digital_provincia" as const, nombre: "Provincia", ruta: "/canales/digital/provincia", icono: IconoMapa },
];
const div = (a: number, b: number) => (b ? a / b : null);
const signo = (x: number | null) => (x === null ? "—" : `${x >= 0 ? "▲ +" : "▼ "}${porcentaje(x)}`);
const colorVar = (x: number | null) => (x === null ? "" : x >= 0 ? "text-[var(--bueno)]" : "text-[var(--critico)]");
const colorCumpl = (x: number | null) => (x === null ? "" : x >= 1 ? "text-[var(--bueno)]" : x >= 0.9 ? "text-[var(--alerta)]" : "text-[var(--critico)]");

export default async function CanalDigital({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const sp = await searchParams;
  const sb = await clienteSupabase();
  const { data: { user } } = await sb.auth.getUser();
  const [tipos, ...mesAv] = await Promise.all([tiposRetail(sb), ...PARTES.map((p) => avanceMesContaNet(sb, p.base))]);
  const hoy = mesAv.map((m) => m.fecha).filter(Boolean).sort().at(-1) ?? new Date().toISOString().slice(0, 10);
  const anio = Number(hoy.slice(0, 4)), mesHoy = Number(hoy.slice(5, 7));
  const [{ data: cons }, metasMes, { data: sku }, cuadre] = await Promise.all([
    sb.from("consolidado_mensual").select("canal, anio, mes, real, meta").in("canal", PARTES.map((p) => p.canal)).in("anio", [anio, anio - 1]),
    Promise.all(PARTES.map((p) => metaMes(sb, p.canal, anio, mesHoy))),
    sb.rpc("sku_mensual", { p_anio: anio, p_corte: hoy }),
    cuadreDigital(sb, `${hoy.slice(0, 7)}-01`, hoy),
  ]);
  const val = (canal: string, a: number, m: number, k: "real" | "meta") => {
    const x = cons?.find((c) => c.canal === canal && c.anio === a && c.mes === m)?.[k];
    return x === null || x === undefined ? null : Number(x);
  };
  // Mes en curso: lo que va según ContaNet (el consolidado lo trae recién al cierre).
  const vaMes = mesAv.map((m) => m.dias.reduce((a, d) => a + (d.venta ?? 0), 0));
  const cerrados = rangoMeses(1, mesHoy - 1);
  const partes = PARTES.map((p, i) => {
    const real = cerrados.reduce((a, m) => a + (val(p.canal, anio, m, "real") ?? 0), 0);
    const meta = cerrados.reduce((a, m) => a + (val(p.canal, anio, m, "meta") ?? 0), 0);
    const ant = cerrados.reduce((a, m) => a + (val(p.canal, anio - 1, m, "real") ?? 0), 0);
    const metaAnio = rangoMeses(1, 12).reduce((a, m) => a + (val(p.canal, anio, m, "meta") ?? 0), 0);
    return { ...p, real, meta, ant, cumpl: div(real, meta), var: ant ? real / ant - 1 : null, mes: vaMes[i], metaMes: metasMes[i],
             avanceMes: metasMes[i] ? vaMes[i] / metasMes[i]! : null, anio: real + vaMes[i], metaAnio, avance: div(real + vaMes[i], metaAnio) };
  });
  const T = partes.reduce((a, p) => ({ real: a.real + p.real, meta: a.meta + p.meta, ant: a.ant + p.ant, mes: a.mes + p.mes, metaMes: a.metaMes + (p.metaMes ?? 0),
    anio: a.anio + p.anio, metaAnio: a.metaAnio + p.metaAnio }), { real: 0, meta: 0, ant: 0, mes: 0, metaMes: 0, anio: 0, metaAnio: 0 });
  const tramo = cerrados.length ? `ene–${MESES_CORTOS[cerrados.length - 1].toLowerCase()}` : "—";
  const mesTxt = `${MESES_CORTOS[mesHoy - 1]} al ${Number(hoy.slice(8, 10))}`;
  const vAnt = T.ant ? T.real / T.ant - 1 : null, vMeta = T.meta ? T.real / T.meta - 1 : null;
  const productos = ((sku ?? []) as { mes: number; canal: string; producto: string; und: number }[]).filter((f) => PARTES.some((p) => p.canal === f.canal));

  const encabezado = (
    <header className="grid gap-1">
      <p className="etiqueta">Canal digital · Turrones Calderón</p>
      <h1 className="text-[28px] font-bold leading-tight">Resumen del canal digital</h1>
      <p className="text-sm text-[var(--tenue)] max-w-4xl">
        Solo el total y cómo se reparte entre <b className="text-[var(--tinta)]">Lima · delivery</b> y <b className="text-[var(--tinta)]">Provincia</b>.
        Meses cerrados del consolidado; {mesTxt.toLowerCase()} de ContaNet. El detalle de cada uno está en su página.
      </p>
    </header>
  );

  const contenido = (
    <>
      {/* Total del canal en los meses cerrados, con el mismo diseño del Resumen general */}
      <div className="grid gap-5 rounded-xl border border-[var(--linea)] bg-[var(--superficie)] p-4 @4xl:grid-cols-[minmax(200px,0.8fr)_2.6fr] @4xl:gap-6 @4xl:px-5">
        <div className="grid content-center gap-1">
          <p className="text-[13px] text-[var(--tenue)]">Canal digital {anio} · {tramo}</p>
          <p className="cifra num text-[28px] @5xl:text-[30px] font-semibold leading-tight tracking-[-0.02em]">{soles(T.real)}</p>
          <p className="text-xs text-[var(--tenue)]">+ {soles(T.mes)} en {mesTxt.toLowerCase()}</p>
        </div>
        <dl className="grid gap-5 @2xl:gap-0 @2xl:grid-cols-3 @2xl:divide-x divide-[var(--linea)]">
          {[
            { t: `Var % vs ${anio - 1}`, v: signo(vAnt), c: colorVar(vAnt), g: <BarraVariacion v={vAnt} />, x: `${tramo} · ${anio - 1}: ${soles(T.ant)}` },
            { t: "Var % vs meta", v: signo(vMeta), c: colorVar(vMeta), g: <BarraVariacion v={vMeta} />, x: `${tramo} · meta ${soles(T.meta)}` },
            { t: `Avance de la meta ${anio}`, v: porcentaje(div(T.anio, T.metaAnio)), c: "", g: <Medidor c={div(T.anio, T.metaAnio)} marca={1} color="var(--serie-1)" />,
              x: `${soles(T.anio)} de ${millones(T.metaAnio)} (incluye ${mesTxt.toLowerCase()})` },
          ].map((k) => (
            <div key={k.t} className="grid content-start gap-1.5 @2xl:px-4 @2xl:first:pl-0 @2xl:last:pr-0">
              <dt className="text-[13px] text-[var(--tenue)]">{k.t}</dt>
              <dd className={`num text-[20px] font-semibold leading-tight ${k.c}`}>{k.v}</dd>
              <dd>{k.g}</dd>
              <dd className="text-xs text-[var(--tenue)]">{k.x}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Las dos partes, lado a lado */}
      <div className="grid gap-4 @3xl:grid-cols-2">
        {partes.map((p) => (
          <Tarjeta key={p.canal} icono={p.icono} titulo={p.nombre} subtitulo={`${porcentaje(div(p.anio, T.anio))} del canal en el año`}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div><dt className="text-xs text-[var(--tenue)]">Real {tramo}</dt><dd className="num text-lg font-semibold">{soles(p.real)}</dd></div>
              <div><dt className="text-xs text-[var(--tenue)]">Cumplimiento {tramo}</dt><dd className={`num text-lg font-semibold ${colorCumpl(p.cumpl)}`}>{porcentaje(p.cumpl)}</dd></div>
              <div><dt className="text-xs text-[var(--tenue)]">vs {anio - 1}</dt><dd className={`num font-semibold ${colorVar(p.var)}`}>{signo(p.var)}</dd></div>
              <div><dt className="text-xs text-[var(--tenue)]">{mesTxt} vs meta del mes</dt>
                <dd className="num font-semibold">{soles(p.mes)} <span className={`text-xs ${colorCumpl(p.avanceMes)}`}>({porcentaje(p.avanceMes)} de {p.metaMes ? soles(p.metaMes) : "—"})</span></dd></div>
            </dl>
            <Link href={p.ruta} className="text-sm font-medium text-[var(--acento)] hover:underline w-fit">Ver el detalle de {p.nombre} →</Link>
          </Tarjeta>
        ))}
      </div>

      <Tarjeta icono={CalendarRange} titulo="Lima y Provincia, mes a mes" subtitulo={`Real, meta y ${anio - 1} de cada uno (consolidado) · ${mesTxt} de ContaNet`}>
        <Tabla archivo={`canal_digital_${anio}.xlsx`} hoja="Mes a mes"
               filas={rangoMeses(1, mesHoy).map((m) => {
                 const enCurso = m === mesHoy;
                 const r = PARTES.map((p, i) => (enCurso ? vaMes[i] : val(p.canal, anio, m, "real") ?? 0));
                 const mt = PARTES.map((p) => val(p.canal, anio, m, "meta") ?? 0);
                 return { mes: `${MESES_CORTOS[m - 1]}${enCurso ? ` (al ${Number(hoy.slice(8, 10))})` : ""}`, lima: r[0], provincia: r[1], total: r[0] + r[1],
                          meta: mt[0] + mt[1], cumpl: div(r[0] + r[1], mt[0] + mt[1]), part_prov: div(r[1], r[0] + r[1]),
                          ant: PARTES.reduce((a, p) => a + (val(p.canal, anio - 1, m, "real") ?? 0), 0) };
               })}
               columnas={[{ clave: "mes", titulo: "Mes", tipo: "texto" }, { clave: "lima", titulo: "Lima S/", tipo: "soles" }, { clave: "provincia", titulo: "Provincia S/", tipo: "soles" },
                 { clave: "total", titulo: "Total S/", tipo: "soles" }, { clave: "meta", titulo: "Meta S/", tipo: "soles" }, { clave: "cumpl", titulo: "Cumplimiento", tipo: "porcentaje" },
                 { clave: "part_prov", titulo: "% Provincia", tipo: "porcentaje" }, { clave: "ant", titulo: `${anio - 1} S/`, tipo: "soles" }]} />
      </Tarjeta>

      <Tarjeta icono={TrendingUp} titulo="Evolución de Lima y Provincia" subtitulo={`Unidades vendidas cada mes de ${anio} · en Venta S/, con su meta y ${anio - 1}`}>
        <EvolucionCanales mesCorte={mesHoy} parcial={`al ${Number(hoy.slice(8, 10))}`}
                          series={PARTES.map((p, i) => ({ canal: p.canal, nombre: p.nombre, conUnidades: true, meses: rangoMeses(1, mesHoy).map((m) => {
                            const delMes = productos.filter((f) => f.canal === p.canal && f.mes === m);
                            const skus = Object.entries(delMes.reduce<Record<string, number>>((t, f) => ({ ...t, [f.producto]: (t[f.producto] ?? 0) + Number(f.und) }), {}))
                              .map(([producto, und]) => ({ producto, und })).filter((x) => x.und).sort((a, b) => b.und - a.und);
                            return { mes: m, real: m === mesHoy ? vaMes[i] : val(p.canal, anio, m, "real"), meta: val(p.canal, anio, m, "meta"),
                                     ant: val(p.canal, anio - 1, m, "real"), und: skus.reduce((a, x) => a + x.und, 0) || null, skus };
                          }) }))} />
      </Tarjeta>
    </>
  );

  return (
    <Marco seccion={sp.s} ubicacion="canales/digital/resumen" tiposRetail={tipos} encabezado={encabezado} usuario={user?.email} salir={salir} datosAl={fechaLarga(hoy)}
           secciones={[{ id: "ventas", titulo: "Resumen", contenido },
                       { id: "cuadre", titulo: "Cuadre con ContaNet", contenido: seccionCuadre(cuadre, `${fechaLarga(`${hoy.slice(0, 7)}-01`)} – ${fechaLarga(hoy)}`) }]} />
  );
}
