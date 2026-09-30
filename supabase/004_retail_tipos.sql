-- Retail por tipos. «Supermercados · SPSA» es el sell-out automático del portal (001_retail.sql). Los demás tipos
-- Nota: confirmar_carga() se reemplaza en 005_contanet_respaldo.sql (agrega el respaldo para deshacer); correr 005 después de este.
-- (conveniencia, etc.) salen del Excel de ventas retail de Calderón (una fila por despacho) que se sube en
-- Configuración → Cargar datos. Cada cliente se asigna a un tipo de retail en la vista previa.
-- Es repetible: no borra tablas ni datos.

create table if not exists retail_tipos (
  tipo   text primary key,
  slug   text unique not null,       -- para la dirección web: /retail/tipo/<slug>
  creado timestamptz not null default now()
);

create table if not exists retail_clientes (
  cliente text primary key,          -- razón social tal como viene en el Excel
  ruc     text,
  tipo    text not null references retail_tipos (tipo) on update cascade
);

-- Ventas retail del Excel: una fila por línea (despacho de un SKU a un cliente).
create table if not exists retail_ventas (
  id                bigserial primary key,
  fecha             date not null,          -- DÍA DE DESPACHO
  emisor            text,
  ruc               text,
  cliente           text not null,
  cantidad          numeric(14,3),
  precio_unitario   numeric(14,4),
  tipo_venta        text,
  codigo            text,                   -- SKU tal como viene en el Excel
  sku               text,                   -- SKU oficial (vacío si no tiene equivalencia)
  producto          text,
  monto             numeric(14,4),          -- MONTO CANCELADO
  condicion_pago    text,
  direccion         text,
  detalle_despacho  text,
  status            text,
  archivo           text,
  carga             uuid
);
create index if not exists retail_ventas_fecha on retail_ventas (fecha);
create index if not exists retail_ventas_cliente_fecha on retail_ventas (cliente, fecha);
create index if not exists retail_ventas_carga on retail_ventas (carga);

alter table retail_tipos    enable row level security;
alter table retail_clientes enable row level security;
alter table retail_ventas   enable row level security;
do $$
declare t text;
begin
  foreach t in array array['retail_tipos','retail_clientes','retail_ventas'] loop
    execute format('drop policy if exists "leer con sesion" on %I', t);
    execute format('create policy "leer con sesion" on %I for select to authenticated using (true)', t);
  end loop;
end $$;

-- Las cargas web aceptan el tipo 'retail' y llevan la asignación de clientes a tipos.
alter table cargas_web drop constraint if exists cargas_web_tipo_check;
alter table cargas_web add constraint cargas_web_tipo_check check (tipo in ('contanet', 'tiendas', 'retail'));
alter table cargas_web add column if not exists clientes jsonb;  -- [{cliente, ruc, tipo}]

-- Dirección web de un tipo: minúsculas, sin tildes ni espacios.
create or replace function slug_de(t text) returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(translate(t, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), '[^a-z0-9]+', '-', 'g'));
$$;

-- Cambiar el tipo de un cliente (Configuración → Clientes retail). Crea el tipo si no existe.
create or replace function retail_asignar_tipo(p_cliente text, p_tipo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Hay que iniciar sesión.'; end if;
  if coalesce(trim(p_tipo), '') = '' then raise exception 'Falta el tipo de retail.'; end if;
  insert into retail_tipos (tipo, slug) values (trim(p_tipo), slug_de(p_tipo)) on conflict (tipo) do nothing;
  update retail_clientes set tipo = trim(p_tipo) where cliente = p_cliente;
  delete from retail_tipos t where not exists (select 1 from retail_clientes c where c.tipo = t.tipo);  -- tipos que quedaron vacíos
end;
$$;
revoke all on function retail_asignar_tipo(text, text) from public, anon;
grant execute on function retail_asignar_tipo(text, text) to authenticated;

-- Resumen por mes de cada tipo (para la web).
create or replace function retail_panel(desde date, hasta date, p_tipo text default null, p_clientes text[] default null,
                                        p_skus text[] default null, p_status text[] default null) returns jsonb
language sql stable security invoker set search_path = public as $$
  with v as (
    select v.*, c.tipo, coalesce(m.producto, v.producto, v.codigo) nombre
    from retail_ventas v join retail_clientes c on c.cliente = v.cliente left join sku_maestro m on m.sku = v.sku
    where v.fecha between desde and hasta and (p_tipo is null or c.tipo = p_tipo)
      and (p_clientes is null or v.cliente = any(p_clientes)) and (p_skus is null or v.sku = any(p_skus))
      and (p_status is null or v.status = any(p_status))
  )
  select jsonb_build_object(
    'dias', (select coalesce(jsonb_agg(x order by fecha), '[]') from
             (select fecha, sum(cantidad) und, sum(monto) venta, count(*) lineas from v group by fecha) x),
    'clientes', (select coalesce(jsonb_agg(x), '[]') from
                 (select cliente, tipo, sum(cantidad) und, sum(monto) venta, count(distinct fecha) despachos from v group by cliente, tipo) x),
    'productos', (select coalesce(jsonb_agg(x), '[]') from
                  (select coalesce(sku, codigo) sku, min(nombre) producto, sum(cantidad) und, sum(monto) venta from v group by 1) x),
    'status', (select coalesce(jsonb_agg(x), '[]') from
               (select coalesce(status, 'Sin estado') status, sum(cantidad) und, sum(monto) venta, count(*) lineas from v group by 1) x),
    'lineas', (select coalesce(jsonb_agg(x order by fecha desc, cliente), '[]') from
               (select fecha, cliente, tipo, coalesce(sku, codigo) sku, nombre producto, cantidad und, precio_unitario, monto venta,
                       condicion_pago, status, detalle_despacho from v) x)
  );
$$;
grant execute on function retail_panel(date, date, text, text[], text[], text[]) to authenticated;

-- Lo que hay hoy en la base para los rangos del archivo (vista previa).
create or replace function cargas_existente(p_tipo text, p_rangos jsonb) returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]') from (
    select v.tienda, count(*) filas, coalesce(sum(v.und), 0) und, coalesce(sum(v.venta), 0) venta
    from tiendas_venta v join jsonb_to_recordset(p_rangos) r(tienda text, desde date, hasta date)
      on v.tienda = r.tienda and v.fecha between r.desde and r.hasta
    where p_tipo = 'tiendas' group by v.tienda
    union all
    select v.tienda, count(*), coalesce(sum(v.und), 0), coalesce(sum(v.total), 0)
    from contanet_venta v join jsonb_to_recordset(p_rangos) r(tienda text, desde date, hasta date)
      on (r.tienda is null or v.tienda = r.tienda) and v.fecha between r.desde and r.hasta
    where p_tipo = 'contanet' group by v.tienda
    union all
    select v.cliente, count(*), coalesce(sum(v.cantidad), 0), coalesce(sum(v.monto), 0)
    from retail_ventas v join jsonb_to_recordset(p_rangos) r(tienda text, desde date, hasta date)
      on v.cliente = r.tienda and v.fecha between r.desde and r.hasta
    where p_tipo = 'retail' group by v.cliente
  ) x;
$$;

-- Reemplaza el rango con las filas subidas y verifica (ver 003_cargas.sql). En retail, rangos.tienda = cliente.
create or replace function confirmar_carga(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '120s' as $$
declare
  c cargas_web;
  n integer; su numeric; sv numeric; rf integer; rv numeric;
begin
  if auth.uid() is null then raise exception 'Hay que iniciar sesión.'; end if;
  select * into c from cargas_web where id = p_id and usuario = auth.uid() for update;
  if not found then raise exception 'La carga no existe.'; end if;
  if c.estado <> 'preparada' then raise exception 'Esta carga ya se hizo.'; end if;

  if c.tipo = 'contanet' then
    select count(*), coalesce(sum(total), 0) into rf, rv from contanet_venta where fecha between c.desde and c.hasta;
    delete from contanet_venta where fecha between c.desde and c.hasta;
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
    select count(*), coalesce(sum(und), 0), coalesce(sum(total), 0) into n, su, sv from contanet_venta where carga = p_id;
  elsif c.tipo = 'tiendas' then
    select count(*), coalesce(sum(v.venta), 0) into rf, rv
    from tiendas_venta v join jsonb_to_recordset(c.rangos) r(tienda text, desde date, hasta date)
      on v.tienda = r.tienda and v.fecha between r.desde and r.hasta;
    delete from tiendas_venta v using jsonb_to_recordset(c.rangos) r(tienda text, desde date, hasta date)
    where v.tienda = r.tienda and v.fecha between r.desde and r.hasta;
    insert into tiendas_venta (fecha, tienda, canal, codigo, codigo_corto, sku, origen_sku, tipo_precio, categoria_cliente,
                               und, venta, archivo, carga)
    select r.fecha, r.tienda, r.canal, r.codigo, r.codigo_corto, r.sku, r.origen_sku, coalesce(r.tipo_precio, ''), r.categoria_cliente,
           r.und, r.venta, c.archivo, c.id
    from cargas_web_filas f cross join lateral jsonb_to_recordset(f.filas) r(
      fecha date, tienda text, canal text, codigo text, codigo_corto text, sku text, origen_sku text, tipo_precio text,
      categoria_cliente text, und numeric, venta numeric)
    where f.carga = p_id;
    select count(*), coalesce(sum(und), 0), coalesce(sum(venta), 0) into n, su, sv from tiendas_venta where carga = p_id;
  else
    -- Retail: primero los tipos y clientes elegidos en la vista previa.
    insert into retail_tipos (tipo, slug)
    select distinct trim(x.tipo), slug_de(x.tipo) from jsonb_to_recordset(c.clientes) x(cliente text, ruc text, tipo text)
    where coalesce(trim(x.tipo), '') <> '' on conflict (tipo) do nothing;
    insert into retail_clientes (cliente, ruc, tipo)
    select x.cliente, nullif(x.ruc, ''), trim(x.tipo) from jsonb_to_recordset(c.clientes) x(cliente text, ruc text, tipo text)
    on conflict (cliente) do update set tipo = excluded.tipo, ruc = coalesce(excluded.ruc, retail_clientes.ruc);
    if exists (select 1 from jsonb_to_recordset(c.rangos) r(tienda text) where not exists (select 1 from retail_clientes k where k.cliente = r.tienda)) then
      raise exception 'Hay clientes sin tipo de retail asignado.';
    end if;
    select count(*), coalesce(sum(v.monto), 0) into rf, rv
    from retail_ventas v join jsonb_to_recordset(c.rangos) r(tienda text, desde date, hasta date)
      on v.cliente = r.tienda and v.fecha between r.desde and r.hasta;
    delete from retail_ventas v using jsonb_to_recordset(c.rangos) r(tienda text, desde date, hasta date)
    where v.cliente = r.tienda and v.fecha between r.desde and r.hasta;
    insert into retail_ventas (fecha, emisor, ruc, cliente, cantidad, precio_unitario, tipo_venta, codigo, sku, producto, monto,
                               condicion_pago, direccion, detalle_despacho, status, archivo, carga)
    select r.fecha, r.emisor, r.ruc, r.cliente, r.und, r.precio_unitario, r.tipo_venta, r.codigo, r.sku, r.producto, r.venta,
           r.condicion_pago, r.direccion, r.detalle_despacho, r.status, c.archivo, c.id
    from cargas_web_filas f cross join lateral jsonb_to_recordset(f.filas) r(
      fecha date, emisor text, ruc text, cliente text, und numeric, precio_unitario numeric, tipo_venta text, codigo text, sku text,
      producto text, venta numeric, condicion_pago text, direccion text, detalle_despacho text, status text)
    where f.carga = p_id;
    select count(*), coalesce(sum(cantidad), 0), coalesce(sum(monto), 0) into n, su, sv from retail_ventas where carga = p_id;
  end if;

  if n <> c.filas or abs(su - c.und) > 0.001 or abs(sv - c.venta) > 0.005 then
    raise exception 'No cuadra: se leyeron % filas, % und y S/ % del archivo, pero se guardaron % filas, % und y S/ %. No se cambió nada.',
      c.filas, c.und, c.venta, n, su, sv;
  end if;
  update cargas_web set estado = 'cargada', cargada = now(), reemplazo_filas = rf, reemplazo_venta = rv where id = p_id;
  delete from cargas_web_filas where carga = p_id;
  return jsonb_build_object('filas', n, 'und', su, 'venta', sv, 'reemplazo_filas', rf, 'reemplazo_venta', rv);
end;
$$;
revoke all on function confirmar_carga(uuid) from public, anon;
grant execute on function confirmar_carga(uuid) to authenticated;

-- Resumen retail: venta por día de cada componente. SPSA = sell-out a costo (ingreso Calderón por lo vendido en los
-- supermercados); los demás tipos = monto de los despachos a sus clientes (Excel de ventas retail).
create or replace function retail_resumen(desde date, hasta date) returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(x order by fecha, componente), '[]') from (
    select fecha, 'Supermercados · SPSA' componente, 'spsa' slug, sum(und) und, sum(costo) venta
    from venta_producto_dia where cliente = 'SPSA' and fecha between desde and hasta group by fecha
    union all
    select v.fecha, c.tipo, t.slug, sum(v.cantidad), sum(v.monto)
    from retail_ventas v join retail_clientes c on c.cliente = v.cliente join retail_tipos t on t.tipo = c.tipo
    where v.fecha between desde and hasta group by v.fecha, c.tipo, t.slug
  ) x;
$$;
grant execute on function retail_resumen(date, date) to authenticated;

-- Primer y último día con datos (todo retail, o un tipo).
create or replace function retail_limites(p_tipo text default null) returns jsonb
language sql stable security invoker set search_path = public as $$
  with f as (
    select fecha from venta_producto_dia where p_tipo is null and cliente = 'SPSA' and und > 0
    union all
    select v.fecha from retail_ventas v join retail_clientes c on c.cliente = v.cliente where p_tipo is null or c.tipo = p_tipo
  )
  select jsonb_build_object('desde', min(fecha), 'hasta', max(fecha)) from f;
$$;
grant execute on function retail_limites(text) to authenticated;
