-- Historia para las vistas de ContaNet: para el canal «tiendas», las fechas anteriores al primer día cargado de ContaNet
-- se completan con el reporte interno de tiendas (Excel de los jefes / Power BI), que tiene historia desde 2025.
-- Así «Este mes vs el año anterior» compara contra la venta real de 2025. Del reporte interno solo hay venta y unidades
-- por tienda, día y producto: no hay comprobantes (tickets), horas, medios de pago ni clientes.
-- Reemplaza contanet_panel() de 006 y ejecutivo() de 010. Es repetible.

create or replace function contanet_historia(p_canal text)
returns table (fecha date, fecha_hora timestamp, tienda text, sku text, codigo text, producto text, und numeric, total numeric,
               comprobante text, tipo_comprobante text, medio_pago text, doc_cliente text, tipo_doc_cliente text, cliente text, origen text)
language sql stable security invoker set search_path = public as $$
  select v.fecha, v.fecha_hora, v.tienda, v.sku, v.codigo, v.producto, v.und, v.total, v.comprobante, v.tipo_comprobante,
         v.medio_pago, v.doc_cliente, v.tipo_doc_cliente, v.cliente, 'contanet'
  from contanet_venta v where en_canal(p_canal, v.usuario, v.medio_pago)
  union all
  select t.fecha, null, t.tienda, t.sku, t.codigo, null, coalesce(t.und, 0), coalesce(t.venta, 0), null, null,
         null, '', '', null, 'interno'
  from tiendas_venta t
  where p_canal = 'tiendas' and t.fecha < (select min(fecha) from contanet_venta);
$$;
grant execute on function contanet_historia(text) to authenticated;

create or replace function contanet_panel(p_canal text, desde date, hasta date, p_tiendas text[] default null, p_skus text[] default null,
                                          p_medios text[] default null, p_dias int[] default null) returns jsonb
language sql stable security invoker set search_path = public as $$
  with v as (
    select v.fecha, v.fecha_hora, v.tienda, coalesce(v.sku, v.codigo) sku, coalesce(m.producto, v.producto) producto, v.und, v.total venta,
           v.comprobante, v.tipo_comprobante, v.medio_pago, v.doc_cliente, v.tipo_doc_cliente, v.cliente,
           case when v.tipo_comprobante <> 'Nota de crédito' then v.comprobante end ticket
    from contanet_historia(p_canal) v left join sku_maestro m on m.sku = v.sku
    where v.fecha between desde and hasta
      and (p_tiendas is null or v.tienda = any(p_tiendas)) and (p_skus is null or coalesce(v.sku, v.codigo) = any(p_skus))
      and (p_medios is null or v.medio_pago = any(p_medios))
      and (p_dias is null or (extract(isodow from v.fecha)::int - 1) = any(p_dias))
  )
  select jsonb_build_object(
    'dias', (select coalesce(jsonb_agg(x order by fecha), '[]') from
             (select fecha, sum(und) und, sum(venta) venta, count(distinct ticket) tickets from v group by fecha) x),
    'tiendas', (select coalesce(jsonb_agg(x), '[]') from
                (select tienda, sum(und) und, sum(venta) venta, count(distinct ticket) tickets, count(distinct fecha) dias from v group by tienda) x),
    'productos', (select coalesce(jsonb_agg(x), '[]') from
                  (select sku, min(producto) producto, sum(und) und, sum(venta) venta, count(distinct ticket) tickets from v group by sku) x),
    'horas', (select coalesce(jsonb_agg(x order by hora), '[]') from
              (select extract(hour from fecha_hora)::int hora, sum(und) und, sum(venta) venta, count(distinct ticket) tickets from v group by 1) x),
    'medios', (select coalesce(jsonb_agg(x), '[]') from
               (select coalesce(nullif(medio_pago, ''), 'Sin dato') medio, sum(und) und, sum(venta) venta, count(distinct ticket) tickets from v group by 1) x),
    'comprobantes', (select coalesce(jsonb_agg(x), '[]') from
                     (select tipo_comprobante tipo, sum(und) und, sum(venta) venta, count(distinct comprobante) documentos from v group by 1) x),
    'clientes', (select coalesce(jsonb_agg(x), '[]') from
                 (select doc_cliente doc, tipo_doc_cliente tipo_doc, min(cliente) cliente, sum(und) und, sum(venta) venta,
                         count(distinct ticket) tickets, max(fecha) ultima
                  from v where doc_cliente <> '' group by doc_cliente, tipo_doc_cliente order by sum(venta) desc limit 200) x)
  );
$$;

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
      'select fecha, ''Supermercados Peruanos (SPSA)'' dim, sku, producto, und, costo venta, null::text tienda, null::text tipo, null::text medio,
              ''Supermercados Peruanos (SPSA)'' cliente, null::text status, cadena, zona, cod_local::text local
       from v_venta_local where cliente = ''SPSA''
       union all
       select v.fecha, v.cliente, coalesce(v.sku, v.codigo), coalesce(m.producto, v.producto, v.codigo), v.cantidad, v.monto,
              null, null, null, v.cliente, v.status, null, null, null
       from retail_ventas v left join sku_maestro m on m.sku = v.sku'
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
