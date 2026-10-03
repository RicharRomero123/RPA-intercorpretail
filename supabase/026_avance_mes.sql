-- Avance del mes de un canal de ContaNet: venta de cada día del mes (hasta el día pedido, por defecto el último cargado), y
-- del año pasado la misma fecha calendario (para comparar el acumulado) y el mismo día de la semana (364 días antes, para
-- proyectar los días que faltan). Por tienda: lo acumulado, el año pasado al mismo corte y el mes completo del año pasado.
-- Usa contanet_historia (en tiendas, antes de ContaNet, el reporte interno). Admite el filtro por zona del canal digital. Repetible.
create or replace function contanet_avance_mes(p_canal text, p_fecha date default null) returns jsonb
language sql stable security invoker set search_path = public as $$
  with d as (select coalesce(p_fecha, (select max(fecha) from contanet_venta)) d),
  r as (select d, date_trunc('month', d)::date ini, (date_trunc('month', d) + interval '1 month - 1 day')::date fin from d),
  -- Historia del canal en tres tramos (este mes, mismo mes del año pasado, 364 días antes), con fechas fijas para usar el índice.
  h as (
    select x.fecha, x.tienda, x.total from contanet_historia(p_canal) x
    where x.fecha between (select ini from r) and (select d from r)
    union all
    select x.fecha, x.tienda, x.total from contanet_historia(p_canal) x
    where x.fecha between ((select ini from r) - interval '1 year')::date and ((select fin from r) - interval '1 year')::date
    union all
    select x.fecha, x.tienda, x.total from contanet_historia(p_canal) x
    where x.fecha between (select ini from r) - 364 and (select fin from r) - 364
      and x.fecha not between ((select ini from r) - interval '1 year')::date and ((select fin from r) - interval '1 year')::date),
  hd as (select fecha, sum(total) v from h group by fecha),
  dias as (select g::date dia from r, generate_series(r.ini, r.fin, interval '1 day') g)
  select jsonb_build_object(
    'fecha', (select d from r), 'inicio', (select ini from r), 'fin', (select fin from r),
    'actualizado', (select max(cargada) from cargas_web where tipo = 'contanet' and estado = 'cargada'),
    'corte', (select max(fecha_hora)::time from contanet_venta, r where fecha = r.d),
    'dias', (select coalesce(jsonb_agg(x order by dia), '[]') from (
      select dias.dia,
             case when dias.dia <= r.d then coalesce((select v from hd where hd.fecha = dias.dia), 0) end venta,
             (select v from hd where hd.fecha = (dias.dia - interval '1 year')::date) ly_fecha,
             (select v from hd where hd.fecha = dias.dia - 364) ly_sem
      from dias, r) x),
    'tiendas', (select coalesce(jsonb_agg(x order by mes desc), '[]') from (
      select coalesce(a.tienda, b.tienda) tienda, coalesce(a.mes, 0) mes, b.ly_corte, b.ly_mes
      from (select tienda, sum(total) mes from h, r where h.fecha between r.ini and r.d group by tienda) a
      full join (select tienda,
                        sum(total) filter (where h.fecha <= (r.d - interval '1 year')::date) ly_corte,
                        sum(total) ly_mes
                 from h, r where h.fecha between (r.ini - interval '1 year')::date and (r.fin - interval '1 year')::date group by tienda) b
        on b.tienda = a.tienda) x)
  );
$$;
grant execute on function contanet_avance_mes(text, date) to authenticated;
