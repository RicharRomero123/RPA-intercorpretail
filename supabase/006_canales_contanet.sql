-- Canales desde ContaNet. Del mismo «Reporte detallado» salen:
--   tiendas : las 7 tiendas (todo menos el usuario VENTAS01)
--   digital : Canal digital = usuario VENTAS01 (vendedor VND0012, series B008/F008)
--   rappi   : ventas de las tiendas cobradas con condición de pago RAPPI
-- Reemplaza las funciones de 005 que usaban «Ventas oficina». Es repetible.

drop function if exists contanet_maestros();
drop function if exists contanet_panel(date, date, text[], text[], text[], int[]);

create or replace function en_canal(p_canal text, p_usuario text, p_medio text) returns boolean language sql immutable as $$
  select case p_canal
    when 'tiendas' then p_usuario is distinct from 'VENTAS01'
    when 'digital' then p_usuario = 'VENTAS01'
    when 'rappi'   then p_medio = 'Rappi'
    else false end;
$$;

create or replace function contanet_maestros(p_canal text) returns jsonb
language sql stable security invoker set search_path = public as $$
  with v as (select * from contanet_venta where en_canal(p_canal, usuario, medio_pago))
  select jsonb_build_object(
    'desde', (select min(fecha) from contanet_venta), 'hasta', (select max(fecha) from contanet_venta),
    'tiendas', (select coalesce(jsonb_agg(t order by t), '[]') from (select distinct tienda t from v) x),
    'medios', (select coalesce(jsonb_agg(t order by t), '[]') from (select distinct medio_pago t from v where medio_pago <> '') x),
    'productos', (select coalesce(jsonb_agg(jsonb_build_object('sku', sku, 'producto', producto) order by producto), '[]')
                  from (select distinct coalesce(v.sku, v.codigo) sku, coalesce(m.producto, v.producto) producto
                        from v left join sku_maestro m on m.sku = v.sku) x)
  );
$$;

create or replace function contanet_panel(p_canal text, desde date, hasta date, p_tiendas text[] default null, p_skus text[] default null,
                                          p_medios text[] default null, p_dias int[] default null) returns jsonb
language sql stable security invoker set search_path = public as $$
  with v as (
    select v.fecha, v.fecha_hora, v.tienda, coalesce(v.sku, v.codigo) sku, coalesce(m.producto, v.producto) producto, v.und, v.total venta,
           v.comprobante, v.tipo_comprobante, v.medio_pago, v.doc_cliente, v.tipo_doc_cliente, v.cliente,
           case when v.tipo_comprobante <> 'Nota de crédito' then v.comprobante end ticket
    from contanet_venta v left join sku_maestro m on m.sku = v.sku
    where v.fecha between desde and hasta and en_canal(p_canal, v.usuario, v.medio_pago)
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

create or replace function tiendas_conciliacion(desde date, hasta date) returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(x order by fecha, tienda), '[]') from (
    select coalesce(i.fecha, c.fecha) fecha, coalesce(i.tienda, c.tienda) tienda,
           coalesce(i.und, 0) und_interno, coalesce(i.venta, 0) venta_interno, coalesce(c.und, 0) und_contanet, coalesce(c.venta, 0) venta_contanet
    from (select fecha, tienda, sum(und) und, sum(venta) venta from tiendas_venta where fecha between desde and hasta group by 1, 2) i
    full join (select fecha, tienda, sum(und) und, sum(total) venta from contanet_venta
               where fecha between desde and hasta and en_canal('tiendas', usuario, medio_pago) group by 1, 2) c
      on c.fecha = i.fecha and c.tienda = i.tienda
  ) x;
$$;

create or replace function tiendas_cobertura() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'interno_desde', (select min(fecha) from tiendas_venta), 'interno_hasta', (select max(fecha) from tiendas_venta),
    'contanet_desde', (select min(fecha) from contanet_venta), 'contanet_hasta', (select max(fecha) from contanet_venta));
$$;

grant execute on function contanet_maestros(text) to authenticated;
grant execute on function contanet_panel(text, date, date, text[], text[], text[], int[]) to authenticated;
