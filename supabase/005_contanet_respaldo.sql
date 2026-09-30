-- Tiendas con ContaNet + seguridad de las cargas.
-- Nota: las funciones contanet_* y tiendas_conciliacion se reemplazan en 006_canales_contanet.sql; correr 006 después.
--  1. Cada carga guarda antes una copia de lo que reemplaza (cargas_respaldo) y se puede deshacer (deshacer_carga).
--  2. Consultas de la web para Tiendas · ContaNet y para el Resumen de tiendas (Reporte interno vs ContaNet).
-- Reemplaza confirmar_carga() de 003/004. Es repetible: no borra tablas ni datos.

alter table cargas_web drop constraint if exists cargas_web_estado_check;
alter table cargas_web add constraint cargas_web_estado_check check (estado in ('preparada', 'cargada', 'deshecha'));
alter table cargas_web add column if not exists deshecha timestamptz;

-- Copia de las filas que reemplazó cada carga (se guardan las de las 3 últimas cargas de cada tipo).
create table if not exists cargas_respaldo (
  carga uuid not null references cargas_web (id) on delete cascade,
  fila  jsonb not null
);
create index if not exists cargas_respaldo_carga on cargas_respaldo (carga);
alter table cargas_respaldo enable row level security;  -- sin políticas: solo las funciones de la base la usan

create or replace function tabla_de_carga(p_tipo text) returns text language sql immutable as $$
  select case p_tipo when 'contanet' then 'contanet_venta' when 'tiendas' then 'tiendas_venta' when 'retail' then 'retail_ventas' end;
$$;

/** Condición de las filas que reemplaza una carga (sobre el alias v), según su tipo y rangos. */
create or replace function filtro_de_carga(p_tipo text) returns text language sql immutable as $$
  select case p_tipo
    when 'contanet' then 'v.fecha between $1 and $2'
    when 'tiendas'  then 'exists (select 1 from jsonb_to_recordset($3) r(tienda text, desde date, hasta date) where v.tienda = r.tienda and v.fecha between r.desde and r.hasta)'
    when 'retail'   then 'exists (select 1 from jsonb_to_recordset($3) r(tienda text, desde date, hasta date) where v.cliente = r.tienda and v.fecha between r.desde and r.hasta)'
  end;
$$;

create or replace function columnas_de(p_tabla text) returns text language sql stable as $$
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
  from information_schema.columns where table_schema = 'public' and table_name = p_tabla and column_name <> 'id';
$$;

create or replace function confirmar_carga(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '120s' as $$
declare
  c cargas_web;
  tabla text; filtro text; col_venta text; col_und text;
  n integer; su numeric; sv numeric; rf integer; rv numeric;
begin
  if auth.uid() is null then raise exception 'Hay que iniciar sesión.'; end if;
  select * into c from cargas_web where id = p_id and usuario = auth.uid() for update;
  if not found then raise exception 'La carga no existe.'; end if;
  if c.estado <> 'preparada' then raise exception 'Esta carga ya se hizo.'; end if;
  tabla := tabla_de_carga(c.tipo); filtro := filtro_de_carga(c.tipo);
  col_venta := case c.tipo when 'contanet' then 'total' when 'retail' then 'monto' else 'venta' end;
  col_und := case c.tipo when 'retail' then 'cantidad' else 'und' end;

  if c.tipo = 'retail' then
    insert into retail_tipos (tipo, slug)
    select distinct trim(x.tipo), slug_de(x.tipo) from jsonb_to_recordset(c.clientes) x(cliente text, ruc text, tipo text)
    where coalesce(trim(x.tipo), '') <> '' on conflict (tipo) do nothing;
    insert into retail_clientes (cliente, ruc, tipo)
    select x.cliente, nullif(x.ruc, ''), trim(x.tipo) from jsonb_to_recordset(c.clientes) x(cliente text, ruc text, tipo text)
    on conflict (cliente) do update set tipo = excluded.tipo, ruc = coalesce(excluded.ruc, retail_clientes.ruc);
    if exists (select 1 from jsonb_to_recordset(c.rangos) r(tienda text) where not exists (select 1 from retail_clientes k where k.cliente = r.tienda)) then
      raise exception 'Hay clientes sin tipo de retail asignado.';
    end if;
  end if;

  -- 1. Copia de respaldo de lo que se va a reemplazar, y 2. se borra.
  execute format('insert into cargas_respaldo (carga, fila) select $4, to_jsonb(v) - ''id'' from %I v where %s', tabla, filtro)
    using c.desde, c.hasta, c.rangos, p_id;
  execute format('select count(*), coalesce(sum(%I), 0) from %I v where %s', col_venta, tabla, filtro)
    into rf, rv using c.desde, c.hasta, c.rangos;
  execute format('delete from %I v where %s', tabla, filtro) using c.desde, c.hasta, c.rangos;

  -- 3. Se insertan las filas del archivo.
  if c.tipo = 'contanet' then
    insert into contanet_venta (fecha, fecha_hora, comprobante, tipo_comprobante, serie, numero, doc_cliente, tipo_doc_cliente,
                                cliente, codigo, sku, producto, und, precio_unit, total, cond_pago, medio_pago, usuario, tienda,
                                vendedor, archivo, carga)
    select r.fecha, r.fecha_hora, r.comprobante, r.tipo_comprobante, r.serie, r.numero, r.doc_cliente, r.tipo_doc_cliente,
           r.cliente, r.codigo, r.sku, r.producto, r.und, r.precio_unit, r.total, r.cond_pago, r.medio_pago, r.usuario, r.tienda,
           r.vendedor, c.archivo, c.id
    from cargas_web_filas f cross join lateral jsonb_to_recordset(f.filas) r(
      fecha date, fecha_hora timestamp, comprobante text, tipo_comprobante text, serie text, numero text, doc_cliente text,
      tipo_doc_cliente text, cliente text, codigo text, sku text, producto text, und numeric, precio_unit numeric, total numeric,
      cond_pago text, medio_pago text, usuario text, tienda text, vendedor text)
    where f.carga = p_id;
  elsif c.tipo = 'tiendas' then
    insert into tiendas_venta (fecha, tienda, canal, codigo, codigo_corto, sku, origen_sku, tipo_precio, categoria_cliente,
                               und, venta, archivo, carga)
    select r.fecha, r.tienda, r.canal, r.codigo, r.codigo_corto, r.sku, r.origen_sku, coalesce(r.tipo_precio, ''), r.categoria_cliente,
           r.und, r.venta, c.archivo, c.id
    from cargas_web_filas f cross join lateral jsonb_to_recordset(f.filas) r(
      fecha date, tienda text, canal text, codigo text, codigo_corto text, sku text, origen_sku text, tipo_precio text,
      categoria_cliente text, und numeric, venta numeric)
    where f.carga = p_id;
  else
    insert into retail_ventas (fecha, emisor, ruc, cliente, cantidad, precio_unitario, tipo_venta, codigo, sku, producto, monto,
                               condicion_pago, direccion, detalle_despacho, status, archivo, carga)
    select r.fecha, r.emisor, r.ruc, r.cliente, r.und, r.precio_unitario, r.tipo_venta, r.codigo, r.sku, r.producto, r.venta,
           r.condicion_pago, r.direccion, r.detalle_despacho, r.status, c.archivo, c.id
    from cargas_web_filas f cross join lateral jsonb_to_recordset(f.filas) r(
      fecha date, emisor text, ruc text, cliente text, und numeric, precio_unitario numeric, tipo_venta text, codigo text, sku text,
      producto text, venta numeric, condicion_pago text, direccion text, detalle_despacho text, status text)
    where f.carga = p_id;
  end if;

  -- 4. Verificación: lo guardado debe ser idéntico a lo leído; si no, se deshace todo.
  execute format('select count(*), coalesce(sum(%I), 0), coalesce(sum(%I), 0) from %I where carga = $1', col_und, col_venta, tabla)
    into n, su, sv using p_id;
  if n <> c.filas or abs(su - c.und) > 0.001 or abs(sv - c.venta) > 0.005 then
    raise exception 'No cuadra: se leyeron % filas, % und y S/ % del archivo, pero se guardaron % filas, % und y S/ %. No se cambió nada.',
      c.filas, c.und, c.venta, n, su, sv;
  end if;
  update cargas_web set estado = 'cargada', cargada = now(), reemplazo_filas = rf, reemplazo_venta = rv where id = p_id;
  delete from cargas_web_filas where carga = p_id;
  -- Solo se guardan los respaldos de las 3 últimas cargas de cada tipo.
  delete from cargas_respaldo where carga in (
    select id from cargas_web where tipo = c.tipo and estado = 'cargada' order by cargada desc offset 3);
  return jsonb_build_object('filas', n, 'und', su, 'venta', sv, 'reemplazo_filas', rf, 'reemplazo_venta', rv);
end;
$$;
revoke all on function confirmar_carga(uuid) from public, anon;
grant execute on function confirmar_carga(uuid) to authenticated;

-- Deshace una carga: quita sus filas y devuelve las que había antes. Solo la última carga de cada tipo.
create or replace function deshacer_carga(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '120s' as $$
declare
  c cargas_web; tabla text; cols text; quitadas integer; devueltas integer; respaldadas integer;
begin
  if auth.uid() is null then raise exception 'Hay que iniciar sesión.'; end if;
  select * into c from cargas_web where id = p_id for update;
  if not found or c.estado <> 'cargada' then raise exception 'Esa carga no está vigente.'; end if;
  if exists (select 1 from cargas_web w where w.tipo = c.tipo and w.estado = 'cargada' and w.cargada > c.cargada) then
    raise exception 'Solo se puede deshacer la última carga de este tipo. Deshaz primero las más recientes.';
  end if;
  select count(*) into respaldadas from cargas_respaldo where carga = p_id;
  if respaldadas <> coalesce(c.reemplazo_filas, 0) then raise exception 'Ya no está el respaldo de esta carga; no se puede deshacer.'; end if;

  tabla := tabla_de_carga(c.tipo); cols := columnas_de(tabla);
  execute format('delete from %I where carga = $1', tabla) using p_id;
  get diagnostics quitadas = row_count;
  execute format('insert into %I (%s) select %s from cargas_respaldo x, jsonb_populate_record(null::%I, x.fila) r where x.carga = $1',
                 tabla, cols, 'r.' || replace(cols, ', ', ', r.'), tabla) using p_id;
  get diagnostics devueltas = row_count;
  if quitadas <> c.filas or devueltas <> respaldadas then
    raise exception 'No cuadra al deshacer (quitadas %, esperadas %; devueltas %, respaldo %). No se cambió nada.', quitadas, c.filas, devueltas, respaldadas;
  end if;
  update cargas_web set estado = 'deshecha', deshecha = now() where id = p_id;
  delete from cargas_respaldo where carga = p_id;
  return jsonb_build_object('quitadas', quitadas, 'devueltas', devueltas);
end;
$$;
revoke all on function deshacer_carga(uuid) from public, anon;
grant execute on function deshacer_carga(uuid) to authenticated;

-- ---------------------------------------------------------------- Tiendas · ContaNet
-- Solo tiendas: «Ventas oficina» (usuario VENTAS01) no es una tienda y queda fuera de estas vistas.
create or replace function contanet_maestros() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'desde', (select min(fecha) from contanet_venta where tienda <> 'Ventas oficina'),
    'hasta', (select max(fecha) from contanet_venta where tienda <> 'Ventas oficina'),
    'tiendas', (select coalesce(jsonb_agg(t order by t), '[]') from (select distinct tienda t from contanet_venta where tienda <> 'Ventas oficina') x),
    'medios', (select coalesce(jsonb_agg(t order by t), '[]') from (select distinct medio_pago t from contanet_venta where medio_pago <> '') x),
    'productos', (select coalesce(jsonb_agg(jsonb_build_object('sku', sku, 'producto', producto) order by producto), '[]')
                  from (select distinct coalesce(v.sku, v.codigo) sku, coalesce(m.producto, v.producto) producto
                        from contanet_venta v left join sku_maestro m on m.sku = v.sku where v.tienda <> 'Ventas oficina') x)
  );
$$;

create or replace function contanet_panel(desde date, hasta date, p_tiendas text[] default null, p_skus text[] default null,
                                          p_medios text[] default null, p_dias int[] default null) returns jsonb
language sql stable security invoker set search_path = public as $$
  with v as (
    select v.fecha, v.fecha_hora, v.tienda, coalesce(v.sku, v.codigo) sku, coalesce(m.producto, v.producto) producto, v.und, v.total venta,
           v.comprobante, v.tipo_comprobante, v.medio_pago, v.doc_cliente, v.tipo_doc_cliente, v.cliente,
           case when v.tipo_comprobante <> 'Nota de crédito' then v.comprobante end ticket
    from contanet_venta v left join sku_maestro m on m.sku = v.sku
    where v.fecha between desde and hasta and v.tienda <> 'Ventas oficina'
      and (p_tiendas is null or v.tienda = any(p_tiendas)) and (p_skus is null or coalesce(v.sku, v.codigo) = any(p_skus))
      and (p_medios is null or v.medio_pago = any(p_medios))
      and (p_dias is null or (extract(isodow from v.fecha)::int - 1) = any(p_dias))
  )
  select jsonb_build_object(
    'dias', (select coalesce(jsonb_agg(x order by fecha), '[]') from
             (select fecha, sum(und) und, sum(venta) venta, count(distinct ticket) tickets from v group by fecha) x),
    'tiendas', (select coalesce(jsonb_agg(x), '[]') from
                (select tienda, sum(und) und, sum(venta) venta, count(distinct ticket) tickets, count(distinct fecha) dias from v group by tienda) x),
    'productos', (select coalesce(jsonb_agg(x), '[]') from
                  (select sku, min(producto) producto, sum(und) und, sum(venta) venta, count(distinct ticket) tickets from v group by sku) x),
    'horas', (select coalesce(jsonb_agg(x order by hora), '[]') from
              (select extract(hour from fecha_hora)::int hora, sum(und) und, sum(venta) venta, count(distinct ticket) tickets from v group by 1) x),
    'medios', (select coalesce(jsonb_agg(x), '[]') from
               (select coalesce(nullif(medio_pago, ''), 'Sin dato') medio, sum(und) und, sum(venta) venta, count(distinct ticket) tickets from v group by 1) x),
    'comprobantes', (select coalesce(jsonb_agg(x), '[]') from
                     (select tipo_comprobante tipo, sum(und) und, sum(venta) venta, count(distinct comprobante) documentos from v group by 1) x),
    'clientes', (select coalesce(jsonb_agg(x), '[]') from
                 (select doc_cliente doc, tipo_doc_cliente tipo_doc, min(cliente) cliente, sum(und) und, sum(venta) venta,
                         count(distinct ticket) tickets, max(fecha) ultima
                  from v where doc_cliente <> '' group by doc_cliente, tipo_doc_cliente order by sum(venta) desc limit 200) x)
  );
$$;

-- Resumen de tiendas: Reporte interno (Excel de los jefes) vs ContaNet, por día y tienda.
create or replace function tiendas_conciliacion(desde date, hasta date) returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(x order by fecha, tienda), '[]') from (
    select coalesce(i.fecha, c.fecha) fecha, coalesce(i.tienda, c.tienda) tienda,
           coalesce(i.und, 0) und_interno, coalesce(i.venta, 0) venta_interno, coalesce(c.und, 0) und_contanet, coalesce(c.venta, 0) venta_contanet
    from (select fecha, tienda, sum(und) und, sum(venta) venta from tiendas_venta where fecha between desde and hasta group by 1, 2) i
    full join (select fecha, tienda, sum(und) und, sum(total) venta from contanet_venta
               where fecha between desde and hasta and tienda <> 'Ventas oficina' group by 1, 2) c
      on c.fecha = i.fecha and c.tienda = i.tienda
  ) x;
$$;

create or replace function tiendas_cobertura() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'interno_desde', (select min(fecha) from tiendas_venta), 'interno_hasta', (select max(fecha) from tiendas_venta),
    'contanet_desde', (select min(fecha) from contanet_venta where tienda <> 'Ventas oficina'),
    'contanet_hasta', (select max(fecha) from contanet_venta where tienda <> 'Ventas oficina'));
$$;

grant execute on function contanet_maestros() to authenticated;
grant execute on function contanet_panel(date, date, text[], text[], text[], int[]) to authenticated;
grant execute on function tiendas_conciliacion(date, date) to authenticated;
grant execute on function tiendas_cobertura() to authenticated;
