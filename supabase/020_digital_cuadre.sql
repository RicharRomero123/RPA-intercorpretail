-- Cuadre del canal digital: ContaNet (usuario VENTAS01, sin Rappi) contra el reporte de ventas virtuales (Lima + Provincia),
-- comprobante por comprobante (serie + número). Solo desde que hay ContaNet cargado. Es repetible.
--   ambos             mismo comprobante en los dos (y si el monto o la fecha difieren, se marca)
--   solo ContaNet     sobra: está en ContaNet y el reporte no lo trae (notas de crédito, boletas anuladas, días aún no reportados)
--   solo reporte      falta: el reporte lo trae y ContaNet no (re-emitido con otro número, o aún no registrado)
create or replace function digital_cuadre(desde date, hasta date) returns jsonb
language sql stable security invoker set search_path = public as $$
  with inicio as (select min(fecha) f from contanet_venta),
  cn as (
    select v.serie, nullif(regexp_replace(v.numero, '\D', '', 'g'), '')::int numero, min(v.comprobante) comprobante, min(v.fecha) fecha,
           min(v.tipo_comprobante) tipo, min(v.cliente) cliente, string_agg(distinct v.medio_pago, ', ') medio, sum(v.total) monto
    from contanet_venta v
    where en_canal('digital', v.usuario, v.medio_pago) and v.fecha between desde and hasta
    group by 1, 2),
  rep as (
    select d.serie, d.numero, min(d.comprobante) comprobante, min(d.fecha) fecha, min(d.tipo_comprobante) tipo, min(d.cliente) cliente,
           string_agg(distinct d.medio_pago, ', ') medio, sum(d.total) monto, min(d.canal) canal,
           min(coalesce(d.departamento, d.distrito)) zona
    from digital_ventas d, inicio
    where d.fecha between greatest(desde, inicio.f) and hasta
    group by 1, 2),
  j0 as (
    select coalesce(c.serie, r.serie) serie, coalesce(c.numero, r.numero) numero,
           coalesce(c.comprobante, r.comprobante) comprobante, coalesce(c.tipo, r.tipo) tipo, coalesce(c.cliente, r.cliente) cliente,
           c.fecha fecha_contanet, r.fecha fecha_reporte, c.monto contanet, r.monto reporte, coalesce(c.medio, r.medio) medio,
           case r.canal when 'LIMA' then 'Lima' when 'PROVINCIA' then 'Provincia' end canal, r.zona,
           case when c.serie is null then 'Falta en ContaNet'
                when r.serie is null then 'Sobra en ContaNet'
                when abs(c.monto - r.monto) > 0.005 then 'Monto distinto'
                when c.fecha <> r.fecha then 'Fecha distinta'
                else 'Cuadra' end estado
    from cn c full join rep r on r.serie = c.serie and r.numero = c.numero),
  j as (
    select j0.*,
      case
        when estado = 'Sobra en ContaNet' and tipo = 'Nota de crédito' then 'Nota de crédito: anula una venta'
        when estado = 'Sobra en ContaNet' and fecha_contanet > (select max(fecha) from digital_ventas) then 'El reporte virtual aún no llega a esta fecha'
        when estado = 'Sobra en ContaNet' and exists (select 1 from cn n where n.tipo = 'Nota de crédito' and abs(n.monto + j0.contanet) < 0.005)
          then 'Probablemente anulada con una nota de crédito del mismo monto'
        when estado = 'Sobra en ContaNet' then 'No está en el reporte virtual: revisar'
        when estado = 'Falta en ContaNet' then 'No está en ContaNet: revisar (¿re-emitido con otro número?)'
        when estado = 'Monto distinto' then 'El monto difiere entre ContaNet y el reporte'
        when estado = 'Fecha distinta' then 'Registrado en otro día'
      end motivo
    from j0)
  select jsonb_build_object(
    'inicio', (select f from inicio),
    'resumen', (select coalesce(jsonb_agg(x order by orden), '[]') from (
        select estado, count(*) comprobantes, coalesce(sum(contanet), 0) contanet, coalesce(sum(reporte), 0) reporte,
               case estado when 'Cuadra' then 1 when 'Fecha distinta' then 2 when 'Monto distinto' then 3 when 'Sobra en ContaNet' then 4 else 5 end orden
        from j group by estado) x),
    'por_dia', (select coalesce(jsonb_agg(x order by fecha), '[]') from (
        select coalesce(fecha_contanet, fecha_reporte) fecha, coalesce(sum(contanet), 0) contanet, coalesce(sum(reporte), 0) reporte,
               coalesce(sum(contanet) filter (where estado = 'Sobra en ContaNet'), 0) sobra,
               coalesce(sum(reporte) filter (where estado = 'Falta en ContaNet'), 0) falta,
               coalesce(sum(contanet - reporte) filter (where estado = 'Monto distinto'), 0) dif_monto
        from j group by 1) x),
    'detalle', (select coalesce(jsonb_agg(x order by estado, coalesce(fecha_contanet, fecha_reporte), comprobante), '[]') from (
        select * from j where estado <> 'Cuadra') x)
  );
$$;
grant execute on function digital_cuadre(date, date) to authenticated;
