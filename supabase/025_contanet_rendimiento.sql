-- Rendimiento: contanet_filas() y contanet_historia() sin «set search_path» (tablas con public.) para que Postgres las
-- incruste en la consulta que las llama y filtre por fecha antes de recorrer (con ago+sep de ContaNet, el Avance del día
-- de Tiendas pasaba el límite de 8 s). Mismo resultado que 019. Es repetible.
create or replace function contanet_filas(p_canal text) returns setof public.contanet_venta
language sql stable security invoker as $$
  with c as (select split_part(p_canal, '|', 1) base, split_part(p_canal, '|', 2) <> '' geo)
  select v.id, v.fecha, v.fecha_hora, v.comprobante, v.tipo_comprobante, v.serie, v.numero, v.doc_cliente, v.tipo_doc_cliente, v.cliente,
         v.codigo, v.sku, v.producto, v.und, v.precio_unit, v.total, v.cond_pago, v.medio_pago, v.usuario,
         case c.base when 'digital' then coalesce(d.subcanal, 'Sin clasificar')
                     when 'digital_lima' then coalesce(nullif(d.distrito, ''), 'Sin distrito')
                     when 'digital_provincia' then coalesce(nullif(d.departamento, ''), 'Sin departamento')
                     else v.tienda end,
         v.vendedor, v.archivo, v.carga
  from c cross join public.contanet_venta v
  left join public.digital_canal d on c.base like 'digital%' and d.serie = v.serie
                           and d.numero = nullif(regexp_replace(v.numero, '\D', '', 'g'), '')::int
  where public.en_canal(case when c.base like 'digital%' then 'digital' else c.base end, v.usuario, v.medio_pago)
    and (c.base <> 'digital_lima' or d.canal = 'LIMA')
    and (c.base <> 'digital_provincia' or d.canal = 'PROVINCIA')
    and (not c.geo or (d.serie is not null and public.digital_pasa(p_canal, d.subcanal, d.distrito, d.provincia, d.departamento)));
$$;
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

-- contanet_avance: las comparaciones contra la fecha del día pasan a valores fijos ((select d from dia)) para que la base use
-- el índice por fecha en vez de recorrer toda la tabla.
do $$
declare def text; nuevo text;
begin
  def := pg_get_functiondef('contanet_avance(text, date)'::regprocedure);
  nuevo := replace(def, 'and v.fecha in (dia.d, dia.d - 7)', 'and v.fecha in ((select d from dia), (select d from dia) - 7)');
  nuevo := replace(nuevo, 'from contanet_venta, dia where fecha = dia.d)', 'from contanet_venta where fecha = (select d from dia))');
  nuevo := replace(nuevo, 'h, dia where h.fecha in (dia.d - 364, (dia.d - interval ''1 year'')::date)',
                          'h, dia where h.fecha in ((select d from dia) - 364, ((select d from dia) - interval ''1 year'')::date)');
  nuevo := replace(nuevo, 'and fecha between date_trunc(''month'', dia.d)::date and dia.d - 1',
                          'and fecha between date_trunc(''month'', (select d from dia))::date and (select d from dia) - 1');
  if nuevo = def then raise exception 'contanet_avance: no encontré lo que había que cambiar'; end if;
  execute nuevo;
end $$;
