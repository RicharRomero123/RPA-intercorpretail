-- Clientes identificados (DNI/RUC) de ContaNet: en qué tiendas compró cada uno y el detalle de sus compras.
-- Es repetible.

-- Venta de los 200 clientes principales, por tienda (para el gráfico «en qué tiendas compró»).
create or replace function contanet_clientes_tiendas(p_canal text, desde date, hasta date, p_tiendas text[] default null,
                                                     p_skus text[] default null, p_medios text[] default null, p_dias int[] default null)
returns jsonb language sql stable security invoker set search_path = public as $$
  with v as (
    select v.doc_cliente doc, v.tienda, v.total venta, v.und
    from contanet_venta v
    where v.fecha between desde and hasta and en_canal(p_canal, v.usuario, v.medio_pago) and v.doc_cliente <> ''
      and (p_tiendas is null or v.tienda = any(p_tiendas)) and (p_skus is null or coalesce(v.sku, v.codigo) = any(p_skus))
      and (p_medios is null or v.medio_pago = any(p_medios))
      and (p_dias is null or (extract(isodow from v.fecha)::int - 1) = any(p_dias))
  ),
  top as (select doc from v group by doc order by sum(venta) desc limit 200)
  select coalesce(jsonb_agg(x), '[]') from (
    select doc, tienda, sum(venta) venta, sum(und) und from v where doc in (select doc from top) group by doc, tienda
  ) x;
$$;

-- Todas las líneas de comprobante de un cliente en el periodo (se pide al desplegar su fila).
create or replace function contanet_compras_cliente(p_canal text, desde date, hasta date, p_doc text, p_tiendas text[] default null,
                                                    p_skus text[] default null, p_medios text[] default null, p_dias int[] default null)
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(x order by fecha_hora desc, comprobante), '[]') from (
    select v.fecha_hora, v.tienda, v.comprobante, v.tipo_comprobante, coalesce(v.sku, v.codigo) sku, coalesce(m.producto, v.producto) producto,
           v.und, v.precio_unit, v.total, v.medio_pago, v.vendedor
    from contanet_venta v left join sku_maestro m on m.sku = v.sku
    where v.fecha between desde and hasta and en_canal(p_canal, v.usuario, v.medio_pago) and v.doc_cliente = p_doc
      and (p_tiendas is null or v.tienda = any(p_tiendas)) and (p_skus is null or coalesce(v.sku, v.codigo) = any(p_skus))
      and (p_medios is null or v.medio_pago = any(p_medios))
      and (p_dias is null or (extract(isodow from v.fecha)::int - 1) = any(p_dias))
  ) x;
$$;

grant execute on function contanet_clientes_tiendas(text, date, date, text[], text[], text[], int[]) to authenticated;
grant execute on function contanet_compras_cliente(text, date, date, text, text[], text[], text[], int[]) to authenticated;

-- Historial completo de un cliente (todo lo cargado de ContaNet, sin filtro de fechas): una fila por día de compra.
create or replace function contanet_historial_cliente(p_canal text, p_doc text) returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'dias', (select coalesce(jsonb_agg(x order by fecha), '[]') from (
              select fecha, sum(total) venta, sum(und) und,
                     count(distinct comprobante) filter (where tipo_comprobante <> 'Nota de crédito') comprobantes
              from contanet_venta where doc_cliente = p_doc and en_canal(p_canal, usuario, medio_pago) group by fecha) x),
    'hasta', (select max(fecha) from contanet_venta));
$$;
grant execute on function contanet_historial_cliente(text, text) to authenticated;
