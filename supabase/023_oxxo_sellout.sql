-- OXXO: sell-out diario por tienda (reportes de OXXO: venta neta, unidades y stock por tienda y EAN), en las mismas tablas
-- que Supermercados Peruanos (cliente = 'OXXO'): locales (cadena = cluster A/B/C, zona = distrito), productos (sku = EAN),
-- venta_local_dia, venta_producto_dia, inventario_local. Carga: rpa/oxxo_excel.py. Es repetible.
--   - EAN de OXXO → SKU de Calderón (sku_equivalencia, sistema 'OXXO').
--   - Resumen ejecutivo: fuente 'oxxo' (venta neta que reporta OXXO, por cluster).
--   - sellout_conciliacion(cliente, tipo de retail): despachado (Excel Ventas RETAIL) vs vendido y stock en tiendas, para
--     cualquier cliente con sell-out; spsa_conciliacion() queda como atajo para Supermercados Peruanos.
insert into sku_equivalencia (sistema, codigo, sku) values
  ('OXXO', '733968436610', 'TMT1112'), ('OXXO', '733968436627', 'TMA1113'), ('OXXO', '733968436634', 'TK1110'),
  ('OXXO', '733968436658', 'TT1114'), ('OXXO', '733968436665', 'TA1115'), ('OXXO', '1170', 'TTN1121')
on conflict (sistema, codigo) do update set sku = excluded.sku;

create or replace function sellout_conciliacion(p_cliente text, p_tipo text) returns jsonb
language sql stable security invoker set search_path = public as $$
  with d as (  -- despachos de Calderón al cliente (Excel Ventas RETAIL)
    select coalesce(v.sku, v.codigo) sku, min(v.fecha) primero, max(v.fecha) ultimo, sum(v.cantidad) und, sum(v.monto) monto
    from retail_ventas v join retail_clientes c on c.cliente = v.cliente
    where c.tipo = p_tipo group by 1),
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
      where c.tipo = p_tipo) x)
  );
$$;
grant execute on function sellout_conciliacion(text, text) to authenticated;

create or replace function spsa_conciliacion() returns jsonb
language sql stable security invoker set search_path = public as $$
  select sellout_conciliacion('SPSA', 'Supermercados Peruanos');
$$;
grant execute on function spsa_conciliacion() to authenticated;

do $$
declare def text; nuevo text;
begin
  def := pg_get_functiondef('ejecutivo(text, date, date, jsonb)'::regprocedure);
  if position($x$p_fuente = 'oxxo'$x$ in def) = 0 then
    nuevo := replace(def, $x$    when p_fuente = 'retail' then$x$, $x$    when p_fuente = 'oxxo' then
      'select fecha, cadena dim, sku, producto, und, venta, null::text tienda, null::text tipo, null::text medio, null::text cliente,
              null::text status, cadena, zona, cod_local::text local
       from v_venta_local where cliente = ''OXXO'''
    when p_fuente = 'retail' then$x$);
    if nuevo = def then raise exception 'No pude agregar la fuente oxxo a ejecutivo()'; end if;
    execute nuevo;
  end if;
end $$;
