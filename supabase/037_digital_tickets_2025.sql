-- Tickets del canal digital en 2025: esas líneas no tienen comprobante (el cargador les pone SN25-n, uno por línea) y la web contaba
-- cada línea como un ticket. Ahora el ticket de una línea sin comprobante es el pedido: mismo cliente, mismo día. Las líneas con
-- boleta o factura real siguen contando por su comprobante. Reemplaza contanet_historia de 036. Es repetible.

create or replace function contanet_historia(p_canal text)
returns table (fecha date, fecha_hora timestamp, tienda text, sku text, codigo text, producto text, und numeric, total numeric,
               comprobante text, tipo_comprobante text, medio_pago text, doc_cliente text, tipo_doc_cliente text, cliente text, origen text)
language sql stable security invoker as $$
  select v.fecha, v.fecha_hora, v.tienda, v.sku, v.codigo, v.producto, v.und, v.total, v.comprobante, v.tipo_comprobante,
         v.medio_pago, v.doc_cliente, v.tipo_doc_cliente, v.cliente, 'contanet'
  from public.contanet_filas(p_canal) v
  union all
  select t.fecha, null, t.tienda, t.sku, t.codigo, null, coalesce(t.und, 0), coalesce(t.venta, 0), null, null,
         null, '', '', null, 'interno'
  from public.tiendas_venta t
  where p_canal = 'tiendas' and t.fecha < (select min(fecha) from contanet_venta)
  union all
  select d.fecha, null,
         case split_part(p_canal, '|', 1) when 'digital' then case d.canal when 'LIMA' then 'Lima' else 'Provincia' end
                      when 'digital_lima' then coalesce(nullif(d.distrito, ''), 'Sin distrito')
                      else coalesce(nullif(d.departamento, ''), 'Sin departamento') end,
         d.sku, d.codigo, d.producto, coalesce(d.und, 0), coalesce(d.total, 0),
         -- Líneas sin comprobante (2025: serie SN/SN25, una por línea): el «ticket» es el pedido = mismo cliente el mismo día.
         case when d.serie like 'SN%' then 'Pedido ' || d.fecha || ' ' || coalesce(nullif(d.doc_cliente, ''), coalesce(d.cliente, d.comprobante))
              else d.comprobante end,
         d.tipo_comprobante,
         d.medio_pago, coalesce(d.doc_cliente, ''), case length(coalesce(d.doc_cliente, '')) when 11 then 'RUC' when 8 then 'DNI' else '' end,
         d.cliente, 'excel'
  from public.digital_ventas d
  where split_part(p_canal, '|', 1) like 'digital%' and d.fecha < (select min(fecha) from contanet_venta)
    and (split_part(p_canal, '|', 1) = 'digital' or (split_part(p_canal, '|', 1) = 'digital_lima') = (d.canal = 'LIMA'))
    and public.digital_pasa(p_canal, case d.canal when 'LIMA' then 'Lima' else 'Provincia' end, d.distrito, d.provincia, d.departamento);
$$;
