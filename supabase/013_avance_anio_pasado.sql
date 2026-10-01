-- Avance del día + el mismo día de la semana del año pasado (364 días antes), día completo.
-- Para el canal «tiendas» ese día sale del reporte interno (vía contanet_historia), que solo tiene el total del día
-- por tienda (no hay detalle por hora). Reemplaza contanet_avance() de 011. Es repetible.
create or replace function contanet_avance(p_canal text, p_fecha date default null) returns jsonb
language sql stable security invoker set search_path = public as $$
  with dia as (select coalesce(p_fecha, (select max(fecha) from contanet_venta where en_canal(p_canal, usuario, medio_pago))) d),
  v as (
    select v.fecha, v.fecha_hora, v.tienda, v.total, v.und,
           case when v.tipo_comprobante <> 'Nota de crédito' then v.comprobante end ticket
    from contanet_venta v, dia
    where en_canal(p_canal, v.usuario, v.medio_pago) and v.fecha in (dia.d, dia.d - 7)
  ),
  corte as (select max(fecha_hora)::time t from v, dia where fecha = dia.d),
  ly as (select h.tienda, sum(h.total) venta from contanet_historia(p_canal) h, dia where h.fecha = dia.d - 364 group by h.tienda)
  select jsonb_build_object(
    'fecha', (select d from dia),
    'corte', (select t from corte),
    'actualizado', (select max(cargada) from cargas_web where tipo = 'contanet' and estado = 'cargada' and hasta >= (select d from dia)),
    'horas', (select coalesce(jsonb_agg(x order by hora), '[]') from (
                select extract(hour from fecha_hora)::int hora,
                       coalesce(sum(total) filter (where fecha = d), 0) hoy, coalesce(sum(total) filter (where fecha = d - 7), 0) antes,
                       count(distinct ticket) filter (where fecha = d) tickets
                from v, dia group by 1) x),
    'tiendas', (select coalesce(jsonb_agg(x), '[]') from (
                select coalesce(a.tienda, ly.tienda) tienda, coalesce(a.hoy, 0) hoy, coalesce(a.antes_corte, 0) antes_corte,
                       coalesce(a.antes_dia, 0) antes_dia, coalesce(a.tickets, 0) tickets, coalesce(a.tickets_antes, 0) tickets_antes,
                       a.ultima, ly.venta anio_pasado
                from (select tienda, sum(total) filter (where fecha = d) hoy,
                             sum(total) filter (where fecha = d - 7 and fecha_hora::time <= (select t from corte)) antes_corte,
                             sum(total) filter (where fecha = d - 7) antes_dia,
                             count(distinct ticket) filter (where fecha = d) tickets,
                             count(distinct ticket) filter (where fecha = d - 7 and fecha_hora::time <= (select t from corte)) tickets_antes,
                             to_char(max(fecha_hora) filter (where fecha = d), 'HH24:MI') ultima
                      from v, dia group by tienda) a
                full join ly on ly.tienda = a.tienda) x),
    'anio_pasado_fecha', (select d - 364 from dia),
    'mes', (select coalesce(sum(total), 0) from contanet_venta, dia
            where en_canal(p_canal, usuario, medio_pago) and fecha between date_trunc('month', dia.d)::date and dia.d - 1),
    'dias_mes', (select count(distinct fecha) from contanet_venta, dia
                 where en_canal(p_canal, usuario, medio_pago) and fecha between date_trunc('month', dia.d)::date and dia.d - 1)
  );
$$;
grant execute on function contanet_avance(text, date) to authenticated;
