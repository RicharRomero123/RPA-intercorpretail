-- Unidades y venta de cada SKU por mes y canal, para el ranking de productos del Resumen general.
-- Solo los canales que traen detalle por producto: TIENDAS (reporte interno de tiendas), LIMA y PROVINCIA (Excel de ventas
-- virtuales) y RETAIL (despachos del Excel Ventas RETAIL). Sus montos cuadran con consolidado_mensual. B2B y Rappi no
-- tienen detalle por SKU y no entran. Hasta p_corte (la fecha de corte del consolidado). Repetible.
create or replace function sku_mensual(p_anio int, p_corte date default null) returns table(mes int, canal text, sku text, producto text, und numeric, venta numeric)
language sql stable security invoker set search_path = public as $$
  with r as (select make_date(p_anio, 1, 1) ini, coalesce(p_corte, make_date(p_anio, 12, 31)) fin),
  v as (
    select fecha, 'TIENDAS' canal, sku, null::text producto, und, venta from tiendas_venta, r where fecha between r.ini and r.fin
    union all
    select fecha, canal, sku, producto, und, total from digital_ventas, r where fecha between r.ini and r.fin
    union all
    select fecha, 'RETAIL', sku, producto, cantidad, monto from retail_ventas, r where fecha between r.ini and r.fin)
  select extract(month from v.fecha)::int, v.canal, coalesce(v.sku, 'SIN SKU'),
         coalesce(max(m.producto), max(v.producto), 'Producto sin código'), sum(v.und), sum(v.venta)
  from v left join sku_maestro m on m.sku = v.sku
  group by 1, 2, 3;
$$;
grant execute on function sku_mensual(int, date) to authenticated;
