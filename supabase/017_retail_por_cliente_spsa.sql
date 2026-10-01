-- 1. Tipos de retail = un cliente cada uno (OXXO, GSI, Tottus, PedidosYa, Vendomatica). Supermercados Peruanos tiene su tipo,
--    pero en el menú se ve dentro de «Supermercados · SPSA» (la vista del bot), no como tipo aparte.
-- 2. Equivalencia de los códigos de SPSA (portal Intercorp) con los SKU de Calderón.
-- 3. spsa_conciliacion(): despachado a SPSA (Excel Ventas RETAIL) vs vendido al público (portal) vs stock en tiendas (portal).
-- Es repetible.
insert into retail_tipos (tipo, slug) values
  ('Supermercados Peruanos', 'supermercados-peruanos'), ('Tottus', 'tottus'), ('OXXO', 'oxxo'), ('GSI', 'gsi'),
  ('PedidosYa', 'pedidosya'), ('Vendomatica', 'vendomatica')
on conflict (tipo) do nothing;
update retail_clientes set tipo = case cliente
  when 'SUPERMERCADOS PERUANOS' then 'Supermercados Peruanos'
  when 'TOTTUS' then 'Tottus'
  when 'OXXO (CADENA DE COMERCIO PERU S.A.C' then 'OXXO'
  when 'GSI' then 'GSI'
  when 'PEDIDOS YA MARKET (DELIVERY HERO DMART PERU S.A.C.)' then 'PedidosYa'
  when 'VENDOMATICA' then 'Vendomatica'
  else tipo end;
delete from retail_tipos t where not exists (select 1 from retail_clientes c where c.tipo = t.tipo);

insert into sku_equivalencia (sistema, codigo, sku) values ('SPSA', '20638630', 'TMT1112'), ('SPSA', '20638633', 'TK1110')
on conflict do nothing;

create or replace function spsa_conciliacion() returns jsonb
language sql stable security invoker set search_path = public as $$
  with d as (  -- despachos de Calderón a Supermercados Peruanos
    select coalesce(v.sku, v.codigo) sku, min(v.fecha) primero, max(v.fecha) ultimo, sum(v.cantidad) und, sum(v.monto) monto
    from retail_ventas v join retail_clientes c on c.cliente = v.cliente
    where c.tipo = 'Supermercados Peruanos' group by 1),
  inicio as (select min(primero) f from d),
  s as (  -- vendido al público desde el primer despacho (portal)
    select coalesce(e.sku, p.sku) sku, sum(p.und) und, sum(p.costo) costo, sum(p.venta) venta
    from venta_producto_dia p left join sku_equivalencia e on e.sistema = 'SPSA' and e.codigo = p.sku, inicio
    where p.cliente = 'SPSA' and p.fecha >= inicio.f group by 1),
  fi as (select max(fecha_inv) f from inventario_local where cliente = 'SPSA'),
  i as (  -- stock en las tiendas de SPSA, última foto del portal
    select coalesce(e.sku, x.sku) sku, sum(x.inv_und) und, count(distinct x.cod_local) filter (where x.inv_und > 0) locales
    from inventario_local x left join sku_equivalencia e on e.sistema = 'SPSA' and e.codigo = x.sku, fi
    where x.cliente = 'SPSA' and x.fecha_inv = fi.f group by 1)
  select jsonb_build_object(
    'inicio', (select f from inicio),
    'hasta_venta', (select max(fecha) from venta_producto_dia where cliente = 'SPSA'),
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
      where c.tipo = 'Supermercados Peruanos') x)
  );
$$;
grant execute on function spsa_conciliacion() to authenticated;
