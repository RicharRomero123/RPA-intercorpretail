-- Resumen ejecutivo: una sola consulta para todos los canales. Devuelve la venta por mes, «cliente» y SKU, más el mismo
-- Nota: reemplazada por 010_ejecutivo_filtros.sql (el resumen ejecutivo ahora recibe el periodo y los filtros de la página).
-- mes del año anterior cortado al mismo día (para comparar un mes en curso contra el mismo tramo del año pasado).
-- «Cliente» (dim) según el canal:
--   retail              cliente retail (SPSA como un solo cliente + cada razón social del Excel de ventas retail)
--   spsa                cadena de Supermercados Peruanos (venta a costo = ingreso Calderón)
--   retail:<tipo>       razón social de los clientes de ese tipo
--   tiendas             tienda (reporte interno)
--   contanet_tiendas    tienda (ContaNet, sin el usuario VENTAS01)
--   rappi               tienda (ContaNet, cobrado con RAPPI)
--   digital             cliente del comprobante (ContaNet, usuario VENTAS01)
-- Es repetible.

create or replace function ejecutivo(p_fuente text, desde date, hasta date, p_corte date) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  base text; r jsonb;
  contanet text := 'select v.fecha, %s dim, coalesce(v.sku, v.codigo) sku, coalesce(m.producto, v.producto) producto, v.und, v.total venta
                    from contanet_venta v left join sku_maestro m on m.sku = v.sku where en_canal(%L, v.usuario, v.medio_pago)';
begin
  base := case
    when p_fuente = 'spsa' then
      'select fecha, cadena dim, sku, producto, und, costo venta from v_venta_local where cliente = ''SPSA'''
    when p_fuente = 'retail' then
      'select fecha, ''Supermercados Peruanos (SPSA)'' dim, sku, producto, und, costo venta from v_venta_local where cliente = ''SPSA''
       union all
       select v.fecha, v.cliente, coalesce(v.sku, v.codigo), coalesce(m.producto, v.producto, v.codigo), v.cantidad, v.monto
       from retail_ventas v left join sku_maestro m on m.sku = v.sku'
    when p_fuente like 'retail:%' then format(
      'select v.fecha, v.cliente dim, coalesce(v.sku, v.codigo) sku, coalesce(m.producto, v.producto, v.codigo) producto, v.cantidad und, v.monto venta
       from retail_ventas v join retail_clientes c on c.cliente = v.cliente left join sku_maestro m on m.sku = v.sku where c.tipo = %L',
      substr(p_fuente, 8))
    when p_fuente = 'tiendas' then
      'select v.fecha, v.tienda dim, coalesce(v.sku, v.codigo) sku, coalesce(m.producto, v.sku, v.codigo) producto,
              coalesce(v.und, 0) und, coalesce(v.venta, 0) venta
       from tiendas_venta v left join sku_maestro m on m.sku = v.sku'
    when p_fuente = 'contanet_tiendas' then format(contanet, 'v.tienda', 'tiendas')
    when p_fuente = 'rappi' then format(contanet, 'v.tienda', 'rappi')
    when p_fuente = 'digital' then format(contanet, 'case when v.doc_cliente = '''' then ''PÚBLICO GENERAL'' else v.cliente end', 'digital')
  end;
  if base is null then raise exception 'Fuente desconocida: %', p_fuente; end if;

  execute format($q$
    with b as (%s)
    select jsonb_build_object(
      'meses', (select coalesce(jsonb_agg(x), '[]') from (
                  select to_char(fecha, 'YYYY-MM') mes, dim, sku, min(producto) producto, sum(und) und, sum(venta) venta
                  from b where fecha between $1 and $2 group by 1, 2, 3) x),
      'ly', (select coalesce(jsonb_agg(x), '[]') from (
                  select dim, sku, min(producto) producto, sum(und) und, sum(venta) venta from b
                  where fecha between (date_trunc('month', $3) - interval '1 year')::date and ($3 - interval '1 year')::date
                  group by 1, 2) x))
  $q$, base) into r using desde, hasta, p_corte;
  return r;
end;
$$;
grant execute on function ejecutivo(text, date, date, date) to authenticated;
