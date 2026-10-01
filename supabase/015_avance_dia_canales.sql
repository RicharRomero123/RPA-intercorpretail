-- Avance del día igual para Tiendas, Rappi y Canal digital: todos miran el MISMO día del reporte de ContaNet cargado
-- (antes cada canal tomaba su último día con venta, y Rappi o digital se quedaban en días anteriores).
-- Se puede pedir un día específico (p_fecha). Suma el detalle de ese día: productos, medios de pago y clientes.
-- Reemplaza contanet_avance() de 013. Es repetible.
create or replace function contanet_avance(p_canal text, p_fecha date default null) returns jsonb
language sql stable security invoker set search_path = public as $$
  with dia as (select coalesce(p_fecha, (select max(fecha) from contanet_venta)) d),
  v as (
    select v.fecha, v.fecha_hora, v.tienda, coalesce(v.sku, v.codigo) sku, coalesce(m.producto, v.producto) producto, v.total, v.und,
           coalesce(nullif(v.medio_pago, ''), 'Sin dato') medio, v.doc_cliente, v.cliente,
           case when v.tipo_comprobante <> 'Nota de crédito' then v.comprobante end ticket
    from contanet_venta v left join sku_maestro m on m.sku = v.sku, dia
    where en_canal(p_canal, v.usuario, v.medio_pago) and v.fecha in (dia.d, dia.d - 7)
  ),
  -- Hora de corte: la del reporte cargado (todos los canales), no la de la última venta de este canal.
  corte as (select max(fecha_hora)::time t from contanet_venta, dia where fecha = dia.d),
  ly as (select h.tienda, sum(h.total) filter (where h.fecha = dia.d - 364) venta,
                sum(h.total) filter (where h.fecha = (dia.d - interval '1 year')::date) venta_fecha
         from contanet_historia(p_canal) h, dia where h.fecha in (dia.d - 364, (dia.d - interval '1 year')::date) group by h.tienda)
  select jsonb_build_object(
    'fecha', (select d from dia),
    'corte', (select t from corte),
    'primera', (select min(fecha) from contanet_venta),
    'ultima_carga', (select max(fecha) from contanet_venta),
    'actualizado', (select max(cargada) from cargas_web where tipo = 'contanet' and estado = 'cargada' and hasta >= (select d from dia)),
    'horas', (select coalesce(jsonb_agg(x order by hora), '[]') from (
                select extract(hour from fecha_hora)::int hora,
                       coalesce(sum(total) filter (where fecha = d), 0) hoy, coalesce(sum(total) filter (where fecha = d - 7), 0) antes,
                       count(distinct ticket) filter (where fecha = d) tickets
                from v, dia group by 1) x),
    'tiendas', (select coalesce(jsonb_agg(x), '[]') from (
                select coalesce(a.tienda, ly.tienda) tienda, coalesce(a.hoy, 0) hoy, coalesce(a.antes_corte, 0) antes_corte,
                       coalesce(a.antes_dia, 0) antes_dia, coalesce(a.tickets, 0) tickets, coalesce(a.tickets_antes, 0) tickets_antes,
                       a.ultima, ly.venta anio_pasado, ly.venta_fecha anio_pasado_fecha_igual
                from (select tienda, sum(total) filter (where fecha = d) hoy,
                             sum(total) filter (where fecha = d - 7 and fecha_hora::time <= (select t from corte)) antes_corte,
                             sum(total) filter (where fecha = d - 7) antes_dia,
                             count(distinct ticket) filter (where fecha = d) tickets,
                             count(distinct ticket) filter (where fecha = d - 7 and fecha_hora::time <= (select t from corte)) tickets_antes,
                             to_char(max(fecha_hora) filter (where fecha = d), 'HH24:MI') ultima
                      from v, dia group by tienda) a
                full join ly on ly.tienda = a.tienda) x),
    'productos', (select coalesce(jsonb_agg(x order by hoy desc), '[]') from (
                select sku, min(producto) producto, coalesce(sum(total) filter (where fecha = d), 0) hoy,
                       coalesce(sum(und) filter (where fecha = d), 0) und,
                       coalesce(sum(total) filter (where fecha = d - 7 and fecha_hora::time <= (select t from corte)), 0) antes_corte
                from v, dia group by sku) x where hoy <> 0 or antes_corte <> 0),
    'medios', (select coalesce(jsonb_agg(x order by hoy desc), '[]') from (
                select medio, coalesce(sum(total) filter (where fecha = d), 0) hoy,
                       coalesce(sum(total) filter (where fecha = d - 7 and fecha_hora::time <= (select t from corte)), 0) antes_corte,
                       count(distinct ticket) filter (where fecha = d) tickets
                from v, dia group by medio) x),
    'clientes', (select coalesce(jsonb_agg(x order by venta desc), '[]') from (
                select doc_cliente doc, min(cliente) cliente, sum(total) venta, count(distinct ticket) tickets,
                       to_char(max(fecha_hora), 'HH24:MI') hora, string_agg(distinct tienda, ', ') tiendas
                from v, dia where fecha = d and doc_cliente <> '' group by doc_cliente order by sum(total) desc limit 15) x),
    'anio_pasado_fecha', (select d - 364 from dia),
    'anio_pasado_misma_fecha', (select (d - interval '1 year')::date from dia),
    'mes', (select coalesce(sum(total), 0) from contanet_venta, dia
            where en_canal(p_canal, usuario, medio_pago) and fecha between date_trunc('month', dia.d)::date and dia.d - 1),
    'dias_mes', (select count(distinct fecha) from contanet_venta, dia
                 where en_canal(p_canal, usuario, medio_pago) and fecha between date_trunc('month', dia.d)::date and dia.d - 1)
  );
$$;
grant execute on function contanet_avance(text, date) to authenticated;
