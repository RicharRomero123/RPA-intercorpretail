"use client";

import {
  CircleCheck, CircleX, FileSpreadsheet, LoaderCircle, TriangleAlert, Undo2, Upload, X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ErrorArchivo, leerArchivo, type Equivalencia, type Lectura, type Tipo } from "@/lib/cargas";
import { entero, soles } from "@/lib/formato";
import { clienteNavegador } from "@/lib/supabase/navegador";
import { Tabla } from "./Tabla";
import { Aviso } from "./ui";

type Existente = { tienda: string; filas: number; und: number; venta: number };
/** Retail: tipo de retail elegido para cada cliente del archivo, y los tipos que ya existen. */
type Tipos = { asignar: Record<string, string>; existentes: string[] };
type Base = { lectura: Lectura; existente: Existente[]; tipos: Tipos };
type Estado =
  | { paso: "leyendo" }
  | { paso: "error"; mensaje: string }
  | ({ paso: "vista" } & Base)
  | ({ paso: "subiendo"; avance: string } & Base)
  | ({ paso: "cargado"; carga: string; resultado: { filas: number; venta: number; reemplazo_filas: number; reemplazo_venta: number } } & Base)
  | ({ paso: "deshecho"; mensaje: string } & Base)
  | ({ paso: "fallo"; mensaje: string } & Base);
type Archivo = { id: string; nombre: string; estado: Estado };

const PARTE = 2000; // filas por envío
const NOMBRE_TIPO = { contanet: "ContaNet · Reporte detallado", tiendas: "Tienda · venta diaria (hoja Data)", retail: "Ventas retail · despachos a clientes", virtual: "Ventas virtuales · Lima y Provincia", oxxo: "OXXO · reporte diario por tienda" };
/** Tipos de retail que se sugieren al escribir (se puede escribir cualquier otro). */
const TIPOS_SUGERIDOS = ["Supermercados", "Conveniencia", "Delivery / quick commerce", "Vending", "Mayorista / distribuidor"];
const faltaTipo = (l: Lectura, t: Tipos) => (l.clientes ?? []).some((c) => !t.asignar[c.cliente]?.trim());
const fecha = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
const ICONO_AVISO = { ok: CircleCheck, aviso: TriangleAlert, error: CircleX };
const COLOR_AVISO = { ok: "text-[var(--bueno)]", aviso: "text-[var(--alerta)]", error: "text-[var(--critico)]" };

/** Subir Excel de ContaNet o de tiendas: se leen en el navegador, se muestra la vista previa con los cuadres y, al
 *  confirmar, se cargan a la base reemplazando el mismo rango (la base verifica que lo guardado sea idéntico). */
export function CargarDatos({ equivalencias, skus, correo, solo }: {
  equivalencias: Equivalencia[]; skus: string[]; correo?: string;
  /** Si se indica, solo acepta ese tipo de archivo (por ejemplo, en Tiendas · ContaNet solo reportes de ContaNet). */
  solo?: Tipo;
}) {
  const router = useRouter();
  const [archivos, setArchivos] = useState<Archivo[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const poner = (id: string, estado: Estado) => setArchivos((xs) => xs.map((a) => (a.id === id ? { ...a, estado } : a)));

  async function agregar(lista: FileList | null) {
    for (const f of Array.from(lista ?? [])) {
      const id = `${f.name}-${f.size}-${Date.now()}`;
      setArchivos((xs) => [{ id, nombre: f.name, estado: { paso: "leyendo" } }, ...xs]);
      await new Promise((r) => setTimeout(r, 30)); // deja pintar «Leyendo…»
      try {
        const lectura = await leerArchivo(f.name, await f.arrayBuffer(), equivalencias, skus);
        if (solo && lectura.tipo !== solo) {
          throw new ErrorArchivo(`Aquí solo se cargan archivos de tipo «${NOMBRE_TIPO[solo]}»; este es «${NOMBRE_TIPO[lectura.tipo]}». Súbelo en Configuración → Cargar datos.`);
        }
        const sb = clienteNavegador();
        const { data, error } = await sb.rpc("cargas_existente", { p_tipo: lectura.tipo, p_rangos: lectura.rangos });
        if (error) throw new Error(`No se pudo consultar la base: ${error.message}`);
        const existente = ((data ?? []) as Existente[]).map((e) => ({ ...e, filas: Number(e.filas), und: Number(e.und), venta: Number(e.venta) }));
        const tipos: Tipos = { asignar: {}, existentes: [] };
        if (lectura.tipo === "retail") {
          const [cl, tp] = await Promise.all([sb.from("retail_clientes").select("cliente, tipo"), sb.from("retail_tipos").select("tipo").order("tipo")]);
          const conocidos = new Map((cl.data ?? []).map((c) => [c.cliente as string, c.tipo as string]));
          tipos.existentes = (tp.data ?? []).map((t) => t.tipo as string);
          for (const c of lectura.clientes ?? []) tipos.asignar[c.cliente] = conocidos.get(c.cliente) ?? "";
        }
        poner(id, { paso: "vista", lectura, existente, tipos });
      } catch (e) {
        poner(id, { paso: "error", mensaje: e instanceof ErrorArchivo || e instanceof Error ? e.message : String(e) });
      }
    }
  }

  async function cargar(a: Archivo) {
    if (a.estado.paso !== "vista" && a.estado.paso !== "fallo") return;
    const { lectura, existente, tipos } = a.estado;
    const sb = clienteNavegador();
    let carga: string | null = null;
    try {
      poner(a.id, { paso: "subiendo", lectura, existente, tipos, avance: "Preparando…" });
      const { data, error } = await sb.from("cargas_web").insert({
        tipo: lectura.tipo, archivo: lectura.archivo, desde: lectura.desde, hasta: lectura.hasta, rangos: lectura.rangos,
        filas: lectura.filas.length, und: lectura.und, venta: lectura.venta, avisos: lectura.avisos, correo,
        clientes: lectura.clientes?.map((c) => ({ ...c, tipo: tipos.asignar[c.cliente].trim() })) ?? null,
      }).select("id").single();
      if (error) throw new Error(error.message);
      carga = data.id as string;
      const partes = Math.ceil(lectura.filas.length / PARTE);
      for (let i = 0; i < partes; i++) {
        poner(a.id, { paso: "subiendo", lectura, existente, tipos, avance: `Subiendo ${i + 1} de ${partes}…` });
        const { error: e } = await sb.from("cargas_web_filas").insert({ carga, parte: i, filas: lectura.filas.slice(i * PARTE, (i + 1) * PARTE) });
        if (e) throw new Error(e.message);
      }
      poner(a.id, { paso: "subiendo", lectura, existente, tipos, avance: "Guardando y verificando el cuadre…" });
      const { data: r, error: e } = await sb.rpc("confirmar_carga", { p_id: carga });
      if (e) throw new Error(e.message);
      const res = r as Record<string, number>;
      poner(a.id, { paso: "cargado", carga: carga!, lectura, existente, tipos, resultado: {
        filas: Number(res.filas), venta: Number(res.venta), reemplazo_filas: Number(res.reemplazo_filas), reemplazo_venta: Number(res.reemplazo_venta),
      } });
      router.refresh();
    } catch (e) {
      if (carga) await sb.from("cargas_web").delete().eq("id", carga); // quita lo subido a medias
      poner(a.id, { paso: "fallo", lectura, existente, tipos, mensaje: e instanceof Error ? e.message : String(e) });
    }
  }

  async function deshacer(a: Archivo) {
    if (a.estado.paso !== "cargado") return;
    const { carga, lectura, existente, tipos } = a.estado;
    if (!window.confirm("¿Deshacer esta carga? Se quitan las filas de este archivo y vuelven las que había antes en la base.")) return;
    const { data, error } = await clienteNavegador().rpc("deshacer_carga", { p_id: carga });
    poner(a.id, { paso: "deshecho", lectura, existente, tipos,
      mensaje: error ? `No se pudo deshacer: ${error.message}` : `Carga deshecha: se quitaron ${entero(Number((data as Record<string, number>).quitadas))} filas y volvieron ${entero(Number((data as Record<string, number>).devueltas))}.` });
    if (!error) router.refresh();
  }

  return (
    <div className="grid gap-4">
      <label onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }} onDragLeave={() => setArrastrando(false)}
             onDrop={(e) => { e.preventDefault(); setArrastrando(false); agregar(e.dataTransfer.files); }}
             className={`grid place-items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center cursor-pointer transition-colors
               ${arrastrando ? "border-[var(--acento)] bg-[var(--acento-suave)]" : "border-[var(--linea)] hover:border-[var(--acento)]"}`}>
        <Upload size={26} className="text-[var(--acento)]" aria-hidden />
        <span className="text-sm font-semibold">Arrastra aquí los Excel o haz clic para elegirlos</span>
        <span className="text-xs text-[var(--tenue)] max-w-xl">
          «Reporte detallado» de ventas de ContaNet (exportado con filtros en TODOS y en SOLES), Excel de venta diaria de tienda
          (hoja «Data») o Excel de ventas retail (despachos a OXXO y otros clientes). Puedes subir varios a la vez. Nada se guarda hasta que revises la vista previa y pulses «Cargar a la base».
        </span>
        <input type="file" accept=".xlsx,.xls" multiple className="sr-only" onChange={(e) => { agregar(e.target.files); e.target.value = ""; }} />
      </label>
      {archivos.map((a) => (
        <Vista key={a.id} a={a} cargar={() => cargar(a)} deshacer={() => deshacer(a)} quitar={() => setArchivos((xs) => xs.filter((x) => x.id !== a.id))}
               asignar={(cliente, tipo) => setArchivos((xs) => xs.map((x) => (x.id === a.id && "tipos" in x.estado
                 ? { ...x, estado: { ...x.estado, tipos: { ...x.estado.tipos, asignar: { ...x.estado.tipos.asignar, [cliente]: tipo } } } } : x)))} />
      ))}
    </div>
  );
}

function Vista({ a, cargar, deshacer, quitar, asignar }: {
  a: Archivo; cargar: () => void; deshacer: () => void; quitar: () => void; asignar: (cliente: string, tipo: string) => void;
}) {
  const e = a.estado;
  const [confirmando, setConfirmando] = useState(false);
  const [revisado, setRevisado] = useState(false);
  const cabecera = (detalle?: React.ReactNode) => (
    <header className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0">
        <span className="grid place-items-center size-9 rounded-lg bg-[var(--acento-suave)] text-[var(--acento)] shrink-0"><FileSpreadsheet size={17} aria-hidden /></span>
        <div className="min-w-0">
          <b className="block text-[15px] truncate">{a.nombre}</b>
          <span className="text-xs text-[var(--tenue)]">{detalle}</span>
        </div>
      </div>
      {e.paso !== "subiendo" && <button type="button" className="boton !px-2" onClick={quitar} aria-label="Quitar"><X size={15} aria-hidden /></button>}
    </header>
  );

  if (e.paso === "leyendo") {
    return <section className="tarjeta p-5">{cabecera(<span className="flex items-center gap-1.5"><LoaderCircle size={13} className="animate-spin" aria-hidden /> Leyendo el archivo…</span>)}</section>;
  }
  if (e.paso === "error") {
    return (
      <section className="tarjeta p-5 grid gap-3">
        {cabecera("No se puede cargar")}
        <p className="flex gap-2 text-sm text-[var(--critico)]"><CircleX size={16} className="shrink-0 mt-0.5" aria-hidden />{e.mensaje}</p>
      </section>
    );
  }

  const { lectura: l, existente, tipos } = e;
  const quien = l.tipo === "retail" || l.tipo === "oxxo" ? "Cliente" : l.tipo === "virtual" ? "Canal" : "Tienda";
  const sinTipo = faltaTipo(l, tipos);
  const base = new Map(existente.map((x) => [x.tienda, x]));
  const tiendas = [...new Set([...l.porTienda.map((t) => t.tienda), ...existente.map((x) => x.tienda)])];
  const comparacion = tiendas.map((t) => {
    const r = l.porTienda.find((x) => x.tienda === t), b = base.get(t);
    return { tienda: t, desde: r ? fecha(r.desde) : "", hasta: r ? fecha(r.hasta) : "", filas: r?.filas ?? 0, und: r?.und ?? 0, venta: r?.venta ?? 0,
             base_filas: b?.filas ?? 0, base_venta: b?.venta ?? 0, dif: (r?.venta ?? 0) - (b?.venta ?? 0) };
  }).sort((x, y) => y.venta - x.venta);
  const baseFilas = existente.reduce((s, x) => s + x.filas, 0), baseVenta = existente.reduce((s, x) => s + x.venta, 0);
  const columnasMuestra = Object.keys(l.filas[0] ?? {}).map((k) => ({ clave: k, titulo: k, tipo: "texto" as const }));

  return (
    <section className="tarjeta p-5 grid gap-4">
      {cabecera(<>{NOMBRE_TIPO[l.tipo]} · del {fecha(l.desde)} al {fecha(l.hasta)} · {entero(l.filas.length)} filas · {soles(l.venta)}</>)}

      <ul className="grid gap-1.5 text-sm">
        {l.avisos.map((x) => {
          const Icono = ICONO_AVISO[x.nivel];
          return <li key={x.texto} className="flex gap-2"><Icono size={16} className={`shrink-0 mt-0.5 ${COLOR_AVISO[x.nivel]}`} aria-hidden />{x.texto}</li>;
        })}
      </ul>

      <div className="grid gap-2">
        <span className="etiqueta">Archivo vs lo que hoy está en la base ({l.tipo === "retail" ? "mismos clientes y fechas" : (l.tipo === "virtual" || l.tipo === "oxxo") ? "mismas fechas" : "mismas tiendas y fechas"})</span>
        <Tabla archivo={`vista_previa_${l.archivo.replace(/\.xlsx$/i, "")}.xlsx`} hoja="Vista previa" filas={comparacion}
               columnas={[{ clave: "tienda", titulo: quien, tipo: "texto" }, { clave: "desde", titulo: "Desde", tipo: "texto" },
                 { clave: "hasta", titulo: "Hasta", tipo: "texto" }, { clave: "filas", titulo: "Filas", tipo: "entero" },
                 { clave: "und", titulo: "Unidades", tipo: "entero" }, { clave: "venta", titulo: "Venta archivo S/", tipo: "soles" },
                 { clave: "base_filas", titulo: "Filas en la base", tipo: "entero" }, { clave: "base_venta", titulo: "Venta en la base S/", tipo: "soles" },
                 { clave: "dif", titulo: "Diferencia S/", tipo: "soles" }]}
               total={{ tienda: "TOTAL", filas: l.filas.length, und: l.und, venta: l.venta, base_filas: baseFilas, base_venta: baseVenta, dif: l.venta - baseVenta }} />
        <p className="text-xs text-[var(--tenue)]">
          Diferencia = venta del archivo − venta que hoy tiene la base en esas fechas. Si el archivo trae días nuevos, la diferencia es la venta nueva;
          si cambia algo de días ya cargados, revisa que sea una corrección esperada.
        </p>
      </div>

      {l.tipo === "retail" && (
        <div className="grid gap-2">
          <span className="etiqueta">Tipo de retail de cada cliente</span>
          <p className="text-xs text-[var(--tenue)]">Elige un tipo que ya existe o escribe uno nuevo (por ejemplo «Conveniencia»). Cada tipo aparece
            como su propio apartado dentro de Retail. Los clientes ya conocidos vienen con su tipo; puedes cambiarlo.</p>
          <datalist id={`tipos-${a.id}`}>{[...new Set([...tipos.existentes, ...TIPOS_SUGERIDOS])].map((t) => <option key={t} value={t} />)}</datalist>
          <ul className="grid gap-2">
            {(l.clientes ?? []).map((c) => (
              <li key={c.cliente} className="grid sm:grid-cols-[1fr_auto] items-center gap-2 rounded-lg border border-[var(--linea)] px-3 py-2">
                <span className="text-sm min-w-0"><b className="font-medium">{c.cliente}</b>{c.ruc && <span className="text-[var(--tenue)]"> · RUC {c.ruc}</span>}</span>
                <input className={`campo w-full sm:w-64 ${tipos.asignar[c.cliente]?.trim() ? "" : "!border-[var(--critico)]"}`} list={`tipos-${a.id}`}
                       placeholder="Tipo de retail…" aria-label={`Tipo de retail de ${c.cliente}`} value={tipos.asignar[c.cliente] ?? ""}
                       disabled={e.paso === "subiendo" || e.paso === "cargado"} onChange={(ev) => asignar(c.cliente, ev.target.value)} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {l.pendientes.length > 0 && (
        <div className="grid gap-2">
          <span className="etiqueta">Códigos sin SKU oficial</span>
          <Tabla archivo="codigos_pendientes.xlsx" hoja="Pendientes" filas={l.pendientes}
                 columnas={[{ clave: "codigo", titulo: "Código", tipo: "texto" }, { clave: "detalle", titulo: "Detalle", tipo: "texto" },
                   { clave: "filas", titulo: "Filas", tipo: "entero" }, { clave: "venta", titulo: "Venta S/", tipo: "soles" }]} />
        </div>
      )}

      <details className="grid gap-2">
        <summary className="cursor-pointer text-sm font-medium text-[var(--acento)]">Ver las primeras 15 filas tal como se guardarán</summary>
        <div className="mt-2"><Tabla archivo="muestra.xlsx" hoja="Muestra" filas={l.filas.slice(0, 15)} columnas={columnasMuestra} /></div>
      </details>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--linea)] pt-4">
        <p className="text-xs text-[var(--tenue)] max-w-2xl">
          {e.paso === "cargado" ? <>Se reemplazaron {entero(e.resultado.reemplazo_filas)} filas ({soles(e.resultado.reemplazo_venta)}) que tenía la base en esas{" "}
            {(l.tipo === "contanet" || l.tipo === "virtual" || l.tipo === "oxxo") ? "fechas" : l.tipo === "retail" ? "clientes y fechas" : "tiendas y fechas"}. Lo guardado cuadra al céntimo con el archivo.</> : <>
          Al cargar se reemplazan {entero(baseFilas)} filas ({soles(baseVenta)}) que hoy tiene la base en esas {(l.tipo === "contanet" || l.tipo === "virtual" || l.tipo === "oxxo") ? "fechas" : l.tipo === "retail" ? "clientes y fechas" : "tiendas y fechas"}{" "}
          por las {entero(l.filas.length)} del archivo. Si lo guardado no cuadra al céntimo con lo leído, no se cambia nada.</>}
        </p>
        {e.paso === "cargado" ? (
          <span className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2 text-sm font-semibold text-[var(--bueno)]">
              <CircleCheck size={18} aria-hidden /> Cargado y verificado: {entero(e.resultado.filas)} filas · {soles(e.resultado.venta)}
            </span>
            <button type="button" className="boton" onClick={deshacer}><Undo2 size={15} aria-hidden /> Deshacer esta carga</button>
          </span>
        ) : e.paso === "deshecho" ? (
          <span className="flex items-center gap-2 text-sm font-semibold"><Undo2 size={16} aria-hidden /> {e.mensaje}</span>
        ) : e.paso === "subiendo" ? (
          <span className="flex items-center gap-2 text-sm"><LoaderCircle size={16} className="animate-spin text-[var(--acento)]" aria-hidden /> {e.avance}</span>
        ) : !confirmando ? (
          <button type="button" className="boton-primario" disabled={!l.puedeCargar || sinTipo} onClick={() => setConfirmando(true)}
                  title={!l.puedeCargar ? "Corrige los errores marcados en rojo" : sinTipo ? "Asigna el tipo de retail de cada cliente" : undefined}>
            <Upload size={15} aria-hidden /> {e.paso === "fallo" ? "Reintentar" : "Revisar y confirmar…"}
          </button>
        ) : null}
      </footer>
      {confirmando && (e.paso === "vista" || e.paso === "fallo") && (
        <div className="grid gap-3 rounded-xl border-2 border-[var(--alerta)] bg-[var(--alerta-suave)] p-4" role="alertdialog" aria-label="Confirmar carga">
          <b className="flex items-center gap-2 text-[15px]"><TriangleAlert size={18} className="text-[var(--alerta)]" aria-hidden /> Confirma la carga</b>
          <ul className="grid gap-1 text-sm list-disc pl-5">
            <li>Se <b>quitan {entero(baseFilas)} filas ({soles(baseVenta)})</b> que hoy tiene la base del {fecha(l.desde)} al {fecha(l.hasta)}
              {(l.tipo === "contanet" || l.tipo === "virtual" || l.tipo === "oxxo") ? "" : ` para ${l.porTienda.length === 1 ? l.porTienda[0].tienda : `${l.porTienda.length} ${l.tipo === "retail" ? "clientes" : "tiendas"}`}`}.</li>
            <li>Se <b>ponen {entero(l.filas.length)} filas ({soles(l.venta)})</b> de «{l.archivo}».</li>
            <li>La base guarda una copia de lo que se quita: si algo sale mal, puedes <b>deshacer esta carga</b>.</li>
          </ul>
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input type="checkbox" className="accent-[var(--acento)] size-4" checked={revisado} onChange={(ev) => setRevisado(ev.target.checked)} />
            Revisé la vista previa y los números son correctos
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="boton-primario" disabled={!revisado} onClick={() => { setConfirmando(false); setRevisado(false); cargar(); }}>
              <Upload size={15} aria-hidden /> Sí, cargar a la base
            </button>
            <button type="button" className="boton" onClick={() => { setConfirmando(false); setRevisado(false); }}>Cancelar</button>
          </div>
        </div>
      )}
      {e.paso === "fallo" && <Aviso tipo="critico" titulo="No se cargó">{e.mensaje}</Aviso>}
    </section>
  );
}
