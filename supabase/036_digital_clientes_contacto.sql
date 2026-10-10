-- Clientes del canal digital con su detalle del reporte virtual (pedido del usuario, 2026-10-10):
--  1. Los clientes de 2025 vuelven a contar (se deshace 035): contanet_historia igual que en 025.
--  2. digital_ventas guarda también teléfono, dirección, agencia de envío y «Cliente de» (los trae el Excel cuando los tiene).
--  3. digital_compras_cliente: las compras de un cliente en el reporte virtual (fecha, producto, ubicación, contacto), para la ficha
--     del cliente cuando no tiene comprobantes en ContaNet (2025 y lo anterior a agosto 2026).
-- Es repetible.

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
         d.medio_pago, coalesce(d.doc_cliente, ''), case length(coalesce(d.doc_cliente, '')) when 11 then 'RUC' when 8 then 'DNI' else '' end,
         d.cliente, 'excel'
  from public.digital_ventas d
  where split_part(p_canal, '|', 1) like 'digital%' and d.fecha < (select min(fecha) from contanet_venta)
    and (split_part(p_canal, '|', 1) = 'digital' or (split_part(p_canal, '|', 1) = 'digital_lima') = (d.canal = 'LIMA'))
    and public.digital_pasa(p_canal, case d.canal when 'LIMA' then 'Lima' else 'Provincia' end, d.distrito, d.provincia, d.departamento);
$$;

alter table digital_ventas add column if not exists telefono text;
alter table digital_ventas add column if not exists direccion text;
alter table digital_ventas add column if not exists agencia text;
alter table digital_ventas add column if not exists cliente_de text;

do $$
declare def text; nuevo text;
begin
  def := pg_get_functiondef('confirmar_carga(uuid)'::regprocedure);
  if position('r.telefono' in def) = 0 then
    nuevo := replace(def, 'departamento, salio_de, observacion, archivo, carga)', 'departamento, salio_de, observacion, telefono, direccion, agencia, cliente_de, archivo, carga)');
    nuevo := replace(nuevo, 'r.salio_de, r.observacion, c.archivo, c.id', 'r.salio_de, r.observacion, r.telefono, r.direccion, r.agencia, r.cliente_de, c.archivo, c.id');
    nuevo := replace(nuevo, 'departamento text, salio_de text, observacion text)', 'departamento text, salio_de text, observacion text, telefono text, direccion text, agencia text, cliente_de text)');
    if position('r.telefono' in nuevo) = 0 or position('cliente_de text)' in nuevo) = 0 then
      raise exception 'No pude extender confirmar_carga con los datos de contacto';
    end if;
    execute nuevo;
  end if;
end $$;

create or replace function digital_compras_cliente(p_canal text, p_doc text) returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(x order by x.fecha desc, x.comprobante), '[]') from (
    select d.fecha, d.comprobante, d.tipo_comprobante, d.cliente, d.sku, coalesce(m.producto, d.producto) producto, d.und, d.precio_unit, d.total,
           d.medio_pago, case d.canal when 'LIMA' then 'Lima delivery' else 'Provincia' end canal, d.distrito, d.provincia, d.departamento,
           d.salio_de, d.agencia, d.telefono, d.direccion, d.cliente_de, d.observacion
    from digital_ventas d left join sku_maestro m on m.sku = d.sku
    where ltrim(coalesce(d.doc_cliente, ''), '0') = ltrim(p_doc, '0') and p_doc <> ''
      and (split_part(p_canal, '|', 1) = 'digital' or (split_part(p_canal, '|', 1) = 'digital_lima') = (d.canal = 'LIMA'))) x;
$$;
grant execute on function digital_compras_cliente(text, text) to authenticated;
