-- Cruce tienda × producto de ContaNet (Detalle de ventas → Por producto): qué producto deja más ingreso y cuál vende más
-- unidades en cada tienda. Mismos filtros y misma fuente que contanet_panel (antes de ContaNet, el reporte interno). Solo lectura.
-- Es repetible.
create or replace function contanet_producto_tienda(p_canal text, desde date, hasta date, p_tiendas text[] default null,
                                                    p_skus text[] default null, p_medios text[] default null, p_dias int[] default null)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]') from (
    select v.tienda, coalesce(v.sku, v.codigo) sku, min(coalesce(m.producto, v.producto)) producto, sum(v.und) und, sum(v.total) venta
    from contanet_historia(p_canal) v left join sku_maestro m on m.sku = v.sku
    where v.fecha between desde and hasta
      and (p_tiendas is null or v.tienda = any(p_tiendas)) and (p_skus is null or coalesce(v.sku, v.codigo) = any(p_skus))
      and (p_medios is null or v.medio_pago = any(p_medios))
      and (p_dias is null or (extract(isodow from v.fecha)::int - 1) = any(p_dias))
    group by 1, 2
  ) x;
$$;
grant execute on function contanet_producto_tienda(text, date, date, text[], text[], text[], int[]) to authenticated;
