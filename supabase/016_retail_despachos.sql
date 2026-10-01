-- Retail = despachos de Calderón a sus clientes retail (Excel «Ventas RETAIL»), que es lo que suma el consolidado en RETAIL
-- (cuadra al céntimo mes a mes). La venta al público de SPSA (bot del portal Intercorp) ya no se suma al resumen retail:
-- se ve aparte en Retail · SPSA, porque sumar ambas contaba dos veces a Supermercados Peruanos (lo despachado y lo vendido).
-- Reemplaza retail_resumen() y retail_limites() de 004 y ejecutivo() de 012. Es repetible.
create or replace function retail_resumen(desde date, hasta date) returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(x order by fecha, componente), '[]') from (
    select v.fecha, c.tipo componente, t.slug, sum(v.cantidad) und, sum(v.monto) venta
    from retail_ventas v join retail_clientes c on c.cliente = v.cliente join retail_tipos t on t.tipo = c.tipo
    where v.fecha between desde and hasta group by v.fecha, c.tipo, t.slug
  ) x;
$$;
grant execute on function retail_resumen(date, date) to authenticated;

create or replace function retail_limites(p_tipo text default null) returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object('desde', min(v.fecha), 'hasta', max(v.fecha))
  from retail_ventas v join retail_clientes c on c.cliente = v.cliente where p_tipo is null or c.tipo = p_tipo;
$$;
grant execute on function retail_limites(text) to authenticated;

create or replace function ejecutivo(p_fuente text, desde date, hasta date, p_filtros jsonb default '{}') returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  base text; r jsonb;
  inicio date := (date_trunc('month', hasta) - interval '11 months')::date;
  -- Columnas comunes: fecha, dim, sku, producto, und, venta y las columnas de filtro (null si no aplican a la fuente).
  contanet text := 'select v.fecha, %s dim, coalesce(v.sku, v.codigo) sku, coalesce(m.producto, v.producto) producto, v.und, v.total venta,
                           v.tienda, null::text tipo, v.medio_pago medio, v.cliente, null::text status, null::text cadena, null::text zona, null::text local
                    from contanet_historia(%L) v left join sku_maestro m on m.sku = v.sku';
begin
  base := case
    when p_fuente = 'spsa' then
      'select fecha, cadena dim, sku, producto, und, costo venta, null::text tienda, null::text tipo, null::text medio, null::text cliente,
              null::text status, cadena, zona, cod_local::text local
       from v_venta_local where cliente = ''SPSA'''
    when p_fuente = 'retail' then
      'select v.fecha, v.cliente dim, coalesce(v.sku, v.codigo) sku, coalesce(m.producto, v.producto, v.codigo) producto, v.cantidad und, v.monto venta,
              null::text tienda, c.tipo, null::text medio, v.cliente, v.status, null::text cadena, null::text zona, null::text local
       from retail_ventas v join retail_clientes c on c.cliente = v.cliente left join sku_maestro m on m.sku = v.sku'
    when p_fuente like 'retail:%' then format(
      'select v.fecha, v.cliente dim, coalesce(v.sku, v.codigo) sku, coalesce(m.producto, v.producto, v.codigo) producto, v.cantidad und, v.monto venta,
              null::text tienda, null::text tipo, null::text medio, v.cliente, v.status, null::text cadena, null::text zona, null::text local
       from retail_ventas v join retail_clientes c on c.cliente = v.cliente left join sku_maestro m on m.sku = v.sku where c.tipo = %L',
      substr(p_fuente, 8))
    when p_fuente = 'tiendas' then
      'select v.fecha, v.tienda dim, coalesce(v.sku, v.codigo) sku, coalesce(m.producto, v.sku, v.codigo) producto,
              coalesce(v.und, 0) und, coalesce(v.venta, 0) venta, v.tienda, v.tipo_precio tipo, null::text medio, null::text cliente,
              null::text status, null::text cadena, null::text zona, null::text local
       from tiendas_venta v left join sku_maestro m on m.sku = v.sku'
    when p_fuente = 'contanet_tiendas' then format(contanet, 'v.tienda', 'tiendas')
    when p_fuente = 'rappi' then format(contanet, 'v.tienda', 'rappi')
    when p_fuente = 'digital' then format(contanet, 'case when v.doc_cliente = '''' then ''PÚBLICO GENERAL'' else v.cliente end', 'digital')
  end;
  if base is null then raise exception 'Fuente desconocida: %', p_fuente; end if;

  execute format($q$
    with b as (%s),
    f as (
      select * from b
      where (not ($1 ? 'tienda')  or tienda  = any(array(select jsonb_array_elements_text($1->'tienda'))))
        and (not ($1 ? 'sku')     or sku     = any(array(select jsonb_array_elements_text($1->'sku'))))
        and (not ($1 ? 'tipo')    or tipo    = any(array(select jsonb_array_elements_text($1->'tipo'))))
        and (not ($1 ? 'medio')   or medio   = any(array(select jsonb_array_elements_text($1->'medio'))))
        and (not ($1 ? 'cliente') or cliente = any(array(select jsonb_array_elements_text($1->'cliente'))))
        and (not ($1 ? 'status')  or status  = any(array(select jsonb_array_elements_text($1->'status'))))
        and (not ($1 ? 'cadena')  or cadena  = any(array(select jsonb_array_elements_text($1->'cadena'))))
        and (not ($1 ? 'zona')    or zona    = any(array(select jsonb_array_elements_text($1->'zona'))))
        and (not ($1 ? 'local')   or local   = any(array(select jsonb_array_elements_text($1->'local'))))
        and (not ($1 ? 'dias')    or (extract(isodow from fecha)::int - 1) = any(array(select (jsonb_array_elements_text($1->'dias'))::int)))
    )
    select jsonb_build_object(
      'actual', (select coalesce(jsonb_agg(x), '[]') from (
                  select dim, sku, min(producto) producto, sum(und) und, sum(venta) venta from f where fecha between $2 and $3 group by 1, 2) x),
      'anterior', (select coalesce(jsonb_agg(x), '[]') from (
                  select dim, sku, min(producto) producto, sum(und) und, sum(venta) venta from f
                  where fecha between ($2 - interval '1 year')::date and ($3 - interval '1 year')::date group by 1, 2) x),
      'meses', (select coalesce(jsonb_agg(x), '[]') from (
                  select to_char(fecha, 'YYYY-MM') mes, sku, min(producto) producto, sum(und) und, sum(venta) venta
                  from f where fecha between $4 and $3 group by 1, 2) x),
      'meses_ly', (select coalesce(jsonb_agg(x), '[]') from (
                  select to_char(fecha + interval '1 year', 'YYYY-MM') mes, sku, min(producto) producto, sum(und) und, sum(venta) venta
                  from f where fecha between ($4 - interval '1 year')::date and ($3 - interval '1 year')::date group by 1, 2) x))
  $q$, base) into r using p_filtros, desde, hasta, inicio;
  return r;
end;
$$;
grant execute on function ejecutivo(text, date, date, jsonb) to authenticated;
