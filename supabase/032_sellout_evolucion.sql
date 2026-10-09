-- Despachado vs vendido con evolución: agrega a sellout_conciliacion la venta y el stock por producto y día ('ventas_dia', 'stock_dia').
-- Con eso la web arma el % vendido de lo despachado día a día y proyecta en cuántos días se acaba el stock. Reemplaza la de 024. Es repetible.
create or replace function sellout_conciliacion(p_cliente text, p_tipo text, p_desde date default null) returns jsonb
language sql stable security invoker set search_path = public as $$
  with d as (  -- despachos de Calderón al cliente (Excel Ventas RETAIL)
    select coalesce(v.sku, v.codigo) sku, min(v.fecha) primero, max(v.fecha) ultimo, sum(v.cantidad) und, sum(v.monto) monto
    from retail_ventas v join retail_clientes c on c.cliente = v.cliente
    where c.tipo = p_tipo and (p_desde is null or v.fecha >= p_desde) group by 1),
  inicio as (select min(primero) f from d),
  ini_venta as (select min(fecha) f from venta_producto_dia where cliente = p_cliente),
  s as (  -- vendido al público desde el primer despacho (o desde que hay sell-out)
    select coalesce(e.sku, p.sku) sku, sum(p.und) und, sum(p.costo) costo, sum(p.venta) venta
    from venta_producto_dia p left join sku_equivalencia e on e.sistema = p_cliente and e.codigo = p.sku, inicio
    where p.cliente = p_cliente and p.fecha >= inicio.f group by 1),
  fi as (select max(fecha_inv) f from inventario_local where cliente = p_cliente),
  i as (  -- stock en las tiendas, última foto
    select coalesce(e.sku, x.sku) sku, sum(x.inv_und) und, count(distinct x.cod_local) filter (where x.inv_und > 0) locales
    from inventario_local x left join sku_equivalencia e on e.sistema = p_cliente and e.codigo = x.sku, fi
    where x.cliente = p_cliente and x.fecha_inv = fi.f group by 1)
  select jsonb_build_object(
    'inicio', (select f from inicio),
    'temporada', p_desde,
    'inicio_venta', (select f from ini_venta),
    'hasta_venta', (select max(fecha) from venta_producto_dia where cliente = p_cliente),
    'fecha_stock', (select f from fi),
    'productos', (select coalesce(jsonb_agg(x order by despachado desc nulls last), '[]') from (
      select coalesce(d.sku, s.sku, i.sku) sku, coalesce(m.producto, coalesce(d.sku, s.sku, i.sku)) producto,
             d.primero, d.ultimo, coalesce(d.und, 0) despachado, coalesce(d.monto, 0) monto,
             coalesce(s.und, 0) vendido, coalesce(s.costo, 0) costo, coalesce(s.venta, 0) venta,
             coalesce(i.und, 0) stock, i.locales
      from d full join s on s.sku = d.sku full join i on i.sku = coalesce(d.sku, s.sku)
      left join sku_maestro m on m.sku = coalesce(d.sku, s.sku, i.sku)) x),
    'despachos', (select coalesce(jsonb_agg(x order by fecha), '[]') from (
      select v.fecha, coalesce(v.sku, v.codigo) sku, coalesce(m.producto, v.producto) producto, v.cantidad und, v.precio_unitario precio,
             v.monto, v.status
      from retail_ventas v join retail_clientes c on c.cliente = v.cliente left join sku_maestro m on m.sku = v.sku
      where c.tipo = p_tipo and (p_desde is null or v.fecha >= p_desde)) x),
    -- Evolución: venta y stock de cada producto por día, para el % vendido día a día y la proyección de cuándo se acaba.
    'ventas_dia', (select coalesce(jsonb_agg(x order by fecha), '[]') from (
      select p.fecha, coalesce(e.sku, p.sku) sku, sum(p.und) und
      from venta_producto_dia p left join sku_equivalencia e on e.sistema = p_cliente and e.codigo = p.sku, inicio
      where p.cliente = p_cliente and p.fecha >= inicio.f group by 1, 2) x),
    'stock_dia', (select coalesce(jsonb_agg(x order by fecha), '[]') from (
      select x.fecha_inv fecha, coalesce(e.sku, x.sku) sku, sum(x.inv_und) und
      from inventario_local x left join sku_equivalencia e on e.sistema = p_cliente and e.codigo = x.sku, inicio
      where x.cliente = p_cliente and x.fecha_inv >= inicio.f group by 1, 2) x)
  );
$$;
grant execute on function sellout_conciliacion(text, text, date) to authenticated;
