// Sección «Cuadre con ContaNet» del Canal digital: ContaNet (VENTAS01) contra el reporte de ventas virtuales (Lima + Provincia),
// comprobante por comprobante: qué cuadra, qué sobra en ContaNet y qué le falta, con el motivo probable.
import { CalendarDays, ListChecks, Scale } from "lucide-react";
import { Tabla } from "@/components/Tabla";
import { Aviso, Encabezado, Tarjeta } from "@/components/ui";
import type { CuadreDigital } from "@/lib/contanet";
import { entero, soles } from "@/lib/formato";
import { fechaLarga } from "@/lib/periodos";

const signo = (x: number) => `${x >= 0 ? "+" : "−"}${soles(Math.abs(x))}`;

export function seccionCuadre(c: CuadreDigital, rango: string) {
  if (!c.inicio) return <Aviso titulo="Todavía no hay ventas de ContaNet cargadas" />;
  const cn = c.resumen.reduce((a, x) => a + x.contanet, 0), rep = c.resumen.reduce((a, x) => a + x.reporte, 0), dif = cn - rep;
  const n = (e: string) => c.resumen.find((x) => x.estado === e);
  const cuadra = n("Cuadra");
  const resumen = c.resumen.map((x) => ({ ...x, dif: x.contanet - x.reporte }));
  const dias = c.por_dia.map((d) => ({ ...d, dif: d.contanet - d.reporte })).filter((d) => Math.abs(d.dif) > 0.005).reverse();

  return (
    <>
      <Encabezado titulo="Cuadre con ContaNet"
                  descripcion={<>Cada comprobante del usuario VENTAS01 en ContaNet contra el reporte de ventas virtuales (el que divide Lima y Provincia).
                    Desde el {fechaLarga(c.inicio)}, cuando empieza ContaNet en la base · {rango}.</>} />
      <Aviso titulo="Reglas del cuadre: ContaNet es el monto oficial; el reporte (llenado a mano) solo clasifica en Lima / Provincia">
        <b>Cuadra:</b> mismo comprobante y monto; el comprobante puede emitirse de 0 a 2 días después del pago (cuando no había stock).
        <b> Cuadra con otro número:</b> el número del reporte no existe en ContaNet, pero hay un comprobante del mismo cliente (DNI/RUC) y
        el mismo monto emitido hasta 10 días después: es la misma venta (la de ContaNet toma la clasificación del reporte).
        <b> Sobra en ContaNet:</b> venta o anulación que el reporte no trae (queda «Sin clasificar»). <b>Falta en ContaNet:</b> el reporte
        trae una venta sin comprobante (no se cuenta). Si el monto difiere, vale el de ContaNet.
      </Aviso>
      <Aviso tipo={Math.abs(dif) < 0.01 ? "bueno" : "alerta"}
             titulo={Math.abs(dif) < 0.01 ? `Cuadra: ContaNet y el reporte suman ${soles(cn)}`
               : `ContaNet ${soles(cn)} vs reporte ${soles(rep)}: ${dif > 0 ? "sobran" : "faltan"} ${soles(Math.abs(dif))} en ContaNet`}>
        {cuadra && <>{entero(cuadra.comprobantes)} comprobantes cuadran exacto ({soles(cuadra.contanet)}). </>}
        La diferencia sale solo de los comprobantes marcados abajo como «Sobra», «Falta» o «Monto distinto».
      </Aviso>

      <Tarjeta icono={Scale} titulo="Resumen del cuadre" subtitulo={rango}>
        <Tabla archivo="digital_cuadre_resumen.xlsx" hoja="Resumen" filas={resumen}
               columnas={[{ clave: "estado", titulo: "Estado", tipo: "texto" }, { clave: "comprobantes", titulo: "Comprobantes", tipo: "entero" },
                 { clave: "contanet", titulo: "ContaNet S/", tipo: "soles" }, { clave: "reporte", titulo: "Reporte virtual S/", tipo: "soles" },
                 { clave: "dif", titulo: "Diferencia S/", tipo: "soles" }]}
               total={{ estado: "TOTAL", comprobantes: c.resumen.reduce((a, x) => a + x.comprobantes, 0), contanet: cn, reporte: rep, dif }} />
      </Tarjeta>

      {c.detalle.length > 0 && (
        <Tarjeta icono={ListChecks} titulo="Comprobantes con observación"
                 subtitulo={`${entero(c.detalle.length)} comprobantes (incluye los que cuadran con otro número o con el comprobante emitido después) · diferencia total ${signo(dif)}`}>
          <Tabla archivo="digital_cuadre_detalle.xlsx" hoja="No cuadran" buscar
                 filas={c.detalle.map((d) => ({ ...d, fecha: fechaLarga(d.fecha_contanet ?? d.fecha_reporte ?? ""), dif: (d.contanet ?? 0) - (d.reporte ?? 0) }))}
                 columnas={[{ clave: "estado", titulo: "Estado", tipo: "texto" }, { clave: "fecha", titulo: "Fecha", tipo: "texto" },
                   { clave: "comprobante", titulo: "Comprobante", tipo: "texto" }, { clave: "tipo", titulo: "Tipo", tipo: "texto" },
                   { clave: "cliente", titulo: "Cliente", tipo: "texto" }, { clave: "medio", titulo: "Medio de pago", tipo: "texto" },
                   { clave: "contanet", titulo: "ContaNet S/", tipo: "soles" }, { clave: "reporte", titulo: "Reporte S/", tipo: "soles" },
                   { clave: "dif", titulo: "Diferencia S/", tipo: "soles" }, { clave: "motivo", titulo: "Motivo probable", tipo: "texto" }]}
                 total={{ estado: "TOTAL", contanet: c.detalle.reduce((a, d) => a + (d.contanet ?? 0), 0),
                          reporte: c.detalle.reduce((a, d) => a + (d.reporte ?? 0), 0), dif }} />
        </Tarjeta>
      )}

      {dias.length > 0 && (
        <Tarjeta icono={CalendarDays} titulo="Días con diferencia" subtitulo="Solo los días donde ContaNet y el reporte no suman lo mismo">
          <Tabla archivo="digital_cuadre_dias.xlsx" hoja="Días" filas={dias.map((d) => ({ ...d, fecha: fechaLarga(d.fecha) }))}
                 columnas={[{ clave: "fecha", titulo: "Día", tipo: "texto" }, { clave: "contanet", titulo: "ContaNet S/", tipo: "soles" },
                   { clave: "reporte", titulo: "Reporte S/", tipo: "soles" }, { clave: "dif", titulo: "Diferencia S/", tipo: "soles" },
                   { clave: "sobra", titulo: "Sobra en ContaNet S/", tipo: "soles" }, { clave: "falta", titulo: "Falta en ContaNet S/", tipo: "soles" }]}
                 total={{ fecha: "TOTAL", contanet: dias.reduce((a, d) => a + d.contanet, 0), reporte: dias.reduce((a, d) => a + d.reporte, 0),
                          dif: dias.reduce((a, d) => a + d.dif, 0), sobra: dias.reduce((a, d) => a + d.sobra, 0), falta: dias.reduce((a, d) => a + d.falta, 0) }} />
        </Tarjeta>
      )}
    </>
  );
}
