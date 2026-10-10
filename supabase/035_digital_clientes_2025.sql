-- Clientes del canal digital: la historia de 2025 (Excel «2025-Enero-Diciembre», consolidado con detalle mínimo y líneas de ajuste)
-- cuenta en ventas, unidades y productos, pero NO en clientes: su documento y nombre se dejan vacíos. 2026 queda igual.
-- Reemplaza contanet_historia de 025. Es repetible.

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
         d.sku, d.codigo, d.producto, coalesce(d.und, 0), coalesce(d.total, 0), d.comprobante, d.tipo_comprobante,
         d.medio_pago,
         -- 2025 viene de un consolidado con detalle mínimo (sin comprobantes ni clientes confiables, con líneas de ajuste): no aporta clientes.
         case when d.fecha >= date '2026-01-01' then coalesce(d.doc_cliente, '') else '' end,
         case when d.fecha >= date '2026-01-01' then case length(coalesce(d.doc_cliente, '')) when 11 then 'RUC' when 8 then 'DNI' else '' end else '' end,
         case when d.fecha >= date '2026-01-01' then d.cliente end, 'excel'
  from public.digital_ventas d
  where split_part(p_canal, '|', 1) like 'digital%' and d.fecha < (select min(fecha) from contanet_venta)
    and (split_part(p_canal, '|', 1) = 'digital' or (split_part(p_canal, '|', 1) = 'digital_lima') = (d.canal = 'LIMA'))
    and public.digital_pasa(p_canal, case d.canal when 'LIMA' then 'Lima' else 'Provincia' end, d.distrito, d.provincia, d.departamento);
$$;
