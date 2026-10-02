-- Canal digital (usuario VENTAS01 de ContaNet) dividido en Lima (delivery) y Provincia.
-- Fuente de la división: el Excel «REPORTE DE VENTAS … PROVINCIA - DELIVERY» (hoja 2026), que trae por comprobante el canal
-- (DELIVERY = Lima, PROVINCIA), el distrito y el departamento. Se cruzó comprobante por comprobante con ContaNet (ago y sep 2026:
-- mismos montos) y DELIVERY = canal LIMA del consolidado, PROVINCIA = canal PROVINCIA.
--   digital_ventas     líneas del Excel (también dan la historia antes de que ContaNet esté cargado)
--   digital_canal      canal, distrito y departamento de cada comprobante (serie + número)
--   contanet_filas()   las filas de ContaNet de un canal; para el canal digital, «tienda» pasa a ser Lima / Provincia
--                      (digital), el distrito (digital_lima) o el departamento (digital_provincia)
-- Canales nuevos: 'digital_lima' y 'digital_provincia'. Es repetible.

create table if not exists digital_ventas (
  id            bigserial primary key,
  fecha         date not null,
  comprobante   text not null,          -- normalizado: SERIE-NÚMERO (B008-4837)
  serie         text not null,
  numero        integer not null,
  tipo_comprobante text,
  cliente       text,
  doc_cliente   text,
  codigo        text,
  sku           text,
  producto      text,
  und           numeric(14,3),
  precio_unit   numeric(14,4),
  total         numeric(14,4),
  medio_pago    text,
  canal         text not null check (canal in ('LIMA', 'PROVINCIA')),
  distrito      text,
  provincia     text,
  departamento  text,
  salio_de      text,
  observacion   text,
  archivo       text,
  cargado       timestamptz not null default now()
);
create index if not exists digital_ventas_comp on digital_ventas (serie, numero);
create index if not exists digital_ventas_fecha on digital_ventas (fecha);
alter table digital_ventas enable row level security;
drop policy if exists digital_ventas_lectura on digital_ventas;
create policy digital_ventas_lectura on digital_ventas for select to authenticated using (true);

create or replace view digital_canal with (security_invoker = true) as
  select distinct on (serie, numero) serie, numero, canal,
         case canal when 'LIMA' then 'Lima' else 'Provincia' end subcanal, distrito, departamento
  from digital_ventas order by serie, numero, total desc nulls last;
grant select on digital_canal to authenticated;

create or replace function contanet_filas(p_canal text) returns setof contanet_venta
language sql stable security invoker set search_path = public as $$
  select v.id, v.fecha, v.fecha_hora, v.comprobante, v.tipo_comprobante, v.serie, v.numero, v.doc_cliente, v.tipo_doc_cliente, v.cliente,
         v.codigo, v.sku, v.producto, v.und, v.precio_unit, v.total, v.cond_pago, v.medio_pago, v.usuario,
         case p_canal when 'digital' then coalesce(d.subcanal, 'Sin clasificar')
                      when 'digital_lima' then coalesce(nullif(d.distrito, ''), 'Sin distrito')
                      when 'digital_provincia' then coalesce(nullif(d.departamento, ''), 'Sin departamento')
                      else v.tienda end,
         v.vendedor, v.archivo, v.carga
  from contanet_venta v
  left join digital_canal d on p_canal like 'digital%' and d.serie = v.serie
                           and d.numero = nullif(regexp_replace(v.numero, '\D', '', 'g'), '')::int
  where en_canal(case when p_canal like 'digital%' then 'digital' else p_canal end, v.usuario, v.medio_pago)
    and (p_canal <> 'digital_lima' or d.canal = 'LIMA')
    and (p_canal <> 'digital_provincia' or d.canal = 'PROVINCIA');
$$;
grant execute on function contanet_filas(text) to authenticated;

-- Historia del canal: ContaNet; antes del primer día de ContaNet, el reporte interno (tiendas) o el Excel virtual (digital).
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
         case p_canal when 'digital' then case d.canal when 'LIMA' then 'Lima' else 'Provincia' end
                      when 'digital_lima' then coalesce(nullif(d.distrito, ''), 'Sin distrito')
                      else coalesce(nullif(d.departamento, ''), 'Sin departamento') end,
         d.sku, d.codigo, d.producto, coalesce(d.und, 0), coalesce(d.total, 0), d.comprobante, d.tipo_comprobante,
         d.medio_pago, coalesce(d.doc_cliente, ''), case length(coalesce(d.doc_cliente, '')) when 11 then 'RUC' when 8 then 'DNI' else '' end,
         d.cliente, 'excel'
  from digital_ventas d
  where p_canal like 'digital%' and d.fecha < (select min(fecha) from contanet_venta)
    and (p_canal = 'digital' or (p_canal = 'digital_lima') = (d.canal = 'LIMA'));
$$;
grant execute on function contanet_historia(text) to authenticated;

-- Las demás funciones de ContaNet leen las filas del canal con contanet_filas() (mismo filtro y la «tienda» del canal).
do $$
declare
  f record; def text; nuevo text;
begin
  for f in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f'
             and p.proname in ('contanet_maestros', 'contanet_clientes_tiendas', 'contanet_compras_cliente', 'contanet_historial_cliente', 'contanet_avance')
  loop
    def := pg_get_functiondef(f.oid);
    nuevo := def;
    if position('en_canal(p_canal, v.usuario, v.medio_pago)' in nuevo) > 0 then
      nuevo := replace(nuevo, 'contanet_venta v', 'contanet_filas(p_canal) v');
      nuevo := replace(nuevo, 'en_canal(p_canal, v.usuario, v.medio_pago)', 'true');
    end if;
    nuevo := regexp_replace(nuevo, 'contanet_venta(,\s*dia)?(\s+)where en_canal\(p_canal, usuario, medio_pago\)',
                            'contanet_filas(p_canal)\1\2where true', 'g');
    nuevo := replace(nuevo, 'contanet_venta where doc_cliente = p_doc and en_canal(p_canal, usuario, medio_pago)',
                     'contanet_filas(p_canal) where doc_cliente = p_doc');
    if f.proname = 'contanet_maestros' then
      nuevo := replace(nuevo, '''desde'', (select min(fecha) from contanet_venta)',
        '''desde'', case when p_canal like ''digital%'' then least((select min(fecha) from contanet_venta), (select min(fecha) from digital_ventas)) else (select min(fecha) from contanet_venta) end');
    end if;
    if position('en_canal(' in nuevo) > 0 then raise exception 'Quedó un en_canal sin cambiar en %', f.proname; end if;
    if nuevo <> def then execute nuevo; end if;
  end loop;
end $$;

-- Resumen ejecutivo: Lima y Provincia como fuentes nuevas («cliente» = cliente, como el canal digital).
do $$
declare def text; nuevo text;
begin
  select pg_get_functiondef('ejecutivo(text, date, date, jsonb)'::regprocedure) into def;
  if position('digital_lima' in def) = 0 then
    nuevo := replace(def,
      $x$when p_fuente = 'digital' then format(contanet, 'case when v.doc_cliente = '''' then ''PÚBLICO GENERAL'' else v.cliente end', 'digital')$x$,
      $x$when p_fuente = 'digital' then format(contanet, 'case when v.doc_cliente = '''' then ''PÚBLICO GENERAL'' else v.cliente end', 'digital')
    when p_fuente in ('digital_lima', 'digital_provincia') then format(contanet, 'case when v.doc_cliente = '''' then ''PÚBLICO GENERAL'' else v.cliente end', p_fuente)$x$);
    if nuevo = def then raise exception 'No encontré la fuente digital en ejecutivo()'; end if;
    execute nuevo;
  end if;
end $$;
