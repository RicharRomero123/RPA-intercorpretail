-- Filtros por canal, distrito, provincia y departamento en las vistas del Canal digital, y venta por zona.
-- El filtro viaja dentro del nombre del canal: 'digital_provincia|{"dep":["Áncash"],"prov":["Huaraz"]}'
-- (claves: subc = Lima/Provincia, dist, prov, dep). Así todas las funciones que ya leen contanet_filas() / contanet_historia()
-- (panel, resumen ejecutivo, avance, clientes) aplican el filtro sin cambiar sus parámetros. Reemplaza las de 018. Es repetible.

create or replace view digital_canal with (security_invoker = true) as
  select distinct on (serie, numero) serie, numero, canal,
         case canal when 'LIMA' then 'Lima' else 'Provincia' end subcanal, distrito, departamento, provincia
  from digital_ventas order by serie, numero, total desc nulls last;

-- ¿La zona (subcanal, distrito, provincia, departamento) pasa el filtro geográfico del canal?
create or replace function digital_pasa(p_canal text, p_subc text, p_dist text, p_prov text, p_dep text) returns boolean
language sql immutable as $$
  with g as (select nullif(split_part(p_canal, '|', 2), '')::jsonb j)
  select g.j is null or (
      (g.j->'subc' is null or p_subc = any(array(select jsonb_array_elements_text(g.j->'subc'))))
  and (g.j->'dist' is null or coalesce(p_dist, 'Sin distrito') = any(array(select jsonb_array_elements_text(g.j->'dist'))))
  and (g.j->'prov' is null or coalesce(p_prov, 'Sin provincia') = any(array(select jsonb_array_elements_text(g.j->'prov'))))
  and (g.j->'dep' is null or coalesce(p_dep, 'Sin departamento') = any(array(select jsonb_array_elements_text(g.j->'dep')))))
  from g;
$$;

create or replace function contanet_filas(p_canal text) returns setof contanet_venta
language sql stable security invoker set search_path = public as $$
  with c as (select split_part(p_canal, '|', 1) base, split_part(p_canal, '|', 2) <> '' geo)
  select v.id, v.fecha, v.fecha_hora, v.comprobante, v.tipo_comprobante, v.serie, v.numero, v.doc_cliente, v.tipo_doc_cliente, v.cliente,
         v.codigo, v.sku, v.producto, v.und, v.precio_unit, v.total, v.cond_pago, v.medio_pago, v.usuario,
         case c.base when 'digital' then coalesce(d.subcanal, 'Sin clasificar')
                     when 'digital_lima' then coalesce(nullif(d.distrito, ''), 'Sin distrito')
                     when 'digital_provincia' then coalesce(nullif(d.departamento, ''), 'Sin departamento')
                     else v.tienda end,
         v.vendedor, v.archivo, v.carga
  from c cross join contanet_venta v
  left join digital_canal d on c.base like 'digital%' and d.serie = v.serie
                           and d.numero = nullif(regexp_replace(v.numero, '\D', '', 'g'), '')::int
  where en_canal(case when c.base like 'digital%' then 'digital' else c.base end, v.usuario, v.medio_pago)
    and (c.base <> 'digital_lima' or d.canal = 'LIMA')
    and (c.base <> 'digital_provincia' or d.canal = 'PROVINCIA')
    and (not c.geo or (d.serie is not null and digital_pasa(p_canal, d.subcanal, d.distrito, d.provincia, d.departamento)));
$$;
grant execute on function contanet_filas(text) to authenticated;

create or replace function contanet_historia(p_canal text)
returns table (fecha date, fecha_hora timestamp, tienda text, sku text, codigo text, producto text, und numeric, total numeric,
               comprobante text, tipo_comprobante text, medio_pago text, doc_cliente text, tipo_doc_cliente text, cliente text, origen text)
language sql stable security invoker set search_path = public as $$
  select v.fecha, v.fecha_hora, v.tienda, v.sku, v.codigo, v.producto, v.und, v.total, v.comprobante, v.tipo_comprobante,
         v.medio_pago, v.doc_cliente, v.tipo_doc_cliente, v.cliente, 'contanet'
  from contanet_filas(p_canal) v
  union all
  select t.fecha, null, t.tienda, t.sku, t.codigo, null, coalesce(t.und, 0), coalesce(t.venta, 0), null, null,
         null, '', '', null, 'interno'
  from tiendas_venta t
  where p_canal = 'tiendas' and t.fecha < (select min(fecha) from contanet_venta)
  union all
  select d.fecha, null,
         case split_part(p_canal, '|', 1) when 'digital' then case d.canal when 'LIMA' then 'Lima' else 'Provincia' end
                      when 'digital_lima' then coalesce(nullif(d.distrito, ''), 'Sin distrito')
                      else coalesce(nullif(d.departamento, ''), 'Sin departamento') end,
         d.sku, d.codigo, d.producto, coalesce(d.und, 0), coalesce(d.total, 0), d.comprobante, d.tipo_comprobante,
         d.medio_pago, coalesce(d.doc_cliente, ''), case length(coalesce(d.doc_cliente, '')) when 11 then 'RUC' when 8 then 'DNI' else '' end,
         d.cliente, 'excel'
  from digital_ventas d
  where split_part(p_canal, '|', 1) like 'digital%' and d.fecha < (select min(fecha) from contanet_venta)
    and (split_part(p_canal, '|', 1) = 'digital' or (split_part(p_canal, '|', 1) = 'digital_lima') = (d.canal = 'LIMA'))
    and digital_pasa(p_canal, case d.canal when 'LIMA' then 'Lima' else 'Provincia' end, d.distrito, d.provincia, d.departamento);
$$;
grant execute on function contanet_historia(text) to authenticated;

-- Opciones de los filtros geográficos de un canal digital (los valores que existen en el reporte de ventas virtuales).
create or replace function digital_opciones(p_canal text) returns jsonb
language sql stable security invoker set search_path = public as $$
  with d as (select case canal when 'LIMA' then 'Lima' else 'Provincia' end subc, coalesce(nullif(distrito, ''), 'Sin distrito') dist,
                    coalesce(nullif(provincia, ''), 'Sin provincia') prov, coalesce(nullif(departamento, ''), 'Sin departamento') dep
             from digital_ventas
             where split_part(p_canal, '|', 1) = 'digital' or (split_part(p_canal, '|', 1) = 'digital_lima') = (canal = 'LIMA'))
  select jsonb_build_object(
    'subc', (select coalesce(jsonb_agg(x order by x), '[]') from (select distinct subc x from d) t),
    'dist', (select coalesce(jsonb_agg(x order by x), '[]') from (select distinct dist x from d) t),
    'prov', (select coalesce(jsonb_agg(x order by x), '[]') from (select distinct prov x from d) t),
    'dep',  (select coalesce(jsonb_agg(x order by x), '[]') from (select distinct dep x from d) t));
$$;
grant execute on function digital_opciones(text) to authenticated;

-- Venta por zona (subcanal, departamento, provincia, distrito) en un periodo, con los filtros de la página.
-- Desde que hay ContaNet: comprobantes de ContaNet con la zona del reporte virtual; antes: el reporte virtual.
create or replace function digital_zonas(p_canal text, desde date, hasta date, p_skus text[] default null, p_medios text[] default null,
                                         p_dias int[] default null) returns jsonb
language sql stable security invoker set search_path = public as $$
  with base as (select split_part(p_canal, '|', 1) b, (select min(fecha) from contanet_venta) inicio),
  v as (
    select v.fecha, d.subcanal, d.departamento, d.provincia, d.distrito, coalesce(v.sku, v.codigo) sku, v.medio_pago, v.comprobante,
           v.doc_cliente, v.total, v.und
    from contanet_filas(p_canal) v
    join digital_canal d on d.serie = v.serie and d.numero = nullif(regexp_replace(v.numero, '\D', '', 'g'), '')::int
    union all
    select d.fecha, case d.canal when 'LIMA' then 'Lima' else 'Provincia' end, d.departamento, d.provincia, d.distrito,
           coalesce(d.sku, d.codigo), d.medio_pago, d.comprobante, d.doc_cliente, d.total, d.und
    from digital_ventas d, base
    where d.fecha < base.inicio and (base.b = 'digital' or (base.b = 'digital_lima') = (d.canal = 'LIMA'))
      and digital_pasa(p_canal, case d.canal when 'LIMA' then 'Lima' else 'Provincia' end, d.distrito, d.provincia, d.departamento)
  )
  select coalesce(jsonb_agg(x order by venta desc), '[]') from (
    select subcanal, coalesce(nullif(departamento, ''), 'Sin departamento') departamento, coalesce(nullif(provincia, ''), 'Sin provincia') provincia,
           coalesce(nullif(distrito, ''), 'Sin distrito') distrito, sum(total) venta, sum(und) und, count(distinct comprobante) pedidos,
           count(distinct nullif(doc_cliente, '')) clientes
    from v
    where fecha between desde and hasta and (p_skus is null or sku = any(p_skus)) and (p_medios is null or medio_pago = any(p_medios))
      and (p_dias is null or (extract(isodow from fecha)::int - 1) = any(p_dias))
    group by 1, 2, 3, 4) x;
$$;
grant execute on function digital_zonas(text, date, date, text[], text[], int[]) to authenticated;

-- Resumen ejecutivo: las fuentes del canal digital aceptan el filtro geográfico en el nombre.
do $$
declare def text; nuevo text;
begin
  select pg_get_functiondef('ejecutivo(text, date, date, jsonb)'::regprocedure) into def;
  nuevo := replace(def,
    $x$when p_fuente = 'digital' then format(contanet, 'case when v.doc_cliente = '''' then ''PÚBLICO GENERAL'' else v.cliente end', 'digital')
    when p_fuente in ('digital_lima', 'digital_provincia') then$x$,
    $x$when split_part(p_fuente, '|', 1) in ('digital', 'digital_lima', 'digital_provincia') then$x$);
  if nuevo = def and position('split_part(p_fuente' in def) = 0 then raise exception 'No encontré las fuentes digitales en ejecutivo()'; end if;
  if nuevo <> def then execute nuevo; end if;
end $$;
