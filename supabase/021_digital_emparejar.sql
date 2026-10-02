-- Reglas de cuadre del canal digital (ContaNet = monto oficial; el reporte virtual, llenado a mano, solo clasifica):
--  1. Mismo comprobante (serie + número): cuadra. El reporte anota el día del PAGO y ContaNet el día en que se emite el
--     comprobante: lo normal es el mismo día; si no había stock, hasta 2 días después (se acepta). Más días: revisar.
--  2. Comprobante del reporte que no existe en ContaNet y uno de ContaNet que no está en el reporte, con el MISMO cliente
--     (DNI/RUC) y el MISMO monto, emitido en ContaNet entre 0 y 10 días después: es la misma venta con otro número
--     (pago adelantado, comprobante emitido después). La venta de ContaNet toma la clasificación (Lima/Provincia, zona) del reporte.
-- digital_canal pasa a estar en la numeración de ContaNet (directo + emparejado). Reemplaza la vista de 019 y digital_cuadre de 020.

create or replace view digital_canal with (security_invoker = true) as
  with xl as (
    select serie, numero, min(fecha) fecha, ltrim(coalesce(min(doc_cliente), ''), '0') doc, sum(total) monto,
           min(canal) canal, min(distrito) distrito, min(departamento) departamento, min(provincia) provincia
    from digital_ventas group by serie, numero),
  cn as (
    select serie, nullif(regexp_replace(numero, '\D', '', 'g'), '')::int numero, min(fecha) fecha,
           ltrim(coalesce(min(doc_cliente), ''), '0') doc, sum(total) monto
    from contanet_venta where usuario = 'VENTAS01' group by 1, 2),
  directo as (
    select x.serie, x.numero, x.canal, x.distrito, x.departamento, x.provincia, 'mismo número' metodo, x.serie ref_serie, x.numero ref_numero
    from xl x),
  pareja as (
    select c.serie, c.numero, x.canal, x.distrito, x.departamento, x.provincia, 'mismo cliente y monto' metodo, x.serie ref_serie, x.numero ref_numero,
           row_number() over (partition by c.serie, c.numero order by c.fecha - x.fecha, x.numero) r1,
           row_number() over (partition by x.serie, x.numero order by c.fecha - x.fecha, c.numero) r2
    from cn c join xl x on x.doc = c.doc and x.doc <> '' and abs(x.monto - c.monto) < 0.005 and c.fecha - x.fecha between 0 and 10
    where not exists (select 1 from xl x2 where x2.serie = c.serie and x2.numero = c.numero)
      and not exists (select 1 from cn c2 where c2.serie = x.serie and c2.numero = x.numero))
  select serie, numero, canal, case canal when 'LIMA' then 'Lima' else 'Provincia' end subcanal, distrito, departamento, provincia,
         metodo, ref_serie, ref_numero
  from (select serie, numero, canal, distrito, departamento, provincia, metodo, ref_serie, ref_numero from directo
        union all
        select serie, numero, canal, distrito, departamento, provincia, metodo, ref_serie, ref_numero from pareja where r1 = 1 and r2 = 1) t;
grant select on digital_canal to authenticated;

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
           string_agg(distinct d.medio_pago, ', ') medio, sum(d.total) monto, min(d.canal) canal
    from digital_ventas d, inicio
    where d.fecha between greatest(desde, inicio.f) and hasta
    group by 1, 2),
  par as (select * from digital_canal where metodo = 'mismo cliente y monto'),
  j0 as (
    select coalesce(c.serie, r.serie) serie, coalesce(c.numero, r.numero) numero,
           coalesce(c.comprobante, r.comprobante) comprobante, coalesce(c.tipo, r.tipo) tipo, coalesce(c.cliente, r.cliente) cliente,
           c.fecha fecha_contanet, r.fecha fecha_reporte, c.monto contanet, r.monto reporte, coalesce(c.medio, r.medio) medio,
           case r.canal when 'LIMA' then 'Lima' when 'PROVINCIA' then 'Provincia' end canal,
           pc.ref_serie || '-' || pc.ref_numero par_reporte, pr.serie || '-' || pr.numero par_contanet,
           (select x.fecha from rep x where x.serie = pc.ref_serie and x.numero = pc.ref_numero) fecha_par_reporte,
           (select x.fecha from cn x where x.serie = pr.serie and x.numero = pr.numero) fecha_par_contanet
    from cn c full join rep r on r.serie = c.serie and r.numero = c.numero
    left join par pc on c.serie is not null and r.serie is null and pc.serie = c.serie and pc.numero = c.numero
    left join par pr on r.serie is not null and c.serie is null and pr.ref_serie = r.serie and pr.ref_numero = r.numero),
  j as (
    select j0.*,
      case
        when contanet is not null and reporte is not null and abs(contanet - reporte) > 0.005 then 'Monto distinto'
        when contanet is not null and reporte is not null and fecha_contanet - fecha_reporte between 0 and 2 then 'Cuadra'
        when contanet is not null and reporte is not null then 'Fecha fuera de regla'
        when par_reporte is not null or par_contanet is not null then 'Cuadra con otro número'
        when reporte is null then 'Sobra en ContaNet'
        else 'Falta en ContaNet' end estado,
      case
        when contanet is not null and reporte is not null and abs(contanet - reporte) > 0.005 then 'El monto difiere: vale el de ContaNet'
        when contanet is not null and reporte is not null and fecha_contanet - fecha_reporte between 1 and 2
          then 'Comprobante emitido ' || (fecha_contanet - fecha_reporte) || ' día(s) después del pago (dentro de la regla)'
        when contanet is not null and reporte is not null and fecha_contanet <> fecha_reporte
          then 'Fecha: ContaNet ' || to_char(fecha_contanet, 'DD/MM') || ' vs reporte ' || to_char(fecha_reporte, 'DD/MM') || ' (fuera de la regla de 0 a 2 días)'
        when par_reporte is not null then 'En el reporte figura como ' || par_reporte || ' el ' || to_char(fecha_par_reporte, 'DD/MM')
          || ' (mismo cliente y monto); comprobante emitido ' || (fecha_contanet - fecha_par_reporte) || ' día(s) después del pago'
        when par_contanet is not null then 'En ContaNet se emitió como ' || par_contanet || ' el ' || to_char(fecha_par_contanet, 'DD/MM')
          || ' (mismo cliente y monto): corregir el número en el reporte'
        when reporte is null and tipo = 'Nota de crédito' then 'Nota de crédito: anula una venta; el reporte no registra anulaciones'
        when reporte is null and fecha_contanet > (select max(fecha) from digital_ventas) then 'El reporte virtual aún no llega a esta fecha'
        when reporte is null and exists (select 1 from cn n where n.tipo = 'Nota de crédito' and abs(n.monto + contanet) < 0.005)
          then 'Probablemente anulada con una nota de crédito del mismo monto'
        when reporte is null then 'No está en el reporte virtual: agregarla (queda Sin clasificar)'
        else 'No existe en ContaNet: el reporte trae una venta sin comprobante (no se cuenta)' end motivo
    from j0)
  select jsonb_build_object(
    'inicio', (select f from inicio),
    'resumen', (select coalesce(jsonb_agg(x order by orden), '[]') from (
        select estado, count(*) comprobantes, coalesce(sum(contanet), 0) contanet, coalesce(sum(reporte), 0) reporte,
               case estado when 'Cuadra' then 1 when 'Cuadra con otro número' then 2 when 'Fecha fuera de regla' then 3
                           when 'Monto distinto' then 4 when 'Sobra en ContaNet' then 5 else 6 end orden
        from j group by estado) x),
    'por_dia', (select coalesce(jsonb_agg(x order by fecha), '[]') from (
        select coalesce(fecha_contanet, fecha_reporte) fecha, coalesce(sum(contanet), 0) contanet, coalesce(sum(reporte), 0) reporte,
               coalesce(sum(contanet) filter (where estado = 'Sobra en ContaNet'), 0) sobra,
               coalesce(sum(reporte) filter (where estado = 'Falta en ContaNet'), 0) falta,
               coalesce(sum(contanet - reporte) filter (where estado = 'Monto distinto'), 0) dif_monto
        from j group by 1) x),
    'detalle', (select coalesce(jsonb_agg(x order by estado, coalesce(fecha_contanet, fecha_reporte), comprobante), '[]') from (
        select * from j where estado <> 'Cuadra' or motivo is not null) x)
  );
$$;
grant execute on function digital_cuadre(date, date) to authenticated;
